// Arena bots: players for the arena when there aren't enough people (pvp/pvp.js), sat in the lobby by the host
// (net/net.js: netBotAdd) or there from the start when the arena's played solo. The host's game runs them, and to every
// game (its own included) each is just another player: it sends its pose, its loadout and its shots under its own
// name (netAs), takes hits ('ph') and reports going down ('pk') as a player's game does, so the score, the kill feed,
// the rounds, spectating and the gore all work for them as they are.
//
// A bot knows only what it could: someone in front of it, in range and in plain sight (no wall between: los), gunfire
// it can hear (a suppressed shot only close by), a round going past it, someone sprinting near it, where a hit came
// from, and what its side's other bots call out. What it learns it remembers: where it last saw or heard each foe, and
// when; someone who's shot at it (even a miss going by) it doesn't forget for a good while, and goes looking round
// where they were rather than giving up on them. From that it picks what to do: fight (strafing side to side, holding
// behind low cover, or pushing in, sprinting and firing if its class can); get into cover when it's hurt, empty, shot
// at from somewhere it can't see, or has two in sight at once (it takes them one at a time, peeking from where only
// one can see it); heal there, keeping out of it till it has (in Showdown, where nothing comes back, it plays safe from
// then on); swing back out to fight again, flank the last place it saw someone or push straight at it, and hunt up its
// lane (a different one each round) when it knows of nobody. Its side plans together too (botSquad): in Showdown, with
// more of them up than of you, they sometimes rush you all at once; with fewer, they sit back and hold; late in the
// round the side behind pushes and the side ahead hides. And it learns, round by round: the lane it went down in it
// takes less, and going down early on the attack makes it more careful. Its aim isn't perfect: it takes a moment to
// react to someone new, settles onto them, and spreads more on the move and the longer it holds the trigger.
// It plays to kill: on the move its gun's on the angles someone could come from (a corner's edge, a doorway, the way
// to the other side), never a wall beside it; it goes for whoever's hurt or looking its way, chases someone it's hurt
// rather than letting them get away, heads for the sound of a fight, trades for a teammate who's gone down, swings wide
// off a corner when it has the edge and only jiggles it when it hasn't, reloads in cover and is straight back out,
// fires a short burst at the corner someone ducked behind as they're likely back, and turns on whoever hits it fast.
// Someone crouched behind low cover it can't see till it's close, and its shots at them go into the cover.
// Its body is posed from a survivor's own (pvp/bot-poses.js): its stride by how it's moving against where it aims, its
// arms and gun aimed, from the hip or down at a sprint, as a player's are.

import { angDiff, clamp, rand, rr, smooth } from '../core/math.js';
import { NET, NET_BOT, NET_ON, netAs, netSend } from '../net/net.js';
import { P } from '../player/player.js';
import { BLK, BLOCK, guardCost, guardFx, guardMeets, guardThrough } from '../melee/block.js';
import { SPRINT } from '../player/sprint.js';
import { ADS_MOVE, ADS_SCOPE } from '../player/movement.js';
import { CROUCH } from '../player/crouch.js';
import { WEAP } from '../weapons/gun-stats.js';
import { curId, W, W8 } from '../game/run-state.js';
import { SLOTS } from '../weapons/slots.js';
import { tracerPower } from '../effects/tracers.js';
import { ARENA, arenaSpawn } from '../world/arena.js';
import { arBoxShot } from '../world/arena-boxes.js';
import { ci, cxw, idx, inb } from '../world/grid.js';
import { N } from '../core/math.js';
import { threadJob, threadRun } from '../core/threads.js';
import { bulletBlocked, hardBlocked, moveCircle } from '../world/collision.js';
import { los } from '../lighting/lightmap.js';
import { BRAWL_IDS, GG_ONE, PVP, PVP_BLEED, pvpBurnNum, PVP_CLASSES, PVP_DMG, PVP_MELEE, PVP_R, PVP_T, PVP_TTK, pvpClassOf, pvpCovered, pvpFalloff, pvpHome, pvpFlag, pvpMeleeDmg, pvpMeleeOf, pvpPartK, pvpKilled, pvpKitOn, pvpRuleKit, pvpSideOf, pvpSwingHeard } from './pvp.js';
import { HOLD, HOLD_DEF } from '../player/hold.js';
import { fireLight, fireStep, PFIRE } from './pvp-fire.js';
import { DRAGON_MAX } from '../weapons/gun-mods.js';
import { BOT_CYC, BOT_GUN, BOT_GY, BOT_IDLE, BOT_INSPECT, BOT_LEG, BOT_UP } from './bot-poses.js';

// how good they are, by the lobby's pick (NET.botSkill): how long they take to react to someone new (s), how far off
// their aim starts on them (rad) and how fast it settles, how much their shots spread on top of the gun's own, how fast
// they turn at most (rad/s: their aim speeds up and slows down onto a target, never snapping), how far they see (m) and how wide (half the angle, rad), and how often a hit is in the head;
// and how they play: iq, how well they keep to what their gun's good at (a shotgun pressing in, a rifle keeping back); team, how
// much they work as a side (spread over the lanes, going where a teammate fell); sneak, how often they walk rather than
// run with someone about (no footsteps to hear); flank, how much keener they are to go round than straight at you;
// and its hands: gate, how near its aim has to be to them before it pulls the trigger (rad, on top of their width: a
// recruit fires before it's on, a veteran waits the moment it takes); track, how hard its aim pulls onto them and how
// quickly its turning follows (the higher, the quicker it settles, still easing in and out); wob, its hand's own drift
// (rad); tap, how quick its single shots come (times its gun's own pace); hit, how long it takes to start turning on
// someone who's just hit it (s); pre, how likely it is to fire at the corner someone's just ducked behind (BOT_PRE);
// ctrl, how much of a held trigger's kick it lets walk its aim off (BOT_ACC spray); lead, how far ahead of someone
// on the move it aims (s of their pace) and leadK, how much a moving target still throws its shots about (of BOT_LEAD);
// dodge, how often it cuts back the other way strafing in a fight (s: none, the usual); crch, how likely it is to
// bob up and down in a crouch while it fights (BOT_CRSPAM); sharp, a veteran's head for it: it goes for whoever's out
// in the open over whoever's behind cover, makes the most of someone it's just slowed with a hit, and gets out of the
// open when it's been tagged itself (BOT_TAG); top, how empty its mag has to be before it tops it off in a lull
// (of a full one: a recruit leaves it half gone, a veteran tops off after a round or two, BOT_TOPOFF); crAcc, how
// likely it crouches to steady its aim far off (BOT_CRACC)
// The Terminator's extras (the others go without, as 1 or nothing): hs, how many of its hits aimed at a head land
// there; reach, how much further than its gun's usual reach it fires (BOT_REACH); farK, mvK, gunK, how much of the
// spread a long range, its own moving and its gun's own looseness put on its shots; think, how much sooner it thinks
// and senses again; peekK, how much shorter its peeks and the gaps between them are (BOT_QPEEK, BOT_PEEK, BOT_COVER);
// qpkAll, back in after a burst from a stepped-out peek too, not only a leaned one; crK, how likely it is to bob in a
// crouch once a fight's on (BOT_CRSPAM k), bob, each bob down or up (s); leanSpam, leaning one way and the other mid
// fight (BOT_LEANSPAM); run, sprinting everywhere it goes; angles, holding the angles the other side comes through in
// Showdown (BOT_ANGLE); burn, never peeking again the angle it was shot at from the same spot (BOT_BURN)
// fair fights (all but the Terminator, which is meant to be relentless): BOT_FAIR. Each person's run of luck against
// the bots, -1 to 1 (ADAPT: up win each time a bot gets them, down lose each time they get a bot): the bots on them
// ease off as it climbs (a slower reaction, react of it more; their aim further off and their shots looser, sig;
// fewer heads, head) and sharpen up as it falls, so neither the bots nor you run away with it. And a warm-up on every
// new target: for warmT s after it reacts, its shots spread by warm more (by skill: Recruit, Regular, Veteran,
// Terminator), easing off, and it finds the head warmHead as often, so whoever's quicker to react still wins it
const BOT_FAIR = { win: 0.14, lose: 0.1, react: 0.35, sig: 0.45, head: 0.35, warm: [0.05, 0.035, 0.02, 0], warmT: 0.45, warmHead: 0.5 };
const ADAPT = new Map();
export function botsAdapt(k, v) {
  if (!k || !v || k === v) return;
  const kb = BOTS.has(k), vb = BOTS.has(v);
  if (kb && !vb) ADAPT.set(v, clamp((ADAPT.get(v) || 0) + BOT_FAIR.win, -1, 1));
  else if (!kb && vb) ADAPT.set(k, clamp((ADAPT.get(k) || 0) - BOT_FAIR.lose, -1, 1));
}
const botFair = (b, id) => botSk(b).angles ? 0 : ADAPT.get(id) || 0;
const botSkIdx = b => b && b.sk !== undefined ? b.sk : NET.botSkill ?? 1;
const BOT_SKILL = [
  { react: [0.34, 0.55], err: 0.24, settle: 3, sig: 0.06, turn: 3.6, view: 32, fov: 1.1, head: 0.09, iq: 0.35, team: 0.25, sneak: 0, flank: 0, gate: 0.12, track: [3.8, 4.6], wob: 0.016, tap: 1.1, hit: [0.2, 0.32], pre: 0.15, ctrl: 1.2, lead: 0, leadK: 1, dodge: null, crch: 0, sharp: 0, top: 0.5, crAcc: 0.1 },
  { react: [0.22, 0.36], err: 0.19, settle: 4, sig: 0.045, turn: 4.6, view: 38, fov: 1.25, head: 0.13, iq: 0.7, team: 0.7, sneak: 0.35, flank: 0.12, gate: 0.075, track: [4.8, 6], wob: 0.011, tap: 0.9, hit: [0.13, 0.22], pre: 0.5, ctrl: 0.9, lead: 0, leadK: 1, dodge: null, crch: 0, sharp: 0, top: 0.75, crAcc: 0.3 },
  { react: [0.1, 0.17], err: 0.09, settle: 7.5, sig: 0.017, turn: 6.2, view: 50, fov: 1.5, head: 0.2, iq: 1, team: 1, sneak: 0.5, flank: 0.25, gate: 0.032, track: [7.5, 9], wob: 0.004, tap: 0.7, hit: [0.06, 0.11], pre: 0.9, ctrl: 0.4, lead: 0.11, leadK: 0.35, dodge: [0.22, 0.5], crch: 0.45, sharp: 1, top: 0.95, crAcc: 0.85 },
  { react: [0.05, 0.09], err: 0.025, settle: 16, sig: 0.003, turn: 9.5, view: 75, fov: 1.75, head: 0.45, iq: 1, team: 1, sneak: 0, flank: 0.3, gate: 0.012, track: [13, 15], wob: 0.0015, tap: 0.55, hit: [0.025, 0.05], pre: 1, ctrl: 0.12, lead: 0.07, leadK: 0.05, dodge: [0.12, 0.3], crch: 1, sharp: 1, top: 0.98, crAcc: 1,
    hs: 0.96, reach: 1.7, farK: 0.08, mvK: 0.2, gunK: 0.2, think: 0.55, peekK: 0.55, qpkAll: 1, crK: 0.85, bob: [0.09, 0.18], leanSpam: 1, run: 1, angles: 1, burn: 1 }
];
export const BOT_SKILLS = ['Recruit', 'Regular', 'Veteran', 'Terminator', 'Random'];   // (Random: each bot its own of the first three, drawn as it sits down: net/net.js)
export const BOT_RANDOM = 4;   // (the lobby's pick that's Random)
const botSk = b => BOT_SKILL[b && b.sk !== undefined ? b.sk : NET.botSkill ?? 1] || BOT_SKILL[1];   // (each bot's own, or the lobby's)
// how each class fights: the range it likes (m), how keen it is to push in (0 to 1), which gun it wants out at a range,
// (none fires on the run: nobody can in the arena, as you can't)
const BOT_STYLE = {
  rifle: { range: [6, 22], push: 0.45, gun: () => 'auto' },
  mark: { range: [12, 34], push: 0.12, gun: d => d > 7 ? 'long' : 'side' },
  rush: { range: [0, 8], push: 0.9, gun: d => d < 6 ? 'long' : 'auto' },
  breach: { range: [0, 9], push: 0.72, gun: d => d < 9 ? 'long' : 'auto' },
  gunner: { range: [7, 24], push: 0.3, gun: () => 'auto' },
  battle: { range: [8, 28], push: 0.3, gun: d => d > 5 ? 'long' : 'side' },
  scav: { range: [0, 8], push: 0.85, gun: d => d < 8 ? 'long' : 'side' }, hunter: { range: [3, 16], push: 0.5, gun: d => d < 16 ? 'long' : 'side' },
  raider: { range: [0, 14], push: 0.75, gun: () => 'auto' }, warden: { range: [10, 30], push: 0.25, gun: d => d > 5 ? 'long' : 'side' },
  scout: { range: [4, 16], push: 0.6, gun: d => d < 18 ? 'auto' : 'side' },
  enforce: { range: [0, 10], push: 0.8, gun: d => d < 11 ? 'long' : 'side' }
};
// how far each gun's worth firing (m), how fast they move (m/s: walking, aimed, and a sprint's multiple, the class's
// own on top), how long they remember someone (s: someone who's shot at them, far longer), and how fast bleeding hurts
const BOT_REACH = { pump: 13, dbl: 8, auto12: 12, pistol: 26, revolver: 34, deagle: 34, smg: 20, sub: 24, ar: 40, lmg: 38, scar: 44, hunting: 60 };
const BOT_MOVE = { base: 3, sprint: 1.75 };
// its pace by the gun in its hands, as yours is (game/run-state.js carryMul): a blade lighter than nothing, sidearms
// nothing, a primary by its calibre, its magazine and what's bolted on; and down the sights, the share each gun keeps
// (player/movement.js ADS_MOVE), a magnified scope less again
function botCarry(b, id) {
  const D = WEAP[id]; if (!D) return 1;
  if (D.melee) return PVP_MELEE[id] ? PVP_MELEE[id].carry : D.two ? 1.03 : 1.07;   // (the arena's own pace for each: pvp/pvp.js PVP_MELEE)
  if (D.slot !== 'long' && D.slot !== 'auto') return 1;
  const gt = (b.gt && b.gt[id]) || {}, att = ['supp', 'choke', 'sight', 'laser', 'light'].reduce((n, k) => n + (gt[k] ? 1 : 0), 0);
  const cal = D.ammo === 'rifle' ? 0.05 : D.ammo === 'shells' ? 0.04 : 0.025, mag = Math.min(0.07, (D.mag || 1) / 30 * 0.03);
  return clamp(1 - cal - mag - att * 0.008, 0.7, 1);
}
const botAds = (b, id) => (ADS_MOVE[id] ?? 0.58) * ((((b.gt && b.gt[id]) || {}).sight || 0) >= 3 ? ADS_SCOPE : 1);
// changing class: after this many more deaths than kills with one, and how far off a killer counts as far or near (m)
const BOT_SWAP = { deaths: 2, far: 16, near: 7 };
const BOT_MEM = { seen: 14, threat: 40 }, BOT_BLEED = { dps: 1.7, floor: 15 }, BOT_REGEN = { wait: 3.75, full: 8.5 };   // (health back on its own as a player's: pvp/pvp.js REGEN)
// a shot at someone on the move spreads more, by how fast they're going (rad per m/s), to at most max
const BOT_LEAD = { k: 0.014, max: 0.05 };
// how sure of itself it is: how readily it pushes in on someone it's fighting (a share of its class's keenness), how
// much keener than its class to go at someone it knows of, and much keener still while that's fresh (fresh s)
const BOT_CONF = { pushFight: 0.85, base: 0.3, fresh: 4, freshPush: 0.45 };
// how often it locks onto the one it's fighting, ignoring whoever else peeks it or hits it, till that fight's done
const BOT_TUNNEL = 0.5;
// how its shots spread on top of its own skill (rad): its moving (per m/s, and more at a sprint); every metre past near;
// its gun's kick (each one's, and how far a held trigger walks off with it, up to sprayMax, and how fast that comes
// back off the trigger, off s after its last shot, recover per s); its first shots after a breath (first of them,
// rested s apart) steadier, by firstK
const BOT_ACC = { move: 0.009, sprint: 0.05, near: 12, far: 0.0006, kick: 0.004, spray0: 0.003, sprayKick: 0.0035, sprayMax: 0.08, off: 0.13, recover: 0.17, first: 2, rested: 0.3, firstK: 0.6 };
// its trigger held with an automatic (rounds: close in, mid range, far, and past far a few taps), and the breath between
// bursts: rest s, and longer by reset s for each radian its spray had walked off, so the next burst starts on them again.
// The auto shotgun the same by its own ranges (sg: shells held close in, mid range, and past sgMidD one at a time)
const BOT_BURST = { close: [12, 22], mid: [5, 9], far: [3, 5], tap: [1, 3], closeD: 9, midD: 18, tapD: 28, rest: [0.12, 0.24], reset: 3, sgClose: [5, 8], sgMid: [2, 4], sgCloseD: 7, sgMidD: 13 };
// which guns keep firing with the trigger held (an automatic, the auto shotgun with it)
const botAuto = (id, D) => (D.rate < 0.12 && !D.pellets) || id === 'auto12';
// and its sight: a magnified one steadies it at range (the more, the higher it zooms) and makes it worse close in,
// where it can hardly find you in the glass; a red dot or a holo helps a little at any range (sight: its step, 3 up a
// scope; d: how far)
function botSight(sight, d) {
  if (sight < 3) return sight ? 0.95 : 1;
  const z = sight - 2, far = clamp((d - 8) / 12, 0, 1);
  return (1 + 0.3 * z) * (1 - far) + (1 - 0.1 * z) * far;
}
// firing from the hip close in (m: anyone nearer, a shotgun's nearer still), a little looser
const BOT_HIP = { near: 6, shells: 9, spread: 0.02 };
// where on someone it aims, each new target and each burst: their head (likelier the better it is), their legs now and
// then, else their middle; and how high each is (m), its eyes' own height, for how far it looks up or down
const BOT_PART_Y = { head: 1.6, torso: 1.15, legs: 0.55 }, BOT_EYE = 1.56;
function botAimPart(b) { const T = b.vis, r = rand(), h = botSk(b).head * 2.5 * (T ? 1 - BOT_FAIR.head * botFair(b, T.id) : 1) * (!botSk(b).angles && botNow() - (b.acqT ?? -9) < BOT_FAIR.warmT ? BOT_FAIR.warmHead : 1); b.aimPart = r < h ? 'head' : r < h + 0.15 ? 'legs' : 'torso'; }
const BOT_NAMES = ['Hollis', 'Ruth', 'Marek', 'Juno', 'Dacey', 'Ozzie', 'Teague', 'Wren', 'Abel', 'Noor', 'Sully', 'Kit'];
export const botName = used => { const free = BOT_NAMES.filter(n => !used.has(n)); return (free.length ? free : BOT_NAMES)[Math.floor(rand() * (free.length || BOT_NAMES.length))]; };

export const BOTS = new Map();
let botClock = 0, squadT = 0;   // its own clock, the game's time (stopped while the game is)
const botNow = () => botClock;
const bR2 = v => Math.round(v * 100) / 100, bR3 = v => Math.round(v * 1000) / 1000;
const botGauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
// the bots' own classes, alongside the stock ones (PVP_CLASSES): kits no player is handed, and the only bots that load
// anything but buckshot (a Scavenger's dragon's breath, a Hunter's slugs). Never a player's own loadouts: those are
// theirs alone (ui/arena-loadouts.js)
export const BOT_CLASSES = [
  { id: 'scav', name: 'Scavenger', role: 'Close in with a shotgun full of fire', guns: [['pump', { laser: 1, light: 1 }, null, null, { rd: 'fire' }], ['pistol', { laser: 1 }]], melee: 'machete', mags: 3, perks: ['quick:1'] },
  { id: 'hunter', name: 'Hunter', role: 'Slugs at the middle distance', guns: [['dbl', { loader: 1, choke: 1 }, null, null, { rd: 'slug' }], ['revolver', { loader: 1 }]], melee: 'axe', mags: 3, perks: ['Steady aim'] },
  { id: 'raider', name: 'Raider', role: 'Fast, loud, on the flank', guns: [['sub', { sight: 1, mag: 1 }], ['pistol', {}]], melee: 'bat', mags: 3, perks: ['boots:1'] },
  { id: 'warden', name: 'Warden', role: 'Holds a lane with a rifle and a lot of patience', guns: [['scar', { sight: 2, mag: 1 }], ['pistol', { laser: 1 }]], melee: 'wrench', mags: 3, perks: ['Steady aim'] }
];
const BOT_CLASS_IDS = () => [...PVP_CLASSES.map(c => c.id), ...BOT_CLASSES.map(c => c.id)];
const botCls = b => pvpRuleKit(b.id, b.mel) || pvpClassOf(b.cls);   // (a rule's kit, PVP_RULES; Showdown's random loadout, while it's on: everyone's the same)
// how it fights: its class's way (BOT_STYLE), or with Showdown's random loadout, the way that suits its primary (KIT_STYLE)
const KIT_STYLE = {
  shot: { range: [0, 9], push: 0.75, near: 11 }, sniper: { range: [12, 34], push: 0.12, far: 7 }, battle: { range: [8, 28], push: 0.3 },
  close: { range: [0, 12], push: 0.7 }, rifle: { range: [6, 24], push: 0.4 }
};
// (with a rule's kit, PVP_RULES: by its gun as Showdown's is, or with nothing but a melee weapon, in at them: MELEE_STYLE)
const MELEE_STYLE = { range: [0, 1.5], push: 1, gun: () => 'melee' };
function botStyle(b) {
  const R = PVP.rule && botCls(b); if (R && !R.guns.length) return MELEE_STYLE;
  if (!pvpKitOn() && !R) return BOT_STYLE[b.cls];
  const p = (R || PVP.kit).guns[0][0], D = WEAP[p], ps = D.slot, k = D.ammo === 'shells' ? 'shot' : p === 'hunting' ? 'sniper' : p === 'scar' ? 'battle' : p === 'smg' || p === 'sub' ? 'close' : 'rifle', K = KIT_STYLE[k];
  return { range: K.range, push: K.push, gun: d => K.near ? (d < K.near ? ps : 'side') : K.far ? (d > K.far ? ps : 'side') : ps };
}
const botGunOf = b => b.slots[b.cur];
// how many rounds a load of its gun holds (the golden revolver one)
const botCap = (b, id) => (b.cap && b.cap[id]) || (WEAP[id] && WEAP[id].mag) || 1;

// ---- the match: each bot in the lobby gets a body and a mind
export function botsBegin() {
  BOTS.clear();
  ADAPT.clear();
  for (const p of NET.peers.values()) if (p.bot) BOTS.set(p.id, { p, id: p.id, sk: p.sk, mel: BRAWL_IDS[Math.floor(rand() * BRAWL_IDS.length)], rec: {}, st: { dmg: 0, hits: 0, shots: 0, hs: 0, long: 0 }, cls: PVP_CLASSES[Math.floor(rand() * PVP_CLASSES.length)].id, x: 0, z: 0, vx: 0, vz: 0, aim: 0, hp: 100, dead: true, seed: rand() * 9, cocky: rand(), mem: new Map(), path: [], ph: 0, poseT: 0, thinkT: 0, senseT: 0, spray: 0, err: 0, learn: { bold: 0, lane: [0, 0, 0] } });
  botSquadReset();
  for (const b of BOTS.values()) botSpawn(b, true);
  botAxisSet();
  BOT_HEAT.A = BOT_HEAT.B = null; botHeatPrior();
}
export function botsEnd() { BOTS.clear(); BOT_HOT.length = 0; }
// Gun game: a bot's place on the ladder changed (pvp/pvp.js ggApply): its new gun in its hands at once
export function botsRearm(id) { const b = BOTS.get(id); if (b && !b.dead) { botArm(b); b.burst = 0; b.cd = 0.2; } }
export const botIds = () => [...BOTS.keys()];
// a kill to a bot's name (pvp/pvp.js pvpKilled), for its record with the class it had (BOT_SWAP)
// (and to everyone else in Deathmatch, a fight just won: the one left standing, likely hurt, to come in on: BOT_THIRD)
// (and now and then, the cockier it is the likelier, it goes and crouches over the body a few times: BOT_TBAG)
export function botKilled(id, dm) {
  const b = BOTS.get(id); if (!b) return;
  const r = b.rec[PVP.rule === 'brawl' ? 'm:' + b.mel : b.cls] || (b.rec[PVP.rule === 'brawl' ? 'm:' + b.mel : b.cls] = { k: 0, d: 0 }); r.k++; b.st.long = Math.max(b.st.long, dm || 0);
  if (b.dead) return;
  const t = botNow(); botHot(b.x, b.z, t, b.id, true);
  const v = b.vis || b.mem.get(b.tgt), T_ = BOT_TBAG;
  if (v) b.mem.delete(v.id);   // (that one's done with)
  if (v && rand() < T_.odds * (T_.cocky0 + b.cocky) * (0.6 + botStyle(b).push) && Math.hypot(v.x - b.x, v.z - b.z) < T_.far) b.tbag = { x: v.x, z: v.z, until: t + T_.len, n: Math.round(rr(...T_.bobs)), nextT: 0, at: t + rr(...T_.wait) };
}
// each bot's stats for the scoreboard (pvp/pvp.js), as a player's are sent: damage, hits, shots, headshots, longest kill, and -1 for ping
export const botStats = () => [...BOTS.values()].map(b => [b.id, [Math.round(b.st.dmg), b.st.hits, b.st.shots, b.st.hs, b.st.long, -1]]);
// a phase starting (the host's call: pvp/pvp.js): everyone back at their spawn for a new round
// (Showdown: those still up at a round's end grow a little bolder; botDie makes those who went down early more careful)
export function botsPhase(ph, was) {
  if (ph === 'roundEnd') for (const b of BOTS.values()) if (!b.dead) { b.learn.bold = Math.min(BOT_LEARN.most, b.learn.bold + BOT_LEARN.win); b.learn.lane[b.lane ?? 1] = Math.max(0, (b.learn.lane[b.lane ?? 1] || 0) - 0.5); }   // (and the lane it lived through it's a little keener on)
  if (ph === 'pick' && (was === 'roundEnd' || was === 'idle')) { botSquadReset(); BOT_HOT.length = 0; for (const b of BOTS.values()) { if (was === 'idle' && rand() < 0.45) { const ids = BOT_CLASS_IDS(); b.cls = ids[Math.floor(rand() * ids.length)]; } botSpawn(b, true); } botAxisSet(); if (PVP.mode !== 'ffa') ['A', 'B'].forEach(sd => botLanesTeam([...BOTS.values()].filter(b => b.side === sd))); botHeatPrior(); }
  // (counting in, some look their gun over, BOT_INSP; the round on, each lets it go to get moving)
  if (ph === 'count') for (const b of BOTS.values()) if (!b.dead) { botArm(b); if (rand() < BOT_INSP.count) botInspGo(b, rr(...BOT_INSP.wait)); }
  if (ph === 'live') for (const b of BOTS.values()) { b.prot = PVP_T.prot; botInspCut(b); }
}

// ---- its class: the guns (and the loadout everyone builds its weapons from: net/arsenal.js), full mags and a few more
// each weapon of a loadout as a bot carries it (and as everyone's game builds it on them: net/arsenal.js)
const botGl = (gt, mods, lv, gold, rd) => ({ mods: mods ? mods.slice() : [], lv: lv ? Object.assign({}, lv) : {}, gt: Object.assign({}, gt), pin: null, att: {}, rnd: null, ak: false, rd: rd || null, gold: gold ? 1 : 0 });   // (gold: Gun game's golden two, effects/gold.js; rd: a shotgun's shells)
export const botKitGl = C => [[C.melee, botGl({}, null, null, C.meleeGold)], ...C.guns.map(([id, gt, mods, lv, ex]) => [id, botGl(gt, mods, lv, ex && ex.gold)])];
function botArm(b) {
  const C = botCls(b), slots = { melee: C.melee, side: null, long: null, auto: null }, guns = {};
  guns[C.melee] = botGl({}, null, null, C.meleeGold);
  b.mag = {}; b.res = {}; b.gt = {}; b.cap = {}; b.gold = {}; b.rd = {}; if (C.meleeGold) b.gold[C.melee] = 1;
  for (const [id, gt, mods, lv, ex] of C.guns) {
    const rd = WEAP[id].ammo === 'shells' && ex && ex.rd && ex.rd !== 'std' ? ex.rd : null; if (rd) b.rd[id] = rd;   // (only what its kit says: a Scavenger's dragon's breath, a Hunter's slugs, BOT_CLASSES)
    const gold = !!(ex && ex.gold); slots[WEAP[id].slot] = id; guns[id] = botGl(gt, mods, lv, gold, rd); b.gt[id] = gt; if (gold) b.gold[id] = 1;
    const n = gold ? 1 : WEAP[id].mag || 1; b.cap[id] = n; b.mag[id] = n; b.res[id] = Math.max(n * C.mags, WEAP[id].ammo === 'shells' ? 14 : 0);   // (the golden revolver: one round a load)
  }
  b.slots = slots; b.cur = C.guns.length ? WEAP[C.guns[0][0]].slot : 'melee'; b.knife = 0; b.mswing = null; b.relT = 0; b.reloading = false; b.swapT = 0; b.cd = 0; b.burst = 0;
  b.quick = C.perks.includes('quick:2') ? 0.6 : C.perks.includes('quick:1') ? 0.8 : 1;
  b.lo = { slots, guns, stow: {}, hol: 0x1d1d1f, gear: null };
  const key = JSON.stringify(b.lo); let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  if (h === b.lk && b.p && b.p.lo) return;   // (the same guns as it has: not drawn again for nothing)
  b.lk = h;
  const m = { lo: b.lo, lk: b.lk }; NET_ON.lo(Object.assign({ t: 'lo', f: b.id }, m)); netAs(b.id, 'lo', m);
}
NET_BOT.loq = m => { const b = BOTS.get(m.to); if (b && b.lo) netAs(b.id, 'lo', { lo: b.lo, lk: b.lk }, m.f); };
// at its spawn, whole again: its side's spot (in Showdown each in its own place) or, in Deathmatch, the one furthest
// from everyone
function botSpawn(b, fresh) {
  botFireOut(b);
  b.side = pvpSideOf(b.id) || 'A';
  const foes = botFoes(b).map(f => [f.x, f.z]);
  const list = [{ id: NET.id, idx: NET.idx }, ...[...NET.peers.values()].map(p => ({ id: p.id, idx: p.idx }))].filter(r => pvpSideOf(r.id) === b.side).sort((a, c) => a.idx - c.idx);
  const [x, z, f] = arenaSpawn(PVP.mode === 'ffa' ? 'F' : pvpHome(b.side), foes, PVP.mode === 'rounds' || fresh ? list.findIndex(r => r.id === b.id) : undefined, PVP.mode === 'rounds' ? PVP.rd : undefined);
  Object.assign(b, { x, z, vx: 0, vz: 0, aim: f, av: 0, look: f, hp: 100, dead: false, bleed: 0, calm: 0, regen0: null, stun: 0, prot: PVP_T.prot, state: 'roam', path: [], tgt: '', vis: null, last: null, mv: '', react: 0, err: 0, spray: 0, hurtT: -9, seenT: -9, stopT: 0, glanceT: 0, stuck: 0, lookW: f, alarm: undefined, alarmT: 0, pitch: 0, leanT: 0, lean: 0 });
  b.mem.clear(); b.healing = false; b.lowDone = false; b.noFire = false; b.shotAtT = -9; b.flinchAt = undefined;
  b.pre = null; b.trade = null; b.brawl = null; b.dealt = new Map(); b.taken = new Map(); b.cr = 0; b.crW = 0; b.crSpam = 0; b.burn = []; b.ang = null; b.angN = 0; b.angUsed = []; b.angRetry = 0; b.lsT = 0; b.tbag = null; b.insp = null; b.jig = 0; b.swing = 0; b.jiggle = false; b.coverAt = null; b.preT = 0;
  b.lane = botLanePick(b); b.routeSeed = Math.floor(rand() * 1e9); b.pace = b.pace || rr(0.95, 1.04); b.edgy = rand() < BOT_EDGE.odds;   // (some rounds it works the yard's edges, round the outside of everyone)
  botArm(b);
  b.p.dead = false; b.p.hp = 100;
}

// ---- who it's up against: you, the other players (where their pose says) and the other bots
function botFoes(b) {
  // (with where each is aiming, whether a laser's shining from their gun: a beam it can see gives them away, and how
  // far down in a crouch they are, 0 to 1: behind low cover, out of its sight, BOT_CROUCH)
  const out = [], add = (id, x, z, vx, vz, dead, aim, laser, cr) => { if (dead || x === undefined || id === b.id) return; if (PVP.mode !== 'ffa' && pvpSideOf(id) === b.side) return; out.push({ id, x, z, vx: vx || 0, vz: vz || 0, aim, laser, cr: cr || 0 }); };
  add(NET.id, P.x, P.z, P.vx, P.vz, P.dead, P.aim, !!(W8.gt[curId()] || {}).laser, P.cr || 0);
  for (const q of NET.peers.values()) {
    const o = BOTS.get(q.id);
    if (o) add(o.id, o.x, o.z, o.vx, o.vz, o.dead, o.aim, !!(o.gt && (o.gt[botGunOf(o)] || {}).laser), o.cr || 0);
    else { const g = q.lo && q.wid && q.lo.guns[q.wid]; add(q.id, q.x, q.z, q.vx, q.vz, q.dead, q.vw ? q.vw[0] : 0, !!(g && g.gt && g.gt.laser), q.cr || 0); }
  }
  return out;
}
// what it sees: each foe in front of it (or right by it), in range and in plain sight. Someone new takes it a moment
// to react to, and its aim starts off them. Someone sprinting close by it hears. Whoever it sees it calls out to its
// side's other bots (botCall)
function botSense(b, foes, t) {
  const S = botSk(b), E = botEye(b); let best = 1e9; b.vis = null; b.seeN = 0;
  for (const f of foes) {
    const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
    // (crouched behind low cover, BOT_CROUCH: nothing of them over it to see, unless it's right on top of them)
    const low = f.cr > BOT_CROUCH.down && d > BOT_CROUCH.see && pvpCovered(f.x, f.z, b.x, b.z, dx / (d || 1), dz / (d || 1), d);
    const seen = !low && d < S.view && (d < 2.2 || Math.abs(angDiff(Math.atan2(dx, dz), b.aim)) < S.fov) && los(E[0], E[1], f.x, f.z);   // (from its eyes: leaned out, round what it's behind)
    const m = b.mem.get(f.id);
    if (seen) {
      if (!m || !m.seen || t - m.t > 1.5) {
        // (a surprise, BOT_REACT: off to the side of where it's looking, or someone it had no idea of, round a corner
        // close: a beat longer to react and its first aim further off; someone it was waiting on, quicker; and someone
        // coming out just where it had its gun ready, pre-aimed or prefiring at that corner, quicker still)
        const off = Math.abs(angDiff(Math.atan2(dx, dz), b.aim)), expect = m && t - m.t < 4 && Math.hypot(m.x - f.x, m.z - f.z) < 5;
        const ready = off < BOT_REACT.on && (expect || (b.pre && t < b.pre.until && Math.hypot(b.pre.x - f.x, b.pre.z - f.z) < 4));
        const k = 1 + BOT_REACT.side * clamp(off / S.fov, 0, 1.5) + (expect ? -BOT_REACT.expect : BOT_REACT.surprise) + (d < 8 && !expect ? BOT_REACT.close : 0) - (ready ? BOT_REACT.ready : 0);
        const fr = botFair(b, f.id); b.acqT = t;   // (BOT_FAIR: eased off or sharpened on this one; and its warm-up from now)
        b.react = t + rr(...S.react) * Math.max(0.45, k) * (1 + BOT_FAIR.react * fr); b.err = S.err * (0.8 + 0.6 * clamp(off / S.fov, 0, 1)) * (expect ? 0.6 : 1) * (ready ? 0.7 : 1) * (1 + BOT_FAIR.sig * fr) * (rand() < 0.5 ? -1 : 1);
        botAimPart(b); if (f.id !== b.tgt) b.tunnel = rand() < BOT_TUNNEL;
        botHeatAdd(b.side, f.x, f.z, BOT_ANGLE.seen);   // (one of them come this way: BOT_HEAT)
      }
      b.mem.set(f.id, { id: f.id, x: f.x, z: f.z, t, seen: true, threat: !!(m && m.threat), aim: f.aim });
      botCall(b, f, t);
      b.seeN++;
      // (who to fight: the one it's on already, then whoever's shot at it, then whoever's nearest; locked on (b.tunnel),
      // the one it's on whatever else turns up, even taking hits from someone else for it. And the better it is, the
      // keener on someone it's hurt (to finish them) and on someone looking its way (the one who can hurt it): BOT_PICK)
      const face = f.aim !== undefined && Math.abs(angDiff(f.aim, Math.atan2(-dx, -dz))) < BOT_PICK.face;
      // (a veteran, BOT_SKILL sharp: keener still on someone it's just slowed with a hit, less on someone behind cover)
      const sharp = S.sharp ? (botTagged(b, f.id, t) ? BOT_PICK.tagged : 0) - (pvpCovered(f.x, f.z, b.x, b.z, dx / (d || 1), dz / (d || 1), d) ? BOT_PICK.covered : 0) : 0;
      const score = d - (f.id === b.tgt ? (b.tunnel ? 60 : 10) : 0) - (m && m.threat && t - m.t < 5 && !b.tunnel ? 4 : 0) - S.iq * ((botWeak(b, f.id, t) ? BOT_PICK.weak : 0) + (face ? BOT_PICK.face_ : 0)) - sharp; if (score < best) { best = score; b.vis = f; }
    } else {
      if (m) m.seen = false;
      // (footsteps, BOT_STEP: a run's heard furthest, a walk less, a crouched walk hardly at all; right by it, anyone)
      const sp = Math.hypot(f.vx, f.vz), r = (sp > 4.2 ? BOT_STEP.run : sp > BOT_STEP.slow ? BOT_STEP.walk : 0) * (1 - (1 - CROUCH.step) * clamp(f.cr || 0, 0, 1));
      if (d < Math.max(r, 2.5)) { botNote(b, f.id, f.x, f.z, 0.6 + d * 0.08, t); if (r > 0) b.step = { id: f.id, x: f.x, z: f.z, t }; }
      else if (f.laser && botBeam(b, f, S)) botNote(b, f.id, f.x, f.z, 1.5, t);   // (their laser seen: where it's coming from)
    }
  }
}
// reacting to someone seen (BOT_SKILL react, times 1 and these): side, more as far off to the side of its look as the
// edge of what it sees; surprise, someone it had no idea of; close, and that close (under 8 m: round a corner); expect,
// less for someone it knew was just there
// less, someone coming out just where its gun was ready (ready: within on rad of its aim)
const BOT_REACT = { side: 0.7, surprise: 0.35, close: 0.25, expect: 0.3, ready: 0.25, on: 0.3 };
// someone crouched (down: how far, 0 to 1) behind low cover (pvp/pvp.js pvpCovered) it can't see past see (m)
const BOT_CROUCH = { down: 0.5, see: 4 };
// picking who to fight (botSense): how many metres nearer it counts someone it's hurt (weak) and someone looking its
// way (face_: within face rad of looking straight at it); a veteran's whole, a recruit's a share (BOT_SKILL iq)
// (and a veteran's, sharp: tagged, someone it's slowed with a hit, covered, someone with low cover in front of them)
const BOT_PICK = { weak: 8, face_: 5, face: 0.35, away: 1.2, tagged: 6, covered: 5 };
// hit slows whoever's hit (as pvp/pvp.js PVP_TAG does you: base, and per hp of it, to at most most), worn off at wear a
// second; and someone it hit within fresh s it knows is slowed (a veteran presses that: botThink)
const BOT_TAG = { base: 0.6, per: 0.008, most: 0.95, wear: 0.45, fresh: 1.1, press: 15, hide: 0.3 };
// (a veteran presses someone it's slowed within press m; and tagged itself past hide, it gets into cover)
// a quick peek (botThink): leaned out round its cover (lean s) or stepped out, a burst at them for fight s, back in, and
// out again again s later from another angle: a wide swing, the other side, or somewhere else (b.rechal: round
// some other way flank of the time, times BOT_SKILL iq). It leans out rather than steps out leanK of the time (times iq)
const BOT_QPEEK = { lean: [0.35, 0.65], fight: [0.55, 1.0], again: [0.3, 0.7], leanK: 0.9, flank: 0.4 };
// a peek's or a gap's length (s), shorter for a Terminator (BOT_SKILL peekK: in and out, quick)
const botPk = (b, r) => rr(...r) * (botSk(b).peekK || 1);
// bobbing in a crouch fighting (botThink, botCrouchStep): how likely it starts each think (times BOT_SKILL crch), for
// how long (s), each bob down or up (s)
const BOT_CRSPAM = { k: 0.35, len: [1.2, 2.5], bob: [0.16, 0.3] };
// crouching to shoot straighter (botThink): with them further than far (m), or than dual with a gun in each hand
const BOT_CRACC = { far: 20, dual: 10 };
// crouching over someone it's killed (botKilled): how likely (times its cockiness, cocky0 to 1 + cocky0, and how keen
// its class is to push), from within far (m), how many bobs and each how long (s), after wait s, given up after len s;
// never with anyone else seen or heard in the last quiet s, or under minHp
const BOT_TBAG = { odds: 0.3, cocky0: 0.25, far: 25, len: 9, bobs: [3, 6], wait: [0.2, 0.6], bob: [0.13, 0.22], minHp: 35, quiet: 3 };
// looking its gun over (BOT_INSPECT, the player's own moves): how likely while counting in, after wait s; at a round's
// end, how likely every gap s it's stood about; let go part way (cut: of the way through) or when it's time to move,
// eased in at in and out at out (per s)
const BOT_INSP = { turn: 0.45, move: 0.5, count: 0.45, wait: [0.2, 1.6], end: 0.35, gap: [1.5, 4], cut: [0.45, 1.15], in: 5, out: 8 };
// footsteps heard (botSense): out to run m at a sprint, walk m walking (over slow m/s), crouched quieter as yours are
// (CROUCH.step), and how near and fresh one has to be for it to get ready for them (ready m, s)
// topping off in a lull (botThink): nobody seen nor shooting at it for calm s; a veteran steps into cover first from
// anyone it's known of within known s
const BOT_TOPOFF = { calm: 2.5, known: 10 };
const BOT_STEP = { run: 16, walk: 8, slow: 1.3, ready: 13, fresh: 1.5 };
// getting ready for someone it's heard coming (botThink): out at them first, a peek or a swing (pre-peek). (It used to
// crouch where it was and wait for them with its gun on the corner, half the time: a player heard coming round any
// corner found a bot sat waiting behind it, which was more annoying than clever, so it no longer does)
// walking with its aim off the way it's going: at most max (rad) of it, unless it's in one of hold's states or had
// someone in a fight within fresh s
const BOT_BACKPEDAL = { max: 1.75, fresh: 2, hold: ['hold', 'cover', 'peek', 'tbag', 'angle'] };
const botTagged = (b, id, t) => { const e = b.dealt && b.dealt.get(id); return !!(e && t - e.t < BOT_TAG.fresh); };
// hurt: someone it's put dmg (hp) into within mem s (or the one who's just killed a teammate, BOT_TRADE, or in
// Deathmatch someone who's been in a fight with someone else, BOT_THIRD), and how much keener it is to push them
const BOT_FINISH = { dmg: 35, mem: 4.5, push: 0.6 };
function botWeak(b, id, t) {
  const e = b.dealt && b.dealt.get(id);
  return !!(e && t - e.t < BOT_FINISH.mem && e.d >= BOT_FINISH.dmg) || !!(b.trade && b.trade.id === id && t < b.trade.until + 3) || !!(b.brawl && t < b.brawl.until && b.brawl.ids.includes(id));
}
// a laser's beam in sight: anywhere along it (to the first wall, LASER_SEE.reach at most) in front of it, in range and
// in plain sight, every LASER_SEE.step metres
const LASER_SEE = { reach: 24, step: 1.6 };
function botBeam(b, f, S) {
  const dx = Math.sin(f.aim), dz = Math.cos(f.aim);
  for (let s = LASER_SEE.step; s < LASER_SEE.reach; s += LASER_SEE.step) {
    const x = f.x + dx * s, z = f.z + dz * s; if (bulletBlocked(x, z)) return false;
    const ex = x - b.x, ez = z - b.z, d = Math.hypot(ex, ez);
    if (d < S.view && Math.abs(angDiff(Math.atan2(ex, ez), b.aim)) < S.fov && los(b.x, b.z, x, z)) return true;
  }
  return false;
}
// something heard (or a hit felt, or a round gone past it) from someone: roughly where they are now, if it hasn't a
// better idea. Being shot at (hurt) it doesn't forget: that's a threat, kept BOT_MEM.threat seconds, not BOT_MEM.seen
function botNote(b, id, x, z, noise, t, hurt) {
  const m = b.mem.get(id); if (m && m.seen && t - m.t < 0.3) { if (hurt) m.threat = true; return; }
  b.mem.set(id, { id, x: x + rr(-noise, noise), z: z + rr(-noise, noise), t, seen: false, threat: !!hurt || !!(m && m.threat && t - m.t < BOT_MEM.threat) });
  // (turning to look: a hit at once; anything else heard, only once it's looked to the last thing for a moment, so a
  // fight going on nearby doesn't have it whipping round to every shot)
  if (hurt || (!b.vis && t > (b.alarmT || 0))) { b.alarm = Math.atan2(x - b.x, z - b.z); b.alarmT = t + BOT_LOOK.alarm; }
  // (hit: after the moment it takes to know where from, BOT_SKILL hit, it whips round on them, BOT_FLICK)
  if (hurt) { if (t - (b.shotAtT || -9) > BOT_FLICK.len) b.flinchAt = t + rr(...botSk(b).hit); b.shotAtT = t; }
  // (heard right by the corner it's got its gun on, someone it's waiting on: it fires now, BOT_PRE)
  else if (b.pre && b.pre.id === id && Math.hypot(x - b.pre.x, z - b.pre.z) < BOT_PRE.near) b.pre.go = true;
}
// a foe seen, told to the side's other bots (the team games): where, and when, as a call-out (not as good as their own
// eyes: they don't react as if they'd seen them, but they know where to look and go)
function botCall(b, f, t) {
  if (PVP.mode === 'ffa' || t - (b.callT || 0) < 0.4) return; b.callT = t;
  for (const o of BOTS.values()) {
    if (o === b || o.dead || o.side !== b.side) continue;
    const m = o.mem.get(f.id); if (m && m.seen && t - m.t < 0.5) continue;
    o.mem.set(f.id, { id: f.id, x: f.x, z: f.z, t, seen: false, call: true, threat: !!(m && m.threat) });
  }
}
// gunfire, from anyone (firing.js through net/avatars.js shotOut, others' through NET_ON.shot, the bots' own): every
// bot within earshot that it's a foe of notes where it came from, the further off the rougher; a round that went by it
// close (ends: where each one stopped) it takes as being shot at, and knows just where from
export function botsHear(id, x, z, quiet, ends) {
  if (!BOTS.size || !PVP.on || PVP.ph !== 'live') return;
  const t = botNow();
  for (const b of BOTS.values()) {
    if (b.dead || id === b.id || (PVP.mode !== 'ffa' && pvpSideOf(id) === b.side)) continue;
    const d = Math.hypot(x - b.x, z - b.z);
    if (ends && ends.some(e => botPast(b, x, z, e[0], e[2]) < BOT_WHIZ)) botNote(b, id, x, z, 0.6, t, true);
    else if (d < (quiet ? 9 : PVP.mode === 'rounds' ? 34 : BOT_DM.hear)) botNote(b, id, x, z, d * 0.12, t);
  }
  // (and where there's shooting, and whose, for whoever's got nothing to do to head for: BOT_HOT; and in Deathmatch,
  // two going at it someone else can come in on, BOT_THIRD)
  botHot(x, z, t, id);
}
function botHot(x, z, t, id, kill) { BOT_HOT.push({ x, z, t, id, kill: !!kill }); if (BOT_HOT.length > 24) BOT_HOT.shift(); }
const BOT_WHIZ = 2.2;   // (m: a round passing nearer than this counts as at it)
// Deathmatch and Team Deathmatch, where health comes back and there's always a fight on somewhere: it backs off to heal
// only below low (hp), and only till healed; hears gunfire out to hear (m); and with nobody in mind it heads for where
// shots were fired within the last fresh s (BOT_HOT), at a run, rather than wandering
const BOT_DM = { low: 22, healed: 55, hear: 45, fresh: 8, sprint: 0.9 }, BOT_HOT = [];
// third-partying (Deathmatch): two others heard shooting within near (m) of each other in the last fresh s (or one just
// having killed the other) is a fight to come in on, from off to the side of the line between them where neither's
// looking (side: the least of how far round, rad), at a run till it's within walk (m); and whoever's in it it takes as
// hurt (BOT_FINISH) for keep s. Not below minHp, and not again for rest s after it's got there
const BOT_THIRD = { near: 30, fresh: 6, reach: 55, side: 0.9, walk: 14, keep: 6, minHp: 45, rest: 3 };
// trading (the team games): a teammate down within reach (m) of it, and it goes for the one who did it, there and then,
// for len s (as likely as it's a team player, more so the better), at a run till it's within walk (m), not under minHp
const BOT_TRADE = { reach: 32, len: 6, walk: 10, minHp: 35 };
const botPast = (b, x0, z0, x1, z1) => { const vx = x1 - x0, vz = z1 - z0, L2 = vx * vx + vz * vz || 1, u = clamp(((b.x - x0) * vx + (b.z - z0) * vz) / L2, 0, 1); return Math.hypot(x0 + vx * u - b.x, z0 + vz * u - b.z); };
// what it knows of anyone (seen, heard, told, or who shot at it) that's recent enough to act on: the freshest, someone
// who's shot at it counting for a few seconds more; and all of them
const botAge = m => m.threat ? BOT_MEM.threat : BOT_MEM.seen;
function botKnown(b, t) { let best = null, bs = -1e9; for (const m of b.mem.values()) { if (t - m.t > botAge(m)) continue; const s = m.t + (m.threat ? 6 : 0); if (s > bs) { bs = s; best = m; } } return best; }
const botAll = (b, t, age) => [...b.mem.values()].filter(m => t - m.t < Math.min(age, botAge(m)));

// ---- the map as it walks it: open cells inside the arena's walls; a path on them (A*, cutting corners where the
// straight line's clear), and the places it picks: cover from someone, a spot to peek out at them from, a way round to
// their side, somewhere to go looking
const botWalk = (i, j) => i >= ARENA.x0 && i <= ARENA.x1 && j >= ARENA.z0 && j <= ARENA.z1 && inb(i, j) && !hardBlocked(i, j);
const botLine = (x0, z0, x1, z1) => { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.25); for (let s = 1; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n; for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) if (!botWalk(ci(x + ox), ci(z + oz))) return false; } return true; };
// each bot's own way round this round (BOT_ROUTE): every cell a little dearer or cheaper to it, drawn again each round,
// so two bots heading to the same spot, or one bot round to round, don't trace the same line through the yard
const BOT_ROUTE = 0.9;
// how often a bot works the yard's edges a round (odds), how near the outer wall counts (cells), and how much it likes
// somewhere there (botRoam)
const BOT_EDGE = { odds: 0.55, cells: 3, k: 14 };
const botRouteNoise = (b, k) => { let h = (k * 374761393 + (b.routeSeed | 0) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * BOT_ROUTE; };
function botPath(b, gx, gz, avoid) {
  let ti = ci(gx), tj = ci(gz);
  if (!botWalk(ti, tj)) { let bd = 1e9, bi = -1, bj = -1; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (botWalk(ti + di, tj + dj) && di * di + dj * dj < bd) { bd = di * di + dj * dj; bi = ti + di; bj = tj + dj; } if (bi < 0) return []; ti = bi; tj = bj; }
  const si = ci(b.x), sj = ci(b.z), start = idx(si, sj), goal = idx(ti, tj); if (start === goal) return [[gx, gz]];
  const g = new Map([[start, 0]]), from = new Map(), heap = [[0, start]], shut = new Set();
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const side = (b.lane ?? 1) !== 1 && !avoid && Math.hypot(gx - b.x, gz - b.z) > BOT_SIDES.far;   // (keeping to its side lane, BOT_SIDES)
  const N_ = 44, h = k => { const dx = Math.abs(k % N_ - ti), dz = Math.abs(((k / N_) | 0) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let n = 0;
  while (heap.length && n++ < 4000) {
    const [, k] = pop(); if (k === goal) break; if (shut.has(k)) continue; shut.add(k);
    const i = k % N_, j = (k / N_) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!botWalk(ni, nj)) continue;
      if (di && dj && (!botWalk(i + di, j) || !botWalk(i, j + dj))) continue;
      const nk = idx(ni, nj), c = g.get(k) + (di && dj ? 1.414 : 1) + (avoid && avoid.has(nk) ? 4 : 0) + botRouteNoise(b, nk) + (side && botLaneOf(cxw(ni), cxw(nj)) === 1 ? BOT_SIDES.mid : 0);
      if (c < (g.get(nk) ?? 1e9)) { g.set(nk, c); from.set(nk, k); push(c + h(nk), nk); }
    }
  }
  if (!from.has(goal)) return [];
  const cells = []; for (let k = goal; k !== start; k = from.get(k)) cells.push([cxw(k % N_), cxw((k / N_) | 0)]);
  cells.reverse(); cells[cells.length - 1] = [gx, gz].map((v, q) => botWalk(ci(gx), ci(gz)) ? v : cells[cells.length - 1][q]);
  // the corners cut: from each point, on to the furthest one it can botWalk to in a straight line
  const out = []; let ax = b.x, az = b.z, k = 0;
  while (k < cells.length) { let far = k; for (let m = cells.length - 1; m > k; m--) if (botLine(ax, az, cells[m][0], cells[m][1])) { far = m; break; } out.push(cells[far]); [ax, az] = cells[far]; k = far + 1; }
  // (each point on the way a little off the middle of its cell, where there's room, so it never walks the grid's lines)
  for (let q = 0; q < out.length - 1; q++) { const x = out[q][0] + rr(-0.3, 0.3), z = out[q][1] + rr(-0.3, 0.3); if (botWalk(ci(x), ci(z)) && botLine(q ? out[q - 1][0] : b.x, q ? out[q - 1][1] : b.z, x, z)) out[q] = [x, z]; }
  return out;
}
const botCells = (x, z, r) => { const out = []; for (let j = ci(z - r); j <= ci(z + r); j++) for (let i = ci(x - r); i <= ci(x + r); i++) if (botWalk(i, j)) { const cx = cxw(i), cz = cxw(j), d = Math.hypot(cx - x, cz - z); if (d <= r) out.push([cx, cz, d]); } return out; };
const botSeenBy = (x, z, from) => from.some(o => los(o.x, o.z, x, z));
// cover from everyone it knows of (from: [{x, z}]): a spot near it none of them can see, with somewhere just beside it
// it could peek out from; nearer is better, and so is about the range its class likes. Falling back to heal (far) it
// looks further, and the further from them the better
function botCover(b, from, far) {
  const want = (botStyle(b).range[0] + botStyle(b).range[1]) / 2, F = from[0];
  const cs = botCells(b.x, b.z, far ? 14 : 10).filter(c => !botSeenBy(c[0], c[1], from) && Math.hypot(c[0] - F.x, c[1] - F.z) > 3.5)
    .map(c => [c, c[2] + (far ? -Math.min(...from.map(o => Math.hypot(c[0] - o.x, c[1] - o.z))) * 0.35 : Math.abs(Math.hypot(c[0] - F.x, c[1] - F.z) - want) * 0.2) + rr(0, 0.6)]).sort((a, c) => a[1] - c[1]);
  for (const [c] of cs.slice(0, 5)) { const path = botPath(b, c[0], c[1]); if (path.length && path.length < (far ? 12 : 8)) return { x: c[0], z: c[1], path }; }
  return null;
}
// a spot just beside it to peek at L from: one that sees L and none of the others it knows of (taking them one at a
// time, never two at once), if there's one
// (wide: out across them instead, BOT_PEEK, to the spot furthest off the line to them, up to lat, not much nearer them)
function botPeek(b, L, others, wide) {
  const P_ = BOT_PEEK, dL = Math.hypot(L.x - b.x, L.z - b.z) || 1, ux = (L.x - b.x) / dL, uz = (L.z - b.z) / dL;
  const lp = b.lastPk && botNow() - b.lastPk.t < 6 ? b.lastPk : null;   // (not from just where it last peeked them from)
  const cs = botCells(b.x, b.z, wide ? P_.far : P_.near).filter(c => los(c[0], c[1], L.x, L.z) && !botSeenBy(c[0], c[1], others) && (!lp || Math.hypot(c[0] - lp.x, c[1] - lp.z) > 1.5) && !botBurnt(b, c[0], c[1], L.x, L.z));
  if (wide) { const sc = c => { const ex = c[0] - b.x, ez = c[1] - b.z; return Math.min(Math.abs(ex * uz - ez * ux), P_.lat) - Math.max(0, ex * ux + ez * uz) * 0.4; }; cs.sort((a, c) => sc(c) - sc(a)); }
  else cs.sort((a, c) => a[2] - c[2]);
  return cs.length ? botPath(b, cs[0][0], cs[0][1]) : null;
}
// how long it'll hold a corner in cover with nobody in sight before it goes on (s)
const BOT_CAMP = 3.5;
// how long a standoff (only the cover they're behind to shoot at) lasts before it does something about it (s)
const BOT_STALL = [1.1, 2.2];
// in cover (botThink): how soon it's out again having got there (s), and having reloaded there (repeek s)
const BOT_COVER = { peek: [0.5, 1.2], repeek: [0.1, 0.3] };
// peeking (botThink, botPeek): a jiggle, a step out round it (within near m) and straight back for jiggle s, out again
// again s later; a wide swing, out across them to a spot lat m off the line to them (within far m) and fighting on
// the move from there, wide s if there's nobody; after jigs jiggles, a swing whatever
const BOT_PEEK = { jigs: 2, jiggle: [0.35, 0.6], again: [0.25, 0.5], wide: [1.3, 2.2], near: 3.5, far: 5.5, lat: 4 };
// taking this much (hp) inside window (s), it backs off and relocates (botThink: b.relocate)
const BOT_HURT = { much: 45, window: 1.6 };
// with the flag up, the other side alone on it (taking it, pvp/pvp.js): everyone else stops what it's doing to stop them
const botDeny = (b, fl) => !!fl && PVP.mode !== 'ffa' && !!fl.w && fl.w !== b.side;
// a spot a few steps off, behind low cover from T (pvp/pvp.js pvpCovered: only their head over it) and still in sight
// of them, got to without going further from cover than it is; the nearest
function botFightSpot(b, T) {
  const cs = botCells(b.x, b.z, 3.2).filter(c => c[2] > 0.6 && los(c[0], c[1], T.x, T.z) && (() => { const dx = T.x - c[0], dz = T.z - c[1], L = Math.hypot(dx, dz) || 1; return pvpCovered(c[0], c[1], T.x, T.z, -dx / L, -dz / L, L); })()).sort((a, c) => a[2] - c[2]);
  return cs.length ? botPath(b, cs[0][0], cs[0][1]) : null;
}
// a way round: a spot off to the side of where they were, in sight of it (and of nobody else it knows of), got to
// keeping out of their sight
function botFlank(b, L, others) {
  const ba = Math.atan2(b.x - L.x, b.z - L.z);
  const cs = botCells(L.x, L.z, 15).filter(c => c[2] > 5 && Math.abs(angDiff(Math.atan2(c[0] - L.x, c[1] - L.z), ba)) > 0.9 && los(c[0], c[1], L.x, L.z) && !botSeenBy(c[0], c[1], others));
  if (!cs.length) return null;
  const c = cs.map(q => [q, Math.hypot(q[0] - b.x, q[1] - b.z) + rr(0, 6)]).sort((a, q) => a[1] - q[1])[0][0];
  const avoid = new Set(); for (const q of botCells(L.x, L.z, 18)) if (los(L.x, L.z, q[0], q[1])) avoid.add(idx(ci(q[0]), ci(q[1])));
  const path = botPath(b, c[0], c[1], avoid); return path.length ? path : null;
}
// somewhere to go looking: up its lane (picked each round, BOT_LANES: north, middle or south) toward the other side's
// half in the team games, anywhere far off in a free-for-all
const BOT_LANES = 3, BOT_LEARN = { win: 0.04, lose: 0.07, most: 0.3, early: 20 };
// its lane this round: any at random, less likely the ones it's gone down in (Showdown)
function botLanePick(b) { let best = 1, bs = -1; for (let k = 0; k < BOT_LANES; k++) { const s = rand() / (1 + 1.5 * (b.learn.lane[k] || 0)); if (s > bs) { bs = s; best = k; } } return best; }
// a side's bots spread over the lanes as a team does (as likely as they're team players, BOT_SKILL team): each its own
// lane where there are enough of them, the order drawn at random, steering clear of the lanes they've gone down in
function botLanesTeam(list) {
  if (!list.length || rand() > list.reduce((a, b) => a + botSk(b).team, 0) / list.length) return;
  let best = null, bs = 1e9;
  for (let k = 0; k < 8; k++) {
    const ks = [0, 1, 2].sort(() => rand() - 0.5), pick = list.map((b, i) => ks[i % BOT_LANES]);
    const sc = list.reduce((a, b, i) => a + 1.5 * (b.learn.lane[pick[i]] || 0), 0) + rr(0, 1);
    if (sc < bs) { bs = sc; best = pick; }
  }
  list.forEach((b, i) => { b.lane = best[i]; });
}
// the lanes on whatever map it is, from the map itself (BOT_AXIS): the line from one side's spawns to the other's (in
// Deathmatch, along the yard's longer way), and every open cell's place across it, split in BOT_LANES bands: the two
// sides and the middle
const BOT_AXIS = { ax: 1, az: 0, cx: 0, cz: 0, lo: 0, hi: 1 };
function botAxisSet() {
  const c = { A: [0, 0, 0], B: [0, 0, 0] }, add = (sd, x, z) => { if (c[sd] && x !== undefined) { c[sd][0] += x; c[sd][1] += z; c[sd][2]++; } };
  if (PVP.mode !== 'ffa') { for (const o of BOTS.values()) add(o.side, o.x, o.z); add(pvpSideOf(NET.id), P.x, P.z); }
  const A = c.A, B = c.B, X = ARENA.x1 - ARENA.x0, Z = ARENA.z1 - ARENA.z0;
  let ax = X >= Z ? 1 : 0, az = X >= Z ? 0 : 1, cx = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2, cz = (cxw(ARENA.z0) + cxw(ARENA.z1)) / 2;
  if (A[2] && B[2]) { const x0 = A[0] / A[2], z0 = A[1] / A[2], x1 = B[0] / B[2], z1 = B[1] / B[2], L = Math.hypot(x1 - x0, z1 - z0); if (L > 6) { ax = (x1 - x0) / L; az = (z1 - z0) / L; cx = (x0 + x1) / 2; cz = (z0 + z1) / 2; } }
  Object.assign(BOT_AXIS, { ax, az, cx, cz, lo: 1e9, hi: -1e9 });
  for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) if (botWalk(i, j)) { const u = botAcross(cxw(i), cxw(j)); BOT_AXIS.lo = Math.min(BOT_AXIS.lo, u); BOT_AXIS.hi = Math.max(BOT_AXIS.hi, u); }
  if (!(BOT_AXIS.hi > BOT_AXIS.lo)) { BOT_AXIS.lo = 0; BOT_AXIS.hi = 1; }
}
// where a spot is across the map's lanes (m off the line between the spawns) and which lane that is, and how far on
// from the middle toward the other side's spawns it is (m: side A's toward B's)
const botAcross = (x, z) => (x - BOT_AXIS.cx) * -BOT_AXIS.az + (z - BOT_AXIS.cz) * BOT_AXIS.ax;
const botLaneOf = (x, z) => clamp(Math.floor((botAcross(x, z) - BOT_AXIS.lo) / (BOT_AXIS.hi - BOT_AXIS.lo + 1e-6) * BOT_LANES), 0, BOT_LANES - 1);
const botAhead = (b, x, z) => ((x - BOT_AXIS.cx) * BOT_AXIS.ax + (z - BOT_AXIS.cz) * BOT_AXIS.az) * (b.side === 'B' ? -1 : 1);
// (somewhere to head: mostly up its own lane, a side one as often as the middle (BOT_SIDES), on toward the other
// side's end in the team games, round the map's edges some rounds)
function botRoam(b) {
  let best = null, bs = -1e9; const lane = b.lane ?? 1, team = PVP.mode !== 'ffa';
  for (let k = 0; k < 40; k++) {
    const i = ARENA.x0 + Math.floor(rand() * (ARENA.x1 - ARENA.x0 + 1)), j = ARENA.z0 + Math.floor(rand() * (ARENA.z1 - ARENA.z0 + 1)); if (!botWalk(i, j)) continue;
    const x = cxw(i), z = cxw(j), inLane = botLaneOf(x, z) === lane;
    const s = Math.min(16, Math.hypot(x - b.x, z - b.z)) + (team ? botAhead(b, x, z) * BOT_EARLY.ahead : 0) + (inLane ? (team ? 20 : BOT_SIDES.ffa) : 0) + (b.edgy && Math.min(i - ARENA.x0, ARENA.x1 - i, j - ARENA.z0, ARENA.z1 - j) <= BOT_EDGE.cells ? BOT_EDGE.k : 0) + rr(0, 6);
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return best ? botPath(b, best[0], best[1]) : [];
}
// keeping to the sides (botPath): a bot whose lane's a side one finds each step through the middle lane mid dearer,
// on any way further than far (m); in Deathmatch it likes somewhere in its own lane by ffa (botRoam)
const BOT_SIDES = { mid: 0.6, far: 12, ffa: 10 };
// somewhere near where they were and out of its own sight now: where they've likely gone (a search, not a stare)
function botSearch(b, L) {
  const cs = botCells(L.x, L.z, 7).filter(c => !los(b.x, b.z, c[0], c[1]) && c[2] > 1.5);
  if (!cs.length) return [];
  const c = cs[Math.floor(rand() * cs.length)]; return botPath(b, c[0], c[1]);
}
// a fight between two others it could come in on (Deathmatch, BOT_THIRD): the latest shooting from two who aren't it,
// near each other, or a kill just made (the one left standing is hurt): where each was, and where between them
function botBrawl(b, t) {
  let best = null;
  for (let i = BOT_HOT.length - 1; i >= 0; i--) {
    const h = BOT_HOT[i]; if (t - h.t > BOT_THIRD.fresh) break; if (h.id === b.id || !h.id) continue;
    if (Math.hypot(h.x - b.x, h.z - b.z) > BOT_THIRD.reach) continue;
    if (h.kill) { best = { ids: [h.id], a: h, c: null, x: h.x, z: h.z }; break; }
    const o = BOT_HOT.slice(0, i).reverse().find(q => q.id && q.id !== h.id && q.id !== b.id && t - q.t < BOT_THIRD.fresh && Math.hypot(q.x - h.x, q.z - h.z) < BOT_THIRD.near);
    if (o) { best = { ids: [h.id, o.id], a: h, c: o, x: (h.x + o.x) / 2, z: (h.z + o.z) / 2 }; break; }
  }
  return best;
}
// where to come in on it from: somewhere that sees where they are, off to the side of the line between the two (where
// neither's looking: they're looking at each other), not on top of them, nearer it the better; got to keeping out of
// both their sight where it can
function botThird(b, br) {
  const A = br.a, C = br.c || A, line = Math.atan2(C.x - A.x, C.z - A.z);
  const cs = botCells(br.x, br.z, 14).filter(c => c[2] > 6 && los(c[0], c[1], br.x, br.z) && (!br.c || Math.min(Math.abs(angDiff(Math.atan2(c[0] - A.x, c[1] - A.z), line)), Math.abs(angDiff(Math.atan2(c[0] - C.x, c[1] - C.z), line + Math.PI))) > BOT_THIRD.side));
  if (!cs.length) return null;
  const c = cs.map(q => [q, Math.hypot(q[0] - b.x, q[1] - b.z) + rr(0, 5)]).sort((a, q) => a[1] - q[1])[0][0];
  const avoid = new Set(); for (const f of [A, br.c].filter(Boolean)) for (const q of botCells(f.x, f.z, 16)) if (los(f.x, f.z, q[0], q[1])) avoid.add(idx(ci(q[0]), ci(q[1])));
  const path = botPath(b, c[0], c[1], avoid); return path.length ? path : null;
}
// pre-aiming (botAimStep): of the ways round where it's heading (arc either side of it, n of them), the one someone's
// likeliest to come at it from: a long sightline (out to reach m, the longer the likelier, open per m) opening past
// something close by (a corner's edge, a doorway: the sightline beside it much shorter, edge per m it opens by), nearer
// the way it's heading (head per rad off it) and toward where the other side is (toward per rad: what it knows of them,
// else their end of the yard, else the last shooting it heard). Never at a wall in front of it (nothing under wall m),
// and a new look every so often (every s)
const BOT_AIMPRE = { arc: 1.6, arcL: 0.9, n: 13, reach: 28, step: 0.6, open: 0.25, edge: 0.9, head: 1.6, toward: 2.4, wall: 3, every: [0.3, 0.55] };
// a wall (or anything a round stops at) within d m of it the way a
const botWallAt = (b, a, d) => { for (let s = 0.5; s <= d; s += 0.5) if (bulletBlocked(b.x + Math.sin(a) * s, b.z + Math.cos(a) * s)) return true; return false; };
function botPreAim(b, head, t, arc, goal) {
  if (goal === undefined) {
    const L = botKnown(b, t); goal = null;
    if (L) goal = Math.atan2(L.x - b.x, L.z - b.z);
    else if (PVP.mode !== 'ffa') { const g = b.side === 'B' ? -1 : 1; goal = Math.atan2(BOT_AXIS.ax * g, BOT_AXIS.az * g); }
    else { const h = BOT_HOT[BOT_HOT.length - 1]; if (h && t - h.t < BOT_DM.fresh) goal = Math.atan2(h.x - b.x, h.z - b.z); }
  }
  const A = BOT_AIMPRE, ds = [], as = [];
  for (let k = 0; k < A.n; k++) {
    const a = head + (k / (A.n - 1) * 2 - 1) * arc; let d = A.step;
    while (d < A.reach && !bulletBlocked(b.x + Math.sin(a) * d, b.z + Math.cos(a) * d)) d += A.step;
    ds.push(d); as.push(a);
  }
  let best = null, bs = -1e9;
  for (let k = 0; k < A.n; k++) {
    if (ds[k] < A.wall) continue;
    const nb = Math.min(ds[k - 1] ?? ds[k], ds[k + 1] ?? ds[k]), edge = clamp(ds[k] - nb, 0, 12);
    const sc = Math.min(ds[k], A.reach) * A.open + edge * A.edge - Math.abs(angDiff(as[k], head)) * A.head - (goal !== null ? Math.abs(angDiff(as[k], goal)) * A.toward : 0) + rr(0, 0.8);
    if (sc > bs) { bs = sc; best = as[k]; }
  }
  return best ?? botOpenLook(b);
}

// ---- the Terminator's extras (BOT_SKILL leanSpam, burn, angles)
// leaning one way and the other mid fight (botLeanSpam): every gap s a side it still sees them from (leaned out either
// way, or upright), never the one it's on; eased over at ease (per s), quicker than anyone else leans
const BOT_LEANSPAM = { gap: [0.16, 0.34], ease: 12 };
function botLeanSpam(b, t) {
  const T = b.vis; if (!botSk(b).leanSpam || !T || b.sprint || b.state !== 'fight' || t < (b.lsT || 0)) return;
  b.lsT = t + rr(...BOT_LEANSPAM.gap);
  const a = Math.atan2(T.x - b.x, T.z - b.z), ox = -Math.cos(a) * BOT_LEAN.off, oz = Math.sin(a) * BOT_LEAN.off;
  const ok = [-1, 0, 1].filter(sd => sd !== (b.leanSide || 0) && !bulletBlocked(b.x + ox * sd, b.z + oz * sd) && los(b.x + ox * sd, b.z + oz * sd, T.x, T.z));
  if (!ok.length) return;
  b.leanSide = ok[Math.floor(rand() * ok.length)]; b.leanT = b.lsT + 0.05;
}
// where it's been shot from where it stood (botHit, a Terminator's b.burn): the last keep of them; a spot within near
// (m) of one, looking within ang (rad) of the way that shot came, it never peeks from again (botPeek, a lean out of
// cover, a held angle: botAnglePick); it goes and comes at them from another angle
const BOT_BURN = { keep: 16, near: 2, ang: 0.7 };
const botBurnt = (b, x, z, tx, tz) => !!b.burn && b.burn.some(q => Math.hypot(q.x - x, q.z - z) < BOT_BURN.near && Math.abs(angDiff(Math.atan2(tx - x, tz - z), q.a)) < BOT_BURN.ang);
// where the other side comes through, for each side over the match (BOT_HEAT: a cell's worth, kept per side, of where
// that side's foes are): at the start of every round each of the ways from their end of the map up each lane to this
// side's (prior), and from then on every place one of them's first been seen (seen) or shot from (shot), worth more;
// all of it faded by decay a round, so what they did lately counts most.
// A Terminator in Showdown knowing of nobody (botAngleThink) gets to a spot that watches the most of that (of the
// hottest targets cells, those near to far m off it and on toward the other side), from beside something it can lean
// round (wall: worth that much more), the more of it one way the better (spread: what's still worth it spread all
// round), the nearer the better (travel per m), never one it's been shot at there from that way (BOT_BURN), nor one
// it's held already this round. It holds it hold s, gun on it, crouched if there's low cover in front of it, leaned
// round what's beside it; nobody comes and it moves on to another, step m further on toward the other side each time
// (from ahead0 m: its own half), steps times, then goes looking (and not with the round nearly out: BOT_LATE)
const BOT_HEAT = { A: null, B: null };
const BOT_ANGLE = { prior: 1, seen: 4, shot: 6, decay: 0.75, targets: 40, cands: 70, near: 5, far: 32, reach: 26, hold: [5, 8.5], steps: 4, ahead0: [-16, -3], step: 5, spread: 0.6, wall: 1.3, travel: 0.03, used: 3, burnt: 2.5 };
function botHeatAdd(sd, x, z, w) {
  const H = BOT_HEAT[sd]; if (!H || PVP.mode !== 'rounds') return;
  const i0 = ci(x), j0 = ci(z);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = i0 + di, j = j0 + dj; if (inb(i, j)) H[idx(i, j)] += di || dj ? w * 0.4 : w; }
}
function botHeatPrior() {
  if (PVP.mode !== 'rounds') return;
  const c = { A: [0, 0, 0], B: [0, 0, 0] }, add = (sd, x, z) => { if (c[sd] && x !== undefined) { c[sd][0] += x; c[sd][1] += z; c[sd][2]++; } };
  for (const o of BOTS.values()) add(o.side, o.x, o.z);
  add(pvpSideOf(NET.id), P.x, P.z); for (const q of NET.peers.values()) if (!BOTS.has(q.id)) add(pvpSideOf(q.id), q.x, q.z);
  // (the open cells as the bots walk them, for the worker: it can't ask the map)
  const walk = new Uint8Array(N * N); for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) if (botWalk(i, j)) walk[idx(i, j)] = 1;
  for (const sd of ['A', 'B']) {
    const H = BOT_HEAT[sd] || (BOT_HEAT[sd] = new Float32Array(N * N)); for (let k = 0; k < H.length; k++) H[k] *= BOT_ANGLE.decay;
    const fo = c[sd === 'A' ? 'B' : 'A'], us = c[sd]; if (!fo[2] || !us[2]) continue;
    // their ways up each lane, walked on one of the game's threads (core/threads.js: botHeatWays), added in once they're
    // in (long before the round's under way: this is while everyone's picking)
    const d = { N, walk, from: [ci(fo[0] / fo[2]), ci(fo[1] / fo[2])], to: [ci(us[0] / us[2]), ci(us[1] / us[2])], half: cxw(0) - 0.5, axis: [BOT_AXIS.ax, BOT_AXIS.az, BOT_AXIS.cx, BOT_AXIS.cz, BOT_AXIS.lo, BOT_AXIS.hi], ways: 6, w: BOT_ANGLE.prior / 6, seed: Math.floor(rand() * 1e9) };
    threadRun('heat', d).then(add_ => { if (BOT_HEAT[sd] === H) for (let k = 0; k < H.length; k++) H[k] += add_[k]; }, () => {});
  }
}
// the other side's likely ways from their spawns to this side's (d: the open cells, from and to as cells, half: the
// grid's offset (a cell's middle in metres is i + half + 0.5), axis: the lanes' line and spread (BOT_AXIS); ways of
// them, two by each lane, each a little differently): a path along each, kept to its own lane but for its ends, each
// cell on it worth w, the cells beside it less. Uses nothing outside itself: it's a job for the game's threads
function botHeatWays(d) {
  const { N, walk, from, to, half, axis, ways, w } = d, out = new Float32Array(N * N);
  let st = d.seed >>> 0; const rnd = () => { st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ok = (i, j) => i >= 0 && j >= 0 && i < N && j < N && walk[j * N + i] === 1;
  const laneOf = (i, j) => { const x = i + half + 0.5, z = j + half + 0.5, u = (x - axis[2]) * -axis[1] + (z - axis[3]) * axis[0]; return Math.max(0, Math.min(2, Math.floor((u - axis[4]) / (axis[5] - axis[4] + 1e-6) * 3))); };
  const near = (i, j, k, r) => { let bd = 1e9, b = -1; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (ok(i + di, j + dj) && di * di + dj * dj < bd) { bd = di * di + dj * dj; b = (j + dj) * N + i + di; } return b < 0 ? k : b; };
  const s0 = near(from[0], from[1], -1, 4), g0 = near(to[0], to[1], -1, 4); if (s0 < 0 || g0 < 0) return { out, transfer: [out.buffer] };
  const gi = g0 % N, gj = (g0 / N) | 0, si = s0 % N, sj = (s0 / N) | 0, span = Math.hypot(gi - si, gj - sj) || 1;
  for (let k = 0; k < ways; k++) {
    const lane = k % 3, noise = new Float32Array(N * N); for (let q = 0; q < noise.length; q++) noise[q] = rnd() * 0.9;
    const g = new Float32Array(N * N).fill(1e9), from_ = new Int32Array(N * N).fill(-1), shut = new Uint8Array(N * N), heap = [];
    const push = (f, q) => { heap.push([f, q]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = q => { const dx = Math.abs(q % N - gi), dz = Math.abs(((q / N) | 0) - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    g[s0] = 0; push(h(s0), s0);
    while (heap.length) {
      const [, q] = pop(); if (q === g0) break; if (shut[q]) continue; shut[q] = 1;
      const i = q % N, j = (q / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!ok(ni, nj)) continue;
        if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue;
        const nq = nj * N + ni, mid = Math.min(Math.hypot(ni - si, nj - sj), Math.hypot(ni - gi, nj - gj)) / span;
        const c = g[q] + (di && dj ? 1.414 : 1) + noise[nq] + (mid > 0.2 && laneOf(ni, nj) !== lane ? 2.5 : 0);   // (off its lane, but near either end, dearer)
        if (c < g[nq]) { g[nq] = c; from_[nq] = q; push(c + h(nq), nq); }
      }
    }
    if (from_[g0] < 0) continue;
    for (let q = g0; q >= 0 && q !== s0; q = from_[q]) {
      const i = q % N, j = (q / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < N && b < N) out[b * N + a] += di || dj ? w * 0.4 : w; }
    }
  }
  return { out, transfer: [out.buffer] };
}
threadJob('heat', botHeatWays);
function botAnglePick(b, t) {
  const H = BOT_HEAT[b.side], A = BOT_ANGLE; if (!H) return null;
  const tg = [];
  for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) { const h = H[idx(i, j)]; if (h > 0.05 && botWalk(i, j)) tg.push([cxw(i), cxw(j), h, 0]); }
  if (!tg.length) return null;
  tg.sort((a, c) => c[2] - a[2]); tg.length = Math.min(tg.length, A.targets);
  for (const g of tg) g[3] = botAhead(b, g[0], g[1]);
  const n = b.angN || 0, lo = A.ahead0[0] + n * A.step, hi = A.ahead0[1] + n * A.step;
  const cs = botCells(b.x, b.z, A.reach).filter(c => { const a = botAhead(b, c[0], c[1]); return a >= lo && a <= hi && !b.angUsed.some(u => Math.hypot(u.x - c[0], u.z - c[1]) < A.used) && !(b.burn || []).some(q => Math.hypot(q.x - c[0], q.z - c[1]) < A.burnt); });
  for (let k = cs.length - 1; k > 0; k--) { const r = Math.floor(rand() * (k + 1)); [cs[k], cs[r]] = [cs[r], cs[k]]; }
  let best = null, bs = 0;
  for (const c of cs.slice(0, A.cands)) {
    const ca = botAhead(b, c[0], c[1]); let w = 0, sx = 0, sz = 0, top = null, tw = 0;
    for (const g of tg) {
      const ex = g[0] - c[0], ez = g[1] - c[1], d = Math.hypot(ex, ez);
      if (d < A.near || d > A.far || g[3] < ca - 2 || !los(c[0], c[1], g[0], g[1]) || botBurnt(b, c[0], c[1], g[0], g[1])) continue;
      w += g[2]; sx += ex / d * g[2]; sz += ez / d * g[2]; if (g[2] > tw) { tw = g[2]; top = g; }
    }
    if (!w) continue;
    const i = ci(c[0]), j = ci(c[1]); let wall = false;
    for (let dj = -1; dj <= 1 && !wall; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && !botWalk(i + di, j + dj)) { wall = true; break; }
    const sc = w * (A.spread + (1 - A.spread) * Math.hypot(sx, sz) / w) * (wall ? A.wall : 1) / (1 + c[2] * A.travel);
    if (sc > bs) {
      bs = sc; const d = Math.hypot(top[0] - c[0], top[1] - c[1]) || 1;
      best = { x: c[0], z: c[1], a: Math.atan2(sx, sz), tx: top[0], tz: top[1], cr: pvpCovered(c[0], c[1], top[0], top[1], (c[0] - top[0]) / d, (c[1] - top[1]) / d, d) };
    }
  }
  return best;
}
function botAngleThink(b, t) {
  const A = BOT_ANGLE, n = b.angN || 0;
  if (n >= A.steps || PVP.t < BOT_LATE) return false;
  if (b.state === 'angle' && b.ang) {
    if (b.path.length) { b.sprint = Math.hypot(b.ang.x - b.x, b.ang.z - b.z) > 3; return true; }
    if (b.ang.until === undefined) { b.ang.until = t + rr(...A.hold); b.leanSide = botLeanSide(b, { x: b.ang.tx, z: b.ang.tz }); b.leanT = b.ang.until; b.coverAt = { x: b.x, z: b.z }; b.sprint = false; }
    if (t < b.ang.until) return true;
    b.angN = n + 1; b.ang = null; b.leanT = 0;   // (nobody came: on to another, further on)
    if (b.angN >= A.steps) return false;
  }
  if (t < (b.angRetry || 0)) return false;
  const pk = botAnglePick(b, t); if (!pk) { b.angRetry = t + 1.5; return false; }
  b.ang = pk; b.angUsed.push({ x: pk.x, z: pk.z }); b.state = 'angle'; b.path = botPath(b, pk.x, pk.z); b.sprint = Math.hypot(pk.x - b.x, pk.z - b.z) > 3; b.coverAt = null;
  return true;
}

// ---- its side's plan (the team games, the host's bots on a side together), a couple of times a second: how many are
// still up on each side, what they know between them, and the clock. In Showdown, more of them than of you and someone
// known: now and then they all rush that spot together (BOT_RUSH). Fewer of them: they sit back and hold. Late in the
// round, behind (fewer up, or less health between them: who'd win on time) they push; ahead, they hide and wait it out
const BOT_RUSH = { chance: 0.7, len: 12, minHp: 25 }, BOT_LATE = 20;
// Showdown's start: how many of them run their lane (rather than walk it), and in the team games how keen they are to
// get up it toward the other side's end (per m past the middle, botRoam)
const BOT_EARLY = { sprint: 0.85, ahead: 0.6 };
const SQUAD = { A: {}, B: {} };
function botSquadReset() { SQUAD.A = { plan: '' }; SQUAD.B = { plan: '' }; }
function botSides(t) {
  const n = { A: [0, 0], B: [0, 0] }, add = (id, dead, hp) => { const s = pvpSideOf(id); if (!dead && n[s]) { n[s][0]++; n[s][1] += Math.max(0, hp); } };
  add(NET.id, P.dead, P.hp); for (const p of NET.peers.values()) { const o = BOTS.get(p.id); if (o) add(o.id, o.dead, o.hp); else add(p.id, p.dead, p.hp ?? 100); }
  return n;
}
function botSquad(t) {
  if (PVP.mode === 'ffa') return;
  const n = botSides(t);
  for (const sd of ['A', 'B']) {
    const Q = SQUAD[sd], mine = BOTS.size && [...BOTS.values()].filter(o => o.side === sd && !o.dead);
    if (!mine.length) { Q.plan = ''; continue; }
    const fo = sd === 'A' ? 'B' : 'A', us = n[sd], them = n[fo];
    let known = null; for (const o of mine) { const m = botKnown(o, t); if (m && (!known || m.t > known.t)) known = m; }
    if (Q.plan === 'rush' && (t > Q.until || us[0] <= them[0] || !known)) Q.plan = '';
    if (PVP.mode !== 'rounds') { Q.plan = ''; continue; }
    // the flag up (pvp/pvp.js): everyone to the middle, to take it or stop them taking it
    const fl = pvpFlag(); if (fl) { Q.plan = 'flag'; Q.at = { x: fl.x, z: fl.z }; continue; }
    const late = PVP.t < BOT_LATE, ahead = us[0] !== them[0] ? us[0] > them[0] : us[1] > them[1];
    if (late) { Q.plan = ahead ? 'hold' : 'push'; Q.at = known; continue; }
    if (Q.plan !== 'rush' && us[0] > them[0] && known && us[0] !== Q.lastUs) {
      Q.lastUs = us[0];   // (asked once each time the numbers change)
      if (rand() < BOT_RUSH.chance + mine.reduce((a, o) => a + (o.learn.bold || 0), 0) / mine.length) { Q.plan = 'rush'; Q.at = { x: known.x, z: known.z }; Q.until = t + BOT_RUSH.len; continue; }
    }
    // (fewer of them: no sitting back to wait to be found, they go on, quieter and more often round the side: Q.wary)
    if (Q.plan !== 'rush') Q.plan = '';
    Q.wary = us[0] < them[0];
  }
}

// ---- deciding, a few times a second
function botThink(b, t) {
  const st = botStyle(b), T = b.vis, Q = PVP.mode === 'ffa' ? {} : SQUAD[b.side], id = botGunOf(b), S = botSk(b);
  const known = botAll(b, t, 6), threats = known.filter(m => m.threat);
  // hurt: back off to heal, and stay back till it has (in Showdown, where nothing comes back, it plays it safe from
  // then on): no peeking, no going looking; only fighting what's on top of it
  const regen = PVP.mode !== 'rounds', lowAt = regen ? BOT_DM.low : BOT_LOW.hp;
  if (!b.healing && b.hp < lowAt && Q.plan !== 'rush' && !b.lowDone) { b.healing = true; b.healAt = t + rr(...BOT_LOW.t); }
  // (in Showdown, where nothing comes back, it only lies low a few seconds, BOT_LOW, then gets on with it, carefully,
  // rather than sitting in a corner the rest of the round for you to hunt down)
  if (b.healing && (regen ? b.hp >= BOT_DM.healed : Q.plan === 'push' || Q.plan === 'rush' || Q.plan === 'flag' || t > b.healAt)) { b.healing = false; if (!regen) b.lowDone = true; }
  const rushing = Q.plan === 'rush' && b.hp > BOT_RUSH.minHp;
  if (T) {
    b.tgt = T.id; b.seenT = t; b.pre = null; b.tbag = null; botInspCut(b);
    const d = Math.hypot(T.x - b.x, T.z - b.z), want = st.gun(d);
    // (topping off with rounds still in it and someone turns up: it lets the reload go and fights with what it has)
    if (b.reloading && b.mag[botGunOf(b)] >= Math.max(2, botCap(b, botGunOf(b)) * 0.25) && d < 30) { b.reloading = false; b.relT = 0; }
    // (hand to hand: nothing but a melee weapon (Brawl, the golden katana), or in Gun game, someone right on it, its
    // blade out to set them back a gun, as likely as it's sharp: BOT_MELEE knife)
    const gunless = !botCls(b).guns.length;
    if (!gunless && PVP.rule === 'gun') { if (!b.knife && d < BOT_MELEE.knife && rand() < BOT_MELEE.knifeK * (0.4 + 0.6 * S.iq)) b.knife = t + BOT_MELEE.knifeT; if (b.knife && (t > b.knife || d > BOT_MELEE.knife * 2)) b.knife = 0; }
    if (gunless || b.knife) { if (b.cur !== 'melee') { b.cur = 'melee'; b.swapT = BOT_MELEE.draw; b.burst = 0; } botMeleeThink(b, T, t, d, S); return; }
    if (want !== b.cur && b.slots[want] && !b.reloading && b.mag[b.slots[want]] > 0) { b.cur = want; b.swapT = botCls(b).perks.includes('Quick draw') ? 0.3 : 0.45; b.burst = 0; }
    const dry = b.reloading || b.mag[botGunOf(b)] <= 0, onTop = d < 7, fl = pvpFlag(), deny = botDeny(b, fl), onFlag = fl && Math.hypot(T.x - fl.x, T.z - fl.z) < fl.r + 0.5;
    // (someone it's hurt, or who's looking away from it: it has the edge, and plays it, BOT_FINISH)
    const weak = botWeak(b, T.id, t), away = T.aim !== undefined && Math.abs(angDiff(T.aim, Math.atan2(b.x - T.x, b.z - T.z))) > BOT_PICK.away;
    // out of the fight for now: hurt, empty with them close, or two or more in sight at once (one at a time: it takes
    // cover from all of them and peeks for one) unless it's rushing with its side or they're right on it, or the one
    // it's on is nearly done and it's well enough itself to finish them
    const outnumbered = b.seeN > 1 && !rushing && !onTop && !b.tunnel && !(weak && b.hp > 60), leave = !deny && ((b.healing && !onTop && !(weak && d < 12)) || (dry && d < 20) || outnumbered);
    b.noFire = false;   // (it never sits there not shooting at someone it can see)
    // (just hurt badly: out of their sight to somewhere else, sprinting, before it fights on, unless the flag needs it
    // or the one hurting it is nearly done)
    if (b.relocate && t - b.relocate < 0.5 && !deny && !onTop && !(weak && b.hp > 30)) {
      b.relocate = 0; b.coverT = t; const cv = botCover(b, known.length ? known : [T], true);
      if (cv) { b.state = 'cover'; b.path = cv.path; b.sprint = true; b.peekAt = t + rr(0.9, 1.6); b.mv = ''; b.coverAt = { x: cv.x, z: cv.z }; return; }
      b.mv = 'back'; b.path = []; b.sprint = false; b.mvT = t + rr(0.6, 1);
    }
    if (leave && b.state !== 'cover' && t - (b.coverT || 0) > 0.6) {
      b.coverT = t; const cv = botCover(b, known.length ? known : [T], b.healing);
      if (cv) { b.state = 'cover'; b.path = cv.path; b.sprint = true; b.peekAt = t + botPk(b, BOT_COVER.peek); b.coverAt = { x: cv.x, z: cv.z }; return; }
    }
    if (b.state === 'cover' && b.path.length) return;
    // (a standoff: it can see them but its rounds would only go into the cover they're behind, BOT_STALL s of it, and
    // it goes round to them or straight in, rather than the two of them sitting there)
    { const dx = (b.x - T.x) / (d || 1), dz = (b.z - T.z) / (d || 1); b.stall = pvpCovered(T.x, T.z, b.x, b.z, dx, dz, d) ? (b.stall || 0) + 0.2 : 0; }
    if (b.stall > (b.stallAt || (b.stallAt = rr(...BOT_STALL)))) {
      b.stall = 0; b.stallAt = rr(...BOT_STALL);
      const fl = rand() < 0.6 ? botFlank(b, T, known.filter(m => m.id !== T.id)) : null;
      b.mv = 'push'; b.path = fl || botPath(b, T.x, T.z); b.sprint = false; b.mvT = t + rr(1.5, 3); b.leanT = 0; return;
    }
    // (the other side on the flag: straight at them, flat out till it's close, whatever else)
    if (deny && onFlag) { if (b.mv !== 'push' || t > (b.mvT || 0)) { b.mv = 'push'; b.mvT = t + 0.5; b.path = botPath(b, T.x, T.z); } b.sprint = d > 9; return; }
    // (out from a peek or from cover onto them: it stays leaned out round it and fights from there a while, not
    // stepping out into the open; swung wide out, it keeps moving across them as it fights)
    // (a quick peek, leaned out, BOT_QPEEK: a burst from there, and back in behind it before they've settled on it,
    // to come at them again from somewhere else; not with them nearly done)
    if ((b.state === 'peek' || b.state === 'cover' || b.state === 'angle') && b.mv !== 'hold' && b.mv !== 'strafe') {
      if (b.state === 'angle') b.coverAt = b.coverAt || { x: b.x, z: b.z };
      if (b.swing) { b.mv = 'strafe'; b.strafe = b.swing; b.path = []; b.sprint = false; b.mvT = t + rr(0.6, 1.1); }
      else { b.mv = 'hold'; b.path = []; b.sprint = false; b.leanSide = b.lpeek || botLeanSide(b, T); b.leanT = t + rr(1.1, 2); b.mvT = t + rr(0.8, 1.5); if ((b.lpeek || S.qpkAll) && b.coverAt && rand() < S.iq) b.qpk = t + botPk(b, BOT_QPEEK.fight); }
    }
    b.lpeek = 0;
    if (b.qpk && t > b.qpk && b.coverAt && !weak && !rushing && !deny) {
      b.qpk = 0; b.mv = ''; b.state = 'cover'; b.path = botPath(b, b.coverAt.x, b.coverAt.z); b.peekAt = t + botPk(b, BOT_QPEEK.again); b.rechal = true; b.leanT = 0; b.leanSide = 0; b.coverT = t; return;
    }
    if (S.burn && b.mv === 'hold' && t - b.hurtT < 0.3 && b.coverAt && !weak && !rushing && !deny && !onTop) {
      b.qpk = 0; b.mv = ''; b.state = 'cover'; b.path = botPath(b, b.coverAt.x, b.coverAt.z); b.peekAt = t + botPk(b, BOT_QPEEK.again); b.rechal = true; b.leanT = 0; b.leanSide = 0; b.coverT = t; return;
    }
    b.state = 'fight'; b.swing = 0;
    // (down in a crouch to steady it, BOT_CRACC: far off, or with a gun in each hand some way off, stood or strafing,
    // as likely as it knows to (BOT_SKILL crAcc); bobbing in a crouch as it fights, BOT_CRSPAM: a veteran's habit,
    // harder to hold a head on)
    if (t > (b.crAccT || 0)) { const gl = b.lo && b.lo.guns[botGunOf(b)], ak = !!(gl && (gl.mods || []).some(m => /^akimbo/.test(m))); b.crAccT = t + rr(1, 2); b.crAcc = (d > BOT_CRACC.far || (ak && d > BOT_CRACC.dual)) && rand() < S.crAcc; }
    if (b.crSpam < t && (b.mv !== 'push' || S.crK) && rand() < S.crch * (S.crK ?? BOT_CRSPAM.k)) b.crSpam = t + rr(...BOT_CRSPAM.len);
    if (t > (b.mvT || 0)) {
      b.mvT = t + rr(0.5, 1.1); const lo = st.range[0] * S.iq, hi = st.range[1] + (1 - S.iq) * 14;   // (a recruit hardly minds what range it's at)
      const covered = pvpCovered(b.x, b.z, T.x, T.z, (b.x - T.x) / (d || 1), (b.z - T.z) / (d || 1), d), bold = st.push + (b.learn.bold || 0) + (weak ? BOT_FINISH.push : 0) + (away ? 0.25 : 0);
      const spot = !covered && !rushing && !weak && d > 6 ? botFightSpot(b, T) : null;
      // (someone it's hurt: in after them, firing as it goes, before they can get away and heal, unless there's more
      // than one of them looking at it; a veteran, someone it's just slowed with a hit too, in range to make it count)
      const tagged = S.sharp && botTagged(b, T.id, t) && d < BOT_TAG.press;
      const finish = (weak || tagged) && b.hp > 30 && d > 3 && (b.seeN < 2 || b.tunnel) && rand() < 0.4 + 0.6 * S.iq;
      // (a veteran tagged out in the open, not winning: over to cover a few steps off that still sees them)
      if (S.sharp && b.tag > BOT_TAG.hide && spot && !finish) { b.mv = 'tocover'; b.path = spot; b.sprint = false; }
      else if (rushing || d > hi || finish || (d > lo + 1.5 && rand() < bold * BOT_CONF.pushFight && b.hp > 40 && (b.seeN < 2 || b.tunnel))) { b.mv = 'push'; b.path = botPath(b, T.x, T.z); b.sprint = rushing && d > 12; }
      else if (d < lo - 1) { b.mv = 'back'; b.path = []; b.sprint = false; }
      // (in the open with cover a few steps off that still has them in sight: over to it, and fight from behind it)
      else if (spot) { b.mv = 'tocover'; b.path = spot; b.sprint = false; }
      else if (covered) { b.mv = 'hold'; b.path = []; b.sprint = false; b.leanSide = botLeanSide(b, T); b.leanT = t + rr(1, 2); }
      else { b.mv = 'strafe'; if (b.strafe === undefined || rand() < 0.45) b.strafe = rand() < 0.5 ? 1 : -1; b.path = []; b.sprint = false; }
    }
    return;
  }
  b.noFire = false;
  const L = botKnown(b, t);
  // (its sidearm out for a fight it's done with, or its main gun nearly empty: back to that, and loaded, BOT_SIDE)
  { const main = botMainSlot(b), mid = main && b.slots[main]; if (mid && b.cur !== main && b.cur !== 'melee' && b.swapT <= 0 && !b.reloading && b.mag[mid] < botCap(b, mid)) { b.cur = main; b.swapT = 0.45; b.burst = 0; } }
  if (b.state === 'fight') {
    const m = b.mem.get(b.tgt), dm = m ? Math.hypot(m.x - b.x, m.z - b.z) : 0;
    // (the one it was fighting gone out of sight: hurt, it goes straight after them, at a run if they're far, before
    // they can get away; otherwise it holds a moment with its gun on where they went, ready to fire as they're back)
    if (m && botWeak(b, m.id, t) && b.hp > 30 && !b.healing && rand() < 0.35 + 0.65 * S.iq) { b.state = 'hunt'; b.path = botPath(b, m.x, m.z); b.sprint = dm > 8; b.chaseT = t; return; }
    if (m && dm > 2 && rand() < S.pre) b.pre = { id: m.id, x: m.x, z: m.z, until: t + BOT_PRE.len, at: t + rr(...BOT_PRE.wait), n: Math.round(rr(...BOT_PRE.shots)), go: false };
    b.state = 'hold'; b.holdT = t + (b.pre ? rr(...BOT_PRE.hold) : rr(0.1, 0.3)); b.path = []; b.sprint = false;
  }
  if (b.state === 'hold' && t < b.holdT) { if (b.mag[id] < botCap(b, id) * 0.35) botReload(b); return; }
  // (a lull, BOT_TOPOFF: nobody seen or shooting at it lately, its mag topped off, the better it is the sooner; a
  // veteran with someone about who could see it there steps into cover for it first)
  { const full = botCap(b, id), calm = !known.some(m => m.seen && t - m.t < BOT_TOPOFF.calm) && t - (b.shotAtT ?? -9) > BOT_TOPOFF.calm;
    if (!b.reloading && b.swapT <= 0 && (b.mag[id] < full * 0.35 || (calm && b.mag[id] < full * S.top))) {
      const near = S.sharp && known.filter(m => t - m.t < BOT_TOPOFF.known);
      if (near && near.length && b.state !== 'cover' && botSeenBy(b.x, b.z, near) && t - (b.coverT || 0) > 1) { const cv = botCover(b, near); if (cv) { b.coverT = t; b.state = 'cover'; b.path = cv.path; b.sprint = false; b.peekAt = t + 9; b.coverAt = { x: cv.x, z: cv.z }; return; } }
      if (!(b.state === 'cover' && b.path.length)) botReload(b);
    } }
  // shot at by someone it can't see, and standing where they can see it: into cover from them first (not with the
  // other side taking the flag: it goes for that whatever)
  // (in cover already and hit there: that cover's no good, somewhere else)
  if (!botDeny(b, pvpFlag()) && threats.length && t - (b.shotAtT || -9) < 3 && (b.state !== 'cover' || t - b.hurtT < 0.6) && botSeenBy(b.x, b.z, threats) && t - (b.coverT || 0) > 0.6 && (b.hp < 70 || rand() < 0.5)) {
    b.coverT = t; const cv = botCover(b, threats, b.healing);
    if (cv) { b.state = 'cover'; b.path = cv.path; b.sprint = true; b.peekAt = t + rr(0.5, 1.1); b.coverAt = { x: cv.x, z: cv.z }; return; }
  }
  // the flag up: onto it and hold it (looking about it), or back onto it if it's been pulled off
  if (Q.plan === 'flag' && Q.at) {
    const fl = pvpFlag(), d = Math.hypot(b.x - Q.at.x, b.z - Q.at.z), deny = botDeny(b, fl);
    if (fl && d > fl.r - 0.6) { if (b.state !== 'flag' || !b.path.length) { b.state = 'flag'; b.path = botPath(b, Q.at.x + rr(-1, 1), Q.at.z + rr(-1, 1)); } b.sprint = deny || d > 8; }   // (the other side taking it: flat out, all the way)
    else { b.state = 'flag'; b.path = []; b.sprint = false; }
    return;
  }
  // healing (or, in Showdown, low): it stays put in cover, its gun on where they were, reloaded
  if (b.healing && !rushing) {
    if (b.state !== 'cover') { const cv = L && botCover(b, known.length ? known : [L], true); b.state = 'cover'; b.path = cv ? cv.path : []; b.sprint = !!cv; }
    if (b.mag[id] < botCap(b, id)) botReload(b);
    return;
  }
  // someone it's just killed, BOT_TBAG: over to the body and down and up on it a few times, nobody else about
  if (b.tbag) {
    const g = b.tbag, quiet = !known.some(m => t - m.t < BOT_TBAG.quiet) && t - (b.shotAtT ?? -9) > BOT_TBAG.quiet;
    if (t > g.until || b.hp < BOT_TBAG.minHp || !quiet || botDeny(b, pvpFlag())) { b.tbag = null; b.crW = 0; if (b.state === 'tbag') b.state = 'reset'; }
    else if (t >= g.at) { if (b.state !== 'tbag') { b.state = 'tbag'; b.path = Math.hypot(g.x - b.x, g.z - b.z) > 0.7 ? botPath(b, g.x, g.z) : []; b.sprint = false; } return; }
  }
  // someone heard coming close, out of its sight (BOT_STEP): ready for them, out at them first, a peek or a swing
  const H = b.step && t - b.step.t < BOT_STEP.fresh && Math.hypot(b.step.x - b.x, b.step.z - b.z) < BOT_STEP.ready ? b.step : null;
  if (H && S.iq >= 0.5 && !/cover|peek|flag|rush|tbag|angle/.test(b.state) && !los(b.x, b.z, H.x, H.z)) {
    b.step = null; b.coverAt = { x: b.x, z: b.z };
    b.state = 'cover'; b.path = []; b.sprint = false; b.peekAt = t + rr(0.05, 0.25); b.coverSinceT = t; return;
  }
  // a teammate just gone down near it (BOT_TRADE): at whoever did it, now, while they're still there and hurt from it
  if (b.trade && t < b.trade.until && b.hp > BOT_TRADE.minHp) {
    const tr = b.trade, dT = Math.hypot(tr.x - b.x, tr.z - b.z);
    if (b.state !== 'trade') { b.state = 'trade'; b.path = botPath(b, tr.x + rr(-1.5, 1.5), tr.z + rr(-1.5, 1.5)); }
    if (b.path.length) { b.sprint = dT > BOT_TRADE.walk; return; }
    b.trade = null;
  }
  // its side rushing (Showdown): all of them at the spot, at a run
  if (rushing && Q.at) {
    if (b.state !== 'rush' || !b.path.length) { b.state = 'rush'; b.path = botPath(b, Q.at.x + rr(-1.5, 1.5), Q.at.z + rr(-1.5, 1.5)); b.sprint = true; }
    return;
  }
  // its side holding (ahead with the clock nearly out): it keeps to cover where it is and waits
  if (Q.plan === 'hold' && L) {
    if (b.state !== 'cover' && b.state !== 'peek') { const cv = botCover(b, known.length ? known : [L]); b.state = 'cover'; b.path = cv ? cv.path : []; b.peekAt = t + rr(1.2, 2.5); b.coverAt = cv ? { x: cv.x, z: cv.z } : { x: b.x, z: b.z }; }
    else if (b.state === 'cover' && !b.path.length && t > b.peekAt && !b.reloading) { const pk = botPeek(b, L, known.filter(m => m !== L)); b.state = 'peek'; b.path = pk || []; b.peekEnd = t + rr(1.1, 1.8); b.leanSide = botLeanSide(b, L); b.leanT = t + rr(1.1, 1.8); }
    else if (b.state === 'peek' && !b.path.length && t > b.peekEnd) { b.state = 'cover'; b.peekAt = t + rr(1.2, 2.4); b.path = []; }
    return;
  }
  // Deathmatch: two others going at it (BOT_THIRD), and nobody's shooting at it: in on them from the side, for the one
  // left standing (hurt, whoever it is), unless it's busy with someone of its own just now
  if (PVP.mode === 'ffa' && b.hp > BOT_THIRD.minHp && (!L || !L.threat || t - L.t > 3) && t > (b.thirdRest || 0)) {
    if (b.state !== 'third' || !b.path.length) {
      if (b.state === 'third') { b.thirdRest = t + BOT_THIRD.rest; b.state = 'search'; }
      else { const br = botBrawl(b, t), path = br && botThird(b, br); if (path) { b.state = 'third'; b.path = path; b.brawl = { ids: br.ids, until: t + BOT_THIRD.keep }; b.sprint = Math.hypot(br.x - b.x, br.z - b.z) > BOT_THIRD.walk; return; } if (br) b.thirdRest = t + 1; }
    } else { b.sprint = !!b.path.length && Math.hypot(b.path[b.path.length - 1][0] - b.x, b.path[b.path.length - 1][1] - b.z) > BOT_THIRD.walk * 0.6; return; }
  }
  // nobody known of, or only a stale idea: where there's shooting (BOT_HOT), at a run, rather than wandering
  const stale = !L || (!L.threat && t - L.t > 5);
  if (stale && Q.plan !== 'push' && (b.state !== 'hot' || !b.path.length)) {
    let hot = null, hd = 1e9; for (const h of BOT_HOT) { const d = Math.hypot(h.x - b.x, h.z - b.z); if (h.id !== b.id && t - h.t < BOT_DM.fresh && d > 4 && d < hd) { hd = d; hot = h; } }
    if (hot) { b.state = 'hot'; b.path = botPath(b, hot.x + rr(-2, 2), hot.z + rr(-2, 2)); b.sprint = hd > 8; if (b.path.length) return; }
  }
  if (stale && b.state === 'hot' && b.path.length) return;
  if (!L) {
    if (Q.plan === 'push' && Q.at) { if (b.state !== 'hunt' || !b.path.length) { b.state = 'hunt'; b.path = botPath(b, Q.at.x, Q.at.z); b.sprint = true; } return; }
    if (S.angles && PVP.mode === 'rounds' && botAngleThink(b, t)) return;   // (a Terminator holds the angles they come through: BOT_ANGLE)
    if (b.state !== 'roam' || !b.path.length) { b.state = 'roam'; b.path = botRoam(b); b.sprint = !!S.run || rand() < (PVP.mode === 'rounds' ? BOT_EARLY.sprint : BOT_DM.sprint); }
    return;
  }
  // (holding an angle and someone heard or called out coming the way it's watching: it stays on it for them)
  if (S.angles && b.state === 'angle' && b.ang && !b.path.length && t - L.t < 4 && Math.abs(angDiff(Math.atan2(L.x - b.x, L.z - b.z), b.ang.a)) < 0.9) { b.ang.until = Math.max(b.ang.until || 0, t + 1.5); return; }
  if (b.state === 'cover') {
    // (hit where it sits by someone it can't see from there: it doesn't sit and take it, it swings out at them now)
    if (t - b.hurtT < 0.6 && !b.path.length) b.peekAt = Math.min(b.peekAt, t + rr(0.15, 0.4));
    // (and sat long enough, it goes looking rather than holding the corner: BOT_CAMP)
    if (!b.path.length && t - (b.coverSinceT ?? (b.coverSinceT = t)) > BOT_CAMP * (S.peekK || 1) && !b.healing && Q.plan !== 'hold') { b.coverSinceT = undefined; b.state = 'reset'; }
    else if (b.path.length || b.reloading || t < b.peekAt) return;
  }
  if (b.state !== 'cover') b.coverSinceT = undefined;
  if (b.state === 'cover') {
    // out to look again, at the one it knows of, none of the others in sight of where it comes out. With the edge (it's
    // well, they're hurt or looking elsewhere, a teammate's on them too, or it's tried a jiggle or two: botEdge) it
    // swings out wide across them, moving, quick; without it, only a jiggle out and straight back to see where they
    // are and draw their fire. No such spot: round some other way to them
    // (leaned out round it where that sees them, BOT_QPEEK: head and shoulder, not the whole of it, quick and back; not
    // again from the same place straight after one that found nothing or got it hurt (b.rechal): another angle then)
    const others = known.filter(m => m !== L), ls = !b.rechal && !botBurnt(b, b.x, b.z, L.x, L.z) && botLeanSide(b, L);
    if (ls && rand() < BOT_QPEEK.leanK * S.iq) { b.state = 'peek'; b.path = []; b.sprint = false; b.lpeek = ls; b.leanSide = ls; b.peekEnd = t + botPk(b, BOT_QPEEK.lean); b.leanT = b.peekEnd; b.jiggle = true; b.swing = 0; b.coverAt = b.coverAt || { x: b.x, z: b.z }; return; }
    if (b.rechal) { b.rechal = false; if (rand() < BOT_QPEEK.flank * S.iq) { const fl = botFlank(b, L, others); if (fl) { b.state = 'flank'; b.path = fl; b.sprint = !!S.run && fl.length > 2; return; } } }
    const wide = botEdge(b, L, t) > 0 || (b.jig || 0) >= BOT_PEEK.jigs || !!b.lastPk && t - b.lastPk.t < 6, pk = botPeek(b, L, others, wide);
    if (pk) {
      { const e = pk[pk.length - 1]; b.lastPk = { x: e[0], z: e[1], t }; }
      b.state = 'peek'; b.path = pk; b.sprint = false; b.leanSide = botLeanSide(b, L);
      if (wide) { b.jig = 0; b.swing = rand() < 0.5 ? 1 : -1; b.peekEnd = t + rr(...BOT_PEEK.wide); b.leanT = 0; if (t - L.t < 3 && rand() < S.pre) b.pre = { id: L.id, x: L.x, z: L.z, until: t + 1.8, at: t, n: 2, go: false }; }
      else { b.jig = (b.jig || 0) + 1; b.swing = 0; b.peekEnd = t + botPk(b, BOT_PEEK.jiggle); b.leanT = b.peekEnd; b.jiggle = true; }
      return;
    }
    const fl = botFlank(b, L, others); if (fl) { b.state = 'flank'; b.path = fl; b.sprint = false; return; }
    b.state = 'peek'; b.path = []; b.peekEnd = t + rr(0.5, 0.8);
    return;
  }
  if (b.state === 'peek' && (b.path.length || t < b.peekEnd)) return;
  // (a jiggle done: back behind its cover and out again in a moment)
  if (b.state === 'peek' && b.jiggle && b.coverAt) { b.jiggle = false; b.rechal = !!b.lpeek; b.lpeek = 0; b.leanT = 0; b.state = 'cover'; b.path = botPath(b, b.coverAt.x, b.coverAt.z); b.peekAt = t + botPk(b, BOT_PEEK.again); return; }
  if (b.state === 'peek') { b.state = 'reset'; b.jiggle = false; b.swing = 0; }   // (a peek that found nobody: it doesn't stand there; on, below)
  if (b.state === 'hunt' || b.state === 'flank' || b.state === 'search' || b.state === 'trade') {
    if (b.path.length) return;
    // got there: if it can see the spot and there's nobody, they've moved; it looks round about (a threat it doesn't
    // give up on: it searches on near there, and remembers them a while yet)
    if (los(b.x, b.z, L.x, L.z) && Math.hypot(L.x - b.x, L.z - b.z) < 9) {
      if (!L.threat || (L.searched || 0) >= 2) { b.mem.delete(L.id); b.state = 'roam'; b.path = []; return; }
      L.searched = (L.searched || 0) + 1; b.state = 'search'; b.path = botSearch(b, L); b.sprint = !!S.run; return;
    }
  }
  // what now, with someone out there it can't see: straight at where they were, or round to their side (more likely the
  // more careful it is, the more of them there are and the more hurt it is)
  // (confident: somewhere it knows someone is, fresh, and healthy enough, it goes straight at them: BOT_CONF; someone
  // it's hurt, straight at them whatever)
  const fresh = t - L.t < BOT_CONF.fresh, weak = botWeak(b, L.id, t), bold = st.push + BOT_CONF.base + (b.learn.bold || 0) + (b.hp > 80 ? 0.15 : 0) - (b.hp < 50 ? 0.3 : 0) - (known.length > 1 ? 0.15 : 0) + (Q.plan === 'push' ? 0.4 : 0) + (fresh && b.hp > 50 ? BOT_CONF.freshPush : 0) + (weak ? 1 : 0);
  const sneak = !S.run && rand() < S.sneak + (Q.wary ? 0.35 : 0) - (weak ? 1 : 0);   // (walking in quietly on someone it knows is there: no running footsteps)
  const fl = rand() < bold - S.flank - (Q.wary ? 0.3 : 0) ? null : botFlank(b, L, known.filter(m => m !== L)), dL = Math.hypot(L.x - b.x, L.z - b.z);
  if (fl) { b.state = 'flank'; b.path = fl; b.sprint = dL > (S.run ? 5 : 10) && !(sneak && dL < 22); }
  else { b.state = 'hunt'; b.path = botPath(b, L.x, L.z); b.sprint = dL > (S.run ? 4 : fresh ? 7 : 11) && !(sneak && dL < 18); }
}
// ---- hand to hand (Brawl's whole fight, the golden katana, a blade in Gun game): it runs at them (side to side if they
// have a gun) till it's close, then fights as someone with a blade would: just out of their reach while its swing comes
// back round, in and swinging the moment it's ready, stepping in with the blow; out of the way of a swing it can see
// coming (yours, or another bot's) and straight back in to punish the miss; now and then a feint, in to the edge of
// reach and back out to draw a swing. Low on health against someone well, it backs off to heal where it can.
// close: past its reach (m) it runs; wind: each weapon's wind-up (s, the time from starting a swing to the blow landing,
// heavier weapons longer); out: how far past their reach it waits (m); feint: how likely a feint (times its iq); dodge:
// how likely it gets out of a swing it sees coming (times its iq); circle: how hard it circles; knife and knifeK, Gun
// game: within knife m it goes for its blade that likely, for knifeT s; draw: getting it out (s); weave: running in,
// how fast and how far it weaves; swingPace: its pace through a swing
const BOT_MELEE = { close: 2.4, wind: { crowbar: 0.14, machete: 0.16, bat: 0.2, katana: 0.2, wrench: 0.26, axe: 0.34, sledge: 0.52 }, out: 0.35, feint: 0.22, dodge: 0.75, circle: [0.35, 0.85], knife: 2.4, knifeK: 0.55, knifeT: 3, draw: 0.22, weave: [4.6, 0.6], swingPace: 0.6 };
// someone's swing coming at it (yours, or another bot's still winding up), and how far it reaches; and how far theirs
// reaches at all (0 with a gun in their hands)
function botFoeReach(T) {
  if (T.id === NET.id) { const D = W(curId()); return D && D.melee ? D.range : 0; }
  const o = BOTS.get(T.id), w = o && botGunOf(o); return w && WEAP[w] && WEAP[w].melee ? pvpMeleeOf(w).range : 0;
}
function botFoeSwing(T, t) {
  if (T.id === NET.id) { const D = W(curId()); return D && D.melee && W8.swing > 0.06 ? D.range + 0.35 : 0; }
  const o = BOTS.get(T.id); return o && o.mswing && o.mswing.at > t ? pvpMeleeOf(botGunOf(o)).range + 0.35 : 0;
}
// its guard (melee/block.js): how likely it puts it up against a swing coming at it, how long it holds it (s), how
// fast what a blow knocked off it comes back (a second, of the whole), and how it wears down with it held
const BOT_GUARD = { chance: 0.45, parry: 0.3, hold: [0.35, 0.8], back: 0.3, drain: 0.12 };
// which swing of theirs is coming (so it decides once a swing), and how long till it lands (s)
function botSwingKey(T) { if (T.id === NET.id) return 'y' + (W8.swingN || 0); const o = BOTS.get(T.id); return o && o.mswing ? T.id + o.mswing.t0 : ''; }
function botSwingLands(T, t) {
  if (T.id === NET.id) { const D = W(curId()) || {}, hit = D.style === 'chop' && D.two ? 0.55 : 0.4, p = 1 - W8.swing / (W8.swingDur || 1); return Math.max(0, (hit - p) * (W8.swingDur || 0.5)); }
  const o = BOTS.get(T.id); return o && o.mswing ? Math.max(0, o.mswing.at - t) : 0.2;
}
function botMeleeThink(b, T, t, d, S) {
  const id = botGunOf(b), M = pvpMeleeOf(id), R = M.range + 0.15;
  b.state = 'fight'; b.noFire = false; b.leanT = 0;
  // (hurt badly with them well: off out of it to heal, if there's somewhere)
  if (b.healing && !botWeak(b, T.id, t) && d > 1.4 && t - (b.coverT || 0) > 1.2) { b.coverT = t; const cv = botCover(b, [T], true); if (cv) { b.state = 'cover'; b.path = cv.path; b.sprint = true; b.weave = false; b.peekAt = t + 3; b.coverAt = { x: cv.x, z: cv.z }; return; } }
  // far off: straight at them, flat out, weaving if they've a gun
  if (d > R + BOT_MELEE.close) { b.mv = 'push'; b.path = botPath(b, T.x, T.z); b.sprint = true; b.weave = !botFoeReach(T); b.mvT = t + 0.3; return; }
  b.sprint = false; b.weave = false; b.path = []; b.mv = 'melee';
  if (t > (b.circT || 0)) { b.circT = t + rr(0.5, 1.2); b.mCirc = rr(...BOT_MELEE.circle); if (rand() < 0.45) b.strafe = -(b.strafe || 1); }
  const theirs = botFoeSwing(T, t), mine = b.mswing && b.mswing.at > t, reach = botFoeReach(T);
  // (their swing coming and it's in it: its guard up to take it (more often the sharper it is, and the more it has of
  // its guard left, melee/block.js), or out of reach, unless its own's about to land first)
  // (once a swing: whether to put it up, and whether it's in time to parry it, a sharper one likelier: its raise put
  // just before the blow lands, or else well before it, a plain block)
  const sk = theirs && botSwingKey(T);
  if (sk && b.guardFor !== sk) {
    b.guardFor = sk;
    if (!mine && d < theirs && t >= (b.guardCd || 0) && (b.gst ?? 1) > 0.3 && rand() < BOT_GUARD.chance * (0.4 + 0.6 * S.iq)) {
      const nowS = performance.now() / 1000, land = botSwingLands(T, t);
      b.block = true; b.blockAt = rand() < BOT_GUARD.parry * S.iq ? nowS + Math.max(0, land - 0.1) : nowS - BLK.parry - 0.05; b.blockEnd = t + Math.max(land + 0.15, rr(...BOT_GUARD.hold)); b.mWant = Math.max(0.6, d - 0.1); return;
    }
  }
  if (theirs && !mine && d < theirs && rand() < BOT_MELEE.dodge * S.iq + 0.1) { b.mWant = theirs + 0.4; b.punish = t + 0.5; return; }
  if (b.block) { if (t < b.blockEnd && theirs) return; b.block = false; b.punish = t + 0.4; }   // (down again once the blow's come, to hit back)
  if (!b.mswing && t >= (b.mcd || 0)) {
    // ready: in reach (or will be as it steps in) and on them, it swings; else in to them (or a feint now and then)
    const on = Math.abs(angDiff(Math.atan2(T.x - b.x, T.z - b.z), b.aim)) < M.arc * 0.85 || d < 0.8;
    if (d <= R + 0.4 && on) { botMeleeSwing(b, id, M, t); b.mWant = Math.max(0.55, d - 0.6); return; }
    b.mWant = rand() < BOT_MELEE.feint * S.iq && !(b.punish > t) ? Math.max(R + 0.25, reach + 0.1) : Math.max(0.6, R - 0.35);
    return;
  }
  // its swing coming back round: just outside their reach (or, out-reaching them, at the edge of its own)
  b.mWant = reach && reach < R ? Math.max(reach + BOT_MELEE.out, R - 0.25) : Math.max(R * 0.85, (reach || R) + BOT_MELEE.out);
}
// a swing started: lands wind s on, the next one after the weapon's pace (as yours: weapons/firing.js)
function botMeleeSwing(b, id, M, t) {
  const wind = BOT_MELEE.wind[id] ?? 0.2, dur = Math.min(M.rate * 1.2, M.rate > 0.85 ? 0.98 : 0.64);
  b.mswing = { id, t0: t, at: t + wind, end: t + Math.max(wind + 0.18, dur), side: rand() < 0.5 ? 1 : -1, hit: false, chop: M.rate > 0.85 || id === 'wrench' };
  b.mcd = t + M.rate * 1.3;
}
// each frame: a swing's blow landing as it comes round, on anyone in its reach and sweep (not through a wall), as yours
// do (pvp/pvp.js pvpMelee): the golden katana's a kill, anything else its weapon's damage, a head likelier the sharper
// the bot is
function botMeleeStep(b, t, foes) {
  const s = b.mswing; if (!s) return;
  if (!s.hit && t >= s.at) {
    s.hit = true; const M = pvpMeleeOf(s.id), gold = !!(b.gold && b.gold[s.id]), S = botSk(b); let n = 0;
    for (const f of foes) {
      const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
      if (d > M.range + 0.35 || (Math.abs(angDiff(Math.atan2(dx, dz), b.aim)) > M.arc && d > 0.6) || !los(b.x, b.z, f.x, f.z)) continue;
      // (on their guard, if it's up and facing it: melee/block.js. Parried, it's thrown off; blocked, a share gets through)
      const G = f.id === NET.id ? { on: BLOCK.on, at: BLOCK.at, aim: P.aim } : (() => { const q = NET.peers.get(f.id); return { on: !!q && q.bk > -50, at: q ? q.bkAt : 0, aim: q && q.vw ? q.vw[0] : 0 }; })();
      const gk = !gold && guardMeets(G.on, G.at, G.aim, f.x, f.z, b.x, b.z);
      if (gk) {
        const ux = dx / (d || 1), uz = dz / (d || 1), full = pvpMeleeDmg(M, false), cx = f.x - ux * 0.42, cz = f.z - uz * 0.42;
        guardFx(cx, 1.3, cz, -ux, -uz, gk === 'parry'); netAs(b.id, 'gx', { x: bR2(cx), z: bR2(cz), nx: bR2(-ux), nz: bR2(-uz), p: gk === 'parry' ? 1 : 0 });
        botDeal(b, f, gk === 'parry' ? 0 : Math.max(1, Math.round(full * guardThrough(s.id))), 'torso', s.id, false, { gk: gk === 'parry' ? 'p' : 'b', bd: full, kb: gk === 'parry' ? 0 : (M.kb || 0) * 0.4 + 1, kx: ux, kz: uz });
        if (gk === 'parry') { s.end = t; b.mcd = Math.max(b.mcd || 0, t + BLK.parryLock); b.stun = Math.max(b.stun || 0, BLK.parryStun * 0.6); }
        n++; continue;
      }
      const head = rand() < M.head * (0.6 + 0.6 * S.iq) * (1 - BOT_FAIR.head * botFair(b, f.id));
      botDeal(b, f, gold ? GG_ONE : pvpMeleeDmg(M, head), head ? 'head' : 'torso', s.id, rand() < M.bleed, { st: M.stun || 0, kb: M.kb || 0, kx: dx / (d || 1), kz: dz / (d || 1), gd: gold ? 1 : 0 });
      n++; b.st.hits++;
    }
    b.st.shots++;
    botsHear(b.id, b.x, b.z, true, null);
    pvpSwingHeard(s.id, b.x, b.z); netAs(b.id, 'mw', { w: s.id, x: bR2(b.x), z: bR2(b.z) });   // (its swing heard, as yours is: pvp/pvp.js)
  }
  if (t >= s.end) b.mswing = null;
}
// its main gun's slot: its class's first (the one it'd go back to after a sidearm, BOT_SIDE)
const botMainSlot = b => { const g = (botCls(b).guns[0] || [])[0]; return g && WEAP[g] ? WEAP[g].slot : null; };
// how much of an edge it has on L, peeking (botThink): well itself, them hurt or looking another way, a teammate on
// them too; less hurt itself, or a recruit (who just goes)
function botEdge(b, L, t) {
  const S = botSk(b); if (S.iq < 0.5) return rand() < 0.6 ? 1 : 0;
  const away = L.aim !== undefined && Math.abs(angDiff(L.aim, Math.atan2(b.x - L.x, b.z - L.z))) > BOT_PICK.away;
  const mate = PVP.mode !== 'ffa' && [...BOTS.values()].some(o => o !== b && !o.dead && o.side === b.side && (o.vis && o.vis.id === L.id || o.state === 'peek' || o.state === 'trade') && Math.hypot(o.x - b.x, o.z - b.z) < 14);
  return (b.hp >= 70 ? 1 : 0) + (botWeak(b, L.id, t) ? 1 : 0) + (away ? 1 : 0) + (mate ? 1 : 0) - (b.hp < 45 ? 1 : 0) - 1;
}
function botReload(b) {
  const id = botGunOf(b), D = WEAP[id]; if (!D || D.melee) return;
  const room = botCap(b, id) - b.mag[id];
  if (b.reloading || room <= 0 || b.res[id] <= 0) return;
  b.reloading = true; b.relT = (D.reload || (D.perShell || 0.45) * Math.min(room, b.res[id]) + 0.3) * b.quick;
}

// ---- every frame
export function botsUpdate(dt) {
  if (!BOTS.size) return;
  botClock += dt;
  const t = botNow(), live = PVP.ph === 'live';
  if (live && (squadT -= dt) <= 0) { squadT = 0.5; botSquad(t); }
  for (const b of BOTS.values()) {
    if (b.dead) {
      if (live && PVP.mode !== 'rounds' && b.respawn > 0 && (b.respawn -= dt) <= 0) botSpawn(b, false);
      botPose(b, dt, t); continue;
    }
    if (PVP.ph === 'roundEnd') { botAfter(b, dt, t); continue; }   // (the round won: walking about, guns quiet, as you can)
    if (!live) { b.vx = b.vz = 0; b.av = 0; b.sprint = false; b.runUp = 0; b.crW = 0; botCrouchStep(b, dt, t); botInspStep(b, dt, t); botPose(b, dt, t); continue; }   // (picking and counting in: stood still where it spawned, looking where it faces, as you are, now and then looking its gun over)
    b.prot = Math.max(0, (b.prot || 0) - dt);
    if (botBurn(b, dt, t)) { botPose(b, dt, t); continue; }   // (alight: pvp/pvp-fire.js)
    // reeling from a shove: carried back on it, no moving or firing of its own
    if (b.stun > 0) { b.stun -= dt; const f = Math.exp(-dt * 6); b.vx *= f; b.vz *= f; moveCircle(b, b.vx * dt, b.vz * dt, 0.3, false); botAimStep(b, dt, t, null); botPose(b, dt, t); continue; }
    const foes = botFoes(b);
    const qk = botSk(b).think || 1;   // (a Terminator senses and thinks again sooner)
    if ((b.senseT -= dt) <= 0) { b.senseT = 0.1 * qk; botSense(b, foes, t); }
    if ((b.thinkT -= dt) <= 0) { b.thinkT = rr(0.16, 0.26) * qk; botThink(b, t); }
    botCrouchStep(b, dt, t);
    botLeanSpam(b, t);
    botMove(b, dt, t);
    botAimStep(b, dt, t, b.vis);
    botGun(b, dt, t, foes);
    botInspStep(b, dt, t);
    // bleeding, and a bandage going on and the health it gives coming in
    if (b.bleed > 0) { b.bleed = b.hp <= BOT_BLEED.floor ? 0 : Math.max(0, b.bleed - dt); b.hp = Math.max(Math.min(b.hp, BOT_BLEED.floor), b.hp - BOT_BLEED.dps * dt); }
    if (b.bleed > 0 || b.hp >= 100) { if (b.bleed > 0) b.calm = 0; b.regen0 = null; }
    if (!(b.bleed > 0) && b.hp < 100 && PVP.mode !== 'rounds' && (b.calm += dt) > BOT_REGEN.wait) { if (b.regen0 == null) b.regen0 = b.hp; const u = clamp((b.calm - BOT_REGEN.wait) / (BOT_REGEN.full - BOT_REGEN.wait), 0, 1); b.hp = Math.max(b.hp, b.regen0 + (100 - b.regen0) * u * u); }
    botPose(b, dt, t);
  }
}
// the round over, till the next: no fight left in it, it wanders a few steps about where it is, at a walk, looking
// where it's going, reloading
// (and now and then it stops to look its gun over, BOT_INSP, and lets it go part way to walk on)
function botAfter(b, dt, t) {
  b.vis = null; b.state = 'roam'; b.sprint = false; b.mv = ''; b.leanT = 0; b.crW = 0; b.tbag = null;
  if (b.reloading) botGun(b, dt, t, []); else botReload(b);
  if (!b.insp && !b.reloading && !b.path.length && t > (b.inspNext || 0)) { b.inspNext = t + rr(...BOT_INSP.gap); if (rand() < BOT_INSP.end) botInspGo(b, 0); }
  if (b.insp && !b.insp.cut) { b.path = []; b.idleT = t + 0.5; }
  else if (!b.path.length && t > (b.idleT || 0)) {
    const cs = botCells(b.x, b.z, 5).filter(c => c[2] > 1.5);
    b.idleT = t + rr(0.6, 1.6); if (cs.length) { const c = cs[Math.floor(rand() * cs.length)]; b.path = botPath(b, c[0], c[1]); }
  }
  botCrouchStep(b, dt, t); botMove(b, dt, t); botAimStep(b, dt, t, null); botInspStep(b, dt, t); botPose(b, dt, t);
}
// how far down in a crouch it is (0 to 1, eased at both ends, as yours: player/crouch.js crouchK)
const botCrK = b => smooth(clamp(b.cr || 0, 0, 1));
// crouching (as you do, player/crouch.js: eased down and up at CROUCH's rates): bobbing over a body (BOT_TBAG), bobbing
// in a fight (BOT_CRSPAM), or behind low cover reloading; a sprint
// stands it up
function botCrouchStep(b, dt, t) {
  if (b.state === 'tbag' && b.tbag && !b.path.length) {
    const g = b.tbag; if (t > g.nextT) { b.crW = b.crW ? 0 : 1; g.nextT = t + rr(...BOT_TBAG.bob); if (!b.crW && --g.n <= 0) { b.tbag = null; b.state = 'reset'; b.thinkT = 0; } }
  } else if (b.crSpam > t && b.vis && (b.mv !== 'push' || botSk(b).crK)) { if (t > (b.bobT || 0)) { b.crW = b.crW ? 0 : 1; b.bobT = t + rr(...(botSk(b).bob || BOT_CRSPAM.bob)); } }
  else b.crW = (b.state === 'fight' && b.vis && ((b.mv === 'hold' && b.reloading) || (b.crAcc && b.mv !== 'push' && b.mv !== 'tocover'))) || (b.state === 'angle' && b.ang && b.ang.cr && !b.path.length) ? 1 : 0;
  if (b.sprint || b.dead) b.crW = 0;
  b.cr = (b.cr || 0) + (b.crW - (b.cr || 0)) * (1 - Math.exp(-dt * (b.crW > b.cr ? CROUCH.down : CROUCH.up)));
}
// looking its gun over (BOT_INSPECT, the player's own moves from player/inspect.js): started (after a wait, s), let go
// (cut: eased back onto the aim from wherever it got to), and each frame on, let go part way through or once it's
// moving, firing, reloading or someone's in sight
function botInspGo(b, wait) {
  const id = botGunOf(b), D = WEAP[id]; if (!D || D.melee) return;
  const keys = BOT_INSPECT[D.slot === 'side' ? 'hand' : 'long'], len = keys[keys.length - 1][0];
  b.insp = { t: -wait, keys, w: 0, cut: false, cutAt: len * rr(...BOT_INSP.cut) };
}
function botInspCut(b) { if (b.insp) b.insp.cut = true; }
function botInspStep(b, dt, t) {
  const g = b.insp; if (!g) return;
  if (b.vis || b.sprint || b.reloading || b.swapT > 0 || Math.hypot(b.vx, b.vz) > 1.2 || b.lastShotT > t - 0.2 || b.dead || g.t > g.cutAt) g.cut = true;
  g.t += dt; const on = !g.cut && g.t > 0;
  g.w += ((on ? 1 : 0) - g.w) * (1 - Math.exp(-dt * (on ? BOT_INSP.in : BOT_INSP.out)));
  if (g.cut && g.w < 0.01) b.insp = null;
}
// where it is through the moves (the keyframes eased between, as player/inspect.js does), and how much of it's on
function botInspKey(g) {
  const K = g.keys, tt = clamp(g.t, 0, K[K.length - 1][0]); let k = 0; while (k < K.length - 2 && K[k + 1][0] <= tt) k++;
  const A = K[k], B = K[k + 1], u = smooth(clamp((tt - A[0]) / Math.max(1e-3, B[0] - A[0]), 0, 1));
  return A.map((v, i) => v + (B[i] - v) * u);
}
// moving: along its path, or round whoever it's fighting (side to side, backing off, pressing in), never through a
// wall, and not into anyone else
function botMove(b, dt, t) {
  let dx = 0, dz = 0;
  const T = b.vis, fighting = b.state === 'fight' && T;
  if (b.path.length && (!fighting || b.mv === 'push' || b.mv === 'tocover')) {
    const [px, pz] = b.path[0], ex = px - b.x, ez = pz - b.z, d = Math.hypot(ex, ez);
    const sp0 = Math.hypot(b.vx, b.vz), passed = d < 1.2 && (ex * b.vx + ez * b.vz) < 0 && sp0 > 1;   // (gone past it, or close enough at the speed it's going: on to the next rather than circling back round it)
    if (d < 0.35 + sp0 * 0.09 || passed) { b.path.shift(); if (!b.path.length && b.mv === 'tocover') { b.mv = 'hold'; b.mvT = t + rr(1.2, 2.2); if (T) b.leanSide = botLeanSide(b, T); b.leanT = t + rr(1, 2); } if (b.state === 'roam' && !b.sprint && b.path.length && rand() < BOT_WALK.pause) { b.stopT = t + rr(0.25, 0.5); b.glanceT = 0; } }
    else if (t > b.stopT) {
      // (a corner taken round, not at a point: coming up on this point it's already heading on toward the next, as
      // someone walking does; and easing off as it comes to where it's going, BOT_WALK)
      let tx = px, tz = pz; if (b.path.length > 1 && d < BOT_WALK.corner) { const [qx, qz] = b.path[1], u = (1 - d / BOT_WALK.corner) * BOT_WALK.round; tx = px + (qx - px) * u; tz = pz + (qz - pz) * u; }
      const tdx = tx - b.x, tdz = tz - b.z, td = Math.hypot(tdx, tdz) || 1, arrive = b.path.length === 1 && d < BOT_WALK.arrive ? BOT_WALK.slow + (1 - BOT_WALK.slow) * d / BOT_WALK.arrive : 1;
      dx = tdx / td * arrive; dz = tdz / td * arrive;
      // (running in at someone with a gun with only a blade: side to side as it comes, hard to track: BOT_MELEE weave)
      if (b.weave && T) { const w = Math.sin(t * BOT_MELEE.weave[0] + b.seed) * BOT_MELEE.weave[1], px = dz, pz = -dx; dx += px * w; dz += pz * w; }
    }
  } else if (fighting) {
    const ex = T.x - b.x, ez = T.z - b.z, d = Math.hypot(ex, ez) || 1;
    if (b.mv === 'melee') {
      // (hand to hand: in or out to the distance it wants (b.mWant), circling them as it does, b.strafe its way round)
      const rad = clamp((d - (b.mWant ?? 1.5)) * 2.2, -1, 1), tang = (b.strafe || 1) * (b.mCirc ?? 0.5);
      dx = ex / d * rad + ez / d * tang; dz = ez / d * rad - ex / d * tang;
      if (!botWalk(ci(b.x + dx * 0.7), ci(b.z + dz * 0.7))) { b.strafe = -(b.strafe || 1); dx = ex / d * rad; dz = ez / d * rad; }
    } else if (b.mv === 'strafe') {
      // (a veteran cuts back the other way often and unevenly, BOT_SKILL dodge: hard to lead)
      const S = botSk(b); if (S.dodge && t > (b.dodgeT || 0)) { b.dodgeT = t + rr(...S.dodge); if (rand() < 0.8) b.strafe = -(b.strafe || 1); }
      dx = ez / d * b.strafe; dz = -ex / d * b.strafe;
      if (!botWalk(ci(b.x + dx * 0.7), ci(b.z + dz * 0.7))) { b.strafe = -b.strafe; dx = -dx; dz = -dz; }
    } else if (b.mv === 'back') { dx = -ex / d; dz = -ez / d; if (!botWalk(ci(b.x + dx * 0.7), ci(b.z + dz * 0.7))) { dx = dz = 0; b.mv = 'strafe'; b.strafe = 1; } }
  }
  // keeping off everyone else
  const near = [[P.x, P.z, P.dead], ...[...NET.peers.values()].map(q => { const o = BOTS.get(q.id); return o ? [o.x, o.z, o.dead, o === b] : [q.x, q.z, q.dead]; })];
  for (const [ox, oz, dead, self] of near) { if (dead || self || ox === undefined) continue; const ex = b.x - ox, ez = b.z - oz, d = Math.hypot(ex, ez); if (d < 0.75 && d > 1e-3) { dx += ex / d * (0.75 - d) * 2; dz += ez / d * (0.75 - d) * 2; } }
  // getting somewhere fast, nobody in sight or known close: its melee weapon out to run with (lighter than any gun, as
  // yours is), its gun back out once it's somewhere, someone's in sight or it's near where someone was; and never a
  // sprint with the LMG in its hands (you can't either: player/sprint.js)
  botRunMelee(b, t);
  if (b.sprint && botGunOf(b) === 'lmg') b.sprint = false;
  // (down its sights only where a fight's on or coming, BOT_ADS; swinging wide out, at full pace till it's on them)
  const Lk = botKnown(b, t), aimed = !b.sprint && !(b.state === 'peek' && b.swing && !b.vis) && (!!b.vis || (/fight|peek|cover|hold/.test(b.state) && !(b.path.length > 2)) || !!(Lk && t - Lk.t < BOT_ADS.fresh && Math.hypot(Lk.x - b.x, Lk.z - b.z) < BOT_ADS.near));
  if (b.sprint && !(dx || dz)) b.sprint = false;
  b.tag = Math.max(0, (b.tag || 0) - dt * BOT_TAG.wear);   // (slowed by a hit, as a player is: pvp/pvp.js PVP_TAG)
  // (its sprint coming up as yours does, player/sprint.js: some of it at once, the rest over a moment)
  b.runUp = b.sprint ? Math.min(1, (b.runUp || 0) + dt / SPRINT.build) : Math.max(0, (b.runUp || 0) - dt * SPRINT.fade);
  const runK = SPRINT.kick + (1 - SPRINT.kick) * (1 - (1 - b.runUp) * (1 - b.runUp));
  const gid = botGunOf(b), sp = BOT_MOVE.base * (b.pace || 1) * botCarry(b, gid) * (b.mswing ? BOT_MELEE.swingPace : 1) * (b.sprint ? 1 + (BOT_MOVE.sprint - 1) * runK : aimed && !(WEAP[gid] || {}).melee ? botAds(b, gid) : 1) * (b.reloading ? 0.85 : 1) * (1 - 0.72 * b.tag) * (1 - (1 - CROUCH.pace) * botCrK(b));   // (crouched, slower, as you are)
  const L = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * 9), tvx = L > 1e-3 ? dx / Math.max(1, L) * sp : 0, tvz = L > 1e-3 ? dz / Math.max(1, L) * sp : 0;
  b.vx += (tvx - b.vx) * k; b.vz += (tvz - b.vz) * k;
  const x0 = b.x, z0 = b.z;
  moveCircle(b, b.vx * dt, b.vz * dt, 0.3, false);
  // stuck on something: a new way there
  if (L > 0.2 && Math.hypot(b.x - x0, b.z - z0) < sp * dt * 0.2) { if ((b.stuck += dt) > 0.7) { b.stuck = 0; b.path = []; b.mvT = 0; if (b.state === 'roam' || b.state === 'hunt' || b.state === 'flank') b.state = 'roam'; } } else b.stuck = 0;
}
function botRunMelee(b, t) {
  if (!b.slots || !b.slots.melee || b.swapT > 0 || b.reloading || !botCls(b).guns.length || b.knife) return;   // (nothing but a blade, or it's out to fight with: BOT_MELEE)
  const L = botKnown(b, t), near = L && t - L.t < 8 && Math.hypot(L.x - b.x, L.z - b.z) < BOT_MELEE_RUN.near;
  const far = b.path.length > BOT_MELEE_RUN.path && b.sprint && !b.vis && !near;
  if (far && b.cur !== 'melee' && t > (b.meleeT || 0)) { b.gunBack = b.cur; b.cur = 'melee'; b.swapT = BOT_MELEE_RUN.swap; b.burst = 0; b.meleeT = t + 1; }
  else if (b.cur === 'melee' && (b.vis || near || !b.sprint || b.path.length < BOT_MELEE_RUN.done)) { b.cur = b.gunBack && b.slots[b.gunBack] ? b.gunBack : WEAP[(botCls(b).guns[0] || [])[0]] ? WEAP[botCls(b).guns[0][0]].slot : 'side'; b.swapT = BOT_MELEE_RUN.swap + 0.1; b.meleeT = t + 1.5; }
}
// its melee weapon out to run (botRunMelee): over this many steps of path still to go, nobody known within near (m),
// back to its gun with under done steps left; how long each swap takes (s)
const BOT_MELEE_RUN = { path: 9, near: 16, done: 4, swap: 0.35 };
// walking a path as a person does (botMove): within corner (m) of a point it's already turning toward the next, by up
// to round of the way; within arrive of the end it eases off, to slow of its pace; and each bot its own pace (b.pace)
const BOT_WALK = { corner: 1.6, round: 0.55, arrive: 1.4, slow: 0.4, pause: 0.06 };
// lying low hurt in Showdown (botThink): under hp, and how long before it moves on anyway (t, s)
const BOT_LOW = { hp: 28, t: [2, 3.5] };
// prefiring (botGun, botPrefire): the one it was fighting gone behind something, it holds hold s with its gun on where
// they went and, as likely as it's good (BOT_SKILL pre), fires shots rounds there wait s on (or at once, hearing them
// within near m of it), as they're likely back out: for len s at most, never past reach m, never through a wall
const BOT_PRE = { len: 2.6, hold: [0.55, 1.05], wait: [0.3, 0.8], shots: [2, 4], near: 3.5, reach: 30 };
// hit (botNote, botAimStep): for len s from the moment it knows where from, it turns on them k times as fast as it
// otherwise could and its aim pulls on gain times as hard, still speeding up into it and easing off onto them
const BOT_FLICK = { len: 0.9, k: 1.7, gain: 1.5 };
// down its sights on the move (botMove), slowed as you are: only fighting, peeking or in cover, or with someone it
// knows of within near (m) in the last fresh s; otherwise it walks (and runs) at full pace
const BOT_ADS = { near: 12, fresh: 5 };
// somewhere worth looking, standing about: the way that's most open (furthest to the first wall), off the way it faces
// by up to about a right angle either side, never at the wall in front of it
function botOpenLook(b) {
  let best = b.aim, bd = -1;
  for (let k = 0; k < 9; k++) {
    const a = b.aim + (k - 4) * 0.4 + rr(-0.12, 0.12); let d = 0.6;
    while (d < 22 && !bulletBlocked(b.x + Math.sin(a) * d, b.z + Math.cos(a) * d)) d += 0.6;
    const s = d - Math.abs(k - 4) * 0.8 + rr(0, 2); if (s > bd) { bd = s; best = a; }
  }
  return best;
}
// where it looks: at whoever it's fighting (its aim settling onto them), else where it's running, at the last place it
// knew of someone, toward a noise, or about it botNow and then
function botAimStep(b, dt, t, T) {
  const S = botSk(b); let want = b.aim, ready = false;
  b.err *= Math.exp(-dt * S.settle); if (t - (b.lastShotT ?? -9) > BOT_ACC.off) b.spray = Math.max(0, b.spray - dt * BOT_ACC.recover);
  // (just hit, BOT_FLICK: once it knows where from, it whips round on whoever did it, or onto them if it can see them)
  const flick = b.flinchAt !== undefined && t >= b.flinchAt && t < b.flinchAt + BOT_FLICK.len && (!T || (b.last && T.id === b.last.id));
  const q = b.pre && t < b.pre.until && b.pre.n > 0 ? b.pre : null;
  // (someone on the move led, the better it is the more: BOT_SKILL lead)
  if (T) want = Math.atan2(T.x + T.vx * S.lead - b.x, T.z + T.vz * S.lead - b.z) + b.err + Math.sin(t * 2.3 + b.seed) * S.wob;
  else if (b.alarm !== undefined && (flick || t >= (b.flinchAt ?? -9) + BOT_FLICK.len || t - (b.shotAtT ?? -9) > BOT_FLICK.len)) {
    // (toward the noise, or with a wall that way, at the way round it they'd come from)
    if (b.alarmA === undefined || b.alarmFor !== b.alarm) { b.alarmFor = b.alarm; b.alarmA = botWallAt(b, b.alarm, BOT_AIMPRE.wall) ? botPreAim(b, b.alarm, t, BOT_AIMPRE.arcL, b.alarm) : b.alarm; }
    want = b.alarmA; if (Math.abs(angDiff(want, b.aim)) < 0.1) b.alarm = undefined;
  }
  else if (q) { want = Math.atan2(q.x - b.x, q.z - b.z); ready = true; }   // (on the corner it's waiting to prefire)
  else if (b.state === 'angle' && b.ang && !b.path.length) { want = b.ang.a; ready = true; }   // (its gun on the angle it's holding: BOT_ANGLE)
  else if (b.state === 'tbag' && b.tbag) want = Math.atan2(b.tbag.x - b.x, b.tbag.z - b.z) + Math.sin(t * 1.7 + b.seed) * 0.3;   // (down at the body)
  else {
    // (where it's going: a little way on along its path, not the way it's moving this instant, which every step round
    // a corner or off someone else swings about)
    const L = botKnown(b, t), on = b.path.length ? b.path[Math.min(1, b.path.length - 1)] : null;
    const mv = on && Math.hypot(on[0] - b.x, on[1] - b.z) > 0.4 ? Math.atan2(on[0] - b.x, on[1] - b.z) : Math.hypot(b.vx, b.vz) > 0.5 ? Math.atan2(b.vx, b.vz) : null;
    const watch = L && t - L.t < (L.threat ? 20 : 8) && (b.state === 'hold' || b.state === 'cover' || b.state === 'peek' || b.state === 'search' || Math.hypot(L.x - b.x, L.z - b.z) < (L.threat ? 20 : 14)) ? L : null;
    if (b.sprint && mv !== null) want = mv;
    else if (watch || mv !== null) {
      // (pre-aimed, BOT_AIMPRE: at someone it knows of, straight at them if it has a line to where they are, else at the
      // edge they'd come round; on the move, at the likeliest angle someone could come from ahead of it)
      if (t > (b.preT || 0) || b.preL !== (watch ? watch.id : '') || (b.preA != null && botWallAt(b, b.preA, BOT_LOOK.clear))) {
        b.preT = t + rr(...BOT_AIMPRE.every); b.preL = watch ? watch.id : '';
        const aL = watch && Math.atan2(watch.x - b.x, watch.z - b.z);
        b.preA = watch ? (los(b.x, b.z, watch.x, watch.z) ? null : botPreAim(b, aL, t, BOT_AIMPRE.arcL, aL)) : botPreAim(b, mv, t, BOT_AIMPRE.arc);
      }
      want = watch && b.preA === null ? Math.atan2(watch.x - b.x, watch.z - b.z) : b.preA ?? mv ?? b.aim; ready = true;
      // (walking somewhere, it never looks back over its shoulder for long: unless it's in a fight just now or holding
      // a spot, its aim stays within BOT_BACKPEDAL.max of the way it's going, so it doesn't walk backwards down a lane)
      if (mv !== null && !BOT_BACKPEDAL.hold.includes(b.state) && !(watch && t - watch.t < BOT_BACKPEDAL.fresh)) { const d = angDiff(want, mv); if (Math.abs(d) > BOT_BACKPEDAL.max) want = mv + Math.sign(d) * BOT_BACKPEDAL.max; }
    }
    else { if (t > b.glanceT) { b.glanceT = t + rr(...BOT_LOOK.glance); b.look = botOpenLook(b); } want = b.look; }
  }
  // (what it wants to look at eased onto, off a target: nothing it hears or passes jerks its view across; but hit, it
  // goes straight for whoever did it)
  if (T || flick || b.lookW === undefined) b.lookW = want; else { b.lookW += angDiff(want, b.lookW) * (1 - Math.exp(-dt * BOT_LOOK.ease)); want = b.lookW; }
  // (turning as a hand on a mouse does: speeding up toward it and easing off as it gets there, never a snap; its gain
  // and how quick its turning follows by how good it is, BOT_SKILL track, harder still whipping round on a hit)
  const fk = flick ? BOT_FLICK.gain : 1, da = angDiff(want, b.aim), top = S.turn * (flick ? BOT_FLICK.k : T ? 1 : BOT_LOOK.idle), wv = clamp(da * (T || flick ? S.track[0] * fk : BOT_LOOK.gain), -top, top);
  b.av += (wv - b.av) * (1 - Math.exp(-dt * (T || flick ? S.track[1] * fk : BOT_LOOK.follow))); b.aim += b.av * dt;
  // and up or down: onto the part of them it's aiming at, else a little down ahead of it as it goes, eased the same way
  // (gun up at head height on an angle it's pre-aimed)
  const wp = T ? Math.atan2(BOT_PART_Y[b.aimPart || 'torso'] - BOT_EYE, Math.max(1, Math.hypot(T.x - b.x, T.z - b.z))) : b.sprint ? -0.12 : ready ? -0.01 : b.state === 'tbag' ? -0.6 : b.insp ? -0.05 - 0.3 * b.insp.w : -0.05 + Math.sin(t * 0.5 + b.seed) * 0.03;
  b.pitch = (b.pitch || 0) + (wp - (b.pitch || 0)) * (1 - Math.exp(-dt * 5));
}
// how it looks about off a fight: a noise turned to only BOT_LOOK.alarm s after the last, a new way to look idle every
// glance s, what it wants eased onto (ease, per s), turning no faster than idle of its top speed, its aim pulled on by
// gain and its turning following by follow (per s); and a look that's come to have a wall within clear (m) of it, as
// it walks on, given up for a new one at once
const BOT_LOOK = { alarm: 1.2, glance: [2, 4], ease: 6, idle: 0.8, gain: 4.5, follow: 5.5, clear: 2 };
// its gun: switching, reloading, and firing while someone's in its sights (after a moment to react, once its aim's
// on them, in the gun's reach): short bursts at range, longer ones close in, single aimed shots from the rest
function botGun(b, dt, t, foes) {
  if (b.swapT > 0) { b.swapT -= dt; return; }
  // (its guard: worn down while it's held past a moment, coming back while it isn't; and only with a melee weapon out)
  { const D0 = WEAP[botGunOf(b)]; if (b.block && (!D0 || !D0.melee || b.dead || b.mswing || b.stun > 0)) b.block = false;
    if (b.block) { if (performance.now() / 1000 - b.blockAt > BLK.hold) b.gst = Math.max(0, (b.gst ?? 1) - BOT_GUARD.drain * dt); }
    else b.gst = Math.min(1, (b.gst ?? 1) + BOT_GUARD.back * dt); }
  const id = botGunOf(b), D = WEAP[id]; if (D && D.melee) { botMeleeStep(b, t, foes); return; } if (!D) return;   // (a blade swung, landing or not: botMeleeStep; its melee out to run with: botRunMelee puts its gun back)
  // (reloaded in cover: straight back out at them, BOT_COVER)
  if (b.reloading) { if ((b.relT -= dt) <= 0) { const n = Math.min(botCap(b, id) - b.mag[id], b.res[id]); b.mag[id] += n; b.res[id] -= n; b.reloading = false; if (b.state === 'cover') b.peekAt = Math.min(b.peekAt || 0, t + botPk(b, BOT_COVER.repeek)); } return; }
  b.cd -= dt;
  const T = b.vis, S = botSk(b); if (!T) { botPrefire(b, t, id, D, foes); return; }
  if (t < b.react || b.noFire || b.sprint) return;
  const d = Math.hypot(T.x - b.x, T.z - b.z);
  if (d > (BOT_REACH[id] || 25) * (S.reach || 1)) return;
  b.hipT = d < BOT_HIP.near || (D.ammo === 'shells' && d < BOT_HIP.shells) ? t + 0.6 : b.hipT;   // (close in, from the hip: botPose)
  if (Math.abs(angDiff(Math.atan2(T.x - b.x, T.z - b.z), b.aim)) > S.gate + PVP_R / Math.max(1, d)) return;
  if (b.mag[id] <= 0) {
    // (empty with them in front of it: its sidearm out, quicker than a reload, if they're close or hurt and in its
    // reach; its main gun's loaded once the fight's done, botThink)
    const sd = b.slots.side;
    if (b.cur !== 'side' && sd && b.mag[sd] > 0 && (d < BOT_SIDE.near || botWeak(b, T.id, t)) && d < (BOT_REACH[sd] || 25) * BOT_SIDE.reach) { b.cur = 'side'; b.swapT = botCls(b).perks.includes('Quick draw') ? BOT_SIDE.quick : BOT_SIDE.swap; b.burst = 0; return; }
    botReload(b); return;
  }
  if (b.cd > 0) return;
  const auto = botAuto(id, D) && !(D.pellets && d > BOT_BURST.sgMidD);
  if (auto) {
    // (the trigger held, BOT_BURST: right down close in, shorter the further, a few taps far off; and the breath between
    // bursts long enough for its kick to settle, the more it had walked off the longer)
    if (b.burst <= 0) { botAimPart(b); const B = BOT_BURST, r = D.pellets ? (d < B.sgCloseD ? B.sgClose : B.sgMid) : d < B.closeD ? B.close : d < B.midD ? B.mid : d < B.tapD ? B.far : B.tap; b.burst = Math.round(rr(...r)); }
    b.burst--; b.cd = b.burst > 0 ? D.rate : rr(...BOT_BURST.rest) + b.spray * BOT_BURST.reset;
  } else b.cd = Math.max(D.rate, (id === 'hunting' ? D.rate + rr(0.1, 0.4) : id === 'dbl' ? rr(0.14, 0.3) : rr(0.18, 0.32) + D.rate * 0.4) * S.tap);
  botShoot(b, id, D, foes, d);
}
// its sidearm out for an empty main gun mid-fight (botGun): someone within near (m), or hurt, within reach of the
// sidearm's own reach; how long the swap takes (s, quick with Quick draw)
const BOT_SIDE = { near: 12, reach: 0.8, swap: 0.35, quick: 0.25 };
// prefiring (BOT_PRE): nobody in sight, and a corner it's got its gun on where someone it was fighting went: a few
// rounds there once it's waited, or at once if it heard them right by it, with a clear line to the spot and its aim on
// it; never more than its few, then its finger's off till the next
function botPrefire(b, t, id, D, foes) {
  const q = b.pre; if (!q || !(q.n > 0) || t > q.until || b.sprint || b.noFire || b.cd > 0 || (t < q.at && !q.go)) return;
  if (b.mag[id] <= q.n) { q.n = 0; return; }
  const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < 1.5 || d > Math.min(BOT_PRE.reach * (botSk(b).reach || 1), (BOT_REACH[id] || 25) * (botSk(b).reach || 1))) { q.n = 0; return; }
  if (Math.abs(angDiff(Math.atan2(q.x - b.x, q.z - b.z), b.aim)) > 0.05 + PVP_R / Math.max(1, d) || !los(b.x, b.z, q.x, q.z)) return;
  q.n--; b.cd = D.rate < 0.12 && !D.pellets ? D.rate * 1.3 : Math.max(D.rate, rr(0.2, 0.3));
  botShoot(b, id, D, foes, d);
}
// a shot: each round (or pellet) along where it's aiming, off by how steady it is, stopping at the first wall; anyone
// on that line takes it as a player's would (pvp/pvp.js: by where it lands, a head double, low cover keeping most of a
// body out of it), and everyone sees and hears it
function botShoot(b, id, D, foes, d) {
  const S = botSk(b), pel = D.pellets || 1, shells = D.ammo === 'shells', gt = b.gt[id] || {};
  b.mag[id]--; b.st.shots++;
  const moving = Math.hypot(b.vx, b.vz), T = b.vis, tv = T ? Math.hypot(T.vx, T.vz) : 0;
  const sig = (S.sig + (pel > 1 ? 0 : ((D.spread || 0.03) * 0.5 + (botNow() < (b.hipT || 0) ? BOT_HIP.spread : 0)) * (S.gunK ?? 1)) + moving * BOT_ACC.move * (S.mvK ?? 1) + (b.sprint ? BOT_ACC.sprint : 0) + b.spray + Math.min(BOT_LEAD.max, tv * BOT_LEAD.k) * S.leadK
    + Math.max(0, d - BOT_ACC.near) * BOT_ACC.far * (S.farK ?? 1) + (D.kick || 1) * BOT_ACC.kick * (S.gunK ?? 1)
    + (BOT_FAIR.warm[botSkIdx(b)] || 0) * Math.exp(-(botNow() - (b.acqT ?? -9)) / BOT_FAIR.warmT)) * (1 + BOT_FAIR.sig * (T ? botFair(b, T.id) : 0)) * botSight(gt.sight || 0, d) * (1 - (1 - CROUCH.spread) * botCrK(b));   // (crouched, steadier, as you are)
  // (its first shots after a breath steadier: BOT_ACC first)
  const t = botNow(); if (t - (b.lastShotT ?? -9) > BOT_ACC.rested) b.firstN = 0; b.lastShotT = t;
  const common = botGauss() * sig * (b.firstN++ < BOT_ACC.first ? BOT_ACC.firstK : 1); b.spray = Math.min(BOT_ACC.sprayMax, b.spray + (BOT_ACC.spray0 + (D.kick || 1) * BOT_ACC.sprayKick) * S.ctrl);   // (a kicking gun's held trigger walking off further, the less so the better it is)
  const E = botEye(b), ox = E[0] + Math.sin(b.aim) * 0.55, oz = E[1] + Math.cos(b.aim) * 0.55, oy = 1.36 - CROUCH.drop * botCrK(b), on = new Map(), ends = [];
  const fire = b.rd && b.rd[id] === 'fire', reachT = fire ? DRAGON_MAX : 70;   // (dragon's breath: nothing past DRAGON_MAX, weapons/rounds.js)
  for (let k = 0; k < pel; k++) {
    const a = b.aim + common + (pel > 1 ? (rand() * 2 - 1) * D.spread * (gt.choke ? 0.8 : 1) * 0.85 : 0), dx = Math.sin(a), dz = Math.cos(a);
    let wallT = 70; for (let s = 0.3; s < 70; s += 0.08) { const x = ox + dx * s, z = oz + dz * s; if (bulletBlocked(x, z) || !inb(ci(x), ci(z))) { wallT = s; break; } }
    let hit = null, ht = wallT, rel = 0;
    for (const f of foes) { const vx = f.x - ox, vz = f.z - oz, tt = vx * dx + vz * dz, off = vx * dz - vz * dx; if (tt > 0.2 && tt < ht && tt < reachT && off * off < PVP_R * PVP_R) { hit = f; ht = tt; rel = off / PVP_R; } }
    let endK = wallT < 70 ? 1 : 3, ey = oy + rr(-0.2, 0.05);
    if (hit) {
      const r = rand(), ap = b.aimPart || 'torso', head = ap === 'head' ? S.hs ?? Math.min(0.5, S.head * 3.2) : S.head * 0.6, legs = ap === 'legs' ? 0.55 : 0.18;
      const part = r < head ? 'head' : r < head + legs ? (rel > 0 ? 'legR' : 'legL') : r < head + legs + 0.18 ? (rel > 0 ? 'armR' : 'armL') : 'torso';   // (where it's aiming: botAimPart)
      // into the cover in front of them (all of it, from someone crouched down behind it: BOT_CROUCH)
      if (pvpCovered(hit.x, hit.z, ox, oz, dx, dz, ht) && ((hit.cr || 0) > BOT_CROUCH.down || (part !== 'head' && !part.startsWith('arm')))) { ht = Math.max(0.3, ht - 0.9); endK = 1; }
      else {
        const s = on.get(hit) || { d: 0, n: 0, head: false, part, top: 0 }, dm = b.gold && b.gold[id] ? GG_ONE : (PVP_DMG[id] || 20) * PVP_TTK * pvpFalloff(id, ht) * pvpPartK(id, part, ht);   // (the golden revolver: any hit kills)
        s.d += fire ? dm * BOT_FIRE.dmg : dm; s.n++; if (part === 'head') s.head = true; if (dm > s.top) { s.top = dm; s.part = part; } if (fire && !s.fp) s.fp = part; on.set(hit, s);
        endK = 0; ey = part === 'head' ? 1.62 : part.startsWith('leg') ? 0.5 : 1.15;
      }
    }
    arBoxShot(ox, ey, oz, dx, 0, dz, hit ? ht : Math.min(wallT, 70), false, false);   // (a box on shelving it passes through knocked off on the way, world/arena-boxes.js)
    if (ends.length < 5 && (k < 4 || rand() < 0.5)) ends.push([bR3(ox + dx * ht), bR3(ey), bR3(oz + dz * ht), endK, pel > 2 ? 0.045 : 0.08]);
  }
  if (on.size) b.st.hits++;
  for (const [f, s] of on) botDeal(b, f, Math.round(s.d), s.head ? 'head' : s.part, id, shells ? s.n >= 3 && rand() < PVP_BLEED.shells : rand() < PVP_BLEED.gun, s.fp ? { fi: 1, fp: s.fp } : null);
  const quiet = !!gt.supp, m = { w: id, q: quiet ? 1 : 0, x: bR3(ox), y: oy, z: bR3(oz), e: ends, st: quiet ? 'supp' : 'std', pw: bR3(tracerPower(D)), sh: shells ? 1 : 0, dr: 0 };
  NET_ON.shot(Object.assign({ t: 'shot', f: b.id }, m)); netAs(b.id, 'shot', m);
  botsHear(b.id, ox, oz, quiet, ends);
}
// the gun it hit someone with, as the kill feed draws it (pvp/pvp.js): its attachments, mods and their levels; 0 for a blade
function botKit(b, w) { const D = WEAP[w], gl = b.lo && b.lo.guns[w]; return !D || D.melee || !gl ? 0 : [gl.gt, gl.mods, gl.lv]; }
// what a shot did to someone: you take it here, another player's game is told, another bot takes it at once
// (ex: a melee blow's stagger, st, and shove back, kb, the way it went, kx, kz; gd, a golden weapon's)
function botDeal(b, f, d, part, w, bleed, ex) {
  if (d <= 0 && !(ex && ex.gk)) return;
  b.st.dmg += d; if (part === 'head') b.st.hs++;
  // (what it's put into them lately, which it knows as you do from your hits: someone hurt to finish, BOT_FINISH)
  const t = botNow(), e = b.dealt.get(f.id); b.dealt.set(f.id, { d: (e && t - e.t < BOT_FINISH.mem ? e.d : 0) + d, t });
  const m = { d, p: part, w, x: bR2(b.x), z: bR2(b.z), b: bleed ? 1 : 0, g: botKit(b, w) };
  if (ex) { if (ex.gk) { m.gk = ex.gk; m.bd = ex.bd; } if (ex.st) m.st = ex.st; if (ex.kb) { m.kb = ex.kb; m.kx = bR2(ex.kx); m.kz = bR2(ex.kz); } if (ex.gd) m.gd = 1; if (ex.fi) { m.fi = 1; m.fp = ex.fp; } }
  else if (b.gold && b.gold[w]) m.gd = 1;
  if (f.id === NET.id) NET_ON.ph(Object.assign({ t: 'ph', f: b.id, to: NET.id }, m));
  else if (BOTS.has(f.id)) botHit(f.id, Object.assign({ f: b.id }, m));
  else netAs(b.id, 'ph', Object.assign({ to: f.id }, m), f.id);
}
// a bot hit (by anyone: pvp/pvp.js pvpSend for your shots, NET_BOT.ph for another player's): it bleeds on everyone's
// screen, knows roughly where that came from, and goes down at nothing left
export function botHit(id, m) {
  const b = BOTS.get(id), t = botNow(); if (!b || b.dead || PVP.ph !== 'live' || b.prot > 0) return;
  b.hp -= m.d;
  // (on its guard, melee/block.js: a parry costs it nothing; a block lets a share through and wears its guard down,
  // and with the last of it the guard's broken. No blood either way: the attacker's drawn the sparks)
  if (m.gk) {
    if (m.gk === 'b') { b.gst = (b.gst ?? 1) - guardCost(m.bd || m.d); if (b.gst <= 0) { b.block = false; b.gst = 0; b.guardCd = t + BLK.broke; b.stun = Math.max(b.stun || 0, BLK.brokeStun); } }
    if (m.kb) { b.vx = (m.kx || 0) * m.kb; b.vz = (m.kz || 0) * m.kb; }
    if (m.d > 0) { b.last = { id: m.f, w: m.w, head: false, d: m.d, at: t, x: m.x, z: m.z, pt: 'torso', g: 0, gd: 0, fi: 0 }; b.taken.set(m.f, (b.taken.get(m.f) || 0) + m.d); b.hurtT = t; b.calm = 0; b.regen0 = null; if (b.hp <= 0) botDie(b, t); }
    return;
  }
  // (a blow landing on it mid-swing breaks its swing off before it lands, and holds the next off a moment)
  if ((WEAP[m.w] || {}).melee && b.mswing && !b.mswing.hit) { b.mswing = null; b.mcd = Math.max(b.mcd || 0, t + BLK.lock); }
  b.block = false;
  b.tag = Math.max(b.tag || 0, Math.min(BOT_TAG.most, BOT_TAG.base + m.d * BOT_TAG.per)); b.sprint = false; b.tbag = null; botInspCut(b);
  if (botSk(b).sharp && b.vis) b.mvT = 0;   // (a veteran tagged thinks again at once: out of the open, botThink)
  if (b.lpeek || b.qpk || b.state === 'peek') b.rechal = true;   // (hit peeking: next time from somewhere else)
  b.last = { id: m.f, w: m.w, head: m.p === 'head', d: m.d, at: t, x: m.x, z: m.z, pt: m.p, g: m.g ?? 0, gd: m.gd ? 1 : 0, fi: m.fi ? 1 : 0 };
  if (m.st) { b.stun = Math.max(b.stun || 0, m.st); b.mswing = null; }   // (staggered by a heavy blow: its own swing broken off, pvp/pvp.js PVP_MELEE)
  if (m.kb) { b.vx = (m.kx || 0) * m.kb; b.vz = (m.kz || 0) * m.kb; }
  b.taken.set(m.f, (b.taken.get(m.f) || 0) + m.d);   // (who's put what into it this life: its assists, botDie)
  b.hurtT = t; b.calm = 0; b.regen0 = null; botNote(b, m.f, m.x, m.z, 1.5, t, true);
  botHeatAdd(b.side, m.x, m.z, BOT_ANGLE.shot);   // (shot from there: BOT_HEAT)
  // (a Terminator remembers where it stood and which way it was shot from there, and never peeks that angle from
  // there again: BOT_BURN)
  if (botSk(b).burn) { b.burn.push({ x: b.x, z: b.z, a: Math.atan2(m.x - b.x, m.z - b.z) }); if (b.burn.length > BOT_BURN.keep) b.burn.shift(); }
  // (a lot of it, fast, BOT_HURT: it breaks off, backs out of it and goes somewhere else to fight from)
  b.hurtSum = (t - (b.hurtSumT || -9) < BOT_HURT.window ? b.hurtSum || 0 : 0) + m.d; b.hurtSumT = t;
  if (b.hurtSum >= BOT_HURT.much && b.hp > 0) { b.hurtSum = 0; b.relocate = t; }
  const dx = b.x - m.x, dz = b.z - m.z, L = Math.hypot(dx, dz) || 1, pb = { x: bR2(b.x), z: bR2(b.z), dx: bR2(dx / L), dz: bR2(dz / L), h: m.p === 'head' ? 1 : 0, sh: m.f, d: m.d, gd: m.gd ? 1 : 0 };
  if ((WEAP[m.w] || {}).melee) pb.w = m.w;   // (a blow: bled and heard as one, pvp/pvp.js NET_ON.pb)
  NET_ON.pb(Object.assign({ t: 'pb', f: b.id }, pb)); netAs(b.id, 'pb', pb);
  if (b.hp <= 0) botDie(b, t); else if (m.fi) botIgnite(b, m);
}
// ---- on fire (dragon's breath: pvp/pvp-fire.js), burning as you do, the host's game telling everyone. BOT_FIRE: how
// how much of buckshot's damage it does
const BOT_FIRE = { dmg: 0.8 };
function botIgnite(b, m) {
  const fresh = !b.fire, t = botNow(); b.fire = fireLight(b.fire, m.fp || m.p, m.f, m.w, m.g); b.p.fire = b.fire;
  if (fresh || t - (b.fireSent ?? -9) > PFIRE.resend) { b.fireSent = t; netAs(b.id, 'pf', { p: b.fire.from, t: PFIRE.len, by: m.f }); }
}
function botFireOut(b) { if (!b.fire) return; b.fire = null; b.p.fire = null; netAs(b.id, 'pf', { t: 0 }); }
// its ticks: off its health, nothing back while it burns, and a burn that finishes it is whoever lit it's kill. True if it did
function botBurn(b, dt, t) {
  const F = b.fire; if (!F) return false;
  const n = fireStep(F, dt), d = PFIRE.dmg;
  for (let i = 0; i < n; i++) {
    b.hp -= d; b.calm = 0; b.regen0 = null; b.taken.set(F.by, (b.taken.get(F.by) || 0) + d);
    if (F.by === NET.id) pvpBurnNum(b.p, d); else { const o = BOTS.get(F.by); if (o) o.st.dmg += d; }
    const L = b.last && b.last.id === F.by ? b.last : null;
    b.last = { id: F.by, w: F.w, head: false, d, at: t, x: L ? L.x : b.x, z: L ? L.z : b.z, pt: L ? L.pt : 'torso', g: F.g ?? (L ? L.g : 0) ?? 0, gd: 0, fi: 1 };
    if (b.hp <= 0) { botDie(b, t); return true; }
  }
  if (F.t <= 0) botFireOut(b);
  return false;
}
NET_BOT.ph = m => botHit(m.to, m);
// shoved (pvp/pvp.js pvpShove, or another player's 'pv'): thrown back, reeling, its aim knocked off
export function botShoved(id, m) {
  const b = BOTS.get(id); if (!b || b.dead || PVP.ph !== 'live' || b.prot > 0) return;
  const k = m.p || 1; b.stun = 0.7 * k; b.vx = m.dx * 5 * k; b.vz = m.dz * 5 * k; b.av += rr(-4, 4); b.err += rr(0.2, 0.35) * (rand() < 0.5 ? -1 : 1); b.burst = 0; b.sprint = false;
}
NET_BOT.pv = m => botShoved(m.to, m);
const BOT_ASSIST = 30;   // (damage, hp, someone else has to have done to a bot in a life to count for its kill)
function botDie(b, t) {
  botFireOut(b);
  b.dead = true; b.hp = 0; b.reloading = false; b.vx = b.vz = 0; b.path = [];
  const L = b.last && t - b.last.at < 8 ? b.last : null;
  // (with the killer's gun as it was, and up to two who helped: anyone else who'd put BOT_ASSIST into it this life, most first)
  const as = [...b.taken].filter(([id, d]) => d >= BOT_ASSIST && (!L || id !== L.id)).sort((a, c) => c[1] - a[1]).slice(0, 2).map(e => e[0]);
  const m = { k: L ? L.id : '', v: b.id, w: L ? L.w : '', hs: L && L.head ? 1 : 0, hb: L && L.head && L.d >= 60 ? 1 : 0, x: bR2(b.x), z: bR2(b.z), dm: L ? Math.round(Math.hypot(b.x - L.x, b.z - L.z)) : 0, pt: L ? L.pt : '', g: L ? L.g ?? 0 : 0, as, gd: L && L.gd ? 1 : 0, fi: L && L.fi ? 1 : 0 };
  b.p.dead = true; botPose(b, 0, t, true);
  netSend('pk', m); pvpKilled(m);
  b.respawn = PVP_T.respawn;
  // its side's other bots hear it go down (as team players, BOT_SKILL team): they know roughly where the shot came from,
  // and those near enough go for whoever did it there and then, while they're still there and hurt from it (BOT_TRADE)
  if (L && PVP.mode !== 'ffa') for (const o of BOTS.values()) if (o !== b && !o.dead && o.side === b.side && rand() < botSk(o).team) {
    const x = L.x + rr(-2, 2), z = L.z + rr(-2, 2); o.mem.set(L.id, { id: L.id, x, z, t, seen: false, call: true, threat: true });
    if (Math.hypot(o.x - b.x, o.z - b.z) < BOT_TRADE.reach && !o.healing && o.hp > BOT_TRADE.minHp && !(o.vis && o.vis.id !== L.id)) o.trade = { id: L.id, x, z, until: t + BOT_TRADE.len };
  }
  // (and in Deathmatch everyone else hears that fight's over: the one who won it, hurt, to come in on: BOT_THIRD)
  if (L && PVP.mode === 'ffa' && L.id !== b.id) { const k = BOTS.get(L.id); botHot(k ? k.x : L.x, k ? k.z : L.z, t, L.id, true); }
  for (const o of BOTS.values()) if (o.dealt) o.dealt.delete(b.id);
  // Showdown: it learns. The lane it went down in it's less keen on next round, and going down early on the attack makes
  // it more careful (BOT_LEARN)
  if (PVP.mode === 'rounds') { b.learn.lane[b.lane ?? 1]++; if (PVP_T.round - PVP.t < BOT_LEARN.early && /hunt|rush|flank|fight/.test(b.state)) b.learn.bold = Math.max(-BOT_LEARN.most, b.learn.bold - BOT_LEARN.lose); }
  // dying a lot with its class (BOT_SWAP.deaths more deaths than kills with it): another, one that answers how it died
  // (shot from far off, the long-range ones; up close, the close-range ones)
  // (Brawl: another melee weapon after a few deaths with one, likelier the one that answers how it died: out-reached,
  // something longer; cut down fast, something quicker)
  if (PVP.rule === 'brawl') { const r = b.rec['m:' + b.mel] || (b.rec['m:' + b.mel] = { k: 0, d: 0 }); r.d++; if (r.d - r.k >= BOT_SWAP.deaths) { const kw = L && PVP_MELEE[L.w], opts = BRAWL_IDS.filter(id => id !== b.mel && (!kw || rand() < 0.4 || PVP_MELEE[id].range >= kw.range || PVP_MELEE[id].rate <= kw.rate)); b.mel = opts[Math.floor(rand() * opts.length)] || b.mel; } return; }
  if (PVP.rule) return;   // (Snipers only and Gun game: no classes to change)
  const rec = b.rec[b.cls] || (b.rec[b.cls] = { k: 0, d: 0 }); rec.d++;
  if (rec.d - rec.k >= BOT_SWAP.deaths) {
    const dm = m.dm || 12, pool = dm > BOT_SWAP.far ? ['mark', 'rifle', 'gunner', 'warden'] : dm < BOT_SWAP.near ? ['breach', 'rush', 'scav', 'raider'] : BOT_CLASS_IDS();
    const opts = pool.filter(c => c !== b.cls); b.cls = opts[Math.floor(rand() * opts.length)] || b.cls; b.rec[b.cls] = { k: 0, d: 0 };
  }
}

// ---- its body, as a player's pose (net/avatars.js): its legs through the stride (the one for how it's moving against
// where it aims, eased in from standing), its arms and gun aimed, from the hip or down at a sprint; to its own game
// every frame, to everyone else's fifteen times a second
// (the guns it has no recorded pose for, held as the nearest it has: the battle rifle as the assault rifle, the auto
// shotgun as the pump, the hand cannon as the revolver)
const BOT_POSE_AS = { scar: 'ar', auto12: 'pump', deagle: 'revolver' };
const BOT_PITCH_BODY = 0.85;   // (how much of its look up or down its upper body takes)
const BOT_ADS_HEAD = { down: 0.1, tip: 0.13 };   // (down the sights: its head down and tipped over onto the stock, rad, as yours: player/hold.js)
const BOT_HZ = 15, BOT_TAU = Math.PI * 2, BOT_LEAN = { tilt: 0.3, hip: 0.62, off: 0.5 };
// where its eyes are (x, z): over its middle, or leaned out to the side (botPose: b.lean), what it sees from and shoots
// from, round what it's behind
function botEye(b) {
  const l = (b.lean || 0) * BOT_LEAN.off; if (Math.abs(l) < 0.05) return [b.x, b.z];
  const x = b.x - Math.cos(b.aim) * l, z = b.z + Math.sin(b.aim) * l; return bulletBlocked(x, z) ? [b.x, b.z] : [x, z];
}
// which way to lean to see T round what it's behind: the side that sees them and the other doesn't, else neither
function botLeanSide(b, T) {
  const a = Math.atan2(T.x - b.x, T.z - b.z), rx = -Math.cos(a) * BOT_LEAN.off, rz = Math.sin(a) * BOT_LEAN.off;
  const r = los(b.x + rx, b.z + rz, T.x, T.z), l = los(b.x - rx, b.z - rz, T.x, T.z);
  return r && !l ? 1 : l && !r ? -1 : 0;
}
function botPose(b, dt, t, now_) {
  const id = botGunOf(b) || 'pistol', G = BOT_GUN[id] || BOT_GUN[BOT_POSE_AS[id]] || BOT_GUN.pistol, sp = Math.hypot(b.vx, b.vz);
  const run = b.sprint && sp > 3.2, fighting = !!b.vis || b.state !== 'roam';
  // (in cover with nobody in sight, its gun's tucked in to it, low, nothing of it out past what it's behind)
  const tuck = !b.vis && (b.state === 'cover' || b.state === 'hold') && !b.path.length;
  const upK = run ? 'run' : fighting && !b.reloading && !tuck && t >= (b.hipT || 0) && !(b.insp && b.insp.w > 0.05) ? 'aim' : 'hip';
  // (down the sights on someone, eased in and out: its head over onto the stock and its face screwed up to aim, as
  // yours, player/hold.js and player/look.js faceMood)
  b.adsK = (b.adsK || 0) + ((upK === 'aim' && b.vis && !b.dead ? 1 : 0) - (b.adsK || 0)) * (1 - Math.exp(-(dt || 0) * 10));
  const guard = !!b.block && !!G.bk && !b.dead;   // (its melee guard up, as yours is: melee/block.js)
  const up = guard ? G.bk : G[upK]; let w = guard ? G.bkw : G[upK === 'run' ? 'rw' : upK === 'aim' ? 'aw' : 'hw'];
  const mvA = Math.atan2(b.vx, b.vz), faceW = run && upK === 'run' ? mvA : b.aim;
  // (its body turned onto where it's facing, not snapped there: a corner taken at a run swings it round over a moment)
  b.faceS = b.faceS === undefined ? faceW : b.faceS + angDiff(faceW, b.faceS) * (1 - Math.exp(-(dt || 0) * 9)); const face = b.faceS;
  // the legs
  let legs = BOT_IDLE;
  if (sp > 0.15 && !b.dead) {
    const rel = angDiff(mvA, face), cyc = run ? BOT_CYC.find(c => c.k === 'run') : BOT_CYC.filter(c => c.k !== 'run').reduce((a, c) => Math.abs(angDiff(c.a, rel)) < Math.abs(angDiff(a.a, rel)) ? c : a);
    b.ph = (b.ph + sp * dt * cyc.r) % BOT_TAU;
    const f = b.ph / BOT_TAU * 8, i0 = Math.floor(f) % 8, i1 = (i0 + 1) % 8, u = f - Math.floor(f), A = cyc.f[i0], B = cyc.f[i1], k = clamp(sp / 1.4, 0, 1);
    legs = A.map((v, i) => BOT_IDLE[i] + ((v + (B[i] - v) * u) - BOT_IDLE[i]) * k);
    if (run && upK !== 'run') legs[7] = clamp(rel, -0.9, 0.9);   // (firing on the run: hips the way it's going, shoulders on its target)
  }
  const j = b.j || (b.j = new Array(70).fill(0));
  if (!b.dead || !b.jSet) {
    j[0] = bR3(b.x); j[2] = bR3(b.z); j[4] = bR2(face + BOT_GY);
    BOT_LEG.forEach((k, i) => { j[k] = legs[i]; }); BOT_UP.forEach((k, i) => { j[k] = up[i]; }); b.jSet = true;
    // leaning out round its cover to peek or hold an angle, as a player leans (player/lean.js): the upper body (j 6-11,
    // its place and turn) tipped over at the hips
    // (out round it for a while once it's leaned, eased out and back, not snapped: leanT)
    const spam = botSk(b).leanSpam, lw = !b.dead && !b.sprint && (Math.hypot(b.vx, b.vz) < 1.6 || spam) && (b.state === 'peek' || (b.state === 'fight' && b.mv === 'hold') || t < (b.leanT || 0)) ? b.leanSide || 0 : 0;
    b.lean = (b.lean || 0) + (lw - (b.lean || 0)) * (1 - Math.exp(-dt * (spam ? BOT_LEANSPAM.ease : 5)));
    const la = b.lean * BOT_LEAN.tilt; j[11] = bR2(j[11] + la); j[9] = bR2(j[9] - (b.pitch || 0) * BOT_PITCH_BODY);
    // a melee swing (botMeleeSwing): the body wound back through the wind-up, whipped through the blow and easing back,
    // across the body for a slash or down from overhead for a chop, its weapon carried round with it
    const sw = !b.dead && b.mswing;
    if (sw) {
      const wu = (t - sw.t0) / Math.max(0.05, sw.at - sw.t0), af = (t - sw.at) / Math.max(0.05, sw.end - sw.at);
      const a = wu < 1 ? -smooth(clamp(wu, 0, 1)) : af < 0.35 ? -1 + 2.2 * smooth(af / 0.35) : 1.2 * (1 - smooth(clamp((af - 0.35) / 0.65, 0, 1)));
      if (sw.chop) j[9] = bR2(j[9] - a * 0.4); else { j[10] = bR2(j[10] + a * 0.6 * sw.side); j[9] = bR2(j[9] + Math.max(0, a) * 0.12); }
    }
    // crouched (as you are, player/crouch.js crouchLegs): the hips dropped, the thighs forward and the knees bent
    const ck = b.dead ? 0 : botCrK(b);
    if (ck > 0.001) { j[1] = bR2(j[1] - CROUCH.drop * ck); j[45] = bR2(j[45] - CROUCH.thigh * ck); j[51] = bR2(j[51] - CROUCH.thigh * ck * 0.96); j[57] = bR2(j[57] + CROUCH.knee * ck); j[63] = bR2(j[63] + CROUCH.knee * ck * 0.95); }
    // its head down the sights (BOT_ADS_HEAD: down and over onto the stock) and, looking its gun over, with the gun
    // and its chest turned with it (BOT_INSPECT)
    const IK = b.insp && b.insp.w > 0.002 ? botInspKey(b.insp) : null, iw = IK ? b.insp.w : 0;
    j[27] = bR2(j[27] + BOT_ADS_HEAD.down * b.adsK + (IK ? IK[7] * iw : 0)); j[28] = bR2(j[28] + (IK ? IK[8] * iw : 0)); j[29] = bR2(j[29] - BOT_ADS_HEAD.tip * b.adsK);
    if (IK) j[10] = bR2(j[10] + IK[9] * iw);
    // (and the gun in its hands with it, tipped over and up or down just as the upper body's been from its pose: so it
    // points where it looks, from its own eyes as from anyone else's)
    if (w && w.length === 7) {
      _bgA.compose(_bvP.set(up[0], up[1], up[2]), _bvQ.setFromEuler(_bvE.set(up[3], up[4], up[5], 'XYZ')), _bvS.set(1, 1, 1)).invert();
      _bgB.compose(_bvP.set(j[6], j[7], j[8]), _bvQ.setFromEuler(_bvE.set(j[9], j[10], j[11], 'XYZ')), _bvS).multiply(_bgA);
      _bgA.compose(_bvP.set(w[0], w[1], w[2]), _bvQ.set(w[3], w[4], w[5], w[6]), _bvS).premultiply(_bgB).decompose(_bvP, _bvQ, _bvS);
      w = [bR3(_bvP.x), bR3(_bvP.y), bR3(_bvP.z), bR3(_bvQ.x), bR3(_bvQ.y), bR3(_bvQ.z), bR3(_bvQ.w)];
      // (looked over: the gun brought up and in, and turned in its hands, by the moves eased in or out: botInspKey)
      if (IK) {
        // (turned about where its hand holds it, HOLD grip, not the gun's own origin a metre below: about that it swung
        // right out of its hands; and only BOT_INSP.turn of your own view's turn, its arms not following the gun round)
        const gp = (HOLD[id] || HOLD_DEF).grip, T = BOT_INSP.turn * iw, M = BOT_INSP.move * iw;
        _bgA.compose(_bvP.set(w[0] + IK[4] * M, w[1] + IK[5] * M, w[2] - IK[6] * M), _bvQ.set(w[3], w[4], w[5], w[6]), _bvS)
          .multiply(_bgB.makeTranslation(gp[0], gp[1], gp[2])).multiply(_bgB.makeRotationFromEuler(_bvE.set(IK[1] * T, IK[2] * T, IK[3] * T, 'XYZ'))).multiply(_bgB.makeTranslation(-gp[0], -gp[1], -gp[2])).decompose(_bvP, _bvQ, _bvS);
        w = [bR3(_bvP.x), bR3(_bvP.y), bR3(_bvP.z), bR3(_bvQ.x), bR3(_bvQ.y), bR3(_bvQ.z), bR3(_bvQ.w)];
      }
    }   // (and tipped up or down with its look) j[6] = bR3(j[6] + BOT_LEAN.hip * Math.sin(la)); j[7] = bR2(j[7] + BOT_LEAN.hip * (1 - Math.cos(la)));
  }
  if (!now_ && (b.poseT -= dt) > 0 && b.sentLocal) { NET_ON.p(Object.assign({ t: 'p', f: b.id }, botMsg(b, j, id, w, upK, false))); return; }
  b.poseT = 1 / BOT_HZ; b.sentLocal = true;
  const m = botMsg(b, j, id, w, upK, true); m.q = b.q = (b.q || 0) + 1;
  NET_ON.p(Object.assign({ t: 'p', f: b.id }, m)); netAs(b.id, 'p', m);
}
function botMsg(b, j, id, w, upK, full) {
  const k = SLOTS.indexOf(b.cur), C = botCls(b); let sv = 0;
  SLOTS.forEach((s, i) => { if (!b.slots || !b.slots[s]) return; if (s !== b.cur || s === 'side') sv |= 1 << (4 + i); if (s !== b.cur) sv |= 1 << i; });
  const m = { x: bR3(b.x), z: bR3(b.z), vx: bR2(b.vx), vz: bR2(b.vz), hp: Math.round(Math.max(0, b.hp)), mh: 100, dead: b.dead ? 1 : 0, v: 0, pk: 0, cw: 0, j: j.slice(), fl: 0, vw: [bR2(b.aim), 1.2, 2.4, 0, 0], st: [0, 0, 0], hl: 0,
    ap: b.dead ? 0 : [bR2(b.x + Math.sin(b.aim) * 4), bR2(b.z + Math.cos(b.aim) * 4)], fc: !b.dead && upK === 'aim' ? [b.vis ? 0.5 : 0.1, 0, botHurtK(b), bR2(Math.max(0.25, b.adsK || 0))] : 0, cr: b.dead || !(b.cr > 0.02) ? 0 : bR2(b.cr), bk: !b.dead && b.block ? bR2(performance.now() / 1000 - b.blockAt) : -99,
    wp: b.dead ? [] : [[k, ...w, 0]], sv, ex: [0, 0], lk: b.lk, am: [b.mag ? b.mag[id] : 0, b.res ? b.res[id] : 0, botCap(b, id), b.reloading ? 1 : 0, 0] };
  if (full) { m.wn = WEAP[id].name; m.wid = id; }
  if (!C) delete m.fc;
  if (!b.dead && botFvWanted()) m.fv = botFv(b, j);
  return m;
}
// what it sees, for anyone down and watching it from its own eyes (net/avatars.js: specFp, as a player's fpView): its
// eyes (on its head, out to the side as it leans) and where it looks, in its body's frame; its arms and gun as its pose
// has them. Only while someone who could be watching is down
const botFvWanted = () => P.dead || [...NET.peers.values()].some(p => p.dead && !p.bot);
const _bgA = new THREE.Matrix4(), _bgB = new THREE.Matrix4();
const _bvB = new THREE.Matrix4(), _bvC = new THREE.Matrix4(), _bvP = new THREE.Vector3(), _bvQ = new THREE.Quaternion(), _bvS = new THREE.Vector3(1, 1, 1), _bvE = new THREE.Euler();
function botFv(b, j) {
  _bvB.compose(_bvP.set(j[0], j[1], j[2]), _bvQ.setFromEuler(_bvE.set(j[3], j[4], j[5], 'YXZ')), _bvS.set(1, 1, 1)).invert();
  const l = (b.lean || 0) * 0.32, fx = Math.sin(b.aim), fz = Math.cos(b.aim);
  _bvC.compose(_bvP.set(b.x + fx * 0.12 - fz * l, BOT_EYE - Math.abs(l) * 0.2 - CROUCH.drop * botCrK(b), b.z + fz * 0.12 + fx * l), _bvQ.setFromEuler(_bvE.set(b.pitch || 0, b.aim + Math.PI, -(b.lean || 0) * 0.14, 'YXZ')), _bvS.set(1, 1, 1));
  _bvC.premultiply(_bvB).decompose(_bvP, _bvQ, _bvS);
  return [bR3(_bvP.x), bR3(_bvP.y), bR3(_bvP.z), bR3(_bvQ.x), bR3(_bvQ.y), bR3(_bvQ.z), bR3(_bvQ.w), 75];
}
const botHurtK = b => clamp((botNow() - b.hurtT) < 0.6 ? 1 : 0, 0, 1);
