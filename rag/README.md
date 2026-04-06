# RAG Module

This folder contains a Qdrant-based Retrieval-Augmented Generation (RAG) module for indexing PDF files and retrieving relevant text chunks.

At the moment, this module handles:
- PDF loading
- text extraction
- chunking
- embeddings
- vector storage in Qdrant
- listing indexed documents
- deleting indexed documents by PDF name or `document_id`
- semantic retrieval of relevant chunks

It does **not** yet generate a final natural-language answer with an LLM. The current `search` flow returns the most relevant chunks and their metadata so they can be passed to an LLM later.

## Folder Contents

- `__init__.py`: package exports
- `config.py`: configuration loaded from environment variables
- `chunking.py`: text chunking utilities
- `embeddings.py`: sentence-transformer embedding wrapper
- `pdf_loader.py`: PDF reading and document-level metadata extraction
- `qdrant_store.py`: Qdrant collection, indexing, querying, listing, and deletion
- `service.py`: main service layer for add/search/list/delete operations
- `test.py`: CLI entrypoint for running the module manually
- `requirements.txt`: Python dependencies for this module

## Architecture

The indexing pipeline works like this:

1. Load a PDF from disk
2. Extract text page by page
3. Split each page into chunks
4. Create embeddings for each chunk
5. Store each chunk as a Qdrant point
6. Save strong payload metadata so each chunk is traceable to its original PDF and page

The retrieval pipeline works like this:

1. Embed the user query
2. Search Qdrant for similar vectors
3. Return the best matching chunks with metadata

## Requirements

- Python 3.10+ recommended
- Docker installed and running
- Qdrant running locally or reachable through a URL

## Install

From the project root:

```bash
pip install -r rag/requirements.txt
```

Start Qdrant:

```bash
docker compose up -d
```

The included Compose file exposes Qdrant on `http://localhost:6333`.

## Environment Variables

The module reads settings from the root `.env` file.

Current values:

```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=medical_documents
RAG_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
RAG_CHUNK_SIZE=900
RAG_CHUNK_OVERLAP=150
RAG_TOP_K=5
```

### Meaning of each variable

- `QDRANT_URL`: base URL for the Qdrant server
- `QDRANT_COLLECTION`: collection name used to store the vectors
- `RAG_EMBEDDING_MODEL`: SentenceTransformers model used for chunk and query embeddings
- `RAG_CHUNK_SIZE`: maximum chunk length in characters
- `RAG_CHUNK_OVERLAP`: overlap in characters between consecutive chunks
- `RAG_TOP_K`: default number of retrieval results

## How Document Identity Works

Each PDF gets a stable `document_id` generated from:

- the PDF file name
- the file content hash

This means:

- the same file content and same file name will produce the same `document_id`
- if the file content changes, the `document_id` changes too
- chunks from one PDF can always be grouped and deleted together

## Stored Payload Metadata

Every indexed chunk in Qdrant contains a payload like this:

```json
{
  "document_id": "...",
  "document_name": "example.pdf",
  "source_path": "C:\\full\\path\\to\\example.pdf",
  "title": "Example",
  "author": "Author Name",
  "file_hash": "...",
  "file_size": 123456,
  "total_pages": 20,
  "total_chunks": 37,
  "page_number": 4,
  "chunk_index": 9,
  "chunk_index_in_page": 2,
  "chunk_id": "document_id:9",
  "text": "The actual chunk text..."
}
```

This is important because it prevents chunks from becoming detached from their source document. Each result still knows:

- which PDF it came from
- which page it came from
- which chunk it is
- which file hash and source path produced it

## Qdrant Indexes

The module creates payload indexes for:

- `document_id`
- `document_name`
- `file_hash`
- `page_number`

These help with filtering and deletion operations.

## CLI Usage

Run commands from the project root:

```bash
python -m rag.test <command> [arguments]
```

## Run In CLI Step By Step

This is the easiest full workflow to test the module from the terminal.

### Step 1: Start Qdrant

From the project root:

```bash
docker compose up -d
```

This starts the Qdrant server on:

```text
http://localhost:6333
```

### Step 2: Install the Python dependencies

```bash
pip install -r rag/requirements.txt
```

### Step 3: Add a PDF to Qdrant

```bash
python -m rag.test add "C:\path\to\your.pdf"
```

If you want to add more than one PDF in one command:

```bash
python -m rag.test add "C:\path\to\file1.pdf" "C:\path\to\file2.pdf"
```

After indexing, the command prints JSON containing:

- `document_id`
- `document_name`
- `source_path`
- `file_hash`
- `total_pages`
- `indexed_pages`
- `total_chunks`

Save the returned `document_id` if you want exact deletion later.

### Step 4: List the indexed PDFs

```bash
python -m rag.test list
```

This shows the PDFs currently stored in the Qdrant collection. Use this if you want to:

- confirm that indexing worked
- get the `document_id`
- see how many chunks were stored for each PDF

### Step 5: Search the indexed PDFs

```bash
python -m rag.test search "What are the symptoms of diabetes?" --top-k 5
```

This returns the most relevant chunks from the indexed PDFs.

Important: this is retrieval only. It does not generate a final answer with an LLM yet.

Each result includes:

- `score`
- `text`
- `metadata`

The metadata tells you exactly which PDF and page the chunk came from.

### Step 6: Delete by PDF file name

```bash
python -m rag.test delete-name "your.pdf"
```

Use this when you want to remove all chunks that belong to a PDF with that exact file name.

### Step 7: Delete by document ID

```bash
python -m rag.test delete-id "your-document-id"
```

Use this when you want precise deletion of one indexed document record.

### Full Example Workflow

```bash
docker compose up -d
pip install -r rag/requirements.txt
python -m rag.test add "C:\docs\lecture1.pdf"
python -m rag.test list
python -m rag.test search "Explain NLP tokenization" --top-k 3
python -m rag.test delete-name "lecture1.pdf"
```

### Recommended Testing Order

When testing this module manually, use this order:

1. Start Qdrant
2. Install dependencies
3. Add one PDF
4. Run `list`
5. Run `search`
6. Run `delete-name` or `delete-id`
7. Run `list` again to confirm deletion

### Add one or more PDFs

```bash
python -m rag.test add "C:\path\to\file1.pdf" "C:\path\to\file2.pdf"
```

This command:

- reads each PDF
- extracts page text
- chunks the text
- embeds the chunks
- writes them to Qdrant

Example response:

```json
[
  {
    "document_id": "2e9d9f31-....",
    "document_name": "file1.pdf",
    "source_path": "C:\\path\\to\\file1.pdf",
    "file_hash": "....",
    "total_pages": 12,
    "indexed_pages": 12,
    "total_chunks": 28
  }
]
```

### List indexed documents

```bash
python -m rag.test list
```

This returns one item per indexed PDF, including the `document_id` you can use for exact deletion.

### Search indexed chunks

```bash
python -m rag.test search "What are the symptoms of diabetes?" --top-k 5
```

This returns relevant chunks, not a final LLM-written answer.

Each result includes:

- similarity score
- chunk text
- full metadata

### Delete by document ID

```bash
python -m rag.test delete-id "2e9d9f31-...."
```

Use this when you want exact deletion of a single indexed document version.

### Delete by PDF name

```bash
python -m rag.test delete-name "file1.pdf"
```

Use this when you want to remove all indexed chunks for a given PDF file name.

Note: if you index different files with the same name from different folders, `delete-name` will delete all of them because the filter uses `document_name`.

## Python Usage

You can also use the module directly in Python.

### Example: index and search

```python
from rag import RAGConfig, RAGService

service = RAGService(RAGConfig())

service.add_pdf(r"C:\path\to\notes.pdf")
results = service.search("Explain insulin resistance", top_k=3)

for item in results:
    print(item["score"])
    print(item["metadata"]["document_name"])
    print(item["metadata"]["page_number"])
    print(item["text"])
```

### Example: delete by id or name

```python
from rag import RAGService

service = RAGService()

service.delete_by_document_id("your-document-id")
service.delete_by_document_name("notes.pdf")
```

## Current Limitation

This module currently stops at retrieval.

That means `search()` does **not**:

- build a prompt
- call the LLM
- synthesize a final answer
- cite sources in a generated response

It only returns the most relevant PDF chunks and their metadata.

To make it a full RAG question-answering system, the next step would be:

1. call `search()`
2. build a prompt from the returned chunks
3. send that prompt to the existing LLM module
4. return a final answer with references

## Main Classes

### `RAGConfig`

Loads configuration from environment variables.

### `RAGService`

Main public entrypoint. Supports:

- `add_pdf()`
- `add_pdfs()`
- `search()`
- `list_documents()`
- `delete_by_document_id()`
- `delete_by_document_name()`

### `QdrantRAGStore`

Handles low-level Qdrant operations:

- collection creation
- payload index creation
- upsert
- delete
- scroll/list
- vector query

## Error Cases

The module will raise errors in these common cases:

- PDF path does not exist
- file is not a `.pdf`
- no extractable text was found in the PDF
- Qdrant is not running or not reachable
- required Python dependencies are not installed

## Troubleshooting

### Qdrant connection error

Make sure Qdrant is running:

```bash
docker compose up -d
```

Then check:

```bash
curl http://localhost:6333
```

### Import errors

Run commands from the repository root, not from inside the `rag` folder:

```bash
python -m rag.test list
```

### Model download issues

The first run of `sentence-transformers/all-MiniLM-L6-v2` may download model files. If that fails, check your Python environment and internet access.

If you override `RAG_EMBEDDING_MODEL` with a newer checkpoint and see an error like `Transformers does not recognize this architecture`, your installed `transformers` version is too old for that model family. Switch back to `sentence-transformers/all-MiniLM-L6-v2` or upgrade `transformers` and `sentence-transformers` together.

## Suggested Next Improvement

If you want this module to become a complete RAG QA system, the next feature should be an `answer_question()` method in `service.py` that:

- retrieves top chunks from Qdrant
- builds a context block
- calls the app's LLM module
- returns an answer with source metadata

## Summary

This module already gives you a solid document-aware retrieval layer:

- PDFs can be added
- PDFs can be listed
- PDFs can be deleted by name or id
- chunks are traceable to their source document and page
- search returns useful context for later LLM answer generation

It is a good retrieval foundation, and the remaining step for full RAG is LLM answer synthesis.
