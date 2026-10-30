import * as THREE from 'three';
import { copyPose, handDelta } from '../pose.js';
import { sample, sampleVec, smoothstep } from '../curves.js';
import { axeTrack, applyAxe } from './helpers.js';
import { LOW_READY } from '../stance.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * ACTION 2 - BEAT HIS CHEST (5 s)
 * The LEFT fist strikes the upper chest three times.  Every strike = visible wind-up (fist drawn out and back),
 * a fast forward drive, contact, small reaction through chest / spine / shoulders / head, brief recoil.
 * The axe stays low in the right hand; the right arm absorbs the torso reaction.
 */
const T = 5.0;
const ROLL = 0.0;
export const HITS = [1.60, 2.60, 3.60];        // contact times
const PREP = 0.52, RECOIL = 0.30;

// chest-space (rest-aligned axes, origin = Spine2 head) contact point for the fist anchor, and direction of the wind-up
const CONTACT = V(0.36, 0.12, 0.34);
const BACK = V(0.78, 0.30, 0.52).sub(CONTACT);   // full wind-up offset from the contact point (out and back)
const FIST_Q = new THREE.Quaternion();           // unused in follow mode (hand continues the forearm)

// piecewise key track for the draw-back amount (1 = back, 0 = at the chest)
function drawKeys() {
  const k = [[0.0, 1.0], [0.55, 0.9, 'smooth'], [HITS[0] - 0.40, 1.0, 'smooth']];
  HITS.forEach((h, i) => {
    k.push([h - 0.12, 1.0 + 0.0, 'smooth']);          // hold at full draw-back
    k.push([h, 0.0, 'in']);                           // fast drive to contact
    k.push([h + 0.05, -0.02, 'smooth']);              // tiny compress at contact
    k.push([h + RECOIL, 0.40, 'out']);                // recoil off the chest
    if (i < HITS.length - 1) k.push([HITS[i + 1] - 0.14, 1.0, 'smooth']);
  });
  k.push([4.35, 1.0, 'smooth']);
  return k;
}
const DRAW = drawKeys();

const impulse = (t, t0, amp, decay = 0.26) => (t < t0 ? 0 : amp * Math.exp(-(t - t0) / decay) * smoothstep(0, 0.05, t - t0));
const hits = (t, amp, decay) => HITS.reduce((s, h, i) => s + impulse(t, h, typeof amp === 'function' ? amp(i) : amp, decay), 0);

const W_CHEST = [[0, 0], [0.45, 0, 'smooth'], [0.95, 1, 'inOut'], [4.0, 1, 'smooth'], [4.7, 0, 'inOut'], [5.0, 0, 'smooth']];
const FIST = [[0, 0], [0.6, 0.2, 'smooth'], [1.0, 1, 'snap'], [4.0, 1, 'smooth'], [4.6, 0.1, 'smooth']];

const AXE = axeTrack([
  [0.0, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e],
  [0.8, [-0.70, 1.03, 0.30], [-0.14, -0.50, 0.85], LOW_READY.e, 'smooth'],
  [4.2, [-0.70, 1.03, 0.30], [-0.14, -0.50, 0.85], LOW_READY.e, 'smooth'],
  [5.0, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e, 'smooth'],
]);

const JAW_HITS = (t) => HITS.reduce((s, h, i) => s + impulse(t, h - 0.04, i === 2 ? 0.62 : 0.34, i === 2 ? 0.55 : 0.22), 0);

export const chestAction = {
  name: 'chest',
  label: 'Beat Chest',
  duration: T,
  events: [
    { t: 0.9, name: 'grunt', kind: 'prep' },
    ...HITS.map((h, i) => ({ t: h, name: 'chestHit', index: i, strength: [0.8, 0.9, 1.0][i] })),
    ...HITS.map((h, i) => ({ t: h - 0.03, name: i === 2 ? 'roar' : 'grunt', kind: i === 2 ? 'short' : 'hit', jaw: JAW_HITS(h + 0.1) })),
    { t: 4.15, name: 'exhale', kind: 'big' },
  ],
  eval(t, pose, stance) {
    copyPose(stance, pose);
    const d = sample(DRAW, t);
    const wc = sample(W_CHEST, t);
    pose.armL.wChest = wc;
    pose.armL.chest.p.copy(CONTACT).addScaledVector(BACK, Math.max(d, -0.05));
    pose.armL.chest.q.copy(FIST_Q);
    pose.armL.pole.set(0.5, -0.1, -0.2);
    pose.armL.handMode = wc;
    pose.armL.roll = ROLL;
    pose.fistL = sample(FIST, t);
    // right arm: carries the axe low and wide, absorbs the reactions
    applyAxe(AXE, t, pose.armR);
    const imp = hits(t, 1, 0.3);
    pose.armR.root.p.y += 0.035 * imp;
    pose.armR.root.p.x -= 0.02 * imp;
    pose.armR.pole.set(-0.5, -0.2, -1);
    // body reactions
    const react = hits(t, (i) => [0.8, 0.9, 1.1][i], 0.30);
    pose.spine.pitch += -0.07 * react + 0.05 * smoothstep(0.3, 1.0, t) * (1 - smoothstep(3.9, 4.6, t));
    pose.chest.pitch += -0.05 * react;
    pose.chest.roll += 0.04 * react;
    pose.spine.yaw += 0.05 * smoothstep(0.5, 1.2, t) * (1 - smoothstep(3.9, 4.6, t)) - 0.03 * react;
    pose.shoulder.L.up += 0.12 * react + 0.1 * smoothstep(0.4, 1.0, t) * (1 - smoothstep(3.9, 4.6, t));
    pose.shoulder.R.up += 0.06 * react;
    pose.shoulder.L.fwd += 0.2 * smoothstep(0.4, 1.0, t) * (1 - smoothstep(3.9, 4.6, t));
    pose.head.pitch += 0.12 * react - 0.05 * smoothstep(0.6, 1.2, t) * (1 - smoothstep(3.9, 4.6, t));
    pose.neck.pitch += 0.06 * react;
    pose.pelvis.p.y += -0.02 * react - 0.05 * smoothstep(0.4, 1.0, t) * (1 - smoothstep(3.9, 4.6, t));
    pose.knee.L.x += 0;
    pose.breath = 0.6 + 1.6 * react;
    pose.jaw = JAW_HITS(t);
    return pose;
  },
};
