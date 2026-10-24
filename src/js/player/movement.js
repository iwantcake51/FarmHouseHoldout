// Player movement, statuses and aiming each frame.

import { cam, FWD, GUN_Y, RIGHT, V3 } from '../core/renderer.js';
import { angDiff, clamp, smooth } from '../core/math.js';
import { moveCircle } from '../world/collision.js';
import { P } from './player.js';
import { carryMul, curId, healMul, hpCap, S, W, W8 } from '../game/run-state.js';
import { bloodyStep } from '../effects/blood-map.js';
import { VAULT_COOL, vaultGun, vaultLand, vaultTakeoff } from './vaulting.js';
import { vaultAt } from './vault-plan.js';
import { openSt } from '../stations/station-ui.js';
import { footstep } from '../audio/footsteps.js';
import { state } from '../game/state.js';
import {
  _pv, aimPlane, aimPt, centerMouse, hasMouse, keys, mouseX, mouseY, ndc, ray
} from '../input/keyboard-mouse.js';
import { aimHeld, aiming, exitScope, hasScope, scopeAim, scoped, scopePt, startAim } from './aiming.js';
import { tStick } from '../input/touch.js';
import { reloadSlow } from '../weapons/reload.js';
import { heavyFireSlow } from '../weapons/firing.js';
import { swingSlow } from '../melee/melee.js';
import { tickShove } from './shove.js';
import {
  pivotSlow, RUN_RELOAD, runReloading, SPRINT, sprintCarve, sprintPace, sprintStart, sprintVault, updateSprint,
  WALK_SPEED
} from './sprint.js';
import { aimSX, aimSY, updateShaky, xhStep } from './shaky-hands.js';
import { fpAim, fpAimPx, fpOn, freeOn, moveBasis, VCAM } from '../game/view-cam.js';
import { ANIM } from './animation.js';
import { drawMul, startSwap, swapFire, swapSt } from './swap.js';

// Painkillers' regeneration waits this long (seconds) after you last lost health
export const REGEN_WAIT = 5;
// how much a bandage going on slows your walk (Walking wounded takes S.bandLess of it off)
const BAND_SLOW = 0.55;
// badly hurt you limp, but you can still get about: slower from HURT_SLOW.from of your health, down to min of your pace
// at the last of it; and blown on top of that (the fatigue in weapons/combat-update.js), never below floor of it
const HURT_SLOW = { from: 0.35, min: 0.85, floor: 0.72 };

// status effects, walking, vaulting and aiming
// in first person, a gap between where you look and where you're facing bigger than gap (radians: after a vault, say,
// looking aside the whole way over) is turned through at k rather than snapped; smaller ones, everyday turning, are taken
// at once so your aim's exact
const FP_TURN = { gap: 0.25, k: 9 };
export function updatePlayer(dt) {
  P.slow = Math.max(0, P.slow - dt * 0.45); P.stun = Math.max(0, P.stun - dt); P.adr = Math.max(0, P.adr - dt); P.eye = Math.max(0, (P.eye || 0) - dt); P.adrCd = Math.max(0, (P.adrCd || 0) - dt);
  W8.glCd = Math.max(0, W8.glCd - dt); P.shoveCd = Math.max(0, (P.shoveCd || 0) - dt); tickShove(dt);
  if (!P.vault) P.vaultHeat = Math.max(0, (P.vaultHeat || 0) - dt / VAULT_COOL);   // chained vaults cool off once you're down
  // Painkillers: only once you've gone REGEN_WAIT seconds without losing any health (a bleed's included)
  if (P.hp < (P.hpWas ?? P.hp) - 1e-4) P.calmT = REGEN_WAIT; P.calmT = Math.max(0, (P.calmT || 0) - dt);
  if (S.regen && P.hp < hpCap() && P.calmT <= 0) P.hp = Math.min(hpCap(), P.hp + S.regen * healMul() * dt);
  P.hpWas = P.hp;
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (P.dead || freeOn()) mx = my = 0;   // (flying the free camera, you stand where you are: game/view-cam.js) the death clock runs in tickDeath (ui/screens.js), on real time
  else if (tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.3) { const oct = Math.round(Math.atan2(tStick.L.y, tStick.L.x) / (Math.PI / 4)) * (Math.PI / 4); mx = Math.round(Math.cos(oct)); my = Math.round(Math.sin(oct)); }
  const D0 = W(curId());
  // the way you're pushing, on the ground: up and right on the screen, or in first person forward and right of where
  // you face (game/view-cam.js)
  const [MF, MR] = moveBasis(FWD, RIGHT);
  const ml = Math.hypot(mx, my) || 1, wx = (MR.x * mx - MF.x * my) / ml, wz = (MR.z * mx - MF.z * my) / ml, go = sprintStart(!!(mx || my));
  if ((P.sprint || go) && !P.vault && state === 'play') sprintVault(wx, wz, go);   // sprinting at a window or a fence takes you over it (player/sprint.js)
  if (P.vault) {
    const v = P.vault;
    if (v.pre < v.preDur) {
      // the crouch: slide onto the jump's line at its starting spot
      v.pre += dt; const k = smooth(clamp(v.pre / v.preDur, 0, 1)), q = v.plan[0];
      const tx = v.C[0] + v.dx * q.s + v.L[0] * v.lat0, tz = v.C[1] + v.dz * q.s + v.L[1] * v.lat0;
      P.x = v.sx + (tx - v.sx) * k; P.z = v.sz + (tz - v.sz) * k;
      if (v.pre >= v.preDur) vaultTakeoff(v);
    } else {
      // the jump follows its plan (player/vault-plan.js), still moving at the end so the landing carries on into a walk
      v.t += dt / v.dur; const t = Math.min(1, v.t), q = vaultAt(v, t), lat = v.lat0 + (v.lat1 - v.lat0) * smooth(t);
      P.x = v.C[0] + v.dx * q.s + v.L[0] * lat; P.z = v.C[1] + v.dz * q.s + v.L[1] * lat;
      if (v.t >= 1) {
        // the weapon was put away for the jump (unless Vault fire kept it in hand): it's drawn again as you land, the
        // hands coming off the sill to it rather than it appearing in them (player/swap.js)
        const kept = vaultGun(); P.vault = null; vaultLand(v);
        if (!kept && W8.slot[W8.cur] && !swapSt) { startSwap(null, W8.cur); W8.cd = Math.max(W8.cd, swapFire(W8.cur) * drawMul(W8.slot[W8.cur]) / S.swapMul); }
        if (aimHeld) startAim();   // still holding aim (or pressed it on the way through): back down the sights
      }
    }
    if (P.vault) { P.moving = false; P.vx = P.vz = 0; }
  } else {
    updateSprint(dt, !!(mx || my), wx, wz);   // (player/sprint.js)
    let tvx = 0, tvz = 0;
    if ((mx || my) && P.stun <= 0 && !(P.skid > 0) && !P.pivot) {   // (skidding to a stop, or planting for a hard turn, you go where your momentum takes you)
      const hpF = P.hp / hpCap(), hurt = hpF < HURT_SLOW.from ? HURT_SLOW.min + (1 - HURT_SLOW.min) * hpF / HURT_SLOW.from : 1;   // badly hurt, you limp
      const worn = Math.max(HURT_SLOW.floor, hurt * (P.spdF || 1));   // (and blown on top of it: never slower than the floor)
      const sp = WALK_SPEED * (P.sprint ? 1 + (SPRINT.mul - 1) * sprintPace() : 1) * S.speedMul * (1 - 0.72 * P.slow) * worn * (P.adr > 0 ? 1.15 : 1) * (D0.slow || 1) * carryMul(curId()) * (runReloading() ? RUN_RELOAD.run : 1) * (scoped || scopeAim() ? 0.45 : aiming ? 0.58 : 1) * swingSlow() * (P.bandT > 0 ? 1 - BAND_SLOW * (1 - S.bandLess) : 1) * reloadSlow() * heavyFireSlow();
      // walking where you look is full speed; sideways about 87%, straight backwards about 76%
      const ahead = (1 + wx * Math.sin(P.aim) + wz * Math.cos(P.aim)) / 2, dirMul = P.sprint ? 1 : 0.76 + 0.24 * smooth(ahead);   // (sprinting you turn to run, so there's no backwards)
      tvx = wx * sp * dirMul; tvz = wz * sp * dirMul;
    }
    // a quick but soft start, a short glide when you let go, and a firmer push when you reverse; frame-rate independent
    // (a sprint builds up over a moment, and a skid only loses speed to the ground's friction)
    // (a cut mid-sprint carries some of your pace round into the new way while you plant: player/sprint.js)
    if (P.pivot && P.pivot.keep) { tvx = P.pivot.wx * P.pivot.keep; tvz = P.pivot.wz * P.pivot.keep; }
    const turning = (tvx || tvz) && tvx * P.vx + tvz * P.vz < 0, acc = P.skid > 0 ? SPRINT.skidFric : turning ? 22 : (tvx || tvz) ? 13 : 15, k = 1 - Math.exp(-dt * acc);
    if (P.pivot) pivotSlow(dt, tvx, tvz);   // planting for a hard turn (player/sprint.js)
    else if (P.sprint && !(P.skid > 0) && (tvx || tvz)) sprintCarve(dt, tvx, tvz);   // a sprint swings round into its bends, even a sharp cut
    else { P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k; P.carveW = 0; }
    if (Math.abs(P.vx) + Math.abs(P.vz) < 0.02) P.vx = P.vz = 0;
    const ox = P.x, oz = P.z; moveCircle(P, P.vx * dt, P.vz * dt, 0.3, true);
    if (dt > 0) { P.vx = (P.x - ox) / dt * 0.6 + P.vx * 0.4; P.vz = (P.z - oz) / dt * 0.6 + P.vz * 0.4; }
    const spd = Math.hypot(P.vx, P.vz);
    P.moving = spd > 0.35;
    const ph0 = P.phase; P.phase += dt * (5 + spd * 1.6 * (1 - 0.25 * (ANIM.sprintK || 0)));   // a sprint lengthens the stride more than it quickens it
    // a footstep each time a foot comes down (twice a stride), a run's when you're sprinting, harder the faster you go
    // (audio/footsteps.js picks the ground's own)
    if (P.moving && Math.floor(P.phase / Math.PI) !== Math.floor(ph0 / Math.PI)) { footstep(P.sprint ? 'run' : 'walk', clamp(spd / WALK_SPEED, 0.45, 1.25)); bloodyStep(); xhStep(clamp(spd / WALK_SPEED, 0.45, 1.3) * (P.sprint ? 1.4 : 1)); }   // and a bloody print if your boots are (effects/blood-map.js)
  }
  P.still = P.moving ? 0 : P.still + dt;

  updateShaky(dt);   // low health: the aim wanders and the arms tremble (player/shaky-hands.js)
  if (P.dead) { /* no more aiming */ }
  else if (fpOn() && state === 'play') {
    // (where you look; but a big gap, as after a vault while you looked aside, is turned through smoothly, not snapped)
    centerMouse(...fpAimPx()); const d = angDiff(VCAM.yaw, P.aim); P.aim = Math.abs(d) > FP_TURN.gap && !P.vault ? P.aim + d * Math.min(1, dt * FP_TURN.k) : P.vault ? P.aim : VCAM.yaw; fpAim(aimPt);
  }   // first person: you aim where you look (game/view-cam.js)
  else if (tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.25) {
    const sx = tStick.R.x, sy = tStick.R.y; P.aim = Math.atan2(RIGHT.x * sx - FWD.x * sy, RIGHT.z * sx - FWD.z * sy);
    aimPt.set(P.x + Math.sin(P.aim) * 6, GUN_Y, P.z + Math.cos(P.aim) * 6);
  } else if (scoped) {
    if (!hasScope()) exitScope();
    aimPt.copy(scopePt); if (Math.hypot(aimPt.x - P.x, aimPt.z - P.z) > 0.2) P.aim = Math.atan2(aimPt.x - P.x, aimPt.z - P.z);
  } else if (hasMouse && state === 'play') {   // (paused in co-op the farm runs on, but the cursor's on the menu)
    ndc.set(aimSX() / innerWidth * 2 - 1, -(aimSY() / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);   // (where the crosshair is, wandering off the cursor at low health)
    // a small dead zone round the character on screen, so sweeping the cursor across him never flips you round
    _pv.set(P.x, GUN_Y, P.z).project(cam);
    const psx = (_pv.x + 1) / 2 * innerWidth, psy = (1 - _pv.y) / 2 * innerHeight;
    // at the workbench or any station, the body and the gun stay where they were and only the head follows the cursor
    // (P.look: animatePlayer); the keys still walk you about. Aiming down the sights turns you to the cursor as ever
    const held = !!openSt && !aiming, pt = held ? _lookPt : aimPt;
    if (ray.ray.intersectPlane(aimPlane, pt) && Math.hypot(mouseX - psx, mouseY - psy) > 30 && Math.hypot(pt.x - P.x, pt.z - P.z) > 0.35) { const a = Math.atan2(pt.x - P.x, pt.z - P.z); if (held) P.look = a; else P.aim = a; }
  }
  if (!openSt || aiming || scoped || P.dead) P.look = null;
}
const _lookPt = new V3();
