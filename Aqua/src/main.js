import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TANK, LAYOUT } from './config/scene.js';
import { FISH } from './config/assets.js';
import { loadAssets } from './core/loader.js';
import { SimClock } from './core/clock.js';
import { globals, CausticBaker, addPatch } from './render/materials.js';
import { Optics, buildWaterSurface } from './render/optics.js';
import { buildTank, LAYER_OPTICS } from './world/tank.js';
import { buildSubstrate } from './world/substrate.js';
import { buildDecor } from './world/decor.js';
import { Obstacles } from './world/obstacles.js';
import { surfaceState } from './world/surface.js';
import { plume, currentAt } from './world/current.js';
import { Bubbles } from './world/bubbles.js';
import { Particles } from './world/particles.js';
import { buildFishRig, applyFishDeformer } from './anim/fishRig.js';
import { FishAgent, FishSchool } from './ai/fishSchool.js';
import { buildCrab, CrabWalker } from './anim/crab.js';
import { BottomSnail, GlassSnail } from './anim/snails.js';
import { createCameraRig, fitCamera, DEFAULT_VIEW } from './ui/camera.js';
import { patchUnderwater } from './render/materials.js';
import { attachProxy, LAYER_FULL, LAYER_PROXY } from './render/lod.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed every other frame in the render loop
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1012);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.layers.enable(LAYER_OPTICS);
camera.layers.enable(LAYER_FULL);
camera.position.copy(DEFAULT_VIEW.pos);

// lighting: soft key from the lamp above the tank, restrained cool fill, dim room
const hemi = new THREE.HemisphereLight(0xbfd8e0, 0x2a2620, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff4e2, 2.6);
key.position.set(2.5, 22, 4.5);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.camera.near = 8; key.shadow.camera.far = 32;
key.shadow.camera.layers.enable(LAYER_PROXY);
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0x9cc4d8, 0.45);
fill.position.set(-12, 6, 10);
scene.add(fill);
const rimLight = new THREE.PointLight(0xffe7c4, 6, 30, 1.6);
rimLight.position.set(0, TANK.h + 1.2, 0);
scene.add(rimLight);

const optics = new Optics(renderer);
const caustics = new CausticBaker(renderer);
const clock = new SimClock();
const tank = buildTank(scene);
// dark backdrop behind the tank, as on a typical aquarium stand
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w + 0.4, TANK.h), new THREE.MeshStandardMaterial({ color: 0x0a1414, roughness: 0.95 }));
backdrop.position.set(0, TANK.h / 2, -TANK.hz - TANK.glass - 0.3);
scene.add(backdrop);
const { controls, reset, constrain } = createCameraRig(camera, renderer.domElement, tank.outer);

const loadingEl = document.getElementById('loading');
const fillEl = document.getElementById('load-fill');
const pctEl = document.getElementById('load-pct');
const errEl = document.getElementById('load-errors');

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  fitCamera(camera, w, h);
  optics.setSize(w, h, renderer.getPixelRatio());
}
window.addEventListener('resize', onResize);
onResize();
reset();

const world = { ready: false };
const debug = new URLSearchParams(location.search).has('debug');

async function init() {
  const { assets, failed } = await loadAssets((p, errs) => {
    fillEl.style.width = `${Math.round(p * 100)}%`;
    pctEl.textContent = `${Math.round(p * 100)}%`;
  });
  for (const f of failed) {
    const li = document.createElement('li');
    li.textContent = `Failed to load ${f.key}: ${decodeURIComponent(f.url)} — ${f.error}`;
    errEl.appendChild(li);
    console.error('[assets] failed', f);
  }

  const obstacles = new Obstacles();
  const decor = buildDecor(scene, assets, obstacles);
  const substrate = buildSubstrate(scene, assets, decor.keepOut);
  if (decor.attach.bubbleOutlet) {
    const o = decor.attach.bubbleOutlet.pos;
    surfaceState.plume[0] = o.x + decor.attach.bubbleOutlet.dir.x * 0.15; surfaceState.plume[1] = o.z + decor.attach.bubbleOutlet.dir.z * 0.15;
    plume.x = o.x + decor.attach.bubbleOutlet.dir.x * 0.12; plume.y = o.y; plume.z = o.z + decor.attach.bubbleOutlet.dir.z * 0.12;
  }
  globals.uPlume.value = surfaceState.plume;
  const water = buildWaterSurface(scene, optics);
  const bubbles = decor.attach.bubbleOutlet ? new Bubbles(scene, optics, decor.attach.bubbleOutlet) : null;
  const particles = new Particles(scene);

  // ---- bottom animals ----
  let crab = null, crabWalker = null, snailB = null, snailG = null;
  const dynamic = [];
  const bed = { bedHeight: substrate.bedHeight, bedNormal: substrate.bedNormal };
  if (assets.snailBottom) {
    snailB = new BottomSnail(assets.snailBottom, scene, bed, () => (crabWalker ? [{ x: crabWalker.position.x, z: crabWalker.position.z, r: 0.6 }] : []));
  }
  if (assets.crab) {
    crab = buildCrab(assets.crab, scene);
    crabWalker = new CrabWalker(crab, bed, () => (snailB ? [{ x: snailB.position.x, z: snailB.position.z, r: 0.4 }] : []));
  }
  if (assets.snailGlass) snailG = new GlassSnail(assets.snailGlass, scene);

  // ---- fish ----
  const school = new FishSchool({
    obstacles,
    bedHeight: substrate.bedHeight,
    dynamicBodies: () => dynamic,
    clearance: (p, r) => {
      const d = Math.min(obstacles.distance(p.x, p.y, p.z), TANK.hx - Math.abs(p.x), TANK.hz - Math.abs(p.z), TANK.waterline - p.y, p.y - substrate.bedHeight(p.x, p.z));
      return d - r;
    },
    pointsOfInterest: [
      new THREE.Vector3(LAYOUT.castle.x, 3.6, LAYOUT.castle.z + 1.6),
      ...Object.values(LAYOUT.plants).map((p) => new THREE.Vector3(p.x * 0.75, 3.2, p.z * 0.5)),
    ],
  });
  const starts = {
    guppy: [new THREE.Vector3(-3.0, 4.9, 1.0), 0.2],
    clownfish: [new THREE.Vector3(2.4, 3.4, 1.1), 2.8],
    angelfish: [new THREE.Vector3(-0.6, 4.0, 0.2), 0.5],
    betta: [new THREE.Vector3(2.0, 4.8, -0.2), 3.6],
  };
  let seed = 101;
  for (const [name, cfg] of Object.entries(FISH)) {
    const a = assets[name];
    if (!a) continue;
    const geo = a.geometry.clone();
    const rig = buildFishRig(geo, cfg);
    const mat = a.material.clone();
    mat.side = THREE.DoubleSide; mat.roughness = Math.max(0.35, mat.roughness * 0.6);
    patchUnderwater(mat, { caustics: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    const uniforms = applyFishDeformer(mesh, rig, cfg);
    attachProxy(mesh, a.proxy);
    if (new URLSearchParams(location.search).has('masks')) addPatch(mat, 'masks', (sh) => {
      // development view of the derived rig masks: R = dorsal/anal/pelvic fin, G = caudal, B = pectoral
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec4 vMask;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aFin;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vMask;').replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.3, vec3(vMask.y, vMask.z, vMask.w), 0.8);');
    });
    const size = a.bbox.getSize(new THREE.Vector3());
    const scale = cfg.size / size[cfg.axis];
    const agent = new FishAgent({ name, cfg, mesh, rig, scale, uniforms, seed: seed += 17, start: starts[name][0], heading: starts[name][1] });
    scene.add(agent.group);
    school.add(agent);
  }

  Object.assign(world, { camera, controls, clock, optics, renderer, scene, ready: true, assets, decor, substrate, obstacles, school, bubbles, particles, water, crab, crabWalker, snailB, snailG, dynamic, failed });
  window.__aqua = world; // inspection hook for verification scripts
  world.selfTest = selfTest; world.inventory = inventory;
  document.getElementById('ui').hidden = false;
  renderer.shadowMap.needsUpdate = true;
  loadingEl.classList.add(failed.length ? 'partial' : 'done');
  if (!failed.length) setTimeout(() => loadingEl.remove(), 800);
  else loadingEl.querySelector('.load-title').textContent = 'Some assets could not be loaded — the aquarium is incomplete:';
  if (debug) console.info('[aqua] inventory', inventory());
}

// Debug/verification: run the simulation off-screen at a given frame step and record
// clearance metrics (used by the automated checks, never shown in the UI).
function selfTest(seconds, frameDt = 1 / 60) {
  const sch = world.school, n = new THREE.Vector3();
  let minFishGap = Infinity, worstEnv = -Infinity, worstWho = '', crabSlip = 0, maxSnailGap = 0;
  const prevF = new Map();
  for (let t = 0; t < seconds; t += frameDt) {
    clock.time += frameDt;
    simulate(frameDt);
    const f = sch.fish;
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
      for (const p of f[i].sphereWorld()) for (const q of f[j].sphereWorld()) minFishGap = Math.min(minFishGap, p.w.distanceTo(q.w) - p.r - q.r);
    }
    for (const a of f) for (const sp of a.sphereWorld()) {
      const v = sch.envViolation(sp.w, sp.r, clock.time, n, true, 0);
      if (v > worstEnv) { worstEnv = v; worstWho = a.name; }
    }
    if (world.crabWalker) for (const l of world.crabWalker.legs) {
      if (!l.stepping && prevF.has(l)) crabSlip = Math.max(crabSlip, l.F.distanceTo(prevF.get(l)));
      prevF.set(l, l.stepping ? null : l.F.clone());
      if (l.stepping) prevF.delete(l);
    }
    if (world.snailG) maxSnailGap = Math.max(maxSnailGap, Math.abs(world.snailG.position.z - (TANK.hz - 0.003)));
  }
  return { seconds, frameDt, minFishGap: +minFishGap.toFixed(4), worstEnvPenetration: +worstEnv.toFixed(4), worstWho, crabStanceSlip: +crabSlip.toFixed(5), glassSnailPlaneError: maxSnailGap, fishPos: sch.fish.map((a) => a.name + ':' + a.pos.toArray().map((v) => v.toFixed(2)).join(',')) };
}

export function inventory() {
  const names = [];
  scene.traverse((o) => { if (o.isMesh) names.push(o.name); });
  return {
    fish: world.school?.fish.map((f) => f.name),
    pebbles: world.substrate?.perVariant,
    pebbleTotal: world.substrate?.pebbleCount,
    rocks: names.filter((n) => n.startsWith('rock-')),
    plants: world.decor?.plants.map((p) => p.key),
    crab: !!world.crab, snails: [world.snailB?.mesh.name, world.snailG?.mesh.name],
    meshes: names,
  };
}

// ---- fixed-step simulation ----
const STEP = 1 / 120;
let acc = 0;
const cur = new THREE.Vector3();
const toLocal = new THREE.Vector3();
function simulate(dt) {
  const t = clock.time;
  globals.uTime.value = t;
  if (!world.ready) return;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 24) {
    const ts = clock.time - acc + STEP;
    world.dynamic.length = 0;
    if (world.crabWalker) world.dynamic.push({ pos: world.crabWalker.position, r: 0.65 });
    if (world.snailB) world.dynamic.push({ pos: world.snailB.position, r: 0.4 });
    if (world.snailG) world.dynamic.push({ pos: world.snailG.position, r: 0.4 });
    world.school.step(STEP, ts);
    world.crabWalker?.step(STEP, ts);
    acc -= STEP; steps++;
  }
  if (steps === 24) acc = 0; // never spiral after a long stall
  world.school.sync(dt);
  world.snailB?.step(dt, t);
  world.snailG?.step(dt, t);
  world.bubbles?.update(dt, t);
  world.particles.update(dt, t);
  for (const p of world.decor.plants) {
    currentAt(p.root.x, p.root.y + p.height * 0.6, p.root.z, t, cur);
    toLocal.copy(cur).applyAxisAngle(new THREE.Vector3(0, 1, 0), -p.rotY).clampLength(0, 0.08);
    p.uniforms.uPlantFlow.value.lerp(toLocal, 1 - Math.exp(-dt * 0.3));
  }
}

// ---- UI ----
const btnPause = document.getElementById('btn-pause');
const icoPause = document.getElementById('ico-pause');
function togglePause() {
  clock.paused = !clock.paused;
  btnPause.setAttribute('aria-label', clock.paused ? 'Resume simulation' : 'Pause simulation');
  icoPause.setAttribute('d', clock.paused ? 'M8 5v14l11-7z' : 'M7 5h3v14H7zM14 5h3v14h-3z');
}
btnPause.addEventListener('click', togglePause);
document.getElementById('btn-reset').addEventListener('click', reset);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.code === 'KeyR') reset();
});
document.addEventListener('visibilitychange', () => clock.resync());

// adaptive optical quality: lower capture resolution first if the frame rate is poor
let fpsAcc = 0, fpsN = 0;
function adapt(realDt) {
  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 3) {
    const fps = fpsN / fpsAcc;
    if (fps < 34 && optics.scale > 0.5) { optics.scale = 0.5; onResize(); }
    else if (fps < 30 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); onResize(); }
    fpsAcc = 0; fpsN = 0;
  }
}

let frame = 0;
renderer.setAnimationLoop(() => {
  const { dt, real } = clock.tick();
  if ((frame++ & 1) === 0 && (dt > 0 || frame < 4)) renderer.shadowMap.needsUpdate = true;
  simulate(dt);
  controls.update();
  constrain();
  if (dt > 0 || frame < 4) caustics.render();
  optics.render(scene, camera);
  adapt(real);
});

init().catch((e) => {
  console.error(e);
  errEl.innerHTML = `<li>${String(e.message || e)}</li>`;
});
