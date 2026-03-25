# MedAPP UI Demo

This folder contains a demo FastAPI app and browser UI for the full MedAPP pipeline:

- browser microphone recording
- STT transcription
- LLM query generation
- RAG retrieval from Qdrant
- LLM answer generation
- TTS response playback
- PDF ingestion and deletion for the RAG index

## Run Order

Start things in this order:

1. Start Qdrant with Docker
2. Install the required Python packages
3. Run the UI FastAPI server

## 1. Start Qdrant

From the project root:

```bash
docker compose up -d
```

This starts the Qdrant database used by the RAG service.

By default, the app expects:

```env
QDRANT_URL=http://localhost:6333
```

## 2. Install Dependencies

From the project root, with your virtual environment activated:

```bash
pip install -r ui/requirements.txt
```

This installs the UI dependencies plus the STT, RAG, and TTS dependencies referenced by `ui/requirements.txt`.

## 3. Configure Environment Variables

Make sure your root `.env` file contains the values needed by the pipeline.

Important variables:

```env
LLM_BACKEND=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=medical_documents

TTS_ENABLED=true
RAG_ENABLED=true
LLM_ENABLED=true
```

If you want to use the OpenAI-compatible backend instead of Gemini:

```env
LLM_BACKEND=openai
LLM_API_KEY=your_key_here
LLM_BASE_URL=your_base_url_here
LLM_MODEL=your_model_here
```

## 4. Run the UI Server

From the project root:

```bash
python ui/demo_api.py
```

Or with reload during development:

```bash
python ui/demo_api.py --reload
```

By default, the server runs on:

```text
http://127.0.0.1:8010
```

Open that URL in your browser.

## Using the UI

### Ask by voice

1. Open the UI in the browser
2. Click `Start Talking`
3. Allow microphone access
4. Speak
5. Click `Stop Recording`

The app will:

1. send audio to the backend
2. transcribe it with STT
3. run the LLM + RAG pipeline
4. generate TTS audio
5. play the response in the browser

### Ask by text

1. Type your question in the text box
2. Click `Run Pipeline`

### Add PDFs to RAG

1. Select one or more PDF files
2. Confirm they appear in the selected-files preview
3. Click `Ingest Selected PDFs`

### Delete indexed PDFs

Use the `Delete` button on any indexed document card.

### Refresh the indexed documents list

Use the `Refresh` button to reload the current document list from the backend.

## Notes

- The current RAG service indexes PDF files only.
- Qdrant must be running before the UI server starts if RAG is enabled.
- The first Whisper model load may take some time.
- Browser autoplay policies may block automatic audio playback; if that happens, use the built-in audio player controls.
- If you use Gemini free tier, quota errors may happen quickly because the pipeline can call Gemini more than once per request.

## Common Commands

From the project root:

```bash
docker compose up -d
pip install -r ui/requirements.txt
python ui/demo_api.py --reload
```
