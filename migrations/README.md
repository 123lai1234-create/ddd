# Database Migrations

This directory contains Alembic database migration scripts.

## Setup

```bash
pip install alembic sqlalchemy psycopg[binary]
```

## Usage

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1
```

## Note

The existing schema is managed via `site_api/schemas.py` with `CREATE IF NOT EXISTS` statements.
Alembic migrations are intended for future schema changes that require data migration or
careful ordering.
