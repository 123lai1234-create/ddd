# Database Setup

This repo is built around PostgreSQL. For the current FastAPI plus static frontend architecture, the practical default is Neon.

## Recommended choice

- Primary recommendation: Neon
- Alternative when you also want platform Auth, Storage, and a hosted admin UI: Supabase

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