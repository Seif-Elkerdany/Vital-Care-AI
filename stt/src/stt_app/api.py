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
    app = FastAPI(
        title="MedAPP STT API",
        version="1.0.0",
    )

    @app.on_event("startup")
    async def startup_event():
        stt_service.start_hotkey_listener()

    @app.on_event("shutdown")
    async def shutdown_event():
        stt_service.stop_hotkey_listener()

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
        latest = stt_service.latest()
        if latest is None:
            raise HTTPException(status_code=404, detail="No transcription has been published yet.")
        return latest

    @app.get("/transcriptions", response_model=TranscriptionListResponse)
    async def list_transcriptions(limit = Query(default=20, ge=1, le=100)):
        return TranscriptionListResponse(items=stt_service.list_items(limit=limit))

    @app.get("/responses/latest", response_model=LLMResponseResult)
    async def latest_response():
        latest = stt_service.latest()
        if latest is None:
            raise HTTPException(status_code=404, detail="No transcription has been published yet.")
        if not latest.llm_response:
            raise HTTPException(status_code=404, detail="LLM response is not available for latest transcription.")
        return LLMResponseResult(
            transcript=latest.text,
            response=latest.llm_response,
            created_at=latest.created_at,
        )

    @app.get("/responses/latest/audio")
    async def latest_response_audio():
        latest = stt_service.latest()
        if latest is None:
            raise HTTPException(status_code=404, detail="No transcription has been published yet.")
        if not latest.llm_response:
            raise HTTPException(status_code=404, detail="LLM response is not available for latest transcription.")

        audio_wav = stt_service.latest_response_audio()
        if audio_wav is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="TTS audio is not available for latest LLM response.")

        return Response(content=audio_wav, media_type="audio/wav")

    @app.get("/responses/latest/audio/mp3")
    async def latest_response_audio_mp3():
        latest = stt_service.latest()
        if latest is None:
            raise HTTPException(status_code=404, detail="No transcription has been published yet.")
        if not latest.llm_response:
            raise HTTPException(status_code=404, detail="LLM response is not available for latest transcription.")

        audio_mp3 = stt_service.latest_response_audio_mp3()
        if audio_mp3 is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="MP3 audio is not available for latest LLM response.")

        return Response(content=audio_mp3, media_type="audio/mpeg")

    return app
