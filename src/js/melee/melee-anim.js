// Melee animation: the guard each weapon is held in, its three swings, the draw flourish, the bash, and the springs
// that carry the body through them.
//
// A pose is where the right fist is (F, in upper-body space: x to your right, y up, z ahead, the right shoulder at
// 0.33, 1.08, 0) and which way the weapon points out of it (W, the handle to the tip), plus the body: the hips turned
// (hy) and the chest turned (uy, + to your right), leaned forward (ux) and bent to the side (uz), the weight forward
// onto the lead foot (step, - back onto the rear one) and the knees bent (dip). meleeSolve turns F and W into the arm's
// angles, its roll and the weapon's angle in the fist, so the keys say where things go and the arm finds its way there.
//
// Each track is a list of keys [t, F, W, body], body as { uy, ux, uz, hy, step, dip } (missing ones carry on from the
// key before). 'G' for F or W is the weapon's guard. The pose runs through the keys on a smooth curve (meleeCurve),
// keeping its speed through each key rather than stopping at it, except at a key marked hold. A swing is sampled a
// little ahead for the hips and chest than for the arm, and the arm ahead of the weapon (MCHAIN): the hips start it,
// the shoulders follow, the arm comes through and the weapon whips round last. Then everything rides on springs
// (MSPRING), loose for the weapon in the fist, firmer for the body, so it carries on past where it's sent and settles.
// A blow that lands (meleeImpact) stops the swing dead for a moment (MSTOP) and throws the springs back off the hit.

// the guard per weapon: fist and weapon direction, and the body
const MGUARD = {
  club:    { F: [0.2, 1.1, 0.4], W: [0.12, 0.92, -0.3], b: { uy: 0.18, ux: 0.02 } },             // crowbar, wrench: up by the shoulder, ready to come down
  bat:     { F: [0.12, 1.14, 0.3], W: [0.38, 0.78, -0.5], b: { uy: 0.28, ux: 0.03, dip: 0.08 } },  // a batter's stance, the bat cocked over the right shoulder
  machete: { F: [0.24, 1.02, 0.4], W: [0.02, 0.72, 0.7], b: { uy: 0.12, ux: 0.03 } },             // out in front, the blade up and forward
  katana:  { F: [0.06, 1.0, 0.4], W: [-0.04, 0.62, 0.78], b: { uy: 0.08, ux: 0.04, dip: 0.1 } },   // two hands at the middle, the point at the throat
  heavy:   { F: [0.12, 0.9, 0.34], W: [-0.42, 0.82, 0.32], b: { uy: 0.2, ux: 0.05, dip: 0.12 } }   // across the body, the head up by the left shoulder
};
const meleeKind = id => id === 'bat' ? 'bat' : id === 'machete' ? 'machete' : id === 'katana' ? 'katana' : id === 'axe' || id === 'sledge' ? 'heavy' : 'club';
// three swings per style. Blunt and blades land at p 0.4, the heavy two at 0.55 (HEAVY.hit, melee/melee.js), each
// whipping through the point it lands at; side is which way it goes across you (the view tips with it: melee.js), and
// fast the stretch of it that smears a trail (melee/swing-trail.js)
const MSWINGS = {
  swing: [
    { side: 1, fast: [0.24, 0.56], keys: [   // the forehand: wound up behind the right shoulder, swept flat across the front, wrapped round the left
      [0, 'G', 'G'],
      [0.2, [0.5, 1.38, -0.12], [0.7, 0.42, -0.58], { uy: 0.62, hy: 0.3, ux: -0.04, step: -0.35, dip: 0.16 }, 1],
      [0.31, [0.34, 1.14, 0.3], [0.96, 0.12, 0.22], { uy: 0.22, hy: -0.05, step: 0.2 }],
      [0.4, [0.04, 1.1, 0.52], [-0.12, 0.04, 1], { uy: -0.32, hy: -0.4, ux: 0.1, step: 0.75, dip: 0.2 }],
      [0.52, [-0.26, 1.14, 0.3], [-0.92, 0.18, -0.3], { uy: -0.72, hy: -0.55, ux: 0.06 }],
      [0.66, [-0.18, 1.3, 0.12], [-0.42, 0.62, -0.66], { uy: -0.55, hy: -0.4, step: 0.4, dip: 0.12 }],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.24, 0.56], keys: [  // the backhand: back across from the left, the knuckles leading
      [0, 'G', 'G'],
      [0.2, [-0.14, 1.2, 0.14], [-0.72, 0.52, -0.46], { uy: -0.5, hy: -0.25, step: -0.2, dip: 0.14 }, 1],
      [0.31, [-0.08, 1.12, 0.4], [-0.92, 0.1, 0.32], { uy: -0.2, hy: 0, step: 0.25 }],
      [0.4, [0.2, 1.1, 0.5], [0.22, 0.04, 1], { uy: 0.22, hy: 0.3, ux: 0.08, step: 0.6, dip: 0.18 }],
      [0.52, [0.52, 1.2, 0.3], [0.94, 0.2, -0.22], { uy: 0.6, hy: 0.42 }],
      [0.68, [0.44, 1.36, 0.2], [0.5, 0.6, -0.6], { uy: 0.45, hy: 0.25, step: 0.3, dip: 0.1 }],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.26, 0.58], keys: [   // overhand: raised high behind the head and brought down across the body
      [0, 'G', 'G'],
      [0.21, [0.34, 1.56, -0.04], [0.22, 0.46, -0.86], { uy: 0.32, hy: 0.15, ux: -0.1, step: -0.3, dip: 0.04 }, 1],
      [0.32, [0.26, 1.46, 0.3], [0.32, 0.92, 0.22], { uy: 0.12, ux: 0.02, step: 0.1 }],
      [0.4, [0.1, 1.08, 0.52], [-0.3, -0.32, 0.9], { uy: -0.18, hy: -0.2, ux: 0.24, step: 0.7, dip: 0.3 }],
      [0.54, [-0.1, 0.84, 0.34], [-0.62, -0.55, 0.52], { uy: -0.42, hy: -0.3, ux: 0.26, dip: 0.34 }],
      [0.7, [0.0, 0.96, 0.3], [-0.2, 0.4, 0.5], { uy: -0.2, ux: 0.14, step: 0.3, dip: 0.2 }],
      [1, 'G', 'G']] }
  ],
  slash: [
    { side: 1, fast: [0.24, 0.56], keys: [   // the forehand diagonal: high over the right shoulder down to the left hip
      [0, 'G', 'G'],
      [0.2, [0.36, 1.44, 0.04], [0.52, 0.62, -0.58], { uy: 0.48, hy: 0.22, ux: -0.05, step: -0.3, dip: 0.08 }, 1],
      [0.31, [0.3, 1.32, 0.34], [0.62, 0.62, 0.48], { uy: 0.2, step: 0.15 }],
      [0.4, [0.06, 1.05, 0.52], [-0.46, -0.26, 0.85], { uy: -0.28, hy: -0.3, ux: 0.18, step: 0.7, dip: 0.24 }],
      [0.52, [-0.2, 0.84, 0.3], [-0.72, -0.62, -0.22], { uy: -0.6, hy: -0.45, ux: 0.22, dip: 0.3 }],
      [0.68, [-0.06, 0.96, 0.3], [-0.3, 0.3, 0.4], { uy: -0.3, ux: 0.1, step: 0.35, dip: 0.15 }],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.24, 0.56], keys: [  // the rising backhand: from low on the left up past the right shoulder
      [0, 'G', 'G'],
      [0.2, [-0.12, 0.86, 0.28], [-0.8, -0.42, 0.24], { uy: -0.5, hy: -0.25, ux: 0.12, step: -0.15, dip: 0.24 }, 1],
      [0.31, [-0.04, 0.94, 0.48], [-0.6, -0.1, 0.78], { uy: -0.22, step: 0.2, dip: 0.2 }],
      [0.4, [0.14, 1.12, 0.52], [0.42, 0.32, 0.85], { uy: 0.22, hy: 0.25, ux: 0.06, step: 0.6, dip: 0.12 }],
      [0.52, [0.4, 1.44, 0.22], [0.72, 0.6, -0.32], { uy: 0.52, hy: 0.38, ux: -0.04 }],
      [0.68, [0.3, 1.3, 0.24], [0.3, 0.8, 0.1], { uy: 0.3, step: 0.3, dip: 0.08 }],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.26, 0.58], keys: [   // the straight cut: the blade lifted behind the head and brought down the middle
      [0, 'G', 'G'],
      [0.22, [0.14, 1.6, 0.02], [0.04, 0.32, -0.95], { uy: 0.12, ux: -0.12, step: -0.25, dip: 0.02 }, 1],
      [0.32, [0.12, 1.5, 0.32], [0.04, 0.96, 0.2], { uy: 0.06, step: 0.1 }],
      [0.4, [0.06, 1.12, 0.54], [0, -0.12, 1], { uy: 0, ux: 0.24, step: 0.7, dip: 0.3 }],
      [0.52, [0.06, 0.86, 0.42], [0.04, -0.78, 0.6], { ux: 0.32, dip: 0.38 }],
      [0.7, [0.08, 0.96, 0.4], [0.02, 0.36, 0.9], { ux: 0.14, step: 0.3, dip: 0.2 }],
      [1, 'G', 'G']] }
  ],
  heavy: [
    { side: 1, fast: [0.44, 0.6], keys: [    // overhead: hauled up and back over the head, a beat at the top, then down into the ground in front
      [0, 'G', 'G'],
      [0.3, [0.16, 1.46, 0.14], [0.12, 0.82, -0.52], { uy: 0.18, ux: -0.08, step: -0.25, dip: 0.04 }],
      [0.44, [0.1, 1.6, 0.0], [0.04, 0.24, -0.97], { uy: 0.12, ux: -0.16, step: -0.38, dip: 0 }, 1],
      [0.55, [0.04, 0.96, 0.56], [0, -0.58, 0.82], { uy: 0, ux: 0.3, step: 0.6, dip: 0.44 }],
      [0.74, [0.04, 0.9, 0.52], [0, -0.66, 0.75], { ux: 0.27, step: 0.55, dip: 0.4 }, 1],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.44, 0.62], keys: [   // over the right shoulder and down across to the left
      [0, 'G', 'G'],
      [0.3, [0.36, 1.38, 0.06], [0.52, 0.66, -0.54], { uy: 0.5, hy: 0.25, ux: -0.05, step: -0.25 }],
      [0.44, [0.42, 1.52, -0.06], [0.62, 0.42, -0.66], { uy: 0.66, hy: 0.36, ux: -0.1, step: -0.35, dip: 0.06 }, 1],
      [0.55, [0.02, 1.0, 0.56], [-0.42, -0.36, 0.83], { uy: -0.3, hy: -0.3, ux: 0.3, step: 0.65, dip: 0.4 }],
      [0.72, [-0.14, 0.86, 0.36], [-0.72, -0.62, 0.3], { uy: -0.5, hy: -0.42, ux: 0.32, dip: 0.42 }, 1],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.44, 0.62], keys: [  // the side swing: everything turned back to the right, then round flat across the front
      [0, 'G', 'G'],
      [0.3, [0.52, 1.3, 0.12], [0.72, 0.36, -0.6], { uy: 0.62, hy: 0.36, step: -0.3, dip: 0.16 }],
      [0.44, [0.56, 1.34, 0.02], [0.66, 0.22, -0.72], { uy: 0.82, hy: 0.46, step: -0.38, dip: 0.2 }, 1],
      [0.55, [0.04, 1.04, 0.56], [-0.18, -0.06, 1], { uy: -0.24, hy: -0.36, ux: 0.12, step: 0.65, dip: 0.24 }],
      [0.7, [-0.34, 1.08, 0.26], [-0.9, 0.08, -0.36], { uy: -0.85, hy: -0.6, ux: 0.1, dip: 0.2 }, 1],
      [1, 'G', 'G']] }
  ]
};
// the draw: once the weapon's out (player/swap.js brings it from where it rides), what you do with it, by weapon, over
// dur seconds. A one-hander's spun round in the fist and caught; the machete flipped over and given a flick; the bat
// laid on the shoulder and bounced; the katana's blade flicked out to the side and brought up to the guard; the heavy
// two let sag with their weight, hauled onto the shoulder, then down into the guard
const MDRAW = {
  club: { dur: 0.72, keys: [
    [0, 'G', 'G'],
    [0.16, [0.24, 1.18, 0.42], [0.1, 0.3, 0.95], { uy: 0.1 }],
    [0.3, [0.26, 1.24, 0.44], [0.08, -0.9, 0.4], { uy: 0.08 }],
    [0.44, [0.24, 1.22, 0.42], [0.06, -0.2, -0.98]],
    [0.58, [0.2, 1.06, 0.4], [0.12, 0.92, -0.3], { uy: 0.2, dip: 0.08 }],
    [0.72, 'G', 'G']] },
  machete: { dur: 0.76, keys: [
    [0, 'G', 'G'],
    [0.14, [0.3, 1.14, 0.44], [0.1, -0.4, 0.9], { uy: 0.14 }],
    [0.28, [0.3, 1.18, 0.42], [0.12, -0.6, -0.8]],
    [0.42, [0.28, 1.08, 0.4], [0.08, 0.8, -0.5], { dip: 0.06 }],
    [0.56, [0.18, 1.0, 0.5], [-0.5, 0.2, 0.84], { uy: -0.12, ux: 0.06 }],
    [0.76, 'G', 'G']] },
  bat: { dur: 0.9, keys: [
    [0, 'G', 'G'],
    [0.22, [0.2, 1.32, 0.22], [0.26, 0.24, -0.93], { uy: 0.18, dip: 0.04 }],
    [0.36, [0.2, 1.27, 0.22], [0.26, 0.3, -0.92], { uy: 0.16, dip: 0.1 }],
    [0.48, [0.2, 1.33, 0.22], [0.26, 0.24, -0.93], { uy: 0.18, dip: 0.04 }],
    [0.6, [0.2, 1.28, 0.23], [0.26, 0.3, -0.92], { dip: 0.09 }, 1],
    [0.9, 'G', 'G']] },
  katana: { dur: 0.82, keys: [
    [0, 'G', 'G'],
    [0.18, [0.32, 1.14, 0.4], [0.62, 0.42, 0.66], { uy: 0.3, hy: 0.12 }],
    [0.32, [0.42, 0.96, 0.38], [0.88, -0.36, 0.3], { uy: 0.4, hy: 0.18, dip: 0.14 }],
    [0.46, [0.4, 0.96, 0.38], [0.86, -0.4, 0.32], { dip: 0.16 }, 1],
    [0.82, 'G', 'G']] },
  heavy: { dur: 1.0, keys: [
    [0, 'G', 'G'],
    [0.18, [0.14, 0.8, 0.36], [-0.3, 0.4, 0.86], { uy: 0.12, ux: 0.12, dip: 0.3 }],
    [0.42, [0.18, 1.36, 0.22], [0.18, 0.5, -0.85], { uy: 0.26, ux: -0.04, dip: 0.04 }],
    [0.58, [0.18, 1.32, 0.22], [0.2, 0.46, -0.86], { dip: 0.1 }, 1],
    [1.0, 'G', 'G']] }
};
// the bash (a shove with a melee weapon in your hands, player/shove.js): both hands drive the haft out flat across
// you, the weapon crosswise like a bar, and back to the guard; a one-hander's driven out pommel first. Over the
// shove's own time (SHOVE_DUR), with the blow landing at SHOVE_HIT
const MBASH = {
  two: [[0, 'G', 'G'],
    [0.18, [0.1, 1.06, 0.2], [-0.94, 0.3, 0.12], { uy: 0.14, ux: -0.04, step: -0.1 }, 1],
    [0.3, [0.02, 1.08, 0.58], [-0.96, 0.24, 0.1], { uy: -0.06, ux: 0.1, step: 0.3 }],
    [0.48, [0.04, 1.08, 0.52], [-0.94, 0.28, 0.12], { ux: 0.08, step: 0.25 }],
    [1, 'G', 'G']],
  one: [[0, 'G', 'G'],
    [0.18, [0.3, 1.2, 0.3], [0.06, 0.96, 0.2], { uy: 0.18, step: -0.1 }, 1],
    [0.3, [0.1, 1.1, 0.6], [0.04, 0.9, -0.4], { uy: -0.08, ux: 0.1, step: 0.3 }],
    [0.48, [0.12, 1.1, 0.54], [0.06, 0.92, -0.3], { ux: 0.08, step: 0.25 }],
    [1, 'G', 'G']]
};
// how far ahead (seconds) each part is sampled: the hips and legs lead, then the chest, the arm, and the weapon last
const MCHAIN = { body: 0.06, F: 0.035, W: 0.012 };
// the springs each part rides on (stiffness, damping): the weapon loosest, so it lags into a swing and whips past
const MSPRING = { F: [620, 36], W: [380, 21], turn: [360, 28], lean: [300, 24], legs: [260, 25] };
// a blow landing: how long the swing stops dead on it (seconds, a light swing and a heavy one), and how hard the
// springs are thrown back off it
const MSTOP = { light: 0.055, heavy: 0.09 };
const MBODY = ['uy', 'ux', 'uz', 'hy', 'step', 'dip'];
// the springs' state: the fist and the weapon's direction with their speeds, and the body (MS.b, each part's speed
// beside it as v + its name)
const MS = { F: new V3(0.2, 1.1, 0.4), vF: new V3(), W: new V3(0, 1, 0), vW: new V3(), b: {}, prevVar: -1, kind: '' };
MBODY.forEach(k => { MS.b[k] = 0; MS.b['v' + k] = 0; });
const _maF = new V3(), _maW = new V3(), _maA = new V3(), _maB = new V3(), _maQ = new THREE.Quaternion(), _maE = new THREE.Euler();
// a key's F or W, with 'G' the guard
const keyVec = (v, g, out) => v === 'G' ? out.set(g[0], g[1], g[2]) : out.set(v[0], v[1], v[2]);
// the value of one part at time t (a key's own time, in the track's units) along a track: through each key on a
// curve with the speed it had there (from its neighbours), none at the ends or at a key that holds
function meleeCurve(keys, t, get) {
  const n = keys.length;
  if (t <= keys[0][0]) return get(0);
  if (t >= keys[n - 1][0]) return get(n - 1);
  let i = 0; while (i < n - 2 && keys[i + 1][0] <= t) i++;
  const t0 = keys[i][0], t1 = keys[i + 1][0], d = t1 - t0, u = (t - t0) / d, u2 = u * u, u3 = u2 * u;
  const tan = j => (j <= 0 || j >= n - 1 || keys[j][4]) ? 0 : (get(j + 1) - get(j - 1)) / (keys[j + 1][0] - keys[j - 1][0]);
  return (2 * u3 - 3 * u2 + 1) * get(i) + (u3 - 2 * u2 + u) * d * tan(i) + (-2 * u3 + 3 * u2) * get(i + 1) + (u3 - u2) * d * tan(i + 1);
}
// (tracks are sampled every frame, so their keys' vectors are cached per track)
const _trkCache = new Map();
function trackVecs(keys, g) {
  let c = _trkCache.get(keys); if (c && c.g === g) return c;
  c = { g, fv: keys.map(k => keyVec(k[1], g.F, new V3())), wv: keys.map(k => keyVec(k[2], g.W, new V3()).normalize()), bv: {} };
  for (const ch of MBODY) { let cur = g.b[ch] || 0; c.bv[ch] = keys.map((k, j) => (cur = (k[1] === 'G' && (j === 0 || j === keys.length - 1)) ? (g.b[ch] || 0) : k[3] && k[3][ch] !== undefined ? k[3][ch] : cur)); }
  _trkCache.set(keys, c); return c;
}
function sampleFast(keys, g, tF, tW, tB, oF, oW, ob) {
  const c = trackVecs(keys, g), fv = c.fv, wv = c.wv;
  oF.set(meleeCurve(keys, tF, j => fv[j].x), meleeCurve(keys, tF, j => fv[j].y), meleeCurve(keys, tF, j => fv[j].z));
  oW.set(meleeCurve(keys, tW, j => wv[j].x), meleeCurve(keys, tW, j => wv[j].y), meleeCurve(keys, tW, j => wv[j].z));
  if (oW.lengthSq() < 1e-6) oW.set(0, 1, 0); oW.normalize();
  for (const ch of MBODY) { const bv = c.bv[ch]; ob[ch] = meleeCurve(keys, tB, j => bv[j]); }
}
// the next swing: one of the style's three, never the same one twice running
function pickSwing(D) {
  const n = (MSWINGS[meleeStyle(D)] || MSWINGS.swing).length;
  let v = (rand() * (n - 1)) | 0; if (v >= MS.prevVar && MS.prevVar >= 0) v++; v = Math.min(n - 1, v);
  MS.prevVar = v; W8.swingVar = v;
  return (MSWINGS[meleeStyle(D)] || MSWINGS.swing)[v];
}
const meleeStyle = D => heavySwing(D) ? 'heavy' : D.style === 'slash' ? 'slash' : 'swing';
const curSwing = D => { const s = MSWINGS[meleeStyle(D)] || MSWINGS.swing; return s[clamp(W8.swingVar | 0, 0, s.length - 1)]; };
// a blow landing (melee/melee.js): the swing stopped on it a moment and the springs thrown back off it; hard is how
// solid (1 for a hit, less for the ground)
function meleeImpact(heavy, hard) {
  ANIM.mStop = Math.max(ANIM.mStop || 0, (heavy ? MSTOP.heavy : MSTOP.light) * hard);
  MS.vF.multiplyScalar(-0.3 * hard); MS.vW.multiplyScalar(-0.45 * hard);
  const b = MS.b; b.vuy *= -0.25 * hard; b.vhy *= -0.2; b.vux -= 1.4 * hard; b.vdip += (heavy ? 1.6 : 0.6) * hard;
}
// the arm's angles for a fist at F holding a weapon pointing W (upper-body space): rx, ry aim the arm at the fist and
// sc stretches or shortens it to reach (within MREACH: short, it reads as the elbow bent); the arm's roll rz and the
// weapon's tilt in the fist hrx point the weapon, allowing for the arm being thinner across (ARM_THIN) than it is
// long. Of the two ways to hold it pointing the same way (rolled over or not), the one with the least roll. The
// weapon hangs off the arm, so it's scaled back by wy, wz along its length and across it to keep its own size
// (melee/melee-models.js built them on an arm ARM_THIN thick and FIST long)
const MREACH = [0.62, 1.15];
function meleeSolve(F, Wd, out) {
  const s = SHOULDER_REST.R, dx = F.x - s[0], dy = F.y - s[1], dz = F.z - s[2], len = Math.hypot(dx, dy, dz) || 1;
  out.rx = Math.atan2(-dy / len, dz / len); out.ry = Math.asin(clamp(dx / len, -1, 1)); out.sc = clamp(len / FIST, MREACH[0], MREACH[1]);
  _maQ.setFromEuler(_maE.set(out.rx, out.ry, 0)).invert();
  const w = _maB.copy(Wd).applyQuaternion(_maQ), c = Math.hypot(w.x, w.y);
  let rz = Math.atan2(-w.x, w.y), cy = c;
  if (Math.abs(rz) > Math.PI / 2) { rz = rz > 0 ? rz - Math.PI : rz + Math.PI; cy = -c; }
  out.rz = rz; out.hrx = Math.atan2(w.z / out.sc, cy / ARM_THIN);
  const sh = Math.sin(out.hrx), ch = Math.cos(out.hrx);
  out.wy = ARM_THIN / Math.hypot(ARM_THIN * ch, out.sc * sh); out.wz = 1 / Math.hypot(ARM_THIN * sh, out.sc * ch);
  return out;
}
// this frame's melee pose: what the swing, the draw or the bash wants, run through the springs. Returns the solved
// arm and weapon angles and the body (MS.b)
const _mSol = { rx: 0, ry: 0, sc: 1, rz: 0, hrx: 0, wy: 1, wz: 1 }, _mTB = {};
function meleePose(id, D, rdt, now, sh) {
  const kind = meleeKind(id), g = MGUARD[kind];
  if (MS.kind !== kind) { MS.kind = kind; MS.F.set(g.F[0], g.F[1], g.F[2]); MS.W.set(g.W[0], g.W[1], g.W[2]).normalize(); MS.vF.set(0, 0, 0); MS.vW.set(0, 0, 0); MBODY.forEach(k => { MS.b[k] = g.b[k] || 0; MS.b['v' + k] = 0; }); }
  _maF.set(g.F[0], g.F[1], g.F[2]); _maW.set(g.W[0], g.W[1], g.W[2]).normalize(); MBODY.forEach(k => { _mTB[k] = g.b[k] || 0; });
  const dur = W8.swingDur || 0.5;
  if (sh) {
    // the bash, over the shove's time
    const keys = D.two ? MBASH.two : MBASH.one, p = clamp(P.shove.t / P.shove.dur, 0, 1), L = P.shove.dur;
    sampleFast(keys, g, p + MCHAIN.F / L, p + MCHAIN.W / L, p + MCHAIN.body / L, _maF, _maW, _mTB);
  } else if (W8.swing > 0) {
    const p = 1 - W8.swing / dur, sw = curSwing(D);
    sampleFast(sw.keys, g, p + MCHAIN.F / dur, p + MCHAIN.W / dur, p + MCHAIN.body / dur, _maF, _maW, _mTB);
  } else if (ANIM.mDrawT !== undefined && ANIM.mDrawT >= 0) {
    // the flourish once it's drawn
    const fl = MDRAW[kind], t = ANIM.mDrawT;
    if (t >= fl.dur) ANIM.mDrawT = undefined;
    else sampleFast(fl.keys, g, t + MCHAIN.F, t + MCHAIN.W, t + MCHAIN.body, _maF, _maW, _mTB);
  }
  if (ANIM.mDrawT !== undefined && !swapSt) {   // (it waits while the draw itself is on: player/swap.js)
    const t0 = ANIM.mDrawT; ANIM.mDrawT += rdt;
    if (t0 < 0.2 && ANIM.mDrawT >= 0.2 && t0 >= 0) { if (D.blunt) SFX.swingBlunt(false); else SFX.swingBlade(false); }
    if (W8.swing > 0 || sh) ANIM.mDrawT = undefined;   // a swing or a bash straight away cuts it short (the springs carry it over)
  }
  // breathing and the stride move the guard a touch; at rest the weapon's never quite still
  if (!(W8.swing > 0) && !sh) {
    const run = Math.min(1, Math.hypot(P.vx || 0, P.vz || 0) / 3), ph = P.phase || 0;
    _maF.y += Math.sin(now * 1.7) * 0.006 + Math.abs(Math.cos(ph)) * 0.02 * run; _maF.x += Math.sin(ph) * 0.015 * run;
    _maW.x += Math.sin(now * 1.1 + 0.4) * 0.02 + Math.sin(ph) * 0.06 * run; _maW.z += Math.sin(now * 0.8) * 0.015; _maW.normalize();
  }
  // the springs, a few small steps a frame so the stiff ones stay steady
  if (rdt > 0) {
    const n = Math.ceil(rdt / (1 / 240)), h = rdt / n, S_ = MSPRING;
    for (let i = 0; i < n; i++) {
      MS.vF.addScaledVector(_maB.copy(MS.F).sub(_maF), -S_.F[0] * h).addScaledVector(MS.vF, -S_.F[1] * h); MS.F.addScaledVector(MS.vF, h);
      MS.vW.addScaledVector(_maB.copy(MS.W).sub(_maW), -S_.W[0] * h).addScaledVector(MS.vW, -S_.W[1] * h); MS.W.addScaledVector(MS.vW, h);
      for (const k of MBODY) { const sp = k === 'uy' || k === 'hy' ? S_.turn : k === 'step' || k === 'dip' ? S_.legs : S_.lean; springTo(MS.b, k, 'v' + k, _mTB[k], sp[0], sp[1], h); }
    }
  }
  return meleeSolve(MS.F, _maA.copy(MS.W).normalize(), _mSol);
}
