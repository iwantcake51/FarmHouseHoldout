// Death falls that start from the pose the zombie died in.

// ---- deaths: bodies stagger, buckle and drop as a whole, like PZ, instead of floppy physics ----
const ragdolls = [];
// a death starts from whatever pose the zombie was in (mid-vault, mid-lunge, crawling) and blends into one of several falls
function poseOf(m) {
  return { y: m.g.position.y, rx: m.g.rotation.x, rz: m.g.rotation.z, ux: m.upper.rotation.x, uz: m.upper.rotation.z, hx: m.head.rotation.x,
    alx: m.armL.rotation.x, aly: m.armL.rotation.y, arx: m.armR.rotation.x, ary: m.armR.rotation.y, ll: m.legL.rotation.x, lr: m.legR.rotation.x,
    kl: m.shinL ? m.shinL.rotation.x : 0, kr: m.shinR ? m.shinR.rotation.x : 0, el: m.foreL ? m.foreL.rotation.x : 0, er: m.foreR ? m.foreR.rotation.x : 0 };
}
function makeRagdoll(z, dx, dz, part, force, wId) {
  const m = z.m, f = z.face, s = z.T.scale, D = (wId && (W(wId) || EFF[wId])) || {};
  const along = dx * Math.sin(f) + dz * Math.cos(f), side = dx * Math.cos(f) - dz * Math.sin(f);
  const heavy = force > 5, p0 = poseOf(m), lie = 0.16 * s;
  const arms = () => [1.1 + rr(-0.4, 0.4), 1.1 + rr(-0.4, 0.4)];
  let kind;
  if (z.vault) kind = 'vault';
  else if (z.crawl) kind = 'crawl';
  else if (part === 'crush') kind = rand() < 0.55 ? 'crumple' : 'knees';   // the head crushed or split from above: it drops where it stands
  else if (heavy) kind = along > 0 ? 'forward' : 'blown';
  else if (part === 'head' && rand() < 0.6) kind = 'crumple';
  else if (part === 'legL' || part === 'legR') kind = 'knees';
  else if (D.melee && rand() < 0.5) kind = 'spin';
  else kind = pick(along > 0.2 ? ['forward', 'forward', 'spin', 'crumple'] : ['back', 'back', 'spin', 'crumple', 'knees']);
  const [aL, aR] = arms(), sideSign = side > 0 ? 1 : side < 0 ? -1 : (rand() < 0.5 ? 1 : -1);
  const fin = { y: lie, rx: 0, rz: 0, ux: 0, uz: 0, hx: rr(-0.3, 0.3), alx: aL, aly: rr(0.1, 0.7), arx: aR, ary: -rr(0.1, 0.7), ll: rr(-0.25, 0.15), lr: rr(-0.25, 0.15), kl: rr(0, 0.5), kr: rr(0, 0.5), el: -rr(0.1, 0.8), er: -rr(0.1, 0.8) };
  let mid = null, tMid = 0, dur = (z.type === 'brute' ? 0.66 : 0.5), delay = 0.04, spin = 0, vx = dx * force * 0.55, vz = dz * force * 0.55, dir = 0;
  if (kind === 'forward' || kind === 'crawl') { fin.rx = Math.PI / 2; dir = 1; }
  else if (kind === 'back') { fin.rx = -Math.PI / 2; dir = -1; }
  else if (kind === 'blown') { fin.rx = -Math.PI / 2; dir = -1; dur *= 0.75; delay = 0; spin = rr(-2.5, 2.5); fin.alx = -2.4; fin.arx = -2.2; }
  else if (kind === 'spin') { fin.rz = sideSign * Math.PI / 2; fin.rx = rr(-0.15, 0.15); spin = sideSign * rr(2.5, 4); dur *= 1.1; fin.alx = rr(0.4, 1.4); }
  else if (kind === 'crumple') {   // legs go out from under them, they sink, then tip over
    mid = { y: -0.24 * s, rx: 0.12, rz: sideSign * 0.1, ux: 0.35, uz: sideSign * 0.15, hx: 0.5, alx: 0.15, aly: 0.1, arx: 0.2, ary: -0.1, ll: -0.7, lr: -0.5, kl: 1.4, kr: 1.1, el: -0.4, er: -0.3 };
    tMid = 0.32; fin.rx = rand() < 0.6 ? Math.PI / 2 : 0.2; fin.rz = fin.rx < 1 ? sideSign * Math.PI / 2 : 0; dir = fin.rx > 1 ? 1 : 0; vx *= 0.3; vz *= 0.3;
  }
  else if (kind === 'knees') {    // drop onto the knees, hang there a beat, then face-plant
    mid = { y: -0.27 * s, rx: 0.08, rz: 0, ux: 0.25, uz: 0, hx: 0.3, alx: 0.9, aly: 0.2, arx: 0.85, ary: -0.2, ll: -0.1, lr: -0.15, kl: 1.6, kr: 1.6, el: -0.3, er: -0.35 };
    tMid = 0.42; fin.rx = Math.PI / 2; dir = 1; vx *= 0.25; vz *= 0.25;
  }
  else if (kind === 'vault') {     // tumble on over the rail in the direction they were climbing
    const v = z.vault, L = Math.hypot(v.x1 - v.x0, v.z1 - v.z0) || 1;
    vx = (v.x1 - v.x0) / L * 1.6 + dx * force * 0.2; vz = (v.z1 - v.z0) / L * 1.6 + dz * force * 0.2; fin.rx = Math.PI / 2 + 0.15; dir = 1; dur *= 1.15;
  }
  if (z.crawl) { fin.ll = p0.ll; fin.lr = p0.lr; fin.kl = p0.kl; fin.kr = p0.kr; }
  const r = { g: m.g, mats: z.fade || m.mats, dm: z.dm, blob: z.blob, m, x: z.x, z: z.z, vx, vz, spin, t: 0, s, dir, kind, p0, mid, tMid, fin, delay, dur, face: f,
    pooled: false, stain: z.stain, vis: z.vis, burn: z.burn > 0 ? Math.max(z.burn, 4) : 0, bounce: 0, flash: z.flash || 0, eyes: z.limbs.head ? m.eyes : null, eyeH: z.eyeH, eyeGlow: z.limbs.head ? 1 : 0, eyeT: 0 };
  m.g.scale.setScalar(s);
  ragdolls.push(r);
}
function stepRagdoll(r, dt) {
  r.t += dt;
  const m = r.m, g = r.g;
  if (r.vx || r.vz) { const tmp = { x: r.x, z: r.z }; moveCircle(tmp, r.vx * dt, r.vz * dt, 0.25); r.x = tmp.x; r.z = tmp.z; const k = Math.exp(-5 * dt); r.vx *= k; r.vz *= k; if (Math.abs(r.vx) + Math.abs(r.vz) < 0.02) r.vx = r.vz = 0; }
  if (r.spin) { r.face += r.spin * dt; r.spin *= Math.exp(-4 * dt); }
  const t = Math.max(0, r.t - r.delay);
  let P_, k;
  if (r.mid) {
    const k1 = clamp(t / r.tMid, 0, 1);
    if (k1 < 1) P_ = lerpPose(r.p0, r.mid, smooth(k1), _pose);
    else { k = clamp((t - r.tMid) / r.dur, 0, 1); P_ = lerpPose(r.mid, r.fin, k * k, _pose); }
  } else { k = clamp(t / r.dur, 0, 1); P_ = lerpPose(r.p0, r.fin, k * k, _pose); }   // gravity: slow start, fast finish
  if (k >= 1) {   // a small bounce as they hit the ground
    r.bounce += dt; const b = 0.11 * Math.sin(r.bounce * 16) * Math.exp(-r.bounce * 7);
    if (Math.abs(r.fin.rz) > Math.abs(r.fin.rx)) P_.rz -= Math.sign(r.fin.rz) * b; else P_.rx -= Math.sign(r.fin.rx || 1) * b;
  }
  g.rotation.set(P_.rx, r.face, P_.rz, 'YXZ');
  if (r.blob) { const lay = Math.min(1, Math.abs(P_.rx) / 1.4 + Math.abs(P_.rz) / 1.4), off = 0.55 * r.s * lay; r.blob.position.set(r.x + Math.sin(r.face) * Math.sign(P_.rx) * off * (Math.abs(P_.rx) > Math.abs(P_.rz) ? 1 : 0), 0.02, r.z + Math.cos(r.face) * Math.sign(P_.rx) * off * (Math.abs(P_.rx) > Math.abs(P_.rz) ? 1 : 0)); r.blob.rotation.y = r.face + (Math.abs(P_.rz) > Math.abs(P_.rx) ? Math.PI / 2 : 0); r.blob.scale.set(1.1 * r.s, 1, 1.1 * r.s * (1 + lay * 0.9)); }
  g.position.set(r.x, Math.max(-0.35, P_.y), r.z);
  m.upper.rotation.set(P_.ux, 0, P_.uz); m.head.rotation.x = P_.hx;
  m.armL.rotation.set(P_.alx, P_.aly, 0); m.armR.rotation.set(P_.arx, P_.ary, 0);
  m.legL.rotation.x = P_.ll; m.legR.rotation.x = P_.lr;
  if (m.shinL) { m.shinL.rotation.x = P_.kl; m.shinR.rotation.x = P_.kr; m.foreL.rotation.x = P_.el; m.foreR.rotation.x = P_.er; }   // (knees and elbows: zombies/zombie-anim.js)
  if (r.t > 8) g.position.y -= (r.t - 8) * 0.25;
  if (!r.pooled && k >= 1) {
    r.pooled = true;
    // it hits the ground: a little blood knocked out of it (no pool: what it bled is what the shots threw)
    const hx = r.x - Math.sin(r.face) * r.dir * 0.6 * r.s, hz = r.z - Math.cos(r.face) * r.dir * 0.6 * r.s;
    burst(hx, 0.15, hz, 5, 'blood', 0, 0, 0.6); burst(r.x, 0.1, r.z, 4, 'dust');
    if (Math.hypot(r.x - P.x, r.z - P.z) < 12) soundAt(r.x, r.z, () => SFX.thud());
  }
  if (r.burn > 0 && r.stain) r.stain.char = Math.min(1, r.stain.char + dt * 0.3);   // a body that went down burning smoulders on until it's black
  if (r.burn > 0) { r.burn -= dt; if (r.vis > 0.3 && r.t > 0.4) burnFx(r.x, r.z, 0.05, 0.45, 0.45 * r.s, dt * Math.min(1, r.burn)); }   // the fire dies down on the body
}
