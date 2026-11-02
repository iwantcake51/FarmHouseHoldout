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
import { state, setShake, shake, camKick } from '../game/state.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { parryFx } from '../effects/puffs.js';
import { AC } from '../audio/audio.js';
import { fpMeleeHit } from '../game/view-cam.js';

export const BLK = { raise: 0.14, parry: 0.22, arc: 1.25, through: 0.18, heavy: 0.45, hold: 0.6, drain: 0.13, hit: 0.2, broke: 1.2, brokeStun: 0.5, pace: 0.7, lock: 0.55, parryStun: 0.75, parryLock: 0.9 };
// yours: up (on) and how far up (k, eased), when it came up (at, s), how long it's been held (t), how hard it was last
// shaken by a blow (shake, easing off), how long till it can come up again after it was broken (broke, s), how long
// your swings are held off for (lock, s), and a parry's flash on the shield (flash)
export const BLOCK = { on: false, k: 0, at: -9, t: 0, shake: 0, broke: 0, lock: 0, flash: 0, sx: 0, sy: 0, kick: null };
// a blow on the guard slamming the weapon and the fist back at you (melee/melee-anim.js puts it on its springs, m/s):
// back, down, aside (by the side the blow came from), and the weapon's tip knocked over; a parry's a sharper, smaller knock
const GUARD_KICK = { back: 2.6, down: 1.1, side: 1.3, tip: 3.2, parry: 0.55, heavy: 1.5 };
const now = () => performance.now() / 1000;
// whether you could have the guard up: a melee weapon in your hands and the button held, nothing else going on
function blockWant() {
  const D = W(curId());
  return !!D && !!D.melee && aimHeld && state === 'play' && !P.dead && !(P.bandT > 0) && !P.vault && !P.shove && !(BLOCK.broke > 0) && !(W8.swing > 0) && !(P.stun > 0) && !P.exh;
}
// each frame (weapons/combat-update.js): up or down, its stamina, the shake easing off
export function updateBlock(dt) {
  const want = blockWant();
  if (want && !BLOCK.on) { BLOCK.on = true; BLOCK.at = now(); BLOCK.t = 0; SFX.guardUp(); }
  else if (!want && BLOCK.on) BLOCK.on = false;
  BLOCK.k = clamp(BLOCK.k + (BLOCK.on ? 1 : -1) * dt / BLK.raise, 0, 1);
  if (BLOCK.on) {
    BLOCK.t += dt;
    if (BLOCK.t > BLK.hold) { P.stam = Math.max(0, P.stam - BLK.drain * stamMax() * dt); if (P.stam <= 0.001) guardBreak(); }
    P.stamT = 0;   // (none comes back while it's up)
  }
  if (BLOCK.broke > 0) BLOCK.broke -= dt;
  if (BLOCK.lock > 0) BLOCK.lock -= dt;
  BLOCK.shake = Math.max(0, BLOCK.shake - dt * 3.2); BLOCK.flash = Math.max(0, BLOCK.flash - dt * 2.5);
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
export const guardCost = dmg => BLK.hit * clamp(dmg / 35, 0.6, 2.4);
// a blow on yours (pvp/pvp.js NET_ON.ph, from in front, the guard up): the shield jolted, the arms shaken, a jolt of
// the view; a parry's cost nothing, a block's its share of your stamina (and broken if that's the last of it)
export function guardHitYou(kind, dmg, x, z) {
  const dx = P.x - x, dz = P.z - z, L = Math.hypot(dx, dz) || 1;
  BLOCK.shake = kind === 'parry' ? 0.7 : 1; BLOCK.sx = Math.random() - 0.5; BLOCK.sy = Math.random() - 0.5;
  { const K = GUARD_KICK, k = (kind === 'parry' ? K.parry : 1) * clamp(dmg / 35, 0.7, K.heavy), sd = ((x - P.x) * Math.cos(P.aim) - (z - P.z) * Math.sin(P.aim)) < 0 ? 1 : -1;
    BLOCK.kick = { x: -sd * K.side * k, y: -K.down * k, z: -K.back * k, tip: sd * K.tip * k, up: K.tip * 0.5 * k * (Math.random() < 0.5 ? 1 : -1) }; fpMeleeHit(true, kind === 'parry' ? 0.5 : 0.9 * k); }
  if (kind === 'parry') { BLOCK.flash = 1; setShake(Math.max(shake, 0.3)); }
  else {
    P.stam = Math.max(0, P.stam - guardCost(dmg) * stamMax()); P.stamT = 0;
    setShake(Math.max(shake, 0.22 + Math.min(0.3, dmg / 200))); camKick.x += dx / L * 0.08; camKick.z += dz / L * 0.08;
    if (P.stam <= 0.001) guardBreak();
  }
  guardFx(P.x - dx / L * 0.45, 1.3, P.z - dz / L * 0.45, -dx / L, -dz / L, kind === 'parry');
}
// out of stamina with it up: knocked down out of your hands' reach, reeling, and not up again for a moment
function guardBreak() {
  if (!BLOCK.on && BLOCK.broke > 0) return;
  BLOCK.on = false; BLOCK.broke = BLK.broke; P.stun = Math.max(P.stun || 0, BLK.brokeStun); P.exh = true;
  SFX.guardBreak();
}
// parried yourself (your blow turned on their guard): thrown off, reeling a moment, your next swing held off
export function parriedYou() {
  W8.swing = 0; stopLastWhoosh(); BLOCK.lock = Math.max(BLOCK.lock, BLK.parryLock); P.stun = Math.max(P.stun || 0, BLK.parryStun * 0.6);
  setShake(Math.max(shake, 0.35));
}
// a heavy swing's rush already under way (weapons/combat-update.js keeps its sound, W8.whooshSnd), cut off short
function stopLastWhoosh() {
  const h = W8.whooshSnd; W8.whooshSnd = null; if (!h || !AC) return;
  try { const t = AC.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + 0.05); h.s.stop(t + 0.06); } catch (e) { /* (already done) */ }
}
// a blow broken off by being hit mid-swing: gone before it lands, and the next held off a moment
export function swingBroken() {
  if (!(W8.swing > 0) || W8.hitDone) return;
  W8.swing = 0; stopLastWhoosh(); BLOCK.lock = Math.max(BLOCK.lock, BLK.lock);
}
// the sparks off a guard where a blow meets it, and its ring (heard where it is); a parry's brighter and louder
export function guardFx(x, y, z, nx, nz, parry) {
  parryFx(x, y, z, nx, nz, parry);
  soundAt(x, z, () => (parry ? SFX.parry : SFX.guardHit)());
}
