// Blocking rules for zombies, the player and bullets, and circle-vs-grid movement.

const blockArr = new Uint8Array(N * N);
for (let k = 0; k < N * N; k++) blockArr[k] = cell[k] === WALL || cell[k] === OBST ? 1 : 0;
const hardBlocked = (i, j) => { if (!inb(i, j)) return true; const t = cell[idx(i, j)]; return t === WALL || t === OBST || t === FENCE || (t === OPEN && openAt[idx(i, j)].boards.length > 0); };
const playerBlocked = (i, j) => { if (hardBlocked(i, j)) return true; const o = openAt[idx(i, j)]; return !!(o && o.kind === 'window'); };
const bulletBlocked = (x, z) => { const i = ci(x), j = ci(z); if (!inb(i, j)) return true; return blockArr[idx(i, j)] === 1; };
function moveCircle(e, dx, dz, r, isPlayer) {
  const B = isPlayer ? (x, z) => playerBlocked(ci(x), ci(z)) : (x, z) => hardBlocked(ci(x), ci(z));
  if (dx) { const nx = e.x + dx, sx = nx + Math.sign(dx) * r; if (!B(sx, e.z - r * .75) && !B(sx, e.z + r * .75)) e.x = nx; }
  if (dz) { const nz = e.z + dz, sz = nz + Math.sign(dz) * r; if (!B(e.x - r * .75, sz) && !B(e.x + r * .75, sz)) e.z = nz; }
}
