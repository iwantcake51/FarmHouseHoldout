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
  // body armour by tier: a canvas jacket, then a vest over it, then a plate carrier (player/gear.js builds them)
  const ar = T('armor');
  shirtColours(ar >= 1);   // a canvas jacket over this run's shirt (player/look.js)
  const dmgT = T('ammo'), magT = T('mag'), pr = S.pierce;
  for (const s of SLOTS) {
    const id = W8.slot[s]; if (!id) continue;
    // each mod the weapon has, by its level (1-3): the models grow the part a mod adds as it's improved (lvAt)
    const D = W(id), mods = {}; (W8.mods[id] || []).forEach(m => mods[m] = modLv(m));
    SLIDES[s] = []; MAGPOS[s] = null; MAGG[s] = []; CRANE[s] = []; HOLDS[s] = null; CHARGE[s] = null; BRK[s] = null; BELT[s] = null; tierCtx = id;
    const build = parent => {
      // magazines go in their own group so the reload can drop them out of the model and bring a fresh one in
      const mg = new THREE.Group(); parent.add(mg); parent.userData.magG = mg; MAGG[s].push(mg);
      const info = GUNS[id](parent, mods);
      if (info && info.crane) CRANE[s].push(info.crane);
      if (info && info.charge && !CHARGE[s]) CHARGE[s] = { m: info.charge, at: info.chargeAt, tr: info.chargeTravel || 0.065 };   // how far its handle draws back
      if (info && !MAGPOS[s] && (info.magZ || info.mz)) MAGPOS[s] = [X + parent.position.x, (info.magY || 1.04) - 0.12, info.magZ || info.mz];
      if (D.melee) { unfight(parent); return 0; }
      let front = info.front; const y = info.y;
      if (info.baseMag && !info.ownMags) { if (magT >= 2) drum(mg, info, magT >= 3); else { const h = info.baseMag + magT * 0.1; magBox(mg, 0.056, h, 0.08, X, info.magY - h / 2, info.magZ); } }
      else if (info.magZ && !info.ownMags) { if (magT >= 2) drum(mg, info, magT >= 3); else if (magT && !info.drumOnly) { const h = 0.06 + magT * 0.07; magBox(mg, 0.058, h, 0.07, X, info.magY - h / 2, info.magZ); } }
      if (pr) { cyl(parent, 0.02, 0.09 * pr, GM.blued, X, y, front + 0.045 * pr); ring(parent, 0.024, 0.012, GM.metal, X, y, front + 0.09 * pr - 0.006); front += 0.09 * pr; }
      const nb = parent.children.length, muz = fitAttachments(parent, D, front, y, info) + 0.02;
      // a break-action's barrels carry whatever was fitted on them (a choke, a laser, a light, the shell clip on a
      // sawn-off's forend), so it all swings down with them when it's broken open
      if (info.brk) parent.children.slice(nb).forEach(o => { if (o.position.z > info.brk.position.z + 0.02) { o.position.sub(info.brk.position); info.brk.add(o); } });
      if (info.brk) { BRK[s] = { g: info.brk, rims: info.rims || [] }; }
      if (info.belt) BELT[s] = info.belt;   // a belt-fed gun's rounds, shown by what's left (player/hold.js)
      // pull apart faces that would z-fight, then let the slides and bolts note their rest positions
      unfight(parent);
      if (info && info.slide) [info.slide, ...(info.bolts || [])].forEach(b => { SLIDES[s].push({ m: b, z0: b.position.z, travel: info.travel, lock: !!info.lock, cyc: !!info.cyc, side: parent.userData.side || 'R' }); b.userData.slideRest = { z0: b.position.z, travel: info.travel }; });
      return muz;
    };
    const g = gunMeshes[s];
    // guns sit in one hold group per hand (player/hold.js poses them): a single one for the right hand, or a pair for akimbo
    const hold = (x0, side) => { const h = new THREE.Group(); h.position.x = x0; h.userData.x0 = x0; h.userData.side = side; g.add(h); return h; };
    if (D.melee) MUZ[s] = build(g);
    else if (D.akimbo) { const a = hold(AKX - X, 'R'), b = hold(-AKX - X, 'L'); MUZ[s] = build(a); build(b); HOLDS[s] = { R: a, L: b }; }
    else { const a = hold(0, 'R'); MUZ[s] = build(a); HOLDS[s] = { R: a }; }
    g.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material.userData.mobile = true; });   // weapons carry their own blood
    stainWeapon(id, D.melee ? [g] : Object.values(HOLDS[s]), !!D.melee); g.userData.bloodId = id;   // and here it is (effects/body-blood.js)
    tierCtx = null;
  }
  buildGear();
  stowDirty = true;   // the copies you carry on your body are rebuilt next frame (player/stow.js)
}
// what the HUD lists under a gun's name besides its own mods: its upgrade tiers, and the run-wide attachments that
// actually fit it (the bayonet goes on long guns, the stock on sidearms)
function gunExtras(id) {
  const D = WEAP[id], out = [];
  if (!D) return out;
  if (W8.tune && W8.tune[id]) out.push('Tuned');
  if (D.melee) return out;
  for (const k of ['ammo', 'mag', 'supp', 'sight', 'laser', 'light', 'loader']) { const n = gunTier(id, k); if (n) out.push(TIERS[k].t[n - 1].name); }
  if (S.pierce) out.push('Pierce ' + S.pierce);
  if (S.att.fire) out.push('Incendiary');
  if (S.att.bayonet && D.slot === 'long') out.push('Bayonet');
  if (S.att.stock && D.slot === 'side') out.push('Stock');
  return out;
}
