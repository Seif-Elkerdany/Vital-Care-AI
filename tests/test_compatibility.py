import unittest

from backend_api.LLM.pipeline import LLMRAGPipeline as CanonicalPipeline
from backend_api.RAG import RAGService as CanonicalRAGService
from backend_api.STT.service import SpeechToTextService as CanonicalSpeechToTextService
from backend_api.TTS.service import TTSService as CanonicalTTSService
from pipeline import LLMRAGPipeline as LegacyPipeline
from rag import RAGService as LegacyRAGService
from stt.src.stt_app.service import SpeechToTextService as LegacySpeechToTextService
from tts.service import TTSService as LegacyTTSService


class CompatibilityTests(unittest.TestCase):
    def test_legacy_imports_resolve_to_canonical_objects(self):
        self.assertIs(LegacyPipeline, CanonicalPipeline)
        self.assertIs(LegacyRAGService, CanonicalRAGService)
        self.assertIs(LegacySpeechToTextService, CanonicalSpeechToTextService)
        self.assertIs(LegacyTTSService, CanonicalTTSService)

    def test_rag_cli_wrapper_points_to_canonical_cli(self):
        from backend_api.RAG.cli import main as canonical_main
        from rag.test import main as legacy_main

        self.assertIs(legacy_main, canonical_main)


if __name__ == "__main__":
    unittest.main()
