// Bullet holes: where a round hits a wall of the house it leaves a hole, a dark pit in a ring of splintered paint,
// flush on the face it hit. The newest HOLE_MAX are kept; each fades with its wall when the wall is cut away so you
// can see in (world/cutaway.js).

const HOLE_MAX = 160;
const TEX_HOLE = glowTex(64, 64, x => {
  // splinters: short pale streaks round the hole, then a scorched ring and the black pit
  x.translate(32, 32);
  for (let k = 0; k < 11; k++) { x.save(); x.rotate(rand() * 6.28); x.fillStyle = `rgba(214,196,160,${rr(0.35, 0.7)})`; x.fillRect(5, -1.2, rr(9, 22), rr(1.4, 2.6)); x.restore(); }
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 20); g.addColorStop(0, 'rgba(8,6,5,1)'); g.addColorStop(0.3, 'rgba(14,10,8,1)'); g.addColorStop(0.42, 'rgba(48,34,24,0.9)'); g.addColorStop(0.75, 'rgba(70,52,36,0.35)'); g.addColorStop(1, 'rgba(70,52,36,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, 20, 0, 6.28); x.fill();
});
const holeMat = new THREE.MeshBasicMaterial({ map: TEX_HOLE, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const holeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), holeMat, HOLE_MAX);
holeMesh.count = 0; holeMesh.frustumCulled = false; holeMesh.renderOrder = 1; scene.add(holeMesh);
const holes = [], wallAt = new Map(walls.map(w => [w.k, w]));
let holeIdx = 0;
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hv = new V3(), _hs = new V3(), _hZ = new V3(0, 0, 1), _hn = new V3();
// a round from (ox, oz) along (dx, dz) that stopped at t (the first point found inside a blocked cell; the point before
// it, 0.1 back, was clear) at height y: if what it hit is a wall of the house, a hole of size s on the face it came through
function bulletHole(ox, oz, dx, dz, t, y, s) {
  const x1 = ox + dx * t, z1 = oz + dz * t, x0 = x1 - dx * 0.1, z0 = z1 - dz * 0.1;
  const i = ci(x1), j = ci(z1), w = wallAt.get(idx(i, j)); if (!w || cell[idx(i, j)] !== WALL) return;
  // which face: the boundary it crossed last on the way in
  const pi = ci(x0), pj = ci(z0);
  let tx = -1, tz = -1;
  if (pi !== i && dx) tx = ((dx > 0 ? i : i + 1) - HALF - ox) / dx;
  if (pj !== j && dz) tz = ((dz > 0 ? j : j + 1) - HALF - oz) / dz;
  if (tx < 0 && tz < 0) return;
  let hx, hz;
  if (tx >= tz) { hx = (dx > 0 ? i : i + 1) - HALF - Math.sign(dx) * 0.013; hz = oz + dz * tx; _hn.set(-Math.sign(dx), 0, 0); }
  else { hz = (dz > 0 ? j : j + 1) - HALF - Math.sign(dz) * 0.013; hx = ox + dx * tz; _hn.set(0, 0, -Math.sign(dz)); }
  const h = holes.length < HOLE_MAX ? (holes.push({}), holes[holes.length - 1]) : holes[holeIdx = (holeIdx + 1) % HOLE_MAX];
  h.w = w; h.on = null; h.x = hx; h.y = clamp(y + rr(-0.05, 0.05), 0.3, 2.2); h.z = hz; h.s = s * rr(0.85, 1.2); h.n = _hn.clone(); h.spin = rand() * 6.28;
  holeMesh.count = holes.length;
}
// every frame: a hole shows while its wall is up and hides while the wall is cut away
function updateHoles() {
  let dirty = false;
  holes.forEach((h, k) => {
    const on = h.w.cut.value < 0.5;
    if (on === h.on) return;
    h.on = on; dirty = true;
    _hq.setFromUnitVectors(_hZ, h.n); _hq.multiply(new THREE.Quaternion().setFromAxisAngle(_hZ, h.spin));
    _hm.compose(_hv.set(h.x, h.y, h.z), _hq, _hs.setScalar(on ? h.s : 0)); holeMesh.setMatrixAt(k, _hm);
  });
  if (dirty) holeMesh.instanceMatrix.needsUpdate = true;
}
// a new run starts with the walls whole again
function clearHoles() { holes.length = 0; holeIdx = 0; holeMesh.count = 0; }
