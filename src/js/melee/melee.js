// Melee swings, stamina cost and slowdown while swinging.

// you slow down while a swing comes through; heavier weapons more, and more again when you're winded
const swingSlow = () => { if (!(W8.swing > 0)) return 1; const D = W(curId()) || {}, p = 1 - W8.swing / W8.swingDur, k = Math.sin(Math.min(1, p * 1.15) * Math.PI); return 1 - Math.min(0.85, k * (D.style === 'chop' && D.two ? 0.6 : D.two ? 0.45 : 0.35) * (P.exh ? 1.55 : 1)); };
// heavier weapons cost more stamina per swing
const stamCost = D => stamUse(D.style === 'chop' && D.two ? 0.25 : D.two ? 0.17 : 0.12);
// a swing that meets nothing costs only part of that (charged as it starts); the rest is paid when it lands on something
const SWING_AIR = 0.55;
// Iron lungs: a bigger tank, so everything costs less of it
function stamUse(c) { return c / (S.lungs ? 1.4 : 1); }
function meleeHit() {
  const id = curId(), D = W(id); if (!D || !D.melee) return;
  {
    const blade = !D.blunt;
    let bo = null, bd = 1.7; for (const o of openings) { const d = Math.hypot(o.x - P.x, o.z - P.z); if (o.boards.length && d < bd) { bd = d; bo = o; } }
    if (blade) SFX.swingBlade(D.style === 'chop'); else SFX.swingBlunt(D.two);
    let hit = false;
    for (const z of zombies.slice()) {
      const [bx, bz] = bodyOf(z), dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz) - (z.crawl ? 0.2 : 0);
      let thru = z.atkBoard && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.6 ? 0.9 : 0;   // swinging through the gaps in your own boards
      if (!thru && bo && Math.hypot(z.x - bo.x, z.z - bo.z) < 2.2 && ((z.x - bo.x) * bo.nx + (z.z - bo.z) * bo.nz) * ((P.x - bo.x) * bo.nx + (P.z - bo.z) * bo.nz) < 0) thru = 0.9;
      if (d > D.range + z.T.r + thru) continue;
      if (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc + (thru ? 0.25 : 0) && d > 0.6) continue;
      const r = rand(), part = r < 0.22 + S.headBonus ? 'head' : r < 0.55 ? (rand() < 0.5 ? 'armL' : 'armR') : r < 0.7 ? (rand() < 0.5 ? 'legL' : 'legR') : 'torso';
      const weak = W8.tired ? 0.55 : 1;
      hurtZombie(z, D.dmg * S.meleeMul * weak, dx / (d || 1), dz / (d || 1), D.kb * weak, id, part); hit = true;
    }
    if (hit) { P.stam = Math.max(0, P.stam - stamCost(D) * (1 - SWING_AIR)); P.stamT = 0; if (P.stam <= 0.001) P.exh = true; }   // the rest of the swing's cost, for connecting
    // impact: a short jolt of shake, the view nudged along the swing and tipped a touch toward its side
    if (hit) { shake = Math.max(shake, 0.26 + (D.kb > 5 ? 0.08 : 0) + (D.style === 'chop' ? 0.1 : 0)); camKick.x += Math.sin(P.aim) * 0.12; camKick.z += Math.cos(P.aim) * 0.12; camRoll = clamp(camRoll + W8.swingSide * 0.025, -0.1, 0.1); if (blade) SFX.hitBlade(D.style === 'chop'); else SFX.hitBlunt(D.kb > 6); }
  }
}
