// Two snails: one crawling on the bed, one attached to the inside of the front pane.
// Shells stay rigid; head/tentacles extend and explore and the sole ripples, via a vertex
// deformer driven by masks measured on each model.
import * as THREE from 'three';
import { SNAILS } from '../config/assets.js';
import { TANK, LAYOUT } from '../config/scene.js';
import { applyDeformer, inflateBounds } from './deform.js';
import { patchUnderwater, globals } from '../render/materials.js';
import { rebase } from '../world/decor.js';
import { rng, clamp } from '../core/random.js';
import { attachProxy } from '../render/lod.js';

function rigSnail(mesh, cfg, bb) {
  const L = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y;
  const uniforms = { uTime: globals.uTime, uCrawl: { value: 0 }, uSeed: { value: Math.random() * 10 } };
  const f = (v) => v.toFixed(5);
  const decl = 'uniform float uTime; uniform float uCrawl; uniform float uSeed;';
  const sole = cfg.soleNormal ? `dot(dfRest - vec3(${cfg.solePoint.map(f).join(',')}), vec3(${cfg.soleNormal.map(f).join(',')}))` : `(-dfRest.y)`;
  const body = `
  {
    float s = (dfRest.x - ${f(bb.min.x)}) / ${f(L)};
    // head region: front of the body, excluding the rigid shell
    float head = 1.0 - smoothstep(${f((cfg.headX - bb.min.x) / L - 0.08)}, ${f((cfg.headX - bb.min.x) / L + 0.06)}, s);
    float t = uTime + uSeed;
    float ext = 0.5 + 0.5 * sin(t * 0.31) * sin(t * 0.17 + 1.0);
    transformed.x -= head * ${f(L)} * 0.035 * ext;
    // tentacles: highest part of the head explores
    float tent = head * smoothstep(${f(0.12 * H)}, ${f(0.3 * H)}, dfRest.y - ${f(bb.min.y)} - (${cfg.soleNormal ? f(0.5 * H) : '0.0'}) * (1.0 - s));
    transformed.z += head * ${f(L)} * 0.025 * sin(t * 0.45) + tent * ${f(L)} * 0.03 * sin(t * 1.3 + dfRest.z * 40.0);
    transformed.y += tent * ${f(L)} * 0.015 * sin(t * 0.9 + 0.7);
    // sole: pedal waves travelling along the foot while crawling (stays in the contact plane)
    float footD = ${sole};
    float foot = 1.0 - smoothstep(-${f(0.06 * H)}, -${f(0.02 * H)}, footD);
    transformed.x += foot * ${f(L)} * 0.006 * uCrawl * sin(s * 40.0 - t * 3.0);
  }`;
  applyDeformer(mesh, 'snail', { uniforms, decl, body });
  inflateBounds(mesh.geometry, L * 0.1);
  return uniforms;
}

function snailMesh(asset, cfg, name) {
  const geo = asset.geometry.clone();
  const off = rebase(geo);
  const mat = asset.material.clone(); mat.roughness = 0.45;
  patchUnderwater(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  const bb = geo.boundingBox.clone();
  const scale = cfg.size / (bb.max.x - bb.min.x);
  mesh.scale.setScalar(scale);
  const uniforms = rigSnail(mesh, cfg, bb);
  attachProxy(mesh, asset.proxy, off);
  return { mesh, uniforms, scale, off, bb };
}

const UP = new THREE.Vector3(0, 1, 0);

export class BottomSnail {
  constructor(asset, scene, bed, avoid) {
    const { mesh, uniforms, scale } = snailMesh(asset, SNAILS.bottom, 'snail-bottom');
    this.mesh = mesh; this.uniforms = uniforms; this.bed = bed; this.avoid = avoid;
    this.group = new THREE.Group(); this.group.add(mesh); scene.add(this.group);
    this.route = LAYOUT.snailRoute;
    this.x = 1.2; this.z = this.route.z; this.heading = Math.PI; // nose (-X) faces travel
    this.speed = 0.035; this.turning = 0; this.pauseT = 0;
    this.r = rng(5);
    this.q = new THREE.Quaternion();
    this.radius = 0.45;
    this.y = bed.bedHeight(this.x, this.z);
  }
  get position() { return this.group.position; }
  step(dt, t) {
    const dirX = -Math.cos(this.heading), dirZ = Math.sin(this.heading);
    // model nose is -X: world travel direction for yaw h is (-cos h, 0, sin h)
    const nx = this.x + dirX * 0.6, nz = this.z + dirZ * 0.6;
    const blocked = this.avoid().some((o) => Math.hypot(o.x - nx, o.z - nz) < o.r + this.radius);
    const out = nx < this.route.x[0] || nx > this.route.x[1] || Math.abs(nz - this.route.z) > 0.6;
    if ((blocked || out) && this.turning === 0) { this.turning = (this.r() < 0.5 ? 1 : -1) * Math.PI; this.pauseT = 1.5; }
    let v = this.speed;
    if (this.pauseT > 0) { this.pauseT -= dt; v = 0; }
    else if (this.turning !== 0) {
      const dA = Math.sign(this.turning) * Math.min(Math.abs(this.turning), dt * 0.22);
      this.heading += dA; this.turning -= dA; v = this.speed * 0.3;
      if (Math.abs(this.turning) < 1e-3) this.turning = 0;
    } else {
      this.heading += Math.sin(t * 0.07) * 0.02 * dt + (this.route.z - this.z) * dirX * 0.0; // slow meander
      this.heading += clamp((this.route.z - this.z) * 0.3, -0.05, 0.05) * dt * Math.sign(-dirX || 1);
    }
    this.x += -Math.cos(this.heading) * v * dt;
    this.z += Math.sin(this.heading) * v * dt;
    this.uniforms.uCrawl.value += ((v > 0.005 ? 1 : 0.2) - this.uniforms.uCrawl.value) * dt;
    // follow the smoothed bed (gentle climbs over pebbles), small stable tilt
    const yT = this.bed.bedHeight(this.x, this.z);
    this.y += (yT - this.y) * Math.min(1, dt * 1.5);
    const n = this.bed.bedNormal(this.x, this.z, new THREE.Vector3()).lerp(UP, 0.35).normalize();
    const target = new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.heading));
    this.q.slerp(target, Math.min(1, dt * 1.2));
    this.group.position.set(this.x, this.y - 0.01, this.z);
    this.group.quaternion.copy(this.q);
  }
}

export class GlassSnail {
  constructor(asset, scene) {
    const cfg = SNAILS.glass;
    const { mesh, uniforms, scale, off } = snailMesh(asset, cfg, 'snail-glass');
    this.mesh = mesh; this.uniforms = uniforms;
    // sole frame in (rebased) model space
    this.soleDir = new THREE.Vector3(...cfg.soleDir).normalize();
    this.soleN = new THREE.Vector3(...cfg.soleNormal).normalize();
    this.soleP = new THREE.Vector3(...cfg.solePoint).add(off).multiplyScalar(scale);
    this.inner = new THREE.Group(); // aligns the sole with the group's XY plane, normal +Z
    const m = new THREE.Matrix4().makeBasis(this.soleDir, this.soleN, new THREE.Vector3().crossVectors(this.soleDir, this.soleN));
    // model basis -> (u along +X, normal along +Z): build rotation R with R*soleDir = X, R*soleN = Z
    const tgt = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0).cross(new THREE.Vector3(0, 0, 1)));
    const R = tgt.multiply(m.clone().transpose());
    this.inner.quaternion.setFromRotationMatrix(R);
    this.inner.add(mesh);
    // put the sole contact point at the group origin
    mesh.position.copy(this.soleP).negate();
    this.group = new THREE.Group(); this.group.add(this.inner); scene.add(this.group);
    this.y = 1.4; this.x = LAYOUT.glassSnail.x; this.ang = Math.PI / 2 - 0.35; // crawling up-left-ish
    this.dir = 1; this.turnT = 0;
    this.r = rng(11);
  }
  step(dt, t) {
    const R = LAYOUT.glassSnail;
    const speed = 0.018;
    if (this.turnT > 0) {
      this.turnT -= dt;
      this.ang += this.dir * dt * 0.12;
    } else {
      this.ang += Math.sin(t * 0.05) * 0.03 * dt;
      this.x += Math.cos(this.ang) * speed * dt; this.y += Math.sin(this.ang) * speed * dt;
      if (this.y > R.y[1] && Math.sin(this.ang) > 0) { this.turnT = Math.PI / 0.12; this.dir = Math.cos(this.ang) > 0 ? 1 : -1; }
      if (this.y < R.y[0] && Math.sin(this.ang) < 0) { this.turnT = Math.PI / 0.12; this.dir = Math.cos(this.ang) > 0 ? -1 : 1; }
    }
    this.x = clamp(this.x, -TANK.hx + 0.8, -2.8);
    this.uniforms.uCrawl.value += ((this.turnT > 0 ? 0.4 : 1) - this.uniforms.uCrawl.value) * dt;
    // group: origin on the inner surface of the front pane, local +Z pointing out of the tank
    // (into the glass), sole direction rotated within the pane plane by `ang`
    this.group.position.set(this.x, this.y, TANK.hz - 0.003);
    this.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.ang);
  }
  get position() { return this.group.position; }
}
