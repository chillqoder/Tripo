// Crab: rig derived from the single merged mesh + sideways IK walking.
//
// Rig: removing the carapace core (ellipse |(x, z/0.8)| < coreR) leaves each limb as its own
// connected component. Each limb gets a hip bone (where it leaves the core) and a knee bone
// (mid-limb), with smooth skin weights body -> hip -> knee along the limb. Measured on the
// supplied model: 7 walking-leg components (4 right, 3 left: the left front legs are fused
// in the generated geometry) and 2 claws; a rear carapace flap is kept rigid with the body.
import * as THREE from 'three';
import { CRAB, CRAB as C } from '../config/assets.js';
import { LAYOUT } from '../config/scene.js';
import { rng, smoothstep, clamp } from '../core/random.js';
import { rebase } from '../world/decor.js';
import { patchUnderwater } from '../render/materials.js';
import { attachProxy } from '../render/lod.js';

function segmentLimbs(geo) {
  const pos = geo.attributes.position, idx = geo.index.array, n = pos.count;
  const key = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let id = key.get(k); if (id === undefined) { id = key.size; key.set(k, id); } wid[i] = id;
  }
  const radius = (i) => Math.hypot(pos.getX(i), pos.getZ(i) / C.coreZScale);
  const keep = (i) => radius(i) > C.coreR;
  const par = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (!keep(a) || !keep(b) || !keep(c)) continue;
    par[find(wid[a])] = find(wid[b]); par[find(wid[a])] = find(wid[c]);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    if (!keep(i)) continue;
    const r = find(wid[i]);
    let g = groups.get(r); if (!g) { g = { verts: [] }; groups.set(r, g); }
    g.verts.push(i);
  }
  const limbs = [];
  for (const g of groups.values()) {
    if (g.verts.length < 300) continue;
    let sx = 0, sz = 0, tipR = 0, tip = null;
    for (const i of g.verts) { sx += pos.getX(i); sz += pos.getZ(i); const r = radius(i); if (r > tipR) { tipR = r; tip = i; } }
    const cx = sx / g.verts.length, cz = sz / g.verts.length;
    const ang = Math.atan2(cz, cx) * 180 / Math.PI;
    const tipP = new THREE.Vector3(pos.getX(tip), pos.getY(tip), pos.getZ(tip));
    if (Math.abs(ang + 90) < 25) continue; // rear carapace flap
    const type = cz > 0.1 && Math.abs(cx) < 0.2 ? 'claw' : 'leg';
    // hip: mean of the limb vertices just outside the core
    const hip = new THREE.Vector3(); let hn = 0;
    for (const i of g.verts) if (radius(i) < C.coreR + 0.035) { hip.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); hn++; }
    hip.multiplyScalar(1 / Math.max(hn, 1));
    // leg tip: lowest, outermost point (the foot)
    let foot = tipP;
    if (type === 'leg') {
      let best = -Infinity;
      for (const i of g.verts) { const sc = radius(i) - pos.getY(i) * 1.5; if (sc > best) { best = sc; foot = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)); } }
    }
    const dir = new THREE.Vector3(foot.x - hip.x, 0, foot.z - hip.z);
    const len = dir.length(); dir.normalize();
    // knee: centre of the band at 45-55% of the limb's horizontal extent
    const knee = new THREE.Vector3(); let kn = 0;
    for (const i of g.verts) {
      const f = ((pos.getX(i) - hip.x) * dir.x + (pos.getZ(i) - hip.z) * dir.z) / len;
      if (f > 0.42 && f < 0.56) { knee.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); kn++; }
    }
    knee.multiplyScalar(1 / Math.max(kn, 1));
    limbs.push({ type, ang, hip, knee, foot, dir, len, verts: g.verts });
  }
  return limbs;
}

export function buildCrab(asset, scene) {
  const geo = asset.geometry.clone();
  const off = rebase(geo);
  const limbs = segmentLimbs(geo);
  const pos = geo.attributes.position, n = pos.count;
  const root = new THREE.Bone(); root.name = 'body';
  const bones = [root];
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) skinWeight[i * 4] = 1;
  for (const L of limbs) {
    const hip = new THREE.Bone(); hip.position.copy(L.hip); hip.name = `${L.type}-hip`;
    const knee = new THREE.Bone(); knee.position.copy(L.knee).sub(L.hip); knee.name = `${L.type}-knee`;
    root.add(hip); hip.add(knee);
    L.hipIdx = bones.push(hip) - 1; L.kneeIdx = bones.push(knee) - 1;
    L.hipBone = hip; L.kneeBone = knee;
    const fk = ((L.knee.x - L.hip.x) * L.dir.x + (L.knee.z - L.hip.z) * L.dir.z) / L.len;
    L.fk = fk;
    for (const i of L.verts) {
      const f = ((pos.getX(i) - L.hip.x) * L.dir.x + (pos.getZ(i) - L.hip.z) * L.dir.z) / L.len;
      const wb = 1 - smoothstep(-0.06, 0.08, f);
      const wk = smoothstep(fk - 0.07, fk + 0.07, f) * (1 - wb);
      const wh = 1 - wb - wk;
      skinIndex.set([0, L.hipIdx, L.kneeIdx, 0], i * 4);
      skinWeight.set([wb, wh, wk, 0], i * 4);
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const mat = asset.material.clone();
  mat.roughness = 0.6;
  patchUnderwater(mat);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'crab';
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  attachProxy(mesh, asset.proxy, off);
  const size = asset.bbox.getSize(new THREE.Vector3());
  const scale = CRAB.size / size.x;
  mesh.scale.setScalar(scale);
  const group = new THREE.Group(); group.name = 'crab-root';
  group.add(mesh);
  scene.add(group);
  for (const L of limbs) {
    L.a0 = L.knee.clone().sub(L.hip); L.b0 = L.foot.clone().sub(L.knee);
    L.la = L.a0.length(); L.lb = L.b0.length();
  }
  return { group, mesh, limbs, scale };
}

// --- walking controller --------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
export class CrabWalker {
  constructor(crab, bed, avoid) {
    this.c = crab; this.bed = bed; this.avoid = avoid; // avoid(x, z) -> list of {x,z,r}
    this.r = rng(77);
    const R = LAYOUT.crabRoute;
    this.route = R;
    this.x = -0.8; this.z = R.z; this.yaw = 0.08; // faces +Z (toward the viewer)
    this.dirSign = 1; this.speed = 0; this.targetX = 1.8;
    this.state = 'walk'; this.stateT = 0; this.pauseFor = 0;
    this.legs = crab.limbs.filter((l) => l.type === 'leg');
    this.claws = crab.limbs.filter((l) => l.type === 'claw');
    // alternating groups: order legs around the body and alternate membership per side
    for (const side of [1, -1]) {
      const s = this.legs.filter((l) => Math.sign(l.foot.x) === side).sort((a, b) => a.foot.z - b.foot.z);
      s.forEach((l, i) => { l.group = (i + (side > 0 ? 0 : 1)) % 2; });
    }
    this.activeGroup = 0;
    this.bodyY = bed.bedHeight(this.x, this.z);
    this.tilt = new THREE.Quaternion();
    this.updateBodyMatrix();
    for (const l of this.legs) {
      l.F = this.homeWorld(l, new THREE.Vector3());
      l.stepping = false; l.u = 0; l.S0 = l.F.clone(); l.S1 = l.F.clone();
    }
    this.clawT = 0; this.gesture = 0;
    this.tmp = new THREE.Vector3(); this.inv = new THREE.Matrix4();
    this.bodyR = 0.55;
  }

  updateBodyMatrix() {
    const g = this.c.group;
    const nrm = this.bed.bedNormal(this.x, this.z, new THREE.Vector3());
    const qt = new THREE.Quaternion().setFromUnitVectors(UP, nrm.lerp(UP, 0.5).normalize());
    this.tilt.slerp(qt, 0.05);
    g.position.set(this.x, this.bodyY, this.z);
    g.quaternion.copy(this.tilt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.yaw));
    g.updateMatrixWorld(true);
  }

  homeWorld(l, out) {
    // rest foot position, shifted slightly outward, projected onto the bed
    out.copy(l.foot).multiplyScalar(1).applyMatrix4(this.c.mesh.matrixWorld);
    out.y = this.bed.bedHeight(out.x, out.z);
    return out;
  }

  get position() { return this.c.group.position; }

  step(dt, t) {
    this.stateT += dt;
    const R = this.route;
    // obstacles on the route (bottom snail etc.)
    const ahead = this.x + this.dirSign * 0.9;
    const blocked = this.avoid().some((o) => Math.abs(o.z - this.z) < o.r + 0.6 && Math.sign(o.x - this.x) === this.dirSign && Math.abs(o.x - this.x) < o.r + 0.9);
    if (this.state === 'walk') {
      const d = (this.targetX - this.x) * this.dirSign;
      if (d < 0.05 || blocked || ahead < R.x[0] - 0.5 || ahead > R.x[1] + 0.5) {
        this.state = 'pause'; this.stateT = 0; this.pauseFor = 1.5 + this.r() * 3.5;
        this.gesture = this.r() < 0.7 ? 1 : 0;
        if (blocked) this.dirSign *= -1;
      }
    } else if (this.stateT > this.pauseFor && this.speed < 0.01) {
      this.state = 'walk'; this.stateT = 0;
      const span = R.x[1] - R.x[0];
      if (this.x < R.x[0] + 0.8) this.dirSign = 1; else if (this.x > R.x[1] - 0.8) this.dirSign = -1; else if (this.r() < 0.45) this.dirSign *= -1;
      this.targetX = clamp(this.x + this.dirSign * (0.8 + this.r() * span * 0.5), R.x[0], R.x[1]);
    }
    // body speed: eased start/stop, limited by leg reach so the body never outruns the feet
    let want = this.state === 'walk' ? 0.2 : 0;
    let stretch = 0;
    for (const l of this.legs) if (!l.stepping) stretch = Math.max(stretch, l.F.distanceTo(this.homeWorld(l, this.tmp)));
    const stride = 0.13;
    if (stretch > stride * 1.25) want *= clamp(1 - (stretch - stride * 1.25) / (stride * 0.5), 0, 1);
    this.speed += (want - this.speed) * Math.min(1, dt * 2.0);
    // sideways travel along the crab's own X axis, independent of its facing
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.x += side.x * this.speed * this.dirSign * dt;
    this.z += side.z * this.speed * this.dirSign * dt;
    this.z += (R.z - this.z) * dt * 0.2;
    this.yaw += (0.08 + 0.12 * Math.sin(t * 0.05) - this.yaw) * dt * 0.2;
    // body height follows the smoothed bed under the feet
    let gy = 0; for (const l of this.legs) gy += l.F.y; gy /= this.legs.length;
    const targetY = 0.5 * gy + 0.5 * this.bed.bedHeight(this.x, this.z);
    this.bodyY += (targetY - this.bodyY) * Math.min(1, dt * 4);
    const bob = this.legs.some((l) => l.stepping) ? 0.006 : 0;
    this.bodyY += bob * Math.sin(t * 20) * dt;
    this.updateBodyMatrix();

    // gait: tetrapod-like alternating groups; a step starts when the foot lags its home
    const stepDur = 0.28;
    const groupBusy = this.legs.some((l) => l.group === this.activeGroup && l.stepping);
    if (!groupBusy) {
      const need = (g) => this.legs.some((l) => l.group === g && l.F.distanceTo(this.homeWorld(l, this.tmp)) > stride * 0.5);
      if (need(1 - this.activeGroup) || !need(this.activeGroup)) this.activeGroup = 1 - this.activeGroup;
      if (need(this.activeGroup)) {
        for (const l of this.legs) if (l.group === this.activeGroup) {
          const home = this.homeWorld(l, new THREE.Vector3());
          if (l.F.distanceTo(home) < stride * 0.3) continue;
          l.stepping = true; l.u = 0; l.S0.copy(l.F);
          l.S1.copy(home).addScaledVector(side, this.speed * this.dirSign * stepDur * 1.1);
          l.S1.y = this.bed.bedHeight(l.S1.x, l.S1.z);
        }
      }
    }
    for (const l of this.legs) {
      if (!l.stepping) continue;
      l.u = Math.min(1, l.u + dt / stepDur);
      const e = l.u * l.u * (3 - 2 * l.u);
      l.F.lerpVectors(l.S0, l.S1, e);
      l.F.y = this.bed.bedHeight(l.F.x, l.F.z) + Math.sin(Math.PI * l.u) * 0.07;
      if (l.u >= 1) { l.stepping = false; l.F.y = this.bed.bedHeight(l.F.x, l.F.z); }
    }
    this.solveIK(t, dt);
  }

  solveIK(t, dt) {
    this.inv.copy(this.c.mesh.matrixWorld).invert();
    const tgt = new THREE.Vector3(), tv = new THREE.Vector3(), a1 = new THREE.Vector3(), b1 = new THREE.Vector3();
    const qYaw = new THREE.Quaternion(), qH = new THREE.Quaternion(), qK = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
    for (const l of this.legs) {
      tgt.copy(l.F).applyMatrix4(this.inv);
      tv.copy(tgt).sub(l.hip);
      const restH = Math.atan2(l.foot.z - l.hip.z, l.foot.x - l.hip.x), tgtH = Math.atan2(tv.z, tv.x);
      qYaw.setFromAxisAngle(UP, -(tgtH - restH));
      a1.copy(l.a0).applyQuaternion(qYaw); b1.copy(l.b0).applyQuaternion(qYaw);
      const d = clamp(tv.length(), Math.abs(l.la - l.lb) + 1e-3, (l.la + l.lb) * 0.999);
      const tn = tv.clone().normalize();
      const cosA = clamp((l.la * l.la + d * d - l.lb * l.lb) / (2 * l.la * d), -1, 1);
      const axis = new THREE.Vector3().crossVectors(tn, UP);
      if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
      const aNew = tn.clone().applyAxisAngle(axis.normalize(), Math.acos(cosA)).multiplyScalar(l.la);
      const bNew = tn.clone().multiplyScalar(d).sub(aNew);
      qH.setFromUnitVectors(a1.clone().normalize(), aNew.clone().normalize()).multiply(qYaw);
      const bAfter = l.b0.clone().applyQuaternion(qH).normalize();
      qK.setFromUnitVectors(bAfter, bNew.normalize()).multiply(qH);
      l.hipBone.quaternion.copy(qH);
      l.kneeBone.quaternion.copy(tmpQ.copy(qH).invert().multiply(qK));
    }
    // claws: restrained idle motion, occasional exploratory gesture while paused
    this.clawT += dt;
    const g = this.state === 'pause' && this.gesture ? smoothstep(0, 0.8, this.stateT) * (1 - smoothstep(this.pauseFor - 0.8, this.pauseFor, this.stateT)) : 0;
    this.claws.forEach((c, i) => {
      const s = i === 0 ? 1 : -1;
      const lift = 0.05 * Math.sin(this.clawT * 0.9 + i) + g * (0.22 + 0.08 * Math.sin(this.clawT * 3 + i));
      c.hipBone.quaternion.setFromEuler(new THREE.Euler(-lift, 0.05 * s * Math.sin(this.clawT * 0.7), 0));
      c.kneeBone.quaternion.setFromEuler(new THREE.Euler(-g * 0.25 * (0.5 + 0.5 * Math.sin(this.clawT * 4 + i * 2)), 0, 0));
    });
  }
}
