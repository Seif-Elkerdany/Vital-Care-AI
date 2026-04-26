from __future__ import annotations

from dataclasses import dataclass

from .config import get_auth_settings, get_database_settings, get_email_settings
from .connection import Database
from .email import PasswordResetEmailSender
from .repositories import (
    AuthSessionRepository,
    ChatRepository,
    DocumentRepository,
    InvitationRepository,
    PasswordResetRepository,
    UserRepository,
)
from .security import PasswordHasher, TokenService
from .services import AdminInvitationService, AuthService, ChatService, DocumentCatalogService


@dataclass(slots=True)
class PostgresServices:
    database: Database
    document_catalog: DocumentCatalogService
    auth_service: AuthService
    invitation_service: AdminInvitationService
    chat_service: ChatService | None


def build_document_catalog() -> DocumentCatalogService | None:
    settings = get_database_settings(required=False)
    if settings is None:
        return None
    database = Database(settings)
    return DocumentCatalogService(database, documents=DocumentRepository())


def build_postgres_services(*, stt_service, document_catalog=None) -> PostgresServices | None:
    database_settings = get_database_settings(required=False)
    auth_settings = get_auth_settings(required=False)
    email_settings = get_email_settings(required=False)
    if database_settings is None or auth_settings is None:
        return None

    database = Database(database_settings)
    users = UserRepository()
    invitations = InvitationRepository()
    password_resets = PasswordResetRepository()
    auth_sessions = AuthSessionRepository()
    chats = ChatRepository()
    documents = DocumentRepository()
    password_hasher = PasswordHasher()
    token_service = TokenService(
        auth_settings.secret_key,
        ttl_seconds=auth_settings.token_ttl_seconds,
        refresh_ttl_seconds=auth_settings.refresh_token_ttl_seconds,
    )
    password_reset_email_sender = (
        PasswordResetEmailSender(email_settings)
        if email_settings is not None
        else None
    )
    document_catalog_service = document_catalog or DocumentCatalogService(
        database,
        documents=documents,
    )
    auth_service = AuthService(
        database,
        users=users,
        auth_sessions=auth_sessions,
        password_resets=password_resets,
        password_hasher=password_hasher,
        token_service=token_service,
        password_reset_token_ttl_seconds=auth_settings.password_reset_token_ttl_seconds,
        password_reset_email_sender=password_reset_email_sender,
        password_reset_url_base=(
            email_settings.reset_password_url_base
            if email_settings is not None
            else None
        ),
    )
    invitation_service = AdminInvitationService(
        database,
        invitations=invitations,
        users=users,
        password_hasher=password_hasher,
    )
    chat_service = (
        ChatService(
            database,
            stt_service=stt_service,
            chats=chats,
        )
        if stt_service is not None
        else None
    )
    return PostgresServices(
        database=database,
        document_catalog=document_catalog_service,
        auth_service=auth_service,
        invitation_service=invitation_service,
        chat_service=chat_service,
    )
