# Partnr Archive — Multi-Tenant Document Archiving SaaS

A secure, multi-tenant document archiving service: a containerized backend API,
PostgreSQL for metadata, MinIO (S3-compatible) for object storage, and a
tenant-facing CLI.

## Architecture

```
Tenant CLI  →  API Gateway  →  SaaS Backend API (Node/Express)
                                      │            │
                                      ▼            ▼
                          PostgreSQL (metadata)   MinIO/S3 (files, via pre-signed URLs)
```

Files never pass through the API server — the API only issues short-lived
pre-signed URLs, and the CLI uploads/downloads directly to/from object storage.

## Project Layout

```
.
├── docker-compose.yml       # api + db + storage (MinIO), health-checked
├── .env.example              # all required environment variables
├── lifecycle-policy.json     # S3 bucket lifecycle rules (IA @ 30d, expire @ 365d)
├── db/init/                  # SQL seed scripts auto-run by Postgres on first boot
├── backend/                  # Node.js/Express API + Dockerfile
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/auth.js
│       ├── routes/documents.js
│       └── lib/{storage.js, apiKey.js}
└── cli/                       # Python (click) tenant CLI
    └── archive/{cli.py, api.py, config.py}
```

## 1. Run the backend stack

```bash
cp .env.example .env   # optional — defaults already work locally
docker-compose up --build -d
```

This brings up three services (`api`, `db`, `storage`) plus a one-shot
`createbuckets` job. All services have health checks; `api` waits for `db`
to be healthy via `depends_on: condition: service_healthy`. The database
container automatically seeds the `tenants` and `documents` tables and
inserts two sample tenants with hardcoded API keys (see
`db/init/01_schema_and_seed.sql`):

| Tenant           | API Key                                             |
|------------------|------------------------------------------------------|
| Acme Corp        | `tk_live_acme_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c`       |
| Globex Industries| `tk_live_globex_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`     |

Check health:
```bash
curl http://localhost:3000/health
```

## 2. Install and use the CLI

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

## 3. API Reference

All endpoints except `/health` require an `X-API-Key` header.

| Method | Path                          | Description                          |
|--------|-------------------------------|---------------------------------------|
| POST   | `/documents/upload-url`       | Get a pre-signed PUT URL              |
| POST   | `/documents/confirm`          | Register uploaded file metadata       |
| GET    | `/documents`                  | List the tenant's documents           |
| GET    | `/documents/{id}/download-url`| Get a pre-signed GET URL              |

Tenant isolation: `storage_key` values are namespaced as `tenant_<id>/...`,
all queries are scoped to `req.tenant.id`, and requesting another tenant's
document returns `404 Not Found` (not 401/403) to avoid leaking existence.

## 4. Cloud Storage Lifecycle Policy

`lifecycle-policy.json` is in native AWS S3 `PutBucketLifecycleConfiguration`
format and defines two rules: transition objects to `STANDARD_IA` after 30
days, and expire (permanently delete) objects after 365 days. To apply it to
a real bucket:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket <your-bucket-name> \
  --lifecycle-configuration file://lifecycle-policy.json
```

## Switching from MinIO to real cloud storage

Nothing in the code is MinIO-specific. To point at real AWS S3 / GCS (via
its S3-compatible API), just change the env vars:

```
CLOUD_STORAGE_ENDPOINT_URL=            # leave empty/unset for real AWS S3
CLOUD_STORAGE_REGION=us-east-1
CLOUD_STORAGE_ACCESS_KEY_ID=<real key>
CLOUD_STORAGE_SECRET_ACCESS_KEY=<real secret>
CLOUD_STORAGE_FORCE_PATH_STYLE=false
```
