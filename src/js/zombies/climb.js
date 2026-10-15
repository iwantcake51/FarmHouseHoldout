// Zombies climbing fences and windows, each kind its own way: a walker hauls itself over and topples off the far side
// (Project Zomboid's fence climb), a runner vaults a fence and dives head first through a window, and a crawler, with
// no legs to stand on, drags itself up and over, slowly. Brutes go round (zombies/pathfinding.js).

// each climb is a run of key poses over its length (t 0..1): s is where it is along the climb, metres from the fence
// rail or the middle of the window (- before it), y how high off the ground, and the joints (zombies/zombie-anim.js) as
// they're set at that moment. In between, everything follows a smooth curve through the keys (zombie-anim.js's springs
// loosen it further). ev: what happens at a key (land: it hits the ground, with a thud and dust). dur: seconds, before each zombie's own odd 10% either way
const CLIMBS = {
  // a walker leans on the rail, gets a knee up, hauls itself over on its belly, topples off head first, hits the dirt,
  // gets its knees under it and stands
  fenceWalker: { dur: 2.0, keys: [
    [0, { s: -0.95, alx: -0.2, arx: -0.2, elL: -0.3, elR: -0.3 }],
    [0.13, { s: -0.62, rx: 0.1, ux: 0.4, alx: 0.47, arx: 0.5, elL: -0.35, elR: -0.3, hx: 0.15 }],
    [0.28, { s: -0.55, y: 0.15, rx: 0.3, ux: 0.8, alx: 0.6, arx: 0.65, elL: -0.1, elR: -0.12, llx: -0.6, klx: 1.3, lrx: 0.25, hx: 0.1 }],
    [0.43, { s: -0.5, y: 0.62, rx: 1.15, ux: 0.45, alx: 0.1, arx: 0.15, elL: -0.2, elR: -0.3, llx: -0.6, klx: 0.6, lrx: -0.3, krx: 0.4, hx: -0.2 }],
    [0.55, { s: -0.45, y: 0.98, rx: 1.8, ux: 0.3, alx: -0.3, arx: -0.25, elL: -0.15, elR: -0.2, llx: 0.3, klx: 0.5, lrx: 0.2, krx: 0.4, hx: -0.4 }],
    [0.65, { s: -0.05, y: 0.85, rx: 2.35, ux: 0.2, alx: -0.8, arx: -0.75, elL: -0.2, elR: -0.25, llx: 0.6, klx: 0.9, lrx: 0.5, krx: 1.0, hx: -0.5 }],
    [0.72, { s: 0.3, y: 0.15, rx: 1.6, ux: 0, alx: -1.5, arx: -1.45, aly: -0.25, ary: 0.25, elL: -0.3, elR: -0.35, llx: 0.1, klx: 0.3, lrx: 0.05, krx: 0.4, hx: -0.6 }, 'land'],
    [0.81, { s: 0.42, y: 0.16, rx: 1.22, ux: 0.1, alx: -1.05, arx: -1.1, aly: 0, ary: 0, elL: -0.6, elR: -0.55, llx: -1.0, klx: 1.6, lrx: -0.8, krx: 1.5, hx: -0.6 }],
    [0.91, { s: 0.65, y: 0.05, rx: 0.58, ux: 0.28, alx: -0.3, arx: -0.4, elL: -0.5, elR: -0.4, llx: -0.8, klx: 1.2, lrx: -0.15, krx: 0.4, hx: -0.3 }],
    [1, { s: 1.0, y: 0, rx: 0, ux: 0, alx: -0.2, arx: -0.2, elL: -0.3, elR: -0.3, llx: 0, klx: 0.05, lrx: 0, krx: 0.05, hx: 0 }]] },
  // a runner plants its hands on the rail and swings its legs over to the side without stopping
  fenceRunner: { dur: 1.15, keys: [
    [0, { s: -1.05, rx: 0.28, alx: -0.4, arx: -0.4, elL: -0.8, elR: -0.8 }],
    [0.25, { s: -0.45, y: -0.04, rx: 0.36, ux: 0.3, alx: 0.5, arx: 0.55, elL: -0.2, elR: -0.2, klx: 0.6, krx: 0.6, llx: -0.3 }],
    [0.45, { s: -0.08, y: 0.55, rx: 0.45, rz: 0.5, ux: 0.2, alx: 0.9, arx: 0.95, elL: -0.05, elR: -0.05, llx: -1.3, klx: 1.4, lrx: -1.0, krx: 1.6 }],
    [0.62, { s: 0.3, y: 0.4, rx: 0.2, rz: 0.2, ux: 0.1, alx: -0.5, arx: -0.6, aly: -0.4, ary: 0.4, elL: -0.4, elR: -0.4, llx: -0.6, klx: 0.6, lrx: -0.3, krx: 0.5 }],
    [0.76, { s: 0.62, y: -0.12, rx: 0.35, rz: 0, alx: -0.3, arx: -0.4, aly: 0, ary: 0, elL: -0.6, elR: -0.6, llx: -0.6, klx: 1.0, lrx: 0.2, krx: 1.0 }, 'land'],
    [1, { s: 1.05, y: 0, rx: 0.28, ux: 0, alx: -0.45, arx: -0.35, elL: -0.8, elR: -0.8, llx: 0, klx: 0.2, lrx: 0, krx: 0.2 }]] },
  // a crawler rears up against the rail, gets its hands over it and drags its chest up onto it, hangs there draped over,
  // slides off head first and flops down on the far side: slowly
  fenceCrawl: { dur: 5.2, keys: [
    [0, { s: -1.5, rx: 1.2, y: 0.2, alx: -1.6, arx: -1.6, elL: -0.5, elR: -0.5, llx: 0.12, lrx: 0.12, klx: 0.25, krx: 0.25, hx: -0.75 }],
    [0.13, { s: -1.25, rx: 0.95, y: 0.22, alx: -2.3, arx: -2.05, elL: -0.25, elR: -0.35, hx: -0.85 }],
    [0.3, { s: -0.95, rx: 0.48, y: 0.25, ux: 0.2, alx: 0, arx: 0.05, elL: -0.9, elR: -0.95, llx: 0.3, lrx: 0.3, hx: -0.5 }],
    [0.47, { s: -0.85, rx: 0.75, y: 0.42, ux: 0.7, alx: 0.3, arx: 0.35, elL: -0.35, elR: -0.4, llx: 0.1, lrx: 0.15, hx: -0.3 }],
    [0.62, { s: -0.6, rx: 1.4, y: 0.7, ux: 0.35, alx: -0.1, arx: -0.05, elL: -0.15, elR: -0.2, llx: -1.2, lrx: -1.1, klx: 0.4, krx: 0.4, hx: -0.4 }],
    [0.76, { s: -0.3, rx: 2.1, y: 0.95, ux: 0.2, alx: -0.7, arx: -0.65, elL: -0.2, elR: -0.25, llx: -0.2, lrx: -0.2, klx: 0.3, krx: 0.3, hx: -0.6 }],
    [0.84, { s: 0.45, rx: 1.55, y: 0.12, ux: 0, alx: -1.5, arx: -1.45, elL: -0.4, elR: -0.4, llx: 0.2, lrx: 0.2, klx: 0.25, krx: 0.25, hx: -0.7 }, 'land'],
    [0.92, { s: 0.62, rx: 1.25, y: 0.18, alx: -1.55, arx: -1.5, elL: -0.6, elR: -0.6, llx: 0.12, lrx: 0.12, hx: -0.75 }],
    [1, { s: 0.85, rx: 1.2, y: 0.2, alx: -1.6, arx: -1.6, elL: -0.5, elR: -0.5, hx: -0.75 }]] },
  // a walker gets its hands on the sill and a knee up, heaves itself onto it on its belly, slithers across, tips over
  // the inside edge head first, lands on the floor and gets up
  windowWalker: { dur: 2.6, keys: [
    [0, { s: -0.95, alx: -0.2, arx: -0.2, elL: -0.3, elR: -0.3 }],
    [0.12, { s: -0.8, rx: 0.05, ux: 0.18, alx: 0.4, arx: 0.42, elL: -0.45, elR: -0.4, hx: 0.1 }],
    [0.3, { s: -0.78, y: 0.4, rx: 0.25, ux: 0.65, alx: 0.95, arx: 1.0, elL: -0.1, elR: -0.1, llx: -1.3, klx: 1.8, lrx: 0.15, krx: 0.1, hx: 0.05 }],
    [0.45, { s: -0.84, y: 0.98, rx: 1.35, ux: 0.15, alx: -0.9, arx: -0.85, elL: -0.3, elR: -0.3, llx: -1.3, klx: 0.35, lrx: -1.25, krx: 0.45, hx: -0.3 }],
    [0.6, { s: -0.3, y: 0.98, rx: 1.45, ux: 0.1, alx: -1.1, arx: -1.05, llx: -1.15, klx: 0.3, lrx: -1.1, krx: 0.35, hx: -0.45 }],
    [0.7, { s: 0.0, y: 1.2, rx: 2.0, ux: 0.2, alx: -0.7, arx: -0.75, llx: -0.2, klx: 0.3, lrx: -0.15, krx: 0.35, hx: -0.5 }],
    [0.78, { s: 0.38, y: 1.0, rx: 2.4, ux: 0.1, alx: -1.0, arx: -0.95, llx: 0.2, klx: 0.6, lrx: 0.25, krx: 0.7, hx: -0.55 }],
    [0.83, { s: 0.6, y: 0.17, rx: 1.6, ux: 0, alx: -1.5, arx: -1.45, aly: -0.25, ary: 0.25, elL: -0.35, elR: -0.35, llx: 0.15, klx: 0.3, lrx: 0.1, krx: 0.4, hx: -0.6 }, 'land'],
    [0.91, { s: 0.75, y: 0.15, rx: 1.2, ux: 0.1, alx: -1.05, arx: -1.1, aly: 0, ary: 0, elL: -0.6, elR: -0.55, llx: -1.0, klx: 1.6, lrx: -0.8, krx: 1.5, hx: -0.6 }],
    [0.96, { s: 1.0, y: 0.05, rx: 0.55, ux: 0.28, alx: -0.3, arx: -0.4, elL: -0.5, elR: -0.4, llx: -0.8, klx: 1.2, lrx: -0.15, krx: 0.4, hx: -0.3 }],
    [1, { s: 1.3, y: 0, rx: 0, ux: 0, alx: -0.2, arx: -0.2, elL: -0.3, elR: -0.3, llx: 0, klx: 0.05, lrx: 0, krx: 0.05, hx: 0 }]] },
  // a runner dives through head first, hands out ahead, and comes up out of a roll on the far side still running
  windowRunner: { dur: 1.35, keys: [
    [0, { s: -1.05, rx: 0.28, alx: -0.4, arx: -0.4, elL: -0.8, elR: -0.8 }],
    [0.18, { s: -0.95, y: -0.1, rx: 0.4, ux: 0.1, alx: 0.2, arx: 0.25, elL: -0.5, elR: -0.5, klx: 0.9, krx: 0.9, llx: -0.4, lrx: -0.1 }],
    [0.32, { s: -0.85, y: 0.95, rx: 1.0, ux: 0, alx: -1.3, arx: -1.35, elL: -0.15, elR: -0.15, llx: 0.3, klx: 0.6, lrx: 0.4, krx: 0.4, hx: -0.4 }],
    [0.5, { s: -0.2, y: 1.2, rx: 1.45, alx: -1.55, arx: -1.5, elL: -0.1, elR: -0.1, llx: 0.3, klx: 0.3, lrx: 0.35, krx: 0.25, hx: -0.5 }],
    [0.62, { s: 0.35, y: 1.0, rx: 1.7, alx: -1.35, arx: -1.3, elL: -0.2, elR: -0.2, llx: 0.4, klx: 0.4, lrx: 0.45, krx: 0.4, hx: -0.5 }],
    [0.72, { s: 0.75, y: 0.2, rx: 1.75, alx: -1.2, arx: -1.15, elL: -0.5, elR: -0.5, llx: 0.6, klx: 0.6, lrx: 0.5, krx: 0.6, hx: -0.5 }, 'land'],
    [0.84, { s: 1.0, y: -0.06, rx: 0.6, ux: 0.2, alx: -0.4, arx: -0.5, elL: -0.7, elR: -0.7, llx: -1.1, klx: 1.4, lrx: -0.2, krx: 1.2, hx: -0.2 }],
    [1, { s: 1.45, y: 0, rx: 0.28, ux: 0, alx: -0.45, arx: -0.35, elL: -0.8, elR: -0.8, llx: 0, klx: 0.2, lrx: 0, krx: 0.2, hx: -0.3 }]] },
  // a crawler reaches up the wall, gets its hands on the sill, hauls itself up it by the arms, gets its chest over,
  // drags itself across on its belly and flops down onto the floor inside: slowly
  windowCrawl: { dur: 6.5, keys: [
    [0, { s: -1.5, rx: 1.2, y: 0.2, alx: -1.6, arx: -1.6, elL: -0.5, elR: -0.5, llx: 0.12, lrx: 0.12, klx: 0.25, krx: 0.25, hx: -0.75 }],
    [0.1, { s: -1.3, rx: 0.8, y: 0.22, alx: -2.4, arx: -2.2, elL: -0.2, elR: -0.3, hx: -0.9 }],
    [0.25, { s: -1.0, rx: 0.25, y: 0.3, ux: 0.1, alx: 0.2, arx: 0.25, elL: -0.6, elR: -0.65, llx: 0.1, lrx: 0.1, hx: -0.6 }],
    [0.42, { s: -1.0, rx: 0.12, y: 0.55, ux: 0.25, alx: 0.9, arx: 0.95, elL: -1.2, elR: -1.15, llx: 0.1, lrx: 0.15, hx: -0.3 }],
    [0.55, { s: -0.95, rx: 0.95, y: 0.88, ux: 0.55, alx: 0.2, arx: 0.25, elL: -0.25, elR: -0.25, llx: 0.2, lrx: 0.2, hx: -0.2 }],
    [0.68, { s: -0.75, rx: 1.42, y: 0.98, ux: 0.1, alx: -0.9, arx: -0.85, elL: -0.3, elR: -0.3, llx: -1.2, lrx: -1.2, klx: 0.3, krx: 0.3, hx: -0.5 }],
    [0.8, { s: -0.25, rx: 1.48, y: 0.98, ux: 0.05, alx: -1.3, arx: -1.25, elL: -0.25, elR: -0.3, llx: -1.0, lrx: -1.0, hx: -0.6 }],
    [0.88, { s: 0.05, rx: 2.1, y: 1.15, ux: 0.15, alx: -0.7, arx: -0.75, elL: -0.2, elR: -0.2, llx: -0.1, lrx: -0.1, hx: -0.6 }],
    [0.93, { s: 0.6, rx: 1.55, y: 0.15, ux: 0, alx: -1.5, arx: -1.45, elL: -0.4, elR: -0.4, llx: 0.2, lrx: 0.2, klx: 0.25, krx: 0.25, hx: -0.7 }, 'land'],
    [1, { s: 0.85, rx: 1.2, y: 0.2, alx: -1.6, arx: -1.6, elL: -0.5, elR: -0.5, llx: 0.12, lrx: 0.12, hx: -0.75 }]] }
};
// the keys as flat arrays (the joints, then s), each joint a key leaves out carried over from the one before
for (const c of Object.values(CLIMBS)) {
  let prev = new Float32Array(ZJ_N + 1);
  c.k = c.keys.map(([t, o, ev]) => { const p = Float32Array.from(prev); for (const n in o) { if (n === 's') p[ZJ_N] = o.s; else p[ZJ[n]] = o[n]; } prev = p; return { t, p, ev }; });
}
// a smooth curve through the keys (each passing through its key at a speed set by its neighbours)
function climbAt(c, t, out) {
  const K = c.k, n = K.length; let i = 0; while (i < n - 2 && t > K[i + 1].t) i++;
  const k0 = K[Math.max(0, i - 1)], k1 = K[i], k2 = K[i + 1], k3 = K[Math.min(n - 1, i + 2)], h = k2.t - k1.t, u = clamp((t - k1.t) / h, 0, 1);
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let q = 0; q <= ZJ_N; q++) {
    const m1 = (k2.p[q] - k0.p[q]) / Math.max(1e-4, k2.t - k0.t) * h, m2 = (k3.p[q] - k1.p[q]) / Math.max(1e-4, k3.t - k1.t) * h;
    out[q] = h00 * k1.p[q] + h10 * m1 + h01 * k2.p[q] + h11 * m2;
  }
  return out;
}
const _cp = new Float32Array(ZJ_N + 1);
// over a fence (fx, fz: where it crosses the rail) or through a window (o), from where the zombie stands along (dx, dz)
// to (x1, z1) on the far side
function startClimb(z, kind, fx, fz, dx, dz, x1, z1, o) {
  const c = CLIMBS[kind + (z.crawl ? 'Crawl' : z.type === 'runner' ? 'Runner' : 'Walker')];
  const s0 = (z.x - fx) * dx + (z.z - fz) * dz, lat = (z.x - fx) * -dz + (z.z - fz) * dx;
  z.vault = { kind, c, t: 0, dur: c.dur * rr(0.9, 1.1), fx, fz, dx, dz, s0, ds: s0 - c.k[0].p[ZJ_N], lat, keepLat: kind === 'fence', x0: z.x, z0: z.z, x1, z1, o, ev: 0 };
  z.face = Math.atan2(dx, dz);
  if (o) o.busy = z;
  if (Math.hypot(z.x - P.x, z.z - P.z) < 14) SFX.fenceClimb();
}
// along the climb: the zombie's place on the ground follows the keys' s (starting from wherever it stood, and drawn to
// the middle of a window as it goes in), the events fire as their keys go by, and the pose goes to the animation
function stepClimb(z, dt) {
  const v = z.vault, c = v.c; v.t += dt / v.dur; const t = Math.min(1, v.t);
  climbAt(c, t, _cp);
  const s = _cp[ZJ_N] + v.ds * (1 - _zsm(0, 0.22, t)), lat = v.keepLat ? v.lat : v.lat * (1 - _zsm(0, 0.3, t));
  z.x = v.fx + v.dx * s - v.dz * lat; z.z = v.fz + v.dz * s + v.dx * lat; z.face = Math.atan2(v.dx, v.dz);
  if (z.blob) z.blob.position.set(z.x, 0.02, z.z);
  while (v.ev < c.k.length && c.k[v.ev].t <= t) {
    const e = c.k[v.ev].ev; v.ev++;
    if (e === 'land') { burst(z.x + v.dx * 0.5, 0.1, z.z + v.dz * 0.5, z.crawl ? 4 : 6, 'dust', v.dx, v.dz, 1.2); if (Math.hypot(z.x - P.x, z.z - P.z) < 14) SFX.thud(); }
  }
  // done: it carries on from where the climb left it (or from the far cell's middle, if that left it somewhere it can't stand)
  if (t >= 1) { z.vault = null; if (hardBlocked(ci(z.x), ci(z.z))) { z.x = v.x1; z.z = v.z1; } if (v.o && v.o.busy === z) v.o.busy = null; }
}
// the climb's pose for the animation (zombies/zombie-anim.js): the keys' joints (a crawler's height scaled to it), held
// to them a little more firmly than usual
const _cq = new Float32Array(ZJ_N + 1);
function zClimbPose(z, T, K) {
  const p = climbAt(z.vault.c, Math.min(1, z.vault.t), _cq);
  for (let q = 0; q < ZJ_N; q++) T[q] = p[q];
  T[ZJ.y] *= z.T.scale; T[ZJ.fw] = 0;
  zBoost(K, ZJN, 1.35);
}
