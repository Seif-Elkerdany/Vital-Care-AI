import threading
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import sounddevice as sd
from pynput import keyboard

from .config import CHANNELS, DTYPE, SAMPLE_RATE
from .schemas import RecordingStatusResponse, TranscriptionResult
from .whisper_engine import WhisperEngine


class ToggleRecorder:
    def __init__(self):
        self.recording = False
        self.stream = None
        self.audio_chunks = []
        self.lock = threading.Lock()

    def _audio_callback(self, indata, frames, time_info, status):
        del frames, time_info
        if status:
            print(f"Audio status: {status}")

        with self.lock:
            if self.recording:
                self.audio_chunks.append(indata.copy())

    def start(self):
        if self.recording:
            return

        with self.lock:
            self.audio_chunks.clear()

        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            callback=self._audio_callback,
        )
        self.stream.start()
        self.recording = True

    def stop(self):
        if not self.recording:
            return None

        self.recording = False
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        with self.lock:
            if not self.audio_chunks:
                return None
            audio = np.concatenate(self.audio_chunks, axis=0).reshape(-1)
            self.audio_chunks.clear()

        return audio


class SpeechToTextService:
    def __init__(self, model_id, language, max_items: int = 100):
        self.engine = WhisperEngine(model_id=model_id, language=language)
        self.recorder = ToggleRecorder()
        self.max_items = max_items

        self._items = []
        self._items_lock = threading.Lock()
        self._busy = threading.Event()
        self._last_error= None
        self._last_event = "idle"

        self._listener = None
        self._listener_lock = threading.Lock()

    def start_hotkey_listener(self):
        try:
            with self._listener_lock:
                if self._listener is not None:
                    return
                self._listener = keyboard.Listener(on_press=self._on_key_press)
                self._listener.start()
            print("Hotkey ready. Press M to start/stop recording.")
        except Exception as exc:
            self._last_error = f"Hotkey listener failed: {exc}"
            self._last_event = "error"
            print(self._last_error)

    def stop_hotkey_listener(self):
        with self._listener_lock:
            listener = self._listener
            self._listener = None

        if listener is not None:
            listener.stop()

        if self.recorder.recording:
            self.recorder.stop()

    def _on_key_press(self, key):
        char = getattr(key, "char", None)
        if not char or char.lower() != "m":
            return None

        state = self.toggle_recording()
        if state == "recording_started":
            print("Recording... press M again to stop.")
        elif state == "transcribing":
            print("Recording stopped. Transcribing...")
        elif state == "busy":
            print("Transcription is still running. Please wait.")
        elif state == "no_audio":
            print("No audio captured.")
        elif state == "error":
            print(f"Recording failed: {self._last_error}")

        return None

    def toggle_recording(self):
        try:
            if not self.recorder.recording:
                if self._busy.is_set():
                    self._last_event = "busy"
                    return "busy"
                self.recorder.start()
                self._last_event = "recording"
                return "recording_started"

            audio = self.recorder.stop()
            if audio is None or audio.size == 0:
                self._last_event = "no_audio"
                return "no_audio"

            self._last_event = "transcribing"
            threading.Thread(target=self._transcribe_worker, args=(audio,), daemon=True).start()
            return "transcribing"
        except Exception as exc:
            self._last_error = str(exc)
            self._last_event = "error"
            return "error"

    def _transcribe_worker(self, audio):
        if self._busy.is_set():
            return

        self._busy.set()
        started = time.perf_counter()
        try:
            text = self.engine.transcribe(audio)
            elapsed = time.perf_counter() - started
            final_text = text if text else "(no speech recognized)"
            self._publish(final_text, elapsed)
            self._last_error = None
            self._last_event = "published"
            print(f"[{elapsed:.2f}s] {final_text}")
        except Exception as exc:
            self._last_error = str(exc)
            self._last_event = "error"
            print(f"Transcription failed: {exc}")
        finally:
            self._busy.clear()

    def _publish(self, text, elapsed_seconds):
        result = TranscriptionResult(
            text=text,
            elapsed_seconds=elapsed_seconds,
            created_at=datetime.now(timezone.utc),
        )

        with self._items_lock:
            self._items.append(result)
            if len(self._items) > self.max_items:
                self._items = self._items[-self.max_items :]

        return result

    def latest(self):
        with self._items_lock:
            if not self._items:
                return None
            return self._items[-1]

    def list_items(self, limit = 20):
        if limit < 1:
            return []
        with self._items_lock:
            return list(self._items[-limit:])

    def status(self):
        latest = self.latest()
        return RecordingStatusResponse(
            recording=self.recorder.recording,
            transcribing=self._busy.is_set(),
            last_event=self._last_event,
            last_error=self._last_error,
            latest_text=latest.text if latest else None,
        )
