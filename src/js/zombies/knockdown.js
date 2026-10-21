// Zombies knocked off their feet: run down by a charging brute (zombies/brute-dash.js), thrown forward along its way
// and out to the side as a ragdoll (zombies/deaths.js), and once they've come to rest, back up again: a get-up played on
// the same joints the walk is (zombies/zombie-anim.js), eased in from however the body landed and handed back to the
// walk where it leaves off, so there's never a jump from one to the next. One the brute only clips is shoved aside,
// staggering, and stays on its feet.

// force: how hard it's thrown (makeRagdoll's, on the order of a heavy hit's: a range, picked each time); side: how
// much of the throw goes out to the side it was on (a range); rest: how long it lies there before it starts to get
// up, and wait: how much longer it's given to stop moving first; blend: how long the get-up takes to ease out of the
// pose it landed in; fall: how long the fall takes to ease out of the stride it was in (the ragdoll's frame is the
// trunk's, not quite the walk's); pace: how fast it gets up (a range, a runner's quicker: RUN_PACE)
const KNOCK = { force: [10, 14], side: [0.6, 1.05], rest: [0.45, 1.6], wait: [0.4, 1], blend: 0.42, fall: 0.12, pace: [0.8, 1.2] };
const RUN_PACE = 1.25;
// the brute's reach: run square into, it's knocked down (hit: past both bodies' edges); clipped, out to clip past them,
// it's shoved aside (BUMP: how hard, how long it reels)
const PLOW = { hit: 0.12, clip: 0.75 };
const BUMP = { v: 6.5, fwd: 0.35, stagger: 0.7, slow: 1.1 };

// ---- the get-ups: keyed values of the walk's joints (ZJN, zombies/zombie-anim.js; any not given is 0) through time,
// in seconds at pace 1. Where the body is is worked out as it goes (getUpGround): whatever's lowest rests on the
// ground and whatever's on the ground stays where it is, so a hand or a knee once down doesn't slide, and the body
// moves over them the way it would. Each is played as given or mirrored (left for right), and every key's joints are
// put a little off, so no two get up alike. Face down it's on its elbows, then up onto its hands with its back sagging,
// knees drawn in under it; then either a foot brought forward, hands pushing off the ground and up, or rocked back
// upright onto its knees, a foot forward and up. Face up it curls up and sits up on its elbows and hands; then either
// draws its feet in and rocks forward over them into a crouch and stands, or turns onto one hand and a knee and pushes
// up off it. The last key is partway up: the walk's springs carry it the rest of the way onto its feet
const KNOCK_UPS = {
  prone: [
    // onto all fours, a foot forward, pushing up off the ground
    [
      [0, { rx: 1.55, hx: -0.3, alx: 1.25, arx: 0.95, elL: -0.3, elR: -0.5, klx: 0.15, krx: 0.3 }],
      [0.4, { rx: 1.55, hx: -0.55, alx: 0.8, arx: 0.75, aly: 0.25, ary: -0.25, elL: -1.05, elR: -1.1, klx: 0.2, krx: 0.3 }],
      [0.85, { rx: 1.38, ux: -0.4, hx: -0.65, alx: 0.12, arx: 0.18, aly: 0.1, ary: -0.1, elL: -0.25, elR: -0.3, llx: -0.2, lrx: -0.1, klx: 0.35, krx: 0.3 }],
      [1.3, { rx: 1.32, ux: -0.05, hx: -0.5, alx: 0.15, arx: 0.2, elL: -0.15, elR: -0.2, llx: -1.45, lrx: -1.35, klx: 1.6, krx: 1.55 }],
      [1.8, { rx: 1.0, ux: 0.2, hx: -0.55, alx: 0.4, arx: 0.45, elL: -0.2, elR: -0.25, llx: -2.05, klx: 2.15, lrx: -0.95, krx: 1.65 }],
      [2.3, { rx: 0.45, ux: 0.45, hx: -0.2, alx: 1.0, arx: 0.85, elL: -0.5, elR: -0.4, llx: -1.25, klx: 1.45, lrx: -0.25, krx: 1.2 }],
      [2.75, { rx: 0.12, ux: 0.28, hx: 0.05, alx: 0.85, arx: 0.7, elL: -0.6, elR: -0.4, llx: -0.4, klx: 0.5, lrx: 0.05, krx: 0.35 }]
    ],
    // onto all fours, rocked back upright onto its knees, slumped, a foot forward and up
    [
      [0, { rx: 1.55, hx: -0.25, alx: 1.1, arx: 1.3, elL: -0.45, elR: -0.2, klx: 0.25, krx: 0.1 }],
      [0.35, { rx: 1.55, hx: -0.5, alx: 0.75, arx: 0.85, aly: 0.2, ary: -0.2, elL: -1.1, elR: -1.0, klx: 0.3, krx: 0.2 }],
      [0.8, { rx: 1.3, ux: -0.15, hx: -0.5, alx: 0.15, arx: 0.12, elL: -0.15, elR: -0.1, llx: -1.35, lrx: -1.45, klx: 1.5, krx: 1.6 }],
      [1.3, { rx: 0.08, ux: 0.42, hx: 0.3, alx: 1.35, arx: 1.2, elL: -0.35, elR: -0.25, llx: 0.02, lrx: 0, klx: 1.62, krx: 1.6 }],
      [1.8, { rx: 0.12, ux: 0.45, hx: 0.3, alx: 1.05, arx: 1.3, elL: -0.4, elR: -0.2, llx: -1.5, klx: 1.5, lrx: 0.05, krx: 1.62 }],
      [2.3, { rx: 0.16, ux: 0.38, hx: 0.12, alx: 0.8, arx: 1.0, elL: -0.5, elR: -0.3, llx: -0.65, klx: 0.75, lrx: 0.1, krx: 0.55 }],
      [2.65, { rx: 0.07, ux: 0.22, alx: 0.65, arx: 0.75, elL: -0.5, elR: -0.35, llx: -0.2, klx: 0.25, lrx: 0.05, krx: 0.2 }]
    ]
  ],
  supine: [
    // sits up, draws its feet in, rocks forward over them into a crouch and stands
    [
      [0, { rx: -1.55, hx: 0.3, alx: 1.45, arx: 1.6, aly: -0.2, ary: 0.15, elL: -0.2, elR: -0.3, klx: 0.1, krx: 0.15 }],
      [0.5, { rx: -1.05, ux: 0.6, hx: 0.5, alx: 2.05, arx: 2.0, elL: -1.0, elR: -0.95, llx: -0.3, lrx: -0.25, klx: 0.45, krx: 0.4 }],
      [0.95, { rx: -0.3, ux: 0.35, hx: 0.2, alx: 2.2, arx: 2.25, elL: -0.2, elR: -0.25, llx: -1.3, lrx: -1.35, klx: 0.35, krx: 0.3 }],
      [1.45, { rx: -0.05, ux: 0.45, hx: 0.15, alx: 2.0, arx: 2.05, elL: -0.3, elR: -0.3, llx: -2.25, lrx: -2.3, klx: 2.3, krx: 2.35 }],
      [1.95, { rx: 0.55, ux: 0.5, hx: -0.2, alx: 0.5, arx: 0.6, elL: -0.45, elR: -0.4, llx: -2.35, lrx: -2.4, klx: 2.45, krx: 2.5 }],
      [2.4, { rx: 0.3, ux: 0.4, hx: -0.05, alx: 0.6, arx: 0.7, elL: -0.5, elR: -0.45, llx: -1.2, lrx: -1.25, klx: 1.5, krx: 1.5 }],
      [2.8, { rx: 0.1, ux: 0.25, alx: 0.6, arx: 0.7, elL: -0.5, elR: -0.4, llx: -0.3, lrx: -0.3, klx: 0.4, krx: 0.4 }]
    ],
    // sits up turning onto one hand, gets a knee under it and a foot planted and pushes up off them
    [
      [0, { rx: -1.55, hx: 0.25, alx: 1.6, arx: 1.4, aly: -0.25, ary: 0.1, elL: -0.15, elR: -0.35, klx: 0.2, krx: 0.1 }],
      [0.5, { rx: -0.95, ux: 0.55, uy: 0.45, hx: 0.4, alx: 1.95, arx: 0.5, aly: -0.3, ary: -0.3, elL: -0.6, elR: -0.7, llx: -0.3, klx: 0.5, lrx: -0.6, krx: 1.0 }],
      [1.0, { rx: -0.3, rz: 0.25, ux: 0.4, uy: 0.6, hx: 0.3, alx: 1.95, aly: -0.5, elL: -0.1, arx: 0.6, ary: -0.4, elR: -0.8, llx: -1.15, klx: 1.85, lrx: -1.4, krx: 0.9 }],
      [1.55, { rx: 0.35, rz: 0.1, ux: 0.4, uy: 0.2, hx: 0.1, alx: 1.15, aly: -0.2, elL: -0.2, arx: 0.55, elR: -1.0, llx: 0.1, klx: 1.6, lrx: -1.5, krx: 1.55 }],
      [2.05, { rx: 0.2, ux: 0.4, uy: 0.05, hx: 0.05, alx: 0.9, arx: 0.9, elL: -0.4, elR: -0.6, llx: -0.15, klx: 0.9, lrx: -0.8, krx: 0.9 }],
      [2.45, { rx: 0.08, ux: 0.25, alx: 0.6, arx: 0.7, elL: -0.5, elR: -0.45, llx: -0.1, klx: 0.35, lrx: -0.25, krx: 0.35 }]
    ]
  ]
};
// mirrored: each left joint swapped for its right, and whatever turns toward one side turned toward the other
const MIRROR_SWAP = [['alx', 'arx'], ['aly', 'ary', -1], ['alz', 'arz', -1], ['elL', 'elR'], ['llx', 'lrx'], ['llz', 'lrz', -1], ['klx', 'krx']];
const MIRROR_NEG = ['rz', 'uy', 'uz', 'ly', 'hy', 'hz'];
// how loosely it moves through them: the head trails the body (lag, s), each arm leads or trails by up to arm, and
// the head and arms drift about a little all the way (wob: how far, rad), so it's never all one piece
const GETUP_LOOSE = { lag: 0.08, arm: 0.07, wob: 0.06, jit: 0.07 };
const GU_HEAD = ['hx', 'hy', 'hz'].map(n => ZJ[n]), GU_ARML = ['alx', 'aly', 'alz', 'elL'].map(n => ZJ[n]), GU_ARMR = ['arx', 'ary', 'arz', 'elR'].map(n => ZJ[n]);
const KNOCK_PARTS = ['g', 'lower', 'upper', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];

// ---- the brute's charge: what it runs into is knocked down, what it clips is shoved aside. The host decides;
// everyone else's game plays the same (net/sync.js: 'zk', the same seed) ----
function dashPlow(z, d) {
  if (netClient()) return;
  for (const o of zombies) {
    if (o === z || o.dead || o.knock || o.type === 'brute' || o.vault || o.dash || o.out) continue;
    const ox = o.x - z.x, oz = o.z - z.z, dist = Math.hypot(ox, oz), reach = z.T.r + o.T.r;
    if (dist > reach + PLOW.clip || ox * d.dx + oz * d.dz < -0.1) continue;   // (only what's in front of it)
    const done = d.plowed || (d.plowed = new Set()); if (done.has(o)) continue;   // (each once a charge)
    done.add(o);
    const lat = ox * d.dz - oz * d.dx, side = Math.sign(lat) || (rand() < 0.5 ? -1 : 1), seed = (rand() * 1e9) | 0;
    // a crawler can't be knocked off its feet, only shoved along the ground
    const down = dist <= reach + PLOW.hit && Math.abs(lat) < reach * 0.85 && !o.crawl;
    const s = down ? rr(...KNOCK.side) : 1 / BUMP.fwd, kx = d.dx + d.dz * side * s, kz = d.dz - d.dx * side * s, L = Math.hypot(kx, kz);
    if (down) knockDown(o, kx / L, kz / L, seed); else bumpAside(o, kx / L, kz / L, side, seed);
    if (netLink() && o.id) netSend('zk', { id: o.id, dx: nr(kx / L), dz: nr(kz / L), s: seed, b: down ? 0 : side });
  }
}
// clipped: thrown aside along (dx, dz) and reeling, arms flung out, leaning off the blow (side: the side it was on)
function bumpAside(z, dx, dz, side, seed) {
  if (z.dead || z.knock) return;
  withSeed(seed, () => {
    const v = BUMP.v * rr(0.8, 1.15);
    if (!netClient()) { z.vx = (z.vx || 0) + dx * v; z.vz = (z.vz || 0) + dz * v; }
    z.stagger = Math.max(z.stagger || 0, BUMP.stagger * rr(0.8, 1.2)); z.atk = Math.max(z.atk || 0, BUMP.stagger); z.lunge = 0;
    z.pushSlow = z.pushMax = Math.max(z.pushSlow || 0, BUMP.slow); z.shoved = Math.max(z.shoved || 0, 0.6);
    z.atkBoard = z.atkDoor = null; z.atkFence = false;
    // the blow comes from the side it's thrown away from: rocked over that way, arms up, the head snapped round
    const a = z.an; if (a) { const sd = Math.sign(dx * Math.cos(z.face) - dz * Math.sin(z.face)) || side, V = a.v; V[ZJ.rz] -= sd * 7; V[ZJ.uz] -= sd * 9; V[ZJ.hz] -= sd * 10; V[ZJ.alx] -= rr(6, 11); V[ZJ.arx] -= rr(6, 11); V[ZJ.alz] += sd * 5; V[ZJ.arz] += sd * 5; V[ZJ.ux] -= 4; }
  });
  soundAt(z.x, z.z, () => { SFX.thud(); }, true);
  burst(z.x, 0.5, z.z, 2, 'dust', dx, dz, 1.2);
}
function knockDown(z, dx, dz, seed) {
  if (z.dead || z.knock) return;
  const m = z.m, head0 = m.head.position.clone(), snap = snapPose(m);
  z.atkBoard = z.atkDoor = null; z.atkFence = false; z.vx = z.vz = 0; z.lunge = 0;
  const k = { t: 0, ph: 'down', head0, seed, ...snap };
  withSeed(seed, () => {
    k.r = makeRagdoll(z, dx, dz, 'torso', rr(...KNOCK.force), null, { upY: ZHIP, list: [] });
    k.rest = rr(...KNOCK.rest); k.wait = k.rest + rr(...KNOCK.wait);
  });
  z.knock = k;
  soundAt(z.x, z.z, () => { SFX.thud(); nz(0.18, 'lowpass', 500, 120, 0.3); }, true);
  burst(z.x, 0.9, z.z, 4, 'dust', dx, dz, 1.5);
}
// every frame while it's down or getting up (zombies/ai.js leaves the rest of its turn alone meanwhile)
function stepKnock(z, dt) {
  const k = z.knock, m = z.m; k.t += dt;
  if (k.ph === 'down') {
    stepRagdoll(k.r, dt); z.x = k.r.x; z.z = k.r.z;
    downTidy(m, k, dt);
    if (k.t < KNOCK.fall) easeFrom(m, k, smooth(k.t / KNOCK.fall));
    if (k.t > k.rest && (k.r.sleep || k.r.still > 0.2 || k.t > k.wait)) getUp(z);
    return;
  }
  // getting up: the keys sampled at this moment into the walk's joints, posed, set on the ground, and for the first
  // KNOCK.blend eased from the pose it landed in
  k.gt += dt * k.pace;
  const j = z.an.j, base = surfaceY(z.x, z.z);
  sampleGetUp(k, j);
  for (const p of ['foreL', 'foreR', 'shinL', 'shinR']) if (m[p]) m[p].rotation.set(0, 0, 0);   // (the ragdoll twists these; the walk only ever bends them)
  zApply(z, m, j, base);
  getUpGround(z, k, base);
  const w = smooth(clamp(k.gt / k.pace / KNOCK.blend, 0, 1));
  if (w < 1) easeFrom(m, k, w);
  m.head.position.lerpVectors(k.snapH, k.head0, w);
  // its joints' speed, for the walk to carry on with
  if (k.prev) for (let i = 0; i < ZJ_N; i++) z.an.v[i] = dt > 0 ? (j[i] - k.prev[i]) / dt : 0;
  k.prev = k.prev || new Float32Array(ZJ_N); k.prev.set(j);
  if (k.gt >= k.T) {
    // up: the walk takes over from here, from these very joint values and how fast they're going, its springs
    // carrying it the rest of the way; its height off the ground goes over to the walk's too
    j[ZJ.y] = m.g.position.y - base; j[ZJ.fw] = 0;
    m.head.position.copy(k.head0); z.knock = null; z.stagger = Math.max(z.stagger || 0, 0.3);
    z.an.px = z.x; z.an.pz = z.z; z.an.pf = z.face;
  }
}
const _kq = new THREE.Quaternion(), _kp = new V3(), _kd = new V3();
// the ragdoll's pose tidied as it lies (deaths.js poses it for a body that'll never move again): each forearm and shin
// only bent at its joint, the way the walk bends it, never twisted round or bent sideways, so the get-up eases out of
// it without them spinning round; and the head, aimed off its short neck and so twitching at every nudge of the body,
// eased after where it's aimed (KNOCK_HEAD: how quick), so it and the eyes in it (effects/eye-glow.js) move smoothly
const KNOCK_HEAD = 14;
function downTidy(m, k, dt) {
  for (const p of ['foreL', 'foreR']) { const o = m[p]; if (!o) continue; _kd.set(0, 0, 1).applyQuaternion(o.quaternion); o.rotation.set(Math.atan2(-_kd.y, _kd.z), 0, 0); }
  for (const p of ['shinL', 'shinR']) { const o = m[p]; if (!o) continue; _kd.set(0, -1, 0).applyQuaternion(o.quaternion); o.rotation.set(Math.atan2(-_kd.z, -_kd.y), 0, 0); }
  const h = m.head; if (!h) return;
  if (k.hq) h.quaternion.copy(k.hq.slerp(h.quaternion, 1 - Math.exp(-dt * KNOCK_HEAD))); else k.hq = h.quaternion.clone();
}
// the pose the rig's in, kept (snapQ, snapG, snapH), and the rig eased from it toward where it's posed now by w
const snapPose = m => ({ snapQ: KNOCK_PARTS.map(p => m[p] && m[p].quaternion ? m[p].quaternion.clone() : null), snapG: m.g.position.clone(), snapH: m.head.position.clone() });
function easeFrom(m, k, w) {
  KNOCK_PARTS.forEach((p, n) => { const o = m[p]; if (o && o.quaternion && k.snapQ[n]) o.quaternion.slerpQuaternions(k.snapQ[n], _kq.copy(o.quaternion), w); });
  m.g.position.lerpVectors(k.snapG, _kp.copy(m.g.position), w);
}
// the get-up's joints at its time gt: a smooth curve through the keys (each joint's speed carried through every key,
// so it flows from one to the next instead of stopping at each), the head a moment behind, the arms each a little
// off, and a slow drift on the head and arms
function sampleGetUp(k, j) {
  const t = k.gt, ks = k.keys;
  for (let i = 0; i < ZJ_N; i++) j[i] = hermiteAt(ks, k.times, i, t - k.lag[i]);
  const env = Math.sin(Math.PI * clamp(t / k.T, 0, 1));
  for (let n = 0; n < k.wob.length; n++) { const [i, a, f, ph] = k.wob[n]; j[i] += a * env * Math.sin(t * f + ph); }
}
function hermiteAt(ks, ts, i, t) {
  const n = ts.length; if (t <= ts[0]) return ks[0][i]; if (t >= ts[n - 1]) return ks[n - 1][i];
  let s = 0; while (s < n - 2 && t > ts[s + 1]) s++;
  const t0 = ts[s], t1 = ts[s + 1], h = t1 - t0, u = (t - t0) / h, p0 = ks[s][i], p1 = ks[s + 1][i];
  // (the slope at a key: the line through its neighbours; none at either end, so it starts and ends at rest)
  const m0 = s > 0 ? (p1 - ks[s - 1][i]) / (t1 - ts[s - 1]) * h : 0, m1 = s < n - 2 ? (ks[s + 2][i] - p0) / (ts[s + 2] - t0) * h : 0;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}
// ---- on the ground: the body's corners (each part's box), the lowest of them set on the ground, and whatever's on
// the ground held where it is from one frame to the next (moving the zombie instead), weighted by how close to the
// ground each is so a hand or a foot taking the weight takes over smoothly ----
const GU_BOXES = [['upper', [0.22, 0.06, 0.15], [0.22, 0.56, -0.15]], ['head', [0.16, -0.16, 0.16], [0.16, 0.16, -0.16]],
  ['legL', [0.095, 0, 0.11], [0.095, -0.27, -0.11]], ['legR', [0.095, 0, 0.11], [0.095, -0.27, -0.11]],
  ['shinL', [0.09, 0, 0.107], [0.09, -0.28, -0.107]], ['shinR', [0.09, 0, 0.107], [0.09, -0.28, -0.107]],
  ['armL', [0.07, 0.07, -0.02], [0.07, -0.07, 0.27]], ['armR', [0.07, 0.07, -0.02], [0.07, -0.07, 0.27]],
  ['foreL', [0.065, 0.065, -0.01], [0.065, -0.065, 0.28]], ['foreR', [0.065, 0.065, -0.01], [0.065, -0.065, 0.28]]];
const GU_PTS = []; for (const [p, a, b] of GU_BOXES) for (const sx of [-1, 1]) for (const y of [a[1], b[1]]) for (const zz of [a[2], b[2]]) GU_PTS.push([p, new V3(a[0] * sx, y, zz)]);
// (the limb each part belongs to, gone if it's been shot off)
const GU_LIMB = { legL: 'legL', shinL: 'legL', legR: 'legR', shinR: 'legR', armL: 'armL', foreL: 'armL', armR: 'armR', foreR: 'armR', head: 'head' };
const GU_CONTACT = 0.07, _gw = new V3();
function getUpGround(z, k, base) {
  const m = z.m; m.g.updateMatrixWorld(true);
  const pts = k.pts || (k.pts = new Float32Array(GU_PTS.length * 3)), on = k.on || (k.on = new Float32Array(GU_PTS.length));
  let lo = 1e9;
  for (let i = 0; i < GU_PTS.length; i++) {
    const [p, v] = GU_PTS[i], o = m[p];
    if (!o || (GU_LIMB[p] && !z.limbs[GU_LIMB[p]])) { pts[i * 3 + 1] = 1e9; continue; }
    _gw.copy(v); o.localToWorld(_gw); pts[i * 3] = _gw.x; pts[i * 3 + 1] = _gw.y; pts[i * 3 + 2] = _gw.z; if (_gw.y < lo) lo = _gw.y;
  }
  const dy = base - lo; m.g.position.y += dy;
  // whatever was on the ground last frame and still is: kept where it was
  let sx = 0, sz = 0, sw = 0;
  for (let i = 0; i < GU_PTS.length; i++) {
    const y = pts[i * 3 + 1] + dy - base, w = y > 1e8 ? 0 : clamp(1 - y / GU_CONTACT, 0, 1), w0 = k.prevOn ? Math.min(w, k.on[i]) : 0;
    if (w0 > 0) { sx += (k.px[i] - pts[i * 3]) * w0; sz += (k.pz[i] - pts[i * 3 + 2]) * w0; sw += w0; }
    on[i] = w;
  }
  const ox = sw > 0 ? sx / sw : 0, oz = sw > 0 ? sz / sw : 0;
  if (ox || oz) { z.x += ox; z.z += oz; m.g.position.x += ox; m.g.position.z += oz; }
  k.px = k.px || new Float32Array(GU_PTS.length); k.pz = k.pz || new Float32Array(GU_PTS.length);
  for (let i = 0; i < GU_PTS.length; i++) { k.px[i] = pts[i * 3] + ox; k.pz[i] = pts[i * 3 + 2] + oz; }
  k.prevOn = true;
}
// from lying still to the get-up: which way up it's lying (its chest to the ground or the sky) and where its head and
// feet are say which get-up and which way it'll face, and where it stands (its feet); the pose it's in kept to ease
// out of. Which of them, mirrored or not, how quick, and how it's put a little off each time come from the knock's seed
function getUp(z) {
  const k = z.knock, r = k.r, p = r.p, m = z.m;
  ragFrame(p);
  const prone = _rgZ.y < 0, hx = (p[6] + p[9]) / 2 - _rgH.x, hz = (p[8] + p[11]) / 2 - _rgH.z;   // (chest down; hips to shoulders)
  z.face = prone ? Math.atan2(hx, hz) : Math.atan2(-hx, -hz);
  // where it stands: the feet it has (else under the hips, a leg's length back from them)
  let fx = 0, fz = 0, n = 0; for (const q of [10, 12]) if (r.on[q]) { fx += p[q * 3]; fz += p[q * 3 + 2]; n++; }
  const L = Math.hypot(hx, hz) || 1;
  if (n) { fx /= n; fz /= n; } else { fx = _rgH.x - hx / L * 0.55 * r.s; fz = _rgH.z - hz / L * 0.55 * r.s; }
  z.x = fx; z.z = fz;
  Object.assign(k, snapPose(m));
  withSeed(k.seed + 1, () => {
    const src = pick(KNOCK_UPS[prone ? 'prone' : 'supine']), mir = rand() < 0.5;
    k.times = src.map(e => e[0]); k.T = k.times[k.times.length - 1];
    k.keys = src.map((e, ki) => {
      const v = new Float32Array(ZJ_N), o = e[1];
      for (const nm in o) v[ZJ[nm]] = o[nm];
      if (mir) {
        for (const [a, b, sg] of MIRROR_SWAP) { const A = v[ZJ[a]], B = v[ZJ[b]]; v[ZJ[a]] = B * (sg || 1); v[ZJ[b]] = A * (sg || 1); }
        for (const nm of MIRROR_NEG) v[ZJ[nm]] = -v[ZJ[nm]];
      }
      // (put a little off: never the first key, which it's eased into from where it lies)
      if (ki) for (const nm of ['ux', 'uy', 'uz', 'hx', 'hy', 'hz', 'alx', 'aly', 'arx', 'ary', 'elL', 'elR']) v[ZJ[nm]] += rr(-1, 1) * GETUP_LOOSE.jit;
      return v;
    });
    k.lag = new Float32Array(ZJ_N);
    for (const i of GU_HEAD) k.lag[i] = GETUP_LOOSE.lag * rr(0.6, 1.4);
    const aL = rr(-1, 1) * GETUP_LOOSE.arm, aR = rr(-1, 1) * GETUP_LOOSE.arm;
    for (const i of GU_ARML) k.lag[i] = aL; for (const i of GU_ARMR) k.lag[i] = aR;
    k.wob = [...GU_HEAD, ...GU_ARML, ...GU_ARMR].map(i => [i, GETUP_LOOSE.wob * rr(0.4, 1), rr(2, 4.5), rand() * 6.283]);
    k.pace = rr(...KNOCK.pace) * (z.type === 'runner' ? RUN_PACE : 1);
  });
  k.ph = 'up'; k.gt = 0; k.prev = null; k.prevOn = false;
}
