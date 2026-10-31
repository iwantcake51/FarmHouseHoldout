// Arena bots: players for the arena when there aren't enough people (pvp/pvp.js), sat in the lobby by the host
// (net/net.js: netBotAdd) or there from the start when the arena's played solo. The host's game runs them, and to every
// game (its own included) each is just another player: it sends its pose, its loadout and its shots under its own
// name (netAs), takes hits ('ph') and reports going down ('pk') as a player's game does, so the score, the kill feed,
// the rounds, spectating and the gore all work for them as they are.
//
// A bot knows only what it could: someone in front of it, in range and in plain sight (no wall between: los), gunfire
// it can hear (a suppressed shot only close by), someone sprinting near it, and where a hit came from. What it learns
// it remembers: where it last saw or heard each foe, and when. From that it picks what to do: fight (strafing, holding
// still behind low cover, or pushing in, sprinting and firing if its class can), get into cover when it's hurt or
// reloading, bandage there, swing back out to fight again, flank the last place it saw someone or push straight at it,
// and hunt round the map when it knows of nobody. Its aim isn't perfect: it takes a moment to react to someone new,
// settles onto them, and spreads more on the move and the longer it holds the trigger.
// Its body is posed from a survivor's own (pvp/bot-poses.js): its stride by how it's moving against where it aims, its
// arms and gun aimed, from the hip or down at a sprint, as a player's are.

import { angDiff, clamp, rand, rr } from '../core/math.js';
import { NET, NET_BOT, NET_ON, netAs, netSend } from '../net/net.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { curId, W8 } from '../game/run-state.js';
import { SLOTS } from '../weapons/slots.js';
import { falloff } from '../weapons/ammo.js';
import { tracerPower } from '../effects/tracers.js';
import { ARENA, arenaSpawn } from '../world/arena.js';
import { ci, cxw, idx, inb } from '../world/grid.js';
import { bulletBlocked, hardBlocked, moveCircle } from '../world/collision.js';
import { los } from '../lighting/lightmap.js';
import { PVP, PVP_BLEED, PVP_CLASSES, PVP_DMG, PVP_HEAD_SHELL, PVP_PART, PVP_R, PVP_T, PVP_TTK, pvpCovered, pvpKilled, pvpSideOf } from './pvp.js';
import { BOT_CYC, BOT_GUN, BOT_GY, BOT_IDLE, BOT_LEG, BOT_UP } from './bot-poses.js';

// how good they are, by the lobby's pick (NET.botSkill): how long they take to react to someone new (s), how far off
// their aim starts on them (rad) and how fast it settles, how much their shots spread on top of the gun's own, how fast
// they turn at most (rad/s: their aim speeds up and slows down onto a target, never snapping), how far they see (m) and how wide (half the angle, rad), and how often a hit is in the head
const BOT_SKILL = [
  { react: [0.5, 0.8], err: 0.3, settle: 2.2, sig: 0.075, turn: 2.6, view: 30, fov: 1.05, head: 0.08 },
  { react: [0.3, 0.5], err: 0.24, settle: 3, sig: 0.055, turn: 3.4, view: 36, fov: 1.2, head: 0.11 },
  { react: [0.2, 0.34], err: 0.2, settle: 4, sig: 0.04, turn: 4.4, view: 42, fov: 1.35, head: 0.15 }
];
export const BOT_SKILLS = ['Recruit', 'Regular', 'Veteran'];
const botSk = () => BOT_SKILL[NET.botSkill ?? 1] || BOT_SKILL[1];
// how each class fights: the range it likes (m), how keen it is to push in (0 to 1), which gun it wants out at a range,
// and whether it fires on the run (Run and gun: the Rush)
const BOT_STYLE = {
  rifle: { range: [6, 22], push: 0.45, gun: () => 'auto' },
  mark: { range: [12, 34], push: 0.12, gun: d => d > 7 ? 'long' : 'side' },
  rush: { range: [0, 8], push: 0.9, gun: d => d < 6 ? 'long' : 'auto', runGun: true },
  breach: { range: [0, 9], push: 0.72, gun: d => d < 9 ? 'long' : 'auto' },
  gunner: { range: [7, 24], push: 0.3, gun: () => 'auto' }
};
// how far each gun's worth firing (m), how fast they move (m/s: walking, aimed, and a sprint's multiple, the class's
// own on top), how long they remember someone (s), how long a bandage takes and gives, and how fast bleeding hurts
const BOT_REACH = { pump: 13, dbl: 8, pistol: 26, revolver: 34, smg: 20, sub: 24, ar: 40, lmg: 38, hunting: 60 };
const BOT_MOVE = { base: 3, aimed: 0.72, sprint: 1.75, cls: { rush: 1.06, gunner: 0.9 } };
// changing class: after this many more deaths than kills with one, and how far off a killer counts as far or near (m)
const BOT_SWAP = { deaths: 2, far: 16, near: 7 };
const BOT_MEM = 14, BOT_BLEED = { dps: 1.7, floor: 15 }, BOT_REGEN = { wait: 2, full: 6.75 };   // (health back on its own as a player's: pvp/pvp.js REGEN)
// a shot at someone on the move spreads more, by how fast they're going (rad per m/s), to at most max
const BOT_LEAD = { k: 0.014, max: 0.05 };
const BOT_NAMES = ['Hollis', 'Ruth', 'Marek', 'Juno', 'Dacey', 'Ozzie', 'Teague', 'Wren', 'Abel', 'Noor', 'Sully', 'Kit'];
export const botName = used => { const free = BOT_NAMES.filter(n => !used.has(n)); return (free.length ? free : BOT_NAMES)[Math.floor(rand() * (free.length || BOT_NAMES.length))]; };

const BOTS = new Map();
let botClock = 0;   // its own clock, the game's time (stopped while the game is)
const botNow = () => botClock;
const bR2 = v => Math.round(v * 100) / 100, bR3 = v => Math.round(v * 1000) / 1000;
const botGauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
const botCls = b => PVP_CLASSES.find(c => c.id === b.cls) || PVP_CLASSES[0];
const botGunOf = b => b.slots[b.cur];

// ---- the match: each bot in the lobby gets a body and a mind
export function botsBegin() {
  BOTS.clear();
  for (const p of NET.peers.values()) if (p.bot) BOTS.set(p.id, { p, id: p.id, rec: {}, cls: PVP_CLASSES[Math.floor(rand() * PVP_CLASSES.length)].id, x: 0, z: 0, vx: 0, vz: 0, aim: 0, hp: 100, dead: true, seed: rand() * 9, mem: new Map(), path: [], ph: 0, poseT: 0, thinkT: 0, senseT: 0, spray: 0, err: 0 });
  for (const b of BOTS.values()) botSpawn(b, true);
}
export function botsEnd() { BOTS.clear(); }
export const botIds = () => [...BOTS.keys()];
// a kill to a bot's name (pvp/pvp.js pvpKilled), for its record with the class it had (BOT_SWAP)
export function botKilled(id) { const b = BOTS.get(id); if (b) { const r = b.rec[b.cls] || (b.rec[b.cls] = { k: 0, d: 0 }); r.k++; } }
// a phase starting (the host's call: pvp/pvp.js): everyone back at their spawn for a new round
export function botsPhase(ph, was) {
  if (ph === 'pick' && (was === 'roundEnd' || was === 'idle')) for (const b of BOTS.values()) { if (was === 'idle' && rand() < 0.3) b.cls = PVP_CLASSES[Math.floor(rand() * PVP_CLASSES.length)].id; botSpawn(b, true); }
  if (ph === 'count') for (const b of BOTS.values()) if (!b.dead) botArm(b);
  if (ph === 'live') for (const b of BOTS.values()) b.prot = PVP_T.prot;
}

// ---- its class: the guns (and the loadout everyone builds its weapons from: net/arsenal.js), full mags and a few more
function botArm(b) {
  const C = botCls(b), slots = { melee: C.melee, side: null, long: null, auto: null }, guns = {};
  const gl = (gt, mods) => ({ mods: mods ? mods.slice() : [], lv: {}, gt: Object.assign({}, gt), pin: null, att: {}, rnd: null, ak: false, rd: null });
  guns[C.melee] = gl({});
  b.mag = {}; b.res = {}; b.gt = {};
  for (const [id, gt, mods] of C.guns) {
    slots[WEAP[id].slot] = id; guns[id] = gl(gt, mods); b.gt[id] = gt;
    const n = WEAP[id].mag || 1; b.mag[id] = n; b.res[id] = Math.max(n * C.mags, WEAP[id].ammo === 'shells' ? 14 : 0);
  }
  b.slots = slots; b.cur = WEAP[C.guns[0][0]].slot; b.relT = 0; b.reloading = false; b.swapT = 0; b.cd = 0; b.burst = 0;
  b.quick = C.perks.includes('quick:2') ? 0.6 : C.perks.includes('quick:1') ? 0.8 : 1;
  b.lo = { slots, guns, stow: {}, hol: 0x1d1d1f, gear: null };
  const key = JSON.stringify(b.lo); let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0; b.lk = h;
  const m = { lo: b.lo, lk: b.lk }; NET_ON.lo(Object.assign({ t: 'lo', f: b.id }, m)); netAs(b.id, 'lo', m);
}
NET_BOT.loq = m => { const b = BOTS.get(m.to); if (b && b.lo) netAs(b.id, 'lo', { lo: b.lo, lk: b.lk }, m.f); };
// at its spawn, whole again: its side's spot (in Showdown each in its own place) or, in Deathmatch, the one furthest
// from everyone
function botSpawn(b, fresh) {
  b.side = pvpSideOf(b.id) || 'A';
  const foes = botFoes(b).map(f => [f.x, f.z]);
  const list = [{ id: NET.id, idx: NET.idx }, ...[...NET.peers.values()].map(p => ({ id: p.id, idx: p.idx }))].filter(r => pvpSideOf(r.id) === b.side).sort((a, c) => a.idx - c.idx);
  const [x, z, f] = arenaSpawn(PVP.mode === 'ffa' ? 'F' : b.side, foes, PVP.mode === 'rounds' || fresh ? list.findIndex(r => r.id === b.id) : undefined);
  Object.assign(b, { x, z, vx: 0, vz: 0, aim: f, av: 0, look: f, hp: 100, dead: false, bleed: 0, calm: 0, regen0: null, stun: 0, prot: PVP_T.prot, state: 'roam', path: [], tgt: '', vis: null, last: null, mv: '', react: 0, err: 0, spray: 0, hurtT: -9, seenT: -9, stopT: 0, glanceT: 0, stuck: 0 });
  b.mem.clear();
  botArm(b);
  b.p.dead = false; b.p.hp = 100;
}

// ---- who it's up against: you, the other players (where their pose says) and the other bots
function botFoes(b) {
  // (with where each is aiming and whether a laser's shining from their gun: a beam it can see gives them away)
  const out = [], add = (id, x, z, vx, vz, dead, aim, laser) => { if (dead || x === undefined || id === b.id) return; if (PVP.mode !== 'ffa' && pvpSideOf(id) === b.side) return; out.push({ id, x, z, vx: vx || 0, vz: vz || 0, aim, laser }); };
  add(NET.id, P.x, P.z, P.vx, P.vz, P.dead, P.aim, !!(W8.gt[curId()] || {}).laser);
  for (const q of NET.peers.values()) {
    const o = BOTS.get(q.id);
    if (o) add(o.id, o.x, o.z, o.vx, o.vz, o.dead, o.aim, !!(o.gt && (o.gt[botGunOf(o)] || {}).laser));
    else { const g = q.lo && q.wid && q.lo.guns[q.wid]; add(q.id, q.x, q.z, q.vx, q.vz, q.dead, q.vw ? q.vw[0] : 0, !!(g && g.gt && g.gt.laser)); }
  }
  return out;
}
// what it sees: each foe in front of it (or right by it), in range and in plain sight. Someone new takes it a moment
// to react to, and its aim starts off them. Someone sprinting close by it hears
function botSense(b, foes, t) {
  const S = botSk(); let best = 1e9; b.vis = null;
  for (const f of foes) {
    const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
    const seen = d < S.view && (d < 2.2 || Math.abs(angDiff(Math.atan2(dx, dz), b.aim)) < S.fov) && los(b.x, b.z, f.x, f.z);
    const m = b.mem.get(f.id);
    if (seen) {
      if (!m || !m.seen || t - m.t > 1.5) { b.react = t + rr(...S.react); b.err = S.err * (rand() < 0.5 ? -1 : 1); }
      b.mem.set(f.id, { id: f.id, x: f.x, z: f.z, t, seen: true });
      const score = d - (f.id === b.tgt ? 6 : 0); if (score < best) { best = score; b.vis = f; }
    } else {
      if (m) m.seen = false;
      if (d < (Math.hypot(f.vx, f.vz) > 4.2 ? 7 : 2.5)) botNote(b, f.id, f.x, f.z, 1.2, t);
      else if (f.laser && botBeam(b, f, S)) botNote(b, f.id, f.x, f.z, 1.5, t);   // (their laser seen: where it's coming from)
    }
  }
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
// something heard (or a hit felt) from someone: roughly where they are botNow, if it hasn't a better idea
function botNote(b, id, x, z, noise, t, hurt) {
  const m = b.mem.get(id); if (m && m.seen && t - m.t < 0.3) return;
  b.mem.set(id, { id, x: x + rr(-noise, noise), z: z + rr(-noise, noise), t, seen: false });
  if (hurt || !b.vis) b.alarm = Math.atan2(x - b.x, z - b.z);
}
// gunfire, from anyone (firing.js through net/avatars.js shotOut, others' through NET_ON.shot, the bots' own): every
// bot within earshot that it's a foe of notes where it came from, the further off the rougher
export function botsHear(id, x, z, quiet) {
  if (!BOTS.size || !PVP.on || PVP.ph !== 'live') return;
  const t = botNow();
  for (const b of BOTS.values()) {
    if (b.dead || id === b.id || (PVP.mode !== 'ffa' && pvpSideOf(id) === b.side)) continue;
    const d = Math.hypot(x - b.x, z - b.z); if (d < (quiet ? 9 : 28)) botNote(b, id, x, z, d * 0.12, t);
  }
}
// the freshest thing it knows of anyone (seen or heard), if it's recent enough to act on
function botKnown(b, t) { let best = null; for (const m of b.mem.values()) { if (t - m.t > BOT_MEM) continue; if (!best || m.t > best.t) best = m; } return best; }

// ---- the map as it walks it: open cells inside the arena's walls; a path on them (A*, cutting corners where the
// straight line's clear), and the places it picks: cover from someone, a spot to peek out at them from, a way round to
// their side, somewhere to go looking
const botWalk = (i, j) => i >= ARENA.x0 && i <= ARENA.x1 && j >= ARENA.z0 && j <= ARENA.z1 && inb(i, j) && !hardBlocked(i, j);
const botLine = (x0, z0, x1, z1) => { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.25); for (let s = 1; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n; for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) if (!botWalk(ci(x + ox), ci(z + oz))) return false; } return true; };
function botPath(b, gx, gz, avoid) {
  let ti = ci(gx), tj = ci(gz);
  if (!botWalk(ti, tj)) { let bd = 1e9, bi = -1, bj = -1; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (botWalk(ti + di, tj + dj) && di * di + dj * dj < bd) { bd = di * di + dj * dj; bi = ti + di; bj = tj + dj; } if (bi < 0) return []; ti = bi; tj = bj; }
  const si = ci(b.x), sj = ci(b.z), start = idx(si, sj), goal = idx(ti, tj); if (start === goal) return [[gx, gz]];
  const g = new Map([[start, 0]]), from = new Map(), heap = [[0, start]], shut = new Set();
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const N_ = 44, h = k => { const dx = Math.abs(k % N_ - ti), dz = Math.abs(((k / N_) | 0) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let n = 0;
  while (heap.length && n++ < 4000) {
    const [, k] = pop(); if (k === goal) break; if (shut.has(k)) continue; shut.add(k);
    const i = k % N_, j = (k / N_) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!botWalk(ni, nj)) continue;
      if (di && dj && (!botWalk(i + di, j) || !botWalk(i, j + dj))) continue;
      const nk = idx(ni, nj), c = g.get(k) + (di && dj ? 1.414 : 1) + (avoid && avoid.has(nk) ? 4 : 0);
      if (c < (g.get(nk) ?? 1e9)) { g.set(nk, c); from.set(nk, k); push(c + h(nk), nk); }
    }
  }
  if (!from.has(goal)) return [];
  const cells = []; for (let k = goal; k !== start; k = from.get(k)) cells.push([cxw(k % N_), cxw((k / N_) | 0)]);
  cells.reverse(); cells[cells.length - 1] = [gx, gz].map((v, q) => botWalk(ci(gx), ci(gz)) ? v : cells[cells.length - 1][q]);
  // the corners cut: from each point, on to the furthest one it can botWalk to in a straight line
  const out = []; let ax = b.x, az = b.z, k = 0;
  while (k < cells.length) { let far = k; for (let m = cells.length - 1; m > k; m--) if (botLine(ax, az, cells[m][0], cells[m][1])) { far = m; break; } out.push(cells[far]); [ax, az] = cells[far]; k = far + 1; }
  return out;
}
const botCells = (x, z, r) => { const out = []; for (let j = ci(z - r); j <= ci(z + r); j++) for (let i = ci(x - r); i <= ci(x + r); i++) if (botWalk(i, j)) { const cx = cxw(i), cz = cxw(j), d = Math.hypot(cx - x, cz - z); if (d <= r) out.push([cx, cz, d]); } return out; };
// cover from (tx, tz): a spot near it can't be seen from there, with somewhere just beside it it could peek out from;
// nearer is better, and so is about the range its class likes
function botCover(b, tx, tz) {
  const want = (BOT_STYLE[b.cls].range[0] + BOT_STYLE[b.cls].range[1]) / 2;
  const cs = botCells(b.x, b.z, 10).filter(c => !los(tx, tz, c[0], c[1]) && Math.hypot(c[0] - tx, c[1] - tz) > 3.5)
    .map(c => [c, c[2] + Math.abs(Math.hypot(c[0] - tx, c[1] - tz) - want) * 0.2 + rr(0, 0.6)]).sort((a, c) => a[1] - c[1]);
  for (const [c] of cs.slice(0, 4)) { const path = botPath(b, c[0], c[1]); if (path.length && path.length < 8) return { x: c[0], z: c[1], path }; }
  return null;
}
function botPeek(b, L) {
  const cs = botCells(b.x, b.z, 3).filter(c => los(c[0], c[1], L.x, L.z)).sort((a, c) => a[2] - c[2]);
  return cs.length ? botPath(b, cs[0][0], cs[0][1]) : null;
}
// a way round: a spot off to the side of where they were, in sight of it, got to keeping out of its sight
function botFlank(b, L) {
  const ba = Math.atan2(b.x - L.x, b.z - L.z);
  const cs = botCells(L.x, L.z, 15).filter(c => c[2] > 5 && Math.abs(angDiff(Math.atan2(c[0] - L.x, c[1] - L.z), ba)) > 0.9 && los(c[0], c[1], L.x, L.z));
  if (!cs.length) return null;
  const c = cs.map(q => [q, Math.hypot(q[0] - b.x, q[1] - b.z) + rr(0, 6)]).sort((a, q) => a[1] - q[1])[0][0];
  const avoid = new Set(); for (const q of botCells(L.x, L.z, 18)) if (los(L.x, L.z, q[0], q[1])) avoid.add(idx(ci(q[0]), ci(q[1])));
  const path = botPath(b, c[0], c[1], avoid); return path.length ? path : null;
}
// somewhere to go looking: far from where it is, toward the other side's half in the team games
function botRoam(b) {
  let best = null, bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const i = ARENA.x0 + Math.floor(rand() * (ARENA.x1 - ARENA.x0 + 1)), j = ARENA.z0 + Math.floor(rand() * (ARENA.z1 - ARENA.z0 + 1)); if (!botWalk(i, j)) continue;
    const x = cxw(i), z = cxw(j), mid = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2;
    const s = Math.min(18, Math.hypot(x - b.x, z - b.z)) + (PVP.mode !== 'ffa' ? (b.side === 'A' ? x - mid : mid - x) * 0.3 : 0) + rr(0, 6);
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return best ? botPath(b, best[0], best[1]) : [];
}

// ---- deciding, a few times a second
function botThink(b, t) {
  const st = BOT_STYLE[b.cls], T = b.vis;
  if (T) {
    b.tgt = T.id; b.seenT = t;
    const d = Math.hypot(T.x - b.x, T.z - b.z), want = st.gun(d);
    if (want !== b.cur && b.slots[want] && !b.reloading && b.mag[b.slots[want]] > 0) { b.cur = want; b.swapT = botCls(b).perks.includes('Quick draw') ? 0.3 : 0.45; b.burst = 0; }
    const id = botGunOf(b), low = b.hp < 40, dry = b.reloading || b.mag[id] <= 0;
    if ((low || (dry && d < 14 && !st.runGun)) && b.state !== 'cover' && t - (b.coverT || 0) > 0.8) {
      b.coverT = t; const cv = botCover(b, T.x, T.z);
      if (cv) { b.state = 'cover'; b.path = cv.path; b.sprint = true; b.peekAt = t + rr(1.2, 2.4); return; }
    }
    if (b.state === 'cover' && b.path.length) return;
    b.state = 'fight';
    if (t > (b.mvT || 0)) {
      b.mvT = t + rr(0.5, 1.3); const [lo, hi] = st.range;
      const covered = pvpCovered(b.x, b.z, T.x, T.z, (b.x - T.x) / (d || 1), (b.z - T.z) / (d || 1), d);
      if (d > hi || (d > lo + 1.5 && rand() < st.push * 0.55 && b.hp > 45)) { b.mv = 'push'; b.path = botPath(b, T.x, T.z); b.sprint = !!st.runGun && d > 4; }
      else if (d < lo - 1) { b.mv = 'back'; b.path = []; b.sprint = false; }
      else if (covered && rand() < 0.75) { b.mv = 'hold'; b.path = []; b.sprint = false; }
      else { b.mv = 'strafe'; b.strafe = rand() < 0.5 ? 1 : -1; b.path = []; b.sprint = false; }
    }
    return;
  }
  const L = botKnown(b, t), id = botGunOf(b);
  if (b.state === 'fight') { b.state = 'hold'; b.holdT = t + rr(0.7, 1.6); b.path = []; b.sprint = false; }
  if (b.state === 'hold' && t < b.holdT) { if (b.mag[id] < (WEAP[id].mag || 1) * 0.6) botReload(b); return; }
  // hurt: it stays in cover till its health's come back (it comes back on its own, as a player's does)
  if (b.state === 'cover' && b.hp < 70 && t - b.hurtT < BOT_REGEN.full + 1) { if (b.mag[id] < (WEAP[id].mag || 1)) botReload(b); return; }
  if (b.mag[id] < (WEAP[id].mag || 1) * 0.5 && !b.reloading) botReload(b);
  if (!L) {
    if (b.state !== 'roam' || !b.path.length) { b.state = 'roam'; b.path = botRoam(b); b.sprint = rand() < 0.55; }
    return;
  }
  if (b.state === 'cover') {
    if (b.path.length || b.reloading || t < b.peekAt) return;
    const pk = botPeek(b, L); b.state = 'peek'; b.path = pk || []; b.sprint = false; b.peekEnd = t + rr(1.1, 1.8); return;
  }
  if (b.state === 'peek' && (b.path.length || t < b.peekEnd)) return;
  if (b.state === 'hunt' || b.state === 'flank') {
    if (b.path.length) return;
    if (Math.hypot(L.x - b.x, L.z - b.z) < 2.5 || b.state === 'hunt') { b.mem.delete(L.id); b.state = 'roam'; b.path = []; return; }
  }
  // what botNow, with someone out there it can't see: straight at where they were, or round to their side
  const go = rand() < BOT_STYLE[b.cls].push + (b.hp > 80 ? 0.15 : 0) - (b.hp < 50 ? 0.3 : 0);
  const fl = go ? null : botFlank(b, L);
  if (fl) { b.state = 'flank'; b.path = fl; b.sprint = Math.hypot(L.x - b.x, L.z - b.z) > 9; }
  else { b.state = 'hunt'; b.path = botPath(b, L.x, L.z); b.sprint = Math.hypot(L.x - b.x, L.z - b.z) > 12; }
}
function botReload(b) {
  const id = botGunOf(b), D = WEAP[id], room = (D.mag || 1) - b.mag[id];
  if (b.reloading || room <= 0 || b.res[id] <= 0) return;
  b.reloading = true; b.relT = (D.reload || (D.perShell || 0.45) * Math.min(room, b.res[id]) + 0.3) * b.quick;
}

// ---- every frame
export function botsUpdate(dt) {
  if (!BOTS.size) return;
  botClock += dt;
  const t = botNow(), live = PVP.ph === 'live';
  for (const b of BOTS.values()) {
    if (b.dead) {
      if (live && PVP.mode !== 'rounds' && b.respawn > 0 && (b.respawn -= dt) <= 0) botSpawn(b, false);
      botPose(b, dt, t); continue;
    }
    if (!live) { b.vx = b.vz = 0; botAimStep(b, dt, t, null); botPose(b, dt, t); continue; }
    b.prot = Math.max(0, (b.prot || 0) - dt);
    // reeling from a shove: carried back on it, no moving or firing of its own
    if (b.stun > 0) { b.stun -= dt; const f = Math.exp(-dt * 6); b.vx *= f; b.vz *= f; moveCircle(b, b.vx * dt, b.vz * dt, 0.3, false); botAimStep(b, dt, t, null); botPose(b, dt, t); continue; }
    const foes = botFoes(b);
    if ((b.senseT -= dt) <= 0) { b.senseT = 0.1; botSense(b, foes, t); }
    if ((b.thinkT -= dt) <= 0) { b.thinkT = rr(0.16, 0.26); botThink(b, t); }
    botMove(b, dt, t);
    botAimStep(b, dt, t, b.vis);
    botGun(b, dt, t, foes);
    // bleeding, and a bandage going on and the health it gives coming in
    if (b.bleed > 0) { b.bleed = b.hp <= BOT_BLEED.floor ? 0 : Math.max(0, b.bleed - dt); b.hp = Math.max(Math.min(b.hp, BOT_BLEED.floor), b.hp - BOT_BLEED.dps * dt); }
    if (b.bleed > 0 || b.hp >= 100) { if (b.bleed > 0) b.calm = 0; b.regen0 = null; }
    if (!(b.bleed > 0) && b.hp < 100 && (b.calm += dt) > BOT_REGEN.wait) { if (b.regen0 == null) b.regen0 = b.hp; const u = clamp((b.calm - BOT_REGEN.wait) / (BOT_REGEN.full - BOT_REGEN.wait), 0, 1); b.hp = Math.max(b.hp, b.regen0 + (100 - b.regen0) * u * u); }
    botPose(b, dt, t);
  }
}
// moving: along its path, or round whoever it's fighting (side to side, backing off, pressing in), never through a
// wall, and not into anyone else
function botMove(b, dt, t) {
  let dx = 0, dz = 0;
  const T = b.vis, fighting = b.state === 'fight' && T;
  if (b.path.length && (!fighting || b.mv === 'push')) {
    const [px, pz] = b.path[0], ex = px - b.x, ez = pz - b.z, d = Math.hypot(ex, ez);
    if (d < 0.35) { b.path.shift(); if (b.state === 'roam' && rand() < 0.22) { b.stopT = t + rr(0.3, 0.8); b.glanceT = 0; } }
    else if (t > b.stopT) { dx = ex / d; dz = ez / d; }
  } else if (fighting) {
    const ex = T.x - b.x, ez = T.z - b.z, d = Math.hypot(ex, ez) || 1;
    if (b.mv === 'strafe') {
      dx = ez / d * b.strafe; dz = -ex / d * b.strafe;
      if (!botWalk(ci(b.x + dx * 0.7), ci(b.z + dz * 0.7))) { b.strafe = -b.strafe; dx = -dx; dz = -dz; }
    } else if (b.mv === 'back') { dx = -ex / d; dz = -ez / d; if (!botWalk(ci(b.x + dx * 0.7), ci(b.z + dz * 0.7))) { dx = dz = 0; b.mv = 'strafe'; b.strafe = 1; } }
  }
  // keeping off everyone else
  const near = [[P.x, P.z, P.dead], ...[...NET.peers.values()].map(q => { const o = BOTS.get(q.id); return o ? [o.x, o.z, o.dead, o === b] : [q.x, q.z, q.dead]; })];
  for (const [ox, oz, dead, self] of near) { if (dead || self || ox === undefined) continue; const ex = b.x - ox, ez = b.z - oz, d = Math.hypot(ex, ez); if (d < 0.75 && d > 1e-3) { dx += ex / d * (0.75 - d) * 2; dz += ez / d * (0.75 - d) * 2; } }
  const aimed = !b.sprint && (b.vis || b.state !== 'roam');
  if (b.sprint && !(dx || dz)) b.sprint = false;
  const sp = BOT_MOVE.base * (BOT_MOVE.cls[b.cls] || 1) * (b.sprint ? BOT_MOVE.sprint : aimed ? BOT_MOVE.aimed : 1) * (b.reloading ? 0.85 : 1);
  const L = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * 10), tvx = L > 1e-3 ? dx / Math.max(1, L) * sp : 0, tvz = L > 1e-3 ? dz / Math.max(1, L) * sp : 0;
  b.vx += (tvx - b.vx) * k; b.vz += (tvz - b.vz) * k;
  const x0 = b.x, z0 = b.z;
  moveCircle(b, b.vx * dt, b.vz * dt, 0.3, false);
  // stuck on something: a new way there
  if (L > 0.2 && Math.hypot(b.x - x0, b.z - z0) < sp * dt * 0.2) { if ((b.stuck += dt) > 0.7) { b.stuck = 0; b.path = []; b.mvT = 0; if (b.state === 'roam' || b.state === 'hunt' || b.state === 'flank') b.state = 'roam'; } } else b.stuck = 0;
}
// where it looks: at whoever it's fighting (its aim settling onto them), else where it's running, at the last place it
// knew of someone, toward a noise, or about it botNow and then
function botAimStep(b, dt, t, T) {
  const S = botSk(); let want = b.aim;
  b.err *= Math.exp(-dt * S.settle); b.spray = Math.max(0, b.spray - dt * 0.08);
  if (T) want = Math.atan2(T.x - b.x, T.z - b.z) + b.err + Math.sin(t * 2.3 + b.seed) * 0.015;
  else if (b.alarm !== undefined) { want = b.alarm; if (Math.abs(angDiff(want, b.aim)) < 0.1) b.alarm = undefined; }
  else {
    const L = botKnown(b, t), mv = Math.hypot(b.vx, b.vz) > 0.5 ? Math.atan2(b.vx, b.vz) : null;
    if (b.sprint && mv !== null) want = mv;
    else if (L && t - L.t < 8 && (b.state === 'hold' || b.state === 'cover' || b.state === 'peek' || Math.hypot(L.x - b.x, L.z - b.z) < 14)) want = Math.atan2(L.x - b.x, L.z - b.z);
    else if (mv !== null) want = mv;
    else { if (t > b.glanceT) { b.glanceT = t + rr(1.2, 2.8); b.look = b.aim + rr(-1.2, 1.2); } want = b.look; }
  }
  // (turning as a hand on a mouse does: speeding up toward it and easing off as it gets there, never a snap)
  const da = angDiff(want, b.aim), top = S.turn * (T ? 1 : 0.7), wv = clamp(da * 6, -top, top);
  b.av += (wv - b.av) * (1 - Math.exp(-dt * 7)); b.aim += b.av * dt;
}
// its gun: switching, reloading, and firing while someone's in its sights (after a moment to react, once its aim's
// on them, in the gun's reach): short bursts at range, longer ones close in, single aimed shots from the rest
function botGun(b, dt, t, foes) {
  if (b.swapT > 0) { b.swapT -= dt; return; }
  const id = botGunOf(b), D = WEAP[id];
  if (b.reloading) { if ((b.relT -= dt) <= 0) { const n = Math.min((D.mag || 1) - b.mag[id], b.res[id]); b.mag[id] += n; b.res[id] -= n; b.reloading = false; } return; }
  b.cd -= dt;
  const T = b.vis; if (!T || t < b.react || (b.sprint && !BOT_STYLE[b.cls].runGun)) return;
  const d = Math.hypot(T.x - b.x, T.z - b.z);
  if (d > (BOT_REACH[id] || 25)) return;
  if (Math.abs(angDiff(Math.atan2(T.x - b.x, T.z - b.z), b.aim)) > 0.1 + PVP_R / Math.max(1, d)) return;
  if (b.mag[id] <= 0) { botReload(b); return; }
  if (b.cd > 0) return;
  const auto = D.rate < 0.12 && !D.pellets;
  if (auto) {
    if (b.burst <= 0) { b.burst = d < 8 ? Math.round(rr(7, 13)) : d < 18 ? Math.round(rr(4, 7)) : Math.round(rr(2, 4)); }
    b.burst--; b.cd = b.burst > 0 ? D.rate : rr(0.2, 0.42);
  } else b.cd = Math.max(D.rate, id === 'hunting' ? D.rate + rr(0.1, 0.4) : id === 'dbl' ? rr(0.14, 0.3) : rr(0.18, 0.32) + D.rate * 0.4);
  botShoot(b, id, D, foes, d);
}
// a shot: each round (or pellet) along where it's aiming, off by how steady it is, stopping at the first wall; anyone
// on that line takes it as a player's would (pvp/pvp.js: by where it lands, a head double, low cover keeping most of a
// body out of it), and everyone sees and hears it
function botShoot(b, id, D, foes, d) {
  const S = botSk(), pel = D.pellets || 1, shells = D.ammo === 'shells', gt = b.gt[id] || {};
  b.mag[id]--;
  const moving = Math.hypot(b.vx, b.vz), T = b.vis, tv = T ? Math.hypot(T.vx, T.vz) : 0;
  const sig = S.sig + (pel > 1 ? 0 : (D.spread || 0.03) * 0.5) + (moving > 0.5 ? (b.sprint ? 0.08 : 0.025) : 0) + b.spray + Math.min(BOT_LEAD.max, tv * BOT_LEAD.k);
  const common = botGauss() * sig; b.spray = Math.min(0.07, b.spray + (D.rate < 0.12 ? 0.006 : 0.012));
  const ox = b.x + Math.sin(b.aim) * 0.55, oz = b.z + Math.cos(b.aim) * 0.55, oy = 1.36, on = new Map(), ends = [];
  for (let k = 0; k < pel; k++) {
    const a = b.aim + common + (pel > 1 ? (rand() * 2 - 1) * D.spread * (gt.choke ? 0.8 : 1) * 0.85 : 0), dx = Math.sin(a), dz = Math.cos(a);
    let wallT = 70; for (let s = 0.3; s < 70; s += 0.08) { const x = ox + dx * s, z = oz + dz * s; if (bulletBlocked(x, z) || !inb(ci(x), ci(z))) { wallT = s; break; } }
    let hit = null, ht = wallT, rel = 0;
    for (const f of foes) { const vx = f.x - ox, vz = f.z - oz, tt = vx * dx + vz * dz, off = vx * dz - vz * dx; if (tt > 0.2 && tt < ht && off * off < PVP_R * PVP_R) { hit = f; ht = tt; rel = off / PVP_R; } }
    let endK = wallT < 70 ? 1 : 3, ey = oy + rr(-0.2, 0.05);
    if (hit) {
      const r = rand(), part = r < S.head ? 'head' : r < 0.6 ? 'torso' : r < 0.78 ? (rel > 0 ? 'armR' : 'armL') : (rel > 0 ? 'legR' : 'legL');
      if (pvpCovered(hit.x, hit.z, ox, oz, dx, dz, ht) && part !== 'head' && !part.startsWith('arm')) { ht = Math.max(0.3, ht - 0.9); endK = 1; }   // into the cover in front of them
      else {
        const s = on.get(hit) || { d: 0, n: 0, head: false, part, top: 0 }, dm = (PVP_DMG[id] || 20) * PVP_TTK * falloff(id, ht) * (part === 'head' && shells ? PVP_HEAD_SHELL : PVP_PART[part]);
        s.d += dm; s.n++; if (part === 'head') s.head = true; if (dm > s.top) { s.top = dm; s.part = part; } on.set(hit, s);
        endK = 0; ey = part === 'head' ? 1.62 : part.startsWith('leg') ? 0.5 : 1.15;
      }
    }
    if (ends.length < 5 && (k < 4 || rand() < 0.5)) ends.push([bR3(ox + dx * ht), bR3(ey), bR3(oz + dz * ht), endK, pel > 2 ? 0.045 : 0.08]);
  }
  for (const [f, s] of on) botDeal(b, f, Math.round(s.d), s.head ? 'head' : s.part, id, shells ? s.n >= 3 && rand() < PVP_BLEED.shells : rand() < PVP_BLEED.gun);
  const quiet = !!gt.supp, m = { w: id, q: quiet ? 1 : 0, x: bR3(ox), y: oy, z: bR3(oz), e: ends, st: quiet ? 'supp' : 'std', pw: bR3(tracerPower(D)), sh: shells ? 1 : 0, dr: 0 };
  NET_ON.shot(Object.assign({ t: 'shot', f: b.id }, m)); netAs(b.id, 'shot', m);
  botsHear(b.id, ox, oz, quiet);
}
// what a shot did to someone: you take it here, another player's game is told, another bot takes it at once
function botDeal(b, f, d, part, w, bleed) {
  if (d <= 0) return;
  const m = { d, p: part, w, x: bR2(b.x), z: bR2(b.z), b: bleed ? 1 : 0 };
  if (f.id === NET.id) NET_ON.ph(Object.assign({ t: 'ph', f: b.id, to: NET.id }, m));
  else if (BOTS.has(f.id)) botHit(f.id, Object.assign({ f: b.id }, m));
  else netAs(b.id, 'ph', Object.assign({ to: f.id }, m), f.id);
}
// a bot hit (by anyone: pvp/pvp.js pvpSend for your shots, NET_BOT.ph for another player's): it bleeds on everyone's
// screen, knows roughly where that came from, and goes down at nothing left
export function botHit(id, m) {
  const b = BOTS.get(id), t = botNow(); if (!b || b.dead || PVP.ph !== 'live' || b.prot > 0) return;
  b.hp -= m.d; b.last = { id: m.f, w: m.w, head: m.p === 'head', d: m.d, at: t, x: m.x, z: m.z, pt: m.p };
  b.hurtT = t; b.calm = 0; b.regen0 = null; botNote(b, m.f, m.x, m.z, 1.5, t, true);
  const dx = b.x - m.x, dz = b.z - m.z, L = Math.hypot(dx, dz) || 1, pb = { x: bR2(b.x), z: bR2(b.z), dx: bR2(dx / L), dz: bR2(dz / L), h: m.p === 'head' ? 1 : 0, sh: m.f };
  NET_ON.pb(Object.assign({ t: 'pb', f: b.id }, pb)); netAs(b.id, 'pb', pb);
  if (b.hp <= 0) botDie(b, t);
}
NET_BOT.ph = m => botHit(m.to, m);
// shoved (pvp/pvp.js pvpShove, or another player's 'pv'): thrown back, reeling, its aim knocked off
export function botShoved(id, m) {
  const b = BOTS.get(id); if (!b || b.dead || PVP.ph !== 'live' || b.prot > 0) return;
  const k = m.p || 1; b.stun = 0.7 * k; b.vx = m.dx * 5 * k; b.vz = m.dz * 5 * k; b.av += rr(-4, 4); b.err += rr(0.2, 0.35) * (rand() < 0.5 ? -1 : 1); b.burst = 0; b.sprint = false;
}
NET_BOT.pv = m => botShoved(m.to, m);
function botDie(b, t) {
  b.dead = true; b.hp = 0; b.reloading = false; b.vx = b.vz = 0; b.path = [];
  const L = b.last && t - b.last.at < 8 ? b.last : null;
  const m = { k: L ? L.id : '', v: b.id, w: L ? L.w : '', hs: L && L.head ? 1 : 0, hb: L && L.head && L.d >= 60 ? 1 : 0, x: bR2(b.x), z: bR2(b.z), dm: L ? Math.round(Math.hypot(b.x - L.x, b.z - L.z)) : 0, pt: L ? L.pt : '' };
  b.p.dead = true; botPose(b, 0, t, true);
  netSend('pk', m); pvpKilled(m);
  b.respawn = PVP_T.respawn;
  // dying a lot with its class (BOT_SWAP.deaths more deaths than kills with it): another, one that answers how it died
  // (shot from far off, the long-range ones; up close, the close-range ones)
  const rec = b.rec[b.cls] || (b.rec[b.cls] = { k: 0, d: 0 }); rec.d++;
  if (rec.d - rec.k >= BOT_SWAP.deaths) {
    const dm = m.dm || 12, pool = dm > BOT_SWAP.far ? ['mark', 'rifle', 'gunner'] : dm < BOT_SWAP.near ? ['breach', 'rush'] : PVP_CLASSES.map(c => c.id);
    const opts = pool.filter(c => c !== b.cls); b.cls = opts[Math.floor(rand() * opts.length)] || b.cls; b.rec[b.cls] = { k: 0, d: 0 };
  }
}

// ---- its body, as a player's pose (net/avatars.js): its legs through the stride (the one for how it's moving against
// where it aims, eased in from standing), its arms and gun aimed, from the hip or down at a sprint; to its own game
// every frame, to everyone else's fifteen times a second
const BOT_HZ = 15, BOT_TAU = Math.PI * 2;
function botPose(b, dt, t, now_) {
  const id = botGunOf(b) || 'pistol', G = BOT_GUN[id] || BOT_GUN.pistol, sp = Math.hypot(b.vx, b.vz);
  const run = b.sprint && sp > 3.2, fighting = !!b.vis || b.state !== 'roam';
  const upK = run && !(BOT_STYLE[b.cls].runGun && b.vis) ? 'run' : fighting && !b.reloading ? 'aim' : 'hip';
  const up = G[upK], w = G[upK === 'run' ? 'rw' : upK === 'aim' ? 'aw' : 'hw'];
  const mvA = Math.atan2(b.vx, b.vz), face = run && upK === 'run' ? mvA : b.aim;
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
  }
  if (!now_ && (b.poseT -= dt) > 0 && b.sentLocal) { NET_ON.p(Object.assign({ t: 'p', f: b.id }, botMsg(b, j, id, w, upK, false))); return; }
  b.poseT = 1 / BOT_HZ; b.sentLocal = true;
  const m = botMsg(b, j, id, w, upK, true);
  NET_ON.p(Object.assign({ t: 'p', f: b.id }, m)); netAs(b.id, 'p', m);
}
function botMsg(b, j, id, w, upK, full) {
  const k = SLOTS.indexOf(b.cur), C = botCls(b); let sv = 0;
  SLOTS.forEach((s, i) => { if (!b.slots || !b.slots[s]) return; if (s !== b.cur || s === 'side') sv |= 1 << (4 + i); if (s !== b.cur) sv |= 1 << i; });
  const m = { x: bR3(b.x), z: bR3(b.z), vx: bR2(b.vx), vz: bR2(b.vz), hp: Math.round(Math.max(0, b.hp)), mh: 100, dead: b.dead ? 1 : 0, v: 0, pk: 0, cw: 0, j: j.slice(), fl: 0, vw: [bR2(b.aim), 1.2, 2.4, 0, 0], st: [0, 0, 0], hl: 0,
    ap: b.dead ? 0 : [bR2(b.x + Math.sin(b.aim) * 4), bR2(b.z + Math.cos(b.aim) * 4)], fc: !b.dead && upK === 'aim' ? [b.vis ? 0.5 : 0.1, 0, botHurtK(b), 1] : 0,
    wp: b.dead ? [] : [[k, ...w, 0]], sv, ex: [0, 0], lk: b.lk, am: [b.mag ? b.mag[id] : 0, b.res ? b.res[id] : 0, WEAP[id].mag || 1, b.reloading ? 1 : 0, 0] };
  if (full) { m.wn = WEAP[id].name; m.wid = id; }
  if (!C) delete m.fc;
  return m;
}
const botHurtK = b => clamp((botNow() - b.hurtT) < 0.6 ? 1 : 0, 0, 1);
