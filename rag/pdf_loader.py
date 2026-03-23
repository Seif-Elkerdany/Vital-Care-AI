from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from pypdf import PdfReader


@dataclass(slots=True)
class PDFDocument:
    document_id: str
    document_name: str
    source_path: str
    file_hash: str
    file_size: int
    total_pages: int
    title: str
    author: str
    pages: list[tuple[int, str]]


def _read_metadata_value(raw_metadata: Any, key: str) -> str:
    value = ""
    if raw_metadata:
        value = raw_metadata.get(key, "") or ""
    return str(value).strip()


def load_pdf(pdf_path: str | Path) -> PDFDocument:
    path = Path(pdf_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file, got: {path.name}")

    file_bytes = path.read_bytes()
    file_hash = sha256(file_bytes).hexdigest()
    document_id = str(uuid5(NAMESPACE_URL, f"{path.name}:{file_hash}"))

    reader = PdfReader(str(path))
    raw_metadata = reader.metadata or {}
    pages: list[tuple[int, str]] = []

    for page_index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append((page_index, text))

    return PDFDocument(
        document_id=document_id,
        document_name=path.name,
        source_path=str(path),
        file_hash=file_hash,
        file_size=path.stat().st_size,
        total_pages=len(reader.pages),
        title=_read_metadata_value(raw_metadata, "/Title") or path.stem,
        author=_read_metadata_value(raw_metadata, "/Author"),
        pages=pages,
    )
