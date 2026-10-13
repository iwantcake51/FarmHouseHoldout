// Explosions, the underbarrel grenade launcher and grenades in flight.

const flashes = [];
function explode(x, z, r, dmg, self) {
  SFX.boom(); shake = Math.max(shake, 0.5);
  burst(x, 0.4, z, 14, 'ember', 0, 0, 0); burst(x, 0.4, z, 10, 'smoke', 0, 0, 0); burst(x, 0.3, z, 8, 'dust', 0, 0, 0);
  splat(x, z, 'scorch', r * 1.1, undefined, 0.15);
  flashes.push({ x, z, r: r * 3, int: 2.4, col: [1, 0.7, 0.35], t: 0.25, max: 0.25 }); lmT = 0;
  for (const zb of zombies.slice()) {
    const dx = zb.x - x, dz = zb.z - z, d = Math.hypot(dx, dz); if (d > r) continue;
    const f = 1 - d / r, nx = dx / (d || 1), nz = dz / (d || 1);
    if (d < r * 0.5) ['armL', 'armR', 'legL', 'legR'].forEach(p => { if (rand() < 0.45) sever(zb, p, nx, nz); });
    hurtZombie(zb, dmg * (0.4 + 0.6 * f), nx, nz, 6 * f, 'boom', rand() < 0.3 ? 'head' : 'torso');
  }
  if (self) { const d = Math.hypot(P.x - x, P.z - z); if (d < r * 0.8) { P.hp -= 25 * (1 - d / r) * S.dmgTaken; hurtFx = 1; interruptBandage(); } }
}
EFF.boom = { dmg: 100, kick: 6 };
EFF.fire = {};
EFF.bleed = {};
const grenades = [];
function throwGrenade() {
  const D = W(curId()); if (!D || !D.gl || W8.glCd > 0 || P.vault) return;
  W8.glCd = D.glRecharge || 6; SFX.thump();
  const dx = aimPt.x - P.x, dz = aimPt.z - P.z, d = Math.min(14, Math.hypot(dx, dz));
  const a = Math.atan2(dx, dz), x1 = P.x + Math.sin(a) * d, z1 = P.z + Math.cos(a) * d;
  const m = box(scene, 0.12, 0.12, 0.18, GM.olive, P.x, GUN_Y, P.z);
  grenades.push({ m, x0: P.x + Math.sin(a) * 0.8, z0: P.z + Math.cos(a) * 0.8, x1, z1, t: 0, dur: 0.25 + d * 0.045, h: 0.6 + d * 0.12 });
}
// underbarrel grenades in flight
function updateGrenades(dt) {
  for (let k = grenades.length - 1; k >= 0; k--) {
    const g = grenades[k]; g.t += dt / g.dur; const t = Math.min(1, g.t);
    const x = g.x0 + (g.x1 - g.x0) * t, z = g.z0 + (g.z1 - g.z0) * t;
    g.m.position.set(x, GUN_Y + Math.sin(t * Math.PI) * g.h - t * (GUN_Y - 0.1), z); g.m.rotation.x += dt * 12;
    if (t >= 1 || bulletBlocked(x, z)) { scene.remove(g.m); grenades.splice(k, 1); explode(x, z, 3, 150, true); }
  }
}
