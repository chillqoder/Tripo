import * as THREE from 'three';

const { Vector3, Quaternion } = THREE;

/** Quaternion from three axis-ordered directions of an orthonormal frame (x edge, y head). */
export function axeQuat(edge, head, out = new Quaternion()) {
  const y = head.clone().normalize();
  const x = edge.clone().addScaledVector(y, -edge.dot(y)).normalize();
  const z = new Vector3().crossVectors(x, y).normalize();
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Orthonormal frame quaternion from finger-direction and palm-normal directions (for hands, see HAND_REST). */
export function frameFrom(a, b, out = new Quaternion()) {
  const x = a.clone().normalize();
  const z = b.clone().addScaledVector(x, -b.dot(x)).normalize();
  const y = new Vector3().crossVectors(z, x);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** T-pose rest directions of each hand: fingers along the arm, palm facing down. */
export const HAND_REST = {
  R: { fingers: new Vector3(-1, 0, 0), palm: new Vector3(0, -1, 0) },
  L: { fingers: new Vector3(1, 0, 0), palm: new Vector3(0, -1, 0) },
};

/**
 * Rotation that takes the T-pose hand to a hand whose fingers point along `fingers` and whose palm faces `palm`
 * (world directions).  Used for hand targets expressed as "delta from rest".
 */
export function handDelta(side, fingers, palm, out = new Quaternion()) {
  const rest = frameFrom(HAND_REST[side].fingers, HAND_REST[side].palm);
  return frameFrom(fingers, palm, out).multiply(rest.invert());
}

function armSet(p = [0, 0, 0], q = new Quaternion()) {
  return { p: new Vector3(...p), q: q.clone() };
}

function armBlock() {
  return {
    root: armSet(),     // frame: ground point below the pelvis, yawed with the pelvis
    chest: armSet(),    // frame: Spine2 (position + model-aligned rotation)
    world: armSet(),    // absolute world
    wChest: 0,          // 0..1 blend root -> chest
    wWorld: 0,          // 0..1 blend (that result) -> world
    pole: new Vector3(0, 0, -1),
    twist: 0.8,         // share of forearm twist taken by the forearm (rest goes into the wrist)
    handMode: 0,        // 0 = hand follows the target orientation, 1 = hand continues the forearm (natural fist)
    roll: 0,            // rotation about the forearm axis in follow mode (radians)
  };
}

/** Complete parameter set for one frame of the character. Plain data, so poses can be lerped. */
export function createPose() {
  return {
    pelvis: { p: new Vector3(), pitch: 0, yaw: 0, roll: 0 },
    spine: { pitch: 0, yaw: 0, roll: 0 },
    chest: { pitch: 0, yaw: 0, roll: 0 },
    neck: { pitch: 0, yaw: 0, roll: 0 },
    head: { pitch: 0, yaw: 0, roll: 0 },
    jaw: 0,
    shoulder: { R: { up: 0, fwd: 0 }, L: { up: 0, fwd: 0 } },
    foot: {
      R: { p: new Vector3(-0.5, 0, -0.1), yaw: 0, pitch: 0 },
      L: { p: new Vector3(0.5, 0, 0.14), yaw: 0, pitch: 0 },
    },
    knee: { R: new Vector3(-0.3, 0, 1), L: new Vector3(0.3, 0, 1) },
    armR: armBlock(),
    armL: armBlock(),
    gripR: 1,       // right hand: 1 = gripping the axe
    fistL: 0,       // left hand: 0 = loosely clenched, 1 = tight fist
    breath: 0,
  };
}

export function clonePose(p) {
  return cloneNode(p);
}

function cloneNode(n) {
  if (typeof n === 'number') return n;
  if (n.isVector3 || n.isQuaternion) return n.clone();
  const o = {};
  for (const k in n) o[k] = cloneNode(n[k]);
  return o;
}

/** Recursive lerp of two poses into `out` (numbers lerp, vectors lerp, quaternions slerp). */
export function lerpPose(a, b, t, out) {
  for (const k in a) {
    const av = a[k], bv = b[k];
    if (typeof av === 'number') out[k] = av + (bv - av) * t;
    else if (av.isVector3) out[k].lerpVectors(av, bv, t);
    else if (av.isQuaternion) out[k].slerpQuaternions(av, bv, t);
    else lerpPose(av, bv, t, out[k]);
  }
  return out;
}

export function copyPose(src, dst) {
  for (const k in src) {
    const v = src[k];
    if (typeof v === 'number') dst[k] = v;
    else if (v.isVector3 || v.isQuaternion) dst[k].copy(v);
    else copyPose(v, dst[k]);
  }
  return dst;
}
