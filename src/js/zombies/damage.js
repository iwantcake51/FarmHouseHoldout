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
function sever(z, part, dx, dz, blast) {
  if (part !== 'torso' && !z.limbs[part]) return;
  if (z.type === 'brute' && !blast && (part === 'legL' || part === 'legR')) return;   // a brute's legs are too thick to take off: it never ends up crawling
  z.limbs[part] = false;
  const mesh = z.m[part], wp = new V3(), wq = new THREE.Quaternion(), ws = new V3();
  mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq); mesh.getWorldScale(ws);
  mesh.parent.remove(mesh); mesh.children.filter(c => c.userData.isOutline).forEach(c => mesh.remove(c)); mesh.material = relit(mesh.material); mesh.material.opacity = 1; mesh.material.transparent = false; scene.add(mesh); mesh.traverse(o => { o.customDepthMaterial = undefined; });
  mesh.position.copy(wp); mesh.quaternion.copy(wq); mesh.scale.copy(ws);
  gibs.push({ m: mesh, vx: dx * rr(2, 4.5) + rr(-1.2, 1.2), vy: rr(2.5, 4.5), vz: dz * rr(2, 4.5) + rr(-1.2, 1.2), spin: rr(6, 14), life: 9, landed: false });
  z.spurts.push({ part, t: 1.4 });
  burst(wp.x, wp.y, wp.z, 10, 'blood', dx, dz, 3); spray(wp.x, wp.z, dx, dz, rr(0.8, 1.3));
  if (part !== 'torso') run.limbs++; if (!blast) SFX.sever();   // a blast plays one sound for the lot
  if ((part === 'legL' || part === 'legR') && !z.crawl && !z.dead) {
    // the leg goes and they buckle and fall forward onto their hands
    z.crawl = true; z.crawlT = 0; z.stagger = Math.max(z.stagger, 0.85); z.trail = 0;
    z.om = outline(z.m.g, 0, 0, 0.026, rimMat(0xe8dcc0)); z.om.opacity = z.vis * 0.5; z.lastVis = undefined;
  }
}
function pickPart(z, rel, side, D) {
  const head = Math.min(0.85, 0.14 + S.headBonus + (D.headBonus || 0) + (T('sight') >= 3 && D.slot !== 'side' ? 0.1 : 0) + (scoped || scopeAim() ? 0.3 : 0));
  let p;
  if (Math.abs(rel) > 0.6) p = side > 0 ? 'armR' : 'armL';
  else { const r = rand(); p = r < head ? 'head' : r < head + 0.22 ? (side > 0 ? 'legR' : 'legL') : 'torso'; }
  if (z.crawl && (p === 'legL' || p === 'legR')) p = 'torso';
  if (!z.limbs[p]) p = 'torso';
  return p;
}
function hurtZombie(z, dmg, dx, dz, kb, wId, part) {
  if (z.dead) return false;
  const D = W(wId) || EFF[wId] || {};
  part = part || 'torso';
  if (part !== 'torso' && !z.limbs[part]) part = 'torso';
  if (S.lastStand && P.hp < S.maxHp * 0.3) dmg *= 1.8;
  if (z.crawl) dmg *= 1.75;   // a crawler is already half dead
  const dealt = dmg * (part === 'head' ? headMulFor(D) : partMult(part));
  z.hp -= dealt; z.flash = 0.14; z.squash = 1;
  // brutes shrug hits off: no stagger, no knockback
  if (z.type !== 'brute') { z.stagger = part === 'head' ? 0.3 : part === 'legL' || part === 'legR' ? 0.35 : 0.18; z.vx += dx * kb / z.T.scale; z.vz += dz * kb / z.T.scale; }
  const y = PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1);
  burst(z.x, y, z.z, part === 'head' ? 9 : 6, 'blood', dx, dz, 3.2); hitMist(z.x, y, z.z, dx, dz, part === 'head');
  if (rand() < 0.7) spray(z.x, z.z, dx, dz, rr(0.6, 1.1));
  xhHit = 1; xhHead = part === 'head';
  dmgNumber(z, dealt, part === 'head', y);
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
function killZombie(z, dx, dz, wId, part, overkill) {
  if (z.dead) return;
  z.dead = true; run.kills++; if (z.dn) z.dn.el.classList.add('kill'); if (z.redOl) z.redOl.visible = false; if (z.om) z.om.visible = false; if (z.xr) { z.xr.rim.visible = false; z.xr.fill.visible = false; if (z.xr.sil) z.xr.sil.visible = false; }
  const D = W(wId) || EFF[wId] || {};
  burst(z.x, 0.9 * z.T.scale, z.z, 14, 'blood', dx, dz, 4);
  spray(z.x, z.z, dx, dz, rr(1.2, 1.8) * z.T.scale);
  xhKill = true; xhHit = 1.4; shake = Math.max(shake, 0.16);
  popEl('kills');
  if (S.healOnKill) P.hp = Math.min(S.maxHp, P.hp + S.healOnKill * (S.vampire && part === 'head' ? 2 : 1));
  if (S.adrenaline && !(P.adrCd > 0)) { P.adr = 1.2; P.adrCd = 4; }   // a short burst, and not again for a few seconds
  if (S.bulletTime && timeScale > 0.6 && rand() < 0.35) { slowTo = 0.45; slowIn = 0.22; slowHold = 0.15; }
  const shells = D.ammo === 'shells', heavy = (D.dmg || 0) >= 80 || wId === 'boom';
  if (part === 'head' && z.limbs.head && canSever(wId)) { const c = shells ? 0.95 : D.melee ? 0.4 + (D.sever || 0) * 0.4 : heavy ? 0.8 : overkill > 15 ? 0.55 : 0.3; if (rand() < Math.min(1, c * S.severMul)) { sever(z, 'head', dx, dz); run.heads++; } }
  const extra = !canSever(wId) ? 0 : wId === 'boom' ? 3 : shells ? (rand() < 0.65 ? 1 + (rand() < 0.4 ? 1 : 0) : 0) : heavy && rand() < 0.35 ? 1 : 0;
  for (let k = 0; k < extra; k++) { const opts = ['armL', 'armR', 'legL', 'legR', 'head'].filter(p => z.limbs[p]); if (opts.length) sever(z, pick(opts), dx, dz); }
  const force = wId === 'boom' ? 9 : shells ? 5.5 : D.melee ? 3.5 + (D.kb || 0) * 0.4 : 2.2 + (D.kick || 1) * 0.6;
  if (z.gib && wId === 'boom') blowApart(z, dx, dz); else makeRagdoll(z, dx, dz, part, force, wId);
  const i = zombies.indexOf(z); if (i >= 0) zombies.splice(i, 1);
  SFX.kill();
  if (rand() < (z.type === 'brute' ? 1 : 0.5)) dropPickup(z.x + rr(-.3, .3), z.z + rr(-.3, .3), 'scrap', ((z.type === 'brute' ? 3 : 1) + (rand() < 0.4 ? 1 : 0)) * S.scrapMul);
  if (rand() < (z.type === 'brute' ? 0.9 : 0.26) * S.dropMul) {
    // ammo is scarce: about half the ammo rolls come up empty
    const r = rand(), opts = ammoTypes(), curA = gunAmmo();
    if (r < 0.55) { if (opts.length && rand() < (z.type === 'brute' ? 0.7 : 0.5)) dropPickup(z.x, z.z, 'ammo', 1, curA && rand() < 0.6 ? curA : pick(opts)); }
    else dropPickup(z.x, z.z, r < 0.8 ? 'planks' : 'med');
  }
}
// a damage number pops off the zombie; hits landing close together (shotgun pellets, bursts) add up into one number
function dmgNumber(z, dmg, head, y) {
  const now = performance.now();
  if (z.dn && now - z.dn.t0 < 160 && floats.includes(z.dn.f)) {
    z.dn.amt += dmg; z.dn.t0 = now; z.dn.num.textContent = Math.round(z.dn.amt); z.dn.f.t = 0;
    if (head) z.dn.el.classList.add('head');
    // the pop scales the inner number only: scaling the positioned element would scale its screen position too
    z.dn.num.classList.remove('bump'); void z.dn.num.offsetWidth; z.dn.num.classList.add('bump');
    return;
  }
  const el = document.createElement('div'), num = document.createElement('span'); el.className = 'float dmg' + (head ? ' head' : ''); num.textContent = Math.round(dmg); el.appendChild(num);
  document.body.appendChild(el);
  const f = { el, x: z.x + rr(-0.25, 0.25), z: z.z + rr(-0.25, 0.25), y0: y + 0.25, t: 0, dmg: true };
  floats.push(f); z.dn = { el, num, f, amt: dmg, t0: now };
}
