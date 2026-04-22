from __future__ import annotations

from typing import Iterable


class UserRepository:
    def create_user(
        self,
        connection,
        *,
        email: str,
        password_hash: str,
        full_name: str | None,
        role: str,
    ) -> dict | None:
        cursor = connection.execute(
            """
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
            RETURNING id, email, full_name, role, password_hash, created_at, updated_at
            """,
            (email, password_hash, full_name, role),
        )
        return cursor.fetchone()

    def get_by_email(self, connection, email: str) -> dict | None:
        cursor = connection.execute(
            """
            SELECT id, email, full_name, role, password_hash, created_at, updated_at
            FROM users
            WHERE email = %s
            """,
            (email,),
        )
        return cursor.fetchone()

    def get_by_id(self, connection, user_id: str) -> dict | None:
        cursor = connection.execute(
            """
            SELECT id, email, full_name, role, password_hash, created_at, updated_at
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        return cursor.fetchone()

    def promote_to_admin(self, connection, user_id: str) -> dict | None:
        cursor = connection.execute(
            """
            UPDATE users
            SET role = 'admin'
            WHERE id = %s
            RETURNING id, email, full_name, role, password_hash, created_at, updated_at
            """,
            (user_id,),
        )
        return cursor.fetchone()


class ChatRepository:
    def create_thread(
        self,
        connection,
        *,
        user_id: str,
        title: str | None,
        summary: str | None,
    ) -> dict:
        cursor = connection.execute(
            """
            INSERT INTO chat_threads (user_id, title, summary)
            VALUES (%s, %s, %s)
            RETURNING id, user_id, title, summary, created_at, updated_at, deleted_at
            """,
            (user_id, title, summary),
        )
        return cursor.fetchone()

    def list_threads(self, connection, *, user_id: str) -> list[dict]:
        cursor = connection.execute(
            """
            SELECT id, user_id, title, summary, created_at, updated_at, deleted_at
            FROM chat_threads
            WHERE user_id = %s
              AND deleted_at IS NULL
            ORDER BY updated_at DESC, created_at DESC
            """,
            (user_id,),
        )
        return list(cursor.fetchall())

    def get_thread(self, connection, *, thread_id: str, user_id: str) -> dict | None:
        cursor = connection.execute(
            """
            SELECT id, user_id, title, summary, created_at, updated_at, deleted_at
            FROM chat_threads
            WHERE id = %s
              AND user_id = %s
              AND deleted_at IS NULL
            """,
            (thread_id, user_id),
        )
        return cursor.fetchone()

    def list_messages(self, connection, *, thread_id: str, user_id: str) -> list[dict]:
        cursor = connection.execute(
            """
            SELECT m.id, m.thread_id, m.role, m.content, m.created_at
            FROM chat_messages AS m
            INNER JOIN chat_threads AS t
                ON t.id = m.thread_id
            WHERE m.thread_id = %s
              AND t.user_id = %s
              AND t.deleted_at IS NULL
            ORDER BY m.created_at ASC, m.id ASC
            """,
            (thread_id, user_id),
        )
        return list(cursor.fetchall())

    def insert_message(
        self,
        connection,
        *,
        thread_id: str,
        role: str,
        content: str,
    ) -> dict:
        cursor = connection.execute(
            """
            INSERT INTO chat_messages (thread_id, role, content)
            VALUES (%s, %s, %s)
            RETURNING id, thread_id, role, content, created_at
            """,
            (thread_id, role, content),
        )
        return cursor.fetchone()

    def touch_thread(self, connection, *, thread_id: str) -> dict | None:
        cursor = connection.execute(
            """
            UPDATE chat_threads
            SET updated_at = now()
            WHERE id = %s
            RETURNING id, user_id, title, summary, created_at, updated_at, deleted_at
            """,
            (thread_id,),
        )
        return cursor.fetchone()

    def insert_message_sources(
        self,
        connection,
        *,
        message_id: str,
        sources: Iterable[dict],
    ) -> None:
        rows = [
            (
                message_id,
                source["chunk_id"],
                source.get("similarity_score"),
                source.get("rerank_score"),
            )
            for source in sources
        ]
        if not rows:
            return

        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO message_sources (message_id, chunk_id, similarity_score, rerank_score)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (message_id, chunk_id) DO UPDATE
                SET similarity_score = EXCLUDED.similarity_score,
                    rerank_score = EXCLUDED.rerank_score
                """,
                rows,
            )


class DocumentRepository:
    def upsert_document(
        self,
        connection,
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
    ) -> dict:
        cursor = connection.execute(
            """
            INSERT INTO documents (
                id,
                title,
                source_type,
                file_url,
                version,
                status,
                uploaded_by,
                approved_by,
                approved_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET title = EXCLUDED.title,
                source_type = EXCLUDED.source_type,
                file_url = EXCLUDED.file_url,
                version = EXCLUDED.version,
                status = EXCLUDED.status,
                uploaded_by = EXCLUDED.uploaded_by,
                approved_by = EXCLUDED.approved_by,
                approved_at = EXCLUDED.approved_at
            RETURNING id, title, source_type, file_url, version, status, uploaded_by, approved_by, approved_at, created_at
            """,
            (
                document_id,
                title,
                source_type,
                file_url,
                version,
                status,
                uploaded_by,
                approved_by,
                approved_at,
            ),
        )
        return cursor.fetchone()

    def replace_chunks(
        self,
        connection,
        *,
        document_id: str,
        chunks: Iterable[dict],
    ) -> None:
        try:
            from psycopg.types.json import Jsonb
        except Exception as exc:
            raise RuntimeError(
                "PostgreSQL JSON support requires the `psycopg` package. Install backend dependencies first."
            ) from exc

        connection.execute(
            "DELETE FROM document_chunks WHERE document_id = %s",
            (document_id,),
        )

        rows = [
            (
                chunk["id"],
                document_id,
                chunk["chunk_index"],
                chunk["content"],
                Jsonb(chunk.get("metadata") or {}),
            )
            for chunk in chunks
        ]
        if not rows:
            return

        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO document_chunks (id, document_id, chunk_index, content, metadata)
                VALUES (%s, %s, %s, %s, %s)
                """,
                rows,
            )

    def list_documents(self, connection, *, include_archived: bool) -> list[dict]:
        if include_archived:
            cursor = connection.execute(
                """
                SELECT id, title, source_type, file_url, version, status, uploaded_by, approved_by, approved_at, created_at
                FROM documents
                ORDER BY created_at DESC, id DESC
                """
            )
            return list(cursor.fetchall())

        cursor = connection.execute(
            """
            SELECT id, title, source_type, file_url, version, status, uploaded_by, approved_by, approved_at, created_at
            FROM documents
            WHERE status <> 'archived'
            ORDER BY created_at DESC, id DESC
            """
        )
        return list(cursor.fetchall())

    def list_approved_document_ids(self, connection) -> list[str]:
        cursor = connection.execute(
            """
            SELECT id
            FROM documents
            WHERE status = 'approved'
            ORDER BY created_at DESC
            """
        )
        return [str(row["id"]) for row in cursor.fetchall()]

    def archive_documents(self, connection, *, document_ids: list[str]) -> None:
        if not document_ids:
            return
        connection.execute(
            """
            UPDATE documents
            SET status = 'archived'
            WHERE id = ANY(%s)
            """,
            (document_ids,),
        )

    def approve_document(self, connection, *, document_id: str, approved_by: str) -> dict | None:
        cursor = connection.execute(
            """
            UPDATE documents
            SET status = 'approved',
                approved_by = %s,
                approved_at = now()
            WHERE id = %s
            RETURNING id, title, source_type, file_url, version, status, uploaded_by, approved_by, approved_at, created_at
            """,
            (approved_by, document_id),
        )
        return cursor.fetchone()

    def get_document(self, connection, *, document_id: str) -> dict | None:
        cursor = connection.execute(
            """
            SELECT id, title, source_type, file_url, version, status, uploaded_by, approved_by, approved_at, created_at
            FROM documents
            WHERE id = %s
            """,
            (document_id,),
        )
        return cursor.fetchone()


class InvitationRepository:
    def create_invitation(
        self,
        connection,
        *,
        email: str,
        token_hash: str,
        invited_by: str,
        expires_at,
    ) -> dict | None:
        cursor = connection.execute(
            """
            INSERT INTO admin_invitations (email, token_hash, invited_by, expires_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id, email, token_hash, invited_by, accepted_user_id, expires_at, accepted_at, revoked_at, created_at
            """,
            (email, token_hash, invited_by, expires_at),
        )
        return cursor.fetchone()

    def get_by_token_hash(self, connection, *, token_hash: str) -> dict | None:
        cursor = connection.execute(
            """
            SELECT id, email, token_hash, invited_by, accepted_user_id, expires_at, accepted_at, revoked_at, created_at
            FROM admin_invitations
            WHERE token_hash = %s
            """,
            (token_hash,),
        )
        return cursor.fetchone()

    def mark_accepted(
        self,
        connection,
        *,
        invitation_id: str,
        accepted_user_id: str,
    ) -> dict | None:
        cursor = connection.execute(
            """
            UPDATE admin_invitations
            SET accepted_user_id = %s,
                accepted_at = now()
            WHERE id = %s
            RETURNING id, email, token_hash, invited_by, accepted_user_id, expires_at, accepted_at, revoked_at, created_at
            """,
            (accepted_user_id, invitation_id),
        )
        return cursor.fetchone()
