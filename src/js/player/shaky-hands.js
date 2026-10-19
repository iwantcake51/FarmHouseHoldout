// Shaky hands at low health: the arms tremble and the aim wanders.
//
// Below SHAKY_HP.from of your health it starts, and it gets worse the nearer you are to dying, all of it by
// SHAKY_HP.to. It eases in and out over a second or so, so a hit brings it on and a bandage settles it gradually.
// Two parts:
//  - the arms (and the weapon in them) tremble the way weak, hurt hands do: a very fine, quick tremor you barely see,
//    under a slower, heavier sway of arms that won't hold still (it grows faster than the tremor the nearer you are
//    to dying), and each heartbeat (ui/vitals.js) jolts them a little;
//  - the crosshair drifts slowly off the cursor and back, a lazy wander that never quite repeats, nudged by each
//    heartbeat too. Shots go where the drifted crosshair is (SHAKY.x/y feed the aim: player/movement.js,
//    weapons/firing.js), so you steer against it. Down the sights it's steadier (SHAKY_ADS)
const SHAKY_HP = { from: 0.3, to: 0.05 };
// the crosshair's wander at its worst (screen px at 1080 high, scaled with the window), and how hard a heartbeat kicks it
const SHAKY_SWAY = 30, SHAKY_BEAT = 55, SHAKY_ADS = 0.5;
// the arms' tremble at its worst: radians of pitch, yaw and roll on the weapon, metres it's moved (all of it, the fine
// tremor's share SHAKY_FINE and the slow sway's the rest; the heartbeat's thump SHAKY_THUMP of it)
const SHAKY_TREM = { p: 0.05, y: 0.045, r: 0.045, m: 0.008 }, SHAKY_FINE = 0.22, SHAKY_THUMP = 0.45;
const SHAKY = { k: 0, t: 0, x: 0, y: 0, bx: 0, by: 0, vbx: 0, vby: 0, lb: 0, thump: 0, ph: Array.from({ length: 12 }, () => rand() * 6.283) };
// the crosshair's own sway and recoil, on top of the wander (and like it, they move your aim: shots go where the
// crosshair is). Firing from the hip it sways slightly and slowly, a touch more on the move (XSWAY). Each shot kicks it
// (xhKick): out along your aim, away from you on the screen, with a little to the side, on a spring that brings it
// back. A gun firing a shot at a time kicks and eases home, quick and then slowing, never linear and never past the
// aim; a full automatic's kicks come too fast for that, so it jostles about the aim on a stiffer spring. How far: by
// the gun's power, less for every upgrade that tightens its spread (by as much as it tightens it), and down the
// sights less again, an automatic much less (XREC)
const XREC = { px: 20, side: 0.45, autoSide: 1.1, adsSemi: 0.5, adsAuto: 0.18, k: 120, d: 19, kAuto: 260, dAuto: 26 };
const XSWAY = { px: 2.6, move: 2.2 };
const XR = { x: 0, y: 0, vx: 0, vy: 0, autoT: 0, sx: 0, sy: 0, sk: 0 }, _xv = new V3();
function xhKick(D, id, pw, auto) {
  if (!hasMouse || tStick.R) return;
  const sp = D.spread * S.spreadMul * (aiming ? (D.aimK || 1) : (D.hipK || 1)), sp0 = (WEAP[id] || D).spread || sp;
  const tight = clamp(sp / Math.max(1e-4, sp0), 0.3, 1.2), ads = aiming ? (auto ? XREC.adsAuto : XREC.adsSemi) : 1;
  const amt = XREC.px * innerHeight / 1080 * Math.pow(pw, 0.7) * tight * ads;
  _xv.set(P.x, GUN_Y, P.z).project(cam);   // (out along your aim: from you on the screen toward the cursor)
  let dx = mouseX - (_xv.x + 1) / 2 * innerWidth, dy = mouseY - (1 - _xv.y) / 2 * innerHeight; const L = Math.hypot(dx, dy);
  if (L < 1) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
  const side = rr(-1, 1) * (auto ? XREC.autoSide : XREC.side), out = auto ? rr(0.4, 1) : rr(0.85, 1.1), v = amt * (auto ? 18 : 22);
  XR.vx += (dx * out - dy * side) * v; XR.vy += (dy * out + dx * side) * v; if (auto) XR.autoT = 0.3;
}
function updateXhRecoil(dt) {
  const auto = XR.autoT > 0; XR.autoT -= dt;
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) { springTo(XR, 'x', 'vx', 0, auto ? XREC.kAuto : XREC.k, auto ? XREC.dAuto : XREC.d, h); springTo(XR, 'y', 'vy', 0, auto ? XREC.kAuto : XREC.k, auto ? XREC.dAuto : XREC.d, h); }
  // the hip-fire sway: eased on with a gun up off the sights, off down them, with a melee weapon or at a station
  const D = W(curId()), want = state === 'play' && !P.dead && !aiming && !openSt && D && !D.melee ? 1 : 0;
  XR.sk += (want - XR.sk) * Math.min(1, dt * 3);
  const t = SHAKY.t, mv = Math.min(1, Math.hypot(P.vx, P.vz) / 3), amp = (XSWAY.px + XSWAY.move * mv) * innerHeight / 1080 * XR.sk;
  XR.sx = (Math.sin(t * 0.9 + 1.3) * 0.6 + Math.sin(t * 1.7 + 0.4) * 0.4) * amp; XR.sy = (Math.sin(t * 0.7 + 2.1) * 0.6 + Math.sin(t * 1.3 + 3.7) * 0.4) * amp;
}
// the aim on screen: where the cursor is, plus the wander, the sway and the kick
const aimSX = () => clamp(mouseX + SHAKY.x + XR.x + XR.sx, 0, innerWidth), aimSY = () => clamp(mouseY + SHAKY.y + XR.y + XR.sy, 0, innerHeight);
function updateShaky(dt) {
  const sk = SHAKY, hpF = P.hp / S.maxHp;
  const want = P.dead || state !== 'play' ? 0 : smooth(clamp((SHAKY_HP.from - hpF) / (SHAKY_HP.from - SHAKY_HP.to), 0, 1));
  sk.k += (want - sk.k) * Math.min(1, dt * 1.6);
  if (!(dt > 0)) return;
  sk.t += dt; updateXhRecoil(dt);
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
// the arms' tremble this frame, out of 1 on each axis (scaled by SHAKY_TREM where it's used): a fine tremor of a few
// quick rates (8 to 12 a second) beating against each other, so it stutters rather than buzzing evenly, small and much
// the same however hurt you are; under it a slow sway (a third of a second to two seconds a swing) that comes on
// harder the nearer you are to dying; and the heartbeat's thump. Steadier down the sights
const _trem = { p: 0, y: 0, r: 0, x: 0, h: 0 };
function shakyTremor() {
  const T_ = _trem, k = SHAKY.k;
  if (k < 0.002) { T_.p = T_.y = T_.r = T_.x = T_.h = 0; return T_; }
  const t = SHAKY.t, ph = SHAKY.ph, a = aiming ? 0.6 : 1, fine = SHAKY_FINE * Math.sqrt(k) * a, slow = (1 - SHAKY_FINE) * Math.pow(k, 1.4) * a, th = SHAKY.thump * SHAKY.thump * SHAKY_THUMP * k;
  const f = (a, b, c) => Math.sin(t * 52 + a) * 0.5 + Math.sin(t * 63 + b) * 0.3 + Math.sin(t * 75 + c) * 0.2;
  const s = (a, b, c) => Math.sin(t * 3.4 + a) * 0.5 + Math.sin(t * 7.3 + b) * 0.3 + Math.sin(t * 13.1 + c) * 0.2;
  const m = (a, b, c) => f(a, b, c) * fine + s(c, a, b) * slow;
  T_.p = m(ph[6], ph[7], ph[8]) - th * 0.8; T_.y = m(ph[9], ph[10], ph[11]); T_.r = m(ph[8], ph[6], ph[10]);
  T_.x = m(ph[11], ph[9], ph[7]); T_.h = m(ph[7], ph[11], ph[6]) + th * 0.6;
  return T_;
}
