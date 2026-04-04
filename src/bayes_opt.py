"""
src/bayes_opt.py
──────────────────────────────────────────────────────────────────
貝葉斯最佳化模組（Bayesian Optimization）

數學原理（Tab 02 核心差異化）：
  用高斯過程（GP）作為代理模型，在搜索空間中建立預測分數
  的後驗分布 P(f | 數據)，然後用採集函數決定下一個要評估的點。

  Expected Improvement（EI）採集函數：
    EI(x) = E[max(f(x) - f*, 0)]
           = (μ(x) - f*)·Φ(Z) + σ(x)·φ(Z)
    其中 Z = (μ(x) - f*) / σ(x)
    f* = 目前最佳觀測值

  EI 自然地平衡：
    - 探索（exploitation）：μ(x) 高的區域
    - 利用（exploration）：σ(x) 高的區域

工作流程：
  ESM-2 embeddings → PCA 降維 → BO loop → 最佳候選點
"""

from __future__ import annotations

import numpy as np
import torch
from sklearn.decomposition import PCA
from pathlib import Path
from typing import Callable


# ─────────────────────────────────────────────────
# 主要類別
# ─────────────────────────────────────────────────

class BayesianOptimizer:
    """
    在 ESM-2 embedding 的 PCA 子空間中進行貝葉斯最佳化搜索。

    Parameters
    ----------
    oracle_fn   : 評估函數，接受 (n, embed_dim) numpy array，
                  回傳 (n,) numpy array 的 fitness 分數。
                  在 demo 中為 NN predictor；真實使用時為實驗結果。
    n_pca_dims  : PCA 降維維度（GP 在低維效果最好，建議 ≤ 20）
    bounds_std  : PCA 空間搜索邊界（以標準差倍數表示）
    """

    def __init__(
        self,
        oracle_fn: Callable[[np.ndarray], np.ndarray],
        n_pca_dims: int = 10,
        bounds_std: float = 3.0,
    ):
        self.oracle_fn = oracle_fn
        self.n_pca_dims = n_pca_dims
        self.bounds_std = bounds_std
        self.pca = PCA(n_components=n_pca_dims)

        # 記錄所有觀測
        self.X_obs: torch.Tensor | None = None   # PCA 空間
        self.y_obs: torch.Tensor | None = None
        self.best_values: list[float] = []
        self._pca_fitted = False

    # ── 初始化 ─────────────────────────────────────
    def initialize(
        self,
        X_embed: np.ndarray,    # (n_init, embed_dim) — 標準化後的 embedding
        y_init: np.ndarray,     # (n_init,)
    ) -> None:
        """
        用初始數據擬合 PCA 並設定起始觀測集。

        X_embed 應來自 PredictorTrainer.scaler.transform() 後的結果，
        確保 PCA 空間和 GP 搜索空間一致。
        """
        X_pca = self.pca.fit_transform(X_embed)
        self._pca_fitted = True

        # BoTorch 需要 float64
        self.X_obs = torch.tensor(X_pca, dtype=torch.float64)
        self.y_obs = torch.tensor(y_init, dtype=torch.float64).unsqueeze(1)
        self.best_values = [self.y_obs.max().item()]

        explained = self.pca.explained_variance_ratio_.sum() * 100
        print(f"[bayes_opt] PCA {self.n_pca_dims}D 累積解釋變異: {explained:.1f}%")
        print(f"[bayes_opt] 初始最佳 fitness: {self.best_values[0]:.4f}")

    # ── 主迴圈 ─────────────────────────────────────
    def run(self, n_iter: int = 15) -> list[float]:
        """
        執行 n_iter 輪貝葉斯最佳化。

        每輪：
          1. 用當前觀測擬合 GP
          2. 最佳化 EI 採集函數取得候選點（PCA 空間）
          3. 用 oracle_fn 評估候選點（需將 PCA 座標反投影回 embedding）
          4. 更新觀測集

        Returns
        -------
        best_values : 每輪後的最佳 fitness（用於繪製收斂曲線）
        """
        try:
            from botorch.models import SingleTaskGP
            from botorch.fit import fit_gpytorch_mll
            from botorch.acquisition.logei import qLogExpectedImprovement
            from botorch.optim import optimize_acqf
            from gpytorch.mlls import ExactMarginalLogLikelihood
        except ImportError:
            raise ImportError("請先安裝 botorch：pip install botorch")

        if self.X_obs is None:
            raise RuntimeError("請先呼叫 initialize() 設定初始數據")

        bounds = torch.stack([
            torch.full((self.n_pca_dims,), -self.bounds_std, dtype=torch.float64),
            torch.full((self.n_pca_dims,), self.bounds_std,  dtype=torch.float64),
        ])

        for i in range(n_iter):
            # ── Step 1: 擬合 GP ──────────────────────
            gp = SingleTaskGP(self.X_obs, self.y_obs)
            mll = ExactMarginalLogLikelihood(gp.likelihood, gp)
            fit_gpytorch_mll(mll)

            # ── Step 2: LogEI 採集函數（數值穩定版）──────
            EI = qLogExpectedImprovement(model=gp, best_f=self.y_obs.max())

            # ── Step 3: 最佳化 EI 找候選點 ──────────
            candidate, acq_value = optimize_acqf(
                EI,
                bounds=bounds,
                q=1,
                num_restarts=5,
                raw_samples=64,
            )

            # ── Step 4: 反投影並用 oracle 評估 ───────
            # candidate: (1, n_pca_dims) float64 → numpy
            cand_pca = candidate.detach().numpy()          # (1, d_pca)
            cand_embed = self.pca.inverse_transform(cand_pca)  # (1, embed_dim)
            new_y = self.oracle_fn(cand_embed)             # (1,)

            # 更新觀測集
            new_y_t = torch.tensor(new_y, dtype=torch.float64).view(1, 1)
            self.X_obs = torch.cat([self.X_obs, candidate.detach()], dim=0)
            self.y_obs = torch.cat([self.y_obs, new_y_t], dim=0)
            self.best_values.append(self.y_obs.max().item())

            print(
                f"  [BO] 第 {i+1:2d} 輪 | "
                f"當前最佳: {self.best_values[-1]:.4f} | "
                f"EI: {acq_value.item():.5f}"
            )

        print(f"\n[bayes_opt] 完成！最佳 fitness: {max(self.best_values):.4f} "
              f"（初始: {self.best_values[0]:.4f}，"
              f"提升: {max(self.best_values) - self.best_values[0]:+.4f}）")
        return self.best_values

    def get_best_point_embed(self) -> np.ndarray:
        """
        取得最佳候選點的 embedding（反投影回原始空間）。
        """
        best_idx = self.y_obs.argmax().item()
        best_pca = self.X_obs[best_idx].numpy().reshape(1, -1)
        return self.pca.inverse_transform(best_pca)[0]
