// Per-run state: S (stats), W8 (weapons), run (score), effective weapon stats and tier lookups.

import { clamp, rand } from '../core/math.js';
import { reachCleave } from '../melee/melee-stats.js';
import { WEAP } from '../weapons/gun-stats.js';
import { roundFits, roundOn, ROUNDS } from '../weapons/rounds.js';
import { AUTO_SEAR } from '../weapons/gun-mods.js';
import { MODS } from '../melee/melee-mods.js';
import { MOD_UP, modLv } from '../weapons/mod-levels.js';
import { TIERS, TRIG_UP } from '../upgrades/tier-table.js';
import { buildGuns } from '../weapons/build-weapons.js';

export const hasShotgun = () => !!(W8.slot.long && WEAP[W8.slot.long].ammo === 'shells');
export let S, W8, run, EFF = {};
// the stats a run starts with, before any skill (the cheat menu, ui/cheats.js, rebuilds skills on top of these)
export function freshStats() {
  const s = { dmgMul: 1, rateMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, maxHp: 100, pierce: 0, dropMul: 1, boardMul: 1, meleeMul: 1, planks: 6, scrap: 4,
    spreadMul: 1, headBonus: 0, headMul: 2.2, severMul: 1, healOnKill: 0, headHeal: false, vampire: false, regen: 0, dmgTaken: 1, slowRes: 0, soles: 0, bandLess: 0, stubborn: false, boardSpeed: 1, secondWind: false, windUsed: false, adrenaline: false,
    cone: 1.2, near: 2.4, nightVis: 0, vaultMul: 1, vaultFire: false, runGun: 0, lungs: false, hoard: false, btNext: 0, bulletTime: false, lastStand: false,
    swapMul: 1, bandMul: 1, ammoMul: 1, pickMul: 1, dropLife: 0, luck: 0, sureShot: false, momentum: false, momK: 0, momT: -9, steady: 0, tough: false, swingStam: 1,
    tier: {}, med: { hands: 0, dress: 0, tonic: 0 }, pouch: false, brace: 0 };
  Object.keys(TIERS).forEach(k => s.tier[k] = 0);
  return s;
}
// your health's ceiling: your max health less what a Blood price sacrifice took (S.hpCut, a share of it, so it grows
// with your max health: upgrades/sacrifice.js)
export const hpCap = () => S.maxHp * (1 - (S.hpCut || 0));
// your stamina's ceiling, out of 1: all of it, or the share a Broken stride left you (S.stamCap: upgrades/sacrifice.js)
export const stamMax = () => S.stamCap || 1;
// how much of any healing reaches you: all of it, or a quarter under Bad blood (S.healMul: upgrades/sacrifice.js; a
// supply crate's always patches you up in full, stations/supply-drop.js)
export const healMul = () => S.healMul ?? 1;
export function freshRun() {
  S = freshStats();
  W8 = { slot: { melee: 'bat', side: 'pistol', long: null, auto: null }, owned: ['bat', 'pistol'], rds: {}, mods: {}, modOff: {}, modLv: {}, fm: {}, gt: {}, own: {}, ownAtt: {}, mag: { pistol: 13 }, reserve: { p9: 65, p10: 0, magnum: 0, shells: 0, rifle: 0 },
    cur: 'side', cd: 0, swingDur: 0.4, hitDone: true, rounds: {}, relSave: {}, att: {}, swingSide: 1, reloading: null, reloadT: 0, reloadMax: 1, relTL: null, relU: 0, relSeg: null, relSegK: 0, relRing: null, shellsIn: 0, shellsNeed: 0, goN: 0, goIn: 0, relStop: false, brkOpen: false, shutT: 0, shutMax: 1, shutQ: false, shutFire: 0, swing: 0, burstLeft: 0, burstT: 0, akSide: 1, akMag: {}, akRel: null, akCd: { L: 0, R: 0 }, akBurst: { L: 0, R: 0 }, akBurstT: { L: 0, R: 0 }, akLock: { L: false, R: false }, glCd: 0, pin: {}, spent: {}, hudSpent: {}, cyc: null, open: {}, held: {}, bloodW: {}, tune: {}, spray: 0, sprayT: 0, heavyK: 0, heavyF: 0 };
  run = { wave: 0, kills: 0, shots: 0, hits: 0, boards: 0, time: 0, limbs: 0, heads: 0, taken: [], bought: [], st: {}, dropAt: 0 };   // (st: the end screen's tallies, ui/run-stats.js)
  recomputeEff();
}
export function recomputeEff() {
  for (const id in WEAP) {
    const D = Object.assign({}, WEAP[id]);
    // each mod and its levels; of the fire-mode mods only the selected mode counts
    (W8.mods[id] || []).forEach(m => { if (MODS[m].fm && W8.fm[id] !== m) return; MODS[m].stat(D); for (let k = 1; k < modLv(m); k++) MOD_UP[m].up(D); });
    // this gun's own upgrade tiers
    const g = (W8.gt && W8.gt[id]) || {};
    const ammo = g.ammo || 0, trig = g.trigger || 0, mag = g.mag || 0, sight = g.sight || 0, laser = g.laser || 0;
    D.dmg *= AMMO_DMG[ammo]; D.powK = POWDER_KICK[ammo]; D.shake *= POWDER_KICK[ammo];   // a hotter charge kicks harder too
    const loader = g.loader || 0;
    if (loader && id === 'revolver') { D.perShell = 0; D.reload = REV_LOAD; D.speedload = true; }   // six at once
    else if (loader && id === 'scar') D.reload *= MAGWELL;   // a flared magwell: the new mag funnelled in, a quicker change
    else if (loader && D.breakOpen) { D.loadN = 2; D.perShell *= SOH.shell; D.shutMul = SOH.shut; }  // Sleight of Hand: both at once, quicker
    else if (id === 'pump' && (S.tier.quick | 0) >= 2) { const q = S.tier.quick >= 3 ? TRIPLE : PAIR_LOAD; D.loadN = q.n; D.perShell *= q.t; }   // Quick hands II: two shells a go; III, Triple Load: three
    if (W8.tune && W8.tune[id]) tuneUp(D);   // a workbench tune-up, per weapon
    reachCleave(D);   // long enough and it sweeps through more than one (melee/melee-stats.js)
    // a bigger headshot multiplier (zombies/zombie-types.js): match-grade rounds on any gun, a sight only on a sniper
    D.headX = (D.headX || 0) + (ammo >= 3 ? HEAD_UP.ammo : 0) + (D.sniper ? HEAD_UP.sight[sight] : 0);
    // a sniper looking through a scope: every headshot is a crit, harder with each scope (SCOPES; weapons/firing.js)
    if (D.sniper && sight >= 3) { D.headCrit = true; D.critM = Math.max(D.critM || 0, SCOPES[sight].crit); }
    for (let k = 0; k < trig; k++) D.rate /= D.fullAuto ? 1 + (TRIG_UP[k] - 1) * AUTO_SEAR.trig : TRIG_UP[k];   // each trigger step a little quicker (TRIG_UP, upgrades/tier-table.js), more so on the auto sear's full auto
    if (D.mag) D.mag *= (MAG_UP[id] || MAG_UP.all)[mag];
    // a bigger magazine is heavier and fiddlier to seat, so a mag change takes longer the more it holds over the gun's own
    // (a tube or cylinder fed a round at a time doesn't care, and a second gun's mag is its own). A pair's reload is one
    // gun's (weapons/akimbo.js): done one-handed, each takes AK_ONE of a lone gun's (and longer again, AK_TAC or AK_EMPTY there), so both take far longer than one
    D.magX = D.mag && WEAP[id].mag ? D.mag / ((D.ownMag || WEAP[id].mag) * (D.akimbo ? 2 : 1)) : 1;   // how much more it holds than its own (ownMag: a mod's own mag, the AK kit's)
    if (D.reload && !D.perShell && !D.speedload && D.magX > 1.01) D.reload *= 1 + (MAG_SLOW_OF[id] ?? MAG_SLOW) * Math.log2(D.magX);
    if (D.akimbo) D.reload *= AK_ONE;
    // the hunting rifle's detachable box: no more feeding it a round at a time, a mag change, and the bolt worked after
    if (id === 'hunting' && mag >= 2) { D.perShell = 0; D.reload = DETACH.reload - DETACH.bolt; D.detach = DETACH.bolt; }
    D.aimK = SIGHT_AIM[sight]; D.aimMove = SIGHT_MOVE[sight]; D.settle = LASER_SETTLE[laser];   // a sight steadies the aim down the sights, standing and on the move (weapons/firing.js: spreadOf); a laser settles the recoil sooner
    if (W8.fm && W8.fm[id] === 'semi') { D.spread *= SEMI.spread; D.shake *= SEMI.shake; }   // the AR on semi: a steadier single shot a pull
    // the one kind of round loaded, last, over everything else (weapons/rounds.js)
    const rk = roundOn(id); if (rk !== 'std' && roundFits(id, rk)) ROUNDS[rk].fx(D, id);
    EFF[id] = D;
  }
}
export const W = id => EFF[id];
// a bigger magazine (Extended mags, a drum, a casket, the auto shotgun's drum) has its cost, worse the more it holds over
// the gun's own: for each doubling a mag change takes MAG_SLOW longer (about +40% for an extended mag, +85% for a drum,
// +120% for a casket or the auto shotgun's drum), and you walk MAG_WALK slower with it in your hands (about 5%, 10%, 14%:
// carryMul). AK_ONE: one of a pair's reload against a lone gun's
const MAG_SLOW = 0.85, MAG_WALK = 0.1, AK_ONE = 1;
// a gun whose bigger box costs it less than that: the SCAR's 20 takes about 45% longer to change than its 10
const MAG_SLOW_OF = { scar: 0.3 };
// how much each magazine tier holds against the gun's own: most guns step up through three, the auto shotgun's one step is
// its 20-shell drum against its box of 8 (MAG_STEPS, upgrades/upgrades.js)
export const MAG_UP = { all: [1, 1.4, 2.0, 2.7], auto12: [1, 2.5], sub: [1, 40 / 30, 50 / 30], hunting: [1, 7 / 5, 10 / 5], scar: [1, 2] };   // (the MP5: a 40-round mag, then a 50-round drum; the rifle: 7 in its fixed mag extended, then a 10-round box; the SCAR: its 20-round box)
// the hunting rifle's detachable 10-round box (its second mag step): a whole reload takes reload seconds, the mag
// change and then bolt seconds of working the bolt back and forward to chamber a round (weapons/reload.js, chamberCycle
// in weapons/casings.js)
export const DETACH = { reload: 2.45, bolt: 0.75 };
// an automatic switched to semi (OWN_MODES, weapons/mod-levels.js): one round a pull, each laid tighter and kicking less
const SEMI = { spread: 0.7, shake: 0.75 };
// each attachment does its own job, none of them the same thing twice: a sight (red dot, holo, then the scopes)
// tightens only the shots you aim down the sights, and takes some of the spread that moving adds to them (a scope
// zooms in too; on a sniper a sight also raises the headshot multiplier, HEAD_UP, and through a scope every headshot
// crits, SCOPES), a laser shows where they go and brings the gun back on target sooner after the kick (it takes none of
// the kick itself: LASER_SETTLE), the shoulder stock only steadies
// the kick (STOCK, weapons/firing.js), a muzzle can quietens and hits harder, a choke squeezes the pellets, a light
// lights, and the one kind of round loaded does what that round does (weapons/rounds.js). A gun's own mods keep off
// those jobs too: where one would only have done what a line does (a pump's tube extension, the SMG's double-stack and
// integral can, the M60's belt box), the line is it, by that name (TIERS' as, upgrades/tier-table.js); and the guns whose
// rate is their action's (NO_TRIGGER, upgrades/upgrades.js) fire faster by their own mod, not a lighter trigger. SIGHT_AIM: each tier's spread, against none fitted; SIGHT_MOVE: how much of the spread that
// moving adds to an aimed shot is left with each sight
// each step of a gun's ammo line against stock rounds: hollow points, +P loads, match-grade (upgrades/tier-table.js)
export const AMMO_DMG = [1, 1.25, 1.5, 1.875];
// and how much harder each step kicks: the gun back into your hands, the view, the crosshair and its spread with every
// shot (D.powK, weapons/firing.js; D.shake)
export const POWDER_KICK = [1, 1.18, 1.38, 1.6];
export const SIGHT_AIM = [1, 0.75, 0.6, 0.48, 0.4, 0.34], SIGHT_MOVE = [1, 0.8, 0.64, 0.51, 0.41, 0.33];
// how much faster the recoil settles back to nothing once you stop firing, with each laser (SETTLE, weapons/firing.js)
export const LASER_SETTLE = [1, 1.3, 1.6];
// what match-grade rounds add to any gun's headshot multiplier, and each sight to a sniper's (on top of S.headMul's 2.2×)
export const HEAD_UP = { ammo: 0.3, sight: [0, 0.15, 0.3, 0.3, 0.3, 0.3] };
// a workbench tune-up (stations/recipes.js): one go per weapon, a little better at everything it does. Worth about a
// fifth more damage a second, roughly what one ammo tier gives, which is why it's the dearest thing on the bench. A
// tuned gun also lands crits: TUNE.crit of its hits on any shot (D.critT, scoped or not), and every crit it lands, a
// scope's included, hits TUNE.critM harder (D.critUp; weapons/firing.js)
export const TUNE = { dmg: 1.1, rate: 1 / 1.1, reload: 0.85, spread: 0.85, reach: 0.15, kb: 1.15, crit: 0.08, critM: 0.25 };
function tuneUp(D) {
  D.dmg *= TUNE.dmg; D.rate *= TUNE.rate;
  if (D.melee) { D.range += TUNE.reach; D.kb *= TUNE.kb; return; }
  D.critT = (D.critT || 0) + TUNE.crit; D.critUp = (D.critUp || 0) + TUNE.critM;
  if (D.reload) D.reload *= TUNE.reload;
  if (D.perShell) D.perShell *= TUNE.reload;
  D.spread *= TUNE.spread; D.shake *= TUNE.spread;   // steadier, so the kick throws the aim off less too
}
export const GUN_TIERS = new Set(['ammo', 'trigger', 'mag', 'supp', 'sight', 'laser', 'light', 'choke', 'loader']);
// the guns a real scope (the third sight step and up) goes on, and the last step each takes: the revolver its handgun
// scope (on the rail it gets with any optic: weapons/gun-models.js), the hand cannon as far as an ACOG (on the rail
// along its barrel: weapons/models-pistols.js optRail), the assault rifle the ACOG, the hunting rifle and
// the SCAR the high-power scope (the SCAR every sight there is, on its long top rail)
export const SCOPE_TOP = { revolver: 3, deagle: 4, ar: 4, hunting: 5, scar: 5 }, SCOPE_GUNS = new Set(Object.keys(SCOPE_TOP));
// each scope, by its sight step: how much it pulls the view in and out toward the aim while you aim (game/camera.js;
// zoom is the old hold-to-scope view's, player/aiming.js), and how hard a sniper's headshots crit through it
export const SCOPES = { 3: { view: 1, zoom: 2.4, crit: 2 }, 4: { view: 1.17, zoom: 2.75, crit: 2.25 }, 5: { view: 1.35, zoom: 3.1, crit: 2.5 } };
// the pump's shells a go with Quick hands II (PAIR_LOAD) and III (TRIPLE, Triple Load), each go that much of the time
// one shell takes; and the revolver's reload with its speed loader (seconds; a round at a time it's D.perShell each, after REV_OPEN_T to
// swing the cylinder out, and Quick hands takes no more than REV_QUICK off either: relMul, weapons/reload.js); and Triple Load, the pump's loader step: three shells a go,
// each go TRIPLE.t of the time one shell takes (longer, but each shell is in quicker: nearly twice as fast overall,
// 6 shells in about 1.4 s against 2.6 s). Each shell of a go is still thumbed in on its own, at least ROW_GAP seconds
// after the last, so you hear each go in (weapons/reload.js: rowLoad, shellGo)
export const REV_LOAD = 1.95, REV_OPEN_T = 0.38, REV_QUICK = 0.75, TRIPLE = { n: 3, t: 1.5 }, PAIR_LOAD = { n: 2, t: 1.3 }, ROW_GAP = 0.075;
// Sleight of Hand, the double barrel's loader step: both shells go in together in SOH.shell of the time one takes on its
// own, and the barrels are closed after in SOH.shut of the time (weapons/reload.js: tickShut). From empty that's about
// 0.7 s against 1.3 s without it
const SOH = { shell: 0.8, shut: 0.75 };
// the battle rifle's flared magwell (its loader step, upgrades/tier-table.js): what's left of a mag change with it
export const MAGWELL = 0.75;
export let tierCtx = null;
// which gun a tier lookup is about; defaults to the one in your hands
export const gunTier = (id, k) => (id && W8.gt && W8.gt[id] && W8.gt[id][k]) || 0;
// what you've bought for a gun, against what's on it (W8.gt): rounds swapped back to an older load or an attachment
// taken off at the workbench's loadout panel (ui/loadout.js) are still yours to fit again for nothing, so the best
// step you've bought of each line is kept here (W8.own), never below what's fitted
export const ownTier = (id, k) => Math.max((id && W8.own && W8.own[id] && W8.own[id][k]) || 0, gunTier(id, k));
// fit step n of line k on a gun (0 takes it off): one you own, or one just bought, which is then yours. A can and a
// choke share a shotgun's muzzle, so fitting one takes the other off (it stays yours too)
export function fitTier(id, k, n) {
  const own = W8.own[id] = W8.own[id] || {}, g = W8.gt[id] = W8.gt[id] || {};
  own[k] = Math.max(own[k] || 0, g[k] || 0, n);
  if (n) g[k] = n; else delete g[k];
  const o = k === 'supp' ? 'choke' : k === 'choke' ? 'supp' : null;
  if (n && o && g[o]) { own[o] = Math.max(own[o] || 0, g[o]); delete g[o]; }
}
// the bayonet and the shoulder stock go on one gun (gunAtt): owned once bought for it (W8.ownAtt), fitted or not
export const ownAtt = (id, k) => !!(gunAtt(id, k) || (W8.ownAtt && W8.ownAtt[id] && W8.ownAtt[id][k]));
export function setAtt(id, k, on) { (W8.ownAtt[id] = W8.ownAtt[id] || {})[k] = true; (W8.att[id] = W8.att[id] || {})[k] = on; }
export const T = k => !GUN_TIERS.has(k) ? S.tier[k] : k === 'mag' ? magTierIn(tierCtx || curId()) : gunTier(tierCtx || curId(), k);
// a new magazine bought for a gun doesn't jump into it: the mag that's in it stays (its size, and the model's mag) until
// you next change mags (weapons/reload.js). W8.pin holds, for a magazine-fed gun upgraded since its last mag change, the
// tier and capacity of the one still in it. Guns fed a round at a time, the revolver's cylinder and an akimbo pair take
// the change at once
export const magTierIn = id => (id && W8.pin && W8.pin[id]) ? W8.pin[id].t : gunTier(id, 'mag');
// scrap pays a little more every wave (SCRAP_WAVE more for each one past the first: about half again by wave 10,
// double by wave 18), so the later waves keep up with what things cost by then. A fraction left over is paid or not by
// chance, so it comes out right on average
const SCRAP_WAVE = 0.06;
export const waveScrap = n => { const v = n * (1 + SCRAP_WAVE * Math.max(0, (run ? run.wave : 1) - 1)), f = Math.floor(v); return f + (rand() < v - f ? 1 : 0); };
export const magCap = id => (W8.pin && W8.pin[id]) ? W8.pin[id].cap : magSize(id);
export function magChange(id, fn) {
  const D0 = id && W(id), cap0 = D0 ? magSize(id) : 0, t0 = gunTier(id, 'mag');
  fn();
  const D = id && W(id); if (!D || !D0) return;
  if (D.melee || D.perShell || D0.perShell || D.speedload || D.akimbo || D0.akimbo) {   // these take it at once (a waiting mag too; a fixed magazine swapped for a box)
    delete W8.pin[id];
    // (the second gun taken off with its mag: what was in it goes back with the rest, not into the one left)
    if (D.ammo && D.ammo === D0.ammo && (W8.mag[id] || 0) > magSize(id)) { W8.reserve[D.ammo] = (W8.reserve[D.ammo] || 0) + W8.mag[id] - magSize(id); W8.mag[id] = magSize(id); delete W8.akMag[id]; }
    return;
  }
  if ((magSize(id) !== cap0 || gunTier(id, 'mag') !== t0) && !W8.pin[id]) W8.pin[id] = { cap: cap0, t: t0 };
}
// the old mag's out: the new one goes in, model and all
export function magSwapIn(id) { if (W8.pin && W8.pin[id]) { delete W8.pin[id]; buildGuns(); } }
export const curId = () => W8.slot[W8.cur];
// the bayonet and the shoulder stock are bought for one gun and stay on it (W8.att[id]), like every other attachment:
// the bayonet only fits a long gun, the stock only a sidearm
export const gunAtt = (id, k) => { const D = id && WEAP[id]; return !!(D && W8.att && W8.att[id] && W8.att[id][k] && D.slot === (k === 'bayonet' ? 'long' : 'side')); };
export const hasMod = m => (W8.mods[MODS[m].w] || []).includes(m);
export const magSize = id => Math.max(1, Math.round(W(id).mag * S.magMul));
// how the weapon in your hands sets your pace: a blade or a bat is lighter than nothing much (the two-handers less so);
// primaries weigh you down by their calibre, how many rounds they hold and every attachment bolted on. Sidearms don't
// count, but a bigger magazine than its own slows you with any gun (MAG_WALK)
export function carryMul(id) {
  const D = id && W(id); if (!D) return 1;
  if (D.melee) return D.two ? 1.03 : 1.07;
  const big = D.magX > 1.01 ? 1 - MAG_WALK * Math.log2(D.magX) : 1;
  if (D.slot !== 'long' && D.slot !== 'auto') return big;
  const gt = W8.gt[id] || {}, att = ['supp', 'choke', 'sight', 'laser', 'light'].reduce((n, k) => n + (gt[k] || 0), 0) + (gunAtt(id, 'bayonet') ? 1 : 0);
  const cal = D.ammo === 'rifle' ? 0.05 : D.ammo === 'shells' ? 0.04 : 0.025, mag = Math.min(0.07, magSize(id) / 30 * 0.03);
  return clamp((1 - cal - mag - att * 0.008) * big, 0.7, 1);
}
export const suppressed = D => !!D.quiet || (T('supp') > 0 && !(D.ammo === 'shells' && T('choke') > 0));
export const suppMul = D => D.quiet ? 1 : suppressed(D) ? [1, 1.1, 1.2, 1.3][T('supp')] : 1;

// setters for the variables above that other files change (an imported variable can only be read)
export function setS(v) { return (S = v); }
export function setW8(v) { return (W8 = v); }
export function setTierCtx(v) { return (tierCtx = v); }
