from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .dependencies import build_current_user_dependency
from .schemas import (
    ChatMessagesResponse,
    ChatTurnRequest,
    ChatTurnResponse,
    CreateThreadRequest,
    ThreadListResponse,
    ThreadResponse,
)


def build_chat_router(auth_service, chat_service):
    router = APIRouter(prefix="/chat", tags=["chat"])
    current_user = build_current_user_dependency(auth_service)

    @router.post("/threads", response_model=ThreadResponse)
    async def create_thread(payload: CreateThreadRequest, user=Depends(current_user)):
        return chat_service.create_thread(
            user_id=user["id"],
            title=payload.title,
            summary=payload.summary,
        )

    @router.get("/threads", response_model=ThreadListResponse)
    async def list_threads(user=Depends(current_user)):
        return ThreadListResponse(items=chat_service.list_threads(user_id=user["id"]))

    @router.get("/threads/{thread_id}/messages", response_model=ChatMessagesResponse)
    async def list_messages(thread_id: str, user=Depends(current_user)):
        try:
            return ChatMessagesResponse(
                items=chat_service.list_messages(user_id=user["id"], thread_id=thread_id)
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/threads/{thread_id}/turns", response_model=ChatTurnResponse)
    async def create_turn(thread_id: str, payload: ChatTurnRequest, user=Depends(current_user)):
        try:
            return chat_service.run_rag_turn(
                user_id=user["id"],
                thread_id=thread_id,
                content=payload.content,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    return router
