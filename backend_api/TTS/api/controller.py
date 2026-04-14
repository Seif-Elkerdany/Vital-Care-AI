import asyncio

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from .models import SynthesizeRequest
from backend_api.TTS.service import TTSService


class TTSController:
    def __init__(self, service: TTSService):
        self._service = service

    async def synthesize_rest(self, payload: SynthesizeRequest) -> Response:
        text = payload.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Empty text")

        loop = asyncio.get_event_loop()
        wav_bytes = await loop.run_in_executor(None, self._service.synthesize_bytes, text)
        return Response(content=wav_bytes, media_type="audio/wav")

    async def synthesize_get(self, text: str) -> Response:
        value = text.strip()
        if not value:
            raise HTTPException(status_code=400, detail="Query param 'text' is required")

        loop = asyncio.get_event_loop()
        wav_bytes = await loop.run_in_executor(None, self._service.synthesize_bytes, value)
        return Response(content=wav_bytes, media_type="audio/wav")

    async def tts_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        try:
            first_message = await websocket.receive()
            text = first_message.get("text")
            if text is None:
                await websocket.send_json({"event": "error", "detail": "Send text as first message"})
                await websocket.close()
                return

            text = text.strip()
            if not text:
                await websocket.send_json({"event": "error", "detail": "Missing text"})
                await websocket.close()
                return

            async_queue: asyncio.Queue = asyncio.Queue()
            running_loop = asyncio.get_running_loop()
            self._service.stream_to_async_queue(text, async_queue, running_loop)

            while True:
                item = await async_queue.get()
                if item is None:
                    await websocket.send_json({"event": "done"})
                    break
                if isinstance(item, tuple) and item and item[0] == "__error__":
                    await websocket.send_json({"event": "error", "detail": item[1]})
                    break

                meta, wav_bytes = item
                await websocket.send_json({"event": "chunk_meta", **meta})
                await websocket.send_bytes(wav_bytes)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            try:
                await websocket.send_json({"event": "error", "detail": str(exc)})
            finally:
                await websocket.close()
