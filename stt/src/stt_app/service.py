import io
from pathlib import Path
import subprocess
import threading
import time
from uuid import uuid4
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import sounddevice as sd
from pynput import keyboard

from .config import CHANNELS, DTYPE, SAMPLE_RATE
from .llm_engine import LLMEngine
from .schemas import RecordingStatusResponse, TranscriptionResult
from .tts_engine import TTSEngine
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
    def __init__(
        self,
        model_id,
        language,
        llm_engine: Optional[LLMEngine] = None,
        tts_engine: Optional[TTSEngine] = None,
        tts_output_dir: Optional[str] = None,
        max_items: int = 100,
    ):
        self.engine = WhisperEngine(model_id=model_id, language=language)
        self.llm_engine = llm_engine
        self.tts_engine = tts_engine
        self.tts_output_dir = Path(tts_output_dir).expanduser() if tts_output_dir else None
        self.recorder = ToggleRecorder()
        self.max_items = max_items

        self._items = []
        self._items_lock = threading.Lock()
        self._tts_audio_lock = threading.Lock()
        self._latest_tts_audio = None
        self._latest_tts_audio_created_at = None
        self._busy = threading.Event()
        self._last_error = None
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
            llm_response = None
            llm_elapsed = None
            tts_elapsed = None
            tts_error = None
            tts_audio_wav = None
            tts_wav_path = None
            tts_mp3_path = None

            if self.llm_engine is not None:
                llm_started = time.perf_counter()
                try:
                    llm_response = self.llm_engine.generate(final_text)
                except Exception as exc:
                    llm_response = f"LLM request failed: {exc}"
                llm_elapsed = time.perf_counter() - llm_started

            if (
                self.tts_engine is not None
                and llm_response
                and not llm_response.startswith("LLM request failed:")
            ):
                tts_started = time.perf_counter()
                try:
                    tts_audio_wav = self.tts_engine.synthesize(llm_response)
                except Exception as exc:
                    tts_error = f"TTS request failed: {exc}"
                tts_elapsed = time.perf_counter() - tts_started

            if tts_audio_wav is not None:
                tts_wav_path, tts_mp3_path, save_error = self._save_tts_outputs(tts_audio_wav)
                if save_error:
                    tts_error = f"{tts_error}; {save_error}" if tts_error else save_error

            self._publish(
                text=final_text,
                elapsed_seconds=elapsed,
                llm_response=llm_response,
                llm_elapsed_seconds=llm_elapsed,
                tts_elapsed_seconds=tts_elapsed,
                tts_error=tts_error,
                tts_audio_wav=tts_audio_wav,
                tts_wav_path=tts_wav_path,
                tts_mp3_path=tts_mp3_path,
            )
            self._last_error = None
            self._last_event = "published"
            print(f"[{elapsed:.2f}s] {final_text}")
            if llm_response:
                print(f"[LLM] {llm_response}")
            if tts_audio_wav is not None:
                print("[TTS] Synthesized latest LLM response to audio.")
            elif tts_error:
                print(f"[TTS] {tts_error}")
        except Exception as exc:
            self._last_error = str(exc)
            self._last_event = "error"
            print(f"Transcription failed: {exc}")
        finally:
            self._busy.clear()

    def _publish(
        self,
        text,
        elapsed_seconds,
        llm_response: Optional[str] = None,
        llm_elapsed_seconds: Optional[float] = None,
        tts_elapsed_seconds: Optional[float] = None,
        tts_error: Optional[str] = None,
        tts_audio_wav: Optional[bytes] = None,
        tts_wav_path: Optional[str] = None,
        tts_mp3_path: Optional[str] = None,
    ):
        result = TranscriptionResult(
            text=text,
            elapsed_seconds=elapsed_seconds,
            llm_response=llm_response,
            llm_elapsed_seconds=llm_elapsed_seconds,
            tts_generated=tts_audio_wav is not None,
            tts_elapsed_seconds=tts_elapsed_seconds,
            tts_error=tts_error,
            tts_wav_path=tts_wav_path,
            tts_mp3_path=tts_mp3_path,
            created_at=datetime.now(timezone.utc),
        )

        with self._items_lock:
            self._items.append(result)
            if len(self._items) > self.max_items:
                self._items = self._items[-self.max_items :]

        with self._tts_audio_lock:
            self._latest_tts_audio = tts_audio_wav
            self._latest_tts_audio_created_at = result.created_at if tts_audio_wav is not None else None

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

    def latest_response_audio(self):
        latest = self.latest()
        if latest is None:
            return None

        with self._tts_audio_lock:
            if self._latest_tts_audio is None:
                pass
            elif self._latest_tts_audio_created_at == latest.created_at:
                return self._latest_tts_audio

        wav_path = latest.tts_wav_path
        if not wav_path:
            return None

        path = Path(wav_path)
        if not path.is_file():
            return None
        return path.read_bytes()

    def latest_response_audio_mp3(self):
        latest = self.latest()
        if latest is None:
            return None

        mp3_path = latest.tts_mp3_path
        if not mp3_path:
            return None

        path = Path(mp3_path)
        if not path.is_file():
            return None
        return path.read_bytes()

    def _save_tts_outputs(self, wav_bytes: bytes) -> tuple[Optional[str], Optional[str], Optional[str]]:
        if self.tts_output_dir is None:
            return None, None, "TTS output directory is not configured."

        try:
            self.tts_output_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            return None, None, f"TTS output directory creation failed: {exc}"

        stem = f"tts_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}_{uuid4().hex[:8]}"
        wav_path = self.tts_output_dir / f"{stem}.wav"
        mp3_path = self.tts_output_dir / f"{stem}.mp3"

        try:
            wav_path.write_bytes(wav_bytes)
        except Exception as exc:
            return None, None, f"TTS WAV save failed: {exc}"

        try:
            self._convert_wav_to_mp3(wav_bytes=wav_bytes, mp3_path=mp3_path)
        except Exception as exc:
            return str(wav_path.resolve()), None, f"TTS MP3 save failed: {exc}"

        return str(wav_path.resolve()), str(mp3_path.resolve()), None

    def _convert_wav_to_mp3(self, wav_bytes: bytes, mp3_path: Path):
        conversion_error = None
        try:
            import soundfile as sf

            audio, sample_rate = sf.read(io.BytesIO(wav_bytes), dtype="float32")
            sf.write(str(mp3_path), audio, sample_rate, format="MP3")
            return
        except Exception as exc:
            conversion_error = exc

        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            str(mp3_path),
        ]
        try:
            process = subprocess.run(
                cmd,
                input=wav_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        except Exception as exc:
            raise RuntimeError(
                f"MP3 conversion failed (soundfile: {conversion_error}, ffmpeg: {exc})"
            ) from exc

        if process.returncode != 0:
            stderr = process.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"MP3 conversion failed (soundfile: {conversion_error}, ffmpeg: {stderr or process.returncode})"
            )

    def status(self):
        latest = self.latest()
        return RecordingStatusResponse(
            recording=self.recorder.recording,
            transcribing=self._busy.is_set(),
            last_event=self._last_event,
            last_error=self._last_error,
            latest_text=latest.text if latest else None,
        )
