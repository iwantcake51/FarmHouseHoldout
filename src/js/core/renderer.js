// WebGL renderer, scene, isometric camera, resize handling and the sun/sky lights.

import { $ } from './dom.js';

export const V3 = THREE.Vector3;
export const cv = $('c');
// the frame's drawn into its own multisampled target for its post-processing (effects/post.js), which keeps its
// antialiasing, so the screen itself needn't be multisampled too (that would only double the memory and the work).
// three.js needs WebGL2: without it the title says so, and the game goes no further
const GL2 = (() => { try { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return false; const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); return true; } catch (e) { return false; } })();
if (!GL2) { $('title').querySelector('p').textContent = 'Your browser or graphics card has no WebGL 2, which the game needs. Try another browser, or turn on hardware acceleration.'; throw new Error('no WebGL2'); }
export const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
R.outputColorSpace = THREE.LinearSRGBColorSpace;   // (colours out as they are: core/dom.js)
// a new shader's checked for errors only when asked (?glcheck in the address): checking makes the driver finish compiling
// it there and then, a stall the first time anything new is drawn (a muzzle flash, a spitter), instead of in parallel
R.debug.checkShaderErrors = /[?&]glcheck\b/.test(location.search);
export const DPR = Math.min(2, window.devicePixelRatio || 1);
export let renderScale = DPR;
// lowered automatically when the frame rate drops (see game/loop.js)
R.setPixelRatio(renderScale);
R.shadowMap.enabled = true;
// soft-edged shadows: three's own filtering blurs a shadow's edge over a texel or two of its map, a few centimetres, so
// the line where it starts is hard. Instead each is read SHADOW_SOFT.taps times over a disc, turned a different way at
// every pixel (a spiral, rotated by a noise of the pixel's place) so the edge fades smoothly with no rings or steps,
// SHADOW_SOFT.r metres out (the sun's radius in its map's texels follows from that: ui/settings.js, applySettings)
export const SHADOW_SOFT = { r: 0.07, taps: 12 };
R.shadowMap.type = THREE.PCFShadowMap;
// (three's PCF already reads the map over a disc turned by a noise of the pixel's place, a Vogel disc, five times: here
// it's read SHADOW_SOFT.taps times instead, for a smoother edge)
{ const C = THREE.ShaderChunk, re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(C.shadowmap_pars_fragment)) console.warn('soft shadows: three.js PCF shadow code not as expected');
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace(re, `shadow = 0.0;
				for ( int i = 0; i < ${SHADOW_SOFT.taps}; i ++ ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, ${SHADOW_SOFT.taps}, phi ) * radius, shadowCoord.z ) );
				shadow /= ${SHADOW_SOFT.taps}.0;`); }
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1716);
scene.fog = new THREE.Fog(0x1e1716, 42, 78);
export const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
export const VIEW = 9, YAW = Math.PI / 4, EL = 0.66, CAM_D = 40;
export const CAM_OFF = new V3(Math.sin(YAW) * Math.cos(EL) * CAM_D, Math.sin(EL) * CAM_D, Math.cos(YAW) * Math.cos(EL) * CAM_D);
// how far you can zoom out and in (cam.zoom, so bigger is closer)
export const ZOOM_MIN = 0.6, ZOOM_MAX = 1.8;
export let zoom = 1, zoomT = 1;
export const FWD = { x: -Math.sin(YAW), z: -Math.cos(YAW) };
export const RIGHT = { x: Math.cos(YAW), z: -Math.sin(YAW) };
export const GUN_Y = 1.1;
export function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  R.setSize(w, h, false);
  cam.left = -VIEW * a; cam.right = VIEW * a; cam.top = VIEW; cam.bottom = -VIEW; cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
// LIGHT_K: three.js once scaled these lights up by π in its shaders and no longer does (r155), so every intensity the
// game sets on them (here and lighting/day-night.js) is scaled by it instead, to light the farm as it was tuned
export const LIGHT_K = Math.PI;
export const hemi = new THREE.HemisphereLight(0xd8c8b0, 0x4a3426, 0.62 * LIGHT_K);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffc89c, 0.85 * LIGHT_K);
sun.castShadow = true;
// the sun's shadows cover the whole farm, edge to edge and the tree line round it, from wherever it is in the sky
// (lighting/day-night.js keeps it aimed at the middle of the map): everything on screen casts its shadow however far
// out you zoom or wherever you stand. A bigger map keeps them as sharp as the old one round you was.
export const SUN_R = 34, SUN_D = 52;
sun.shadow.mapSize.setScalar(R.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
Object.assign(sun.shadow.camera, { left: -SUN_R, right: SUN_R, top: SUN_R, bottom: -SUN_R, near: 1, far: SUN_D * 2 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = SHADOW_SOFT.r * sun.shadow.mapSize.x / (2 * SUN_R);   // (in texels of its map: kept up as its size changes)
scene.add(sun, sun.target);

// setters for the variables above that other files change (an imported variable can only be read)
export function setRenderScale(v) { return (renderScale = v); }
export function setZoom(v) { return (zoom = v); }
export function setZoomT(v) { return (zoomT = v); }
