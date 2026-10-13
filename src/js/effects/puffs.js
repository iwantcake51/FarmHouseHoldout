// Soft effects as sprites: dust clouds, spark streaks, impact flashes, blood mist and embers.
// burst() in effects/particles.js hands its dust, spark, smoke and ember kinds over to these, so every kick-up looks this way.

// a thin streak, bright at its head, that spark sprites stretch along their motion
const TEX_SPARK = glowTex(64, 8, x => { const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,190,110,0)'); g.addColorStop(0.65, 'rgba(255,225,160,0.85)'); g.addColorStop(1, 'rgba(255,255,240,1)'); x.fillStyle = g; x.fillRect(0, 2, 64, 4); });
// per kind: texture, additive or not, colour (col2: what it cools to over its life), whether the light map tints it,
// gravity, drag and rise
const FXK = {
  dust: { tex: TEX_SMOKE, add: false, col: 0xa08e74, lit: true, grav: 0, drag: 3.2, rise: 0.25 },
  smoke: { tex: TEX_SMOKE, add: false, col: 0x5a5652, lit: true, grav: 0, drag: 2.2, rise: 0.6 },
  mist: { tex: TEX_SMOKE, add: false, col: 0x8a1812, lit: true, grav: 1.2, drag: 4, rise: 0 },
  spark: { tex: TEX_SPARK, add: true, col: 0xffd890, lit: false, grav: 9, drag: 1.6, rise: 0 },
  flash: { tex: TEX_CORE, add: true, col: 0xffe2a8, lit: false, grav: 0, drag: 0, rise: 0 },
  ember: { tex: TEX_CORE, add: true, col: 0xff8a32, lit: false, grav: -0.6, drag: 1.5, rise: 0 },
  flame: { tex: TEX_CORE, add: true, col: 0xffd27a, col2: 0xc8300a, lit: false, grav: -3.2, drag: 2.4, rise: 0 }
};
const fxs = [];
for (let k = 0; k < 300; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_SMOKE, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); fxs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.5, a: 0.4, spin: 0, kind: 'dust' }); }
let fxIdx = 0;
const _fc = new THREE.Color(), _fc2 = new THREE.Color(), _fp = new V3(), _fq = new V3();
function fx(kind, x, y, z, vx, vy, vz, s0, s1, life, a) {
  const p = fxs[fxIdx = (fxIdx + 1) % fxs.length], K = FXK[kind], m = p.s.material;
  if (m.map !== K.tex) { m.map = K.tex; m.needsUpdate = true; }
  m.blending = K.add ? THREE.AdditiveBlending : THREE.NormalBlending; m.rotation = rand() * 6.28;
  p.kind = kind; p.s.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.life = p.max = life; p.a = a; p.spin = rr(-1.5, 1.5);
  p.s.scale.setScalar(s0); p.s.visible = true;
}
// a cloud of dust that billows out and settles, with a few chips of grit
function dustBurst(x, y, z, n, dx, dz, force) {
  const f = force || 1.5;
  for (let k = 0, m = Math.ceil(n * 0.7); k < m; k++) fx('dust', x + rr(-0.1, 0.1), Math.max(0.06, y) + rr(-0.05, 0.05), z + rr(-0.1, 0.1), (dx || 0) * f * rr(0.2, 0.6) + rr(-0.7, 0.7), rr(0.2, 0.9), (dz || 0) * f * rr(0.2, 0.6) + rr(-0.7, 0.7), rr(0.12, 0.22), rr(0.5, 0.95), rr(0.6, 1.1), rr(0.26, 0.42));
  cubeBurst(x, y, z, Math.ceil(n * 0.35), 'dust', dx, dz, force, 0.45);
}
// a ring of dust thrown out along the ground (landing a vault, a heavy body hitting the floor)
function groundDust(x, z, strength, dx, dz) {
  const n = Math.round(6 + 8 * strength);
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + rr(-0.2, 0.2), sp = rr(1.1, 2.2) * (0.6 + 0.4 * strength);
    fx('dust', x + Math.sin(a) * 0.15, 0.08, z + Math.cos(a) * 0.15, Math.sin(a) * sp + (dx || 0) * 0.8, rr(0.15, 0.45), Math.cos(a) * sp + (dz || 0) * 0.8, rr(0.12, 0.2), rr(0.55, 0.9) * (0.7 + 0.3 * strength), rr(0.6, 1.0), rr(0.22, 0.38));
  }
  cubeBurst(x, 0.1, z, Math.round(2 + 3 * strength), 'dust', dx, dz, 1.2, 0.4);
}
// bright streaks that fly off and fall
function sparkBurst(x, y, z, n, dx, dz, force) {
  const f = force || 3;
  for (let k = 0; k < n; k++) fx('spark', x, y, z, (dx || 0) * f * rr(0.4, 1.3) + rr(-1.6, 1.6), rr(0.4, 3.2), (dz || 0) * f * rr(0.4, 1.3) + rr(-1.6, 1.6), 0.05, 0.03, rr(0.12, 0.3), 1);
}
// a bullet hitting a wall or a board: a flash, a spray of sparks, a puff of dust off the surface and a few chips
function impactFx(x, y, z, nx, nz) {
  fx('flash', x, y, z, 0, 0, 0, 0.42, 0.18, 0.07, 0.9);
  sparkBurst(x, y, z, 5 + (rand() * 3 | 0), nx, nz, 3.5);
  for (let k = 0; k < 2; k++) fx('dust', x + nx * 0.05, y, z + nz * 0.05, nx * rr(0.6, 1.4) + rr(-0.3, 0.3), rr(0.1, 0.5), nz * rr(0.6, 1.4) + rr(-0.3, 0.3), 0.08, rr(0.4, 0.6), rr(0.6, 0.9), 0.32);
  cubeBurst(x, y, z, 2 + (rand() * 2 | 0), 'dust', nx, nz, 2.2, 0.35);
}
// a fine red mist off a hit, along the shot
function hitMist(x, y, z, dx, dz, big) {
  for (let k = 0, n = big ? 3 : 2; k < n; k++) fx('mist', x + rr(-0.08, 0.08), y + rr(-0.08, 0.08), z + rr(-0.08, 0.08), dx * rr(0.6, 1.6) + rr(-0.3, 0.3), rr(-0.1, 0.5), dz * rr(0.6, 1.6) + rr(-0.3, 0.3), rr(0.08, 0.14), rr(0.35, 0.55) * (big ? 1.3 : 1), rr(0.25, 0.4), 0.38);
}
// fire on a burning body (zombies/ai.js, a burning corpse in zombies/deaths.js): tongues of flame licking up off it
// between heights y0 and y1 within r of its middle, yellow at the base and cooling to red as they rise and shrink, the
// odd ember thrown off and a thread of dark smoke from the top
function burnFx(x, z, y0, y1, r, dt) {
  for (let n = dt * 30; n > 0; n--) {
    if (n < 1 && rand() > n) break;
    const a = rand() * 6.28, d = rr(0, r);
    fx('flame', x + Math.sin(a) * d, rr(y0, y1), z + Math.cos(a) * d, rr(-0.2, 0.2), rr(0.5, 1.2), rr(-0.2, 0.2), rr(0.15, 0.26), rr(0.03, 0.07), rr(0.3, 0.55), rr(0.5, 0.8));
  }
  if (rand() < dt * 5) fx('ember', x + rr(-r, r), rr(y0, y1), z + rr(-r, r), rr(-0.8, 0.8), rr(0.8, 2.2), rr(-0.8, 0.8), rr(0.06, 0.1), 0.02, rr(0.6, 1.1), 0.9);
  if (rand() < dt * 2.5) fx('smoke', x + rr(-0.1, 0.1), y1 + 0.15, z + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(0.5, 0.9), rr(-0.2, 0.2), 0.15, rr(0.7, 1.1), rr(1.4, 2.2), 0.28);
}
function stepFx(dt) {
  if (dt <= 0) return;
  for (const p of fxs) {
    if (p.life <= 0) continue; p.life -= dt;
    const s = p.s, m = s.material; if (p.life <= 0) { s.visible = false; continue; }
    const K = FXK[p.kind], k = 1 - p.life / p.max, dr = Math.exp(-dt * K.drag);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - K.grav * dt + K.rise * dt;
    s.position.x += p.vx * dt; s.position.y += p.vy * dt; s.position.z += p.vz * dt;
    if (s.position.y < 0.03) { s.position.y = 0.03; p.vy = 0; if (p.kind === 'spark') p.life = Math.min(p.life, 0.03); }
    let op = p.a * Math.min(1, k * 9) * Math.pow(1 - k, p.kind === 'flash' ? 1 : 1.6);
    if (p.kind === 'spark') {
      // stretch the streak along its motion on screen
      _fp.copy(s.position).project(cam); _fq.set(s.position.x + p.vx * 0.03, s.position.y + p.vy * 0.03, s.position.z + p.vz * 0.03).project(cam);
      const sx = (_fq.x - _fp.x) * innerWidth, sy = (_fq.y - _fp.y) * innerHeight;
      m.rotation = Math.atan2(sy, sx); const sp = Math.hypot(p.vx, p.vy, p.vz);
      s.scale.set(0.05 + sp * 0.035, 0.028, 1);
    } else { const e = 1 - Math.pow(1 - k, 2.2); s.scale.setScalar(p.s0 + (p.s1 - p.s0) * e); m.rotation += p.spin * dt; }
    if (K.lit) { const L = lightLevelAt(s.position.x, s.position.z); m.color.copy(_fc.setHex(K.col)).multiplyScalar(Math.min(1.15, 0.16 + L * 0.85)); op *= 0.3 + 0.7 * visAt(s.position.x, s.position.z); }
    else if (K.col2) m.color.setHex(K.col).lerp(_fc2.setHex(K.col2), k);
    else m.color.setHex(K.col);
    m.opacity = op;
  }
}
