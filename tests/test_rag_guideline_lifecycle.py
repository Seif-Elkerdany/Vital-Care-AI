import tempfile
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend_api.RAG.config import RAGConfig
from backend_api.RAG.pdf_loader import PDFDocument, PDFPage
from backend_api.RAG.qdrant_store import QdrantRAGStore
from backend_api.RAG.service import RAGService

try:
    from fastapi.testclient import TestClient
    from backend_api.STT.api import create_app as create_stt_app
except Exception:
    TestClient = None
    create_stt_app = None

try:
    import multipart  # noqa: F401
except Exception:
    multipart = None


class FakeEmbeddingModel:
    dimension = 3

    def __init__(self):
        self.document_batches = []
        self.queries = []

    def embed_documents(self, texts):
        self.document_batches.append(list(texts))
        return [[float(index + 1)] * self.dimension for index, _ in enumerate(texts)]

    def embed_query(self, query):
        self.queries.append(query)
        return [0.25, 0.5, 0.75]


class FakeStore:
    def __init__(self, documents=None, query_results=None):
        self.documents = [dict(document) for document in (documents or [])]
        self.query_results = list(query_results or [])
        self.vector_sizes = []
        self.upsert_calls = []
        self.soft_delete_calls = []
        self.query_calls = []

    def ensure_collection(self, vector_size):
        self.vector_sizes.append(vector_size)

    def upsert_document(self, *, document, page_chunks, vectors, lifecycle_payload=None):
        self.upsert_calls.append(
            {
                "document": document,
                "page_chunks": list(page_chunks),
                "vectors": list(vectors),
                "lifecycle_payload": dict(lifecycle_payload or {}),
            }
        )
        self.documents = [
            existing
            for existing in self.documents
            if existing.get("document_id") != document.document_id
        ]
        self.documents.append(
            {
                "document_id": document.document_id,
                "document_name": document.document_name,
                "source_path": document.source_path,
                "file_hash": document.file_hash,
                "total_pages": document.total_pages,
                "total_chunks": len(page_chunks),
                "protocol_version": (lifecycle_payload or {}).get("protocol_version"),
                "uploaded_at": (lifecycle_payload or {}).get("uploaded_at"),
                "is_deleted": (lifecycle_payload or {}).get("is_deleted", False),
                "deleted_at": (lifecycle_payload or {}).get("deleted_at"),
                "superseded_by_document_id": (lifecycle_payload or {}).get(
                    "superseded_by_document_id"
                ),
            }
        )
        return len(page_chunks)

    def list_documents(self, *, include_deleted=True):
        documents = [dict(document) for document in self.documents]
        if include_deleted:
            return documents
        return [document for document in documents if not document.get("is_deleted", False)]

    def soft_delete_documents(self, document_ids, *, deleted_at, superseded_by_document_id):
        self.soft_delete_calls.append(
            {
                "document_ids": list(document_ids),
                "deleted_at": deleted_at,
                "superseded_by_document_id": superseded_by_document_id,
            }
        )
        for document in self.documents:
            if document.get("document_id") in document_ids:
                document["is_deleted"] = True
                document["deleted_at"] = deleted_at
                document["superseded_by_document_id"] = superseded_by_document_id

    def query(self, query_vector, limit, *, include_deleted=False):
        self.query_calls.append(
            {
                "query_vector": list(query_vector),
                "limit": limit,
                "include_deleted": include_deleted,
            }
        )
        if include_deleted:
            return list(self.query_results)
        return [
            result
            for result in self.query_results
            if not (result.get("metadata") or {}).get("is_deleted", False)
        ]

    def delete_document_by_id(self, document_id):
        self.documents = [
            document
            for document in self.documents
            if document.get("document_id") != document_id
        ]

    def delete_documents_by_name(self, document_name):
        self.documents = [
            document
            for document in self.documents
            if document.get("document_name") != document_name
        ]


def make_pdf_document(path, *, document_name, document_id):
    resolved_path = Path(path).resolve()
    return PDFDocument(
        document_id=document_id,
        document_name=document_name,
        source_path=str(resolved_path),
        file_hash="new-guideline-hash",
        file_size=resolved_path.stat().st_size,
        total_pages=1,
        title="Guideline",
        author="Clinic Admin",
        pages=[
            PDFPage(
                page_number=1,
                text="Start antibiotics within one hour and measure lactate early.",
                section_label="GUIDELINE",
            )
        ],
    )


class GuidelineLifecycleServiceTests(unittest.TestCase):
    def make_service(self, *, store, upload_dir, clock):
        config = RAGConfig(
            guideline_upload_dir=upload_dir,
            guideline_stale_months=24,
        )
        return RAGService(
            config=config,
            embedding_model=FakeEmbeddingModel(),
            store=store,
            clock=clock,
        )

    def test_publish_guideline_logs_approved_update_and_records_protocol_version(self):
        fixed_now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
        store = FakeStore(
            documents=[
                {
                    "document_id": "doc-old",
                    "document_name": "legacy.pdf",
                    "source_path": "/tmp/legacy.pdf",
                    "file_hash": "old-hash",
                    "total_pages": 1,
                    "total_chunks": 1,
                    "protocol_version": 2,
                    "uploaded_at": "2025-01-01T00:00:00+00:00",
                    "is_deleted": False,
                }
            ]
        )

        with tempfile.TemporaryDirectory() as tmpdir, patch(
            "backend_api.RAG.service.load_pdf",
            side_effect=lambda path, **kwargs: make_pdf_document(
                path,
                document_name=kwargs["document_name"],
                document_id=kwargs["document_id"],
            ),
        ), self.assertLogs("backend_api.RAG.service", level="INFO") as logs:
            service = self.make_service(
                store=store,
                upload_dir=tmpdir,
                clock=lambda: fixed_now,
            )
            result = service.publish_guideline(
                b"%PDF-1.4 test upload",
                original_filename="sepsis-guideline.pdf",
            )
            self.assertTrue(Path(result["source_path"]).is_file())

        self.assertEqual(result["protocol_version"], 3)
        self.assertEqual(result["uploaded_at"], "2026-04-21T12:00:00+00:00")
        self.assertEqual(result["superseded_document_ids"], ["doc-old"])
        self.assertIn("protocol_version=3", logs.output[0])
        self.assertIn("doc-old", logs.output[0])

    def test_publish_guideline_soft_deletes_old_data_and_hides_it_by_default(self):
        fixed_now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
        store = FakeStore(
            documents=[
                {
                    "document_id": "doc-legacy",
                    "document_name": "legacy.pdf",
                    "source_path": "/tmp/legacy.pdf",
                    "file_hash": "legacy-hash",
                    "total_pages": 1,
                    "total_chunks": 1,
                    "protocol_version": None,
                    "uploaded_at": None,
                    "is_deleted": False,
                }
            ],
            query_results=[
                {
                    "id": "hit-deleted",
                    "score": 0.9,
                    "text": "Legacy deleted result",
                    "metadata": {"document_id": "doc-legacy", "is_deleted": True},
                },
                {
                    "id": "hit-active",
                    "score": 0.8,
                    "text": "Active result",
                    "metadata": {"document_id": "doc-new", "is_deleted": False},
                },
            ],
        )

        with tempfile.TemporaryDirectory() as tmpdir, patch(
            "backend_api.RAG.service.load_pdf",
            side_effect=lambda path, **kwargs: make_pdf_document(
                path,
                document_name=kwargs["document_name"],
                document_id=kwargs["document_id"],
            ),
        ):
            service = self.make_service(
                store=store,
                upload_dir=tmpdir,
                clock=lambda: fixed_now,
            )
            result = service.publish_guideline(
                b"%PDF-1.4 managed upload",
                original_filename="managed-guideline.pdf",
            )

        self.assertEqual(result["protocol_version"], 2)
        self.assertEqual(store.soft_delete_calls[0]["document_ids"], ["doc-legacy"])
        active_documents = service.list_documents()
        self.assertEqual(len(active_documents), 1)
        self.assertEqual(active_documents[0]["document_id"], result["document_id"])

        all_documents = service.list_documents(include_deleted=True)
        deleted_document = next(
            item for item in all_documents if item["document_id"] == "doc-legacy"
        )
        self.assertTrue(deleted_document["is_deleted"])
        self.assertEqual(deleted_document["deleted_at"], "2026-04-21T12:00:00+00:00")
        self.assertEqual(
            deleted_document["superseded_by_document_id"],
            result["document_id"],
        )

        hits = service.search("latest guideline")
        self.assertEqual([hit["id"] for hit in hits], ["hit-active"])
        self.assertFalse(store.query_calls[-1]["include_deleted"])

    def test_list_documents_flags_stale_guideline_by_upload_age(self):
        fixed_now = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
        store = FakeStore(
            documents=[
                {
                    "document_id": "doc-stale",
                    "document_name": "stale.pdf",
                    "source_path": "/tmp/stale.pdf",
                    "file_hash": "stale-hash",
                    "total_pages": 1,
                    "total_chunks": 1,
                    "protocol_version": 1,
                    "uploaded_at": "2023-01-01T00:00:00+00:00",
                    "is_deleted": False,
                },
                {
                    "document_id": "doc-fresh",
                    "document_name": "fresh.pdf",
                    "source_path": "/tmp/fresh.pdf",
                    "file_hash": "fresh-hash",
                    "total_pages": 1,
                    "total_chunks": 1,
                    "protocol_version": 2,
                    "uploaded_at": "2025-12-01T00:00:00+00:00",
                    "is_deleted": False,
                },
            ]
        )
        service = self.make_service(
            store=store,
            upload_dir="/tmp/guidelines",
            clock=lambda: fixed_now,
        )

        documents = service.list_documents()
        stale_document = next(item for item in documents if item["document_id"] == "doc-stale")
        fresh_document = next(item for item in documents if item["document_id"] == "doc-fresh")

        self.assertTrue(stale_document["is_stale"])
        self.assertIn("older than 24 months", stale_document["notification_message"])
        self.assertFalse(fresh_document["is_stale"])
        self.assertIsNone(fresh_document["notification_message"])


class QdrantStoreLifecycleTests(unittest.TestCase):
    def make_store(self, client):
        from qdrant_client.http import models

        store = object.__new__(QdrantRAGStore)
        store.collection_name = "test-collection"
        store.models = models
        store.client = client
        return store

    def test_query_list_and_soft_delete_use_soft_delete_filters(self):
        client = types.SimpleNamespace()
        client.query_filter = None
        client.scroll_filter = None
        client.set_payload_kwargs = None

        def query_points(**kwargs):
            client.query_filter = kwargs.get("query_filter")
            return types.SimpleNamespace(
                points=[
                    types.SimpleNamespace(
                        id="point-1",
                        score=0.9,
                        payload={"text": "chunk", "document_id": "doc-1"},
                    )
                ]
            )

        def scroll(**kwargs):
            client.scroll_filter = kwargs.get("scroll_filter")
            return (
                [
                    types.SimpleNamespace(
                        payload={
                            "document_id": "doc-1",
                            "document_name": "guideline.pdf",
                            "is_deleted": False,
                        }
                    )
                ],
                None,
            )

        def set_payload(**kwargs):
            client.set_payload_kwargs = kwargs
            return types.SimpleNamespace(status="ok")

        client.query_points = query_points
        client.scroll = scroll
        client.set_payload = set_payload

        store = self.make_store(client)
        store.query([0.1, 0.2, 0.3], limit=5)
        store.list_documents(include_deleted=False)
        store.soft_delete_documents(
            ["doc-1", "doc-2"],
            deleted_at="2026-04-21T12:00:00+00:00",
            superseded_by_document_id="doc-3",
        )

        self.assertIsNotNone(client.query_filter)
        self.assertEqual(client.query_filter.must_not[0].key, "is_deleted")
        self.assertTrue(client.query_filter.must_not[0].match.value)
        self.assertIsNotNone(client.scroll_filter)
        self.assertEqual(client.scroll_filter.must_not[0].key, "is_deleted")
        self.assertEqual(client.set_payload_kwargs["payload"]["is_deleted"], True)
        self.assertEqual(
            client.set_payload_kwargs["payload"]["superseded_by_document_id"],
            "doc-3",
        )
        self.assertEqual(len(client.set_payload_kwargs["points"].should), 2)


@unittest.skipIf(
    TestClient is None or create_stt_app is None or multipart is None,
    "FastAPI test client or multipart dependency unavailable",
)
class GuidelineAdminApiTests(unittest.TestCase):
    class FakeSTTService:
        def start_hotkey_listener(self):
            return None

        def stop_hotkey_listener(self):
            return None

        def latest(self):
            return None

        def status(self):
            return types.SimpleNamespace(
                recording=False,
                transcribing=False,
                last_event="idle",
                last_error=None,
                latest_text=None,
            )

        def toggle_recording(self):
            return "busy"

        def list_items(self, limit=20):
            del limit
            return []

        def process_text_input(self, text):
            del text
            raise NotImplementedError

        def generate_steps(self, text):
            del text
            raise RuntimeError("not configured")

        def latest_response_audio(self):
            return None

        def latest_response_audio_mp3(self):
            return None

    class FakeAdminRAGService:
        def __init__(self):
            self.publish_calls = []
            self.list_calls = []

        def publish_guideline(self, payload, *, original_filename):
            self.publish_calls.append((payload, original_filename))
            return {
                "document_id": "doc-10",
                "document_name": original_filename,
                "source_path": "/tmp/doc-10.pdf",
                "file_hash": "hash-10",
                "total_pages": 1,
                "indexed_pages": 1,
                "total_chunks": 1,
                "protocol_version": 4,
                "uploaded_at": "2026-04-21T12:00:00+00:00",
                "is_deleted": False,
                "deleted_at": None,
                "superseded_by_document_id": None,
                "superseded_document_ids": ["doc-9"],
                "is_stale": False,
                "stale_threshold_months": 24,
                "notification_message": None,
            }

        def list_documents(self, *, include_deleted=False):
            self.list_calls.append(include_deleted)
            return [
                {
                    "document_id": "doc-10",
                    "document_name": "guideline.pdf",
                    "source_path": "/tmp/doc-10.pdf",
                    "file_hash": "hash-10",
                    "total_pages": 1,
                    "total_chunks": 1,
                    "protocol_version": 4,
                    "uploaded_at": "2023-01-01T00:00:00+00:00",
                    "is_deleted": False,
                    "deleted_at": None,
                    "superseded_by_document_id": None,
                    "is_stale": True,
                    "stale_threshold_months": 24,
                    "notification_message": "The active guideline is older than 24 months.",
                }
            ]

    def test_upload_endpoint_accepts_multipart_pdf_and_returns_lifecycle_metadata(self):
        rag_service = self.FakeAdminRAGService()
        client = TestClient(create_stt_app(self.FakeSTTService(), rag_service=rag_service))

        response = client.post(
            "/admin/guidelines/upload",
            files={"file": ("guideline.pdf", b"%PDF-1.4 api test", "application/pdf")},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["protocol_version"], 4)
        self.assertEqual(payload["superseded_document_ids"], ["doc-9"])
        self.assertEqual(
            rag_service.publish_calls,
            [(b"%PDF-1.4 api test", "guideline.pdf")],
        )

    def test_list_endpoint_surfaces_stale_alerts_and_include_deleted_flag(self):
        rag_service = self.FakeAdminRAGService()
        client = TestClient(create_stt_app(self.FakeSTTService(), rag_service=rag_service))

        response = client.get("/admin/guidelines")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["items"][0]["is_stale"])
        self.assertEqual(rag_service.list_calls[-1], False)

        response = client.get("/admin/guidelines?include_deleted=true")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(rag_service.list_calls[-1], True)


if __name__ == "__main__":
    unittest.main()
