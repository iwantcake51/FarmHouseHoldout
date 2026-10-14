// Localized damage, dismemberment, crawlers and kills.

// blunt weapons and small calibres bruise and break, they don't cut things off
function canSever(wId) {
  if (wId === 'boom' || wId === 'fire' || wId === 'bleed') return true;
  const D = W(wId); if (!D) return true;
  if (D.ammo === 'p9') return false;
  if (wId === 'bat') return hasMod('nails');
  if (D.blunt) return false;
  return true;
}
const LIMB_STAGGER = 0.5;   // seconds a zombie reels after losing a limb
function sever(z, part, dx, dz, blast) {
  if (part !== 'torso' && !z.limbs[part]) return;
  if (z.type === 'brute' && !blast && (part === 'legL' || part === 'legR')) return;   // a brute's legs are too thick to take off: it never ends up crawling
  z.limbs[part] = false;
  const mesh = z.m[part], wp = new V3(), wq = new THREE.Quaternion(), ws = new V3();
  mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq); mesh.getWorldScale(ws);
  mesh.parent.remove(mesh); mesh.children.filter(c => c.userData.isOutline).forEach(c => mesh.remove(c));
  mesh.traverse(o => { if (!o.isMesh || o.userData.isOutline) return; o.customDepthMaterial = undefined; if (z.fade) z.fade = z.fade.filter(mt => mt !== o.material); if (o.material.userData.bloodOf) { o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; o.material.colorWrite = true; } else { o.material = o.material.isMeshLambertMaterial ? relit(o.material) : o.material.clone(); o.material.opacity = 1; o.material.transparent = false; } });   // (only lit materials take the light-map patch: a glow can't)
  bloodZombie(z, 0.12); scene.add(mesh);
  mesh.position.copy(wp); mesh.quaternion.copy(wq); mesh.scale.copy(ws);
  gibs.push({ m: mesh, vx: dx * rr(2, 4.5) + rr(-1.2, 1.2), vy: rr(2.5, 4.5), vz: dz * rr(2, 4.5) + rr(-1.2, 1.2), spin: rr(6, 14), life: 9, landed: false });
  z.spurts.push({ part, t: 1.4 });
  burst(wp.x, wp.y, wp.z, 10, 'blood', dx, dz, 3); spray(wp.x, wp.z, dx, dz, rr(0.8, 1.3));
  if (part !== 'torso') { run.limbs++; z.stagger = Math.max(z.stagger || 0, LIMB_STAGGER); }   // losing an arm or a leg staggers it, slowed to a quarter pace
  if (!blast) SFX.sever();   // a blast plays one sound for the lot
  if ((part === 'legL' || part === 'legR') && !z.crawl && !z.dead) {
    // the leg goes and they buckle and fall forward onto their hands
    z.crawl = true; z.crawlT = 0; z.stagger = Math.max(z.stagger, 0.85); z.trail = 0;
    z.om = outline(z.m.g, 0, 0, 0.026, rimMat(0xe8dcc0)); z.om.opacity = z.vis * 0.5; z.lastVis = undefined;
  }
}
// the fire axe coming down on a skull splits it in two: each half (everything on the head, hair, eyes and all, cut flat
// down the middle by clamping its corners to the cut) falls away to its own side with the raw face of the cut showing,
// and the body goes down without it
const CUT_M = [lam(0x7a1410), lam(0x4e0b08), lam(0xc9b8a0)], DEAD_EYE = lam(0x2e1612);
CUT_M.concat(DEAD_EYE).forEach(m => { m.userData.mobile = true; });
function splitHead(z, dx, dz) {
  const head = z.m.head; if (!head || !z.limbs.head) return false;
  z.limbs.head = false;
  head.updateWorldMatrix(true, true);
  const inv = head.matrixWorld.clone().invert(), wp = new V3(), wq = new THREE.Quaternion(), ws = new V3(), rel = new THREE.Matrix4(), mats = new Map();
  head.matrixWorld.decompose(wp, wq, ws);
  const pieces = []; head.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.visible) pieces.push(o); });
  const across = new V3(1, 0, 0).applyQuaternion(wq);   // the cut runs front to back down the middle
  [-1, 1].forEach(sd => {
    const half = new THREE.Group(); half.position.copy(wp); half.quaternion.copy(wq); half.scale.copy(ws);
    pieces.forEach(o => {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      const a = g.attributes.position.array; let any = false;
      for (let i = 0; i < a.length; i += 3) { if (a[i] * sd > 0.0005) any = true; a[i] = sd > 0 ? Math.max(0.001, a[i]) : Math.min(-0.001, a[i]); }
      if (!any) { g.dispose(); return; }
      g.computeVertexNormals();
      const om = o.material, st = om.userData.bloodOf && z.stain;
      let mt;
      if (om.isMeshBasicMaterial) mt = DEAD_EYE;
      else if (st) { mt = stainMat(om.userData.bloodOf, head, head, z.stain.u, 0, 5); z.stain.list.push([om.userData.bloodOf, mt]); }   // the pieces are in the head's own frame now
      else mt = mats.get(om) || (mats.set(om, relit(om)), mats.get(om));
      mt.opacity = 1; mt.transparent = false; mt.userData.mobile = true;
      const m = new THREE.Mesh(g, mt); m.castShadow = true; half.add(m);
    });
    // the cut face: raw red, darker in the middle, a pale rim of skull round it
    box(half, 0.004, 0.3, 0.3, CUT_M[2], sd * 0.0015, 0, 0); box(half, 0.005, 0.27, 0.27, CUT_M[0], sd * 0.002, -0.004, 0); box(half, 0.006, 0.15, 0.17, CUT_M[1], sd * 0.0025, 0.01, 0.01);
    scene.add(half);
    gibs.push({ m: half, vx: across.x * sd * rr(1.1, 1.8) + dx * rr(0.6, 1.4), vy: rr(1.6, 2.6), vz: across.z * sd * rr(1.1, 1.8) + dz * rr(0.6, 1.4), spin: sd * rr(3, 6), life: 9, landed: false });
  });
  head.parent.remove(head); bloodZombie(z, 0.25);
  z.spurts.push({ part: 'head', t: 1.8 });
  burst(wp.x, wp.y, wp.z, 18, 'blood', dx, dz, 3.6); burst(wp.x, wp.y + 0.1, wp.z, 8, 'blood', across.x, across.z, 2.4); burst(wp.x, wp.y + 0.1, wp.z, 8, 'blood', -across.x, -across.z, 2.4);
  spray(wp.x, wp.z, dx, dz, rr(1.2, 1.7)); splat(wp.x, wp.z, 'pool', 0.9);
  SFX.sever(); SFX.hitBlade(true); shake = Math.max(shake, 0.32);
  run.heads++; run.limbs++;
  return true;
}
function pickPart(z, rel, side, D) {
  const head = Math.min(0.85, 0.14 + S.headBonus + (D.headBonus || 0));
  let p;
  if (Math.abs(rel) > 0.6) p = side > 0 ? 'armR' : 'armL';
  else { const r = rand(); p = r < head ? 'head' : r < head + 0.22 ? (side > 0 ? 'legR' : 'legL') : 'torso'; }
  if (z.crawl && (p === 'legL' || p === 'legR')) p = 'torso';
  if (!z.limbs[p]) p = 'torso';
  return p;
}
// set just before a scoped shot's hurtZombie when it lands a crit (weapons/firing.js), so the number shows it
let critNext = false;
// fire: one tick of burn damage (zombies/ai.js) with its own orange number; true if it killed
const BURN_TICK = 0.5, BURN_DMG = 7;
function burnHurt(z) {
  if (z.dead) return true;
  const dmg = BURN_DMG * (S.lastStand && P.hp < S.maxHp * 0.3 ? 1.6 : 1);
  z.hp -= dmg; z.flash = Math.max(z.flash, 0.05);
  dmgNumber(z, dmg, false, 1.2 * z.T.scale * (z.crawl ? 0.4 : 1), false, 'burn');
  if (z.hp <= 0) { killZombie(z, -Math.sin(z.face), -Math.cos(z.face), 'fire', 'torso', 0); return true; }
  return false;
}
function hurtZombie(z, dmg, dx, dz, kb, wId, part) {
  const crit = critNext; critNext = false;
  if (z.dead) return false;
  const D = W(wId) || EFF[wId] || {};
  part = part || 'torso';
  if (part !== 'torso' && !z.limbs[part]) part = 'torso';
  if (S.lastStand && P.hp < S.maxHp * 0.3) dmg *= 1.6;
  if (S.momentum && run.time - S.momT < MOM_T) dmg *= 1 + 0.05 * S.momK;   // Momentum: +5% for each quick kill, up to 5
  if (z.crawl) dmg *= 1.75;   // a crawler is already half dead
  // a melee weapon hits for what it says every time: where it lands only decides what comes off (sever, below), never
  // the damage, so there are no random weak arm hits or headshot spikes. Bullets still count where they hit
  const dealt = dmg * (D.melee ? 1 : part === 'head' ? headMulFor(D) : partMult(part));
  z.hp -= dealt; z.flash = 0.14; z.squash = 1;
  bloodZombie(z, (D.melee ? 0.1 : D.ammo === 'shells' ? 0.08 : 0.05) * (part === 'head' ? 1.4 : 1) * (1 + Math.min(1, dealt / 80)));
  for (const o of zombies) if (o !== z && Math.abs(o.x - z.x) < 1.3 && Math.abs(o.z - z.z) < 1.3 && Math.hypot(o.x - z.x, o.z - z.z) < 1.2) bloodZombie(o, 0.025);
  // brutes shrug hits off: no stagger, no knockback
  if (z.type !== 'brute') { z.stagger = part === 'head' ? 0.3 : part === 'legL' || part === 'legR' ? 0.35 : 0.18; z.vx += dx * kb / z.T.scale; z.vz += dz * kb / z.T.scale; }
  const y = PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1);
  burst(z.x, y, z.z, part === 'head' ? 9 : 6, 'blood', dx, dz, 3.2); hitMist(z.x, y, z.z, dx, dz, part === 'head');
  if (rand() < 0.7) spray(z.x, z.z, dx, dz, rr(0.6, 1.1));
  dmgNumber(z, dealt, part === 'head' && !D.melee, y, crit);
  if (part !== 'torso' && part !== 'head') {
    const mul = (D.ammo === 'shells' ? 2.6 : D.melee ? 1 + (D.sever || 0) * 2 : 1) * S.severMul;
    z.lhp[part] -= dmg * mul;
    if ((z.lhp[part] <= 0 || D.alwaysSever) && canSever(wId)) sever(z, part, dx, dz);
  }
  if (D.bleed) z.bleed = 4;
  { const dd = Math.hypot(z.x - P.x, z.z - P.z);
    if (D.melee) addBlood(0.025 + (z.limbs[part] === false ? 0.04 : 0), wId, 0.08 + (D.sever ? 0.04 : 0));
    else if (dd < 2.6) addBlood(D.ammo === 'shells' ? 0.03 : 0.015, wId, 0.035); }
  if (z.hp <= 0) { killZombie(z, dx, dz, wId, part, -z.hp); return true; }
  SFX.tick(); if (part === 'head') SFX.headHit();
  return false;
}
// a zombie caught right in a blast comes apart: head, arms, legs and torso all thrown out and tumbling, a burst of
// blood and a red mist where it stood, and the ground round it painted
function blowApart(z, dx, dz) {
  const x = z.x, zz = z.z, y = 0.9 * z.T.scale;
  for (const part of ['head', 'armL', 'armR', 'legL', 'legR', 'torso']) {
    const a = Math.atan2(dx, dz) + rr(-1.4, 1.4), n0 = gibs.length;
    sever(z, part, Math.sin(a), Math.cos(a), true);
    for (let k = n0; k < gibs.length; k++) { const g = gibs[k]; g.vx *= 1.7; g.vz *= 1.7; g.vy += rr(1.5, 3.5); g.spin *= 1.5; }
  }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28; burst(x, y, zz, 5, 'blood', Math.sin(a), Math.cos(a), rr(4, 7)); }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28, sp = rr(0.8, 2.2); fx('mist', x + Math.sin(a) * 0.2, y + rr(-0.3, 0.3), zz + Math.cos(a) * 0.2, Math.sin(a) * sp, rr(0.2, 1.2), Math.cos(a) * sp, rr(0.3, 0.5), rr(1.2, 1.9), rr(0.7, 1.1), 0.75); }
  splat(x, zz, 'pool', 1.5 * z.T.scale, undefined, 0.5);
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28; spray(x, zz, Math.sin(a), Math.cos(a), rr(1.4, 2.6)); }
  for (let k = 0; k < 8; k++) splat(x + rr(-2.2, 2.2), zz + rr(-2.2, 2.2), 'drop', rr(0.3, 0.6));
  scene.remove(z.m.g); if (z.blob) scene.remove(z.blob);
  SFX.sever();
}
// Hoarder's odds of a doubled scrap drop, and Bullet time's: how likely a kill sets it off, how slow, how long, and the wait
// before it can go again
const HOARD_X = 0.25, BT = { chance: 0.2, to: 0.55, hold: 0.3, cd: 8 };
// Momentum keeps building while each kill comes within MOM_T seconds of the last
const MOM_T = 2.5;
function killZombie(z, dx, dz, wId, part, overkill) {
  if (z.dead) return;
  z.dead = true; run.kills++; if (z.dn) z.dn.el.classList.add('kill'); if (z.redOl) z.redOl.visible = false; if (z.lightOl) z.lightOl.visible = false; if (z.om) z.om.visible = false; if (z.reachOl) z.reachOl.visible = false; if (z.burnOl) z.burnOl.visible = false; if (z.xr) { z.xr.rim.visible = false; z.xr.fill.visible = false; if (z.xr.sil) z.xr.sil.visible = false; }
  for (const o of zombies) if (o !== z && Math.hypot(o.x - z.x, o.z - z.z) < 1.5) bloodZombie(o, 0.06);   // the spray off a kill
  const D = W(wId) || EFF[wId] || {};
  burst(z.x, 0.9 * z.T.scale, z.z, 14, 'blood', dx, dz, 4);
  spray(z.x, z.z, dx, dz, rr(1.2, 1.8) * z.T.scale);
  shake = Math.max(shake, 0.16);
  popEl('kills');
  // feeding (Iron stomach and on): only some kills, and only up to the wave's cap (FEED in upgrades/tier-table.js)
  if (S.healOnKill) { const f = FEED[S.healOnKill]; if ((S.feedUsed || 0) < f.cap && rand() < (part === 'head' ? f.ph : f.p) && P.hp < S.maxHp) { const h = Math.min(f.h, f.cap - (S.feedUsed || 0), S.maxHp - P.hp); P.hp += h; S.feedUsed = (S.feedUsed || 0) + h; floatText(P.x, P.z, '+' + Math.round(h), '#ef6a52'); } }
  if (S.adrenaline && !(P.adrCd > 0)) { P.adr = 1.2; P.adrCd = 4; }
  if (S.momentum) { S.momK = run.time - S.momT < MOM_T ? Math.min(5, S.momK + 1) : 1; S.momT = run.time; }   // a short burst, and not again for a few seconds
  // Bullet time: now and then a kill slows the world (you too) to BT.to for a moment, and not again for BT.cd seconds
  if (S.bulletTime && timeScale > 0.8 && !(run.time < (S.btNext || 0)) && rand() < BT.chance) { slowTo = BT.to; slowIn = 0.15; slowHold = BT.hold; S.btNext = run.time + BT.cd; }
  const shells = D.ammo === 'shells', heavy = (D.dmg || 0) >= 80 || wId === 'boom';
  if (part === 'head' && z.limbs.head && wId === 'axe' && rand() < 0.85) splitHead(z, dx, dz);
  else if (part === 'head' && z.limbs.head && canSever(wId)) { const c = shells ? 0.95 : D.melee ? 0.4 + (D.sever || 0) * 0.4 : heavy ? 0.8 : overkill > 15 ? 0.55 : 0.3; if (rand() < Math.min(1, c * S.severMul)) { sever(z, 'head', dx, dz); run.heads++; } }
  const extra = !canSever(wId) ? 0 : wId === 'boom' ? 3 : shells ? (rand() < 0.65 ? 1 + (rand() < 0.4 ? 1 : 0) : 0) : heavy && rand() < 0.35 ? 1 : 0;
  for (let k = 0; k < extra; k++) { const opts = ['armL', 'armR', 'legL', 'legR', 'head'].filter(p => z.limbs[p]); if (opts.length) sever(z, pick(opts), dx, dz); }
  const force = wId === 'boom' ? 9 : shells ? 5.5 : D.melee ? 3.5 + (D.kb || 0) * 0.4 : 2.2 + (D.kick || 1) * 0.6;
  if (z.gib && wId === 'boom') blowApart(z, dx, dz); else makeRagdoll(z, dx, dz, part, force, wId);
  const i = zombies.indexOf(z); if (i >= 0) zombies.splice(i, 1);
  SFX.kill();
  // a brute's drops are doubled: twice the scrap, and an ammo box, planks or bandages that hold twice as much
  const big = z.type === 'brute' ? 2 : 1;
  // Hoarder: a scrap drop has a HOARD_X chance to be worth double
  if (rand() < (z.type === 'brute' ? 1 : 0.5)) { const hoard = S.hoard && rand() < HOARD_X; dropPickup(z.x + rr(-.3, .3), z.z + rr(-.3, .3), 'scrap', ((z.type === 'brute' ? 3 : 1) + (rand() < 0.4 ? 1 : 0)) * big * (hoard ? 2 : 1)); if (hoard) pickups[pickups.length - 1].hoard = true; }
  if (rand() < (z.type === 'brute' ? 0.9 : 0.26) * S.dropMul) {
    // ammo is scarce: about half the ammo rolls come up empty, fewer of them for a kill made with a melee weapon (saving
    // rounds pays you back a little). Planks are the rarest roll
    const r = rand(), opts = ammoTypes(), curA = gunAmmo(), mel = D.melee ? 0.15 : 0;
    if (r < 0.6) { if (opts.length && rand() < (z.type === 'brute' ? 0.7 : 0.5) + mel) dropPickup(z.x, z.z, 'ammo', big, curA && rand() < 0.6 ? curA : pick(opts)); }
    else dropPickup(z.x, z.z, r < 0.78 ? 'planks' : 'med', big);
  }
}
// a damage number pops off the zombie; hits landing close together (shotgun pellets, bursts) add up into one number
function dmgNumber(z, dmg, head, y, crit, kind) {
  const now = performance.now();
  if (z.dn && now - z.dn.t0 < 160 && floats.includes(z.dn.f)) {
    z.dn.amt += dmg; z.dn.t0 = now; z.dn.num.textContent = Math.round(z.dn.amt); z.dn.f.t = 0;
    if (head) z.dn.el.classList.add('head');
    if (crit) z.dn.el.classList.add('crit');
    // the pop scales the inner number only: scaling the positioned element would scale its screen position too
    z.dn.num.classList.remove('bump'); void z.dn.num.offsetWidth; z.dn.num.classList.add('bump');
    return;
  }
  const el = document.createElement('div'), num = document.createElement('span'); el.className = 'float dmg' + (head ? ' head' : '') + (crit ? ' crit' : '') + (kind ? ' ' + kind : ''); num.textContent = Math.round(dmg); el.appendChild(num);
  document.body.appendChild(el);
  const f = { el, x: z.x + rr(-0.25, 0.25), z: z.z + rr(-0.25, 0.25), y0: y + 0.25, t: 0, dmg: true };
  floats.push(f); z.dn = { el, num, f, amt: dmg, t0: now };
}
