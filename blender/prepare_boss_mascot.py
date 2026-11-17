"""Normalize a boss GLB to 2m tall and export with Draco (Blender CLI)."""
import bpy
import sys
from mathutils import Vector

source, destination = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
factor = 2 / (high.z - low.z)
center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
transforms = [(o, o.matrix_world.copy()) for o in meshes]
for obj, matrix in transforms:
    obj.parent = None
    obj.matrix_world = matrix
    obj.location = (obj.location - center) * factor
    obj.scale *= factor
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB', use_selection=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('MASCOT_EXPORT', destination)
