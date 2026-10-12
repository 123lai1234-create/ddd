"""Debug script to inspect group splits."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_chibi_mesh import build_chibi

V, F, groups = build_chibi()
print("groups:", [(g["name"], g["offset"], g["count"]) for g in groups])
for g in groups:
    s, e = g["offset"], g["offset"] + g["count"]
    mask = (F[:, 0] >= s) & (F[:, 0] < e)
    n = int(mask.sum())
    print(f"{g['name']:>8} start={s:>4} end={e:>4} faces={n:>5} verts_in_range={s}..{e-1}")
print("global V=", len(V), "global F=", len(F))