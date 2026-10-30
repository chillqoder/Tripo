import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CONFIG } from './config.js';

export function random(seed = 12) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}

function makeRock() {
  const rand = random(291);
  const n = 13;
  const rings = [[], [], []];
  for (let i = 0; i < n; i++) {
    const angle = i / n * Math.PI * 2;
    const radius = 1.88 + rand() * .47;
    rings[0].push(new THREE.Vector3(Math.cos(angle) * radius, -.045 - rand() * .06, Math.sin(angle) * radius * .77));
    rings[1].push(new THREE.Vector3(Math.cos(angle + .08) * radius * (.79 + rand() * .18), -.52 - rand() * .30, Math.sin(angle + .08) * radius * .72));
    rings[2].push(new THREE.Vector3(Math.cos(angle - .13) * radius * (.25 + rand() * .18), -1.26 - rand() * .33, Math.sin(angle - .13) * radius * .33));
  }
  const positions = [], colors = [];
  const color = new THREE.Color();
  function triangle(a, b, c, top = false) {
    color.setHSL(.625 + rand() * .045, .13 + rand() * .1, (top ? .063 : .027) + rand() * .024);
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  }
  // A broad flat central region, with a broken perimeter and asymmetric underside.
  const inner = rings[0].map(v => new THREE.Vector3(v.x * .52, 0, v.z * .52));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangle(new THREE.Vector3(0, 0, 0), inner[j], inner[i], true);
    triangle(inner[i], inner[j], rings[0][i], true);
    triangle(inner[j], rings[0][j], rings[0][i], true);
    for (let r = 0; r < 2; r++) {
      triangle(rings[r][i], rings[r][j], rings[r + 1][i]);
      triangle(rings[r][j], rings[r + 1][j], rings[r + 1][i]);
    }
    triangle(rings[2][i], rings[2][j], new THREE.Vector3(-.32, -1.8, .12));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const rock = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, flatShading: true }));
  rock.castShadow = true; rock.receiveShadow = true;
  const group = new THREE.Group(); group.add(rock);
  const chipGeometry = new THREE.IcosahedronGeometry(1, 0);
  const chipMaterial = new THREE.MeshStandardMaterial({ color: 0x404354, roughness: 1, flatShading: true });
  for (let i = 0; i < 12; i++) {
    const chip = new THREE.Mesh(chipGeometry, chipMaterial);
    const a = rand() * Math.PI * 2;
    const r = 1.25 + rand() * .6;
    chip.position.set(Math.cos(a) * r, .018, Math.sin(a) * r * .72);
    chip.scale.set(.035 + rand() * .12, .025 + rand() * .06, .04 + rand() * .10);
    chip.rotation.set(rand(), rand(), rand()); chip.castShadow = true;
    group.add(chip);
  }
  return group;
}

function makeStars() {
  const rand = random(92), vertices = [], seeds = [];
  for (let i = 0; i < 300; i++) {
    vertices.push((rand() - .5) * 70, (rand() - .5) * 46, -12 - rand() * 30);
    seeds.push(rand());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `attribute float seed; varying float vAlpha; uniform float time; uniform float pixelRatio;
      void main(){vec3 p=position;p.x+=sin(time*.015+seed*6.28)*.25;
      vAlpha=.18+seed*.38+sin(time*(.3+seed*.4)+seed*60.)*.12;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      gl_PointSize=(.8+seed*1.7)*pixelRatio;}`,
    fragmentShader: `varying float vAlpha; void main(){float d=length(gl_PointCoord-.5);
      gl_FragColor=vec4(.69,.76,1.,vAlpha*(1.-smoothstep(.05,.5,d)));}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x070a12, 0);
  renderer.domElement.setAttribute('aria-label', 'A purple-robed wizard on a jagged floating rock in space. Choose a spell below.');
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x12172a);
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, .1, 100);
  const island = new THREE.Group(); scene.add(island); island.add(makeRock());
  scene.add(new THREE.HemisphereLight(0xaebdd8, 0x302638, 1.0));
  // Broad, soft illumination carries most of the light. A restrained shadow
  // light adds contact and volume without carving hard facets into the face.
  RectAreaLightUniformsLib.init();
  const softKey = new THREE.RectAreaLight(0xffe6d5, 4.8, 5, 6);
  softKey.position.set(-3.5, 5.5, 5);
  softKey.lookAt(0, 1.5, 0); scene.add(softKey);
  const key = new THREE.DirectionalLight(0xffe8da, 1.6);
  key.position.set(-3.5, 7, 6); key.target.position.set(0, 1.3, 0);
  scene.add(key.target); key.castShadow = true;
  key.shadow.mapSize.setScalar(CONFIG.render.shadows);
  key.shadow.camera.left = -3.6; key.shadow.camera.right = 3.6;
  key.shadow.camera.top = 5.2; key.shadow.camera.bottom = -2.7;
  key.shadow.camera.near = .5; key.shadow.camera.far = 22;
  key.shadow.radius = 4;
  key.shadow.normalBias = .012; key.shadow.bias = -.00012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb5adff, 1.9); rim.position.set(4, 4, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xc6d8ed, .85);
  scene.add(fill, fill.target);
  const under = new THREE.PointLight(0x6963d9, 3, 8, 2); under.position.set(-1, -2, 2); scene.add(under);
  const stars = makeStars(); scene.add(stars);
  const rand = random(14), satellites = [];
  const debrisGeometry = new THREE.IcosahedronGeometry(1, 0);
  const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x363b50, roughness: 1, flatShading: true });
  for (const [x, y, z, size] of [[-2.75, -.6, .3, .17], [2.55, -1, -.4, .22], [1.8, -2.1, 0, .12], [-1.7, -2.3, -.3, .08]]) {
    const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
    debris.position.set(x, y, z); debris.scale.set(size, size * 1.3, size * .8);
    debris.rotation.set(rand(), rand(), rand()); island.add(debris); satellites.push(debris);
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CONFIG.render.bloom, .55, 1.35);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  let controls;
  let framingDistance;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    const aspect = w / h, mobile = aspect < .85;
    camera.aspect = aspect;
    const availableHeight = Math.max(130, h - 370);
    const portraitFit = 7.1 * h / (2 * Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov / 2)) * availableHeight);
    const distance = mobile ? Math.max(22, 8.6 / aspect, portraitFit) : CONFIG.camera.desktopDistance;
    const targetY = mobile ? 1.5 : CONFIG.camera.targetY;
    if (controls) {
      // Preserve the chosen viewing angle and zoom ratio when the viewport changes.
      camera.position.sub(controls.target).multiplyScalar(distance / framingDistance);
      controls.target.y = targetY;
      camera.position.add(controls.target);
      controls.update();
    } else {
      camera.position.set(distance * .24, distance * .29, distance * .924);
      camera.lookAt(0, targetY, 0);
    }
    framingDistance = distance;
    // Leave a quiet column for the introduction on wide screens.
    camera.setViewOffset(w, h, mobile ? 0 : -w * .105, mobile ? -h * .015 : 0, w, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
    stars.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  }
  resize();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, camera.aspect < .85 ? 1.5 : CONFIG.camera.targetY, 0);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = false;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .8;
  controls.minDistance = 5;
  controls.maxDistance = 32;
  controls.minPolarAngle = .25;
  controls.maxPolarAngle = Math.PI * .49;
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.title = 'Drag to rotate · Scroll or pinch to zoom';
  controls.addEventListener('start', () => { renderer.domElement.style.cursor = 'grabbing'; });
  controls.addEventListener('end', () => { renderer.domElement.style.cursor = 'grab'; });
  controls.update();
  const observer = new ResizeObserver(resize); observer.observe(container);
  return {
    renderer, scene, camera, island, composer, controls,
    update(time) {
      controls.update();
      // A gentle camera fill keeps the face and cloth readable from any angle.
      fill.position.copy(camera.position);
      fill.target.position.copy(controls.target);
      island.position.y = Math.sin(time * .38) * .045;
      island.rotation.z = Math.sin(time * .22) * .007;
      island.rotation.x = Math.sin(time * .17) * .004;
      stars.material.uniforms.time.value = time;
      for (let i = 0; i < satellites.length; i++) satellites[i].rotation.y = time * .035 + i;
    },
    render() { composer.render(); },
    dispose() { observer.disconnect(); controls.dispose(); composer.dispose(); renderer.dispose(); },
  };
}
