// The arena: player against player, in co-op (net/net.js: picked in the lobby). No zombies, no waves, no scrap: the
// arena map (world/arena.js), and three ways to play it. Deathmatch, everyone for themselves, back in a few seconds
// after going down, first to PVP_LIM.ffa kills; Team deathmatch the same in two sides, first side to PVP_LIM.tdm; and
// Showdown, one life a round in two sides (1v1, 2v2), first side to PVP_LIM.rounds rounds: go down and you watch a
// teammate still up (net/spectate.js), or once your whole side's down the enemy who finished it off, the last side standing takes the round and everyone's back at their spawn.
//
// Everyone picks a class (PVP_CLASSES) before the first round and between rounds, or while waiting to come back in
// Deathmatch: two guns and a melee weapon with their attachments set, and a bandage or two. Rounds hurt a person as they
// should (PVP_DMG: what each gun does to a body, its range falloff on top, a headshot double, an arm or leg less), and
// can open a bleed that only a bandage stops. Every game works out its own shots: a round that meets someone else's
// survivor (where it is on that game's screen) tells them what it did ('ph'); they take it, bleed, and if it's the end
// of them tell everyone who did it ('pk'). The host keeps the score and the clock ('pm') for everyone.

import { LOOK } from '../player/look.js';
import { cam, cv, FP_CAM, R, scene, V3 } from '../core/renderer.js';
import { replay } from '../core/dom.js';
import { angDiff, cache, clamp, rand, rr } from '../core/math.js';
import { NET, NET_COL, NET_ON, netAs, netLink, netSend, netTo } from '../net/net.js';
import { kbd } from '../input/keybinds.js';
import { P, PM } from '../player/player.js';
import { freshStats, magSize, recomputeEff, S, SCOPE_TOP, stamMax, W, W8 } from '../game/run-state.js';
import { TIERS } from '../upgrades/tier-table.js';
import { arenaMagSteps, NO_SIGHT, NO_SUPP, NO_TRIGGER, UPG } from '../upgrades/upgrades.js';
import { fireModeOf, fireModes, MOD_CAP, MOD_MAX, MOD_UP } from '../weapons/mod-levels.js';
import { GUN_MODS } from '../weapons/gun-mods.js';
import { WEAP } from '../weapons/gun-stats.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { equip } from '../weapons/reload.js';
import { falloff } from '../weapons/ammo.js';
import { camKick, camRoll, setCamRoll, setShake, setTod, shake, state } from '../game/state.js';
import { AR_MAP_IDS, ARENA, arenaSpawn, arenaUp } from '../world/arena.js';
import { ci, idx, inb } from '../world/grid.js';
import { lowObst } from '../world/props.js';
import { hitMark } from '../ui/crosshair.js';
import { hitFromAt } from '../ui/hud.js';
import { burst, bloodSpurt, gibs } from '../effects/particles.js';
import { BLOOD_KEEP, bloodMapClear, splatLater, spray } from '../effects/blood-map.js';
import { wallBloodClear, wallSpray } from '../effects/wall-blood.js';
import { addBlood, BODY_BLOOD, bloodWipe } from '../effects/body-blood.js';
import { avatarHit } from '../net/avatars.js';
import { goreAt, goreEye } from '../ui/screen-blood.js';
import { SFX } from '../audio/sfx.js';
import { ANIM } from '../player/animation.js';
import { aimHeld, startAim } from '../player/aiming.js';
import { agReset } from '../player/anim-graph.js';
import { leanReset } from '../player/lean.js';
import { crouchReset } from '../player/crouch.js';
import { unragYou } from '../player/player-ragdoll.js';
import { deathCineEnd, deathCineSkip, END_GAME, leaveToMenu, resumeRun } from '../ui/screens.js';
import { gunArt, meleeArt } from '../ui/melee-art.js';
import { gorePop, halveHead } from '../zombies/damage.js';
import { fpOn, VCAM, wantLock } from '../game/view-cam.js';
import { mouseX, mouseY } from '../input/keyboard-mouse.js';
import { camFocus, SPEC } from '../net/spectate.js';
import { GI, GI_VB } from '../ui/game-icons.js';
import { los } from '../lighting/lightmap.js';
import { botHit, botIds, botKilled, botKitGl, botShoved, botStats, botsBegin, botsEnd, botsPhase, botsUpdate } from './bots.js';
import { arsenalWarm, arsenalWarmClear, arsenalWarmCompile } from '../net/arsenal.js';
import { curId } from '../game/run-state.js';
import { MODS } from '../melee/melee-mods.js';
import { hitMist } from '../effects/puffs.js';
import { setTimeScale } from '../game/hit-feedback.js';
import { lookThumb } from '../ui/look-card.js';
import { lam } from '../core/shaders.js';
import { alKit, alKitKey } from '../ui/arena-loadouts.js';

// the three ways to play, and what wins each: kills for Deathmatch, a side's kills for Team deathmatch, rounds for
// Showdown; how long a Showdown round runs before it's called (s), and the cap on a whole Deathmatch (s)
export const PVP_MODES = { ffa: 'Deathmatch', tdm: 'Team deathmatch', rounds: 'Showdown' };
const PVP_LIM = { ffa: 15, tdm: 20, rounds: 5 };
// (Showdown with its random loadouts: the round's loadout up for kitShow seconds, nothing to pick; and its count-in, countRd)
export const PVP_T = { pick0: 5, pick: 4, kitShow: 3, count: 5, countRd: 3, loadWait: 15, round: 60, match: 600, roundEnd: 4, over: 25, respawn: 4.5, prot: 2 };
// the host's settings for the match (the lobby's arena settings: net/lobby.js, sent with the start): a Showdown round's
// length (s) and its flag's capture time (s), a Deathmatch's length (min), the kills and rounds that win, and
// Showdown's loadouts (random, the same for everyone and new every kitRd rounds, or the classes). Each setting's
// least, most and step
const PVP_CFG_DEF = { round: 60, cap: 5, match: 10, ffa: 15, tdm: 20, rounds: 5, kit: 'random', kitRd: 2, map: 'yard' };
export const PVP_CFG_LIM = { round: [30, 180, 15], cap: [5, 30, 5], match: [3, 20, 1], ffa: [5, 50, 5], tdm: [10, 100, 5], rounds: [2, 9, 1], kitRd: [1, 3, 1] };
export function pvpCfgFix(c) {
  const C = Object.assign({}, PVP_CFG_DEF);
  for (const k in PVP_CFG_LIM) { const v = +(c || {})[k], [lo, hi] = PVP_CFG_LIM[k]; if (v >= lo && v <= hi) C[k] = Math.round(v); }
  if (c && (c.kit === 'random' || c.kit === 'class')) C.kit = c.kit;
  if (c && AR_MAP_IDS.includes(c.map)) C.map = c.map;   // (the map: world/arena.js AR_MAPS)
  return C;
}
function pvpCfg(c) {
  const C = pvpCfgFix(c); PVP.cfg = C;
  PVP_LIM.ffa = C.ffa; PVP_LIM.tdm = C.tdm; PVP_LIM.rounds = C.rounds; PVP_T.round = C.round; PVP_T.match = C.match * 60; FLAG.cap = C.cap; FLAG.win = C.cap + FLAG.extra;
}
// Showdown's flag: once a round's clock runs out, a flag goes up in the middle of the plaza (at, m); a side alone
// within r of it gains on taking it, cap seconds of standing on it all told takes the round; both sides there and it
// holds; while a side's off it, what it had slips back (back: as a share of the time). Its own clock (win: the capture
// time and extra seconds) running out first, the side with the most health left between them takes the round
// (many: how much faster it's taken with two, three of a side in the ring than one)
const FLAG = { at: [0, 0], r: 2.4, cap: 5, extra: 10, win: 15, back: 0.5, many: [1, 1.6, 2.4] };
// Showdown's random loadouts: a primary and a sidearm (each with attachments and mods drawn at random, KIT_ODDS) and a
// melee weapon, the same for everyone, drawn again every kitRounds() rounds (the host's setting: 1, 2 or 3)
const kitRounds = () => (PVP.cfg && PVP.cfg.kitRd) || 2, KIT_PRI = ['ar', 'sub', 'smg', 'lmg', 'scar', 'hunting', 'pump', 'dbl', 'auto12'], KIT_SEC = ['pistol', 'revolver', 'deagle'];
const KIT_ODDS = { mod: 0.4, burst: 0.6, need: 0.6, sight: 0.6, laser: 0.4, light: 0.2, supp: 0.35, choke: 0.4, loader: 0.5, trigger: 0.35, mag: 0.3 }, KIT_NO_MOD = new Set(['gl']);
function kitGun(id) {
  const D = WEAP[id], gt = {}, mods = [];
  for (const m in GUN_MODS) { const M = GUN_MODS[m]; if (M.w === id && !M.need && !KIT_NO_MOD.has(m) && rand() < (KIT_ODDS[m] ?? KIT_ODDS.mod)) mods.push(m); }
  const locks = new Set(mods.flatMap(m => GUN_MODS[m].locks || [])), muzzle = mods.some(m => GUN_MODS[m].muzzle);
  // (each at any of its levels, 1 up to as far as that line goes on this gun: KIT_LV; never the powder or a tune-up)
  const lvl = n => 1 + Math.floor(rand() * Math.max(1, n));
  if (!NO_SIGHT.has(id) && rand() < KIT_ODDS.sight) gt.sight = lvl(SCOPE_TOP[id] || 2);
  if (rand() < KIT_ODDS.laser) gt.laser = lvl(2);
  if (rand() < KIT_ODDS.light) gt.light = lvl(2);
  if (!muzzle && !NO_SUPP.has(id) && rand() < KIT_ODDS.supp) gt.supp = lvl(3);
  else if (!muzzle && D.ammo === 'shells' && rand() < KIT_ODDS.choke) gt.choke = lvl(2);
  if ((id === 'revolver' || id === 'scar' || D.breakOpen) && !locks.has('loader') && rand() < KIT_ODDS.loader) gt.loader = 1;
  if (!NO_TRIGGER.has(id) && rand() < KIT_ODDS.trigger) gt.trigger = lvl(3);
  if (arenaMagSteps(id) > 0 && rand() < KIT_ODDS.mag) gt.mag = lvl(arenaMagSteps(id));   // (never on the LMG here: upgrades/upgrades.js)
  const lv = {}; mods.forEach(m => { if (MOD_UP[m]) lv[m] = lvl(MOD_CAP[m] || MOD_MAX); });
  // (a mod that needs another at a level, the handgun's auto sear on its burst conversion: in KIT_ODDS.need of the time
  // that one's drawn, that one put up to the level it needs)
  for (const m in GUN_MODS) { const M = GUN_MODS[m]; if (M.w !== id || !M.need || !mods.includes(M.need) || KIT_NO_MOD.has(m) || rand() >= KIT_ODDS.need) continue; mods.push(m); if (M.needLv) lv[M.need] = Math.max(lv[M.need] || 1, M.needLv); }
  return [id, gt, mods, lv];
}
function pvpKitRoll(rd) {
  const pick = a => a[Math.floor(rand() * a.length)], p = pick(KIT_PRI);
  return { id: 'kit', name: kitRounds() > 1 ? 'Rounds ' + rd + '–' + (rd + kitRounds() - 1) : 'Round ' + rd, role: '', guns: [kitGun(p), kitGun(pick(KIT_SEC))], melee: pick(PVP_CLASSES.map(c => c.melee)), mags: p === 'lmg' ? 1 : 3, perks: [] };
}
// what you (or a bot: pvp/bots.js) carry: Showdown's loadout for everyone, while it's random, else the class picked
// (a round whose loadout's new: the first, and each kitRounds() after; one that keeps last round's goes straight to the
// count-in, nothing shown)
// which end of the yard a side starts from: its own, or (Showdown's random loadouts: swapped with each new loadout, as
// a half's done) the other side's
export const pvpHome = sd => PVP.flip ? (sd === 'A' ? 'B' : 'A') : sd;
const kitNew = () => PVP.rd === 1 || (PVP.rd - 1) % kitRounds() === 0;
const kitMode = () => PVP.mode === 'rounds' && PVP.cfg && PVP.cfg.kit === 'random';
const pickT = first => kitMode() ? (kitNew() ? PVP_T.kitShow : 0.05) : first ? PVP_T.pick0 : PVP_T.pick;
export const pvpKitOn = () => PVP.on && PVP.mode === 'rounds' && PVP.cfg && PVP.cfg.kit === 'random' && !!PVP.kit;
export const pvpClassOf = id => pvpKitOn() ? PVP.kit : PVP_CLASSES.find(c => c.id === id) || PVP_CLASSES[0];
// yours: the same, but a class you've made your own on the title's Loadouts screen as you made it (ui/arena-loadouts.js;
// the bots keep pvpClassOf's stock ones)
const pvpMine = id => pvpKitOn() ? PVP.kit : alKit(id) || pvpClassOf(id);
// health coming back on its own (no bandages in the arena): once you've gone REGEN.wait seconds unhurt (and not
// bleeding), slowly at first and faster and faster, all of it back REGEN.full seconds after the last hurt. Not in
// Showdown: what you lose there stays lost till the next round
const REGEN = { wait: 3.75, full: 8.5 };
// what's still to come back (the health bar's blue part, ui/hud.js): all of it, once it's begun to
export const pvpRegenAhead = () => PVP.on && !P.dead && PVP.mode !== 'rounds' && (PVP.calm || 0) > REGEN.wait && !(P.bleed > 0) ? Math.max(0, S.maxHp - P.hp) : 0;
// tagging: a hit slows you (P.slow, worn off over about a second), the harder the more: base, plus per point of damage, to most
const PVP_TAG = { base: 0.6, per: 0.008, most: 0.95 };   // (a hit leaves you at about half pace, a heavy one about a third: sprint broken, worn off over a second and a half or two)
// how bloody a body is at nothing left (0..1): blood on everyone as much as they're hurt, kept while their health is
// (all of a Showdown round) and fading off as it comes back (net/avatars.js does the others)
export const PVP_BLOOD = 0.75;
// each side's colour (A west, B east), and its name
const PVP_SIDE = { A: { col: '#5fb4e8', name: 'Blue' }, B: { col: '#e2563f', name: 'Red' } };
// the classes: two guns (each with its attachment steps: game/run-state.js W8.gt) and a melee weapon, mods where a gun
// has one; in the order they're offered
// (each gun's attachments by their line and step, game/run-state.js W8.gt; perks by a skill card's name or a skill line
// and its step, 'quick:2' for Quick hands II: upgrades/upgrades.js, upgrades/tier-table.js)
export const PVP_CLASSES = [
  { id: 'rifle', name: 'Rifleman', role: 'Holds the middle ground: good at every range, best at none', guns: [['ar', { sight: 2, laser: 1, light: 1, mag: 1 }, ['well']], ['pistol', { laser: 1 }]], melee: 'machete', mags: 3, perks: ['Steady aim', 'quick:1'] },
  { id: 'mark', name: 'Marksman', role: 'Wins the long lanes with one careful shot to the head', guns: [['hunting', { sight: 3, supp: 1, mag: 1 }], ['revolver', { loader: 1, laser: 1 }, ['longbarrel']]], melee: 'crowbar', mags: 3, perks: ['Steady aim', 'Iron lungs'] },
  { id: 'battle', name: 'Battle rifleman', role: 'Two to the chest at mid range: slow to fire, hard to outlast', guns: [['scar', { sight: 2, supp: 1, mag: 1 }], ['deagle', { laser: 1 }, ['comp']]], melee: 'axe', mags: 3, perks: ['Steady aim', 'soles:1'] },
  { id: 'rush', name: 'Rusher', role: 'Round the side at a sprint and into them before they turn', guns: [['sub', { sight: 1, supp: 1, laser: 1 }], ['dbl', { loader: 1 }, ['sawn']]], melee: 'katana', mags: 3, perks: ['boots:1', 'rungun:2'] },
  { id: 'scout', name: 'Scout', role: 'Quick and quiet: picks off whoever strays and is gone again', guns: [['sub', { supp: 2, sight: 1, light: 1 }, ['tenmm']], ['pistol', { supp: 1, laser: 1 }, ['match']]], melee: 'bat', mags: 3, perks: ['boots:2', 'Iron lungs'] },
  { id: 'breach', name: 'Breacher', role: 'Holds a corner and clears a room', guns: [['pump', { laser: 1, choke: 1, light: 1 }, ['slam']], ['smg', { sight: 1, supp: 1 }]], melee: 'axe', mags: 3, perks: ['quick:2', 'Vault fire'] },
  { id: 'enforce', name: 'Enforcer', role: 'Pushes through a door behind a wall of buckshot', guns: [['auto12', { laser: 1, choke: 2, mag: 1 }], ['revolver', { loader: 1 }, ['fan']]], melee: 'sledge', mags: 3, perks: ['quick:1', 'soles:2'] },
  { id: 'gunner', name: 'Gunner', role: 'Pins a lane down with a wall of fire, slow to move', guns: [['lmg', { laser: 1, light: 1 }, ['bipod']], ['pistol', { supp: 1, mag: 1 }]], melee: 'wrench', mags: 1, perks: ['quick:1', 'Quick draw'] }
];
// a perk's skill: a card by its name, or a line up to its step
const pvpPerkOf = s => { const [k, n] = s.split(':'); return n ? { name: TIERS[k].t[n - 1].name, ap() { for (let i = S.tier[k]; i < +n; i++) { TIERS[k].t[i].ap(); S.tier[k]++; } } } : UPG.find(u => u.name === s); };
// what's fitted to a gun, by name (its mods, by their names, ahead of these on its card) (the name it goes by on that gun, if it has its own)
const pvpAtts = (id, gt) => Object.keys(gt).map(k => { const st = TIERS[k].t[gt[k] - 1]; return (st.as && st.as[id]) || st.name; });
// what a round does to a person (body, before its falloff); a melee blow's; and by where it lands (a shotgun's pellets
// in the head count for less than a bullet's). A hit can open a bleed (PVP_BLEED: the odds by kind, and how many
// seconds of bleeding: player/bandages.js stops it)
// (and all of it by PVP_TTK: the whole table scaled together; at 1, as the table has it, every gun hitting with its
// full weight)
export const PVP_TTK = 1;
// what one round or pellet of a gun does to a body before its falloff and where it lands (D: the gun as it is now).
// Nothing fitted makes a gun hit harder here, a burst conversion, an auto sear or anything else, for the balance: only
// less, a can's or a load's. A slug is one pellet that hits as PVP_SLUG of the whole load of shot it stands in for
// (the Loadouts screen's shells, ui/arena-loadouts.js, works its numbers out by this too)
const PVP_SLUG = 0.6;
export const pvpRoundDmg = (id, D) => (PVP_DMG[id] || 20) * PVP_TTK * clamp(D.dmg / (WEAP[id].dmg || 1), 0.5, 1) * (D.ammo === 'shells' && D.pellets === 1 ? (WEAP[id].pellets || 1) * PVP_SLUG : 1);
export const PVP_DMG = { pistol: 26, revolver: 46, deagle: 58, smg: 15, sub: 18, ar: 22, lmg: 19, scar: 40, hunting: 90, pump: 14, dbl: 12, auto12: 14 };
const PVP_MELEE = { bat: 38, crowbar: 44, wrench: 52, katana: 58, sledge: 92, machete: 48, axe: 72 };
// the arena's own drop-off for a gun whose zombie one is too harsh for a fight between players ([full damage out to,
// lowest from, the share left there], m): the hand cannon's is the zombie game's quick fall to a third, which left it
// doing next to nothing past a few metres; here it keeps most of its punch to mid range
// and the shotguns', far harsher than against zombies: a pump or the auto shotgun a quarter of it by 11-12 m, the
// double barrel a fifth by 10 (a slug, with its own drop-off, keeps that)
const PVP_FALL = { deagle: [14, 32, 0.72], pump: [4, 12, 0.25], auto12: [5, 12, 0.24], dbl: [3, 10, 0.2] };
export const pvpFalloff = (id, t) => { const F = !(W(id) || {}).fall && PVP_FALL[id]; if (!F) return falloff(id, t); return t <= F[0] ? 1 : t >= F[1] ? F[2] : 1 - (1 - F[2]) * (t - F[0]) / (F[1] - F[0]); };
// (a head's worth half again a body's, PVP_PART; the marksman's guns, the hunting and battle rifles, still more (1.8×):
// PVP_HEAD_GUN)
const PVP_HEAD_GUN = { hunting: 1.8, scar: 1.8 };
const PVP_PART = { head: 1.5, torso: 1, armL: 0.72, armR: 0.72, legL: 0.78, legR: 0.78 }, PVP_HEAD_SHELL = 1.2;
// a shotgun pellet in the head: PVP_HEAD_SHELL times a body pellet up close, fading to no more than a body pellet by
// where its damage bottoms out (PVP_FALL), so a few stray pellets in the head from far off never nearly kill
export const pvpPartK = (id, part, t) => {
  if (part === 'head' && PVP_HEAD_GUN[id]) return PVP_HEAD_GUN[id];
  if (part !== 'head' || WEAP[id].ammo !== 'shells') return PVP_PART[part];
  const F = PVP_FALL[id]; return 1 + (PVP_HEAD_SHELL - 1) * (F ? clamp(1 - (t - F[0]) / (F[1] - F[0]), 0, 1) : 1);
};
const PVP_HEAD_MELEE = 1.25;
export const PVP_BLEED = { gun: 0.22, shells: 0.35, blade: 0.45, s: [2, 4] };
// a body's reach as a round sees it from above (m round its middle)
export const PVP_R = 0.32;

export const PVP = { on: false, mode: 'ffa', teams: {}, side: 'A', cls: 'rifle', ph: 'idle', t: 0, rd: 1, wins: [0, 0], sc: {}, ts: [0, 0], prot: 0, respawn: 0, last: null, sent: 0, picked: false, resultKey: '' };
const pvSideOf = id => PVP.teams[id];
export const pvpSideOf = pvSideOf;
export const pvpFoe = p => PVP.on && (PVP.mode === 'ffa' || pvSideOf(p.id) !== PVP.side);
export const pvpMate = p => PVP.on && PVP.mode !== 'ffa' && pvSideOf(p.id) === PVP.side;
// frozen in place: picking a class, the count in, a round called, the match over
export const pvpFrozen = () => PVP.on && PVP.ph !== 'live';
// (held still, hands and all: picking and the count-in; a round just ended you can reload, lean and aim, only not move
// or shoot, pvpFrozen)
export const pvpLocked = () => PVP.on && (PVP.ph === 'pick' || PVP.ph === 'count' || PVP.ph === 'idle');
// who killed you, for the death camera to follow (net/spectate.js camFocus, game/view-cam.js): till you're back in,
// while they're still up. In Showdown you watch your own side while any of it's still standing; once the whole of it's
// down, the one on the other side who took the last of you down (PVP.wipeK: you, if you were the last, or the teammate
// who outlasted you), and that from their own eyes once the death camera's done (net/spectate.js)
export function pvpKiller() {
  if (!PVP.on || !P.dead) return null;
  if (PVP.mode === 'rounds') { if (!pvpSideOut() || !PVP.wipeK) return null; const p = NET.peers.get(PVP.wipeK); return p && p.x !== undefined ? p : null; }
  if (!PVP.killer) return null;
  const p = NET.peers.get(PVP.killer); return p && p.x !== undefined ? p : null;   // (down themselves since, traded: still them it looks at, where they lie)
}
// your whole side down (you and every teammate), in the team modes
export const pvpSideOut = () => PVP.on && PVP.mode !== 'ffa' && P.dead && ![...NET.peers.values()].some(p => !p.dead && p.x !== undefined && pvpMate(p));
// how grey the screen is (0 none, 1 all): grey while you pick and through the count in, the colour coming back over its
// last PVP_GREY seconds (ui/hud.js)
const PVP_GREY = 2;
export const pvpGrey = () => !PVP.on ? 0 : PVP.ph === 'pick' ? 1 : PVP.ph === 'count' ? clamp(PVP.t / PVP_GREY, 0, 1) : 0;
// who's in the arena and ready: the class picker's clock waits for everyone (or PVP_T.loadWait at most), so nobody's
// still on the loading screen when the count starts. Kept across the start, as someone can be in before the host is
const pvpIn = new Set();
NET_ON.pl = m => { pvpIn.add(m.f); };
// the class picker's up (the pointer's freed for it: game/view-cam.js)
export const pvpPicking = () => PVP.on && (document.body.classList.contains('pvpPicking') || !!(hudEls && hudEls.res.classList.contains('on')));
const isHost = () => NET.host;
const roster = () => [{ id: NET.id, name: NET.name || 'Survivor', idx: NET.idx, look: LOOK.cur }, ...[...NET.peers.values()].map(p => ({ id: p.id, name: p.name, idx: p.idx, look: p.look || (p.av && p.av.look) }))];   // (with how each looks: the MVP card's picture, pvpResults)
const nameOf = id => id === NET.id ? (NET.name || 'Survivor') : (NET.peers.get(id) || {}).name || 'Someone';
export const pvpCol = id => colOf(id);
const colOf = id => PVP.mode === 'ffa' ? NET_COL[id === NET.id ? NET.idx : (NET.peers.get(id) || {}).idx] || '#ccc' : (PVP_SIDE[pvSideOf(id)] || {}).col || '#ccc';
// the sides, by the order everyone came in (the host's first): alternately A and B; in Deathmatch everyone's their own
export function pvpTeams(list, mode) { const t = {}; list.slice().sort((a, b) => a.idx - b.idx).forEach((r, k) => { t[r.id] = mode === 'ffa' ? r.id : k % 2 ? 'B' : 'A'; }); return t; }

// ---- the match starting: the arena up, everyone at their spawn, the class picker open
export function pvpBegin() {
  PVP.on = true; PVP.mode = NET.arena || 'ffa'; PVP.teams = NET.teams || pvpTeams(roster(), PVP.mode); PVP.side = PVP.teams[NET.id] || 'A';
  PVP.sc = {}; roster().forEach(r => { PVP.sc[r.id] = [0, 0]; });
  pvpCfg(NET.acfg); PVP.kit = null; PVP.flip = false; flagDown();
  PVP.ts = [0, 0]; PVP.wins = [0, 0]; PVP.rd = 1; PVP.st = {}; PVP.my = { dmg: 0, hits: 0, shots: 0, hs: 0, long: 0 }; PVP.life = { taken: {}, given: {} }; PVP.ping = 0; PVP.prot = 0; PVP.respawn = 0; PVP.last = null; PVP.resultKey = '';
  try { PVP.cls = localStorage.getItem('fhh-class') || 'rifle'; } catch (e) {}
  if (!PVP_CLASSES.some(c => c.id === PVP.cls)) PVP.cls = 'rifle';
  arenaUp(PVP.cfg.map); if (isHost()) PVP.tod = pvpTodPick(); pvpTodRound();
  document.body.classList.add('pvp'); document.body.classList.toggle('pvpTeams', PVP.mode !== 'ffa'); document.body.classList.toggle('pvpRounds', PVP.mode === 'rounds');
  pvpHudBuild();
  pvpSpawnMe(true);
  if (isHost()) { botsBegin(); botIds().forEach(id => pvpIn.add(id)); }   // (the bots, the host's to run: pvp/bots.js)
  PVP.waitT = 0; pvpIn.add(NET.id); netSend('pl', {});   // (in: the host's clock starts once everyone is)
  pvpPhase('pick', pickT(true));
}
// the match over and done with (back to the lobby, or the game left): the farm back
export function pvpEnd() {
  if (!PVP.on) return;
  PVP.on = false; PVP.ph = 'idle'; pvpIn.clear(); botsEnd(); flagDown(); bloodWipe(); BLOOD_KEEP.on = false;   // (the game over: the blood off you, effects/body-blood.js)
  document.body.classList.remove('pvp', 'pvpTeams', 'pvpRounds', 'pvpPicking');
  pvpHudHide();
}
// a phase starting, on everyone's screen (the host's call: pm)
function pvpPhase(ph, t) {
  const was = PVP.ph; PVP.ph = ph; PVP.t = t;
  if (ph !== 'live') hudEls.card.classList.remove('on');
  if (ph === 'pick' && (was === 'roundEnd' || was === 'idle')) {
    flagDown(); PVP.wipeK = '';
    // (Showdown: a round's blood stays down all round, none of it soaking away, and a new round starts clean at once)
    BLOOD_KEEP.on = PVP.mode === 'rounds'; if (PVP.mode === 'rounds') { bloodMapClear(); wallBloodClear(); }
    // (Showdown's random loadout, drawn again every kitRounds(): the host's draw, sent with the clock)
    if (isHost() && PVP.mode === 'rounds' && PVP.cfg.kit === 'random' && (!PVP.kit || kitNew())) { if (PVP.kit && PVP.rd > 1) PVP.flip = !PVP.flip; PVP.kit = PVP.kitNext || pvpKitRoll(PVP.rd); PVP.kitNext = null; }   // (and with each new loadout after the first, the sides swap ends: pvpHome)
  }
  if (ph === 'pick') { PVP.picked = false; if (!kitMode() || kitNew()) pvpPickOpen(true); else pvpPickOpen(false); if (was === 'roundEnd' || was === 'idle') pvpSpawnMe(true); }
  else pvpPickOpen(false);
  if (ph === 'count') { if (PVP.loKey !== pvpLoKey()) pvpLoadout(); PVP.cn = 0;   // (only if it's changed since you came in: never your same guns swapped in again for nothing)
    hudEls.count.querySelector('small').textContent = PVP.mode === 'rounds' ? 'Round ' + PVP.rd + ' · ' + pvpRoundSub() + (kitMode() && kitNew() && PVP.rd > 1 ? ' · Ends swapped' : '') : PVP_MODES[PVP.mode];
    // (match point or the final round: said big over the count, in gold or red, with a sting, so nobody misses it)
    const st = pvpStake(); let se = hudEls.count.querySelector('.pcStake'); if (!se) { se = document.createElement('em'); se.className = 'pcStake'; hudEls.count.prepend(se); }
    se.textContent = st === 'final' ? 'Final round' : st === 'match' ? 'Match point' : ''; hudEls.count.dataset.stake = st; if (st) SFX.wave(); }
  hudEls.count.classList.toggle('on', ph === 'count');
  if (ph === 'live') { PVP.prot = PVP_T.prot; pvpBanner('Fight', '', 'go'); SFX.wave(); if (aimHeld) startAim(); }
  if (ph === 'pick' || ph === 'count') { leanReset(); crouchReset(); if (ph === 'pick') bloodWipe(); }   // (a new round: straightened up, stood up, and clean: effects/body-blood.js)
  if (ph === 'pick') pvpTodRound();   // (and its light: PVP_TOD)   // (aim held through the count-in: down the sights as it goes live)
  if (ph === 'roundEnd') pvpRoundBanner();
  // (the next round bringing a new loadout: drawn now, while this one's winding down, and built a piece a frame, so the
  // next round doesn't open on a stall building it all at once: pvpWarm)
  if (ph === 'roundEnd' && isHost() && kitMode() && Math.max(...PVP.wins) < PVP_LIM.rounds && (PVP.rd % kitRounds() === 0)) { PVP.kitNext = pvpKitRoll(PVP.rd + 1); pvpWarm(PVP.kitNext); }
  if (ph === 'live') { arsenalWarmClear(); PVP_WARM.length = 0; }
  if (ph === 'over') { PVP.overAt = performance.now(); pvpResults(); }
  if (isHost()) { botsPhase(ph, was); pvpCast(); }
}
// what's riding on this round in Showdown: 'final' (both a round off it), 'match' (either side a round off winning), or ''
const pvpStake = () => { if (PVP.mode !== 'rounds') return ''; const a = PVP.wins[0], b = PVP.wins[1], L = PVP_LIM.rounds; return a === L - 1 && b === L - 1 ? 'final' : a === L - 1 || b === L - 1 ? 'match' : ''; };
const pvpRoundSub = () => { const a = PVP.wins[0], b = PVP.wins[1], L = PVP_LIM.rounds; return a === L - 1 && b === L - 1 ? 'Final round' : a === L - 1 || b === L - 1 ? 'Match point' : PVP_SIDE.A.name + ' ' + a + ' – ' + b + ' ' + PVP_SIDE.B.name; };

// ---- your class: the guns and their attachments, the melee weapon, the bandages, full mags and a few more each
// what you'd be carrying: the class, or Showdown's loadout (pvpLoadout keeps the one it gave you, PVP.loKey)
const pvpLoKey = () => pvpKitOn() ? JSON.stringify(PVP.kit) : PVP.cls + alKitKey(PVP.cls);
function pvpLoadout() {
  const C = pvpMine(PVP.cls); PVP.loKey = pvpLoKey();
  Object.assign(S, freshStats()); S.planks = 0; C.perks.forEach(k => pvpPerkOf(k).ap());   // only this class's perks (and nothing in your pack to board up with)
  W8.slot = { melee: C.melee, side: null, long: null, auto: null }; W8.owned = [C.melee];
  W8.mods = {}; W8.gt = {}; W8.own = {}; W8.att = {}; W8.rounds = {}; W8.mag = {}; W8.pin = {}; W8.relSave = {}; W8.fm = {}; W8.load = {};
  ['akMag', 'spent', 'hudSpent', 'open', 'held'].forEach(k => { if (W8[k]) W8[k] = {}; });
  for (const k in W8.reserve) W8.reserve[k] = 0;
  W8.reloading = null; W8.akRel = null; W8.burstLeft = 0; W8.cd = 0; W8.swing = 0;
  let first = null;
  for (const [id, gt, mods, lv] of C.guns) { const s = WEAP[id].slot; W8.slot[s] = id; W8.owned.push(id); W8.gt[id] = Object.assign({}, gt); W8.own[id] = Object.assign({}, gt); if (mods) W8.mods[id] = mods.slice(); if (lv) { W8.modLv = W8.modLv || {}; Object.assign(W8.modLv, lv); } if (!first) first = s; }   // (lv: each mod's level, a random loadout's)
  for (const [id] of C.guns) if (!arenaMagSteps(id)) { delete W8.gt[id].mag; delete W8.own[id].mag; }   // (no longer belt for the LMG here, whatever a loadout kept from before says: upgrades/upgrades.js arenaMagSteps)
  // (a loadout made on the title's Loadouts screen, ui/arena-loadouts.js, can say which shells a shotgun's loaded with,
  // the only kind it carries (only: no buckshot to swap back to, weapons/rounds.js), and how many shells the pump takes
  // a go: W8.load, game/run-state.js), and a sidearm's shoulder stock (W8.att)
  for (const [id, , , , ex] of C.guns) { if (!ex) continue; if (ex.rd && ex.rd !== 'std') W8.rounds[id] = { own: [ex.rd], on: ex.rd, only: true }; if (ex.ld) W8.load[id] = ex.ld; if (ex.at) W8.att[id] = Object.assign({}, ex.at); }
  recomputeEff();
  // (a gun that can fire full auto or in bursts starts set to it, the fullest it has: full auto over a burst over single
  // shots, rather than on what it does out of the box)
  for (const [id] of C.guns) { const ms = fireModes(id); if (ms.length < 2) continue; let best = null, bs = -1; for (const m of ms) { W8.fm[id] = m; recomputeEff(); const k = (fireModeOf(id) || {}).k, sc = k === 'auto' ? 3 : k === 'burst' ? 2 : 1; if (sc > bs) { bs = sc; best = m; } } W8.fm[id] = best; recomputeEff(); }
  for (const [id] of C.guns) { const D = W(id), n = magSize(id); W8.mag[id] = n; W8.reserve[D.ammo] = (W8.reserve[D.ammo] || 0) + Math.max(n * C.mags, D.ammo === 'shells' ? 14 : 0); }
  P.band = 0; P.bleed = 0; P.heal = 0;   // (no bandages: health comes back on its own, REGEN)
  W8.cur = first || 'melee'; buildGuns(); equip(W8.cur, true);
  if (hudEls) { hudEls.kit.innerHTML = `<b></b>${C.perks.map(k => `<i>${pvpPerkOf(k).name}</i>`).join('')}`; hudEls.kit.firstChild.textContent = C.name; }   // (your class and its perks, small down the left)
}
// at your spawn, whole again: your side's spot (in Showdown everyone in their own place in it) or, in Deathmatch, the
// one furthest from everyone else
function pvpSpawnMe(fresh) {
  const foes = [...NET.peers.values()].filter(p => pvpFoe(p) && !p.dead && p.x !== undefined).map(p => [p.x, p.z]);
  const mine = roster().filter(r => pvSideOf(r.id) === PVP.side).sort((a, b) => a.idx - b.idx).findIndex(r => r.id === NET.id);
  const [x, z, f] = arenaSpawn(PVP.mode === 'ffa' ? 'F' : pvpHome(PVP.side), foes, PVP.mode === 'rounds' || fresh ? mine : undefined, PVP.mode === 'rounds' ? PVP.rd : undefined);
  if (P.dead) { unragYou(); deathCineEnd(); }
  Object.assign(P, { dead: false, deathT: 0, hp: S.maxHp, bleed: 0, slow: 0, stun: 0, vx: 0, vz: 0, kbx: 0, kbz: 0, conc: 0, shock: 0, shockStun: 0, vault: null, x, z, aim: f });
  agReset(); leanReset(); crouchReset(); bloodWipe();   // (clean again: effects/body-blood.js) (stood straight at your spawn, not leaning: no easing up out of the title screen's kneel or whatever you were last doing, player/anim-graph.js)
  VCAM.yaw = f; PM.head.visible = true; LIMBS.forEach(k => { PM[k].visible = true; });
  PVP.life = { taken: {}, given: {} }; if (hudEls) hudEls.card.classList.remove('on');   // (a fresh life: its damage report cleared)   // (whole again: pvpDismember)
  P.stam = stamMax(); P.exh = false; P.stamT = 9; P.sprint = false; P.runUp = 0;   // (and fresh: a full tank)
  document.body.classList.remove('dying'); cv.style.filter = ''; cache.grey = null;
  if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; }
  SPEC.id = '';
  pvpLoadout();
  if (hudEls) { const k = hudEls.kit; k.classList.remove('fresh'); void k.offsetWidth; k.classList.add('fresh'); }   // (your class and perks shown bright a moment, then faded back)
}

// ---- shots and blows on the others: from firing.js and melee.js
// the survivors a round's line (from ox, oz along dx, dz) passes through before endR, as hits for firing.js to sort
// with the zombies' ({ pv: their player, t, off, r })
// From your own eyes (ray: the round's height where it starts and how it climbs, [y0, slope]) it's met against them as
// they're drawn, the very blocks of their body, their head and what's on it (PVP_RAY): the first of them the line
// goes into is what it hits, at its own height, crouched, leaned out or however they stand, so the reticle on their head
// is a headshot and just over it a miss (the parts used to be bands of height off the ground for a taller figure than
// theirs, their head 1.47-1.86 m: a round at the middle of the head, 1.37 m, went into the chest and one over the top
// of it was a headshot). Not their weapon in their hands, nor their outlines
const PVP_RAY = { r: 0.75 }, _prR = new THREE.Raycaster(), _prO = new V3(), _prD = new V3(), _prL = [];
const PVP_PART_OF = [['head', 'head'], ['torso', 'torso'], ['armL', 'armL'], ['armR', 'armR'], ['legL', 'legL'], ['shinL', 'legL'], ['legR', 'legR'], ['shinR', 'legR'], ['upper', 'torso'], ['lower', 'torso']];
function pvpMeshHit(a, ox, oz, dx, dz, endR, ray) {
  const k = Math.hypot(1, ray[1]);
  _prO.set(ox, ray[0], oz); _prD.set(dx, ray[1], dz).divideScalar(k); _prR.set(_prO, _prD); _prR.near = 0.2 * k; _prR.far = endR * k;
  const skip = new Set(Object.values(a.held || {}).map(h => h && h.g).filter(Boolean));
  _prL.length = 0; (function walk(o) { for (const c of o.children) { if (!c.visible || skip.has(c) || c.userData.isOutline) continue; if (c.isMesh) _prL.push(c); walk(c); } })(a.g);
  const hit = _prR.intersectObjects(_prL, false)[0]; if (!hit) return null;
  let part = null; for (let o = hit.object; o && o !== a.g && !part; o = o.parent) for (const [j, pt] of PVP_PART_OF) if (a[j] === o) { part = pt; break; }
  return { t: hit.distance / k, y: hit.point.y, part: part || 'torso' };
}
export function pvpRay(ox, oz, dx, dz, endR, hits, ray) {
  if (!PVP.on || PVP.ph !== 'live') return;
  for (const p of NET.peers.values()) {
    if (p.dead || !pvpFoe(p) || !p.av) continue;
    const g = p.av.g.position, vx = g.x - ox, vz = g.z - oz, t = vx * dx + vz * dz, off = vx * dz - vz * dx;
    if (ray) {   // (from your own eyes: what of them the line goes into, PVP_RAY)
      if (t < -PVP_RAY.r || t > endR + PVP_RAY.r || Math.abs(off) > PVP_RAY.r) continue;
      const m = pvpMeshHit(p.av, ox, oz, dx, dz, endR, ray); if (m) hits.push({ pv: p, t: m.t, off, r: PVP_R, part: m.part, y: m.y });
      continue;
    }
    if (t > 0.2 && t <= endR && off * off < PVP_R * PVP_R) hits.push({ pv: p, t, off, r: PVP_R });
  }
}
// what one round (or pellet) did to someone it met: which part (from your own eyes by the height it meets them at;
// from above by where on them it lands, and behind low cover only their head shows), added to what this shot's done
// to them, sent once the shot's done (pvpShotEnd). False if it missed them after all (over their head, or into the
// cover in front of them)
const shotOn = new Map();
export function pvpPellet(h, fp, y, id, D, pellets, ox, oz, dx, dz) {
  const p = h.pv, rel = clamp(h.off / h.r, -1, 1);
  let part;
  if (h.part) part = h.part;   // (from your own eyes: the part of them the line went into, pvpRay)
  else if (fp) return false;
  else {
    const r = rand(), covered = pvpCovered(p.av.g.position.x, p.av.g.position.z, ox, oz, dx, dz, h.t);
    part = r < 0.13 ? 'head' : r < 0.6 ? 'torso' : r < 0.78 ? (rel > 0 ? 'armR' : 'armL') : (rel > 0 ? 'legR' : 'legL');
    if (covered && part !== 'head' && !part.startsWith('arm')) return false;
    if (covered && (p.cr || 0) > 0.6) return false;   // (crouched down behind it, nothing of them shows over it)
  }
  const shells = D.ammo === 'shells', base = pvpRoundDmg(id, D);
  const d = base * pvpFalloff(id, h.t) * pvpPartK(id, part, h.t);
  const s = shotOn.get(p) || { d: 0, head: false, part, n: 0, t: h.t }; s.d += d; s.n++; if (part === 'head') s.head = true; if (d > (s.top || 0)) { s.top = d; s.part = part; }
  shotOn.set(p, s);
  // on your screen at once: blood off them where it struck, and down on the ground behind
  const g = p.av.g.position, hy = h.y ?? (part === 'head' ? 1.62 : part.startsWith('leg') ? 0.5 : 1.15);   // (from your own eyes, where it went in)
  if (s.n <= 3) hitBleed(g.x, hy, g.z, dx, dz, d, part === 'head', s.n === 1);
  return true;
}
// is someone behind low cover, as seen from (ox, oz): a barrier, sandbags or a drum on the line in the last
// metre and a half before them, not right in front of the shooter
export function pvpCovered(x, z, ox, oz, dx, dz, t) {
  for (let s = 0.35; s < 1.6 && s < t - 1.1; s += 0.2) { const i = ci(x - dx * s), j = ci(z - dz * s); if (inb(i, j) && lowObst.has(idx(i, j))) return true; }
  return false;
}
// the shot done: to each one it hit, what it did all told (and whether it went in their head), and a chance of a bleed
export function pvpShotEnd(id, D) {
  if (PVP.on && PVP.ph === 'live') { PVP.prot = 0; PVP.my.shots++; if (shotOn.size) PVP.my.hits++; }   // (firing gives up your spawn protection)
  if (!shotOn.size) return;
  for (const [p, s] of shotOn) pvpSend(p, Math.round(s.d), s.head ? 'head' : s.part, id, D.ammo === 'shells' ? (s.n >= 3 && rand() < PVP_BLEED.shells) : rand() < PVP_BLEED.gun);
  shotOn.clear();
}
// a melee blow: everyone in reach and in front of you (and not through a wall) takes it
export function pvpMelee(D, id) {
  if (!PVP.on || PVP.ph !== 'live') return 0;
  PVP.prot = 0;
  let n = 0;
  for (const p of NET.peers.values()) {
    if (p.dead || !pvpFoe(p) || !p.av) continue;
    const g = p.av.g.position, dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz);
    if (d > D.range + 0.35 || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc && d > 0.6) || !los(P.x, P.z, g.x, g.z)) continue;
    const head = rand() < (D.style === 'chop' ? 0.3 : 0.18);
    pvpSend(p, Math.round((PVP_MELEE[id] || 40) * PVP_TTK * (head ? PVP_HEAD_MELEE : 1)), head ? 'head' : 'torso', id, !D.blunt && rand() < PVP_BLEED.blade);
    bloodSpurt(g.x, head ? 1.62 : 1.15, g.z, dx / (d || 1), dz / (d || 1), 7, 1.3);
    if (!D.blunt) goreAt(g.x, g.z, head ? 1.62 : 1.15, head ? 0.9 : 0.6);   // (a blade through someone at arm's length: their blood across your view and on you, ui/screen-blood.js)
    n++;
  }
  return n;
}
// a shove (player/shove.js): everyone on the other side in reach and in front of you, not through a wall, is knocked
// back and reels: can't move or fire for a moment, the view jolted and swimming for about a second (PVP_SHOVE: its
// reach, m, and arc, rad; how long they reel, s; how hard it throws them; what it does to them; how long the blur lasts)
const PVP_SHOVE = { range: 1.7, arc: 1.15, stun: 0.6, kb: 6, dmg: 6, blur: 1 };
export function pvpShove(power) {
  if (!PVP.on || PVP.ph !== 'live') return 0;
  PVP.prot = 0; let n = 0;
  for (const p of NET.peers.values()) {
    if (p.dead || !pvpFoe(p) || !p.av) continue;
    const g = p.av.g.position, dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz);
    if (d > PVP_SHOVE.range || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > PVP_SHOVE.arc && d > 0.55) || !los(P.x, P.z, g.x, g.z)) continue;
    const m = { dx: Math.round(dx / (d || 1) * 100) / 100, dz: Math.round(dz / (d || 1) * 100) / 100, p: Math.round(power * 100) / 100 };
    if (p.bot && isHost()) botShoved(p.id, m); else netTo(p.id, 'pv', m);
    pvpSend(p, Math.round(PVP_SHOVE.dmg * power), 'torso', curId(), false);
    n++;
  }
  return n;
}
// shoved yourself: thrown back, reeling, the view jolted and blurred
NET_ON.pv = m => {
  if (!PVP.on || m.to !== NET.id || P.dead || PVP.ph !== 'live' || PVP.prot > 0 || state === 'title') return;
  const k = m.p || 1, S0 = PVP_SHOVE;
  P.kbx = m.dx * S0.kb * k; P.kbz = m.dz * S0.kb * k; P.stun = Math.max(P.stun || 0, S0.stun * k); P.shockStun = Math.max(P.shockStun || 0, S0.stun * k); P.sprint = false;
  PVP.blurT = S0.blur; ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1;
  setShake(Math.max(shake, 0.42)); camKick.x += m.dx * 0.3; camKick.z += m.dz * 0.3; setCamRoll(clamp(camRoll + ANIM.flinchSide * 0.07, -0.12, 0.12));
  SFX.hitBlunt(true);
};
// how blurred your view is from a shove, 0 to 1 (ui/hud.js)
export const pvpBlur = () => PVP.on ? clamp((PVP.blurT || 0) / PVP_SHOVE.blur, 0, 1) : 0;
function pvpSend(p, d, part, w, bleed) {
  if (d <= 0) return;
  const m = { d, p: part, w, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, b: bleed ? 1 : 0, g: pvpGunKit(w) };   // (g: what's on the gun, for the kill feed's and the card's picture of it)
  if (p.bot && isHost()) botHit(p.id, Object.assign({ f: NET.id, to: p.id }, m)); else netTo(p.id, 'ph', m);   // (a bot's in the host's game: pvp/bots.js)
  dmgNum(p, d, part === 'head');
  // and on them: their outline flashing and their body jolted the way it went (net/avatars.js), a punchier sound
  { const dx = p.x - P.x, dz = p.z - P.z, L = Math.hypot(dx, dz) || 1; avatarHit(p, part === 'head', dx / L, dz / L, d / 25); SFX.pvpHit(d, part === 'head'); }
  PVP.my.dmg += d; if (part === 'head') PVP.my.hs++; ledger(PVP.life.given, p.id, d);
  hitMark('hit', part === 'head'); SFX.killTick(part === 'head', 1); (part === 'head' ? SFX.headHit : SFX.tick)();   // (and the wet sound of it going in)
}
// hit: what it does to you, and how it feels. Spawn-protected for a moment after you come in, and nothing between rounds
NET_ON.ph = m => {
  if (!PVP.on || m.to !== NET.id || P.dead || PVP.ph !== 'live' || PVP.prot > 0 || state === 'title') return;
  const dx = P.x - m.x, dz = P.z - m.z, L = Math.hypot(dx, dz) || 1, head = m.p === 'head';
  ledger(PVP.life.taken, m.f, m.d); P.hp -= m.d; P.slow = Math.max(P.slow || 0, Math.min(PVP_TAG.most, PVP_TAG.base + m.d * PVP_TAG.per)); P.sprint = false; PVP.calm = 0;   // (tagged: the hit slows you for a moment, as in Counter-Strike: player/movement.js wears P.slow off)
  PVP.regen0 = null; PVP.last = { id: m.f, w: m.w, head, d: m.d, at: performance.now(), x: m.x, z: m.z, pt: m.p, g: m.g || 0 };
  P.hitFrom = Math.atan2(dx, dz); hitFromAt(m.x, m.z, m.d / 22);
  addBlood(Math.min(0.12, 0.02 + m.d / 900)); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt();
  setShake(Math.max(shake, (0.18 + Math.min(0.4, m.d / 160)) * (1 - 0.55 * clamp(ANIM.ads || 0, 0, 1))));   // (down the sights, a smaller shake: the flinch moves the sight picture as one, game/view-cam.js FLINCH_ADS)
  goreAt(P.x - dx / L * 0.3, P.z - dz / L * 0.3, head ? 1.6 : 1.2, Math.min(1, (head ? 0.5 : 0.25) + m.d / 120));
  hitBleed(P.x, head ? 1.6 : 1.15, P.z, dx / L, dz / L, m.d, head, true);
  netSend('pb', { x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, dx: Math.round(dx / L * 100) / 100, dz: Math.round(dz / L * 100) / 100, h: head ? 1 : 0, sh: m.f, d: m.d });
};
// a round through someone (x, hy, z: where, dx, dz: the way it was going, d: how hard): blood out the far side the way
// it went, a mist and a spurt, drops close behind and a spray thrown out along the floor further back, a wall behind
// them spattered if it's near; floor: the floor's share too (once a shot, not for every pellet)
function hitBleed(x, hy, z, dx, dz, d, head, floor) {
  const k = clamp(d / 40, 0.4, 1.6);
  // (close enough to you, some of it on your view and on you: ui/screen-blood.js, nothing past a few metres)
  // (or watching someone from their own eyes, close enough to them: on their view, which is yours: ui/screen-blood.js goreEye)
  const E = floor && goreEye(); if (E && Math.hypot(x - E.x, z - E.z) > 0.3) goreAt(x, z, hy, clamp((head ? 0.35 : 0.18) + d / 150, 0, 1));   // (your own being hit has its own: NET_ON.ph; theirs, NET_ON.pb)
  hitMist(x, hy, z, dx, dz, head, d); bloodSpurt(x, hy, z, dx, dz, Math.round((head ? 9 : 6) * k), 1.15);
  burst(x + dx * 0.15, hy, z + dz * 0.15, Math.round(5 + 6 * k), 'blood', dx, dz, 2.6);
  if (!floor) return;
  splatLater(0.12, x + dx * rr(0.25, 0.6), z + dz * rr(0.25, 0.6), 'drop', rr(0.18, 0.3) * k);
  spray(x + dx * 0.3, z + dz * 0.3, dx, dz, rr(0.7, 1.1) * k, 0);
  wallSpray(x, hy, z, dx, dz, k);
}
// someone else bleeding where they were hit (not on the shooter's screen: they've drawn it already)
NET_ON.pb = m => {
  if (!PVP.on || m.sh === NET.id || state === 'title') return;
  // (the one you're watching from their own eyes hit: their own blood across their view, which is yours, as yours is
  // across yours when you're hit, NET_ON.ph: thrown back toward whoever shot them, net/spectate.js)
  if (m.f && P.dead && camFocus().id === m.f && goreEye()) goreAt(m.x - m.dx * 0.3, m.z - m.dz * 0.3, m.h ? 1.6 : 1.2, Math.min(1, (m.h ? 0.5 : 0.25) + (m.d || 25) / 120));
  hitBleed(m.x, m.h ? 1.62 : 1.15, m.z, m.dx, m.dz, m.d || 25, !!m.h, true);
};
// shot through the head: not just black, a beat of its own. A white crack of a flash going red on the instant (the
// round going in), the screen crushed dark from its edges in a red-black vignette with a faint red heart to it, a high
// ringing in the ears; then the dark draws back off the
// middle outwards while the world stays drained of colour and a touch out of focus, the colour seeping back as the
// death camera turns to whoever did it (game/view-cam.js KILL_CAM: round at about 0.9 s) and all of it gone by the time
// it's on them (HEAD_FX: seconds, styles/pvp.css #pvpHead for the layers' own curves)
const HEAD_FX = { len: 2.6, ring: 0.55 };
let headFxEl = null, headFxT = 0;
function headBlack() {
  if (!headFxEl) {
    headFxEl = document.createElement('div'); headFxEl.id = 'pvpHead'; headFxEl.setAttribute('aria-hidden', 'true');
    headFxEl.innerHTML = '<i class="hfDrain"></i><i class="hfDark"></i><i class="hfFlash"></i>';
    document.body.appendChild(headFxEl);
  }
  const el = headFxEl; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(headFxT); headFxT = setTimeout(() => el.classList.remove('on'), HEAD_FX.len * 1000);
  SFX.tinnitus(HEAD_FX.ring);   // (the ears ringing, and the world dulled under it for a moment: audio/sfx.js)
}
// what's on a gun as the kill feed draws it: its attachments and tiers, its mods and their levels ([gt, mods, lv]; 0
// for a melee weapon); and its picture from that, the attachments in gold as your own slots have them (pvpGunArt)
const pvpGunKit = w => { const D = WEAP[w]; if (!D || D.melee) return 0; const mods = W8.mods[w] || []; return [W8.gt[w] || {}, mods, Object.fromEntries(mods.map(k => [k, (W8.modLv || {})[k] || 1]))]; };
const kitArt = (w, g) => { const D = w && WEAP[w]; if (!D) return null; return D.melee ? meleeArt(w, []) : pvpGunArt(w, g ? g[0] : {}, g ? g[1] : [], g ? g[2] : {}); };
// an assist: anyone else who did PVP_ASSIST or more to whoever went down, this life of theirs (their ledger:
// PVP.life.taken), the one who finished them aside
const PVP_ASSIST = 30;
const pvpAssists = k => Object.entries(PVP.life.taken).filter(([id, e]) => id !== k && id !== NET.id && e[0] >= PVP_ASSIST).sort((a, b) => b[1][0] - a[1][0]).slice(0, 2).map(([id]) => id);
// you down (ui/screens.js: startDeath): who did it, with what, and whether it took your head off, to everyone
export function pvpDied() {
  if (!PVP.on) return;
  const L = PVP.last && performance.now() - PVP.last.at < 8000 ? PVP.last : null;
  const hb = !!(L && L.head && L.d >= 60);
  const m = { k: L ? L.id : '', v: NET.id, w: L ? L.w : '', hs: L && L.head ? 1 : 0, hb: hb ? 1 : 0, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, dm: L ? Math.round(Math.hypot(P.x - L.x, P.z - L.z)) : 0, pt: L ? L.pt : '', g: L ? L.g || 0 : 0, as: pvpAssists(L ? L.id : '') };   // (dm: how far off they were, m; pt: where the last one went in)
  netSend('pk', m); pvpKilled(m);
  if (m.hs) headBlack();   // (a headshot: black at once, PVP head black)
  PVP.killer = L && L.id !== NET.id ? L.id : ''; PVP.killAt = performance.now();   // (the death camera goes to them: pvpKiller)
  PVP.respawn = PVP.mode === 'rounds' ? 0 : PVP_T.respawn; PVP.hold = false;   // (the class picker only if you ask for it: its key, on the card)
}
NET_ON.pk = m => { if (PVP.on) pvpKilled(m); };
export function pvpKilled(m) {
  // the score, on the host's game (it tells everyone with the clock)
  if (isHost()) {
    const k = PVP.sc[m.k], v = PVP.sc[m.v];
    if (v) v[1]++;
    if (k && m.k !== m.v) { k[0]++; if (PVP.mode === 'tdm') PVP.ts[pvSideOf(m.k) === 'B' ? 1 : 0]++; botKilled(m.k, m.dm); }
    pvpCheckEnd(); pvpCast();
  }
  pvpFeed(m);
  if (m.k === NET.id && m.v !== NET.id) { hitMark('kill', !!m.hs); pvpToast(m.hs ? 'Headshot' : 'Eliminated', nameOf(m.v), m.hs ? 'head' : 'kill'); }
  if (m.v === NET.id && m.k) setTimeout(() => { if (P.dead && PVP.on) pvpDmgCard(m); }, 450);   // (the card says who: no call over it)
  if (m.k === NET.id && m.v !== NET.id) PVP.my.long = Math.max(PVP.my.long, m.dm || 0);
  if (m.k !== NET.id && (m.as || []).includes(NET.id)) { PVP.my.as = (PVP.my.as || 0) + 1; pvpToast('Assist', nameOf(m.v), 'assist'); }   // (you helped: called under the crosshair)
  if (PVP.mode !== 'ffa' && m.v !== NET.id && pvSideOf(m.v) === PVP.side) pvpMateDown(m.v);
  // (the last of your side to go down's killer, for who you watch once all of you are: pvpKiller)
  if (PVP.mode !== 'ffa' && pvSideOf(m.v) === PVP.side && m.k && m.k !== m.v && pvSideOf(m.k) !== PVP.side) PVP.wipeK = m.k;
  // its head gone: split in two by a blade (as a zombie's is), or a cloud of red where it was
  const Wk = WEAP[m.w] || {}, split = m.hs && Wk.melee && !Wk.blunt;
  if (m.hb || split) {
    let at = null; if (m.v === NET.id) { at = PM.head; } else { const p = NET.peers.get(m.v); at = p && p.av && p.av.head; if (at) p.av.headGone = true; }
    if (at) {
      const w = new V3(); at.getWorldPosition(w); const k = NET.peers.get(m.k) || (m.k === NET.id ? P : null), dx = k ? w.x - k.x : 0, dz = k ? w.z - k.z : 1, L = Math.hypot(dx, dz) || 1;
      if (split) headSplit(at, w, dx / L, dz / L, m.w); else { gorePop(w.x, w.y, w.z, dx / L, dz / L); SFX.headPop(m.k === NET.id || m.v === NET.id ? 1 : 0.6); }
      if (m.v !== NET.id && !(P.dead && camFocus().id === m.v)) goreAt(w.x, w.z, w.y, 1.3, 4.5);   // (a head going up near you, or near whoever you're watching from their eyes: a lot of it on your view)
      // (and the walls round it: a burst of it thrown on whatever stands near, behind and either side, effects/wall-blood.js)
      for (const o of [0, -0.6, 0.6, -1.2, 1.2]) { const c = Math.cos(o), sn = Math.sin(o), ux = dx / L * c - dz / L * sn, uz = dz / L * c + dx / L * sn; wallSpray(w.x, w.y, w.z, ux, uz, 1.6); }
      at.visible = false;
    }
  }
  pvpDismember(m);
  // down where they fell: a pool spreading under them
  splatLater(0.6, m.x, m.z, 'pool', rr(0.7, 1.0), undefined, 0.8);
}
// a head split by a blade, as a zombie's is (zombies/damage.js halveHead): cut through, so each half has only its own
// side's eye, half the nose and mouth, half the hair and beard, and the skull, meat and brain showing in the cut; the
// axe's straight down the middle or across through the eyes, a katana's or machete's now and then on a slant. Blood out
// of the cut, and the zombies' sound of it (SFX.split)
function headSplit(head, w, dx, dz, wId) {
  const kind = wId === 'axe' ? (rand() < 0.5 ? 'v' : 'h') : (wId === 'katana' || wId === 'machete') && rand() < 0.45 ? (rand() < 0.5 ? 'd' : 'e') : 'v';
  halveHead(head, kind, dx, dz, null);
  burst(w.x, w.y, w.z, 14, 'blood', dx, dz, 3); hitMist(w.x, w.y, w.z, dx, dz, true, 60); splatLater(0.25, w.x + dx * 0.6, w.z + dz * 0.6, 'drop', rr(0.35, 0.55));
  SFX.split();
}
// an arm or a leg taken off by the blow that killed them, as a zombie's is (zombies/damage.js sever): a shotgun's pellets
// up close blow it to red mist, a blade or a heavy round throws it off whole; blood pumps from where it was for a few
// seconds (LIMB_OFF: how close the shotgun has to be, m; the heavy rounds; how long it pumps, s)
const LIMB_OFF = { shells: 7, heavy: new Set(['hunting', 'revolver', 'deagle', 'scar']), pump: 2.4 }, LIMBS = ['armL', 'armR', 'legL', 'legR'];
function pvpDismember(m) {
  const D = WEAP[m.w] || {}, shells = D.ammo === 'shells' && (m.dm || 99) <= LIMB_OFF.shells, blade = D.melee && !D.blunt, heavy = LIMB_OFF.heavy.has(m.w);
  if (!shells && !blade && !heavy) return;
  const part = LIMBS.includes(m.pt) ? m.pt : shells || blade ? LIMBS[Math.floor(rand() * 4)] : null; if (!part) return;
  const rig = m.v === NET.id ? PM : (NET.peers.get(m.v) || {}).av, limb = rig && rig[part]; if (!limb || !limb.visible) return;
  const k = NET.peers.get(m.k) || (m.k === NET.id ? P : null), w = new V3(); limb.getWorldPosition(w);
  const dx0 = k ? w.x - k.x : 0, dz0 = k ? w.z - k.z : 1, L = Math.hypot(dx0, dz0) || 1, dx = dx0 / L, dz = dz0 / L;
  if (shells) { gorePop(w.x, w.y, w.z, dx, dz); SFX.crush(); }
  else {
    const c = limb.clone(true), q = new THREE.Quaternion(), s = new V3(); limb.getWorldQuaternion(q); limb.getWorldScale(s);
    c.position.copy(w); c.quaternion.copy(q); c.scale.copy(s); scene.add(c);
    gibs.push({ m: c, vx: dx * rr(2, 4) + rr(-1, 1), vy: rr(2, 3.6), vz: dz * rr(2, 4) + rr(-1, 1), spin: rr(6, 12), life: 9, landed: false });
    SFX.sever();
  }
  limb.visible = false;
  burst(w.x, w.y, w.z, 12, 'blood', dx, dz, 3); splatLater(0.3, w.x + dx * rr(0.4, 1), w.z + dz * rr(0.4, 1), 'drop', rr(0.3, 0.5));
  for (let t = 0.25; t < LIMB_OFF.pump; t += 0.35) setTimeout(() => { if (!limb.visible && PVP.on) { limb.getWorldPosition(w); bloodSpurt(w.x, w.y, w.z, dx, dz, 4, 0.8); } }, t * 1000);
}


// ---- every frame (game/update.js, in place of the farm's systems)
let pvpCastT = 0;
// the clock and the HUD, on real time every frame (game/loop.js), so they run on when the match's end has slowed the
// game to a stop (pvpEndScale)
// the light over a Showdown match (PVP_TOD), set as each round starts and still through it: morning in the first, a
// few hours later every round, midday, afternoon, dusk in the fourth and night from the fifth (round: hours a round on
// from from, at most to); at match point, dawn (dawn). The other modes stay in the afternoon. Every game works it out
// from the score, so they agree
const PVP_TOD = { from: 8, round: 3.25, to: 22.5, dawn: 6 };
// Deathmatch and Team deathmatch: one light for the whole match, drawn by the host as it starts (and sent with the
// clock, pvpCast): [hour, how likely]. Mostly daylight, morning to late afternoon; now and then dusk or night
const PVP_DAY = [[8.5, 2], [10.5, 3], [12.5, 3], [14.5, 3], [16.5, 3], [18.5, 1.5], [20.5, 1], [22.5, 1]];
function pvpTodPick() { let r = rand() * PVP_DAY.reduce((a, d) => a + d[1], 0); for (const [h, w] of PVP_DAY) if ((r -= w) <= 0) return h; return ARENA.tod; }
function pvpTodRound() {
  if (ARENA.indoor) { setTod(ARENA.tod); return; }   // (indoors it's always after closing, the lights on: world/arena-mall.js)
  if (PVP.mode !== 'rounds') { setTod(PVP.tod ?? ARENA.tod); return; }
  const lead = Math.max(...PVP.wins), L = PVP_LIM.rounds;
  setTod(lead >= L - 1 ? PVP_TOD.dawn : Math.min(PVP_TOD.to, PVP_TOD.from + PVP_TOD.round * (PVP.rd - 1)));
}
export function pvpTick(rdt) {
  if (!PVP.on) return;
  // (your class and perks just above your health, or, with your team listed there, just above them)
  if (hudEls) { const tm = document.getElementById('team'), r = tm && !tm.hidden && tm.offsetHeight ? tm.getBoundingClientRect() : null, b = r ? Math.round(innerHeight - r.top + 8) + 'px' : ''; if (hudEls.kit.style.bottom !== b) hudEls.kit.style.bottom = b; }
  // the clock: the host's runs it, everyone else's follows it (and is put right by each word from the host)
  const loading = isHost() && PVP.rd === 1 && PVP.ph === 'pick' && roster().some(r => !pvpIn.has(r.id)) && (PVP.waitT += rdt) < PVP_T.loadWait;
  if (!loading) PVP.t = Math.max(0, PVP.t - rdt);
  if (hudEls) hudEls.pick.classList.toggle('loading', loading);
  if (isHost()) {
    if (PVP.t <= 0) pvpTimeUp();
    else if (PVP.ph === 'live' && PVP.mode === 'rounds') pvpCheckRound();
    if ((pvpCastT -= rdt) <= 0) { pvpCastT = 1; pvpCast(); }
  }
  // everyone's stats and ping for the scoreboard: yours out every second (the host's bots' with them), the host's game
  // asked how long a word takes there and back every two
  if ((PVP.stT = (PVP.stT || 0) - rdt) <= 0) {
    PVP.stT = 1; const me = PVP.my, a = [me.dmg, me.hits, me.shots, me.hs, me.long, isHost() ? 0 : PVP.ping]; PVP.st[NET.id] = a; netSend('pst', { s: a });
    if (isHost()) botStats().forEach(([id, b]) => { PVP.st[id] = b; netAs(id, 'pst', { s: b }); });
    if (!isHost() && (PVP.pingN = ((PVP.pingN || 0) + 1) % 2) === 0) netTo(NET.hostId, 'pi', { c: Math.round(performance.now()) });
    if (hudEls.board.classList.contains('on')) pvpBoard(true);
  }
  if (PVP.ph === 'over' && hudEls.res.classList.contains('on')) { const w = hudEls.res.querySelector('.prWait'); if (w) w.textContent = 'Back to the lobby in ' + Math.ceil(PVP.t); }
  dmgNumsStep(rdt);
  flagShow(rdt);
  pvpHud();
}
NET_ON.pst = m => { if (PVP.on && Array.isArray(m.s)) PVP.st[m.f] = m.s; };
NET_ON.pi = m => { if (isHost()) netTo(m.f, 'po', { c: m.c }); };
NET_ON.po = m => { PVP.ping = Math.max(0, Math.round(performance.now() - m.c)); };
const ledger = (o, id, d) => { const e = o[id] || (o[id] = [0, 0]); e[0] += d; e[1]++; };
// the match won: the game slowing on and on, to a dead stop END_SLOW seconds after (game/loop.js: its time scale)
const END_SLOW = 2.8;
export const pvpEndScale = () => Math.pow(1 - clamp((performance.now() - (PVP.overAt || 0)) / (END_SLOW * 1000), 0, 1), 1.7);
export const pvpEnding = () => PVP.on && PVP.ph === 'over';
// the next loadout made ready ahead (pvpPhase, at a round's end): its pictures for the loadout card, and its weapons as
// they'll be on each of the others (net/arsenal.js arsenalWarm), one piece of it each step (pvpUpdate)
const PVP_WARM = [];
const WARM_AFTER = 1.9;   // (s into a round's end: the shine's 1.7 s and a beat)
function pvpWarm(C) {
  PVP_WARM.length = 0; arsenalWarmClear();
  C.guns.forEach(([id, gt, mods, lv]) => PVP_WARM.push(() => pvpGunArt(id, gt, mods, lv)));
  PVP_WARM.push(() => meleeArt(C.melee, []));
  const n = NET.peers.size;
  for (let k = 0; k < n; k++) for (const [id, gl] of botKitGl(C)) PVP_WARM.push(() => arsenalWarm(gl, id));
  PVP_WARM.push(() => arsenalWarmCompile(R, scene, cam));
}
// the game itself, every step of it (game/update.js)
export function pvpUpdate(dt) {
  if (!PVP.on) return;
  // (the next round's guns built ahead, a piece a frame: not while a round's just been called, WARM_AFTER, when the score
  // bar's shine and the banner play, which those builds stalled; after them, in the rest of the wait)
  if (PVP_WARM.length && !(PVP.ph === 'roundEnd' && PVP_T.roundEnd - PVP.t < WARM_AFTER)) { try { PVP_WARM.shift()(); } catch (e) { console.warn('warm', e); } }
  PVP.prot = Math.max(0, PVP.prot - dt);
  if (pvpLocked() || PVP.ph === 'over') P.stun = Math.max(P.stun || 0, 0.06);   // (and on the match's results, the game over: you stay where you are. A round won, you can walk about till the next, pvpLocked lets you reload and lean)
  if (isHost()) botsUpdate(dt);
  if (PVP.flag && PVP.ph === 'live') flagStep(dt);
  if (!P.dead) BODY_BLOOD.floor = PVP_BLOOD * clamp(1 - P.hp / S.maxHp, 0, 1);   // (blood on you as you're hurt: effects/body-blood.js, and on everyone else alike, net/avatars.js)
  // down in Deathmatch: back in after a few seconds
  // (once you've opened the loadouts lying there, PVP.hold, you're not put back in when the count's done: only when you
  // press Space, pvpSkipDeath, so a loadout being changed is never cut off by the respawn)
  if (P.dead && PVP.mode !== 'rounds' && PVP.ph === 'live' && PVP.respawn > 0) { PVP.respawn = Math.max(PVP.hold ? 0.0005 : 0, PVP.respawn - dt); if (PVP.respawn <= 0) pvpBackIn(); }
  // health back on its own, once you've been left alone a moment (REGEN): eased in, all of it by REGEN.full
  if (!P.dead && PVP.ph === 'live' && PVP.mode !== 'rounds') {
    const mx = S.maxHp;
    if (P.bleed > 0 || P.hp >= mx) { PVP.calm = P.bleed > 0 ? 0 : PVP.calm; PVP.regen0 = null; }
    if (!(P.bleed > 0) && P.hp < mx && (PVP.calm = (PVP.calm || 0) + dt) > REGEN.wait) {
      if (PVP.regen0 == null) PVP.regen0 = P.hp;
      const u = clamp((PVP.calm - REGEN.wait) / (REGEN.full - REGEN.wait), 0, 1);
      P.hp = Math.max(P.hp, PVP.regen0 + (mx - PVP.regen0) * u * u);
    }
  }
  PVP.blurT = Math.max(0, (PVP.blurT || 0) - dt);
}
function pvpTimeUp() {
  if (PVP.ph === 'pick') pvpPhase('count', PVP.mode === 'rounds' ? PVP_T.countRd : PVP_T.count);
  else if (PVP.ph === 'count') pvpPhase('live', PVP.mode === 'rounds' ? PVP_T.round : PVP_T.match);
  else if (PVP.ph === 'live') { if (PVP.mode !== 'rounds') pvpPhase('over', PVP_T.over); else if (!PVP.flag) { flagUp(); PVP.t = FLAG.win; pvpCast(); } else pvpRoundOver(flagLeader()); }
  else if (PVP.ph === 'roundEnd') { if (Math.max(...PVP.wins) >= PVP_LIM.rounds) pvpPhase('over', PVP_T.over); else { PVP.rd++; pvpPhase('pick', pickT(false)); } }
  else if (PVP.ph === 'over') { netSend('pend', {}); pvpLeave(); }
}
// who's still up on each side (you, and everyone else as their pose says)
function pvpAlive() { const n = { A: 0, B: 0, hpA: 0, hpB: 0 }; const add = (id, dead, hp) => { const s = pvSideOf(id); if (!dead && (s === 'A' || s === 'B')) { n[s]++; n['hp' + s] += hp; } }; add(NET.id, P.dead, P.hp); for (const p of NET.peers.values()) add(p.id, p.dead, p.hp ?? 100); return n; }
function pvpCheckRound() {
  const n = pvpAlive(), sides = new Set(Object.values(PVP.teams));
  if (sides.size < 2) return;   // (on your own: nobody to lose to)
  if (!n.A || !n.B) pvpRoundOver(!n.A && !n.B ? '' : n.A ? 'A' : 'B');
}
// the flag's clock out with nobody having taken it: the side with the most health left between them
const flagLeader = () => { const n = pvpAlive(); return n.hpA !== n.hpB ? (n.hpA > n.hpB ? 'A' : 'B') : ''; };
function pvpRoundOver(w) {
  if (w) PVP.wins[w === 'B' ? 1 : 0]++;
  PVP.rw = w || '-'; pvpPhase('roundEnd', PVP_T.roundEnd);
}
function pvpCheckEnd() {
  if (PVP.ph !== 'live') return;
  if (PVP.mode === 'ffa' && Object.values(PVP.sc).some(s => s[0] >= PVP_LIM.ffa)) pvpPhase('over', PVP_T.over);
  if (PVP.mode === 'tdm' && Math.max(...PVP.ts) >= PVP_LIM.tdm) pvpPhase('over', PVP_T.over);
}
// the host's word on how it stands: everyone's screen follows it
function pvpCast() { netSend('pm', { ph: PVP.ph, tl: Math.round(PVP.t * 10) / 10, rd: PVP.rd, w: PVP.wins, sc: PVP.sc, ts: PVP.ts, rw: PVP.rw || '', fg: PVP.flag ? 1 : 0, kit: PVP.kit, fl: PVP.flip ? 1 : 0, kn: PVP.kitNext || null, td: PVP.tod ?? null }); }
NET_ON.pm = m => {
  if (!PVP.on || isHost()) return;
  PVP.sc = m.sc || PVP.sc; PVP.ts = m.ts || PVP.ts; PVP.rd = m.rd; PVP.rw = m.rw; PVP.flip = !!m.fl;
  if (m.td != null && m.td !== PVP.tod) { PVP.tod = m.td; if (PVP.mode !== 'rounds') pvpTodRound(); }   // (the host's light for the match)
  if (m.kn && JSON.stringify(m.kn) !== JSON.stringify(PVP.kitNext)) { PVP.kitNext = m.kn; pvpWarm(m.kn); }
  if (m.kit !== undefined && JSON.stringify(m.kit) !== JSON.stringify(PVP.kit)) { PVP.kit = m.kit; if (hudEls.pick.classList.contains('on')) pvpPickOpen(true, hudEls.pick.classList.contains('small')); }
  if (m.fg && !PVP.flag && m.ph === 'live') flagUp(); else if (!m.fg && PVP.flag) flagDown();
  const was = PVP.wins.join(); PVP.wins = m.w || PVP.wins;
  if (m.ph !== PVP.ph) pvpPhase(m.ph, m.tl); else PVP.t = m.tl;   // (tl: the time left; a message's t is its kind, net/net.js)
  if (was !== PVP.wins.join()) PVP.key = '';
};
NET_ON.pend = () => { if (PVP.on) pvpLeave(); };
// back to the lobby, the farm with it
function pvpLeave() { pvpEnd(); leaveToMenu(); }
// the host ending the match from the pause screen (ui/screens.js END_GAME): over for everyone, on to the results
END_GAME.can = () => PVP.on ? isHost() && PVP.ph !== 'over' : !netLink();
END_GAME.go = () => { if (!PVP.on || !isHost()) return false; resumeRun(); pvpPhase('over', PVP_T.over); return true; };
// a round called: who took it
function pvpRoundBanner() {
  const w = PVP.rw, mine = w === PVP.side;
  pvpBanner(!w || w === '-' ? 'Draw' : mine ? 'Round won' : 'Round lost', PVP_SIDE.A.name + ' ' + PVP.wins[0] + ' – ' + PVP.wins[1] + ' ' + PVP_SIDE.B.name, !w || w === '-' ? 'draw' : mine ? 'win' : 'lose');
  if (w && w !== '-') (mine ? SFX.upgrade : SFX.wave)();
}

// ---- the flag (Showdown, once a round's clock has run out: FLAG): up in the middle on everyone's screen, a pole with
// its flag in the colour of the side taking it (white while nobody is, or both are) and a ring on the ground round it.
// The host's game works out who's on it and how far each side's got, and tells everyone five times a second
let flagG = null;
function flagUp() {
  PVP.flag = { p: [0, 0], w: '', c: false, sendT: 0 };
  if (!flagG) {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.9, 8), lam(0x8a8d90)); pole.position.y = 1.45; pole.castShadow = true; g.add(pole);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lam(0xc9a43a)); top.position.y = 2.93; g.add(top);
    const piv = new THREE.Group(); piv.position.y = 2.55; g.add(piv);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.58, 6, 1), new THREE.MeshLambertMaterial({ color: 0xf2efe6, side: THREE.DoubleSide })); cloth.position.x = 0.5; cloth.castShadow = true; piv.add(cloth);
    const ring = new THREE.Mesh(new THREE.RingGeometry(FLAG.r - 0.09, FLAG.r, 56), new THREE.MeshBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.55, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(FLAG.r - 0.09, 56), new THREE.MeshBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.08, depthWrite: false }));
    [ring, disc].forEach(m => { m.rotation.x = -Math.PI / 2; m.position.y = 0.03; g.add(m); });
    g.position.set(FLAG.at[0], 0, FLAG.at[1]); flagG = g; flagG.userData = { piv, cloth, ring, disc };
  }
  if (!flagG.parent) scene.add(flagG);
  flagG.visible = true; document.body.classList.add('flagOn');
  pvpBanner('Flag up', 'Hold the middle for ' + FLAG.cap + ' s to take the round', 'go'); SFX.wave();
}
function flagDown() { PVP.flag = null; document.body.classList.remove('flagOn'); if (flagG) { flagG.visible = false; if (flagG.parent) flagG.parent.remove(flagG); } if (hudEls) hudEls.flag.classList.remove('on'); }
// who's on it (the host's): a side alone gains, both and it holds, a side off it loses what it had at FLAG.back
function flagStep(dt) {
  const F = PVP.flag; if (!isHost()) return;
  const on = { A: 0, B: 0 }, add = (id, x, z, dead) => { if (dead || x === undefined || Math.hypot(x - FLAG.at[0], z - FLAG.at[1]) > FLAG.r) return; const sd = pvSideOf(id); if (sd in on) on[sd]++; };
  add(NET.id, P.x, P.z, P.dead); for (const p of NET.peers.values()) add(p.id, p.x, p.z, p.dead);
  F.c = on.A > 0 && on.B > 0; F.w = F.c ? '' : on.A ? 'A' : on.B ? 'B' : '';
  // (the more of a side on it the faster it goes: FLAG.many, one, two, three of them)
  ['A', 'B'].forEach((sd, k) => { if (F.w === sd) F.p[k] += dt * FLAG.many[Math.min(FLAG.many.length, on[sd]) - 1]; else if (!F.c) F.p[k] = Math.max(0, F.p[k] - dt * FLAG.back); });
  const won = F.p[0] >= FLAG.cap ? 'A' : F.p[1] >= FLAG.cap ? 'B' : '';
  if ((F.sendT -= dt) <= 0 || won) { F.sendT = 0.2; netSend('pf', { p: F.p.map(v => Math.round(v * 10) / 10), w: F.w, c: F.c ? 1 : 0 }); }
  if (won) { PVP.flagWon = won; pvpRoundOver(won); }
}
NET_ON.pf = m => { if (!PVP.on || isHost() || !PVP.flag) return; Object.assign(PVP.flag, { p: m.p || [0, 0], w: m.w || '', c: !!m.c }); };
export const pvpFlag = () => PVP.on && PVP.flag ? { x: FLAG.at[0], z: FLAG.at[1], r: FLAG.r, p: PVP.flag.p, w: PVP.flag.w, cap: FLAG.cap } : null;   // (for the bots: pvp/bots.js)
// its look and the bar for it under the score: each side's share filling in from its end, who's on it, and its clock
function flagShow(rdt) {
  const F = PVP.flag, el = hudEls.flag;
  if (!F) return;
  el.classList.add('on');
  const col = F.c ? '#f2efe6' : F.w ? PVP_SIDE[F.w].col : '#f2efe6', U = flagG && flagG.userData, t = performance.now() / 1000;
  if (U) { U.cloth.material.color.set(col); U.ring.material.color.set(col); U.disc.material.color.set(col); U.piv.rotation.y = Math.sin(t * 2.6) * 0.35 + Math.sin(t * 6.1) * 0.08; U.ring.material.opacity = F.w || F.c ? 0.55 + 0.25 * Math.sin(t * 8) : 0.45; }
  if (!el.firstChild) el.innerHTML = '<b>The flag</b><s><u class="a"></u><u class="b"></u></s><em></em>';
  const [a, b] = el.querySelectorAll('u'); a.style.width = (Math.min(1, F.p[0] / FLAG.cap) * 50).toFixed(2) + '%'; b.style.width = (Math.min(1, F.p[1] / FLAG.cap) * 50).toFixed(2) + '%';
  const txt = (F.c ? 'Contested' : F.w ? PVP_SIDE[F.w].name + ' taking it' : 'Nobody on it') + ' · ' + fmtT(Math.max(0, PVP.t)) + ' left, then most health wins';
  if (el.lastChild.textContent !== txt) el.lastChild.textContent = txt;
  el.classList.toggle('mine', !!F.w && F.w === PVP.side); el.classList.toggle('theirs', !!F.w && F.w !== PVP.side); el.classList.toggle('both', F.c);
}

// ---- damage numbers: what your hits did, over whoever took them, adding up while you keep hitting them (DMG_NUM:
// how long one stays, how long it takes to fade, and how soon a hit must follow to add to it, seconds)
// (near: within the first distance of your aim (px) it's down to a fifth of itself, coming back by the second)
const DMG_NUM = { hold: 0.9, fade: 0.35, join: 0.75, big: 40, near: [45, 150, 0.8] }, dmgNums = new Map(), _dnV = new V3();
function dmgNum(p, d, head) {
  let n = dmgNums.get(p.id);
  if (!n || n.t > DMG_NUM.join) { if (n) n.el.remove(); const el = document.createElement('div'); el.className = 'pvpDmg'; document.body.appendChild(el); n = { el, d: 0, t: 0, head: false, p }; dmgNums.set(p.id, n); }
  n.d += d; n.t = 0; n.head = n.head || head; n.el.textContent = n.d; n.el.classList.toggle('head', n.head);
  n.el.style.fontSize = Math.round(20 + Math.min(16, n.d / 6)) + 'px'; replay(n.el, d >= DMG_NUM.big ? 'big' : 'pop');   // (bigger the more it's added up to; a heavy hit pops harder)
}
function dmgNumsStep(dt) {
  for (const [id, n] of dmgNums) {
    n.t += dt; const a = n.p.av;
    if (!a || !PVP.on || n.t > DMG_NUM.hold + DMG_NUM.fade) { n.el.remove(); dmgNums.delete(id); continue; }
    const c = fpOn() ? FP_CAM : cam; c.updateMatrixWorld(); a.head.updateWorldMatrix(true, false);   // (where they are this frame, from the eyes you're seeing with)
    a.head.getWorldPosition(_dnV); _dnV.y += 0.38 + Math.min(0.3, n.t * 0.25); _dnV.project(c);
    if (_dnV.z > 1) { n.el.style.opacity = 0; continue; }
    const sx = (_dnV.x * 0.5 + 0.5) * innerWidth, sy = (-_dnV.y * 0.5 + 0.5) * innerHeight;
    n.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    // (near where you're aiming it all but fades away, so it never sits over what you're shooting at: DMG_NUM.near)
    const da = Math.hypot(sx - mouseX, sy - mouseY), near = clamp(1 - (da - DMG_NUM.near[0]) / (DMG_NUM.near[1] - DMG_NUM.near[0]), 0, 1);
    n.el.style.opacity = ((n.t < DMG_NUM.hold ? 1 : 1 - (n.t - DMG_NUM.hold) / DMG_NUM.fade) * (1 - DMG_NUM.near[2] * near)).toFixed(3);
  }
}

// ---- the HUD: the score and the clock up top, the kill feed, the big calls, the class picker and the results
let hudEls = null;
function pvpHudBuild() {
  if (!hudEls) {
    const mk = (id, cls) => { const d = document.createElement('div'); d.id = id; d.className = 'hud ' + (cls || ''); document.body.appendChild(d); return d; };
    hudEls = { top: mk('pvpTop'), feed: mk('pvpFeed'), ban: mk('pvpBan'), pick: mk('pvpPick'), res: mk('pvpRes'), toast: mk('pvpToast'), count: mk('pvpCount'), prot: mk('pvpProt'), board: mk('pvpBoard'), card: mk('pvpDmgCard'), mate: mk('pvpMate'), kit: mk('pvpKit'), flag: mk('pvpFlag') };
    hudEls.res.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || !isHost()) return; SFX.click(); if (b.dataset.act === 'rematch') { netSend('prm', {}); pvpRematch(); } else { netSend('pend', {}); pvpLeave(); } });
    // the scoreboard, held up with Tab
    addEventListener('keydown', e => { if (!PVP.on || e.key !== 'Tab' || state === 'title') return; e.preventDefault(); if (!e.repeat) pvpBoard(true); });
    addEventListener('keyup', e => { if (e.key === 'Tab') pvpBoard(false); });
    hudEls.prot.innerHTML = 'Spawn protection<s><u></u></s>';
    hudEls.count.innerHTML = '<small></small><b></b>';
    hudEls.pick.addEventListener('click', e => { const b = e.target.closest('[data-cls]'); if (b) pvpChoose(b.dataset.cls); });
    addEventListener('keydown', e => { if (!PVP.on || !document.body.classList.contains('pvpPicking')) return; const n = +e.key; if (n >= 1 && n <= PVP_CLASSES.length) { pvpChoose(PVP_CLASSES[n - 1].id); e.preventDefault(); } });
  }
  Object.values(hudEls).forEach(e => { e.hidden = false; });
  hudEls.feed.innerHTML = ''; hudEls.res.classList.remove('on'); hudEls.ban.className = 'hud'; hudEls.card.classList.remove('on'); hudEls.board.classList.remove('on'); PVP.key = '';
}
function pvpHudHide() { if (hudEls) Object.values(hudEls).forEach(e => { e.hidden = true; e.classList.remove('on'); }); }
const fmtT = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
// how many seconds left the clock starts flashing red
const CLOCK_LOW = 10;
function pvpHud() {
  if (!hudEls) return;
  // spawn protection: a strip under the crosshair running down while it lasts (firing ends it)
  const pr = !P.dead && PVP.ph === 'live' && PVP.prot > 0; hudEls.prot.classList.toggle('on', pr); if (pr) hudEls.prot.lastChild.firstChild.style.transform = `scaleX(${(PVP.prot / PVP_T.prot).toFixed(3)})`;
  // the count in: a big number for each second left, popping in and shrinking away as the second runs (a tick with it)
  if (PVP.ph === 'count') { const n = Math.ceil(PVP.t); if (n !== PVP.cn && n > 0) { PVP.cn = n; const b = hudEls.count.querySelector('b'); b.textContent = n; replay(b, 'tick'); SFX.click(); } }
  const T = Math.ceil(PVP.t), key = [PVP.ph, T, JSON.stringify(PVP.sc), PVP.ts.join(), PVP.wins.join(), PVP.rd, P.dead ? 1 : 0, Math.ceil(PVP.respawn), [...NET.peers.values()].map(p => p.dead ? 1 : 0).join(''), PVP.mode === 'rounds' ? sideHp('A').join() + sideHp('B').join() : ''].join('|');
  if (PVP.key === key) return; PVP.key = key;
  const el = hudEls.top, clock = PVP.ph === 'live' || PVP.ph === 'pick' || PVP.ph === 'count' ? fmtT(Math.max(0, PVP.t)) : '';
  el.classList.toggle('low', PVP.ph === 'live' && PVP.t <= CLOCK_LOW);   // (the last seconds: the clock flashing red)
  if (PVP.mode === 'ffa') {
    const list = roster().map(r => ({ ...r, k: (PVP.sc[r.id] || [0])[0] })).sort((a, b) => b.k - a.k);
    el.innerHTML = `<div class="ptMode">${PVP_MODES.ffa}<small>First to ${PVP_LIM.ffa}</small></div><div class="ptClock">${clock}</div><div class="ptList">` +
      list.map(r => `<span class="ptChip${r.id === NET.id ? ' me' : ''}" style="--c:${colOf(r.id)}"><i></i><b>${r.k}</b><em></em></span>`).join('') + '</div>';
    el.querySelectorAll('.ptChip em').forEach((e, k) => { e.textContent = list[k].name; });
  } else {
    const a = PVP.mode === 'rounds' ? PVP.wins[0] : PVP.ts[0], b = PVP.mode === 'rounds' ? PVP.wins[1] : PVP.ts[1];
    // a round just won (Showdown): that side's panel lit and swept with a glint, its score popping, the new pip
    // landing with a few sparks off it (pvp.css: ptWon); more of it for your own side. Drawn again mid-way (the bar's
    // redrawn every second), each picks up where it had got to (--el, a negative delay), never starting over
    const ws = PVP.winsSeen || [0, 0]; ['A', 'B'].forEach((sd, i) => { if (PVP.wins[i] > ws[i]) PVP.wonFx = { sd, k: PVP.wins[i] - 1, t: performance.now() }; }); PVP.winsSeen = PVP.wins.slice();
    const F = PVP.mode === 'rounds' && PVP.wonFx && performance.now() - PVP.wonFx.t < WON_FX ? PVP.wonFx : null, el0 = F ? ((PVP.wonFx.t - performance.now()) / 1000).toFixed(2) + 's' : '0s';
    const sparks = () => Array.from({ length: 7 }, (_, k) => { const a = k / 7 * 6.283 + 0.4, r = 16 + (k % 3) * 6; return `<span class="sp" style="--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r).toFixed(1)}px"></span>`; }).join('');
    const pips = (w, sd) => PVP.mode === 'rounds' ? `<span class="ptPips">${Array.from({ length: PVP_LIM.rounds }, (_, k) => `<i class="${k < w ? 'on' : ''}${F && F.sd === sd && F.k === k ? ' new' : ''}">${F && F.sd === sd && F.k === k ? sparks() : ''}</i>`).join('')}</span>` : '';
    const won = sd => F && F.sd === sd ? ` won${PVP.side === sd ? ' mine' : ''}" style="--el:${el0}` : '';
    // Showdown: each side's health all told, out of all it could have: white over dark grey
    const hpBar = sd => { if (PVP.mode !== 'rounds') return ''; const [h, m] = sideHp(sd); return `<span class="ptHp"><s><u style="width:${m ? (h / m * 100).toFixed(1) : 0}%"></u></s><em>${h}<i>/ ${m}</i></em></span>`; };
    const alive = s => PVP.mode === 'rounds' ? `<span class="ptAlive">${roster().filter(r => pvSideOf(r.id) === s).map(r => `<svg viewBox="${GI_VB}" class="${(r.id === NET.id ? P.dead : (NET.peers.get(r.id) || {}).dead) ? 'down' : ''}">${GI.person || ''}</svg>`).join('')}</span>` : '';
    el.innerHTML = `<div class="ptSide A${PVP.side === 'A' ? ' me' : ''}${won('A')}"><span class="ptGlint"></span><b>${a}</b>${pips(a, 'A')}${alive('A')}${hpBar('A')}</div>` +
      `<div class="ptMid"><div class="ptMode">${PVP.mode === 'rounds' ? 'Round ' + PVP.rd : PVP_MODES.tdm}${pvpStake() ? `<small class="ptStake ${pvpStake()}">${pvpStake() === 'final' ? 'Final round' : 'Match point'}</small>` : `<small>${PVP.mode === 'rounds' ? 'First to ' + PVP_LIM.rounds : 'First to ' + PVP_LIM.tdm}</small>`}</div><div class="ptClock">${clock}</div></div>` +
      `<div class="ptSide B${PVP.side === 'B' ? ' me' : ''}${won('B')}"><span class="ptGlint"></span><b>${b}</b>${pips(b, 'B')}${alive('B')}${hpBar('B')}</div>`;
  }
  // down in Deathmatch: when you'll be back, at the foot of the card
  { const sp = hudEls.card.querySelector('.dcBack span'), live = P.dead && PVP.mode !== 'rounds' && PVP.ph === 'live';   // (the count; held for a loadout change, waiting on Space once it's done)
    const html = !live ? '' : PVP.hold && PVP.respawn <= 0.001 ? `${kbd('vault')} to go back in` : `Back in <b>${Math.max(1, Math.ceil(PVP.respawn))}</b>${PVP.hold ? ' · then ' + kbd('vault') : ''}`;
    if (sp && sp.dataset.h !== html) { sp.dataset.h = html; sp.innerHTML = html; } }
}
// how long a round won's flourish on the score bar lasts (ms)
const WON_FX = 2600;
// a side's health now and the most it could be, everyone on it added up (the down count none)
function sideHp(sd) {
  let h = 0, m = 0;
  for (const r of roster()) {
    if (pvSideOf(r.id) !== sd) continue;
    if (r.id === NET.id) { m += S.maxHp; if (!P.dead) h += Math.max(0, P.hp); continue; }
    const p = NET.peers.get(r.id) || {}; m += p.maxHp || 100; if (!p.dead) h += Math.max(0, p.hp ?? 100);
  }
  return [Math.round(h), Math.round(m)];
}
// a line in the kill feed: who, with what (its picture), a headshot's mark, how far off (m), who
function pvpFeed(m) {
  if (!hudEls) return;
  const row = document.createElement('div'); row.className = 'pfRow' + (m.k === NET.id || m.v === NET.id ? ' me' : '');
  const art = kitArt(m.w, m.g), as = (m.as || []).filter(id => id !== m.k && id !== m.v);
  row.innerHTML = `<b style="color:${colOf(m.k)}"></b>${as.map(id => `<span class="as">+</span><b class="asN" style="color:${colOf(id)}" data-id="${id}"></b>`).join('')}${art ? `<img alt="" src="${art.url}">` : '<i></i>'}${m.hs ? `<svg viewBox="${GI_VB}" class="hs" aria-label="Headshot">${GI.headshot || ''}</svg>` : ''}${m.k && m.k !== m.v && m.dm ? `<em class="dm">${m.dm}m</em>` : ''}<b style="color:${colOf(m.v)}"></b>`;
  const bs = row.querySelectorAll('b:not(.asN)'); bs[0].textContent = m.k ? nameOf(m.k) : ''; bs[1].textContent = nameOf(m.v);
  bs[0].classList.toggle('you', m.k === NET.id); bs[1].classList.toggle('you', m.v === NET.id);
  row.querySelectorAll('b.asN').forEach(b => { b.textContent = nameOf(b.dataset.id); b.classList.toggle('you', b.dataset.id === NET.id); });   // (the assists: + and their names, smaller, after the killer's)   // (yours, picked out from everyone's colours)
  hudEls.feed.prepend(row); while (hudEls.feed.children.length > 5) hudEls.feed.lastChild.remove();
  setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 700); }, 5000);   // (faded out: pvp.css pfOut)
}
let banT = 0;
function pvpBanner(big, small, kind) {
  if (!hudEls) return;
  const el = hudEls.ban; el.innerHTML = '<b></b><small></small>'; el.firstChild.textContent = big; el.lastChild.textContent = small || '';
  el.className = 'hud on ' + (kind || ''); clearTimeout(banT); banT = setTimeout(() => el.classList.remove('on'), kind === 'count' ? 2600 : 1800);
}
// a call under the crosshair: a kill (its mark swelling in out of a flash, a line drawn out either side, the name under
// it; kills in a row called as such), who got you, or a quieter word (kind 'info')
let pvToastT = 0;
const KILL_RUN = { gap: 4.5, call: ['', '', 'Double kill', 'Triple kill', 'Quad kill', 'Rampage'] };
function pvpToast(a, b, kind) {
  if (!hudEls) return;
  const el = hudEls.toast, kill = kind === 'kill' || kind === 'head', ic = kind === 'head' ? GI.headshot : kind === 'kill' || kind === 'dead' ? GI.deathSkull : '';
  if (kill) { const t = performance.now() / 1000; PVP.streak = t - (PVP.streakAt || 0) < KILL_RUN.gap ? (PVP.streak || 1) + 1 : 1; PVP.streakAt = t; }
  const call = kill ? KILL_RUN.call[Math.min(PVP.streak, KILL_RUN.call.length - 1)] : '';
  el.innerHTML = (ic ? `<span class="tIc"><svg viewBox="${GI_VB}">${ic}</svg></span>` : '') + `<small></small><b></b><i class="tLine"></i>` + (call ? `<em class="tCall"></em>` : '');
  el.querySelector('small').textContent = a; el.querySelector('b').textContent = b; if (call) el.querySelector('.tCall').textContent = call;
  el.className = 'hud ' + kind; void el.offsetWidth; el.classList.add('on'); clearTimeout(pvToastT); pvToastT = setTimeout(() => el.classList.remove('on'), kill ? 2200 : 1800);
}
// a teammate down (the team modes): a notice slid in under the score, in red, with how many of you are left
let mateT = 0;
function pvpMateDown(id) {
  const left = roster().filter(r => pvSideOf(r.id) === PVP.side && !(r.id === NET.id ? P.dead : (NET.peers.get(r.id) || {}).dead)).length;
  const el = hudEls.mate; el.innerHTML = `<svg viewBox="${GI_VB}">${GI.deathSkull || ''}</svg><b></b><span>down</span><em>${left ? left + ' left' : 'Your side is out'}</em>`; el.querySelector('b').textContent = nameOf(id);
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(mateT); mateT = setTimeout(() => el.classList.remove('on'), 3200);
  SFX.thud();
}
// a class's gun as its card pictures it: drawn with the class's own attachments and mods, not whatever's on yours
// (the gun as the loadout has it, and nothing of what you happen to have on yours: so the same loadout's picture is
// the same one each time, drawn once, and drawn ahead of time at a round's end, pvpWarm)
function pvpGunArt(id, gt, mods, lv) {
  const keep = [], put = (o, k, v) => { if (!W8[o]) return; keep.push([o, k, k in W8[o], W8[o][k]]); if (v === undefined) delete W8[o][k]; else W8[o][k] = v; };
  put('gt', id, gt || {}); put('mods', id, mods || []); ['att', 'tune', 'rds', 'rounds', 'pin'].forEach(o => put(o, id, undefined));
  if (!W8.modLv) W8.modLv = {}; (mods || []).forEach(m => put('modLv', m, (lv || {})[m] || 1));
  recomputeEff();   // (its own stats as that loadout has them: a pair of pistols drawn as a pair)
  try { return gunArt(id); } finally { for (let i = keep.length - 1; i >= 0; i--) { const [o, k, had, v] = keep[i]; if (had) W8[o][k] = v; else delete W8[o][k]; } recomputeEff(); }
}
// the class picker: a card for each class, its guns' pictures and attachments, its perks, its melee weapon and
// bandages; 1 to 5 or a click
function pvpPickOpen(on, small) {
  if (!hudEls) return;
  document.body.classList.toggle('pvpPicking', on);
  const el = hudEls.pick, was = el.classList.contains('on'); el.classList.toggle('on', on); el.classList.toggle('small', !!small);
  if (!on) { if (was && state === 'play') wantLock(); return; }   // (put away: in first person the mouse taken back for the game, game/view-cam.js)
  // Showdown's random loadout: no picking, just what everyone's carrying these rounds
  const kitCard = C => `<div class="ppCard on kit"><b>${C.name}</b><span class="ppGuns">` +
    C.guns.map(([id, gt, mods, lv]) => { const a = pvpGunArt(id, gt, mods, lv); return `<span class="ppGun"><img alt="" src="${a ? a.url : ''}"><em>${WEAP[id].name}<i>${[...(mods || []).map(m => (MODS[m] || {}).name || m), ...pvpAtts(id, gt)].join(' · ') || 'As it comes'}</i></em></span>`; }).join('') +
    `</span><span class="ppKit"><span class="ppMelee"><img alt="" src="${meleeArt(C.melee, []).url}">${WEAP[C.melee] ? WEAP[C.melee].name : C.melee}</span></span></div>`;
  if (pvpKitOn()) {
    const last = Math.ceil(PVP.rd / kitRounds()) * kitRounds();
    el.innerHTML = `<div class="ppHead"><i class="ppWait">Waiting for everyone to load in…</i><small>Round ${PVP.rd}</small><b>This round's loadout</b><em>${PVP.rd === last ? 'A new one next round' : 'A new one after round ' + last}</em></div><div class="ppRow">${kitCard(PVP.kit)}</div>`;
    return;
  }
  el.innerHTML = `<div class="ppHead"><i class="ppWait">Waiting for everyone to load in…</i><small>${PVP.swap ? (P.dead ? 'Back in soon' : PVP.prot > 0 ? 'Changes now' : 'For your next life') : small ? 'Back in soon' : PVP.mode === 'rounds' && PVP.rd > 1 ? 'Round ' + PVP.rd : PVP_MODES[PVP.mode]}</small><b>Choose your class</b><em>1 – ${PVP_CLASSES.length}</em></div><div class="ppRow">` +
    PVP_CLASSES.map(c => pvpMine(c.id)).map((C, k) => `<button type="button" class="ppCard${C.id === PVP.cls ? ' on' : ''}" data-cls="${C.id}"><kbd>${k + 1}</kbd><b>${C.name}</b><small>${C.role}</small><span class="ppGuns">` +
      C.guns.map(([id, gt, mods, lv]) => { const a = pvpGunArt(id, gt, mods, lv); return `<span class="ppGun"><img alt="" src="${a ? a.url : ''}"><em>${WEAP[id].name}<i>${[...(mods || []).map(m => (MODS[m] || {}).name || m), ...pvpAtts(id, gt)].join(' · ')}</i></em></span>`; }).join('') +
      `</span><span class="ppPerks">${C.perks.map(k => `<i>${pvpPerkOf(k).name}</i>`).join('')}</span><span class="ppKit"><span class="ppMelee"><img alt="" src="${meleeArt(C.melee, []).url}">${WEAP[C.melee] ? WEAP[C.melee].name : C.melee}</span></span></button>`).join('') + '</div>';
}
function pvpChoose(id) {
  if (!PVP_CLASSES.some(c => c.id === id) || pvpKitOn()) return;
  PVP.cls = id; try { localStorage.setItem('fhh-class', id); } catch (e) {}
  hudEls.pick.querySelectorAll('.ppCard').forEach(c => c.classList.toggle('on', c.dataset.cls === id));
  SFX.click();
  if (PVP.ph === 'pick') pvpLoadout();   // (in your hands at once, while everyone's still picking)
  // picked mid-match (pvpChangeClass): yours now if you've only just come in and haven't fired, else next time you do
  if (PVP.swap) {
    PVP.swap = false; pvpPickOpen(false);
    const C = pvpMine(id);   // (by your name for it: ui/arena-loadouts.js)
    if (!P.dead && (PVP.prot > 0 || PVP.ph !== 'live')) { pvpLoadout(); pvpToast('Class', C.name, 'info'); }
    else if (!P.dead) pvpToast('Next life', C.name, 'info');
  }
}
// the class picker over the match (its key, or the pause screen): picked for your next life, or straight away if you've
// just spawned; the same key again puts it away
// Space, a second or more after you went down: the death camera skipped. In the respawn games you're straight back
// in (once the class picker's shut, if you opened it); in Showdown straight on to watching a teammate (ui/screens.js)
const PVP_SKIP = 1;
function pvpBackIn() { PVP.hold = false; PVP.swap = false; pvpPickOpen(false); pvpSpawnMe(false); PVP.prot = PVP_T.prot; PVP.killer = ''; hudEls.card.classList.remove('on'); }
export function pvpSkipDeath() {
  if (!PVP.on || !P.dead || performance.now() - (PVP.killAt || 0) < PVP_SKIP * 1000) return;
  if (PVP.mode !== 'rounds' && PVP.ph === 'live') { if (PVP.hold || PVP.respawn <= 0.001) pvpBackIn(); else PVP.respawn = Math.min(PVP.respawn, 0.001); }   // (held for a loadout change: in only now, with the picker put away)
  else deathCineSkip();
}
export function pvpChangeClass() {
  if (!PVP.on || PVP.ph === 'over' || PVP.ph === 'roundEnd' || !hudEls) return;
  if (PVP.ph === 'pick' || pvpKitOn()) return;   // (it's up already; or Showdown's loadout is everyone's, and there's nothing to pick)
  if (PVP.swap) { PVP.swap = false; pvpPickOpen(false); return; }
  PVP.swap = true; pvpPickOpen(true, true);
  if (P.dead && PVP.mode !== 'rounds' && PVP.ph === 'live') PVP.hold = true;   // (lying there: you'll go back in when you press Space, not when the count runs out)
}
// ---- the scoreboard (held with Tab) and the results: everyone, by side in the team games, with their kills, deaths,
// K/D, damage done, accuracy, headshots, longest kill and ping (a bot's says so)
function pvpTable() {
  const row = r => { const sc = PVP.sc[r.id] || [0, 0], st = PVP.st[r.id] || [0, 0, 0, 0, 0, 0], p = NET.peers.get(r.id), bot = p && p.bot, kd = sc[1] ? (sc[0] / sc[1]).toFixed(2) : sc[0].toFixed(2);
    return { r, k: sc[0], html: `<tr class="${r.id === NET.id ? 'me' : ''}"><td style="--c:${colOf(r.id)}"><i></i><span></span></td><td class="k">${sc[0]}</td><td>${sc[1]}</td><td>${kd}</td><td>${Math.round(st[0])}</td><td>${st[2] ? Math.min(100, Math.round(st[1] / st[2] * 100)) + '%' : '–'}</td><td>${st[3]}</td><td>${st[4] ? st[4] + 'm' : '–'}</td><td class="ping">${bot ? 'BOT' : r.id === NET.hostId ? 'HOST' : (st[5] || 0) + ' ms'}</td></tr>` }; };
  const head = '<tr><th></th><th>K</th><th>D</th><th>K/D</th><th>DMG</th><th>ACC</th><th>HS</th><th>LONG</th><th>PING</th></tr>';
  const all = roster().map(row).sort((x, y) => y.k - x.k), names = [];
  let body = '';
  if (PVP.mode === 'ffa') { body = all.map(x => x.html).join(''); all.forEach(x => names.push(x.r.name)); }
  else for (const sd of ['A', 'B']) {
    const rs = all.filter(x => pvSideOf(x.r.id) === sd), sc = PVP.mode === 'rounds' ? PVP.wins[sd === 'B' ? 1 : 0] : PVP.ts[sd === 'B' ? 1 : 0];
    body += `<tr class="side" style="--c:${PVP_SIDE[sd].col}"><td colspan="9"><b>${PVP_SIDE[sd].name}</b><em>${sc}</em></td></tr>` + rs.map(x => x.html).join(''); rs.forEach(x => names.push(x.r.name));
  }
  return { html: `<table>${head}${body}</table>`, names };
}
const fillNames = (el, names) => el.querySelectorAll('td span').forEach((s, k) => { s.textContent = names[k] || ''; });
function pvpBoard(on) {
  if (!hudEls || !PVP.on) return;
  const el = hudEls.board; el.classList.toggle('on', on); if (!on) return;
  const t = pvpTable(); el.innerHTML = `<div class="pbBox"><div class="pbHead"><b>${PVP_MODES[PVP.mode]}</b><em>Yard 4</em><span>${PVP.ph === 'live' ? fmtT(Math.max(0, PVP.t)) : ''}</span></div>${t.html}</div>`; fillNames(el, t.names);
}
// the results: who won and by how much, the match's best player, the whole table, and (the host's) a rematch, the same
// mode and sides again straight away, or back to the lobby; otherwise back to the lobby when the clock runs out
// the match's MVP: kills count most, then the damage done, headshots and accuracy, less a little for each death
// (MVP_W), so a careful player with fewer kills but far more damage can still take it
const MVP_W = { k: 100, dmg: 1, hs: 25, acc: 60, d: 35 };
const mvpScore = r => { const sc = PVP.sc[r.id] || [0, 0], st = PVP.st[r.id] || [0, 0, 0, 0]; return sc[0] * MVP_W.k + st[0] * MVP_W.dmg + (st[3] || 0) * MVP_W.hs + (st[2] ? st[1] / st[2] : 0) * MVP_W.acc - sc[1] * MVP_W.d; };
function pvpResults() {
  if (!hudEls) return;
  const list = roster().map(r => ({ ...r, k: (PVP.sc[r.id] || [0, 0])[0], d: (PVP.sc[r.id] || [0, 0])[1], st: PVP.st[r.id] || [0, 0, 0, 0, 0], m: mvpScore(r) }));
  const byK = list.slice().sort((a, b) => b.k - a.k || a.d - b.d || b.st[0] - a.st[0]);
  let win = '', me = false;
  if (PVP.mode === 'ffa') { win = byK[0] && byK[0].k > (byK[1] ? byK[1].k : -1) ? byK[0].id : ''; me = win === NET.id; }
  else { const a = PVP.mode === 'rounds' ? PVP.wins[0] : PVP.ts[0], b = PVP.mode === 'rounds' ? PVP.wins[1] : PVP.ts[1]; win = a === b ? '' : a > b ? 'A' : 'B'; me = win === PVP.side; }
  const head = !win ? 'Draw' : me ? 'Victory' : 'Defeat', mvp = list.slice().sort((a, b) => b.m - a.m)[0], t = pvpTable(), el = hudEls.res;
  const score = PVP.mode === 'ffa' ? '' : `<div class="prScore"><span style="--c:${PVP_SIDE.A.col}" data-n="${PVP_SIDE.A.name}">${PVP.mode === 'rounds' ? PVP.wins[0] : PVP.ts[0]}</span><i></i><span style="--c:${PVP_SIDE.B.col}" data-n="${PVP_SIDE.B.name}">${PVP.mode === 'rounds' ? PVP.wins[1] : PVP.ts[1]}</span></div>`;
  const pic = mvp && mvp.look ? lookThumb(mvp.look) : '', acc = mvp && mvp.st[2] ? Math.round(mvp.st[1] / mvp.st[2] * 100) + '%' : '–';
  const stat = (v, l) => `<div><dd>${v}</dd><dt>${l}</dt></div>`;
  el.innerHTML = `<div class="prBox ${!win ? 'draw' : me ? 'win' : 'lose'}"><header class="prHead"><div><small>${PVP_MODES[PVP.mode]} · Yard 4</small><b>${head}</b><em></em></div>${score}</header>` +
    (mvp ? `<section class="prMvp" style="--c:${colOf(mvp.id)}">${pic ? `<img alt="" src="${pic}">` : '<span class="prPic"></span>'}<div class="prWho"><small>MVP</small><b></b><span>${PVP.mode === 'ffa' ? '' : PVP_SIDE[pvSideOf(mvp.id)].name}</span></div><dl>${stat(mvp.k, 'Kills')}${stat(mvp.d, 'Deaths')}${stat(Math.round(mvp.st[0]), 'Damage')}${stat(mvp.st[3] || 0, 'Headshots')}${stat(acc, 'Accuracy')}</dl></section>` : '') +
    t.html + `<div class="prActs">${isHost() ? '<button type="button" class="btn" data-act="rematch">Rematch</button><button type="button" class="btn ghost" data-act="lobby">Back to the lobby</button>' : '<span class="prHost">The host can start a rematch</span>'}<span class="prWait"></span></div></div>`;
  fillNames(el, t.names); if (mvp) el.querySelector('.prMvp b').textContent = mvp.name;
  el.querySelector('.prHead em').textContent = PVP.mode === 'ffa' ? (win ? nameOf(win) + ' wins' : 'Nobody came out on top') : (win ? PVP_SIDE[win].name + ' wins' : 'Even');
  // (the MVP's row in the table marked too)
  if (mvp) { const i = t.names.indexOf(mvp.name), td = el.querySelectorAll('td span')[i]; if (td) td.insertAdjacentHTML('afterend', '<u class="prTag">MVP</u>'); }
  el.classList.add('on'); hudEls.card.classList.remove('on'); (me ? SFX.upgrade : SFX.wave)();
}
// a rematch (the host's, 'prm' to everyone): the same mode and the same sides from the top, without the lobby
function pvpRematch() {
  if (!PVP.on) return;
  setTimeScale(1);
  PVP.sc = {}; roster().forEach(r => { PVP.sc[r.id] = [0, 0]; });
  PVP.ts = [0, 0]; PVP.wins = [0, 0]; PVP.rd = 1; PVP.rw = ''; PVP.killer = ''; PVP.st = {}; PVP.my = { dmg: 0, hits: 0, shots: 0, hs: 0, long: 0 }; PVP.key = '';
  hudEls.res.classList.remove('on'); hudEls.feed.innerHTML = '';
  PVP.flip = false; if (isHost()) PVP.tod = pvpTodPick(); pvpTodRound();   // (a new light for the new match, each side at its own end)
  if (isHost()) botsBegin();
  PVP.ph = 'idle'; pvpPhase('pick', pickT(true));
}
NET_ON.prm = () => { if (PVP.on && !isHost()) pvpRematch(); };
// what did you in: a card like Counter-Strike's, a moment after you go down, till you're back: who and with what, how
// much they did to you and in how many hits, how much you did to them, and anyone else who hurt you this life
function pvpDmgCard(m) {
  if (!hudEls) return;
  const L = PVP.life, k = m.k, tk = L.taken[k] || [0, 0], gv = L.given[k] || [0, 0], p = NET.peers.get(k), w = m.w && WEAP[m.w];
  const art = kitArt(m.w, m.g), pic = p && p.look ? lookThumb(p.look) : '';
  const others = Object.entries(L.taken).filter(([id]) => id !== k).sort((a, b) => b[1][0] - a[1][0]).slice(0, 3);
  const el = hudEls.card;
  el.innerHTML = `<div class="dcTop" style="--c:${colOf(k)}">${pic ? `<img class="dcPic" alt="" src="${pic}">` : '<span class="dcPic"></span>'}<div class="dcWho"><b></b><em>killed you with their <i>${w ? w.name : 'hands'}</i>${m.hs ? ' · headshot' : ''}${m.dm ? ' · ' + m.dm + 'm' : ''}</em></div>${art ? `<img class="dcGun" alt="" src="${art.url}">` : ''}</div>` +
    `<div class="dcRow taken"><span>Damage taken: <b>${Math.round(tk[0])}</b> in <b>${tk[1]}</b> hit${tk[1] === 1 ? '' : 's'}</span><s><u style="width:${Math.min(100, tk[0])}%"></u></s></div>` +
    `<div class="dcRow given"><span>Damage given: <b>${Math.round(gv[0])}</b> in <b>${gv[1]}</b> hit${gv[1] === 1 ? '' : 's'}</span><s><u style="width:${Math.min(100, gv[0])}%"></u></s></div>` +
    (others.length ? `<div class="dcAlso">${others.map(([id, e]) => `<div class="dcAs${e[0] >= PVP_ASSIST ? ' on' : ''}" style="--c:${colOf(id)}"><i>${e[0] >= PVP_ASSIST ? 'Assist' : 'Hit you'}</i><b data-id="${id}"></b><span><em>${Math.round(e[0])}</em> dmg · ${e[1]} hit${e[1] === 1 ? '' : 's'}</span><s><u style="width:${Math.min(100, e[0])}%"></u></s></div>`).join('')}</div>` : '') +
    (PVP.mode !== 'rounds' ? `<div class="dcBack"><span>Back in <b>${Math.max(1, Math.ceil(PVP.respawn))}</b></span><span>${kbd('vault')} Skip</span><span>${kbd('use')} Change loadout</span></div>` : '');
  el.querySelector('.dcWho b').textContent = nameOf(k); el.querySelectorAll('.dcAlso b').forEach(b => { b.textContent = nameOf(b.dataset.id); });
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(cardT); cardT = setTimeout(() => el.classList.remove('on'), PVP_CARD_T);   // (up a few seconds, then it fades)
}
let cardT = 0;
const PVP_CARD_T = 3500;
