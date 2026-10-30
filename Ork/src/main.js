import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CFG } from './config.js';
import { loadGLB, prepareModel } from './assets.js';
import { OrcRig } from './rig/OrcRig.js';
import { Solver } from './anim/Solver.js';
import { createStancePose } from './anim/stance.js';
import { clonePose } from './anim/pose.js';
import { AnimController } from './anim/Controller.js';
import { raiseAction } from './anim/actions/raise.js';
import { chestAction } from './anim/actions/chest.js';
import { slamAction } from './anim/actions/slam.js';
import { createRock } from './env/rock.js';
import { buildForest } from './env/forest.js';
import { Effects } from './fx/Effects.js';
import { AudioManager } from './audio/AudioManager.js';
import { wireEvents } from './events.js';
import { createUI } from './ui.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const app = { THREE, params, CFG };
window.app = app;

function fail(err) {
  console.error(err);
  $('loading')?.classList.add('hidden');
  $('error')?.classList.remove('hidden');
  const t = $('error-text');
  if (t) t.textContent = String(err?.message || err);
}

async function init() {
  const canvas = $('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('The graphics context was lost. Please reload the page.'); });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa6a0);
  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, 0.05, 400);
  camera.position.copy(CFG.camera.position);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(CFG.camera.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = CFG.camera.minDistance;
  controls.maxDistance = CFG.camera.maxDistance;
  controls.minPolarAngle = CFG.camera.minPolar;
  controls.maxPolarAngle = CFG.camera.maxPolar;
  const az0 = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  controls.minAzimuthAngle = az0 - CFG.camera.azimuthRange;
  controls.maxAzimuthAngle = az0 + CFG.camera.azimuthRange;
  controls.update();

  // --- assets (models block the start; audio decodes in the background) ---
  const progress = { orc: 0, axe: 0, audio: 0 };
  const setProgress = () => { $('bar-fill').style.width = `${Math.round(((progress.orc + progress.axe) / 2) * 100)}%`; };
  const audio = new AudioManager(CFG.urls.audio);
  const audioReady = audio.init((p) => { progress.audio = p; setProgress(); }).catch((e) => { console.warn('audio disabled', e); progress.audio = 1; setProgress(); });
  const [orcGltf, axeGltf] = await Promise.all([
    loadGLB(CFG.urls.orc, (p) => { progress.orc = p; setProgress(); }),
    loadGLB(CFG.urls.axe, (p) => { progress.axe = p; setProgress(); }),
  ]);
  prepareModel(orcGltf.scene, renderer);
  prepareModel(axeGltf.scene, renderer);
  $('loading-note').textContent = 'Building the clearing…';

  // --- world ---
  const rock = createRock();
  let forest = null;
  if (params.has('plain')) {
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x3d4a2c, 1.0));
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
    sun.position.set(4, 9, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
    scene.add(sun);
    const g = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x59673f, roughness: 1 }));
    g.receiveShadow = true;
    scene.add(g);
    app.sun = sun;
  } else {
    forest = buildForest(scene, { rock, renderer, maxAnisotropy: renderer.capabilities.getMaxAnisotropy() });
    scene.background = null;
    app.sun = forest.sun;
  }
  scene.add(rock.mesh);

  // --- orc + axe ---
  const orc = new THREE.Group();
  orc.add(orcGltf.scene);
  scene.add(orc);
  const rig = new OrcRig(orcGltf.scene);
  const axe = new THREE.Group();
  axe.name = 'AxeGrip';
  const axeModel = axeGltf.scene;
  axeModel.scale.setScalar(CFG.axeScale);
  axe.add(axeModel);
  rig.bones.Socket_R.add(axe);        // rigid weapon socket on the right-hand bone

  const solver = new Solver(rig, CFG);
  Object.assign(app, { renderer, scene, camera, controls, orc, rig, axe, axeModel, ground: null, solver, rock, forest, audio });

  /** place the axe in the socket from the calibration in config.js (rest-frame offset / orientation) */
  app.attachAxe = () => {
    const inv = rig.rest.Socket_R.wq.clone().invert();
    const { pos, head, edge } = CFG.grip;
    axe.position.copy(pos).applyQuaternion(inv);
    const z = new THREE.Vector3().crossVectors(edge, head).normalize();
    const y = head.clone().normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    axe.quaternion.copy(inv).multiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
    axeModel.scale.setScalar(CFG.axeScale);
    solver.refreshGrip();
  };
  app.attachAxe();

  {
    // Stage 2 evidence: bounding boxes and the scale decision (printed to the console on every load)
    const orcSize = new THREE.Box3().setFromObject(orcGltf.scene).getSize(new THREE.Vector3());
    const axeBox = new THREE.Box3();
    axeModel.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); axeBox.union(o.geometry.boundingBox); } });
    const a = axeBox.getSize(new THREE.Vector3()).multiplyScalar(CFG.axeScale);
    console.info(`[scale] orc ${orcSize.y.toFixed(2)} m tall, feet on y=0; axe (uniform scale ${CFG.axeScale}): ${a.y.toFixed(2)} m long, blade ${a.x.toFixed(2)} m wide, handle diameter ${(0.117 * CFG.axeScale * 100).toFixed(1)} cm`);
  }

  // --- animation ---
  app.handPose = solver.gripPose;
  app.stance = createStancePose();
  app.pose = clonePose(app.stance);
  app.applyPose = () => { solver.refreshGrip(); solver.apply(app.pose); };
  app.applyPose();
  app.ctx = { rock };
  const ctrl = new AnimController({ solver, stance: app.stance, ctx: app.ctx });
  ctrl.register(raiseAction).register(chestAction).register(slamAction);
  app.ctrl = ctrl;
  {
    // cutting-edge sample points of the axe in its own frame (+X = edge side)
    const pts = [];
    let maxX = -Infinity;
    axeModel.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, p.getX(i)); } });
    axeModel.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getX(i) > maxX - 0.09) pts.push(p.getX(i), p.getY(i), p.getZ(i));
    });
    app.ctx.axe = { edge: new Float32Array(pts), scale: CFG.axeScale, maxX };
  }

  // --- effects, audio, UI ---
  const fx = new Effects(scene, camera);
  app.fx = fx;
  wireEvents({ ctrl, audio, fx, ctx: app.ctx });
  const ui = createUI({
    ctrl, audio,
    onSlowmo: (s) => { app.timeScale = s; ctrl.timeScale = s; audio.setTimeScale(s); },
  });
  app.ui = ui;
  app.timeScale = 1;
  app.paused = params.has('lab') && !params.has('run');
  app.update = (dt) => {
    if (app.paused) return;
    ctrl.update(dt);
    fx.update(dt * app.timeScale);
  };

  /** deterministic stepping for inspection / tests: advance the simulation by `seconds` in fixed `dt` steps (no rendering) */
  app.stepSeconds = (seconds, dt = 1 / 60) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { ctrl.update(dt); fx.update(dt * app.timeScale); }
  };

  // developer helper: render the same camera at several action times (used for the inspections)
  const viewCam = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  app.multiView = null;
  app.setViews = (views) => { app.multiView = views; };
  app.sheet = (name, times, cam, idleT = 0) => {
    app.paused = true;
    app.setViews(times.map((t) => ({
      pos: cam.pos, target: cam.target, fov: cam.fov || 30,
      before: () => { solver.apply(ctrl.poseAt(name, t, idleT)); },
    })));
  };
  /** inspection: simulate an action with fixed steps and photograph the real scene at the given action times */
  app.captureSequence = (name, times, opts = {}) => {
    app.freeze = false;
    app.paused = true;
    fx.clear();
    ctrl.active = null;
    app.timeScale = opts.timeScale ?? 1; ctrl.timeScale = app.timeScale;
    let t = 0;
    ctrl.play(name);
    const pos = opts.pos || camera.position.clone(), target = opts.target || controls.target.clone();
    app.multiView = times.map((ts) => {
      const view = { pos: pos.clone(), target: target.clone(), fov: opts.fov || camera.fov };
      view.before = () => {
        app.stepSeconds(ts - t); t = ts;
        if (opts.follow) opts.follow(view, ts);          // e.g. keep the camera on the hand
      };
      return view;
    });
    return app.renderOnce();
  };
  app.renderOnce = () => { renderViews(); app.multiView = null; app.freeze = true; return 'captured'; };
  const renderViews = () => {
    const size = renderer.getSize(new THREE.Vector2());
    const n = app.multiView.length;
    const cols = n <= 2 ? n : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const w = Math.floor(size.x / cols), h = Math.floor(size.y / rows);
    renderer.setScissorTest(true);
    app.multiView.forEach((v, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      renderer.setViewport(cx * w, size.y - (cy + 1) * h, w, h);
      renderer.setScissor(cx * w, size.y - (cy + 1) * h, w, h);
      v.before?.();
      viewCam.aspect = w / h;
      viewCam.fov = v.fov || 30;
      viewCam.position.copy(v.pos);
      viewCam.up.set(0, 1, 0);
      viewCam.lookAt(v.target);
      viewCam.updateProjectionMatrix();
      renderer.render(scene, viewCam);
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
  };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole character in frame on narrow screens
    const base = CFG.camera.fov;
    camera.fov = camera.aspect < 1.1 ? Math.min(70, base * (1.1 / Math.max(camera.aspect, 0.45)) ** 0.85) : base;
    camera.updateProjectionMatrix();
    fx.setViewport(h * renderer.getPixelRatio(), camera.fov);
  }
  window.addEventListener('resize', resize);
  resize();

  if (params.has('lab')) {
    const { createLab } = await import('./lab.js');
    createLab(app);
  }
  audioReady.catch(() => {});   // audio keeps decoding in the background; it never blocks the start

  const timer = new THREE.Timer();
  const shake = new THREE.Vector3();
  const framing = new THREE.Vector3();           // gentle per-action camera crane so the whole action stays in frame
  const smoothFrame = new THREE.Vector3();
  let shakeRoll = 0;
  renderer.setAnimationLoop(() => {
    timer.update();
    if (app.freeze) return;
    const dt = Math.min(timer.getDelta(), 0.05);
    // remove last frame's camera shake before OrbitControls integrates
    camera.position.sub(shake).sub(framing);
    camera.rotation.z -= shakeRoll;
    app.update(dt);
    forest?.update(performance.now() / 1000);
    controls.update();
    if (!app.multiView) {
      // framing offset follows the action's blend weight (smooth in and out)
      const a = ctrl.active ? CFG.camera.framing[ctrl.active.name] : null;
      if (a) smoothFrame.set(a[0], a[1], a[2]);
      framing.copy(smoothFrame).multiplyScalar(ctrl.lastWeight);
      shake.copy(fx.shakeOffset); shakeRoll = fx.shakeRoll;
      camera.position.add(shake).add(framing);
      camera.rotation.z += shakeRoll;
    } else { shake.set(0, 0, 0); framing.set(0, 0, 0); shakeRoll = 0; }
    ui.update();
    if (app.multiView) renderViews(); else renderer.render(scene, camera);
  });

  $('loading').classList.add('hidden');
  app.ready = true;
}

init().catch(fail);
