from __future__ import annotations

import argparse
import io
import math
import sys
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from pipeline import LLMRAGPipeline, OpenAICompatClient
from rag import RAGService
from stt.src.stt_app.config import AppConfig, SAMPLE_RATE
from stt.src.stt_app.schemas import HealthResponse, TextInputRequest, TranscriptionResult
from stt.src.stt_app.service import SpeechToTextService


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = BASE_DIR / "uploads"
ALLOWED_UPLOAD_SUFFIXES = {".pdf"}


class PipelineRequest(TextInputRequest):
    top_k: int | None = Field(default=None, ge=1, le=20)


class DocumentListResponse(BaseModel):
    items: list[dict]


class DocumentDeleteResponse(BaseModel):
    deleted: bool
    document_id: str | None = None
    document_name: str | None = None


class UploadItemResult(BaseModel):
    filename: str
    success: bool
    detail: str
    document: dict | None = None


class UploadResponse(BaseModel):
    items: list[UploadItemResult]


def _build_llm_client(args):
    if args.llm_backend == "gemini":
        from llm.gemini_flash import GeminiFlashClient

        return GeminiFlashClient(api_key=args.gemini_api_key, model=args.gemini_model)

    from llm.llm_engine import LLMEngine

    engine = LLMEngine(
        model=args.llm_model,
        base_url=args.llm_base_url,
        api_key=args.llm_api_key,
    )
    return OpenAICompatClient(engine), engine


def build_service(args) -> tuple[SpeechToTextService, RAGService | None]:
    llm_engine = None
    pipeline_engine = None
    rag_service = None

    if AppConfig.llm_enabled and not args.disable_llm:
        llm_client_or_tuple = _build_llm_client(args)
        if isinstance(llm_client_or_tuple, tuple):
            llm_client, llm_engine = llm_client_or_tuple
        else:
            llm_client = llm_client_or_tuple

        if AppConfig.rag_enabled and not args.disable_rag:
            rag_service = RAGService()

        pipeline_engine = LLMRAGPipeline(
            llm_client=llm_client,
            rag_service=rag_service,
            top_k=args.pipeline_top_k,
        )

    tts_engine = None
    if AppConfig.tts_enabled and not args.disable_tts:
        from tts.tts_engine import TTSEngine

        tts_engine = TTSEngine(
            voice=args.tts_voice,
            lang_code=args.tts_lang_code,
            sample_rate=args.tts_sample_rate,
        )

    service = SpeechToTextService(
        model_id=args.model,
        language=args.language,
        llm_engine=llm_engine,
        pipeline_engine=pipeline_engine,
        tts_engine=tts_engine,
        tts_output_dir=args.tts_output_dir,
    )
    return service, rag_service


def _require_latest_transcription(stt_service: SpeechToTextService) -> TranscriptionResult:
    latest = stt_service.latest()
    if latest is None:
        raise HTTPException(status_code=404, detail="No transcription has been published yet.")
    return latest


def _require_latest_response(stt_service: SpeechToTextService) -> TranscriptionResult:
    latest = _require_latest_transcription(stt_service)
    if not latest.llm_response:
        raise HTTPException(status_code=404, detail="LLM response is not available for latest transcription.")
    return latest


def _require_rag_service(rag_service: RAGService | None) -> RAGService:
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG service is disabled for this demo server.")
    return rag_service


def _run_with_top_k(
    stt_service: SpeechToTextService,
    top_k: int | None,
    callback,
):
    pipeline = stt_service.pipeline_engine
    if pipeline is None or top_k is None:
        return callback()

    original_top_k = pipeline.top_k
    pipeline.top_k = top_k
    try:
        return callback()
    finally:
        pipeline.top_k = original_top_k


def _decode_wav_audio(file_bytes: bytes) -> np.ndarray:
    try:
        with wave.open(io.BytesIO(file_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            compression = wav_file.getcomptype()
            raw_frames = wav_file.readframes(frame_count)
    except wave.Error as exc:
        raise ValueError("Audio upload must be a valid WAV file.") from exc

    if compression != "NONE":
        raise ValueError("Compressed WAV files are not supported.")
    if sample_width != 2:
        raise ValueError("Only 16-bit PCM WAV files are supported.")

    audio = np.frombuffer(raw_frames, dtype=np.int16)
    if audio.size == 0:
        raise ValueError("Uploaded audio is empty.")

    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1).astype(np.int16)

    if sample_rate != SAMPLE_RATE:
        try:
            from scipy.signal import resample_poly
        except Exception as exc:
            raise RuntimeError(
                "Audio resampling requires scipy. Install the STT dependencies first."
            ) from exc

        factor = math.gcd(sample_rate, SAMPLE_RATE)
        audio_f32 = audio.astype(np.float32)
        audio = resample_poly(audio_f32, SAMPLE_RATE // factor, sample_rate // factor)
        audio = np.clip(audio, -32768, 32767).astype(np.int16)

    return np.ascontiguousarray(audio)


def create_app(
    stt_service: SpeechToTextService,
    rag_service: RAGService | None,
    *,
    uploads_dir: Path | None = None,
) -> FastAPI:
    uploads_root = (uploads_dir or UPLOADS_DIR).resolve()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        del app
        uploads_root.mkdir(parents=True, exist_ok=True)
        yield

    app = FastAPI(title="MedAPP Full Pipeline UI Demo", version="1.0.0", lifespan=lifespan)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")

    @app.get("/", response_class=FileResponse)
    async def index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/health", response_model=HealthResponse)
    async def health():
        return HealthResponse(status="ok")

    @app.post("/pipeline/text", response_model=TranscriptionResult)
    async def process_text(body: PipelineRequest):
        cleaned = body.text.strip()
        if not cleaned:
            raise HTTPException(status_code=422, detail="Text input must be non-empty.")

        try:
            return _run_with_top_k(
                stt_service,
                body.top_k,
                lambda: stt_service.process_text_input(cleaned),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/pipeline/audio", response_model=TranscriptionResult)
    async def process_audio(
        file: UploadFile = File(...),
        top_k: int | None = Form(default=None),
    ):
        try:
            file_bytes = await file.read()
            audio = _decode_wav_audio(file_bytes)
            return _run_with_top_k(
                stt_service,
                top_k,
                lambda: stt_service.process_audio(audio),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        finally:
            await file.close()

    @app.get("/transcriptions/latest", response_model=TranscriptionResult)
    async def latest_transcription():
        return _require_latest_transcription(stt_service)

    @app.get("/responses/latest/audio")
    async def latest_response_audio():
        latest = _require_latest_response(stt_service)
        audio_wav = stt_service.latest_response_audio()
        if audio_wav is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="TTS audio is not available for latest LLM response.")
        return Response(content=audio_wav, media_type="audio/wav")

    @app.get("/responses/latest/audio/mp3")
    async def latest_response_audio_mp3():
        latest = _require_latest_response(stt_service)
        audio_mp3 = stt_service.latest_response_audio_mp3()
        if audio_mp3 is None:
            if latest.tts_error:
                raise HTTPException(status_code=503, detail=latest.tts_error)
            raise HTTPException(status_code=404, detail="MP3 audio is not available for latest LLM response.")
        return Response(content=audio_mp3, media_type="audio/mpeg")

    @app.get("/rag/documents", response_model=DocumentListResponse)
    async def list_documents():
        try:
            service = _require_rag_service(rag_service)
            return DocumentListResponse(items=service.list_documents())
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/rag/documents/upload", response_model=UploadResponse)
    async def upload_documents(files: list[UploadFile] = File(...)):
        service = _require_rag_service(rag_service)
        results: list[UploadItemResult] = []

        for upload in files:
            filename = Path(upload.filename or "document").name
            suffix = Path(filename).suffix.lower()
            if suffix not in ALLOWED_UPLOAD_SUFFIXES:
                results.append(
                    UploadItemResult(
                        filename=filename,
                        success=False,
                        detail="This demo currently indexes PDF files only because the existing RAG service is PDF-based.",
                    )
                )
                continue

            batch_dir = uploads_root / uuid4().hex
            batch_dir.mkdir(parents=True, exist_ok=True)
            target_path = batch_dir / filename

            try:
                file_bytes = await upload.read()
                if not file_bytes:
                    raise ValueError("Uploaded file is empty.")
                target_path.write_bytes(file_bytes)
                document = service.add_pdf(target_path)
                results.append(
                    UploadItemResult(
                        filename=filename,
                        success=True,
                        detail="Indexed successfully.",
                        document=document,
                    )
                )
            except Exception as exc:
                results.append(
                    UploadItemResult(
                        filename=filename,
                        success=False,
                        detail=str(exc),
                    )
                )
            finally:
                await upload.close()

        return UploadResponse(items=results)

    @app.delete("/rag/documents/{document_id}", response_model=DocumentDeleteResponse)
    async def delete_document(document_id: str):
        try:
            service = _require_rag_service(rag_service)
            service.delete_by_document_id(document_id)
            return DocumentDeleteResponse(deleted=True, document_id=document_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.delete("/rag/documents", response_model=DocumentDeleteResponse)
    async def delete_document_by_name(document_name: str = Query(..., min_length=1)):
        try:
            service = _require_rag_service(rag_service)
            service.delete_by_document_name(document_name)
            return DocumentDeleteResponse(deleted=True, document_name=document_name)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    return app


def parse_args():
    parser = argparse.ArgumentParser(description="Run the MedAPP full pipeline UI demo.")
    parser.add_argument("--model", default=AppConfig.model_id, help="Whisper model name or local path.")
    parser.add_argument("--language", default=AppConfig.language)
    parser.add_argument("--disable-llm", action="store_true", help="Disable the LLM call after transcription.")
    parser.add_argument(
        "--llm-backend",
        choices=["gemini", "openai"],
        default=AppConfig.llm_backend,
        help="Select LLM backend: gemini or openai-compatible.",
    )
    parser.add_argument("--disable-rag", action="store_true", help="Disable RAG retrieval and document management.")
    parser.add_argument("--llm-model", default=AppConfig.llm_model, help="LLM model id.")
    parser.add_argument("--llm-base-url", default=AppConfig.llm_base_url, help="OpenAI-compatible base URL.")
    parser.add_argument("--llm-api-key", default=AppConfig.llm_api_key, help="API key for the LLM provider.")
    parser.add_argument("--gemini-model", default=AppConfig.gemini_model, help="Gemini model id.")
    parser.add_argument("--gemini-api-key", default=AppConfig.gemini_api_key, help="Gemini API key.")
    parser.add_argument(
        "--pipeline-top-k",
        type=int,
        default=AppConfig.pipeline_top_k,
        help="Override top-k for RAG retrieval.",
    )
    parser.add_argument("--disable-tts", action="store_true", help="Disable TTS generation.")
    parser.add_argument("--tts-voice", default=AppConfig.tts_voice, help="Voice id for Kokoro TTS.")
    parser.add_argument("--tts-lang-code", default=AppConfig.tts_lang_code, help="Language code for Kokoro pipeline.")
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
    parser.add_argument("--uploads-dir", default=str(UPLOADS_DIR), help="Directory where uploaded PDFs are stored.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for FastAPI server.")
    parser.add_argument("--port", type=int, default=8010, help="Port for FastAPI server.")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload while developing.")
    return parser.parse_args()


def main():
    args = parse_args()
    import uvicorn

    stt_service, rag_service = build_service(args)
    app = create_app(stt_service, rag_service, uploads_dir=Path(args.uploads_dir))
    print(
        "UI server starting with browser mic STT, pipeline, RAG document management, and TTS playback."
    )
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
