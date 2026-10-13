// Blood that builds up on you and your weapons.

// ---- blood that builds up on you and your weapons: each splotch shows once the blood level passes its threshold ----
const BLOOD_M = [lam(0x6e1510), lam(0x4e0e0b), lam(0x5c120e)], UBOX = new THREE.BoxGeometry(1, 1, 1);
function bloodSpot(parent, x, y, z, nx, ny, nz, sz) {
  const m = new THREE.Mesh(UBOX, pick(BLOOD_M)), w = sz * rr(0.6, 1.4), h = sz * rr(0.6, 1.4), t = 0.01;
  m.scale.set(nx ? t : w, ny ? t : h, nz ? t : (nx ? w : h)); m.position.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004);
  m.visible = false; m.userData.th = rand(); parent.add(m); return m;
}
const charBlood = [];
for (let k = 0; k < 9; k++) charBlood.push(bloodSpot(PM.torso, rr(-0.2, 0.2), rr(-0.25, 0.25), 0.151, 0, 0, 1, rr(0.07, 0.15)));
for (let k = 0; k < 3; k++) charBlood.push(bloodSpot(PM.torso, rr(-0.2, 0.2), 0.301, rr(-0.1, 0.12), 0, 1, 0, rr(0.06, 0.12)));
for (let k = 0; k < 2; k++) charBlood.push(bloodSpot(PM.torso, k ? 0.251 : -0.251, rr(-0.2, 0.2), rr(-0.1, 0.1), k ? 1 : -1, 0, 0, rr(0.06, 0.12)));
[PM.armL, PM.armR].forEach(a => { for (let k = 0; k < 4; k++) charBlood.push(bloodSpot(a, rr(-0.04, 0.04), 0.071, rr(0.12, 0.52), 0, 1, 0, rr(0.05, 0.09))); charBlood.push(bloodSpot(a, 0, 0, 0.541, 0, 0, 1, 0.08)); });
[PM.legL, PM.legR].forEach(l => { for (let k = 0; k < 3; k++) charBlood.push(bloodSpot(l, rr(-0.06, 0.06), rr(-0.5, -0.08), 0.111, 0, 0, 1, rr(0.06, 0.11))); });
for (let k = 0; k < 2; k++) charBlood.push(bloodSpot(PM.head, rr(-0.1, 0.1), rr(-0.12, 0.02), 0.161, 0, 0, 1, rr(0.04, 0.08)));
charBlood.sort((a, b) => a.userData.th - b.userData.th).forEach((m, k, arr) => { m.userData.th = (k + 0.5) / arr.length; });
// spatter a built weapon: melee weapons get it on the head of the weapon, guns towards the muzzle. Either way the splats
// are found by casting rays at the weapon's real surface, so they sit on the steel and the wood, never out in the air
// round its bounding box.
function bloodWeapon(g, melee) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
  g.traverse(o => { if (!bloodable(o)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); rel.multiplyMatrices(inv, o.matrixWorld); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel)); });
  if (bb.isEmpty()) return [];
  return melee ? bloodMelee(g, bb, inv) : bloodGun(g, bb, inv);
}
// the solid parts blood can land on (not outlines, the muzzle flash or see-through glass and beams)
const bloodable = o => o.isMesh && !o.userData.isOutline && !o.userData.isFlash && !(o.material && o.material.transparent);
const BLOOD_FRESH = lam(0x8a1a12), DISC = new THREE.CylinderGeometry(1, 1, 1, 12), _bY = new V3(0, 1, 0);
// rays at a weapon's surface and flat blood discs laid on it, in the weapon's own frame (local)
function bloodKit(g, inv) {
  const meshes = [], rc = new THREE.Raycaster(), t = new V3(), x = new V3(), mx = new THREE.Matrix4(), nInv = new THREE.Matrix3().getNormalMatrix(inv), wo = new V3(), wd = new V3();
  g.traverse(m => { if (bloodable(m)) meshes.push(m); });
  // one flat disc lying on the surface at p, facing nn; stretched along the surface's downhill line for a drip
  const disc = (list, p, nn, w, len, lift, mat, slide) => {
    t.copy(_bY).negate().addScaledVector(nn, nn.y); if (t.lengthSq() < 0.02) t.set(0, 0, 1).addScaledVector(nn, -nn.z); t.normalize();
    x.crossVectors(nn, t); mx.makeBasis(x, nn, t);
    const m = new THREE.Mesh(DISC, mat); m.quaternion.setFromRotationMatrix(mx); m.scale.set(w, 0.0016, len);
    m.position.copy(p).addScaledVector(nn, 0.0012 + lift).addScaledVector(t, slide || 0); m.visible = false; g.add(m); list.push(m); return m;
  };
  // is the weapon's surface really there at p, facing nn? Droplets and drips that would hang off an edge are dropped
  const _a = new V3(), _b = new V3(), onSurf = (p, nn) => {
    _a.copy(p).addScaledVector(nn, 0.03).applyMatrix4(g.matrixWorld); _b.copy(p).applyMatrix4(g.matrixWorld);
    const dist = _a.distanceTo(_b); rc.set(_a, _b.sub(_a).normalize()); rc.far = dist * 1.6;
    const h = rc.intersectObjects(meshes, false)[0]; rc.far = Infinity; return !!h && Math.abs(h.distance - dist) < dist * 0.25;
  };
  // the first surface a ray from o along d meets: where, and which way it faces
  const cast = (o, d) => {
    rc.set(wo.copy(o).applyMatrix4(g.matrixWorld), wd.copy(d).transformDirection(g.matrixWorld));
    const h = rc.intersectObjects(meshes, false)[0]; if (!h || !h.face) return null;
    return { p: h.point.clone().applyMatrix4(inv), n: h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).applyMatrix3(nInv).normalize() };
  };
  // a splat at p: a round blob, a wetter centre, a few droplets thrown off round it and sometimes a drip running down
  const splat = (p, nn, r, drip) => {
    const list = [];
    disc(list, p, nn, r * rr(0.8, 1.2), r * rr(0.8, 1.3), 0, pick(BLOOD_M));
    disc(list, p, nn, r * 0.55, r * 0.5, 0.0004, BLOOD_FRESH, -r * 0.15);
    for (let s = 0, ns = 1 + (rand() * 3 | 0); s < ns; s++) {
      const a = rand() * 6.28, dd = r * rr(1.3, 2.2), side = new V3().crossVectors(nn, _bY); if (side.lengthSq() < 0.01) side.set(1, 0, 0); side.normalize();
      const up = new V3().crossVectors(side, nn).normalize(), q = p.clone().addScaledVector(side, Math.cos(a) * dd).addScaledVector(up, Math.sin(a) * dd);
      const rs = r * rr(0.18, 0.35); if (onSurf(q, nn)) disc(list, q, nn, rs, rs, 0.0002 * s, pick(BLOOD_M));
    }
    if (drip && rand() < 0.5 && Math.abs(nn.y) < 0.35) {   // a drip, on faces steep enough to run, and only as far as the face goes
      const dl = r * rr(1.6, 3.4), m = disc(list, p, nn, r * rr(0.22, 0.32), dl, 0.0006, pick(BLOOD_M), dl * 0.75);
      const run = m.position.clone().sub(p); run.addScaledVector(nn, -nn.dot(run)).normalize();   // downhill along the face
      if (!onSurf(p.clone().addScaledVector(run, dl * 1.7), nn)) { g.remove(m); list.pop(); }
    }
    return list;
  };
  return { cast, splat };
}
// spots sorted into the order they show as the blood builds up (lowest threshold first)
function bloodOrder(clusters) {
  const spots = [];
  clusters.sort((a, b) => a.th - b.th).forEach((c, k) => c.list.forEach(m => { m.userData.th = (k + 0.5) / clusters.length; spots.push(m); }));
  return spots;
}
// guns (barrel along +z): splats on the front half, mostly on the sides and some on top; the ones nearest the muzzle
// show first, so the blood creeps back along the gun as it builds up
function bloodGun(g, bb, inv) {
  const { min, max } = bb, len = max.z - min.z, kit = bloodKit(g, inv), clusters = [], o = new V3(), d = new V3();
  for (let k = 0; k < 50 && clusters.length < 9; k++) {
    const fz = 1 - Math.pow(rand(), 1.6) * 0.6, z = min.z + len * fz, f = rand();
    if (f < 0.68) { const sd = rand() < 0.5 ? -1 : 1; o.set(sd > 0 ? max.x + 0.3 : min.x - 0.3, rr(min.y, max.y), z); d.set(-sd, 0, 0); }
    else { o.set(rr(min.x, max.x), max.y + 0.3, z); d.set(0, -1, 0); }
    const hit = kit.cast(o, d); if (!hit) continue;
    const muzzle = clamp((hit.p.z - min.z) / Math.max(0.01, len), 0, 1);
    clusters.push({ th: clamp(1 - muzzle + rr(-0.2, 0.2), 0.01, 0.99), list: kit.splat(hit.p, hit.n, rr(0.008, 0.017), true) });
  }
  return bloodOrder(clusters);
}
// melee weapons (handle down along +y, striking edge toward +z): splats over the striking end, mostly on the flat
// sides, some straight onto the edge and a few onto the top of the head. The ones nearest the edge and the tip show
// first, so the blood creeps down the weapon as it builds up.
function bloodMelee(g, bb, inv) {
  const { min, max } = bb, L = max.y - min.y, kit = bloodKit(g, inv), clusters = [], o = new V3(), d = new V3();
  for (let k = 0; k < 70 && clusters.length < 20; k++) {
    const fy = 1 - Math.pow(rand(), 2) * 0.48, y = min.y + L * fy, f = rand();
    if (f < 0.72) { const sd = rand() < 0.5 ? -1 : 1; o.set(sd > 0 ? max.x + 0.3 : min.x - 0.3, y, rr(min.z, max.z)); d.set(-sd, 0, 0); }
    else if (f < 0.92) { o.set(rr(min.x, max.x), y, max.z + 0.3); d.set(0, 0, -1); }
    else { o.set(rr(min.x, max.x) * 0.6, max.y + 0.3, rr(min.z, max.z) * 0.8); d.set(0, -1, 0); }
    const hit = kit.cast(o, d); if (!hit) continue;
    const edge = clamp((hit.p.z - min.z) / Math.max(0.01, max.z - min.z), 0, 1), tip = (fy - 0.52) / 0.48;
    clusters.push({ th: clamp(1 - (0.55 * tip + 0.45 * edge) + rr(-0.18, 0.18), 0.01, 0.99), list: kit.splat(hit.p, hit.n, rr(0.011, 0.026), true) });
  }
  return bloodOrder(clusters);
}
function addBlood(char, wId, wAmt) {
  P.blood = Math.min(1, (P.blood || 0) + char);
  if (wId && wAmt) W8.bloodW[wId] = Math.min(1, (W8.bloodW[wId] || 0) + wAmt);
}
