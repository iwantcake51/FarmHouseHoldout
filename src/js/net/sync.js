// Co-op: keeping every player's farm the same. The host's game runs the zombies (where they go, who they swing at,
// the boards they tear down), the waves and the clock, and sends where everything is a dozen times a second; on a
// joiner's screen each zombie is the host's, eased to where it is there and animated here (updateZombies,
// zombies/ai.js). A spawn comes with its seed, so each zombie is built alike everywhere (withSeed, core/math.js).
// Hits are the hitter's: whoever lands one works out what it does (the damage, what comes off, whether it dies and how
// it falls, what it drops) and sends that, as it happened, for everyone else to play out the same (netAct).
// Your survivor is yours alone: your health, your guns, your scrap and your cards; the others see your pose
// (net/avatars.js) and are told when you board a window or pick up a drop.

import { kbd } from '../input/keybinds.js';
import { cv, GUN_Y, scene } from '../core/renderer.js';
import { angDiff, cache, clamp, N, withSeed } from '../core/math.js';
import { NET, NET_ON, netBeat, netLink, netSend } from './net.js';
import { box } from '../core/geometry.js';
import { cell, cxw, FENCE } from '../world/grid.js';
import { openings } from '../world/house.js';
import { breakDoor, doorBlow, doorWear, HOUSE_DOORS } from '../world/interior.js';
import { breakFence } from '../world/fence.js';
import { P } from '../player/player.js';
import { LOOK, rollLook, spawnLook } from '../player/look.js';
import { WEAP } from '../weapons/gun-stats.js';
import { EFF, hpCap, magSize, recomputeEff, run, W, W8 } from '../game/run-state.js';
import { GM } from '../weapons/gun-materials.js';
import { gearSpec } from '../player/gear.js';
import { buildGuns } from '../weapons/build-weapons.js';
import { pickups } from '../pickups/pickups.js';
import { makeRagdoll, ragdolls } from '../zombies/deaths.js';
import { zombies } from '../zombies/zombie-types.js';
import { startClimb0 } from '../zombies/climb.js';
import { spawnZombie } from '../zombies/spawn.js';
import { setTimeScale, timeScale } from '../game/hit-feedback.js';
import { breakArmor, crackArmor } from '../zombies/armor-break.js';
import {
  ammoDrop, blowApart, crushHead, hitFx, killEnd, killZombie0, NECK_PUMP, sever, splitHead
} from '../zombies/damage.js';
import { headShot, severLower } from '../zombies/wounds.js';
import { explode, grenades } from '../weapons/explosives.js';
import { addBoard, boardJolt, breakBoard, clearBoards, hurtBoard, METAL, tearAll } from '../barricades/planks.js';
import { addGrate, applyMetal, regrate } from '../barricades/metal-bars.js';
import { nz } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import {
  breakT, clearT, phase, setBreakT, setClearT, setShake, setSpawnQ, setTod, shake, spawnQ, state, tod
} from '../game/state.js';
import { shoveZombie } from '../player/shove.js';
import { breakMax, clearedDone, setBreakMax, surge, waveBar, waveBegins, waveCleared, waveSub } from '../waves/waves.js';
import { handNo } from '../upgrades/upgrade-screen.js';
import { deathCineEnd, die } from '../ui/screens.js';
import { feed, setH } from '../ui/hud-text.js';
import { visAt } from '../lighting/vision.js';
import { repairBarricade } from '../barricades/interactions.js';
import { BRUTE_SMASH, zStrike, zStruckFx } from '../zombies/ai.js';
import { dashHit, dashStart } from '../zombies/brute-dash.js';
import { bumpAside, knockDown } from '../zombies/knockdown.js';
import { launchGlob, spitWindFx } from '../zombies/spitter.js';
import { unragYou } from '../player/player-ragdoll.js';
import { ANIM } from '../player/animation.js';
import { heardFrom, netDropAvatar, poseOut, updateAvatars } from './avatars.js';
import { renderTeam } from './lobby.js';
import { renderSpec, SPEC } from './spectate.js';
import { teamBonus } from './teamwork.js';
import { frTick } from './friends.js';
import { chatTick } from './chat.js';

export let NREC = null, NREP = null;   // a hit of yours being written down to send; a teammate's being played out
export const NZ = new Map();           // zombies by the id the host gave them
let zSeq = 0, snapT = 0, overT = 0;
export const nr = v => Math.round(v * 100) / 100;
export const netTeam = () => netLink() ? 1 + NET.peers.size : 1;
// whoever's left standing: you, and in co-op your teammates (their latest pose: where they are, whether they're down)
const ME = { me: true, x: 0, z: 0, dead: false, vault: false, id: '' }, TG = [];
export function netTargets() {
  ME.x = P.x; ME.z = P.z; ME.dead = !!P.dead; ME.vault = !!P.vault; ME.id = NET.id;
  TG.length = 0; TG.push(ME);
  if (netLink()) for (const p of NET.peers.values()) if (p.x !== undefined) TG.push(p);
  return TG;
}
export const netAllDown = () => netTargets().every(q => q.dead);
// ---- a teammate who goes down in a wave comes back in the next: out of the fog with its first zombies, a walker in
// their own clothes and the armour they had (zTurned, zombies/zombie-looks.js). The host keeps who went down (TURN_Q,
// by id: turnedDown, from screens.js for itself and avatars.js for the others) and sends them in as the next wave
// starts (spawnTurned, waves/waves.js)
const TURN_Q = new Set();
export function turnedDown(id) { if (netLink() && NET.host && phase === 'wave') TURN_Q.add(id); }
function turnedOf(id) {
  if (id === NET.id) return LOOK.cur ? { look: LOOK.cur, gear: gearSpec() } : undefined;
  const p = NET.peers.get(id); return p && p.look ? { look: p.look, gear: p.lo && p.lo.gear } : undefined;
}
export function spawnTurned() { if (netLink() && NET.host) for (const id of TURN_Q) if (turnedOf(id)) netSpawn('walker', id); TURN_Q.clear(); }

// ---- zombies coming in: the host's seed, so the same one comes in everywhere (tu: the teammate it was, if it was one)
export function netSpawn(type, tu) {
  if (!netLink()) return spawnZombie(type);
  const s = (Math.random() * 4294967296) >>> 0, id = ++zSeq;
  withSeed(s, () => spawnZombie(type, tu ? turnedOf(tu) : undefined)); const z = zombies[zombies.length - 1]; z.id = id; NZ.set(id, z);
  netSend('zs', { id, ty: type, s, wv: run.wave, tu: tu || undefined });
}
NET_ON.zs = m => {
  if (NET.host || !netLink()) return;
  const wv = run.wave; run.wave = m.wv;
  withSeed(m.s, () => spawnZombie(m.ty, m.tu ? turnedOf(m.tu) : undefined)); run.wave = wv;
  const z = zombies[zombies.length - 1]; z.id = m.id; NZ.set(m.id, z); z.nx = z.x; z.nz = z.z; z.nf = z.face;
};
// a climb over a fence or in at a window starts on the host: the same climb (its seed) plays out here
export function startClimb(z, kind, fx, fz, dx, dz, x1, z1, o) {
  if (!netLink() || !NET.host || !z.id) return startClimb0(z, kind, fx, fz, dx, dz, x1, z1, o);
  const s = (Math.random() * 4294967296) >>> 0;
  withSeed(s, () => startClimb0(z, kind, fx, fz, dx, dz, x1, z1, o));
  netSend('zc', { id: z.id, k: kind, fx: nr(fx), fz: nr(fz), dx: nr(dx), dz: nr(dz), x1: nr(x1), z1: nr(z1), o: o ? openings.indexOf(o) : -1, s });
}
NET_ON.zc = m => { const z = NZ.get(m.id); if (!z || z.dead || NET.host) return; withSeed(m.s, () => startClimb0(z, m.k, m.fx, m.fz, m.dx, m.dz, m.x1, m.z1, openings[m.o] || null)); };

// ---- where the host has everything, a dozen times a second
function snapOut(rdt) {
  snapT -= rdt; if (snapT > 0) return; snapT = 1 / 12;
  const zs = [];
  for (const z of zombies) if (z.id && !z.dead) zs.push(z.id, nr(z.x), nr(z.z), nr(z.face), Math.round(z.hp), z.out ? 1 : 0, z.atkBoard ? openings.indexOf(z.atkBoard) + 1 : z.atkDoor ? -1 - HOUSE_DOORS.list.indexOf(z.atkDoor) : 0);   // (a door it's beating on: below 0)
  netSend('w', { td: nr(tod), bt: nr(breakT), bm: breakMax, sq: spawnQ.length, lu: surge.lull > 0 ? 1 : 0, z: zs, b: openings.map(o => o.boards.map(h => Math.round(h))), g: openings.map(o => o.grate ? Math.round(o.grate.hp0) * o.grate.face : 0), mt: METAL.on ? METAL.tier + 1 : 0, dh: HOUSE_DOORS.list.map(d => Math.round(d.hp)) });
}
NET_ON.w = m => {
  if (NET.host || !netLink()) return;
  if (Math.abs(angDiff(m.td / 24 * 6.2832, tod / 24 * 6.2832)) > 0.02) setTod(m.td); else setTod(tod + ((m.td - tod) * 0.3));
  if (phase === 'break') { setBreakT(m.bt); setBreakMax(m.bm); }
  if (spawnQ.length !== m.sq) setSpawnQ(new Array(m.sq).fill('walker'));
  surge.lull = m.lu ? 1 : 0;   // (the host's lull between surges, waves/waves.js: shown under the wave number)
  const now = performance.now(), zs = m.z;
  for (let k = 0; k < zs.length; k += 7) {
    const z = NZ.get(zs[k]); if (!z || z.dead) continue;
    // how fast it's going between this snapshot and the last, so it can be drawn where it is now, not where it was
    if (z.nt) { const dt = (now - z.nt) / 1000; if (dt > 0.02) { const k2 = 0.5; z.nvx = (z.nvx || 0) * (1 - k2) + clamp((zs[k + 1] - z.nx) / dt, -8, 8) * k2; z.nvz = (z.nvz || 0) * (1 - k2) + clamp((zs[k + 2] - z.nz) / dt, -8, 8) * k2; } }
    z.nx = zs[k + 1]; z.nz = zs[k + 2]; z.nf = zs[k + 3]; z.nt = now;
    if (zs[k + 4] < z.hp) z.hp = zs[k + 4];
    z.out = !!zs[k + 5]; z.atkBoard = zs[k + 6] > 0 ? openings[zs[k + 6] - 1] : null; z.atkDoor = zs[k + 6] < 0 ? HOUSE_DOORS.list[-1 - zs[k + 6]] || null : null;
  }
  // the doors between rooms: how beaten they are, the same pieces broken out of them (world/interior.js)
  if (m.dh) m.dh.forEach((h, k) => { const d = HOUSE_DOORS.list[k]; if (d && h < d.hp) { d.hp = h; doorWear(d, null); } });
  // the metalwork bench and how far the grates are plated (the team's: barricades/metal-bars.js)
  if (m.mt !== undefined && m.mt !== (METAL.on ? METAL.tier + 1 : 0)) applyMetal(m.mt > 0, Math.max(0, m.mt - 1), m.mt > 0 && !METAL.on);
  // the boards: how many on each opening and how worked loose they are (the host's word for it, unless one went up or
  // came down here a moment ago and the host hasn't caught up yet); a grate (gh: what it went up out of) is one
  m.b.forEach((hb, k) => {
    const o = openings[k]; if (!o || now < (o.netT || 0)) return;
    const gh = m.g && Math.abs(m.g[k]), gf = m.g && Math.sign(m.g[k]);   // (its strength, and the side it's on)
    if (gh && hb.length) {
      if (!o.grate) { clearBoards(o); addGrate(o, hb[0], gf, gh); }
      else if (o.grate.tier !== METAL.tier) regrate(o);
      o.grate.hp0 = gh; o.boards[0] = hb[0]; return;
    }
    if (o.grate && hb.length) clearBoards(o);   // (boards there in the host's game, a grate here: the host's goes)
    while (o.boards.length > hb.length) breakBoard(o, null);
    while (o.boards.length < hb.length) addBoard(o, hb[o.boards.length], 1);
    hb.forEach((h, q) => { o.boards[q] = h; });
  });
};
// a joiner's zombie each frame: eased to where the host has it (a climb plays out on its own here, from its start)
export function puppetMove(z, dt) {
  if (z.vault || z.nx === undefined) return;
  const ahead = Math.min(0.15, (performance.now() - (z.nt || 0)) / 1000 + 0.04);   // (carried on along its way, a little)
  const k = 1 - Math.exp(-dt * 13), dx = z.nx + (z.nvx || 0) * ahead - z.x, dz = z.nz + (z.nvz || 0) * ahead - z.z;
  if (dx * dx + dz * dz > 9) { z.x = z.nx; z.z = z.nz; } else { z.x += dx * k; z.z += dz * k; }
  z.face += angDiff(z.nf, z.face) * k;
}
// and at the boards (or the door) the host says it's tearing at: a blow each beat, the plank jumping, a little dust
export function puppetBoard(z, dme) {
  const d = z.atkDoor;
  if (d && !d.broken) { z.face += angDiff(Math.atan2(d.cx - z.x, d.cz - z.z), z.face) * 0.2; if (z.atk <= 0) { z.atk = z.type === 'brute' ? BRUTE_SMASH.t : 0.9; z.lunge = 1; doorBlow(d, z, z.type === 'brute', dme); } return; }
  const o = z.atkBoard; if (!o || !o.boards.length) return;
  z.face += angDiff(Math.atan2(o.x - z.x, o.z - z.z), z.face) * 0.2;
  if (z.atk > 0) return;
  if (z.type === 'brute') { z.atk = z.smashT = BRUTE_SMASH.t; z.lunge = 1; soundAt(z.x, z.z, () => nz(0.16, 'lowpass', 420, 90, 0.4 * clamp(1 - dme / 24, 0, 1)), true); boardJolt(o, z, true); if (!o.grate) boardJolt(o, z); setShake(Math.max(shake, 0.2 * clamp(1 - dme / 9, 0, 1))); }   // (a brute's smash, zombies/ai.js)
  else { z.atk = 0.9; z.lunge = 1; soundAt(z.x, z.z, () => nz(0.08, 'lowpass', 700, 200, 0.18 * clamp(1 - dme / 18, 0, 1)), true); boardJolt(o, z); }
}
// a swing from the host's zombie: everyone sees it lunge, and if it was at you, it lands on you
// a spitter rearing back, and letting go (zombies/spitter.js): the same glob flies in every game
NET_ON.spw = m => { const z = NZ.get(m.id); if (NET.host || !z || z.dead) return; const s = z.sp || (z.sp = { cd: 0, w: 0, thr: 0 }); s.w = 0.001; spitWindFx(z); };
NET_ON.spt = m => { const z = NZ.get(m.id); if (NET.host || !z) return; const s = z.sp || (z.sp = { cd: 0, w: 0, thr: 0 }); s.w = 0; s.thr = 1; launchGlob(z, ...m.a); };
export function netLunge(z, at, armMul) { if (netLink() && z.id) netSend('za', { id: z.id, h: at || '', am: armMul || 1 }); }
NET_ON.za = m => {
  const z = NZ.get(m.id); if (!z || z.dead) return;
  if (!NET.host) { z.atk = 1.05; z.lunge = 1; }
  if (m.h === NET.id && !P.dead && state !== 'title') { zStrike(z, m.am); zStruckFx(); }
};

// a zombie a brute's dash ran down or clipped (zombies/knockdown.js): the same fall, or the same stagger aside, on every
// screen, from the host's seed (b: the side it was clipped on, 0 if it went down)
NET_ON.zk = m => { const z = NZ.get(m.id); if (NET.host || !z || z.dead || state === 'title') return; if (m.b) bumpAside(z, m.dx, m.dz, m.b, m.s); else knockDown(z, m.dx, m.dz, m.s); };
// a brute's dash (zombies/brute-dash.js): everyone sees the crouch and the stripe; if it runs into you, you take it
NET_ON.zdw = m => { if (NET.host) return; const z = NZ.get(m.id); if (z && !z.dead && !z.dash) dashStart(z, m.dx, m.dz, m.L); };
NET_ON.zdh = m => { const z = NZ.get(m.id); if (z && m.h === NET.id && !P.dead && state !== 'title') { dashHit(z, m.dx, m.dz); zStruckFx(); } };

// ---- hits: written down as they happen here, played out the same everywhere else
export function netRec(...op) { if (NREC) NREC.ops.push(op); }
export function netHitRec(z, dealt, part, kb, wId) { if (NREC) NREC.ops.push(['d', nr(dealt), part, nr(kb), wId, nr(z.burn || 0), nr(z.bleed || 0), nr(z.bleedR || 0), part !== 'torso' && part !== 'head' ? nr(z.lhp[part]) : 0]); }
export function netAct(z, dx, dz, fn) {
  if (!netLink() || NREP || NREC || !z.id) return fn();
  NREC = { ops: [] }; const np = pickups.length; let r;
  try { r = fn(); } finally {
    const ops = NREC.ops; NREC = null;
    if (ops.length) {
      // what it dropped is the killer's alone, only ever on their farm (ammo rolled for their guns, planks, bandages),
      // so nobody takes anyone else's. If it dropped ammo, anyone who'd worked on it (an assist) gets an ammo box of
      // their own, rolled for their guns, on their farm (am: how big; NET_ON.hit)
      let am = 0;
      for (let k = np; k < pickups.length; k++) { const p = pickups[k]; if (p.kind === 'ammo') am = Math.max(am, p.amount || 1); }
      netSend('hit', { id: z.id, dx: nr(dx), dz: nr(dz), ops, am });
    }
  }
  return r;
}
NET_ON.hit = m => {
  const z = NZ.get(m.id);
  if (z && !z.dead && state !== 'title') {
    NREP = m;
    try { for (const op of m.ops) netOp(z, op, m.dx, m.dz); if (z.dead) killEnd(z); }
    catch (e) { console.error('net hit', e); }
    finally { NREP = null; }
    if (m.am && z.assist) ammoDrop(z.x, z.z, m.am);   // an assist on a kill that dropped ammo: a box of your own
  }
};
function netOp(z, op, dx, dz) {
  switch (op[0]) {
    case 'd': {   // the hit itself, and what it left burning or bleeding
      const [, dl, part, kb, w, burn, bleed, bleedR, lhp] = op, D = W(w) || EFF[w] || WEAP[w] || {};
      if (z.dead) return;
      hitFx(z, dl, dx, dz, kb, w, part, D);
      heardFrom(D.melee ? (D.blunt ? ['hit_blunt_1', 'hit_blunt_2'] : ['hit_blade_1', 'hit_blade_2']) : ['flesh_1', 'flesh_2'], z.x, z.z, 0.55);   // (their hit, heard from where it landed)
      z.burn = Math.max(z.burn || 0, burn); z.bleed = Math.max(z.bleed || 0, bleed); z.bleedR = Math.max(z.bleedR || 0, bleedR);
      if (lhp && z.lhp[part] > lhp) z.lhp[part] = lhp;
      return;
    }
    case 's': sever(z, op[1], dx, dz, !!op[2]); return;
    case 'l': severLower(z, op[1], dx, dz); return;
    case 'c': crushHead(z, dx, dz); return;
    case 'p': splitHead(z, dx, dz, op[1]); return;
    case 'h': headShot(z, dx, dz); return;
    case 'b': blowApart(z, dx, dz); return;
    case 'k': z.killW = op[1]; killZombie0(z, dx, dz, op[1], op[2], 0); return;
    case 'r': makeRagdoll(z, dx, dz, op[1], op[2], z.killW); if (op[3]) ragdolls[ragdolls.length - 1].neck = NECK_PUMP; return;
    case 'v': shoveZombie(z, dx, dz, op[1], op[2], !!op[3]); return;
    case 'ac': crackArmor(z, op[1]); return;   // its armour cracking, and coming off (zombies/armor-break.js)
    case 'a': breakArmor(z, op[1], dx, dz); return;
  }
}
// a blast somewhere: the bang and the fire (the damage is the thrower's, in their hits)
NET_ON.boom = m => { if (state !== 'title') explode(m.x, m.z, m.r, 0, false, true, m.s); };
NET_ON.nade = m => { if (state === 'title') return; const g = m.g; grenades.push({ m: box(scene, 0.12, 0.12, 0.18, GM.olive, g[0], GUN_Y, g[1]), x0: g[0], z0: g[1], x1: g[2], z1: g[3], t: 0, dur: g[4], h: g[5], net: true }); };

// ---- boards: whoever puts one up says so; the host says when a zombie tears one down
export function netBoardUp(o) {
  if (!netLink()) return;
  o.netT = performance.now() + 1500;
  const ba = { o: openings.indexOf(o), hp: Math.round(o.boards[o.boards.length - 1]), sd: Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1 };
  if (o.grate) ba.gr = Math.round(o.grate.hp0);   // (a grate: what it went up out of)
  netSend('ba', ba);
}
NET_ON.ba = m => {
  const o = openings[m.o]; if (!o || state === 'title') return;
  if (m.gr) { if (o.boards.length) return; o.netT = performance.now() + 1500; addGrate(o, m.hp, m.sd, m.gr); return; }
  if (o.boards.length >= 3 || o.grate) return; o.netT = performance.now() + 1500; addBoard(o, m.hp, m.sd);
};
// the metalwork bench built, or the grates plated a tier more, by anyone: the same on every screen (the host passes a
// joiner's on to everyone, net/net.js; its snapshots, 'w', carry it too, for anyone who missed it)
export function netMetal() { if (netLink()) netSend('mtl', { lv: METAL.tier }); }   // (not t: that's the message's own type)
NET_ON.mtl = m => {
  if (state === 'title') return;
  if (!METAL.on || m.lv > METAL.tier) applyMetal(true, Math.max(m.lv, METAL.tier), !METAL.on);
};
// (at: which side a board shot or torn down goes flying to, for one no zombie broke)
// a door between rooms broken down in the host's game: down in everyone's (world/interior.js)
// a stretch of the yard fence a brute knocked down (zombies/ai.js: bruteFence), knocked down on every screen
export function netFenceBroke(k, z) { if (netLink() && NET.host) netSend('fb', { k, id: z ? z.id : 0 }); }
NET_ON.fb = m => { if (NET.host || cell[m.k] !== FENCE) return; const z = NZ.get(m.id) || null; breakFence(m.k % N, (m.k / N) | 0, z); if (z && z.an) z.an.rip = 1; };
export function netDoorBroke(d, z) { if (netLink() && NET.host) netSend('db', { d: HOUSE_DOORS.list.indexOf(d), id: z ? z.id : 0 }); }
NET_ON.db = m => { const d = HOUSE_DOORS.list[m.d]; if (!d || NET.host || d.broken) return; breakDoor(d, NZ.get(m.id) || null); };
export function netBoardBroke(o, z, at) {
  if (!netLink() || !NET.host) return;
  o.netT = performance.now() + 600;
  const m = { o: openings.indexOf(o), id: z ? z.id : 0 }; if (at) { m.x = nr(at.x); m.z = nr(at.z); }
  netSend('bb', m);
}
NET_ON.bb = m => { const o = openings[m.o]; if (!o || NET.host || !o.boards.length) return; o.netT = performance.now() + 1500; const z = NZ.get(m.id); breakBoard(o, z || (m.x !== undefined ? { x: m.x, z: m.z } : null)); if (z && z.an) z.an.rip = 1; };
// a shot through the boards: everyone sees the board jump; the host takes the damage off it (barricades/planks.js)
export function netBoardShot(o, d, dx, dz) { if (netLink()) netSend('bs', { o: openings.indexOf(o), d: nr(d), dx: nr(dx), dz: nr(dz) }); }
NET_ON.bs = m => {
  const o = openings[m.o]; if (!o || state === 'title' || !o.boards.length) return;
  const at = { x: o.x + m.dx, z: o.z + m.dz, vis: visAt(o.x, o.z) };
  boardJolt(o, at); if (NET.host) hurtBoard(o, m.d, at);
};
// a barricade mended between waves (barricades/interactions.js): mended on every screen (the host passes a joiner's on)
export function netRepair(o, kind, j) { if (netLink()) netSend('rp', { o: openings.indexOf(o), g: kind === 'grate' ? 1 : 0, j }); }
NET_ON.rp = m => { const o = openings[m.o]; if (!o || state === 'title') return; repairBarricade(o, m.g ? 'grate' : 'board', m.j || 0, false); };
// a joiner tearing the boards down: the host breaks them all, and its 'bb's break them everywhere, theirs included
export function netBoardTear(o, at) { netSend('bt', { o: openings.indexOf(o), x: nr(at.x), z: nr(at.z) }); }
NET_ON.bt = m => { const o = openings[m.o]; if (!NET.host || !o || !o.boards.length) return; tearAll(o, { x: m.x, z: m.z }); };

// ---- the waves: the host's start them, clear them and runs the breaks
NET_ON.wave = m => { if (NET.host || !netLink() || state === 'title') return; waveBegins(m.n, m.tot, !!m.fog, m.tw || null, m.np); setSpawnQ(new Array(m.tot).fill('walker')); };
NET_ON.clear = () => { if (NET.host || !netLink() || state === 'title' || phase === 'cleared') return; waveCleared(); };
// starting the next wave early: alone, T does it; in co-op it's a vote, and the wave starts once SKIP_VOTE of everyone
// in the game (rounded up, the downed too) has pressed T. Pressing it again takes your vote back. The host counts them
// (skipVotes) and tells everyone the tally ('sv'), and a new wave clears them
export const SKIP_VOTE = 0.75, skipVotes = new Set();
export const skipNeed = () => Math.ceil(SKIP_VOTE * netTeam() - 1e-9);
export function skipBreak() { if (phase !== 'break') return; if (!netLink()) { setBreakT(0); return; } if (NET.host) castSkip(NET.id); else netSend('skip', {}); }
function castSkip(id) {
  if (phase !== 'break') return;
  if (skipVotes.has(id)) skipVotes.delete(id); else skipVotes.add(id);
  for (const v of skipVotes) if (v !== NET.id && !NET.peers.has(v)) skipVotes.delete(v);   // (anyone who's left)
  netSend('sv', { v: [...skipVotes] });
  if (skipVotes.size >= skipNeed()) setBreakT(0);
}
NET_ON.skip = m => { if (NET.host) castSkip(m.f); };
NET_ON.sv = m => { if (NET.host) return; skipVotes.clear(); m.v.forEach(v => skipVotes.add(v)); };
// the break's line under the wave number: the countdown, and how to start it early (in co-op, the vote so far)
// (each part kept whole on its line, so a narrow column breaks between them, not off the end of one)
const subLine = (...parts) => parts.map((p, i) => `<span class="nw">${p}${i < parts.length - 1 ? ' ·' : ''}</span>`).join(' ');
export function breakSub() {
  const t = `Next wave in ${Math.ceil(Math.max(0, breakT))}s`;
  if (!netLink()) return subLine(t, `${kbd('wave')} to start now`);
  const n = skipVotes.size, need = skipNeed();
  return skipVotes.has(NET.id) ? subLine(t, `Voted to start ${n}/${need}`, `${kbd('wave')} takes it back`) : subLine(t, `${kbd('wave')} vote to start ${n}/${need}`);
}
// wave cleared: the host tells the rest; anyone down is back a moment later, once the slow motion's played out
let clearAt = 0;
export function netCleared() { if (!netLink()) return; clearAt = performance.now(); teamBonus(); if (NET.host) netSend('clear', {}); }
const RESPAWN_AFTER = 1100;   // ms after the last kill: the clear's slow motion (waves/waves.js) is over
export function respawnCheck() { if (netLink() && P.dead && ((phase === 'cleared' && performance.now() - clearAt > RESPAWN_AFTER) || (phase === 'break' && P.deathT > 2))) netRespawn(); }
// a joiner's wave display, from the host's word for it
export function clientWaves(dt) {
  if (phase === 'break') {
    const w = netWaiting(); respawnCheck();
    setH('wSub', w || breakSub());
    waveBar(breakT / breakMax, 'break');
  } else if (phase === 'wave') {
    const left = spawnQ.length + zombies.length;
    waveSub(left);
    waveBar(left / Math.max(1, run.waveTotal || left), 'wave');
  } else if (phase === 'cleared') {
    setH('wSub', 'Wave cleared'); waveBar(1, 'clear'); respawnCheck();
    setClearT(clearT - (dt / Math.max(timeScale, 0.3)));
    if (clearT <= 0) return clearedDone();
  }
  return false;
}
// who's still choosing their find after a wave ('' if nobody): the next wave waits for them
// and before the first wave, for everyone to have loaded in: the break doesn't start counting till they're all on the farm
export const listNames = n => n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0];
export function netWaiting() {
  if (!netLink()) return '';
  const ps = [...NET.peers.values()], list = listNames;
  const loading = run.wave === 0 ? ps.filter(p => !p.loaded).map(p => p.name) : [];
  if (loading.length) return 'Waiting for ' + list(loading) + ' to load in';
  const names = ps.filter(p => p.picking).map(p => p.name);
  return names.length ? 'Waiting for ' + list(names) + ' to choose' : '';
}
// the teammates who haven't chosen from the hand you're looking at yet (by the hand they last chose from, from their
// pose: handNo, upgrades/upgrade-screen.js)
export const netChoosing = () => netLink() ? [...NET.peers.values()].filter(p => (p.cw || 0) < handNo()).map(p => p.name) : [];
// you've chosen: told straight away, not left to your next pose
export function netPicked() { if (netLink()) netSend('picked', { w: run.cardHand }); }
NET_ON.picked = m => { const p = NET.peers.get(m.f); if (p) p.cw = Math.max(p.cw || 0, m.w | 0); };

// ---- going down in co-op: the farm goes on without you; you watch a teammate till the wave's cleared and you're back
// (their health and weapon on your HUD, and that you're down: net/spectate.js)
export function netDown() { setTimeScale(1); SPEC.id = ''; }
// back in the house after the wave you went down in, as someone new: full health, a new face and clothes, and every
// weapon you had, mods, attachments and rounds and all, each gun with a fresh mag in it and RESPAWN_MAGS more of its
// ammo in reserve (anything half done to them, a staged reload, a gun left open, spent cases, gone). Back with what
// you were holding when you went down; then the cards like everyone else
const RESPAWN_MAGS = 3;
function netRespawn() {
  unragYou();   // up off the floor (player/player-ragdoll.js)
  deathCineEnd();   // (the death camera's done: ui/screens.js)
  for (const s of ['side', 'long', 'auto']) {
    const id = W8.slot[s]; if (!id) continue;
    W8.mag[id] = 0; [W8.akMag, W8.relSave, W8.pin, W8.spent, W8.hudSpent, W8.open].forEach(o => { if (o) delete o[id]; });
  }
  for (const k in W8.reserve) W8.reserve[k] = 0;
  W8.reloading = null; W8.akRel = null;
  recomputeEff();
  for (const s of ['side', 'long', 'auto']) {
    const id = W8.slot[s], D = id && W(id); if (!D || D.melee || !D.ammo) continue;
    const n = magSize(id); W8.mag[id] = n; W8.reserve[D.ammo] = (W8.reserve[D.ammo] || 0) + n * RESPAWN_MAGS;
  }
  if (!W8.slot[W8.cur]) W8.cur = 'melee';
  const off = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9]][NET.idx] || [0, 0];
  Object.assign(P, { dead: false, deathT: 0, hp: hpCap(), bleed: 0, slow: 0, eye: 0, stun: 0, vx: 0, vz: 0, kbx: 0, kbz: 0, conc: 0, vault: null, x: cxw(21) + off[0], z: cxw(22) + off[1] });
  document.body.classList.remove('dying'); cv.style.filter = ''; cache.grey = null;
  if (ANIM.dropped) { scene.remove(ANIM.dropped.g); ANIM.dropped = null; }
  rollLook(spawnLook()); buildGuns();   // (back as you were, if you're keeping your look: player/look.js)
  netSend('look', { look: LOOK.cur });   // (your teammates rebuild you as you are now)
  feed('med', P.hp, 'back on your feet'); SFX.upgrade();
}
NET_ON.look = m => { const p = NET.peers.get(m.f); if (!p) return; p.look = m.look; netDropAvatar(p); p.av = null; };
// everyone down: the run's over for all of you (the host calls it)
NET_ON.over = () => { if (state === 'play' || state === 'paused') die(); };

// ---- every frame, playing or not
export function netTick(rdt) {
  netBeat(rdt); frTick(rdt); chatTick();
  if (!NET.on) return;
  if (NET.inGame && state !== 'title') {
    poseOut(rdt);
    if (NET.host) {
      snapOut(rdt);
      if ((state === 'play' || state === 'paused') && netAllDown()) { overT += rdt; if (overT > 3) { overT = 0; netSend('over', {}); die(); } } else overT = 0;
    }
  }
  updateAvatars(rdt);
  renderTeam(); renderSpec();
}
// a fresh co-op run: no zombies known, each survivor starting a step apart from the others
export function netRunStart() {
  NZ.clear(); zSeq = 0; overT = 0;
  if (!netLink()) return;
  const off = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9]][NET.idx] || [0, 0];
  P.x += off[0]; P.z += off[1];
  for (const p of NET.peers.values()) { p.dead = false; p.picking = false; p.cw = 0; p.loaded = false; if (p.av) p.av.cur = null; }
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setNREC(v) { return (NREC = v); }
