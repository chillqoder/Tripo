# Living Aquarium

A Three.js (r170) aquarium built around the 15 supplied GLB models in `public/models/`.

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:5180
npm run build && npm run preview   # production build on http://127.0.0.1:5181
npm test             # motion, collision and bubble-ripple regression checks
```

Controls: drag to orbit, wheel/pinch to zoom, right-drag/two-finger drag to pan. The buttons in the
bottom-right corner pause/resume the simulation (also `Space`) and reset the view (also `R`).

Derived assets are already committed in `public/models/derived/`. To regenerate them from the
originals:

```bash
npm run prepare-assets   # tools/prepare-assets.mjs
npm run inspect-assets   # tools/inspect-assets.mjs -> structure audit (tools/asset-audit.txt)
npm run analyze-assets   # geometry measurements -> tools/asset-analysis.txt
```

`tools/preview/` is the temporary neutral per-asset preview used during inspection
(`/tools/preview/index.html?file=<name>`); it isn't part of the aquarium.

## Source-to-scene mapping

All 15 files are single merged textured meshes (one primitive and one material each). None has a
skin, morph targets, animation clips, cameras, lights or a floor plane.

| File | Role in the scene | Notes |
| --- | --- | --- |
| `guppy+fish+3d+model.glb` | Guppy | head −X, 1.15 units long |
| `orange+clownfish+3d+model.glb` | Clownfish | head −X, 1.4 long |
| `freshwater+angelfish+3d+model.glb` | Freshwater angelfish | head −X, 1.95 tall incl. filaments |
| `betta+fish+3d+model.glb` | Betta | the brief lists `bettafish+3d+model.glb`; the supplied file is `betta+fish…` |
| `crab+3d+model.glb` | Crab | faces +Z, legs along ±X, 1.15 across |
| `snail+3d+model.glb` | Bottom snail | amber-brown shell, flat sole |
| `snail+3d+model 2.glb` | Front-glass snail | cream/olive striped shell, sole on a ~38° incline |
| `grass+plant+3d+model.glb` | Vallisneria | long ribbon leaves |
| `green+leafy+plant+3d+model.glb` | Anubias | broad thick oval leaves on a rhizome |
| `green+plant+3d+model.glb` | Java fern | lance-shaped wavy fronds |
| `aquatic+plant+3d+model.glb` | Cabomba | fine feathery branching foliage |
| `medieval+castle+3d+model.glb` | Castle ornament | arch is a real through-opening (see limitations) |
| `sponge+air+filter+3d+model.glb` | Sponge filter / aerator | elbow outlet toward (−X,+Z) |
| `stone+rocks+3d+model.glb` | **Small pebble set** → `derived/pebble-{0,1,2}.glb` | tan, red, dark grey |
| `stone+rock+3d+model.glb` | **Large rock set** → `derived/rock-{0,1,2}.glb` | dark tall rock and two tan rocks |

The original stone collections are never rendered. Their presence is only checked at load time.

## Prepared assets (`tools/prepare-assets.mjs`)

* **Stone separation.** Vertices are welded by quantised position, so UV seams don't split a stone.
  Triangles are grouped into connected components, and the components are k-means clustered into
  the three real stones by centroid. Pebbles had exactly 3 components; the rocks had 5 fragments,
  which clustered into 3. Each stone keeps its original vertices, UVs, normals and material. It is
  recentred on X/Z with its lowest point at y = 0. Pebbles are simplified to ~180 triangles because
  they are instanced 1,504 times. Rocks are simplified to 12k triangles. See
  `derived/stones.json` for sizes and source centroids.
* **Render proxies** (`derived/lod/*.glb`). These are meshopt-simplified copies of the 13 animated
  or decorative models with their textures stripped. They are drawn only in the shadow pass and the
  refraction-capture pass, and they share the original's material and deformation uniforms. The
  main camera always renders the full-resolution supplied mesh.

## Systems (src/)

| Module | Purpose |
| --- | --- |
| `config/assets.js`, `config/scene.js` | Manifest, URL building (literal `+`, `%20` for the space), per-asset normalisation, attachment points, masks; tank size and layout |
| `core/loader.js` | GLTFLoader with byte progress; failures are listed by path in the loading overlay |
| `core/clock.js` | Single simulation clock; delta clamped, resynchronised after hidden tabs; pause freezes everything |
| `world/surface.js` | Shared CPU/GPU water height; calm surface, pooled bubble ripples and meniscus; analytic ripple normals |
| `world/substrate.js` | Sand heightfield with skirts (visible thickness), instanced pebbles, smoothed bed-height/normal query |
| `world/decor.js`, `world/obstacles.js` | Castle, plants, aerator, airline hose, rocks; SDF collision proxies (boxes, cylinders, ellipsoids, capsules) |
| `world/current.js`, `bubbles.js`, `particles.js` | Shared current field; pooled bubbles that recycle at the animated surface and spawn ripples; suspended particles |
| `render/optics.js` | Refraction capture (layer-filtered, depth + HDR colour), refracting water surface, bubble shading |
| `render/materials.js` | Composable shader patches; absorption/haze along the in-water path; baked animated caustics |
| `anim/fishRig.js`, `ai/fishSchool.js` | Fish masks derived from geometry plus GPU deformation; steering, predictive avoidance, iterative safety solver |
| `anim/crab.js` | Limb segmentation, generated skeleton and skin weights, 2-bone IK, sideways gait |
| `anim/snails.js`, `anim/plants.js` | Snail head, tentacle and sole motion with surface contact; species-specific foliage bending |

### Notes on the rigs

* **Fish.** For every (x, y) cell the mesh's distance from the mid-plane classifies it as thick body
  or thin fin sheet. The body core is then propagated along the fish from its thickest section. From
  this the code derives per-vertex masks for dorsal/anal/pelvic fins, the caudal fin (from the
  measured peduncle) and the pectoral fins (lateral protrusions). Deformation is computed on the GPU
  every frame from the immutable rest positions: body wave, turning curvature, delayed fin waves,
  pectoral sculling and trailing filaments. Normals are corrected, and the same deformation runs in
  the depth/shadow materials. `?masks` in the URL shows the masks (R fin, G caudal, B pectoral).
* **Crab.** Removing the carapace core leaves each limb as a separate connected component. Each limb
  gets hip and knee bones with smooth weights. Walking legs are driven by 2-bone IK toward world-space
  foot targets on the bed. Two alternating leg groups step only when a foot lags its home position,
  and the body speed is limited by leg reach. Facing (+Z) is independent of the sideways travel
  (±X). The claws make small idle movements and an exploratory gesture during pauses.
* **Castle.** Navigation uses three solid blocks measured from the castle's height profile.

## Motion and water

Fish prefer clear routes ahead of them and make broad turns with bounded angular acceleration.
Heading drives forward motion; collision corrections cannot rotate a fish. Environmental avoidance
uses one worst clearance per look-ahead sample, independent of how many collision spheres cover a
fish. Neighbours predict silhouette gaps and slow down to pass. The full silhouette is centred on
its bounding box, including the betta's large fins, to keep its navigation bounds balanced.

The surface stays calm between bubble arrivals. A bubble pops when its expanding radius touches
the surface, starting a small circular wave that expands and fades over 3.8 seconds. The CPU height
and GPU height share the same parameters. Optical normals use analytic ripple slopes once per
pixel, and refraction is relative to the flat surface so undisturbed water stays stable. Depth and
screen-edge fades prevent discontinuous sample changes near the frame.

Plants have small, slow sways with periods of 20–36 seconds, very little leaf flutter, and a limited
current response smoothed over several seconds. Their roots remain fixed.

## Verification performed

`npm test` loads the supplied fish geometry and decorative collision proxies without rendering.
The regression checks cover:

* Calm water, circular expanding bubble waves, no distant disturbance, and ripple expiration.
* Identical avoidance when a fish's collision spheres are duplicated.
* 90 seconds at both 60 fps and 12 fps, using the simulation's 1/120-second substeps: minimum fish
  clearance 0.08 units, no environment penetration, bounded turn speed and angular acceleration,
  pitch under 0.18 radians, and sustained travel for every fish.

Chromium checks use `window.__aqua.selfTest(seconds, frameDt)` with the complete aquarium.
A 90-second run at 60 fps followed by 60 seconds at 12 fps retained a minimum fish gap of
0.0799 units, no environment penetration, no crab stance-foot slip and no glass-snail plane error.
Default and aerator views were inspected at 1400×900, plus portrait at 390×844. A diagnostic
render of the water normals confirmed that ripple distortion stays around the bubble arrivals.
Pause keeps simulation time and fish positions unchanged. All water shaders compiled successfully,
and the development console had no errors or warnings. `npm run build` succeeds; Vite reports the
existing large-bundle advisory.

Real touch hardware and a real-time five-minute visual watch were not tested.

## Known limitations of the supplied geometry

* **Crab.** The generated mesh is asymmetric. The right side has 4 separable walking legs; on the
  left, the front legs are fused, so it yields 3 walking-leg components. Each component is
  articulated as one limb. A rear carapace flap separates as its own component and stays rigid with
  the body.
* **Castle arch.** It is a genuine opening, about 0.34 × 0.54 units after scaling. The smallest fish
  (guppy) is about 0.68 tall including fins, so no animal fits and the castle is solid for
  navigation.
* **Aerator.** The model has no separate air nipple. A small dark connector was added on top of the
  elbow, on the side away from the outlet, so the hose never blocks the bubble outlet.
* **Fish.** All fish are single merged meshes. Fins are separated by geometric masks, not by mesh
  parts, so the fin/body boundary is a smooth weight ramp.
* **Frame rate.** It falls short of 60 fps at large window sizes because the supplied models are
  80–120k triangles each. Adaptive quality lowers the refraction-capture resolution first, then the
  pixel ratio.
