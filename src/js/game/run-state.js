// Per-run state: S (stats), W8 (weapons), run (score), effective weapon stats and tier lookups.

const hasShotgun = () => !!(W8.slot.long && WEAP[W8.slot.long].ammo === 'shells');
let S, W8, run, EFF = {};
// the stats a run starts with, before any skill (the cheat menu, ui/cheats.js, rebuilds skills on top of these)
function freshStats() {
  const s = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, pierce: 0, dropMul: 1, boardMul: 1, meleeMul: 1, planks: 6, scrap: 4,
    spreadMul: 1, headBonus: 0, headMul: 2.2, severMul: 1, healOnKill: 0, headHeal: false, vampire: false, regen: 0, dmgTaken: 1, slowRes: 0, soles: 0, stubborn: false, boardSpeed: 1, secondWind: false, windUsed: false, adrenaline: false,
    cone: 1.2, near: 2.4, nightVis: 0, vaultMul: 1, vaultFire: false, runGun: 0, lungs: false, hoard: false, btNext: 0, bulletTime: false, lastStand: false,
    swapMul: 1, bandMul: 1, ammoMul: 1, luck: 0, momentum: false, momK: 0, momT: -9, steady: 0, swingStam: 1,
    tier: {}, med: { hands: 0, dress: 0, tonic: 0 }, pouch: false };
  Object.keys(TIERS).forEach(k => s.tier[k] = 0);
  return s;
}
function freshRun() {
  S = freshStats();
  W8 = { slot: { melee: 'bat', side: 'pistol', long: null, auto: null }, mods: {}, modLv: {}, fm: {}, gt: {}, mag: { pistol: 13 }, reserve: { p9: 65, magnum: 0, shells: 0, rifle: 0 },
    cur: 'side', cd: 0, swingDur: 0.4, hitDone: true, rounds: {}, relSave: {}, att: {}, swingSide: 1, reloading: null, reloadT: 0, reloadMax: 1, shellsIn: 0, shellsNeed: 0, relStop: false, brkOpen: false, shutT: 0, shutMax: 1, shutQ: false, shutFire: 0, swing: 0, burstLeft: 0, burstT: 0, akSide: 1, akMag: {}, akRel: null, akCd: { L: 0, R: 0 }, akBurst: { L: 0, R: 0 }, akBurstT: { L: 0, R: 0 }, akLock: { L: false, R: false }, glCd: 0, pin: {}, spent: {}, hudSpent: {}, cyc: null, open: {}, boltOpen: false, bloodW: {}, tune: {}, spray: 0, sprayT: 0 };
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
    // a bigger headshot multiplier (zombies/zombie-types.js): match-grade rounds on any gun, a sight only on a sniper
    D.headX = (D.headX || 0) + (ammo >= 3 ? HEAD_UP.ammo : 0) + (D.sniper ? HEAD_UP.sight[sight] : 0);
    // a sniper looking through a scope: every headshot is a crit, harder with each scope (SCOPES; weapons/firing.js)
    if (D.sniper && sight >= 3) { D.headCrit = true; D.critM = Math.max(D.critM || 0, SCOPES[sight].crit); }
    D.rate /= [1, 1.18, 1.357, 1.628][trig];
    if (D.mag) D.mag *= (MAG_UP[id] || MAG_UP.all)[mag];
    // a bigger magazine is heavier and fiddlier to seat, so a mag change takes longer the more it holds over the gun's own
    // (a tube or cylinder fed a round at a time doesn't care, and a second gun's mag is its own). A pair's reload is one
    // gun's (weapons/akimbo.js): done one-handed, each takes AK_ONE of a lone gun's (and longer again, AK_TAC or AK_EMPTY there), so both take far longer than one
    if (D.reload && !D.perShell && !D.speedload && D.mag) { const r = D.mag / (WEAP[id].mag * (D.akimbo ? 2 : 1)); if (r > 1.01) D.reload *= 1 + MAG_SLOW * Math.log2(r); }
    if (D.akimbo) D.reload *= AK_ONE;
    D.aimK = SIGHT_AIM[sight]; D.aimMove = SIGHT_MOVE[sight]; D.hipK = LASER_HIP[laser];   // a sight steadies the aim down the sights, standing and on the move, a laser the hip (weapons/firing.js: spreadOf)
    if (W8.fm && W8.fm[id] === 'semi') { D.spread *= SEMI.spread; D.shake *= SEMI.shake; }   // the AR on semi: a steadier single shot a pull
    // the one kind of round loaded, last, over everything else (weapons/rounds.js)
    const rk = roundOn(id); if (rk !== 'std' && roundFits(id, rk)) ROUNDS[rk].fx(D, id);
    EFF[id] = D;
  }
}
const W = id => EFF[id];
// how much longer a mag change takes for each doubling of the magazine, and one of a pair's reload against a lone gun's
const MAG_SLOW = 0.3, AK_ONE = 1;
// how much each magazine tier holds against the gun's own: most guns step up through three, the drum shotgun's one step is
// its 20-shell drum against its box of 8 (MAG_STEPS, upgrades/upgrades.js)
const MAG_UP = { all: [1, 1.4, 2.0, 2.7], auto12: [1, 2.5] };
// an automatic switched to semi (OWN_MODES, weapons/mod-levels.js): one round a pull, each laid tighter and kicking less
const SEMI = { spread: 0.7, shake: 0.75 };
// each attachment does its own job, none of them the same thing twice: a sight (red dot, holo, then the scopes)
// tightens only the shots you aim down the sights, and takes some of the spread that moving adds to them (a scope
// zooms in too; on a sniper a sight also raises the headshot multiplier, HEAD_UP, and through a scope every headshot
// crits, SCOPES), a laser tightens the ones from the hip (and shows where they go), the shoulder stock only steadies
// the kick (STOCK, weapons/firing.js), a muzzle can quietens and hits harder, a choke squeezes the pellets, a light
// lights, and the one kind of round loaded does what that round does (weapons/rounds.js). A gun's own mods keep off
// those jobs too: where one would only have done what a line does (a pump's tube extension, the SMG's double-stack and
// integral can, the M60's belt box), the line is it, by that name (TIERS' as, upgrades/tier-table.js); and the guns whose
// rate is their action's (NO_TRIGGER, upgrades/upgrades.js) fire faster by their own mod, not a lighter trigger. SIGHT_AIM and LASER_HIP: each tier's spread, against none fitted; SIGHT_MOVE: how much of the spread that
// moving adds to an aimed shot is left with each sight
const SIGHT_AIM = [1, 0.75, 0.6, 0.48, 0.4, 0.34], SIGHT_MOVE = [1, 0.8, 0.64, 0.51, 0.41, 0.33], LASER_HIP = [1, 0.8, 0.6];
// what match-grade rounds add to any gun's headshot multiplier, and each sight to a sniper's (on top of S.headMul's 2.2×)
const HEAD_UP = { ammo: 0.3, sight: [0, 0.15, 0.3, 0.3, 0.3, 0.3] };
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
// the guns a real scope (the third sight step and up) goes on, and the last step each takes: the revolver its handgun
// scope (on the rail it gets with any optic: weapons/gun-models.js), the assault rifle the ACOG, the hunting rifle the
// high-power scope
const SCOPE_TOP = { revolver: 3, ar: 4, hunting: 5 }, SCOPE_GUNS = new Set(Object.keys(SCOPE_TOP));
// each scope, by its sight step: how much it pulls the view in and out toward the aim while you aim (game/camera.js;
// zoom is the old hold-to-scope view's, player/aiming.js), and how hard a sniper's headshots crit through it
const SCOPES = { 3: { view: 1, zoom: 2.4, crit: 2 }, 4: { view: 1.17, zoom: 2.75, crit: 2.25 }, 5: { view: 1.35, zoom: 3.1, crit: 2.5 } };
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
// the bayonet and the shoulder stock are bought for one gun and stay on it (W8.att[id]), like every other attachment:
// the bayonet only fits a long gun, the stock only a sidearm
const gunAtt = (id, k) => { const D = id && WEAP[id]; return !!(D && W8.att && W8.att[id] && W8.att[id][k] && D.slot === (k === 'bayonet' ? 'long' : 'side')); };
const hasMod = m => (W8.mods[MODS[m].w] || []).includes(m);
const held = id => W8.slot[WEAP[id].slot] === id;
const magSize = id => Math.max(1, Math.round(W(id).mag * S.magMul));
// how the weapon in your hands sets your pace: a blade or a bat is lighter than nothing much (the two-handers less so);
// primaries weigh you down by their calibre, how many rounds they hold and every attachment bolted on. Sidearms don't count.
function carryMul(id) {
  const D = id && W(id); if (!D) return 1;
  if (D.melee) return D.two ? 1.03 : 1.07;
  if (D.slot !== 'long' && D.slot !== 'auto') return 1;
  const gt = W8.gt[id] || {}, att = ['supp', 'choke', 'sight', 'laser', 'light'].reduce((n, k) => n + (gt[k] || 0), 0) + (gunAtt(id, 'bayonet') ? 1 : 0);
  const cal = D.ammo === 'rifle' ? 0.05 : D.ammo === 'shells' ? 0.04 : 0.025, mag = Math.min(0.07, magSize(id) / 30 * 0.03);
  return clamp(1 - cal - mag - att * 0.008, 0.8, 1);
}
const suppressed = D => !!D.quiet || (T('supp') > 0 && !(D.ammo === 'shells' && T('choke') > 0));
const suppMul = D => D.quiet ? 1 : suppressed(D) ? [1, 1.1, 1.2, 1.3][T('supp')] : 1;
