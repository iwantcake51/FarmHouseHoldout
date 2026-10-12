// Builds the held weapons from stats, mods and tiers; magazines and drums.

function drum(parent, info, big) {
  const r = big ? 0.15 : 0.115, w = big ? 0.12 : 0.1, cy = info.magY - r - 0.02;
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), GM.metal2); d.rotation.z = Math.PI / 2; d.position.set(X, cy, info.magZ); d.castShadow = true; parent.add(d);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, w + 0.01, 10), GM.metal); hub.rotation.z = Math.PI / 2; hub.position.copy(d.position); parent.add(hub);
  [-w / 2, w / 2].forEach(o => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 4, 22), GM.metal); t.rotation.y = Math.PI / 2; t.position.set(X + o, cy, info.magZ); parent.add(t); });
  box(parent, 0.04, 0.02, 0.01, GM.steel, X + w / 2 + 0.008, cy, info.magZ);
  box(parent, 0.05, info.magY - cy, 0.06, GM.metal, X, (info.magY + cy) / 2, info.magZ);
}
// a box magazine with a darker base plate
function magBox(parent, w, h, d, x, y, z) { box(parent, w, h, d, GM.metal2, x, y, z); box(parent, w + 0.008, 0.016, d + 0.012, GM.poly, x, y - h / 2 + 0.006, z); hi(parent, w * 0.6, d * 0.8, x, y + h / 2 - 0.02, z); }
function buildGuns() {
  recomputeEff();
  SLOTS.forEach(s => { const g = gunMeshes[s]; while (g.children.length) g.remove(g.children[0]); });
  // body armour by tier
  while (armorG.children.length) armorG.remove(armorG.children[0]);
  const ar = T('armor');
  PM.mats.shirt.color.setHex(ar >= 1 ? 0x7a6a4a : 0x4e5a3c);
  if (ar >= 2) { box(armorG, 0.56, 0.48, 0.36, lam(0x3a3f2c), 0, 0.9, 0.01); box(armorG, 0.2, 0.12, 0.05, lam(0x2c3022), -0.12, 0.85, 0.19); box(armorG, 0.2, 0.12, 0.05, lam(0x2c3022), 0.12, 0.85, 0.19); }
  if (ar >= 3) { box(armorG, 0.44, 0.36, 0.06, GM.metal2, 0, 0.95, 0.21); box(armorG, 0.16, 0.08, 0.2, lam(0x2c3022), -0.32, 1.12, 0); box(armorG, 0.16, 0.08, 0.2, lam(0x2c3022), 0.32, 1.12, 0); for (let k = 0; k < 3; k++) box(armorG, 0.1, 0.12, 0.06, lam(0x2c3022), -0.12 + k * 0.12, 0.72, 0.22); }
  const dmgT = T('ammo'), magT = T('mag'), pr = S.pierce;
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    const D = W(id), mods = {}; (W8.mods[id] || []).forEach(m => mods[m] = true);
    SLIDES[s] = []; MAGPOS[s] = null; MAGG[s] = []; CRANE[s] = []; tierCtx = id;
    const build = parent => {
      // magazines go in their own group so the reload can drop them out of the model and bring a fresh one in
      const mg = new THREE.Group(); parent.add(mg); parent.userData.magG = mg; MAGG[s].push(mg);
      const info = GUNS[id](parent, mods);
      if (info && info.slide) [info.slide, ...(info.bolts || [])].forEach(b => SLIDES[s].push({ m: b, z0: b.position.z, travel: info.travel, lock: !!info.lock, cyc: !!info.cyc }));
      if (info && info.crane) CRANE[s].push(info.crane);
      if (info && !MAGPOS[s] && (info.magZ || info.mz)) MAGPOS[s] = [X + parent.position.x, (info.magY || 1.04) - 0.12, info.magZ || info.mz];
      if (D.melee) return 0;
      let front = info.front; const y = info.y;
      if (info.baseMag) { if (magT >= 2) drum(mg, info, magT >= 3); else { const h = info.baseMag + magT * 0.1; magBox(mg, 0.056, h, 0.08, X, info.magY - h / 2, info.magZ); } }
      else if (info.magZ) { if (magT >= 2) drum(mg, info, magT >= 3); else if (magT && !info.drumOnly) { const h = 0.06 + magT * 0.07; magBox(mg, 0.058, h, 0.07, X, info.magY - h / 2, info.magZ); } }
      if (pr) { cyl(parent, 0.02, 0.09 * pr, GM.blued, X, y, front + 0.045 * pr); ring(parent, 0.024, 0.012, GM.metal, X, y, front + 0.09 * pr - 0.006); front += 0.09 * pr; }
      return fitAttachments(parent, D, front, y, info) + 0.02;
    };
    const g = gunMeshes[s];
    if (D.akimbo) { const a = new THREE.Group(), b = new THREE.Group(); a.position.x = AKX - X; b.position.x = -AKX - X; g.add(a, b); MUZ[s] = build(a); build(b); }
    else MUZ[s] = build(g);
    g.userData.blood = bloodWeapon(g, !!D.melee); g.userData.bloodId = id;
    tierCtx = null;
  }
  const mods = [];
  buildGear();
  for (const k of ['ammo', 'mag', 'supp', 'sight', 'laser', 'light']) if (T(k)) mods.push(TIERS[k].t[T(k) - 1].name);
  if (pr) mods.push('Pierce ' + pr);
  if (S.att.fire) mods.push('Incendiary'); if (S.att.bayonet) mods.push('Bayonet'); if (S.att.stock) mods.push('Stock');
  cache.modsGeneral = mods;
}
