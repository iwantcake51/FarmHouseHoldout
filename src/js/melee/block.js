// Blocking with a melee weapon: hold the aim button (right click) with one in your hands and it comes up across you, a
// guard, eased up over BLK.raise. While it's up you can't swing, you walk slower (BLK.pace), and it costs you: held past
// BLK.hold seconds it drains your stamina (BLK.drain of your whole tank a second) and none comes back meanwhile. A blow
// from in front of you (within BLK.arc either side of where you face) lands on the guard: only BLK.through of it gets
// through (BLK.heavy for the sledgehammer and the fire axe, which beat a guard down), and it knocks a share of your
// stamina out of you at once (BLK.hit of the tank, more for a harder blow). Run out and the guard's broken: it drops,
// you reel for BLK.brokeStun and can't raise it again for BLK.broke. A guard raised just as the blow comes (within
// BLK.parry of raising it) parries it: none of it gets through, it costs nothing, and the one who swung is thrown off,
// staggered (BLK.parryStun) and their next swing held off (BLK.parryLock). Bullets go straight through any of it.
// Being hit by a blow yourself mid-swing (not on a guard) breaks your swing off before it lands, unheard, and holds your
// next one off for BLK.lock (pvp/pvp.js NET_ON.ph; a bot's own in pvp/bots.js).
// The crosshair's brackets give way to a shield while it's up (ui/crosshair.js), jolted by each blow it takes; the arms
// hold the weapon across (melee/melee-anim.js), shaken by the blow (BLOCK.shake). Sparks off the guard where it's met,
// a parry's brighter, a ring of steel (effects/puffs.js parryFx)

import { clamp } from '../core/math.js';
import { P } from '../player/player.js';
import { curId, stamMax, W, W8 } from '../game/run-state.js';
import { aimHeld } from '../player/aiming.js';
import { state, setShake, shake, camKick, camRoll, setCamRoll } from '../game/state.js';
import { ANIM } from '../player/animation.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { parryFx } from '../effects/puffs.js';
import { AC } from '../audio/audio.js';
import { mouseDown } from '../input/keyboard-mouse.js';
import { netSend } from '../net/net.js';
import { fpMeleeHit } from '../game/view-cam.js';
import { moveCircle } from '../world/collision.js';

export const BLK = { raise: 0.14, parry: 0.22, arc: 0.7, through: 0.18, heavy: 0.45, hold: 1, drain: 0, hit: 0.2, broke: 1.2, brokeStun: 0.5, pace: 0.7, lock: 0.12, parryStun: 0.75, parryLock: 0.9, parryStam: 0.12 };
// yours: up (on) and how far up (k, eased), when it came up (at, s), how long it's been held (t), how hard it was last
// shaken by a blow (shake, easing off), how long till it can come up again after it was broken (broke, s), how long
// your swings are held off for (lock, s), and a parry's flash on the shield (flash)
export const BLOCK = { on: false, k: 0, at: -9, t: 0, shake: 0, broke: 0, lock: 0, flash: 0, sx: 0, sy: 0, kick: null, okAt: 0, hit: 0, pop: 0, ripo: 0 };
// after a swing of yours, how long till the guard can come up (s, past the swing's end): the heavier the weapon, the
// longer it takes to haul it back across (the sledgehammer longest)
// holding the guard up, how much faster than BLK.drain it tires you by the weapon held up: a crowbar's light, a
// sledgehammer's a weight on your arms
const GUARD_HOLD = { crowbar: 0.6, machete: 0.7, katana: 0.85, bat: 0.95, wrench: 1.1, axe: 1.35, sledge: 1.7 };
export const guardHold = id => GUARD_HOLD[id] ?? 1;
// a swing across (not a chop down from overhead) at height y (where the weapon's head comes round at them) goes over
// someone only if it really passes over their head: ducking is an attempt, not a free dodge. DUCK: the top of a
// standing head, how far a full crouch takes it down, how far under the aim the weapon's head comes round, and how far
// down a bot reads someone as already low (it chops down at them then)
export const DUCK = { cr: 0.55, top: 1.74, drop: 0.28, under: 0.22 };
export const goesOver = (cr, chop, y) => !chop && y > DUCK.top - DUCK.drop * clamp(cr || 0, 0, 1);
const GUARD_AFTER = { crowbar: 0.06, machete: 0.08, bat: 0.16, katana: 0.12, wrench: 0.22, axe: 0.38, sledge: 0.6 };
export const guardAfter = id => GUARD_AFTER[id] ?? 0.15;
const GUARD_BACK = 0.5;
// your swing just started (weapons/firing.js): the guard held off till it's done and the weapon's back (guardAfter);
// a riposte if it's straight after a parry of yours (RIPOSTE: quicker, harder, and through any guard), returned as
// how much quicker it goes
export function swingStarted(id, dur) {
  W8.chgOn = false; W8.chgDone = false; W8.chgK = 0; W8.ripo = now() < BLOCK.ripo; if (W8.ripo) BLOCK.ripo = 0;
  W8.runK = P.sprint && Math.hypot(P.vx || 0, P.vz || 0) > RUNATK.speed ? 1 : 0;
  if (W8.runK) {   // (a running attack: thrown on along it, a jolt of the view with it)
    const fx = Math.sin(P.aim), fz = Math.cos(P.aim); P.kbx = fx * RUNATK.lunge; P.kbz = fz * RUNATK.lunge; P.sprint = false;
    P.stam = Math.max(0, P.stam - RUNATK.stam * stamMax()); P.stamT = 0; camKick.x += fx * 0.18; camKick.z += fz * 0.18; setShake(Math.max(shake, 0.2));
  }
  // (the guard up again soon after the blow's landed, not only once the whole follow-through's done: its recovery can
  // be cut short by raising it, GUARD_BACK of the swing in plus half the weapon's own wait, guardAfter)
  BLOCK.okAt = now() + dur * (W8.ripo ? RIPOSTE.speed : 1) * GUARD_BACK + guardAfter(id) * 0.5;
  return W8.ripo ? RIPOSTE.speed : 1;
}
// ---- a heavy blow (MCHARGE): hold the swing button past the wind-up and the blow's held there, gathering, the arm
// back and trembling, a little stamina going a second; let go and it comes down, up to MCHARGE.dmg harder at full
// (MCHARGE.full s; W8.chgK, its own: W8.heavyK is a heavy gun's slowdown, which eases off on its own), and at full a blow that meets a guard breaks it. Right click while it's held is a feint: the blow's
// dropped (a little stamina for it) and the guard can come straight up, to bait a parry and punish it
// a running attack: a swing thrown out of a sprint (faster than RUNATK.speed m/s) lunges you on along it (RUNATK.lunge
// m/s thrown forward, easing off as a shove does), hits RUNATK.dmg as hard and costs RUNATK.stam more of the tank
export const RUNATK = { speed: 4.2, dmg: 1.5, lunge: 5, stam: 0.12 };
export const MCHARGE = { before: 0.13, full: 0.65, dmg: 1, drain: 0.1, feint: 0.08, most: 2.5 };
// after a parry of yours (RIPOSTE: win s): the next swing's quicker (speed of its time), does dmg more, and goes
// through any guard
export const RIPOSTE = { win: 0.9, speed: 0.72, dmg: 1.4 };
// what this swing's blow is worth (melee/melee.js, pvp/pvp.js): its charge and a riposte; full: a guard-breaker
export const swingMul = () => (1 + MCHARGE.dmg * (W8.chgK || 0)) * (W8.ripo ? RIPOSTE.dmg : 1) * (W8.runK ? RUNATK.dmg : 1);
export const swingFull = () => (W8.chgK || 0) >= 0.999;
// each step of your swing (weapons/combat-update.js): whether it's held gathering this step. p: how far through it is,
// hit: where its blow lands
export function chargeStep(dt, p, hit, id, wound = 1) {
  if (W8.chgOn) {
    if (aimHeld) { feint(id); return true; }
    if (!mouseDown || P.dead || P.stun > 0 || (W8.chgT += dt) > MCHARGE.most) { chargeRelease(id, p, hit); return false; }
    P.stam = Math.max(0, P.stam - MCHARGE.drain * stamMax() * dt); P.stamT = 0; W8.chgK = clamp(W8.chgT / MCHARGE.full, 0, 1);
    setShake(Math.max(shake, 0.05 + 0.13 * W8.chgK));   // (the view shaking with the strain of it, more as it gathers)
    if (W8.chgK >= 1 && !W8.chgRing) { W8.chgRing = true; SFX.chargeFull(); }
    return true;
  }
  // (held at the top of the wind-up, wound: just before the swing's fast stretch comes across, so the weapon's drawn
  // back out of your view while it gathers rather than frozen across the middle of it)
  if (!W8.chgDone && !W8.ripo && mouseDown && p >= Math.min(hit - MCHARGE.before, wound)) {
    W8.chgOn = true; W8.chgT = 0; W8.chgRing = false; W8.chgK = 0;
    netSend('mw', { w: id, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, hd: 1, p0: Math.round(p * 1000) / 1000 });   // (held there, as they see you: net/avatars.js avSwing)
    return true;
  }
  return false;
}
function chargeRelease(id, p, hit) {
  W8.chgOn = false; W8.chgDone = true; if (W8.chgK > 0.5) SFX.swingHeavy(true);
  const left = W8.swing, wu = Math.max(0.02, (hit - p) * W8.swingDur);
  netSend('mw', { w: id, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, rs: 1, p0: Math.round(p * 1000) / 1000, wu: Math.round(wu * 1000) / 1000, du: Math.round(left * 1000) / 1000, sd: W8.swingSide });
}
function feint(id) {
  W8.chgOn = false; W8.swing = 0; W8.chgK = 0; W8.cd = Math.min(W8.cd, 0.12); BLOCK.okAt = now();
  P.stam = Math.max(0, P.stam - MCHARGE.feint * stamMax()); P.stamT = 0; SFX.guardUp();
  netSend('mw', { w: id, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, cx: 1 });
}
// thrown off by a parry: the screen hit (PARRIED_FX: a white flash and a cold vignette, ui/hud.js and styles/hud.css
// #parryFx, the view swimming a moment as a shove leaves it)
export const PARRIED_FX = { len: 0.9 };
// a blow on the guard slamming the weapon and the fist back at you (melee/melee-anim.js puts it on its springs, m/s):
// back, down, aside (by the side the blow came from), and the weapon's tip knocked over; a parry's a sharper, smaller knock
const GUARD_KICK = { back: 2.6, down: 1.1, side: 1.3, tip: 3.2, parry: 0.55, heavy: 1.5 };
const now = () => performance.now() / 1000;
// whether you could have the guard up: a melee weapon in your hands and the button held, nothing else going on
function blockWant() {
  const D = W(curId());
  return !!D && !!D.melee && aimHeld && state === 'play' && !P.dead && !(P.bandT > 0) && !P.vault && !P.shove && !(BLOCK.broke > 0) && !(W8.swing > 0 && !W8.hitDone) && !(now() < (BLOCK.thrown || 0)) && P.stam > 0.02 * stamMax() && now() >= BLOCK.okAt;   // (up with what little stamina's left: any is enough)   // (not straight after a swing: guardAfter)
}
// each frame (weapons/combat-update.js): up or down, its stamina, the shake easing off
export function updateBlock(dt) {
  const want = blockWant();
  meleeDashStep(dt);
  if (want && !BLOCK.on) { BLOCK.on = true; BLOCK.at = now(); BLOCK.t = 0; SFX.guardUp(); if (W8.swing > 0) W8.swing = 0; }   // (cutting the follow-through short)
  else if (!want && BLOCK.on) BLOCK.on = false;
  BLOCK.k = clamp(BLOCK.k + (BLOCK.on ? 1 : -1) * dt / BLK.raise, 0, 1);
  if (BLOCK.on) {
    BLOCK.t += dt;
    if (BLK.drain > 0 && BLOCK.t > BLK.hold) { P.stam = Math.max(0, P.stam - BLK.drain * guardHold(curId()) * stamMax() * dt); if (P.stam <= 0.001) guardBreak(); }   // (by the weight of what's held up, guardHold: none now, BLK.drain 0; only blows on it cost you)
    P.stamT = 0;   // (none comes back while it's up)
  }
  if (BLOCK.broke > 0) BLOCK.broke -= dt;
  if (BLOCK.lock > 0) BLOCK.lock -= dt; if (BLOCK.dazed > 0) BLOCK.dazed -= dt;
  BLOCK.shake = Math.max(0, BLOCK.shake - dt * 3.2); BLOCK.flash = Math.max(0, BLOCK.flash - dt * 2.5); BLOCK.hit = Math.max(0, BLOCK.hit - dt * 4); BLOCK.pop = Math.max(0, BLOCK.pop - dt * 2.2); BLOCK.shatter = Math.max(0, (BLOCK.shatter || 0) - dt * 1.4);
}
// whether your swing's held off: the guard up, or thrown off by a parry or a blow that broke your swing
export const blockStops = () => { const D = W(curId()); return !!D && !!D.melee && (BLOCK.on || BLOCK.lock > 0); };
// your pace with it up (player/movement.js)
export const blockPace = () => 1 - (1 - BLK.pace) * BLOCK.k;
// a guard's up and facing a blow from (x, z): aim, the way it faces; parry: raised in time for it
export function guardMeets(on, at, aim, gx, gz, x, z) {
  if (!on) return null;
  const a = Math.atan2(x - gx, z - gz), d = Math.abs(Math.atan2(Math.sin(a - aim), Math.cos(a - aim)));
  if (d > BLK.arc) return null;
  return now() - at < BLK.parry ? 'parry' : 'block';
}
// how much of a blow (with w, dmg of it) a guard lets through
export const guardThrough = w => w === 'sledge' || w === 'axe' ? BLK.heavy : BLK.through;
// how much of a full tank a blow on a guard knocks out of it
// how much of a full tank a blow on a guard knocks out of it: by the weapon it's from (GUARD_COST: a crowbar's little,
// a sledgehammer's half the tank), else (a zombie's swing) by how hard it hits
const GUARD_COST = { crowbar: 0.1, machete: 0.13, bat: 0.18, katana: 0.15, wrench: 0.24, axe: 0.34, sledge: 0.5 };
export const guardCost = (dmg, w) => GUARD_COST[w] ?? BLK.hit * clamp(dmg / 35, 0.6, 2.4);
// a blow on yours (pvp/pvp.js NET_ON.ph, from in front, the guard up): the shield jolted, the arms shaken, a jolt of
// the view; a parry's cost nothing, a block's its share of your stamina (and broken if that's the last of it)
export function guardHitYou(kind, dmg, x, z, w, brk) {
  const dx = P.x - x, dz = P.z - z, L = Math.hypot(dx, dz) || 1;
  BLOCK.shake = kind === 'parry' ? 0.7 : 1; BLOCK.sx = Math.random() - 0.5; BLOCK.sy = Math.random() - 0.5;
  { const K = GUARD_KICK, k = (kind === 'parry' ? K.parry : 1) * clamp(dmg / 35, 0.7, K.heavy), sd = ((x - P.x) * Math.cos(P.aim) - (z - P.z) * Math.sin(P.aim)) < 0 ? 1 : -1;
    BLOCK.kick = { x: -sd * K.side * k, y: -K.down * k, z: -K.back * k, tip: sd * K.tip * k, up: K.tip * 0.5 * k * (Math.random() < 0.5 ? 1 : -1) }; fpMeleeHit(true, kind === 'parry' ? 0.5 : 0.9 * k); }
  if (kind === 'parry') { BLOCK.flash = 1; BLOCK.pop = 1; BLOCK.ripo = now() + RIPOSTE.win; P.stam = Math.min(stamMax(), P.stam + BLK.parryStam * stamMax()); setShake(Math.max(shake, 0.3)); }   // (and a riposte's yours, RIPOSTE, and a little stamina back: BLK.parryStam)
  else {
    BLOCK.hit = 1;
    P.stam = Math.max(0, P.stam - guardCost(dmg, w) * stamMax()); P.stamT = 0;
    setShake(Math.max(shake, 0.22 + Math.min(0.3, dmg / 200))); camKick.x += dx / L * 0.08; camKick.z += dz / L * 0.08;
    if (P.stam <= 0.001 || brk) guardBreak();   // (brk: a heavy blow at full, MCHARGE, breaks it whatever's left)
  }
  guardFx(P.x - dx / L * 0.45, 1.3, P.z - dz / L * 0.45, -dx / L, -dz / L, kind === 'parry');
}
// out of stamina with it up: knocked down out of your hands' reach, reeling, and not up again for a moment
// out of stamina with it up (from holding it, or a blow on it): broken. The weapon knocked down and aside out of your
// guard, you stagger a step (a reel of the view), the screen hit (GUARD_BROKE: a grey flash and a cold red vignette in
// from the edges, the view swimming a moment), and the shield on the crosshair breaks in two and falls apart
// (ui/crosshair.js: BLOCK.shatter)
const GUARD_BROKE = { len: 1.1 };
let brokeEl = null, brokeT = 0;
function guardBreak() {
  if (!BLOCK.on && BLOCK.broke > 0) return;
  BLOCK.on = false; BLOCK.broke = BLK.broke; P.stun = Math.max(P.stun || 0, BLK.brokeStun); P.exh = true;
  BLOCK.shatter = 1; BLOCK.dazed = Math.max(BLOCK.dazed || 0, GUARD_BROKE.len * 0.7);
  BLOCK.kick = { x: 1.6, y: -3.2, z: -1.2, tip: -3.5, up: -2.2 };   // (the weapon knocked down and out of your guard)
  ANIM.flinch = 1; ANIM.flinchSide = Math.random() < 0.5 ? -1 : 1; ANIM.stumble = 1;
  setShake(Math.max(shake, 0.5)); setCamRoll(clamp(camRoll + ANIM.flinchSide * 0.08, -0.12, 0.12)); fpMeleeHit(true, 1.4);
  if (!brokeEl) { brokeEl = document.createElement('div'); brokeEl.id = 'guardBrokeFx'; brokeEl.setAttribute('aria-hidden', 'true'); brokeEl.innerHTML = '<i></i>'; document.body.appendChild(brokeEl); }
  brokeEl.classList.remove('on'); void brokeEl.offsetWidth; brokeEl.classList.add('on'); clearTimeout(brokeT); brokeT = setTimeout(() => brokeEl.classList.remove('on'), GUARD_BROKE.len * 1000);
  SFX.guardBreak();
}
// parried yourself (your blow turned on their guard): thrown off, reeling a moment, your next swing held off
export function parriedYou() {
  W8.swing = 0; stopLastWhoosh(); BLOCK.lock = Math.max(BLOCK.lock, BLK.parryLock); P.stun = Math.max(P.stun || 0, BLK.parryStun * 0.6); BLOCK.thrown = now() + BLK.parryStun * 0.6;
  setShake(Math.max(shake, 0.45)); parriedFx();
}
// the screen thrown off with you: a white-blue flash in from the edges and the view swimming (styles/hud.css #parryFx)
let parriedEl = null, parriedT = 0;
function parriedFx() {
  if (!parriedEl) { parriedEl = document.createElement('div'); parriedEl.id = 'parryFx'; parriedEl.setAttribute('aria-hidden', 'true'); parriedEl.innerHTML = '<i></i>'; document.body.appendChild(parriedEl); }
  const el = parriedEl; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(parriedT); parriedT = setTimeout(() => el.classList.remove('on'), PARRIED_FX.len * 1000);
  BLOCK.dazed = PARRIED_FX.len;
}
// ---- a dash (Space with a melee weapon out, moving: input/keyboard-mouse.js): a quick step the way you're moving,
// back out of a heavy blow being wound up at you or off to the side of it. DASH: how fast it carries you (m/s, easing
// off at DASH.decay a second: about 2.3 m all told, over a good half second, a step not a teleport), and how fast with
// under DASH.cost of the tank left (a weaker step, about 1.4 m); how far the view leans into it (rad); its cost (half the tank); how soon you can again; how long the edges of the view blur with it. Short of the
// stamina, it costs what's left, and your stamina then comes back slowly at first (DASH.slow of the usual), picking up
// to the usual over DASH.ramp s
const DASH = { v: 9.5, weak: 6, decay: 4.2, cost: 0.5, cd: 0.45, fx: 0.38, slow: 0.3, ramp: 2.5, roll: 0.075 };
let dashEl = null, dashT = 0;
export function meleeDash() {
  const D = W(curId());
  if (!D || !D.melee || P.dead || P.vault || P.shove || state !== 'play' || now() < (BLOCK.dashAt || 0) || P.bandT > 0) return false;
  const sp = Math.hypot(P.vx || 0, P.vz || 0); if (sp < 0.6) return false;
  const ux = P.vx / sp, uz = P.vz / sp, sm = stamMax(), full = P.stam >= DASH.cost * sm, v = full ? DASH.v : DASH.weak;
  P.dvx = ux * v; P.dvz = uz * v; P.sprint = false;
  P.stam = Math.max(0, P.stam - DASH.cost * sm); P.stamT = 0; if (!full) P.dashTired = now(); if (P.stam <= 0.001) P.exh = true;
  BLOCK.dashAt = now() + DASH.cd;
  // (which way it went, against where you face: the arms and weapon swing back against it and lean with it, the view
  // tips the way you go, melee/melee-anim.js ANIM.dash)
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim);
  ANIM.dash = full ? 1 : 0.7; ANIM.dashSide = ux * fz - uz * fx; ANIM.dashFwd = ux * fx + uz * fz;
  camKick.x += ux * 0.04; camKick.z += uz * 0.04;
  SFX.dash(full);
  if (!dashEl) { dashEl = document.createElement('div'); dashEl.id = 'dashFx'; dashEl.setAttribute('aria-hidden', 'true'); dashEl.innerHTML = '<i></i>'; document.body.appendChild(dashEl); }
  dashEl.classList.toggle('weak', !full); dashEl.classList.remove('on'); void dashEl.offsetWidth; dashEl.classList.add('on');
  clearTimeout(dashT); dashT = setTimeout(() => dashEl.classList.remove('on'), DASH.fx * 1000);
  return true;
}
// the dash carrying you (each step, updateBlock), easing off
function meleeDashStep(dt) {
  if (!(P.dvx || P.dvz)) return;
  moveCircle(P, P.dvx * dt, P.dvz * dt, 0.3, true); const f = Math.exp(-dt * DASH.decay); P.dvx *= f; P.dvz *= f;
  if (Math.abs(P.dvx) + Math.abs(P.dvz) < 0.05 || P.dead) P.dvx = P.dvz = 0;
}
// the view leaning the way you dashed (game/camera.js): eased over into it and back out over about half a second
export function dashRoll() {
  const k = ANIM.dash || 0; if (k <= 0.002) return 0;
  return -(ANIM.dashSide || 0) * DASH.roll * Math.sin(Math.PI * clamp(1 - k, 0, 1));
}
// how quickly stamina comes back after a dash taken short of it (combat-update.js): slow at first, up to the usual
export const dashRegen = () => P.dashTired ? clamp(DASH.slow + (1 - DASH.slow) * (now() - P.dashTired) / DASH.ramp, DASH.slow, 1) : 1;
// ---- a shove into a guard (player/shove.js, pvp/pvp.js pvpShove; a bot's: pvp/bots.js): it's knocked aside, open, not
// broken by tiring (none of their stamina's taken) but by being shoved out of the way, and they reel for SHOVE_OPEN.reel
// while their guard can't come back up for SHOVE_OPEN.down; the one who shoved has their next blow through any guard
// (a riposte, RIPOSTE) for SHOVE_OPEN.win, to punish it
export const SHOVE_OPEN = { reel: 0.75, down: 0.9, win: 0.9 };
// yours shoved open
export function guardShovedOpen() {
  BLOCK.on = false; BLOCK.broke = SHOVE_OPEN.down; BLOCK.shatter = 1; BLOCK.dazed = Math.max(BLOCK.dazed || 0, 0.5);
  P.stun = Math.max(P.stun || 0, SHOVE_OPEN.reel); W8.chgOn = false;
  BLOCK.kick = { x: (Math.random() < 0.5 ? -1 : 1) * 2.2, y: -2.4, z: -2.2, tip: -3, up: 2 };
  SFX.guardBreak();
}
// you shoved someone's guard open: the sparks and the punish window (where: x, z, the way back toward you nx, nz)
export function shoveOpened(x, z, nx, nz) { BLOCK.ripo = now() + SHOVE_OPEN.win; guardFx(x, 1.25, z, nx, nz, false); }
// a heavy swing's rush already under way (weapons/combat-update.js keeps its sound, W8.whooshSnd), cut off short
function stopLastWhoosh() {
  const h = W8.whooshSnd; W8.whooshSnd = null; if (!h || !AC) return;
  try { const t = AC.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + 0.05); h.s.stop(t + 0.06); } catch (e) { /* (already done) */ }
}
// a swing knocked out of you by a shove (pvp/pvp.js NET_ON.pv): only a shove breaks off a swing or a blow being gathered
// (a hit doesn't: you trade blows), gone before it lands, the next held off a beat and the guard free to come up
export function swingShoved() {
  const D = W(curId()) || {}; if (!D.melee || !(W8.swing > 0) || W8.hitDone) return;
  W8.swing = 0; W8.chgOn = false; stopLastWhoosh(); BLOCK.lock = Math.max(BLOCK.lock, BLK.lock); W8.cd = Math.min(W8.cd || 0, BLK.lock); BLOCK.okAt = Math.min(BLOCK.okAt || 0, now());
  netSend('mw', { w: curId(), x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, cx: 1 });   // (the swing dropped, as they see you)
}
// the sparks off a guard where a blow meets it, and its ring (heard where it is); a parry's brighter and louder
export function guardFx(x, y, z, nx, nz, parry) {
  parryFx(x, y, z, nx, nz, parry);
  soundAt(x, z, () => (parry ? SFX.parry : SFX.guardHit)());
}
