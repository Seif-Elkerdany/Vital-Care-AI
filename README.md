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
AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS=3600

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
APP_RESET_PASSWORD_URL_BASE=http://localhost:5173/reset-password

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

Auth and reset-password notes:
- `APP_AUTH_SECRET` should be a long random value and the same running backend must keep using it while tokens are active.
- `AUTH_TOKEN_TTL_SECONDS` controls access token lifetime.
- `AUTH_REFRESH_TOKEN_TTL_SECONDS` controls refresh/session lifetime.
- `AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS` controls how long password reset links stay valid.
- For Gmail SMTP, `SMTP_PASSWORD` must be a Gmail app password, not the normal Gmail login password.
- `APP_RESET_PASSWORD_URL_BASE` is the frontend page used in reset emails. With `http://localhost:5173/reset-password`, the link only works on the same computer running the Vite frontend on port `5173`.
- For another local device, use the frontend host machine IP, for example `http://192.168.1.25:5173/reset-password`.
- For deployment, use the deployed frontend URL, for example `https://your-domain.com/reset-password`.
- The reset email is only sent when all SMTP variables and `APP_RESET_PASSWORD_URL_BASE` are present.
- The requested reset email must belong to an existing user in the current database. Unknown emails intentionally receive a generic success response and no email is sent.

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

Frontend modes:
- mobile UI (primary): `Medical_app_UI/index.html` with `app.js` and `app.css`
- react/web UI: `Medical_app_UI/react.html` with `src/` React code
- both modes call the same backend auth routes

Mobile UI auth notes:
- mobile login/register is built into `index.html` and `app.js`
- mobile profile values are saved per authenticated user in browser local storage
- if not authenticated, mobile navigation is gated and the auth screen is shown first

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
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/admin-invitations/accept`
- `POST /chat/threads`
- `GET /chat/threads`
- `GET /chat/threads/{thread_id}/messages`
- `POST /chat/threads/{thread_id}/turns`
- `POST /admin/invitations`
- `POST /admin/guidelines/upload`
- `GET /admin/guidelines`
- `POST /admin/guidelines/{document_id}/approve`

## Auth And Password Reset

Registration and login:
- user emails are normalized to lowercase and validated for normal email format
- passwords must be at least 8 characters
- passwords are stored as salted hashes, never as plain text
- login returns an access token, refresh token, and user payload
- logout revokes the current session
- password reset revokes existing sessions after the password changes

Password reset flow:

1. A registered user requests a reset:

```http
POST /auth/password-reset/request
```

```json
{
  "email": "doctor@example.com"
}
```

2. If SMTP is configured and the user exists, the backend emails a link like:

```text
http://localhost:5173/reset-password?token=RESET_TOKEN
```

3. The reset page must read the `token` query parameter and call:

```http
POST /auth/password-reset/confirm
```

```json
{
  "token": "RESET_TOKEN",
  "new_password": "newsecretpass"
}
```

4. The backend validates the one-time token, checks expiry, updates the password, marks the token used, and revokes old sessions.

Important:
- the backend does not verify that an inbox exists during registration
- it validates email format only
- inbox ownership can be added later with an email verification-link flow

## Frontend Auth Integration Checklist

Backend base URL:

```text
http://localhost:8000
```

Register:

```http
POST /auth/register
```

```json
{
  "email": "doctor@example.com",
  "password": "secretpass",
  "full_name": "Doctor One"
}
```

Login:

```http
POST /auth/login
```

```json
{
  "email": "doctor@example.com",
  "password": "secretpass"
}
```

Register and login return:

```json
{
  "access_token": "ACCESS_TOKEN",
  "refresh_token": "REFRESH_TOKEN",
  "token_type": "bearer",
  "user": {
    "id": "USER_ID",
    "email": "doctor@example.com",
    "full_name": "Doctor One",
    "role": "doctor",
    "created_at": "2026-04-23T12:00:00Z",
    "updated_at": "2026-04-23T12:00:00Z"
  }
}
```

Authenticated requests:

```http
Authorization: Bearer ACCESS_TOKEN
```

Current user:

```http
GET /auth/me
```

Refresh tokens:

```http
POST /auth/refresh
```

```json
{
  "refresh_token": "REFRESH_TOKEN"
}
```

Logout:

```http
POST /auth/logout
Authorization: Bearer ACCESS_TOKEN
```

Request password reset:

```http
POST /auth/password-reset/request
```

```json
{
  "email": "doctor@example.com"
}
```

The backend sends an email link using:

```text
APP_RESET_PASSWORD_URL_BASE?token=RESET_TOKEN
```

The frontend reset page should read `token` from the URL and confirm the new password:

```http
POST /auth/password-reset/confirm
```

```json
{
  "token": "RESET_TOKEN",
  "new_password": "newsecretpass"
}
```

Chat routes use the same bearer token:
- `POST /chat/threads`
- `GET /chat/threads`
- `GET /chat/threads/{thread_id}/messages`
- `POST /chat/threads/{thread_id}/turns`

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
pytest
```

## Module Guides

- `backend_api/LLM/README.md`
- `backend_api/RAG/README.md`
- `backend_api/STT/README.md`
- `backend_api/TTS/README.md`
