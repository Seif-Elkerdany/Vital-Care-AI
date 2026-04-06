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
