---
title: Protein ESM-2 Analysis
emoji: 🧬
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
license: mit
short_description: ESM-2 protein sequence embedding and mutation scoring API
---

# Protein ESM-2 Analysis

FastAPI service for protein sequence analysis using ESM-2 (facebook/esm2_t6_8M_UR50D).

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/embed` | POST | Sequence → mean embedding vector (320-dim) |
| `/score` | POST | Masked-token amino-acid log-probability profile |
| `/similarity` | POST | Cosine similarity between two sequences |

## Usage

```python
import requests

# Embedding
r = requests.post(
    "https://jtlai0921-protein-esm.hf.space/embed",
    json={"sequence": "MKTIIALSYIFCLVFA"}
)
print(r.json())  # {"embedding": [...], "dim": 320}

# Mutation scoring (full sequence)
r = requests.post(
    "https://jtlai0921-protein-esm.hf.space/score",
    json={"sequence": "MKTIIALSYIFCLVFA"}
)
print(r.json())  # {"profiles": {0: {"A": -1.2, ...}, ...}}
```

## Model

**ESM-2 (8M)** — `facebook/esm2_t6_8M_UR50D`  
Smallest ESM-2 variant; CPU-friendly, 320-dim embeddings, 6 transformer layers.  
Trained on UniRef50 with masked language modelling.

Part of [JT Lai's portfolio](https://donttalk.vercel.app) — computational biology / MLOps.
