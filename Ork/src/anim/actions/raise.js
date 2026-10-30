import * as THREE from 'three';
import { copyPose } from '../pose.js';
import { sample, sampleVec } from '../curves.js';
import { axeTrack, applyAxe } from './helpers.js';
import { LOW_READY } from '../stance.js';
import { handDelta } from '../pose.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * ACTION 1 - RAISE THE AXE AND ROAR (5 s)
 *   0.0-0.6  brace: knees bend, body drops and winds up
 *   0.6-1.8  torso straightens / arches, shoulder + elbow lift the axe overhead
 *   1.7-2.0  chest expands, head tilts back, jaw opens, the roar starts
 *   2.0-4.0  three emphatic upward pumps with small recoveries (jaw peaks with each)
 *   4.0-5.0  lower the axe, jaw closes, return to the stance / idle
 */
const T = 5.0;

// axe grip centre / head direction / edge direction in the pelvis frame
const AXE = axeTrack([
  [0.00, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e],
  [0.55, [-0.60, 0.98, 0.14], [-0.15, -0.58, 0.80], LOW_READY.e, 'smooth'],       // wind-up: weight back
  [1.05, [-0.80, 1.55, 0.55], [-0.30, 0.10, 0.95], [0.0, -1.0, 0.05], 'in'],            // heave up and out
  [1.55, [-0.58, 2.22, 0.34], [-0.16, 0.93, 0.33], [0.0, 0.3, 1.0], 'out'],             // overhead
  [1.95, [-0.46, 2.42, 0.24], [-0.10, 0.98, -0.10], [0.0, 0.1, 1.0], 'smooth'],         // hold + roar starts
  // pump 1
  [2.30, [-0.45, 2.62, 0.28], [-0.10, 0.98, -0.02], [0.0, 0.1, 1.0], 'snap'],
  [2.62, [-0.46, 2.46, 0.22], [-0.10, 0.98, -0.12], [0.0, 0.1, 1.0], 'smooth'],
  // pump 2
  [2.98, [-0.45, 2.63, 0.30], [-0.10, 0.97, 0.00], [0.0, 0.1, 1.0], 'snap'],
  [3.30, [-0.46, 2.47, 0.22], [-0.10, 0.98, -0.12], [0.0, 0.1, 1.0], 'smooth'],
  // pump 3 (biggest)
  [3.66, [-0.44, 2.66, 0.32], [-0.08, 0.96, 0.05], [0.0, 0.1, 1.0], 'snap'],
  [4.00, [-0.47, 2.44, 0.22], [-0.12, 0.98, -0.14], [0.0, 0.1, 1.0], 'smooth'],
  // lower: the axe swings forward first so the pommel never grazes the shoulder
  [4.22, [-0.66, 2.0, 0.64], [-0.10, 0.45, 0.90], [0.0, -0.9, 0.4], 'inOut'],
  [4.50, [-0.70, 1.58, 0.56], [-0.30, 0.15, 0.94], [0.0, -1.0, 0.1], 'smooth'],
  [4.85, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e, 'out'],
  [5.00, [-0.62, 1.05, 0.28], LOW_READY.h, LOW_READY.e, 'smooth'],
]);

// pelvis rise is limited so the planted legs never have to over-extend (the stance is already 11 cm lower than standing tall)
const PELVIS_Y = [[0, 0], [0.55, -0.11, 'out'], [1.05, -0.07, 'smooth'], [1.7, 0.012, 'out'], [1.95, -0.02, 'smooth'],
  [2.30, 0.03, 'snap'], [2.62, -0.015, 'smooth'], [2.98, 0.03, 'snap'], [3.30, -0.015, 'smooth'], [3.66, 0.035, 'snap'], [4.0, -0.02, 'smooth'],
  [4.5, -0.04, 'smooth'], [5.0, 0, 'smooth']];
// elbow pole: raised, outward and back for the overhead phase (found by scanning for the smallest wrist bend)
const POLE_R = [[0, [-0.5, -0.2, -1.0]], [0.9, [-0.6, 0.0, -0.8], 'smooth'], [1.6, [-0.6, 0.3, -1.0], 'smooth'], [4.0, [-0.6, 0.3, -1.0], 'smooth'], [4.7, [-0.5, -0.2, -1.0], 'smooth'], [5.0, [-0.5, -0.2, -1.0]]];
const PELVIS_Z = [[0, 0], [0.55, 0.04, 'out'], [1.7, -0.04, 'smooth'], [4.0, -0.05, 'smooth'], [5.0, 0, 'smooth']];
const SPINE_PITCH = [[0, 0], [0.55, 0.10, 'out'], [1.05, 0.0, 'smooth'], [1.7, -0.30, 'out'], [1.95, -0.34, 'smooth'],
  [2.30, -0.42, 'snap'], [2.62, -0.34, 'smooth'], [2.98, -0.43, 'snap'], [3.30, -0.34, 'smooth'], [3.66, -0.46, 'snap'], [4.0, -0.30, 'smooth'],
  [4.5, 0.02, 'inOut'], [5.0, 0, 'smooth']];
const CHEST_PITCH = [[0, 0], [1.6, 0, 'smooth'], [1.95, -0.10, 'out'], [3.7, -0.12, 'smooth'], [4.4, 0, 'smooth']];
const HEAD_PITCH = [[0, 0], [0.55, 0.06, 'out'], [1.3, 0.0, 'smooth'], [1.8, -0.42, 'out'], [3.9, -0.45, 'smooth'], [4.5, -0.05, 'smooth'], [5.0, 0, 'smooth']];
const NECK_PITCH = [[0, 0], [1.8, -0.12, 'out'], [3.9, -0.14, 'smooth'], [4.5, 0, 'smooth']];
const JAW = [[0, 0], [1.72, 0, 'smooth'], [1.92, 0.42, 'snap'], [2.20, 0.40, 'smooth'], [2.34, 0.66, 'snap'], [2.62, 0.38, 'smooth'], [2.98, 0.68, 'snap'], [3.30, 0.38, 'smooth'],
  [3.68, 0.74, 'snap'], [4.0, 0.46, 'smooth'], [4.22, 0.0, 'in'], [5.0, 0]];
const BREATH = [[0, 0], [0.5, 0.4, 'smooth'], [1.0, 0.8, 'smooth'], [1.75, 2.1, 'out'], [2.3, 2.3, 'snap'], [2.62, 1.8, 'smooth'], [2.98, 2.3, 'snap'], [3.3, 1.8, 'smooth'], [3.66, 2.4, 'snap'],
  [4.1, 0.6, 'smooth'], [5.0, 0.0, 'smooth']];
const SH_R_UP = [[0, 0], [1.0, 0.10, 'smooth'], [1.55, 0.50, 'out'], [3.9, 0.46, 'smooth'], [4.6, 0.0, 'smooth']];
const SH_L_UP = [[0, 0], [1.7, 0.2, 'smooth'], [3.9, 0.25, 'smooth'], [4.6, 0, 'smooth']];
const SH_R_FWD = [[0, 0], [1.55, 0.18, 'smooth'], [4.2, 0.12, 'smooth'], [4.8, 0, 'smooth']];
const SPINE_YAW = [[0, 0], [1.0, -0.08, 'smooth'], [1.9, 0.12, 'smooth'], [4.0, 0.10, 'smooth'], [5.0, 0, 'smooth']];
const SPINE_ROLL = [[0, 0], [1.9, 0.07, 'smooth'], [4.0, 0.07, 'smooth'], [5.0, 0, 'smooth']];
const FIST_L = [[0, 0], [1.4, 0, 'smooth'], [1.8, 0.95, 'snap'], [4.0, 0.95, 'smooth'], [4.6, 0.1, 'smooth']];
const L_ARM = [
  [0.0, [0.58, 1.07, 0.15]], [1.0, [0.62, 1.00, 0.10], 'smooth'], [1.9, [0.77, 1.31, 0.25], 'out'],
  [2.3, [0.79, 1.38, 0.27], 'smooth'], [3.66, [0.81, 1.42, 0.29], 'smooth'], [4.4, [0.68, 1.14, 0.2], 'inOut'], [5.0, [0.58, 1.07, 0.15], 'smooth'],
];

export const raiseAction = {
  name: 'raise',
  label: 'Raise Axe & Roar',
  duration: T,
  events: [
    { t: 0.45, name: 'grunt', kind: 'brace' },
    { t: 1.0, name: 'whoosh', kind: 'lift', speed: 0.7 },
    { t: 1.62, name: 'inhaleSharp' },
    { t: 1.88, name: 'roar', kind: 'long', jaw: 0.42 },
    { t: 2.28, name: 'pump', index: 0 },
    { t: 2.96, name: 'pump', index: 1 },
    { t: 3.64, name: 'pump', index: 2 },
    { t: 4.12, name: 'exhale', kind: 'big' },
    { t: 4.3, name: 'whoosh', kind: 'lower', speed: 0.5 },
  ],
  eval(t, pose, stance) {
    copyPose(stance, pose);
    applyAxe(AXE, t, pose.armR);
    sampleVec(POLE_R, t, pose.armR.pole);
    pose.pelvis.p.y += sample(PELVIS_Y, t);
    pose.pelvis.p.z += sample(PELVIS_Z, t);
    pose.spine.pitch += sample(SPINE_PITCH, t);
    pose.chest.pitch += sample(CHEST_PITCH, t);
    pose.head.pitch += sample(HEAD_PITCH, t);
    pose.neck.pitch += sample(NECK_PITCH, t);
    pose.jaw = sample(JAW, t);
    pose.breath = sample(BREATH, t);
    pose.shoulder.R.up += sample(SH_R_UP, t);
    pose.shoulder.L.up += sample(SH_L_UP, t);
    pose.shoulder.R.fwd += sample(SH_R_FWD, t);
    pose.spine.yaw += sample(SPINE_YAW, t);
    pose.spine.roll += sample(SPINE_ROLL, t);
    pose.fistL = sample(FIST_L, t);
    sampleVec(L_ARM, t, pose.armL.root.p);
    return pose;
  },
};
