from __future__ import annotations

import io
import threading
from typing import Any

import numpy as np


class TTSEngine:
    def __init__(self, voice: str, lang_code: str, sample_rate: int):
        self.voice = voice
        self.lang_code = lang_code
        self.sample_rate = sample_rate
        self._pipeline = None
        self._lock = threading.Lock()

    def _get_pipeline(self):
        if self._pipeline is None:
            try:
                from kokoro import KPipeline
            except Exception as exc:
                raise RuntimeError(
                    "TTS integration requires the `kokoro` package. Install it with pip."
                ) from exc

            self._pipeline = KPipeline(lang_code=self.lang_code)

        return self._pipeline

    def _to_array(self, audio: Any) -> np.ndarray:
        array = np.asarray(audio)
        if array.size == 0:
            return np.zeros((0,), dtype=np.float32)
        if array.dtype != np.float32:
            array = array.astype(np.float32)
        return np.ascontiguousarray(array)

    def _encode_wav(self, audio: np.ndarray) -> bytes:
        try:
            import soundfile as sf
        except Exception as exc:
            raise RuntimeError(
                "TTS integration requires the `soundfile` package. Install it with pip."
            ) from exc

        buffer = io.BytesIO()
        sf.write(buffer, audio, self.sample_rate, format="WAV")
        buffer.seek(0)
        return buffer.read()

    def synthesize(self, text: str) -> bytes:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("text must be non-empty")

        pipeline = self._get_pipeline()
        chunks: list[np.ndarray] = []

        with self._lock:
            for _, _, audio in pipeline(cleaned, self.voice):
                chunk = self._to_array(audio)
                if chunk.size == 0:
                    continue
                chunks.append(chunk)

        if not chunks:
            raise RuntimeError("TTS produced no audio for the provided text.")

        merged = np.concatenate(chunks, axis=0)
        return self._encode_wav(merged)
