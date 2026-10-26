// The sky seen from your own eyes or the free camera: the haze on the horizon (the fog's own colour, so the woods fade
// into it with no seam) deepening overhead into the sky's colour for the hour (lighting/day-night.js sets both), soft
// clouds sailing over with the wind and a glow round the sun or the moon. From above there's no sky in view, so it's
// only drawn with a perspective camera (world/atmosphere.js).

import { cam, scene, sun, V3 } from '../core/renderer.js';
import { BMU, LMU } from '../core/shaders.js';

// how big the dome is (inside the far plane, round the camera), how thick the clouds (cover: where the noise turns
// to cloud, k: how strongly they show) and how far they lie (scale: of the noise over the sky), and the sun's glow
// (halo: its spread, disc: the tight bright core)
const SKY_DOME = { r: 160, cover: [0.56, 0.84], k: 0.5, scale: 0.32, halo: 7, disc: 380 };
export const SKY_CLOUD = SKY_DOME.k;   // (thinned out in thick fog: world/atmosphere.js)
export const SKY_U = {
  uHor: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
  uSunK: { value: 0 }, uCloudK: { value: SKY_DOME.k }, uNoise: BMU.uBloodNoise, uDrift: { value: new THREE.Vector2() }
};
const SKY_VS = `
  varying vec3 vDir;
  void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
  uniform vec3 uHor, uTop, uSunDir, uSunCol; uniform float uSunK, uCloudK; uniform sampler2D uNoise; uniform vec2 uDrift;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir); float h = d.y;
    vec3 c = mix(uHor, uTop, smoothstep(0.0, 1.0, pow(clamp(h, 0.0, 1.0), 0.6)));
    if (h > 0.0) {   // the clouds, on a ceiling over the farm: thinner and further off toward the horizon
      vec2 p = d.xz / (h + 0.15) * ${SKY_DOME.scale.toFixed(2)} + uDrift;
      float n = texture2D(uNoise, p).r * 0.62 + texture2D(uNoise, p * 2.3 + 0.41).r * 0.38;
      float cl = smoothstep(${SKY_DOME.cover[0].toFixed(2)}, ${SKY_DOME.cover[1].toFixed(2)}, n) * smoothstep(0.02, 0.3, h);
      c = mix(c, mix(uHor * 1.18, uTop * 1.1, 0.35) + uSunCol * uSunK * 0.06, cl * uCloudK);
    }
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSunCol * uSunK * (pow(s, ${SKY_DOME.halo.toFixed(1)}) * 0.22 + pow(s, ${SKY_DOME.disc.toFixed(1)}) * 0.9);
    gl_FragColor = vec4(mix(uHor, c, smoothstep(-0.03, 0.05, h)), 1.0);   // (and below the horizon, just the haze)
  }`;
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME.r, 32, 16), new THREE.ShaderMaterial({ uniforms: SKY_U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
skyDome.renderOrder = -100; skyDome.frustumCulled = false; skyDome.visible = false; scene.add(skyDome);
// each frame: on with a perspective camera, round it, the sun or moon's way and the clouds drifting with the shade
// they cast on the ground (uCloud, core/shaders.js)
export function updateSky(day) {
  skyDome.visible = !!cam.isPerspectiveCamera; if (!skyDome.visible) return;
  skyDome.position.copy(cam.position);
  SKY_U.uSunDir.value.copy(sun.position).normalize(); SKY_U.uSunCol.value.copy(sun.color);
  SKY_U.uSunK.value = 0.3 + 0.7 * day;
  SKY_U.uDrift.value.set(LMU.uCloud.value.x * 0.5, LMU.uCloud.value.y * 0.5);
}
