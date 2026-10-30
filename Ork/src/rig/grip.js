import * as THREE from 'three';

const DEG = Math.PI / 180;
const _q = new THREE.Quaternion();
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_Y = new THREE.Vector3(0, 1, 0);

export const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

/**
 * Hand poses are plain data (degrees):
 *   fingers[name] = [MCP, PIP, DIP] curl
 *   thumb = [[flex, sweep], [flex, sweep], [flex, sweep]]   for Thumb1 (CMC), Thumb2 (MCP), Thumb3 (IP)
 * Curl rotates about the model +Z axis (right hand: positive curls the finger down towards the palm);
 * `sweep` rotates about model +Y (negative sweeps the thumb across the palm).  The left hand is the
 * mirror image: every angle flips sign.
 */
export const OPEN_HAND = {
  fingers: { Index: [0, 0, 0], Middle: [0, 0, 0], Ring: [0, 0, 0], Pinky: [0, 0, 0] },
  thumb: [[0, 0], [0, 0], [0, 0]],
};

export function cloneHand(p) {
  return { fingers: Object.fromEntries(Object.entries(p.fingers).map(([k, v]) => [k, v.slice()])), thumb: p.thumb.map((a) => a.slice()) };
}

export function lerpHand(a, b, t, out = cloneHand(a)) {
  for (const f of FINGERS) for (let i = 0; i < 3; i++) out.fingers[f][i] = a.fingers[f][i] + (b.fingers[f][i] - a.fingers[f][i]) * t;
  for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) out.thumb[j][k] = a.thumb[j][k] + (b.thumb[j][k] - a.thumb[j][k]) * t;
  return out;
}

/** Apply a hand pose to the skeleton.  `side` = 'R' | 'L'. */
export function applyHand(rig, side, pose) {
  const s = side === 'R' ? 1 : -1;
  for (const f of FINGERS) {
    for (let k = 0; k < 3; k++) {
      const bone = `${f}${k + 1}_${side}`;
      if (!rig.has(bone)) continue;
      rig.setDelta(bone, _q.setFromAxisAngle(AX_Z, s * pose.fingers[f][k] * DEG));
    }
  }
  for (let j = 0; j < 3; j++) {
    const bone = `Thumb${j + 1}_${side}`;
    if (!rig.has(bone)) continue;
    const [flex, sweep] = pose.thumb[j];
    const qa = new THREE.Quaternion().setFromAxisAngle(AX_Z, s * flex * DEG);
    const qb = new THREE.Quaternion().setFromAxisAngle(AX_Y, s * sweep * DEG);
    rig.setDelta(bone, qb.multiply(qa));
  }
}

/** Starting point for the axe grip; refined during the static grip inspection. */
export const GRIP_START = {
  fingers: { Index: [24.5, 33.2, 20.2], Middle: [26, 34.6, 20.2], Ring: [27.4, 36.1, 20.2], Pinky: [28.9, 37.5, 20.2] },
  thumb: [[30, -65], [45, -20], [50, 0]],
};

/** Loosely clenched left hand (relaxed fist). */
export const LEFT_LOOSE_FIST = {
  fingers: { Index: [45, 60, 35], Middle: [50, 65, 38], Ring: [55, 68, 40], Pinky: [58, 70, 40] },
  thumb: [[8, -22], [20, -5], [20, 0]],
};

/** Tight fist (chest beating). */
export const LEFT_FIST = {
  fingers: { Index: [80, 100, 65], Middle: [82, 102, 65], Ring: [85, 102, 65], Pinky: [85, 100, 65] },
  thumb: [[15, -40], [35, -15], [30, 0]],
};
