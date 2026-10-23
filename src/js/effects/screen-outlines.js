// Outlines round whole models, drawn on screen (outline, outlinePass). Loaded early: models are outlined as they're
// built, some of them while the game loads (you, player/player.js).
// Each model with an outline (you, a teammate, a bench, a pickup, a zombie caught in the light) is drawn into a mask
// after the frame: a flat id for the model and its depth. Then one pass over the screen draws an even line round each
// model's whole silhouette (never round the boxes it's built of, so there are no seams, no rims inside it and no
// boxes showing through a body that's fading in), antialiased, with a soft glow outside it in the same colour. A
// line never crosses anything outlined that stands nearer, so a zombie in front of a bench hides the bench's line.
// outline(g, col, scl, thick, mat) gives the outline's control: a material whose colour, opacity and visible say how
// it's drawn (mat if one's given). One model can carry several (a zombie lit by your torch, burning, in reach): the
// thickest one showing is the one drawn. thick sets the line's width (OL.w), a width of 0 the default.
import { cam, R, scene, V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { POST, PS_RT } from './post.js';
import { state } from '../game/state.js';

const OL = { w: [0.6, 55, 1, 3], w0: 2.2, glow: 3.5, glowA: 0.3, eps: 0.0015, occ: 0.0015, slots: 64, margin: 10 };   // (occ: how far behind what's drawn there a model can be and still be lined: its own surface, give or take)
const olRoots = [];
// a layer the frame never draws but the outlines' mask does: a pane that's only there to have a line drawn round it
// (an opening's, world/house.js), so it costs nothing in the frame itself
export const OL_LAYER = 1;
const OL_PAD = 9;
// an outline turned on or off eases in and fades out rather than snapping (OL_FADE: how fast, in opacity a second): what
// it's drawn at is u.sh on its control, chasing its opacity while it's visible and nought once it isn't
const OL_FADE = { in: 10, out: 4 };
let olLast = 0;   // how far out from a pixel (in CSS pixels) the lines and glow look: their widest ring, 7.5, and a pixel spare
// a model's mask material: its id and its depth, flat
const olMaskMat = () => new THREE.ShaderMaterial({ uniforms: { uSlot: { value: 0 } }, side: THREE.DoubleSide,
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform float uSlot;\nvoid main() { highp float z = gl_FragCoord.z * 255.0; gl_FragColor = vec4(uSlot / 255.0, floor(z) / 255.0, fract(z), 1.0); }' });
// the outlines' two shaders built ahead, on the targets they draw to (game/loop.js: warmShaders): a mask into a small
// stand-in for the mask, and the lines over the frame. The stand-in's kept, so the shaders it built aren't let go
let olWarmed = null;
export function olWarm() {
  if (!olWarmed) olWarmed = { rt: new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false }),
    m: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), olMaskMat()) };
  R.setRenderTarget(olWarmed.rt); R.compile(olWarmed.m, cam);
  R.setRenderTarget(null); olComp.material.uniforms.tMask.value = olWarmed.rt.texture; R.compile(olCompScene, olCompCam);
}
export function outline(g, col, scl, thick, mat, keep) {
  const ctl = mat || new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
  ctl.userData.olW = thick ? clamp(OL.w[0] + thick * OL.w[1], OL.w[2], OL.w[3]) : OL.w0;
  if (ctl.userData.olRoot) return ctl;   // (more pieces of a model it already outlines: the hat on you, player/look.js)
  ctl.userData.olRoot = g;
  let r = g.userData.ol;
  if (!r) {
    r = g.userData.ol = { g, ctls: [], slot: 0, rad: 0, c: new V3(),
      mat: olMaskMat() };
    olRoots.push(r);
  }
  r.ctls.push(ctl);
  return ctl;
}
// the mask (drawn at the screen's own resolution) and the palette it's read with: each slot's colour and opacity,
// and its line's width
let olRT = null;
const olPalData = new Uint8Array(OL.slots * 2 * 4), olPal = new THREE.DataTexture(olPalData, OL.slots, 2, THREE.RGBAFormat);
olPal.magFilter = olPal.minFilter = THREE.NearestFilter;
const olComp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tMask: { value: null }, tPal: { value: olPal }, uTex: { value: new THREE.Vector2() }, uScale: { value: 1 }, uGlow: { value: OL.glow }, uGlowA: { value: OL.glowA }, uEps: { value: OL.eps }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    tScene: { value: null }, uOcc: { value: 0 }, uOccEps: { value: OL.occ } },
  transparent: true, depthTest: false, depthWrite: false,
  vertexShader: `uniform vec4 uRect; varying vec2 vUv;
void main() { vUv = uRect.xy + (position.xy * 0.5 + 0.5) * uRect.zw; gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tMask, tPal, tScene; uniform vec2 uTex; uniform float uScale, uGlow, uGlowA, uEps, uOcc, uOccEps; varying vec2 vUv;
vec4 pal(float s, float row) { return texture2D(tPal, vec2((s + 0.5) / ${OL.slots.toFixed(1)}, (row + 0.5) / 2.0)); }
void main() {
  vec4 m0 = texture2D(tMask, vUv); float s0 = m0.a > 0.5 ? floor(m0.r * 255.0 + 0.5) : -1.0, d0 = m0.g + m0.b / 255.0;
  float line = 0.0, glow = 0.0; vec3 lc = vec3(0.0), gc = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float r = i < 4 ? float(i) + 1.0 : 4.0 + (float(i) - 3.0) * 1.75;   // rings 1, 2, 3, 4 px out for the line, 5.75 and 7.5 for the glow
    for (int k = 0; k < 8; k++) {
      float a = (float(k) + mod(float(i), 2.0) * 0.5) * 0.7853982;
      vec2 q = vUv + vec2(cos(a), sin(a)) * r * uScale * uTex;
      vec4 m = texture2D(tMask, q);
      if (m.a < 0.5) continue;
      if (uOcc > 0.5 && m.g + m.b / 255.0 > texture2D(tScene, q).r + uOccEps) continue;   // (that part of it is behind a wall or anything else drawn in front of it: no line from there)
      float s = floor(m.r * 255.0 + 0.5); if (s == s0) continue;   // (never inside its own model)
      if (s0 >= 0.0 && d0 < m.g + m.b / 255.0 - uEps) continue;     // something nearer stands here: the line goes behind it
      vec4 c = pal(s, 0.0); if (c.a < 0.004) continue;
      float w = pal(s, 1.0).r * 4.0;
      float l = c.a * clamp(w + 0.5 - r, 0.0, 1.0); if (l > line) { line = l; lc = c.rgb; }
      float g = c.a * uGlowA * (1.0 - smoothstep(w, w + uGlow, r)); if (g > glow) { glow = g; gc = c.rgb; }
    }
  }
  float a = line + glow * (1.0 - line); if (a < 0.003) discard;
  gl_FragColor = vec4(mix(gc, lc, line / max(a, 1e-4)), a);
}` }));
olComp.frustumCulled = false;
const olCompScene = new THREE.Scene(); olCompScene.add(olComp);
const olCompCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const _olV = new V3(), _olB = new THREE.Box3(), _olSz = new THREE.Vector2(), _olCC = new THREE.Color(), _olHid = [], _olSw = [];
// where a model is on screen (drawing-buffer pixels, y up) and how big: r.sx, r.sy, r.sr; false if it's not drawn
function olPlace(r, camera, W, H) {
  for (let o = r.g, inScene = false; ; o = o.parent) { if (!o) return false; if (!o.visible) return false; if (o === scene || o.isScene) { inScene = true; break; } }
  if (!r.rad) { r.g.updateWorldMatrix(true, true); _olB.setFromObject(r.g); if (_olB.isEmpty()) return false; _olB.getCenter(r.c); r.rad = _olB.getSize(_olV).length() * 0.6 + 0.2; r.g.worldToLocal(r.c); }
  _olV.copy(r.c); r.g.localToWorld(_olV); _olV.project(camera);
  const ppm = H / ((camera.top - camera.bottom) / camera.zoom);
  r.sx = (_olV.x * 0.5 + 0.5) * W; r.sy = (_olV.y * 0.5 + 0.5) * H; r.sr = r.rad * ppm;
  return true;
}
export function outlinePass(camera) {
  if (state === 'title') return;   // (none on the menus: the farm behind them is scenery, and nothing there is yours to use)
  camera = camera || cam;
  R.getDrawingBufferSize(_olSz); const W = _olSz.x, H = _olSz.y, px = R.getPixelRatio();
  // which models are outlined right now, and the box on screen round all of them and their glow
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  const now = performance.now(), odt = olLast ? Math.min(0.1, (now - olLast) / 1000) : 0; olLast = now;
  for (let k = olRoots.length - 1; k >= 0; k--) {
    const r = olRoots[k];
    if (!r.g.parent && r.g !== scene) { olRoots.splice(k, 1); delete r.g.userData.ol; r.mat.dispose(); continue; }   // (gone from the farm: a zombie's body cleared away, a pickup taken)
    r.top = null;
    for (const c of r.ctls) {
      const u = c.userData, want = c.visible ? c.opacity : 0;
      u.sh = u.sh === undefined ? want : want > u.sh ? Math.min(want, u.sh + odt * OL_FADE.in) : Math.max(want, u.sh - odt * OL_FADE.out);
      if (u.sh > 0.004 && (!r.top || u.olW > r.top.userData.olW)) r.top = c;
    }
    r.on = olPlace(r, camera, W, H);
    if (!r.on || !r.top) continue;
    const m = r.sr + OL.margin * px; any = true;
    x0 = Math.min(x0, r.sx - m); x1 = Math.max(x1, r.sx + m); y0 = Math.min(y0, r.sy - m); y1 = Math.max(y1, r.sy + m);
  }
  if (!any) return;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  if (!olRT || olRT.width !== W || olRT.height !== H) { if (olRT) olRT.dispose(); olRT = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false }); }
  // the mask: every outlined model in the box (and every other one there, so it can stand in front of a line), each a
  // flat id with its depth; the palette says how each id's line is drawn. It's cleared a ring wider than the box, as far
  // out as the lines look from its edge (OL_PAD), so they never read what an earlier frame left there: a model that's
  // moved on would show as a stray scrap of line in its colour along the box's edge for a moment as you move
  const prevRT = R.getRenderTarget(), ac = R.autoClear, sh = R.shadowMap.autoUpdate, ca = R.getClearAlpha(); R.getClearColor(_olCC);
  const pad = Math.ceil(OL_PAD * px), cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cx1 = Math.min(W, x1 + pad), cy1 = Math.min(H, y1 + pad);
  R.setRenderTarget(olRT); olRT.scissor.set(cx0, cy0, cx1 - cx0, cy1 - cy0); olRT.scissorTest = true; R.setRenderTarget(olRT);
  R.setClearColor(0x000000, 0); R.clear(true, true, false); R.autoClear = false; R.shadowMap.autoUpdate = false;
  let slot = 0; camera.layers.enable(OL_LAYER);
  for (const r of olRoots) {
    if (!r.on || slot >= OL.slots - 1 || r.sx + r.sr < x0 || r.sx - r.sr > x1 || r.sy + r.sr < y0 || r.sy - r.sr > y1) continue;
    r.slot = ++slot; r.mat.uniforms.uSlot.value = slot;
    const c = r.top, i = slot * 4, j = (OL.slots + slot) * 4;
    if (c) { olPalData[i] = c.color.r * 255; olPalData[i + 1] = c.color.g * 255; olPalData[i + 2] = c.color.b * 255; olPalData[i + 3] = Math.min(1, c.userData.sh) * 255; olPalData[j] = c.userData.olW / 4 * 255; }
    else { olPalData[i + 3] = 0; olPalData[j] = 0; }
    // drawn in its mask material: its own meshes as they stand (anything hidden stays hidden), its rims, glows,
    // sprites and a gun's muzzle flash left out (and anything that glows additively, a flash's tongues or a laser
    // beam, never gets a line round it)
    r.g.traverse(o => {
      if (o.userData.isOutline || o.userData.isFlash || o.isSprite || o.isPoints || o.isLine || o.isInstancedMesh) { if (o.visible) { o.visible = false; _olHid.push(o); } return; }
      if (!o.isMesh) return;
      const m = o.material; if (!m || (!Array.isArray(m) && (m.visible === false || m.colorWrite === false || m.blending === THREE.AdditiveBlending))) { if (o.visible) { o.visible = false; _olHid.push(o); } return; }
      _olSw.push(o, m); o.material = r.mat;
    });
    R.render(r.g, camera);
    for (let k = 0; k < _olSw.length; k += 2) _olSw[k].material = _olSw[k + 1];
    _olSw.length = 0; _olHid.forEach(o => { o.visible = true; }); _olHid.length = 0;
  }
  camera.layers.disable(OL_LAYER); olPal.needsUpdate = true;
  // the lines and their glow, over the frame in that box
  R.setRenderTarget(prevRT);
  const U = olComp.material.uniforms; U.tMask.value = olRT.texture; U.uTex.value.set(1 / W, 1 / H); U.uScale.value = px;
  // only what's in view gets a line: a model's parts behind a wall (or anything else) are left out by the frame's own
  // depth (effects/post.js), when there is one
  U.uOcc.value = POST.ok && PS_RT.sc && PS_RT.sc.depthTexture ? 1 : 0; U.tScene.value = U.uOcc.value ? PS_RT.sc.depthTexture : null;
  U.uRect.value.set(x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H);
  R.render(olCompScene, olCompCam);
  R.autoClear = ac; R.shadowMap.autoUpdate = sh; R.setClearColor(_olCC, ca);
}
