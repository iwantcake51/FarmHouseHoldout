// House footprint, the painted ground texture, the ground plane and grass tufts.

const HX0 = 16, HX1 = 27, HZ0 = 17, HZ1 = 26;
function groundTexture() {
  const S2 = 1024, c = document.createElement('canvas'); c.width = c.height = S2; const x = c.getContext('2d');
  const px = v => (v + HALF) / N * S2;
  x.fillStyle = '#56573e'; x.fillRect(0, 0, S2, S2);
  const blot = (cx, cy, r, rgb, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  for (let k = 0; k < 800; k++) blot(rand() * S2, rand() * S2, rr(8, 64), pick(['66,70,46', '98,98,62', '112,104,66', '58,64,42', '84,80,50']), rr(0.25, 0.6));
  for (let k = 0; k < 220; k++) blot(px(rr(cxw(HX0) - 2.5, cxw(HX1) + 2.5)), px(rr(cxw(HZ0) - 2.5, cxw(HZ1) + 2.5)), rr(10, 40), '104,88,64', rr(0.15, 0.45));
  const wob = z => Math.sin(z * 0.45) * 0.35;
  for (let z = cxw(HZ1) + 0.6; z < HALF; z += 0.2) blot(px(cxw(21) + wob(z) + rr(-0.5, 0.5)), px(z), rr(16, 30), '110,92,66', 0.55);
  x.strokeStyle = 'rgba(66,54,40,.55)'; x.lineWidth = 6;
  [-0.6, 0.6].forEach(o => { x.beginPath(); for (let z = cxw(HZ1) + 2; z < HALF; z += 0.25) x.lineTo(px(cxw(21) + o + wob(z)), px(z)); x.stroke(); });
  // trampled paths to the fence gaps
  [[cxw(21), cxw(HZ0) - 1, cxw(21.5), cxw(11)], [cxw(HX0) - 1, cxw(21), cxw(10), cxw(21.5)], [cxw(HX1) + 1, cxw(22), cxw(33), cxw(21.5)]].forEach(([a, b, c2, d]) => { for (let t = 0; t <= 1; t += 0.03) blot(px(a + (c2 - a) * t + rr(-.3, .3)), px(b + (d - b) * t + rr(-.3, .3)), rr(8, 16), '96,84,60', 0.35); });
  const img = x.getImageData(0, 0, S2, S2), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rand() - 0.5) * 6; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.anisotropy = R.capabilities.getMaxAnisotropy(); return t;
}
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(N, N), lam(0xffffff, { map: groundTexture() })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), M.groundFar); far.rotation.x = -Math.PI / 2; far.position.y = -0.02; scene.add(far);
  const tufts = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.09, 0.34, 4)), windy(lam(0x6b6c47), 0.32), 1300), dm = new THREE.Object3D();
  const tufts2 = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.07, 0.42, 3)), windy(lam(0x7d7a4c), 0.32), 500);
  let k2 = 0;
  for (let k = 0; k < 1300; k++) {
    let x, z; do { x = rr(-HALF, HALF); z = rr(-HALF, HALF); } while (x > cxw(HX0) - 0.8 && x < cxw(HX1) + 0.8 && z > cxw(HZ0) - 0.8 && z < cxw(HZ1) + 1.9);
    dm.position.set(x, 0.15, z); dm.rotation.set(rr(-.3, .3), rand() * 6, rr(-.3, .3)); dm.scale.setScalar(rr(.6, 1.5)); dm.updateMatrix(); tufts.setMatrixAt(k, dm.matrix);
    if (k2 < 500 && rand() < 0.4) { dm.position.x += 0.12; dm.scale.setScalar(rr(.7, 1.3)); dm.updateMatrix(); tufts2.setMatrixAt(k2++, dm.matrix); }
  }
  tufts2.count = k2;
  tufts.receiveShadow = tufts2.receiveShadow = true; scene.add(tufts, tufts2);
}
