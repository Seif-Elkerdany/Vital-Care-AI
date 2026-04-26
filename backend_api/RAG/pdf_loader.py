from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re
from typing import Any
from uuid import NAMESPACE_URL, uuid5


@dataclass(slots=True)
class PDFPage:
    page_number: int
    text: str
    section_label: str = ""

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
    pages: list[PDFPage]


def build_document_id(document_name: str, file_hash: str) -> str:
    normalized_name = str(document_name or "").strip()
    if not normalized_name:
        raise ValueError("Document name must be non-empty.")
    normalized_hash = str(file_hash or "").strip()
    if not normalized_hash:
        raise ValueError("File hash must be non-empty.")
    return str(uuid5(NAMESPACE_URL, f"{normalized_name}:{normalized_hash}"))


def _read_metadata_value(raw_metadata: Any, key: str) -> str:
    value = ""
    if raw_metadata:
        value = raw_metadata.get(key, "") or ""
    return str(value).strip()


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _is_furniture_line(line: str) -> bool:
    lowered = _clean_line(line).lower()
    if not lowered:
        return False
    if lowered.startswith("copyright") and "all rights reserved" in lowered:
        return True
    if "www.pccmjournal.org" in lowered:
        return True
    if lowered.startswith("doi:"):
        return True
    if lowered.startswith("weiss et al"):
        return True
    if "pediatric critical care medicine" in lowered and len(lowered) < 120:
        return True
    if "volume" in lowered and "number" in lowered and len(lowered) < 80:
        return True
    if re.fullmatch(r"\d+", lowered):
        return True
    return False


def _looks_like_heading(line: str) -> bool:
    cleaned = _clean_line(line)
    if not cleaned:
        return False
    if re.match(r"^[A-Z]\.\s+", cleaned):
        return True
    if re.match(r"^(TABLE|FIGURE)\b", cleaned, flags=re.IGNORECASE):
        return True
    words = cleaned.split()
    if 1 <= len(words) <= 12:
        letters = [ch for ch in cleaned if ch.isalpha()]
        if letters:
            uppercase_ratio = sum(ch.isupper() for ch in letters) / len(letters)
            if uppercase_ratio >= 0.75:
                return True
    return False


def _extract_section_label(lines: list[str]) -> str:
    for line in lines[:12]:
        if _looks_like_heading(line):
            return _clean_line(line)[:120]
    return ""


def _normalize_page_text(raw_text: str) -> tuple[str, str]:
    text = raw_text.replace("\u00ad", "").replace("\xa0", " ")
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)

    filtered_lines: list[str] = []
    for raw_line in text.splitlines():
        line = _clean_line(raw_line)
        if not line:
            if filtered_lines and filtered_lines[-1] != "":
                filtered_lines.append("")
            continue
        if _is_furniture_line(line):
            continue
        filtered_lines.append(line)

    section_label = _extract_section_label(filtered_lines)

    paragraphs: list[str] = []
    current: list[str] = []
    for line in filtered_lines:
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if current and _looks_like_heading(line):
            paragraphs.append(" ".join(current))
            current = [line]
            continue
        current.append(line)

    if current:
        paragraphs.append(" ".join(current))

    normalized = "\n\n".join(paragraphs)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()
    return normalized, section_label


def load_pdf(
    pdf_path: str | Path,
    *,
    document_name: str | None = None,
    document_id: str | None = None,
    source_path: str | None = None,
) -> PDFDocument:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise RuntimeError(
            "PDF loading requires the `pypdf` package. Install RAG dependencies first."
        ) from exc

    path = Path(pdf_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file, got: {path.name}")

    file_bytes = path.read_bytes()
    file_hash = sha256(file_bytes).hexdigest()
    resolved_document_name = str(document_name or path.name).strip() or path.name
    resolved_document_id = str(document_id or "").strip() or build_document_id(
        resolved_document_name,
        file_hash,
    )

    reader = PdfReader(str(path))
    raw_metadata = reader.metadata or {}
    pages: list[PDFPage] = []

    for page_index, page in enumerate(reader.pages, start=1):
        text, section_label = _normalize_page_text(page.extract_text() or "")
        if text:
            pages.append(
                PDFPage(
                    page_number=page_index,
                    text=text,
                    section_label=section_label,
                )
            )

    return PDFDocument(
        document_id=resolved_document_id,
        document_name=resolved_document_name,
        source_path=str(source_path or path),
        file_hash=file_hash,
        file_size=path.stat().st_size,
        total_pages=len(reader.pages),
        title=_read_metadata_value(raw_metadata, "/Title") or path.stem,
        author=_read_metadata_value(raw_metadata, "/Author"),
        pages=pages,
    )
