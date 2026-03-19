from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response

from .schemas import (
    HealthResponse,
    LLMResponseResult,
    RecordingStatusResponse,
    ToggleRecordingResponse,
    TranscriptionListResponse,
    TranscriptionResult,
)


def create_app(stt_service):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app
        stt_service.start_hotkey_listener()
        try:
            yield
        finally:
            stt_service.stop_hotkey_listener()

    app = FastAPI(title="MedAPP STT API", version="1.0.0", lifespan=lifespan)

    def require_latest_transcription() -> TranscriptionResult:
        latest = stt_service.latest()
        if latest is None:
            raise HTTPException(status_code=404, detail="No transcription has been published yet.")
        return latest

    def require_latest_response() -> TranscriptionResult:
        latest = require_latest_transcription()
        if not latest.llm_response:
            raise HTTPException(
                status_code=404,
                detail="LLM response is not available for latest transcription.",
            )
        return latest

    @app.get("/health", response_model=HealthResponse)
    async def health():
        return HealthResponse(status="ok")

    @app.get("/recording/status", response_model=RecordingStatusResponse)
    async def recording_status():
        return stt_service.status()

    @app.post("/recording/toggle", response_model=ToggleRecordingResponse)
    async def toggle_recording():
        return ToggleRecordingResponse(state=stt_service.toggle_recording())

    @app.get("/transcriptions/latest", response_model=TranscriptionResult)
    async def latest_transcription():
        return require_latest_transcription()

    @app.get("/transcriptions", response_model=TranscriptionListResponse)
    async def list_transcriptions(limit=Query(default=20, ge=1, le=100)):
        return TranscriptionListResponse(items=stt_service.list_items(limit=limit))

    @app.get("/responses/latest", response_model=LLMResponseResult)
    async def latest_response():
        latest = require_latest_response()
        return LLMResponseResult(
            transcript=latest.text,
            response=latest.llm_response,
            created_at=latest.created_at,
        )

    @app.get("/responses/latest/audio")
    async def latest_response_audio():
        latest = require_latest_response()
        audio_wav = stt_service.latest_response_audio()
        if audio_wav is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="TTS audio is not available for latest LLM response.")
        return Response(content=audio_wav, media_type="audio/wav")

    @app.get("/responses/latest/audio/mp3")
    async def latest_response_audio_mp3():
        latest = require_latest_response()
        audio_mp3 = stt_service.latest_response_audio_mp3()
        if audio_mp3 is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="MP3 audio is not available for latest LLM response.")
        return Response(content=audio_mp3, media_type="audio/mpeg")

    return app
