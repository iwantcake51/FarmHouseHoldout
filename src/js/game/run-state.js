// Per-run state: S (stats), W8 (weapons), run (score), effective weapon stats and tier lookups.

const hasShotgun = () => !!(W8.slot.long && WEAP[W8.slot.long].ammo === 'shells');
let S, W8, run, EFF = {};
function freshRun() {
  S = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, pierce: 0, dropMul: 1, boardMul: 1, meleeMul: 1, planks: 6, scrap: 4,
    spreadMul: 1, headBonus: 0, headMul: 2.2, severMul: 1, healOnKill: 0, vampire: false, regen: 0, dmgTaken: 1, slowRes: 0, boardSpeed: 1, secondWind: false, windUsed: false, adrenaline: false,
    cone: 1.2, near: 2.4, nightVis: 0, vaultMul: 1, lungs: false, scrapMul: 1, bulletTime: false, lastStand: false,
    att: { bayonet: false, fire: false, stock: false }, tier: {}, med: { hands: 0, dress: 0, tonic: 0 }, pouch: false };
  Object.keys(TIERS).forEach(k => S.tier[k] = 0);
  W8 = { slot: { melee: 'bat', side: 'pistol', long: null, auto: null }, mods: {}, modLv: {}, fm: {}, gt: {}, mag: { pistol: 13 }, reserve: { p9: 65, magnum: 0, shells: 0, rifle: 0 },
    cur: 'side', cd: 0, swingDur: 0.4, hitDone: true, swingSide: 1, reloading: null, reloadT: 0, reloadMax: 1, shellsIn: 0, shellsNeed: 0, swing: 0, burstLeft: 0, burstT: 0, akSide: 1, glCd: 0, spent: {}, cyc: null, bloodW: {}, tune: {}, spray: 0, sprayT: 0 };
  run = { wave: 0, kills: 0, shots: 0, hits: 0, boards: 0, time: 0, limbs: 0, heads: 0, taken: [] };
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
    D.dmg *= [1, 1.25, 1.5, 1.875][ammo] * Math.pow(1.08, (W8.tune && W8.tune[id]) || 0);   // workbench tuning, per weapon
    D.headBonus = (D.headBonus || 0) + (ammo >= 3 ? 0.1 : 0) + [0, 0.04, 0.1, 0.22][sight];
    D.rate /= [1, 1.18, 1.357, 1.628][trig];
    if (D.mag) D.mag *= [1, 1.4, 2.0, 2.7][mag];
    D.spread *= [1, 0.85, 0.68, 0.68][sight] * [1, 0.85, 0.6][laser];
    if ((g.supp || 0) >= 3) D.pierce = (D.pierce || 0) + 1;   // the heavy-duty can: bullets go through one more zombie
    EFF[id] = D;
  }
}
const W = id => EFF[id];
const GUN_TIERS = new Set(['ammo', 'trigger', 'mag', 'supp', 'sight', 'laser', 'light', 'choke']);
let tierCtx = null;
// which gun a tier lookup is about; defaults to the one in your hands
const gunTier = (id, k) => (id && W8.gt && W8.gt[id] && W8.gt[id][k]) || 0;
const T = k => GUN_TIERS.has(k) ? gunTier(tierCtx || curId(), k) : S.tier[k];
const curId = () => W8.slot[W8.cur];
const hasMod = m => (W8.mods[MODS[m].w] || []).includes(m);
const held = id => W8.slot[WEAP[id].slot] === id;
const magSize = id => Math.max(1, Math.round(W(id).mag * S.magMul));
const suppressed = D => !!D.quiet || (T('supp') > 0 && !(D.ammo === 'shells' && T('choke') > 0));
const suppMul = D => D.quiet ? 1 : suppressed(D) ? [1, 1.1, 1.2, 1.3][T('supp')] : 1;
