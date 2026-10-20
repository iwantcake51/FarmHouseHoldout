// The yard, set out afresh each run along with the house's floor plan (world/interior.js: houseLayout, off the same
// seed, so in co-op everyone's is alike). The gap in the fence at the front, where the drive goes out, stays; the one
// in each other side moves along it, and now and then a side has a second (FENCE_GAPS, world/fence.js). The cars, the
// crates, the hay bales and the burn barrel (YARD_PROPS, world/props.js) are set down round the yard and just outside
// the fence: the cars and the hay bales out past it (a pair and two on their own), never in the yard; the crates stacked
// three together, a pair and two on their own, anywhere; the barrel inside the fence. Nothing goes up against the house (its windows need their way in: YARD.house), on the
// porch or the drive, in or in front of a gap in the fence (YARD.gap), on the trodden paths out to the gaps, or right
// against another prop; and every cell a zombie could walk on round the yard is still reached from the edge of the map.
// The trodden earth out to the gaps is painted in again where they are now (world/ground.js: groundMask)
//
// YARD: how far a side gap stays from the corners, the chance a side gets a second and how far apart the two; how many
// cells props keep from the house (more off the front, for the porch), from a fence gap and from a path; how far out past
// the fence they go; how many clear cells between one prop (or stack of them) and the next; and how many tries at a yard where everything can still be got to
const YARD = { gapEnd: 3, second: 0.35, apart: 5, house: 2, porch: 3, gap: 2, path: 1, out: 5, apartProps: 2, tries: 80 };
// what goes where: each group's kind, the shape of its cells (before it's turned), and whether it stays inside the fence
// or out past it
const YARD_SETS = [
  { kind: 'car', shape: [[0, 0]], outside: true }, { kind: 'car', shape: [[0, 0]], outside: true },
  { kind: 'barrel', shape: [[0, 0]], inside: true },
  { kind: 'crate', shape: [[0, 0], [1, 0], [0, 1]] }, { kind: 'crate', shape: [[0, 0], [1, 0]] }, { kind: 'crate', shape: [[0, 0]] }, { kind: 'crate', shape: [[0, 0]] },
  { kind: 'hay', shape: [[0, 0], [1, 0]], outside: true }, { kind: 'hay', shape: [[0, 0]], outside: true }, { kind: 'hay', shape: [[0, 0]], outside: true }
];
// the trodden path from the house out to each gap but the front one (the drive): from the middle of the gap straight in
// to the nearest point of the house's wall, x, z to x, z
function yardPaths() {
  return FENCE_GAPS.filter(g => g[0] !== 'S').map(([s, a, b]) => {
    const u = cxw((a + b) / 2);
    if (s === 'N') return [clamp(u, cxw(HX0), cxw(HX1)), cxw(HZ0) - 1, u, cxw(FZ0)];
    if (s === 'W') return [cxw(HX0) - 1, clamp(u, cxw(HZ0), cxw(HZ1)), cxw(FX0), u];
    return [cxw(HX1) + 1, clamp(u, cxw(HZ0), cxw(HZ1)), cxw(FX1), u];
  });
}
function yardLayout(rnd, live) {
  // what's set down now comes up off its cells
  for (const p of YARD_PROPS) for (const [i, j] of p.at) { const k = idx(i, j); if (cell[k] === OBST) cell[k] = EMPTY; lowObst.delete(k); if (live) blockArr[k] = 0; }
  // the gaps in the fence, and the fence put up round them
  FENCE_GAPS.length = 1;
  const sides = ['N', 'W', 'E'], span = s => s === 'N' ? [FX0 + YARD.gapEnd, FX1 - YARD.gapEnd - 1] : [FZ0 + YARD.gapEnd, FZ1 - YARD.gapEnd - 1], at = ([a, b]) => a + Math.floor(rnd() * (b - a + 1));
  for (const s of sides) { const u = at(span(s)); FENCE_GAPS.push([s, u, u + 1]); }
  if (rnd() < YARD.second) {
    const s = sides[(rnd() * sides.length) | 0], u0 = FENCE_GAPS.find(g => g[0] === s)[1];
    for (let t = 0; t < 12; t++) { const u = at(span(s)); if (Math.abs(u - u0) >= YARD.apart) { FENCE_GAPS.push([s, u, u + 1]); break; } }
  }
  FENCE_DOWN.clear(); fenceHp.clear(); buildFence();   // (put up whole again, whatever brutes knocked down last run)
  const paths = yardPaths();
  groundMask(paths);
  // where nothing may go
  const keep = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cxw(i), z = cxw(j);
    let no = i >= HX0 - YARD.house && i <= HX1 + YARD.house && j >= HZ0 - YARD.house && j <= HZ1 + (Math.abs(i - 21) <= 3 ? YARD.porch : YARD.house);
    no = no || onRoad(x, z, 0.6) || i < FX0 - YARD.out || i > FX1 + YARD.out || j < FZ0 - YARD.out || j > FZ1 + YARD.out;
    for (const [a, b, c, d] of paths) { if (no) break; const dx = c - a, dz = d - b, L = dx * dx + dz * dz || 1, t = clamp(((x - a) * dx + (z - b) * dz) / L, 0, 1); no = Math.hypot(x - a - dx * t, z - b - dz * t) < YARD.path + 0.5; }
    if (no) keep[idx(i, j)] = 1;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (fenceGap(i, j)) for (let a = -YARD.gap; a <= YARD.gap; a++) for (let b = -YARD.gap; b <= YARD.gap; b++) if (inb(i + a, j + b)) keep[idx(i + a, j + b)] = 1;
  const inFence = (i, j) => i > FX0 && i < FX1 && j > FZ0 && j < FZ1, outFence = (i, j) => i < FX0 || i > FX1 || j < FZ0 || j > FZ1;
  // the cells round the yard you can walk to from the edge of the map, with nothing set down (taken) and with it
  const reach = taken => {
    const seen = new Uint8Array(N * N), st = [];
    for (const [i, j] of GAPS) { const k = idx(i, j); if (!seen[k]) { seen[k] = 1; st.push(k); } }
    while (st.length) {
      const k = st.pop(), i = k % N, j = (k / N) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = idx(i + a, j + b); if (inb(i + a, j + b) && !seen[n] && !taken[n] && cell[n] !== WALL && cell[n] !== OBST && cell[n] !== FENCE) { seen[n] = 1; st.push(n); } }
    }
    return seen;
  };
  const before = reach(new Uint8Array(N * N));
  // each set, somewhere it fits, then the whole yard checked; failing that, tried again
  for (let tr = 0; tr < YARD.tries; tr++) {
    const taken = new Uint8Array(N * N), put = [];
    let ok = true;
    for (const set of YARD_SETS) {
      const props = YARD_PROPS.filter(p => p.kind === set.kind && !put.some(u => u.p === p)).slice(0, set.shape.length);
      let done = false;
      for (let t = 0; t < 60 && !done; t++) {
        const i0 = (rnd() * N) | 0, j0 = (rnd() * N) | 0, q = (rnd() * 4) | 0, cs = [];
        // (the group's shape turned, each of its props on its own cell or, a car, its four by two)
        set.shape.forEach(([a, b], k) => { const [da, db] = quarter(a, b, q); cs.push(...yardCells(props[k], i0 + da, j0 + db, q).map(c => [...c, k])); });
        // (on clear ground, with a clear ring round it: nothing solid against it, a fence, a tree, the house, and no
        // other prop within YARD.apartProps cells, so props never run together into a wall across the way)
        const own = (a, b) => cs.some(c => c[0] === a && c[1] === b), R = YARD.apartProps;
        const fits = cs.every(([i, j]) => inb(i, j) && cell[idx(i, j)] === EMPTY && !keep[idx(i, j)] && (!set.inside || inFence(i, j)) && (!set.outside || outFence(i, j)) &&
          [-1, 0, 1].every(a => [-1, 0, 1].every(b => !inb(i + a, j + b) || own(i + a, j + b) || cell[idx(i + a, j + b)] === EMPTY)) &&
          [...Array(2 * R + 1).keys()].every(a => [...Array(2 * R + 1).keys()].every(b => !inb(i + a - R, j + b - R) || !taken[idx(i + a - R, j + b - R)])));
        if (!fits) continue;
        set.shape.forEach(([a, b], k) => { const [da, db] = quarter(a, b, q); put.push({ p: props[k], i: i0 + da, j: j0 + db, q }); });
        for (const [i, j] of cs) taken[idx(i, j)] = 1;
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    // every cell you could walk to round the yard with nothing set down, still got to from the edge of the map
    if (ok) { const seen = reach(taken); for (let k = 0; k < N * N && ok; k++) if (before[k] && !taken[k] && !seen[k]) ok = false; }
    if (!ok) continue;
    for (const u of put) yardSet(u.p, u.i, u.j, u.q, live);
    return;
  }
  // (none would do: everything back where it was built)
  for (const p of YARD_PROPS) yardSet(p, p.home[0], p.home[1], p.home[2], live);
}
