// Helper for GPU vertex deformation that stays consistent in the shadow/depth passes.
// A deformer supplies uniforms, extra GLSL declarations and a body operating on
// `transformed` (and optionally `objectNormal`) in model space, from immutable rest data
// (the geometry is never modified, so no drift can accumulate).
import * as THREE from 'three';
import { addPatch } from '../render/materials.js';

export function applyDeformer(mesh, key, { uniforms, decl, body, normalBody = '' }) {
  const patch = (withNormal) => (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${decl}`);
    if (withNormal && normalBody && vs.includes('#include <beginnormal_vertex>')) {
      // run the deformation once, before normals are consumed, and reuse it
      vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  vec3 dfRest = position;
  vec3 dfPos = position;
  ${body.replaceAll('transformed', 'dfPos')}
  ${normalBody}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = dfPos;');
    } else {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 dfRest = position;
  ${body}`);
    }
    shader.vertexShader = vs;
  };
  addPatch(mesh.material, key, patch(true));
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  if (mesh.material.alphaTest) depth.alphaTest = mesh.material.alphaTest;
  addPatch(depth, key, patch(false));
  mesh.customDepthMaterial = depth;
  const dist = new THREE.MeshDistanceMaterial();
  addPatch(dist, key, patch(false));
  mesh.customDistanceMaterial = dist;
}

// Conservative bounds so deformed parts are never culled.
export function inflateBounds(geometry, margin) {
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += margin;
  geometry.computeBoundingBox();
  geometry.boundingBox.expandByScalar(margin);
}
