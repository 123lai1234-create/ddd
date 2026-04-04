"""
src/rl_reinforce.py
──────────────────────────────────────────────────────────────────
強化學習：REINFORCE for protein sequence generation（Tab 04）

數學背景：
  分子設計符合 MDP 框架：
    State  s_t : 當前序列前綴（或初始的 [START] token）
    Action a_t : 在位置 t 選擇某個胺基酸（20 種）
    Reward R   : 生成完整序列後的 oracle 評分（稀疏獎勵）
    Policy π_θ : 自迴歸 LSTM，輸出每個位置的胺基酸概率

  REINFORCE 目標（Policy Gradient 定理）：
    ∇_θ L = E_{s~π_θ} [R(s) · ∇_θ log π_θ(s)]

  直觀：讓 reward 高的序列生成概率上升，reward 低的下降。
  這就是你熟悉的梯度上升，只是目標函數換成了期望 reward。

  多目標 Reward（案例三）：
    R_total = w1·R_stability + w2·R_hydrophobic − w3·R_charged
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from typing import Callable

AMINO_ACIDS = list("ACDEFGHIKLMNPQRSTVWY")
N_AA = len(AMINO_ACIDS)
START_TOKEN = N_AA        # index 20 = [START]
VOCAB_SIZE = N_AA + 1     # 20 胺基酸 + 1 START token


# ─────────────────────────────────────────────────
# Policy 網路（LSTM 自迴歸模型）
# ─────────────────────────────────────────────────

class SequencePolicy(nn.Module):
    """
    LSTM-based 自迴歸策略網路。

    生成流程：
      [START] → a_1 → a_2 → ... → a_L
    每一步以前一個 token 的 embedding 為輸入，
    輸出下一個 token 的概率分布。

    Parameters
    ----------
    embed_dim  : token embedding 維度
    hidden_dim : LSTM 隱藏層維度
    n_layers   : LSTM 層數
    seq_len    : 固定生成序列長度
    """

    def __init__(
        self,
        embed_dim: int = 64,
        hidden_dim: int = 128,
        n_layers: int = 2,
        seq_len: int = 30,
    ):
        super().__init__()
        self.seq_len = seq_len
        self.embed = nn.Embedding(VOCAB_SIZE, embed_dim)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, n_layers, batch_first=True)
        self.head = nn.Linear(hidden_dim, N_AA)

    def forward(self, tokens: Tensor) -> Tensor:
        """
        Teacher-forcing forward pass（用於訓練時計算 log prob）。

        Parameters
        ----------
        tokens : (B, L+1)  包含 START token 的輸入序列

        Returns
        -------
        logits : (B, L, 20)
        """
        x = self.embed(tokens[:, :-1])         # (B, L, embed_dim)
        out, _ = self.lstm(x)                   # (B, L, hidden_dim)
        return self.head(out)                   # (B, L, 20)

    @torch.no_grad()
    def sample(self, n: int, temperature: float = 1.0) -> tuple[Tensor, Tensor]:
        """
        自迴歸採樣生成 n 條序列。

        Returns
        -------
        tokens      : (n, seq_len)  生成的 token ids（0–19）
        log_probs   : (n,)          每條序列的總 log 概率（用於 RL 計算）
        """
        device = next(self.parameters()).device
        batch_inp = torch.full((n, 1), START_TOKEN, dtype=torch.long, device=device)
        h, c = None, None
        all_tokens: list[Tensor] = []
        all_log_probs = torch.zeros(n, device=device)

        for _ in range(self.seq_len):
            x = self.embed(batch_inp)             # (n, 1, embed_dim)
            if h is None:
                out, (h, c) = self.lstm(x)
            else:
                out, (h, c) = self.lstm(x, (h, c))

            logits = self.head(out[:, 0, :])      # (n, 20)
            probs = F.softmax(logits / temperature, dim=-1)

            sampled = torch.multinomial(probs, num_samples=1).squeeze(1)  # (n,)
            log_p = F.log_softmax(logits / temperature, dim=-1)
            all_log_probs += log_p[torch.arange(n), sampled]

            all_tokens.append(sampled)
            batch_inp = sampled.unsqueeze(1)      # feed back as next input

        tokens = torch.stack(all_tokens, dim=1)   # (n, seq_len)
        return tokens, all_log_probs

    def tokens_to_sequences(self, tokens: Tensor) -> list[str]:
        """Token tensor → 胺基酸字串列表"""
        return [
            "".join(AMINO_ACIDS[t] for t in row.tolist())
            for row in tokens
        ]


# ─────────────────────────────────────────────────
# 多目標 Reward 函數
# ─────────────────────────────────────────────────

class MultiObjectiveReward:
    """
    計算蛋白質序列的多目標 reward。

    案例三的實作（含 AF2 pLDDT 擴展）：
      R_total = w1·R_stability + w2·R_hydrophobic − w3·R_charged + w4·R_plddt

    真實場景中會接入：
      - Rosetta ΔG (binding energy)
      - AI 代理模型（本專案的 StabilityPredictor）
      - 免疫原性預測模型
      - ColabFold / ESMFold pLDDT 結構自信度（AF2 品質）

    Parameters
    ----------
    oracle_fn  : 接受序列列表，回傳穩定性分數 (N,) 的函數。
                 None 時退回純序列特徵 reward（不需要外部模型）。
    plddt_fn   : 接受序列列表，回傳 pLDDT 歸一化分數 (N,)∈[0,1] 的函數。
                 通常包裝 ColabFoldClient.predict()；None 時停用此項。
                 注意：API 呼叫較慢，建議每 N 個 episode 才啟用一次，
                 或用於 RL 結束後的後處理重新排序。
    w_stability     : 穩定性權重（來自 oracle_fn）
    w_hydrophobic   : 疏水性比例獎勵（正則化，鼓勵低免疫原性）
    w_charged       : 帶電殘基懲罰（過多帶電 → 聚集風險）
    w_plddt         : pLDDT 結構自信度權重（來自 plddt_fn，AF2 品質信號）
    """

    HYDROPHOBIC = set("LVIFM")
    CHARGED     = set("DEKR")

    def __init__(
        self,
        oracle_fn:     Callable[[list[str]], np.ndarray] | None = None,
        plddt_fn:      Callable[[list[str]], np.ndarray] | None = None,
        w_stability:   float = 1.0,
        w_hydrophobic: float = 0.3,
        w_charged:     float = 0.2,
        w_plddt:       float = 0.5,
    ):
        self.oracle_fn     = oracle_fn
        self.plddt_fn      = plddt_fn
        self.w_stability   = w_stability
        self.w_hydrophobic = w_hydrophobic
        self.w_charged     = w_charged
        self.w_plddt       = w_plddt

    def __call__(self, sequences: list[str]) -> Tensor:
        """
        計算多目標 reward，回傳 FloatTensor (N,)。
        """
        rewards = torch.zeros(len(sequences))

        # ── Term 1: 穩定性（來自 oracle 或代理模型）──
        if self.oracle_fn is not None:
            stab = torch.tensor(self.oracle_fn(sequences), dtype=torch.float32)
            rewards += self.w_stability * stab

        # ── Term 2: 疏水核心比例（正向，鼓勵折疊穩定性）──
        for i, seq in enumerate(sequences):
            frac_hydro = sum(aa in self.HYDROPHOBIC for aa in seq) / max(len(seq), 1)
            rewards[i] += self.w_hydrophobic * frac_hydro

        # ── Term 3: 帶電殘基懲罰（負向，過多帶電 → 可開發性問題）──
        for i, seq in enumerate(sequences):
            frac_charged = sum(aa in self.CHARGED for aa in seq) / max(len(seq), 1)
            rewards[i] -= self.w_charged * frac_charged

        # ── Term 4: pLDDT 結構自信度（AF2 品質信號，來自 ColabFold/ESMFold）──
        # plddt_fn 回傳歸一化分數 ∈ [0, 1]（原始 pLDDT 除以 100）
        # 注意：每次呼叫需 API 請求，建議稀疏使用（如每 10 個 episode 一次）
        if self.plddt_fn is not None:
            plddt_scores = torch.tensor(
                self.plddt_fn(sequences), dtype=torch.float32
            )
            rewards += self.w_plddt * plddt_scores

        return rewards


# ─────────────────────────────────────────────────
# REINFORCE 訓練器
# ─────────────────────────────────────────────────

class REINFORCETrainer:
    """
    用 REINFORCE 算法訓練 SequencePolicy。

    完整訓練迴圈：
      for episode in range(n_episodes):
          1. 從策略採樣 batch_size 條序列
          2. 計算多目標 reward
          3. 計算優勢函數（advantage = reward − baseline）
          4. 更新策略（最大化期望 reward）

    方差縮減：
      使用移動平均 baseline（exponential moving average of rewards），
      從 reward 中減去 baseline 得到 advantage，
      讓梯度估計更穩定（不影響最佳解，只降低方差）。
    """

    def __init__(
        self,
        policy: SequencePolicy,
        reward_fn: MultiObjectiveReward,
        lr: float = 3e-4,
        batch_size: int = 32,
        baseline_decay: float = 0.95,
        temperature: float = 1.0,
        max_grad_norm: float = 1.0,
    ):
        self.policy = policy
        self.reward_fn = reward_fn
        self.optimizer = torch.optim.Adam(policy.parameters(), lr=lr)
        self.batch_size = batch_size
        self.baseline_decay = baseline_decay
        self.temperature = temperature
        self.max_grad_norm = max_grad_norm

        self.baseline: float | None = None
        self.episode_rewards: list[float] = []
        self.episode_best: list[float] = []

    def _update_baseline(self, r: float) -> float:
        """指數移動平均 baseline"""
        if self.baseline is None:
            self.baseline = r
        else:
            self.baseline = (
                self.baseline_decay * self.baseline
                + (1 - self.baseline_decay) * r
            )
        return self.baseline

    def run(self, n_episodes: int = 100, print_every: int = 10) -> None:
        """
        執行 n_episodes 輪訓練。
        """
        print(f"[rl_reinforce] 開始訓練（{n_episodes} episodes，"
              f"batch={self.batch_size}，seq_len={self.policy.seq_len}）")

        for ep in range(1, n_episodes + 1):
            # ── Step 1: 採樣（no_grad，只取 token） ────────────
            tokens, _ = self.policy.sample(
                self.batch_size, temperature=self.temperature
            )
            sequences = self.policy.tokens_to_sequences(tokens)

            # ── Step 2: 計算 Reward ─────────────────────
            rewards = self.reward_fn(sequences)   # (B,)
            mean_r = rewards.mean().item()
            best_r = rewards.max().item()

            # ── Step 3: 優勢函數（方差縮減）────────────
            baseline = self._update_baseline(mean_r)
            advantages = rewards - baseline         # (B,)  去均值

            # ── Step 4: 重新計算 log prob（帶梯度）─────
            # 構建 teacher-forcing 輸入：[START, t1, t2, ..., t_{L-1}]
            device = next(self.policy.parameters()).device
            B, L = tokens.shape
            start = torch.full((B, 1), START_TOKEN, dtype=torch.long, device=device)
            input_tokens = torch.cat([start, tokens], dim=1)   # (B, L+1)

            logits = self.policy(input_tokens)                  # (B, L, 20)
            log_p_all = torch.log_softmax(logits, dim=-1)      # (B, L, 20)
            # 選出實際採樣到的 token 的 log prob
            tok_idx = tokens.to(device).unsqueeze(-1)          # (B, L, 1)
            log_probs = log_p_all.gather(-1, tok_idx).squeeze(-1).sum(dim=-1)  # (B,)

            # ── Step 5: REINFORCE 梯度更新 ───────────────
            policy_loss = -(advantages.detach() * log_probs).mean()

            self.optimizer.zero_grad()
            policy_loss.backward()
            torch.nn.utils.clip_grad_norm_(
                self.policy.parameters(), self.max_grad_norm
            )
            self.optimizer.step()

            self.episode_rewards.append(mean_r)
            self.episode_best.append(best_r)

            if ep % print_every == 0 or ep == 1:
                print(
                    f"  Episode {ep:4d}/{n_episodes} | "
                    f"mean_R={mean_r:.4f} | best_R={best_r:.4f} | "
                    f"baseline={baseline:.4f} | loss={policy_loss.item():.4f}"
                )

        print(f"\n[rl_reinforce] 訓練完成！")
        print(f"  初始 mean reward : {self.episode_rewards[0]:.4f}")
        print(f"  最終 mean reward : {self.episode_rewards[-1]:.4f}")
        print(f"  提升             : {self.episode_rewards[-1] - self.episode_rewards[0]:+.4f}")

    def generate_top_sequences(
        self, n: int = 50, temperature: float = 0.5
    ) -> list[tuple[str, float]]:
        """
        用低溫採樣生成序列，回傳 top-N 最佳結果。

        Returns
        -------
        List of (sequence, reward) tuples, sorted by reward descending.
        """
        tokens, _ = self.policy.sample(n, temperature=temperature)
        sequences = self.policy.tokens_to_sequences(tokens)
        rewards = self.reward_fn(sequences)

        results = sorted(
            zip(sequences, rewards.tolist()),
            key=lambda x: x[1],
            reverse=True,
        )
        return results
