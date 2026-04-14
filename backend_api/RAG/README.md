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

## How To Upload A Document

In this module, "upload" means adding a PDF document into the RAG index so it can be retrieved later.

### 1. Start Qdrant

From the project root:

```bash
docker compose up -d
```

By default the module uses:

```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=medical_documents
```

### 2. Install Dependencies

From the project root:

```bash
pip install -r backend_api/RAG/requirements.txt
```

### 3. Upload A PDF From The Command Line

From the project root:

```bash
python -m backend_api.RAG.cli add "/full/path/to/your-document.pdf"
```

You can upload more than one PDF in the same command:

```bash
python -m backend_api.RAG.cli add "/full/path/to/file1.pdf" "/full/path/to/file2.pdf"
```

The command returns document metadata such as:
- `document_id`
- `document_name`
- `source_path`
- `file_hash`
- `total_pages`
- `indexed_pages`
- `total_chunks`

### 4. Upload A PDF From Python

```python
from backend_api.RAG import RAGService

service = RAGService()
result = service.add_pdf("/full/path/to/your-document.pdf")
print(result)
```

To upload multiple PDFs:

```python
from backend_api.RAG import RAGService

service = RAGService()
result = service.add_pdfs(
    [
        "/full/path/to/file1.pdf",
        "/full/path/to/file2.pdf",
    ]
)
print(result)
```

## Useful Follow-Up Commands

List indexed documents:

```bash
python -m backend_api.RAG.cli list
```

Search indexed content:

```bash
python -m backend_api.RAG.cli search "septic shock fluid management" --top-k 5
```

Delete a document by id:

```bash
python -m backend_api.RAG.cli delete-id "<document_id>"
```

Delete a document by file name:

```bash
python -m backend_api.RAG.cli delete-name "your-document.pdf"
```

## Notes

- The RAG module currently indexes PDF files.
- The document must exist on disk and be reachable by the backend process.
- Uploading a document stores its chunks in Qdrant; it does not create a separate file storage service.
- If a PDF has no extractable text, indexing will fail with a validation error.
