from __future__ import annotations

from functools import lru_cache

from dotenv import load_dotenv


@lru_cache(maxsize=1)
def load_environment() -> bool:
    return load_dotenv()
