from __future__ import annotations

from dataclasses import dataclass
import os

from backend_api.env import load_environment

load_environment()


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} must be set in the environment.")
    return value.strip()


@dataclass(frozen=True, slots=True)
class DatabaseSettings:
    database_url: str


@dataclass(frozen=True, slots=True)
class AuthSettings:
    secret_key: str
    token_ttl_seconds: int = 60 * 60 * 24 * 7


@dataclass(frozen=True, slots=True)
class AdminSeedSettings:
    email: str
    password: str
    full_name: str | None = None


def get_database_settings(*, required: bool = True) -> DatabaseSettings | None:
    database_url = os.getenv("DATABASE_URL")
    if database_url is None or not database_url.strip():
        if required:
            raise RuntimeError(
                "DATABASE_URL is not set. "
                "Use postgresql://medical_user:medical_password@localhost:5432/medical_rag_app "
                "outside Docker, or postgresql://medical_user:medical_password@postgres:5432/medical_rag_app "
                "from another Docker Compose service."
            )
        return None
    return DatabaseSettings(database_url=database_url.strip())


def get_auth_settings(*, required: bool = True) -> AuthSettings | None:
    secret_key = os.getenv("APP_AUTH_SECRET")
    if secret_key is None or not secret_key.strip():
        if required:
            raise RuntimeError("APP_AUTH_SECRET must be set in the environment.")
        return None
    return AuthSettings(
        secret_key=secret_key.strip(),
        token_ttl_seconds=_env_int("AUTH_TOKEN_TTL_SECONDS", 60 * 60 * 24 * 7),
    )


def get_admin_seed_settings(*, required: bool = True) -> AdminSeedSettings | None:
    email = os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    full_name = os.getenv("ADMIN_FULL_NAME")

    if email and password:
        return AdminSeedSettings(
            email=email.strip(),
            password=password,
            full_name=full_name.strip() if full_name and full_name.strip() else None,
        )

    if required:
        raise RuntimeError(
            "ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment to seed the first admin."
        )
    return None
