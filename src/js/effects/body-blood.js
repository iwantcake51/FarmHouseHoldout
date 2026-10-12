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
// spatter a built weapon: melee weapons get it on the head of the weapon, guns towards the muzzle
function bloodWeapon(g, melee) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), bb = new THREE.Box3(), tb = new THREE.Box3(), rel = new THREE.Matrix4();
  g.traverse(o => { if (!o.isMesh || o.userData.isOutline) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); rel.multiplyMatrices(inv, o.matrixWorld); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(rel)); });
  if (bb.isEmpty()) return [];
  const spots = [], { min, max } = bb, n = melee ? 14 : 8;
  for (let k = 0; k < n; k++) {
    const side = rand() < 0.5 ? -1 : 1;
    if (melee) {   // handle-down along +y
      const y = rr(min.y + (max.y - min.y) * 0.5, max.y), f = rand();
      if (f < 0.45) spots.push(bloodSpot(g, side > 0 ? max.x : min.x, y, rr(min.z, max.z) * 0.8, side, 0, 0, rr(0.025, 0.06)));
      else if (f < 0.9) spots.push(bloodSpot(g, rr(min.x, max.x) * 0.8, y, side > 0 ? max.z : min.z, 0, 0, side, rr(0.025, 0.06)));
      else spots.push(bloodSpot(g, rr(min.x, max.x) * 0.7, max.y, rr(min.z, max.z) * 0.7, 0, 1, 0, rr(0.03, 0.05)));
    } else {       // barrel along +z
      const z = rr(min.z + (max.z - min.z) * 0.45, max.z);
      if (rand() < 0.6) spots.push(bloodSpot(g, side > 0 ? max.x : min.x, rr(min.y, max.y), z, side, 0, 0, rr(0.02, 0.045)));
      else spots.push(bloodSpot(g, rr(min.x, max.x), max.y, z, 0, 1, 0, rr(0.02, 0.04)));
    }
  }
  spots.sort((a, b) => a.userData.th - b.userData.th).forEach((m, k) => { m.userData.th = (k + 0.5) / spots.length; });
  return spots;
}
function addBlood(char, wId, wAmt) {
  P.blood = Math.min(1, (P.blood || 0) + char);
  if (wId && wAmt) W8.bloodW[wId] = Math.min(1, (W8.bloodW[wId] || 0) + wAmt);
}
