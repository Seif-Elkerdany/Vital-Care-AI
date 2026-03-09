from __future__ import annotations

import asyncio
import threading
from queue import Queue
from typing import Any, Iterable, Optional

import numpy as np

from tts.config import TTSConfig
from tts.contracts import AudioChunk, Synthesizer, WavEncoder
from tts.encoders import SoundFileWavEncoder


class TTSService:
    def __init__(
        self,
        synthesizer: Synthesizer,
        config: Optional[TTSConfig] = None,
        wav_encoder: Optional[WavEncoder] = None,
    ):
        self._synthesizer = synthesizer
        self._config = config or TTSConfig()
        self._wav_encoder = wav_encoder or SoundFileWavEncoder()

    @property
    def config(self) -> TTSConfig:
        return self._config

    def synthesize_bytes(self, text: str) -> bytes:
        normalized = [chunk for chunk in self._normalized_chunks(text)]
        if not normalized:
            raise RuntimeError("synthesizer produced no audio")
        merged = self._merge_audio([chunk.audio for chunk in normalized])
        return self._wav_encoder.encode(merged, self._config.sample_rate)

    def synthesize_wave_chunks(self, text: str) -> Iterable[tuple[dict[str, Any], bytes]]:
        for chunk in self._normalized_chunks(text):
            yield chunk.meta, self._wav_encoder.encode(chunk.audio, self._config.sample_rate)

    def stream_to_queue(self, text: str, out_queue: Queue) -> None:
        try:
            for item in self.synthesize_wave_chunks(text):
                out_queue.put(item)
        except Exception as exc:
            out_queue.put(("__error__", repr(exc)))
        finally:
            out_queue.put(None)

    def stream_to_async_queue(
        self, text: str, async_queue: asyncio.Queue, loop: Optional[asyncio.AbstractEventLoop] = None
    ) -> threading.Thread:
        target_loop = loop or asyncio.get_event_loop()

        def producer() -> None:
            try:
                for item in self.synthesize_wave_chunks(text):
                    target_loop.call_soon_threadsafe(async_queue.put_nowait, item)
            except Exception as exc:
                target_loop.call_soon_threadsafe(async_queue.put_nowait, ("__error__", repr(exc)))
            finally:
                target_loop.call_soon_threadsafe(async_queue.put_nowait, None)

        thread = threading.Thread(target=producer, daemon=True)
        thread.start()
        return thread

    def _normalized_chunks(self, text: str) -> Iterable[AudioChunk]:
        self._validate_text(text)
        for chunk in self._synthesizer.iter_chunks(text):
            normalized = self._normalize_audio(chunk.audio)
            if normalized.size == 0:
                continue
            yield AudioChunk(meta=chunk.meta, audio=normalized)

    def _validate_text(self, text: str) -> None:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text must be non-empty")

    def _normalize_audio(self, audio: Any) -> np.ndarray:
        if audio is None:
            return np.zeros((0,), dtype=np.float32)

        array = np.asarray(audio)
        if array.size == 0:
            return np.zeros((0,), dtype=np.float32)
        if array.ndim > 2:
            raise ValueError("audio ndim must be 1 or 2")
        if array.dtype not in (np.float32, np.int16):
            array = array.astype(np.float32)
        return np.ascontiguousarray(array)

    def _merge_audio(self, chunks: list[np.ndarray]) -> np.ndarray:
        max_channels = max(1 if chunk.ndim == 1 else chunk.shape[1] for chunk in chunks)
        aligned: list[np.ndarray] = []

        for chunk in chunks:
            if chunk.ndim == 1 and max_channels > 1:
                expanded = chunk.reshape(-1, 1)
                chunk = np.tile(expanded, (1, max_channels))
            aligned.append(chunk)

        merged = np.concatenate(aligned, axis=0)
        if merged.dtype != np.int16:
            merged = merged.astype(np.float32)
        return merged
