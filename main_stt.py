import argparse
from llm.llm_engine import LLMEngine
from stt.src.stt_app import AppConfig, SpeechToTextService


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
    if AppConfig.llm_enabled and not args.disable_llm:
        llm_engine = LLMEngine(
            model=args.llm_model,
            base_url=args.llm_base_url,
            api_key=args.llm_api_key,
        )

    tts_engine = None
    if AppConfig.tts_enabled and not args.disable_tts:
        from tts.tts_engine import TTSEngine

        tts_engine = TTSEngine(
            voice=args.tts_voice,
            lang_code=args.tts_lang_code,
            sample_rate=args.tts_sample_rate,
        )

    return SpeechToTextService(
        model_id=args.model,
        language=args.language,
        llm_engine=llm_engine,
        tts_engine=tts_engine,
        tts_output_dir=args.tts_output_dir,
    )


def main():
    args = parse_args()
    import uvicorn
    from stt.src.stt_app.api import create_app

    service = build_service(args)
    app = create_app(service)
    print("Server starting. Focus this terminal and press M to start/stop recording.")
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
