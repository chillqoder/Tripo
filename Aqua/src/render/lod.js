// Reduced-detail proxies (tools/prepare-assets.mjs) used only by the shadow and refraction
// capture passes. The main camera renders the full-resolution supplied mesh (LAYER_FULL);
// the proxy (LAYER_PROXY) is a child with identity transform sharing the same material and
// deformation uniforms, so both always show the same pose.
import * as THREE from 'three';

export const LAYER_FULL = 2;
export const LAYER_PROXY = 3;

// meshopt simplification keeps a subset of the original vertices, so per-vertex rig data can be
// copied by exact position; any unmatched vertex takes its nearest original neighbour.
export function copyAttributesByPosition(full, proxy, names) {
  const fp = full.attributes.position, pp = proxy.attributes.position;
  const key = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
  const map = new Map();
  for (let i = 0; i < fp.count; i++) map.set(key(fp.getX(i), fp.getY(i), fp.getZ(i)), i);
  // coarse grid for the nearest-neighbour fallback
  const cell = 0.02, grid = new Map();
  const gk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < fp.count; i++) { const k = gk(fp.getX(i), fp.getY(i), fp.getZ(i)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
  const src = names.map((n) => full.attributes[n]);
  const dst = src.map((a) => new a.array.constructor(pp.count * a.itemSize));
  let fallback = 0;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    let j = map.get(key(x, y, z));
    if (j === undefined) {
      fallback++;
      let best = Infinity;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const k of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
          const d = (fp.getX(k) - x) ** 2 + (fp.getY(k) - y) ** 2 + (fp.getZ(k) - z) ** 2;
          if (d < best) { best = d; j = k; }
        }
      }
      if (j === undefined) j = 0;
    }
    src.forEach((a, n) => { for (let c = 0; c < a.itemSize; c++) dst[n][i * a.itemSize + c] = a.array[j * a.itemSize + c]; });
  }
  names.forEach((n, k) => proxy.setAttribute(n, new THREE.BufferAttribute(dst[k], src[k].itemSize, src[k].normalized)));
  return fallback;
}

export function attachProxy(mesh, proxyGeometry, offset) {
  if (!proxyGeometry) return null;
  const geo = proxyGeometry.clone();
  if (offset) geo.translate(offset.x, offset.y, offset.z);
  let proxy;
  if (mesh.isSkinnedMesh) {
    copyAttributesByPosition(mesh.geometry, geo, ['skinIndex', 'skinWeight']);
    proxy = new THREE.SkinnedMesh(geo, mesh.material);
    proxy.bind(mesh.skeleton, new THREE.Matrix4());
  } else {
    const extra = Object.keys(mesh.geometry.attributes).filter((n) => !['position', 'normal', 'uv'].includes(n));
    if (extra.length) copyAttributesByPosition(mesh.geometry, geo, extra);
    proxy = new THREE.Mesh(geo, mesh.material);
  }
  geo.boundingSphere = mesh.geometry.boundingSphere?.clone() ?? null;
  geo.boundingBox = mesh.geometry.boundingBox?.clone() ?? null;
  proxy.name = `${mesh.name}-proxy`;
  proxy.customDepthMaterial = mesh.customDepthMaterial;
  proxy.customDistanceMaterial = mesh.customDistanceMaterial;
  proxy.castShadow = mesh.castShadow;
  proxy.receiveShadow = false;
  proxy.frustumCulled = mesh.frustumCulled;
  proxy.layers.set(LAYER_PROXY);
  mesh.castShadow = false;
  mesh.layers.set(LAYER_FULL);
  mesh.add(proxy);
  return proxy;
}
