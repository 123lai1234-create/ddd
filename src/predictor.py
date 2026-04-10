"""
src/predictor.py
──────────────────────────────────────────────────────────────────
神經網路代理模型（Surrogate Model）

架構：ESM-2 embedding → MLP → stability score
  用途：作為貝葉斯最佳化和 RL 的 oracle（快速、可微分）

訓練目標：
  L = MSE(ŷ, y) + λ·‖θ‖²  (weight decay 作為 L2 正則化)
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import pickle
from pathlib import Path


# ─────────────────────────────────────────────────
# 模型架構
# ─────────────────────────────────────────────────

class StabilityPredictor(nn.Module):
    """
    將 ESM-2 embedding 映射到最後的 fitness/stability 分數。

    設計考量：
      - LayerNorm 取代 BatchNorm（小數據集 batch 統計不穩定）
      - Dropout 防止 embedding 空間的過擬合
      - 輸出無 activation（回歸任務）
    """

    def __init__(self, input_dim: int = 320, hidden_dims: list[int] | None = None):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [128, 64]

        layers: list[nn.Module] = []
        in_dim = input_dim
        for h in hidden_dims:
            layers += [
                nn.Linear(in_dim, h),
                nn.LayerNorm(h),
                nn.ReLU(),
                nn.Dropout(0.2),
            ]
            in_dim = h
        layers.append(nn.Linear(in_dim, 1))

        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ─────────────────────────────────────────────────
# 訓練邏輯
# ─────────────────────────────────────────────────

class PredictorTrainer:
    """
    封裝 StabilityPredictor 的訓練、評估和儲存。

    使用方式：
        trainer = PredictorTrainer(input_dim=320)
        trainer.fit(X_train, y_train, epochs=100)
        metrics = trainer.evaluate(X_test, y_test)
        y_hat = trainer.predict(X_new)
    """

    def __init__(
        self,
        input_dim: int = 320,
        hidden_dims: list[int] | None = None,
        lr: float = 1e-3,
        weight_decay: float = 1e-4,
        batch_size: int = 32,
    ):
        self.scaler = StandardScaler()
        self.model = StabilityPredictor(input_dim, hidden_dims)
        self.optimizer = torch.optim.Adam(
            self.model.parameters(), lr=lr, weight_decay=weight_decay
        )
        self.criterion = nn.MSELoss()
        self.batch_size = batch_size
        self.train_losses: list[float] = []
        self.val_losses: list[float] = []
        self._fitted = False

    # ── training ───────────────────────────────────
    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        X_val: np.ndarray | None = None,
        y_val: np.ndarray | None = None,
        epochs: int = 100,
        print_every: int = 20,
    ) -> "PredictorTrainer":
        # 標準化特徵
        X_s = torch.tensor(self.scaler.fit_transform(X), dtype=torch.float32)
        y_t = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

        # 驗證集（使用已擬合的 scaler）
        X_val_s, y_val_t = None, None
        if X_val is not None and y_val is not None:
            X_val_s = torch.tensor(self.scaler.transform(X_val), dtype=torch.float32)
            y_val_t = torch.tensor(y_val, dtype=torch.float32).unsqueeze(1)
        self.val_losses = []

        loader = DataLoader(
            TensorDataset(X_s, y_t),
            batch_size=self.batch_size,
            shuffle=True,
        )

        self.model.train()
        for epoch in range(epochs):
            epoch_loss = 0.0
            for xb, yb in loader:
                self.optimizer.zero_grad()
                loss = self.criterion(self.model(xb), yb)
                loss.backward()
                self.optimizer.step()
                epoch_loss += loss.item()

            avg_loss = epoch_loss / len(loader)
            self.train_losses.append(avg_loss)

            if X_val_s is not None:
                self.model.eval()
                with torch.no_grad():
                    val_loss = self.criterion(self.model(X_val_s), y_val_t).item()
                self.val_losses.append(val_loss)
                self.model.train()

            if (epoch + 1) % print_every == 0:
                val_str = f" | Val: {self.val_losses[-1]:.5f}" if self.val_losses else ""
                print(f"  Epoch {epoch+1:3d}/{epochs} | Loss: {avg_loss:.5f}{val_str}")

        self._fitted = True
        return self

    # ── inference ──────────────────────────────────
    def predict(self, X: np.ndarray) -> np.ndarray:
        """Returns predictions as numpy array, shape (N,)"""
        self._check_fitted()
        X_s = torch.tensor(self.scaler.transform(X), dtype=torch.float32)
        self.model.eval()
        with torch.no_grad():
            return self.model(X_s).squeeze().numpy()

    def predict_tensor(self, X_scaled: torch.Tensor) -> torch.Tensor:
        """
        直接接受已標準化的 tensor（供貝葉斯最佳化內部使用）。
        """
        self.model.eval()
        with torch.no_grad():
            return self.model(X_scaled.float()).squeeze()

    # ── evaluation ─────────────────────────────────
    def evaluate(self, X: np.ndarray, y: np.ndarray) -> dict:
        """
        計算常用評估指標：
          - MSE（均方誤差）
          - Pearson r（預測 vs 真實的線性相關）
          - Spearman ρ（排序相關，更貼近實驗需求）
        """
        from scipy.stats import pearsonr, spearmanr

        y_pred = self.predict(X)
        mse = float(np.mean((y_pred - y) ** 2))
        r, _ = pearsonr(y_pred, y)
        rho, _ = spearmanr(y_pred, y)

        metrics = {"MSE": mse, "Pearson_r": r, "Spearman_rho": rho}
        print(f"  [Predictor] MSE={mse:.4f} | Pearson r={r:.3f} | Spearman ρ={rho:.3f}")
        return metrics

    # ── persistence ────────────────────────────────
    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model_state": self.model.state_dict(),
            "scaler": self.scaler,
            "train_losses": self.train_losses,
            "val_losses": self.val_losses,
        }
        torch.save(payload, path)
        print(f"[predictor] 模型已儲存至 {path}")

    def load(self, path: str | Path) -> "PredictorTrainer":
        payload = torch.load(path, map_location="cpu")
        self.model.load_state_dict(payload["model_state"])
        self.scaler = payload["scaler"]
        self.train_losses = payload["train_losses"]
        self.val_losses = payload.get("val_losses", [])
        self._fitted = True
        print(f"[predictor] 模型已從 {path} 載入")
        return self

    def _check_fitted(self) -> None:
        if not self._fitted:
            raise RuntimeError("請先呼叫 fit() 訓練模型")
