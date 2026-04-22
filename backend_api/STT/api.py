from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from backend_api.api.admin import build_admin_router
from backend_api.api.auth import build_auth_router
from backend_api.api.chat import build_chat_router

from .schemas import (
    GuidelineListResponse,
    GuidelineUploadResponse,
    HealthResponse,
    LLMResponseResult,
    RecordingStatusResponse,
    StepsResponse,
    TextInputRequest,
    ToggleRecordingResponse,
    TranscriptionListResponse,
    TranscriptionResult,
)


def create_app(
    stt_service,
    rag_service=None,
    *,
    auth_service=None,
    chat_service=None,
    invitation_service=None,
):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app
        stt_service.start_hotkey_listener()
        try:
            yield
        finally:
            stt_service.stop_hotkey_listener()

    app = FastAPI(title="MedAPP STT API", version="1.0.0", lifespan=lifespan)
    resolved_rag_service = (
        rag_service
        or getattr(stt_service, "rag_service", None)
        or getattr(getattr(stt_service, "pipeline_engine", None), "rag_service", None)
    )

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

    def require_rag_service():
        if resolved_rag_service is None:
            raise HTTPException(
                status_code=503,
                detail="RAG service is not available.",
            )
        return resolved_rag_service

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

    @app.post("/pipeline/text", response_model=TranscriptionResult)
    async def process_text(body: TextInputRequest):
        return stt_service.process_text_input(body.text)

    @app.post("/pipeline/steps", response_model=StepsResponse)
    async def generate_steps(body: TextInputRequest):
        try:
            return stt_service.generate_steps(body.text)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

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

    if auth_service is not None and invitation_service is not None:
        app.include_router(build_auth_router(auth_service, invitation_service))

    if auth_service is not None and chat_service is not None:
        app.include_router(build_chat_router(auth_service, chat_service))

    if auth_service is not None and invitation_service is not None:
        app.include_router(build_admin_router(auth_service, invitation_service, resolved_rag_service))
    else:
        @app.post("/admin/guidelines/upload", response_model=GuidelineUploadResponse)
        async def upload_guideline(file: UploadFile = File(...)):
            rag = require_rag_service()
            try:
                payload = await file.read()
                return rag.publish_guideline(
                    payload,
                    original_filename=file.filename or "guideline.pdf",
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            except RuntimeError as exc:
                raise HTTPException(status_code=409, detail=str(exc))
            finally:
                await file.close()

        @app.get("/admin/guidelines", response_model=GuidelineListResponse)
        async def list_guidelines(include_deleted: bool = Query(default=False)):
            rag = require_rag_service()
            return GuidelineListResponse(
                items=rag.list_documents(include_deleted=include_deleted)
            )

    return app
