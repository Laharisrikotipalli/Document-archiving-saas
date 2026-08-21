# Multi-Tenant Document Archiving SaaS

A secure, multi-tenant document archiving service built on a containerized
backend API, PostgreSQL for metadata, MinIO (S3-compatible) for object
storage, and a tenant-facing Python CLI.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Layout](#project-layout)
- [Prerequisites](#prerequisites)
- [1. Run the Backend Stack](#1-run-the-backend-stack)
- [2. Install and Use the CLI](#2-install-and-use-the-cli)
- [3. API Reference](#3-api-reference)
- [4. Cloud Storage Lifecycle Policy](#4-cloud-storage-lifecycle-policy)
- [5. Switching from MinIO to Real Cloud Storage](#5-switching-from-minio-to-real-cloud-storage)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
Tenant CLI  →  SaaS Backend API (Node/Express)
                      │            │
                      ▼            ▼
          PostgreSQL (metadata)   MinIO/S3 (files, via pre-signed URLs)
```

Files never pass through the API server — the API only issues short-lived
pre-signed URLs, and the CLI uploads/downloads directly to/from object
storage.

---

## Project Layout

```
.
├── docker-compose.yml       # api + db + storage (MinIO), health-checked
├── .env.example              # all required environment variables
├── lifecycle-policy.json     # S3 bucket lifecycle rules (IA @ 30d, expire @ 365d)
├── db/
│   └── init/                 # SQL seed scripts auto-run by Postgres on first boot
│       └── 01_schema_and_seed.sql
├── backend/                  # Node.js / Express API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/
│       │   └── auth.js
│       ├── routes/
│       │   └── documents.js
│       └── lib/
│           ├── storage.js
│           └── apiKey.js
└── cli/                       # Python (click) tenant CLI
    ├── setup.py
    ├── requirements.txt
    └── archive/
        ├── cli.py
        ├── api.py
        └── config.py
```

---

## Prerequisites

| Tool                | Required for       |
|----------------------|--------------------|
| Docker & Docker Compose | Backend stack (`api`, `db`, `storage`) |
| Python ≥ 3.8         | Tenant CLI          |
| AWS CLI (optional)   | Applying the S3 lifecycle policy to a real bucket |

---

## 1. Run the Backend Stack

```bash
cp .env.example .env   # optional — defaults already work locally
docker-compose up --build -d
```

This brings up three services — `api`, `db`, and `storage` — plus a
one-shot `createbuckets` job that provisions the MinIO bucket. All
services define health checks, and `api` waits for **both** `db` and
`storage` to report healthy (`depends_on: condition: service_healthy`)
before starting.

On first boot, the `db` container automatically seeds the `tenants` and
`documents` tables and inserts two sample tenants with hardcoded API keys
(see [`db/init/01_schema_and_seed.sql`](db/init/01_schema_and_seed.sql)):

| Tenant             | API Key                                       |
|---------------------|------------------------------------------------|
| Acme Corp           | `tk_live_acme_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c`   |
| Globex Industries   | `tk_live_globex_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d` |

Verify the stack is up:

```bash
curl http://localhost:3000/health
```

---

## 2. Install and Use the CLI

```bash
cd cli
python -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -e .
```

```bash
archive configure --api-url http://localhost:3000 --api-key tk_live_acme_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c

echo "hello world" > test.txt
archive upload ./test.txt
archive list
archive download <document_id> --output-path ./downloaded_test.txt
```

| Command                                             | Description                                |
|-------------------------------------------------------|---------------------------------------------|
| `archive configure --api-url <url> --api-key <key>`   | Saves credentials to `~/.archive/config.json` |
| `archive upload <filepath>`                            | Uploads a file to the archive               |
| `archive list`                                          | Lists all documents for the configured tenant |
| `archive download <document_id> --output-path <path>` | Downloads a document by ID                  |

---

## 3. API Reference

All endpoints except `/health` require an `X-API-Key` header.

| Method | Path                              | Description                    |
|--------|------------------------------------|----------------------------------|
| GET    | `/health`                          | Unauthenticated health check     |
| POST   | `/documents/upload-url`            | Get a pre-signed PUT URL         |
| POST   | `/documents/confirm`               | Register uploaded file metadata  |
| GET    | `/documents`                       | List the tenant's documents      |
| GET    | `/documents/{id}/download-url`     | Get a pre-signed GET URL         |

**Tenant isolation:**
- `storage_key` values are namespaced as `tenant_<id>/...`.
- All database queries are scoped to `req.tenant.id`.
- Requesting another tenant's document returns `404 Not Found` (not
  `401`/`403`), to avoid leaking whether the document exists at all.

---

## 4. Cloud Storage Lifecycle Policy

[`lifecycle-policy.json`](lifecycle-policy.json) is in native AWS S3
`PutBucketLifecycleConfiguration` format and defines two rules:

- Transition objects to `STANDARD_IA` after **30 days**
- Expire (permanently delete) objects after **365 days**

To apply it to a real bucket:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket <your-bucket-name> \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

## 5. Switching from MinIO to Real Cloud Storage

Nothing in the backend code is MinIO-specific — it uses the standard AWS
S3 SDK against a configurable endpoint. To point at real AWS S3 (or any
S3-compatible provider such as GCS), just change the environment
variables:

```env
CLOUD_STORAGE_ENDPOINT_URL=            # leave empty/unset for real AWS S3
CLOUD_STORAGE_REGION=us-east-1
CLOUD_STORAGE_ACCESS_KEY_ID=<real key>
CLOUD_STORAGE_SECRET_ACCESS_KEY=<real secret>
CLOUD_STORAGE_FORCE_PATH_STYLE=false
```

---

## Security Notes

- The two seeded tenant API keys are for **local development only** —
  rotate or replace them before any shared/production use.
- Production keys should be generated with
  [`backend/src/lib/apiKey.js`](backend/src/lib/apiKey.js), which uses
  cryptographically secure random bytes.
- `.env` is git-ignored by default (`.env.example` is the only template
  committed) — never commit real credentials.
- The CLI config file (`~/.archive/config.json`) stores your API key in
  plaintext with `0600` permissions; treat it like any other credential
  file.

---

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                        |
|---------------------------------------------|-------------------------------------------------------------------------|
| `curl http://localhost:3000/health` hangs or fails | Containers still starting — check `docker-compose ps` and wait for health checks to pass |
| `archive` command not found after `pip install -e .` | Virtual environment not activated, or shell PATH not refreshed |
| `401 Invalid API key`                      | Re-run `archive configure` with the correct tenant key                    |
| `403 storage_key does not belong to this tenant` | You're mixing storage keys/credentials across two configured tenants |
| Upload/download to MinIO fails from inside a container | Ensure `CLOUD_STORAGE_ENDPOINT_URL` resolves to `storage:9000` (Docker network), not `localhost` |