// Player animation: walk, turn, limp, swings, recoil, reloads, death; and the per-frame player visuals.

// ---- player animation: eased facing, hips that follow your feet, bob, sway, limp, recoil, reloads, swings ----
// slideT is per hand (R, L) so akimbo guns cycle on their own shots (their kick springs are RK in player/hold.js)
const ANIM = { pitch: 0, pitchT: 0, aimY: GUN_Y, slideT: { R: 1, L: 1 }, yaw: Math.PI, standY: 0, tw: 0, vtw: 0, bank: 0, vbank: 0, legYaw: 0, legDir: 1, lx: 0, lz: 0, flinch: 0, flinchSide: 1, sw: 0, relEnv: 0 };
// swing keyframes: upper-body twist, upper lean, right arm pitch/yaw, weapon pitch in the hand
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
const SWING = {
  swing: [[0, 0.35, 0, -0.35, -0.35, -0.7], [0.3, 1.0, -0.1, -0.85, 0.55, -1.45], [0.46, -0.95, 0.12, -0.2, -0.85, 1.2], [0.62, -1.15, 0.1, -0.15, -1.0, 1.3], [1, 0.35, 0, -0.35, -0.35, -0.7]],
  slash: [[0, 0.3, 0, -0.3, -0.3, -0.5], [0.26, 1.1, -0.05, -1.25, 0.6, -1.1], [0.42, -1.0, 0.15, -0.1, -0.95, 1.45], [0.6, -1.2, 0.12, 0.05, -1.05, 1.5], [1, 0.3, 0, -0.3, -0.3, -0.5]],
  chop: [[0, 0.25, 0, -0.35, -0.3, -0.6], [0.36, 0.2, -0.28, -2.45, -0.1, 0.35], [0.5, 0.05, 0.32, 0.05, -0.15, 1.95], [0.68, 0.05, 0.3, 0.1, -0.15, 2.0], [1, 0.25, 0, -0.35, -0.3, -0.6]],
  // the fire axe and the sledgehammer (heavySwing, melee/melee.js): hauled up over the shoulder, a beat at the top
  // gathering it a touch higher and further back, then brought down all at once, quickening right into the hit (a 1 on
  // the key: it eases in and doesn't slow before it lands), and left buried there a moment before it's dragged back up
  heavy: [[0, 0.25, 0, -0.35, -0.3, -0.6], [0.34, 0.22, -0.3, -2.4, -0.1, 0.3], [0.46, 0.2, -0.4, -2.68, -0.08, 0.02], [0.55, 0.02, 0.42, 0.14, -0.15, 2.08, 1], [0.76, 0.04, 0.36, 0.12, -0.15, 2.0], [1, 0.25, 0, -0.35, -0.3, -0.6]]
};
function sampleSwing(keys, p) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= p) k++;
  const a = keys[k], b = keys[k + 1], u = clamp((p - a[0]) / (b[0] - a[0]), 0, 1), t = b[6] ? u * u : smooth(u);
  return a.slice(0, 6).map((v, i) => v + (b[i] - v) * t);
}
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
  const d = ANIM.dropped;
  if (d && !d.landed) {
    d.vy -= 12 * dt; d.g.position.x += d.vx * dt; d.g.position.y += d.vy * dt; d.g.position.z += d.vz * dt; d.g.rotateZ(d.spin * dt);
    if (d.g.position.y < 0.06) { d.g.position.y = 0.06; d.landed = true; const yaw = rr(0, 6.28); if (d.melee) d.g.rotation.set(Math.PI / 2, yaw, 0, 'YXZ'); else d.g.rotation.set(0, yaw, Math.PI / 2 * (rand() < 0.5 ? 1 : -1), 'YXZ'); if (d.melee) SFX.thud(); else SFX.gunDrop(); burst(d.g.position.x, 0.1, d.g.position.z, 3, 'dust'); }
  }
}
// ---- vaulting: a crouch and a reach for the sill, the push-off with a hand planted on it, the legs tucked and swung
// over to one side, then reaching down for the ground. A winded scramble goes over belly-first on both hands, low and
// slow, the legs dragging. The landing itself (knees giving, the dip) is ANIM.land below.
// how far through a stage: vk(t, a, b) eases from 0 to 1 as t goes from a to b
const vk = (t, a, b) => smooth(clamp((t - a) / (b - a), 0, 1));
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
function animatePlayer(dt, rdt) {
  const pm = PM, D = W(curId()) || W('pistol'), now = performance.now() / 1000;
  if (P.dead) { animateDeath(P.deathDt || 0); return; }
  if (P.vault) ANIM.postVault = 0.45; else ANIM.postVault = Math.max(0, (ANIM.postVault || 0) - rdt);
  sprintAnim(rdt);   // (player/sprint.js)
  pm.shinL.rotation.x = pm.shinR.rotation.x = 0;   // the knees straight, unless the stride or a landing bends them below
  const turnRate = P.vault ? 20 : ANIM.postVault > 0 ? 5 + (1 - ANIM.postVault / 0.45) * 9 : P.pivot ? PIVOT.yawRate : 16;   // ease back round to your aim after a vault; a hard turn's loose, the body trailing the hips round
  // sprinting you turn to face where you're running (faceK), and back round to your aim as you come out of it
  ANIM.yaw += angDiff(P.vault ? P.vault.face : P.aim + angDiff(ANIM.runYaw ?? P.aim, P.aim) * smooth(clamp(ANIM.faceK || 0, 0, 1)), ANIM.yaw) * Math.min(1, rdt * turnRate);
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
  const hpF = P.hp / S.maxHp, limp = hpF < 0.4 ? (0.4 - hpF) / 0.4 : 0;
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
  const ph = P.phase, s = Math.sin(ph), stride = 0.65 * ANIM.strideK * (1 - 0.2 * ads) * (1 + 0.28 * sk);   // a sprint reaches further each step
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
    pm.legL.rotation.x = ANIM.legDirS * s * stride * back - k * 0.5; pm.legR.rotation.x = -ANIM.legDirS * s * stride * back * (1 - limp * 0.7) + k * 0.32;
    pm.shinL.rotation.x = k * 0.75; pm.shinR.rotation.x = k * 0.45;   // the knees give
    pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.rotation.z = 0; pm.lower.rotation.y = ANIM.legYaw;
  } else {
    // the stride runs along the line you're going: fore and aft as far as the hips face it, and the rest a side step,
    // each foot stepping out further than it comes back in so the legs never cross. Down the sights the stance widens
    // a little and the steps shorten
    const st = ANIM.legDirS * s * stride, sc = Math.cos(ANIM.r2), sn = Math.sin(ANIM.r2), bad = 1 - limp * 0.7, splay = 0.045 * ads;
    pm.legL.rotation.x = st * sc;
    pm.legR.rotation.x = -st * sc * bad;   // the bad leg hardly swings
    const zl = -st * sn * 0.5, zr = st * sn * 0.5 * bad;
    // turning on the spot: a loose pivot with a little give in the legs and a weight shift, never a full step
    pm.legL.rotation.z = (zl > 0 ? zl * 0.35 : zl) - splay; pm.legR.rotation.z = (zr < 0 ? zr * 0.35 : zr) + splay; pm.lower.rotation.z = spd <= 0.3 ? ANIM.legYaw * 0.035 : 0;
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
    const kn = (0.55 + 1.15 * sk) * ANIM.strideK * (1 - 0.3 * ads) * bad, give = 0.06 * Math.min(1, runF) + 0.08 * sk;
    pm.shinL.rotation.x = kn * Math.pow(Math.max(0, -Math.cos(ph + 0.35)), 1.3) + give;
    pm.shinR.rotation.x = kn * Math.pow(Math.max(0, Math.cos(ph + 0.35)), 1.3) * bad + give;
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
  const bob = Math.abs(Math.cos(ph)) * (0.045 * ANIM.bobRun * (1 - 0.5 * ads) + 0.03 * sk) + (limp ? Math.max(0, s) * 0.08 * limp * Math.min(1, runF + 0.3) : 0);
  const breathe = Math.sin(now * 1.7) * 0.01 * still;
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
  const sway = s * 0.04 * run1 * (1 - 0.8 * ads) + limp * Math.max(0, s) * 0.14 + Math.sin(now * 0.55 + 0.6) * 0.012 * still;
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
  let urx = bpx + ANIM.lx + alx - ANIM.flinch * 0.32 + stq * 0.25 - breathe * 0.8 + 0.07 * sk + 0.12 * skid + 0.05 * Math.abs(Math.sin(ANIM.scrPh || 0)) * smooth(clamp(ANIM.scrK || 0, 0, 1)), ury = -s * 0.03 * run1 * (1 - ads * 0.7) + ANIM.tw + rgTw + (ANIM.lookC || 0), urz = ANIM.lz + alz + sway + ANIM.flinch * 0.12 * ANIM.flinchSide + ANIM.bank + ANIM.rgT * RG_TWIST.roll * (1 - ANIM.rg);
  // the head steadies itself against the sway and nods a little as the chest settles onto each step
  pm.head.rotation.set(-ANIM.flinch * 0.2 + Math.sin(now * 1.3) * 0.02 * (1 - ads) - (ANIM.uy - bob) * 1.4 - alx * 0.4 - bpx * BACKPEDAL.head + BACKPEDAL.body * ANIM.backK * BACKPEDAL.head, 0, -sway * 0.6 - alz * 0.5);
  // arms, hands and the weapon (player/hold.js): it adds its own lean and twist to the upper body
  const up = { x: urx, y: ury, z: urz };
  if (INTRO.t >= 0) introPose(pm, up, introKneel(spd));   // getting up off one knee at the start of a run (game/intro.js)
  else if (state === 'title') introPose(pm, up, 1);         // and on the title you wait down on that knee
  poseHands(D, up, ph, runF, rdt, now);
  pm.head.rotation.y += ANIM.tw * 0.6; pm.head.rotation.z -= ANIM.bank * 0.5;   // the head leads the turn further and stays level
  pm.head.rotation.y += ANIM.lookH || 0; pm.head.rotation.z -= (ANIM.lookSide || 1) * 0.1 * (ANIM.lookBack || 0); pm.head.rotation.x -= 0.06 * (ANIM.lookBack || 0);   // looking about at a sprint (above), tipped a little toward the shoulder it looks back over
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
  pm.head.rotation.y += ANIM.menuH;
  // at a sprint the head stops where a neck does (SPRINT_LOOK neck, max), on the shoulders and from the way you run,
  // looking about or twisted round with Run and gun
  const nk = Math.max(ANIM.lookK || 0, smooth(clamp(ANIM.rgK || 0, 0, 1)) * (1 - (ANIM.rg || 0)));
  if (nk > 0) {
    const L = SPRINT_LOOK, hy = pm.head.rotation.y, lim = clamp(clamp(hy, -L.neck, L.neck) + up.y, -L.max, L.max) - up.y;
    pm.head.rotation.y = hy + (clamp(lim, -L.neck, L.neck) - hy) * nk;
  }
  pm.upper.rotation.set(up.x, up.y, up.z);
  if (P.vault) vaultHands(pm, P.vault);
  introLook(pm);
}
// your character pose, blood on you and your weapon, muzzle flash, upgrade glow, the burn barrel
function updatePlayerVisuals(dt, rdt) {
  const pm = PM;
  animatePlayer(dt, rdt);
  // on the title there's no see-through ghost or pale rim on you; they fade in as the camera comes down into the run
  { const k = 1 - titleBlend(); if (pXray.rim.opacity !== 0.75 * k) { pXray.rim.opacity = 0.75 * k; pXray.sil.opacity = 0.2 * k; pOutline.opacity = 0.1 * k; } }
  SLOTS.forEach(s => { gunMeshes[s].visible = W8.cur === s && !P.dead && (!P.vault || vaultGun()) && !(ANIM.bandP >= 1); });   // put away while you vault (it rides on your body, player/stow.js), unless you can shoot on the way over, and while you bandage
  updatePack(dt); updateStow(rdt);
  updateSwap(dt, rdt);   // a weapon swap in progress moves the weapons and arms on from there (player/swap.js)
  updateBandStow();      // and so does putting it away for a bandage, or drawing it again after
  updateCharBlood(rdt, dt);   // the stain on you (effects/body-blood.js)
  bandRolls.forEach((m, k) => { m.visible = k < (P.band || 0); });
  updateWeaponBlood(rdt, dt);   // and on your weapons
  flashT -= rdt; if (flashT <= 0) flash.visible = false;
  else { const k = flashT / 0.055, s1 = flashSize * (0.75 + 0.5 * (1 - k)); flashCore.scale.setScalar(0.42 * s1); flashStar.scale.setScalar(0.7 * s1); flashCore.material.opacity = Math.min(1, k * 1.6); flashStar.material.opacity = Math.min(1, k * 1.4); tongueA.scale.set(0.16 * s1, 1, 0.55 * flashLen * s1); tongueB.scale.copy(tongueA.scale); tongueA.material.opacity = tongueB.material.opacity = Math.min(1, k * 1.5); }
  if (gunGlow > 0) gunGlow = Math.max(0, gunGlow - rdt * 0.8);
  const gl = gunGlow > 0 ? (0.5 + 0.5 * Math.sin(performance.now() / 70)) * gunGlow : 0;
  glowMats.forEach(m => m.emissive.setRGB(gl * 0.34, gl * 0.31, gl * 0.2));   // a soft, pale yellow pulse
  if (worldK > 0) flames.forEach((f, k) => { f.scale.set(1 + Math.sin(worldT * 1000 / (60 + k * 20)) * 0.15, 0.8 + rand() * 0.4, 1); });   // the flames freeze with the world
}
