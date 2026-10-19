// Deaths: a light ragdoll, taken over from the pose the zombie died in.

// The body the moment it dies is taken as thirteen points (hips, shoulders, head, elbows, hands, knees, feet), held
// together by sticks the rig's own lengths, and let go under its own weight: the killing hit throws the points it
// landed on (a head shot snaps the head back, a shot to the legs sweeps them out from under it), a limb taken off in
// the same blow jerks its stump and leaves that side with nothing to hold it up, and what it was doing carries on into
// the fall (a runner tumbles on forward, a climber goes on over the sill). For a moment it's still stiff, pulled toward
// the pose it died in, the legs giving first so the knees buckle under it; then it's dead weight, folding over and
// bouncing a little as it lands. The knees only bend one way, the head can't loll right round, and walls, fences, sills
// and the floor stop it. The rig is then posed off the points every frame (ragPose), smoothed between steps; a body
// that's lain still for a moment is left as it is and costs nothing
const ragdolls = [];
// 0 1 the hips, 2 3 the shoulders, 4 the head, 5 6 the left elbow and hand, 7 8 the right's, 9 10 the left knee and
// foot, 11 12 the right's: where each is on the rig stood straight with its arms out in front (metres, before the
// zombie's own size: RAG_AT), how heavy (RAG_MASS) and how far off the ground it rests (RAG_R, half that part's thickness)
const RAG_AT = [[-0.13, 0.55, 0], [0.13, 0.55, 0], [-0.33, 1.08, 0], [0.33, 1.08, 0], [0, 1.33, 0], [-0.33, 1.08, 0.26], [-0.33, 1.08, 0.53], [0.33, 1.08, 0.26], [0.33, 1.08, 0.53], [-0.13, 0.28, 0], [-0.13, 0, 0], [0.13, 0.28, 0], [0.13, 0, 0]];
const RAG_MASS = [3, 3, 2.4, 2.4, 1.5, 0.9, 0.6, 0.9, 0.6, 1.5, 1, 1.5, 1];
const RAG_R = [0.1, 0.1, 0.09, 0.09, 0.15, 0.07, 0.06, 0.07, 0.06, 0.09, 0.08, 0.09, 0.08];
// the sticks: two points, held at their standing distance, or (with lo and hi, as parts of it) kept within that: the
// head off the hips (how far it can nod), a hand off its shoulder and a foot off its hip (how far an elbow or a knee
// folds), the knees and feet off each other, and a knee off its shoulder (a leg can't fold up into the chest)
const RAG_STICKS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2], [4, 2], [4, 3], [4, 0, 0.86, 1.03], [4, 1, 0.86, 1.03],
  [2, 5], [5, 6], [3, 7], [7, 8], [2, 6, 0.4, 9], [3, 8, 0.4, 9],
  [0, 9], [9, 10], [1, 11], [11, 12], [0, 10, 0.45, 9], [1, 12, 0.45, 9], [9, 11, 0.5, 9], [10, 12, 0.35, 9], [9, 2, 0.62, 9], [11, 3, 0.62, 9]];
const RAG_LIMB = { armL: [5, 6, 2], armR: [7, 8, 3], legL: [9, 10, 0], legR: [11, 12, 1] };
// where the killing hit lands: the points it throws hardest, then the ones next to them
const RAG_HIT = { head: [[4], [2, 3]], torso: [[2, 3], [0, 1, 4]], armL: [[5, 6], [2]], armR: [[7, 8], [3]], legL: [[9, 10], [0]], legR: [[11, 12], [1]], crush: [[4, 2, 3], [0, 1]] };
// RAG: gravity (a little over the real thing, so a body comes down with some weight from this high up), the fixed step
// and the most steps in a frame, solver passes a step; how stiff a body still is as it goes (tone: how hard it's pulled
// toward the pose it died in) and how soon that's gone (toneT), and how much less the legs hold (legTone, so they give
// first); how much the ground holds what's on it (grip, each step) and how much a fall bounces back; air drag; when a
// body counts as still (under sleepV m/s for sleepT s) and is left as it lies; the most bodies worked out at once
// (live: past that the oldest is left as it is); and how hard a hit throws what it lands on (hit), what's next to it
// (near), and the whole body (all), times the weapon's force
const RAG = { grav: 13, h: 1 / 60, maxSteps: 3, iters: 4, tone: 0.5, toneT: 0.55, legTone: 0.3, grip: 0.22, bounce: 0.2, air: 0.996, sleepV: 0.09, sleepT: 0.5, live: 16, hit: 0.62, near: 0.28, all: 0.16 };
const _rgV = new V3(), _rgM = new THREE.Matrix4(), _rgQ = new THREE.Quaternion(), _rgQi = new THREE.Quaternion(), _rgQ2 = new THREE.Quaternion();
const _rgX = new V3(), _rgY = new V3(), _rgZ = new V3(), _rgH = new V3(), _rgD = new V3(), _rgP = new V3();
const _rgUp = new V3(0, 1, 0), _rgDn = new V3(0, -1, 0), _rgFw = new V3(0, 0, 1);

// how high whatever stands in this spot is (0: nothing, it's floor): a wall, a tall or a low prop, a fence, a window's
// sill, or the boards over a door or window
function ragTop(x, z) {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return 0;
  const k = idx(i, j), t = cell[k];
  if (t === WALL) return 2.6; if (t === OBST) return lowObst.has(k) ? 0.75 : 2; if (t === FENCE) return 0.9;
  if (t === OPEN) { const o = openAt[k]; return o.boards.length ? 2.2 : o.kind === 'window' ? 0.95 : 0; }
  return 0;
}
// the trunk's frame off the hips and shoulders in p: _rgH between the hips, _rgY up the spine, _rgX across it to the
// right, _rgZ out of its front
function ragFrame(p) {
  _rgH.set((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2);
  _rgY.set((p[6] + p[9]) / 2 - _rgH.x, (p[7] + p[10]) / 2 - _rgH.y, (p[8] + p[11]) / 2 - _rgH.z).normalize();
  _rgX.set(p[3] - p[0] + p[9] - p[6], p[4] - p[1] + p[10] - p[7], p[5] - p[2] + p[11] - p[8]);
  _rgX.addScaledVector(_rgY, -_rgX.dot(_rgY)).normalize(); _rgZ.crossVectors(_rgX, _rgY);
}

function makeRagdoll(z, dx, dz, part, force, wId) {
  const m = z.m, s = z.T.scale, D = (wId && (W(wId) || EFF[wId])) || {}, n = RAG_AT.length, cut = z.cut || {};
  const p = new Float32Array(n * 3), on = new Uint8Array(n).fill(1);
  if (!z.limbs.head) on[4] = 0;
  for (const L in RAG_LIMB) { const [a, b] = RAG_LIMB[L]; if (!z.limbs[L]) on[a] = on[b] = 0; else if (cut[L]) on[b] = 0; }
  // where each point is now, off the rig as it stands (or crawls, or climbs)
  m.g.updateMatrixWorld(true);
  const put = (k, o, x, y, zz) => { _rgV.set(x, y, zz); o.localToWorld(_rgV); p[k * 3] = _rgV.x; p[k * 3 + 1] = _rgV.y; p[k * 3 + 2] = _rgV.z; };
  put(0, m.lower, -0.13, 0.55, 0); put(1, m.lower, 0.13, 0.55, 0); put(2, m.upper, -0.33, 1.08 - ZHIP, 0); put(3, m.upper, 0.33, 1.08 - ZHIP, 0);
  if (on[4]) put(4, m.head, 0, 0, 0);
  for (const sd of ['L', 'R']) {
    const [e, hd] = RAG_LIMB['arm' + sd], [kn, ft] = RAG_LIMB['leg' + sd];
    if (on[e]) put(e, m['arm' + sd], 0, 0, Z_ELBOW); if (on[hd]) put(hd, m['fore' + sd], 0, 0, 0.27);
    if (on[kn]) put(kn, m['leg' + sd], 0, Z_KNEE, 0); if (on[ft]) put(ft, m['shin' + sd], 0, -0.28, 0);
  }
  // the sticks, at this body's size, between the points it still has
  const at = k => _rgV.fromArray(RAG_AT[k]).multiplyScalar(s), sticks = [];
  for (const [a, b, lo, hi] of RAG_STICKS) {
    if (!on[a] || !on[b]) continue;
    const L = at(a).distanceTo(_rgD.fromArray(RAG_AT[b]).multiplyScalar(s));
    sticks.push([a, b, lo === undefined ? L : L * lo, lo === undefined ? L : L * hi]);
  }
  // the pose it died in, in the trunk's own frame, for the stiffness it keeps a moment (RAG.tone)
  ragFrame(p); const loc = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { _rgD.set(p[k * 3] - _rgH.x, p[k * 3 + 1] - _rgH.y, p[k * 3 + 2] - _rgH.z); loc[k * 3] = _rgD.dot(_rgX); loc[k * 3 + 1] = _rgD.dot(_rgY); loc[k * 3 + 2] = _rgD.dot(_rgZ); }
  // and how it's moving: a velocity is where each point was a step ago (q). It carries on the way it was going, the
  // hit throws the points it landed on and those next to them and the whole body a little; a blast lifts it off its
  // feet, a sledgehammer drives the head and shoulders down, a swing turns the shoulders round
  const q = new Float32Array(p), h = RAG.h, im = new Float32Array(n);
  for (let k = 0; k < n; k++) im[k] = 1 / RAG_MASS[k];
  const push = (k, vx, vy, vz) => { q[k * 3] -= vx * h; q[k * 3 + 1] -= vy * h; q[k * 3 + 2] -= vz * h; };
  const cx = clamp(z.vx || 0, -4, 4), cz = clamp(z.vz || 0, -4, 4), boom = wId === 'boom';
  for (let k = 0; k < n; k++) push(k, cx + dx * force * RAG.all + rr(-0.25, 0.25), boom ? rr(2, 3) : rr(0, 0.15), cz + dz * force * RAG.all + rr(-0.25, 0.25));
  const [hit, near] = RAG_HIT[part] || RAG_HIT.torso;
  for (const k of hit) push(k, dx * force * RAG.hit * rr(0.85, 1.15), part === 'crush' ? -3 : force * 0.06, dz * force * RAG.hit * rr(0.85, 1.15));
  for (const k of near) push(k, dx * force * RAG.near, 0, dz * force * RAG.near);
  if (D.melee && part !== 'crush') { const sg = rand() < 0.5 ? -1 : 1, t = force * 0.25 * sg; push(2, -dz * t, 0, dx * t); push(3, dz * t, 0, -dx * t); }
  // a limb taken off by this blow: its stump jerks with it
  for (const sp of z.spurts) if (sp.t > 1.1) { const L = RAG_LIMB[sp.part], k = L ? L[2] : sp.part === 'head' ? 2 + (rand() < 0.5 ? 1 : 0) : -1; if (k >= 0) push(k, dx * force * 0.3, 0.6, dz * force * 0.3); }
  // a climber goes on over the sill the way it was going
  if (z.vault) { const v = z.vault, L = Math.hypot(v.x1 - v.x0, v.z1 - v.z0) || 1; for (let k = 0; k < n; k++) push(k, (v.x1 - v.x0) / L * 1.6, 0.3, (v.z1 - v.z0) / L * 1.6); }
  // a point that starts inside something (a climber's legs in the wall under the sill) is let through it till it's out
  const ghost = new Uint8Array(n); for (let k = 0; k < n; k++) if (on[k] && ragTop(p[k * 3], p[k * 3 + 2]) > p[k * 3 + 1] - RAG_R[k] * s) ghost[k] = 1;
  // only so many bodies are worked out at once: past that the oldest still moving is left as it lies
  const live = ragdolls.filter(o => !o.sleep); if (live.length >= RAG.live) live[0].sleep = true;
  const r = { g: m.g, mats: z.fade || m.mats, dm: z.dm, blob: z.blob, m, limbs: z.limbs, s, p, q, o: new Float32Array(p), v: new Float32Array(p), on, im, loc, sticks, ghost, acc: 0, st: 0, still: 0, sleep: false, gy: 0,
    x: z.x, z: z.z, t: 0, pooled: false, stain: z.stain, vis: z.vis, burn: z.burn > 0 ? Math.max(z.burn, 4) : 0, flash: z.flash || 0, eyes: z.limbs.head ? m.eyes : null, eyeH: z.eyeH, eyeGlow: z.limbs.head ? 1 : 0, eyeT: 0 };
  m.g.scale.setScalar(s);
  ragPose(r, p);
  ragdolls.push(r);
}

// one step of the body: the stiffness it has left pulls it toward the pose it died in, everything moves on and falls,
// then the sticks, the knees and the world are put right a few times over
function ragStep(r, h) {
  const p = r.p, q = r.q, on = r.on, n = on.length, s = r.s, g = RAG.grav * h * h;
  r.st += h;
  const tn = RAG.tone * Math.pow(Math.max(0, 1 - r.st / RAG.toneT), 2);
  ragFrame(p);
  if (tn > 0) for (let k = 4; k < n; k++) {
    if (!on[k]) continue;
    const i = k * 3, w = tn * (k >= 9 ? RAG.legTone : 1), l = r.loc;
    p[i] += (_rgH.x + _rgX.x * l[i] + _rgY.x * l[i + 1] + _rgZ.x * l[i + 2] - p[i]) * w;
    p[i + 1] += (_rgH.y + _rgX.y * l[i] + _rgY.y * l[i + 1] + _rgZ.y * l[i + 2] - p[i + 1]) * w;
    p[i + 2] += (_rgH.z + _rgX.z * l[i] + _rgY.z * l[i + 1] + _rgZ.z * l[i + 2] - p[i + 2]) * w;
  }
  for (let k = 0; k < n; k++) {
    if (!on[k]) continue;
    const i = k * 3, vx = (p[i] - q[i]) * RAG.air, vy = (p[i + 1] - q[i + 1]) * RAG.air, vz = (p[i + 2] - q[i + 2]) * RAG.air;
    q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
    p[i] += vx; p[i + 1] += vy - g; p[i + 2] += vz;
  }
  for (let it = 0; it < RAG.iters; it++) {
    for (const c of r.sticks) {
      const a = c[0] * 3, b = c[1] * 3, ex = p[b] - p[a], ey = p[b + 1] - p[a + 1], ez = p[b + 2] - p[a + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d < 1e-6) continue;
      const t = d < c[2] ? c[2] : d > c[3] ? c[3] : d; if (t === d) continue;
      const wa = r.im[c[0]], wb = r.im[c[1]], f = (d - t) / d / (wa + wb);
      p[a] += ex * f * wa; p[a + 1] += ey * f * wa; p[a + 2] += ez * f * wa;
      p[b] -= ex * f * wb; p[b + 1] -= ey * f * wb; p[b + 2] -= ez * f * wb;
    }
    // a knee bends only one way (forward of the line from hip to foot) and a thigh can't go far back behind the hip
    for (const [hp, kn, ft] of [[0, 9, 10], [1, 11, 12]]) {
      if (!on[kn]) continue;
      const a = hp * 3, b = kn * 3;
      if (on[ft]) {
        const c = ft * 3, tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], tz = p[b + 2] - p[a + 2], sx = p[c] - p[b], sy = p[c + 1] - p[b + 1], sz = p[c + 2] - p[b + 2];
        if ((ty * sz - tz * sy) * _rgX.x + (tz * sx - tx * sz) * _rgX.y + (tx * sy - ty * sx) * _rgX.z < 0) {
          const ux = p[c] - p[a], uy = p[c + 1] - p[a + 1], uz = p[c + 2] - p[a + 2], u = (tx * ux + ty * uy + tz * uz) / (ux * ux + uy * uy + uz * uz || 1);
          p[b] = p[a] + ux * u + _rgZ.x * 0.01 * s; p[b + 1] = p[a + 1] + uy * u + _rgZ.y * 0.01 * s; p[b + 2] = p[a + 2] + uz * u + _rgZ.z * 0.01 * s;
        }
      }
      const back = (p[b] - p[a]) * _rgZ.x + (p[b + 1] - p[a + 1]) * _rgZ.y + (p[b + 2] - p[a + 2]) * _rgZ.z, lim = -0.14 * s;
      if (back < lim) { p[b] += _rgZ.x * (lim - back); p[b + 1] += _rgZ.y * (lim - back); p[b + 2] += _rgZ.z * (lim - back); }
    }
    ragWorld(r, it === RAG.iters - 1);
  }
  // still? then it's left as it lies
  let vmax = 0; for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3; vmax = Math.max(vmax, Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])); }
  r.still = vmax / h < RAG.sleepV && r.st > 0.8 ? r.still + h : 0;
  if (r.still > RAG.sleepT) r.sleep = true;
}
// the world against each point: out of a wall or a prop the way it came, onto the top of a sill or a fence it came
// down on, and up off the floor; the last pass also grips what's on the ground and bounces what hit it, and the first
// hard landing of the trunk thumps and knocks a little blood and dust out of it
function ragWorld(r, last) {
  const p = r.p, q = r.q, on = r.on, s = r.s;
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue;
    const i = k * 3, rad = RAG_R[k] * s;
    let top = ragTop(p[i], p[i + 2]), floor = 0;
    if (r.ghost[k]) { if (top <= p[i + 1] - rad) r.ghost[k] = 0; else top = 0; }
    if (top > 0 && p[i + 1] - rad < top) {
      if (q[i + 1] - rad >= top - 0.06) floor = top;   // came down on it: it lies on top
      else if (ragTop(q[i], p[i + 2]) < p[i + 1] - rad) { p[i] = q[i]; top = 0; }   // backed out the way it came
      else if (ragTop(p[i], q[i + 2]) < p[i + 1] - rad) { p[i + 2] = q[i + 2]; top = 0; }
      else { p[i] = q[i]; p[i + 2] = q[i + 2]; top = 0; }
    }
    if (!floor) floor = surfaceY(p[i], p[i + 2]);
    if (p[i + 1] - rad >= floor) continue;
    const vy = p[i + 1] - q[i + 1]; p[i + 1] = floor + rad;
    if (!last) continue;
    q[i] = p[i] - (p[i] - q[i]) * (1 - RAG.grip); q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * (1 - RAG.grip);
    q[i + 1] = vy < 0 ? p[i + 1] + vy * RAG.bounce : p[i + 1];
    if (!r.pooled && k < 4 && vy / RAG.h < -1.2) {
      r.pooled = true;
      burst(p[i], 0.15, p[i + 2], 5, 'blood', 0, 0, 0.6); burst(p[i], 0.1, p[i + 2], 4, 'dust');
      if (Math.hypot(p[i] - P.x, p[i + 2] - P.z) < 12) soundAt(p[i], p[i + 2], () => SFX.thud());
    }
  }
}
// the rig posed off the points (v: where they are this frame): the whole body turned and placed by its trunk, each
// limb pointed at its next joint, the head set where its point is and tipped off the shoulders
function ragPose(r, v) {
  const m = r.m, g = r.g, s = r.s, on = r.on, lb = r.limbs;
  ragFrame(v);
  _rgM.makeBasis(_rgX, _rgY, _rgZ); _rgQ.setFromRotationMatrix(_rgM); g.quaternion.copy(_rgQ);
  g.position.copy(_rgH).addScaledVector(_rgY, -ZHIP * s); _rgP.copy(g.position);   // (the rig's hips are ZHIP up off its feet)
  m.lower.rotation.set(0, 0, 0); m.upper.rotation.set(0, 0, 0);
  _rgQi.copy(_rgQ).invert();
  const aim = (o, k0, k1, rest, qi) => { _rgD.set(v[k1 * 3] - v[k0 * 3], v[k1 * 3 + 1] - v[k0 * 3 + 1], v[k1 * 3 + 2] - v[k0 * 3 + 2]).applyQuaternion(qi).normalize(); o.quaternion.setFromUnitVectors(rest, _rgD); };
  for (const sd of ['L', 'R']) {
    const [e, hd, sh] = RAG_LIMB['arm' + sd], [kn, ft, hp] = RAG_LIMB['leg' + sd];
    if (on[e] && lb['arm' + sd]) { const a = m['arm' + sd]; aim(a, sh, e, _rgFw, _rgQi); if (on[hd]) aim(m['fore' + sd], e, hd, _rgFw, _rgQ2.copy(a.quaternion).invert().multiply(_rgQi)); }
    if (on[kn] && lb['leg' + sd]) { const l = m['leg' + sd]; aim(l, hp, kn, _rgDn, _rgQi); if (on[ft]) aim(m['shin' + sd], kn, ft, _rgDn, _rgQ2.copy(l.quaternion).invert().multiply(_rgQi)); }
  }
  if (on[4]) {
    _rgD.set(v[12] - (v[6] + v[9]) / 2, v[13] - (v[7] + v[10]) / 2, v[14] - (v[8] + v[11]) / 2).applyQuaternion(_rgQi).normalize(); m.head.quaternion.setFromUnitVectors(_rgUp, _rgD);
    _rgD.set(v[12], v[13], v[14]).sub(_rgP).applyQuaternion(_rgQi).divideScalar(s); m.head.position.set(_rgD.x, _rgD.y - ZHIP, _rgD.z);
  }
  r.gy = g.position.y; r.x = _rgH.x; r.z = _rgH.z;
  // its shadow under the trunk, stretched out along it the flatter it lies
  if (r.blob) {
    const lay = 1 - Math.abs(_rgY.y), sx = (v[6] + v[9]) / 2, sz = (v[8] + v[11]) / 2;
    r.blob.position.set((_rgH.x + sx) / 2, 0.02, (_rgH.z + sz) / 2); r.blob.rotation.y = Math.atan2(_rgY.x, _rgY.z); r.blob.scale.set(1.1 * s, 1, 1.1 * s * (1 + lay * 0.9));
  }
}
function stepRagdoll(r, dt) {
  r.t += dt;
  if (!r.sleep) {
    // fixed steps, the pose drawn between the last two so it moves smoothly at any frame rate
    r.acc = Math.min(r.acc + dt, RAG.h * RAG.maxSteps);
    while (r.acc >= RAG.h && !r.sleep) { r.acc -= RAG.h; r.o.set(r.p); ragStep(r, RAG.h); }
    const a = r.sleep ? 1 : r.acc / RAG.h, o = r.o, p = r.p, v = r.v;
    for (let i = 0; i < v.length; i++) v[i] = o[i] + (p[i] - o[i]) * a;
    ragPose(r, v);
  }
  // after a while it sinks into the ground and goes
  r.g.position.y = r.gy - Math.max(0, r.t - 8) * 0.25;
  if (r.burn > 0 && r.stain) r.stain.char = Math.min(1, r.stain.char + dt * 0.3);   // a body that went down burning smoulders on until it's black
  if (r.burn > 0) { r.burn -= dt; if (r.vis > 0.3 && r.t > 0.4) burnFx(r.x, r.z, 0.05, 0.45, 0.45 * r.s, dt * Math.min(1, r.burn)); }   // the fire dies down on the body
}
