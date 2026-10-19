// Flow field toward the player, or every player in co-op (Dijkstra over the grid); fences, boards and a shut door
// between rooms (DOOR.cost, world/interior.js: it's broken down on the way) cost extra.

// brutes get their own: too big to climb, they go round by the gaps in the fence and in through the door. A boarded
// window's on their way too (they smash the boards off it, zombies/ai.js), but once it's bare it's shut to them again
const dist = new Float32Array(N * N), distB = new Float32Array(N * N);
const hp_ = [], hd_ = [];
function hpush(c, d) { hp_.push(c); hd_.push(d); let k = hp_.length - 1; while (k) { const p = (k - 1) >> 1; if (hd_[p] <= hd_[k]) break; [hp_[p], hp_[k]] = [hp_[k], hp_[p]]; [hd_[p], hd_[k]] = [hd_[k], hd_[p]]; k = p; } }
function hpop() { const c = hp_[0], d = hd_[0], lc = hp_.pop(), ld = hd_.pop(); if (hp_.length) { hp_[0] = lc; hd_[0] = ld; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hp_.length && hd_[a] < hd_[m]) m = a; if (b < hp_.length && hd_[b] < hd_[m]) m = b; if (m === k) break; [hp_[m], hp_[k]] = [hp_[k], hp_[m]]; [hd_[m], hd_[k]] = [hd_[k], hd_[m]]; k = m; } } return [c, d]; }
// what each board in its way costs a brute's route, against 5 for anyone else's: they make short work of boards
const BRUTE_BOARD_COST = 2.5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function enterCost(i, j, big) { const t = cell[idx(i, j)]; if (t === FENCE) return big ? Infinity : 3.5; if (big && t === OPEN && openAt[idx(i, j)].kind === 'window' && !openAt[idx(i, j)].boards.length) return Infinity; if (t === WALL || t === OBST) return Infinity; if (t === OPEN) { const o = openAt[idx(i, j)], b = o.boards.length; return b ? 1 + b * (big ? BRUTE_BOARD_COST : 5) : o.kind === 'window' ? 2.2 : 1; } return 1; }
function diagOk(i, j, di, dj) { return !hardBlocked(i + di, j) && !hardBlocked(i, j + dj); }
function computeFlow() { flowInto(dist, false); flowInto(distB, true); }
function flowInto(dist, big) {
  dist.fill(1e9); hp_.length = 0; hd_.length = 0;
  // from every survivor still standing at once (in co-op there can be four), so each zombie heads for whoever's nearest
  for (const q of netTargets()) { if (q.dead && !(q.me && !netLink())) continue; const s = idx(clamp(ci(q.x), 0, N - 1), clamp(ci(q.z), 0, N - 1)); if (dist[s]) { dist[s] = 0; hpush(s, 0); } }
  while (hp_.length) {
    const [c, d] = hpop(); if (d > dist[c]) continue;
    const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
      const cost = enterCost(ni, nj, big); if (cost === Infinity) continue;
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
const viaF = new Map();
const houseCell = (i, j) => i >= HX0 && i <= HX1 && j >= HZ0 && j <= HZ1;
function viaField(o) {
  let f = viaF.get(o); if (f) return f;
  f = new Float32Array(N * N).fill(1e9); viaF.set(o, f);
  const s = idx(o.i, o.j); f[s] = 0; hp_.length = 0; hd_.length = 0; hpush(s, 0);
  while (hp_.length) {
    const [c, d] = hpop(); if (d > f[c]) continue;
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
// so the near ones still get most but every window and the door gets its share
const ENTRY_LOAD = 7;
function pickEntry(z) {
  const k = idx(clamp(ci(z.x), 0, N - 1), clamp(ci(z.z), 0, N - 1));
  let best = null, bs = 1e9;
  for (const o of openings) {
    const d = viaField(o)[k]; if (d >= 1e8) continue;
    let load = 0; for (const q of zombies) if (q !== z && q.via === o) load++;
    const s = d + load * ENTRY_LOAD + rand() * 4; if (s < bs) { bs = s; best = o; }
  }
  return best;
}
// the field a zombie steers by: a brute's own (it can only come in by the door); outside while its target's indoors,
// the one for the way in it was given; otherwise the way to whoever's nearest
function zField(z, t) {
  if (z.type === 'brute') return distB;
  const i = ci(z.x), j = ci(z.z);
  if (z.out || !houseCell(ci(t.x), ci(t.z)) || houseCell(i, j)) { z.via = null; return dist; }
  if (!z.via) z.via = pickEntry(z);
  return z.via ? viaField(z.via) : dist;
}
