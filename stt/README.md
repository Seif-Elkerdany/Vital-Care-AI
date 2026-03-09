# MedAPP STT (Simple Guide)

This project runs Speech-to-Text (STT) with Whisper and exposes results through FastAPI.
It can also call an LLM after each transcript (`STT -> LLM`) and publish the response.

## What It Does
- Runs a FastAPI server.
- Listens for `M` key on the server machine.
- First `M`: start recording from microphone.
- Second `M`: stop recording, transcribe speech, and save/publish the text.
- After transcription, calls LLM and saves the LLM response with the transcript.
- You can read the latest transcription from API endpoints.

## Project Structure
- `stt/src/main_stt.py`: app entry point (start server here)
- `stt/src/stt_app/service.py`: recording + hotkey + transcription logic
- `stt/src/stt_app/api.py`: FastAPI endpoints
- `stt/src/stt_app/whisper_engine.py`: Whisper model loading/inference
- `stt/requirements.txt`: Python dependencies

## Quick Start
1. Install dependencies:
```bash
pip install -r stt/requirements.txt
```

2. Start server:
```bash
python stt/src/main_stt.py --host 0.0.0.0 --port 8000
```

3. Use hotkey recording:
- Keep terminal focused.
- Press `M` to start recording.
- Press `M` again to stop and transcribe.

## API Endpoints
- `GET /health`: simple health check
- `GET /recording/status`: current state (`recording`, `transcribing`, last event/error)
- `POST /recording/toggle`: start/stop recording without keyboard
- `GET /transcriptions/latest`: last transcription result
- `GET /transcriptions?limit=20`: recent transcription history
- `GET /responses/latest`: latest `{transcript, response}` pair from LLM

Base URL example:
`http://localhost:8000`

## Example API Calls
```bash
curl http://localhost:8000/health
curl http://localhost:8000/recording/status
curl -X POST http://localhost:8000/recording/toggle
curl http://localhost:8000/transcriptions/latest
curl "http://localhost:8000/transcriptions?limit=10"
curl http://localhost:8000/responses/latest
```

## LLM Configuration
Environment variables:
- `LLM_ENABLED` (`true`/`false`, default `true`)
- `LLM_MODEL` (default `gpt-oss-120b`)
- `LLM_BASE_URL` (default `https://llm-api.arc.vt.edu/api/v1`)
- `LLM_API_KEY` (or `ARC_API_KEY` / `OPENAI_API_KEY`)

CLI flags:
```bash
python stt/src/main_stt.py \
  --llm-model gpt-oss-120b \
  --llm-base-url https://llm-api.arc.vt.edu/api/v1 \
  --llm-api-key "$ARC_API_KEY"
```

Disable LLM chaining:
```bash
python stt/src/main_stt.py --disable-llm
```

## Notes
- `M` hotkey works on the machine running the server (not browser keyboard input).
- If mic access fails, check OS microphone permissions.
- First run may take longer because Whisper model downloads.
