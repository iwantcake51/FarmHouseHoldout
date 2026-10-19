// The wind: which way it blows and how hard, changing as the weather does, and the gusts that roll across the farm.

// It keeps to a prevailing way for a while and swings round slowly, and its strength settles on a new mood every so
// often: a still spell, a breeze, or a blustery one (WIND_MOOD: how likely each is, and its strength, 0 to 1). Gusts
// are bands of stronger air sweeping across the ground the way it blows, faster the harder it blows (gustAt: the same
// sum the foliage's shader uses, core/shaders.js), so the grass bows over field by field and smoke and dust get
// snatched away as one passes. Inside the house it's all but still. Only the look and sound of things: nothing it
// does touches play, and it runs on its own random numbers, not the game's
const WIND_MOOD = [{ p: 0.2, s: [0.06, 0.22] }, { p: 0.55, s: [0.3, 0.58] }, { p: 0.25, s: [0.62, 1] }];
// how long a mood lasts (seconds), how far the wind swings round at a change (radians), how quickly it eases to the
// new way and strength, and how fast the gust bands travel (metres a second, still and at full strength)
const WIND_T = { hold: [25, 70], swing: 1.1, turn: 0.05, ease: 0.07, gust: [2, 8] };
// how fast it carries something light along (metres a second, at its strength and in a gust), and how much is left
// of it indoors
const WIND_CARRY = { base: 0.1, str: 1.1, gust: 0.9, inside: 0.12 };
const mrr = (a, b) => a + Math.random() * (b - a);
const WX = { ang: Math.random() * 6.28, to: 0, str: 0.4, ts: 0.4, t: 0, gp: 0, x: 1, z: 0 };
WX.to = WX.ang;
function windMood() {
  let r = Math.random(); const m = WIND_MOOD.find(m => (r -= m.p) < 0) || WIND_MOOD[1];
  WX.ts = mrr(m.s[0], m.s[1]); WX.to = WX.ang + mrr(-WIND_T.swing, WIND_T.swing); WX.t = mrr(WIND_T.hold[0], WIND_T.hold[1]);
}
windMood(); WX.str = WX.ts;
// how strong a gust is at a point right now, 0 to 1
const gustAt = (x, z) => Math.pow(0.5 + 0.5 * Math.sin((x * WX.x + z * WX.z) * WIND_GUST.k - WX.gp), WIND_GUST.sharp);
const windIndoors = (x, z) => x > HOUSE.x0 && x < HOUSE.x1 && z > HOUSE.z0 && z < HOUSE.z1;
// the air's speed at a point (into out.x, out.z, metres a second): what carries smoke, dust and anything light along
function windAt(x, z, out) {
  const v = (WIND_CARRY.base + WIND_CARRY.str * WX.str) * (1 + WIND_CARRY.gust * gustAt(x, z)) * (windIndoors(x, z) ? WIND_CARRY.inside : 1);
  out.x = WX.x * v; out.z = WX.z * v; return out;
}
function stepWind(rdt) {
  WX.t -= rdt; if (WX.t <= 0) windMood();
  WX.ang += (WX.to - WX.ang) * Math.min(1, rdt * WIND_T.turn); WX.str += (WX.ts - WX.str) * Math.min(1, rdt * WIND_T.ease);
  // a slow wander about the way it's blowing, so it's never dead straight
  const a = WX.ang + Math.sin(worldT * 0.11) * 0.18 + Math.sin(worldT * 0.047 + 2) * 0.12;
  WX.x = Math.cos(a); WX.z = Math.sin(a);
  WX.gp += rdt * (WIND_T.gust[0] + (WIND_T.gust[1] - WIND_T.gust[0]) * WX.str) * WIND_GUST.k;
  WIND.value += rdt * (0.9 + 2.4 * WX.str);   // the flutter: quicker the harder it blows
  WIND_V.value.set(WX.x, WX.z, WX.str, WX.gp);
  windSound(rdt);
}
// what it sounds like where you are: a soft rush of air (filtered noise, looped), louder and brighter as it blows
// harder and as a gust goes over you, and only a murmur from inside the house (WIND_SND: its loudness still and at
// full strength, how much louder in a gust, and the low-pass it's heard through, still and at full). It runs on the
// world's clock (worldK): slower and deeper in slow motion, and silent while the game's paused
const WIND_SND = { vol: [0.002, 0.022], gust: 0.5, lp: [300, 1100], inside: 0.3 };
let windNode = null;
function windSound(rdt) {
  if (!AC || state === 'title') { if (windNode) windNode.g.gain.setTargetAtTime(0, AC.currentTime, 0.4); return; }
  if (!windNode) {
    // a few seconds of brown-ish noise, so the loop isn't heard
    const n = AC.sampleRate * 4, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0); let b = 0;
    for (let i = 0; i < n; i++) { b = (b + (Math.random() * 2 - 1) * 0.06) * 0.985; d[i] = b * 3; }
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = buf; s.loop = true; f.type = 'lowpass'; f.Q.value = 0.6; g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master); s.start(); windNode = { s, f, g };
  }
  const S = WIND_SND, gu = gustAt(P.x, P.z), k = WX.str * (1 + S.gust * gu), t = AC.currentTime;
  const vol = (S.vol[0] + (S.vol[1] - S.vol[0]) * Math.min(1.5, k)) * (windIndoors(P.x, P.z) ? S.inside : 1) * (P.dead ? 0.5 : 1);
  windNode.g.gain.setTargetAtTime(worldK > 0.01 ? vol : 0, t, worldK > 0.01 ? 0.3 : 0.08);
  windNode.f.frequency.setTargetAtTime((S.lp[0] + (S.lp[1] - S.lp[0]) * Math.min(1, k)) * (0.4 + 0.6 * worldK), t, 0.15);
  windNode.s.playbackRate.setTargetAtTime(Math.max(0.25, worldK), t, 0.15);
}
