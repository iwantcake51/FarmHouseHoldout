// Mod levels and fire modes. Tinkering at the workbench can improve a mod you already have, up to level III;
// each level adds its step below on top of the mod itself. Mods with a fire mode (fm) are picked with V.

const MOD_MAX = 3;
const MOD_UP = {
  match: { t: '+12% damage, less drop-off at range', up: D => { D.dmg *= 1.12; D.reach += 0.3; } },
  burst: { t: '+1 round a burst, +6% damage', up: D => { D.burst += 1; D.dmg *= 1.06; } },
  auto: { t: 'Fires 12% faster, +6% damage', up: D => { D.rate *= 0.88; D.dmg *= 1.06; } },
  akimbo: { t: 'Fires 10% faster', up: D => { D.rate *= 0.9; } },
  longbarrel: { t: '+12% damage, less drop-off at range', up: D => { D.dmg *= 1.12; D.reach += 0.3; } },
  fan: { t: 'Spread −20%', up: D => { D.spread *= 0.8; } },
  boom: { t: 'Bigger blasts', up: D => { D.explode += 0.35; } },
  comp: { t: 'Spread and kick −20%', up: D => { D.spread *= 0.8; D.shake *= 0.8; } },
  dragon: { t: '+10% damage', up: D => { D.dmg *= 1.1; } },
  slug: { t: '+15% damage', up: D => { D.dmg *= 1.15; } },
  slam: { t: 'Fires 10% faster', up: D => { D.rate *= 0.9; } },
  tube: { t: '+2 shells', up: D => { D.mag += 2; } },
  sawn: { t: '+2 pellets', up: D => { D.pellets += 2; } },
  both: { t: '+10% damage', up: D => { D.dmg *= 1.1; } },
  flech: { t: 'Pierce +1', up: D => { D.pierce = (D.pierce || 0) + 1; } },
  bolt: { t: 'Bolt works 12% faster', up: D => { D.rate *= 0.88; } },
  hpscope: { t: 'Crit chance +10%, crits +0.25×', up: D => { D.critC += 0.1; D.critM += 0.25; } },
  expand: { t: '+12% damage', up: D => { D.dmg *= 1.12; } },
  akimbo2: { t: 'Fires 10% faster', up: D => { D.rate *= 0.9; } },
  ported: { t: 'Spread −20%', up: D => { D.spread *= 0.8; } },
  integral: { t: '+10% damage', up: D => { D.dmg *= 1.1; } },
  stack: { t: '+25% magazine', up: D => { D.mag *= 1.25; } },
  gl: { t: 'Recharges 25% faster', up: D => { D.glRecharge *= 0.75; } },
  heavy: { t: '+10% damage, spread −10%', up: D => { D.dmg *= 1.1; D.spread *= 0.9; } },
  belt: { t: '+50 rounds', up: D => { D.mag += 50; } },
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
const roman = n => ['', 'I', 'II', 'III', 'IV'][n] || String(n);
const modLv = m => (W8.modLv && W8.modLv[m]) || 1;
const modName = m => MODS[m].name + (modLv(m) > 1 ? ' ' + roman(modLv(m)) : '');
// the weapon's mods that tinkering could still improve
const modUps = id => id ? (W8.mods[id] || []).filter(m => MOD_UP[m] && modLv(m) < MOD_MAX) : [];
// whether a mod can be offered: not one you have, not one something you have replaced, and its prerequisite (at the
// level it asks for) fitted
const modReplaced = m => Object.keys(MODS).some(k => MODS[k].replaces === m && hasMod(k));
const modOffer = m => !hasMod(m) && !modReplaced(m) && (!MODS[m].need || (hasMod(MODS[m].need) && modLv(MODS[m].need) >= (MODS[m].needLv || 1))) && !(MODS[m].muzzle && muzzleTaken(MODS[m].w));
// one thing on the end of the barrel: a can or a choke from the bench, or a muzzle device mod (weapons/gun-mods.js)
const muzzleTaken = id => !!(gunTier(id, 'supp') || gunTier(id, 'choke') || (W8.mods[id] || []).some(m => MODS[m].muzzle));
// fit a mod; one with a fire mode becomes the weapon's mode straight away, and one that replaces another takes it off
function addMod(id, m) {
  const r = MODS[m].replaces;
  W8.mods[id] = (W8.mods[id] || []).filter(k => k !== r); W8.mods[id].push(m);
  if (MODS[m].fm || W8.fm[id] === r) W8.fm[id] = MODS[m].fm ? m : null;
  recomputeEff();
}
function improveMod(m) { W8.modLv[m] = modLv(m) + 1; recomputeEff(); }
// B steps through single shots and each fire mode the weapon has (single → burst → full auto → single)
// what a gun fires as, for the HUD: the mode selected on it, or what the gun does by itself (an automatic's stream, a pump,
// bolt or break action's one round, a handgun's single shots); n is how many rounds a burst sends
const ACTION_MODE = { pump: 'Pump', hunting: 'Bolt', dbl: 'Break' };
function fireModeOf(id) {
  const D = W(id); if (!D || D.melee) return null;
  const fm = W8.fm[id];
  if (D.burst) return { k: 'burst', t: 'Burst ' + D.burst, n: D.burst };
  if (fm === 'auto') return { k: 'auto', t: 'Auto' };
  if (fm === 'fan') return { k: 'fan', t: 'Fan' };
  if (ACTION_MODE[id]) return { k: 'action', t: ACTION_MODE[id] };
  if (WEAP[id].slot === 'auto' || id === 'auto12') return { k: 'auto', t: 'Auto' };
  return { k: 'semi', t: 'Semi' };
}
function fireModes(id) { return [null, ...Object.keys(MODS).filter(m => MODS[m].fm && (W8.mods[id] || []).includes(m))]; }
function cycleFireMode(id) {
  const modes = fireModes(id); if (modes.length < 2) return null;
  const next = modes[(modes.indexOf(W8.fm[id] || null) + 1) % modes.length];
  W8.fm[id] = next; W8.burstLeft = 0; recomputeEff();
  return next ? MODS[next].fm : id === 'revolver' ? 'Aimed shots' : 'Single shots';
}
