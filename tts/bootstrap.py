from dataclasses import dataclass

from kokoro import KPipeline
from pipeline.defaults import NotImplementedSpeechToText, PassThroughLanguageModel
from pipeline.orchestrator import VoicePipelineOrchestrator
from tts.config import TTSConfig
from tts.service import TTSService
from tts.synthesizers import KokoroSynthesizer


@dataclass(frozen=True)
class ApplicationContainer:
    tts_service: TTSService
    pipeline_orchestrator: VoicePipelineOrchestrator


def build_tts_service() -> TTSService:
    config = TTSConfig(sample_rate=24000, default_voice="af_heart")
    pipeline = KPipeline(lang_code="a")
    synthesizer = KokoroSynthesizer(pipeline=pipeline, default_voice=config.default_voice)
    return TTSService(synthesizer=synthesizer, config=config)


def build_container() -> ApplicationContainer:
    tts_service = build_tts_service()
    orchestrator = VoicePipelineOrchestrator(
        synthesizer=tts_service,
        llm_provider=PassThroughLanguageModel(),
        stt_provider=NotImplementedSpeechToText(),
    )
    return ApplicationContainer(tts_service=tts_service, pipeline_orchestrator=orchestrator)
