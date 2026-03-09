from dataclasses import dataclass


SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = "int16"


@dataclass(slots=True)
class AppConfig:
    model_id = "openai/whisper-medium"
    language = "en"
