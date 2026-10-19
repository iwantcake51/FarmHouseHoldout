// The furniture, placed afresh each run in the farmhouse's new rooms (world/interior.js lays the rooms out first).
//
// Every piece (FURN, registered where it's built: world/props.js, stations/stations.js, stations/armory.js) goes with
// its back to a wall, turned a quarter at a time to face the room, the strongbox into a corner; then nudged along the
// wall and turned a hair off square (FURN_JIT), so no two runs set it just alike. It never stands in a doorway or
// either side of one, in front of a window or the door, or where you start; a station keeps the spot it's used from
// clear and in its own room; and everywhere you could walk, and every station, can still be reached from the front
// door, and a piece more than a cell long never across a wall. The gun rack goes in the same room as the workbench, near it, so a gun's bought and kitted out in one place
// (FURN_WITH). Where it goes is weighed (furnScore): the bed in a bedroom, its headboard to a wall if it can be; the pantry
// shelf in a small room or the kitchen; the stations mostly in the living room; and all of it with room round it,
// rather than packed up against the next piece.

const FURN_JIT = { slide: 0.1, turn: 0.045 };
const FURN_ORDER = ['box', 'bed', 'bench', 'saw', 'shelf', 'rack', 'med', 'radio'];
// a piece that goes in the same room as one placed before it, and how much each cell further from it counts against a spot
const FURN_WITH = { rack: 'bench' }, FURN_NEAR = 0.6;
// each piece as it was built: where, how turned, on which cells, and its station's spot and footprint
FURN.forEach(f => {
  f.p0 = f.g.position.clone(); f.r0 = f.g.rotation.y; f.c0 = f.cells.map(c => c.slice()); f.at = f.c0.map(c => c.slice());
  f.piv = [cxw(f.c0[0][0]), cxw(f.c0[0][1])];
  if (f.st) { f.u0 = [f.st.x, f.st.z]; if (f.st.foot) f.foot0 = f.st.foot.slice(); }
});
FURN.sort((a, b) => FURN_ORDER.indexOf(a.id) - FURN_ORDER.indexOf(b.id));
// (x, z) turned q quarter turns the way three.js turns about y (+z round toward +x)
const quarter = (x, z, q) => { for (let k = 0; k < (q & 3); k++) { const t = x; x = z; z = -t; } return [x, z]; };
// a piece stood with its first cell at (pi, pj), turned q quarters from how it was built: its cells, the way it faces,
// and its station's spot
function furnAt(f, pi, pj, q) {
  const px = cxw(pi), pz = cxw(pj);
  const cells = f.c0.map(([i, j]) => { const [dx, dz] = quarter(cxw(i) - f.piv[0], cxw(j) - f.piv[1], q); return [ci(px + dx), ci(pz + dz)]; });
  const face = quarter(f.face[0], f.face[1], q).map(Math.round), head = f.head ? quarter(f.head[0], f.head[1], q).map(Math.round) : null;
  const use = f.u0 ? (([dx, dz]) => [px + dx, pz + dz])(quarter(f.u0[0] - f.piv[0], f.u0[1] - f.piv[1], q)) : null;
  return { f, cells, face, head, use, q, pi, pj };
}
// the cells a station's spot is on: two (or four) if it's on the line between them, as along a two-cell piece, since it's
// slid a little along the wall after (FURN_JIT)
const useCells = c => { const out = new Set(); for (const a of [-0.15, 0.15]) for (const b of [-0.15, 0.15]) out.add(idx(ci(c.use[0] + a), ci(c.use[1] + b))); return [...out]; };
// a wall (or the outside wall) on the (di, dj) side of cell (i, j), between these walls W
const furnWall = (W, i, j, di, dj) => !inPlan(i + di, j + dj) || (di ? W.has(eKey('x', Math.max(i, i + di), j)) : W.has(eKey('z', i, Math.max(j, j + dj))));
// whether a piece can stand there: on cells inside and free (occ: taken by another piece, keep: kept clear), its back
// to a wall (both sides of a corner, for a corner piece), and its station's spot free and in the same room
function furnFits(c, W, occ, keep, ro) {
  for (const [i, j] of c.cells) if (!inPlan(i, j) || occ[idx(i, j)] || keep[idx(i, j)]) return false;
  // (a piece more than a cell long never straddles a wall between its own cells: the bed half through one)
  for (const [i, j] of c.cells) for (const [a, b] of c.cells) if (Math.abs(a - i) + Math.abs(b - j) === 1 && furnWall(W, i, j, a - i, b - j)) return false;
  const [fx, fz] = c.face;
  for (const [i, j] of c.cells) {
    if (fx && fz) { if (!furnWall(W, i, j, -fx, 0) || !furnWall(W, i, j, 0, -fz)) return false; }
    else if (!furnWall(W, i, j, -fx, -fz)) return false;
  }
  if (c.use) for (const u of useCells(c)) {
    const ui = u % N, uj = (u / N) | 0;
    if (!inPlan(ui, uj) || occ[u] || c.cells.some(([i, j]) => i === ui && j === uj) || ro[u] !== ro[idx(c.cells[0][0], c.cells[0][1])]) return false;
  }
  return true;
}
// how good a spot it is (with a little chance in it): see the top of the file
function furnScore(c, W, occ, ro, kinds, rnd) {
  const r = ro[idx(c.cells[0][0], c.cells[0][1])], kind = kinds[r], id = c.f.id;
  let s = rnd() * 3;
  if (id === 'bed') { s += kind === 'bed' ? 6 : kind === 'small' ? -5 : 0; if (c.head && c.cells.some(([i, j]) => furnWall(W, i, j, c.head[0], c.head[1]))) s += 2; }
  else if (id === 'shelf') s += kind === 'small' ? 4 : kind === 'live' ? 1.5 : 0;
  else if (c.f.st) s += kind === 'live' ? 2.5 : kind === 'bed' ? 0.5 : -1;
  for (const [i, j] of c.cells) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (occ[idx(i + a, j + b)]) s -= 1.2;
  return s;
}
// every piece placed, between the walls W (doors: the doorways in them; ro: each cell's room, kinds: what each room is),
// or null if they won't all go in
function placeFurniture(rnd, W, doors, ro, kinds, fronts) {
  const occ = new Uint8Array(N * N), keep = new Uint8Array(N * N), out = new Map();
  for (const [i, j] of fronts) keep[idx(i, j)] = 1;   // in front of each window
  // the way in from the front door: the cell inside it, those either side of that and the row beyond
  for (let a = -1; a <= 1; a++) for (let b = 0; b <= 1; b++) keep[idx(HOUSE_DOOR[0] + a, HOUSE_DOOR[1] - b)] = 1;
  // in front of each doorway on both sides (two deep straight out from it) and beside it along the wall, where its door
  // swings and the way through it goes: nothing's ever stood in the way of a door
  for (const k of doors) {
    const [ax, i, j] = eDec(k);
    for (let s = -1; s <= 1; s++) for (let t = 0; t < (s ? 1 : 2); t++) { if (ax === 'x') { keep[idx(i + t, j + s)] = 1; keep[idx(i - 1 - t, j + s)] = 1; } else { keep[idx(i + s, j + t)] = 1; keep[idx(i + s, j - 1 - t)] = 1; } }
  }
  keep[idx(ci(cxw(21)), ci(cxw(22)))] = 1;   // where you start
  for (const f of FURN) {
    let best = null, bs = -Infinity;
    const w = FURN_WITH[f.id] && [...out.values()].find(c => c.f.id === FURN_WITH[f.id]), wr = w ? ro[idx(w.cells[0][0], w.cells[0][1])] : -1;
    for (let pj = IN.j0; pj <= IN.j1; pj++) for (let pi = IN.i0; pi <= IN.i1; pi++) for (let q = 0; q < 4; q++) {
      const c = furnAt(f, pi, pj, q); if (!furnFits(c, W, occ, keep, ro)) continue;
      if (w && ro[idx(c.cells[0][0], c.cells[0][1])] !== wr) continue;
      let s = furnScore(c, W, occ, ro, kinds, rnd);
      if (w) s -= FURN_NEAR * Math.min(...c.cells.flatMap(([i, j]) => w.cells.map(([a, b]) => Math.abs(i - a) + Math.abs(j - b))));
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) return null;
    out.set(f, best); for (const [i, j] of best.cells) occ[idx(i, j)] = 1;
    if (best.use) for (const u of useCells(best)) keep[u] = 1;   // (its spot stays clear of what comes after)
  }
  // and the house still all gets round: every free cell, and so every station's spot, reached from the front door
  const seen = new Uint8Array(N * N), q = [idx(HOUSE_DOOR[0], HOUSE_DOOR[1])]; seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj, n = idx(ni, nj); if (!inPlan(ni, nj) || seen[n] || occ[n] || furnWall(W, i, j, di, dj)) continue; seen[n] = 1; q.push(n); }
  }
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) if (inPlan(i, j) && !occ[idx(i, j)] && !seen[idx(i, j)]) return null;
  return out;
}
// put each piece where the plan says (or back where it was built, with none): its cells in the grid (low or tall: what
// you see and shoot over), its model moved and turned (nudged and twisted a little: FURN_JIT), and its station's spot
// and footprint with it
function applyFurniture(placed, rnd) {
  for (const f of FURN) for (const [i, j] of f.at) { const k = idx(i, j); if (cell[k] !== OBST) continue; cell[k] = EMPTY; lowObst.delete(k); blockArr[k] = 0; }   // (where it stood last run, if that's not a wall now: world/house.js)
  for (const f of FURN) {
    const c = placed ? placed.get(f) : furnAt(f, f.c0[0][0], f.c0[0][1], 0);
    f.at = c.cells;
    for (const [i, j] of c.cells) { const k = idx(i, j); cell[k] = OBST; if (f.low) lowObst.add(k); blockArr[k] = f.low ? 0 : 1; }
    // (a piece more than a cell long is nudged less, so it never reaches over into the next cell or into a wall)
    const [dx, dz] = quarter(f.p0.x - f.piv[0], f.p0.z - f.piv[1], c.q), one = c.cells.length === 1, corner = !!(c.face[0] && c.face[1]);
    const sl = placed && !corner ? (rnd() * 2 - 1) * FURN_JIT.slide * (one ? 1 : 0.3) : 0, tw = placed ? (rnd() * 2 - 1) * FURN_JIT.turn * (one ? 1 : 0.45) : 0;
    const ax = Math.abs(c.face[0]) ? 0 : 1, az = 1 - ax;   // (slid along the wall at its back)
    f.g.position.set(cxw(c.pi) + dx + sl * ax, f.p0.y, cxw(c.pj) + dz + sl * az);
    f.g.rotation.y = f.r0 + c.q * Math.PI / 2 + tw;
    if (f.st) {
      f.st.x = c.use[0] + sl * ax; f.st.z = c.use[1] + sl * az;
      if (f.foot0) { const [fx, fz] = quarter(f.foot0[0] - f.piv[0], f.foot0[1] - f.piv[1], c.q), odd = c.q & 1; f.st.foot = [cxw(c.pi) + fx + sl * ax, cxw(c.pj) + fz + sl * az, odd ? f.foot0[3] : f.foot0[2], odd ? f.foot0[2] : f.foot0[3]]; }
    }
  }
}
