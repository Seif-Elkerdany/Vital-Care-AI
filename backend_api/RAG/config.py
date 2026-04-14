from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass(slots=True)
class RAGConfig:
    qdrant_url: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    collection_name: str = os.getenv("QDRANT_COLLECTION", "medical_documents")
    embedding_model: str = os.getenv(
        "RAG_EMBEDDING_MODEL",
        "sentence-transformers/embeddinggemma-300m-medical",
    )
    chunk_size: int = int(os.getenv("RAG_CHUNK_SIZE", "600"))
    chunk_overlap: int = int(os.getenv("RAG_CHUNK_OVERLAP", "120"))
    top_k: int = int(os.getenv("RAG_TOP_K", "5"))
