import * as THREE from 'three';
import { createPose, axeQuat, handDelta } from './pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Low-ready axe pose shared by the stance and every action (so they all start and end in exactly this pose):
 * handle pointing diagonally forward and down (30 deg), blade outside the right leg, cutting edge turned down and
 * OUTWARD (away from the body) by rolling the axe -25 deg about its handle.
 */
const _h = V(-0.12, -0.5, 0.86).normalize();
const _e = V(0, -0.9, -0.4);
_e.addScaledVector(_h, -_e.dot(_h)).normalize().applyAxisAngle(_h, THREE.MathUtils.degToRad(-25));
export const LOW_READY = {
  p: [-0.62, 1.05, 0.28],
  h: [-0.12, -0.5, 0.86],
  e: [+_e.x.toFixed(3), +_e.y.toFixed(3), +_e.z.toFixed(3)],
};

/** The default heavy standing pose (no breathing / sway): the base every animation starts from and returns to. */
export function createStancePose() {
  const p = createPose();
  p.pelvis.p.set(0, -0.11, 0);
  p.spine.pitch = 0.14;
  p.neck.pitch = 0.05;
  p.head.pitch = 0.11;
  p.shoulder.R = { up: 0.08, fwd: 0.05 };
  p.shoulder.L = { up: 0.08, fwd: 0.05 };
  // feet slightly wider than the shoulders, left foot ahead, toes turned out
  p.foot.R = { p: V(-0.52, 0, -0.10), yaw: -0.18, pitch: 0 };
  p.foot.L = { p: V(0.52, 0, 0.16), yaw: 0.18, pitch: 0 };
  p.knee.R = V(-0.35, 0, 1);
  p.knee.L = V(0.35, 0, 1);

  // right arm: axe in low-ready, hanging beside the leg, handle pointing diagonally forward and down
  p.armR.root.p.set(...LOW_READY.p);
  p.armR.root.q.copy(axeQuat(V(...LOW_READY.e), V(...LOW_READY.h)));
  p.armR.pole.set(-0.5, -0.2, -1);

  // left arm: loosely clenched fist near the side
  p.armL.root.p.set(0.58, 1.07, 0.15);
  p.armL.root.q.copy(handDelta('L', V(0.05, -1, 0.25), V(-1, 0, 0.2)));
  p.armL.pole.set(0.5, -0.2, -1);
  return p;
}
