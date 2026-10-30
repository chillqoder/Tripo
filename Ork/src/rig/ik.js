import * as THREE from 'three';

const { Vector3, Quaternion, Matrix4 } = THREE;

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

/** Orthonormal frame quaternion: X = aim, Z = `bin` made perpendicular to aim, Y = Z x X. */
export function frameQuat(aim, bin, out = new Quaternion()) {
  _x.copy(aim).normalize();
  _z.copy(bin).addScaledVector(_x, -bin.dot(_x));
  if (_z.lengthSq() < 1e-10) {
    _z.set(0, 1, 0).addScaledVector(_x, -_x.y);
    if (_z.lengthSq() < 1e-10) _z.set(0, 0, 1);
  }
  _z.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/**
 * Analytic two-bone solve.  Returns { elbow, target, stretched, normal }.
 *  - `pole`: direction the middle joint should point towards (it is projected perpendicular to the chain)
 *  - the hinge `normal` = pole x chainDir (stable even when the chain is nearly straight)
 */
export function solveTwoBone(S, T, l1, l2, pole) {
  const d = new Vector3().subVectors(T, S);
  const dist = Math.max(d.length(), 1e-6);
  const dir = d.clone().divideScalar(dist);
  const maxR = (l1 + l2) * 0.9995;
  const minR = Math.abs(l1 - l2) + 1e-3;
  const reach = Math.min(Math.max(dist, minR), maxR);
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(dir, -dir.z);
  p.normalize();
  const elbow = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  const target = S.clone().addScaledVector(dir, reach);
  const normal = new Vector3().crossVectors(p, dir).normalize();
  return { elbow, target, stretched: dist > maxR, normal, error: Math.max(0, dist - maxR) };
}

const REF_POLE = {
  arm: new Vector3(0, 0, -1), // rest elbow bend plane: elbow points backwards
  leg: new Vector3(0, 0, 1),  // knee points forwards
};

/**
 * Pose a 3-joint limb (upper, lower, end) so that the end joint reaches `target`.
 * Bone orientations are built from (aim along the bone, hinge normal) both at rest and now, which
 * gives a twist-free, stable result for any pole direction.
 */
export function solveLimb(rig, upper, lower, end, target, pole, kind) {
  const S = rig.worldPos(upper);
  const l1 = rig.restDistance(upper, lower);
  const l2 = rig.restDistance(lower, end);
  const sol = solveTwoBone(S, target, l1, l2, pole);

  const restDirU = new Vector3().subVectors(rig.rest[lower].wp, rig.rest[upper].wp).normalize();
  const restDirL = new Vector3().subVectors(rig.rest[end].wp, rig.rest[lower].wp).normalize();
  const restN = new Vector3().crossVectors(REF_POLE[kind], restDirU).normalize();
  const fRestU = frameQuat(restDirU, restN);
  const fRestL = frameQuat(restDirL, restN);

  const v1 = new Vector3().subVectors(sol.elbow, S).normalize();
  const v2 = new Vector3().subVectors(sol.target, sol.elbow).normalize();
  const dU = frameQuat(v1, sol.normal).multiply(fRestU.invert());
  rig.setWorldDelta(upper, dU);
  const dL = frameQuat(v2, sol.normal).multiply(fRestL.invert());
  rig.setWorldDelta(lower, dL);
  return sol;
}

/**
 * Give the hand an absolute world orientation `handQ`, sharing the forearm-axis twist between the forearm and the
 * wrist so there is no "candy wrapper" at the wrist.  Returns the total twist (rad).
 */
export function orientHandWithTwist(rig, forearm, hand, handQ, share = 0.55) {
  const qf = rig.worldQuat(forearm);
  const rel = qf.clone().invert().multiply(handQ);
  // local bone axis of the forearm (pointing at the hand)
  const axisLocal = rig.rest[hand].wp.clone().sub(rig.rest[forearm].wp).normalize().applyQuaternion(rig.rest[forearm].wqInv);
  const proj = rel.x * axisLocal.x + rel.y * axisLocal.y + rel.z * axisLocal.z;
  let twist = 2 * Math.atan2(proj, rel.w);
  if (twist > Math.PI) twist -= 2 * Math.PI; else if (twist < -Math.PI) twist += 2 * Math.PI;
  const tw = new Quaternion().setFromAxisAngle(axisLocal, twist * share);
  rig.bones[forearm].quaternion.multiply(tw);
  rig.bones[forearm].updateWorldMatrix(false, false);
  rig.setWorldQuaternion(hand, handQ);
  return twist;
}
