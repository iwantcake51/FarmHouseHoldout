// PZ-style fence climbing for zombies.

// PZ style fence climb: lean on the rail, topple over head first, hit the dirt on the far side, get back up
function stepZVault(z, dt) {
  const v = z.vault, m = z.m, s = z.T.scale; v.t += dt / v.dur; const t = Math.min(1, v.t);
  const dx = v.x1 - v.x0, dz = v.z1 - v.z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const lean = [v.fx - ux * 0.38, v.fz - uz * 0.38], over = [v.fx + ux * 0.5, v.fz + uz * 0.5];
  let px, pz, y = 0, rx = 0, arm = -0.3;
  const base = z.crawl ? 1.18 : 0;
  if (t < 0.3) { const k = smooth(t / 0.3); px = v.x0 + (lean[0] - v.x0) * k; pz = v.z0 + (lean[1] - v.z0) * k; rx = base + (0.55 - base * 0.3) * k; y = 0.12 * k; arm = -0.3 - 1.4 * k; }
  else if (t < 0.55) { const k = (t - 0.3) / 0.25; px = lean[0] + (over[0] - lean[0]) * k; pz = lean[1] + (over[1] - lean[1]) * k; rx = 0.55 + 1.05 * k * k; y = 0.12 + Math.sin(k * Math.PI) * 0.45 - 0.0 * k; arm = -1.7 + 0.4 * k; }
  else if (t < 0.72) { const k = (t - 0.55) / 0.17; px = over[0]; pz = over[1]; rx = 1.6 - 0.1 * Math.sin(k * Math.PI); y = 0.18 * s; arm = -1.4 - 0.3 * Math.sin(k * Math.PI);
    if (!v.landed) { v.landed = true; burst(px + ux * 0.6, 0.1, pz + uz * 0.6, 6, 'dust', ux, uz, 1.2); if (Math.hypot(px - P.x, pz - P.z) < 14) SFX.thud(); } }
  else { const k = smooth((t - 0.72) / 0.28); px = over[0] + (v.x1 - over[0]) * k; pz = over[1] + (v.z1 - over[1]) * k; rx = z.crawl ? 1.18 + 0.4 * (1 - k) : 1.5 * (1 - k); y = z.crawl ? 0.2 * s : 0.18 * s * (1 - k); arm = -1.4 * (1 - k) - 0.2; }
  z.x = px; z.z = pz; if (z.blob) z.blob.position.set(px, 0.02, pz);
  m.g.position.set(px, y, pz); m.g.rotation.set(rx, z.face, 0); m.g.scale.setScalar(s);
  m.armL.rotation.x = arm; m.armR.rotation.x = arm + 0.15; m.legL.rotation.x = t < 0.55 ? -0.6 * Math.sin(t / 0.55 * Math.PI) : 0.2; m.legR.rotation.x = t < 0.55 ? 0.3 * Math.sin(t / 0.55 * Math.PI) : -0.1;
  m.upper.rotation.set(0, 0, 0); m.head.rotation.x = t > 0.55 && t < 0.75 ? -0.4 : 0;
  z.flash = Math.max(0, z.flash - dt); const e = z.flash > 0 ? 0xa04030 : 0; m.mats.skin.emissive.setHex(e); m.mats.shirt.emissive.setHex(e); m.mats.pants.emissive.setHex(e);
  if (t >= 1) { z.vault = null; z.x = v.x1; z.z = v.z1; m.g.rotation.x = z.crawl ? 1.18 : 0; }
}
