// The arena: the map the player-against-player mode is played on (pvp/pvp.js), built over where the farm stands for as
// long as a match goes on. "Yard 4", an old freight terminal's yard in a clearing in the woods, overrun: a cast
// concrete pad walled round with precast panels, one open yard laid out as three lanes by what stands in it (never by
// walls with doorways), the west half (Blue's) mirrored for the east (Red's), so neither side's better off. Designed and
// checked in tools/arena-plan.py (tools/plan_check.py: reachability, spawn sightlines, lane sightlines, corner
// pinches, squeezes, timings):
//  - each spawn the marshalling area behind its gate: container stacks north and south of it and a long one out in
//    front, two ways out round that one's ends. Nothing out on the map sees in, and no spawn sees the other's
//  - NORTH, the Warehouse floor: close quarters. What's left of a burned-out warehouse, its roof gone and its south
//    wall broken into three pieces with wide gaps between them; the yard office against its north wall, containers
//    and a transformer left standing in it. The gaps either side of the middle piece are the flag's north approaches
//  - MIDDLE, the Weighbridge: medium range and the contest. A container stood up in the courtyard each side, the
//    stacks round it, the flag on the weighbridge between its booths and their sandbags
//  - SOUTH, the Rail spur: the long lane. A train of container wagons left on the first siding along its north side
//    (the gaps between the wagons the ways down from the middle), the signal box in the very middle, container stacks
//    part way along each side, the second siding along the platform, so it's never seen end to end
// Hardly a line runs from the north lane into the south, and the longest anywhere is about 31 m, corner to corner
// across the warehouse floor. Floodlights stand in its corners and halfway along each wall.
//
// It's one of the arena's maps (AR_MAPS; the other's indoors, world/arena-mall.js), picked with the match's settings in
// the lobby. A map is its own world, not built over the farm: while it's up the farm's every piece (the house, the
// yard, the fence, the stations, the ground and the woods: world/farm-set.js) is out of the scene, the map brings its
// own ground and surroundings, and the grid (what's walked through, what stops a round and the eye, the light) is the
// map's; when it comes down everything goes back as it was.

import { scene, V3 } from '../core/renderer.js';
import { rand, rr, seeded, withSeed } from '../core/math.js';
import { lam, lit, LMU } from '../core/shaders.js';
import { box, mergeInto } from '../core/geometry.js';
import { cell, ci, cxw, EMPTY, idx, OBST, openAt, WALL } from './grid.js';
import { cellBox, SHOOT_THRU, syncBlock } from './collision.js';
import { lowObst, obstTop, obstUnder } from './props.js';
import { THIN, wX, wZ } from './thin-walls.js';
import { openings, WALL_FORMS } from './house.js';
import { HOUSE_DOORS } from './interior.js';
import { FARM_ROOTS } from './farm-set.js';
import { floorMat } from './floors.js';
import { LAMP_ON, STATIC_LIGHTS } from '../lighting/static-lights.js';
import { lightField, los } from '../lighting/lightmap.js';
import { setVisKey } from '../lighting/vision.js';
import { stillShadowsReset } from '../core/still-shadows.js';
import { setLightsDirty } from '../barricades/planks.js';
import { TREE_HIDE } from './tree-cull.js';
import { FLARE_SRC, GLOW_LAYER } from '../effects/post.js';
import { MALL } from './arena-mall.js';
import { FARM_MAP } from './arena-farm.js';
import { ROUTE_MAP } from './arena-route.js';
import { QUAY_MAP, SQUARE_MAP } from './arena-small.js';
import { arDress } from './arena-dress.js';

// its bounds (cells, the walls round it included), the time of day it's always fought at (mid afternoon, the sun
// starting down and the shadows lengthening), and its plan, a row a line from north (j = z0) to south: # the outer wall, C a container (or, by
// its shape, a run one deep the wall of stacked concrete blocks, the six by three the yard office, the two by two the transformer: arContainer),
// h block walls (the warehouse, the hut, the spawn yards', the baffles, the stubs), b a jersey barrier, s sandbags (never vaulted: round them), k crate stacks (vaulted over: VAULT_LOW), o a drum, r a cable
// spool; A and B each side's spawn, F the spots a free-for-all spawns from (on the floor)
export const ARENA = { on: false, map: 'yard', x0: 1, x1: 42, z0: 1, z1: 42, tod: 15.6, indoor: false };
const AR_PLAN = [
  '##########################################',
  '#........h........CCCCCC........h........#',
  '#........h.F......CCCCCC......F.h........#',
  '#........h........CCCCCC........h........#',
  '#..F.....h......................h.....F..#',
  '#....kk.....CC..............CC.....kk....#',
  '#...........CC..bb......bb..CC...........#',
  '#...........CC.....CCCC.....CC...........#',
  '#...............F..CCCC..F...............#',
  '#CCC......k...CC..........CC...k......CCC#',
  '#CCC......k...CC..........CC...k......CCC#',
  '#........................................#',
  '#....hhhhhhh....hhhhhhhhhh....hhhhhhh....#',
  '#..............F..........F..............#',
  '#CCCC........CCC..........CCC........CCCC#',
  '#CCCC...CC...CCC..........CCC...CC...CCCC#',
  '#AA.....CC........hh..hh........CC.....BB#',
  '#.......CC........hhsshh........CC.......#',
  '#.A.....CC......................CC.....B.#',
  '#AAA....CC...CC............CC...CC....BBB#',
  '#AAA....CC...CC..s......s..CC...CC....BBB#',
  '#AAA....CC.F.CC..s......s..CC.F.CC....BBB#',
  '#.AA....CC...CC............CC...CC....BB.#',
  '#..A....CC......................CC....B..#',
  '#.......CC........hhsshh........CC.......#',
  '#AA.....CC........hh..hh........CC.....BB#',
  '#CCCC...CC...CCC..........CCC...CC...CCCC#',
  '#CCCC........CCC..........CCC........CCCC#',
  '#............CCF..........FCC............#',
  '#.....CCCCC......CCCCCCCC......CCCCC.....#',
  '#.....CCCCC......CCCCCCCC......CCCCC.....#',
  '#........................................#',
  '#.............CCC........CCC.............#',
  '#........F..CCCCC........CCCCC..F........#',
  '#...CCC.....CC.....hhhh.....CC.....CCC...#',
  '#...CCbbbb..CC..s..hhhh..s..CC..bbbbCC...#',
  '#...F.......CC..s..hhhh..s..CC.......F...#',
  '#...............s..hhhh..s...............#',
  '#CCC..r..........F......F..........r..CCC#',
  '#CCC......CC....o........o....CC......CCC#',
  '#CCC......CC..................CC......CCC#',
  '##########################################'
];
// how tall each kind stands (m): what a round fired below it from your own eyes stops on (world/props.js: obstTop), and
// whether you see and shoot over it (low) or not
const AR_H = { '#': 3.2, C: 2.6, h: 2.1, b: 1.1, s: 1.15, k: 1.0, o: 1.05, r: 1.1 };
const AR_LOW = new Set(['b', 's', 'o', 'r', 'k']);
// (and what's vaulted: the sandbags, the crate stacks and the jersey barriers, chest high, a head showing over them)
const AR_VAULT = new Set(['k', 'b']);   // (the sandbag walls aren't: you go round them)
// the sandbag walls' cells, while the arena's up: hopped over like the farm's fence (player/vaulting.js)
export const VAULT_LOW = new Set();
// the maps: each its plan and where it stands on the grid ([x0, z0, x1, z1] cells), how tall each kind in it is, which
// are low and which vaulted, which are walls, what the vault prompt calls each, how it's built (its pieces back, into
// its group), its fixed lights, and, indoors, the hour it's always at (its own lights on). Picked with the match's
// settings (pvp/pvp.js PVP.cfg.map, the lobby's map picker: net/lobby.js)
const AR_YARD4 = { id: 'yard', name: 'Yard 4', note: 'A freight yard, overrun: the burned warehouse, the weighbridge, the train on the siding', plan: AR_PLAN, b: [1, 1, 42, 42], h: AR_H, low: AR_LOW, vault: AR_VAULT, walls: '#h',
  what: { k: 'crates', b: 'barrier' }, build: null, indoor: false, tod: null, lights: () => AR_LIGHTS(), flares: [] };
export const AR_MAPS = { yard: AR_YARD4, mall: MALL, farm: FARM_MAP, route: ROUTE_MAP, square: SQUARE_MAP, quay: QUAY_MAP };
export const AR_MAP_IDS = Object.keys(AR_MAPS);
let AR_CUR = AR_YARD4;
// the map to put up: the grid's bounds for it, and its spawns worked out the first time
function arMapSet(id) {
  const M = AR_MAPS[id] || AR_YARD4; AR_CUR = M;
  ARENA.map = M.id; [ARENA.x0, ARENA.z0, ARENA.x1, ARENA.z1] = M.b; ARENA.indoor = !!M.indoor; ARENA.tod = M.tod ?? 15.6;
  if (!M.spawn) M.spawn = arSpawnsOf(M);
}
// what's vaulted where you stand (the vault prompt: barricades/interactions.js): the nearest within reach, crates or sandbags
export function arVaultWhat(x, z) {
  let best = 9, k = '';
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = ci(x) + di, j = ci(z) + dj, c = AR_KIND(i, j); if (!AR_CUR.vault.has(c)) continue; const d = Math.hypot(cxw(i) - x, cxw(j) - z); if (d < best) { best = d; k = c; } }
  return AR_CUR.what[k] || Object.values(AR_CUR.what)[0];
}
// spawn spots by side, worked out from the plan: [x, z, facing]
// (each map's, worked out the first time it's put up: arMapSet)
function arSpawnsOf(M) {
  const S = { A: [], B: [], F: [] }, [x0, , x1] = M.b, mid = (cxw(x0) + cxw(x1)) / 2;
  M.plan.forEach((r, jj) => [...r].forEach((ch, ii) => {
    const x = cxw(M.b[0] + ii), z = cxw(M.b[1] + jj);
    if (ch === 'A' || ch === 'B' || ch === 'F') S[ch].push([x, z, Math.atan2(mid - x, cxw(22) - z)]);   // (facing the middle)
  }));
  const main = sd => S[sd].filter(s => S[sd].some(o => o !== s && Math.abs(o[1] - s[1]) < 0.1 && Math.abs(o[0] - s[0]) < 1.1)).map(s => [s[0], s[1]]);
  return { S, yard: { A: main('A'), B: main('B') } };
}
const AR_KIND = (i, j) => { const r = AR_CUR.plan[j - ARENA.z0]; return r ? r[i - ARENA.x0] || '#' : '#'; };
// each side's spawn spots in its yard (arSpawnsOf: yard): every spot the plan marks for it, which is every open spot in the
// yard that nothing outside can see (tools/arena-plan.py), so spawns spread over the yard and are safe by its walls
// (only the main run of them: not a lone spot tucked into a corner by a stub wall, where nobody would start)
// a side's spots this round (Showdown: arenaSpawn): drawn at random each round (by the round, the same on every
// screen), but kept together: an anchor anywhere in the yard, and each teammate on the next nearest spot to it (a
// little shuffled, YARD_SP.jit m), never closer than YARD_SP.gap m to one already taken, so a side starts as a group a
// few metres across, somewhere different each round
const YARD_SP = { jit: 1.6, gap: 1.4 };
function yardSpots(sd, seed, n) {
  const Y = AR_CUR.spawn.yard[sd]; if (!Y.length) return null;
  let h = (seed * 2654435761 + (sd === 'B' ? 97 : 13)) >>> 0; const rnd = () => { h = (h ^ (h << 13)) >>> 0; h = (h ^ (h >>> 17)) >>> 0; h = (h ^ (h << 5)) >>> 0; return h / 4294967296; };
  const a = Y[Math.floor(rnd() * Y.length)], order = Y.map(c => [c, Math.hypot(c[0] - a[0], c[1] - a[1]) + rnd() * YARD_SP.jit]).sort((p, q) => p[1] - q[1]).map(e => e[0]);
  const out = [];
  for (const c of order) { if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1]) >= YARD_SP.gap)) out.push(c); if (out.length > n) break; }
  return out[n] || order[n % order.length];
}

// ---- the look of it
// The story it tells: Yard 4 was a working rail-and-road freight yard. Its warehouse burned out and was pulled down to
// the slab, leaving its block walls broken off at head height and its steel frame standing over them (the north lane);
// the trucks came in through a gate at each end (the spawn yards: the marshalling yards behind the gates) and were
// weighed on the weighbridge in the middle between its two booths (the plaza, the flag on the bridge itself, sandbagged
// round since); the south lane is the rail spur, its two sidings ending at the signal box in the middle, a wall of
// stacked concrete blocks between it and the plaza. The yard office, a portable cabin, still stands against the north
// wall, and the transformer that fed the floodlights against the south. What stands where is still the plan (AR_PLAN):
// the dressing never puts anything solid where the plan has floor, and never lets anything stick out more than a few
// centimetres from what's solid, so it changes no sightline, cover or route.
// (what stands taller than you, the walls, the hut and the containers, dithered away round you from above when it's
// between you and the camera, as the trees are: core/shaders.js, world/cutaway.js)
const arTall = c => lit(new THREE.MeshLambertMaterial({ color: c }), 'tree');
const AR_M = {
  wall: arTall(0x8e8a81), wallDk: arTall(0x6d6a63), cap: arTall(0x9d998f), stain: arTall(0x5d5a52),
  hut: arTall(0x958f83), hutDk: arTall(0x7a7266), rebar: lam(0x5b3a28),
  barrier: lam(0xb4ae9f), barrierDk: lam(0x8f897b), stripe: lam(0xc9a43a), slot: lam(0x3a3834),
  bag: lam(0x8f7c55), bagDk: lam(0x75653f),
  crate: lam(0x7d5c38), crateDk: lam(0x5e432a), carton: lam(0xa07c50), cartonDk: lam(0x8a6a42), wrap: lam(0xc9c6bb),
  drumA: lam(0x2f4d68), drumB: lam(0x7a3b24), drumRim: lam(0x3a3a38),
  pole: lam(0x4a4b4c), lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  cont: [arTall(0x8a3b2a), arTall(0x355a78), arTall(0x5d6643), arTall(0x9b6a2c)], contDk: arTall(0x2c2b29),
  steel: arTall(0x5a4e45), gate: arTall(0x4c5b50), gateDk: arTall(0x343d37), chain: lam(0x55585a),
  kiosk: arTall(0x4f6b52), kioskDk: arTall(0x3a5040), plinth: arTall(0x8a867d),
  office: arTall(0xc9c2ae), officeDk: arTall(0x4a4d4f), glass: arTall(0x2e353b), grille: arTall(0x3b3d3e),
  ply: arTall(0x9c7e55), plyDk: arTall(0x7d6442), door: arTall(0x55606a), lego: arTall(0xa29d92),
  sigBk: arTall(0x1e1f20), sigR: new THREE.MeshBasicMaterial({ color: 0x8a2a20 }), sigG: new THREE.MeshBasicMaterial({ color: 0x2f6b3a })
};
// where the floor's yard markings go (plan rows and columns): the sidings' centre line and how far west each runs to (the
// signal box), the walkway's row, and the loading bays' west columns (at the plaza doors); the weighbridge across the
// plaza ([c0, r0, c1, r1], plan cells: the flag stands on it), the racking bays along the warehouse's north wall
const AR_YARD = { rail: [[37, 18], [29.5, 40]], walk: 11, bay: [13], bridge: [15, 19.25, 26, 22.75], racks: [[1, 8], [10, 17]] };
// (the floor's resolution, pixels a metre: its markings and stencils crisp from your own eyes)
const AR_FLOOR_PX = 2048;
// the pad: concrete, its joints every 4 m, worn and stained, and each spawn's box painted on it
function arFloorTex() {
  const W = AR_FLOOR_PX, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d');
  const cw = ARENA.x1 - ARENA.x0 + 1, ch = ARENA.z1 - ARENA.z0 + 1, px = W / cw, pz = W / ch, k = W / 1024;
  x.fillStyle = '#8d8a83'; x.fillRect(0, 0, W, W);
  const rnd = seeded(7331);
  for (let n = 0; n < 2600; n++) { const r = (2 + rnd() * 26) * k; x.fillStyle = `rgba(${rnd() < 0.5 ? '60,58,54' : '150,146,138'},${0.03 + rnd() * 0.06})`; x.beginPath(); x.arc(rnd() * W, rnd() * W, r, 0, 7); x.fill(); }
  for (let n = 0; n < 40; n++) { const r = (10 + rnd() * 60) * k; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(30,28,26,0.32)'); g.addColorStop(1, 'rgba(30,28,26,0)'); x.save(); x.translate(rnd() * W, rnd() * W); x.scale(1, 0.5 + rnd()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }   // oil
  for (let n = 0; n < 9; n++) { const r = (18 + rnd() * 50) * k, g = x.createRadialGradient(0, 0, r * 0.4, 0, 0, r); g.addColorStop(0, 'rgba(52,58,62,0.55)'); g.addColorStop(1, 'rgba(52,58,62,0)'); x.save(); x.translate(rnd() * W, rnd() * W); x.scale(1.6, 0.7 + rnd() * 0.5); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }   // wet patches, where the pad dips
  x.strokeStyle = 'rgba(40,38,34,0.16)'; x.lineWidth = 14 * k;   // tyre marks, sweeping across
  for (let n = 0; n < 6; n++) { x.beginPath(); const y0 = rnd() * W; x.moveTo(-20, y0); x.bezierCurveTo(W * 0.3, y0 + (rnd() - 0.5) * 400 * k, W * 0.7, y0 + (rnd() - 0.5) * 400 * k, W + 20, y0 + (rnd() - 0.5) * 200 * k); x.stroke(); }
  x.strokeStyle = 'rgba(48,46,42,0.55)'; x.lineWidth = 2.2 * k;   // the joints
  for (let i = 4; i < cw; i += 4) { x.beginPath(); x.moveTo(i * px, 0); x.lineTo(i * px, W); x.stroke(); }
  for (let j = 4; j < ch; j += 4) { x.beginPath(); x.moveTo(0, j * pz); x.lineTo(W, j * pz); x.stroke(); }
  for (let n = 0; n < 90; n++) { x.strokeStyle = 'rgba(52,50,46,0.35)'; x.lineWidth = k; x.beginPath(); let a = rnd() * W, b = rnd() * W; x.moveTo(a, b); for (let s = 0; s < 6; s++) { a += (rnd() - 0.5) * 40 * k; b += (rnd() - 0.5) * 40 * k; x.lineTo(a, b); } x.stroke(); }   // cracks
  const cx = i => (i + 0.5) * px, cz = j => (j + 0.5) * pz, Y = AR_YARD;
  // (a stencil on the floor, its text shrunk to fit the w metres given: never running off its patch)
  const stencil = (t, X, Z, w, hgt, col, rot) => { x.save(); x.translate(X, Z); x.rotate(rot || 0); x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; let f = hgt * pz; x.font = `700 ${f}px "Saira Extra Condensed", sans-serif`; while (x.measureText(t).width > w * px && f > 6) { f *= 0.94; x.font = `700 ${f}px "Saira Extra Condensed", sans-serif`; } x.fillText(t, 0, 0); x.restore(); };
  // what makes it a working yard (AR_YARD): the rail spur's two sidings sunk into the concrete along the south lane,
  // sleepers and all, each ending at a buffer stop by the signal box, the platform's yellow edge line beside them; a
  // yellow walkway painted along the warehouse floor's south wall; a hatched loading bay inside each plaza door; the
  // racking bays' lines along the warehouse's north wall, where its shelving stood
  for (const [row, end] of Y.rail) for (const [a, b] of end >= 40 ? [[1, 40]] : [[1, end], [41 - end, 40]]) {
    const xa = cx(a) - px / 2, xb = cx(b) + px / 2, zc = cz(row);
    x.fillStyle = 'rgba(70,58,46,0.75)'; for (let xx = xa + 4 * k; xx < xb; xx += px * 0.7) x.fillRect(xx, zc - pz * 1.1, px * 0.22, pz * 2.2);   // (the sleepers)
    x.fillStyle = 'rgba(60,58,56,0.9)'; for (const o of [-0.72, 0.72]) x.fillRect(xa, zc + o * pz - 3 * k, xb - xa, 6 * k);   // (the rails)
    x.fillStyle = 'rgba(150,152,154,0.8)'; for (const o of [-0.72, 0.72]) x.fillRect(xa, zc + o * pz - k, xb - xa, 2 * k);   // (their worn tops)
    if (end < 40) { const bx = a === 1 ? xb - 6 * k : xa; x.fillStyle = 'rgba(201,164,58,0.9)'; x.fillRect(bx, zc - pz * 1.2, 6 * k, pz * 2.4); }   // (the buffer stop)
    if (end < 40) { x.fillStyle = 'rgba(214,174,52,0.7)'; x.fillRect(xa, zc - pz * 1.45, xb - xa, pz * 0.12); }   // (the platform's edge line)
  }
  x.strokeStyle = 'rgba(214,174,52,0.7)'; x.lineWidth = 6 * k; x.setLineDash([26 * k, 14 * k]); x.beginPath(); x.moveTo(cx(1), cz(Y.walk)); x.lineTo(cx(40), cz(Y.walk)); x.stroke(); x.setLineDash([]);
  for (const i of Y.bay) for (const ii of [i, 40 - i - 1]) {
    const bx0 = cx(ii) - px / 2, bz0 = cz(Y.walk - 1) - pz / 2, bw = px * 2, bh = pz * 2;
    x.strokeStyle = 'rgba(214,174,52,0.75)'; x.lineWidth = 4 * k; x.strokeRect(bx0, bz0, bw, bh);
    x.save(); x.beginPath(); x.rect(bx0, bz0, bw, bh); x.clip(); for (let d = -bw; d < bw * 2; d += 14 * k) { x.beginPath(); x.moveTo(bx0 + d, bz0); x.lineTo(bx0 + d + bh, bz0 + bh); x.stroke(); } x.restore();
  }
  x.strokeStyle = 'rgba(214,174,52,0.42)'; x.lineWidth = 3 * k;
  for (const [a, b] of Y.racks) for (const [c0, c1] of [[a, b], [41 - b, 41 - a]]) { const x0 = cx(c0) - px / 2 + 3 * k, x1 = cx(c1) + px / 2 - 3 * k, z0 = cz(1) - pz / 2 + 4 * k, z1 = cz(2) + pz * 0.3; x.strokeRect(x0, z0, x1 - x0, z1 - z0); for (let s = x0 + px * 2.7; s < x1 - px; s += px * 2.7) { x.beginPath(); x.moveTo(s, z0); x.lineTo(s, z1); x.stroke(); } }
  // the weighbridge across the plaza: a steel deck set flush in the pad, checker plate in panels, its ends striped,
  // and its limit stencilled at each end (the flag stands on it, sandbagged round)
  { const [c0, r0, c1, r1] = Y.bridge, X0 = c0 * px, X1 = (c1 + 1) * px, Z0 = r0 * pz, Z1 = (r1 + 1) * pz - pz;
    x.fillStyle = '#5d6062'; x.fillRect(X0, Z0, X1 - X0, Z1 - Z0);
    x.fillStyle = 'rgba(120,124,126,0.55)'; for (let a = X0 + 4 * k; a < X1; a += 9 * k) for (let b = Z0 + 4 * k + ((a / (9 * k)) % 2) * 4 * k; b < Z1; b += 9 * k) x.fillRect(a, b, 4 * k, 1.6 * k);   // (the checker plate)
    for (let n = 0; n < 160; n++) { x.fillStyle = `rgba(${rnd() < 0.6 ? '110,70,40' : '40,40,40'},${0.08 + rnd() * 0.15})`; x.beginPath(); x.arc(X0 + rnd() * (X1 - X0), Z0 + rnd() * (Z1 - Z0), (2 + rnd() * 9) * k, 0, 7); x.fill(); }   // (rust and wear)
    x.strokeStyle = 'rgba(30,30,30,0.7)'; x.lineWidth = 3 * k; x.strokeRect(X0, Z0, X1 - X0, Z1 - Z0);
    for (let a = X0 + 3.5 * px; a < X1 - px; a += 3.5 * px) { x.beginPath(); x.moveTo(a, Z0); x.lineTo(a, Z1); x.stroke(); }   // (its deck's panels)
    for (const [a, b] of [[X0 - 0.5 * px, X0], [X1, X1 + 0.5 * px]]) { x.save(); x.beginPath(); x.rect(a, Z0, b - a, Z1 - Z0); x.clip(); x.fillStyle = 'rgba(201,164,58,0.9)'; x.fillRect(a, Z0, b - a, Z1 - Z0); x.fillStyle = 'rgba(25,25,25,0.85)'; for (let d = -40 * k; d < Z1 - Z0 + 40 * k; d += 16 * k) { x.beginPath(); x.moveTo(a, Z0 + d); x.lineTo(b, Z0 + d - (b - a)); x.lineTo(b, Z0 + d - (b - a) + 7 * k); x.lineTo(a, Z0 + d + 7 * k); x.fill(); } x.restore(); }   // (striped ends)
    stencil('60 T MAX', X0 + 1.3 * px, (Z0 + Z1) / 2, 2.6, 0.8, 'rgba(226,220,204,0.6)', -Math.PI / 2);
    stencil('60 T MAX', X1 - 1.3 * px, (Z0 + Z1) / 2, 2.6, 0.8, 'rgba(226,220,204,0.6)', Math.PI / 2);
  }
  // each side's pad: a hatched box in its colour, worn
  // (in plain white, the same at both ends: in Showdown the sides swap ends as the loadouts change)
  [['A', 'rgba(226,220,204,0.42)'], ['B', 'rgba(226,220,204,0.42)']].forEach(([s, col]) => {
    const cs = [...AR_PLAN].flatMap((r, j) => [...r].map((q, i) => q === s && (r[i - 1] === s || r[i + 1] === s) ? [i, j] : null)).filter(Boolean);   // (the main run of them, not a lone spot tucked in a corner)
    const i0 = Math.min(...cs.map(c => c[0])) - 0.4, i1 = Math.max(...cs.map(c => c[0])) + 1.4, j0 = Math.min(...cs.map(c => c[1])) - 0.4, j1 = Math.max(...cs.map(c => c[1])) + 1.4;
    x.strokeStyle = col; x.lineWidth = 7 * k; x.strokeRect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz);
    x.save(); x.beginPath(); x.rect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz); x.clip(); x.lineWidth = 4 * k;
    for (let d = -W; d < W; d += 22 * k) { x.beginPath(); x.moveTo(i0 * px + d, j0 * pz); x.lineTo(i0 * px + d + (j1 - j0) * pz, j1 * pz); x.stroke(); }
    x.restore();
  });
  // the yard's number stencilled in the courtyard north of the weighbridge, half worn off
  stencil('YARD 4', W / 2, cz(13), 8, 1.6, 'rgba(210,200,170,0.22)');
  for (let n = 0; n < 900 * k * k; n++) { x.fillStyle = 'rgba(141,138,131,0.9)'; x.fillRect(rnd() * W, rnd() * W, (2 + rnd() * 5) * k, (2 + rnd() * 5) * k); }   // (the paint worn through)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
// ---- surfaces in metres: a canvas texture laid on in world units (arSkin), so a pattern (the blockwork, the
// containers' corrugation, the concrete blocks' joints) runs on unbroken from cell to cell, and only the faces nothing
// stands against are made at all (none buried in a neighbour to flicker through it)
const arTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h, seeded(w * 7 + h)); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
// (the textures, each tu by tv metres a repeat: made the first time the yard is built)
let AR_TX = null;
function arTextures() {
  if (AR_TX) return AR_TX;
  // concrete blockwork, 400 by 200 mm blocks in stretcher bond, grimy at its foot and streaked from its top (3.2 by 2.4 m)
  const cmu = arTex(512, 384, (x, W, H, r) => {
    x.fillStyle = '#7a756c'; x.fillRect(0, 0, W, H);
    for (let row = 0; row < 12; row++) for (let b = -1; b < 8; b++) { const y = H - (row + 1) * 32, xo = b * 64 + (row % 2 ? 32 : 0), v = 150 + (r() - 0.5) * 22; x.fillStyle = `rgb(${v},${v - 4},${v - 12})`; x.fillRect(xo + 1.5, y + 1.5, 61, 29); }
    for (let n = 0; n < 1400; n++) { x.fillStyle = `rgba(${r() < 0.5 ? '70,66,60' : '190,186,176'},${0.1 + r() * 0.15})`; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    const g = x.createLinearGradient(0, H, 0, H - 80); g.addColorStop(0, 'rgba(50,46,40,0.55)'); g.addColorStop(1, 'rgba(50,46,40,0)'); x.fillStyle = g; x.fillRect(0, H - 80, W, 80);
    for (let n = 0; n < 14; n++) { const sx = r() * W, sw = 3 + r() * 10, sl = 30 + r() * 120, g2 = x.createLinearGradient(0, 64, 0, 64 + sl); g2.addColorStop(0, 'rgba(60,56,50,0.3)'); g2.addColorStop(1, 'rgba(60,56,50,0)'); x.fillStyle = g2; x.fillRect(sx, 64, sw, sl); }
  });
  // stacked interlocking concrete blocks, 1.6 m long and a third of 2.6 m high, joints staggered course to course, each
  // block's edges chamfered (3.2 by 2.6 m)
  const lego = arTex(512, 416, (x, W, H, r) => {
    x.fillStyle = '#4a4740'; x.fillRect(0, 0, W, H);
    const bh = H / 3;
    for (let row = 0; row < 3; row++) for (let b = -1; b < 3; b++) { const y = H - (row + 1) * bh, xo = b * 256 + (row % 2 ? 128 : 0), v = 168 + (r() - 0.5) * 18;
      x.fillStyle = `rgb(${v},${v - 4},${v - 11})`; x.fillRect(xo + 4, y + 4, 248, bh - 8);
      x.fillStyle = 'rgba(255,255,250,0.18)'; x.fillRect(xo + 4, y + 4, 248, 5); x.fillStyle = 'rgba(30,28,24,0.28)'; x.fillRect(xo + 4, y + bh - 10, 248, 6);
      for (let n = 0; n < 60; n++) { x.fillStyle = `rgba(80,76,70,${0.2 + r() * 0.3})`; x.beginPath(); x.arc(xo + 8 + r() * 240, y + 8 + r() * (bh - 16), 1 + r() * 2.5, 0, 7); x.fill(); }   // (its blowholes)
    }
    const g = x.createLinearGradient(0, H, 0, H - 70); g.addColorStop(0, 'rgba(50,46,40,0.45)'); g.addColorStop(1, 'rgba(50,46,40,0)'); x.fillStyle = g; x.fillRect(0, H - 70, W, 70);
  });
  // a container's corrugated steel, the ribs every 0.3 m, in grey for each container's colour to tint, rust and grime
  // through it (1.2 by 2.6 m)
  const corr = arTex(128, 256, (x, W, H, r) => {
    for (let s = 0; s < 4; s++) { const x0 = s * 32; x.fillStyle = '#d8d8d8'; x.fillRect(x0, 0, 32, H); x.fillStyle = '#f2f2f2'; x.fillRect(x0 + 4, 0, 10, H); x.fillStyle = '#a8a8a8'; x.fillRect(x0 + 18, 0, 4, H); x.fillStyle = '#c4c4c4'; x.fillRect(x0 + 22, 0, 10, H); }
    for (let n = 0; n < 160; n++) { x.fillStyle = `rgba(${r() < 0.6 ? '120,70,40' : '60,56,52'},${0.06 + r() * 0.16})`; x.beginPath(); x.arc(r() * W, r() * H, 1 + r() * 4, 0, 7); x.fill(); }
    for (let n = 0; n < 6; n++) { const sx = r() * W, sl = 30 + r() * 120, g2 = x.createLinearGradient(0, 8, 0, 8 + sl); g2.addColorStop(0, 'rgba(110,60,34,0.35)'); g2.addColorStop(1, 'rgba(110,60,34,0)'); x.fillStyle = g2; x.fillRect(sx, 8, 2 + r() * 4, sl); }   // (rust run down from the top rail)
    const g = x.createLinearGradient(0, H, 0, H - 40); g.addColorStop(0, 'rgba(40,36,30,0.4)'); g.addColorStop(1, 'rgba(40,36,30,0)'); x.fillStyle = g; x.fillRect(0, H - 40, W, 40);
  });
  // the yard office's flat steel panels, a joint every 1.2 m and a faint line where the window band runs (1.2 by 2.6 m)
  const panel = arTex(128, 256, (x, W, H, r) => {
    x.fillStyle = '#ececec'; x.fillRect(0, 0, W, H); x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 3, H); x.fillStyle = '#fafafa'; x.fillRect(3, 0, 2, H);
    for (let n = 0; n < 90; n++) { x.fillStyle = `rgba(${r() < 0.5 ? '120,110,90' : '80,80,80'},${0.05 + r() * 0.1})`; x.beginPath(); x.arc(r() * W, r() * H, 1 + r() * 3, 0, 7); x.fill(); }
    const g = x.createLinearGradient(0, H, 0, H - 50); g.addColorStop(0, 'rgba(60,54,44,0.4)'); g.addColorStop(1, 'rgba(60,54,44,0)'); x.fillStyle = g; x.fillRect(0, H - 50, W, 50);
  });
  const skin = (t, c) => lit(new THREE.MeshLambertMaterial({ color: c, map: t }), 'tree');
  AR_TX = { cmu: [skin(cmu, 0xffffff), 3.2, 2.4], lego: [skin(lego, 0xffffff), 3.2, 2.6], panel: [skin(panel, 0xd6cfba), 1.2, 2.6], panelDk: [skin(panel, 0x55595b), 1.2, 2.6],
    cont: [0x8a3b2a, 0x355a78, 0x5d6643, 0x9b6a2c].map(c => [skin(corr, c), 1.2, 2.6]), gate: [skin(corr, 0x56685a), 1.2, 2.6] };
  return AR_TX;
}
// the faces being gathered, by surface (AR_TX's), each made one mesh at the end (arSkinsOut)
let arSkins = null;
// a face looking along ax ('x', 'y' or 'z') the way sg (±1) goes, in the plane ax = at, over [a0, a1] across it (z for
// an x face, x for the others) and [b0, b1] up it (y; z for a top)
function arFace(S, ax, sg, at, a0, a1, b0, b1) {
  if (a1 - a0 < 1e-4 || b1 - b0 < 1e-4) return;
  let L = arSkins.get(S); if (!L) arSkins.set(S, L = { P: [], N: [], U: [] });
  const pt = (a, b) => ax === 'x' ? [at, b, a] : ax === 'z' ? [a, b, at] : [a, at, b], n = ax === 'x' ? [sg, 0, 0] : ax === 'y' ? [0, sg, 0] : [0, 0, sg];
  const c = [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)], uv = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
  const e1 = [0, 1, 2].map(q => c[1][q] - c[0][q]), e2 = [0, 1, 2].map(q => c[2][q] - c[0][q]);
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
  const us = ax === 'x' ? -sg : ax === 'z' ? sg : 1;   // (read left to right from in front)
  for (const q of flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) { L.P.push(...c[q]); L.N.push(...n); L.U.push(us * uv[q][0] / S[1], uv[q][1] / S[2]); }
}
function arSkinsOut(g) {
  for (const [S, L] of arSkins) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(L.N, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(L.U, 2));
    const m = new THREE.Mesh(geo, S[0]); m.castShadow = m.receiveShadow = true; g.add(m);
  }
  arSkins = null;
}
// how tall what stands in a cell is (m: 0 for open floor or anything low), as it's built
const arTallH = (i, j) => { const k = AR_KIND(i, j); return k === '#' ? (arLowSide(i, j) ? AR_LOW_WALL : AR_MID_WALL) + 0.12 : k === 'h' ? AR_H.h : k === 'C' ? AR_H.C : 0; };
// a block of cells' sides, skinned (S) from the floor to y1, each side only as far up as whatever stands against it
// doesn't already hide it, and its top at y1 (top: whether to make it)
function arSkinBlock(S, i0, j0, i1, j1, y0, y1, top) {
  const X0 = cxw(i0) - 0.5, X1 = cxw(i1) + 0.5, Z0 = cxw(j0) - 0.5, Z1 = cxw(j1) + 0.5;
  for (let j = j0; j <= j1; j++) { const a = cxw(j) - 0.5; arFace(S, 'x', -1, X0, a, a + 1, Math.max(y0, arTallH(i0 - 1, j)), y1); arFace(S, 'x', 1, X1, a, a + 1, Math.max(y0, arTallH(i1 + 1, j)), y1); }
  for (let i = i0; i <= i1; i++) { const a = cxw(i) - 0.5; arFace(S, 'z', -1, Z0, a, a + 1, Math.max(y0, arTallH(i, j0 - 1)), y1); arFace(S, 'z', 1, Z1, a, a + 1, Math.max(y0, arTallH(i, j1 + 1)), y1); }
  if (top) arFace(S, 'y', 1, y1, X0, X1, Z0, Z1);
}
// which sides of a block of cells are clear all along (nothing tall against them, to h): [west, east, north, south]
function arClear(i0, j0, i1, j1, h) {
  const run = f => { for (let k = 0; ; k++) { const c = f(k); if (!c) return true; if (arTallH(c[0], c[1]) >= h) return false; } };
  return [run(k => j0 + k <= j1 && [i0 - 1, j0 + k]), run(k => j0 + k <= j1 && [i1 + 1, j0 + k]), run(k => i0 + k <= i1 && [i0 + k, j0 - 1]), run(k => i0 + k <= i1 && [i0 + k, j1 + 1])];
}
// a slab over a block (a roof, a coping), out over its clear sides by ov
function arSlab(parts, i0, j0, i1, j1, y0, y1, ov, mat, clr) {
  const a = cxw(i0) - 0.5 - (clr[0] ? ov : 0), b = cxw(i1) + 0.5 + (clr[1] ? ov : 0), c = cxw(j0) - 0.5 - (clr[2] ? ov : 0), d = cxw(j1) + 0.5 + (clr[3] ? ov : 0);
  return arPush(parts, box2(b - a, y1 - y0, d - c, mat, (a + b) / 2, (y0 + y1) / 2, (c + d) / 2));
}
// a face of a cell (plan column and row), as F: which axis it looks along, which way, the plane it's in; and u, how far
// along it a point is in world terms (x along a north or south face, z along an east or west one)
const arF = (pc, pr, sd) => { const i = ARENA.x0 + pc, j = ARENA.z0 + pr, nx = sd === 'e' ? 1 : sd === 'w' ? -1 : 0, nz = sd === 's' ? 1 : sd === 'n' ? -1 : 0; return { ax: nx ? 'x' : 'z', sg: nx || nz, at: nx ? cxw(i) + nx * 0.5 : cxw(j) + nz * 0.5, u: nx ? cxw(j) : cxw(i), i, j, nx, nz }; };
// a box stood on face F, centred u along it and y up, w across, h tall, d deep, out from the face by out
const arOn = (parts, F, u, y, w, h, d, mat, out = 0) => arPush(parts, F.ax === 'z' ? box2(w, h, d, mat, u, y, F.at + F.sg * (out + d / 2)) : box2(d, h, w, mat, F.at + F.sg * (out + d / 2), y, u));
// ---- signs and stencils: text drawn to fit its plate with a margin (the font shrunk till it does, whatever font the
// browser has), so nothing's ever cut off at an edge; worn in seeded scuffs; laid a few millimetres off its surface
// with a polygon offset, so it never flickers into it from any distance
const AR_SIGN_OFF = 0.016;   // (clear of the outer wall's seams, 12 mm proud: arWall)
function arText(g, o) {
  const cw = o.w / o.h > 3 ? 1024 : 512, c = document.createElement('canvas'); c.width = cw; c.height = Math.max(32, Math.round(cw * o.h / o.w)); const t = c.getContext('2d'), W = c.width, H = c.height, r = seeded(o.seed || o.text.length * 131 + 7);
  if (o.bg) { t.fillStyle = o.bg; t.fillRect(0, 0, W, H); if (o.edge) { const lw = Math.min(W, H) * 0.06; t.strokeStyle = o.edge; t.lineWidth = lw; t.strokeRect(lw * 1.2, lw * 1.2, W - lw * 2.4, H - lw * 2.4); } }
  if (o.draw) o.draw(t, W, H);
  const lines = String(o.text).split('\n'), fam = o.font || '700 _px "Saira Extra Condensed", sans-serif', m = o.bg ? 0.84 : 0.94;
  let f = (H * m) / lines.length * 0.92; const set = () => { t.font = fam.replace('_', Math.round(f)); };
  set(); while (lines.some(L => t.measureText(L).width > W * m) && f > 6) { f *= 0.95; set(); }
  t.fillStyle = o.col; t.textAlign = 'center'; t.textBaseline = 'middle';
  lines.forEach((L, k) => t.fillText(L, W / 2 + (o.dx || 0) * W, H / 2 + (k - (lines.length - 1) / 2) * f * 1.05 + f * 0.04));
  if (o.wear !== 0) { t.globalCompositeOperation = 'destination-out'; for (let k = 0; k < (o.wear || 160); k++) { t.globalAlpha = 0.4 + r() * 0.6; t.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 4); } t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; }
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m2 = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), lam(0xffffff, { map: tex, transparent: true, alphaTest: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m2.position.set(o.x, o.y, o.z); m2.rotation.y = o.ry || 0; m2.receiveShadow = true; g.add(m2); return m2;
}
// a sign on face F (arF) centred u along it (from the cell's middle) and y up: checked first that the face it's on runs
// the whole width of it, as high as its top, with nothing standing in front of it (else it'd hang off an end, or into
// the air over a wall's top, or be buried in a container stood against it)
const AR_SIGN_BAD = [];
function arSign(g, F, du, y, o) {
  const u = F.u + du, a0 = du - o.w / 2, a1 = du + o.w / 2;
  for (let k = Math.ceil(a0 - 0.5 + 1e-6); k <= Math.floor(a1 + 0.5 - 1e-6); k++) {
    const bi = F.i + (F.nz ? k : 0), bj = F.j + (F.nx ? k : 0);
    if (arTallH(bi, bj) < y + o.h / 2 + 0.02 || arTallH(bi + F.nx, bj + F.nz)) { AR_SIGN_BAD.push(o.text); return null; }
  }
  const ry = F.ax === 'z' ? (F.sg > 0 ? 0 : Math.PI) : (F.sg > 0 ? Math.PI / 2 : -Math.PI / 2), off = F.at + F.sg * (o.out || AR_SIGN_OFF);
  return arText(g, Object.assign({}, o, F.ax === 'z' ? { x: u, z: off } : { x: off, z: u }, { y, ry }));
}

let arSaved = null;
// the pieces, built once (the first match) and kept for the next
function arBuild() {
  const g = new THREE.Group(); g.userData.still = true;
  const x0 = cxw(ARENA.x0) - 0.5, x1 = cxw(ARENA.x1) + 0.5, z0 = cxw(ARENA.z0) - 0.5, z1 = cxw(ARENA.z1) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat(lam(0xffffff, { map: arFloorTex() }), 'concrete', [x0, z0, x1, z1]));   // (the pack's concrete in it: world/floors.js)
  fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  arTextures(); arSkins = new Map(); AR_SIGN_BAD.length = 0;
  withSeed(4242, () => {
    const parts = [], did = new Set(); arP = g; arParts = parts;
    for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) {
      const k = AR_KIND(i, j), x = cxw(i), z = cxw(j);
      if (k === '#') arWall(parts, i, j, x, z);
      else if (k === 'h') arBlock(parts, i, j, x, z);
      else if (k === 'b') arBarrier(parts, i, j, x, z);
      else if (k === 's') arBags(parts, i, j, x, z, AR_KIND(i, j - 1) === 's' || AR_KIND(i, j + 1) === 's');
      else if (k === 'r') arSpool(parts, x, z);
      else if (k === 'k') arCrates(parts, x, z);
      else if (k === 'o') arDrums(parts, x, z);
      else if (k === 'C' && !did.has(idx(i, j))) arContainer(parts, g, i, j, did);
    }
    for (const R of AR_BLDG) arBldg(parts, g, R);
    arFrame(parts);
    arWagons(parts);
    arGates(parts, g);
    arFlood(parts, g);
    arFence(parts, g);
    arSigns(g);
    arOutside(parts, g);
    arWoods(g); arWallKit(parts);
    arSkinsOut(g);
    arDress(g, AR_YARD4);
    mergeInto(g, parts);
    arP = arParts = null;
  });
  if (AR_SIGN_BAD.length) console.warn('arena: signs that would hang off their walls, left out:', AR_SIGN_BAD.join(', '));
  return g;
}
// (the pieces of whatever's being built go on arP, the arena's group, and into arParts to be folded into a few meshes)
let arP = null, arParts = null;
const arPush = (parts, m) => { if (!m.parent) arP.add(m); arParts.push(m); return m; };
const box2 = (w, h, d, mat, x, y, z) => box(arP, w, h, d, mat, x, y, z);
// a precast panel of the outer wall, its face toward the yard (or a corner's post), its top capped, a seam down it every
// other panel and grime washed down its foot
// (on the two sides toward the camera from above, east and south, the panels stand only waist high with chain-link
// over them to the same height, so nothing near them is lost behind them: AR_LOW_WALL, and arFence)
// (and on the other two, north and west, only 2 m, chain-link over them too: AR_MID_WALL, so the yard never feels walled in
// and you see out to the terminal and the sky over the top)
// (the seam and the grime each stand their own distance proud of the panel, never in one plane, so neither flickers
// through the other; a corner's cap stands a little higher than the caps either side, so their tops never overlap in
// one plane)
const AR_LOW_WALL = 1.05, AR_MID_WALL = 2;
const arLowSide = (i, j) => i === ARENA.x1 || j === ARENA.z1;
// the gates, one in the outer wall behind each spawn yard where the trucks came in (plan rows; west and east columns):
// steel, chained shut, the same solid wall as the panels they stand in for
const AR_GATE = { r0: 18, r1: 23 };
const arGateAt = (i, j) => (i === ARENA.x0 || i === ARENA.x1) && j - ARENA.z0 >= AR_GATE.r0 && j - ARENA.z0 <= AR_GATE.r1;
function arWall(parts, i, j, x, z) {
  const edgeX = i === ARENA.x0 || i === ARENA.x1, edgeZ = j === ARENA.z0 || j === ARENA.z1, H = arLowSide(i, j) ? AR_LOW_WALL : AR_MID_WALL, corner = edgeX && edgeZ;
  if (arGateAt(i, j)) { const sg = i === ARENA.x0 ? 1 : -1; arPush(parts, box2(0.98, H - 0.01, 1, AR_M.gateDk, x - sg * 0.01, (H - 0.01) / 2, z)); return; }   // (the gate's leaf over its face and top: arGates)
  arPush(parts, box2(1, H, 1, rand() < 0.15 ? AR_M.wallDk : AR_M.wall, x, H / 2, z));
  const cy = corner ? 0.15 : 0.12;
  arPush(parts, box2(edgeX ? 1.08 : 1, cy, edgeZ && !edgeX ? 1.08 : corner ? 1.08 : 1, AR_M.cap, x, H + cy / 2, z));
  if ((edgeX ? j : i) % 2 === 0 && !corner && !arGateAt(i, j + 1)) {   // (a seam between panels, on the yard side)
    const nx = i === ARENA.x0 ? 1 : i === ARENA.x1 ? -1 : 0, nz = j === ARENA.z0 ? 1 : j === ARENA.z1 ? -1 : 0;
    if (!arTallH(i + nx + (nz ? 1 : 0), j + nz + (nx ? 1 : 0)) && !arTallH(i + nx, j + nz)) arPush(parts, box2(nx ? 0.024 : 0.05, H - 0.1, nz ? 0.024 : 0.05, AR_M.stain, x + nx * 0.5 + (nz ? 0.5 : 0), H / 2, z + nz * 0.5 + (nx ? 0.5 : 0)));
    if (!arTallH(i + nx, j + nz)) arPush(parts, box2(nx ? 0.008 : 0.9, 0.45, nz ? 0.008 : 0.9, AR_M.stain, x + nx * 0.5, 0.22, z + nz * 0.5));
  }
}
// the block walls: concrete blockwork (arTextures: cmu) on every face nothing stands against. The warehouse's (the
// north lane and its south wall) broken off just over head height where it burned, rubble and rebar along their tops;
// the rest, the spawn yards' walls, finished with a precast coping; the weighbridge booths and the signal box roofed
// (arBldg). Never lower than they stand in the plan (AR_H.h), so a round, a look or a splash of blood on one stops where it shows
const AR_BLDG = [[18, 16, 19, 17], [22, 16, 23, 17], [18, 24, 19, 25], [22, 24, 23, 25], [19, 34, 22, 37]];   // (plan [c0, r0, c1, r1]: the weighbridge's booths and the signal box)
const arBldgOf = (i, j) => AR_BLDG.find(R => i - ARENA.x0 >= R[0] && i - ARENA.x0 <= R[2] && j - ARENA.z0 >= R[1] && j - ARENA.z0 <= R[3]);
function arBlock(parts, i, j, x, z) {
  const H = AR_H.h, ruin = j - ARENA.z0 <= 12, S = AR_TX.cmu;
  if (arBldgOf(i, j)) { arSkinBlock(S, i, j, i, j, 0, H, false); return; }
  if (ruin) {
    arSkinBlock(S, i, j, i, j, 0, H, true);
    if (rand() < 0.6) { const w = rr(0.3, 0.6), d = rr(0.3, 0.6); arPush(parts, box2(w, rr(0.1, 0.28), d, AR_M.hut, x + rr(-0.5 + w / 2, 0.5 - w / 2), H + 0.05, z + rr(-0.5 + d / 2, 0.5 - d / 2))); }
    for (let n = 0; n < 2; n++) if (rand() < 0.7) { const r = arPush(parts, box2(0.025, rr(0.2, 0.5), 0.025, AR_M.rebar, x + rr(-0.35, 0.35), H + 0.18, z + rr(-0.35, 0.35))); r.rotation.set(rr(-0.4, 0.4), 0, rr(-0.4, 0.4)); }
    return;
  }
  arSkinBlock(S, i, j, i, j, 0, H - 0.04, false);
  const clr = [arTallH(i - 1, j) < H, arTallH(i + 1, j) < H, arTallH(i, j - 1) < H, arTallH(i, j + 1) < H];
  arSlab(parts, i, j, i, j, H - 0.04, H + 0.04, 0.025, AR_M.cap, clr);
}
// a weighbridge booth or the signal box: blockwork under a concrete roof slab, a door, its windows boarded over (so
// they read as wall, never as a way to see through); the box with a nameplate and a signal mast over its roof
function arBldg(parts, g, R) {
  const [c0, r0, c1, r1] = R, i0 = ARENA.x0 + c0, j0 = ARENA.z0 + r0, i1 = ARENA.x0 + c1, j1 = ARENA.z0 + r1, H = AR_H.h, sig = c1 - c0 > 1;
  arSlab(parts, i0, j0, i1, j1, H, H + 0.13, sig ? 0.1 : 0.06, AR_M.cap, arClear(i0, j0, i1, j1, H));
  const mx = (cxw(i0) + cxw(i1)) / 2, mz = (cxw(j0) + cxw(j1)) / 2;
  const door = (F, u) => { arOn(parts, F, u, 1.0, 1.04, 2.0, 0.03, AR_M.hutDk); arOn(parts, F, u, 0.98, 0.9, 1.94, 0.04, AR_M.door, 0.01); arOn(parts, F, u + 0.32, 1.0, 0.04, 0.16, 0.05, AR_M.pole, 0.03); };
  const boards = (F, u, y, w, h) => { arOn(parts, F, u, y, w + 0.12, h + 0.12, 0.02, AR_M.hutDk); for (let n = 0; n < 3; n++) { const p = arOn(parts, F, u + rr(-0.04, 0.04), y - h / 2 + (n + 0.5) * h / 3, w + rr(0.02, 0.12), h / 3 - 0.03, 0.025, n % 2 ? AR_M.plyDk : AR_M.ply, 0.03); if (F.ax === 'z') p.rotation.z = rr(-0.05, 0.05); else p.rotation.x = rr(-0.05, 0.05); } };
  if (!sig) {   // (a booth: its door on its side away from the bridge, its window looking onto it)
    const north = r0 < 20, toBridge = north ? 's' : 'n', away = north ? 'n' : 's', side = c0 < 20 ? 'w' : 'e';
    const Fa = arF(c0, north ? r0 : r1, away), Fb = arF(c0, north ? r1 : r0, toBridge);
    door(Fa, mx + (c0 < 20 ? -0.35 : 0.35));
    boards(Fb, mx, 1.35, 1.1, 0.7);
    arSign(g, arF(side === 'w' ? c0 : c1, r0, side), 0.5, 1.62, { text: 'WEIGHBRIDGE', w: 1.5, h: 0.3, col: 'rgba(30,30,28,0.92)', bg: 'rgba(214,206,186,0.95)', edge: 'rgba(30,30,28,0.8)', wear: 60 });
    return;
  }
  // the signal box: its door north (onto the stacks), its windows along each siding boarded, an END OF SIDING board under each
  door(arF(c0 + 1, r0, 'n'), mx - 0.3);
  arSign(g, arF(c0 + 1, r0, 'n'), 1.6, 1.55, { text: 'YARD 4\nSIGNAL BOX', w: 1.3, h: 0.4, col: 'rgba(236,232,220,0.95)', bg: 'rgba(122,40,32,0.95)', wear: 40 });
  for (const [sd, c] of [['w', c0], ['e', c1]]) { const F = arF(c, r0 + 2, sd); boards(F, mz - 0.5, 1.4, 1.6, 0.7); arSign(g, arF(c, AR_YARD.rail[0][0], sd), 0, 0.75, { text: 'END OF\nSIDING', w: 0.8, h: 0.6, col: 'rgba(250,246,236,0.95)', bg: 'rgba(170,40,30,0.95)', edge: 'rgba(250,246,236,0.9)', wear: 50 }); }
  // the mast: a lattice pole up off its roof, a colour-light head each way along the sidings, the landmark down the rail spur
  const top = 5.2, base = H + 0.13;
  arPush(parts, box2(0.14, top - base, 0.14, AR_M.sigBk, mx, (base + top) / 2, mz));
  for (const sg of [-1, 1]) {
    arPush(parts, box2(0.08, 0.95, 0.42, AR_M.sigBk, mx + sg * 0.11, top - 0.55, mz));
    for (const [y, mat] of [[top - 0.3, AR_M.sigR], [top - 0.62, AR_M.sigG]]) { const l = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mat)); l.rotation.z = Math.PI / 2; l.position.set(mx + sg * 0.165, y, mz); arPush(parts, box2(0.12, 0.05, 0.24, AR_M.sigBk, mx + sg * 0.2, y + 0.12, mz)); }
  }
  arPush(parts, box2(0.5, 0.06, 0.5, AR_M.sigBk, mx, top + 0.03, mz));
}
// the warehouse's steel frame, what's left standing of it over the broken walls: I-section columns up out of the walls
// at each bay, and the eaves beam along the north and the two ends (none along its south side, on the camera's side from
// above), knee braces at the columns' heads
const AR_FRAME = { cols: [6, 11, 16], row: [0, 12], top: 5.4 };
function arFrame(parts) {
  const F = AR_FRAME, T = F.top, cs = [...F.cols, ...F.cols.map(c => 41 - c)], x0 = cxw(ARENA.x0), x1 = cxw(ARENA.x1), zN = cxw(ARENA.z0), zS = cxw(ARENA.z0 + F.row[1]);
  // (an I-section: two flanges across the wall's line and the web between them, its faces never in one plane)
  const col = (x, z, y0, rot) => { const h = T - y0, y = (y0 + T) / 2; arPush(parts, rot ? box2(0.03, h, 0.18, AR_M.steel, x, y, z) : box2(0.18, h, 0.03, AR_M.steel, x, y, z)); for (const s of [-1, 1]) arPush(parts, rot ? box2(0.24, h, 0.03, AR_M.steel, x, y, z + s * 0.105) : box2(0.03, h, 0.24, AR_M.steel, x + s * 0.105, y, z)); };
  for (const c of cs) { const x = cxw(ARENA.x0 + c); col(x, zN, AR_MID_WALL + 0.12, false); col(x, zS, AR_H.h, false); }
  for (const r of [0, 6, 12]) { const z = cxw(ARENA.z0 + r); col(x0, z, AR_MID_WALL + 0.15, true); col(x1, z, AR_LOW_WALL + 0.15, true); }
  // the eaves: along the north wall, and down the west end to the south wall's line (not the east: the camera's side)
  arPush(parts, box2(x1 - x0 + 0.3, 0.32, 0.18, AR_M.steel, (x0 + x1) / 2, T + 0.16, zN));
  for (const x of [x0]) arPush(parts, box2(0.18, 0.32, zS - zN - 0.3, AR_M.steel, x, T + 0.16, (zN + zS) / 2));
  // (knee braces off the north columns, up under the eaves)
  for (const c of cs) { const x = cxw(ARENA.x0 + c); const b = arPush(parts, box2(0.08, 0.9, 0.08, AR_M.steel, x, T - 0.4, zN + 0.32)); b.rotation.x = -0.75; }
}
// the train left on the first siding (AR_YARD.rail[1]: the containers standing on it are its wagons' loads): under each
// wagon's ends a bogie each side, its two wheels on the rails, and the couplers between, so it reads as a train stopped
// where it was, not containers on the ground (all within the containers' own cells)
function arWagons(parts) {
  const row = AR_YARD.rail[1][0], j0 = ARENA.z0 + Math.floor(row), z = cxw(j0) + 0.5, M = AR_M.contDk;
  for (let i = ARENA.x0; i <= ARENA.x1; i++) {
    if (AR_KIND(i, j0) !== 'C' || AR_KIND(i - 1, j0) === 'C') continue;
    let i1 = i; while (AR_KIND(i1 + 1, j0) === 'C') i1++;
    const x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5;
    for (const x of [x0 + 0.9, x1 - 0.9]) for (const sg of [-1, 1]) {
      arPush(parts, box2(1.5, 0.16, 0.06, M, x, 0.42, z + sg * 1.03));
      for (const dx of [-0.48, 0.48]) { const w = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), AR_M.pole)); w.rotation.x = Math.PI / 2; w.position.set(x + dx, 0.33, z + sg * 1.04); w.castShadow = true; }
    }
    for (const [x, sg] of [[x0, 1], [x1, -1]]) arPush(parts, box2(0.06, 0.2, 0.5, M, x + sg * 0.04, 0.75, z));
  }
}
// a jersey barrier, laid along whichever way its run goes, a band of warning paint along each side of its top and the
// drainage slots along its foot
function arBarrier(parts, i, j, x, z) {
  const along = AR_KIND(i, j - 1) === 'b' || AR_KIND(i, j + 1) === 'b' ? 'z' : 'x', H = AR_H.b, aZ = along === 'z';
  const w = aZ ? [0.62, 0.98] : [0.98, 0.62], top = aZ ? [0.2, 0.98] : [0.98, 0.2];
  arPush(parts, box2(w[0], 0.35, w[1], AR_M.barrier, x, 0.175, z));
  arPush(parts, box2((w[0] + top[0]) / 2, H - 0.55, (w[1] + top[1]) / 2, AR_M.barrier, x, 0.35 + (H - 0.55) / 2, z));
  arPush(parts, box2(top[0], 0.2, top[1], AR_M.barrierDk, x, H - 0.1, z));
  for (const s of [-1, 1]) {
    arPush(parts, box2(aZ ? 0.012 : 0.9, 0.08, aZ ? 0.9 : 0.012, AR_M.stripe, x + (aZ ? s * 0.106 : 0), H - 0.09, z + (aZ ? 0 : s * 0.106)));
    arPush(parts, box2(aZ ? 0.012 : 0.26, 0.08, aZ ? 0.26 : 0.012, AR_M.slot, x + (aZ ? s * 0.316 : 0), 0.06, z + (aZ ? 0 : s * 0.316)));
  }
  cellBox[idx(i, j)] = aZ ? [x - 0.32, z - 0.5, x + 0.32, z + 0.5] : [x - 0.5, z - 0.32, x + 0.5, z + 0.32];
}
// a sandbag wall: rows of bags laid like bricks, three to a metre, each a little off, every other row's bags over the
// joints below (one across each joint between cells, laid by the cell before it), so no two bags share a face to flicker
function arBags(parts, i, j, x, z, alongZ) {
  cellBox[idx(i, j)] = alongZ ? [x - 0.28, z - 0.5, x + 0.28, z + 0.5] : [x - 0.5, z - 0.28, x + 0.5, z + 0.28];
  const next = alongZ ? AR_KIND(i, j + 1) === 's' : AR_KIND(i + 1, j) === 's';
  for (let r = 0; r < 5; r++) for (const o of r % 2 ? (next ? [-1 / 6, 1 / 6, 0.5] : [-1 / 6, 1 / 6]) : [-1 / 3, 0, 1 / 3]) {
    const m = arPush(parts, box2(alongZ ? 0.5 : 0.315, 0.2, alongZ ? 0.315 : 0.5, rand() < 0.3 ? AR_M.bagDk : AR_M.bag, x + (alongZ ? rr(-0.02, 0.02) : o), 0.1 + r * 0.207 + rr(-0.004, 0.004), z + (alongZ ? o : rr(-0.02, 0.02))));
    m.rotation.y = rr(-0.04, 0.04);
  }
}
// a cable spool on its side: two wooden flanges and the drum of black cable between them
function arSpool(parts, x, z) {
  for (const o of [-0.38, 0.38]) { const f = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 16), AR_M.crate)); f.rotation.z = Math.PI / 2; f.position.set(x + o, 0.55, z); f.castShadow = f.receiveShadow = true; }
  const d = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 14), AR_M.contDk)); d.rotation.z = Math.PI / 2; d.position.set(x, 0.55, z); d.castShadow = d.receiveShadow = true;
  arFoot(x, z, 0.42, 0.55, 0.42, 0.55);
}
// (a prop's footprint, as its model stands, for what walks into it and what a round hits: world/collision.js cellBox,
// not the whole cell; out from its middle, -x, -z, +x, +z)
const arFoot = (x, z, a, b, c, d) => { cellBox[idx(ci(x), ci(z))] = [x - a, z - b, x + c, z + d]; };
// a pallet of stock left on the warehouse floor: the pallet, two layers of cartons on it (one gone from the top), the
// bottom layer still in its shrink-wrap
function arCrates(parts, x, z) {
  // (waist high, AR_H.k: vaulted over and seen over)
  for (const o of [-0.4, 0, 0.4]) arPush(parts, box2(0.1, 0.1, 0.96, AR_M.crateDk, x + o, 0.05, z));
  for (let n = 0; n < 6; n++) arPush(parts, box2(0.96, 0.025, 0.12, AR_M.crate, x, 0.1125, z - 0.42 + n * 0.168));
  const turn = rand() < 0.5, miss = (rand() * 4) | 0;
  for (let l = 0; l < 2; l++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    if (l === 1 && a * 2 + b === miss) continue;
    const cx2 = x + (a - 0.5) * 0.46, cz2 = z + (b - 0.5) * 0.46, y = 0.125 + l * 0.42 + 0.2;
    arPush(parts, box2(0.44, 0.4, 0.44, (a + b + l) % 2 ? AR_M.carton : AR_M.cartonDk, cx2 + (l ? rr(-0.01, 0.01) : 0), y, cz2 + (l ? rr(-0.01, 0.01) : 0)));
    if (l === 0) arPush(parts, box2(turn ? 0.05 : 0.452, 0.012, turn ? 0.452 : 0.05, AR_M.crateDk, cx2, y + 0.206, cz2));   // (the strapping over the wrap)
  }
  arPush(parts, box2(0.94, 0.36, 0.94, AR_M.wrap, x, 0.125 + 0.2, z));   // (the wrap, round the bottom layer)
  arFoot(x, z, 0.48, 0.48, 0.48, 0.48);
}
// a pair of drums, one blue, one rusted, their rolling hoops and a bung in each lid
function arDrums(parts, x, z) {
  [[-0.2, -0.15, AR_M.drumA], [0.24, 0.2, AR_M.drumB]].forEach(([ox, oz, mat]) => {
    const d = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.9, 14), mat)); d.position.set(x + ox, 0.45, z + oz); d.castShadow = d.receiveShadow = true;
    for (const y of [0.3, 0.6, 0.885]) { const r = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.302, 0.302, 0.03, 14, 1, true), AR_M.drumRim)); r.position.set(x + ox, y, z + oz); r.castShadow = true; }
    const b = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), AR_M.drumRim)); b.position.set(x + ox + 0.14, 0.91, z + oz);
  });
  arFoot(x, z, 0.5, 0.45, 0.54, 0.5);
}
// what stands on each run of C cells in the plan (each a true rectangle of them, never more than 12 m long: a longer
// run is two end to end), by its shape: a run one cell deep is the wall of stacked concrete blocks between the plaza and
// the rail spur; the six by three against the warehouse's north wall the yard office; the two by two against the south
// wall the floodlights' transformer; the rest shipping containers. All of them stand the plan's whole cells, so two
// side by side, or one against a wall, meet with no hairline of sky between them
function arContainer(parts, g, i, j, did) {
  let i1 = i, j1 = j; while (AR_KIND(i1 + 1, j) === 'C' && !did.has(idx(i1 + 1, j)) && i1 - i < 11) i1++;
  for (;;) { const nj = j1 + 1; let ok = j1 - j < 11; for (let a = i; a <= i1 && ok; a++) if (AR_KIND(a, nj) !== 'C' || did.has(idx(a, nj))) ok = false; if (!ok) break; j1 = nj; }
  for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) did.add(idx(a, b));
  const nx = i1 - i + 1, nz = j1 - j + 1;
  if (Math.min(nx, nz) === 1) return arLego(parts, i, j, i1, j1);
  if (nx === 6 && nz === 3) return arOffice(parts, g, i, j, i1, j1);
  if (nx === 2 && nz === 2) return arKiosk(parts, g, i, j, i1, j1);
  arBox(parts, g, i, j, i1, j1);
}
// a shipping container: corrugated sides (arTextures: cont) in its own colour, its frame (corner posts, top and bottom
// rails, corner castings) standing proud of them only where nothing stands against it, its doors at whichever end is
// clear, with their locking bars, and its owner's code by its top corner
const AR_CODES = ['KSLU 204417 2', 'TRAU 551930 8', 'NHVU 330218 4', 'KSLU 118562 0', 'TRAU 902144 6', 'NHVU 471305 1', 'KSLU 760093 3', 'TRAU 284716 9'];
const AR_LINES = ['TRANSATLAS', 'NORDHAVN', 'KESSLER LINE', 'TRANSATLAS'];
let arContN = 1;   // (each container its own colour, in turn)
function arBox(parts, g, i, j, i1, j1) {
  const x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5, z0 = cxw(j) - 0.5, z1 = cxw(j1) + 0.5, H = AR_H.C, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, Wd = alongX ? z1 - z0 : x1 - x0, n = arContN++, S = AR_TX.cont[n % 4], mat = AR_M.cont[n % 4];
  const clr = arClear(i, j, i1, j1, 0.01), P = 0.016, F = 0.13;   // (P: how far the frame stands proud of a clear side; F: its members' size)
  arSkinBlock(S, i, j, i1, j1, F, H - F, false);
  arFace(S, 'y', 1, H - 0.03, x0, x1, z0, z1);   // (its roof, between the top rails)
  // the frame: rails along the top and the foot of every side, between the corner posts
  const out = k => clr[k] ? P : -0.01;
  const rail = (y) => {
    arPush(parts, box2(x1 - x0 - 2 * F, F, F + out(2), mat, cx, y, z0 + (F - out(2)) / 2)); arPush(parts, box2(x1 - x0 - 2 * F, F, F + out(3), mat, cx, y, z1 - (F - out(3)) / 2));
    arPush(parts, box2(F + out(0), F, z1 - z0 - 2 * F, mat, x0 + (F - out(0)) / 2, y, cz)); arPush(parts, box2(F + out(1), F, z1 - z0 - 2 * F, mat, x1 - (F - out(1)) / 2, y, cz));
  };
  rail(H - F / 2); rail(F / 2);
  for (const [sx, kx] of [[x0, 0], [x1, 1]]) for (const [sz, kz] of [[z0, 2], [z1, 3]]) {
    const ox = out(kx) + 0.004, oz = out(kz) + 0.004, dx = kx ? -1 : 1, dz = kz ? -1 : 1;
    arPush(parts, box2(F + ox, H - 2 * F - 0.004, F + oz, mat, sx + dx * (F - ox) / 2, H / 2, sz + dz * (F - oz) / 2));
    for (const y of [F / 2, H - F / 2]) arPush(parts, box2(F + ox + 0.006, F + 0.008, F + oz + 0.006, AR_M.contDk, sx + dx * (F - ox - 0.006) / 2, y + (y > 1 ? 0.004 : 0), sz + dz * (F - oz - 0.006) / 2));   // (the corner castings)
  }
  // its doors, at whichever end's clear (the far end first): the seam between the leaves, four locking bars, their handles
  const ends = alongX ? [[1, x1], [0, x0]] : [[3, z1], [2, z0]], de = ends.find(e => clr[e[0]]);
  if (de) {
    const sg = de[0] % 2 ? 1 : -1, at = de[1] + sg * P;
    const on = (u, y, w, h, d, m) => arPush(parts, alongX ? box2(d, h, w, m, at + sg * d / 2, y, cz + u) : box2(w, h, d, m, cx + u, y, at + sg * d / 2));
    on(0, H / 2, 0.03, H - 2 * F, 0.01, AR_M.contDk);
    for (const u of [-0.75, -0.25, 0.25, 0.75].map(v => v * Wd / 2)) { on(u, H / 2, 0.045, H - 2 * F - 0.1, 0.045, AR_M.contDk); on(u + 0.07, 1.1, 0.14, 0.05, 0.06, AR_M.contDk); }
  }
  // its owner's code up by a top corner, and the line's name along a long side, on each clear side
  for (const k of alongX ? [2, 3] : [0, 1]) {
    if (!clr[k]) continue;
    const sg = k % 2 ? 1 : -1, ry = alongX ? (sg > 0 ? 0 : Math.PI) : (sg > 0 ? Math.PI / 2 : -Math.PI / 2), fp = (alongX ? (sg > 0 ? z1 : z0) : (sg > 0 ? x1 : x0)) + sg * (P + AR_SIGN_OFF), u = alongX ? cx : cz;
    const at = (du, y, o) => arText(g, Object.assign({ y, ry, wear: 90 }, o, alongX ? { x: u + du * sg, z: fp } : { x: fp, z: u - du * sg }));
    at(L / 2 - F - 0.75, H - 0.38, { text: AR_CODES[n % AR_CODES.length], w: 1.2, h: 0.2, col: 'rgba(240,238,230,0.9)' });
    if (L >= 6) at(0, 1.45, { text: AR_LINES[n % AR_LINES.length], w: Math.min(5, L * 0.62), h: 0.7, col: 'rgba(240,238,230,0.78)', font: '900 _px "Archivo", sans-serif', wear: 300 });
  }
}
// the wall of stacked interlocking concrete blocks between the plaza and the rail spur: three courses (arTextures: lego)
// and the blocks' studs along its top
function arLego(parts, i, j, i1, j1) {
  const H = AR_H.C; arSkinBlock(AR_TX.lego, i, j, i1, j1, 0, H, true);
  const alongX = i1 > i, a0 = alongX ? cxw(i) - 0.5 : cxw(j) - 0.5, a1 = alongX ? cxw(i1) + 0.5 : cxw(j1) + 0.5, c = alongX ? cxw(j) : cxw(i);
  for (let s = Math.ceil((a0 - 0.4) / 0.8) * 0.8 + 0.4; s < a1 - 0.2; s += 0.8) { const st = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 12), AR_M.lego)); st.position.set(alongX ? s : c, H + 0.04, alongX ? c : s); st.castShadow = true; }
}
// the yard office: a portable cabin on its skids against the warehouse's north wall, flat steel panels (arTextures:
// panel), its windows behind security grilles with the blinds down, its door and nameplate, an air-conditioner on its
// roof, a floodlight's mast up off it
function arOffice(parts, g, i, j, i1, j1) {
  const H = AR_H.C, x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5, z1 = cxw(j1) + 0.5, cx = (x0 + x1) / 2, cz = (cxw(j) + cxw(j1)) / 2;
  arSkinBlock(AR_TX.panelDk, i, j, i1, j1, 0, 0.2, false); arSkinBlock(AR_TX.panel, i, j, i1, j1, 0.2, H - 0.1, false);
  arSlab(parts, i, j, i1, j1, H - 0.1, H, 0.035, AR_M.officeDk, arClear(i, j, i1, j1, H));
  const Fs = { ax: 'z', sg: 1, at: z1 }, on = (u, y, w, h, d, m, o = 0) => arOn(parts, Fs, u, y, w, h, d, m, o);
  for (const u of [cx - 1.9, cx + 1.9]) {   // (the windows, either side of the door)
    on(u, 1.45, 1.3, 1.0, 0.03, AR_M.officeDk); on(u, 1.45, 1.18, 0.88, 0.012, AR_M.glass, 0.03);
    for (let y = 1.07; y < 1.85; y += 0.09) on(u, y, 1.16, 0.035, 0.012, AR_M.office, 0.034);   // (the blinds, down)
    for (let s = -0.5; s <= 0.51; s += 0.125) on(u + s, 1.45, 0.02, 0.96, 0.02, AR_M.grille, 0.05);
    on(u, 1.94, 1.3, 0.025, 0.04, AR_M.grille, 0.05); on(u, 0.96, 1.3, 0.025, 0.04, AR_M.grille, 0.05);
  }
  on(cx, 1.12, 1.02, 2.04, 0.03, AR_M.officeDk); on(cx, 1.12, 0.9, 1.96, 0.02, AR_M.door, 0.03); on(cx + 0.33, 1.1, 0.04, 0.18, 0.06, AR_M.pole, 0.05);
  arText(g, { text: 'YARD OFFICE', x: cx, y: 2.3, z: z1 + AR_SIGN_OFF, w: 1.5, h: 0.26, col: 'rgba(240,236,224,0.95)', bg: 'rgba(36,74,112,0.95)', wear: 30 });
  arText(g, { text: 'ALL VISITORS\nREPORT HERE', x: cx - 0.95, y: 1.95, z: z1 + AR_SIGN_OFF, w: 0.42, h: 0.3, col: 'rgba(30,30,30,0.95)', bg: 'rgba(236,232,220,0.95)', wear: 20 });
  for (const [x, sg] of [[x0, -1], [x1, 1]]) arText(g, { text: 'SITE RULES\nPPE AT ALL TIMES\nNO SMOKING', x: x + sg * AR_SIGN_OFF, y: 1.45, z: cz + 0.4, ry: sg * Math.PI / 2, w: 0.7, h: 0.55, col: 'rgba(30,30,30,0.95)', bg: 'rgba(236,232,220,0.95)', edge: 'rgba(40,90,150,0.9)', wear: 30 });
  arPush(parts, box2(1.0, 0.55, 0.7, AR_M.office, cx + 1.6, H + 0.275, cz - 0.2)); arPush(parts, box2(0.86, 0.04, 0.56, AR_M.grille, cx + 1.6, H + 0.57, cz - 0.2));
  const vp = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), AR_M.officeDk)); vp.position.set(cx - 2.2, H + 0.3, cz - 0.6);
}
// the transformer that fed the floodlights: a green steel kiosk on a concrete plinth, louvred double doors, its warning
// sign and its number
function arKiosk(parts, g, i, j, i1, j1) {
  const H = AR_H.C, clr = arClear(i, j, i1, j1, H), x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5, z0 = cxw(j) - 0.5, cx = (x0 + x1) / 2;
  arSlab(parts, i, j, i1, j1, 0, 0.16, 0.04, AR_M.plinth, clr);
  arPush(parts, box2(x1 - x0, H - 0.26, cxw(j1) + 0.5 - z0, AR_M.kiosk, cx, 0.16 + (H - 0.26) / 2, (z0 + cxw(j1) + 0.5) / 2));
  arSlab(parts, i, j, i1, j1, H - 0.1, H, 0.05, AR_M.kioskDk, clr);
  const F = { ax: 'z', sg: -1, at: z0 };
  for (const s of [-1, 1]) {
    const u = cx + s * 0.46; arOn(parts, F, u, 1.18, 0.84, 1.9, 0.02, AR_M.kioskDk);
    for (let y = 0.4; y < 2.0; y += 0.12) { const l = arOn(parts, F, u, y, 0.66, 0.05, 0.03, AR_M.kiosk, 0.02); l.rotation.x = -0.5; }
    arOn(parts, F, cx + s * 0.08, 1.15, 0.04, 0.2, 0.05, AR_M.pole, 0.02);
  }
  arText(g, { text: 'DANGER\n11 000 V', x: cx + 0.46, y: 2.2, z: z0 - 0.02 - AR_SIGN_OFF, ry: Math.PI, w: 0.5, h: 0.42, col: 'rgba(20,20,20,0.95)', bg: 'rgba(222,186,40,0.96)', edge: 'rgba(20,20,20,0.9)', wear: 20 });
  arText(g, { text: 'SUB 4/2', x: x1 + AR_SIGN_OFF, y: 2.1, z: (z0 + cxw(j1) + 0.5) / 2, ry: Math.PI / 2, w: 0.6, h: 0.18, col: 'rgba(240,238,230,0.9)', wear: 30 });
}
// the gates, behind each spawn yard: steel, a frame of hollow section round a corrugated leaf (arTextures: gate), the
// track it slid on, chained and padlocked shut. In the same cells, as solid and as tall as the panels either side
function arGates(parts, g) {
  for (const i of [ARENA.x0, ARENA.x1]) {
    const sg = i === ARENA.x0 ? 1 : -1, face = cxw(i) + sg * 0.5, j0 = ARENA.z0 + AR_GATE.r0, j1 = ARENA.z0 + AR_GATE.r1, a = cxw(j0) - 0.5, b = cxw(j1) + 0.5, H = arLowSide(i, j0) ? AR_LOW_WALL : AR_MID_WALL;
    arFace(AR_TX.gate, 'x', sg, face, a, b, 0.06, H - 0.06);
    arFace(AR_TX.gate, 'y', 1, H, a, b, cxw(i) - 0.5, cxw(i) + 0.5);
    const bar = (z, y, w, h, d = 0.08) => arPush(parts, box2(d, h, w, AR_M.gate, face + sg * (d / 2 - 0.01), y, z));
    bar((a + b) / 2, H - 0.035, b - a, 0.08); bar((a + b) / 2, 0.05, b - a, 0.1); bar((a + b) / 2, H / 2, b - a - 0.16, 0.06, 0.05);
    for (let z = a + 0.04; z <= b; z += (b - a - 0.08) / 3) bar(z, H / 2, 0.08, H - 0.12, 0.07);
    for (const [z, y] of [[(a + b) / 2 - 0.15, H * 0.5], [(a + b) / 2 + 0.15, H * 0.5]]) { const c = arPush(parts, box2(0.03, 0.3, 0.03, AR_M.chain, face + sg * 0.09, y, z)); c.rotation.x = 0.6 * Math.sign(z - (a + b) / 2); }
    arPush(parts, box2(0.06, 0.09, 0.07, AR_M.drumB, face + sg * 0.1, H * 0.5 - 0.14, (a + b) / 2));   // (the padlock)
    arText(g, { text: sg > 0 ? 'WEST GATE · KEEP CLEAR' : 'EAST GATE · KEEP CLEAR', x: face + sg * (0.06 + AR_SIGN_OFF), y: H > 1.5 ? 1.55 : 0.68, z: (a + b) / 2 - 1.4 * sg, ry: sg * Math.PI / 2, w: 2.3, h: H > 1.5 ? 0.3 : 0.26, col: 'rgba(30,30,28,0.95)', bg: 'rgba(214,180,60,0.95)', wear: 70 });
  }
}
// the chain-link over the outer walls, on all four sides: galvanised posts every two metres with a rail along their tops, and the mesh
// between them (a diamond weave, seen through)
function arFence(parts, g) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(150,156,160,1)'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(96, 64); x.moveTo(96, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(-32, 64); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const top = AR_H['#'] - 0.5, xE = cxw(ARENA.x1), zS = cxw(ARENA.z1), x0 = cxw(ARENA.x0), z0 = cxw(ARENA.z0);
  [[x0, zS, xE, zS, AR_LOW_WALL], [xE, z0, xE, zS, AR_LOW_WALL], [x0, z0, xE, z0, AR_MID_WALL], [x0, z0, x0, zS, AR_MID_WALL]].forEach(([ax, az, bx, bz, wallH]) => {
    const h = top - wallH;
    const L = Math.hypot(bx - ax, bz - az), m = lam(0xffffff, { map: t.clone(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.map.repeat.set(L * 3, h * 3); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, h), m); p.position.set((ax + bx) / 2, wallH + h / 2, (az + bz) / 2); p.rotation.y = az === bz ? 0 : Math.PI / 2; p.castShadow = true; g.add(p);
    for (let s = 0; s <= L + 0.01; s += 2) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L; const q = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.1, 8), AR_M.pole)); q.position.set(px, wallH + h / 2, pz); q.castShadow = true; }
    arPush(parts, box2(az === bz ? L : 0.05, 0.05, az === bz ? 0.05 : L, AR_M.pole, (ax + bx) / 2, top, (az + bz) / 2));
  });
}
// what's painted and stencilled on the yard's walls, each checked to sit whole on its wall (arSign): the warehouse's
// bay numbers along its north wall (a callout for each stretch of it), its safety signs, the sidings' names on the
// block wall over the rail spur, a tag or two in the spawn yards
function arSigns(g) {
  const st = { col: 'rgba(222,212,186,0.8)', wear: 220 }, plate = (t, bg, col) => ({ text: t, bg, col, wear: 40 });
  [['BAY 1', 3.5], ['BAY 2', 13.5], ['BAY 3', 27.5], ['BAY 4', 37.5]].forEach(([t, c]) => arSign(g, arF(Math.floor(c), 0, 's'), c % 1, 1.05, Object.assign({ text: t, w: 1.7, h: 0.75 }, st)));
  arSign(g, arF(16, 0, 's'), 0.2, 1.3, Object.assign(plate('NO SMOKING\nNO NAKED FLAMES', 'rgba(240,238,232,0.96)', 'rgba(190,40,30,0.95)'), { w: 0.75, h: 0.5, edge: 'rgba(190,40,30,0.9)' }));
  arSign(g, arF(25, 0, 's'), -0.2, 1.3, Object.assign(plate('HIGH LOAD\nKEEP CLEAR', 'rgba(214,180,60,0.96)', 'rgba(25,25,22,0.95)'), { w: 0.75, h: 0.5, edge: 'rgba(25,25,22,0.9)' }));
  arSign(g, arF(0, 17, 'e'), 0, 1.0, { text: 'ROT', w: 1.6, h: 0.9, col: 'rgba(160,210,90,0.8)', font: 'italic 900 _px "Archivo", sans-serif', wear: 120 });
  arSign(g, arF(8, 12, 's'), 0, 1.2, { text: 'EVAC  ✗', w: 2.6, h: 0.7, col: 'rgba(200,40,30,0.8)', font: 'italic 900 _px "Archivo", sans-serif', wear: 140 });
  arSign(g, arF(33, 12, 's'), 0, 1.25, Object.assign(plate('NO ENTRY\nAUTHORISED\nVEHICLES ONLY', 'rgba(240,238,232,0.96)', 'rgba(190,40,30,0.95)'), { w: 0.7, h: 0.6, edge: 'rgba(190,40,30,0.9)' }));
}
// ---- outside the walls: the rest of the terminal. On the two sides away from the camera from above (north and west)
// the tall things, a warehouse with its roller doors and the terminal's name along its front, containers stacked three
// high under a gantry crane and two high along the west, a light tower; on the camera's sides only what's low, so
// nothing stands between it and the yard: a rail line with a flatcar on it, pallets, a forklift, a line of barriers. All
// on a worn asphalt apron round the yard's pad (never under it, to flicker through it), with the woods cleared back from
// it (arenaUp)
function arOutside(parts, g) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const t = c.getContext('2d'), rnd = seeded(5151);
  t.fillStyle = '#4b4a47'; t.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 3000; k++) { t.fillStyle = `rgba(${rnd() < 0.5 ? '30,30,28' : '110,108,100'},${0.05 + rnd() * 0.12})`; t.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3); }
  for (let k = 0; k < 14; k++) { t.strokeStyle = 'rgba(25,25,24,0.4)'; t.lineWidth = 1.5; t.beginPath(); let a = rnd() * 512, b = rnd() * 512; t.moveTo(a, b); for (let q = 0; q < 8; q++) { a += (rnd() - 0.5) * 60; b += (rnd() - 0.5) * 60; t.lineTo(a, b); } t.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(0.1, 0.1);
  // (the apron as one shape with the pad cut out of it: its texture laid on in metres, so it runs on round the hole)
  const px0 = cxw(ARENA.x0) - 0.5, px1 = cxw(ARENA.x1) + 0.5, pz0 = cxw(ARENA.z0) - 0.5, pz1 = cxw(ARENA.z1) + 0.5, O = AR_OUT;
  const sh = new THREE.Shape([new THREE.Vector2(-O, -O - 0.5), new THREE.Vector2(O, -O - 0.5), new THREE.Vector2(O, O - 0.5), new THREE.Vector2(-O, O - 0.5)]);
  sh.holes.push(new THREE.Path([new THREE.Vector2(px0, -pz0), new THREE.Vector2(px0, -pz1), new THREE.Vector2(px1, -pz1), new THREE.Vector2(px1, -pz0)]));
  const ap = new THREE.Mesh(new THREE.ShapeGeometry(sh), floorMat(lam(0xffffff, { map: tx }), 'asphalt')); ap.rotation.x = -Math.PI / 2; ap.position.y = 0.006; ap.receiveShadow = true; g.add(ap);
  // (each part laid out round a yard 24 m across, then shifted out past this one's walls: AR_SHIFT)
  let SX = 0, SZ = 0; const at = (dx, dz) => { SX = dx; SZ = dz; };
  const B = (w, h, d, m, x, y, z) => arPush(parts, box2(w, h, d, m, x + SX, y, z + SZ));
  const S = AR_SHIFT;
  const M = { wh: lam(0x7d8486), whDk: lam(0x5d6466), roof: lam(0x4a4f52), door: lam(0x9a9c94), crane: lam(0xd8a52a), craneDk: lam(0x4a4030), rail: lam(0x5a4e44), tie: lam(0x3c3027), steel: lam(0x6a6e70), yel: lam(0xc79b2b), pal: lam(0x9c8058), board: lam(0x23324a) };
  // the warehouse, north: its cladding's ribs, its roller doors (their slats inside their edges), the terminal's name
  // on a board along its front over them (a landmark over the yard's north wall)
  at(0, -S); { const x0 = -17, x1 = 5, z0 = -21, z1 = -14.5, H = 7;
    B(x1 - x0, H, z1 - z0, M.wh, (x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    for (let x = x0 + 0.4; x < x1; x += 0.6) B(0.12, H - 0.3, 0.06, M.whDk, x, H / 2, z1 + 0.02);   // (its cladding's ribs)
    B(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6, M.roof, (x0 + x1) / 2, H + 0.17, (z0 + z1) / 2);
    for (const dx of [-12, -5.5, 1]) { B(4.2, 4.6, 0.12, M.door, dx, 2.3, z1 + 0.1); for (let y = 0.3; y < 4.6; y += 0.25) B(4.14, 0.03, 0.12, M.whDk, dx, y, z1 + 0.12); B(4.6, 0.3, 0.3, M.yel, dx, 4.75, z1 + 0.15); }
    B(15, 1.3, 0.1, M.board, (x0 + x1) / 2, 5.85, z1 + 0.11);
    arText(g, { text: 'KESSLER FREIGHT  ·  YARD 4', x: (x0 + x1) / 2 + SX, y: 5.85, z: z1 + 0.16 + AR_SIGN_OFF + SZ, w: 14.4, h: 1.1, col: 'rgba(236,232,220,0.95)', font: '800 _px "Saira Extra Condensed", sans-serif', wear: 120 }); }
  // containers three high under the gantry crane, north-east of the yard
  const col = [AR_M.cont[0], AR_M.cont[1], AR_M.cont[2], AR_M.cont[3], lam(0x6b2f3a), lam(0x2f6060)];
  let ci2 = 0;
  at(S * 0.6, -S);
  for (let r = 0; r < 3; r++) for (let n = 0; n < 3; n++) for (let y = 0; y < 3 - (r === 2 && n === 1 ? 1 : 0); y++) { const m = col[(ci2++ * 5) % col.length]; B(6, 2.55, 2.4, m, 9 + n * 6.2, 1.3 + y * 2.6, -20 + r * 2.5); B(6.02, 0.1, 2.42, AR_M.contDk, 9 + n * 6.2, 0.06 + y * 2.6, -20 + r * 2.5); }
  { const H = 12.5; for (const x of [5.5, 25]) { for (const z of [-21.5, -12.6]) B(0.6, H, 0.6, M.crane, x, H / 2, z); B(0.6, 0.8, 9.5, M.crane, x, H - 0.4, -17); B(0.4, 0.4, 9.5, M.crane, x, 1.4, -17); }
    for (const z of [-21.5, -12.6]) B(20.2, 1.1, 0.8, M.crane, 15.25, H + 0.4, z);
    B(2.6, 1.6, 2.4, M.craneDk, 13, H + 1.2, -17); B(0.06, 5, 0.06, M.steel, 13, H - 2.6, -17); B(2.4, 0.3, 1.2, M.craneDk, 13, H - 5.2, -17); }
  // containers two high along the west
  at(-S, 0); for (let n = 4; n < 6; n++) for (let y = 0; y < 2; y++) { const m = col[(n * 3 + y) % col.length]; B(2.4, 2.55, 6, m, -17.5, 1.3 + y * 2.6, -9 + n * 6.3); B(2.42, 0.1, 6.02, AR_M.contDk, -17.5, 0.06 + y * 2.6, -9 + n * 6.3); }
  for (let n = 0; n < 4; n++) for (let y = 0; y < (n === 2 ? 1 : 2); y++) { const m = col[(n * 3 + y * 2 + 1) % col.length]; B(2.4, 2.55, 6, m, -17.5, 1.3 + y * 2.6, -9 + n * 6.3); B(2.42, 0.1, 6.02, AR_M.contDk, -17.5, 0.06 + y * 2.6, -9 + n * 6.3); }
  // a light tower, south-west, its four lamps
  at(-S, S); { const x = -18, z = 15, H = 14; const p = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, H, 10), AR_M.pole)); p.position.set(x + SX, H / 2, z + SZ); p.castShadow = true;
    B(2.2, 0.15, 0.6, AR_M.pole, x, H, z); for (const o of [-0.8, -0.27, 0.27, 0.8]) { B(0.45, 0.35, 0.2, AR_M.pole, x + o, H + 0.3, z + 0.1); box(g, 0.38, 0.28, 0.02, AR_M.lamp, x + o + SX, H + 0.3, z + 0.21 + SZ); } }
  // the camera's sides: a rail line south with a flatcar, pallets, a forklift; barriers along the east
  at(0, S); { const z = 16; for (const o of [-0.72, 0.72]) B(70, 0.14, 0.09, M.rail, 0, 0.07, z + o); for (let x = -35; x <= 35; x += 0.7) B(0.22, 0.08, 2.2, M.tie, x, 0.04, z);
    B(12, 0.4, 2.6, M.steel, 4, 1.0, z); B(12.1, 0.15, 2.7, M.craneDk, 4, 1.275, z); for (const x of [-0.5, 8.5]) for (const o of [-0.72, 0.72]) { const w = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), AR_M.contDk)); w.rotation.x = Math.PI / 2; w.position.set(x + SX, 0.42, z + o + SZ); } }
  for (const [x, z, n] of [[-8, 19, 3], [-6.4, 19.2, 2], [14, 15, 2], [16, 19, 4]]) for (let y = 0; y < n; y++) { B(1.2, 0.14, 1.0, M.pal, x, 0.07 + y * 0.15, z); }
  at(S, 0); { const x = 16.5, z = 7; B(1.3, 0.9, 2.3, M.yel, x, 0.75, z); B(1.2, 1.3, 1.1, M.craneDk, x, 1.8, z + 0.4); B(0.1, 2.4, 0.1, M.steel, x - 0.45, 1.5, z - 1.25); B(0.1, 2.4, 0.1, M.steel, x + 0.45, 1.5, z - 1.25); B(1.1, 0.06, 1.0, M.steel, x, 0.15, z - 1.75); }
  for (let z = -18; z <= 20; z += 2.2) { B(0.6, 0.35, 2, AR_M.barrier, 14.2, 0.18, z); B(0.25, 0.6, 2, AR_M.barrier, 14.2, 0.65, z); }
}
// ---- its own world past the apron: rough ground out to the horizon and the woods round it, its own (the farm and its
// woods are out of the scene while a map's up: arenaUp). Pines on a ring from just past the apron outwards, thicker
// further out, none on the camera's sides near in (south and east, AR_WOODS.clear) so from above nothing stands
// between the camera and the yard
const AR_WOODS = { n: 420, gap: 4, r1: 95, clear: 14 };   // (from AR_OUT + gap out)
function arWoods(g) {
  const tx = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const t = c.getContext('2d'); t.fillStyle = '#4f5238'; t.fillRect(0, 0, 256, 256); const r = seeded(91);
    for (let k = 0; k < 4000; k++) { t.fillStyle = `rgba(${r() < 0.5 ? '40,44,28' : '108,104,70'},${0.1 + r() * 0.25})`; t.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); }
    const tt = new THREE.CanvasTexture(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(30, 30); return tt; })();
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), lam(0xffffff, { map: tx })); gr.rotation.x = -Math.PI / 2; gr.position.y = -0.02; gr.receiveShadow = true; g.add(gr);
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.6, 6), cone = new THREE.ConeGeometry(1.6, 4.2, 7), cone2 = new THREE.ConeGeometry(1.15, 3, 7);
  const mT = lam(0x4a3a2a), mL = lam(0x2f4a2c), mL2 = lam(0x3b5a33);
  const iT = new THREE.InstancedMesh(trunk, mT, AR_WOODS.n), iA = new THREE.InstancedMesh(cone, mL, AR_WOODS.n), iB = new THREE.InstancedMesh(cone2, mL2, AR_WOODS.n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), rnd = seeded(4711), r0 = AR_OUT + AR_WOODS.gap;
  let n = 0;
  for (let k = 0; k < AR_WOODS.n * 4 && n < AR_WOODS.n; k++) {
    const x = (rnd() - 0.5) * 2 * AR_WOODS.r1, z = (rnd() - 0.5) * 2 * AR_WOODS.r1, d = Math.max(Math.abs(x), Math.abs(z - 0.5));
    if (d < r0 || (d < r0 + AR_WOODS.clear && (z > 0 || x > 0)) || rnd() > 0.35 + 0.65 * (d - r0) / (AR_WOODS.r1 - r0)) continue;
    const h = 0.8 + rnd() * 0.7; q.setFromAxisAngle(_arY, rnd() * 6.28); s.set(h, h, h);
    iT.setMatrixAt(n, m.compose(p.set(x, 0.8 * h, z), q, s)); iA.setMatrixAt(n, m.compose(p.set(x, (1.6 + 1.9) * h, z), q, s)); iB.setMatrixAt(n, m.compose(p.set(x, (1.6 + 3.6) * h, z), q, s)); n++;
  }
  for (const o of [iT, iA, iB]) { o.count = n; o.castShadow = true; o.receiveShadow = true; o.instanceMatrix.needsUpdate = true; g.add(o); }
}
const _arY = new V3(0, 1, 0);
// the yard's working life, on its walls and floor and never in the way: a conduit along the inside of the west and north
// walls, in runs between whatever stands against them (each run turning up into the wall under its cap at its ends, never
// running into a container or a block wall), a junction box on each run and a breaker cabinet with its warning sign,
// floor drains, a hose reel on the spawn yard's wall
function arWallKit(parts) {
  const M = { pipe: lam(0x6f6a5e), box: lam(0x8a8f86), cab: lam(0x5d6b5a), drain: lam(0x2e2f30), hose: lam(0x8a2f22) }, Y = 1.82;
  const xW = cxw(ARENA.x0) + 0.5, zN = cxw(ARENA.z0) + 0.5;
  // (the runs of open floor along a wall: plan cells from a to b, as [a, b])
  const runs = (n, open) => { const out = []; let a = -1; for (let k = 1; k <= n; k++) { const o = k < n && open(k); if (o && a < 0) a = k; if (!o && a >= 0) { out.push([a, k - 1]); a = -1; } } return out; };
  const n = ARENA.x1 - ARENA.x0;
  for (const [a, b] of runs(n, k => !arTallH(ARENA.x0 + k, ARENA.z0 + 1))) {
    const xa = cxw(ARENA.x0 + a) - 0.5 + 0.3, xb = cxw(ARENA.x0 + b) + 0.5 - 0.3;
    arPush(parts, box2(xb - xa, 0.06, 0.06, M.pipe, (xa + xb) / 2, Y, zN + 0.05));
    for (const x of [xa, xb]) arPush(parts, box2(0.06, AR_MID_WALL - Y, 0.06, M.pipe, x, (Y + AR_MID_WALL) / 2, zN + 0.05));
    if (b - a >= 4) arPush(parts, box2(0.32, 0.3, 0.1, M.box, (xa + xb) / 2 + 0.6, Y, zN + 0.06));
  }
  for (const [a, b] of runs(ARENA.z1 - ARENA.z0, k => !arTallH(ARENA.x0 + 1, ARENA.z0 + k) && !arGateAt(ARENA.x0, ARENA.z0 + k))) {
    const za = cxw(ARENA.z0 + a) - 0.5 + 0.3, zb = cxw(ARENA.z0 + b) + 0.5 - 0.3;
    arPush(parts, box2(0.06, 0.06, zb - za, M.pipe, xW + 0.05, Y, (za + zb) / 2));
    for (const z of [za, zb]) arPush(parts, box2(0.06, AR_MID_WALL - Y, 0.06, M.pipe, xW + 0.05, (Y + AR_MID_WALL) / 2, z));
    if (b - a >= 4) arPush(parts, box2(0.1, 0.3, 0.32, M.box, xW + 0.06, Y, (za + zb) / 2 + 0.6));
  }
  // the breaker cabinet on the warehouse's north wall (BAY 1's stretch), the conduit dropping into it, its sign
  const cx = cxw(ARENA.x0 + 6) + 0.2;
  arPush(parts, box2(0.8, 1.2, 0.22, M.cab, cx, 0.85, zN + 0.11)); arPush(parts, box2(0.06, Y - 1.45, 0.06, M.pipe, cx, (Y + 1.45) / 2, zN + 0.05));
  arPush(parts, box2(0.03, 0.12, 0.04, M.pipe, cx + 0.3, 0.85, zN + 0.24));
  arText(arP, { text: 'DANGER\n415 V', x: cx, y: 1.2, z: zN + 0.22 + AR_SIGN_OFF, w: 0.34, h: 0.26, col: 'rgba(20,20,20,0.95)', bg: 'rgba(222,186,40,0.96)', wear: 10 });
  arPush(parts, box2(0.12, 0.5, 0.5, M.hose, xW + 0.06, 1.0, cxw(ARENA.z0 + 17)));   // (a hose reel, on the wall behind the west spawn)
  // drains in the floor where the pad falls (open cells only), as flat grates
  for (const [i, j] of [[5, 9], [36, 9], [5, 33], [36, 33], [20, 14], [21, 27]]) if (AR_KIND(ARENA.x0 + i, ARENA.z0 + j) === '.') arPush(parts, box2(0.55, 0.02, 0.55, M.drain, cxw(ARENA.x0 + i), 0.022, cxw(ARENA.z0 + j)));
}
// how far out the terminal's apron goes from the middle (m), and the woods cleared back to it; and how far each part of
// the terminal was moved out from where it stood round the old, smaller yard (m)
const AR_OUT = 35, AR_SHIFT = 13;
// where the floodlights stand: each corner and halfway along each wall (cells, just inside the wall)
// and four more round the middle, one up on each of the wall stubs at the flag ring's corners (AR_MID_LAMPS: their
// cells in the plan), so the fight for the flag isn't in the dark between the walls' lights
const AR_MID_LAMPS = [[19, 17], [22, 17], [19, 24], [22, 24]];
const AR_LAMPS = () => { const mi = Math.round((ARENA.x0 + ARENA.x1) / 2), mj = Math.round((ARENA.z0 + ARENA.z1) / 2); return [[ARENA.x0 + 1, ARENA.z0 + 1], [ARENA.x1 - 1, ARENA.z0 + 1], [ARENA.x0 + 1, ARENA.z1 - 1], [ARENA.x1 - 1, ARENA.z1 - 1], [mi, ARENA.z0 + 1], [mi, ARENA.z1 - 1], [ARENA.x0 + 1, mj], [ARENA.x1 - 1, mj], ...AR_MID_LAMPS.map(([i, j]) => [ARENA.x0 + i, ARENA.z0 + j])]; };
// a floodlight on its pole at each, its head tipped down into the yard; each one's flare (AR_YARD4.flares, put up with the
// arena: arenaUp) and its halo's look
// (the lamps' faces and halos lit only as far as they're on: dark grey glass by day, warm white at night)
const _arOff = new THREE.Color(0x4a4c4e), _arOn = new THREE.Color(0xfff1c8);
function arLampLit() { const k = LAMP_ON.k; AR_HALO.opacity = 0.8 * k; AR_M.lamp.color.copy(_arOff).lerp(_arOn, k); }
const AR_HALO = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,240,205,0.9)'); g.addColorStop(0.25, 'rgba(255,226,170,0.35)'); g.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
function arFlood(parts, g) {
  const mx = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2, mz = (cxw(ARENA.z0) + cxw(ARENA.z1)) / 2;
  for (const [i, j] of AR_LAMPS()) {
    const x = cxw(i) + (i === ARENA.x0 + 1 ? -0.42 : i === ARENA.x1 - 1 ? 0.42 : 0), z = cxw(j) + (j === ARENA.z0 + 1 ? -0.42 : j === ARENA.z1 - 1 ? 0.42 : 0), H = 5.2;
    const y0 = arTallH(ci(x), ci(z));   // (one stood on a booth's roof, or the office's, goes up from there)
    const p = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, H - y0, 8), AR_M.pole)); p.position.set(x, (H + y0) / 2, z); p.castShadow = true;
    const hd = new THREE.Group(); hd.position.set(x, H, z); hd.rotation.y = Math.atan2(mx - x, mz - z); hd.rotation.x = 0.5; g.add(hd);
    box(hd, 0.55, 0.32, 0.18, AR_M.pole, 0, 0, 0); const face = box(hd, 0.48, 0.26, 0.02, AR_M.lamp, 0, 0, 0.1); face.layers.enable(GLOW_LAYER);   // (its face blooms: effects/post.js)
    // (a soft halo round it, and a lens flare off it when it's in sight and shining your way: effects/post.js FLARE_SRC)
    const halo = new THREE.Sprite(AR_HALO); halo.scale.setScalar(1.6); halo.onBeforeRender = arLampLit; halo.position.set(0, 0, 0.14); halo.layers.enable(GLOW_LAYER); halo.userData.isFlash = true; hd.add(halo);
    hd.updateMatrixWorld(true); const fw = new THREE.Vector3(0, 0, 1).transformDirection(hd.matrixWorld), fp = new THREE.Vector3(0, 0, 0.12).applyMatrix4(hd.matrixWorld);
    AR_YARD4.flares.push({ x: fp.x, y: fp.y, z: fp.z, dx: fw.x, dy: fw.y, dz: fw.z, col: [1, 0.88, 0.7] });
  }
}
// the arena's lights in the light map: the floods, warm white, strongest as the dusk comes on
const AR_LIGHTS = () => AR_LAMPS().map(([i, j]) => ({ arena: true, x: cxw(i), z: cxw(j), r: 16, col: [1, 0.86, 0.66], int: 0.9 }));

// ---- up and down
// (what of the farm stays in the scene while a map's up: only the light, the sky and the air; its ground, its woods
// and its grass go with everything else, each map bringing its own)
const arKeep = o => o.isLight || o.type === 'Object3D' || o.isPoints || o.isSprite || o.renderOrder < -10 || (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.type === 'SphereGeometry' && !o.userData.still) || (o.frustumCulled === false && !o.isGroup && !o.isInstancedMesh && !(o.geometry && o.geometry.type === 'PlaneGeometry'));
export function arenaUp(id) {
  if (ARENA.on) return;
  arMapSet(id);
  ARENA.on = true;
  const M = AR_CUR, out = [];
  for (const o of FARM_ROOTS) if (o.parent === scene && !arKeep(o)) { scene.remove(o); out.push(o); }
  // and the house's outer wall pieces, built for each run's floor plan after all that (world/house.js WALL_FORMS)
  for (const w of WALL_FORMS.values()) if (w.g.parent === scene) { scene.remove(w.g); out.push(w.g); }   // (each a form: its group, w.g)
  // what the farm had in the grid, kept to put back
  arSaved = { out, cell: cell.slice(), open: openAt.slice(), box: cellBox.slice(), low: new Set(lowObst), top: new Map(obstTop), wX: wX.slice(), wZ: wZ.slice(), thinN: THIN.n, thinBox: THIN.box.slice(),
    openings: openings.slice(), doors: HOUSE_DOORS.list.slice(), doorKey: HOUSE_DOORS.key, lights: STATIC_LIGHTS.slice(), house: LMU.uHouse.value.clone() };
  openings.length = 0; HOUSE_DOORS.list.length = 0; HOUSE_DOORS.key = 'arena'; wX.fill(0); wZ.fill(0); THIN.n = 0;
  cell.fill(EMPTY); openAt.fill(null); cellBox.fill(null); lowObst.clear(); obstTop.clear(); obstUnder.clear(); SHOOT_THRU.clear();
  if (!M.g) M.g = arBuildMap(M);   // (the props' footprints go in as they're built: arCellBoxes keeps them for the next match)
  FLARE_SRC.length = 0; FLARE_SRC.push(...(M.flares || []));   // (the floodlights' lens flares: effects/post.js)
  for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) {
    const k = AR_KIND(i, j), c = idx(i, j);
    if (M.walls.includes(k)) cell[c] = WALL;
    else if (M.h[k]) { cell[c] = OBST; obstTop.set(c, M.h[k]); if (M.low.has(k)) lowObst.add(c); if (M.vault.has(k)) VAULT_LOW.add(c);  if ((M.thru || AR_THRU).includes(k)) SHOOT_THRU.add(c); if (M.under && M.under[k]) obstUnder.set(c, M.under[k]); }
  }
  TREE_HIDE.at = () => true;   // (and none of the woods the forests draw afresh each frame: world/tree-cull.js)
  arCellBoxes(M);
  scene.add(M.g);
  syncBlock();
  STATIC_LIGHTS.length = 0; STATIC_LIGHTS.push(...M.lights()); STATIC_LIGHTS.forEach(L => { L.field = lightField(L.x, L.z, L.r, null, true); });
  LMU.uHouse.value.set(-1e3, -1e3, -1e3, -1e3);   // (no roof keeping the clouds' shade off the middle)
  setLightsDirty(true); setVisKey(''); stillShadowsReset();
}
// a map's pieces, built the first time it's put up and kept: Yard 4's here (arBuild), the others' by their own
// builders (world/arena-mall.js), folded into a few meshes
function arBuildMap(M) {
  if (M === AR_YARD4) return arBuild();
  const g = new THREE.Group(); g.userData.still = true;
  withSeed(4243, () => { const parts = M.build(g); arDress(g, M); mergeInto(g, parts); });
  return g;
}
// (the props' footprints, as their meshes stand: they're built once, so put back every match)
function arCellBoxes(M) {
  if (!M.boxes) { M.boxes = []; for (let k = 0; k < cellBox.length; k++) if (cellBox[k]) M.boxes.push([k, cellBox[k]]); }
  for (const [k, b] of M.boxes) cellBox[k] = b;
}
export function arenaDown() {
  if (!ARENA.on) return;
  ARENA.on = false; VAULT_LOW.clear(); TREE_HIDE.at = null; FLARE_SRC.length = 0;
  scene.remove(AR_CUR.g);
  const s = arSaved; arSaved = null;
  s.out.forEach(o => scene.add(o));
  cell.set(s.cell); for (let k = 0; k < openAt.length; k++) openAt[k] = s.open[k]; for (let k = 0; k < cellBox.length; k++) cellBox[k] = s.box[k];
  lowObst.clear(); s.low.forEach(k => lowObst.add(k)); obstTop.clear(); s.top.forEach((v, k) => obstTop.set(k, v));
  wX.set(s.wX); wZ.set(s.wZ); THIN.n = s.thinN; THIN.box = s.thinBox; SHOOT_THRU.clear(); obstUnder.clear();
  openings.length = 0; openings.push(...s.openings); HOUSE_DOORS.list.length = 0; HOUSE_DOORS.list.push(...s.doors); HOUSE_DOORS.key = s.doorKey;
  STATIC_LIGHTS.length = 0; STATIC_LIGHTS.push(...s.lights); LMU.uHouse.value.copy(s.house);
  syncBlock(); setLightsDirty(true); setVisKey(''); stillShadowsReset();
}
// the spawn spot for a side (A, B or F) furthest from the enemies given ([x, z] each), a little off where it's marked
const RESPAWN_PICK = 0.75;
// the plan's kinds a round goes straight through (shelving: S on every map that has it), its boxes knocked off
const AR_THRU = 'S';
export function arenaSpawn(side, foes, n, seed) {
  const SP = AR_CUR.spawn.S, L = SP[side] || SP.F;
  let best = L[0], bd = -1;
  const yd = n !== undefined && side !== 'F' ? yardSpots(side, seed ?? 0, n) : null;
  if (yd) { const mid = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2; best = [yd[0], yd[1], Math.atan2(mid - yd[0], cxw(22) - yd[1])]; }   // (Showdown: anywhere in the yard, yardSpots)
  else if (n !== undefined && side !== 'F') best = L[n % L.length];
  // (the furthest from everyone, never one an enemy can see from where they stand: a spot in plain sight of one counts
  // for far less however far off it is)
  // (and in Deathmatch or coming back in a team game, not always the very furthest, so it isn't learned: any spot
  // nearly as far, RESPAWN_PICK of the furthest, unseen by them all, picked at random)
  else { const sc = L.map(s => { let d = 1e9, seen = false; for (const f of foes) { d = Math.min(d, Math.hypot(f[0] - s[0], f[1] - s[1])); if (!seen && los(f[0], f[1], s[0], s[1])) seen = true; } if (!foes.length) d = 50; return [s, seen ? d - 1000 : d]; });
    for (const e of sc) if (e[1] > bd) { bd = e[1]; best = e[0]; }
    const ok = sc.filter(e => e[1] >= 0 && e[1] >= bd * RESPAWN_PICK); if (ok.length) best = ok[Math.floor(rand() * ok.length)][0]; }
  return [best[0] + rr(-0.15, 0.15), best[1] + rr(-0.15, 0.15), best[2]];
}
