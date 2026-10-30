// Pooled bubble plume from the aerator outlet. Bubbles leave along the outlet direction,
// bend upward under buoyancy, drift with the current, and are recycled exactly where they
// meet the animated surface, spawning a ripple at that position.
import * as THREE from 'three';
import { surfaceHeight, addRipple } from './surface.js';
import { currentAt } from './current.js';
import { bubbleMaterial } from '../render/optics.js';
import { LAYER_OPTICS } from './tank.js';
import { rng } from '../core/random.js';
import { TANK } from '../config/scene.js';

const MAX = 140;

export class Bubbles {
  constructor(scene, optics, outlet) {
    this.outlet = outlet;
    this.r = rng(99);
    this.pool = Array.from({ length: MAX }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rad: 0, wob: 0, ph: 0, age: 0 }));
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), bubbleMaterial(optics), MAX);
    this.mesh.name = 'bubbles';
    this.mesh.layers.set(LAYER_OPTICS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.timer = 0;
    this.burst = 0;
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpS = new THREE.Vector3();
    this.cur = new THREE.Vector3();
    this.arrivals = 0;
  }

  spawn() {
    const b = this.pool.find((x) => !x.alive);
    if (!b) return;
    const r = this.r, o = this.outlet;
    b.alive = true;
    b.rad = 0.024 + Math.pow(r(), 2.2) * 0.055;
    b.p.copy(o.pos).addScaledVector(o.dir, 0.02).add(this.tmpS.set((r() - 0.5) * 0.03, (r() - 0.5) * 0.02, (r() - 0.5) * 0.03));
    b.v.copy(o.dir).multiplyScalar(0.28 + r() * 0.15);
    b.v.y += 0.05;
    b.wob = 0.6 + r() * 0.8; b.ph = r() * 6.28; b.age = 0;
    b.terminal = 0.32 + b.rad * 6 + r() * 0.08; // larger bubbles rise faster
  }

  update(dt, t) {
    // irregular emission around ~15 bubbles/s with small bursts
    this.timer -= dt;
    while (this.timer <= 0) {
      this.spawn();
      if (this.r() < 0.12) this.burst = 2 + Math.floor(this.r() * 3);
      this.timer += this.burst-- > 0 ? 0.02 : 0.04 + this.r() * 0.085;
    }
    let n = 0;
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.age += dt;
      currentAt(b.p.x, b.p.y, b.p.z, t, this.cur);
      // buoyancy toward terminal rise speed, drag on horizontal motion (outlet jet decays)
      b.v.y += (b.terminal - b.v.y) * Math.min(1, dt * 3.0);
      b.v.x += (this.cur.x * 0.8 - b.v.x) * Math.min(1, dt * 1.8);
      b.v.z += (this.cur.z * 0.8 - b.v.z) * Math.min(1, dt * 1.8);
      const wob = Math.sin(b.age * 9.0 * b.wob + b.ph) * 0.06 * b.wob;
      b.p.x += (b.v.x + wob * Math.cos(b.ph)) * dt;
      b.p.z += (b.v.z + wob * Math.sin(b.ph)) * dt;
      b.p.y += b.v.y * dt;
      b.p.x = Math.max(-TANK.hx + 0.05, Math.min(TANK.hx - 0.05, b.p.x));
      b.p.z = Math.max(-TANK.hz + 0.05, Math.min(TANK.hz - 0.05, b.p.z));
      const grow = 1 + Math.min(0.12, b.age * 0.012); // slight expansion as pressure drops
      const s = surfaceHeight(b.p.x, b.p.z, t);
      if (b.p.y + b.rad * grow >= s) {
        b.alive = false;
        addRipple(b.p.x, b.p.z, t, 0.007 + b.rad * 0.1);
        this.arrivals++;
        continue;
      }
      // mild flattening along the direction of travel
      this.tmpS.set(b.rad * grow * 1.06, b.rad * grow * 0.9, b.rad * grow * 1.06);
      this.tmpQ.setFromAxisAngle(this.cur.set(0, 0, 1), wob * 0.8);
      this.tmpM.compose(b.p, this.tmpQ, this.tmpS);
      this.mesh.setMatrixAt(n++, this.tmpM);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
