from __future__ import annotations

import argparse
import json

from .config import RAGConfig
from .service import RAGService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="RAG utility for PDF ingestion with Qdrant.")
    parser.add_argument(
        "--qdrant-url",
        default=RAGConfig().qdrant_url,
        help="Qdrant base URL.",
    )
    parser.add_argument(
        "--collection",
        default=RAGConfig().collection_name,
        help="Qdrant collection name.",
    )
    parser.add_argument(
        "--embedding-model",
        default=RAGConfig().embedding_model,
        help="SentenceTransformers embedding model.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Index one or more PDF files.")
    add_parser.add_argument("pdfs", nargs="+", help="PDF paths to index.")

    search_parser = subparsers.add_parser("search", help="Search indexed chunks.")
    search_parser.add_argument("query", help="Search query.")
    search_parser.add_argument("--top-k", type=int, default=5, help="Number of hits to return.")

    subparsers.add_parser("list", help="List indexed documents.")

    delete_id_parser = subparsers.add_parser(
        "delete-id",
        help="Delete an indexed document using its document_id.",
    )
    delete_id_parser.add_argument("document_id", help="Document id to delete.")

    delete_name_parser = subparsers.add_parser(
        "delete-name",
        help="Delete all indexed chunks for a PDF name.",
    )
    delete_name_parser.add_argument("document_name", help="PDF file name, e.g. report.pdf")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    config = RAGConfig(
        qdrant_url=args.qdrant_url,
        collection_name=args.collection,
        embedding_model=args.embedding_model,
    )
    service = RAGService(config)

    if args.command == "add":
        result = service.add_pdfs(args.pdfs)
        print(json.dumps(result, indent=2))
        return

    if args.command == "search":
        result = service.search(args.query, top_k=args.top_k)
        print(json.dumps(result, indent=2))
        return

    if args.command == "list":
        result = service.list_documents()
        print(json.dumps(result, indent=2))
        return

    if args.command == "delete-id":
        service.delete_by_document_id(args.document_id)
        print(json.dumps({"deleted_document_id": args.document_id}, indent=2))
        return

    if args.command == "delete-name":
        service.delete_by_document_name(args.document_name)
        print(json.dumps({"deleted_document_name": args.document_name}, indent=2))
        return

    parser.error(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    main()
