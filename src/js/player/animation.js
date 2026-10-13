// Player animation: walk, turn, limp, swings, recoil, reloads, death; and the per-frame player visuals.

// ---- player animation: eased facing, hips that follow your feet, bob, sway, limp, recoil, reloads, swings ----
// slideT is per hand (R, L) so akimbo guns cycle on their own shots (their kick springs are RK in player/hold.js)
const ANIM = { pitch: 0, pitchT: 0, aimY: GUN_Y, slideT: { R: 1, L: 1 }, yaw: Math.PI, legYaw: 0, legDir: 1, lx: 0, lz: 0, flinch: 0, flinchSide: 1, recoil: 0, sw: 0, relEnv: 0 };
// swing keyframes: upper-body twist, upper lean, right arm pitch/yaw, weapon pitch in the hand
const SWING = {
  swing: [[0, 0.35, 0, -0.35, -0.35, -0.7], [0.3, 1.0, -0.1, -0.85, 0.55, -1.45], [0.46, -0.95, 0.12, -0.2, -0.85, 1.2], [0.62, -1.15, 0.1, -0.15, -1.0, 1.3], [1, 0.35, 0, -0.35, -0.35, -0.7]],
  slash: [[0, 0.3, 0, -0.3, -0.3, -0.5], [0.26, 1.1, -0.05, -1.25, 0.6, -1.1], [0.42, -1.0, 0.15, -0.1, -0.95, 1.45], [0.6, -1.2, 0.12, 0.05, -1.05, 1.5], [1, 0.3, 0, -0.3, -0.3, -0.5]],
  chop: [[0, 0.25, 0, -0.35, -0.3, -0.6], [0.36, 0.2, -0.28, -2.45, -0.1, 0.35], [0.5, 0.05, 0.32, 0.05, -0.15, 1.95], [0.68, 0.05, 0.3, 0.1, -0.15, 2.0], [1, 0.25, 0, -0.35, -0.3, -0.6]]
};
function sampleSwing(keys, p) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= p) k++;
  const a = keys[k], b = keys[k + 1], t = smooth(clamp((p - a[0]) / (b[0] - a[0]), 0, 1));
  return a.map((v, i) => v + (b[i] - v) * t);
}
function animateDeath(dt) {
  const pm = PM, t = P.deathT, sg = ANIM.deathSign;
  // knees go (0-.35), topple (.35-.85), slap down with a small rebound, then lie still and breathe out
  const kn = smooth(clamp(t / 0.35, 0, 1)), fall = clamp((t - 0.3) / 0.55, 0, 1), f2 = fall * fall;
  const land = t > 0.85 ? Math.sin(Math.min(1, (t - 0.85) / 0.35) * Math.PI) * 0.08 * (1 - Math.min(1, (t - 0.85) / 0.35)) : 0;
  const rx = sg * (0.18 * kn + 1.36 * f2 - land);
  pm.g.position.set(P.x, -0.18 * kn * (1 - fall) + 0.15 * f2, P.z); pm.g.rotation.set(rx, ANIM.yaw, ANIM.deathTwist * fall);
  pm.lower.rotation.y = 0; pm.lower.position.y = 0; pm.upper.position.y = 0;
  pm.legL.rotation.x = 0.55 * kn * (1 - fall * 0.6); pm.legR.rotation.x = 0.25 * kn * (1 - fall * 0.4);
  const flail = Math.sin(t * 9) * 0.1 * (1 - fall);
  pm.armL.position.set(-0.33, 1.08, 0); pm.armR.position.set(0.33, 1.08, 0); pm.armL.scale.set(1, 1, 1); pm.armR.scale.set(1, 1, 1);
  pm.armL.rotation.set(sg > 0 ? -1.2 * kn - 0.9 * fall + flail : -0.4 * kn - 2.2 * fall + flail, 0.5 * fall, -0.5 * fall);
  pm.armR.rotation.set(sg > 0 ? -1.0 * kn - 1.0 * fall - flail : -0.6 * kn - 2.0 * fall - flail, -0.6 * fall, 0.4 * fall);
  pm.upper.rotation.set(sg * 0.15 * kn, 0.08 * fall * Math.sign(ANIM.deathTwist || 1), 0);
  pm.head.rotation.set(-sg * 0.3 * fall, 0, 0.2 * fall * Math.sign(ANIM.deathTwist || 1));
  // a slowly spreading pool under you
  if (t > 0.9 && ANIM.deathPool < 5 && t > 0.9 + ANIM.deathPool * 0.45) { ANIM.deathPool++; splat(P.x + Math.sin(ANIM.yaw) * sg * 0.6 + rr(-.25, .25), P.z + Math.cos(ANIM.yaw) * sg * 0.6 + rr(-.25, .25), 'pool', 0.5 + ANIM.deathPool * 0.22, undefined, 1.6); }
  const d = ANIM.dropped;
  if (d && !d.landed) {
    d.vy -= 12 * dt; d.g.position.x += d.vx * dt; d.g.position.y += d.vy * dt; d.g.position.z += d.vz * dt; d.g.rotateZ(d.spin * dt);
    if (d.g.position.y < 0.06) { d.g.position.y = 0.06; d.landed = true; const yaw = rr(0, 6.28); if (d.melee) d.g.rotation.set(Math.PI / 2, yaw, 0, 'YXZ'); else d.g.rotation.set(0, yaw, Math.PI / 2 * (rand() < 0.5 ? 1 : -1), 'YXZ'); SFX.thud(); burst(d.g.position.x, 0.1, d.g.position.z, 3, 'dust'); }
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
  pm.lower.rotation.y = q.twist || 0;   // already turned to the side away from the post pm.lower.rotation.z = 0; pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.position.y = 0;
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
  PM.head.rotation.x -= Math.max(0, lean - 0.5) * 0.4;   // chin up as the body goes flat
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
  // once the hands let go they swing out loose for balance (the weapon's put away), and come back to it for the landing
  const wb = air ? vk(t, 0.35, 0.55) * (1 - vk(t, 0.86, 1)) : 0;
  if (wb > 0.001) [['L', pm.armL, -1], ['R', pm.armR, 1]].forEach(([s, arm, sd]) => {
    _vr.copy(arm.rotation); _vp.copy(arm.position); const sc0 = arm.scale.z;
    armRest(arm, s, 0.9 + Math.sin(t * 9 + sd) * 0.08, sd * 0.5);
    arm.rotation.set(_vr.x + (arm.rotation.x - _vr.x) * wb, _vr.y + (arm.rotation.y - _vr.y) * wb, _vr.z * (1 - wb)); arm.scale.z = sc0 + (arm.scale.z - sc0) * wb;
    arm.position.lerpVectors(_vp, arm.position, wb);
  });
  const w1 = air ? 1 - vk(t, win ? 0.4 : 0.42, win ? 0.58 : 0.66) : vk(c, 0.3, 1), w2 = 0;
  if (w1 <= 0.001 && w2 <= 0.001) return;
  pm.g.updateMatrixWorld(true);
  const lat = [v.L[0], v.L[1]];   // to your left
  [['L', pm.armL, 1], ['R', pm.armR, -1]].forEach(([s, arm, sd]) => {
    const spread = v.scramble ? 0.2 : 0.16, dL = sd * spread - 0.16;   // the left hand is already set 0.16 to the left
    _vw.copy(v.plant); _vw.x += lat[0] * dL; _vw.z += lat[1] * dL; _vw.y += 0.03; vaultReach(pm, arm, s, _vw, w1);
    _vw.copy(v.ground); _vw.x += lat[0] * (sd * spread - 0.14); _vw.z += lat[1] * (sd * spread - 0.14); vaultReach(pm, arm, s, _vw, w2);
  });
}
function animatePlayer(dt, rdt) {
  const pm = PM, D = W(curId()) || W('pistol'), now = performance.now() / 1000;
  if (P.dead) { animateDeath(P.deathDt || 0); return; }
  if (P.vault) ANIM.postVault = 0.45; else ANIM.postVault = Math.max(0, (ANIM.postVault || 0) - rdt);
  const turnRate = P.vault ? 20 : ANIM.postVault > 0 ? 5 + (1 - ANIM.postVault / 0.45) * 9 : 16;   // ease back round to your aim after a vault
  ANIM.yaw += angDiff(P.vault ? P.vault.face : P.aim, ANIM.yaw) * Math.min(1, rdt * turnRate);
  pm.g.position.set(P.x, 0, P.z); pm.g.rotation.set(0, ANIM.yaw, 0); pBlob.position.set(P.x, 0.02, P.z); pBlob.scale.setScalar(1.15 - Math.min(0.4, pm.g.position.y * 0.5));
  const spd = Math.hypot(P.vx, P.vz), runF = clamp(spd / 4.1, 0, 1.3);
  const hpF = P.hp / S.maxHp, limp = hpF < 0.4 ? (0.4 - hpF) / 0.4 : 0;
  ANIM.flinch = Math.max(0, ANIM.flinch - rdt * 4); ANIM.sw = Math.max(0, ANIM.sw - rdt * 4.5); ANIM.stumble = Math.max(0, (ANIM.stumble || 0) - rdt * 2.2);
  // hips turn toward the direction you walk; walking away from your aim plays the stride backwards. Down the sights
  // they stay squarer to the aim and the legs side-step the rest of the way (ANIM.r2, below)
  const ads = ANIM.ads || 0;
  let legYaw = 0, mvRel = 0;
  if (spd > 0.3 || P.vault) {
    if (spd > 0.3) { const md = Math.atan2(P.vx, P.vz); let rel = angDiff(md, ANIM.yaw); ANIM.legDir = 1; if (Math.abs(rel) > Math.PI * 0.55) { rel = angDiff(rel, Math.PI); ANIM.legDir = -1; } mvRel = rel; const lim = 1.15 - 0.7 * ads; legYaw = clamp(rel, -lim, lim); }
    ANIM.legYaw += (legYaw - ANIM.legYaw) * Math.min(1, rdt * (ANIM.postVault > 0 ? 4 : 10));   // the hips come round gently out of a vault
    ANIM.feet = ANIM.yaw + ANIM.legYaw; ANIM.stepping = false;
  } else {
    // standing still the torso turns on its own; when the twist gets too big the feet shuffle round to catch up
    if (ANIM.feet === undefined) ANIM.feet = ANIM.yaw;
    const tw = angDiff(ANIM.yaw, ANIM.feet);
    if (!ANIM.stepping && Math.abs(tw) > 0.8) { ANIM.stepping = true; ANIM.stepT = 0; }
    if (ANIM.stepping) { ANIM.feet += tw * Math.min(1, rdt * 6.5); ANIM.stepT += rdt; if (Math.abs(angDiff(ANIM.yaw, ANIM.feet)) < 0.06 && ANIM.stepT > 0.25) ANIM.stepping = false; }
    ANIM.legYaw = angDiff(ANIM.feet, ANIM.yaw);
  }
  pm.lower.rotation.y = ANIM.legYaw;
  // how far off the hips' facing you're actually going: the legs swing along that line, partly as a side step
  ANIM.r2 = (ANIM.r2 || 0) + ((spd > 0.3 && !P.vault ? clamp(angDiff(mvRel, ANIM.legYaw), -1.3, 1.3) : 0) - (ANIM.r2 || 0)) * Math.min(1, rdt * 10);
  const ph = P.phase, s = Math.sin(ph), stride = 0.65 * Math.min(1, runF) * (1 - 0.2 * ads);
  ANIM.land = Math.max(0, (ANIM.land || 0) - rdt * 2.4);   // 0.42 s to soak up a landing
  if (P.vault) {
    vaultPose(pm, P.vault);
  } else if (ANIM.land > 0) {
    // landing: from a plain stance the knees give and the body dips forward, then rises back up as the stride
    // comes back in, so you walk straight out of it (a winded landing sinks deeper)
    const p = 1 - ANIM.land, k = Math.sin(Math.PI * p) * (ANIM.landHeavy ? 1.45 : 1), back = smooth(p);
    pm.g.position.y = -k * 0.1; pm.g.rotation.x = k * 0.2;
    pm.legL.rotation.x = ANIM.legDir * s * stride * back - k * 0.5; pm.legR.rotation.x = -ANIM.legDir * s * stride * back * (1 - limp * 0.7) + k * 0.32;
    pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.rotation.z = 0; pm.lower.rotation.y = ANIM.legYaw;
  } else {
    // the stride runs along the line you're going: fore and aft as far as the hips face it, and the rest a side step,
    // each foot stepping out further than it comes back in so the legs never cross. Down the sights the stance widens
    // a little and the steps shorten
    const st = ANIM.legDir * s * stride, sc = Math.cos(ANIM.r2), sn = Math.sin(ANIM.r2), bad = 1 - limp * 0.7, splay = 0.045 * ads;
    pm.legL.rotation.x = st * sc;
    pm.legR.rotation.x = -st * sc * bad;   // the bad leg hardly swings
    const zl = -st * sn * 0.5, zr = st * sn * 0.5 * bad;
    // turning on the spot: a loose pivot with a little give in the legs and a weight shift, never a full step
    pm.legL.rotation.z = (zl > 0 ? zl * 0.35 : zl) - splay; pm.legR.rotation.z = (zr < 0 ? zr * 0.35 : zr) + splay; pm.lower.rotation.z = spd <= 0.3 ? ANIM.legYaw * 0.035 : 0;
    if (ANIM.stepping && spd <= 0.3) {
      const q = Math.sin(ANIM.stepT * 12), lift = Math.min(1, Math.abs(ANIM.legYaw) * 1.6 + 0.3);
      pm.legL.rotation.x = q * 0.13 * lift; pm.legR.rotation.x = -q * 0.13 * lift;
      pm.legL.rotation.z = Math.max(0, q) * 0.08 * lift; pm.legR.rotation.z = -Math.max(0, -q) * 0.08 * lift;
      pm.lower.position.y = Math.abs(q) * 0.016 * lift; pm.lower.rotation.z += q * 0.035 * lift;
    }
  }
  // tripped by a crawler: you lurch to one side, a knee gives, and you catch yourself
  const stq = ANIM.stumble > 0 && !P.vault ? Math.sin(ANIM.stumble * Math.PI) : 0;
  if (stq) { pm.g.rotation.z += (ANIM.stumbleSide || 1) * stq * 0.2; pm.g.rotation.x += stq * 0.12; pm.g.position.y -= stq * 0.07; pm.legL.rotation.x += stq * 0.45; pm.legR.rotation.x -= stq * 0.3; }
  // bob twice per stride, dip onto the bad leg when limping, breathe when still. Down the sights you roll heel to toe
  // and glide: half the bob, and the chest held steady over the hips (below) so the gun stays on target
  const run1 = Math.min(1, runF), still = 1 - run1;
  const bob = Math.abs(Math.cos(ph)) * 0.045 * run1 * (1 - 0.5 * ads) + (limp ? Math.max(0, s) * 0.08 * limp * Math.min(1, runF + 0.3) : 0);
  const breathe = Math.sin(now * 1.7) * 0.01 * still;
  // the weight goes over the foot you stand on: the hips carry you side to side once a stride (less at a run, where
  // the feet land closer to the line), and standing still you drift slowly from foot to foot
  const shift = P.vault ? 0 : -ANIM.legDir * Math.cos(ph) * 0.022 * run1 * (1 - 0.4 * clamp(runF - 0.7, 0, 1)) + Math.sin(now * 0.55) * 0.007 * still;
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
  // breathing lifts the chest a touch
  let urx = ANIM.lx + alx - ANIM.flinch * 0.32 + stq * 0.25 - breathe * 0.8, ury = -s * 0.03 * run1 * (1 - ads * 0.7), urz = ANIM.lz + alz + sway + ANIM.flinch * 0.12 * ANIM.flinchSide;
  // the head steadies itself against the sway and nods a little as the chest settles onto each step
  pm.head.rotation.set(-ANIM.flinch * 0.2 + Math.sin(now * 1.3) * 0.02 * (1 - ads) - (ANIM.uy - bob) * 1.4 - alx * 0.4, 0, -sway * 0.6 - alz * 0.5);
  // arms, hands and the weapon (player/hold.js): it adds its own lean and twist to the upper body
  const up = { x: urx, y: ury, z: urz };
  if (INTRO.t >= 0) introPose(pm, up, introKneel(spd));   // getting up off one knee at the start of a run (game/intro.js)
  else if (state === 'title') introPose(pm, up, 1);         // and on the title you wait down on that knee
  poseHands(D, up, ph, runF, rdt, now);
  if (P.vault) vaultUpper(P.vault, up);
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
  SLOTS.forEach(s => { gunMeshes[s].visible = W8.cur === s && !P.dead && !P.vault; });   // put away while you vault (it rides on your body, player/stow.js)
  updatePack(dt); updateStow(rdt);
  updateSwap(dt, rdt);   // a weapon swap in progress moves the weapons and arms on from there (player/swap.js)
  // blood dries off slowly
  if (dt > 0) { P.blood = Math.max(0, (P.blood || 0) - dt * 0.003); for (const k in W8.bloodW) W8.bloodW[k] = Math.max(0, W8.bloodW[k] - dt * 0.004); }
  updateCharBlood(rdt);   // the stain on you (effects/body-blood.js)
  bandRolls.forEach((m, k) => { m.visible = k < (P.band || 0); });
  updateWeaponBlood(rdt);   // and on your weapons
  flashT -= rdt; if (flashT <= 0) flash.visible = false;
  else { const k = flashT / 0.055, s1 = flashSize * (0.75 + 0.5 * (1 - k)); flashCore.scale.setScalar(0.42 * s1); flashStar.scale.setScalar(0.7 * s1); flashCore.material.opacity = Math.min(1, k * 1.6); flashStar.material.opacity = Math.min(1, k * 1.4); tongueA.scale.set(0.16 * s1, 1, 0.55 * flashLen * s1); tongueB.scale.copy(tongueA.scale); tongueA.material.opacity = tongueB.material.opacity = Math.min(1, k * 1.5); }
  if (gunGlow > 0) gunGlow = Math.max(0, gunGlow - rdt * 0.8);
  const gl = gunGlow > 0 ? (0.5 + 0.5 * Math.sin(performance.now() / 70)) * gunGlow : 0;
  glowMats.forEach(m => m.emissive.setRGB(gl * 0.34, gl * 0.31, gl * 0.2));   // a soft, pale yellow pulse
  if (worldK > 0) flames.forEach((f, k) => { f.scale.set(1 + Math.sin(worldT * 1000 / (60 + k * 20)) * 0.15, 0.8 + rand() * 0.4, 1); });   // the flames freeze with the world
}
