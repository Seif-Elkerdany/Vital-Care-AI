from __future__ import annotations

from dataclasses import dataclass
import re

from .pdf_loader import PDFPage


@dataclass(slots=True)
class PageChunk:
    text: str
    page_number: int
    chunk_index_in_page: int
    section_label: str = ""


_SENTENCE_BREAK_RE = re.compile(r"(?<=[.!?])\s+")


def _split_sentences(text: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE_BREAK_RE.split(text) if part.strip()]
    return sentences or [text.strip()]


def _split_long_unit(text: str, chunk_size: int) -> list[str]:
    words = text.split()
    if not words:
        return []

    parts: list[str] = []
    current: list[str] = []
    current_len = 0

    for word in words:
        addition = len(word) if not current else len(word) + 1
        if current and current_len + addition > chunk_size:
            parts.append(" ".join(current))
            current = [word]
            current_len = len(word)
            continue
        current.append(word)
        current_len += addition

    if current:
        parts.append(" ".join(current))

    return parts


def _prepare_units(text: str, chunk_size: int) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    units: list[str] = []

    for paragraph in paragraphs:
        if len(paragraph) <= chunk_size:
            units.append(paragraph)
            continue
        for sentence in _split_sentences(paragraph):
            if len(sentence) <= chunk_size:
                units.append(sentence)
            else:
                units.extend(_split_long_unit(sentence, chunk_size))

    return units


def _join_units(units: list[str]) -> str:
    return " ".join(unit.strip() for unit in units if unit.strip())


def _overlap_tail(units: list[str], chunk_overlap: int) -> list[str]:
    if not units or chunk_overlap <= 0:
        return []

    tail: list[str] = []
    total = 0
    for unit in reversed(units):
        tail.insert(0, unit)
        total += len(unit) + 1
        if total >= chunk_overlap:
            break
    return tail


def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    normalized = text.strip()
    if not normalized:
        return []

    units = _prepare_units(normalized, chunk_size)
    if not units:
        return []

    chunks: list[str] = []
    current_units: list[str] = []
    current_len = 0

    for unit in units:
        addition = len(unit) if not current_units else len(unit) + 1
        if current_units and current_len + addition > chunk_size:
            chunk = _join_units(current_units)
            if chunk:
                chunks.append(chunk)
            current_units = _overlap_tail(current_units, chunk_overlap)
            current_len = len(_join_units(current_units))
            addition = len(unit) if not current_units else len(unit) + 1

        current_units.append(unit)
        current_len += addition

    if current_units:
        chunk = _join_units(current_units)
        if chunk:
            chunks.append(chunk)

    return chunks


def chunk_pages(
    pages: list[PDFPage],
    chunk_size: int,
    chunk_overlap: int,
) -> list[PageChunk]:
    page_chunks: list[PageChunk] = []

    for page in pages:
        chunks = chunk_text(
            text=page.text,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        for chunk_index_in_page, chunk in enumerate(chunks):
            page_chunks.append(
                PageChunk(
                    text=chunk,
                    page_number=page.page_number,
                    chunk_index_in_page=chunk_index_in_page,
                    section_label=page.section_label,
                )
            )

    return page_chunks
