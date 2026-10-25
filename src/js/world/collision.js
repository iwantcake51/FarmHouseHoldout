// Blocking rules for zombies, the player and bullets, and circle-vs-grid movement.

import { N } from '../core/math.js';
import { cell, ci, FENCE, idx, inb, OBST, OPEN, openAt, WALL } from './grid.js';
import { thinPush } from './thin-walls.js';
import { lowObst, obstTop } from './props.js';

export const blockArr = new Uint8Array(N * N);
// what stops bullets and sight: walls and tall props, not the crates and hay bales you can see over
// (taken afresh from the grid as each run's farm is laid out, world/interior.js: the title's layout moves the yard's
// props without it, so what was made here, with every prop where it was built, would go on blocking where none stands)
export function syncBlock() { for (let k = 0; k < N * N; k++) blockArr[k] = cell[k] === WALL || (cell[k] === OBST && !lowObst.has(k)) ? 1 : 0; }
syncBlock();
// a window's never walked through: you and the zombies climb it (player/vaulting.js, zombies/climb.js)
export const hardBlocked = (i, j) => { if (!inb(i, j)) return true; const t = cell[idx(i, j)]; return t === WALL || t === OBST || t === FENCE || (t === OPEN && (openAt[idx(i, j)].boards.length > 0 || openAt[idx(i, j)].kind === 'window')); };
export const playerBlocked = hardBlocked;
// out past the edge of the farm is open ground: shots (and anything thrown) carry on out to the zombies coming in
export const bulletBlocked = (x, z) => { const i = ci(x), j = ci(z); if (!inb(i, j)) return false; return blockArr[idx(i, j)] === 1; };
// and from your own eyes, where a round's height counts: it's stopped only if it's lower than what's there (the house's
// walls up to its eaves, a tree up to its crown, a tall prop: BLOCK_TOP), so a round fired up over them flies on (the
// roof over the house: weapons/firing.js)
const BLOCK_TOP = { wall: 2.6, prop: 2.4, trunk: 0.18 };
export const bulletBlockedAt = (x, z, y) => {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return false; const k = idx(i, j); if (blockArr[k] !== 1) return false;
  if (cell[k] === WALL) return y < BLOCK_TOP.wall;
  const o = obstTop.get(k); if (o === undefined) return y < BLOCK_TOP.prop; if (typeof o === 'number') return y < o;
  return y < o.top && Math.hypot(x - o.x, z - o.z) < Math.max(BLOCK_TOP.trunk, o.r * (o.top - y) / o.top);   // (a tree: inside its cone)
};
// zombies caught on a corner by one shoulder (the other side is clear) slip sideways toward the clear side as they push,
// so they line up with a doorway or a gap instead of grinding on its frame
export function moveCircle(e, dx, dz, r, isPlayer) {
  const px = e.x, pz = e.z, B = isPlayer ? (x, z) => playerBlocked(ci(x), ci(z)) : (x, z) => hardBlocked(ci(x), ci(z));
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
  thinPush(e, r, px, pz, !isPlayer);   // and off the house's inside walls, and a zombie off a shut door (world/thin-walls.js)
}
