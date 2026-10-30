// Stage 2 preprocessing: split both three-stone collections into six independent stone GLBs.
//
//   npm run prepare-assets
//
// Input:  public/models/stone+rocks+3d+model.glb  (three small smooth pebbles)
//         public/models/stone+rock+3d+model.glb   (three large rough rocks)
// Output: public/models/derived/pebble-{0,1,2}.glb, rock-{0,1,2}.glb, plus derived/stones.json
//
// Method: the source stones are merged into a single primitive. Vertices are welded by
// quantised position (UV seams duplicate positions, so index connectivity alone would
// fragment one stone), triangles are grouped into connected components with union-find,
// and components are clustered into the three actual stones by spatial proximity
// (k-means on centroids weighted by triangle count). Each stone keeps its original
// vertices, UVs, normals and the shared material/textures; it is recentred on X/Z and
// its lowest point is moved to Y = 0 (the contact pivot). Pebbles are additionally
// simplified with meshoptimizer because they are instanced ~1000 times.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('public/models');
const OUT = path.join(SRC, 'derived');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function components(pos, idx) {
  const n = pos.length / 3;
  // weld by quantised position
  const key = new Map();
  const weldId = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    let id = key.get(k);
    if (id === undefined) { id = key.size; key.set(k, id); }
    weldId[i] = id;
  }
  const parent = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < idx.length; t += 3) {
    unite(weldId[idx[t]], weldId[idx[t + 1]]);
    unite(weldId[idx[t]], weldId[idx[t + 2]]);
  }
  const triComp = new Int32Array(idx.length / 3);
  const compMap = new Map();
  for (let t = 0; t < triComp.length; t++) {
    const r = find(weldId[idx[t * 3]]);
    let c = compMap.get(r);
    if (c === undefined) { c = compMap.size; compMap.set(r, c); }
    triComp[t] = c;
  }
  return { triComp, count: compMap.size };
}

function kmeans3(points, weights) {
  // deterministic init: three heaviest components that are mutually far apart
  const order = points.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);
  const centers = [points[order[0]]];
  for (const i of order) {
    if (centers.length === 3) break;
    if (centers.every((c) => Math.hypot(c[0] - points[i][0], c[2] - points[i][2]) > 0.15)) centers.push(points[i]);
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < 30; it++) {
    points.forEach((p, i) => {
      let best = 0, bd = Infinity;
      centers.forEach((c, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      assign[i] = best;
    });
    for (let k = 0; k < 3; k++) {
      let w = 0; const s = [0, 0, 0];
      points.forEach((p, i) => { if (assign[i] === k) { w += weights[i]; s[0] += p[0] * weights[i]; s[1] += p[1] * weights[i]; s[2] += p[2] * weights[i]; } });
      if (w > 0) centers[k] = s.map((v) => v / w);
    }
  }
  return assign;
}

async function splitCollection(file, prefix, targetTris) {
  const report = [];
  for (let s = 0; s < 3; s++) {
    // re-read for each stone so every output document is independent
    const doc = await io.read(path.join(SRC, file));
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const posA = prim.getAttribute('POSITION');
    const pos = posA.getArray();
    const idx = prim.getIndices().getArray();
    const { triComp, count } = components(pos, idx);
    // per-component centroid + weight
    const cent = Array.from({ length: count }, () => [0, 0, 0]);
    const w = new Float64Array(count);
    for (let t = 0; t < triComp.length; t++) {
      const c = triComp[t];
      for (let j = 0; j < 3; j++) { const v = idx[t * 3 + j]; cent[c][0] += pos[v * 3]; cent[c][1] += pos[v * 3 + 1]; cent[c][2] += pos[v * 3 + 2]; }
      w[c] += 1;
    }
    cent.forEach((c, i) => { c[0] /= w[i] * 3; c[1] /= w[i] * 3; c[2] /= w[i] * 3; });
    const assign = kmeans3(cent, Array.from(w));
    // stable stone order: sort clusters by x then z of their centroid
    const cc = [0, 1, 2].map((k) => { let W = 0, x = 0, z = 0; cent.forEach((c, i) => { if (assign[i] === k) { W += w[i]; x += c[0] * w[i]; z += c[2] * w[i]; } }); return { k, x: x / W, z: z / W, tris: W }; });
    cc.sort((a, b) => a.x - b.x || a.z - b.z);
    const keep = cc[s].k;
    const newIdx = [];
    for (let t = 0; t < triComp.length; t++) if (assign[triComp[t]] === keep) newIdx.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    const IdxType = idx.constructor;
    prim.getIndices().setArray(IdxType.from(newIdx));
    // bake: recentre X/Z on bounds centre, lowest point to y=0
    const used = new Set(newIdx);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const v of used) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[v * 3 + a]); mx[a] = Math.max(mx[a], pos[v * 3 + a]); }
    const off = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
    const np = pos.slice();
    for (let v = 0; v < np.length / 3; v++) for (let a = 0; a < 3; a++) np[v * 3 + a] -= off[a];
    posA.setArray(np);
    doc.getRoot().listNodes().forEach((n) => { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); });
    await doc.transform(prune({ keepAttributes: true }));
    if (targetTris) {
      await MeshoptSimplifier.ready;
      const ratio = Math.min(1, targetTris / (newIdx.length / 3));
      await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false }));
    }
    const fp = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const outName = `${prefix}-${s}.glb`;
    await io.write(path.join(OUT, outName), doc);
    report.push({
      file: outName, source: file, sourceComponents: count,
      sourceCentroid: [cc[s].x, cc[s].z].map((v) => +v.toFixed(3)), sourceTris: newIdx.length / 3,
      tris: fp.getIndices().getCount() / 3,
      size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +v.toFixed(4)),
    });
    console.log(outName, JSON.stringify(report.at(-1)));
  }
  return report;
}

const pebbles = await splitCollection('stone+rocks+3d+model.glb', 'pebble', 180);
const rocks = await splitCollection('stone+rock+3d+model.glb', 'rock', 12000);
fs.writeFileSync(path.join(OUT, 'stones.json'), JSON.stringify({ pebbles, rocks }, null, 2));
console.log('wrote', OUT);

// ---- reduced-detail proxies for the shadow and refraction-capture passes ----------------
// Same geometry family as the originals (meshoptimizer simplification of the supplied mesh,
// UVs preserved), textures stripped: at runtime the proxy shares the original's material.
// The main camera always renders the full-resolution original.
const LOD = {
  guppy: 'guppy+fish+3d+model.glb', clownfish: 'orange+clownfish+3d+model.glb',
  angelfish: 'freshwater+angelfish+3d+model.glb', betta: 'betta+fish+3d+model.glb',
  crab: 'crab+3d+model.glb', snailBottom: 'snail+3d+model.glb', snailGlass: 'snail+3d+model 2.glb',
  vallisneria: 'grass+plant+3d+model.glb', anubias: 'green+leafy+plant+3d+model.glb',
  javaFern: 'green+plant+3d+model.glb', cabomba: 'aquatic+plant+3d+model.glb',
  castle: 'medieval+castle+3d+model.glb', aerator: 'sponge+air+filter+3d+model.glb',
};
fs.mkdirSync(path.join(OUT, 'lod'), { recursive: true });
await MeshoptSimplifier.ready;
for (const [key, file] of Object.entries(LOD)) {
  const doc = await io.read(path.join(SRC, file));
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.004 }));
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await doc.transform(prune({ keepAttributes: true }));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  await io.write(path.join(OUT, 'lod', `${key}.glb`), doc);
  console.log('lod', key, prim.getIndices().getCount() / 3, 'tris');
}
