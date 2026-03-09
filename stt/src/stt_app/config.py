import os
from dataclasses import dataclass


SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = "int16"


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class AppConfig:
    model_id = "openai/whisper-medium"
    language = "en"
    llm_enabled = _env_flag("LLM_ENABLED", True)
    llm_model = os.getenv("LLM_MODEL", "gpt-oss-120b")
    llm_base_url = os.getenv("LLM_BASE_URL", "https://llm-api.arc.vt.edu/api/v1")
    llm_api_key = (
        os.getenv("LLM_API_KEY")
        or os.getenv("ARC_API_KEY")
        or os.getenv("OPENAI_API_KEY")
    )
