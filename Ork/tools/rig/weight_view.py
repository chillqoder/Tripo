"""Visualise vertex-group weights as heat colours and render close-ups.
Run: Blender -b tools/build/orc_rig.blend --python tools/rig/weight_view.py -- "Jaw" prefix "target_x,y,z(orig units)" scale view_dirs...
"""
import bpy, sys, os, numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'render_helpers.py')).read())
argv = sys.argv[sys.argv.index('--')+1:]
bones = argv[0].split('+'); prefix = argv[1]
tgt = Vector([float(v) for v in argv[2].split(',')]) * 3.241
scale = float(argv[3]); views = [tuple(float(c) for c in v.split(',')) for v in argv[4:]]
mesh = bpy.data.objects['Orc']; me = mesh.data
w = np.zeros(len(me.vertices))
names = {vg.index: vg.name for vg in mesh.vertex_groups}
for v in me.vertices:
    for g in v.groups:
        if names[g.group] in bones: w[v.index] += g.weight
w = np.clip(w, 0, 1)
ca = me.color_attributes.new('wt', 'FLOAT_COLOR', 'POINT')
# blue (0) -> cyan -> green -> yellow -> red (1)
def heat(t):
    r = np.clip(1.5 - abs(4*t - 3), 0, 1); g = np.clip(1.5 - abs(4*t - 2), 0, 1); b = np.clip(1.5 - abs(4*t - 1), 0, 1)
    return r, g, b
for i, t in enumerate(w):
    r, g, b = heat(t); ca.data[i].color = (r, g, b, 1)
me.color_attributes.active_color = ca
cam = setup_scene(); sc = bpy.context.scene
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'VERTEX'
for k, d in enumerate(views):
    shoot(cam, f'{prefix}_{k}.png', d, tgt, scale, up=Vector((0,1,0)) if abs(d[2]) > 0.9 else None)
