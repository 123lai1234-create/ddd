"""
run_pipeline.py
──────────────────────────────────────────────────────────────────
主程式：將 Tab 02–04 的三個模組串接成完整 pipeline。

執行方式：
    python run_pipeline.py                 # 跑全部（Demo 模式）
    python run_pipeline.py --mode bo       # 只跑 BO pipeline（Tab 02）
    python run_pipeline.py --mode rl       # 只跑 RL pipeline（Tab 04）
    python run_pipeline.py --mode mpnn     # 只跑 ProteinMPNN（Tab 03）
    python run_pipeline.py --data path.csv # 使用真實 ProteinGym 數據

Pipeline 架構：
                              ┌─────────────┐
    序列 + fitness ──────────▶│  ESM-2      │──▶ embeddings (N, 320)
                              └─────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                 ▼
             ┌─────────────┐  ┌──────────┐    ┌──────────────┐
             │  NN Predictor│  │   PCA    │    │ SequencePolicy│
             │  (代理模型)  │  │ (10D)    │    │  (LSTM-RL)   │
             └──────┬──────┘  └────┬─────┘    └──────┬───────┘
                    │              ▼                   │
                    └──────▶ BayesOpt ─▶ 最佳候選點    │ REINFORCE
                                                        ▼
                                               top-N 優化序列

輸出：
    outputs/results.png      — NN + BO 結果圖
    outputs/rl_training.png  — RL 訓練曲線
    outputs/mpnn_loss.png    — ProteinMPNN 損失曲線
    outputs/top_sequences.txt — RL 生成的 top 序列
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

# ── 將 src 加入 path ─────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data_prep import make_demo_data, load_proteingym_data, describe_dataset
from src.embeddings import ESM2Embedder
from src.predictor import PredictorTrainer
from src.bayes_opt import BayesianOptimizer
from src.protein_mpnn import SimplifiedProteinMPNN, ProteinMPNNTrainer
from src.rl_reinforce import SequencePolicy, MultiObjectiveReward, REINFORCETrainer
from src.visualize import plot_pipeline_results, plot_rl_training, plot_mpnn_training
from src.alphafold import (
    ColabFoldClient,
    download_wildtype_structure,
    validate_candidates,
    compute_plddt,
)


# ─────────────────────────────────────────────────
# Pipeline A：ESM-2 + NN Predictor + Bayesian Opt（Tab 02）
# ─────────────────────────────────────────────────

def run_bo_pipeline(args: argparse.Namespace) -> None:
    print("\n" + "=" * 60)
    print("  PIPELINE A：ESM-2 Embedding + 貝葉斯最佳化（Tab 02）")
    print("=" * 60)

    # ── 數據 ──────────────────────────────────────
    if args.data:
        sequences, labels = load_proteingym_data(args.data)
    else:
        print("\n[Step 1] 生成 Demo 數據集...")
        sequences, labels = make_demo_data(n=args.n_samples, seq_len=56)
        describe_dataset(sequences, labels)

    # ── ESM-2 Embedding ───────────────────────────
    print("\n[Step 2] 提取 ESM-2 Embedding...")
    embedder = ESM2Embedder(model_size=args.esm_size, batch_size=16)
    X = embedder.transform(sequences)

    # ── 數據分割 ──────────────────────────────────
    y = labels.numpy()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"\n  訓練集: {X_train.shape[0]} | 測試集: {X_test.shape[0]}")

    # ── 訓練 NN 代理模型 ──────────────────────────
    print("\n[Step 3] 訓練 Stability Predictor（NN 代理模型）...")
    trainer = PredictorTrainer(input_dim=embedder.embed_dim)
    trainer.fit(X_train, y_train, X_val=X_test, y_val=y_test,
                epochs=args.epochs, print_every=20)
    metrics = trainer.evaluate(X_test, y_test)
    y_pred = trainer.predict(X_test)

    # 儲存模型
    Path("outputs").mkdir(exist_ok=True)
    trainer.save("outputs/predictor.pt")

    # ── 定義 oracle 函數（供 BO 呼叫）────────────
    def oracle_fn(X_scaled: np.ndarray) -> np.ndarray:
        """
        BO 的評估函數，接受 embedding 空間的輸入。
        真實應用中替換為實驗結果。
        """
        return trainer.predict(X_scaled)

    # ── 貝葉斯最佳化 ──────────────────────────────
    print("\n[Step 4] 貝葉斯最佳化（在 PCA latent space 搜索）...")
    optimizer = BayesianOptimizer(
        oracle_fn=oracle_fn,
        n_pca_dims=args.pca_dims,
    )
    # 用訓練集的標準化 embedding 初始化
    X_train_scaled = trainer.scaler.transform(X_train)
    optimizer.initialize(X_train_scaled[:args.bo_init], y_train[:args.bo_init])
    bo_curve = optimizer.run(n_iter=args.bo_iters)

    # ── 收集 UMAP 所需的 embedding ──────────────────────────
    X_all_embed = trainer.scaler.transform(np.vstack([X_train, X_test]))
    # BO 硬推籃選：X_obs 後半段（超過初始點的求法探索點）
    n_init = args.bo_init
    if optimizer.X_obs.shape[0] > n_init:
        bo_pca = optimizer.X_obs[n_init:].numpy()          # (M, pca_dims)
        bo_embed = optimizer.pca.inverse_transform(bo_pca) # (M, embed_dim)
    else:
        bo_embed = None

    # ── 視覺化 ────────────────────────────────────────────
    print("\n[Step 5] 生成視覺化圖表...")
    plot_pipeline_results(
        trainer.train_losses, y_test, y_pred, bo_curve,
        val_losses=trainer.val_losses or None,
        X_embed=X_all_embed,
        bo_embed=bo_embed,
        save_path="outputs/results.png"
    )

    print("\n[Pipeline A 完成]")
    print(f"  Pearson r     : {metrics['Pearson_r']:.3f}")
    print(f"  Spearman ρ    : {metrics['Spearman_rho']:.3f}")
    print(f"  BO 最終最佳值 : {max(bo_curve):.4f}")
    print(f"  BO 提升幅度   : {max(bo_curve) - bo_curve[0]:+.4f}")
    # ── AF2 後處理：結構品質驗證（可選）─────────────
    if args.af2_validate:
        print("\n[Step 6] AF2 後處理：結構品質驗證...")
        # 取預測分數最高的前 N 条序列作為候選組
        y_pred_all = trainer.predict(X)
        top_idx    = np.argsort(y_pred_all)[::-1][:args.af2_top_n]
        top_seqs   = [sequences[i] for i in top_idx]
        print(f"  選取預測分數 Top-{args.af2_top_n} 序列進行結構驗證")

        # 下載野生型結構作為比較模板
        wildtype_pdb = None
        if args.wildtype_uniprot:
            wildtype_pdb = download_wildtype_structure(
                args.wildtype_uniprot,
                save_path="outputs/wildtype.pdb",
            )

        af2_client  = ColabFoldClient(prefer_colabfold=True)
        af2_results = validate_candidates(
            top_seqs, af2_client,
            wildtype_pdb=wildtype_pdb,
            top_n=args.af2_top_n,
        )
        _save_af2_report(af2_results, "outputs/af2_bo_validation.txt")

# ─────────────────────────────────────────────────
# Pipeline B：REINFORCE 蛋白質序列生成（Tab 04）
# ─────────────────────────────────────────────────

def run_rl_pipeline(args: argparse.Namespace) -> None:
    print("\n" + "=" * 60)
    print("  PIPELINE B：REINFORCE 蛋白質序列優化（Tab 04）")
    print("=" * 60)

    # ── 嘗試載入已訓練的 predictor 作為 oracle ─────
    oracle_fn = None
    predictor_path = Path("outputs/predictor.pt")
    if predictor_path.exists():
        print("\n[RL] 載入已訓練的 NN predictor 作為穩定性 oracle...")
        pred_trainer = PredictorTrainer(input_dim=320)
        pred_trainer.load(predictor_path)

        # RL oracle 接受序列列表，需要先提取 embedding
        embedder = ESM2Embedder(model_size=args.esm_size, batch_size=16)
        embedder._load_model()

        def sequence_oracle(seqs: list[str]) -> np.ndarray:
            X = embedder.transform(seqs)
            return pred_trainer.predict(X)

        oracle_fn = sequence_oracle
        print("[RL] Oracle 就緒（ESM-2 + NN predictor）")
    else:
        print("[RL] 未找到 predictor.pt，僅使用序列特徵 reward（不需要 ESM-2）")

    # ── 定義 Reward 函數 ──────────────────────────
    reward_fn = MultiObjectiveReward(
        oracle_fn=oracle_fn,
        w_stability=1.0 if oracle_fn else 0.0,
        w_hydrophobic=0.4,
        w_charged=0.3,
    )

    # ── 初始化 Policy 網路 ────────────────────────
    policy = SequencePolicy(
        embed_dim=64,
        hidden_dim=128,
        n_layers=2,
        seq_len=args.rl_seq_len,
    )

    # ── REINFORCE 訓練 ────────────────────────────
    print(f"\n[RL] 開始 REINFORCE 訓練（{args.rl_episodes} episodes）...")
    rl_trainer = REINFORCETrainer(
        policy=policy,
        reward_fn=reward_fn,
        lr=3e-4,
        batch_size=32,
        temperature=1.0,
    )
    rl_trainer.run(n_episodes=args.rl_episodes, print_every=max(1, args.rl_episodes // 10))

    # ── 生成 top 序列 ─────────────────────────────
    print("\n[RL] 採樣 top-10 優化序列（低溫採樣，temperature=0.5）...")
    top_results = rl_trainer.generate_top_sequences(n=100, temperature=0.5)[:10]

    Path("outputs").mkdir(exist_ok=True)
    with open("outputs/top_sequences.txt", "w", encoding="utf-8") as f:
        f.write("Rank | Reward | Sequence\n")
        f.write("-" * 70 + "\n")
        for rank, (seq, reward) in enumerate(top_results, 1):
            line = f"{rank:4d} | {reward:+.4f} | {seq}"
            print(f"  {line}")
            f.write(line + "\n")
    print("  已儲存至 outputs/top_sequences.txt")

    # ── 視覺化 ────────────────────────────────────
    plot_rl_training(
        rl_trainer.episode_rewards,
        rl_trainer.episode_best,
        save_path="outputs/rl_training.png",
    )

    # ── AF2 後處理：用 pLDDT 重新排序 RL 生成序列（可選）──────
    if args.af2_plddt_reward:
        print("\n[RL] AF2 後處理：用 ESMFold pLDDT 重新排序 Top 序列...")
        top_seqs_only = [seq for seq, _ in top_results]

        # 下載野生型結構（如指定 UniProt ID）
        wildtype_pdb = None
        if args.wildtype_uniprot:
            pdb_cache = Path("outputs/wildtype.pdb")
            if pdb_cache.exists():
                wildtype_pdb = pdb_cache.read_text(encoding="utf-8")
            else:
                wildtype_pdb = download_wildtype_structure(
                    args.wildtype_uniprot,
                    save_path=str(pdb_cache),
                )

        # prefer_colabfold=False → 直接使用 ESMFold，速度較快
        rl_af2_client  = ColabFoldClient(prefer_colabfold=False)
        rl_af2_results = validate_candidates(
            top_seqs_only, rl_af2_client,
            wildtype_pdb=wildtype_pdb,
            top_n=args.af2_top_n,
        )
        _save_af2_report(rl_af2_results, "outputs/af2_rl_validation.txt")

    print("\n[Pipeline B 完成]")


# ─────────────────────────────────────────────────
# Pipeline C：ProteinMPNN Demo（Tab 03 數學）
# ─────────────────────────────────────────────────

def run_mpnn_pipeline(args: argparse.Namespace) -> None:
    print("\n" + "=" * 60)
    print("  PIPELINE C：ProteinMPNN 圖訊息傳遞（Tab 03 數學推導）")
    print("=" * 60)

    model = SimplifiedProteinMPNN(
        node_in_dim=16,
        edge_in_dim=19,
        hidden_dim=128,
        n_layers=3,
    )
    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n[ProteinMPNN] 模型參數量: {total_params:,}")

    mpnn_trainer = ProteinMPNNTrainer(model, lr=1e-3)
    mpnn_trainer.train_demo(n_steps=args.mpnn_steps, seq_len=30)

    plot_mpnn_training(mpnn_trainer.losses, save_path="outputs/mpnn_loss.png")
    print("\n[Pipeline C 完成]")


# ─────────────────────────────────────────────────
# AF2 輔助：將驗證報告存檔
# ─────────────────────────────────────────────────

def _save_af2_report(results, save_path: str) -> None:
    """將 validate_candidates() 的結果寫入純文字報告。"""
    from src.alphafold import StructureQuality

    Path("outputs").mkdir(exist_ok=True)
    lines = ["AF2 Structure Validation Report", "=" * 70, ""]
    lines.append(f"{'Rank':<5} {'pLDDT':>8} {'TM-score':>10} {'RMSD(Å)':>9}  Sequence")
    lines.append("-" * 70)
    for rank, r in enumerate(results, 1):
        tm_str = f"{r.tm_score:.3f}"      if r.tm_score       is not None else "   N/A"
        rm_str = f"{r.rmsd_angstrom:.2f}" if r.rmsd_angstrom  is not None else "  N/A"
        lines.append(
            f"{rank:<5} {r.plddt_mean:>8.1f} {tm_str:>10} {rm_str:>9}  {r.sequence}"
        )
    Path(save_path).write_text("\n".join(lines), encoding="utf-8")
    print(f"  AF2 驗證報告已儲存至 {save_path}")


# ─────────────────────────────────────────────────
# 主程式入口
# ─────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="蛋白質 AI 面試 Mini Project Pipeline",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--mode", choices=["all", "bo", "rl", "mpnn"], default="all",
        help="執行的 pipeline 模式"
    )
    parser.add_argument("--data", type=str, default=None,
                        help="ProteinGym CSV 路徑（不指定時使用 demo 數據）")
    parser.add_argument("--n-samples", type=int, default=200,
                        help="Demo 數據集的序列數量")
    parser.add_argument("--esm-size", choices=["8M", "35M", "150M", "650M"], default="8M",
                        help="ESM-2 模型大小")
    parser.add_argument("--epochs", type=int, default=100,
                        help="NN predictor 訓練 epoch 數")
    parser.add_argument("--pca-dims", type=int, default=10,
                        help="BO 搜索空間的 PCA 維度")
    parser.add_argument("--bo-init", type=int, default=20,
                        help="BO 初始點數量")
    parser.add_argument("--bo-iters", type=int, default=15,
                        help="BO 迭代輪數")
    parser.add_argument("--rl-seq-len", type=int, default=30,
                        help="RL 生成序列長度")
    parser.add_argument("--rl-episodes", type=int, default=100,
                        help="REINFORCE 訓練 episode 數")
    parser.add_argument("--mpnn-steps", type=int, default=50,
                        help="ProteinMPNN demo 訓練步數")

    # ── AlphaFold 2 / ColabFold 相關 ─────────────────────
    parser.add_argument(
        "--wildtype-uniprot", type=str, default=None, metavar="UNIPROT_ID",
        help=(
            "野生型蛋白質的 UniProt Accession（例如 P0A7B8）。"
            "用於從 AlphaFold EBI API 下載野生型結構，"
            "作為 TM-score 與 RMSD 的比較參考模板。"
        ),
    )
    parser.add_argument(
        "--af2-validate", action="store_true",
        help=(
            "啟用：BO 後處理 —— 對預測分數 Top-N 序列用 ColabFold/ESMFold "
            "驗證結構品質（pLDDT，TM-score，RMSD）。"
        ),
    )
    parser.add_argument(
        "--af2-plddt-reward", action="store_true",
        help=(
            "啟用：RL 後處理 —— 用 ESMFold pLDDT 重新排序 RL 生成的 Top 序列。"
            "（推訕：先訓練 RL，再用 pLDDT 後處理，軒免訓練中大量 API 呼叫）"
        ),
    )
    parser.add_argument(
        "--af2-top-n", type=int, default=5, metavar="N",
        help="AF2 結構驗證的後選序列數量（預設 5）",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    Path("outputs").mkdir(exist_ok=True)

    if args.mode in ("all", "bo"):
        run_bo_pipeline(args)

    if args.mode in ("all", "mpnn"):
        run_mpnn_pipeline(args)

    if args.mode in ("all", "rl"):
        run_rl_pipeline(args)

    print("\n" + "=" * 60)
    print("  全部完成！輸出檔案位於 outputs/ 目錄")
    print("=" * 60)


if __name__ == "__main__":
    main()
