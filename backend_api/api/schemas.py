from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    role: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class RegisterRequest(AuthRequest):
    full_name: str | None = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class CreateThreadRequest(BaseModel):
    title: str | None = None
    summary: str | None = None


class ThreadResponse(BaseModel):
    id: str
    user_id: str
    title: str | None = None
    summary: str | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class ThreadListResponse(BaseModel):
    items: list[ThreadResponse]


class ChatMessageResponse(BaseModel):
    id: str
    thread_id: str
    role: str
    content: str
    created_at: datetime


class ChatMessagesResponse(BaseModel):
    items: list[ChatMessageResponse]


class ChatTurnRequest(BaseModel):
    content: str


class MessageSourceResponse(BaseModel):
    chunk_id: str
    similarity_score: float | None = None
    rerank_score: float | None = None


class ChatTurnResponse(BaseModel):
    thread: ThreadResponse
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    message_sources: list[MessageSourceResponse]
    retrievals: list[dict[str, Any]] | None = None
    structured_query: str | None = None
    rag_error: str | None = None
    pipeline_elapsed_seconds: float | None = None


class CreateAdminInvitationRequest(BaseModel):
    email: str
    expires_in_hours: int = Field(default=72, ge=1, le=720)


class AdminInvitationResponse(BaseModel):
    invitation_id: str
    email: str
    expires_at: datetime
    created_at: datetime
    invitation_token: str


class AcceptAdminInvitationRequest(BaseModel):
    token: str
    email: str
    password: str = Field(min_length=8)
    full_name: str | None = None
