"""Add a small, deterministic skin to the supplied static T-pose. No dependencies.

Keeps all source positions, normals, UVs, triangles and embedded texture bytes.
The new GLB is standard glTF 2.0, so GLTFLoader supplies a real SkinnedMesh.
"""
import json
import math
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
OUT.mkdir(parents=True, exist_ok=True)


def read_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + size])
    binary_size = struct.unpack_from('<I', data, 20 + size)[0]
    return doc, bytearray(data[28 + size:28 + size + binary_size])


def smooth(a, b, value):
    t = max(0, min(1, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


doc, binary = read_glb(ROOT / 'purple+wizard+3d+model.glb')
source_position = doc['accessors'][0]
view = doc['bufferViews'][source_position['bufferView']]
offset = view.get('byteOffset', 0) + source_position.get('byteOffset', 0)
positions = list(struct.iter_unpack('<3f', binary[offset:offset + view['byteLength']]))

# Names, parent indices, and absolute rest coordinates in the ORIGINAL GLB frame.
bones = [
    ('root', None, (0, 0, 0)),
    ('hips', 0, (0, .27, 0)),
    ('spine', 1, (0, .45, 0)),
    ('chest', 2, (0, .59, 0)),
    ('head', 3, (0, .665, .015)),
    ('staffShoulder', 3, (.12, .615, 0)),
    ('staffElbow', 5, (.28, .623, 0)),
    ('staffWrist', 6, (.408, .634, .012)),
    ('staffFingers', 7, (.447, .638, .022)),
    ('staffFingertips', 8, (.472, .638, .022)),
    ('freeShoulder', 3, (-.12, .615, 0)),
    ('freeElbow', 10, (-.28, .623, 0)),
    ('freeWrist', 11, (-.408, .634, .012)),
    ('freeFingers', 12, (-.447, .638, .022)),
    ('freeFingertips', 13, (-.472, .638, .022)),
]
# The source hand has three fingers spread along Z, with the palm facing -Y.
# Give each finger its own knuckles; the thumb must oppose them, not share a curl.
for name, z in [('Little', -.023), ('Middle', .001), ('Index', .026)]:
    base = len(bones)
    bones.extend([
        (f'staff{name}', 7, (.442, .639, z)),
        (f'staff{name}Middle', base, (.459, .637, z)),
        (f'staff{name}Tip', base + 1, (.475, .635, z)),
    ])
bones.extend([
    ('staffThumb', 7, (.412, .630, .039)),
    ('staffThumbTip', 24, (.417, .620, .058)),
    ('jaw', 4, (0, .714, .055)),
])
joint_data, weight_data = bytearray(), bytearray()
for x, y, z in positions:
    ax = abs(x)
    weights = {}
    if ax > .112 and y > .49:
        # Broad smooth transitions around sleeve joints; never cut the mesh.
        base = 5 if x > 0 else 10
        regions = [(.112, .18, 3, base), (.235, .32, base, base + 1),
                   (.375, .408 if x > 0 else .425, base + 1, base + 2),
                   (.437, .458, base + 2, base + 3),
                   (.465, .483, base + 3, base + 4)]
        for a, b, j0, j1 in regions:
            if ax <= b:
                t = smooth(a, b, ax)
                weights = {j0: 1 - t, j1: t}
                break
        else:
            weights = {base + 4: 1}
    else:
        regions = [(.20, .34, 0, 1), (.34, .49, 1, 2),
                   (.50, .59, 2, 3), (.64, .68, 3, 4)]
        for a, b, j0, j1 in regions:
            if y <= b:
                t = smooth(a, b, y)
                weights = {j0: 1 - t, j1: t}
                break
        else:
            weights = {4: 1}
    if x > .39 and y > .60:
        # Keep the thumb web continuous with the palm. Distal finger gaps in the
        # supplied topology lie at Z=-.011 and Z=.0135.
        if x > .425:
            base = 15 if z < -.011 else 18 if z < .0135 else 21
            regions = [(.433, .448, 7, base), (.452, .466, base, base + 1),
                       (.468, .482, base + 1, base + 2)]
            for a, b, j0, j1 in regions:
                if x <= b:
                    t = smooth(a, b, x)
                    weights = {j0: 1 - t, j1: t}
                    break
            else:
                weights = {base + 2: 1}
        thumb = smooth(.032, .052, z) * (1 - smooth(.426, .443, x)) * smooth(.398, .412, x)
        if thumb > 0:
            tip = smooth(.054, .072, z)
            weights = {joint: weight * (1 - thumb) for joint, weight in weights.items()}
            weights[24] = thumb * (1 - tip)
            weights[25] = thumb * tip
    # Lower lip and the central chin follow a small jaw hinge. The nose, upper
    # moustache, cheeks, eyes, and hood keep their original head weights.
    jaw = (smooth(.648, .675, y) * (1 - smooth(.710, .719, y))
           * (1 - smooth(.020, .052, ax)) * smooth(.065, .090, z))
    if jaw > 0:
        weights = {joint: weight * (1 - jaw) for joint, weight in weights.items()}
        weights[26] = jaw
    pairs = [(j, w) for j, w in weights.items() if w > 0]
    pairs += [(0, 0)] * (4 - len(pairs))
    joint_data += struct.pack('<4H', *(j for j, w in pairs))
    weight_data += struct.pack('<4f', *(w for j, w in pairs))


def append_accessor(data, component, count, kind, target=None):
    binary.extend(b'\0' * ((-len(binary)) % 4))
    v = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
    if target:
        v['target'] = target
    vi = len(doc['bufferViews'])
    doc['bufferViews'].append(v)
    binary.extend(data)
    ai = len(doc['accessors'])
    doc['accessors'].append({'bufferView': vi, 'componentType': component,
                             'count': count, 'type': kind})
    return ai


attrs = doc['meshes'][0]['primitives'][0]['attributes']
attrs['JOINTS_0'] = append_accessor(joint_data, 5123, len(positions), 'VEC4', 34962)
attrs['WEIGHTS_0'] = append_accessor(weight_data, 5126, len(positions), 'VEC4', 34962)
node_start = len(doc['nodes'])
inverse = bytearray()
for i, (name, parent, pos) in enumerate(bones):
    parent_pos = bones[parent][2] if parent is not None else (0, 0, 0)
    node = {'name': name, 'translation': [pos[k] - parent_pos[k] for k in range(3)]}
    children = [node_start + j for j, b in enumerate(bones) if b[1] == i]
    if children:
        node['children'] = children
    doc['nodes'].append(node)
    inverse += struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
                           -pos[0], -pos[1], -pos[2], 1)
ibm = append_accessor(inverse, 5126, len(bones), 'MAT4')
doc['nodes'][0].pop('translation', None)
doc['nodes'][0]['skin'] = 0
doc['nodes'][0]['name'] = 'Wizard_original_mesh'
doc['skins'] = [{'name': 'Mage_minimal_skin', 'joints': list(range(node_start, node_start + len(bones))),
                 'skeleton': node_start, 'inverseBindMatrices': ibm}]
doc['scenes'][0]['nodes'].append(node_start)
doc['buffers'][0]['byteLength'] = len(binary)
doc['asset']['generator'] = 'Mage deterministic skin preparation (original geometry + texture preserved)'
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
binary.extend(b'\0' * ((-len(binary)) % 4))
result = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
result += struct.pack('<II', len(binary), 0x004E4942) + binary
(OUT / 'wizard-rigged.glb').write_bytes(result)
shutil.copyfile(ROOT / 'magic+wand+3d+model.glb', OUT / 'staff.glb')

report = {
    'wizard': {'source': 'purple+wizard+3d+model.glb', 'sourceNodes': 1, 'sourceMeshes': 1,
               'sourceSkins': 0, 'sourceAnimations': 0, 'vertices': len(positions),
               'sourceMin': source_position['min'], 'sourceMax': source_position['max'],
               'forward': '+Z', 'up': '+Y', 'restPose': 'T pose',
               'preparedBones': [{'name': n, 'parent': p, 'restPosition': v} for n, p, v in bones],
               'grippingHand': '+X hand (anatomical left), selected from inspected palm geometry',
               'limitation': 'Spatially weighted minimal skin; articulated gripping fingers, opposing thumb and a subtle speech-driven jaw. No full facial rig; best for controlled small elbow bends.'},
    'staff': {'source': 'magic+wand+3d+model.glb', 'sourceNodes': 1, 'sourceMeshes': 1,
              'sourceSkins': 0, 'sourceAnimations': 0, 'vertices': 55109,
              'sourceMin': [-.311216235, 0, -.135936528], 'sourceMax': [.311216235, .980764806, .135936528],
              'note': 'Source leans toward -X. Straighten before measuring its full height.'}
}
(ROOT / 'asset-inspection.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Prepared {OUT / "wizard-rigged.glb"}: {len(bones)} bones, {len(positions)} weighted vertices')
