// Climbing through windows and hopping fences.

function nearestOpening() {
  let best = null, bd = 1.45;
  for (const o of openings) { const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function vaultTarget(o) {
  if (!o || o.kind !== 'window' || o.boards.length) return null;
  const side = Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1;
  const x1 = o.x - o.nx * side * 1.05, z1 = o.z - o.nz * side * 1.05;
  if (playerBlocked(ci(x1), ci(z1))) return null;
  return { x1, z1 };
}
function fenceTarget() {
  let best = null, bd = 1.05;
  const pi = ci(P.x), pj = ci(P.z), isF = (i, j) => inb(i, j) && cell[idx(i, j)] === FENCE;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = pi + di, j = pj + dj; if (!isF(i, j)) continue;
    const d = Math.hypot(cxw(i) - P.x, cxw(j) - P.z); if (d < bd) { bd = d; best = [i, j]; }
  }
  if (!best) return null;
  const [i, j] = best, fx = cxw(i), fz = cxw(j), ax = fx - P.x, az = fz - P.z;
  const runsX = isF(i - 1, j) || isF(i + 1, j), runsZ = isF(i, j - 1) || isF(i, j + 1);
  let sx = 0, sz = 0;
  if (runsX && !runsZ) sz = Math.sign(az) || 1; else if (runsZ && !runsX) sx = Math.sign(ax) || 1; else if (Math.abs(ax) > Math.abs(az)) sx = Math.sign(ax) || 1; else sz = Math.sign(az) || 1;
  // keep your sideways momentum: moving along the fence carries you diagonally over it
  const along = sx ? P.vz : P.vx, lat = clamp(along * 0.3, -1.0, 1.0);
  const tryLand = l => {
    const x1 = (sx ? fx : P.x + l) + sx * 1.0, z1 = (sz ? fz : P.z + l) + sz * 1.0;
    if (sx && Math.abs(l) > 0.01) { const zz = P.z + l; if (playerBlocked(ci(x1), ci(zz)) || playerBlocked(ci(x1 + 0.25 * sx), ci(zz))) return null; return { x1, z1: zz }; }
    if (playerBlocked(ci(x1), ci(z1)) || playerBlocked(ci(x1 + 0.25 * Math.sign(x1 - P.x)), ci(z1))) return null;
    return { x1, z1 };
  };
  return (Math.abs(lat) > 0.15 && tryLand(lat)) || tryLand(0);
}
function tryVault() {
  if (P.vault) return;
  const t = vaultTarget(nearestOpening()) || fenceTarget(); if (!t) return;
  closeStation();
  exitScope();
  // a short crouch to load the jump, then the hop itself
  P.vault = { t: 0, pre: 0, preDur: 0.16 * S.vaultMul, dur: 0.5 * S.vaultMul, x0: P.x, z0: P.z, x1: t.x1, z1: t.z1, face: Math.atan2(t.x1 - P.x, t.z1 - P.z) };
  W8.reloading = null; W8.reloadT = 0; P.shove = null;
  nz(0.08, 'lowpass', 600, 200, 0.12);   // boots scuff as you set your feet
}
// push off: the view tips toward where you're jumping and gives a little
function vaultTakeoff(v) {
  SFX.vault();
  const dx = v.x1 - v.x0, dz = v.z1 - v.z0, side = Math.sign(dx * RIGHT.x + dz * RIGHT.z) || 1;
  camRoll = clamp(camRoll - side * 0.07, -0.12, 0.12); shake = Math.max(shake, 0.12);
  camKick.x -= dx * 0.06; camKick.z -= dz * 0.06;
}
// touch down: a thump, dust, the knees soak it up and the camera settles with a jolt
function vaultLand(v) {
  const dx = v.x1 - v.x0, dz = v.z1 - v.z0;
  SFX.thud(); shake = Math.max(shake, 0.2); camKick.x += dx * 0.12; camKick.z += dz * 0.12; camRoll *= -0.5;
  burst(P.x, 0.1, P.z, 7, 'dust', dx, dz, 1.6); ANIM.land = 1;
}
