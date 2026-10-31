// The arena's farm map: "Harlan Farm", a working farm its people walled in against the dead with whatever they had
// (sheet tin, pallets, doors, wire) and then gave up on. Not the farm the survival game's played on: its own world
// (world/arena.js arenaUp takes the whole of that farm out of the scene while it's up), a big red barn burnt to its
// walls, a machine shed at each end, a farmyard with its silos and wind pumps, a field behind a hedgerow with the
// farmhouse's shell standing in it, and the country round it: a gravel road, the woods, stubble fields. Designed and
// checked in tools/farm-plan.py (reachability, spawn sightlines, lane sightlines, corridors, corner pinches, timings):
//  - each spawn a machine shed at its end, three ways out: north into its corral and south into the field (a rack of
//    parts just inside each, round its far end, so nothing outside sees in), and wide doors east onto the yard with
//    the tractor and its hay wagon parked out in front of them
//  - NORTH, the Barn: close quarters. Roofless (its roof burnt off), stalls along its north wall, hay mows standing in
//    it as islands, its big doors at each end out of each side's corral and a door each side in its south wall into
//    the yard: the flag's north approaches, a mow just inside each so the yard never sees into it
//  - MIDDLE, the Farmyard: the contest. Between the grain silos and the wind pumps, the flag between the two troughs
//  - SOUTH, the Field: the long lane, the rifles'. Bales, a rail fence and culvert pipes for low cover, a hay mow out in
//    it each side, the farmhouse's burnt shell in the very middle off the hedgerow and the corn crib against the south
//    barricade, so it's never seen end to end; a gate in the hedgerow each side, behind the wind pump, is the middle's
//    way south
// No line runs from the barn into the field; the longest anywhere is about 31 m, corner to corner across the field.

import { rand, rr, seeded } from '../core/math.js';
import { lam, lit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';
import { LAMP_ON } from '../lighting/static-lights.js';
import { GLOW_LAYER } from '../effects/post.js';

// its plan, a row a line from north to south (tools/farm-plan.py prints it): # the barricade round it (the barn's own
// wall along its north side), h the barn's walls, m the machine sheds', x a stall's partition, Y a hay mow (big bales
// stacked high), O a grain silo, R a tractor, W a hay wagon (in the corral, a stock trailer), e the hedgerow, u the
// farmhouse's shell and the wind pumps' houses, S a shed's racks, T a diesel tank, C the corn crib (all of those stop
// sight and rounds); y a big bale, f a rail fence, t a water trough, p culvert pipes (seen and shot over, and
// vaulted); A and B each side's spawn, F the spots a free-for-all spawns from
const HF_PLAN = [
  '########h########################h########',
  '#.......h..x...x..........x...x..h.......#',
  '#..F....h..x...x..........x...x..h....F..#',
  '#.......h...F....y.YYYY.y....F...h.......#',
  '#..WW..............YYYY..............WW..#',
  '#..WW......y...YY..YYYY..YY...y......WW..#',
  '#..WW..........YY..YYYY..YY..........WW..#',
  '#..........YYY..............YYY..........#',
  '#.......h..YYY...F......F...YYY..h.......#',
  '#.......h..YYY....x....x....YYY..h.......#',
  '#.......h..YYY....x....x....YYY..h.......#',
  '#mmm...mhhhhhh...hhhhhhhh...hhhhhhm...mmm#',
  '#AA....m..........................m....BB#',
  '#......m.F.....OO........OO.....F.m......#',
  '#..SSSSm.......OO........OO.......mSSSS..#',
  '#......m..RR..................RR..m......#',
  '#.A....m..RR..F............F..RR..m....B.#',
  '#AAA......RR.......tttt.......RR......BBB#',
  '#AAAA.....RR..................RR.....BBBB#',
  '#AAAA.....WW..................WW.....BBBB#',
  '#AAA......WW.y.....tttt.....y.WW......BBB#',
  '#.A....m..WW...uu........uu...WW..m....B.#',
  '#......m..WW...uu........uu...WW..m......#',
  '#..SSSSm..........................mSSSS..#',
  '#......m.F......uuuuuuuuuu......F.m......#',
  '#AA....m.........uuuuuuuu.........m....BB#',
  '#mmm...meeeeeee..uuuuuuuu..eeeeeeem...mmm#',
  '#......TT........uuuuuuuu........TT......#',
  '#..F...TT........uuuuuuuu........TT...F..#',
  '#................uuuuuuuu................#',
  '#.................uuuuuu.................#',
  '#..fffff...YY................YY...fffff..#',
  '#..........YY..pp........pp..YY..........#',
  '#........F.YY................YY.F........#',
  '#..y.......YY....F......F....YY.......y..#',
  '#.................CCCCCC.................#',
  '#..............y..CCCCCC..y..............#',
  '##########################################'
];
// where it stands on the grid (cells, the barricade included): centred on the grid's middle like the others, so the
// flag's in the same place, between the troughs
const HF_B = [1, 3, 42, 40];
const HF_KIND = (i, j) => { const r = HF_PLAN[j - HF_B[1]]; return r ? r[i - HF_B[0]] || '#' : '#'; };
// how tall each kind stands (m), which are low (seen and shot over; all of them vaulted), and what the vault prompt
// calls each (barricades/interactions.js)
const HF_H = { '#': 2.6, h: 4.2, m: 3.4, x: 2.0, Y: 2.6, O: 7.6, R: 2.65, W: 2.5, e: 2.6, u: 3.6, S: 2.3, T: 1.9, C: 3.5, y: 0.88, f: 1.1, t: 0.72, p: 0.92 };
const HF_LOW = new Set(['y', 'f', 't', 'p']);
const HF_WHAT = { y: 'bale', f: 'fence', t: 'trough', p: 'pipes' };
// a plan cell's middle in the world (m), by its column and row in the plan
const hfX = ii => cxw(HF_B[0] + ii), hfZ = jj => cxw(HF_B[1] + jj);
// (the plan's own column and row of a grid cell)
const hfI = i => i - HF_B[0], hfJ = j => j - HF_B[1];

// ---- the look of it
// (what stands taller than you dithered away round you from above when it's between you and the camera, as the trees
// are: core/shaders.js 'tree')
const hfTall = c => lit(new THREE.MeshLambertMaterial({ color: c }), 'tree');
const HF_M = {
  barn: [hfTall(0x7c2f22), hfTall(0x8a3726), hfTall(0x6d2a1f)], barnDk: hfTall(0x4d1f17), char: hfTall(0x1f1b18), trim: hfTall(0xc9bfa8), stone: hfTall(0x7f7a70),
  tin: [hfTall(0x8f9391), hfTall(0x9fa29d), hfTall(0x7f8381)], rust: hfTall(0x7b4a2d), tinDk: hfTall(0x55595a),
  board: [hfTall(0x6f5a43), hfTall(0x86705a), hfTall(0x5e4c3a), hfTall(0xa38c64)], post: hfTall(0x4a3c2e),
  hedge: [hfTall(0x2e4824), hfTall(0x3a5729), hfTall(0x45622f)], bark: hfTall(0x4a3b2c), leaf: [hfTall(0x3d5f2c), hfTall(0x4d6e33), hfTall(0x2f4f26)],
  brick: [hfTall(0x7c4c3c), hfTall(0x6b4134), hfTall(0x86564a)], soot: hfTall(0x2a2421), rubble: hfTall(0x3d3430), plaster: hfTall(0x9b9184),
  hay: [hfTall(0xb59a58), hfTall(0xa48a4c), hfTall(0xc2a763), hfTall(0x9c8f6a)], hayLow: [lam(0xb59a58), lam(0xa48a4c), lam(0xc2a763)], twine: lam(0x5f4f36),
  silo: hfTall(0xa7acae), siloDk: hfTall(0x7b8083), red: hfTall(0x8e2b1f), redDk: hfTall(0x5e1d16), dark: hfTall(0x2a2826), tyre: hfTall(0x1b1a19), rim: hfTall(0xb9a67a), glass: hfTall(0x26302f),
  alu: hfTall(0xa3a6a4), aluDk: hfTall(0x6f7372), corn: hfTall(0xc8952f), tank: hfTall(0x4d5a3a), steel: hfTall(0x5d6163),
  rack: hfTall(0x5d6a72), rackDk: hfTall(0x384046), can: [lam(0xa3342a), lam(0x3f5f34), lam(0x8a7a3a)], tread: lam(0x1d1c1b), crate: lam(0x8a6b45),
  wood: lam(0x6c563f), woodDk: lam(0x4b3b2b), galv: lam(0x9aa1a3), galvDk: lam(0x737a7c), water: lam(0x4a6d6a, { transparent: true, opacity: 0.85 }), pipe: lam(0x9a958b), pipeIn: lam(0x3a3733),
  conc: lam(0x8d8a83), lowBoard: [lam(0x6f5a43), lam(0x86705a), lam(0x5e4c3a)], bag: lam(0x8a7a55),
  pole: lam(0x4f4032), poleTall: hfTall(0x4f4032), lamp: new THREE.MeshBasicMaterial({ color: 0x4a4c4e }), hood: lam(0x3a3d3f),
  rafter: lam(0x231d19), roofTin: lam(0x707472, { side: THREE.DoubleSide }), bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
};
const hfPick = a => a[Math.floor(rand() * a.length)];
// (the same every time for the same two numbers, 0 to 1: what a run of the barricade's made of, how tall it stands)
const hfHash = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };

// ---- the ground: inside the barricade, each part its own (the yard's packed dirt and gravel, the corral's mud, the
// barn's straw, the sheds' concrete, the field's furrows with the irrigation ditch along it, tyre ruts from the sheds),
// drawn over the plan
function hfGroundTex() {
  const cw = HF_PLAN[0].length, ch = HF_PLAN.length, W = 1024, H = Math.round(W * ch / cw), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), px = W / cw, pz = H / ch, rnd = seeded(1931);
  const zone = (i0, j0, i1, j1, col) => { x.fillStyle = col; x.fillRect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz); };
  const both = (i0, j0, i1, j1, col) => { zone(i0, j0, i1, j1, col); zone(cw - i1, j0, cw - i0, j1, col); };
  const blot = (cx, cz, r, col, sy) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.save(); x.translate(cx, cz); x.scale(1, sy || 1); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); };
  x.fillStyle = '#7a6a52'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '70,60,46' : '150,138,116'},${0.2 + rnd() * 0.4})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }   // (the yard's gravel)
  for (let k = 0; k < 40; k++) blot(rnd() * W, rnd() * H, 14 + rnd() * 40, 'rgba(58,48,36,0.25)', 0.5 + rnd());
  // the field: ploughed and left, furrows east to west, stubble standing in them
  both(1, 27, 21, ch - 1, 'rgba(84,66,46,0.95)');
  for (let j = 27.2; j < ch - 1; j += 0.62) { x.fillStyle = 'rgba(52,40,28,0.55)'; x.fillRect(px, j * pz, (cw - 2) * px, 3); x.fillStyle = 'rgba(126,104,76,0.35)'; x.fillRect(px, j * pz + 4, (cw - 2) * px, 2); }
  for (let k = 0; k < 3500; k++) { const sx = px + rnd() * (cw - 2) * px, sz = 27 * pz + rnd() * (ch - 28) * pz; x.fillStyle = `rgba(${rnd() < 0.5 ? '190,164,104' : '150,128,82'},0.7)`; x.fillRect(sx, sz, 1.5, 3 + rnd() * 3); }
  // the irrigation ditch along it, dry but for the odd puddle, grass along its banks
  { const z0 = 33.15 * pz, z1 = 33.85 * pz; x.fillStyle = 'rgba(40,34,26,0.85)'; x.fillRect(px, z0, (cw - 2) * px, z1 - z0); x.fillStyle = 'rgba(62,72,40,0.55)'; x.fillRect(px, z0 - 3, (cw - 2) * px, 3); x.fillRect(px, z1, (cw - 2) * px, 3);
    for (let k = 0; k < 14; k++) blot(px + rnd() * (cw - 2) * px, (z0 + z1) / 2, 8 + rnd() * 18, 'rgba(70,96,104,0.55)', 0.25); }
  // the corrals: mud, trodden into dimples by the stock, puddles
  both(1, 1, 8, 11, 'rgba(84,68,50,0.9)');
  for (let k = 0; k < 500; k++) { const sx = (1 + rnd() * 7) * px, sz = (1 + rnd() * 10) * pz; x.fillStyle = 'rgba(44,34,24,0.45)'; x.beginPath(); x.ellipse(rnd() < 0.5 ? sx : W - sx, sz, 2.5, 1.8, rnd() * 3, 0, 7); x.fill(); }
  for (let k = 0; k < 6; k++) { const sx = (1.5 + rnd() * 6) * px, sz = (1.5 + rnd() * 9) * pz; blot(sx, sz, 10 + rnd() * 14, 'rgba(66,84,92,0.55)', 0.5); blot(W - sx, sz, 10 + rnd() * 14, 'rgba(66,84,92,0.55)', 0.5); }
  // the barn: dirt floor under old straw, darker bedding in the stalls
  zone(9, 1, cw - 9, 11, 'rgba(112,94,64,0.94)');
  both(9, 1, 16, 3, 'rgba(96,78,48,0.6)');
  for (let k = 0; k < 4000; k++) { const sx = 9 * px + rnd() * (cw - 18) * px, sz = pz + rnd() * 10 * pz, a = rnd() * 3.14; x.strokeStyle = `rgba(${rnd() < 0.6 ? '178,156,102' : '140,120,80'},0.6)`; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sz); x.lineTo(sx + Math.cos(a) * 6, sz + Math.sin(a) * 6); x.stroke(); }
  // the machine sheds: a concrete slab, its joints every 2 m, oil where the machines stood
  both(1, 12, 7, 26, 'rgba(140,137,130,0.95)');
  x.strokeStyle = 'rgba(70,68,64,0.6)'; x.lineWidth = 2;
  for (const s of [0, 1]) { const ix = i => s ? W - i * px : i * px;
    for (let i = 1; i <= 7; i += 2) { x.beginPath(); x.moveTo(ix(i), 12 * pz); x.lineTo(ix(i), 26 * pz); x.stroke(); }
    for (let j = 12; j <= 26; j += 2) { x.beginPath(); x.moveTo(ix(1), j * pz); x.lineTo(ix(7), j * pz); x.stroke(); }
    for (let k = 0; k < 8; k++) blot(ix(1.5 + rnd() * 5), (13 + rnd() * 12) * pz, 8 + rnd() * 20, 'rgba(30,28,26,0.4)', 0.5 + rnd() * 0.6); }
  // tyre ruts out of each shed's doors: round the tractor to the barn door, and down to the gate
  x.strokeStyle = 'rgba(52,42,30,0.45)'; x.lineWidth = 5;
  for (const s of [0, 1]) for (const o of [-0.75, 0.75]) { const P = (i, j) => [(s ? cw - i : i) * px, j * pz];
    const a = P(7.5, 18.5 + o), b = P(13, 18.5 + o), c1 = P(15, 15), d = P(15.5 + o, 11.5), e = P(16 + o, 26.5);
    x.beginPath(); x.moveTo(...a); x.bezierCurveTo(...b, ...c1, ...d); x.stroke();
    x.beginPath(); x.moveTo(...a); x.bezierCurveTo(...P(13, 18.5 + o), ...P(14.5, 23.5), ...e); x.stroke(); }
  // the yard's middle trodden bare round the troughs
  blot(W / 2, 19 * pz, 5 * px, 'rgba(150,132,100,0.35)', 0.8);
  for (let k = 0; k < 900; k++) { x.fillStyle = 'rgba(122,106,82,0.5)'; x.fillRect(rnd() * W, rnd() * 11 * pz + 12 * pz, 2 + rnd() * 3, 2 + rnd() * 3); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// a small tiling texture of noise in two colours (the country's grass, its gravel road, its stubble)
function hfNoiseTex(base, a, b, n, rows) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), rnd = seeded(n);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  if (rows) for (let y = 0; y < 256; y += 16) { x.fillStyle = a; x.fillRect(0, y, 256, 5); }
  for (let k = 0; k < n; k++) { x.fillStyle = rnd() < 0.5 ? a : b; x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, rows ? 2 + rnd() * 4 : 1 + rnd() * 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

// ---- building it: each kind's piece (parts: folded into a few meshes by world/arena.js), and its footprint for what
// walks into it, what a round hits and what the eye stops on (cellBox, not the whole cell)
let hP = null, hParts = null, hFp = null;
const hfPush = m => { if (!m.parent) hP.add(m); hParts.push(m); return m; };
const hfBox = (w, h, d, mat, x, y, z) => hfPush(box(hP, w, h, d, mat, x, y, z));
const hfFoot = (x, z, a, b, c, d) => { cellBox[idx(ci(x), ci(z))] = [x - a, z - b, x + c, z + d]; };
const hfMesh = (geo, mat, x, y, z) => { const m = hfPush(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
const hfCyl = (r0, r1, h, mat, x, y, z, seg = 12) => hfMesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z);
const hfBlob = (r, mat, x, y, z, sy = 1) => { const m = hfMesh(new THREE.IcosahedronGeometry(r, 0), mat, x, y, z); m.scale.set(1, sy, 1); m.rotation.y = rand() * 6; return m; };
// a strut from one point to another (a wind pump's legs and braces, a beam): a thin box along the line between them
const _hfA = new THREE.Vector3(), _hfB = new THREE.Vector3(), _hfUp = new THREE.Vector3(0, 1, 0);
function hfStrut(ax, ay, az, bx, by, bz, t, mat) {
  _hfA.set(ax, ay, az); _hfB.set(bx - ax, by - ay, bz - az); const L = _hfB.length();
  const m = hfMesh(new THREE.BoxGeometry(t, L, t), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.quaternion.setFromUnitVectors(_hfUp, _hfB.normalize()); return m;
}
const hfOpen = (i, j) => '.ABF'.includes(HF_KIND(i, j)) || HF_LOW.has(HF_KIND(i, j));
const HF_D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// boards on a face of a cell that's open to the floor beside it: n strips standing just proud of it
function hfStrips(i, j, x, z, H, n, w, mat, y0 = 0) {
  for (const [dx, dz] of HF_D4) {
    if (!hfOpen(i + dx, j + dz)) continue;
    for (let s = 0; s < n; s++) { const o = -0.5 + (s + 0.5) / n; hfBox(dx ? 0.03 : w, H - y0, dz ? 0.03 : w, mat, x + dx * 0.51 + (dz ? o : 0), y0 + (H - y0) / 2, z + dz * 0.51 + (dx ? o : 0)); }
  }
}

// the barricade round it: on the two sides away from the camera from above (north and west) as tall as a man and
// more, sheet tin and plywood and pallets nailed up on posts, sharpened stakes leaning out from its foot; on the two
// toward it (south and east) waist high, pallets and planks with wire mesh over them on posts to the same height, so
// nothing near them is lost behind them (the mesh: hfMesh below), stakes out in front of it too
const hfLowSide = (i, j) => i === HF_B[2] || j === HF_B[3];
function hfBarricade(i, j, x, z) {
  const ii = hfI(i), jj = hfJ(j);
  if (jj === 0 && ii >= 8 && ii <= 33) { hfBarnWall(i, j, x, z); return; }   // (the barn's own north wall)
  const nx = i === HF_B[0] ? 1 : i === HF_B[2] ? -1 : 0, nz = j === HF_B[1] ? 1 : j === HF_B[3] ? -1 : 0;   // (toward the inside)
  // (built in runs of three cells, each run of one stuff and one height, a post at each join)
  const along = nz ? ii : jj, seg = Math.floor(along / 3), side = nz ? (nz > 0 ? 1 : 2) : (nx > 0 ? 3 : 4), hs = hfHash(side, seg), join = along % 3 === 0;
  if (hfLowSide(i, j)) {
    const H = 1.0 + hs * 0.1, m = HF_M.lowBoard[Math.floor(hs * 3)];
    hfBox(1, H, 1, m, x, H / 2, z);
    for (let y = 0.18; y < H; y += 0.24) hfBox(nz ? 1.01 : 0.04, 0.03, nx ? 1.01 : 0.04, HF_M.woodDk, x - nx * 0.5, y, z - nz * 0.5);   // (the pallets' slats, outside)
    if (rand() < 0.3) hfBox(nz ? 0.9 : 0.5, 0.36, nx ? 0.9 : 0.5, HF_M.bag, x + nx * 0.2, H + 0.18, z + nz * 0.2);   // (a sandbag laid along its top)
    if (along % 2 === 0) { const p = hfBox(0.1, 2.7, 0.1, HF_M.pole, x - nx * 0.3, 1.35, z - nz * 0.3); p.rotation.set(rr(-0.03, 0.03), 0, rr(-0.03, 0.03)); }
  } else {
    const H = HF_H['#'] - 0.12 + hs * 0.3, k = Math.floor(hs * 7), m = k < 3 ? HF_M.tin[k] : HF_M.board[k - 3];
    hfBox(1, H, 1, m, x, H / 2, z);
    if (m === HF_M.tin[0] || m === HF_M.tin[1] || m === HF_M.tin[2]) { for (let s = -0.4; s <= 0.41; s += 0.2) hfBox(nz ? 0.04 : 0.025, H - 0.05, nx ? 0.04 : 0.025, HF_M.tinDk, x + nx * 0.505 + (nz ? s : 0), H / 2, z + nz * 0.505 + (nx ? s : 0)); if (rand() < 0.5) hfBox(nz ? 0.5 : 0.02, rr(0.4, 1.2), nx ? 0.5 : 0.02, HF_M.rust, x + nx * 0.51 + (nz ? rr(-0.2, 0.2) : 0), rr(0.3, 1.5), z + nz * 0.51 + (nx ? rr(-0.2, 0.2) : 0)); }
    else for (let y = 0.4; y < H; y += rr(0.45, 0.7)) hfBox(nz ? 1.0 : 0.03, 0.025, nx ? 1.0 : 0.03, HF_M.post, x + nx * 0.505, y, z + nz * 0.505);   // (the boards' joins)
    if (join) hfBox(0.18, H + 0.3, 0.18, HF_M.post, x - (nz ? 0.5 : 0) + nx * 0.42, (H + 0.3) / 2, z - (nx ? 0.5 : 0) + nz * 0.42);   // (a post at each join, inside)
    if (along % 3 === 1) hfStrut(x - nx * 0.56, 1.9, z - nz * 0.56, x - nx * 1.7, 0.02, z - nz * 1.7, 0.1, HF_M.poleTall);   // (a prop holding it up, outside)
  }
  // sharpened stakes leaning out from its foot, outside
  if (!(nx && nz) && rand() < 0.75) for (const o of [-0.25, 0.25]) { const s = hfMesh(new THREE.CylinderGeometry(0.01, 0.06, 1.5, 5), HF_M.wood, 0, 0, 0); s.rotation.set(-nz * 0.8, 0, nx * 0.8); s.position.set(x - nx * 1.0 + (nz ? o + rr(-0.1, 0.1) : 0), 0.55, z - nz * 1.0 + (nx ? o + rr(-0.1, 0.1) : 0)); }
}
// the wire mesh over the low sides (south and east): welded squares, seen through, a strand of barbed wire along its top
function hfWire(g) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(142,146,140,1)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 61, 61); x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 64); x.stroke();
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  const xW = cxw(HF_B[0]), xE = cxw(HF_B[2]), zN = cxw(HF_B[1]), zS = cxw(HF_B[3]), y0 = 1.05, y1 = HF_H['#'] + 0.05;
  for (const [ax, az, bx, bz] of [[xW, zS, xE, zS], [xE, zN, xE, zS]]) {
    const L = Math.hypot(bx - ax, bz - az), m = lam(0xffffff, { map: tx.clone(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.map.repeat.set(L * 3.2, (y1 - y0) * 3.2); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, y1 - y0), m); p.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2); p.rotation.y = az === bz ? 0 : Math.PI / 2; p.castShadow = true; g.add(p);
    for (const y of [y1, y1 + 0.12]) hfBox(az === bz ? L : 0.02, 0.02, az === bz ? 0.02 : L, HF_M.galvDk, (ax + bx) / 2, y, (az + bz) / 2);
    for (let s = 0; s < L; s += 0.35) hfBox(0.08, 0.08, 0.08, HF_M.galvDk, ax + (bx - ax) * s / L, y1 + 0.06, az + (bz - az) * s / L);   // (its barbs)
  }
}
// the barn's walls: weathered red boards on a stone footing, battens down them, burnt off ragged at the top and
// charred black there, white trim round its doors
function hfBarnWall(i, j, x, z) {
  const H = HF_H.h - rr(0, 0.55), ii = hfI(i);
  hfBox(1, 0.45, 1, HF_M.stone, x, 0.225, z);
  hfBox(1, H - 0.7, 1, HF_M.barn[(Math.floor(ii / 3) + j) % 3], x, 0.45 + (H - 0.7) / 2, z);
  hfBox(1, 0.25, 1, HF_M.char, x, H - 0.125, z);
  if (rand() < 0.4) hfBox(rr(0.3, 0.7), rr(0.15, 0.4), 0.3, HF_M.char, x + rr(-0.2, 0.2), H + 0.1, z + rr(-0.3, 0.3));   // (a charred board end standing up)
  hfStrips(i, j, x, z, H - 0.3, 4, 0.05, HF_M.barnDk, 0.45);
}
// a machine shed's walls: corrugated sheet, galvanised or rusted, its ribs proud of it, a dark cap along its top
function hfShedWall(i, j, x, z) {
  const H = HF_H.m, ii = hfI(i), m = HF_M.tin[(Math.floor(ii / 2) + Math.floor(hfJ(j) / 3)) % 3];
  hfBox(1, H, 1, rand() < 0.12 ? HF_M.rust : m, x, H / 2, z);
  hfBox(1.04, 0.1, 1.04, HF_M.tinDk, x, H + 0.05, z);
  hfStrips(i, j, x, z, H, 5, 0.04, HF_M.tinDk);
  if (rand() < 0.2) for (const [dx, dz] of HF_D4) if (hfOpen(i + dx, j + dz)) { hfBox(dx ? 0.02 : rr(0.3, 0.6), rr(0.5, 1.4), dz ? 0.02 : rr(0.3, 0.6), HF_M.rust, x + dx * 0.53, rr(0.4, 1.4), z + dz * 0.53); break; }
}
// a stall's partition: plank boards between two posts, a rail along its top (a thin wall, and that's all its footprint)
function hfStall(i, j, x, z) {
  const alongZ = HF_KIND(i, j - 1) === 'x' || HF_KIND(i, j + 1) === 'x', H = HF_H.x, w = alongZ ? [0.14, 1] : [1, 0.14];
  hfBox(w[0], H, w[1], HF_M.board[2], x, H / 2, z);
  hfBox(alongZ ? 0.2 : 1.02, 0.1, alongZ ? 1.02 : 0.2, HF_M.post, x, H + 0.05, z);
  for (let y = 0.3; y < H; y += 0.3) hfBox(alongZ ? 0.15 : 1.0, 0.02, alongZ ? 1.0 : 0.15, HF_M.post, x, y, z);
  const end = alongZ ? (HF_KIND(i, j + 1) === 'x' ? -1 : 1) : 0, endX = alongZ ? 0 : (HF_KIND(i + 1, j) === 'x' ? -1 : 1);
  hfBox(0.2, H + 0.2, 0.2, HF_M.post, x + endX * 0.42, (H + 0.2) / 2, z + end * 0.42);   // (its post at its open end)
  cellBox[idx(i, j)] = alongZ ? [x - 0.1, z - 0.5, x + 0.1, z + 0.5] : [x - 0.5, z - 0.1, x + 0.5, z + 0.1];
}
// a big square bale: straw going grey where the weather's had it, two strings round it
function hfBaleAt(x, y, z, mat, h, ry) {
  const b = hfBox(0.97, h, 0.97, mat, x, y + h / 2, z); b.rotation.y = ry;
  for (const o of [-0.25, 0.25]) { const s = hfBox(0.99, 0.015, 0.03, HF_M.twine, x + Math.sin(ry) * o, y + h + 0.004, z + Math.cos(ry) * o); s.rotation.y = ry; }
}
// a hay mow: big bales stacked three high (now and then only two), each a little off true
function hfMow(x, z) {
  const n = rand() < 0.22 ? 2 : 3; let y = 0;
  for (let l = 0; l < n; l++) { const h = 0.86 + rr(-0.02, 0.02); hfBaleAt(x + rr(-0.015, 0.015), y, z + rr(-0.015, 0.015), hfPick(HF_M.hay), h, rr(-0.02, 0.02) + (l % 2 ? Math.PI / 2 : 0)); y += h; }
}
// a loose big bale, waist high: what the barn and the yard have for low cover
function hfBale(x, z) { hfBaleAt(x, 0, z, hfPick(HF_M.hayLow), HF_H.y, rr(-0.12, 0.12)); hfFoot(x, z, 0.5, 0.5, 0.5, 0.5); }
// a grain silo: a corrugated steel bin on a concrete ring, its bands, a cone roof with a vent, a ladder up its south
// side and a hatch at its foot (built whole from its north-west cell)
function hfSilo(i, j, x, z) {
  if (HF_KIND(i - 1, j) === 'O' || HF_KIND(i, j - 1) === 'O') return;
  const sx = x + 0.5, sz = z + 0.5, R = 1.0, H = 6.4;
  hfCyl(1.14, 1.16, 0.3, HF_M.conc, sx, 0.15, sz, 20);
  hfCyl(R, R, H, HF_M.silo, sx, 0.3 + H / 2, sz, 22);
  for (let y = 0.9; y < H; y += 0.8) hfCyl(R + 0.02, R + 0.02, 0.06, HF_M.siloDk, sx, 0.3 + y, sz, 22);
  hfMesh(new THREE.ConeGeometry(R + 0.12, 0.85, 22), HF_M.siloDk, sx, 0.3 + H + 0.42, sz);
  hfCyl(0.16, 0.2, 0.3, HF_M.siloDk, sx, 0.3 + H + 0.95, sz, 8);
  for (const o of [-0.2, 0.2]) hfBox(0.04, H + 0.4, 0.04, HF_M.dark, sx + o, 0.3 + (H + 0.4) / 2, sz + R + 0.06);
  for (let y = 0.6; y < H + 0.4; y += 0.32) hfBox(0.4, 0.03, 0.03, HF_M.dark, sx, 0.3 + y, sz + R + 0.06);
  hfBox(0.62, 0.8, 0.06, HF_M.siloDk, sx - 0.5, 0.75, sz + 0.86).rotation.y = -0.5;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cellBox[idx(ci(sx + a * 0.5), ci(sz + b * 0.5))] = [Math.min(sx, sx + a * 0.92), Math.min(sz, sz + b * 0.92), Math.max(sx, sx + a * 0.92), Math.max(sz, sz + b * 0.92)];
}
// a run of one kind's cells (its rectangle), from its north-west cell
function hfRun(i, j, k) {
  let i1 = i, j1 = j; while (HF_KIND(i1 + 1, j) === k) i1++; while (HF_KIND(i, j1 + 1) === k) j1++;
  return { x0: cxw(i) - 0.5, x1: cxw(i1) + 0.5, z0: cxw(j) - 0.5, z1: cxw(j1) + 0.5, i1, j1 };
}
const hfFirst = (i, j, k) => HF_KIND(i - 1, j) !== k && HF_KIND(i, j - 1) !== k;
// the tractor: an old red one, pointed at the barn, its hood and grille, big rear wheels under their fenders, a cab
// with dirty glass, the exhaust stack, the drawbar its wagon's hitched to
function hfTractor(i, j) {
  const r = hfRun(i, j, 'R'), cx = (r.x0 + r.x1) / 2, f = r.z0, b = r.z1;   // (its front north)
  hfBox(0.7, 0.45, b - f - 0.6, HF_M.dark, cx, 0.62, (f + b) / 2);
  hfBox(0.86, 0.78, 2.0, HF_M.red, cx, 1.34, f + 1.15); hfBox(0.9, 0.06, 2.02, HF_M.redDk, cx, 1.74, f + 1.15);
  hfBox(0.78, 0.66, 0.06, HF_M.dark, cx, 1.28, f + 0.14);
  for (let y = 1.05; y < 1.6; y += 0.1) hfBox(0.7, 0.02, 0.07, HF_M.steel, cx, y, f + 0.12);
  for (const s of [-1, 1]) {
    const fw = hfCyl(0.44, 0.44, 0.28, HF_M.tyre, cx + s * 0.62, 0.44, f + 0.75, 14); fw.rotation.z = Math.PI / 2;
    const fh = hfCyl(0.22, 0.22, 0.3, HF_M.rim, cx + s * 0.63, 0.44, f + 0.75, 10); fh.rotation.z = Math.PI / 2;
    const rw = hfCyl(0.8, 0.8, 0.42, HF_M.tyre, cx + s * 0.76, 0.8, b - 1.05, 18); rw.rotation.z = Math.PI / 2;
    const rh = hfCyl(0.44, 0.44, 0.44, HF_M.rim, cx + s * 0.77, 0.8, b - 1.05, 12); rh.rotation.z = Math.PI / 2;
    for (let a = 0; a < 12; a++) { const t = hfBox(0.44, 0.08, 0.16, HF_M.tyre, cx + s * 0.76, 0.8 + Math.sin(a * 0.52) * 0.8, b - 1.05 + Math.cos(a * 0.52) * 0.8); t.rotation.x = -a * 0.52; }   // (the lugs on its tread)
    hfBox(0.5, 0.06, 1.7, HF_M.red, cx + s * 0.76, 1.68, b - 1.05);
    hfBox(0.5, 0.5, 0.06, HF_M.red, cx + s * 0.76, 1.42, b - 1.9).rotation.x = 0.6;
  }
  const c0 = b - 1.75, c1 = b - 0.4;
  hfBox(1.1, 0.5, c1 - c0, HF_M.redDk, cx, 1.55, (c0 + c1) / 2);
  hfBox(1.16, 0.85, c1 - c0, HF_M.glass, cx, 2.2, (c0 + c1) / 2);
  for (const s of [-1, 1]) for (const e of [c0, c1]) hfBox(0.07, 0.9, 0.07, HF_M.dark, cx + s * 0.56, 2.2, e);
  hfBox(1.3, 0.1, c1 - c0 + 0.2, HF_M.red, cx, 2.67, (c0 + c1) / 2);
  hfCyl(0.05, 0.05, 1.1, HF_M.dark, cx + 0.28, 2.15, f + 0.5, 6);
  hfBox(0.14, 0.1, 0.5, HF_M.dark, cx, 0.5, b - 0.2);
  for (let k = 0; k < 4; k++) hfBox(rr(0.15, 0.35), 0.02, rr(0.2, 0.5), HF_M.rust, cx + rr(-0.3, 0.3), 1.775, f + rr(0.4, 1.9));
  for (let jj = r.z0 + 0.5; jj < r.z1; jj++) { const front = jj < f + 2; cellBox[idx(ci(r.x0 + 0.5), ci(jj))] = [cx - (front ? 0.78 : 1.0), jj - 0.5, cx, jj + 0.5]; cellBox[idx(ci(r.x1 - 0.5), ci(jj))] = [cx, jj - 0.5, cx + (front ? 0.78 : 1.0), jj + 0.5]; }
}
// a hay wagon, its flat bed loaded with big bales two high (a few gone off the top), its tongue to the tractor's
// drawbar; or, in a corral, a stock trailer: an aluminium box with slots along its sides, its gate at the back
function hfWagon(i, j) {
  const r = hfRun(i, j, 'W'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, L = r.z1 - r.z0;
  if (hfJ(j) <= 10) {
    hfBox(1.9, 1.85, L - 0.4, HF_M.alu, cx, 0.4 + 0.925, cz + 0.15); hfBox(1.94, 0.06, L - 0.36, HF_M.aluDk, cx, 2.28, cz + 0.15);
    for (const s of [-1, 1]) { for (const y of [1.5, 1.75, 2.0]) hfBox(0.02, 0.08, L - 0.8, HF_M.dark, cx + s * 0.955, y, cz + 0.15); for (const e of [r.z0 + 0.95, r.z1 - 0.8]) { const w = hfCyl(0.34, 0.34, 0.2, HF_M.tyre, cx + s * 0.8, 0.34, e, 12); w.rotation.z = Math.PI / 2; } hfBox(0.3, 0.06, 0.9, HF_M.aluDk, cx + s * 0.8, 0.78, r.z0 + 0.95); }
    hfBox(1.6, 1.6, 0.05, HF_M.aluDk, cx, 1.25, r.z1 - 0.02);
    hfBox(0.12, 0.12, 0.5, HF_M.dark, cx, 0.45, r.z0 + 0.25);
    for (let k = 0; k < 3; k++) hfBox(0.02, rr(0.3, 0.7), rr(0.3, 0.8), HF_M.rust, cx + (rand() < 0.5 ? -0.96 : 0.96), rr(0.6, 1.2), cz + rr(-1, 1));
  } else {
    hfBox(1.96, 0.12, L - 0.1, HF_M.board[0], cx, 0.95, cz); hfBox(1.5, 0.3, L - 0.6, HF_M.dark, cx, 0.72, cz);
    for (const s of [-1, 1]) { hfBox(0.06, 0.3, L - 0.1, HF_M.board[2], cx + s * 0.95, 1.16, cz); for (const e of [r.z0 + 0.6, r.z1 - 0.6]) { const w = hfCyl(0.38, 0.38, 0.2, HF_M.tyre, cx + s * 0.82, 0.38, e, 12); w.rotation.z = Math.PI / 2; } }
    hfBox(0.08, 0.08, 0.7, HF_M.dark, cx, 0.5, r.z0 - 0.1);
    for (let l = 0; l < 2; l++) for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      if (l === 1 && rand() < 0.3) continue;
      const b = hfBox(0.94, 0.8, 1.26, hfPick(HF_M.hay), cx + s * 0.49 + rr(-0.02, 0.02), 1.01 + l * 0.8 + 0.4, r.z0 + 0.7 + a * 1.3 + rr(-0.03, 0.03)); b.rotation.y = rr(-0.03, 0.03);
    }
  }
}
// the hedgerow: hawthorn grown thick, its top uneven, a tree grown up out of it here and there, a stout post at either
// side of each gate and the gate itself swung back flat against it
function hfHedge(i, j, x, z) {
  const H = HF_H.e - 0.3 + rr(-0.1, 0.25), ii = hfI(i);
  hfBox(1, H, 1, hfPick(HF_M.hedge), x, H / 2, z);
  for (let k = 0; k < 2; k++) hfBlob(rr(0.42, 0.56), hfPick(HF_M.hedge), x + rr(-0.25, 0.25), H + rr(-0.1, 0.05), z + rr(-0.2, 0.2), rr(0.6, 0.9));
  for (const [dx, dz] of [[0, 1], [0, -1]]) if (rand() < 0.5) hfBlob(rr(0.25, 0.35), hfPick(HF_M.hedge), x + rr(-0.3, 0.3), rr(0.5, H - 0.4), z + dz * 0.45, 0.8);
  if (ii % 7 === 3) { hfCyl(0.12, 0.16, 4.2, HF_M.bark, x, 2.1, z, 7); for (let k = 0; k < 3; k++) hfBlob(rr(0.9, 1.3), hfPick(HF_M.leaf), x + rr(-0.5, 0.5), rr(3.8, 4.8), z + rr(-0.5, 0.5), 0.8); }
  for (const d of [-1, 1]) if (HF_KIND(i + d, j) === '.') {
    hfBox(0.22, 1.7, 0.22, HF_M.poleTall, x + d * 0.38, 0.85, z);
    if (HF_KIND(i + 2 * d, j) === '.') { const gx = x - d * 1.0; for (let y = 0.25; y < 1.2; y += 0.22) hfBox(1.8, 0.04, 0.04, HF_M.galv, gx, y, z + 0.56); for (const e of [-0.9, 0.9]) hfBox(0.05, 1.1, 0.05, HF_M.galv, gx + e, 0.6, z + 0.56); hfStrut(gx - 0.9, 0.25, z + 0.56, gx + 0.9, 1.15, z + 0.56, 0.035, HF_M.galv); }
  }
}
// the farmhouse's shell: brick on a stone footing, burnt out, its top ragged, its windows and door boarded over (as
// they were when it still stood), the rooms inside heaped with what fell in, a chimney stack at each end, the porch
// along its south side boarded up all round, its roof sagged onto the boards; and each wind pump's house (hfPump)
function hfRuin(i, j, x, z) {
  const ii = hfI(i), jj = hfJ(j);
  if (jj <= 22) { if (hfFirst(i, j, 'u')) hfPump(i, j); return; }
  if (jj === 24 && (ii === 16 || ii === 25)) {   // a chimney stack
    hfBox(1, 0.5, 1, HF_M.stone, x, 0.25, z); hfBox(0.96, 5.7, 0.96, HF_M.brick[1], x, 3.35, z); hfBox(1.04, 0.2, 1.04, HF_M.soot, x, 6.2, z);
    for (const o of [-0.22, 0.22]) hfBox(0.26, 0.4, 0.26, HF_M.soot, x + o, 6.5, z);
    return;
  }
  const edge = HF_D4.some(([dx, dz]) => HF_KIND(i + dx, j + dz) !== 'u'), porch = jj === 30;
  if (porch) {   // (the porch: boarded up to its sagged roof)
    hfBox(1, 0.3, 1, HF_M.stone, x, 0.15, z);
    hfBox(0.96, 1.95, 0.96, HF_M.board[(ii + jj) % 4], x, 1.12, z);
    for (let y = 0.5; y < 2; y += 0.28) hfBox(1.0, 0.025, 1.0, HF_M.post, x, y, z);
    const rf = hfBox(1.04, 0.08, 1.4, HF_M.soot, x, 2.45, z - 0.1); rf.rotation.x = 0.5 + rr(-0.05, 0.05); rf.rotation.z = rr(-0.06, 0.06);
    if (HF_KIND(i - 1, j) !== 'u' || HF_KIND(i + 1, j) !== 'u') hfBox(0.16, 2.3, 0.16, HF_M.post, x + (HF_KIND(i - 1, j) !== 'u' ? -0.42 : 0.42), 1.15, z + 0.42);
    return;
  }
  if (!edge) {   // (inside: the rubble heaped where the floors fell, charred beams through it)
    for (let k = 0; k < 3; k++) hfBlob(rr(0.55, 0.8), rand() < 0.5 ? HF_M.rubble : HF_M.soot, x + rr(-0.3, 0.3), rr(0.4, 1.0), z + rr(-0.3, 0.3), rr(0.6, 0.9));
    if (rand() < 0.35) hfBlob(rr(0.3, 0.45), hfPick(HF_M.brick), x + rr(-0.3, 0.3), rr(1.0, 1.4), z + rr(-0.3, 0.3), 0.7);
    if (rand() < 0.4) { const a = rand() * 6; hfStrut(x - Math.cos(a) * 0.8, 0.6, z - Math.sin(a) * 0.8, x + Math.cos(a) * 0.9, rr(2.0, 3.2), z + Math.sin(a) * 0.9, 0.16, HF_M.char); }
    return;
  }
  // a stretch of its outer wall: taller toward its gables (east and west) and its corners, broken off lower between
  // (the gables, east and west, standing to a point; the long walls along north and south fallen in toward their
  // middles; the corners standing tallest)
  const gable = ii === 17 || ii === 24, corner = HF_D4.filter(([dx, dz]) => HF_KIND(i + dx, j + dz) !== 'u').length > 1;
  const H = gable ? 3.6 + 1.5 * Math.max(0, 1 - Math.abs(jj - 26.5) / 3) : corner ? 4.4 : 3.6 - 1.2 * Math.exp(-Math.pow((Math.abs(ii - 20.5) - 1) / 1.4, 2)) + 0.15 * Math.sin(ii * 2.1);
  hfBox(1, 0.55, 1, HF_M.stone, x, 0.275, z);
  hfBox(1, H - 0.55, 1, rand() < 0.15 ? HF_M.brick[1] : HF_M.brick[0], x, 0.55 + (H - 0.55) / 2, z);
  hfBox(1.02, 0.12, 1.02, HF_M.stone, x, 2.9, z);   // (the course between its floors)
  for (const [dx, dz] of HF_D4) {
    if (HF_KIND(i + dx, j + dz) === 'u') continue;
    const fx = x + dx * 0.505, fz = z + dz * 0.505, along = (dx ? jj : ii);
    hfBox(dx ? 0.02 : 1, rr(0.6, 1.4), dz ? 0.02 : 1, HF_M.soot, fx, H - 0.4, fz);   // (soot up its face from the fire)
    if (along % 2 === 0 && !corner) {   // a window, boarded
      hfBox(dx ? 0.03 : 0.72, 1.0, dz ? 0.03 : 0.72, HF_M.soot, fx, 1.55, fz);
      for (let b = 0; b < 3; b++) { const p = hfBox(dx ? 0.05 : 0.86, 0.16, dz ? 0.05 : 0.86, hfPick(HF_M.board), fx + dx * 0.02, 1.2 + b * 0.33, fz + dz * 0.02); p.rotation[dx ? 'x' : 'z'] = rr(-0.15, 0.15); }
      hfBox(dx ? 0.06 : 0.9, 0.08, dz ? 0.06 : 0.9, HF_M.stone, fx + dx * 0.03, 1.0, fz + dz * 0.03);
    }
  }
}
// a wind pump's house: a brick hut under a pent tin roof, its door toward the yard, and over it the wind pump, a
// lattice tower of four legs and its braces up to the wheel of blades and the tail vane that turns it to the wind
function hfPump(i, j) {
  const r = hfRun(i, j, 'u'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0, H = 2.5;
  hfBox(w, 0.4, d, HF_M.stone, cx, 0.2, cz); hfBox(w - 0.04, H - 0.4, d - 0.04, HF_M.brick[2], cx, 0.4 + (H - 0.4) / 2, cz);
  const rf = hfBox(w + 0.3, 0.07, d + 0.3, HF_M.tinDk, cx, H + 0.12, cz); rf.rotation.x = -0.08;
  hfBox(0.8, 1.7, 0.04, HF_M.board[2], cx, 0.85 + 0.1, r.z0 - 0.01);
  for (const o of [-0.3, 0, 0.3]) hfBox(0.06, 1.6, 0.05, HF_M.post, cx + o, 0.95, r.z0 - 0.02);
  const top = 9.4, base = H + 0.15, L = [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]];
  for (const [a, b] of L) hfStrut(cx + a, base, cz + b, cx + a * 0.18, top, cz + b * 0.18, 0.08, HF_M.poleTall);
  for (const y of [4.2, 6.1, 7.9]) { const k = 1 - (y - base) / (top - base) * 0.82; for (let n = 0; n < 4; n++) { const [a, b] = L[[0, 1, 3, 2][n]], [c, e] = L[[1, 3, 2, 0][n]]; hfStrut(cx + a * k, y, cz + b * k, cx + c * k, y, cz + e * k, 0.04, HF_M.poleTall); } }
  hfBox(0.6, 0.06, 0.6, HF_M.poleTall, cx, top, cz);
  // its wheel, toward the south-west, and its tail
  const g = new THREE.Group(); g.position.set(cx, top + 0.5, cz); g.rotation.y = Math.PI * 0.8 + rr(-0.2, 0.2); hP.add(g);
  const blade = (a) => { const m = hfPush(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.05, 0.02), HF_M.tin[1])); m.castShadow = true; m.position.set(Math.sin(a) * 0.75, Math.cos(a) * 0.75, 0.3); m.rotation.set(0, 0.35, -a); g.add(m); };
  for (let n = 0; n < 16; n++) blade(n * Math.PI / 8);
  const hub = hfPush(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10), HF_M.dark)); hub.rotation.x = Math.PI / 2; hub.position.z = 0.3; g.add(hub);
  for (const rr2 of [0.3, 1.25]) { const ring = hfPush(new THREE.Mesh(new THREE.TorusGeometry(rr2, 0.025, 4, 20), HF_M.dark)); ring.position.z = 0.3; g.add(ring); }
  const boom = hfPush(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), HF_M.dark)); boom.position.z = -0.6; g.add(boom);
  const vane = hfPush(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.7, 1.1), HF_M.tin[0])); vane.position.set(0, 0.1, -1.3); g.add(vane);
}
// a shed's racks: steel shelving, four shelves of what a farm keeps: jerry cans, oil, tyres, crates of parts
function hfRack(i, j, x, z) {
  const H = HF_H.S, alongX = HF_KIND(i - 1, j) === 'S' || HF_KIND(i + 1, j) === 'S';
  for (const sx of [-0.46, 0.46]) for (const sz of [-0.4, 0.4]) hfBox(0.06, H, 0.06, HF_M.rackDk, x + (alongX ? sx : sz), H / 2, z + (alongX ? sz : sx));
  for (let s = 0; s < 4; s++) {
    const y = 0.1 + s * 0.6; hfBox(alongX ? 1 : 0.86, 0.04, alongX ? 0.86 : 1, HF_M.rack, x, y, z);
    for (let n = 0; n < 3; n++) { const o = -0.32 + n * 0.32, px = x + (alongX ? o : rr(-0.08, 0.08)), pz = z + (alongX ? rr(-0.08, 0.08) : o), q = rand();
      if (q < 0.35) hfBox(0.2, 0.34, 0.36, hfPick(HF_M.can), px, y + 0.19, pz);
      else if (q < 0.55) { const t = hfCyl(0.27, 0.27, 0.2, HF_M.tread, px, y + 0.3, pz, 12); t.rotation[alongX ? 'x' : 'z'] = Math.PI / 2; }
      else if (q < 0.85) hfBox(rr(0.24, 0.3), rr(0.2, 0.4), rr(0.3, 0.55), HF_M.crate, px, y + 0.02 + 0.15, pz); }
  }
}
// the diesel tank by each shed's south door: a green drum of a tank on its cradles, its filler and its hand pump
function hfTank(i, j) {
  const r = hfRun(i, j, 'T'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const t = hfCyl(0.8, 0.8, 1.9, HF_M.tank, cx, 1.1, cz, 18); t.rotation.x = Math.PI / 2;
  for (const e of [-0.95, 0.95]) { const c = hfCyl(0.8, 0.8, 0.04, HF_M.steel, cx, 1.1, cz + e, 18); c.rotation.x = Math.PI / 2; }
  for (const o of [-0.6, 0.6]) hfBox(1.4, 0.42, 0.18, HF_M.steel, cx, 0.21, cz + o);
  hfCyl(0.1, 0.1, 0.2, HF_M.dark, cx, 1.95, cz - 0.4, 8); hfBox(0.16, 0.5, 0.16, HF_M.red, cx + 0.3, 2.1, cz + 0.4);
  hfStrut(cx + 0.3, 2.2, cz + 0.4, cx + 0.85, 0.5, cz + 0.7, 0.04, HF_M.dark);
  for (let jj = r.z0 + 0.5; jj < r.z1; jj++) { cellBox[idx(ci(r.x0 + 0.5), ci(jj))] = [cx - 0.8, jj - 0.5, cx, jj + 0.5]; cellBox[idx(ci(r.x1 - 0.5), ci(jj))] = [cx, jj - 0.5, cx + 0.8, jj + 0.5]; }
}
// the corn crib: a long slatted crib on concrete piers, last year's corn still in it gold behind the slats, a tin roof
function hfCrib(i, j) {
  const r = hfRun(i, j, 'C'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, L = r.x1 - r.x0, D = r.z1 - r.z0, E = 2.65;
  for (let x = r.x0 + 0.4; x < r.x1; x += (L - 0.8) / 4) for (const o of [-0.7, 0.7]) hfBox(0.3, 0.3, 0.3, HF_M.conc, x, 0.15, cz + o);
  hfBox(L - 0.1, 0.1, D - 0.1, HF_M.board[2], cx, 0.35, cz);
  hfBox(L - 0.2, E - 0.4, D - 0.2, HF_M.corn, cx, 0.4 + (E - 0.4) / 2, cz);
  for (let y = 0.5; y < E; y += 0.24) { hfBox(L, 0.11, 0.03, HF_M.board[1], cx, y, r.z0 + 0.04); hfBox(L, 0.11, 0.03, HF_M.board[1], cx, y, r.z1 - 0.04); hfBox(0.03, 0.11, D, HF_M.board[1], r.x0 + 0.04, y, cz); hfBox(0.03, 0.11, D, HF_M.board[1], r.x1 - 0.04, y, cz); }
  for (const x of [r.x0 + 0.08, cx - L / 4, cx + L / 4, r.x1 - 0.08]) for (const z of [r.z0 + 0.08, r.z1 - 0.08]) hfBox(0.15, E, 0.15, HF_M.post, x, E / 2 + 0.05, z);
  const sh = new THREE.Shape(); sh.moveTo(-D / 2 - 0.05, 0); sh.lineTo(D / 2 + 0.05, 0); sh.lineTo(0, 0.9); sh.lineTo(-D / 2 - 0.05, 0);
  const pr = hfMesh(new THREE.ExtrudeGeometry(sh, { depth: L - 0.05, bevelEnabled: false }), HF_M.board[2], r.x0 + 0.025, E, cz); pr.rotation.y = Math.PI / 2;
  const a = Math.atan2(0.9, D / 2 + 0.05), sl = Math.hypot(0.9, D / 2 + 0.05);
  for (const s of [-1, 1]) { const p = hfBox(L + 0.4, 0.04, sl + 0.25, HF_M.tinDk, cx, E + 0.45 + 0.03, cz + s * (D / 4 + 0.08)); p.rotation.x = s * a; }
  hfBox(L + 0.4, 0.08, 0.14, HF_M.rust, cx, E + 0.95, cz);
}
// a rail fence: posts at each metre, three rails, one hanging off
function hfFence(i, j, x, z) {
  for (const e of HF_KIND(i + 1, j) === 'f' ? [-0.5] : [-0.5, 0.5]) hfBox(0.13, 1.15, 0.13, HF_M.woodDk, x + e, 0.575, z);
  for (const y of [0.36, 0.7, 1.02]) { const b = hfBox(1.0, 0.09, 0.05, HF_M.wood, x, y + rr(-0.02, 0.02), z + 0.05); b.rotation.z = rr(-0.03, 0.03); if (y > 1 && rand() < 0.25) { b.rotation.z = 0.5; b.position.y = 0.75; } }
  cellBox[idx(i, j)] = [x - 0.5, z - 0.1, x + 0.5, z + 0.12];
}
// a water trough: a galvanised stock tank with round ends, water in it (one tank over its run, built from its west end)
function hfTrough(i, j, x, z) {
  if (HF_KIND(i - 1, j) === 't') return;
  let n = 1; while (HF_KIND(i + n, j) === 't') n++;
  const cx = x + (n - 1) / 2, H = HF_H.t, w = 0.82;
  hfBox(n - w, H, w, HF_M.galv, cx, H / 2, z);
  for (const s of [-1, 1]) hfCyl(w / 2, w / 2, H, HF_M.galv, cx + s * (n - w) / 2, H / 2, z, 14);
  hfBox(n - w + 0.04, 0.05, w + 0.04, HF_M.galvDk, cx, H - 0.02, z);
  for (let k = 0; k < n - 1; k += 0.5) hfBox(0.04, H - 0.1, w + 0.02, HF_M.galvDk, cx - (n - w) / 2 + 0.2 + k, H / 2, z);
  const wt = hfPush(new THREE.Mesh(new THREE.PlaneGeometry(n - 0.12, w - 0.1), HF_M.water)); wt.rotation.x = -Math.PI / 2; wt.position.set(cx, H - 0.1, z); wt.receiveShadow = true;
  for (let k = 0; k < n; k++) cellBox[idx(i + k, j)] = [x + k - 0.5, z - 0.43, x + k + 0.5, z + 0.43];
}
// culvert pipes waiting to go in under the ditch: a concrete pipe lying along it, hollow
function hfPipe(x, z) {
  const p = hfCyl(0.46, 0.46, 0.96, HF_M.pipe, x, 0.46, z, 16); p.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const e = hfMesh(new THREE.CircleGeometry(0.36, 14), HF_M.pipeIn, x + s * 0.485, 0.46, z); e.rotation.y = s * Math.PI / 2; }
  hfFoot(x, z, 0.5, 0.47, 0.5, 0.47);
}

// ---- seen only from your own eyes (from above you look in through where they'd be): the sheds' tin roofs on their
// purlins, and the barn's last charred rafters; shown as the first-person view is up
function hfOverhead(g) {
  const c = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); c.add(m); return m; };
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? hfX(0) - 0.5 : hfX(34) - 0.5, x1 = s < 0 ? hfX(7) + 0.5 : hfX(41) + 0.5, z0 = hfZ(11) - 0.5, z1 = hfZ(26) + 0.5, Y = HF_H.m + 0.1;
    const r = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), HF_M.roofTin, (x0 + x1) / 2, Y, (z0 + z1) / 2); r.rotation.x = Math.PI / 2;
    for (let z = z0 + 1; z < z1; z += 1.8) add(new THREE.BoxGeometry(x1 - x0, 0.12, 0.08), HF_M.rafter, (x0 + x1) / 2, Y - 0.08, z);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), HF_M.bulb, s * Math.abs(hfX(3.5)), Y - 0.5, hfZ(18.5));
  }
  const bz0 = hfZ(0), bz1 = hfZ(11), Y = HF_H.h - 0.35;
  for (let ii = 10; ii <= 31; ii += 3) { if (rand() < 0.3) continue; const b = add(new THREE.BoxGeometry(0.22, 0.28, bz1 - bz0 - 0.4), HF_M.rafter, hfX(ii), Y, (bz0 + bz1) / 2); b.rotation.z = rr(-0.05, 0.05); }
  add(new THREE.BoxGeometry(hfX(32) - hfX(9), 0.3, 0.26), HF_M.rafter, 0, Y + 0.3, (bz0 + bz1) / 2);
  c.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); c.visible = false; g.add(c); hFp = c;
}
function hfTick() { if (hFp) hFp.visible = fpOn(); }

// ---- its lamps: the farm's yard lights on the barn and the sheds and up the wind pumps, on poles in the hedgerow,
// and work lamps on the barn's north wall: [where the light falls (plan column, row), where the lamp is (column, row,
// height), which way it faces (radians: 0 south), its reach (m), its colour and strength]; each but those on the middle
// line has its mirror on the east. Only lit at night (lighting/lightmap.js LAMP_ON)
const HF_SODIUM = [1, 0.7, 0.4], HF_WORK = [1, 0.86, 0.66];
const HF_LAMPS = [
  [12.5, 2.6, 12.5, 0.62, 3.4, 0, 7.5, HF_WORK, 0.8], [17, 2.6, 17, 0.62, 3.4, 0, 7.5, HF_WORK, 0.8], [15, 9, 15, 10.38, 3.2, Math.PI, 6.5, HF_WORK, 0.75],
  [5, 3.5, 7.45, 2.5, 3.6, -Math.PI / 2, 9, HF_SODIUM, 0.85],
  [11, 13.5, 11, 11.55, 3.8, 0, 11, HF_SODIUM, 0.9], [20.5, 13.5, 20.5, 11.55, 3.8, 0, 11, HF_SODIUM, 0.9],
  [9, 18.5, 7.55, 15.5, 3.1, Math.PI / 2, 9, HF_SODIUM, 0.85],
  [16, 19.2, 15.5, 20.45, 2.3, Math.PI, 8, HF_SODIUM, 0.85],
  [9, 24.5, 9, 26, 4.6, Math.PI, 10, HF_SODIUM, 0.85], [9, 28.5, 9, 26, 4.6, 0, 10, HF_SODIUM, 0.85],
  [20.5, 33.2, 20.5, 34.45, 2.6, Math.PI, 10, HF_SODIUM, 0.85],
  [3, 28.5, 3, 26.55, 3.0, 0, 9, HF_SODIUM, 0.8],
  [3.5, 18.5, null, 0, 0, 0, 7, [1, 0.8, 0.55], 0.75]
];
const hfLampList = () => HF_LAMPS.flatMap(L => L[0] === 20.5 ? [L] : [L, [40 - L[0] + 1, L[1], L[2] === null ? null : 40 - L[2] + 1, L[3], L[4], -L[5], ...L.slice(6)]]);
// (the lamps' faces and halos lit only as far as they're on: dark glass by day, sodium orange at night)
const _hfOff = new THREE.Color(0x4a4c4e), _hfOn = new THREE.Color(0xffd29a);
function hfLampLit() { const k = LAMP_ON.k; HF_HALO.opacity = 0.75 * k; HF_M.lamp.color.copy(_hfOff).lerp(_hfOn, k); }
const HF_HALO = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,226,180,0.9)'); g.addColorStop(0.25, 'rgba(255,200,130,0.35)'); g.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
function hfLamps(g) {
  for (const [, , hi, hj, hy, yaw] of hfLampList()) {
    if (hi === null) continue;
    const x = hfX(hi), z = hfZ(hj), hd = new THREE.Group(); hd.position.set(x, hy, z); hd.rotation.order = 'YXZ'; hd.rotation.y = yaw; hd.rotation.x = 0.55; g.add(hd);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 10, 1, true), HF_M.hood); hood.rotation.x = -Math.PI / 2; hood.position.z = 0.02; hd.add(hood);
    box(hd, 0.05, 0.05, 0.4, HF_M.hood, 0, 0.04, -0.22);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), HF_M.lamp); face.position.z = 0.1; face.layers.enable(GLOW_LAYER); hd.add(face);
    const halo = new THREE.Sprite(HF_HALO); halo.scale.setScalar(1.5); halo.onBeforeRender = hfLampLit; halo.position.set(0, 0, 0.16); halo.layers.enable(GLOW_LAYER); halo.userData.isFlash = true; hd.add(halo);
    hd.updateMatrixWorld(true); const fw = new THREE.Vector3(0, 0, 1).transformDirection(hd.matrixWorld), fp = new THREE.Vector3(0, 0, 0.14).applyMatrix4(hd.matrixWorld);
    FARM_MAP.flares.push({ x: fp.x, y: fp.y, z: fp.z, dx: fw.x, dy: fw.y, dz: fw.z, col: [1, 0.78, 0.5] });
  }
  // (the poles in the hedgerow the yard lights hang from: wooden, a crossarm, insulators)
  for (const ii of [9, 32]) { const x = hfX(ii), z = hfZ(26); hfCyl(0.12, 0.15, 5.4, HF_M.poleTall, x, 2.7, z, 8); hfBox(1.4, 0.1, 0.1, HF_M.poleTall, x, 5.1, z); for (const o of [-0.6, 0.6]) hfCyl(0.04, 0.05, 0.14, HF_M.trim, x + o, 5.22, z, 6); }
}

// ---- outside the barricade: the country round it. On the two sides away from the camera from above (north and west)
// the tall things, the woods close behind the barn and a gravel road down the west side with the power line along it
// and a burnt-out pickup left on it; on the camera's sides only what's low near the barricade (stubble fields, a
// wire fence, round bales left out, a scarecrow), the woods far off
const HF_OUT = 120;
function hfOutside(g) {
  const ground = (w, d, tex, rx, rz, x, z, y) => { tex.repeat.set(rx, rz); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xffffff, { map: tex })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; g.add(m); };
  const xW = cxw(HF_B[0]) - 0.5, xE = cxw(HF_B[2]) + 0.5, zN = cxw(HF_B[1]) - 0.5, zS = cxw(HF_B[3]) + 0.5;
  ground(HF_OUT * 2, HF_OUT * 2, hfNoiseTex('#5d6a3a', 'rgba(70,82,42,0.9)', 'rgba(118,118,70,0.8)', 5000), 40, 40, 0, 0, -0.02);
  ground(HF_OUT * 2, HF_OUT - zS - 3, hfNoiseTex('#7d6a48', 'rgba(92,74,50,0.9)', 'rgba(176,152,98,0.85)', 4000, true), 50, 18, 0, zS + 3 + (HF_OUT - zS - 3) / 2, -0.01);   // (the stubble south)
  ground(HF_OUT - xE - 3, zS + 3 + HF_OUT, hfNoiseTex('#6f6a40', 'rgba(84,80,46,0.9)', 'rgba(150,138,86,0.8)', 4000, true), 18, 40, xE + 3 + (HF_OUT - xE - 3) / 2, (zS + 3 - HF_OUT) / 2, -0.012);   // (and the hay meadow east)
  const roadX = xW - 6.5; ground(6, HF_OUT * 2, hfNoiseTex('#8a8070', 'rgba(110,100,86,0.9)', 'rgba(170,162,146,0.8)', 6000), 3, 60, roadX, 0, -0.008);   // (the gravel road)
  ground(xE - xW + 2, zS - zN + 2, hfNoiseTex('#6a5d46', 'rgba(80,70,52,0.9)', 'rgba(120,108,84,0.8)', 3000), 8, 8, (xW + xE) / 2, (zN + zS) / 2, -0.005);   // (worn round the barricade)
  // the woods
  const tree = (x, z, s) => {
    if (rand() < 0.35) { hfCyl(0.12 * s, 0.2 * s, 2.2 * s, HF_M.bark, x, 1.1 * s, z, 6); for (let k = 0; k < 3; k++) hfMesh(new THREE.ConeGeometry((1.9 - k * 0.5) * s, 2.4 * s, 7), hfPick(HF_M.hedge), x, (2.4 + k * 1.5) * s, z); }
    else { hfCyl(0.16 * s, 0.26 * s, 3.4 * s, HF_M.bark, x, 1.7 * s, z, 6); for (let k = 0; k < 3; k++) hfBlob(rr(1.3, 1.9) * s, hfPick(HF_M.leaf), x + rr(-0.9, 0.9) * s, rr(3.6, 5.2) * s, z + rr(-0.9, 0.9) * s, 0.8); }
  };
  for (let x = -55; x < 55; x += rr(2.6, 4.2)) for (const d of [rr(4, 9), rr(10, 16), rr(17, 26)]) tree(x, zN - d, rr(0.85, 1.25));   // (north, close behind the barn)
  for (let z = zN - 6; z < 45; z += rr(2.6, 4.2)) for (const d of [rr(3.5, 8), rr(9, 18)]) tree(roadX - 3 - d, z, rr(0.85, 1.25));   // (west, past the road)
  for (let x = -60; x < 60; x += rr(3, 6)) tree(x, zS + rr(34, 48), rr(0.9, 1.3));   // (far off south)
  for (let z = -40; z < 50; z += rr(3, 6)) tree(xE + rr(32, 44), z, rr(0.9, 1.3));   // (and east)
  // the power line along the road: poles with their crossarms, the wires between them
  let px0 = null;
  for (let z = -60; z <= 60; z += 15) { const x = roadX - 3.6; hfCyl(0.13, 0.17, 7.5, HF_M.poleTall, x, 3.75, z, 7); hfBox(1.8, 0.12, 0.12, HF_M.poleTall, x, 7.0, z); if (px0 !== null) for (const o of [-0.8, 0, 0.8]) hfStrut(x + o, 7.1, px0, x + o, 7.1, z, 0.025, HF_M.dark); px0 = z; }
  // a pickup burnt out on the road, its doors gone, glass gone, sat on its rims
  { const x = roadX + 0.4, z = 6, a = 0.08, cab = hfBox(1.8, 0.9, 1.6, HF_M.soot, x, 1.25, z - 0.3);
    for (const p of [hfBox(1.85, 0.55, 4.8, HF_M.rust, x, 0.7, z), cab, hfBox(1.7, 0.08, 1.5, HF_M.char, x, 1.75, z - 0.3), hfBox(1.7, 0.45, 2.0, HF_M.char, x, 1.1, z + 1.3)]) p.rotation.y = a;
    for (const [ox, oz] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.5], [0.85, 1.5]]) { const w = hfCyl(0.3, 0.3, 0.2, HF_M.dark, x + ox, 0.3, z + oz, 10); w.rotation.z = Math.PI / 2; } }
  // a wire fence round the fields south and east, and what's left out in them
  for (let x = xW - 2; x <= xE + 10; x += 3) { hfBox(0.1, 1.2, 0.1, HF_M.woodDk, x, 0.6, zS + 9); for (const y of [0.5, 0.9]) hfBox(3, 0.015, 0.015, HF_M.galvDk, x + 1.5, y, zS + 9); }
  for (let z = zN - 2; z <= zS + 9; z += 3) { hfBox(0.1, 1.2, 0.1, HF_M.woodDk, xE + 9, 0.6, z); for (const y of [0.5, 0.9]) hfBox(0.015, 0.015, 3, HF_M.galvDk, xE + 9, y, z + 1.5); }
  for (const [x, z] of [[-14, zS + 14], [-11.5, zS + 15], [6, zS + 19], [18, zS + 13], [xE + 14, -6], [xE + 15, 9], [xE + 20, -18]]) { const b = hfCyl(0.75, 0.75, 1.2, hfPick(HF_M.hayLow), x, 0.75, z, 16); b.rotation.z = Math.PI / 2; b.rotation.y = rr(0, 3); }
  { const x = 2, z = zS + 16; hfBox(0.08, 2.0, 0.08, HF_M.woodDk, x, 1.0, z); hfBox(1.3, 0.07, 0.07, HF_M.woodDk, x, 1.55, z); hfBox(0.5, 0.65, 0.3, HF_M.board[3], x, 1.45, z); hfBlob(0.2, HF_M.hayLow[2], x, 1.95, z, 1.2); hfMesh(new THREE.ConeGeometry(0.34, 0.2, 10), HF_M.woodDk, x, 2.15, z); }
  // junk behind the barn: an old rake, rusting, and tyres
  for (let k = 0; k < 6; k++) { const t = hfCyl(0.42, 0.42, 0.22, HF_M.tread, -6 + k * 0.15, 0.11 + k * 0.22, zN - 2.2, 12); t.rotation.y = rr(0, 1); }
  for (let k = 0; k < 9; k++) { const c = hfMesh(new THREE.TorusGeometry(0.55, 0.03, 4, 14, Math.PI), HF_M.rust, 5 + k * 0.3, 0, zN - 3); c.rotation.y = Math.PI / 2; }
  hfBox(3, 0.08, 0.08, HF_M.rust, 6.2, 0.55, zN - 3);
}

// ---- what's painted on it: the farm's name across the barn, the warnings the people here put up
function hfSigns(g) {
  const sign = (text, w, h, col, font, x, y, z, ry, bg) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const t = c.getContext('2d'), rnd = seeded(text.length * 97);
    if (bg) { t.fillStyle = bg; t.fillRect(0, 0, c.width, c.height); }
    t.fillStyle = col; t.font = font; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText(text, c.width / 2, c.height / 2 + 4);
    for (let k = 0; k < 320; k++) t.clearRect(rnd() * c.width, rnd() * c.height, 2 + rnd() * 6, 2 + rnd() * 4);   // (worn)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, { map: new THREE.CanvasTexture(c), transparent: true, alphaTest: 0.2 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  };
  const zB = hfZ(11) + 0.515, zN = hfZ(0) + 0.515, xW = hfX(0) + 0.515;
  sign('HARLAN', 6.4, 1.3, 'rgba(226,218,196,0.8)', '700 190px "Saira Extra Condensed", sans-serif', 0, 3.25, zB, 0);
  sign('EST. 1931', 2.2, 0.4, 'rgba(226,218,196,0.7)', '700 120px "Saira Extra Condensed", sans-serif', 0, 2.55, zB, 0);
  sign('NO ROOM', 2.6, 0.8, 'rgba(198,60,44,0.85)', 'italic 900 150px "Archivo", sans-serif', hfX(3.5), 1.5, zN, 0);
  sign('KEEP OUT', 2.6, 0.8, 'rgba(198,60,44,0.85)', 'italic 900 150px "Archivo", sans-serif', hfX(37.5), 1.5, zN, 0);
  sign('THEY COME AT DUSK', 3.2, 0.5, 'rgba(236,232,220,0.75)', 'italic 900 90px "Archivo", sans-serif', xW, 1.4, hfZ(30), Math.PI / 2);
  for (const s of [-1, 1]) sign('MACHINE SHED', 2.4, 0.45, 'rgba(30,30,28,0.85)', '700 90px "Saira Extra Condensed", sans-serif', s * (Math.abs(hfX(7)) - 0.515), 3.05, hfZ(18.5), -s * Math.PI / 2, 'rgba(196,170,96,0.85)');
}

// the whole map, into its group (g): its pieces (to be folded into a few meshes) back
function hfBuild(g) {
  hP = g; hParts = []; FARM_MAP.flares.length = 0;
  const x0 = cxw(HF_B[0]) - 0.5, x1 = cxw(HF_B[2]) + 0.5, z0 = cxw(HF_B[1]) - 0.5, z1 = cxw(HF_B[3]) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0xffffff, { map: hfGroundTex() })); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  fl.onBeforeRender = hfTick;   // (the roofs shown or not as the ground's drawn: a frame behind the view at most)
  for (let j = HF_B[1]; j <= HF_B[3]; j++) for (let i = HF_B[0]; i <= HF_B[2]; i++) {
    const k = HF_KIND(i, j), x = cxw(i), z = cxw(j);
    if (k === '#') hfBarricade(i, j, x, z);
    else if (k === 'h') hfBarnWall(i, j, x, z);
    else if (k === 'm') hfShedWall(i, j, x, z);
    else if (k === 'x') hfStall(i, j, x, z);
    else if (k === 'Y') hfMow(x, z);
    else if (k === 'y') hfBale(x, z);
    else if (k === 'O') hfSilo(i, j, x, z);
    else if (k === 'R') { if (hfFirst(i, j, k)) hfTractor(i, j); }
    else if (k === 'W') { if (hfFirst(i, j, k)) hfWagon(i, j); }
    else if (k === 'e') hfHedge(i, j, x, z);
    else if (k === 'u') hfRuin(i, j, x, z);
    else if (k === 'S') hfRack(i, j, x, z);
    else if (k === 'T') { if (hfFirst(i, j, k)) hfTank(i, j); }
    else if (k === 'C') { if (hfFirst(i, j, k)) hfCrib(i, j); }
    else if (k === 'f') hfFence(i, j, x, z);
    else if (k === 't') hfTrough(i, j, x, z);
    else if (k === 'p') hfPipe(x, z);
  }
  hfDoors(); hfWire(g); hfLamps(g); hfOutside(g); hfSigns(g); hfOverhead(g);
  const parts = hParts; hP = hParts = null; return parts;
}
// the doorways' heads (the walls carried over them, above your head) and the doors themselves, slid back on their rails
function hfDoors() {
  for (const s of [-1, 1]) {
    const X = ii => s < 0 ? hfX(ii) : -hfX(ii);
    // the barn's big doors at its end: the wall over them, the two leaves slid back along the outside of it, white
    // trim and a cross brace on each
    { const x = X(8), zc = (hfZ(4) + hfZ(7)) / 2; hfBox(1, 0.9, 4, HF_M.barn[0], x, 3.75, zc); hfBox(1.02, 0.12, 4.1, HF_M.trim, x, 3.3, zc);
      for (const e of [-1, 1]) { const lz = zc + e * 3.0, lx = x + s * 0.56; hfBox(0.08, 3.2, 2.0, HF_M.barn[1], lx, 1.65, lz); hfBox(0.1, 0.1, 2.0, HF_M.trim, lx + s * 0.02, 3.2, lz); hfBox(0.1, 0.1, 2.0, HF_M.trim, lx + s * 0.02, 0.12, lz); hfStrut(lx + s * 0.03, 0.15, lz - 0.95, lx + s * 0.03, 3.15, lz + 0.95, 0.09, HF_M.trim); hfStrut(lx + s * 0.03, 0.15, lz + 0.95, lx + s * 0.03, 3.15, lz - 0.95, 0.09, HF_M.trim); }
      hfBox(0.1, 0.1, 10, HF_M.dark, x + s * 0.6, 3.35, zc); }
    // each south door into the yard: the wall over it, its one leaf slid back west of it, a board or two left nailed
    // across where they barred it
    { const xc = X(15), z = hfZ(11); hfBox(3, 0.9, 1, HF_M.barn[2], xc, 3.65, z); hfBox(3.1, 0.12, 1.02, HF_M.trim, xc, 3.15, z);
      const lx = X(12); hfBox(3.0, 3.0, 0.08, HF_M.barn[1], lx, 1.55, z + 0.56); hfStrut(lx - 1.4, 0.15, z + 0.6, lx + 1.4, 2.95, z + 0.6, 0.09, HF_M.trim); hfBox(3.0, 0.1, 0.1, HF_M.trim, lx, 3.0, z + 0.6);}
    // a shed's doorways: north and south, and its big doors east, the leaves slid back along the outside
    for (const jj of [11, 26]) { const xc = X(5), z = hfZ(jj); hfBox(3, 0.55, 1, HF_M.tin[1], xc, HF_H.m - 0.27, z); hfBox(3.04, 0.08, 1.04, HF_M.tinDk, xc, HF_H.m - 0.58, z); }
    { const x = X(7), zc = hfZ(18.5); hfBox(1, 0.7, 4, HF_M.tin[2], x, HF_H.m - 0.35, zc); hfBox(1.04, 0.08, 4.04, HF_M.tinDk, x, HF_H.m - 0.72, zc);
      for (const e of [-1, 1]) { const lz = zc + e * 3.05, lx = x - s * 0.56; hfBox(0.06, 2.65, 2.1, HF_M.tin[0], lx, 1.36, lz); for (let o = -0.9; o <= 0.91; o += 0.3) hfBox(0.03, 2.6, 0.04, HF_M.tinDk, lx - s * 0.04, 1.36, lz + o); }
      hfBox(0.1, 0.1, 9, HF_M.dark, x - s * 0.6, 2.75, zc); }
  }
}
// the map as world/arena.js takes it (AR_MAPS)
export const FARM_MAP = {
  id: 'farm', name: 'Harlan Farm', note: 'A walled-in farm: the barn, the farmyard, the field',
  plan: HF_PLAN, b: HF_B, h: HF_H, low: HF_LOW, vault: HF_LOW, walls: '#hmeu', what: HF_WHAT, build: hfBuild, indoor: false, tod: null,
  // (its lamps, on only at night: lighting/lightmap.js; and their lens flares, put up with the map: world/arena.js arenaUp)
  lights: () => hfLampList().map(([i, j, , , , , r, col, int]) => ({ arena: true, x: hfX(i), z: hfZ(j), r, col, int })),
  flares: []
};
