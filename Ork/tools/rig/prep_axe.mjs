// Normalise the supplied axe GLB into a canonical, documented frame (textures untouched):
//   +Y  = along the handle towards the axe head
//   +X  = towards the cutting edge (blade side)
//   +Z  = X x Y (blade face normal)
//   origin = point on the handle axis chosen as the grip centre (lower-to-middle of the wrapped grip)
// The handle axis is fitted through the wrapped-grip zone (the handle is slightly S-curved),
// so the grip zone is dead straight along +Y after the transform.  Scale is NOT baked in;
// the application applies one uniform scale (see src/config.js) so the proportions stay original.
//
// Run: node tools/rig/prep_axe.mjs
import { NodeIO } from '@gltf-transform/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(root, 'medieval+battle+axe+3d+model.glb');
const OUT = path.join(root, 'public/assets/models/axe_prepared.glb');

const io = new NodeIO();
const doc = await io.read(SRC);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const nor = prim.getAttribute('NORMAL');
const n = pos.getCount();
const P = new Float64Array(n * 3);
for (let i = 0; i < n; i++) { const v = pos.getElement(i, []); P[3 * i] = v[0]; P[3 * i + 1] = v[1]; P[3 * i + 2] = v[2]; }

// --- principal axes by power iteration on the covariance -------------------------------------
const mean = [0, 0, 0];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k] += P[3 * i + k] / n;
const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (let i = 0; i < n; i++) {
  const d = [P[3 * i] - mean[0], P[3 * i + 1] - mean[1], P[3 * i + 2] - mean[2]];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] / n;
}
const mul = (M, v) => [0, 1, 2].map(a => M[a][0] * v[0] + M[a][1] * v[1] + M[a][2] * v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v); return v.map(x => x / l); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => a.map(x => x * s);
let a0 = norm([1, 0.3, 0.2]);
for (let it = 0; it < 200; it++) a0 = norm(mul(C, a0));
// deflate for the second axis
const l0 = dot(a0, mul(C, a0));
const C2 = C.map((r, a) => r.map((x, b) => x - l0 * a0[a] * a0[b]));
let a1 = norm([0.1, 1, 0.3]);
for (let it = 0; it < 200; it++) a1 = norm(mul(C2, a1));

// --- orientation: Y = a0 oriented towards the head (head side has the larger mass/extent) ------
const proj = new Float64Array(n);
for (let i = 0; i < n; i++) proj[i] = dot(sub([P[3 * i], P[3 * i + 1], P[3 * i + 2]], mean), a0);
let tmin = Infinity, tmax = -Infinity;
for (const t of proj) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
// the head (wide part) is at the end where the cross-section is widest -> compare spread in each third
const spread = (lo, hi) => {
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) if (proj[i] >= lo && proj[i] < hi) {
    const d = sub([P[3 * i], P[3 * i + 1], P[3 * i + 2]], mean);
    s += Math.abs(dot(d, a1)); c++;
  }
  return s / Math.max(c, 1);
};
const third = (tmax - tmin) / 3;
let Y = a0;
if (spread(tmin, tmin + third) > spread(tmax - third, tmax)) Y = scale(a0, -1);
const flip = Y[0] === a0[0] ? 1 : -1;
// --- handle centre line through the wrapped-grip zone --------------------------------------
// The grip zone in the original data is t = [-0.50, -0.05] relative to the head-side axis; with the
// orientation chosen above, use the lower 5%..42% of the length (pommel flare excluded).
const L = tmax - tmin;
const tOf = (i) => flip * proj[i];            // coordinate along Y (increasing towards head)
let tlo = Infinity, thi = -Infinity;
for (let i = 0; i < n; i++) { const t = tOf(i); tlo = Math.min(tlo, t); thi = Math.max(thi, t); }
const gz0 = tlo + 0.20 * L, gz1 = tlo + 0.56 * L;
// per-slab centroids
const slabs = 24;
const pts = [];
for (let s = 0; s < slabs; s++) {
  const lo = gz0 + (gz1 - gz0) * s / slabs, hi = gz0 + (gz1 - gz0) * (s + 1) / slabs;
  let c = [0, 0, 0], m = 0;
  for (let i = 0; i < n; i++) { const t = tOf(i); if (t >= lo && t < hi) { c = add(c, [P[3 * i], P[3 * i + 1], P[3 * i + 2]]); m++; } }
  if (m) pts.push({ t: (lo + hi) / 2, c: scale(c, 1 / m) });
}
// least-squares line  c(t) = c0 + t * d
const tm = pts.reduce((a, p) => a + p.t, 0) / pts.length;
const cm = scale(pts.reduce((a, p) => add(a, p.c), [0, 0, 0]), 1 / pts.length);
let num = [0, 0, 0], den = 0;
for (const p of pts) { const dt = p.t - tm; num = add(num, scale(sub(p.c, cm), dt)); den += dt * dt; }
const dH = norm(scale(num, 1 / den));
// ensure dH points towards the head, within a few degrees of Y
if (dot(dH, Y) < 0) { for (let k = 0; k < 3; k++) dH[k] *= -1; }
Y = dH;
// --- edge direction: blade extends further to one side along a1' (component of a1 perpendicular to Y)
let ex = sub(a1, scale(Y, dot(a1, Y))); ex = norm(ex);
let sPlus = 0, sMinus = 0;
for (let i = 0; i < n; i++) {
  const d = sub([P[3 * i], P[3 * i + 1], P[3 * i + 2]], mean);
  const x = dot(d, ex), y = dot(d, Y);
  if (y > L * 0.10) { if (x > 0) sPlus = Math.max(sPlus, x); else sMinus = Math.max(sMinus, -x); }
}
const X = sPlus > sMinus ? ex : scale(ex, -1);
const Z = cross(X, Y);
// --- grip centre on the fitted line ----------------------------------------------------------
const tGrip = tlo + 0.355 * L;                // lower-to-middle of the handle
const G = add(cm, scale(Y, tGrip - tm));       // point on the line at t = tGrip (note c(t)=cm+(t-tm)*Y, Y unit)
// --- transform: p' = [ (p-G).X, (p-G).Y, (p-G).Z ] --------------------------------------------
const info = {};
const outP = new Float32Array(n * 3);
let bb = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (let i = 0; i < n; i++) {
  const d = sub([P[3 * i], P[3 * i + 1], P[3 * i + 2]], G);
  const q = [dot(d, X), dot(d, Y), dot(d, Z)];
  outP.set(q, 3 * i);
  for (let k = 0; k < 3; k++) { bb.min[k] = Math.min(bb.min[k], q[k]); bb.max[k] = Math.max(bb.max[k], q[k]); }
}
pos.setArray(outP);
if (nor) {
  const outN = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = nor.getElement(i, []);
    outN.set([dot(v, X), dot(v, Y), dot(v, Z)], 3 * i);
  }
  nor.setArray(outN);
}
// flatten the node transform (translation baked into the vertices above)
for (const node of doc.getRoot().listNodes()) { node.setTranslation([0, 0, 0]); node.setRotation([0, 0, 0, 1]); node.setScale([1, 1, 1]); }

// --- handle radius measured around the grip centre ---------------------------------------------
let rs = [];
for (let i = 0; i < n; i++) {
  const x = outP[3 * i], y = outP[3 * i + 1], z = outP[3 * i + 2];
  if (Math.abs(y) < 0.06) rs.push(Math.hypot(x, z));
}
rs.sort((a, b) => a - b);
const handleRadius = rs[Math.floor(rs.length * 0.5)];
const handleRadiusMax = rs[Math.floor(rs.length * 0.95)];
doc.getRoot().getAsset().extras = Object.assign({}, doc.getRoot().getAsset().extras, {
  canonicalFrame: '+Y handle->head, +X cutting edge, +Z = X x Y, origin = grip centre on handle axis',
  originalUnits: true, bbox: bb, handleRadiusMedian: handleRadius, handleRadius95: handleRadiusMax,
  gripCenterT: tGrip, length: L,
});
await io.write(OUT, doc);
console.log(JSON.stringify({ L, X, Y, Z, G, bbox: bb, handleRadiusMedian: handleRadius, handleRadius95: handleRadiusMax,
  handleAxisTiltDeg: Math.acos(Math.min(1, Math.abs(dot(Y, a0)))) * 180 / Math.PI }, null, 2));
