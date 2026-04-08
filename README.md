# Protein Design AI — ESM-2 × Bayesian Optimization × RL × ProteinMPNN

A full end-to-end pipeline for **data-driven protein sequence optimisation**, built as a technical portfolio project for the **大分子 AI 演算法研究** role.

---

## What This Project Demonstrates

| Competency             | Implementation                                                  |
| ---------------------- | --------------------------------------------------------------- |
| Pre-trained protein LM | ESM-2 (`facebook/esm2_t6_8M_UR50D`) embedding extraction        |
| Surrogate modelling    | MLP regressor (LayerNorm + Dropout) mapping embedding → fitness |
| Bayesian Optimisation  | GP + `qLogExpectedImprovement`, PCA-reduced latent space        |
| Graph neural network   | Simplified ProteinMPNN (k-NN Cα graph, message passing)         |
| Policy gradient RL     | REINFORCE with LSTM policy, multi-objective reward              |
| End-to-end ML hygiene  | Train/test split, Pearson r, Spearman ρ, reproducible seeds     |

---

## Architecture Overview

```
Protein Sequences
       │
       ▼
 ┌─────────────┐
 │   ESM-2 8M  │  ← Pre-trained protein language model (HuggingFace)
 │  Embedder   │    Mean-pooled representation  (N × 320)
 └──────┬──────┘
        │
        ├─────────────────────────────────────────────┐
        ▼                                             ▼
 ┌────────────────┐                        ┌──────────────────┐
 │  MLP Surrogate │                        │  ProteinMPNN     │
 │  (Predictor)   │                        │  (Graph NN)      │
 └──────┬─────────┘                        │  Cα k-NN graph   │
        │                                  │  → sequence      │
        ├─────────────────────┐            └──────────────────┘
        ▼                     ▼
 ┌────────────────┐   ┌──────────────────┐
 │  Bayesian Opt  │   │  REINFORCE RL    │
 │  GP + LogEI    │   │  LSTM Policy     │
 │  PCA latent    │   │  Multi-obj reward│
 └────────────────┘   └──────────────────┘
```

---

## Project Structure

```
d:\project\
├── frontend/
│   ├── index.html           # 首頁 / ProteinMPNN demo
│   ├── about_me.html        # About Me
│   ├── works.html           # 作品總覽
│   ├── gene_ai.html         # Gene AI 頁面
│   ├── ngs.html             # NGS 頁面
│   ├── report.html          # 專案報告
│   ├── thesis.html          # Thesis 頁面
│   ├── interview_prep.html  # 面試準備頁面
│   ├── styles/              # 全站與頁面 CSS
│   └── scripts/             # 全站與頁面 JS
├── scripts/
│   ├── build_static_site.sh # 靜態站建置，輸出到 dist/
│   └── run_pipeline.py      # CLI 入口，支援 --mode all / bo / rl / mpnn
├── site_api/
│   ├── main.py              # FastAPI + Postgres API
│   ├── sequence_sources.py  # UniProt / Ensembl 序列資料來源
│   ├── knowledge_sources.py # UniProt annotation / PubMed 知識來源
│   ├── sequencing_run_sources.py # ENA 定序 run metadata
│   └── market_sources.py    # 股票 / ETF / futures 市場資料來源
├── demo_notebook.ipynb      # 面試 Live Demo 筆記本
├── docs/
│   ├── DEPLOY_AUTOMATION.md
│   ├── DEPLOY_FLY.md
│   └── DEPLOY_RENDER.md
├── requirements.txt
├── src/
│   ├── data_prep.py         # Demo 資料生成 / ProteinGym CSV 載入
│   ├── embeddings.py        # ESM2Embedder (lazy load, batch, mean-pool)
│   ├── predictor.py         # StabilityPredictor MLP + PredictorTrainer
│   ├── bayes_opt.py         # BayesianOptimizer (GP + qLogEI + PCA)
│   ├── protein_mpnn.py      # SimplifiedProteinMPNN (message passing)
│   ├── rl_reinforce.py      # REINFORCE + MultiObjectiveReward
│   └── visualize.py         # Output plots
└── outputs/
    ├── results_esm2.png     # BO pipeline results
    ├── rl_training.png      # RL reward curve
    └── mpnn_loss.png        # ProteinMPNN loss curve
```

---

## Quick Start

```bash
# 1. 安裝套件
pip install -r requirements.txt

# 2. 跑完整 pipeline（含 ESM-2 下載 ~30 MB）
python scripts/run_pipeline.py --mode all

# 3. 只跑 Bayesian Optimisation
python scripts/run_pipeline.py --mode bo --epochs 100 --bo-iters 20

# 4. 只跑 RL
python scripts/run_pipeline.py --mode rl --rl-episodes 50

# 5. 只跑 ProteinMPNN
python scripts/run_pipeline.py --mode mpnn
```

---

## Key Results (Demo Data, 100 sequences, seq_len=56)

| Pipeline        | Metric                            | Value                      |
| --------------- | --------------------------------- | -------------------------- |
| ESM-2 Embedding | PCA 8D explained variance         | **81.9%**                  |
| Surrogate MLP   | Pearson r (test)                  | 0.29                       |
| Bayesian Opt    | Fitness improvement over 15 iters | **+16.6%** (0.209 → 0.243) |
| RL REINFORCE    | Reward convergence                | ✅ in ~20 episodes         |
| ProteinMPNN     | Cross-entropy loss                | ✅ decreasing              |

> Note: Low Pearson r is expected — the MLP is trained on only 80 sequences with a stochastic fitness oracle. The BO still finds improvements because GP uncertainty drives exploration.

---

## Core Algorithms

### 1. ESM-2 Embedding

```python
# Mean pooling (masked, ignoring padding tokens)
attention_mask = ...                        # (B, L)
token_emb      = model(input_ids, ...).last_hidden_state  # (B, L, 320)
mask           = attention_mask.unsqueeze(-1).float()
embedding      = (token_emb * mask).sum(1) / mask.sum(1)  # (B, 320)
```

### 2. Bayesian Optimisation (GP + LogEI)

$$
\alpha_{\text{LogEI}}(x) = \log \mathbb{E}\bigl[\max(f(x) - f^*, 0)\bigr]
$$

PCA reduces 320-D embedding to 8-D before GP fitting, making covariance matrix well-conditioned.

### 3. ProteinMPNN Message Passing

$$
h_v^{(l+1)} = \text{LN}\bigl(h_v^{(l)} + \text{ReLU}(W_O \cdot \text{SUM}_{u \in \mathcal{N}(v)} \phi(h_v^{(l)}, h_u^{(l)}, e_{vu}))\bigr)
$$

### 4. REINFORCE Policy Gradient

$$
\nabla_\theta J(\theta) = \mathbb{E}_\pi\bigl[\nabla_\theta \log \pi_\theta(a_t|s_t) \cdot G_t\bigr]
$$

Multi-objective reward: `R = w_s·stability + w_h·hydrophobic + w_c·charged_ratio`

---

## Dependencies

```
torch>=2.0        transformers>=4.35   botorch>=0.9
gpytorch>=1.11    scikit-learn>=1.3    matplotlib>=3.7
pandas>=2.0       numpy>=1.24          scipy
```

---

## Author Note

This project was built as a **6-week sprint** to demonstrate core competencies for protein ML research positions. The architecture intentionally mirrors production systems (e.g., ProteinMPNN, wet-lab-in-the-loop BO) while remaining fully reproducible on a single CPU in under 2 minutes.

---

## Static Site Deployment

This repository also includes a multi-page portfolio website that is prepared for Render Static Site deployment.

The current Render-ready setup can also be expanded into a small full-stack portfolio deployment:

- Static site for the portfolio pages
- FastAPI service for contact form submission
- Render Postgres for inquiry storage
- Dynamic sequence cache sourced from UniProt and Ensembl
- Dynamic knowledge cache sourced from UniProt annotations and NCBI PubMed
- RAG-ready document export for knowledge chunks and cached sequence metadata

- Project-specific deployment guide: [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)
- Render blueprint config: [render.yaml](render.yaml)
- Static bundle build script: [scripts/build_static_site.sh](scripts/build_static_site.sh)

The frontend source is organized under `frontend/`, with page templates in `frontend/`, styles in `frontend/styles/`, and scripts in `frontend/scripts/`.

- Render, Netlify, and Cloudflare Pages deploy the generated `dist/` bundle from [scripts/build_static_site.sh](scripts/build_static_site.sh)
- Vercel serves the same frontend structure through [vercel.json](vercel.json) rewrites and builds deployment output in CI before publish

## Bio Knowledge Layer

The deployed FastAPI service now exposes a small bioinformatics knowledge layer for the portfolio pages and downstream RAG workflows.

- Sequence cache endpoints: `/api/sequences`, `/api/sequences/summary`, `/api/sequences/sync`
- Sequencing run metadata: `/api/sequencing-runs`, `/api/sequencing-runs/summary`, `/api/sequencing-runs/sync`
- Knowledge cache endpoints: `/api/knowledge`, `/api/knowledge/summary`, `/api/knowledge/sync`
- RAG document export: `/api/rag/documents`

## Market Data Layer

The FastAPI service now also exposes a market ingestion layer that can write daily bars and instrument metadata into PostgreSQL.

- Market summary: `/api/market/summary`
- Instrument listing: `/api/market/instruments`
- Daily price bars: `/api/market/bars`
- Market sync trigger: `/api/market/sync`

Default upstreams:

- Taiwan stocks / ETFs: TWSE official daily report API
- Futures and non-TWSE symbols: Yahoo Finance chart API
- Sequencing run metadata: ENA Portal API

PostgreSQL tables created automatically at startup:

- `sequence_library`
- `knowledge_library`
- `sequencing_run_library`
- `market_instruments`
- `market_price_bars`

The `gene_ai.html` page provides the interactive management UI, while `index.html` surfaces a read-only homepage preview of the latest sequence, knowledge, and RAG-ready records stored in Render Postgres.
