// Temporary neutral asset preview (dev only; not part of the aquarium).
// ?file=<name>&views=4  renders views: +Z front, +X side, top (-Y), -Z back. Axis colors: X red, Y green, Z blue.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const q = new URLSearchParams(location.search);
const file = q.get('file');
const W = 1600, H = 400;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x888888);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.0));
const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 3, 4); scene.add(d);
scene.add(new THREE.AxesHelper(0.7));
const url = (q.get('dir') || '/models/') + encodeURIComponent(file).replace(/%2B/g, '+');
new GLTFLoader().load(url, (g) => {
  g.scene.traverse(o => { if (o.material) { o.material.metalness = 0; } });
  scene.add(g.scene);
  const box = new THREE.Box3().setFromObject(g.scene); const c = box.getCenter(new THREE.Vector3()); const r = box.getSize(new THREE.Vector3()).length() * 0.6;
  const views = [[0, 0, 1], [1, 0, 0], [0, 1, 0.0001], [0, 0, -1]];
  views.forEach((v, i) => {
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 100);
    cam.position.set(c.x + v[0] * 5, c.y + v[1] * 5, c.z + v[2] * 5); cam.lookAt(c);
    renderer.setViewport(i * 400, 0, 400, 400); renderer.setScissor(i * 400, 0, 400, 400);
    renderer.render(scene, cam);
  });
  document.title = 'done';
}, undefined, e => { document.title = 'error ' + e; });
