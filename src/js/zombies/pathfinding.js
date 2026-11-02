// Flow field toward the player, or every player in co-op (Dijkstra over the grid); fences, boards and a shut door
// between rooms (DOOR.cost, world/interior.js: it's broken down on the way) cost extra.

import { clamp, mix, N, rand } from '../core/math.js';
import { netLink } from '../net/net.js';
import { cell, ci, FENCE, idx, inb, OBST, OPEN, openAt, WALL } from '../world/grid.js';
import { doorBetween, wallBetween, wX, wZ } from '../world/thin-walls.js';
import { HOUSE_FP, openings } from '../world/house.js';
import { DOOR } from '../world/interior.js';
import { hardBlocked } from '../world/collision.js';
import { zombies } from './zombie-types.js';
import { barN } from '../barricades/planks.js';
import { INSIDE, insideK } from './ai.js';
import { netTargets } from '../net/sync.js';

// brutes get their own: too big to climb, they go round by the gaps in the fence and in through the door. A boarded
// window's on their way too (they smash the boards off it, zombies/ai.js), but once it's bare it's shut to them again
export const dist = new Float32Array(N * N), distB = new Float32Array(N * N);
// the searches' heap, in typed arrays so a search makes no garbage (cells, and their distances as queued); popD: the
// distance of the cell last taken off it
const HQ = new Int32Array(N * N * 8), HD = new Float32Array(N * N * 8);
let hn = 0, popD = 0;
function hpush(c, d) { let k = hn++; while (k) { const p = (k - 1) >> 1; if (HD[p] <= d) break; HQ[k] = HQ[p]; HD[k] = HD[p]; k = p; } HQ[k] = c; HD[k] = d; }
function hpop() {
  const c = HQ[0]; popD = HD[0]; hn--;
  if (hn) { const lc = HQ[hn], ld = HD[hn]; let k = 0; for (;;) { const a = 2 * k + 1; if (a >= hn) break; const m = a + 1 < hn && HD[a + 1] < HD[a] ? a + 1 : a; if (HD[m] >= ld) break; HQ[k] = HQ[m]; HD[k] = HD[m]; k = m; } HQ[k] = lc; HD[k] = ld; }
  return c;
}
// what each board in its way costs a brute's route, against 5 for anyone else's: they make short work of boards
const BRUTE_BOARD_COST = 2.5;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function enterCost(i, j, big) { const t = cell[idx(i, j)]; if (t === FENCE) return big ? Infinity : 3.5; if (big && t === OPEN && openAt[idx(i, j)].kind === 'window' && !openAt[idx(i, j)].boards.length) return Infinity; if (t === WALL || t === OBST) return Infinity; if (t === OPEN) { const o = openAt[idx(i, j)], b = barN(o); return b ? 1 + b * (big ? BRUTE_BOARD_COST : 5) : o.kind === 'window' ? 2.2 : 1; } return 1; }
export function diagOk(i, j, di, dj) { return !hardBlocked(i + di, j) && !hardBlocked(i, j + dj); }
// worked out a few times a second (waves/waves.js), but only searched again when something it depends on has changed:
// where the survivors stand (by cell), what it costs to go into each cell (fences, boards going up and coming off),
// or the walls and doors inside (a door beaten through); force when the farm's changed some other way (a fence put up,
// the house laid out). Mostly nothing has, and it's the same search over again, a dozen thousand steps each time
const FLOW = { tk: '', ec: new Float32Array(N * N * 2), wall: -1 };
const wallSig = () => { let h = 0; for (let k = 0; k < wX.length; k++) h = (h * 31 + wX[k]) | 0; for (let k = 0; k < wZ.length; k++) h = (h * 31 + wZ[k]) | 0; return h; };
export function computeFlow(force = true) {
  let tk = ''; for (const q of netTargets()) if (!(q.dead && !(q.me && !netLink()))) tk += idx(clamp(ci(q.x), 0, N - 1), clamp(ci(q.z), 0, N - 1)) + ',';
  let same = !force && tk === FLOW.tk;
  const ec = FLOW.ec, NN = N * N;
  for (let c = 0; c < NN; c++) { const i = c % N, j = (c / N) | 0, a = enterCost(i, j, false), b = enterCost(i, j, true); if (ec[c] !== a || ec[NN + c] !== b) { ec[c] = a; ec[NN + c] = b; same = false; } }
  const w = wallSig(); if (w !== FLOW.wall) { FLOW.wall = w; same = false; }
  FLOW.tk = tk; if (same) return;
  flowInto(dist, false); flowInto(distB, true);
}
function flowInto(dist, big) {
  dist.fill(1e9); hn = 0; const ec = FLOW.ec, off = big ? N * N : 0;
  // from every survivor still standing at once (in co-op there can be four), so each zombie heads for whoever's nearest
  for (const q of netTargets()) { if (q.dead && !(q.me && !netLink())) continue; const s = idx(clamp(ci(q.x), 0, N - 1), clamp(ci(q.z), 0, N - 1)); if (dist[s]) { dist[s] = 0; hpush(s, 0); } }
  while (hn) {
    const c = hpop(), d = popD; if (d > dist[c]) continue;
    const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
      const cost = ec[off + idx(ni, nj)]; if (cost === Infinity) continue;
      const diag = di && dj; if ((diag && !diagOk(i, j, di, dj)) || wallBetween(i, j, ni, nj)) continue;
      const dr = doorBetween(i, j, ni, nj); if (dr && diag) continue;
      const nd = d + cost * (diag ? 1.414 : 1) + (dr ? DOOR.cost : 0), n = idx(ni, nj);
      // queue the value as stored: the field is 32-bit, and queuing the unrounded one made the pop below skip any cell
      // whose distance rounded down, so the search never went on from it and most of the farm went unmapped
      if (nd < dist[n]) { dist[n] = nd; hpush(n, dist[n]); }
    }
  }
}

// ---- spreading out over the ways in. While you're inside, a zombie outside the house doesn't take the shortest way
// to you (that's the same window or door for nearly all of them, and they pile up on it): it's given one of the ways
// in (pickEntry) and walks to that, then on to you once it's through. Each window and the door has its own field, the
// walk to it from anywhere outside with the house's other openings shut, worked out the first time it's wanted (the
// fences and furniture don't move; boards are torn at when it gets there)
export const viaF = new Map();
const houseCell = (i, j) => inb(i, j) && HOUSE_FP[idx(i, j)] > 0;   // (this run's footprint: world/house.js)
function viaField(o) {
  let f = viaF.get(o); if (f) return f;
  f = new Float32Array(N * N).fill(1e9); viaF.set(o, f);
  const s = idx(o.i, o.j); f[s] = 0; hn = 0; hpush(s, 0);
  while (hn) {
    const c = hpop(), d = popD; if (d > f[c]) continue;
    const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
      const n = idx(ni, nj); if (cell[n] === OPEN) continue;   // (its own opening's the start; the others are shut)
      const cost = enterCost(ni, nj, false); if (cost === Infinity) continue;
      const diag = di && dj; if ((diag && !diagOk(i, j, di, dj)) || wallBetween(i, j, ni, nj)) continue;
      const nd = d + cost * (diag ? 1.414 : 1); if (nd < f[n]) { f[n] = nd; hpush(n, f[n]); }
    }
  }
  return f;
}
// which way in: the walk to each, plus ENTRY_LOAD cells for every zombie already headed for it, and a little chance,
// so the near ones still get most but every window and the door gets its share. In the later waves that share's evened
// out (up to INSIDE.load cells a zombie: zombies/ai.js), so they come at every window at once and you can't hold one
const ENTRY_LOAD = 7;
function pickEntry(z) {
  const k = idx(clamp(ci(z.x), 0, N - 1), clamp(ci(z.z), 0, N - 1));
  let best = null, bs = 1e9;
  for (const o of openings) {
    const d = viaField(o)[k]; if (d >= 1e8) continue;
    let load = 0; for (const q of zombies) if (q !== z && q.via === o) load++;
    const s = d + load * mix(ENTRY_LOAD, INSIDE.load, insideK()) + rand() * 4; if (s < bs) { bs = s; best = o; }
  }
  return best;
}
// the field a zombie steers by: a brute's own (it can only come in by the door); outside while its target's indoors,
// the one for the way in it was given; otherwise the way to whoever's nearest
export function zField(z, t) {
  if (z.type === 'brute') return distB;
  const i = ci(z.x), j = ci(z.z);
  if (z.out || !houseCell(ci(t.x), ci(t.z)) || houseCell(i, j)) { z.via = null; return dist; }
  if (!z.via) z.via = pickEntry(z);
  return z.via ? viaField(z.via) : dist;
}
