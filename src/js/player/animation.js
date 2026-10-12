// Player animation: walk, turn, limp, swings, recoil, reloads, death; and the per-frame player visuals.

// ---- player animation: eased facing, hips that follow your feet, bob, sway, limp, recoil, reloads, swings ----
const ANIM = { down: 0, downT: 0, slideT: 1, yaw: Math.PI, legYaw: 0, legDir: 1, lx: 0, lz: 0, flinch: 0, flinchSide: 1, recoil: 0, sw: 0 };
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
  const flail = Math.sin(t * 9) * 0.25 * (1 - fall);
  pm.armL.position.z = 0; pm.armR.position.z = 0;
  pm.armL.rotation.set(sg > 0 ? -1.2 * kn - 0.9 * fall + flail : -0.4 * kn - 2.2 * fall + flail, 0.5 * fall, -0.5 * fall);
  pm.armR.rotation.set(sg > 0 ? -1.0 * kn - 1.0 * fall - flail : -0.6 * kn - 2.0 * fall - flail, -0.6 * fall, 0.4 * fall);
  pm.upper.rotation.set(sg * 0.15 * kn, 0.2 * fall * Math.sign(ANIM.deathTwist || 1), 0);
  pm.head.rotation.set(-sg * 0.35 * fall, 0, 0.5 * fall * Math.sign(ANIM.deathTwist || 1));
  // a slowly spreading pool under you
  if (t > 0.9 && ANIM.deathPool < 5 && t > 0.9 + ANIM.deathPool * 0.45) { ANIM.deathPool++; splat(P.x + Math.sin(ANIM.yaw) * sg * 0.6 + rr(-.25, .25), P.z + Math.cos(ANIM.yaw) * sg * 0.6 + rr(-.25, .25), 'pool', 0.5 + ANIM.deathPool * 0.22, undefined, 1.6); }
  const d = ANIM.dropped;
  if (d && !d.landed) {
    d.vy -= 12 * dt; d.g.position.x += d.vx * dt; d.g.position.y += d.vy * dt; d.g.position.z += d.vz * dt; d.g.rotateZ(d.spin * dt);
    if (d.g.position.y < 0.06) { d.g.position.y = 0.06; d.landed = true; const yaw = rr(0, 6.28); if (d.melee) d.g.rotation.set(Math.PI / 2, yaw, 0, 'YXZ'); else d.g.rotation.set(0, yaw, Math.PI / 2 * (rand() < 0.5 ? 1 : -1), 'YXZ'); SFX.thud(); burst(d.g.position.x, 0.1, d.g.position.z, 3, 'dust'); }
  }
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
  ANIM.flinch = Math.max(0, ANIM.flinch - rdt * 4); ANIM.recoil = Math.max(0, ANIM.recoil - rdt * 11); ANIM.sw = Math.max(0, ANIM.sw - rdt * 4.5);
  // hips turn toward the direction you walk; walking away from your aim plays the stride backwards
  let legYaw = 0;
  if (spd > 0.3 || P.vault) {
    if (spd > 0.3) { const md = Math.atan2(P.vx, P.vz); let rel = angDiff(md, ANIM.yaw); ANIM.legDir = 1; if (Math.abs(rel) > Math.PI * 0.55) { rel = angDiff(rel, Math.PI); ANIM.legDir = -1; } legYaw = clamp(rel, -1.15, 1.15); }
    ANIM.legYaw += (legYaw - ANIM.legYaw) * Math.min(1, rdt * 10);
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
  const ph = P.phase, s = Math.sin(ph), stride = 0.65 * Math.min(1, runF);
  if (P.vault) {
    const t = Math.min(1, P.vault.t), hop = Math.sin(t * Math.PI);
    pm.g.position.y = hop * 0.75; pm.g.rotation.x = -hop * 0.45;
    pm.legL.rotation.x = -hop * 1.3; pm.legR.rotation.x = -hop * 0.7; pm.lower.rotation.y = 0;
  } else {
    pm.legL.rotation.x = ANIM.legDir * s * stride;
    pm.legR.rotation.x = -ANIM.legDir * s * stride * (1 - limp * 0.7);   // the bad leg hardly swings
    // turning on the spot: a loose pivot with a little give in the legs and a weight shift, never a full step
    pm.legL.rotation.z = pm.legR.rotation.z = 0; pm.lower.rotation.z = spd <= 0.3 ? ANIM.legYaw * 0.035 : 0;
    if (ANIM.stepping && spd <= 0.3) {
      const q = Math.sin(ANIM.stepT * 12), lift = Math.min(1, Math.abs(ANIM.legYaw) * 1.6 + 0.3);
      pm.legL.rotation.x = q * 0.13 * lift; pm.legR.rotation.x = -q * 0.13 * lift;
      pm.legL.rotation.z = Math.max(0, q) * 0.08 * lift; pm.legR.rotation.z = -Math.max(0, -q) * 0.08 * lift;
      pm.lower.position.y = Math.abs(q) * 0.016 * lift; pm.lower.rotation.z += q * 0.035 * lift;
    }
  }
  // bob twice per stride, dip onto the bad leg when limping, breathe when still
  const bob = Math.abs(Math.cos(ph)) * 0.045 * Math.min(1, runF) + (limp ? Math.max(0, s) * 0.08 * limp * Math.min(1, runF + 0.3) : 0);
  const breathe = Math.sin(now * 1.7) * 0.01 * (1 - Math.min(1, runF));
  pm.lower.position.y = bob * 0.4; pm.upper.position.y = bob + breathe;
  // lean into movement relative to where you face, sway with the stride, rock back when hit
  const md = Math.atan2(P.vx, P.vz), rel = spd > 0.2 ? angDiff(md, ANIM.yaw) : 0;
  const lxT = Math.cos(rel) * 0.1 * Math.min(1, runF), lzT = -Math.sin(rel) * 0.09 * Math.min(1, runF);
  ANIM.lx += (lxT - ANIM.lx) * Math.min(1, rdt * 8); ANIM.lz += (lzT - ANIM.lz) * Math.min(1, rdt * 8);
  const sway = s * 0.04 * Math.min(1, runF) + limp * Math.max(0, s) * 0.14;
  let urx = ANIM.lx - ANIM.flinch * 0.32, ury = 0, urz = ANIM.lz + sway + ANIM.flinch * 0.12 * ANIM.flinchSide;
  pm.head.rotation.set(-ANIM.flinch * 0.2 + Math.sin(now * 1.3) * 0.02, 0, -sway * 0.6);
  const mh = gunMeshes.melee;
  if (D.melee) {
    // weapon held in the right fist; two-handed weapons bring the left hand in
    const keys = SWING[D.style || 'swing'], p = W8.swing > 0 ? 1 - W8.swing / W8.swingDur : 0;
    const [, uy, ux, arx, ary, hrx] = sampleSwing(keys, p);
    const walk = Math.sin(ph) * 0.06 * Math.min(1, runF) * (p ? 0 : 1);
    ury += uy; urx += ux;
    pm.armR.rotation.set(arx + walk, ary, 0);
    mh.rotation.set(hrx, 0, D.style === 'chop' ? 0 : 0.15);
    pm.armL.position.z = 0;
    if (D.two) pm.armL.rotation.set(arx * 0.95, ary + 0.95, 0);
    else pm.armL.rotation.set(0.25 - walk * 2, 0.25, 0);
  } else {
    const heavy = D.ammo === 'shells' || D.ammo === 'rifle' || (D.dmg || 0) > 60;
    const rc = ANIM.recoil * (heavy ? 0.42 : 0.28), sw = smooth(ANIM.sw);
    let lrx = 0, lry = D.akimbo ? 0.05 : 0.42, rrx = 0, rry = D.akimbo ? -0.05 : -0.22, gz = 0, gry = 0, gbx = 0, lz = 0, rz = 0;
    if (W8.reloading === 'mag') {
      const p = 1 - W8.reloadT / W8.reloadMax;
      gz = Math.sin(p * Math.PI) * 0.55; gry = Math.sin(p * Math.PI) * 0.2;
      const down = p < 0.5 ? smooth(clamp((p - 0.1) / 0.3, 0, 1)) : 1 - smooth(clamp((p - 0.55) / 0.3, 0, 1));
      lrx = 0.95 * down; lry = 0.42 - 0.35 * down;
    } else if (W8.reloading === 'shell') {
      const p = 1 - W8.reloadT / W8.reloadMax;
      gz = 0.45; lrx = 0.35 * Math.sin(p * Math.PI); lry = 0.35;
      if (EJECT[curId()] === 'breach') { gry = 0; gz = 0.15; gbx = curId() === 'dbl' ? 0.55 : 0; }   // broken open while loading
    }
    const cy = W8.cyc && W8.cyc.id === curId() ? W8.cyc : null;
    if (cy) {
      const q = clamp((cy.t - cy.delay) / cy.dur, 0, 1), k = Math.sin(q * Math.PI);
      if (cy.bolt) { rrx -= 0.3 * k; rry += 0.55 * k; rz = -0.12 * k; gz -= 0.22 * k; }   // hand up to the bolt, rifle canted
      else { lz = -0.16 * k; lrx += 0.08 * k; }                                            // forend racked back and forward
    }
    const idleSway = Math.sin(now * 1.6) * 0.015 + Math.sin(ph) * 0.03 * Math.min(1, runF);
    ANIM.down += (ANIM.downT - ANIM.down) * Math.min(1, rdt * 7);
    const dn = ANIM.down * 0.3 - (ANIM.ads || 0) * 0.07;
    pm.armR.rotation.set(rrx - rc + sw * 0.9 + idleSway + dn, rry, rz);
    pm.armL.rotation.set(lrx - rc + sw * 0.9 + idleSway + dn, lry, 0); pm.armL.position.z = lz;
    urx += ANIM.down * 0.12 + (ANIM.ads || 0) * 0.05; pm.head.rotation.x += ANIM.down * 0.25 + (ANIM.ads || 0) * 0.12;
    const gg = gunMeshes[W8.cur];
    if (gg) {
      // the gun pitches about the shoulders, like the arms do, so the hands stay on it when lowered or aimed down
      const pa = 0.9 * sw - 0.16 * ANIM.recoil + gbx + ANIM.down * 0.3, Ys = 1.08;
      gg.position.set(0, Ys * (1 - Math.cos(pa)) + Math.sin(ph * 2) * 0.012 * Math.min(1, runF), -Ys * Math.sin(pa) - 0.07 * ANIM.recoil);
      gg.rotation.set(pa, gry, gz + idleSway * 0.5);
    }
    // slides and bolts: snap back and return on each shot, lock open on an empty pistol; pump forend and rifle bolt ride the cycle
    const sl = SLIDES[W8.cur];
    if (sl && sl.length) {
      ANIM.slideT += rdt; const st = ANIM.slideT, id = curId();
      let off = st < 0.022 ? st / 0.022 : Math.max(0, 1 - (st - 0.022) / 0.07);
      if (sl[0].cyc) off = cy ? Math.sin(clamp((cy.t - cy.delay) / cy.dur, 0, 1) * Math.PI) : 0;
      else if (sl[0].lock && (W8.mag[id] || 0) <= 0 && W8.reloading !== 'mag') off = 1;
      else if (sl[0].lock && W8.reloading === 'mag') off = W8.reloadT / W8.reloadMax > 0.12 ? 1 : 0;
      sl.forEach(q => { q.m.position.z = q.z0 - q.travel * off; });
    }
    urx -= ANIM.recoil * (heavy ? 0.06 : 0.03);
  }
  if (P.bandT > 0) {
    ANIM.sw = Math.max(ANIM.sw, 0.85);
    const bt = performance.now() / 1000;
    pm.armL.rotation.set(0.75, 0.75, 0); pm.armL.position.z = 0;
    pm.armR.rotation.set(0.55 + Math.sin(bt * 9) * 0.18, -0.6 + Math.cos(bt * 9) * 0.25, 0);
    urx += 0.18; pm.head.rotation.x = 0.35;
  }
  // shove: lean in and drive both arms (and whatever is in them) straight out
  ANIM.shove = Math.max(0, (ANIM.shove || 0) - rdt * 3.6);
  if (ANIM.shove > 0 && !P.bandT) {
    const k = Math.sin((1 - ANIM.shove) * Math.PI), q = Math.min(1, k * 1.6);
    pm.armL.rotation.set(pm.armL.rotation.x * (1 - q) - 0.08 * q, pm.armL.rotation.y * (1 - q) + 0.12 * q, 0); pm.armL.position.z = 0.16 * k;
    pm.armR.rotation.set(pm.armR.rotation.x * (1 - q) - 0.08 * q, pm.armR.rotation.y * (1 - q) - 0.12 * q, 0); pm.armR.position.z = 0.16 * k;
    const gg = gunMeshes[W8.cur]; if (gg && !D.melee) gg.position.z += 0.16 * k;
    urx += 0.32 * k; ury *= 1 - q;
  } else pm.armR.position.z = 0;
  pm.upper.rotation.set(urx, ury, urz);
}
// your character pose, blood on you and your weapon, muzzle flash, upgrade glow, the burn barrel
function updatePlayerVisuals(dt, rdt) {
  const pm = PM;
  animatePlayer(dt, rdt);
  SLOTS.forEach(s => { gunMeshes[s].visible = W8.cur === s && !P.dead; });
  // blood dries off slowly
  if (dt > 0) { P.blood = Math.max(0, (P.blood || 0) - dt * 0.004); for (const k in W8.bloodW) W8.bloodW[k] = Math.max(0, W8.bloodW[k] - dt * 0.004); }
  for (const m of charBlood) m.visible = (P.blood || 0) > m.userData.th;
  { const g = gunMeshes[W8.cur]; if (g && g.userData.blood) { const lv = W8.bloodW[g.userData.bloodId] || 0; for (const m of g.userData.blood) m.visible = lv > m.userData.th; } }
  flashT -= rdt; if (flashT <= 0) flash.visible = false;
  else { const k = flashT / 0.055, s1 = flashSize * (0.75 + 0.5 * (1 - k)); flashCore.scale.setScalar(0.42 * s1); flashStar.scale.setScalar(0.7 * s1); flashCore.material.opacity = Math.min(1, k * 1.6); flashStar.material.opacity = Math.min(1, k * 1.4); tongueA.scale.set(0.16 * s1, 1, 0.55 * flashLen * s1); tongueB.scale.copy(tongueA.scale); tongueA.material.opacity = tongueB.material.opacity = Math.min(1, k * 1.5); }
  if (gunGlow > 0) gunGlow = Math.max(0, gunGlow - rdt * 0.8);
  const gl = gunGlow > 0 ? (0.5 + 0.5 * Math.sin(performance.now() / 70)) * gunGlow : 0;
  glowMats.forEach(m => m.emissive.setRGB(gl * 0.55, gl * 0.4, gl * 0.18));
  flames.forEach((f, k) => { f.scale.set(1 + Math.sin(performance.now() / (60 + k * 20)) * 0.15, 0.8 + rand() * 0.4, 1); });
}
