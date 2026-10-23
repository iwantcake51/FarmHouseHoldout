// WebGL renderer, scene, isometric camera, resize handling and the sun/sky lights.

import { $ } from './dom.js';

export const V3 = THREE.Vector3;
export const cv = $('c');
// with WebGL2 the frame's drawn into its own multisampled target for its post-processing (effects/post.js), which keeps
// its antialiasing, so the screen itself needn't be multisampled too (that would only double the memory and the work)
const GL2 = (() => { try { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return false; const l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); return true; } catch (e) { return false; } })();
export const R = new THREE.WebGLRenderer({ canvas: cv, antialias: !GL2, powerPreference: 'high-performance' });
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
{ const C = THREE.ShaderChunk, src = C.shadowmap_pars_fragment, a = src.indexOf('#if defined( SHADOWMAP_TYPE_PCF )'), b = src.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )', a);
  if (a >= 0 && b > a) C.shadowmap_pars_fragment = src.slice(0, a) + `#if defined( SHADOWMAP_TYPE_PCF )
			float sAng = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
			vec2 sR = shadowRadius / shadowMapSize; float sSum = 0.0;
			for (int i = 0; i < ${SHADOW_SOFT.taps}; i++) {
				float sr = sqrt((float(i) + 0.5) / ${SHADOW_SOFT.taps}.0), st = float(i) * 2.39996323 + sAng;
				sSum += texture2DCompare(shadowMap, shadowCoord.xy + vec2(cos(st), sin(st)) * sr * sR, shadowCoord.z);
			}
			shadow = sSum / ${SHADOW_SOFT.taps}.0;
		` + src.slice(b); }
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
export const hemi = new THREE.HemisphereLight(0xd8c8b0, 0x4a3426, 0.62);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffc89c, 0.85);
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
