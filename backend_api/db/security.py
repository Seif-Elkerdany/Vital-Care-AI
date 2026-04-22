from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import json
import secrets


class AuthError(Exception):
    """Raised when authentication or authorization fails."""


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: str
    email: str
    full_name: str | None
    role: str


class PasswordHasher:
    algorithm = "pbkdf2_sha256"
    iterations = 390000

    def hash_password(self, raw_password: str) -> str:
        password = (raw_password or "").strip()
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters long.")

        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            self.iterations,
        ).hex()
        return f"{self.algorithm}${self.iterations}${salt}${digest}"

    def verify_password(self, raw_password: str, stored_hash: str) -> bool:
        try:
            algorithm, raw_iterations, salt, expected_digest = stored_hash.split("$", 3)
        except ValueError:
            return False
        if algorithm != self.algorithm:
            return False

        try:
            iterations = int(raw_iterations)
        except ValueError:
            return False

        password = (raw_password or "").strip()
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        ).hex()
        return hmac.compare_digest(digest, expected_digest)


class TokenService:
    def __init__(self, secret_key: str, *, ttl_seconds: int) -> None:
        self._secret_key = secret_key.encode("utf-8")
        self._ttl_seconds = ttl_seconds

    def issue_token(self, user: dict) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self._ttl_seconds)
        payload = {
            "sub": str(user["id"]),
            "email": str(user["email"]),
            "role": str(user["role"]),
            "full_name": user.get("full_name"),
            "exp": int(expires_at.timestamp()),
        }
        encoded_payload = self._encode_payload(payload)
        signature = hmac.new(
            self._secret_key,
            encoded_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"{encoded_payload}.{signature}"

    def parse_token(self, token: str) -> AuthenticatedUser:
        try:
            encoded_payload, signature = token.split(".", 1)
        except ValueError as exc:
            raise AuthError("Malformed bearer token.") from exc

        expected_signature = hmac.new(
            self._secret_key,
            encoded_payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            raise AuthError("Invalid bearer token signature.")

        try:
            payload = json.loads(self._decode_payload(encoded_payload))
        except Exception as exc:
            raise AuthError("Bearer token payload is invalid.") from exc

        expires_at = payload.get("exp")
        if not isinstance(expires_at, int) or expires_at < int(
            datetime.now(timezone.utc).timestamp()
        ):
            raise AuthError("Bearer token has expired.")

        return AuthenticatedUser(
            id=str(payload["sub"]),
            email=str(payload["email"]),
            full_name=payload.get("full_name"),
            role=str(payload["role"]),
        )

    def _encode_payload(self, payload: dict) -> str:
        serialized = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        return base64.urlsafe_b64encode(serialized).decode("utf-8").rstrip("=")

    def _decode_payload(self, encoded_payload: str) -> str:
        padding = "=" * (-len(encoded_payload) % 4)
        return base64.urlsafe_b64decode((encoded_payload + padding).encode("utf-8")).decode(
            "utf-8"
        )


def normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        raise ValueError("A valid email address is required.")
    return normalized


def hash_invitation_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()
