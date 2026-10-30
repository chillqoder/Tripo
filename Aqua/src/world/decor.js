// Castle, plants, aerator (+ airline hose) and the three large rocks, each placed once,
// seated in the sand, with collision/contact proxies and named attachment points.
import * as THREE from 'three';
import { TANK, LAYOUT } from '../config/scene.js';
import { CASTLE, AERATOR, PLANTS, STONES } from '../config/assets.js';
import { sandHeight } from './substrate.js';
import { patchUnderwater } from '../render/materials.js';
import { rigPlant } from '../anim/plants.js';
import { attachProxy } from '../render/lod.js';

// Recentre a geometry on x/z with base at y = 0. For plants the pivot is the root centre
// (mean x/z of the lowest vertices) rather than the bounding-box centre.
export function rebase(geometry, mode = 'bbox') {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  let cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  if (mode === 'root') {
    const p = geometry.attributes.position, lim = bb.min.y + (bb.max.y - bb.min.y) * 0.03;
    let sx = 0, sz = 0, n = 0;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < lim) { sx += p.getX(i); sz += p.getZ(i); n++; }
    if (n) { cx = sx / n; cz = sz / n; }
  }
  const off = new THREE.Vector3(-cx, -bb.min.y, -cz);
  geometry.translate(off.x, off.y, off.z);
  geometry.computeBoundingBox();
  return off;
}

// lowest sand height under a footprint, so bases are seated rather than floating on a slope
function seatHeight(x, z, r) {
  let m = Infinity;
  for (let a = 0; a < 8; a++) m = Math.min(m, sandHeight(x + Math.cos(a) * r, z + Math.sin(a) * r));
  return Math.min(m, sandHeight(x, z));
}

function makeMesh(asset, name, { shadow = true } = {}) {
  const mesh = new THREE.Mesh(asset.geometry.clone(), asset.material.clone());
  mesh.name = name;
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  return mesh;
}

export function buildDecor(scene, assets, obstacles) {
  const out = { plants: [], attach: {}, footprints: [], rocks: [] };
  const up = new THREE.Vector3(0, 1, 0);

  // ---- castle ---------------------------------------------------------------------
  if (assets.castle) {
    const L = LAYOUT.castle;
    const mesh = makeMesh(assets.castle, 'castle');
    attachProxy(mesh, assets.castle.proxy, rebase(mesh.geometry));
    const s = CASTLE.height / assets.castle.bbox.getSize(new THREE.Vector3()).y;
    mesh.scale.setScalar(s);
    mesh.rotation.y = L.rotY;
    const y = seatHeight(L.x, L.z, 1.2) - L.sink;
    mesh.position.set(L.x, y, L.z);
    mesh.material.roughness = 0.9; mesh.material.metalness = 0.0;
    patchUnderwater(mesh.material);
    scene.add(mesh);
    const bbx = assets.castle.bbox;
    const ox = (bbx.min.x + bbx.max.x) / 2;
    for (const b of CASTLE.blocks) {
      const cx = ((b.x[0] + b.x[1]) / 2 - ox) * s, hx = ((b.x[1] - b.x[0]) / 2) * s;
      const hz = ((b.z[1] - b.z[0]) / 2) * s, h = b.h * s;
      const c = Math.cos(L.rotY), sn = Math.sin(L.rotY);
      obstacles.addBox('castle', L.x + cx * c, y + h / 2, L.z - cx * sn, hx, h / 2, hz, L.rotY);
    }
    out.footprints.push({ x: L.x, z: L.z, hx: 0.5 * s + 0.1, hz: 0.22 * s + 0.1, rot: L.rotY });
    out.castle = mesh;
  }

  // ---- aerator ----------------------------------------------------------------------
  if (assets.aerator) {
    const L = LAYOUT.aerator;
    const mesh = makeMesh(assets.aerator, 'aerator');
    const off = rebase(mesh.geometry);
    attachProxy(mesh, assets.aerator.proxy, off);
    const s = AERATOR.height / assets.aerator.bbox.getSize(new THREE.Vector3()).y;
    mesh.scale.setScalar(s); mesh.rotation.y = L.rotY;
    const y = seatHeight(L.x, L.z, 0.6) - L.sink;
    mesh.position.set(L.x, y, L.z);
    mesh.material.roughness = 0.85;
    patchUnderwater(mesh.material);
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const toWorld = (p) => new THREE.Vector3(p[0] + off.x, p[1] + off.y, p[2] + off.z).applyMatrix4(mesh.matrixWorld);
    const outlet = toWorld(AERATOR.outlet);
    const outletDir = new THREE.Vector3(...AERATOR.outletDir).applyAxisAngle(up, L.rotY).normalize();
    const conn = toWorld(AERATOR.airConnector);
    out.attach.bubbleOutlet = { pos: outlet, dir: outletDir };
    out.attach.hoseConnection = conn;
    obstacles.addCylinder('aerator', L.x, L.z, AERATOR.sponge.r * s + 0.05, y - 0.2, y + AERATOR.sponge.y[1] * s);
    obstacles.addCylinder('aerator-tube', L.x, L.z, 0.35, y, y + AERATOR.height + 0.1);
    out.footprints.push({ x: L.x, z: L.z, r: AERATOR.sponge.r * s + 0.08 });
    out.aerator = mesh;

    // small air connector (the model has no separate air nipple) + flexible airline hose
    const nipple = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x1a1d1c, roughness: 0.45 }));
    nipple.position.copy(conn).add(new THREE.Vector3(0, 0.05, 0));
    patchUnderwater(nipple.material);
    scene.add(nipple);
    const top = conn.clone().add(new THREE.Vector3(0, 0.11, 0));
    const backZ = -TANK.hz + 0.09;
    const rimY = TANK.h + TANK.rim + 0.1;
    const outZ = -TANK.hz - TANK.glass - 0.18;
    const pts = [
      top,
      top.clone().add(new THREE.Vector3(0.0, 0.35, 0)),
      new THREE.Vector3(top.x + 0.12, top.y + 0.85, (top.z + backZ) / 2),
      new THREE.Vector3(top.x + 0.2, top.y + 1.6, backZ),
      new THREE.Vector3(top.x + 0.25, TANK.waterline - 0.4, backZ),
      new THREE.Vector3(top.x + 0.28, TANK.h - 0.3, backZ),
      new THREE.Vector3(top.x + 0.3, rimY - 0.05, backZ + 0.02),
      new THREE.Vector3(top.x + 0.3, rimY + 0.08, (backZ + outZ) / 2),
      new THREE.Vector3(top.x + 0.3, rimY - 0.05, outZ),
      new THREE.Vector3(top.x + 0.3, TANK.h - 0.6, outZ - 0.03),
      new THREE.Vector3(top.x + 0.3, TANK.h - 1.4, outZ - 0.05),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const hoseMat = new THREE.MeshPhysicalMaterial({ color: 0x40514b, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 0.6 });
    patchUnderwater(hoseMat, { caustics: 0.5 });
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.032, 10, false), hoseMat);
    hose.name = 'airline-hose';
    hose.castShadow = true;
    scene.add(hose);
    for (let i = 0; i < 6; i++) obstacles.addCapsule('hose', curve.getPoint(i / 10).toArray(), curve.getPoint((i + 1) / 10).toArray(), 0.12);
    out.hose = hose;
  }

  // ---- plants ------------------------------------------------------------------------
  let seed = 1;
  for (const [key, cfg] of Object.entries(PLANTS)) {
    const asset = assets[key];
    if (!asset) continue;
    const L = LAYOUT.plants[key];
    const mesh = makeMesh(asset, key);
    const rootOff = rebase(mesh.geometry, 'root');
    const modelH = mesh.geometry.boundingBox.max.y;
    const s = cfg.height / modelH;
    mesh.scale.setScalar(s); mesh.rotation.y = L.rotY;
    // roots slightly into the sand; Anubias rhizome stays on top of it
    const y = sandHeight(L.x, L.z) - (cfg.rhizomeLift ? -cfg.rhizomeLift + 0.04 : 0.1);
    mesh.position.set(L.x, y, L.z);
    mesh.material.roughness = 0.7; mesh.material.side = THREE.DoubleSide;
    patchUnderwater(mesh.material, { caustics: 0.8 });
    const uniforms = rigPlant(mesh, cfg.kind, cfg.stiffness, modelH, seed++ * 1.7);
    attachProxy(mesh, asset.proxy, rootOff);
    scene.add(mesh);
    const bb = mesh.geometry.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz);
    const rx = Math.max(sz.x, sz.z) * s * 0.5;
    const minor = Math.min(sz.x, sz.z) * s * 0.5;
    out.plants.push({ key, mesh, uniforms, scale: s, rotY: L.rotY, root: new THREE.Vector3(L.x, y, L.z), height: cfg.height, stiffness: cfg.stiffness });
    out.attach[`${key}Root`] = new THREE.Vector3(L.x, y, L.z);
    // foliage proxy: a capsule along the plant's long horizontal axis, soft (steering) +
    // a solid core around the stems
    const ax = new THREE.Vector3(sz.x >= sz.z ? 1 : 0, 0, sz.x >= sz.z ? 0 : 1).applyAxisAngle(up, L.rotY).multiplyScalar(rx * 0.55);
    const h0 = y + cfg.height * 0.45;
    obstacles.addCapsule(`${key}-foliage`, [L.x - ax.x, h0, L.z - ax.z], [L.x + ax.x, h0, L.z + ax.z], Math.max(minor, cfg.height * 0.42), false);
    obstacles.addCylinder(`${key}-stems`, L.x, L.z, Math.max(0.25, minor * 0.6), y - 0.2, y + cfg.height * 0.92);
    out.footprints.push({ x: L.x, z: L.z, r: Math.max(0.3, minor * 0.6) });
  }

  // ---- large rocks: one placement of each extracted rock -------------------------------
  STONES.rocks.forEach((rc, i) => {
    const asset = assets[`rock${i}`];
    if (!asset) return;
    const L = LAYOUT.rocks[i];
    const mesh = makeMesh(asset, `rock-${i}`);
    mesh.scale.setScalar(rc.scale); mesh.rotation.y = L.rotY;
    const sz = asset.bbox.getSize(new THREE.Vector3()).multiplyScalar(rc.scale);
    const y = seatHeight(L.x, L.z, Math.min(sz.x, sz.z) * 0.4) - sz.y * 0.06;
    mesh.position.set(L.x, y, L.z);
    mesh.material.roughness = 0.8;
    patchUnderwater(mesh.material);
    scene.add(mesh);
    const r = Math.max(sz.x, sz.z) * 0.5;
    obstacles.addEllipsoid(`rock-${i}`, L.x, y + sz.y * 0.35, L.z, r * 1.02, sz.y * 0.75, r * 1.02);
    out.footprints.push({ x: L.x, z: L.z, r: r * 0.95 });
    out.rocks.push({ mesh, x: L.x, z: L.z, r, top: y + sz.y });
  });

  out.keepOut = (x, z, pr) => out.footprints.some((f) => {
    if (f.r !== undefined) return Math.hypot(x - f.x, z - f.z) < f.r + pr;
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
    return Math.abs(dx * c - dz * s) < f.hx + pr && Math.abs(dx * s + dz * c) < f.hz + pr;
  });
  return out;
}
