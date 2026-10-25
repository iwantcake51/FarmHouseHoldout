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
const SC = { rt: null, size: 0, fb: null, w: 0, h: 0, on: false, cx: 0, cy: 0, r: 0 }, _ax = new THREE.Vector2(), _svR = new THREE.Vector2(), _svR2 = new THREE.Vector2(), _sz = new THREE.Vector2(), _sp = new THREE.Vector3(), _st = new THREE.Vector3(), _su = new THREE.Vector3();
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.08, 200);
const overlay = (frag, uniforms, blending) => new THREE.ShaderMaterial({ uniforms, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, blending: blending ?? THREE.NormalBlending });
// the eyepiece's lens itself, a real disc of glass in the scope (lensOn), drawn with the farm: from any angle it's the
// shape it is and anything in front of it hides it. Off your eye's line it's dark coated glass; the scope up to your
// eye (the gun in your hands, SCOPE_V), the picture down the scope's axis is seen through it
const LENS_FRAG = `
uniform sampler2D tS; uniform vec2 uOff, uAx, uRot, uRes; uniform float uR, uRI, uKind, uDark;
varying vec2 vP; varying vec4 vClip;
// a line's coverage, half width w, at distance d (in the lens's units: its radius is 1), smoothed over a pixel
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// the eyepiece's glass as it looks with your eye off its axis (at the hip, or coming up): dark coated glass, the sky
// above you faintly in it, a soft highlight curving round its upper side and a brighter rim where the glass curves
// away, a little sheen of the coating's colour; not a flat black disc
vec3 glass(vec2 p, float d) {
  vec3 c = mix(vec3(0.012, 0.016, 0.02), vec3(0.075, 0.088, 0.1), smoothstep(-0.9, 0.9, p.y) * 0.75);
  c += vec3(0.05, 0.035, 0.07) * (1.0 - smoothstep(0.0, 0.8, length(p - vec2(0.25, -0.3))));   // the coating's sheen
  vec2 h = p - vec2(-0.32, 0.38); c += vec3(0.42, 0.45, 0.48) * exp(-dot(h, h) * 14.0) * 0.55;    // the highlight
  float arc = exp(-pow((d - 0.78) / 0.05, 2.0)) * smoothstep(-0.1, 0.6, -p.x * 0.6 + p.y);           // curving round the top
  c += vec3(0.3, 0.32, 0.35) * arc * 0.35 + vec3(0.12) * smoothstep(0.86, 0.99, d);                   // and the rim
  return c;
}
void main() {
  vec2 p = vP; float d = length(p), px = 1.0 / max(uR, 1.0);
  vec2 fc = (vClip.xy / vClip.w * 0.5 + 0.5) * uRes;   // (where on the screen, in the same pixels as the axis)
  vec3 col = glass(p, d);
  if (uDark < 0.5) {
    // the picture: the world as it lies along the scope's axis (uAx, where that points on the screen), magnified, seen
    // through the eyepiece wherever that is: an eye off the axis sees the picture and the reticle together slide
    // against the eyepiece's ring (parallax); colour fringes toward the rim
    vec2 a = (fc - uAx) / uRI, uv = a * 0.5 + 0.5;
    float ca = 0.008 * d * d; vec3 gl = col;
    col = vec3(texture2D(tS, (uv - 0.5) * (1.0 + ca) + 0.5).r, texture2D(tS, uv).g, texture2D(tS, (uv - 0.5) * (1.0 - ca) + 0.5).b);
    col *= vec3(0.98, 1.0, 1.02);   // the coatings' faint cast
    // the reticle, in the scope: on its axis with the picture, turned as the gun's canted
    vec2 r0 = (fc - uAx) / uR, q = vec2(uRot.x * r0.x + uRot.y * r0.y, -uRot.y * r0.x + uRot.x * r0.y);
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
    // the tube's shadow, closing in from where your eye's off its axis, and the glass darkening to its rim; where the
    // picture's shut off, the glass itself is what you see
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, d);
    col = mix(gl, col, 1.0 - smoothstep(0.7, 1.05, length(p + uOff * 0.55)));
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const LENS_VERT = 'uniform float uLR; varying vec2 vP; varying vec4 vClip; void main() { vP = position.xy / uLR; vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vClip; }';
const lensMat = live => new THREE.ShaderMaterial({ vertexShader: LENS_VERT, fragmentShader: LENS_FRAG, side: THREE.DoubleSide,
  uniforms: { tS: { value: null }, uLR: { value: 1 }, uR: { value: 100 }, uKind: { value: 0 }, uDark: { value: 1 }, uOff: { value: new THREE.Vector2() }, uAx: { value: new THREE.Vector2() }, uRot: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) }, uRI: { value: 100 } } });
// A holographic sight's reticle and a red dot's dot as they really are: an image focused out at infinity, seen only
// through the sight's window and only looking along it. Each sight has a pane just inside its window (reticleOn) whose
// shader works out, for each point of the pane, which way your eye looks through it; the reticle's there (out along the
// sight's own axis, the way it points) when that way lines up with the ring, the ticks or the dot, so from anywhere off
// the sight's line it's not in the window at all, it moves with the gun as one, and anything in front of the window
// (your hand, your body) hides it. Sizes in MOA, as the real ones are (the EOTech's 68 MOA ring with its ticks and 1
// MOA dot; a 2 MOA dot), never thinner than a pixel and a bit (RET_MIN), the light grainy as a hologram's is
const RET_MIN = 1.3, RET_U = { uT: { value: 0 } };
const RET_VERT = 'varying vec3 vV, vAx, vUp; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; vAx = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz); vUp = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); gl_Position = projectionMatrix * mv; }';
const RET_FRAG = `
uniform float uKind, uT; varying vec3 vV, vAx, vUp;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec3 v = normalize(vV); float c = dot(v, vAx); if (c < 0.9) discard;
  vec3 rt = normalize(cross(vAx, vUp)), up = cross(rt, vAx);
  vec2 m = vec2(dot(v, rt), dot(v, up)) / c / 0.000290888;   // (how far off the sight's line this look is, in MOA)
  float px = max(length(fwidth(m)), 0.0001), e = length(m), lit;
  if (uKind < 0.5) {
    float w = max(1.1, px * ${RET_MIN.toFixed(2)});
    lit = ln(abs(e - 34.0), w, px);
    lit = max(lit, ln(min(min(seg(m, vec2(32.0, 0.0), vec2(45.0, 0.0)), seg(m, vec2(-32.0, 0.0), vec2(-45.0, 0.0))), min(seg(m, vec2(0.0, 32.0), vec2(0.0, 45.0)), seg(m, vec2(0.0, -32.0), vec2(0.0, -45.0)))), w, px));
    lit = max(lit, ln(e, max(0.6, px * ${RET_MIN.toFixed(2)}), px));
    lit *= 0.55 + 0.6 * hash(floor(gl_FragCoord.xy / 1.3) + floor(uT * 9.0));
    lit += 0.18 * exp(-pow(abs(e - 34.0) / (w * 3.0), 2.0)) + 0.5 * exp(-e * e / (w * w * 3.0));
  } else { float r = max(1.0, px * ${RET_MIN.toFixed(2)}); lit = ln(e, r, px) + 0.6 * exp(-e * e / (r * r * 5.0)) + 0.12 * exp(-e / (r * 4.0)); }
  if (lit < 0.004) discard;
  gl_FragColor = vec4(vec3(1.0, 0.13, 0.07) * lit * 1.3, 1.0);
}`;
const retMat = kind => new THREE.ShaderMaterial({ vertexShader: RET_VERT, fragmentShader: RET_FRAG, uniforms: { uKind: { value: kind === 'holo' ? 0 : 1 }, uT: RET_U.uT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const RET_MATS = {};
// a sight's reticle pane (weapons/attachments.js): w by h (a holographic sight's window) or a disc r across (a red
// dot's), at (x, y, z) on p, square to the sight's axis
export function reticleOn(p, kind, x, y, z, w, h) {
  const geo = kind === 'holo' ? new THREE.PlaneGeometry(w, h) : new THREE.CircleGeometry(w, 32);
  const m = new THREE.Mesh(geo, RET_MATS[kind] || (RET_MATS[kind] = retMat(kind))); m.position.set(x, y, z); m.renderOrder = 6;
  m.userData.reticlePane = true; m.castShadow = m.receiveShadow = false; p.add(m); return m;
}
function stepReticles() { RET_U.uT.value = performance.now() / 1000; }
// every eyepiece's glass but the one being looked down (each its own radius: uLR), and the one that is (LENS.live)
const LENS = { glass: {}, live: null, on: null };
const glassMat = r => LENS.glass[r] || (LENS.glass[r] = lensMat(false), LENS.glass[r].uniforms.uLR.value = r, LENS.glass[r]);
// a scope's eyepiece lens (weapons/attachments.js): a disc r across at (x, y, z) on p, facing back toward your eye
export function lensOn(p, x, y, z, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), glassMat(r)); m.rotation.y = Math.PI; m.position.set(x, y, z);
  m.userData.lens = r; m.castShadow = m.receiveShadow = false; p.add(m); return m;
}
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
  for (int i = 0; i < 40; i++) { float f = float(i), r = sqrt((f + 0.5) / 40.0) * rad, a = f * 2.39996; s += min(texture2D(tC, uv + vec2(cos(a), sin(a)) * r / uRes).rgb, vec3(1.0)); }   // (a flash's light clipped: it's not smeared out over the sights)
  gl_FragColor = vec4(s / 40.0, 1.0);
}`, { tC: { value: null }, tD: { value: null }, uC: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uNF: { value: new THREE.Vector2() }, uF: { value: new THREE.Vector2() }, uR: { value: 100 }, uK: { value: 0 }, uWorld: { value: 0 }, uNear: { value: 0 }, uCoc: { value: 0 }, uFoc: { value: 0 }, uMax: { value: 0 }, uHasD: { value: 0 } });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dofMat); quad.frustumCulled = false;
const quadScene = new THREE.Scene(); quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function drawQuad(mat) { quad.material = mat; R.render(quadScene, quadCam); }
// a point's place on the screen, in pixels from its bottom left (W, H: the drawing buffer)
const toPx = (v, W, H, out) => { _sp.copy(v).project(FP_CAM); return out.set((_sp.x + 1) / 2 * W, (_sp.y + 1) / 2 * H); };

// before the frame's drawn (game/loop.js): what's down the scope that's at your eye, drawn for its lens to show
// (scopeLens), or every lens back to plain glass
export function scopePrep() {
  stepReticles();
  const S = SCOPE_V, on = S.on && S.a >= 0.01 && (S.kind === 'scope' || S.kind === 'acog') && S.src;
  let lens = null; if (on) S.src.traverse(o => { if (!lens && o.userData.lens) lens = o; });
  if (LENS.on && LENS.on !== lens) { LENS.on.material = glassMat(LENS.on.userData.lens); LENS.on = null; }
  SC.on = false; if (!lens) return;
  R.getDrawingBufferSize(_sz); const prev = R.getRenderTarget(), ac = R.autoClear;
  if (scopeLens(S, lens, _sz.x, _sz.y, _sz.y / 2 / Math.tan(FP_CAM.fov * Math.PI / 360))) SC.on = true;
  R.autoClear = ac; R.setRenderTarget(prev);
}
// over the finished frame, in first person (game/loop.js)
export function scopePass() {
  const S = SCOPE_V; if (!S.on || S.a < 0.01) return;
  R.getDrawingBufferSize(_sz); const W = _sz.x, H = _sz.y, c = FP_CAM, f = H / 2 / Math.tan(c.fov * Math.PI / 360);
  const prev = R.getRenderTarget(), ac = R.autoClear; R.autoClear = false;
  if (S.kind === 'scope' || S.kind === 'acog') { R.setRenderTarget(null); if (SC.on) dof(Math.min(1, S.w * 1.25), W, H, SC.cx, SC.cy, SC.r, SCOPE_DOF.world, SCOPE_DOF.f0, SCOPE_DOF.f1); }   // (the view round it out of focus, as the scope comes to your eye)
  else sightOver(S, W, H, f);
  R.autoClear = ac; R.setRenderTarget(prev);
}

function scopeLens(S, lens, W, H, f) {
  const c = FP_CAM;
  // the eyepiece on the screen: where its middle is and how big it looks from your eye (nothing if it's turned away)
  if (_st.subVectors(c.position, S.eye).dot(S.dir) > -0.005) return false;
  _sp.copy(S.eye).project(c); if (_sp.z > 1) return false;
  const dist = Math.max(0.02, c.position.distanceTo(S.eye)), r = S.r / dist * f, cx = (_sp.x + 1) / 2 * W, cy = (_sp.y + 1) / 2 * H;
  if (r < 2 || cx < -r || cy < -r || cx > W + r || cy > H + r) return false;
  SC.cx = cx; SC.cy = cy; SC.r = r;
  // what's down it: the world over as much of your view as the eyepiece covers, S.mag times bigger (not drawn while your
  // eye's so far off its axis that it's black)
  const dark = S.off.length() * 0.55 > 2.1;
  // where the scope's axis points on the screen (the picture's middle and the reticle's), and how far round it the
  // picture has to reach to fill the eyepiece; which way the gun's canted on the screen
  toPx(_st.copy(c.position).addScaledVector(S.dir, 100), W, H, _ax);
  const ri = r + Math.hypot(_ax.x - cx, _ax.y - cy) + 2;
  toPx(_su.copy(S.eye).addScaledVector(S.ux, -0.01), W, H, _svR); toPx(S.eye, W, H, _svR2); const ang = Math.atan2(_svR.y - _svR2.y, _svR.x - _svR2.x);
  if (!dark) {
    const half = Math.atan(ri / f); scopeCam.fov = 2 * Math.atan(Math.tan(half) / S.mag) * 180 / Math.PI; scopeCam.updateProjectionMatrix();
    scopeCam.position.copy(S.obj); scopeCam.up.set(0, 1, 0).applyQuaternion(c.quaternion); scopeCam.lookAt(_st.copy(S.obj).add(S.dir)); scopeCam.updateMatrixWorld(true);
    const size = Math.min(SCOPE_DIM.max, Math.max(128, Math.round(ri * 2 / 64) * 64));
    if (!SC.rt || SC.size !== size) { if (SC.rt) SC.rt.dispose(); SC.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: Math.min(4, R.capabilities.maxSamples || 4) }); SC.size = size; }
    // (you're left out of it: the gun's own front sight, or your arm, a hand's breadth from its front lens; the lens too)
    const pv = PM.g.visible, sh = R.shadowMap.autoUpdate; PM.g.visible = false;
    // (the particles thinned toward the middle of the scope's own view too, then back as they were for the main view)
    const am = [SPRITE_AIM.x, SPRITE_AIM.y, SPRITE_AIM.z, SPRITE_AIM.w], ar = [SPRITE_RES.x, SPRITE_RES.y];
    SPRITE_AIM.set(0.5, 0.5, 0.3, am[3]); SPRITE_RES.set(size, size);
    R.shadowMap.autoUpdate = false; R.autoClear = true; R.setRenderTarget(SC.rt); R.render(scene, scopeCam); R.autoClear = false; R.shadowMap.autoUpdate = sh; PM.g.visible = pv;
    SPRITE_AIM.set(...am); SPRITE_RES.set(...ar);
  }
  // the lens down it, showing it
  if (!LENS.live) LENS.live = lensMat(true);
  const U = LENS.live.uniforms;
  U.uLR.value = lens.userData.lens; U.tS.value = SC.rt ? SC.rt.texture : null; U.uR.value = r; U.uKind.value = S.kind === 'acog' ? 1 : 0; U.uOff.value.copy(S.off); U.uDark.value = dark || !SC.rt ? 1 : 0;
  U.uAx.value.copy(_ax); U.uRI.value = ri; U.uRot.value.set(Math.cos(ang), Math.sin(ang)); U.uRes.value.set(W, H);
  lens.material = LENS.live; LENS.on = lens;
  return true;
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
  const c = FP_CAM;
  R.setRenderTarget(null);
  // the gun soft: with iron sights all but the front sight, your eye on it; past a dot or a hologram, your eye on the target
  const iron = S.kind !== 'holo' && S.kind !== 'dot', fs = c.position.distanceTo(S.obj);
  // (your eye focused on the front sight: an aperture, right in front of it, a soft ring round the sharp front post)
  dof(S.a, W, H, -1e5, -1e5, 1, 0, iron ? fs * SCOPE_DOF.iron0 : SCOPE_DOF.f0, iron ? fs * SCOPE_DOF.iron1 : SCOPE_DOF.f1, iron ? fs : 0, f);
  // (a dot's or a hologram's reticle is in the sight itself, seen through its window: reticleOn)
}
