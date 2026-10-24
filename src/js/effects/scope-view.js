// Looking down the sights in first person, what's drawn over the finished frame (game/view-cam.js fills SCOPE_V).
// A scope (the hunting scope, the ACOG): what's down it is a second view of the farm, along the scope's own axis from
// its front lens (so it sways and kicks with the gun), as much of the world as the eyepiece covers shown that many times
// bigger, drawn into the eyepiece's circle on the screen whenever the eyepiece is in view. Over it: the reticle (a
// hunting scope's duplex, the ACOG's lit red chevron and its drop marks), the colour fringes and the darkening of the
// glass toward its rim, and the shadow of the tube closing in from the side your eye's off the scope's axis (all but
// black with the gun at your hip, opening up as it comes up to your eye; a shot's kick and a quick turn swing it), the
// picture and the reticle sliding a little against each other as it does (parallax). Your eye's on the scope, focused
// down it: round it the rest of the view's out of focus (not darkened), the world more the further from the eyepiece, the
// gun a little (SCOPE_DOF). Down any sights the gun's a little soft, your eye on what's beyond it: past a holographic
// sight or a red dot your eye's on the target; with iron sights on the front sight, sharp, the rest of the gun soft.
// A holographic sight's reticle (an EOTech's 68 MOA ring with its four ticks and the 1 MOA dot) and a red dot's dot are
// out at the target, where your eye sees them (not on the glass): grainy red light in the sight's window, staying on
// the aim as your eye moves. An aperture's too close to your eye to see sharp: the whole rear sight, its ears and the
// ring round the hole, goes as soft as it really would (the hole looking a touch bigger for it), the front post sharp
// in the middle of it.
import { FP_CAM, R, scene } from '../core/renderer.js';
import { POST, PS_RT } from './post.js';
import { PM } from '../player/player.js';
import { SPRITE_AIM, SPRITE_RES } from './sprite-batch.js';
import { SCOPE_V } from '../game/view-cam.js';

// the most the scope's view is drawn at
const SCOPE_DIM = { max: 1024 };
// the blur round a scope's eyepiece (px at 1080 high): the most for the world far from it, and for the gun up close
// (near, there and down any other sights); the gun's soft nearer than f0 to f1 (metres, or for iron sights as a share
// of how far off the front sight is). Down iron sights your eye's focused on the front sight, and whatever of the gun's
// nearer is out of focus as much as it really is: a blur as wide as your pupil (pupil, metres across) makes it at that
// distance (the further inside the focus, the more; at most max px), so a rear aperture a hand's breadth from your eye
// goes soft round its hole, the hole looking a little bigger for it, a rear notch only a touch
const SCOPE_DOF = { world: 7, near: 3.5, f0: 0.6, f1: 1.3, iron0: 0.5, iron1: 0.85, pupil: 0.004, max: 26 };
// a holographic sight's reticle: the ring's size (68 MOA across, drawn at about that, so it reads clearly but sits well
// inside the window rather than filling it: k) and a red dot's (2 MOA, at least px)
const HOLO_RET = { moa: 68, k: 1.05, dot: 1.6 };
const MOA = Math.PI / 180 / 60;
const SC = { rt: null, size: 0, fb: null, w: 0, h: 0 }, _ax = new THREE.Vector2(), _svR = new THREE.Vector2(), _svR2 = new THREE.Vector2(), _sz = new THREE.Vector2(), _sp = new THREE.Vector3(), _st = new THREE.Vector3(), _su = new THREE.Vector3();
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.08, 200);
const overlay = (frag, uniforms, blending) => new THREE.ShaderMaterial({ uniforms, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, blending: blending ?? THREE.NormalBlending });
const scopeMat = overlay(`
uniform sampler2D tS, tD; uniform vec2 uC, uOff, uAx, uRot, uRes, uNF; uniform float uR, uRI, uKind, uDark, uHasD, uEyeZ;
// a line's coverage, half width w, at distance d (in the lens's units: its radius is 1), smoothed over a pixel
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 p = (gl_FragCoord.xy - uC) / uR; float d = length(p), px = 1.0 / uR;
  // (whatever's nearer than the eyepiece, a hand, a window's frame, hides it)
  float seen = 1.0;
  if (uHasD > 0.5) { float z = texture2D(tD, gl_FragCoord.xy / uRes).x, vz = uNF.x * uNF.y / (uNF.y - z * (uNF.y - uNF.x)); seen = smoothstep(uEyeZ - 0.02, uEyeZ - 0.005, vz); }
  vec3 col = vec3(0.0);
  if (uDark < 0.5) {
    // the picture: the world as it lies along the scope's axis (uAx, where that points on the screen), magnified, seen
    // through the eyepiece wherever that is: an eye off the axis sees the picture and the reticle together slide
    // against the eyepiece's ring (parallax); colour fringes toward the rim
    vec2 a = (gl_FragCoord.xy - uAx) / uRI, uv = a * 0.5 + 0.5;
    float ca = 0.008 * d * d;
    col = vec3(texture2D(tS, (uv - 0.5) * (1.0 + ca) + 0.5).r, texture2D(tS, uv).g, texture2D(tS, (uv - 0.5) * (1.0 - ca) + 0.5).b);
    col *= vec3(0.98, 1.0, 1.02);   // the coatings' faint cast
    // the reticle, in the scope: on its axis with the picture, turned as the gun's canted
    vec2 r0 = (gl_FragCoord.xy - uAx) / uR, q = vec2(uRot.x * r0.x + uRot.y * r0.y, -uRot.y * r0.x + uRot.x * r0.y);
    if (uKind < 0.5) {
      // a duplex: fine cross hairs in the middle, thick posts out to the rim
      float t = max(ln(abs(q.x), 0.0035, px) * step(abs(q.y), 0.34), ln(abs(q.y), 0.0035, px) * step(abs(q.x), 0.34));
      float k = max(ln(abs(q.x), 0.016, px) * step(0.34, abs(q.y)), ln(abs(q.y), 0.016, px) * step(0.34, abs(q.x)));
      col = mix(col, vec3(0.02), max(t, k));
    } else {
      // the ACOG: a lit red chevron, its tip the aim, and the drop line under it with its marks
      float cv = min(seg(q, vec2(-0.075, -0.07), vec2(0.0, 0.0)), seg(q, vec2(0.075, -0.07), vec2(0.0, 0.0)));
      float bdc = ln(abs(q.x), 0.003, px) * step(q.y, -0.11) * step(-0.62, q.y);
      for (int i = 1; i <= 5; i++) { float y = -0.11 - float(i) * 0.1, w = 0.07 - float(i) * 0.01; bdc = max(bdc, ln(abs(q.y - y), 0.003, px) * step(abs(q.x), w)); }
      col = mix(col, vec3(0.02), bdc);
      col = mix(col, vec3(1.0, 0.16, 0.08) * 1.5, ln(cv, 0.008, px));
      col += vec3(1.0, 0.2, 0.1) * 0.35 * exp(-cv * cv / 0.0012);   // its glow
    }
    // the tube's shadow, closing in from where your eye's off its axis, and the glass darkening to its rim
    col *= 1.0 - smoothstep(0.7, 1.05, length(p + uOff * 0.55));
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, d);
  }
  float inside = (1.0 - smoothstep(1.0 - px * 1.5, 1.0 + px * 1.5, d)) * seen;
  gl_FragColor = vec4(col * inside, inside);   // (nothing round it: the view there's as it is, only out of focus)
}`, { tS: { value: null }, uC: { value: new THREE.Vector2() }, uR: { value: 100 }, uKind: { value: 0 }, uDark: { value: 0 }, uOff: { value: new THREE.Vector2() }, tD: { value: null }, uAx: { value: new THREE.Vector2() }, uRot: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2() }, uRI: { value: 100 }, uHasD: { value: 0 }, uEyeZ: { value: 0.1 } });
// the blur round a scope's eyepiece: a disc of taps (spread on the golden angle) as wide as how far out of focus each
// pixel is: none in the eyepiece, the world more toward the edges, what's close to your eye (the gun) most
const dofMat = overlay(`
uniform sampler2D tC, tD; uniform vec2 uC, uRes, uNF, uF; uniform float uR, uK, uWorld, uNear, uCoc, uFoc, uMax, uHasD;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes; float d = length(gl_FragCoord.xy - uC) / uR, near = 0.0, close = 0.0;
  if (uHasD > 0.5) { float z = texture2D(tD, uv).x, vz = uNF.x * uNF.y / (uNF.y - z * (uNF.y - uNF.x)); near = 1.0 - smoothstep(uF.x, uF.y, vz); close = uFoc > 0.0 ? min(uMax, uCoc * max(0.0, 1.0 / max(vz, 0.01) - 1.0 / uFoc)) : 0.0; }
  float rad = uK * max(max(uWorld * smoothstep(1.0, 2.2, d), uNear * near * smoothstep(0.95, 1.2, d)), close);
  if (rad < 0.4) { gl_FragColor = vec4(texture2D(tC, uv).rgb, 1.0); return; }
  vec3 s = vec3(0.0);
  for (int i = 0; i < 40; i++) { float f = float(i), r = sqrt((f + 0.5) / 40.0) * rad, a = f * 2.39996; s += texture2D(tC, uv + vec2(cos(a), sin(a)) * r / uRes).rgb; }
  gl_FragColor = vec4(s / 40.0, 1.0);
}`, { tC: { value: null }, tD: { value: null }, uC: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2() }, uF: { value: new THREE.Vector2() }, uR: { value: 100 }, uK: { value: 0 }, uWorld: { value: 0 }, uNear: { value: 0 }, uCoc: { value: 0 }, uFoc: { value: 0 }, uMax: { value: 0 }, uHasD: { value: 0 } });
// a holographic sight's reticle and a red dot's dot, added on as light
const SIGHT_U = { uKind: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Vector2() }, uU: { value: new THREE.Vector2() }, uV: { value: new THREE.Vector2() }, uRet: { value: new THREE.Vector2() }, uRR: { value: 10 }, uDot: { value: 1.5 }, uLens: { value: 10 }, uT: { value: 0 } };
const SIGHT_FRAG = `
uniform vec2 uC, uU, uV, uRet; uniform float uKind, uA, uRR, uDot, uLens, uT;
float ln(float d, float w) { return 1.0 - smoothstep(w - 0.6, w + 0.6, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 f = gl_FragCoord.xy;
  // in the window (a holographic sight's, its rounded corners) or the lens (a red dot's)
  float m;
  if (uKind < 0.5) {
    vec2 q = inverse(mat2(uU, uV)) * (f - uC), b = abs(q) - vec2(1.0 - 0.28);
    float sd = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.28;
    m = 1.0 - smoothstep(-0.03, 0.01, sd);
  } else m = 1.0 - smoothstep(uLens - 1.0, uLens + 1.0, length(f - uC));
  vec2 p = f - uRet; float e = length(p), lit;
  if (uKind < 0.5) {
    // the ring, its four ticks (square to the sight) and the dot in the middle, speckled as a hologram's light is
    vec2 ux = normalize(uU), uy = normalize(uV); float w = max(0.7, uRR * 0.055);
    lit = ln(abs(e - uRR), w);
    lit = max(lit, ln(min(min(seg(p, ux * uRR * 0.94, ux * uRR * 1.32), seg(p, -ux * uRR * 0.94, -ux * uRR * 1.32)), min(seg(p, uy * uRR * 0.94, uy * uRR * 1.32), seg(p, -uy * uRR * 0.94, -uy * uRR * 1.32))), w));
    lit = max(lit, ln(e, uDot));
    lit *= 0.55 + 0.6 * hash(floor(f / 1.3) + floor(uT * 9.0));
    lit += 0.18 * exp(-pow(abs(e - uRR) / (w * 3.0), 2.0)) + 0.5 * exp(-e * e / (uDot * uDot * 6.0));
  } else lit = ln(e, uDot) + 0.6 * exp(-e * e / (uDot * uDot * 5.0)) + 0.12 * exp(-e / (uDot * 4.0));
  gl_FragColor = vec4(vec3(1.0, 0.13, 0.07) * lit * m * uA * 1.3, 1.0);
}`;
const holoMat = overlay(SIGHT_FRAG, SIGHT_U, THREE.AdditiveBlending);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), scopeMat); quad.frustumCulled = false;
const quadScene = new THREE.Scene(); quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function drawQuad(mat) { quad.material = mat; R.render(quadScene, quadCam); }
// a point's place on the screen, in pixels from its bottom left (W, H: the drawing buffer)
const toPx = (v, W, H, out) => { _sp.copy(v).project(FP_CAM); return out.set((_sp.x + 1) / 2 * W, (_sp.y + 1) / 2 * H); };

// over the finished frame, in first person (game/loop.js)
export function scopePass() {
  const S = SCOPE_V; if (!S.on || S.a < 0.01) return;
  R.getDrawingBufferSize(_sz); const W = _sz.x, H = _sz.y, c = FP_CAM, f = H / 2 / Math.tan(c.fov * Math.PI / 360);
  const prev = R.getRenderTarget(), ac = R.autoClear; R.autoClear = false;
  if (S.kind === 'scope' || S.kind === 'acog') scopeOver(S, W, H, f);
  else sightOver(S, W, H, f);
  R.autoClear = ac; R.setRenderTarget(prev);
}

function scopeOver(S, W, H, f) {
  const c = FP_CAM;
  // the eyepiece on the screen: where its middle is and how big it looks from your eye (nothing if it's turned away)
  if (_st.subVectors(c.position, S.eye).dot(S.dir) > -0.005) return;
  _sp.copy(S.eye).project(c); if (_sp.z > 1) return;
  const dist = Math.max(0.02, c.position.distanceTo(S.eye)), r = S.r / dist * f, cx = (_sp.x + 1) / 2 * W, cy = (_sp.y + 1) / 2 * H;
  if (r < 2 || cx < -r || cy < -r || cx > W + r || cy > H + r) return;
  // what's down it: the world over as much of your view as the eyepiece covers, S.mag times bigger (not drawn while your
  // eye's so far off its axis that it's black)
  const dark = S.off.length() * 0.55 > 2.1;
  // where the scope's axis points on the screen (the picture's middle and the reticle's), and how far round it the
  // picture has to reach to fill the eyepiece; which way the gun's canted on the screen
  toPx(_st.copy(c.position).addScaledVector(S.dir, 100), W, H, _ax);
  const ri = r + Math.hypot(_ax.x - cx, _ax.y - cy) + 2;
  toPx(_su.copy(S.eye).addScaledVector(S.ux, -0.01), W, H, _svR); toPx(S.eye, W, H, _svR2); const ang = Math.atan2(_svR.y - _svR2.y, _svR.x - _svR2.x);
  _sp.copy(S.eye).project(c);
  if (!dark) {
    const half = Math.atan(ri / f); scopeCam.fov = 2 * Math.atan(Math.tan(half) / S.mag) * 180 / Math.PI; scopeCam.updateProjectionMatrix();
    scopeCam.position.copy(S.obj); scopeCam.up.set(0, 1, 0).applyQuaternion(c.quaternion); scopeCam.lookAt(_st.copy(S.obj).add(S.dir)); scopeCam.updateMatrixWorld(true);
    const size = Math.min(SCOPE_DIM.max, Math.max(128, Math.round(ri * 2 / 64) * 64));
    if (!SC.rt || SC.size !== size) { if (SC.rt) SC.rt.dispose(); SC.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: Math.min(4, R.capabilities.maxSamples || 4) }); SC.size = size; }
    // (you're left out of it: the gun's own front sight, or your arm, a hand's breadth from its front lens)
    const pv = PM.g.visible, sh = R.shadowMap.autoUpdate; PM.g.visible = false;
    // (the particles thinned toward the middle of the scope's own view too, then back as they were for the main view)
    const am = [SPRITE_AIM.x, SPRITE_AIM.y, SPRITE_AIM.z, SPRITE_AIM.w], ar = [SPRITE_RES.x, SPRITE_RES.y];
    SPRITE_AIM.set(0.5, 0.5, 0.3, am[3]); SPRITE_RES.set(size, size);
    R.shadowMap.autoUpdate = false; R.autoClear = true; R.setRenderTarget(SC.rt); R.render(scene, scopeCam); R.autoClear = false; R.shadowMap.autoUpdate = sh; PM.g.visible = pv;
    SPRITE_AIM.set(...am); SPRITE_RES.set(...ar);
  }
  R.setRenderTarget(null);
  // the view round it out of focus, as the scope comes to your eye
  const k = Math.min(1, S.w * 1.25);
  dof(k, W, H, cx, cy, r, SCOPE_DOF.world, SCOPE_DOF.f0, SCOPE_DOF.f1);
  const U = scopeMat.uniforms;
  U.tS.value = SC.rt ? SC.rt.texture : null; U.uC.value.set(cx, cy); U.uR.value = r; U.uKind.value = S.kind === 'acog' ? 1 : 0; U.uOff.value.copy(S.off); U.uDark.value = dark || !SC.rt ? 1 : 0;
  U.uAx.value.copy(_ax); U.uRI.value = ri; U.uRot.value.set(Math.cos(ang), Math.sin(ang));
  { const dep = POST.ok && PS_RT.sc && PS_RT.sc.depthTexture; U.tD.value = dep || null; U.uHasD.value = dep ? 1 : 0; U.uNF.value.set(c.near, c.far); U.uRes.value.set(W, H); U.uEyeZ.value = -_su.copy(S.eye).applyMatrix4(c.matrixWorldInverse).z; }
  drawQuad(scopeMat);
}

// the frame copied and blurred where it's out of focus (k: how far down the sights), round a scope's eyepiece at (cx, cy)
// r across, and nearer than f0 to f1 (none for what's beyond it); focus: where your eye's focused, down iron sights (f:
// the view's focal length in px), what's nearer it blurred as your pupil would blur it
function dof(k, W, H, cx, cy, r, world, f0, f1, focus = 0, f = 0) {
  if (k < 0.02) return;
  const c = FP_CAM, D = dofMat.uniforms, dep = POST.ok && PS_RT.sc && PS_RT.sc.depthTexture;
  if (!dep && !world) return;
  if (!SC.fb || SC.w !== W || SC.h !== H) { if (SC.fb) SC.fb.dispose(); SC.fb = new THREE.FramebufferTexture(W, H); SC.w = W; SC.h = H; }
  R.copyFramebufferToTexture(SC.fb);
  D.tC.value = SC.fb; D.tD.value = dep || null; D.uHasD.value = dep ? 1 : 0; D.uNF.value.set(c.near, c.far); D.uF.value.set(f0, f1); D.uRes.value.set(W, H);
  D.uC.value.set(cx, cy); D.uR.value = r; D.uK.value = k * k * (3 - 2 * k); D.uWorld.value = world * H / 1080; D.uNear.value = SCOPE_DOF.near * H / 1080; D.uCoc.value = SCOPE_DOF.pupil / 2 * f; D.uFoc.value = focus; D.uMax.value = SCOPE_DOF.max * H / 1080;
  drawQuad(dofMat);
}

function sightOver(S, W, H, f) {
  const c = FP_CAM, U = SIGHT_U;
  R.setRenderTarget(null);
  // the gun soft: with iron sights all but the front sight, your eye on it; past a dot or a hologram, your eye on the target
  const iron = S.kind !== 'holo' && S.kind !== 'dot', fs = c.position.distanceTo(S.obj);
  // (your eye focused on the front sight: an aperture, right in front of it, a soft ring round the sharp front post)
  dof(S.a, W, H, -1e5, -1e5, 1, 0, iron ? fs * SCOPE_DOF.iron0 : SCOPE_DOF.f0, iron ? fs * SCOPE_DOF.iron1 : SCOPE_DOF.f1, iron ? fs : 0, f);
  if (S.kind !== 'holo' && S.kind !== 'dot') return;   // (iron sights: nothing over the view)
  U.uA.value = S.a; U.uT.value = performance.now() / 1000;
  // out at the target along the sight's axis, where your eye sees the reticle
  toPx(_st.copy(c.position).addScaledVector(S.dir, 100), W, H, U.uRet.value); if (_sp.z > 1) return;   // (well out, inside the view's far end)
  if (S.kind === 'holo') {
    // the window, its front, square to the sight
    toPx(S.obj, W, H, U.uC.value); if (_sp.z > 1) return;
    toPx(_su.copy(S.obj).addScaledVector(S.ux, S.hw), W, H, U.uU.value).sub(U.uC.value);
    toPx(_su.copy(S.obj).addScaledVector(S.uy, S.hh), W, H, U.uV.value).sub(U.uC.value);
    U.uKind.value = 0; U.uRR.value = f * Math.tan(HOLO_RET.moa / 2 * MOA * HOLO_RET.k); U.uDot.value = Math.max(0.9, U.uRR.value / 30);
  } else {
    toPx(S.obj, W, H, U.uC.value); if (_sp.z > 1) return;
    U.uKind.value = 1; U.uLens.value = S.r / Math.max(0.02, c.position.distanceTo(S.obj)) * f; U.uDot.value = Math.max(HOLO_RET.dot * H / 1080, f * Math.tan(MOA));
  }
  drawQuad(holoMat);
}
