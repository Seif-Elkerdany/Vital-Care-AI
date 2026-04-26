from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend_api.db.security import AuthError


bearer_scheme = HTTPBearer(auto_error=False)


def build_current_user_dependency(auth_service):
    async def get_current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ):
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Bearer authentication is required.")
        try:
            return auth_service.current_user(credentials.credentials)
        except AuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    return get_current_user


def build_admin_user_dependency(auth_service):
    current_user = build_current_user_dependency(auth_service)

    async def get_admin_user(user=Depends(current_user)):
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin access is required.")
        return user

    return get_admin_user
