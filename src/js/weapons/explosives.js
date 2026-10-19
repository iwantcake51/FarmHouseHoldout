// Explosions, the underbarrel grenade launcher and grenades in flight.

const flashes = [];
// a blast: a white-hot flash, a fireball that balloons and burns out in a blink, sparks and shrapnel, a ring of dust
// and dirt thrown out along the ground, then a column of smoke that hangs. Zombies near the middle that it kills
// are blown apart (blowApart in zombies/damage.js); further out they lose limbs and are thrown. remote: a co-op
// teammate's blast, just the sight and sound of it (what it did to the zombies comes in their hits, net/sync.js).
// small: a hand cannon's explosive tip, which only shakes the view when it goes off right by you (TIP_SHAKE)
// instead of the full shake of a grenade wherever it lands
const TIP_SHAKE = { near: 2.5, max: 0.12 };
// how wide the scorch a blast leaves is (metres across): a tip's no more than a dark smudge where it struck, a
// grenade's a patch the size of a doormat (the soot itself, and how it lies on walls: SOOT in core/shaders.js)
const SCORCH = { tip: 0.35, blast: 1.0 };
function explode(x, z, r, dmg, self, remote, small) {
  if (!remote && netLink()) netSend('boom', { x: nr(x), z: nr(z), r, s: small ? 1 : 0 });
  soundAt(x, z, () => SFX.boom(Math.hypot(P.x - x, P.z - z), r), true);
  { const d = Math.hypot(P.x - x, P.z - z), k = small ? TIP_SHAKE.max * Math.pow(Math.max(0, 1 - d / TIP_SHAKE.near), 2) : 0.8; shake = Math.max(shake, k); }
  blastFx(x, z, r, small);   // the fire, smoke, sparks and dust (effects/puffs.js)
  splat(x, z, 'scorch', small ? SCORCH.tip : SCORCH.blast, undefined, 0.12);
  flashes.push({ x, y: 0.7, z, r: r * 3.2, int: 3, col: [1, 0.72, 0.38], t: 0.3, max: 0.3 }); lmT = 0;
  if (remote) return;
  for (const zb of zombies.slice()) {
    const dx = zb.x - x, dz = zb.z - z, d = Math.hypot(dx, dz); if (d > r) continue;
    const f = 1 - d / r, nx = dx / (d || 1), nz = dz / (d || 1);
    zb.gib = d < r * 0.6;   // if this kills it, it comes apart
    netAct(zb, nx, nz, () => {
      if (d < r * 0.5) ['armL', 'armR', 'legL', 'legR'].forEach(p => { if (rand() < 0.45) sever(zb, p, nx, nz); });
      hurtZombie(zb, dmg * (0.4 + 0.6 * f), nx, nz, 6 * f, 'boom', rand() < 0.3 ? 'head' : 'torso');
    });
    zb.gib = false;
  }
  if (self) { const d = Math.hypot(P.x - x, P.z - z); if (d < r * 0.8) { P.hp -= 25 * (1 - d / r) * S.dmgTaken; hitFromAt(x, z, 1.5); interruptBandage(); } }
}
EFF.boom = { dmg: 100, kick: 6 };
EFF.fire = {};
EFF.bleed = {};
const grenades = [];
function throwGrenade() {
  const D = W(curId()); if (!D || !D.gl || W8.glCd > 0 || P.vault) return;
  W8.glCd = D.glRecharge || 6; SFX.launch();
  const dx = aimPt.x - P.x, dz = aimPt.z - P.z, d = Math.min(14, Math.hypot(dx, dz));
  const a = Math.atan2(dx, dz), x1 = P.x + Math.sin(a) * d, z1 = P.z + Math.cos(a) * d;
  const m = box(scene, 0.12, 0.12, 0.18, GM.olive, P.x, GUN_Y, P.z);
  const g = { m, x0: P.x + Math.sin(a) * 0.8, z0: P.z + Math.cos(a) * 0.8, x1, z1, t: 0, dur: 0.25 + d * 0.045, h: 0.6 + d * 0.12 };
  grenades.push(g);
  if (netLink()) netSend('nade', { g: [g.x0, g.z0, g.x1, g.z1, g.dur, g.h].map(nr) });   // (teammates see it fly; its blast comes as a 'boom')
}
// underbarrel grenades in flight
function updateGrenades(dt) {
  for (let k = grenades.length - 1; k >= 0; k--) {
    const g = grenades[k]; g.t += dt / g.dur; const t = Math.min(1, g.t);
    let x = g.x0 + (g.x1 - g.x0) * t, z = g.z0 + (g.z1 - g.z0) * t;
    { const fx = g.px ?? g.x0, fz = g.pz ?? g.z0, th = thinHit(fx, fz, x, z); if (th <= 1) { x = fx + (x - fx) * th * 0.9; z = fz + (z - fz) * th * 0.9; g.t = 1; } g.px = x; g.pz = z; }   // into an inside wall: it goes off there
    g.m.position.set(x, GUN_Y + Math.sin(t * Math.PI) * g.h - t * (GUN_Y - 0.1), z); g.m.rotation.x += dt * 12;
    if (t >= 1 || g.t >= 1 || bulletBlocked(x, z)) { scene.remove(g.m); grenades.splice(k, 1); if (!g.net) explode(x, z, 3, 150, true); }
  }
}
