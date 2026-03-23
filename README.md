# MedAPP

Run the whole pipeline with:

```bash
python main.py --gemini-api-key "API"
```

```bash
python main.py --disable-llm
```

The STT module guide is in `stt/README.md`.
The TTS module guide is in `tts/README.md`.

## End-to-end STT/RAG/LLM/TTS pipeline

1) Start Qdrant: `docker compose up -d`  
2) Install deps: `pip install -r requirements.txt`  (now uses `google-genai`)  
3) Run the API (Gemini): `python main.py --gemini-api-key "<your key>" --gemini-model gemini-2.5-flash`  
   or OpenAI-compatible backend:  
   `python main.py \
  --llm-backend openai \
  --llm-base-url "https://llm-api.arc.vt.edu/api/v1" \
  --llm-api-key "<your_key>" \
  --llm-model "gpt-oss-120b"`  
4) Voice path: focus the terminal and press `M` to start/stop recording.  
5) Text path: `curl -X POST http://localhost:8000/pipeline/text -H "Content-Type: application/json" -d '{"text": "Test question"}'`

The pipeline executes: STT (or text) → Gemini (query) → RAG → Gemini (answer) → TTS, and returns both text and audio.
