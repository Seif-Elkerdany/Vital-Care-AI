# MedAPP

`backend_api/` is the canonical Python backend package for this project.

It is split into four backend modules:
- `backend_api/LLM`
- `backend_api/RAG`
- `backend_api/STT`
- `backend_api/TTS`

The old top-level `llm/`, `rag/`, `stt/`, and `tts/` locations are now compatibility wrappers only.

`Medical_app_UI/` was intentionally left unchanged.

## Install

```bash
pip install -r requirements.txt
```

Start Qdrant:

```bash
docker compose up -d
```

## Run The Backend

Gemini path:

```bash
python main.py --gemini-api-key "<your key>" --gemini-model gemini-2.5-flash
```

OpenAI-compatible path:

```bash
python main.py \
  --llm-backend openai \
  --llm-base-url "https://llm-api.arc.vt.edu/api/v1" \
  --llm-api-key "<your key>" \
  --llm-model "gpt-oss-120b"
```

Disable LLM chaining:

```bash
python main.py --disable-llm
```

## Current Flow

The backend keeps the same runtime behavior:

`STT -> LLM query -> RAG -> LLM answer -> TTS`

Voice path:
- focus the terminal
- press `M` to start recording
- press `M` again to stop and process

Text path:

```bash
curl -X POST http://localhost:8000/pipeline/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Test question"}'
```

## Module Guides

- `backend_api/LLM/README.md`
- `backend_api/RAG/README.md`
- `backend_api/STT/README.md`
- `backend_api/TTS/README.md`
