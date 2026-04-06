from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class PageChunk:
    text: str
    page_number: int
    chunk_index_in_page: int


def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    normalized = " ".join(text.split())
    if not normalized:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(normalized)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        if end < text_length:
            split_at = normalized.rfind(" ", start, end)
            if split_at > start:
                end = split_at

        piece = normalized[start:end].strip()
        if piece:
            chunks.append(piece)

        if end >= text_length:
            break

        start = max(end - chunk_overlap, start + 1)

    return chunks


def chunk_pages(
    pages: list[tuple[int, str]],
    chunk_size: int,
    chunk_overlap: int,
) -> list[PageChunk]:
    page_chunks: list[PageChunk] = []

    for page_number, page_text in pages:
        chunks = chunk_text(
            text=page_text,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        for chunk_index_in_page, chunk in enumerate(chunks):
            page_chunks.append(
                PageChunk(
                    text=chunk,
                    page_number=page_number,
                    chunk_index_in_page=chunk_index_in_page,
                )
            )

    return page_chunks
