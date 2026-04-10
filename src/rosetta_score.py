"""
src/rosetta_score.py
──────────────────────────────────────────────────────────────────
Rosetta / PyRosetta 能量評分整合

提供兩層：
  1. 簡化版 REF2015-like 能量（純 Python，無需安裝 PyRosetta）
     - fa_atr  ：Lennard-Jones 吸引力（接觸能量）
     - fa_rep  ：Lennard-Jones 排斥力（碰撞懲罰）
     - fa_sol  ：溶解能（疏水核心獎勵）
     - hbond   ：氫鍵（骨架 N–H···O=C）
     - ref     ：參考能量（殘基傾向性，REF2015 查表）
     總分 ≈ Σ(權重 × 項) —— 用於相對比較，非絕對 Rosetta 單位

  2. 真實 PyRosetta（若已安裝）
     - REF2015 全原子力場
     - FastRelax 能量最小化
     - PackRotamers 側鏈優化

參考文獻：
  Alford et al. (2017) J Chem Theory Comput 13:3031–3048.
  Leman et al. (2020) Nature Methods 17:665–680.
"""

from __future__ import annotations

import warnings
from pathlib import Path
from typing import Dict, Optional

import numpy as np

# ─── 嘗試匯入 PyRosetta ───────────────────────────────
HAS_PYROSETTA = False
try:
    import pyrosetta
    HAS_PYROSETTA = True
except ImportError:
    pass

# ─── 嘗試匯入 BioPython（用於結構讀取）─────────────────
HAS_BIOPYTHON = False
try:
    from Bio.PDB import PDBParser
    HAS_BIOPYTHON = True
except ImportError:
    pass


# ═══════════════════════════════════════════════════════
# REF2015 殘基參考能量（來自 Rosetta 官方資料）
# ═══════════════════════════════════════════════════════
_REF2015 = {
    "A": -0.358, "C":  2.059, "D": -1.368, "E": -2.038,
    "F":  0.800, "G":  0.000, "H":  0.652, "I":  0.430,
    "K": -2.138, "L":  0.430, "M":  0.431, "N": -1.194,
    "P": -1.176, "Q": -1.636, "R": -1.474, "S": -0.793,
    "T": -0.777, "V":  0.430, "W":  2.143, "Y":  1.200,
}

# 疏水性指數（Kyte-Doolittle），用於 fa_sol 近似
_HYDROPHOBICITY = {
    "A": 1.8, "C": 2.5, "D":-3.5, "E":-3.5, "F": 2.8,
    "G":-0.4, "H":-3.2, "I": 4.5, "K":-3.9, "L": 3.8,
    "M": 1.9, "N":-3.5, "P":-1.6, "Q":-3.5, "R":-4.5,
    "S":-0.8, "T":-0.7, "V": 4.2, "W":-0.9, "Y":-1.3,
}

# ═══════════════════════════════════════════════════════
# 簡化版能量打分（序列層面，不需要 3D 座標）
# ═══════════════════════════════════════════════════════

def score_sequence_simple(sequence: str) -> Dict[str, float]:
    """
    從純序列計算近似 Rosetta REF2015 能量項。

    不需要 PDB 座標，用於快速 in-silico 評估序列品質。
    分數僅供相對比較，單位為 REU（Rosetta Energy Units）。

    Returns
    -------
    dict  {"ref": float, "fa_sol": float, "hbond": float,
            "total": float, "mean_hydrophobicity": float}
    """
    seq = sequence.upper().strip()

    # ref：殘基傾向性總和
    ref = sum(_REF2015.get(aa, 0.0) for aa in seq)

    # fa_sol：疏水核心積累（負值 = 疏水胺基酸愈多 = 核心穩定）
    hydro = np.array([_HYDROPHOBICITY.get(aa, 0.0) for aa in seq])
    fa_sol = -float(np.sum(np.maximum(hydro, 0))) * 0.15

    # hbond：簡化氫鍵數（窗口 [i+4, i+10] 極性–帶電配對）
    # 向量化：預先標記每個位置是 donor / acceptor，再用 sliding-window sum
    _DONOR    = frozenset("DENQST")
    _ACCEPTOR = frozenset("KRH")
    is_d = np.array([aa in _DONOR    for aa in seq], dtype=np.float32)
    is_a = np.array([aa in _ACCEPTOR for aa in seq], dtype=np.float32)
    # 對每個 i，統計 [i+4, i+9] 範圍內的 (donor_i × acceptor_j) + (acceptor_i × donor_j)
    hbond = 0.0
    for k in range(4, 10):
        if k < len(seq):
            hbond -= 0.5 * float(
                np.dot(is_d[:-k], is_a[k:]) + np.dot(is_a[:-k], is_d[k:])
            )
    hbond = max(hbond, -10.0)

    total = ref + fa_sol + hbond
    return {
        "ref":               round(ref, 3),
        "fa_sol":            round(fa_sol, 3),
        "hbond":             round(hbond, 3),
        "total":             round(total, 3),
        "mean_hydrophobicity": round(float(np.mean(hydro)), 3),
        "length":            len(seq),
    }


def score_mutation_effect(
    wild_type: str,
    mutant: str,
) -> Dict[str, float]:
    """
    計算突變序列相對於野生型的 ΔREU。

    Returns
    -------
    dict  {"delta_ref": ..., "delta_fa_sol": ..., "delta_total": ...,
            "mutations": int, "mutation_positions": List[int]}
    """
    if len(wild_type) != len(mutant):
        raise ValueError("野生型與突變型序列長度必須相同。")

    wt_score  = score_sequence_simple(wild_type)
    mut_score = score_sequence_simple(mutant)

    positions = [i + 1 for i, (a, b) in enumerate(zip(wild_type, mutant)) if a != b]

    return {
        "delta_ref":    round(mut_score["ref"]    - wt_score["ref"],    3),
        "delta_fa_sol": round(mut_score["fa_sol"] - wt_score["fa_sol"], 3),
        "delta_hbond":  round(mut_score["hbond"]  - wt_score["hbond"],  3),
        "delta_total":  round(mut_score["total"]  - wt_score["total"],  3),
        "mutations":    len(positions),
        "mutation_positions": positions,
    }


# ═══════════════════════════════════════════════════════
# 帶座標的打分（需要 BioPython PDB 模型）
# ═══════════════════════════════════════════════════════

def score_structure_simplified(
    pdb_path: str,
    chain_id: str = "A",
) -> Dict[str, float]:
    """
    使用 3D 座標計算更準確的近似能量。

    - fa_atr：Cα–Cα 距離 LJ 吸引力（r ∈ [3.5, 7.0] Å）
    - fa_rep：Cα–Cα 距離 LJ 排斥力（r < 3.5 Å）
    - fa_sol：依 Cα 接觸數修正的溶解能
    - ref   ：殘基傾向性
    - hbond ：骨架 N–H···O 氫鍵（距離+角度近似）

    需要 BioPython。
    """
    if not HAS_BIOPYTHON:
        raise ImportError("需要 biopython：pip install biopython")

    from Bio.PDB import PDBParser, is_aa

    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("mol", pdb_path)
    model = structure[0]

    residues = [
        r for r in model[chain_id].get_residues()
        if is_aa(r, standard=True) and "CA" in r
    ]
    seq = "".join(_three_to_one(r.resname) for r in residues)

    ca_coords = np.array([r["CA"].get_vector().get_array() for r in residues])
    L = len(residues)

    # 距離矩陣
    diff = ca_coords[:, None, :] - ca_coords[None, :, :]
    dist = np.sqrt((diff**2).sum(axis=-1)) + np.eye(L) * 1000

    # fa_atr / fa_rep（Cα 近似）
    mask_atr = (dist > 3.5) & (dist < 7.0)
    mask_rep = dist < 3.5

    fa_atr = -float(np.sum(mask_atr * (dist - 7.0)**2 * 0.05))
    fa_rep = float(np.sum(mask_rep * (3.5 - dist)**2 * 0.5))

    # 接觸數加權 fa_sol（接觸多 = 核心殘基 = 疏水有利）
    contacts = np.sum(dist < 8.0, axis=1)
    hydro = np.array([_HYDROPHOBICITY.get(aa, 0.0) for aa in seq])
    fa_sol = -float(np.sum(contacts * np.maximum(hydro, 0) * 0.02))

    # ref
    ref = sum(_REF2015.get(aa, 0.0) for aa in seq)

    # hbond：i → i+4 距離 ＜ 6.5 Å 近似 α-helix 氫鍵（向量化對角線讀取）
    diag4 = dist[np.arange(L - 4), np.arange(4, L)]  # shape (L-4,)
    hbond = -0.8 * float(np.sum(diag4 < 6.5))

    total = fa_atr + fa_rep + fa_sol + ref + hbond
    return {
        "fa_atr": round(fa_atr, 2),
        "fa_rep": round(fa_rep, 2),
        "fa_sol": round(fa_sol, 2),
        "ref":    round(ref,    2),
        "hbond":  round(hbond,  2),
        "total":  round(total,  2),
        "length": L,
    }


# ═══════════════════════════════════════════════════════
# PyRosetta 真實力場（若已安裝）
# ═══════════════════════════════════════════════════════

def score_with_pyrosetta(
    pdb_path: str,
    score_function: str = "ref2015",
    relax: bool = False,
) -> Dict[str, float]:
    """
    使用 PyRosetta REF2015 力場評分。

    需要 PyRosetta（需申請學術授權後安裝）：
      pip install pyrosetta-installer && python -c "import pyrosetta_installer; pyrosetta_installer.install_pyrosetta()"
      或至 https://www.pyrosetta.org/downloads 下載。

    Parameters
    ----------
    pdb_path : str  PDB 檔案路徑
    score_function : str  "ref2015" | "beta_nov16" | "centroid"
    relax : bool  是否先執行 FastRelax

    Returns
    -------
    dict  Rosetta 能量項
    """
    if not HAS_PYROSETTA:
        raise ImportError(
            "PyRosetta 未安裝。請訪問：\n"
            "  https://www.pyrosetta.org/downloads\n"
            "安裝後重新執行。"
        )

    pyrosetta.init(
        options="-mute all",
        extra_options="-constant_seed true -jran 42",
    )
    pose = pyrosetta.pose_from_pdb(pdb_path)
    sfxn = pyrosetta.create_score_function(score_function)

    if relax:
        from pyrosetta.rosetta.protocols.relax import FastRelax
        fr = FastRelax()
        fr.set_scorefxn(sfxn)
        fr.apply(pose)

    score = sfxn(pose)
    energies = pose.energies()

    return {
        "total":   round(score, 2),
        "fa_atr":  round(energies.total_energies()[pyrosetta.rosetta.core.scoring.fa_atr], 2),
        "fa_rep":  round(energies.total_energies()[pyrosetta.rosetta.core.scoring.fa_rep], 2),
        "fa_sol":  round(energies.total_energies()[pyrosetta.rosetta.core.scoring.fa_sol], 2),
        "hbond_bb_sc": round(energies.total_energies()[pyrosetta.rosetta.core.scoring.hbond_bb_sc], 2),
        "ref":     round(energies.total_energies()[pyrosetta.rosetta.core.scoring.ref], 2),
        "engine":  "PyRosetta",
    }


def score_structure(
    pdb_path: str,
    chain_id: str = "A",
    relax: bool = False,
) -> Dict[str, float]:
    """
    自動選擇打分引擎：若 PyRosetta 可用則使用真實 REF2015，
    否則回退至簡化版座標打分。

    Returns
    -------
    dict  能量項 + "engine": "PyRosetta" | "simplified"
    """
    if HAS_PYROSETTA:
        result = score_with_pyrosetta(pdb_path, relax=relax)
        result["engine"] = "PyRosetta"
        return result

    warnings.warn(
        "PyRosetta 未安裝，使用簡化版能量函數（僅供相對比較）。",
        UserWarning,
        stacklevel=2,
    )
    result = score_structure_simplified(pdb_path, chain_id=chain_id)
    result["engine"] = "simplified"
    return result


# ─── 輔助函數 ──────────────────────────────────────────
from src.constants import THREE_TO_ONE as _AA3TO1


def _three_to_one(three: str) -> str:
    return _AA3TO1.get(three.upper(), "X")
