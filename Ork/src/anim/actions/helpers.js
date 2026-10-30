import * as THREE from 'three';
import { axeQuat } from '../pose.js';
import { sample, sampleVec, sampleQuat } from '../curves.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * Axe target track.  keys: [time, [x,y,z] grip centre, [x,y,z] head direction (axe +Y), [x,y,z] edge direction, ease?]
 * Positions / directions are in the pelvis-yaw "root" frame (x<0 = the orc's right).
 */
export function axeTrack(keys) {
  return {
    pos: keys.map((k) => [k[0], k[1], k[4]]),
    quat: keys.map((k) => [k[0], axeQuat(V(k[3]), V(k[2])), k[4]]),
  };
}

export function applyAxe(track, t, arm) {
  sampleVec(track.pos, t, arm.root.p);
  sampleQuat(track.quat, t, arm.root.q);
}

/** hand-delta track for the left hand: keys [time, [x,y,z], quaternion, ease?] */
export function posTrack(keys) { return keys.map((k) => [k[0], k[1], k[2]]); }

export const S = sample;

/** add the sampled value to a scalar property of an object */
export function add(obj, key, keys, t) { obj[key] += sample(keys, t); }
