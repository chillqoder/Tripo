import * as THREE from 'three';

const base = import.meta.env.BASE_URL;

/** grip frame from yaw (handle direction in the palm plane), pitch and roll about the handle (degrees) */
export function buildGrip({ x, y, z, yawDeg, pitchDeg = 0, rollDeg = 0 }) {
  const yaw = THREE.MathUtils.degToRad(yawDeg), pitch = THREE.MathUtils.degToRad(pitchDeg);
  const head = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  const edge = new THREE.Vector3(-Math.cos(yaw), 0, -Math.sin(yaw));
  edge.addScaledVector(head, -edge.dot(head)).normalize().applyAxisAngle(head, THREE.MathUtils.degToRad(rollDeg));
  return { pos: new THREE.Vector3(x, y, z), head, edge };
}

/**
 * Central tunables.  Everything that was calibrated by hand (axe scale, grip, finger curl, camera)
 * lives here so the inspection results are reproducible.
 */
export const CFG = {
  urls: {
    orc: base + 'assets/models/orc_rigged.glb',
    axe: base + 'assets/models/axe_prepared.glb',
    audio: base + 'assets/audio/',
  },

  /** Uniform axe scale (metres per prepared-GLB unit).  The prepared axe is 1.255 units long, handle diameter 0.117 -> 0.98 m / 9.1 cm. */
  axeScale: 0.78,

  /**
   * Grip calibration, expressed in the T-pose rest frame of the orc's RIGHT hand (palm down, fingers -X, thumb +Z),
   * relative to the Socket_R bone head.  `head`: direction of axe +Y (handle towards the blade);
   * `edge`: direction of axe +X (cutting edge).  Found with the grip optimiser against the real skinned hand mesh
   * (docs/inspection/GRIP_INSPECTION.md): wrap coverage 10/12 around the handle, max vertex penetration 4 mm.
   */
  grip: buildGrip({ x: -0.0066, y: -0.0514, z: -0.0485, yawDeg: 34.14, pitchDeg: -0.5, rollDeg: 0 }),

  camera: {
    fov: 38,
    position: new THREE.Vector3(-3.25, 3.75, 5.75),
    target: new THREE.Vector3(-0.1, 1.62, 0.55),
    minDistance: 4.2,
    maxDistance: 11,
    minPolar: 0.9,
    maxPolar: 1.52,
    azimuthRange: 1.0,
    /** camera translation (x,y,z metres) blended in while an action plays: keeps the raised axe / the impact in frame */
    framing: { raise: [0, 0.35, -0.1], chest: [0, 0, 0], slam: [0, -0.5, 0.4] },
  },
};
