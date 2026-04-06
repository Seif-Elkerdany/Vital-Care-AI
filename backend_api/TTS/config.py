from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class TTSConfig:
    sample_rate: int = 24000
    default_voice: str = "af_heart"
    dtype: str = "float32"
    channels: Optional[int] = None
