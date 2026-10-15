// Melee swings, stamina cost and slowdown while swinging.

// you slow down while a swing comes through; heavier weapons more, and more again when you're winded
const swingSlow = () => { if (!(W8.swing > 0)) return 1; const D = W(curId()) || {}, p = 1 - W8.swing / W8.swingDur, k = Math.sin(Math.min(1, p * 1.15) * Math.PI); return 1 - Math.min(0.85, k * (D.style === 'chop' && D.two ? 0.6 : D.two ? 0.45 : 0.35) * (P.exh ? 1.55 : 1)); };
// heavier weapons cost more stamina per swing, and one that only hits a single zombie costs SINGLE_STAM of that: it
// has to land more swings to clear a crowd (one made long enough to sweep through more, melee/melee-stats.js, pays in full)
const SINGLE_STAM = 0.7;
const stamCost = D => stamUse((D.style === 'chop' && D.two ? 0.25 : D.two ? 0.17 : 0.12) * ((D.cleave || 1) < 2 ? SINGLE_STAM : 1) * S.swingStam);   // (Strong arms takes some off: S.swingStam)
// a swing that meets nothing costs only part of that (charged as it starts); the rest is paid when it lands on something
const SWING_AIR = 0.55;
// Iron lungs: a bigger tank, so everything costs less of it
function stamUse(c) { return c / (S.lungs ? LUNGS.tank : 1); }
// Iron lungs: how much bigger the tank, the breather before it comes back (seconds) and how much faster it refills
const LUNGS = { tank: 1.25, wait: 0.4, refill: 1.25 };
// who a swing would land on right now: every zombie in reach and in front of you (or through the gaps in a boarded
// opening you're standing at), nearest first. The big two-handers cleave through up to D.cleave of them; everything
// else connects with the nearest one only. The swing and the green reach rim (zombies/zombie-visuals.js) both use it.
const _mtPool = [], _mt = [];
function meleeTargets(D) {
  let bo = null, bd = 1.7; for (const o of openings) { const d = Math.hypot(o.x - P.x, o.z - P.z); if (o.boards.length && d < bd) { bd = d; bo = o; } }
  _mt.length = 0;
  for (const z of zombies) {
    if (z.dead) continue;
    const [bx, bz] = bodyOf(z), dx = bx - P.x, dz = bz - P.z, d = Math.hypot(dx, dz) - (z.crawl ? 0.2 : 0);
    let thru = z.atkBoard && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.6 ? 0.9 : 0;   // swinging through the gaps in your own boards
    if (!thru && bo && Math.hypot(z.x - bo.x, z.z - bo.z) < 2.2 && ((z.x - bo.x) * bo.nx + (z.z - bo.z) * bo.nz) * ((P.x - bo.x) * bo.nx + (P.z - bo.z) * bo.nz) < 0) thru = 0.9;
    if (d > D.range + z.T.r + thru) continue;
    if (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc + (thru ? 0.25 : 0) && d > 0.6) continue;
    const t = _mtPool[_mt.length] || (_mtPool[_mt.length] = {});
    t.z = z; t.d = d; t.dx = dx; t.dz = dz; _mt.push(t);
  }
  _mt.sort((a, b) => a.d - b.d);
  if (_mt.length > (D.cleave || 1)) _mt.length = D.cleave || 1;
  return _mt;
}
function meleeHit() {
  const id = curId(), D = W(id); if (!D || !D.melee) return;
  {
    const blade = !D.blunt;
    if (blade) SFX.swingBlade(D.style === 'chop'); else SFX.swingBlunt(D.two);
    let hit = false;
    for (const { z, d, dx, dz } of meleeTargets(D).slice()) {
      const r = rand(), part = r < (D.style === 'chop' ? 0.38 : 0.22) + S.headBonus ? 'head' : r < 0.55 ? (rand() < 0.5 ? 'armL' : 'armR') : r < 0.7 ? (rand() < 0.5 ? 'legL' : 'legR') : 'torso';
      // winded, a swing is slower and shoves them back less, but it hits just as hard
      hurtZombie(z, D.dmg * S.meleeMul, dx / (d || 1), dz / (d || 1), D.kb * (W8.tired ? 0.55 : 1), id, part); hit = true;
    }
    if (hit) { P.stam = Math.max(0, P.stam - stamCost(D) * (1 - SWING_AIR)); P.stamT = 0; if (P.stam <= 0.001) P.exh = true; }   // the rest of the swing's cost, for connecting
    // impact: a short jolt of shake, the view nudged along the swing and tipped a touch toward its side
    if (hit) { shake = Math.max(shake, 0.26 + (D.kb > 5 ? 0.08 : 0) + (D.style === 'chop' ? 0.1 : 0)); camKick.x += Math.sin(P.aim) * 0.12; camKick.z += Math.cos(P.aim) * 0.12; camRoll = clamp(camRoll + W8.swingSide * 0.025, -0.1, 0.1); if (blade) SFX.hitBlade(D.style === 'chop'); else SFX.hitBlunt(D.kb > 6); }
    // a swing through open air: the weight carries on past where it would have landed, so the view follows it through a
    // little and leans with it, softer than a hit and with no shake (heavier weapons pull it further)
    else { const w = D.style === 'chop' ? 1.4 : D.two ? 1.2 : 1; camKick.x += Math.sin(P.aim) * 0.07 * w; camKick.z += Math.cos(P.aim) * 0.07 * w; camRoll = clamp(camRoll + W8.swingSide * 0.018 * w, -0.1, 0.1); }
  }
}
