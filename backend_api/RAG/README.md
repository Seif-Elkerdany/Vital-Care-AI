# RAG Module

This module contains the retrieval layer for MedAPP.

It is responsible for:
- loading PDF files
- extracting page text
- chunking content
- generating embeddings
- storing vectors in Qdrant
- retrieving relevant chunks for the LLM layer

Main files:
- `config.py`: environment-driven RAG settings
- `pdf_loader.py`: PDF parsing and document metadata
- `chunking.py`: page chunking helpers
- `embeddings.py`: embedding model wrapper
- `qdrant_store.py`: Qdrant persistence and search
- `service.py`: main service API for add, list, search, and delete
- `cli.py`: command-line entrypoint for manual RAG operations

This module provides retrieval results to `backend_api.LLM` and is instantiated by the backend bootstrap wiring.
