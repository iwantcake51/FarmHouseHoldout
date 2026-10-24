// Per-frame weapon handling: trigger, swings, reloads, bursts, stamina, bleeding, smoke wisps.

import { GUN_Y, V3 } from '../core/renderer.js';
import { clamp, rr, smooth } from '../core/math.js';
import { moveCircle } from '../world/collision.js';
import { P } from '../player/player.js';
import { splashOn, youSplash } from '../effects/body-blood.js';
import { HEAVY_FIRE } from './gun-stats.js';
import { curId, S, stamMax, W, W8 } from '../game/run-state.js';
import { tickCycle } from './casings.js';
import { muzzleWorld } from '../effects/muzzle-flash.js';
import { smoke } from '../effects/smoke.js';
import { bleedDrip } from '../effects/particles.js';
import { zombies } from '../zombies/zombie-types.js';
import { vaultGun } from '../player/vaulting.js';
import { openSt } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { state } from '../game/state.js';
import { aimPt, hasMouse, mouseDown, mouseDownR, ray } from '../input/keyboard-mouse.js';
import { aiming, scoped } from '../player/aiming.js';
import { tStick } from '../input/touch.js';
import { resumeReload, tickReload, tickShut } from './reload.js';
import { AK_ON, akTriggers } from './akimbo.js';
import { aimRay, bodyOf, cursorTarget, fire, SETTLE, settleK } from './firing.js';
import { HEAVY, heavySwing, LUNGS, meleeHit } from '../melee/melee.js';
import { tickBandage } from '../player/bandages.js';
import { RUN_REST, SHOT_HOLD, SPRINT, sprintHolds } from '../player/sprint.js';
import { fpGunPitch, fpOn, VCAM } from '../game/view-cam.js';
import { ANIM, LOOK_DOWN } from '../player/animation.js';

const VAULT_BREATH = 1;   // seconds after a vault before stamina starts coming back
const PITCH_MAX = 0.75;   // how far down (radians) the arms will point a gun
const AIM_CHEST = 1.4, AIM_NEAR = 1.3, AIM_UP = 0.22, AIM_UP_FP = 0.9;   // where on a zombie you look (of its height), how near the aim it counts, how far up you'll point

// trigger, swings, reloads, bursts, stamina, bleeding and bandages
const groundPlane = new THREE.Plane(new V3(0, 1, 0), 0), _gp = new V3();
const BLEED_FLOOR = 15;   // the health bleeding leaves you on at worst: there it stops, the wound clotted
export function updateCombat(dt) {
  W8.cd -= dt;
  if (W8.swing > 0) {
    if (ANIM.mStop > 0) ANIM.mStop -= dt; else W8.swing = Math.max(0, W8.swing - dt);   // (stopped dead a moment on a blow that lands: meleeImpact)
    const p = 1 - W8.swing / W8.swingDur, D = W(curId()) || {}, heavy = heavySwing(D);
    if (heavy && !W8.whoosh && p >= HEAVY.whoosh) { W8.whoosh = true; SFX.swingHeavy(!D.blunt); }   // the heavy ones are heard coming down, before they land
    if (!W8.hitDone && p >= (heavy ? HEAVY.hit : 0.4)) { W8.hitDone = true; meleeHit(); }
  }
  resumeReload(); tickReload(dt); tickShut(dt); tickCycle(dt);
  const canFire = !openSt && !P.dead && !(P.bandT > 0) && !(ANIM.bandP > 0.25) && !sprintHolds();   // not till it's back in your hands after a bandage, nor sprinting (player/sprint.js)
  // (a click made while the gun was down at a sprint goes off now it's up: P.fireQ, player/sprint.js; one made while the
  // double barrel was open goes off as it latches: W8.shutFire, weapons/reload.js)
  const stickFire = !!(tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4), wantFire = (mouseDown || stickFire || !!P.fireQ || W8.shutFire > 0) && canFire;
  // a semi-auto needs the trigger let go between shots (trigLock); a burst keeps going only while it's held, and let go
  // part way through it stops there
  if (!wantFire) { W8.trigLock = false; W8.burstLeft = 0; }
  if (W8.burstLeft > 0) { W8.burstT -= dt; if (W8.burstT <= 0 && (W8.mag[curId()] || 0) > 0) { W8.burstLeft--; W8.burstT = 0.06; W8.inBurst = true; fire(); W8.inBurst = false; W8.cd = W8.burstLeft > 0 ? 0 : 0.45 / Math.sqrt(S.rateMul); } else if ((W8.mag[curId()] || 0) <= 0) W8.burstLeft = 0; }
  tickBandage(dt);
  // stamina comes back after a short breather; once you've emptied it you're winded until it's a third back
  P.stamT = (P.stamT || 0) + dt;
  // how much you're moving, for the spread: up at once as you move, settling over about a third of a second after you stop
  { const mv = clamp(Math.hypot(P.vx || 0, P.vz || 0) / 3, 0, 1); P.mvS = (P.mvS || 0) + (mv - (P.mvS || 0)) * Math.min(1, dt * (mv > (P.mvS || 0) ? 10 : 3)); }
  // stamina comes back after a short breather (Iron lungs makes it shorter and the recovery quicker), and not until a
  // second after you've climbed through or over something. What you ran off (P.runDebt) comes back last, and slowly:
  // only once you've been off a sprint for RUN_REST.wait, at RUN_REST.rate (player/sprint.js)
  // (all of it out of your stamina's ceiling, stamMax: a Broken stride's quarter, game/run-state.js)
  const sm = stamMax(); if (P.stam > sm) P.stam = sm;
  P.runT = (P.runT || 0) + dt; P.runDebt = clamp(P.runDebt || 0, 0, sm - P.stam);
  if (P.vault) P.stamWait = VAULT_BREATH; else if (P.stamWait > 0) P.stamWait -= dt;
  if (!(P.stamWait > 0)) {
    const lw = S.lungs ? LUNGS.wait / 0.55 : 1, lr = (P.moving ? 0.75 : 1) * (S.lungs ? LUNGS.refill : 1);
    if (P.stam + P.runDebt < sm) { if (P.stamT > 0.55 * lw) P.stam = Math.min(sm - P.runDebt, P.stam + dt * (P.exh ? 0.26 : 0.38) * lr); }
    else if (P.runDebt > 0 && P.runT > RUN_REST.wait * lw) { const g = Math.min(P.runDebt, dt * (P.exh ? RUN_REST.exh : RUN_REST.rate) * lr); P.stam += g; P.runDebt -= g; }
  }
  if (P.exh && P.stam >= 0.34 * sm) P.exh = false;
  // emptying the tank leaves you sluggish till you could sprint again (SPRINT.unlock); speed creeps back as the stamina does
  if (P.exh) P.fatigued = true; else if (P.stam >= SPRINT.unlock * sm) P.fatigued = false;
  const spT = P.fatigued ? 0.68 + 0.32 * clamp(P.stam / (SPRINT.unlock * sm), 0, 1) : 1;
  P.spdF = (P.spdF || 1) + (spT - (P.spdF || 1)) * Math.min(1, dt * (spT < (P.spdF || 1) ? 4 : 0.9));
  // point the gun (and your eyes) at what's under the cursor: the part of a zombie you're over; a zombie your aim is on
  // or near, at its chest and head (AIM_CHEST of its height, up a touch if it's close); a crawler down on the ground; or
  // over open ground a point at waist height where the cursor is. It tips down, and up only as far as AIM_UP at a
  // zombie standing close, never at a roof
  // With a menu up (a station's panel, or paused in co-op, where the farm runs on) the cursor is on the menu, not the
  // farm: nothing under it is looked at or bent down to, and you stand straight
  ANIM.pitchT = 0; ANIM.aimY = GUN_Y; ANIM.lookDnT = 0;
  const onFarm = state === 'play' && !(openSt && !aiming);
  if (!P.dead && !W(curId()).melee) {
    let ty = null, tx = aimPt.x, tz = aimPt.z;
    const ct = onFarm && !fpOn() ? cursorTarget() : null;   // (in first person, nothing under the crosshair turns the arms: fpGunPitch)
    if (ct) { ty = ct.y; tx = ct.x; tz = ct.zz; }
    else if (fpOn()) { ty = VCAM.aimY; }   // first person: where you look, no help onto a zombie (game/view-cam.js)
    else {
      const ar = aimRay(P.x, P.z, P.aim, 12);
      if (ar.z && ar.z.crawl) { ty = 0.3; [tx, tz] = bodyOf(ar.z); }
      else if (ar.z && !ar.z.dead) { ty = AIM_CHEST * (ar.z.T.scale || 1); tx = ar.z.x; tz = ar.z.z; }
      else {
        // nothing on the line: the zombie nearest where you're aiming, if it's close to it
        let best = AIM_NEAR;
        for (const z of zombies) { if (z.dead || z.vis < 0.15) continue; const [bx, bz] = bodyOf(z), d = Math.hypot(aimPt.x - bx, aimPt.z - bz); if (d < best) { best = d; ty = z.crawl ? 0.3 : AIM_CHEST * (z.T.scale || 1); tx = bx; tz = bz; } }
      }
    }
    // over open ground: waist height out in the yard, closer to the ground the nearer you aim, so the arms can point
    // well down at the dirt by your feet
    if (ty === null && onFarm && hasMouse && !tStick.R && !scoped && ray.ray.intersectPlane(groundPlane, _gp)) { const d = Math.hypot(_gp.x - P.x, _gp.z - P.z); ty = 0.85 - 0.55 * (1 - smooth(clamp((d - 0.8) / 2.6, 0, 1))); tx = _gp.x; tz = _gp.z; }
    if (ty !== null) {
      const fp = fpOn();   // (in first person you can point it up as far as you look: at a head above you, or the sky)
      ANIM.pitchT = fp ? clamp(fpGunPitch(), -AIM_UP_FP, PITCH_MAX) : clamp(Math.atan2(GUN_Y - ty, Math.max(0.6, Math.hypot(tx - P.x, tz - P.z))), ty > GUN_Y ? -AIM_UP : 0, PITCH_MAX);
      ANIM.aimY = fp ? ty : Math.min(GUN_Y, ty);
    }
  }
  // how far down at the ground near your feet you're looking, 0 to 1 (LOOK_DOWN: the knees bend for it,
  // player/animation.js): from the cursor's distance on the ground, whatever's in your hands
  if (onFarm && !P.dead && hasMouse && !tStick.R && !scoped && !fpOn() && ray.ray.intersectPlane(groundPlane, _gp) && !cursorTarget()) ANIM.lookDnT = 1 - smooth(clamp((Math.hypot(_gp.x - P.x, _gp.z - P.z) - LOOK_DOWN.near) / (LOOK_DOWN.far - LOOK_DOWN.near), 0, 1));
  if (P.kbx || P.kbz) { moveCircle(P, P.kbx * dt, P.kbz * dt, 0.3, true); const f = Math.exp(-dt * 7); P.kbx *= f; P.kbz *= f; if (Math.abs(P.kbx) + Math.abs(P.kbz) < 0.05) P.kbx = P.kbz = 0; }
  P.conc = Math.max(0, (P.conc || 0) - dt / 3.2);
  W8.heat = Math.max(0, (W8.heat || 0) - dt * 0.55); W8.wispT = (W8.wispT || 0) - dt;
  W8.sprayT = (W8.sprayT || 0) + dt;
  if (W8.spray > 0) { W8.spray *= Math.exp(-dt * SETTLE.rate * settleK(W(curId())) * smooth(clamp((W8.sprayT - SETTLE.hold) / SETTLE.ramp, 0, 1))); if (W8.spray < 0.002) W8.spray = 0; }   // (settling: SETTLE)
  if (W8.sprayT > HEAVY_FIRE.hold) W8.heavyK = Math.max(0, (W8.heavyK || 0) - dt * HEAVY_FIRE.ease);   // a heavy gun's slowdown eases off once you stop firing
  if (W8.heat > 0.7 && W8.wispT <= 0 && !W(curId()).melee && !P.dead) { W8.wispT = 0.09; const mw = muzzleWorld(); smoke(mw.x, mw.y + 0.02, mw.z, rr(-0.1, 0.1), rr(0.25, 0.5), rr(-0.1, 0.1), 0.04, 0.22, rr(0.9, 1.4), 0.16 * Math.min(1, W8.heat - 0.5)); }
  // bleeding wears you down, but never past BLEED_FLOOR: it can leave you hurting, never dead or a scratch from it
  if (P.bleed > 0 && !P.dead) {
    P.bleed = P.hp <= BLEED_FLOOR ? 0 : Math.max(0, P.bleed - dt); P.hp = Math.max(Math.min(P.hp, BLEED_FLOOR), P.hp - 1.7 * (S.bleedX || 1) * dt * S.dmgTaken);   // (worse under Bad blood: upgrades/sacrifice.js) P.dripT = (P.dripT || 0) - dt;
    splashOn(youSplash, dt * 0.02);   // it soaks into your clothes (effects/body-blood.js)
    if (P.dripT <= 0) { P.dripT = rr(0.12, 0.3); bleedDrip(); }                          // drops falling from the wound (effects/particles.js)
  }
  // a gun in each hand: each button its own gun (weapons/akimbo.js)
  const D = W(curId());
  if (D && D.akimbo) {
    const ok = canFire && (!P.vault || vaultGun()), q = P.fireQ;
    akTriggers(dt, curId(), D, { [AK_ON.left]: ok && (mouseDown || q === 'L'), [AK_ON.right]: ok && (mouseDownR || q === 'R'), any: ok && (stickFire || q === 'S') });
    if (ok && P.fireQ) { P.fireQ = null; P.shotHold = SHOT_HOLD; }
  }
  else if (wantFire && W8.cd <= 0 && W8.burstLeft <= 0 && (!P.vault || vaultGun()) && !W8.trigLock) { if (P.fireQ) { P.fireQ = null; P.shotHold = SHOT_HOLD; } W8.shutFire = 0; fire(); }
}
