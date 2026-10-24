// Player animation: walk, turn, limp, swings, recoil, reloads, death; and the per-frame player visuals.

import { GUN_Y, V3 } from '../core/renderer.js';
import { angDiff, clamp, rr, smooth } from '../core/math.js';
import { surfaceY } from '../world/house.js';
import { bandRolls, P, pBlob, PM, pOutline } from './player.js';
import { faceMood, LOOK } from './look.js';
import { updateCharBlood, updateWeaponBlood, WSTAIN } from '../effects/body-blood.js';
import { SLOTS } from '../weapons/slots.js';
import { curId, hpCap, W, W8 } from '../game/run-state.js';
import { GLOW_SET, gunMeshes } from '../weapons/gun-materials.js';
import {
  flash, flashCore, flashLen, flashLife, flashSize, flashStar, flashT, flashWide, setFlashT, tongueA, tongueB,
  updateMuzzleWisp
} from '../effects/muzzle-flash.js';
import { stepDrop } from '../effects/weapon-drop.js';
import { barrelFire } from '../effects/puffs.js';
import { stepRagdoll } from '../zombies/deaths.js';
import { pXray } from '../effects/outlines.js';
import { vaultGun } from './vaulting.js';
import { vaultAt, VB } from './vault-plan.js';
import { gunGlow, gunGlowId, setGunGlow, setGunGlowId, state, worldK } from '../game/state.js';
import { INTRO, introKneel, introLook, introPose, titleBlend } from '../game/intro.js';
import { PIVOT, sprintAnim, WALK_SPEED } from './sprint.js';
import { fpOn } from '../game/view-cam.js';
import { springTo } from '../game/camera.js';
import { roofOver } from '../world/cutaway.js';
import { PRAG } from './player-ragdoll.js';
import { ARM_THIN, armRest, poseHands, reach } from './hold.js';
import { updatePack, updateStow } from './stow.js';
import { updateBandStow, updateSwap } from './swap.js';

// ---- player animation: eased facing, hips that follow your feet, bob, sway, limp, recoil, reloads, swings ----
// slideT is per hand (R, L) so akimbo guns cycle on their own shots (their kick springs are RK in player/hold.js)
export const ANIM = { pitch: 0, pitchT: 0, aimY: GUN_Y, slideT: { R: 1, L: 1 }, yaw: Math.PI, standY: 0, tw: 0, vtw: 0, bank: 0, vbank: 0, legYaw: 0, legDir: 1, lx: 0, lz: 0, flinch: 0, flinchSide: 1, sw: 0, relEnv: 0 };
// how far the hips turn from the torso toward the way you're walking (radians); the rest is a side step
const HIP_TWIST = 0.38, LEG_FLIP = 0.07;   // (LEG_FLIP: how far past straight across, in half-turns, before the stride plays the other way)
// how far the boot soles reach below the model's feet; on a floor they're lifted that much to stand on top of it
const SOLE_LIFT = 0.009;
// turning, the chest leads: twisted round ahead of the hips by TURN_TWIST and leaned in by TURN_BANK for each radian a
// second you're turning (up to TURN_MAX and a tenth), on a loose spring so it swings a touch past as the turn stops
const TURN_TWIST = 0.045, TURN_BANK = 0.012, TURN_MAX = 0.42;
// looking about at a sprint (animatePlayer): the cursor within ahead (radians) of the way you run, the chest turns as far
// as chest toward it and the head up to head further; past it (eased in over blend) you look back over that shoulder,
// the chest turned backChest and the head backHead more; past behind, you keep to the shoulder you're looking over.
// Like a real runner the head never gets round to the side: it turns at most neck on the shoulders and max from the way
// you run, all told (about 43° and 60°), however the chest, a turn's lead and the springs add up
// walking backwards (animatePlayer): the whole body tips back from the ankles by body and the chest by chest more (radians),
// eased in over a moment as you back off; the head tucks back down to keep looking level
const BACKPEDAL = { body: 0.06, chest: 0.05, head: 0.6, ease: 6 };
// looking down at the ground close to your feet (ANIM.lookDnT, weapons/combat-update.js: full with the cursor nearer
// than near, none past far, metres) you sink a little into your knees to see it: the knees bend by knee, the thighs
// come forward by thigh, the body drops by drop (metres) and the chest leans in by chest, eased in and out at ease.
// Less on the move, none at a sprint or a climb
// hurt (from LIMP.from of your health, worst by LIMP.to; eased in and out over a moment, so a hit or a bandage doesn't
// snap it): the right leg's the bad one, and you walk the way anyone does on a leg that hurts. The time on it is cut
// short (warp: the stride hurried through the bad leg's stance, unhurried over the good one's) and its step is shorter
// (short); it's kept stiff, the knee hardly bending as it comes through (stiff), and swung round a little to clear the
// ground (out). You ride up over it, stiff, and sink onto the good leg (rise, sink, metres), the trunk leaning over the
// bad leg as it takes the weight (lean) and the hip on the good side dropping (hip), the head held level through it all.
// Standing, the weight's off it (rest: its knee bent and the hip dropped that side), upright, the breathing quicker and
// deeper (breath: how much more, how much quicker), and now and then a wince (wince: how often, seconds, at the worst;
// the knee buckling a little with it)
const LIMP = { from: 0.45, to: 0.08, warp: 0.3, short: 0.35, stiff: 0.65, out: 0.1, rise: 0.018, sink: 0.028, lean: 0.075, hip: 0.07, rest: 0.26, breath: [1.4, 1.1], wince: [3, 7] };
export const LOOK_DOWN = { near: 0.9, far: 2.6, knee: 0.22, thigh: 0.11, drop: 0.03, chest: 0.045, ease: 3.5 };
const SPRINT_LOOK = { ahead: 0.9, blend: 0.45, chest: 0.3, head: 0.55, backChest: 0.35, backHead: 0.7, behind: 2.7, neck: 0.75, max: 1.05 };
// Run and gun at a sprint (ANIM.rgK, player/sprint.js): the legs keep running the way you're going and the upper body
// twists round from the hips to the aim, up to max (as far as RG_ARC lets you fire), on a stiff spring (k, damp) so it
// carries a little weight swinging round and settles without a wobble. The shoulder you shoot across dips a touch (roll,
// for each radian of twist). The head rides on it down the sights, held to SPRINT_LOOK's limits: past them it's the eyes
const RG_TWIST = { max: 1.3, k: 230, damp: 28, roll: 0.05 };
// at a station (the workbench and the rest) the body holds still and the head alone follows the cursor (P.look:
// player/movement.js), up to max off the way the body faces (about 60°, as at a sprint); with the cursor right behind
// you (past behind) it stays turned to the shoulder it was looking over, and when the panel shuts it comes back round
const MENU_LOOK = { max: 1.05, behind: 2.7 };
function animateDeath(dt) {
  const pm = PM, t = P.deathT, sg = ANIM.deathSign;
  // knees go (0-.35), topple (.35-.85), slap down with a small rebound, then lie still and breathe out
  const kn = smooth(clamp(t / 0.35, 0, 1)), fall = clamp((t - 0.3) / 0.55, 0, 1), f2 = fall * fall;
  const land = t > 0.85 ? Math.sin(Math.min(1, (t - 0.85) / 0.35) * Math.PI) * 0.08 * (1 - Math.min(1, (t - 0.85) / 0.35)) : 0;
  const rx = sg * (0.18 * kn + 1.36 * f2 - land);
  pm.g.position.set(P.x, (ANIM.standY || 0) - 0.18 * kn * (1 - fall) + 0.15 * f2, P.z); pm.g.rotation.set(rx, ANIM.yaw, ANIM.deathTwist * fall);
  pm.lower.rotation.y = 0; pm.lower.position.y = 0; pm.upper.position.y = 0;
  pm.legL.rotation.x = 0.55 * kn * (1 - fall * 0.6); pm.legR.rotation.x = 0.25 * kn * (1 - fall * 0.4);
  const flail = Math.sin(t * 9) * 0.1 * (1 - fall);
  pm.armL.position.set(-0.33, 1.08, 0); pm.armR.position.set(0.33, 1.08, 0); pm.armL.scale.set(ARM_THIN, ARM_THIN, 1); pm.armR.scale.set(ARM_THIN, ARM_THIN, 1);
  pm.armL.rotation.set(sg > 0 ? -1.2 * kn - 0.9 * fall + flail : -0.4 * kn - 2.2 * fall + flail, 0.5 * fall, -0.5 * fall);
  pm.armR.rotation.set(sg > 0 ? -1.0 * kn - 1.0 * fall - flail : -0.6 * kn - 2.0 * fall - flail, -0.6 * fall, 0.4 * fall);
  pm.upper.rotation.set(sg * 0.15 * kn, 0.08 * fall * Math.sign(ANIM.deathTwist || 1), 0);
  pm.head.rotation.set(-sg * 0.3 * fall, 0, 0.2 * fall * Math.sign(ANIM.deathTwist || 1));
  dropFall(dt);
}
// the weapon you dropped as you went down, falling and landing (effects/weapon-drop.js)
function dropFall(dt) { stepDrop(ANIM.dropped, dt); }
// ---- vaulting: a crouch and a reach for the sill, the push-off with a hand planted on it, the legs tucked and swung
// over to one side, then reaching down for the ground. A winded scramble goes over belly-first on both hands, low and
// slow, the legs dragging. The landing itself (knees giving, the dip) is ANIM.land below.
// how far through a stage: vk(t, a, b) eases from 0 to 1 as t goes from a to b
export const vk = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));
function vaultPhase(v) { return { c: v.t > 0 ? 1 : smooth(clamp(v.pre / v.preDur, 0, 1)), t: Math.min(1, v.t), air: v.t > 0 }; }
// the body's pose read off the vault's plan (player/vault-plan.js): the hips, the lean and each leg's angle. Through the
// crouch it eases from standing into the plan's first pose. The body tips about the hips, not the feet.
function vaultPose(pm, v) {
  const { c, t, air } = vaultPhase(v), p0 = v.plan[0];
  const q = air ? vaultAt(v, t) : { y: VB.hip + (p0.y - VB.hip) * c, lean: p0.lean * c, legL: p0.legL * c, legR: p0.legR * c };
  pm.g.rotation.x = q.lean;
  pm.legL.rotation.x = q.legL - q.lean; pm.legR.rotation.x = q.legR - q.lean;
  // the hips turn so the legs swing over a fence side by side (the plan's twist); through a window there's no room
  pm.lower.rotation.y = q.twist || 0;   // already turned to the side away from the post
  pm.lower.rotation.z = 0; pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.position.y = 0;
  const yw = ANIM.yaw;
  pm.g.position.y = q.y - VB.hip + VB.hip * (1 - Math.cos(q.lean));
  pm.g.position.x -= Math.sin(yw) * VB.hip * Math.sin(q.lean); pm.g.position.z -= Math.cos(yw) * VB.hip * Math.sin(q.lean);
}
// the chest stays turned toward where you're going while the legs swing away, and the head keeps looking ahead
function vaultUpper(v, up) {
  const { c, t, air } = vaultPhase(v), lean = air ? vaultAt(v, t).lean : v.plan[0].lean * c;
  const sw = air ? vaultAt(v, t).twist || 0 : 0;
  // the plan places the whole body, so the upper body's own lean (aiming, walking, a flinch) is held off through the jump
  const hold = air ? 1 - vk(t, 0.88, 1) : c; up.x *= 1 - hold; up.z *= 1 - hold;
  up.y -= sw * 0.55;   // the chest stays turned to the front while the hips swing round
  PM.head.rotation.x -= Math.max(0, lean - 0.5) * 0.4;   // chin up as the body goes flat (Vault fire keeps the chest on the aim: animatePlayer)
}
// both hands go down on the sill or rail (the weapon is put away) and stay put on it while your body goes over
const _vw = new V3(), _vs = new V3(), _vr = new THREE.Euler(), _vp = new V3();
function vaultReach(pm, arm, side, pt, w) {
  if (w <= 0.001) return;
  pm.upper.worldToLocal(_vs.copy(pt));
  _vr.copy(arm.rotation); _vp.copy(arm.position); const sc0 = arm.scale.z;
  reach(arm, side, _vs, 0, false);
  arm.rotation.set(_vr.x + (arm.rotation.x - _vr.x) * w, _vr.y + (arm.rotation.y - _vr.y) * w, _vr.z * (1 - w)); arm.scale.z = sc0 + (arm.scale.z - sc0) * w;
  arm.position.lerpVectors(_vp, arm.position, w);
}
function vaultHands(pm, v) {
  const { c, t, air } = vaultPhase(v), win = v.kind === 'window';
  // once the hands let go they swing out loose for balance (the weapon's put away), and stay loose through the landing:
  // the weapon is drawn from there as you touch down (player/swap.js), so the hands don't first come up empty to where
  // it would be
  const one = vaultGun();   // Vault fire: the right hand stays on the gun, the left does the vault alone, and takes its time coming back to it
  const wb = air ? vk(t, 0.35, 0.55) * (one ? 1 - vk(t, 0.66, 1) : 1) : 0;
  if (wb > 0.001) [['L', pm.armL, -1], ['R', pm.armR, 1]].filter(a => !(one && a[0] === 'R')).forEach(([s, arm, sd]) => {
    _vr.copy(arm.rotation); _vp.copy(arm.position); const sc0 = arm.scale.z;
    armRest(arm, s, 0.9 + Math.sin(t * 9 + sd) * 0.08, sd * 0.5);
    arm.rotation.set(_vr.x + (arm.rotation.x - _vr.x) * wb, _vr.y + (arm.rotation.y - _vr.y) * wb, _vr.z * (1 - wb)); arm.scale.z = sc0 + (arm.scale.z - sc0) * wb;
    arm.position.lerpVectors(_vp, arm.position, wb);
  });
  const w1 = air ? 1 - vk(t, win ? 0.4 : 0.42, win ? 0.58 : 0.66) : vk(c, 0.3, 1), w2 = 0;
  if (w1 <= 0.001 && w2 <= 0.001) return;
  pm.g.updateMatrixWorld(true);
  const lat = [v.L[0], v.L[1]];   // to your left
  [['L', pm.armL, 1], ['R', pm.armR, -1]].filter(a => !(one && a[0] === 'R')).forEach(([s, arm, sd]) => {
    const spread = v.scramble ? 0.2 : 0.16, dL = sd * spread - 0.16;   // the left hand is already set 0.16 to the left
    _vw.copy(v.plant); _vw.x += lat[0] * dL; _vw.z += lat[1] * dL; _vw.y += 0.03; vaultReach(pm, arm, s, _vw, w1);
    _vw.copy(v.ground); _vw.x += lat[0] * (sd * spread - 0.14); _vw.z += lat[1] * (sd * spread - 0.14); vaultReach(pm, arm, s, _vw, w2);
  });
}
// Keep firing and your face sets angry (faceMood, player/look.js): shots close enough together (within ANGER_T.gap,
// or a third again the gun's own time between shots for a slow one) are one run of fire, and from the run's
// ANGER_T.shots'th shot it comes in over a moment; stop and it eases back off, slower still
const ANGER_T = { gap: 0.2, shots: 3, rise: 3.5, fall: 1.6 };
export function angerShot(rate) {
  const gap = Math.max(ANGER_T.gap, rate * 1.3);
  ANIM.runShots = (ANIM.shotT ?? 9) < gap ? (ANIM.runShots || 0) + 1 : 1; ANIM.shotT = 0; ANIM.shotGap = gap;
}
function angerStep(rdt) {
  ANIM.shotT = (ANIM.shotT ?? 9) + rdt;
  const want = !P.dead && ANIM.shotT < (ANIM.shotGap || ANGER_T.gap) && (ANIM.runShots || 0) >= ANGER_T.shots ? 1 : 0, a = ANIM.anger || 0;
  ANIM.anger = a + (want - a) * (1 - Math.exp(-rdt * (want > a ? ANGER_T.rise : ANGER_T.fall)));
  if (ANIM.anger < 0.002 && !want) ANIM.anger = 0;
  worryStep(rdt); hurtStep(rdt);
  faceMood(LOOK.g.head, ANIM.anger, ANIM.worry, ANIM.hurt, P.dead ? 0 : ANIM.ads || 0);
}
// a hit makes you wince (faceMood's h): it's on you at once and held a moment (HURT_FACE.hold, longer for a harder hit),
// then eases off
const HURT_FACE = { hold: 0.4, rise: 25, fall: 2.6 };
export function hurtFace(k = 1) { ANIM.hurtT = Math.max(ANIM.hurtT || 0, HURT_FACE.hold * clamp(k, 0.6, 1.6)); }
function hurtStep(rdt) {
  ANIM.hurtT = Math.max(0, (ANIM.hurtT || 0) - rdt);
  const want = !P.dead && ANIM.hurtT > 0 ? 1 : 0, h = ANIM.hurt || 0;
  ANIM.hurt = h + (want - h) * (1 - Math.exp(-rdt * (want > h ? HURT_FACE.rise : HURT_FACE.fall)));
  if (ANIM.hurt < 0.002 && !want) ANIM.hurt = 0;
}
// Pull the trigger on an empty gun and the click startles you (faceMood's w): the face jumps to it at once and holds
// for WORRY_T.hold, every click starting the hold again, then eases back off over the next second or so
const WORRY_T = { hold: 0.45, rise: 30, fall: 3.2 };
export function worryShot() { ANIM.worryT = WORRY_T.hold; }
function worryStep(rdt) {
  ANIM.worryT = Math.max(0, (ANIM.worryT || 0) - rdt);
  const want = !P.dead && ANIM.worryT > 0 ? 1 : 0, w = ANIM.worry || 0;
  ANIM.worry = w + (want - w) * (1 - Math.exp(-rdt * (want > w ? WORRY_T.rise : WORRY_T.fall)));
  if (ANIM.worry < 0.002 && !want) ANIM.worry = 0;
}
const BODY_YAW = { k: 420, z: 0.72, max: 20 };
function animatePlayer(dt, rdt) {
  const pm = PM, D = W(curId()) || W('pistol'), now = performance.now() / 1000;
  if (P.dead) { if (PRAG.me) { stepRagdoll(PRAG.me, (P.deathDt || 0) * PRAG.step); dropFall(P.deathDt || 0); } else animateDeath(P.deathDt || 0); return; }   // (gone down as a ragdoll: player/player-ragdoll.js)
  if (P.vault) ANIM.postVault = 0.45; else ANIM.postVault = Math.max(0, (ANIM.postVault || 0) - rdt);
  sprintAnim(rdt);   // (player/sprint.js)
  pm.shinL.rotation.x = pm.shinR.rotation.x = 0;   // the knees straight, unless the stride or a landing bends them below
  const turnRate = P.vault ? 20 : ANIM.postVault > 0 ? 5 + (1 - ANIM.postVault / 0.45) * 9 : P.pivot ? PIVOT.yawRate : 11;   // ease back round to your aim after a vault; a hard turn's loose, the body trailing the hips round
  // sprinting you turn to face where you're running (faceK), and back round to your aim as you come out of it. Your aim
  // itself is where the cursor is, at once; it's the body that comes round to it, quickly, on a spring (BODY_YAW: how stiff,
  // how damped, a hair under 1 so a long turn carries a touch past and settles, and the fastest it turns, radians a
  // second), the chest and arms taking up what it hasn't yet (rgTw below); over a vault, just after one and in a hard
  // sprint turn it's eased round at turnRate instead
  const yawTo = P.vault ? P.vault.face : P.aim + angDiff(ANIM.runYaw ?? P.aim, P.aim) * smooth(clamp(ANIM.faceK || 0, 0, 1));
  if (P.vault || ANIM.postVault > 0 || P.pivot || !(rdt > 0)) { ANIM.yaw += angDiff(yawTo, ANIM.yaw) * Math.min(1, rdt * turnRate); ANIM.yawV = 0; }
  else {
    const w = Math.sqrt(BODY_YAW.k);
    for (let n = Math.ceil(Math.min(rdt, 0.05) / (1 / 120)), h = Math.min(rdt, 0.05) / n, i = 0; i < n; i++) {
      ANIM.yawV = clamp((ANIM.yawV || 0) + (BODY_YAW.k * angDiff(yawTo, ANIM.yaw) - 2 * BODY_YAW.z * w * (ANIM.yawV || 0)) * h, -BODY_YAW.max, BODY_YAW.max);
      ANIM.yaw += ANIM.yawV * h;
    }
    ANIM.yaw = Math.atan2(Math.sin(ANIM.yaw), Math.cos(ANIM.yaw));
  }
  // Vault fire: the chest keeps the gun on your aim the whole way over, the hips turning to the sill beneath it, and
  // after the landing it stays there while the hips come back round under it; then it lets go (ANIM.rg), by when there's
  // nothing left to make up. chestYaw is where the chest faces
  if (vaultGun()) ANIM.rg = 1; else ANIM.rg = Math.max(0, (ANIM.rg || 0) - rdt * (P.vault || ANIM.postVault > 0 ? 0 : 3));
  // Run and gun at a sprint (RG_TWIST): the chest twists round off the running hips to the aim, and back as it lets go
  if (ANIM.rgT === undefined) ANIM.rgT = ANIM.vrgT = 0;
  if (rdt > 0) springTo(ANIM, 'rgT', 'vrgT', clamp(angDiff(P.aim, ANIM.yaw), -RG_TWIST.max, RG_TWIST.max) * smooth(clamp(ANIM.rgK || 0, 0, 1)), RG_TWIST.k, RG_TWIST.damp, Math.min(rdt, 0.04));
  const rgTw = clamp(angDiff(P.aim, ANIM.yaw), -1.2, 1.2) * ANIM.rg + ANIM.rgT * (1 - ANIM.rg); ANIM.chestYaw = ANIM.yaw + rgTw;
  // how fast the chest is turning (not the hips swinging round to a sill or back from one)
  const om = (P.vault && !vaultGun()) || !(rdt > 0) ? 0 : clamp(angDiff(ANIM.chestYaw, ANIM.prevYaw ?? ANIM.chestYaw) / rdt, -12, 12); ANIM.prevYaw = ANIM.chestYaw;
  // you stand on whatever's underfoot (surfaceY in world/house.js): up onto the porch, its step and the door's
  // threshold, and the floorboards and rugs indoors, the soles just on top; stepping up and down takes a moment
  { const s = surfaceY(P.x, P.z), t = s > 0 ? s + SOLE_LIFT : 0; ANIM.standY += (t - ANIM.standY) * Math.min(1, rdt * 16); }
  pm.g.position.set(P.x, ANIM.standY, P.z); pm.g.rotation.set(0, ANIM.yaw, 0); pBlob.position.set(P.x, ANIM.standY + 0.02, P.z); pBlob.scale.setScalar(1.15);
  const spd = Math.hypot(P.vx, P.vz), runF = clamp(spd / WALK_SPEED, 0, 1.3), sk = smooth(clamp(ANIM.sprintK || 0, 0, 1)), skid = smooth(clamp(ANIM.skidK || 0, 0, 1));
  const hpF = P.hp / hpCap();
  ANIM.limpK = (ANIM.limpK || 0) + ((P.dead ? 0 : smooth(clamp((LIMP.from - hpF) / (LIMP.from - LIMP.to), 0, 1))) - (ANIM.limpK || 0)) * Math.min(1, rdt * 1.5);
  const limp = ANIM.limpK;
  // a wince now and then while you're badly hurt (LIMP.wince), quicker the worse it is
  ANIM.winceT = (ANIM.winceT ?? 4) - rdt; ANIM.wince = Math.max(0, (ANIM.wince || 0) - rdt * 1.7);
  if (ANIM.winceT <= 0) { ANIM.winceT = rr(LIMP.wince[0], LIMP.wince[1]) / (0.5 + limp); if (limp > 0.3 && !P.vault) ANIM.wince = 1; }
  const wince = Math.sin(Math.PI * (ANIM.wince || 0)) * limp;
  angerStep(rdt);
  ANIM.flinch = Math.max(0, ANIM.flinch - rdt * 4); ANIM.sw = Math.max(0, ANIM.sw - rdt * 4.5); ANIM.stumble = Math.max(0, (ANIM.stumble || 0) - rdt * 2.2);
  // hips turn a little toward the direction you walk (no more than HIP_TWIST, so the legs stay under the torso); walking
  // away from your aim plays the stride backwards. Whatever's left over the legs side-step (ANIM.r2, below): walking
  // across your aim is a strafe, legs swinging out to the side, not hips wrung round under a torso facing elsewhere
  const ads = ANIM.ads || 0;
  let legYaw = 0, mvRel = 0;
  if (spd > 0.3 || P.vault) {
    // (which way the stride plays only changes some way past straight across, LEG_FLIP either side, so a strafe doesn't
    // flick it back and forth; and it blends over rather than flipping: legDirS, below)
    if (spd > 0.3) { const md = Math.atan2(P.vx, P.vz); let rel = angDiff(md, ANIM.yaw); ANIM.legDir = Math.abs(rel) > Math.PI * (0.5 + (ANIM.legDir < 0 ? -LEG_FLIP : LEG_FLIP)) ? -1 : 1; if (ANIM.legDir < 0) rel = angDiff(rel, Math.PI); mvRel = rel; const lim = HIP_TWIST * (1 - 0.4 * ads); legYaw = clamp(rel, -lim, lim); }
    ANIM.legYaw += (legYaw - ANIM.legYaw) * Math.min(1, rdt * (ANIM.postVault > 0 ? 4 : 10));   // the hips come round gently out of a vault
    ANIM.feet = ANIM.yaw + ANIM.legYaw; ANIM.stepping = false;
  } else {
    // standing still the torso turns on its own; when the twist gets too big the feet shuffle round to catch up
    if (ANIM.feet === undefined) ANIM.feet = ANIM.yaw;
    const tw = angDiff(ANIM.yaw, ANIM.feet);
    if (P.pivot || (ANIM.pivK || 0) > 0.05) {
      // turning round from a sprint the hips lead the body round, step by step (below), and settle under it once it's round
      const lead = P.pivot ? clamp(angDiff(ANIM.pivTo ?? ANIM.yaw, ANIM.yaw), -1, 1) * PIVOT.lead : 0;
      ANIM.feet += angDiff(ANIM.yaw + lead, ANIM.feet) * Math.min(1, rdt * 12); ANIM.stepping = false;
    }
    else if (!ANIM.stepping && Math.abs(tw) > 0.8) { ANIM.stepping = true; ANIM.stepT = 0; }
    if (ANIM.stepping) { ANIM.feet += tw * Math.min(1, rdt * 6.5); ANIM.stepT += rdt; if (Math.abs(angDiff(ANIM.yaw, ANIM.feet)) < 0.06 && ANIM.stepT > 0.25) ANIM.stepping = false; }
    ANIM.legYaw = angDiff(ANIM.feet, ANIM.yaw);
  }
  pm.lower.rotation.y = ANIM.legYaw;
  // how far off the hips' facing you're actually going: the legs swing along that line, partly as a side step
  ANIM.r2 = (ANIM.r2 || 0) + ((spd > 0.3 && !P.vault ? clamp(angDiff(mvRel, ANIM.legYaw), -1.3, 1.3) : 0) - (ANIM.r2 || 0)) * Math.min(1, rdt * 10);
  ANIM.legDirS = (ANIM.legDirS ?? 1) + (ANIM.legDir - (ANIM.legDirS ?? 1)) * Math.min(1, rdt * 7);   // the stride's way, blended
  // the stride's size follows your speed on a short lag, so turning round on the spot (your speed dipping through
  // nothing for a frame) doesn't snap the legs together
  ANIM.strideK = (ANIM.strideK ?? 0) + (Math.min(1, runF) - (ANIM.strideK ?? 0)) * Math.min(1, rdt * 9);
  // (the bad leg's stance is when cos(ph) < 0: bs below; the good leg's when it's above, gs)
  const ph = P.phase - LIMP.warp * limp * Math.sin(P.phase), s = Math.sin(ph), bs = Math.max(0, -Math.cos(ph)), gs = Math.max(0, Math.cos(ph)), stride = 0.65 * ANIM.strideK * (1 - 0.2 * ads) * (1 + 0.28 * sk);   // a sprint reaches further each step
  // how much you're backing off: going away from where you face, at a walk or better (full at an aimed backpedal's pace)
  { const back = spd > 0.3 && !P.vault ? Math.max(0, -Math.cos(angDiff(Math.atan2(P.vx, P.vz), ANIM.yaw))) * Math.min(1, spd / 1.4) : 0;
    ANIM.backK = (ANIM.backK || 0) + (back - (ANIM.backK || 0)) * Math.min(1, rdt * BACKPEDAL.ease); }
  ANIM.land = Math.max(0, (ANIM.land || 0) - rdt * 2.4);   // 0.42 s to soak up a landing
  if (P.vault) {
    vaultPose(pm, P.vault);
  } else if (ANIM.land > 0) {
    // landing: from a plain stance the knees give and the body dips forward, then rises back up as the stride
    // comes back in, so you walk straight out of it (a winded landing sinks deeper)
    const p = 1 - ANIM.land, k = Math.sin(Math.PI * p) * (ANIM.landHeavy ? 1.45 : 1), back = smooth(p);
    pm.g.position.y = ANIM.standY - k * 0.1; pm.g.rotation.x = k * 0.2;
    pm.legL.rotation.x = ANIM.legDirS * s * stride * back - k * 0.5; pm.legR.rotation.x = -ANIM.legDirS * s * stride * back * (1 - limp * LIMP.short) + k * 0.32;
    pm.shinL.rotation.x = k * 0.75; pm.shinR.rotation.x = k * 0.45;   // the knees give
    pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.rotation.z = 0; pm.lower.rotation.y = ANIM.legYaw;
  } else {
    // the stride runs along the line you're going: fore and aft as far as the hips face it, and the rest a side step,
    // each foot stepping out further than it comes back in so the legs never cross. Down the sights the stance widens
    // a little and the steps shorten
    const st = ANIM.legDirS * s * stride, sc = Math.cos(ANIM.r2), sn = Math.sin(ANIM.r2), bad = 1 - limp * LIMP.short, splay = 0.045 * ads;
    pm.legL.rotation.x = st * sc;
    pm.legR.rotation.x = -st * sc * bad;   // (the bad leg's step shorter)
    const zl = -st * sn * 0.5, zr = st * sn * 0.5 * bad;
    // turning on the spot: a loose pivot with a little give in the legs and a weight shift, never a full step
    pm.legL.rotation.z = (zl > 0 ? zl * 0.35 : zl) - splay; pm.legR.rotation.z = (zr < 0 ? zr * 0.35 : zr) + splay; pm.lower.rotation.z = spd <= 0.3 ? ANIM.legYaw * 0.035 : 0;
    // limping: the stiff bad leg swung round the side a little as it comes through (LIMP.out), and the hip on the good
    // side dropping while the bad one has the weight (LIMP.hip)
    if (limp > 0.001) { const m = Math.min(1, runF); pm.legR.rotation.z += LIMP.out * limp * gs * gs * m; pm.lower.rotation.z += LIMP.hip * limp * smooth(bs) * m; }
    // the shuffle round eases in and, once the feet have caught up, settles out over a moment (stepW) instead of the
    // legs snapping straight from mid-step
    ANIM.stepW = (ANIM.stepW || 0) + ((ANIM.stepping && spd <= 0.3 ? 1 : 0) - (ANIM.stepW || 0)) * Math.min(1, rdt * (ANIM.stepping ? 14 : 7));
    if (ANIM.stepW > 0.002 && spd <= 0.3) {
      if (!ANIM.stepping) ANIM.stepT = (ANIM.stepT || 0) + rdt;   // the last step carries on as it fades
      const w = ANIM.stepW, q = Math.sin(ANIM.stepT * 12), lift = Math.min(1, Math.abs(ANIM.legYaw) * 1.6 + 0.3) * w, mix = (a, b) => a * (1 - w) + b;
      pm.legL.rotation.x = mix(pm.legL.rotation.x, q * 0.13 * lift); pm.legR.rotation.x = mix(pm.legR.rotation.x, -q * 0.13 * lift);
      pm.legL.rotation.z = mix(pm.legL.rotation.z, Math.max(0, q) * 0.08 * lift); pm.legR.rotation.z = mix(pm.legR.rotation.z, -Math.max(0, -q) * 0.08 * lift);
      pm.lower.position.y = Math.abs(q) * 0.016 * lift; pm.lower.rotation.z += q * 0.035 * lift;
    }
    // the knees: each bends as its leg swings through, most just after it leaves the ground, so the heel lifts clear;
    // at a sprint it kicks right up behind. A little give in the standing knee too
    const kn = (0.55 + 1.15 * sk) * ANIM.strideK * (1 - 0.3 * ads), give = 0.06 * Math.min(1, runF) + 0.08 * sk;
    pm.shinL.rotation.x = kn * Math.pow(Math.max(0, -Math.cos(ph + 0.35)), 1.3) + give;
    pm.shinR.rotation.x = kn * Math.pow(Math.max(0, Math.cos(ph + 0.35)), 1.3) * (1 - limp * LIMP.stiff) + give * (1 - limp);   // (the bad knee kept stiff)
    // hurt and standing: the weight off the bad leg, its knee bent and the hip dropped that side (LIMP.rest), buckling a
    // little more with a wince
    { const r = limp * (1 - Math.min(1, runF)) * (1 - (ANIM.stepW || 0));
      if (r > 0.001 || wince > 0.001) { pm.shinR.rotation.x += LIMP.rest * r + 0.22 * wince; pm.legR.rotation.x -= LIMP.rest * 0.35 * r + 0.08 * wince; pm.lower.rotation.z -= 0.05 * r; pm.lower.position.y -= 0.012 * r; } }
    const scr = smooth(clamp(ANIM.scrK || 0, 0, 1)), brace = skid * (1 - scr);
    if (brace > 0.001) {
      // skidding to a stop: the leading leg braced out ahead, the back knee bent under you
      // (less as you slow: stopped, there's no slide to brace against, and its way can't flip round as you come to rest)
      const c = Math.cos(angDiff(Math.atan2(P.vx, P.vz), ANIM.yaw)) * Math.min(1, spd / 1.5), mix = (a, b) => a + (b - a) * brace;
      pm.legL.rotation.x = mix(pm.legL.rotation.x, -0.7 * c); pm.legR.rotation.x = mix(pm.legR.rotation.x, 0.3 * c);
      pm.shinL.rotation.x = mix(pm.shinL.rotation.x, 0.12); pm.shinR.rotation.x = mix(pm.shinR.rotation.x, 0.65);
    }
    if (scr > 0.001) {
      // scrambling to plant your feet out of a sprint: short choppy steps, each foot thrown down ahead of you to dig in
      // (the body's going over them, leaning back), the knee snatched up as it comes through, smaller as you slow
      const q = Math.sin(ANIM.scrPh || 0), c = Math.cos(ANIM.scrPh || 0), a = 0.4 * (0.45 + 0.55 * clamp(Math.hypot(P.vx, P.vz) / 4, 0, 1)), mix = (x, y) => x + (y - x) * scr;
      pm.legL.rotation.x = mix(pm.legL.rotation.x, -0.2 - a * q); pm.legR.rotation.x = mix(pm.legR.rotation.x, -0.2 + a * q);
      pm.shinL.rotation.x = mix(pm.shinL.rotation.x, 0.28 + 0.75 * Math.max(0, c)); pm.shinR.rotation.x = mix(pm.shinR.rotation.x, 0.28 + 0.75 * Math.max(0, -c));
      pm.legL.rotation.z = mix(pm.legL.rotation.z, -0.06); pm.legR.rotation.z = mix(pm.legR.rotation.z, 0.06);
    }
    const pk = smooth(clamp(ANIM.pivK || 0, 0, 1));
    if (pk > 0.001) {
      // and coming round: a step for every so much of the turn, each foot lifted and set down further round, out to
      // the side you're turning to, the standing knee soft
      const q = Math.sin(ANIM.pivPh || 0), up = Math.max(0, q), dn = Math.max(0, -q), d = ANIM.pivDir || 1, mix = (a, b) => a + (b - a) * pk;
      const [lL, lR] = d > 0 ? [up, dn] : [dn, up];
      pm.legL.rotation.x = mix(pm.legL.rotation.x, 0.06 - 0.3 * lL); pm.legR.rotation.x = mix(pm.legR.rotation.x, 0.06 - 0.3 * lR);
      pm.shinL.rotation.x = mix(pm.shinL.rotation.x, 0.16 + 0.55 * lL); pm.shinR.rotation.x = mix(pm.shinR.rotation.x, 0.16 + 0.55 * lR);
      pm.legL.rotation.z = mix(pm.legL.rotation.z, -0.05 - 0.12 * lL * (d > 0 ? 1 : 0.4)); pm.legR.rotation.z = mix(pm.legR.rotation.z, 0.05 + 0.12 * lR * (d < 0 ? 1 : 0.4));
      pm.lower.rotation.z = mix(pm.lower.rotation.z, (lR - lL) * 0.06);
    }
  }
  // looking down at the ground by your feet (LOOK_DOWN): down a little into the knees (and straightening up out of it
  // behind a menu: the cards, a pause)
  ANIM.lookDn = (ANIM.lookDn || 0) + ((P.vault || state !== 'play' ? 0 : ANIM.lookDnT || 0) * (1 - 0.6 * Math.min(1, runF)) * (1 - smooth(clamp(ANIM.sprintK || 0, 0, 1))) - (ANIM.lookDn || 0)) * Math.min(1, rdt * LOOK_DOWN.ease);
  if (!P.vault && ANIM.lookDn > 0.001) {
    const k = smooth(clamp(ANIM.lookDn, 0, 1)), L = LOOK_DOWN;
    pm.shinL.rotation.x += L.knee * k; pm.shinR.rotation.x += L.knee * k * 0.9; pm.legL.rotation.x -= L.thigh * k; pm.legR.rotation.x -= L.thigh * k * 0.85; pm.g.position.y -= L.drop * k;
  }
  // sprinting you lean into it from the ankles; skidding to a stop, back against the slide and down onto the back leg
  if (!P.vault) {
    const rel = angDiff(Math.atan2(P.vx, P.vz), ANIM.yaw), sl = skid * Math.min(1, spd / 1.5);   // (leaning on the slide, less as it dies)
    pm.g.rotation.x += 0.13 * sk * Math.min(1, runF) - Math.cos(rel) * 0.24 * sl; pm.g.rotation.z += Math.sin(rel) * 0.2 * sl + (ANIM.runBank || 0);   // (and banked into a sprint's bends)
    pm.g.position.y -= 0.07 * skid;
    // scrambling to a stop you drop and bounce on each choppy step; turning round you stay low, bobbing a touch with
    // each step, and come up again as you set off
    const scr = smooth(clamp(ANIM.scrK || 0, 0, 1)), pk = smooth(clamp(ANIM.pivK || 0, 0, 1));
    if (scr > 0.001) { pm.g.position.y -= scr * (0.045 + 0.02 * Math.abs(Math.cos(ANIM.scrPh || 0))); pm.g.rotation.z += Math.sin(ANIM.scrPh || 0) * 0.035 * scr; }
    if (pk > 0.001) { pm.g.position.y -= pk * (0.04 + 0.02 * (1 - Math.abs(Math.sin(ANIM.pivPh || 0)))); pm.g.rotation.x += 0.05 * pk; }
    pm.g.rotation.z -= 0.13 * (ANIM.pivBank || 0);   // banked into the turn (eased: player/sprint.js)
    // backpedalling you lean back a touch, the weight on your heels (BACKPEDAL), less down the sights
    pm.g.rotation.x -= BACKPEDAL.body * ANIM.backK * (1 - 0.3 * (ANIM.ads || 0));
  }
  // tripped by a crawler: you lurch to one side, a knee gives, and you catch yourself
  const stq = ANIM.stumble > 0 && !P.vault ? Math.sin(ANIM.stumble * Math.PI) : 0;
  if (stq) { pm.g.rotation.z += (ANIM.stumbleSide || 1) * stq * 0.2; pm.g.rotation.x += stq * 0.12; pm.g.position.y -= stq * 0.07; pm.legL.rotation.x += stq * 0.45; pm.legR.rotation.x -= stq * 0.3; }
  // bob twice per stride, dip onto the bad leg when limping, breathe when still. Down the sights you roll heel to toe
  // and glide: half the bob, and the chest held steady over the hips (below) so the gun stays on target
  const run1 = Math.min(1, runF), still = 1 - run1;
  // (the bob's size follows your speed, but slowly through a hard turn or a skid and for a moment after, so it dies
  // away as you plant and builds back as you set off instead of cutting out and snapping back in)
  ANIM.bobSlow = P.pivot || P.skid > 0 ? 1 : Math.max(0, (ANIM.bobSlow || 0) - rdt * 1.6);
  ANIM.bobRun = (ANIM.bobRun ?? run1) + (run1 - (ANIM.bobRun ?? run1)) * Math.min(1, rdt * (12 - 9 * ANIM.bobSlow));
  const bob = Math.abs(Math.cos(ph)) * (0.045 * ANIM.bobRun * (1 - 0.5 * ads) + 0.03 * sk) + (limp ? limp * run1 * (LIMP.rise * smooth(bs) - LIMP.sink * smooth(gs)) : 0);   // (limping: up over the stiff bad leg, down onto the good)
  // (the breath's phase is run on, a little further each frame the quicker you're breathing: worked out from the clock
  // times a rate that changes with your health, every change of health would throw it to a new spot each frame, a
  // wild shudder through the body that got worse the longer the game had been running)
  ANIM.brPh = ((ANIM.brPh || 0) + rdt * 1.7 * (1 + LIMP.breath[1] * limp)) % (Math.PI * 2);
  const breathe = Math.sin(ANIM.brPh) * 0.01 * (1 + LIMP.breath[0] * limp) * still;   // (quicker and deeper hurt: LIMP.breath)
  // the weight goes over the foot you stand on: the hips carry you side to side once a stride (less at a run, where
  // the feet land closer to the line), and standing still you drift slowly from foot to foot
  const shift = P.vault ? 0 : -ANIM.legDirS * Math.cos(ph) * 0.022 * run1 * (1 - 0.4 * clamp(runF - 0.7, 0, 1)) + Math.sin(now * 0.55) * 0.007 * still;
  // the chest rides the hips' bob on a spring: it lags them a little and settles just past each footfall
  if (ANIM.uy === undefined || P.vault) { ANIM.uy = bob; ANIM.vuy = 0; } else if (dt > 0) springTo(ANIM, 'uy', 'vuy', bob, 240, 17, Math.min(dt, 0.04));
  pm.lower.position.y = bob * 0.4; pm.upper.position.y = ANIM.uy + breathe;
  pm.lower.position.x = shift; pm.upper.position.x = shift * (0.75 - 0.5 * ads);
  // the hips swing with the legs and the shoulders twist back against them (held tighter down the sights)
  if (!P.vault) pm.lower.rotation.y += s * 0.07 * run1;
  // lean into movement relative to where you face, sway with the stride, rock back when hit
  const md = Math.atan2(P.vx, P.vz), rel = spd > 0.2 ? angDiff(md, ANIM.yaw) : 0;
  const lxT = Math.cos(rel) * 0.1 * run1 * (1 - 0.75 * ads), lzT = -Math.sin(rel) * 0.09 * run1 * (1 - 0.75 * ads);
  ANIM.lx += (lxT - ANIM.lx) * Math.min(1, rdt * 8); ANIM.lz += (lzT - ANIM.lz) * Math.min(1, rdt * 8);
  // and into changes of speed: pitch forward setting off, rock back pulling up, lean into a sudden cut sideways
  if (P.vault || ANIM.pvx === undefined) { ANIM.pvx = P.vx; ANIM.pvz = P.vz; ANIM.ax = ANIM.az = 0; }
  else if (dt > 0) { const k = Math.min(1, dt * 7); ANIM.ax += (clamp((P.vx - ANIM.pvx) / dt, -30, 30) - ANIM.ax) * k; ANIM.az += (clamp((P.vz - ANIM.pvz) / dt, -30, 30) - ANIM.az) * k; ANIM.pvx = P.vx; ANIM.pvz = P.vz; }
  const sy = Math.sin(ANIM.yaw), cy = Math.cos(ANIM.yaw), aF = ANIM.ax * sy + ANIM.az * cy, aS = ANIM.ax * cy - ANIM.az * sy;
  const alx = clamp(aF * 0.0042, -0.09, 0.1) * (1 - 0.6 * ads), alz = clamp(-aS * 0.003, -0.07, 0.07) * (1 - 0.6 * ads);
  const sway = s * 0.04 * run1 * (1 - 0.8 * ads) + Math.sin(now * 0.55 + 0.6) * 0.012 * still, limpLean = -LIMP.lean * limp * smooth(bs) * run1;   // (limping, the trunk leant over the bad leg as it takes the weight)
  // the chest into a turn (TURN_TWIST): leading round ahead of the hips and leaning in, less down the sights
  if (rdt > 0) { const h = Math.min(rdt, 0.04), k = 1 - 0.6 * ads; springTo(ANIM, 'tw', 'vtw', clamp(om * TURN_TWIST, -TURN_MAX, TURN_MAX) * k, 170, 16, h); springTo(ANIM, 'bank', 'vbank', clamp(-om * TURN_BANK, -0.1, 0.1) * k, 170, 16, h); }
  // sprinting, you look where the cursor is (SPRINT_LOOK): ahead of you the chest turns a little toward it and the head
  // further, never right round; out to one side or behind, you glance back toward that shoulder, the head and shoulders
  // turned as far as a running body goes (your view already goes where you look: lighting/vision.js).
  // Right behind you, you keep to the shoulder you were looking over
  if (rdt > 0) {
    if (ANIM.lookC === undefined) ANIM.lookC = ANIM.vlookC = ANIM.lookH = ANIM.vlookH = 0;
    const L = SPRINT_LOOK, h = Math.min(rdt, 0.04), fk = smooth(clamp(ANIM.faceK || 0, 0, 1)) * (1 - (ANIM.rg || 0)) * (1 - smooth(clamp(ANIM.rgK || 0, 0, 1))) * (P.vault ? 0 : 1);
    const rel = angDiff(P.aim, ANIM.yaw), ar = Math.abs(rel); let sd = Math.sign(rel) || 1;
    if (ar > L.behind && ANIM.lookSide) sd = ANIM.lookSide; ANIM.lookSide = sd;
    const back = smooth(clamp((ar - L.ahead) / L.blend, 0, 1)), chest = (Math.sign(rel) * Math.min(ar, L.chest) * (1 - back) + sd * L.backChest * back) * fk;
    const head = (clamp(rel - chest, -L.head, L.head) * (1 - back) + sd * L.backHead * back) * fk;
    springTo(ANIM, 'lookC', 'vlookC', chest, 90, 15, h); springTo(ANIM, 'lookH', 'vlookH', head, 130, 17, h); ANIM.lookBack = back * fk; ANIM.lookK = fk;
  }
  // breathing lifts the chest a touch
  // (the chest jolts forward on each of a scramble's choppy steps)
  const bpx = -BACKPEDAL.chest * ANIM.backK * (1 - 0.5 * ads);   // backpedalling, the chest back a touch further (BACKPEDAL)
  let urx = LOOK_DOWN.chest * smooth(clamp(ANIM.lookDn || 0, 0, 1)) + bpx + ANIM.lx + alx - ANIM.flinch * 0.32 + stq * 0.25 - breathe * 0.8 + 0.07 * sk + 0.12 * skid + 0.05 * Math.abs(Math.sin(ANIM.scrPh || 0)) * smooth(clamp(ANIM.scrK || 0, 0, 1)), ury = -s * 0.03 * run1 * (1 - ads * 0.7) + ANIM.tw + rgTw + (ANIM.lookC || 0), urz = ANIM.lz + alz + sway + ANIM.flinch * 0.12 * ANIM.flinchSide + ANIM.bank + ANIM.rgT * RG_TWIST.roll * (1 - ANIM.rg);
  // hurt: upright, standing leant a touch off the bad leg, and walking leant over it as it takes the weight (LIMP); a
  // wince only catches you a little
  urx += 0.04 * wince; urz += limpLean - 0.035 * limp * still;
  // the head steadies itself against the sway and nods a little as the chest settles onto each step
  pm.head.rotation.set(-ANIM.flinch * 0.2 + Math.sin(now * 1.3) * 0.02 * (1 - ads) - (ANIM.uy - bob) * 1.4 - alx * 0.4 - bpx * BACKPEDAL.head + BACKPEDAL.body * ANIM.backK * BACKPEDAL.head, 0, -sway * 0.6 - alz * 0.5);
  pm.head.rotation.x += 0.06 * wince; pm.head.rotation.z -= limpLean * 0.7;   // (hurt: the head held level over the limp, dipped a little with a wince)
  // arms, hands and the weapon (player/hold.js): it adds its own lean and twist to the upper body
  const up = { x: urx, y: ury, z: urz };
  if (INTRO.t >= 0) introPose(pm, up, introKneel(spd));   // getting up off one knee at the start of a run (game/intro.js)
  else if (state === 'title') introPose(pm, up, 1);         // and on the title you wait down on that knee
  // the hands and the weapon (their turn of the chest and the head is the hands' own, made in the mirrored upper body:
  // player/player.js) on top of what the body's doing in the world (the turn, the lean, the look), which is kept apart
  // and turned the other way for the head, which is drawn mirrored with the upper body
  const u0y = up.y, u0z = up.z, wz = pm.head.rotation.z; pm.head.rotation.z = 0;
  poseHands(D, up, ph, runF, rdt, now);
  up.y = 2 * u0y - up.y; up.z = 2 * u0z - up.z;   // (the chest isn't mirrored itself, only what's on it)
  const hY = pm.head.rotation.y, hZ = pm.head.rotation.z; let wy = 0;   // (the hands' turn of the head; the world's, wy and wz)
  wy += ANIM.tw * 0.6; let hz = wz - ANIM.bank * 0.5;   // the head leads the turn further and stays level
  wy += ANIM.lookH || 0; hz -= (ANIM.lookSide || 1) * 0.1 * (ANIM.lookBack || 0); pm.head.rotation.x -= 0.06 * (ANIM.lookBack || 0);   // looking about at a sprint (above), tipped a little toward the shoulder it looks back over
  if (P.vault) vaultUpper(P.vault, up);
  // looking about at a station (MENU_LOOK): the head turns on the shoulders to the cursor, whatever the chest is doing
  if (rdt > 0) {
    if (ANIM.menuH === undefined) ANIM.menuH = ANIM.vmenuH = 0;
    let tgt = 0;
    if (P.look != null && !P.vault) {
      const L = MENU_LOOK, rel = angDiff(P.look, ANIM.yaw);
      const sd = Math.abs(rel) > L.behind && ANIM.menuSide ? ANIM.menuSide : Math.sign(rel) || 1; ANIM.menuSide = sd;
      tgt = sd * Math.min(Math.abs(rel), L.max) - up.y;
    }
    springTo(ANIM, 'menuH', 'vmenuH', tgt, 130, 17, Math.min(rdt, 0.04));
  }
  wy += ANIM.menuH;
  // at a sprint the head stops where a neck does (SPRINT_LOOK neck, max), on the shoulders and from the way you run,
  // looking about or twisted round with Run and gun
  const nk = Math.max(ANIM.lookK || 0, smooth(clamp(ANIM.rgK || 0, 0, 1)) * (1 - (ANIM.rg || 0)));
  if (nk > 0) {
    const L = SPRINT_LOOK, hy = wy - hY, lim = clamp(clamp(hy, -L.neck, L.neck) + up.y, -L.max, L.max) - up.y;   // (all of its turn on the shoulders, the hands' too)
    wy += (clamp(lim, -L.neck, L.neck) - hy) * nk;
  }
  pm.head.rotation.y = hY - wy; pm.head.rotation.z = hZ - hz;
  pm.upper.rotation.set(up.x, up.y, up.z);
  if (P.vault) vaultHands(pm, P.vault);
  introLook(pm);
}
// your character pose, blood on you and your weapon, muzzle flash, upgrade glow, the burn barrel
export function updatePlayerVisuals(dt, rdt) {
  const pm = PM;
  animatePlayer(dt, rdt);
  // on the title there's no see-through ghost or pale rim on you; they fade in as the camera comes down into the run
  { const t = (1 - titleBlend()) * (fpOn() ? 0 : 1), k = t * smooth(clamp(roofOver(P.x, P.z), 0, 1)); if (pXray.rim.opacity !== 0.75 * k || pOutline.opacity !== 0.1 * t) { pXray.rim.opacity = 0.75 * k; pXray.sil.opacity = 0.2 * k; pOutline.opacity = 0.1 * t; pXray.rim.visible = pXray.sil.visible = pXray.fill.visible = k > 0.003; } }   // (gone, it's left out of the frame rather than drawn invisibly: three draws a piece of you)   // (the see-through outline fades with a roof going from over you: roofOver, world/cutaway.js; and none of it in first person: game/view-cam.js)
  SLOTS.forEach(s => { gunMeshes[s].visible = W8.cur === s && !P.dead && (!P.vault || vaultGun()) && !(ANIM.bandP >= 1); });   // put away while you vault (it rides on your body, player/stow.js), unless you can shoot on the way over, and while you bandage
  updatePack(dt); updateStow(rdt);
  updateSwap(dt, rdt);   // a weapon swap in progress moves the weapons and arms on from there (player/swap.js)
  updateBandStow();      // and so does putting it away for a bandage, or drawing it again after
  updateCharBlood(rdt, dt);   // the stain on you (effects/body-blood.js)
  bandRolls.forEach((m, k) => { m.visible = k < (P.band || 0); });
  updateWeaponBlood(rdt, dt);   // and on your weapons
  setFlashT(flashT - rdt); if (flashT <= 0) flash.visible = false;
  else { const k = flashT / flashLife, s1 = flashSize * (0.75 + 0.5 * (1 - k)); flashCore.scale.setScalar(0.55 * s1); flashStar.scale.setScalar(0.95 * s1); flashCore.material.opacity = Math.min(1, k * 1.6); flashStar.material.opacity = Math.min(1, k * 1.4); tongueA.scale.set(0.3 * s1 * flashWide, 1, 0.6 * flashLen * s1); tongueB.scale.copy(tongueA.scale); tongueA.material.opacity = tongueB.material.opacity = Math.min(1, k * 1.5); }
  if (gunGlow > 0) setGunGlow(Math.max(0, gunGlow - rdt * 0.8));
  const gl = gunGlow > 0 ? (0.5 + 0.5 * Math.sin(performance.now() / 70)) * gunGlow : 0;
  // a soft, pale yellow pulse on that gun's own materials only (its stain copies, effects/body-blood.js), so the rack's
  // models and the other guns you carry, which share the plain gun materials, stay as they are
  const GS = gunGlowId && WSTAIN[gunGlowId];
  if (GS) { for (const [o, m] of GS.list) if (m.emissive && GLOW_SET.has(o)) m.emissive.setRGB(gl * 0.34, gl * 0.31, gl * 0.2); if (!gl) setGunGlowId(null); }
  if (rdt > 0) updateMuzzleWisp(rdt);   // the smoke still curling off the muzzle after a heavy shot (effects/muzzle-flash.js)
  if (worldK > 0 && dt > 0) barrelFire(dt);   // (effects/puffs.js; the fire freezes with the world)
}
