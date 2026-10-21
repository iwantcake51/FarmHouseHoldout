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
  z.limbs[part] = false; netRec('s', part, blast ? 1 : 0);   // (in co-op, what came off goes to the others: net/sync.js)
  const stub = part === 'armL' || part === 'armR' ? armStump(z, part) : null;   // (made before the arm goes: it's cut from it)
  flingPart(z, z.m[part], dx, dz, 1);
  z.spurts.push(stub ? { part, t: STUMP_PUMP.t, o: stub, p: [0, 0, 0.085], pump: true } : { part, t: 1.4 });
  if (part !== 'torso') { if (!NREP) run.limbs++; z.stagger = Math.max(z.stagger || 0, LIMB_STAGGER); }   // losing an arm or a leg staggers it, slowed to a quarter pace
  if (!blast) soundAt(z.x, z.z, () => SFX.sever());   // a blast plays one sound for the lot
  if ((part === 'legL' || part === 'legR') && !z.crawl && !z.dead) goCrawl(z);
}
// an arm taken off whole leaves a stump at the shoulder: a short stub of the arm, its sleeve if it has one, ragged at
// the end, the raw meat of the cut with the bone standing out of it, and the shoulder bloodied round it. It hangs at
// the side whatever the arm was doing, and for STUMP_PUMP.t seconds it pumps blood out in spurts, weaker each beat
const STUMP_M = { raw: 0xa01c14, meat: 0xc8402e };
const STUMP_PUMP = { t: 3.2, rate: 1.5 };
function armStump(z, part) {
  const arm = z.m[part], par = arm && arm.parent; if (!par) return null;
  // its own copies of the sleeve's (or the skin's) colour and the cut's, fading with the body (z.fade) as the rest does
  const sleeve = arm.children.find(c => c.isMesh && !c.userData.isOutline && Math.abs(c.position.z - 0.04) < 0.012), from = (sleeve || arm).material;
  const own = c => { const m = lam(c); m.userData.mobile = true; m.transparent = true; m.opacity = from.opacity ?? 1; if (z.fade) z.fade.push(m); return m; };
  const skin = own(from.color ? from.color.getHex() : 0x7a6a50), raw = own(STUMP_M.raw), meat = own(STUMP_M.meat), bone = own(0xe2d9c4);
  const s = new THREE.Group(); s.position.copy(arm.position); s.rotation.set(Math.PI / 2 - 0.12, 0, (part === 'armL' ? 1 : -1) * 0.12); par.add(s);   // (+z down the side)
  box(s, 0.14, 0.14, 0.075, skin, 0, 0, 0.0375);
  [[0.05, 0.05, 0.03], [-0.055, 0.02, 0.022], [0.0, -0.058, 0.026], [-0.03, 0.05, 0.018]].forEach(([x, y, l]) => box(s, 0.05, 0.03, l, skin, x, y, 0.075 + l / 2 - 0.006).rotation.z = rr(-0.4, 0.4));   // the torn edge
  box(s, 0.124, 0.124, 0.012, raw, 0, 0, 0.078); box(s, 0.08, 0.075, 0.01, meat, 0.006, -0.004, 0.086);
  box(s, 0.032, 0.032, 0.04, bone, rr(-0.012, 0.012), rr(-0.012, 0.012), 0.1);   // the bone
  s.traverse(o => { if (o.isMesh) { o.castShadow = true; if (arm.customDepthMaterial) o.customDepthMaterial = arm.customDepthMaterial; } });   // (its shadow fades with the body's too)
  const t = z.m.torso; if (t) addWound(z, WOUND_ZONE.torso, new V3((part === 'armL' ? -1 : 1) * 0.24, 0.2, 0), 0.11, 2);   // the shoulder bloodied
  return s;
}
// a piece of a zombie torn off (a limb, or just a forearm or shin: zombies/wounds.js) thrown out as a gib, a burst of
// blood where it came away; v scales how hard it's thrown
function flingPart(z, mesh, dx, dz, v) {
  const wp = new V3(), wq = new THREE.Quaternion(), ws = new V3();
  mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq); mesh.getWorldScale(ws);
  mesh.parent.remove(mesh); mesh.children.filter(c => c.userData.isOutline).forEach(c => mesh.remove(c));
  mesh.traverse(o => { if (!o.isMesh || o.userData.isOutline) return; o.customDepthMaterial = undefined; if (z.fade) z.fade = z.fade.filter(mt => mt !== o.material); if (o.material.userData.bloodOf) { o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; o.material.colorWrite = true; } else { o.material = o.material.isMeshLambertMaterial ? relit(o.material) : o.material.clone(); o.material.opacity = 1; o.material.transparent = false; } });   // (only lit materials take the light-map patch: a glow can't)
  bloodZombie(z, 0.12); scene.add(mesh);
  mesh.position.copy(wp); mesh.quaternion.copy(wq); mesh.scale.copy(ws);
  gibs.push({ m: mesh, vx: (dx * rr(2, 4.5) + rr(-1.2, 1.2)) * v, vy: rr(2.5, 4.5) * (0.6 + 0.4 * v), vz: (dz * rr(2, 4.5) + rr(-1.2, 1.2)) * v, spin: rr(6, 14), life: 9, landed: false });
  burst(wp.x, wp.y, wp.z, 10, 'blood', dx, dz, 3); spray(wp.x, wp.z, dx, dz, rr(0.8, 1.3));
}
// a leg (or its shin) goes and they buckle and fall forward onto their hands
function goCrawl(z) {
  z.crawl = true; z.crawlT = 0; z.stagger = Math.max(z.stagger, 0.85); z.trail = 0;
  z.om = outline(z.m.g, 0, 0, 0.026, rimMat(0xe8dcc0)); z.om.opacity = z.vis * 0.5; z.lastVis = undefined;
}
// the fire axe coming down on a skull splits it in two: each half (everything on the head, hair, eyes and all, cut flat
// down the middle by clamping its corners to the cut) falls away to its own side, and the body goes down without it, the
// neck pumping (NECK_PUMP, zombies/zombie-visuals.js). Each piece is clamped to its own plane a little further back
// from the cut (SPLIT_STEP), so no two flat faces lie on top of each other and flicker; over them the raw face of the cut
// is built out in layers, each standing proud of the one under it: the pale rim of the skull, the red meat inside it,
// the brain packed into the top with its folds, a row of teeth along the front and the dark of the throat below, with
// strings of gore hanging off the bottom
const CUT_M = [lam(0x7a1410), lam(0x4e0b08), lam(0xc9b8a0), lam(0xc98a86), lam(0x8e4a4a), lam(0xe8e0cc), lam(0xae6660)], DEAD_EYE = lam(0x2e1612);
CUT_M.concat(DEAD_EYE).forEach(m => { m.userData.mobile = true; });
const SPLIT_STEP = 0.0015;
// the face of any other cut (across, or on a slant), sized to where it really runs through the head (lo, hi: its extent,
// y and z in the cut's frame) and laid out by which way the top of the head is (up): the skull's rim and the meat
// filling it, the brain toward the top with its folds, lumps of it and clots over the meat, and gore hanging off the
// bottom edge. Every layer stands out its own distance from the cut, never two in one plane
function splitFace(cut, half, sd, lo, hi, up) {
  const cy = (lo[0] + hi[0]) / 2, cz = (lo[1] + hi[1]) / 2, h = Math.max(0.05, hi[0] - lo[0]), w = Math.max(0.05, hi[1] - lo[1]);
  const uy = up.y, uz = up.z, ul = Math.hypot(uy, uz) || 1, ty = uy / ul, tz = uz / ul;   // (the top, across the face)
  cut(w * 0.98, h * 0.98, 0.012, 2, 0.004, cy, cz);   // the skull's rim
  cut(w * 0.88, h * 0.88, 0.012, 0, 0.009, cy, cz);   // the meat
  const by = cy + ty * h * 0.16, bz = cz + tz * w * 0.12;
  cut(w * 0.6, h * 0.5, 0.012, 3, 0.015, by, bz);   // the brain
  for (let k = -1; k <= 1; k++) cut(w * (0.5 - Math.abs(k) * 0.1), 0.008, 0.006, 4, 0.026, by + k * h * 0.12, bz);   // its folds
  for (let k = 0; k < 3; k++) cut(rr(0.04, 0.07), rr(0.035, 0.05), 0.006, 6, k % 2 ? 0.018 : 0.021, by + rr(-0.3, 0.3) * h * 0.4, bz + rr(-0.3, 0.3) * w * 0.4);   // lumps of it
  for (let k = 0; k < 4; k++) cut(rr(0.03, 0.05), rr(0.03, 0.05), 0.004, 1, 0.012, cy + rr(-0.35, 0.35) * h, cz + rr(-0.35, 0.35) * w);   // clots over the meat
  for (let k = 0; k < 2; k++) { const len = rr(0.04, 0.09), hy = cy - ty * h * 0.48 - len / 2; box(half, 0.012, len, 0.014, CUT_M[k], -sd * rr(0.006, 0.012), hy, cz + rr(-0.3, 0.3) * w); }   // gore hanging off it
}
// the cut face, in the head's frame: [w (front to back), h, thickness, material, how far it stands out of the cut, y, z]
const CUT_LAYERS = [
  [0.3, 0.3, 0.012, 2, 0.004, 0, 0],                 // the skull's rim
  [0.27, 0.27, 0.012, 0, 0.009, -0.004, 0],          // the meat
  [0.2, 0.15, 0.012, 3, 0.015, 0.055, -0.01],        // the brain, up in the top of it
  [0.17, 0.008, 0.006, 4, 0.026, 0.085, -0.01],      // its folds, over the lumps of it (below)
  [0.15, 0.008, 0.006, 4, 0.026, 0.055, -0.02],
  [0.13, 0.008, 0.006, 4, 0.026, 0.025, -0.005],
  [0.1, 0.07, 0.008, 1, 0.014, -0.08, -0.02]         // the throat
];
// the ways a head's cut (SPLIT_CUT): the axe's straight down the middle front to back (v) or clean across through the
// eyes (h), a blade's on a slant from one temple down to the other side of the jaw (d, e). Each is a plane through the
// head, its normal (n) and a point on it (o), in the head's own frame
const SPLIT_CUT = { v: { n: [1, 0, 0], o: [0, 0, 0] }, h: { n: [0, 1, 0], o: [0, 0.02, 0] }, d: { n: [0.71, 0.71, 0], o: [0, 0, 0] }, e: { n: [-0.71, 0.71, 0], o: [0, 0, 0] } };
// how often a katana or machete that kills with a blow to the head takes it off on a slant (the rest, as before)
const SLANT_SPLIT = 0.45;
function splitHead(z, dx, dz, kind = 'v') {
  const head = z.m.head; if (!head || !z.limbs.head) return false;
  z.limbs.head = false; netRec('p', kind);
  head.updateWorldMatrix(true, true);
  const inv = head.matrixWorld.clone().invert(), wp = new V3(), wq = new THREE.Quaternion(), ws = new V3(), rel = new THREE.Matrix4(), mats = new Map();
  head.matrixWorld.decompose(wp, wq, ws);
  const pieces = []; head.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.visible) pieces.push(o); });
  // the cut's own frame: its x along the plane's normal, through the point on it, so the cut is always x = 0 there (and
  // straight down the middle that's the head's own frame, as it was)
  const C = SPLIT_CUT[kind] || SPLIT_CUT.v, cq = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), new V3(...C.n).normalize()), co = new V3(...C.o);
  const toCut = new THREE.Matrix4().compose(co, cq, new V3(1, 1, 1)).invert(), hq = wq.clone().multiply(cq);
  const across = new V3(1, 0, 0).applyQuaternion(hq), plain = kind === 'v';
  const up = new V3(0, 1, 0).applyQuaternion(cq.clone().invert());   // (the head's up, in the cut's frame)
  let lo = [9, 9], hi = [-9, -9];   // (how far the cut runs across the head: y and z in the cut's frame)
  [-1, 1].forEach(sd => {
    const half = new THREE.Group(); half.position.copy(co).multiply(ws).applyQuaternion(wq).add(wp).addScaledVector(across, sd * 0.03 * ws.x); half.quaternion.copy(hq); half.scale.copy(ws);   // (started a little apart, so the faces of the cut don't meet)
    pieces.forEach((o, k) => {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)).applyMatrix4(toCut);
      const a = g.attributes.position.array, c = 0.001 + k * SPLIT_STEP; let any = false;
      // (where the cut goes through it: every edge of every face that crosses it, once, before it's flattened)
      if (sd < 0 && !o.material.isMeshBasicMaterial) for (let i = 0; i < a.length; i += 9) for (const [p, q] of [[0, 3], [3, 6], [6, 0]]) {
        const x0 = a[i + p], x1 = a[i + q]; if ((x0 > 0) === (x1 > 0)) continue;
        const t = x0 / (x0 - x1), y = a[i + p + 1] + (a[i + q + 1] - a[i + p + 1]) * t, zz = a[i + p + 2] + (a[i + q + 2] - a[i + p + 2]) * t;
        lo[0] = Math.min(lo[0], y); lo[1] = Math.min(lo[1], zz); hi[0] = Math.max(hi[0], y); hi[1] = Math.max(hi[1], zz);
      }
      for (let i = 0; i < a.length; i += 3) { if (a[i] * sd > c) any = true; a[i] = sd > 0 ? Math.max(c, a[i]) : Math.min(-c, a[i]); }
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
    // the face of the cut, built out toward the other half (-sd); a layer's outer face is `out` from the cut
    const cut = (w, h, t, mi, out, y, zz) => box(half, t, h, w, CUT_M[mi], -sd * (out - t / 2), y, zz);
    if (plain) {
      CUT_LAYERS.forEach(L => cut(L[0], L[1], L[2], L[3], L[4], L[5], L[6]));
      for (let k = 0; k < 4; k++) cut(rr(0.05, 0.08), rr(0.04, 0.06), 0.006, 6, k % 2 ? 0.018 : 0.021, rr(0.03, 0.08), rr(-0.08, 0.06));   // the brain swelling out in lumps
      for (let k = 0; k < 5; k++) cut(rr(0.03, 0.06), rr(0.03, 0.06), 0.004, 1, 0.012, rr(-0.12, 0.0), rr(-0.12, 0.12));   // clots of dark blood over the meat
      for (let k = 0; k < 4; k++) cut(0.022, 0.03, 0.01, 5, 0.017, -0.105, 0.13 - k * 0.028);   // teeth along the front
      for (let k = 0; k < 2; k++) { const len = rr(0.05, 0.11); box(half, 0.012, len, 0.014, CUT_M[k], -sd * rr(0.006, 0.012), -0.13 - len / 2, rr(-0.08, 0.06)); }   // gore hanging off it
    } else if (hi[0] > lo[0]) splitFace(cut, half, sd, lo, hi, up);
    scene.add(half);
    // (cut clean across, the top's knocked off along the blow and the jaw drops where it was; otherwise each half off
    // to its own side)
    if (kind === 'h') gibs.push({ m: half, vx: dx * (sd > 0 ? rr(1.6, 2.6) : rr(0.2, 0.5)), vy: sd > 0 ? rr(2, 3) : rr(0.3, 0.9), vz: dz * (sd > 0 ? rr(1.6, 2.6) : rr(0.2, 0.5)), spin: sd > 0 ? rr(4, 8) : rr(1, 2), life: 9, landed: false });
    else gibs.push({ m: half, vx: across.x * sd * rr(1.4, 2.2) + dx * rr(0.6, 1.4), vy: rr(1.8, 2.8), vz: across.z * sd * rr(1.4, 2.2) + dz * rr(0.6, 1.4), spin: sd * rr(3, 6), life: 9, landed: false });
  });
  head.parent.remove(head); zFree(head); bloodZombie(z, 0.35);
  // the blood: a burst on along the blow and one off each side with the halves, a red mist where the head was, chunks of
  // brain and bone thrown out, and the ground painted both ways
  burst(wp.x, wp.y, wp.z, 24, 'blood', dx, dz, 4); burst(wp.x, wp.y + 0.1, wp.z, 12, 'blood', across.x, across.z, 3); burst(wp.x, wp.y + 0.1, wp.z, 12, 'blood', -across.x, -across.z, 3);
  burst(wp.x, wp.y + 0.15, wp.z, 10, 'blood', 0, 0, 1.2);   // straight up out of the neck
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28, sp = rr(0.5, 1.5); fx('mist', wp.x + Math.sin(a) * 0.06, wp.y + rr(-0.08, 0.1), wp.z + Math.cos(a) * 0.06, Math.sin(a) * sp + dx * 0.8, rr(-0.2, 0.6), Math.cos(a) * sp + dz * 0.8, rr(0.12, 0.2), rr(0.6, 1), rr(0.45, 0.75), 0.55); }
  for (let k = 0; k < 6; k++) {
    const sd = k % 2 ? 1 : -1, sp = rr(1, 2.6), c = new THREE.Mesh(CRUSH_G, k < 4 ? CUT_M[3] : CUT_M[2]);
    c.position.copy(wp); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.6, 1.2)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: across.x * sd * sp + dx * rr(0.5, 1.5), vy: rr(1.2, 3), vz: across.z * sd * sp + dz * rr(0.5, 1.5), spin: rr(8, 16), life: 6, landed: false });
  }
  spray(wp.x, wp.z, dx, dz, rr(1.3, 1.8), 1.4); spray(wp.x, wp.z, across.x, across.z, rr(0.9, 1.3), 1.4); spray(wp.x, wp.z, -across.x, -across.z, rr(0.9, 1.3), 1.4);
  splatLater(0.3, z.x + dx * 0.25, z.z + dz * 0.25, 'pool', rr(0.6, 0.8), undefined, 0.8);
  // the hit: a crack through the skull and a wet split under the blade's own sound, a hard shake and a jolt of zoom, the
  // view driven on along the blow, and your weapon and you spattered
  soundAt(z.x, z.z, () => { SFX.sever(); SFX.hitBlade(true); SFX.split(); });
  if (!NREP) { shake = Math.max(shake, 0.6); camPunch = Math.max(camPunch, 0.05); camKick.x += dx * 0.15; camKick.z += dz * 0.15; addBlood(0.05, 'axe', 0.15); run.heads++; run.limbs++; }
  return true;
}
// the sledgehammer coming down on a skull crushes it: the head caves in and bursts, gone in a spray of blood thrown
// out all round with chips of bone, scalp and brains, the blood raining down on the ground about the body, and the body
// drops without it, the neck still pumping as it falls (NECK_PUMP, zombies/zombie-visuals.js)
const CRUSH_G = new THREE.BoxGeometry(0.06, 0.03, 0.05), CRUSH_M = [lam(0xd8cdb6), lam(0x7a1410), lam(0x4e0b08), lam(0xc98a86)];
CRUSH_M.forEach(m => { m.userData.mobile = true; });
const NECK_PUMP = 2.6;
const HEAD_MIST = { n: 14, s0: [0.22, 0.34], s1: [0.8, 1.25], life: [1.3, 2.1] };
function crushHead(z, dx, dz) {
  const head = z.m.head; if (!head || !head.parent || !z.limbs.head) return false;
  z.limbs.head = false; netRec('c');
  head.getWorldPosition(_wB); const x = _wB.x, y = _wB.y, hz = _wB.z;
  head.parent.remove(head); zFree(head); bloodZombie(z, 0.4);
  // the burst: most of it driven on along the blow, the rest thrown out all round, and the head gone to a cloud of red
  // mist where it was (HEAD_MIST: how many puffs, how big they start and swell to, how long it hangs), pushed on a little
  // along the blow and sinking slowly as it thins
  burst(x, y, hz, 22, 'blood', dx, dz, 3);
  for (let k = 0; k < HEAD_MIST.n; k++) { const a = rand() * 6.28, sp = rr(0.2, 1.1), u = rand(); fx('redMist', x + Math.sin(a) * 0.1 * u, y + rr(-0.12, 0.12), hz + Math.cos(a) * 0.1 * u, Math.sin(a) * sp + dx * rr(0.4, 1.4), rr(-0.2, 0.7), Math.cos(a) * sp + dz * rr(0.4, 1.4), rr(HEAD_MIST.s0[0], HEAD_MIST.s0[1]), rr(HEAD_MIST.s1[0], HEAD_MIST.s1[1]), rr(HEAD_MIST.life[0], HEAD_MIST.life[1]), rr(0.7, 0.9)); }
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28 + rr(-0.3, 0.3); burst(x, y, hz, 4, 'blood', Math.sin(a), Math.cos(a), rr(2.5, 4.5)); }
  for (let k = 0; k < 8; k++) { const a = rand() * 6.28, sp = rr(0.6, 1.8); fx('mist', x + Math.sin(a) * 0.08, y + rr(-0.1, 0.1), hz + Math.cos(a) * 0.08, Math.sin(a) * sp + dx * 0.6, rr(-0.4, 0.6), Math.cos(a) * sp + dz * 0.6, rr(0.12, 0.2), rr(0.7, 1.1), rr(0.5, 0.8), 0.6); }
  // what's left of it: chips of skull, scalp in the zombie's own skin, brains and gore, tumbling off and bleeding as they go
  const scalp = lam(z.m.skinCol); scalp.userData.mobile = true;
  for (let k = 0; k < 10; k++) {
    const a = rand() * 6.28, sp = rr(1.2, 3.2), c = new THREE.Mesh(CRUSH_G, k < 2 ? scalp : CRUSH_M[k % 4]);
    c.position.set(x + rr(-0.06, 0.06), y + rr(-0.05, 0.05), hz + rr(-0.06, 0.06)); c.rotation.set(rr(0, 6), rr(0, 6), rr(0, 6)); c.scale.setScalar(rr(0.5, 1.3)); c.castShadow = true; scene.add(c);
    gibs.push({ m: c, vx: Math.sin(a) * sp + dx * rr(0.5, 1.5), vy: rr(1, 3.4), vz: Math.cos(a) * sp + dz * rr(0.5, 1.5), spin: rr(8, 16), life: 6, landed: false });
  }
  // the ground round it painted as it comes down: a heavy splash just past the body, sprays flung out every way (up the
  // walls too, from that height) and a ring of spatter, the further out the later
  splatLater(0.32, z.x + dx * 0.35, z.z + dz * 0.35, 'pool', rr(0.8, 1.0), undefined, 0.9);
  for (let k = 0; k < 5; k++) { const a = Math.atan2(dx, dz) + (k - 2) * 1.1 + rr(-0.3, 0.3); spray(x, hz, Math.sin(a), Math.cos(a), rr(0.9, 1.5) * (k === 2 ? 1.3 : 1), 1.6); }
  for (let k = 0; k < 12; k++) { const a = rand() * 6.28, d = rr(0.3, 1.8); splatLater(0.25 + d * rr(0.1, 0.18), z.x + Math.sin(a) * d, z.z + Math.cos(a) * d, 'drop', rr(0.25, 0.5)); }
  soundAt(z.x, z.z, () => SFX.crush()); if (!NREP) { shake = Math.max(shake, 0.5); run.heads++; }
  return true;
}
function pickPart(z, rel, side, D) {
  const head = Math.min(0.85, 0.14 + S.headBonus);
  let p;
  if (Math.abs(rel) > 0.6) p = side > 0 ? 'armR' : 'armL';
  else { const r = rand(); p = r < head ? 'head' : r < head + 0.22 ? (side > 0 ? 'legR' : 'legL') : 'torso'; }
  if (z.crawl && (p === 'legL' || p === 'legR')) p = 'torso';
  if (!z.limbs[p]) p = 'torso';
  return p;
}
// what of a zombie a shot meets at height y above the ground (null: it goes over it, or through where a lost limb was):
// the head up top, the body (or an arm out at the side, rel as for pickPart) in the middle, a leg below; a crawler only
// low down. For a shot whose height on its way is known: one gone through the zombie you aimed at, or one in front of
// it (weapons/firing.js), so a round through one's head goes on over the next one's, not into its legs
function partAt(z, y, rel, side) {
  const h = y / (z.T.scale || 1);
  if (z.crawl) return h < 0.62 ? (z.limbs.head && Math.abs(rel) < 0.4 && rand() < 0.35 ? 'head' : 'torso') : null;
  if (h > 1.82 || h < 0) return null;
  if (h > 1.4) return z.limbs.head ? 'head' : null;
  if (h > 0.78) { const arm = side > 0 ? 'armR' : 'armL'; return Math.abs(rel) > 0.6 ? (z.limbs[arm] ? arm : null) : 'torso'; }
  const leg = side > 0 ? 'legR' : 'legL'; return z.limbs[leg] ? leg : z.limbs[side > 0 ? 'legL' : 'legR'] && Math.abs(rel) < 0.3 ? (side > 0 ? 'legL' : 'legR') : null;
}
// set just before a scoped shot's hurtZombie when it lands a crit (weapons/firing.js), so the number shows it
let critNext = false, headNext = 1;   // the next hit's crit, and how much of its headshot bonus is left at that range (headFade, weapons/ammo.js)
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
// bleeding: how long a cut keeps bleeding (each new one starts it over), how hard a blade bleeds it (health a
// second), and the most flechettes can make it bleed however many land
const BLEED_T = 4, BLEED_R = 8, DART_BLEED_MAX = 12;
// in co-op the hit, and whatever it takes off or kills, goes to the other players as it happened here (netAct, net/sync.js)
// a leg shot that doesn't take the leg off slows it down: the worse its worst leg's been hurt, the slower it goes, down
// to LEG_SLOW.most of its pace (a brute, LEG_SLOW.brute); only a leg taken off (or the shin off it) puts it down crawling
const LEG_SLOW = { most: 0.5, brute: 0.25 };
function legSlow(z) {
  let h = 0; for (const L of ['legL', 'legR']) if (z.limbs[L]) h = Math.max(h, 1 - z.lhp[L] / (z.maxHp * 0.4));
  return 1 - clamp(h, 0, 1) * (z.type === 'brute' ? LEG_SLOW.brute : LEG_SLOW.most);
}
function hurtZombie(z, dmg, dx, dz, kb, wId, part) { return netAct(z, dx, dz, () => hurtZombie0(z, dmg, dx, dz, kb, wId, part)); }
function hurtZombie0(z, dmg, dx, dz, kb, wId, part) {
  const crit = critNext, headK = headNext; critNext = false; headNext = 1;
  if (z.dead) return false;
  const D = W(wId) || EFF[wId] || {};
  part = part || 'torso';
  if (part !== 'torso' && !z.limbs[part]) part = 'torso';
  if (S.lastStand && P.hp < S.maxHp * 0.3) dmg *= 1.6;
  if (S.momentum && run.time - S.momT < MOM_T) dmg *= 1 + 0.05 * S.momK;   // Momentum: +5% for each quick kill, up to 5
  if (z.crawl) dmg *= 1.75;   // a crawler is already half dead
  if (z.type === 'brute' && D.bruteX) dmg *= D.bruteX;   // the SCAR's heavy rounds (weapons/gun-stats.js)
  // a melee weapon hits for what it says every time: where it lands only decides what comes off (sever, below), never
  // the damage, so there are no random weak arm hits or headshot spikes. Bullets still count where they hit
  const dealt = dmg * (D.melee ? 1 : part === 'head' ? 1 + (headMulFor(D) - 1) * headK : partMult(part));
  hitFx(z, dealt, dx, dz, kb, wId, part, D);
  z.myDmg = (z.myDmg || 0) + dealt; z.myAt = run.time;   // (your share of it, for an assist in co-op: net/teamwork.js)
  dmgNumber(z, dealt, part === 'head' && !D.melee, PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1), crit);
  if (part !== 'torso' && part !== 'head') {
    const mul = (D.ammo === 'shells' && !D.dart ? 2.6 : D.melee ? 1 + (D.sever || 0) * 2 : 1) * S.severMul * (D.severX || 1);   // (hollow points: weapons/rounds.js)
    z.lhp[part] -= dmg * mul;
    // shot through below the elbow or knee, it's mostly just that much that goes first (zombies/wounds.js), and what's
    // left of the limb takes a little more
    if ((z.lhp[part] <= 0 || D.alwaysSever) && canSever(wId)) {
      if (!(z.cut && z.cut[part]) && !D.alwaysSever && rand() < 0.65 && severLower(z, part, dx, dz)) z.lhp[part] = z.maxHp * (part[0] === 'a' ? 0.12 : 0.16);
      else sever(z, part, dx, dz);
    }
  }
  // a serrated blade opens one steady bleed; flechettes stack it, each dart that lands bleeding it a little harder
  if (D.bleed === true) { z.bleed = Math.max(z.bleed, BLEED_T); z.bleedR = Math.max(z.bleedR || 0, BLEED_R); }
  else if (D.bleed) { z.bleed = Math.max(z.bleed, BLEED_T); z.bleedR = Math.min(DART_BLEED_MAX, (z.bleedR || 0) + D.bleed); }
  netHitRec(z, dealt, part, kb, wId);
  { const dd = Math.hypot(z.x - P.x, z.z - P.z);
    if (D.melee) addBlood(0.025 + (z.limbs[part] === false ? 0.04 : 0), wId, 0.08 + (D.sever ? 0.04 : 0));
    else if (dd < 2.6) addBlood(D.ammo === 'shells' ? 0.03 : 0.015, wId, 0.035); }
  if (z.hp <= 0) { killZombie(z, dx, dz, wId, part, -z.hp); return true; }
  soundAt(z.x, z.z, () => { SFX.tick(); if (part === 'head') SFX.headHit(); });
  return false;
}
// what a hit does to the body, whoever's it was: the health off it, the flash, the hole, the jolt, the blood, and the
// stagger and knockback (brutes shrug those off, but for the SCAR's stagger). A teammate's hits come through here too (net/sync.js)
function hitFx(z, dealt, dx, dz, kb, wId, part, D) {
  z.hp -= dealt; z.flash = 0.14; z.squash = 1;
  if (!D.melee && wId !== 'boom' && wId !== 'fire' && wId !== 'bleed' && (D.ammo !== 'shells' || rand() < 0.6)) shotWound(z, part, dx, dz, D, dealt, z.hp <= 0);   // the hole it leaves (zombies/wounds.js)
  zAnimHit(z, dx, dz, part, 0.45 + Math.min(1.1, dealt / 55));   // the body rocked by it (zombies/zombie-anim.js)
  bloodZombie(z, (D.melee ? 0.1 : D.ammo === 'shells' ? 0.08 : 0.05) * (part === 'head' ? 1.4 : 1) * (1 + Math.min(1, dealt / 80)));
  for (const o of zombies) if (o !== z && Math.abs(o.x - z.x) < 1.3 && Math.abs(o.z - z.z) < 1.3 && Math.hypot(o.x - z.x, o.z - z.z) < 1.2) bloodZombie(o, 0.025);
  if (z.type !== 'brute') { z.stagger = Math.max(part === 'head' ? 0.3 : part === 'legL' || part === 'legR' ? 0.35 : 0.18, D.stagger || 0); z.vx += dx * kb / z.T.scale; z.vz += dz * kb / z.T.scale; }   // (a slug or the SCAR rocks it for longer: D.stagger)
  else if (D.bruteStagger) z.stagger = Math.max(z.stagger, D.bruteStagger);   // (only the SCAR's rounds stop a brute, and break off its charge: zombies/brute-dash.js)
  const y = PART_Y[part] * z.T.scale * (z.crawl ? 0.4 : 1);
  burst(z.x, y, z.z, part === 'head' ? 9 : 6, 'blood', dx, dz, 3.2); hitMist(z.x, y, z.z, dx, dz, part === 'head', dealt);
  bloodSpurt(z.x, y, z.z, dx, dz, Math.round(clamp(5 + dealt / 6, 5, 16) * (part === 'head' ? 1.3 : 1)), 0.85 + Math.min(0.5, dealt / 120));   // gushing out of it (effects/particles.js)
  if (rand() < 0.7) spray(z.x, z.z, dx, dz, rr(0.6, 1.1));
}
// a zombie caught right in a blast comes apart: head, arms, legs and torso all thrown out and tumbling, a burst of
// blood and a red mist where it stood, and the ground round it painted
function blowApart(z, dx, dz) {
  const x = z.x, zz = z.z, y = 0.9 * z.T.scale;
  netRec('b'); const rec = NREC; NREC = null;   // (the others blow it apart their own way: just that it was)
  for (const part of ['head', 'armL', 'armR', 'legL', 'legR', 'torso']) {
    const a = Math.atan2(dx, dz) + rr(-1.4, 1.4), n0 = gibs.length;
    sever(z, part, Math.sin(a), Math.cos(a), true);
    for (let k = n0; k < gibs.length; k++) { const g = gibs[k]; g.vx *= 1.7; g.vz *= 1.7; g.vy += rr(1.5, 3.5); g.spin *= 1.5; }
  }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28; burst(x, y, zz, 5, 'blood', Math.sin(a), Math.cos(a), rr(4, 7)); }
  for (let k = 0; k < 7; k++) { const a = rand() * 6.28, sp = rr(0.8, 2.2); fx('mist', x + Math.sin(a) * 0.2, y + rr(-0.3, 0.3), zz + Math.cos(a) * 0.2, Math.sin(a) * sp, rr(0.2, 1.2), Math.cos(a) * sp, rr(0.3, 0.5), rr(1.2, 1.9), rr(0.7, 1.1), 0.75); }
  for (let k = 0; k < 6; k++) { const a = rand() * 6.28; spray(x, zz, Math.sin(a), Math.cos(a), rr(1.4, 2.6)); }
  for (let k = 0; k < 10; k++) { const a = rand() * 6.28, d = rr(0.4, 2.4); splatLater(0.15 + d * rr(0.12, 0.2), x + Math.sin(a) * d, zz + Math.cos(a) * d, 'drop', rr(0.3, 0.6)); }   // the further out, the longer in the air
  scene.remove(z.m.g); zFree(z.m.g); if (z.blob) scene.remove(z.blob);
  soundAt(x, zz, () => SFX.sever()); NREC = rec;
}
// Hoarder's odds of a doubled scrap drop, and Bullet time's: how likely a kill sets it off, how slow, how long, and the wait
// before it can go again
const HOARD_X = 0.25, BT = { chance: 0.2, to: 0.55, hold: 0.3, cd: 8 };
// Bullet time in co-op: time can't slow for you without slowing it for everyone, so the same kills give you a dead eye
// instead (P.eye), for BT_EYE.t seconds: every round goes exactly where you aim, even on the run, and every bullet or
// pellet that hits a zombie counts as a headshot (weapons/firing.js). Its glow fades over the last BT_EYE.fade seconds
const BT_EYE = { t: 3, fade: 0.6 };
const eyeK = () => clamp((P.eye || 0) / BT_EYE.fade, 0, 1);
// Momentum keeps building while each kill comes within MOM_T seconds of the last
const MOM_T = 2.5;
// how loud a kill is: every one sounds the skull bursting (SFX.headPop), from the zombie (killEnd)
const KILL_VOL = 0.5;
// (a kill that's not part of a hit, a burn or a bleed running out, is sent on its own in co-op)
function killZombie(z, dx, dz, wId, part, overkill) { return netAct(z, dx, dz, () => killZombie0(z, dx, dz, wId, part, overkill)); }
function killZombie0(z, dx, dz, wId, part, overkill) {
  if (z.dead) return;
  netRec('k', wId, part);
  killBegin(z, dx, dz);
  if (NREP) { teamAssist(z); return; }   // a teammate's kill: what it took off and how it fell come next in their message (net/sync.js); yours an assist if you'd hurt it (net/teamwork.js)
  run.kills++; popEl('kills');
  const D = W(wId) || EFF[wId] || {};
  // feeding (Iron stomach and on): only some kills, and only up to the wave's cap (FEED in upgrades/tier-table.js)
  if (S.healOnKill) { const f = FEED[S.healOnKill]; if ((S.feedUsed || 0) < f.cap && rand() < (part === 'head' ? f.ph : f.p) && P.hp < S.maxHp) { const h = Math.min(f.h, f.cap - (S.feedUsed || 0), S.maxHp - P.hp); P.hp += h; S.feedUsed = (S.feedUsed || 0) + h; floatText(P.x, P.z, '+' + Math.round(h), '#ef6a52'); } }
  if (S.adrenaline && !(P.adrCd > 0)) { P.adr = 1.2; P.adrCd = 4; }
  if (S.momentum) { S.momK = run.time - S.momT < MOM_T ? Math.min(5, S.momK + 1) : 1; S.momT = run.time; }   // a short burst, and not again for a few seconds
  // Bullet time: now and then a kill slows the world (you too) to BT.to for a moment, and not again for BT.cd seconds;
  // in co-op it gives you a dead eye instead (BT_EYE)
  if (S.bulletTime && (netLink() || timeScale > 0.8) && !(run.time < (S.btNext || 0)) && rand() < BT.chance) {
    S.btNext = run.time + BT.cd;
    if (netLink()) { P.eye = BT_EYE.t; SFX.upgrade(); } else { slowTo = BT.to; slowIn = 0.15; slowHold = BT.hold; }
  }
  const shells = D.ammo === 'shells' && !D.dart, heavy = (D.dmg || 0) >= 80 || wId === 'boom';
  // the sledgehammer crushes the head of whatever it kills, wherever the blow landed: it comes down from overhead
  // (and the fire axe often splits it: either leaves no head for the rest of this to take)
  const crushed = wId === 'sledge' && crushHead(z, dx, dz);
  // (the fire axe straight down through it or clean across it; a katana's or machete's edge often on a slant)
  const split = !crushed && part === 'head' && z.limbs.head && (wId === 'axe' ? rand() < 0.85 && splitHead(z, dx, dz, rand() < 0.5 ? 'v' : 'h') : (wId === 'katana' || wId === 'machete') && rand() < SLANT_SPLIT && splitHead(z, dx, dz, rand() < 0.5 ? 'd' : 'e'));
  if (part === 'head' && z.limbs.head) {
    // a blade or a blast takes the head off; a bullet mostly goes in one side and out the other and leaves it on
    // (zombies/wounds.js), though buckshot from close up or a big round can still take it
    const bullet = !D.melee && wId !== 'boom' && wId !== 'fire' && wId !== 'bleed', close = Math.hypot(z.x - P.x, z.z - P.z) < 3;
    const c = !canSever(wId) ? 0 : shells ? (close ? 0.45 : 0.1) : D.melee ? 0.4 + (D.sever || 0) * 0.4 : bullet ? (heavy ? 0.1 : 0) : 0.8;
    if (rand() < Math.min(1, c * S.severMul)) { sever(z, 'head', dx, dz); run.heads++; }
    else if (bullet) headShot(z, dx, dz);
  }
  const extra = !canSever(wId) ? 0 : wId === 'boom' ? 3 : shells ? (rand() < 0.65 ? 1 + (rand() < 0.4 ? 1 : 0) : 0) : heavy && rand() < 0.35 ? 1 : 0;
  for (let k = 0; k < extra; k++) {
    const opts = ['armL', 'armR', 'legL', 'legR', 'head'].filter(p => z.limbs[p] && (p !== 'head' || wId === 'boom' || rand() < 0.3)); if (!opts.length) continue;
    const p = pick(opts); if (p === 'head' || wId === 'boom' || (z.cut && z.cut[p]) || rand() < 0.4 || !severLower(z, p, dx, dz)) sever(z, p, dx, dz);   // a blast takes limbs whole; a shotgun often just the end of one
  }
  const force = wId === 'boom' ? 9 : shells ? 5.5 : D.melee ? 3.5 + (D.kb || 0) * 0.4 : 2.2 + (D.kick || 1) * 0.6;
  if (z.gib && wId === 'boom') blowApart(z, dx, dz);
  else { makeRagdoll(z, dx, dz, crushed || split ? 'crush' : part, force, wId); netRec('r', crushed || split ? 'crush' : part, Math.round(force * 100) / 100, crushed || split ? 1 : 0); if (crushed || split) ragdolls[ragdolls.length - 1].neck = NECK_PUMP; }
  killEnd(z);
  // a brute's drops are doubled: twice the scrap, and an ammo box, planks or bandages that hold twice as much
  const big = z.type === 'brute' ? 2 : 1;
  // scrap goes straight into yours, with the same odds and amounts it used to drop with (a brute always, others half
  // the time); Hoarder: a HOARD_X chance it's worth double
  if (rand() < (z.type === 'brute' ? 1 : 0.5)) { const hoard = S.hoard && rand() < HOARD_X; killScrap(z, ((z.type === 'brute' ? 3 : 1) + (rand() < 0.4 ? 1 : 0)) * big * (hoard ? 2 : 1), hoard); }
  if (rand() < (z.type === 'brute' ? 0.9 : 0.26) * S.dropMul) {
    // ammo is scarce: about half the ammo rolls come up empty, fewer of them for a kill made with a melee weapon (saving
    // rounds pays you back a little). Planks are the rarest roll, and the last 6.5% of the roll drops nothing, so a
    // plank comes off about one walker in 26 and bandages about one in 21; metal, once there's a metalwork bench
    // (barricades/metal-bars.js), a little less often than planks did (below METAL_DROP of the roll: one in 32)
    const r = rand(), opts = ammoTypes(), curA = gunAmmo(), mel = D.melee ? 0.15 : 0;
    if (r < 0.6) { if (opts.length && rand() < (z.type === 'brute' ? 0.7 : 0.5) + mel) ammoDrop(z.x, z.z, big); }
    else if (r < 0.75) { if (!METAL.on || r < METAL_DROP) dropPickup(z.x, z.z, 'planks', big); }
    else if (r < 0.935) dropPickup(z.x, z.z, 'med', big);
  }
}
// an ammo box for your guns: most often for the one in your hands
function ammoDrop(x, z, amount) { const opts = ammoTypes(), curA = gunAmmo(); if (opts.length) dropPickup(x, z, 'ammo', amount, curA && rand() < 0.6 ? curA : pick(opts)); }
// a kill's scrap, into yours there and then (only ever the killer's: a teammate's kill is played back without it,
// net/sync.js), shown rising off the body (the whole amount, marked (x2) and a brighter gold when Hoarder doubled it)
// and rolled into the counter
function killScrap(z, n, hoard) {
  S.scrap += n; feed('scrap', n, 'scrap'); popEl('scrap'); SFX.scrap();
  floatText(z.x, z.z, '+' + n + ' scrap' + (hoard ? ' (x2)' : ''), hoard ? '#ffd76a' : '#d4b25c');
}
// the start and the end of a kill, whoever made it: it's marked dead and its outlines go, blood flies off it onto those
// round it; then, after it's fallen (or come apart), it's off the list
function killBegin(z, dx, dz) {
  spitterDies(z);   // (a spitter's sac bursts: zombies/spitter.js)
  z.dead = true; if (z.dn) z.dn.el.classList.add('kill'); if (z.redOl) z.redOl.visible = false; if (z.lightOl) z.lightOl.visible = false; if (z.om) z.om.visible = false; if (z.reachOl) z.reachOl.visible = false; if (z.burnOl) z.burnOl.visible = false; if (z.xr) { z.xr.rim.visible = false; z.xr.fill.visible = false; if (z.xr.sil) z.xr.sil.visible = false; }
  for (const o of zombies) if (o !== z && Math.hypot(o.x - z.x, o.z - z.z) < 1.5) bloodZombie(o, 0.06);   // the spray off a kill
  burst(z.x, 0.9 * z.T.scale, z.z, 16, 'blood', dx, dz, 4); bloodSpurt(z.x, 0.95 * z.T.scale, z.z, dx, dz, 14, 1.25);
  spray(z.x, z.z, dx, dz, rr(0.6, 0.9) * z.T.scale);   // what the shot throws out
  shake = Math.max(shake, NREP ? 0.16 * clamp(1 - Math.hypot(z.x - P.x, z.z - P.z) / 14, 0, 1) : 0.16);
}
function killEnd(z) {
  const i = zombies.indexOf(z); if (i >= 0) zombies.splice(i, 1);
  if (z.id) NZ.delete(z.id);
  soundAt(z.x, z.z, () => SFX.headPop(KILL_VOL));   // every kill sounds the same: the skull bursting, from the zombie itself
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
