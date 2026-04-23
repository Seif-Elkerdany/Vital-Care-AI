from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend_api.db.security import AuthError

from .dependencies import build_current_user_dependency
from .schemas import (
    AcceptAdminInvitationRequest,
    AuthRequest,
    AuthTokenResponse,
    LogoutResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RefreshTokenRequest,
    RegisterRequest,
    UserResponse,
)


def build_auth_router(auth_service, invitation_service):
    router = APIRouter(prefix="/auth", tags=["auth"])
    current_user = build_current_user_dependency(auth_service)
    bearer_scheme = HTTPBearer(auto_error=False)

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

    @router.post("/refresh", response_model=AuthTokenResponse)
    async def refresh(payload: RefreshTokenRequest):
        try:
            return auth_service.refresh(refresh_token=payload.refresh_token)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @router.post("/logout", response_model=LogoutResponse)
    async def logout(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ):
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Bearer authentication is required.")
        try:
            auth_service.logout(token=credentials.credentials)
            return LogoutResponse(detail="Logged out successfully.")
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    @router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
    async def request_password_reset(payload: PasswordResetRequest):
        try:
            return auth_service.request_password_reset(email=payload.email)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/password-reset/confirm", response_model=LogoutResponse)
    async def confirm_password_reset(payload: PasswordResetConfirmRequest):
        try:
            return auth_service.reset_password(
                token=payload.token,
                new_password=payload.new_password,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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
