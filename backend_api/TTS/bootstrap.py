from dataclasses import dataclass

from .config import TTSConfig
from .service import TTSService
from .synthesizers import KokoroSynthesizer


@dataclass(frozen=True)
class ApplicationContainer:
    tts_service: TTSService


def build_tts_service(
    *,
    default_voice: str = "af_heart",
    lang_code: str = "a",
    sample_rate: int = 24000,
) -> TTSService:
    try:
        from kokoro import KPipeline
    except Exception as exc:
        raise RuntimeError(
            "Kokoro synthesis requires the `kokoro` package. Install TTS dependencies first."
        ) from exc

    config = TTSConfig(sample_rate=sample_rate, default_voice=default_voice)
    pipeline = KPipeline(lang_code=lang_code)
    synthesizer = KokoroSynthesizer(pipeline=pipeline, default_voice=config.default_voice)
    return TTSService(synthesizer=synthesizer, config=config)


def build_container() -> ApplicationContainer:
    tts_service = build_tts_service()
    return ApplicationContainer(tts_service=tts_service)
