// One shared water-surface height function. The GLSL version is generated from the same
// parameter tables so CPU queries (bubble arrival, fish limits) and GPU rendering
// (surface displacement, normals, refraction) can't drift apart.
import { TANK } from '../config/scene.js';

const TAU = Math.PI * 2;
// Indoor water stays still between bubble arrivals. Any ambient waves added here
// use amplitude (units), wavelength, speed and direction, shared by CPU and GPU.
export const WAVES = [];
export const RIPPLE_MAX = 32;
export const RIPPLE = { speed: 0.55, width: 0.17, k: 19.0, life: 3.8, damp: 0.65 };
const MENISCUS = { h: 0.014, w: 0.035 };

// state shared with the GPU via uniforms
export const surfaceState = {
  ripples: new Float32Array(RIPPLE_MAX * 4), // x, z, startTime, amplitude (amp 0 = free)
  next: 0,
  plume: [0, 0], // xz of plume centre (set when the aerator is placed)
};
for (let i = 0; i < RIPPLE_MAX; i++) surfaceState.ripples[i * 4 + 2] = -1e4;

export function addRipple(x, z, t, amp) {
  const r = surfaceState.ripples;
  // aggregate with a very recent nearby ripple instead of stacking many identical ones
  for (let i = 0; i < RIPPLE_MAX; i++) {
    const o = i * 4;
    const age = t - r[o + 2];
    if (r[o + 3] > 0 && age >= 0 && age < 0.12 && Math.hypot(r[o] - x, r[o + 1] - z) < 0.12) { r[o + 3] = Math.min(0.018, r[o + 3] + amp * 0.5); return; }
  }
  const o = surfaceState.next * 4;
  r[o] = x; r[o + 1] = z; r[o + 2] = t; r[o + 3] = amp;
  surfaceState.next = (surfaceState.next + 1) % RIPPLE_MAX;
}

export function surfaceHeight(x, z, t) {
  let h = TANK.waterline;
  for (const w of WAVES) {
    const k = TAU / w.l;
    h += w.a * Math.sin(k * (w.d[0] * x + w.d[1] * z) - k * w.s * t);
  }
  const r = surfaceState.ripples;
  for (let i = 0; i < RIPPLE_MAX; i++) {
    const o = i * 4, age = t - r[o + 2];
    if (r[o + 3] <= 0 || age < 0 || age > RIPPLE.life) continue;
    const d = Math.hypot(x - r[o], z - r[o + 1]);
    const front = d - RIPPLE.speed * age;
    const env = Math.exp(-(front * front) / (RIPPLE.width * RIPPLE.width)) * Math.exp(-age * RIPPLE.damp) * (1 - Math.exp(-age * 18)) / (1 + 1.5 * d);
    h += r[o + 3] * env * Math.cos(RIPPLE.k * front);
  }
  const dw = Math.min(TANK.hx - Math.abs(x), TANK.hz - Math.abs(z));
  h += MENISCUS.h * Math.exp(-Math.max(dw, 0) / MENISCUS.w);
  return h;
}

const f = (v) => v.toFixed(6);
export const SURFACE_GLSL = /* glsl */ `
uniform vec4 uRipples[${RIPPLE_MAX}];
uniform vec2 uPlume;
float surfaceHeight(vec2 p, float t) {
  float h = ${f(TANK.waterline)};
  ${WAVES.map((w) => { const k = TAU / w.l; return `h += ${f(w.a)} * sin(${f(k)} * dot(vec2(${f(w.d[0])}, ${f(w.d[1])}), p) - ${f(k * w.s)} * t);`; }).join('\n  ')}
  for (int i = 0; i < ${RIPPLE_MAX}; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > ${f(RIPPLE.life)}) continue;
    float d = length(p - r.xy);
    float front = d - ${f(RIPPLE.speed)} * age;
    float env = exp(-(front * front) / ${f(RIPPLE.width * RIPPLE.width)}) * exp(-age * ${f(RIPPLE.damp)}) * (1.0 - exp(-age * 18.0)) / (1.0 + 1.5 * d);
    h += r.w * env * cos(${f(RIPPLE.k)} * front);
  }
  float dw = min(${f(TANK.hx)} - abs(p.x), ${f(TANK.hz)} - abs(p.y));
  h += ${f(MENISCUS.h)} * exp(-max(dw, 0.0) / ${f(MENISCUS.w)});
  return h;
}
vec3 surfaceNormal(vec2 p, float t) {
  const float e = 0.025;
  float hx = surfaceHeight(p + vec2(e, 0.0), t) - surfaceHeight(p - vec2(e, 0.0), t);
  float hz = surfaceHeight(p + vec2(0.0, e), t) - surfaceHeight(p - vec2(0.0, e), t);
  return normalize(vec3(-hx, 2.0 * e, -hz));
}
`;

// Analytic per-pixel slope keeps the small expanding bubble rings round even between
// mesh vertices. Each wave contributes exactly once to the optical normal.
export const SURFACE_DETAIL_GLSL = /* glsl */ `
uniform vec4 uRipples[${RIPPLE_MAX}];
vec2 surfaceDetailSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  ${WAVES.map((w) => { const k = TAU / w.l; return `g += ${f(w.a * k)} * vec2(${f(w.d[0])}, ${f(w.d[1])}) * cos(${f(k)} * dot(vec2(${f(w.d[0])}, ${f(w.d[1])}), p) - ${f(k * w.s)} * t);`; }).join('\n  ')}
  for (int i = 0; i < ${RIPPLE_MAX}; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > ${f(RIPPLE.life)}) continue;
    vec2 delta = p - r.xy;
    float d = length(delta);
    float front = d - ${f(RIPPLE.speed)} * age;
    if (abs(front) > ${f(RIPPLE.width * 4)}) continue;
    float env = exp(-(front * front) / ${f(RIPPLE.width * RIPPLE.width)}) * exp(-age * ${f(RIPPLE.damp)}) * (1.0 - exp(-age * 18.0)) / (1.0 + 1.5 * d);
    float slope = r.w * env * ((-2.0 * front / ${f(RIPPLE.width * RIPPLE.width)} - 1.5 / (1.0 + 1.5 * d)) * cos(${f(RIPPLE.k)} * front) - ${f(RIPPLE.k)} * sin(${f(RIPPLE.k)} * front));
    g += delta / max(d, 0.0001) * slope;
  }
  return g;
}
`;

export function surfaceUniforms() {
  return { uRipples: { value: packRipples() }, uPlume: { value: surfaceState.plume } };
}
// uniform array of vec4 expects an array of Vector4-likes or a flat Float32Array
function packRipples() { return surfaceState.ripples; }
