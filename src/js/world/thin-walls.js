// Thin walls: the farmhouse's inside walls, standing on the lines between cells rather than filling them (world/
// interior.js lays them out each run). wX holds the ones along x = i - HALF (between cells i - 1 and i, in row j), wZ
// the ones along z = j - HALF (between rows j - 1 and j, in column i). THIN: how many there are (none: nothing need
// look), how thick they stand, and the box they're all inside, so anything well clear of the house skips them.

const wX = new Uint8Array((N + 1) * N), wZ = new Uint8Array(N * (N + 1));
const THIN = { n: 0, t: 0.12, box: [0, 0, 0, 0] };
const wxAt = (i, j) => i >= 0 && i <= N && j >= 0 && j < N && wX[j * (N + 1) + i] === 1;
const wzAt = (i, j) => i >= 0 && i < N && j >= 0 && j <= N && wZ[j * N + i] === 1;
// and what stops sight, a shot or a sound: a wall, or a door between rooms while it's shut (2: world/interior.js). A
// door never stops you or a zombie: it swings open as anyone comes up to it
const wxSee = (i, j) => i >= 0 && i <= N && j >= 0 && j < N && wX[j * (N + 1) + i] > 0;
const wzSee = (i, j) => i >= 0 && i < N && j >= 0 && j <= N && wZ[j * N + i] > 0;
// a thin wall between two cells next to each other; diagonally, if one stands on either way round (nothing squeezes
// past the end of a wall)
function wallBetween(i0, j0, i1, j1) {
  if (!THIN.n) return false;
  const di = i1 - i0, dj = j1 - j0, im = Math.max(i0, i1), jm = Math.max(j0, j1);
  if (!dj) return di ? wxAt(im, j0) : false;
  if (!di) return wzAt(i0, jm);
  return wxAt(im, j0) || wxAt(im, j1) || wzAt(i0, jm) || wzAt(i1, jm);
}
// along the line from (x0, z0) to (x1, z1), cell by cell: how far along it (0 to 1) it first goes through a thin wall
// (or a shut door)
// (2 if it never does), or with count, how many it goes through
function thinWalk(x0, z0, x1, z1, count) {
  if (!THIN.n) return count ? 0 : 2;
  const b = THIN.box; if (Math.max(x0, x1) < b[0] || Math.min(x0, x1) > b[2] || Math.max(z0, z1) < b[1] || Math.min(z0, z1) > b[3]) return count ? 0 : 2;
  const dx = x1 - x0, dz = z1 - z0, si = dx > 0 ? 1 : dx < 0 ? -1 : 0, sj = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  let i = ci(x0), j = ci(z0), n = 0;
  const ti = ci(x1), tj = ci(z1), ddx = si ? 1 / Math.abs(dx) : Infinity, ddz = sj ? 1 / Math.abs(dz) : Infinity;
  let tx = si ? ((si > 0 ? i + 1 : i) - HALF - x0) / dx : Infinity, tz = sj ? ((sj > 0 ? j + 1 : j) - HALF - z0) / dz : Infinity;
  for (let s = 0; s < 4 * N && (i !== ti || j !== tj); s++) {
    if (tx <= tz) { if (tx > 1) break; if (wxSee(si > 0 ? i + 1 : i, j)) { if (!count) return tx; n++; } i += si; tx += ddx; }
    else { if (tz > 1) break; if (wzSee(i, sj > 0 ? j + 1 : j)) { if (!count) return tz; n++; } j += sj; tz += ddz; }
  }
  return count ? n : 2;
}
const thinHit = (x0, z0, x1, z1) => thinWalk(x0, z0, x1, z1, false);
// how far a ray from (ox, oz) going (dx, dz) gets before a thin wall stops it, up to L
const thinRay = (ox, oz, dx, dz, L) => { const t = thinWalk(ox, oz, ox + dx * L, oz + dz * L, false); return t > 1 ? L : t * L; };
// a point within d of a thin wall on its own cell's sides
function thinNear(x, z, d) {
  if (!THIN.n) return false;
  const i = ci(x), j = ci(z), fx = x + HALF - i, fz = z + HALF - j;
  return (fx < d && wxSee(i, j)) || (fx > 1 - d && wxSee(i + 1, j)) || (fz < d && wzSee(i, j)) || (fz > 1 - d && wzSee(i, j + 1));
}
// a circle (e: x and z; r its radius) pushed back out of the thin walls round it, to the side it was on before it
// moved (px, pz): round the ends of a wall, so whatever's walking slides on round a door frame rather than catching.
// Nothing's taken as wider than 0.4 m, so a brute still squeezes through a doorway
function thinPush(e, r, px, pz) {
  if (!THIN.n) return;
  const R = Math.min(r, 0.4) + THIN.t / 2, i0 = ci(e.x - R), i1 = ci(e.x + R), j0 = ci(e.z - R), j1 = ci(e.z + R);
  for (let ie = i0 + 1; ie <= i1; ie++) for (let j = j0; j <= j1; j++) if (wxAt(ie, j)) {
    const lx = ie - HALF, a = j - HALF, cz = clamp(e.z, a, a + 1), s = Math.sign(px - lx) || 1;
    if (cz === e.z && Math.sign(e.x - lx) !== s) { e.x = lx + s * R; continue; }   // went right through: back out
    thinOut(e, lx, cz, R);
  }
  for (let je = j0 + 1; je <= j1; je++) for (let i = i0; i <= i1; i++) if (wzAt(i, je)) {
    const lz = je - HALF, a = i - HALF, cx = clamp(e.x, a, a + 1), s = Math.sign(pz - lz) || 1;
    if (cx === e.x && Math.sign(e.z - lz) !== s) { e.z = lz + s * R; continue; }
    thinOut(e, cx, lz, R);
  }
}
function thinOut(e, qx, qz, R) { const dx = e.x - qx, dz = e.z - qz, d = Math.hypot(dx, dz); if (d < R && d > 1e-6) { e.x = qx + dx / d * R; e.z = qz + dz / d * R; } }
