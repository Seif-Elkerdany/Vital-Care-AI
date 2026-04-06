from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class TranscriptionResult(BaseModel):
    text: str
    elapsed_seconds: float = Field(ge=0)
    llm_response: str | None = None
    llm_elapsed_seconds: float | None = Field(default=None, ge=0)
    pipeline_elapsed_seconds: float | None = Field(default=None, ge=0)
    structured_query: str | None = None
    retrievals: list[dict[str, Any]] | None = None
    rag_error: str | None = None
    tts_generated: bool = False
    tts_elapsed_seconds: float | None = Field(default=None, ge=0)
    tts_error: str | None = None
    tts_wav_path: str | None = None
    tts_mp3_path: str | None = None
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


class TextInputRequest(BaseModel):
    text: str
