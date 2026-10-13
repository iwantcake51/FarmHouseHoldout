// Per-frame weapon handling: trigger, swings, reloads, bursts, stamina, bleeding, smoke wisps.

// trigger, swings, reloads, bursts, stamina, bleeding and bandages
const groundPlane = new THREE.Plane(new V3(0, 1, 0), 0), _gp = new V3();
function updateCombat(dt) {
  W8.cd -= dt;
  if (W8.swing > 0) { W8.swing = Math.max(0, W8.swing - dt); if (!W8.hitDone && 1 - W8.swing / W8.swingDur >= 0.4) { W8.hitDone = true; meleeHit(); } }
  tickReload(dt); tickCycle(dt);
  if (W8.burstLeft > 0) { W8.burstT -= dt; if (W8.burstT <= 0 && (W8.mag[curId()] || 0) > 0) { W8.burstLeft--; W8.burstT = 0.06; W8.inBurst = true; fire(); W8.inBurst = false; W8.cd = W8.burstLeft > 0 ? 0 : 0.45 / Math.sqrt(S.rateMul); } else if ((W8.mag[curId()] || 0) <= 0) W8.burstLeft = 0; }
  const wantFire = (mouseDown || (tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4)) && !openSt && !P.dead && !(P.bandT > 0);
  tickBandage(dt);
  if (!wantFire) W8.trigLock = false;
  // stamina comes back after a short breather; once you've emptied it you're winded until it's a third back
  P.stamT = (P.stamT || 0) + dt;
  if (P.stamT > 0.55) P.stam = Math.min(1, P.stam + dt * (P.exh ? 0.26 : 0.38) * (P.moving ? 0.75 : 1));
  if (P.exh && P.stam >= 0.34) P.exh = false;
  // emptying the tank leaves you sluggish; speed creeps back as the stamina does
  if (P.exh) P.fatigued = true; else if (P.stam >= 0.75) P.fatigued = false;
  const spT = P.fatigued ? 0.68 + 0.32 * clamp(P.stam / 0.75, 0, 1) : 1;
  P.spdF = (P.spdF || 1) + (spT - (P.spdF || 1)) * Math.min(1, dt * (spT < (P.spdF || 1) ? 4 : 0.9));
  // point the gun (and your eyes) at what's under the cursor: the part of a zombie you're over, a crawler down on the
  // ground, or over open ground a point at waist height where the cursor is. It only ever tips down, never up at a roof
  ANIM.pitchT = 0; ANIM.aimY = GUN_Y;
  if (!P.dead && !W(curId()).melee) {
    let ty = null, tx = aimPt.x, tz = aimPt.z;
    const ct = cursorTarget();
    if (ct) { ty = ct.y; tx = ct.x; tz = ct.zz; }
    else {
      const ar = aimRay(P.x, P.z, P.aim, 12);
      if (ar.z && ar.z.crawl) { ty = 0.3; [tx, tz] = bodyOf(ar.z); }
      else for (const z of zombies) { if (!z.crawl) continue; const [bx, bz] = bodyOf(z); if (Math.hypot(aimPt.x - bx, aimPt.z - bz) < 1.1) { ty = 0.3; tx = bx; tz = bz; break; } }
    }
    if (ty === null && hasMouse && !tStick.R && !scoped && ray.ray.intersectPlane(groundPlane, _gp)) { ty = 0.85; tx = _gp.x; tz = _gp.z; }
    if (ty !== null) {
      ANIM.pitchT = clamp(Math.atan2(GUN_Y - ty, Math.max(0.8, Math.hypot(tx - P.x, tz - P.z))), 0, 0.7);
      ANIM.aimY = Math.min(GUN_Y, ty);
    }
  }
  if (P.kbx || P.kbz) { moveCircle(P, P.kbx * dt, P.kbz * dt, 0.3, true); const f = Math.exp(-dt * 7); P.kbx *= f; P.kbz *= f; if (Math.abs(P.kbx) + Math.abs(P.kbz) < 0.05) P.kbx = P.kbz = 0; }
  P.conc = Math.max(0, (P.conc || 0) - dt / 3.2);
  W8.heat = Math.max(0, (W8.heat || 0) - dt * 0.55); W8.wispT = (W8.wispT || 0) - dt;
  W8.sprayT = (W8.sprayT || 0) + dt; if (W8.sprayT > 0.3) W8.spray = Math.max(0, (W8.spray || 0) - dt * 1.8);
  if (W8.heat > 0.7 && W8.wispT <= 0 && !W(curId()).melee && !P.dead) { W8.wispT = 0.09; const mw = muzzleWorld(); smoke(mw.x, mw.y + 0.02, mw.z, rr(-0.1, 0.1), rr(0.25, 0.5), rr(-0.1, 0.1), 0.04, 0.22, rr(0.9, 1.4), 0.16 * Math.min(1, W8.heat - 0.5)); }
  if (P.bleed > 0 && !P.dead) {
    P.bleed = Math.max(0, P.bleed - dt); P.hp -= 1.7 * dt * S.dmgTaken; P.dripT = (P.dripT || 0) - dt;
    if (P.dripT <= 0) { P.dripT = rr(0.25, 0.6); splat(P.x + rr(-.2, .2), P.z + rr(-.2, .2), 'drop', rr(0.12, 0.24)); }
    if (P.hp <= 0) { P.hp = 0; startDeath(); }
  }
  if (wantFire && W8.cd <= 0 && W8.burstLeft <= 0 && !P.vault && !W8.trigLock) fire();
}
