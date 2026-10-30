import * as THREE from 'three';
import { mulberry32, makeStoneTexture } from './rock.js';

const { Vector3 } = THREE;

// ---------------------------------------------------------------- procedural textures
function canvasTex(size, draw, { repeat = null, srgb = true, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function grassTexture(rnd) {
  return canvasTex(512, (g, s) => {
    g.fillStyle = '#4c7a2b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const x = rnd() * s, y = rnd() * s, l = 3 + rnd() * 9, a = (rnd() - 0.5) * 0.9 - Math.PI / 2;
      const h = 80 + rnd() * 25, sat = 38 + rnd() * 24, lum = 18 + rnd() * 26;
      g.strokeStyle = `hsl(${h},${sat}%,${lum}%)`;
      g.lineWidth = 1 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      // wrap so the tile has no seams
      if (x < 12) { g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      if (y < 12) { g.beginPath(); g.moveTo(x, y + s); g.lineTo(x + Math.cos(a) * l, y + s + Math.sin(a) * l); g.stroke(); }
    }
  }, { repeat: 22 });
}

function dirtTextures(rnd) {
  const draw = (bump) => (g, s) => {
    g.fillStyle = bump ? '#808080' : '#6b4f33'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const x = rnd() * s, y = rnd() * s, r = 0.6 + rnd() * (bump ? 6 : 3);
      const v = bump ? Math.floor(70 + rnd() * 120) : null;
      g.fillStyle = bump ? `rgb(${v},${v},${v})` : `hsl(${24 + rnd() * 10},${28 + rnd() * 16}%,${22 + rnd() * 24}%)`;
      g.globalAlpha = bump ? 0.4 : 0.55;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  };
  return { map: canvasTex(512, draw(false), { repeat: 3 }), bump: canvasTex(512, draw(true), { repeat: 3, srgb: false }) };
}

function radialAlpha(rnd) {
  const t = canvasTex(256, (g, s) => {
    const rg = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
    rg.addColorStop(0, '#fff'); rg.addColorStop(0.7, '#cfcfcf'); rg.addColorStop(1, '#000');
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
    // ragged edge
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 140; i++) { const a = rnd() * 6.283, r = s * (0.42 + rnd() * 0.08); g.fillStyle = '#000'; g.beginPath(); g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 3 + rnd() * 8, 0, 7); g.fill(); }
  }, { srgb: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function tuftTexture(rnd) {
  return canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x0 = s * (0.15 + rnd() * 0.7), lean = (rnd() - 0.5) * s * 0.5, h = s * (0.55 + rnd() * 0.42);
      const grad = g.createLinearGradient(0, s, 0, s - h);
      grad.addColorStop(0, '#4a7a28'); grad.addColorStop(1, `hsl(${80 + rnd() * 20},58%,${50 + rnd() * 16}%)`);
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x0 - 3, s); g.quadraticCurveTo(x0 + lean * 0.3, s - h * 0.6, x0 + lean, s - h); g.quadraticCurveTo(x0 + lean * 0.3 + 3, s - h * 0.55, x0 + 3, s); g.fill();
    }
  }, { srgb: true });
}

// ---------------------------------------------------------------- noise helpers
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sm = (t) => t * t * (3 - 2 * t);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sm(fx) + (c - a) * sm(fy) + (a - b - c + d) * sm(fx) * sm(fy);
}
const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1) + 0.15 * vnoise(x * 4.3, y * 4.3);

// ---------------------------------------------------------------- wind shader patch
function addWind(material, uniforms, { amp = 0.06, freq = 1.6, byHeight = true, byAttr = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;${byAttr ? '\nattribute float aSway;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float wph = uTime * ${freq.toFixed(2)} + ip.x * 0.7 + ip.z * 0.55;
        float wgt = ${byAttr ? 'aSway' : byHeight ? 'clamp(position.y, 0.0, 1.0)' : '1.0'};
        transformed.x += sin(wph) * ${amp.toFixed(3)} * wgt;
        transformed.z += cos(wph * 0.83 + 1.3) * ${(amp * 0.6).toFixed(3)} * wgt;`);
  };
  material.customProgramCacheKey = () => `wind${amp}${freq}${byAttr}`;
}

// ---------------------------------------------------------------- tree templates (merged, vertex coloured)
function mergeGeos(list) {
  let nV = 0, nI = 0;
  for (const g of list) { nV += g.attributes.position.count; nI += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), col = new Float32Array(nV * 3), sway = new Float32Array(nV);
  const idx = new Uint32Array(nI);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, s = g.attributes.aSway;
    pos.set(p.array, vo * 3); nor.set(n.array, vo * 3); col.set(c.array, vo * 3); sway.set(s.array, vo);
    const gi = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function colored(geo, color, sway, rnd, jitter = 0.08, matrix = null) {
  if (matrix) geo.applyMatrix4(matrix);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3), sw = new Float32Array(n);
  const c = new THREE.Color(color);
  const p = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    const k = 1 + (rnd() - 0.5) * jitter * 2 + (p.getY(i) * 0.01);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    sw[i] = sway;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

function makeBroadleaf(rnd) {
  const parts = [];
  const H = 5.2;
  const trunk = new THREE.CylinderGeometry(0.15, 0.26, H, 8, 3).toNonIndexed();
  parts.push(colored(trunk, 0x5b4129, 0, rnd, 0.1, new THREE.Matrix4().makeTranslation(0, H / 2, 0)));
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * 6.283 + rnd() * 0.8, r = 0.9 + rnd() * 0.9;
    const s = 1.5 + rnd() * 0.9;
    const m = new THREE.Matrix4().compose(new Vector3(Math.cos(a) * r, H + 0.3 + rnd() * 1.6, Math.sin(a) * r), new THREE.Quaternion(), new Vector3(s, s * 0.85, s));
    const g = new THREE.IcosahedronGeometry(1, 1);
    const tint = [0x4f8a35, 0x5e9a3a, 0x487f30, 0x6aa63f][i % 4];
    parts.push(colored(g, tint, 1, rnd, 0.14, m));
  }
  parts.push(colored(new THREE.IcosahedronGeometry(1, 1), 0x41742d, 1, rnd, 0.14, new THREE.Matrix4().compose(new Vector3(0, H + 2.4, 0), new THREE.Quaternion(), new Vector3(1.8, 1.5, 1.8))));
  return mergeGeos(parts);
}

function makePine(rnd) {
  const parts = [];
  const H = 4.2;
  parts.push(colored(new THREE.CylinderGeometry(0.1, 0.2, H, 7, 2).toNonIndexed(), 0x4e3722, 0, rnd, 0.1, new THREE.Matrix4().makeTranslation(0, H / 2, 0)));
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = 1.9 * (1 - t * 0.78), h = 2.4 - t * 0.5;
    const tint = [0x3b7a45, 0x41844a, 0x35703f, 0x3d7d44, 0x488f4f][i % 5];
    parts.push(colored(new THREE.ConeGeometry(r, h, 9, 1).toNonIndexed(), tint, 1, rnd, 0.12, new THREE.Matrix4().makeTranslation(0, H * 0.55 + i * 1.25 + h * 0.5, 0)));
  }
  return mergeGeos(parts);
}

// ---------------------------------------------------------------- main builder
/**
 * Builds the clearing and returns { update(timeSeconds), sun, dispose(), clearZone }.
 * The orc stands at the origin facing +Z; the rock is in front; everything inside `clearZone` stays free of
 * grass / foliage so the hand, the weapon and the impact stay readable.
 */
export function buildForest(scene, { rock, renderer, maxAnisotropy = 4 } = {}) {
  const rnd = mulberry32(2024);
  const uniforms = { uTime: { value: 0 } };
  const disposables = [];
  const root = new THREE.Group();
  root.name = 'Forest';
  scene.add(root);

  // ---- sky, fog, light ----
  const fogColor = new THREE.Color(0xb7cdc2);
  scene.fog = new THREE.Fog(fogColor, 16, 78);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new Vector3(0.45, 0.62, 0.5).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 horizon = vec3(0.80, 0.88, 0.84), mid = vec3(0.50, 0.70, 0.88), zenith = vec3(0.24, 0.47, 0.80);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
        c = mix(c, zenith, smoothstep(0.25, 0.95, h));
        float s = max(dot(normalize(vDir), normalize(uSun)), 0.0);
        c += vec3(1.0, 0.88, 0.62) * (pow(s, 600.0) * 1.2 + pow(s, 8.0) * 0.16);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMat);
  sky.renderOrder = -10;
  root.add(sky);
  disposables.push(sky.geometry, skyMat);

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4d5b2c, 1.05);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 3.4);
  sun.position.set(4.5, 9.5, 5.5);
  sun.target.position.set(0, 1.0, 0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 2, far: 30 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.02;
  root.add(sun, sun.target);
  skyMat.uniforms.uSun.value.copy(sun.position).normalize();

  // ---- ground ----
  const grassTex = grassTexture(rnd);
  grassTex.anisotropy = maxAnisotropy;
  const R = 34, SEG = 170;
  const gGeo = new THREE.PlaneGeometry(R * 2, R * 2, SEG, SEG).rotateX(-Math.PI / 2);
  {
    const p = gGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
      const edge = THREE.MathUtils.smoothstep(r, 5.5, 16);
      const h = (fbm(x * 0.09 + 5, z * 0.09 + 5) - 0.45) * 2.6 * edge + (fbm(x * 0.5, z * 0.5) - 0.5) * 0.12 * THREE.MathUtils.smoothstep(r, 3.2, 7);
      p.setY(i, h);
      const v = 0.8 + 0.35 * fbm(x * 0.18 + 40, z * 0.18);
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.92;
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true;
  root.add(ground);
  const far = new THREE.Mesh(new THREE.CircleGeometry(400, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a6d2c, roughness: 1 }));
  far.position.y = -0.4;
  root.add(far);
  disposables.push(gGeo, ground.material, far.geometry, far.material, grassTex);

  // dirt patch beneath the orc and in front towards the rock: flat (feet must plant exactly), uneven by bump + mounds
  const dirt = dirtTextures(rnd);
  const alpha = radialAlpha(rnd);
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirt.map, bumpMap: dirt.bump, bumpScale: 2.2, alphaMap: alpha, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const dirtMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), dirtMat);
  dirtMesh.scale.set(2.9, 1, 3.5);
  dirtMesh.position.set(-0.15, 0.004, 0.75);
  dirtMesh.receiveShadow = true;
  root.add(dirtMesh);
  disposables.push(dirtMesh.geometry, dirtMat, dirt.map, dirt.bump, alpha);

  // dirt clods / mounds on the rim of the patch (never beneath the feet)
  const moundGeo = new THREE.SphereGeometry(1, 10, 6);
  const moundMat = new THREE.MeshStandardMaterial({ color: 0x6f5238, roughness: 1 });
  const mounds = new THREE.InstancedMesh(moundGeo, moundMat, 16);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new Vector3(), p3 = new Vector3();
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.283, rr = 2.2 + rnd() * 0.8;
    p3.set(-0.15 + Math.cos(a) * rr * 0.95, 0, 0.75 + Math.sin(a) * rr * 1.1);
    const s = 0.07 + rnd() * 0.12;
    s3.set(s * 1.5, s * 0.5, s * 1.2);
    p3.y = -s * 0.15;
    q4.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
    m4.compose(p3, q4, s3);
    mounds.setMatrixAt(i, m4);
  }
  mounds.receiveShadow = true; mounds.castShadow = true;
  root.add(mounds);
  disposables.push(moundGeo, moundMat);

  // ---- grass clumps ----
  const CAM_X = -4.0, CAM_Z = 6.9;
  const clear = { x0: -2.1, x1: 1.6, z0: -1.3, z1: 3.7 };   // action area (orc, swing arc, rock) - no grass here
  const isClear = (x, z, pad = 0) => x > clear.x0 - pad && x < clear.x1 + pad && z > clear.z0 - pad && z < clear.z1 + pad;
  const tuft = new THREE.Group();
  {
    const tufts = tuftTexture(rnd);
    const quad = (rot) => { const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); g.rotateY(rot); return g; };
    const g1 = quad(0), g2 = quad(Math.PI / 3), g3 = quad(-Math.PI / 3);
    const merged = mergeTufts([g1, g2, g3]);
    const mat = new THREE.MeshStandardMaterial({ map: tufts, alphaTest: 0.5, roughness: 1, metalness: 0 });
    addWind(mat, uniforms, { amp: 0.16, freq: 1.9 });
    const COUNT = 2200;
    const inst = new THREE.InstancedMesh(merged, mat, COUNT);
    let n = 0;
    for (let tries = 0; tries < COUNT * 4 && n < COUNT; tries++) {
      const a = rnd() * 6.283, r = 1.0 + Math.pow(rnd(), 0.75) * 20;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (isClear(x, z, 0.25)) continue;
      const nearDirt = Math.hypot((x + 0.15) / 2.6, (z - 0.75) / 3.2) < 1;
      if (nearDirt && rnd() < 0.7) continue;
      const y = (fbm(x * 0.09 + 5, z * 0.09 + 5) - 0.45) * 2.6 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 5.5, 16) + (fbm(x * 0.5, z * 0.5) - 0.5) * 0.12 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 3.2, 7);
      if (Math.hypot(x - CAM_X, z - CAM_Z) < 2.4) continue;           // nothing tall right in front of the lens
      const s = (0.13 + rnd() * 0.2) * (1 + 0.55 * Math.min(1, r / 14));
      p3.set(x, y, z); s3.set(s * 1.7, s, s * 1.7);
      q4.setFromEuler(new THREE.Euler(0, rnd() * 6.283, 0));
      m4.compose(p3, q4, s3);
      inst.setMatrixAt(n++, m4);
    }
    inst.count = n;
    inst.frustumCulled = false;
    inst.receiveShadow = true;
    root.add(inst);
    disposables.push(merged, mat, tufts);
  }

  // ---- stones & small ground details ----
  const stoneTex = makeStoneTexture(7);
  stoneTex.repeat.set(1, 1);
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = stoneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.35 * hash2(p.getX(i) * 9.1, p.getZ(i) * 7.7 + p.getY(i) * 3.3); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    stoneGeo.computeVertexNormals();
  }
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: 0xd8d2c4 });
  const STONES = 46;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, STONES);
  let ns = 0;
  const addStone = (x, z, s) => {
    p3.set(x, s * 0.25, z); s3.set(s, s, s * (0.8 + rnd() * 0.4));
    q4.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 6.283, rnd() * 0.5));
    m4.compose(p3, q4, s3); stones.setMatrixAt(ns++, m4);
  };
  // pebbles ringed around the impact rock (outside the swing path)
  if (rock) for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, rr = 0.95 + rnd() * 0.5; addStone(rock.center.x + Math.cos(a) * rr * 1.05, rock.center.z + Math.sin(a) * rr, 0.05 + rnd() * 0.1); }
  for (let tries = 0; ns < STONES && tries < 800; tries++) {
    const a = rnd() * 6.283, r = 1.6 + rnd() * 13;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isClear(x, z, -0.2) && !(rock && Math.hypot(x - rock.center.x, z - rock.center.z) < 1.9)) continue;
    if (isClear(x, z, 0)) continue;
    addStone(x, z, 0.06 + Math.pow(rnd(), 2.2) * 0.34);
  }
  stones.count = ns; stones.castShadow = true; stones.receiveShadow = true;
  root.add(stones);
  disposables.push(stoneGeo, stoneMat, stoneTex);

  // ---- bushes, trees, hills ----
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  addWind(leafMat, uniforms, { amp: 0.09, freq: 1.1, byAttr: true });
  const broadleaf = makeBroadleaf(rnd), pine = makePine(rnd);
  const placeTrees = (geo, count, rMin, rMax, sMin, sMax, zBias) => {
    const inst = new THREE.InstancedMesh(geo, leafMat, count);
    const tint = new THREE.Color();
    let n = 0;
    for (let tries = 0; tries < count * 30 && n < count; tries++) {
      const a = rnd() * 6.283, r = rMin + rnd() * (rMax - rMin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 4 && Math.abs(x) < 14 && rnd() < 0.85) continue;                 // keep the view side open
      if (zBias && z > 0 && rnd() < 0.55) continue;
      const s = sMin + rnd() * (sMax - sMin);
      const y = (fbm(x * 0.09 + 5, z * 0.09 + 5) - 0.45) * 2.6 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 5.5, 16) - 0.15;
      p3.set(x, y, z); s3.set(s, s * (0.9 + rnd() * 0.4), s);
      q4.setFromEuler(new THREE.Euler(0, rnd() * 6.283, 0));
      m4.compose(p3, q4, s3);
      inst.setMatrixAt(n, m4);
      tint.setHSL(0.24 + rnd() * 0.08, 0.1 + rnd() * 0.25, 0.8 + rnd() * 0.2);
      inst.setColorAt(n, tint);
      n++;
    }
    inst.count = n;
    inst.castShadow = false; inst.receiveShadow = false; inst.frustumCulled = false;
    root.add(inst);
    return inst;
  };
  placeTrees(broadleaf, 30, 12, 38, 1.0, 2.0, true);
  placeTrees(pine, 42, 11, 44, 1.1, 2.4, true);
  placeTrees(broadleaf, 12, 8.5, 12, 0.34, 0.5, false);   // bushes: small round shrubs around the clearing edge
  disposables.push(broadleaf, pine, leafMat);

  // distant hills (silhouette ring that picks up the fog for atmospheric depth)
  {
    const hillGeo = new THREE.CylinderGeometry(110, 110, 30, 96, 6, true);
    const p = hillGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
      const top = y > 0;
      p.setY(i, top ? 14 + 18 * fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3) + 5 * Math.sin(a * 5) : -6);
    }
    hillGeo.computeVertexNormals();
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x5e7f63, side: THREE.BackSide, fog: true });
    const hills = new THREE.Mesh(hillGeo, hillMat);
    hills.position.y = -2;
    root.add(hills);
    disposables.push(hillGeo, hillMat);
  }

  // drifting pollen / dust motes (cheap life in the light)
  const MOTES = 90;
  const motePos = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) { motePos[i * 3] = (rnd() - 0.5) * 14; motePos[i * 3 + 1] = 0.3 + rnd() * 4; motePos[i * 3 + 2] = (rnd() - 0.5) * 14 - 1; moteSeed[i] = rnd() * 100; }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos.slice(), 3));
  const moteMat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  root.add(motes);
  disposables.push(moteGeo, moteMat);

  return {
    root, sun, hemi, clearZone: clear,
    update(time) {
      uniforms.uTime.value = time;
      const p = moteGeo.attributes.position;
      for (let i = 0; i < MOTES; i++) {
        const s = moteSeed[i];
        p.setXYZ(i, motePos[i * 3] + Math.sin(time * 0.21 + s) * 0.7, motePos[i * 3 + 1] + Math.sin(time * 0.33 + s * 2) * 0.35, motePos[i * 3 + 2] + Math.cos(time * 0.17 + s) * 0.6);
      }
      p.needsUpdate = true;
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose?.();
      mounds.dispose(); stones.dispose();
    },
  };
}

function mergeTufts(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(0, 1, 0); uv.push(u.getX(i), u.getY(i)); }
    for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    // reversed copy: every card is visible from both sides with the same (upward) normal -> no black back faces
    for (let i = 0; i < g.index.count; i += 3) idx.push(g.index.getX(i) + off, g.index.getX(i + 2) + off, g.index.getX(i + 1) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
