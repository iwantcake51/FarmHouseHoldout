// Drops: their models, outlines and collection.

const pickups = [];
// how long a drop lies on the ground before it's gone (the last 10 seconds of that pulsing a warning); supply crates longer
const DROP_LIFE = 40, CRATE_LIFE = 90;
// pickups: each sits in a pulsing ground ring with a coloured outline so it reads in the dark
// (the supply crate off the radio, ammo for everything, in teal so it stands apart). A weapon lying on the ground, or in
// its case off the radio, glows in its rarity's colour, the same as its card: grey common, green uncommon, blue rare,
// purple epic, orange legendary (a weapon with none, the starting pistol and bat, is uncommon: grey is only for aid).
// Every ammo box, whatever it holds, is the same bright brass yellow, a colour no other drop uses, so ammo reads as ammo
// at a glance (the box itself shows which kind: blue 9mm card, red magnum card, green shell box, olive rifle can)
const AMMO_COL = 0xffd23a;
const PICK_COL = { scrap: 0xa9bccf, planks: 0xe0a86a, med: 0xef6a52, supply: 0x4fd0c2, ammo: AMMO_COL };
const RAR_COL = { c: 0xc4bcad, u: 0x6fd07a, r: 0x5f9ee8, e: 0x9f7af2, l: 0xf0a050 };
const weaponCol = id => RAR_COL[(WEAP[id] && WEAP[id].rar) || 'u'];
const pickCol = (kind, ammoType, cargo) => kind === 'gun' ? weaponCol(cargo && cargo.id) : kind === 'supply' && cargo && cargo.kind === 'weapon' ? weaponCol(cargo.id) : PICK_COL[kind];
const ringGeo = new THREE.RingGeometry(0.34, 0.44, 28), discGeo = new THREE.CircleGeometry(0.44, 28);
// a tall, soft shaft of light in the crate's colour standing up out of a supply crate, fading toward the top, so it stands out across
// the yard and through the dark
const BEAM_TEX = glowTex(4, 64, x => { const g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); });
const BEAM_GEO = new THREE.CylinderGeometry(0.1, 0.26, 7, 14, 1, true).translate(0, 3.5, 0);
function dropBeam(col) {
  const m = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ map: BEAM_TEX, color: col || 0xffa050, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.renderOrder = 3; m.userData.isOutline = true; return m;   // (kept out of the crate's outline)
}
function dropPickup(x, z, kind, amount, ammoType, cargo) {
  const root = new THREE.Group(); root.position.set(x, 0, z); scene.add(root);
  const g = new THREE.Group(); root.add(g);
  dropModel(g, kind, ammoType, cargo);   // (pickups/drop-models.js)
  const col = pickCol(kind, ammoType, cargo);
  // planks and bandages can be left lying when you're full: they get their own copies of their materials so they can
  // go half grey on their own (greyDrop, below)
  const mats = [];
  if (kind === 'planks' || kind === 'med') g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.c0 = o.material.color.clone(); mats.push(o.material); } });
  const fineOut = o => !o.userData.fine;   // (the merged detail has no outline of its own)
  const om = outline(g, col, 0, 0, null, fineOut);
  const xr = xray(g, col, true, false, fineOut);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const discMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat), disc = new THREE.Mesh(discGeo, discMat);
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; ring.position.y = 0.035; disc.position.y = 0.033; ring.renderOrder = disc.renderOrder = 2;
  if (kind === 'supply') { ring.scale.setScalar(1.8); disc.scale.setScalar(1.8); root.add(dropBeam(col)); }
  if (kind === 'gun') { ring.scale.setScalar(1.4); disc.scale.setScalar(1.4); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, color: col, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(kind === 'supply' ? 1.6 : 1.0, kind === 'supply' ? 1.6 : 1.0, 1); glow.renderOrder = 4;
  root.add(disc, ring, glow);
  g.scale.setScalar(0.01);
  if (kind !== 'scrap' && kind !== 'supply' && (amount || 1) > 1) root.scale.setScalar(1.25);   // a doubled drop (a brute's) is a size bigger
  pickups.push({ g: root, item: g, ring, ringMat, discMat, om, xr, glow, kind, ammoType, cargo, x, z, mats, col: new THREE.Color(col), grey: 0, greyShown: 0, t: kind === 'gun' ? Infinity : kind === 'supply' ? CRATE_LIFE : DROP_LIFE, ph: rand() * 6, amount: amount || 1, age: 0, toss: rr(0, Math.PI * 2) });
}
// a drop you can't take right now (planks with your stack full, bandages with your bag full) is half grey and darker,
// its ring and glow dimmed, so it's plain you can't grab it; it eases back into colour as soon as you have room
const _gc = new THREE.Color(), _gl = new THREE.Color();
const greyOf = (c, k, out) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; return out.copy(c).lerp(_gl.setRGB(l, l, l), k).multiplyScalar(1 - k * 0.9); };
function greyDrop(p, dt) {
  const full = p.kind === 'planks' ? !plankRoom() : p.kind === 'med' ? (P.band || 0) >= bandMax() : false;
  p.grey += ((full ? 0.5 : 0) - p.grey) * Math.min(1, dt * 3);
  if (Math.abs(p.grey - p.greyShown) < 0.004) return;
  p.greyShown = p.grey;
  p.mats.forEach(m => greyOf(m.userData.c0, p.grey, m.color));
  greyOf(p.col, p.grey, _gc); p.ringMat.color.copy(_gc); p.discMat.color.copy(_gc); p.glow.material.color.copy(_gc); p.om.color.copy(_gc); p.xr.rim.color.copy(_gc);
}
// drops: bob, glow, magnet scrap, and collecting them
function updatePickups(dt) {
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; p.t -= dt; p.ph += dt * 3; p.age += dt;
    // a gun you put down lies there for two rounds (GUN_KEEP): when the round after those starts it gives its 10-second
    // warning and is gone
    if (p.kind === 'gun' && p.t === Infinity && run.wave >= p.cargo.until) p.t = 10;
    if (p.mats.length) greyDrop(p, dt);
    // tossed out of the body, then a slow bob and spin over a pulsing ring
    const a = Math.min(1, p.age / 0.32), pop = 1 + 2.2 * Math.pow(a - 1, 3) + 1.2 * Math.pow(a - 1, 2);
    p.item.scale.setScalar(Math.max(0.01, pop));
    const hop = p.age < 0.32 ? Math.sin(a * Math.PI) * 0.55 : 0;
    p.item.position.set(Math.cos(p.toss) * 0.25 * (1 - a), hop + 0.06 + Math.sin(p.ph) * 0.06, Math.sin(p.toss) * 0.25 * (1 - a));
    p.item.rotation.y += dt * 1.3;
    const pulse = 0.5 + 0.5 * Math.sin(p.ph * 1.4);
    p.ring.scale.setScalar((p.kind === 'supply' ? 1.8 : p.kind === 'gun' ? 1.4 : 1) * (0.92 + pulse * 0.16)); p.ringMat.opacity = 0.45 + pulse * 0.4;
    // the last 10 seconds: it pulses, slowly at first and faster and faster, then shrinks away in the last moment
    const warn = clamp(1 - p.t / 10, 0, 1);
    p.wph = (p.wph || 0) + dt * Math.PI * 2 * (0.9 + 9 * warn * warn);
    const beat = 0.5 + 0.5 * Math.cos(p.wph), lit = warn > 0 ? 1 - Math.min(1, warn * 2) * (1 - beat) : 1, gone = clamp(p.t / 0.35, 0, 1);
    p.item.scale.multiplyScalar((1 + 0.14 * warn * beat) * (0.2 + 0.8 * gone)); p.ring.scale.multiplyScalar((1 + 0.12 * warn * beat) * gone);
    p.om.opacity = 0.2 + 0.75 * lit; p.xr.rim.opacity = 0.15 + (0.4 + 0.35 * pulse) * lit; p.ringMat.opacity *= 0.35 + 0.65 * lit;
    if (p.grey > 0.004) { const dim = 1 - p.grey * 1.2; p.om.opacity *= dim; p.ringMat.opacity *= dim; p.discMat.opacity = 0.16 * dim; }   // full: its ring and outline dimmed too
    // drops stay on screen outside your view cone (behind you, round a corner), just dimmer
    const seen = visAt(p.x, p.z); p.g.visible = true;
    p.glow.material.opacity = (0.32 + 0.3 * (1 - seen)) * (0.75 + 0.25 * pulse) * (0.3 + 0.7 * lit) * gone * (1 - p.grey * 1.2); p.glow.position.y = 0.55 + Math.sin(p.ph) * 0.06;
    let d = Math.hypot(p.x - P.x, p.z - P.z);
    // a drop out past the edge of the farm, where you can't walk, flies in to you once it's landed, picking up speed;
    // one you can't take yet (a full bag or stack) stops just short of you
    if (p.homing === undefined) p.homing = Math.max(Math.abs(p.x), Math.abs(p.z)) > HALF - 0.5;
    if (p.homing && p.age > 0.5 && p.kind !== 'supply' && p.kind !== 'gun' && (!p.nid || p.own)) {   // (in co-op, only to whoever made the kill)
      const sp = Math.min(10, 2 + (p.age - 0.5) * 6), full = (p.kind === 'med' && (P.band || 0) >= bandMax()) || (p.kind === 'planks' && !plankRoom()), stop = full ? 1.4 : 0;
      if (d > stop) { const st = Math.min(d - stop, sp * dt); p.x += (P.x - p.x) / d * st; p.z += (P.z - p.z) / d * st; p.g.position.x = p.x; p.g.position.z = p.z; p.item.position.y += Math.min(0.5, d * 0.08); d = Math.hypot(p.x - P.x, p.z - P.z); }
      if (!full) p.t = Math.max(p.t, 12);   // and it doesn't run out on its way
    }
    if (p.kind === 'scrap' && d < 2.2 && d > 0.3) { p.x += (P.x - p.x) * Math.min(1, dt * 6); p.z += (P.z - p.z) * Math.min(1, dt * 6); p.g.position.x = p.x; p.g.position.z = p.z; }
    // a full bandage bag leaves the bandage where it lies (it never heals you on the spot), and so does a full plank
    // stack: it just stays there, greyed out (greyDrop), with no message
    const full = (p.kind === 'med' && (P.band || 0) >= bandMax()) || (p.kind === 'planks' && !plankRoom());
    if (d < 0.9 && !full && !isTake(p)) {   // (a weapon is taken with E: takeIt, below)
      let ft = '';
      if (p.kind === 'planks') { const n = addPlanks(1); feed('planks', n, 'planks'); popEl('planks'); ft = '+' + n; SFX.pick(); }   // always the one plank
      else if (p.kind === 'med') { const n = Math.min(p.amount, bandMax() - (P.band || 0)); P.band = (P.band || 0) + n; feed('med', n, n > 1 ? 'bandages' : 'bandage'); ft = '+' + n + (n > 1 ? ' bandages' : ' bandage'); popEl('bands'); SFX.pick(); }
      else if (p.kind === 'scrap') { S.scrap += p.amount; feed('scrap', p.amount, 'scrap'); popEl('scrap'); ft = '+' + p.amount + (p.hoard ? ' ×2' : ''); SFX.scrap(); }
      else if (p.kind === 'supply') { flareDone(); ammoTypes().forEach(a => { W8.reserve[a] += AMMO_CAN[a]; feed('ammo', AMMO_CAN[a], AMMO_NAME[a]); }); const np = addPlanks(4); S.scrap += 6; const nb = Math.min(2, bandMax() - (P.band || 0)); P.band = (P.band || 0) + nb; if (np) { feed('planks', np, 'planks'); popEl('planks'); } feed('scrap', 6, 'scrap'); if (nb) { feed('med', nb, nb > 1 ? 'bandages' : 'bandage'); popEl('bands'); } feed('supply', 0, 'Supply crate opened'); ft = 'Supplies'; SFX.crate(); }
      else {
        // an ammo box has rounds for every gun you carry, whichever kind it looks like
        const opts = ammoTypes();
        opts.forEach(a => { const amt = Math.max(1, Math.round(ammoAmt(a) * AMMO_PICKUP_MUL * S.ammoMul * p.amount)); W8.reserve[a] += amt; feed('ammo', amt, AMMO_NAME[a]); if (!ft) ft = '+' + amt + ' ' + AMMO_NAME[a]; });
        if (opts.length > 1) ft = '+Ammo for every gun'; else if (!opts.length) { S.scrap += 2; feed('scrap', 2, 'scrap'); ft = '+2'; }
        SFX.pick();
      }
      floatText(p.x, p.z, ft, '#' + pickCol(p.kind, p.ammoType, p.cargo).toString(16).padStart(6, '0'));
      if (p.nid) netSend('pt', { n: p.nid });   // gone from your teammates' farms too
      scene.remove(p.g); pickups.splice(k, 1);
    } else if (p.t <= 0) { if (p.kind === 'supply') flareDone(); scene.remove(p.g); pickups.splice(k, 1); }
  }
}

// weapons are taken on purpose, with E (or the touch button), never just by walking over them: a weapon's case off the
// radio, and a gun you've put down for another, lying where you dropped it with its upgrades and the rounds that were
// in it. Taking one puts down the one in that slot in its place (gunDrop)
const TAKE_R = 1.4;
const isTake = p => p.kind === 'gun' || (p.kind === 'supply' && !!p.cargo && p.cargo.kind === 'weapon');
const takeId = p => p.kind === 'gun' ? p.cargo.id : p.cargo.id;
function nearestTake() {
  if (P.dead || P.vault || state !== 'play') return null;
  let best = null, bd = TAKE_R;
  for (const p of pickups) { if (!isTake(p) || p.age < 0.4) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
  return best;
}
// put a weapon down where you stand: a copy of it as you carry it, lying on its side, to pick back up
const GUN_KEEP = 2;   // rounds a gun you've put down stays on the ground
function gunDrop(id) {
  const s = WEAP[id].slot, src = gunMeshes[s]; if (!src) return;
  const copy = src.clone(true);
  copy.traverse(o => { for (let k = o.children.length - 1; k >= 0; k--) if (o.children[k].userData.isFlash || o.children[k].userData.isOutline) o.remove(o.children[k]); });
  copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.scale.set(1, 1, 1); copy.visible = true;
  copy.children.forEach(h => { if (h.userData.side) { h.position.x = h.userData.x0 || 0; h.position.y = h.position.z = 0; h.rotation.set(0, 0, 0); h.visible = true; } });
  copy.updateMatrixWorld(true); const c = new THREE.Box3().setFromObject(copy).getCenter(new V3());
  const lay = new THREE.Group(); lay.rotation.set(0, rr(0, Math.PI * 2), Math.PI / 2); copy.position.set(-c.x, -c.y, -c.z); lay.position.y = 0.12; lay.add(copy);
  const a = rr(0, Math.PI * 2);
  // it lasts the round it's put down in (or the next, put down between rounds) and the one after (GUN_KEEP)
  const until = (phase === 'wave' ? run.wave : run.wave + 1) + GUN_KEEP;
  dropPickup(P.x + Math.sin(a) * 0.5, P.z + Math.cos(a) * 0.5, 'gun', 1, null, { id, model: lay, mag: W8.mag[id] || 0, ak: W8.akMag[id] ? { ...W8.akMag[id] } : null, until });
}
function takeIt(p) {
  const id = takeId(p), D = WEAP[id], old = W8.slot[D.slot];
  if (old) gunDrop(old);
  if (p.kind === 'gun') {
    // your own gun back: as you left it, no fresh ammo with it
    W8.slot[D.slot] = id; recomputeEff(); delete W8.pin[id]; W8.mag[id] = Math.min(magSize(id), p.cargo.mag); if (p.cargo.ak) W8.akMag[id] = p.cargo.ak;
    equip(D.slot, true); buildGuns(); gunGlow = 1;
    gotGear({ ic: 'gear', kind: 'Picked back up', name: D.name, on: old ? 'In place of your ' + gunCall(old) : 'Your ' + SLOT_WORD[D.slot], text: '' });
  } else { deliverWeapon(id); flareDone(); }
  floatText(p.x, p.z, D.name, '#f0c060'); SFX.pick();
  scene.remove(p.g); const k = pickups.indexOf(p); if (k >= 0) pickups.splice(k, 1);
}
