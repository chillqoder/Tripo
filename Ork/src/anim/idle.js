import * as THREE from 'three';
import { copyPose } from './pose.js';
import { smoothstep } from './curves.js';

const TAU = Math.PI * 2;
export const BREATH_PERIOD = 4.6;       // seconds per breath
const INHALE_END = 0.40;                // phase where the inhale tops out
const EXHALE_START = 0.47;              // brief hold, then exhale
const GROWL_PERIOD = 9.7;
const GROWL_AT = 3.4, GROWL_LEN = 1.7;

/** 0..1 lung fill for a time (slow heavy inhale, short hold, long exhale). */
export function breathFill(t) {
  const ph = ((t % BREATH_PERIOD) + BREATH_PERIOD) % BREATH_PERIOD / BREATH_PERIOD;
  if (ph < INHALE_END) return smoothstep(0, 1, ph / INHALE_END);
  if (ph < EXHALE_START) return 1;
  return 1 - smoothstep(0, 1, (ph - EXHALE_START) / (1 - EXHALE_START));
}

export function growlEnvelope(t) {
  const u = ((t % GROWL_PERIOD) + GROWL_PERIOD) % GROWL_PERIOD;
  if (u < GROWL_AT || u > GROWL_AT + GROWL_LEN) return 0;
  const x = (u - GROWL_AT) / GROWL_LEN;
  return smoothstep(0, 0.22, x) * (1 - smoothstep(0.7, 1, x));
}

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/**
 * Continuous idle layer on top of the stance.  Everything is a smooth function of time, so the loop is seamless
 * by construction; feet stay planted because the legs are solved with IK from the planted foot targets.
 */
export function evalIdle(t, stance, out) {
  copyPose(stance, out);
  const depth = 1 + 0.12 * Math.sin(t * 0.37) + 0.06 * Math.sin(t * 0.91 + 1.3);
  const b = breathFill(t) * depth;

  // lungs / chest / shoulders / head follow the breath
  out.breath = 2.4 * b;                          // chest / belly expansion morph (up to ~5 cm)
  out.spine.pitch -= 0.100 * b;
  out.chest.pitch -= 0.060 * b;
  out.shoulder.R.up += 0.20 * b; out.shoulder.L.up += 0.20 * b;
  out.shoulder.R.fwd -= 0.05 * b; out.shoulder.L.fwd -= 0.05 * b;
  out.neck.pitch -= 0.04 * b;
  out.head.pitch -= 0.07 * b;
  out.pelvis.p.y += 0.02 * b;

  // weight shifts between the legs, knee flex / extend, restrained sway
  const ws = Math.sin(t * TAU / 9.7);
  const ws2 = Math.sin(t * TAU / 6.3 + 0.8);
  out.pelvis.p.x += 0.04 * ws;
  out.pelvis.roll += 0.03 * ws;
  out.spine.roll -= 0.022 * ws;
  out.pelvis.p.y += 0.014 * ws2 - 0.004 * ws * ws;
  out.pelvis.p.z += 0.012 * Math.sin(t * TAU / 7.9 + 2.0);
  out.spine.yaw += 0.035 * Math.sin(t * TAU / 12.3);
  out.chest.roll += 0.018 * Math.sin(t * TAU / 7.7 + 0.5);
  out.head.yaw += 0.05 * Math.sin(t * TAU / 8.3 + 1.2);
  out.head.roll += 0.02 * Math.sin(t * TAU / 10.1);

  // arms and axe react to the breathing and the sway (the grip itself never loosens)
  out.armR.root.p.y += 0.035 * b + 0.006 * ws2;
  out.armR.root.p.z += 0.016 * b;
  out.armR.root.p.x += 0.012 * ws;
  _q.setFromAxisAngle(AX.x, -0.07 * b + 0.012 * ws2);
  _qa.setFromAxisAngle(AX.z, 0.02 * Math.sin(t * TAU / 7.1));
  out.armR.root.q.premultiply(_q).premultiply(_qa);
  out.armL.root.p.y += 0.035 * b - 0.004 * ws2;
  out.armL.root.p.z += 0.01 * b;
  out.fistL = 0.12 + 0.05 * b;

  // occasional growl: jaw parts a little and trembles, head dips
  const g = growlEnvelope(t);
  if (g > 0) {
    out.jaw += g * (0.09 + 0.012 * Math.sin(t * TAU * 11));
    out.head.pitch += 0.05 * g;
    out.neck.pitch += 0.02 * g;
    out.shoulder.R.up += 0.03 * g; out.shoulder.L.up += 0.03 * g;
  }
  return out;
}

/** Idle events (breath in / out, growl) that happened between two idle times. */
export function idleEvents(t0, t1, emit) {
  const crossings = (offset, period) => {
    const a = Math.floor((t0 - offset) / period), c = Math.floor((t1 - offset) / period);
    return c > a ? c : null;
  };
  if (crossings(0.02, BREATH_PERIOD) !== null) emit('breathIn', { t: t1, amount: 1 });
  if (crossings(EXHALE_START * BREATH_PERIOD, BREATH_PERIOD) !== null) emit('breathOut', { t: t1, amount: 1 });
  if (crossings(GROWL_AT + 0.1, GROWL_PERIOD) !== null) emit('growlLow', { t: t1 });
}
