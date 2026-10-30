// Screen-space refraction for the moving water surface and the bubbles.
//
// Pass 1 renders every submerged/opaque object (layer 0 only) into `capture`: colour (HDR,
// linear) + depth. The refractive surface, glass and bubbles live on LAYER_OPTICS and are
// never part of their own capture, so there is no feedback.
// Pass 2 renders the full scene. Water uses the difference between the disturbed and
// flat refraction rays, so a calm surface has a stable image and bubble rings distort
// only their immediate surroundings. Flat glass panes do not use the capture.
import * as THREE from 'three';
import { TANK } from '../config/scene.js';
import { SURFACE_GLSL, SURFACE_DETAIL_GLSL, surfaceUniforms } from '../world/surface.js';
import { globals } from './materials.js';
import { LAYER_OPTICS } from '../world/tank.js';
import { LAYER_PROXY } from './lod.js';

export class Optics {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 0.75;
    this.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.capture = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: this.depthTexture, samples: 0 });
    this.capture.texture.minFilter = THREE.LinearFilter;
    this.uniforms = {
      uScene: { value: this.capture.texture },
      uSceneDepth: { value: this.depthTexture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uNearFar: { value: new THREE.Vector2(0.1, 200) },
      uViewProj: { value: new THREE.Matrix4() },
    };
  }

  setSize(w, h, pixelRatio) {
    const s = this.scale * pixelRatio;
    this.capture.setSize(Math.max(1, Math.floor(w * s)), Math.max(1, Math.floor(h * s)));
    this.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
  }

  render(scene, camera) {
    const r = this.renderer;
    this.uniforms.uNearFar.value.set(camera.near, camera.far);
    camera.updateMatrixWorld();
    this.uniforms.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const mask = camera.layers.mask;
    camera.layers.set(0);
    camera.layers.enable(LAYER_PROXY);
    r.setRenderTarget(this.capture);
    r.clear();
    r.render(scene, camera);
    camera.layers.mask = mask;
    r.setRenderTarget(null);
    r.render(scene, camera);
  }
}

const COMMON = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uSceneDepth;
uniform vec2 uRes;
uniform vec2 uNearFar;
uniform mat4 uViewProj;
float eyeDepthAt(vec2 uv) {
  float z = texture2D(uSceneDepth, uv).x * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x));
}
vec2 projectUV(vec3 wp) {
  vec4 c = uViewProj * vec4(wp, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}
// procedural room / lamp for reflections (no external HDR)
vec3 roomSky(vec3 r) {
  float upw = clamp(r.y, -1.0, 1.0);
  vec3 c = mix(vec3(0.035, 0.04, 0.045), vec3(0.16, 0.18, 0.19), smoothstep(-0.2, 0.9, upw));
  // aquarium lamp hood above the tank
  float lamp = smoothstep(0.9, 0.99, upw);
  c += vec3(0.7, 0.68, 0.62) * lamp;
  return c;
}
`;

export function buildWaterSurface(scene, optics) {
  const inset = 0.002;
  const geo = new THREE.PlaneGeometry(TANK.w - 2 * inset, TANK.d - 2 * inset, 220, 110);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    ...surfaceUniforms(),
    ...optics.uniforms,
    uTime: globals.uTime,
    uWaterColor: globals.uWaterColor,
    uLightDir: { value: new THREE.Vector3(-0.35, 1, -0.45).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      ${SURFACE_GLSL}
      varying vec3 vW;
      varying vec3 vView;
      void main() {
        vec3 p = position;
        float h0 = surfaceHeight(p.xz, uTime);
        p.y = h0;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWaterColor;
      uniform vec3 uLightDir;
      ${SURFACE_DETAIL_GLSL}
      ${COMMON}
      varying vec3 vW;
      varying vec3 vView;
      void main() {
        vec2 suv = gl_FragCoord.xy / uRes;
        vec2 slope = surfaceDetailSlope(vW.xz, uTime);
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 V = normalize(cameraPosition - vW);
        bool below = cameraPosition.y < vW.y;
        float dw = -vView.z;
        float dScene = eyeDepthAt(suv);
        vec3 col;
        if (!below) {
          vec3 R = refract(-V, n, 1.0 / 1.333);
          float thick = max(dScene - dw, 0.0) * length(vView) / max(dw, 0.001);
          vec3 flatRay = refract(-V, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
          vec3 hit = vW - V * min(thick, 6.0);
          vec2 offset = projectUV(hit + (R - flatRay) * min(thick, 4.0)) - projectUV(hit);
          offset *= min(1.0, 0.012 / max(length(offset), 0.00001));
          vec2 cand = clamp(suv + offset, vec2(0.002), vec2(0.998));
          // Fade at foreground geometry and screen edges instead of switching ray lengths.
          float valid = smoothstep(dw + 0.02, dw + 0.25, eyeDepthAt(cand));
          vec2 edge = min(suv, vec2(1.0) - suv);
          valid *= smoothstep(0.002, 0.025, min(edge.x, edge.y));
          vec2 ruv = mix(suv, cand, valid);
          vec3 trans = texture2D(uScene, ruv).rgb;
          float cosT = clamp(dot(n, V), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 refl = roomSky(reflect(-V, n));
          float highlight = max(dot(reflect(-uLightDir, n), V), 0.0);
          float spec = pow(highlight, 180.0) * 0.45 + pow(highlight, 24.0) * 0.1;
          col = mix(trans, refl, F) + spec;
          col = mix(col, uWaterColor * 0.6, 0.04);
        } else {
          // seen from below through the front glass: mostly total internal reflection
          n = -n;
          float cosT = clamp(dot(n, V), 0.0, 1.0);
          vec2 bend = (viewMatrix * vec4(n.x, 0.0, n.z, 0.0)).xy;
          vec2 ruv = clamp(suv + bend * 0.018, vec2(0.001), vec2(0.999));
          vec3 mirror = texture2D(uScene, ruv).rgb;
          float tir = smoothstep(0.62, 0.72, 1.0 - cosT);
          col = mix(roomSky(refract(-V, n, 1.333)) * 0.7, mirror * 0.85, tir);
          col = mix(col, uWaterColor, 0.25);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water-surface';
  mesh.layers.set(LAYER_OPTICS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  return mesh;
}

export function bubbleMaterial(optics) {
  return new THREE.ShaderMaterial({
    uniforms: { ...optics.uniforms },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float c = clamp(dot(n, V), 0.0, 1.0);
        float F = 0.06 + 0.94 * pow(1.0 - c, 3.0);
        // air sphere in water: background appears minified/inverted -> offset sample
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 vn = (viewMatrix * vec4(n, 0.0)).xyz;
        vec3 bg = texture2D(uScene, clamp(suv - vn.xy * 0.02, vec2(0.001), vec2(0.999))).rgb;
        // curved bright highlights: a key reflection and a soft secondary arc
        vec3 L = normalize(vec3(0.3, 1.0, 0.4));
        float spec = pow(max(dot(reflect(-L, n), V), 0.0), 60.0) * 3.0;
        float arc = smoothstep(0.75, 0.95, 1.0 - c) * smoothstep(-0.2, 0.6, n.y) * 0.8;
        // air in water: wide silvery rim from total internal reflection, clear centre
        float rimT = smoothstep(0.25, 0.95, 1.0 - c);
        vec3 silver = mix(vec3(0.55, 0.66, 0.66), vec3(1.25, 1.3, 1.25), smoothstep(-0.3, 0.8, n.y));
        vec3 col = mix(bg * 1.1, silver, rimT * 0.85) + vec3(spec + arc * 0.6);
        float a = clamp(0.12 + rimT * 0.85 + spec, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
