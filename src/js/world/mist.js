// Fog rounds: now and then a wave comes in under a thick ground fog. It rolls in off the fields from the edges of the
// map as the wave starts and rolls back out once it's cleared. It never comes into the house, but lies all round it,
// and out in the open it parts round you (or the teammate you're watching) in a ring that thins gradually toward you,
// its edge torn about by the wind rather than a clean circle. The further out you zoom, the more of the screen it takes.
//
// It's drawn over the finished frame (effects/post.js: the composite), from where each pixel is on the ground, so
// it's the same fog in the frame as in play: a zombie out in it can't be seen, outlined or picked out by your
// crosshair, and one in the thinning ring comes clear as it closes in (mistSee, zombies/zombie-visuals.js).

// a wave's odds of fog (from wave MIST.from, and never two in a row), how many metres round you stay clear and how far
// it takes to thicken to full past that, how long it takes to roll in and back out (s), the most it hides (1: all),
// and how fast the wind carries it
const MIST = { chance: 0.22, from: 3, clear: 4.5, ramp: 6.5, rollIn: 8, rollOut: 4, max: 0.94, wind: 0.6,
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
const mistEase = () => smooth(MIST.k);
// how thick it is at (x, z), without the wind's tatters: how far you are past the clear ring, how far out of the house,
// and whether it's reached there yet rolling in from the edges (the same as the shader's, below, near enough)
function mistAt(x, z) {
  const k = mistEase(); if (k <= 0) return 0;
  const F = camFocus(), d = Math.hypot(x - F.x, z - F.z), ring = smooth(clamp((d - MIST.clear) / MIST.ramp, 0, 1));
  const ox = Math.max(HOUSE.x0 - x, x - HOUSE.x1, 0), oz = Math.max(HOUSE.z0 - z, z - HOUSE.z1, 0), house = smooth(clamp((Math.hypot(ox, oz) - 0.2) / 2, 0, 1));
  const front = HALF + 6 - (HALF + 10) * k, rim = Math.max(Math.abs(x), Math.abs(z)), roll = smooth(clamp((rim - front + 4) / 8, 0, 1));
  return ring * house * roll;
}
// how much of a zombie there shows: all of it in the clear, coming out of it through the thinning ring, none in it
const mistSee = (x, z) => 1 - smooth(clamp((mistAt(x, z) - 0.3) / 0.4, 0, 1));
// the shader's part (spliced into the composite: effects/post.js), and its uniforms filled in each frame
const MIST_U = { uMist: { value: new THREE.Vector4() }, uMistP: { value: new THREE.Vector2() }, uMistH: { value: new THREE.Vector4() }, uMistW: { value: new THREE.Vector2() }, uMistC: { value: new THREE.Color() }, uMistInv: { value: new THREE.Matrix4() }, uMistSz: { value: new THREE.Vector4() } };
const MIST_GLSL = `
uniform vec4 uMist, uMistH, uMistSz; uniform vec2 uMistP, uMistW; uniform vec3 uMistC; uniform mat4 uMistInv;
float mH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mN(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(mH(i), mH(i + vec2(1.0, 0.0)), u.x), mix(mH(i + vec2(0.0, 1.0)), mH(i + vec2(1.0, 1.0)), u.x), u.y); }
float mF(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * mN(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return v; }
// uMist: how far it's rolled in (0-1), the clear ring's radius and how far it thickens over, the most it hides
vec4 mistOf(vec2 uv, float d) {
  vec3 w = (uMistInv * vec4(uMistSz.zw + (uv - 0.5) * uMistSz.xy, -d, 1.0)).xyz;
  vec2 q = w.xz, dr = uMistW;
  // the wind's tatters: a soft noise carried along by the wind and twisted through itself, so it billows and drifts
  float n = mF(q * 0.14 + dr * 0.14 + mF(q * 0.06 - dr * 0.05) * 1.8), n2 = mF(q * 0.45 + dr * 0.4);
  float ring = smoothstep(uMist.y, uMist.y + uMist.z, length(q - uMistP) + (n - 0.5) * 4.0 + (n2 - 0.5) * 1.2);
  vec2 o = max(max(uMistH.xy - q, q - uMistH.zw), 0.0);
  float house = smoothstep(0.2, 2.2, length(o) + (n - 0.5) * 1.4);
  float front = mix(${(HALF + 6).toFixed(1)}, -4.0, uMist.x), rim = max(abs(q.x), abs(q.y));
  float roll = smoothstep(front - 4.0, front + 4.0, rim + (n - 0.5) * 9.0);
  float a = ring * house * roll * (0.62 + 0.55 * n) * (1.0 - 0.45 * smoothstep(0.8, 5.0, w.y));
  vec3 col = uMistC * (0.86 + 0.28 * n2);
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
}
const _mistNight = new THREE.Color();
