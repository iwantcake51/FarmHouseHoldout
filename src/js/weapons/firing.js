// Spread, muzzle and aim rays, exact part hits under the crosshair, and firing guns.

function spreadOf(id) {
  // walking doubles the spread (+50% while aiming down the sights), and holding the trigger opens it up further
  const mv = clamp(Math.hypot(P.vx || 0, P.vz || 0) / 3, 0, 1);
  const D = W(id); let s = D.spread * S.spreadMul * (1 + (P.conc || 0) * 1.6) * (aiming ? 0.5 : 1) * (1 + mv * (aiming ? 0.5 : 1)) * (1 + (W8.spray || 0) * 1.3);
  if (D.ammo === 'shells' && T('choke')) s *= T('choke') === 2 ? 0.49 : 0.7;
  if (S.att.stock && D.slot === 'side') s *= 0.75;
  if (D.bipod && P.still > 0.3) s *= 0.12;
  return s;
}
// muzzle position in the world, and the angle from it to the cursor so shots and the laser meet under the crosshair
function muzzle(sideSign) {
  const D = W(curId()), sx = D && D.akimbo ? AKX * (sideSign || W8.akSide) : X, m = MUZ[W8.cur] || 0.9;
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = Math.cos(P.aim), rz = -Math.sin(P.aim);
  let ox = P.x + fx * m + rx * sx, oz = P.z + fz * m + rz * sx;
  if (bulletBlocked(ox, oz) || !los(P.x, P.z, ox, oz)) { ox = P.x + fx * 0.3; oz = P.z + fz * 0.3; }
  let a = P.aim;
  const tx = aimPt.x - ox, tz = aimPt.z - oz;
  if (hasMouse && !tStick.R && Math.hypot(tx, tz) > 0.5 && Math.abs(angDiff(Math.atan2(tx, tz), P.aim)) < 0.7) a = Math.atan2(tx, tz);
  return { ox, oz, a };
}
const partRay = new THREE.Raycaster(), _pn = new THREE.Vector2();
function cursorTarget() {
  if (!hasMouse || tStick.R || scoped) return null;
  _pn.set(mouseX / innerWidth * 2 - 1, -(mouseY / innerHeight) * 2 + 1); partRay.setFromCamera(_pn, cam);
  const objs = [];
  for (const z of zombies) { if (z.dead || z.vis < 0.15) continue; for (const p of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) if (p === 'torso' || z.limbs[p]) objs.push(z.m[p]); }
  const hit = partRay.intersectObjects(objs, true)[0]; if (!hit) return null;
  let o = hit.object; while (o && !o.userData.part) o = o.parent; if (!o) return null;
  let root = o; while (root.parent && root.parent !== scene) root = root.parent;
  const z = zombies.find(q => q.m.g === root); if (!z) return null;
  return { z, part: o.userData.part, x: hit.point.x, y: hit.point.y, zz: hit.point.z };
}
// crawlers lie stretched out along the ground, so test their whole body, not just their hips
function zRay(z, ox, oz, dx, dz) {
  const r = z.T.r + (z.crawl ? 0.26 : 0.08); let best = null;
  const n = z.crawl ? 2 : 1;
  for (let q = 0; q < n; q++) {
    const f = z.crawl ? (q ? 0.85 : 0.3) * z.T.scale : 0, px = z.x + Math.sin(z.face) * f, pz = z.z + Math.cos(z.face) * f;
    const vx = px - ox, vz = pz - oz, t = vx * dx + vz * dz, off = vx * dz - vz * dx;
    if (off * off < r * r && (!best || t < best.t)) best = { t, off, r };
  }
  return best;
}
const bodyOf = z => z.crawl ? [z.x + Math.sin(z.face) * 0.55 * z.T.scale, z.z + Math.cos(z.face) * 0.55 * z.T.scale] : [z.x, z.z];
function aimRay(ox, oz, a, maxL) {
  const dx = Math.sin(a), dz = Math.cos(a); let L = maxL, hitZ = null;
  for (let t = 0.1; t < maxL; t += 0.1) if (bulletBlocked(ox + dx * t, oz + dz * t)) { L = t; break; }
  for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz); if (h && h.t > 0 && h.t < L) { L = h.t; hitZ = z; } }
  return { L, z: hitZ };
}
function fire() {
  const id = curId(), D = W(id);
  if (D.melee) {
    const cost = stamCost(D), tired = P.exh || P.stam < cost * 0.5;
    P.stam = Math.max(0, P.stam - cost); P.stamT = 0; if (P.stam <= 0.001) { P.exh = true; }
    W8.tired = tired; const slow = tired ? 1.6 : 1;
    W8.cd = D.rate * 1.3 / Math.max(1, S.rateMul * 0.5 + 0.5) * slow; W8.swingDur = W8.swing = Math.min(D.rate * 1.2, D.style === 'chop' ? 0.98 : 0.64) * (tired ? 1.45 : 1); W8.hitDone = false; W8.swingSide = -W8.swingSide || 1;
    if (tired) SFX.pant();
    return;
  }
  gunFire(id, D);
}
function gunFire(id, D) {
  {
  if (W8.reloading === 'shell' && (W8.mag[id] || 0) > 0) W8.reloading = null;
  if (W8.reloading) return;
  if ((W8.mag[id] || 0) <= 0) { W8.cd = 0.25; SFX.click(); const aw = $('ammoWarn'); aw.classList.remove('kick'); void aw.offsetWidth; aw.classList.add('kick'); return; }
  const shots = D.both && W8.mag[id] >= 2 ? 2 : 1;
  W8.mag[id] -= shots; W8.cd = D.rate / S.rateMul; run.shots++;
  if (D.burst && W8.burstLeft <= 0 && !W8.inBurst) { W8.burstLeft = D.burst - 1; W8.burstT = 0.06; W8.trigLock = true; }   // one burst per trigger pull
  if (D.akimbo) W8.akSide *= -1;
  const { ox, oz, a: base } = muzzle();
  const mw = muzzleWorld().clone();
  // the first round goes exactly where the crosshair sits on a body, and hits that part
  let tgt = cursorTarget(), tgtA = 0, tgtT = 0;
  if (tgt) { tgtA = Math.atan2(tgt.x - ox, tgt.zz - oz); tgtT = Math.hypot(tgt.x - ox, tgt.zz - oz); for (let t = 0.1; t < tgtT; t += 0.1) if (bulletBlocked(ox + Math.sin(tgtA) * t, oz + Math.cos(tgtA) * t)) { tgt = null; break; } }
  let anyHit = false;
  const pellets = (D.pellets || 1) * shots, pierce = S.pierce + (D.pierce || 0), sp = scoped ? 0 : spreadOf(id);
  for (let p = 0; p < pellets; p++) {
    const aimed = p === 0 && tgt, a = aimed ? tgtA : base + (rand() - 0.5) * 2 * sp, dx = Math.sin(a), dz = Math.cos(a);
    let wallT = 26;
    for (let t = 0.1; t < 26; t += 0.1) if (bulletBlocked(ox + dx * t, oz + dz * t)) { wallT = t; break; }
    const hits = [];
    for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz); if (h && h.t >= -0.3 && h.t <= wallT) hits.push({ z, t: h.t, off: h.off, r: h.r, part: aimed && z === tgt.z ? tgt.part : null }); }
    if (aimed && !hits.some(h => h.z === tgt.z) && tgtT <= wallT) hits.push({ z: tgt.z, t: tgtT, off: 0, r: 1, part: tgt.part });
    hits.sort((a, b) => a.t - b.t);
    const n = Math.min(hits.length, 1 + pierce);
    for (let k = 0; k < n; k++) {
      const { z, off, r } = hits[k];
      const hx = -off * dz, hz = off * dx, side = hx * Math.cos(z.face) - hz * Math.sin(z.face);
      const part = hits[k].part || pickPart(z, clamp(off / r, -1, 1), side, D);
      if ((S.att.fire || D.ignite) && !z.dead) z.burn = 3;
      hurtZombie(z, D.dmg * S.dmgMul * suppMul(D) * (k ? 0.75 : 1) * falloff(id, hits[k].t), dx, dz, D.kick * falloff(id, hits[k].t), id, part);
    }
    if (n) anyHit = true;
    const endT = n ? Math.max(0.2, hits[n - 1].t) : wallT, lastZ = n ? hits[n - 1].z : null;
    const ey = aimed && lastZ === tgt.z ? tgt.y : lastZ ? (lastZ.crawl ? 0.3 : 1.0) * lastZ.T.scale : ANIM.down > 0.5 ? 0.35 : GUN_Y;
    if (p < 4 || rand() < 0.5) tracer(mw.x, mw.y, mw.z, ox + dx * endT, ey, oz + dz * endT, D.ammo === 'rifle' || D.dmg > 60);
    if (D.explode && (n || wallT < 26)) explode(ox + dx * endT, oz + dz * endT, D.explode, 45, true);
    else if (!n && wallT < 26) {   // sparks and a little dust puff where it hits the wall
      const ix = ox + dx * (wallT - 0.05), iz = oz + dz * (wallT - 0.05);
      burst(ix, ey, iz, 2, 'dust', -dx, -dz, 1.5); burst(ix, ey, iz, rand() < 0.5 ? 3 : 2, 'spark', -dx, -dz, 3.5);
      if (p < 3) smoke(ix, ey, iz, -dx * 0.6, 0.2, -dz * 0.6, 0.12, 0.55, 0.7, 0.35, 0x9a8a72);
    }
  }
  if (anyHit) run.hits++;
  const quiet = suppressed(D);
  if (quiet) SFX.supp(D.ammo === 'shells'); else SFX[GUN_SFX[id]]();
  const st = S.att.stock && D.slot === 'side' ? 0.55 : 1;
  shake = Math.max(shake, (0.07 + D.shake * 0.85) * st); bloom = Math.min(18, bloom + D.shake * 34 * st);
  const kick = (0.05 + D.shake * 0.32) * st; camKick.x -= Math.sin(P.aim) * kick; camKick.z -= Math.cos(P.aim) * kick;
  const fx = Math.sin(base), fz = Math.cos(base), big = D.ammo === 'shells' ? 1.5 : D.ammo === 'rifle' ? 1.15 : D.dmg > 60 ? 1.1 : 0.8;
  if (!quiet) {
    // flash parented to the gun so it sits on the real muzzle, wherever the animation has the gun
    const gg = gunMeshes[W8.cur]; gg.add(flash);
    flash.visible = true; flashT = 0.055; flashSize = big * (1 + T('ammo') * 0.15) * rr(0.85, 1.15); flashLen = D.ammo === 'shells' ? rr(1.1, 1.5) : rr(0.7, 1.2);
    flash.position.set(D.akimbo ? AKX * W8.akSide : X, GUN_Y + 0.03, MUZ[W8.cur] + 0.03); flash.rotation.set(0, 0, rand() * 6.28);
    flashStar.material.rotation = rand() * 6.28;
    flashes.push({ x: ox, z: oz, r: D.ammo === 'shells' ? 7 : 5.5, int: 1.5, col: [1, 0.78, 0.45], t: 0.07, max: 0.07 }); lmT = 0;
  } else { flashes.push({ x: ox, z: oz, r: 2.5, int: 0.12, col: [1, 0.8, 0.5], t: 0.05, max: 0.05 }); lmT = 0; }
  // smoke: a forward billow from the muzzle, a lazy cloud that hangs, more for shotguns, a thin wisp for suppressed guns
  const puffs = quiet ? 1 : D.ammo === 'shells' ? 4 : D.ammo === 'rifle' || D.dmg > 60 ? 3 : 2;
  for (let k = 0; k < puffs; k++) { const sp2 = rr(0.6, 2.4) * (quiet ? 0.4 : 1); smoke(mw.x + fx * 0.05, mw.y, mw.z + fz * 0.05, fx * sp2 + P.vx * 0.5 + rr(-0.3, 0.3), rr(0.05, 0.35), fz * sp2 + P.vz * 0.5 + rr(-0.3, 0.3), 0.08 * big, (quiet ? 0.35 : rr(0.55, 0.95)) * big, rr(0.8, 1.5), quiet ? 0.22 : rr(0.3, 0.45)); }
  W8.heat = Math.min(3, (W8.heat || 0) + (D.ammo === 'shells' || D.dmg > 60 ? 0.6 : D.rate < 0.12 ? 0.18 : 0.3));
  // sustained fire: every shot widens the spread a little more, up to 2.3 times, until you ease off the trigger
  W8.spray = Math.min(1, (W8.spray || 0) + clamp(0.04 + D.shake * 0.6, 0.06, 0.3)); W8.sprayT = 0;
  ANIM.slideT = 0;
  ANIM.recoil = Math.min(1.4, ANIM.recoil + (D.shake > 0.2 ? 1.2 : 0.7));
  const ej = EJECT[id];
  if (ej === 'fire') ejectCasing(D.ammo, shots, 'fire', W8.akSide);
  else if (ej === 'pump' || ej === 'bolt') startCycle(id);
  else if (ej === 'breach') W8.spent[id] = Math.min(magSize(id), (W8.spent[id] || 0) + shots);
  }
}
