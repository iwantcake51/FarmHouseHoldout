// The frame's own post-processing: ambient occlusion (SSAO) and a soft bloom, laid over the scene in one pass.
// The farm's drawn into a multisampled target (WebGL2) so it keeps its antialiasing and gives a depth texture; the
// occlusion's worked out from that depth at half the resolution, blurred wide and soft (gently held back across a big
// step in depth, so it doesn't spread far round a zombie onto the ground behind it, but grades off rather than
// stopping in steps) and brought up to full size smoothly; the bright
// parts (muzzle flashes, eyes and spit glowing in the dark) spread out at a quarter and an eighth of the size. Then one
// pass puts it all on the screen. Without WebGL2 the scene's drawn straight to the screen as it always was.
// The camera's orthographic, so a point's place in view comes straight from where it is on screen and its depth:
// that's what makes the occlusion cheap and exact here.

import { lodFigures } from './lod.js';
import { cullForests, stepSunShadows } from '../world/tree-cull.js';
import { cam, hemi, OVER_LAYER, R, scene, sun, viewRect } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { MIST, MIST_GLSL, MIST_U, mistTick, mistUniforms } from '../world/mist.js';
import { flash } from './muzzle-flash.js';
import { heatBloom, heatGlowing } from './supp-heat.js';
import { batchSprites } from './sprite-batch.js';
import { eyeDepth } from './eye-glow.js';
import { zombies } from '../zombies/zombie-types.js';
import { curDark } from '../lighting/day-night.js';
import { BLOOM_K, SET } from '../ui/settings.js';

// AO: how far round a point it looks for what shades it (metres), how dark the most shaded corner goes, its bias (how
// near a surface counts as shading, against acne on flat ground), the samples by quality level, and how its shade
// thins out into the fog; BLOOM: where brightness starts to glow and how softly it comes in, and how strong it is,
// each [by day, in the dark] (curDark, lighting/day-night.js): by day only the brightest things glow, faintly, so
// sunlit walls don't haze over; in the dark a muzzle flash, a lamp, eyes and spit bloom out
const AO = { r: 0.55, k: 0.5, bias: 0.025, n: [0, 10, 14], pow: 1.25, keep: 0.9, fade: 2.5 };
const BLOOM = { th: [0.95, 0.87], knee: [0.07, 0.14], k: [0.1, 0.24], k2: [0.06, 0.15] };
// the things that glow whatever the hour (zombies' eyes and their halos and trails, muzzle flashes): on a layer of
// their own, drawn alone into a small target and added into the glow in full, where nothing nearer hides them (the
// scene's depth, within GLOW.tol m: the glow pass is drawn at half size). GLOW.k: how strongly
export const GLOW_LAYER = 3, GLOW = { k: 1.35, tol: 0.03 };
// the sun and the sky's light are on the glow layer too: what glows is all unlit, so they change nothing there, but
// three keys a shadow's shader to the lights of the last draw (the glow pass's, when there is one), and this way it's
// the same every frame, so one built ahead (game/loop.js: warmShaders) is never built again mid-wave for want of them
sun.layers.enable(GLOW_LAYER); hemi.layers.enable(GLOW_LAYER);
const lerpD = a => a[0] + (a[1] - a[0]) * clamp(curDark, 0, 1);
// POST.q: the quality the frame's run at (2 full, 1 fewer occlusion samples, 0 no occlusion: game/loop.js steps it
// down when the frame rate drops, before the resolution goes)
// POST.aoK: how much of the occlusion's shown, eased in and out (AO.fade a second) as it's turned on and off, so a
// quality change never pops it on or off the whole screen at once
export const POST = { ok: true, q: 2, w: 0, h: 0, aoK: 1, aoT: 0 };
const PS_VERT = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// linear depth from the depth buffer: an orthographic camera's is straight from near to far; one with perspective (first
// person, the free camera: game/view-cam.js, uNF.z 1) bunches up toward the far end
const PS_DEPTH = `
uniform sampler2D tDepth; uniform vec3 uNF;
float viewD(vec2 uv) { float z = texture2D(tDepth, uv).r; return uNF.z > 0.5 ? uNF.x * uNF.y / (uNF.y - z * (uNF.y - uNF.x)) : uNF.x + z * (uNF.y - uNF.x); }`;
const psMat = (frag, uniforms, defines) => new THREE.ShaderMaterial({ uniforms, defines: defines || {}, vertexShader: PS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
const AO_NEAR = [0.55, 1.1];
// the hemisphere it samples, more of them near the middle
const AO_KERNEL = (() => {
  const n = AO.n[AO.n.length - 1], ks = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, z = 0.15 + 0.85 * ((i * 0.618034 + 0.31) % 1), r = Math.sqrt(1 - z * z), s = 0.12 + 0.88 * ((i + 1) / n) ** 2;
    ks.push(new THREE.Vector3(Math.cos(a) * r * s, Math.sin(a) * r * s, z * s));
  }
  return ks;
})();
const aoMat = psMat(`
${PS_DEPTH}
uniform vec2 uSize, uCenter, uPx; uniform float uR, uBias, uN; uniform vec3 uK[${AO_KERNEL.length}]; uniform mat4 uInvView;
varying vec2 vUv;
vec3 viewPos(vec2 uv, float d) { return vec3(uCenter + (uv - 0.5) * uSize * (uNF.z > 0.5 ? d : 1.0), -d); }
void main() {
  float d = viewD(vUv);
  if (d > uNF.y * 0.995) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv, d);
  // its normal from the depth round it: the nearer of the two neighbours each way, so an edge doesn't bend it
  vec3 pl = viewPos(vUv - vec2(uPx.x, 0.0), viewD(vUv - vec2(uPx.x, 0.0))), pr = viewPos(vUv + vec2(uPx.x, 0.0), viewD(vUv + vec2(uPx.x, 0.0)));
  vec3 pd = viewPos(vUv - vec2(0.0, uPx.y), viewD(vUv - vec2(0.0, uPx.y))), pu = viewPos(vUv + vec2(0.0, uPx.y), viewD(vUv + vec2(0.0, uPx.y)));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  // turned a different way every couple of centimetres, so its few samples blur into a smooth shade; the pattern's
  // fixed to the world, not the screen, so it moves with what it's on as the camera moves instead of crawling over it.
  // From your own eyes it's turned pixel by pixel instead (interleaved gradient noise, which the blur takes out
  // entirely): there the arms and the gun are a few tens of centimetres off, where a couple of centimetres is a big
  // patch of screen, each its own shade, a blotchy pattern the blur couldn't smooth
  float rn;
  if (uNF.z > 0.5) rn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  else { vec3 wq = floor((uInvView * vec4(P, 1.0)).xyz * 40.0); rn = fract(sin(dot(wq, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831853; }
  vec3 rv = vec3(cos(rn), sin(rn), 0.0), T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
  mat3 tbn = mat3(T, B, N);
  float occ = 0.0;
  for (int i = 0; i < ${AO_KERNEL.length}; i++) {
    if (float(i) >= uN) break;
    vec3 s = P + tbn * uK[i] * uR;
    vec2 su = (s.xy / (uNF.z > 0.5 ? -s.z : 1.0) - uCenter) / uSize + 0.5;
    float sd = viewD(su), sz = -sd;
    float range = smoothstep(0.0, 1.0, uR / max(abs(P.z - sz), 1e-4));
    occ += step(s.z + uBias, sz) * range;
  }
  float ao = 1.0 - occ / max(uN, 1.0);
  // (and none on what's in your own hands: from your eyes, fading out within arm's reach, AO_NEAR, as a shooter keeps
  // it off its viewmodel)
  if (uNF.z > 0.5) ao = mix(1.0, ao, smoothstep(${AO_NEAR[0].toFixed(2)}, ${AO_NEAR[1].toFixed(2)}, d));
  gl_FragColor = vec4(ao, d / uNF.y, 0.0, 1.0);
}`, { tDepth: { value: null }, uNF: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2() }, uR: { value: AO.r }, uBias: { value: AO.bias }, uN: { value: 8 }, uK: { value: AO_KERNEL }, uInvView: { value: new THREE.Matrix4() } });
// a wide, soft blur one way: a tap counts less the further its depth is from the middle's, but gently (a smooth
// falloff, not a cut), so the shade grades off round an edge instead of stopping at it in steps
const aoBlurMat = psMat(`
uniform sampler2D tAO; uniform vec2 uDir; uniform float uFar;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tAO, vUv); float d0 = c.g * uFar, sum = c.r, wsum = 1.0;
  for (int i = -6; i <= 6; i++) {
    if (i == 0) continue;
    vec4 s = texture2D(tAO, vUv + uDir * float(i));
    float dz = (s.g * uFar - d0) * 2.5;
    float w = exp(-float(i * i) / 24.0) / (1.0 + dz * dz);
    sum += s.r * w; wsum += w;
  }
  gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
}`, { tAO: { value: null }, uDir: { value: new THREE.Vector2() }, uFar: { value: 1 } });
// the occlusion kept steady from frame to frame: last frame's, found where this pixel's point was on the screen then (the
// camera's orthographic, so where it was follows from the two frames' views alone), blended with this frame's
// (AO.keep of the old). It's held to the range of this frame's own round it (so a zombie walking off leaves no smear of
// its shade behind), and thrown out where the depth there isn't what the point's was (it was hidden, or something's moved)
const aoTemporalMat = psMat(`
uniform sampler2D tCur, tHist; uniform mat4 uInvView, uPrevView; uniform vec2 uSize, uCenter, uPrevSize, uPrevCenter, uPx; uniform float uFar, uKeep, uValid, uPs;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tCur, vUv);
  if (uValid < 0.5 || c.g > 0.994) { gl_FragColor = c; return; }
  float d = c.g * uFar;
  vec4 Wp = uInvView * vec4(uCenter + (vUv - 0.5) * uSize * (uPs > 0.5 ? d : 1.0), -d, 1.0);
  vec3 Vp = (uPrevView * Wp).xyz;
  vec2 pu = (Vp.xy / (uPs > 0.5 ? -Vp.z : 1.0) - uPrevCenter) / uPrevSize + 0.5;
  if (pu.x < 0.0 || pu.y < 0.0 || pu.x > 1.0 || pu.y > 1.0) { gl_FragColor = c; return; }
  vec4 h = texture2D(tHist, pu);
  float mn = c.r, mx = c.r;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { float v = texture2D(tCur, vUv + vec2(float(i), float(j)) * uPx).r; mn = min(mn, v); mx = max(mx, v); }
  float hv = clamp(h.r, mn - 0.04, mx + 0.04);
  float ok = 1.0 - smoothstep(0.08, 0.25 + d * 0.004, abs(h.g * uFar + Vp.z));
  gl_FragColor = vec4(mix(c.r, hv, uKeep * ok), c.g, 0.0, 1.0);
}`, { tCur: { value: null }, tHist: { value: null }, uInvView: { value: new THREE.Matrix4() }, uPrevView: { value: new THREE.Matrix4() }, uSize: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uPrevSize: { value: new THREE.Vector2() }, uPrevCenter: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2() }, uFar: { value: 1 }, uKeep: { value: 0.88 }, uValid: { value: 0 }, uPs: { value: 0 } });
// the bright parts, softly cut off, boxed down four pixels to one
const brightMat = psMat(`
uniform sampler2D tCol, tGlow, tGlowD, tSceneD; uniform vec2 uPx; uniform float uTh, uKnee, uGlow, uFlashD; uniform vec3 uNF;
varying vec2 vUv;
float linD(float z) { return uNF.z > 0.5 ? uNF.x * uNF.y / (uNF.y - z * (uNF.y - uNF.x)) : uNF.x + z * (uNF.y - uNF.x); }
void main() {
  vec3 c = (texture2D(tCol, vUv + uPx * vec2(-1.0, -1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(1.0, -1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(-1.0, 1.0)).rgb + texture2D(tCol, vUv + uPx * vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  vec3 o = c * smoothstep(uTh, uTh + uKnee, l);
  // and the glowing things, where they're not behind something
  // (a halo or a trail writes its depth, a little nearer than the eye, so the back of the zombie's own head hides it; the
  // muzzle flash writes none, and is seen only where nothing's nearer than the muzzle (uFlashD: its depth, 0 for none),
  // so the gun in front of it, down the sights, hides it)
  if (uGlow > 0.0) { float sd = texture2D(tSceneD, vUv).r, gd = texture2D(tGlowD, vUv).r, seen = gd > 0.9999 ? step(uFlashD, sd + 0.00002) : step(linD(gd), linD(sd) + ${GLOW.tol.toFixed(3)}); o += texture2D(tGlow, vUv).rgb * seen * uGlow; }
  gl_FragColor = vec4(o, 1.0);
}`, { tCol: { value: null }, tGlow: { value: null }, tGlowD: { value: null }, tSceneD: { value: null }, uPx: { value: new THREE.Vector2() }, uTh: { value: 0.8 }, uKnee: { value: 0.2 }, uGlow: { value: 0 }, uFlashD: { value: 0 }, uNF: { value: new THREE.Vector3() } });
const blurMat = psMat(`
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
const copyMat = psMat(`
uniform sampler2D tSrc; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`, { tSrc: { value: null } });
// a fog round's fog (world/mist.js), marched at a third of the resolution (MIST_RES) into its own target (PS_RT.mist):
// what it lays over each pixel, its colour with the light of a beam in the air under it (rgb: premultiplied, so the
// composite's just c * (1 - a) + rgb) and how much it hides (a). It's soft enough not to need every pixel's own march,
// and a ninth of the pixels is a ninth of its cost, its dearest part by far. Each of its pixels is marched to the
// scene's depth at one point of the ones it covers (mistD: the middle one, or with an even block, a quarter of a pixel
// off the shared corner of the middle four, uMistOff, so it's always the same one), and the composite brings it up to
// full size reading the four nearest by how near their depth is to its own pixel's (MIST_UP), so a zombie in the clear
// in front of thick fog keeps a clean edge instead of a fringe of the fog behind it
const MIST_UP = { near: 0.05, abs: 0.12 }, MIST_RES = 3;
const MIST_D = `
uniform vec2 uFullPx; uniform float uMistOff;
float mistD(vec2 uv) { return viewD(uv - uFullPx * uMistOff); }`;
// (the fog's picture brought up to full size, by depth: the composite's, and a scope's, mistOver)
const MIST_UPS = `
uniform sampler2D tMist; uniform vec2 uMistPx;
// the fog's small picture at uv, whose scene is d out: its four nearest pixels, each by how near it is and how
// near its depth is to d (and if none of them is anywhere near, the nearest in depth)
vec4 mistUp(vec2 uv, float d) {
  vec2 p = uv / uMistPx - 0.5, f = fract(p), b = (floor(p) + 0.5) * uMistPx;
  vec4 s = vec4(0.0), best = vec4(0.0); float ws = 0.0, bd = 1e9, tol = d * ${MIST_UP.near.toFixed(3)} + ${MIST_UP.abs.toFixed(3)};
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i - (i / 2) * 2), float(i / 2)), q = b + o * uMistPx;
    vec4 m = texture2D(tMist, q); float dd = abs(mistD(q) - d);
    float w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y) * (1.0 - smoothstep(0.0, tol, dd));
    s += m * w; ws += w; if (dd < bd) { bd = dd; best = m; }
  }
  return ws > 1e-3 ? s / ws : best;
}`;
const mistMat = psMat(`
${PS_DEPTH}
${MIST_D}
varying vec2 vUv;
${MIST_GLSL}
void main() {
  vec4 m = mistOf(vUv, mistD(vUv));
  gl_FragColor = vec4(m.rgb * m.a + mGlow * (1.0 - m.a), m.a);
}`, { ...MIST_U, tDepth: { value: null }, uNF: { value: new THREE.Vector3() }, uFullPx: { value: new THREE.Vector2() }, uMistOff: { value: 0 } });
// a lens flare off the sun or the moon, from your own eyes (and the free camera): a soft glare round it with a faint
// six-pointed star, and a few dim ghosts of it strung along the line from it through the middle of the screen, each
// faintly tinted as a lens's coatings tint them (FLARE: t, where along that line, past the middle on the far side for a
// minus; r, how big; w, how bright; tint). Kept faint, never in the way: it's only there while the sun or the moon itself
// is in sight (the sky where it is, no wall or tree or roof in front: read off the scene's depth round it), it fades as
// it nears the edge of the view or goes down to the horizon, and the moon's is far weaker (moon); fog thins it (FLARE_K)
const FLARE = [{ t: -0.28, r: 0.028, w: 0.11, tint: [1.0, 0.85, 0.6] }, { t: -0.6, r: 0.055, w: 0.065, tint: [0.6, 1.0, 0.75] }, { t: -0.95, r: 0.1, w: 0.05, tint: [0.55, 0.7, 1.0], ring: 1 },
  { t: 0.42, r: 0.018, w: 0.09, tint: [1.0, 0.7, 0.85] }, { t: -1.35, r: 0.15, w: 0.026, tint: [0.8, 0.9, 1.0] }];
const FLARE_K = { glare: 0.11, wide: 0.045, star: 0.05, moon: 0.3, edge: [0.95, 1.25], low: [-0.01, 0.07], fog: 0.85 };
const flareMat = psMat(`
uniform sampler2D tDepth; uniform vec2 uPos, uAsp; uniform vec3 uCol; uniform float uK;
varying vec2 vUv;
float ghost(vec2 p, vec2 c, float r, float ring) { float d = length((p - c) * uAsp); return ring > 0.5 ? exp(-pow((d - r) / (r * 0.08), 2.0)) * 0.6 + (1.0 - smoothstep(r * 0.2, r, d)) * 0.25 : 1.0 - smoothstep(r * 0.35, r, d); }
void main() {
  // how much of it's in sight: the sky's (nothing drawn nearer) over a small patch round it
  float vis = 0.0;
  for (int i = 0; i < 9; i++) { vec2 o = vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0) * 0.006 / uAsp; vis += step(0.99999, texture2D(tDepth, clamp(uPos + o, 0.001, 0.999)).r); }
  float k = uK * vis / 9.0; if (k < 0.002) discard;
  vec2 q = (vUv - uPos) * uAsp, L = uPos - 0.5; float d = length(q), a = atan(q.y, q.x);
  vec3 col = uCol * (${FLARE_K.glare.toFixed(3)} * exp(-d * 10.0) + ${FLARE_K.wide.toFixed(3)} * exp(-d * 3.2) + ${FLARE_K.star.toFixed(3)} * pow(abs(cos(a * 3.0)), 80.0) * exp(-d * 5.0));
${FLARE.map(g => `  col += uCol * vec3(${g.tint.map(v => v.toFixed(2)).join(', ')}) * ${g.w.toFixed(3)} * ghost(vUv, 0.5 + L * ${g.t.toFixed(2)}, ${g.r.toFixed(3)}, ${(g.ring || 0).toFixed(1)});`).join('\n')}
  gl_FragColor = vec4(col * k, 1.0);
}`, { tDepth: { value: null }, uPos: { value: new THREE.Vector2() }, uAsp: { value: new THREE.Vector2(1, 1) }, uCol: { value: new THREE.Color() }, uK: { value: 0 } });
Object.assign(flareMat, { transparent: true, blending: THREE.AdditiveBlending });
const _flP = new THREE.Vector3();
function lensFlare(target, W, H) {
  if (!cam.isPerspectiveCamera || POST.noFlare) return;
  const d = _flP.copy(sun.position).normalize(), up = d.y;
  _flP.multiplyScalar(100).add(cam.position).project(cam); if (_flP.z > 1) return;
  const e = Math.max(Math.abs(_flP.x), Math.abs(_flP.y)), lum = sun.color.r * 0.3 + sun.color.g * 0.59 + sun.color.b * 0.11;
  const ss = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
  const k = clamp(lum * 1.2, 0, 1) * (1 - clamp(curDark, 0, 1) * (1 - FLARE_K.moon)) * (1 - ss(FLARE_K.edge[0], FLARE_K.edge[1], e)) * ss(FLARE_K.low[0], FLARE_K.low[1], up) * (1 - FLARE_K.fog * MIST.k);
  if (k < 0.002) return;
  const U = flareMat.uniforms; U.tDepth.value = PS_RT.sc.depthTexture; U.uPos.value.set(_flP.x * 0.5 + 0.5, _flP.y * 0.5 + 0.5); U.uAsp.value.set(W / H, 1); U.uCol.value.copy(sun.color); U.uK.value = k;
  psPass(flareMat, target);
}
// all of it on the screen: the scene, darkened by its occlusion (brought up from half size smoothly, read between
// its texels), the fog over it, and the glow added over that
const compMat = psMat(`
${PS_DEPTH}
${MIST_D}
${MIST_UPS}
uniform sampler2D tCol, tAO, tB1, tB2; uniform float uAoK, uAoPow, uB1, uB2, uFogN, uFogF, uDbg, uMistOn;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tCol, vUv).rgb;
  if (uAoK > 0.0) {
    float d = viewD(vUv), ao = texture2D(tAO, vUv).r;
    ao = pow(clamp(ao, 0.0, 1.0), uAoPow);
    float k = uAoK * (1.0 - smoothstep(uFogN, uFogF, d));
    c *= mix(1.0, ao, k);
    if (uDbg > 0.5) c = vec3(mix(1.0, ao, k));
  }
  // a fog round's fog (world/mist.js), under the glow, so lamps and flashes in it still bloom through
  if (uMistOn > 0.5) { vec4 m = mistUp(vUv, viewD(vUv)); c = c * (1.0 - m.a) + m.rgb; }
  c += texture2D(tB1, vUv).rgb * uB1 + texture2D(tB2, vUv).rgb * uB2;
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = texture2D(tDepth, vUv).r;   // (the scene's depth, for what's drawn over the fog to be hidden behind it)
}`, { tMist: { value: null }, uMistOn: { value: 0 }, uMistPx: { value: new THREE.Vector2() }, uFullPx: { value: new THREE.Vector2() }, uMistOff: { value: 0 }, tDepth: { value: null }, uNF: { value: new THREE.Vector3() }, tCol: { value: null }, tAO: { value: null }, tB1: { value: null }, tB2: { value: null }, uAoK: { value: AO.k }, uAoPow: { value: AO.pow }, uB1: { value: 0 }, uB2: { value: 0 }, uFogN: { value: 40 }, uFogF: { value: 70 }, uDbg: { value: 0 } });
// (the composite writes the scene's depth with its colour, whatever's there: depth tested, as only then is it written)
Object.assign(compMat, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
const psQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat); psQuad.frustumCulled = false;
const psScene = new THREE.Scene(); psScene.add(psQuad);
const psCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export const PS_RT = { sc: null, ao: null, ao2: null, hA: null, hB: null, b1: null, b1b: null, b2: null, b2b: null, gl: null, mist: null };
// last frame's view of the occlusion (its history, PS_RT.hA) and the camera it was seen from
const PS_PREV = { view: new THREE.Matrix4(), size: new THREE.Vector2(), center: new THREE.Vector2(), ok: false, cam: null }, _psR = new THREE.Vector4();
const psTarget = (w, h, o) => { const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }, o || {})); t.texture.generateMipmaps = false; return t; };
const _psSz = new THREE.Vector2();
// (re)made at the drawing buffer's size whenever it changes
export function postTargets() {
  R.getDrawingBufferSize(_psSz); const W = _psSz.x, H = _psSz.y;
  if (W === POST.w && H === POST.h && PS_RT.sc) return;
  Object.keys(PS_RT).forEach(k => { if (PS_RT[k]) { PS_RT[k].dispose(); if (PS_RT[k].depthTexture) PS_RT[k].depthTexture.dispose(); } });
  POST.w = W; POST.h = H;
  // (with a stencil: the see-through outlines mark each body's own pixels in it, so a rim never draws over the body it's
  // round, a gun held or slung against you included: effects/outlines.js)
  const sc = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: true, samples: Math.min(4, R.capabilities.maxSamples || 4) });
  sc.texture.generateMipmaps = false;
  sc.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedInt248Type, undefined, undefined, undefined, undefined, undefined, undefined, THREE.DepthStencilFormat); sc.depthTexture.minFilter = sc.depthTexture.magFilter = THREE.NearestFilter;
  PS_RT.sc = sc;
  const h2 = [Math.ceil(W / 2), Math.ceil(H / 2)], h4 = [Math.ceil(W / 4), Math.ceil(H / 4)], h8 = [Math.ceil(W / 8), Math.ceil(H / 8)];
  PS_RT.ao = psTarget(...h2); PS_RT.ao2 = psTarget(...h2); PS_RT.hA = psTarget(...h2); PS_RT.hB = psTarget(...h2); PS_PREV.ok = false;
  PS_RT.b1 = psTarget(...h4); PS_RT.b1b = psTarget(...h4); PS_RT.b2 = psTarget(...h8); PS_RT.b2b = psTarget(...h8);
  // (the fog's in half floats where they can be drawn to: a lamp's glow in it goes past white)
  PS_RT.mist = psTarget(Math.ceil(W / MIST_RES), Math.ceil(H / MIST_RES), MIST_HF());
  PS_RT.gl = psTarget(...h2, { depthBuffer: true }); PS_RT.gl.depthTexture = new THREE.DepthTexture(...h2, THREE.UnsignedIntType); PS_RT.gl.depthTexture.minFilter = PS_RT.gl.depthTexture.magFilter = THREE.NearestFilter;
}
// the fog's shader built ahead with the farm's (game/loop.js: warmShaders), so the first fog round doesn't stall
// building it as the fog rolls in
export function postWarm() { psQuad.material = mistMat; R.compile(psScene, psCam); psQuad.material = copyMat; }
function psPass(mat, target) { psQuad.material = mat; R.setRenderTarget(target); R.render(psScene, psCam); }
// (the fog's in half floats where they can be drawn to: a lamp's glow in it goes past white)
const MIST_HF = () => R.extensions.has('EXT_color_buffer_float') ? { type: THREE.HalfFloatType } : null;
// a fog round's fog laid over a picture drawn from another camera (a scope's, effects/scope-view.js: its target, with
// the depth it was drawn with), so what's down the scope is as hidden by it as it is round it: marched at half the
// picture's size and brought up to it by depth as the frame's is
const mistOverMat = psMat(`
${PS_DEPTH}
${MIST_D}
${MIST_UPS}
varying vec2 vUv;
void main() { vec4 m = mistUp(vUv, viewD(vUv)); if (m.a < 0.002 && dot(m.rgb, vec3(1.0)) < 0.002) discard; gl_FragColor = m; }`, { tMist: { value: null }, uMistPx: { value: new THREE.Vector2() }, uFullPx: { value: new THREE.Vector2() }, uMistOff: { value: 0.25 }, tDepth: { value: null }, uNF: { value: new THREE.Vector3() } });
Object.assign(mistOverMat, { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
let mistOverRT = null;
export function mistOver(target, camera) {
  if (!POST.ok || !(MIST.k > 0.001) || !target.depthTexture) return;
  const w = Math.ceil(target.width / 2), h = Math.ceil(target.height / 2), prev = R.getRenderTarget(), ac = R.autoClear;
  if (!mistOverRT || mistOverRT.width !== w || mistOverRT.height !== h) { if (mistOverRT) mistOverRT.dispose(); mistOverRT = psTarget(w, h, MIST_HF()); }
  mistUniforms(camera); if (!(MIST_U.uMist.value.w > 0)) return;
  const M = mistMat.uniforms, nf = [camera.near, camera.far, camera.isPerspectiveCamera ? 1 : 0];
  M.tDepth.value = target.depthTexture; M.uNF.value.set(...nf); M.uFullPx.value.set(1 / target.width, 1 / target.height); M.uMistOff.value = 0.25;
  R.autoClear = true; psPass(mistMat, mistOverRT);
  const O = mistOverMat.uniforms; O.tMist.value = mistOverRT.texture; O.uMistPx.value.set(1 / w, 1 / h); O.uFullPx.value.set(1 / target.width, 1 / target.height); O.tDepth.value = target.depthTexture; O.uNF.value.set(...nf);
  R.autoClear = false; psPass(mistOverMat, target);
  mistUniforms(); R.autoClear = ac; R.setRenderTarget(prev);
}
function psBlur(src, tmp, w, h) {
  const U = blurMat.uniforms;
  U.tSrc.value = src.texture; U.uDir.value.set(1 / w, 0); psPass(blurMat, tmp);
  U.tSrc.value = tmp.texture; U.uDir.value.set(0, 1 / h); psPass(blurMat, src);
}
// the glowing things alone (GLOW_LAYER), when any are out: the camera seeing only them, nothing else drawn (no
// shadows, no sky). How strongly they're to glow back, or 0 for none this frame
// (nothing's moved since the frame was drawn: the scene's matrices aren't worked out all over again for it)
function glowPass() {
  if (!(flash.visible || heatGlowing() || zombies.some(z => z.vis > 0.05 && !z.dead))) return 0;
  const lm = cam.layers.mask, bg = scene.background, sh = R.shadowMap.autoUpdate, cc = R.getClearAlpha(); R.getClearColor(_glCC);
  cam.layers.set(GLOW_LAYER); scene.background = null; R.shadowMap.autoUpdate = false; R.setClearColor(0x000000, 1); scene.matrixWorldAutoUpdate = false;
  R.setRenderTarget(PS_RT.gl); R.clear(true, true, false); heatBloom(true); eyeDepth(true); R.render(scene, cam); eyeDepth(false); heatBloom(false);
  cam.layers.mask = lm; scene.background = bg; R.shadowMap.autoUpdate = sh; R.setClearColor(_glCC, cc); scene.matrixWorldAutoUpdate = true;
  return GLOW.k;
}
const _glCC = new THREE.Color();
// the muzzle flash's depth on the screen (as the depth buffer has it), just ahead of the muzzle: 0 with none showing
const _fdV = new THREE.Vector3();
function flashDepth() {
  if (!flash.visible || !flash.parent) return 0;
  flash.updateMatrixWorld(true); _fdV.setFromMatrixPosition(flash.matrixWorld).project(cam);
  return _fdV.z < -1 || _fdV.z > 1 ? 0 : _fdV.z * 0.5 + 0.5;
}
// the frame: the farm drawn, then laid on the screen with its occlusion and glow (game/loop.js)
export function renderFrame() {
  batchSprites(cam);   // (the particles, all in one: effects/sprite-batch.js)
  lodFigures(cam);     // (the figures' pieces too small to see left out: effects/lod.js)
  cullForests(cam); stepSunShadows();   // (only the trees in sight drawn, and the far ones' shadows turned with the sun: world/tree-cull.js)
  if (!POST.ok) { R.render(scene, cam); return; }
  postTargets();
  const W = POST.w, H = POST.h, prev = R.getRenderTarget(), ac = R.autoClear;
  // in a fog round the particles and a sight's reticle are left out of the scene and drawn over the fog afterwards
  // (OVER_LAYER), hidden behind what's nearer by the scene's own depth, so the fog behind them isn't laid over them
  const over = MIST.k > 0.001 && cam.layers.isEnabled(OVER_LAYER);
  if (over) cam.layers.disable(OVER_LAYER);
  R.setRenderTarget(PS_RT.sc); R.render(scene, cam);
  if (over) cam.layers.enable(OVER_LAYER);
  R.autoClear = true;
  { const now = performance.now(), dt = POST.aoT ? Math.min(0.1, (now - POST.aoT) / 1000) : 0; POST.aoT = now; const want = AO.n[POST.q] && SET.ao === 'on' ? 1 : 0; POST.aoK += clamp(want - POST.aoK, -dt * AO.fade, dt * AO.fade); }
  const ps = cam.isPerspectiveCamera ? 1 : 0, nf = [cam.near, cam.far, ps], sc = PS_RT.sc, aoN = POST.aoK > 0.001 ? AO.n[POST.q] || AO.n[1] : 0;
  if (aoN) {
    const U = aoMat.uniforms;
    U.tDepth.value = sc.depthTexture; U.uNF.value.set(...nf);
    viewRect(cam, _psR); U.uSize.value.set(_psR.x, _psR.y); U.uCenter.value.set(_psR.z, _psR.w);
    if (PS_PREV.cam !== cam) { PS_PREV.cam = cam; PS_PREV.ok = false; }   // (a different camera: last frame's shade is of another view)
    U.uPx.value.set(1 / W, 1 / H); U.uN.value = aoN; U.uInvView.value.copy(cam.matrixWorld);
    psPass(aoMat, PS_RT.ao);
    const B = aoBlurMat.uniforms, w2 = PS_RT.ao.width, h2 = PS_RT.ao.height; B.uFar.value = cam.far;
    B.tAO.value = PS_RT.ao.texture; B.uDir.value.set(1 / w2, 0); psPass(aoBlurMat, PS_RT.ao2);
    B.tAO.value = PS_RT.ao2.texture; B.uDir.value.set(0, 1 / h2); psPass(aoBlurMat, PS_RT.ao);
    // steadied against last frame's (into the history's other half, which is then the one shown and kept)
    const T = aoTemporalMat.uniforms;
    T.tCur.value = PS_RT.ao.texture; T.tHist.value = PS_RT.hA.texture; T.uInvView.value.copy(cam.matrixWorld); T.uPrevView.value.copy(PS_PREV.view);
    T.uSize.value.copy(U.uSize.value); T.uCenter.value.copy(U.uCenter.value); T.uPrevSize.value.copy(PS_PREV.size); T.uPrevCenter.value.copy(PS_PREV.center);
    T.uPx.value.set(1 / w2, 1 / h2); T.uPs.value = ps; T.uFar.value = cam.far; T.uKeep.value = AO.keep; T.uValid.value = PS_PREV.ok ? 1 : 0;
    psPass(aoTemporalMat, PS_RT.hB);
    const t = PS_RT.hA; PS_RT.hA = PS_RT.hB; PS_RT.hB = t;
    PS_PREV.view.copy(cam.matrixWorldInverse); PS_PREV.size.copy(U.uSize.value); PS_PREV.center.copy(U.uCenter.value); PS_PREV.ok = true;
  } else PS_PREV.ok = false;
  // the glow: the bright parts at a quarter size, blurred, and again at an eighth for its wider haze (none at all with
  // it off in the settings, ui/settings.js)
  const bk = POST.noBloom ? 0 : BLOOM_K[SET.bloom] ?? 1;
  const gk = bk > 0 ? glowPass() : 0;
  if (bk > 0) { const U = brightMat.uniforms; U.tGlow.value = PS_RT.gl.texture; U.tGlowD.value = PS_RT.gl.depthTexture; U.tSceneD.value = sc.depthTexture; U.uGlow.value = gk; U.uFlashD.value = flashDepth(); U.uNF.value.set(...nf); U.uTh.value = lerpD(BLOOM.th); U.uKnee.value = lerpD(BLOOM.knee); U.tCol.value = sc.texture; U.uPx.value.set(1 / W, 1 / H); psPass(brightMat, PS_RT.b1);
    psBlur(PS_RT.b1, PS_RT.b1b, PS_RT.b1.width, PS_RT.b1.height);
    copyMat.uniforms.tSrc.value = PS_RT.b1.texture; psPass(copyMat, PS_RT.b2);
    psBlur(PS_RT.b2, PS_RT.b2b, PS_RT.b2.width, PS_RT.b2.height); }
  { const now = performance.now(); mistTick(POST.mT ? Math.min(0.1, (now - POST.mT) / 1000) : 0); POST.mT = now; mistUniforms(); }   // (world/mist.js)
  const U = compMat.uniforms, mistOn = MIST_U.uMist.value.w > 0;
  U.uMistOn.value = mistOn ? 1 : 0; U.uFullPx.value.set(1 / W, 1 / H);
  if (mistOn) {
    const M = mistMat.uniforms; M.tDepth.value = sc.depthTexture; M.uNF.value.set(...nf); M.uFullPx.value.set(1 / W, 1 / H); M.uMistOff.value = U.uMistOff.value = MIST_RES % 2 ? 0 : 0.25;
    psPass(mistMat, PS_RT.mist); U.tMist.value = PS_RT.mist.texture; U.uMistPx.value.set(1 / PS_RT.mist.width, 1 / PS_RT.mist.height);
  }
  U.tDepth.value = sc.depthTexture; U.uNF.value.set(...nf); U.tCol.value = sc.texture; U.tAO.value = PS_RT.hA.texture;
  U.uAoK.value = aoN ? AO.k * POST.aoK : 0;
  U.tB1.value = PS_RT.b1.texture; U.tB2.value = PS_RT.b2.texture; U.uB1.value = lerpD(BLOOM.k) * bk; U.uB2.value = lerpD(BLOOM.k2) * bk; U.uDbg.value = POST.dbg ? 1 : 0;
  // (the occlusion thins out into the fog as the scene does: from where the fog starts, measured from the camera)
  if (scene.fog) { U.uFogN.value = scene.fog.near; U.uFogF.value = scene.fog.far; }
  psPass(compMat, prev);
  { const ac2 = R.autoClear; R.autoClear = false; lensFlare(prev, W, H); R.autoClear = ac2; }   // (the sun's or the moon's flare over it all)
  if (over) {
    const lm = cam.layers.mask, bg = scene.background, sh = R.shadowMap.autoUpdate;
    cam.layers.set(OVER_LAYER); scene.background = null; R.shadowMap.autoUpdate = false; R.autoClear = false; scene.matrixWorldAutoUpdate = false;
    R.setRenderTarget(prev); R.render(scene, cam);
    cam.layers.mask = lm; scene.background = bg; R.shadowMap.autoUpdate = sh; scene.matrixWorldAutoUpdate = true;
  }
  R.autoClear = ac;
}
