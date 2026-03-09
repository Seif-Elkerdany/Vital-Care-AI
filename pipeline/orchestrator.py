from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

from pipeline.contracts import LanguageModelProvider, SpeechSynthesizer, SpeechToTextProvider
from pipeline.defaults import NotImplementedSpeechToText, PassThroughLanguageModel


@dataclass(frozen=True)
class VoicePipelineResult:
    input_text: str
    response_text: str
    audio_wav: bytes


class VoicePipelineOrchestrator:
    def __init__(
        self,
        synthesizer: SpeechSynthesizer,
        llm_provider: Optional[LanguageModelProvider] = None,
        stt_provider: Optional[SpeechToTextProvider] = None,
    ):
        self._synthesizer = synthesizer
        self._llm_provider = llm_provider or PassThroughLanguageModel()
        self._stt_provider = stt_provider or NotImplementedSpeechToText()

    def text_to_speech(self, text: str) -> bytes:
        return self._synthesizer.synthesize_bytes(text)

    def stream_text_to_speech(
        self,
        text: str,
        async_queue: asyncio.Queue,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ):
        return self._synthesizer.stream_to_async_queue(text, async_queue, loop)

    def text_to_agent_speech(self, input_text: str) -> VoicePipelineResult:
        response_text = self._llm_provider.generate(input_text)
        audio_wav = self._synthesizer.synthesize_bytes(response_text)
        return VoicePipelineResult(
            input_text=input_text,
            response_text=response_text,
            audio_wav=audio_wav,
        )

    def audio_to_agent_speech(self, audio_bytes: bytes) -> VoicePipelineResult:
        transcribed_text = self._stt_provider.transcribe(audio_bytes)
        response_text = self._llm_provider.generate(transcribed_text)
        audio_wav = self._synthesizer.synthesize_bytes(response_text)
        return VoicePipelineResult(
            input_text=transcribed_text,
            response_text=response_text,
            audio_wav=audio_wav,
        )
