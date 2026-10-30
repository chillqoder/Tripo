import * as THREE from 'three';

/** Small deterministic PRNG so the rock and the clearing look the same on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noise3(x, y, z, rnd) {
  // cheap value-noise lattice
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + rnd * 17.3) * 43758.5453; return s - Math.floor(s); };
  const sm = (t) => t * t * (3 - 2 * t);
  let v = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    const w = (dx ? sm(fx) : 1 - sm(fx)) * (dy ? sm(fy) : 1 - sm(fy)) * (dz ? sm(fz) : 1 - sm(fz));
    v += w * h(ix + dx, iy + dy, iz + dz);
  }
  return v;
}

/** Procedural grey granite texture (canvas) used for the rock and small stones. */
export function makeStoneTexture(seed = 3, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = 0.55 * noise3(x / 28, y / 28, 0, seed) + 0.3 * noise3(x / 9, y / 9, 1, seed) + 0.15 * noise3(x / 3, y / 3, 2, seed);
    const speck = noise3(x / 2, y / 2, 5, seed) > 0.82 ? 24 : 0;
    const v = 95 + n * 85 + speck;
    const i = (y * size + x) * 4;
    img.data[i] = v * 0.96; img.data[i + 1] = v * 0.94; img.data[i + 2] = v * 0.88; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A partially exposed boulder embedded in the ground.  `top` = height of the highest point above ground.
 * Returns { mesh, surfaceAt(x,z) -> {point, normal} | null }.
 */
export function createRock({ position = new THREE.Vector3(-0.32, 0, 1.70), radius = 0.80, top = 0.44, seed = 11, texture } = {}) {
  const rnd = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const sx = 1.0, sy = 0.5, sz = 0.88;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = noise3(v.x * 2.2 + 3, v.y * 2.2 + 3, v.z * 2.2 + 3, seed);
    const n2 = noise3(v.x * 7 + 9, v.y * 7 + 9, v.z * 7 + 9, seed + 1);
    // blocky boulder: soften the sphere towards a rounded box and add multi-scale noise
    const bx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.8), by = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.85), bz = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.8);
    const r = radius * (0.85 + 0.30 * n + 0.06 * n2);
    p.setXYZ(i, bx * r * sx, by * r * sy, bz * r * sz);
  }
  geo.computeVertexNormals();
  // lift so that the highest vertex sits at `top` above the ground
  let maxY = -Infinity;
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
  const lift = top - maxY;
  const tex = texture || makeStoneTexture(seed);
  tex.repeat.set(2, 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.0, color: 0xb4ada0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, lift, position.z);
  mesh.rotation.y = rnd() * 6.28;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'ImpactRock';
  mesh.updateMatrixWorld(true);

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surfaceAt = (x, z) => {
    ray.set(new THREE.Vector3(x, 5, z), down);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
    return { point: hit.point.clone(), normal: n };
  };
  return { mesh, surfaceAt, top, center: position.clone() };
}
