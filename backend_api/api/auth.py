from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend_api.db.security import AuthError

from .dependencies import build_current_user_dependency
from .schemas import (
    AcceptAdminInvitationRequest,
    AuthRequest,
    AuthTokenResponse,
    RegisterRequest,
    UserResponse,
)


def build_auth_router(auth_service, invitation_service):
    router = APIRouter(prefix="/auth", tags=["auth"])
    current_user = build_current_user_dependency(auth_service)

    @router.post("/register", response_model=AuthTokenResponse)
    async def register(payload: RegisterRequest):
        try:
            return auth_service.register_doctor(
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/login", response_model=AuthTokenResponse)
    async def login(payload: AuthRequest):
        try:
            return auth_service.login(email=payload.email, password=payload.password)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @router.get("/me", response_model=UserResponse)
    async def me(user=Depends(current_user)):
        return user

    @router.post("/admin-invitations/accept", response_model=AuthTokenResponse)
    async def accept_admin_invitation(payload: AcceptAdminInvitationRequest):
        try:
            invitation_service.accept_invitation(
                token=payload.token,
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
            )
            return auth_service.login(email=payload.email, password=payload.password)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return router
