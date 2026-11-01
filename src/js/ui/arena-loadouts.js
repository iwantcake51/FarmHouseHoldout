// The title's Loadouts screen: the arena's eight classes (pvp/pvp.js PVP_CLASSES) with the guns and melee weapon each
// carries made your own, and named as you like. Down the left the classes, 1 to 8 (double-click one's name, its Rename,
// or F2 to rename it); in the middle the weapon being changed (Primary, Secondary or Melee along its top) turning
// slowly in the studio (ui/gun-view.js, built just as it's built for your hands, with what's on it), its numbers over it
// and its slots under it, a tile each: click an attachment's tile for its next step, a step's own pip for that step,
// the cross to take it off; a conversion kit, a shotgun's shells and the pump's loading are picked off a row of choices
// on their own tiles. Hover or focus anything there and a card over it says what it does: what it gives (green) and
// what it costs (red), worked out from the gun as it'd be with it and without it. Down the right the weapons that can
// go in that slot, and the class's perks (set by the class: not yours to change).
//
// Ten a gun: each gun has ten points of its own for what goes on it. The guns themselves are free, except a primary's
// kind of gun (a long gun or an automatic) carried as the secondary, which takes AL_SEC_PRI of that gun's ten. Each
// attachment step costs one (a 3-step suppressor is three), a conversion kit one a step (a 3-step sawn-off three, the
// pistol's full auto, the burst line's third step, three), pair loading one and triple loading two; a kind of shell is
// free (none's simply better), and so is the melee weapon. Whatever would take a gun past ten can't be picked, and the
// meter along the top says where the gun on show is. Only
// attachments proper go on (sights, cans, chokes, lasers, lights, loaders, triggers and mags, as far as each goes on
// that gun: the same lines Showdown's random loadouts draw from) and the conversion kits (the workbench's conv mods),
// never the powder, a workbench tune-up or any other mod. A class you've never touched is carried as it comes (mods and
// all, PVP_CLASSES); once changed it's yours, any stock mod that isn't a conversion dropped, kept in this browser for
// good (AL_KEY, AL_NAMES) until Reset to default. Bots always carry the stock classes by their own names
// (pvp/bots.js). In a match your own class is alKit's (pvp/pvp.js pvpLoadout), and everyone else sees your guns as they
// are on you (net/arsenal.js sends them, attachments, conversions and shells and all).
import { $ } from '../core/dom.js';
import { SFX } from '../audio/sfx.js';
import { WEAP } from '../weapons/gun-stats.js';
import { GUN_MODS } from '../weapons/gun-mods.js';
import { MOD_CAP, MOD_LINE, MOD_MAX, MOD_UP, modNameAt, roman } from '../weapons/mod-levels.js';
import { roundName, roundTypes } from '../weapons/rounds.js';
import { TIERS, tierName } from '../upgrades/tier-table.js';
import { arenaMagSteps, NO_SIGHT, NO_SUPP, NO_TRIGGER, UPG } from '../upgrades/upgrades.js';
import { carryMul, magSize, recomputeEff, SCOPE_TOP, SCOPES, setTierCtx, suppressed, W, W8 } from '../game/run-state.js';
import { adsSpeed } from '../game/view-cam.js';
import { MODS } from '../melee/melee-mods.js';
import { gunArt, meleeArt } from './melee-art.js';
import { gunView, hideGun, showGun, studioNoPan } from './gun-view.js';
import { PVP_CLASSES, PVP_DMG, pvpFalloff, pvpRoundDmg } from '../pvp/pvp.js';

// the points each gun has, and what a primary's kind of gun takes of them as the secondary; where your loadouts and your names for the classes are kept; and the slots, in the order they're tabbed
// through; the longest a name can be
const AL_BUDGET = 10, AL_SEC_PRI = 2, AL_KEY = 'fhh-arena-loadouts', AL_NAMES = 'fhh-arena-names', AL_TABS = [['p', 'Primary'], ['s', 'Secondary'], ['m', 'Melee']], AL_NAME_MAX = 18;
// the attachment lines a gun can carry here, in the order their tiles sit (the slot each fills on the gun, by name).
// Never 'ammo' (the powder) or a tune-up: they're a gun's insides, not something bolted on
const AL_LINES = [['sight', 'Optic'], ['supp', 'Suppressor'], ['choke', 'Choke'], ['laser', 'Laser'], ['light', 'Light'], ['loader', 'Loader'], ['trigger', 'Trigger'], ['mag', 'Magazine']];
// and the choices, each one of a few (after them, a tile twice as wide): the gun's conversion kit, the shells a shotgun's
// loaded with, how many shells the pump takes a go
const AL_CHOICE = [['cv', 'Conversion'], ['rd', 'Shells'], ['ld', 'Loading']];
// and the gun's own parts, a choice each (after the conversion's): its mods that aren't conversion kits (weapons/
// gun-mods.js: the handgun's match barrel, the revolver's longer barrels and its filed hammer, the hand cannon's
// compensator, slam fire, the twin trigger, the greased bolt, the machine pistol's ported barrel, the navy trigger
// group, the M4's flared mag well and heavy barrel, the bipod), at each of their levels, 1 point a level ('m:' and the
// mod); never one that needs another first (the auto sear rides the conversion's line) or the grenade launcher
// (AL_NO_MOD); and a sidearm's folding shoulder stock ('at', the workbench's: game/run-state.js gunAtt), AL_STOCK_PTS.
// Each tile is named for the part (AL_PART)
const AL_NO_MOD = new Set(['gl']), AL_STOCK_PTS = 2;
const AL_PART = { match: 'Barrel', longbarrel: 'Barrel', heavy: 'Barrel', ported: 'Barrel', comp: 'Compensator', fan: 'Hammer', slam: 'Action', bolt: 'Bolt', both: 'Trigger', navy: 'Trigger group', well: 'Mag well', bipod: 'Bipod' };
const alModOk = (id, m) => { const M = GUN_MODS[m]; return !!M && M.w === id && !M.conv && !M.need && !AL_NO_MOD.has(m); };
const alChoices = id => [...AL_CHOICE, ...Object.keys(GUN_MODS).filter(m => alModOk(id, m)).map(m => ['m:' + m, AL_PART[m] || GUN_MODS[m].name]), ...(WEAP[id] && WEAP[id].slot === 'side' ? [['at', 'Stock']] : [])];
const choiceName = (id, key) => (alChoices(id).find(c => c[0] === key) || [key, ''])[1];
const isChoice = key => key === 'at' || key.startsWith('m:') || AL_CHOICE.some(c => c[0] === key);
// a muzzle mod (the compensator, the ported barrel) takes the muzzle a can or a choke would: one or the other
const muzMod = key => key.startsWith('m:') && !!GUN_MODS[key.slice(2)].muzzle;
const muzKeys = ex => Object.keys(ex || {}).filter(muzMod);
// how far each line goes on a gun (0: it takes none), as the workbench has it (upgrades/upgrades.js tierFits) with no
// mods on: a sight up to the scopes on the guns that take them, a can on all but the double barrel and the revolver, a choke on the
// shotguns, a loader on the revolver, the battle rifle and the double barrel, a trigger where the rate's the trigger's,
// a mag as far as that gun's go
function alMax(id, k) {
  const D = WEAP[id];
  if (!D || D.melee) return 0;
  if (k === 'sight') return NO_SIGHT.has(id) ? 0 : SCOPE_TOP[id] || 2;
  if (k === 'supp') return NO_SUPP.has(id) ? 0 : TIERS.supp.t.length;
  if (k === 'choke') return D.ammo === 'shells' ? TIERS.choke.t.length : 0;
  if (k === 'loader') return id === 'revolver' || id === 'scar' || D.breakOpen ? 1 : 0;
  if (k === 'trigger') return NO_TRIGGER.has(id) ? 0 : TIERS.trigger.t.length;
  if (k === 'mag') return arenaMagSteps(id);   // (none on the LMG here: it keeps its 100-round belt, upgrades/upgrades.js)
  return TIERS[k] ? TIERS[k].t.length : 0;
}
// each choice's options on a gun ({ v: what's kept, cost, name, short: on its button }), the stock one ('') first, or
// none at all where the gun has no such choice. A conversion kit is one of the gun's conv mods (weapons/gun-mods.js:
// the burst conversion and the second pistol, the second machine pistol, the 10mm kit, the sawn-off, the AK kit) at
// each of its levels, and a mod that carries a conversion's line on (the auto sear after the burst conversion's two:
// MOD_LINE) at its step of it. Shells: buckshot and the other kinds of shell (weapons/rounds.js). Loading: the pump's
// shells one, two or three a go (game/run-state.js pumpLoad, as Quick hands II and III load it)
const AL_SHORT = { burst: 'Burst', auto: 'Full auto', akimbo: 'Akimbo', akimbo2: 'Akimbo', sawn: 'Sawn-off', tenmm: '10mm', akkit: 'AK kit', std: 'Buckshot', slug: 'Slug', flech: 'Flechette', fire: 'Dragon' };
const AL_LOADS = [['', 'One at a time', 'Single'], ['1', 'Pair loading', 'Pair'], ['2', 'Triple loading', 'Triple']];
function alOpts(id, key) {
  const D = WEAP[id]; if (!D || D.melee) return [];
  const o = [];
  if (key === 'cv') {
    for (const m in GUN_MODS) {
      const M = GUN_MODS[m]; if (M.w !== id) continue;
      if (M.conv) { const n = MOD_UP[m] ? MOD_CAP[m] || MOD_MAX : 1; for (let lv = 1; lv <= n; lv++) o.push({ v: m + ':' + lv, cost: lv, name: modNameAt(m, lv), short: AL_SHORT[m] + (n > 1 ? ' ' + roman(lv) : '') }); }
      else if (M.need && GUN_MODS[M.need] && GUN_MODS[M.need].conv && MOD_LINE[m]) o.push({ v: m + ':1', cost: MOD_LINE[m][1], name: M.name, short: AL_SHORT[m] || M.name });
    }
    if (o.length) o.unshift({ v: '', cost: 0, name: 'Stock', short: 'Stock' });
  } else if (key === 'rd' && D.ammo === 'shells') roundTypes(id).forEach(k => o.push({ v: k === 'std' ? '' : k, cost: 0, name: roundName(id, k), short: AL_SHORT[k] || roundName(id, k) }));
  else if (key === 'ld' && id === 'pump') AL_LOADS.forEach(([v, name, short], i) => o.push({ v, cost: i, name, short }));
  else if (key.startsWith('m:') && alModOk(id, key.slice(2))) {
    const m = key.slice(2), M = GUN_MODS[m], n = MOD_UP[m] ? MOD_CAP[m] || MOD_MAX : 1;
    o.push({ v: '', cost: 0, name: 'None', short: 'None' });
    for (let lv = 1; lv <= n; lv++) o.push({ v: String(lv), cost: lv, name: modNameAt(m, lv), short: M.names ? M.names[lv - 1].split(' ')[0] : n > 1 ? roman(lv) : 'Fitted' });
  } else if (key === 'at' && D.slot === 'side') o.push({ v: '', cost: 0, name: 'None', short: 'None' }, { v: '1', cost: AL_STOCK_PTS, name: 'Shoulder stock', short: 'Folding' });
  return o;
}
const optOf = (id, key, v) => alOpts(id, key).find(o => o.v === (v || '')) || null;
// a conversion kit as mods ([mods, their levels]): the mod at its level, and what it needs under it (the auto sear's
// burst conversion at its top level)
function cvMods(cv) {
  if (!cv) return [[], {}];
  const [m, lv] = cv.split(':'), M = GUN_MODS[m];
  return M.need ? [[M.need, m], { [M.need]: M.needLv || 1, [m]: +lv }] : [[m], { [m]: +lv }];
}
// the attachment lines a fitted conversion takes the place of (the AK kit's mag and magwell, the 10mm kit's mag)
const cvLocks = cv => cvMods(cv)[0].flatMap(m => GUN_MODS[m].locks || []);
// all a gun's mods as its choices have them ([mods, their levels]): the conversion's, then its own parts'
function exMods(ex) {
  const [mods, lv] = cvMods(ex && ex.cv);
  for (const key in ex || {}) if (key.startsWith('m:') && ex[key]) { const m = key.slice(2); mods.push(m); lv[m] = +ex[key] || 1; }
  return [mods, lv];
}
// the weapons the arena has: its guns (pvp/pvp.js PVP_DMG) and the classes' melee weapons. A primary is a long gun or
// an automatic; the secondary a sidearm or another gun that rides in a different slot from the primary (the Rusher's
// double barrel behind an SMG), or nothing at all
const alGuns = () => Object.keys(PVP_DMG).filter(id => WEAP[id] && !WEAP[id].melee);
// the weapons' kinds, as the list groups them (under a heading each, in this order; a secondary's list puts the
// handguns first)
const AL_CATS = [['ar', 'Assault rifles', ['ar']], ['smg', 'Submachine guns', ['smg', 'sub']], ['sg', 'Shotguns', ['pump', 'dbl', 'auto12']], ['dmr', 'DMRs', ['scar']], ['bolt', 'Bolt action', ['hunting']], ['lmg', 'Light machine guns', ['lmg']], ['hg', 'Handguns', ['pistol', 'revolver', 'deagle']]];
const alCatOf = id => (AL_CATS.find(c => c[2].includes(id)) || ['etc', 'Other'])[0];
const alCatName = c => (AL_CATS.find(x => x[0] === c) || [c, 'Other'])[1];
const alCatSort = (list, sideFirst) => { const ord = c => { const i = AL_CATS.findIndex(x => x[0] === c); return sideFirst && c === 'hg' ? -1 : i < 0 ? 99 : i; }; return list.slice().sort((a, b) => ord(alCatOf(a)) - ord(alCatOf(b))); };
const alPriOk = id => !!WEAP[id] && WEAP[id].slot !== 'side' && id in PVP_DMG;
const alSecOk = (id, pri) => !!WEAP[id] && id in PVP_DMG && id !== pri && (!pri || WEAP[id].slot !== WEAP[pri].slot);
const alMelees = () => [...new Set(PVP_CLASSES.map(c => c.melee))];
// a gun as the editor holds it: [gun, its attachment steps, its choices { cv, rd, ld }]. Its points (of its own ten):
// one for each step on it and what its choices cost, and as the secondary, what a primary's kind of gun takes (gunFee);
// whether a loadout's guns each keep within their ten; and a loadout's points all told (the class list's number)
const gunFee = (id, t) => t === 's' && id && WEAP[id] && WEAP[id].slot !== 'side' ? AL_SEC_PRI : 0;
const exPts = (id, ex) => Object.keys(ex || {}).reduce((a, key) => a + ((ex[key] && optOf(id, key, ex[key])) || { cost: 0 }).cost, 0);
const gunPts = (g, t) => g ? gunFee(g[0], t) + Object.values(g[1]).reduce((a, n) => a + n, 0) + exPts(g[0], g[2]) : 0;
const alOver = k => gunPts(k.p, 'p') > AL_BUDGET || gunPts(k.s, 's') > AL_BUDGET;
const alPts = k => gunPts(k.p, 'p') + gunPts(k.s, 's');
// what's fitted cleaned up: only choices the gun has, only lines it takes (and none a conversion's taken the place of),
// each within its reach, and a can or a choke (they share the muzzle), never both
function alCleanEx(id, ex) { const o = {}; for (const [key] of alChoices(id)) if (ex && ex[key] && optOf(id, key, String(ex[key]))) o[key] = String(ex[key]); return o; }
function alClean(id, gt, ex) {
  const o = {}, locks = cvLocks(ex && ex.cv);
  for (const [k] of AL_LINES) { const n = locks.includes(k) ? 0 : Math.min(alMax(id, k), Math.floor(+(gt || {})[k] || 0)); if (n > 0) o[k] = n; }
  if (o.supp && o.choke) delete o.choke;
  if (muzKeys(ex).length) { delete o.supp; delete o.choke; }   // (a muzzle mod has the muzzle)
  return o;
}
const alGun = (id, gt, ex) => { const e = alCleanEx(id, ex); return [id, alClean(id, gt, e), e]; };
// a class's own kit as the editor holds it ({ p: gun, s: gun or null, m: melee }): its stock guns, attachments and
// conversion kits (a stock mod that's a conversion is its conversion) and its own parts' mods; anything else it has that
// the editor can't offer (stockMods) only while it's as it comes
function alStockEx(g) {
  const mods = g[2] || [], lv = g[3] || {}, line = mods.find(m => GUN_MODS[m] && GUN_MODS[m].need && MOD_LINE[m]), cv = line || mods.find(m => GUN_MODS[m] && GUN_MODS[m].conv), o = cv ? { cv: cv + ':' + (line ? 1 : lv[cv] || 1) } : {};
  mods.forEach(m => { if (alModOk(g[0], m)) o['m:' + m] = String(lv[m] || 1); });
  return o;
}
const alStock = C => ({ p: alGun(C.guns[0][0], C.guns[0][1], alStockEx(C.guns[0])), s: C.guns[1] ? alGun(C.guns[1][0], C.guns[1][1], alStockEx(C.guns[1])) : null, m: C.melee });
const stockMods = (C, id) => ((C.guns.find(g => g[0] === id) || [])[2] || []).filter(m => !(GUN_MODS[m] && (GUN_MODS[m].conv || (GUN_MODS[m].need && MOD_LINE[m]) || alModOk(id, m))));
// a saved kit made safe to carry: anything that isn't the arena's or doesn't fit put back to the class's own, then
// trimmed to ten a gun (a gun's choices first, then its top steps; a secondary still over, dropped). Every stock class
// keeps within ten a gun as it comes, so this only ever bites on a kit kept from some other version of the rules
function alFix(k, C) {
  const st = alStock(C), o = { p: null, s: null, m: st.m };
  o.p = k && k.p && alPriOk(k.p[0]) ? alGun(k.p[0], k.p[1], k.p[2]) : st.p;
  o.s = k && k.s === null ? null : k && k.s && alSecOk(k.s[0], o.p[0]) ? alGun(k.s[0], k.s[1], k.s[2]) : st.s && alSecOk(st.s[0], o.p[0]) ? st.s : null;
  o.m = k && alMelees().includes(k.m) ? k.m : st.m;
  const drop = g => { if (!g) return false; const e = Object.keys(g[2]).find(key => exPts(g[0], { [key]: g[2][key] }) > 0); if (e) { delete g[2][e]; return true; } const ks = Object.keys(g[1]); if (!ks.length) return false; const top = ks.sort((a, b) => g[1][b] - g[1][a])[0]; if (--g[1][top] <= 0) delete g[1][top]; return true; };
  while (gunPts(o.p, 'p') > AL_BUDGET && drop(o.p));
  while (o.s && gunPts(o.s, 's') > AL_BUDGET) if (!drop(o.s)) o.s = null;
  return o;
}
// what's kept: { classId: kit } for the classes you've changed, and { classId: name } for the ones you've renamed (a
// broken or missing store is just none changed)
const alLoad = key => { try { const v = JSON.parse(localStorage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
const alSaved = alLoad(AL_KEY), alNames = alLoad(AL_NAMES);
function alStore() { try { localStorage.setItem(AL_KEY, JSON.stringify(alSaved)); localStorage.setItem(AL_NAMES, JSON.stringify(alNames)); } catch (e) {} }
const alClass = id => PVP_CLASSES.find(c => c.id === id);
// a name as it's kept: trimmed, no longer than AL_NAME_MAX, and nothing in it that could be taken for markup (the
// class picker's cards build theirs as HTML, pvp/pvp.js)
const alNameClean = s => String(s || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, AL_NAME_MAX).trim();
const alName = C => alNames[C.id] || C.name;
const alChanged = C => !!alSaved[C.id] || !!alNames[C.id];
// the kit a class is shown with here: yours if you've changed it, else its own
const alKitOf = C => alSaved[C.id] ? alFix(alSaved[C.id], C) : alStock(C);
// what you carry into the arena as class id (pvp/pvp.js pvpLoadout and the class picker): your changed kit, in the
// class's own shape (each gun with its steps, its conversion as its mods and their levels, and its shells and loading:
// pvpLoadout; the melee weapon; mags: one for a belt-fed kit, as the Gunner has it, else three; the class's perks), by
// your name for it; the class's own kit by your name if you've only renamed it; or null while it's still all its own
export function alKit(id) {
  const C = alClass(id); if (!C || !alChanged(C)) return null;
  if (!alSaved[id]) return Object.assign({}, C, { name: alName(C) });
  const k = alFix(alSaved[id], C), guns = [k.p, k.s].filter(Boolean).map(([g, gt, ex]) => { const [mods, lv] = exMods(ex); return [g, Object.assign({}, gt), mods, lv, { at: ex.at ? { stock: true } : null, rd: ex.rd || '', ld: +ex.ld || 0 }]; });
  return { id: C.id, name: alName(C), role: C.role, guns, melee: k.m, mags: guns.some(g => g[0] === 'lmg') ? 1 : 3, perks: C.perks.slice() };
}
// (what changes it: a match re-equips you at the count-in only when this differs from what it gave you)
export const alKitKey = id => alSaved[id] ? JSON.stringify(alSaved[id]) : '';

// ---- a weapon as a kit has it, for its picture and its numbers: its steps, its conversion, its shells and its loading
// on it for a moment (and nothing of the run's: no tune-up; a stock class's other mods only while it's as it comes),
// everything put back after (as pvp/pvp.js pvpGunArt does for the class cards)
function alWith(id, gt, fn, more = [], ex = {}) {
  const keep = [], put = (o, k, v) => { if (!W8[o]) return; keep.push([o, k, k in W8[o], W8[o][k]]); if (v === undefined) delete W8[o][k]; else W8[o][k] = v; };
  const [cm, lv] = exMods(ex), mods = [...cm, ...more];
  if (!W8.modLv) W8.modLv = {}; if (!W8.load) W8.load = {};
  put('gt', id, Object.assign({}, gt)); put('own', id, Object.assign({}, gt)); put('mods', id, mods); ['tune', 'rds', 'pin'].forEach(o => put(o, id, undefined)); put('att', id, ex.at ? { stock: true } : undefined);
  put('rounds', id, ex.rd ? { own: [ex.rd], on: ex.rd, only: true } : undefined); put('load', id, ex.ld ? +ex.ld : undefined);
  mods.forEach(m => put('modLv', m, lv[m] || 1));
  recomputeEff();
  try { return fn(); } finally { for (let i = keep.length - 1; i >= 0; i--) { const [o, k, had, v] = keep[i]; if (had) W8[o][k] = v; else delete W8[o][k]; } recomputeEff(); }
}
const alArtCache = {};
const alArt = id => (alArtCache[id] ?? (alArtCache[id] = (WEAP[id].melee ? meleeArt(id, []) : alWith(id, {}, () => gunArt(id))) || { url: '' })).url;   // (the picture kept, its url read each time: it's finished on another thread, ui/melee-art.js)
// a gun's numbers as a kit has it, for the bars over its tiles and for what each thing on it does (alProsCons): a shot
// against a body (the arena's own damage, pvp/pvp.js pvpRoundDmg, every pellet of it), pellets, rounds a minute, spread
// from the hip and down the sights (SIGHT_AIM), kick, what it holds, a full reload (a tube or the double fed shell by
// shell, a go at a time), how quick it comes up to the eye (game/view-cam.js adsSpeed), your pace with it in your hands
// (carryMul), how far it holds three quarters of its damage (pvpFalloff; never past where its shot burns out), and
// whether it's quiet, how far its scope zooms, how many a burst fires, whether it's one in each hand
const AL_FAR = 0.75;
function alSnap(id, gt, ex, more) {
  return alWith(id, gt, () => {
    setTierCtx(id);
    try {
      const D = W(id), n = magSize(id), pel = D.pellets || 1;
      let range = 0; for (let t = 0; t <= 80; t += 0.5) { if (pvpFalloff(id, t) < AL_FAR || (D.maxRange && t > D.maxRange)) break; range = t; }
      return { dmg: Math.round(pvpRoundDmg(id, D) * pel), pel, rpm: Math.round(60 / D.rate), spread: D.spread, aim: D.spread * (D.aimK || 1), kick: (D.kick || 1) * (D.kickUp || 1), mag: n,
        rel: +((D.perShell ? D.perShell * Math.ceil(n / (D.loadN || 1)) : D.reload) || 0).toFixed(2), ads: D.akimbo ? 0 : adsSpeed(id), move: carryMul(id), range,
        quiet: suppressed(D), zoom: (SCOPES[(gt || {}).sight] || {}).zoom || 0, burst: D.burst || 0, auto: !!D.fullAuto || !!D.akKit, akimbo: !!D.akimbo, settle: D.settle || 1 };
    } finally { setTierCtx(null); }
  }, more, ex);
}
// the bars over the tiles: each out of the most any arena gun gets to (AL_STAT)
const AL_STAT = [['dmg', 'Damage', 120, ''], ['rpm', 'Fire rate', 900, ' rpm'], ['mag', 'Capacity', 100, ''], ['rel', 'Reload', 5, ' s']];

// ---- pros and cons: what one thing on a gun does, from the gun with it against the gun without it (everything else
// as it is), each number that moves by enough (AL_PC: which way's better, and how it's written), and what a number
// can't say, by hand (AL_SAYS)
const AL_PC = [['dmg', 'damage', 1, '%'], ['pel', 'pellets', 1, 'n'], ['rpm', 'fire rate', 1, '%'], ['spread', 'hip spread', -1, '%'], ['aim', 'aimed spread', -1, '%'], ['kick', 'recoil', -1, '%'], ['mag', 'rounds', 1, 'n'], ['rel', 'reload', -1, 's'], ['ads', 'ADS speed', 1, '%'], ['move', 'move speed', 1, '%'], ['range', 'range', 1, 'm']];
const AL_SAYS = {
  supp: [['Muffled shots'], []], light: [['Lights the ground at night'], []], laser: [['A beam shows where shots land'], []],
  trigger: [[], ['Swings aside more as it fires']], loader: [[], []], 'ld:1': [[], ['Each go takes longer']], 'ld:2': [[], ['Each go takes longer still']],
  'cv:akimbo': [['A gun in each hand'], ['No aiming down the sights']], 'cv:akimbo2': [['A gun in each hand'], ['No aiming down the sights']],
  'cv:tenmm': [['Hotter 10mm rounds go through a body'], []], 'cv:akkit': [['Full auto, 30-round AK mags'], ['Takes the magazine and magwell slots']],
  'cv:sawn': [['Quick to bring up'], ['Weak past a few metres']], 'rd:slug': [['One heavy slug that carries'], ['Has to hit dead on']],
  'rd:flech': [['A tight cloud of darts'], []], 'rd:fire': [['Spits fire up close'], ['Burns out past 8 m']],
  at: [['45% less kick', 'Fast shots stay tighter', 'Steadier in the hands'], []],
  'm:comp': [[], ['Takes the muzzle: no can']], 'm:ported': [[], ['Takes the muzzle: no can']],
  'm:fan': [['Fans the hammer from the hip'], ['Much wider spread fanning']], 'm:bipod': [['Almost no spread standing still'], []],
  'm:both': [['Both barrels at once'], []], 'm:slam': [['Fires as you pump'], []], 'm:navy': [['3-round bursts'], []]
};
function alProsCons(id, gt, ex, more, key, v) {
  const with1 = { gt: Object.assign({}, gt), ex: Object.assign({}, ex) }, without = { gt: Object.assign({}, gt), ex: Object.assign({}, ex) };
  if (isChoice(key)) { if (v) with1.ex[key] = v; else delete with1.ex[key]; delete without.ex[key]; if (key === 'cv') cvLocks(v).forEach(l => { delete with1.gt[l]; }); if (v && muzMod(key)) { delete with1.gt.supp; delete with1.gt.choke; } }
  else { with1.gt[key] = v; delete without.gt[key]; if (key === 'supp' || key === 'choke') { delete with1.gt[key === 'supp' ? 'choke' : 'supp']; muzKeys(with1.ex).forEach(m => { delete with1.ex[m]; }); } }
  const a = alSnap(id, without.gt, without.ex, more), b = alSnap(id, with1.gt, with1.ex, more), pros = [], cons = [];
  for (const [s, name, dir, f] of AL_PC) {
    const x = a[s], y = b[s]; if (!x && !y) continue;
    if (s === 'ads' && (a.akimbo || b.akimbo)) continue;
    const d = f === '%' ? (x ? (y / x - 1) * 100 : 0) : y - x, big = f === '%' ? Math.abs(d) >= 1.5 : f === 's' ? Math.abs(d) >= 0.05 : f === 'm' ? Math.abs(d) >= 0.5 : Math.abs(d) >= 1;
    if (!big) continue;
    const txt = (d > 0 ? '+' : '−') + (f === '%' ? Math.round(Math.abs(d)) + '%' : f === 's' ? Math.abs(d).toFixed(1) + ' s' : f === 'm' ? Math.round(Math.abs(d)) + ' m' : Math.round(Math.abs(d))) + ' ' + name;
    (d * dir > 0 ? pros : cons).push(txt);
  }
  if (b.quiet && !a.quiet) pros.unshift('Suppressed');
  if (b.zoom > a.zoom) pros.unshift(b.zoom + '× zoom');
  if (b.burst && !a.burst) pros.unshift(b.burst + '-round bursts');
  if (b.auto && !a.auto) pros.unshift('Full auto');
  if (b.settle > a.settle) pros.push('Recoil settles sooner');
  const says = AL_SAYS[key + ':' + String(v).split(':')[0]] || AL_SAYS[key];
  if (says) { pros.push(...says[0].filter(t => !pros.includes(t))); cons.push(...says[1]); }
  return [pros, cons];
}

// ---- the screen
const AL_BACK = 200;
const AL = { on: false, cls: 0, tab: 'p', hover: null, closeT: 0, keys: {}, view: '', shown: '', ren: -1 };
const alEl = $('alo');
const alEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const perkName = s => { const [k, n] = s.split(':'); return n ? TIERS[k].t[n - 1].name : s; };
const perkText = s => { const [k, n] = s.split(':'); const st = n ? TIERS[k].t[n - 1] : UPG.find(u => u.name === s); const t = st && (st.text || (st.card && st.card().text)); return typeof t === 'function' ? '' : t || ''; };
const cur = () => PVP_CLASSES[AL.cls];
const kitNow = () => alKitOf(cur());
// a change to the class on show: made on its kit (the stock one first, the first time), checked, kept
function alEdit(fn) {
  const C = cur(), k = alKitOf(C); fn(k);
  alSaved[C.id] = alFix(k, C); alStore(); alSync(true);
}
// the weapon a tab shows; the stock class's other mods on it while it's as it comes
const tabGun = (k, t) => t === 'm' ? k.m : k[t] ? k[t][0] : null;
const moreOf = (C, id) => alSaved[C.id] ? [] : stockMods(C, id);
// what it'd cost to set line key to step n on the tab's gun (a can taking the choke off, or the other way, gives its
// points back, and a muzzle mod), or a choice to option v (a conversion taking a line's place gives that line's points
// back, a muzzle mod the can's or the choke's); and whether that fits
function stepCost(k, t, key, n) { const [id, gt, ex] = k[t], other = key === 'supp' ? 'choke' : key === 'choke' ? 'supp' : null; return n - (gt[key] || 0) - (other && n > 0 ? (gt[other] || 0) + muzKeys(ex).reduce((a, m) => a + (optOf(id, m, ex[m]) || { cost: 0 }).cost, 0) : 0); }
function optCost(k, t, key, v) { const [id, gt, ex] = k[t], c = o => (optOf(id, key, o) || { cost: 0 }).cost; return c(v) - c(ex[key]) - (key === 'cv' ? cvLocks(v).reduce((a, l) => a + (gt[l] || 0), 0) : 0) - (v && muzMod(key) ? (gt.supp || 0) + (gt.choke || 0) : 0); }
const fits = (k, d, t = AL.tab) => gunPts(k[t], t) + d <= AL_BUDGET;
function setStep(key, n) {
  const k = kitNow(), t = AL.tab; if (!k[t]) return;
  if (cvLocks(k[t][2].cv).includes(key)) { alDeny(); return; }
  n = Math.max(0, Math.min(alMax(k[t][0], key), n));
  if (n === (k[t][1][key] || 0)) return;
  if (!fits(k, stepCost(k, t, key, n))) { alDeny(); return; }
  alEdit(k => { const [, gt, ex] = k[t]; if (n) gt[key] = n; else delete gt[key]; if (n && key === 'supp') delete gt.choke; if (n && key === 'choke') delete gt.supp; if (n && (key === 'supp' || key === 'choke')) muzKeys(ex).forEach(m => { delete ex[m]; }); });
  SFX.click();
}
function setChoice(key, v) {
  const k = kitNow(), t = AL.tab; if (!k[t]) return;
  if ((k[t][2][key] || '') === (v || '')) return;
  if (!fits(k, optCost(k, t, key, v))) { alDeny(); return; }
  alEdit(k => { const [, gt, ex] = k[t]; if (v) ex[key] = v; else delete ex[key]; if (key === 'cv') cvLocks(v).forEach(l => { delete gt[l]; }); if (v && muzMod(key)) { delete gt.supp; delete gt.choke; } });
  SFX.click();
}
// a choice's tile clicked: its next option it can afford, round to stock again
function nextChoice(key) {
  const k = kitNow(), t = AL.tab, os = alOpts(k[t][0], key), at = os.findIndex(o => o.v === (k[t][2][key] || ''));
  for (let i = 1; i <= os.length; i++) { const o = os[(at + i) % os.length]; if (fits(k, optCost(k, t, key, o.v))) { setChoice(key, o.v); return; } }
  alDeny();
}
// a weapon picked for the tab's slot: a new gun starts bare (free, or AL_SEC_PRI for a primary's kind as the secondary); a primary that rides where the secondary does
// takes its place, the secondary dropped
function pickGun(id) {
  const k = kitNow(), t = AL.tab;
  if (t === 'm') { if (k.m === id) return; alEdit(k => { k.m = id; }); SFX.click(); return; }
  if (t === 's' && id === '') { if (!k.s) return; alEdit(k => { k.s = null; }); SFX.click(); return; }
  if (k[t] && k[t][0] === id) return;
  if (t === 'p' ? !alPriOk(id) : !alSecOk(id, k.p[0])) return;
  const after = { p: t === 'p' ? [id, {}, {}] : k.p, s: t === 's' ? [id, {}, {}] : k.s && t === 'p' && WEAP[k.s[0]].slot === WEAP[id].slot ? null : k.s };
  if (alOver(after)) { alDeny(); return; }
  alEdit(k => { k.p = after.p; k.s = after.s; });
  SFX.click();
}
// not enough points: the meter shakes
function alDeny() { const m = $('aloPts'); m.classList.remove('deny'); void m.offsetWidth; m.classList.add('deny'); SFX.deny(); }
$('aloPts').addEventListener('animationend', e => e.currentTarget.classList.remove('deny'));

// the class list and the tabs are built once; the weapons for the slot, the perks and the slot tiles again only when
// what they hold changes (keyed on it: AL.keys), and every change after only brought up to date (alSync), so pips fill,
// tiles light, the tabs' ink slides and the pictures stay put as things are picked
const swapIn = el => { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); };
function alPart(name, key, el, html) { if (AL.keys[name] === key) return false; AL.keys[name] = key; el.innerHTML = html(); return true; }
function alBuild() {
  const k = kitNow(), C = cur(), t = AL.tab, id = tabGun(k, t);
  alPart('cls', 1, $('aloCls'), () => PVP_CLASSES.map((c, i) => `<div class="aloCW"><button type="button" class="aloC" data-i="${i}" role="tab"><kbd>${i + 1}</kbd><span><b></b><small></small></span><em></em></button><button type="button" class="aloRen" data-i="${i}" title="Rename (F2)">Rename</button></div>`).join(''));
  alPart('tabs', 1, $('aloTabs'), () => AL_TABS.map(([tk, n]) => `<button type="button" class="aloTab" role="tab" data-tab="${tk}"><small>${n}</small><b></b></button>`).join('') + '<i class="aloInk" aria-hidden="true"></i>');
  // the weapons for this slot, each with its picture and what it costs
  const list = t === 'm' ? alMelees() : t === 'p' ? alCatSort(alGuns().filter(alPriOk), false) : alCatSort(alGuns().filter(g => alSecOk(g, k.p[0])), true);
  const catHead = (g, i) => t !== 'm' && (i === 0 || alCatOf(list[i - 1]) !== alCatOf(g)) ? `<div class="aloCat">${alCatName(alCatOf(g))}</div>` : '';   // (a heading over each kind of gun)
  if (alPart('pick', t + list.join(), $('aloPick'), () => (t === 's' ? `<button type="button" class="aloW none" data-w=""><span class="aloWArt nil"></span><span class="aloWTx"><b>None</b><small>Carry no secondary</small></span><em></em></button>` : '') +
    list.map((g, i) => { const D = WEAP[g]; return catHead(g, i) + `<button type="button" class="aloW" data-w="${g}"><span class="aloWArt"><img alt="" decoding="sync" src="${alArt(g)}"></span><span class="aloWTx"><b>${alEsc(D.name)}</b><small>${D.melee ? 'Melee' : alEsc(D.cal || '')}${t === 's' && D.slot !== 'side' ? ' · ' + (D.slot === 'long' ? 'Long gun' : 'Automatic') : ''}</small></span><em>${gunFee(g, t) || ''}</em></button>`; }).join(''))) {
    $('aloPickHead').innerHTML = `<b>${t === 'm' ? 'Melee weapons' : t === 'p' ? 'Primary weapons' : 'Secondary weapons'}</b><span>${t === 'm' || t === 'p' ? 'Free' : `Handguns free, others ${AL_SEC_PRI} of its points`}</span>`;
    swapIn($('aloPick'));
  }
  // the class's perks: set by it, shown for what they are
  alPart('perks', C.id, $('aloPerks'), () => `<div class="aloPerkHead aloGroup"><b>Perks</b><span>Set by the class</span></div>` + C.perks.map(p => `<span class="aloPerk" title="${alEsc(perkText(p))}">${alEsc(perkName(p))}</span>`).join('') + `<p class="aloRole">${alEsc(C.role)}</p><p class="aloNote" id="aloNote"></p>`);
  // the slot tiles (none for a melee weapon, or with no secondary): the attachment lines, then the choices
  const lines = id && t !== 'm' ? AL_LINES.filter(([key]) => alMax(id, key) > 0) : [], chs = id && t !== 'm' ? alChoices(id).filter(([key]) => alOpts(id, key).length) : [];
  alPart('atts', t + id, $('aloAtts'), () => lines.length || chs.length ? lines.map(([key, n]) => `<div class="aloA" data-k="${key}" role="group" aria-label="${n}"><button type="button" class="aloAMain" data-act="up"><small>${n}${key === 'supp' || key === 'choke' ? (alMax(id, key === 'supp' ? 'choke' : 'supp') ? '<i>Muzzle</i>' : '') : ''}</small><b></b></button><span class="aloPips">${Array.from({ length: alMax(id, key) }, (_, i) => `<button type="button" class="aloPip" data-n="${i + 1}" aria-label="${alEsc(tierName(key, i, id))}"></button>`).join('')}</span><button type="button" class="aloAX" data-act="off" aria-label="Take it off" title="Take it off"></button></div>`).join('') +
    chs.map(([key, n]) => `<div class="aloA ch" data-k="${key}" role="radiogroup" aria-label="${n}"><button type="button" class="aloAMain" data-act="up"><small>${n}</small><b></b></button><span class="aloSeg">${alOpts(id, key).map(o => `<button type="button" role="radio" data-v="${o.v}" aria-label="${alEsc(o.name)}">${alEsc(o.short)}</button>`).join('')}</span><button type="button" class="aloAX" data-act="off" aria-label="Back to stock" title="Back to stock"></button></div>`).join('')
    : `<p class="aloNone">${t === 'm' ? 'Melee weapons take no attachments, and cost nothing.' : 'No secondary. Pick one from the list to carry one.'}</p>`);
  $('aloAtts').classList.toggle('empty', !lines.length && !chs.length);
  // a new class or slot (or a new weapon in it): the studio and the tiles swap in
  const view = AL.cls + t + id; if (AL.view !== view) { AL.view = view; swapIn($('aloStage')); swapIn($('aloAtts')); alInfo(null); }
}
function alSync(changed) {
  alBuild();
  const k = kitNow(), C = cur(), t = AL.tab, id = tabGun(k, t);
  // the classes: each one's name (yours for it), its guns, its points, and whether it's yours now
  $('aloCls').querySelectorAll('.aloC').forEach((b, i) => {
    const c = PVP_CLASSES[i], ck = alKitOf(c); b.classList.toggle('on', i === AL.cls); b.setAttribute('aria-selected', String(i === AL.cls));
    b.querySelector('b').textContent = alName(c); b.title = alNames[c.id] ? c.name + ' (renamed)' : '';
    b.querySelector('small').textContent = [ck.p, ck.s].filter(Boolean).map(g => WEAP[g[0]].short || WEAP[g[0]].name).join(' · ');
    b.querySelector('em').textContent = alPts(ck); b.classList.toggle('mine', alChanged(c));
  });
  // the tabs: each slot's weapon under its name, the ink under the one on show
  $('aloTabs').querySelectorAll('.aloTab').forEach(b => { const w = tabGun(k, b.dataset.tab); b.querySelector('b').textContent = w ? WEAP[w].name : 'None'; b.classList.toggle('on', b.dataset.tab === t); b.classList.toggle('empty', !w); b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
  const on = $('aloTabs').querySelector('.on'), ink = $('aloTabs').querySelector('.aloInk'); if (on) { ink.style.width = on.offsetWidth + 'px'; ink.style.translate = on.offsetLeft + 'px 0'; }
  $('aloPick').querySelectorAll('.aloW').forEach(b => {
    const w = b.dataset.w, sel = (w || null) === (t === 'm' ? k.m : k[t] ? k[t][0] : null);
    const after = t === 'm' ? null : { p: t === 'p' ? [w, {}, {}] : k.p, s: t === 's' ? (w ? [w, {}, {}] : null) : k.s && WEAP[k.s[0]].slot === WEAP[w].slot ? null : k.s };
    const over = !sel && after && alOver(after);
    b.classList.toggle('on', sel); b.classList.toggle('over', !!over); b.setAttribute('aria-disabled', String(!!over)); b.setAttribute('aria-pressed', String(sel));
    b.title = over ? 'Not enough points left' : t === 'p' && !sel && k.s && WEAP[k.s[0]].slot === WEAP[w].slot ? 'Takes the place of your ' + WEAP[k.s[0]].name + ' (same slot)' : '';
  });
  // the tiles: what's on, its step's pips lit, the ones it can't afford dimmed; a line a conversion's taken shut; a
  // choice's option lit, and the ones it can't afford dimmed
  const ex = k[t] ? k[t][2] : {}, locks = cvLocks(ex.cv);
  $('aloAtts').querySelectorAll('.aloA').forEach(a => {
    const key = a.dataset.k, b = a.querySelector('b');
    if (isChoice(key)) {
      const v = ex[key] || '', o = optOf(id, key, v);
      a.classList.toggle('on', !!v); b.textContent = o ? o.name : 'Stock'; b.dataset.r = v ? (key === 'cv' ? (MODS[v.split(':')[0]] || {}).r || 'u' : key.startsWith('m:') ? GUN_MODS[key.slice(2)].r || 'u' : 'u') : '';
      a.querySelectorAll('.aloSeg button').forEach(s => { const sv = s.dataset.v, c = optCost(k, t, key, sv), can = sv === v || fits(k, c), oc = (optOf(id, key, sv) || { cost: 0 }).cost;
        s.classList.toggle('lit', sv === v); s.classList.toggle('over', !can); s.setAttribute('aria-checked', String(sv === v)); s.dataset.c = oc ? '+' + oc : 'free'; });
      a.querySelector('.aloAMain').title = 'Next option';
      return;
    }
    const n = k[t][1][key] || 0, mx = alMax(id, key), lock = locks.includes(key);
    a.classList.toggle('on', n > 0); a.classList.toggle('max', n >= mx); a.classList.toggle('locked', lock);
    b.textContent = lock ? 'Taken by the ' + (optOf(id, 'cv', ex.cv) || { name: 'kit' }).name : n ? tierName(key, n - 1, id) : 'None';
    b.dataset.r = n ? TIERS[key].t[n - 1].r : '';
    a.querySelectorAll('.aloPip').forEach(p => { const pn = +p.dataset.n, can = !lock && (pn <= n || fits(k, stepCost(k, t, key, pn))); p.classList.toggle('lit', pn <= n); p.classList.toggle('over', !can); p.dataset.r = TIERS[key].t[pn - 1].r;
      p.title = `${tierName(key, pn - 1, id)} · ${lock ? 'taken by the conversion' : pn === n ? 'click to take this step off' : pn < n ? 'back to this step' : can ? '+' + stepCost(k, t, key, pn) + ' point' + (stepCost(k, t, key, pn) > 1 ? 's' : '') : 'not enough points'}`; });
    const up = !lock && n < mx && fits(k, stepCost(k, t, key, n + 1));
    a.classList.toggle('stuck', !lock && n < mx && !up);
    a.querySelector('.aloAMain').title = lock ? 'Taken by the conversion' : n >= mx ? 'As far as it goes' : up ? `Add ${tierName(key, n, id)} (+${stepCost(k, t, key, n + 1)})` : 'Not enough points left';
  });
  alMeter(k);
  // the attachments' heading: what this gun's taking of its ten (or why there's nothing here)
  const gp = t !== 'm' && k[t] ? gunPts(k[t], t) : 0;
  $('aloAttsHead').innerHTML = t === 'm' ? '<b>Attachments</b><span>None on a melee weapon</span>' : !k[t] ? '<b>Attachments</b><span>No secondary</span>' : `<b>Attachments</b><span>This gun uses ${gp} of its ${AL_BUDGET} points${gunFee(id, t) ? ` (${AL_SEC_PRI} for carrying it as the secondary)` : ''}</span>`;
  // the weapon on show: its name and what it is, its numbers, and itself in the studio (a stock class's gun with its
  // stock mods on, as it'd be carried: those that aren't conversions only come off once the class is changed)
  const D = id && WEAP[id], more = D && !D.melee ? moreOf(C, id) : [];
  $('aloName').innerHTML = D ? `<small>${AL_TABS.find(x => x[0] === t)[1]}${D.melee ? '' : ' · ' + alEsc(D.cal || '')}</small><b>${alEsc(D.name)}</b>` : `<small>Secondary</small><b>None</b>`;
  const st = $('aloStats');
  if (D && !D.melee) {
    const now = alSnap(id, k[t][1], ex, more), base = alSnap(id, {}, {}, []);
    st.innerHTML = AL_STAT.map(([s, n, mx, u]) => { const v = s === 'rel' ? +now[s].toFixed(1) : now[s], b = s === 'rel' ? +base[s].toFixed(1) : base[s], better = s === 'rel' ? v < b : v > b, worse = s === 'rel' ? v > b : v < b, f = x => Math.max(0.03, Math.min(1, s === 'rel' ? 1 - x / mx : x / mx));
      return `<div class="aloS${better ? ' up' : worse ? ' down' : ''}"><span>${n}<b>${v}${u}</b></span><i style="--b:${f(b)};--v:${f(v)}"></i></div>`; }).join('');
    st.hidden = false;
  } else { st.innerHTML = ''; st.hidden = true; }
  $('aloEmpty').hidden = !!D;
  if (D) {
    const sg = $('aloStage'); if (gunView.parentNode !== sg) sg.prepend(gunView); gunView.hidden = false; studioNoPan(true); alWith(id, D.melee ? {} : k[t][1], () => showGun(id), more, D.melee ? {} : ex);
    // (a weapon new to the studio starts from the same three-quarter view, then turns: the studio's own double-click
    // reset; and a notch further back than the studio frames it, AL_BACK, so a short gun turned toward the camera keeps
    // clear of its name over it and its numbers under it)
    if (AL.shown !== id) { AL.shown = id; gunView.dispatchEvent(new MouseEvent('dblclick')); gunView.dispatchEvent(new window.WheelEvent('wheel', { deltaY: AL_BACK, cancelable: true })); }
  }
  else { hideGun(); gunView.hidden = true; AL.shown = ''; }
  // the stock mods this class carries until it's changed, and what Reset does
  const mods = C.guns.flatMap(g => stockMods(C, g[0])), mine = !!alSaved[C.id];
  $('aloNote').innerHTML = (alNames[C.id] ? `Renamed from <b>${alEsc(C.name)}</b>. ` : '') + (mine ? 'Your loadout.' : mods.length ? `Stock kit, with ${mods.map(m => '<b>' + alEsc((MODS[m] || {}).name || m) + '</b>').join(', ')}. Change anything and those come off.` : 'Stock kit.');
  $('aloReset').disabled = !alChanged(C);
  if (changed) { const b = $('aloCls').querySelector('.aloC.on'); if (b) { b.classList.remove('saved'); void b.offsetWidth; b.classList.add('saved'); } }
  if (AL.info) alInfo(AL.info);   // (the card over a tile kept up to date with what's now on the gun)
}
// the meter: the ten pips of the gun on show (the primary's on the melee tab), what's on it lit in the accent and
// what carrying a primary's kind as the secondary takes paler, first; a hover over something it'd cost shows how many
// more it'd take (or that it won't go), and the number's big beside them
function alMeter(k) {
  const t = AL.tab === 's' ? 's' : 'p', g = k[t], b = g ? gunFee(g[0], t) : 0, a = gunPts(g, t) - b, h = AL.hover, m = $('aloPts'), d = h && AL.tab !== 'm' ? h.d : 0;
  if (!m.firstChild) m.innerHTML = `<span class="aloPtsL"></span><span class="aloPtsBar">${'<i></i>'.repeat(AL_BUDGET)}</span><span class="aloPtsN"><b></b><small>/ ${AL_BUDGET}</small><em></em></span>`;
  const lb = m.querySelector('.aloPtsL'), lt = (t === 's' ? 'Secondary' : 'Primary') + ' points'; if (lb.textContent !== lt) lb.textContent = lt;
  m.querySelectorAll('.aloPtsBar i').forEach((p, i) => { const c = i < b ? 's' : i < a + b ? 'p' : '', cn = c + (d > 0 && !c && i < a + b + d ? ' ghost' : d < 0 && c && i >= a + b + d ? ' free' : ''); if (p.className !== cn) p.className = cn; });   // (only when it changes: setting it afresh restarted the pips' transitions, a flicker)
  const n = m.querySelector('.aloPtsN'); n.classList.toggle('over', a + b + d > AL_BUDGET); n.querySelector('b').textContent = a + b;
  n.querySelector('em').textContent = d ? (d > 0 ? '+' : '') + d : ''; n.classList.toggle('full', a + b === AL_BUDGET);
  m.setAttribute('aria-valuenow', String(a + b)); m.setAttribute('aria-valuetext', `${lt}: ${a + b} of ${AL_BUDGET}`);
}
// what something under the pointer (or the keyboard's focus) on a tile is: the line or choice, and the step or option
// it'd mean ([key, value, what it'd be set to]); null off the tiles
function alTarget(el) {
  const a = el && el.closest && el.closest('.aloA'); if (!a) return null;
  const k = kitNow(), t = AL.tab; if (!k[t]) return null;
  const key = a.dataset.k, pip = el.closest('.aloPip'), seg = el.closest('.aloSeg button'), x = el.closest('.aloAX');
  if (isChoice(key)) {
    const v = k[t][2][key] || '', os = alOpts(k[t][0], key), next = os[(os.findIndex(o => o.v === v) + 1) % os.length];
    return { a, key, show: seg ? seg.dataset.v : x ? v : (next || {}).v || v, to: seg ? (seg.dataset.v === v ? '' : seg.dataset.v) : x ? '' : (next || {}).v || '' };
  }
  const n = k[t][1][key] || 0, mx = alMax(k[t][0], key);
  return { a, key, show: pip ? +pip.dataset.n : x ? n : Math.min(Math.max(n + 1, 1), mx), to: pip ? (+pip.dataset.n === n ? n - 1 : +pip.dataset.n) : x ? 0 : Math.min(n + 1, mx) };
}
// what hovering something would cost, on the meter; and the card of what it does over its tile
function alHover(e) {
  const k = kitNow(), t = AL.tab; let d = null;
  const tg = alTarget(e.target), w = e.target.closest('.aloW');
  if (tg) d = isChoice(tg.key) ? optCost(k, t, tg.key, tg.to) : stepCost(k, t, tg.key, tg.to);
  else if (w && t !== 'm') { const id = w.dataset.w, after = { p: t === 'p' ? [id, {}, {}] : k.p, s: t === 's' ? (id ? [id, {}, {}] : null) : k.s && WEAP[k.s[0]].slot === WEAP[id].slot ? null : k.s }; d = gunPts(after[t], t) - gunPts(k[t], t); }
  if (tg) alInfo(tg); else if (!e.target.closest('#aloInfo')) alInfoLater();
  const over = !!(tg || (w && t !== 'm'));
  // (crossing the gap between two rows, or from a row onto its own text, the pointer's briefly over nothing: the
  // preview's let go only once it's stayed off the items a moment, so it never blinks off and on between them)
  clearTimeout(AL.hoverT);
  if (!over) { if (AL.hover) AL.hoverT = setTimeout(() => { AL.hover = null; alMeter(kitNow()); }, AL_HOVER_LET); return; }
  const nh = d ? { d } : null; if (JSON.stringify(nh) !== JSON.stringify(AL.hover)) { AL.hover = nh; alMeter(k); }
}
const AL_HOVER_LET = 160;   // (ms)
// the card over a tile: the step or option's name, its slot and step and what it costs, then what it gives (green) and
// what it costs you (red); a moment after the pointer leaves the tiles it goes (AL_HOVER_LET), so moving between two
// never blinks it
const alInfoCache = new Map();
function alInfo(tg) {
  const el = $('aloInfo'); clearTimeout(AL.infoT);
  if (!tg || !tg.a.isConnected) { AL.info = null; el.classList.remove('on'); return; }
  const k = kitNow(), t = AL.tab; if (!k[t]) { alInfo(null); return; }
  const [id, gt, ex] = k[t], C = cur(), key = tg.key, v = tg.show, lock = !isChoice(key) && cvLocks(ex.cv).includes(key);
  AL.info = tg;
  let name, sub, cost;
  if (isChoice(key)) { const o = optOf(id, key, v) || { name: 'Stock', cost: 0 }; name = o.name; sub = choiceName(id, key); cost = o.cost; }
  else { name = v ? tierName(key, v - 1, id) : 'None'; sub = AL_LINES.find(c => c[0] === key)[1] + (alMax(id, key) > 1 && v ? ' ' + roman(v) : ''); cost = v; }
  const ck = JSON.stringify([id, gt, ex, key, v, moreOf(C, id)]);
  let pc = alInfoCache.get(ck);
  if (!pc) { pc = !v ? [[], []] : alProsCons(id, gt, ex, moreOf(C, id), key, v); alInfoCache.set(ck, pc); if (alInfoCache.size > 200) alInfoCache.delete(alInfoCache.keys().next().value); }
  // (what it gives and what it costs side by side, a line each, so the two read apart at a glance)
  const [pros, cons] = pc, li = (xs, none) => xs.length ? xs.slice(0, 5).map(x => `<li>${alEsc(x)}</li>`).join('') : `<li class="nil">${none}</li>`;
  el.innerHTML = `<div class="aloIHead"><b>${alEsc(name)}</b><em>${alEsc(sub)}, ${cost ? cost + ' point' + (cost > 1 ? 's' : '') : 'free'}</em></div>` +
    (lock ? `<p class="aloINote">The conversion kit takes this slot's place. Take the kit off to fit it.</p>` : !v ? `<p class="aloINote">As the gun comes: nothing changes, and it costs nothing.</p>` :
      `<div class="aloICols"><div class="aloICol pro"><h5>Gives</h5><ul>${li(pros, 'Nothing that shows in its numbers')}</ul></div><div class="aloICol con"><h5>Costs</h5><ul>${li(cons, 'No real drawback')}</ul></div></div>`);
  // over its tile, its middle over the tile's (kept inside the middle column)
  const mid = el.parentElement.getBoundingClientRect(), r = tg.a.getBoundingClientRect(), w = el.offsetWidth || 300;
  el.style.left = Math.max(8, Math.min(mid.width - w - 8, r.left - mid.left + r.width / 2 - w / 2)) + 'px';
  el.style.bottom = (mid.bottom - r.top + 8) + 'px';
  el.classList.add('on');
}
const alInfoLater = () => { if (!AL.info) return; clearTimeout(AL.infoT); AL.infoT = setTimeout(() => alInfo(null), AL_HOVER_LET); };

// ---- renaming a class: an input over its name, Enter or leaving it keeps what's typed (nothing, or the class's own
// name, puts its own name back), Esc leaves it as it was
function alRename(i) {
  if (i < 0 || i >= PVP_CLASSES.length) return;
  if (i !== AL.cls) alClassTo(i);
  const wrap = $('aloCls').querySelectorAll('.aloCW')[i], C = PVP_CLASSES[i]; if (!wrap || wrap.querySelector('input')) return;
  const inp = document.createElement('input'); inp.className = 'aloRenIn'; inp.maxLength = AL_NAME_MAX; inp.value = alName(C); inp.spellcheck = false; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'Name for ' + C.name);
  wrap.classList.add('ren'); wrap.appendChild(inp); inp.focus(); inp.select(); AL.ren = i;
  let done = false;
  const end = keepIt => {
    if (done) return; done = true; AL.ren = -1;
    if (keepIt) { const v = alNameClean(inp.value); if (!v || v === C.name) delete alNames[C.id]; else alNames[C.id] = v; alStore(); }
    inp.remove(); wrap.classList.remove('ren'); alSync(keepIt); SFX.click();
    const b = wrap.querySelector('.aloC'); if (b) b.focus({ preventScroll: true });
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); end(false); } });
  ['keyup', 'keypress'].forEach(ev => inp.addEventListener(ev, e => e.stopPropagation()));
  inp.addEventListener('blur', () => end(true));
}

function openLoadouts(clsId) {
  clearTimeout(AL.closeT); AL.on = true;
  const i = PVP_CLASSES.findIndex(c => c.id === (clsId || (() => { try { return localStorage.getItem('fhh-class'); } catch (e) { return ''; } })())); AL.cls = i < 0 ? 0 : i;
  AL.tab = 'p'; AL.view = ''; AL.shown = ''; alEl.hidden = false; alSync(); requestAnimationFrame(() => { alEl.classList.add('on'); alSync(); });
  SFX.click();
}
function closeLoadouts() {
  if (alEl.hidden) return; AL.on = false; alEl.classList.remove('on'); AL.hover = null; alInfo(null);
  AL.closeT = setTimeout(() => { alEl.hidden = true; hideGun(); studioNoPan(false); }, 340);   // (the studio's moving about back for the other menus: ui/gun-view.js)   // (once it's popped back down: styles/arena-loadouts.css)
}
// Reset to default (the kit and the name) asks first: a second press within a few seconds (as the settings' Reset
// every key does)
let alAskT = 0;
function alReset() {
  const C = cur(), b = $('aloReset'), t = b.firstChild; if (!alChanged(C)) return;
  if (performance.now() - alAskT > 3000) { alAskT = performance.now(); t.textContent = 'Reset ' + alName(C) + '? Again to confirm '; b.classList.add('ask'); SFX.click(); setTimeout(() => { if (performance.now() - alAskT >= 2900) { t.textContent = 'Reset to default '; b.classList.remove('ask'); } }, 3000); return; }
  alAskT = 0; t.textContent = 'Reset to default '; b.classList.remove('ask');
  delete alSaved[C.id]; delete alNames[C.id]; alStore(); alSync(true); SFX.click();
}
const alClassTo = i => { if (i === AL.cls || i < 0 || i >= PVP_CLASSES.length) return; AL.cls = i; alAskT = 0; $('aloReset').firstChild.textContent = 'Reset to default '; $('aloReset').classList.remove('ask'); AL.tab = 'p'; AL.hover = null; alSync(); SFX.click(); };
const alTabTo = tk => { if (tk === AL.tab) return; AL.tab = tk; AL.hover = null; alSync(); SFX.click(); };
alEl.addEventListener('click', e => {
  if (e.target.classList.contains('aloBack') || e.target.closest('#aloX, #aloDone')) { closeLoadouts(); SFX.click(); return; }
  const rn = e.target.closest('.aloRen'); if (rn) { alRename(+rn.dataset.i); return; }
  if (e.target.closest('.aloRenIn')) return;
  const c = e.target.closest('.aloC'); if (c) { alClassTo(+c.dataset.i); return; }
  const tb = e.target.closest('.aloTab'); if (tb) { alTabTo(tb.dataset.tab); return; }
  const w = e.target.closest('.aloW'); if (w) { pickGun(w.dataset.w); alHover(e); return; }
  const a = e.target.closest('.aloA');
  if (a) {
    const key = a.dataset.k, k = kitNow(), tg = alTarget(e.target);
    if (isChoice(key)) { if (e.target.closest('.aloSeg button') || e.target.closest('.aloAX')) setChoice(key, tg.to); else if (e.target.closest('.aloAMain')) nextChoice(key); }
    else {
      const n = k[AL.tab][1][key] || 0;
      if (e.target.closest('.aloPip')) setStep(key, tg.to);   // (its own step again takes that step off)
      else if (e.target.closest('.aloAX')) setStep(key, 0);
      else if (e.target.closest('.aloAMain')) { if (n >= alMax(k[AL.tab][0], key)) alDeny(); else setStep(key, n + 1); }
    }
    alHover(e); return;
  }
  if (e.target.closest('#aloReset')) alReset();
});
// a double click on a class's name renames it
alEl.addEventListener('dblclick', e => { const c = e.target.closest('.aloC'); if (c && e.target.closest('b')) alRename(+c.dataset.i); });
// a right click on a tile takes a step off it (or puts a choice back to stock)
alEl.addEventListener('contextmenu', e => {
  const a = e.target.closest('.aloA'); if (!a) return; e.preventDefault();
  const key = a.dataset.k, k = kitNow()[AL.tab]; if (!k) return;
  if (isChoice(key)) setChoice(key, ''); else { const n = k[1][key] || 0; if (n) setStep(key, n - 1); }
  alHover(e);
});
alEl.addEventListener('pointerover', alHover);
alEl.addEventListener('pointerleave', () => { clearTimeout(AL.hoverT); if (AL.hover) { AL.hover = null; alMeter(kitNow()); } alInfo(null); });
// the keyboard's focus on a tile shows its card too
alEl.addEventListener('focusin', e => { const tg = alTarget(e.target); if (tg) alInfo(tg); });
alEl.addEventListener('focusout', e => { if (!alTarget(e.relatedTarget)) alInfoLater(); });
// the keys while it's open, before the game's own (input/keyboard-mouse.js): 1-8 or up and down for the class, Q and E
// or left and right for the slot, F2 renames the class, R puts it back to its own, Esc closes. Nothing else gets
// through (Tab, Space and Enter still get round the buttons as on any page; typing a name is the name box's own)
addEventListener('keydown', e => {
  if (!AL.on) return;
  const k = e.key.toLowerCase(), n = +e.key, ti = AL_TABS.findIndex(x => x[0] === AL.tab);
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.stopImmediatePropagation();
  if (k === 'escape') { e.preventDefault(); closeLoadouts(); SFX.click(); }
  else if (k === 'f2') { e.preventDefault(); alRename(AL.cls); }
  else if (n >= 1 && n <= PVP_CLASSES.length) alClassTo(n - 1);
  else if (k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); alClassTo((AL.cls + (k === 'arrowdown' ? 1 : PVP_CLASSES.length - 1)) % PVP_CLASSES.length); }
  else if (k === 'q' || k === 'e' || k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); alTabTo(AL_TABS[(ti + (k === 'e' || k === 'arrowright' ? 1 : AL_TABS.length - 1)) % AL_TABS.length][0]); }
  else if (k === 'r' && !e.repeat) alReset();
}, true);
addEventListener('resize', () => { if (AL.on) alSync(); });
$('aloBtnTitle').onclick = () => openLoadouts();
