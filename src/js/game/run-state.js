// Per-run state: S (stats), W8 (weapons), run (score), effective weapon stats and tier lookups.

const hasShotgun = () => !!(W8.slot.long && WEAP[W8.slot.long].ammo === 'shells');
let S, W8, run, EFF = {};
function freshRun() {
  S = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, pierce: 0, dropMul: 1, boardMul: 1, meleeMul: 1, planks: 6, scrap: 4,
    spreadMul: 1, headBonus: 0, headMul: 2.2, severMul: 1, healOnKill: 0, headHeal: false, vampire: false, regen: 0, dmgTaken: 1, slowRes: 0, boardSpeed: 1, secondWind: false, windUsed: false, adrenaline: false,
    cone: 1.2, near: 2.4, nightVis: 0, vaultMul: 1, vaultFire: false, lungs: false, scrapMul: 1, bulletTime: false, lastStand: false,
    att: { bayonet: false, fire: false, stock: false }, tier: {}, med: { hands: 0, dress: 0, tonic: 0 }, pouch: false };
  Object.keys(TIERS).forEach(k => S.tier[k] = 0);
  W8 = { slot: { melee: 'bat', side: 'pistol', long: null, auto: null }, mods: {}, modLv: {}, fm: {}, gt: {}, mag: { pistol: 13 }, reserve: { p9: 65, magnum: 0, shells: 0, rifle: 0 },
    cur: 'side', cd: 0, swingDur: 0.4, hitDone: true, swingSide: 1, reloading: null, reloadT: 0, reloadMax: 1, shellsIn: 0, shellsNeed: 0, swing: 0, burstLeft: 0, burstT: 0, akSide: 1, glCd: 0, spent: {}, cyc: null, open: {}, boltOpen: false, bloodW: {}, tune: {}, spray: 0, sprayT: 0 };
  run = { wave: 0, kills: 0, shots: 0, hits: 0, boards: 0, time: 0, limbs: 0, heads: 0, taken: [], bought: [] };
  recomputeEff();
}
function recomputeEff() {
  for (const id in WEAP) {
    const D = Object.assign({}, WEAP[id]);
    // each mod and its levels; of the fire-mode mods only the selected mode counts
    (W8.mods[id] || []).forEach(m => { if (MODS[m].fm && W8.fm[id] !== m) return; MODS[m].stat(D); for (let k = 1; k < modLv(m); k++) MOD_UP[m].up(D); });
    // this gun's own upgrade tiers
    const g = (W8.gt && W8.gt[id]) || {};
    const ammo = g.ammo || 0, trig = g.trigger || 0, mag = g.mag || 0, sight = g.sight || 0, laser = g.laser || 0;
    D.dmg *= [1, 1.25, 1.5, 1.875][ammo];
    const loader = g.loader || 0;
    if (loader && id === 'revolver') { D.perShell = 0; D.reload = REV_LOAD; D.speedload = true; }   // six at once
    else if (loader && D.perShell) { D.loadN = 1 + loader; D.perShell *= LOADER_T[loader]; }         // two or three shells a go
    if (W8.tune && W8.tune[id]) tuneUp(D);   // a workbench tune-up, per weapon
    reachCleave(D);   // long enough and it sweeps through more than one (melee/melee-stats.js)
    D.headBonus = (D.headBonus || 0) + (ammo >= 3 ? 0.1 : 0) + [0, 0.04, 0.1, 0.1][sight];
    // a scope fitted to a long gun lands crits: a quarter of the hits through it do double damage; the hunting rifle's
    // high-power scope (its stat, weapons/gun-mods.js) does better
    if (sight >= 3 && D.slot !== 'side') { D.critC = Math.max(D.critC || 0, 0.25); D.critM = Math.max(D.critM || 0, 2); }
    D.rate /= [1, 1.18, 1.357, 1.628][trig];
    if (D.mag) D.mag *= [1, 1.4, 2.0, 2.7][mag];
    // a bigger magazine is heavier and fiddlier to seat, so a mag change takes longer the more it holds over the gun's own
    // (a tube or cylinder fed a round at a time doesn't care, and a second gun's mag is its own); two guns take longer
    // to reload than one (they're done one after the other), and each pull of the trigger fires a burst from both
    if (D.reload && !D.perShell && !D.speedload && D.mag) { const r = D.mag / (WEAP[id].mag * (D.akimbo ? 2 : 1)); if (r > 1.01) D.reload *= 1 + MAG_SLOW * Math.log2(r); }
    if (D.akimbo) { D.reload *= AK_RELOAD; if (D.burst) D.burst *= 2; }
    D.spread *= [1, 0.85, 0.68, 0.68][sight] * [1, 0.85, 0.6][laser];
    if ((g.supp || 0) >= 3) D.pierce = (D.pierce || 0) + 1;   // the heavy-duty can: bullets go through one more zombie
    EFF[id] = D;
  }
}
const W = id => EFF[id];
// how much longer a mag change takes for each doubling of the magazine, and how much longer two guns take than one
const MAG_SLOW = 0.3, AK_RELOAD = 1.45;
// a workbench tune-up (stations/recipes.js): one go per weapon, a little better at everything it does. Worth about a
// fifth more damage a second, roughly what one ammo tier gives, which is why it's the dearest thing on the bench
const TUNE = { dmg: 1.1, rate: 1 / 1.1, reload: 0.85, spread: 0.85, reach: 0.15, kb: 1.15 };
function tuneUp(D) {
  D.dmg *= TUNE.dmg; D.rate *= TUNE.rate;
  if (D.melee) { D.range += TUNE.reach; D.kb *= TUNE.kb; return; }
  if (D.reload) D.reload *= TUNE.reload;
  if (D.perShell) D.perShell *= TUNE.reload;
  D.spread *= TUNE.spread; D.shake *= TUNE.spread;   // steadier, so the kick throws the aim off less too
}
const GUN_TIERS = new Set(['ammo', 'trigger', 'mag', 'supp', 'sight', 'laser', 'light', 'choke', 'loader']);
// a speed loader: the revolver's reload with one (seconds), and how long each go of two or three shells takes against
// a single shell (longer, but each shell is in quicker: about 1.6 and 2.2 times as fast overall)
const REV_LOAD = 1.15, LOADER_T = [1, 1.3 * 0.92, 1.6 * 0.85];
let tierCtx = null;
// which gun a tier lookup is about; defaults to the one in your hands
const gunTier = (id, k) => (id && W8.gt && W8.gt[id] && W8.gt[id][k]) || 0;
const T = k => GUN_TIERS.has(k) ? gunTier(tierCtx || curId(), k) : S.tier[k];
const curId = () => W8.slot[W8.cur];
const hasMod = m => (W8.mods[MODS[m].w] || []).includes(m);
const held = id => W8.slot[WEAP[id].slot] === id;
const magSize = id => Math.max(1, Math.round(W(id).mag * S.magMul));
// how the weapon in your hands sets your pace: a blade or a bat is lighter than nothing much (the two-handers less so);
// primaries weigh you down by their calibre, how many rounds they hold and every attachment bolted on. Sidearms don't count.
function carryMul(id) {
  const D = id && W(id); if (!D) return 1;
  if (D.melee) return D.two ? 1.03 : 1.07;
  if (D.slot !== 'long' && D.slot !== 'auto') return 1;
  const gt = W8.gt[id] || {}, att = ['supp', 'choke', 'sight', 'laser', 'light'].reduce((n, k) => n + (gt[k] || 0), 0) + (S.att.bayonet && D.slot === 'long' ? 1 : 0);
  const cal = D.ammo === 'rifle' ? 0.05 : D.ammo === 'shells' ? 0.04 : 0.025, mag = Math.min(0.07, magSize(id) / 30 * 0.03);
  return clamp(1 - cal - mag - att * 0.008, 0.8, 1);
}
const suppressed = D => !!D.quiet || (T('supp') > 0 && !(D.ammo === 'shells' && T('choke') > 0));
const suppMul = D => D.quiet ? 1 : suppressed(D) ? [1, 1.1, 1.2, 1.3][T('supp')] : 1;
