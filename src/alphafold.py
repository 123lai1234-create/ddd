"""
src/alphafold.py
──────────────────────────────────────────────────────────────────
AlphaFold 2 / ColabFold 整合模組

功能：
  1. ColabFoldClient  — 呼叫 api.colabfold.com 預測任意設計序列結構
                        （AF2 品質，帶 MSA）；自動回退至 ESMFold API
  2. download_wildtype_structure() — 從 AlphaFold EBI API 下載野生型結構
  3. compute_plddt()  — 從 PDB B-factor 欄提取 per-residue pLDDT（0–100）
  4. compute_rmsd()   — Kabsch 最優疊合後的 Cα RMSD（Å）
  5. compute_tm_score() — TM-score（純 Python，無需外部工具）
  6. validate_candidates() — BO／RL 後處理：批量驗證候選序列結構品質

部署需求：
  - requests ≥ 2.31（已在 requirements.txt）
  - numpy ≥ 1.24（已在 requirements.txt）
  - 無需本地 GPU，無需安裝 AlphaFold／ColabFold

API 說明：
  ColabFold Batch API (api.colabfold.com)
    POST /ticket/msa  → ticket_id（提交 MSA + 結構作業）
    GET  /ticket/{id} → 狀態輪詢（RUNNING / COMPLETE / ERROR）
    GET  /result/download/{id} → ZIP（含 rank_001.pdb）
    後端：AlphaFold2 + MMseqs2 MSA，通常 60–300 秒完成

  AlphaFold EBI API (alphafold.ebi.ac.uk)
    GET /api/prediction/{UniProt_ID} → 預計算結構（~200 萬蛋白）

  ESMFold API (esmatlas.com，備援)
    POST /api/fold → PDB（限序列 ≤400 AA）

參考文獻：
  Jumper et al. (2021) AlphaFold2. Nature 596:583–589.
  Mirdita et al. (2022) ColabFold. Nature Methods 19:679–682.
  Zhang & Skolnick (2004) TM-score. Proteins 57:702–710.
  Kabsch (1976) Alignment algorithm. Acta Cryst. A32:922–923.
"""

from __future__ import annotations

import io
import time
import warnings
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np

# ─────────────────────────────────────────────────
# API 端點
# ─────────────────────────────────────────────────
_COLABFOLD_API = "https://api.colabfold.com"
_ESMFOLD_API   = "https://esmatlas.com/api/fold"
_AF2_EBI_API   = "https://alphafold.ebi.ac.uk/api/prediction"
_VALID_AA      = set("ACDEFGHIKLMNPQRSTVWY")


# ─────────────────────────────────────────────────
# 資料結構
# ─────────────────────────────────────────────────

@dataclass
class StructureQuality:
    """單一序列的結構品質評估結果。"""
    sequence: str
    pdb_str: str
    plddt_mean: float
    plddt_per_residue: np.ndarray
    tm_score: Optional[float] = None
    rmsd_angstrom: Optional[float] = None
    method: str = "esmfold"

    def summary(self) -> str:
        """回傳人類可讀的評估摘要。"""
        lines = [
            f"  序列長度   : {len(self.sequence)} AA",
            f"  預測方法   : {self.method}",
            f"  平均 pLDDT : {self.plddt_mean:.1f}",
        ]
        if self.tm_score is not None:
            lines.append(f"  TM-score   : {self.tm_score:.3f}")
        if self.rmsd_angstrom is not None:
            lines.append(f"  RMSD (Å)   : {self.rmsd_angstrom:.2f}")
        return "\n".join(lines)


# ═══════════════════════════════════════════════════════
# 1. ColabFold Client
# ═══════════════════════════════════════════════════════

class ColabFoldClient:
    """
    ColabFold / ESMFold 結構預測客戶端。

    主要路徑（ColabFold Batch API，AF2 品質）：
      1. POST  api.colabfold.com/ticket/msa  → ticket_id
      2. GET   api.colabfold.com/ticket/{id} → 輪詢狀態
      3. GET   api.colabfold.com/result/download/{id} → ZIP（含 PDB）
      後端由 AlphaFold2 + MMseqs2 MSA 驅動，支援序列 ≤1000 AA。

    備援路徑（ESMFold 公開 API，限 ≤400 AA）：
      POST  esmatlas.com/api/fold → PDB 字串（Meta AI，單序列推論）

    Parameters
    ----------
    prefer_colabfold : bool
        True（預設）= 優先 ColabFold；False = 直接使用 ESMFold。
    max_wait_sec : int
        ColabFold 批次作業的最長等待秒數。
    poll_interval_sec : int
        輪詢狀態的間隔秒數。
    timeout : int
        HTTP 請求逾時秒數。
    """

    def __init__(
        self,
        prefer_colabfold: bool = True,
        max_wait_sec: int = 300,
        poll_interval_sec: int = 10,
        timeout: int = 120,
    ):
        self.prefer_colabfold  = prefer_colabfold
        self.max_wait_sec      = max_wait_sec
        self.poll_interval_sec = poll_interval_sec
        self.timeout           = timeout

    def predict(self, sequence: str) -> StructureQuality:
        """
        預測給定序列的 3D 結構，回傳 StructureQuality 物件。

        自動策略（依序嘗試）：
          1. ColabFold Batch API（帶 MSA，AF2 品質）
          2. ESMFold API（快速備援，限 ≤400 AA）

        Returns
        -------
        StructureQuality
            含 PDB 字串、pLDDT 分數及（若有野生型）TM-score 與 RMSD。

        Raises
        ------
        RuntimeError
            兩種 API 均不可用時拋出。
        """
        sequence = sequence.upper().strip()
        _validate_aa(sequence)

        if self.prefer_colabfold:
            try:
                pdb_str = self._predict_colabfold(sequence)
                plddt   = compute_plddt(pdb_str)
                return StructureQuality(
                    sequence          = sequence,
                    pdb_str           = pdb_str,
                    plddt_mean        = float(np.nanmean(plddt)),
                    plddt_per_residue = plddt,
                    method            = "colabfold",
                )
            except Exception as exc:
                warnings.warn(
                    f"[alphafold] ColabFold API 失敗（{exc}），退回 ESMFold API..."
                )

        # 備援：ESMFold
        pdb_str = self._predict_esmfold(sequence)
        plddt   = compute_plddt(pdb_str)
        return StructureQuality(
            sequence          = sequence,
            pdb_str           = pdb_str,
            plddt_mean        = float(np.nanmean(plddt)),
            plddt_per_residue = plddt,
            method            = "esmfold",
        )

    def predict_batch(
        self,
        sequences: list[str],
        wildtype_pdb: Optional[str] = None,
    ) -> list[StructureQuality]:
        """
        批量預測多條序列，可選擇與野生型結構比較。

        Parameters
        ----------
        sequences    : 候選序列列表
        wildtype_pdb : 野生型 PDB 字串；若提供則計算每條序列的
                       TM-score 與 RMSD。

        Returns
        -------
        list[StructureQuality]  與輸入序列等長，失敗序列跳過。
        """
        results: list[StructureQuality] = []
        for i, seq in enumerate(sequences):
            print(f"[alphafold] 批量預測 {i+1}/{len(sequences)}...")
            try:
                result = self.predict(seq)
                if wildtype_pdb is not None:
                    result.tm_score       = compute_tm_score(result.pdb_str, wildtype_pdb)
                    result.rmsd_angstrom  = compute_rmsd(result.pdb_str, wildtype_pdb)
                results.append(result)
            except Exception as exc:
                warnings.warn(f"[alphafold] 序列 {i+1} 預測失敗: {exc}")
        return results

    # ── ColabFold Batch API ─────────────────────────────────

    def _predict_colabfold(self, sequence: str) -> str:
        """
        呼叫 api.colabfold.com 批次 API。

        流程：submit → poll → download ZIP → 提取 rank_001.pdb
        """
        import requests

        print(f"[alphafold] 提交 ColabFold 作業（{len(sequence)} AA）...")
        fasta = f">query\n{sequence}"

        # 1. 提交作業，取得 ticket ID
        resp = requests.post(
            f"{_COLABFOLD_API}/ticket/msa",
            json={"q": fasta, "mode": "all"},
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        ticket = resp.json()["id"]
        print(f"[alphafold] 作業票號: {ticket}")

        # 2. 輪詢狀態直到完成或逾時
        deadline = time.time() + self.max_wait_sec
        while time.time() < deadline:
            time.sleep(self.poll_interval_sec)
            status_resp = requests.get(
                f"{_COLABFOLD_API}/ticket/{ticket}",
                timeout=self.timeout,
            )
            status_resp.raise_for_status()
            status = status_resp.json().get("status", "UNKNOWN")
            print(f"[alphafold]   狀態: {status}")
            if status == "COMPLETE":
                break
            if status == "ERROR":
                raise RuntimeError(
                    f"ColabFold 作業失敗: {status_resp.json()}"
                )
        else:
            raise TimeoutError(
                f"ColabFold 作業超時（>{self.max_wait_sec}s），"
                "請增加 max_wait_sec 或改用 ESMFold 備援。"
            )

        # 3. 下載結果 ZIP
        dl_resp = requests.get(
            f"{_COLABFOLD_API}/result/download/{ticket}",
            timeout=self.timeout,
        )
        dl_resp.raise_for_status()

        # 4. 從 ZIP 提取 PDB（優先 rank_001，即最高置信度模型）
        with zipfile.ZipFile(io.BytesIO(dl_resp.content)) as zf:
            pdb_names = [n for n in zf.namelist() if n.endswith(".pdb")]
            if not pdb_names:
                raise RuntimeError("ColabFold 結果 ZIP 中無 PDB 檔案")
            best_pdb = next(
                (n for n in pdb_names if "rank_001" in n),
                sorted(pdb_names)[0],
            )
            pdb_str = zf.read(best_pdb).decode("utf-8")

        mean_plddt = float(np.nanmean(compute_plddt(pdb_str)))
        print(f"[alphafold] ColabFold 完成，平均 pLDDT: {mean_plddt:.1f}")
        return pdb_str

    # ── ESMFold 備援 ────────────────────────────────────────

    def _predict_esmfold(self, sequence: str) -> str:
        """呼叫 esmatlas.com ESMFold 公開 API（限 ≤400 AA）。"""
        import requests

        if len(sequence) > 400:
            raise ValueError(
                f"ESMFold API 限制序列長度 ≤400 AA，目前 {len(sequence)} AA。"
                "請改用 ColabFold API 或截取目標區域。"
            )

        print(f"[alphafold] 呼叫 ESMFold API（{len(sequence)} AA）...")
        t0   = time.time()
        resp = requests.post(
            _ESMFOLD_API,
            data    = sequence,
            headers = {"Content-Type": "application/x-www-form-urlencoded"},
            timeout = self.timeout,
        )
        if resp.status_code != 200:
            raise RuntimeError(
                f"ESMFold API 回傳錯誤 {resp.status_code}: {resp.text[:200]}"
            )
        print(f"[alphafold] ESMFold 完成，耗時 {time.time() - t0:.1f}s")
        return resp.text


# ═══════════════════════════════════════════════════════
# 2. 野生型結構下載（AlphaFold EBI API）
# ═══════════════════════════════════════════════════════

def download_wildtype_structure(
    uniprot_id: str,
    save_path: Optional[str | Path] = None,
) -> str:
    """
    從 AlphaFold EBI 資料庫下載野生型蛋白的預計算結構。

    支援約 200 萬個 UniProt 蛋白，為 AlphaFold2 全原子預測結果。
    下載的結構可作為後續 TM-score / RMSD 比較的參考模板。

    Parameters
    ----------
    uniprot_id : str
        UniProt Accession，例如 "P0A7B8"（E. coli RpsA）、
        "P02768"（人類白蛋白）、"P04637"（p53）。
    save_path : str | Path | None
        若指定，將 PDB 字串儲存為本地檔案（路徑不存在時自動建立）。

    Returns
    -------
    str  PDB 格式字串（可直接傳給 compute_tm_score / compute_rmsd）

    Raises
    ------
    ValueError
        UniProt ID 不在 AlphaFold EBI 資料庫中。
    """
    import requests

    uid  = uniprot_id.upper().strip()
    print(f"[alphafold] 下載野生型結構（UniProt: {uid}）...")

    resp = requests.get(f"{_AF2_EBI_API}/{uid}", timeout=30)
    if resp.status_code == 404:
        raise ValueError(
            f"UniProt ID '{uid}' 在 AlphaFold EBI 資料庫中不存在。"
            "請至 https://alphafold.ebi.ac.uk 確認。"
        )
    resp.raise_for_status()

    data       = resp.json()
    pdb_url    = data[0]["pdbUrl"]
    plddt_glob = data[0].get("globalMetricValue")

    pdb_resp   = requests.get(pdb_url, timeout=60)
    pdb_resp.raise_for_status()
    pdb_str    = pdb_resp.text

    if plddt_glob:
        print(f"[alphafold] 野生型下載完成，global pLDDT = {plddt_glob:.1f}")
    else:
        print("[alphafold] 野生型下載完成")

    if save_path:
        p = Path(save_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(pdb_str, encoding="utf-8")
        print(f"[alphafold] 儲存至 {save_path}")

    return pdb_str


# ═══════════════════════════════════════════════════════
# 3. pLDDT 提取
# ═══════════════════════════════════════════════════════

def compute_plddt(pdb_str: str) -> np.ndarray:
    """
    從 ESMFold / AlphaFold2 / ColabFold 輸出的 PDB 中
    提取 per-residue pLDDT 分數（儲存於 B-factor 欄位）。

    pLDDT 解讀：
        > 90     極高可信度（可用於藥物設計）
        70–90   高可信度（多數主鏈正確）
        50–70   中等（整體折疊可信，環區可能偏差）
        < 50    低可信度（本質無序區或預測偏差）

    Returns
    -------
    np.ndarray  shape (L,)，值域 0–100
    """
    scores: list[float] = []
    seen: set[tuple] = set()
    for line in pdb_str.splitlines():
        if not line.startswith("ATOM"):
            continue
        if line[12:16].strip() != "CA":
            continue
        chain = line[21]
        try:
            resi = int(line[22:26])
        except ValueError:
            continue
        key = (chain, resi)
        if key in seen:
            continue
        seen.add(key)
        try:
            scores.append(float(line[60:66]))
        except ValueError:
            scores.append(float("nan"))
    return np.array(scores, dtype=np.float32)


# ═══════════════════════════════════════════════════════
# 4. RMSD（Kabsch 疊合）
# ═══════════════════════════════════════════════════════

def compute_rmsd(pdb_query: str, pdb_ref: str, chain: str = "A") -> float:
    """
    計算兩個蛋白質結構之間的 Cα RMSD（Å），使用 Kabsch 最優疊合。

    若序列長度不同，取較短者的長度（N 端對齊）進行比較。

    數學原理：
        RMSD = √( (1/N) · Σᵢ ||rᵢ_query − rᵢ_ref||² )
        旋轉矩陣 R 由 Kabsch 算法透過 SVD 求得，最小化 RMSD。

    RMSD 解讀：
        < 1 Å   非常相似（幾乎相同折疊）
        1–3 Å   相似（相同 fold family）
        > 5 Å   顯著差異

    Parameters
    ----------
    pdb_query : str   設計序列的 PDB 字串
    pdb_ref   : str   參考（野生型）PDB 字串
    chain     : str   比較的鏈 ID（預設 'A'）

    Returns
    -------
    float  RMSD（Å）
    """
    q = _extract_ca_coords(pdb_query, chain)
    r = _extract_ca_coords(pdb_ref,   chain)
    if not q or not r:
        raise ValueError("無法提取 Cα 座標，請確認鏈 ID 正確")

    n = min(len(q), len(r))
    P = np.array(q[:n], dtype=np.float64)
    Q = np.array(r[:n], dtype=np.float64)

    P_rot = _kabsch_align(P, Q)
    return float(np.sqrt(np.mean(np.sum((P_rot - Q) ** 2, axis=1))))


# ═══════════════════════════════════════════════════════
# 5. TM-score（純 Python 實作）
# ═══════════════════════════════════════════════════════

def compute_tm_score(pdb_query: str, pdb_ref: str, chain: str = "A") -> float:
    """
    計算兩個蛋白質結構的 TM-score（0–1），純 Python/NumPy 實作。

    TM-score 定義（Zhang & Skolnick, 2004）：

        d₀(L_ref) = 1.24 · ∛(L_ref − 15) − 1.8   （L_ref ≥ 22）
                  = 0.5                             （L_ref < 22）

        TM = (1 / L_ref) · max_rotation Σᵢ 1 / (1 + (dᵢ / d₀)²)

    此實作使用 Kabsch 疊合作為旋轉，計算 TM-score 的一個下界估計。

    分數解讀：
        TM > 0.5   → 相同折疊（結構同源）
        TM < 0.17  → 隨機結構（非同源）

    Parameters
    ----------
    pdb_query : str   設計序列的 PDB 字串
    pdb_ref   : str   參考（野生型）PDB 字串
    chain     : str   比較的鏈 ID（預設 'A'）

    Returns
    -------
    float  TM-score ∈ (0, 1]
    """
    q = _extract_ca_coords(pdb_query, chain)
    r = _extract_ca_coords(pdb_ref,   chain)
    if not q or not r:
        raise ValueError("無法提取 Cα 座標，請確認鏈 ID 正確")

    L_ref = len(r)
    n     = min(len(q), L_ref)
    P     = np.array(q[:n], dtype=np.float64)
    Q     = np.array(r[:n], dtype=np.float64)

    # d₀ 依參考序列長度計算（下限 0.5 防止極短序列數值爆炸）
    d0 = max(1.24 * ((L_ref - 15) ** (1.0 / 3.0)) - 1.8, 0.5) if L_ref >= 22 else 0.5

    P_rot  = _kabsch_align(P, Q)
    d_sq   = np.sum((P_rot - Q) ** 2, axis=1)          # (n,) per-residue 距離²
    tm_sum = float(np.sum(1.0 / (1.0 + d_sq / (d0 ** 2))))
    return min(tm_sum / L_ref, 1.0)                     # 數值保護（≤1）


# ═══════════════════════════════════════════════════════
# 6. BO／RL 後處理候選序列驗證
# ═══════════════════════════════════════════════════════

def validate_candidates(
    sequences: list[str],
    client: ColabFoldClient,
    wildtype_pdb: Optional[str] = None,
    top_n: int = 5,
) -> list[StructureQuality]:
    """
    對 BO／RL 最佳化後的候選序列進行結構品質驗證。

    完整流程：
      1. 呼叫 ColabFold / ESMFold API 預測各序列結構
      2. 計算 pLDDT 自信度分數
      3. 若提供野生型結構，計算 TM-score 與 RMSD
      4. 依平均 pLDDT 降序排列，回傳 top_n 結果

    Parameters
    ----------
    sequences    : 候選序列列表（BO / RL 輸出的 top 序列）
    client       : ColabFoldClient 實例
    wildtype_pdb : 野生型 PDB 字串；可由
                   ``download_wildtype_structure()`` 取得
    top_n        : 回傳最高結構品質的前 N 個結果

    Returns
    -------
    list[StructureQuality]  依 pLDDT 降序排列的 top_n 結果
    """
    print(f"\n[alphafold] 對 {len(sequences)} 條候選序列進行 AF2 結構驗證...")

    if wildtype_pdb:
        wt_plddt = float(np.nanmean(compute_plddt(wildtype_pdb)))
        print(f"[alphafold] 野生型參考 pLDDT: {wt_plddt:.1f}")

    results = client.predict_batch(sequences, wildtype_pdb=wildtype_pdb)

    if not results:
        warnings.warn("[alphafold] 所有序列預測均失敗，請檢查 API 可用性")
        return []

    results.sort(key=lambda r: r.plddt_mean, reverse=True)
    top_results = results[:top_n]

    # ── 輸出驗證結果表格 ────────────────────────────────────
    has_wt = wildtype_pdb is not None
    header = f"  {'Rank':<5} {'pLDDT':>8} {'TM-score':>10} {'RMSD(Å)':>9}  Sequence"
    print(f"\n[alphafold] Top-{len(top_results)} 結構驗證結果（依 pLDDT 降序）：")
    print(header)
    print("  " + "-" * 70)
    for rank, r in enumerate(top_results, 1):
        tm_str = f"{r.tm_score:.3f}"      if r.tm_score       is not None else "   N/A"
        rm_str = f"{r.rmsd_angstrom:.2f}" if r.rmsd_angstrom  is not None else "  N/A"
        print(f"  {rank:<5} {r.plddt_mean:>8.1f} {tm_str:>10} {rm_str:>9}  {r.sequence}")

    if has_wt:
        avg_tm = np.mean([r.tm_score for r in top_results if r.tm_score is not None])
        print(f"\n[alphafold] Top-{len(top_results)} 平均 TM-score: {avg_tm:.3f}"
              f"（> 0.5 = 維持折疊）")

    return top_results


# ═══════════════════════════════════════════════════════
# 內部輔助函數
# ═══════════════════════════════════════════════════════

def _validate_aa(seq: str) -> None:
    """驗證序列僅含 20 種標準胺基酸。"""
    invalid = set(seq) - _VALID_AA
    if invalid:
        raise ValueError(f"序列含非標準字元: {invalid}。請僅使用 20 種標準胺基酸。")
    if not seq:
        raise ValueError("序列不得為空")


def _extract_ca_coords(pdb_str: str, chain: str = "A") -> list[np.ndarray]:
    """從 PDB 字串提取指定鏈的 Cα 原子座標列表。"""
    coords: list[np.ndarray] = []
    seen: set[int] = set()
    for line in pdb_str.splitlines():
        if not line.startswith("ATOM"):
            continue
        if line[21] != chain:
            continue
        if line[12:16].strip() != "CA":
            continue
        try:
            resi = int(line[22:26])
        except ValueError:
            continue
        if resi in seen:
            continue
        seen.add(resi)
        try:
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            coords.append(np.array([x, y, z]))
        except ValueError:
            continue
    return coords


def _kabsch_align(P: np.ndarray, Q: np.ndarray) -> np.ndarray:
    """
    Kabsch 算法：將點集 P 旋轉疊合至 Q，最小化 RMSD。

    數學步驟：
      1. 中心化：P_c = P − P̄，Q_c = Q − Q̄
      2. 協方差：H = P_cᵀ Q_c
      3. SVD：H = U Σ Vᵀ
      4. 修正反射：d = sign(det(VUᵀ))
      5. 旋轉矩陣：R = Vᵀ diag(1,1,d) Uᵀ
      6. 疊合：P_rot = P_c Rᵀ + Q̄

    Parameters
    ----------
    P, Q : np.ndarray  shape (L, 3)  兩組 Cα 座標

    Returns
    -------
    P_rot : np.ndarray  旋轉平移後的 P，shape (L, 3)
    """
    P_c = P - P.mean(axis=0)
    Q_c = Q - Q.mean(axis=0)

    H   = P_c.T @ Q_c                                    # (3, 3)
    U, _, Vt = np.linalg.svd(H)

    # 防止反射（det 可能為 –1）
    d           = np.sign(np.linalg.det(Vt.T @ U.T))
    sign_matrix = np.diag([1.0, 1.0, float(d)])
    R           = Vt.T @ sign_matrix @ U.T               # 旋轉矩陣 (3, 3)

    return P_c @ R.T + Q.mean(axis=0)
