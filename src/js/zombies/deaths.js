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
// folds), and the knees and feet off each other
const RAG_STICKS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2], [4, 2], [4, 3], [4, 0, 0.86, 1.03], [4, 1, 0.86, 1.03],
  [2, 5], [5, 6], [3, 7], [7, 8], [2, 6, 0.4, 9], [3, 8, 0.4, 9],
  [0, 9], [9, 10], [1, 11], [11, 12], [0, 10, 0.45, 9], [1, 12, 0.45, 9], [9, 11, 0.5, 9], [10, 12, 0.35, 9]];
const RAG_LIMB = { armL: [5, 6, 2], armR: [7, 8, 3], legL: [9, 10, 0], legR: [11, 12, 1] };
// where the killing hit lands: the points it throws hardest, then the ones next to them
const RAG_HIT = { head: [[4], [2, 3]], torso: [[2, 3], [0, 1, 4]], armL: [[5, 6], [2]], armR: [[7, 8], [3]], legL: [[9, 10], [0]], legR: [[11, 12], [1]], crush: [[4, 2, 3], [0, 1]] };
// RAG: gravity (a little over the real thing, so a body comes down with some weight from this high up), the fixed step
// and the most steps in a frame, solver passes a step; how stiff a body still is as it goes (tone: how hard it's pulled
// toward the pose it died in; how much each part holds, and for how long, is down to how it falls: FALLS); how much
// the ground holds what's on it (grip, each step; and what's sliding slower than stick m/s stops dead in it) and how
// much a fall bounces back; air drag; when a body counts as still (under sleepV m/s for sleepT s, down settle s, or maxT s after it died, on whatever it lies) and
// is left as it lies; the most bodies worked out at once (live: past that the oldest is left as it is); and how hard a
// hit throws what it lands on (hit), what's next to it
// (near), and the whole body (all), times the weapon's force. A body that's down settles: what touches the ground stops
// dead in it (no bounce under bounceV m/s down), and once its trunk's down it's damped (land, then still), nothing on
// it slides faster than slide m/s (vmax in the air), so it slumps where it falls rather than skidding off or twitching;
// and whatever turn it has round the upright is taken off it, a little each step in the air (yaw) and fast once it's
// down (yawDown), so it never spins on the floor
const RAG = { grav: 17, h: 1 / 60, maxSteps: 3, iters: 8, land: 0.95, slide: 1.4, vmax: 6, tone: 0.4, toneT: 0.5, grip: 0.5, stick: 0.7, settle: 2, maxT: 5, bounce: 0.08, bounceV: 1.6, air: 0.992, still: 0.9, sleepV: 0.2, sleepT: 0.3, live: 16, hit: 0.62, near: 0.28, all: 0.16, yaw: 0.04, yawDown: 1 };
// how much a round throws a body, by what it is: a 9mm hardly moves it (it drops more or less where it was hit), a
// magnum or a rifle round some, buckshot and a slug the most (a blast, a swing, a sledgehammer go by their own force)
const RAG_CAL = { p9: 0.18, magnum: 0.6, rifle: 0.7, shells: 1 };
// a skull crushed from overhead (the sledgehammer): how much of the blow's push along goes into the head and shoulders
// (along), and how hard they're driven down (down, m/s)
const RAG_CRUSH = { along: 0.35, down: -4 };
// shot through the head (not by buckshot or a blast) it's out at once: it goes limp where it stands (HEAD_DROP: what's
// left of its stiffness and how soon that's gone, and how much of the way it was going it keeps) and folds down
const HEAD_DROP = { tone: 0.16, toneT: 0.22, keep: 0.25 };
// how it goes down: never the same way twice. Each style: how likely (more of some when it's hit from in front or
// behind: front, back), how much each leg holds (legs: the fold-side leg, the other) and the upper body (up) of the
// stiffness it has, how long that lasts (toneT), and how the fall's started (m/s): the shoulders and head thrown along
// its facing (fwd: back is less than nothing) and across it (side), the hips the other way (hip), the shoulders turned
// against each other (twist: it spins as it drops). A crumple: the knees go and it drops where it stands, slumping one
// way; toppling back stiff; pitching forward onto its face; going over sideways as the leg that side gives; twisting
// round as it falls
const FALLS = [
  { k: 0.3, legs: [0.1, 0.15], up: 1, toneT: 0.7, fwd: [-0.3, 0.3], side: [0.3, 0.8], hip: 0.1 },
  { k: 0.2, back: 0.35, legs: [0.7, 0.8], up: 1, toneT: 0.65, fwd: [-2.1, -1.3], side: [0, 0.3], hip: 0.45 },
  { k: 0.15, front: 0.3, legs: [0.5, 0.6], up: 0.8, toneT: 0.55, fwd: [1.2, 1.9], side: [0, 0.3], hip: 0.35 },
  { k: 0.2, legs: [0.05, 0.6], up: 0.9, toneT: 0.6, fwd: [-0.3, 0.3], side: [1, 1.7], hip: 0.4 },
  { k: 0.15, legs: [0.2, 0.35], up: 0.9, toneT: 0.55, fwd: [-0.4, 0.4], side: [0.2, 0.6], hip: 0.2, twist: [1.1, 1.9] }
];
const _rgV = new V3(), _rgM = new THREE.Matrix4(), _rgQ = new THREE.Quaternion(), _rgQi = new THREE.Quaternion(), _rgQ2 = new THREE.Quaternion();
const _rgX = new V3(), _rgY = new V3(), _rgZ = new V3(), _rgH = new V3(), _rgD = new V3(), _rgP = new V3();
const _rgS = new V3(), _rgT = new V3(), _rgU = new V3(), _rgN = new V3();
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

// rig: a survivor's (player/player-ragdoll.js), not a zombie's: its upper body isn't raised to the hips (upY), its arms are
// one piece each (no forearms: noFore), and it's kept in its own list (list), lying where it fell (keep)
function makeRagdoll(z, dx, dz, part, force, wId, rig) {
  const m = z.m, s = z.T.scale, upY = rig ? rig.upY : ZHIP, D = (wId && (W(wId) || EFF[wId])) || {}, n = RAG_AT.length, cut = z.cut || {};
  const p = new Float32Array(n * 3), on = new Uint8Array(n).fill(1);
  if (!z.limbs.head) on[4] = 0;
  for (const L in RAG_LIMB) { const [a, b] = RAG_LIMB[L]; if (!z.limbs[L]) on[a] = on[b] = 0; else if (cut[L]) on[b] = 0; }
  // where each point is now, off the rig as it stands (or crawls, or climbs)
  m.g.updateMatrixWorld(true);
  const put = (k, o, x, y, zz) => { _rgV.set(x, y, zz); o.localToWorld(_rgV); p[k * 3] = _rgV.x; p[k * 3 + 1] = _rgV.y; p[k * 3 + 2] = _rgV.z; };
  put(0, m.lower, -0.13, 0.55, 0); put(1, m.lower, 0.13, 0.55, 0); put(2, m.upper, -0.33, 1.08 - upY, 0); put(3, m.upper, 0.33, 1.08 - upY, 0);
  if (on[4]) put(4, m.head, 0, 0, 0);
  for (const sd of ['L', 'R']) {
    const [e, hd] = RAG_LIMB['arm' + sd], [kn, ft] = RAG_LIMB['leg' + sd];
    if (on[e]) put(e, m['arm' + sd], 0, 0, Z_ELBOW); if (on[hd]) put(hd, rig && rig.noFore ? m['arm' + sd] : m['fore' + sd], 0, 0, rig && rig.noFore ? 0.53 : 0.27);
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
  const boom = wId === 'boom', cal = D.melee || boom || part === 'crush' ? 1 : RAG_CAL[D.ammo] ?? 0.5, drop = part === 'head' && !boom && !D.melee && D.ammo !== 'shells';
  const keep = drop ? HEAD_DROP.keep : 1, cx = clamp(z.vx || 0, -4, 4) * keep, cz = clamp(z.vz || 0, -4, 4) * keep;
  force *= cal;
  for (let k = 0; k < n; k++) push(k, cx + dx * force * RAG.all + rr(-0.15, 0.15), boom ? rr(2, 3) : rr(0, 0.1), cz + dz * force * RAG.all + rr(-0.15, 0.15));
  const [hit, near] = RAG_HIT[part] || RAG_HIT.torso;
  // (a blow from overhead, the sledgehammer's, drives it down more than along, and both shoulders alike: pushed apart by
  // different amounts they'd turn the body round as it went down)
  const crush = part === 'crush', ck = crush ? RAG_CRUSH.along * rr(0.9, 1.1) : 0;
  for (const k of hit) push(k, dx * force * RAG.hit * (crush ? ck : rr(0.85, 1.15)), crush ? RAG_CRUSH.down : force * 0.06, dz * force * RAG.hit * (crush ? ck : rr(0.85, 1.15)));
  for (const k of near) push(k, dx * force * RAG.near, 0, dz * force * RAG.near);
  if (D.melee && part !== 'crush') { const sg = rand() < 0.5 ? -1 : 1, t = force * 0.25 * sg; push(2, -dz * t, 0, dx * t); push(3, dz * t, 0, -dx * t); }
  // a limb taken off by this blow: its stump jerks with it
  for (const sp of z.spurts) if (sp.t > 1.1) { const L = RAG_LIMB[sp.part], k = L ? L[2] : sp.part === 'head' ? 2 + (rand() < 0.5 ? 1 : 0) : -1; if (k >= 0) push(k, dx * force * 0.3, 0.6, dz * force * 0.3); }
  // how it goes down (FALLS): picked at random, with more toppling back from a hit in front and pitching forward from
  // one behind
  const fF = [Math.sin(z.face), Math.cos(z.face)], fR = [fF[1], -fF[0]], from = -(dx * fF[0] + dz * fF[1]);   // (from: 1 hit square in the front)
  const wts = FALLS.map(f => f.k + (f.back || 0) * Math.max(0, from) + (f.front || 0) * Math.max(0, -from)), tot = wts.reduce((a, b) => a + b, 0);
  let pick = rand() * tot, fall = FALLS[0]; for (let k = 0; k < FALLS.length; k++) { pick -= wts[k]; if (pick <= 0) { fall = FALLS[k]; break; } }
  const sd = rand() < 0.5 ? -1 : 1, fw = rr(...fall.fwd) * (drop ? 0.5 : 1), sw = rr(...fall.side) * sd, tw = fall.twist && !crush ? rr(...fall.twist) * (rand() < 0.5 ? -1 : 1) : 0;   // (no twist under a sledgehammer)
  for (const k of [2, 3, 4]) push(k, fF[0] * fw + fR[0] * sw, 0, fF[1] * fw + fR[1] * sw);
  for (const k of [0, 1]) push(k, -(fF[0] * fw + fR[0] * sw) * fall.hip, 0, -(fF[1] * fw + fR[1] * sw) * fall.hip);
  if (tw) { push(2, fF[0] * tw, 0, fF[1] * tw); push(3, -fF[0] * tw, 0, -fF[1] * tw); }
  // (the leg that folds is the one on the side it goes over to: left points 9, 10, right 11, 12)
  const legK = sd < 0 ? [fall.legs[0], fall.legs[1]] : [fall.legs[1], fall.legs[0]];
  // a climber goes on over the sill the way it was going
  if (z.vault) { const v = z.vault, L = Math.hypot(v.x1 - v.x0, v.z1 - v.z0) || 1; for (let k = 0; k < n; k++) push(k, (v.x1 - v.x0) / L * 1.6, 0.3, (v.z1 - v.z0) / L * 1.6); }
  // a point that starts inside something (a climber's legs in the wall under the sill) is let through it till it's out
  const ghost = new Uint8Array(n); for (let k = 0; k < n; k++) if (on[k] && ragTop(p[k * 3], p[k * 3 + 2]) > p[k * 3 + 1] - RAG_R[k] * s) ghost[k] = 1;
  // only so many bodies are worked out at once: past that the oldest still moving is left as it lies
  if (!rig) { const live = ragdolls.filter(o => !o.sleep); if (live.length >= RAG.live) live[0].sleep = true; }
  const r = { g: m.g, mats: z.fade || m.mats, dm: z.dm, blob: z.blob, m, limbs: z.limbs, s, p, q, tone: drop ? HEAD_DROP.tone : RAG.tone, toneT: drop ? HEAD_DROP.toneT : fall.toneT, legK, upK: fall.up, o: new Float32Array(p), v: new Float32Array(p), on, im, loc, sticks, ghost, acc: 0, st: 0, still: 0, sleep: false, gy: 0,
    x: z.x, z: z.z, t: 0, pooled: false, stain: z.stain, vis: z.vis, burn: z.burn > 0 ? Math.max(z.burn, 4) : 0, flash: z.flash || 0, eyes: z.limbs.head ? m.eyes : null, eyeH: z.eyeH, eyeGlow: z.limbs.head ? 1 : 0, eyeT: 0, upY, noFore: !!(rig && rig.noFore), keep: !!rig };
  m.g.scale.setScalar(s);
  ragPose(r, p);
  (rig ? rig.list : ragdolls).push(r);
  return r;
}

// one step of the body: the stiffness it has left pulls it toward the pose it died in, everything moves on and falls,
// then the sticks, the knees and the world are put right a few times over
function ragStep(r, h) {
  const p = r.p, q = r.q, on = r.on, n = on.length, s = r.s, g = RAG.grav * h * h;
  r.st += h;
  // (the stiffness it has left goes the moment the trunk's down: holding the pose any longer flings the limbs as the
  // body turns over on the ground)
  if (r.down && !r.landT) r.landT = r.st;
  const tn = r.landT ? 0 : r.tone * Math.pow(Math.max(0, 1 - r.st / r.toneT), 2);
  // down, it's damped hard (a slump, then still), and nothing on it slides faster than RAG.slide (vmax in the air)
  const air = r.landT ? (r.st - r.landT > 0.15 ? RAG.still : RAG.land) : RAG.air, vcap = (r.landT ? RAG.slide : RAG.vmax) * h;
  ragFrame(p);
  if (tn > 0) for (let k = 4; k < n; k++) {
    if (!on[k]) continue;
    const i = k * 3, w = tn * (k >= 11 ? r.legK[1] : k >= 9 ? r.legK[0] : r.upK), l = r.loc;
    p[i] += (_rgH.x + _rgX.x * l[i] + _rgY.x * l[i + 1] + _rgZ.x * l[i + 2] - p[i]) * w;
    p[i + 1] += (_rgH.y + _rgX.y * l[i] + _rgY.y * l[i + 1] + _rgZ.y * l[i + 2] - p[i + 1]) * w;
    p[i + 2] += (_rgH.z + _rgX.z * l[i] + _rgY.z * l[i + 1] + _rgZ.z * l[i + 2] - p[i + 2]) * w;
  }
  // its spin round the upright through its middle (ω, from how it's all moving round there), part of it taken off
  let M = 0, mx = 0, mz = 0, Ly = 0, Iy = 0;
  for (let k = 0; k < n; k++) if (on[k]) { const w = RAG_MASS[k]; M += w; mx += p[k * 3] * w; mz += p[k * 3 + 2] * w; }
  mx /= M; mz /= M;
  for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3, w = RAG_MASS[k], rx = p[i] - mx, rz = p[i + 2] - mz; Ly += w * (rz * (p[i] - q[i]) - rx * (p[i + 2] - q[i + 2])); Iy += w * (rx * rx + rz * rz); }
  const wy = Iy > 1e-6 ? Ly / Iy * (r.landT ? RAG.yawDown : RAG.yaw) : 0;
  for (let k = 0; k < n; k++) {
    if (!on[k]) continue;
    const i = k * 3;
    if (wy) { q[i] += wy * (p[i + 2] - mz); q[i + 2] -= wy * (p[i] - mx); }
    let vx = (p[i] - q[i]) * air, vy = (p[i + 1] - q[i + 1]) * air, vz = (p[i + 2] - q[i + 2]) * air;
    const hv = Math.hypot(vx, vz); if (hv > vcap && r.st > 0.05) { vx *= vcap / hv; vz *= vcap / hv; }
    q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
    p[i] += vx; p[i + 1] += vy - g; p[i + 2] += vz;
  }
  (r.pre || (r.pre = new Float32Array(p.length))).set(p);
  for (let it = 0; it < RAG.iters; it++) {
    for (const c of r.sticks) {
      const a = c[0] * 3, b = c[1] * 3, ex = p[b] - p[a], ey = p[b + 1] - p[a + 1], ez = p[b + 2] - p[a + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d < 1e-6) continue;
      const t = d < c[2] ? c[2] : d > c[3] ? c[3] : d; if (t === d) continue;
      const wa = r.im[c[0]], wb = r.im[c[1]], f = (d - t) / d / (wa + wb);
      p[a] += ex * f * wa; p[a + 1] += ey * f * wa; p[a + 2] += ez * f * wa;
      p[b] -= ex * f * wb; p[b + 1] -= ey * f * wb; p[b + 2] -= ez * f * wb;
    }
    ragLimits(r);
    ragWorld(r, it === RAG.iters - 1);
  }
  ragUnturn(r);
  // still? then it's left as it lies
  let vmax = 0; for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3; vmax = Math.max(vmax, Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])); }
  r.still = vmax / h < RAG.sleepV && r.st > 0.6 ? r.still + h : 0;
  if (r.still > RAG.sleepT || (r.landT && r.st - r.landT > RAG.settle) || r.st > RAG.maxT) r.sleep = true;   // (and down a while, or long enough whatever it's lying on, it's done: no creeping about)
}
// the sticks, the joint limits and the world can each turn the whole body a hair round the upright as they put it
// right (a limb swung back onto its side, round its socket), the same way pass after pass, so a body could turn slowly
// round on the floor like a helicopter, however its spin was damped: whatever turn they gave it in a step is taken back
// off, the whole body turned back round its middle (turning it whole keeps every bone its length)
function ragUnturn(r) {
  const p = r.p, a = r.pre, on = r.on;
  let M = 0, ax = 0, az = 0, bx = 0, bz = 0;
  for (let k = 0; k < on.length; k++) if (on[k]) { const i = k * 3, w = RAG_MASS[k]; M += w; ax += a[i] * w; az += a[i + 2] * w; bx += p[i] * w; bz += p[i + 2] * w; }
  if (!M) return;
  ax /= M; az /= M; bx /= M; bz /= M;
  let cr = 0, dt = 0;
  for (let k = 0; k < on.length; k++) if (on[k]) { const i = k * 3, w = RAG_MASS[k], ux = a[i] - ax, uz = a[i + 2] - az, vx = p[i] - bx, vz = p[i + 2] - bz; cr += w * (uz * vx - ux * vz); dt += w * (ux * vx + uz * vz); }
  const th = Math.atan2(cr, dt); if (Math.abs(th) < 1e-6) return;
  const c = Math.cos(th), sn = Math.sin(th);
  for (let k = 0; k < on.length; k++) if (on[k]) { const i = k * 3, x = p[i] - bx, z = p[i + 2] - bz; p[i] = bx + x * c - z * sn; p[i + 2] = bz + x * sn + z * c; }
}
// how far each joint goes: a knee and an elbow fold only one way, and only straight that way. A knee folds round the
// line of the hips, the heel going back, with some give round the thigh for the turn a hip has in it: a good way with
// the knee out (kneeOut, radians), less with it in (kneeIn). An elbow brings the hand in front and up (back behind the
// head with the arm raised over it), and swings round the upper arm a long way as a shoulder turns (elbowTurn either
// side), but never on round behind. Once a body's been down a moment (restT, s) a knee or an elbow may lie out to
// either side, as far as restTurn, but still never folds back: a limb lying on the floor goes where the floor lets it.
// A thigh goes only a little back behind the hip or out to the side, an upper arm only a little behind the back, and a
// knee comes up only so far toward the chest (thighUp: how far above the hip). Every fix keeps the bones their length
// (a joint folded the wrong way is swung round onto its own side, a limb held in is swung round its socket with what
// hangs off it carried along), so the sticks never fight the limits, which pumped the body round and round on the
// floor; and a joint only a hair off straight (dead: of the zombie's size) is let be, so a straight leg doesn't flick
// from side to side
const RAG_LIM = { thighBack: 0.14, thighOut: 0.2, thighUp: 0.1, armBack: 0.2, give: 0.6, dead: 0.015, kneeOut: 1.6, kneeIn: 0.6, elbowTurn: 1.65, pole: 0.5, restTurn: 1.6, restT: 0.25 };
const _rgF = [0, 0, 0], _rgMv = [0, 0, 0];
function ragLimits(r) {
  ragFrame(r.p);
  const p = r.p, q = r.q, on = r.on, s = r.s, X = _rgX, Y = _rgY, Z = _rgZ;
  // point k (with what hangs off it, c) moved by (x, y, z), part of the way, then put back its length from a; where it
  // was a step ago moves with it, so it keeps the way it was going
  const swing = (k, a, c, x, y, z) => {
    const i = k * 3, A = a * 3, L = Math.hypot(p[i] - p[A], p[i + 1] - p[A + 1], p[i + 2] - p[A + 2]), g = RAG_LIM.give;
    let nx = p[i] + x * g - p[A], ny = p[i + 1] + y * g - p[A + 1], nz = p[i + 2] + z * g - p[A + 2]; const d = Math.hypot(nx, ny, nz) || 1;
    nx = p[A] + nx * L / d - p[i]; ny = p[A + 1] + ny * L / d - p[i + 1]; nz = p[A + 2] + nz * L / d - p[i + 2];
    for (const j of c >= 0 && on[c] ? [i, c * 3] : [i]) { p[j] += nx; p[j + 1] += ny; p[j + 2] += nz; }
  };
  // a joint held to its limits: round a bone from a (along t) to point k, the turn of k off it from the way
  // f points (square to the bone: 0 toward f, positive round toward t x f). Past tp (that way round) or tn (the other),
  // k is swung round the bone onto the limit, the same distance off it and the same way along it (folded right round
  // the wrong way, it goes over to the right side); by how much of the way there (w), into _rgMv. False if it's fine
  const least = r.landT && r.st - r.landT > RAG_LIM.restT ? RAG_LIM.restTurn : 0;
  const turnBack = (a, k, tx, ty, tz, f, tp, tn, w) => {
    const A = a * 3, K = k * 3, tl = Math.hypot(tx, ty, tz); if (tl < 1e-6) return false;
    tx /= tl; ty /= tl; tz /= tl;
    const wx = p[K] - p[A], wy = p[K + 1] - p[A + 1], wz = p[K + 2] - p[A + 2], wt = wx * tx + wy * ty + wz * tz;
    const ox = wx - wt * tx, oy = wy - wt * ty, oz = wz - wt * tz, ol = Math.hypot(ox, oy, oz); if (ol < RAG_LIM.dead * s) return false;
    const ft = f[0] * tx + f[1] * ty + f[2] * tz; let rx = f[0] - ft * tx, ry = f[1] - ft * ty, rz = f[2] - ft * tz; const rl = Math.hypot(rx, ry, rz); if (rl < 1e-3) return false;
    rx /= rl; ry /= rl; rz /= rl;
    const sx = ty * rz - tz * ry, sy = tz * rx - tx * rz, sz = tx * ry - ty * rx;
    const ang = Math.atan2(ox * sx + oy * sy + oz * sz, ox * rx + oy * ry + oz * rz), aa = Math.abs(ang), lim = Math.max(least, ang > 0 ? tp : tn);
    if (aa <= lim) return false;
    const to = ang + (Math.sign(ang) * (aa > Math.PI / 2 ? Math.min(lim, Math.PI - aa) : lim) - ang) * w, cs = Math.cos(to) * ol, sn = Math.sin(to) * ol;
    _rgMv[0] = p[A] + wt * tx + rx * cs + sx * sn - p[K]; _rgMv[1] = p[A + 1] + wt * ty + ry * cs + sy * sn - p[K + 1]; _rgMv[2] = p[A + 2] + wt * tz + rz * cs + sz * sn - p[K + 2];
    return true;
  };
  // point k moved by _rgMv, and the points o1 and o2 moved back against it by their share (by weight), so a fix turns
  // the limb without shoving the whole body anywhere; where each was a step ago moves with it, so it keeps its way
  const shift = (j, w) => { const J = j * 3; for (let i = 0; i < 3; i++) { p[J + i] += _rgMv[i] * w; q[J + i] += _rgMv[i] * w; } };
  const moveBy = (k, o1, o2) => { const mk = RAG_MASS[k], mo = RAG_MASS[o1] + RAG_MASS[o2], t = mk + mo; shift(k, mo / t); shift(o1, -mk / t); shift(o2, -mk / t); };
  // the middle joint of a limb (a to b to c) folds only one way: the lower bone turns off the upper toward where fold
  // (given the direction of a bone, into _rgF) says that joint folds, within tp and tn either way round. Past that
  // it's put right in two moves that each keep both bones their length: the middle point swung part of the way (pole)
  // round the line from a to c, the way it juts (against the fold), so a limb lying on the floor can lift its knee or
  // elbow back up rather than only drag its end round; then the end swung round the upper bone onto the limit
  const hinge = (a, b, c, fold, tp, tn) => {
    const A = a * 3, B = b * 3, C = c * 3;
    let tx = p[C] - p[A], ty = p[C + 1] - p[A + 1], tz = p[C + 2] - p[A + 2]; fold(tx, ty, tz); _rgF[0] = -_rgF[0]; _rgF[1] = -_rgF[1]; _rgF[2] = -_rgF[2];
    if (turnBack(a, b, tx, ty, tz, _rgF, tp, tn, RAG_LIM.pole)) moveBy(b, a, c);
    tx = p[B] - p[A]; ty = p[B + 1] - p[A + 1]; tz = p[B + 2] - p[A + 2]; fold(tx, ty, tz);
    if (turnBack(b, c, tx, ty, tz, _rgF, tp, tn, 1)) moveBy(c, a, b);
  };
  // (a knee folds round the line of the hips, the heel going back; an elbow brings the hand forward and up, and with
  // the arm raised over the head, back behind it)
  const HX = _rgN.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]); if (HX.lengthSq() < 1e-8) HX.copy(X); else HX.normalize();
  const kneeFold = (x, y, z) => { _rgF[0] = HX.y * z - HX.z * y; _rgF[1] = HX.z * x - HX.x * z; _rgF[2] = HX.x * y - HX.y * x; };
  const elbowFold = (x, y, z) => { const k = 1 - 2 * Math.max(0, (x * Y.x + y * Y.y + z * Y.z) / (Math.hypot(x, y, z) || 1)); _rgF[0] = Z.x * k + Y.x * 0.5; _rgF[1] = Z.y * k + Y.y * 0.5; _rgF[2] = Z.z * k + Y.z * 0.5; };
  // how far b is from a along an axis of the trunk
  const along = (a, b, ax) => (p[b * 3] - p[a * 3]) * ax.x + (p[b * 3 + 1] - p[a * 3 + 1]) * ax.y + (p[b * 3 + 2] - p[a * 3 + 2]) * ax.z;
  for (const [hp, kn, ft, sd] of [[0, 9, 10, -1], [1, 11, 12, 1]]) {
    if (!on[kn]) continue;
    if (on[ft]) hinge(hp, kn, ft, kneeFold, sd < 0 ? RAG_LIM.kneeOut : RAG_LIM.kneeIn, sd < 0 ? RAG_LIM.kneeIn : RAG_LIM.kneeOut);
    const back = along(hp, kn, Z), lim = -RAG_LIM.thighBack * s; if (back < lim) swing(kn, hp, ft, Z.x * (lim - back), Z.y * (lim - back), Z.z * (lim - back));
    const out = along(hp, kn, X) * sd, lo = RAG_LIM.thighOut * s; if (out > lo) swing(kn, hp, ft, -X.x * sd * (out - lo), -X.y * sd * (out - lo), -X.z * sd * (out - lo));
    const up = along(hp, kn, Y), hi = RAG_LIM.thighUp * s; if (up > hi) swing(kn, hp, ft, -Y.x * (up - hi), -Y.y * (up - hi), -Y.z * (up - hi));
  }
  for (const [sh, el, hd] of [[2, 5, 6], [3, 7, 8]]) {
    if (!on[el]) continue;
    if (on[hd]) hinge(sh, el, hd, elbowFold, RAG_LIM.elbowTurn, RAG_LIM.elbowTurn);
    const back = along(sh, el, Z), lim = -RAG_LIM.armBack * s; if (back < lim) swing(el, sh, hd, Z.x * (lim - back), Z.y * (lim - back), Z.z * (lim - back));
  }
}
// the world against each point: out of a wall or a prop the way it came, onto the top of a sill or a fence it came
// down on, and up off the floor; the last pass also grips what's on the ground and bounces what hit it, and the first
// hard landing of the trunk thumps and knocks a little blood and dust out of it
function ragWorld(r, last) {
  const p = r.p, q = r.q, on = r.on, s = r.s; let down = 0;
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue;
    const i = k * 3, rad = RAG_R[k] * s;
    if (THIN.n && thinHit(q[i], q[i + 2], p[i], p[i + 2]) <= 1) { p[i] = q[i]; p[i + 2] = q[i + 2]; }   // an inside wall (world/thin-walls.js)
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
    // (on the ground it grips: once the body's down, what's sliding slower than RAG.stick m/s stops dead in it)
    if (r.landT && Math.hypot(p[i] - q[i], p[i + 2] - q[i + 2]) / RAG.h < RAG.stick) { q[i] = p[i]; q[i + 2] = p[i + 2]; }
    else { q[i] = p[i] - (p[i] - q[i]) * (1 - RAG.grip); q[i + 2] = p[i + 2] - (p[i + 2] - q[i + 2]) * (1 - RAG.grip); }
    q[i + 1] = vy / RAG.h < -RAG.bounceV ? p[i + 1] + vy * RAG.bounce : p[i + 1];   // (a hard landing bounces a little; anything gentler stops dead)
    if (k < 4) down++;
    if (!r.pooled && k < 4 && vy / RAG.h < -1.2) {
      r.pooled = true;
      burst(p[i], 0.15, p[i + 2], 5, 'blood', 0, 0, 0.6); burst(p[i], 0.1, p[i + 2], 4, 'dust');
      if (Math.hypot(p[i] - P.x, p[i + 2] - P.z) < 12) soundAt(p[i], p[i + 2], () => SFX.thud());
    }
  }
  if (last) r.down = down >= 2;
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
  // a bone pointed from point k0 to k1 (in its parent's frame: qi), its length along rest, and turned on that length so
  // its own sideways (x) stays as near its parent's as it can: a whole frame, never the shortest turn from rest, which
  // flips a limb round when it points back past the parent (a leg up in the air, an arm behind the back)
  const aim = (o, k0, k1, rest, qi) => {
    _rgD.set(v[k1 * 3] - v[k0 * 3], v[k1 * 3 + 1] - v[k0 * 3 + 1], v[k1 * 3 + 2] - v[k0 * 3 + 2]).applyQuaternion(qi).normalize();
    const d = _rgD, sx = _rgS.set(1, 0, 0).addScaledVector(d, -d.x); if (sx.lengthSq() < 0.02) sx.set(0, 0, 1).addScaledVector(d, -d.z); sx.normalize();
    if (rest === _rgFw) _rgM.makeBasis(sx, _rgT.crossVectors(d, sx), d);                        // (its length along +z: an arm)
    else if (rest === _rgDn) _rgM.makeBasis(sx, _rgT.copy(d).negate(), _rgU.crossVectors(sx, _rgT));   // (along -y: a leg)
    else _rgM.makeBasis(sx, d, _rgU.crossVectors(sx, d));                                       // (along +y: the head)
    o.quaternion.setFromRotationMatrix(_rgM);
  };
  for (const sd of ['L', 'R']) {
    const [e, hd, sh] = RAG_LIMB['arm' + sd], [kn, ft, hp] = RAG_LIMB['leg' + sd];
    if (on[e] && lb['arm' + sd] && r.noFore) aim(m['arm' + sd], sh, on[hd] ? hd : e, _rgFw, _rgQi);   // (a one-piece arm, pointed at the hand)
    else if (on[e] && lb['arm' + sd]) { const a = m['arm' + sd]; aim(a, sh, e, _rgFw, _rgQi); if (on[hd]) aim(m['fore' + sd], e, hd, _rgFw, _rgQ2.copy(a.quaternion).invert().multiply(_rgQi)); }
    if (on[kn] && lb['leg' + sd]) { const l = m['leg' + sd]; aim(l, hp, kn, _rgDn, _rgQi); if (on[ft]) aim(m['shin' + sd], kn, ft, _rgDn, _rgQ2.copy(l.quaternion).invert().multiply(_rgQi)); }
  }
  if (on[4]) {
    const nk = [(v[6] + v[9]) / 2, (v[7] + v[10]) / 2, (v[8] + v[11]) / 2]; _rgN.set(nk[0], nk[1], nk[2]);
    { const save = [v[6], v[7], v[8]]; v[6] = nk[0]; v[7] = nk[1]; v[8] = nk[2]; aim(m.head, 2, 4, _rgUp, _rgQi); v[6] = save[0]; v[7] = save[1]; v[8] = save[2]; }   // (from between the shoulders)
    _rgD.set(v[12], v[13], v[14]).sub(_rgP).applyQuaternion(_rgQi).divideScalar(s); m.head.position.set(_rgD.x, _rgD.y - r.upY, _rgD.z);
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
  r.g.position.y = r.gy - (r.keep ? 0 : Math.max(0, r.t - 8) * 0.25);
  if (r.burn > 0 && r.stain) r.stain.char = Math.min(1, r.stain.char + dt * 0.3);   // a body that went down burning smoulders on until it's black
  if (r.burn > 0) { r.burn -= dt; if (r.vis > 0.3 && r.t > 0.4) burnFx(r.x, r.z, 0.05, 0.45, 0.45 * r.s, dt * Math.min(1, r.burn)); }   // the fire dies down on the body
}
