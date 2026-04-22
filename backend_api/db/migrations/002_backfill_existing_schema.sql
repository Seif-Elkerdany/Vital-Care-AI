CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE users
SET role = 'doctor'
WHERE role IS NULL;

ALTER TABLE IF EXISTS users
    ALTER COLUMN role SET DEFAULT 'doctor',
    ALTER COLUMN role SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('doctor', 'admin'));
    END IF;
END $$;

ALTER TABLE IF EXISTS chat_threads
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE chat_threads
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE IF EXISTS chat_threads
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE IF EXISTS chat_messages
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS chat_messages
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE IF EXISTS documents
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS file_url TEXT,
    ADD COLUMN IF NOT EXISTS version TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS uploaded_by UUID,
    ADD COLUMN IF NOT EXISTS approved_by UUID,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE documents
SET status = 'draft'
WHERE status IS NULL;

ALTER TABLE IF EXISTS documents
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_status_check'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_status_check
            CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_uploaded_by_fkey'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_uploaded_by_fkey
            FOREIGN KEY (uploaded_by) REFERENCES users(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_approved_by_fkey'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_approved_by_fkey
            FOREIGN KEY (approved_by) REFERENCES users(id);
    END IF;
END $$;

ALTER TABLE IF EXISTS document_chunks
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS document_chunks
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE IF EXISTS message_sources
    ADD COLUMN IF NOT EXISTS similarity_score DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS rerank_score DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS message_sources
    ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE IF EXISTS admin_invitations
    ADD COLUMN IF NOT EXISTS accepted_user_id UUID,
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS admin_invitations
    ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'admin_invitations_accepted_user_id_fkey'
    ) THEN
        ALTER TABLE admin_invitations
            ADD CONSTRAINT admin_invitations_accepted_user_id_fkey
            FOREIGN KEY (accepted_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_threads_user_updated_at
    ON chat_threads (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created_at
    ON chat_messages (thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_chunk_index
    ON document_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_message_sources_message_id
    ON message_sources (message_id);

CREATE INDEX IF NOT EXISTS idx_message_sources_chunk_id
    ON message_sources (chunk_id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_admin_invitation_per_email
    ON admin_invitations (email)
    WHERE accepted_at IS NULL
      AND revoked_at IS NULL;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS chat_threads_set_updated_at ON chat_threads;
CREATE TRIGGER chat_threads_set_updated_at
    BEFORE UPDATE ON chat_threads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
