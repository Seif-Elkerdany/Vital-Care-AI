from __future__ import annotations

import asyncio
from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class SpeechToTextProvider(Protocol):
    def transcribe(self, audio_bytes: bytes) -> str:
        ...


@runtime_checkable
class LanguageModelProvider(Protocol):
    def generate(self, prompt: str) -> str:
        ...


@runtime_checkable
class SpeechSynthesizer(Protocol):
    def synthesize_bytes(self, text: str) -> bytes:
        ...

    def stream_to_async_queue(
        self,
        text: str,
        async_queue: asyncio.Queue,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ):
        ...
