from __future__ import annotations

from dataclasses import dataclass

from .config import get_auth_settings, get_database_settings
from .connection import Database
from .repositories import ChatRepository, DocumentRepository, InvitationRepository, UserRepository
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
    if database_settings is None or auth_settings is None:
        return None

    database = Database(database_settings)
    users = UserRepository()
    invitations = InvitationRepository()
    chats = ChatRepository()
    documents = DocumentRepository()
    password_hasher = PasswordHasher()
    token_service = TokenService(
        auth_settings.secret_key,
        ttl_seconds=auth_settings.token_ttl_seconds,
    )
    document_catalog_service = document_catalog or DocumentCatalogService(
        database,
        documents=documents,
    )
    auth_service = AuthService(
        database,
        users=users,
        password_hasher=password_hasher,
        token_service=token_service,
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
