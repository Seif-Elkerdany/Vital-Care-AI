# LLM Module

This module contains the MedAPP language-model layer.

It is responsible for:
- the OpenAI-compatible clinical guidance call
- the Gemini client wrapper
- the LLM + RAG pipeline
- the shared prompt definitions used by those components

Main files:
- `prompts.py`: verbatim prompt strings used across the backend
- `llm_engine.py`: OpenAI-compatible LLM client for clinical guidance
- `gemini_flash.py`: Gemini Flash client wrapper
- `guidance.py`: guidance helper built on the OpenAI-compatible client
- `pipeline.py`: structured-query and final-answer pipeline around RAG

This module connects to `backend_api.RAG` for retrieval and is used by `backend_api.STT` to turn transcripts into structured responses.
