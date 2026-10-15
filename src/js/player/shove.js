// Shoving zombies away with F, and the bayonet stab that rides on it.

// the shove has a shape: a quick wind-up, a hard strike with a half step forward, then the recovery
const SHOVE_CD = 0.85, SHOVE_COST = 0.14, SHOVE_RANGE = 1.6, SHOVE_ARC = 1.15, SHOVE_DUR = 0.46, SHOVE_HIT = 0.09, SHOVE_SLOW = 2.6;
// while you wrap a bandage you can still bash one-handed, but slower: a longer wind-up and a longer wait before the next
const SHOVE_BAND = 1.65;
EFF.bayonet = { melee: true, dmg: 45, sever: 0.3, kb: 2 };
// the touch button climbs a window or fence when you are at one, and shoves otherwise
function spaceAction() { if (vaultTarget(nearestOpening()) || fenceTarget()) tryVault(); else shove(); }
const hasBayonet = () => gunAtt(curId(), 'bayonet');   // only on the long gun it was fitted to
function shove() {
  if (P.dead || P.vault || openSt || W8.swing > 0 || (P.shoveCd || 0) > 0) return;
  const cost = stamUse(SHOVE_COST), tired = P.exh || P.stam < cost * 0.5;
  P.stam = Math.max(0, P.stam - cost); P.stamT = 0; if (P.stam <= 0.001) P.exh = true;
  const band = P.bandT > 0, slow = band ? SHOVE_BAND : 1;
  P.shoveCd = SHOVE_CD * (tired ? 1.5 : 1) * slow;
  P.shove = { t: 0, hit: false, power: tired ? 0.5 : 1, stab: hasBayonet(), dur: SHOVE_DUR * slow, hitT: SHOVE_HIT * slow, band };
  exitScope(); cutReload(); W8.burstLeft = 0; W8.cd = Math.max(W8.cd, 0.35);
  if (tired) SFX.pant();
}
// runs every frame from updatePlayer: the lunge, and the hit landing at the end of the wind-up
function tickShove(dt) {
  const s = P.shove; if (!s) return;
  s.t += dt;
  const p = s.t / s.dur;
  // half a step into it during the strike
  if (p > 0.18 && p < 0.42 && !P.vault) moveCircle(P, Math.sin(P.aim) * 2.2 * dt * s.power, Math.cos(P.aim) * 2.2 * dt * s.power, 0.3, true);
  if (!s.hit && s.t >= s.hitT) { s.hit = true; landShove(s); }
  if (p >= 1) { P.shove = null; if (aimHeld) startAim(); }   // still holding aim: back down the sights
}
// a zombie shoved: thrown back (a brute barely budges), its swing lost, stumbling slowly for a few seconds. A co-op
// teammate's shove lands here too (net/sync.js)
function shoveZombie(z, nx, nz, f, power, big) {
  z.vx += nx * 9 * f; z.vz += nz * 9 * f;
  if (!big) { z.stagger = Math.max(z.stagger, 0.8 * power); z.atk = Math.max(z.atk, 0.8 * power); z.lunge = 0; z.pushSlow = SHOVE_SLOW * power; z.shoved = 1; zAnimShove(z); }
  else { z.pushSlow = Math.max(z.pushSlow || 0, 0.8); z.shoved = 0.35; }
  z.squash = 1; z.flash = Math.max(z.flash, 0.1);
  const [bx, bz] = bodyOf(z), hy = 1.0 * z.T.scale * (z.crawl ? 0.35 : 1);
  burst(bx - nx * 0.25, hy, bz - nz * 0.25, 6, 'dust', nx, nz, 2.4); burst(bx, 0.08, bz, 4, 'dust', nx, nz, 1.4);
}
function landShove(s) {
  SFX.shove(s.stab);
  let hit = 0, brute = false;
  for (const z of zombies.slice()) {
    const [bx, bz] = bodyOf(z), dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz);
    if (d > SHOVE_RANGE + z.T.r || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > SHOVE_ARC && d > 0.55) || z.vault) continue;
    const nx = dx / (d || 1), nz = dz / (d || 1), big = z.type === 'brute';
    // brutes barely budge; everyone else is thrown back, loses their swing and stumbles slowly for a few seconds
    const f = s.power * (big ? 0.25 : 1) * (z.crawl ? 0.6 : 1);
    netAct(z, nx, nz, () => {
      shoveZombie(z, nx, nz, f, s.power, big); netRec('v', nr(f), nr(s.power), big ? 1 : 0);
      if (s.stab && !z.dead) hurtZombie(z, EFF.bayonet.dmg * S.meleeMul * s.power, nx, nz, EFF.bayonet.kb, 'bayonet', 'torso');
    });
    hit++; brute = brute || big;
  }
  if (hit) {
    SFX.hitBlunt(true); if (s.stab) SFX.hitBlade(false);
    shake = Math.max(shake, brute ? 0.2 : 0.3);
    camKick.x += Math.sin(P.aim) * 0.22; camKick.z += Math.cos(P.aim) * 0.22; camRoll = clamp(camRoll + (rand() < 0.5 ? -1 : 1) * 0.04, -0.1, 0.1);
    ANIM.shoveHit = 1;
  } else { camKick.x += Math.sin(P.aim) * 0.08; camKick.z += Math.cos(P.aim) * 0.08; }
}
