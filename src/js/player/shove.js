// Shoving zombies away with Space when there is nothing to climb.

const SHOVE_CD = 0.85, SHOVE_COST = 0.14, SHOVE_RANGE = 1.55, SHOVE_ARC = 1.15;
// Space climbs a window or fence when you are at one, and shoves otherwise
function spaceAction() { if (vaultTarget(nearestOpening()) || fenceTarget()) tryVault(); else shove(); }
function shove() {
  if (P.dead || P.vault || openSt || P.bandT > 0 || W8.swing > 0 || (P.shoveCd || 0) > 0) return;
  const tired = P.exh || P.stam < SHOVE_COST * 0.5, power = tired ? 0.5 : 1;
  P.stam = Math.max(0, P.stam - SHOVE_COST); P.stamT = 0; if (P.stam <= 0.001) P.exh = true;
  P.shoveCd = SHOVE_CD * (tired ? 1.5 : 1); ANIM.shove = 1;
  exitScope(); W8.reloading = null; W8.reloadT = 0; W8.burstLeft = 0; W8.cd = Math.max(W8.cd, 0.3);
  SFX.shove(); if (tired) SFX.pant();
  let hit = 0;
  for (const z of zombies) {
    const [bx, bz] = bodyOf(z), dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz);
    if (d > SHOVE_RANGE + z.T.r || (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > SHOVE_ARC && d > 0.55) || z.vault) continue;
    const nx = dx / (d || 1), nz = dz / (d || 1);
    // brutes barely budge; everyone else stumbles back and loses their swing
    const brute = z.type === 'brute', f = power * (brute ? 0.25 : 1) * (z.crawl ? 0.6 : 1);
    z.vx += nx * 8 * f; z.vz += nz * 8 * f;
    if (!brute) { z.stagger = Math.max(z.stagger, 0.75 * power); z.atk = Math.max(z.atk, 0.7 * power); z.lunge = 0; }
    z.squash = 1; z.flash = Math.max(z.flash, 0.06);
    burst(bx, 0.9 * z.T.scale, bz, 3, 'dust', nx, nz, 1.2);
    hit++;
  }
  if (hit) { SFX.hitBlunt(false); shake = Math.max(shake, 0.12); hitStop = Math.max(hitStop, 0.03); camKick.x += Math.sin(P.aim) * 0.08; camKick.z += Math.cos(P.aim) * 0.08; }
}
