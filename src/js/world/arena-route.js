// The arena's highway map: "Route 9", a highway services stop on the way out of town, abandoned in the evacuation.
// The travel stop's store gutted by fire (its roof still on), the army's checkpoint left standing on the
// forecourt under the pumps' canopy, the highway past it jammed with the pile-up nobody came back for. Its own world,
// not built over the farm (world/arena.js arenaUp takes the farm out of the scene for it): the services and the
// highway inside the fence, the highway running on off both ends, fields and woods round it. Fought at the match's
// own hour. Designed and checked in tools/route-plan.py (tools/plan_check.py: reachability, spawn sightlines, lane
// sightlines, corner pinches, squeezes, timings), the west half (Blue's) drawn and mirrored for the east (Red's), as one
// real place rather than rooms with doors: the store a building standing in its lot, the forecourt open, the army's
// line along the highway only in sections now:
//  - each spawn the garage's lot (the motel's east: the same walls, dressed differently), its wings either side and
//    the army's truck and trailer parked across its front; two ways out, round either end of the truck
//  - NORTH, the Travel stop: close quarters. The gutted store in its lot, in from the side lot by its side door or round
//    through the storeroom, its front doors onto the forecourt; a gondola inside each half, the checkout, the walk-in
//    cooler and the restrooms in the very middle off the back wall; the side lot beside it with the car wash and the
//    cars left in it
//  - MIDDLE, the Forecourt: medium range and the contest. Past the truck, between the pump islands and the HESCO round
//    the army's generator, onto the checkpoint under the canopy (HESCO at its corners, sandbags round the flag), its
//    sentry post in front of the store's doors
//  - SOUTH, the Highway: the long lane, three ways along it: the westbound's shoulder behind the sentry bunkers, the
//    median along its barriers into the two tractors wedged together in the very middle, the eastbound past the bus
//    on its side. The army's line of T-walls along it stands in sections, one knocked flat by the pile-up, so it's
//    reached from the forecourt in four places
// Hardly a line runs from the north lane into the south; the longest anywhere are about 31 m, across the forecourt
// and down onto the highway.
// The store's a real building again, its roof on: from above it's cut away (its parapet standing round the edge), from
// your own eyes it's there, as the canopy's deck is (rtFP).

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
import { liveTex, paintLetters, paintSign, paintSoot, paintSpray, paintStencil } from './sign-art.js';

// its plan, a row a line from north to south (tools/route-plan.py prints it): # the perimeter, h block walls (the
// store's, the cooler's, the garage's wings either side of each spawn, the car wash), W blast walls (the sections of
// the line along the highway, HESCO at the checkpoint's corners, the sentry post, the bunkers and round the generator),
// S the store's gondolas, G a pump island (its pumps and the canopy's column), R the army's truck (and its trailer), U
// a bus on its side, X a semi's tractor (all those stop sight and rounds); c a wrecked car, b a jersey barrier (on the
// line along the highway, a T-wall knocked flat),
// n the checkout counter, s sandbags, k crates or pallets, d a dumpster (seen and shot over; the barriers, counter,
// sandbags, crates and dumpster vaulted, the cars gone round); A and B each side's spawn, F the spots a
// free-for-all spawns from
const RT_PLAN = [
  '##########################################',
  '#dd...........k...hhhhhh...k...........dd#',
  '#............F....hhhhhh....F............#',
  '#.................hhhhhh.................#',
  '#..F.......hhhhh..hhhhhh..hhhhh.......F..#',
  '#..........h......hhhhhh......h..........#',
  '#....hhhh.......F.hhhhhh.F.......hhhh....#',
  '#....hhhh......S..hhhhhh..S......hhhh....#',
  '#..........h...S..........S...h..........#',
  '#cccc......h..................h......cccc#',
  '#cccc......h..................h......cccc#',
  '#hhhhhhhh..hh...hhhhhhhhhh...hh..hhhhhhhh#',
  '#..........F.......WWWW.......F..........#',
  '#..................WWWW..................#',
  '#.......RR..GGGG..........GGGG..RR.......#',
  '#......ARR.......WW....WW.......RRB......#',
  '#......ARR.......WWssssWW.......RRB......#',
  '#.....AARR...WWF..........FWW...RRBB.....#',
  '#.....AARR...WW............WW...RRBB.....#',
  '#.....AARR........s....s........RRBB.....#',
  '#....AAARR........s....s........RRBBB....#',
  '#...AAAARR...k..............k...RRBBBB...#',
  '#....AAARR...k..............k...RRBBB....#',
  '#.....AARR.......WWssssWW.......RRBB.....#',
  '#......ARR.......WW....WW.......RRB......#',
  '#.......RR..GGGG..........GGGG..RR.......#',
  '#..........WW................WW..........#',
  '#..........WW.F............F.WW..........#',
  '#hhhhhhhhWWWW..bbWWWWWWWWbb..WWWWhhhhhhhh#',
  '#........................................#',
  '#..F..................................F..#',
  '#cccc...cccc...WW........WW...cccc...cccc#',
  '#cccc...cccc...WW..XXXX..WW...cccc...cccc#',
  '#..................XXXX..................#',
  '#............bb....XXXX....bb............#',
  '#..........F.......XXXX.......F..........#',
  '#.......UUUUU................UUUUU.......#',
  '#.......UUUUU..cccc.FF.cccc..UUUUU.......#',
  '#.......UUUUU..cccc....cccc..UUUUU.......#',
  '##########################################'
];
// where it stands on the grid (cells, the perimeter included): centred on the grid's middle like the others, so the
// flag's in the same place, in the checkpoint's sandbags
const RT_B = [1, 2, 42, 41];
const RT_W = RT_PLAN[0].length, RT_D = RT_PLAN.length;
const RT_KIND = (i, j) => { const r = RT_PLAN[j - RT_B[1]]; return r ? r[i - RT_B[0]] || '#' : '#'; };
const RT_PK = (ii, jj) => { const r = RT_PLAN[jj]; return r ? r[ii] || '#' : '#'; };   // (by the plan's own column and row)
// how tall each kind stands (m), which are low (seen and shot over), which are vaulted, and what the vault prompt
// calls each (barricades/interactions.js)
const RT_H = { '#': 3.2, h: 2.6, W: 2.8, S: 1.9, G: 2.0, R: 2.9, U: 2.5, X: 3.0, c: 1.3, b: 1.0, n: 1.05, s: 1.15, k: 1.0, d: 1.2 };
const RT_LOW = new Set(['c', 'b', 'n', 's', 'k', 'd']);
const RT_VAULT = new Set(['b', 'n', 'k', 'd', 's']);
const RT_WHAT = { b: 'barrier', n: 'counter', k: 'crates', d: 'dumpster', s: 'sandbags' };
// the plan's zones (its own columns and rows): the store's walls, the cooler block in its middle, the canopy over the
// forecourt (and how high), the highway's carriageways (rows, north edge to south edge, and the median's row)
const RT_STORE = { i0: 11, i1: 30, j1: 11 }, RT_CORE = { i0: 18, i1: 23, j1: 7 };
const RT_CANOPY = { i0: 11, i1: 30, j0: 13, j1: 26, y: 4.7 };
const RT_ROAD = { j0: 29, j1: 38, med: 34 };
// its carriageways' edge lines (plan rows, north edge to south edge of each: a metre of shoulder outside each)
const RT_LANES = [[30, 33.75], [35.25, 38]];
// its lights (cells in the plan, [column, row, kind, what it hangs from]): the canopy's downlights on the army's
// generator (under its deck), work lamps on the store's walls, sodium lamps on the side lots' walls, the garage's front
// and poles along the fences, the checkpoint's floods on its sentry posts and its blast walls; all only as it gets dark
// (hung: n off a wall to the north of it, w the garage's front west of it, e a pole on the fence east of it, s a pole on
// the fence south of it)
const RT_LAMPS = [
  [13.5, 16, 'c'], [13.5, 23, 'c'], [27.5, 16, 'c'], [27.5, 23, 'c'], [20.5, 14, 'c'], [20.5, 25, 'c'],
  [4, 1.3, 's', 'n'], [37, 1.3, 's', 'n'], [12, 4.75, 'w', 'n'], [29, 4.75, 'w', 'n'], [20.5, 7.75, 'w', 'n'],
  [1.3, 19.5, 's', 'w'], [39.7, 19.5, 's', 'e'],
  [15.5, 32.2, 'f', 'n'], [25.5, 32.2, 'f', 'n'], [20.5, 29.3, 'f', 'n'],
  [6, 38.2, 's', 's'], [35, 38.2, 's', 's'], [20.5, 38.2, 's', 's']
];
// ---- the look of it
// (what stands taller than you dithered away round you from above when it's between you and the camera, as Yard 4's
// walls are: core/shaders.js 'tree')
const rtTall = (c, extra) => lit(new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {})), 'tree');
// a canvas texture (w x h px) drawn by fn
const rtTex = (w, h, fn, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } t.anisotropy = 4; return t; };
// the HESCO baskets' look: sand-coloured fabric behind a steel mesh, its bulges between the uprights
const rtHescoTex = () => rtTex(64, 128, (x, w, h) => {
  x.fillStyle = '#c9b88e'; x.fillRect(0, 0, w, h); const r = seeded(77);
  for (let k = 0; k < 300; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '150,134,100' : '214,202,170'},${0.2 + r() * 0.3})`; x.fillRect(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2); }
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(90,78,56,0.25)'); g.addColorStop(0.5, 'rgba(90,78,56,0)'); g.addColorStop(1, 'rgba(90,78,56,0.25)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(96,98,92,0.6)'; x.lineWidth = 1; for (let a = 0; a <= w; a += 8) { x.beginPath(); x.moveTo(a, 0); x.lineTo(a, h); x.stroke(); } for (let b = 0; b <= h; b += 8) { x.beginPath(); x.moveTo(0, b); x.lineTo(w, b); x.stroke(); }
  x.fillStyle = 'rgba(80,82,78,0.9)'; for (const a of [0, w - 3]) x.fillRect(a, 0, 3, h);   // (the frame's uprights at its corners)
});
// chain-link: a diamond weave, seen through
const rtMeshTex = () => rtTex(64, 64, x => { x.strokeStyle = 'rgba(150,156,160,1)'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(96, 64); x.moveTo(96, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(-32, 64); x.stroke(); });
let RTM = null;
function rtMats() {
  if (RTM) return RTM;
  RTM = {
    // walls: the army's T-walls, the store's painted block (soot up its top), the cooler's white panels, the lots' grey block
    tw: rtTall(0xa39d90), twDk: rtTall(0x8a8478), twSeam: rtTall(0x5f5b54), twBase: rtTall(0x7e786d),
    hesco: rtTall(0xffffff, { map: rtHescoTex() }), hescoTop: rtTall(0xb5a47c),
    blk: rtTall(0xcfc6b2), blkDk: rtTall(0xb3aa96), soot: rtTall(0x7a7066), sootDk: rtTall(0x5c544c), cap: rtTall(0x8d877b),
    board: rtTall(0x9b7a52), boardDk: rtTall(0x7a5e3e), frame: rtTall(0x5d6164),
    cool: rtTall(0xd9dcd8), coolDk: rtTall(0x9da2a2), steel: rtTall(0x7f8588),
    lotW: rtTall(0x8f8e88), lotWDk: rtTall(0x77766f), lotCap: rtTall(0xa3a199),
    garage: rtTall(0x8fa3a8), garageDk: rtTall(0x6c7f84), roller: rtTall(0xb8b3a6), rollerDk: rtTall(0x8a867b), signRed: rtTall(0xa8362a),
    low: lam(0x9a968c), lowCap: lam(0xb2aea4),
    // the store's insides
    shelf: rtTall(0x9aa0a3), shelfDk: rtTall(0x5d6266), goods: [lam(0xb44a32), lam(0x3f6b8a), lam(0xd0b64c), lam(0x5d8a44), lam(0xd8d2c4)],
    counter: lam(0x5a3b28), counterTop: lam(0xb9b2a4), till: lam(0x2c2d2f), joist: rtTall(0x2a2622),
    // the forecourt
    pumpBody: rtTall(0xd8d4ca), pumpTop: rtTall(0xa8302a), pumpDk: rtTall(0x2e3133), island: lam(0xa9a59b), stripe: lam(0xd2a62c), stripeDk: lam(0x222222),
    canopy: rtTall(0xdcd7cc), canopyDk: rtTall(0x4a4c4f), canopyRed: rtTall(0xa8302a), deck: lam(0xb7b2a6), downlight: new THREE.MeshBasicMaterial({ color: 0x8a8c8e }),
    olive: rtTall(0x4d5232), oliveDk: rtTall(0x34381f), canvas: rtTall(0x5f6340), tyre: lam(0x1d1d1e), tyreT: rtTall(0x1d1d1e), hub: lam(0x4a4b4c), chassis: rtTall(0x252627),
    crate: lam(0x4f5634), crateDk: lam(0x363b23), pallet: lam(0x9a7b52), wrap: lam(0xb9c4c8), box: lam(0xa8875a),
    bag: lam(0xa38f66), bagDk: lam(0x8a7752),
    // the highway
    jersey: lam(0xb4ae9f), jerseyDk: lam(0x8f897b), jerseyStripe: lam(0xc9a43a),
    burnt: lam(0x2b2724), burntB: lam(0x3a2c24), rust: lam(0x6b3a22), char: lam(0x151414), glass: lam(0x1c2226),
    cars: [lam(0x7a2a24), lam(0x2c4a6a), lam(0x8a8a86), lam(0xc0b9a8), lam(0x4a5a3a), lam(0x6a5a3a)],
    cab: [rtTall(0x8a2a22), rtTall(0x2c4466)], cabBurnt: rtTall(0x2f2a26), cabGlass: rtTall(0x1a1e21), chrome: rtTall(0xa8acae),
    van: rtTall(0xe0ddd4), vanDk: rtTall(0x9a978e), bus: rtTall(0xd6a12a),
    dump: lam(0x2f5a3a), dumpDk: lam(0x24452c),
    pole: lam(0x4a4b4c), lampHead: new THREE.MeshBasicMaterial({ color: 0x4a4c4e }),
    // the store's front and its bays, the guardrail, the roofs (from your own eyes)
    base: rtTall(0x4c4844), parapet: rtTall(0xd6cebb), rail: lam(0xb9bcbd), railDk: lam(0x6d7173),
    iceBox: lam(0xe6ecef), iceLid: lam(0x2c6a9a), bin: lam(0x5a4a3a), binLid: lam(0x2f2f2f), propane: lam(0xd8dde0),
    cage: lam(0xffffff, { map: (() => { const t = rtMeshTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 5); return t; })(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide }),
    roofTop: lam(0x4a4846)
  };
  return RTM;
}

// ---- building it: each kind's piece (parts: folded into a few meshes by world/arena.js), and its footprint for what
// walks into it and what a round hits (cellBox, not the whole cell)
let rP = null, rParts = null, rDid = null;
const rPush = m => { if (!m.parent) rP.add(m); rParts.push(m); return m; };
const rBox = (w, h, d, mat, x, y, z) => rPush(box(rP, w, h, d, mat, x, y, z));
const rCyl = (r0, r1, h, mat, x, y, z, seg = 12, rx = 0, rz = 0) => { const m = rPush(new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = m.receiveShadow = true; return m; };
// a footprint, clipped to its cell
const rFoot = (i, j, x0, z0, x1, z1) => { const cx = cxw(i), cz = cxw(j); cellBox[idx(i, j)] = [Math.max(x0, cx - 0.5), Math.max(z0, cz - 0.5), Math.min(x1, cx + 0.5), Math.min(z1, cz + 0.5)]; };
// a run of one kind as a rectangle from its north-west cell (never across the middle: each half's its own), each cell
// of it marked done; [i0, j0, i1, j1] in grid cells
function rRect(i, j, k) {
  const half = i - RT_B[0] < RT_W / 2, inHalf = a => (a - RT_B[0] < RT_W / 2) === half;
  let i1 = i, j1 = j; while (RT_KIND(i1 + 1, j) === k && inHalf(i1 + 1)) i1++;
  for (;;) { let ok = true; for (let a = i; a <= i1 && ok; a++) if (RT_KIND(a, j1 + 1) !== k) ok = false; if (!ok) break; j1++; }
  for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) rDid.add(idx(a, b));
  return [i, j, i1, j1];
}
// a rectangle's extent in the world: x0, z0, x1, z1, its middle, its size
const rExt = ([i0, j0, i1, j1]) => { const x0 = cxw(i0) - 0.5, x1 = cxw(i1) + 0.5, z0 = cxw(j0) - 0.5, z1 = cxw(j1) + 0.5; return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; };
const rFootRect = (R, x0, z0, x1, z1) => { for (let b = R[1]; b <= R[3]; b++) for (let a = R[0]; a <= R[2]; a++) rFoot(a, b, x0, z0, x1, z1); };

// (a plan column or row's middle in the world)
const RX = ii => cxw(RT_B[0] + ii), RZ = jj => cxw(RT_B[1] + jj);
// a cap along the top of a wall (a coping, a parapet's cap): the length of its cell along the run and a hair proud
// across it (over), so the caps of a run meet end to end and never lie over one another; a corner's (or a lone pier's)
// a touch bigger every way, so no two caps ever share a face (and flicker where they meet)
function rCap(x, z, y, h, over, mat, ax, az) {
  if (ax && !az) rBox(1, h, 1 + over, mat, x, y + h / 2, z);
  else if (az && !ax) rBox(1 + over, h, 1, mat, x, y + h / 2, z);
  else rBox(1 + over + 0.02, h + 0.012, 1 + over + 0.02, mat, x, y + h / 2, z);
}
const rRuns = (i, j, set) => { const s = c => set.includes(c); return [s(RT_KIND(i - 1, j)) || s(RT_KIND(i + 1, j)), s(RT_KIND(i, j - 1)) || s(RT_KIND(i, j + 1))]; };
// a decal or sign laid on a face: drawn a little toward the camera in the depth test, so it never flickers through the
// face it's on (polygon offset), and placed a couple of centimetres proud of it as well
const rDecal = m => { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; return m; };

// ---- the perimeter: the army's T-walls on the two sides away from the camera from above (north and west), the store's
// own back wall along the north behind it, the garage's front along the west of its lot; on the camera's sides only
// what's low: the highway's guardrail with the fence behind it south, the motel lot's low wall east (chain-link over
// both, rtFence), so nothing near them is lost behind them from above
function rtPerimeter(i, j, x, z) {
  const ii = i - RT_B[0], jj = j - RT_B[1], M = RTM;
  if (jj === RT_D - 1) {   // (the highway's south edge: a steel guardrail on its posts, the fence's concrete footing behind)
    rBox(1, 0.34, 0.07, M.rail, x, 0.6, z - 0.42); rBox(1, 0.06, 0.09, M.railDk, x, 0.6, z - 0.42);
    if (ii % 2 === 0) { rBox(0.1, 0.78, 0.12, M.railDk, x, 0.39, z - 0.3); rBox(0.08, 0.2, 0.14, M.railDk, x, 0.6, z - 0.37); }
    rBox(1, 0.14, 0.4, M.low, x, 0.07, z + 0.05); return;
  }
  if (ii === RT_W - 1) { rBox(1, 1.05, 1, M.low, x, 0.525, z); rCap(x, z, 1.05, 0.08, 0.04, M.lowCap, false, true); return; }
  if (jj === 0 && ii >= RT_STORE.i0 && ii <= RT_STORE.i1) { rtStore(i, j, x, z); return; }
  if (ii === 0 && jj >= 11 && jj <= 28) { rtGarageFront(jj, x, z); return; }
  rtTWall(x, z, ii === 0, 3.0, (jj === 0 ? ii : jj));
}
// a T-wall: a precast slab on its inverted-T foot, a seam every other panel, its top chamfered
function rtTWall(x, z, alongZ, H, n) {
  const M = RTM, m = n % 4 < 2 ? M.tw : M.twDk;
  const w = alongZ ? 0.62 : 1, d = alongZ ? 1 : 0.62;
  rBox(1, 0.42, 1, M.twBase, x, 0.21, z);
  rBox(w, H - 0.42, d, m, x, 0.42 + (H - 0.42) / 2, z);
  rBox(alongZ ? 0.42 : 1, 0.12, alongZ ? 1 : 0.42, m, x, H + 0.06, z);
  if (n % 2 === 0) rBox(alongZ ? w + 0.02 : 0.03, H - 0.5, alongZ ? 0.03 : d + 0.02, M.twSeam, x + (alongZ ? 0 : 0.5), 0.42 + (H - 0.5) / 2, z + (alongZ ? 0.5 : 0));
}
// ---- the garage's front, the west lot's wall: pale steel cladding, its fascia; its two service bays open behind their
// security grilles (you see in, past the lift and the car wash's brushes, but the grille's down: no way through), the
// office between them, its window and its door
const RT_BAYS = [[13, 16], [23, 26]];
function rtGarageFront(jj, x, z) {
  const M = RTM, H = 4.2, bay = RT_BAYS.some(([a, b]) => jj >= a && jj <= b);
  if (bay) rBox(1, H - 3.4, 1, M.garage, x, 3.4 + (H - 3.4) / 2, z);   // (the header over the bay)
  else rBox(1, H, 1, M.garage, x, H / 2, z);
  rBox(1.04, 0.4, 1, M.garageDk, x, 3.95, z);   // (the fascia band, along the front)
  if (!bay) rBox(0.04, 0.3, 1, M.garageDk, x + 0.52, 0.15, z);   // (a kick plate)
  for (const [a, b] of RT_BAYS) { if (jj === a - 1) rBox(0.1, 3.5, 0.14, M.garageDk, x + 0.55, 1.75, z + 0.43); if (jj === b + 1) rBox(0.1, 3.5, 0.14, M.garageDk, x + 0.55, 1.75, z - 0.43); }   // (each bay's jambs)
}
function rtGarageBays(g) {
  const M = RTM, xf = RX(0) + 0.5, xi = RX(0) - 0.5, xb = xi - 9.7;   // (the front's face, its inside, the back wall's inside)
  const grille = rtTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(150,154,156,1)'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 5); for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h); });
  grille.wrapS = grille.wrapT = THREE.RepeatWrapping;
  for (const [a, b] of RT_BAYS) {
    const z0 = RZ(a) - 0.5, z1 = RZ(b) + 0.5, zc = (z0 + z1) / 2, t = grille.clone(); t.needsUpdate = true; t.repeat.set((z1 - z0) * 2, 3.4 * 2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 3.4), lam(0xffffff, { map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })); p.position.set(xf - 0.03, 1.7, zc); p.rotation.y = Math.PI / 2; p.castShadow = true; g.add(p);
    rBox(0.1, 0.1, z1 - z0, M.railDk, xf - 0.04, 0.05, zc); rBox(0.16, 0.24, z1 - z0, M.garageDk, xf - 0.08, 3.28, zc);   // (its bottom bar, its box above)
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(xi - xb, z1 - z0), lam(a < 20 ? 0x56544f : 0x4a4f52)); fl.rotation.x = -Math.PI / 2; fl.position.set((xb + xi) / 2, 0.006, zc); fl.receiveShadow = true; g.add(fl);
    if (a < 20) {   // the service bay: a two-post lift with a car up on it, tyres stacked, a tool chest, a bench
      for (const s of [-1, 1]) { rBox(0.3, 3.0, 0.3, M.signRed, xi - 4.5, 1.5, zc + s * 1.7); rBox(1.2, 0.08, 0.12, M.railDk, xi - 4.5, 1.58, zc + s * 1.45); }
      const cg = new THREE.Group(); cg.position.set(xi - 4.5, 1.62, zc); cg.rotation.y = Math.PI / 2; rP.add(cg); rtCarModel(cg, 4.0, 1.7, M.cars[1], false, false);
      for (let n = 0; n < 5; n++) rCyl(0.33, 0.33, 0.22, M.tyre, xb + 0.5, 0.11 + n * 0.225, z0 + 0.5, 14);
      for (let n = 0; n < 3; n++) rCyl(0.33, 0.33, 0.22, M.tyre, xb + 1.25, 0.11 + n * 0.225, z0 + 0.55, 14);
      rBox(0.6, 1.0, 1.0, M.signRed, xb + 0.35, 0.5, z1 - 0.8); rBox(0.7, 0.9, 2.2, M.counter, xb + 0.4, 0.45, zc + 0.2); rBox(0.8, 0.05, 2.3, M.counterTop, xb + 0.42, 0.925, zc + 0.2);
    } else {   // the car wash: its gantry and two brushes, the hose reel on the wall
      rBox(0.3, 3.1, 0.3, M.steel, xi - 4.0, 1.55, z0 + 0.35); rBox(0.3, 3.1, 0.3, M.steel, xi - 4.0, 1.55, z1 - 0.35); rBox(0.4, 0.4, z1 - z0 - 0.4, M.steel, xi - 4.0, 3.0, zc);
      for (const s of [-1, 1]) rCyl(0.42, 0.42, 2.5, rtTall(0x2f5f8a), xi - 4.6, 1.5, zc + s * 1.1, 14);
      rCyl(0.3, 0.3, 0.2, M.signRed, xb + 0.15, 1.6, z1 - 0.7, 14, 0, Math.PI / 2);
    }
  }
}
// ---- the store (its walls, its front, the cooler in its middle): a real building. Painted block on a dark base, soot
// up its walls from the fire, its roof still on (from your own eyes: rtStoreRoof; from above it's cut away so you see
// in, its parapet left standing round the edge as a roof's would). Along the front its windows boarded over, the ice
// chest and the bin in a bay of the wall by the corner, the propane cage in one in the side wall; the ROUTE 9 MART sign
// on the front's parapet
const RT_SH = 3.0;   // (its walls' height, to the roof)
function rtStoreBody(x, z, w, d, y0, M) {   // (a piece of plain wall: its dark base, the paint, soot above where the fire licked)
  const top = RT_SH, split = 2.0 + rand() * 0.5;
  if (y0 < 0.3) rBox(w, 0.3 - y0, d, M.base, x, (y0 + 0.3) / 2, z);
  const a = Math.max(y0, 0.3); if (split > a) rBox(w, split - a, d, rand() < 0.15 ? M.blkDk : M.blk, x, (a + split) / 2, z);
  rBox(w, top - Math.max(split, a), d, rand() < 0.3 ? M.sootDk : M.soot, x, (Math.max(split, a) + top) / 2, z);
}
function rtStore(i, j, x, z) {
  const M = RTM, ii = i - RT_B[0], jj = j - RT_B[1], mi = Math.min(ii, RT_W - 1 - ii);
  if (mi >= RT_CORE.i0 && jj >= 1 && jj <= RT_CORE.j1) { rtCooler(i, j, x, z); return; }
  const front = jj === RT_STORE.j1, back = jj === 0, side = mi === RT_STORE.i0, ext = front || back || side;
  const nx = side && !front && !back ? (ii < RT_W / 2 ? -1 : 1) : 0, nz = front ? 1 : back && !side ? -1 : 0;
  const recess = side && jj >= 8 && jj <= 10 ? 'propane' : front && mi === 16 ? 'ice' : front && mi === 12 ? 'trash' : null;
  if (recess) {   // (a bay in the wall: its inner half full height, the header over the bay, what stands in it)
    const ox = nx * 0.25, oz = nz * 0.25, hw = nx ? 0.5 : 1, hd = nx ? 1 : 0.5;
    rtStoreBody(x - ox, z - oz, hw, hd, 0, M); rBox(hw, RT_SH - 2.2, hd, M.soot, x + ox, 2.2 + (RT_SH - 2.2) / 2, z + oz);
    if (recess === 'ice') { rBox(0.94, 1.22, 0.44, M.iceBox, x, 0.61, z + 0.27); rBox(0.96, 0.05, 0.46, M.iceLid, x, 1.245, z + 0.27); rtDecalSign('ICE', 0.7, 0.3, '#e9f2f6', '#2c6a9a', x, 0.9, z + 0.496, 0); }
    else if (recess === 'trash') { rCyl(0.24, 0.22, 0.95, M.bin, x, 0.475, z + 0.25, 14); rCyl(0.26, 0.26, 0.06, M.binLid, x, 0.98, z + 0.25, 14); }
    else {   // (the propane cage: its frame, its mesh front, the bottles on its two shelves)
      const fx = x + nx * 0.27;
      for (const s of [-0.47, 0.47]) rBox(0.44, 1.8, 0.04, M.railDk, fx, 0.9, z + s);
      rBox(0.44, 0.04, 1, M.railDk, fx, 1.8, z); rBox(0.44, 0.04, 1, M.railDk, fx, 0.9, z);
      for (const y of [0.02, 0.92]) for (const s of [-0.22, 0.22]) rCyl(0.15, 0.15, 0.6, M.propane, fx - nx * 0.02, y + 0.3, z + s, 12);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.8), RTM.cage); mesh.position.set(x + nx * 0.49, 0.9, z); mesh.rotation.y = nx < 0 ? -Math.PI / 2 : Math.PI / 2; rP.add(mesh);
      if (jj === 9) rtDecalSign('PROPANE EXCHANGE', 2.6, 0.45, '#efe8d6', '#2c5a8a', x + nx * 0.506, 2.6, z, nx < 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  } else if (front && !side) {   // (the shopfront: a sill, the window's frame with its glass gone and plywood over it, a header)
    rBox(1, 0.3, 1, M.base, x, 0.15, z); rBox(1, 0.6, 1, M.blk, x, 0.6, z);
    rBox(1, 1.3, 0.5, M.frame, x, 1.55, z);
    for (const s of [-1, 1]) { const b = rBox(0.96, 1.26, 0.04, (i + j) % 3 ? M.board : M.boardDk, x, 1.55, z + s * 0.27); b.rotation.z = rr(-0.02, 0.02); }
    rBox(1, RT_SH - 2.2, 1, rand() < 0.4 ? M.sootDk : M.soot, x, 2.2 + (RT_SH - 2.2) / 2, z);
    for (const d of [-1, 1]) if ('.ABF'.includes(RT_KIND(i + d, j))) rBox(0.1, 2.3, 1.02, M.frame, x + d * 0.47, 1.15, z);   // (the doors' aluminium frames)
  } else rtStoreBody(x, z, 1, 1, 0, M);
  if (ext) {   // (the parapet round the roof, taller along the front for the sign, and its cap)
    const ph = front ? 0.9 : 0.5; rBox(1, ph, 1, M.parapet, x, RT_SH + ph / 2, z);
    rCap(x, z, RT_SH + ph, 0.08, 0.06, M.cap, (front || back) && !(side && !front && !back), side && !(front || back) || (side && (front || back)));
  }
}
// the openings in the store's walls, each with its lintel over it at door height (and the parapet over that, on the
// outside): the front doors, the side door, the storeroom's back door, the way from the storeroom to the shop floor
// ([column, row, column, row] in the plan, the west half's; the east half's mirrored)
const RT_LINTELS = [[13, 11, 15, 11, 1], [11, 6, 11, 7, 1], [11, 1, 11, 3, 1], [16, 4, 17, 4, 0]];
function rtLintels() {
  const M = RTM;
  for (const [a0, b0, a1, b1, ext] of RT_LINTELS) for (const s of [0, 1]) {
    const i0 = s ? RT_W - 1 - a1 : a0, i1 = s ? RT_W - 1 - a0 : a1, x0 = RX(i0) - 0.5, x1 = RX(i1) + 0.5, z0 = RZ(b0) - 0.5, z1 = RZ(b1) + 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    rBox(w, RT_SH - 2.3, d, M.soot, cx, 2.3 + (RT_SH - 2.3) / 2, cz);
    if (ext) { const front = b0 === RT_STORE.j1, ph = front ? 0.9 : 0.5, alongX = w > d; rBox(w, ph, d, M.parapet, cx, RT_SH + ph / 2, cz); rBox(alongX ? w : w + 0.06, 0.08, alongX ? d + 0.06 : d, M.cap, cx, RT_SH + ph + 0.04, cz); }
  }
}
// the cooler and the restrooms in the middle: white insulated panels, their own roof cap over the whole block, the
// cooler's door and the restrooms'
let rtCoolCap = false;
function rtCooler(i, j, x, z) {
  const M = RTM, ii = i - RT_B[0], jj = j - RT_B[1], H = 2.9;
  rBox(1, H, 1, M.cool, x, H / 2, z);
  if (jj === RT_CORE.j1 && ii % 2 === 0) rBox(1.02, H - 0.2, 0.03, M.coolDk, x, H / 2, z + 0.5);
  if (jj === RT_CORE.j1 && (ii === 19 || ii === 22)) { rBox(0.86, 2.0, 0.06, M.steel, x, 1.0, z + 0.52); rBox(0.12, 0.3, 0.1, M.coolDk, x + 0.3, 1.0, z + 0.57); rtDecalSign(ii === 19 ? 'RESTROOMS' : 'COOLER', 0.84, 0.22, '#e9e6de', '#3a3a3a', x, 2.3, z + (ii % 2 ? 0.506 : 0.521), 0); }
  if (!rtCoolCap) { rtCoolCap = true; const x0 = RX(RT_CORE.i0) - 0.53, x1 = RX(RT_W - 1 - RT_CORE.i0) + 0.53, z0 = RZ(1) - 0.5, z1 = RZ(RT_CORE.j1) + 0.53; rBox(x1 - x0, 0.1, z1 - z0, M.coolDk, (x0 + x1) / 2, H + 0.05, (z0 + z1) / 2); }
}
// the store's roof from your own eyes: the slab over it all (the ceiling's tiles on its underside, water-stained), the
// strip lights hung from it, dead now, one come down at one end; it casts its shade then, as a roof does
function rtStoreRoof(fp) {
  const M = RTM, x0 = RX(RT_STORE.i0) + 0.5, x1 = RX(RT_STORE.i1) - 0.5, z0 = RZ(0) + 0.5, z1 = RZ(RT_STORE.j1) - 0.5;
  const ceil = rtTex(256, 256, (c, w, h) => { c.fillStyle = '#d8d3c6'; c.fillRect(0, 0, w, h); const r = seeded(404); c.strokeStyle = 'rgba(120,114,100,0.9)'; c.lineWidth = 3; for (let a = 0; a <= w; a += 64) { c.beginPath(); c.moveTo(a, 0); c.lineTo(a, h); c.stroke(); c.beginPath(); c.moveTo(0, a); c.lineTo(w, a); c.stroke(); }
    for (let k = 0; k < 5; k++) { const g = c.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 40); g.addColorStop(0, 'rgba(110,84,52,0.45)'); g.addColorStop(1, 'rgba(110,84,52,0)'); c.save(); c.translate(r() * w, r() * h); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 70, 0, 7); c.fill(); c.restore(); }
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(60,50,40,${r() * 0.25})`; c.fillRect(r() * w, r() * h, 2, 2); } }, [(x1 - x0) / 2.4, (z1 - z0) / 2.4]);
  const top = M.roofTop, ceilM = lam(0xffffff, { map: ceil });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), [top, top, top, ceilM, top, top]); slab.position.set((x0 + x1) / 2, RT_SH + 0.1, (z0 + z1) / 2); slab.castShadow = true; slab.receiveShadow = true; fp.add(slab);
  const tube = lam(0xe8ecee), hous = lam(0x9a9c9a);
  for (const x of [-7.5, -4.5, 4.5, 7.5, -1.5, 1.5]) for (const z of [-17.5, -13.5, -10.5]) {
    if (x === 7.5 && z === -10.5) {   // (one come down at its far end, hanging off the other)
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 0.3), hous); h.position.set(x - 0.48, RT_SH - 0.38, z); h.rotation.z = -0.62; fp.add(h); continue;
    }
    if (Math.abs(x) < 3 && z < -12) continue;   // (none over the cooler)
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.3), hous); h.position.set(x, RT_SH - 0.03, z); fp.add(h);
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, 0.2), tube); l.position.set(x, RT_SH - 0.07, z); fp.add(l);
  }
}
// ---- the spawn lots' walls: a yard wall of grey block (its courses in the block's own pattern), its coping
function rtLotWall(i, j, x, z) {
  const M = RTM, H = 2.5, [ax, az] = rRuns(i, j, '#hW');
  rBox(1, H, 1, rand() < 0.15 ? M.lotWDk : M.lotW, x, H / 2, z);
  rCap(x, z, H, 0.1, 0.06, M.lotCap, ax, az);
}
function rtBlock(i, j, x, z) {
  const ii = i - RT_B[0], jj = j - RT_B[1];
  if (jj <= RT_STORE.j1 && ii >= RT_STORE.i0 && ii <= RT_STORE.i1) rtStore(i, j, x, z);
  else if (jj < RT_STORE.j1) rtCarWash(i, j);
  else rtLotWall(i, j, x, z);
}
// ---- the car wash in each side lot: a block-built bay under a flat roof, its roller door down at each end, the
// brushes' gantry showing over its parapet, CAR WASH along its side; the soot of the fire licked up one end
function rtCarWash(i, j) {
  const M = RTM, R = rRect(i, j, 'h'), E = rExt(R), H = 3.0, west = E.cx < 0;
  rBox(E.w, 0.3, E.d, M.base, E.cx, 0.15, E.cz); rBox(E.w, H - 0.3, E.d, M.lotW, E.cx, 0.3 + (H - 0.3) / 2, E.cz);
  rBox(E.w + 0.3, 0.14, E.d + 0.3, M.lotCap, E.cx, H + 0.07, E.cz);
  for (const s of [-1, 1]) { const fx = s < 0 ? E.x0 : E.x1; rBox(0.05, 2.4, E.d - 0.6, M.garageDk, fx + s * 0.03, 1.2, E.cz); for (let y = 0.3; y < 2.4; y += 0.3) rBox(0.06, 0.03, E.d - 0.62, M.lotWDk, fx + s * 0.04, y, E.cz); }
  rBox(0.4, 0.5, E.d - 0.4, M.steel, E.cx, H + 0.39, E.cz); rCyl(0.3, 0.3, E.d - 0.8, rtTall(0x2f5f8a), E.cx, H + 0.45, E.cz, 12, Math.PI / 2, 0);
  rtDecalSign('CAR WASH', Math.min(3.2, E.w - 0.4), 0.5, '#e9e6de', '#2c5a8a', E.cx, 2.4, E.z1 + 0.02, 0);
  { const sw = E.w * 0.42, so = new THREE.Mesh(new THREE.PlaneGeometry(sw, 2.1), rDecal(rtTall(0xffffff, { map: liveTex(256, 256, (c, W, H) => paintSoot(c, W, H, 41)), transparent: true, depthWrite: false })));
    so.position.set(E.cx + (west ? 1 : -1) * (E.w / 2 - sw / 2 - 0.05), 1.05, E.z1 + 0.012); rP.add(so); }   // (the soot of the fire licked up the end, below the sign, never over it)
  rFootRect(R, E.x0, E.z0, E.x1, E.z1);
}
// ---- the blast walls: T-walls in a line (along the highway), HESCO baskets where they stand as blocks (the
// checkpoint's corners, the sentry posts), two high
function rtBlast(i, j, x, z) {
  const jj = j - RT_B[1];
  if (jj === 28) { rtTWall(x, z, false, RT_H.W, i); return; }
  const M = RTM; rBox(1, 1.3, 1, M.hesco, x, 0.65, z); rBox(1, 1.3, 1, M.hesco, x, 1.95, z); rBox(0.9, 0.04, 0.9, M.hescoTop, x, 2.62, z);
}
// ---- the gondolas: a steel back panel down the middle, shelves either side, mostly looted, the odd box left
function rtShelf(i, j, x, z) {
  const M = RTM, H = RT_H.S;
  rBox(0.9, 0.12, 1, M.shelfDk, x, 0.06, z); rBox(0.06, H - 0.18, 1, M.shelf, x, 0.12 + (H - 0.18) / 2, z); rBox(0.9, 0.06, 1, M.shelfDk, x, H - 0.03, z);
  for (let s = 0; s < 4; s++) {
    const y = 0.14 + s * 0.42; for (const sd of [-1, 1]) {
      rBox(0.4, 0.03, 1, M.shelf, x + sd * 0.23, y, z);
      if (rand() < 0.45) { const d = rr(0.16, 0.3), h = rr(0.12, 0.3), w = rr(0.2, 0.34), bx = x + sd * 0.23, bz = z + rr(-0.3, 0.3); RT_BOX.list.push({ x: bx, y: y + 0.015 + h / 2 + 0.001, z: bz, w, h, d, c: Math.floor(rand() * M.goods.length), i: ci(bx), j: ci(bz) }); }   // (each its own, to be shot off: RT_BOX)
    }
  }
  rFoot(i, j, x - 0.45, z - 0.5, x + 0.45, z + 0.5);
}
// the checkout counter: a wood front, a pale top, a till on it
function rtCounter(i, j, x, z) {
  const M = RTM, H = RT_H.n, end = (RT_KIND(i - 1, j) !== 'n' ? 0.01 : 0) + (RT_KIND(i + 1, j) !== 'n' ? 0.01 : 0), sh = (RT_KIND(i + 1, j) !== 'n' ? 0.005 : 0) - (RT_KIND(i - 1, j) !== 'n' ? 0.005 : 0);
  rBox(1, H - 0.05, 0.7, M.counter, x, (H - 0.05) / 2, z); rBox(1 + end, 0.05, 0.78, M.counterTop, x + sh, H - 0.025, z);
  if (RT_KIND(i - 1, j) !== 'n') { rBox(0.36, 0.2, 0.3, M.till, x, H + 0.1, z); rBox(0.3, 0.2, 0.03, M.till, x, H + 0.3, z - 0.1); }
  rFoot(i, j, x - 0.5, z - 0.39, x + 0.5, z + 0.39);
}
// ---- what's left on the gondolas: a round (or a pellet) that goes into the shelving knocks the box it meets off in a
// burst of dust and scraps of cardboard, back with the next round (world/arena-boxes.js, as the mall's and the farm's).
// Dressing only: the shelving still stops the round. Each { x, y, z, w, h, d, c } in the world, gathered as the
// gondolas are built (rtShelf), the same list from the same seed on every screen
const RT_BOX = { list: [] };
function rtBoxMesh(g) { const bx = arBoxSet('route', g); RT_BOX.list.forEach(b => bx.add(b.x, b.y, b.z, b.w, b.h, b.d, RTM.goods[b.c].color)); bx.done(); }
// ---- the forecourt: a pump island (its run of G cells): a kerbed island, two pumps, the canopy's column between them
function rtPump(i, j) {
  const M = RTM, E = rExt(rRect(i, j, 'G')), L = E.w;
  rBox(L, 0.2, 0.96, M.island, E.cx, 0.1, E.cz);
  for (const s of [-1, 1]) { rBox(0.19, 0.21, 0.97, M.stripe, E.cx + s * (L / 2 - 0.09), 0.105, E.cz); rBox(0.12, 0.9, 0.12, M.stripe, E.cx + s * (L / 2 - 0.22), 0.65, E.cz); }   // (its painted ends, a bollard each)
  for (const s of [-1, 1]) {
    const px = E.cx + s * 1.0;   // (each from the column to near the island's end: no gap to see through between them)
    rBox(1.5, 1.45, 0.56, M.pumpBody, px, 0.2 + 0.725, E.cz); rBox(1.5, 0.32, 0.6, M.pumpTop, px, 1.65 + 0.16, E.cz); rBox(1.52, 0.06, 0.6, M.pumpDk, px, 0.24, E.cz);
    for (const f of [-1, 1]) { rBox(0.5, 0.3, 0.02, M.pumpDk, px - 0.25, 1.3, E.cz + f * 0.29); rBox(0.12, 0.3, 0.08, M.pumpDk, px + 0.45, 0.95, E.cz + f * 0.31); }   // (its screen, a nozzle holstered)
  }
  rBox(0.5, RT_CANOPY.y - 0.2, 0.5, M.canopy, E.cx, 0.2 + (RT_CANOPY.y - 0.2) / 2, E.cz); rBox(0.58, 0.5, 0.58, M.canopyDk, E.cx, 0.45, E.cz);
  rFootRect(rRectOf(E), E.x0, E.cz - 0.48, E.x1, E.cz + 0.48);
}
const rRectOf = E => [ci(E.x0 + 0.5), ci(E.z0 + 0.5), ci(E.x1 - 0.5), ci(E.z1 - 0.5)];
// the canopy over the forecourt: its fascia round the edge with the red band along its foot and the services' name on
// it, the columns' heads and the outriggers out to the edge; its beams, its deck and its downlights only from your own
// eyes (from above you look down through where it'd be, as the cutaway does a roof). Every piece at its own height,
// so none lies in another's face
function rtCanopy(g, fp) {
  const M = RTM, C = RT_CANOPY, x0 = RX(C.i0) - 0.5, x1 = RX(C.i1) + 0.5, z0 = RZ(C.j0) - 0.5, z1 = RZ(C.j1) + 0.5, y = C.y, fb = y - 0.04, ft = y + 0.6, fh = ft - fb;
  for (const z of [z0, z1]) { rBox(x1 - x0 + 0.12, fh, 0.12, M.canopy, (x0 + x1) / 2, fb + fh / 2, z); rBox(x1 - x0 + 0.15, 0.12, 0.15, M.canopyRed, (x0 + x1) / 2, y + 0.06, z); }
  for (const x of [x0, x1]) { rBox(0.12, fh, z1 - z0 - 0.12, M.canopy, x, fb + fh / 2, (z0 + z1) / 2); rBox(0.15, 0.12, z1 - z0 - 0.15, M.canopyRed, x, y + 0.06, (z0 + z1) / 2); }
  const cx = [RX(13.5), RX(RT_W - 1 - 13.5)], cz = [RZ(14), RZ(25)];
  for (const x of cx) for (const z of cz) {   // (each column's head, its outriggers out to the edge)
    rBox(0.6, 0.38, 0.6, M.canopyDk, x, 4.79, z);
    const ex = x < 0 ? x0 : x1, ez = z < 0 ? z0 : z1;
    rBox(Math.abs(ex - x), 0.22, 0.2, M.canopyDk, (x + ex) / 2, 4.79, z);
    rBox(0.2, 0.22, Math.abs(ez - z), M.canopyDk, x, 4.79, (z + ez) / 2);
  }
  // the sign on its fascia, facing the highway and the store: the services' name (on the fascia above its red band)
  for (const s of [-1, 1]) rtDecalSign('ROUTE  9   ·   TRAVEL  STOP   ·   FUEL', 12, 0.32, '#dcd7cc', '#a8302a', 0, 5.08, s < 0 ? z0 - 0.066 : z1 + 0.066, s < 0 ? Math.PI : 0);
  // (from your own eyes: the beams between the columns, the deck over it all, the downlights along the beams)
  const dB = (w, h, dd, m, bx, by, bz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); b.position.set(bx, by, bz); fp.add(b); return b; };
  for (const z of cz) dB(x1 - x0 - 0.12, 0.27, 0.22, M.canopyDk, (x0 + x1) / 2, 4.835, z);
  for (const x of cx) dB(0.22, 0.27, z1 - z0 - 0.12, M.canopyDk, x, 4.835, (z0 + z1) / 2);
  for (const x of [-9, -4.5, -1.5, 1.5, 4.5, 9]) for (const z of cz) dB(0.5, 0.03, 0.3, M.downlight, x, 4.685, z);
  const deck = dB(x1 - x0 - 0.12, 0.06, z1 - z0 - 0.12, M.deck, (x0 + x1) / 2, 5.01, (z0 + z1) / 2); deck.castShadow = true;
}
// what's only there from your own eyes (the roofs over the store and the forecourt), shown with the first-person view
let rtFP = null;
function rtTick() { if (rtFP) rtFP.visible = fpOn(); rtLampLit(); }
// ---- the army's truck across each spawn's gate: a six-wheeler, its cab north, a canvas tilt over its bed, the
// stowage boxes between its wheels
function rtArmyTruck(E) {
  const M = RTM, W = E.w - 0.06, n = E.z0, cab = 2.2;
  rBox(W - 0.5, 0.25, E.d - 0.1, M.chassis, E.cx, 0.85, E.cz);
  for (const z of [n + 1.1, E.z1 - 2.2, E.z1 - 1.1]) for (const s of [-1, 1]) { rCyl(0.5, 0.5, 0.36, M.tyreT, E.cx + s * (W / 2 - 0.2), 0.5, z, 14, 0, Math.PI / 2); rCyl(0.22, 0.22, 0.38, M.hub, E.cx + s * (W / 2 - 0.2), 0.5, z, 8, 0, Math.PI / 2); }
  rBox(W, 1.0, 0.85, M.olive, E.cx, 1.2, n + 0.475);   // (its bonnet, up to the cab's front)
  rBox(W, 1.5, cab - 0.9, M.olive, E.cx, 1.85, n + 0.9 + (cab - 0.9) / 2); rBox(W + 0.02, 0.5, 0.04, M.glass, E.cx, 2.25, n + 0.88); for (const s of [-1, 1]) rBox(0.04, 0.5, 0.8, M.glass, E.cx + s * (W / 2 + 0.01), 2.25, n + 1.55);
  rBox(W + 0.04, 0.3, 0.12, M.oliveDk, E.cx, 0.75, n + 0.02);   // (its bumper)
  const b0 = n + cab + 0.1, bl = E.z1 - 0.05 - b0;
  rBox(W, 0.55, bl, M.oliveDk, E.cx, 1.25, b0 + bl / 2);   // (the bed's sides)
  rBox(W - 0.04, 1.05, bl - 0.04, M.canvas, E.cx, 2.05, b0 + bl / 2);
  const t = rPush(new THREE.Mesh(new THREE.CylinderGeometry(W / 2 - 0.02, W / 2 - 0.02, bl - 0.04, 14, 1, false, 0, Math.PI), M.canvas)); t.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))); t.scale.set(0.42, 1, 1); t.position.set(E.cx, 2.575, b0 + bl / 2); t.castShadow = t.receiveShadow = true;
  for (let z = b0 + 0.6; z < E.z1 - 0.3; z += 1.3) rBox(W + 0.02, 0.05, 0.06, M.oliveDk, E.cx, 2.5, z);   // (the tilt's hoops)
  for (const s of [-1, 1]) { rBox(0.3, 0.6, 1.4, M.oliveDk, E.cx + s * (W / 2 - 0.2), 0.55, n + 2.85); rBox(0.3, 0.55, 0.9, M.chassis, E.cx + s * (W / 2 - 0.2), 0.6, E.z1 - 3.4); }   // (between the wheels: a fuel tank, the stowage boxes)
  rFootRect(rRectOf(E), E.cx - W / 2, E.z0 + 0.02, E.cx + W / 2, E.z1 - 0.02);
}
// the army's trailer behind its truck: a water bowser on its own two axles, its drawbar to the truck's tow hitch, its
// tank's walkway and filler, WATER NOT FOR DRINKING stencilled down it
function rtTrailer(E) {
  const M = RTM, W = E.w - 0.2, z0 = E.z0 + 0.15, z1 = E.z1 - 0.05, L = z1 - z0;
  rBox(0.12, 0.12, 0.7, M.chassis, E.cx, 0.75, z0 - 0.05);
  rBox(W - 0.5, 0.2, L, M.chassis, E.cx, 0.8, (z0 + z1) / 2);
  for (const z of [z1 - 1.6, z1 - 0.7]) for (const s of [-1, 1]) { rCyl(0.45, 0.45, 0.3, M.tyreT, E.cx + s * (W / 2 - 0.2), 0.45, z, 14, 0, Math.PI / 2); rCyl(0.2, 0.2, 0.32, M.hub, E.cx + s * (W / 2 - 0.2), 0.45, z, 8, 0, Math.PI / 2); }
  rCyl(W / 2 - 0.05, W / 2 - 0.05, L - 0.3, M.olive, E.cx, 1.75, (z0 + z1) / 2, 18, Math.PI / 2, 0);
  for (const z of [z0 + 0.15, z1 - 0.15]) rCyl(W / 2, W / 2, 0.12, M.oliveDk, E.cx, 1.75, z, 18, Math.PI / 2, 0);
  rBox(0.5, 0.05, L - 0.6, M.oliveDk, E.cx, 2.7, (z0 + z1) / 2); rCyl(0.22, 0.22, 0.2, M.oliveDk, E.cx, 2.8, (z0 + z1) / 2, 12);
  rFootRect(rRectOf(E), E.cx - W / 2, E.z0, E.cx + W / 2, z1);
}
// a box van against the highway's fence: its cab west, the box behind, a side guard between its wheels
function rtVan(E) {
  const M = RTM, D = E.d - 0.1, x0 = E.x0 + 0.03, x1 = E.x1 - 0.03, cab = 1.5, bx1 = x1 - cab - 0.05;
  for (const x of [x0 + 0.8, x1 - 0.8]) for (const s of [-1, 1]) rCyl(0.42, 0.42, 0.3, M.tyreT, x, 0.42, E.cz + s * (D / 2 - 0.15), 14, Math.PI / 2, 0);
  rBox(cab, 1.3, D, M.van, x1 - cab / 2, 1.15, E.cz); rBox(0.04, 0.55, D - 0.1, M.cabGlass, x1 + 0.01, 1.5, E.cz); rBox(cab - 0.3, 0.5, D + 0.02, M.cabGlass, x1 - cab / 2 - 0.1, 1.55, E.cz);
  rBox(bx1 - x0, 2.35, D, M.van, (x0 + bx1) / 2, 0.55 + 2.35 / 2, E.cz); rBox(bx1 - x0 - 0.3, 0.35, D + 0.02, M.vanDk, (x0 + bx1) / 2, 0.6, E.cz);
  rBox(0.08, 2.3, D - 0.2, M.vanDk, x0 + 0.03, 1.75, E.cz);   // (its back doors)
  rFootRect(rRectOf(E), x0, E.cz - D / 2, x1 + 0.02, E.cz + D / 2);
}
// a school bus on its side against the guardrail, the evacuation's: its roof to the road, its windows (now on top)
// dark, EVACUATION painted along it, read from above
function rtBus(E) {
  const M = RTM, L = E.w - 0.1, D = E.d - 0.12, H = RT_H.U - 0.05, zr = E.z0 + 0.06;
  rBox(L, H, D, M.bus, E.cx, H / 2, E.cz); rBox(L + 0.04, 0.3, D + 0.04, M.railDk, E.cx, 0.18, E.cz);   // (its body, the rub rail along what was its side)
  rBox(L - 0.9, 0.02, 0.75, M.glass, E.cx - 0.2, H + 0.01, zr + 0.75); rBox(0.04, H - 0.4, D - 0.3, M.glass, E.x0 + 0.03, H / 2 + 0.1, E.cz);   // (the windows, the windscreen)
  for (let x = E.x0 + 0.9; x < E.x1 - 0.6; x += 0.85) rBox(0.08, 0.025, 0.78, M.bus, x, H + 0.012, zr + 0.75);   // (the window posts)
  rBox(0.12, 0.35, D + 0.06, M.railDk, E.x0 + 0.02, 0.5, E.cz); rBox(0.12, 0.35, D + 0.06, M.railDk, E.x1 - 0.04, 0.5, E.cz);   // (its bumpers)
  const t = new THREE.Mesh(new THREE.PlaneGeometry(L - 1.2, 0.7), rDecal(lam(0xffffff, { map: rtTex(512, 64, (c, w, h) => { c.fillStyle = '#1c1c1c'; c.font = '800 46px "Saira Extra Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('E V A C U A T I O N', w / 2, h / 2 + 2); }), transparent: true, alphaTest: 0.3 })));
  t.rotation.x = -Math.PI / 2; t.position.set(E.cx + 0.2, H + 0.006, E.z1 - 0.75); rP.add(t);
  rFootRect(rRectOf(E), E.cx - L / 2 - 0.05, E.cz - D / 2 - 0.02, E.cx + L / 2 + 0.05, E.cz + D / 2 + 0.02);
}
// its tractor, slewed round across the median into the other's: the sleeper and cab behind a long bonnet, nosed south,
// burnt out
function rtTractor(E, k) {
  const M = RTM, W = E.w, z0 = E.z0 + 0.05, z1 = E.z1 - 0.05, body = k ? M.cabBurnt : M.cab[1];
  rBox(W - 0.6, 0.3, z1 - z0, M.chassis, E.cx, 0.75, (z0 + z1) / 2);
  for (const z of [z0 + 0.6, z0 + 1.7, z1 - 1.0]) for (const s of [-1, 1]) rCyl(0.5, 0.5, 0.32, M.tyreT, E.cx + s * (W / 2 - 0.18), 0.5, z, 14, 0, Math.PI / 2);
  rBox(W, 2.3, 2.7, body, E.cx, 1.0 + 1.15, z0 + 1.45);   // (the sleeper and the cab)
  rBox(W + 0.02, 0.6, 0.05, M.cabGlass, E.cx, 2.6, z0 + 2.8); for (const s of [-1, 1]) rBox(0.05, 0.6, 0.9, M.cabGlass, E.cx + s * (W / 2 + 0.01), 2.6, z0 + 2.3);
  rBox(W - 0.3, 0.95, z1 - z0 - 2.8, k ? M.cabBurnt : M.cab[0], E.cx, 1.0 + 0.47, z0 + 2.8 + (z1 - z0 - 2.8) / 2);   // (the bonnet)
  rBox(W - 0.2, 0.9, 0.08, M.chrome, E.cx, 1.47, z1 - 0.02); rBox(W + 0.06, 0.32, 0.25, M.chrome, E.cx, 0.62, z1 - 0.1);   // (the grille, the bumper)
  for (const s of [-1, 1]) { rCyl(0.09, 0.09, 1.6, M.chrome, E.cx + s * (W / 2 - 0.12), 3.0, z0 + 2.95, 8); rCyl(0.28, 0.28, 1.0, M.chrome, E.cx + s * (W / 2 - 0.3), 0.8, z0 + 3.5, 10, Math.PI / 2, 0); }   // (its stacks, its fuel tanks)
  rFootRect(rRectOf(E), E.cx - W / 2, z0, E.cx + W / 2, z1);
}
function rtTruck(i, j) {
  const R = rRect(i, j, RT_KIND(i, j)), E = rExt(R), k = RT_KIND(i, j);
  if (k === 'R' && E.d > 9) {   // (the army's truck with its trailer behind: the truck's 7 m, the rest the trailer)
    const zc = E.z0 + 7, a = Object.assign({}, E, { z1: zc, d: zc - E.z0, cz: (E.z0 + zc) / 2 }), b = Object.assign({}, E, { z0: zc, d: E.z1 - zc, cz: (zc + E.z1) / 2 });
    rtArmyTruck(a); rtTrailer(b); return;
  }
  if (k === 'U') rtBus(E);
  else if (k === 'X') rtTractor(E, E.cx < 0 ? 1 : 0);
  else if (E.d > E.w) rtArmyTruck(E);
  else rtVan(E);
}
// ---- a car's body into its group (gp: the car's own frame, its length along x): the body, the bonnet's crown, the
// glasshouse and its roof and pillars, a pickup's bed, its wheels (a burnt one sat down on its rims), its bumpers, rust
// come through a burnt one's paint (each patch at its own height)
function rtCarModel(gp, L, Wd, body, burnt, pickup) {
  const M = RTM, sink = burnt ? 0.12 : 0, P = m => { gp.add(m); rParts.push(m); return m; };
  const B = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return P(m); };
  const cabL = pickup ? L * 0.3 : L * 0.46, cabX = pickup ? L * 0.12 : -L * 0.04;
  B(L, 0.55, Wd, body, 0, 0.55 - sink, 0); B(L * 0.26, 0.12, Wd - 0.06, body, L * 0.35, 0.86 - sink, 0);
  B(cabL, 0.46, Wd - 0.12, burnt ? M.char : M.glass, cabX, 1.06 - sink, 0); B(cabL - 0.15, 0.06, Wd - 0.16, body, cabX, 1.32 - sink, 0);
  for (const s of [-1, 1]) B(cabL * 0.12, 0.44, 0.06, body, cabX, 1.06 - sink, s * (Wd / 2 - 0.08));
  if (pickup) for (const s of [-1, 1]) B(L * 0.38, 0.22, 0.06, body, -L * 0.28, 0.94 - sink, s * (Wd / 2 - 0.035));
  for (const sx of [-1, 1]) for (const s of [-1, 1]) { const w = P(new THREE.Mesh(new THREE.CylinderGeometry(burnt ? 0.24 : 0.33, burnt ? 0.24 : 0.33, 0.22, 12), burnt ? M.rust : M.tyre)); w.rotation.x = Math.PI / 2; w.position.set(sx * L * 0.32, burnt ? 0.24 : 0.33, s * (Wd / 2 - 0.08)); w.castShadow = true; }
  for (const sx of [-1, 1]) B(0.1, 0.18, Wd + 0.04, burnt ? M.rust : M.char, sx * (L / 2 + 0.03), 0.42 - sink, 0);
  if (burnt) for (let n = 0; n < 3; n++) B(rr(0.3, 0.6), 0.02, rr(0.2, 0.4), M.rust, -L / 3 + n * L / 3 + rr(-0.2, 0.2), 0.832 - sink + n * 0.008, rr(-Wd / 5, Wd / 5));
}
// ---- a wrecked car (its run of c cells): mostly burnt out, a few left as they were, dusted over
function rtCar(i, j) {
  const M = RTM, R = rRect(i, j, 'c'), E = rExt(R), alongX = E.w >= E.d, L = Math.max(E.w, E.d) - 0.25, Wd = Math.min(E.w, E.d) - 0.3;
  const burnt = rand() < 0.65, body = burnt ? (rand() < 0.5 ? M.burnt : M.burntB) : M.cars[Math.floor(rand() * M.cars.length)], a = rr(-0.035, 0.035);
  const g = new THREE.Group(); g.position.set(E.cx, 0, E.cz); g.rotation.y = (alongX ? 0 : Math.PI / 2) + a; rP.add(g);
  rtCarModel(g, L, Wd, body, burnt, rand() < 0.25);
  // (its footprint: the box round it as it's turned, in each of its cells)
  const hx = (alongX ? L : Wd) / 2 + Math.abs(a) * (alongX ? Wd : L) / 2 + 0.06, hz = (alongX ? Wd : L) / 2 + Math.abs(a) * (alongX ? L : Wd) / 2 + 0.06;
  rFootRect(R, E.cx - hx, E.cz - hz, E.cx + hx, E.cz + hz);
}
// ---- the low things: a jersey barrier, sandbags, crates, pallets, the dumpster
function rtJersey(i, j, x, z) {
  const M = RTM, H = RT_H.b;
  if (j - RT_B[1] === 28) {   // (a T-wall of the army's line knocked flat by the pile-up: lying on its face, its foot in the air)
    const s = RT_KIND(i - 1, j) === 'b' ? -1 : 1;
    rBox(1, 0.62, 0.95, (i % 2) ? M.tw : M.twDk, x, 0.31, z + 0.02); rBox(1, 0.42, 0.42, M.twBase, x, 0.62 + 0.21, z - 0.25);
    if (s > 0) rBox(0.03, 0.6, 0.9, M.twSeam, x + 0.5, 0.31, z);
    rFoot(i, j, x - 0.5, z - 0.48, x + 0.5, z + 0.48); return;
  }
  rBox(1, 0.32, 0.62, M.jersey, x, 0.16, z); rBox(1, H - 0.5, 0.4, M.jersey, x, 0.32 + (H - 0.5) / 2, z); rBox(1, 0.18, 0.22, M.jerseyDk, x, H - 0.09, z);
  if ((i + j) % 2) rBox(0.96, 0.05, 0.23, M.jerseyStripe, x, H - 0.02, z);
  rFoot(i, j, x - 0.5, z - 0.32, x + 0.5, z + 0.32);
}
function rtBags(i, j, x, z) {
  const M = RTM, alongZ = RT_KIND(i, j - 1) === 's' || RT_KIND(i, j + 1) === 's';
  for (let r = 0; r < 5; r++) for (let n = 0; n < 3; n++) {
    const o = -0.36 + n * 0.36 + (r % 2 ? 0.18 : 0); if (Math.abs(o) > 0.5) continue;
    const m = rBox(alongZ ? 0.5 : 0.36, 0.2, alongZ ? 0.36 : 0.5, rand() < 0.3 ? M.bagDk : M.bag, x + (alongZ ? rr(-0.03, 0.03) : o), 0.1 + r * 0.21, z + (alongZ ? o : rr(-0.03, 0.03)));
    m.rotation.y = rr(-0.08, 0.08);
  }
  rFoot(i, j, alongZ ? x - 0.28 : x - 0.5, alongZ ? z - 0.5 : z - 0.28, alongZ ? x + 0.28 : x + 0.5, alongZ ? z + 0.5 : z + 0.28);
}
function rtCrates(i, j, x, z) {
  const M = RTM, jj = j - RT_B[1];
  if (jj <= RT_STORE.j1) { rBox(0.95, 0.14, 0.95, M.pallet, x, 0.07, z); rBox(0.85, 0.8, 0.85, rand() < 0.5 ? M.wrap : M.box, x, 0.54, z); }   // (in the storeroom: pallets of stock)
  else for (let y = 0; y < 2; y++) { rBox(0.92, 0.48, 0.6, M.crate, x, 0.24 + y * 0.5, z + (y ? 0.05 : -0.05)); rBox(0.94, 0.06, 0.62, M.crateDk, x, 0.4 + y * 0.5, z + (y ? 0.05 : -0.05)); }   // (on the forecourt: the army's ammunition boxes)
  rFoot(i, j, x - 0.48, z - 0.48, x + 0.48, z + 0.48);
}
function rtDumpster(i, j) {
  const M = RTM, R = rRect(i, j, 'd'), E = rExt(R), W = E.w - 0.1;
  rBox(W, 1.0, 0.95, M.dump, E.cx, 0.6, E.cz); const l = rBox(W + 0.04, 0.06, 1.05, M.dumpDk, E.cx, 1.14, E.cz); l.rotation.x = -0.06;
  for (const s of [-1, 1]) rCyl(0.07, 0.07, 0.08, M.tyre, E.cx + s * (W / 2 - 0.15), 0.07, E.cz + 0.3, 8, Math.PI / 2, 0);
  rFootRect(R, E.cx - W / 2, E.cz - 0.5, E.cx + W / 2, E.cz + 0.5);
}

// ---- the ground: one texture over the whole map. The highway's asphalt and its lane lines, skid marks and scorch;
// the forecourt's concrete pad under the canopy, the evac point painted round the flag; the store's tiles, soot over
// them; the side lots' cracked asphalt; the garage's concrete west, the motel's parking bays east
const RT_S = 28;   // (pixels a metre)
function rtFloorTex() {
  const S = RT_S, W = RT_W * S, H = RT_D * S, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seeded(9091);
  const R = (i0, j0, i1, j1, col) => { x.fillStyle = col; x.fillRect(i0 * S, j0 * S, (i1 - i0) * S, (j1 - j0) * S); };
  const speck = (i0, j0, i1, j1, n, cols) => { for (let k = 0; k < n; k++) { x.fillStyle = cols[Math.floor(rnd() * cols.length)]; x.fillRect((i0 + rnd() * (i1 - i0)) * S, (j0 + rnd() * (j1 - j0)) * S, 1 + rnd() * 2.5, 1 + rnd() * 2.5); } };
  const blot = (cx, cz, r, col, sq) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r * S); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); x.save(); x.translate(cx * S, cz * S); x.scale(1, sq || 1); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * S, 0, 7); x.fill(); x.restore(); };
  const line = (a, b, c2, d, col, w, dash) => { x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash || []); x.beginPath(); x.moveTo(a * S, b * S); x.lineTo(c2 * S, d * S); x.stroke(); x.setLineDash([]); };
  // asphalt everywhere first
  R(0, 0, RT_W, RT_D, '#47484a'); speck(0, 0, RT_W, RT_D, 26000, ['rgba(30,30,30,0.5)', 'rgba(110,108,102,0.45)', 'rgba(80,80,78,0.5)']);
  // the highway: darker, worn; its lines (north edge yellow by the blast walls, the westbound's dashes, white along
  // the median, the eastbound's)
  const r0 = RT_ROAD.j0, r1 = RT_ROAD.j1 + 1, md = RT_ROAD.med;
  R(1, r0, RT_W - 1, r1, 'rgba(36,37,39,0.7)');
  for (let k = 0; k < 40; k++) blot(1 + rnd() * (RT_W - 2), r0 + rnd() * 10, 0.6 + rnd() * 2, 'rgba(20,20,20,0.25)', 0.4);
  // (each carriageway: a metre of shoulder outside its white edge line, rumble strips cut into it, two lanes split by
  // dashes, the yellow line on the median's side; the same as the highway's run outside the fence: rtOutside)
  for (const [a, b] of RT_LANES) {
    line(1, a, RT_W - 1, a, a < md ? 'rgba(226,224,212,0.8)' : 'rgba(214,176,58,0.85)', 5); line(1, b, RT_W - 1, b, a < md ? 'rgba(214,176,58,0.85)' : 'rgba(226,224,212,0.8)', 5);
    line(1, (a + b) / 2, RT_W - 1, (a + b) / 2, 'rgba(226,224,212,0.7)', 5, [3 * S, 5 * S]);
    const sh = a < md ? a - 0.55 : b + 0.55; for (let i = 1.2; i < RT_W - 1; i += 0.35) line(i, sh - 0.2, i, sh + 0.2, 'rgba(20,20,20,0.35)', 3);
  }
  for (const i of [9.5, RT_W - 9.5]) { x.strokeStyle = 'rgba(30,30,30,0.8)'; x.lineWidth = 4; x.beginPath(); x.arc(i * S, 36.6 * S, 0.35 * S, 0, 7); x.stroke(); }   // (manholes)
  // (the pile-up's marks: skids swerving into it, scorch round the burnt-out wrecks, the tankers' spill)
  x.lineCap = 'round';
  for (let k = 0; k < 10; k++) { const z0 = r0 + 1 + rnd() * 8, sx = rnd() < 0.5 ? 1 : RT_W - 1, ex = RT_W / 2 + (sx < 5 ? -4 : 4) + (rnd() - 0.5) * 6; for (const o of [0, 0.55]) { x.strokeStyle = 'rgba(18,18,18,0.35)'; x.lineWidth = 0.22 * S; x.beginPath(); x.moveTo(sx * S, (z0 + o) * S); x.bezierCurveTo((sx + ex) / 2 * S, (z0 + o) * S, (sx + ex) / 2 * S, (z0 + o + (rnd() - 0.5) * 3) * S, ex * S, (z0 + o + (rnd() - 0.5) * 4) * S); x.stroke(); } }
  for (const [ii, jj] of [[20.5, 33.5], [3.5, 31.5], [37.5, 31.5], [9.5, 31.5], [31.5, 31.5], [16.5, 37.5], [24.5, 37.5], [10, 37], [31, 37]]) blot(ii + 0.5, jj + 0.5, 2.6 + rnd(), 'rgba(12,10,9,0.55)', 0.7);
  blot(RT_W / 2, 30, 6, 'rgba(26,30,34,0.5)', 0.35);   // (the fuel spilled from the tankers, long since dried dark)
  speck(1, r0, RT_W - 1, r1, 1500, ['rgba(190,200,205,0.55)', 'rgba(150,160,166,0.5)']);   // (glass)
  // the forecourt: the canopy's concrete pad, its joints, oil under the pumps, arrows, the evac point round the flag
  const C = RT_CANOPY;
  R(C.i0, C.j0, C.i1 + 1, C.j1 + 1, '#8a877f'); speck(C.i0, C.j0, C.i1 + 1, C.j1 + 1, 6000, ['rgba(60,58,54,0.4)', 'rgba(160,156,148,0.4)']);
  x.strokeStyle = 'rgba(52,50,46,0.55)'; x.lineWidth = 2; for (let i = C.i0; i <= C.i1 + 1; i += 4) line(i, C.j0, i, C.j1 + 1, 'rgba(52,50,46,0.5)', 2); for (let j = C.j0; j <= C.j1 + 1; j += 4) line(C.i0, j, C.i1 + 1, j, 'rgba(52,50,46,0.5)', 2);
  for (const [ii, jj] of [[13.5, 13], [13.5, 26], [28.5, 13], [28.5, 26]]) blot(ii, jj, 1.6, 'rgba(24,22,20,0.45)', 0.6);
  x.strokeStyle = 'rgba(232,228,214,0.8)'; x.lineWidth = 0.35 * S; x.beginPath(); x.arc(RT_W / 2 * S, RT_D / 2 * S, 5.2 * S, 0, 7); x.stroke();   // (the evac point's ring)
  x.lineWidth = 0.12 * S; x.beginPath(); x.arc(RT_W / 2 * S, RT_D / 2 * S, 5.9 * S, 0, 7); x.stroke();
  x.save(); x.translate(RT_W / 2 * S, (RT_D / 2 - 6.6) * S); x.fillStyle = 'rgba(232,228,214,0.75)'; x.font = `800 ${Math.round(1.3 * S)}px "Saira Extra Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EVAC  POINT  9', 0, 0); x.restore();
  x.save(); x.translate(RT_W / 2 * S, (RT_D / 2 + 6.6) * S); x.rotate(Math.PI); x.fillStyle = 'rgba(232,228,214,0.75)'; x.font = `800 ${Math.round(1.3 * S)}px "Saira Extra Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EVAC  POINT  9', 0, 0); x.restore();
  for (const [ii, jj, d] of [[9.5, 12.8, 1], [32.5, 26.2, -1]]) { x.save(); x.translate(ii * S, jj * S); x.scale(d, 1); x.fillStyle = 'rgba(232,228,214,0.55)'; x.beginPath(); x.moveTo(0, -0.25 * S); x.lineTo(1.6 * S, -0.25 * S); x.lineTo(1.6 * S, -0.6 * S); x.lineTo(2.4 * S, 0); x.lineTo(1.6 * S, 0.6 * S); x.lineTo(1.6 * S, 0.25 * S); x.lineTo(0, 0.25 * S); x.fill(); x.restore(); }
  // the sidewalk along the store's front, its kerb painted; the drains; the fuel tanks' fill points; the slip roads'
  // arrows out onto the highway; the fire lane along the store's side walls
  R(RT_STORE.i0, RT_STORE.j1 + 1, RT_STORE.i1 + 1, RT_STORE.j1 + 2, '#9a968c'); speck(RT_STORE.i0, RT_STORE.j1 + 1, RT_STORE.i1 + 1, RT_STORE.j1 + 2, 1500, ['rgba(70,68,62,0.4)']);
  for (let i = RT_STORE.i0; i < RT_STORE.i1 + 1; i += 1.5) line(i, RT_STORE.j1 + 1, i, RT_STORE.j1 + 2, 'rgba(60,58,54,0.45)', 2);
  line(RT_STORE.i0, RT_STORE.j1 + 1.96, RT_STORE.i1 + 1, RT_STORE.j1 + 1.96, 'rgba(214,176,58,0.85)', 4);
  const grate = (i, j) => { R(i - 0.35, j - 0.25, i + 0.35, j + 0.25, 'rgba(26,26,26,0.85)'); for (let k = -0.28; k <= 0.28; k += 0.08) line(i + k, j - 0.22, i + k, j + 0.22, 'rgba(110,110,106,0.8)', 1.5); };
  for (const [i, j] of [[11.5, 27.5], [RT_W - 11.5, 27.5], [16.5, 12.2], [RT_W - 16.5, 12.2], [4, 21], [RT_W - 4, 21], [4, 6.5], [RT_W - 4, 6.5]]) grate(i, j);
  for (const i of [8.8, 9.6, 10.4, RT_W - 8.8, RT_W - 9.6, RT_W - 10.4]) { x.fillStyle = 'rgba(40,40,40,0.9)'; x.beginPath(); x.arc(i * S, 13.6 * S, 0.24 * S, 0, 7); x.fill(); x.fillStyle = ['#c8a020', '#2a5ea8', '#b02a20'][Math.round(i * 10) % 3]; x.beginPath(); x.arc(i * S, 13.6 * S, 0.17 * S, 0, 7); x.fill(); }
  for (const i of [13, RT_W - 13]) { x.save(); x.translate(i * S, 26.2 * S); x.rotate(Math.PI / 2); x.fillStyle = 'rgba(232,228,214,0.6)'; x.beginPath(); x.moveTo(-0.8 * S, -0.15 * S); x.lineTo(0.2 * S, -0.15 * S); x.lineTo(0.2 * S, -0.4 * S); x.lineTo(0.8 * S, 0); x.lineTo(0.2 * S, 0.4 * S); x.lineTo(0.2 * S, 0.15 * S); x.lineTo(-0.8 * S, 0.15 * S); x.fill(); x.restore(); }
  for (const i of [RT_STORE.i0 - 0.12, RT_STORE.i1 + 1.12]) line(i, 1, i, RT_STORE.j1, 'rgba(176,44,34,0.75)', 4);
  // the store: its tiles, soot and ash over them, puddles where the rain gets in
  { const i0 = RT_STORE.i0 + 1, i1 = RT_STORE.i1, j0 = 1, j1 = RT_STORE.j1;
    for (let j = j0; j < j1; j += 0.5) for (let i = i0; i < i1; i += 0.5) R(i, j, i + 0.5, j + 0.5, ((i * 2 + j * 2) % 2) ? '#a9a291' : '#827c6e');
    for (let k = 0; k < 40; k++) blot(i0 + rnd() * (i1 - i0), j0 + rnd() * (j1 - j0), 1 + rnd() * 3, 'rgba(18,15,12,0.5)', 0.5 + rnd() * 0.8);
    speck(i0, j0, i1, j1, 5000, ['rgba(30,26,22,0.6)', 'rgba(120,112,100,0.5)', 'rgba(160,150,130,0.4)']);
    for (let k = 0; k < 6; k++) blot(i0 + 1 + rnd() * (i1 - i0 - 2), j0 + 1 + rnd() * (j1 - j0 - 2), 0.6 + rnd() * 0.8, 'rgba(58,66,72,0.55)', 0.6); }
  // the side lots: lighter, cracked, weeds along their walls, their bays
  for (const [i0, i1] of [[1, 11], [RT_W - 11, RT_W - 1]]) {
    R(i0, 1, i1, 11, 'rgba(96,96,94,0.35)');
    for (let k = 0; k < 18; k++) { x.strokeStyle = 'rgba(24,24,22,0.45)'; x.lineWidth = 1.4; x.beginPath(); let a = (i0 + rnd() * (i1 - i0)) * S, b = (1 + rnd() * 10) * S; x.moveTo(a, b); for (let q = 0; q < 7; q++) { a += (rnd() - 0.5) * 30; b += (rnd() - 0.5) * 30; x.lineTo(a, b); } x.stroke(); }
    speck(i0, 1, i1, 1.6, 300, ['rgba(80,96,52,0.7)', 'rgba(110,112,60,0.6)']);
    for (let j = 6; j <= 10; j += 2.5) line(i0 + 0.3, j, i0 + 3.2, j, 'rgba(220,218,206,0.45)', 3);
  }
  // the spawn lots: the garage's concrete (oil, the car wash's bay and its drain), the motel's parking bays
  R(1, 12, 7, 28, '#7f7c75'); speck(1, 12, 7, 28, 3000, ['rgba(50,48,44,0.4)', 'rgba(150,146,138,0.4)']);
  for (let k = 0; k < 8; k++) blot(1.5 + rnd() * 5, 12.5 + rnd() * 15, 0.6 + rnd() * 1.2, 'rgba(22,20,18,0.45)', 0.6);
  x.strokeStyle = 'rgba(214,174,52,0.6)'; x.lineWidth = 4; x.strokeRect(1.3 * S, 16.2 * S, 4.4 * S, 7.6 * S); grate(3.5, 20);
  for (const [a, b] of RT_BAYS) { const j = (a + b + 1) / 2; x.save(); x.translate(4.2 * S, j * S); x.scale(-1, 1); x.fillStyle = 'rgba(232,228,214,0.4)'; x.beginPath(); x.moveTo(-1 * S, -0.15 * S); x.lineTo(0.3 * S, -0.15 * S); x.lineTo(0.3 * S, -0.45 * S); x.lineTo(1 * S, 0); x.lineTo(0.3 * S, 0.45 * S); x.lineTo(0.3 * S, 0.15 * S); x.lineTo(-1 * S, 0.15 * S); x.fill(); x.restore(); }   // (into the bays)
  for (let j = 13; j <= 27; j += 2.6) line(RT_W - 1, j, RT_W - 5.2, j, 'rgba(220,218,206,0.55)', 3);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// ---- outside the fence: fields to the horizon, the highway running on off both ends (the army's roadblock across it
// west, barriers east), the garage behind its lot and the motel behind its car park, the services' billboard, the
// woods. On the camera's sides (south and east) only what's low near in, so nothing stands between it and the map
const RT_X = 21, RT_Z = 20;   // (the map's half-extents, metres)
function rtOutside(g) {
  const M = RTM;
  const grass = rtTex(256, 256, (x, w, h) => { x.fillStyle = '#5f5c3c'; x.fillRect(0, 0, w, h); const r = seeded(31); for (let k = 0; k < 5000; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '44,46,26' : '128,118,74'},${0.12 + r() * 0.25})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); } }, [40, 40]);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), lam(0xffffff, { map: grass })); gr.rotation.x = -Math.PI / 2; gr.position.y = -0.07; gr.receiveShadow = true; g.add(gr);
  // the services' apron round the fence: a strip of asphalt
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(RT_X * 2 + 12, RT_Z * 2 + 8), lam(0x3f4042)); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.035; apron.receiveShadow = true; g.add(apron);
  // the highway on off both ends: its asphalt and lines, the median's barriers
  const zr0 = cxw(RT_B[1] + RT_ROAD.j0) - 0.5, zr1 = cxw(RT_B[1] + RT_ROAD.j1) + 0.5, zm = cxw(RT_B[1] + RT_ROAD.med);
  const road = rtTex(256, 256, (x, w, h) => {
    x.fillStyle = '#2f3032'; x.fillRect(0, 0, w, h); const r = seeded(17); for (let k = 0; k < 4000; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '20,20,20' : '90,90,88'},${0.2 + r() * 0.3})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    const zz = z => (z - zr0) / (zr1 - zr0) * h, ln = (z, col, dash) => { x.strokeStyle = col; x.lineWidth = 3; x.setLineDash(dash || []); x.beginPath(); x.moveTo(0, zz(z)); x.lineTo(w, zz(z)); x.stroke(); x.setLineDash([]); };
    for (const [a, b] of RT_LANES) { const za = RZ(a) - 0.5, zb = RZ(b) - 0.5, md = a < RT_ROAD.med; ln(za, md ? 'rgba(226,224,212,0.8)' : 'rgba(214,176,58,0.85)'); ln(zb, md ? 'rgba(214,176,58,0.85)' : 'rgba(226,224,212,0.8)'); ln((za + zb) / 2, 'rgba(226,224,212,0.7)', [w * 3 / 32, w * 5 / 32]); }
  }, [12, 1]);
  for (const s of [-1, 1]) {
    const L = 140, m = new THREE.Mesh(new THREE.PlaneGeometry(L, zr1 - zr0), lam(0xffffff, { map: road })); m.rotation.x = -Math.PI / 2; m.position.set(s * (RT_X + L / 2), -0.012, (zr0 + zr1) / 2); m.receiveShadow = true; g.add(m);
    for (let x = RT_X + 0.5; x < RT_X + 60; x += 1) { const xx = s * x; rBox(1, 0.32, 0.62, M.jersey, xx, 0.16, zm); rBox(1, 0.5, 0.4, M.jersey, xx, 0.57, zm); rBox(1, 0.18, 0.22, M.jerseyDk, xx, 0.91, zm); }
    const g0 = s < 0 ? RT_X + 5.5 : RT_X, gl = RT_X + 60 - g0, gx = s * (g0 + gl / 2);   // (the guardrail along both edges)
    for (const [z, f] of [[zr0 - 0.08, 1], [zr1 + 0.08, -1]]) { rBox(gl, 0.34, 0.07, M.rail, gx, 0.6, z); rBox(gl, 0.06, 0.09, M.railDk, gx, 0.6, z); for (let x = g0 + 1; x < g0 + gl; x += 2) rBox(0.1, 0.78, 0.12, M.railDk, s * x, 0.39, z - f * 0.12); }
  }
  // the jam on beyond the fence, both ways: wrecks nose to tail
  for (const s of [-1, 1]) for (let n = 0; n < 9; n++) {
    const x = s * (RT_X + 4 + n * 5.5 + rr(-1, 1)), z = (n % 2 ? zr0 + 2.3 : zm + 2.2) + rr(-0.5, 0.5), burnt = rand() < 0.5, mat = burnt ? M.burnt : M.cars[n % M.cars.length], a = rr(-0.25, 0.25);
    const b = rBox(4.0, 0.55, 1.7, mat, x, 0.5, z); b.rotation.y = a; const t = rBox(1.9, 0.45, 1.5, burnt ? M.char : M.glass, x - 0.1, 1.0, z); t.rotation.y = a;
  }
  // the army's roadblock across the highway west: containers two high behind the T-walls, razor wire on them
  { const x = -RT_X - 3.5, cols = [rtTall(0x5d6643), rtTall(0x8a3b2a), rtTall(0x355a78)];
    for (let n = 0; n < 2; n++) for (let y = 0; y < 2 - (n === 1 ? 1 : 0); y++) rBox(2.4, 2.55, 6, cols[(n + y) % 3], x, 1.3 + y * 2.6, zr0 + 2.6 + n * 6.1); }
  // the garage behind the west lot: its shell round the two bays (rtGarageBays), the office between them, the roof over
  // it all with the sign stood on it
  { const zA = RZ(11) - 0.5, zB = RZ(28) + 0.5, x0 = -RT_X - 10, x1 = -RT_X, xb = x1 - 9.7, bk = (za, zb) => rBox(x1 - xb, 4.2, zb - za, M.garage, (xb + x1) / 2, 2.1, (za + zb) / 2);
    rBox(xb - x0, 4.2, zB - zA, M.garageDk, (x0 + xb) / 2, 2.1, (zA + zB) / 2);
    bk(zA, RZ(RT_BAYS[0][0]) - 0.5); bk(RZ(RT_BAYS[0][1]) + 0.5, RZ(RT_BAYS[1][0]) - 0.5); bk(RZ(RT_BAYS[1][1]) + 0.5, zB);
    rBox(x1 - x0 + 1.2, 0.25, zB - zA + 0.6, M.garageDk, (x0 + x1) / 2 + 0.6, 4.325, (zA + zB) / 2);
    rtSign(g, 'GARAGE  ·  CAR WASH', 7, 1.1, '#efe8d6', '#a8362a', x1 + 0.6, 5.1, (zA + zB) / 2, Math.PI / 2, true);
    for (const z of [-3.8, 3.8]) rBox(0.1, 0.7, 0.1, M.pole, x1 + 0.55, 4.8, z); }
  // the motel behind the east car park: two storeys of rooms, their doors and windows and numbers, the walkway along
  // the upper floor with its railing, the stair up at the north end, the ice machine and the soda machine under it.
  // Low enough and far enough back that nothing of the car park's hidden from above; its sign on its pole north
  { const x0 = RT_X + 9, x1 = RT_X + 18, zA = -12, zB = 12, H1 = 3.0, H2 = 6.0, bx = x0 - 1.6, trim = rtTall(0x6a4a3a), door = rtTall(0x3d5a6b), frm = rtTall(0x3a3530);
    rBox(x1 - x0, H2, zB - zA, rtTall(0xc9b79a), (x0 + x1) / 2, H2 / 2, (zA + zB) / 2);
    rBox(x0 - bx, 0.2, zB - zA, trim, (bx + x0) / 2, H1 + 0.05, (zA + zB) / 2);
    rBox(x1 - bx + 0.4, 0.25, zB - zA + 0.6, rtTall(0x55504a), (bx + x1) / 2, H2 + 0.125, (zA + zB) / 2);
    rBox(x1 - bx + 0.44, 0.1, zB - zA + 0.64, rtTall(0x8a7a62), (bx + x1) / 2, H2 + 0.05, (zA + zB) / 2);   // (the roof's edge trim)
    for (const z of [-7, 0, 7]) rBox(1.2, 0.7, 1.0, M.railDk, x1 - 2.5, H2 + 0.6, z);   // (its air handlers)
    for (let z = zA + 0.1; z <= zB - 0.05; z += 3) { rBox(0.12, H1 - 0.05, 0.12, trim, bx + 0.08, (H1 - 0.05) / 2, z); rBox(0.12, H2 - H1 - 0.15, 0.12, trim, bx + 0.08, H1 + 0.15 + (H2 - H1 - 0.15) / 2, z); }
    for (const y of [H1 + 0.6, H1 + 1.05]) rBox(0.06, 0.06, zB - zA, trim, bx + 0.05, y, (zA + zB) / 2);
    for (let z = zA + 0.35; z < zB; z += 0.5) rBox(0.03, 0.9, 0.03, trim, bx + 0.05, H1 + 0.6, z);
    for (let f = 0; f < 2; f++) for (let k = 0; k < 7; k++) {
      const z = zA + 1.9 + k * 3.2, y0 = f ? H1 + 0.15 : 0;
      rBox(0.06, 2.1, 0.95, door, x0 - 0.03, y0 + 1.05, z); rtSign(g, `${f + 1}0${k + 1}`, 0.36, 0.16, '#d8c89a', '#2a2a2a', x0 - 0.006, y0 + 2.3, z, -Math.PI / 2);
      rBox(0.05, 1.1, 1.3, frm, x0 - 0.025, y0 + 1.5, z + 1.0); rBox(0.05, 1.0, 1.2, M.glass, x0 - 0.045, y0 + 1.5, z + 1.0);
      if (!f) rBox(0.5, 0.4, 0.7, M.railDk, x0 - 0.25, 0.5, z + 1.0);   // (an air conditioner under the window)
    }
    for (let k = 0; k < 12; k++) rBox(x0 - bx, (k + 1) * 0.2625, 0.3, trim, (bx + x0) / 2, (k + 1) * 0.13125, zA - 3.45 + k * 0.3);   // (the stair up to the walkway)
    const sr = rBox(0.05, 0.05, 4.8, trim, bx + 0.03, 2.6, zA - 1.8); sr.rotation.x = -Math.atan2(3.15, 3.6);
    rBox(0.8, 1.75, 0.8, lam(0xd8dcde), x0 - 0.45, 0.875, zA + 0.5); rtSign(g, 'ICE', 0.6, 0.25, '#2c6a9a', '#e9f2f6', x0 - 0.856, 1.45, zA + 0.5, -Math.PI / 2);
    rBox(0.8, 1.8, 0.8, lam(0xa8302a), x0 - 0.45, 0.9, zB - 0.6); rtSign(g, 'COLD DRINKS', 0.6, 0.2, '#efe8d6', '#a8302a', x0 - 0.856, 1.5, zB - 0.6, -Math.PI / 2);
    rCyl(0.2, 0.25, 9, M.pole, x1 - 2, 4.5, zA - 5, 10); rtSign(g, 'MOTEL', 4.2, 1.6, '#f2e6c8', '#2f6060', x1 - 2, 9.2, zA - 4.68, 0, true); rtSign(g, 'NO VACANCY', 3.2, 0.6, '#a8362a', '#efe6d0', x1 - 2, 8.05, zA - 4.68, 0, true); }
  // the highway's signs, west where they stand over the road out of town: a gantry over both carriageways, the exit
  // sign for the services
  { const x = -RT_X - 19, za = zr0 - 1.4, zb = zr1 + 1.4;
    for (const z of [za, zb]) rBox(0.35, 7.4, 0.35, M.pole, x, 3.7, z); rBox(0.5, 0.5, zb - za + 0.4, M.pole, x, 7.1, (za + zb) / 2);
    rtSign(g, 'I-9  NORTH', 5, 1.5, '#1f5a3a', '#f2f2ea', x + 0.3, 6.0, RZ(31.5) - 0.5, Math.PI / 2, true); rtSign(g, 'EVACUATION  ROUTE', 5, 1.5, '#1f4a7a', '#f2f2ea', x + 0.3, 6.0, RZ(36.5) - 0.5, Math.PI / 2, true);
    for (const z of [zr0 - 1.0, zr0 - 3.2]) rBox(0.12, 2.6, 0.12, M.pole, -RT_X - 7, 1.3, z);
    rtSign(g, 'EXIT 9  ·  TRAVEL STOP  ·  FUEL', 2.8, 0.9, '#1f5a3a', '#f2f2ea', -RT_X - 6.9, 2.3, zr0 - 2.1, Math.PI / 2, true); }
  // the services' billboard, north-west, over the fields
  { const x = -12, z = -RT_Z - 16; for (const o of [-3.5, 3.5]) rCyl(0.18, 0.22, 8, M.pole, x + o, 4, z, 10); rBox(11, 0.2, 0.6, M.pole, x, 5.0, z + 0.2);
    rtSign(g, 'ROUTE 9 TRAVEL STOP  —  EAT · FUEL · REST  —  NEXT EXIT', 11, 3, '#a8302a', '#efe8d6', x, 6.7, z + 0.45, 0, true, 'EVACUATE NORTH'); }
  // a row of power poles along the services' back road, north
  for (let x = -60; x <= 60; x += 15) { rCyl(0.13, 0.17, 9, rtTall(0x5a4a3a), x, 4.5, -RT_Z - 8, 8); rBox(2.2, 0.14, 0.14, rtTall(0x5a4a3a), x, 8.4, -RT_Z - 8); }
  rtWoods(g);
}
// a sign (text, w x h metres, its colours, where, which way it faces), painted as a made thing (world/sign-art.js): on
// a board of its own colour bg (board: stood off the face on its own backing), or with no board (bg null) as kind says:
// 'letters' painted on the wall, 'stencil' sprayed through a stencil, 'spray' sprayed by hand; scrawl: a line sprayed
// over a board afterwards
function rtSign(g, text, w, h, bg, fg, x, y, z, ry, board, scrawl, kind = 'spray') {
  const W = 1024, H = Math.max(48, Math.round(1024 * h / w));
  const t = liveTex(W, H, (c, W2, H2) => {
    if (bg) paintSign(c, W2, H2, { text, bg, fg, face: 'shop', under: board ? '#5a4a3c' : '#8a8478', wear: 0.6, screws: !!board });
    else if (kind === 'letters') paintLetters(c, W2, H2, { text, fg, face: 'shop' });
    else if (kind === 'stencil') paintStencil(c, W2, H2, { text, col: fg });
    else paintSpray(c, W2, H2, { text, col: fg });
    if (scrawl) { const o = document.createElement('canvas'); o.width = W2; o.height = Math.round(H2 * 0.55); paintSpray(o.getContext('2d'), o.width, o.height, { text: scrawl, col: '#1a1816', tilt: -0.05 }); c.drawImage(o, 0, H2 * 0.3); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), rDecal(rtTall(0xffffff, { map: t, transparent: !bg, alphaTest: bg ? 0 : 0.08 }))); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  if (board) { const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), RTM.pole); b.position.set(x - Math.sin(ry) * 0.05, y, z - Math.cos(ry) * 0.05); b.rotation.y = ry; b.castShadow = true; g.add(b); }
  return m;
}
// one painted straight onto a face of the map (no board), made as the map's built
const rtDecalSign = (text, w, h, bg, fg, x, y, z, ry) => rtSign(rP, text, w, h, bg, fg, x, y, z, ry, false);
// the warnings on the fence and the walls: the army's, and what people left. Each fits inside the face it's on (between
// the fence's lamp poles, within its run of wall), never over an edge or round a corner
function rtSigns(g) {
  const zS = RT_Z - 0.48, xE = RT_X - 0.48;
  for (const x of [-16.5, 16.5]) rtSign(g, 'QUARANTINE ZONE  ·  KEEP OUT', 2.6, 0.55, '#efe8d6', '#a8302a', x, 1.75, zS + 0.02, Math.PI, true);
  for (const x of [-6.25, 6.25]) rtSign(g, 'WARNING  ·  LETHAL FORCE AUTHORIZED', 2.6, 0.5, '#c9a43a', '#1c1c1c', x, 1.75, zS + 0.02, Math.PI, true);
  rtSign(g, 'SPEED LIMIT 55', 0.6, 0.75, '#f2f2ea', '#1c1c1c', -9.5, 1.6, zS + 0.02, Math.PI, true);
  rtSign(g, 'RESTRICTED  ·  MILITARY AREA', 2.4, 0.5, '#efe8d6', '#a8302a', xE + 0.02, 1.75, -14, -Math.PI / 2, true);
  rtSign(g, 'MOTEL GUESTS ONLY', 2.0, 0.5, '#2f6060', '#f2e6c8', xE + 0.02, 1.75, 14, -Math.PI / 2, true);
  // on the blast walls along the highway, facing it: the checkpoint's stencils, each on its own run of panels
  const zW = RZ(28) + 0.31 + 0.006;
  // (the name once, in the middle of the long run between the jersey barriers; never out over the barriers either side
  // of it, which stand well below where it's painted)
  rtSign(g, 'CHECKPOINT 9', 2.6, 0.7, null, '#e8e2d2', 0, 1.6, zW, 0, false, null, 'stencil');
  for (const s of [-1, 1]) rtSign(g, 'STOP · SHOW PAPERS', 1.9, 0.4, null, '#c83c2c', s * 10.5, 1.3, zW, 0, false, null, 'stencil');
  // the store's name along its front's parapet; sprayed on the plywood over its windows; on its side wall
  rtSign(g, 'ROUTE 9 MART', 9, 0.6, null, '#a8302a', 0, RT_SH + 0.45, RZ(RT_STORE.j1) + 0.506, 0, false, null, 'letters');
  const zF = RZ(RT_STORE.j1) + 0.296;
  rtSign(g, 'NO FUEL', 1.8, 0.6, null, '#161616', -4.2, 1.55, zF, 0);
  rtSign(g, 'EVAC → NORTH', 2.4, 0.55, null, '#161616', 3.8, 1.55, zF, 0);
  rtSign(g, 'DEAD INSIDE', 1.8, 0.55, null, '#b0281e', RX(RT_STORE.i0) - 0.506, 1.6, (RZ(4) + RZ(5)) / 2, -Math.PI / 2);
  // the garage's: over each bay on its fascia, over the office door
  const xG = RX(0) + 0.526;
  rtSign(g, 'SERVICE', 2.8, 0.34, '#3a4a50', '#efe8d6', xG, 3.95, (RZ(RT_BAYS[0][0]) + RZ(RT_BAYS[0][1])) / 2, Math.PI / 2);
  rtSign(g, 'CAR WASH', 2.8, 0.34, '#3a4a50', '#efe8d6', xG, 3.95, (RZ(RT_BAYS[1][0]) + RZ(RT_BAYS[1][1])) / 2, Math.PI / 2);
  rtSign(g, 'OFFICE', 0.9, 0.25, '#efe8d6', '#3a4a50', RX(0) + 0.506, 2.45, 1.0, Math.PI / 2);
}
// the garage's office between the bays: its window (frame, glass, blinds drawn) and its door
function rtOffice() {
  const M = RTM, xf = RX(0) + 0.5, zw = -1.15, fr = M.railDk;
  rBox(0.06, 1.2, 1.7, M.glass, xf + 0.03, 1.6, zw);
  for (const [w, h, y, z] of [[0.08, 0.06, 2.23, zw], [0.08, 0.06, 0.97, zw]]) rBox(w, h, 1.8, fr, xf + 0.04, y, z);
  for (const z of [zw - 0.87, zw + 0.87]) rBox(0.08, 1.32, 0.06, fr, xf + 0.04, 1.6, z);
  for (let y = 1.1; y < 2.2; y += 0.12) rBox(0.02, 0.05, 1.66, lam(0xd8d2c0), xf + 0.065, y, zw);   // (the blinds)
  rBox(0.06, 2.1, 0.9, M.steel, xf + 0.03, 1.05, 1.0); rBox(0.05, 0.05, 0.14, M.railDk, xf + 0.085, 1.0, 0.68);
}
// the chain-link over the low walls on the camera's sides (south and east): posts every two metres, a rail on top, the
// mesh between, a coil of razor wire along the top
function rtFence(g) {
  const M = RTM, t = rtMeshTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const top = 3.0, x0 = -RT_X + 0.5, x1 = RT_X - 0.5, zS = RT_Z - 0.5;
  // (south, behind the highway's guardrail: from its footing; east, over the car park's low wall)
  [[x0, zS, x1, zS, 0.14], [x1, -RT_Z + 0.5, x1, zS, 1.13]].forEach(([ax, az, bx, bz, lowH]) => {
    const h = top - lowH, L = Math.hypot(bx - ax, bz - az), m = lam(0xffffff, { map: t.clone(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.map.repeat.set(L * 3, h * 3); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, h), m); p.position.set((ax + bx) / 2, lowH + h / 2, (az + bz) / 2); p.rotation.y = az === bz ? 0 : Math.PI / 2; p.castShadow = true; g.add(p);
    for (let s = 0; s <= L + 0.01; s += 2) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L; rCyl(0.035, 0.035, h + 0.1, M.pole, px, lowH + h / 2, pz, 8); }
    rBox(az === bz ? L : 0.05, 0.05, az === bz ? 0.05 : L, M.pole, (ax + bx) / 2, top, (az + bz) / 2);
    for (let s = 0.3; s < L; s += 0.6) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L, r = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 3, 10), M.pole); r.position.set(px, top + 0.2, pz); r.rotation.y = az === bz ? 0.35 : Math.PI / 2 + 0.35; g.add(r); }
  });
}
// the woods: pines on a ring well out past the fields, none near in on the camera's sides (south and east)
function rtWoods(g) {
  const n = 380, trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.6, 6), cone = new THREE.ConeGeometry(1.6, 4.2, 7), cone2 = new THREE.ConeGeometry(1.15, 3, 7);
  const iT = new THREE.InstancedMesh(trunk, lam(0x4a3a2a), n), iA = new THREE.InstancedMesh(cone, lam(0x2f4a2c), n), iB = new THREE.InstancedMesh(cone2, lam(0x3b5a33), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), rnd = seeded(5150);
  let k = 0;
  for (let t = 0; t < n * 5 && k < n; t++) {
    const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220, far = Math.max(Math.abs(x) - RT_X, Math.abs(z) - RT_Z);
    if (far < 22 || (far < 40 && (z > 0 || x > 0)) || (Math.abs(z - 14) < 9 && Math.abs(x) > RT_X) || rnd() > 0.3 + far / 90) continue;   // (and none on the highway)
    const h = 0.8 + rnd() * 0.8; q.setFromAxisAngle(Y, rnd() * 6.28); s.set(h, h, h);
    iT.setMatrixAt(k, m.compose(p.set(x, 0.8 * h, z), q, s)); iA.setMatrixAt(k, m.compose(p.set(x, 3.5 * h, z), q, s)); iB.setMatrixAt(k, m.compose(p.set(x, 5.2 * h, z), q, s)); k++;
  }
  for (const o of [iT, iA, iB]) { o.count = k; o.castShadow = true; o.receiveShadow = true; o.instanceMatrix.needsUpdate = true; g.add(o); }
}
// ---- the lamps the lights hang from (RT_LAMPS): a caged head on a bracket off its wall, or on a pole up off the fence
// with an arm out over the lot or the road; a flood on a short mast on the sentry posts and the blast walls, tipped
// down onto the highway. Their faces lit and haloed only as the lights come on (rtLampLit)
const RT_HALO = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,236,200,0.9)'); g.addColorStop(0.25, 'rgba(255,220,160,0.35)'); g.addColorStop(1, 'rgba(255,214,150,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
const RT_LAMP_OFF = new THREE.Color(0x4a4c4e), RT_LAMP_ON = new THREE.Color(0xfff1c8), RT_DOWN_OFF = new THREE.Color(0x8a8c8e), RT_DOWN_ON = new THREE.Color(0xf2f6ff);
function rtLampLit() { const k = LAMP_ON.k; RT_HALO.opacity = 0.75 * k; RTM.lampHead.color.copy(RT_LAMP_OFF).lerp(RT_LAMP_ON, k); RTM.downlight.color.copy(RT_DOWN_OFF).lerp(RT_DOWN_ON, k); }
const RT_FLARES = [];
function rtLampKit(g) {
  const M = RTM; RT_FLARES.length = 0;
  for (const [pi, pj, kind, hung] of RT_LAMPS) {
    if (kind === 'c') continue;
    const x = cxw(RT_B[0] + pi), z = cxw(RT_B[1] + pj);
    let hx = x, hz = z, hy = 2.6;
    if (hung === 'n') {   // (back to the first wall north of it: a bracket off its face)
      let jj = Math.floor(pj + 0.5); while (jj > 0 && !'#hW'.includes(RT_PK(Math.floor(pi + 0.5), jj))) jj--;
      const k = RT_PK(Math.floor(pi + 0.5), jj), thin = k === '#' && !(Math.floor(pi + 0.5) >= RT_STORE.i0 && Math.floor(pi + 0.5) <= RT_STORE.i1) || (k === 'W' && jj === 28);
      const face = cxw(RT_B[1] + jj) + (thin ? 0.31 : 0.5), top = k === 'W' && jj !== 28 ? 2.64 : k === 'W' || k === '#' ? 2.8 : jj <= RT_CORE.j1 && pi >= RT_CORE.i0 ? 2.9 : RT_SH;
      if (kind === 'f') { hy = top + 0.95; rCyl(0.05, 0.06, 1.0, M.pole, x, top + 0.5, face - 0.1, 8); rBox(0.1, 0.1, z - face + 0.1, M.pole, x, hy - 0.05, (face + z) / 2 - 0.05); }
      else { hy = top - 0.25; rBox(0.08, 0.08, z - face, M.pole, x, hy + 0.12, (face + z) / 2); rBox(0.16, 0.24, 0.05, M.pole, x, hy + 0.1, face + 0.025); }
    } else if (hung === 'w') { const face = cxw(RT_B[0]) + 0.5; hy = 3.3; rBox(hx - face, 0.08, 0.08, M.pole, (face + hx) / 2, hy + 0.12, hz); }
    else {   // (a pole up off the fence's low wall, its arm out to the head)
      const px = hung === 'e' ? cxw(RT_B[2]) : x, pz = hung === 's' ? cxw(RT_B[3]) : z; hy = 4.6;
      rCyl(0.07, 0.1, hy + 0.3, M.pole, px, (hy + 0.3) / 2, pz, 8); rBox(Math.abs(px - hx) + 0.1, 0.08, Math.abs(pz - hz) + 0.1, M.pole, (px + hx) / 2, hy + 0.2, (pz + hz) / 2);
    }
    const hd = new THREE.Group(); hd.position.set(hx, hy, hz); g.add(hd);
    if (kind === 'f') { hd.rotation.x = 0.55; box(hd, 0.5, 0.32, 0.2, M.pole, 0, 0, 0); const f = box(hd, 0.44, 0.26, 0.02, M.lampHead, 0, 0, 0.11); f.layers.enable(GLOW_LAYER); }
    else { box(hd, 0.46, 0.12, 0.3, M.pole, 0, 0.04, 0); const f = box(hd, 0.38, 0.02, 0.22, M.lampHead, 0, -0.03, 0); f.layers.enable(GLOW_LAYER); }
    const halo = new THREE.Sprite(RT_HALO); halo.scale.setScalar(kind === 'f' ? 1.5 : 1.1); halo.onBeforeRender = rtLampLit; halo.position.set(0, kind === 'f' ? 0 : -0.08, kind === 'f' ? 0.14 : 0); halo.layers.enable(GLOW_LAYER); halo.userData.isFlash = true; hd.add(halo);
    if (kind === 'f') { hd.updateMatrixWorld(true); const fw = new THREE.Vector3(0, 0, 1).transformDirection(hd.matrixWorld), fp = new THREE.Vector3(0, 0, 0.12).applyMatrix4(hd.matrixWorld); RT_FLARES.push({ x: fp.x, y: fp.y, z: fp.z, dx: fw.x, dy: fw.y, dz: fw.z, col: [1, 0.88, 0.7] }); }
  }
}
// the whole map, into its group (g): its pieces (to be folded into a few meshes) back
function rtBuild(g) {
  rtMats(); rP = g; rParts = []; rDid = new Set(); rtCoolCap = false; RT_BOX.list.length = 0;
  const x0 = cxw(RT_B[0]) - 0.5, x1 = cxw(RT_B[2]) + 0.5, z0 = cxw(RT_B[1]) - 0.5, z1 = cxw(RT_B[3]) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat(lam(0xffffff, { map: rtFloorTex() }), 'asphalt', [x0, z0, x1, z1], [['concrete', RT_CANOPY.i0, RT_CANOPY.j0, RT_CANOPY.i1 + 1, RT_CANOPY.j1 + 1], ['concrete', RT_STORE.i0, RT_STORE.j1 + 1, RT_STORE.i1 + 1, RT_STORE.j1 + 2], ['granite', RT_STORE.i0 + 1, 1, RT_STORE.i1, RT_STORE.j1]])); fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  fl.onBeforeRender = rtTick;   // (the roofs shown or not as the ground's drawn: a frame behind the view at most)
  for (let j = RT_B[1]; j <= RT_B[3]; j++) for (let i = RT_B[0]; i <= RT_B[2]; i++) {
    const k = RT_KIND(i, j), x = cxw(i), z = cxw(j); if (rDid.has(idx(i, j))) continue;
    if (k === '#') rtPerimeter(i, j, x, z);
    else if (k === 'h') rtBlock(i, j, x, z);
    else if (k === 'W') rtBlast(i, j, x, z);
    else if (k === 'S') rtShelf(i, j, x, z);
    else if (k === 'G') rtPump(i, j);
    else if (k === 'R' || k === 'U' || k === 'X') rtTruck(i, j);
    else if (k === 'c') rtCar(i, j);
    else if (k === 'b') rtJersey(i, j, x, z);
    else if (k === 'n') rtCounter(i, j, x, z);
    else if (k === 's') rtBags(i, j, x, z);
    else if (k === 'k') rtCrates(i, j, x, z);
    else if (k === 'd') rtDumpster(i, j);
  }
  // what's only there from your own eyes: the roofs over the store and the forecourt (rtTick shows it with that view)
  const fp = new THREE.Group(); fp.visible = false; g.add(fp); rtFP = fp;
  rtCanopy(g, fp); rtStoreRoof(fp); rtLintels(); rtGarageBays(g); rtOffice(); rtFence(g); rtSigns(g); rtLampKit(g); rtOutside(g); rtBoxMesh(g);
  fp.traverse(o => { if (o.isMesh && !o.castShadow) o.receiveShadow = true; });
  const parts = rParts; rP = rParts = rDid = null; return parts;
}
// the map as world/arena.js takes it (AR_MAPS)
export const ROUTE_MAP = {
  id: 'route', name: 'Route 9', note: 'A highway services, abandoned: the store in its lot, the checkpoint, the pile-up',
  plan: RT_PLAN, b: RT_B, h: RT_H, low: RT_LOW, vault: RT_VAULT, walls: '#hW', what: RT_WHAT, build: rtBuild, indoor: false, tod: null,
  under: { R: 0.55, X: 0.5 },   // (the army truck's and the tractors' chassis: rounds from your own eyes go under them, world/collision.js)
  // (its lights, only as it gets dark, lighting/lightmap.js: the canopy's cool white, the sodium lamps and floods warm)
  lights: () => RT_LAMPS.map(([i, j, k]) => ({ arena: true, always: k === 'w', x: cxw(RT_B[0] + i), z: cxw(RT_B[1] + j), r: k === 'c' ? 10 : k === 'f' ? 16 : k === 'w' ? 11 : 13, col: k === 'c' ? [0.86, 0.92, 1] : k === 'w' ? [1, 0.66, 0.4] : [1, 0.8, 0.52], int: k === 'c' ? 0.85 : k === 'w' ? 0.8 : 0.85 })),
  flares: RT_FLARES,   // (the floods' lens flares, filled as it's built: effects/post.js)
  shelfBoxes: RT_BOX.list   // (the shelf boxes, world/arena-boxes.js; not 'boxes': world/arena.js keeps each map's footprints under that)
};
