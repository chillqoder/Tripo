import * as THREE from 'three';
import { random } from './scene.js';
import { SPELLS } from './config.js';
import { spellIntensity } from './spell-state.js';

// Fixed-capacity GPU buffers. Casts reuse these resources for the app's lifetime.
class Particles {
  constructor(capacity, flame = false) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 1 }, resolutionY: { value: 800 }, flame: { value: flame ? 1 : 0 } },
      vertexShader: `attribute vec3 color; attribute float size; attribute float alpha;
        varying vec3 vColor; varying float vAlpha; uniform float resolutionY;
        void main(){vColor=color;vAlpha=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*resolutionY/max(1.,-mv.z),1.,85.);}`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha; uniform float opacity; uniform float flame;
        void main(){vec2 p=gl_PointCoord-.5;
          float d=length(p*vec2(1.+flame*.5,1.-flame*.22));
          float glow=pow(max(0.,1.-d*2.),2.);
          gl_FragColor=vec4(vColor,glow*vAlpha*opacity);}`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.count = 0;
  }
  begin() { this.count = 0; }
  add(x, y, z, size, r, g, b, alpha = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count++, j = i * 3;
    this.positions[j] = x; this.positions[j + 1] = y; this.positions[j + 2] = z;
    this.colors[j] = r; this.colors[j + 1] = g; this.colors[j + 2] = b;
    this.sizes[i] = size; this.alphas[i] = alpha;
  }
  end(intensity, height) {
    this.geometry.setDrawRange(0, this.count);
    for (const attribute of Object.values(this.geometry.attributes)) attribute.needsUpdate = true;
    this.material.uniforms.opacity.value = intensity;
    this.material.uniforms.resolutionY.value = height;
  }
}

class Lightning {
  constructor() {
    this.group = new THREE.Group();
    this.buffer = new Float32Array(5000 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ color: 0xbad8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geometry, this.material); this.lines.frustumCulled = false;
    this.sparks = new Particles(100);
    this.group.add(this.lines, this.sparks.object);
  }
  update(t, tip, intensity, height) {
    const rand = random(Math.floor(t * 23) * 91 + 6);
    let index = 0;
    const line = (ax, ay, az, bx, by, bz) => {
      if (index + 6 > this.buffer.length) return;
      this.buffer[index++] = ax; this.buffer[index++] = ay; this.buffer[index++] = az;
      this.buffer[index++] = bx; this.buffer[index++] = by; this.buffer[index++] = bz;
    };
    const bolt = (x, y, z, dx, dy, dz, segments, jitter, branches) => {
      let px = x, py = y, pz = z;
      for (let j = 1; j <= segments; j++) {
        const s = j / segments;
        const nx = x + dx * s + (rand() - .5) * jitter;
        const ny = y + dy * s + (rand() - .5) * jitter * .6;
        const nz = z + dz * s + (rand() - .5) * jitter;
        line(px, py, pz, nx, ny, nz);
        if (branches && j % 3 === 0) {
          let bx = nx, by = ny, bz = nz;
          for (let k = 0; k < 3; k++) {
            const ex = bx + (rand() - .5) * .6, ey = by + dy * .035, ez = bz + (rand() - .5) * .3;
            line(bx, by, bz, ex, ey, ez); bx = ex; by = ey; bz = ez;
          }
        }
        px = nx; py = ny; pz = nz;
      }
    };
    // Branching emission begins exactly at the animated crystal tip.
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + t * .16;
      bolt(tip.x, tip.y, tip.z, Math.cos(a) * (1.1 + rand()), .5 + rand() * 1.4, Math.sin(a) * 1.1, 12, .24, true);
    }
    // Jagged cascades visibly travel DOWN the sides of the wizard.
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side * (1.55 + (i % 3) * .64), y = 7 - ((t * 6 + i * 1.7) % 9);
      bolt(x, y, (i % 3) - .8, side * .2, -1.3 - rand() * 1.4, .1, 14, .31, true);
    }
    for (let i = 0; i < 8; i++) {
      const a = t * 4 + i * 2.4;
      bolt(tip.x + Math.cos(a) * .23, tip.y - .12 + Math.sin(a) * .25, tip.z,
        Math.sin(a) * .3, -.28, Math.cos(a) * .25, 5, .12, false);
    }
    this.geometry.setDrawRange(0, index / 3); this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = intensity * (.72 + Math.sin(t * 39) * .16);
    this.sparks.begin();
    for (let i = 0; i < 80; i++) {
      const a = i * 2.399 + t * 3.5, r = .07 + ((i * .117 + t * .65) % .65);
      this.sparks.add(tip.x + Math.cos(a) * r, tip.y + Math.sin(a * .7) * r - .12,
        tip.z + Math.sin(a) * r, .035 + (i % 3) * .016, 1.6, 1.9, 3, .6);
    }
    this.sparks.end(intensity, height);
  }
}

class Fire {
  constructor() {
    this.group = new THREE.Group(); this.particles = new Particles(650, true);
    this.group.add(this.particles.object);
    const rand = random(231);
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    this.material = new THREE.MeshStandardMaterial({ color: 0x34201b, emissive: 0xff3d08,
      emissiveIntensity: .09, roughness: .9, flatShading: true, transparent: true });
    this.meteors = [];
    for (let i = 0; i < 13; i++) {
      const core = new THREE.Mesh(geometry, this.material);
      const size = .065 + rand() * .08;
      core.scale.set(size, size * 1.25, size * .85);
      this.group.add(core);
      this.meteors.push({ core, seed: rand() * 10, speed: 2.5 + rand() * 2.1,
        x: (i % 2 ? -1 : 1) * (1.3 + rand() * 1.8), z: -.7 + rand() * 2.3, size });
    }
  }
  update(t, tip, intensity, height) {
    this.material.opacity = intensity;
    this.particles.begin();
    for (let i = 0; i < 150; i++) {
      const age = ((i / 150 + t * .66) % 1), a = i * 2.399 + t * 4;
      const radius = .08 + age * .4;
      this.particles.add(tip.x + Math.cos(a) * radius, tip.y + age * .9 - .32,
        tip.z + Math.sin(a) * radius, .12 + Math.sin(age * Math.PI) * .19,
        3.4, .35 + (1 - age) * 1.4, .03, (1 - age) * .8);
    }
    for (const meteor of this.meteors) {
      const { core, seed, speed, x, z, size } = meteor;
      const y = 7 - ((t * speed + seed) % 11);
      const mx = x + Math.sin(t * .7 + seed) * .35;
      core.position.set(mx, y, z); core.rotation.set(t * 2 + seed, t * 1.5 + seed, t + seed);
      for (let j = 2; j < 29; j++) {
        const f = j / 29, a = seed + j * 5.1 + t * 11;
        const width = size * (1 - f) * 1.6;
        this.particles.add(mx + Math.sin(a) * width + f * .18, y + .05 + f * (.6 + speed * .13),
          z + Math.cos(a) * width, size * (4.3 - f * 3.4), 3.5, .38 + (1 - f) * 1.3, .025,
          (1 - f) * .55);
      }
      for (let j = 0; j < 6; j++) {
        const f = ((t * .7 + j / 6 + seed) % 1), a = j * 2.39 + seed;
        this.particles.add(mx + Math.sin(a) * f * .45, y + f * 1.5, z + Math.cos(a) * f * .3,
          .027 * (1 - f) + .01, 3, 1, .08, 1 - f);
      }
    }
    this.particles.end(intensity, height);
  }
}

class Water {
  constructor() {
    this.group = new THREE.Group(); this.droplets = new Particles(460);
    this.rainBuffer = new Float32Array(280 * 6);
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainBuffer, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMaterial = new THREE.LineBasicMaterial({ color: 0x95e6ff, transparent: true, opacity: .45, depthWrite: false });
    const rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial); rain.frustumCulled = false;
    this.group.add(rain, this.droplets.object);
    this.ribbonMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float opacity;
        void main(){float edge=pow(abs(vUv.x-.5)*2.,3.);
          float streak=pow(max(0.,sin(vUv.y*40.-time*12.+vUv.x*5.)),12.);
          vec3 col=mix(vec3(.015,.32,.52),vec3(.8,1.2,1.4),edge*.6+streak*.65);
          float tail=sin(vUv.y*3.14159);gl_FragColor=vec4(col,(.22+edge*.3+streak*.25)*opacity*tail);}`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.ribbons = [];
    for (let k = 0; k < 7; k++) {
      const segments = 42, positions = new Float32Array((segments + 1) * 6), uvs = [], indices = [];
      for (let j = 0; j <= segments; j++) {
        uvs.push(0, j / segments, 1, j / segments);
        if (j < segments) { const a = j * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
      const mesh = new THREE.Mesh(geometry, this.ribbonMaterial); mesh.frustumCulled = false;
      this.group.add(mesh); this.ribbons.push({ positions, geometry, segments });
    }
  }
  update(t, tip, intensity, height) {
    this.ribbonMaterial.uniforms.time.value = t; this.ribbonMaterial.uniforms.opacity.value = intensity;
    this.rainMaterial.opacity = intensity * .36;
    const rand = random(95);
    this.droplets.begin();
    for (let i = 0; i < 280; i++) {
      const x = (rand() - .5) * 8.2, z = (rand() - .5) * 5, speed = 4.5 + rand() * 2.4;
      const phase = rand() * 11, y = 7 - ((t * speed + phase) % 11);
      const j = i * 6, drift = Math.sin(t * .6) * .04;
      this.rainBuffer[j] = x + drift; this.rainBuffer[j + 1] = y; this.rainBuffer[j + 2] = z;
      this.rainBuffer[j + 3] = x + drift + .018; this.rainBuffer[j + 4] = y + .13 + rand() * .12; this.rainBuffer[j + 5] = z;
      if (i < 90) this.droplets.add(x, y, z, .024, .5, 1.3, 1.8, .65);
      const impactAge = ((t * speed + phase - 7) % 11 + 11) % 11 / speed;
      if (x * x + z * z / .6 < 3.2 && impactAge < .26) {
        const life = impactAge / .26;
        for (let s = 0; s < 4; s++) {
          const a = s * Math.PI * .5 + i;
          this.droplets.add(x + Math.cos(a) * life * .18, .04 + Math.sin(life * Math.PI) * .16,
            z + Math.sin(a) * life * .18, .035, .4, 1.1, 1.5, 1 - life);
        }
      }
    }
    this.rainGeometry.attributes.position.needsUpdate = true;
    for (let k = 0; k < this.ribbons.length; k++) {
      const { positions, geometry, segments } = this.ribbons[k];
      const side = k % 2 ? -1 : 1, initialAngle = k * 1.4;
      for (let j = 0; j <= segments; j++) {
        const s = j / segments, a = initialAngle + s * 7 - t * 2.2;
        const width = (.025 + Math.sin(s * Math.PI) * .11) * (.8 + Math.sin(s * 22 - t * 6) * .2);
        const radius = .12 + s * .29;
        const x = tip.x + side * Math.sin(s * 1.8) * (1.5 + k * .10) + Math.sin(a) * radius * Math.sin(s * Math.PI);
        const y = tip.y + Math.sin(s * Math.PI) * .55 - s * s * (3.5 + k * .18);
        const z = tip.z - s * .8 + Math.cos(a) * radius;
        const b = j * 6;
        positions[b] = x - width; positions[b + 1] = y; positions[b + 2] = z;
        positions[b + 3] = x + width; positions[b + 4] = y + width * .3; positions[b + 5] = z + width;
        if (j % 3 === 0) this.droplets.add(x + Math.sin(t + j) * .03, y - ((t + j * .13) % .16), z,
          .028 + s * .018, .5, 1.4, 1.8, .8);
      }
      geometry.attributes.position.needsUpdate = true;
    }
    for (let i = 0; i < 100; i++) {
      const a = t * 3 + i * .27, age = ((i * .073 + t * .5) % 1), r = .09 + age * .27;
      this.droplets.add(tip.x + Math.sin(a) * r, tip.y - .55 + age * .8,
        tip.z + Math.cos(a) * r, .025 + age * .025, .45, 1.3, 1.9, .8);
    }
    this.droplets.end(intensity, height);
  }
}

export class SpellEffects {
  constructor(scene, renderer) {
    this.renderer = renderer;
    this.effects = { lightning: new Lightning(), fire: new Fire(), water: new Water() };
    for (const fx of Object.values(this.effects)) { scene.add(fx.group); fx.group.visible = false; }
    this.light = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(this.light);
    this.tip = new THREE.Vector3();
    this.active = null;
  }
  update(state, character) {
    const intensity = state.spell ? spellIntensity(state.elapsed) : 0;
    for (const [name, fx] of Object.entries(this.effects)) fx.group.visible = name === state.spell && intensity > 0;
    this.active = intensity > 0 ? state.spell : null;
    this.light.intensity = 0;
    character.crystalLight.color.setHex(state.spell ? SPELLS[state.spell].hex : 0xa277ff);
    character.crystalLight.intensity = .65 + intensity * 1.8;
    if (!this.active) return;
    character.getTip(this.tip);
    this.effects[state.spell].update(state.elapsed, this.tip, intensity,
      this.renderer.domElement.height);
    this.light.position.copy(this.tip); this.light.position.y -= .5;
    this.light.color.setHex(SPELLS[state.spell].hex);
    const flicker = state.spell === 'lightning' ? .65 + Math.pow(Math.max(0, Math.sin(state.elapsed * 37)), 8) * .7
      : state.spell === 'fire' ? .8 + Math.sin(state.elapsed * 19) * .16 : .8;
    this.light.intensity = intensity * flicker * (state.spell === 'fire' ? 10 : 7);
  }
}
