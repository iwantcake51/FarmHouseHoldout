// House footprint, the painted ground texture, the ground plane and grass tufts; past the farm's edge, the ground and grass
// going on into the haze, the drive carried on out, and the main road it meets.

const HX0 = 16, HX1 = 27, HZ0 = 17, HZ1 = 26;
// the dirt drive out the front of the house: painted into the farm's ground texture inside the map, then carried on past
// its edge by a strip of its own to the main road, which runs across in front of the farm out in the fog. Trees, grass
// and rocks keep off both (onRoad, also world/trees.js); m widens the margin
const ROAD = { x: z => cxw(21) + Math.sin(z * 0.45) * 0.35, z0: cxw(HZ1) + 0.6, z: HALF + 7.5, w: 5.4 };
const onRoad = (x, z, m) => Math.abs(z - ROAD.z) < ROAD.w / 2 + 0.8 + m || (z > ROAD.z0 && z < ROAD.z && Math.abs(x - ROAD.x(z)) < 1.3 + m);
function groundTexture() {
  const S2 = 1024, c = document.createElement('canvas'); c.width = c.height = S2; const x = c.getContext('2d');
  const px = v => (v + HALF) / N * S2;
  x.fillStyle = '#56573e'; x.fillRect(0, 0, S2, S2);
  const blot = (cx, cy, r, rgb, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  for (let k = 0; k < 800; k++) blot(rand() * S2, rand() * S2, rr(8, 64), pick(['66,70,46', '98,98,62', '112,104,66', '58,64,42', '84,80,50']), rr(0.25, 0.6));
  for (let k = 0; k < 220; k++) blot(px(rr(cxw(HX0) - 2.5, cxw(HX1) + 2.5)), px(rr(cxw(HZ0) - 2.5, cxw(HZ1) + 2.5)), rr(10, 40), '104,88,64', rr(0.15, 0.45));
  for (let z = ROAD.z0; z < HALF; z += 0.2) blot(px(ROAD.x(z) + rr(-0.5, 0.5)), px(z), rr(16, 30), '110,92,66', 0.55);
  x.strokeStyle = 'rgba(66,54,40,.55)'; x.lineWidth = 6;
  [-0.6, 0.6].forEach(o => { x.beginPath(); for (let z = cxw(HZ1) + 2; z <= HALF + 0.25; z += 0.25) x.lineTo(px(ROAD.x(z) + o), px(z)); x.stroke(); });
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
    let x, z; do { x = rr(-HALF, HALF); z = rr(-HALF, HALF); } while ((x > cxw(HX0) - 0.8 && x < cxw(HX1) + 0.8 && z > cxw(HZ0) - 0.8 && z < cxw(HZ1) + 1.9) || onRoad(x, z, -0.3));
    dm.position.set(x, 0.15, z); dm.rotation.set(rr(-.3, .3), rand() * 6, rr(-.3, .3)); dm.scale.setScalar(rr(.6, 1.5)); dm.updateMatrix(); tufts.setMatrixAt(k, dm.matrix);
    if (k2 < 500 && rand() < 0.4) { dm.position.x += 0.12; dm.scale.setScalar(rr(.7, 1.3)); dm.updateMatrix(); tufts2.setMatrixAt(k2++, dm.matrix); }
  }
  tufts2.count = k2;
  tufts.receiveShadow = tufts2.receiveShadow = true; scene.add(tufts, tufts2);
  // the grass goes on past the edge of the farm, thinning out over 16 m as it fades into the haze (core/shaders.js)
  const OG = 16, n1 = 1300, oA = new THREE.InstancedMesh(tufts.geometry, tufts.material, n1), oB = new THREE.InstancedMesh(tufts2.geometry, tufts2.material, 520);
  let a = 0, b = 0;
  for (let k = 0; k < 4200 && a < n1; k++) {
    const x = rr(-HALF - OG, HALF + OG), z = rr(-HALF - OG, HALF + OG), d = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (d < 0 || rand() > Math.pow(1 - d / OG, 1.3) || onRoad(x, z, 0.2)) continue;
    dm.position.set(x, 0.15, z); dm.rotation.set(rr(-.3, .3), rand() * 6, rr(-.3, .3)); dm.scale.setScalar(rr(.6, 1.5)); dm.updateMatrix(); oA.setMatrixAt(a++, dm.matrix);
    if (b < 520 && rand() < 0.4) { dm.position.x += 0.12; dm.scale.setScalar(rr(.7, 1.3)); dm.updateMatrix(); oB.setMatrixAt(b++, dm.matrix); }
  }
  oA.count = a; oB.count = b;
  oA.receiveShadow = oB.receiveShadow = true; scene.add(oA, oB);
}
// ---- past the edge of the farm ----
{
  const OUT = 104, aniso = R.capabilities.getMaxAnisotropy();
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  // the ground out there: the field's colour where it meets the farm, darkening into the woods' floor further out, so
  // the edge of the map never shows as a line. It lies just under the farm's own ground (hidden where they overlap)
  {
    const S2 = 512, [c, x] = canvas(S2, S2), px = v => (v + OUT / 2) / OUT * S2;
    x.fillStyle = '#2b2c24'; x.fillRect(0, 0, S2, S2);
    for (let e = 14; e >= 0; e -= 0.5) { x.fillStyle = `rgba(86,87,62,${e > 9 ? 0.05 : 0.12})`; x.fillRect(px(-HALF - e), px(-HALF - e), px(HALF + e) - px(-HALF - e), px(HALF + e) - px(-HALF - e)); }
    for (let k = 0; k < 900; k++) {
      const bx = rr(-OUT / 2, OUT / 2), bz = rr(-OUT / 2, OUT / 2), d = Math.max(Math.abs(bx), Math.abs(bz)) - HALF; if (d < -1) continue;
      const g = x.createRadialGradient(px(bx), px(bz), 0, px(bx), px(bz), rr(2, 12)), a = rr(0.15, 0.45) * clamp(1 - d / 20, 0.15, 1);
      const col = pick(['66,70,46', '98,98,62', '112,104,66', '58,64,42', '84,80,50']); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(px(bx) - 12, px(bz) - 12, 24, 24);
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(OUT, OUT), lam(0xffffff, { map: t })); m.rotation.x = -Math.PI / 2; m.position.y = -0.012; m.receiveShadow = true; scene.add(m);
  }
  // the main road: old two-lane blacktop, cracked and patched, with a faded yellow dash down the middle, worn white edge
  // lines and gravel shoulders feathering off into the grass. One 16 m stretch is drawn and repeats along the road
  {
    const RL = 170, W = ROAD.w + 1.6, [c, x] = canvas(512, 128), py = m => (m + W / 2) / W * 128, pu = m => m / 16 * 512;
    const grav = (y0, y1, a0, a1) => { const g = x.createLinearGradient(0, py(y0), 0, py(y1)); g.addColorStop(0, `rgba(104,96,80,${a0})`); g.addColorStop(1, `rgba(104,96,80,${a1})`); x.fillStyle = g; x.fillRect(0, py(y0), 512, py(y1) - py(y0)); };
    grav(-W / 2, -ROAD.w / 2, 0, 0.9); grav(ROAD.w / 2, W / 2, 0.9, 0);
    x.fillStyle = 'rgba(60,58,54,1)'; x.fillRect(0, py(-ROAD.w / 2), 512, py(ROAD.w / 2) - py(-ROAD.w / 2));
    for (let k = 0; k < 260; k++) { x.fillStyle = `rgba(${pick(['40,39,36', '78,74,66', '52,50,46'])},${rr(0.15, 0.4)})`; const w = rr(4, 40); x.fillRect(rand() * 512, py(rr(-ROAD.w / 2, ROAD.w / 2 - 0.3)), w, rr(2, 10)); }   // patches and wear
    for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(${pick(['104,96,80', '84,78,66'])},0.8)`; x.fillRect(rand() * 512, py(pick([-1, 1]) * rr(ROAD.w / 2 - 0.25, ROAD.w / 2)), rr(2, 8), rr(1, 3)); }   // gravel spilled onto the edges
    x.strokeStyle = 'rgba(28,27,25,.75)'; x.lineWidth = 1.2;   // cracks
    for (let k = 0; k < 26; k++) { let u = rand() * 512, v = py(rr(-ROAD.w / 2, ROAD.w / 2)); x.beginPath(); x.moveTo(u, v); for (let s = 0; s < 6; s++) { u += rr(-14, 14); v += rr(-7, 7); x.lineTo(u, v); } x.stroke(); }
    x.fillStyle = 'rgba(210,206,190,.28)'; [-1, 1].forEach(s => x.fillRect(0, py(s * (ROAD.w / 2 - 0.3)) - 1.5, 512, 3));
    x.fillStyle = 'rgba(214,170,60,.5)'; [0, 8].forEach(u => x.fillRect(pu(u + 0.5), py(0) - 1.5, pu(3), 3));
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(RL / 16, 1); t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RL, W), lam(0xffffff, { map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, -0.006, ROAD.z); m.receiveShadow = true; scene.add(m);
  }
  // the drive carried on from the farm's edge to the road: the same dirt and wheel ruts as inside, running on into the
  // gravel at the blacktop's edge
  {
    const [c, x] = canvas(128, 128), W = 2.9, pu = m => (m / W + 0.5) * 128;
    // dirt patches, drawn wrapped top to bottom so the tile repeats along the drive without a seam
    for (let k = 0; k < 160; k++) { const u = pu(rr(-0.75, 0.75)), v0 = rand() * 128, r = rr(14, 26); [v0 - 128, v0, v0 + 128].forEach(v => { const g = x.createRadialGradient(u, v, 0, u, v, r); g.addColorStop(0, 'rgba(110,92,66,.55)'); g.addColorStop(1, 'rgba(110,92,66,0)'); x.fillStyle = g; x.fillRect(u - 26, v - 26, 52, 52); }); }
    x.fillStyle = 'rgba(66,54,40,.55)'; [-0.6, 0.6].forEach(o => x.fillRect(pu(o) - 5, 0, 10, 128));
    const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    const z0 = HALF, z1 = ROAD.z - ROAD.w / 2 + 0.2, n = Math.ceil((z1 - z0) / 0.25), pos = [], uv = [], ix = [];
    for (let k = 0; k <= n; k++) {
      const z = z0 + (z1 - z0) * k / n, cx = ROAD.x(z), hw = W / 2;
      pos.push(cx - hw, 0, z, cx + hw, 0, z); uv.push(0, (z - z0) / 2.9, 1, (z - z0) / 2.9);
      if (k) { const a = (k - 1) * 2; ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
    const m = new THREE.Mesh(g, lam(0xffffff, { map: t, transparent: true, depthWrite: false })); m.position.y = -0.004; m.receiveShadow = true; scene.add(m);
  }
}
