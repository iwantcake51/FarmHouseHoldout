// Drops: their models, outlines and collection.

const pickups = [];
// pickups: each sits in a pulsing ground ring with a coloured outline so it reads in the dark
const PICK_COL = { scrap: 0xa9bccf, planks: 0xe0a86a, med: 0xef6a52, supply: 0xf08a4a, p9: 0xc8d2dc, magnum: 0xe0503a, shells: 0xd8483a, rifle: 0xe4c46a };
const AM = {
  brass: lam(0xc9a043), brassTip: lam(0xb0663a), p9box: lam(0x3e5466), magBox: lam(0x7a2420), shell: lam(0xa8342a), rifleClip: lam(0x3a3b36), cardboard: lam(0x9a8460), shellBox: lam(0x3f5a34)
};
const ringGeo = new THREE.RingGeometry(0.34, 0.44, 28), discGeo = new THREE.CircleGeometry(0.44, 28);
const roundGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 8);
function cartridge(g, x, y, z, len, r, lying, tipMat) {
  const c = new THREE.Mesh(roundGeo, AM.brass); c.scale.set(r / 0.018, len, r / 0.018); c.position.set(x, y, z); if (lying) c.rotation.z = Math.PI / 2; c.castShadow = true; g.add(c);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r, len * 0.35, 8), tipMat || AM.brassTip);
  if (lying) { tip.rotation.z = -Math.PI / 2; tip.position.set(x + len / 2 + len * 0.17, y, z); } else tip.position.set(x, y + len / 2 + len * 0.17, z);
  g.add(tip); return c;
}
function dropPickup(x, z, kind, amount, ammoType) {
  const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
  const g = new THREE.Group(); root.add(g);
  if (kind === 'planks') { box(g, 0.75, 0.07, 0.16, M.board, 0, 0.3, -0.05).rotation.y = .3; box(g, 0.75, 0.07, 0.16, M.board2, 0, 0.37, 0.05).rotation.y = -.2; }
  else if (kind === 'med') { box(g, 0.38, 0.26, 0.28, lam(0xe2ddd0), 0, 0.3, 0); box(g, 0.2, 0.27, 0.06, lam(0xa3281c), 0, 0.3, 0.12); box(g, 0.06, 0.27, 0.2, lam(0xa3281c), 0, 0.3, 0.06); }
  else if (kind === 'scrap') {
    for (let k = 0; k < 3; k++) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6), GM.steel); n.position.set(rr(-.12, .12), 0.25 + k * 0.03, rr(-.12, .12)); n.rotation.set(rand(), rand(), rand()); n.castShadow = true; g.add(n); }
    box(g, 0.24, 0.03, 0.06, GM.metal2, 0, 0.22, 0).rotation.y = rand() * 3;
  }
  else if (kind === 'supply') { box(g, 0.8, 0.55, 0.6, M.olive, 0, 0.3, 0); box(g, 0.82, 0.08, 0.62, M.metal, 0, 0.45, 0); box(g, 0.25, 0.2, 0.02, M.white, 0, 0.3, 0.31); }
  else if (ammoType === 'p9') {        // a blue-grey carton of 9mm with rounds stood on top
    box(g, 0.34, 0.14, 0.24, AM.p9box, 0, 0.26, 0); box(g, 0.35, 0.02, 0.25, AM.cardboard, 0, 0.34, 0);
    for (let k = 0; k < 4; k++) cartridge(g, -0.11 + k * 0.075, 0.39, 0.02, 0.07, 0.018);
  } else if (ammoType === 'magnum') {  // a red box and a loaded brass speedloader
    box(g, 0.24, 0.16, 0.2, AM.magBox, -0.08, 0.27, 0);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), AM.brass); sl.position.set(0.14, 0.24, 0.05); g.add(sl);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cartridge(g, 0.14 + Math.cos(a) * 0.055, 0.31, 0.05 + Math.sin(a) * 0.055, 0.08, 0.02); }
  } else if (ammoType === 'shells') {  // loose red shells with brass heads around a small box
    box(g, 0.26, 0.12, 0.18, AM.shellBox, -0.05, 0.25, -0.04);
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10), AM.shell); s.rotation.z = Math.PI / 2; s.rotation.y = rr(-.6, .6); s.position.set(rr(-.12, .16), 0.23 + (k > 1 ? 0.08 : 0), 0.1 + rr(-.05, .05)); s.castShadow = true; g.add(s); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 10), AM.brass); b.position.y = -0.075; s.add(b); }
  } else {                              // rifle: long rounds on a stripper clip
    box(g, 0.34, 0.03, 0.06, AM.rifleClip, 0, 0.21, 0);
    for (let k = 0; k < 5; k++) cartridge(g, -0.13 + k * 0.065, 0.32, 0, 0.2, 0.022);
    cartridge(g, 0.05, 0.22, 0.15, 0.2, 0.022, true);
  }
  const col = PICK_COL[kind === 'ammo' ? ammoType : kind];
  const om = outline(g, col);
  const xr = xray(g, col, true);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const discMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat), disc = new THREE.Mesh(discGeo, discMat);
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.position.y = 0.035; disc.position.y = 0.033; ring.renderOrder = disc.renderOrder = 2;
  if (kind === 'supply') { ring.scale.setScalar(1.8); disc.scale.setScalar(1.8); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, color: col, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(kind === 'supply' ? 1.6 : 1.0, kind === 'supply' ? 1.6 : 1.0, 1); glow.renderOrder = 4;
  root.add(disc, ring, glow);
  g.scale.setScalar(0.01);
  pickups.push({ g: root, item: g, ring, ringMat, discMat, om, xr, glow, kind, ammoType, x, z, t: kind === 'supply' ? 60 : 25, ph: rand() * 6, amount: amount || 1, age: 0, toss: rr(0, Math.PI * 2) });
}
// drops: bob, glow, magnet scrap, and collecting them
function updatePickups(dt) {
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; p.t -= dt; p.ph += dt * 3; p.age += dt;
    // tossed out of the body, then a slow bob and spin over a pulsing ring
    const a = Math.min(1, p.age / 0.32), pop = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);
    p.item.scale.setScalar(Math.max(0.01, pop));
    const hop = p.age < 0.32 ? Math.sin(a * Math.PI) * 0.55 : 0;
    p.item.position.set(Math.cos(p.toss) * 0.25 * (1 - a), hop + 0.06 + Math.sin(p.ph) * 0.06, Math.sin(p.toss) * 0.25 * (1 - a));
    p.item.rotation.y += dt * 1.3;
    const pulse = 0.5 + 0.5 * Math.sin(p.ph * 1.4);
    p.ring.scale.setScalar((p.kind === 'supply' ? 1.8 : 1) * (0.92 + pulse * 0.16)); p.ringMat.opacity = 0.45 + pulse * 0.4;
    const blink = p.t > 4 || Math.sin(p.t * 14) > 0;
    p.om.opacity = blink ? 0.95 : 0.2; p.xr.rim.opacity = (blink ? 0.55 + 0.35 * pulse : 0.15);
    // drops stay on screen outside your view cone (behind you, round a corner), just dimmer
    const seen = visAt(p.x, p.z); p.g.visible = true;
    p.glow.material.opacity = (0.32 + 0.3 * (1 - seen)) * (0.75 + 0.25 * pulse) * (blink ? 1 : 0.3); p.glow.position.y = 0.55 + Math.sin(p.ph) * 0.06;
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    if (p.kind === 'scrap' && d < 2.2 && d > 0.3) { p.x += (P.x - p.x) * Math.min(1, dt * 6); p.z += (P.z - p.z) * Math.min(1, dt * 6); p.g.position.x = p.x; p.g.position.z = p.z; }
    // a full bandage bag leaves the bandage where it lies; it never heals you on the spot
    const bagFull = (P.band || 0) >= BAND_MAX;
    if (p.kind === 'med' && bagFull && d < 0.9) { if (!p.warned) { p.warned = true; toast('Bandage bag full', { kind: 'warn', icon: 'med', sub: BAND_MAX + '/' + BAND_MAX + ' · press G to use one' }); } }
    else if (d < 0.9) {
      let ft = '';
      if (p.kind === 'planks') { const n = 1 + (rand() < 0.4 ? 1 : 0); S.planks += n; feed('planks', n, 'planks'); popEl('planks'); ft = '+' + n; SFX.pick(); }
      else if (p.kind === 'med') { P.band = (P.band || 0) + 1; feed('med', 1, 'bandage'); ft = '+1 bandage'; popEl('bands'); SFX.pick(); }
      else if (p.kind === 'scrap') { S.scrap += p.amount; feed('scrap', p.amount, 'scrap'); popEl('scrap'); ft = '+' + p.amount; SFX.scrap(); }
      else if (p.kind === 'supply') { ammoTypes().forEach(a => { W8.reserve[a] += AMMO_CAN[a]; feed('ammo', AMMO_CAN[a], AMMO_NAME[a]); }); S.planks += 4; S.scrap += 6; const nb = Math.min(2, BAND_MAX - (P.band || 0)); P.band = (P.band || 0) + nb; feed('planks', 4, 'planks'); feed('scrap', 6, 'scrap'); if (nb) { feed('med', nb, nb > 1 ? 'bandages' : 'bandage'); popEl('bands'); } feed('supply', 0, 'Supply crate opened'); ft = 'Supplies'; SFX.upgrade(); }
      else { const opts = ammoTypes(), a = p.ammoType || pick(opts); if (a) { const amt = Math.max(1, Math.round(ammoAmt(a) * AMMO_PICKUP_MUL)); W8.reserve[a] += amt; feed('ammo', amt, AMMO_NAME[a]); ft = '+' + amt + ' ' + AMMO_NAME[a]; } else { S.scrap += 2; feed('scrap', 2, 'scrap'); ft = '+2'; } SFX.pick(); }
      floatText(p.x, p.z, ft, '#' + PICK_COL[p.kind === 'ammo' ? (p.ammoType || 'rifle') : p.kind].toString(16).padStart(6, '0'));
      scene.remove(p.g); pickups.splice(k, 1);
    } else if (p.t <= 0) { scene.remove(p.g); pickups.splice(k, 1); }
    else if (d > 1.3) p.warned = false;
  }
}
