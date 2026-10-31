// Mod levels and fire modes. Tinkering at the workbench can improve a mod you already have, up to level III;
// each level adds its step below on top of the mod itself. Mods with a fire mode (fm) are picked with B.

import { WEAP } from './gun-stats.js';
import { MODS } from '../melee/melee-mods.js';
import { fitTier, gunTier, hasMod, magSize, ownTier, recomputeEff, W, W8 } from '../game/run-state.js';
import { fanning } from './firing.js';

export const MOD_MAX = 3;
// mods that make one line of upgrades between them, shown with that line's stars at the bench: the pistol's burst
// conversion is its first two (its level II the second) and the auto sear its third (MOD_LINE: where each comes in and
// how many steps the line has; MOD_CAP: how far a mod's own levels go in it)
export const MOD_LINE = { burst: [0, 3], auto: [2, 3] }, MOD_CAP = { burst: 2 };
export const MOD_UP = {
  match: { t: 'Spread −10%, +6% damage, less drop-off at range', up: D => { D.spread *= 0.9; D.dmg *= 1.06; D.reach += 0.3; } },
  burst: { t: '+1 round a burst, +6% damage', up: D => { D.burst += 1; D.dmg *= 1.06; } },
  longbarrel: { t: 'A longer barrel: +12% damage, less drop-off at range', up: D => { D.dmg *= 1.12; D.reach += 0.3; } },
  comp: { t: 'Spread and kick −20%', up: D => { D.spread *= 0.8; D.shake *= 0.8; } },
  slam: { t: 'Fires 10% faster', up: D => { D.rate *= 0.9; } },
  sawn: { t: '+2 pellets', up: D => { D.pellets += 2; } },
  both: { t: '+10% damage', up: D => { D.dmg *= 1.1; } },
  well: { t: 'Mag changes 3% faster', up: D => { D.reload *= 0.97; } },
  ported: { t: 'Spread −20%', up: D => { D.spread *= 0.8; } },
  navy: { t: '+1 round a burst, +6% damage', up: D => { D.burst += 1; D.dmg *= 1.06; } },
  gl: { t: 'Recharges 25% faster', up: D => { D.glRecharge *= 0.75; } },
  heavy: { t: '+10% damage, spread −10%', up: D => { D.dmg *= 1.1; D.spread *= 0.9; } },
  bipod: { t: 'Spread −15%', up: D => { D.spread *= 0.85; } },
  nails: { t: '+15% damage', up: D => { D.dmg *= 1.15; } },
  wire: { t: 'Reach +0.15', up: D => { D.range += 0.15; } },
  serrated: { t: '+10% damage', up: D => { D.dmg *= 1.1; } },
  longblade: { t: 'Reach +0.15', up: D => { D.range += 0.15; } },
  tape: { t: 'Swings 12% faster', up: D => { D.rate *= 0.88; } },
  jaw: { t: '+12% damage, more knockback', up: D => { D.dmg *= 1.12; D.kb *= 1.15; } },
  folded: { t: '+12% damage', up: D => { D.dmg *= 1.12; } },
  spikes: { t: '+12% damage, takes more limbs', up: D => { D.dmg *= 1.12; D.sever += 0.2; } },
  weighted: { t: 'Knockback +30%', up: D => { D.kb *= 1.3; } }
};
export const roman = n => ['', 'I', 'II', 'III', 'IV', 'V'][n] || String(n);
export const modLv = m => (W8.modLv && W8.modLv[m]) || 1;
// a mod's name at a level: its own name for each level if it has them (the revolver's barrel by its length), or the
// name and the level in numerals
export const modNameAt = (m, lv) => MODS[m].names ? MODS[m].names[Math.min(lv, MODS[m].names.length) - 1] : MODS[m].name + (lv > 1 ? ' ' + roman(lv) : '');
export const modName = m => modNameAt(m, modLv(m));
// the weapon's mods that tinkering could still improve
export const modUps = id => id ? (W8.mods[id] || []).filter(m => MOD_UP[m] && modLv(m) < (MOD_CAP[m] || MOD_MAX)) : [];
// whether a mod can be offered: not one you have, not one something you have replaced, and its prerequisite (at the
// level it asks for) fitted
export const modReplaced = m => Object.keys(MODS).some(k => MODS[k].replaces === m && (hasMod(k) || modIsOff(k)));
// mods taken off a gun at the loadout panel (ui/loadout.js): still yours, never sold to you again, and put back for nothing
export const modsOff = id => (W8.modOff && W8.modOff[id]) || [];
const modIsOff = m => modsOff(MODS[m].w).includes(m);
export const modOffer = m => !hasMod(m) && !modIsOff(m) && !modReplaced(m) && (!MODS[m].need || (hasMod(MODS[m].need) && modLv(MODS[m].need) >= (MODS[m].needLv || 1))) && !(MODS[m].muzzle && (muzzleTaken(MODS[m].w) || ownTier(MODS[m].w, 'supp') || ownTier(MODS[m].w, 'choke')));   // (a can or choke taken off still holds the muzzle)
// one thing on the end of the barrel: a can or a choke from the bench, or a muzzle device mod (weapons/gun-mods.js)
// a line a fitted mod has taken the place of (the AK kit's mag and magwell: weapons/gun-mods.js), and that mod
export const modLocks = (id, k) => (W8.mods[id] || []).find(m => MODS[m].locks && MODS[m].locks.includes(k)) || null;
export const muzzleTaken = id => !!(gunTier(id, 'supp') || gunTier(id, 'choke') || (W8.mods[id] || []).some(m => MODS[m].muzzle));
// a mod that changes what a gun fires (MODS[m].ammo: the SMG's 10mm kit) empties it into the pouch of what it fired
// before, so the next mag is the new round; the first time it goes on it comes with its own (gift: a mag in the gun and
// the rest in the pouch)
function ammoSwap(id, fn) {
  const a0 = W(id) && W(id).ammo; fn(); const a1 = W(id) && W(id).ammo;
  if (!a0 || !a1 || a0 === a1) return;
  W8.reserve[a0] = (W8.reserve[a0] || 0) + (W8.mag[id] || 0); W8.mag[id] = 0; delete W8.pin[id]; delete W8.relSave[id];
  const m = (W8.mods[id] || []).find(k => MODS[k].ammo === a1), got = W8.kitGift = W8.kitGift || {};
  if (m && MODS[m].gift && !got[m]) { got[m] = true; const n = Math.min(magSize(id), MODS[m].gift); W8.mag[id] = n; W8.reserve[a1] = (W8.reserve[a1] || 0) + MODS[m].gift - n; }
}
// fit a mod; one with a fire mode becomes the weapon's mode straight away, and one that replaces another takes it off
export function addMod(id, m) { ammoSwap(id, () => addMod0(id, m)); }
function addMod0(id, m) {
  const r = MODS[m].replaces;
  W8.mods[id] = (W8.mods[id] || []).filter(k => k !== r); W8.mods[id].push(m);
  if (MODS[m].fm || W8.fm[id] === r) W8.fm[id] = MODS[m].fm ? m : null;
  (MODS[m].locks || []).forEach(k => fitTier(id, k, 0));   // (what it takes the place of comes off: the AK kit's mag and magwell)
  recomputeEff();
}
// take a mod off a gun or put it back. Off, the mod it replaced comes back on (you had it), what needs it comes off with
// it, and a fire mode it gave goes. Back on, it's fitted as when bought (addMod), with what it needs first; a muzzle device
// takes the can or choke and any other muzzle device off (one thing on the end of the barrel)
export function setMod(id, m, on) {
  const off = W8.modOff = W8.modOff || {}, l = off[id] = (off[id] || []).filter(k => k !== m), M = MODS[m];
  if (on) {
    if (M.need && !hasMod(M.need)) setMod(id, M.need, true);
    if (M.muzzle) { fitTier(id, 'supp', 0); fitTier(id, 'choke', 0); (W8.mods[id] || []).filter(k => k !== m && MODS[k].muzzle).forEach(k => setMod(id, k, false)); }
    addMod(id, m);
  } else {
    if (!hasMod(m)) return;
    ammoSwap(id, () => {
      W8.mods[id] = W8.mods[id].filter(k => k !== m); l.push(m);
      if (W8.fm[id] === m || (M.semi && W8.fm[id] === 'semi')) W8.fm[id] = null;
      if (M.replaces && !W8.mods[id].includes(M.replaces)) W8.mods[id].push(M.replaces);
      W8.mods[id].filter(k => MODS[k].need === m).forEach(k => setMod(id, k, false));
      recomputeEff();
    });
  }
}
export function improveMod(m) { W8.modLv[m] = modLv(m) + 1; recomputeEff(); }
// B steps through single shots and each fire mode the weapon has (single → burst → full auto → single)
// what a gun fires as, for the HUD: the mode selected on it, or what the gun does by itself (an automatic's stream, a pump,
// bolt or break action's one round, a handgun's single shots); n is how many rounds a burst sends
const ACTION_MODE = { pump: 'Pump', hunting: 'Bolt', dbl: 'Single' };   // (the double's one barrel at a time: its twin trigger's both at once is 'Twin')
export function fireModeOf(id) {
  const D = W(id); if (!D || D.melee) return null;
  const fm = W8.fm[id];
  if (D.burst) return { k: 'burst', t: 'Burst ' + D.burst, n: D.burst };
  if (fm === 'auto') return { k: 'auto', t: 'Auto' };
  if (fm === 'semi') return { k: 'semi', t: 'Semi' };
  if (D.akKit) return { k: 'auto', t: 'Auto' };   // (the battle rifle's AK conversion: weapons/gun-mods.js)
  if (D.fan) return fanning(D) ? { k: 'fan', t: 'Fan' } : { k: 'semi', t: 'Aimed' };   // fanned from the hip, single shots down the sights
  if (fm === 'both') return { k: 'both', t: 'Twin' };   // the double barrel's twin trigger, both barrels at once
  if (ACTION_MODE[id]) return { k: 'action', t: ACTION_MODE[id] };
  if (WEAP[id].slot === 'auto' || id === 'auto12') return { k: 'auto', t: 'Auto' };
  return { k: 'semi', t: 'Semi' };
}
// modes a gun has out of the box, besides its own: the assault rifle's selector has semi (SEMI: steadier single shots,
// game/run-state.js)
const OWN_MODES = { ar: ['semi'] };
export function fireModes(id) { return [null, ...(OWN_MODES[id] || []), ...((W8.mods[id] || []).some(m => MODS[m].semi) ? ['semi'] : []), ...Object.keys(MODS).filter(m => MODS[m].fm && (W8.mods[id] || []).includes(m))]; }   // (semi: a mod that makes it an automatic, with a semi setting)
export function cycleFireMode(id) {
  const modes = fireModes(id); if (modes.length < 2) return null;
  const next = modes[(modes.indexOf(W8.fm[id] || null) + 1) % modes.length];
  W8.fm[id] = next; W8.burstLeft = 0; recomputeEff();
  return next === 'semi' ? 'Semi-auto' : next ? MODS[next].fm : id === 'revolver' ? 'Aimed shots' : WEAP[id].slot === 'auto' || W(id).akKit ? 'Full auto' : 'Single shots';
}
