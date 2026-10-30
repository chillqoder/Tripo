import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl, MANIFEST, SOURCE_ONLY, PROXIES } from '../config/assets.js';

// Loads every manifest entry, reporting byte-level progress. Failures are collected and
// reported by path instead of being silently replaced.
export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const entries = [...Object.entries(MANIFEST), ...PROXIES.map((k) => [`proxy:${k}`, `derived/lod/${k}.glb`])];
  const progress = new Map();
  const failed = [];
  const report = () => {
    let loaded = 0, total = 0;
    for (const p of progress.values()) { loaded += p.loaded; total += p.total || p.loaded || 1; }
    onProgress?.(total ? loaded / total : 0, failed);
  };
  // the original stone collections are only verified to exist; they are never rendered
  const sourceChecks = SOURCE_ONLY.map(async (f) => {
    // read only the GLB header to confirm the original collection is present and valid
    let error = null;
    try {
      const r = await fetch(assetUrl(f), { headers: { Range: 'bytes=0-11' } });
      const head = new Uint8Array(await r.arrayBuffer()).slice(0, 4);
      if (!r.ok) error = `HTTP ${r.status}`;
      else if (String.fromCharCode(...head) !== 'glTF') error = 'not a GLB file';
    } catch (e) { error = String(e.message || e); }
    if (error) failed.push({ key: f, url: assetUrl(f), error });
  });
  const results = await Promise.all(entries.map(([key, file]) => new Promise((resolve) => {
    const url = assetUrl(file);
    progress.set(key, { loaded: 0, total: 0 });
    loader.load(url, (gltf) => {
      const p = progress.get(key); p.loaded = p.total = Math.max(p.total, p.loaded, 1);
      report();
      resolve([key, prepareScene(gltf.scene)]);
    }, (e) => {
      progress.set(key, { loaded: e.loaded, total: e.total || e.loaded });
      report();
    }, (err) => {
      failed.push({ key, url, error: String(err?.message || err) });
      report();
      resolve([key, null]);
    });
  })));
  await Promise.all(sourceChecks);
  const assets = {};
  for (const [key, a] of results) if (!key.startsWith('proxy:')) assets[key] = a;
  for (const [key, a] of results) if (key.startsWith('proxy:') && a && assets[key.slice(6)]) assets[key.slice(6)].proxy = a.geometry;
  return { assets, failed };
}

// Strip anything that is not object geometry (none were found in the supplied files, but
// keep the guard) and bake node transforms so meshes can be treated as model-space data.
function prepareScene(root) {
  const remove = [];
  root.traverse((o) => { if (o.isCamera || o.isLight) remove.push(o); });
  remove.forEach((o) => o.parent.remove(o));
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const mesh = meshes[0];
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const mat = mesh.material;
  // Tripo exports metallic=1 scaled by a metal/rough texture that is mostly dielectric;
  // keep the texture but clamp the factor so bodies don't read as chrome under water.
  mat.metalness = Math.min(mat.metalness, 0.15);
  mat.envMapIntensity = 0.6;
  geometry.computeBoundingBox();
  return { geometry, material: mat, bbox: geometry.boundingBox.clone(), meshCount: meshes.length };
}

// Uniformly scale + recentre a model so `axis` measures `size`, with the base at y = 0.
export function normalizedScale(bbox, axis, size) {
  const s = new THREE.Vector3(); bbox.getSize(s);
  return size / s[axis];
}
