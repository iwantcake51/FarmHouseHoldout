// Pooled particles (blood, dust, sparks, embers, smoke) and flying gibs.

const parts = [];
const PG = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const PMAT = { spark: basic(0xffd88a), blood: lam(0x7a1a12), blood2: lam(0x4d0f0b), wood: lam(0xa8804f), dust: lam(0x7d7564), ember: basic(0xff8a32), smoke: lam(0x3a3836) };
for (let k = 0; k < 280; k++) { const m = new THREE.Mesh(PG, PMAT.blood); m.visible = false; scene.add(m); parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0, kind: 'blood', landed: false }); }
let pIdx = 0;
// dust, sparks, smoke and embers are soft sprites now (effects/puffs.js); blood and grit stay as little tumbling bits
function burst(x, y, z, n, kind, dirx, dirz, force) {
  if (kind === 'dust') return dustBurst(x, y, z, n, dirx, dirz, force);
  if (kind === 'spark') return sparkBurst(x, y, z, n, dirx, dirz, force);
  if (kind === 'smoke') { for (let k = 0; k < n; k++) fx('smoke', x + rr(-0.3, 0.3), y + rr(0, 0.3), z + rr(-0.3, 0.3), rr(-0.8, 0.8), rr(0.3, 1.2), rr(-0.8, 0.8), rr(0.3, 0.5), rr(1.2, 2), rr(1.4, 2.4), rr(0.3, 0.45)); return; }
  if (kind === 'ember') { for (let k = 0; k < n; k++) fx('ember', x + rr(-0.15, 0.15), y, z + rr(-0.15, 0.15), (dirx || 0) * (force || 1) + rr(-1.2, 1.2), rr(0.5, 2.6), (dirz || 0) * (force || 1) + rr(-1.2, 1.2), rr(0.06, 0.12), 0.02, rr(0.5, 1.2), 0.9); return; }
  cubeBurst(x, y, z, n, kind, dirx, dirz, force);
}
function cubeBurst(x, y, z, n, kind, dirx, dirz, force, scl) {
  for (let k = 0; k < n; k++) {
    const p = parts[pIdx = (pIdx + 1) % parts.length];
    const isBlood = kind === 'blood';
    p.kind = kind; p.landed = false;
    p.m.material = isBlood ? (rand() < .5 ? PMAT.blood : PMAT.blood2) : PMAT[kind]; p.m.visible = true; p.m.position.set(x, y, z);
    p.m.scale.setScalar((isBlood ? rr(.4, 1.3) : rr(.6, 1.6)) * (scl || 1));
    p.vx = (dirx || 0) * (force || 2) * rr(.3, 1.2) + rr(-1.1, 1.1); p.vz = (dirz || 0) * (force || 2) * rr(.3, 1.2) + rr(-1.1, 1.1); p.vy = rr(0.8, 3.6);
    p.life = rr(1.2, 2.2);
    if (kind === 'spark') { p.life = rr(0.08, 0.24); p.m.scale.setScalar(rr(0.25, 0.5)); p.vx *= 1.6; p.vz *= 1.6; p.vy = rr(0.5, 3); }
  }
}
const gibs = [];
// blood and dust particles, growing decals and flying gibs
function stepParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue; p.life -= dt;
    const m = p.m;
    if (p.kind === 'smoke') { m.position.y += dt * 1.2; m.position.x += p.vx * dt * 0.2; m.position.z += p.vz * dt * 0.2; m.scale.setScalar(Math.min(4, m.scale.x + dt * 3)); }
    else if (p.kind === 'ember' && p.vy < 3) { m.position.y += dt * 1.5; m.position.x += p.vx * dt * 0.3; m.position.z += p.vz * dt * 0.3; }
    else if (m.position.y > 0.035) { p.vy -= 14 * dt; m.position.x += p.vx * dt; m.position.y += p.vy * dt; m.position.z += p.vz * dt; m.rotation.x += dt * 8; }
    else {
      m.position.y = 0.035; p.vx = p.vz = 0;
      if (!p.landed) { p.landed = true; if (p.kind === 'blood') { if (rand() < 0.55) splat(m.position.x, m.position.z, 'drop', rr(0.12, 0.3)); p.life = Math.min(p.life, 0.05); } }
    }
    if (p.life < 0.4) m.scale.setScalar(Math.max(0.01, p.life / 0.4) * (p.kind === 'smoke' ? 3 : 1));
    if (p.life <= 0) m.visible = false;
  }
  const gdt = P.dead ? P.deathDt || 0 : dt;   // the world is frozen once you're down, but your own blood pool keeps spreading
  for (const d of decals) if (d.m.visible && d.t < d.dur) { d.t += gdt; const k = Math.min(1, d.t / d.dur), e = 1 - Math.pow(1 - k, 3); d.m.scale.set(d.s * (0.25 + 0.75 * e), d.s * (0.25 + 0.75 * e), 1); }
  for (let k = gibs.length - 1; k >= 0; k--) {
    const g = gibs[k]; g.life -= dt;
    if (!g.landed) {
      g.vy -= 14 * dt; g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt; g.m.rotation.x += g.spin * dt; g.m.rotation.z += g.spin * 0.6 * dt;
      if (bulletBlocked(g.m.position.x, g.m.position.z)) { g.vx *= -0.3; g.vz *= -0.3; }
      if (rand() < 0.5) burst(g.m.position.x, g.m.position.y, g.m.position.z, 1, 'blood', 0, 0, 0.3);
      if (g.m.position.y < 0.12) { g.m.position.y = 0.12; if (Math.abs(g.vy) > 2) { g.vy *= -0.35; g.vx *= 0.5; g.vz *= 0.5; splat(g.m.position.x, g.m.position.z, 'drop', rr(.4, .6)); } else { g.landed = true; splat(g.m.position.x, g.m.position.z, 'pool', 0.6, undefined, 1.5); } }
    }
    g.m.visible = visAt(g.m.position.x, g.m.position.z) > 0.2;
    if (g.life < 1) g.m.position.y -= dt * 0.3;
    if (g.life <= 0) { scene.remove(g.m); gibs.splice(k, 1); }
  }
}
