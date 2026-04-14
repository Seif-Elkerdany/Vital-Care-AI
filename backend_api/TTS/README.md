# TTS Module

This module contains the text-to-speech layer for MedAPP.

It is responsible for:
- synthesizing speech from text
- encoding WAV output
- exposing standalone HTTP and websocket TTS endpoints
- providing the lightweight `TTSEngine` wrapper used by STT

Main files:
- `config.py`: TTS defaults
- `contracts.py`: protocol and data contracts
- `synthesizers.py`: Kokoro synthesizer adapter
- `encoders.py`: WAV encoding helpers
- `service.py`: core TTS orchestration
- `bootstrap.py`: service construction
- `tts_engine.py`: simple wrapper used by the STT flow
- `app.py`: standalone FastAPI app
- `api/controller.py`: REST and websocket handlers

This module is called by `backend_api.STT` to synthesize spoken responses and can also run as a standalone TTS service.

## Install Dependencies

From the project root:

```bash
pip install -r backend_api/TTS/requirements.txt
```

If you want the full MedAPP backend instead of only TTS:

```bash
pip install -r requirements.txt
```

## What TTS Uses

This module uses:
- Kokoro for speech synthesis
- FastAPI for the standalone HTTP and websocket API
- `soundfile` for WAV encoding

Current defaults:
- voice: `af_heart`
- language code: `a`
- sample rate: `24000`

## Environment Setup

When TTS is used through the main backend, these settings control it:

```env
TTS_ENABLED=true
TTS_VOICE=af_heart
TTS_LANG_CODE=a
TTS_SAMPLE_RATE=24000
TTS_OUTPUT_DIR=stt/output_audio
```

These same values are also available as CLI flags through `main.py`.

## Run TTS Through The Main Backend

From the project root:

```bash
python main.py
```

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

## Run The Standalone TTS API

You can also run this module as its own FastAPI app.

From the project root:

```bash
PYTHONPATH=. uvicorn backend_api.TTS.app:app --host 0.0.0.0 --port 8001
```

## Standalone TTS Endpoints

- `GET /`
- `GET /synthesize?text=hello`
- `POST /synthesize`
- `WS /ws/tts`

Example requests:

```bash
curl "http://127.0.0.1:8001/synthesize?text=hello" --output sample.wav
```

```bash
curl -X POST "http://127.0.0.1:8001/synthesize" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"hello from TTS\"}" \
  --output sample.wav
```

## Use TTS From Python

Through `TTSEngine`:

```python
from backend_api.TTS.tts_engine import TTSEngine

engine = TTSEngine(
    voice="af_heart",
    lang_code="a",
    sample_rate=24000,
)
wav_bytes = engine.synthesize("Hello from MedAPP")
```

Through `TTSService`:

```python
from backend_api.TTS.bootstrap import build_tts_service

service = build_tts_service(
    default_voice="af_heart",
    lang_code="a",
    sample_rate=24000,
)
wav_bytes = service.synthesize_bytes("Hello from MedAPP")
```

## Notes

- On Linux, Kokoro may need the system package `espeak-ng`.
- `soundfile` is required when WAV encoding is actually used.
- This module can run on its own or as part of the main STT -> LLM/RAG -> TTS backend flow.

## Install Dependencies

From the project root:

```bash
pip install -r backend_api/TTS/requirements.txt
```

If you want the full MedAPP backend instead of only TTS:

```bash
pip install -r requirements.txt
```

## What TTS Uses

This module uses:
- Kokoro for speech synthesis
- FastAPI for the standalone HTTP and websocket API
- `soundfile` for WAV encoding

Current defaults:
- voice: `af_heart`
- language code: `a`
- sample rate: `24000`

## Environment Setup

When TTS is used through the main backend, these variables control it:

```env
TTS_ENABLED=true
TTS_VOICE=af_heart
TTS_LANG_CODE=a
TTS_SAMPLE_RATE=24000
TTS_OUTPUT_DIR=stt/output_audio
```

These values are also available as CLI flags through `main.py`.

## Run TTS Through The Main Backend

From the project root:

```bash
python main.py
```

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

## Run The Standalone TTS API

You can also run this module as its own FastAPI app.

From the project root:

```bash
PYTHONPATH=. uvicorn backend_api.TTS.app:app --host 0.0.0.0 --port 8001
```

## Standalone TTS Endpoints

- `GET /`
- `GET /synthesize?text=hello`
- `POST /synthesize`
- `WS /ws/tts`

Example requests:

```bash
curl "http://127.0.0.1:8001/synthesize?text=hello" --output sample.wav
```

```bash
curl -X POST "http://127.0.0.1:8001/synthesize" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"hello from TTS\"}" \
  --output sample.wav
```

## Use TTS From Python

### Through `TTSEngine`

```python
from backend_api.TTS.tts_engine import TTSEngine

engine = TTSEngine(
    voice="af_heart",
    lang_code="a",
    sample_rate=24000,
)
wav_bytes = engine.synthesize("Hello from MedAPP")
```

### Through `TTSService`

```python
from backend_api.TTS.bootstrap import build_tts_service

service = build_tts_service(
    default_voice="af_heart",
    lang_code="a",
    sample_rate=24000,
)
wav_bytes = service.synthesize_bytes("Hello from MedAPP")
```

## Notes

- On Linux, Kokoro may need the system package `espeak-ng`.
- `soundfile` is required when WAV encoding is actually used.
- The TTS layer can run on its own or as part of the STT -> LLM/RAG -> TTS backend flow.
