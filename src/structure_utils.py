"""
src/structure_utils.py
──────────────────────────────────────────────────────────────────
BioPython 蛋白質結構工具集

功能：
  1. PDB 檔案解析（Bio.PDB.PDBParser）
  2. 序列萃取（SEQRES 或從 CA 原子推算）
  3. 二級結構計算（DSSP via BioPython）
  4. Cα 距離矩陣
  5. 接觸圖（Contact Map, 閾值 8Å）
  6. 殘基 B-factor 分析（柔性指標）
  7. 從 RCSB 下載 PDB

BioPython 參考文獻：
  Cock et al. (2009) Bioinformatics 25(11):1422–1423
  https://biopython.org/
"""

from __future__ import annotations

import io
import warnings
from pathlib import Path
from typing import Optional

import numpy as np

# ─────────────────────────────────────────────────
# 安全 import：BioPython 為可選依賴
# ─────────────────────────────────────────────────
try:
    from Bio import SeqIO, PDB
    from Bio.PDB import PDBParser, DSSP, Select
    from Bio.PDB.Polypeptide import is_aa, three_to_one
    from Bio.SeqUtils import seq1
    HAS_BIOPYTHON = True
except ImportError:
    HAS_BIOPYTHON = False

# ─────────────────────────────────────────────────
# 標準 20 種胺基酸
# ─────────────────────────────────────────────────
STANDARD_AA = set("ACDEFGHIKLMNPQRSTVWY")

THREE_TO_ONE = {
    "ALA": "A", "CYS": "C", "ASP": "D", "GLU": "E", "PHE": "F",
    "GLY": "G", "HIS": "H", "ILE": "I", "LYS": "K", "LEU": "L",
    "MET": "M", "ASN": "N", "PRO": "P", "GLN": "Q", "ARG": "R",
    "SER": "S", "THR": "T", "VAL": "V", "TRP": "W", "TYR": "Y",
}


# ═══════════════════════════════════════════════════════
# 公用 API
# ═══════════════════════════════════════════════════════

def download_pdb(pdb_id: str, save_dir: str | Path = ".") -> Path:
    """從 RCSB PDB 下載結構檔 → 存為 <pdb_id>.pdb"""
    import urllib.request

    pdb_id = pdb_id.upper()
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    save_path = Path(save_dir) / f"{pdb_id}.pdb"
    save_path.parent.mkdir(parents=True, exist_ok=True)

    urllib.request.urlretrieve(url, save_path)
    print(f"[structure_utils] 下載完成: {save_path}")
    return save_path


def parse_pdb(pdb_path: str | Path, model_id: int = 0):
    """
    解析 PDB 檔案，回傳 Bio.PDB.Model.Model 物件。

    Parameters
    ----------
    pdb_path : str | Path
        PDB 檔案路徑。
    model_id : int
        NMR ensemble 中的 model index，預設 0（第一個）。

    Returns
    -------
    Bio.PDB.Model.Model
    """
    _require_biopython()
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("protein", str(pdb_path))
    return structure[model_id]


def extract_sequence(model, chain_id: Optional[str] = None) -> dict[str, str]:
    """
    從 BioPython model 萃取序列（排除 HETATM、非標準胺基酸）。

    Returns
    -------
    dict[str, str]
        {chain_id: one_letter_sequence}
    """
    _require_biopython()
    result = {}
    for chain in model.get_chains():
        cid = chain.get_id()
        if chain_id is not None and cid != chain_id:
            continue
        seq = []
        for res in chain.get_residues():
            if res.get_id()[0] != " ":       # 跳過 HETATM
                continue
            aa3 = res.get_resname().strip()
            aa1 = THREE_TO_ONE.get(aa3)
            if aa1:
                seq.append(aa1)
        if seq:
            result[cid] = "".join(seq)
    return result


def ca_distance_matrix(model, chain_id: str = "A") -> np.ndarray:
    """
    計算指定鏈的 Cα 距離矩陣（Å）。

    Returns
    -------
    np.ndarray  shape (L, L)
    """
    _require_biopython()
    coords = _get_ca_coords(model, chain_id)
    # 向量化計算：從 O(L²) 雙迴圈改為 numpy broadcasting，速度提升 ~100×
    ca = np.array(coords, dtype=np.float32)          # (L, 3)
    diff = ca[:, None, :] - ca[None, :, :]            # (L, L, 3)
    return np.sqrt((diff ** 2).sum(axis=-1))          # (L, L)


def contact_map(
    model,
    chain_id: str = "A",
    threshold: float = 8.0,
) -> np.ndarray:
    """
    從距離矩陣生成接觸圖（Boolean，True = 接觸，|i - j| > 5 才計算）。

    Parameters
    ----------
    threshold : float
        接觸距離閾值（Å），業界慣用 8 Å。
    """
    dist = ca_distance_matrix(model, chain_id)
    n = dist.shape[0]
    cmap = (dist < threshold).astype(np.float32)
    # 向量化遮罩序列鄰近殘基（|i-j| ≤ 5），取代雙迴圈
    idx = np.arange(n)
    seq_sep = np.abs(idx[:, None] - idx[None, :])    # (L, L)
    cmap[seq_sep <= 5] = 0.0
    np.fill_diagonal(cmap, 0.0)                       # 對角線歸零
    return cmap


def secondary_structure(
    model,
    pdb_path: str | Path,
    chain_id: str = "A",
) -> list[tuple[int, str, str]]:
    """
    用 DSSP 計算二級結構（需安裝 mkdssp 或 dssp 可執行檔）。

    Returns
    -------
    list of (resi, aa, ss_code)
        ss_code: H=α-helix, B=β-bridge, E=β-strand, G=3₁₀-helix,
                 I=π-helix, T=turn, S=bend, -=coil
    """
    _require_biopython()
    try:
        # 需要完整 structure 物件給 DSSP
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure("prot", str(pdb_path))
        dssp = DSSP(structure[0], str(pdb_path))
        result = []
        for key in dssp.keys():
            if key[0] != chain_id:
                continue
            resi = key[1][1]
            a = dssp[key]
            aa, ss = a[1], a[2]
            result.append((resi, aa, ss))
        return result
    except Exception as e:
        warnings.warn(f"[structure_utils] DSSP 失敗（是否已安裝 mkdssp？）: {e}")
        return []


def bfactor_profile(model, chain_id: str = "A") -> np.ndarray:
    """
    回傳各殘基 Cα 的 B-factor（溫度因子），用作柔性指標。

    Returns
    -------
    np.ndarray  shape (L,)
    """
    _require_biopython()
    bfactors = []
    for res in _iter_residues(model, chain_id):
        if "CA" in res:
            bfactors.append(res["CA"].get_bfactor())
        else:
            bfactors.append(float("nan"))
    return np.array(bfactors, dtype=np.float32)


def analyze_pdb(pdb_id_or_path: str | Path) -> dict:
    """
    一站式分析：下載（或讀取）PDB → 萃取序列、距離矩陣、接觸數量、B-factor。

    Parameters
    ----------
    pdb_id_or_path
        4 字元 PDB ID（自動下載）或本地 .pdb 檔案路徑。

    Returns
    -------
    dict with keys:
        sequences, distance_matrix, contact_map, bfactor_profile,
        n_residues, n_contacts
    """
    _require_biopython()
    p = Path(str(pdb_id_or_path))
    if not p.exists():
        # 視為 PDB ID，自動下載
        p = download_pdb(str(pdb_id_or_path))

    model = parse_pdb(p)
    sequences = extract_sequence(model)
    first_chain = next(iter(sequences)) if sequences else "A"

    dist = ca_distance_matrix(model, first_chain)
    cmap = contact_map(model, first_chain)
    bf   = bfactor_profile(model, first_chain)

    n_res = dist.shape[0]
    n_cont = int(cmap.sum() // 2)          # 對稱，除以 2

    print(f"[structure_utils] {p.name} | chain {first_chain} | "
          f"{n_res} 殘基 | {n_cont} 接觸對 | "
          f"mean B-factor={np.nanmean(bf):.2f}")

    return dict(
        sequences      = sequences,
        distance_matrix= dist,
        contact_map    = cmap,
        bfactor_profile= bf,
        n_residues     = n_res,
        n_contacts     = n_cont,
    )


# ═══════════════════════════════════════════════════════
# 內部輔助
# ═══════════════════════════════════════════════════════

def _require_biopython():
    if not HAS_BIOPYTHON:
        raise ImportError(
            "BioPython 未安裝，請執行: pip install biopython"
        )


def _get_ca_coords(model, chain_id: str) -> list[np.ndarray]:
    coords = []
    for res in _iter_residues(model, chain_id):
        if "CA" in res:
            coords.append(res["CA"].get_vector().get_array())
    return coords


def _iter_residues(model, chain_id: str):
    for chain in model.get_chains():
        if chain.get_id() == chain_id:
            for res in chain.get_residues():
                if res.get_id()[0] == " ":       # 標準胺基酸（非 HETATM）
                    yield res
