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

## Install Dependencies

From the project root:

```bash
pip install -r backend_api/LLM/requirements.txt
```

If you want the full backend entrypoint to run with STT, RAG, and TTS together, install the root dependencies instead:

```bash
pip install -r requirements.txt
```

## LLM Providers Supported

This module supports two LLM paths:
- Gemini via `GeminiFlashClient`
- OpenAI-compatible APIs via `LLMEngine`

Current default models:
- Gemini: `gemini-2.5-flash`
- OpenAI-compatible: `gpt-oss-120b`

## Environment Setup

The backend reads LLM-related settings from environment variables.

### Common Variables

```env
LLM_ENABLED=true
LLM_BACKEND=gemini
```

### Gemini Setup

```env
LLM_BACKEND=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Use this when you want the LLM pipeline to call Gemini directly.

### OpenAI-Compatible Setup

```env
LLM_BACKEND=openai
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://llm-api.arc.vt.edu/api/v1
LLM_MODEL=gpt-oss-120b
```

`LLM_API_KEY` can also come from:
- `ARC_API_KEY`
- `OPENAI_API_KEY`

Use this when your provider exposes an OpenAI-compatible API.

## How The LLM Module Is Used

There are two main flows:

1. `llm_engine.py`
- calls an OpenAI-compatible model with the clinical guidance prompt
- used when the backend runs with `--llm-backend openai`

2. `pipeline.py`
- rewrites the user input into a retrieval query
- sends that query to RAG
- generates the final answer from retrieved context
- used by the STT pipeline when LLM is enabled

`prompts.py` stores the prompt text used by these flows.

## Run The Backend With LLM Enabled

From the project root:

### Gemini Example

```bash
python main.py \
  --llm-backend gemini \
  --gemini-api-key "<your_gemini_api_key>" \
  --gemini-model "gemini-2.5-flash"
```

### OpenAI-Compatible Example

```bash
python main.py \
  --llm-backend openai \
  --llm-api-key "<your_api_key>" \
  --llm-base-url "https://llm-api.arc.vt.edu/api/v1" \
  --llm-model "gpt-oss-120b"
```

Disable the LLM layer completely:

```bash
python main.py --disable-llm
```

## Optional RAG Setup

If you want the full LLM + RAG flow, also set up the RAG module:

```bash
docker compose up -d
pip install -r backend_api/RAG/requirements.txt
```

If RAG is enabled, the pipeline becomes:

`input -> structured query -> retrieval -> final answer`

Disable retrieval but keep LLM active:

```bash
python main.py --disable-rag
```

## Quick Python Examples

### Gemini Client

```python
from backend_api.LLM.gemini_flash import GeminiFlashClient

client = GeminiFlashClient(api_key="your_key", model="gemini-2.5-flash")
result = client.generate("Patient has fever and hypotension.")
print(result)
```

### OpenAI-Compatible Client

```python
from backend_api.LLM.llm_engine import LLMEngine

engine = LLMEngine(
    model="gpt-oss-120b",
    base_url="https://llm-api.arc.vt.edu/api/v1",
    api_key="your_key",
)
result = engine.generate("Patient has fever and hypotension.")
print(result)
```

## Notes

- The prompt strings are already defined in `prompts.py` and are used as-is by the module.
- The module itself does not require Qdrant unless you use the RAG-backed pipeline.
- If `LLM_ENABLED=false` or `--disable-llm` is used, the backend skips LLM generation.
