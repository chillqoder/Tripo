# Stage 1 / 2 notes — asset inspection, rig and scale

All numbers below were measured with headless Blender 5.2 (scripts in `tools/rig/`) and with a glTF JSON dump.

## `fantasy+orc+3d+model.glb` (Tripo, glTF 2.0)
| Item | Finding |
|---|---|
| Structure | 1 scene node → 1 mesh → 1 primitive, 1 material, **no skin, no skeleton, no animations, no morph targets** |
| Mesh | 65,815 vertices (UV-split) = 46,613 after welding by position, 93,191 triangles, one closed shell + a 16-vertex stray island |
| Pose | T-pose, faces +Z (glTF), the orc's **right** hand is on −X, height 0.7405 units, wingspan 0.997, feet on y=0 |
| Transforms | single node, tiny translation (−0.0004, 0, 0.0004), no rotation/scale |
| Materials | `tripo_mat_…` PBR: normal map (jpg), base colour (jpg 2048²), metallic-roughness (png); double sided |
| Fingers | four fingers + thumb are separate geometry with slits between them (verified in close-up renders); palm is thick; fingers lie palm-down, thumb at +Z |
| Face | eyes and the mouth line are **painted in the texture**; there is no mouth cavity; two lower tusks start at the lip line |
| Armor | shoulder pad, strap, belt, bracers, loincloth, boots are fused into the same shell |

Joint positions were derived from cross-sections of the mesh (arm/leg centre lines, spine profile, finger/thumb
clusters per x-slab, mouth profile; see `tools/rig/orc_skeleton.py`). The painted mouth line was located from the
base-colour texture (dark crease at z ≈ 0.665 units) and the tusks from ivory-coloured vertices.

Because the mesh is unrigged, a rig was created — "the orc is in a T-pose" was not taken as "rigged".

## `medieval+battle+axe+3d+model.glb` (Tripo)
| Item | Finding |
|---|---|
| Structure | 1 node / 1 mesh / 1 material, no skin, no animations |
| Mesh | 61,247 vertices; principal axis 1.255 units long, lying diagonally in the file |
| Parts | S-curved wrapped handle (≈ 0.117 diameter), pointed pommel, bearded single-bit blade with the cutting edge on the outer crescent, spike on the back |
| Normalisation | Y = handle → head, X = cutting edge, origin on the handle axis (35.5 % of the length from the pommel), grip zone straightened: tilt of the fitted axis vs. the principal axis = 7.1° |

## Rig (`tools/rig/build_orc_rig.py`)
* Scaled by 3.241 to **2.40 m**; armature of 69 bones (53 deforming); names: `Hips, Spine, Spine1, Spine2, Neck, Head,
  Jaw, Shoulder_/UpperArm_/LowerArm_/Hand_ (L,R), Thumb1-3 / Index1-3 / Middle1-3 / Ring1-3 / Pinky1-3, UpperLeg_/LowerLeg_/Foot_/Toe_`,
  end bones, and `Socket_R` / `Socket_L`.
* Weights: Blender "automatic weights" (heat diffusion) on a welded copy, 0 vertices left unweighted, mapped back to
  the UV-split mesh (max mapping distance 2.4e-5 m); weights limited to 4 influences. Jaw weights are analytic
  (plane through the mouth line and the jaw hinge, widening transition at the mouth corners, tusks rigid with the jaw).
* Lip slit: `bmesh.bisect_plane` + `split_edges` along z = 0.665 units for |x| ≤ 0.0105 (between the tusks); mouth
  cavity mesh (`OrcMouth`, 268 vertices, vertex-colour gradient, tongue) weighted Head/Jaw.
* `Breath` shape key: smooth chest/belly/upper-back expansion field (max 2.1 cm).
* Verified in Blender before export with test poses (fist, raised arm, bent elbow, spine flexion, leg lift + knee bend,
  open jaw) by rendering the posed mesh from several sides (working renders were not kept); each finger bends separately.

## Scale decisions (Stage 2)
| Quantity | Value |
|---|---|
| Orc | 2.40 m tall, hand ≈ 0.36 m long, fingers ≈ 6.5 cm thick, palm ≈ 0.29 m wide |
| Axe | uniform 0.78 → 0.96 m long, blade ≈ 0.55 m wide, handle ≈ 9.1 cm diameter |
| Grip fit | wrap coverage 10/12, max penetration ≈ 5 mm in the stance (see `docs/inspection/`) |
| Ground clearance in the stance | lowest axe vertex 55.7 cm above the ground; ≥ 6 cm from the body |

Reasoning: the orc's fingers are short and very thick (thickness/length ≈ 0.38, a human is ≈ 0.17), so a fully closed
ring is only possible around a very thin handle. A 0.78 scale (the biggest that still keeps the handle inside the
fist) keeps the weapon large and heavy-looking while remaining a believable one-handed grip.
