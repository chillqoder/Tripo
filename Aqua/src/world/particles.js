// A small number of faint suspended particles drifting with the current (pooled, no allocation).
import * as THREE from 'three';
import { TANK } from '../config/scene.js';
import { currentAt } from './current.js';
import { rng } from '../core/random.js';
import { sandHeight } from './substrate.js';

export class Particles {
  constructor(scene, count = 170) {
    const r = rng(4242);
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.respawn(i, r, true);
      this.seed[i] = r() * 100;
      size[i] = 0.6 + Math.pow(r(), 3) * 2.2;
    }
    this.r = r;
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float aSize; uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale * 0.01 / -mv.z, 1.0, 6.0);
          vA = 0.10 + 0.05 * aSize;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vec3(0.82, 0.86, 0.74), a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.name = 'suspended-particles';
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cur = new THREE.Vector3();
  }

  respawn(i, r, anywhere) {
    const x = (r() * 2 - 1) * (TANK.hx - 0.2), z = (r() * 2 - 1) * (TANK.hz - 0.2);
    const y0 = sandHeight(x, z) + 0.15;
    this.pos[i * 3] = x; this.pos[i * 3 + 2] = z;
    this.pos[i * 3 + 1] = anywhere ? y0 + r() * (TANK.waterline - 0.2 - y0) : y0 + r() * 1.5;
  }

  update(dt, t) {
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      currentAt(p[o], p[o + 1], p[o + 2], t, this.cur);
      const s = this.seed[i];
      p[o] += (this.cur.x * 0.6 + 0.01 * Math.sin(t * 0.3 + s)) * dt;
      p[o + 1] += (this.cur.y * 0.4 - 0.004 + 0.006 * Math.sin(t * 0.23 + s * 1.3)) * dt;
      p[o + 2] += (this.cur.z * 0.6 + 0.01 * Math.cos(t * 0.27 + s)) * dt;
      if (Math.abs(p[o]) > TANK.hx - 0.05 || Math.abs(p[o + 2]) > TANK.hz - 0.05 || p[o + 1] > TANK.waterline - 0.08 || p[o + 1] < sandHeight(p[o], p[o + 2]) + 0.05) this.respawn(i, this.r, false);
    }
    this.attr.needsUpdate = true;
  }
}
