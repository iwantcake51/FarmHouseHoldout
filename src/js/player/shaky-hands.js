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
import { cam, GUN_Y, V3 } from '../core/renderer.js';
import { clamp, mix, rand, rr, smooth } from '../core/math.js';
import { P } from './player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { modLv, modsOff } from '../weapons/mod-levels.js';
import { curId, gunTier, hpCap, S, W, W8 } from '../game/run-state.js';
import { openSt } from '../stations/station-ui.js';
import { state } from '../game/state.js';
import { hasMouse, mouseX, mouseY } from '../input/keyboard-mouse.js';
import { aiming } from './aiming.js';
import { tStick } from '../input/touch.js';
import { HANDGUN, settleK, stocked, unshouldered } from '../weapons/firing.js';
import { springTo } from '../game/camera.js';
import { beatT, ECG_R } from '../ui/vitals.js';
import { ANIM } from './animation.js';

const SHAKY_HP = { from: 0.3, to: 0.05 };
// the crosshair's wander at its worst (screen px at 1080 high, scaled with the window), and how hard a heartbeat kicks it
const SHAKY_SWAY = 30, SHAKY_BEAT = 26, SHAKY_ADS = 0.5;
// the arms' tremble at its worst: radians of pitch, yaw and roll on the weapon, metres it's moved
export const SHAKY_TREM = { p: 0.06, y: 0.05, r: 0.07, m: 0.01 }, SHAKY_AIM_EASE = 7;
// how the tremble moves: each axis is a loose spring (TREM_K stiff, TREM_D damped, about 3 shakes a second) chasing
// a new random spot every TREM_HOLD seconds or so, stepped at 120 Hz whatever the frame rate, so it's one smooth
// motion that looks the same at 30 fps as at 144 (never a fast flicker sampled differently every frame), and a
// heartbeat knocks it with a push (TREM_BEAT), not a jump
const TREM_K = 900, TREM_D = 24, TREM_HOLD = [0.06, 0.11], TREM_BEAT = 7;
export const SHAKY = { ak: 0, k: 0, t: 0, x: 0, y: 0, bx: 0, by: 0, vbx: 0, vby: 0, lb: 0, ph: Array.from({ length: 6 }, () => rand() * 6.283) };
const TREM_AX = ['p', 'y', 'r', 'x', 'h'], TREM = { hold: 0 };
TREM_AX.forEach(a => { TREM[a] = 0; TREM['v' + a] = 0; TREM['g' + a] = 0; });
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
const XREC = { px: 20, side: 0.45, autoSide: 0.6, adsSemi: 0.5, adsAuto: 0.18, k: 120, d: 19, kAuto: 260, dAuto: 26, autoK: 2.3, autoTight: 0.7 };
// a full automatic's recoil is worked out shot by shot as the spray goes on, not all there from the first round
// (XAUTO): each kick starts at from of its full size and builds to it over build rounds; for the first sideFrom rounds
// it climbs nearly straight out along the aim (climb a round, up to climbMax rounds' worth), then it starts swaying
// side to side, a slow swing one way and back (sway: how far, in the round's own kick; swing: how far round it goes
// each round, so a few rounds a swing, one way first, picked as the spray starts), never just pulling one way. A
// smaller round kicks less all through (cal); a gun can keep its sideways down (its sideK, weapons/gun-stats.js: the
// LMG climbs rather than swings). Let go and it all comes back to the cursor smoothly, on a spring (back: how quickly). The walk is
// eased to (ease), so it glides rather than stepping with each round
const XAUTO = { from: 0.3, build: 14, sideFrom: 7, sway: 1.1, swing: 0.38, climb: 0.12, climbMax: 10, jit: 0.35, ease: 10, back: 4.5, cal: { p9: 0.55, p10: 0.75, magnum: 0.8, rifle: 1, shells: 1.1 } };
const XDRIFT = { max: 120, adsMax: 0.35 };   // (the furthest a spray walks the aim, px at 1080 high; down the sights adsMax of that)
const XSWAY = { px: 2.6, move: 1.3, ads: 0.35 };
// how unsteady a gun is in the hands, times the sway: a sidearm with nothing to brace it on the most (a magnum more
// again), a pair of them, a heavy gun; one with a shoulder stock, or a long gun, the least (XSTEADY)
const XSTEADY = { side: 2.1, magnum: 1.2, stock: 0.95, pair: 2.3, heavy: 2, auto: 1.1, long: 1 };
export function gunUnsteady(D, id) {
  if (D.akimbo) return XSTEADY.pair;
  if (D.heavy) return XSTEADY.heavy * frontHeavy(id);
  if (D.slot === 'side') return (stocked(id) ? XSTEADY.stock : XSTEADY.side * (D.ammo === 'magnum' ? XSTEADY.magnum : 1)) * frontHeavy(id);
  return (D.slot === 'auto' ? XSTEADY.auto : XSTEADY.long) * frontHeavy(id);
}
// weight out toward the muzzle makes a gun harder to hold still: each thing hung on the front adds its share to the sway
// (FRONT: by attachment tier, the AR's bigger mags too; FRONT_MOD: a gun's own mods, a longer barrel by its level)
export const FRONT = { laser: [0, 0.05, 0.07], light: [0, 0.05, 0.07], supp: [0, 0.07, 0.09, 0.11], choke: [0, 0.03, 0.05], arMag: [0, 0.04, 0.07, 0.1] };
export const FRONT_MOD = { match: 0.05, longbarrel: 0.05, comp: 0.04, ported: 0.03, heavy: 0.08, gl: 0.1, bipod: 0.06 };
function frontHeavy(id) {
  if (!id) return 1;
  let k = 1;
  for (const a of ['laser', 'light', 'supp', 'choke']) k += FRONT[a][gunTier(id, a)] || 0;
  if (id === 'ar') k += FRONT.arMag[gunTier(id, 'mag')] || 0;
  const off = modsOff(id);
  for (const m of W8.mods[id] || []) if (FRONT_MOD[m] && !off.includes(m)) k += FRONT_MOD[m] * (m === 'longbarrel' ? modLv(m) : 1);
  return k;
}
// and how hard you're breathing: winded (as your stamina runs down), at a sprint and for a while after (fade, s), over
// a vault and just after. Each adds that much again to the sway (times it), which also quickens and takes on the heave
// of your breathing (breath: radians a second at rest, and more winded); it all eases in and out (ease), never snaps
// (a climb's share fades in at vIn and out at vOut a second; how much you're moving eases at mvEase)
const XWORK = { stam: 1.5, sprint: 2.2, run: 1.7, fade: 1.8, vault: 2.4, ease: 2.2, breath: 1.7, breathUp: 2.4, heave: 0.9, vIn: 5, vOut: 1.6, mvEase: 4 };
// a blow you take knocks the crosshair too (xhHit): flung away from what hit you, on the same spring a shot kicks it
// on, so it swings off and eases home and adds into whatever recoil and sway it's already got (px: how far for an
// ordinary hit, more for a heavier one up to max times; side: how much it's thrown aside as well), and for a moment
// you're unsteady: the spread opens up (spread: how much wider at most) and the sway grows (sway: how much more), both
// coming on over a moment and easing off again (rise, fall: how quick), never snapping
export const XHIT = { px: 34, max: 2.2, side: 0.5, spread: 0.6, sway: 1.6, rise: 14, fall: 1.6 };
// each footfall jolts the aim a little (xhStep, from player/movement.js): down and a touch aside, on a quick stiff
// spring (STEP: its size in px at 1080 high, how much aside, its frequency and damping), and between footfalls the aim
// swings with the stride (side: across with each step, bob: a dip as each foot lands), so moving looks like it's
// carried by your steps rather than drifting on its own
const STEP = { px: 3.4, side: 0.45, f: 5.5, z: 0.42, swing: 1.6, bob: 1.8 };
export function xhStep(k) {
  if (!(XR.sk > 0.01)) return;
  const D = W(curId()), a = STEP.px * innerHeight / 1080 * k * XR.sk * (D && !D.melee ? 0.6 + 0.4 * gunUnsteady(D, curId()) : 1) * 60;
  XR.vfy += a * rr(0.85, 1.1); XR.vfx += a * STEP.side * rr(-1, 1);
}
export const XR = { fx: 0, fy: 0, vfx: 0, vfy: 0, x: 0, y: 0, vx: 0, vy: 0, vdx: 0, vdy: 0, c: 1, hb: 0, hbT: 0, autoT: 0, n: 0, dir: 1, swp: 0, tx: 0, ty: 0, dx: 0, dy: 0, sx: 0, sy: 0, sk: 0, un: 0, post: 0, t: 0, bt: 0 }, _xv = new V3();
export function xhKick(D, id, pw, auto) {
  if (!hasMouse || tStick.R) return;
  const sp = D.spread * S.spreadMul * (aiming ? (D.aimK || 1) : (D.hipK || 1)), sp0 = (WEAP[id] || D).spread || sp;
  const tight = clamp(sp / Math.max(1e-4, sp0), auto ? XREC.autoTight : 0.3, 1.2), ads = aiming ? (auto ? XREC.adsAuto : XREC.adsSemi) : (D.hipKick || 1);
  const amt = XREC.px * innerHeight / 1080 * Math.pow(pw, 0.7) * tight * ads * (auto ? XREC.autoK : 1);
  _xv.set(P.x, GUN_Y, P.z).project(cam);   // (out along your aim: from you on the screen toward the cursor)
  let dx = mouseX - (_xv.x + 1) / 2 * innerWidth, dy = mouseY - (1 - _xv.y) / 2 * innerHeight; const L = Math.hypot(dx, dy);
  if (L < 1) { dx = 0; dy = -1; } else { dx /= L; dy /= L; }
  XR.c = Math.pow(settleK(D), 0.7);   // (how quickly it comes home: slower for a heavier round, SETTLE)
  if (!auto) {   // (a shot at a time: kicked out along the aim and a little aside, and eased home; harder as a sidearm's spray builds, HANDGUN)
    const side = rr(-1, 1) * XREC.side, out = rr(0.85, 1.1), v = amt * 22 * (unshouldered(D, id) ? 1 + HANDGUN.kick * (W8.spray || 0) : 1);
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
export function xhHit(x, z, amount) {
  const k = clamp(amount || 1, 0.1, XHIT.max);
  XR.hbT = Math.min(1, XR.hbT + 0.45 * k);
  if (!hasMouse || tStick.R) return;
  _xv.set(P.x, 1, P.z).project(cam); const px = (_xv.x + 1) / 2 * innerWidth, py = (1 - _xv.y) / 2 * innerHeight;
  _xv.set(x, 1, z).project(cam); let dx = px - (_xv.x + 1) / 2 * innerWidth, dy = py - (1 - _xv.y) / 2 * innerHeight; const L = Math.hypot(dx, dy);
  if (L < 1) { const a = rand() * 6.283; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= L; dy /= L; }   // (away from it on the screen)
  const side = rr(-1, 1) * XHIT.side, v = XHIT.px * innerHeight / 1080 * k * rr(0.85, 1.15) * 22 * (aiming ? 0.6 : 1);
  XR.vx += (dx - dy * side) * v; XR.vy += (dy + dx * side) * v;
}
function updateXhRecoil(dt) {
  // how shaken you are by a blow (XHIT): eased on and off
  XR.hbT *= Math.exp(-dt * XHIT.fall); XR.hb += (XR.hbT - XR.hb) * Math.min(1, dt * XHIT.rise);
  const auto = XR.autoT > 0; XR.autoT -= dt;
  // the walk a spray takes the aim on (XAUTO) is glided to as it goes, and back to the cursor once you let go
  // (let go, it's carried on by how it was moving and drawn home on a critically damped spring: it eases out of the
  // spray's motion, gathers pace and slows into the cursor, never a constant slide or a stop at the end; a heavier
  // round's more slowly, XR.c)
  const c = XR.c || 1, wb = XAUTO.back * c;
  if (auto) { const f = 1 - Math.exp(-dt * XAUTO.ease), nx = XR.dx + (XR.tx - XR.dx) * f, ny = XR.dy + (XR.ty - XR.dy) * f; XR.vdx = (nx - XR.dx) / Math.max(dt, 1e-4); XR.vdy = (ny - XR.dy) / Math.max(dt, 1e-4); XR.dx = nx; XR.dy = ny; }
  const ks = auto ? XREC.kAuto : XREC.k * c * c, ds = auto ? XREC.dAuto : XREC.d * c;
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) {
    springTo(XR, 'x', 'vx', 0, ks, ds, h); springTo(XR, 'y', 'vy', 0, ks, ds, h);
    if (!auto) { springTo(XR, 'dx', 'vdx', 0, wb * wb, 2 * wb, h); springTo(XR, 'dy', 'vdy', 0, wb * wb, 2 * wb, h); }
    const sw = 6.2832 * STEP.f; springTo(XR, 'fx', 'vfx', 0, sw * sw, 2 * STEP.z * sw, h); springTo(XR, 'fy', 'vfy', 0, sw * sw, 2 * STEP.z * sw, h);
  }
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
  const t = XR.t, mv = XR.mv, amp = (XSWAY.px + XSWAY.move * mv) * innerHeight / 1080 * XR.sk * (D && !D.melee ? gunUnsteady(D, curId()) : 1) * (1 + XR.un) * (1 + XHIT.sway * XR.hb);
  const heave = Math.sin(XR.bt) * amp * XWORK.heave * Math.min(1, XR.un);   // (the chest rising and falling)
  // (the stride's own swing: across with each step, a sharp dip each time a foot lands, STEP)
  const ph = P.phase || 0, stride = mv * XR.sk * innerHeight / 1080 * (D && !D.melee ? 0.6 + 0.4 * gunUnsteady(D, curId()) : 1);
  XR.sx = (Math.sin(t * 0.9 + 1.3) * 0.6 + Math.sin(t * 1.7 + 0.4) * 0.4) * amp + Math.sin(ph) * STEP.swing * stride;
  XR.sy = (Math.sin(t * 0.7 + 2.1) * 0.6 + Math.sin(t * 1.3 + 3.7) * 0.4) * amp + heave + Math.pow(Math.abs(Math.cos(ph)), 4) * STEP.bob * stride;
}
// the aim on screen: where the cursor is, plus the wander, the sway and the kick
export const aimSX = () => clamp(mouseX + SHAKY.x + XR.x + XR.sx + XR.dx + XR.fx, 0, innerWidth), aimSY = () => clamp(mouseY + SHAKY.y + XR.y + XR.sy + XR.dy + XR.fy, 0, innerHeight);
export function updateShaky(dt) {
  const sk = SHAKY, hpF = P.hp / hpCap();
  const want = P.dead || state !== 'play' ? 0 : smooth(clamp((SHAKY_HP.from - hpF) / (SHAKY_HP.from - SHAKY_HP.to), 0, 1));
  sk.k += (want - sk.k) * Math.min(1, dt * 1.6);
  // how far down the sights you are, eased, so what's steadier there (the wander, the tremor, how far a spray can walk
  // the aim) shrinks to it smoothly as you aim and grows back as you let go: the crosshair glides, never jumps
  sk.ak += ((aiming ? 1 : 0) - sk.ak) * Math.min(1, dt * SHAKY_AIM_EASE);
  if (!(dt > 0)) return;
  sk.t += dt; updateXhRecoil(dt);
  const t = sk.t, ph = sk.ph, k = sk.k;
  // each heartbeat (the R spike, ui/vitals.js): a little kick in a random direction, and a push through the arms
  const from = beatT < sk.lb ? -1 : sk.lb;
  if (k > 0.01 && from < ECG_R && beatT >= ECG_R) { const a = rand() * 6.283; sk.vbx += Math.cos(a) * SHAKY_BEAT * k; sk.vby += Math.sin(a) * SHAKY_BEAT * k; TREM.vp -= TREM_BEAT; TREM.vh += TREM_BEAT * 0.7; }
  sk.lb = beatT;
  // the tremble's springs; each time its hold runs out it picks a new spot to shake toward on every axis
  for (let n = Math.ceil(dt / (1 / 120)), h = dt / n, i = 0; i < n; i++) {
    springTo(sk, 'bx', 'vbx', 0, 30, 8, h); springTo(sk, 'by', 'vby', 0, 30, 8, h);
    if ((TREM.hold -= h) <= 0) { TREM.hold = rr(TREM_HOLD[0], TREM_HOLD[1]); TREM_AX.forEach(a => { TREM['g' + a] = rr(-1, 1); }); }
    TREM_AX.forEach(a => springTo(TREM, a, 'v' + a, TREM['g' + a], TREM_K, TREM_D, h));
  }
  // the wander: three slow swells on each axis at odd rates, so it never settles into a pattern
  const wx = Math.sin(t * 0.83 + ph[0]) * 0.55 + Math.sin(t * 1.37 + ph[1]) * 0.3 + Math.sin(t * 2.11 + ph[2]) * 0.15;
  const wy = Math.sin(t * 0.71 + ph[3]) * 0.55 + Math.sin(t * 1.53 + ph[4]) * 0.3 + Math.sin(t * 2.39 + ph[5]) * 0.15;
  const amp = SHAKY_SWAY * innerHeight / 1080 * k * mix(1, SHAKY_ADS, sk.ak);
  sk.x = clamp(wx * amp + sk.bx, -mouseX, innerWidth - mouseX);
  sk.y = clamp(wy * amp + sk.by, -mouseY, innerHeight - mouseY);
}
// the arms' tremble this frame, out of about 1 on each axis (scaled by SHAKY_TREM where it's used), as strong as your
// health makes it and a little steadier down the sights
const _trem = { p: 0, y: 0, r: 0, x: 0, h: 0 };
export function shakyTremor() {
  const q = SHAKY.k < 0.002 ? 0 : SHAKY.k * (1 - 0.4 * SHAKY.ak);
  TREM_AX.forEach(a => { _trem[a] = TREM[a] * q; });
  return _trem;
}
