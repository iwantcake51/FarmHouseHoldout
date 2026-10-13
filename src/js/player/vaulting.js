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
  const dx = t.x1 - P.x, dz = t.z1 - P.z, dl = Math.hypot(dx, dz) || 1;
  // side: how much the jump runs across the screen (-1 left .. 1 right), which is how far the view tips with it
  P.vault = { t: 0, pre: 0, preDur: 0.16 * S.vaultMul, dur: 0.5 * S.vaultMul, x0: P.x, z0: P.z, x1: t.x1, z1: t.z1, face: Math.atan2(dx, dz), dx: dx / dl, dz: dz / dl, side: clamp((dx * RIGHT.x + dz * RIGHT.z) / dl, -1, 1) };
  W8.reloading = null; W8.reloadT = 0; P.shove = null;
  nz(0.08, 'lowpass', 600, 200, 0.12);   // boots scuff as you set your feet
}
// push off (the camera's tilt follows the jump on its own, see vaultCam in game/camera.js)
function vaultTakeoff(v) { SFX.vault(); groundDust(P.x, P.z, 0.45, -v.dx, -v.dz); }   // a scuff of dust where you push off
// touch down: a thump, dust, the knees soak it up and the camera dips and settles on a spring
function vaultLand(v) {
  SFX.thud(); groundDust(P.x, P.z, 1, v.dx, v.dz); ANIM.land = 1;
  camVault.vb -= 1.1; camVault.vr += v.side * 0.35; camVault.vpx += v.dx * 0.9; camVault.vpz += v.dz * 0.9;
}
