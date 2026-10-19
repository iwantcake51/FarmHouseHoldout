// Shaky hands at low health: the arms tremble and the aim wanders.
//
// Below SHAKY_HP.from of your health it starts, and it gets worse the nearer you are to dying, all of it by
// SHAKY_HP.to. It eases in and out over a second or so, so a hit brings it on and a bandage settles it gradually.
// Two parts:
//  - the arms (and the weapon in them) tremble, a few unsteady shakes a second like hands that won't keep still, and each
//    heartbeat (ui/vitals.js) nudges them a little;
//  - the crosshair drifts slowly off the cursor and back, a lazy wander that never quite repeats, nudged by each
//    heartbeat too. Shots go where the drifted crosshair is (SHAKY.x/y feed the aim: player/movement.js,
//    weapons/firing.js), so you steer against it. Down the sights it's steadier (SHAKY_ADS)
const SHAKY_HP = { from: 0.3, to: 0.05 };
// the crosshair's wander at its worst (screen px at 1080 high, scaled with the window), and how hard a heartbeat kicks it
const SHAKY_SWAY = 30, SHAKY_BEAT = 55, SHAKY_ADS = 0.5;
// the arms' tremble at its worst: radians of pitch, yaw and roll on the weapon, metres it's moved
const SHAKY_TREM = { p: 0.06, y: 0.05, r: 0.07, m: 0.01 };
// how the tremble moves: each axis is a loose spring (TREM_K stiff, TREM_D damped, about 3 shakes a second) chasing
// a new random spot every TREM_HOLD seconds or so, stepped at 120 Hz whatever the frame rate, so it's one smooth
// motion that looks the same at 30 fps as at 144 (never a fast flicker sampled differently every frame), and a
// heartbeat knocks it with a push (TREM_BEAT), not a jump
const TREM_K = 900, TREM_D = 24, TREM_HOLD = [0.06, 0.11], TREM_BEAT = 7;
const SHAKY = { k: 0, ads: 0, t: 0, x: 0, y: 0, bx: 0, by: 0, vbx: 0, vby: 0, lb: 0, ph: Array.from({ length: 6 }, () => rand() * 6.283) };
const TREM_AX = ['p', 'y', 'r', 'x', 'h'], TREM = { hold: 0 };
TREM_AX.forEach(a => { TREM[a] = 0; TREM['v' + a] = 0; TREM['g' + a] = 0; });
// the aim on screen: where the cursor is, plus the wander
const aimSX = () => mouseX + SHAKY.x, aimSY = () => mouseY + SHAKY.y;
function updateShaky(dt) {
  const sk = SHAKY, hpF = P.hp / S.maxHp;
  const want = P.dead || state !== 'play' ? 0 : smooth(clamp((SHAKY_HP.from - hpF) / (SHAKY_HP.from - SHAKY_HP.to), 0, 1));
  sk.k += (want - sk.k) * Math.min(1, dt * 1.6);
  sk.ads += ((aiming ? 1 : 0) - sk.ads) * Math.min(1, dt * 8);   // steadying as you bring the sights up, not in one frame
  if (!(dt > 0)) return;
  sk.t += dt;
  const t = sk.t, ph = sk.ph, k = sk.k;
  // each heartbeat (the R spike, ui/vitals.js): a little kick in a random direction, and a push through the arms
  const from = beatT < sk.lb ? -1 : sk.lb;
  if (k > 0.01 && from < ECG_R && beatT >= ECG_R) { const a = rand() * 6.283; sk.vbx += Math.cos(a) * SHAKY_BEAT * k; sk.vby += Math.sin(a) * SHAKY_BEAT * k; TREM.vp -= TREM_BEAT; TREM.vh += TREM_BEAT * 0.7; }
  sk.lb = beatT;
  // the tremble's springs; each time its hold runs out it picks a new spot to shake toward on every axis
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) {
    springTo(sk, 'bx', 'vbx', 0, 60, 9, h); springTo(sk, 'by', 'vby', 0, 60, 9, h);
    if ((TREM.hold -= h) <= 0) { TREM.hold = rr(TREM_HOLD[0], TREM_HOLD[1]); TREM_AX.forEach(a => { TREM['g' + a] = rr(-1, 1); }); }
    TREM_AX.forEach(a => springTo(TREM, a, 'v' + a, TREM['g' + a], TREM_K, TREM_D, h));
  }
  // the wander: three slow swells on each axis at odd rates, so it never settles into a pattern
  const wx = Math.sin(t * 0.83 + ph[0]) * 0.55 + Math.sin(t * 1.37 + ph[1]) * 0.3 + Math.sin(t * 2.11 + ph[2]) * 0.15;
  const wy = Math.sin(t * 0.71 + ph[3]) * 0.55 + Math.sin(t * 1.53 + ph[4]) * 0.3 + Math.sin(t * 2.39 + ph[5]) * 0.15;
  const amp = SHAKY_SWAY * innerHeight / 1080 * k * (1 - (1 - SHAKY_ADS) * sk.ads);
  sk.x = clamp(wx * amp + sk.bx, -mouseX, innerWidth - mouseX);
  sk.y = clamp(wy * amp + sk.by, -mouseY, innerHeight - mouseY);
}
// the arms' tremble this frame, out of about 1 on each axis (scaled by SHAKY_TREM where it's used), as strong as your
// health makes it and a little steadier down the sights
const _trem = { p: 0, y: 0, r: 0, x: 0, h: 0 };
function shakyTremor() {
  const q = SHAKY.k < 0.002 ? 0 : SHAKY.k * (1 - 0.4 * SHAKY.ads);
  TREM_AX.forEach(a => { _trem[a] = TREM[a] * q; });
  return _trem;
}
