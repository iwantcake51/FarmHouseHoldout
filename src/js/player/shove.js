// Shoving zombies away with F, and the bayonet stab that rides on it.

import { angDiff, clamp, rand, rr } from '../core/math.js';
import { P } from './player.js';
import { curId, EFF, gunAtt, run, S, W, W8 } from '../game/run-state.js';
import { burst } from '../effects/particles.js';
import { zombies } from '../zombies/zombie-types.js';
import { zAnimShove } from '../zombies/zombie-anim.js';
import { hurtZombie } from '../zombies/damage.js';
import { fenceTarget, nearestOpening, tryVault, vaultTarget } from './vaulting.js';
import { openSt } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { camKick, camRoll, setCamRoll, setShake, shake } from '../game/state.js';
import { aimHeld, exitScope, startAim } from './aiming.js';
import { cutReload } from '../weapons/reload.js';
import { bodyOf } from '../weapons/firing.js';
import { stamUse } from '../melee/melee.js';
import { meleeImpact } from '../melee/melee-anim.js';
import { cancelBandage } from './bandages.js';
import { runStat } from '../ui/run-stats.js';
import { ANIM } from './animation.js';
import { relKnock } from './hold-kick.js';
import { netAct, netRec, nr } from '../net/sync.js';
import { pvpShove } from '../pvp/pvp.js';

// the shove has a shape: a quick wind-up, a hard blow with the weapon itself, then the recovery (shovePose and
// MBASH: player/hold.js, melee/melee-anim.js). You don't step into it; only the weapon goes out
export const SHOVE_CD = 0.85, SHOVE_COST = 0.14, SHOVE_RANGE = 1.6, SHOVE_ARC = 1.15, SHOVE_DUR = 0.58, SHOVE_HIT = 0.15, SHOVE_SLOW = 2.6;
// a shove in the middle of wrapping a bandage stops it there and then: the bandage is spent (as when you stop it with a
// click: cancelBandage, player/bandages.js), the weapon's straight back in your hand, and the shove goes out at once
EFF.bayonet = { melee: true, dmg: 45, sever: 0.3, kb: 2 };
// the touch button climbs a window or fence when you are at one, and shoves otherwise
export function spaceAction() { if (vaultTarget(nearestOpening()) || fenceTarget()) tryVault(); else shove(); }
const hasBayonet = () => gunAtt(curId(), 'bayonet');   // only on the long gun it was fitted to
// shove after shove wears your arms out: the first few (free) come as quick as ever, then each one more slows the next
// (step more of its wait, and half that of the shove itself), up to max times as slow; stop shoving for rest seconds and
// it comes back, back shoves' worth a second (SHOVE_TIRE)
const SHOVE_TIRE = { free: 4, step: 0.3, max: 2.2, rest: 2, back: 2 };
export function shove() {
  if (P.dead || P.vault || openSt || W8.swing > 0 || (P.shoveCd || 0) > 0) return;
  if (P.bandT > 0 || ANIM.bandP > 0) { if (P.bandT > 0) cancelBandage(); ANIM.bandSwitch = null; ANIM.bandP = 0; ANIM.bandW = 0; ANIM.bandK = 0; }
  const cost = stamUse(SHOVE_COST), tired = P.exh || P.stam < cost * 0.5;
  P.stam = Math.max(0, P.stam - cost); P.stamT = 0; if (P.stam <= 0.001) P.exh = true;
  const T = SHOVE_TIRE, idle = run.time - (P.shoveLast ?? -1e9); P.shoveLast = run.time;
  P.shoveN = Math.max(0, (P.shoveN || 0) - Math.max(0, idle - T.rest) * T.back) + 1;
  const worn = Math.min(T.max, 1 + Math.max(0, P.shoveN - T.free) * T.step), slow = 1 + (worn - 1) * 0.5;
  P.shoveCd = SHOVE_CD * (tired ? 1.5 : 1) * worn; runStat('shoves');
  P.shove = { t: 0, hit: false, power: tired ? 0.5 : 1, stab: hasBayonet(), dur: SHOVE_DUR * slow, hitT: SHOVE_HIT * slow };
  exitScope(); cutReload(); W8.burstLeft = 0; W8.cd = Math.max(W8.cd, 0.35);
  if (tired) SFX.pant();
}
// runs every frame from updatePlayer: the hit landing at the end of the wind-up
export function tickShove(dt) {
  const s = P.shove; if (!s) return;
  s.t += dt;
  const p = s.t / s.dur;
  if (!s.hit && s.t >= s.hitT) { s.hit = true; landShove(s); }
  if (p >= 1) { P.shove = null; if (aimHeld) startAim(); }   // still holding aim: back down the sights
}
// a zombie shoved: thrown back (a brute barely budges), its swing lost, stumbling for a moment and then slow for a few
// seconds, only picking its pace back up toward the end (zombies/ai.js). A runner, thrown off its stride, reels longer
// before it gets going again (SHOVE_RUNNER: how much longer). A co-op teammate's shove lands here too (net/sync.js)
const SHOVE_RUNNER = { stagger: 1.9, slow: 1.5 };
// an elite's not so easily moved: thrown back f of the way, and reeling stun as long (zombies/elites.js)
const SHOVE_ELITE = { f: 0.4, stun: 0.5 };
export function shoveZombie(z, nx, nz, f, power, big) {
  z.vx += nx * 9 * f; z.vz += nz * 9 * f;
  const rk = z.type === 'runner' ? SHOVE_RUNNER : { stagger: 1, slow: 1 };
  if (!big) { z.stagger = Math.max(z.stagger, 0.8 * rk.stagger * power); z.atk = Math.max(z.atk, 0.8 * rk.stagger * power); z.lunge = 0; z.pushSlow = z.pushMax = SHOVE_SLOW * rk.slow * power; z.shoved = 1; zAnimShove(z); }
  else { z.pushSlow = z.pushMax = Math.max(z.pushSlow || 0, 0.8); z.shoved = 0.35; }
  z.squash = 1; z.flash = Math.max(z.flash, 0.1);
  const [bx, bz] = bodyOf(z), hy = 1.0 * z.T.scale * (z.crawl ? 0.35 : 1);
  burst(bx - nx * 0.25, hy, bz - nz * 0.25, 6, 'dust', nx, nz, 2.4); burst(bx, 0.08, bz, 4, 'dust', nx, nz, 1.4);
}
function landShove(s) {
  SFX.shove(s.stab);
  let hit = 0, brute = false;
  for (const z of zombies.slice()) {
    const [bx, bz] = bodyOf(z), dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz);
    if (d > SHOVE_RANGE + z.T.r || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > SHOVE_ARC && d > 0.55) || z.vault) continue;
    const nx = dx / (d || 1), nz = dz / (d || 1), big = z.type === 'brute';
    // brutes barely budge; everyone else is thrown back, loses their swing and stumbles slowly for a few seconds
    const el = z.elite ? SHOVE_ELITE : null, f = s.power * (big ? 0.25 : 1) * (z.crawl ? 0.6 : 1) * (el ? el.f : 1), pw = s.power * (el ? el.stun : 1);
    netAct(z, nx, nz, () => {
      shoveZombie(z, nx, nz, f, pw, big); netRec('v', nr(f), nr(pw), big ? 1 : 0);
      if (s.stab && !z.dead) hurtZombie(z, EFF.bayonet.dmg * S.meleeMul * s.power, nx, nz, EFF.bayonet.kb, 'bayonet', 'torso');
    });
    hit++; brute = brute || big;
  }
  hit += pvpShove(s.power);   // (in the arena, anyone on the other side: pvp/pvp.js)
  if (hit) {
    SFX.hitBlunt(true); if (s.stab) SFX.hitBlade(false);
    setShake(Math.max(shake, brute ? 0.2 : 0.3));
    camKick.x += Math.sin(P.aim) * 0.22; camKick.z += Math.cos(P.aim) * 0.22; setCamRoll(clamp(camRoll + (rand() < 0.5 ? -1 : 1) * 0.04, -0.1, 0.1));
    ANIM.shoveHit = 1;
    if ((W(curId()) || {}).melee) meleeImpact(false, 0.8); else relKnock(-3.2, rr(-1, 1), 0.25, -1.1);   // the weapon rebounds off what it hit
  } else { camKick.x += Math.sin(P.aim) * 0.08; camKick.z += Math.cos(P.aim) * 0.08; }
}
