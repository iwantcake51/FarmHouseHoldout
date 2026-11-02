// Ammo names, damage drop-off with range, and how much ammo drops give.

import { clamp } from '../core/math.js';
import { SLOTS } from './slots.js';
import { magSize, W, W8 } from '../game/run-state.js';

export const AMMO_NAME = { p9: '9mm', p10: '10mm', magnum: 'magnum', shells: 'shells', rifle: 'rifle rounds' };
// [full damage out to, reaches the floor at, floor multiplier]
export const FALLOFF = { pistol: [6, 18, 0.52], smg: [6, 15, 0.5], sub: [10, 22, 0.65], revolver: [12, 26, 0.6], deagle: [6, 15, 0.3], pump: [5, 13, 0.6], dbl: [4, 11, 0.5], auto12: [5, 13, 0.6], ar: [12, 26, 0.65], scar: [18, 36, 0.75], lmg: [9, 20, 0.58] };
const AMMO_REF = { p9: 13, p10: 13, magnum: 7, shells: 6, rifle: 12 };
// one ammo box or crafted batch; a calibre that feeds more than one of your guns comes in a bit bigger (+20% per extra gun)
export function ammoAmt(a) {
  let mx = 0, n = 0; for (const sl of SLOTS) { const id = W8.slot[sl]; if (id && W(id).ammo === a) { mx = Math.max(mx, magSize(id)); n++; } }
  return Math.round(AMMO_DROP[a] * (mx ? clamp(Math.sqrt(mx / AMMO_REF[a]), 1, 2.4) : 1) * (1 + 0.2 * Math.max(0, n - 1)));
}
// a crafted batch for one gun: the same for every gun on a calibre, whatever its magazine holds, so a pistol and a
// submachine gun get the same 9mm for the same price. The workbench sells ammo by the gun, so two guns on the same
// calibre are two batches
export const AMMO_BATCH = { p9: 40, p10: 30, magnum: 12, shells: 14, rifle: 45 };   // (10mm: the SMG's conversion kit, weapons/gun-mods.js: scarcer than 9mm)
export const gunBatch = id => AMMO_BATCH[W(id).ammo];
// a gun's drop-off: its own, or its load's where that has one (slugs and dragon's breath: D.fall, weapons/rounds.js)
export const fallOf = id => (W(id) && W(id).fall) || FALLOFF[id];
// a longer barrel (D.reach, weapons/gun-mods.js) stretches both ranges by that much and lifts the floor to match
export const falloff = (id, t) => {
  const F = fallOf(id); if (!F) return 1;
  const k = (W(id) && W(id).reach) || 1, f0 = F[0] * k, f1 = F[1] * k, fl = 1 - (1 - F[2]) / k;
  return t <= f0 ? 1 : t >= f1 ? fl : 1 - (1 - fl) * (t - f0) / (f1 - f0);
};
// how much of a shotgun's headshot bonus is left at a range: all of it out to where its damage starts to drop, none
// by where the damage bottoms out, along the same line (so a slug, with its longer drop-off, keeps it far further)
export const headFade = (id, t) => {
  const F = fallOf(id); if (!F || W(id).ammo !== 'shells') return 1;
  const fl = 1 - (1 - F[2]) / ((W(id).reach) || 1);
  return clamp((falloff(id, t) - fl) / (1 - fl), 0, 1);
};
export const AMMO_DROP = { p9: 15, p10: 11, magnum: 6, shells: 6, rifle: 15 }, AMMO_CAN = { p9: 192, p10: 144, magnum: 54, shells: 54, rifle: 135 };
// ammo boxes dropped by zombies hold about two thirds of a crafted batch (ammoAmt) for each gun you carry, so ammo stays
// tight into the mid waves without running dry
export const AMMO_PICKUP_MUL = 0.65;
