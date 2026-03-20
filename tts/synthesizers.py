from inspect import signature
from typing import Callable, Iterable

import numpy as np

from .contracts import AudioChunk, RawPipelineChunk, Synthesizer


class KokoroSynthesizer(Synthesizer):
    def __init__(self, pipeline: Callable[..., Iterable[RawPipelineChunk]], default_voice: str):
        if not callable(pipeline):
            raise ValueError("pipeline must be callable")
        self._pipeline = pipeline
        self._default_voice = default_voice
        self._expects_voice = self._detect_voice_parameter()

    def _detect_voice_parameter(self) -> bool:
        try:
            return len(signature(self._pipeline).parameters) >= 2
        except (TypeError, ValueError):
            return True

    def _call_pipeline(self, text: str) -> Iterable[RawPipelineChunk]:
        if self._expects_voice:
            return self._pipeline(text, self._default_voice)
        return self._pipeline(text)

    def iter_chunks(self, text: str) -> Iterable[AudioChunk]:
        for gs, ps, audio in self._call_pipeline(text):
            yield AudioChunk(meta={"gs": gs, "ps": ps}, audio=np.asarray(audio))
