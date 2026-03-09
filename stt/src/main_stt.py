import uvicorn
from stt_app.api import create_app
from stt_app.config import AppConfig
from stt_app.service import SpeechToTextService
import argparse

def parse_args():
    parser = argparse.ArgumentParser(description="Run STT API with M-hotkey recording.")
    parser.add_argument(
        "--model",
        default="openai/whisper-medium",
        help="Whisper model name or local path.",
    )
    parser.add_argument(
        "--language",
        default="en",
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

    service = SpeechToTextService(
        model_id=AppConfig.model_id,
        language=AppConfig.language,
    )
    app = create_app(service)
    print("Server starting. Focus this terminal and press M to start/stop recording.")
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
