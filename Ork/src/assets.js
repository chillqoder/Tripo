import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Load a GLB with progress reporting; rejects with a readable error. */
export function loadGLB(url, onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve(gltf),
      (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); },
      (err) => reject(new Error(`Could not load ${url}: ${err?.message || err}`)),
    );
  });
}

/** Make a loaded textured model render nicely (colour space, anisotropy, shadows). */
export function prepareModel(root, renderer) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) {
        if (m[k]) m[k].anisotropy = Math.min(8, maxAniso);
      }
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
}
