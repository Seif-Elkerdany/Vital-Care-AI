from __future__ import annotations

from pathlib import Path
from typing import Any

from .chunking import chunk_pages
from .config import RAGConfig
from .embeddings import EmbeddingModel
from .pdf_loader import load_pdf
from .qdrant_store import QdrantRAGStore


class RAGService:
    def __init__(self, config: RAGConfig | None = None) -> None:
        self.config = config or RAGConfig()
        self.embedding_model = EmbeddingModel(self.config.embedding_model)
        self.store = QdrantRAGStore(
            url=self.config.qdrant_url,
            collection_name=self.config.collection_name,
        )
        self.store.ensure_collection(vector_size=self.embedding_model.dimension)

    def add_pdf(self, pdf_path: str | Path) -> dict[str, Any]:
        document = load_pdf(pdf_path)
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

    def add_pdfs(self, pdf_paths: list[str | Path]) -> list[dict[str, Any]]:
        return [self.add_pdf(pdf_path) for pdf_path in pdf_paths]

    def delete_by_document_id(self, document_id: str) -> None:
        self.store.delete_document_by_id(document_id)

    def delete_by_document_name(self, document_name: str) -> None:
        self.store.delete_documents_by_name(document_name)

    def search(self, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
        query_vector = self.embedding_model.embed_query(query)
        return self.store.query(query_vector, limit=top_k or self.config.top_k)

    def list_documents(self) -> list[dict[str, Any]]:
        return self.store.list_documents()
