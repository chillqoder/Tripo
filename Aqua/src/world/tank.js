// Glass tank, rim, base frame, pedestal and floor. Glass lives on LAYER_OPTICS so the
// refraction capture never contains it.
import * as THREE from 'three';
import { TANK } from '../config/scene.js';
import { addPatch } from '../render/materials.js';

export const LAYER_OPTICS = 1;

// tileable value-noise texture (R: fbm, G: fbm offset, B: fine noise) shared by the glass
// details, so the transparent panes need texture lookups instead of per-pixel fbm
let noiseTex = null;
function glassNoise() {
  if (noiseTex) return noiseTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  const tile = (x, y, p, o) => fbm2t(x, y, p, o);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    img.data[i] = tile(x / S, y / S, 8, 0) * 255;
    img.data[i + 1] = tile(x / S, y / S, 8, 37) * 255;
    img.data[i + 2] = tile(x / S, y / S, 32, 91) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  return noiseTex;
}
// periodic fbm on the unit square (period p cells)
function fbm2t(u, v, p, off) {
  let s = 0, a = 0.5, per = p;
  for (let o = 0; o < 4; o++) {
    s += a * periodicNoise(u * per, v * per, per, off + o * 13);
    per *= 2; a *= 0.5;
  }
  return Math.min(1, s / 0.9375);
}
function periodicNoise(x, y, per, off) {
  const h = (i, j) => { const s = Math.sin(((i % per) + per) % per * 127.1 + (((j % per) + per) % per) * 311.7 + off * 17.3) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function glassMaterial(paneNormal, uAxis) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x101614, roughness: 0.04, metalness: 0.0, transparent: true, depthWrite: false,
    envMapIntensity: 1.2, side: THREE.DoubleSide,
  });
  addPatch(m, 'glass', (shader) => {
    shader.uniforms.uPaneN = { value: paneNormal };
    shader.uniforms.uPaneU = { value: uAxis };
    shader.uniforms.uNoise = { value: glassNoise() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW; varying vec3 vGN;
uniform vec3 uPaneN; uniform vec3 uPaneU; uniform sampler2D uNoise;
vec3 gN(vec2 p) { return texture2D(uNoise, p).rgb; }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    vec3 V = normalize(cameraPosition - vGW);
    float edge = 1.0 - abs(dot(normalize(vGN), uPaneN));            // 1 on the thin edge faces
    float cosT = abs(dot(V, normalize(vGN)));
    float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);                 // Schlick, n = 1.5
    vec2 uv = vec2(dot(vGW, uPaneU), vGW.y);
    float wl = ${TANK.waterline.toFixed(4)};
    // restrained biofilm along the lower edge and the vertical corners
    float distCorner = min(${TANK.hx.toFixed(3)} - abs(vGW.x), ${TANK.hz.toFixed(3)} - abs(vGW.z));
    vec3 nA = gN(uv * 0.28), nB = gN(uv * 0.75 + 0.31);
    float film = smoothstep(1.05, 0.0, vGW.y + nA.r * 0.55) * 0.55
               + smoothstep(0.45, 0.0, distCorner + nA.g * 0.25) * smoothstep(wl, 0.0, vGW.y) * 0.3;
    film *= smoothstep(0.35, 0.65, nB.r);
    // thin uneven mineral trace just above the waterline
    float trace = smoothstep(0.035, 0.0, abs(vGW.y - wl - 0.035 - (nB.b - 0.5) * 0.05)) * (0.35 + 0.65 * gN(uv * 2.1).b);
    // very faint smudges
    float smudge = smoothstep(0.62, 0.9, gN(uv * 0.11 + 0.7).g) * 0.05;
    vec3 col = gl_FragColor.rgb;
    float a = mix(0.035, 0.6, fres);
    col = mix(col, vec3(0.32, 0.38, 0.22), clamp(film, 0.0, 1.0));
    a += film * 0.32;
    col = mix(col, vec3(0.78, 0.78, 0.72), trace * 0.6);
    a += trace * 0.18 + smudge;
    col = mix(col, vec3(0.2, 0.42, 0.33), edge);
    a = mix(a, 0.82, edge);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  }`);
  });
  return m;
}

export function buildTank(scene) {
  const g = TANK.glass, group = new THREE.Group();
  group.name = 'tank';
  const panes = [
    { name: 'front', size: [TANK.w + 2 * g, TANK.h, g], pos: [0, TANK.h / 2, TANK.hz + g / 2], n: [0, 0, 1], u: [1, 0, 0] },
    { name: 'back', size: [TANK.w + 2 * g, TANK.h, g], pos: [0, TANK.h / 2, -TANK.hz - g / 2], n: [0, 0, 1], u: [1, 0, 0] },
    { name: 'left', size: [g, TANK.h, TANK.d], pos: [-TANK.hx - g / 2, TANK.h / 2, 0], n: [1, 0, 0], u: [0, 0, 1] },
    { name: 'right', size: [g, TANK.h, TANK.d], pos: [TANK.hx + g / 2, TANK.h / 2, 0], n: [1, 0, 0], u: [0, 0, 1] },
    { name: 'bottom', size: [TANK.w + 2 * g, g, TANK.d + 2 * g], pos: [0, -g / 2, 0], n: [0, 1, 0], u: [1, 0, 0] },
  ];
  for (const p of panes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.size), glassMaterial(new THREE.Vector3(...p.n), new THREE.Vector3(...p.u)));
    mesh.position.set(...p.pos);
    mesh.name = 'glass-' + p.name;
    mesh.layers.set(LAYER_OPTICS);
    mesh.renderOrder = 10;
    group.add(mesh);
  }
  // silicone seams on the vertical corners
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x1a2420, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, TANK.h - 0.02, 0.035), seamMat);
    s.position.set(sx * (TANK.hx - 0.012), TANK.h / 2, sz * (TANK.hz - 0.012));
    s.layers.set(LAYER_OPTICS); s.renderOrder = 9;
    group.add(s);
  }
  // narrow upper rim and matte dark lower frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.62, metalness: 0.1 });
  const rimW = g + 0.07;
  const addBar = (sx, sy, sz, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; group.add(b); return b;
  };
  const W = TANK.w + 2 * g, D = TANK.d + 2 * g;
  const ry = TANK.h + TANK.rim / 2 - 0.02;
  addBar(W + 0.06, TANK.rim, rimW, 0, ry, TANK.hz + g - rimW / 2 + 0.03);
  addBar(W + 0.06, TANK.rim, rimW, 0, ry, -TANK.hz - g + rimW / 2 - 0.03);
  addBar(rimW, TANK.rim, D, -TANK.hx - g + rimW / 2 - 0.03, ry, 0);
  addBar(rimW, TANK.rim, D, TANK.hx + g - rimW / 2 + 0.03, ry, 0);
  const fy = -g + TANK.baseFrame / 2 - 0.06;
  const fw = g + 0.1;
  addBar(W + 0.1, TANK.baseFrame, fw, 0, fy, TANK.hz + g - fw / 2 + 0.05);
  addBar(W + 0.1, TANK.baseFrame, fw, 0, fy, -TANK.hz - g + fw / 2 - 0.05);
  addBar(fw, TANK.baseFrame, D + 0.1, -TANK.hx - g + fw / 2 - 0.05, fy, 0);
  addBar(fw, TANK.baseFrame, D + 0.1, TANK.hx + g - fw / 2 + 0.05, fy, 0);
  // pedestal cabinet
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.78, metalness: 0.05 });
  const ped = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, TANK.pedestalH, D + 0.7), pedMat);
  ped.position.set(0, -g - 0.06 - TANK.pedestalH / 2, 0);
  ped.receiveShadow = true; ped.castShadow = true;
  group.add(ped);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.08, D + 0.9), frameMat);
  lip.position.set(0, -g - 0.1, 0); lip.receiveShadow = true;
  group.add(lip);
  // floor with a soft contact shadow
  const floorY = ped.position.y - TANK.pedestalH / 2;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true;
  group.add(floor);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W + 4, D + 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = floorY + 0.01;
  group.add(shadow);
  scene.add(group);
  return { group, floorY, outer: { hx: TANK.hx + g + 0.5, hz: TANK.hz + g + 0.5, top: TANK.h + TANK.rim, bottom: floorY } };
}
