// The title's farm, lived in: a few of them shambling about the yard behind the menu, and the windows boarded up, one
// to three planks each. They never go for the house or anyone: each picks a spot out in the yard, ambles over, stands
// about a while and picks another, and nothing it walks toward or along the way is ever inside the house. A run
// starting clears them all, and the boards with them (resetRun, ui/screens.js); back on the title they're dealt again.

// how many, how fast they amble (m/s), how long they stand about at a spot (s), how far round the house they wander
// (m past its walls) and how far from it they keep (m)
const TCROWD = { n: 6, speed: [0.42, 0.7], idle: [1.5, 5.5], roam: 7, keep: 1.4, turn: 2.2 };
const TC = { on: false };
// a spot out in the yard, with a clear walk to it from (x, z): never in or by the house, never on something solid
function tcSpot(x, z) {
  for (let k = 0; k < 24; k++) {
    const tx = rr(HOUSE.x0 - TCROWD.roam, HOUSE.x1 + TCROWD.roam), tz = rr(HOUSE.z0 - TCROWD.roam, HOUSE.z1 + TCROWD.roam);
    if (Math.abs(tx) > HALF - 1.5 || Math.abs(tz) > HALF - 1.5 || inHouseRect(tx, tz, TCROWD.keep) || hardBlocked(ci(tx), ci(tz))) continue;
    if (x === undefined) return [tx, tz];
    const d = Math.hypot(tx - x, tz - z), n = Math.ceil(d / 0.4); let ok = d > 2;
    for (let s = 1; ok && s <= n; s++) { const px = x + (tx - x) * s / n, pz = z + (tz - z) * s / n; if (inHouseRect(px, pz, TCROWD.keep * 0.7) || hardBlocked(ci(px), ci(pz))) ok = false; }
    if (ok) return [tx, tz];
  }
  return null;
}
// dealt as the title comes up: the windows boarded, and the crowd set down about the yard
function titleCrowdDeal() {
  TC.on = true;
  openings.forEach(o => { if (o.kind !== 'window' || o.boards.length) return; const n = 1 + ((rand() * 3) | 0); for (let k = 0; k < n; k++) addBoard(o, BOARD_HP, 1, true); });
  for (let k = 0; k < TCROWD.n; k++) {
    const at = tcSpot(); if (!at) continue;
    spawnZombie(k === 0 && rand() < 0.5 ? 'brute' : 'walker');
    const z = zombies[zombies.length - 1];
    Object.assign(z, { title: true, x: at[0], z: at[1], out: false, face: rand() * 6.283, tgt: null, idle: rr(0, 3), spd: rr(...TCROWD.speed), stuck: 0 });
    z.speed = z.spd;
  }
}
// each frame on the title: dealt once, then each one ambles to its spot, turning toward it as it goes, stands there a
// while, and moves on
function titleCrowd(dt) {
  if (state !== 'title' && state !== 'leaving') { TC.on = false; return; }
  if (!TC.on) { try { titleCrowdDeal(); } catch (e) { TC.on = true; console.warn('title crowd', e); } }
  if (!(dt > 0)) return;
  for (const z of zombies) {
    if (!z.title || z.dead) continue;
    if (z.idle > 0) { z.idle -= dt; if (z.idle <= 0) z.tgt = tcSpot(z.x, z.z); }
    else if (!z.tgt) { z.tgt = tcSpot(z.x, z.z); if (!z.tgt) z.idle = 1; }
    else {
      const dx = z.tgt[0] - z.x, dz = z.tgt[1] - z.z, d = Math.hypot(dx, dz);
      if (d < 0.45) { z.tgt = null; z.idle = rr(...TCROWD.idle); }
      else {
        z.face += clamp(angDiff(Math.atan2(dx, dz), z.face), -TCROWD.turn * dt, TCROWD.turn * dt);
        const turnSlow = 1 - Math.min(0.7, Math.abs(angDiff(Math.atan2(dx, dz), z.face)) / 1.6), st = z.spd * turnSlow * dt;   // (slower while it's still turning round to it)
        const px = z.x, pz = z.z;
        moveCircle(z, Math.sin(z.face) * st, Math.cos(z.face) * st, z.T.r);
        if (inHouseRect(z.x, z.z, 0.5)) { z.x = px; z.z = pz; z.tgt = null; z.idle = 0.5; }   // (never in at a window or the door)
        z.stuck = Math.hypot(z.x - px, z.z - pz) < st * 0.2 ? z.stuck + dt : 0;
        if (z.stuck > 1) { z.stuck = 0; z.tgt = null; z.idle = rr(0.5, 1.5); }
      }
    }
    if (z.blob) z.blob.position.set(z.x, 0.02, z.z);
    animateZombie(z, dt, 99, 0);
  }
}
