import * as THREE from 'three';
import { copyPose, axeQuat } from '../pose.js';
import { sample, sampleVec, sampleQuat, smoothstep } from '../curves.js';
import { axeTrack, applyAxe } from './helpers.js';
import { LOW_READY } from '../stance.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * ACTION 3 - OVERHEAD AXE GROUND SLAM (4.6 s)
 *   0.0-0.8   brace: knees bend, weight shifts, axe draws back
 *   0.8-1.8   axe goes above and slightly behind the head, torso extends and winds up, left arm balances
 *   1.8-2.28  hips and torso drive the swing; the spine folds forward, knees flex, the axe accelerates along an arc
 *   2.28      IMPACT: the cutting edge meets the rock exactly (contact computed from the blade's world-space
 *             geometry and the rock surface), brief hold with a strong reaction in arms / shoulders / spine / hips / knees
 *   2.4-3.4   pull the axe free, torso rises, knees straighten, axe returns to low-ready
 *   3.4-4.6   settle into heavy breathing
 */
const T = 4.6;
export const T_HIT = 2.28;

// ---- body tracks (additive over the stance) ----
const PELVIS_Y = [[0, 0], [0.75, -0.13, 'out'], [1.5, -0.04, 'smooth'], [1.82, 0.0, 'smooth'], [2.05, -0.24, 'in'], [T_HIT, -0.40, 'out'], [2.42, -0.40, 'smooth'], [2.62, -0.34, 'smooth'], [3.2, -0.16, 'smooth'], [3.9, -0.02, 'smooth'], [4.6, 0]];
const PELVIS_Z = [[0, 0], [0.75, 0.04, 'smooth'], [1.82, -0.10, 'smooth'], [2.05, 0.18, 'in'], [T_HIT, 0.36, 'out'], [2.42, 0.36, 'smooth'], [3.2, 0.12, 'smooth'], [4.0, 0, 'smooth'], [4.6, 0]];
const PELVIS_X = [[0, 0], [0.75, -0.05, 'smooth'], [1.82, 0.03, 'smooth'], [T_HIT, -0.06, 'smooth'], [3.4, -0.02, 'smooth'], [4.2, 0]];
const PELVIS_PITCH = [[0, 0], [1.82, -0.05, 'smooth'], [2.05, 0.12, 'in'], [T_HIT, 0.30, 'out'], [2.42, 0.30, 'smooth'], [3.3, 0.10, 'smooth'], [4.1, 0, 'smooth']];
const SPINE_PITCH = [[0, 0], [0.75, 0.10, 'out'], [1.5, -0.28, 'smooth'], [1.82, -0.34, 'smooth'], [2.05, 0.45, 'in3'], [T_HIT, 0.78, 'out'], [2.42, 0.80, 'smooth'], [2.7, 0.70, 'smooth'], [3.3, 0.30, 'smooth'], [4.0, 0.03, 'smooth'], [4.6, 0]];
const SPINE_YAW = [[0, 0], [0.75, -0.05, 'smooth'], [1.82, -0.22, 'smooth'], [T_HIT, 0.10, 'in'], [2.5, 0.12, 'smooth'], [3.4, 0.03, 'smooth'], [4.2, 0]];
const SPINE_ROLL = [[0, 0], [1.82, 0.05, 'smooth'], [T_HIT, -0.06, 'in'], [3.4, 0, 'smooth']];
const CHEST_PITCH = [[0, 0], [1.82, -0.10, 'smooth'], [2.05, 0.05, 'in'], [T_HIT, 0.10, 'out'], [3.3, 0, 'smooth']];
const HEAD_PITCH = [[0, 0], [0.75, 0.05, 'smooth'], [1.82, -0.18, 'smooth'], [2.05, -0.55, 'smooth'], [T_HIT, -0.95, 'out'], [2.7, -0.85, 'smooth'], [3.4, -0.25, 'smooth'], [4.2, 0, 'smooth']];
const NECK_PITCH = [[0, 0], [2.05, -0.20, 'smooth'], [T_HIT, -0.30, 'smooth'], [3.4, -0.08, 'smooth'], [4.2, 0]];
const JAW = [[0, 0], [1.9, 0, 'smooth'], [2.0, 0.55, 'snap'], [T_HIT - 0.02, 0.50, 'smooth'], [T_HIT + 0.12, 0.22, 'smooth'], [2.7, 0.08, 'smooth'], [3.2, 0.10, 'smooth'], [3.8, 0, 'smooth']];
const BREATH = [[0, 0], [1.2, 0.5, 'smooth'], [1.82, 2.2, 'out'], [T_HIT, 1.0, 'smooth'], [2.7, 0.4, 'smooth'], [3.3, 1.6, 'smooth'], [4.0, 0.3, 'smooth'], [4.6, 0]];
const SH_R_UP = [[0, 0], [1.5, 0.35, 'smooth'], [1.82, 0.40, 'smooth'], [T_HIT, -0.10, 'in'], [2.5, 0.0, 'smooth'], [3.3, 0.08, 'smooth'], [4.2, 0]];
const SH_R_FWD = [[0, 0], [1.82, 0.0, 'smooth'], [T_HIT, 0.35, 'in'], [3.4, 0.10, 'smooth'], [4.2, 0]];
const SH_L_UP = [[0, 0], [1.82, 0.20, 'smooth'], [T_HIT, 0.10, 'smooth'], [3.4, 0.05, 'smooth'], [4.2, 0]];
const FIST_L = [[0, 0], [1.2, 0.2, 'smooth'], [1.8, 0.9, 'smooth'], [3.4, 0.9, 'smooth'], [4.0, 0.12, 'smooth']];
const L_ARM = [
  [0.0, [0.58, 1.07, 0.15]], [0.75, [0.66, 0.98, 0.05], 'smooth'], [1.82, [0.95, 1.45, -0.10], 'out'],
  [2.05, [0.85, 1.10, 0.45], 'in'], [T_HIT, [0.68, 0.72, 0.62], 'out'], [2.8, [0.66, 0.85, 0.55], 'smooth'], [3.6, [0.60, 1.0, 0.22], 'smooth'], [4.2, [0.58, 1.07, 0.15], 'smooth'],
];
// elbow pole (where the right elbow points) - chosen with a scan for the least wrist bend at the impact
const POLE_R = [[0, [-0.5, -0.2, -1.0]], [0.75, [-0.6, -0.3, -0.6], 'smooth'], [1.5, [-0.8, -0.4, -0.2], 'smooth'], [1.82, [-0.8, -0.2, -0.2], 'smooth'],
  [2.07, [-0.3, 0.3, -0.5], 'smooth'], [T_HIT, [0.0, 0.5, -0.5], 'smooth'], [2.5, [0.0, 0.5, -0.5], 'smooth'], [3.1, [-0.4, 0.0, -0.7], 'smooth'], [3.6, [-0.5, -0.2, -1.0], 'smooth'], [T, [-0.5, -0.2, -1.0]]];
const W_WORLD = [[0, 0], [1.98, 0, 'smooth'], [T_HIT - 0.12, 0.55, 'smooth'], [T_HIT, 1, 'smooth'], [2.46, 1, 'smooth'], [2.62, 0.9, 'smooth'], [3.2, 0, 'inOut'], [T, 0]];

// ---- impact placement ----
export const E_HIT = V(0.04, -0.866, 0.45).normalize();   // cutting edge faces the rock (a touch forward so the blade bites)
export const H_HIT = V(-0.10, 0.5, 0.866).normalize();  // handle forward and 30deg up: found by scanning for a neutral wrist (11deg bend)
export const AIM = V(-0.34, 0, 1.70);        // x/z of the intended strike on the rock

/**
 * Compute the grip pose at which the lowest point of the blade's cutting edge touches the surface at AIM.
 * ctx.rock: { surfaceAt(x,z) }, ctx.axe: { edge: Float32Array local points, scale }.
 */
export function computeImpact(ctx) {
  const { rock, axe } = ctx;
  const Q = axeQuat(E_HIT, H_HIT);
  const s = axe.scale;
  const pts = axe.edge;
  const w = new THREE.Vector3();
  // lowest edge point for this orientation (relative to the grip centre)
  let low = null, lowY = Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    w.set(pts[i], pts[i + 1], pts[i + 2]).multiplyScalar(s).applyQuaternion(Q);
    if (w.y < lowY) { lowY = w.y; low = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]); }
  }
  const lowRel = low.clone().multiplyScalar(s).applyQuaternion(Q);
  const G = new THREE.Vector3(AIM.x - lowRel.x, 3, AIM.z - lowRel.z);
  // drop G vertically until the first edge point touches the rock / ground
  let minGap = Infinity, contact = null, normal = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i += 3) {
    w.set(pts[i], pts[i + 1], pts[i + 2]).multiplyScalar(s).applyQuaternion(Q).add(G);
    const hit = rock.surfaceAt(w.x, w.z);
    const ys = hit ? Math.max(hit.point.y, 0) : 0;
    const gap = w.y - ys;
    if (gap < minGap) { minGap = gap; contact = w.clone(); if (hit) normal.copy(hit.normal); else normal.set(0, 1, 0); contact.y = ys; }
  }
  G.y -= minGap;
  return { G, Q, contact, normal, lowLocal: low };
}

const ROOT_FRAME = { x: 0, z: 0 };

export const slamAction = {
  name: 'slam',
  tune: { E_HIT, H_HIT, AIM },
  label: 'Ground Slam',
  duration: T,
  events: [
    { t: 0.55, name: 'grunt', kind: 'brace' },
    { t: 1.0, name: 'whoosh', kind: 'lift', speed: 0.6 },
    { t: 1.55, name: 'inhaleSharp' },
    { t: 1.96, name: 'roar', kind: 'kiai', jaw: 0.5 },
    { t: 1.94, name: 'whoosh', kind: 'swing', speed: 1.0 },      // the sample peaks 0.3 s in -> loudest just before the contact
    { t: T_HIT, name: 'impact' },
    { t: 2.72, name: 'extract' },
    { t: 3.1, name: 'exhale', kind: 'big' },
    { t: 3.25, name: 'whoosh', kind: 'lower', speed: 0.45 },
  ],
  begin(ctx) {
    if (!ctx.rock || !ctx.axe) return;
    if (!ctx.slam || ctx.slam.dirty) {
      const imp = computeImpact(ctx);
      ctx.slam = { ...imp, dirty: false };
    }
    const { G, Q } = ctx.slam;
    // root-space equivalent of the impact pose (pelvis translation at impact)
    const px = sample(PELVIS_X, T_HIT), pz = sample(PELVIS_Z, T_HIT);
    const rootHit = [G.x - px, G.y, G.z - pz];
    const h = V(0, 1, 0).applyQuaternion(Q), e = V(1, 0, 0).applyQuaternion(Q);
    const hv = [h.x, h.y, h.z], ev = [e.x, e.y, e.z];
    this.track = axeTrack([
      [0.00, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e],
      [0.75, [-0.62, 0.98, 0.10], [-0.14, -0.56, 0.80], LOW_READY.e, 'smooth'],
      [1.10, [-0.84, 1.46, 0.30], [-0.28, 0.15, 0.95], [0.0, -1.0, 0.10], 'smooth'],   // heave out and forward, clear of the shoulder
      [1.50, [-0.62, 2.22, -0.04], [-0.10, 0.80, -0.55], [0.0, 0.60, 0.80], 'inOut'],
      [1.82, [-0.55, 2.34, -0.20], [-0.10, 0.70, -0.70], [0.0, 0.72, 0.68], 'smooth'],
      [2.07, [-0.66, 1.80, 0.62], [-0.10, 0.55, 0.83], [0.0, -0.40, 0.55], 'in'],
      [T_HIT, rootHit, hv, ev, 'out'],
      [2.42, rootHit, hv, ev, 'smooth'],
      [2.80, [-0.62, 1.15, 0.85], [-0.12, 0.10, 0.99], [0.0, -0.95, 0.30], 'smooth'],   // pulled free
      [3.40, [-0.64, 1.02, 0.34], [-0.12, -0.46, 0.88], LOW_READY.e, 'inOut'],
      [3.90, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e, 'out'],
      [T, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e, 'smooth'],
    ]);
    this.worldReady = true;
  },
  eval(t, pose, stance, ctx) {
    copyPose(stance, pose);
    if (!this.track) this.begin(ctx);
    if (this.track) applyAxe(this.track, t, pose.armR);
    sampleVec(POLE_R, t, pose.armR.pole);
    if (ctx.slam) {
      pose.armR.world.p.copy(ctx.slam.G);
      pose.armR.world.q.copy(ctx.slam.Q);
      pose.armR.wWorld = sample(W_WORLD, t);
    }
    pose.pelvis.p.x += sample(PELVIS_X, t);
    pose.pelvis.p.y += sample(PELVIS_Y, t);
    pose.pelvis.p.z += sample(PELVIS_Z, t);
    pose.pelvis.pitch += sample(PELVIS_PITCH, t);
    pose.spine.pitch += sample(SPINE_PITCH, t);
    pose.spine.yaw += sample(SPINE_YAW, t);
    pose.spine.roll += sample(SPINE_ROLL, t);
    pose.chest.pitch += sample(CHEST_PITCH, t);
    pose.head.pitch += sample(HEAD_PITCH, t);
    pose.neck.pitch += sample(NECK_PITCH, t);
    pose.jaw = sample(JAW, t);
    pose.breath = sample(BREATH, t);
    pose.shoulder.R.up += sample(SH_R_UP, t);
    pose.shoulder.R.fwd += sample(SH_R_FWD, t);
    pose.shoulder.L.up += sample(SH_L_UP, t);
    pose.fistL = sample(FIST_L, t);
    sampleVec(L_ARM, t, pose.armL.root.p);
    pose.armL.pole.set(0.6, -0.3, -0.3);
    // reaction jolt through arms / shoulders at the instant of impact
    const k = t - T_HIT;
    if (k > 0) {
      const jolt = Math.exp(-k / 0.16) * Math.sin(Math.min(1, k / 0.04) * Math.PI * 0.5);
      pose.shoulder.R.up += 0.12 * jolt;
      pose.shoulder.L.up += 0.10 * jolt;
      pose.spine.pitch -= 0.06 * jolt;
      pose.head.pitch += 0.10 * jolt;
      pose.pelvis.p.y -= 0.025 * jolt;
    }
    return pose;
  },
};
