import * as THREE from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { FINGERS } from './rig/grip.js';
import { clonePose, axeQuat } from './anim/pose.js';

/** Developer lab (?lab): calibrate the axe grip and finger curl, jump to inspection cameras. */
export function createLab(app) {
  const { CFG, rig, controls, camera } = app;
  const gui = new GUI({ title: 'Grip lab', width: 300 });
  const g = { pos: CFG.grip.pos.clone(), headYaw: 34.14, headPitch: -0.5, roll: 0, scale: CFG.axeScale };
  app.labGrip = g;

  const applyGripParams = () => {
    const yaw = THREE.MathUtils.degToRad(g.headYaw);
    const pitch = THREE.MathUtils.degToRad(g.headPitch);
    const head = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    // edge: perpendicular to head, starting at the fingertip direction and rolled about the handle
    let e0 = new THREE.Vector3(-Math.cos(yaw), 0, -Math.sin(yaw));
    e0.addScaledVector(head, -e0.dot(head)).normalize();
    e0.applyAxisAngle(head, THREE.MathUtils.degToRad(g.roll));
    CFG.grip.pos.copy(g.pos);
    CFG.grip.head.copy(head);
    CFG.grip.edge.copy(e0);
    CFG.axeScale = g.scale;
    app.attachAxe();
  };
  app.applyGripParams = applyGripParams;

  const fg = gui.addFolder('Axe attachment');
  fg.add(g.pos, 'x', -0.3, 0.3, 0.001).onChange(applyGripParams);
  fg.add(g.pos, 'y', -0.3, 0.1, 0.001).onChange(applyGripParams);
  fg.add(g.pos, 'z', -0.3, 0.3, 0.001).onChange(applyGripParams);
  fg.add(g, 'headYaw', -90, 90, 0.5).onChange(applyGripParams);
  fg.add(g, 'headPitch', -90, 90, 0.5).onChange(applyGripParams);
  fg.add(g, 'roll', -180, 180, 0.5).onChange(applyGripParams);
  fg.add(g, 'scale', 0.4, 1.2, 0.005).onChange(applyGripParams);

  const hp = app.handPose;
  const hf = gui.addFolder('Fingers (deg)');
  for (const f of FINGERS) {
    const sub = hf.addFolder(f);
    ['MCP', 'PIP', 'DIP'].forEach((n, i) => sub.add(hp.fingers[f], i, -20, 110, 0.5).name(n).onChange(app.applyPose));
    sub.close();
  }
  const ht = gui.addFolder('Thumb (deg)');
  ['CMC', 'MCP', 'IP'].forEach((n, j) => {
    ht.add(hp.thumb[j], 0, -30, 90, 0.5).name(n + ' flex').onChange(app.applyPose);
    ht.add(hp.thumb[j], 1, -90, 60, 0.5).name(n + ' sweep').onChange(app.applyPose);
  });

  const look = (offset, dist = 0.75, anchor = 'Socket_R') => {
    const hand = rig.worldPos(anchor);
    const dir = offset.clone().normalize();
    controls.minDistance = 0.1;
    controls.target.copy(hand);
    camera.position.copy(hand).addScaledVector(dir, dist);
    controls.update();
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cams = {
    palm() { look(V(0.25, -1, 0.45)); },
    back() { look(V(0.25, 1, 0.45)); },
    thumbSide() { look(V(0.1, -0.1, 1)); },
    pinkySide() { look(V(0.1, -0.1, -1)); },
    tip() { look(V(-1, -0.25, 0.25)); },
    wrist() { look(V(1, -0.25, 0.25)); },
  };
  app.labLook = look;
  const cg = gui.addFolder('Cameras');
  for (const k of Object.keys(cams)) cg.add(cams, k);
  app.labCams = cams;

  // --- bright, shadow-free lighting for inspections ---
  const fill = [new THREE.AmbientLight(0xffffff, 1.2)];
  for (const [x, y, z] of [[3, 4, 5], [-4, 3, -4], [0, -4, 2]]) { const l = new THREE.DirectionalLight(0xffffff, 1.2); l.position.set(x, y, z); fill.push(l); }
  fill.forEach((l) => { l.visible = false; app.scene.add(l); });
  app.labLighting = (on) => { fill.forEach((l) => (l.visible = on)); app.sun.intensity = on ? 0.8 : 3.0; app.renderer.shadowMap.enabled = true; };

  // --- display pose: the axe-hand held out in front so every side of the grip can be photographed ---
  app.labDisplay = (on = true) => {
    if (!app.stancePose) app.stancePose = app.pose;
    if (!on) { app.pose = app.stancePose; app.applyPose(); return; }
    const p = clonePose(app.stancePose);
    p.armR.root.p.set(-0.42, 1.55, 0.95);
    p.armR.root.q.copy(axeQuat(new THREE.Vector3(0, 0.1, 1), new THREE.Vector3(0, 1, 0.12)));
    p.armR.pole.set(-0.6, -0.6, -0.3);
    app.pose = p;
    app.applyPose();
  };

  /**
   * Grip metrics from the real skinned geometry (hand vertices only): how far hand / finger vertices sit inside the
   * handle cylinder, how much of the handle circumference is touched ("coverage", 12 sectors) and a rigid-attachment
   * check.  Used by the inspections (docs/inspection) and by the grip optimiser.
   */
  let handIdx = null;
  app.gripMetrics = () => {
    const mesh = rig.skinned.find((m) => m.name === 'Orc') || rig.skinned[0];
    const pos = mesh.geometry.attributes.position;
    if (!handIdx) {
      handIdx = [];
      const sock = rig.rest.Socket_R.wp, tmp = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { tmp.fromBufferAttribute(pos, i); if (tmp.distanceTo(sock) < 0.5) handIdx.push(i); }
    }
    app.axe.updateWorldMatrix(true, true);
    mesh.updateWorldMatrix(true, false);
    const o = app.axe.localToWorld(new THREE.Vector3(0, 0, 0));
    const y = app.axe.localToWorld(new THREE.Vector3(0, 1, 0)).sub(o).normalize();
    const u = new THREE.Vector3(0, 1, 0).addScaledVector(y, -y.y);
    if (u.lengthSq() < 0.25) u.set(1, 0, 0);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(y, u);
    const R = 0.0585 * CFG.axeScale;                       // handle radius in metres (median of the prepared GLB)
    const v = new THREE.Vector3(), d = new THREE.Vector3();
    const bins = new Array(12).fill(0);
    let inside = 0, deep = 0, maxPen = 0, contact = 0;
    for (const i of handIdx) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
      d.subVectors(v, o);
      const t = d.dot(y);
      if (Math.abs(t) > 0.13) continue;
      const radial = Math.sqrt(Math.max(d.lengthSq() - t * t, 0));
      if (radial < R) { inside++; maxPen = Math.max(maxPen, R - radial); if (R - radial > 0.008) deep++; }
      if (radial < R + 0.012 && radial > R - 0.006) { contact++; bins[Math.floor(((Math.atan2(d.dot(w), d.dot(u)) + Math.PI) / (2 * Math.PI)) * 12) % 12]++; }
    }
    return {
      handleRadiusMm: +(R * 1000).toFixed(1), insideHandle: inside, deeperThan8mm: deep, maxPenetrationMm: +(maxPen * 1000).toFixed(1),
      contactVerts: contact, wrapCoverageSectors: bins.filter((n) => n >= 3).length, axeLocal: app.axe.position.toArray().concat(app.axe.quaternion.toArray()).map((x) => +x.toFixed(4)),
    };
  };

  /**
   * One-shot verification suite (see docs/inspection): grip penetration / wrap, IK reach, wrist bend / twist,
   * foot sliding, axe-to-body clearance, blade-vs-rock/ground penetration, impact accuracy, idle ranges.
   * Usage (browser console):  JSON.stringify(await app.runInspection(), null, 1)
   */
  app.runInspection = async () => {
    const T = THREE, ctrl = app.ctrl, out = { generated: new Date().toISOString(), axeScale: CFG.axeScale };
    app.paused = true;
    const mesh = rig.skinned.find((m) => m.name === 'Orc') || rig.skinned[0];
    const pos = mesh.geometry.attributes.position, tmp = new T.Vector3(), sock = rig.rest.Socket_R.wp;
    const bodyIdx = []; for (let i = 0; i < pos.count; i += 3) { tmp.fromBufferAttribute(pos, i); if (tmp.distanceTo(sock) > 0.62) bodyIdx.push(i); }
    const axeV = []; app.axeModel.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 9) axeV.push([p.getX(i), p.getY(i), p.getZ(i)]); } });
    const cell = 0.06, v = new T.Vector3(), w = new T.Vector3();
    const closestToBody = () => {
      app.scene.updateMatrixWorld(true); mesh.updateWorldMatrix(true, false); app.axe.updateWorldMatrix(true, true);
      const grid = new Map();
      for (const i of bodyIdx) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); const k = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(v.x, v.y, v.z); }
      let minD = Infinity;
      for (const a of axeV) { w.set(a[0], a[1], a[2]); app.axeModel.localToWorld(w); const cx = Math.floor(w.x / cell), cy = Math.floor(w.y / cell), cz = Math.floor(w.z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const arr = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!arr) continue; for (let j = 0; j < arr.length; j += 3) { const d = Math.hypot(arr[j] - w.x, arr[j + 1] - w.y, arr[j + 2] - w.z); if (d < minD) minD = d; } } }
      return minD;
    };
    const bladeGap = () => { // lowest clearance of any axe vertex over rock / ground
      app.axe.updateWorldMatrix(true, true); let g = Infinity;
      for (const a of axeV) { w.set(a[0], a[1], a[2]); app.axeModel.localToWorld(w); const hit = app.rock.surfaceAt(w.x, w.z); g = Math.min(g, w.y - Math.max(hit ? hit.point.y : 0, 0)); }
      return g;
    };
    app.pose = app.stance; app.applyPose();
    const ank0 = { R: rig.worldPos('Foot_R'), L: rig.worldPos('Foot_L') };
    out.stance = { ...app.gripMetrics(), wristBendDeg: +app.solver.debug.armR.wristBendDeg.toFixed(0), axeLowestYcm: 0 };
    { let my = Infinity; for (const a of axeV) { w.set(a[0], a[1], a[2]); app.axeModel.localToWorld(w); my = Math.min(my, w.y); } out.stance.axeLowestYcm = +(my * 100).toFixed(1); }
    out.actions = {};
    for (const name of ['raise', 'chest', 'slam']) {
      const a = ctrl.actions[name];
      const r = { duration: a.duration, ikErrRightCm: 0, ikErrLeftCm: 0, stretchedFramesRight: 0, maxWristBendDeg: 0, maxForearmTwistDeg: 0, maxAnkleSlideMm: 0, legStretchFrames: 0, worstGripPenetrationMm: 0, minWrapSectors: 12, closestAxeToBodyCm: Infinity, minBladeClearanceMm: Infinity };
      for (let t = 0; t <= a.duration + 1e-6; t += 0.05) {
        app.solver.apply(ctrl.poseAt(name, Math.min(t, a.duration)));
        const d = app.solver.debug;
        r.ikErrRightCm = Math.max(r.ikErrRightCm, d.armR.error * 100); r.ikErrLeftCm = Math.max(r.ikErrLeftCm, d.armL.error * 100);
        if (d.armR.stretched) r.stretchedFramesRight++;
        r.maxWristBendDeg = Math.max(r.maxWristBendDeg, d.armR.wristBendDeg); r.maxForearmTwistDeg = Math.max(r.maxForearmTwistDeg, Math.abs(d.armR.twistDeg));
        r.legStretchFrames += (d.legR.stretched ? 1 : 0) + (d.legL.stretched ? 1 : 0);
        for (const s of ['R', 'L']) { const p = rig.worldPos('Foot_' + s); r.maxAnkleSlideMm = Math.max(r.maxAnkleSlideMm, Math.hypot(p.x - ank0[s].x, p.z - ank0[s].z) * 1000); }
        if (Math.round(t * 20) % 2 === 0) {
          const m = app.gripMetrics(); r.worstGripPenetrationMm = Math.max(r.worstGripPenetrationMm, m.maxPenetrationMm); r.minWrapSectors = Math.min(r.minWrapSectors, m.wrapCoverageSectors);
          r.closestAxeToBodyCm = Math.min(r.closestAxeToBodyCm, closestToBody() * 100);
        }
        if (name === 'slam') r.minBladeClearanceMm = Math.min(r.minBladeClearanceMm, bladeGap() * 1000);
      }
      for (const k of ['ikErrRightCm', 'ikErrLeftCm', 'maxWristBendDeg', 'maxForearmTwistDeg', 'maxAnkleSlideMm', 'closestAxeToBodyCm', 'minBladeClearanceMm']) r[k] = Number.isFinite(r[k]) ? +r[k].toFixed(1) : null;
      out.actions[name] = r;
    }
    // impact accuracy through the real simulation (fixed steps)
    ctrl.active = null; ctrl.t = 0; app.fx.clear(); let hitTime = null; const off = ctrl.on((n, d) => { if (n === 'impact') hitTime = d.actionTime; });
    ctrl.play('slam'); app.stepSeconds(2.45); off();
    const edge = app.ctx.axe.edge; let lowest = null, ly = Infinity;
    app.axe.updateWorldMatrix(true, true);
    for (let i = 0; i < edge.length; i += 3) { w.set(edge[i], edge[i + 1], edge[i + 2]); app.axeModel.localToWorld(w); if (w.y < ly) { ly = w.y; lowest = w.clone(); } }
    const hit = app.rock.surfaceAt(lowest.x, lowest.z);
    out.impact = { eventTimeS: hitTime && +hitTime.toFixed(3), plannedContact: ctrl.ctx.slam.contact.toArray().map((x) => +x.toFixed(4)), bladeLowestPoint: lowest.toArray().map((x) => +x.toFixed(4)), gapToRockSurfaceMm: +((lowest.y - hit.point.y) * 1000).toFixed(1) };
    ctrl.timeScale = 1; app.stepSeconds(3);
    // idle: 60 s sweep (feet planted, breathing ranges, jaw)
    ctrl.active = null; const f0 = { R: rig.worldPos('Foot_R'), L: rig.worldPos('Foot_L') };
    const rng = { hipsY: [9, -9], headY: [9, -9], spine2Y: [9, -9], shoulderRY: [9, -9], kneeRY: [9, -9], kneeLY: [9, -9] }; let slide = 0, jawMax = 0;
    for (let t = 0; t < 60; t += 0.1) {
      ctrl.t = t; ctrl.update(0); jawMax = Math.max(jawMax, ctrl.pose.jaw);
      const g = { hipsY: rig.worldPos('Hips').y, headY: rig.worldPos('Head').y, spine2Y: rig.worldPos('Spine2').y, shoulderRY: rig.worldPos('UpperArm_R').y, kneeRY: rig.worldPos('LowerLeg_R').y, kneeLY: rig.worldPos('LowerLeg_L').y };
      for (const k in g) { rng[k][0] = Math.min(rng[k][0], g[k]); rng[k][1] = Math.max(rng[k][1], g[k]); }
      for (const s of ['R', 'L']) { const p = rig.worldPos('Foot_' + s); slide = Math.max(slide, Math.hypot(p.x - f0[s].x, p.z - f0[s].z)); }
    }
    out.idle60s = { rangesCm: Object.fromEntries(Object.entries(rng).map(([k, [a, b]]) => [k, +((b - a) * 100).toFixed(1)])), maxJawOpenRad: +jawMax.toFixed(3), maxFootSlideMm: +(slide * 1000).toFixed(2) };
    return out;
  };
}
