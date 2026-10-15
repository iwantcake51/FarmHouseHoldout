// Spread, muzzle and aim rays, exact part hits under the crosshair, and firing guns.

// how hard a shot hits back, from what it does to a zombie: 9mm about 0.1-0.2, rifle rounds and magnums 0.3-0.8,
// the hunting rifle and shotguns up to about 1.2 (a double barrel firing both)
const gunPower = (D, shots) => clamp(D.dmg * Math.pow(D.pellets || 1, 0.85) * Math.pow(shots, 0.6) / 130, 0.08, 1.25);
// which hand's gun just fired: an akimbo pair's is the side of its last shot (weapons/akimbo.js), anything else's the right
const fireSide = D => D && D.akimbo && W8.akSide < 0 ? 'L' : 'R';
// a semi-automatic fires once a pull of the trigger: the handguns in single shots (not fanning, a burst or the auto sear)
const semiAuto = id => { const m = fireModeOf(id); return !!m && m.k === 'semi'; };
// a revolver with its hammer filed down for fanning (Fan the hammer) is fanned whenever it's fired from the hip
const fanning = D => !!(D && D.fan) && !aiming;
const fireRate = D => fanning(D) ? D.fan.rate : D.rate;   // seconds between shots
// running and gunning from the hip costs you: moving opens the spread up to RUN_SPREAD more (and it takes a moment
// to settle after you stop, P.mvS), and a shot fired on the move only sometimes goes exactly where the crosshair sits
// on a body (RUN_MISS of them at a full run don't, and fly with the spread instead). Aiming down the sights is steady
const RUN_SPREAD = 1.6, RUN_MISS = 0.55;
// the shoulder stock on a sidearm steadies its kick, and only that (its aim is the sights' and laser's job): the view
// and the bloom kick back STOCK.kick as hard, and quick shots open the spread STOCK.spray as fast
const STOCK = { kick: 0.55, spray: 0.6 };
const stocked = D => !!(S.att.stock && D && D.slot === 'side');
function spreadOf(id) {
  // hip fire is a bit loose (aiming down the sights is far tighter), walking more than doubles it (+50% while aiming,
  // less with a sight: D.aimMove), holding the trigger opens it further
  const mv = P.mvS ?? clamp(Math.hypot(P.vx || 0, P.vz || 0) / 3, 0, 1);
  const D = W(id); let s = D.spread * S.spreadMul * (1 + (P.conc || 0) * 1.6) * (aiming ? 0.5 * (D.aimK || 1) : 1.3 * (D.hipK || 1)) * (1 + mv * (aiming ? 0.5 * (D.aimMove ?? 1) : RUN_SPREAD * (D.mobile || 1))) * (1 + (W8.spray || 0) * 1.3);
  // a choke squeezes the pellets together, and steadies a slug even more
  if (D.ammo === 'shells' && T('choke')) s *= (D.pellets || 1) > 1 ? (T('choke') === 2 ? 0.49 : 0.7) : (T('choke') === 2 ? 0.3 : 0.55);
  if (D.bipod && P.still > 0.3) s *= 0.12;
  if (fanning(D)) s *= D.fan.spread;
  if (P.sprint) s *= RG_SPREAD;   // firing at a sprint, with Run and gun (player/sprint.js)
  return s;
}
// a scope pays off at range: up close a shot through it spreads like any aimed shot (it never gets worse the nearer you
// aim), and from there it tightens until, about ten metres out, the shot goes exactly where it's laid. Pellets still
// spread as they would without it
const SCOPE_NEAR = 3, SCOPE_FAR = 10;
const scopeUse = () => scoped || scopeAim();
function scopeSpread(id, d) {
  const D = W(id), k = smooth(clamp((d - SCOPE_NEAR) / (SCOPE_FAR - SCOPE_NEAR), 0, 1));
  return (D.pellets || 1) > 1 ? spreadOf(id) : spreadOf(id) * (1 - k);
}
// where a pellet goes inside the spread: bunched toward the middle like a real pattern (the sum of three draws), out to
// the full spread at the edges, so close up most of a shell lands on what you aimed at
const pelletOff = sp => (rand() + rand() + rand() - 1.5) / 1.5 * sp;
// each zombie a round goes through takes a quarter off what it does to the next
const PIERCE_KEEP = 0.75;
// how far off the thing you're looking at through the scope is
const scopeDist = () => scoped ? Math.hypot(scopePt.x - P.x, scopePt.z - P.z) : Math.hypot(aimPt.x - P.x, aimPt.z - P.z);
// muzzle position in the world, and the angle from it to the cursor so shots and the laser meet under the crosshair
function muzzle(sideSign) {
  const D = W(curId()), sx = D && D.akimbo ? AKX * (sideSign || W8.akSide) : X, m = MUZ[W8.cur] || 0.9;
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = Math.cos(P.aim), rz = -Math.sin(P.aim);
  let ox = P.x + fx * m + rx * sx, oz = P.z + fz * m + rz * sx;
  if (bulletBlocked(ox, oz) || !los(P.x, P.z, ox, oz)) { ox = P.x + fx * 0.3; oz = P.z + fz * 0.3; }
  // turned onto the cursor from the muzzle, eased in only once the cursor is well out past the muzzle: with the cursor
  // near you (closer than a long gun's muzzle) the angle from the muzzle would swing wildly with every small move
  let a = P.aim;
  const tx = aimPt.x - ox, tz = aimPt.z - oz, past = Math.hypot(aimPt.x - P.x, aimPt.z - P.z) - m;
  if (hasMouse && !tStick.R && past > 0.4) { const d = angDiff(Math.atan2(tx, tz), P.aim); if (Math.abs(d) < 0.7) a = P.aim + d * smooth(clamp((past - 0.4) / 1.2, 0, 1)); }
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
    P.stam = Math.max(0, P.stam - cost * SWING_AIR); P.stamT = 0; if (P.stam <= 0.001) { P.exh = true; }
    W8.tired = tired; const slow = tired ? 1.6 : 1;
    W8.cd = D.rate * 1.3 / Math.max(1, S.rateMul * 0.5 + 0.5) * slow; W8.swingDur = W8.swing = Math.min(D.rate * 1.2, D.style === 'chop' ? 0.98 : 0.64) * (tired ? 1.45 : 1); W8.hitDone = false; W8.swingSide = -W8.swingSide || 1;
    if (tired) SFX.pant();
    return;
  }
  gunFire(id, D);
}
// side: which of an akimbo pair fires (weapons/akimbo.js), each from its own mag
function gunFire(id, D, side) {
  {
  let shots = 1;
  if (D.akimbo) { if (!akShot(id, D, side || (W8.akSide > 0 ? 'L' : 'R'))) return; run.shots++; }
  else {
  if (W8.reloading === 'shell' && (W8.mag[id] || 0) > 0) W8.reloading = null;
  if (W8.reloading) return;
  if (needsRack(id) && (W8.mag[id] || 0) > 0) return;   // not racked yet: it fires once the rack drives a round home (weapons/casings.js)
  if ((W8.mag[id] || 0) <= 0) { W8.cd = 0.25; if (semiAuto(id)) W8.trigLock = true; SFX.click(); const aw = $('ammoWarn'); aw.classList.remove('kick'); void aw.offsetWidth; aw.classList.add('kick'); return; }
  shots = D.both && W8.mag[id] >= 2 ? 2 : 1;
  W8.mag[id] -= shots; W8.cd = fireRate(D) / S.rateMul; run.shots++;
  if (D.burst && W8.burstLeft <= 0 && !W8.inBurst) { W8.burstLeft = D.burst - 1; W8.burstT = 0.06; }   // a burst, then another while it's held
  else if (!W8.inBurst && semiAuto(id)) W8.trigLock = true;   // one shot a pull
  }
  const { ox, oz, a: base } = muzzle();
  const mw = muzzleWorld().clone();
  // the first round goes exactly where the crosshair sits on a body, and hits that part (only sometimes on the run
  // from the hip: RUN_MISS)
  let tgt = cursorTarget(), tgtA = 0, tgtT = 0;
  if (tgt && !aiming && !scoped && rand() < RUN_MISS * (D.mobile || 1) * (P.mvS || 0)) tgt = null;   // (a machine pistol keeps its aim on the move: D.mobile)
  if (tgt) { tgtA = Math.atan2(tgt.x - ox, tgt.zz - oz); tgtT = Math.hypot(tgt.x - ox, tgt.zz - oz); for (let t = 0.1; t < tgtT; t += 0.1) if (bulletBlocked(ox + Math.sin(tgtA) * t, oz + Math.cos(tgtA) * t)) { tgt = null; break; } }
  let anyHit = false;
  // looking through a scope: the spread depends on the range (and a sniper's headshots crit)
  const scopeOn = scopeUse(), sp = scopeOn ? scopeSpread(id, scopeDist()) : spreadOf(id), critC = (D.critT || 0) + (aiming && D.aimCrit ? D.aimCrit : 0), critX = Math.max(D.critM || 0, 2) + (D.critUp || 0);
  const pellets = (D.pellets || 1) * shots, pierce = skillPierce(id) + (D.pierce || 0);
  // tracers by how hard the round hits (effects/tracers.js); a suppressed round's is a little dimmer
  // a suppressed round's streak is a dim grey one, not a glowing one, and it leaves smoke instead (effects/tracers.js)
  const quietR = suppressed(D), trPw = tracerPower(D), trSt = D.ignite ? 'dragon' : quietR ? 'supp' : T('ammo') >= 2 ? 'hot' : 'std';
  for (let p = 0; p < pellets; p++) {
    const aimed = p === 0 && tgt, a = aimed ? tgtA : base + (pellets > 1 ? pelletOff(sp) : (rand() - 0.5) * 2 * sp), dx = Math.sin(a), dz = Math.cos(a);
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
      // a crit: every headshot a sniper lands through a scope (D.headCrit), a tuned gun's own (D.critT), the revolver's
      // aimed Dead-eye (D.aimCrit), or Lucky shot's 1 in 12 on any bullet hit
      const crit = (scopeOn && D.headCrit && part === 'head') || (critC > 0 && rand() < critC) || (S.luck > 0 && rand() < S.luck); critNext = crit;
      hurtZombie(z, D.dmg * S.dmgMul * suppMul(D) * Math.pow(D.pierceKeep ?? PIERCE_KEEP, k) * falloff(id, hits[k].t) * (crit ? critX : 1), dx, dz, D.kick * falloff(id, hits[k].t), id, part);
    }
    if (n) anyHit = true;
    const endT = n ? Math.max(0.2, hits[n - 1].t) : wallT, lastZ = n ? hits[n - 1].z : null;
    glassOnRay(ox, oz, dx, dz, endT);   // through a window's glass on the way (world/window-glass.js)
    const ey = aimed && lastZ === tgt.z ? tgt.y : lastZ ? (lastZ.crawl ? 0.3 : 1.0) * lastZ.T.scale : Math.min(GUN_Y, ANIM.aimY || GUN_Y);
    if (p < 4 || rand() < 0.5) tracer(mw.x, mw.y, mw.z, ox + dx * endT, ey, oz + dz * endT, trPw, trSt);
    if (p === 0) smokeTrail(mw.x, mw.y, mw.z, ox + dx * endT, ey, oz + dz * endT, quietR ? 1.1 + 0.4 * Math.min(1, trPw) : D.ammo === 'rifle' ? (D.rate < 0.15 ? 0.45 : 1) : D.ammo === 'magnum' ? 0.85 : 0);   // big calibres leave smoke in the air, and every suppressed round a thicker, longer-lasting trail of it
    if (D.explode && (n || wallT < 26)) explode(ox + dx * endT, oz + dz * endT, D.explode, 45, true);
    else if (!n && wallT < 26) {   // sparks and a little dust puff where it hits the wall
      const ix = ox + dx * (wallT - 0.05), iz = oz + dz * (wallT - 0.05);
      if (p < 4 || rand() < 0.4) impactFx(ix, ey, iz, -dx, -dz);   // a flash, sparks, a puff off the surface and some chips
      bulletHole(ox, oz, dx, dz, wallT, ey, pellets > 2 ? 0.045 : D.ammo === 'p9' ? 0.07 : 0.09);   // and a hole in it (effects/bullet-holes.js)
      if (p < 2) smoke(ix, ey, iz, -dx * 0.6, 0.2, -dz * 0.6, 0.12, 0.55, 0.7, 0.3, 0x9a8a72);
    }
  }
  if (anyHit) run.hits++;
  const quiet = suppressed(D);
  if (quiet) SFX.supp(D.ammo === 'shells'); else SFX[GUN_SFX[id]]();
  const st = stocked(D) ? STOCK.kick : 1;
  const pw = gunPower(D, shots) * st;
  fireCam(pw, P.aim); bloom = Math.min(18, bloom + D.shake * 34 * st);
  const fx = Math.sin(base), fz = Math.cos(base), big = D.ammo === 'shells' ? 1.5 : D.ammo === 'rifle' ? 1.15 : D.dmg > 60 ? 1.1 : 0.8;
  if (!quiet) {
    // flash parented to the gun so it sits on the real muzzle, wherever the animation has the gun
    holdOf(W8.cur, fireSide(D)).add(flash);
    flash.visible = true; flashT = 0.055; flashSize = big * (1 + T('ammo') * 0.15) * rr(0.85, 1.15); flashLen = D.ammo === 'shells' ? rr(1.1, 1.5) : rr(0.7, 1.2);
    flash.position.set(X, GUN_Y + 0.03, MUZ[W8.cur] + 0.03); flash.rotation.set(0, 0, rand() * 6.28);
    flashStar.material.rotation = rand() * 6.28;
    flashes.push({ x: ox, z: oz, r: D.ammo === 'shells' ? 7 : 5.5, int: 1.5, col: [1, 0.78, 0.45], t: 0.07, max: 0.07 }); lmT = 0;
  } else { flashes.push({ x: ox, z: oz, r: 2.5, int: 0.12, col: [1, 0.8, 0.5], t: 0.05, max: 0.05 }); lmT = 0; }
  if (D.ignite) dragonBreath(mw.x, mw.y, mw.z, base, sp);   // dragon's breath: a jet of fire and burning pellets (effects/puffs.js)
  // smoke: a forward billow from the muzzle, a lazy cloud that hangs, more for shotguns, a thin wisp for suppressed guns
  const puffs = quiet ? 1 : D.ammo === 'shells' ? 4 : D.ammo === 'rifle' || D.dmg > 60 ? 3 : 2;
  for (let k = 0; k < puffs; k++) { const sp2 = rr(0.6, 2.4) * (quiet ? 0.4 : 1); smoke(mw.x + fx * 0.05, mw.y, mw.z + fz * 0.05, fx * sp2 + P.vx * 0.5 + rr(-0.3, 0.3), rr(0.05, 0.35), fz * sp2 + P.vz * 0.5 + rr(-0.3, 0.3), 0.08 * big, (quiet ? 0.35 : rr(0.55, 0.95)) * big, rr(0.8, 1.5), quiet ? 0.22 : rr(0.3, 0.45)); }
  W8.heat = Math.min(3, (W8.heat || 0) + (D.ammo === 'shells' || D.dmg > 60 ? 0.6 : D.rate < 0.12 ? 0.18 : 0.3));
  // sustained fire: every shot widens the spread a little more, up to 2.3 times, until you ease off the trigger
  W8.spray = Math.min(1, (W8.spray || 0) + clamp(0.04 + D.shake * 0.6, 0.06, 0.3) * (D.sprayK || 1) * (stocked(D) ? STOCK.spray : 1)); W8.sprayT = 0;   // a steadier gun opens up slower (D.sprayK)
  { const sd = fireSide(D); ANIM.slideT[sd] = 0; gunKick(sd, pw, (HOLD[id] || HOLD_DEF).kind, fireRate(D) < 0.16); }
  ANIM.recoil = Math.min(1.4, ANIM.recoil + (0.3 + pw * 0.9) * (D.akimbo ? 0.6 : 1));
  const ej = EJECT[id];
  if (ej === 'fire') { ejectCasing(D.ammo, shots, 'fire', W8.akSide); if (BELT[W8.cur]) { ejectLinks(shots, 0.535); beltKick(); } }   // a belt gun throws its links too
  else if (ej === 'pump' || ej === 'bolt') startCycle(id);
  else if (ej === 'breach') W8.spent[id] = Math.min(magSize(id), (W8.spent[id] || 0) + shots);
  }
}
