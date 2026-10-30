// Asset manifest and per-asset normalisation/attachment configuration.
//
// All values below were measured from the actual files (tools/asset-audit.txt,
// tools/asset-analysis.txt, preview renders in tools/preview). Every supplied GLB is a
// single merged, textured mesh (one primitive, one material, no skin, no morph targets,
// no animation clips, no cameras/lights/floor planes).
//
// Model-local conventions found during inspection:
//   fish:   head toward -X, dorsal toward +Y, lateral axis Z, base at y=0
//   crab:   faces +Z (eyes/claws), walking legs extend along +/-X
//   snails: head toward -X; "snail+3d+model.glb" has a flat sole on y=0,
//           "snail+3d+model 2.glb" has its sole on a ~38 deg incline (crawling up a slope)
//   plants/castle/aerator/stones: up +Y, root/base on y=0
//
// Source -> scene role mapping (decided from appearance):
//   grass+plant           -> Vallisneria (long ribbon leaves)
//   green+leafy+plant     -> Anubias (broad thick oval leaves on a rhizome)
//   green+plant           -> Java fern (lance-shaped wavy fronds)
//   aquatic+plant         -> Cabomba (fine feathery branching foliage)
//   snail+3d+model        -> amber-brown snail  -> bottom snail
//   snail+3d+model 2      -> cream/olive striped -> front-glass snail
//   stone+rocks           -> three small smooth pebbles (tan, red, dark grey)
//   stone+rock            -> three large rough rocks (dark tall, two tan)

export const ASSET_BASE = '/models/';

// Vite's static server does not decode %2B, and '+' is a literal character in URL paths,
// so keep plus signs verbatim and percent-encode everything else (the space becomes %20).
export function assetUrl(file, base = ASSET_BASE) {
  return base + file.split('/').map((s) => encodeURIComponent(s).replace(/%2B/g, '+')).join('/');
}

export const MANIFEST = {
  guppy: 'guppy+fish+3d+model.glb',
  clownfish: 'orange+clownfish+3d+model.glb',
  angelfish: 'freshwater+angelfish+3d+model.glb',
  betta: 'betta+fish+3d+model.glb', // the brief lists "bettafish+3d+model.glb"; the supplied file is named betta+fish
  crab: 'crab+3d+model.glb',
  snailBottom: 'snail+3d+model.glb',
  snailGlass: 'snail+3d+model 2.glb',
  vallisneria: 'grass+plant+3d+model.glb',
  anubias: 'green+leafy+plant+3d+model.glb',
  javaFern: 'green+plant+3d+model.glb',
  cabomba: 'aquatic+plant+3d+model.glb',
  castle: 'medieval+castle+3d+model.glb',
  aerator: 'sponge+air+filter+3d+model.glb',
  // derived (tools/prepare-assets.mjs) from stone+rocks+3d+model.glb and stone+rock+3d+model.glb
  pebble0: 'derived/pebble-0.glb',
  pebble1: 'derived/pebble-1.glb',
  pebble2: 'derived/pebble-2.glb',
  rock0: 'derived/rock-0.glb',
  rock1: 'derived/rock-1.glb',
  rock2: 'derived/rock-2.glb',
};

// Reduced-detail proxies for shadow / refraction-capture passes (tools/prepare-assets.mjs)
export const PROXIES = ['guppy', 'clownfish', 'angelfish', 'betta', 'crab', 'snailBottom', 'snailGlass',
  'vallisneria', 'anubias', 'javaFern', 'cabomba', 'castle', 'aerator'];

// Original source files that must exist even though only derived stones are rendered.
export const SOURCE_ONLY = ['stone+rock+3d+model.glb', 'stone+rocks+3d+model.glb'];

// Uniform scale only (no per-axis stretching). `size` is the target length of `axis`.
export const FISH = {
  guppy: {
    file: MANIFEST.guppy, axis: 'x', size: 1.15,
    // anatomical masks in normalised coords: s = 0 nose .. 1 tail tip
    caudalStart: 0.56, pectoral: { s: [0.2, 0.42], minOut: 0.55 },
    swim: { depth: [3.3, 5.7], cruise: 0.6, max: 0.9, turn: 0.85, accel: 0.55, hoverChance: 0.25, tailHz: 2.8, bodyAmp: 0.032, finAmp: 0.36 },
  },
  clownfish: {
    file: MANIFEST.clownfish, axis: 'x', size: 1.4,
    caudalStart: 0.72, pectoral: { s: [0.28, 0.5], minOut: 0.5 },
    swim: { depth: [2.2, 4.8], cruise: 0.5, max: 0.75, turn: 0.65, accel: 0.4, hoverChance: 0.2, tailHz: 2.1, bodyAmp: 0.028, finAmp: 0.26 },
  },
  angelfish: {
    file: MANIFEST.angelfish, axis: 'y', size: 1.95, // total height incl. fins and filaments
    caudalStart: 0.66, pectoral: { s: [0.3, 0.48], minOut: 0.6 }, filaments: true,
    swim: { depth: [2.6, 4.8], cruise: 0.34, max: 0.5, turn: 0.45, accel: 0.26, hoverChance: 0.4, tailHz: 1.3, bodyAmp: 0.022, finAmp: 0.18 },
  },
  betta: {
    file: MANIFEST.betta, axis: 'x', size: 1.75,
    caudalStart: 0.5, pectoral: { s: [0.2, 0.36], minOut: 0.6 }, flowing: true,
    swim: { depth: [3.4, 5.5], cruise: 0.3, max: 0.45, turn: 0.4, accel: 0.22, hoverChance: 0.45, tailHz: 1.2, bodyAmp: 0.025, finAmp: 0.42 },
  },
};

export const CRAB = {
  file: MANIFEST.crab, axis: 'x', size: 1.15,
  // limbs are found by removing the carapace core (ellipse r = |(x, z/0.8)| < coreR) and
  // taking the connected components that remain (tools/asset-analysis notes).
  coreR: 0.3, coreZScale: 0.8,
};

export const SNAILS = {
  bottom: {
    file: MANIFEST.snailBottom, axis: 'x', size: 0.75,
    // sole lies on y=0 for x > -0.05; head/tentacles at x < -0.25
    headX: -0.22, shellMinY: 0.12, shellMinX: -0.12,
  },
  glass: {
    file: MANIFEST.snailGlass, axis: 'x', size: 0.85,
    // sole is a plane through (x=-0.34,y=0.56) and (x=0.39,y=0.0): direction toward head
    // (-0.79, 0.61, 0), sole outward normal (-0.61, -0.79, 0) in model space
    soleDir: [-0.792, 0.611, 0], soleNormal: [-0.611, -0.792, 0], solePoint: [0.39, 0.0, 0],
    headX: -0.25,
  },
};

export const PLANTS = {
  vallisneria: { file: MANIFEST.vallisneria, height: 4.5, kind: 'ribbon', stiffness: 0.35 },
  anubias: { file: MANIFEST.anubias, height: 1.7, kind: 'oval', stiffness: 2.6, rhizomeLift: 0.06 },
  javaFern: { file: MANIFEST.javaFern, height: 2.8, kind: 'lance', stiffness: 1.1 },
  cabomba: { file: MANIFEST.cabomba, height: 4.1, kind: 'feather', stiffness: 0.6 },
};

export const CASTLE = {
  file: MANIFEST.castle, height: 2.65,
  // Arch is a genuine through-opening, measured by ray casting along Z:
  // x in [-0.02, 0.08], y in [0.06, 0.22] (model units) -> ~0.34 x 0.54 world units after
  // scaling. The smallest fish (guppy) is ~0.68 tall incl. fins, so no animal fits:
  // the castle is treated as solid for navigation.
  arch: { x: [-0.02, 0.08], y: [0.06, 0.22] },
  // solid blocks (model units, x ranges and heights from the height profile)
  blocks: [
    { x: [-0.47, -0.1], h: 0.78, z: [-0.2, 0.2] },
    { x: [-0.1, 0.15], h: 0.61, z: [-0.18, 0.18] },
    { x: [0.15, 0.5], h: 0.53, z: [-0.2, 0.2] },
  ],
};

export const AERATOR = {
  file: MANIFEST.aerator, height: 2.3,
  // measured: sponge r=0.283 y 0.2..0.62, lift tube r=0.063 y 0.62..0.9, elbow outlet
  // toward (-x,+z). Outlet centre ~(-0.167, 0.942, 0.112), direction (-0.83, 0, 0.56).
  outlet: [-0.172, 0.942, 0.116], outletDir: [-0.83, 0.0, 0.56],
  // no separate air nipple modelled; a small connector is added on top of the elbow,
  // on the side away from the outlet so it never blocks the water/bubble exit.
  airConnector: [0.035, 0.975, -0.02],
  sponge: { r: 0.29, y: [0.0, 0.64] }, tube: { r: 0.07, y: [0.64, 1.0] },
};

export const STONES = {
  pebbles: [MANIFEST.pebble0, MANIFEST.pebble1, MANIFEST.pebble2],
  pebbleScale: [0.38, 0.52],
  rocks: [
    { file: MANIFEST.rock0, scale: 2.5 }, // tall dark rock
    { file: MANIFEST.rock1, scale: 2.3 },
    { file: MANIFEST.rock2, scale: 2.2 },
  ],
};
