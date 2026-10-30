// Geometry measurements used to author src/config/assets.js (attachment points, masks, proxies).
//   node tools/analyze-assets.mjs > tools/asset-analysis.txt
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import path from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const load = async (f) => {
  const doc = await io.read(path.resolve('public/models', f));
  const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  return { pos: p.getAttribute('POSITION').getArray(), idx: p.getIndices().getArray() };
};
const f3 = (v) => v.map((x) => x.toFixed(3)).join(',');

function comps(pos, idx) {
  const n = pos.length / 3, key = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let id = key.get(k); if (id === undefined) { id = key.size; key.set(k, id); } wid[i] = id;
  }
  const par = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(wid[idx[t]]); par[a] = find(wid[idx[t + 1]]); const b = find(wid[idx[t]]); par[b] = find(wid[idx[t + 2]]); }
  const sizes = new Map(); const bb = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(wid[i]); sizes.set(r, (sizes.get(r) || 0) + 1);
    let b = bb.get(r); if (!b) { b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; bb.set(r, b); }
    for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], pos[i * 3 + a]); b[a + 3] = Math.max(b[a + 3], pos[i * 3 + a]); }
  }
  return [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([r, s]) => ({ verts: s, bb: bb.get(r) }));
}

// 1. aerator: top region extremes (outlet of elbow)
{
  const { pos } = await load('sponge+air+filter+3d+model.glb');
  let top = [], n = pos.length / 3;
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1] > 0.8) top.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  const ext = (a, s) => top.reduce((m, p) => (s * p[a] > s * m[a] ? p : m));
  console.log('AERATOR top verts', top.length, 'minX', f3(ext(0, -1)), 'maxX', f3(ext(0, 1)), 'minZ', f3(ext(2, -1)), 'maxZ', f3(ext(2, 1)), 'maxY', f3(ext(1, 1)));
  // slice profile of tube radius per height
  for (let y = 0; y <= 1.0; y += 0.05) {
    const s = []; for (let i = 0; i < n; i++) if (Math.abs(pos[i * 3 + 1] - y) < 0.01) s.push([pos[i * 3], pos[i * 3 + 2]]);
    if (!s.length) continue;
    const xs = s.map((p) => p[0]), zs = s.map((p) => p[1]);
    console.log(`  y=${y.toFixed(2)} x[${Math.min(...xs).toFixed(3)},${Math.max(...xs).toFixed(3)}] z[${Math.min(...zs).toFixed(3)},${Math.max(...zs).toFixed(3)}]`);
  }
}
// 2. castle: is the arch a through-opening? count verts in a thin column through the arch along Z
{
  const { pos, idx } = await load('medieval+castle+3d+model.glb');
  const n = pos.length / 3;
  // ray-cast along -Z at points of a grid near x=0 low y, count triangle hits
  const hit = (ox, oy) => {
    let c = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[d], cy = pos[d + 1];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
      const l1 = ((by - cy) * (ox - cx) + (cx - bx) * (oy - cy)) / den, l2 = ((cy - ay) * (ox - cx) + (ax - cx) * (oy - cy)) / den;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) c++;
    }
    return c;
  };
  let row = '';
  for (let y = 0.0; y <= 0.32; y += 0.02) { row = `  y=${y.toFixed(2)} `; for (let x = -0.12; x <= 0.12; x += 0.02) row += hit(x, y) ? '#' : '.'; console.log(row); }
  console.log('CASTLE arch grid above (x -0.12..0.12): "." = clear line of sight through whole depth');
  let fx = [Infinity, -Infinity];
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < 0.03) { fx[0] = Math.min(fx[0], pos[i * 3]); fx[1] = Math.max(fx[1], pos[i * 3]); }
  // tower tops: max y per x bin
  let prof = '';
  for (let x = -0.5; x < 0.5; x += 0.05) { let m = 0; for (let i = 0; i < n; i++) if (pos[i * 3] >= x && pos[i * 3] < x + 0.05) m = Math.max(m, pos[i * 3 + 1]); prof += m.toFixed(2) + ' '; }
  console.log('CASTLE height profile per 0.05 x bin from -0.5:', prof);
}
// 3. snails: foot plane = PCA of lowest-surface vertices (min along local normal) ; report low vertices
for (const f of ['snail+3d+model.glb', 'snail+3d+model 2.glb']) {
  const { pos } = await load(f);
  const n = pos.length / 3;
  // foot candidate: vertices within 0.03 of the lower envelope in each x-bin
  const bins = 40, lo = new Array(bins).fill(Infinity);
  for (let i = 0; i < n; i++) { const b = Math.min(bins - 1, Math.floor((pos[i * 3] + 0.5) * bins)); lo[b] = Math.min(lo[b], pos[i * 3 + 1]); }
  console.log(`SNAIL ${f} lower envelope y per x-bin:`, lo.map((v) => (v === Infinity ? '-' : v.toFixed(2))).join(' '));
  let hy = [Infinity, -Infinity]; for (let i = 0; i < n; i++) if (pos[i * 3] < -0.4) { hy[0] = Math.min(hy[0], pos[i * 3 + 1]); hy[1] = Math.max(hy[1], pos[i * 3 + 1]); }
  console.log('  head region (x<-0.4) y range', f3(hy));
}
// 4. component counts
for (const f of ['crab+3d+model.glb', 'grass+plant+3d+model.glb', 'green+leafy+plant+3d+model.glb', 'green+plant+3d+model.glb', 'aquatic+plant+3d+model.glb', 'guppy+fish+3d+model.glb', 'betta+fish+3d+model.glb', 'freshwater+angelfish+3d+model.glb', 'orange+clownfish+3d+model.glb']) {
  const { pos, idx } = await load(f);
  const c = comps(pos, idx);
  console.log(`COMPONENTS ${f}: ${c.length}; largest:`, c.slice(0, 8).map((x) => `${x.verts}v[${f3(x.bb)}]`).join(' | '));
}
// 5. crab: lower envelope map top-down (leg layout)
{
  const { pos } = await load('crab+3d+model.glb');
  const n = pos.length / 3, G = 40, grid = Array.from({ length: G }, () => new Array(G).fill(-1));
  for (let i = 0; i < n; i++) {
    const gx = Math.floor((pos[i * 3] + 0.5) * G), gz = Math.floor((pos[i * 3 + 2] + 0.5) * G);
    if (gx >= 0 && gx < G && gz >= 0 && gz < G) grid[gz][gx] = Math.max(grid[gz][gx], pos[i * 3 + 1]);
  }
  console.log('CRAB top-down max-height map (rows z -0.5..0.5, cols x -0.5..0.5; digit = height*20):');
  for (const r of grid) console.log('  ' + r.map((v) => (v < 0 ? ' ' : Math.min(9, Math.floor(v * 20)).toString())).join(''));
  let feet = []; for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < 0.01) feet.push([pos[i * 3], pos[i * 3 + 2]]);
  console.log('  verts with y<0.01:', feet.length);
}
