// The farmhouse's rooms: a new floor plan inside the same four walls every run, the way a small farmhouse is laid out.
// The front door opens into the living room and kitchen, the biggest room; down one side or across the back the
// bedrooms, a bath, a box room, each opening off it (a small one sometimes off the bedroom next to it instead); and
// sometimes a pantry or a closet boxed off in one of its corners. A room nothing goes in is opened up into the next
// (mergeEmpty), so there are no empty box rooms. Every room has a way in, nothing's narrower than two
// metres, and nothing stands where it can't: no wall cuts a piece of furniture in two or shuts it away from where it's
// used, ends on a window or the door, or hangs over the pictures. The walls are thin ones on the lines between cells
// (world/thin-walls.js), plastered, with a skirting board, a picture rail of trim along the top, and a cased frame
// round each doorway under a header; a lamp hangs in each room (two in a big one). In co-op the host's seed lays out
// everyone's house alike (net/net.js).

const IN = { i0: HX0 + 1, i1: HX1 - 1, j0: HZ0 + 1, j1: HZ1 - 1 };
// how the walls look: how high, the skirting and the trim along the top, a doorway's frame, and their materials (they
// fade away round you where they're between you and the camera: IW_LINES, world/cutaway.js)
const IW = { h: 2.42, base: 0.11, cap: 0.05, head: 2.05, case: 0.075 };
const HOUSE_PLAN = { seed: 0, rooms: [], doors: [], roomOf: new Int16Array(N * N).fill(-1), cols: [], kinds: [], g: new THREE.Group() };
// each room's paint, by what it is: the living room (the one the door opens into), a bedroom, or a small room (a bath,
// a pantry or a closet: six cells or fewer), which has a tiled floor (TILE: its tile colours)
const ROOM_PAINT = { live: [0xd9c9a8, 0xcdb68e, 0xbcc4a2, 0xd6b9a2, 0xc9c0ae], bed: [0xa9b8c6, 0xc4afbf, 0xb4c6a4, 0xd8ccb0, 0x9fb3a6, 0xcbb69a], small: [0xc9dbd6, 0xe2ddcc, 0xa9c2ba, 0xd8d0e0] };
const TILE = [0xe8e2d4, 0xcfdcd6, 0xe2d4c0, 0xd2d6dc];
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
const inPlan = (i, j) => i >= IN.i0 && i <= IN.i1 && j >= IN.j0 && j <= IN.j1 && HOUSE_FP[idx(i, j)] === 1;   // (a room's floor in this run's footprint: world/house.js)
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
  // (and whether there's a room's floor either side of it: there's no wall to put out past the footprint's own)
  const both = (ax, L, u) => ax === 'x' ? inPlan(L - 1, u) && inPlan(L, u) : inPlan(u, L - 1) && inPlan(u, L);
  // a doorway somewhere on the line ax = L from u = a to b: on the one spot that mustn't be wall if there is one (more
  // than one and it can't be done), never with furniture in the way on either side
  const gapOn = (ax, L, a, b) => {
    const must = [], ok = [];
    for (let u = a; u <= b; u++) {
      if (!both(ax, L, u)) continue;
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
      if (!both(ax, L, u)) continue;
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
  const n = span >= 8 && rnd() < 0.45 ? 3 : 2, sz = sizes(span, n), segs = [];
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
  const closets = rnd() < 0.55 ? (rnd() < 0.25 ? 2 : 1) : 0, boxes = [];
  for (let c = 0; c < closets; c++) {
    const w = ri(2, 3), h = ri(2, 3), cx = rnd() < 0.5, cz = rnd() < 0.5;
    const r = [cx ? pub[0] : pub[2] - w + 1, cz ? pub[1] : pub[3] - h + 1, 0, 0]; r[2] = r[0] + w - 1; r[3] = r[1] + h - 1;
    if (w >= pub[2] - pub[0] || h >= pub[3] - pub[1]) continue;   // (the living room keeps a way round it)
    if (HOUSE_DOOR[0] >= r[0] - 1 && HOUSE_DOOR[0] <= r[2] + 1 && HOUSE_DOOR[1] >= r[1] - 1 && HOUSE_DOOR[1] <= r[3] + 1) continue;
    if (boxes.some(b => b[0] <= r[2] + 1 && r[0] <= b[2] + 1 && b[1] <= r[3] + 1 && r[1] <= b[3] + 1)) continue;
    { let out = false; for (let i = r[0] - 1; i <= r[2] + 1; i++) for (let j = r[1] - 1; j <= r[3] + 1; j++) if (!inPlan(i, j) && i >= IN.i0 && i <= IN.i1 && j >= IN.j0 && j <= IN.j1) out = true; if (out) continue; }   // (nor up against where the footprint's notched)
    // its two open sides: one along x (L), one along z, and the doorway on the longer
    const Lx = cx ? r[2] + 1 : r[0], Lz = cz ? r[3] + 1 : r[1], onX = h > w || (h === w && rnd() < 0.5);
    const g = onX ? gapOn('x', Lx, r[1], r[3]) : gapOn('z', Lz, r[0], r[2]); if (g === null) return null;
    if (!run('x', Lx, r[1], r[3], onX ? [g] : []) || !run('z', Lz, r[0], r[2], onX ? [] : [g])) return null;
    boxes.push(r);
  }
  if (!W.size) return null;
  // and every room reached from the front door, and none of it narrower than two metres (each cell in a two by two of
  // its own room)
  const seen = planReach(W);
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) if (inPlan(i, j) && !seen[idx(i, j)]) return null;
  const rm = new Int16Array(N * N).fill(-1); planRooms(W, doors).forEach((cs, r) => cs.forEach(([i, j]) => { rm[idx(i, j)] = r; }));
  const sq = (i, j, r) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => rm[idx(i + a, j + b)] === r);
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) { const r = rm[idx(i, j)]; if (r >= 0 && !(sq(i, j, r) || sq(i - 1, j, r) || sq(i, j - 1, r) || sq(i - 1, j - 1, r))) return null; }
  return { walls: W, doors };
}
// a room with nothing in it (not the living room) opened up into the room beside it, a bedroom or a small room if one
// shares a wall with it (the most wall), else the one its doorway leads to: the walls between the two and the doorways
// through them taken down, and any bit of wall left standing in the middle of a room after (the furniture's all placed
// again after, round the walls that are left). The new walls and doorways, or null if there's no such room. MERGE_MAX:
// how many go in one layout
const MERGE_MAX = 3;
function mergeEmpty(plan, rk, placed) {
  const ro = HOUSE_PLAN.roomOf, used = new Set();
  const sidesIn = (o, k) => { const [ax, i, j] = eDec(k); return ax === 'x' ? [o[idx(i - 1, j)], o[idx(i, j)]] : [o[idx(i, j - 1)], o[idx(i, j)]]; }, sides = k => sidesIn(ro, k);
  for (const c of placed.values()) { for (const [i, j] of c.cells) used.add(ro[idx(i, j)]); if (c.use) used.add(ro[idx(ci(c.use[0]), ci(c.use[1]))]); }
  for (let r = 0; r < rk.rooms.length; r++) {
    if (rk.kinds[r] === 'live' || used.has(r)) continue;
    const d = plan.doors.find(k => sides(k).includes(r)); if (d === undefined) continue;
    const share = new Map(); for (const k of plan.walls) { const [a, b] = sides(k), o = a === r ? b : b === r ? a : -1; if (o >= 0 && o !== r && rk.kinds[o] !== 'live') share.set(o, (share.get(o) || 0) + 1); }
    const r2 = share.size ? [...share].sort((a, b) => b[1] - a[1])[0][0] : sides(d).find(x => x !== r);
    const both = k => { const [a, b] = sides(k); return (a === r && b === r2) || (a === r2 && b === r); };
    const W = new Set([...plan.walls].filter(k => !both(k))), doors = plan.doors.filter(k => !both(k));
    // (what's left with the same room either side of it)
    const o = new Int16Array(N * N).fill(-1); planRooms(W, doors).forEach((cs, n) => cs.forEach(([i, j]) => { o[idx(i, j)] = n; }));
    const lone = k => { const [a, b] = sidesIn(o, k); return a === b; };
    return { walls: new Set([...W].filter(k => !lone(k))), doors: doors.filter(k => !lone(k)) };
  }
  return null;
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
// where the windows go: in the middle of a room's stretch of outside wall (a pair of them side by side across the
// middle of an even one), never under the porch or over a fence or a prop outside; one in each bedroom, one or two in
// the living room, now and then one in a small room, WIN.min to WIN.max in all. Returns the wall cells, and the cells
// inside in front of them (kept clear of furniture: world/furniture.js)
const WIN = { min: 3, max: 6, porch: [19, 23], live2: 0.6, small: 0.5 };
function chooseWindows(rnd, rooms, kinds) {
  const runsOf = cells => {
    const out = [];
    // each way out: the room's cells with an outer wall that way that can take a window (world/house.js: wallForm), in
    // runs along that wall's line, and the wall cell outside each
    for (const [nm, di, dj] of [['N', 0, -1], ['S', 0, 1], ['W', -1, 0], ['E', 1, 0]]) {
      const line = c => di ? c[0] : c[1], u = c => di ? c[1] : c[0], wall = c => [c[0] + di, c[1] + dj];
      const cs = cells.filter(c => { const w = WALL_AT.get(idx(...wall(c))); return w && w.win && w.faces[0] === nm; }).sort((a, b) => line(a) - line(b) || u(a) - u(b));
      for (let s = 0; s < cs.length;) {
        let e = s; while (e + 1 < cs.length && line(cs[e + 1]) === line(cs[s]) && u(cs[e + 1]) === u(cs[e]) + 1) e++;
        const run = cs.slice(s, e + 1), L = run.length; s = e + 1;
        if (L < 3) continue;
        const mid = L % 2 ? [run[(L - 1) >> 1]] : [run[L / 2 - 1], run[L / 2]];
        const ok = mid.every(c => {
          const [wi, wj] = wall(c), oi = wi + di, oj = wj + dj;
          if (nm === 'S' && wi >= WIN.porch[0] && wi <= WIN.porch[1]) return false;
          return inb(oi, oj) && cell[idx(oi, oj)] === EMPTY;
        });
        if (ok) out.push({ side: nm, L, cells: mid, walls: mid.map(wall) });
      }
    }
    return out.sort((a, b) => b.L - a.L || rnd() - 0.5);
  };
  const keys = new Set(), fronts = [], spare = [];
  // (no more than WIN.max window cells in all: a pair counts as two)
  const take = r => { if (keys.size + r.walls.length > WIN.max) return false; for (const w of r.walls) keys.add(idx(w[0], w[1])); fronts.push(...r.cells); return true; };
  rooms.forEach((cells, k) => {
    const runs = runsOf(cells), kind = kinds[k]; if (!runs.length) return;
    if (kind === 'live') { take(runs[0]); const r2 = runs.find(r => r.side !== runs[0].side); if (r2 && rnd() < WIN.live2) take(r2); else if (r2) spare.push(r2); }
    else if (kind === 'bed') { take(runs[0]); spare.push(...runs.slice(1)); }
    else if (cells.length >= 5 && rnd() < WIN.small) take(runs[0]);
    else spare.push(runs[0]);
  });
  for (const r of spare) { if (keys.size >= WIN.min) break; if (r.walls.every(w => !keys.has(idx(w[0], w[1])))) take(r); }
  return { keys, fronts };
}
// the rooms a plan makes: each a list of its cells, flooded out between the walls and their doorways
function planRooms(W, doors) {
  W = new Set([...W, ...doors]);
  const room = new Int16Array(N * N).fill(-1), rooms = [];
  for (let j = IN.j0; j <= IN.j1; j++) for (let i = IN.i0; i <= IN.i1; i++) {
    if (room[idx(i, j)] >= 0 || !inPlan(i, j)) continue;
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
// the walls built, a line at a time (every wall and doorway on one line between cells: IW_LINES). Each line has its
// own materials, carrying its own fade (cut), so a line that stands between you and the camera dithers away round you
// as a whole, the way the outer walls do (world/cutaway.js): a run of plaster a stretch of wall, its skirting on both
// sides, the trim along its top, each face in the paint of the room it faces; round each doorway a header over it, a
// cased frame on both faces and the door itself, hung on one jamb (HOUSE_DOORS: updateDoors)
const IW_LINES = [], IW_MATS = [], IW_BASE = { plaster: 0xd6ccb4, trim: 0x5c4532, base: 0x4a3828 };
const DOOR_COLS = [0x6a4a34, 0xd8d0c0, 0x8a6a4a, 0x4e5a52, 0x7a3a2c];
function buildInWalls(W, doors, rnd) {
  const g = HOUSE_PLAN.g, ro = HOUSE_PLAN.roomOf, cols = HOUSE_PLAN.cols, dc = DOOR_COLS[(rnd() * DOOR_COLS.length) | 0];
  while (g.children.length) { const m = g.children.pop(); m.traverse(o => { if (o.isMesh && o.userData.fine) o.geometry.dispose(); }); }
  IW_MATS.forEach(m => m.dispose()); IW_MATS.length = 0; IW_LINES.length = 0; HOUSE_DOORS.list.length = 0; DOOR_DEBRIS.length = 0;
  const t = THIN.t, H = IW.h;
  // a line's own materials, by colour, each with its fade
  const lines = new Map(), lineOf = (ax, L) => {
    const key = ax + L; let ln = lines.get(key);
    if (!ln) {
      const cut = { value: 0 }, mm = new Map();
      ln = { ax, p: L - HALF, us: [], ds: [], cut, lo: Infinity, hi: -Infinity, mat: hex => { let m = mm.get(hex); if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.cut = cut; lit(m, true); mm.set(hex, m); IW_MATS.push(m); } return m; } };
      lines.set(key, ln); IW_LINES.push(ln);
    }
    return ln;
  };
  for (const k of W) { const [ax, i, j] = eDec(k); lineOf(ax, ax === 'x' ? i : j).us.push(ax === 'x' ? j : i); }
  for (const k of doors) { const [ax, i, j] = eDec(k); lineOf(ax, ax === 'x' ? i : j).ds.push(ax === 'x' ? j : i); }
  const paint = (ln, i, j) => { const r = ro[idx(i, j)]; return ln.mat(r >= 0 ? cols[r] : IW_BASE.plaster); };
  for (const ln of IW_LINES) {
    const { ax } = ln, p = ln.p, add = (w, h, d, mat, x, y, z) => box(g, w, h, d, mat, x, y, z);
    [...ln.us, ...ln.ds].forEach(u => { ln.lo = Math.min(ln.lo, u - HALF); ln.hi = Math.max(ln.hi, u + 1 - HALF); });
    // each face of it in the colour of the room it faces, from the skirting (over a doorway, its casing) up to the trim
    const skins = (u, y0) => {
      const L = ax === 'x' ? ln.p + HALF : 0, c = u + 0.5 - HALF, h = H - IW.cap - y0, y = y0 + h / 2;
      [-1, 1].forEach(sd => {
        const m = ax === 'x' ? paint(ln, sd < 0 ? Math.round(ln.p + HALF) - 1 : Math.round(ln.p + HALF), u) : paint(ln, u, sd < 0 ? Math.round(ln.p + HALF) - 1 : Math.round(ln.p + HALF)), off = p + sd * (t / 2 + 0.002);
        if (ax === 'x') add(0.004, h, 1, m, off, y, c); else add(1, h, 0.004, m, c, y, off);
      });
    };
    ln.us.forEach(u => skins(u, IW.base)); ln.ds.forEach(u => skins(u, IW.head + 0.08));
    // the runs of it, unbroken stretches (no two faces in one plane where pieces meet: the plaster's top tucked up
    // inside the trim, and the walls one way a hair higher and thicker in their trim and skirting than the other)
    const us = ln.us.slice().sort((a, b) => a - b), z = ax === 'z' ? 1 : 0;
    for (let s = 0; s < us.length;) {
      let e = s; while (e + 1 < us.length && us[e + 1] === us[e] + 1) e++;
      const u0 = us[s] - HALF - t / 2, u1 = us[e] + 1 - HALF + t / 2, len = u1 - u0, c = (u0 + u1) / 2;
      const piece = (w, h, d, mat, y) => ax === 'x' ? add(d, h, w, mat, p, y, c) : add(w, h, d, mat, c, y, p);
      piece(len, H - 0.02, t, ln.mat(IW_BASE.plaster), (H - 0.02) / 2);
      piece(len, IW.base + z * 0.003, t + 0.03 + z * 0.004, ln.mat(IW_BASE.base), (IW.base + z * 0.003) / 2);
      piece(len + 0.02, IW.cap, t + 0.04 + z * 0.004, ln.mat(IW_BASE.trim), H + z * 0.003 - IW.cap / 2);
      s = e + 1;
    }
    // its doorways
    for (const u of ln.ds) {
      const c = u + 0.5 - HALF, trim = ln.mat(IW_BASE.trim);
      const piece = (w, h, d, mat, y, off, face) => ax === 'x' ? add(d, h, w, mat, p + (face || 0), y, c + (off || 0)) : add(w, h, d, mat, c + (off || 0), y, p + (face || 0));
      piece(1, H - 0.02 - IW.head, t - 0.004, ln.mat(IW_BASE.plaster), (H - 0.02 + IW.head) / 2);   // the header over it
      piece(1, IW.cap, t + 0.048 + z * 0.004, trim, H + 0.0015 + z * 0.003 - IW.cap / 2);           // the top trim carried across
      [-1, 1].forEach(f => {
        const face = f * (t / 2 + 0.011);
        [-1, 1].forEach(sd => piece(IW.case, IW.head + 0.02, 0.022, trim, (IW.head + 0.02) / 2, sd * (0.5 - IW.case / 2), face));   // side casings
        piece(1, 0.08, 0.022, trim, IW.head + 0.04, 0, face);              // head casing
      });
      [-1, 1].forEach(sd => piece(0.02, IW.head, t + 0.02, trim, IW.head / 2, sd * 0.5));   // the jambs, so you never see into the wall's end
      buildDoor(ln, u, dc, rnd);
    }
  }
  // the small rooms' tiled floors (up off the floorboards' lines, so the two never lie in one plane)
  FLOOR_TILE.fill(0);
  HOUSE_PLAN.rooms.forEach((cs, r) => {
    if (HOUSE_PLAN.kinds[r] !== 'small') return;
    const m = tileMat(HOUSE_PLAN.tile[r]);
    for (const [i, j] of cs) { const f = new THREE.Mesh(TILE_G, m); f.position.set(cxw(i), 0.026, cxw(j)); f.receiveShadow = true; g.add(f); FLOOR_TILE[idx(i, j)] = 1; }
  });
  mergeInto(g, finePieces(g, new Set(HOUSE_DOORS.list.map(d => d.pv))));
}
// a door in the doorway at u along the line ln: a plain four-panel door, its knob on both faces, hung on one jamb (h:
// which) and swinging into the bigger of the rooms either side of it (sw), painted dc
function buildDoor(ln, u, dc, rnd) {
  const ax = ln.ax, L = Math.round(ln.p + HALF), hs = rnd() < 0.5 ? -1 : 1, c = u + 0.5 - HALF;
  const hx = ax === 'x' ? ln.p : c + hs * DOOR.reach, hz = ax === 'x' ? c + hs * DOOR.reach : ln.p;
  const dx = ax === 'x' ? 0 : -hs, dz = ax === 'x' ? -hs : 0, th0 = Math.atan2(-dz, dx);
  // into the bigger room: the side (along the line's own axis) of the room with more cells
  const ro = HOUSE_PLAN.roomOf, size = r => r >= 0 ? HOUSE_PLAN.rooms[r].length : 0;
  const rA = ax === 'x' ? ro[idx(L - 1, u)] : ro[idx(u, L - 1)], rB = ax === 'x' ? ro[idx(L, u)] : ro[idx(u, L)], side = size(rB) >= size(rA) ? 1 : -1;
  const nx = ax === 'x' ? side : 0, nz = ax === 'x' ? 0 : side, sw = Math.sign(-Math.sin(th0) * nx - Math.cos(th0) * nz) || 1;
  const pv = new THREE.Group(); pv.position.set(hx, 0, hz); pv.rotation.y = th0; HOUSE_PLAN.g.add(pv);
  const paint = ln.mat(dc), panel = ln.mat(_dcShade.setHex(dc).multiplyScalar(0.8).getHex()), brass = ln.mat(0xb08a3a), w = DOOR.w;
  // the leaf, built in pieces it can be broken into (DOOR_BITS): an uneven grid of them, every door's its own (the
  // stiles a little wider or narrower, the middle split off centre, each row a little higher or lower), each piece with
  // its share of the leaf, the raised panels on both faces, the knob or a hinge
  const leaf = new THREE.Group(); leaf.position.set(w / 2, DOOR.h / 2 + 0.025, 0); pv.add(leaf);
  const J = DOOR_BITS.jit, jr = a => (rnd() * 2 - 1) * a;
  const xs = [-w / 2, -w / 2 + DOOR_BITS.stile + jr(J.stile), jr(J.mid), w / 2 - DOOR_BITS.stile - jr(J.stile), w / 2];
  const ys = DOOR_BITS.rows.map((y, k, a) => (k > 0 && k < a.length - 1 ? y + jr(J.row) : y) * DOOR.h / 2), bits = [];
  for (let a = 0; a < xs.length - 1; a++) for (let b = 0; b < ys.length - 1; b++) {
    const x0 = xs[a], x1 = xs[a + 1], y0 = ys[b], y1 = ys[b + 1], bg = new THREE.Group(); bg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); leaf.add(bg);
    const part = (pw, ph, pd, mat, px, py, pz) => {
      const l = Math.max(x0, px - pw / 2), r = Math.min(x1, px + pw / 2), lo = Math.max(y0, py - ph / 2), hi = Math.min(y1, py + ph / 2);
      if (r - l > 0.004 && hi - lo > 0.004) box(bg, r - l, hi - lo, pd, mat, (l + r) / 2 - bg.position.x, (lo + hi) / 2 - bg.position.y, pz);
    };
    part(w, DOOR.h, 0.036, paint, 0, 0, 0);
    [-1, 1].forEach(f => [[-0.2, 0.43], [0.2, 0.43], [-0.2, -0.4], [0.2, -0.4]].forEach(([x, y]) => part(0.3, y > 0 ? 0.68 : 0.78, 0.008, panel, x, y, f * 0.022)));
    bits.push({ g: bg, inner: a > 0 && a < xs.length - 2 && b > 0 && b < ys.length - 2, x0, x1, y0, y1 });
  }
  const bitAt = (x, y) => bits.find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  const fit = (m, x, y, z) => { const q = bitAt(x, y); m.position.set(x - q.g.position.x, y - q.g.position.y, z); q.g.add(m); };
  [-1, 1].forEach(f => {
    fit(new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), brass), w / 2 - 0.08, -0.06, f * 0.05);
    fit(new THREE.Mesh(bgeo(0.012, 0.012, 0.03), brass), w / 2 - 0.08, -0.06, f * 0.03);
  });
  [0.6, -0.6].forEach(y => fit(new THREE.Mesh(bgeo(0.03, 0.1, 0.044), brass), -w / 2 + 0.01, y, 0));   // hinges
  for (const q of bits) mergeInto(q.g, finePieces(q.g));
  // the order the middle ones go in as it's beaten, and how beaten it has to be for each (of its hp), all at random
  const order = bits.filter(q => q.inner).map(q => [q, rnd()]).sort((p, q) => p[1] - q[1]).map(p => p[0]);
  const at = order.map(() => DOOR_BITS.first + rnd() * (1 - DOOR_BITS.first) * 0.95).sort((p, q) => p - q);
  const cx = ax === 'x' ? ln.p : c, cz = ax === 'x' ? c : ln.p;
  HOUSE_DOORS.list.push({ ax, i: ax === 'x' ? L : u, j: ax === 'x' ? u : L, cx, cz, x: cx, z: cz, nx, nz, pv, leaf, bits, order, at, out: 0, holed: false, dc, th0, sw, open: 0, t: 0, shut: false, hp: DOOR.hp, jolt: 0, js: 1, broken: false });
}
// how a door's built to break (buildDoor): its stiles (the uprights at either edge, metres) and its rows, as parts of its
// half height from the bottom up, each door's a little off those (jit: the stiles' width and where the middle's split,
// metres; the rows, of the half height). The pieces in the middle are broken out one after another as it's beaten, in
// a random order and each once it's taken its own random share of a beating, the first at least first of its hp
// (doorWear); once DOOR_BITS.see of them are gone there's a hole right through, and you can see, hear and shoot through
// it, though nothing can get through it yet; the stiles and the top and bottom rails go when it gives (breakDoor). Each
// piece breaks off with up to slivers loose splinters of its paint
const DOOR_BITS = { stile: 0.17, rows: [-1, -0.82, -0.4, 0.05, 0.45, 0.82, 1], see: 2, first: 0.08, slivers: 3, jit: { stile: 0.035, mid: 0.11, row: 0.07 } };
const _dcShade = new THREE.Color();
// the doors between the rooms swing open as you or a teammate come up to them (either side) and fall to again a moment
// after you've gone (DOOR: how near, how long it stays open after, how quick it opens and closes, how far round it
// swings, and below how open it counts as shut); one a zombie's standing in (inside DOOR.jam of it) is held open. Shut,
// a door stops sight, shots and sound like a wall (world/thin-walls.js: 2 in the grid), and a zombie: it's open by the
// time you reach it, but a zombie has to beat it down (zombies/ai.js: bashDoor), its hp, which costs the zombies' way
// to you DOOR.cost cells (zombies/pathfinding.js). Each blow jolts it in its frame (jolt: how far it jumps, radians)
// and it's broken up a piece at a time, holes opening in it (doorWear); broken, it comes apart on the floor and it's an
// open doorway for the rest of the run
const DOOR = { near: 1.35, jam: 0.6, hold: 0.9, opens: 7, closes: 2.2, swing: 1.68, shut: 0.25, w: 0.94, h: 2.0, reach: 0.47, hp: 150, cost: 6, jolt: 0.05 };
const HOUSE_DOORS = { list: [], key: '' };
function updateDoors(dt) {
  let key = '';
  const near = (d, x, z) => { const a = x - d.cx, b = z - d.cz; return a * a + b * b < DOOR.near * DOOR.near; };
  for (const d of HOUSE_DOORS.list) {
    if (d.broken) { key += '0'; continue; }
    let by = state === 'play' && !P.dead && near(d, P.x, P.z);
    if (!by && netLink()) for (const p of NET.peers.values()) if (p.av && p.av.g.visible && !p.dead && near(d, p.av.g.position.x, p.av.g.position.z)) { by = true; break; }
    if (!by && d.open > DOOR.shut) for (const z of zombies) if (!z.dead && !z.out && Math.hypot(z.x - d.cx, z.z - d.cz) < DOOR.jam) { by = true; break; }
    d.t = by ? DOOR.hold : Math.max(0, d.t - dt);
    const want = d.t > 0 ? 1 : 0; d.open += (want - d.open) * Math.min(1, dt * (want ? DOOR.opens : DOOR.closes));
    d.jolt = Math.max(0, d.jolt - dt * 7);
    d.pv.rotation.y = d.th0 + d.sw * (smooth(clamp(d.open, 0, 1)) * DOOR.swing + d.js * DOOR.jolt * Math.sin(d.jolt * Math.PI));
    const shut = d.open < DOOR.shut;
    if (shut !== d.shut) { d.shut = shut; doorGrid(d); }
    key += shut ? (d.holed ? '2' : '1') : '0';
  }
  HOUSE_DOORS.key = key;
  stepDebris(DOOR_DEBRIS, dt);   // (the pieces of the broken ones, falling: weapons/casings.js)
}
// which side of a door's line a point's on: 1, the side it swings open into
const doorSide = (d, x, z) => Math.sign((x - d.cx) * d.nx + (z - d.cz) * d.nz) || 1;
// the shut door on the edge between two cells side by side, if there is one
function doorOn(i0, j0, i1, j1) {
  if (!doorBetween(i0, j0, i1, j1) || (i0 !== i1 && j0 !== j1)) return null;
  const ax = i0 !== i1 ? 'x' : 'z', i = ax === 'x' ? Math.max(i0, i1) : i0, j = ax === 'x' ? j0 : Math.max(j0, j1);
  return HOUSE_DOORS.list.find(d => d.ax === ax && d.i === i && d.j === j) || null;
}
// a zombie's blow on a door (z: who; heavy: a brute's): a thump through the house, the door jumping in its frame (in
// from the side it's hit on, or back against its stop) and dust shaken out round it
function doorBlow(d, z, heavy, dme) {
  d.jolt = 1; d.js = doorSide(d, z.x, z.z) < 0 ? 1 : -0.35;
  soundAt(d.cx, d.cz, () => nz(heavy ? 0.16 : 0.09, 'lowpass', heavy ? 420 : 620, heavy ? 90 : 160, (heavy ? 0.42 : 0.24) * clamp(1 - dme / 20, 0, 1)), true);
  if (heavy) shake = Math.max(shake, 0.18 * clamp(1 - dme / 9, 0, 1));
  if (z.vis > 0.2) { const s = doorSide(d, z.x, z.z) * 0.12; burst(d.cx + d.nx * s, rr(0.6, 1.8), d.cz + d.nz * s, heavy ? 4 : 2, 'dust'); if (heavy || rand() < 0.4) burst(d.cx + d.nx * s, rr(0.8, 1.6), d.cz + d.nz * s, 2, 'wood', d.nx * Math.sign(s), d.nz * Math.sign(s), 1.5); }
}
// a door beaten on (its hp gone down): the pieces in the middle of it broken out one by one as it goes, in its own
// order (DOOR_BITS), each splintering off away from whoever's hitting it (z, or null: away from you); past
// DOOR_BITS.see of them it's holed through (3 in the grid shut: world/thin-walls.js)
function doorWear(d, z) {
  if (d.broken) return;
  const worn = 1 - Math.max(0, d.hp) / DOOR.hp;
  while (d.out < d.order.length && worn >= d.at[d.out]) doorBit(d, d.order[d.out++], z, false);
  if (!d.holed && d.out >= DOOR_BITS.see) { d.holed = true; if (d.shut) doorGrid(d); }
}
// a door's edge in the grid: open (0), shut (2), shut but holed through (3)
function doorGrid(d) { const v = d.broken || !d.shut ? 0 : d.holed ? 3 : 2; if (d.ax === 'x') wX[d.j * (N + 1) + d.i] = v; else wZ[d.j * N + d.i] = v; }
// one piece knocked out of a door, onto the floor (DOOR_DEBRIS): out away from whoever hit it, thrown hard (a piece
// beaten out of the middle) or just let drop (fall: the rest of it, as it gives), with splinters and dust
const DOOR_DEBRIS = [], _dbMat = new Map();
// (on the floor, out of the wall's line, a piece doesn't fade with it: world/cutaway.js)
const plainMat = m => { if (!m.userData || !m.userData.cut) return m; const k = m.vertexColors ? 'v' : m.color.getHex(); let p = _dbMat.get(k); if (!p) _dbMat.set(k, p = m.vertexColors ? lamV() : lam(m.color.getHex())); return p; };
function doorBit(d, q, z, fall) {
  if (q.gone) return; q.gone = true;
  const by = z || P, away = -doorSide(d, by.x, by.z), ox = d.nx * away, oz = d.nz * away, g = q.g;
  HOUSE_PLAN.g.attach(g); g.rotation.reorder('YXZ');
  g.traverse(o => { if (o.isMesh) { o.material = plainMat(o.material); o.castShadow = true; } });
  const p = g.position, k = fall ? rr(0.3, 1.1) : rr(1.4, 2.6);
  DOOR_DEBRIS.push({ g, life: 8, vx: ox * k + rr(-0.5, 0.5), vy: fall ? rr(-0.2, 0.6) : rr(0.4, 1.4), vz: oz * k + rr(-0.5, 0.5), spin: rr(-6, 6), roll: rr(-5, 5), r: 0.03, bounces: 0, kind: 'plank', quiet: rand() < 0.6, restY: 0.022,
    rest: o => { o.rotation.set(Math.PI / 2, rr(0, Math.PI * 2), 0); } });
  // and a few splinters of it, long and thin, every one its own size, thrown out with it
  const n = (rand() * (DOOR_BITS.slivers + 1)) | 0, sm = _dbMat.get(d.dc) || (_dbMat.set(d.dc, lam(d.dc)), _dbMat.get(d.dc));
  for (let k = 0; k < n; k++) {
    const sg = new THREE.Group(); sg.rotation.order = 'YXZ'; sg.position.set(p.x + rr(-0.1, 0.1), p.y + rr(-0.15, 0.15), p.z + rr(-0.1, 0.1)); sg.rotation.set(rr(0, 6.3), rr(0, 6.3), rr(0, 6.3));
    const m = box(sg, rr(0.015, 0.04), rr(0.08, 0.32), rr(0.012, 0.03), sm, 0, 0, 0); m.castShadow = false; HOUSE_PLAN.g.add(sg);
    const kk = k * 0.3 + (fall ? rr(0.3, 1) : rr(1.6, 3.2));
    DOOR_DEBRIS.push({ g: sg, life: 8, vx: ox * kk + rr(-0.9, 0.9), vy: rr(0.3, 2), vz: oz * kk + rr(-0.9, 0.9), spin: rr(-14, 14), roll: rr(-12, 12), r: 0.015, bounces: 0, kind: 'plank', quiet: true, restY: 0.012,
      rest: o => { o.rotation.set(Math.PI / 2, rr(0, Math.PI * 2), 0); } });
  }
  burst(p.x, p.y, p.z, fall ? 3 : 6, 'wood', ox, oz, fall ? 1.5 : 3); if (!fall) burst(p.x, p.y, p.z, 3, 'dust');
  if (!fall) soundAt(p.x, p.z, () => SFX.crack());
}
// broken down (z: who broke it, or null): the doorway's open from now on, and what's left of the door comes apart,
// every piece down on the floor
function breakDoor(d, z) {
  if (d.broken) return;
  d.broken = true; d.shut = false; d.hp = 0; doorGrid(d);
  for (const q of d.bits) doorBit(d, q, z, true);
  burst(d.cx, 0.6, d.cz, 10, 'dust');
  soundAt(d.cx, d.cz, () => SFX.crack()); setTimeout(() => soundAt(d.cx, d.cz, () => SFX.crack()), 70); setTimeout(() => soundAt(d.cx, d.cz, () => SFX.thud()), 320);
  if (Math.hypot(P.x - d.cx, P.z - d.cz) < 7) shake = Math.max(shake, 0.12);
  flowDirty = true;
}
// a new house: the plan for this seed (the first that keeps every rule; failing that, none), its walls in the grid
// and built, the lamps hung. live: during a game (rather than as the page loads), so the light, the zombies' ways
// round the house and what you can see are all worked out again for it
function houseLayout(seed, live) {
  const rnd = seeded(seed), ro = HOUSE_PLAN.roomOf;
  houseFootprint(rnd, live);   // (its footprint first: whole, or notched at the back, world/house.js)
  yardLayout(rnd, live);   // (the yard round it first: what's outside a window decides whether one can go there, world/yard.js)
  // its rooms (what each is, and which cells are in which), and the furniture placed in them (world/furniture.js);
  // a plan the furniture won't all go into is passed over for the next
  const roomsOf = (W, doors) => { const rooms = planRooms(W, doors); ro.fill(-1); rooms.forEach((cs, r) => cs.forEach(([i, j]) => { ro[idx(i, j)] = r; })); return { rooms, kinds: rooms.map(cs => cs.some(c => c[0] === HOUSE_DOOR[0] && c[1] === HOUSE_DOOR[1]) ? 'live' : cs.length <= 6 ? 'small' : 'bed') }; };
  let plan = null, rk = null, placed = null, wins = null;
  for (let k = 0; k < 400 && !placed; k++) {
    plan = planHouse(rnd); if (!plan) continue; rk = roomsOf(plan.walls, plan.doors);
    wins = chooseWindows(rnd, rk.rooms, rk.kinds); if (wins.keys.size < WIN.min) { placed = null; continue; }
    placed = placeFurniture(rnd, plan.walls, plan.doors, ro, rk.kinds, wins.fronts);
  }
  // a room nothing went in is opened up into the one it leads to, and the windows and furniture gone over again for the
  // bigger rooms (kept as it was if they won't go)
  for (let m = 0; placed && plan && m < MERGE_MAX; m++) {
    const nx = mergeEmpty(plan, rk, placed); if (!nx) break;
    const rk2 = roomsOf(nx.walls, nx.doors), w2 = chooseWindows(rnd, rk2.rooms, rk2.kinds);
    const p2 = w2.keys.size >= WIN.min && placeFurniture(rnd, nx.walls, nx.doors, ro, rk2.kinds, w2.fronts);
    if (!p2) { roomsOf(plan.walls, plan.doors); break; }
    plan = nx; rk = rk2; wins = w2; placed = p2;
  }
  if (!placed) { plan = null; rk = roomsOf(new Set(), []); wins = chooseWindows(rnd, rk.rooms, rk.kinds); placed = placeFurniture(rnd, new Set(), [], ro, rk.kinds, wins.fronts); }   // (no rooms: an open house)
  // its windows, and whatever hangs on the walls where they've gone taken down
  // (and anything hung on a wall that isn't there this run, or isn't facing the same way)
  setWindows(wins.keys, true); for (const d of WALL_DECOR) { const w = WALL_AT.get(d.k); d.g.visible = !wins.keys.has(d.k) && !!w && w.faces.length === 1 && w.faces[0] === d.dir; }
  HOUSE_PLAN.seed = seed;
  wX.fill(0); wZ.fill(0);
  const W = plan ? plan.walls : new Set();
  for (const k of W) { const [ax, i, j] = eDec(k); if (ax === 'x') wX[j * (N + 1) + i] = 1; else wZ[j * N + i] = 1; }
  THIN.n = W.size; THIN.box = [cxw(HX0) - 0.5, cxw(HZ0) - 0.5, cxw(HX1) + 0.5, cxw(HZ1) + 0.5];
  HOUSE_PLAN.doors = plan ? plan.doors : []; HOUSE_PLAN.rooms = rk.rooms; HOUSE_PLAN.kinds = rk.kinds;
  applyFurniture(placed, rnd);
  // the paint, outside (world/house.js: paintHouse) and in each room, the inside of the outer walls included
  paintHouse(rnd, live);
  const used = new Set();
  HOUSE_PLAN.cols = HOUSE_PLAN.kinds.map(k => { const free = ROOM_PAINT[k].filter(c => !used.has(c)), c = free.length ? free[(rnd() * free.length) | 0] : ROOM_PAINT[k][0]; used.add(c); return c; });
  HOUSE_PLAN.tile = HOUSE_PLAN.kinds.map(() => TILE[(rnd() * TILE.length) | 0]);
  for (const w of walls) for (const [a, b, m] of w.inner) { const r = ro[idx(a, b)]; m.color.setHex(r >= 0 ? HOUSE_PLAN.cols[r] : 0xd6ccb4); }
  buildInWalls(W, HOUSE_PLAN.doors, rnd);
  HANG.length = 0; HOUSE_PLAN.rooms.forEach(r => HANG.push(...roomLamps(r))); hangLamps();
  if (live) { relightHouse(); flowDirty = true; viaF.clear(); visKey = ''; }
}
