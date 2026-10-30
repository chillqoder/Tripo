# Right-hand / axe grip inspections

Both inspections were run in the real application (headless Chromium, bright shadow-free lab lighting, camera locked
either to world directions or to the axe frame). Numbers come from `app.runInspection()` / `app.gripMetrics()`
(`src/lab.js`) and are stored in `metrics.json`. The "wrap coverage" is the number of 12 sectors around the handle
that have at least 3 hand vertices touching the handle surface (within +12 mm / −6 mm); "penetration" is the deepest
hand/finger vertex inside the handle cylinder (handle radius 45.6 mm).

## What the first calibration got wrong (and what was changed)
1. A first visual calibration (scale 0.60–0.82, finger curl by eye) looked right in close-ups, but the numerical
   check of the skinned hand mesh showed vertices up to **31 mm inside the handle** (260 vertices) — a visual
   inspection alone would have passed it. The grip (offset, handle direction, finger curl multiplier) was therefore
   searched against the real skinned geometry with the objective "minimum penetration, wrap coverage ≥ 10/12,
   contact ≥ 220 vertices". Result: scale 0.78, penetration ≈ 5 mm, wrap 10/12.
2. A purely "minimum penetration" search just moved the handle out of the fist (coverage 7/12), so the coverage
   term is part of the objective.
3. The stance orientation of the axe was changed after the static inspection: the cutting edge originally faced
   down/backwards; it now faces down and **outward** (axe rolled −25° about its handle), wrist bend 34°.
4. During the dynamic inspection a world-fixed close-up camera made the closed hand look "open" in some frames
   (the finger curl was hidden behind the hand); the cameras were switched to the axe frame and all frames were re-checked.

## Grip inspection #1 — static, stance (`grip1_static_stance.png`)
Six close-ups (0.6 m, fov 28°) of the standing pose, thigh/body clipped away to see the palm side:
1 palm side, 2 back of the hand, 3 front side of the grip, 4 rear side (the blade occludes this view), 5 above/front
(thumb), 6 below/inside (thumb underside).

| Check | Result |
|---|---|
| Handle passes through the centre of the closed palm | yes (views 1, 3, 6) |
| Index, middle, ring, little finger curl around the handle, progressive joint bend | yes; four separate fingers visible in views 1, 2, 6; no finger floating or hyper-extended |
| Thumb opposes the fingers and closes on the handle | yes — lies across the handle from the other side (views 1, 5, 6), not outstretched, not buried |
| Palm and fingers contact the handle | wrap coverage 10/12, 264 contact vertices |
| Intersections | max 5.3 mm, no vertex deeper than 8 mm (handle radius 45.6 mm) |
| Wrist aligned with the forearm | bend 34° (forearm→hand axis), forearm twist 10° |
| Clearance | lowest axe vertex 55.7 cm above the ground; axe head ≥ 6 cm from the legs/torso; edge faces down and outward |

Not clean / noted: the see-through gap between the thumb web and the palm (visible in view 2 of the earlier
calibration) is part of the orc's hand mesh; the finger-handle contact is a firm wrap, not a fully closed ring (the
fingers are short and thick).

## Grip inspection #2 — dynamic (axe-frame cameras)
Images (6 frames each): `grip2_dynamic_raise_edge.png` (t = 0.55, 1.3, 1.95, 2.3, 2.98, 3.66), `grip2_dynamic_raise_palm.png`
(same times, palm/thumb side), `grip2_dynamic_slam_edge.png` (1.5 = rising, 1.82 = apex, 2.07 = middle of the downward swing,
2.28 = **impact frame**, 2.8 = extraction, 3.4 = recovery), `grip2_dynamic_chest_edge.png` (0.4, 0.8, 1.6, 2.6, 3.6, 4.8 =
three strikes and the exit blend), `grip2_dynamic_transitions_edge.png` (raise at 0.1, 0.25, 0.45 = blend in; 4.55, 4.75, 4.95 =
blend out), `idle_breathing_extremes.png` (exhale / inhale at the default and a close camera).

Per-action numbers over every 0.05 s of the action (`metrics.json`):

| | raise | chest | slam |
|---|---|---|---|
| worst hand-mesh penetration in the handle | 8.1 mm | 5.7 mm | 9.1 mm |
| minimum wrap coverage | 8/12 | 10/12 | 8/12 |
| max wrist bend (forearm→hand) | 53° | 39° | 55° (middle of the fast swing) |
| max forearm twist | 156° (overhead hold) | 12° | 133° |
| IK reach error right / left arm | 0 / 0.6 cm | 0 / 0 | 0 / 0 |
| ankle sliding | 0 mm | 0 mm | 0 mm |
| closest axe-to-body distance (sampled vertices) | 3.7 cm | n/a (> 6 cm) | 0.2 cm (pommel stub vs forearm/shoulder in the swing) |
| blade vs rock/ground | – | – | never below the surface; clearance 265 → 121 → 24 → 1 mm → held at ~1 mm during the impact hold |

Findings:
* **Fingers stay wrapped; the hand does not open; the handle stays seated; the axe does not slip or drift** — the
  axe is a child of `Socket_R`, its local transform is identical in every frame (see `axeLocal` in the metrics).
  All frames of the sheets show the same closed grip from the axe-frame side cameras.
* **Idle breathing extremes**: ranges over 60 s — hips 5.2 cm, spine 5.3 cm, head 6.1 cm, right shoulder 14.7 cm, knees
  2.9 / 1.7 cm; jaw opens up to 0.10 rad in growls; feet slide 0 mm.
* **Impact frame**: planned contact point = the lowest blade point at the impact frame; gap to the rock surface 0 mm; the
  `impact` event fires at 2.283 s.
* Issues found and fixed during this inspection: pommel stub grazing the shoulder during the lift of the slam and the
  lowering of the raise (paths moved outward/forward: now 3.7 cm clear in the raise; the slam keeps a ≈ 2 mm graze of the pommel against the
  forearm/shoulder during the fast swing, no pass-through measured); the planted legs over-extending at the pump peaks
  (pelvis rise reduced); the elbow pole changed to cut the wrist bend from 62° to 53°.
* Remaining compromises: forearm twist reaches 156° in the overhead hold (inside the ~180° supination/pronation range but
  large); the wrist bend peaks at 55° for a fraction of a second in the fastest part of the swing.
