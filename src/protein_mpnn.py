"""
src/protein_mpnn.py
──────────────────────────────────────────────────────────────────
簡化版 ProteinMPNN 實作（Tab 03 數學推導的程式碼化）

數學背景：
  ProteinMPNN 解決的問題：給定蛋白質結構 G，找最佳序列 s。
  即對以下條件概率建模（自迴歸分解）：

    P(s | G) = Π_{i=1}^{N}  P(s_i | s_{<i}, G)

  圖構建：G = (V, E)
    節點 v_i : 殘基特徵（骨架坐標 Cα）
    邊 e_ij  : 空間距離 < 閾值的殘基對（幾何特徵）

  訊息傳遞（L 層）：
    h_i^{l+1} = Update(h_i^l, Σ_{j∈N(i)} Message(h_i^l, h_j^l, e_ij))

  訓練目標（交叉熵）：
    L = -Σ_{i=1}^N  log P(s_i* | s_{<i}, G)

本實作簡化點：
  - 用隨機 Cα 坐標做 demo（真實應用需載入 PDB 文件）
  - 邊特徵使用歐氏距離（完整版用四元數方向編碼）
  - 解碼器使用 teacher forcing 的全並行預測（真實版為自迴歸）
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor

AMINO_ACIDS = list("ACDEFGHIKLMNPQRSTVWY")
AA_TO_IDX = {aa: i for i, aa in enumerate(AMINO_ACIDS)}
N_AA = len(AMINO_ACIDS)   # 20


# ─────────────────────────────────────────────────
# 圖構建工具
# ─────────────────────────────────────────────────

def build_protein_graph(
    coords: Tensor,        # (N, 3)  Cα 坐標
    k_neighbors: int = 24, # 每個殘基保留最近的 k 個鄰居
) -> tuple[Tensor, Tensor, Tensor]:
    """
    從 Cα 坐標構建 k-NN 圖。

    Returns
    -------
    edge_index : (2, E)  來源和目標殘基索引
    edge_attr  : (E, edge_dim)  邊特徵（距離 + 方向向量）
    node_attr  : (N, node_dim)  節點特徵（殘基序號的正弦/餘弦編碼）
    """
    N = coords.shape[0]

    # ── 計算全對距離矩陣 ──────────────────────────
    diff = coords.unsqueeze(0) - coords.unsqueeze(1)   # (N, N, 3)
    dist = torch.norm(diff, dim=-1)                     # (N, N)

    # ── k-NN: 每個節點取最近 k 個鄰居 ──────────────
    dist_masked = dist.clone()
    dist_masked.fill_diagonal_(float("inf"))
    k = min(k_neighbors, N - 1)   # 節點數不足時自動縮小 k
    _, nn_idx = dist_masked.topk(k, dim=-1, largest=False)  # (N, k)

    src = torch.arange(N).unsqueeze(1).expand(-1, k).flatten()
    dst = nn_idx.flatten()
    edge_index = torch.stack([src, dst], dim=0)   # (2, E)

    # ── 邊特徵：方向向量 + 距離 ─────────────────────
    d_vec = diff[src, dst]            # (E, 3)  方向向量（未正規化）
    d_norm = dist[src, dst].unsqueeze(1)   # (E, 1)
    d_unit = d_vec / (d_norm + 1e-8)       # (E, 3)  單位方向向量

    # Gaussian basis 距離編碼 (16 個 basis)
    centers = torch.linspace(0, 20, 16)          # (16,)
    d_basis = torch.exp(-0.5 * ((d_norm - centers) / 2) ** 2)  # (E, 16)

    edge_attr = torch.cat([d_unit, d_basis], dim=-1)   # (E, 19)

    # ── 節點特徵：位置編碼 ──────────────────────────
    positions = torch.arange(N, dtype=torch.float32)
    freqs = torch.exp(-np.log(10000) * torch.arange(0, 16, 2).float() / 16)
    sin_enc = torch.sin(positions.unsqueeze(1) * freqs.unsqueeze(0))   # (N, 8)
    cos_enc = torch.cos(positions.unsqueeze(1) * freqs.unsqueeze(0))   # (N, 8)
    node_attr = torch.cat([sin_enc, cos_enc], dim=-1)   # (N, 16)

    return edge_index, edge_attr, node_attr


def sequence_to_onehot(sequence: str) -> Tensor:
    """胺基酸序列 → one-hot tensor (N, 20)"""
    idx = torch.tensor([AA_TO_IDX.get(aa, 0) for aa in sequence], dtype=torch.long)
    return F.one_hot(idx, num_classes=N_AA).float()


# ─────────────────────────────────────────────────
# 模型組件
# ─────────────────────────────────────────────────

class MessagePassingLayer(nn.Module):
    """
    單層圖訊息傳遞（Graph Message Passing）。

    對應數學公式：
      h_i^{l+1} = Update(h_i^l,  Σ_{j∈N(i)} Message(h_i^l, h_j^l, e_ij))

    Message 函數：MLP([h_i, h_j, e_ij]) → 訊息向量
    Aggregation ：mean（原始 ProteinMPNN 用 sum，差異不大）
    Update 函數 ：LayerNorm(h_i + Linear(aggregated))
    """

    def __init__(self, node_dim: int, edge_dim: int):
        super().__init__()
        msg_in = node_dim * 2 + edge_dim
        self.message_mlp = nn.Sequential(
            nn.Linear(msg_in, node_dim),
            nn.ReLU(),
            nn.Linear(node_dim, node_dim),
        )
        self.update_norm = nn.LayerNorm(node_dim)
        self.update_linear = nn.Linear(node_dim, node_dim)

    def forward(
        self,
        h: Tensor,           # (N, node_dim)  節點特徵
        edge_index: Tensor,  # (2, E)
        edge_attr: Tensor,   # (E, edge_dim)
    ) -> Tensor:
        src, dst = edge_index[0], edge_index[1]
        N = h.shape[0]

        # Message 計算
        msg_input = torch.cat([h[src], h[dst], edge_attr], dim=-1)  # (E, msg_in)
        messages = self.message_mlp(msg_input)                         # (E, node_dim)

        # Aggregation：scatter_mean（等效於有正規化的 sum）
        agg = torch.zeros(N, h.shape[1], device=h.device)
        count = torch.zeros(N, 1, device=h.device)
        agg.scatter_add_(0, dst.unsqueeze(1).expand_as(messages), messages)
        count.scatter_add_(0, dst.unsqueeze(1), torch.ones(dst.shape[0], 1, device=h.device))
        agg = agg / (count + 1e-8)

        # Update（殘差連接）
        h_new = self.update_norm(h + self.update_linear(agg))
        return h_new


class SimplifiedProteinMPNN(nn.Module):
    """
    簡化版 ProteinMPNN：結構 → 序列設計模型。

    模型流程：
      1. 從結構特徵初始化節點 embedding
      2. L 層訊息傳遞更新節點表示（聚合空間鄰居資訊）
      3. 解碼器輸出每個位置的胺基酸 logits（20 類）

    真實推理時使用自迴歸採樣；這裡使用 teacher-forcing
    的全並行預測（適合訓練和 demo）。
    """

    def __init__(
        self,
        node_in_dim: int = 16,
        edge_in_dim: int = 19,
        hidden_dim: int = 128,
        n_layers: int = 3,
    ):
        super().__init__()
        self.node_embed = nn.Linear(node_in_dim, hidden_dim)
        self.edge_embed = nn.Linear(edge_in_dim, hidden_dim)

        self.mp_layers = nn.ModuleList([
            MessagePassingLayer(hidden_dim, hidden_dim)
            for _ in range(n_layers)
        ])

        # Decoder：節點表示 → 胺基酸 logits
        self.decoder = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.LayerNorm(hidden_dim),
            nn.Linear(hidden_dim, N_AA),
        )

    def forward(
        self,
        node_attr: Tensor,   # (N, node_in_dim)
        edge_index: Tensor,  # (2, E)
        edge_attr: Tensor,   # (E, edge_in_dim)
    ) -> Tensor:
        """
        Returns
        -------
        logits : (N, 20)  每個位置 20 種胺基酸的未正規化分數
        """
        h = self.node_embed(node_attr)         # (N, hidden_dim)
        e = self.edge_embed(edge_attr)          # (E, hidden_dim)

        for layer in self.mp_layers:
            h = layer(h, edge_index, e)

        logits = self.decoder(h)               # (N, 20)
        return logits

    def design_sequence(
        self,
        coords: Tensor,
        temperature: float = 0.1,
    ) -> str:
        """
        從給定結構坐標生成蛋白質序列（貪婪採樣）。

        Parameters
        ----------
        coords      : (N, 3)  Cα 坐標
        temperature : sampling temperature（越低越確定性）

        Returns
        -------
        sequence : 設計出的胺基酸序列字串
        """
        self.eval()
        with torch.no_grad():
            edge_index, edge_attr, node_attr = build_protein_graph(coords)
            logits = self.forward(node_attr, edge_index, edge_attr)  # (N, 20)
            probs = F.softmax(logits / temperature, dim=-1)           # (N, 20)
            aa_idx = torch.multinomial(probs, num_samples=1).squeeze(-1)  # (N,)
        return "".join(AMINO_ACIDS[i] for i in aa_idx.tolist())


# ─────────────────────────────────────────────────
# 訓練迴圈
# ─────────────────────────────────────────────────

class ProteinMPNNTrainer:
    """
    訓練 SimplifiedProteinMPNN 的工具類別。

    Demo 使用隨機坐標 + 隨機目標序列。
    真實應用應從 PDB 文件載入 (coords, true_sequence) 對。
    """

    def __init__(self, model: SimplifiedProteinMPNN, lr: float = 1e-3):
        self.model = model
        self.optimizer = torch.optim.Adam(model.parameters(), lr=lr)
        self.losses: list[float] = []

    def train_step(
        self,
        coords: Tensor,        # (N, 3)
        true_sequence: str,    # N 個字元的目標序列
    ) -> float:
        """
        單步訓練。

        訓練目標（對應數學公式）：
          L = -Σ_i log P(s_i* | G)
            = CrossEntropy(logits, target_idx)
        """
        edge_index, edge_attr, node_attr = build_protein_graph(coords)
        logits = self.model(node_attr, edge_index, edge_attr)   # (N, 20)

        target = torch.tensor(
            [AA_TO_IDX.get(aa, 0) for aa in true_sequence], dtype=torch.long
        )

        # 交叉熵 = 負對數似然（與數學公式直接對應）
        loss = F.cross_entropy(logits, target)

        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        return loss.item()

    def train_demo(self, n_steps: int = 50, seq_len: int = 30) -> None:
        """
        用隨機生成的 (coords, sequence) 對跑 demo 訓練。
        """
        import random
        print(f"[protein_mpnn] 開始 Demo 訓練（{n_steps} 步，序列長度 {seq_len}）")
        rng = np.random.default_rng(0)

        for step in range(1, n_steps + 1):
            coords = torch.tensor(
                rng.standard_normal((seq_len, 3)) * 10, dtype=torch.float32
            )
            true_seq = "".join(random.choices(AMINO_ACIDS, k=seq_len))
            loss = self.train_step(coords, true_seq)
            self.losses.append(loss)

            if step % 10 == 0:
                print(f"  步驟 {step:3d}/{n_steps} | Loss: {loss:.4f}")

        print("[protein_mpnn] 訓練完成，設計示例序列...")
        demo_coords = torch.tensor(
            rng.standard_normal((seq_len, 3)) * 10, dtype=torch.float32
        )
        designed = self.model.design_sequence(demo_coords)
        print(f"  設計序列 : {designed}")
