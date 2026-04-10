"""
src/esm_fold.py
──────────────────────────────────────────────────────────────────
ESMFold / AlphaFold2 結構預測整合

提供兩條路徑：
  1. ESMFold（Meta）— 無需帳號，呼叫公開 API (esmatlas.com/api/fold)
     回傳 PDB 字串，可直接傳給 3Dmol.js 或 BioPython。
  2. AlphaFold2 EBI 資料庫 — 依 UniProt ID 查詢預計算結構
     (alphafold.ebi.ac.uk/api/prediction)
  3. 本地 ESMFold（transformers >= 4.31）— GPU 推論，高準確度

公開 API 限制：
  - ESMFold API：序列長度 ≤ 400 AA（免費，無需 key）
  - AlphaFold EBI：僅限有 UniProt ID 的已知蛋白

參考文獻：
  Lin et al. (2023) Evolutionary-scale prediction of atomic-level
  protein structure with a language model. Science 379:1123–1130.
  Jumper et al. (2021) Nature 596:583–589.
"""

from __future__ import annotations

import time
import warnings
from pathlib import Path
from typing import Optional

import numpy as np


# ─────────────────────────────────────────────────
# ESMFold 公開 API
# ─────────────────────────────────────────────────
ESMFOLD_API_URL = "https://esmatlas.com/api/fold"
ALPHAFOLD_API   = "https://alphafold.ebi.ac.uk/api/prediction"


def predict_with_esmfold_api(
    sequence: str,
    timeout: int = 120,
) -> str:
    """
    呼叫 Meta ESMFold 公開 REST API 預測蛋白質結構。

    Parameters
    ----------
    sequence : str
        胺基酸序列（1 字母代碼，標準 20 種 AA，長度 ≤ 400）。
    timeout : int
        HTTP 請求逾時秒數。

    Returns
    -------
    str
        PDB 格式字串，可直接存為 .pdb 或傳給 3Dmol.js。

    Raises
    ------
    ValueError
        序列含非標準字元或超過長度限制。
    RuntimeError
        API 請求失敗。
    """
    import requests

    sequence = sequence.upper().strip()
    _validate_sequence(sequence)
    if len(sequence) > 400:
        raise ValueError(
            f"ESMFold API 限制序列長度 ≤ 400，目前 {len(sequence)} AA。"
            "請使用本地 ESMFold 或截取目標區域。"
        )

    print(f"[esm_fold] 呼叫 ESMFold API（{len(sequence)} AA）...")
    t0 = time.time()

    resp = requests.post(
        ESMFOLD_API_URL,
        data=sequence,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"ESMFold API 回傳錯誤 {resp.status_code}: {resp.text[:200]}"
        )

    elapsed = time.time() - t0
    pdb_str = resp.text
    print(f"[esm_fold] ESMFold 完成，耗時 {elapsed:.1f}s，"
          f"PDB 大小 {len(pdb_str)//1024} KB")
    return pdb_str


def predict_with_local_esmfold(
    sequence: str,
    device: str = "cpu",
) -> str:
    """
    使用本地 transformers ESMFold 模型預測結構（需 GPU 推薦）。

    Model: facebook/esmfold_v1（~690 MB，自動下載）

    Parameters
    ----------
    device : str
        "cuda" 或 "cpu"（cpu 很慢，建議 GPU）。

    Returns
    -------
    str  PDB 格式字串
    """
    try:
        import torch
        from transformers import EsmForProteinFolding, EsmTokenizer
    except ImportError:
        raise ImportError(
            "需要 transformers >= 4.31：pip install 'transformers>=4.31'"
        )

    sequence = sequence.upper().strip()
    _validate_sequence(sequence)

    print("[esm_fold] 載入 ESMFold 本地模型（首次需下載 ~690 MB）...")
    tokenizer = EsmTokenizer.from_pretrained("facebook/esmfold_v1")
    model = EsmForProteinFolding.from_pretrained(
        "facebook/esmfold_v1", low_cpu_mem_usage=True
    )
    model = model.to(device)
    model.eval()

    tokenized = tokenizer(
        [sequence], return_tensors="pt", add_special_tokens=False
    )
    tokenized = {k: v.to(device) for k, v in tokenized.items()}

    with torch.no_grad():
        output = model(**tokenized)

    pdb_str = model.output_to_pdb(output)[0]
    print(f"[esm_fold] 本地 ESMFold 完成，pLDDT 平均: "
          f"{output.plddt.mean().item():.1f}")
    return pdb_str


def get_alphafold_structure(
    uniprot_id: str,
    save_path: Optional[str | Path] = None,
) -> str:
    """
    從 AlphaFold EBI 資料庫下載預計算的蛋白質結構。

    Parameters
    ----------
    uniprot_id : str
        UniProt Accession，例如 "P0A7B8"（E. coli 核糖體蛋白）。
    save_path : str | Path | None
        若指定，將 PDB 字串儲存至此路徑。

    Returns
    -------
    str  PDB 格式字串
    """
    import requests

    uniprot_id = uniprot_id.upper().strip()
    url = f"{ALPHAFOLD_API}/{uniprot_id}"
    print(f"[esm_fold] 查詢 AlphaFold EBI: {uniprot_id}...")

    resp = requests.get(url, timeout=30)
    if resp.status_code == 404:
        raise ValueError(
            f"UniProt ID '{uniprot_id}' 在 AlphaFold 資料庫中不存在。"
        )
    resp.raise_for_status()
    data = resp.json()

    # 下載第一個預測結構的 PDB
    pdb_url = data[0]["pdbUrl"]
    pdb_resp = requests.get(pdb_url, timeout=60)
    pdb_resp.raise_for_status()
    pdb_str = pdb_resp.text

    plddt = data[0].get("globalMetricValue")
    if plddt:
        print(f"[esm_fold] AlphaFold 結構下載完成，global pLDDT={plddt:.1f}")
    else:
        print("[esm_fold] AlphaFold 結構下載完成")

    if save_path:
        Path(save_path).write_text(pdb_str)
        print(f"[esm_fold] 儲存至 {save_path}")

    return pdb_str


def plddt_from_bfactor(pdb_str: str) -> np.ndarray:
    """
    從 ESMFold/AlphaFold 輸出的 PDB 中萃取 pLDDT 分數
    （儲存在 B-factor 欄位內）。

    Returns
    -------
    np.ndarray  shape (L,) per-residue pLDDT 0~100
    """
    scores = []
    seen = set()
    for line in pdb_str.splitlines():
        if line.startswith("ATOM") and line[12:16].strip() == "CA":
            chain = line[21]
            resi  = int(line[22:26])
            key   = (chain, resi)
            if key not in seen:
                seen.add(key)
                try:
                    scores.append(float(line[60:66]))
                except ValueError:
                    scores.append(float("nan"))
    return np.array(scores, dtype=np.float32)


def save_pdb(pdb_str: str, path: str | Path) -> Path:
    """將 PDB 字串儲存至檔案。"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(pdb_str)
    print(f"[esm_fold] PDB 已儲存: {path}")
    return path


# ═══════════════════════════════════════════════════════
# 內部輔助
# ═══════════════════════════════════════════════════════
_VALID_AA = set("ACDEFGHIKLMNPQRSTVWY")

def _validate_sequence(seq: str):
    invalid = set(seq) - _VALID_AA
    if invalid:
        raise ValueError(
            f"序列含非標準字元: {invalid}。請僅使用 20 種標準胺基酸。"
        )
    if len(seq) == 0:
        raise ValueError("序列不得為空。")
