// Zombie AI: the way to you, climbing fences and breaking in through windows (tearing the boards off first), beating
// down the doors between rooms, attacks on you and brute concussion. The body's animated in zombies/zombie-anim.js, the climbs are in
// zombies/climb.js.

import { $ } from '../core/dom.js';
import { RIGHT, V3 } from '../core/renderer.js';
import { angDiff, clamp, HALF, mix, N, rand, rr, smooth } from '../core/math.js';
import { outline } from '../effects/screen-outlines.js';
import { netClient } from '../net/net.js';
import { cell, ci, cxw, EMPTY, FENCE, idx, inb, OPEN, openAt, WALL } from '../world/grid.js';
import { doorBetween, thinHit, wallBetween } from '../world/thin-walls.js';
import { breakDoor, doorBlow, doorOn, doorWear } from '../world/interior.js';
import { breakFence, FENCE_HP, fenceBlow } from '../world/fence.js';
import { hardBlocked, moveCircle } from '../world/collision.js';
import { diagOk, DIRS, dist, zField } from './pathfinding.js';
import { P } from '../player/player.js';
import { addBlood } from '../effects/body-blood.js';
import { hpCap, run, S } from '../game/run-state.js';
import { splat } from '../effects/blood-map.js';
import { burst } from '../effects/particles.js';
import { burnFx } from '../effects/puffs.js';
import { STUMP, zombies, ZT } from './zombie-types.js';
import { animateZombie } from './zombie-anim.js';
import { stepClimb } from './climb.js';
import { bruteSmashK, FP_OUT } from './spawn.js';
import { fpOn } from '../game/view-cam.js';
import { rimMat } from '../effects/outlines.js';
import { BLEED_R, BURN_TICK, burnHurt, killZombie, legSlow, STUMP_PUMP } from './damage.js';
import { boardJolt, breakBoard } from '../barricades/planks.js';
import { nz } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { camKick, camRoll, groanT, phase, setCamRoll, setGroanT, setShake, shake, spawnQ } from '../game/state.js';
import { SHOVE_SLOW } from '../player/shove.js';
import { runStat } from '../ui/run-stats.js';
import { startDeath } from '../ui/screens.js';
import { feed } from '../ui/hud-text.js';
import { los } from '../lighting/lightmap.js';
import { dashGlow, dashMaybe, dashStep, stepDashMarks, waveDmg } from './brute-dash.js';
import { stepKnock } from './knockdown.js';
import { spitStep } from './spitter.js';
import { ANIM } from '../player/animation.js';
import { hitFromAt } from '../ui/hud.js';
import { cheatAI } from '../ui/cheats.js';
import {
  netBoardBroke, netDoorBroke, netFenceBroke, netLunge, netTargets, puppetBoard, puppetMove, startClimb
} from '../net/sync.js';

// a wall, a fence or a window frame between a zombie and you stops its swing: it can catch you while you're climbing
// through a window or over a fence (you're in that cell then, and the cells you're each in don't count), but not once
// you're past it and the frame is between you
function reachBlocked(x0, z0, x1, z1) {
  if (thinHit(x0, z0, x1, z1) <= 1) return true;   // an inside wall between (world/thin-walls.js)
  const si = ci(x0), sj = ci(z0), ti = ci(x1), tj = ci(z1), n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1);
  for (let s = 1; s < n; s++) {
    const i = ci(x0 + (x1 - x0) * s / n), j = ci(z0 + (z1 - z0) * s / n);
    if ((i === si && j === sj) || (i === ti && j === tj) || !inb(i, j)) continue;
    const k = idx(i, j), t = cell[k], o = openAt[k];
    if (t === WALL || t === FENCE || (t === OPEN && o && (o.kind === 'window' || o.boards.length))) return true;
  }
  return false;
}
// which side of an opening a point's on (1: the side its normal points to, the outside)
export const openSide = (o, x, z) => Math.sign((x - o.x) * o.nx + (z - o.z) * o.nz) || 1;
// a window takes up to WIN_AT_ONCE zombies at a time, side by side (each in its own lane across it: zombies/climb.js),
// the next starting in as soon as every one already climbing is WIN_GAP of the way through
const WIN_AT_ONCE = 3, WIN_GAP = 0.12;
// holding the house gets harder through the later waves, so you can't stand at one window and mow them down as they
// climb in: from wave INSIDE.from, worked up to in full by INSIDE.full, they spread out over every way in at once
// (INSIDE.load: what each zombie already headed for a way in counts against it, zombies/pathfinding.js: pickEntry),
// tear the boards down faster (tear), come over the sill quicker (climb, zombies/climb.js) and closer behind each
// other (gap, in place of WIN_GAP)
export const INSIDE = { from: 6, full: 14, load: 24, tear: 1.8, climb: 1.35, gap: 0.05 };
export const insideK = () => smooth(clamp(((run.wave || 1) - INSIDE.from) / (INSIDE.full - INSIDE.from), 0, 1));
function winFree(o, z) {
  const c = o.climbers || (o.climbers = []);
  for (let k = c.length - 1; k >= 0; k--) { const b = c[k]; if (b === z) return true; if (b.dead || !b.vault || b.vault.o !== o) c.splice(k, 1); }
  const gap = mix(WIN_GAP, INSIDE.gap, insideK()); return c.length < WIN_AT_ONCE && c.every(b => b.vault.t > gap);
}
// at a window: the boards to tear down first (returned), then it climbs in (zombies/climb.js)
function atWindow(z, o) {
  if (z.type === 'brute') return o.boards.length ? o : null;   // a brute smashes the boards but never climbs in (zombies/pathfinding.js sends it round to the door)
  if (!winFree(o, z)) return null;
  if (o.boards.length) return o;
  const zs = openSide(o, z.x, z.z), dx = -o.nx * zs, dz = -o.nz * zs, x1 = o.x + dx, z1 = o.z + dz;
  if (!hardBlocked(ci(x1), ci(z1))) startClimb(z, 'window', o.x, o.z, dx, dz, x1, z1, o);
  return null;
}
// over a fence: straight across it, square to the way it runs, toward the side the way in wants; it lands in that
// cell's neighbour the flow likes best (if where the climb leaves it is no good)
function fenceCross(z, i, j, bi, bj, fl) {
  const isF = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE, runsX = isF(bi - 1, bj) || isF(bi + 1, bj), runsZ = isF(bi, bj - 1) || isF(bi, bj + 1);
  let ei = -1, ej = -1, ed = 1e9;
  for (const [di, dj] of DIRS) { const ni = bi + di, nj = bj + dj; if (!inb(ni, nj) || hardBlocked(ni, nj) || (ni === i && nj === j)) continue; const d = fl[idx(ni, nj)]; if (d < ed) { ed = d; ei = ni; ej = nj; } }
  if (ei < 0) return;
  const fx = cxw(bi), fz = cxw(bj); let dx, dz;
  if (runsX && !runsZ) { dx = 0; dz = Math.sign(fz - z.z) || 1; }
  else if (runsZ && !runsX) { dz = 0; dx = Math.sign(fx - z.x) || 1; }
  else { dx = cxw(ei) - fx; dz = cxw(ej) - fz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; }
  startClimb(z, 'fence', fx, fz, dx, dz, cxw(ei), cxw(ej), null);
}
// a brute on the boards: a blow every t seconds, each taking dmg off the plank on top (a plain board has 70)
export const BRUTE_SMASH = { t: 1.25, dmg: 75 };
// a shut door between rooms in its way: it beats on it till it gives (DOOR.hp, world/interior.js), as it would on the
// boards (a brute in a few blows: BRUTE_SMASH), each blow a thump and the door jumping in its frame, and it's broken
// up a piece at a time as it goes (doorWear)
function bashDoor(z, d, armMul, dme, dt) {
  z.face += angDiff(Math.atan2(d.cx - z.x, d.cz - z.z), z.face) * Math.min(1, dt * 8);
  if (z.type === 'brute') { if (z.atk <= 0) { z.atk = z.smashT = BRUTE_SMASH.t; z.lunge = 1; d.hp -= BRUTE_SMASH.dmg * armMul; doorBlow(d, z, true, dme); } }
  else { d.hp -= z.T.bdps * armMul * (z.crawl ? 0.5 : 1) * dt; if (z.atk <= 0) { z.atk = 0.9; z.lunge = 1; doorBlow(d, z, false, dme); } }
  doorWear(d, z);
  if (d.hp <= 0) { breakDoor(d, z); if (z.an) z.an.rip = 1; netDoorBroke(d, z); }
}
// a brute takes whichever way to you is quicker: one that can see whoever it's after across the yard fence (up to
// BFENCE.see metres off) weighs the walk round to a gap (its field, in metres) against the walk straight at them plus
// the time it'd stand smashing the fence between (its blows, BRUTE_SMASH.t apart, at its own pace, and BFENCE.margin
// metres to spare), and if going through is quicker it goes for that stretch of fence and smashes through it
// (fenceBlow, breakFence in world/fence.js). Looked at again every BFENCE.every seconds
const BFENCE = { see: 30, margin: 1, every: 0.4, step: 0.25 };
const fenceSmashM = z => Math.ceil(FENCE_HP / BRUTE_SMASH.dmg) * BRUTE_SMASH.t / bruteSmashK() * z.speed;
function bruteFence(z, t, here, dt) {
  if (z.fenceAt >= 0 && cell[z.fenceAt] !== FENCE) z.fenceAt = -1;   // (gone: knocked down, by it or another)
  if ((z.fenceT = (z.fenceT || 0) - dt) > 0) return z.fenceAt ?? -1;
  z.fenceT = BFENCE.every * rr(0.8, 1.2); z.fenceAt = -1;
  if (t.dead || z.crawl) return -1;
  const dx = t.x - z.x, dz = t.z - z.z, d = Math.hypot(dx, dz);
  if (d > BFENCE.see || here < d + fenceSmashM(z) + BFENCE.margin || !los(z.x, z.z, t.x, t.z)) return -1;
  // the first stretch of fence on the line to them, with them on the far side of it
  for (let s = BFENCE.step; s < d - 0.5; s += BFENCE.step) {
    const i = ci(z.x + dx * s / d), j = ci(z.z + dz * s / d); if (!inb(i, j)) return -1;
    const c = cell[idx(i, j)];
    if (c === FENCE) { z.fenceAt = idx(i, j); return z.fenceAt; }
    if (c !== EMPTY) return -1;   // (anything else in the way: let it go round)
  }
  return -1;
}
// how fast bunched-up zombies drift apart (metres a second when right on top of each other)
const SPREAD = 2.6;
// a window or doorway in this cell or any next to it
function nearOpening(i, j) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inb(i + a, j + b) && cell[idx(i + a, j + b)] === OPEN) return true; return false; }
// a hit flashes the body white-hot, cooling through red as the flash runs out; burning, just a flicker of warmth (the
// char's embers do the glowing: effects/body-blood.js)
function zFlash(z, dt) {
  const m = z.m; z.flash = Math.max(0, z.flash - dt);
  if (z.flash > 0) { const k = z.flash / 0.14; for (const mt of Object.values(m.mats)) mt.emissive.setRGB(0.35 + 0.6 * k, 0.1 + 0.55 * k, 0.07 + 0.45 * k); }
  else { const e = z.burn > 0 ? (rand() < 0.5 ? 0x2c1003 : 0x1c0902) : 0x000000; for (const mt of Object.values(m.mats)) mt.emissive.setHex(e); }
}
// zombie AI: the way to you, climbing and breaking in, attacks; then the body's animated (zombies/zombie-anim.js). In
// co-op each goes for whichever survivor still standing is nearest, and on a joiner's screen they're the host's: each
// eased to where the host's game has it (net/sync.js), only the body and the blood played out here
// the zombies' voices (updateZombies): from among the nearest few, within far (m), every gap seconds, up to crowd times as
// often with a crowd close by
const VOICES = { near: 3, far: 30, gap: [1.4, 3.6], crowd: 2.2 };
export function updateZombies(dt) {
  const pup = netClient(), tg = netTargets(), allDown = tg.every(q => q.dead);
  // the cheat menu's zombie switches (ui/cheats.js: cheatAI): their minds off (they stand where they are), passive (they
  // come for you but never lay a hand on you or the boards), and how fast they move
  const ai = cheatAI();
  let nearest = 99, nearZ = null; zHitMe = false;
  for (let k = zombies.length - 1; k >= 0; k--) {
    const z = zombies[k], m = z.m;
    if (pup) { if (!z.knock) puppetMove(z, dt); }
    else if ((z.vx || z.vz) && !z.vault) { moveCircle(z, z.vx * dt, z.vz * dt, z.T.r); const f = Math.exp(-9 * dt); z.vx *= f; z.vz *= f; if (Math.abs(z.vx) + Math.abs(z.vz) < 0.02) z.vx = z.vz = 0; }
    // who it's after: the nearest survivor still on their feet (alone, that's you)
    let t = tg[0], td = 1e9;
    for (const q of tg) { if (q.dead && !allDown) continue; const d = (q.x - z.x) * (q.x - z.x) + (q.z - z.z) * (q.z - z.z); if (d < td) { td = d; t = q; } }
    const dxp = t.x - z.x, dzp = t.z - z.z, dp = Math.hypot(dxp, dzp), relP = angDiff(Math.atan2(dxp, dzp), z.face);
    const dme = t.me ? dp : Math.hypot(P.x - z.x, P.z - z.z);
    if (dme < nearest) { nearest = dme; nearZ = z; }
    if (z.burn > 0 && z.stain) z.stain.char = Math.min(1, z.stain.char + dt * 0.17);   // charring as it burns: black all over in about six seconds
    // on fire (dragon's breath): flames on it while you can see it, and the fire hurts in ticks, every
    // half second, each shown as an orange damage number like any other hit (the host's game burns it in co-op)
    if (z.burn > 0) {
      z.burn -= dt; z.burnT = (z.burnT || 0) + dt;
      if (z.vis > 0.3) { const s = z.T.scale; burnFx(z.x, z.z, (z.crawl ? 0.1 : 0.45) * s, (z.crawl ? 0.5 : 1.5) * s, 0.2 * s, dt); }
      if (z.burnT >= BURN_TICK) { z.burnT -= BURN_TICK; if (!pup && burnHurt(z)) continue; }
    } else z.burnT = 0;
    if (z.bleed > 0) { z.bleed -= dt; if (!pup) z.hp -= (z.bleedR || BLEED_R) * dt; if (z.bleed <= 0) z.bleedR = 0; if (rand() < dt * (2 + (z.bleedR || BLEED_R) * 0.15)) splat(z.x, z.z, 'drop', rr(0.12, 0.25)); if (z.hp <= 0 && !pup) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'bleed', 'torso', 0); continue; } }
    for (let q = z.spurts.length - 1; q >= 0; q--) {
      const sp = z.spurts[q]; sp.t -= dt; if (sp.t <= 0) { z.spurts.splice(q, 1); continue; }
      if (sp.pump) {   // an arm's stump (zombies/damage.js armStump): pumping, a spurt each beat, weaker each time, out the way the stump points
        const left = sp.t / STUMP_PUMP.t, beat = Math.sin((STUMP_PUMP.t - sp.t) * STUMP_PUMP.rate * 6.283);
        if (beat > 0.6 && rand() < 0.35 * left && sp.o.parent) { const v = new V3(...sp.p).applyMatrix4(sp.o.matrixWorld), d = new V3(...(sp.d || [0, 0, 1])).transformDirection(sp.o.matrixWorld); burst(v.x, Math.max(0.15, v.y), v.z, 1, 'blood', d.x * 1.4 + rr(-0.3, 0.3), d.z * 1.4 + rr(-0.3, 0.3), 0.5 + 0.8 * left); }
        continue;
      }
      if (rand() < 0.5) { const v = sp.o ? new V3(...sp.p).applyMatrix4(sp.o.matrixWorld) : m.g.localToWorld(new V3(...STUMP[sp.part])); burst(v.x, Math.max(0.15, v.y), v.z, 1, 'blood', rr(-1, 1), rr(-1, 1), 0.8); }
    }
    // knocked off its feet by a brute (zombies/knockdown.js): down, or getting up, and nothing else till it's up
    if (z.knock) { stepKnock(z, dt); zFlash(z, dt); continue; }
    z.atk -= dt; z.lunge = Math.max(0, z.lunge - dt * 3); z.stagger -= dt; z.squash = Math.max(0, z.squash - dt * 8); z.pushSlow = Math.max(0, (z.pushSlow || 0) - dt); z.shoved = Math.max(0, (z.shoved || 0) - dt * 2.2);
    // climbing over a fence or in through a window: nothing else till it's done
    if (z.vault) { stepClimb(z, dt); z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
    if (ai.off && !pup) { z.atkBoard = z.atkDoor = null; z.atkFence = false; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
    if (pup) puppetBoard(z, dme);   // tearing at the boards the host says it's at
    // a brute's dash (zombies/brute-dash.js): while it crouches, charges and pulls up, nothing else
    if (dashStep(z, dt, pup) || (!pup && !ai.passive && dashMaybe(z, dt, t, dp))) { z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); dashGlow(z); continue; }
    // a spitter with a line on whoever it's after stands off and spits (zombies/spitter.js)
    if (z.type === 'spitter' && !z.out && !pup && !ai.passive && spitStep(z, dt, t, dp)) { z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
    // still out in the fog (zombies/spawn.js): it walks straight in along its trail to the gap in the trees, where the
    // farm's own pathfinding takes over; out there there's no grid to steer by or bump into
    if (z.out && !pup) {
      const ax = z.gx - z.x, az = z.gz - z.z, al = Math.hypot(ax, az);
      if (al < 0.2) z.out = false;
      else {
        // (from your own eyes, quicker while still deep in the haze: zombies/spawn.js FP_OUT)
        const deep = Math.max(Math.abs(z.x), Math.abs(z.z)) - HALF, hz = fpOn() ? (deep > FP_OUT.deep ? FP_OUT.fast : deep > FP_OUT.near ? FP_OUT.mid : 1) : 1;
        const sp = Math.min(al, z.speed * ai.speed * dt * hz * (z.stagger > 0 ? 0.25 : 1) * (z.crawl ? 0.32 : legSlow(z)));
        z.x += ax / al * sp; z.z += az / al * sp;
        z.face += angDiff(Math.atan2(ax, az), z.face) * Math.min(1, dt * 8);
      }
    }
    // (outside while you're indoors, the field for the window or door it was given: zombies/pathfinding.js)
    const fl = pup ? dist : zField(z, t), via = !!z.via, i = ci(z.x), j = ci(z.z), here = inb(i, j) ? fl[idx(i, j)] : 1e9;
    let tx = t.x, tz = t.z, attackingBoard = null, attackingDoor = null, attackingFence = -1;
    const bf = z.type === 'brute' && !z.out && !pup ? bruteFence(z, t, here, dt) : -1;
    if (bf >= 0) {
      // straight for the fence it's smashing through, and at it once it's in reach
      const fi = bf % N, fj = (bf / N) | 0; tx = cxw(fi); tz = cxw(fj);
      if (Math.hypot(tx - z.x, tz - z.z) < 0.95 + z.T.r) attackingFence = bf;
    } else if ((via || here > 1.6) && !z.out && !pup) {
      let bestD = here, bi = -1, bj = -1;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
        if ((di && dj && (!diagOk(i, j, di, dj) || doorBetween(i, j, ni, nj))) || wallBetween(i, j, ni, nj)) continue;
        const d = fl[idx(ni, nj)]; if (d < bestD) { bestD = d; bi = ni; bj = nj; }
      }
      if (bi >= 0) {
        // the next cell on its way: a fence to climb, a window to break in through, boards to tear down
        const op = openAt[idx(bi, bj)], dn = Math.hypot(cxw(bi) - z.x, cxw(bj) - z.z);
        if (cell[idx(bi, bj)] === FENCE && dn < (z.crawl ? 1.35 : 0.85) + z.T.r) fenceCross(z, i, j, bi, bj, fl);
        else if (op && op.kind === 'window' && dn < (z.crawl ? 1.3 : 0.8) + z.T.r) attackingBoard = atWindow(z, op);
        else if (op && op.boards.length && dn < 0.95 + z.T.r) attackingBoard = op;
        else { const dr = doorOn(i, j, bi, bj); if (dr && Math.hypot(dr.cx - z.x, dr.cz - z.z) < z.T.r + 0.4) attackingDoor = dr; }   // (a shut door: world/interior.js)
        if (z.vault) { z.atkBoard = null; animateZombie(z, dt, dp, relP); zFlash(z, dt); continue; }
        tx = cxw(bi); tz = cxw(bj);
      }
    }
    const arms = (z.limbs.armL ? 1 : 0) + (z.limbs.armR ? 1 : 0), armMul = arms === 2 ? 1 : arms === 1 ? 0.7 : 0.4;
    if (ai.passive && !pup) { attackingBoard = attackingDoor = null; attackingFence = -1; }
    if (!pup) { z.atkBoard = attackingBoard; z.atkDoor = attackingDoor; z.atkFence = attackingFence >= 0; }
    if (attackingBoard) {
      z.face += angDiff(Math.atan2(tx - z.x, tz - z.z), z.face) * Math.min(1, dt * 8);
      const top = attackingBoard.boards.length - 1;
      if (z.type === 'brute') {
        // a brute doesn't claw at the boards, it smashes them: both fists down every BRUTE_SMASH.t, each blow enough to
        // break a plain board outright, with a heavy crack you feel if you're near
        if (z.atk <= 0) {
          z.atk = z.smashT = BRUTE_SMASH.t; z.lunge = 1; attackingBoard.boards[top] -= BRUTE_SMASH.dmg * armMul;
          soundAt(z.x, z.z, () => nz(0.16, 'lowpass', 420, 90, 0.4 * clamp(1 - dme / 24, 0, 1)), true); boardJolt(attackingBoard, z, true); if (!attackingBoard.grate) boardJolt(attackingBoard, z);
          setShake(Math.max(shake, 0.2 * clamp(1 - dme / 9, 0, 1)));
        }
      } else {
        attackingBoard.boards[top] -= z.T.bdps * armMul * (z.crawl ? 0.5 : 1) * mix(1, INSIDE.tear, insideK()) * dt;
        // a blow lands on the boards each beat: a thump, the plank jumps, a little dust off it
        if (z.atk <= 0) { z.atk = 0.9; z.lunge = 1; soundAt(z.x, z.z, () => nz(0.08, 'lowpass', 700, 200, 0.18 * clamp(1 - dme / 18, 0, 1)), true); boardJolt(attackingBoard, z); }
      }
      if (attackingBoard.boards[top] <= 0) { breakBoard(attackingBoard, z); if (z.an) z.an.rip = 1; netBoardBroke(attackingBoard, z); }
    } else if (attackingDoor) bashDoor(z, attackingDoor, armMul, dme, dt);
    else if (attackingFence >= 0) {
      z.face += angDiff(Math.atan2(tx - z.x, tz - z.z), z.face) * Math.min(1, dt * 6);
      if (z.atk <= 0) {
        z.atk = z.smashT = BRUTE_SMASH.t / bruteSmashK(); z.lunge = 1;   // (quicker in the later waves: zombies/spawn.js)
        const fi = attackingFence % N, fj = (attackingFence / N) | 0;
        if (fenceBlow(fi, fj, z, BRUTE_SMASH.dmg * armMul, dme)) { breakFence(fi, fj, z); if (z.an) z.an.rip = 1; netFenceBroke(attackingFence, z); z.fenceAt = -1; }
      }
    }
    else if (!z.out && !pup) {
      const ax = tx - z.x, az = tz - z.z, al = Math.hypot(ax, az);
      if (al > 0.05 && !(dp < z.T.r + 0.5 && here <= 1.6)) {   // they keep closing in while you go down, right up until the world stops
        const sp = z.speed * ai.speed * dt * (z.stagger > 0 ? 0.25 : 1) * (z.crawl ? 0.32 : legSlow(z)) * (z.pushSlow > 0 ? 0.2 + 0.8 * Math.pow(1 - z.pushSlow / (z.pushMax || SHOVE_SLOW), 2) : 1);   // still reeling from a shove: slow, and only getting going again toward the end (player/shove.js)
        moveCircle(z, ax / al * sp, az / al * sp, z.T.r);
        z.face += angDiff(Math.atan2(ax, az), z.face) * Math.min(1, dt * (z.type === 'runner' ? 7 : z.type === 'brute' ? 3.5 : 5));
      } else z.face += angDiff(Math.atan2(dxp, dzp), z.face) * Math.min(1, dt * 6);
      if (t.dead) { if (dp < z.T.r + 0.6 && z.atk <= 0 && z.stagger <= 0) { z.atk = rr(0.8, 1.2); z.lunge = 1; netLunge(z, null); } }   // and claw at you once they reach you
      else if (dp < z.T.r + 0.55 && z.atk <= 0 && z.stagger <= 0 && !ai.passive && !reachBlocked(z.x, z.z, t.x, t.z)) {
        z.atk = 1.05; z.lunge = 1;
        if (t.me) { zStrike(z, armMul); netLunge(z, null); }
        else netLunge(z, t.id, armMul);   // a teammate: their game takes the blow (net/sync.js)
        if (z.dead) continue;
      }
    }
    // they don't block each other: a crowd pours through a doorway or a broken window and floods the room. Where they
    // bunch up they only drift apart a little (SPREAD, metres a second at full overlap), so they don't all stand in one
    // spot, and not at all in a window or a doorway or the cells round one, where it would only hold them up
    if (!pup && !z.out && !nearOpening(i, j)) for (const o2 of zombies) {
      if (o2 === z || o2.vault || o2.out) continue; const sx = z.x - o2.x, sz = z.z - o2.z, sd = Math.hypot(sx, sz), md = z.T.r + o2.T.r;
      if (sd < md && sd > 0.001) { const k = (1 - sd / md) * SPREAD * dt / sd; moveCircle(z, sx * k, sz * k, z.T.r); }
    }
    { const ex = P.x - z.x, ez = P.z - z.z; if (!P.vault && !P.dead && dme < z.T.r + 0.3 && dme > 0.001) { const push = (z.T.r + 0.3 - dme) * 0.5; moveCircle(P, ex / dme * push, ez / dme * push, 0.3, true); } }
    if (z.hp < z.maxHp * 0.5) { z.drip -= dt; if (z.drip <= 0) { z.drip = rr(0.4, 0.9); splat(z.x + rr(-.15, .15), z.z + rr(-.15, .15), 'drop', rr(0.15, 0.3)); } }
    // a leg gone: it buckles and goes down onto its hands (zombies/zombie-anim.js), hitting the ground about 60% of the
    // way through
    if (z.crawl && z.crawlT < 1) {
      const t0 = z.crawlT; z.crawlT = Math.min(1, z.crawlT + dt / 0.8);
      if (t0 < 0.62 && z.crawlT >= 0.62) {
        burst(z.x + Math.sin(z.face) * 0.9, 0.1, z.z + Math.cos(z.face) * 0.9, 6, 'dust', Math.sin(z.face), Math.cos(z.face), 1.2);
        soundAt(z.x, z.z, () => SFX.thud()); if (dme < 6) setShake(Math.max(shake, 0.06));
      }
    } else if (z.crawl && (z.tx === undefined || Math.hypot(z.x - z.tx, z.z - z.tz) > 0.38)) { z.tx = z.x; z.tz = z.z; splat(z.x - Math.sin(z.face) * 0.2, z.z - Math.cos(z.face) * 0.2, 'drop', rr(0.22, 0.34)); }   // dragging itself along, leaving a smear
    if (z.blob) { const c = z.crawl ? 0.5 : 0; z.blob.position.set(z.x + Math.sin(z.face) * c, 0.02, z.z + Math.cos(z.face) * c); z.blob.scale.set(1.1 * z.T.scale * (z.type === 'brute' ? 1.25 : 1), 1, 1.1 * z.T.scale * (z.crawl ? 1.8 : 1)); z.blob.rotation.y = z.face; }
    animateZombie(z, dt, dp, relP); zFlash(z, dt);
  }
  if (phase === 'wave' && !spawnQ.length && zombies.length && zombies.length <= 3) for (const z of zombies) if (!z.redOl && !z.dead) z.redOl = outline(z.m.g, 0, 0, 0.04, rimMat(0xe0281c));
  stepDashMarks(dt);
  if (zHitMe) zStruckFx();
  playerChecks();
  // their voices: now one, now another of the few nearest you (VOICES.near of them, within VOICES.far), each in its own
  // voice (SFX.groan: zombies/spawn.js), quieter the further off; more often the more of them there are close by, so a
  // crowd round the house moans over itself where one alone groans now and then
  setGroanT(groanT - dt);
  if (groanT <= 0 && nearest < VOICES.far) {
    const near = zombies.filter(o => !o.dead && !o.out).map(o => [o, Math.hypot(o.x - P.x, o.z - P.z)]).filter(a => a[1] < VOICES.far).sort((a, b) => a[1] - b[1]);
    if (near.length) {
      const [z, d] = near[Math.floor(rand() * Math.min(VOICES.near, near.length))];
      soundAt(z.x, z.z, () => SFX.groan(clamp(1 - d / 16, 0.1, 1), z.voice || 1, z.type === 'brute' || z.type === 'spitter' ? z.type : 'walker'), true);
    }
    setGroanT(rr(VOICES.gap[0], VOICES.gap[1]) / clamp(Math.sqrt(near.length / 3), 1, VOICES.crowd));
  }
}
// a zombie's swing landing on you: the damage, the tilt toward it, and what it does by kind: a brute's knocks you back
// concussed, a crawler's trips you, the rest can open a bleed. In co-op a swing at you from the host's zombie comes here
// from its message (net/sync.js)
let zHitMe = false;
export function zStrike(z, armMul) {
  const dxp = P.x - z.x, dzp = P.z - z.z, dp = Math.hypot(dxp, dzp);
  P.hitFrom = z.face; hitFromAt(z.x, z.z, z.T.dmg * armMul * (z.crawl ? 0.25 : 1) / 25);
  P.hp -= z.T.dmg * armMul * (z.crawl ? 0.25 : 1) * S.dmgTaken * waveDmg() * cheatAI().dmg;   // (the cheat menu's zombie damage: ui/cheats.js) zHitMe = true; interruptBandage();   // a crawler only gets a weak swipe in, but it trips you
  // tilt the view toward whoever hit you
  const side = (-dxp * RIGHT.x - dzp * RIGHT.z) >= 0 ? 1 : -1; setCamRoll(clamp(camRoll - side * 0.055, -0.1, 0.1));
  camKick.x -= dxp / (dp || 1) * -0.25; camKick.z -= dzp / (dp || 1) * -0.25;
  if (z.type === 'brute') {   // concussed: knocked back, ears ringing, the world swims
    P.conc = 1; P.kbx = dxp / (dp || 1) * 7.5; P.kbz = dzp / (dp || 1) * 7.5; P.stun = 0.7; P.slow = Math.min(1, P.slow + 0.4);
    SFX.concuss(); setShake(Math.max(shake, 0.6)); setCamRoll(clamp(camRoll - side * 0.06, -0.14, 0.14));
    burst(P.x, 0.1, P.z, 10, 'dust', dxp, dzp, 2); $('conc').classList.remove('on'); void $('conc').offsetWidth; $('conc').classList.add('on');
  } else if (z.crawl) {   // a crawler grabs at your ankles: you stumble, but it can't bite deep enough to make you bleed
    const k = 1 - S.slowRes; P.slow = Math.min(1, P.slow + 0.85 * k); P.stun = 0.45 * k;
    P.kbx = -dzp / (dp || 1) * side * 2.2 + dxp / (dp || 1) * 1.2; P.kbz = dxp / (dp || 1) * side * 2.2 + dzp / (dp || 1) * 1.2;
    ANIM.stumble = 1; ANIM.stumbleSide = side; setCamRoll(clamp(camRoll - side * 0.07, -0.14, 0.14)); setShake(Math.max(shake, 0.3));
  } else if (rand() < (z.T.bleed || ZT.walker.bleed)[0]) { if (!(P.bleed > 0)) runStat('bleeds'); P.bleed = Math.min(14 * (S.bleedLong || 1), (P.bleed || 0) + (z.T.bleed || ZT.walker.bleed)[1] * (S.bleedLong || 1)); }   // a bite that opens you up (ZT: bleed), for longer under Bad blood (upgrades/sacrifice.js)
  if (!z.crawl) { P.slow = Math.min(1, P.slow + 0.6 * (1 - S.slowRes)); P.stun = 0.22 * (1 - S.slowRes); }
}
export function zStruckFx() {
  zHitMe = false; if (P.dead) return;
  addBlood(0.05); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt(); setShake(Math.max(shake, 0.22)); burst(P.x, 1, P.z, 6, 'blood'); if (rand() < 0.5) splat(P.x, P.z, 'drop', rr(.2, .35));
}
const WIND_HEAL = 25;   // what Second wind gives back
// your health, after whatever hit you this frame: Second wind once a wave, when something hurts you and leaves you
// below a quarter (not just for being low already: starting a wave on little health doesn't set it off, the next hit
// does), and going down at none
let windHp = 0;
export function playerChecks() {
  const hurt = P.hp < windHp - 1e-6;
  if (S.secondWind && !S.badBlood && !S.windUsed && hurt && P.hp > 0 && P.hp < hpCap() * 0.25) { S.windUsed = true; const got = Math.round(Math.min(WIND_HEAL, hpCap() - P.hp)); P.hp = Math.min(hpCap(), P.hp + WIND_HEAL); P.slow = 0; feed('med', got, 'second wind'); SFX.upgrade(); }
  windHp = P.hp;
  if (P.hp <= 0 && !P.dead) { P.hp = 0; startDeath(); }
}

// setters for the variables above that other files change (an imported variable can only be read)
export function setZHitMe(v) { return (zHitMe = v); }
