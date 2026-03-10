# MedAPP STT (Simple Guide)

This project runs Speech-to-Text (STT) with Whisper and exposes results through FastAPI.
It can call an LLM after each transcript (`STT -> LLM`) and synthesize the LLM answer as WAV audio (`STT -> LLM -> TTS`).

## What It Does
- Runs a FastAPI server.
- Listens for `M` key on the server machine.
- First `M`: start recording from microphone.
- Second `M`: stop recording, transcribe speech, and save/publish the text.
- After transcription, calls LLM and saves the LLM response with the transcript.
- Optionally synthesizes the latest LLM response and saves both `.wav` and `.mp3` files.
- You can read the latest transcription from API endpoints.

## Project Structure
- `stt/src/main_stt.py`: app entry point (start server here)
- `stt/src/stt_app/service.py`: recording + hotkey + transcription logic
- `stt/src/stt_app/api.py`: FastAPI endpoints
- `stt/src/stt_app/whisper_engine.py`: Whisper model loading/inference
- `stt/src/stt_app/tts_engine.py`: Kokoro-based text-to-speech engine
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
- `GET /responses/latest/audio`: latest LLM response as `audio/wav`
- `GET /responses/latest/audio/mp3`: latest LLM response as `audio/mpeg`

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
curl http://localhost:8000/responses/latest/audio --output latest_response.wav
curl http://localhost:8000/responses/latest/audio/mp3 --output latest_response.mp3
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

## TTS Configuration
Environment variables:
- `TTS_ENABLED` (`true`/`false`, default `true`)
- `TTS_VOICE` (default `af_heart`)
- `TTS_LANG_CODE` (default `a`)
- `TTS_SAMPLE_RATE` (default `24000`)
- `TTS_OUTPUT_DIR` (default `stt/output_audio`)

CLI flags:
```bash
python stt/src/main_stt.py \
  --tts-voice af_heart \
  --tts-lang-code a \
  --tts-sample-rate 24000 \
  --tts-output-dir stt/output_audio
```

Disable TTS generation:
```bash
python stt/src/main_stt.py --disable-tts
```

## Notes
- `M` hotkey works on the machine running the server (not browser keyboard input).
- If mic access fails, check OS microphone permissions.
- First run may take longer because Whisper model downloads.
- Kokoro may need a system package on Linux: `espeak-ng`.
- If MP3 conversion via `soundfile` fails, install `ffmpeg` so the fallback converter can run.
