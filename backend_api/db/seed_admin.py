from __future__ import annotations

from .config import get_admin_seed_settings, get_auth_settings, get_database_settings
from .connection import Database
from .migrate import apply_migrations
from .repositories import UserRepository
from .security import PasswordHasher, TokenService
from .services import AuthService


def main() -> None:
    database = Database(get_database_settings(required=True))
    auth_settings = get_auth_settings(required=True)
    seed_settings = get_admin_seed_settings(required=True)

    apply_migrations(database)

    auth_service = AuthService(
        database,
        users=UserRepository(),
        password_hasher=PasswordHasher(),
        token_service=TokenService(
            auth_settings.secret_key,
            ttl_seconds=auth_settings.token_ttl_seconds,
        ),
    )
    admin_user = auth_service.seed_admin(
        email=seed_settings.email,
        password=seed_settings.password,
        full_name=seed_settings.full_name,
    )
    print(
        f"Admin ready: {admin_user['email']} ({admin_user['role']}) id={admin_user['id']}"
    )


if __name__ == "__main__":
    main()
