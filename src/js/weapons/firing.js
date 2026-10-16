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
const stocked = id => gunAtt(id, 'stock');
// however loose everything makes it (a shotgun from the hip at a sprint, holding the trigger), a shot never strays more
// than this either side of where it's aimed (about 40°): past a right angle it would go sideways or behind you, and the
// crosshair (tan of it, ui/crosshair.js) would fold down to nothing
const SPREAD_MAX = 0.7;
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
  return Math.min(s, SPREAD_MAX);
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
// how far (m) from the point you aimed at a shotgun pellet can land and still hit that part (the head, the chest, a limb):
// a little more than the part itself, as a pellet clipping its edge counts
const PELLET_CORE = { head: 0.22, torso: 0.3, armL: 0.15, armR: 0.15, legL: 0.17, legR: 0.17 };
// each zombie a round goes through takes a quarter off what it does to the next
const PIERCE_KEEP = 0.75;
// how far off the thing you're looking at through the scope is
const scopeDist = () => scoped ? Math.hypot(scopePt.x - P.x, scopePt.z - P.z) : Math.hypot(aimPt.x - P.x, aimPt.z - P.z);
// what the barrel runs into in front of you: walls and tall props, the frame round a door or a window and any boards
// across it, and a zombie standing in front of you (a crawler's under it, a body's on the ground). The gun's pushed back
// off it (gunPush in player/hold.js), and it fires from where its muzzle has been pushed back to (muzzle, below), so a
// zombie pressed right up against you still gets shot
const BARREL = { from: 0.2, step: 0.025, clear: 0.04, zr: 0.16, jamb: 0.4 }, _bf = { wall: 0, zom: 0 };
function barrelHits(x, z) {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return false;
  const k = idx(i, j); if (blockArr[k]) return true;
  const o = cell[k] === OPEN && openAt[k]; if (!o) return false;
  return o.boards.length > 0 || Math.abs(o.axis === 'x' ? x - o.x : z - o.z) > BARREL.jamb;   // boarded up, or past the jambs
}
// how far out along the aim the barrel's free of walls (wall) and of zombies (zom), on the line lat to your right,
// looking no further than L
function barrelFree(lat, L) {
  const fx = Math.sin(P.aim), fz = Math.cos(P.aim), rx = fz, rz = -fx, x0 = P.x + rx * lat, z0 = P.z + rz * lat, st = BARREL.step;
  _bf.wall = _bf.zom = L;
  for (let t = BARREL.from; t < L; t += st) if (barrelHits(x0 + fx * t, z0 + fz * t)) {
    let a = t - st, b = t; for (let k = 0; k < 5; k++) { const m = (a + b) / 2; if (barrelHits(x0 + fx * m, z0 + fz * m)) b = m; else a = m; }   // to the face, not the step
    _bf.wall = Math.max(BARREL.from, a); break;
  }
  for (const z of zombies) {
    if (z.dead || z.crawl) continue;
    const r = BARREL.zr * z.T.scale, vx = z.x - x0, vz = z.z - z0, t = vx * fx + vz * fz, off = vx * rx + vz * rz;
    if (t <= 0 || off * off >= r * r) continue;
    const near = t - Math.sqrt(r * r - off * off); if (near < _bf.zom) _bf.zom = Math.max(BARREL.from, near);
  }
  return _bf;
}
// muzzle position in the world, and the angle from it to the cursor so shots and the laser meet under the crosshair; a
// gun pushed back off something in front of you fires from just short of it (ANIM.barrel, from gunPush; each of a
// pair from its own, ANIM.barrelS)
function muzzle(sideSign) {
  const D = W(curId()), ak = !!(D && D.akimbo), sg = sideSign || W8.akSide, sx = ak ? AKX * sg : X;
  const bar = ak && ANIM.barrelS ? ANIM.barrelS[sg < 0 ? 'L' : 'R'] : ANIM.barrel, m = Math.max(0.15, Math.min(MUZ[W8.cur] || 0.9, (bar ?? Infinity) - BARREL.clear));
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
  _pn.set(aimSX() / innerWidth * 2 - 1, -(aimSY() / innerHeight) * 2 + 1); partRay.setFromCamera(_pn, cam);   // under the crosshair, which wanders at low health
  const objs = [];
  for (const z of zombies) { if (z.dead || z.vis < 0.15) continue; for (const p of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) if (p === 'torso' || z.limbs[p]) objs.push(z.m[p]); }
  const hit = partRay.intersectObjects(objs, true)[0]; if (!hit) return null;
  let o = hit.object; while (o && !o.userData.part) o = o.parent; if (!o) return null;
  let root = o; while (root.parent && root.parent !== scene) root = root.parent;
  const z = zombies.find(q => q.m.g === root); if (!z) return null;
  return { z, part: o.userData.part, x: hit.point.x, y: hit.point.y, zz: hit.point.z };
}
// crawlers lie stretched out along the ground, so test their whole body, not just their hips: the nearest point of it
// on the ray no nearer than tMin (so a crawler that's half behind the muzzle is still hit by its half in front)
function zRay(z, ox, oz, dx, dz, tMin = -Infinity) {
  const r = z.T.r + (z.crawl ? 0.26 : 0.08); let best = null;
  const n = z.crawl ? 2 : 1;
  for (let q = 0; q < n; q++) {
    const f = z.crawl ? (q ? 0.85 : 0.3) * z.T.scale : 0, px = z.x + Math.sin(z.face) * f, pz = z.z + Math.cos(z.face) * f;
    const vx = px - ox, vz = pz - oz, t = vx * dx + vz * dz, off = vx * dz - vz * dx;
    if (t >= tMin && off * off < r * r && (!best || t < best.t)) best = { t, off, r };
  }
  return best;
}
const bodyOf = z => z.crawl ? [z.x + Math.sin(z.face) * 0.55 * z.T.scale, z.z + Math.cos(z.face) * 0.55 * z.T.scale] : [z.x, z.z];
function aimRay(ox, oz, a, maxL) {
  const dx = Math.sin(a), dz = Math.cos(a); let L = maxL, hitZ = null;
  for (let t = 0.1; t < maxL; t += 0.1) if (bulletBlocked(ox + dx * t, oz + dz * t)) { L = t; break; }
  for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz, 1e-6); if (h && h.t < L) { L = h.t; hitZ = z; } }
  return { L, z: hitZ };
}
function fire() {
  const id = curId(), D = W(id);
  if (D.melee) {
    const cost = stamCost(D), tired = P.exh || P.stam < cost * 0.5;
    P.stam = Math.max(0, P.stam - cost * SWING_AIR); P.stamT = 0; if (P.stam <= 0.001) { P.exh = true; }
    W8.tired = tired; const tk = !tired ? 0 : (D.cleave || 1) < 2 ? TIRED.single : 1, slow = 1 + (TIRED.cd - 1) * tk;
    W8.cd = D.rate * 1.3 / Math.max(1, S.rateMul * 0.5 + 0.5) * slow; W8.swingDur = W8.swing = Math.min(D.rate * 1.2, D.style === 'chop' ? 0.98 : 0.64) * (1 + (TIRED.swing - 1) * tk); W8.hitDone = false; W8.whoosh = false; W8.swingSide = -W8.swingSide || 1;
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
  if (breakTrigger(id, D)) return;   // the double barrel: stops the reload, and fires once it's closed (weapons/reload.js)
  if (W8.reloading === 'shell' && (W8.mag[id] || 0) > 0) W8.reloading = null;
  if (W8.reloading || relHeld(id)) return;   // (a reload left with its mag out, or in but not charged: weapons/reload.js)
  if (needsRack(id) && (W8.mag[id] || 0) > 0) return;   // not racked yet: it fires once the rack drives a round home (weapons/casings.js)
  if ((W8.mag[id] || 0) <= 0) { W8.cd = 0.25; if (semiAuto(id)) W8.trigLock = true; SFX.dry(); const aw = $('ammoWarn'); aw.classList.remove('kick'); void aw.offsetWidth; aw.classList.add('kick'); return; }
  shots = D.both && W8.mag[id] >= 2 ? 2 : 1;
  W8.mag[id] -= shots; W8.cd = fireRate(D) / S.rateMul; run.shots++; delete W8.relSave[id];
  if (D.burst && W8.burstLeft <= 0 && !W8.inBurst) { W8.burstLeft = D.burst - 1; W8.burstT = 0.06; }   // a burst, then another while it's held
  else if (!W8.inBurst && semiAuto(id)) W8.trigLock = true;   // one shot a pull
  }
  const { ox, oz, a: base } = muzzle();
  const mw = muzzleWorld().clone();
  // anything between you and the muzzle can be hit too (a crawler at your feet, the barrel out over it: you shoot down
  // into it), as can a body a touch behind the muzzle
  const back = -Math.max(0.3, (ox - P.x) * Math.sin(P.aim) + (oz - P.z) * Math.cos(P.aim) - 0.25);
  // the first round goes exactly where the crosshair sits on a body, and hits that part (only sometimes on the run
  // from the hip: RUN_MISS)
  let tgt = cursorTarget(), tgtA = 0, tgtT = 0;
  if (tgt && !aiming && !scoped && !(P.eye > 0) && rand() < RUN_MISS * (D.mobile || 1) * (P.mvS || 0)) tgt = null;   // (a machine pistol keeps its aim on the move: D.mobile)
  if (tgt) { tgtA = Math.atan2(tgt.x - ox, tgt.zz - oz); tgtT = Math.hypot(tgt.x - ox, tgt.zz - oz); for (let t = 0.1; t < tgtT; t += 0.1) if (bulletBlocked(ox + Math.sin(tgtA) * t, oz + Math.cos(tgtA) * t)) { tgt = null; break; } }
  let anyHit = false;
  // looking through a scope: the spread depends on the range (and a sniper's headshots crit)
  const scopeOn = scopeUse(), sp = P.eye > 0 && (D.pellets || 1) === 1 ? 0 : scopeOn ? scopeSpread(id, scopeDist()) : spreadOf(id), critC = (D.critT || 0) + (aiming && D.aimCrit ? D.aimCrit : 0), critX = Math.max(D.critM || 0, 2) + (D.critUp || 0);
  const pellets = (D.pellets || 1) * shots, pierce = D.pierce || 0;
  // tracers by how hard the round hits (effects/tracers.js); a suppressed round's is a little dimmer
  // a suppressed round's streak is a dim grey one, not a glowing one, and it leaves smoke instead (effects/tracers.js)
  const quietR = suppressed(D), trPw = tracerPower(D), trSt = D.ignite ? 'dragon' : quietR ? 'supp' : T('ammo') >= 2 ? 'hot' : 'std';
  const ends = [];   // where the tracers end, for your teammates' screens (net/avatars.js)
  for (let p = 0; p < pellets; p++) {
    // a shotgun's pattern is centred on what the crosshair sits on (the first pellet lands exactly there), not on the
    // ground under the cursor, which from this camera is off to one side of a zombie's head
    const aimed = p === 0 && tgt, a = aimed ? tgtA : (pellets > 1 && tgt ? tgtA : base) + (pellets > 1 ? pelletOff(sp) : (rand() - 0.5) * 2 * sp), dx = Math.sin(a), dz = Math.cos(a);
    let wallT = 26;
    for (let t = 0.1; t < 26; t += 0.1) if (bulletBlocked(ox + dx * t, oz + dz * t)) { wallT = t; break; }
    const endR = Math.min(wallT, D.maxRange || 26);   // how far it can do anything: a wall, or where a dragon's breath pellet burns out
    const hits = [];
    for (const z of zombies) { const h = zRay(z, ox, oz, dx, dz, back); if (h && h.t <= endR) hits.push({ z, t: h.t, off: h.off, r: h.r, part: aimed && z === tgt.z ? tgt.part : null }); }
    if (aimed && !hits.some(h => h.z === tgt.z) && tgtT <= endR) hits.push({ z: tgt.z, t: tgtT, off: 0, r: 1, part: tgt.part });
    hits.sort((a, b) => a.t - b.t);
    const n = Math.min(hits.length, 1 + pierce);
    for (let k = 0; k < n; k++) {
      const { z, off, r } = hits[k];
      const hx = -off * dz, hz = off * dx, side = hx * Math.cos(z.face) - hz * Math.sin(z.face);
      // a pellet that lands close enough to where you aimed on that zombie hits the part you aimed at; the rest of the
      // pattern scatters over the body as before (PELLET_CORE)
      let part = hits[k].part;
      if (!part && tgt && k === 0 && z === tgt.z && pellets > 1 && Math.hypot(Math.sin(a - tgtA) * hits[k].t, pelletOff(sp) * hits[k].t) < (PELLET_CORE[tgt.part] || 0.2)) part = z.limbs[tgt.part] === false ? 'torso' : tgt.part;
      part = part || pickPart(z, clamp(off / r, -1, 1), side, D);
      if (P.eye > 0) part = z.limbs.head ? 'head' : 'torso';   // a dead eye: every hit's a headshot (co-op Bullet time, zombies/damage.js)
      if (D.ignite && !z.dead) z.burn = 3;   // dragon's breath
      // a crit: every headshot a sniper lands through a scope (D.headCrit), a tuned gun's own (D.critT), or the
      // revolver's aimed Dead-eye (D.aimCrit)
      const crit = (scopeOn && D.headCrit && part === 'head') || (critC > 0 && rand() < critC); critNext = crit; headNext = headFade(id, hits[k].t);
      hurtZombie(z, D.dmg * S.dmgMul * suppMul(D) * Math.pow(D.pierceKeep ?? PIERCE_KEEP, k) * falloff(id, hits[k].t) * (crit ? critX : 1), dx, dz, D.kick * falloff(id, hits[k].t), id, part);
    }
    if (n) anyHit = true;
    const endT = n ? Math.max(0.2, hits[n - 1].t) : endR, lastZ = n ? hits[n - 1].z : null;
    const ey = aimed && lastZ === tgt.z ? tgt.y : lastZ ? (lastZ.crawl ? 0.3 : 1.0) * lastZ.T.scale : Math.min(GUN_Y, ANIM.aimY || GUN_Y);
    // (dragon's breath: its own burning pellets show the shot, so just a couple of faint tracers through them)
    if (D.dragon ? p < 2 : p < 4 || rand() < 0.5) { tracer(mw.x, mw.y, mw.z, ox + dx * endT, ey, oz + dz * endT, D.dragon ? trPw * 0.45 : trPw, trSt); if (ends.length < 5) ends.push([ox + dx * endT, ey, oz + dz * endT]); }
    if (p === 0) smokeTrail(mw.x, mw.y, mw.z, ox + dx * endT, ey, oz + dz * endT, quietR ? 1.1 + 0.4 * Math.min(1, trPw) : D.ammo === 'rifle' ? (D.rate < 0.15 ? 0.45 : 1) : D.ammo === 'magnum' || (D.ammo === 'shells' && pellets === shots) ? 0.85 : 0);   // big calibres leave smoke in the air, and every suppressed round a thicker, longer-lasting trail of it
    if (D.explode && (n || wallT < 26)) explode(ox + dx * endT, oz + dz * endT, D.explode, 45, true);
    else if (!n && wallT < 26 && wallT <= endR) {   // sparks and a little dust puff where it hits the wall
      const ix = ox + dx * (wallT - 0.05), iz = oz + dz * (wallT - 0.05);
      if (p < 4 || rand() < 0.4) impactFx(ix, ey, iz, -dx, -dz);   // a flash, sparks, a puff off the surface and some chips
      bulletHole(ox, oz, dx, dz, wallT, ey, pellets > 2 ? 0.045 : D.ammo === 'p9' ? 0.07 : 0.09);   // and a hole in it (effects/bullet-holes.js)
      if (p < 2) smoke(ix, ey, iz, -dx * 0.6, 0.2, -dz * 0.6, 0.12, 0.55, 0.7, 0.3, 0x9a8a72);
    }
  }
  if (anyHit) run.hits++;
  const quiet = suppressed(D);
  SFX.fire(id, quiet, D.ammo === 'shells');
  shotOut(id, D, mw, ends, trSt, D.dragon ? trPw * 0.45 : trPw, quiet);
  const st = stocked(id) ? STOCK.kick : 1;
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
  if (D.dragon) dragonBreath(mw.x, mw.y, mw.z, base, sp);   // dragon's breath: a jet of fire and burning pellets (effects/puffs.js)
  // smoke: a forward billow from the muzzle, a lazy cloud that hangs, more for shotguns, a thin wisp for suppressed guns
  const puffs = quiet ? 1 : D.ammo === 'shells' ? 4 : D.ammo === 'rifle' || D.dmg > 60 ? 3 : 2;
  for (let k = 0; k < puffs; k++) { const sp2 = rr(0.6, 2.4) * (quiet ? 0.4 : 1); smoke(mw.x + fx * 0.05, mw.y, mw.z + fz * 0.05, fx * sp2 + P.vx * 0.5 + rr(-0.3, 0.3), rr(0.05, 0.35), fz * sp2 + P.vz * 0.5 + rr(-0.3, 0.3), 0.08 * big, (quiet ? 0.35 : rr(0.55, 0.95)) * big, rr(0.8, 1.5), quiet ? 0.22 : rr(0.3, 0.45)); }
  W8.heat = Math.min(3, (W8.heat || 0) + (D.ammo === 'shells' || D.dmg > 60 ? 0.6 : D.rate < 0.12 ? 0.18 : 0.3));
  // sustained fire: every shot widens the spread a little more, up to 2.3 times, until you ease off the trigger
  W8.spray = Math.min(1, (W8.spray || 0) + clamp(0.04 + D.shake * 0.6, 0.06, 0.3) * (D.sprayK || 1) * (stocked(id) ? STOCK.spray : 1)); W8.sprayT = 0;   // a steadier gun opens up slower (D.sprayK)
  { const sd = fireSide(D); ANIM.slideT[sd] = 0; gunKick(sd, pw, (HOLD[id] || HOLD_DEF).kind, fireRate(D) < 0.16, racked(id)); }
  const ej = EJECT[id];
  if (ej === 'fire') { ejectCasing(D.ammo, shots, 'fire', W8.akSide); if (BELT[W8.cur]) { ejectLinks(shots, 0.535); beltKick(); } }   // a belt gun throws its links too
  // (a case the gun keeps till it's racked or reloaded stays in the HUD, fired, till then: ui/rounds.js)
  else if (ej === 'pump' || ej === 'bolt') { W8.hudSpent[id] = (W8.hudSpent[id] || 0) + 1; startCycle(id); }
  else if (ej === 'breach') { W8.spent[id] = Math.min(magSize(id), (W8.spent[id] || 0) + shots); W8.hudSpent[id] = Math.min(magSize(id), (W8.hudSpent[id] || 0) + shots); }
  if (S.luck && !anyHit && rand() < S.luck && (W8.reserve[D.ammo] || 0) > 0) luckyKeep(id, D);
  }
}
// Lucky shot: a shot that hit nothing (no bullet or pellet of it) sometimes comes out of your reserve instead, so the
// round goes back in the magazine (the pair's gun that fired, for akimbo) and one less empty sits in a breech
function luckyKeep(id, D) {
  W8.reserve[D.ammo]--; W8.mag[id]++;
  if (D.akimbo) akMags(id)[W8.akSide < 0 ? 'L' : 'R']++;
  if (EJECT[id] === 'breach') { W8.spent[id] = Math.max(0, (W8.spent[id] || 0) - 1); W8.hudSpent[id] = Math.max(0, (W8.hudSpent[id] || 0) - 1); }
  feed('ammo', 1, 'kept by Lucky shot');
}
