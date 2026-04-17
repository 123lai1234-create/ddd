# Project Structure

## Root

| File | Purpose |
|------|---------|
| `Dockerfile` / `Dockerfile.web` | Backend and frontend containers |
| `docker-compose.yml` | Local dev orchestration |
| `requirements.txt` | Root-level ML Python deps |
| `vercel.json` | Vercel frontend deployment |
| `netlify.toml` | Netlify alternative deployment |
| `render.yaml` | Render backend deployment |
| `fly.toml` | Fly.io backend deployment |
| `wrangler.toml` | Cloudflare Workers config |
| `alembic.ini` | Database migration config |
| `ruff.toml` | Python linter config |

## `frontend/`

Static HTML portfolio pages served directly or via Vercel/Netlify.

| File | Page |
|------|------|
| `index.html` | Home / landing |
| `about_me.html` | Bio and CV |
| `works.html` | Projects portfolio |
| `gene_ai.html` | AI gene analysis tool |
| `protein_mpnn.html` | Protein sequence generation |
| `ngs.html` | Next-gen sequencing analysis |
| `interview_prep.html` | Interview prep tool |
| `game.html` | Interactive demo/game |
| `report.html` | Research report |
| `thesis.html` | Thesis summary |
| `ingest.html` | Data ingestion interface |
| `firmware.html` | Firmware/embedded systems page |

## `site_api/`

FastAPI backend. Entry point: `main.py`.

| File | Role |
|------|------|
| `main.py` | App factory, startup, middleware |
| `routes.py` | All API endpoints |
| `models.py` | SQLAlchemy ORM models |
| `schemas.py` | Pydantic request/response schemas |
| `services.py` | Business logic |
| `db.py` | Database connection and pooling |
| `cache.py` | Redis caching layer |
| `http_client.py` | Shared HTTP client utilities |
| `shared_utils.py` | Common helpers |
| `bioinfo_utils.py` | Bioinformatics helpers |
| `auto_sync.py` | Scheduled background sync |
| `*_sources.py` | Data source modules (see below) |

### Data Source Modules

| Module | Source |
|--------|--------|
| `sequence_sources.py` | UniProt, Ensembl |
| `sequencing_run_sources.py` | Sequencing run data |
| `knowledge_sources.py` | NCBI PubMed, Semantic Scholar |
| `opentargets_sources.py` | OpenTargets drug-disease |
| `chembl_sources.py` | ChEMBL chemical biology |
| `pathway_sources.py` | Reactome, QuickGO |
| `structure_sources.py` | Protein structures |
| `variant_sources.py` | Genetic variants (NCBI, COSMIC) |
| `interaction_sources.py` | Protein interactions |
| `population_sources.py` | Population genetics |
| `market_sources.py` | TWSE, TAIFEX, Yahoo Finance |
| `economic_sources.py` | FRED macroeconomic data |

## `src/`

ML pipeline modules. Entry point: `predictor.py`.

| File | Algorithm |
|------|-----------|
| `embeddings.py` | ESM-2 protein embeddings |
| `protein_mpnn.py` | ProteinMPNN graph neural network |
| `bayes_opt.py` | Bayesian Optimisation (Botorch) |
| `rl_reinforce.py` | REINFORCE policy gradient |
| `alphafold.py` | AlphaFold 2 integration |
| `esm_fold.py` | ESMFold structure prediction |
| `rosetta_score.py` | Rosetta energy scoring |
| `predictor.py` | Unified prediction interface |
| `data_prep.py` | Data preprocessing |
| `structure_utils.py` | Structure manipulation |
| `visualize.py` | UMAP and result visualisation |
| `config.py` | Environment-based configuration |
| `constants.py` | Model constants |

## `scripts/`

| Script | Purpose |
|--------|---------|
| `run_pipeline.py` | Run the full ML pipeline |
| `build_static_site.sh` | Build and publish the Astro site |
| `sync_frontend_heads.mjs` | Sync frontend HTML head tags |
| `write_vercel_output_config.mjs` | Write Vercel output config |
| `check_api_db.py` | Validate database connectivity |
| `use_neon.ps1` | PowerShell helper to switch to Neon |

## `tests/`

Pytest unit tests for backend modules. Run with `pytest tests/`.

## `migrations/`

Alembic database migrations. Run with `alembic upgrade head`.

## `outputs/`

ML training plots: loss curves, UMAP embeddings, evaluation results.

## `docs/`

Deployment and setup guides.

## `astro/`

Astro SSG sub-project (alternative frontend build). See `astro/README.md`.

## `api/`

Minimal Go service (experimental). Not part of the primary deployment.

## `fly-supabase-proxy/`

Fly.io-hosted Supabase connection proxy for pooled connections.
