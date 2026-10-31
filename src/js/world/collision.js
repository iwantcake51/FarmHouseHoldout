// Blocking rules for zombies, the player and bullets, and circle-vs-grid movement.

import { N } from '../core/math.js';
import { cell, ci, cxw, FENCE, idx, inb, OBST, OPEN, openAt, WALL } from './grid.js';
import { thinPush } from './thin-walls.js';
import { lowObst, obstTop } from './props.js';

export const blockArr = new Uint8Array(N * N);
// what stops bullets and sight: walls and tall props, not the crates and hay bales you can see over
// (taken afresh from the grid as each run's farm is laid out, world/interior.js: the title's layout moves the yard's
// props without it, so what was made here, with every prop where it was built, would go on blocking where none stands)
export function syncBlock() { for (let k = 0; k < N * N; k++) blockArr[k] = cell[k] === WALL || (cell[k] === OBST && !lowObst.has(k)) ? 1 : 0; }
syncBlock();
// tall furniture filling only part of its cell (a gun rack against the wall, a cupboard) stops sight, light and rounds
// only where it really stands: its footprint in the cell ([x0, z0, x1, z1], world/furniture.js: applyFurniture); none,
// the whole cell, as a wall's
export const cellBox = new Array(N * N).fill(null);
export const inCellBox = (k, x, z) => { const b = cellBox[k]; return !b || (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]); };
// how far along (ox, oz) + (dx, dz)·t, between t0 and t1, a line first meets cell k's footprint (t0 for a whole cell;
// Infinity if it passes it by)
export function boxHitT(k, ox, oz, dx, dz, t0, t1) {
  const b = cellBox[k]; if (!b) return t0;
  let lo = t0, hi = t1;
  if (Math.abs(dx) < 1e-9) { if (ox < b[0] || ox > b[2]) return Infinity; } else { let u = (b[0] - ox) / dx, v = (b[2] - ox) / dx; if (u > v) { const w = u; u = v; v = w; } lo = Math.max(lo, u); hi = Math.min(hi, v); }
  if (Math.abs(dz) < 1e-9) { if (oz < b[1] || oz > b[3]) return Infinity; } else { let u = (b[1] - oz) / dz, v = (b[3] - oz) / dz; if (u > v) { const w = u; u = v; v = w; } lo = Math.max(lo, u); hi = Math.min(hi, v); }
  return lo <= hi ? lo : Infinity;
}
// a window's never walked through: you and the zombies climb it (player/vaulting.js, zombies/climb.js)
export const hardBlocked = (i, j) => { if (!inb(i, j)) return true; const t = cell[idx(i, j)]; return t === WALL || t === OBST || t === FENCE || (t === OPEN && (openAt[idx(i, j)].boards.length > 0 || openAt[idx(i, j)].kind === 'window')); };
export const playerBlocked = hardBlocked;
// out past the edge of the farm is open ground: shots (and anything thrown) carry on out to the zombies coming in
export const bulletBlocked = (x, z) => { const i = ci(x), j = ci(z); if (!inb(i, j)) return false; const k = idx(i, j); return blockArr[k] === 1 && inCellBox(k, x, z); };
// and from your own eyes, where a round's height counts: it's stopped only if it's lower than what's there (the house's
// walls up to its eaves, a tree up to its crown, a tall prop: BLOCK_TOP), so a round fired up over them flies on (the
// roof over the house: weapons/firing.js)
const BLOCK_TOP = { wall: 2.6, prop: 2.4, trunk: 0.18 };
export const bulletBlockedAt = (x, z, y) => {
  const i = ci(x), j = ci(z); if (!inb(i, j)) return false; const k = idx(i, j); if (blockArr[k] !== 1 || !inCellBox(k, x, z)) return false;
  if (cell[k] === WALL) return y < BLOCK_TOP.wall;
  const o = obstTop.get(k); if (o === undefined) return y < BLOCK_TOP.prop; if (typeof o === 'number') return y < o;
  return y < o.top && Math.hypot(x - o.x, z - o.z) < Math.max(BLOCK_TOP.trunk, o.r * (o.top - y) / o.top);   // (a tree: inside its cone)
};
// zombies caught on a corner by one shoulder (the other side is clear) slip sideways toward the clear side as they push,
// so they line up with a doorway or a gap instead of grinding on its frame
// you against the fence: not its whole cell (you were stopped half a metre short of it, on thin air) but the line it
// really stands on, its posts at the cells' middles and its rails running between them, FENCE_HALF either side; a
// point on the far side of a rail from where you stand has gone through it, so a long step at a low frame rate can't
// carry you across
const FENCE_HALF = 0.07;
function fenceHit(i, j, x, z, ex, ez) {
  const cx = cxw(i), cz = cxw(j), dx = x - cx, dz = z - cz, f = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE;
  if (Math.abs(dx) < FENCE_HALF && Math.abs(dz) < FENCE_HALF) return true;   // the post
  if ((dx >= 0 ? f(i + 1, j) : f(i - 1, j)) && (Math.abs(dz) < FENCE_HALF || dz * (ez - cz) < 0)) return true;   // a rail along x
  if ((dz >= 0 ? f(i, j + 1) : f(i, j - 1)) && (Math.abs(dx) < FENCE_HALF || dx * (ex - cx) < 0)) return true;   // a rail along z
  return false;
}
// a piece of furniture that fills only part of its cell (cellBox: the gun rack against the wall, a cabinet) is bumped
// into only where it stands, the rest of the cell walked through like the floor round it
const furnFree = (x, z) => { const i = ci(x), j = ci(z); if (!inb(i, j)) return false; const k = idx(i, j); return cell[k] === OBST && !!cellBox[k] && !inCellBox(k, x, z); };
export function moveCircle(e, dx, dz, r, isPlayer) {
  const px = e.x, pz = e.z, B = isPlayer ? (x, z) => { const i = ci(x), j = ci(z); return inb(i, j) && cell[idx(i, j)] === FENCE ? fenceHit(i, j, x, z, e.x, e.z) : playerBlocked(i, j) && !furnFree(x, z); } : (x, z) => hardBlocked(ci(x), ci(z)) && !furnFree(x, z);
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
