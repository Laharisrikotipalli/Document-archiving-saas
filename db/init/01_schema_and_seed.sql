-- ============================================================
-- Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    api_key     TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id                  SERIAL PRIMARY KEY,
    tenant_id           INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    original_filename   TEXT NOT NULL,
    storage_key         TEXT NOT NULL UNIQUE,
    file_size           BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);

-- ============================================================
-- Seed data: two known, hardcoded tenants for local testing.
-- In production, api_key generation should use a cryptographically
-- secure random generator (see backend/src/lib/apiKey.js).
-- ============================================================

INSERT INTO tenants (name, api_key)
VALUES
    ('Acme Corp',        'tk_live_acme_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c'),
    ('Globex Industries', 'tk_live_globex_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d')
ON CONFLICT (api_key) DO NOTHING;
