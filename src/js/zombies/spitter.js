// Spitters: zombies that hang back and spit acid at you, so holding one window and mowing the rest down as they climb in
// doesn't work.
//
// You can tell one a long way off: hunched over a swollen, glowing throat sac and a bloated belly, jaw hanging open
// with bile dribbling off its chin in strings, its skin gone a sick yellow-green, a green glow round its throat that
// shows in the dark, a wet gurgle as it comes, and in green through walls where the others are red (spitterLook).
//
// One with a clear line to whoever it's after, between SPIT.min and SPIT.max metres off (through a window too, so long
// as it isn't boarded shut), stops where it is, rears back while the sac swells and glows and the gurgle rises
// (SPIT.wind seconds: hit it hard enough to stagger it and the spit's lost), then retches forward and spits a glob in
// a low arc at where you're standing as it lets go, through the middle of a window if one's in the way (spitTime).
// Keep moving and it lands behind you; stand still and it splashes you (SPIT.dmg) and leaves a splat of acid that
// spreads, bubbles and steams, then dries up (SPIT.pool). Standing in it burns, a little at first and a little more the
// longer you stay (SPIT.pool.ramp), and drags at your feet. It spits again every SPIT.cd seconds while it can see you;
// once it can't, it comes on like any other zombie, and close up it claws like one. When one dies its sac bursts.
// In co-op the host's spitters decide when to spit (zombies/ai.js) and every game flies the same glob and makes the same
// splat ('spw' as it rears back, 'spt' as it lets go: net/sync.js), each burning only its own survivor.

const SPIT = {
  from: 5, share: 0.05, sharePer: 0.006, shareMax: 0.12,   // first wave, share of the wave, how it grows (waves/waves.js)
  min: 3.5, max: 11, wind: 0.95, cd: [3.6, 5], first: [0.8, 2.2],   // range, the rear back (s), between spits (s), the first
  speed: 12, g: 9, through: 1.45,   // the glob's speed across the ground (m/s), its fall, the height it takes through a window
  dmg: 10, splash: 1.0,   // a glob that catches you (half that at the splash's edge) and how far the splash reaches
  // the splat it leaves: how far it burns, how long it lasts, the burn a second (rising to max times that after ramp
  // seconds stood in it, and easing off again once you're out), the drag at your feet; it spreads over grow seconds and
  // dries up over its last dry
  pool: { r: 0.95, t: 6.5, dps: 2.5, max: 1.6, ramp: 4, slow: 0.2, grow: 0.35, dry: 2.2 },
  burst: { r: 0.7, t: 4 },   // a spitter's own sac bursting as it dies
  xray: 0x9fe03c
};
const globs = [], acidPools = [], spitters = new Set();
// the acid: a sick yellow-green, translucent and wet-looking, faintly lit from within
const ACID_GLOW = 0x142408;
const GLOB_G = new THREE.IcosahedronGeometry(1, 2);
const GLOB_M = lam(0xb4dc46, { emissive: 0x3c6a0a, transparent: true, opacity: 0.93 }); GLOB_M.userData.mobile = true;
// three more kinds of soft sprite (effects/puffs.js): the acid flung off a glob or a splash, wet and catching the light;
// the haze of fumes off a fresh splat; and the glow round a spitter's throat
FXK.acid = { tex: TEX_DOT, col: 0xc4e65a, col2: 0x6f8e1c, lit: true, gain: 1.5, grav: 7, drag: 1.2, rise: 0, fin: 0.03, fade: 1.3 };
FXK.acidMist = { tex: TEX_SMOKES, col: 0xb4c87a, lit: true, gain: SMOKE_GAIN, grav: 0, drag: 2.4, rise: 0.3, fin: 0.2, fade: 1.4, wind: 0.8 };
FXK.acidGlow = { tex: TEX_GLOWS, add: true, col: 0x8fd832, grav: 0, drag: 0, rise: 0, fin: 0.25, fade: 1.2 };

// ---- the splats: a few drawn once, each a wet pool with streaks and droplets thrown out along one side (the way the
// glob was going), a dark rim where it's soaking in, a glossy middle and bubbles on it; laid down turned to the way it came
const SPLAT_TEX = Array.from({ length: 5 }, () => acidSplatTex());
function acidSplatTex() {
  const S_ = 256, c = document.createElement('canvas'); c.width = c.height = S_; const x = c.getContext('2d'), h = S_ / 2;
  const blobs = [], streaks = [], drops = [];
  for (let k = 0; k < 9; k++) { const a = rand() * 6.283, d = k ? rr(10, 34) : 0; blobs.push([h + Math.cos(a) * d - 6, h + Math.sin(a) * d * 0.85, k ? rr(18, 34) : rr(40, 50)]); }
  for (let k = 0; k < 12; k++) streaks.push([rr(-0.75, 0.75), rr(34, 50), rr(18, 62), rr(3, 8)]);
  for (let k = 0; k < 26; k++) { const a = rand() < 0.75 ? rr(-1, 1) : rr(-3.1, 3.1), d = rr(48, 118); drops.push([h + Math.cos(a) * d, h + Math.sin(a) * d, rr(1.5, 5)]); }
  const shape = (grow, col) => {
    x.fillStyle = col;
    for (const [bx, by, r] of blobs) { x.beginPath(); x.arc(bx, by, Math.max(1, r + grow), 0, 6.283); x.fill(); }
    for (const [a, d0, L, w] of streaks) { x.save(); x.translate(h + Math.cos(a) * d0, h + Math.sin(a) * d0); x.rotate(a); x.beginPath(); x.ellipse(L / 2, 0, L / 2 + grow, Math.max(0.8, w / 2 + grow * 0.6), 0, 0, 6.283); x.fill(); x.restore(); }
    for (const [dx, dy, r] of drops) { x.beginPath(); x.arc(dx, dy, Math.max(0.6, r + grow * 0.5), 0, 6.283); x.fill(); }
  };
  shape(2, 'rgba(56,68,14,0.8)');         // the rim, soaking into whatever it's on
  shape(-2, 'rgba(122,154,36,0.9)');       // the acid
  shape(-9, 'rgba(156,190,56,0.85)');      // thicker, brighter in the middle
  x.fillStyle = 'rgba(236,255,190,0.55)';  // wet highlights
  for (let k = 0; k < 6; k++) { const [bx, by, r] = blobs[(rand() * blobs.length) | 0]; x.beginPath(); x.ellipse(bx - r * 0.3, by - r * 0.35, r * rr(0.15, 0.3), r * rr(0.08, 0.15), -0.6, 0, 6.283); x.fill(); }
  x.strokeStyle = 'rgba(220,245,150,0.7)'; x.lineWidth = 1.2;   // bubbles
  for (let k = 0; k < 14; k++) { const [bx, by, r] = blobs[(rand() * blobs.length) | 0], a = rand() * 6.283, d = rand() * r * 0.7; x.beginPath(); x.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, rr(1.2, 3.5), 0, 6.283); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
const POOL_G = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

// ---- its look ----
// the skin (and what's on it) tinted toward a sick yellow-green, by part: most at the face and hands
const SPIT_TINT = [0.62, 0.7, 0.36], SPIT_TINT_K = { head: 0.38, armL: 0.2, armR: 0.2, foreL: 0.3, foreR: 0.3, torso: 0.16 };
function spitterLook(m) {
  for (const p in SPIT_TINT_K) {
    const c = m[p] && m[p].geometry.attributes.color; if (!c) continue; const k = SPIT_TINT_K[p];
    for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); c.setXYZ(i, r + (SPIT_TINT[0] * (0.6 + r) - r) * k, g + (SPIT_TINT[1] * (0.6 + g) - g) * k, b + (SPIT_TINT[2] * (0.6 + b) - b) * k); }
    c.needsUpdate = true;
  }
  const sacM = lam(0xb0c858, { emissive: 0x30520a, transparent: true, opacity: 0.94 }), coreM = basic(0xd8ff6a);
  const veinM = lam(0x5a3a3a), bileM = lam(0x6a7a1c, { emissive: 0x141e02 }), dark = basic(0x140a06), soreM = lam(0xc8d86a, { emissive: 0x3a5a08 });
  // the sac: a swollen, glossy bag of acid under the jaw, lit from inside, veins over it
  const sac = new THREE.Group(); sac.position.set(0, -0.17, 0.05); m.head.add(sac);
  const bag = new THREE.Mesh(GLOB_G, sacM); bag.scale.set(0.15, 0.115, 0.13); sac.add(bag);
  const core = new THREE.Mesh(GLOB_G, coreM); core.scale.set(0.085, 0.06, 0.07); core.position.z = 0.02; sac.add(core);
  for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, rr(0.08, 0.14)), veinM), a = rr(-1.2, 1.2); v.position.set(Math.sin(a) * 0.13, rr(-0.06, 0.05), Math.cos(a) * 0.1); v.rotation.set(rr(-0.6, 0.6), a, rr(-0.4, 0.4)); sac.add(v); }
  // the jaw hanging open, a glow down its throat, bile in strings off its chin
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.012), dark); mouth.position.set(0, -0.095, 0.15); m.head.add(mouth);
  const throat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.024, 0.006), coreM); throat.position.set(0, -0.097, 0.152); m.head.add(throat);
  const strands = [];
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, -0.5, 0), bileM); s.position.set(rr(-0.035, 0.035), -0.12, 0.155); s.userData.len = rr(0.06, 0.16); s.userData.ph = rand() * 6; m.head.add(s); strands.push(s); }
  // bile down the chin and the chest
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(rr(0.025, 0.05), rr(0.12, 0.3), 0.004), bileM); b.position.set(rr(-0.1, 0.1), rr(0.02, 0.16), 0.107); m.torso.add(b); }
  // the belly swollen tight, sores weeping on it
  const belly = new THREE.Mesh(GLOB_G, lam(0x9aa860, { emissive: 0x1a2a06 })); belly.scale.set(0.16, 0.15, 0.08); belly.position.set(0, -0.13, 0.1); m.torso.add(belly);
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(GLOB_G, soreM), a = rr(-1, 1); s.scale.setScalar(rr(0.012, 0.024)); s.position.set(Math.sin(a) * 0.13, rr(-0.22, -0.04), 0.1 + Math.cos(a) * 0.07); m.torso.add(s); }
  m.spit = { sac, sacM, core, mouth, throat, strands };
}
// how it carries itself: bent low over its belly, arms hanging; and it's kept track of for its drool and glow
function spitterGait(z) { const g = z.an && z.an.g; if (g) { g.hunch = rr(0.28, 0.38); g.lean = rr(0.12, 0.2); g.arms = 2; g.limp = 0; } spitters.add(z); }

// ---- the AI (the host's, or alone): true while it's standing off to spit, so nothing else moves it this frame ----
function spitStep(z, dt, t, dp) {
  const s = z.sp || (z.sp = { cd: rr(...SPIT.first), w: 0, thr: 0 });
  s.cd -= dt; s.thr = Math.max(0, s.thr - dt * 2.2);
  if (s.w > 0) {
    if (z.stagger > 0 || z.crawl || !z.limbs.head) { s.w = 0; s.cd = rr(0.8, 1.4); return false; }   // knocked out of it: the spit's lost
    z.face += angDiff(Math.atan2(t.x - z.x, t.z - z.z), z.face) * Math.min(1, dt * 7);
    s.w += dt / SPIT.wind;
    if (s.w >= 1) { s.w = 0; s.thr = 1; s.cd = rr(...SPIT.cd); spitAt(z, t.x, t.z); }
    return true;
  }
  if (z.crawl || t.dead || z.stagger > 0 || !z.limbs.head) return false;
  if (!(dp > SPIT.min && dp < SPIT.max && los(z.x, z.z, t.x, t.z))) return s.thr > 0.5;   // (a beat after it's spat, still)
  z.face += angDiff(Math.atan2(t.x - z.x, t.z - z.z), z.face) * Math.min(1, dt * 5);
  if (s.cd <= 0) { s.w = 0.001; spitWindFx(z); if (netLink() && z.id) netSend('spw', { id: z.id }); }
  return true;
}
// rearing back: a wet gurgle building in its throat, rising as the sac fills
function spitWindFx(z) { soundAt(z.x, z.z, () => { nz(0.9, 'bandpass', 220, 640, 0.2, 4); nz(0.7, 'bandpass', 380, 900, 0.08, 6); tn(0.85, 'sawtooth', 60, 130, 0.035); }); }
// it lets go: the glob from its mouth to where they stand
function spitAt(z, tx, tz) {
  const h = z.m.head.getWorldPosition(new V3()), sf = Math.sin(z.face), cf = Math.cos(z.face);
  const x0 = h.x + sf * 0.2, y0 = h.y - 0.1, z0 = h.z + cf * 0.2, T = spitTime(x0, y0, z0, tx, tz);
  if (netLink() && z.id) netSend('spt', { id: z.id, a: [x0, y0, z0, tx, tz, T].map(v => Math.round(v * 1000) / 1000) });
  launchGlob(z, x0, y0, z0, tx, tz, T);
}
// how long the glob's in the air: SPIT.speed across the ground, but through a window on the way it's lobbed higher, to
// pass the middle of it (SPIT.through, metres up) rather than splash on the sill
function spitTime(x0, y0, z0, tx, tz) {
  const d = Math.hypot(tx - x0, tz - z0), ty = surfaceY(tx, tz) + 0.05, T0 = clamp(d / SPIT.speed, 0.3, 1.2);
  for (let s = 0.1; s < d; s += 0.1) {
    const k = idx(ci(x0 + (tx - x0) * s / d), ci(z0 + (tz - z0) * s / d)), o = cell[k] === OPEN && openAt[k];
    if (!o || o.kind !== 'window') continue;
    const f = s / d, need = SPIT.through - y0 - f * (ty - y0); if (f < 0.05 || f > 0.95 || need <= 0) return T0;
    return clamp(Math.sqrt(2 * need / (SPIT.g * f * (1 - f))), 0.3, 1.5);
  }
  return T0;
}
// the glob: a wobbling, stretched gob of acid with a few smaller drops strung out behind it
function launchGlob(z, x0, y0, z0, tx, tz, T) {
  const ty = surfaceY(tx, tz) + 0.05, m = new THREE.Mesh(GLOB_G, GLOB_M);
  const tail = [0.05, 0.036, 0.025].map(r => { const q = new THREE.Mesh(GLOB_G, GLOB_M); q.scale.setScalar(r); q.position.set(x0, y0, z0); scene.add(q); return q; });
  m.position.set(x0, y0, z0); m.scale.setScalar(0.075); scene.add(m);
  globs.push({ m, tail, hist: [], vx: (tx - x0) / T, vy: (ty - y0 + 0.5 * SPIT.g * T * T) / T, vz: (tz - z0) / T, t: 0, ph: rand() * 6 });
  soundAt(x0, z0, () => { nz(0.18, 'bandpass', 900, 260, 0.26, 1.4); nz(0.12, 'highpass', 2200, 1100, 0.07); tn(0.12, 'sine', 180, 70, 0.06); });
  const sf = Math.sin(z.face), cf = Math.cos(z.face);
  for (let k = 0; k < 8; k++) fx('acid', x0, y0, z0, sf * rr(1, 3.5) + rr(-0.7, 0.7), rr(-0.6, 0.9), cf * rr(1, 3.5) + rr(-0.7, 0.7), rr(0.03, 0.06), 0.02, rr(0.3, 0.55), 1);
}

// ---- every frame: the spitters' drool and glow, the globs in the air, the splats on the ground, and (on a co-op
// joiner's screen) a puppet spitter's rearing back ----
const _sv = new V3(), _gq = new V3();
function updateSpit(dt) {
  if (!(dt > 0)) return;
  const pup = netClient();
  spitters.forEach(z => {
    if (z.dead || !zombies.includes(z)) { spitters.delete(z); return; }
    const s = z.sp, sp = z.m.spit;
    if (pup && s) { if (s.w > 0) s.w = Math.min(0.98, s.w + dt / SPIT.wind); s.thr = Math.max(0, s.thr - dt * 2.2); }
    if (!sp || !z.limbs.head) return;
    const w = s ? smooth(clamp(s.w, 0, 1)) : 0, th = s ? s.thr : 0, pulse = 0.5 + 0.5 * Math.sin(run.time * 3.1 + z.phase);
    // the sac breathing, swelling as it rears back and emptying as it spits; it glows brighter as it fills
    sp.sac.scale.set(1 + 0.08 * pulse + 0.55 * w - 0.3 * th, 1 + 0.06 * pulse + 0.5 * w - 0.2 * th, 1 + 0.08 * pulse + 0.45 * w - 0.2 * th);
    sp.sacM.emissive.setRGB(0.17 + 0.08 * pulse + 0.5 * w, 0.3 + 0.12 * pulse + 0.6 * w, 0.04 + 0.1 * w);
    sp.throat.scale.y = 1 + 1.5 * w + 2.5 * th;
    for (const st of sp.strands) { const u = st.userData; st.scale.y = u.len * (1 + 0.35 * Math.sin(run.time * 2.3 + u.ph)) * (1 + w); st.rotation.x = -0.25 * Math.sin(run.time * 1.7 + u.ph); }
    // the glow round its throat (seen across the yard, in the dark), and bile dripping off its chin
    if ((z.vis ?? 1) > 0.05 && (z.glowT = (z.glowT || 0) - dt) <= 0) { z.glowT = 0.1; sp.sac.getWorldPosition(_sv); fx('acidGlow', _sv.x, _sv.y, _sv.z, 0, 0, 0, 0.55 + 0.6 * w, 0.75 + 0.8 * w, 0.32, 0.35 + 0.25 * pulse + 0.4 * w); }
    if ((z.dripT = (z.dripT ?? rr(0.4, 1.4)) - dt) <= 0) {
      z.dripT = rr(0.5, 1.6); sp.strands[0].getWorldPosition(_sv);
      fx('acid', _sv.x, _sv.y - 0.1, _sv.z, rr(-0.1, 0.1), -0.4, rr(-0.1, 0.1), 0.03, 0.02, 0.5, 1);
      if (rand() < 0.5 && !z.vault) acidPool(_sv.x, _sv.z, rr(0.07, 0.12), rr(2.5, 4), rand() * 6.283, true);
    }
    if ((z.gurgT = (z.gurgT ?? rr(1, 4)) - dt) <= 0) { z.gurgT = rr(2.5, 5); if (Math.hypot(z.x - P.x, z.z - P.z) < 16) soundAt(z.x, z.z, () => nz(0.5, 'bandpass', 300, 180, 0.07, 5), true); }
  });
  for (let k = globs.length - 1; k >= 0; k--) {
    const g = globs[k], p = g.m.position, x0 = p.x, z0 = p.z;
    g.t += dt; g.vy -= SPIT.g * dt; p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
    // stretched along the way it's flying, wobbling as it goes, its drops following in its wake
    const v = Math.hypot(g.vx, g.vy, g.vz), wob = 1 + 0.12 * Math.sin(g.t * 34 + g.ph);
    _gq.set(p.x + g.vx, p.y + g.vy, p.z + g.vz); g.m.lookAt(_gq); g.m.scale.set(0.075 * wob, 0.075 / wob, 0.075 * (1 + v * 0.05));
    g.hist.unshift(p.clone()); if (g.hist.length > 12) g.hist.pop();
    g.tail.forEach((q, n) => { const hp = g.hist[Math.min(g.hist.length - 1, 3 + n * 3)]; if (hp) q.position.copy(hp); });
    if (rand() < 0.35) fx('acid', p.x, p.y, p.z, rr(-0.2, 0.2), rr(-0.4, 0), rr(-0.2, 0.2), 0.025, 0.012, 0.4, 0.9);
    // what it hits first: you (or a teammate's game's you), an inside wall, a wall, a sill or a board, or the ground
    const meD = Math.hypot(p.x - P.x, p.z - P.z), hitMe = !P.dead && !P.vault && meD < 0.42 && p.y < 1.75;
    const wall = (THIN.n && thinHit(x0, z0, p.x, p.z) <= 1) || dropHits(p.x, p.y, p.z), ground = p.y <= surfaceY(p.x, p.z) + 0.04;
    if (!hitMe && !wall && !ground && g.t < 3) continue;
    scene.remove(g.m); g.tail.forEach(q => scene.remove(q)); globs.splice(k, 1);
    // against a wall it runs down it, so the splat's on the side it came from, a little short of it, its streaks
    // thrown back off the wall; on the ground they run on the way it was going
    const L = Math.hypot(g.vx, g.vz) || 1, dx = g.vx / L, dz = g.vz / L, bx = wall ? x0 - dx * 0.25 : p.x, bz = wall ? z0 - dz * 0.25 : p.z;
    acidSplash(bx, Math.max(p.y, 0.1), bz, dx, dz, hitMe, wall);
    acidPool(bx, bz, SPIT.pool.r * (wall ? 0.7 : 1), SPIT.pool.t, wall ? Math.atan2(dz, -dx) : Math.atan2(-dz, dx));
  }
  let inAcid = false;
  for (let k = acidPools.length - 1; k >= 0; k--) {
    const q = acidPools[k]; q.t += dt;
    if (q.t >= q.life) { scene.remove(q.m); q.m.material.dispose(); acidPools.splice(k, 1); continue; }
    // it spreads out fast as it lands, then lies there; drying up, it shrinks back a little, darkens and goes
    const grow = 1 - Math.pow(1 - clamp(q.t / SPIT.pool.grow, 0, 1), 3), dry = clamp((q.life - q.t) / SPIT.pool.dry, 0, 1);
    q.m.scale.setScalar(q.r * 1.25 * (0.3 + 0.7 * grow) * (0.88 + 0.12 * dry)); q.m.material.opacity = 0.92 * dry;
    q.m.material.color.setRGB(0.7 + 0.3 * dry, 0.7 + 0.3 * dry, 0.6 + 0.4 * dry);
    if (q.tiny) continue;
    // bubbling and fuming while it's fresh
    const fresh = clamp(1 - q.t / (q.life * 0.7), 0, 1);
    if (rand() < dt * 9 * q.r * fresh) { const a = rand() * 6.283, d = Math.sqrt(rand()) * q.r * 0.7; fx('acid', q.x + Math.cos(a) * d, q.y + 0.02, q.z + Math.sin(a) * d, 0, rr(0.15, 0.4), 0, 0.02, 0.035, rr(0.2, 0.35), 0.8); }
    if (rand() < dt * 2.2 * q.r * fresh) fx('acidMist', q.x + rr(-0.5, 0.5) * q.r, q.y + 0.04, q.z + rr(-0.5, 0.5) * q.r, rr(-0.05, 0.05), rr(0.12, 0.3), rr(-0.05, 0.05), 0.2, rr(0.5, 0.9), rr(1.2, 1.8), 0.22 * fresh);
    // standing in it (still wet, and not climbing over it) burns: once however many splats you're in
    if (!inAcid && !P.dead && !P.vault && state === 'play' && dry >= 0.3 && Math.hypot(P.x - q.x, P.z - q.z) <= q.r * 0.8 * grow) inAcid = q;
  }
  // the burn creeps up the longer you've stood in it (P.acidT), and lets go again twice as fast once you're out; it
  // drags at your feet
  P.acidT = inAcid ? (P.acidT || 0) + dt : Math.max(0, (P.acidT || 0) - dt * 2);
  if (!inAcid) return;
  const q = inAcid, ramp = 1 + (SPIT.pool.max - 1) * smooth(clamp(P.acidT / SPIT.pool.ramp, 0, 1));
  P.hp -= SPIT.pool.dps * ramp * dt * S.dmgTaken * waveDmg(); P.slow = Math.max(P.slow || 0, SPIT.pool.slow * (1 - S.slowRes));
  if ((P.acidTick = (P.acidTick || 0) - dt) <= 0) { P.acidTick = 0.5; hitFromAt(q.x, q.z, 0.12 * ramp); soundAt(P.x, P.z, () => nz(0.35, 'highpass', 3400, 1600, 0.035 * ramp)); fx('acidMist', P.x, 0.12, P.z, 0, 0.5, 0, 0.15, 0.6, 0.7, 0.4); }
  playerChecks();
}
// the glob bursting: a crown of drops thrown out the way it was going (back off a wall), a few the other way, some
// landing as specks round the splat, a wet slap and a hiss; if it caught you, the hurt (half at the splash's edge)
function acidSplash(x, y, z, dx, dz, direct, wall) {
  const fx0 = wall ? -dx : dx, fz0 = wall ? -dz : dz;
  for (let k = 0; k < 18; k++) { const f = rr(0.4, 2.4) * (rand() < 0.8 ? 1 : -0.6); fx('acid', x, y + 0.03, z, fx0 * f + rr(-1.4, 1.4), rr(0.8, 2.6), fz0 * f + rr(-1.4, 1.4), rr(0.025, 0.055), 0.015, rr(0.35, 0.6), 1); }
  for (let k = 0; k < 5; k++) { const d = rr(0.5, 1.3), a = rr(-0.9, 0.9), c = Math.cos(a), s = Math.sin(a); acidPool(x + (fx0 * c - fz0 * s) * d, z + (fx0 * s + fz0 * c) * d, rr(0.06, 0.14), rr(3, 5), rand() * 6.283, true); }
  fx('acidMist', x, y, z, 0, 0.25, 0, 0.35, 1.1, 1.3, 0.35);
  soundAt(x, z, () => { nz(0.09, 'lowpass', 900, 250, 0.3); nz(0.6, 'highpass', 3000, 1100, 0.1); nz(0.25, 'bandpass', 1400, 600, 0.08, 2); });
  const d = Math.hypot(P.x - x, P.z - z);
  if (P.dead || P.vault || state !== 'play' || (!direct && d > SPIT.splash)) return;
  const k = direct ? 1 : 1 - 0.5 * d / SPIT.splash;
  P.hp -= SPIT.dmg * k * S.dmgTaken * waveDmg(); P.hitFrom = Math.atan2(-dx, -dz); hitFromAt(x - dx, z - dz, SPIT.dmg * k / 25);
  interruptBandage(); SFX.hurt(); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; shake = Math.max(shake, 0.18);
  P.slow = Math.min(1, (P.slow || 0) + 0.25 * (1 - S.slowRes));
  playerChecks();
}
// a splat on the ground, turned so its streaks run off along ang; tiny ones (drips, specks) are only for show
function acidPool(x, z, r, life, ang, tiny) {
  const y = surfaceY(x, z) + (tiny ? 0.018 : 0.022) + rand() * 0.002;
  const mt = lam(0xffffff, { map: pick(SPLAT_TEX), emissive: ACID_GLOW, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mt.userData.mobile = true;
  const m = new THREE.Mesh(POOL_G, mt); m.position.set(x, y, z); m.rotation.y = ang || 0; m.renderOrder = 1; m.scale.setScalar(0.01); scene.add(m);
  acidPools.push({ m, x, y, z, r, life, t: 0, tiny: !!tiny });
}
// a spitter going down: its sac bursts
function spitterDies(z) {
  if (z.type !== 'spitter') return;
  spitters.delete(z);
  const sp = z.m.spit, at = sp ? sp.sac.getWorldPosition(new V3()) : new V3(z.x, 1.2, z.z); if (sp) sp.sac.visible = false;
  acidSplash(at.x, at.y, at.z, Math.sin(z.face), Math.cos(z.face), false, false);
  acidPool(z.x + Math.sin(z.face) * 0.3, z.z + Math.cos(z.face) * 0.3, SPIT.burst.r, SPIT.burst.t, rand() * 6.283);
}
function clearSpit() {
  globs.forEach(g => { scene.remove(g.m); g.tail.forEach(q => scene.remove(q)); }); globs.length = 0;
  acidPools.forEach(q => { scene.remove(q.m); q.m.material.dispose(); }); acidPools.length = 0; spitters.clear(); P.acidT = 0;
}

// ---- its pose: rearing back with its head thrown up and shaking as the sac swells (w), then retching forward, head
// and chest snapping down and out, as it spits (thr) ----
function zSpitPose(z, a, T, K) {
  const s = z.sp; if (!s) return;
  const w = smooth(clamp(s.w, 0, 1)), th = Math.sin(Math.min(1, s.thr) * Math.PI * 0.5);
  if (w > 0.001) { zMix(T, { ux: -0.4, hx: -0.8, rx: -0.06, alx: -0.25, arx: -0.25, aly: -0.45, ary: 0.45, elL: -0.9, elR: -0.9, fw: -0.06, klx: 0.15, krx: 0.15 }, w); T[ZJ.hz] += 0.06 * Math.sin(a.t * 19) * w; }
  if (th > 0.001) { zMix(T, { ux: 0.62, hx: 0.6, fw: 0.14, alx: 0.35, arx: 0.35, elL: -0.4, elR: -0.4 }, th); zBoost(K, ['ux', 'hx', 'fw'], 2.8); }
}
