// Forest placement, instanced pines with shade pools, bushes and rocks.

const treeCells = [], TREES = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  if (cell[idx(i, j)]) continue;
  const d = Math.min(i, j, N - 1 - i, N - 1 - j);
  let p = d === 0 ? (nearGap(i, j, 1) ? 0 : 1) : d === 1 ? (nearGap(i, j, 2) ? 0 : .6) : d === 2 ? (nearGap(i, j, 3) ? 0 : .22) : 0;
  const inYard = i >= FX0 - 1 && i <= FX1 + 1 && j >= FZ0 - 1 && j <= FZ1 + 1;
  if (d > 2 && !inYard) p = 0.05;
  if (onRoad(cxw(i), cxw(j), 1.2)) p = 0;   // the drive out to the road stays clear, canopies and all (world/ground.js)
  if (rand() < p) { obstacle(i, j); treeCells.push([i, j]); }
}
{
  const n = treeCells.length, dm = new THREE.Object3D();
  const trunk = new THREE.InstancedMesh(flat(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6)), M.trunk, n);
  const c1 = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(1.05, 2.0, 7)), M.leaf, n);
  const c2 = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.75, 1.6, 7)), M.leaf2, n);
  const c3 = new THREE.InstancedMesh(flat(new THREE.ConeGeometry(0.45, 1.1, 6)), M.leaf, n);
  treeCells.forEach(([i, j], k) => {
    const s = rr(0.85, 1.4), x = cxw(i) + rr(-.2, .2), z = cxw(j) + rr(-.2, .2), r = rand() * 6;
    dm.rotation.set(rr(-.04, .04), r, rr(-.04, .04)); dm.scale.setScalar(s);
    TREES.push({ x, z, s });
    dm.position.set(x, 0.7 * s, z); dm.updateMatrix(); trunk.setMatrixAt(k, dm.matrix);
    dm.position.set(x, 1.9 * s, z); dm.updateMatrix(); c1.setMatrixAt(k, dm.matrix);
    dm.position.set(x, 2.8 * s, z); dm.updateMatrix(); c2.setMatrixAt(k, dm.matrix);
    dm.position.set(x, 3.6 * s, z); dm.updateMatrix(); c3.setMatrixAt(k, dm.matrix);
  });
  [trunk, c1, c2, c3].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  // a soft dark pool of shade under every tree
  const ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), n);
  treeCells.forEach(([i, j], k) => { const m4 = new THREE.Matrix4(); c1.getMatrixAt(k, m4); const p = new V3().setFromMatrixPosition(m4); dm.position.set(p.x, 0.015, p.z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(3.4 * (p.y / 1.9)); dm.updateMatrix(); ao.setMatrixAt(k, dm.matrix); });
  ao.renderOrder = 1; scene.add(ao);
  // bushes and rocks for texture
  const bushes = new THREE.InstancedMesh(flat(new THREE.IcosahedronGeometry(0.45, 0)), M.bush, 60), rocks = new THREE.InstancedMesh(flat(new THREE.DodecahedronGeometry(0.22, 0)), lam(0x6e6a62), 40);
  let nb = 0, nr = 0;
  for (let k = 0; k < 400 && (nb < 60 || nr < 40); k++) {
    const i = (rand() * N) | 0, j = (rand() * N) | 0; if (cell[idx(i, j)] !== EMPTY) continue;
    if (i >= HX0 - 1 && i <= HX1 + 1 && j >= HZ0 - 1 && j <= HZ1 + 2) continue;   // keep the house, its walls and the porch clear
    if (onRoad(cxw(i), cxw(j), 0.3)) continue;   // and the drive
    const nearFence = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(i + a, j + b) && (cell[idx(i + a, j + b)] === FENCE || cell[idx(i + a, j + b)] === WALL));
    if (nearFence && nb < 60 && rand() < 0.5) { dm.position.set(cxw(i) + rr(-.3, .3), 0.2, cxw(j) + rr(-.3, .3)); dm.rotation.set(rand(), rand() * 6, rand()); dm.scale.set(rr(.8, 1.4), rr(.6, 1), rr(.8, 1.4)); dm.updateMatrix(); bushes.setMatrixAt(nb++, dm.matrix); }
    else if (nr < 40 && rand() < 0.3) { dm.position.set(cxw(i) + rr(-.4, .4), 0.08, cxw(j) + rr(-.4, .4)); dm.rotation.set(rand(), rand() * 6, rand()); dm.scale.set(rr(.6, 1.4), rr(.4, .8), rr(.6, 1.4)); dm.updateMatrix(); rocks.setMatrixAt(nr++, dm.matrix); }
  }
  bushes.count = nb; rocks.count = nr;
  [bushes, rocks].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
}

// the woods go on past the edge of the farm: a ring of pines thinning out as it goes, with the trails the zombies come
// in by left clear in front of the gaps, and the drive and the main road cut through it (world/ground.js), fading into
// the haze (core/shaders.js) so the farm never just stops
{
  const R = 15, out = [], gapDir = GAPS.map(([i, j]) => ({ x: cxw(i), z: cxw(j), ax: i === 0 ? -1 : i === N - 1 ? 1 : 0, az: j === 0 ? -1 : j === N - 1 ? 1 : 0 }));
  const onTrail = (x, z) => gapDir.some(g => g.ax ? Math.sign(x - g.x) === g.ax && Math.abs(z - g.z) < 1.7 : Math.sign(z - g.z) === g.az && Math.abs(x - g.x) < 1.7);
  for (let z = -HALF - R; z < HALF + R; z += 1.05) for (let x = -HALF - R; x < HALF + R; x += 1.05) {
    const px = x + rr(-0.4, 0.4), pz = z + rr(-0.4, 0.4), d = Math.max(Math.abs(px), Math.abs(pz)) - HALF - 0.3;
    // nothing on the far side of the road either: that strip is nearer the camera, and its trees would stand in front of it
    if (d < 0 || onTrail(px, pz) || onRoad(px, pz, 1.6) || pz > ROAD.z) continue;
    if (rand() < 0.62 * Math.pow(1 - d / R, 0.5) + 0.12) out.push([px, pz, rr(0.85, 1.5)]);
  }
  const n = out.length, dm = new THREE.Object3D();
  const parts = [[new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6), M.trunk, 0.7], [new THREE.ConeGeometry(1.05, 2.0, 7), M.leaf, 1.9], [new THREE.ConeGeometry(0.75, 1.6, 7), M.leaf2, 2.8], [new THREE.ConeGeometry(0.45, 1.1, 6), M.leaf, 3.6]];
  parts.forEach(([geo, mat, y]) => {
    const im = new THREE.InstancedMesh(flat(geo), mat, n);
    out.forEach(([x, z, sc], k) => { dm.position.set(x, y * sc, z); dm.rotation.set(rr(-.04, .04), (x * 7.3 + z * 3.1) % 6.28, rr(-.04, .04)); dm.scale.setScalar(sc); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix); });
    im.receiveShadow = true; scene.add(im);
  });
}
