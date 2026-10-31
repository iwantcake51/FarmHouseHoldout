// The arena: player against player, in co-op (net/net.js: picked in the lobby). No zombies, no waves, no scrap: the
// arena map (world/arena.js), and three ways to play it. Deathmatch, everyone for themselves, back in a few seconds
// after going down, first to PVP_LIM.ffa kills; Team deathmatch the same in two sides, first side to PVP_LIM.tdm; and
// Showdown, one life a round in two sides (1v1, 2v2), first side to PVP_LIM.rounds rounds: go down and you watch a
// teammate still up (net/spectate.js), the last side standing takes the round and everyone's back at their spawn.
//
// Everyone picks a class (PVP_CLASSES) before the first round and between rounds, or while waiting to come back in
// Deathmatch: two guns and a melee weapon with their attachments set, and a bandage or two. Rounds hurt a person as they
// should (PVP_DMG: what each gun does to a body, its range falloff on top, a headshot double, an arm or leg less), and
// can open a bleed that only a bandage stops. Every game works out its own shots: a round that meets someone else's
// survivor (where it is on that game's screen) tells them what it did ('ph'); they take it, bleed, and if it's the end
// of them tell everyone who did it ('pk'). The host keeps the score and the clock ('pm') for everyone.

import { cv, scene, V3 } from '../core/renderer.js';
import { angDiff, cache, clamp, rand, rr } from '../core/math.js';
import { NET, NET_COL, NET_ON, netSend, netTo } from '../net/net.js';
import { P, PM } from '../player/player.js';
import { magSize, recomputeEff, S, W, W8 } from '../game/run-state.js';
import { WEAP } from '../weapons/gun-stats.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { equip } from '../weapons/reload.js';
import { falloff } from '../weapons/ammo.js';
import { setShake, setTod, shake, state } from '../game/state.js';
import { ARENA, arenaSpawn, arenaUp } from '../world/arena.js';
import { ci, idx, inb } from '../world/grid.js';
import { lowObst } from '../world/props.js';
import { hitMark } from '../ui/crosshair.js';
import { hitFromAt } from '../ui/hud.js';
import { burst, bloodSpurt } from '../effects/particles.js';
import { splat, splatLater } from '../effects/blood-map.js';
import { addBlood } from '../effects/body-blood.js';
import { goreAt } from '../ui/screen-blood.js';
import { SFX } from '../audio/sfx.js';
import { ANIM } from '../player/animation.js';
import { unragYou } from '../player/player-ragdoll.js';
import { deathCineEnd, leaveToMenu } from '../ui/screens.js';
import { gunArt, meleeArt } from '../ui/melee-art.js';
import { gorePop } from '../zombies/damage.js';
import { VCAM } from '../game/view-cam.js';
import { SPEC } from '../net/spectate.js';
import { GI, GI_VB } from '../ui/game-icons.js';
import { los } from '../lighting/lightmap.js';

// the three ways to play, and what wins each: kills for Deathmatch, a side's kills for Team deathmatch, rounds for
// Showdown; how long a Showdown round runs before it's called (s), and the cap on a whole Deathmatch (s)
export const PVP_MODES = { ffa: 'Deathmatch', tdm: 'Team deathmatch', rounds: 'Showdown' };
const PVP_LIM = { ffa: 15, tdm: 20, rounds: 5 };
const PVP_T = { pick0: 10, pick: 6, count: 3, round: 120, match: 600, roundEnd: 4, over: 9, respawn: 4.5, prot: 1.6 };
// each side's colour (A west, B east), and its name
const PVP_SIDE = { A: { col: '#5fb4e8', name: 'Blue' }, B: { col: '#e2563f', name: 'Red' } };
// the classes: two guns (each with its attachment steps: game/run-state.js W8.gt) and a melee weapon, mods where a gun
// has one, and how many bandages; in the order they're offered
const PVP_CLASSES = [
  { id: 'rifle', name: 'Rifleman', role: 'Steady at any range', guns: [['ar', { sight: 1 }], ['pistol', {}]], melee: 'machete', band: 2, mags: 3 },
  { id: 'mark', name: 'Marksman', role: 'One careful shot down a long lane', guns: [['hunting', { sight: 3 }], ['revolver', {}]], melee: 'crowbar', band: 1, mags: 3 },
  { id: 'rush', name: 'Rush', role: 'Fast on its feet and brutal up close', guns: [['sub', { sight: 2 }], ['dbl', {}, ['sawn']]], melee: 'katana', band: 1, mags: 3 },
  { id: 'breach', name: 'Breacher', role: 'Holds a corner, clears a room', guns: [['pump', { laser: 1 }], ['smg', {}]], melee: 'axe', band: 2, mags: 3 },
  { id: 'gunner', name: 'Gunner', role: 'Pins a lane down, slow to move', guns: [['lmg', { sight: 1 }], ['pistol', {}]], melee: 'wrench', band: 2, mags: 1 }
];
// what a round does to a person (body, before its falloff); a melee blow's; and by where it lands (a shotgun's pellets
// in the head count for less than a bullet's). A hit can open a bleed (PVP_BLEED: the odds by kind, and how many
// seconds of bleeding: player/bandages.js stops it)
const PVP_DMG = { pistol: 24, revolver: 46, deagle: 58, smg: 14, sub: 16, ar: 25, lmg: 23, scar: 40, hunting: 88, pump: 13, dbl: 12, auto12: 8 };
const PVP_MELEE = { bat: 38, crowbar: 44, wrench: 52, katana: 58, sledge: 92, machete: 48, axe: 72 };
const PVP_PART = { head: 2, torso: 1, armL: 0.72, armR: 0.72, legL: 0.78, legR: 0.78 }, PVP_HEAD_SHELL = 1.45, PVP_HEAD_MELEE = 1.4;
const PVP_BLEED = { gun: 0.22, shells: 0.35, blade: 0.45, s: [5, 9] };
// a body's reach as a round sees it (m round its middle), and where its parts are by height (m off the ground)
const PVP_R = 0.32, PVP_Y = { top: 1.86, head: 1.47, torso: 0.86 };

export const PVP = { on: false, mode: 'ffa', teams: {}, side: 'A', cls: 'rifle', ph: 'idle', t: 0, rd: 1, wins: [0, 0], sc: {}, ts: [0, 0], prot: 0, respawn: 0, last: null, sent: 0, picked: false, resultKey: '' };
const pvSideOf = id => PVP.teams[id];
export const pvpFoe = p => PVP.on && (PVP.mode === 'ffa' || pvSideOf(p.id) !== PVP.side);
export const pvpMate = p => PVP.on && PVP.mode !== 'ffa' && pvSideOf(p.id) === PVP.side;
// frozen in place: picking a class, the count in, a round called, the match over
export const pvpFrozen = () => PVP.on && PVP.ph !== 'live';
// the class picker's up (the pointer's freed for it: game/view-cam.js)
export const pvpPicking = () => PVP.on && document.body.classList.contains('pvpPicking');
const isHost = () => NET.host;
const roster = () => [{ id: NET.id, name: NET.name || 'Survivor', idx: NET.idx }, ...[...NET.peers.values()].map(p => ({ id: p.id, name: p.name, idx: p.idx }))];
const nameOf = id => id === NET.id ? (NET.name || 'Survivor') : (NET.peers.get(id) || {}).name || 'Someone';
export const pvpCol = id => colOf(id);
const colOf = id => PVP.mode === 'ffa' ? NET_COL[id === NET.id ? NET.idx : (NET.peers.get(id) || {}).idx] || '#ccc' : (PVP_SIDE[pvSideOf(id)] || {}).col || '#ccc';
// the sides, by the order everyone came in (the host's first): alternately A and B; in Deathmatch everyone's their own
export function pvpTeams(list, mode) { const t = {}; list.slice().sort((a, b) => a.idx - b.idx).forEach((r, k) => { t[r.id] = mode === 'ffa' ? r.id : k % 2 ? 'B' : 'A'; }); return t; }

// ---- the match starting: the arena up, everyone at their spawn, the class picker open
export function pvpBegin() {
  PVP.on = true; PVP.mode = NET.arena || 'ffa'; PVP.teams = NET.teams || pvpTeams(roster(), PVP.mode); PVP.side = PVP.teams[NET.id] || 'A';
  PVP.sc = {}; roster().forEach(r => { PVP.sc[r.id] = [0, 0]; });
  PVP.ts = [0, 0]; PVP.wins = [0, 0]; PVP.rd = 1; PVP.prot = 0; PVP.respawn = 0; PVP.last = null; PVP.resultKey = '';
  try { PVP.cls = localStorage.getItem('fhh-class') || 'rifle'; } catch (e) {}
  if (!PVP_CLASSES.some(c => c.id === PVP.cls)) PVP.cls = 'rifle';
  arenaUp(); setTod(ARENA.tod);
  document.body.classList.add('pvp'); document.body.classList.toggle('pvpTeams', PVP.mode !== 'ffa');
  pvpHudBuild();
  pvpSpawnMe(true);
  pvpPhase('pick', PVP_T.pick0);
}
// the match over and done with (back to the lobby, or the game left): the farm back
export function pvpEnd() {
  if (!PVP.on) return;
  PVP.on = false; PVP.ph = 'idle';
  document.body.classList.remove('pvp', 'pvpTeams', 'pvpPicking');
  pvpHudHide();
}
// a phase starting, on everyone's screen (the host's call: pm)
function pvpPhase(ph, t) {
  const was = PVP.ph; PVP.ph = ph; PVP.t = t;
  if (ph === 'pick') { PVP.picked = false; pvpPickOpen(true); if (was === 'roundEnd' || was === 'idle') pvpSpawnMe(true); }
  else pvpPickOpen(false);
  if (ph === 'count') { pvpLoadout(); pvpBanner(PVP.mode === 'rounds' ? 'Round ' + PVP.rd : 'Get ready', PVP.mode === 'rounds' ? pvpRoundSub() : PVP_MODES[PVP.mode], 'count'); SFX.click(); }
  if (ph === 'live') { PVP.prot = PVP_T.prot; pvpBanner('Fight', '', 'go'); SFX.wave(); }
  if (ph === 'roundEnd') pvpRoundBanner();
  if (ph === 'over') pvpResults();
  if (isHost()) pvpCast();
}
const pvpRoundSub = () => { const a = PVP.wins[0], b = PVP.wins[1], L = PVP_LIM.rounds; return a === L - 1 && b === L - 1 ? 'Final round' : a === L - 1 || b === L - 1 ? 'Match point' : PVP_SIDE.A.name + ' ' + a + ' – ' + b + ' ' + PVP_SIDE.B.name; };

// ---- your class: the guns and their attachments, the melee weapon, the bandages, full mags and a few more each
function pvpLoadout() {
  const C = PVP_CLASSES.find(c => c.id === PVP.cls) || PVP_CLASSES[0];
  W8.slot = { melee: C.melee, side: null, long: null, auto: null }; W8.owned = [C.melee];
  W8.mods = {}; W8.gt = {}; W8.own = {}; W8.att = {}; W8.rounds = {}; W8.mag = {}; W8.pin = {}; W8.relSave = {};
  ['akMag', 'spent', 'hudSpent', 'open', 'held'].forEach(k => { if (W8[k]) W8[k] = {}; });
  for (const k in W8.reserve) W8.reserve[k] = 0;
  W8.reloading = null; W8.akRel = null; W8.burstLeft = 0; W8.cd = 0; W8.swing = 0;
  let first = null;
  for (const [id, gt, mods] of C.guns) { const s = WEAP[id].slot; W8.slot[s] = id; W8.owned.push(id); W8.gt[id] = Object.assign({}, gt); W8.own[id] = Object.assign({}, gt); if (mods) W8.mods[id] = mods.slice(); if (!first) first = s; }
  recomputeEff();
  for (const [id] of C.guns) { const D = W(id), n = magSize(id); W8.mag[id] = n; W8.reserve[D.ammo] = (W8.reserve[D.ammo] || 0) + Math.max(n * C.mags, D.ammo === 'shells' ? 14 : 0); }
  P.band = C.band; P.bleed = 0; P.heal = 0;
  W8.cur = first || 'melee'; buildGuns(); equip(W8.cur, true);
}
// at your spawn, whole again: your side's spot (in Showdown everyone in their own place in it) or, in Deathmatch, the
// one furthest from everyone else
function pvpSpawnMe(fresh) {
  const foes = [...NET.peers.values()].filter(p => pvpFoe(p) && !p.dead && p.x !== undefined).map(p => [p.x, p.z]);
  const mine = roster().filter(r => pvSideOf(r.id) === PVP.side).sort((a, b) => a.idx - b.idx).findIndex(r => r.id === NET.id);
  const [x, z, f] = arenaSpawn(PVP.mode === 'ffa' ? 'F' : PVP.side, foes, PVP.mode === 'rounds' || fresh ? mine : undefined);
  if (P.dead) { unragYou(); deathCineEnd(); }
  Object.assign(P, { dead: false, deathT: 0, hp: S.maxHp, bleed: 0, slow: 0, stun: 0, vx: 0, vz: 0, kbx: 0, kbz: 0, conc: 0, shock: 0, shockStun: 0, vault: null, x, z, aim: f });
  VCAM.yaw = f; PM.head.visible = true;
  document.body.classList.remove('dying'); cv.style.filter = ''; cache.grey = null;
  if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; }
  SPEC.id = '';
  pvpLoadout();
}

// ---- shots and blows on the others: from firing.js and melee.js
// the survivors a round's line (from ox, oz along dx, dz) passes through before endR, as hits for firing.js to sort
// with the zombies' ({ pv: their player, t, off, r })
export function pvpRay(ox, oz, dx, dz, endR, hits) {
  if (!PVP.on || PVP.ph !== 'live') return;
  for (const p of NET.peers.values()) {
    if (p.dead || !pvpFoe(p) || !p.av) continue;
    const g = p.av.g.position, vx = g.x - ox, vz = g.z - oz, t = vx * dx + vz * dz, off = vx * dz - vz * dx;
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
  if (fp) {
    if (y > PVP_Y.top || y < 0.02) return false;
    part = y > PVP_Y.head ? 'head' : y > PVP_Y.torso ? (Math.abs(rel) > 0.62 ? (rel > 0 ? 'armR' : 'armL') : 'torso') : (rel > 0 ? 'legR' : 'legL');
  } else {
    const r = rand(), covered = pvpCovered(p.av.g.position.x, p.av.g.position.z, ox, oz, dx, dz, h.t);
    part = r < 0.13 ? 'head' : r < 0.6 ? 'torso' : r < 0.78 ? (rel > 0 ? 'armR' : 'armL') : (rel > 0 ? 'legR' : 'legL');
    if (covered && part !== 'head' && !part.startsWith('arm')) return false;
  }
  const shells = D.ammo === 'shells', base = (PVP_DMG[id] || 20) * clamp(D.dmg / (WEAP[id].dmg || 1), 0.5, 1.7);
  const d = base * falloff(id, h.t) * (part === 'head' && shells ? PVP_HEAD_SHELL : PVP_PART[part]);
  const s = shotOn.get(p) || { d: 0, head: false, part, n: 0, t: h.t }; s.d += d; s.n++; if (part === 'head') s.head = true; if (d > (s.top || 0)) { s.top = d; s.part = part; }
  shotOn.set(p, s);
  // on your screen at once: blood off them where it struck, and down on the ground behind
  const g = p.av.g.position, hy = part === 'head' ? 1.62 : part.startsWith('leg') ? 0.5 : 1.15;
  if (s.n <= 3) { bloodSpurt(g.x, hy, g.z, dx, dz, part === 'head' ? 8 : 5, 1.1); if (rand() < 0.5) splatLater(0.2, g.x + dx * rr(0.4, 1.2), g.z + dz * rr(0.4, 1.2), 'drop', rr(0.2, 0.4)); }
  return true;
}
// is someone behind low cover, as seen from (ox, oz): a barrier, sandbags or a drum on the line in the last
// metre and a half before them, not right in front of the shooter
function pvpCovered(x, z, ox, oz, dx, dz, t) {
  for (let s = 0.35; s < 1.6 && s < t - 1.1; s += 0.2) { const i = ci(x - dx * s), j = ci(z - dz * s); if (inb(i, j) && lowObst.has(idx(i, j))) return true; }
  return false;
}
// the shot done: to each one it hit, what it did all told (and whether it went in their head), and a chance of a bleed
export function pvpShotEnd(id, D) {
  if (!shotOn.size) return;
  for (const [p, s] of shotOn) pvpSend(p, Math.round(s.d), s.head ? 'head' : s.part, id, D.ammo === 'shells' ? (s.n >= 3 && rand() < PVP_BLEED.shells) : rand() < PVP_BLEED.gun);
  shotOn.clear();
}
// a melee blow: everyone in reach and in front of you (and not through a wall) takes it
export function pvpMelee(D, id) {
  if (!PVP.on || PVP.ph !== 'live') return 0;
  let n = 0;
  for (const p of NET.peers.values()) {
    if (p.dead || !pvpFoe(p) || !p.av) continue;
    const g = p.av.g.position, dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz);
    if (d > D.range + 0.35 || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc && d > 0.6) || !los(P.x, P.z, g.x, g.z)) continue;
    const head = rand() < (D.style === 'chop' ? 0.3 : 0.18);
    pvpSend(p, Math.round((PVP_MELEE[id] || 40) * (head ? PVP_HEAD_MELEE : 1)), head ? 'head' : 'torso', id, !D.blunt && rand() < PVP_BLEED.blade);
    bloodSpurt(g.x, head ? 1.62 : 1.15, g.z, dx / (d || 1), dz / (d || 1), 7, 1.3);
    n++;
  }
  return n;
}
function pvpSend(p, d, part, w, bleed) {
  if (d <= 0) return;
  netTo(p.id, 'ph', { d, p: part, w, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, b: bleed ? 1 : 0 });
  hitMark('hit', part === 'head'); SFX.killTick(part === 'head', 1);
}
// hit: what it does to you, and how it feels. Spawn-protected for a moment after you come in, and nothing between rounds
NET_ON.ph = m => {
  if (!PVP.on || m.to !== NET.id || P.dead || PVP.ph !== 'live' || PVP.prot > 0 || state === 'title') return;
  const dx = P.x - m.x, dz = P.z - m.z, L = Math.hypot(dx, dz) || 1, head = m.p === 'head';
  P.hp -= m.d; PVP.last = { id: m.f, w: m.w, head, d: m.d, at: performance.now() };
  P.hitFrom = Math.atan2(dx, dz); hitFromAt(m.x, m.z, m.d / 22);
  addBlood(Math.min(0.12, 0.02 + m.d / 900)); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt();
  setShake(Math.max(shake, 0.18 + Math.min(0.4, m.d / 160)));
  goreAt(P.x - dx / L * 0.3, P.z - dz / L * 0.3, head ? 1.6 : 1.2, Math.min(1, (head ? 0.5 : 0.25) + m.d / 120));
  if (m.b) P.bleed = Math.min(14, (P.bleed || 0) + rr(...PVP_BLEED.s));
  burst(P.x, head ? 1.6 : 1.15, P.z, 6, 'blood', dx / L, dz / L, 2); if (rand() < 0.6) splat(P.x + dx / L * 0.4, P.z + dz / L * 0.4, 'drop', rr(0.2, 0.35));
  netSend('pb', { x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100, dx: Math.round(dx / L * 100) / 100, dz: Math.round(dz / L * 100) / 100, h: head ? 1 : 0, sh: m.f });
};
// someone else bleeding where they were hit (not on the shooter's screen: they've drawn it already)
NET_ON.pb = m => {
  if (!PVP.on || m.sh === NET.id || state === 'title') return;
  bloodSpurt(m.x, m.h ? 1.62 : 1.15, m.z, m.dx, m.dz, 5, 1);
};
// you down (ui/screens.js: startDeath): who did it, with what, and whether it took your head off, to everyone
export function pvpDied() {
  if (!PVP.on) return;
  const L = PVP.last && performance.now() - PVP.last.at < 8000 ? PVP.last : null;
  const hb = !!(L && L.head && L.d >= 60);
  const m = { k: L ? L.id : '', v: NET.id, w: L ? L.w : '', hs: L && L.head ? 1 : 0, hb: hb ? 1 : 0, x: Math.round(P.x * 100) / 100, z: Math.round(P.z * 100) / 100 };
  netSend('pk', m); pvpKilled(m);
  PVP.respawn = PVP.mode === 'rounds' ? 0 : PVP_T.respawn;
  if (PVP.mode !== 'rounds') setTimeout(() => { if (P.dead && PVP.on && PVP.ph === 'live') pvpPickOpen(true, true); }, 1300);
}
NET_ON.pk = m => { if (PVP.on) pvpKilled(m); };
function pvpKilled(m) {
  // the score, on the host's game (it tells everyone with the clock)
  if (isHost()) {
    const k = PVP.sc[m.k], v = PVP.sc[m.v];
    if (v) v[1]++;
    if (k && m.k !== m.v) { k[0]++; if (PVP.mode === 'tdm') PVP.ts[pvSideOf(m.k) === 'B' ? 1 : 0]++; }
    pvpCheckEnd(); pvpCast();
  }
  pvpFeed(m);
  if (m.k === NET.id && m.v !== NET.id) { hitMark('kill', !!m.hs); pvpToast(m.hs ? 'Headshot' : 'Eliminated', nameOf(m.v), m.hs ? 'head' : 'kill'); }
  if (m.v === NET.id && m.k) pvpToast('Killed by', nameOf(m.k), 'dead');
  // its head gone: a cloud of red where it was
  if (m.hb) {
    let at = null; if (m.v === NET.id) { at = PM.head; } else { const p = NET.peers.get(m.v); at = p && p.av && p.av.head; if (at) p.av.headGone = true; }
    if (at) { const w = new V3(); at.getWorldPosition(w); at.visible = false; const k = NET.peers.get(m.k) || (m.k === NET.id ? P : null), dx = k ? w.x - k.x : 0, dz = k ? w.z - k.z : 1, L = Math.hypot(dx, dz) || 1; gorePop(w.x, w.y, w.z, dx / L, dz / L); }
  }
  // down where they fell: a pool spreading under them
  splatLater(0.6, m.x, m.z, 'pool', rr(0.7, 1.0), undefined, 0.8);
}

// ---- every frame (game/update.js, in place of the farm's systems)
let pvpCastT = 0;
export function pvpUpdate(dt) {
  if (!PVP.on) return;
  PVP.prot = Math.max(0, PVP.prot - dt);
  if (pvpFrozen()) P.stun = Math.max(P.stun || 0, 0.06);
  // the clock: the host's runs it, everyone else's follows it (and is put right by each word from the host)
  PVP.t = Math.max(0, PVP.t - dt);
  if (isHost()) {
    if (PVP.t <= 0) pvpTimeUp();
    else if (PVP.ph === 'live' && PVP.mode === 'rounds') pvpCheckRound();
    if ((pvpCastT -= dt) <= 0) { pvpCastT = 1; pvpCast(); }
  }
  // down in Deathmatch: back in after a few seconds
  if (P.dead && PVP.mode !== 'rounds' && PVP.ph === 'live' && PVP.respawn > 0 && (PVP.respawn -= dt) <= 0) { pvpPickOpen(false); pvpSpawnMe(false); PVP.prot = PVP_T.prot; SFX.upgrade(); }
  pvpHud();
}
function pvpTimeUp() {
  if (PVP.ph === 'pick') pvpPhase('count', PVP_T.count);
  else if (PVP.ph === 'count') pvpPhase('live', PVP.mode === 'rounds' ? PVP_T.round : PVP_T.match);
  else if (PVP.ph === 'live') { if (PVP.mode === 'rounds') pvpRoundOver(pvpLeader()); else pvpPhase('over', PVP_T.over); }
  else if (PVP.ph === 'roundEnd') { if (Math.max(...PVP.wins) >= PVP_LIM.rounds) pvpPhase('over', PVP_T.over); else { PVP.rd++; pvpPhase('pick', PVP_T.pick); } }
  else if (PVP.ph === 'over') { netSend('pend', {}); pvpLeave(); }
}
// who's still up on each side (you, and everyone else as their pose says)
function pvpAlive() { const n = { A: 0, B: 0, hpA: 0, hpB: 0 }; const add = (id, dead, hp) => { const s = pvSideOf(id); if (!dead && (s === 'A' || s === 'B')) { n[s]++; n['hp' + s] += hp; } }; add(NET.id, P.dead, P.hp); for (const p of NET.peers.values()) add(p.id, p.dead, p.hp ?? 100); return n; }
function pvpCheckRound() {
  const n = pvpAlive(), sides = new Set(Object.values(PVP.teams));
  if (sides.size < 2) return;   // (on your own: nobody to lose to)
  if (!n.A || !n.B) pvpRoundOver(!n.A && !n.B ? '' : n.A ? 'A' : 'B');
}
const pvpLeader = () => { const n = pvpAlive(); return n.A !== n.B ? (n.A > n.B ? 'A' : 'B') : n.hpA !== n.hpB ? (n.hpA > n.hpB ? 'A' : 'B') : ''; };
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
function pvpCast() { netSend('pm', { ph: PVP.ph, tl: Math.round(PVP.t * 10) / 10, rd: PVP.rd, w: PVP.wins, sc: PVP.sc, ts: PVP.ts, rw: PVP.rw || '' }); }
NET_ON.pm = m => {
  if (!PVP.on || isHost()) return;
  PVP.sc = m.sc || PVP.sc; PVP.ts = m.ts || PVP.ts; PVP.rd = m.rd; PVP.rw = m.rw;
  const was = PVP.wins.join(); PVP.wins = m.w || PVP.wins;
  if (m.ph !== PVP.ph) pvpPhase(m.ph, m.tl); else PVP.t = m.tl;   // (tl: the time left; a message's t is its kind, net/net.js)
  if (was !== PVP.wins.join()) PVP.key = '';
};
NET_ON.pend = () => { if (PVP.on) pvpLeave(); };
// back to the lobby, the farm with it
function pvpLeave() { pvpEnd(); leaveToMenu(); }
// a round called: who took it
function pvpRoundBanner() {
  const w = PVP.rw, mine = w === PVP.side;
  pvpBanner(!w || w === '-' ? 'Draw' : mine ? 'Round won' : 'Round lost', PVP_SIDE.A.name + ' ' + PVP.wins[0] + ' – ' + PVP.wins[1] + ' ' + PVP_SIDE.B.name, !w || w === '-' ? 'draw' : mine ? 'win' : 'lose');
  if (w && w !== '-') (mine ? SFX.upgrade : SFX.wave)();
}

// ---- the HUD: the score and the clock up top, the kill feed, the big calls, the class picker and the results
let hudEls = null;
function pvpHudBuild() {
  if (!hudEls) {
    const mk = (id, cls) => { const d = document.createElement('div'); d.id = id; d.className = 'hud ' + (cls || ''); document.body.appendChild(d); return d; };
    hudEls = { top: mk('pvpTop'), feed: mk('pvpFeed'), ban: mk('pvpBan'), pick: mk('pvpPick'), res: mk('pvpRes'), toast: mk('pvpToast') };
    hudEls.pick.addEventListener('click', e => { const b = e.target.closest('[data-cls]'); if (b) pvpChoose(b.dataset.cls); });
    addEventListener('keydown', e => { if (!PVP.on || !document.body.classList.contains('pvpPicking')) return; const n = +e.key; if (n >= 1 && n <= PVP_CLASSES.length) { pvpChoose(PVP_CLASSES[n - 1].id); e.preventDefault(); } });
  }
  Object.values(hudEls).forEach(e => { e.hidden = false; });
  hudEls.feed.innerHTML = ''; hudEls.res.classList.remove('on'); hudEls.ban.className = 'hud'; PVP.key = '';
}
function pvpHudHide() { if (hudEls) Object.values(hudEls).forEach(e => { e.hidden = true; e.classList.remove('on'); }); }
const fmtT = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
function pvpHud() {
  if (!hudEls) return;
  const T = Math.ceil(PVP.t), key = [PVP.ph, T, JSON.stringify(PVP.sc), PVP.ts.join(), PVP.wins.join(), PVP.rd, P.dead ? 1 : 0, Math.ceil(PVP.respawn), [...NET.peers.values()].map(p => p.dead ? 1 : 0).join('')].join('|');
  if (PVP.key === key) return; PVP.key = key;
  const el = hudEls.top, clock = PVP.ph === 'live' || PVP.ph === 'pick' || PVP.ph === 'count' ? fmtT(Math.max(0, PVP.t)) : '';
  if (PVP.mode === 'ffa') {
    const list = roster().map(r => ({ ...r, k: (PVP.sc[r.id] || [0])[0] })).sort((a, b) => b.k - a.k);
    el.innerHTML = `<div class="ptMode">${PVP_MODES.ffa}<small>First to ${PVP_LIM.ffa}</small></div><div class="ptClock">${clock}</div><div class="ptList">` +
      list.map(r => `<span class="ptChip${r.id === NET.id ? ' me' : ''}" style="--c:${colOf(r.id)}"><i></i><b>${r.k}</b><em></em></span>`).join('') + '</div>';
    el.querySelectorAll('.ptChip em').forEach((e, k) => { e.textContent = list[k].name; });
  } else {
    const a = PVP.mode === 'rounds' ? PVP.wins[0] : PVP.ts[0], b = PVP.mode === 'rounds' ? PVP.wins[1] : PVP.ts[1];
    const pips = w => PVP.mode === 'rounds' ? `<span class="ptPips">${Array.from({ length: PVP_LIM.rounds }, (_, k) => `<i class="${k < w ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const alive = s => PVP.mode === 'rounds' ? `<span class="ptAlive">${roster().filter(r => pvSideOf(r.id) === s).map(r => `<svg viewBox="${GI_VB}" class="${(r.id === NET.id ? P.dead : (NET.peers.get(r.id) || {}).dead) ? 'down' : ''}">${GI.person || ''}</svg>`).join('')}</span>` : '';
    el.innerHTML = `<div class="ptSide A${PVP.side === 'A' ? ' me' : ''}"><b>${a}</b>${pips(a)}${alive('A')}</div>` +
      `<div class="ptMid"><div class="ptMode">${PVP.mode === 'rounds' ? 'Round ' + PVP.rd : PVP_MODES.tdm}<small>${PVP.mode === 'rounds' ? 'First to ' + PVP_LIM.rounds : 'First to ' + PVP_LIM.tdm}</small></div><div class="ptClock">${clock}</div></div>` +
      `<div class="ptSide B${PVP.side === 'B' ? ' me' : ''}"><b>${b}</b>${pips(b)}${alive('B')}</div>`;
  }
  // down in Deathmatch: when you'll be back
  hudEls.toast.dataset.respawn = P.dead && PVP.mode !== 'rounds' && PVP.ph === 'live' ? Math.ceil(PVP.respawn) : '';
}
// a line in the kill feed: who, with what (its picture), who
function pvpFeed(m) {
  if (!hudEls) return;
  const row = document.createElement('div'); row.className = 'pfRow' + (m.k === NET.id || m.v === NET.id ? ' me' : '');
  const art = m.w && WEAP[m.w] ? (WEAP[m.w].melee ? meleeArt(m.w, []) : gunArt(m.w)) : null;
  row.innerHTML = `<b style="color:${colOf(m.k)}"></b>${art ? `<img alt="" src="${art.url}">` : '<i></i>'}${m.hs ? `<svg viewBox="${GI_VB}" class="hs">${GI.deathSkull || ''}</svg>` : ''}<b style="color:${colOf(m.v)}"></b>`;
  const bs = row.querySelectorAll('b'); bs[0].textContent = m.k ? nameOf(m.k) : ''; bs[1].textContent = nameOf(m.v);
  hudEls.feed.prepend(row); while (hudEls.feed.children.length > 5) hudEls.feed.lastChild.remove();
  setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 400); }, 6000);
}
let banT = 0;
function pvpBanner(big, small, kind) {
  if (!hudEls) return;
  const el = hudEls.ban; el.innerHTML = '<b></b><small></small>'; el.firstChild.textContent = big; el.lastChild.textContent = small || '';
  el.className = 'hud on ' + (kind || ''); clearTimeout(banT); banT = setTimeout(() => el.classList.remove('on'), kind === 'count' ? 2600 : 1800);
}
let pvToastT = 0;
function pvpToast(a, b, kind) {
  if (!hudEls) return;
  const el = hudEls.toast; el.innerHTML = '<small></small><b></b>'; el.firstChild.textContent = a; el.lastChild.textContent = b;
  el.className = 'hud on ' + kind; clearTimeout(pvToastT); pvToastT = setTimeout(() => el.classList.remove('on'), 1800);
}
// the class picker: a card for each class, its guns' pictures, its melee weapon and bandages; 1 to 5 or a click
function pvpPickOpen(on, small) {
  if (!hudEls) return;
  document.body.classList.toggle('pvpPicking', on);
  const el = hudEls.pick; el.classList.toggle('on', on); el.classList.toggle('small', !!small);
  if (!on) return;
  el.innerHTML = `<div class="ppHead"><small>${small ? 'Back in soon' : PVP.mode === 'rounds' && PVP.rd > 1 ? 'Round ' + PVP.rd : PVP_MODES[PVP.mode]}</small><b>Choose your class</b><em>1 – ${PVP_CLASSES.length}</em></div><div class="ppRow">` +
    PVP_CLASSES.map((C, k) => `<button type="button" class="ppCard${C.id === PVP.cls ? ' on' : ''}" data-cls="${C.id}"><kbd>${k + 1}</kbd><b>${C.name}</b><small>${C.role}</small><span class="ppGuns">` +
      C.guns.map(([id]) => { const a = gunArt(id); return `<span class="ppGun"><img alt="" src="${a ? a.url : ''}"><em>${WEAP[id].name}</em></span>`; }).join('') +
      `</span><span class="ppKit"><span class="ppMelee"><img alt="" src="${meleeArt(C.melee, []).url}">${WEAP[C.melee] ? WEAP[C.melee].name : C.melee}</span><span class="ppBand">${'<i></i>'.repeat(C.band)}${C.band} bandage${C.band > 1 ? 's' : ''}</span></span></button>`).join('') + '</div>';
}
function pvpChoose(id) {
  if (!PVP_CLASSES.some(c => c.id === id)) return;
  PVP.cls = id; try { localStorage.setItem('fhh-class', id); } catch (e) {}
  hudEls.pick.querySelectorAll('.ppCard').forEach(c => c.classList.toggle('on', c.dataset.cls === id));
  SFX.click();
  if (PVP.ph === 'pick') pvpLoadout();   // (in your hands at once, while everyone's still picking)
}
// the results: who won, and everyone's kills and deaths
function pvpResults() {
  if (!hudEls) return;
  const list = roster().map(r => ({ ...r, k: (PVP.sc[r.id] || [0, 0])[0], d: (PVP.sc[r.id] || [0, 0])[1] })).sort((a, b) => b.k - a.k || a.d - b.d);
  let win = '', me = false;
  if (PVP.mode === 'ffa') { win = list[0] && list[0].k > (list[1] ? list[1].k : -1) ? list[0].id : ''; me = win === NET.id; }
  else { const a = PVP.mode === 'rounds' ? PVP.wins[0] : PVP.ts[0], b = PVP.mode === 'rounds' ? PVP.wins[1] : PVP.ts[1]; win = a === b ? '' : a > b ? 'A' : 'B'; me = win === PVP.side; }
  const head = !win ? 'Draw' : me ? 'Victory' : 'Defeat';
  const el = hudEls.res;
  el.innerHTML = `<div class="prBox ${!win ? 'draw' : me ? 'win' : 'lose'}"><small>${PVP_MODES[PVP.mode]}</small><b>${head}</b><em></em><table><tr><th></th><th>Kills</th><th>Deaths</th></tr>` +
    list.map(r => `<tr class="${r.id === NET.id ? 'me' : ''}"><td style="--c:${colOf(r.id)}"><i></i><span></span></td><td>${r.k}</td><td>${r.d}</td></tr>`).join('') + '</table><p>Back to the lobby in a moment</p></div>';
  el.querySelectorAll('td span').forEach((s, k) => { s.textContent = list[k].name; });
  el.querySelector('em').textContent = PVP.mode === 'ffa' ? (win ? nameOf(win) + ' wins' : 'Nobody came out on top') : (win ? PVP_SIDE[win].name + ' wins' : 'Even') + (PVP.mode === 'rounds' ? ' · ' + PVP.wins[0] + ' – ' + PVP.wins[1] : ' · ' + PVP.ts[0] + ' – ' + PVP.ts[1]);
  el.classList.add('on'); (me ? SFX.upgrade : SFX.wave)();
}
