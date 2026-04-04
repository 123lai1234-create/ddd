"""
src/visualize.py
──────────────────────────────────────────────────────────────────
視覺化模組（面試展示用）

生成三張圖：
  1. 訓練損失曲線（NN predictor）
  2. 預測 vs. 真實值散點圖（含 Pearson r）
  3. 貝葉斯最佳化收斂曲線

額外提供：
  4. RL 訓練 reward 曲線（mean + best per episode）
  5. ProteinMPNN 訓練損失曲線
"""

from __future__ import annotations

import numpy as np
import matplotlib
matplotlib.use("Agg")      # non-interactive backend，適合伺服器/腳本
import matplotlib.pyplot as plt
from pathlib import Path


DARK_BG   = "#0f1117"
SURFACE   = "#1a1d27"
BORDER    = "#2e3352"
ACCENT    = "#6c63ff"
ACCENT2   = "#00d4aa"
ACCENT4   = "#ffd166"
TEXT_MUTED = "#8892b0"
RED       = "#ff6b6b"


def _apply_dark_style(fig: plt.Figure, *axes) -> None:
    fig.patch.set_facecolor(DARK_BG)
    for ax in axes:
        ax.set_facecolor(SURFACE)
        ax.tick_params(colors=TEXT_MUTED, labelsize=9)
        ax.xaxis.label.set_color(TEXT_MUTED)
        ax.yaxis.label.set_color(TEXT_MUTED)
        ax.title.set_color("white")
        for spine in ax.spines.values():
            spine.set_edgecolor(BORDER)


# ─────────────────────────────────────────────────
# 主要繪圖函數
# ─────────────────────────────────────────────────

def plot_pipeline_results(
    train_losses: list[float],
    y_test: np.ndarray,
    y_pred: np.ndarray,
    bo_curve: list[float],
    val_losses: list[float] | None = None,
    X_embed: np.ndarray | None = None,
    bo_embed: np.ndarray | None = None,
    save_path: str | Path = "outputs/results.png",
) -> None:
    """
    四合一圖表（2×2）：
      ① 學習曲線（訓練 + 驗證損失）
      ② 預測 vs 真實散點圖（R²）
      ③ 貝葉斯最佳化收斂曲線
      ④ UMAP/PCA 多樣性散點圖（BO 候選以紅星標記）
    未提供 X_embed 時退化為 1×3 三合一圖。
    """
    from sklearn.metrics import r2_score
    r2 = r2_score(y_test, y_pred)

    has_umap_data = X_embed is not None
    if has_umap_data:
        fig, ax_arr = plt.subplots(2, 2, figsize=(14, 10))
        axes = ax_arr.flatten()
    else:
        fig, ax_arr = plt.subplots(1, 3, figsize=(15, 4.5))
        axes = list(ax_arr)

    _apply_dark_style(fig, *axes)

    # ── ① 學習曲線 ───────────────────────────────
    ax = axes[0]
    ax.plot(train_losses, color=ACCENT, linewidth=2, label="Train")
    if val_losses:
        ax.plot(val_losses, color=ACCENT2, linewidth=2, linestyle="--", label="Validation")
        ax.legend(fontsize=9, labelcolor=TEXT_MUTED, facecolor=SURFACE, edgecolor=BORDER)
    ax.set_title("① Learning Curve", pad=12)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("MSE Loss")
    ax.grid(alpha=0.2, color=BORDER)

    # ── ② 預測 vs 真實（R²）────────────────────────
    ax = axes[1]
    ax.scatter(y_test, y_pred, alpha=0.65, color=ACCENT2, s=28, zorder=3)
    lo = float(min(y_test.min(), y_pred.min()))
    hi = float(max(y_test.max(), y_pred.max()))
    ax.plot([lo, hi], [lo, hi], "--", color=RED, linewidth=1.5, label="Ideal", zorder=4)
    ax.set_title(f"② Predicted vs. True  (R² = {r2:.2f})", pad=12)
    ax.set_xlabel("True Fitness")
    ax.set_ylabel("Predicted Fitness")
    ax.legend(fontsize=8, labelcolor=TEXT_MUTED, facecolor=SURFACE, edgecolor=BORDER)
    ax.grid(alpha=0.2, color=BORDER)

    # ── ③ BO 收斂曲線 ────────────────────────────
    ax = axes[2]
    iters = list(range(len(bo_curve)))
    ax.plot(iters, bo_curve, marker="o", color=ACCENT4, linewidth=2, markersize=6)
    ax.fill_between(iters, bo_curve[0], bo_curve, alpha=0.15, color=ACCENT4)
    ax.set_title("③ Bayesian Optimization Convergence", pad=12)
    ax.set_xlabel("BO Iteration")
    ax.set_ylabel("Best Fitness So Far")
    ax.grid(alpha=0.2, color=BORDER)

    # ── ④ UMAP 多樣性（選填）─────────────────────
    if has_umap_data:
        ax = axes[3]
        try:
            import umap as _umap
            n_neighbors = min(15, X_embed.shape[0] - 1)
            reducer = _umap.UMAP(
                n_components=2, random_state=42,
                n_neighbors=n_neighbors, min_dist=0.1, verbose=False,
            )
            Z_bg = reducer.fit_transform(X_embed)
            Z_bo = reducer.transform(bo_embed) if bo_embed is not None else None
            dim_label = "UMAP"
        except ImportError:
            from sklearn.decomposition import PCA as _PCA
            reducer2 = _PCA(n_components=2, random_state=42)
            Z_bg = reducer2.fit_transform(X_embed)
            Z_bo = reducer2.transform(bo_embed) if bo_embed is not None else None
            dim_label = "PCA"

        ax.scatter(Z_bg[:, 0], Z_bg[:, 1],
                   alpha=0.4, color=ACCENT, s=18, label="All Sequences", zorder=2)
        if Z_bo is not None and len(Z_bo) > 0:
            ax.scatter(Z_bo[:, 0], Z_bo[:, 1],
                       alpha=0.9, color=RED, s=70, marker="*",
                       label="BO Candidates", zorder=4)
        ax.set_title(f"④ {dim_label} Diversity  (BO Candidates in Red)", pad=12)
        ax.set_xlabel(f"{dim_label}-1")
        ax.set_ylabel(f"{dim_label}-2")
        ax.legend(fontsize=9, labelcolor=TEXT_MUTED, facecolor=SURFACE, edgecolor=BORDER)
        ax.grid(alpha=0.15, color=BORDER)

    plt.tight_layout(pad=2)
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.close(fig)
    print(f"[visualize] 圖表已儲存至 {save_path}")


def plot_rl_training(
    episode_rewards: list[float],
    episode_best: list[float],
    save_path: str | Path = "outputs/rl_training.png",
) -> None:
    """
    RL 訓練曲線：mean reward 和 best reward per episode。
    """
    fig, ax = plt.subplots(figsize=(9, 4))
    _apply_dark_style(fig, ax)

    eps = list(range(1, len(episode_rewards) + 1))
    ax.plot(eps, episode_rewards, color=ACCENT, linewidth=2, label="Mean Reward")
    ax.plot(eps, episode_best,    color=ACCENT2, linewidth=1.5,
            linestyle="--", label="Best Reward (episode)")

    # Smoothed line (moving average)
    window = max(5, len(episode_rewards) // 20)
    smoothed = np.convolve(episode_rewards, np.ones(window) / window, mode="valid")
    offset = (len(episode_rewards) - len(smoothed)) // 2
    ax.plot(
        eps[offset : offset + len(smoothed)],
        smoothed,
        color=ACCENT4, linewidth=2.5, label=f"Smoothed (w={window})"
    )

    ax.set_title("REINFORCE Training Curve", pad=12)
    ax.set_xlabel("Episode")
    ax.set_ylabel("Reward")
    ax.legend(fontsize=9, labelcolor=TEXT_MUTED, facecolor=SURFACE, edgecolor=BORDER)
    ax.grid(alpha=0.2, color=BORDER)

    plt.tight_layout()
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.close(fig)
    print(f"[visualize] RL 訓練曲線已儲存至 {save_path}")


def plot_mpnn_training(
    losses: list[float],
    save_path: str | Path = "outputs/mpnn_loss.png",
) -> None:
    """
    ProteinMPNN 訓練損失曲線。
    """
    fig, ax = plt.subplots(figsize=(7, 4))
    _apply_dark_style(fig, ax)

    ax.plot(losses, color=RED, linewidth=2)
    ax.set_title("ProteinMPNN Training Loss (Cross-Entropy)", pad=12)
    ax.set_xlabel("Training Step")
    ax.set_ylabel("-log P(s | G)")
    ax.grid(alpha=0.2, color=BORDER)

    plt.tight_layout()
    Path(save_path).parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(save_path, dpi=150, bbox_inches="tight", facecolor=DARK_BG)
    plt.close(fig)
    print(f"[visualize] MPNN 訓練損失已儲存至 {save_path}")
