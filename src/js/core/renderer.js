// WebGL renderer, scene, isometric camera, resize handling and the sun/sky lights.

const V3 = THREE.Vector3;
const cv = $('c');
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(2, window.devicePixelRatio || 1);
let renderScale = DPR;
// lowered automatically when the frame rate drops (see game/loop.js)
R.setPixelRatio(renderScale);
R.shadowMap.enabled = true;
R.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1716);
scene.fog = new THREE.Fog(0x1e1716, 42, 78);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const VIEW = 9, YAW = Math.PI / 4, EL = 0.66, CAM_D = 40;
const CAM_OFF = new V3(Math.sin(YAW) * Math.cos(EL) * CAM_D, Math.sin(EL) * CAM_D, Math.cos(YAW) * Math.cos(EL) * CAM_D);
let zoom = 1, zoomT = 1;
const FWD = { x: -Math.sin(YAW), z: -Math.cos(YAW) };
const RIGHT = { x: Math.cos(YAW), z: -Math.sin(YAW) };
const GUN_Y = 1.1;
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  R.setSize(w, h, false);
  cam.left = -VIEW * a; cam.right = VIEW * a; cam.top = VIEW; cam.bottom = -VIEW; cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const hemi = new THREE.HemisphereLight(0xd8c8b0, 0x4a3426, 0.62);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc89c, 0.85);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
