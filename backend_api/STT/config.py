import os


SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = "int16"


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_optional_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


class AppConfig:
    model_id: str = "openai/whisper-medium"
    language: str = "en"
    llm_enabled: bool = _env_flag("LLM_ENABLED", True)
    llm_backend: str = os.getenv("LLM_BACKEND", "gemini").lower()
    llm_model: str = os.getenv("LLM_MODEL", "gpt-oss-120b")
    llm_base_url: str = os.getenv("LLM_BASE_URL", "https://llm-api.arc.vt.edu/api/v1")
    llm_api_key: str | None = (
        os.getenv("LLM_API_KEY")
        or os.getenv("ARC_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
    rag_enabled: bool = _env_flag("RAG_ENABLED", True)
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    pipeline_top_k: int | None = _env_optional_int("PIPELINE_TOP_K")
    tts_enabled: bool = _env_flag("TTS_ENABLED", True)
    tts_voice: str = os.getenv("TTS_VOICE", "af_heart")
    tts_lang_code: str = os.getenv("TTS_LANG_CODE", "a")
    tts_sample_rate: int = _env_int("TTS_SAMPLE_RATE", 24000)
    tts_output_dir: str = os.getenv("TTS_OUTPUT_DIR", "stt/output_audio")
