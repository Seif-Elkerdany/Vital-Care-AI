from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Protocol

import numpy as np


RawPipelineChunk = tuple[Any, Any, Any]


@dataclass(frozen=True)
class AudioChunk:
    meta: dict[str, Any]
    audio: np.ndarray


class Synthesizer(Protocol):
    def iter_chunks(self, text: str) -> Iterable[AudioChunk]:
        ...


class WavEncoder(Protocol):
    def encode(self, audio: np.ndarray, sample_rate: int) -> bytes:
        ...
