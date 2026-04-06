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
