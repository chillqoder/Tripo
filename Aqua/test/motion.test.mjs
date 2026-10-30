import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { FISH, MANIFEST } from '../src/config/assets.js';
import { TANK } from '../src/config/scene.js';
import { FishAgent, FishSchool } from '../src/ai/fishSchool.js';
import { buildFishRig } from '../src/anim/fishRig.js';
import { Obstacles } from '../src/world/obstacles.js';
import { buildDecor } from '../src/world/decor.js';
import { sandHeight } from '../src/world/substrate.js';
import { plume } from '../src/world/current.js';
import { surfaceHeight, surfaceState, addRipple, RIPPLE } from '../src/world/surface.js';

function resetSurface() {
  surfaceState.ripples.fill(0);
  surfaceState.next = 0;
}

test('water stays calm away from bubble rings, which expand and expire', () => {
  resetSurface();
  const calm = surfaceHeight(0, 0, 0);
  assert.equal(surfaceHeight(0, 0, 40), calm);
  addRipple(0, 0, 10, 0.012);
  assert.equal(surfaceHeight(0, 0, 10), calm, 'a new ripple starts smoothly');
  const front = RIPPLE.speed * 0.5;
  assert.ok(surfaceHeight(front, 0, 10.5) - calm > 0.004, 'bubble arrival raises an expanding ring');
  assert.ok(Math.abs(surfaceHeight(4, 0, 10.5) - calm) < 1e-9, 'distant water stays still');
  assert.ok(Math.abs(surfaceHeight(front, 0, 10.5) - surfaceHeight(0, front, 10.5)) < 1e-9, 'the ring is circular');
  assert.equal(surfaceHeight(0, 0, 10 + RIPPLE.life + 0.01), calm, 'waves expire');
  resetSurface();
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const assets = {};
for (const key of [...Object.keys(FISH), 'castle', 'aerator', 'vallisneria', 'anubias', 'javaFern', 'cabomba', 'rock0', 'rock1', 'rock2']) {
  const doc = await io.read(new URL(`../public/models/${MANIFEST[key]}`, import.meta.url).pathname);
  const node = doc.getRoot().listNodes().find(n => n.getMesh());
  const primitive = node.getMesh().listPrimitives()[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(primitive.getAttribute('POSITION').getArray().slice(), 3));
  geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
  geometry.computeBoundingBox();
  assets[key] = { geometry, bbox: geometry.boundingBox.clone(), material: new THREE.MeshStandardMaterial() };
}

function makeSchool() {
  const obstacles = new Obstacles();
  const decor = buildDecor(new THREE.Scene(), assets, obstacles);
  const outlet = decor.attach.bubbleOutlet;
  plume.x = outlet.pos.x + outlet.dir.x * 0.12;
  plume.y = outlet.pos.y;
  plume.z = outlet.pos.z + outlet.dir.z * 0.12;
  const school = new FishSchool({
    obstacles, bedHeight: sandHeight, dynamicBodies: () => [], pointsOfInterest: [],
    clearance: (p, r) => Math.min(obstacles.distance(p.x, p.y, p.z), TANK.hx - Math.abs(p.x), TANK.hz - Math.abs(p.z), TANK.waterline - p.y, p.y - sandHeight(p.x, p.z)) - r,
  });
  const starts = [[-3, 4.9, 1, 0.2], [2.4, 3.4, 1.1, 2.8], [-0.6, 4, 0.2, 0.5], [2, 4.8, -0.2, 3.6]];
  Object.entries(FISH).forEach(([name, cfg], i) => {
    const geometry = assets[name].geometry.clone();
    const rig = buildFishRig(geometry, cfg);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    const scale = cfg.size / assets[name].bbox.getSize(new THREE.Vector3())[cfg.axis];
    const start = starts[i];
    school.add(new FishAgent({ name, cfg, mesh, rig, scale, uniforms: {}, seed: 118 + i * 17, start: new THREE.Vector3(...start.slice(0, 3)), heading: start[3] }));
  });
  return school;
}

test('avoidance does not become stronger when collision spheres are duplicated', () => {
  const original = makeSchool(), duplicate = makeSchool();
  const a = original.fish[0], b = duplicate.fish[0];
  original.fish = [a]; duplicate.fish = [b];
  a.pos.set(4.9, 4.9, 1); b.pos.copy(a.pos);
  a.target.set(5.3, 4.9, -1); b.target.copy(a.target);
  b.spheres.push(...b.spheres.map(s => ({ c: s.c.clone(), r: s.r, w: s.w.clone() })));
  for (let k = 0; k < 120; k++) {
    original.step(1 / 120, k / 120); duplicate.step(1 / 120, k / 120);
    assert.ok(a.dir.distanceTo(b.dir) < 1e-9);
    assert.ok(a.pos.distanceTo(b.pos) < 1e-9);
  }
});

for (const frameDt of [1 / 60, 1 / 12]) {
  test(`fish glide upright without contact at ${Math.round(1 / frameDt)} fps`, (t) => {
    const school = makeSchool();
    const normal = new THREE.Vector3();
    const paths = school.fish.map(() => 0);
    const prev = school.fish.map(f => f.pos.clone());
    let minGap = Infinity, worstEnv = -Infinity;
    for (let frame = 0; frame < 90 / frameDt; frame++) {
      for (let j = 0; j < Math.round(frameDt * 120); j++) {
        const dt = 1 / 120, time = frame * frameDt + j * dt;
        const rates = school.fish.map(f => f.yawRate);
        school.step(dt, time);
        school.fish.forEach((f, i) => {
          assert.ok(Math.abs(f.yawRate) <= f.swim.turn + 1e-8, `${f.name} turns too fast`);
          assert.ok(Math.abs(f.yawRate - rates[i]) <= f.swim.turn * 1.5 * dt + 1e-8, `${f.name} changes turn abruptly`);
          assert.ok(Math.abs(Math.asin(f.dir.y)) <= 0.18 + 1e-8, `${f.name} pitches too steeply`);
        });
      }
      const allSpheres = school.fish.map(f => f.sphereWorld());
      school.fish.forEach((f, i) => {
        paths[i] += prev[i].distanceTo(f.pos); prev[i].copy(f.pos);
        for (const sp of allSpheres[i]) worstEnv = Math.max(worstEnv, school.envViolation(sp.w, sp.r, frame * frameDt, normal, true, 0));
        for (let j = i + 1; j < school.fish.length; j++) for (const a of allSpheres[i]) for (const b of allSpheres[j]) {
          minGap = Math.min(minGap, a.w.distanceTo(b.w) - a.r - b.r);
        }
      });
    }
    assert.ok(minGap > 0.07, `fish gap: ${minGap}`);
    assert.ok(worstEnv <= 0, `environment penetration: ${worstEnv}`);
    paths.forEach((distance, i) => assert.ok(distance > 8, `${school.fish[i].name} stays stuck: ${distance}`));
    t.diagnostic(JSON.stringify({ minGap, worstEnv, paths, solver: school.stats }));
  });
}
