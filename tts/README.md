# MedAPP TTS

This module provides text-to-speech for MedAPP using Kokoro.

It can be used in two ways:
- as a standalone FastAPI TTS service
- as a Python package consumed by the STT pipeline

## What It Does
- Converts input text into WAV audio
- Supports chunk-based streaming for websocket responses
- Exposes simple HTTP and websocket endpoints
- Provides a small compatibility wrapper (`tts_engine.py`) for the STT side

## Project Structure
- `app.py`: standalone FastAPI app entry point
- `api/controller.py`: API handlers for REST and websocket synthesis
- `api/models.py`: request model for REST synthesis
- `bootstrap.py`: builds the configured `TTSService`
- `service.py`: core TTS orchestration and audio normalization
- `synthesizers.py`: Kokoro synthesizer adapter
- `encoders.py`: WAV encoding
- `tts_engine.py`: compatibility wrapper used by `main.py` and STT
- `tests/test_service.py`: unit tests for `TTSService`
- `requirements.txt`: Python dependencies

## Install
From `MedAPP`:

```bash
pip install -r tts/requirements.txt
```

Notes:
- On Linux, Kokoro may require `espeak-ng`
- If MP3 conversion is needed elsewhere in the app, `ffmpeg` is a useful fallback dependency

## Run The Standalone TTS API
From `MedAPP/tts`:

```bash
PYTHONPATH=.. uvicorn app:app --host 0.0.0.0 --port 8001
```

PowerShell:

```powershell
$env:PYTHONPATH=".."
uvicorn app:app --host 0.0.0.0 --port 8001
```

## Endpoints
- `GET /`: simple status route
- `GET /synthesize?text=hello`: synthesize text from query string
- `POST /synthesize`: synthesize text from JSON body
- `WS /ws/tts`: stream chunk metadata and WAV bytes over websocket

## Example Requests
Browser:

```text
http://127.0.0.1:8001/synthesize?text=hello
```

`curl`:

```bash
curl "http://127.0.0.1:8001/synthesize?text=hello" --output sample.wav
```

POST example:

```bash
curl -X POST "http://127.0.0.1:8001/synthesize" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"hello from post\"}" \
  --output sample.wav
```

## Use From The Main App
The root MedAPP entry point uses:

- `from tts.tts_engine import TTSEngine`

That wrapper delegates to `TTSService`, so the STT side only depends on a simple:

- `synthesize(text) -> bytes`

interface.

## Run Tests
From `MedAPP`:

```bash
python -m unittest tts.tests.test_service
```

## Current Defaults
- voice: `af_heart`
- language code: `a`
- sample rate: `24000`
