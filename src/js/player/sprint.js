// Sprinting: hold Shift while you move (on a touch screen, push the stick right out).
//
// A sprint builds: your momentum (P.runUp) grows over SPRINT.build seconds of running flat out, and your pace with it,
// up to SPRINT.mul times as fast as you walk (WALK_SPEED); it dies away soon after you stop, and a hard turn costs you
// most of it. You burn SPRINT.drain of your stamina a second (Iron lungs makes it last longer). The gun comes down to a
// low ready and can't be fired, the body turns to where you're running and banks into the bends (the run carves round
// at SPRINT.carve radians a second rather than sliding across: sprintCarve), the view bobs (runCam), and a vault you
// run into with enough momentum behind you goes over quicker (vaultRush, player/vaulting.js).
// What a sprint burns is slow to come back (RUN_REST): it waits till you've stopped running for a while, then trickles
// back far slower than what a swing, a shove or a vault takes (the stamina you run off is kept apart, P.runDebt, and
// refilled last: weapons/combat-update.js), so a run is something to save for, not something you're always doing.
// Empty the tank and you're blown: no sprinting again till it's back to half (SPRINT.unlock), and slower till then (the
// fatigue in weapons/combat-update.js). Aiming while you sprint skids you to a stop on your momentum (SPRINT.skid) and
// brings the gun up into the sights as you slow; pulling the trigger skids you the same way, the gun comes up, and the
// shot goes off once it's there (P.fireQ: a quick click isn't lost). Cutting round to run another way, a quarter turn
// or a good deal more, you carve round through it on the run (sprintCarve) and keep going; only turning right about
// (PIVOT.ang or more off the way you're going, at speed) plants your feet, shuffles you round to face the new way,
// and sets you off again (P.pivot).
//
// Run and gun (S.runGun) lets you sprint and fire a 9mm gun, a pistol or a submachine gun, at anything within RG_ARC
// of the way you're running: the gun stays up, the shots far looser (RG_SPREAD), and while your legs keep running the
// way you're going your upper body twists round from the hips to shoot over that way (ANIM.rgK, player/animation.js).
// Anything further round than that, the gun comes down and the chest unwinds as usual. Its second step adds the shotguns (pumped on the run too) and
// the assault rifle, never the hunting rifle or the LMG.

import { KB } from '../input/keybinds.js';
import { RIGHT } from '../core/renderer.js';
import { angDiff, clamp, rr, smooth } from '../core/math.js';
import { P } from './player.js';
import { curId, S, stamMax, W, W8 } from '../game/run-state.js';
import { burst } from '../effects/particles.js';
import { fenceTarget, nearestOpening, tryVault, vaultGun, vaultHold, vaultTarget } from './vaulting.js';
import { openSt } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { footstep } from '../audio/footsteps.js';
import { state } from '../game/state.js';
import { keys, mouseDown, mouseDownR } from '../input/keyboard-mouse.js';
import { aiming } from './aiming.js';
import { tStick, usingTouch } from '../input/touch.js';
import { cutReload } from '../weapons/reload.js';
import { stamUse } from '../melee/melee.js';
import { INTRO } from '../game/intro.js';
import { ANIM } from './animation.js';
import { fpOn } from '../game/view-cam.js';

export const WALK_SPEED = 3.0;
export const SPRINT = { mul: 1.75, drain: 0.14, unlock: 0.5, vault: 0.72, skid: 0.42, skidFric: 4.2, build: 1.4, fade: 2.5, acc: 9, carve: 5.5, carveK: 7, carveIn: 14, bendCost: 0.3, bank: 0.055, autoVault: 0.5 };
// what a sprint burnt starts coming back only once you've stopped sprinting for wait seconds (Iron lungs shortens it),
// then at rate a second standing still (exh: while you're blown), and a quarter slower while you walk: about 9 s
// standing, 12 s walking, to win back a whole tank you ran off, against the 7 s it took to run it off
export const RUN_REST = { wait: 1.5, rate: 0.11, exh: 0.09 };
// how far into your full pace your momentum has you (eased: the first of it comes quickest), and how much of the quick
// vault you've earned (none till you've built up half your momentum, all of it near flat out)
export const sprintPace = () => { const u = clamp(P.runUp || 0, 0, 1); return 1 - (1 - u) * (1 - u); };
export const vaultRush = () => P.sprint ? smooth(clamp(((P.runUp || 0) - 0.45) / 0.45, 0, 1)) : 0;
export const RG_ARC = 1.3, RG_SPREAD = 3;
// the turn: how far round counts, how fast you must be going (of walking speed: well into a sprint), the plant (brake:
// seconds, dec: how hard the ground slows you, metres a second each second, building up over bite seconds as your
// boots dig in; scr: how fast the feet patter, radians a second), then the swing round (turn, plus perRad for each
// radian of it; a step for about every stepRad of it), how far the hips lead the body round (lead), how quickly the
// body follows them (yawRate), and the push off the new way (push: seconds of harder acceleration, pushAcc, which
// builds up over pushIn seconds). Anything short of PIVOT.ang round is carved through instead; a turn up to PIVOT.cut
// round carries PIVOT.keep of your pace through the plant into the new way, and a full about-face stops you. Everything
// about it eases in and out, so it reads as one smooth move. You have to be pushing that far round for a moment (wait)
// before you plant, so the frame between two keys of a diagonal (S, then S and D) doesn't stop you dead
export const PIVOT = { ang: 2.45, minSpd: 0.8, brake: 0.12, dec: 21, bite: 0.08, scr: 34, turn: 0.1, perRad: 0.045, stepRad: 1.2, lead: 0.6, yawRate: 14, push: 0.35, pushAcc: 10, pushIn: 0.15, cut: 2.8, keep: 0.4, wait: 0.07 };
const FIRE_WAIT = 0.9;   // how long a click made while the gun's down waits to go off once it's up
export const SHOT_HOLD = 0.35;  // after a shot (or while the trigger's held) you don't break back into a sprint for this long
const READY_UP = 0.2;    // how far down the gun can still be (ANIM.ready) and fire
const READY_W = { down: 11, up: 14 };

export function sprintKey() { return keys.has(KB.sprint) || !!(usingTouch && tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.92); }
// a 9mm gun in your hands, and Run and gun: you can fire it on the run
function runGunOK() { const id = curId(), D = W(id); return !!S.runGun && !!D && !D.melee && (D.ammo === 'p9' || D.ammo === 'p10' || (S.runGun >= 2 && (D.ammo === 'shells' || id === 'ar'))); }
// a reload carries on through a sprint (and doesn't stop one starting) with any gun but the LMG, whose belt needs both
// hands and a stop; it goes a little slower on the run, the faster you're going the slower (RUN_RELOAD.rel of its pace
// flat out, none of it lost at a walk: runRelK), and you go a touch slower for it (RUN_RELOAD.run of your speed)
export const RUN_RELOAD = { rel: 0.8, run: 0.95 };
export const rgReload = () => { const id = curId(), D = W(id); return !!D && !D.melee && id !== 'lmg'; };
export const runReloading = () => !!P.sprint && !!W8.reloading;
// how far into a run you are while reloading: 0 at a walk, 1 flat out
export const runRelK = () => runReloading() ? clamp((Math.hypot(P.vx, P.vz) - WALK_SPEED) / (WALK_SPEED * (SPRINT.mul - 1)), 0, 1) : 0;
// Run and gun, aiming within its arc of the way you're running: a sprint keeps the gun up, and it fires
const rgArc = () => runGunOK() && Math.abs(angDiff(P.aim, ANIM.runYaw ?? P.aim)) < RG_ARC;
function runGunning() { return !!P.sprint && rgArc(); }
// nothing you can fire while you're sprinting, or while the gun's still coming up out of the low ready after
export function sprintHolds() { return (!!P.sprint && !runGunning()) || (ANIM.ready || 0) > READY_UP; }
// the trigger as the sprint sees it, and which: the left button, the right one with a gun in each hand (it fires the
// right gun, weapons/akimbo.js), or the right stick pushed out on a touch screen
function sprintTrig() {
  const D = W(curId());
  if (mouseDown) return 'L'; if (mouseDownR && D && D.akimbo) return 'R';
  return tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4 ? 'S' : null;
}
const sprintDust = n => { for (let k = 0; k < n; k++) burst(P.x + rr(-0.15, 0.15), 0.05, P.z + rr(-0.15, 0.15), 1, 'dust'); };

// each frame, before you move (wx, wz: the way you're pushing): whether you're sprinting, its cost, a skid into the
// sights or into a shot, and a hard turn
export function updateSprint(dt, moving, wx, wz) {
  // emptying the tank any way at all (a sprint, a swing, a shove, a vault) leaves you blown till it's back to half
  if (P.exh) P.sprintLock = true; else if (P.stam >= SPRINT.unlock * stamMax()) P.sprintLock = false;   // (half of what you can have: a Broken stride's half, game/run-state.js)
  if (P.fireQ && (P.fireQT -= dt) <= 0) P.fireQ = null;
  if (P.pivot && (P.pivot.t += dt) >= P.pivot.dur) { P.pivot = null; P.pushT = PIVOT.push; sprintDust(3); footstep('run', 1.15); }   // driving off the new way
  if (P.pushT > 0) P.pushT -= dt;
  // a click while the gun's down (sprinting, turning, or still coming up): it goes off once the gun's up
  const trig = rgArc() ? null : sprintTrig();
  if (trig && (P.sprint || P.pivot || (ANIM.ready || 0) > READY_UP)) { P.fireQ = trig; P.fireQT = FIRE_WAIT; }
  P.shotHold = trig ? SHOT_HOLD : Math.max(0, (P.shotHold || 0) - dt);
  // pressing sprint as you move cuts a reload short: what's in stays in (the rest of the mag, the shells already fed),
  // a revolver's cylinder is flicked shut (player/hold.js) and you break into the sprint
  const sk = sprintKey(), skPress = sk && !P.sprintKeyWas; P.sprintKeyWas = sk;
  if (skPress && moving && W8.reloading && state === 'play' && !P.vault && !rgReload()) { cutReload(); W8.burstLeft = 0; }
  const can = moving && sk && state === 'play' && !P.dead && !P.vault && !(P.stun > 0) && !P.sprintLock && P.stam > 0 &&
    (!W8.reloading || rgReload()) && !(P.bandT > 0) && !(W8.swing > 0) && !openSt && !(P.skid > 0) && !P.pivot && !P.fireQ && !(P.shotHold > 0) && !(INTRO.t >= 0);
  // aiming or pulling the trigger while you sprint: you skid to a stop on your momentum, the gun coming up as you slow
  if (P.sprint && (aiming || trig)) { P.skid = SPRINT.skid; SFX.skid(); sprintDust(3); }
  // pushing off hard another way at speed: plant, and shuffle round to it (the turn's played out in sprintAnim)
  else if (P.sprint && can && (ANIM.sprintK || 0) > 0.6 && Math.hypot(P.vx, P.vz) > WALK_SPEED * PIVOT.minSpd) {
    const from = Math.atan2(P.vx, P.vz), turn = angDiff(Math.atan2(wx, wz), from);
    P.pivWait = Math.abs(turn) > PIVOT.ang ? (P.pivWait || 0) + dt : 0;
    if (P.pivWait >= PIVOT.wait) {
      // a cut (up to PIVOT.cut round) carries some of your pace through into the new way; turning right about stops you
      const cut = Math.abs(turn) <= PIVOT.cut, sp = Math.hypot(P.vx, P.vz);
      P.pivot = { t: 0, from, turn, dur: PIVOT.brake + PIVOT.turn + PIVOT.perRad * Math.abs(turn), wx, wz, keep: cut ? sp * PIVOT.keep : 0 };
      P.runUp = (P.runUp || 0) * (cut ? 0.55 : 0.3);
      // digging in: a skid and a spray of dust off the boots
      SFX.skid(); sprintDust(6); P.pivWait = 0;
    }
  } else P.pivWait = 0;
  P.sprint = can && !aiming && !P.pivot && curId() !== 'lmg';   // (the LMG's too heavy to run with: you walk it)
  if (P.sprint) {
    // (a heavy gun in your hands wears you out quicker: its run, weapons/gun-stats.js)
    const hv = (W(curId()) || {}).heavy, use = Math.min(P.stam, stamUse(SPRINT.drain * (hv ? hv.run || 1 : 1)) * dt);
    P.stam -= use; P.runDebt = (P.runDebt || 0) + use; P.stamT = P.runT = 0;
    if (P.stam <= 0.001) { P.exh = true; P.sprintLock = true; P.sprint = false; SFX.pant(); }   // blown
  }
  // momentum builds while you're running flat out (not while you're held up against something), and dies away after
  if (P.sprint) { if (Math.hypot(P.vx, P.vz) > WALK_SPEED * 0.6) P.runUp = Math.min(1, (P.runUp || 0) + dt / SPRINT.build); }
  else if (!P.pivot) P.runUp = Math.max(0, (P.runUp || 0) - dt * SPRINT.fade);   // (what a turn leaves you is kept through it)
  if (P.skid > 0) P.skid = Math.max(0, P.skid - dt);
  P.skidDust = (P.skidDust || 0) - dt;
  if ((P.skid > 0 || P.pivot) && P.skidDust <= 0 && Math.hypot(P.vx, P.vz) > 1.2) { P.skidDust = 0.05; burst(P.x + rr(-0.12, 0.12), 0.04, P.z + rr(-0.12, 0.12), 1, 'dust'); }   // kicked up as the boots scrape along
}

// running flat out at an open window or a fence takes you straight over it, no key needed: when you're pushing at it
// (wx, wz: the way you're pushing) and going at it (within about 60 degrees of straight across, SPRINT.autoVault) at
// better than a walk. Breaking into a sprint at it (start: sprintStart) takes you over too, even from a standstill
// up against it, as the vault key would.
export function sprintVault(wx, wz, start) {
  const sp = Math.hypot(P.vx, P.vz); if (!(wx || wz) || P.pivot || P.skid > 0 || P.dead || P.stun > 0 || (!start && sp < WALK_SPEED * 0.6)) return;
  const o = nearestOpening(), win = vaultTarget(o), t = win || fenceTarget(); if (!t) return;
  let jx, jz;
  if (win) { const side = Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1; jx = -o.nx * side; jz = -o.nz * side; }
  else if (Math.abs(t.x1 - P.x) > Math.abs(t.z1 - P.z)) { jx = Math.sign(t.x1 - P.x); jz = 0; } else { jx = 0; jz = Math.sign(t.z1 - P.z); }   // (straight across the fence, as tryVault takes it)
  if (wx * jx + wz * jz > SPRINT.autoVault && (start || (P.vx * jx + P.vz * jz) / sp > SPRINT.autoVault)) tryVault();
}
// the moment you break into a sprint: pressing sprint as you move, or moving off with it held (moving: you're pushing)
export function sprintStart(moving) { const go = sprintKey() && moving, s = go && !P.sprintGoWas; P.sprintGoWas = go; return s; }
// the plant and the swing round: your velocity's brought round to what the turn leaves you (nothing, or a cut's share
// of your pace the new way) at a steady PIVOT.dec, the grip building over the first moment (bite) rather than
// stopping you dead the instant you plant
export function pivotSlow(dt, tvx, tvz) {
  const dx = tvx - P.vx, dz = tvz - P.vz, d = Math.hypot(dx, dz), m = PIVOT.dec * smooth(clamp(P.pivot.t / PIVOT.bite, 0, 1)) * dt;
  if (d <= m) { P.vx = tvx; P.vz = tvz; } else { P.vx += dx / d * m; P.vz += dz / d * m; }
  P.carveW = 0;
}
// how quickly a sprint's pace comes up: harder for a moment as you drive off a turn, that drive building in over pushIn
const sprintAcc = () => P.pushT > 0 ? PIVOT.pushAcc * (0.35 + 0.65 * smooth(clamp((PIVOT.push - P.pushT) / PIVOT.pushIn, 0, 1))) : SPRINT.acc;
// steering at a sprint: the run swings round toward where you're pushing instead of sliding straight across to it.
// How fast it swings (P.carveW, radians a second, which also leans the body into it) eases in and out (SPRINT.carveIn)
// toward a rate that's quicker the further round there is to go (carveK), up to SPRINT.carve (a touch less the more
// momentum you have), so a bend rolls in and out smoothly. It keeps its pace through the bend less what the bend
// costs, while its speed comes up to the target on its own clock
// In first person the way you push turns with your view, so the run follows the view round (FP_CARVE) far closer than
// it would a key held another way: turning as you run never has you running off to one side of where you look, or your
// body (and the arms and gun on it) trailing round behind your view, and a bend you look round costs you less pace
const FP_CARVE = { k: 30, max: 16, cost: 0.35 };
export function sprintCarve(dt, tvx, tvz) {
  const s0 = Math.hypot(P.vx, P.vz), st = Math.hypot(tvx, tvz), fp = fpOn();
  if (s0 < 0.6 || !(dt > 0)) { const k = 1 - Math.exp(-dt * sprintAcc()); P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k; P.carveW = 0; return; }
  const a0 = Math.atan2(P.vx, P.vz), diff = angDiff(Math.atan2(tvx, tvz), a0), wMax = (fp ? FP_CARVE.max : SPRINT.carve) * (1 - 0.3 * (P.runUp || 0));
  P.carveW = (P.carveW || 0) + (clamp(diff * (fp ? FP_CARVE.k : SPRINT.carveK), -wMax, wMax) - (P.carveW || 0)) * (1 - Math.exp(-dt * (fp ? FP_CARVE.k : SPRINT.carveIn)));
  let step = P.carveW * dt;
  if (step * diff <= 0) step = 0;   // still swinging the old way round: hold the line till it swings the new way
  else if (Math.abs(step) > Math.abs(diff)) { step = diff; P.carveW = diff / dt; }   // and never past the way you're pushing
  const a = a0 + step;
  const cost = fp ? FP_CARVE.cost : 1, sp = (s0 + (st - s0) * (1 - Math.exp(-dt * sprintAcc()))) * (1 - Math.abs(step) * SPRINT.bendCost * cost);
  P.runUp = Math.max(0, (P.runUp || 0) - Math.abs(step) * 0.25 * cost);
  P.vx = Math.sin(a) * sp; P.vz = Math.cos(a) * sp;
}

// the animation's blends, each eased on its own clock: the gait (sprintK), the gun down at a low ready (ready), the body
// turned to where you're running (faceK; with Run and gun firing on the run too, the chest twisted round off it to the
// aim: rgK), the skid (skidK, a quick lean back that lets go as you stop), and a hard
// turn: the scramble to plant your feet (scrK, its quick choppy steps on scrPh, each one a scuff, a puff of dust and a
// jolt), then the turn round (pivK, its steps on pivPh, kept in time with the body coming round so each foot is set
// down a little further round), all with the gun still down (unless you've pulled the trigger)
export function sprintAnim(rdt) {
  const rg = runGunning(), pv = P.pivot, on = (P.sprint && !rg) || (!!pv && !P.fireQ) || (vaultHold() && !vaultGun());   // (and over a vault, one-handed, unless you can shoot on the way)
  if (pv) {
    // the body starts round as the feet dig in and eases round to the new way
    const u0 = PIVOT.brake * 0.4, u = smooth(clamp((pv.t - u0) / (pv.dur - u0), 0, 1));
    ANIM.runYaw = pv.from + pv.turn * u; ANIM.pivU = u; ANIM.pivTo = pv.from + pv.turn;
  } else if (Math.hypot(P.vx, P.vz) > 0.5) ANIM.runYaw = Math.atan2(P.vx, P.vz);
  const ease = (k, to, up, down) => { ANIM[k] = (ANIM[k] || 0) + (to - (ANIM[k] || 0)) * Math.min(1, rdt * (to > (ANIM[k] || 0) ? up : down)); };
  ease('sprintK', P.sprint ? 0.3 + 0.7 * sprintPace() : 0, 6, 4);   // the gait opens out as the momentum builds
  ease('runBank', P.sprint && !pv ? clamp(-(P.carveW || 0) * SPRINT.bank, -0.22, 0.22) : 0, 9, 6);   // leaning into a bend
  // down and back up on a spring (READY_W: how quick, down and up), so the gun starts lowering gently, swings down
  // through the middle and settles muzzle down rather than dropping at once; back up a touch quicker (a heavy gun
  // comes up slower: D.heavy.ready)
  { const w = on ? READY_W.down : READY_W.up * (((W(curId()) || {}).heavy || {}).ready || 1), to = on ? 1 - (ANIM.pzK || 0) : 0, h = Math.min(rdt, 0.05);   // (eased back up while paused: pauseIdle, player/hold.js)
    ANIM.readyV = (ANIM.readyV || 0) + (w * w * (to - (ANIM.ready || 0)) - 2 * w * (ANIM.readyV || 0)) * h; ANIM.ready = clamp((ANIM.ready || 0) + ANIM.readyV * h, 0, 1.02); }
  ease('faceK', on || P.sprint ? 1 : 0, 6, 5);
  ease('rgK', rg ? 1 : 0, 7, 5);   // the twist goes in a touch slower than the gun comes up, and unwinds as it goes down
  ease('bobK', P.sprint && !pv && !(P.skid > 0) ? 1 : 0, 2.5, 4);   // the view's bob dies smoothly away through a turn or a skid, and builds back as you get going (runCam)
  const scr = !!pv && pv.t < PIVOT.brake;
  const sk = P.skid > 0 ? Math.sin(Math.PI * Math.pow(1 - P.skid / SPRINT.skid, 0.7)) : scr ? 1 : 0;
  ease('skidK', sk, pv ? 12 : 18, pv ? 7 : 7);   // (a hard turn's plant is quick: the lean back goes in and comes out fast)
  ease('scrK', scr ? 1 : 0, 13, 6);
  ease('pivK', pv && pv.t > PIVOT.brake * 0.75 ? 1 : 0, 13, 5.5);
  // banked into the turn as you come round, and easing back level as you set off
  { const to = pv && pv.t > PIVOT.brake * 0.5 ? Math.sign(pv.turn) || 1 : 0; ANIM.pivBank = (ANIM.pivBank || 0) + (to - (ANIM.pivBank || 0)) * Math.min(1, rdt * (to ? 10 : 5)); }
  // the scramble's steps, quick and short, dying away as you stop
  if ((ANIM.scrK || 0) > 0.01) {
    const p0 = ANIM.scrPh || 0; ANIM.scrPh = p0 + rdt * PIVOT.scr * (scr ? 1 : 0.6);
    if (scr && Math.floor(ANIM.scrPh / Math.PI) !== Math.floor(p0 / Math.PI)) {
      footstep('run', 0.8);
      const sd = Math.floor(ANIM.scrPh / Math.PI) % 2 ? 1 : -1; burst(P.x + RIGHT.x * sd * 0.12 + rr(-0.05, 0.05), 0.04, P.z + RIGHT.z * sd * 0.12 + rr(-0.05, 0.05), 1, 'dust');
    }
  } else ANIM.scrPh = 0;
  // the turn's steps keep time with the body coming round; once it's round the last one's put down
  const ph0 = ANIM.pivPh || 0;
  if (pv) { ANIM.pivDir = Math.sign(pv.turn) || 1; ANIM.pivPh = Math.PI * Math.max(2, Math.round(Math.abs(pv.turn) / PIVOT.stepRad)) * (ANIM.pivU || 0); }
  else if ((ANIM.pivK || 0) > 0.01) ANIM.pivPh = Math.min(Math.ceil(ph0 / Math.PI - 1e-6) * Math.PI, ph0 + rdt * 16);
  else ANIM.pivPh = 0;
  if (pv && Math.floor(ANIM.pivPh / Math.PI) !== Math.floor(ph0 / Math.PI)) footstep('walk', 0.6);
}

// the view while you sprint stays steady: no shake and no turning, only a drift of a few centimetres with the stride,
// from side to side (RUN_CAM.side) and down at each footfall (dip), on top of the vault's, the recoil's and the
// rack's (game/camera.js). It dies smoothly away through a turn or a skid and builds back after (ANIM.bobK)
const RUN_CAM = { side: 0.015, dip: 0.04 };
export const camRun = { px: 0, pz: 0, bob: 0 };
export function runCam() {
  const k = smooth(clamp(ANIM.sprintK || 0, 0, 1)) * smooth(ANIM.bobK || 0), ph = P.phase, hit = Math.pow(Math.abs(Math.cos(ph)), 6), side = Math.sin(ph) * RUN_CAM.side * k;
  camRun.bob = -RUN_CAM.dip * hit * k; camRun.px = RIGHT.x * side; camRun.pz = RIGHT.z * side;
}
