// Orbit camera constrained to stay outside the whole tank + pedestal volume.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK } from '../config/scene.js';

export const DEFAULT_VIEW = { pos: new THREE.Vector3(9.6, 9.2, 17.2), target: new THREE.Vector3(0, 2.9, 0) };

export function createCameraRig(camera, dom, outer) {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 38;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  const keepOut = new THREE.Box3(
    new THREE.Vector3(-outer.hx - 0.35, outer.bottom - 1, -outer.hz - 0.35),
    new THREE.Vector3(outer.hx + 0.35, outer.top + 0.35, outer.hz + 0.35),
  );
  const tMin = new THREE.Vector3(-TANK.hx + 1, 0.6, -TANK.hz + 0.8), tMax = new THREE.Vector3(TANK.hx - 1, TANK.h - 0.5, TANK.hz - 0.8);
  const ray = new THREE.Ray(), hit = new THREE.Vector3(), dir = new THREE.Vector3();
  const constrain = () => {
    controls.target.clamp(tMin, tMax);
    if (keepOut.containsPoint(camera.position)) {
      // move the camera back out along the view line (target is inside the box)
      dir.copy(camera.position).sub(controls.target).normalize();
      ray.set(controls.target, dir);
      // exit point of a ray starting inside: intersect from the far side
      const far = controls.target.clone().addScaledVector(dir, 200);
      ray.set(far, dir.clone().negate());
      if (ray.intersectBox(keepOut, hit)) camera.position.copy(hit).addScaledVector(dir, 0.02);
    }
    camera.position.y = Math.max(camera.position.y, outer.bottom + 0.6);
  };
  controls.addEventListener('change', constrain);
  const reset = () => {
    // on portrait screens the FOV cap is reached; step back so the whole tank stays framed
    const k = camera.aspect < 0.9 ? 1 + (0.9 - camera.aspect) * 0.75 : 1;
    camera.position.copy(DEFAULT_VIEW.pos).sub(DEFAULT_VIEW.target).multiplyScalar(k).add(DEFAULT_VIEW.target);
    controls.target.copy(DEFAULT_VIEW.target);
    controls.update();
  };
  return { controls, reset, constrain };
}

// fit the default framing to narrow screens by widening the vertical FOV
export function fitCamera(camera, w, h) {
  camera.aspect = w / h;
  const baseFov = 40;
  camera.fov = camera.aspect < 1.45 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * 1.45 / camera.aspect)) : baseFov;
  camera.fov = Math.min(camera.fov, 68);
  camera.updateProjectionMatrix();
}
