// Yard fence with gaps, and the map-edge spawn gaps.

// ---- fence round the yard, with gaps zombies funnel through ----
const FX0 = 10, FX1 = 33, FZ0 = 11, FZ1 = 33;
const fenceGap = (i, j) => (j === FZ1 && i >= 20 && i <= 22) || (j === FZ0 && i >= 21 && i <= 22) || (i === FX0 && j >= 21 && j <= 22) || (i === FX1 && j >= 21 && j <= 22);
{
  const posts = [], rails = [];
  for (let j = FZ0; j <= FZ1; j++) for (let i = FX0; i <= FX1; i++) {
    if (!(i === FX0 || i === FX1 || j === FZ0 || j === FZ1)) continue;
    if (cell[idx(i, j)] || fenceGap(i, j)) continue;
    cell[idx(i, j)] = FENCE; posts.push([cxw(i), cxw(j)]);
  }
  const isF = (i, j) => inb(i, j) && cell[idx(i, j)] === FENCE;
  for (let j = FZ0; j <= FZ1; j++) for (let i = FX0; i <= FX1; i++) {
    if (!isF(i, j)) continue;
    if (isF(i + 1, j)) rails.push([cxw(i) + 0.5, cxw(j), 0]);
    if (isF(i, j + 1)) rails.push([cxw(i), cxw(j) + 0.5, Math.PI / 2]);
  }
  const dm = new THREE.Object3D();
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 1.0, 0.13), M.fence, posts.length);
  posts.forEach(([x, z], k) => { dm.position.set(x, 0.5, z); dm.rotation.set(rr(-.05, .05), rr(0, 1), rr(-.05, .05)); dm.scale.set(1, rr(0.85, 1.1), 1); dm.updateMatrix(); pm.setMatrixAt(k, dm.matrix); });
  const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.07, 0.05), M.fence, rails.length * 2);
  rails.forEach(([x, z, r], k) => { [0.38, 0.75].forEach((y, q) => { dm.position.set(x, y + rr(-.03, .03), z); dm.rotation.set(0, r, rr(-.04, .04)); dm.scale.set(1, 1, 1); dm.updateMatrix(); rm.setMatrixAt(k * 2 + q, dm.matrix); }); });
  [pm, rm].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); });
}
const GAPS = [[0, 9], [0, 33], [N - 1, 12], [N - 1, 31], [10, 0], [31, 0], [14, N - 1], [29, N - 1]];
const nearGap = (i, j, r) => GAPS.some(([a, b]) => Math.abs(a - i) + Math.abs(b - j) <= r);
