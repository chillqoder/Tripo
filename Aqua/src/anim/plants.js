// Plant foliage deformation. Roots stay fixed (displacement ~ h^p, h = 0 at the root);
// each species uses a different response derived from its leaf form.
import * as THREE from 'three';
import { applyDeformer, inflateBounds } from './deform.js';
import { globals } from '../render/materials.js';

const KIND = {
  // exponent, sway amplitude (fraction of height), frequency, wave lag up the leaf, flow gain, fine flutter
  ribbon: { p: 1.7, amp: 0.012, freq: 0.045, lag: 1.1, flow: 0.045, flutter: 0.0 },
  oval: { p: 2.2, amp: 0.003, freq: 0.028, lag: 0.3, flow: 0.012, flutter: 0.0005 },
  lance: { p: 1.9, amp: 0.007, freq: 0.038, lag: 0.7, flow: 0.025, flutter: 0.0008 },
  feather: { p: 1.4, amp: 0.009, freq: 0.05, lag: 0.8, flow: 0.035, flutter: 0.001 },
};

export function rigPlant(mesh, kind, stiffness, modelHeight, seed) {
  const k = KIND[kind];
  const uniforms = {
    uTime: globals.uTime,
    uPlantFlow: { value: new THREE.Vector3() }, // model-space current at the plant (set per step)
    uPlantH: { value: modelHeight },
    uPlantSeed: { value: seed },
  };
  const decl = `uniform float uTime; uniform vec3 uPlantFlow; uniform float uPlantH; uniform float uPlantSeed;`;
  const f = (v) => v.toFixed(5);
  const body = `
  {
    float h = clamp(dfRest.y / uPlantH, 0.0, 1.0);
    float bend = pow(h, ${f(k.p)}) / ${f(Math.sqrt(stiffness))};
    // per-leaf phase from rest position: neighbouring leaves differ, a single leaf is continuous
    float ph = dot(dfRest.xz / uPlantH, vec2(2.1, 1.7)) + uPlantSeed;
    float t = uTime * ${f(k.freq)};
    float w1 = sin(t * 6.2831 - h * ${f(k.lag)} + ph);
    float w2 = sin(t * 6.2831 * 0.63 - h * ${f(k.lag * 1.4)} + ph * 1.1 + 1.7);
    vec2 dir = normalize(vec2(cos(ph * 0.37), sin(ph * 0.37)) + vec2(0.001));
    vec2 sway = dir * (w1 + 0.2 * w2) * ${f(k.amp)} * uPlantH;
    vec2 flow = uPlantFlow.xz * ${f(k.flow)} * uPlantH * (1.0 + 0.1 * w1);
    float r = length(dfRest.xz);
    float flutter = ${f(k.flutter)} * uPlantH * sin(uTime * 0.3 + dot(dfRest / uPlantH, vec3(3.7, 2.9, 3.1))) * smoothstep(0.05, 0.3, r / uPlantH);
    vec2 d = (sway + flow) * bend;
    transformed.xz += d;
    transformed.y += flutter * bend;
    // keep the leaf length roughly constant: lower the tip slightly as it bends
    transformed.y -= 0.5 * dot(d, d) / max(dfRest.y, 0.02 * uPlantH);
  }`;
  applyDeformer(mesh, `plant-${kind}`, { uniforms, decl, body });
  inflateBounds(mesh.geometry, modelHeight * 0.25);
  return uniforms;
}
