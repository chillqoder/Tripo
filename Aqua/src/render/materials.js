// Composable onBeforeCompile patches + the shared underwater look (absorption, haze, caustics).
import * as THREE from 'three';
import { TANK } from '../config/scene.js';
import { WAVES } from '../world/surface.js';

export const globals = {
  uTime: { value: 0 },
  uPlume: { value: [0, 0] },
  uCaustics: { value: 1.0 },
  uWaterColor: { value: new THREE.Color(0x2c5a4c) },
  uHaze: { value: 0.035 },
  uAbsorb: { value: new THREE.Vector3(0.05, 0.02, 0.026) },
  uCausticTex: { value: null },
};

// Register a patch on a material. Patches run in order inside one onBeforeCompile.
export function addPatch(material, key, fn) {
  const ud = material.userData;
  if (!ud.patches) {
    ud.patches = [];
    material.onBeforeCompile = (shader, renderer) => { for (const p of ud.patches) p.fn(shader, renderer); };
    material.customProgramCacheKey = () => ud.patches.map((p) => p.key).join('|');
  }
  ud.patches.push({ key, fn });
  material.needsUpdate = true;
  return material;
}

const f = (v) => v.toFixed(6);
const TAU = Math.PI * 2;
// wave-only surface slope for caustic displacement (ripples are omitted here for cost)
const BASE_SLOPE_GLSL = /* glsl */ `
vec2 uwSurfaceSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  ${WAVES.map((w) => { const k = TAU / w.l; return `g += ${f(w.a * k)} * vec2(${f(w.d[0])}, ${f(w.d[1])}) * cos(${f(k)} * dot(vec2(${f(w.d[0])}, ${f(w.d[1])}), p) - ${f(k * w.s)} * t);`; }).join('\n  ')}
  return g;
}
`;

// Caustic pattern baked once per frame into a top-down texture covering the tank floor
// (two channels: light focused at a shallow and a deep reference depth), see CausticBaker.
export const CAUSTIC_BAKE_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uPlume;
${BASE_SLOPE_GLSL}
// tileable water caustic (after joltz0r / Dave Hoskins), evaluated on world xz
float uwCausticPattern(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
float causticAtDepth(vec2 xz, float depth) {
  // light refracted by the moving surface: displace the lookup by the surface slope * depth
  vec2 slope = uwSurfaceSlope(xz, uTime);
  vec2 p = xz * 1.35 + slope * depth * 1.6;
  return uwCausticPattern(p + 23.0, uTime * 0.45);
}
`;

const UNDERWATER_COMMON = /* glsl */ `
uniform float uCaustics;
uniform vec3 uWaterColor;
uniform float uHaze;
uniform vec3 uAbsorb;
uniform sampler2D uCausticTex;
varying vec3 vUwWorld;
float uwCaustic(vec3 wp, vec3 wn) {
  float facing = smoothstep(0.05, 0.75, wn.y);
  if (facing <= 0.0 || wp.y > ${f(TANK.waterline)} || abs(wp.x) > ${f(TANK.hx)} || abs(wp.z) > ${f(TANK.hz)}) return 0.0;
  float depth = ${f(TANK.waterline)} - wp.y;
  vec2 uv = vec2((wp.x + ${f(TANK.hx)}) / ${f(TANK.w)}, (wp.z + ${f(TANK.hz)}) / ${f(TANK.d)});
  vec2 c2 = texture2D(uCausticTex, uv).rg;
  float c = mix(c2.r, c2.g, clamp((depth - 2.0) / 4.0, 0.0, 1.0));
  return c * facing * exp(-depth * 0.1) * uCaustics;
}
float uwPathLength(vec3 wp) {
  vec3 ro = cameraPosition;
  vec3 rd = wp - ro;
  float L = length(rd);
  rd /= L;
  vec3 bmin = vec3(${f(-TANK.hx)}, 0.0, ${f(-TANK.hz)});
  vec3 bmax = vec3(${f(TANK.hx)}, ${f(TANK.waterline)}, ${f(TANK.hz)});
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1);
  float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  return max(0.0, L - tEnter);
}
`;

// Apply water absorption, haze and caustics to any submerged lit material.
export function patchUnderwater(material, { caustics = 1.0 } = {}) {
  return addPatch(material, `uw${caustics}`, (shader) => {
    shader.uniforms.uCaustics = globals.uCaustics; shader.uniforms.uWaterColor = globals.uWaterColor;
    shader.uniforms.uHaze = globals.uHaze; shader.uniforms.uAbsorb = globals.uAbsorb; shader.uniforms.uCausticTex = globals.uCausticTex;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec4 uwWp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      uwWp = instanceMatrix * uwWp;
    #endif
    vUwWorld = (modelMatrix * uwWp).xyz;
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + UNDERWATER_COMMON)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    vec3 uwN = inverseTransformDirection(normal, viewMatrix);
    float cst = uwCaustic(vUwWorld, uwN) * ${f(caustics)};
    gl_FragColor.rgb += cst * diffuseColor.rgb * vec3(0.9, 1.0, 0.95) * 0.55;
    float L = uwPathLength(vUwWorld);
    gl_FragColor.rgb *= exp(-L * uAbsorb);
    float haze = (1.0 - exp(-L * uHaze)) * 0.85;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterColor, haze);
  }`);
  });
}

// Renders the animated caustic pattern into a small texture each frame.
export class CausticBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false });
    this.target.texture.wrapS = this.target.texture.wrapT = THREE.ClampToEdgeWrapping;
    globals.uCausticTex.value = this.target.texture;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uTime: globals.uTime, uPlume: globals.uPlume },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `${CAUSTIC_BAKE_GLSL}
        varying vec2 vUv;
        void main() {
          vec2 xz = vec2(vUv.x * ${f(TANK.w)} - ${f(TANK.hx)}, vUv.y * ${f(TANK.d)} - ${f(TANK.hz)});
          gl_FragColor = vec4(causticAtDepth(xz, 2.0), causticAtDepth(xz, 6.0), 0.0, 1.0);
        }`,
    })));
  }
  render() {
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
  }
}
