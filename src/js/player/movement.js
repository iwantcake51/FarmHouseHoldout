// Player movement, statuses and aiming each frame.

// status effects, walking, vaulting and aiming
function updatePlayer(dt) {
  P.slow = Math.max(0, P.slow - dt * 0.45); P.stun = Math.max(0, P.stun - dt); P.adr = Math.max(0, P.adr - dt);
  W8.glCd = Math.max(0, W8.glCd - dt); P.shoveCd = Math.max(0, (P.shoveCd || 0) - dt);
  if (S.regen && P.hp < S.maxHp) P.hp = Math.min(S.maxHp, P.hp + S.regen * dt);
  let mx = 0, my = 0;
  if (keys.has('w') || keys.has('arrowup')) my -= 1;
  if (keys.has('s') || keys.has('arrowdown')) my += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (P.dead) mx = my = 0;   // the death clock runs in tickDeath (ui/screens.js), on real time
  else if (tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.3) { const oct = Math.round(Math.atan2(tStick.L.y, tStick.L.x) / (Math.PI / 4)) * (Math.PI / 4); mx = Math.round(Math.cos(oct)); my = Math.round(Math.sin(oct)); }
  const D0 = W(curId());
  if (P.vault) {
    const v = P.vault; v.t += dt / v.dur; const t = Math.min(1, v.t), e = t * t * (3 - 2 * t);
    P.x = v.x0 + (v.x1 - v.x0) * e; P.z = v.z0 + (v.z1 - v.z0) * e;
    if (v.t >= 1) { P.vault = null; burst(P.x, 0.1, P.z, 4, 'dust'); }
    P.moving = false; P.vx = P.vz = 0;
  } else {
    let tvx = 0, tvz = 0;
    if ((mx || my) && P.stun <= 0) {
      const l = Math.hypot(mx, my), sx = mx / l, sy = my / l;
      const wx = RIGHT.x * sx + FWD.x * -sy, wz = RIGHT.z * sx + FWD.z * -sy;
      const hpF = P.hp / S.maxHp, hurtSlow = hpF < 0.5 ? 0.55 + 0.9 * hpF : 1;   // badly hurt, you limp
      const sp = 4.1 * S.speedMul * (1 - 0.72 * P.slow) * hurtSlow * (P.adr > 0 ? 1.3 : 1) * (D0.slow || 1) * (scoped ? 0.45 : aiming ? 0.58 : 1) * swingSlow() * (P.spdF || 1) * (P.bandT > 0 ? 0.45 : 1);
      tvx = wx * sp; tvz = wz * sp;
    }
    const acc = (tvx || tvz) ? 16 : 20, k = Math.min(1, dt * acc);
    P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
    if (Math.abs(P.vx) + Math.abs(P.vz) < 0.02) P.vx = P.vz = 0;
    const ox = P.x, oz = P.z; moveCircle(P, P.vx * dt, P.vz * dt, 0.3, true);
    if (dt > 0) { P.vx = (P.x - ox) / dt * 0.6 + P.vx * 0.4; P.vz = (P.z - oz) / dt * 0.6 + P.vz * 0.4; }
    const spd = Math.hypot(P.vx, P.vz);
    P.moving = spd > 0.35;
    P.phase += dt * (5 + spd * 1.6);
  }
  P.still = P.moving ? 0 : P.still + dt;

  if (P.dead) { /* no more aiming */ }
  else if (tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.25) {
    const sx = tStick.R.x, sy = tStick.R.y; P.aim = Math.atan2(RIGHT.x * sx - FWD.x * sy, RIGHT.z * sx - FWD.z * sy);
    aimPt.set(P.x + Math.sin(P.aim) * 6, GUN_Y, P.z + Math.cos(P.aim) * 6);
  } else if (scoped) {
    if (!hasScope()) exitScope();
    aimPt.copy(scopePt); if (Math.hypot(aimPt.x - P.x, aimPt.z - P.z) > 0.2) P.aim = Math.atan2(aimPt.x - P.x, aimPt.z - P.z);
  } else if (hasMouse) {
    ndc.set(mouseX / innerWidth * 2 - 1, -(mouseY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    // a small dead zone round the character on screen, so sweeping the cursor across him never flips you round
    _pv.set(P.x, GUN_Y, P.z).project(cam);
    const psx = (_pv.x + 1) / 2 * innerWidth, psy = (1 - _pv.y) / 2 * innerHeight;
    if (ray.ray.intersectPlane(aimPlane, aimPt) && Math.hypot(mouseX - psx, mouseY - psy) > 30 && Math.hypot(aimPt.x - P.x, aimPt.z - P.z) > 0.35) P.aim = Math.atan2(aimPt.x - P.x, aimPt.z - P.z);
  }
}
