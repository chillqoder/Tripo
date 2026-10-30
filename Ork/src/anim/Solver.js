import * as THREE from 'three';
import { solveLimb, orientHandWithTwist } from '../rig/ik.js';
import { applyHand, lerpHand, OPEN_HAND, GRIP_START, LEFT_LOOSE_FIST, LEFT_FIST } from '../rig/grip.js';
import { axeQuat } from './pose.js';

const { Vector3, Quaternion } = THREE;
const SPINE_SPLIT = { Spine: 0.3, Spine1: 0.35, Spine2: 0.35 };
const _e = new THREE.Euler();

/**
 * Turns a Pose (plain parameters) into bone transforms.
 *
 * Ownership of bones (nothing else writes them each frame):
 *   FK  : Hips, Spine*, Neck, Head, Jaw, Shoulder_*  (pelvis offset moves Hips)
 *   IK  : UpperLeg/LowerLeg/Foot  (feet planted in world space)   UpperArm/LowerArm/Hand (hand targets)
 *   FK  : finger and thumb bones (grip / fist poses)
 * The axe is a child of Socket_R, so it is rigidly attached to the hand.
 */
export class Solver {
  constructor(rig, CFG) {
    this.rig = rig;
    this.CFG = CFG;
    this.gripPose = JSON.parse(JSON.stringify(GRIP_START));
    this.debug = { armR: {}, armL: {}, legR: {}, legL: {} };
    this.refreshGrip();
    this.ankleY = rig.rest.Foot_R.wp.y;
  }

  /** Recompute the cached rest-frame grip data after the calibration changed. */
  refreshGrip() {
    const { head, edge, pos } = this.CFG.grip;
    this.Rg = axeQuat(edge, head);
    this.Orest = this.rig.rest.Socket_R.wp.clone().add(pos);
  }

  apply(pose) {
    const r = this.rig;
    r.reset();
    const P = pose;

    // ---- FK: pelvis, spine, neck, head, jaw, shoulders ----
    r.offsetPosition('Hips', P.pelvis.p);
    r.setDeltaEuler('Hips', P.pelvis.pitch, P.pelvis.yaw, P.pelvis.roll);
    for (const [bone, w] of Object.entries(SPINE_SPLIT)) {
      const extra = bone === 'Spine2' ? P.chest : { pitch: 0, yaw: 0, roll: 0 };
      r.setDeltaEuler(bone, P.spine.pitch * w + extra.pitch, P.spine.yaw * w + extra.yaw, P.spine.roll * w + extra.roll);
    }
    r.setDeltaEuler('Neck', P.neck.pitch, P.neck.yaw, P.neck.roll);
    r.setDeltaEuler('Head', P.head.pitch, P.head.yaw, P.head.roll);
    r.setDeltaEuler('Jaw', P.jaw, 0, 0);
    for (const side of ['R', 'L']) {
      const s = side === 'R' ? 1 : -1;
      r.setDeltaEuler('Shoulder_' + side, 0, s * P.shoulder[side].fwd, -s * P.shoulder[side].up);
    }
    r.updateWorld();

    // ---- legs: planted feet ----
    for (const side of ['R', 'L']) this.solveLeg(side, P.foot[side], P.knee[side]);

    // ---- arms ----
    r.updateWorld();
    const rootYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), P.pelvis.yaw);
    const rootOrigin = new Vector3(P.pelvis.p.x, 0, P.pelvis.p.z);
    const chestPos = r.worldPos('Spine2');
    const chestDelta = r.worldQuat('Spine2').multiply(r.rest.Spine2.wqInv);
    this.frames = { rootYaw, rootOrigin, chestPos, chestDelta };
    this.solveArm('R', P.armR);
    this.solveArm('L', P.armL);

    // ---- fingers ----
    applyHand(r, 'R', lerpHand(OPEN_HAND, this.gripPose, P.gripR));
    applyHand(r, 'L', lerpHand(LEFT_LOOSE_FIST, LEFT_FIST, P.fistL));
    r.setMorph('Breath', P.breath);
    r.updateWorld();
  }

  solveLeg(side, foot, kneePole) {
    const r = this.rig;
    const target = new Vector3(foot.p.x, foot.p.y + this.ankleY, foot.p.z);
    const pole = kneePole.clone();
    const sol = solveLimb(r, 'UpperLeg_' + side, 'LowerLeg_' + side, 'Foot_' + side, target, pole, 'leg');
    _e.set(foot.pitch, foot.yaw, 0, 'YXZ');
    r.setWorldDelta('Foot_' + side, new Quaternion().setFromEuler(_e));
    this.debug['leg' + side] = { stretched: sol.stretched, error: sol.error };
  }

  /** Resolve the blended target of an arm block into a world position + orientation. */
  resolveTarget(arm) {
    const { rootYaw, rootOrigin, chestPos, chestDelta } = this.frames;
    const pr = arm.root.p.clone().applyQuaternion(rootYaw).add(rootOrigin);
    const qr = rootYaw.clone().multiply(arm.root.q);
    const P = pr, Q = qr;
    if (arm.wChest > 0) {
      const pc = arm.chest.p.clone().applyQuaternion(chestDelta).add(chestPos);
      const qc = chestDelta.clone().multiply(arm.chest.q);
      P.lerp(pc, arm.wChest);
      Q.slerp(qc, arm.wChest);
    }
    if (arm.wWorld > 0) {
      P.lerp(arm.world.p, arm.wWorld);
      Q.slerp(arm.world.q, arm.wWorld);
    }
    return { P, Q };
  }

  solveArm(side, arm) {
    const r = this.rig;
    const { P, Q } = this.resolveTarget(arm);
    let d, restOff;
    if (side === 'R') {
      d = Q.clone().multiply(this.Rg.clone().invert());       // axe orientation -> hand delta
      restOff = this.Orest.clone().sub(r.rest.Hand_R.wp);       // wrist -> grip centre at rest
    } else {
      d = Q.clone();                                          // left target is a hand delta directly
      restOff = r.rest.Socket_L.wp.clone().sub(r.rest.Hand_L.wp);
    }
    const pole = arm.pole.clone().applyQuaternion(this.frames.rootYaw);
    const U = 'UpperArm_' + side, L = 'LowerArm_' + side, H = 'Hand_' + side;
    let wrist = P.clone().sub(restOff.clone().applyQuaternion(d));
    let sol = solveLimb(r, U, L, H, wrist, pole, 'arm');
    if (arm.handMode > 0) {
      // hand continues the forearm: take the forearm's world delta, roll it about the arm axis, blend with the target
      const dL = r.worldQuat(L).multiply(r.rest[L].wqInv);
      const axis = new Vector3(side === 'R' ? -1 : 1, 0, 0);
      const dF = dL.multiply(new Quaternion().setFromAxisAngle(axis, arm.roll));
      d = d.slerp(dF, arm.handMode);
      wrist = P.clone().sub(restOff.clone().applyQuaternion(d));
      sol = solveLimb(r, U, L, H, wrist, pole, 'arm');
    }
    const handQ = d.clone().multiply(r.rest[H].wq);
    const twist = orientHandWithTwist(r, L, H, handQ, arm.twist);
    // wrist bend (angle between forearm and hand axes) for diagnostics
    const fa = r.worldPos(H).sub(r.worldPos(L)).normalize();
    const ha = r.worldPos('Middle1_' + side).sub(r.worldPos(H)).normalize();
    this.debug['arm' + side] = {
      stretched: sol.stretched, error: sol.error, twistDeg: THREE.MathUtils.radToDeg(twist),
      wristBendDeg: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fa.dot(ha), -1, 1))),
      grip: P.toArray().map((v) => +v.toFixed(3)),
    };
  }
}
