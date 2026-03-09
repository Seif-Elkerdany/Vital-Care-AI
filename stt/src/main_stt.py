import uvicorn
from stt_app.api import create_app
from stt_app.config import AppConfig
from stt_app.llm_engine import LLMEngine
from stt_app.service import SpeechToTextService
import argparse


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


def main():
    args = parse_args()

    llm_engine = None
    if AppConfig.llm_enabled and not args.disable_llm:
        llm_engine = LLMEngine(
            model=args.llm_model,
            base_url=args.llm_base_url,
            api_key=args.llm_api_key,
        )

    service = SpeechToTextService(
        model_id=args.model,
        language=args.language,
        llm_engine=llm_engine,
    )
    app = create_app(service)
    print("Server starting. Focus this terminal and press M to start/stop recording.")
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
