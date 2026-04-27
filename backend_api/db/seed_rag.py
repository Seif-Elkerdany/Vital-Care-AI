from __future__ import annotations

from pathlib import Path


GUIDELINES_DIR = Path(__file__).parent.parent.parent / "pdf_guidelines"


def main() -> None:
    try:
        from backend_api.RAG import RAGService
        from backend_api.db.factory import build_document_catalog
    except Exception as exc:
        print(f"RAG not available, skipping guideline seed: {exc}")
        return

    try:
        document_catalog = build_document_catalog()
    except Exception as exc:
        print(f"Could not connect to database, skipping guideline seed: {exc}")
        return

    try:
        rag = RAGService(document_catalog=document_catalog)
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
            pdf_bytes = pdf.read_bytes()
            result = rag.publish_guideline(
                pdf_bytes,
                original_filename=pdf.name,
                auto_approve=True,
            )
            print(f"Indexed guideline: {pdf.name} -> {result.get('document_id')}")
        except Exception as exc:
            print(f"Failed to index {pdf.name}: {exc}")


if __name__ == "__main__":
    main()
