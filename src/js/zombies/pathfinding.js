// Flow field toward the player (Dijkstra over the grid); fences and boards cost extra.

// brutes get their own: too big to climb, they go round by the gaps in the fence and in through the door
const dist = new Float32Array(N * N), distB = new Float32Array(N * N);
const hp_ = [], hd_ = [];
function hpush(c, d) { hp_.push(c); hd_.push(d); let k = hp_.length - 1; while (k) { const p = (k - 1) >> 1; if (hd_[p] <= hd_[k]) break; [hp_[p], hp_[k]] = [hp_[k], hp_[p]]; [hd_[p], hd_[k]] = [hd_[k], hd_[p]]; k = p; } }
function hpop() { const c = hp_[0], d = hd_[0], lc = hp_.pop(), ld = hd_.pop(); if (hp_.length) { hp_[0] = lc; hd_[0] = ld; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hp_.length && hd_[a] < hd_[m]) m = a; if (b < hp_.length && hd_[b] < hd_[m]) m = b; if (m === k) break; [hp_[m], hp_[k]] = [hp_[k], hp_[m]]; [hd_[m], hd_[k]] = [hd_[k], hd_[m]]; k = m; } } return [c, d]; }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function enterCost(i, j, big) { const t = cell[idx(i, j)]; if (t === FENCE) return big ? Infinity : 3.5; if (big && t === OPEN && openAt[idx(i, j)].kind === 'window') return Infinity; if (t === WALL || t === OBST) return Infinity; if (t === OPEN) { const o = openAt[idx(i, j)], b = o.boards.length; return b ? 1 + b * 5 : o.kind === 'window' ? 2.2 : 1; } return 1; }
function diagOk(i, j, di, dj) { return !hardBlocked(i + di, j) && !hardBlocked(i, j + dj); }
function computeFlow() { flowInto(dist, false); flowInto(distB, true); }
function flowInto(dist, big) {
  dist.fill(1e9); hp_.length = 0; hd_.length = 0;
  const si = clamp(ci(P.x), 0, N - 1), sj = clamp(ci(P.z), 0, N - 1), s = idx(si, sj);
  dist[s] = 0; hpush(s, 0);
  while (hp_.length) {
    const [c, d] = hpop(); if (d > dist[c]) continue;
    const i = c % N, j = (c / N) | 0;
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj; if (!inb(ni, nj)) continue;
      const cost = enterCost(ni, nj, big); if (cost === Infinity) continue;
      const diag = di && dj; if (diag && !diagOk(i, j, di, dj)) continue;
      const nd = d + cost * (diag ? 1.414 : 1), n = idx(ni, nj);
      if (nd < dist[n]) { dist[n] = nd; hpush(n, nd); }
    }
  }
}
