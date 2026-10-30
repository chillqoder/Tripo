// Continuous sand bed with physical thickness, dense instanced pebbles derived from the three
// extracted pebble templates, and smooth height/normal queries for bottom animals.
import * as THREE from 'three';
import { TANK, LAYOUT } from '../config/scene.js';
import { STONES } from '../config/assets.js';
import { rng, fbm2, smoothstep, clamp } from '../core/random.js';
import { patchUnderwater, addPatch } from '../render/materials.js';

const INSET = 0.004;
// local mounds around planted bases and decorations (restrained)
const MOUNDS = [
  [LAYOUT.castle.x, LAYOUT.castle.z, 1.9, 0.07],
  ...Object.values(LAYOUT.plants).map((p) => [p.x, p.z, 0.9, 0.09]),
  [LAYOUT.aerator.x, LAYOUT.aerator.z, 0.8, 0.05],
];

export function sandHeight(x, z) {
  const back = (TANK.hz - z) / TANK.d; // 0 front .. 1 rear
  let h = 0.42 + 0.34 * smoothstep(0, 1, back);
  h += (fbm2(x * 0.45 + 3.1, z * 0.45 - 1.7) - 0.5) * 0.09;
  h += (fbm2(x * 1.6, z * 1.6 + 9.0) - 0.5) * 0.03;
  for (const [mx, mz, r, a] of MOUNDS) { const d2 = (x - mx) ** 2 + (z - mz) ** 2; h += a * Math.exp(-d2 / (r * r)); }
  return h;
}

export function sandNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.05;
  out.set(sandHeight(x - e, z) - sandHeight(x + e, z), 2 * e, sandHeight(x, z - e) - sandHeight(x, z + e));
  return out.normalize();
}

function sandTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), r = rng(7);
  for (let i = 0; i < S * S; i++) {
    const x = i % S, y = (i / S) | 0;
    const n = fbm2(x * 0.06, y * 0.06) * 0.5 + r() * 0.5; // fine grain + soft variation
    const speck = r() < 0.035 ? (r() < 0.5 ? -40 : 30) : 0;
    const v = 0.6 + (n - 0.5) * 0.3;
    img.data[i * 4] = clamp(205 * v + speck, 0, 255);
    img.data[i * 4 + 1] = clamp(188 * v + speck, 0, 255);
    img.data[i * 4 + 2] = clamp(152 * v + speck * 0.8, 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 4.5); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildSandGeometry() {
  const NX = 260, NZ = 130;
  const pos = [], uv = [], idx = [];
  const x0 = -TANK.hx + INSET, x1 = TANK.hx - INSET, z0 = -TANK.hz + INSET, z1 = TANK.hz - INSET;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = x0 + (x1 - x0) * (i / NX), z = z0 + (z1 - z0) * (j / NZ);
    pos.push(x, sandHeight(x, z), z); uv.push(i / NX, 1 - j / NZ);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // vertical skirts so the layer has visible thickness through the glass
  const skirt = (pts) => {
    const base = pos.length / 3;
    for (const [x, z] of pts) { pos.push(x, sandHeight(x, z), z, x, 0.0, z); uv.push(x * 0.1, 1, x * 0.1, 0); }
    for (let k = 0; k < pts.length - 1; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  };
  const line = (n, f) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
  skirt(line(NX, (t) => [x1 - (x1 - x0) * t, z1]).reverse());
  skirt(line(NX, (t) => [x0 + (x1 - x0) * t, z0]).reverse());
  skirt(line(NZ, (t) => [x0, z0 + (z1 - z0) * t]).reverse());
  skirt(line(NZ, (t) => [x1, z1 - (z1 - z0) * t]).reverse());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Builds the sand, pebbles and a smoothed bed-height grid.
// `keepOut(x, z, r)` returns true where no pebble may be placed (decor footprints).
export function buildSubstrate(scene, assets, keepOut) {
  const tex = sandTexture();
  const sandMat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.6, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  addPatch(sandMat, 'detritus', (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSandW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSandW;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.3))) * 15731.743); }
float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // settled detritus in sheltered spots: along the rear/side glass and in a few hollows
    float wall = min(${TANK.hx.toFixed(3)} - abs(vSandW.x), ${TANK.hz.toFixed(3)} + vSandW.z);
    float shelter = smoothstep(0.6, 0.0, wall) * 0.7 + smoothstep(0.62, 0.8, sNoise(vSandW.xz * 0.9)) * 0.5;
    float m = shelter * smoothstep(0.3, 0.7, sNoise(vSandW.xz * 5.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.52, 0.38), clamp(m, 0.0, 0.75));
    // a faint green-brown film close to the glass in corners
    float film = smoothstep(0.35, 0.0, wall) * smoothstep(0.45, 0.75, sNoise(vSandW.xz * 3.1 + 5.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.36, 0.2), film * 0.45);
  }`);
  });
  patchUnderwater(sandMat);
  const sand = new THREE.Mesh(buildSandGeometry(), sandMat);
  sand.name = 'sand';
  sand.receiveShadow = true;
  sand.renderOrder = 2; // after pebbles/decor so hidden sand fragments are rejected by early depth test
  scene.add(sand);

  // ---- pebbles -------------------------------------------------------------------------
  const r = rng(1337);
  const templates = STONES.pebbles.map((k, i) => assets[`pebble${i}`]).filter(Boolean);
  const placements = templates.map(() => []);
  const CELL = 0.19;
  const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const bedPebbles = [];
  let last = -1, lastRun = 0;
  for (let z = -TANK.hz + 0.12; z < TANK.hz - 0.1; z += CELL * 0.88) {
    for (let x = -TANK.hx + 0.12; x < TANK.hx - 0.1; x += CELL) {
      const px = x + (r() - 0.5) * CELL * 0.9, pz = z + (r() - 0.5) * CELL * 0.8;
      if (Math.abs(px) > TANK.hx - 0.1 || Math.abs(pz) > TANK.hz - 0.1) continue;
      // leave a few sand patches and gaps
      const patch = fbm2(px * 0.55 + 11.0, pz * 0.55 - 4.0);
      if (patch > 0.64 || r() < 0.04) continue;
      if (keepOut(px, pz, 0.12)) continue;
      let v = Math.floor(r() * templates.length);
      if (v === last && ++lastRun > 1) v = (v + 1 + Math.floor(r() * 2)) % templates.length; else if (v !== last) lastRun = 0;
      last = v;
      const s = STONES.pebbleScale[0] + r() * (STONES.pebbleScale[1] - STONES.pebbleScale[0]);
      placements[v].push({ x: px, z: pz, s, yaw: r() * Math.PI * 2 });
    }
  }
  let total = 0;
  templates.forEach((t, vi) => {
    if (!t) return;
    const list = placements[vi];
    const geo = t.geometry.clone();
    geo.computeBoundingBox();
    const mat = t.material.clone();
    mat.roughness = 0.55; mat.envMapIntensity = 0.5;
    patchUnderwater(mat);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.name = `pebbles-${vi}`;
    im.receiveShadow = true;
    im.renderOrder = 1;
    const hgt = geo.boundingBox.max.y;
    list.forEach((p, k) => {
      sandNormal(p.x, p.z, n);
      q.setFromUnitVectors(up, n);
      qy.setFromAxisAngle(up, p.yaw);
      q.multiply(qy);
      const sink = hgt * p.s * 0.22; // seated, not floating, not deeply buried
      tmpM.compose(new THREE.Vector3(p.x, sandHeight(p.x, p.z) - sink, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      im.setMatrixAt(k, tmpM);
      bedPebbles.push([p.x, p.z, p.s * 0.25, hgt * p.s - sink]);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
    total += list.length;
  });

  // ---- smooth bed height (sand + pebble envelope, low-passed) -----------------------
  const RES = 0.08, GX = Math.ceil(TANK.w / RES) + 1, GZ = Math.ceil(TANK.d / RES) + 1;
  let grid = new Float32Array(GX * GZ);
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) grid[j * GX + i] = sandHeight(-TANK.hx + i * RES, -TANK.hz + j * RES);
  for (const [px, pz, pr, top] of bedPebbles) {
    const i0 = Math.floor((px - pr + TANK.hx) / RES), i1 = Math.ceil((px + pr + TANK.hx) / RES);
    const j0 = Math.floor((pz - pr + TANK.hz) / RES), j1 = Math.ceil((pz + pr + TANK.hz) / RES);
    const base = sandHeight(px, pz);
    for (let j = Math.max(0, j0); j <= Math.min(GZ - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(GX - 1, i1); i++) {
      const d = Math.hypot(-TANK.hx + i * RES - px, -TANK.hz + j * RES - pz) / pr;
      if (d < 1) grid[j * GX + i] = Math.max(grid[j * GX + i], base + (top - (base - sandHeight(px, pz))) * Math.sqrt(1 - d * d) * 0.85);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(grid.length);
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      let s = 0, w = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = clamp(i + di, 0, GX - 1), jj = clamp(j + dj, 0, GZ - 1);
        const ww = 1 / (1 + di * di + dj * dj); s += grid[jj * GX + ii] * ww; w += ww;
      }
      out[j * GX + i] = s / w;
    }
    grid = out;
  }
  const bedHeight = (x, z) => {
    const fx = clamp((x + TANK.hx) / RES, 0, GX - 1.001), fz = clamp((z + TANK.hz) / RES, 0, GZ - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = grid[j * GX + i], b = grid[j * GX + i + 1], c = grid[(j + 1) * GX + i], d = grid[(j + 1) * GX + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const bedNormal = (x, z, out = new THREE.Vector3()) => {
    const e = 0.12;
    return out.set(bedHeight(x - e, z) - bedHeight(x + e, z), 2 * e, bedHeight(x, z - e) - bedHeight(x, z + e)).normalize();
  };
  return { sand, pebbleCount: total, perVariant: placements.map((p) => p.length), bedHeight, bedNormal };
}
