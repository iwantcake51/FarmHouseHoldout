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
const HOUSE_PLAN = { seed: 0, rooms: [], doors: [], roomOf: new Int16Array(N * N).fill(-1), cols: [], kinds: [], g: new THREE.Group() };
// each room's paint, by what it is: the living room (the one the door opens into), a bedroom, or a small room (a bath,
// a pantry or a closet: six cells or fewer), which has a tiled floor (TILE: its tile colours)
const ROOM_PAINT = { live: [0xd9c9a8, 0xcdb68e, 0xbcc4a2, 0xd6b9a2, 0xc9c0ae], bed: [0xa9b8c6, 0xc4afbf, 0xb4c6a4, 0xd8ccb0, 0x9fb3a6, 0xcbb69a], small: [0xc9dbd6, 0xe2ddcc, 0xa9c2ba, 0xd8d0e0] };
const TILE = [0xe8e2d4, 0xcfdcd6, 0xe2d4c0, 0xd2d6dc];
const IW_PAINT = new Map(), iwPaint = c => IW_PAINT.get(c) || (IW_PAINT.set(c, lit(new THREE.MeshLambertMaterial({ color: c }), 'inwall')), IW_PAINT.get(c));
// a floor of small square tiles, four to the metre, with grout between them, a little uneven in tone
const TILE_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#8a8478'; x.fillRect(0, 0, 128, 128);
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const v = ((a + b) % 2 ? 214 : 250) - ((a * 7 + b * 13) % 5) * 3; x.fillStyle = `rgb(${v},${v},${v - 4})`; x.fillRect(a * 32 + 1.5, b * 32 + 1.5, 29, 29); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
})();
const TILE_M = new Map(), tileMat = c => TILE_M.get(c) || (TILE_M.set(c, lam(c, { map: TILE_TEX })), TILE_M.get(c));
scene.add(HOUSE_PLAN.g);
const eKey = (ax, i, j) => (ax === 'x' ? 0 : 65536) + j * 256 + i;
const eDec = k => [k >= 65536 ? 'z' : 'x', k % 256, ((k % 65536) / 256) | 0];
const inPlan = (i, j) => i >= IN.i0 && i <= IN.i1 && j >= IN.j0 && j <= IN.j1;
// the lines no wall may stand on (the furniture goes in after the walls, round them: world/furniture.js)
const HOUSE_NO = (() => {
  const no = new Set();
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
  const obst = () => false;   // (no furniture yet: it goes in round the walls after, world/furniture.js)
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
  // and every room reached from the front door
  const seen = planReach(W);
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) if (!seen[idx(i, j)]) return null;
  return { walls: W, doors };
}
// the cells you can walk to from the front door between the walls W
function planReach(W) {
  const seen = new Uint8Array(N * N), q = [idx(HOUSE_DOOR[0], HOUSE_DOOR[1])]; seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop(), i = c % N, j = (c / N) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, n = idx(ni, nj);
      if (!inPlan(ni, nj) || seen[n] || (di ? W.has(eKey('x', Math.max(i, ni), j)) : W.has(eKey('z', i, Math.max(j, nj))))) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}
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

const TILE_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// the walls built: one run of plaster a stretch of wall, its skirting on both sides and the trim along its top, and
// round each doorway a header over it and a cased frame on both faces
function buildInWalls(W, doors) {
  const g = HOUSE_PLAN.g, ro = HOUSE_PLAN.roomOf, cols = HOUSE_PLAN.cols;
  while (g.children.length) { const m = g.children.pop(); if (m.userData.fine) m.geometry.dispose(); }
  const t = THIN.t, H = IW.h, add = (w, h, d, mat, x, y, z) => box(g, w, h, d, mat, x, y, z);
  // each face of a wall in the colour of the room it faces, from the skirting up to the trim (over a doorway, above its
  // casing)
  const paint = (i, j) => { const r = ro[idx(i, j)]; return iwPaint(r >= 0 ? cols[r] : 0xd6ccb4); };
  const skins = (k, y0) => {
    const [ax, i, j] = eDec(k), p = (ax === 'x' ? i : j) - HALF, c = (ax === 'x' ? j : i) + 0.5 - HALF, h = H - IW.cap - y0, y = y0 + h / 2;
    [-1, 1].forEach(sd => {
      const m = sd < 0 ? (ax === 'x' ? paint(i - 1, j) : paint(i, j - 1)) : paint(i, j), off = p + sd * (t / 2 + 0.002);
      if (ax === 'x') add(0.004, h, 1, m, off, y, c); else add(1, h, 0.004, m, c, y, off);
    });
  };
  for (const k of W) skins(k, IW.base);
  for (const k of doors) skins(k, IW.head + 0.08);
  // the small rooms' tiled floors
  FLOOR_TILE.fill(0);
  HOUSE_PLAN.rooms.forEach((cs, r) => {
    if (HOUSE_PLAN.kinds[r] !== 'small') return;
    const m = tileMat(HOUSE_PLAN.tile[r]);
    for (const [i, j] of cs) { const f = new THREE.Mesh(TILE_G, m); f.position.set(cxw(i), 0.021, cxw(j)); f.receiveShadow = true; g.add(f); FLOOR_TILE[idx(i, j)] = 1; }
  });
  // runs: each line's walls in unbroken stretches
  const lines = new Map();
  for (const k of W) { const [ax, i, j] = eDec(k), key = ax + (ax === 'x' ? i : j); if (!lines.has(key)) lines.set(key, { ax, L: ax === 'x' ? i : j, us: [] }); lines.get(key).us.push(ax === 'x' ? j : i); }
  for (const { ax, L, us } of lines.values()) {
    us.sort((a, b) => a - b);
    for (let s = 0; s < us.length;) {
      let e = s; while (e + 1 < us.length && us[e + 1] === us[e] + 1) e++;
      const u0 = us[s] - HALF - t / 2, u1 = us[e] + 1 - HALF + t / 2, len = u1 - u0, c = (u0 + u1) / 2, p = L - HALF;
      const piece = (w, h, d, mat, y) => ax === 'x' ? add(d, h, w, mat, p, y, c) : add(w, h, d, mat, c, y, p);
      // (no two faces in one plane where pieces meet: the plaster's top tucked up inside the trim, and the walls one
      // way a hair higher and thicker in their trim and skirting than the other, where they cross at a corner)
      const z = ax === 'z' ? 1 : 0;
      piece(len, H - 0.02, t, IW_M.plaster, (H - 0.02) / 2);
      piece(len, IW.base + z * 0.003, t + 0.03 + z * 0.004, IW_M.base, (IW.base + z * 0.003) / 2);
      piece(len + 0.02, IW.cap, t + 0.04 + z * 0.004, IW_M.trim, H + z * 0.003 - IW.cap / 2);
      s = e + 1;
    }
  }
  for (const k of doors) {
    const [ax, i, j] = eDec(k), p = (ax === 'x' ? i : j) - HALF, c = (ax === 'x' ? j : i) + 0.5 - HALF;
    const piece = (w, h, d, mat, y, off, face) => ax === 'x' ? add(d, h, w, mat, p + (face || 0), y, c + (off || 0)) : add(w, h, d, mat, c + (off || 0), y, p + (face || 0));
    const z = ax === 'z' ? 1 : 0;
    piece(1, H - 0.02 - IW.head, t - 0.004, IW_M.plaster, (H - 0.02 + IW.head) / 2);   // the header over it
    piece(1, IW.cap, t + 0.048 + z * 0.004, IW_M.trim, H + 0.0015 + z * 0.003 - IW.cap / 2);   // the top trim carried across
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
  const rnd = seeded(seed), ro = HOUSE_PLAN.roomOf;
  // its rooms (what each is, and which cells are in which), and the furniture placed in them (world/furniture.js);
  // a plan the furniture won't all go into is passed over for the next
  const roomsOf = (W, doors) => { const rooms = planRooms(W, doors); ro.fill(-1); rooms.forEach((cs, r) => cs.forEach(([i, j]) => { ro[idx(i, j)] = r; })); return { rooms, kinds: rooms.map(cs => cs.some(c => c[0] === HOUSE_DOOR[0] && c[1] === HOUSE_DOOR[1]) ? 'live' : cs.length <= 6 ? 'small' : 'bed') }; };
  let plan = null, rk = null, placed = null;
  for (let k = 0; k < 400 && !placed; k++) { plan = planHouse(rnd); if (!plan) continue; rk = roomsOf(plan.walls, plan.doors); placed = placeFurniture(rnd, plan.walls, plan.doors, ro, rk.kinds); }
  if (!placed) { plan = null; rk = roomsOf(new Set(), []); placed = placeFurniture(rnd, new Set(), [], ro, rk.kinds); }   // (no rooms: an open house)
  HOUSE_PLAN.seed = seed;
  wX.fill(0); wZ.fill(0);
  const W = plan ? plan.walls : new Set();
  for (const k of W) { const [ax, i, j] = eDec(k); if (ax === 'x') wX[j * (N + 1) + i] = 1; else wZ[j * N + i] = 1; }
  THIN.n = W.size; THIN.box = [cxw(HX0) - 0.5, cxw(HZ0) - 0.5, cxw(HX1) + 0.5, cxw(HZ1) + 0.5];
  HOUSE_PLAN.doors = plan ? plan.doors : []; HOUSE_PLAN.rooms = rk.rooms; HOUSE_PLAN.kinds = rk.kinds;
  applyFurniture(placed, rnd);
  // the paint, outside (world/house.js: paintHouse) and in each room, the inside of the outer walls included
  paintHouse(rnd);
  const used = new Set();
  HOUSE_PLAN.cols = HOUSE_PLAN.kinds.map(k => { const free = ROOM_PAINT[k].filter(c => !used.has(c)), c = free.length ? free[(rnd() * free.length) | 0] : ROOM_PAINT[k][0]; used.add(c); return c; });
  HOUSE_PLAN.tile = HOUSE_PLAN.kinds.map(() => TILE[(rnd() * TILE.length) | 0]);
  for (const w of walls) if (w.ii >= 0) { const r = ro[idx(w.ii, w.ij)]; w.mats.inner.color.setHex(r >= 0 ? HOUSE_PLAN.cols[r] : 0xd6ccb4); }
  buildInWalls(W, HOUSE_PLAN.doors);
  HANG.length = 0; HOUSE_PLAN.rooms.forEach(r => HANG.push(...roomLamps(r))); hangLamps();
  if (live) { relightHouse(); flowDirty = true; viaF.clear(); visKey = ''; }
}
