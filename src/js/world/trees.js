// Forest placement, instanced pines with shade pools, bushes and rocks.

const treeCells = [], TREES = [];
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  if (cell[idx(i, j)]) continue;
  const d = Math.min(i, j, N - 1 - i, N - 1 - j);
  let p = d === 0 ? (nearGap(i, j, 1) ? 0 : 1) : d === 1 ? (nearGap(i, j, 2) ? 0 : .6) : d === 2 ? (nearGap(i, j, 3) ? 0 : .22) : 0;
  const inYard = i >= FX0 - 1 && i <= FX1 + 1 && j >= FZ0 - 1 && j <= FZ1 + 1;
  if (d > 2 && !inYard) p = 0.05;
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
    const nearFence = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(i + a, j + b) && (cell[idx(i + a, j + b)] === FENCE || cell[idx(i + a, j + b)] === WALL));
    if (nearFence && nb < 60 && rand() < 0.5) { dm.position.set(cxw(i) + rr(-.3, .3), 0.2, cxw(j) + rr(-.3, .3)); dm.rotation.set(rand(), rand() * 6, rand()); dm.scale.set(rr(.8, 1.4), rr(.6, 1), rr(.8, 1.4)); dm.updateMatrix(); bushes.setMatrixAt(nb++, dm.matrix); }
    else if (nr < 40 && rand() < 0.3) { dm.position.set(cxw(i) + rr(-.4, .4), 0.08, cxw(j) + rr(-.4, .4)); dm.rotation.set(rand(), rand() * 6, rand()); dm.scale.set(rr(.6, 1.4), rr(.4, .8), rr(.6, 1.4)); dm.updateMatrix(); rocks.setMatrixAt(nr++, dm.matrix); }
  }
  bushes.count = nb; rocks.count = nr;
  [bushes, rocks].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
}
