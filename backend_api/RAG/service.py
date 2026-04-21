from __future__ import annotations

import calendar
import logging
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Callable
from uuid import NAMESPACE_URL, uuid5

from .chunking import chunk_pages
from .config import RAGConfig
from .embeddings import EmbeddingModel
from .pdf_loader import load_pdf
from .qdrant_store import QdrantRAGStore

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(
        self,
        config: RAGConfig | None = None,
        *,
        embedding_model: EmbeddingModel | None = None,
        store: QdrantRAGStore | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config or RAGConfig()
        self.embedding_model = embedding_model or EmbeddingModel(self.config.embedding_model)
        self.store = store or QdrantRAGStore(
            url=self.config.qdrant_url,
            collection_name=self.config.collection_name,
        )
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.store.ensure_collection(vector_size=self.embedding_model.dimension)

    def add_pdf(self, pdf_path: str | Path) -> dict[str, Any]:
        document = load_pdf(pdf_path)
        return self._index_document(
            document,
            lifecycle_payload={"is_deleted": False},
        )

    def publish_guideline(self, pdf_bytes: bytes, *, original_filename: str) -> dict[str, Any]:
        if not pdf_bytes:
            raise ValueError("Uploaded PDF must not be empty.")

        normalized_name = self._normalize_document_name(original_filename)
        if Path(normalized_name).suffix.lower() != ".pdf":
            raise ValueError("Only PDF uploads are supported.")

        all_documents = self.store.list_documents(include_deleted=True)
        active_documents = [doc for doc in all_documents if not self._document_is_deleted(doc)]
        legacy_active_documents = [
            doc for doc in active_documents if doc.get("protocol_version") in (None, "")
        ]
        if len(legacy_active_documents) > 1:
            raise RuntimeError(
                "Cannot publish guideline: multiple active legacy guidelines exist. "
                "Clean them up before uploading a managed guideline version."
            )

        uploaded_at_dt = self._now_utc()
        uploaded_at = self._serialize_datetime(uploaded_at_dt)
        file_hash = sha256(pdf_bytes).hexdigest()
        document_id = str(uuid5(NAMESPACE_URL, f"{normalized_name}:{file_hash}:{uploaded_at}"))
        stored_path = self._guideline_storage_path(document_id)

        try:
            stored_path.parent.mkdir(parents=True, exist_ok=True)
            stored_path.write_bytes(pdf_bytes)
        except Exception as exc:
            raise RuntimeError(f"Failed to persist uploaded guideline PDF: {exc}") from exc

        try:
            document = load_pdf(
                stored_path,
                document_name=normalized_name,
                document_id=document_id,
            )
        except Exception:
            if stored_path.exists():
                stored_path.unlink()
            raise

        protocol_version = self._next_protocol_version(
            documents=all_documents,
            legacy_active_documents=legacy_active_documents,
        )
        active_document_ids = [
            str(doc.get("document_id"))
            for doc in active_documents
            if doc.get("document_id") and doc.get("document_id") != document.document_id
        ]

        try:
            result = self._index_document(
                document,
                lifecycle_payload={
                    "protocol_version": protocol_version,
                    "uploaded_at": uploaded_at,
                    "is_deleted": False,
                },
            )
        except Exception:
            if stored_path.exists():
                stored_path.unlink()
            raise

        if active_document_ids:
            self.store.soft_delete_documents(
                active_document_ids,
                deleted_at=uploaded_at,
                superseded_by_document_id=document.document_id,
            )

        logger.info(
            "Approved guideline update document_id=%s protocol_version=%s uploaded_at=%s superseded_document_ids=%s",
            document.document_id,
            protocol_version,
            uploaded_at,
            active_document_ids,
        )

        publish_result = {
            **result,
            "protocol_version": protocol_version,
            "uploaded_at": uploaded_at,
            "is_deleted": False,
            "deleted_at": None,
            "superseded_by_document_id": None,
            "superseded_document_ids": active_document_ids,
        }
        return self._decorate_document_record(publish_result, reference_now=uploaded_at_dt)

    def add_pdfs(self, pdf_paths: list[str | Path]) -> list[dict[str, Any]]:
        return [self.add_pdf(pdf_path) for pdf_path in pdf_paths]

    def delete_by_document_id(self, document_id: str) -> None:
        self.store.delete_document_by_id(document_id)

    def delete_by_document_name(self, document_name: str) -> None:
        self.store.delete_documents_by_name(document_name)

    def search(self, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
        query_vector = self.embedding_model.embed_query(query)
        return self.store.query(
            query_vector,
            limit=top_k or self.config.top_k,
            include_deleted=False,
        )

    def list_documents(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        now = self._now_utc()
        return [
            self._decorate_document_record(document, reference_now=now)
            for document in self.store.list_documents(include_deleted=include_deleted)
        ]

    def _index_document(
        self,
        document,
        *,
        lifecycle_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        page_chunks = chunk_pages(
            pages=document.pages,
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
        )
        if not page_chunks:
            raise ValueError(
                f"No extractable text was found in PDF: {document.document_name}"
            )

        vectors = self.embedding_model.embed_documents([chunk.text for chunk in page_chunks])
        chunk_count = self.store.upsert_document(
            document=document,
            page_chunks=page_chunks,
            vectors=vectors,
            lifecycle_payload=lifecycle_payload,
        )

        return {
            "document_id": document.document_id,
            "document_name": document.document_name,
            "source_path": document.source_path,
            "file_hash": document.file_hash,
            "total_pages": document.total_pages,
            "indexed_pages": len(document.pages),
            "total_chunks": chunk_count,
        }

    def _next_protocol_version(
        self,
        *,
        documents: list[dict[str, Any]],
        legacy_active_documents: list[dict[str, Any]],
    ) -> int:
        managed_versions: list[int] = []
        for document in documents:
            version = document.get("protocol_version")
            if isinstance(version, int):
                managed_versions.append(version)
                continue
            if isinstance(version, str) and version.strip().isdigit():
                managed_versions.append(int(version.strip()))

        if managed_versions:
            return max(managed_versions) + 1
        if len(legacy_active_documents) == 1:
            return 2
        return 1

    def _guideline_storage_path(self, document_id: str) -> Path:
        upload_dir = Path(self.config.guideline_upload_dir).expanduser().resolve()
        return upload_dir / f"{document_id}.pdf"

    def _normalize_document_name(self, original_filename: str) -> str:
        normalized_name = Path(str(original_filename or "")).name.strip()
        if not normalized_name:
            raise ValueError("Uploaded file name must be non-empty.")
        return normalized_name

    def _decorate_document_record(
        self,
        document: dict[str, Any],
        *,
        reference_now: datetime | None = None,
    ) -> dict[str, Any]:
        record = dict(document)
        uploaded_at = self._parse_datetime(record.get("uploaded_at"))
        deleted_at = self._parse_datetime(record.get("deleted_at"))
        is_deleted = self._document_is_deleted(record)
        now = reference_now or self._now_utc()

        is_stale = False
        notification_message = None
        if uploaded_at is not None:
            stale_after = self._add_months(uploaded_at, self.config.guideline_stale_months)
            is_stale = now >= stale_after
            if is_stale and not is_deleted:
                notification_message = (
                    "The active guideline is older than "
                    f"{self.config.guideline_stale_months} months."
                )

        record["uploaded_at"] = self._serialize_datetime(uploaded_at)
        record["is_deleted"] = is_deleted
        record["deleted_at"] = self._serialize_datetime(deleted_at)
        record["is_stale"] = is_stale
        record["stale_threshold_months"] = self.config.guideline_stale_months
        record["notification_message"] = notification_message
        return record

    def _document_is_deleted(self, document: dict[str, Any]) -> bool:
        value = document.get("is_deleted", False)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes"}
        return bool(value)

    def _now_utc(self) -> datetime:
        current = self._clock()
        if current.tzinfo is None:
            return current.replace(tzinfo=timezone.utc)
        return current.astimezone(timezone.utc)

    def _parse_datetime(self, value: Any) -> datetime | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _serialize_datetime(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.astimezone(timezone.utc).replace(microsecond=0).isoformat()

    def _add_months(self, value: datetime, months: int) -> datetime:
        total_months = (value.year * 12 + (value.month - 1)) + months
        year = total_months // 12
        month = total_months % 12 + 1
        day = min(value.day, calendar.monthrange(year, month)[1])
        return value.replace(year=year, month=month, day=day)
