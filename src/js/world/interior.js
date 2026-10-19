// The farmhouse's rooms: a new floor plan inside the same four walls every run, the way a small farmhouse is laid out.
// The front door opens into the living room and kitchen, the biggest room; down one side or across the back the
// bedrooms, a bath, a box room, each opening off it (a small one sometimes off the bedroom next to it instead); and
// often a pantry or a closet boxed off in one of its corners. Every room has a way in, nothing's narrower than two
// metres, and nothing stands where it can't: no wall cuts a piece of furniture in two or shuts it away from where it's
// used, ends on a window or the door, or hangs over the pictures. The walls are thin ones on the lines between cells
// (world/thin-walls.js), plastered, with a skirting board, a picture rail of trim along the top, and a cased frame
// round each doorway under a header; a lamp hangs in each room (two in a big one). In co-op the host's seed lays out
// everyone's house alike (net/net.js).

const IN = { i0: HX0 + 1, i1: HX1 - 1, j0: HZ0 + 1, j1: HZ1 - 1 };
// how the walls look: how high, the skirting and the trim along the top, a doorway's frame, and their materials (they
// dither away round you where they're between you and the camera: INWALL_CUT, core/shaders.js)
const IW = { h: 2.42, base: 0.11, cap: 0.05, head: 2.05, case: 0.075 };
const IW_M = { plaster: lit(new THREE.MeshLambertMaterial({ color: 0xd6ccb4 }), 'inwall'), trim: lit(new THREE.MeshLambertMaterial({ color: 0x5c4532 }), 'inwall'), base: lit(new THREE.MeshLambertMaterial({ color: 0x4a3828 }), 'inwall') };
const HOUSE_PLAN = { seed: 0, rooms: [], doors: [], g: new THREE.Group() };
scene.add(HOUSE_PLAN.g);
const eKey = (ax, i, j) => (ax === 'x' ? 0 : 65536) + j * 256 + i;
const eDec = k => [k >= 65536 ? 'z' : 'x', k % 256, ((k % 65536) / 256) | 0];
const inPlan = (i, j) => i >= IN.i0 && i <= IN.i1 && j >= IN.j0 && j <= IN.j1;
// the lines no wall may stand on (worked out once: the furniture doesn't move)
const HOUSE_NO = (() => {
  const no = new Set();
  const shut = (i0, j0, i1, j1) => {
    for (let i = i0 + 1; i <= i1; i++) for (let j = j0; j <= j1; j++) no.add(eKey('x', i, j));
    for (let j = j0 + 1; j <= j1; j++) for (let i = i0; i <= i1; i++) no.add(eKey('z', i, j));
  };
  // a station and the spot it's used from stay in one room
  for (const s of STATIONS) {
    const ui = ci(s.x), uj = ci(s.z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = ui + a, j = uj + b; if (inPlan(i, j) && cell[idx(i, j)] === OBST) shut(Math.min(i, ui), Math.min(j, uj), Math.max(i, ui), Math.max(j, uj)); }
  }
  // furniture more than a cell long isn't cut in two
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) {
    if (cell[idx(i, j)] !== OBST) continue;
    if (i < IN.i1 && cell[idx(i + 1, j)] === OBST) no.add(eKey('x', i + 1, j));
    if (j < IN.j1 && cell[idx(i, j + 1)] === OBST) no.add(eKey('z', i, j + 1));
  }
  // no wall ends on a window or the door, or stands right across the way in from the door
  for (const o of openings) {
    const fi = o.i - o.nx, fj = o.j - o.nz;
    if (o.axis === 'x') { no.add(eKey('x', fi, fj)); no.add(eKey('x', fi + 1, fj)); } else { no.add(eKey('z', fi, fj)); no.add(eKey('z', fi, fj + 1)); }
    if (o.kind === 'door') no.add(o.axis === 'x' ? eKey('z', fi, Math.max(fj, fj - o.nz)) : eKey('x', Math.max(fi, fi - o.nx), fj));
  }
  no.add(eKey('z', IN.i0, 20));   // the picture on the west wall
  return no;
})();
const HOUSE_DOOR = (() => { const o = openings.find(q => q.kind === 'door'); return [o.i - o.nx, o.j - o.nz]; })();

// one try at a floor plan from rnd: the walls (edge keys), the doorways in them, or null if it broke a rule
function planHouse(rnd) {
  const W = new Set(), doors = [], no = HOUSE_NO;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const obst = (i, j) => cell[idx(i, j)] === OBST;
  const lk = (ax, L, u) => ax === 'x' ? eKey('x', L, u) : eKey('z', u, L);   // (the edge u along the line ax = L)
  // a doorway somewhere on the line ax = L from u = a to b: on the one spot that mustn't be wall if there is one (more
  // than one and it can't be done), never with furniture in the way on either side
  const gapOn = (ax, L, a, b) => {
    const must = [], ok = [];
    for (let u = a; u <= b; u++) {
      if (no.has(lk(ax, L, u))) must.push(u);
      if (ax === 'x' ? !obst(L - 1, u) && !obst(L, u) : !obst(u, L - 1) && !obst(u, L)) ok.push(u);
    }
    if (must.length > 1) return null;
    if (must.length) return ok.includes(must[0]) ? must[0] : null;
    return ok.length ? ok[(rnd() * ok.length) | 0] : null;
  };
  // a wall along the line ax = L from u = a to b, open at the doorways in gaps
  const run = (ax, L, a, b, gaps) => {
    for (let u = a; u <= b; u++) {
      const k = lk(ax, L, u);
      if (gaps.includes(u)) { doors.push(k); continue; }
      if (no.has(k)) return false;
      W.add(k);
    }
    return true;
  };
  // n room sizes, none under 2, adding up to total
  const sizes = (total, n) => { const out = []; let left = total; for (let k = n; k > 1; k--) { const s = ri(2, left - 2 * (k - 1)); out.push(s); left -= s; } out.push(left); return out; };

  // the wing: bedrooms down one side (the door's side never), or across the back
  const side = rnd() < 0.62, depth = ri(3, 4);
  let wing, pub, wl, wax;   // (wl, wax: the line the wing's rooms open onto the living room through)
  if (side) {
    const left = rnd() < 0.5;
    wl = left ? IN.i0 + depth : IN.i1 + 1 - depth; wax = 'x';
    wing = left ? [IN.i0, IN.j0, wl - 1, IN.j1] : [wl, IN.j0, IN.i1, IN.j1]; pub = left ? [wl, IN.j0, IN.i1, IN.j1] : [IN.i0, IN.j0, wl - 1, IN.j1];
  } else {
    wl = IN.j0 + depth; wax = 'z';
    wing = [IN.i0, IN.j0, IN.i1, wl - 1]; pub = [IN.i0, wl, IN.i1, IN.j1];
  }
  if (HOUSE_DOOR[0] < pub[0] || HOUSE_DOOR[0] > pub[2] || HOUSE_DOOR[1] < pub[1] || HOUSE_DOOR[1] > pub[3]) return null;
  // its rooms, split across it, each opening onto the living room (or, a small one, onto the room beside it)
  const along = side ? [wing[1], wing[3]] : [wing[0], wing[2]], span = along[1] - along[0] + 1;
  const n = span >= 8 && rnd() < 0.55 ? 3 : 2, sz = sizes(span, n), segs = [];
  let at = along[0]; for (const s of sz) { segs.push([at, at + s - 1]); at += s; }
  const across = side ? [wing[0], wing[2]] : [wing[1], wing[3]], wide = across[1] - across[0] + 1;
  const suite = segs.map((s, k) => (s[1] - s[0] + 1) * wide <= 8 && rnd() < 0.35 ? (k > 0 ? k - 1 : k + 1) : -1);
  if (suite.every(t => t >= 0)) suite[0] = -1;
  for (let k = 0; k < segs.length; k++) if (suite[k] >= 0 && suite[suite[k]] >= 0) suite[k] = -1;   // (it opens onto one that opens onto the living room)
  const wingGaps = [];
  for (let k = 0; k < segs.length; k++) { if (suite[k] >= 0) continue; const g = gapOn(wax, wl, segs[k][0], segs[k][1]); if (g === null) return null; wingGaps.push(g); }
  if (!run(wax, wl, along[0], along[1], wingGaps)) return null;
  for (let k = 1; k < segs.length; k++) {
    const L = segs[k][0], ax = side ? 'z' : 'x', gaps = [];
    if (suite[k] === k - 1 || suite[k - 1] === k) { const g = gapOn(ax, L, across[0], across[1]); if (g === null) return null; gaps.push(g); }
    if (!run(ax, L, across[0], across[1], gaps)) return null;
  }
  // a pantry or a closet boxed off in a corner of the living room, now and then a second
  const closets = rnd() < 0.7 ? (rnd() < 0.3 ? 2 : 1) : 0, boxes = [];
  for (let c = 0; c < closets; c++) {
    const w = ri(2, 3), h = ri(2, 3), cx = rnd() < 0.5, cz = rnd() < 0.5;
    const r = [cx ? pub[0] : pub[2] - w + 1, cz ? pub[1] : pub[3] - h + 1, 0, 0]; r[2] = r[0] + w - 1; r[3] = r[1] + h - 1;
    if (w >= pub[2] - pub[0] || h >= pub[3] - pub[1]) continue;   // (the living room keeps a way round it)
    if (HOUSE_DOOR[0] >= r[0] - 1 && HOUSE_DOOR[0] <= r[2] + 1 && HOUSE_DOOR[1] >= r[1] - 1 && HOUSE_DOOR[1] <= r[3] + 1) continue;
    if (boxes.some(b => b[0] <= r[2] + 1 && r[0] <= b[2] + 1 && b[1] <= r[3] + 1 && r[1] <= b[3] + 1)) continue;
    // its two open sides: one along x (L), one along z, and the doorway on the longer
    const Lx = cx ? r[2] + 1 : r[0], Lz = cz ? r[3] + 1 : r[1], onX = h > w || (h === w && rnd() < 0.5);
    const g = onX ? gapOn('x', Lx, r[1], r[3]) : gapOn('z', Lz, r[0], r[2]); if (g === null) return null;
    if (!run('x', Lx, r[1], r[3], onX ? [g] : []) || !run('z', Lz, r[0], r[2], onX ? [] : [g])) return null;
    boxes.push(r);
  }
  if (!W.size) return null;
  // and it all has to be walkable: everywhere you could get to in the house with no walls in it (so every station)
  // still reached from the front door
  const seen = planReach(W);
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) if (HOUSE_REACH[idx(i, j)] && !seen[idx(i, j)]) return null;
  return { walls: W, doors };
}
// the cells you can walk to from the front door between the walls W
function planReach(W) {
  const seen = new Uint8Array(N * N), q = [idx(HOUSE_DOOR[0], HOUSE_DOOR[1])]; seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, n = idx(ni, nj);
      if (!inPlan(ni, nj) || seen[n] || cell[n] === OBST || (di ? W.has(eKey('x', Math.max(i, ni), j)) : W.has(eKey('z', i, Math.max(j, nj))))) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}
const HOUSE_REACH = planReach(new Set());
// the rooms a plan makes: each a list of its cells, flooded out between the walls and their doorways
function planRooms(W, doors) {
  W = new Set([...W, ...doors]);
  const room = new Int16Array(N * N).fill(-1), rooms = [];
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) {
    if (room[idx(i, j)] >= 0) continue;
    const cells = [], q = [[i, j]], r = rooms.length; room[idx(i, j)] = r;
    while (q.length) {
      const [a, b] = q.pop(); cells.push([a, b]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + di, nb = b + dj; if (!inPlan(na, nb) || room[idx(na, nb)] >= 0) continue;
        if (di ? W.has(eKey('x', Math.max(a, na), b)) : W.has(eKey('z', a, Math.max(b, nb)))) continue;
        room[idx(na, nb)] = r; q.push([na, nb]);
      }
    }
    rooms.push(cells);
  }
  return rooms;
}
// where a room's lamps hang: over the middle of it, or in a big room over the middle of each half (always over one of
// its own cells, so an L-shaped room's isn't over the closet in its corner)
function roomLamps(cells) {
  const mid = cs => { const x = cs.reduce((s, c) => s + c[0], 0) / cs.length, z = cs.reduce((s, c) => s + c[1], 0) / cs.length; let b = cs[0], bd = 1e9; for (const c of cs) { const d = (c[0] - x) ** 2 + (c[1] - z) ** 2; if (d < bd) { bd = d; b = c; } } const inR = cs.some(c => c[0] === Math.round(x) && c[1] === Math.round(z)) || cs.some(c => Math.abs(c[0] - x) < 0.6 && Math.abs(c[1] - z) < 0.6); return inR ? [cxw(x), cxw(z)] : [cxw(b[0]), cxw(b[1])]; };
  if (cells.length < 22) return [mid(cells)];
  const xs = cells.map(c => c[0]), zs = cells.map(c => c[1]), wx = Math.max(...xs) - Math.min(...xs), wz = Math.max(...zs) - Math.min(...zs);
  const k = wx >= wz ? 0 : 1, sorted = cells.slice().sort((a, b) => a[k] - b[k]), h = sorted.length >> 1;
  return [mid(sorted.slice(0, h)), mid(sorted.slice(h))];
}

// the walls built: one run of plaster a stretch of wall, its skirting on both sides and the trim along its top, and
// round each doorway a header over it and a cased frame on both faces
function buildInWalls(W, doors) {
  const g = HOUSE_PLAN.g;
  while (g.children.length) { const m = g.children.pop(); if (m.userData.fine) m.geometry.dispose(); }
  const t = THIN.t, H = IW.h, add = (w, h, d, mat, x, y, z) => box(g, w, h, d, mat, x, y, z);
  // runs: each line's walls in unbroken stretches
  const lines = new Map();
  for (const k of W) { const [ax, i, j] = eDec(k), key = ax + (ax === 'x' ? i : j); if (!lines.has(key)) lines.set(key, { ax, L: ax === 'x' ? i : j, us: [] }); lines.get(key).us.push(ax === 'x' ? j : i); }
  for (const { ax, L, us } of lines.values()) {
    us.sort((a, b) => a - b);
    for (let s = 0; s < us.length;) {
      let e = s; while (e + 1 < us.length && us[e + 1] === us[e] + 1) e++;
      const u0 = us[s] - HALF - t / 2, u1 = us[e] + 1 - HALF + t / 2, len = u1 - u0, c = (u0 + u1) / 2, p = L - HALF;
      const piece = (w, h, d, mat, y) => ax === 'x' ? add(d, h, w, mat, p, y, c) : add(w, h, d, mat, c, y, p);
      piece(len, H, t, IW_M.plaster, H / 2);
      piece(len, IW.base, t + 0.03, IW_M.base, IW.base / 2);
      piece(len + 0.02, IW.cap, t + 0.04, IW_M.trim, H - IW.cap / 2);
      s = e + 1;
    }
  }
  for (const k of doors) {
    const [ax, i, j] = eDec(k), p = (ax === 'x' ? i : j) - HALF, c = (ax === 'x' ? j : i) + 0.5 - HALF;
    const piece = (w, h, d, mat, y, off, face) => ax === 'x' ? add(d, h, w, mat, p + (face || 0), y, c + (off || 0)) : add(w, h, d, mat, c + (off || 0), y, p + (face || 0));
    piece(1, H - IW.head, t, IW_M.plaster, (H + IW.head) / 2);                 // the header over it
    piece(1.02, IW.cap, t + 0.04, IW_M.trim, H - IW.cap / 2);                   // the top trim carried across
    [-1, 1].forEach(f => {
      const face = f * (t / 2 + 0.011);
      [-1, 1].forEach(sd => piece(IW.case, IW.head + 0.02, 0.022, IW_M.trim, (IW.head + 0.02) / 2, sd * (0.5 - IW.case / 2), face));   // side casings
      piece(1, 0.08, 0.022, IW_M.trim, IW.head + 0.04, 0, face);              // head casing
    });
    // the jambs: the doorway's own sides, so you never see into the wall's end
    [-1, 1].forEach(sd => piece(0.02, IW.head, t + 0.02, IW_M.trim, IW.head / 2, sd * 0.5));
  }
  mergeInto(g, finePieces(g));
}
// a new house: the plan for this seed (the first that keeps every rule; failing that, none), its walls in the grid
// and built, the lamps hung. live: during a game (rather than as the page loads), so the light, the zombies' ways
// round the house and what you can see are all worked out again for it
function houseLayout(seed, live) {
  const rnd = seeded(seed); let plan = null;
  for (let k = 0; k < 400 && !plan; k++) plan = planHouse(rnd);
  HOUSE_PLAN.seed = seed;
  wX.fill(0); wZ.fill(0);
  const W = plan ? plan.walls : new Set();
  for (const k of W) { const [ax, i, j] = eDec(k); if (ax === 'x') wX[j * (N + 1) + i] = 1; else wZ[j * N + i] = 1; }
  THIN.n = W.size; THIN.box = [cxw(HX0) - 0.5, cxw(HZ0) - 0.5, cxw(HX1) + 0.5, cxw(HZ1) + 0.5];
  HOUSE_PLAN.doors = plan ? plan.doors : []; HOUSE_PLAN.rooms = planRooms(W, HOUSE_PLAN.doors);
  buildInWalls(W, HOUSE_PLAN.doors);
  HANG.length = 0; HOUSE_PLAN.rooms.forEach(r => HANG.push(...roomLamps(r))); hangLamps();
  if (live) { relightHouse(); flowDirty = true; viaF.clear(); visKey = ''; }
}
houseLayout((Math.random() * 2147483647) | 0, false);
