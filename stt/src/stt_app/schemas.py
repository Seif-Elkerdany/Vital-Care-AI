from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TranscriptionResult(BaseModel):
    text: str
    elapsed_seconds: float = Field(ge=0)
    llm_response: str | None = None
    llm_elapsed_seconds: float | None = Field(default=None, ge=0)
    created_at: datetime


class HealthResponse(BaseModel):
    status: str


class TranscriptionListResponse(BaseModel):
    items: list[TranscriptionResult]


class LLMResponseResult(BaseModel):
    transcript: str
    response: str
    created_at: datetime


class RecordingStatusResponse(BaseModel):
    recording: bool
    transcribing: bool
    last_event: str
    last_error: str | None
    latest_text: str | None


class ToggleRecordingResponse(BaseModel):
    state: Literal["recording_started", "transcribing", "busy", "no_audio", "error"]
