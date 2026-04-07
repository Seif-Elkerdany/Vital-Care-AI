# STT Module

This module contains the speech-to-text API and orchestration layer for MedAPP.

It is responsible for:
- microphone recording
- Whisper transcription
- publishing transcription results through FastAPI
- chaining the LLM/RAG/TTS modules when enabled

Main files:
- `config.py`: runtime defaults and environment settings
- `recorder.py`: microphone recording logic
- `whisper_engine.py`: Whisper model loading and transcription
- `schemas.py`: API response models
- `service.py`: orchestration for STT, LLM/RAG, and TTS
- `api.py`: FastAPI routes

This module is the main backend surface used by `main.py`. It depends on `backend_api.LLM` and `backend_api.TTS` when those features are enabled.

## Install Dependencies

From the project root:

```bash
pip install -r backend_api/STT/requirements.txt
```

If you want the complete backend stack instead of STT only:

```bash
pip install -r requirements.txt
```

## What STT Uses

This module uses:
- Whisper for speech-to-text
- FastAPI for the backend API
- `sounddevice` for microphone capture
- `pynput` for the keyboard hotkey listener

Current defaults:
- model: `openai/whisper-medium`
- language: `en`
- sample rate: `16000`
- channels: `1`
- dtype: `int16`

## Environment Setup

The STT layer reads these runtime settings:

```env
LLM_ENABLED=true
RAG_ENABLED=true
TTS_ENABLED=true

LLM_BACKEND=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

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

## Run The STT Backend

From the project root:

```bash
python main.py
```

Common development run:

```bash
python main.py --host 0.0.0.0 --port 8000 --reload
```

Run with explicit Whisper settings:

```bash
python main.py \
  --model "openai/whisper-medium" \
  --language "en"
```

Disable optional layers:

```bash
python main.py --disable-llm
python main.py --disable-rag
python main.py --disable-tts
```

## How Recording Works

The STT module supports microphone recording with the `M` hotkey:

1. Start the backend.
2. Keep the terminal focused.
3. Press `M` once to start recording.
4. Press `M` again to stop recording.
5. The audio is transcribed and then optionally sent to LLM, RAG, and TTS.

You can also send plain text directly through the API without using a microphone.

## API Endpoints

The STT backend exposes these routes:

- `GET /health`
- `GET /recording/status`
- `POST /recording/toggle`
- `GET /transcriptions/latest`
- `GET /transcriptions`
- `POST /pipeline/text`
- `GET /responses/latest`
- `GET /responses/latest/audio`
- `GET /responses/latest/audio/mp3`

Example requests:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/recording/status
curl -X POST http://localhost:8000/recording/toggle
curl http://localhost:8000/transcriptions/latest
curl "http://localhost:8000/transcriptions?limit=10"
curl http://localhost:8000/responses/latest
curl http://localhost:8000/responses/latest/audio --output latest.wav
curl http://localhost:8000/responses/latest/audio/mp3 --output latest.mp3
curl -X POST http://localhost:8000/pipeline/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Patient is febrile and hypotensive"}'
```

## Notes

- The `M` hotkey works on the machine running the backend, not from browser keyboard input.
- The first Whisper load may take time because the model can be downloaded on first run.
- If microphone recording fails, check OS microphone permissions.
- If TTS is enabled, the STT flow can save WAV and MP3 outputs for the latest response.

## Install Dependencies

From the project root:

```bash
pip install -r backend_api/STT/requirements.txt
```

If you want the complete backend stack, install everything through the root requirements file:

```bash
pip install -r requirements.txt
```

## What STT Uses

This module uses:
- Whisper for speech-to-text
- FastAPI for the backend API
- `sounddevice` for microphone recording
- `pynput` for the keyboard hotkey listener

Current defaults:
- Whisper model: `openai/whisper-medium`
- language: `en`
- sample rate: `16000`
- channels: `1`
- dtype: `int16`

## Environment Setup

The STT module reads these settings from environment variables:

```env
LLM_ENABLED=true
RAG_ENABLED=true
TTS_ENABLED=true

LLM_BACKEND=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

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

## Run The STT Backend

From the project root:

```bash
python main.py
```

Common development run:

```bash
python main.py --host 0.0.0.0 --port 8000 --reload
```

Run with explicit Whisper configuration:

```bash
python main.py \
  --model "openai/whisper-medium" \
  --language "en"
```

Disable optional layers:

```bash
python main.py --disable-llm
python main.py --disable-rag
python main.py --disable-tts
```

## How Recording Works

The STT module supports microphone recording with the `M` hotkey:

1. Start the backend.
2. Keep the terminal focused.
3. Press `M` once to start recording.
4. Press `M` again to stop recording.
5. The audio is transcribed and then optionally passed to LLM/RAG/TTS.

You can also submit plain text directly through the API without using a microphone.

## API Endpoints

The STT backend exposes these routes:

- `GET /health`
- `GET /recording/status`
- `POST /recording/toggle`
- `GET /transcriptions/latest`
- `GET /transcriptions`
- `POST /pipeline/text`
- `GET /responses/latest`
- `GET /responses/latest/audio`
- `GET /responses/latest/audio/mp3`

Example requests:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/recording/status
curl -X POST http://localhost:8000/recording/toggle
curl http://localhost:8000/transcriptions/latest
curl "http://localhost:8000/transcriptions?limit=10"
curl http://localhost:8000/responses/latest
curl http://localhost:8000/responses/latest/audio --output latest.wav
curl http://localhost:8000/responses/latest/audio/mp3 --output latest.mp3
curl -X POST http://localhost:8000/pipeline/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Patient is febrile and hypotensive"}'
```

## Notes

- The microphone hotkey works on the machine running the backend, not from browser keyboard input.
- The first Whisper load can take time because the model may need to be downloaded.
- If microphone capture fails, check OS microphone permissions.
- If TTS is enabled, the STT response can also generate WAV and MP3 output paths.
