// Per-run state: S (stats), W8 (weapons), run (score), effective weapon stats and tier lookups.

const hasShotgun = () => !!(W8.slot.long && WEAP[W8.slot.long].ammo === 'shells');
let S, W8, run, EFF = {};
function freshRun() {
  S = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, pierce: 0, dropMul: 1, boardMul: 1, meleeMul: 1, planks: 6, scrap: 4,
    spreadMul: 1, headBonus: 0, headMul: 2.2, severMul: 1, healOnKill: 0, headHeal: false, vampire: false, regen: 0, dmgTaken: 1, slowRes: 0, soles: 0, stubborn: false, boardSpeed: 1, secondWind: false, windUsed: false, adrenaline: false,
    cone: 1.2, near: 2.4, nightVis: 0, vaultMul: 1, vaultFire: false, lungs: false, hoard: false, btNext: 0, bulletTime: false, lastStand: false,
    swapMul: 1, bandMul: 1, ammoMul: 1, luck: 0, momentum: false, momK: 0, momT: -9, hardened: false,
    att: { bayonet: false, fire: false, stock: false }, tier: {}, med: { hands: 0, dress: 0, tonic: 0 }, pouch: false };
  Object.keys(TIERS).forEach(k => S.tier[k] = 0);
  W8 = { slot: { melee: 'bat', side: 'pistol', long: null, auto: null }, mods: {}, modLv: {}, fm: {}, gt: {}, mag: { pistol: 13 }, reserve: { p9: 65, magnum: 0, shells: 0, rifle: 0 },
    cur: 'side', cd: 0, swingDur: 0.4, hitDone: true, swingSide: 1, reloading: null, reloadT: 0, reloadMax: 1, shellsIn: 0, shellsNeed: 0, swing: 0, burstLeft: 0, burstT: 0, akSide: 1, akMag: {}, akRel: null, akCd: { L: 0, R: 0 }, akBurst: { L: 0, R: 0 }, akBurstT: { L: 0, R: 0 }, akLock: { L: false, R: false }, glCd: 0, pin: {}, spent: {}, cyc: null, open: {}, boltOpen: false, bloodW: {}, tune: {}, spray: 0, sprayT: 0 };
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
    D.headX = (D.headX || 0) + (ammo >= 3 ? HEAD_UP.ammo : 0) + HEAD_UP.sight[sight];   // a bigger headshot multiplier (zombies/zombie-types.js)
    // a scope lands crits: a quarter of the hits through it do double damage (on the revolver, on top of its aimed
    // Dead-eye crits, D.aimCrit); the hunting rifle's
    // high-power scope (its stat, weapons/gun-mods.js) does better
    if (sight >= 3 && SCOPE_GUNS.has(id)) { D.critC = Math.max(D.critC || 0, 0.25); D.critM = Math.max(D.critM || 0, 2); }
    D.rate /= [1, 1.18, 1.357, 1.628][trig];
    if (D.mag) D.mag *= (MAG_UP[id] || MAG_UP.all)[mag];
    // a bigger magazine is heavier and fiddlier to seat, so a mag change takes longer the more it holds over the gun's own
    // (a tube or cylinder fed a round at a time doesn't care, and a second gun's mag is its own). A pair's reload is one
    // gun's (weapons/akimbo.js): done one-handed, each takes AK_ONE of a lone gun's (and longer again, AK_TAC or AK_EMPTY there), so both take far longer than one
    if (D.reload && !D.perShell && !D.speedload && D.mag) { const r = D.mag / (WEAP[id].mag * (D.akimbo ? 2 : 1)); if (r > 1.01) D.reload *= 1 + MAG_SLOW * Math.log2(r); }
    if (D.akimbo) D.reload *= AK_ONE;
    D.aimK = SIGHT_AIM[sight]; D.hipK = LASER_HIP[laser];   // a sight steadies the aim down the sights, a laser the hip (weapons/firing.js: spreadOf)
    if ((g.supp || 0) >= 3) D.pierce = (D.pierce || 0) + 1;   // the heavy-duty can: bullets go through one more zombie
    if (W8.fm && W8.fm[id] === 'semi') { D.spread *= SEMI.spread; D.shake *= SEMI.shake; }   // the AR on semi: a steadier single shot a pull
    EFF[id] = D;
  }
}
const W = id => EFF[id];
// Through and through (S.pierce, stations/recipes.js) is for guns that don't already push rounds through more zombies
// with something of their own: flechettes, the revolver's longer barrels, slugs, or the heavy-duty can leave it out
const PIERCE_MODS = new Set(['flech', 'longbarrel', 'slug']);
const ownPierce = id => (W8.mods[id] || []).some(m => PIERCE_MODS.has(m)) || gunTier(id, 'supp') >= 3;
const skillPierce = id => id && ownPierce(id) ? 0 : S.pierce;
// how much longer a mag change takes for each doubling of the magazine, and one of a pair's reload against a lone gun's
const MAG_SLOW = 0.3, AK_ONE = 1;
// how much each magazine tier holds against the gun's own: most guns step up through three, the drum shotgun's one step is
// its 20-shell drum against its box of 8 (MAG_STEPS, upgrades/upgrades.js)
const MAG_UP = { all: [1, 1.4, 2.0, 2.7], auto12: [1, 2.5] };
// an automatic switched to semi (OWN_MODES, weapons/mod-levels.js): one round a pull, each laid tighter and kicking less
const SEMI = { spread: 0.7, shake: 0.75 };
// each attachment does its own job, none of them the same thing twice: a sight tightens the shots you aim down the
// sights (and raises the headshot multiplier, HEAD_UP), a laser tightens the ones from the hip (and shows where they
// go), the shoulder stock only steadies the kick (STOCK, weapons/firing.js), a muzzle can quietens and hits harder, a
// choke squeezes the pellets, a light lights. SIGHT_AIM and LASER_HIP: each tier's spread, against none fitted
const SIGHT_AIM = [1, 0.75, 0.6, 0.6], LASER_HIP = [1, 0.8, 0.6];
// what match-grade rounds and each sight add to a gun's headshot multiplier (on top of S.headMul's 2.2×)
const HEAD_UP = { ammo: 0.3, sight: [0, 0.15, 0.3, 0.3] };
// a workbench tune-up (stations/recipes.js): one go per weapon, a little better at everything it does. Worth about a
// fifth more damage a second, roughly what one ammo tier gives, which is why it's the dearest thing on the bench. A
// tuned gun also lands crits: TUNE.crit of its hits on any shot (D.critT, scoped or not), and every crit it lands, a
// scope's included, hits TUNE.critM harder (D.critUp; weapons/firing.js)
const TUNE = { dmg: 1.1, rate: 1 / 1.1, reload: 0.85, spread: 0.85, reach: 0.15, kb: 1.15, crit: 0.08, critM: 0.25 };
function tuneUp(D) {
  D.dmg *= TUNE.dmg; D.rate *= TUNE.rate;
  if (D.melee) { D.range += TUNE.reach; D.kb *= TUNE.kb; return; }
  D.critT = (D.critT || 0) + TUNE.crit; D.critUp = (D.critUp || 0) + TUNE.critM;
  if (D.reload) D.reload *= TUNE.reload;
  if (D.perShell) D.perShell *= TUNE.reload;
  D.spread *= TUNE.spread; D.shake *= TUNE.spread;   // steadier, so the kick throws the aim off less too
}
const GUN_TIERS = new Set(['ammo', 'trigger', 'mag', 'supp', 'sight', 'laser', 'light', 'choke', 'loader']);
// the only guns a real scope (the third sight tier) goes on: the two rifles, and the revolver (a handgun scope, on the
// rail it gets with any optic: weapons/gun-models.js)
const SCOPE_GUNS = new Set(['hunting', 'ar', 'revolver']);
// a speed loader: the revolver's reload with one (seconds), and how long each go of two or three shells takes against
// a single shell (longer, but each shell is in quicker: about 1.6 and 2.2 times as fast overall)
const REV_LOAD = 1.15, LOADER_T = [1, 1.3 * 0.92, 1.6 * 0.85];
let tierCtx = null;
// which gun a tier lookup is about; defaults to the one in your hands
const gunTier = (id, k) => (id && W8.gt && W8.gt[id] && W8.gt[id][k]) || 0;
const T = k => !GUN_TIERS.has(k) ? S.tier[k] : k === 'mag' ? magTierIn(tierCtx || curId()) : gunTier(tierCtx || curId(), k);
// a new magazine bought for a gun doesn't jump into it: the mag that's in it stays (its size, and the model's mag) until
// you next change mags (weapons/reload.js). W8.pin holds, for a magazine-fed gun upgraded since its last mag change, the
// tier and capacity of the one still in it. Guns fed a round at a time, the revolver's cylinder and an akimbo pair take
// the change at once
const magTierIn = id => (id && W8.pin && W8.pin[id]) ? W8.pin[id].t : gunTier(id, 'mag');
const magCap = id => (W8.pin && W8.pin[id]) ? W8.pin[id].cap : magSize(id);
function magChange(id, fn) {
  const D0 = id && W(id), cap0 = D0 ? magSize(id) : 0, t0 = gunTier(id, 'mag');
  fn();
  const D = id && W(id); if (!D || !D0) return;
  if (D.melee || D.perShell || D.speedload || D.akimbo || D0.akimbo) { delete W8.pin[id]; return; }   // these take it at once (a waiting mag too)
  if ((magSize(id) !== cap0 || gunTier(id, 'mag') !== t0) && !W8.pin[id]) W8.pin[id] = { cap: cap0, t: t0 };
}
// the old mag's out: the new one goes in, model and all
function magSwapIn(id) { if (W8.pin && W8.pin[id]) { delete W8.pin[id]; buildGuns(); } }
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
