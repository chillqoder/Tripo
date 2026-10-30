import * as THREE from 'three';

/** Easing functions for key-to-key segments (value is the eased fraction 0..1). */
export const EASE = {
  lin: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t,
  in3: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snap: (t) => 1 - Math.pow(1 - t, 4),       // very fast attack, slow settle
  hold: (t) => (t < 1 ? 0 : 1),               // stays on the previous value until the key
  overshoot: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

function seg(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return [0, 0, 0];
  if (t >= keys[n - 1][0]) return [n - 1, n - 1, 0];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const u = (t - a[0]) / (b[0] - a[0]);
  return [i, i + 1, EASE[b[2] || 'smooth'](u)];
}

/** keys: [[time, value, easeName?], ...]  -> scalar */
export function sample(keys, t) {
  const [i, j, e] = seg(keys, t);
  return keys[i][1] + (keys[j][1] - keys[i][1]) * e;
}

/** keys values are [x,y,z] arrays -> writes into a Vector3 */
export function sampleVec(keys, t, out) {
  const [i, j, e] = seg(keys, t);
  const a = keys[i][1], b = keys[j][1];
  return out.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
/** keys values are Quaternions -> slerps into `out` */
export function sampleQuat(keys, t, out) {
  const [i, j, e] = seg(keys, t);
  return out.slerpQuaternions(_qa.copy(keys[i][1]), _qb.copy(keys[j][1]), e);
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
