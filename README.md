# MedAPP

MedAPP is a medical instructions and reminder app for doctors.

This repository contains:
- a Python/FastAPI backend in `backend_api/`
- a React/Vite frontend in `Medical_app_UI/`
- Qdrant for vector search
- PostgreSQL for application data

## Repository Layout

Backend:
- `main.py`: backend entrypoint
- `backend_api/bootstrap.py`: app assembly
- `backend_api/STT`: speech-to-text routes and service orchestration
- `backend_api/LLM`: LLM clients and RAG answering pipeline
- `backend_api/RAG`: PDF ingestion, chunking, embeddings, and Qdrant integration
- `backend_api/TTS`: text-to-speech
- `backend_api/db`: PostgreSQL config, migrations, repositories, services, seed, and verification

Frontend:
- `Medical_app_UI/src/main.tsx`: frontend entrypoint
- `Medical_app_UI/src/app`: React UI

Compatibility wrappers:
- the old top-level `llm/`, `rag/`, `stt/`, `tts/`, and `pipeline.py` are compatibility wrappers only
- new backend work should go under `backend_api/`

## Source Of Truth

Database schema:
- source of truth: `backend_api/db/migrations/`
- reference only: `schema.sql`

Environment files:
- runtime config: `.env`
- template: `.env.example`

## Current Architecture

Qdrant:
- embeddings
- vector search

PostgreSQL:
- users
- chat threads
- chat messages
- documents metadata
- document chunks metadata
- message sources
- admin invitations

Important current limitation:
- the current frontend was intentionally not rewritten
- it still talks to the older STT/RAG endpoints
- frontend activity does not yet populate the new PostgreSQL chat tables
- PostgreSQL-backed chat flows can still be tested manually through the backend API

## Backend Quick Start

1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

2. Start infrastructure:

```bash
docker compose up -d
```

3. Create `.env` from the template.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Bash:

```bash
cp .env.example .env
```

4. Set the required values in `.env`.

Minimum local example:

```env
LLM_BACKEND=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=medical_documents

DATABASE_URL=postgresql://medical_user:medical_password@localhost:5432/medical_rag_app

APP_AUTH_SECRET=replace-this-with-a-long-random-secret

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-admin-password
ADMIN_FULL_NAME=MedAPP Admin

PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=change-me-pgadmin
```

If the backend later runs inside Docker Compose instead of on your host machine, use:

```env
DATABASE_URL=postgresql://medical_user:medical_password@postgres:5432/medical_rag_app
```

5. Apply migrations:

```bash
python -m backend_api.db.migrate
```

6. Seed the first admin:

```bash
python -m backend_api.db.seed_admin
```

7. Start the backend:

```bash
python main.py
```

8. Optional smoke test:

```bash
python -m backend_api.db.verify
```

Backend docs:

```text
http://localhost:8000/docs
```

## Frontend Quick Start

The frontend lives in `Medical_app_UI/`.

Install and run:

```bash
cd Medical_app_UI
npm install
npm run dev
```

The Vite dev server is usually:

```text
http://localhost:5173
```

The current UI expects the backend at:

```text
http://localhost:8000
```

## pgAdmin

pgAdmin is included in `docker-compose.yml`.

Open:

```text
http://localhost:5050
```

Login with:

```text
Email: admin@example.com
Password: change-me-pgadmin
```

Then register the PostgreSQL server with:

```text
Host: postgres
Port: 5432
Database: medical_rag_app
Username: medical_user
Password: medical_password
```

Notes:
- inside pgAdmin, use `postgres` as the host because pgAdmin runs in Docker
- from desktop tools like DBeaver, use `localhost`

## Useful Backend Routes

Older STT/RAG flow:
- `GET /health`
- `GET /recording/status`
- `POST /recording/toggle`
- `GET /transcriptions/latest`
- `GET /transcriptions`
- `POST /pipeline/text`
- `GET /responses/latest`
- `GET /responses/latest/audio`
- `GET /responses/latest/audio/mp3`

New PostgreSQL-backed routes:
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/admin-invitations/accept`
- `POST /chat/threads`
- `GET /chat/threads`
- `GET /chat/threads/{thread_id}/messages`
- `POST /chat/threads/{thread_id}/turns`
- `POST /admin/invitations`
- `POST /admin/guidelines/upload`
- `GET /admin/guidelines`
- `POST /admin/guidelines/{document_id}/approve`

## Manual Database Testing

To test PostgreSQL-backed chat persistence without changing the frontend:

1. Open `http://localhost:8000/docs`
2. Call `POST /auth/register` or `POST /auth/login`
3. Copy the returned `access_token`
4. Click `Authorize` in Swagger and paste:

```text
Bearer YOUR_ACCESS_TOKEN
```

5. Call:
- `POST /chat/threads`
- `GET /chat/threads`
- `POST /chat/threads/{thread_id}/turns`
- `GET /chat/threads/{thread_id}/messages`

If Gemini is unavailable and you only want to test the DB-backed routes, you can temporarily run:

```bash
python main.py --disable-llm
```

## Contributor Notes

Backend contributors:
- prefer adding new backend code under `backend_api/`
- keep Qdrant responsible for vector search
- keep PostgreSQL responsible for application data and metadata
- use migrations in `backend_api/db/migrations/` for schema changes
- use parameterized SQL only

Frontend contributors:
- work inside `Medical_app_UI/`
- the current UI still targets the older STT/RAG flow
- wiring the UI into `/auth` and `/chat` is a separate frontend task

Testing:

```bash
python -m unittest
```

## Module Guides

- `backend_api/LLM/README.md`
- `backend_api/RAG/README.md`
- `backend_api/STT/README.md`
- `backend_api/TTS/README.md`
