"""
src/data_prep.py
──────────────────────────────────────────────────────────────────
數據準備模組

支援兩種模式：
  1. Demo 模式   — 生成帶有可學習規律的隨機序列（開箱即用）
  2. 真實數據模式 — 從 ProteinGym CSV 載入 (sequence, fitness_score)

Demo 數據的設計邏輯：
  fitness = f_nonlinear(aminoacid composition) + noise
  確保 ESM-2 embedding 無法「作弊」，需要真正學到特徵。
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from pathlib import Path

from src.constants import AMINO_ACIDS


# ─────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────

def make_demo_data(
    n: int = 200,
    seq_len: int = 56,
    noise_std: float = 0.04,
    seed: int = 42,
) -> tuple[list[str], torch.Tensor]:
    """
    生成示意用的合成數據集。

    Fitness 函數（mimics thermostability SAR）：
      f = 0.4·frac(L+V+I+F) − 0.3·frac(G+P) + 0.2·frac(K+R) + noise

    Parameters
    ----------
    n        : 序列條數
    seq_len  : 序列長度（固定長度，方便對照）
    noise_std: 高斯噪音標準差（模擬實驗誤差）
    seed     : 隨機種子

    Returns
    -------
    sequences : list of amino-acid strings
    labels    : FloatTensor shape (n,)
    """
    rng = np.random.default_rng(seed)
    sequences: list[str] = []
    fitness_scores: list[float] = []

    hydrophobic = set("LVIFM")
    helix_breakers = set("GP")
    charged_pos = set("KR")

    for _ in range(n):
        seq = "".join(rng.choice(AMINO_ACIDS, size=seq_len))
        sequences.append(seq)

        frac_hydrophobic = sum(aa in hydrophobic for aa in seq) / seq_len
        frac_breakers = sum(aa in helix_breakers for aa in seq) / seq_len
        frac_charged = sum(aa in charged_pos for aa in seq) / seq_len

        f = (
            0.4 * frac_hydrophobic
            - 0.3 * frac_breakers
            + 0.2 * frac_charged
            + rng.normal(0, noise_std)
        )
        fitness_scores.append(float(f))

    labels = torch.tensor(fitness_scores, dtype=torch.float32)
    return sequences, labels


def load_proteingym_data(
    csv_path: str | Path,
    sequence_col: str = "mutant_sequence",
    fitness_col: str = "DMS_score",
    max_rows: int | None = None,
) -> tuple[list[str], torch.Tensor]:
    """
    從 ProteinGym DMS CSV 載入數據。

    預期欄位名稱（可透過參數調整）：
      sequence_col : 完整突變序列
      fitness_col  : fitness / DMS score（越高越好的方向）

    下載來源：https://github.com/OATML-Markslab/ProteinGym
    建議先從 GB1 或 GFP 數據集開始（序列較短）。
    """
    df = pd.read_csv(csv_path, nrows=max_rows)

    missing = [c for c in [sequence_col, fitness_col] if c not in df.columns]
    if missing:
        available = list(df.columns)
        raise ValueError(
            f"找不到欄位 {missing}。\n"
            f"CSV 中的欄位為：{available}\n"
            f"請調整 sequence_col / fitness_col 參數。"
        )

    sequences = df[sequence_col].tolist()
    labels = torch.tensor(df[fitness_col].values, dtype=torch.float32)
    print(f"[data_prep] 載入 {len(sequences)} 條序列，"
          f"fitness 範圍 [{labels.min():.3f}, {labels.max():.3f}]")
    return sequences, labels


def describe_dataset(sequences: list[str], labels: torch.Tensor) -> None:
    """印出數據集基本統計"""
    lengths = [len(s) for s in sequences]
    print("=" * 50)
    print(f"  序列數量   : {len(sequences)}")
    print(f"  序列長度   : min={min(lengths)}, max={max(lengths)}, mean={np.mean(lengths):.1f}")
    print(f"  Fitness    : mean={labels.mean():.4f}, std={labels.std():.4f}")
    print(f"               min={labels.min():.4f}, max={labels.max():.4f}")
    print("=" * 50)
