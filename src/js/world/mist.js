// Fog rounds: now and then a wave comes in under a thick ground fog. It rolls in off the fields from the edges of the
// map as the wave starts and rolls back out once it's cleared. It never comes into the house or over it, but lies right
// up against its walls, following the house's own shape (an L-shaped one's notch too). Out in the open it parts round you (or the teammate you're watching) in a ring that thins gradually toward you, its
// edge torn about by the wind rather than a clean circle, and a flashlight cuts a clear path through it along its beam
// (MIST.path: a better light a much wider one). The further out you zoom, the more of the screen it takes.
//
// It's drawn over the finished frame (effects/post.js: the composite), from where each pixel is on the ground, so
// it's the same fog in the frame as in play: a zombie out in it can't be seen, outlined or picked out by your
// crosshair, and one in the thinning ring comes clear as it closes in (mistSee, zombies/zombie-visuals.js).

// a wave's odds of fog (from wave MIST.from, and never two in a row), how many metres round you stay clear and how far
// it takes to thicken to full past that, how long it takes to roll in and back out (s), the most it hides (1: all, so
// nothing out in it shows, a tree's top or a car's roof no more than a zombie), how slowly the wind carries it (a
// lazy drift, not a gale), and how much the lamps and torches out in it light it up (glow) and a flashlight's beam
// shows in it (beam)
// path: the clear path a flashlight's beam cuts through it by the light's tier, [its half-width against the beam's own,
// how much of the beam's reach it runs]
const MIST = { chance: 0.22, from: 3, clear: 2.4, ramp: 3.2, rollIn: 8, rollOut: 4, max: 1, wind: 0.11, glow: 0.7, beam: 0.55,
  path: { 1: [0.6, 0.8], 2: [1.55, 1] },
  on: false, last: 0, k: 0, t: 0 };
// the host's roll for the wave about to start (co-op: sent with it, net/sync.js)
function mistRoll(n) { if (cheatIs('fog')) { MIST.last = n; return true; }   // (the cheat menu's Fog every wave: ui/cheats.js)
  const on = n >= MIST.from && MIST.last !== n - 1 && rand() < MIST.chance; if (on) MIST.last = n; return on; }
// a wave beginning with it or without, and its going at the end of the wave or the run
function mistSet(on) { MIST.on = !!on; }
function mistReset() { MIST.on = false; MIST.k = 0; MIST.last = 0; }
// every frame: rolling in through the wave, out once it's over (an ease on the way in and out of each)
function mistTick(rdt) {
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
  const house = smooth(clamp((houseSd(x, z) + 0.05) / 0.35, 0, 1));
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
const mistSee = (x, z) => 1 - smooth(clamp((mistAt(x, z) - 0.3) / 0.4, 0, 1));
// the shader's part (spliced into the composite: effects/post.js), and its uniforms filled in each frame
const MIST_U = { uMist: { value: new THREE.Vector4() }, uMistP: { value: new THREE.Vector2() }, uMistH: { value: new THREE.Vector4() }, uMistW: { value: new THREE.Vector2() }, uMistC: { value: new THREE.Color() }, uMistInv: { value: new THREE.Matrix4() }, uMistSz: { value: new THREE.Vector4() },
  uMistL: { value: new THREE.Vector4() }, uMistA: { value: new THREE.Color() }, uMistCut: { value: new THREE.Vector4() },
  uFlT: { value: [0, 0, 0, 0, 0, 0] }, uMistPath: { value: new THREE.Vector4() },   // (each light's tier, flashUniforms; the path by tier, MIST.path)
  // (the light map and the flashlight cones: the lit shader's own, core/shaders.js and lighting/lightmap.js, handed
  // over each frame in mistUniforms, as they're made after this)
  uLightMap: { value: null }, uLmRes: { value: 1 }, uFl: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlP: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uFlK: { value: new THREE.Vector4() } };
const MIST_GLSL = `
uniform vec4 uMist, uMistH, uMistSz, uMistL; uniform vec2 uMistP, uMistW; uniform vec3 uMistC, uMistA; uniform mat4 uMistInv;
uniform sampler2D uLightMap; uniform float uLmRes; uniform vec4 uFl[6], uFlP[6], uFlK, uMistCut, uMistPath; uniform float uFlT[6];
// how far p is outside the house's walls (less than nothing: inside), an L-shaped one's notch cut out (houseSd)
float mBox(vec2 p, vec4 r) { vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5, d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float mHouse(vec2 p) { return max(mBox(p, uMistH), -mBox(p, uMistCut)); }
float mH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mN(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(mH(i), mH(i + vec2(1.0, 0.0)), u.x), mix(mH(i + vec2(0.0, 1.0)), mH(i + vec2(1.0, 1.0)), u.x), u.y); }
float mF(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * mN(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return v * 1.143; }
vec3 mGlow;   // (light the fog gives off over what it's drawn in: a flashlight's beam in the air)
// uMist: how far it's rolled in (0-1), the clear ring's radius and how far it thickens over, the most it hides.
// uMistL: how much the lamps light it, how much a beam shows, the clock; uMistA: the plain ambient light, so only
// what the lamps add on top of it shows in the fog
vec4 mistOf(vec2 uv, float d) {
  mGlow = vec3(0.0);
  vec3 w = (uMistInv * vec4(uMistSz.zw + (uv - 0.5) * uMistSz.xy, -d, 1.0)).xyz;
  vec2 q = w.xz, dr = uMistW;
  // the flashlights' beams: light caught in the air along each cone, brightest near the lens, broken into slow shafts;
  // and the clear path each cuts through the fog (fc), wider for a better light (uMistPath: by tier, flashClear)
  float dp = length(q - uMistP), fc = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uFlK.w) break;
    vec2 r = q - uFl[i].xy; float l = length(r); if (l > uFlP[i].x || l < 0.05) continue;
    vec2 dir = vec2(uFl[i].z, uFl[i].w); float c = dot(r, dir) / l, ang = acos(clamp(c, -1.0, 1.0));
    vec2 pa = uFlT[i] > 1.5 ? uMistPath.zw : uMistPath.xy; float w = uFlP[i].y * pa.x, reach = uFlP[i].x * pa.y;
    float tw = (mN(vec2(l * 0.6 - uMistL.z * 0.4, ang * 3.0)) - 0.5) * 0.12;   // (its edge drifting with the fog, not a clean wedge)
    fc = max(fc, (1.0 - smoothstep(w * 0.45, w, ang + tw)) * (1.0 - smoothstep(reach * 0.55, reach, l)) * clamp(uFlP[i].z * 1.4, 0.0, 1.0));
    float cone = 1.0 - smoothstep(uFlP[i].y * 0.55, uFlP[i].y, ang); if (cone <= 0.0) continue;
    float side = r.x * dir.y - r.y * dir.x, shaft = 0.55 + 0.45 * mN(vec2(side / l * 7.0 + uMistL.z * 0.15, l * 0.35 - uMistL.z * 0.3));
    float b = cone * pow(1.0 - l / uFlP[i].x, 1.6) * shaft * uFlP[i].z;
    mGlow += vec3(1.0, 0.94, 0.8) * b * uMistL.y * (0.25 + 0.75 * smoothstep(uMist.y * 0.5, uMist.y + uMist.z, dp)) * uMist.x;
  }
  // nothing to work out well inside the clear ring, or inside the house
  if (dp < uMist.y - 2.6) return vec4(0.0);
  float hd = mHouse(q);
  if (hd < -0.05) return vec4(0.0);
  // the wind's tatters: a soft noise carried slowly along by the wind and twisted through itself, so it billows and drifts
  float n = mF(q * 0.14 + dr * 0.14 + mN(q * 0.06 - dr * 0.05) * 1.8), n2 = mN(q * 0.45 + dr * 0.4);
  float ring = smoothstep(uMist.y, uMist.y + uMist.z, dp + (n - 0.5) * 2.6 + (n2 - 0.5) * 0.8);
  // right up to the walls, and never over the house
  float house = smoothstep(-0.05, 0.3, hd);
  float front = mix(${(HALF + 6).toFixed(1)}, -4.0, uMist.x), rim = max(abs(q.x), abs(q.y));
  float roll = smoothstep(front - 4.0, front + 4.0, rim + (n - 0.5) * 9.0);
  float a = ring * house * roll * (1.0 - fc * 0.94);   // (solid once it's thick: its billows are in its colour and its ragged edges, never thin enough to see through)
  // its body: slow curls folded through themselves (a second noise warped by the first), drifting with the wind, with
  // long faint streaks laid along it, denser darker pockets and paler, cooler swells, and a brighter lip where it thins
  // round the clear ring or a flashlight's path (the light catching its edge)
  vec2 wd = normalize(dr + vec2(0.0007, 0.0003)), wp = vec2(-wd.y, wd.x);
  float cu = mF(q * 0.3 + vec2(n, n2) * 1.7 - dr * 0.55 + uMistL.z * 0.012);
  float st = smoothstep(0.5, 0.95, mN(vec2(dot(q, wd) * 0.07 - uMistL.z * 0.02, dot(q, wp) * 0.55)));
  float lip = clamp(ring * (1.0 - ring) * 4.0 + fc * (1.0 - fc) * 3.0, 0.0, 1.0);
  vec3 base = uMistC * (0.74 + 0.2 * n2 + 0.36 * (cu - 0.5));
  base = mix(base * vec3(1.05, 1.02, 0.95), base * vec3(0.9, 0.98, 1.08), smoothstep(0.35, 0.75, cu));
  base += uMistC * (0.12 * st + 0.16 * lip);
  // lit from within: what the lamps and fires out in it add over the plain dark, glowing in the fog round them
  vec3 lm = texture2D(uLightMap, (q + ${HALF.toFixed(1)}) / ${N.toFixed(1)}).rgb * 2.0, lamp = max(lm - uMistA, 0.0);
  vec3 col = base + min(lamp, vec3(0.6)) * uMistL.x * (0.55 + 0.6 * n) + mGlow * 0.9;
  return vec4(col, clamp(a, 0.0, 1.0) * uMist.w);
}`;
function mistUniforms() {
  const U = MIST_U, k = mistEase(), F = camFocus(), z = cam.zoom;
  U.uMist.value.set(k, MIST.clear, MIST.ramp, k > 0 ? MIST.max : 0);
  U.uMistP.value.set(F.x, F.z);
  U.uMistH.value.set(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1);
  U.uMistW.value.set(WIND_V.value.x * MIST.t * MIST.wind, WIND_V.value.y * MIST.t * MIST.wind);
  U.uMistC.value.setRGB(0.66, 0.67, 0.64).lerp(_mistNight.setRGB(0.1, 0.12, 0.14), clamp(curDark, 0, 1));   // pale by day, a dark blue grey at night
  U.uMistInv.value.copy(cam.matrixWorld);
  U.uMistSz.value.set((cam.right - cam.left) / z, (cam.top - cam.bottom) / z, (cam.right + cam.left) / 2, (cam.top + cam.bottom) / 2);
  U.uMistL.value.set(MIST.glow, MIST.beam, MIST.t % 1000, 0); U.uMistA.value.setRGB(amb[0], amb[1], amb[2]);
  const c = HOUSE.cut; if (c) U.uMistCut.value.set(c[0], c[1], c[2], c[3]); else U.uMistCut.value.set(1e4, 1e4, 1e4 + 1, 1e4 + 1);
  U.uMistPath.value.set(MIST.path[1][0], MIST.path[1][1], MIST.path[2][0], MIST.path[2][1]);
  U.uLightMap.value = LMU.uLightMap.value; U.uLmRes.value = LMU.uLmRes.value; U.uFl.value = LMU.uFl.value; U.uFlP.value = LMU.uFlP.value; U.uFlK.value = LMU.uFlK.value;
}
const _mistNight = new THREE.Color();
