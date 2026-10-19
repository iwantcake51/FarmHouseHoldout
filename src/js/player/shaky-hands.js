// Shaky hands at low health: the arms tremble and the aim wanders.
//
// Below SHAKY_HP.from of your health it starts, and it gets worse the nearer you are to dying, all of it by
// SHAKY_HP.to. It eases in and out over a second or so, so a hit brings it on and a bandage settles it gradually.
// Two parts:
//  - the arms (and the weapon in them) tremble: a fine, quick shake, like hands that won't keep still, and each
//    heartbeat (ui/vitals.js) jolts them a little;
//  - the crosshair drifts slowly off the cursor and back, a lazy wander that never quite repeats, nudged by each
//    heartbeat too. Shots go where the drifted crosshair is (SHAKY.x/y feed the aim: player/movement.js,
//    weapons/firing.js), so you steer against it. Down the sights it's steadier (SHAKY_ADS)
const SHAKY_HP = { from: 0.3, to: 0.05 };
// the crosshair's wander at its worst (screen px at 1080 high, scaled with the window), and how hard a heartbeat kicks it
const SHAKY_SWAY = 30, SHAKY_BEAT = 55, SHAKY_ADS = 0.5;
// the arms' tremble at its worst: radians of pitch, yaw and roll on the weapon, metres it's moved
const SHAKY_TREM = { p: 0.1, y: 0.09, r: 0.12, m: 0.018 };
const SHAKY = { k: 0, t: 0, x: 0, y: 0, bx: 0, by: 0, vbx: 0, vby: 0, lb: 0, thump: 0, ph: Array.from({ length: 12 }, () => rand() * 6.283) };
// the aim on screen: where the cursor is, plus the wander
const aimSX = () => mouseX + SHAKY.x, aimSY = () => mouseY + SHAKY.y;
function updateShaky(dt) {
  const sk = SHAKY, hpF = P.hp / S.maxHp;
  const want = P.dead || state !== 'play' ? 0 : smooth(clamp((SHAKY_HP.from - hpF) / (SHAKY_HP.from - SHAKY_HP.to), 0, 1));
  sk.k += (want - sk.k) * Math.min(1, dt * 1.6);
  if (!(dt > 0)) return;
  sk.t += dt;
  const t = sk.t, ph = sk.ph, k = sk.k;
  // each heartbeat (the R spike, ui/vitals.js): a little kick in a random direction, and a thump through the arms
  const from = beatT < sk.lb ? -1 : sk.lb;
  if (k > 0.01 && from < ECG_R && beatT >= ECG_R) { const a = rand() * 6.283; sk.vbx += Math.cos(a) * SHAKY_BEAT * k; sk.vby += Math.sin(a) * SHAKY_BEAT * k; sk.thump = 1; }
  sk.lb = beatT; sk.thump = Math.max(0, sk.thump - dt * 7);
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) { springTo(sk, 'bx', 'vbx', 0, 60, 9, h); springTo(sk, 'by', 'vby', 0, 60, 9, h); }
  // the wander: three slow swells on each axis at odd rates, so it never settles into a pattern
  const wx = Math.sin(t * 0.83 + ph[0]) * 0.55 + Math.sin(t * 1.37 + ph[1]) * 0.3 + Math.sin(t * 2.11 + ph[2]) * 0.15;
  const wy = Math.sin(t * 0.71 + ph[3]) * 0.55 + Math.sin(t * 1.53 + ph[4]) * 0.3 + Math.sin(t * 2.39 + ph[5]) * 0.15;
  const amp = SHAKY_SWAY * innerHeight / 1080 * k * (aiming ? SHAKY_ADS : 1);
  sk.x = clamp(wx * amp + sk.bx, -mouseX, innerWidth - mouseX);
  sk.y = clamp(wy * amp + sk.by, -mouseY, innerHeight - mouseY);
}
// the arms' tremble this frame, out of 1 on each axis (scaled by SHAKY_TREM where it's used): a fast shake made of a
// few quick rates that beat against each other, so it stutters rather than buzzing evenly, plus the heartbeat's thump
const _trem = { p: 0, y: 0, r: 0, x: 0, h: 0 };
function shakyTremor() {
  const T_ = _trem, k = SHAKY.k;
  if (k < 0.002) { T_.p = T_.y = T_.r = T_.x = T_.h = 0; return T_; }
  const t = SHAKY.t, ph = SHAKY.ph, q = k * (aiming ? 0.6 : 1), th = SHAKY.thump * SHAKY.thump;
  const f = (a, b, c) => Math.sin(t * 47 + a) * 0.5 + Math.sin(t * 61 + b) * 0.3 + Math.sin(t * 79 + c) * 0.2;
  T_.p = (f(ph[6], ph[7], ph[8]) - th * 0.8) * q; T_.y = f(ph[9], ph[10], ph[11]) * q; T_.r = f(ph[8], ph[6], ph[10]) * q;
  T_.x = f(ph[11], ph[9], ph[7]) * q; T_.h = (f(ph[7], ph[11], ph[6]) + th * 0.6) * q;
  return T_;
}
