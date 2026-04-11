# Database Setup

This repo is built around PostgreSQL. For the current FastAPI plus static frontend architecture, the practical default is Neon.

## Recommended choice

- Primary recommendation: Neon
- Alternative when you also want platform Auth, Storage, and a hosted admin UI: Supabase

## Neon Free quick start for this repo

1. Create a free Neon project and database.
2. Copy the pooled Postgres connection string from the Neon dashboard.
3. Set it as `DATABASE_URL_NEON` locally or in your deployment platform.
4. Start the API service.
5. Verify `/healthz`, `/api/sequences/summary`, and `/api/knowledge/summary`.

### Local development

Use the example in [.env.example](../.env.example) and set:

```env
DATABASE_URL_NEON=postgresql://USER:PASSWORD@YOUR-NEON-HOST.neon.tech/portfolio?sslmode=require
```

Then run the API locally from the repo root:

```bash
uvicorn site_api.main:app --host 0.0.0.0 --port 8000
```

The backend will create the required tables automatically on first use.

If you want a one-command verification after setting the connection string, run:

```bash
python scripts/check_api_db.py
```

On Windows PowerShell, you can also let the repo load the Neon URL for you, save it to a local ignored file, and run the check in one step:

```powershell
.\scripts\use_neon.ps1 -Save
```

The script reads `DATABASE_URL_NEON` from `.env.neon.local` when it already exists, or prompts you to paste the Neon pooled connection string.

If the API is already running locally, you can also validate the key summary endpoints:

```bash
python scripts/check_api_db.py --api-base-url http://127.0.0.1:8000
```

If you want the PowerShell helper to start the API after the DB check passes, run:

```powershell
.\scripts\use_neon.ps1 -StartApi
```

### Render deployment

The API service in [render.yaml](../render.yaml) already supports `DATABASE_URL_NEON`.

Set these environment variables on the `donttalk-api` service:

- `DATABASE_URL_NEON`: your Neon pooled connection string
- `SYNC_SECRET`: optional but recommended if you expose sync endpoints publicly
- `CORS_ALLOW_ORIGINS`: optional if you use a custom frontend hostname

### What this avoids

- No database driver changes
- No schema rewrite
- No MongoDB or Firebase migration work
- No paid vector database requirement for the current app shape

### Recommended validation

After setting the connection string, check these endpoints:

1. `GET /healthz`
2. `GET /api/sequences/summary`
3. `GET /api/knowledge/summary`
4. `GET /api/market/summary`

You can check all of them with [scripts/check_api_db.py](../scripts/check_api_db.py) instead of calling each route manually.

If `healthz` works but the summary routes return 503, the database URL is usually missing, invalid, or not yet reachable from the deployed API service.

## Why Neon is the default here

- The backend already uses plain PostgreSQL through psycopg.
- Neon is a direct fit for this codebase with no schema or driver changes.
- Scale-to-zero works well for a portfolio or low-duty sync service.
- Connection pooling is available if the API container starts churning connections.

## When Supabase is the better pick

- You want PostgreSQL plus hosted Auth.
- You want object storage without adding another provider.
- You want a built-in dashboard for table inspection and SQL.

## Environment variable priority

The backend resolves database URLs in this order:

1. DATABASE_URL
2. POSTGRES_URL
3. POSTGRES_URL_NON_POOLING
4. DATABASE_URL_NEON
5. DATABASE_URL_SUPABASE
6. DATABASE_URL_COCKROACH
7. DATABASE_URL_AIVEN
8. DATABASE_URL_RAILWAY

Set one primary variable whenever possible. If you set both Neon and Supabase, Neon wins because it is checked first.

## Recommended env values

### Neon

Use the pooled connection string for normal API traffic.

```env
DATABASE_URL_NEON=postgresql://USER:PASSWORD@YOUR-NEON-HOST.neon.tech/portfolio?sslmode=require
```

### Supabase

Use the direct Postgres connection string if you only need the database, or a pooled endpoint if your project plan exposes one.

```env
DATABASE_URL_SUPABASE=postgresql://postgres:PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres?sslmode=require
```

## Notes for this repo

- The backend already sanitizes connection strings and adds sslmode=require plus a short connect timeout when missing.
- Render and Railway configs already declare DATABASE_URL_NEON and DATABASE_URL_SUPABASE as supported env keys.
- For local work, copy from .env.example into your own untracked env file or shell session.
- For CI and hosted backends, set the chosen value in the platform secret manager instead of committing it.
