import types
import unittest
from unittest.mock import patch
import sys

from backend_api import bootstrap


class BootstrapTests(unittest.TestCase):
    def test_build_service_wires_disabled_stack_without_constructing_optional_components(self):
        args = types.SimpleNamespace(
            model="openai/whisper-medium",
            language="en",
            disable_llm=True,
            disable_tts=True,
            disable_rag=True,
            llm_backend="gemini",
            llm_model="gpt-oss-120b",
            llm_base_url="https://llm-api.arc.vt.edu/api/v1",
            llm_api_key=None,
            gemini_model="gemini-2.5-flash",
            gemini_api_key=None,
            pipeline_top_k=None,
            tts_voice="af_heart",
            tts_lang_code="a",
            tts_sample_rate=24000,
            tts_output_dir="stt/output_audio",
        )

        with patch("backend_api.bootstrap.SpeechToTextService", autospec=True) as service_cls:
            bootstrap.build_service(args)

        service_cls.assert_called_once_with(
            model_id="openai/whisper-medium",
            language="en",
            llm_engine=None,
            pipeline_engine=None,
            tts_engine=None,
            tts_output_dir="stt/output_audio",
        )

    def test_main_delegates_to_uvicorn_with_created_app(self):
        args = types.SimpleNamespace(host="127.0.0.1", port=8000, reload=False)
        fake_uvicorn = types.SimpleNamespace(run=lambda *args, **kwargs: None)

        with patch("backend_api.bootstrap.parse_args", return_value=args), patch(
            "backend_api.bootstrap.build_service", return_value="service"
        ) as build_service, patch(
            "backend_api.bootstrap.create_app", return_value="app"
        ) as create_app, patch.dict(sys.modules, {"uvicorn": fake_uvicorn}), patch.object(
            fake_uvicorn,
            "run",
        ) as uvicorn_run, patch("builtins.print"):
            bootstrap.main()

        build_service.assert_called_once_with(args)
        create_app.assert_called_once_with("service")
        uvicorn_run.assert_called_once_with("app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    unittest.main()
