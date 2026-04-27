from __future__ import annotations

from pathlib import Path


GUIDELINES_DIR = Path(__file__).parent.parent.parent / "pdf_guidelines"


def main() -> None:
    try:
        from backend_api.RAG import RAGService
    except Exception as exc:
        print(f"RAG not available, skipping guideline seed: {exc}")
        return

    try:
        rag = RAGService()
    except Exception as exc:
        print(f"Could not connect to Qdrant, skipping guideline seed: {exc}")
        return

    existing = rag.list_documents(include_deleted=False)
    if existing:
        print(f"Qdrant already has {len(existing)} guideline(s), skipping seed.")
        return

    pdfs = list(GUIDELINES_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {GUIDELINES_DIR}, skipping guideline seed.")
        return

    for pdf in pdfs:
        try:
            result = rag.add_pdf(pdf)
            print(f"Indexed guideline: {pdf.name} -> {result.get('document_id')}")
        except Exception as exc:
            print(f"Failed to index {pdf.name}: {exc}")


if __name__ == "__main__":
    main()
