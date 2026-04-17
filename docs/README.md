# Protein Design AI — Portfolio Project

A full-stack portfolio demonstrating protein sequence optimisation using ESM-2
embeddings, Bayesian Optimisation, ProteinMPNN, and REINFORCE reinforcement
learning, combined with a bioinformatics data API and a personal portfolio site.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Astro (static), vanilla HTML/JS pages |
| Backend API | FastAPI (`site_api/`) |
| ML pipeline | PyTorch, Hugging Face Transformers, Botorch |
| Database | PostgreSQL (Neon recommended) |
| Cache | Redis (Upstash) |
| Deployment | Vercel (frontend) · Render / Fly.io (backend) |

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env
# edit .env with your DATABASE_URL and API keys

# 2. Install Python dependencies
pip install -r site_api/requirements.txt

# 3. Run the backend
uvicorn site_api.main:app --reload

# 4. (Optional) Run the ML pipeline
python scripts/run_pipeline.py
```

## Project Layout

```
frontend/       Static HTML portfolio pages
site_api/       FastAPI backend — routes, models, data sources
src/            ML pipeline (ESM-2, ProteinMPNN, Bayesian Opt, REINFORCE)
scripts/        Build and automation scripts
tests/          Pytest unit tests
docs/           Deployment and setup guides
migrations/     Alembic database migrations
outputs/        ML training plots and results
```

## Data Sources

**Bioinformatics:** UniProt, Ensembl, NCBI PubMed, OpenTargets, ChEMBL, Reactome, QuickGO  
**Market:** TWSE, TAIFEX, Yahoo Finance

## Deployment Guides

- [Database Setup](DATABASE_SETUP.md)
- [Render Deployment](DEPLOY_RENDER.md)
- [Fly.io Deployment](DEPLOY_FLY.md)
- [CI/CD Automation](DEPLOY_AUTOMATION.md)
