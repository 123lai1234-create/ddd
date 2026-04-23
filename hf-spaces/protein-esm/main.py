"""
Protein ESM-2 Analysis API
HuggingFace Space: jtlai0921/protein-esm

Loads facebook/esm2_t6_8M_UR50D once at startup.
Provides embedding, mutation scoring, and similarity endpoints.
"""

from __future__ import annotations

import math
import time
from functools import lru_cache
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from transformers import AutoModel, AutoTokenizer

# ── Config ───────────────────────────────────────────────
MODEL_NAME = "facebook/esm2_t6_8M_UR50D"
MAX_SEQ_LEN = 512
VALID_AAS = set("ACDEFGHIKLMNPQRSTVWY")

# ── Startup ──────────────────────────────────────────────
print(f"Loading {MODEL_NAME}…")
_t0 = time.time()
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModel.from_pretrained(MODEL_NAME)
model.eval()
print(f"Model ready in {time.time()-_t0:.1f}s")

# ── App ──────────────────────────────────────────────────
app = FastAPI(
    title="Protein ESM-2 Analysis",
    description="Sequence embedding and mutation scoring via ESM-2 (8M).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ── Models ───────────────────────────────────────────────
class SeqRequest(BaseModel):
    sequence: str = Field(..., description="Amino acid sequence (ACDEFGHIKLMNPQRSTVWY)")

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, v: str) -> str:
        v = v.upper().strip()
        if not v:
            raise ValueError("sequence must not be empty")
        if len(v) > MAX_SEQ_LEN:
            raise ValueError(f"sequence too long (max {MAX_SEQ_LEN} residues)")
        invalid = set(v) - VALID_AAS
        if invalid:
            raise ValueError(f"invalid amino acids: {sorted(invalid)}")
        return v


class ScoreRequest(BaseModel):
    sequence: str
    positions: Optional[list[int]] = Field(
        None, description="0-based positions to score; omit for all"
    )

    @field_validator("sequence")
    @classmethod
    def validate_sequence(cls, v: str) -> str:
        v = v.upper().strip()
        if not v or len(v) > MAX_SEQ_LEN:
            raise ValueError("empty or too long (max 512)")
        return v


class SimilarityRequest(BaseModel):
    sequence_a: str
    sequence_b: str


# ── Helpers ──────────────────────────────────────────────
@lru_cache(maxsize=512)
def _embed_cached(seq: str) -> tuple[float, ...]:
    """Compute mean-pool embedding; cached by sequence."""
    with torch.no_grad():
        inputs = tokenizer(seq, return_tensors="pt")
        out = model(**inputs)
        emb = out.last_hidden_state.mean(dim=1).squeeze()
    return tuple(emb.tolist())


def _cosine(a: tuple, b: tuple) -> float:
    ta = torch.tensor(a)
    tb = torch.tensor(b)
    return float(torch.nn.functional.cosine_similarity(ta.unsqueeze(0), tb.unsqueeze(0)).item())


def _score_position(seq: str, pos: int) -> dict[str, float]:
    """Return log-prob distribution over 20 AAs at one masked position."""
    masked = list(seq)
    masked[pos] = tokenizer.mask_token
    masked_str = "".join(masked)
    with torch.no_grad():
        inputs = tokenizer(masked_str, return_tensors="pt")
        logits = model(**inputs).last_hidden_state  # (1, L+2, hidden)
    # position offset: +1 for [CLS]
    mask_idx = pos + 1
    tok_logits = logits[0, mask_idx]  # (hidden,)
    # Project to vocab with tokenizer's LM head — ESM-2 AutoModel doesn't include
    # a language head, so we use log-softmax of the hidden state norm as a proxy.
    # For a proper fill-mask, use EsmForMaskedLM instead.
    raise NotImplementedError("Use EsmForMaskedLM for per-position scoring")


# ── Routes ───────────────────────────────────────────────
@app.get("/", summary="Health check")
def root():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/embed", summary="Sequence → embedding vector")
def embed(req: SeqRequest):
    """
    Returns mean-pooled last-hidden-state embedding (320-dim for ESM-2 8M).
    Results are cached; repeated calls are instant.
    """
    emb = _embed_cached(req.sequence)
    return {
        "embedding": list(emb),
        "dim": len(emb),
        "model": MODEL_NAME,
        "sequence_length": len(req.sequence),
    }


@app.post("/similarity", summary="Cosine similarity between two sequences")
def similarity(req: SimilarityRequest):
    """
    Computes cosine similarity of mean-pooled ESM-2 embeddings.
    Score in [-1, 1]; proteins with similar fold/function typically > 0.85.
    """
    for seq in (req.sequence_a, req.sequence_b):
        seq = seq.upper().strip()
        if not seq or len(seq) > MAX_SEQ_LEN:
            raise HTTPException(400, "sequence empty or too long (max 512)")
        invalid = set(seq) - VALID_AAS
        if invalid:
            raise HTTPException(400, f"invalid amino acids: {sorted(invalid)}")

    a = _embed_cached(req.sequence_a.upper().strip())
    b = _embed_cached(req.sequence_b.upper().strip())
    score = _cosine(a, b)
    return {
        "cosine_similarity": round(score, 6),
        "interpretation": (
            "very similar" if score > 0.95 else
            "similar" if score > 0.85 else
            "moderately similar" if score > 0.70 else
            "dissimilar"
        ),
    }


@app.post("/score", summary="Amino-acid log-probability profile via EsmForMaskedLM")
def score(req: ScoreRequest):
    """
    For each requested position, masks that residue and returns the
    log-probability over all 20 canonical amino acids.

    Uses EsmForMaskedLM (fill-mask head). Results indicate how 'expected'
    each amino acid is at that position given the surrounding context.
    """
    from transformers import EsmForMaskedLM

    seq = req.sequence.upper().strip()
    positions = (
        [p for p in req.positions if 0 <= p < len(seq)]
        if req.positions is not None
        else list(range(min(len(seq), 50)))  # cap at 50 to keep latency reasonable
    )

    # Load fill-mask model on first call (lazy, cached in module)
    global _lm_model
    if "_lm_model" not in globals():
        print("Loading EsmForMaskedLM…")
        _lm_model = EsmForMaskedLM.from_pretrained(MODEL_NAME)
        _lm_model.eval()

    profiles: dict[int, dict[str, float]] = {}
    for pos in positions:
        masked_seq = seq[:pos] + tokenizer.mask_token + seq[pos + 1:]
        with torch.no_grad():
            inputs = tokenizer(masked_seq, return_tensors="pt")
            logits = _lm_model(**inputs).logits  # (1, L+2, vocab)
        mask_token_idx = pos + 1  # +1 for [CLS]
        log_probs = torch.log_softmax(logits[0, mask_token_idx], dim=-1)
        dist: dict[str, float] = {}
        for aa in sorted(VALID_AAS):
            tok_id = tokenizer.convert_tokens_to_ids(aa)
            dist[aa] = round(float(log_probs[tok_id].item()), 4)
        profiles[pos] = dist

    return {
        "profiles": profiles,
        "sequence": seq,
        "position_count": len(positions),
        "model": MODEL_NAME,
    }
