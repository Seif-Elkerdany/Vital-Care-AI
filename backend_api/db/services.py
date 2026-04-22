from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets
from uuid import UUID

from .connection import Database
from .repositories import ChatRepository, DocumentRepository, InvitationRepository, UserRepository
from .security import (
    AuthError,
    PasswordHasher,
    TokenService,
    hash_invitation_token,
    normalize_email,
)


class AuthService:
    def __init__(
        self,
        database: Database,
        *,
        users: UserRepository,
        password_hasher: PasswordHasher,
        token_service: TokenService,
    ) -> None:
        self.database = database
        self.users = users
        self.password_hasher = password_hasher
        self.token_service = token_service

    def register_doctor(self, *, email: str, password: str, full_name: str | None) -> dict:
        normalized_email = normalize_email(email)
        password_hash = self.password_hasher.hash_password(password)
        clean_name = (full_name or "").strip() or None

        with self.database.transaction() as connection:
            created_user = self.users.create_user(
                connection,
                email=normalized_email,
                password_hash=password_hash,
                full_name=clean_name,
                role="doctor",
            )
            if created_user is None:
                raise ValueError("A user with that email already exists.")
            return {
                "user": self._public_user(created_user),
                "access_token": self.token_service.issue_token(created_user),
            }

    def login(self, *, email: str, password: str) -> dict:
        normalized_email = normalize_email(email)
        with self.database.connect() as connection:
            user = self.users.get_by_email(connection, normalized_email)

        if user is None or not self.password_hasher.verify_password(password, user["password_hash"]):
            raise AuthError("Invalid email or password.")

        return {
            "user": self._public_user(user),
            "access_token": self.token_service.issue_token(user),
        }

    def current_user(self, token: str) -> dict:
        claims = self.token_service.parse_token(token)
        with self.database.connect() as connection:
            user = self.users.get_by_id(connection, claims.id)

        if user is None:
            raise AuthError("Authenticated user was not found.")
        return self._public_user(user)

    def require_admin(self, token: str) -> dict:
        user = self.current_user(token)
        if user["role"] != "admin":
            raise AuthError("Admin access is required for this route.")
        return user

    def seed_admin(self, *, email: str, password: str, full_name: str | None) -> dict:
        normalized_email = normalize_email(email)
        clean_name = (full_name or "").strip() or None

        with self.database.transaction() as connection:
            existing_user = self.users.get_by_email(connection, normalized_email)
            if existing_user is not None:
                if existing_user["role"] == "admin":
                    return self._public_user(existing_user)
                raise ValueError(
                    "A non-admin user with that email already exists. Refusing to promote automatically."
                )

            created_user = self.users.create_user(
                connection,
                email=normalized_email,
                password_hash=self.password_hasher.hash_password(password),
                full_name=clean_name,
                role="admin",
            )
            if created_user is None:
                raise ValueError("Failed to create the initial admin user.")
            return self._public_user(created_user)

    def _public_user(self, user: dict) -> dict:
        return {
            "id": str(user["id"]),
            "email": str(user["email"]),
            "full_name": user.get("full_name"),
            "role": str(user["role"]),
            "created_at": user.get("created_at"),
            "updated_at": user.get("updated_at"),
        }


class DocumentCatalogService:
    def __init__(
        self,
        database: Database,
        *,
        documents: DocumentRepository | None = None,
    ) -> None:
        self.database = database
        self.documents = documents or DocumentRepository()

    def sync_indexed_document(
        self,
        *,
        document_id: str,
        title: str,
        source_type: str | None,
        file_url: str | None,
        version: str | None,
        status: str,
        uploaded_by: str | None,
        approved_by: str | None,
        approved_at,
        chunk_records: list[dict],
    ) -> dict:
        with self.database.transaction() as connection:
            document_row = self.documents.upsert_document(
                connection,
                document_id=document_id,
                title=title,
                source_type=source_type,
                file_url=file_url,
                version=version,
                status=status,
                uploaded_by=uploaded_by,
                approved_by=approved_by,
                approved_at=approved_at,
            )
            self.documents.replace_chunks(
                connection,
                document_id=document_id,
                chunks=chunk_records,
            )
            return self._to_rag_document(document_row)

    def list_documents(self, *, include_archived: bool) -> list[dict]:
        with self.database.connect() as connection:
            rows = self.documents.list_documents(connection, include_archived=include_archived)
        return [self._to_rag_document(row) for row in rows]

    def list_approved_document_ids(self) -> set[str]:
        with self.database.connect() as connection:
            approved_ids = self.documents.list_approved_document_ids(connection)
        return set(approved_ids)

    def archive_documents(self, document_ids: list[str]) -> None:
        if not document_ids:
            return
        with self.database.transaction() as connection:
            self.documents.archive_documents(connection, document_ids=document_ids)

    def approve_document(self, *, document_id: str, approved_by: str) -> dict:
        with self.database.transaction() as connection:
            document = self.documents.approve_document(
                connection,
                document_id=document_id,
                approved_by=approved_by,
            )
            if document is None:
                raise LookupError("Document was not found.")
            return self._to_rag_document(document)

    def _to_rag_document(self, row: dict) -> dict:
        return {
            "document_id": str(row["id"]),
            "document_name": row["title"],
            "title": row["title"],
            "source_type": row.get("source_type"),
            "source_path": row.get("file_url"),
            "file_url": row.get("file_url"),
            "version": row.get("version"),
            "status": row.get("status"),
            "uploaded_by": str(row["uploaded_by"]) if row.get("uploaded_by") else None,
            "approved_by": str(row["approved_by"]) if row.get("approved_by") else None,
            "approved_at": row.get("approved_at"),
            "uploaded_at": row.get("approved_at") or row.get("created_at"),
            "created_at": row.get("created_at"),
            "is_deleted": row.get("status") == "archived",
            "deleted_at": None,
            "file_hash": None,
            "total_pages": None,
            "indexed_pages": None,
            "total_chunks": None,
            "protocol_version": int(row["version"]) if str(row.get("version") or "").isdigit() else None,
            "superseded_by_document_id": None,
        }


class AdminInvitationService:
    def __init__(
        self,
        database: Database,
        *,
        invitations: InvitationRepository,
        users: UserRepository,
        password_hasher: PasswordHasher,
    ) -> None:
        self.database = database
        self.invitations = invitations
        self.users = users
        self.password_hasher = password_hasher

    def create_invitation(
        self,
        *,
        admin_user_id: str,
        email: str,
        expires_in_hours: int = 72,
    ) -> dict:
        normalized_email = normalize_email(email)
        expiration = datetime.now(timezone.utc) + timedelta(hours=max(1, expires_in_hours))

        for _ in range(5):
            raw_token = secrets.token_urlsafe(32)
            token_hash = hash_invitation_token(raw_token)
            with self.database.transaction() as connection:
                existing_user = self.users.get_by_email(connection, normalized_email)
                if existing_user is not None:
                    raise ValueError("That email already belongs to an existing user.")
                invitation = self.invitations.create_invitation(
                    connection,
                    email=normalized_email,
                    token_hash=token_hash,
                    invited_by=admin_user_id,
                    expires_at=expiration,
                )
                if invitation is None:
                    continue
                return {
                    "invitation_id": str(invitation["id"]),
                    "email": invitation["email"],
                    "expires_at": invitation["expires_at"],
                    "created_at": invitation["created_at"],
                    "invitation_token": raw_token,
                }

        raise ValueError(
            "An active invitation already exists for that email address. Revoke or wait for it to expire."
        )

    def accept_invitation(
        self,
        *,
        token: str,
        email: str,
        password: str,
        full_name: str | None,
    ) -> dict:
        normalized_email = normalize_email(email)
        token_hash = hash_invitation_token(token)

        with self.database.transaction() as connection:
            invitation = self.invitations.get_by_token_hash(connection, token_hash=token_hash)
            if invitation is None:
                raise ValueError("Invitation token is invalid.")
            if invitation["email"] != normalized_email:
                raise ValueError("Invitation email does not match the requested account email.")
            if invitation.get("revoked_at") is not None:
                raise ValueError("Invitation has been revoked.")
            if invitation.get("accepted_at") is not None:
                raise ValueError("Invitation has already been accepted.")
            expires_at = invitation["expires_at"]
            if expires_at <= datetime.now(timezone.utc):
                raise ValueError("Invitation has expired.")
            existing_user = self.users.get_by_email(connection, normalized_email)
            if existing_user is not None:
                raise ValueError("A user with that email already exists.")

            created_user = self.users.create_user(
                connection,
                email=normalized_email,
                password_hash=self.password_hasher.hash_password(password),
                full_name=(full_name or "").strip() or None,
                role="admin",
            )
            if created_user is None:
                raise ValueError("Failed to create the invited admin user.")

            self.invitations.mark_accepted(
                connection,
                invitation_id=str(invitation["id"]),
                accepted_user_id=str(created_user["id"]),
            )
            return {
                "id": str(created_user["id"]),
                "email": created_user["email"],
                "full_name": created_user.get("full_name"),
                "role": created_user["role"],
                "created_at": created_user.get("created_at"),
                "updated_at": created_user.get("updated_at"),
            }


class ChatService:
    def __init__(
        self,
        database: Database,
        *,
        stt_service,
        chats: ChatRepository | None = None,
    ) -> None:
        self.database = database
        self.stt_service = stt_service
        self.chats = chats or ChatRepository()

    def create_thread(self, *, user_id: str, title: str | None, summary: str | None) -> dict:
        with self.database.transaction() as connection:
            thread = self.chats.create_thread(
                connection,
                user_id=user_id,
                title=(title or "").strip() or None,
                summary=(summary or "").strip() or None,
            )
            return self._public_thread(thread)

    def list_threads(self, *, user_id: str) -> list[dict]:
        with self.database.connect() as connection:
            rows = self.chats.list_threads(connection, user_id=user_id)
        return [self._public_thread(row) for row in rows]

    def list_messages(self, *, user_id: str, thread_id: str) -> list[dict]:
        with self.database.connect() as connection:
            thread = self.chats.get_thread(connection, thread_id=thread_id, user_id=user_id)
            if thread is None:
                raise LookupError("Thread was not found.")
            rows = self.chats.list_messages(connection, thread_id=thread_id, user_id=user_id)
        return [self._public_message(row) for row in rows]

    def save_user_message(self, *, thread_id: str, content: str) -> dict:
        with self.database.transaction() as connection:
            message = self.chats.insert_message(
                connection,
                thread_id=thread_id,
                role="user",
                content=content.strip(),
            )
            self.chats.touch_thread(connection, thread_id=thread_id)
            return self._public_message(message)

    def save_assistant_message(self, *, thread_id: str, content: str) -> dict:
        with self.database.transaction() as connection:
            message = self.chats.insert_message(
                connection,
                thread_id=thread_id,
                role="assistant",
                content=content.strip(),
            )
            self.chats.touch_thread(connection, thread_id=thread_id)
            return self._public_message(message)

    def run_rag_turn(self, *, user_id: str, thread_id: str, content: str) -> dict:
        cleaned_content = (content or "").strip()
        if not cleaned_content:
            raise ValueError("Message content must be non-empty.")

        with self.database.connect() as connection:
            with connection.transaction():
                thread = self.chats.get_thread(connection, thread_id=thread_id, user_id=user_id)
                if thread is None:
                    raise LookupError("Thread was not found.")

                user_message = self.chats.insert_message(
                    connection,
                    thread_id=thread_id,
                    role="user",
                    content=cleaned_content,
                )
                pipeline_result = self.stt_service.process_text_input(cleaned_content)
                assistant_message = self.chats.insert_message(
                    connection,
                    thread_id=thread_id,
                    role="assistant",
                    content=(pipeline_result.llm_response or "No assistant response was generated.").strip(),
                )

                message_sources = self._extract_message_sources(pipeline_result.retrievals)
                self.chats.insert_message_sources(
                    connection,
                    message_id=str(assistant_message["id"]),
                    sources=message_sources,
                )
                thread = self.chats.touch_thread(connection, thread_id=thread_id) or thread

        return {
            "thread": self._public_thread(thread),
            "user_message": self._public_message(user_message),
            "assistant_message": self._public_message(assistant_message),
            "message_sources": message_sources,
            "retrievals": pipeline_result.retrievals,
            "structured_query": pipeline_result.structured_query,
            "rag_error": pipeline_result.rag_error,
            "pipeline_elapsed_seconds": pipeline_result.pipeline_elapsed_seconds,
        }

    def _public_thread(self, thread: dict) -> dict:
        return {
            "id": str(thread["id"]),
            "user_id": str(thread["user_id"]),
            "title": thread.get("title"),
            "summary": thread.get("summary"),
            "created_at": thread.get("created_at"),
            "updated_at": thread.get("updated_at"),
            "deleted_at": thread.get("deleted_at"),
        }

    def _public_message(self, message: dict) -> dict:
        return {
            "id": str(message["id"]),
            "thread_id": str(message["thread_id"]),
            "role": str(message["role"]),
            "content": str(message["content"]),
            "created_at": message.get("created_at"),
        }

    def _extract_message_sources(self, retrievals: list[dict] | None) -> list[dict]:
        sources: list[dict] = []
        seen_pairs: set[str] = set()
        for retrieval in retrievals or []:
            metadata = retrieval.get("metadata") or {}
            chunk_ids = metadata.get("merged_chunk_ids") or [metadata.get("chunk_id")]
            similarity_score = metadata.get("raw_score")
            rerank_score = retrieval.get("score")
            for chunk_id in chunk_ids:
                if not chunk_id:
                    continue
                try:
                    normalized_chunk_id = str(UUID(str(chunk_id)))
                except ValueError:
                    # Legacy Qdrant chunks may not have PostgreSQL-backed UUIDs yet.
                    continue
                if normalized_chunk_id in seen_pairs:
                    continue
                seen_pairs.add(normalized_chunk_id)
                sources.append(
                    {
                        "chunk_id": normalized_chunk_id,
                        "similarity_score": float(similarity_score) if similarity_score is not None else None,
                        "rerank_score": float(rerank_score) if rerank_score is not None else None,
                    }
                )
        return sources
