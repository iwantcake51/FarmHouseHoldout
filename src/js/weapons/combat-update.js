// Per-frame weapon handling: trigger, swings, reloads, bursts, stamina, bleeding, smoke wisps.

const VAULT_BREATH = 1;   // seconds after a vault before stamina starts coming back
const PITCH_MAX = 1.0;    // how far down (radians) the arms will point a gun

// trigger, swings, reloads, bursts, stamina, bleeding and bandages
const groundPlane = new THREE.Plane(new V3(0, 1, 0), 0), _gp = new V3();
function updateCombat(dt) {
  W8.cd -= dt;
  if (W8.swing > 0) { W8.swing = Math.max(0, W8.swing - dt); if (!W8.hitDone && 1 - W8.swing / W8.swingDur >= 0.4) { W8.hitDone = true; meleeHit(); } }
  tickReload(dt); tickCycle(dt);
  const canFire = !openSt && !P.dead && !(P.bandT > 0) && !(ANIM.bandP > 0.25);   // not till it's back in your hands after a bandage
  const stickFire = !!(tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4), wantFire = (mouseDown || stickFire) && canFire;
  // a semi-auto needs the trigger let go between shots (trigLock); a burst keeps going only while it's held, and let go
  // part way through it stops there
  if (!wantFire) { W8.trigLock = false; W8.burstLeft = 0; }
  if (W8.burstLeft > 0) { W8.burstT -= dt; if (W8.burstT <= 0 && (W8.mag[curId()] || 0) > 0) { W8.burstLeft--; W8.burstT = 0.06; W8.inBurst = true; fire(); W8.inBurst = false; W8.cd = W8.burstLeft > 0 ? 0 : 0.45 / Math.sqrt(S.rateMul); } else if ((W8.mag[curId()] || 0) <= 0) W8.burstLeft = 0; }
  tickBandage(dt);
  // stamina comes back after a short breather; once you've emptied it you're winded until it's a third back
  P.stamT = (P.stamT || 0) + dt;
  // stamina comes back after a short breather (Iron lungs makes it shorter and the recovery quicker), and not until a
  // second after you've climbed through or over something
  if (P.vault) P.stamWait = VAULT_BREATH; else if (P.stamWait > 0) P.stamWait -= dt;
  if (P.stamT > (S.lungs ? LUNGS.wait : 0.55) && !(P.stamWait > 0)) P.stam = Math.min(1, P.stam + dt * (P.exh ? 0.26 : 0.38) * (P.moving ? 0.75 : 1) * (S.lungs ? LUNGS.refill : 1));
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
    // over open ground: waist height out in the yard, closer to the ground the nearer you aim, so the arms can point
    // well down at the dirt by your feet
    if (ty === null && hasMouse && !tStick.R && !scoped && ray.ray.intersectPlane(groundPlane, _gp)) { const d = Math.hypot(_gp.x - P.x, _gp.z - P.z); ty = 0.85 - 0.55 * (1 - smooth(clamp((d - 0.8) / 2.6, 0, 1))); tx = _gp.x; tz = _gp.z; }
    if (ty !== null) {
      ANIM.pitchT = clamp(Math.atan2(GUN_Y - ty, Math.max(0.6, Math.hypot(tx - P.x, tz - P.z))), 0, PITCH_MAX);
      ANIM.aimY = Math.min(GUN_Y, ty);
    }
  }
  if (P.kbx || P.kbz) { moveCircle(P, P.kbx * dt, P.kbz * dt, 0.3, true); const f = Math.exp(-dt * 7); P.kbx *= f; P.kbz *= f; if (Math.abs(P.kbx) + Math.abs(P.kbz) < 0.05) P.kbx = P.kbz = 0; }
  P.conc = Math.max(0, (P.conc || 0) - dt / 3.2);
  W8.heat = Math.max(0, (W8.heat || 0) - dt * 0.55); W8.wispT = (W8.wispT || 0) - dt;
  W8.sprayT = (W8.sprayT || 0) + dt; if (W8.sprayT > 0.3) W8.spray = Math.max(0, (W8.spray || 0) - dt * 1.8);
  if (W8.heat > 0.7 && W8.wispT <= 0 && !W(curId()).melee && !P.dead) { W8.wispT = 0.09; const mw = muzzleWorld(); smoke(mw.x, mw.y + 0.02, mw.z, rr(-0.1, 0.1), rr(0.25, 0.5), rr(-0.1, 0.1), 0.04, 0.22, rr(0.9, 1.4), 0.16 * Math.min(1, W8.heat - 0.5)); }
  if (P.bleed > 0 && !P.dead) {
    P.bleed = Math.max(0, P.bleed - dt); P.hp -= 1.7 * dt * S.dmgTaken; P.dripT = (P.dripT || 0) - dt; P.scrDripT = (P.scrDripT || 0) - dt;
    P.blood = Math.min(1, (P.blood || 0) + dt * 0.02);   // it soaks into your clothes (effects/body-blood.js)
    if (P.dripT <= 0) { P.dripT = rr(0.12, 0.3); bleedDrip(); }                          // drops falling from the wound (effects/particles.js)
    if (P.scrDripT <= 0) { P.scrDripT = rr(0.6, 1.3); screenDrop(); }                     // and blood on the screen (ui/hud.js)
    if (P.hp <= 0) { P.hp = 0; startDeath(); }
  }
  // a gun in each hand: each button its own gun (weapons/akimbo.js)
  const D = W(curId());
  if (D && D.akimbo) { const ok = canFire && (!P.vault || vaultGun()); akTriggers(dt, curId(), D, { L: ok && mouseDown, R: ok && mouseDownR, any: ok && stickFire }); }
  else if (wantFire && W8.cd <= 0 && W8.burstLeft <= 0 && (!P.vault || vaultGun()) && !W8.trigLock) fire();
}
