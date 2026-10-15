// Blocking rules for zombies, the player and bullets, and circle-vs-grid movement.

const blockArr = new Uint8Array(N * N);
// what stops bullets and sight: walls and tall props, not the crates and hay bales you can see over
for (let k = 0; k < N * N; k++) blockArr[k] = cell[k] === WALL || (cell[k] === OBST && !lowObst.has(k)) ? 1 : 0;
// a window's never walked through: you and the zombies climb it (player/vaulting.js, zombies/climb.js)
const hardBlocked = (i, j) => { if (!inb(i, j)) return true; const t = cell[idx(i, j)]; return t === WALL || t === OBST || t === FENCE || (t === OPEN && (openAt[idx(i, j)].boards.length > 0 || openAt[idx(i, j)].kind === 'window')); };
const playerBlocked = hardBlocked;
// out past the edge of the farm is open ground: shots (and anything thrown) carry on out to the zombies coming in
const bulletBlocked = (x, z) => { const i = ci(x), j = ci(z); if (!inb(i, j)) return false; return blockArr[idx(i, j)] === 1; };
// zombies caught on a corner by one shoulder (the other side is clear) slip sideways toward the clear side as they push,
// so they line up with a doorway or a gap instead of grinding on its frame
function moveCircle(e, dx, dz, r, isPlayer) {
  const B = isPlayer ? (x, z) => playerBlocked(ci(x), ci(z)) : (x, z) => hardBlocked(ci(x), ci(z));
  if (dx) {
    const nx = e.x + dx, sx = nx + Math.sign(dx) * r, a = B(sx, e.z - r * .75), b = B(sx, e.z + r * .75);
    if (!a && !b) e.x = nx;
    else if (!isPlayer && a !== b) { const s = (a ? 1 : -1) * Math.abs(dx), nz = e.z + s; if (!B(e.x - r * .75, nz + Math.sign(s) * r) && !B(e.x + r * .75, nz + Math.sign(s) * r)) e.z = nz; }
  }
  if (dz) {
    const nz = e.z + dz, sz = nz + Math.sign(dz) * r, a = B(e.x - r * .75, sz), b = B(e.x + r * .75, sz);
    if (!a && !b) e.z = nz;
    else if (!isPlayer && a !== b) { const s = (a ? 1 : -1) * Math.abs(dz), nx = e.x + s; if (!B(nx + Math.sign(s) * r, e.z - r * .75) && !B(nx + Math.sign(s) * r, e.z + r * .75)) e.x = nx; }
  }
}
