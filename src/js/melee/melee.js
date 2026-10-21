// Melee swings, stamina cost and slowdown while swinging.

// you slow down while a swing comes through; heavier weapons more, and more again when you're winded
const swingSlow = () => { if (!(W8.swing > 0)) return 1; const D = W(curId()) || {}, p = 1 - W8.swing / W8.swingDur, k = Math.sin(Math.min(1, p * 1.15) * Math.PI); return 1 - Math.min(0.85, k * (D.style === 'chop' && D.two ? 0.6 : D.two ? 0.45 : 0.35) * (P.exh ? 1.55 : 1)); };
// heavier weapons cost more stamina per swing (SWING_STAM: a one-hander, a two-hander like the bat or katana, a heavy
// chopper like the axe or sledge, of a full tank), and one that only hits a single zombie costs SINGLE_STAM of that: it
// has to land more swings to clear a crowd (one made long enough to sweep through more, melee/melee-stats.js, pays in full)
const SWING_STAM = { one: 0.07, two: 0.095, chop: 0.15 }, SINGLE_STAM = 0.7;
const stamCost = D => stamUse((D.style === 'chop' && D.two ? SWING_STAM.chop : D.two ? SWING_STAM.two : SWING_STAM.one) * ((D.cleave || 1) < 2 ? SINGLE_STAM : 1) * S.swingStam);   // (Strong arms takes some off: S.swingStam)
// winded, a swing comes slower (TIRED.swing) and the next one waits longer (TIRED.cd); one that only hits a single
// zombie (weapons/firing.js) is slowed by just TIRED.single of that, as it's lighter in the hand
const TIRED = { cd: 1.6, swing: 1.45, single: 2 / 3 };
// a swing that meets nothing costs only part of that (charged as it starts); the rest is paid when it lands on something
const SWING_AIR = 0.55;
// each zombie past the first that a swing cleaves through costs CLEAVE_STAM more of its landing cost: carrying the blow
// on through a crowd takes more out of you than stopping on one
const CLEAVE_STAM = 0.45;
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
    let thru = z.atkBoard && !z.atkBoard.grate && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.6 ? 0.9 : 0;   // swinging through the gaps in your own boards (never through a grate's bars)
    if (!thru && bo && !bo.grate && Math.hypot(z.x - bo.x, z.z - bo.z) < 2.2 && ((z.x - bo.x) * bo.nx + (z.z - bo.z) * bo.nz) * ((P.x - bo.x) * bo.nx + (P.z - bo.z) * bo.nz) < 0) thru = 0.9;
    // one climbing in through a window: its body's coming through the frame toward you while its feet are still out past
    // the sill, so you can reach it as you could through your boards
    if (!thru && z.vault && z.vault.kind === 'window') thru = 0.9;
    if (d > D.range + z.T.r + thru) continue;
    if (thinHit(P.x, P.z, bx, bz) <= 1) continue;   // not through an inside wall (world/thin-walls.js)
    if (grateBetween(P.x, P.z, bx, bz)) continue;   // never through a grate's bars (barricades/metal-bars.js)
    if (Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc + (thru ? 0.25 : 0) && d > 0.6) continue;
    const t = _mtPool[_mt.length] || (_mtPool[_mt.length] = {});
    t.z = z; t.d = d; t.dx = dx; t.dz = dz; _mt.push(t);
  }
  _mt.sort((a, b) => a.d - b.d);
  if (_mt.length > (D.cleave || 1)) _mt.length = D.cleave || 1;
  return _mt;
}
// the fire axe and the sledgehammer swing heavy (two-handed, style chop): their own swings (MSWINGS.heavy,
// melee/melee-anim.js), heard rushing down from p = whoosh (weapons/combat-update.js) and landing at p = hit, as the head
// arrives. A hit staggers what it doesn't kill for stagger seconds and shakes, punches and kicks the view harder; one
// that meets nothing slams into the ground in front of you
const HEAVY = { whoosh: 0.45, hit: 0.55, stagger: 0.55 };
// a swing on the boards: BOARD_MELEE of its damage off the top one, so a run of swings does take a board down, just
// slower than shooting it (BOARD_SHOT); the opening must be in reach and in front of you
const BOARD_MELEE = 0.15;
function boardInReach(D) {
  let best = null, bd = 1e9;
  for (const o of openings) {
    if (!o.boards.length) continue;
    const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz);
    if (d > D.range + 0.6 || (d > 0.5 && Math.abs(angDiff(Math.atan2(dx, dz), P.aim)) > D.arc + 0.2) || d >= bd) continue;
    best = o; bd = d;
  }
  return best;
}
// whether a grate stands across the way from (x0, z0) to (x1, z1): a swing can't get through its bars
function grateBetween(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.1);
  for (let k = 1; k < n; k++) { const i = ci(x0 + (x1 - x0) * k / n), j = ci(z0 + (z1 - z0) * k / n); if (!inb(i, j)) continue; const o = openAt[idx(i, j)]; if (o && o.grate) return true; }
  return false;
}
function heavySwing(D) { return D.style === 'chop' && !!D.two; }
function meleeHit() {
  const id = curId(), D = W(id); if (!D || !D.melee) return;
  {
    const blade = !D.blunt, heavy = heavySwing(D), fx0 = Math.sin(P.aim), fz0 = Math.cos(P.aim);
    if (!heavy) { if (blade) SFX.swingBlade(D.style === 'chop'); else SFX.swingBlunt(D.two); }
    let hit = false, kills = 0, near = D.range, nHit = 0;
    for (const { z, d, dx, dz } of meleeTargets(D).slice()) {
      const r = rand(), part = r < (D.style === 'chop' ? 0.38 : 0.22) + S.headBonus ? 'head' : r < 0.55 ? (rand() < 0.5 ? 'armL' : 'armR') : r < 0.7 ? (rand() < 0.5 ? 'legL' : 'legR') : 'torso';
      // winded, a swing is slower and shoves them back less, but it hits just as hard
      if (hurtZombie(z, D.dmg * S.meleeMul, dx / (d || 1), dz / (d || 1), D.kb * (W8.tired ? 0.55 : 1), id, part)) kills++;
      else if (heavy && z.type !== 'brute') z.stagger = Math.max(z.stagger, HEAVY.stagger);
      hit = true; near = Math.min(near, d); nHit++;
    }
    // nothing living in the way: a boarded opening in reach takes the blow instead, BOARD_MELEE of it (a swing's slower
    // going than a shot's BOARD_SHOT, barricades/planks.js), the boards jumping and splintering as they do under fire
    const bo = !hit && boardInReach(D);
    if (bo) { shootBoard(bo, D.dmg * S.meleeMul * BOARD_MELEE, fx0, fz0); meleeImpact(heavy, 0.75); shake = Math.max(shake, heavy ? 0.3 : 0.16); SFX.thud(); if (!blade || heavy) SFX.hitBlunt(heavy); }
    if (hit || bo) { P.stam = Math.max(0, P.stam - stamCost(D) * (1 - SWING_AIR) * (1 + CLEAVE_STAM * Math.max(0, nHit - 1))); P.stamT = 0; if (P.stam <= 0.001) P.exh = true; }   // the rest of the swing's cost, for connecting
    if (hit) meleeImpact(heavy, Math.min(1.3, 0.85 + 0.15 * kills));   // it stops on the blow and rebounds off it (melee/melee-anim.js)
    // impact: a short jolt of shake, the view nudged along the swing and tipped a touch toward its side
    if (hit && !heavy) { shake = Math.max(shake, 0.26 + (D.kb > 5 ? 0.08 : 0) + (D.style === 'chop' ? 0.1 : 0)); camKick.x += fx0 * 0.12; camKick.z += fz0 * 0.12; camRoll = clamp(camRoll + W8.swingSide * 0.025, -0.1, 0.1); if (blade) SFX.hitBlade(D.style === 'chop'); else SFX.hitBlunt(D.kb > 6); }
    // a heavy one landing: a hard shake and a jolt of zoom, the view driven on along the blow
    // and tipped further, a deep thump under its own hit, and the hammer knocks up the dirt where it comes down
    else if (hit) {
      const sl = !blade || id === 'sledge';
      shake = Math.max(shake, sl ? 0.62 : 0.54); camPunch = Math.max(camPunch, 0.035 + Math.min(3, kills) * 0.008);
      camKick.x += fx0 * 0.22; camKick.z += fz0 * 0.22; camRoll = clamp(camRoll + W8.swingSide * 0.045, -0.12, 0.12);
      if (blade) SFX.hitBlade(true); else SFX.hitBlunt(true);
      SFX.heavyHit(sl);
      if (sl) { const d = Math.min(D.range * 0.8, near + 0.2); groundDust(P.x + fx0 * d, P.z + fz0 * d, 0.45, fx0, fz0); }
    }
    // a swing through open air (not into the boards): the weight carries on past where it would have landed, so the view follows it through a
    // little and leans with it, softer than a hit and with no shake (heavier weapons pull it further)
    else if (!bo) { const w = D.style === 'chop' ? 1.4 : D.two ? 1.2 : 1; camKick.x += fx0 * 0.07 * w; camKick.z += fz0 * 0.07 * w; camRoll = clamp(camRoll + W8.swingSide * 0.018 * w, -0.1, 0.1);
      // a heavy one that meets nothing carries on down into the ground in front of you: a thud, a kick of dust and a bump
      if (heavy) { const d = D.range * 0.8, gx = P.x + fx0 * d, gz = P.z + fz0 * d; if (!bulletBlocked(gx, gz)) { groundDust(gx, gz, 0.6, fx0, fz0); SFX.thud(); shake = Math.max(shake, 0.2); meleeImpact(true, 0.6); } } }
  }
}
