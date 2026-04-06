"""Audio recording support for the STT service."""

from __future__ import annotations

import threading

import numpy as np

from .config import CHANNELS, DTYPE, SAMPLE_RATE


class AudioRecorder:
    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        channels: int = CHANNELS,
        dtype: str = DTYPE,
    ) -> None:
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

    def _audio_callback(self, indata, frames, time_info, status) -> None:
        del frames, time_info
        if status:
            print(f"Audio status: {status}")

        with self._lock:
            if not self.recording:
                return
            self.audio_chunks.append(indata.copy())

    def start(self) -> None:
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
