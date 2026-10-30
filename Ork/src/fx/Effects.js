import * as THREE from 'three';

const { Vector3 } = THREE;
const _e = new THREE.Euler(), _dq = new THREE.Quaternion(), _sv = new Vector3();

/**
 * Pooled GPU point-sprite particles (sparks, dust).  All buffers are allocated once; `emit` recycles the
 * oldest slots, so repeated actions never grow memory.
 */
class ParticlePool {
  constructor({ count, additive, size, color0, color1, gravity = -9.8, drag = 1, grow = 0, softness = 0.5, maxAlpha = 1 }) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.grow = grow;
    this.size = size;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1e9);
    this.life = new Float32Array(count).fill(1);
    this.sz = new Float32Array(count);
    this.geo = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.pos, 3);
    this.attrAge = new THREE.BufferAttribute(new Float32Array(count), 1);
    this.attrSize = new THREE.BufferAttribute(new Float32Array(count), 1);
    this.geo.setAttribute('position', this.attrPos);
    this.geo.setAttribute('aLife', this.attrAge);
    this.geo.setAttribute('aSize', this.attrSize);
    this.geo.boundingSphere = new THREE.Sphere(new Vector3(), 1e4);
    this.cursor = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uColor0: { value: new THREE.Color(color0) }, uColor1: { value: new THREE.Color(color1) }, uSoft: { value: softness }, uMax: { value: maxAlpha } },
      vertexShader: /* glsl */`
        attribute float aLife; attribute float aSize;
        uniform float uScale; varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife >= 1.0 ? 0.0 : max(1.0, aSize * uScale / -mv.z);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor0; uniform vec3 uColor1; uniform float uSoft; uniform float uMax; varying float vLife;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          if (d > 1.0 || vLife >= 1.0) discard;
          float a = pow(1.0 - d, uSoft * 3.0 + 0.2);
          vec3 col = mix(uColor0, uColor1, smoothstep(0.0, 1.0, vLife));
          float fade = (1.0 - vLife) * (1.0 - vLife * 0.5);
          gl_FragColor = vec4(col, a * fade * uMax);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }

  emit(p, v, life, size) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.sz[i] = size;
  }

  update(dt) {
    const d = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) { this.attrAge.array[i] = 1; continue; }
      this.age[i] += dt;
      const k = i * 3;
      this.vel[k + 1] += this.gravity * dt;
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.01 && this.gravity < 0) { this.pos[k + 1] = 0.01; this.vel[k + 1] *= -0.25; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      const l = Math.min(1, this.age[i] / this.life[i]);
      this.attrAge.array[i] = l;
      this.attrSize.array[i] = this.sz[i] * (1 + this.grow * l) * (this.grow ? 1 : 1 - 0.6 * l);
    }
    this.attrPos.needsUpdate = true;
    this.attrAge.needsUpdate = true;
    this.attrSize.needsUpdate = true;
  }

  clear() { this.age.fill(1e9); this.attrAge.array.fill(1); this.attrAge.needsUpdate = true; }
  dispose() { this.geo.dispose(); this.material.dispose(); }
}

function makeScuffTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(25,22,20,0.85)');
  rg.addColorStop(0.35, 'rgba(60,54,48,0.55)');
  rg.addColorStop(1, 'rgba(90,84,76,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  // chipped cracks and pale stone dust streaks
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.sin(i * 12.9) * 0.3;
    const r0 = 6 + (i % 3) * 5, r1 = 50 + ((i * 37) % 70);
    g.strokeStyle = i % 2 ? 'rgba(230,224,210,0.55)' : 'rgba(10,8,6,0.7)';
    g.lineWidth = 1 + (i % 3);
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0);
    g.lineTo(s / 2 + Math.cos(a + 0.12) * r1, s / 2 + Math.sin(a + 0.12) * r1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.sparks = new ParticlePool({ count: 120, additive: true, size: 0.065, color0: 0xfff2b0, color1: 0xff4a10, gravity: -9.5, drag: 0.7, softness: 0.25 });
    this.dust = new ParticlePool({ count: 48, additive: false, size: 0.15, color0: 0xcbbfa5, color1: 0x9a9079, gravity: 0.15, drag: 2.4, grow: 2.2, softness: 0.6, maxAlpha: 0.38 });
    scene.add(this.sparks.points, this.dust.points);
    // brief warm flash of light at the point of contact (always in the scene so no shader recompilation happens at impact)
    this.flash = new THREE.PointLight(0xffb468, 0, 4.5, 2);
    scene.add(this.flash);
    this.flashT = 1e9;

    // stone fragments: one InstancedMesh, recycled
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    this.fragCount = 24;
    this.frags = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 0.95, flatShading: true }), this.fragCount);
    this.frags.castShadow = true;
    this.frags.frustumCulled = false;
    this.fragState = Array.from({ length: this.fragCount }, () => ({ p: new Vector3(), v: new Vector3(), q: new THREE.Quaternion(), w: new Vector3(), s: 0, age: 1e9, life: 1 }));
    this.fragCursor = 0;
    this._m = new THREE.Matrix4();
    this._hide();
    scene.add(this.frags);

    // impact mark
    this.decal = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshBasicMaterial({ map: makeScuffTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 0 }),
    );
    this.decal.renderOrder = 5;
    this.decal.visible = false;
    scene.add(this.decal);
    this.decalAge = 1e9;

    // camera shake
    this.shakeAmp = 0; this.shakeT = 1e9; this.shakeDur = 0.4; this.shakeOffset = new Vector3(); this.shakeRoll = 0;
    this._time = 0;
  }

  _hide() {
    this._m.makeScale(0, 0, 0);
    for (let i = 0; i < this.fragCount; i++) this.frags.setMatrixAt(i, this._m);
    this.frags.instanceMatrix.needsUpdate = true;
  }

  setViewport(h, fovDeg) {
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.sparks.material.uniforms.uScale.value = scale;
    this.dust.material.uniforms.uScale.value = scale;
  }

  /** Metal-on-stone impact at `point` (world) on a surface with `normal`. */
  impact(point, normal, strength = 1) {
    const n = normal.clone().normalize();
    const t1 = new Vector3(1, 0, 0).cross(n).normalize();
    if (t1.lengthSq() < 0.01) t1.set(0, 0, 1).cross(n).normalize();
    const t2 = new Vector3().crossVectors(n, t1);
    const v = new Vector3();
    // sparks: a fan along the blade (x) and up from the surface
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const spread = Math.pow(Math.random(), 0.6);
      const up = 0.35 + Math.random() * 0.9;
      v.copy(n).multiplyScalar(up).addScaledVector(t1, Math.cos(a) * spread * 1.2).addScaledVector(t2, Math.sin(a) * spread * 1.2);
      v.multiplyScalar(2.5 + Math.random() * 6.5 * strength);
      this.sparks.emit(point.clone().addScaledVector(n, 0.015), v, 0.22 + Math.random() * 0.4, 0.035 + Math.random() * 0.03);
    }
    // dust: low radial puff + a rising column
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 1.5;
      v.set(Math.cos(a) * sp, 0.25 + Math.random() * 0.9, Math.sin(a) * sp);
      this.dust.emit(point.clone().addScaledVector(n, 0.03).add(new Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12)), v, 0.9 + Math.random() * 0.9, 0.16 + Math.random() * 0.14);
    }
    // stone fragments
    for (let i = 0; i < 13; i++) {
      const f = this.fragState[this.fragCursor];
      this.fragCursor = (this.fragCursor + 1) % this.fragCount;
      const a = Math.random() * Math.PI * 2;
      f.p.copy(point).addScaledVector(n, 0.03);
      f.v.copy(n).multiplyScalar(1.8 + Math.random() * 3.2 * strength).add(new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.9 + Math.random() * 2.2));
      f.q.random();
      f.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
      f.s = 0.025 + Math.random() * 0.05;
      f.age = 0;
      f.life = 1.6 + Math.random() * 0.8;
    }
    // scuff mark
    this.decal.position.copy(point).addScaledVector(n, 0.004);
    this.decal.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
    this.decal.rotateZ(Math.random() * Math.PI * 2);
    this.decal.scale.setScalar(0.8 + Math.random() * 0.3);
    this.decal.visible = true;
    this.decalAge = 0;
    this.decal.material.opacity = 0.9;
    // light flash + camera shake
    this.flash.position.copy(point).addScaledVector(n, 0.25);
    this.flashT = 0;
    this.shake(0.07 * strength, 0.45);
  }

  shake(amp, dur) { this.shakeAmp = amp; this.shakeDur = dur; this.shakeT = 0; }

  update(dt) {
    this._time += dt;
    this.sparks.update(dt);
    this.dust.update(dt);
    // fragments
    let any = false;
    for (let i = 0; i < this.fragCount; i++) {
      const f = this.fragState[i];
      if (f.age >= f.life) continue;
      any = true;
      f.age += dt;
      f.v.y -= 9.8 * dt;
      f.p.addScaledVector(f.v, dt);
      if (f.p.y < f.s * 0.5) { f.p.y = f.s * 0.5; f.v.y *= -0.35; f.v.x *= 0.65; f.v.z *= 0.65; f.w.multiplyScalar(0.6); }
      _e.set(f.w.x * dt, f.w.y * dt, f.w.z * dt); _dq.setFromEuler(_e);
      f.q.premultiply(_dq);
      const life = f.age / f.life;
      const sc = f.s * (life > 0.75 ? 1 - (life - 0.75) / 0.25 : 1);
      _sv.set(sc, sc, sc);
      this._m.compose(f.p, f.q, _sv);
      this.frags.setMatrixAt(i, this._m);
      if (f.age >= f.life) { this._m.makeScale(0, 0, 0); this.frags.setMatrixAt(i, this._m); }
    }
    if (any) this.frags.instanceMatrix.needsUpdate = true;
    // flash decay
    if (this.flashT < 0.3) { this.flashT += dt; this.flash.intensity = 40 * Math.exp(-this.flashT / 0.05); } else this.flash.intensity = 0;
    // decal fade
    if (this.decal.visible) {
      this.decalAge += dt;
      const k = this.decalAge;
      this.decal.material.opacity = k < 7 ? 0.9 : Math.max(0, 0.9 * (1 - (k - 7) / 4));
      if (k > 11) { this.decal.visible = false; }
    }
    // shake
    if (this.shakeT < this.shakeDur * 3) {
      this.shakeT += dt;
      const e = Math.exp(-this.shakeT / (this.shakeDur * 0.32));
      const tt = this._time;
      this.shakeOffset.set(Math.sin(tt * 61) + 0.5 * Math.sin(tt * 97), Math.sin(tt * 73 + 1) + 0.5 * Math.sin(tt * 113), Math.sin(tt * 53 + 2) * 0.4).multiplyScalar(this.shakeAmp * e);
      this.shakeRoll = Math.sin(tt * 67) * this.shakeAmp * e * 0.25;
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeRoll = 0;
    }
  }

  clear() {
    this.sparks.clear(); this.dust.clear();
    for (const f of this.fragState) f.age = 1e9;
    this._hide();
    this.decal.visible = false;
    this.shakeOffset.set(0, 0, 0);
    this.flash.intensity = 0; this.flashT = 1e9;
  }

  dispose() {
    this.sparks.dispose(); this.dust.dispose();
    this.frags.geometry.dispose(); this.frags.material.dispose();
    this.decal.geometry.dispose(); this.decal.material.map?.dispose(); this.decal.material.dispose();
  }
}
