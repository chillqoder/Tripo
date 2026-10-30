"""Per-vertex base-colour sampling from the glTF material's baseColor texture (numpy only)."""
import bpy
import numpy as np


def base_color_image(mesh_ob):
    mat = mesh_ob.data.materials[0]
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            link = n.inputs['Base Color'].links
            if link and link[0].from_node.type == 'TEX_IMAGE':
                return link[0].from_node.image
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'normal' not in n.image.name.lower():
            return n.image
    raise RuntimeError('no base colour image found')


def vertex_colors(mesh_ob):
    img = base_color_image(mesh_ob)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)[:, :, :3]
    me = mesh_ob.data
    uv = me.uv_layers.active.data
    nV = len(me.vertices)
    uvs = np.zeros((nV, 2), dtype=np.float64)
    seen = np.zeros(nV, dtype=bool)
    for loop in me.loops:
        vi = loop.vertex_index
        if not seen[vi]:
            uvs[vi] = uv[loop.index].uv
            seen[vi] = True
    u = np.clip(uvs[:, 0], 0, 1) * (w - 1)
    v = np.clip(uvs[:, 1], 0, 1) * (h - 1)   # Blender image rows start at the bottom, matching glTF-flipped V
    x0 = np.floor(u).astype(int); y0 = np.floor(v).astype(int)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (u - x0)[:, None]; fy = (v - y0)[:, None]
    c = (px[y0, x0] * (1 - fx) * (1 - fy) + px[y0, x1] * fx * (1 - fy) +
         px[y1, x0] * (1 - fx) * fy + px[y1, x1] * fx * fy)
    return c, (w, h)
