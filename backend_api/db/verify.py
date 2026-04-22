from __future__ import annotations

from datetime import datetime, timezone
import secrets
from uuid import uuid4

from .config import get_database_settings
from .connection import Database
from .migrate import apply_migrations
from .repositories import ChatRepository, DocumentRepository, UserRepository


def main() -> None:
    database = Database(get_database_settings(required=True))
    apply_migrations(database)

    users = UserRepository()
    chats = ChatRepository()
    documents = DocumentRepository()
    suffix = secrets.token_hex(4)
    now = datetime.now(timezone.utc)

    with database.transaction() as connection:
        user = users.create_user(
            connection,
            email=f"verification-{suffix}@example.com",
            password_hash="verification-password-hash",
            full_name="Verification User",
            role="doctor",
        )
        if user is None:
            raise RuntimeError("Verification user creation failed.")

        thread = chats.create_thread(
            connection,
            user_id=str(user["id"]),
            title="Verification Thread",
            summary="Smoke test for PostgreSQL chat persistence",
        )
        user_message = chats.insert_message(
            connection,
            thread_id=str(thread["id"]),
            role="user",
            content="What does the guideline recommend for first-line antibiotics?",
        )
        assistant_message = chats.insert_message(
            connection,
            thread_id=str(thread["id"]),
            role="assistant",
            content="Verification assistant response.",
        )

        document_id = str(uuid4())
        chunk_id = str(uuid4())
        documents.upsert_document(
            connection,
            document_id=document_id,
            title="Verification Guideline",
            source_type="verification",
            file_url="/tmp/verification-guideline.pdf",
            version="1",
            status="approved",
            uploaded_by=str(user["id"]),
            approved_by=str(user["id"]),
            approved_at=now,
        )
        documents.replace_chunks(
            connection,
            document_id=document_id,
            chunks=[
                {
                    "id": chunk_id,
                    "chunk_index": 0,
                    "content": "Start broad-spectrum antibiotics early.",
                    "metadata": {
                        "page_number": 1,
                        "section_label": "VERIFICATION",
                    },
                }
            ],
        )
        chats.insert_message_sources(
            connection,
            message_id=str(assistant_message["id"]),
            sources=[
                {
                    "chunk_id": chunk_id,
                    "similarity_score": 0.91,
                    "rerank_score": 0.94,
                }
            ],
        )
        chats.touch_thread(connection, thread_id=str(thread["id"]))
        history = chats.list_messages(
            connection,
            thread_id=str(thread["id"]),
            user_id=str(user["id"]),
        )

    print("Verification succeeded.")
    print(f"user_id={user['id']}")
    print(f"thread_id={thread['id']}")
    print(f"user_message_id={user_message['id']}")
    print(f"assistant_message_id={assistant_message['id']}")
    print(f"document_id={document_id}")
    print(f"chunk_id={chunk_id}")
    print(f"history_count={len(history)}")


if __name__ == "__main__":
    main()
