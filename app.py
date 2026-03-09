from fastapi import FastAPI

from api.controller import TTSController
from bootstrap import build_container


def create_app() -> FastAPI:
    app = FastAPI(title="TTS service (text-only)")
    container = build_container()
    controller = TTSController(orchestrator=container.pipeline_orchestrator)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"status": "ok", "message": "Use /synthesize"}

    app.post("/synthesize")(controller.synthesize_rest)
    app.post("/synthesize/", include_in_schema=False)(controller.synthesize_rest)
    app.get("/synthesize")(controller.synthesize_get)
    app.get("/synthesize/", include_in_schema=False)(controller.synthesize_get)
    app.websocket("/ws/tts")(controller.tts_websocket)
    return app


app = create_app()
