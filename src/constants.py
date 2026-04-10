"""
src/constants.py
──────────────────────────────────────────────────────────────────
共用常數：胺基酸相關常量、三字碼對照表等。

多個模組（data_prep, rl_reinforce, protein_mpnn, rosetta_score,
structure_utils）原本各自定義相同的常數，現統一在此處維護。
"""

from __future__ import annotations

# 標準 20 種胺基酸（單字碼，按字母序）
AMINO_ACIDS: list[str] = list("ACDEFGHIKLMNPQRSTVWY")
N_AA: int = len(AMINO_ACIDS)
AA_TO_IDX: dict[str, int] = {aa: i for i, aa in enumerate(AMINO_ACIDS)}

# 三字碼 → 單字碼對照表
THREE_TO_ONE: dict[str, str] = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "VAL": "V", "TRP": "W", "TYR": "Y",
}

# 標準胺基酸字元集合（用於快速成員檢查）
STANDARD_AA: frozenset[str] = frozenset(AMINO_ACIDS)
