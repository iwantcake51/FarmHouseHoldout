// WebGL renderer, scene, isometric camera, resize handling and the sun/sky lights.

const V3 = THREE.Vector3;
const cv = $('c');
// with WebGL2 the frame's drawn into its own multisampled target for its post-processing (effects/post.js), which keeps
// its antialiasing, so the screen itself needn't be multisampled too (that would only double the memory and the work)
const GL2 = (() => { try { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return false; const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); return true; } catch (e) { return false; } })();
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: !GL2, powerPreference: 'high-performance' });
// a new shader's checked for errors only when asked (?glcheck in the address): checking makes the driver finish compiling
// it there and then, a stall the first time anything new is drawn (a muzzle flash, a spitter), instead of in parallel
R.debug.checkShaderErrors = /[?&]glcheck\b/.test(location.search);
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
// how far you can zoom out and in (cam.zoom, so bigger is closer)
const ZOOM_MIN = 0.6, ZOOM_MAX = 1.8;
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
// the sun's shadows cover the whole farm, edge to edge and the tree line round it, from wherever it is in the sky
// (lighting/day-night.js keeps it aimed at the middle of the map): everything on screen casts its shadow however far
// out you zoom or wherever you stand. A bigger map keeps them as sharp as the old one round you was.
const SUN_R = 34, SUN_D = 52;
sun.shadow.mapSize.setScalar(R.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -SUN_R, right: SUN_R, top: SUN_R, bottom: -SUN_R, near: 1, far: SUN_D * 2 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
