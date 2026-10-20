// Shaky hands at low health: the arms tremble and the aim wanders.
//
// Below SHAKY_HP.from of your health it starts, and it gets worse the nearer you are to dying, all of it by
// SHAKY_HP.to. It eases in and out over a second or so, so a hit brings it on and a bandage settles it gradually.
// Two parts:
//  - the arms (and the weapon in them) won't hold still: a slow, heavy unsteadiness, never a quick shake, that grows
//    the nearer you are to dying, and each heartbeat (ui/vitals.js) swells through them, a soft push, not a jolt;
//  - the crosshair drifts slowly off the cursor and back, a lazy wander that never quite repeats, nudged by each
//    heartbeat too. Shots go where the drifted crosshair is (SHAKY.x/y feed the aim: player/movement.js,
//    weapons/firing.js), so you steer against it. Down the sights it's steadier (SHAKY_ADS)
const SHAKY_HP = { from: 0.3, to: 0.05 };
// the crosshair's wander at its worst (screen px at 1080 high, scaled with the window), and how hard a heartbeat kicks it
const SHAKY_SWAY = 30, SHAKY_BEAT = 26, SHAKY_ADS = 0.5;
// the arms' unsteadiness at its worst: radians of pitch, yaw and roll on the weapon, metres it's moved; how much of that
// a heartbeat's swell is (SHAKY_THUMP) and how long it takes, rising and falling (SHAKY_PULSE, seconds)
const SHAKY_TREM = { p: 0.05, y: 0.045, r: 0.045, m: 0.008 }, SHAKY_THUMP = 0.3, SHAKY_PULSE = 0.32, SHAKY_AIM_EASE = 7;
const SHAKY = { ak: 0, k: 0, t: 0, x: 0, y: 0, bx: 0, by: 0, vbx: 0, vby: 0, lb: 0, thump: 0, thumpT: 9, ph: Array.from({ length: 12 }, () => rand() * 6.283) };
// the crosshair's own sway and recoil, on top of the wander (and like it, they move your aim: shots go where the
// crosshair is). It sways slightly and slowly, a touch more on the move, a little down the sights (XSWAY), more with an
// unsteady gun (XSTEADY) and the harder you're breathing (XWORK). Each shot kicks it
// (xhKick): out along your aim, away from you on the screen, with a little to the side, on a spring that brings it
// back. A gun firing a shot at a time kicks and eases home, quick and then slowing, never linear and never past the
// aim; a full automatic's kicks come too fast for that, so it jostles about the aim on a stiffer spring. How far: by
// the gun's power, less for every upgrade that tightens its spread (by as much as it tightens it), and down the
// sights less again, an automatic much less (XREC). A full automatic kicks it far harder (autoK), and its upgrades only
// take so much of that off (autoTight: the least of it they leave); a gun that kicks harder from the hip than down
// the sights says how much (its hipKick, weapons/gun-stats.js: the LMG)
const XREC = { px: 20, side: 0.45, autoSide: 1.1, adsSemi: 0.5, adsAuto: 0.18, k: 120, d: 19, kAuto: 260, dAuto: 26, autoK: 2.3, autoTight: 0.7 };
// a full automatic's recoil is worked out shot by shot as the spray goes on, not all there from the first round
// (XAUTO): each kick starts at from of its full size and builds to it over build rounds; for the first sideFrom rounds
// it climbs nearly straight out along the aim (climb a round, up to climbMax rounds' worth), then it starts swaying
// side to side, a slow swing one way and back (sway: how far, in the round's own kick; swing: how far round it goes
// each round, so a few rounds a swing, one way first, picked as the spray starts), never just pulling one way. A
// smaller round kicks less all through (cal); a gun can keep its sideways down (its sideK, weapons/gun-stats.js: the
// LMG climbs rather than swings). Let go and it all comes back to the cursor smoothly (back: how quickly). The walk is
// eased to (ease), so it glides rather than stepping with each round
const XAUTO = { from: 0.3, build: 14, sideFrom: 7, sway: 2.2, swing: 0.38, climb: 0.12, climbMax: 10, jit: 0.35, ease: 10, back: 3, cal: { p9: 0.55, magnum: 0.8, rifle: 1, shells: 1.1 } };
const XDRIFT = { max: 120, adsMax: 0.35 };   // (the furthest a spray walks the aim, px at 1080 high; down the sights adsMax of that)
const XSWAY = { px: 2.6, move: 2.2, ads: 0.35 };
// how unsteady a gun is in the hands, times the sway: a sidearm with nothing to brace it on the most (a magnum more
// again), a pair of them, a heavy gun; one with a shoulder stock, or a long gun, the least (XSTEADY)
const XSTEADY = { side: 2.1, magnum: 1.2, stock: 0.95, pair: 2.3, heavy: 2, auto: 1.1, long: 1 };
function gunUnsteady(D, id) {
  if (D.akimbo) return XSTEADY.pair;
  if (D.heavy) return XSTEADY.heavy;
  if (D.slot === 'side') return stocked(id) ? XSTEADY.stock : XSTEADY.side * (D.ammo === 'magnum' ? XSTEADY.magnum : 1);
  return D.slot === 'auto' ? XSTEADY.auto : XSTEADY.long;
}
// and how hard you're breathing: winded (as your stamina runs down), at a sprint and for a while after (fade, s), over
// a vault and just after. Each adds that much again to the sway (times it), which also quickens and takes on the heave
// of your breathing (breath: radians a second at rest, and more winded); it all eases in and out (ease), never snaps
// (a climb's share fades in at vIn and out at vOut a second; how much you're moving eases at mvEase)
const XWORK = { stam: 1.5, sprint: 2.2, run: 1.7, fade: 1.8, vault: 2.4, ease: 2.2, breath: 1.7, breathUp: 2.4, heave: 0.9, vIn: 5, vOut: 1.6, mvEase: 4 };
const XR = { x: 0, y: 0, vx: 0, vy: 0, autoT: 0, n: 0, dir: 1, swp: 0, tx: 0, ty: 0, dx: 0, dy: 0, sx: 0, sy: 0, sk: 0, un: 0, post: 0, t: 0, bt: 0 }, _xv = new V3();
function xhKick(D, id, pw, auto) {
  if (!hasMouse || tStick.R) return;
  const sp = D.spread * S.spreadMul * (aiming ? (D.aimK || 1) : (D.hipK || 1)), sp0 = (WEAP[id] || D).spread || sp;
  const tight = clamp(sp / Math.max(1e-4, sp0), auto ? XREC.autoTight : 0.3, 1.2), ads = aiming ? (auto ? XREC.adsAuto : XREC.adsSemi) : (D.hipKick || 1);
  const amt = XREC.px * innerHeight / 1080 * Math.pow(pw, 0.7) * tight * ads * (auto ? XREC.autoK : 1);
  _xv.set(P.x, GUN_Y, P.z).project(cam);   // (out along your aim: from you on the screen toward the cursor)
  let dx = mouseX - (_xv.x + 1) / 2 * innerWidth, dy = mouseY - (1 - _xv.y) / 2 * innerHeight; const L = Math.hypot(dx, dy);
  if (L < 1) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
  if (!auto) {   // (a shot at a time: kicked out along the aim and a little aside, and eased home)
    const side = rr(-1, 1) * XREC.side, out = rr(0.85, 1.1), v = amt * 22;
    XR.vx += (dx * out - dy * side) * v; XR.vy += (dy * out + dx * side) * v; return;
  }
  const A = XAUTO;
  if (!(XR.autoT > 0)) { XR.n = 0; XR.dir = rand() < 0.5 ? -1 : 1; XR.swp = 0; }
  const n = ++XR.n, k = amt * mix(A.from, 1, smooth(Math.min(1, (n - 1) / A.build))) * (A.cal[D.ammo] ?? 1), sideK = D.sideK ?? 1;
  const side = rr(-1, 1) * XREC.autoSide * A.jit * sideK, out = rr(0.5, 1), v = k * 18;
  XR.vx += (dx * out - dy * side) * v; XR.vy += (dy * out + dx * side) * v; XR.autoT = 0.3;
  // where the spray's taken the aim so far: the climb, and past sideFrom rounds the swing side to side
  const swayOn = smooth(clamp((n - A.sideFrom) / 5, 0, 1));
  if (n > A.sideFrom) XR.swp += A.swing * rr(0.75, 1.25);
  const sw = XR.dir * Math.sin(XR.swp) * A.sway * k * swayOn * sideK, cl = Math.min(n, A.climbMax) * A.climb * k;
  let tx = -dy * sw + dx * cl, ty = dx * sw + dy * cl;
  const L2 = Math.hypot(tx, ty), cap = XDRIFT.max * innerHeight / 1080 * mix(1, XDRIFT.adsMax, SHAKY.ak); if (L2 > cap) { tx *= cap / L2; ty *= cap / L2; }
  XR.tx = tx; XR.ty = ty;
}
function updateXhRecoil(dt) {
  const auto = XR.autoT > 0; XR.autoT -= dt;
  // the walk a spray takes the aim on (XAUTO) is glided to as it goes, and back to the cursor once you let go
  if (auto) { const f = 1 - Math.exp(-dt * XAUTO.ease); XR.dx += (XR.tx - XR.dx) * f; XR.dy += (XR.ty - XR.dy) * f; }
  else { const f = Math.exp(-dt * XAUTO.back); XR.dx *= f; XR.dy *= f; }
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) { springTo(XR, 'x', 'vx', 0, auto ? XREC.kAuto : XREC.k, auto ? XREC.dAuto : XREC.d, h); springTo(XR, 'y', 'vy', 0, auto ? XREC.kAuto : XREC.k, auto ? XREC.dAuto : XREC.d, h); }
  // the sway: eased on with a gun up, a little of it down the sights (XSWAY.ads), off with a melee weapon or at a station
  const D = W(curId()), want = state === 'play' && !P.dead && !openSt && D && !D.melee ? (aiming ? XSWAY.ads : 1) : 0;
  XR.sk += (want - XR.sk) * Math.min(1, dt * 3);
  // how out of breath you are (XWORK)
  XR.post = P.sprint ? 1 : Math.max(0, XR.post - dt / XWORK.fade);
  // a climb's own sway eases in as you go over and out after you land (XWORK.vIn, vOut: a second), never all at once
  const vault = P.vault || (ANIM.postVault || 0) > 0 ? 1 : 0;
  XR.vk = (XR.vk || 0) + (vault - (XR.vk || 0)) * Math.min(1, dt * (vault > (XR.vk || 0) ? XWORK.vIn : XWORK.vOut));
  const work = Math.max(Math.pow(clamp(1 - P.stam, 0, 1), 1.3) * XWORK.stam, P.sprint ? XWORK.sprint : smooth(XR.post) * XWORK.run, smooth(XR.vk) * XWORK.vault);
  XR.un += (work - XR.un) * Math.min(1, dt * XWORK.ease);
  XR.t += dt * (1 + 0.45 * XR.un); XR.bt += dt * (XWORK.breath + XWORK.breathUp * Math.min(1, XR.un / 2));
  // (how much you're moving, eased both ways: a climb counts as moving, though it carries you without a velocity, so
  // the sway doesn't drop away the moment you go over and jump back as you land)
  XR.mv = (XR.mv || 0) + ((P.vault ? 1 : Math.min(1, Math.hypot(P.vx, P.vz) / 3)) - (XR.mv || 0)) * Math.min(1, dt * XWORK.mvEase);
  const t = XR.t, mv = XR.mv, amp = (XSWAY.px + XSWAY.move * mv) * innerHeight / 1080 * XR.sk * (D && !D.melee ? gunUnsteady(D, curId()) : 1) * (1 + XR.un);
  const heave = Math.sin(XR.bt) * amp * XWORK.heave * Math.min(1, XR.un);   // (the chest rising and falling)
  XR.sx = (Math.sin(t * 0.9 + 1.3) * 0.6 + Math.sin(t * 1.7 + 0.4) * 0.4) * amp; XR.sy = (Math.sin(t * 0.7 + 2.1) * 0.6 + Math.sin(t * 1.3 + 3.7) * 0.4) * amp + heave;
}
// the aim on screen: where the cursor is, plus the wander, the sway and the kick
const aimSX = () => clamp(mouseX + SHAKY.x + XR.x + XR.sx + XR.dx, 0, innerWidth), aimSY = () => clamp(mouseY + SHAKY.y + XR.y + XR.sy + XR.dy, 0, innerHeight);
function updateShaky(dt) {
  const sk = SHAKY, hpF = P.hp / S.maxHp;
  const want = P.dead || state !== 'play' ? 0 : smooth(clamp((SHAKY_HP.from - hpF) / (SHAKY_HP.from - SHAKY_HP.to), 0, 1));
  sk.k += (want - sk.k) * Math.min(1, dt * 1.6);
  // how far down the sights you are, eased, so what's steadier there (the wander, the tremor, how far a spray can walk
  // the aim) shrinks to it smoothly as you aim and grows back as you let go: the crosshair glides, never jumps
  sk.ak += ((aiming ? 1 : 0) - sk.ak) * Math.min(1, dt * SHAKY_AIM_EASE);
  if (!(dt > 0)) return;
  sk.t += dt; updateXhRecoil(dt);
  const t = sk.t, ph = sk.ph, k = sk.k;
  // each heartbeat (the R spike, ui/vitals.js): a little kick in a random direction, and a thump through the arms
  const from = beatT < sk.lb ? -1 : sk.lb;
  if (k > 0.01 && from < ECG_R && beatT >= ECG_R) { const a = rand() * 6.283; sk.vbx += Math.cos(a) * SHAKY_BEAT * k; sk.vby += Math.sin(a) * SHAKY_BEAT * k; sk.thumpT = 0; }
  // (each beat a smooth swell through the arms, up and away again over SHAKY_PULSE)
  sk.lb = beatT; sk.thumpT += dt; sk.thump = sk.thumpT < SHAKY_PULSE ? Math.pow(Math.sin(Math.PI * sk.thumpT / SHAKY_PULSE), 2) : 0;
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) { springTo(sk, 'bx', 'vbx', 0, 30, 8, h); springTo(sk, 'by', 'vby', 0, 30, 8, h); }
  // the wander: three slow swells on each axis at odd rates, so it never settles into a pattern
  const wx = Math.sin(t * 0.83 + ph[0]) * 0.55 + Math.sin(t * 1.37 + ph[1]) * 0.3 + Math.sin(t * 2.11 + ph[2]) * 0.15;
  const wy = Math.sin(t * 0.71 + ph[3]) * 0.55 + Math.sin(t * 1.53 + ph[4]) * 0.3 + Math.sin(t * 2.39 + ph[5]) * 0.15;
  const amp = SHAKY_SWAY * innerHeight / 1080 * k * mix(1, SHAKY_ADS, sk.ak);
  sk.x = clamp(wx * amp + sk.bx, -mouseX, innerWidth - mouseX);
  sk.y = clamp(wy * amp + sk.by, -mouseY, innerHeight - mouseY);
}
// the arms' unsteadiness this frame, out of 1 on each axis (scaled by SHAKY_TREM where it's used): slow swells (from
// about one every three seconds to one a second) beating against each other, so it wanders heavily and never repeats or
// buzzes, coming on harder the nearer you are to dying; and the heartbeat's swell through it. Steadier down the sights
const _trem = { p: 0, y: 0, r: 0, x: 0, h: 0 };
function shakyTremor() {
  const T_ = _trem, k = SHAKY.k;
  if (k < 0.002) { T_.p = T_.y = T_.r = T_.x = T_.h = 0; return T_; }
  const t = SHAKY.t, ph = SHAKY.ph, amp = Math.pow(k, 1.25) * mix(1, 0.6, SHAKY.ak), th = SHAKY.thump * SHAKY_THUMP * k;
  const m = (a, b, c) => (Math.sin(t * 1.9 + a) * 0.5 + Math.sin(t * 4.1 + b) * 0.32 + Math.sin(t * 7.3 + c) * 0.18) * amp;
  T_.p = m(ph[6], ph[7], ph[8]) - th * 0.8; T_.y = m(ph[9], ph[10], ph[11]); T_.r = m(ph[8], ph[6], ph[10]);
  T_.x = m(ph[11], ph[9], ph[7]); T_.h = m(ph[7], ph[11], ph[6]) + th * 0.6;
  return T_;
}
