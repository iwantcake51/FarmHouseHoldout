// Spitters: zombies that hang back and lob acid at you, so holding one window and mowing the rest down as they climb in
// doesn't work. One with a clear line to whoever it's after, between SPIT.min and SPIT.max metres off (through a window
// too, so long as it isn't boarded shut), stops where it is, rears back with its throat sac swelling and glowing
// (SPIT.wind seconds: hit it hard enough to stagger it and the spit's lost), then snaps forward and spits a glob in a
// low arc at where you're standing as it lets go. Keep moving and it lands behind you; stand still and it splashes you
// (SPIT.dmg, less toward the splash's edge) and leaves a pool of acid there (SPIT.pool) that burns anyone standing in it
// and slows them. It spits again every SPIT.cd seconds while it can see you; once it can't, it comes on like any other
// zombie, and close up it claws like one. When one dies its sac bursts and leaves a small pool of its own.
// In co-op the host's spitters decide when to spit (zombies/ai.js) and every game flies the same glob and makes the same
// pool ('spw' as it rears back, 'spt' as it lets go: net/sync.js), each burning only its own survivor.

const SPIT = {
  from: 5, share: 0.05, sharePer: 0.006, shareMax: 0.12,   // first wave, share of the wave, how it grows (waves/waves.js)
  min: 3.5, max: 11, wind: 0.85, cd: [3.4, 4.8], first: [0.8, 2.2],   // range, the rear back (s), between spits (s), the first
  speed: 12, g: 9, through: 1.45, dmg: 24, splash: 1.1,   // the glob's speed across the ground (m/s), its fall, the height it takes through a window; the splash's hurt and reach
  pool: { r: 1.05, t: 6.5, dps: 11, slow: 0.35, grow: 0.25, fade: 1.5 },   // the pool it leaves: reach, how long, burn, slow
  burst: { r: 0.8, t: 4 },   // a spitter's own sac bursting as it dies
  col: 0x9fe03c, glow: 0xc8ff52
};
const globs = [], acidPools = [];
const GLOB_G = new THREE.IcosahedronGeometry(0.085, 1), GLOB_M = basic(SPIT.glow);
GLOB_M.userData.mobile = true;
// the pool on the ground: a ragged blob of acid, soft at its edge, drawn flat just over whatever's under it
const ACID_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * 6.283 + rand() * 0.6, r = k ? rr(16, 30) : 46, cx = 64 + (k ? Math.cos(a) * rr(18, 34) : 0), cy = 64 + (k ? Math.sin(a) * rr(18, 34) : 0);
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
})();
const POOL_G = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
// two more kinds of soft sprite for the acid (effects/puffs.js): glowing drops flung off a glob or a splash, and the
// sickly steam that hangs over a pool
FXK.acid = { tex: TEX_DOT, add: true, col: SPIT.glow, col2: 0x4a8a10, boost: 1.3, grav: 6, drag: 1.4, rise: 0, fin: 0.03, fade: 1.2 };
FXK.acidMist = { tex: TEX_SMOKES, col: 0x9cc64a, lit: true, gain: SMOKE_GAIN, grav: 0, drag: 2.4, rise: 0.35, fin: 0.15, fade: 1.4, wind: 0.8 };

// ---- its look: a swollen, glowing sac under the jaw, a mouth lit from inside, sores over the belly ----
function spitterLook(m) {
  const sacM = lam(0x8fa648, { emissive: 0x2a4a08 }), glowM = basic(SPIT.glow), soreM = lam(0x9ab84c, { emissive: 0x1e3806 });
  const sac = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.13, 0.17), sacM); sac.position.set(0, -0.155, 0.035); m.head.add(sac);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.01), glowM); mouth.position.set(0, -0.085, 0.152); m.head.add(mouth);
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(rr(0.035, 0.06), rr(0.035, 0.06), 0.02), soreM); s.position.set(rr(-0.13, 0.13), rr(-0.18, 0.05), 0.105); m.torso.add(s); }
  m.spit = { sac, sacM, mouth };
}

// ---- the AI (the host's, or alone): true while it's standing off to spit, so nothing else moves it this frame ----
function spitStep(z, dt, t, dp) {
  const s = z.sp || (z.sp = { cd: rr(...SPIT.first), w: 0, thr: 0 });
  s.cd -= dt; s.thr = Math.max(0, s.thr - dt * 2.4);
  if (s.w > 0) {
    if (z.stagger > 0 || z.crawl) { s.w = 0; s.cd = rr(0.8, 1.4); return false; }   // knocked out of it: the spit's lost
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
// rearing back: a wet gurgle building in its throat
function spitWindFx(z) { soundAt(z.x, z.z, () => { nz(0.7, 'bandpass', 260, 520, 0.16, 3); tn(0.6, 'sawtooth', 70, 110, 0.03); }); }
// it lets go: the glob from its mouth to where they stand, landing in a low arc
function spitAt(z, tx, tz) {
  const h = z.m.head.getWorldPosition(new V3()), sf = Math.sin(z.face), cf = Math.cos(z.face);
  const x0 = h.x + sf * 0.18, y0 = h.y - 0.08, z0 = h.z + cf * 0.18, T = spitTime(x0, y0, z0, tx, tz);
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
function launchGlob(z, x0, y0, z0, tx, tz, T) {
  const ty = surfaceY(tx, tz) + 0.05, m = new THREE.Mesh(GLOB_G, GLOB_M);
  m.position.set(x0, y0, z0); scene.add(m);
  globs.push({ m, vx: (tx - x0) / T, vy: (ty - y0 + 0.5 * SPIT.g * T * T) / T, vz: (tz - z0) / T, t: 0 });
  soundAt(x0, z0, () => { nz(0.16, 'bandpass', 900, 300, 0.22, 1.5); nz(0.1, 'highpass', 2400, 1200, 0.08); });
  for (let k = 0; k < 5; k++) fx('acid', x0, y0, z0, Math.sin(z.face) * rr(1, 3) + rr(-0.6, 0.6), rr(-0.4, 0.8), Math.cos(z.face) * rr(1, 3) + rr(-0.6, 0.6), 0.05, 0.02, rr(0.25, 0.45), 1);
}

// ---- every frame: the globs in the air, the pools on the ground, and a puppet spitter's rearing back in co-op ----
function updateSpit(dt) {
  if (!(dt > 0)) return;
  if (netClient()) for (const z of zombies) { const s = z.sp; if (z.type !== 'spitter' || !s) continue; if (s.w > 0) s.w = Math.min(0.98, s.w + dt / SPIT.wind); s.thr = Math.max(0, s.thr - dt * 2.4); }
  for (let k = globs.length - 1; k >= 0; k--) {
    const g = globs[k], p = g.m.position, x0 = p.x, z0 = p.z;
    g.t += dt; g.vy -= SPIT.g * dt; p.x += g.vx * dt; p.y += g.vy * dt; p.z += g.vz * dt;
    if (rand() < 0.7) fx('acid', p.x, p.y, p.z, rr(-0.3, 0.3), rr(-0.2, 0.3), rr(-0.3, 0.3), 0.06, 0.02, rr(0.2, 0.35), 0.9);
    // what it hits first: you (or a teammate's game's you), an inside wall, a wall, a sill or a board, or the ground
    const meD = Math.hypot(p.x - P.x, p.z - P.z), hitMe = !P.dead && !P.vault && meD < 0.42 && p.y < 1.75;
    const wall = (THIN.n && thinHit(x0, z0, p.x, p.z) <= 1) || dropHits(p.x, p.y, p.z), ground = p.y <= surfaceY(p.x, p.z) + 0.04;
    if (!hitMe && !wall && !ground && g.t < 3) continue;
    scene.remove(g.m); globs.splice(k, 1);
    // against a wall it runs down it, so the pool's on the side it came from, a little short of it
    const L = Math.hypot(g.vx, g.vz) || 1, bx = wall ? x0 - g.vx / L * 0.25 : p.x, bz = wall ? z0 - g.vz / L * 0.25 : p.z;
    acidSplash(bx, Math.max(p.y, 0.1), bz, -g.vx / L, -g.vz / L, hitMe);
    acidPool(bx, bz, SPIT.pool.r * (wall ? 0.75 : 1), SPIT.pool.t);
  }
  for (let k = acidPools.length - 1; k >= 0; k--) {
    const q = acidPools[k]; q.t += dt;
    if (q.t >= q.life) { scene.remove(q.m); q.m.material.dispose(); acidPools.splice(k, 1); continue; }
    const grow = smooth(clamp(q.t / SPIT.pool.grow, 0, 1)), fade = clamp((q.life - q.t) / SPIT.pool.fade, 0, 1);
    q.m.scale.setScalar(q.r * (0.35 + 0.65 * grow) * (0.85 + 0.15 * fade)); q.m.material.opacity = 0.82 * fade;
    if (rand() < dt * 3 * q.r) fx('acidMist', q.x + rr(-0.6, 0.6) * q.r, q.y + 0.05, q.z + rr(-0.6, 0.6) * q.r, 0, rr(0.15, 0.35), 0, 0.25, rr(0.6, 1), rr(1, 1.6), 0.35 * fade);
    // standing in it burns, and drags at your feet, while it's still wet enough to (not while you're climbing over)
    if (P.dead || P.vault || state !== 'play' || fade < 0.25 || Math.hypot(P.x - q.x, P.z - q.z) > q.r * 0.85 * grow) continue;
    P.hp -= SPIT.pool.dps * dt * S.dmgTaken * waveDmg(); P.slow = Math.max(P.slow || 0, SPIT.pool.slow * (1 - S.slowRes));
    if ((q.tick = (q.tick || 0) - dt) <= 0) { q.tick = 0.45; hitFromAt(q.x, q.z, 0.25); nz(0.3, 'highpass', 3000, 1500, 0.05); fx('acidMist', P.x, 0.15, P.z, 0, 0.5, 0, 0.2, 0.7, 0.8, 0.5); }
    playerChecks();
  }
}
// the glob bursting: drops flung back the way it came, a hiss, and if it caught you, the hurt (less toward the edge)
function acidSplash(x, y, z, dx, dz, direct) {
  for (let k = 0; k < 14; k++) fx('acid', x, y, z, dx * rr(0.5, 2.2) + rr(-1.8, 1.8), rr(0.6, 2.6), dz * rr(0.5, 2.2) + rr(-1.8, 1.8), 0.07, 0.02, rr(0.3, 0.6), 1);
  fx('acidMist', x, y, z, 0, 0.3, 0, 0.4, 1.2, 1.2, 0.5);
  soundAt(x, z, () => { nz(0.5, 'highpass', 2600, 900, 0.14); nz(0.12, 'lowpass', 600, 200, 0.18); });
  const d = Math.hypot(P.x - x, P.z - z);
  if (P.dead || P.vault || state !== 'play' || (!direct && d > SPIT.splash)) return;
  const k = direct ? 1 : 1 - 0.5 * d / SPIT.splash;
  P.hp -= SPIT.dmg * k * S.dmgTaken * waveDmg(); P.hitFrom = Math.atan2(-dx, -dz); hitFromAt(x - dx, z - dz, SPIT.dmg * k / 25);
  interruptBandage(); SFX.hurt(); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; shake = Math.max(shake, 0.25);
  P.slow = Math.min(1, (P.slow || 0) + 0.4 * (1 - S.slowRes));
  playerChecks();
}
function acidPool(x, z, r, life) {
  const y = surfaceY(x, z) + 0.022, m = new THREE.Mesh(POOL_G, new THREE.MeshBasicMaterial({ map: ACID_TEX, color: SPIT.col, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.material.userData.mobile = true; m.position.set(x, y, z); m.rotation.y = rand() * 6.283; m.renderOrder = 1; m.scale.setScalar(0.01); scene.add(m);
  acidPools.push({ m, x, y, z, r, life, t: 0 });
}
// a spitter going down: its sac bursts
function spitterDies(z) {
  if (z.type !== 'spitter') return;
  const h = z.m.head.getWorldPosition(new V3());
  acidSplash(h.x, h.y - 0.15, h.z, 0, 0, false); acidPool(z.x, z.z, SPIT.burst.r, SPIT.burst.t);
}
function clearSpit() { globs.forEach(g => scene.remove(g.m)); globs.length = 0; acidPools.forEach(q => { scene.remove(q.m); q.m.material.dispose(); }); acidPools.length = 0; }

// ---- its pose: rearing back as the sac swells (w), then the head and chest snapped forward as it spits (thr) ----
function zSpitPose(z, a, T, K) {
  const s = z.sp, sp = z.m.spit; if (!s || !sp) return;
  const w = smooth(clamp(s.w, 0, 1)), th = Math.sin(Math.min(1, s.thr) * Math.PI * 0.5);
  if (w > 0.001) zMix(T, { ux: -0.34, hx: -0.75, rx: -0.06, alx: -0.45, arx: -0.45, aly: -0.35, ary: 0.35, elL: -0.6, elR: -0.6, fw: -0.05 }, w);
  if (th > 0.001) { zMix(T, { ux: 0.48, hx: 0.55, fw: 0.12, alx: 0.15, arx: 0.15 }, th); zBoost(K, ['ux', 'hx', 'fw'], 2.6); }
  sp.sac.scale.setScalar(1 + 0.45 * w - 0.25 * th); sp.sacM.emissive.setRGB(0.16 + 0.5 * w, 0.29 + 0.6 * w, 0.03 + 0.1 * w);
  sp.mouth.scale.y = 1 + 2.5 * w + 3 * th;
}
