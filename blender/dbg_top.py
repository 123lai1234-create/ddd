"""Report the highest geometry in the built model, per object.

Used to chase silhouette mismatches against the reference profile.
"""

import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "out", "chibi.blend")


def main():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    rows = []
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        mw = ob.matrix_world
        zmax = max((mw @ v.co).z for v in ob.data.vertices)
        xmax = max(abs((mw @ v.co).x) for v in ob.data.vertices)
        rows.append((zmax, xmax, ob.name))
    rows.sort(reverse=True)
    for zmax, xmax, name in rows[:12]:
        print(f"  {name:16s} zmax={zmax:.3f}  |x|max={xmax:.3f}")


if __name__ == "__main__":
    main()
