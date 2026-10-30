// Derives a deformation rig for a single merged fish mesh from its geometry.
//
// Per-vertex attribute aFin = (s, fin, caudal, pectoral):
//   s        normalised body coordinate, 0 at the nose (-X) .. 1 at the tail tip
//   fin      0 inside the thick body core, rising to 1 toward dorsal/anal/pelvic fin edges.
//            Fins are thin sheets: an (x, y) cell whose vertices all lie near z = 0 is fin,
//            a cell with vertices far from the mid-plane is body.
//   caudal   tail-fin weight beyond the measured peduncle (asset config caudalStart)
//   pectoral lateral protrusions beyond the body surface in the pectoral range
// aSide = sign(z) for left/right pectoral phasing.
// Deformation is evaluated from these rest attributes every frame on the GPU (body wave,
// turning curvature, delayed fin waves, pectoral sculling, trailing filaments).
import * as THREE from 'three';
import { applyDeformer, inflateBounds } from './deform.js';
import { smoothstep, clamp } from '../core/random.js';

export function buildFishRig(geometry, cfg) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const n = pos.count;
  const L = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y;
  const NX = 48, NY = 48;
  const cellMax = new Float32Array(NX * NY);
  const binOf = (x, y) => [clamp(Math.floor(((x - bb.min.x) / L) * NX), 0, NX - 1), clamp(Math.floor(((y - bb.min.y) / H) * NY), 0, NY - 1)];
  for (let i = 0; i < n; i++) {
    const [bx, by] = binOf(pos.getX(i), pos.getY(i));
    cellMax[by * NX + bx] = Math.max(cellMax[by * NX + bx], Math.abs(pos.getZ(i)));
  }
  // body core vertical range per x bin
  const ylo = new Float32Array(NX), yhi = new Float32Array(NX), width = new Float32Array(NX);
  let gmax = 0;
  for (let bx = 0; bx < NX; bx++) for (let by = 0; by < NY; by++) gmax = Math.max(gmax, cellMax[by * NX + bx]);
  // The core is a contiguous run of thick cells. Start at the thickest slice of the body and
  // propagate toward nose and tail, searching each slice only within the neighbour's core so
  // a thick fin (pelvic filaments, pectorals) can't capture the core of a thin flat body.
  const colMaxOf = (bx) => { let m = 0; for (let by = 0; by < NY; by++) m = Math.max(m, cellMax[by * NX + bx]); return m; };
  const coreA = new Int32Array(NX), coreB = new Int32Array(NX);
  let startBx = 0, startBy = 0;
  {
    // thickest cell in the middle third of the length
    let bestV = -1;
    for (let bx = Math.floor(NX * 0.2); bx < Math.floor(NX * 0.55); bx++) for (let by = Math.floor(NY * 0.2); by < Math.floor(NY * 0.8); by++) {
      if (cellMax[by * NX + bx] > bestV) { bestV = cellMax[by * NX + bx]; startBx = bx; startBy = by; }
    }
  }
  const grow = (bx, lo0, hi0) => {
    const colMax = colMaxOf(bx);
    const thr = Math.max(0.05 * gmax, 0.3 * colMax);
    let best = -1;
    for (let by = lo0; by <= hi0; by++) if (best < 0 || cellMax[by * NX + bx] > cellMax[best * NX + bx]) best = by;
    let a = best, b = best;
    while (a > 0 && cellMax[(a - 1) * NX + bx] > thr) a--;
    while (b < NY - 1 && cellMax[(b + 1) * NX + bx] > thr) b++;
    coreA[bx] = a; coreB[bx] = b;
    width[bx] = colMax;
  };
  grow(startBx, startBy, startBy);
  for (let bx = startBx + 1; bx < NX; bx++) grow(bx, coreA[bx - 1], coreB[bx - 1]);
  for (let bx = startBx - 1; bx >= 0; bx--) grow(bx, coreA[bx + 1], coreB[bx + 1]);
  for (let bx = 0; bx < NX; bx++) {
    ylo[bx] = bb.min.y + (coreA[bx] / NY) * H; yhi[bx] = bb.min.y + ((coreB[bx] + 1) / NY) * H;
  }
  // smooth the core profile along the body to avoid seams between bins
  const smooth = (arr) => { const o = arr.slice(); for (let i = 1; i < NX - 1; i++) o[i] = (arr[i - 1] + 2 * arr[i] + arr[i + 1]) / 4; return o; };
  const lo = smooth(ylo), hi = smooth(yhi);
  // body half-width per bin (median of |z| over thick cells; pectorals are outliers)
  const bodyW = new Float32Array(NX);
  for (let bx = 0; bx < NX; bx++) {
    const vals = [];
    for (let by = 0; by < NY; by++) { const y = bb.min.y + ((by + 0.5) / NY) * H; if (y >= ylo[bx] && y <= yhi[bx]) vals.push(cellMax[by * NX + bx]); }
    vals.sort((p, q) => p - q);
    bodyW[bx] = vals.length ? vals[Math.floor(vals.length * 0.6)] : 0;
  }
  const finAttr = new Float32Array(n * 4), sideAttr = new Float32Array(n);
  const finDist = 0.16 * H; // distance outside the core over which fin flexibility ramps up
  const interp = (arr, fx) => { const i = clamp(Math.floor(fx), 0, NX - 2), u = clamp(fx - i, 0, 1); return arr[i] * (1 - u) + arr[i + 1] * u; };
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = (x - bb.min.x) / L;
    const fx = s * NX - 0.5;
    const l = interp(lo, fx), h = interp(hi, fx);
    const out = y < l ? l - y : y > h ? y - h : 0;
    const fin = smoothstep(0, finDist, out);
    const caudal = smoothstep(cfg.caudalStart - 0.03, cfg.caudalStart + 0.12, s);
    const bw = interp(bodyW, fx);
    const pr = cfg.pectoral;
    const inPec = smoothstep(pr.s[0] - 0.03, pr.s[0] + 0.03, s) * (1 - smoothstep(pr.s[1] - 0.03, pr.s[1] + 0.05, s));
    const pec = inPec * smoothstep(bw * (0.85 + pr.minOut * 0.2), bw * (1.1 + pr.minOut * 0.4) + 0.01 * L, Math.abs(z)) * (1 - fin);
    finAttr[i * 4] = s; finAttr[i * 4 + 1] = fin; finAttr[i * 4 + 2] = caudal; finAttr[i * 4 + 3] = pec;
    sideAttr[i] = z >= 0 ? 1 : -1;
  }
  geometry.setAttribute('aFin', new THREE.BufferAttribute(finAttr, 4));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sideAttr, 1));

  // collision spheres (model units, relative to the body centre) covering the silhouette
  // Centre the full silhouette. A thin middle slice can be a fin rather than body (betta),
  // putting the old pivot below the fish and greatly inflating its navigation bounds.
  const center = bb.getCenter(new THREE.Vector3());
  const spheres = [];
  const SX = 5;
  for (let k = 0; k < SX; k++) {
    const x0 = bb.min.x + (k / SX) * L, x1 = bb.min.x + ((k + 1) / SX) * L;
    const cb = new THREE.Box3();
    for (let i = 0; i < n; i++) { const x = pos.getX(i); if (x >= x0 && x <= x1) cb.expandByPoint(new THREE.Vector3(x, pos.getY(i), pos.getZ(i))); }
    if (cb.isEmpty()) continue;
    const sz = cb.getSize(new THREE.Vector3());
    const rows = sz.y > 1.6 * sz.x ? Math.ceil(sz.y / (sz.x * 1.1)) : 1;
    for (let r = 0; r < rows; r++) {
      const ya = cb.min.y + (r / rows) * sz.y, yb = cb.min.y + ((r + 1) / rows) * sz.y;
      const c = new THREE.Vector3((cb.min.x + cb.max.x) / 2, (ya + yb) / 2, 0);
      const rad = 0.5 * Math.hypot(sz.x, yb - ya, Math.min(sz.z, 0.35 * L));
      spheres.push({ c: c.sub(center), r: rad });
    }
  }
  return { L, H, center, spheres, bbox: bb.clone() };
}

export function applyFishDeformer(mesh, rig, cfg) {
  const uniforms = {
    uPhase: { value: 0 }, uBodyAmp: { value: 0 }, uBend: { value: 0 },
    uFinPhase: { value: 0 }, uFinAmp: { value: 0 }, uPecPhase: { value: 0 }, uPecAmp: { value: 0 },
    uTrail: { value: 0 }, uLift: { value: 0 }, uFlow: { value: 0 },
  };
  const f = (v) => v.toFixed(5);
  const flowing = cfg.flowing ? 1.0 : 0.0;
  const decl = /* glsl */ `
attribute vec4 aFin; attribute float aSide;
uniform float uPhase, uBodyAmp, uBend, uFinPhase, uFinAmp, uPecPhase, uPecAmp, uTrail, uLift, uFlow;
float fishLat(float s, float fin, float cau, float pec, float side) {
  const float L = ${f(rig.L)};
  float env = pow(smoothstep(0.22, 1.0, s), 1.5);              // head stays stable
  float w = 6.2831 * s * 0.85 - uPhase;
  float lat = uBodyAmp * L * env * sin(w);
  lat += uBend * L * pow(max(s - 0.3, 0.0), 2.0);                // curvature while turning
  // caudal fin: extra lag and flexibility toward the trailing edge
  float edge = cau * smoothstep(${f(cfg.caudalStart)}, 1.0, s);
  lat += uBodyAmp * L * (0.35 + ${f(flowing)} * 0.6) * edge * sin(w - 1.3 * edge);
  // dorsal/anal/pelvic: delayed travelling wave growing toward the fin edge, rooted at the body
  lat += uFinAmp * L * 0.06 * fin * fin * sin(uFinPhase + 6.2831 * s * 1.3 - fin * (1.6 + ${f(flowing)} * 1.4));
  // pectoral sculling, alternating sides
  lat += pec * uPecAmp * L * 0.05 * sin(uPecPhase + side * 1.4);
  return lat;
}`;
  const body = /* glsl */ `
  {
    float lat = fishLat(aFin.x, aFin.y, aFin.z, aFin.w, aSide);
    transformed.z += lat;
    // fins and filaments trail backward with speed and droop slightly when hovering
    float fin = aFin.y;
    transformed.x += ${f(rig.L)} * fin * fin * (uTrail * 0.05 + 0.01 * sin(uFinPhase * 0.5 + aFin.x * 4.0));
    transformed.y += ${f(rig.L)} * fin * fin * uLift * 0.02;
    transformed.x += aFin.w * uPecAmp * ${f(rig.L)} * 0.02 * cos(uPecPhase + aSide * 1.4);
  }`;
  const normalBody = /* glsl */ `
  {
    float ds = 0.004;
    float l0 = fishLat(aFin.x - ds, aFin.y, aFin.z, aFin.w, aSide);
    float l1 = fishLat(aFin.x + ds, aFin.y, aFin.z, aFin.w, aSide);
    float slope = (l1 - l0) / (2.0 * ds * ${f(rig.L)});
    objectNormal = normalize(vec3(objectNormal.x - slope * objectNormal.z, objectNormal.y, objectNormal.z));
  }`;
  applyDeformer(mesh, 'fish', { uniforms, decl, body, normalBody });
  inflateBounds(mesh.geometry, rig.L * 0.25);
  return uniforms;
}
