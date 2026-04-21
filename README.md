# MedAPP

`backend_api/` is the canonical Python backend package for this project.

It is split into four backend modules:
- `backend_api/LLM`
- `backend_api/RAG`
- `backend_api/STT`
- `backend_api/TTS`

The old top-level `llm/`, `rag/`, `stt/`, and `tts/` locations are now compatibility wrappers only.

`Medical_app_UI/` was intentionally left unchanged.

## Quick Start

1. Install backend dependencies:

```bash
pip install -r requirements.txt
```

2. Start Qdrant:

```bash
docker compose up -d
```

3. Set your LLM provider credentials.

Gemini example:

```bash
export LLM_BACKEND=gemini
export GEMINI_API_KEY="your_key_here"
export GEMINI_MODEL=gemini-2.5-flash
```

OpenAI-compatible example:

```bash
export LLM_BACKEND=openai
export LLM_API_KEY="your_key_here"
export LLM_BASE_URL="https://llm-api.arc.vt.edu/api/v1"
export LLM_MODEL="gpt-oss-120b"
```

4. Run the backend:

```bash
python main.py
```

5. Use one of these paths:
- voice path: focus the terminal and press `M` to start/stop recording
- text path: send a request to `/pipeline/text`

Example text request:

```bash
curl -X POST http://localhost:8000/pipeline/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Patient is febrile and hypotensive"}'
```

## Install

```bash
pip install -r requirements.txt
```

Start Qdrant:

```bash
docker compose up -d
```

## Environment Setup

Common backend settings:

```env
LLM_ENABLED=true
RAG_ENABLED=true
TTS_ENABLED=true

LLM_BACKEND=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=medical_documents
RAG_GUIDELINE_UPLOAD_DIR=data/guidelines
RAG_GUIDELINE_STALE_MONTHS=24

TTS_VOICE=af_heart
TTS_LANG_CODE=a
TTS_SAMPLE_RATE=24000
TTS_OUTPUT_DIR=stt/output_audio
```

If you want the OpenAI-compatible LLM path instead of Gemini:

```env
LLM_BACKEND=openai
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://llm-api.arc.vt.edu/api/v1
LLM_MODEL=gpt-oss-120b
```

## Run The Backend

Gemini path:

```bash
python main.py --gemini-api-key "<your key>" --gemini-model gemini-2.5-flash
```

OpenAI-compatible path:

```bash
python main.py --llm-backend openai --llm-base-url "https://llm-api.arc.vt.edu/api/v1" --llm-api-key "<your key>" --llm-model "gpt-oss-120b"
```

Disable LLM chaining:

```bash
python main.py --disable-llm
```

## STT Setup

The backend STT layer uses Whisper and microphone capture.

Current STT defaults:
- model: `openai/whisper-medium`
- language: `en`
- sample rate: `16000`
- channels: `1`

Run with explicit STT settings:

```bash
python main.py \
  --model "openai/whisper-medium" \
  --language "en"
```

Voice capture flow:
- focus the terminal running the backend
- press `M` once to start recording
- press `M` again to stop recording and process the audio

Important notes:
- the `M` hotkey works on the machine running the backend
- the first Whisper run may take time because the model can be downloaded
- if microphone capture fails, check OS microphone permissions

Useful STT endpoints:
- `GET /health`
- `GET /recording/status`
- `POST /recording/toggle`
- `GET /transcriptions/latest`
- `GET /transcriptions`
- `POST /pipeline/text`
- `POST /admin/guidelines/upload`
- `GET /admin/guidelines`

Example:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/recording/status
curl -X POST http://localhost:8000/recording/toggle
```

## TTS Setup

The backend TTS layer uses Kokoro and can generate WAV and MP3 outputs for the latest response.

Current TTS defaults:
- voice: `af_heart`
- language code: `a`
- sample rate: `24000`
- output directory: `stt/output_audio`

Run with explicit TTS settings:

```bash
python main.py \
  --tts-voice af_heart \
  --tts-lang-code a \
  --tts-sample-rate 24000 \
  --tts-output-dir stt/output_audio
```

Disable TTS:

```bash
python main.py --disable-tts
```

Useful TTS-related endpoints:
- `GET /responses/latest`
- `GET /responses/latest/audio`
- `GET /responses/latest/audio/mp3`

Example:

```bash
curl http://localhost:8000/responses/latest
curl http://localhost:8000/responses/latest/audio --output latest.wav
curl http://localhost:8000/responses/latest/audio/mp3 --output latest.mp3
```

Important notes:
- on Linux, Kokoro may need the system package `espeak-ng`
- MP3 conversion may also rely on `ffmpeg` in fallback mode
- if TTS is disabled, the backend still returns text responses

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
