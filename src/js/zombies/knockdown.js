// Zombies knocked off their feet: run down by a charging brute (zombies/brute-dash.js), thrown forward along its way
// as a ragdoll (zombies/deaths.js), and once they've come to rest, back up again: a get-up played on the same joints
// the walk is (zombies/zombie-anim.js), eased in from however the body landed and handed back to the walk where it
// leaves off, so there's never a jump from one to the next.

// force: how hard it's thrown (makeRagdoll's, on the order of a heavy hit's); side: how much of the throw goes out to
// the side it was on; rest: the least time it lies there, and the longest it's left settling before it gets up;
// blend: how long the get-up takes to ease out of the pose it landed in; fall: how long the fall takes to ease out of
// the stride it was in (the ragdoll's frame is the trunk's, not quite the walk's)
const KNOCK = { force: 10, side: 0.45, rest: 0.6, maxDown: 1.3, blend: 0.32, fall: 0.12 };
// the get-up, as keyed values of the walk's joints (ZJN, zombies/zombie-anim.js; any not given is 0) through time:
// face down it plants its hands, pushes up onto its knees, brings one foot forward and is up; face up it sits up on
// its hands, gathers its feet under it into a crouch and stands. Root pitch rx turns the body about its feet; y and fw
// shift it down and along so the hips stay over where they are. It's handed back to the walk's springs after its
// last key, partway up, and they carry it the rest of the way onto its feet
const GETUP = {
  prone: [
    [0, { rx: 1.5, y: 0.13, hx: -0.6, alx: -0.9, arx: -0.9, elL: -0.2, elR: -0.2 }],
    [0.32, { rx: 1.45, y: 0.15, hx: -0.55, alx: 0.15, arx: 0.15, elL: -0.7, elR: -0.7, llx: -0.15, lrx: -0.15, klx: 0.4, krx: 0.4 }],
    [0.72, { rx: 0.85, ux: 0.2, hx: -0.4, alx: 0.5, arx: 0.5, elL: -0.15, elR: -0.15, llx: -0.85, lrx: -0.85, klx: 1.57, krx: 1.57 }],
    [1.1, { rx: 0.35, y: -0.2, ux: 0.15, hx: -0.2, alx: 0.6, arx: 0.4, elL: -0.3, elR: -0.2, llx: -1.92, klx: 1.57, lrx: -0.35, krx: 1.57 }],
    [1.4, { rx: 0.2, y: -0.12, ux: 0.1, hx: -0.1, alx: 0.4, arx: 0.4, llx: -1.0, klx: 1.2, lrx: -0.4, krx: 1.0 }]
  ],
  supine: [
    [0, { rx: -1.5, y: 0.13, hx: 0.5, alx: 1.2, arx: 1.2 }],
    [0.45, { rx: -0.3, y: -0.4, fw: -0.39, ux: 0.1, hx: 0.1, alx: 2.4, arx: 2.4, elL: -0.2, elR: -0.2, llx: -1.27, lrx: -1.27 }],
    [0.95, { rx: 0.6, y: -0.1, fw: -0.49, ux: 0.15, hx: -0.3, alx: 0.3, arx: 0.3, elL: -0.4, elR: -0.4, llx: -1.87, lrx: -1.87, klx: 1.57, krx: 1.57 }],
    [1.3, { rx: 0.25, y: -0.08, fw: -0.25, ux: 0.1, hx: -0.1, alx: 0.35, arx: 0.35, llx: -0.9, lrx: -0.9, klx: 1.1, krx: 1.1 }]
  ]
};
const KNOCK_PARTS = ['g', 'lower', 'upper', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
// o run down by brute z charging along (dx, dz): thrown forward and out to the side it was on. The host decides;
// everyone else's game plays the same fall (net/sync.js: 'zk', the same seed)
function dashPlow(z, d) {
  if (netClient()) return;
  for (const o of zombies) {
    if (o === z || o.dead || o.knock || o.type === 'brute' || o.vault || o.dash) continue;
    const ox = o.x - z.x, oz = o.z - z.z, dist = Math.hypot(ox, oz); if (dist > z.T.r + o.T.r + 0.18) continue;
    if (ox * d.dx + oz * d.dz < -0.1) continue;   // (only what's in front of it)
    const side = Math.sign(ox * d.dz - oz * d.dx) || 1, kx = d.dx + d.dz * side * KNOCK.side, kz = d.dz - d.dx * side * KNOCK.side, L = Math.hypot(kx, kz);
    const seed = (rand() * 1e9) | 0;
    knockDown(o, kx / L, kz / L, seed);
    if (netLink() && o.id) netSend('zk', { id: o.id, dx: nr(kx / L), dz: nr(kz / L), s: seed });
  }
}
function knockDown(z, dx, dz, seed) {
  if (z.dead || z.knock) return;
  const m = z.m, head0 = m.head.position.clone(), snap = snapPose(m);
  z.atkBoard = z.atkDoor = null; z.atkFence = false; z.vx = z.vz = 0; z.lunge = 0;
  const r = withSeed(seed, () => makeRagdoll(z, dx, dz, 'torso', KNOCK.force, null, { upY: ZHIP, list: [] }));
  z.knock = { r, t: 0, ph: 'down', head0, ...snap };
  soundAt(z.x, z.z, () => { SFX.thud(); nz(0.18, 'lowpass', 500, 120, 0.3); }, true);
  burst(z.x, 0.9, z.z, 4, 'dust', dx, dz, 1.5);
}
// every frame while it's down or getting up (zombies/ai.js leaves the rest of its turn alone meanwhile)
function stepKnock(z, dt) {
  const k = z.knock, m = z.m; k.t += dt;
  if (k.ph === 'down') {
    stepRagdoll(k.r, dt); z.x = k.r.x; z.z = k.r.z;
    if (k.t < KNOCK.fall) easeFrom(m, k, smooth(k.t / KNOCK.fall));
    if (k.t > KNOCK.rest && (k.r.sleep || k.r.still > 0.2 || k.t > KNOCK.maxDown)) getUp(z);
    return;
  }
  // getting up: the keys sampled at this moment into the walk's joints, posed, and for the first KNOCK.blend eased
  // from the pose it landed in
  k.gt += dt;
  const keys = k.keys, j = z.an.j;
  let i = 0; while (i < keys.length - 2 && k.gt > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1], u = smooth(clamp((k.gt - t0) / (t1 - t0), 0, 1));
  j.fill(0);
  for (const n in a) j[ZJ[n]] += a[n] * (1 - u);
  for (const n in b) j[ZJ[n]] += b[n] * u;
  z.an.v.fill(0);
  zApply(z, m, j, surfaceY(z.x, z.z));
  const w = smooth(clamp(k.gt / KNOCK.blend, 0, 1));
  if (w < 1) easeFrom(m, k, w);
  m.head.position.lerpVectors(k.snapH, k.head0, w);
  if (k.gt >= keys[keys.length - 1][0]) {
    // up: the walk takes over from here, from these very joint values, its springs carrying it the rest of the way
    m.head.position.copy(k.head0); z.knock = null; z.stagger = Math.max(z.stagger || 0, 0.35);
    z.an.px = z.x; z.an.pz = z.z; z.an.pf = z.face;
  }
}
const _kq = new THREE.Quaternion(), _kp = new V3();
// the pose the rig's in, kept (snapQ, snapG, snapH), and the rig eased from it toward where it's posed now by w
const snapPose = m => ({ snapQ: KNOCK_PARTS.map(p => m[p] && m[p].quaternion ? m[p].quaternion.clone() : null), snapG: m.g.position.clone(), snapH: m.head.position.clone() });
function easeFrom(m, k, w) {
  KNOCK_PARTS.forEach((p, n) => { const o = m[p]; if (o && o.quaternion && k.snapQ[n]) o.quaternion.slerpQuaternions(k.snapQ[n], _kq.copy(o.quaternion), w); });
  m.g.position.lerpVectors(k.snapG, _kp.copy(m.g.position), w);
}
// from lying still to the get-up: which way up it's lying (its chest to the ground or the sky) and where its head and
// feet are say which get-up and which way it'll face, and where it stands (its feet); the pose it's in kept to ease
// out of
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
  k.keys = GETUP[prone ? 'prone' : 'supine']; k.ph = 'up'; k.gt = 0;
  m.g.rotation.order = 'YXZ';
}
