// Fish navigation: individual wander/hover behaviour, predictive avoidance of the tank,
// surface, substrate, decorations and each other, followed by an iterative safety solver
// that resolves any remaining overlap of the full multi-sphere collision shapes.
import * as THREE from 'three';
import { TANK } from '../config/scene.js';
import { rng, clamp } from '../core/random.js';
import { surfaceHeight } from '../world/surface.js';
import { currentAt } from '../world/current.js';

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const WALL_M = 0.06, SURF_M = 0.1, BED_M = 0.12, OBJ_M = 0.08, FISH_GAP = 0.08;

export class FishAgent {
  constructor({ name, cfg, mesh, rig, scale, uniforms, seed, start, heading }) {
    this.name = name; this.cfg = cfg; this.swim = cfg.swim; this.rig = rig; this.uniforms = uniforms;
    this.r = rng(seed);
    this.group = new THREE.Group();
    this.group.name = `fish-${name}`;
    mesh.scale.setScalar(scale);
    mesh.position.copy(rig.center).multiplyScalar(-scale);
    this.group.add(mesh);
    this.mesh = mesh;
    const anim = this.swim.bodyAmp * rig.L * scale * 1.4;
    this.spheres = rig.spheres.map((s) => ({ c: s.c.clone().multiplyScalar(scale), r: s.r * scale + anim, w: new THREE.Vector3() }));
    this.bound = Math.max(...this.spheres.map((s) => s.c.length() + s.r));
    this.halfHeight = Math.max(...this.spheres.map((s) => Math.abs(s.c.y) + s.r));
    this.pos = start.clone();
    this.vel = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)).multiplyScalar(this.swim.cruise * 0.5);
    this.dir = this.vel.clone().normalize();
    this.quat = new THREE.Quaternion();
    this.bank = 0; this.yawRate = 0; this.turnSide = this.r() < 0.5 ? -1 : 1;
    this.avoidance = new THREE.Vector3();
    this.speed = this.vel.length();
    this.target = start.clone();
    this.state = 'cruise'; this.stateT = 0; this.targetT = 0; this.stuckT = 0;
    this.phase = this.r() * 6.28; this.finPhase = this.r() * 6.28; this.pecPhase = this.r() * 6.28;
    this.effort = 0.3; this.accel = new THREE.Vector3();
    this.updateOrientation(0);
  }

  // world positions of the collision spheres for the current pose
  sphereWorld() {
    for (const s of this.spheres) s.w.copy(s.c).applyQuaternion(this.quat).add(this.pos);
    return this.spheres;
  }

  updateOrientation(dt) {
    // keep upright: limit pitch, slight banking from turn rate
    tmpV.copy(this.dir);
    const horiz = Math.hypot(tmpV.x, tmpV.z);
    const maxPitch = 0.2;
    if (Math.abs(Math.atan2(tmpV.y, horiz)) > maxPitch) { tmpV.y = Math.sign(tmpV.y) * Math.tan(maxPitch) * horiz; }
    tmpV.normalize();
    const fwd = tmpV;
    const up = tmpV2.set(0, 1, 0);
    const right = tmpV3.crossVectors(fwd, up).normalize();
    up.crossVectors(right, fwd).normalize();
    // model axes: -X -> fwd, +Y -> up, +Z -> (-fwd) x up
    const zAxis = new THREE.Vector3().crossVectors(fwd.clone().negate(), up);
    tmpM.makeBasis(fwd.clone().negate(), up, zAxis);
    tmpQ.setFromRotationMatrix(tmpM);
    const bankQ = new THREE.Quaternion().setFromAxisAngle(fwd, this.bank);
    tmpQ.premultiply(bankQ);
    if (dt === 0) this.quat.copy(tmpQ); else this.quat.slerp(tmpQ, 1 - Math.exp(-dt * 4));
  }

  pickTarget(world) {
    const s = this.swim, r = this.r;
    let best = null, bestScore = -Infinity;
    const radius = Math.max(...this.spheres.map((sp) => sp.r));
    const horizontalBound = Math.max(...this.spheres.map((sp) => Math.hypot(sp.c.x, sp.c.z) + sp.r));
    const heading = Math.atan2(this.dir.z, this.dir.x);
    for (let tries = 0; tries < 48; tries++) {
      let p;
      if (this.name === 'clownfish' && r() < 0.15 && world.pointsOfInterest.length) {
        const poi = world.pointsOfInterest[Math.floor(r() * world.pointsOfInterest.length)];
        p = poi.clone().add(new THREE.Vector3((r() - 0.5) * 2, 0, (r() - 0.5) * 2));
        p.y = clamp(p.y, s.depth[0], s.depth[1]);
      } else {
        const yaw = heading + (r() - 0.5) * Math.PI * 2;
        const travel = 2.5 + r() * 4;
        p = new THREE.Vector3(
          clamp(this.pos.x + Math.cos(yaw) * travel, -TANK.hx + horizontalBound + 0.45, TANK.hx - horizontalBound - 0.45),
          clamp(this.pos.y + (r() - 0.5) * 1.4, s.depth[0], s.depth[1]),
          clamp(this.pos.z + Math.sin(yaw) * travel, -TANK.hz + horizontalBound + 0.45, TANK.hz - horizontalBound - 0.45),
        );
      }
      const delta = p.clone().sub(this.pos), distance = delta.length();
      if (distance < 1.6 || world.clearance(p, radius) < 0.35) continue;
      // Prefer a clear, forward route to a long glide. Do not choose a new random
      // destination behind the fish every time it reaches a waypoint.
      let routeGap = Infinity;
      for (const u of [0.25, 0.5, 0.75]) {
        const q = this.pos.clone().lerp(p, u);
        routeGap = Math.min(routeGap, world.clearance(q, radius));
      }
      const score = delta.normalize().dot(this.dir) * 2.5 + Math.min(routeGap, 0.8) * 2 + Math.min(distance, 5) * 0.15 - Math.abs(p.y - this.pos.y) * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) this.target.copy(best);
    else this.target.set(0, (s.depth[0] + s.depth[1]) / 2, 0);
    this.targetT = 0;
  }
}

export class FishSchool {
  constructor(world) {
    this.world = world; // { obstacles, bedHeight, dynamicBodies(), clearance(), pointsOfInterest }
    this.fish = [];
    this.time = 0;
    this.cur = new THREE.Vector3();
    this.stats = { fishContacts: 0, envContacts: 0, steps: 0, maxFishCorrection: 0, maxEnvCorrection: 0 };
  }

  add(agent) { this.fish.push(agent); agent.pickTarget(this.world); }

  // environment penetration for a sphere: returns depth (>0 = violation) and pushes `n`
  envViolation(p, r, t, n, solidOnly, margin = 1) {
    const w = this.world;
    let worst = -Infinity;
    const consider = (d, nx, ny, nz) => { if (d > worst) { worst = d; n.set(nx, ny, nz); } };
    consider(p.x + r + WALL_M * margin - TANK.hx, -1, 0, 0);
    consider(-TANK.hx + r + WALL_M * margin - p.x, 1, 0, 0);
    consider(p.z + r + WALL_M * margin - TANK.hz, 0, 0, -1);
    consider(-TANK.hz + r + WALL_M * margin - p.z, 0, 0, 1);
    consider(p.y + r + SURF_M * margin - surfaceHeight(p.x, p.z, t), 0, -1, 0);
    consider(w.bedHeight(p.x, p.z) + r + BED_M * margin - p.y, 0, 1, 0);
    const d = w.obstacles.distance(p.x, p.y, p.z, solidOnly);
    if (r + OBJ_M * margin - d > worst) { worst = r + OBJ_M * margin - d; w.obstacles.gradient(p.x, p.y, p.z, n, solidOnly); }
    for (const b of w.dynamicBodies()) {
      const dd = p.distanceTo(b.pos) - b.r - r - OBJ_M * margin;
      if (-dd > worst) { worst = -dd; n.copy(p).sub(b.pos).normalize(); }
    }
    return worst;
  }

  steer(f, dt, t) {
    const s = f.swim, w = this.world;
    f.stateT += dt; f.targetT += dt;
    const targetDelta = f.target.clone().sub(f.pos);
    const horizontalDistance = Math.hypot(targetDelta.x, targetDelta.z);
    if (f.state === 'hover') {
      if (f.stateT > f.hoverFor) { f.state = 'cruise'; f.stateT = 0; f.pickTarget(w); }
    } else if (horizontalDistance < 1.0 || f.targetT > 22) {
      if (f.r() < s.hoverChance) {
        f.state = 'hover'; f.stateT = 0; f.hoverFor = 2.5 + f.r() * 4;
      } else f.pickTarget(w);
    }

    const desired = f.target.clone().sub(f.pos);
    const dist = desired.length();
    const cruise = s.cruise * (0.9 + 0.1 * Math.sin(t * 0.18 + f.finPhase * 0.03));
    const speed = f.state === 'hover' ? 0.015 : cruise * clamp(dist / 1.6, 0.5, 1);
    if (f.state === 'hover') desired.copy(f.dir);
    desired.normalize().multiplyScalar(speed);

    // Use the worst clearance of the entire shape at each look-ahead time. Summing
    // a force for every overlapping sphere made tall fish turn much harder than small ones.
    const avoid = new THREE.Vector3(), n = new THREE.Vector3();
    const spheres = f.sphereWorld();
    const look = [0.4, 1.1, 2.0];
    let envUrgency = 0;
    for (const time of look) {
      let worst = -Infinity;
      const normal = new THREE.Vector3();
      const lookSpeed = f.state === 'hover' ? f.speed : Math.max(f.speed, cruise * 0.6);
      const off = f.dir.clone().multiplyScalar(lookSpeed * time);
      for (const sp of spheres) {
        const p = sp.w.clone().add(off);
        const v = this.envViolation(p, sp.r, t + time, n, false, 1.5);
        if (v > worst) { worst = v; normal.copy(n); }
      }
      const urgency = clamp((worst + 0.65) / 1.1, 0, 1);
      envUrgency = Math.max(envUrgency, urgency);
      avoid.addScaledVector(normal, urgency * cruise * 1.5 / look.length);
      const headOn = Math.max(0, -f.dir.dot(normal));
      if (headOn > 0.5 && Math.abs(normal.y) < 0.5) {
        const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
        const preference = tangent.dot(desired);
        const side = Math.abs(preference) > cruise * 0.2 ? Math.sign(preference) : -f.turnSide;
        avoid.addScaledVector(tangent, side * urgency * cruise * headOn * 0.8 / look.length);
      }
    }

    // Predict actual silhouette gaps rather than repelling the large bounding balls
    // around the fins. Choose one separating direction per neighbour, with a stable
    // passing side for head-on encounters.
    let yieldK = 1;
    for (const other of this.fish) {
      if (other === f || f.pos.distanceTo(other.pos) > f.bound + other.bound + 2.0) continue;
      const relativeVelocity = f.vel.clone().sub(other.vel);
      const relativePosition = f.pos.clone().sub(other.pos);
      const tca = clamp(-relativePosition.dot(relativeVelocity) / Math.max(relativeVelocity.lengthSq(), 1e-4), 0, 2.0);
      let gap = Infinity;
      const separation = new THREE.Vector3(), delta = new THREE.Vector3();
      const otherSpheres = other.sphereWorld();
      for (const p of spheres) for (const q of otherSpheres) {
        delta.copy(p.w).sub(q.w);
        const currentGap = delta.length() - p.r - q.r;
        if (currentGap < gap) { gap = currentGap; separation.copy(delta); }
        delta.addScaledVector(relativeVelocity, tca);
        const g = delta.length() - p.r - q.r;
        if (g < gap) { gap = g; separation.copy(delta); }
      }
      const comfort = 0.7;
      if (gap < comfort) {
        const urgency = clamp((comfort - gap) / (comfort + 0.1), 0, 1);
        separation.y *= 0.4;
        if (separation.lengthSq() < 1e-6) separation.set(-f.dir.z, 0, f.dir.x);
        separation.normalize();
        if (Math.hypot(separation.x, separation.z) < 0.4) {
          const side = this.fish.indexOf(f) < this.fish.indexOf(other) ? 1 : -1;
          separation.add(new THREE.Vector3(-f.dir.z, 0, f.dir.x).multiplyScalar(side * 0.8)).normalize();
        }
        if (Math.abs(separation.dot(f.dir)) > 0.85) {
          separation.add(new THREE.Vector3(-f.dir.z, 0, f.dir.x).multiplyScalar(0.7)).normalize();
        }
        avoid.addScaledVector(separation, cruise * urgency * 1.8);
        const yieldAmount = this.fish.indexOf(f) > this.fish.indexOf(other) ? 0.7 : 0.4;
        yieldK = Math.min(yieldK, 1 - urgency * yieldAmount);
      }
    }
    avoid.clampLength(0, cruise * 1.5);
    if (f.state === 'hover' && avoid.length() > cruise * 0.6) {
      f.state = 'cruise'; f.stateT = 0; f.pickTarget(w);
    }
    f.avoidance.lerp(avoid, 1 - Math.exp(-dt * 1.6));
    currentAt(f.pos.x, f.pos.y, f.pos.z, t, this.cur);
    desired.multiplyScalar(yieldK).add(f.avoidance).addScaledVector(this.cur, 0.12);

    // Heading drives forward motion. Collision corrections can slow a fish, but cannot
    // instantly rotate it or make it chase a sideways velocity with repeated U-turns.
    const prevYaw = Math.atan2(f.dir.z, f.dir.x);
    let error = Math.atan2(desired.z, desired.x) - prevYaw;
    error = Math.atan2(Math.sin(error), Math.cos(error));
    if (Math.abs(error) > 2.8) error = Math.abs(error) * f.turnSide;
    else if (Math.abs(error) > 0.25) f.turnSide = Math.sign(error);
    const hovering = f.state === 'hover' && f.avoidance.length() < cruise * 0.15;
    const wantedRate = hovering ? 0 : clamp(error * 1.2, -s.turn, s.turn);
    f.yawRate += clamp(wantedRate - f.yawRate, -s.turn * 1.5 * dt, s.turn * 1.5 * dt);
    const yaw = prevYaw + f.yawRate * dt;
    const pitch = Math.asin(clamp(f.dir.y, -1, 1));
    const wantedPitch = hovering ? 0 : clamp(Math.atan2(desired.y, Math.hypot(desired.x, desired.z)), -0.18, 0.18);
    const nextPitch = pitch + (wantedPitch - pitch) * (1 - Math.exp(-dt * 0.7));
    f.dir.set(Math.cos(yaw) * Math.cos(nextPitch), Math.sin(nextPitch), Math.sin(yaw) * Math.cos(nextPitch));
    f.bank += (clamp(-f.yawRate * 0.07, -0.045, 0.045) - f.bank) * (1 - Math.exp(-dt * 1.5));

    const alignment = Math.max(0, Math.cos(error));
    let wantedSpeed = speed * yieldK * (0.55 + 0.45 * alignment);
    wantedSpeed *= 1 - envUrgency * (1 - alignment) * 0.7;
    wantedSpeed = Math.min(wantedSpeed, s.max);
    f.speed += clamp((wantedSpeed - f.speed) * 1.3, -s.accel, s.accel) * dt;
    f.accel.copy(f.dir).multiplyScalar(f.speed).sub(f.vel).divideScalar(dt);
    f.vel.copy(f.dir).multiplyScalar(f.speed);
    f.pos.addScaledVector(f.vel, dt);
    if (f.state === 'cruise' && f.speed < cruise * 0.2) {
      f.stuckT += dt;
      if (f.stuckT > 4) { f.stuckT = 0; f.pickTarget(w); }
    } else f.stuckT = 0;
  }

  solve(t) {
    const n = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      // fish vs fish (full sphere sets)
      for (let i = 0; i < this.fish.length; i++) for (let j = i + 1; j < this.fish.length; j++) {
        const a = this.fish[i], b = this.fish[j];
        if (a.pos.distanceTo(b.pos) > a.bound + b.bound + FISH_GAP) continue;
        const sa = a.sphereWorld(), sb = b.sphereWorld();
        let push = 0; const dir = new THREE.Vector3();
        for (const p of sa) for (const q of sb) {
          const d = p.w.distanceTo(q.w), need = p.r + q.r + FISH_GAP;
          if (d < need) { const pd = need - d; if (pd > push) { push = pd; dir.copy(p.w).sub(q.w); } }
        }
        if (push > 0) {
          if (it === 0) this.stats.fishContacts++;
          this.stats.maxFishCorrection = Math.max(this.stats.maxFishCorrection, push);
          if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
          dir.normalize();
          a.pos.addScaledVector(dir, push * 0.5); b.pos.addScaledVector(dir, -push * 0.5);
          const rv = tmpV.copy(a.vel).sub(b.vel).dot(dir);
          if (rv < 0) { a.vel.addScaledVector(dir, -rv * 0.5); b.vel.addScaledVector(dir, rv * 0.5); }
        }
      }
      // environment (re-checked after fish separation so nobody is pushed through glass)
      for (const f of this.fish) {
        for (let k = 0; k < 3; k++) {
          let worst = 0; const wn = new THREE.Vector3();
          for (const sp of f.sphereWorld()) {
            const v = this.envViolation(sp.w, sp.r, t, n, true);
            if (v > worst) { worst = v; wn.copy(n); }
          }
          if (worst <= 0) break;
          if (it === 0 && k === 0) this.stats.envContacts++;
          this.stats.maxEnvCorrection = Math.max(this.stats.maxEnvCorrection, worst);
          f.pos.addScaledVector(wn, worst + 1e-3);
          const vn = f.vel.dot(wn); if (vn < 0) f.vel.addScaledVector(wn, -vn);
        }
      }
    }
  }

  step(dt, t) {
    this.stats.steps++;
    for (const f of this.fish) this.steer(f, dt, t);
    for (const f of this.fish) f.updateOrientation(dt);
    this.solve(t);
    for (const f of this.fish) f.speed = Math.min(f.speed, Math.max(0, f.vel.dot(f.dir)));
  }

  // per-frame visual sync + swimming effort -> animation uniforms
  sync(dt) {
    for (const f of this.fish) {
      const s = f.swim, sp = f.vel.length();
      const effortTarget = clamp(sp / s.cruise, 0, 1.7) * 0.8 + clamp(f.accel.length() / s.accel, 0, 1) * 0.35 + Math.abs(f.yawRate) * 0.15;
      f.effort += (effortTarget - f.effort) * Math.min(1, dt * 2.5);
      const freq = s.tailHz * (0.3 + 0.7 * clamp(f.effort, 0, 1.6));
      f.phase += 6.2831 * freq * dt;
      f.finPhase += 6.2831 * (0.5 + 0.3 * f.effort) * dt;
      f.pecPhase += 6.2831 * (f.state === 'hover' ? 2.2 : 1.4) * dt;
      const u = f.uniforms;
      u.uPhase.value = f.phase;
      u.uBodyAmp.value = s.bodyAmp * (0.25 + 0.95 * clamp(f.effort, 0, 1.5));
      u.uBend.value += (clamp(-f.yawRate * 0.06, -0.08, 0.08) - u.uBend.value) * Math.min(1, dt * 4);
      u.uFinPhase.value = f.finPhase;
      u.uFinAmp.value = s.finAmp * (0.6 + 0.5 * clamp(f.effort, 0, 1.2));
      u.uPecPhase.value = f.pecPhase;
      u.uPecAmp.value = f.state === 'hover' ? 0.9 : 0.45 + 0.2 * f.effort;
      u.uTrail.value = clamp(sp / s.max, 0, 1);
      u.uLift.value = f.state === 'hover' ? -0.5 : 0;
      f.group.position.copy(f.pos);
      f.group.quaternion.copy(f.quat);
    }
  }
}
