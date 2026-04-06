import unittest

from backend_api.LLM.guidance import SYSTEM_PROMPT as GUIDANCE_PROMPT
from backend_api.LLM.llm_engine import SYSTEM_PROMPT as ENGINE_PROMPT
from backend_api.LLM.prompts import (
    CLINICAL_DECISION_SUPPORT_PROMPT,
    PIPELINE_ANSWER_INSTRUCTION,
    PIPELINE_QUERY_INSTRUCTION,
)
from backend_api.STT.config import AppConfig
from backend_api.TTS.config import TTSConfig


class BackendDefaultsTests(unittest.TestCase):
    def test_llm_prompts_are_preserved_verbatim(self):
        self.assertEqual(ENGINE_PROMPT, CLINICAL_DECISION_SUPPORT_PROMPT)
        self.assertEqual(GUIDANCE_PROMPT, CLINICAL_DECISION_SUPPORT_PROMPT)
        self.assertIn("Phoenix Sepsis Criteria", CLINICAL_DECISION_SUPPORT_PROMPT)
        self.assertIn("Return exactly one single-line query and nothing else.", PIPELINE_QUERY_INSTRUCTION)
        self.assertIn("You are a clinical guideline assistant for pediatric sepsis and septic shock.", PIPELINE_ANSWER_INSTRUCTION)
        self.assertIn("SUPPORTED_CONCERN:", PIPELINE_ANSWER_INSTRUCTION)

    def test_stt_defaults_are_preserved(self):
        self.assertEqual(AppConfig.model_id, "openai/whisper-medium")
        self.assertEqual(AppConfig.language, "en")
        self.assertEqual(AppConfig.llm_model, "gpt-oss-120b")
        self.assertEqual(AppConfig.gemini_model, "gemini-2.5-flash")
        self.assertEqual(AppConfig.tts_voice, "af_heart")
        self.assertEqual(AppConfig.tts_lang_code, "a")
        self.assertEqual(AppConfig.tts_sample_rate, 24000)

    def test_tts_defaults_are_preserved(self):
        config = TTSConfig()
        self.assertEqual(config.sample_rate, 24000)
        self.assertEqual(config.default_voice, "af_heart")
        self.assertEqual(config.dtype, "float32")
        self.assertIsNone(config.channels)


if __name__ == "__main__":
    unittest.main()
