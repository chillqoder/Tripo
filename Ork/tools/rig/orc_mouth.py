"""Mouth preparation for jaw animation.

The Tripo mesh has a *painted* mouth line and no mouth cavity.  To let the jaw genuinely open we

  1. cut a real slit along the lip line (between the lower tusks) with bmesh.bisect_plane + split_edges,
  2. build a separate "OrcMouth" mesh: a dark mouth cavity (upper + lower wall, closed at the back and
     sides) and a tongue, with a vertex-colour gradient so the throat falls into darkness,
  3. weight the lower face / lower cavity to the Jaw bone, everything else to the Head.

All numeric constants are in ORIGINAL Tripo units (orc height 0.7405) and multiplied by the scale S.
"""
import bmesh
import bpy
import numpy as np
from mathutils import Vector

ZC = 0.665          # painted lip-line height (measured from the baseColor texture)
XMAX = 0.0105       # half-width of the slit (stays inside the lower tusks)
JAW_HINGE = (0.0, -0.022, 0.677)
FRONT = (-0.079, 0.665)   # (y, z) of the lips at the centre line
CAVITY_DEPTH = 0.030


def cut_slit(mesh_ob, S):
    """Cut the lip slit in place.  Returns dict(side=array[nV] (+1 upper, -1 lower, 0 none), corner=bool[nV],
    poly=Nx3 array (orig units) of the slit polyline sorted by x)."""
    me = mesh_ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    zc, xmax = ZC * S, XMAX * S
    sel = []
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.x) < xmax + 0.012 * S and c.y < -0.060 * S and abs(c.z - zc) < 0.010 * S:
            sel.append(f)
    geom = set(sel)
    for f in sel:
        geom.update(f.edges)
        geom.update(f.verts)
    res = bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-7 * S, plane_co=(0, 0, zc), plane_no=(0, 0, 1))
    cut = [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMEdge)]
    inside = [e for e in cut if all(abs(v.co.x) <= xmax and abs(v.co.z - zc) < 1e-5 * S for v in e.verts)]
    bmesh.ops.split_edges(bm, edges=inside)
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()

    side = np.zeros(len(bm.verts), dtype=np.int8)
    corner = np.zeros(len(bm.verts), dtype=bool)
    slit_verts = set()
    for e in bm.edges:
        if e.is_boundary and all(abs(v.co.x) <= xmax + 1e-6 and abs(v.co.z - zc) < 1e-5 * S for v in e.verts):
            slit_verts.update(e.verts)
    for v in slit_verts:
        zs = [f.calc_center_median().z for f in v.link_faces]
        if not zs:
            continue
        up = [z > zc for z in zs]
        if all(up):
            side[v.index] = 1
        elif not any(up):
            side[v.index] = -1
        else:
            corner[v.index] = True
    poly = sorted({(round(v.co.x, 7), round(v.co.y, 7), round(v.co.z, 7)) for v in slit_verts if side[v.index] >= 0 or corner[v.index]})
    poly = np.array(poly) / S
    poly = poly[np.argsort(poly[:, 0])]
    bm.to_mesh(me)
    bm.free()
    me.update()
    return dict(side=side, corner=corner, poly=poly, n_cut=len(inside))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def jaw_weights(P, S, info, ivory):
    """Per-vertex jaw weight J in [0,1] for the (post-cut) orig vertex positions P (metres)."""
    p = P / S
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    hy, hz = JAW_HINGE[1], JAW_HINGE[2]
    fy, fz = FRONT
    k = (hz - fz) / (hy - fy)
    zplane = np.where(y < hy, fz + k * (y - fy), hz)
    s = zplane - z                                   # >0 below the mouth plane
    ax = np.abs(x)
    w = 0.0035 + 0.45 * np.maximum(0.0, ax - XMAX)   # transition band widens past the slit ends
    J = smoothstep(-w, w, s)
    # throat / under-chin: fade the jaw out behind the chin towards the neck
    throat = smoothstep(-0.062, -0.034, y) * (1 - smoothstep(0.618, 0.642, z))
    J = J * (1 - throat)
    # behind the hinge nothing belongs to the jaw
    J = J * (1 - smoothstep(hy - 0.004, hy + 0.016, y))
    # far lateral skin (outer cheek/ears) stays with the skull
    J = J * (1 - smoothstep(0.036, 0.050, ax))
    region = (z > 0.600) & (z < 0.72) & (ax < 0.06) & (y < 0.02)
    J = np.where(region, J, 0.0)
    # lower tusks ride the jaw rigidly, plus a soft collar of skin around them
    seed = ivory & region & (z < 0.686) & (y < -0.058) & (ax > 0.009) & (ax < 0.028)
    if seed.any():
        T = p[seed]
        idx = np.nonzero(region & (z > 0.650))[0]
        q = p[idx]
        d = np.full(len(idx), 1e9)
        for c in range(0, len(T), 64):
            d = np.minimum(d, np.sqrt(((q[:, None, :] - T[None, c:c + 64, :]) ** 2).sum(2)).min(1))
        collar = 1 - smoothstep(0.0048, 0.0170, d)
        J[idx] = np.maximum(J[idx], collar)
        J[idx[d < 0.0048]] = 1.0
    # explicit slit lips: upper lip rides the skull, lower lip the jaw, ends share
    side, corner = info["side"], info["corner"]
    n = min(len(side), len(J))
    cfac = smoothstep(XMAX, XMAX - 0.004, ax)
    up = side[:n] == 1
    lo = side[:n] == -1
    J[:n][up] = 0.5 - 0.5 * cfac[:n][up]
    J[:n][lo] = 0.5 + 0.5 * cfac[:n][lo]
    J[:n][corner[:n]] = 0.5
    return np.clip(J, 0, 1)


def build_mouth_object(info, S, arm_ob, deform_bones):
    """Create the OrcMouth mesh (cavity + tongue) with vertex colours and vertex groups."""
    poly = info["poly"]                      # orig units
    R = 6
    n = len(poly)
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    grp = {}      # vertex -> (head_w, jaw_w)

    def depth_t(j):
        return j / R

    def color_at(t):
        a = np.array([0.34, 0.06, 0.07]); b = np.array([0.025, 0.002, 0.006])
        c = a * (1 - t) + b * t
        return (float(c[0]), float(c[1]), float(c[2]), 1.0)

    top = [[None] * n for _ in range(R + 1)]
    bot = [[None] * n for _ in range(R + 1)]
    for j in range(R + 1):
        t = depth_t(j)
        for i, (px, py, pz) in enumerate(poly):
            y = py + CAVITY_DEPTH * t
            xx = px * (1 - 0.35 * t)
            ztop = pz + 0.0055 * t ** 0.8
            zbot = pz - 0.0075 * t ** 0.8
            vt = bm.verts.new(Vector((xx, y, ztop)) * S)
            vb = bm.verts.new(Vector((xx, y, zbot)) * S)
            top[j][i], bot[j][i] = vt, vb
            grp[vt] = (1.0, 0.0)
            jw = 1.0 - 0.45 * t
            grp[vb] = (1.0 - jw, jw)
    faces = []
    for j in range(R):
        for i in range(n - 1):
            faces.append((top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i], j))
            faces.append((bot[j][i + 1], bot[j][i], bot[j + 1][i], bot[j + 1][i + 1], j))
    for i in range(n - 1):                    # back wall
        faces.append((top[R][i], bot[R][i], bot[R][i + 1], top[R][i + 1], R))
    for j in range(R):                        # side walls
        faces.append((top[j][0], top[j + 1][0], bot[j + 1][0], bot[j][0], j))
        faces.append((top[j][n - 1], bot[j][n - 1], bot[j + 1][n - 1], top[j + 1][n - 1], j))
    for a, b, c, d, j in faces:
        try:
            f = bm.faces.new((a, b, c, d))
        except ValueError:
            continue
        for lp in f.loops:
            lp[col] = color_at(min(1.0, (j + 0.5) / R))
    # tongue: flattened ellipsoid resting on the lower wall
    tongue_geo = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
    tverts = tongue_geo["verts"]
    for v in tverts:
        v.co = Vector((v.co.x * 0.0085, v.co.y * 0.016 - 0.052, v.co.z * 0.0036 + 0.6585)) * S
        grp[v] = (0.0, 1.0)
    for f in bm.faces:
        if all(v in tverts for v in f.verts):
            for lp in f.loops:
                lp[col] = (0.62, 0.16, 0.20, 1.0)
    bm.normal_update()

    me = bpy.data.meshes.new("OrcMouthMesh")
    bm.verts.index_update()
    vidx = {v: v.index for v in bm.verts}
    weights = [(vidx[v], hw, jw) for v, (hw, jw) in grp.items()]
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("OrcMouth", me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new("OrcMouthInterior")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.45
    mat.use_backface_culling = False
    me.materials.append(mat)
    vg_head = ob.vertex_groups.new(name="Head")
    vg_jaw = ob.vertex_groups.new(name="Jaw")
    for vi, hw, jw in weights:
        if hw > 1e-4:
            vg_head.add([vi], hw, "REPLACE")
        if jw > 1e-4:
            vg_jaw.add([vi], jw, "REPLACE")
    ob.parent = arm_ob
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_ob
    return ob
