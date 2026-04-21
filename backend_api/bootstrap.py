from __future__ import annotations

import argparse

from backend_api.STT import AppConfig, SpeechToTextService


def parse_args():
    parser = argparse.ArgumentParser(description="Run STT API with M-hotkey recording.")
    parser.add_argument(
        "--model",
        default=AppConfig.model_id,
        help="Whisper model name or local path.",
    )
    parser.add_argument(
        "--language",
        default=AppConfig.language,
    )
    parser.add_argument(
        "--disable-llm",
        action="store_true",
        help="Disable the LLM call after transcription.",
    )
    parser.add_argument(
        "--llm-backend",
        choices=["gemini", "openai"],
        default=AppConfig.llm_backend,
        help="Select LLM backend: gemini (default) or openai-compatible LLMEngine.",
    )
    parser.add_argument(
        "--disable-rag",
        action="store_true",
        help="Disable RAG retrieval; pipeline still runs the two LLM steps.",
    )
    parser.add_argument(
        "--llm-model",
        default=AppConfig.llm_model,
        help="LLM model id.",
    )
    parser.add_argument(
        "--llm-base-url",
        default=AppConfig.llm_base_url,
        help="OpenAI-compatible base URL.",
    )
    parser.add_argument(
        "--llm-api-key",
        default=AppConfig.llm_api_key,
        help="API key for the LLM provider.",
    )
    parser.add_argument(
        "--gemini-model",
        default=AppConfig.gemini_model,
        help="Gemini model id for the pipeline.",
    )
    parser.add_argument(
        "--gemini-api-key",
        default=AppConfig.gemini_api_key,
        help="Gemini API key (or set GEMINI_API_KEY).",
    )
    parser.add_argument(
        "--pipeline-top-k",
        type=int,
        default=AppConfig.pipeline_top_k,
        help="Override top-k for RAG retrieval (defaults to RAG config).",
    )
    parser.add_argument(
        "--disable-tts",
        action="store_true",
        help="Disable TTS generation for LLM responses.",
    )
    parser.add_argument(
        "--tts-voice",
        default=AppConfig.tts_voice,
        help="Voice id for Kokoro TTS.",
    )
    parser.add_argument(
        "--tts-lang-code",
        default=AppConfig.tts_lang_code,
        help="Language code for Kokoro pipeline.",
    )
    parser.add_argument(
        "--tts-sample-rate",
        type=int,
        default=AppConfig.tts_sample_rate,
        help="WAV sample rate for generated TTS audio.",
    )
    parser.add_argument(
        "--tts-output-dir",
        default=AppConfig.tts_output_dir,
        help="Directory where generated TTS WAV/MP3 files are saved.",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host interface for FastAPI server.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for FastAPI server.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload while developing.",
    )
    return parser.parse_args()


def build_service(args) -> SpeechToTextService:
    llm_engine = None
    pipeline_engine = None
    rag_service = None

    if AppConfig.rag_enabled and not args.disable_rag:
        from backend_api.RAG import RAGService
        from backend_api.RAG.config import RAGConfig

        rag_config = RAGConfig()
        try:
            rag_service = RAGService()
        except Exception as exc:
            raise RuntimeError(
                "Failed to initialize the RAG service "
                f"(collection `{rag_config.collection_name}`, embedding model `{rag_config.embedding_model}`): {exc}"
            ) from exc

    if AppConfig.llm_enabled and not args.disable_llm:
        from backend_api.LLM.gemini_flash import GeminiFlashClient
        from backend_api.LLM.llm_engine import LLMEngine
        from backend_api.LLM.pipeline import LLMRAGPipeline, OpenAICompatClient

        try:
            if args.llm_backend == "gemini":
                llm_client = GeminiFlashClient(
                    api_key=args.gemini_api_key,
                    model=args.gemini_model,
                )
            else:
                llm_engine = LLMEngine(
                    model=args.llm_model,
                    base_url=args.llm_base_url,
                    api_key=args.llm_api_key,
                )
                llm_client = OpenAICompatClient(llm_engine)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to initialize the `{args.llm_backend}` LLM backend: {exc}"
            ) from exc

        pipeline_engine = LLMRAGPipeline(
            llm_client=llm_client,
            rag_service=rag_service,
            top_k=args.pipeline_top_k,
        )

    tts_engine = None
    if AppConfig.tts_enabled and not args.disable_tts:
        from backend_api.TTS.tts_engine import TTSEngine

        try:
            tts_engine = TTSEngine(
                voice=args.tts_voice,
                lang_code=args.tts_lang_code,
                sample_rate=args.tts_sample_rate,
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to initialize TTS: {exc}") from exc

    return SpeechToTextService(
        model_id=args.model,
        language=args.language,
        llm_engine=llm_engine,
        pipeline_engine=pipeline_engine,
        rag_service=rag_service,
        tts_engine=tts_engine,
        tts_output_dir=args.tts_output_dir,
    )


def create_app(service: SpeechToTextService):
    from fastapi.middleware.cors import CORSMiddleware

    from backend_api.STT.api import create_app as create_stt_app

    app = create_stt_app(service, rag_service=getattr(service, "rag_service", None))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


def main() -> None:
    args = parse_args()

    import uvicorn

    service = build_service(args)
    app = create_app(service)
    print(
        "Server starting. Focus this terminal and press M to start/stop recording, or POST /pipeline/text for typed input."
    )
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)
