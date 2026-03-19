import io
import subprocess
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

import numpy as np

from .config import CHANNELS, DTYPE, SAMPLE_RATE
from .schemas import RecordingStatusResponse, TranscriptionResult
from .whisper_engine import WhisperEngine

if TYPE_CHECKING:
    from llm.llm_engine import LLMEngine
    from tts.tts_engine import TTSEngine


class AudioRecorder:
    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        channels: int = CHANNELS,
        dtype: str = DTYPE,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.dtype = dtype
        self.recording = False
        self.stream = None
        self.audio_chunks: list[np.ndarray] = []
        self._lock = threading.Lock()

    def _load_sounddevice(self):
        try:
            import sounddevice as sd
        except Exception as exc:
            raise RuntimeError(
                "Audio recording requires the `sounddevice` package. Install STT dependencies first."
            ) from exc
        return sd

    def _audio_callback(self, indata, frames, time_info, status):
        del frames, time_info
        if status:
            print(f"Audio status: {status}")

        with self._lock:
            if not self.recording:
                return
            self.audio_chunks.append(indata.copy())

    def start(self):
        with self._lock:
            if self.recording:
                return
            self.audio_chunks.clear()

        sounddevice = self._load_sounddevice()
        stream = sounddevice.InputStream(
            samplerate=self.sample_rate,
            channels=self.channels,
            dtype=self.dtype,
            callback=self._audio_callback,
        )

        with self._lock:
            self.stream = stream
            self.recording = True

        try:
            stream.start()
        except Exception as exc:
            with self._lock:
                self.stream = None
                self.recording = False
            stream.close()
            raise RuntimeError(f"Microphone stream failed to start: {exc}") from exc

    def stop(self):
        with self._lock:
            if not self.recording:
                return None
            self.recording = False
            stream = self.stream
            self.stream = None

        if stream is not None:
            try:
                stream.stop()
            finally:
                stream.close()

        with self._lock:
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
        llm_engine: Optional["LLMEngine"] = None,
        tts_engine: Optional["TTSEngine"] = None,
        tts_output_dir: Optional[str] = None,
        max_items: int = 100,
        engine: Optional[WhisperEngine] = None,
        recorder: Optional[AudioRecorder] = None,
        hotkey: str = "m",
    ):
        self.engine = engine or WhisperEngine(model_id=model_id, language=language)
        self.llm_engine = llm_engine
        self.tts_engine = tts_engine
        self.tts_output_dir = Path(tts_output_dir).expanduser() if tts_output_dir else None
        self.recorder = recorder or AudioRecorder()
        self.max_items = max(1, max_items)
        self.hotkey = hotkey.lower()

        self._items: deque[TranscriptionResult] = deque(maxlen=self.max_items)
        self._items_lock = threading.Lock()
        self._tts_audio_lock = threading.Lock()
        self._latest_tts_audio = None
        self._latest_tts_audio_created_at = None
        self._busy = threading.Event()
        self._last_error = None
        self._last_event = "idle"

        self._listener = None
        self._listener_lock = threading.Lock()

    def _load_keyboard_listener(self):
        try:
            from pynput import keyboard
        except Exception as exc:
            raise RuntimeError(
                "Hotkey support requires the `pynput` package. Install STT dependencies first."
            ) from exc
        return keyboard.Listener

    def start_hotkey_listener(self):
        try:
            with self._listener_lock:
                if self._listener is not None:
                    return
                listener_class = self._load_keyboard_listener()
                self._listener = listener_class(on_press=self._on_key_press)
                self._listener.start()
            print(f"Hotkey ready. Press {self.hotkey.upper()} to start/stop recording.")
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
        if not char or char.lower() != self.hotkey:
            return None

        state = self.toggle_recording()
        if state == "recording_started":
            print(f"Recording... press {self.hotkey.upper()} again to stop.")
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
                self._last_error = None
                self._last_event = "recording"
                return "recording_started"

            audio = self.recorder.stop()
            if audio is None or audio.size == 0:
                self._last_event = "no_audio"
                return "no_audio"

            self._busy.set()
            self._last_error = None
            self._last_event = "transcribing"
            try:
                self._start_transcription(audio)
            except Exception:
                self._busy.clear()
                raise
            return "transcribing"
        except Exception as exc:
            self._last_error = str(exc)
            self._last_event = "error"
            return "error"

    def _start_transcription(self, audio):
        worker = threading.Thread(target=self._transcribe_worker, args=(audio,), daemon=True)
        worker.start()

    def _transcribe_worker(self, audio):
        try:
            result = self.process_audio(audio)
            self._last_error = None
            self._last_event = "published"
            print(f"[{result.elapsed_seconds:.2f}s] {result.text}")
            if result.llm_response:
                print(f"[LLM] {result.llm_response}")
            if result.tts_generated:
                print("[TTS] Synthesized latest LLM response to audio.")
            elif result.tts_error:
                print(f"[TTS] {result.tts_error}")
        except Exception as exc:
            self._last_error = str(exc)
            self._last_event = "error"
            print(f"Transcription failed: {exc}")
        finally:
            self._busy.clear()

    def process_audio(self, audio) -> TranscriptionResult:
        started = time.perf_counter()
        text = self.engine.transcribe(audio)
        elapsed = time.perf_counter() - started
        final_text = (text or "").strip() or "(no speech recognized)"

        llm_response, llm_elapsed = self._generate_llm_response(final_text)
        tts_audio_wav, tts_elapsed, tts_error = self._generate_tts_audio(llm_response)
        tts_wav_path = None
        tts_mp3_path = None

        if tts_audio_wav is not None:
            tts_wav_path, tts_mp3_path, save_error = self._save_tts_outputs(tts_audio_wav)
            if save_error:
                tts_error = f"{tts_error}; {save_error}" if tts_error else save_error

        return self._publish(
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

    def _generate_llm_response(self, transcript: str) -> tuple[Optional[str], Optional[float]]:
        if self.llm_engine is None:
            return None, None

        started = time.perf_counter()
        try:
            response = self.llm_engine.generate(transcript)
        except Exception as exc:
            response = f"LLM request failed: {exc}"
        return response, time.perf_counter() - started

    def _generate_tts_audio(
        self, llm_response: Optional[str]
    ) -> tuple[Optional[bytes], Optional[float], Optional[str]]:
        if (
            self.tts_engine is None
            or not llm_response
            or llm_response.startswith("LLM request failed:")
        ):
            return None, None, None

        started = time.perf_counter()
        try:
            audio_wav = self.tts_engine.synthesize(llm_response)
            error = None
        except Exception as exc:
            audio_wav = None
            error = f"TTS request failed: {exc}"
        return audio_wav, time.perf_counter() - started, error

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

        with self._tts_audio_lock:
            self._latest_tts_audio = tts_audio_wav
            self._latest_tts_audio_created_at = (
                result.created_at if tts_audio_wav is not None else None
            )

        return result

    def latest(self):
        with self._items_lock:
            if not self._items:
                return None
            return self._items[-1]

    def list_items(self, limit=20):
        if limit < 1:
            return []
        with self._items_lock:
            return list(self._items)[-limit:]

    def latest_response_audio(self):
        latest = self.latest()
        if latest is None:
            return None

        with self._tts_audio_lock:
            if (
                self._latest_tts_audio is not None
                and self._latest_tts_audio_created_at == latest.created_at
            ):
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

    def _save_tts_outputs(
        self, wav_bytes: bytes
    ) -> tuple[Optional[str], Optional[str], Optional[str]]:
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
