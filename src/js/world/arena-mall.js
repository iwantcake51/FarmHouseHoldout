// The arena's indoor map: "Larkspur Mall", a shopping mall after closing time, the lights left on. Its own world, not
// built over the farm (world/arena.js arenaUp takes the whole farm out of the scene for it): the mall's floor and
// walls inside, a car park round it outside, a ceiling over it seen only from your own eyes (from above you look in
// through where its roof would be, as the cutaway does the farmhouse's). Designed and checked in tools/mall-plan.py
// (reachability, spawn sightlines, lane sightlines, corridors, corner pinches, timings):
//  - each spawn an anchor store (the department store) at its end, three ways out: north into the supermarket and south
//    into the food court (a shelf just inside each, round its far end, so nothing outside sees in), and a wide
//    entrance east onto the concourse with a display kiosk out in front of it
//  - NORTH, the Supermarket: close quarters. The mall's grocery store along its north side, its aisles of shelving
//    and pallets of stock, the lift core in its middle; its shutter forced up and its exit doors beside it, two ways
//    in from the concourse each side (a pillar out in front of the lift core, so nothing through the doors sees down
//    into the food court). A store you're in, not a corridor behind the shops
//  - MIDDLE, the Concourse: the contest. Pillars, planters and the fountain court with the flag between its two pools
//  - SOUTH, the Food court: medium range. Tables and counters for low cover, the stalls along the south wall, a seating
//    island in the middle so it's never seen end to end; open to the concourse either side of it
// No line runs from the north lane into the south; the longest anywhere is about 25 m, across the concourse into the
// food court on a diagonal.

import { rand, rr, seeded } from '../core/math.js';
import { floorMat } from './floors.js';
import { lam, lit } from '../core/shaders.js';
import { box, mergeInto } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';
import { arBoxSet } from './arena-boxes.js';
import { MALL_ANCHORS, MALL_STORES, mallAdTex, mallBannerTex, mallCeilTex, mallDirTex, mallMenuTex, mallShopTex, mallSignBoard, mallSignTex } from './arena-mall-art.js';

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
  '#hhh...hhh...h..hhhh..h...hhh...hhh#',
  '#A.....h....................h.....B#',
  '#......h.F..Pp........pP..F.h......#',
  '#..SSSSh.......FP..PF.......hSSSS..#',
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
// the ceiling (m up), and its lights: fluorescent panels over the concourse and the supermarket, warmer pendants over
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
  pool: lam(0xbfb5a2), water: lam(0x3f7f96, { transparent: true, opacity: 0.85 }), panel: new THREE.MeshBasicMaterial({ color: 0xf4f8ff }), pend: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  lot: lam(0x3b3c3e), line: lam(0xd8d4c4), curb: lam(0x8e8a82), car: [lam(0x7a2a24), lam(0x2c4a6a), lam(0x8a8a86), lam(0x2a2a2c), lam(0xc0b9a8)], carDk: lam(0x1c1d1e), lampPost: lam(0x4a4b4c)
};
// the floor: terrazzo, big cream tiles with darker grout, polished, a darker border round the walls, a scuffed
// walkway and each anchor store's carpet
function mallFloorTex() {
  const W = 1024, cw = MALL_PLAN[0].length, ch = MALL_PLAN.length, c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * ch / cw); const x = c.getContext('2d'), H = c.height;
  const px = W / cw, pz = H / ch, rnd = seeded(5150);
  x.fillStyle = '#cbc3b2'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) { x.fillStyle = `rgba(${rnd() < 0.5 ? '120,110,96' : '232,226,214'},${0.25 + rnd() * 0.4})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }   // (the terrazzo's chips)
  // each zone its own floor: the supermarket in pale vinyl squares, the stores carpeted, the food court in darker tile
  const zone = (j0, j1, i0, i1, col) => { x.fillStyle = col; x.fillRect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz); };
  zone(1, 7, 1, cw - 1, 'rgba(206,204,194,0.92)');
  for (let j = 1; j < 7; j += 0.5) for (let i = 1; i < cw - 1; i += 0.5) if (((i + j) * 2) % 2 === 0) { x.fillStyle = 'rgba(150,160,150,0.35)'; x.fillRect(i * px, j * pz, px / 2, pz / 2); } zone(8, 22, 1, 7, 'rgba(92,46,44,0.9)'); zone(8, 22, cw - 7, cw - 1, 'rgba(44,58,86,0.9)'); zone(23, ch - 1, 1, cw - 1, 'rgba(150,120,92,0.55)');
  for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; x.fillRect(rnd() * W, rnd() * pz * 7 + pz, 1 + rnd() * 3, 1 + rnd() * 3); }   // (the vinyl's scuffs)
  x.strokeStyle = 'rgba(80,74,64,0.55)'; x.lineWidth = 2;   // the tiles' grout, every 2 m (not in the stores' carpet or the supermarket)
  for (let i = 0; i <= cw; i += 2) { x.beginPath(); x.moveTo(i * px, 8 * pz); x.lineTo(i * px, H - pz); x.stroke(); }
  for (let j = 8; j <= ch; j += 2) { x.beginPath(); x.moveTo(7 * px, j * pz); x.lineTo((cw - 7) * px, j * pz); x.stroke(); }
  // the concourse's inlay: a ring of dark stone round the fountain court, a compass in the middle
  x.strokeStyle = 'rgba(70,60,52,0.7)'; x.lineWidth = 10; x.beginPath(); x.ellipse(W / 2, 14.5 * pz + pz / 2, 5.6 * px, 4.4 * pz, 0, 0, 7); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.ellipse(W / 2, 14.5 * pz + pz / 2, 6.2 * px, 5 * pz, 0, 0, 7); x.stroke();
  // the supermarket's entrance mats inside its doors
  for (const [a, b] of [[10, 13], [14, 16], [cw - 13, cw - 10], [cw - 16, cw - 14]]) { x.fillStyle = 'rgba(40,40,44,0.8)'; x.fillRect(a * px, 6.1 * pz, (b - a) * px, 0.85 * pz); }
  // each store's entrance mat
  for (const i of [7, cw - 8]) { x.fillStyle = 'rgba(40,36,34,0.85)'; x.fillRect((i - 0.8) * px, 13 * pz, 2.6 * px, 4 * pz); }
  // scuffs and the odd spill
  for (let k = 0; k < 60; k++) { const r = 6 + rnd() * 26, g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(60,50,40,0.18)'); g.addColorStop(1, 'rgba(60,50,40,0)'); x.save(); x.translate(rnd() * W, rnd() * H); x.scale(1, 0.4 + rnd()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

// ---- building it: each kind's piece (parts: folded into a few meshes by world/arena.js), and its footprint for what
// walks into it and what a round hits (cellBox, not the whole cell)
let mP = null, mParts = null, mBoxes = null;
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
  const H = MALL_H.h;
  const ii = i - MALL_B[0], jj = j - MALL_B[1], conc = jj >= 7 && jj <= 22 && ii >= 7 && ii <= 28;   // (faces the concourse)
  if (conc) {
    const col = MLM.front[Math.floor((ii + jj * 3) / 4) % MLM.front.length];
    mBox(1, 0.35, 1, MLM.base, x, 0.175, z); mBox(0.96, H - 1.05, 0.96, MLM.glass, x, 0.35 + (H - 1.05) / 2, z);
    mBox(1, 0.7, 1, col, x, H - 0.35, z); mBox(1.02, 0.05, 1.02, MLM.trim, x, H - 0.72, z);
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
    // (the boxes not folded in with the rest: each its own, to be shot off the shelf, world/arena-boxes.js)
    for (let n = 0; n < 3; n++) if (rand() < 0.8) { const w = rr(0.24, 0.32), h = rr(0.22, 0.42), o = -0.32 + n * 0.32, d = rr(0.3, 0.6), c = Math.floor(rand() * 3), bx = x + (alongX ? o : rr(-0.1, 0.1)), bz = z + (alongX ? rr(-0.1, 0.1) : o); mBoxes.add(bx, y + 0.02 + h / 2, bz, w, h, d, [MLM.box, MLM.boxB, MLM.boxW][c].color); }
  }
}
// a display kiosk: a white island with a dark plinth, a lit display along each long side and a brand board on top
function mallKiosk(i, j, x, z) {
  const H = MALL_H.K; mBox(1, 0.25, 1, MLM.kioskDk, x, 0.125, z); mBox(0.96, H - 0.55, 0.96, MLM.kiosk, x, 0.25 + (H - 0.55) / 2, z); mBox(1, 0.3, 1, MLM.kioskDk, x, H - 0.15, z);
  for (const s of [-1, 1]) if (MALL_KIND(i + s, j) !== 'K') mBox(0.03, 0.98, 0.88, MLM.kioskDk, x + s * 0.49, 1.1, z);   // (its displays' bezels: the pictures in them, mallDress)
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
  if (jj === 4) for (const s of [-1, 1]) if (MALL_KIND(i, j + s) === '.') { mBox(0.9, 2.1, 0.03, MLM.steel, x, 1.05, z + s * 0.51); mBox(0.012, 2.1, 0.035, MLM.leg, x, 1.05, z + s * 0.51); }   // (a lift's doors, the gap between its leaves)
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
  const tt = mallCeilTex(); tt.repeat.set((x1 - x0) / 1.2, (z1 - z0) / 1.2);   // (its tiles: two to a 1.2 m repeat)
  const t = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0xffffff, { map: tt })); t.rotation.x = Math.PI / 2; t.position.set((x0 + x1) / 2, MALL_CEIL, (z0 + z1) / 2); c.add(t);
  for (const [ci2, cj, warm] of MALL_LAMPS) {
    const x = cxw(MALL_B[0] + ci2), z = cxw(MALL_B[1] + cj);
    if (warm) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.22, 12), MLM.pend); p.position.set(x, MALL_CEIL - 0.55, z); c.add(p); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4), MLM.leg); w.position.set(x, MALL_CEIL - 0.22, z); c.add(w); }
    else { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), MLM.panel); p.position.set(x, MALL_CEIL - 0.03, z); c.add(p); }
  }
  mallUp.forEach(u => c.add(u)); mergeInto(c, mallUp); mallUp.length = 0;   // (the cut-down walls' upper parts, mallWall, and the overhead dressing, mallDress / mallOverhead: folded)
  mallTexFold(c, mUpTex);
  c.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); c.visible = false; g.add(c); mallCeil = c;
}
// (shown with the first-person view, each frame)
function mallTick() { if (mallCeil) mallCeil.visible = fpOn(); }
// ---- dressing it: what makes it read as a real mall after hours, none of it in the grid (it never stops a step, a
// round or a look: tools/mall-plan.py's cover is all as it was). What's on a wall stands out from it no more than
// MALL_DRESS.out (inside the 0.3 m a body's kept off a wall: player/movement.js), what's on low cover stays on it, and
// what's above head height over the walkways is in the ceiling's group, seen only from your own eyes (mallUp, mUpTex).
// Every picture's lifted MALL_DRESS.lift off the face it's on (no two surfaces in one plane: no z-fighting), and is
// drawn whole on it (arena-mall-art.js fits its words inside its edges).
//  - each shop's glass with the shop behind it, its name on its sign band (one per shop, centred on its frontage); the
//    anchor stores' display windows and names
//  - the kiosks' lit displays; a directory board and a bin on each pillar; bench seats round the planters' rims
//  - the food court: the stalls' menu boards, tills and tray stacks on the counters, a tray on some tables, banquettes
//    and the Food court sign along the seating island, a tray return at its end
//  - the supermarket: the lift doors and their sign, fire extinguishers, an electrical board, its notices
//  - the anchor stores: slatwall along their outer walls hung with clothes, the store's name over it
//  - overhead (from your own eyes): the ceiling's tiles, bulkheads over the shopfronts and headers over each opening
//    with its sign, exit signs, sprinklers, vents, cameras and banners
const MALL_DRESS = { out: 0.25, lift: 0.012 };
const mDressMat = { wood: lam(0x8a6a44), bin: lam(0x2c2f33), binTop: lam(0x8a9096), red: lam(0xb8261e), tray: lam(0x7a2a24), till: lam(0x1d1f22), bench: lam(0x6e3a2a), slat: mTall(0xd8d0c2), rail: lam(0x9aa0a4), dk: mTall(0x2a2c30) };
const mTexCache = new Map();
// a picture's material (glow: lit from inside, as a sign or a screen, its colours whole however dark it is round it);
// dithered away with the wall it's on, as the walls are from above (core/shaders.js 'tree')
function mTexMat(key, make, glow) {
  if (mTexCache.has(key)) return mTexCache.get(key);
  const t = make(), m = new THREE.MeshLambertMaterial(glow ? { color: 0x303030, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.8 } : { map: t });
  if (glow) m.userData.glow = true;
  const L = lit(m, 'tree'); mTexCache.set(key, L); return L;
}
let mTexParts = null, mUpTex = null;
// a picture w by h facing d ([dx, dz]) on the face of a cell, its middle at (x, y, z); u0..u1 the part of its
// picture across it; up: only from your own eyes
function mPic(w, h, mat, x, y, z, d, u0 = 0, u1 = 1, up = false) {
  const g = new THREE.PlaneGeometry(w, h); if (u0 !== 0 || u1 !== 1) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + uv.getX(k) * (u1 - u0)); }
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.y = Math.atan2(d[0], d[1]); m.updateMatrix();
  (up ? mUpTex : mTexParts).push(m); return m;
}
// a box only seen from your own eyes (overhead: mallUp)
const mUpBox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); mallUp.push(m); return m; };
// a box on a face: across it a, up it h, out of it o (from the face, f metres off the cell's middle)
const mOnFace = (d, a, h, o, mat, x, y, z, f, up) => (up ? mUpBox : mBox)(d[0] ? o : a, h, d[0] ? a : o, mat, x + d[0] * (f + o / 2), y, z + d[1] * (f + o / 2));
// the pictures folded into one mesh a material, with their pictures' places (core/geometry.js mergeInto keeps none)
function mallTexFold(parent, list) {
  const by = new Map(); list.forEach(m => { if (!by.has(m.material)) by.set(m.material, []); by.get(m.material).push(m); });
  for (const [mat, ms] of by) {
    const P = [], N = [], U = [];
    for (const m of ms) { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); g.dispose(); m.geometry.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = false; mesh.castShadow = false; parent.add(mesh);
  }
}
const MALL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const mOpen = (i, j) => ['.', 'A', 'B', 'F'].includes(MALL_KIND(i, j));
// the shopfronts: runs of shopfront along the concourse, each split into shops, its glass and its sign
function mallShops() {
  const conc = (ii, jj) => ii >= 8 && ii <= 27 && jj >= 8 && jj <= 21, runs = [];
  for (const d of MALL_DIRS) {
    // (cells along each line facing d, in order)
    const seen = new Set();
    for (let j = MALL_B[1]; j <= MALL_B[3]; j++) for (let i = MALL_B[0]; i <= MALL_B[2]; i++) {
      const front = (a, b) => MALL_KIND(a, b) === 'h' && conc(a + d[0] - MALL_B[0], b + d[1] - MALL_B[1]) && mOpen(a + d[0], b + d[1]);
      if (seen.has(i + ',' + j) || !front(i, j)) continue;
      const run = []; let a = i, b = j; while (front(a, b)) { run.push([a, b]); seen.add(a + ',' + b); if (d[0]) b++; else a++; }
      runs.push({ d, run });
    }
  }
  let sn = 0;
  for (const { d, run } of runs) {
    const anchor = d[0] !== 0, parts = anchor ? 1 : Math.ceil(run.length / 4), per = Math.ceil(run.length / parts);
    for (let p = 0; p < parts; p++) {
      const cells = run.slice(p * per, (p + 1) * per); if (!cells.length) continue;
      const A = anchor ? MALL_ANCHORS[d[0] > 0 ? 0 : 1] : null, S = A ? null : MALL_STORES[sn++ % MALL_STORES.length], type = A ? 'clothes' : S.type, key = A ? 'anc' + d[0] : 'st' + (sn - 1) % MALL_STORES.length;
      const glass = mTexMat('in-' + key, () => mallShopTex(type, 3 + sn * 17 + (A ? 99 : 0)), true), H = MALL_H.h, f = 0.48 + MALL_DRESS.lift / 1.2;
      cells.forEach(([i, j], k) => mPic(0.96, 1.56, glass, cxw(i) + d[0] * f, 0.36 + 0.78, cxw(j) + d[1] * f, d, (k % 2) * 0.5, (k % 2) * 0.5 + 0.5));
      // its sign, centred on its frontage (on the band, lifted off it clear of the trim under it)
      const n = cells.length, w = Math.min(n - 0.3, A ? 3.4 : 2.6), [i0, j0] = cells[0], [i1, j1] = cells[n - 1], mx = (cxw(i0) + cxw(i1)) / 2, mz = (cxw(j0) + cxw(j1)) / 2;
      const sign = mTexMat('sg-' + key, () => mallSignTex(A ? A.name : S.name, A ? A.col : S.col, w), true);
      mPic(w, 0.46, sign, mx + d[0] * (0.5 + MALL_DRESS.lift + 0.008), H - 0.34, mz + d[1] * (0.5 + MALL_DRESS.lift + 0.008), d);
    }
  }
}
function mallDress(g) {
  const r = seeded(9131), L = MALL_DRESS.lift, cx = cxw(MALL_B[0] + 17.5);   // (the middle, east to west)
  mallShops();
  for (let j = MALL_B[1]; j <= MALL_B[3]; j++) for (let i = MALL_B[0]; i <= MALL_B[2]; i++) {
    const k = MALL_KIND(i, j), x = cxw(i), z = cxw(j), ii = i - MALL_B[0], jj = j - MALL_B[1];
    // the kiosks' displays, in their bezels (mallKiosk)
    if (k === 'K') for (const s of [-1, 1]) if (MALL_KIND(i + s, j) !== 'K') mPic(0.8, 0.9, mTexMat('ad' + ((jj + ii) % 3), () => mallAdTex((jj + ii) % 3), true), x + s * (0.505 + L), 1.1, z, [s, 0]);
    // each pillar: the directory on the face toward the middle, a bin on the face away from it
    if (k === 'P') {
      const s = x < cx ? 1 : -1, dd = [s, 0], db = [-s, 0];
      mOnFace(dd, 0.72, 1.24, 0.03, mDressMat.dk, x, 1.36, z, 0.45);
      mPic(0.64, 1.12, mTexMat('dir' + ii + ',' + jj, () => mallDirTex(MALL_PLAN, ii, jj), true), x + s * (0.48 + L), 1.36, z, dd);
      mOnFace(db, 0.42, 0.8, 0.24, mDressMat.bin, x, 0.4, z, 0.45); mOnFace(db, 0.44, 0.05, 0.26, mDressMat.binTop, x, 0.825, z, 0.44); mOnFace(db, 0.26, 0.05, 0.01, mDressMat.till, x, 0.72, z, 0.69);
    }
    // a planter's rim: bench boards round it
    if (k === 'p') { for (const s of [-1, 1]) { mBox(0.95, 0.05, 0.16, mDressMat.wood, x, 0.73, z + s * 0.395); mBox(0.16, 0.05, 0.63, mDressMat.wood, x + s * 0.395, 0.73, z); } }
    // a food counter: a till here and there, a stack of trays, a napkin box
    if (k === 'c') {
      const along = MALL_KIND(i - 1, j) === 'c' || MALL_KIND(i + 1, j) === 'c', top = MALL_H.c;
      if ((ii + jj) % 2 === 0) { mBox(0.3, 0.16, 0.26, mDressMat.till, x, top + 0.08, z); mBox(0.26, 0.12, 0.03, mDressMat.dk, x + (along ? 0 : 0.1), top + 0.22, z + (along ? 0.1 : 0)); }
      else { for (let t = 0; t < 5; t++) mBox(0.36, 0.014, 0.27, mDressMat.tray, x + (along ? -0.15 : 0), top + 0.01 + t * 0.016, z + (along ? 0 : -0.15)); mBox(0.1, 0.12, 0.1, MLM.steel, x + (along ? 0.25 : 0), top + 0.06, z + (along ? 0 : 0.25)); }
    }
    // a tray left on some of the tables
    if (k === 'T' && r() < 0.6) { const a = r() * 6.28; const t = mBox(0.36, 0.014, 0.27, mDressMat.tray, x + Math.cos(a) * 0.15, 0.792, z + Math.sin(a) * 0.15); t.rotation.y = a; mBox(0.08, 0.1, 0.06, MLM.steel, x - Math.cos(a) * 0.2, 0.835, z - Math.sin(a) * 0.2); }
  }
  // ---- the food court's seating island (cols 16-19, rows 23-26): banquettes down its sides, its sign over them, a tray
  // return with two bins at its south end
  for (const s of [-1, 1]) {
    const fx = cxw(MALL_B[0] + (s < 0 ? 16 : 19)) + s * 0.5, d = [s, 0];
    for (let jj = 23; jj <= 26; jj++) { const z = cxw(MALL_B[1] + jj); mBox(0.2, 0.4, 0.96, mDressMat.dk, fx + s * 0.1, 0.2, z); mBox(0.24, 0.07, 0.98, mDressMat.bench, fx + s * 0.12, 0.435, z); mBox(0.06, 0.4, 0.98, mDressMat.bench, fx + s * 0.03, 0.72, z); }
    mPic(2.4, 0.5, mTexMat('fc', () => mallSignTex('Food Court', '#3a2e24', 2.4), true), fx + s * L * 2, 2.2, cxw(MALL_B[1] + 24.5), d);
  }
  { const z = cxw(MALL_B[1] + 26) + 0.5, d = [0, 1], x0 = cxw(MALL_B[0] + 17.5);
    mOnFace(d, 1.2, 0.9, 0.24, mDressMat.dk, x0, 0.45, z - 0.5, 0.5); mOnFace(d, 1.24, 0.04, 0.26, mDressMat.binTop, x0, 0.92, z - 0.5, 0.49);
    for (const s of [-1, 1]) { mOnFace(d, 0.42, 0.8, 0.24, mDressMat.bin, x0 + s * 1.2, 0.4, z - 0.5, 0.5); mOnFace(d, 0.44, 0.05, 0.26, mDressMat.binTop, x0 + s * 1.2, 0.825, z - 0.5, 0.49); }
    mPic(1.6, 0.4, mTexMat('thx', () => mallSignTex('Thank you', '#2a2e33', 1.6), true), x0, 1.45, z + L, d); }
  // ---- the stalls' menu boards: on the dividers between them (cols 8 and 27, facing the counters), on the west wall
  // over its counter, and (only from your own eyes: the south and east walls are cut down) over the rest
  const menu = (n, x, y, z, d, up) => mPic(2.0, 0.75, mTexMat('menu' + n, () => mallMenuTex(n), true), x + d[0] * L * 2, y, z + d[1] * L * 2, d, 0, 1, up);
  menu(0, cxw(MALL_B[0] + 8) + 0.5, 1.75, cxw(MALL_B[1] + 27), [1, 0]); menu(1, cxw(MALL_B[0] + 27) - 0.5, 1.75, cxw(MALL_B[1] + 27), [-1, 0]);
  menu(2, cxw(MALL_B[0]) + 0.5, 1.9, cxw(MALL_B[1] + 25), [1, 0]); menu(3, cxw(MALL_B[2]) - 0.5, 1.9, cxw(MALL_B[1] + 25), [-1, 0], true);
  menu(3, cxw(MALL_B[0] + 11), 2.0, cxw(MALL_B[3]) - 0.5, [0, -1], true); menu(1, cxw(MALL_B[0] + 24), 2.0, cxw(MALL_B[3]) - 0.5, [0, -1], true);
  // ---- the supermarket: the lifts' sign, fire extinguishers with their signs, an electrical board, safety posters (on
  // the north wall, which stands full height)
  mPic(1.6, 0.4, mTexMat('lift', () => mallSignBoard('lift'), false), cxw(MALL_B[0] + 17.5), 2.35, cxw(MALL_B[1] + 4) - 0.5 - L, [0, -1]);
  const nz0 = cxw(MALL_B[1]) + 0.5;
  for (const ii of [4, 31]) { const x = cxw(MALL_B[0] + ii); mCyl(0.075, 0.075, 0.42, mDressMat.red, x, 0.95, nz0 + 0.12, 10); mOnFace([0, 1], 0.06, 0.12, 0.08, mDressMat.dk, x, 1.1, nz0 - 0.5, 0.5); mPic(0.32, 0.2, mTexMat('fire', () => mallSignBoard('fire'), false), x, 1.45, nz0 + L, [0, 1]); }
  mOnFace([0, 1], 0.6, 0.8, 0.12, mDressMat.binTop, cxw(MALL_B[0] + 13), 1.5, nz0 - 0.5, 0.5); mOnFace([0, 1], 0.5, 0.05, 0.01, mDressMat.till, cxw(MALL_B[0] + 13), 1.7, nz0 - 0.5, 0.62);
  for (const [ii, kind] of [[7, 'safety'], [24, 'staff'], [28, 'safety']]) mPic(0.5, 0.32, mTexMat('bd-' + kind, () => mallSignBoard(kind), false), cxw(MALL_B[0] + ii), 1.6, nz0 + L, [0, 1]);
  // ---- the anchor stores: slatwall along their outer walls (the west one's own; the east one's from your own eyes,
  // that wall being cut down), hung with clothes on rails, the store's name over it
  for (const s of [1, -1]) {
    const fx = s > 0 ? cxw(MALL_B[0]) + 0.5 : cxw(MALL_B[2]) - 0.5, d = [s, 0], up = s < 0, A = MALL_ANCHORS[s > 0 ? 0 : 1];
    for (const [ja, jb] of [[9, 11], [18, 20]]) {
      const z0 = cxw(MALL_B[1] + ja) - 0.4, z1 = cxw(MALL_B[1] + jb) + 0.4, zm = (z0 + z1) / 2;
      (up ? mUpBox : mBox)(0.03, 1.7, z1 - z0, mDressMat.slat, fx + s * 0.015, 1.25, zm);
      for (const y of [1.65, 0.95]) {
        (up ? mUpBox : mBox)(0.03, 0.03, z1 - z0 - 0.2, mDressMat.rail, fx + s * 0.16, y + 0.05, zm);
        for (let z = z0 + 0.15; z < z1 - 0.15; z += 0.09) { const c = MLM.front[Math.floor(r() * MLM.front.length)]; (up ? mUpBox : mBox)(0.22, rr2(r, 0.42, 0.58), 0.035, r() < 0.5 ? c : MLM.wrap, fx + s * 0.15, y - 0.24, z); }
      }
    }
    mPic(2.4, 0.5, mTexMat('anw' + s, () => mallSignTex(A.name, A.col, 2.4), true), fx + s * L * 3, 2.35, cxw(MALL_B[1] + 14.5), d, 0, 1, up);
  }
}
const rr2 = (r, a, b) => a + r() * (b - a);
// ---- overhead, from your own eyes: bulkheads down to the shop walls, a header over each opening in them (with an
// exit sign over the ways out), sprinklers, vents, cameras and banners
function mallOverhead() {
  const r = seeded(4471), wallM = mTall(0xd9d2c4), H = MALL_H.h;
  for (let j = MALL_B[1]; j <= MALL_B[3]; j++) for (let i = MALL_B[0]; i <= MALL_B[2]; i++) {
    const k = MALL_KIND(i, j), x = cxw(i), z = cxw(j), ii = i - MALL_B[0], jj = j - MALL_B[1];
    if (k === 'h') mUpBox(1, MALL_CEIL - H, 1, wallM, x, (H + MALL_CEIL) / 2, z);
    // (an opening in the shop walls' lines: rows 7 and 22, the anchor stores' fronts, cols 7 and 28)
    const line = (jj === 7 || jj === 22) && ii >= 1 && ii <= 34 ? 'x' : (ii === 7 || ii === 28) && jj >= 8 && jj <= 21 ? 'z' : null;
    if (line && k !== 'h') {
      mUpBox(line === 'x' ? 1 : 0.3, MALL_CEIL - 2.5, line === 'x' ? 0.3 : 1, wallM, x, (2.5 + MALL_CEIL) / 2, z);
      const end = line === 'x' ? MALL_KIND(i - 1, j) === 'h' : MALL_KIND(i, j - 1) === 'h';   // (its sign over the first cell of the opening)
      if (end) for (const s of [-1, 1]) { const d = line === 'x' ? [0, s] : [s, 0]; mPic(0.42, 0.16, mTexMat('exit', () => mallSignBoard('exit'), true), x + d[0] * (0.145 + MALL_DRESS.lift), 2.41, z + d[1] * (0.15 + MALL_DRESS.lift), d, 0, 1, true); mUpBox(line === 'x' ? 0.44 : 0.29, 0.18, line === 'x' ? 0.29 : 0.44, mDressMat.dk, x, 2.41, z); }
    }
    if (mOpen(i, j) || k === 'w') {
      if (ii % 3 === 1 && jj % 3 === 1) { mUpBox(0.04, 0.04, 0.04, MLM.steel, x, MALL_CEIL - 0.02, z); }
      if (ii % 6 === 4 && jj % 5 === 2) mUpBox(0.6, 0.02, 0.6, mDressMat.bin, x + 0.2, MALL_CEIL - 0.01, z);
      if ((ii === 9 || ii === 26) && (jj === 8 || jj === 21)) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mDressMat.till); c.rotation.x = Math.PI; c.position.set(x, MALL_CEIL, z); mallUp.push(c); }
    }
  }
  for (const [ii, jj, n] of [[12, 12, 0], [12, 17, 1], [23, 12, 1], [23, 17, 0]]) {
    const x = cxw(MALL_B[0] + ii), z = cxw(MALL_B[1] + jj), m = mTexMat('ban' + n, () => mallBannerTex(n), false);
    for (const s of [-1, 1]) mPic(0.4, 1.2, m, x + s * 0.004, 2.95, z, [s, 0], 0, 1, true);
    mUpBox(0.02, 0.02, 0.46, mDressMat.rail, x, 3.56, z); mUpBox(0.006, 0.05, 0.006, mDressMat.rail, x, 3.59, z);
  }
}
// the whole map, into its group (g): its pieces (to be folded into a few meshes) back
function mallBuild(g) {
  mP = g; mParts = []; mTexParts = []; mUpTex = []; mBoxes = arBoxSet('mall', g);   // (the shelves' boxes, each to be shot off: world/arena-boxes.js)
  const x0 = cxw(MALL_B[0]) - 0.5, x1 = cxw(MALL_B[2]) + 0.5, z0 = cxw(MALL_B[1]) - 0.5, z1 = cxw(MALL_B[3]) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat(lam(0xffffff, { map: mallFloorTex() }), 'terrazzo', [x0, z0, x1, z1], [['concrete', 0, 0, x1 - x0, 7], ['checker', 0, 23, x1 - x0, z1 - z0], ['carpet', 1, 8, 7, 22], ['carpet', -7, 8, -1, 22]])); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
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
  mallDress(g); mallOverhead(); mallOutside(g); mallCeiling(g); mBoxes.done();
  mallTexFold(g, mTexParts); mTexParts = mUpTex = null;   // (the pictures, folded with their places on them: mallTexFold)
  const parts = mParts; mP = mParts = null; return parts;
}
// the map as world/arena.js takes it (AR_MAPS)
export const MALL = {
  id: 'mall', name: 'Larkspur Mall', note: 'Indoors: the supermarket, the concourse and its fountain, the food court',
  plan: MALL_PLAN, b: MALL_B, h: MALL_H, low: MALL_LOW, vault: MALL_LOW, walls: '#h', what: MALL_WHAT, build: mallBuild, indoor: true, tod: 20.6, foot: 'tile',
  // (its lights: the panels cool white, the pendants warm, always on, lighting/lightmap.js)
  lights: () => MALL_LAMPS.map(([i, j, warm]) => ({ arena: true, always: true, x: cxw(MALL_B[0] + i), z: cxw(MALL_B[1] + j), r: warm ? 8.5 : 10, col: warm ? [1, 0.8, 0.55] : [0.9, 0.95, 1], int: warm ? 1.15 : 1.05 }))
};
