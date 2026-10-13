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
  return { x1, z1, px: o.x, pz: o.z, py: 0.98 };   // p: the sill you put your hand on
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
    if (sx && Math.abs(l) > 0.01) { const zz = P.z + l; if (playerBlocked(ci(x1), ci(zz)) || playerBlocked(ci(x1 + 0.25 * sx), ci(zz))) return null; return { x1, z1: zz, px: fx, pz: (P.z + zz) / 2, py: 0.78 }; }
    if (playerBlocked(ci(x1), ci(z1)) || playerBlocked(ci(x1 + 0.25 * Math.sign(x1 - P.x)), ci(z1))) return null;
    return { x1, z1, px: sx ? fx : (P.x + x1) / 2, pz: sz ? fz : (P.z + z1) / 2, py: 0.78 };   // p: the top rail you vault off
  };
  return (Math.abs(lat) > 0.15 && tryLand(lat)) || tryLand(0);
}
// vaulting takes it out of you: 20% stamina through a window, 14% over a fence, and every vault you chain on within
// a few seconds of the last costs another 10% (vaultHeat cools off over 3 s). Without the breath for it you
// scramble over instead: slower and lower, panting, and you stumble when you land. Light feet halves the cost.
const VAULT_COST = 0.2, FENCE_COST = 0.14, VAULT_CHAIN = 0.1, VAULT_COOL = 3;
function tryVault() {
  if (P.vault) return;
  const win = vaultTarget(nearestOpening()), t = win || fenceTarget(); if (!t) return;
  const cost = stamUse(((win ? VAULT_COST : FENCE_COST) + VAULT_CHAIN * (P.vaultHeat || 0)) * (S.vaultMul < 1 ? 0.5 : 1));
  const scramble = P.exh || P.stam < cost * 0.6;
  P.stam = Math.max(0, P.stam - cost); P.stamT = 0; if (P.stam <= 0.001) P.exh = true;
  P.vaultHeat = (P.vaultHeat || 0) + 1;
  if (scramble) SFX.pant();
  closeStation();
  exitScope();
  // the jump's own frame: d along it, l across it, C where it crosses the obstacle (a window's middle, or the fence
  // line where you meet it). You slide onto the line as you crouch, so every vault of a kind starts from the same spot.
  const o = win ? nearestOpening() : null;
  let dx, dz, C, s1, lat0, lat1, twistSide = 1;
  if (win) {
    const side = Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1; dx = -o.nx * side; dz = -o.nz * side; C = [o.x, o.z];
    s1 = playerBlocked(ci(o.x + dx * 1.4), ci(o.z + dz * 1.4)) ? 1.05 : 1.4;   // room on the far side to come up out of the dive
    lat0 = lat1 = 0;
  } else {
    const ax = Math.abs(t.x1 - P.x) > Math.abs(t.z1 - P.z);   // which way the jump runs: straight across the fence
    dx = ax ? Math.sign(t.x1 - P.x) : 0; dz = ax ? 0 : Math.sign(t.z1 - P.z);
    C = ax ? [t.px, P.z] : [P.x, t.pz]; s1 = 1.0;
    const Lc = ax ? dx : -dz;   // how the across axis lines up with the fence line
    lat0 = 0; lat1 = ((t.x1 - C[0]) * -dz + (t.z1 - C[1]) * dx);
    // cross the rail 0.34 m from the nearer post: clear of it (your shoulders are half a metre wide), with room on the
    // far side for the legs to swing over
    const u = (ax ? C[1] : C[0]) + Lc * (lat0 + (lat1 - lat0) * 0.4), post = cxw(ci(u)), off = u - post;
    { const sh = ((off >= 0 ? 1 : -1) * 0.34 - off) * Lc; lat0 += sh; lat1 += sh; }
    // the legs swing over to the side away from the nearest post (L points left; a positive twist swings them right)
    const cu = (ax ? C[1] : C[0]) + Lc * (lat0 + (lat1 - lat0) * 0.4), np = cxw(ci(cu)), postLeft = Math.sign(np - cu) * Lc > 0;
    twistSide = postLeft || np === cu ? 1 : -1;
  }
  const L = [-dz, dx], kind = win ? 'window' : 'fence';
  // a window starts from a short crouch back off the sill: the legs are straight, so they can only tuck up out of the
  // wall's way while the hips are still well short of it
  const s0 = win ? -1.3 : -0.85, mul = S.vaultMul * (scramble ? 1.55 : 1);
  // where the left hand goes down (L points to your left): on the sill's near edge, or the top rail where you cross
  const latX = lat0 + (lat1 - lat0) * 0.3, plant = win ? new V3(C[0] + dx * -0.46 + L[0] * 0.16, 1.05, C[1] + dz * -0.46 + L[1] * 0.16) : new V3(C[0] + L[0] * (latX + 0.16), 0.8, C[1] + L[1] * (latX + 0.16));
  // side: how much the jump runs across the screen (-1 left .. 1 right), which is how far the view tips with it
  P.vault = { t: 0, pre: 0, preDur: (win ? 0.24 : 0.16) * S.vaultMul * (scramble ? 1.8 : 1), dur: (win ? 0.85 : 0.55) * mul, scramble, kind, fence: !win,
    C, L, s0, s1, lat0, lat1, twistSide, sx: P.x, sz: P.z, obs: vaultObstacle(kind, false), plant, ground: new V3(C[0] + dx * (s1 + 0.15) + L[0] * 0.14, 0.04, C[1] + dz * (s1 + 0.15) + L[1] * 0.14),
    x0: P.x, z0: P.z, x1: C[0] + dx * s1 + L[0] * lat1, z1: C[1] + dz * s1 + L[1] * lat1, face: Math.atan2(dx, dz), dx, dz, side: clamp(dx * RIGHT.x + dz * RIGHT.z, -1, 1) };
  buildVaultPlan(P.vault);
  W8.reloading = null; W8.reloadT = 0; P.shove = null;
  nz(0.08, 'lowpass', 600, 200, 0.12);   // boots scuff as you set your feet
}
// push off (the camera's tilt follows the jump on its own, see vaultCam in game/camera.js)
function vaultTakeoff(v) { SFX.vault(); groundDust(P.x, P.z, 0.45, -v.dx, -v.dz); }   // a scuff of dust where you push off
// touch down: a thump, dust, the knees soak it up and the camera dips and settles on a spring
function vaultLand(v) {
  SFX.thud(); groundDust(P.x, P.z, 1, v.dx, v.dz); ANIM.land = 1; ANIM.landHeavy = !!v.scramble;
  // carry the vault's momentum out of it (movement.js ends the jump still moving), so you run on instead of stopping dead
  const sp = Math.min(3, v.endSpeed || 0); P.vx = v.dx * sp; P.vz = v.dz * sp;
  camVault.vb -= 1.1; camVault.vr += v.side * 0.35; camVault.vpx += v.dx * 0.9; camVault.vpz += v.dz * 0.9;
  if (v.scramble) { P.slow = Math.min(1, P.slow + 0.35); camVault.vb -= 0.6; SFX.pant(); }   // a heavy, tired landing: slowed, but never frozen in place
}
