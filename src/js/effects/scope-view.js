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
import { OL_HOLE } from './screen-outlines.js';
import { FP_CAM, OVER_LAYER, R, scene, sun } from '../core/renderer.js';
import { curDark } from '../lighting/day-night.js';
import { los } from '../lighting/lightmap.js';
import { STATIC_LIGHTS } from '../lighting/static-lights.js';
import { worldT } from '../game/state.js';
import { inHouseRect } from '../world/house.js';
import { BURN_BARREL } from '../world/props.js';
import { mistOver, POST, PS_RT } from './post.js';
import { PM } from '../player/player.js';
import { SPRITE_AIM, SPRITE_RES } from './sprite-batch.js';
import { SCOPE_V } from '../game/view-cam.js';
import { clamp } from '../core/math.js';
import { curId, S, W } from '../game/run-state.js';
import { spreadOf } from '../weapons/firing.js';

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
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.08, 200); scopeCam.layers.enable(OVER_LAYER);
const overlay = (frag, uniforms, blending) => new THREE.ShaderMaterial({ uniforms, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, blending: blending ?? THREE.NormalBlending });
// the eyepiece's lens itself, a real disc of glass in the scope (lensOn), drawn with the farm: from any angle it's the
// shape it is and anything in front of it hides it. Off your eye's line it's dark coated glass; the scope up to your
// eye (the gun in your hands, SCOPE_V), the picture down the scope's axis is seen through it
// the lights that glint on a scope's glass: the GLINT.n nearest lamps and fires within GLINT.r metres (the fixed
// lights, lighting/static-lights.js, at their bulb's or flame's height), as bright as they're burning (as the lightmap
// has them: brighter at night, the fire flickering), each fading in and out as a wall comes between it and you; the
// sun or moon's is cut down under the roof (GLINT.roof); whether a wall's in the way is looked at every GLINT.losEvery
// frames
const GLINT = { n: 6, r: 30, k: 1.6, roof: 0.12, ease: 10, losEvery: 4 };
// how forgiving the scope is of your eye off its axis: the tube's shadow moves shift of the eye's offset across the
// eyepiece, starting in from its middle and black past out (shares of its radius), the faint fringe along its edge
const EYE_RELIEF = { shift: 0.34, in: 0.8, out: 1.2, fringe: 1 };
// the glass down a scope: pincushion toward the rim, the colour fringes there, how soft its edge goes, the light it lets
// through and the veiling glare lifting the blacks, the fall-off to its rim
const LENS_LOOK = { pin: 0.05, ca: 0.012, soft: 0.0035, trans: 0.95, veil: 0.012, rim: 0.34 };
// As in Counter-Strike, every sight's reticle goes a little soft while the shot isn't where it's laid (uBlur, 0 to 1):
// by how far the spread's opened past the gun's own aimed spread (walking, a held trigger, a blow just taken; standing
// still on the first shots, it's sharp), coming on quickly as it opens and clearing as it settles (up, down: how
// quickly). Its edges soften (px: over that many times as many pixels; lens: and that much of a scope's radius more), never
// its size, and it fades a little
// (fade); a dot's or a hologram's bloom grows round it (halo)
const RET_BLUR = { up: 14, down: 4, px: 2.5, lens: 0.0035, fade: 0.22, halo: 0.35 };
const LENS_FRAG = `
#define GLINT_N ${GLINT.n}
uniform sampler2D tS; uniform samplerCube tEnv; uniform vec2 uOff, uAx, uRot, uRes; uniform float uR, uRI, uKind, uDark, uEnvOn;
uniform vec3 uSunD, uSunC, uGP[GLINT_N], uGC[GLINT_N]; uniform float uBlur;
varying vec2 vP; varying vec4 vClip; varying vec3 vW, vN, vT, vB;
// what the glass reflects: the world round it (tEnv, ENV) off its curved face, more of it the more glancing the look
// (Fresnel, over the coating's own little), a lamp or a bright sky brighter in it still (the cube keeps light past
// white); and the glare, from the lights themselves: the sun or the moon, and each lamp and fire near you (uGP, uGC:
// where it is and how bright, GLINT), a hard glint on the glass where its light comes off the curve to your eye, small
// and sharp for one far off, with a soft bloom of it in the coating round it
vec3 mirror(vec2 p) {
  vec3 v = normalize(cameraPosition - vW), n = normalize(vN); if (dot(n, v) < 0.0) n = -n;
  n = normalize(n + (p.x * normalize(vT) + p.y * normalize(vB)) * 0.32);   // (the glass bulges out toward you: each point's normal leaning out from the middle, a convex mirror, the world the right way up in it; leaning in it was a concave one, which turns the world over)
  vec3 r = reflect(-v, n); float f = 0.035 + 0.965 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 env = uEnvOn > 0.5 ? textureCube(tEnv, r).rgb : vec3(0.0);
  vec3 g = uSunC * (pow(max(dot(r, uSunD), 0.0), 900.0) * 6.0 + pow(max(dot(r, uSunD), 0.0), 40.0) * 0.12);
  for (int i = 0; i < GLINT_N; i++) {
    vec3 l = uGP[i] - vW; float dl = length(l), c = max(dot(r, l / max(dl, 1e-3)), 0.0), sh = 300.0 + 90.0 * dl * dl;   // (the further, the smaller the glint)
    g += uGC[i] * (pow(c, sh) * 5.0 + pow(c, 24.0) * 0.16) / (1.0 + 0.04 * dl * dl);
  }
  return env * (0.16 + 0.84 * f) + max(env - 0.75, 0.0) * (0.5 + 0.5 * f) + g * (0.25 + 0.75 * f);
}
// a line's coverage, half width w, at distance d (in the lens's units: its radius is 1), smoothed over a pixel
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// the eyepiece's glass itself with your eye off its axis (at the hip, or coming up): dark coated glass with a little
// sheen of the coating's colour and its rim catching a touch more; every highlight on it is a real light's (mirror)
vec3 glass(vec2 p, float d) {
  vec3 c = mix(vec3(0.012, 0.016, 0.02), vec3(0.045, 0.052, 0.06), smoothstep(-0.9, 0.9, p.y) * 0.75);
  c += vec3(0.04, 0.028, 0.055) * (1.0 - smoothstep(0.0, 0.8, length(p - vec2(0.25, -0.3))));   // the coating's sheen
  return c + vec3(0.06) * smoothstep(0.86, 0.99, d);                                                // and the rim
}
void main() {
  vec2 p = vP; float d = length(p), px = 1.0 / max(uR, 1.0);
  vec2 fc = (vClip.xy / vClip.w * 0.5 + 0.5) * uRes;   // (where on the screen, in the same pixels as the axis)
  vec3 col = glass(p, d), mr = mirror(p);
  col = col * 0.55 + mr;   // (the reflection's what lights the glass up: the old painted highlight kept faint under it)
  if (uDark < 0.5) {
    // the picture: the world as it lies along the scope's axis (uAx, where that points on the screen), magnified, seen
    // through the eyepiece wherever that is: an eye off the axis sees the picture and the reticle together slide
    // against the eyepiece's ring (parallax); colour fringes toward the rim
    // (a touch of pincushion toward the rim, the colour fringes growing out there, and the edge a little soft, as real
    // glass is: LENS_LOOK)
    vec2 a = (fc - uAx) / uRI; a *= 1.0 + ${LENS_LOOK.pin.toFixed(3)} * d * d; vec2 uv = a * 0.5 + 0.5;
    float ca = ${LENS_LOOK.ca.toFixed(4)} * d * d, sf = ${LENS_LOOK.soft.toFixed(4)} * d * d * d; vec3 gl = col;
    col = vec3(texture2D(tS, (uv - 0.5) * (1.0 + ca) + 0.5).r, texture2D(tS, uv).g, texture2D(tS, (uv - 0.5) * (1.0 - ca) + 0.5).b);
    if (sf > 0.0005) col = col * 0.4 + 0.15 * (texture2D(tS, uv + vec2(sf, 0.0)).rgb + texture2D(tS, uv - vec2(sf, 0.0)).rgb + texture2D(tS, uv + vec2(0.0, sf)).rgb + texture2D(tS, uv - vec2(0.0, sf)).rgb);
    // what the glass takes: a little light (transmission), a little contrast (the veiling glare off the tube's inside,
    // lifting the blacks), the coatings' faint cast
    col = col * ${LENS_LOOK.trans.toFixed(3)} + ${LENS_LOOK.veil.toFixed(3)} * vec3(0.9, 0.95, 1.0);
    col *= vec3(0.98, 1.0, 1.02);
    // the reticle, in the scope: on its axis with the picture, turned as the gun's canted
    vec2 r0 = (fc - uAx) / uR, q = vec2(uRot.x * r0.x + uRot.y * r0.y, -uRot.y * r0.x + uRot.x * r0.y);
    // (gone a little soft while the shot isn't where it's laid: uBlur, RET_BLUR)
    px = px * (1.0 + ${RET_BLUR.px.toFixed(1)} * uBlur) + ${RET_BLUR.lens.toFixed(4)} * uBlur; float rk = 1.0 - ${RET_BLUR.fade.toFixed(2)} * uBlur;
    if (uKind < 0.5) {
      // a duplex: fine cross hairs in the middle, thick posts out to the rim
      float t = max(ln(abs(q.x), 0.0035, px) * step(abs(q.y), 0.34), ln(abs(q.y), 0.0035, px) * step(abs(q.x), 0.34));
      float k = max(ln(abs(q.x), 0.016, px) * step(0.34, abs(q.y)), ln(abs(q.y), 0.016, px) * step(0.34, abs(q.x)));
      col = mix(col, vec3(0.02), max(t, k) * rk);
    } else {
      // the ACOG: a lit red chevron, its tip the aim, and the drop line under it with its marks
      float cv = min(seg(q, vec2(-0.075, -0.07), vec2(0.0, 0.0)), seg(q, vec2(0.075, -0.07), vec2(0.0, 0.0)));
      float bdc = ln(abs(q.x), 0.003, px) * step(q.y, -0.11) * step(-0.62, q.y);
      for (int i = 1; i <= 5; i++) { float y = -0.11 - float(i) * 0.1, w = 0.07 - float(i) * 0.01; bdc = max(bdc, ln(abs(q.y - y), 0.003, px) * step(abs(q.x), w)); }
      col = mix(col, vec3(0.02), bdc * rk);
      col = mix(col, vec3(1.0, 0.16, 0.08) * 1.5, ln(cv, 0.008, px) * rk);
      col += vec3(1.0, 0.2, 0.1) * 0.35 * exp(-cv * cv / 0.0012);   // its glow
    }
    // the tube's shadow, closing in from where your eye's off its axis, and the glass darkening to its rim; where the
    // picture's shut off, the glass itself is what you see
    // (the glass falls off gently toward its rim, cos^4 like a real lens, not a hard ring)
    col *= 1.0 - ${LENS_LOOK.rim.toFixed(3)} * d * d * d * d;
    // (the edge of the tube's shadow a broad soft fall, a faint blue and amber fringe along it as the exit pupil's edge
    // has: EYE_RELIEF)
    float sd = length(p + uOff * ${EYE_RELIEF.shift.toFixed(3)}), sk = 1.0 - smoothstep(${EYE_RELIEF.in.toFixed(3)}, ${EYE_RELIEF.out.toFixed(3)}, sd);
    col += vec3(-0.01, 0.006, 0.03) * sk * (1.0 - sk) * 4.0 * ${EYE_RELIEF.fringe.toFixed(3)};
    col = mix(gl, col + mr * 0.12, sk);   // (your eye right up to it, faintly still)
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const LENS_VERT = 'uniform float uLR; varying vec2 vP; varying vec4 vClip; varying vec3 vW, vN, vT, vB; void main() { vP = position.xy / uLR; vW = (modelMatrix * vec4(position, 1.0)).xyz; mat3 m = mat3(modelMatrix); vN = m * vec3(0.0, 0.0, 1.0); vT = m * vec3(1.0, 0.0, 0.0); vB = m * vec3(0.0, 1.0, 0.0); vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vClip; }';
// the world round the gun for every eyepiece to reflect (mirror): a little cube map from your eye, one face of it
// drawn again each frame while a scope's in your hands in first person (so it's never more than six frames old), with
// you left out of it; and the sun's (or moon's) way and light for its glint
const ENV_SIZE = 64, ENV = { rt: new THREE.WebGLCubeRenderTarget(ENV_SIZE, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cam: null, face: 0, on: false };
const ENV_U = { tEnv: { value: ENV.rt.texture }, uEnvOn: { value: 0 }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color() },
  uGP: { value: Array.from({ length: GLINT.n }, () => new THREE.Vector3()) }, uGC: { value: Array.from({ length: GLINT.n }, () => new THREE.Color(0, 0, 0)) } };
const lensMat = live => new THREE.ShaderMaterial({ vertexShader: LENS_VERT, fragmentShader: LENS_FRAG, side: THREE.DoubleSide,
  uniforms: { ...ENV_U, uBlur: RET_U.uBlur, tS: { value: null }, uLR: { value: 1 }, uR: { value: 100 }, uKind: { value: 0 }, uDark: { value: 1 }, uOff: { value: new THREE.Vector2() }, uAx: { value: new THREE.Vector2() }, uRot: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) }, uRI: { value: 100 } } });
// A holographic sight's reticle and a red dot's dot as they really are: an image focused out at infinity, seen only
// through the sight's window and only looking along it. Each sight has a pane just inside its window (reticleOn) whose
// shader works out, for each point of the pane, which way your eye looks through it; the reticle's there (out along the
// sight's own axis, the way it points) when that way lines up with the ring, the ticks or the dot, so from anywhere off
// the sight's line it's not in the window at all, it moves with the gun as one, and anything in front of the window
// (your hand, your body) hides it. Sizes in MOA, as the real ones are: the EOTech's 68 MOA ring with its ticks and 1
// MOA dot ('holo'); a red dot's dot, its size the sight's own (moa: an RMR's 3.25, a 507C's 2...: 'dot'); a pistol
// sight's circle-dot, a 32 MOA ring round a 2 MOA dot ('cdot'). Never thinner than a pixel and a bit (RET_MIN), the
// hologram's light grainy as a hologram's is. The light's drawn over what's behind it, not added to it, so the dot's
// red whatever it's against (a bright sky would wash an added red out to pink and white), with a faint bloom round it
const RET_MIN = 1.3, RET_U = { uT: { value: 0 }, uBlur: { value: 0 } }, RET_KIND = { holo: 0, dot: 1, cdot: 2 };
const RET_VERT = 'varying vec3 vV, vAx, vUp; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; vAx = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz); vUp = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); gl_Position = projectionMatrix * mv; }';
const RET_FRAG = `
uniform float uKind, uMoa, uT, uGlow, uBlur; varying vec3 vV, vAx, vUp;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ln(float d, float w, float px) { return 1.0 - smoothstep(w - px, w + px, d); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec3 v = normalize(vV); float c = dot(v, vAx); if (c < 0.9) discard;
  vec3 rt = normalize(cross(vAx, vUp)), up = cross(rt, vAx);
  vec2 m = vec2(dot(v, rt), dot(v, up)) / c / 0.000290888;   // (how far off the sight's line this look is, in MOA)
  float px = max(length(fwidth(m)), 0.0001), pb = px * (1.0 + ${RET_BLUR.px.toFixed(1)} * uBlur), e = length(m), core, halo;   // (pb: its edges' softness)
  if (uKind < 0.5) {
    float w = max(1.1, px * ${RET_MIN.toFixed(2)});
    core = ln(abs(e - 34.0), w, pb);
    core = max(core, ln(min(min(seg(m, vec2(32.0, 0.0), vec2(45.0, 0.0)), seg(m, vec2(-32.0, 0.0), vec2(-45.0, 0.0))), min(seg(m, vec2(0.0, 32.0), vec2(0.0, 45.0)), seg(m, vec2(0.0, -32.0), vec2(0.0, -45.0)))), w, pb));
    core = max(core, ln(e, max(0.6, px * ${RET_MIN.toFixed(2)}), pb));
    core *= 0.6 + 0.5 * hash(floor(gl_FragCoord.xy / 1.3) + floor(uT * 9.0));
    halo = 0.14 * exp(-pow(abs(e - 34.0) / (w * 3.0), 2.0)) + 0.4 * exp(-e * e / (w * w * 3.0));
  } else {
    // (with the ring round it, the dot and the ring kept fine so the dark gap between them still shows when the whole
    // circle's only a dozen pixels across)
    float cd = step(1.5, uKind), r = max(uMoa * 0.5, px * mix(${RET_MIN.toFixed(2)}, 0.9, cd) * (0.6 + 0.4 * uGlow));
    core = ln(e, r, pb); halo = uGlow * (mix(0.4, 0.22, cd) * exp(-e * e / (r * r * mix(5.0, 2.5, cd) * uGlow)) + mix(0.08, 0.0, cd) * exp(-e / (r * 4.0 * uGlow)));
    if (cd > 0.5) { float w = max(0.5, px * 0.75); core = max(core, ln(abs(e - 16.0), w, pb)); halo += 0.06 * exp(-pow(abs(e - 16.0) / (w * 2.0), 2.0)); }
  }
  core *= 1.0 - ${RET_BLUR.fade.toFixed(2)} * uBlur; halo *= 1.0 + ${RET_BLUR.halo.toFixed(2)} * uBlur;
  float a = clamp(core + halo, 0.0, 1.0); if (a < 0.004) discard;
  gl_FragColor = vec4(1.0, 0.07 + 0.06 * (1.0 - clamp(core, 0.0, 1.0)), 0.04, a);   // (deep red at its heart, a touch warmer in its bloom)
}`;
const retMat = (kind, moa, glow) => new THREE.ShaderMaterial({ vertexShader: RET_VERT, fragmentShader: RET_FRAG, uniforms: { uKind: { value: RET_KIND[kind] ?? 1 }, uMoa: { value: moa }, uGlow: { value: glow }, uT: RET_U.uT, uBlur: RET_U.uBlur }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const RET_MATS = {};
// a sight's reticle pane (weapons/attachments.js): w by h (a window with corners) or, with no h, a disc w across (a
// round one), at (x, y, z) on p, square to the sight's axis; moa: a dot's size; glow: how much bloom round a dot (and,
// under 1, how much the smallest it's drawn shrinks with it): a pistol's dot, close to the eye in a small window, is kept
// tight (weapons/attachments.js)
export function reticleOn(p, kind, x, y, z, w, h, moa = 2, glow = 1) {
  const geo = h ? new THREE.PlaneGeometry(w, h) : new THREE.CircleGeometry(w, 32), k = kind + ':' + moa + ':' + glow;
  const m = new THREE.Mesh(geo, RET_MATS[k] || (RET_MATS[k] = retMat(kind, moa, glow))); m.position.set(x, y, z); m.renderOrder = 6;
  m.userData.reticlePane = true; m.castShadow = m.receiveShadow = false; m.layers.set(OVER_LAYER); p.add(m); return m;   // (over a fog round's fog: effects/post.js)
}
function stepReticles(dt) {
  RET_U.uT.value = performance.now() / 1000;
  const id = curId(), D = W(id); let want = 0;
  if (D && !D.melee && D.spread > 0) want = clamp(spreadOf(id) / (D.spread * S.spreadMul * 0.5 * (D.aimK || 1)), 0, 1);
  const U = RET_U.uBlur; U.value += (want - U.value) * Math.min(1, dt * (want > U.value ? RET_BLUR.up : RET_BLUR.down));
}
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
export function scopePrep(rdt) {
  stepReticles(Math.min(0.1, rdt || 0));
  const S = SCOPE_V, on = S.on && S.a >= 0.01 && (S.kind === 'scope' || S.kind === 'acog') && S.src;
  let lens = null; if (on) { lens = S.src.userData.lensMesh; if (lens === undefined) { lens = null; S.src.traverse(o => { if (!lens && o.userData.lens) lens = o; }); S.src.userData.lensMesh = lens; } }   // (found once per sight)
  if (LENS.on && LENS.on !== lens) { LENS.on.material = glassMat(LENS.on.userData.lens); LENS.on = null; }
  SC.on = false; OL_HOLE.r = 0; if (!lens) return;
  envStep(S);
  R.getDrawingBufferSize(_sz); const prev = R.getRenderTarget(), ac = R.autoClear;
  if (scopeLens(S, lens, _sz.x, _sz.y, _sz.y / 2 / Math.tan(FP_CAM.fov * Math.PI / 360))) { SC.on = true; Object.assign(OL_HOLE, { x: SC.cx, y: SC.cy, r: SC.r }); }
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

// the reflected world kept up from your eye (a whole cube the first time), and the glare's lights: only while the
// eyepiece is turned toward you (nothing's seen in it otherwise), one face of the cube drawn again every ENV_EVERY.hip
// frames, ENV_EVERY.ads down the scope (where the picture fills the glass and only its rim reflects), drawn out to
// ENV_FAR metres (the fog's hidden the rest) with the shadows left as they are
const ENV_EVERY = { hip: 2, ads: 5 }, ENV_FAR = 55;
let envN = 0;
function envStep(S) {
  if (_st.subVectors(FP_CAM.position, S.eye).dot(S.dir) > -0.005) return;
  envN++; glints(envN % GLINT.losEvery === 0);
  if (ENV.on && envN % (S.w > 0.5 ? ENV_EVERY.ads : ENV_EVERY.hip)) return;
  if (!ENV.cam) { ENV.cam = new THREE.CubeCamera(0.1, ENV_FAR, ENV.rt); scene.add(ENV.cam); }
  ENV.cam.position.copy(FP_CAM.position); ENV.cam.updateMatrixWorld(true);
  const pv = PM.g.visible, sh = R.shadowMap.autoUpdate, ac = R.autoClear, prev = R.getRenderTarget(), am = [SPRITE_AIM.x, SPRITE_AIM.y, SPRITE_AIM.z, SPRITE_AIM.w];
  PM.g.visible = false; R.shadowMap.autoUpdate = false; R.autoClear = true; SPRITE_AIM.set(0.5, 0.5, 0, 0);   // (no particles thinned out of it)
  ENV_U.tEnv.value = null;   // (and no other scope's glass, on the gun rack, reading the cube as it's drawn)
  if (!ENV.on) { ENV.cam.update(R, scene); ENV.on = true; }
  else { const f = ENV.face = (ENV.face + 1) % 6; R.setRenderTarget(ENV.rt, f); R.render(scene, ENV.cam.children[f]); }
  PM.g.visible = pv; R.shadowMap.autoUpdate = sh; R.autoClear = ac; R.setRenderTarget(prev); SPRITE_AIM.set(...am); ENV_U.tEnv.value = ENV.rt.texture;
  ENV_U.uEnvOn.value = 1;
}
// where each lamp's and fire's light is for the glass to glint with (GLINT)
const glintAt = L => L.barrel ? _glP.set(BURN_BARREL.x, BURN_BARREL.y + 0.28, BURN_BARREL.z) : L.hang ? _glP.set(L.x, 1.97, L.z) : L.glint ? _glP.set(...L.glint) : _glP.set(L.x, 1.1, L.z);
const _glP = new THREE.Vector3(), _glints = [];
let glintT = -1;
function glints(see) {
  ENV_U.uSunD.value.copy(sun.position).normalize();
  ENV_U.uSunC.value.copy(sun.color).multiplyScalar(Math.min(2, sun.intensity) * (sun.position.y > 0 ? 1 : 0) * (inHouseRect(FP_CAM.position.x, FP_CAM.position.z, 0) ? GLINT.roof : 1));
  const c = FP_CAM.position, dark = curDark, fl = 0.85 + Math.sin(worldT * 11.1) * 0.08 + 0.035 + Math.sin(worldT * 37.3) * 0.02 + Math.sin(worldT * 23.9) * 0.015;
  const dt = glintT < 0 ? 1 : Math.min(0.1, Math.max(0, performance.now() / 1000 - glintT)); glintT = performance.now() / 1000;
  _glints.length = 0;
  for (const L of STATIC_LIGHTS) {
    if (L.fill || L.spill) continue;
    glintAt(L); const d = _glP.distanceTo(c); if (d > GLINT.r) continue;
    // (seen or not from where you are, eased: a glint fades out behind a wall rather than blinking off)
    if (see || L.gs === undefined) L.gs = los(c.x, c.z, _glP.x, _glP.z) ? 1 : 0;   // (looked for every GLINT.losEvery frames)
    L.gv = (L.gv ?? 1) + (L.gs - (L.gv ?? 1)) * Math.min(1, dt * GLINT.ease);
    const k = L.int * (L.inside ? 0.55 + 0.6 * dark : 0.15 + 0.85 * dark) * (L.flicker ? fl : 1) * L.gv * GLINT.k;
    if (k > 0.01) _glints.push([d, _glP.x, _glP.y, _glP.z, L.col, k]);
  }
  _glints.sort((a, b) => a[0] - b[0]);
  const P = ENV_U.uGP.value, C = ENV_U.uGC.value;
  for (let i = 0; i < GLINT.n; i++) { const g = _glints[i]; if (g) { P[i].set(g[1], g[2], g[3]); C[i].setRGB(g[4][0] * g[5], g[4][1] * g[5], g[4][2] * g[5]); } else C[i].setRGB(0, 0, 0); }
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
  const dark = S.off.length() * EYE_RELIEF.shift > EYE_RELIEF.out + 1;
  // where the scope's axis points on the screen (the picture's middle and the reticle's), and how far round it the
  // picture has to reach to fill the eyepiece; which way the gun's canted on the screen
  toPx(_st.copy(c.position).addScaledVector(S.dir, 100), W, H, _ax);
  const ri = r + Math.hypot(_ax.x - cx, _ax.y - cy) + 2;
  toPx(_su.copy(S.eye).addScaledVector(S.ux, -0.01), W, H, _svR); toPx(S.eye, W, H, _svR2); const ang = Math.atan2(_svR.y - _svR2.y, _svR.x - _svR2.x);
  if (!dark) {
    const half = Math.atan(ri / f); scopeCam.fov = 2 * Math.atan(Math.tan(half) / S.mag) * 180 / Math.PI; scopeCam.updateProjectionMatrix();
    scopeCam.position.copy(S.obj); scopeCam.up.set(0, 1, 0).applyQuaternion(c.quaternion); scopeCam.lookAt(_st.copy(S.obj).add(S.dir)); scopeCam.updateMatrixWorld(true);
    const size = Math.min(SCOPE_DIM.max, Math.max(128, Math.round(ri * 2 / 64) * 64));
    if (!SC.rt || SC.size !== size) { if (SC.rt) SC.rt.dispose(); SC.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: true, samples: Math.min(4, R.capabilities.maxSamples || 4) }); SC.size = size;
      SC.rt.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedInt248Type, undefined, undefined, undefined, undefined, undefined, undefined, THREE.DepthStencilFormat); SC.rt.depthTexture.minFilter = SC.rt.depthTexture.magFilter = THREE.NearestFilter; }   // (its depth: a fog round's fog over it, mistOver)   // (stencil: the see-through rims round drops and teammates mark their own models in it to stay off them, effects/outlines.js: xray; without it, every rim was drawn whole down the scope, a hollow box round each drop)
    // (you're left out of it: the gun's own front sight, or your arm, a hand's breadth from its front lens; the lens too)
    const pv = PM.g.visible, sh = R.shadowMap.autoUpdate; PM.g.visible = false;
    // (the particles thinned toward the middle of the scope's own view too, then back as they were for the main view)
    const am = [SPRITE_AIM.x, SPRITE_AIM.y, SPRITE_AIM.z, SPRITE_AIM.w], ar = [SPRITE_RES.x, SPRITE_RES.y];
    SPRITE_AIM.set(0.5, 0.5, 0.3, am[3]); SPRITE_RES.set(size, size);
    R.shadowMap.autoUpdate = false; R.autoClear = true; R.setRenderTarget(SC.rt); R.render(scene, scopeCam); R.autoClear = false; R.shadowMap.autoUpdate = sh; PM.g.visible = pv;
    mistOver(SC.rt, scopeCam);   // (a fog round's fog down it as well: effects/post.js)
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
