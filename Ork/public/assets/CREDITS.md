# Asset credits

## 3D models
* `models/orc_rigged.glb` — derived from the supplied `fantasy+orc+3d+model.glb` (Tripo-generated). Geometry, UVs and
  the three textures are unchanged; added: skeleton/skin weights, a lip slit and a mouth-cavity mesh, a `Breath` morph
  target, uniform scale to 2.4 m (`tools/rig/build_orc_rig.py`).
* `models/axe_prepared.glb` — derived from the supplied `medieval+battle+axe+3d+model.glb` (Tripo-generated).
  Only re-oriented/re-centred (`tools/rig/prep_axe.mjs`); textures unchanged.

## Audio (`audio/`)
All sound effects and the forest ambience are **original and procedurally synthesised** by `tools/audio/synth_audio.py`
(numpy / scipy, fixed seeds) — no third-party recordings or samples are used, so there are no external sources or
licences to attribute. They are released under CC0 / public domain together with this project's code.

| Files | Content |
|---|---|
| `breath_in_*`, `breath_out_*` | heavy breathing |
| `growl_low_*` | low growls |
| `roar_long_*`, `roar_short_*`, `kiai_*`, `grunt_*` | roars, strike shouts, grunts |
| `thump_*` | chest-hit thumps |
| `whoosh_*` | axe whooshes (lift, swing, lower) |
| `axe_impact_*`, `rock_extract.mp3` | axe-on-stone impact, extraction scrape |
| `ambience_forest.wav` | quiet forest bed (wind, leaves, distant birds), gapless loop |

## Software
Three.js (MIT), Vite (MIT), lil-gui (MIT, developer lab only), glTF-Transform (MIT), Blender (GPL, used offline to
build the rig; output files are not Blender code).
