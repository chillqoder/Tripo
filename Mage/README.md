# Mage — A little magic, adrift.

A complete local Three.js scene built from the two supplied GLBs: a purple wizard, a crystal staff, a procedural floating rock, and three five-second elemental spells. No external services are needed at runtime. Fonts are included locally.

## Run

Use Node **20.19+ or 22.12+**.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Click Lightning, Fire, or Water, or press **1**, **2**, or **3**. Each cast lasts **4.98 seconds**. Controls unlock after recovery. Mouse, keyboard, and touch work. Drag to rotate the view; use the mouse wheel or a two-finger pinch to zoom. Each spell has a distinct locally synthesized magic sound and a short spoken invocation.

```sh
npm test           # state lifecycle, asset preservation, skin and planted-foot checks
npm run build     # production output in dist/
npm run preview   # preview the production build
```

## The actual animation approach

Both source GLBs contain **one static textured mesh**, with no skeletons, skin weights, separate arms, or animation clips. The wizard faces +Z, is Y-up, and has a T pose. Its original bounds are approximately **0.978 × 0.833 × 0.292** source units. The staff is tilted in its source file and measures approximately **1.161** units high after straightening.

`scripts/prepare_assets.py` adds a **27-bone skeleton and blended skin weights** to the existing wizard geometry. Positions, normals, UVs, indices, embedded texture bytes, and material definitions are preserved. This produces the included `public/assets/wizard-rigged.glb`; the staff is copied unchanged as `public/assets/staff.glb`. No Blender installation or asset conversion is needed to run the project. To regenerate the prepared files, use Python 3 and `npm run prepare:assets`.

Procedural bone poses animate the chest, head, shoulders, elbows, wrists, three independently curled gripping fingers, an opposing thumb, and a subtle speech-driven jaw. The lower robe and both boots remain rooted; only the shared island moves. The +X hand (the wizard's anatomical left) was selected from the inspected palm geometry. Its wrist carries a hand attachment, an adjustable grip pivot, and the entire staff. An emission marker on the original crystal follows that hierarchy. The wizard is 3 scene units tall and the staff is **3.195 units**, or **106.5%** of the wizard's height, with uniform model scaling.

**Asset limitations:** this is a purpose-built minimal skin, with spatially blended sleeve weights and articulated gripping fingers. It supports the included restrained choreography. Facial movement is limited to the speaking jaw; it has no full facial rig or retopology; extreme elbow bends or unrelated full-body animation would need a more detailed artist-authored rig. The source hand is posed into a closed grip; its three fingers, thumb, and staff share the wrist hierarchy throughout casting.

Inspection details and rest bone coordinates are recorded in `asset-inspection.json`.

## Organization and tuning

- `src/config.js`: measured scale ratios, original-space grip and tip coordinates, camera, rendering limits, and timeline.
- `src/character.js`: GLTFLoader, skeleton poses, staff attachment, and crystal light.
- `src/scene.js`: irregular rock, sparse twinkling stars, soft studio lighting and shadows, orbit/zoom controls, camera framing, and restrained bloom.
- `src/spell-state.js`: IDLE → PREPARE → CAST → FADE → RECOVER → IDLE; wall-clock timing rejects stacked casts and catches up after inactive tabs.
- `src/audio.js`: reusable elemental sound buffers, spoken invocations, and speech levels for mouth movement.
- `src/effects.js`: reusable lightning buffers, rocky meteor cores and flame trails, translucent moving water ribbons, rain, droplets, and rock splashes.
- `src/ui.js` / `src/style.css`: exactly three accessible circular buttons, cooldown rings, loading/error feedback, and responsive layout.

All spell effects reach zero at **4.4 s**, before the arm starts lowering. GPU geometries and materials are allocated once and reused. Rendering caps the pixel ratio at 1.6; the camera fits the raised staff and full island at portrait and landscape sizes. Three.js and all addons come from the same pinned npm package.

Optional browser verification, with `@playwright/cli` installed and the dev server on port 5173:

```sh
mkdir -p output/playwright
playwright-cli -s=mage open http://127.0.0.1:5173
playwright-cli -s=mage run-code --filename=tests/browser-check.js
```

Fonts: Cormorant Garamond and DM Sans, under the included SIL Open Font Licenses. The original GLBs are retained at the project root; their usage rights remain those of the supplied assets.
