// The arena's indoor map: "Larkspur Mall", a shopping mall after closing time, the lights left on. Its own world, not
// built over the farm (world/arena.js arenaUp takes the whole farm out of the scene for it): the mall's floor and
// walls inside, a car park round it outside, a ceiling over it seen only from your own eyes (from above you look in
// through where its roof would be, as the cutaway does the farmhouse's). Designed and checked in tools/mall-plan.py
// (reachability, spawn sightlines, lane sightlines, corridors, corner pinches, timings):
//  - each spawn an anchor store (the department store) at its end, three ways out: north into back of house and south
//    into the food court (a shelf just inside each, round its far end, so nothing outside sees in), and a wide
//    entrance east onto the concourse with a display kiosk out in front of it
//  - NORTH, Back of house: close quarters. The stockroom behind the shops, shelving islands and pallets, the lift core
//    in the middle, a service door into the concourse
//  - MIDDLE, the Concourse: the contest. Pillars, planters and the fountain court with the flag between its two pools
//  - SOUTH, the Food court: medium range. Tables and counters for low cover, the stalls along the south wall, a seating
//    island in the middle so it's never seen end to end; open to the concourse either side of it
// No line runs from the north lane into the south; the longest anywhere is about 25 m, across the concourse into the
// food court on a diagonal.

import { rand, rr, seeded } from '../core/math.js';
import { lam, lit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';

// its plan, a row a line from north to south (tools/mall-plan.py prints it): # the outer wall, h shop and service
// walls, S stockroom shelving, K a display kiosk, P a pillar (all of those stop sight and rounds); k pallets of stock,
// c a counter, T a table, p a planter, w a fountain's pool (seen and shot over, and vaulted); A and B each side's
// spawn, F the spots a free-for-all spawns from
const MALL_PLAN = [
  '####################################',
  '#........S....k......k....S........#',
  '#..F.....S.....F....F.....S.....F..#',
  '#....kk..S................S..kk....#',
  '#..........SSS..hhhh..SSS..........#',
  '#...............hhhh...............#',
  '#..........F....hhhh....F..........#',
  '#hhh...hhh...hhhhhhhhhh...hhh...hhh#',
  '#A.....h....................h.....B#',
  '#......h.F..Pp........pP..F.h......#',
  '#..SSSSh.......F....F.......hSSSS..#',
  '#......h..KK..P......P..KK..h......#',
  '#.A....h..KK............KK..h....B.#',
  '#AAA......KK....wwww....KK......BBB#',
  '#AAAA.....KK............KK.....BBBB#',
  '#AAAA.....KK............KK.....BBBB#',
  '#AAA......KK....wwww....KK......BBB#',
  '#.A....h..KK............KK..h....B.#',
  '#......h..KK..P......P..KK..h......#',
  '#..SSSSh....................hSSSS..#',
  '#......h.F..pP........Pp..F.h......#',
  '#A.....h....................h.....B#',
  '#hhh...hhhhhh..hhhhhh..hhhhhh...hhh#',
  '#...............hhhh...............#',
  '#..........T....hhhh....T..........#',
  '#.cc........F.T.hhhh.T.F........cc.#',
  '#.......h.......hhhh.......h.......#',
  '#...F...h.ccc..........ccc.h...F...#',
  '#.......h......F....F......h.......#',
  '####################################'
];
// where it stands on the grid (cells, the walls included): centred on the grid's middle like Yard 4, so the flag's in
// the same place, between the two pools
const MALL_B = [4, 7, 39, 36];
const MALL_KIND = (i, j) => { const r = MALL_PLAN[j - MALL_B[1]]; return r ? r[i - MALL_B[0]] || '#' : '#'; };
// how tall each kind stands (m), which are low (seen and shot over), which are vaulted, and what the vault prompt
// calls each (barricades/interactions.js)
const MALL_H = { '#': 3.6, h: 2.7, S: 2.3, K: 2.2, P: 3.6, k: 1.0, c: 1.05, T: 0.8, p: 0.9, w: 0.8 };
const MALL_LOW = new Set(['k', 'c', 'T', 'p', 'w']);
const MALL_WHAT = { k: 'pallet', c: 'counter', T: 'table', p: 'planter', w: 'fountain' };
// the ceiling (m up), and its lights: fluorescent panels over the concourse and back of house, warmer pendants over
// the food court and the stores (cells in the plan: [column, row, warm])
const MALL_CEIL = 3.6;
const MALL_LAMPS = [[4, 3, 0], [11, 2, 0], [24, 2, 0], [31, 3, 0], [17.5, 2.5, 0], [10, 10, 0], [25, 10, 0], [10, 19, 0], [25, 19, 0], [17.5, 14.5, 0], [13, 14.5, 0], [22, 14.5, 0],
  [4, 25, 1], [11, 26, 1], [24, 26, 1], [31, 25, 1], [17.5, 27.5, 1], [3.5, 14.5, 1], [32.5, 14.5, 1], [3.5, 9, 1], [32.5, 9, 1], [3.5, 20, 1], [32.5, 20, 1]];

// ---- the look of it
// (the tall things dithered away round you from above when they're between you and the camera, as Yard 4's walls are:
// core/shaders.js 'tree')
const mTall = c => lit(new THREE.MeshLambertMaterial({ color: c }), 'tree');
const MLM = {
  wall: mTall(0xd9d2c4), wallDk: mTall(0xa89f8f), base: mTall(0x4a4744), trim: mTall(0x8a7f70),
  front: [mTall(0x2f4f5e), mTall(0x6b3a3a), mTall(0x3d5a3f), mTall(0x5a4a6b), mTall(0x7a5a2a)], glass: mTall(0x3d5560),
  shelf: mTall(0x6d7378), shelfDk: mTall(0x3e4246), box: lam(0xa8875a), boxB: lam(0x8a6a44), boxW: lam(0xd8d2c4),
  kiosk: mTall(0xece6da), kioskDk: mTall(0x5a5650), pillar: mTall(0xcfc6b5), pillarDk: mTall(0x8f8676),
  pallet: lam(0x9a7b52), wrap: lam(0xb9c4c8), counter: lam(0x7a4b2e), counterTop: lam(0xd9d2c8), steel: lam(0x9aa0a4),
  table: lam(0xe0d8ca), leg: lam(0x2c2c2e), stool: lam(0xb34a32), planter: lam(0x6e655a), soil: lam(0x3a2c20), leaf: lam(0x3f6b3a), leaf2: lam(0x557f44),
  pool: lam(0xbfb5a2), water: lam(0x3f7f96, { transparent: true, opacity: 0.85 }), ceil: lam(0xe8e4dc), panel: new THREE.MeshBasicMaterial({ color: 0xf4f8ff }), pend: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  lot: lam(0x3b3c3e), line: lam(0xd8d4c4), curb: lam(0x8e8a82), car: [lam(0x7a2a24), lam(0x2c4a6a), lam(0x8a8a86), lam(0x2a2a2c), lam(0xc0b9a8)], carDk: lam(0x1c1d1e), lampPost: lam(0x4a4b4c)
};
// the floor: terrazzo, big cream tiles with darker grout, polished, a darker border round the walls, a scuffed
// walkway and each anchor store's carpet
function mallFloorTex() {
  const W = 1024, cw = MALL_PLAN[0].length, ch = MALL_PLAN.length, c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * ch / cw); const x = c.getContext('2d'), H = c.height;
  const px = W / cw, pz = H / ch, rnd = seeded(5150);
  x.fillStyle = '#cbc3b2'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '120,110,96' : '232,226,214'},${0.25 + rnd() * 0.4})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }   // (the terrazzo's chips)
  // each zone its own floor: back of house bare concrete, the stores carpeted, the food court in darker tile
  const zone = (j0, j1, i0, i1, col) => { x.fillStyle = col; x.fillRect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz); };
  zone(1, 7, 1, cw - 1, 'rgba(128,126,120,0.92)'); zone(8, 22, 1, 7, 'rgba(92,46,44,0.9)'); zone(8, 22, cw - 7, cw - 1, 'rgba(44,58,86,0.9)'); zone(23, ch - 1, 1, cw - 1, 'rgba(150,120,92,0.55)');
  for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; x.fillRect(rnd() * W, rnd() * pz * 7 + pz, 1 + rnd() * 3, 1 + rnd() * 3); }   // (the concrete's grain)
  x.strokeStyle = 'rgba(80,74,64,0.55)'; x.lineWidth = 2;   // the tiles' grout, every 2 m (not in the stores' carpet or back of house)
  for (let i = 0; i <= cw; i += 2) { x.beginPath(); x.moveTo(i * px, 8 * pz); x.lineTo(i * px, H - pz); x.stroke(); }
  for (let j = 8; j <= ch; j += 2) { x.beginPath(); x.moveTo(7 * px, j * pz); x.lineTo((cw - 7) * px, j * pz); x.stroke(); }
  // the concourse's inlay: a ring of dark stone round the fountain court, a compass in the middle
  x.strokeStyle = 'rgba(70,60,52,0.7)'; x.lineWidth = 10; x.beginPath(); x.ellipse(W / 2, 14.5 * pz + pz / 2, 5.6 * px, 4.4 * pz, 0, 0, 7); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.ellipse(W / 2, 14.5 * pz + pz / 2, 6.2 * px, 5 * pz, 0, 0, 7); x.stroke();
  // the loading lines in back of house: a yellow walkway along its south wall, hatched by each door
  x.strokeStyle = 'rgba(214,174,52,0.75)'; x.lineWidth = 5; x.setLineDash([22, 12]); x.beginPath(); x.moveTo(pz, 6.6 * pz); x.lineTo(W - pz, 6.6 * pz); x.stroke(); x.setLineDash([]);
  // each store's entrance mat
  for (const i of [7, cw - 8]) { x.fillStyle = 'rgba(40,36,34,0.85)'; x.fillRect((i - 0.8) * px, 13 * pz, 2.6 * px, 4 * pz); }
  // scuffs and the odd spill
  for (let k = 0; k < 60; k++) { const r = 6 + rnd() * 26, g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(60,50,40,0.18)'); g.addColorStop(1, 'rgba(60,50,40,0)'); x.save(); x.translate(rnd() * W, rnd() * H); x.scale(1, 0.4 + rnd()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

// ---- building it: each kind's piece (parts: folded into a few meshes by world/arena.js), and its footprint for what
// walks into it and what a round hits (cellBox, not the whole cell)
let mP = null, mParts = null;
const mPush = m => { if (!m.parent) mP.add(m); mParts.push(m); return m; };
const mBox = (w, h, d, mat, x, y, z) => mPush(box(mP, w, h, d, mat, x, y, z));
const mFoot = (x, z, a, b, c, d) => { cellBox[idx(ci(x), ci(z))] = [x - a, z - b, x + c, z + d]; };
const mCyl = (r0, r1, h, mat, x, y, z, seg = 12) => { const m = mPush(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
// the outer wall: painted block, a dark skirting along its foot and a trim rail at head height
// (on the two sides toward the camera from above, south and east, it's drawn cut down to MALL_CUT with a dark cut top,
// as a model's cut away to see in, so nothing near them is lost behind them; the rest of it is put up only from your
// own eyes, with the ceiling: mallUp)
const MALL_CUT = 1.2, mallUp = [];
function mallWall(i, j, x, z) {
  const H = MALL_H['#'], cut = i === MALL_B[2] || j === MALL_B[3], mat = rand() < 0.1 ? MLM.wallDk : MLM.wall;
  if (cut) {
    mBox(1, MALL_CUT, 1, mat, x, MALL_CUT / 2, z); mBox(1.01, 0.05, 1.01, MLM.base, x, MALL_CUT + 0.02, z);
    const u = new THREE.Mesh(new THREE.BoxGeometry(1, H - MALL_CUT, 1), mat); u.position.set(x, MALL_CUT + (H - MALL_CUT) / 2, z); mallUp.push(u);
  } else mBox(1, H, 1, mat, x, H / 2, z);
  mBox(1.02, 0.14, 1.02, MLM.base, x, 0.07, z); if (!cut) mBox(1.02, 0.06, 1.02, MLM.trim, x, 2.2, z);
}
// a shop or service wall: the shops' fronts along the concourse are glass in dark frames over a kick plate, a sign
// band above (each shop its own colour, in runs); the rest painted block like the outer wall
function mallShopWall(i, j, x, z) {
  const H = MALL_H.h, open = d => ['.', 'A', 'B', 'F'].includes(MALL_KIND(i + d[0], j + d[1]));
  const ii = i - MALL_B[0], jj = j - MALL_B[1], conc = jj >= 7 && jj <= 22 && ii >= 7 && ii <= 28;   // (faces the concourse)
  if (conc) {
    const col = MLM.front[Math.floor((ii + jj * 3) / 4) % MLM.front.length];
    mBox(1, 0.35, 1, MLM.base, x, 0.175, z); mBox(0.96, H - 1.05, 0.96, MLM.glass, x, 0.35 + (H - 1.05) / 2, z);
    mBox(1, 0.7, 1, col, x, H - 0.35, z); mBox(1.02, 0.05, 1.02, MLM.trim, x, H - 0.72, z);
    if ((ii + jj) % 2 === 0) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(d)) mBox(d[0] ? 0.02 : 0.5, 0.16, d[1] ? 0.02 : 0.5, MLM.panel, x + d[0] * 0.51, H - 0.35, z + d[1] * 0.51);   // (lettering lit on the sign band)
  } else {
    mBox(1, H, 1, rand() < 0.12 ? MLM.wallDk : MLM.wall, x, H / 2, z); mBox(1.02, 0.12, 1.02, MLM.base, x, 0.06, z);
  }
}
// stockroom shelving: steel uprights, four shelves, boxes on them (each shelf's load a little different)
function mallShelf(i, j, x, z) {
  const H = MALL_H.S, alongX = MALL_KIND(i - 1, j) === 'S' || MALL_KIND(i + 1, j) === 'S';
  for (const sx of [-0.46, 0.46]) for (const sz of [-0.4, 0.4]) mBox(0.05, H, 0.05, MLM.shelfDk, x + (alongX ? sx : sz), H / 2, z + (alongX ? sz : sx));
  for (let s = 0; s < 4; s++) {
    const y = 0.12 + s * 0.58; mBox(alongX ? 1 : 0.86, 0.04, alongX ? 0.86 : 1, MLM.shelf, x, y, z);
    for (let n = 0; n < 3; n++) if (rand() < 0.8) { const w = rr(0.24, 0.32), h = rr(0.22, 0.42), o = -0.32 + n * 0.32; mBox(w, h, rr(0.3, 0.6), [MLM.box, MLM.boxB, MLM.boxW][Math.floor(rand() * 3)], x + (alongX ? o : rr(-0.1, 0.1)), y + 0.02 + h / 2, z + (alongX ? rr(-0.1, 0.1) : o)); }
  }
}
// a display kiosk: a white island with a dark plinth, a lit display along each long side and a brand board on top
function mallKiosk(i, j, x, z) {
  const H = MALL_H.K; mBox(1, 0.25, 1, MLM.kioskDk, x, 0.125, z); mBox(0.96, H - 0.55, 0.96, MLM.kiosk, x, 0.25 + (H - 0.55) / 2, z); mBox(1, 0.3, 1, MLM.kioskDk, x, H - 0.15, z);
  for (const s of [-1, 1]) if (MALL_KIND(i + s, j) !== 'K') mBox(0.02, 0.9, 0.8, MLM.panel, x + s * 0.49, 1.1, z);   // (its displays, lit)
}
// a pillar: square, clad in stone, a darker band at its foot and a capital where it meets the ceiling
function mallPillar(x, z) { mBox(0.9, MALL_CEIL, 0.9, MLM.pillar, x, MALL_CEIL / 2, z); mBox(0.96, 0.3, 0.96, MLM.pillarDk, x, 0.15, z); mBox(1, 0.2, 1, MLM.pillarDk, x, MALL_CEIL - 0.1, z); }
// a pallet of stock: the pallet and its shrink-wrapped load
function mallPallet(x, z) { mBox(0.95, 0.14, 0.95, MLM.pallet, x, 0.07, z); mBox(0.85, 0.8, 0.85, rand() < 0.5 ? MLM.wrap : MLM.box, x, 0.54, z); mFoot(x, z, 0.48, 0.48, 0.48, 0.48); }
// a food counter: a dark wood front, a pale top, a steel rail
function mallCounter(i, j, x, z) {
  const along = MALL_KIND(i - 1, j) === 'c' || MALL_KIND(i + 1, j) === 'c' ? 'x' : 'z', H = MALL_H.c;
  mBox(along === 'x' ? 1 : 0.6, H - 0.06, along === 'x' ? 0.6 : 1, MLM.counter, x, (H - 0.06) / 2, z); mBox(along === 'x' ? 1.02 : 0.72, 0.06, along === 'x' ? 0.72 : 1.02, MLM.counterTop, x, H - 0.03, z);
  cellBox[idx(i, j)] = along === 'x' ? [x - 0.5, z - 0.36, x + 0.5, z + 0.36] : [x - 0.36, z - 0.5, x + 0.36, z + 0.5];
}
// a table with four stools round it
function mallTable(x, z) {
  mCyl(0.48, 0.48, 0.05, MLM.table, x, 0.76, z, 18); mCyl(0.05, 0.05, 0.74, MLM.leg, x, 0.37, z, 8); mCyl(0.28, 0.3, 0.04, MLM.leg, x, 0.02, z, 12);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4, sx = x + Math.cos(a) * 0.7, sz = z + Math.sin(a) * 0.7; mCyl(0.17, 0.17, 0.06, MLM.stool, sx, 0.46, sz, 10); mCyl(0.03, 0.03, 0.44, MLM.leg, sx, 0.22, sz, 6); }
  mFoot(x, z, 0.5, 0.5, 0.5, 0.5);
}
// a planter: a stone box with soil and a shrub
function mallPlanter(x, z) { mBox(0.95, 0.7, 0.95, MLM.planter, x, 0.35, z); mBox(0.82, 0.04, 0.82, MLM.soil, x, 0.69, z); const s = mPush(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), rand() < 0.5 ? MLM.leaf : MLM.leaf2)); s.position.set(x, 1.0, z); s.scale.set(1, 0.8, 1); s.castShadow = true; mFoot(x, z, 0.48, 0.48, 0.48, 0.48); }
// a fountain's pool: a tiled rim, water in it (one long pool over its run of cells, built from its west end)
function mallPool(i, j, x, z) {
  if (MALL_KIND(i - 1, j) === 'w') return;
  let n = 1; while (MALL_KIND(i + n, j) === 'w') n++;
  const cx = x + (n - 1) / 2, H = MALL_H.w;
  mBox(n, 0.12, 1, MLM.pool, cx, 0.06, z); for (const s of [-1, 1]) { mBox(n, H, 0.14, MLM.pool, cx, H / 2, z + s * 0.43); }
  for (const s of [-1, 1]) mBox(0.14, H, 0.72, MLM.pool, cx + s * (n / 2 - 0.07), H / 2, z);
  const w = mPush(new THREE.Mesh(new THREE.PlaneGeometry(n - 0.28, 0.72), MLM.water)); w.rotation.x = -Math.PI / 2; w.position.set(cx, H - 0.14, z); w.receiveShadow = true;
  for (let k = 0; k < n; k++) cellBox[idx(i + k, j)] = [x + k - 0.5, z - 0.5, x + k + 0.5, z + 0.5];
}
// the seating island and the lift core: the same block as the walls but with menu boards / a lift's doors on them
function mallIsland(i, j, x, z) {
  const jj = j - MALL_B[1]; mallShopWall(i, j, x, z);
  if (jj === 26 || jj === 4) for (const s of [-1, 1]) if (MALL_KIND(i, j + s) === '.') mBox(0.9, 0.6, 0.02, jj === 4 ? MLM.steel : MLM.panel, x, jj === 4 ? 1.1 : 1.9, z + s * 0.51);
}
// ---- outside: a car park round the building, lit by its lamp posts, cars left in it
function mallOutside(g) {
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), MLM.lot); lot.rotation.x = -Math.PI / 2; lot.position.y = -0.01; lot.receiveShadow = true; g.add(lot);
  const x0 = cxw(MALL_B[0]) - 0.5, x1 = cxw(MALL_B[2]) + 0.5, z0 = cxw(MALL_B[1]) - 0.5, z1 = cxw(MALL_B[3]) + 0.5;
  mBox(x1 - x0 + 3, 0.15, 1, MLM.curb, (x0 + x1) / 2, 0.075, z1 + 1.5); mBox(x1 - x0 + 3, 0.15, 1, MLM.curb, (x0 + x1) / 2, 0.075, z0 - 1.5);
  for (let x = x0 - 18; x < x1 + 18; x += 2.8) for (const zz of [z1 + 5, z1 + 11, z0 - 5, z0 - 11]) {
    mBox(0.12, 0.01, 5, MLM.line, x, 0.005, zz);
    if (rand() < 0.35) { const c = MLM.car[Math.floor(rand() * MLM.car.length)], cx = x + 1.4, a = rr(-0.08, 0.08); const b = mBox(1.8, 0.7, 4.2, c, cx, 0.55, zz); b.rotation.y = a; const t = mBox(1.6, 0.55, 2.2, c, cx, 1.15, zz + 0.2); t.rotation.y = a; const w = mBox(1.62, 0.42, 1.9, MLM.carDk, cx, 1.15, zz + 0.2); w.rotation.y = a; }
  }
  for (const [x, z] of [[x0 - 8, z0 - 8], [x1 + 8, z0 - 8], [x0 - 8, z1 + 8], [x1 + 8, z1 + 8], [(x0 + x1) / 2, z1 + 8], [(x0 + x1) / 2, z0 - 8]]) { mCyl(0.1, 0.14, 7, MLM.lampPost, x, 3.5, z, 8); mBox(1.2, 0.18, 0.4, MLM.lampPost, x, 7, z); }
}
// the ceiling: tiles over the whole floor with the light panels set in it, and the pendants over the food court and
// the stores. Only from your own eyes (from above you look in through it): shown as the first-person view is up
let mallCeil = null;
function mallCeiling(g) {
  const c = new THREE.Group(), x0 = cxw(MALL_B[0]) - 0.5, x1 = cxw(MALL_B[2]) + 0.5, z0 = cxw(MALL_B[1]) - 0.5, z1 = cxw(MALL_B[3]) + 0.5;
  const t = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), MLM.ceil); t.rotation.x = Math.PI / 2; t.position.set((x0 + x1) / 2, MALL_CEIL, (z0 + z1) / 2); c.add(t);
  for (const [ci2, cj, warm] of MALL_LAMPS) {
    const x = cxw(MALL_B[0] + ci2), z = cxw(MALL_B[1] + cj);
    if (warm) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.22, 12), MLM.pend); p.position.set(x, MALL_CEIL - 0.55, z); c.add(p); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4), MLM.leg); w.position.set(x, MALL_CEIL - 0.22, z); c.add(w); }
    else { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), MLM.panel); p.position.set(x, MALL_CEIL - 0.03, z); c.add(p); }
  }
  mallUp.forEach(u => c.add(u)); mallUp.length = 0;   // (the cut-down walls' upper parts: mallWall)
  c.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); c.visible = false; g.add(c); mallCeil = c;
}
// (shown with the first-person view, each frame)
function mallTick() { if (mallCeil) mallCeil.visible = fpOn(); }
// the whole map, into its group (g): its pieces (to be folded into a few meshes) back
function mallBuild(g) {
  mP = g; mParts = [];
  const x0 = cxw(MALL_B[0]) - 0.5, x1 = cxw(MALL_B[2]) + 0.5, z0 = cxw(MALL_B[1]) - 0.5, z1 = cxw(MALL_B[3]) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0xffffff, { map: mallFloorTex() })); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  fl.onBeforeRender = mallTick;   // (the ceiling shown or not as the floor's drawn: a frame behind the view at most)
  for (let j = MALL_B[1]; j <= MALL_B[3]; j++) for (let i = MALL_B[0]; i <= MALL_B[2]; i++) {
    const k = MALL_KIND(i, j), x = cxw(i), z = cxw(j), jj = j - MALL_B[1], ii = i - MALL_B[0];
    if (k === '#') mallWall(i, j, x, z);
    else if (k === 'h') ((jj >= 23 || jj <= 6) && ii >= 16 && ii <= 19 ? mallIsland : mallShopWall)(i, j, x, z);
    else if (k === 'S') mallShelf(i, j, x, z);
    else if (k === 'K') mallKiosk(i, j, x, z);
    else if (k === 'P') mallPillar(x, z);
    else if (k === 'k') mallPallet(x, z);
    else if (k === 'c') mallCounter(i, j, x, z);
    else if (k === 'T') mallTable(x, z);
    else if (k === 'p') mallPlanter(x, z);
    else if (k === 'w') mallPool(i, j, x, z);
  }
  mallOutside(g); mallCeiling(g);
  const parts = mParts; mP = mParts = null; return parts;
}
// the map as world/arena.js takes it (AR_MAPS)
export const MALL = {
  id: 'mall', name: 'Larkspur Mall', note: 'Indoors: back of house, the concourse, the food court',
  plan: MALL_PLAN, b: MALL_B, h: MALL_H, low: MALL_LOW, vault: MALL_LOW, walls: '#h', what: MALL_WHAT, build: mallBuild, indoor: true, tod: 20.6, foot: 'tile',
  // (its lights: the panels cool white, the pendants warm, always on, lighting/lightmap.js)
  lights: () => MALL_LAMPS.map(([i, j, warm]) => ({ arena: true, always: true, x: cxw(MALL_B[0] + i), z: cxw(MALL_B[1] + j), r: warm ? 8.5 : 10, col: warm ? [1, 0.8, 0.55] : [0.9, 0.95, 1], int: warm ? 1.15 : 1.05 }))
};
