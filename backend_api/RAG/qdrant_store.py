from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from .chunking import PageChunk
from .pdf_loader import PDFDocument


class QdrantRAGStore:
    def __init__(self, url: str, collection_name: str) -> None:
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http import models
        except Exception as exc:
            raise RuntimeError(
                "Qdrant support requires the `qdrant-client` package. Install RAG dependencies first."
            ) from exc

        self.collection_name = collection_name
        self.models = models
        self.client = QdrantClient(url=url)

    def ensure_collection(self, vector_size: int) -> None:
        models = self.models
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance.COSINE,
                ),
            )

        for field_name, schema in (
            ("document_id", models.PayloadSchemaType.KEYWORD),
            ("document_name", models.PayloadSchemaType.KEYWORD),
            ("file_hash", models.PayloadSchemaType.KEYWORD),
            ("chunk_id", models.PayloadSchemaType.KEYWORD),
            ("page_number", models.PayloadSchemaType.INTEGER),
            ("is_deleted", models.PayloadSchemaType.BOOL),
            ("protocol_version", models.PayloadSchemaType.INTEGER),
            ("status", models.PayloadSchemaType.KEYWORD),
            ("uploaded_at", models.PayloadSchemaType.DATETIME),
        ):
            try:
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name=field_name,
                    field_schema=schema,
                )
            except Exception:
                # Index creation is idempotent for our purposes; older clients may
                # raise if the index already exists.
                pass

    def upsert_document(
        self,
        document: PDFDocument,
        page_chunks: list[PageChunk],
        vectors: list[list[float]],
        chunk_records: list[dict[str, Any]] | None = None,
        lifecycle_payload: dict[str, Any] | None = None,
    ) -> int:
        models = self.models
        if len(page_chunks) != len(vectors):
            raise ValueError("The number of chunks must match the number of vectors.")
        if chunk_records is not None and len(chunk_records) != len(page_chunks):
            raise ValueError("Chunk metadata must match the number of page chunks.")

        self.delete_document_by_id(document.document_id)

        total_chunks = len(page_chunks)
        points: list[models.PointStruct] = []

        for chunk_index, (chunk, vector) in enumerate(zip(page_chunks, vectors)):
            chunk_record = chunk_records[chunk_index] if chunk_records is not None else None
            point_id = (
                str(chunk_record["id"])
                if chunk_record is not None
                else str(
                    uuid5(
                        NAMESPACE_URL,
                        f"{document.document_id}:{chunk.page_number}:{chunk_index}",
                    )
                )
            )
            payload = {
                "document_id": document.document_id,
                "document_name": document.document_name,
                "source_path": document.source_path,
                "title": document.title,
                "author": document.author,
                "file_hash": document.file_hash,
                "file_size": document.file_size,
                "total_pages": document.total_pages,
                "total_chunks": total_chunks,
                "page_number": chunk.page_number,
                "chunk_index": chunk_index,
                "chunk_index_in_page": chunk.chunk_index_in_page,
                "section_label": chunk.section_label,
                "chunk_id": point_id,
                "text": chunk.text,
            }
            if chunk_record is not None and chunk_record.get("metadata"):
                payload.update(
                    {
                        key: value
                        for key, value in chunk_record["metadata"].items()
                        if key not in {"text", "content"}
                    }
                )
            if lifecycle_payload:
                payload.update(
                    {
                        key: value
                        for key, value in lifecycle_payload.items()
                        if value is not None or key == "is_deleted"
                    }
                )
            points.append(models.PointStruct(id=point_id, vector=vector, payload=payload))

        if points:
            self.client.upsert(collection_name=self.collection_name, points=points)

        return total_chunks

    def delete_document_by_id(self, document_id: str) -> None:
        models = self.models
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
        )

    def delete_documents_by_name(self, document_name: str) -> None:
        models = self.models
        self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_name",
                            match=models.MatchValue(value=document_name),
                        )
                    ]
                )
            ),
        )

    def soft_delete_documents(
        self,
        document_ids: list[str],
        *,
        deleted_at: str,
        superseded_by_document_id: str,
    ) -> None:
        if not document_ids:
            return

        self.client.set_payload(
            collection_name=self.collection_name,
            payload={
                "is_deleted": True,
                "status": "archived",
                "deleted_at": deleted_at,
                "superseded_by_document_id": superseded_by_document_id,
            },
            points=self._document_ids_filter(document_ids),
        )

    def query(
        self,
        query_vector: list[float],
        limit: int,
        *,
        include_deleted: bool = False,
    ) -> list[dict[str, Any]]:
        response = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=None if include_deleted else self._active_documents_filter(),
            limit=limit,
            with_payload=True,
        )

        hits: list[dict[str, Any]] = []
        for point in response.points:
            payload = point.payload or {}
            hits.append(
                {
                    "id": point.id,
                    "score": point.score,
                    "text": payload.get("text", ""),
                    "metadata": payload,
                }
            )
        return hits

    def list_documents(self, *, include_deleted: bool = True) -> list[dict[str, Any]]:
        documents: dict[str, dict[str, Any]] = defaultdict(dict)
        next_offset = None

        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=None if include_deleted else self._active_documents_filter(),
                with_payload=True,
                with_vectors=False,
                limit=256,
                offset=next_offset,
            )

            for point in points:
                payload = point.payload or {}
                document_id = payload.get("document_id")
                if not document_id:
                    continue
                documents[document_id] = {
                    "document_id": document_id,
                    "document_name": payload.get("document_name"),
                    "title": payload.get("title"),
                    "author": payload.get("author"),
                    "source_path": payload.get("source_path"),
                    "file_hash": payload.get("file_hash"),
                    "file_size": payload.get("file_size"),
                    "total_pages": payload.get("total_pages"),
                    "total_chunks": payload.get("total_chunks"),
                    "protocol_version": payload.get("protocol_version"),
                    "uploaded_at": payload.get("uploaded_at"),
                    "is_deleted": payload.get("is_deleted", False),
                    "deleted_at": payload.get("deleted_at"),
                    "superseded_by_document_id": payload.get("superseded_by_document_id"),
                }

            if next_offset is None:
                break

        return sorted(
            documents.values(),
            key=lambda item: (
                str(item.get("document_name", "")).lower(),
                str(item.get("document_id", "")).lower(),
            ),
        )

    def _active_documents_filter(self):
        models = self.models
        return models.Filter(
            must_not=[
                models.FieldCondition(
                    key="is_deleted",
                    match=models.MatchValue(value=True),
                )
            ]
        )

    def _document_ids_filter(self, document_ids: list[str]):
        models = self.models
        conditions = [
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=document_id),
            )
            for document_id in document_ids
        ]
        if len(conditions) == 1:
            return models.Filter(must=conditions)
        return models.Filter(should=conditions)
