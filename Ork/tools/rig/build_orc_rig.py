"""Build a skinned, animation-ready orc GLB from the supplied unrigged mesh.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/rig/build_orc_rig.py

Pipeline
  1. import the original GLB, scale it to real-world metres (ORC_HEIGHT_M tall)
  2. cut a real slit along the painted lip line (orc_mouth.cut_slit)
  3. build the armature from orc_skeleton.py
  4. weld a throw-away copy of the mesh (the Tripo mesh is a triangle soup split at UV seams) and
     run Blender's heat-diffusion automatic weights on that copy (Jaw bone excluded)
  5. transfer weights back to the original (UV-split) mesh by position, then refine
     (analytic jaw weights, 4-influence limit)
  6. build the mouth-cavity mesh, add the "Breath" morph target
  7. export public/assets/models/orc_rigged.glb  (+ tools/build/orc_rig.blend for inspection)
"""
import bpy, bmesh, os, sys, json, time
import numpy as np
from mathutils import Vector, Matrix, kdtree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import orc_skeleton
import orc_weights
import orc_mouth
import texture_sampling

SRC = os.path.join(ROOT, "fantasy+orc+3d+model.glb")
BUILD = os.path.join(ROOT, "tools", "build")
OUT = os.path.join(ROOT, "public", "assets", "models", "orc_rigged.glb")
os.makedirs(BUILD, exist_ok=True)
ORC_HEIGHT_M = 2.4

t0 = time.time()
def log(*a):
    print("[rig %.1fs]" % (time.time() - t0), *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh_ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
mesh_ob.name = "Orc"
mesh_ob.data.name = "OrcMesh"
mesh_ob.parent = None
bpy.context.view_layer.objects.active = mesh_ob
mesh_ob.select_set(True)

# ---- 1. normalise scale ---------------------------------------------------------------------
H0 = max(v.co.z for v in mesh_ob.data.vertices)
S = ORC_HEIGHT_M / H0
mesh_ob.scale = (S, S, S)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
log("orc scaled by %.4f (height %.3f -> %.3f m)" % (S, H0, ORC_HEIGHT_M))

# ---- 2. lip slit ----------------------------------------------------------------------------
mouth_info = orc_mouth.cut_slit(mesh_ob, S)
log("lip slit cut: %d edges, %d upper / %d lower / %d corner verts, polyline %d pts"
    % (mouth_info["n_cut"], (mouth_info["side"] == 1).sum(), (mouth_info["side"] == -1).sum(),
       mouth_info["corner"].sum(), len(mouth_info["poly"])))
colors, _ = texture_sampling.vertex_colors(mesh_ob)
mx, mn = colors.max(1), colors.min(1)
ivory = (mx > 0.55) & ((mx - mn) / (mx + 1e-6) < 0.35)

# ---- 3. armature ----------------------------------------------------------------------------
spec, order = orc_skeleton.build_spec()
arm_data = bpy.data.armatures.new("OrcArmature")
arm_ob = bpy.data.objects.new("OrcRig", arm_data)
bpy.context.scene.collection.objects.link(arm_ob)
bpy.context.view_layer.objects.active = arm_ob
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for name in order:
    b = spec[name]
    e = eb.new(name)
    e.head = Vector(b["head"]) * S
    e.tail = Vector(b["tail"]) * S
    e.use_deform = b["deform"]
for name in order:
    b = spec[name]
    if b["parent"]:
        eb[name].parent = eb[b["parent"]]
        eb[name].use_connect = b["connect"]
bpy.ops.object.mode_set(mode="OBJECT")
log("armature built:", len(order), "bones,", sum(1 for n in order if spec[n]["deform"]), "deforming")

# ---- 4. automatic weights on a welded copy (jaw excluded; it is weighted analytically) -------
weld = mesh_ob.copy()
weld.data = mesh_ob.data.copy()
weld.name = "OrcWeld"
bpy.context.scene.collection.objects.link(weld)
bm = bmesh.new()
bm.from_mesh(weld.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * S)
bm.to_mesh(weld.data)
bm.free()
log("welded copy:", len(mesh_ob.data.vertices), "->", len(weld.data.vertices), "verts")

arm_data.bones["Jaw"].use_deform = False
bpy.ops.object.select_all(action="DESELECT")
weld.select_set(True)
arm_ob.select_set(True)
bpy.context.view_layer.objects.active = arm_ob
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
arm_data.bones["Jaw"].use_deform = True
log("auto weights done")

deform_bones = [n for n in order if spec[n]["deform"]]
bone_index = {n: i for i, n in enumerate(deform_bones)}
vg_names = {vg.index: vg.name for vg in weld.vertex_groups}
nW = len(weld.data.vertices)
W_weld = np.zeros((nW, len(deform_bones)), dtype=np.float64)
for v in weld.data.vertices:
    for g in v.groups:
        nm = vg_names[g.group]
        if nm in bone_index:
            W_weld[v.index, bone_index[nm]] = g.weight
log("welded verts with no weight after heat solve: %d / %d" % (int((W_weld.sum(1) < 1e-6).sum()), nW))

# ---- 5. transfer to the original (UV-split) mesh -------------------------------------------
kd = kdtree.KDTree(nW)
for v in weld.data.vertices:
    kd.insert(v.co, v.index)
kd.balance()
orig = mesh_ob.data
nV = len(orig.vertices)
map_o2w = np.zeros(nV, dtype=np.int64)
maxd = 0.0
for v in orig.vertices:
    co, idx, d = kd.find(v.co)
    map_o2w[v.index] = idx
    maxd = max(maxd, d)
log("mapped %d verts, max distance %.2e" % (nV, maxd))

P_weld = np.array([tuple(v.co) for v in weld.data.vertices])
P_orig = np.array([tuple(v.co) for v in orig.vertices])
edges = np.array([tuple(e.vertices) for e in weld.data.edges], dtype=np.int64)

ctx = dict(deform_bones=deform_bones, bone_index=bone_index, spec=spec, S=S, edges=edges,
           P_weld=P_weld, P_orig=P_orig, map_o2w=map_o2w, mesh=orig, weld=weld, log=log,
           mouth_info=mouth_info, ivory=ivory)
W_weld = orc_weights.refine_weld_weights(W_weld, ctx)
W = W_weld[map_o2w]
W = orc_weights.refine_orig_weights(W, ctx)

# ---- 6. vertex groups, mouth cavity, breath morph -------------------------------------------
bpy.data.objects.remove(weld, do_unlink=True)
for vg in list(mesh_ob.vertex_groups):
    mesh_ob.vertex_groups.remove(vg)
groups = {n: mesh_ob.vertex_groups.new(name=n) for n in deform_bones}
for bi, n in enumerate(deform_bones):
    idx = np.nonzero(W[:, bi] > 1e-4)[0]
    for vi in idx:
        groups[n].add([int(vi)], float(W[vi, bi]), "REPLACE")
mesh_ob.parent = arm_ob
mod = mesh_ob.modifiers.new("Armature", "ARMATURE")
mod.object = arm_ob
log("vertex groups written")

mouth_ob = orc_mouth.build_mouth_object(mouth_info, S, arm_ob, deform_bones)
log("mouth cavity built:", len(mouth_ob.data.vertices), "verts")

mesh_ob.shape_key_add(name="Basis", from_mix=False)
sk = mesh_ob.shape_key_add(name="Breath", from_mix=False)
disp = orc_weights.breath_displacement(P_orig, S)
for i, d in enumerate(disp):
    sk.data[i].co = Vector(P_orig[i] + d)
log("breath morph target added, max displacement %.4f m" % np.abs(disp).max())

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "orc_rig.blend"))
np.save(os.path.join(BUILD, "orc_weights.npy"), W)
log("saved blend")

if os.environ.get("ORC_EXPORT", "1") == "1":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=False, export_apply=False,
                              export_skins=True, export_animations=False, export_yup=True,
                              export_morph=True, export_extras=True, export_cameras=False, export_lights=False)
    log("exported", OUT, os.path.getsize(OUT) // 1024, "KB")
