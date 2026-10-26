// Fog rounds: now and then a wave comes in under a thick ground fog. It rolls in off the fields from the edges of the
// map as the wave starts and rolls back out once it's cleared. It never comes into the house or over it: it thins away
// to nothing at its walls (MIST.wall), following the house's own shape (an L-shaped one's notch too). Out in the open
// it parts round you (or the teammate you're watching) in a ring that thins gradually toward you, its edge torn about
// rather than a clean circle, and a flashlight cuts a clear path through it along its beam (MIST.path: a
// better light a much wider one). The further out you zoom, the more of the screen it takes.
//
// It's marched at half the resolution and laid over the finished frame (effects/post.js), from where each pixel is on the ground, so
// it's the same fog in the frame as in play: a zombie out in it can't be seen, outlined or picked out by your
// crosshair, and one in the thinning ring comes clear as it closes in (mistSee, zombies/zombie-visuals.js).

import { cam, sun, viewRect } from '../core/renderer.js';
import { clamp, HALF, N, rand, smooth } from '../core/math.js';
import { LMU } from '../core/shaders.js';
import { HOUSE } from './house.js';
import { phase } from '../game/state.js';
import { amb, curDark } from '../lighting/day-night.js';
import { cheatIs } from '../ui/cheats.js';
import { camFocus } from '../net/spectate.js';

// a wave's odds of fog (from wave MIST.from, and never two in a row), how many metres round you stay clear and how far
// it takes to thicken to full past that, how long it takes to roll in and back out (s), the most it hides (1: all, so
// nothing out in it shows, a tree's top or a car's roof no more than a zombie), its own slow drift (drift: which way
// and how fast, metres a second; the wind doesn't push it about), and how much the lamps and torches out in it light it up (glow) and a flashlight's beam
// shows in it (beam)
// path: the clear path a flashlight's beam cuts through it by the light's tier, [its half-width against the beam's own,
// how much of the beam's reach it runs]; wall: how far out from the house's walls it takes to thicken from nothing
export const MIST = { chance: 0.22, from: 3, clear: 2.4, ramp: 3.2, rollIn: 8, rollOut: 4, max: 1, drift: [0.12, 0.07], glow: 0.7, beam: 0.55,
  path: { 1: [0.6, 0.8], 2: [1.55, 1] }, wall: 1.8,
  on: false, last: 0, k: 0, t: 0 };
// the host's roll for the wave about to start (co-op: sent with it, net/sync.js)
export function mistRoll(n) { if (cheatIs('fog')) { MIST.last = n; return true; }   // (the cheat menu's Fog every wave: ui/cheats.js)
  const on = n >= MIST.from && MIST.last !== n - 1 && rand() < MIST.chance; if (on) MIST.last = n; return on; }
// a wave beginning with it or without, and its going at the end of the wave or the run
export function mistSet(on) { MIST.on = !!on; }
export function mistReset() { MIST.on = false; MIST.k = 0; MIST.last = 0; }
// every frame: rolling in through the wave, out once it's over (an ease on the way in and out of each)
export function mistTick(rdt) {
  const want = MIST.on && phase === 'wave' ? 1 : 0;
  MIST.t += rdt;
  MIST.k = clamp(MIST.k + (want > MIST.k ? rdt / MIST.rollIn : -rdt / MIST.rollOut), 0, 1);
}
// how far (x, z) is outside the house's walls (less than nothing: inside), the notch of an L-shaped one cut out
function houseSd(x, z) {
  const box = (a, b, c, d) => { const qx = Math.abs(x - (a + c) / 2) - (c - a) / 2, qz = Math.abs(z - (b + d) / 2) - (d - b) / 2; return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0); };
  const d = box(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1), c = HOUSE.cut; return c ? Math.max(d, -box(c[0], c[1], c[2], c[3])) : d;
}
const mistEase = () => smooth(MIST.k);
// how thick it is at (x, z), without the wind's tatters: how far you are past the clear ring, how far out of the house,
// and whether it's reached there yet rolling in from the edges (the same as the shader's, below, near enough)
function mistAt(x, z) {
  const k = mistEase(); if (k <= 0) return 0;
  const F = camFocus(), d = Math.hypot(x - F.x, z - F.z), ring = smooth(clamp((d - MIST.clear) / MIST.ramp, 0, 1));
  const house = smooth(clamp(houseSd(x, z) / MIST.wall, 0, 1));
  const front = HALF + 6 - (HALF + 10) * k, rim = Math.max(Math.abs(x), Math.abs(z)), roll = smooth(clamp((rim - front + 4) / 8, 0, 1));
  return ring * house * roll * (1 - flashClear(x, z));
}
// how clear a flashlight's path keeps (x, z) (0 to 1), as the shader's flashlight paths below
function flashClear(x, z) {
  const U = MIST_U, n = U.uFlK.value.w; let c = 0;
  for (let i = 0; i < n; i++) {
    const L = U.uFl.value[i], Pp = U.uFlP.value[i], pa = MIST.path[U.uFlT.value[i]]; if (!pa) continue;
    const dx = x - L.x, dz = z - L.y, l = Math.hypot(dx, dz), reach = Pp.x * pa[1]; if (l > reach || l < 0.01) continue;
    const ang = Math.acos(clamp((dx * L.z + dz * L.w) / l, -1, 1)), w = Pp.y * pa[0];
    c = Math.max(c, (1 - smooth(clamp((ang - w * 0.45) / (w * 0.55), 0, 1))) * (1 - smooth(clamp((l - reach * 0.55) / (reach * 0.45), 0, 1))) * clamp(Pp.z * 1.4, 0, 1));
  }
  return c * 0.94;
}
// how much of a zombie there shows: all of it in the clear, coming out of it through the thinning ring, none in it
export const mistSee = (x, z) => 1 - smooth(clamp((mistAt(x, z) - 0.3) / 0.4, 0, 1));
// the shader's part (spliced into the composite: effects/post.js), and its uniforms filled in each frame
export const MIST_U = { uMist: { value: new THREE.Vector4() }, uMistS: { value: new THREE.Vector4() }, tMistN: { value: null }, uMistP: { value: new THREE.Vector2() }, uMistH: { value: new THREE.Vector4() }, uMistW: { value: new THREE.Vector2() }, uMistC: { value: new THREE.Color() }, uMistInv: { value: new THREE.Matrix4() }, uMistSz: { value: new THREE.Vector4() },
  uMistL: { value: new THREE.Vector4() }, uMistA: { value: new THREE.Color() }, uMistCut: { value: new THREE.Vector4() },
  uFlT: { value: [0, 0, 0, 0, 0, 0] }, uMistPath: { value: new THREE.Vector4() },   // (each light's tier, flashUniforms; the path by tier, MIST.path)
  // (the light map and the flashlight cones: the lit shader's own, core/shaders.js and lighting/lightmap.js, handed
  // over each frame in mistUniforms, as they're made after this)
  uLightMap: { value: null }, uLmRes: { value: 1 }, uFl: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlP: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlK: { value: new THREE.Vector4() } };
// its volume (MIST_VOL): a ground fog with height, densest low down and thinning up to a billowing top (top: the most
// it reaches, metres; lo: the share of that it's thick right up to; dens: how thick, per metre, at its thickest), the
// clear ring round you opening a little wider the higher up (cone), marched along each view ray from where it enters
// the fog to where it meets the scene (steps, out to far metres), lit paler at its tops than in its depths, glowing
// round lamps and fires, catching the sun's light looking toward it (sun) and the flashlights' beams
const MIST_VOL = { top: 3.4, lo: 0.42, dens: 2.6, cone: 0.55, steps: 12, far: 55, sun: 0.38 };
// the fog's soft noise (built once: mistNoise), tiling, three layers of it: red its billows, green finer curls, blue a
// slow warp to fold them through each other
const MIST_N = 128;
function mistNoise() {
  const d = new Uint8Array(MIST_N * MIST_N * 4);
  const lat = (p, s) => { const g = new Float32Array(p * p); let x = s; for (let i = 0; i < g.length; i++) { x = (x * 1103515245 + 12345) % 2147483648; g[i] = x / 2147483648; } return g; };
  const layer = (oct, base, seed) => { const L = []; for (let o = 0; o < oct; o++) L.push(lat(base << o, seed + o * 77)); return (x, y) => { let v = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { const p = base << o, g = L[o], fx = x / MIST_N * p, fy = y / MIST_N * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const q = (i, j) => g[((j % p + p) % p) * p + ((i % p + p) % p)];
      v += a * (q(ix, iy) * (1 - ux) * (1 - uy) + q(ix + 1, iy) * ux * (1 - uy) + q(ix, iy + 1) * (1 - ux) * uy + q(ix + 1, iy + 1) * ux * uy); n += a; a *= 0.5; }
    return v / n; }; };
  const R = layer(4, 4, 11), G = layer(3, 8, 23), B = layer(2, 2, 41);
  for (let y = 0; y < MIST_N; y++) for (let x = 0; x < MIST_N; x++) { const i = (y * MIST_N + x) * 4; d[i] = R(x, y) * 255; d[i + 1] = G(x, y) * 255; d[i + 2] = B(x, y) * 255; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, MIST_N, MIST_N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
export const MIST_GLSL = `
uniform vec4 uMist, uMistH, uMistSz, uMistL, uMistS; uniform vec2 uMistP, uMistW; uniform vec3 uMistC, uMistA; uniform mat4 uMistInv;
uniform sampler2D uLightMap, tMistN; uniform float uLmRes; uniform vec4 uFl[6], uFlP[6], uFlK, uMistCut, uMistPath; uniform float uFlT[6];
// how far p is outside the house's walls (less than nothing: inside), an L-shaped one's notch cut out (houseSd)
float mBox(vec2 p, vec4 r) { vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5, d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float mHouse(vec2 p) { return max(mBox(p, uMistH), -mBox(p, uMistCut)); }
vec3 mNs(vec2 uv) { return texture2DLodEXT(tMistN, uv, 0.0).rgb; }
vec3 mGlow;   // (light the fog gives off over what it's drawn in: a flashlight's beam in the air)
// the flashlights at q: how much of a clear path through the fog each keeps there (x), and how much of its beam's light
// is in the air there (y)
vec2 mFlash(vec2 q, float n) {
  float fc = 0.0, bm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uFlK.w) break;
    vec2 r = q - uFl[i].xy; float l = length(r); if (l > uFlP[i].x || l < 0.05) continue;
    vec2 dir = vec2(uFl[i].z, uFl[i].w); float ang = acos(clamp(dot(r, dir) / l, -1.0, 1.0));
    vec2 pa = uFlT[i] > 1.5 ? uMistPath.zw : uMistPath.xy; float w = uFlP[i].y * pa.x, reach = uFlP[i].x * pa.y, tw = (n - 0.5) * 0.12;
    fc = max(fc, (1.0 - smoothstep(w * 0.45, w, ang + tw)) * (1.0 - smoothstep(reach * 0.55, reach, l)) * clamp(uFlP[i].z * 1.4, 0.0, 1.0));
    float cone = 1.0 - smoothstep(uFlP[i].y * 0.55, uFlP[i].y, ang);
    bm += cone * pow(max(0.0, 1.0 - l / uFlP[i].x), 1.6) * (0.55 + 0.45 * n) * uFlP[i].z;
  }
  return vec2(fc, bm);
}
// how thick it is at p (per metre), and (out) how far up its top it is there and its billow noise
float mDens(vec3 p, out float hf, out float nb, out float bm) {
  vec2 q = p.xz, dr = uMistW; hf = 0.0; nb = 0.5; bm = 0.0;
  float hd = mHouse(q); if (hd < 0.0) return 0.0;   // (never in the house, nor over it)
  vec3 w = mNs(q / 97.0 + dr / 97.0);
  vec3 N = mNs(q / 41.0 + dr / 41.0 + (w.b - 0.5) * 0.35 + p.y * 0.011);
  float n = N.r, n2 = N.g; nb = n;
  // its top, billowing up and down (higher where its billows are thick), and how far up it this point is
  float top = ${MIST_VOL.top.toFixed(2)} * (0.4 + 0.85 * n + 0.3 * (n2 - 0.5)), y = max(p.y, 0.0); hf = clamp(y / top, 0.0, 1.0);
  if (y > top) return 0.0;
  float v = 1.0 - smoothstep(${MIST_VOL.lo.toFixed(2)}, 1.0, hf);
  // the clear ring round you (wider the higher up), torn about; none near the walls; rolling in from the edges
  float dp = length(q - uMistP);
  float ring = smoothstep(uMist.y, uMist.y + uMist.z, dp - y * ${MIST_VOL.cone.toFixed(2)} + (n - 0.5) * 2.6 + (n2 - 0.5) * 0.8);
  float house = smoothstep(0.0, ${MIST.wall.toFixed(2)}, hd + (n - 0.5) * 0.5);
  float front = mix(${(HALF + 6).toFixed(1)}, -4.0, uMist.x), rim = max(abs(q.x), abs(q.y));
  float roll = smoothstep(front - 4.0, front + 4.0, rim + (n - 0.5) * 9.0);
  vec2 f = mFlash(q, n2); bm = f.y * (1.0 - smoothstep(0.6, 2.2, abs(p.y - 1.15)));   // (a beam's light near the height it's carried at)
  return ${MIST_VOL.dens.toFixed(2)} * v * ring * house * roll * (1.0 - f.x * 0.94) * (0.35 + 1.3 * n2 * n2);   // (thicker and thinner patches through it, so it's never one even wall)
}
// the fog over the pixel at uv, whose scene is d out from the eye: marched along its ray from where it enters the fog to
// where it meets the scene (or MIST_VOL.far on, and the rest taken as thick as it was there), front to back
vec4 mistOf(vec2 uv, float d) {
  mGlow = vec3(0.0);
  bool persp = uNF.z > 0.5;   // (uNF: effects/post.js)
  vec2 vp = uMistSz.zw + (uv - 0.5) * uMistSz.xy;
  vec3 ro = (uMistInv * vec4(persp ? vec3(0.0) : vec3(vp, 0.0), 1.0)).xyz, pw = (uMistInv * vec4(vp * (persp ? d : 1.0), -d, 1.0)).xyz;
  vec3 rd = pw - ro; float L = length(rd); rd /= max(L, 1e-4);
  // the stretch of the ray inside the fog's slab (under its highest top)
  float TOP = ${(MIST_VOL.top * 1.4).toFixed(2)}, t0 = 0.0, t1 = L;
  if (ro.y > TOP) { if (rd.y >= -1e-4) return vec4(0.0); t0 = (ro.y - TOP) / -rd.y; }
  else if (rd.y > 1e-4) t1 = min(t1, (TOP - ro.y) / rd.y);
  float tEnd = min(t1, t0 + ${MIST_VOL.far.toFixed(1)}); if (tEnd <= t0) return vec4(0.0);
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));   // (each pixel's steps a little offset from its neighbours': no banding)
  float T = 1.0, hf, nb, bm, lastD = 0.0, sunK = uMistS.w * pow(max(dot(rd, uMistS.xyz), 0.0), 6.0);
  vec3 col = vec3(0.0), beam = vec3(1.0, 0.94, 0.8) * uMistL.y;
  const int NS = ${MIST_VOL.steps};
  float prev = t0;
  for (int i = 0; i < NS; i++) {
    float u = (float(i) + jit) / float(NS), t = t0 + (tEnd - t0) * (persp ? u * u : u), ds = t - prev; prev = t;
    vec3 p = ro + rd * t;
    float dn = mDens(p, hf, nb, bm); lastD = dn;
    mGlow += beam * bm * ds * 0.06 * T * uMist.x;   // (a beam in the air, faint even where it's clear)
    if (dn <= 0.0) continue;
    float a = 1.0 - exp(-dn * ds);
    // lit paler toward its tops, darker in its depths; the lamps and fires round it glowing in it; the sun's light
    // caught in it looking toward the sun; the flashlights' beams lighting it up
    vec3 lm = texture2DLodEXT(uLightMap, (p.xz + ${HALF.toFixed(1)}) / ${N.toFixed(1)}, 0.0).rgb * 2.0, lamp = min(max(lm - uMistA, 0.0), vec3(0.6));
    vec3 c = uMistC * (0.52 + 0.62 * hf + 0.3 * (nb - 0.5)) * (1.0 + sunK * (0.6 + 0.4 * hf));
    c += lamp * uMistL.x * (0.6 + 0.5 * nb) * (1.0 - 0.45 * hf) + beam * bm * 0.9;
    col += T * a * c; T *= 1.0 - a;
    if (T < 0.015) break;
  }
  // (on past where the marching stopped, as thick as it was there, out to where the scene is)
  if (t1 > tEnd && lastD > 0.0 && T > 0.015) { float a = 1.0 - exp(-lastD * min(t1 - tEnd, 60.0)); col += T * a * uMistC * 0.75; T *= 1.0 - a; }
  float A = 1.0 - T; if (A < 0.002) return vec4(0.0);
  return vec4(col / A, A * uMist.w);
}`;
export function mistUniforms() {
  const U = MIST_U, k = mistEase(), F = camFocus();
  U.uMist.value.set(k, MIST.clear, MIST.ramp, k > 0 ? MIST.max : 0);
  if (!U.tMistN.value) U.tMistN.value = mistNoise();
  U.uMistS.value.set(sun.position.x, sun.position.y, sun.position.z, 0).normalize(); U.uMistS.value.w = MIST_VOL.sun * (1 - clamp(curDark, 0, 1)) * (sun.position.y > 0 ? 1 : 0);
  U.uMistP.value.set(F.x, F.z);
  U.uMistH.value.set(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1);
  U.uMistW.value.set(MIST.drift[0] * MIST.t, MIST.drift[1] * MIST.t);
  U.uMistC.value.setRGB(0.66, 0.67, 0.64).lerp(_mistNight.setRGB(0.1, 0.12, 0.14), clamp(curDark, 0, 1));   // pale by day, a dark blue grey at night
  U.uMistInv.value.copy(cam.matrixWorld);
  viewRect(cam, U.uMistSz.value);
  U.uMistL.value.set(MIST.glow, MIST.beam, MIST.t % 1000, 0); U.uMistA.value.setRGB(amb[0], amb[1], amb[2]);
  const c = HOUSE.cut; if (c) U.uMistCut.value.set(c[0], c[1], c[2], c[3]); else U.uMistCut.value.set(1e4, 1e4, 1e4 + 1, 1e4 + 1);
  U.uMistPath.value.set(MIST.path[1][0], MIST.path[1][1], MIST.path[2][0], MIST.path[2][1]);
  U.uLightMap.value = LMU.uLightMap.value; U.uLmRes.value = LMU.uLmRes.value; U.uFl.value = LMU.uFl.value; U.uFlP.value = LMU.uFlP.value; U.uFlK.value = LMU.uFlK.value;
}
const _mistNight = new THREE.Color();
