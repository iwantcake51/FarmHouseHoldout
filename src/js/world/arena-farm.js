// The arena's farm map: "Harlan Farm", a working farm its people fenced and boarded up against the dead with whatever
// they had (sheet tin, pallets, wire, their own cars) and then left. Not the farm the survival game's played on: its own
// world (world/arena.js arenaUp takes the whole of that farm out of the scene while it's up). A big red barn with its
// gambrel roof and hayloft, a machine shed at each end with its workbenches, a gravel farmyard with its silos, wind
// pumps, troughs and woodpiles, a field of corn stubble behind a hedgerow with the farmhouse's burnt shell standing in
// it, corrals with hen houses, and the country round it: post-and-rail and wire fences, hedges, a gravel road with the
// mailbox at the end of the lane, the power line, the woods, a cornfield nobody harvested. Designed and checked in
// tools/farm-plan.py (reachability, spawn sightlines, lane sightlines, corridors, corner pinches, timings):
//  - each spawn a machine shed at its end, three ways out: north into its corral and south into the field (a rack of
//    parts just inside each, round its far end, so nothing outside sees in), and wide doors east onto the yard with
//    the tractor and its hay wagon parked out in front of them
//  - NORTH, the Barn: close quarters. Stalls along its north wall under the hayloft, hay mows standing in it as
//    islands, its big sliding doors at each end out of each side's corral, its south wall burnt through by its ends
//    (the fallen boards lying charred in the breach: hfBreach) and a door each side in it into
//    the yard: the flag's north approaches, a mow just inside each so the yard never sees into it. Its roof's drawn
//    only from your own eyes (from above you look in through where it'd be, as the cutaway does the farmhouse's)
//  - MIDDLE, the Farmyard: the contest. Between the grain silos and the wind pumps, the flag between the two troughs
//  - SOUTH, the Field: the long lane, the rifles'. Bales, a fence line half pulled down and culvert pipes for low
//    cover, a hay mow out in it each side, the farmhouse's burnt shell in the very middle off the hedgerow and the corn
//    crib against the south fence, so it's never seen end to end; a gap where the hedgerow died back each side nearer
//    the sheds and a gate in it each side behind the wind pump are the middle's ways south
// Hardly a line runs from the barn into the field; the longest anywhere is about 31 m, corner to corner across it.
// What dresses it never changes the fight: on the floor only what's flat or ankle high (gravel, ruts, stubble), the
// rest on the walls, on roofs, inside what's already solid in the plan, or out past the fences.

import { rand, rr, seeded } from '../core/math.js';
import { floorMat } from './floors.js';
import { lam, lit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';
import { LAMP_ON } from '../lighting/static-lights.js';
import { GLOW_LAYER } from '../effects/post.js';
import { arBoxSet } from './arena-boxes.js';
import { liveTex, paintLetters, paintSign, paintSpray } from './sign-art.js';

// its plan, a row a line from north to south (tools/farm-plan.py prints it): # the edge of it (fences, hedge, the
// barn's and the sheds' own outer walls), h the barn's walls, m the machine sheds', x a stall's partition, Y a hay mow
// (big bales stacked high), O a grain silo, R a tractor, W a hay wagon (in the corral, a hen house), e the hedgerow,
// u the farmhouse's shell and the wind pumps' houses, S a shed's racks, T the fuel tank on its stand, C the corn crib
// (all of those stop sight and rounds); y a big bale, f a rail fence, t a water trough, p culvert pipes, k a
// workbench, w a woodpile (seen and shot over, and vaulted); A and B each side's spawn, F the spots a free-for-all
// spawns from
const HF_PLAN = [
  '########h##################h########',
  '#.......h..x..x......x..x..h.......#',
  '#..F....h..x..x......x..x..h....F..#',
  '#.......h.......YYYY.......h.......#',
  '#..WW...........YYYY...........WW..#',
  '#..WW.....y...YYYYYYYY...y.....WW..#',
  '#..WW.........YYYYYYYY.........WW..#',
  '#..........YY..........YY..........#',
  '#.......h..YY..........YY..h.......#',
  '#.......h..YY..........YY..h.......#',
  '#.......h..YY..........YY..h.......#',
  '#mmm...mh..hh...hhhh...hh..hm...mmm#',
  '#kk....m....................m....kk#',
  '#......m.F....OO....OO....F.m......#',
  '#..SSSSm......OO....OO......mSSSS..#',
  '#......m..RR............RR..m......#',
  '#.A....m..RR.F........F.RR..m....B.#',
  '#AAA......RR....tttt....RR......BBB#',
  '#AAAA.....RR............RR.....BBBB#',
  '#AAAA.....WW............WW.....BBBB#',
  '#AAA......WWw...tttt...wWW......BBB#',
  '#.A....m..WW..uu....uu..WW..m....B.#',
  '#......m..WW..uu....uu..WW..m......#',
  '#..SSSSm....................mSSSS..#',
  '#......m.F......uuuu......F.m......#',
  '#kk....m........uuuu........m....kk#',
  '#mmm...mee..ee..uuuu..ee..eem...mmm#',
  '#......TT.......uuuu.......TT......#',
  '#..F...TT.......uuuu.......TT...F..#',
  '#...............uuuu...............#',
  '#...............uuuu...............#',
  '#..fffff...Y............Y...fffff..#',
  '#..........Y..pp....pp..Y..........#',
  '#........F.Y............Y.F........#',
  '#..y.......Y............Y.......y..#',
  '#...............CCCC...............#',
  '#............y..CCCC..y............#',
  '####################################'
];
// where it stands on the grid (cells, its edge included): centred on the grid's middle like the others, so the flag's
// in the same place, between the troughs. 36 m wide: tools/farm-plan.py draws it 42 wide and leaves three columns of
// each half out, so the two sides' sheds stand closer
const HF_B = [4, 3, 39, 40];
const HF_KIND = (i, j) => { const r = HF_PLAN[j - HF_B[1]]; return r ? r[i - HF_B[0]] || '#' : '#'; };
// how tall each kind stands (m), which are low (seen and shot over; all of them vaulted), and what the vault prompt
// calls each (barricades/interactions.js)
const HF_H = { '#': 2.6, h: 4.2, m: 3.4, x: 2.0, Y: 2.6, O: 7.6, R: 2.65, W: 2.5, e: 2.6, u: 3.6, S: 2.3, T: 2.5, C: 3.5, y: 0.88, f: 1.1, t: 0.72, p: 0.92, k: 0.96, w: 0.9 };
const HF_LOW = new Set(['y', 'f', 't', 'p', 'k', 'w']);
const HF_WHAT = { y: 'bale', f: 'fence', t: 'trough', p: 'pipes', k: 'workbench', w: 'woodpile' };
// a plan cell's middle in the world (m), by its column and row in the plan
const hfX = ii => cxw(HF_B[0] + ii), hfZ = jj => cxw(HF_B[1] + jj);
// (the plan's own column and row of a grid cell)
const hfI = i => i - HF_B[0], hfJ = j => j - HF_B[1];
// (where a column of the plan as tools/farm-plan.py first draws it, 42 wide, ends up in this one, 36 wide: three
// columns of each half left out)
const HF_DEL = [12, 17, 18];
const hfC = c => c <= 20.5 ? c - HF_DEL.filter(d => d < c).length : HF_PLAN[0].length - 1 - hfC(41 - c);

// ---- the look of it
// (what stands taller than you dithered away round you from above when it's between you and the camera, as the trees
// are: core/shaders.js 'tree')
const hfTall = c => lit(new THREE.MeshLambertMaterial({ color: c }), 'tree');
const HF_M = {
  barn: [hfTall(0x7c2f22), hfTall(0x86352a), hfTall(0x732c21)], barnDk: hfTall(0x5a221a), char: hfTall(0x1f1b18), trim: hfTall(0xcfc6b0), stone: hfTall(0x7f7a70), conc2: hfTall(0x9a958c),
  tin: [hfTall(0x8f9391), hfTall(0x9fa29d), hfTall(0x7f8381)], rust: hfTall(0x7b4a2d), tinDk: hfTall(0x55595a),
  board: [hfTall(0x6f5a43), hfTall(0x86705a), hfTall(0x5e4c3a), hfTall(0xa38c64)], post: hfTall(0x4a3c2e), white: hfTall(0xcfc8b6), whiteDk: hfTall(0xa9a292),
  hedge: [hfTall(0x2e4824), hfTall(0x3a5729), hfTall(0x45622f)], bark: hfTall(0x4a3b2c), leaf: [hfTall(0x3d5f2c), hfTall(0x4d6e33), hfTall(0x2f4f26)],
  brick: [hfTall(0x7c4c3c), hfTall(0x6b4134), hfTall(0x86564a)], soot: hfTall(0x2a2421), rubble: hfTall(0x3d3430), plaster: hfTall(0x9b9184),
  hay: [hfTall(0xb59a58), hfTall(0xa48a4c), hfTall(0xc2a763), hfTall(0x9c8f6a)], hayLow: [lam(0xb59a58), lam(0xa48a4c), lam(0xc2a763)], twine: lam(0x5f4f36),
  silo: hfTall(0xa7acae), siloDk: hfTall(0x7b8083), red: hfTall(0x8e2b1f), redDk: hfTall(0x5e1d16), dark: hfTall(0x2a2826), tyre: hfTall(0x1b1a19), rim: hfTall(0xb9a67a), glass: hfTall(0x26302f),
  alu: hfTall(0xa3a6a4), aluDk: hfTall(0x6f7372), corn: hfTall(0xc8952f), tank: hfTall(0x4d5a3a), tankDk: hfTall(0x3a4430), steel: hfTall(0x5d6163),
  rack: hfTall(0x5d6a72), rackDk: hfTall(0x384046), can: [lam(0xa3342a), lam(0x3f5f34), lam(0x8a7a3a)], tread: lam(0x1d1c1b), crate: lam(0x8a6b45),
  wood: lam(0x6c563f), woodDk: lam(0x4b3b2b), galv: lam(0x9aa1a3), galvDk: lam(0x737a7c), water: lam(0x3f5f5e, { transparent: true, opacity: 0.88 }), pipe: lam(0x9a958b), pipeIn: lam(0x3a3733),
  conc: lam(0x8d8a83), bag: lam(0x8a7a55), iron: lam(0x2f3a33), log: [lam(0x6a5038), lam(0x5a442f), lam(0x7a5e40)], tarp: lam(0x34506e), peg: lam(0x9a7a52), tool: lam(0x2c2c2c), mail: lam(0x6d7072),
  stalk: [lam(0x8a7650), lam(0x74633f), lam(0x9a865e)], cornTall: [hfTall(0x9c8452), hfTall(0x857146), hfTall(0xa89060)], cloth: [hfTall(0xd9d4c6), hfTall(0x6a7f96), hfTall(0x9a4a3c)],
  car: [hfTall(0x6e7f86), hfTall(0x7a3a2c), hfTall(0x4f5a3c)], carDk: hfTall(0x1e1f20),
  pole: lam(0x4f4032), poleTall: hfTall(0x4f4032), rail: hfTall(0x7a6a52), lamp: new THREE.MeshBasicMaterial({ color: 0x4a4c4e }), hood: lam(0x3a3d3f),
  // (seen only from your own eyes, never folded in: the roofs)
  rafter: lam(0x3a2e24), roofTin: lam(0x6f7371, { side: THREE.DoubleSide }), roofDk: lam(0x4b4f4e, { side: THREE.DoubleSide }), gable: lam(0x7c2f22), gableTrim: lam(0xcfc6b0), loft: lam(0x6b5640), loftHay: lam(0xb59a58),
  bulb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
};
const hfPick = a => a[Math.floor(rand() * a.length)];

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
  both(1, 27, cw / 2, ch - 1, 'rgba(84,66,46,0.95)');
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
  both(9, 1, 15, 3, 'rgba(96,78,48,0.6)');
  for (let k = 0; k < 4000; k++) { const sx = 9 * px + rnd() * (cw - 18) * px, sz = pz + rnd() * 10 * pz, a = rnd() * 3.14; x.strokeStyle = `rgba(${rnd() < 0.6 ? '178,156,102' : '140,120,80'},0.6)`; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sz); x.lineTo(sx + Math.cos(a) * 6, sz + Math.sin(a) * 6); x.stroke(); }
  // the machine sheds: a concrete slab, its joints every 2 m, oil where the machines stood
  both(1, 12, 7, 26, 'rgba(140,137,130,0.95)');
  x.strokeStyle = 'rgba(70,68,64,0.6)'; x.lineWidth = 2;
  for (const s of [0, 1]) { const ix = i => s ? W - i * px : i * px;
    for (let i = 1; i <= 7; i += 2) { x.beginPath(); x.moveTo(ix(i), 12 * pz); x.lineTo(ix(i), 26 * pz); x.stroke(); }
    for (let j = 12; j <= 26; j += 2) { x.beginPath(); x.moveTo(ix(1), j * pz); x.lineTo(ix(7), j * pz); x.stroke(); }
    for (let k = 0; k < 8; k++) blot(ix(1.5 + rnd() * 5), (13 + rnd() * 12) * pz, 8 + rnd() * 20, 'rgba(30,28,26,0.4)', 0.5 + rnd() * 0.6); }
  // the gravel drive: out of each shed's doors (the tractor parked on it), across the yard's middle round the troughs,
  // up to the barn door and down past the wind pump to the hedge gate; tyre ruts worn along it
  for (const s of [0, 1]) {
    const P = (i, j) => { const u = hfC(i - 0.5) + 0.5; return [(s ? cw - u : u) * px, j * pz]; }, path = new Path2D();
    path.moveTo(...P(7.6, 18.5)); path.lineTo(...P(21, 18.5));
    path.moveTo(...P(12.5, 18)); path.bezierCurveTo(...P(14.5, 17.5), ...P(15.5, 15), ...P(15.5, 11.6));
    path.moveTo(...P(12.5, 19)); path.bezierCurveTo(...P(14, 20), ...P(13.8, 23.6), ...P(16, 26.4));
    x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = 3.4 * px; x.strokeStyle = 'rgba(138,128,110,0.92)'; x.stroke(path);
    for (let k = 0; k < 7000; k++) { const sx = (s ? cw / 2 : 7) * px + rnd() * 14 * px, sz = 11.5 * pz + rnd() * 15 * pz; if (!x.isPointInStroke(path, sx, sz)) continue; x.fillStyle = `rgba(${rnd() < 0.5 ? '96,88,76' : '182,174,158'},${0.4 + rnd() * 0.5})`; x.fillRect(sx, sz, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
    x.lineWidth = 2.6 * px; x.strokeStyle = 'rgba(80,68,52,0.18)'; x.stroke(path);   // (its edges trodden into the dirt)
    x.strokeStyle = 'rgba(58,48,36,0.5)'; x.lineWidth = 4;
    for (const o of [-0.8, 0.8]) { x.beginPath(); x.moveTo(...P(7.6, 18.5 + o)); x.lineTo(...P(19, 18.5 + o)); x.stroke();
      x.beginPath(); x.moveTo(...P(12.5, 18 + o)); x.bezierCurveTo(...P(14.5 + o, 17.5 + o), ...P(15.5 + o, 15), ...P(15.5 + o, 11.6)); x.stroke(); }
  }
  // round the troughs, the ground's churned to mud where the stock drank, a puddle or two
  for (const j of [17.5, 20.5]) { blot(W / 2, j * pz, 3.2 * px, 'rgba(56,44,32,0.6)', 0.45); blot(W / 2 + (rnd() - 0.5) * 60, j * pz + (j < 19 ? -8 : 8), 14, 'rgba(70,92,98,0.6)', 0.4); }
  // grass grown up along the foot of everything that stands, out of the way of feet: the fences, the walls, the hedge
  const grassy = (i, j) => !(i >= 8 && i <= cw - 9 && j <= 11) && !((i <= 7 || i >= cw - 8) && j >= 11 && j <= 26);   // (not in the barn or the sheds)
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = HF_PLAN[j][i]; if (!'.ABF'.includes(k) || !grassy(i, j)) continue;
    for (const [dx, dz] of HF_D4) { const n = (HF_PLAN[j + dz] || '')[i + dx]; if (!n || '.ABFytfpkw'.includes(n)) continue;
      for (let q = 0; q < 9; q++) { const u = rnd(), sx = (i + 0.5 + dx * (0.5 - u * 0.28) + (dz ? rnd() - 0.5 : 0)) * px, sz = (j + 0.5 + dz * (0.5 - u * 0.28) + (dx ? rnd() - 0.5 : 0)) * pz; x.strokeStyle = `rgba(${rnd() < 0.5 ? '84,98,50' : '112,116,62'},0.75)`; x.lineWidth = 1.5; x.beginPath(); x.moveTo(sx, sz); x.lineTo(sx + (rnd() - 0.5) * 4, sz - 3 - rnd() * 4); x.stroke(); } }
  }
  // feed scattered in the corrals by the hen houses, a feather or two
  for (let k = 0; k < 300; k++) { const sx = (1.5 + rnd() * 5) * px, sz = (3 + rnd() * 5) * pz; x.fillStyle = rnd() < 0.8 ? 'rgba(196,170,96,0.8)' : 'rgba(230,226,214,0.9)'; x.fillRect(rnd() < 0.5 ? sx : W - sx, sz, 1.5, 1.5); }
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

// a sign or something painted: its words on a plane just off the face it's on (pulled toward the eye in the depth test
// too, so it never flickers into the face), always smaller than that face: nothing hangs off an edge or round a corner
function hfSign(text, w, h, col, font, x, y, z, ry, bg) {
  // (painted as a made thing, world/sign-art.js: on a board of its own colour, or by the face it's asked in: a hurried
  // italic's sprayed by hand, the rest lettered on the wall)
  const m0 = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(col), hex = m0 ? '#' + [m0[1], m0[2], m0[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : col;
  const W = 768, H = Math.max(48, Math.round(768 * h / w)), spray = /italic/.test(font);
  const t = liveTex(W, H, (c, W2, H2) => { if (bg) paintSign(c, W2, H2, { text, bg, fg: hex, face: 'shop', wear: 0.6, screws: false }); else if (spray) paintSpray(c, W2, H2, { text, col: hex }); else paintLetters(c, W2, H2, { text, fg: hex, face: 'shop' }); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, { map: t, transparent: true, alphaTest: 0.08, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; hP.add(m); return m;
}

// ---- the edge of it: the grid's outer cells, all walls (nothing's past them), but drawn as what's really there along
// each stretch: the barn's and the sheds' own outer walls, post-and-rail round the corrals with woven wire behind
// (pallets, sheet tin and an old car pushed up against it where the people here made it good), the hedge along the
// field's west side, a wire fence on posts along its south and east with the farm gate in it, chained shut and a pickup
// parked across it. On the two sides toward the camera from above (south and east) nothing stands much above the
// waist, so nothing near it is hidden
const HF_E = HF_PLAN[0].length - 1, HF_S = HF_PLAN.length - 1;
const HF_GATE = [11, 14], hfGate = ii => ii >= HF_GATE[0] && ii <= HF_GATE[1];   // (the farm gate in the south fence: its cells)
function hfBoundary(i, j, x, z) {
  const ii = hfI(i), jj = hfJ(j);
  if (jj === 0 && ii >= 8 && ii <= HF_E - 8) return hfBarnWall(i, j, x, z);
  if ((ii === 0 || ii === HF_E) && jj >= 11 && jj <= 26) return hfShedWall(i, j, x, z);
  if (ii === 0 && jj > 26 && jj < HF_S) return hfHedge(i, j, x, z, true);
  const nx = ii === 0 ? 1 : ii === HF_E ? -1 : 0, nz = jj === 0 ? 1 : jj === HF_S ? -1 : 0;   // (toward the inside)
  const corral = jj <= 10, along = nz ? ii : jj, low = ii === HF_E || jj === HF_S, ax = nz ? 1 : 0, az = nz ? 0 : 1;   // (ax, az: along the fence)
  const B = (w, h, d, m, y, o, l = 0) => hfBox(ax ? w : d, h, az ? w : d, m, x + nx * o + ax * l, y, z + nz * o + az * l);   // (a piece along the fence: w along it, d across, o in toward the inside, l along)
  if (nx && nz) { hfBox(0.24, corral ? 1.9 : 1.5, 0.24, HF_M.poleTall, x, corral ? 0.95 : 0.75, z); return; }   // (a corner: a stout post)
  if (corral) {
    // post-and-rail: a post every two metres, three rails nailed on the inside, woven wire behind (hfMeshFences), a
    // strand of barbed wire on the posts above it (the taller sides only)
    const H = low ? 1.3 : 1.6;
    if (along % 2 === 0) B(0.16, H + (low ? 0 : 0.35), 0.16, HF_M.poleTall, (H + (low ? 0 : 0.35)) / 2, 0);
    for (const y of low ? [0.4, 0.8, 1.2] : [0.45, 0.95, 1.45]) B(1.0, 0.14, 0.05, HF_M.rail, y + rr(-0.02, 0.02), 0.11);
    if (!low) for (const y of [1.75, 1.92]) B(1.0, 0.012, 0.012, HF_M.galvDk, y, -0.02);
    // where it was made good: pallets stood on end and wired to it, sheets of tin, on the inside
    const fix = !low && (nz ? [1, 2, 5, 6, HF_E - 1, HF_E - 2, HF_E - 5, HF_E - 6].includes(ii) : [7, 8, 9].includes(jj));
    if (fix) {
      if ((nz ? ii : jj) % 4 < 2 || !nz) { const s = B(0.92, 1.75, 0.03, rand() < 0.5 ? HF_M.rust : HF_M.tin[0], 0.95, 0.2); s.rotation[ax ? 'z' : 'x'] = rr(-0.03, 0.03); for (let o = -0.36; o <= 0.37; o += 0.18) B(0.03, 1.7, 0.02, HF_M.tinDk, 0.95, 0.225, o); }
      else { B(0.95, 1.2, 0.12, HF_M.board[3], 0.62, 0.24); for (const y of [0.1, 0.62, 1.14]) B(0.95, 0.1, 0.03, HF_M.board[2], y, 0.315); }
    }
  } else {
    // a wire fence: wooden posts every two metres, woven wire (hfMeshFences), two strands of barbed wire over it; the
    // farm gate in the south side, a five-bar gate hung on its posts, shut and chained; pallets wired in here and there
    if (jj === HF_S && hfGate(ii)) {
      if (ii === HF_GATE[0] || ii === HF_GATE[1]) B(0.24, 1.6, 0.24, HF_M.poleTall, 0.8, 0, ii === HF_GATE[0] ? -0.38 : 0.38);
      for (const y of [0.25, 0.48, 0.71, 0.94, 1.17]) B(1.0, 0.05, 0.05, HF_M.galv, y, 0);
      if (ii === HF_GATE[0] + 1 || ii === HF_GATE[0] + 2) { B(0.05, 1.0, 0.05, HF_M.galv, 0.7, 0, ii === HF_GATE[0] + 1 ? 0.45 : -0.45); hfStrut(x - 0.5, 0.25, z, x + 0.5, 1.17, z, 0.04, HF_M.galv); }
      if (ii === HF_GATE[0] + 1) { B(0.06, 0.3, 0.12, HF_M.iron, 0.8, 0.04, 0.5); for (let k = 0; k < 5; k++) B(0.05, 0.03, 0.05, HF_M.iron, 0.75 - k * 0.06, -0.06, 0.48 + (k % 2) * 0.03); }   // (its chain and padlock)
      if (ii === HF_GATE[0] || ii === HF_GATE[1]) for (const y of [0.35, 1.05]) B(0.1, 0.05, 0.06, HF_M.iron, y, 0, ii === HF_GATE[0] ? -0.2 : 0.2);   // (its hinges)
      return;
    }
    if (along % 2 === 0) B(0.13, 1.35, 0.13, HF_M.poleTall, 0.675, 0);
    for (const y of [1.25, 1.38]) B(1.0, 0.012, 0.012, HF_M.galvDk, y, 0.06);
    if ((jj === HF_S && [3, 4, HF_E - 4, HF_E - 3].includes(ii)) || (ii === HF_E && jj === 33)) { B(0.95, 1.15, 0.12, HF_M.board[0], 0.58, 0.18); for (const y of [0.1, 0.58, 1.06]) B(0.95, 0.1, 0.03, HF_M.board[2], y, 0.255); }
  }
}
// the woven wire on the fences, seen through: a run of it along each stretch of fence, from the ground to its height
function hfMeshFences() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(150,154,150,1)'; x.lineWidth = 2.5; x.strokeRect(1.25, 1.25, 61.5, 61.5); for (const y of [20, 42]) { x.beginPath(); x.moveTo(0, y); x.lineTo(64, y); x.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  const X = ii => hfX(ii), Z = jj => hfZ(jj), off = 0.045;
  const runs = [
    [X(0), Z(0) - off, X(7) + 0.5, Z(0) - off, 1.6], [X(HF_E - 7) - 0.5, Z(0) - off, X(HF_E), Z(0) - off, 1.6],   // (the corrals' north sides)
    [X(0) - off, Z(0), X(0) - off, Z(10) + 0.5, 1.6], [X(HF_E) + off, Z(0), X(HF_E) + off, Z(10) + 0.5, 1.3],   // (and their outer sides)
    [X(HF_E) + off, Z(26) + 0.5, X(HF_E) + off, Z(HF_S), 1.15],   // (the field's east side)
    [X(0), Z(HF_S) + off, X(HF_GATE[0] - 0.5), Z(HF_S) + off, 1.15], [X(HF_GATE[1] + 0.5), Z(HF_S) + off, X(HF_E), Z(HF_S) + off, 1.15]   // (its south side, either side of the gate)
  ];
  for (const [ax, az, bx, bz, h] of runs) {
    const L = Math.hypot(bx - ax, bz - az), m = lam(0xffffff, { map: tx.clone(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.map.repeat.set(L * 3.5, h * 3.5); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, h), m); p.position.set((ax + bx) / 2, 0.04 + h / 2, (az + bz) / 2); p.rotation.y = az === bz ? 0 : Math.PI / 2; p.castShadow = true; hP.add(p);
  }
}
// a band along each face of a cell that's open to the floor (h tall at y, t proud of it): a footing, a fascia, a cap's
// edge. Each exactly the cell's width, so two side by side meet and never overlap (an overlap flickers)
function hfLips(i, j, x, z, h, y, t, mat) { for (const [dx, dz] of HF_D4) if (hfOpen(i + dx, j + dz)) hfBox(dx ? t : 1, h, dz ? t : 1, mat, x + dx * (0.5 + t / 2), y, z + dz * (0.5 + t / 2)); }
// the barn's walls: board and batten, red paint gone chalky, on a concrete footing standing proud of them, a white
// fascia board along the top where the roof sits, white corner boards at its corners and the edges of its doors
const hfBarnAt = (i, j) => { const k = HF_KIND(i, j), jj = hfJ(j), ii = hfI(i); return k === 'h' || (k === '#' && jj === 0 && ii >= 8 && ii <= HF_E - 8); };
function hfBarnWall(i, j, x, z) {
  const H = HF_H.h;
  hfBox(1, 0.5, 1, HF_M.conc2, x, 0.25, z);
  hfBox(1, H - 0.72, 1, rand() < 0.15 ? HF_M.barn[1] : HF_M.barn[0], x, 0.5 + (H - 0.72) / 2, z);
  hfBox(1, 0.22, 1, HF_M.trim, x, H - 0.11, z);
  hfLips(i, j, x, z, 0.5, 0.25, 0.05, HF_M.conc2); hfLips(i, j, x, z, 0.22, H - 0.11, 0.04, HF_M.trim);   // (the footing and the fascia standing proud of the boards)
  hfStrips(i, j, x, z, H - 0.22, 4, 0.06, HF_M.barnDk, 0.5);
  for (const [dx, dz] of HF_D4) {
    if (!hfOpen(i + dx, j + dz)) continue;
    for (const s of [-1, 1]) { const li = i + (dz ? s : 0), lj = j + (dx ? s : 0); if (hfBarnAt(li, lj)) continue;   // (the end of a run: a corner board)
      hfBox(dx ? 0.05 : 0.16, H - 0.72, dz ? 0.05 : 0.16, HF_M.trim, x + dx * 0.525 + (dz ? s * 0.42 : 0), 0.5 + (H - 0.72) / 2, z + dz * 0.525 + (dx ? s * 0.42 : 0)); }
  }
}
// a machine shed's walls: corrugated sheet, galvanised or rusted, its ribs proud of it, a dark cap along its top
function hfShedWall(i, j, x, z) {
  const H = HF_H.m, ii = hfI(i), m = HF_M.tin[(Math.floor(ii / 2) + Math.floor(hfJ(j) / 3)) % 3];
  hfBox(1, H, 1, rand() < 0.12 ? HF_M.rust : m, x, H / 2, z);
  hfBox(1, 0.1, 1, HF_M.tinDk, x, H + 0.05, z); hfLips(i, j, x, z, 0.1, H + 0.05, 0.04, HF_M.tinDk);
  hfStrips(i, j, x, z, H, 5, 0.04, HF_M.tinDk);
  if (rand() < 0.2) for (const [dx, dz] of HF_D4) if (hfOpen(i + dx, j + dz)) { hfBox(dx ? 0.02 : rr(0.3, 0.6), rr(0.5, 1.4), dz ? 0.02 : rr(0.3, 0.6), HF_M.rust, x + dx * 0.53, rr(0.4, 1.4), z + dz * 0.53); break; }
}
// a stall's partition: plank boards between two posts, a rail along its top (a thin wall, and that's all its footprint)
function hfStall(i, j, x, z) {
  const alongZ = HF_KIND(i, j - 1) === 'x' || HF_KIND(i, j + 1) === 'x', H = HF_H.x, w = alongZ ? [0.14, 1] : [1, 0.14];
  hfBox(w[0], H, w[1], HF_M.board[2], x, H / 2, z);
  hfBox(alongZ ? 0.2 : 1, 0.1, alongZ ? 1 : 0.2, HF_M.post, x, H + 0.05, z);
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
  for (let k = 0; k < 4; k++) hfBox(rr(0.15, 0.35), 0.02, rr(0.2, 0.5), HF_M.rust, cx + rr(-0.3, 0.3), 1.79, f + rr(0.4, 1.9));
  for (let jj = r.z0 + 0.5; jj < r.z1; jj++) { const front = jj < f + 2; cellBox[idx(ci(r.x0 + 0.5), ci(jj))] = [cx - (front ? 0.78 : 1.0), jj - 0.5, cx, jj + 0.5]; cellBox[idx(ci(r.x1 - 0.5), ci(jj))] = [cx, jj - 0.5, cx + (front ? 0.78 : 1.0), jj + 0.5]; }
}
// a hay wagon, its flat bed loaded with big bales two high (a few gone off the top), its tongue to the tractor's
// drawbar; or, in a corral, a hen house (hfCoop)
function hfWagon(i, j) {
  const r = hfRun(i, j, 'W'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, L = r.z1 - r.z0;
  if (hfJ(j) <= 10) { hfCoop(r); return; }
  {
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
// side of each gate and the gate itself swung back flat against it on its hinges (edge: the stretch along the field's
// west side, the farm's own edge, with no gates)
function hfHedge(i, j, x, z, edge) {
  const H = HF_H.e - 0.3 + rr(-0.1, 0.25), ii = hfI(i), jj = hfJ(j);
  hfBox(1, H, 1, hfPick(HF_M.hedge), x, H / 2, z);
  for (let k = 0; k < 2; k++) hfBlob(rr(0.42, 0.56), hfPick(HF_M.hedge), x + rr(-0.25, 0.25), H + rr(-0.1, 0.05), z + rr(-0.2, 0.2), rr(0.6, 0.9));
  for (const [dx, dz] of HF_D4) if (hfOpen(i + dx, j + dz) && rand() < 0.5) hfBlob(rr(0.25, 0.33), hfPick(HF_M.hedge), x + dx * 0.4 + (dz ? rr(-0.3, 0.3) : 0), rr(0.5, H - 0.4), z + dz * 0.4 + (dx ? rr(-0.3, 0.3) : 0), 0.8);
  if ((edge ? jj : ii) % 7 === 3) { hfCyl(0.12, 0.16, 4.2, HF_M.bark, x, 2.1, z, 7); for (let k = 0; k < 3; k++) hfBlob(rr(0.9, 1.3), hfPick(HF_M.leaf), x + rr(-0.5, 0.5), rr(3.8, 4.8), z + rr(-0.5, 0.5), 0.8); }
  if (edge) return;
  for (const d of [-1, 1]) if (HF_KIND(i + d, j) === '.') {
    hfBox(0.22, 1.7, 0.22, HF_M.poleTall, x + d * 0.38, 0.85, z);
    if (HF_KIND(i + 2 * d, j) === '.') {   // the gate, swung back flat against the hedge on the field side, hung on the post by its hinges
      const gx = x - d * 0.55, gz = z + 0.6;
      for (let y = 0.25; y < 1.2; y += 0.22) hfBox(1.7, 0.04, 0.04, HF_M.galv, gx, y, gz);
      for (const e of [-0.85, 0.85]) hfBox(0.05, 1.1, 0.05, HF_M.galv, gx + e, 0.6, gz);
      hfStrut(gx - 0.85, 0.25, gz, gx + 0.85, 1.15, gz, 0.035, HF_M.galv);
      for (const y of [0.3, 1.05]) hfBox(0.14, 0.05, 0.08, HF_M.iron, x + d * 0.3, y, z + 0.52);   // (its hinges, on the post)
    }
  }
}
// the farmhouse's shell: brick on a stone footing, burnt out, its top ragged, its windows and door boarded over (as
// they were when it still stood), the rooms inside heaped with what fell in, a chimney stack at each end, the porch
// along its south side boarded up all round, its roof sagged onto the boards; and each wind pump's house (hfPump)
function hfRuin(i, j, x, z) {
  const ii = hfI(i), jj = hfJ(j);
  if (jj <= 22) { if (hfFirst(i, j, 'u')) hfPump(i, j); return; }
  if (jj === 24 && (ii === hfC(16) || ii === HF_E - hfC(16))) {   // a chimney stack
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
  const gable = ii === hfC(19) || ii === HF_E - hfC(19), corner = HF_D4.filter(([dx, dz]) => HF_KIND(i + dx, j + dz) !== 'u').length > 1;
  const H = gable ? 3.6 + 1.5 * Math.max(0, 1 - Math.abs(jj - 26.5) / 3) : corner ? 4.4 : 3.6 - 1.2 * Math.exp(-Math.pow((Math.abs(ii - HF_E / 2) - 1) / 1.4, 2)) + 0.15 * Math.sin(ii * 2.1);
  hfBox(1, 0.55, 1, HF_M.stone, x, 0.275, z);
  hfBox(1, H - 0.55, 1, rand() < 0.15 ? HF_M.brick[1] : HF_M.brick[0], x, 0.55 + (H - 0.55) / 2, z);
  hfLips(i, j, x, z, 0.12, 2.9, 0.02, HF_M.stone);   // (the course between its floors)
  for (const [dx, dz] of HF_D4) {
    if (HF_KIND(i + dx, j + dz) === 'u') continue;
    const fx = x + dx * 0.505, fz = z + dz * 0.505, along = (dx ? jj : ii);
    hfBox(dx ? 0.02 : 0.92, rr(0.6, 1.2), dz ? 0.02 : 0.92, HF_M.soot, fx + dx * 0.01, H - 0.75, fz + dz * 0.01);   // (soot up its face from the fire)
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
// (what stands on a shelf: its own mesh, never folded in with the rest, each listed on FARM_MAP.shelfItems so it can
// be shot off its shelf)
const hfLoose = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; hP.add(m); FARM_MAP.shelfItems.push(m); return m; };
// a shed's racks: steel shelving, four shelves of what a farm keeps: jerry cans, oil, tyres, crates of parts
function hfRack(i, j, x, z) {
  const H = HF_H.S, alongX = HF_KIND(i - 1, j) === 'S' || HF_KIND(i + 1, j) === 'S';
  for (const sx of [-0.46, 0.46]) for (const sz of [-0.4, 0.4]) hfBox(0.06, H, 0.06, HF_M.rackDk, x + (alongX ? sx : sz), H / 2, z + (alongX ? sz : sx));
  for (let s = 0; s < 4; s++) {
    const y = 0.1 + s * 0.6; hfBox(alongX ? 1 : 0.86, 0.04, alongX ? 0.86 : 1, HF_M.rack, x, y, z);
    for (let n = 0; n < 3; n++) { const o = -0.32 + n * 0.32, px = x + (alongX ? o : rr(-0.08, 0.08)), pz = z + (alongX ? rr(-0.08, 0.08) : o), q = rand();
      if (q < 0.35) hfLoose(new THREE.BoxGeometry(0.2, 0.34, 0.36), hfPick(HF_M.can), px, y + 0.02 + 0.17, pz);
      else if (q < 0.55) { const t = hfLoose(new THREE.CylinderGeometry(0.27, 0.27, 0.2, 12), HF_M.tread, px, y + 0.02 + 0.27, pz); t.rotation[alongX ? 'x' : 'z'] = Math.PI / 2; }
      else if (q < 0.85) { const h = rr(0.2, 0.4); hfLoose(new THREE.BoxGeometry(rr(0.24, 0.3), h, rr(0.3, 0.55)), HF_M.crate, px, y + 0.02 + h / 2, pz); } }
  }
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
// a rail fence, what's left of the line that once split the field from the sheds' apron: posts at each metre, three
// rails, one hanging off; its end posts leaning, the rails from the rest of it lying in the stubble
function hfFence(i, j, x, z) {
  const endW = HF_KIND(i - 1, j) !== 'f', endE = HF_KIND(i + 1, j) !== 'f';
  for (const e of endE ? [-0.5, 0.42] : [-0.5]) { const p = hfBox(0.13, 1.15, 0.13, HF_M.woodDk, x + (e < 0 && endW ? -0.42 : e), 0.575, z); if ((e < 0 && endW) || e > 0) p.rotation.z = e < 0 ? 0.12 : -0.1; }
  for (const y of [0.36, 0.7, 1.02]) { const b = hfBox(1.0, 0.09, 0.05, HF_M.wood, x, y + rr(-0.02, 0.02), z + 0.05); b.rotation.z = rr(-0.03, 0.03); if (y > 1 && rand() < 0.25) { b.rotation.z = 0.5; b.position.y = 0.75; } }
  if (endW) for (let k = 0; k < 3; k++) { const r = hfBox(1.9, 0.07, 0.09, HF_M.wood, x - 1.6 + rr(-0.2, 0.2), 0.035, z + rr(-0.35, 0.35)); r.rotation.y = rr(-0.25, 0.25); }   // (on the ground, flat: nothing to walk into)
  cellBox[idx(i, j)] = [x - 0.5, z - 0.1, x + 0.5, z + 0.12];
}
// the field's stubble: what's left of last year's corn standing a hand high along the furrows, never where anything
// stands (ankle high: nothing to hide behind, nothing to walk into)
function hfCrops() {
  for (let jj = 27.2; jj < HF_S - 0.3; jj += 0.62) for (let ii = 0.7; ii < HF_E - 0.6; ii += rr(0.35, 0.6)) {
    const x = hfX(ii), z = hfZ(jj) + rr(-0.05, 0.05), i = ci(x), j = ci(z);
    if (!'.ABF'.includes(HF_KIND(i, j)) || Math.abs(hfZ(33.5) - z) < 0.45) continue;   // (none in the ditch)
    let near = false; for (const [dx, dz] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) if (!'.ABF'.includes(HF_KIND(ci(x + dx), ci(z + dz)))) near = true; if (near) continue;
    if (rand() < 0.35) continue;
    const h = rr(0.06, 0.22), s = hfBox(0.022, h, 0.022, hfPick(HF_M.stalk), x, h / 2, z); s.rotation.set(rr(-0.45, 0.45), 0, rr(-0.45, 0.45));
    if (rand() < 0.3) { const l = hfBox(0.3, 0.012, 0.05, hfPick(HF_M.stalk), x + rr(-0.15, 0.15), 0.02, z + rr(-0.1, 0.1)); l.rotation.y = rr(0, 3); }   // (a dead leaf lying)
  }
}
// a hen house in each corral: whitewashed clapboard on skids, a tin roof, nest boxes along its west side, its pop hole
// shut, EGGS painted on its end (a coop's whole run, its rectangle in the plan)
function hfCoop(r) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, L = r.z1 - r.z0, bx = cx + 0.12, bw = 1.6, H0 = 0.18, H1 = 1.75;   // (its body a little east of middle, the nest boxes west of it)
  for (const o of [-0.6, 0.6]) hfBox(0.14, H0, L - 0.05, HF_M.woodDk, bx + o, H0 / 2, cz);
  hfBox(bw, H1 - H0, L - 0.1, HF_M.white, bx, (H0 + H1) / 2, cz);
  for (let y = H0 + 0.18; y < H1 - 0.05; y += 0.18) for (const s of [-1, 1]) { hfBox(0.02, 0.025, L - 0.14, HF_M.whiteDk, bx + s * (bw / 2 + 0.01), y, cz); hfBox(bw - 0.06, 0.025, 0.02, HF_M.whiteDk, bx, y, cz + s * ((L - 0.1) / 2 + 0.01)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) hfBox(0.1, H1 - H0, 0.1, HF_M.whiteDk, bx + sx * (bw / 2 - 0.02), (H0 + H1) / 2, cz + sz * ((L - 0.1) / 2 - 0.02));
  // its roof: a prism of boards along it, the tin over it
  const sh = new THREE.Shape(); sh.moveTo(-bw / 2 - 0.05, 0); sh.lineTo(bw / 2 + 0.05, 0); sh.lineTo(0, 0.7); sh.lineTo(-bw / 2 - 0.05, 0);
  const pr = hfMesh(new THREE.ExtrudeGeometry(sh, { depth: L - 0.1, bevelEnabled: false }), HF_M.white, bx, H1, r.z0 + 0.05);
  const a = Math.atan2(0.7, bw / 2 + 0.05), sl = Math.hypot(0.7, bw / 2 + 0.05);
  for (const s of [-1, 1]) { const p = hfBox(sl + 0.18, 0.035, L + 0.1, HF_M.rust, bx + s * (bw / 4 + 0.06), H1 + 0.37, cz); p.rotation.z = -s * a; }
  // the nest boxes: a lean-to along its west side, its lid hinged up the wall
  const nx0 = bx - bw / 2, nw = Math.max(0.2, nx0 - r.x0 - 0.02);
  hfBox(nw, 0.55, L * 0.6, HF_M.white, nx0 - nw / 2, 0.75, cz); const lid = hfBox(nw + 0.08, 0.03, L * 0.6 + 0.06, HF_M.rust, nx0 - nw / 2, 1.06, cz); lid.rotation.z = 0.35;
  hfBox(0.3, 0.35, 0.03, HF_M.woodDk, bx - 0.3, 0.42, r.z1 - 0.035);   // (the pop hole, shut)
  hfSign('EGGS', 0.7, 0.24, 'rgba(160,52,40,0.9)', 'italic 900 150px "Archivo", sans-serif', bx + 0.35, 1.3, r.z1 - 0.02, 0);
  for (let jj = r.z0 + 0.5; jj < r.z1; jj++) { cellBox[idx(ci(r.x0 + 0.5), ci(jj))] = [nx0 - nw, jj - 0.5, cx, jj + 0.5]; cellBox[idx(ci(r.x1 - 0.5), ci(jj))] = [cx, jj - 0.5, bx + bw / 2, jj + 0.5]; }
}
// a workbench against a shed's wall: a thick top, a shelf under it with cans on it, a vice at one end, a pegboard of
// tools on the wall over it (a bench's whole run, along the wall)
function hfBench(i, j) {
  const r = hfRun(i, j, 'k'), cx = (r.x0 + r.x1) / 2, L = r.x1 - r.x0, s = '#hm'.includes(HF_KIND(i, j - 1)) ? -1 : 1;   // (s: which way the wall is)
  const wz = (r.z0 + r.z1) / 2 + s * 0.5, D = 0.7, bz = wz - s * D / 2, top = HF_H.k;
  hfBox(L - 0.04, 0.07, D, HF_M.board[1], cx, top - 0.035, bz);
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) hfBox(0.08, top - 0.07, 0.08, HF_M.board[2], cx + ex * (L / 2 - 0.1), (top - 0.07) / 2, bz + ez * (D / 2 - 0.06));
  hfBox(L - 0.2, 0.03, D - 0.1, HF_M.board[2], cx, 0.28, bz);
  for (let k = 0; k < 4; k++) { const h = rr(0.2, 0.32); hfLoose(new THREE.BoxGeometry(0.2, h, 0.2), hfPick(HF_M.can), cx - L / 2 + 0.3 + k * 0.42, 0.295 + h / 2, bz + rr(-0.1, 0.1)); }
  const ve = cx + L / 2 - 0.25; hfBox(0.16, 0.16, 0.22, HF_M.iron, ve, top + 0.08, bz - s * 0.22); hfBox(0.3, 0.04, 0.04, HF_M.steel, ve, top + 0.12, bz - s * 0.32);
  hfLoose(new THREE.BoxGeometry(0.45, 0.2, 0.22), HF_M.can[0], cx - 0.3, top + 0.1, bz + s * 0.12); hfBox(0.3, 0.03, 0.06, HF_M.tool, cx + 0.2, top + 0.015, bz - s * 0.05);
  // the pegboard (clear of the wall's ribs) and the tools hung on it
  const pz = wz - s * 0.04; hfBox(L - 0.2, 1.0, 0.02, HF_M.peg, cx, top + 0.7, pz);
  for (let k = 0; k < 7; k++) { const tw = rr(0.05, 0.1), th = rr(0.2, 0.42); hfBox(tw, th, 0.025, HF_M.tool, cx - L / 2 + 0.3 + k * (L - 0.6) / 6, top + 0.75 + rr(-0.15, 0.15), pz - s * 0.025); }
  for (let jj = r.x0 + 0.5; jj < r.x1; jj++) cellBox[idx(ci(jj), ci(bz))] = [jj - 0.5, Math.min(wz, wz - s * (D + 0.02)), jj + 0.5, Math.max(wz, wz - s * (D + 0.02))];
}
// a woodpile: split logs stacked waist high on two rails, a tarp half over it
function hfWoodpile(x, z) {
  for (const o of [-0.3, 0.3]) hfBox(0.9, 0.08, 0.08, HF_M.woodDk, x, 0.04, z + o);
  for (let l = 0; l < 4; l++) for (let n = 0; n < 4; n++) { const r = rr(0.09, 0.11), c = hfCyl(r, r, 0.9 + rr(-0.04, 0.04), hfPick(HF_M.log), x + rr(-0.02, 0.02), 0.08 + r + l * 0.19, z - 0.33 + n * 0.22 + (l % 2) * 0.05, 6); c.rotation.set(rr(0, 1), 0, Math.PI / 2); }
  const tp = hfBox(0.94, 0.02, 0.62, HF_M.tarp, x + 0.05, 0.88, z - 0.12); tp.rotation.set(0.12, 0, 0.04);
  hfFoot(x, z, 0.48, 0.47, 0.48, 0.47);
}
// the fuel tank: a green tank up on its steel stand inside a concrete bund (spills stay in it), a ladder up its end, the
// hose on its reel, DIESEL on its end
function hfTank(i, j) {
  const r = hfRun(i, j, 'T'), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, B = 0.85, R = 0.85, L = 1.8, Y = B + R;
  hfBox(1.96, 0.06, 1.96, HF_M.conc, cx, 0.03, cz);
  for (const s of [-1, 1]) { hfBox(1.96, B, 0.12, HF_M.conc2, cx, B / 2, cz + s * 0.92); hfBox(0.12, B, 1.72, HF_M.conc2, cx + s * 0.92, B / 2, cz); }
  for (const s of [-1, 1]) { hfBox(1.4, 0.12, 0.12, HF_M.steel, cx, B + 0.1, cz + s * 0.6); for (const e of [-0.55, 0.55]) hfStrut(cx + e, 0.06, cz + s * 0.6, cx + e * 0.4, B + 0.2, cz + s * 0.6, 0.08, HF_M.steel); }
  const t = hfCyl(R, R, L, HF_M.tank, cx, Y, cz, 20); t.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) { const c = hfCyl(R + 0.025, R + 0.025, 0.05, HF_M.tankDk, cx, Y, cz + s * (L / 2 - 0.03), 20); c.rotation.x = Math.PI / 2; }
  for (const o of [-0.2, 0.2]) hfBox(0.04, 1.3, 0.04, HF_M.steel, cx + o, Y + 0.2, cz - L / 2 - 0.07);
  for (let y = Y - 0.3; y < Y + 0.8; y += 0.28) hfBox(0.4, 0.03, 0.03, HF_M.steel, cx, y, cz - L / 2 - 0.07);
  hfCyl(0.12, 0.12, 0.2, HF_M.tankDk, cx, Y + R + 0.05, cz - 0.4, 10);
  const reel = hfCyl(0.25, 0.25, 0.14, HF_M.red, cx + 0.92, B + 0.3, cz - 0.4, 12); reel.rotation.z = Math.PI / 2;
  hfSign('DIESEL', 0.9, 0.3, 'rgba(232,226,206,0.9)', '700 120px "Saira Extra Condensed", sans-serif', cx, Y, cz + L / 2 + 0.035, 0);
}
// a water trough: a galvanised stock tank, hollow, its rolled rim, water in it (one tank over its run, built from its
// west end); the north one with a hand pump at its side, its spout over the water
function hfTrough(i, j, x, z) {
  if (HF_KIND(i - 1, j) === 't') return;
  let n = 1; while (HF_KIND(i + n, j) === 't') n++;
  const cx = x + (n - 1) / 2, H = HF_H.t, w = 0.82, L = n - 0.06;
  hfBox(L, 0.06, w, HF_M.galvDk, cx, 0.03, z);
  for (const s of [-1, 1]) { hfBox(L, H, 0.04, HF_M.galv, cx, H / 2, z + s * (w / 2 - 0.02)); hfBox(0.04, H, w - 0.08, HF_M.galv, cx + s * (L / 2 - 0.02), H / 2, z); }
  for (const s of [-1, 1]) { hfBox(L + 0.04, 0.05, 0.07, HF_M.galvDk, cx, H + 0.005, z + s * (w / 2 - 0.02)); hfBox(0.07, 0.05, w - 0.06, HF_M.galvDk, cx + s * (L / 2 - 0.02), H + 0.005, z); }
  for (let k = 0.4; k < L - 0.2; k += 0.5) for (const s of [-1, 1]) hfBox(0.04, H - 0.12, 0.02, HF_M.galvDk, cx - L / 2 + k, H / 2, z + s * (w / 2 + 0.01));   // (its ribs)
  const wt = hfPush(new THREE.Mesh(new THREE.PlaneGeometry(L - 0.1, w - 0.1), HF_M.water)); wt.rotation.x = -Math.PI / 2; wt.position.set(cx, H - 0.14, z); wt.receiveShadow = true;
  for (let k = 0; k < n; k++) cellBox[idx(i + k, j)] = [x + k - 0.5, z - 0.44, x + k + 0.5, z + 0.44];
  if (hfJ(j) < 19) {   // the hand pump, cast iron, on a stone at the trough's north side
    const px = cx, pz = z - 0.44; hfBox(0.22, 0.12, 0.12, HF_M.stone, px, 0.06, pz);
    hfCyl(0.06, 0.07, 0.8, HF_M.iron, px, 0.52, pz, 8); hfCyl(0.08, 0.06, 0.1, HF_M.iron, px, 0.97, pz, 8);
    hfStrut(px, 0.85, pz, px, 0.78, pz + 0.3, 0.05, HF_M.iron);   // (its spout, out over the water)
    hfStrut(px, 1.0, pz, px, 1.38, pz - 0.05, 0.035, HF_M.iron);   // (its handle, up)
    for (let k = i + Math.floor((n - 1) / 2); k <= i + Math.ceil((n - 1) / 2); k++) cellBox[idx(k, j)][1] = z - 0.5;
  }
}
// culvert pipes waiting to go in under the ditch: a concrete pipe lying along it, hollow
function hfPipe(x, z) {
  const p = hfCyl(0.46, 0.46, 0.96, HF_M.pipe, x, 0.46, z, 16); p.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const e = hfMesh(new THREE.CircleGeometry(0.36, 14), HF_M.pipeIn, x + s * 0.485, 0.46, z); e.rotation.y = s * Math.PI / 2; }
  hfFoot(x, z, 0.5, 0.47, 0.5, 0.47);
}

// ---- seen only from your own eyes (from above you look in through where they are, as the cutaway does the farmhouse's
// roof): the barn's gambrel roof on its trusses, a few sheets torn off it, its gable ends above the walls with the
// hayloft door and the hay hood over it, the hayloft over the stalls; the sheds' tin roofs on their purlins, their
// gutters, the bulbs hung from them. Shown as the first-person view is up
const HF_GAMBREL = [[-19.3, 4.1], [-17.3, 6.6], [-13, 8.1], [-8.7, 6.6], [-6.7, 4.1]];   // (the barn's roof line across it: [z, y])
const hfRoofY = z => { for (let k = 0; k < 4; k++) { const [z1, y1] = HF_GAMBREL[k], [z2, y2] = HF_GAMBREL[k + 1]; if (z >= z1 && z <= z2) return y1 + (y2 - y1) * (z - z1) / (z2 - z1); } return 4.1; };
function hfOverhead(g) {
  const c = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); c.add(m); return m; };
  const strut = (ax, ay, az, bx, by, bz, t, mat) => { _hfB.set(bx - ax, by - ay, bz - az); const m = add(new THREE.BoxGeometry(t, _hfB.length(), t), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); m.quaternion.setFromUnitVectors(_hfUp, _hfB.normalize()); return m; };
  // the barn: its roof, sheet by sheet along it (a few gone, the sky through them), on a truss every three metres
  const BX = hfX(HF_E - 8) + 0.5, bx0 = -BX - 0.4, bx1 = BX + 0.4, n = 6, sw = (bx1 - bx0) / n;
  for (let s = 0; s < 4; s++) {
    const [z1, y1] = HF_GAMBREL[s], [z2, y2] = HF_GAMBREL[s + 1], a = Math.atan2(y2 - y1, z2 - z1), L = Math.hypot(z2 - z1, y2 - y1);
    for (let k = 0; k < n; k++) { if ((s === 1 && (k === 1 || k === 4)) || (s === 2 && k === 5)) continue;
      const p = add(new THREE.BoxGeometry(sw - 0.02, 0.05, L + 0.04), (k + s) % 3 ? HF_M.roofDk : HF_M.roofTin, bx0 + (k + 0.5) * sw, (y1 + y2) / 2 + 0.03, (z1 + z2) / 2); p.rotation.x = -a; }
  }
  for (let x = -BX + 1; x <= BX - 0.99; x += (2 * BX - 2) / 6) {
    for (let s = 0; s < 4; s++) { const [z1, y1] = HF_GAMBREL[s], [z2, y2] = HF_GAMBREL[s + 1]; strut(x, y1 - 0.12, z1, x, y2 - 0.12, z2, 0.14, HF_M.rafter); }
    strut(x, 6.45, -17.2, x, 6.45, -8.8, 0.14, HF_M.rafter);   // (its collar tie)
    for (const z of [-17.2, -8.8]) strut(x, 4.2, z + (z < -13 ? -0.7 : 0.7), x, 6.45, z, 0.1, HF_M.rafter);   // (its braces down to the wall plates)
  }
  for (const z of [-17.3, -8.7, -13]) strut(bx0 + 0.4, z === -13 ? 7.95 : 6.48, z, bx1 - 0.4, z === -13 ? 7.95 : 6.48, z, 0.16, HF_M.rafter);   // (its purlins and ridge)
  // the hayloft over the stalls along the north wall: its floor on a beam, posts down to the stalls' partitions, hay
  add(new THREE.BoxGeometry(2 * BX - 0.4, 0.1, 2.5), HF_M.loft, 0, 3.1, -17.25);
  add(new THREE.BoxGeometry(2 * BX - 0.4, 0.22, 0.2), HF_M.rafter, 0, 2.94, -16.05);
  for (const x of [hfX(11), hfX(14), -hfX(14), -hfX(11)]) add(new THREE.BoxGeometry(0.16, 1.0, 0.16), HF_M.rafter, x, 2.5, -16.15);
  for (const [x, k] of [[-7.8, 2], [-5, 1], [-1.2, 3], [2.5, 2], [5.6, 1], [7.4, 1]]) for (let q = 0; q < k; q++) add(new THREE.BoxGeometry(0.95, 0.85, 1.25), HF_M.loftHay, x + q * 1.0, 3.6, -17.6 + (q % 2) * 0.1);
  // its gable ends above the walls, board and batten, the white trim up their rakes, the hayloft door in each with the hay
  // hood over it, its beam out over the corral and the pulley on it
  // (its outline: the walls' width, up to just under the roof)
  const GP = [[-19, 0], ...HF_GAMBREL.slice(1, 4).map(([z]) => [z, 0]), [-7, 0]].map(([z]) => [z, hfRoofY(z) - 0.06 - 4.2]);
  const sh = new THREE.Shape(); sh.moveTo(6, 0); GP.forEach(([z, v]) => sh.lineTo(-(z + 13), v)); sh.lineTo(-6, 0); sh.lineTo(6, 0);
  for (const s of [-1, 1]) {
    const xo = s * BX, gx = s < 0 ? -BX : BX - 0.3, ge = add(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }), HF_M.gable, gx, 4.2, -13); ge.rotation.y = Math.PI / 2;
    const fx = xo + s * 0.02;
    for (let z = -18.6; z < -7.3; z += 0.5) { const top = hfRoofY(z) - 0.2; if (top > 4.35 && (z < -13.95 || z > -12.05 || top < 4.5)) add(new THREE.BoxGeometry(0.03, top - 4.25, 0.05), HF_M.rafter, fx, (top + 4.25) / 2, z); }
    for (let k = 0; k < 4; k++) { const [z1, v1] = GP[k], [z2, v2] = GP[k + 1]; strut(fx + s * 0.02, v1 + 4.2, z1, fx + s * 0.02, v2 + 4.2, z2, 0.12, HF_M.gableTrim); }
    add(new THREE.BoxGeometry(0.06, 1.8, 1.6), HF_M.gable, fx + s * 0.03, 5.5, -13);
    for (const [y, h] of [[4.6, 0.1], [6.4, 0.1]]) add(new THREE.BoxGeometry(0.08, h, 1.7), HF_M.gableTrim, fx + s * 0.05, y, -13);
    for (const z of [-13.8, -12.2]) add(new THREE.BoxGeometry(0.08, 1.9, 0.1), HF_M.gableTrim, fx + s * 0.05, 5.5, z);
    strut(fx + s * 0.06, 4.65, -13.75, fx + s * 0.06, 6.35, -12.25, 0.08, HF_M.gableTrim); strut(fx + s * 0.06, 4.65, -12.25, fx + s * 0.06, 6.35, -13.75, 0.08, HF_M.gableTrim);
    const hood = new THREE.Shape(); hood.moveTo(-0.7, 0); hood.lineTo(0.7, 0); hood.lineTo(0, 0.6); hood.lineTo(-0.7, 0);
    const hh = add(new THREE.ExtrudeGeometry(hood, { depth: 1.1, bevelEnabled: false }), HF_M.gable, xo, 6.9, -13); hh.rotation.y = s * Math.PI / 2;
    add(new THREE.BoxGeometry(1.5, 0.16, 0.16), HF_M.rafter, xo + s * 0.75, 6.82, -13);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), HF_M.rafter, xo + s * 1.35, 6.6, -13).rotation.x = Math.PI / 2;
  }
  // the sheds: a low gable of corrugated tin along each, on its purlins, gutters along its eaves, its gable ends; a bulb
  // hung under each
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? hfX(0) - 0.5 : hfX(HF_E - 7) - 0.5, x1 = s < 0 ? hfX(7) + 0.5 : hfX(HF_E) + 0.5, z0 = hfZ(11) - 0.5, z1 = hfZ(26) + 0.5, cx = (x0 + x1) / 2, E = HF_H.m + 0.05, R = E + 0.85, hw = (x1 - x0) / 2 + 0.3;
    const a = Math.atan2(R - E, hw), L = Math.hypot(R - E, hw);
    for (const e of [-1, 1]) { const p = add(new THREE.BoxGeometry(L, 0.04, z1 - z0 + 0.5), HF_M.roofTin, cx + e * hw / 2, (E + R) / 2 + 0.03, (z0 + z1) / 2); p.rotation.z = -e * a;
      for (const zz of [z0 + 4, z1 - 5]) { const k = add(new THREE.BoxGeometry(L - 0.4, 0.045, 1.0), HF_M.roofDk, cx + e * hw / 2, (E + R) / 2 + 0.035, zz + e); k.rotation.z = -e * a; }
      add(new THREE.BoxGeometry(0.14, 0.1, z1 - z0 + 0.5), HF_M.roofDk, cx + e * (hw + 0.05), E - 0.04, (z0 + z1) / 2); }
    for (let k = 1; k < 4; k++) for (const e of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.12, z1 - z0), HF_M.rafter, cx + e * hw * k / 4, E + (R - E) * (1 - k / 4) - 0.06, (z0 + z1) / 2);
    const tri = new THREE.Shape(); tri.moveTo(-(x1 - x0) / 2, 0); tri.lineTo((x1 - x0) / 2, 0); tri.lineTo(0, R - E - 0.08); tri.lineTo(-(x1 - x0) / 2, 0);
    for (const z of [z0, z1 - 0.08]) add(new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }), HF_M.roofTin, cx, E - 0.02, z);
    const bxl = s * Math.abs(hfX(3.5)), bz = hfZ(18.5);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), HF_M.rafter, bxl, R - 0.45 - 0.1, bz);
    add(new THREE.ConeGeometry(0.22, 0.14, 12, 1, true), HF_M.roofDk, bxl, R - 1.0, bz);
    add(new THREE.SphereGeometry(0.06, 8, 6), HF_M.bulb, bxl, R - 1.08, bz);
  }
  c.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); c.visible = false; g.add(c); hFp = c;
}
function hfTick() { if (hFp) hFp.visible = fpOn(); }

// ---- its lamps: the farm's yard lights on the barn and the sheds and up the wind pumps, on poles in the hedgerow,
// and work lamps on the barn's north wall: [where the light falls (plan column, row), where the lamp is (column, row,
// height), which way it faces (radians: 0 south), its reach (m), its colour and strength]; each but those on the middle
// line has its mirror on the east. Only lit at night (lighting/lightmap.js LAMP_ON)
const HF_SODIUM = [1, 0.7, 0.4], HF_WORK = [1, 0.86, 0.66];
const HF_LAMPS = [
  [11.5, 2.6, 11.5, 0.62, 2.7, 0, 7.5, HF_WORK, 0.8], [15, 2.6, 15, 0.62, 2.7, 0, 7.5, HF_WORK, 0.8], [14, 9, 14, 10.38, 3.2, Math.PI, 6.5, HF_WORK, 0.75],
  [5, 3.5, 7.45, 2.5, 3.6, -Math.PI / 2, 9, HF_SODIUM, 0.85],
  [10.5, 13.5, 10.5, 11.62, 3.85, 0, 11, HF_SODIUM, 0.9], [17.5, 13.5, 17.5, 11.62, 3.95, 0, 11, HF_SODIUM, 0.9],
  [9, 18.5, 7.55, 15.5, 3.1, Math.PI / 2, 9, HF_SODIUM, 0.85],
  [15, 19.2, 14.5, 20.45, 2.3, Math.PI, 8, HF_SODIUM, 0.85],
  [9, 24.5, 9, 26, 4.6, Math.PI, 10, HF_SODIUM, 0.85], [9, 28.5, 9, 26, 4.6, 0, 10, HF_SODIUM, 0.85],
  [17.5, 33.2, 17.5, 34.45, 2.6, Math.PI, 10, HF_SODIUM, 0.85],
  [3, 28.5, 3, 26.55, 3.0, 0, 9, HF_SODIUM, 0.8],
  [3.5, 18.5, null, 0, 0, 0, 7, [1, 0.8, 0.55], 0.75]
];
const hfLampList = () => HF_LAMPS.flatMap(L => L[0] === HF_E / 2 ? [L] : [L, [HF_E - L[0], L[1], L[2] === null ? null : HF_E - L[2], L[3], L[4], -L[5], ...L.slice(6)]]);
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
  for (const ii of [9, HF_E - 9]) { const x = hfX(ii), z = hfZ(26); hfCyl(0.12, 0.15, 5.4, HF_M.poleTall, x, 2.7, z, 8); hfBox(1.4, 0.1, 0.1, HF_M.poleTall, x, 5.1, z); for (const o of [-0.6, 0.6]) hfCyl(0.04, 0.05, 0.14, HF_M.trim, x + o, 5.22, z, 6); }
}

// ---- outside the fences: the country round it. On the two sides away from the camera from above (north and west)
// the tall things: the woods close behind the barn, the gravel road down the west side with the power line along it,
// a car shoved against the corral fence; on the camera's sides only what's low near the fence (the lane up to the farm
// gate with a pickup parked across it, the irrigation main, the washing on the line, a scarecrow in the corn nobody
// cut, the hay meadow), the woods far off
const HF_OUT = 120;
// an old car or pickup, doors and glass and all, rust coming through (burnt: a shell, black, sat on its rims)
function hfCar(x, z, ry, mat, pickup, burnt) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; hP.add(g);
  const P = (w, h, d, m, px, py, pz) => { const b = hfPush(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); b.position.set(px, py, pz); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const body = burnt ? HF_M.soot : mat, glass = burnt ? HF_M.char : HF_M.glass, lift = burnt ? -0.12 : 0;
  P(1.8, 0.62, 4.6, body, 0, 0.62 + lift, 0);
  P(1.66, 0.55, pickup ? 1.6 : 2.3, glass, 0, 1.2 + lift, pickup ? -0.45 : 0.1); P(1.6, 0.06, pickup ? 1.5 : 2.2, body, 0, 1.5 + lift, pickup ? -0.45 : 0.1);
  if (pickup) { P(1.8, 0.4, 1.9, body, 0, 1.05 + lift, 1.3); P(1.6, 0.42, 1.8, HF_M.carDk, 0, 1.06 + lift, 1.3); }
  P(1.6, 0.18, 0.06, HF_M.carDk, 0, 0.7 + lift, -2.31);
  for (const [ox, oz] of [[-0.82, -1.45], [0.82, -1.45], [-0.82, 1.5], [0.82, 1.5]]) { const w = hfPush(new THREE.Mesh(new THREE.CylinderGeometry(burnt ? 0.26 : 0.34, burnt ? 0.26 : 0.34, 0.24, 12), burnt ? HF_M.rust : HF_M.tyre)); w.rotation.z = Math.PI / 2; w.position.set(ox, burnt ? 0.26 : 0.34, oz); g.add(w); }
  if (!burnt) for (let k = 0; k < 4; k++) P(0.02, rr(0.15, 0.3), rr(0.3, 0.7), HF_M.rust, (rand() < 0.5 ? -1 : 1) * 0.905, rr(0.45, 0.8), rr(-1.8, 1.8));
  return g;
}
function hfOutside(g) {
  // the ground: each stretch its own plane, none lying over another (so none of them flickers through the next)
  const ground = (x0, z0, x1, z1, tex, rx, rz, y) => { tex.repeat.set(rx, rz); const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0xffffff, { map: tex })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; g.add(m); };
  const xW = cxw(HF_B[0]) - 0.5, xE = cxw(HF_B[2]) + 0.5, zN = cxw(HF_B[1]) - 0.5, zS = cxw(HF_B[3]) + 0.5, O = HF_OUT, roadX = xW - 6.5, rw = 3;
  const grass = hfNoiseTex('#5d6a3a', 'rgba(70,82,42,0.9)', 'rgba(118,118,70,0.8)', 5000), gravel = () => hfNoiseTex('#8a8070', 'rgba(110,100,86,0.9)', 'rgba(170,162,146,0.8)', 6000);
  ground(-O, -O, roadX - rw, O, grass, 30, 60, -0.03);   // (west of the road)
  ground(roadX - rw, -O, roadX + rw, O, gravel(), 3, 60, -0.03);   // (the road)
  ground(roadX + rw, -O, O, zN, grass.clone(), 25, 25, -0.03);   // (north, behind the barn)
  ground(roadX + rw, zN, xW, zS + 3, hfNoiseTex('#6a5d46', 'rgba(80,70,52,0.9)', 'rgba(120,108,84,0.8)', 3000), 2, 10, -0.03);   // (between the road and the farm)
  ground(xE, zN, O, zS + 3, hfNoiseTex('#6f6a40', 'rgba(84,80,46,0.9)', 'rgba(150,138,86,0.8)', 4000, true), 18, 20, -0.03);   // (the hay meadow east)
  ground(roadX + rw, zS + 3, O, O, hfNoiseTex('#7d6a48', 'rgba(92,74,50,0.9)', 'rgba(176,152,98,0.85)', 4000, true), 40, 28, -0.03);   // (the stubble and the corn south)
  ground(xW, zS, xE, zS + 3, hfNoiseTex('#6a5d46', 'rgba(80,70,52,0.9)', 'rgba(120,108,84,0.8)', 3000), 10, 1, -0.03);   // (the verge along the south fence)
  const gx = (hfX(HF_GATE[0]) + hfX(HF_GATE[1])) / 2; ground(roadX + rw, zS + 4, gx + 1.7, zS + 7.4, gravel(), 8, 1, -0.015); ground(gx - 1.7, zS + 0.4, gx + 1.7, zS + 4, gravel(), 1, 1, -0.015);   // (the lane up to the farm gate)
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
  let pz0 = null;
  for (let z = -60; z <= 60; z += 15) { const x = roadX - 3.6; hfCyl(0.13, 0.17, 7.5, HF_M.poleTall, x, 3.75, z, 7); hfBox(1.8, 0.12, 0.12, HF_M.poleTall, x, 7.0, z); if (pz0 !== null) for (const o of [-0.8, 0, 0.8]) hfStrut(x + o, 7.1, pz0, x + o, 7.1, z, 0.025, HF_M.dark); pz0 = z; }
  // on the road, a pickup burnt out; against the west corral fence, a car pushed nose in to hold it; across the farm
  // gate, the pickup they parked there
  hfCar(roadX + 0.6, 6, 0.08, HF_M.car[0], true, true);
  hfCar(xW - 1.25, hfZ(4), 0.06, HF_M.car[0], false, false);
  hfCar(gx, zS + 2.3, Math.PI / 2 + 0.05, HF_M.car[1], true, false);
  // the mailbox at the end of the lane, the farm's name on a board by it
  { const x = roadX + rw + 0.6, z = zS + 3.6; hfBox(0.1, 1.1, 0.1, HF_M.woodDk, x, 0.55, z); hfBox(0.3, 0.26, 0.5, HF_M.mail, x, 1.22, z); hfCyl(0.15, 0.15, 0.5, HF_M.mail, x, 1.35, z, 10).rotation.x = Math.PI / 2; hfBox(0.03, 0.14, 0.04, HF_M.red, x + 0.17, 1.4, z + 0.12);
    hfSign('HARLAN', 0.36, 0.1, 'rgba(236,232,220,0.9)', '700 120px "Saira Extra Condensed", sans-serif', x - 0.153, 1.2, z, -Math.PI / 2);
    const sz = zS + 8.6; for (const o of [-1.1, 1.1]) hfBox(0.12, 2.0, 0.12, HF_M.woodDk, x, 1.0, sz + o); hfBox(0.06, 0.7, 2.5, HF_M.board[3], x, 1.6, sz);
    hfSign('HARLAN FARM', 2.3, 0.5, 'rgba(70,40,30,0.95)', '700 110px "Saira Extra Condensed", sans-serif', x - 0.04, 1.62, sz, -Math.PI / 2); }
  // the irrigation main along the outside of the south fence, a riser and its sprinkler every few metres, its valve
  hfCyl(0.11, 0.11, xE - xW - 2, HF_M.galv, 0, 0.12, zS + 1.4, 10).rotation.z = Math.PI / 2;
  for (let x = xW + 3; x < xE - 2; x += 6) { hfCyl(0.03, 0.03, 0.9, HF_M.galv, x, 0.55, zS + 1.4, 6); hfBox(0.22, 0.05, 0.05, HF_M.galvDk, x, 1.0, zS + 1.4); }
  { const x = xE - 2.5; hfCyl(0.16, 0.16, 0.3, HF_M.red, x, 0.25, zS + 1.4, 10); hfCyl(0.2, 0.2, 0.04, HF_M.red, x, 0.55, zS + 1.4, 10); }
  // the washing still on the line between two T posts, east of the lane
  { const x0 = 5, x1 = 11, z = zS + 4.2, Y = 2.0; for (const x of [x0, x1]) { hfBox(0.1, Y + 0.1, 0.1, HF_M.galvDk, x, (Y + 0.1) / 2, z); hfBox(0.06, 0.06, 0.9, HF_M.galvDk, x, Y, z); }
    for (const o of [-0.35, 0, 0.35]) hfBox(x1 - x0, 0.01, 0.01, HF_M.galv, (x0 + x1) / 2, Y - 0.04, z + o);
    for (const [cx, w, h, o, m] of [[6.3, 1.4, 1.0, -0.35, 0], [8.2, 0.55, 0.65, 0, 1], [9.1, 0.5, 0.6, 0, 2], [10.0, 0.7, 0.5, 0.35, 0]]) { const c = hfBox(w, h, 0.02, HF_M.cloth[m], cx, Y - 0.05 - h / 2, z + o); c.rotation.set(rr(-0.08, 0.08), rr(-0.1, 0.1), 0); } }
  // the corn nobody cut, south past the lane, dead on its stalks, and the scarecrow in it
  for (let z = zS + 9; z < zS + 22; z += 0.9) for (let x = -24; x < 26; x += rr(0.45, 0.8)) { const h = rr(1.3, 2.0), s = hfBox(0.05, h, 0.05, hfPick(HF_M.cornTall), x + rr(-0.15, 0.15), h / 2, z + rr(-0.1, 0.1)); s.rotation.set(rr(-0.12, 0.12), 0, rr(-0.12, 0.12)); }
  { const x = 15, z = zS + 6.5; hfBox(0.08, 2.1, 0.08, HF_M.woodDk, x, 1.05, z); hfBox(1.3, 0.07, 0.07, HF_M.woodDk, x, 1.6, z); hfBox(0.5, 0.65, 0.3, HF_M.board[3], x, 1.45, z); hfBox(0.14, 0.4, 0.14, HF_M.cloth[1], x - 0.18, 0.95, z); hfBox(0.14, 0.4, 0.14, HF_M.cloth[1], x + 0.18, 0.95, z); hfBlob(0.2, HF_M.hayLow[2], x, 1.95, z, 1.2); hfMesh(new THREE.ConeGeometry(0.34, 0.2, 10), HF_M.woodDk, x, 2.15, z); }
  // a wire fence round the meadow east, round bales left out in it
  for (let z = zN - 2; z <= zS + 3; z += 3) { hfBox(0.1, 1.2, 0.1, HF_M.woodDk, xE + 9, 0.6, z); for (const y of [0.5, 0.9]) hfBox(0.015, 0.015, 3, HF_M.galvDk, xE + 9, y, z + 1.5); }
  for (const [x, z] of [[xE + 14, -6], [xE + 15, 9], [xE + 20, -18], [xE + 13, 1]]) { const b = hfCyl(0.75, 0.75, 1.2, hfPick(HF_M.hayLow), x, 0.75, z, 16); b.rotation.z = Math.PI / 2; b.rotation.y = rr(0, 3); }
  // junk behind the barn: an old hay rake rusting, tyres, a woodpile for the house that's gone
  for (let k = 0; k < 6; k++) { const t = hfCyl(0.42, 0.42, 0.22, HF_M.tread, -6 + k * 0.15, 0.11 + k * 0.22, zN - 2.2, 12); t.rotation.y = rr(0, 1); }
  for (let k = 0; k < 9; k++) { const c = hfMesh(new THREE.TorusGeometry(0.55, 0.03, 4, 14, Math.PI), HF_M.rust, 5 + k * 0.3, 0, zN - 3); c.rotation.y = Math.PI / 2; }
  hfBox(3, 0.08, 0.08, HF_M.rust, 6.2, 0.55, zN - 3);
  for (let l = 0; l < 6; l++) for (let n = 0; n < 9; n++) { const r = rr(0.09, 0.12), c = hfCyl(r, r, 0.9, hfPick(HF_M.log), -16 + n * 0.22 + (l % 2) * 0.1, 0.1 + l * 0.2, zN - 2.0, 6); c.rotation.x = Math.PI / 2; }
}

// ---- what's painted on it: the farm's name across the barn, what the people here wrote for whoever came after. Each
// one smaller than the face it's on and clear of what stands proud of that face (battens, ribs, trim)
function hfSigns() {
  const zB = hfZ(11) + 0.5 + 0.045;   // (the barn's south face, in front of its battens)
  hfSign('HARLAN', 3.4, 0.9, 'rgba(226,218,196,0.85)', '700 190px "Saira Extra Condensed", sans-serif', 0, 3.0, zB, 0);
  hfSign('EST. 1931', 1.5, 0.3, 'rgba(226,218,196,0.75)', '700 120px "Saira Extra Condensed", sans-serif', 0, 2.05, zB, 0);
  hfSign('THEY COME AT DUSK', 2.6, 0.42, 'rgba(236,232,220,0.8)', 'italic 900 90px "Archivo", sans-serif', hfX(2), 1.6, hfZ(26) + 0.5 + 0.045, 0);
  hfSign('BURN THE BITTEN', 2.6, 0.42, 'rgba(236,232,220,0.8)', 'italic 900 90px "Archivo", sans-serif', -hfX(2), 1.6, hfZ(26) + 0.5 + 0.045, 0);
  for (const s of [-1, 1]) hfSign('MACHINE SHED', 2.4, 0.42, 'rgba(30,30,28,0.85)', '700 90px "Saira Extra Condensed", sans-serif', s * (Math.abs(hfX(7)) - 0.515), 3.12, hfZ(18.5), -s * Math.PI / 2, 'rgba(196,170,96,0.85)');
}

// where the fire brought the barn's south wall down at each end (the plan's gap in it, by the west and east walls):
// its boards lying charred where they fell, flat on the ground (nothing to trip on or hide behind), and the stumps of
// its studs along the sill
function hfBreach() {
  const jj = 11, j = HF_B[1] + jj;
  for (let ii = 1; ii < HF_E; ii++) {
    const i = HF_B[0] + ii; if (HF_KIND(i, j) !== '.' || HF_KIND(i - 1, j) === 'm' || HF_KIND(i + 1, j) === 'm') continue;
    const inBarn = [-1, 1].some(d => { for (let k = 1; k < 4; k++) { const c = HF_KIND(i + d * k, j); if (c === 'h') return true; if (c !== '.') return false; } return false; });
    if (!inBarn || [-1, 1].every(d => HF_KIND(i + d, j) !== 'h' && HF_KIND(i + 2 * d, j) !== 'h')) continue;
    const x = hfX(ii), z = hfZ(jj);
    for (let k = 0; k < 4; k++) { const b = hfBox(rr(0.9, 1.6), 0.03, 0.16, k % 2 ? HF_M.char : HF_M.barnDk, x + rr(-0.3, 0.3), 0.02 + k * 0.012, z + rr(-0.45, 0.45)); b.rotation.y = rr(-0.9, 0.9); }
    for (const dx of [-0.3, 0.3]) hfBox(0.1, rr(0.12, 0.3), 0.1, HF_M.char, x + dx, 0.1, z);
  }
}
// the whole map, into its group (g): its pieces (to be folded into a few meshes) back
function hfBuild(g) {
  hP = g; hParts = []; FARM_MAP.flares.length = 0; FARM_MAP.shelfItems.length = 0;
  const x0 = cxw(HF_B[0]) - 0.5, x1 = cxw(HF_B[2]) + 0.5, z0 = cxw(HF_B[1]) - 0.5, z1 = cxw(HF_B[3]) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat(lam(0xffffff, { map: hfGroundTex() }), 'gravel', [x0, z0, x1, z1], [['soil', 1, 27, -1, -1], ['soil', 1, 1, 8, 11], ['soil', -8, 1, -1, 11], ['straw', 9, 1, -9, 11], ['concrete', 1, 12, 7, 26], ['concrete', -7, 12, -1, 26]])); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  fl.onBeforeRender = hfTick;   // (the roofs shown or not as the ground's drawn: a frame behind the view at most)
  for (let j = HF_B[1]; j <= HF_B[3]; j++) for (let i = HF_B[0]; i <= HF_B[2]; i++) {
    const k = HF_KIND(i, j), x = cxw(i), z = cxw(j);
    if (k === '#') hfBoundary(i, j, x, z);
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
    else if (k === 'k') { if (hfFirst(i, j, k)) hfBench(i, j); }
    else if (k === 'w') hfWoodpile(x, z);
  }
  hfDoors(); hfMeshFences(); hfCrops(); hfLamps(g); hfOutside(g); hfSigns(); hfOverhead(g); hfBreach();
  { const bx = arBoxSet('farm', g); FARM_MAP.shelfItems.forEach(m => bx.addMesh(m)); bx.done(); }   // (what's on the racks and benches, to be shot off: world/arena-boxes.js)
  const parts = hParts; hP = hParts = null; return parts;
}
// the doorways' heads (the walls carried over them, above your head) and the doors themselves, slid back on their tracks
// a barn door's leaf: boards with battens, white trim round it and a white cross brace, hung by two rollers from the
// track over it (fx, fz: which way its face looks; along: x or z)
function hfLeaf(x, z, fx, fz, w, h) {
  const ax = fz ? 1 : 0, az = fx ? 1 : 0, B = (bw, bh, bd, m, y, o, l = 0) => hfBox(ax ? bw : bd, bh, az ? bw : bd, m, x + fx * o + ax * l, y, z + fz * o + az * l);
  B(w, h, 0.08, HF_M.barn[2], 0.08 + h / 2, 0);
  for (let l = -w / 2 + 0.2; l < w / 2 - 0.1; l += 0.3) B(0.05, h - 0.1, 0.03, HF_M.barnDk, 0.08 + h / 2, 0.055, l);
  for (const y of [0.13, h + 0.03]) B(w, 0.12, 0.04, HF_M.trim, y, 0.085);
  for (const l of [-w / 2 + 0.06, w / 2 - 0.06]) B(0.12, h, 0.04, HF_M.trim, 0.08 + h / 2, 0.085, l);
  for (const d of [-1, 1]) { const s = hfStrut(x + fx * 0.09 + ax * (-w / 2 + 0.12), 0.25, z + fz * 0.09 + az * (-w / 2 + 0.12) * d, x + fx * 0.09 + ax * (w / 2 - 0.12), h - 0.1, z + fz * 0.09 + az * (w / 2 - 0.12) * d, 0.1, HF_M.trim); if (ax) { s.position.y = 0.08 + h / 2; s.quaternion.setFromUnitVectors(_hfUp, _hfB.set(w - 0.24, d * (h - 0.35), 0).normalize()); } }
  for (const l of [-w / 2 + 0.3, w / 2 - 0.3]) { B(0.1, 0.22, 0.05, HF_M.iron, h + 0.2, 0.0, l); B(0.14, 0.14, 0.06, HF_M.iron, h + 0.36, -0.01, l); }
}
function hfDoors() {
  for (const s of [-1, 1]) {
    const X = ii => s < 0 ? hfX(ii) : -hfX(ii);
    // the barn's big doors at its end: the wall over them, the two leaves slid back along the outside on their track
    { const x = X(8), zc = (hfZ(4) + hfZ(7)) / 2; hfBox(1, 0.9, 4, HF_M.barn[0], x, 3.75, zc); hfBox(1.04, 0.12, 4.08, HF_M.trim, x, 3.24, zc); for (const e of [-1, 1]) hfBox(0.04, 0.22, 4, HF_M.trim, x + e * 0.52, 4.09, zc);
      for (const e of [-1, 1]) hfLeaf(x + s * 0.6, zc + e * 3.0, s, 0, 2.0, 3.0);
      hfBox(0.08, 0.1, 9.6, HF_M.iron, x + s * 0.6, 3.54, zc);
      hfSign(s < 0 ? 'NO ROOM' : 'KEEP OUT', 1.5, 0.5, 'rgba(198,60,44,0.9)', 'italic 900 150px "Archivo", sans-serif', x + s * 0.6 + s * 0.16, 1.9, zc + 3.0, s * Math.PI / 2); }
    // each south door into the yard: the wall over it, its one leaf slid back west of it on its track
    { const xc = X(14), z = hfZ(11); hfBox(3, 0.9, 1, HF_M.barn[0], xc, 3.75, z); hfBox(3.08, 0.12, 1.04, HF_M.trim, xc, 3.24, z); for (const e of [-1, 1]) hfBox(3, 0.22, 0.04, HF_M.trim, xc, 4.09, z + e * 0.52);
      hfLeaf(X(11), z + 0.6, 0, 1, 3.0, 2.85); hfBox(6.2, 0.1, 0.08, HF_M.iron, (X(11) + xc) / 2, 3.39, z + 0.6); }
    // a shed's doorways: north and south, and its big doors east, the leaves slid back along the outside
    for (const jj of [11, 26]) { const xc = X(5), z = hfZ(jj); hfBox(3, 0.55, 1, HF_M.tin[1], xc, HF_H.m - 0.27, z); hfBox(3.04, 0.08, 1.04, HF_M.tinDk, xc, HF_H.m - 0.58, z); }
    { const x = X(7), zc = hfZ(18.5); hfBox(1, 0.7, 4, HF_M.tin[2], x, HF_H.m - 0.35, zc); hfBox(1.04, 0.08, 4.04, HF_M.tinDk, x, HF_H.m - 0.72, zc);
      for (const e of [-1, 1]) { const lz = zc + e * 3.05, lx = x - s * 0.58; hfBox(0.06, 2.65, 2.1, HF_M.tin[0], lx, 1.36, lz); for (let o = -0.9; o <= 0.91; o += 0.3) hfBox(0.03, 2.6, 0.04, HF_M.tinDk, lx - s * 0.045, 1.36, lz + o); }
      hfBox(0.1, 0.1, 9, HF_M.dark, x - s * 0.6, 2.75, zc); }
  }
}
// the map as world/arena.js takes it (AR_MAPS)
export const FARM_MAP = {
  id: 'farm', name: 'Harlan Farm', note: 'A walled-in farm: the barn, the farmyard, the field',
  plan: HF_PLAN, b: HF_B, h: HF_H, low: HF_LOW, vault: HF_LOW, walls: '#hmeu', what: HF_WHAT, build: hfBuild, indoor: false, tod: null,
  under: { R: 0.45 },   // (the tractors' bellies between their wheels: rounds from your own eyes go under, world/collision.js)
  // (its lamps, on only at night: lighting/lightmap.js; and their lens flares, put up with the map: world/arena.js arenaUp)
  lights: () => hfLampList().map(([i, j, , , , , r, col, int]) => ({ arena: true, x: hfX(i), z: hfZ(j), r, col, int })),
  flares: [],
  // (what stands loose on the sheds' racks and benches, each its own mesh: for shooting off them)
  shelfItems: []
};
