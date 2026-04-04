"""
src/embeddings.py
──────────────────────────────────────────────────────────────────
ESM-2 蛋白質語言模型 Embedding 提取

原理（Tab 03 數學基礎）：
  ESM-2 使用遮罩語言模型預訓練：
    L_MLM = -Σᵢ∈Mask  log P(sᵢ | s\{Mask})
  在 2.5 億條蛋白質序列上訓練後，embedding 隱含了：
    - 進化保守性資訊（共變異 → 空間接觸）
    - 二級結構偏好
    - 理化性質編碼

  本模組用 mean pooling 把變長序列壓縮為固定維度向量：
    e(s) = (1/L) Σₜ hₜ   （忽略 padding token）
  使其成為下游機器學習模型（NN/GP）的輸入。
"""

from __future__ import annotations

import torch
import numpy as np
from pathlib import Path


# ─────────────────────────────────────────────────
# 模型名稱對照表（參數量 vs. embedding dim）
# ─────────────────────────────────────────────────
ESM2_MODELS = {
    "8M":   ("facebook/esm2_t6_8M_UR50D",    320),   # 快，適合實驗
    "35M":  ("facebook/esm2_t12_35M_UR50D",  480),   # 平衡
    "150M": ("facebook/esm2_t30_150M_UR50D", 640),   # 較強
    "650M": ("facebook/esm2_t33_650M_UR50D", 1280),  # 強，需要較多記憶體
}


class ESM2Embedder:
    """
    封裝 ESM-2 embedding 提取，API 仿 sklearn transformer。

    使用方式：
        embedder = ESM2Embedder(model_size="8M")
        X = embedder.transform(sequences)   # numpy array (N, 320)

    Parameters
    ----------
    model_size  : "8M" | "35M" | "150M" | "650M"
    batch_size  : 每批處理的序列數（記憶體不足時調小）
    device      : "cpu" | "cuda" | "auto"
    cache_dir   : 模型快取目錄（None 使用 HuggingFace 預設）
    """

    def __init__(
        self,
        model_size: str = "8M",
        batch_size: int = 16,
        device: str = "auto",
        cache_dir: str | Path | None = None,
    ):
        if model_size not in ESM2_MODELS:
            raise ValueError(f"model_size 必須為 {list(ESM2_MODELS.keys())} 之一")

        self.model_name, self.embed_dim = ESM2_MODELS[model_size]
        self.batch_size = batch_size
        self.cache_dir = str(cache_dir) if cache_dir else None

        if device == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        self._model = None
        self._tokenizer = None

    # ── lazy load ──────────────────────────────────
    def _load_model(self) -> None:
        if self._model is not None:
            return
        try:
            from transformers import EsmModel, EsmTokenizer
        except ImportError:
            raise ImportError("請先安裝 transformers：pip install transformers")

        print(f"[embeddings] 載入 ESM-2 {self.model_name}（首次執行會下載模型）...")
        self._tokenizer = EsmTokenizer.from_pretrained(
            self.model_name, cache_dir=self.cache_dir
        )
        self._model = EsmModel.from_pretrained(
            self.model_name, cache_dir=self.cache_dir
        ).to(self.device)
        self._model.eval()
        print(f"[embeddings] 模型已載入，embedding dim = {self.embed_dim}，device = {self.device}")

    # ── main API ───────────────────────────────────
    def transform(self, sequences: list[str]) -> np.ndarray:
        """
        將蛋白質序列列表轉換為 numpy embedding array。

        Returns
        -------
        embeddings : np.ndarray shape (N, embed_dim)
        """
        self._load_model()
        all_embeddings: list[torch.Tensor] = []

        for i in range(0, len(sequences), self.batch_size):
            batch = sequences[i : i + self.batch_size]
            inputs = self._tokenizer(
                batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model(**inputs)

            # last_hidden_state : (batch, seq_len+2, embed_dim)  +2 = [CLS][EOS]
            # attention_mask    : (batch, seq_len+2)
            hidden = outputs.last_hidden_state          # (B, L, D)
            mask = inputs["attention_mask"].unsqueeze(-1).float()  # (B, L, 1)

            # Masked mean pooling — 忽略 padding token
            emb = (hidden * mask).sum(dim=1) / mask.sum(dim=1)    # (B, D)
            all_embeddings.append(emb.cpu())

            if (i // self.batch_size + 1) % 5 == 0:
                print(f"[embeddings] 已處理 {min(i + self.batch_size, len(sequences))}/{len(sequences)} 條")

        result = torch.cat(all_embeddings, dim=0).numpy()
        print(f"[embeddings] 完成，shape = {result.shape}")
        return result

    def transform_single(self, sequence: str) -> np.ndarray:
        """單條序列 embedding，shape (embed_dim,)"""
        return self.transform([sequence])[0]
