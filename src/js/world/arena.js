// The arena: the map the player-against-player mode is played on (pvp/pvp.js), built over where the farm stands for as
// long as a match goes on. An old freight yard in a clearing in the woods: a cast concrete pad with its expansion joints,
// oil stains and tyre marks, walled round with tall precast panels; four shipping containers down its sides and two
// across its middle, a roofless block hut in the very middle with a doorway in each wall, jersey barriers and sandbag
// walls at chest height to fight over, crate stacks and drums. Both halves are the same, so neither side's better off:
// west against east, a painted pad at each end for each side's spawn. Floodlights stand in its corners.
//
// While it's up, the farm's own pieces (the house, the yard, the fence, the stations: world/farm-set.js) are out of the
// scene and the grid (what's walked through, what stops a round and the eye, the light) is the arena's; when it comes
// down everything goes back as it was.

import { scene } from '../core/renderer.js';
import { rand, rr, seeded, withSeed } from '../core/math.js';
import { lam, LMU } from '../core/shaders.js';
import { box, mergeInto } from '../core/geometry.js';
import { cell, cxw, EMPTY, idx, OBST, openAt, WALL } from './grid.js';
import { cellBox, syncBlock } from './collision.js';
import { lowObst, obstTop } from './props.js';
import { THIN, wX, wZ } from './thin-walls.js';
import { openings } from './house.js';
import { HOUSE_DOORS } from './interior.js';
import { FARM_ROOTS } from './farm-set.js';
import { STATIC_LIGHTS } from '../lighting/static-lights.js';
import { lightField, los } from '../lighting/lightmap.js';
import { setVisKey } from '../lighting/vision.js';
import { stillShadowsReset } from '../core/still-shadows.js';
import { setLightsDirty } from '../barricades/planks.js';
import { TREE_HIDE } from './tree-cull.js';

// its bounds (cells, the walls round it included), the time of day it's always fought at (mid afternoon, the sun
// starting down and the shadows lengthening), and its plan, a row a line from north (j = z0) to south: # the outer wall, C a container,
// h the hut's walls, b a jersey barrier, s sandbags (vaulted over: VAULT_LOW), k a stack of crates, o a drum, r a cable
// spool; A and B each side's spawn, F the spots a free-for-all spawns from (on the floor)
export const ARENA = { on: false, x0: 1, x1: 42, z0: 1, z1: 42, tod: 15.6 };
const AR_PLAN = [
  '##########################################',
  '#........................................#',
  '#.k........CCCCCC..o..o..CCCCCC........k.#',
  '#...hh.hh..CCCCCC........CCCCCC..hh.hh...#',
  '#...h...h...F................F...h...h...#',
  '#.................k....k.................#',
  '#.F.h...h....sss..........sss....h...h.F.#',
  '#...hh.hh.........hh..hh.........hh.hh...#',
  '#..........b..................b..........#',
  '#.......o..b.....k......k.....b..o.......#',
  '#..........b..r............r..b..........#',
  '#........................................#',
  '#...CCCCCC..kCCCCCC....CCCCCCk..CCCCCC...#',
  '#...CCCCCC..hCCCCCC....CCCCCCh..CCCCCC...#',
  '#...hh..............................hh...#',
  '#.............b...o....o...b.............#',
  '#.............b............b.............#',
  '#....s..hh.hh......ssss......hh.hh..s....#',
  '#.AA.s..h...hF..............Fh...h..s.BB.#',
  '#.AA....h.h.h..k.s......s.k..h.h.h....BB.#',
  '#.AA.............s......s.............BB.#',
  '#.AA.............s......s.............BB.#',
  '#.AA....h.h.h..k.s......s.k..h.h.h....BB.#',
  '#.AA.s..h...h................h...h..s.BB.#',
  '#....s..hh.hh......ssss......hh.hh..s....#',
  '#.............b............b.............#',
  '#.............b...o....o...b.............#',
  '#..............hh........hh..............#',
  '#...CCCCC..hhCCCCC......CCCCChh..CCCCC...#',
  '#...CCCCC..k.CCCCC......CCCCC.k..CCCCC...#',
  '#.F....................................F.#',
  '#.....CC....bbb....k..k....bbb....CC.....#',
  '#..h..CC..........................CC..h..#',
  '#..h..CC..CCCCC............CCCCC..CC..h..#',
  '#.....CC..CCCCC....F..F....CCCCC..CC.....#',
  '#.....CC..........................CC.....#',
  '#............k..CC......CC..k............#',
  '#..sss....F.....CC......CC.....F....sss..#',
  '#........o..r...CC......CC...r..o........#',
  '#.k.............CC......CC.............k.#',
  '#........................................#',
  '##########################################'
];
// how tall each kind stands (m): what a round fired below it from your own eyes stops on (world/props.js: obstTop), and
// whether you see and shoot over it (low) or not
const AR_H = { '#': 3.2, C: 2.6, h: 2.7, b: 1.1, s: 1.15, k: 1.9, o: 1.05, r: 1.1 };
const AR_LOW = new Set(['b', 's', 'o', 'r']);
// the sandbag walls' cells, while the arena's up: hopped over like the farm's fence (player/vaulting.js)
export const VAULT_LOW = new Set();
// spawn spots by side, worked out from the plan: [x, z, facing]
const AR_SPAWN = { A: [], B: [], F: [] };
const AR_KIND = (i, j) => { const r = AR_PLAN[j - ARENA.z0]; return r ? r[i - ARENA.x0] || '#' : '#'; };
AR_PLAN.forEach((r, jj) => [...r].forEach((ch, ii) => {
  const x = cxw(ARENA.x0 + ii), z = cxw(ARENA.z0 + jj), mid = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2;
  if (ch === 'A' || ch === 'B' || ch === 'F') AR_SPAWN[ch].push([x, z, Math.atan2(mid - x, cxw(22) - z)]);   // (facing the middle)
}));

// ---- the look of it
const AR_M = {
  wall: lam(0x8e8a81), wallDk: lam(0x6d6a63), cap: lam(0x9d998f), stain: lam(0x5d5a52),
  hut: lam(0x9a9284), hutDk: lam(0x7a7266), rebar: lam(0x5b3a28),
  barrier: lam(0xb4ae9f), barrierDk: lam(0x8f897b), stripe: lam(0xc9a43a),
  bag: lam(0x8f7c55), bagDk: lam(0x75653f),
  crate: lam(0x7d5c38), crateDk: lam(0x5e432a),
  drumA: lam(0x2f4d68), drumB: lam(0x7a3b24), drumRim: lam(0x3a3a38),
  pole: lam(0x4a4b4c), lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  cont: [lam(0x8a3b2a), lam(0x355a78), lam(0x5d6643), lam(0x9b6a2c)], contDk: lam(0x2c2b29)
};
// the pad: concrete, its joints every 4 m, worn and stained, and each side's spawn painted on it in its colour
function arFloorTex() {
  const W = 1024, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d');
  const cw = ARENA.x1 - ARENA.x0 + 1, ch = ARENA.z1 - ARENA.z0 + 1, px = W / cw, pz = W / ch;
  x.fillStyle = '#8d8a83'; x.fillRect(0, 0, W, W);
  const rnd = seeded(7331);
  for (let k = 0; k < 2600; k++) { const r = 2 + rnd() * 26; x.fillStyle = `rgba(${rnd() < 0.5 ? '60,58,54' : '150,146,138'},${0.03 + rnd() * 0.06})`; x.beginPath(); x.arc(rnd() * W, rnd() * W, r, 0, 7); x.fill(); }
  for (let k = 0; k < 40; k++) { const r = 10 + rnd() * 60; const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(30,28,26,0.32)'); g.addColorStop(1, 'rgba(30,28,26,0)'); x.save(); x.translate(rnd() * W, rnd() * W); x.scale(1, 0.5 + rnd()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }   // oil
  for (let k = 0; k < 9; k++) { const r = 18 + rnd() * 50, g = x.createRadialGradient(0, 0, r * 0.4, 0, 0, r); g.addColorStop(0, 'rgba(52,58,62,0.55)'); g.addColorStop(1, 'rgba(52,58,62,0)'); x.save(); x.translate(rnd() * W, rnd() * W); x.scale(1.6, 0.7 + rnd() * 0.5); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore(); }   // wet patches, where the pad dips
  x.strokeStyle = 'rgba(40,38,34,0.16)'; x.lineWidth = 14;   // tyre marks, sweeping across
  for (let k = 0; k < 6; k++) { x.beginPath(); const y0 = rnd() * W; x.moveTo(-20, y0); x.bezierCurveTo(W * 0.3, y0 + (rnd() - 0.5) * 400, W * 0.7, y0 + (rnd() - 0.5) * 400, W + 20, y0 + (rnd() - 0.5) * 200); x.stroke(); }
  x.strokeStyle = 'rgba(48,46,42,0.55)'; x.lineWidth = 2.2;   // the joints
  for (let i = 4; i < cw; i += 4) { x.beginPath(); x.moveTo(i * px, 0); x.lineTo(i * px, W); x.stroke(); }
  for (let j = 4; j < ch; j += 4) { x.beginPath(); x.moveTo(0, j * pz); x.lineTo(W, j * pz); x.stroke(); }
  for (let k = 0; k < 90; k++) { x.strokeStyle = 'rgba(52,50,46,0.35)'; x.lineWidth = 1; x.beginPath(); let a = rnd() * W, b = rnd() * W; x.moveTo(a, b); for (let s = 0; s < 6; s++) { a += (rnd() - 0.5) * 40; b += (rnd() - 0.5) * 40; x.lineTo(a, b); } x.stroke(); }   // cracks
  // each side's pad: a hatched box in its colour, worn
  [['A', 'rgba(74,140,200,0.55)'], ['B', 'rgba(205,72,58,0.55)']].forEach(([s, col]) => {
    const cs = [...AR_PLAN].flatMap((r, j) => [...r].map((q, i) => q === s ? [i, j] : null)).filter(Boolean);
    const i0 = Math.min(...cs.map(c => c[0])) - 0.4, i1 = Math.max(...cs.map(c => c[0])) + 1.4, j0 = Math.min(...cs.map(c => c[1])) - 0.4, j1 = Math.max(...cs.map(c => c[1])) + 1.4;
    x.strokeStyle = col; x.lineWidth = 7; x.strokeRect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz);
    x.save(); x.beginPath(); x.rect(i0 * px, j0 * pz, (i1 - i0) * px, (j1 - j0) * pz); x.clip(); x.lineWidth = 4;
    for (let d = -W; d < W; d += 22) { x.beginPath(); x.moveTo(i0 * px + d, j0 * pz); x.lineTo(i0 * px + d + (j1 - j0) * pz, j1 * pz); x.stroke(); }
    x.restore();
  });
  // a yard number stencilled in the middle, half worn off
  x.save(); x.translate(W / 2, W / 2 - 3 * pz); x.fillStyle = 'rgba(210,200,170,0.22)'; x.font = '700 120px "Saira Extra Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('YARD 4', 0, 0); x.restore();
  for (let k = 0; k < 900; k++) { x.fillStyle = 'rgba(141,138,131,0.9)'; x.fillRect(rnd() * W, rnd() * W, 2 + rnd() * 5, 2 + rnd() * 5); }   // (the paint worn through)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

let arG = null, arSaved = null;
// the pieces, built once (the first match) and kept for the next
function arBuild() {
  const g = new THREE.Group(); g.userData.still = true;
  const x0 = cxw(ARENA.x0) - 0.5, x1 = cxw(ARENA.x1) + 0.5, z0 = cxw(ARENA.z0) - 0.5, z1 = cxw(ARENA.z1) + 0.5;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lam(0xffffff, { map: arFloorTex() }));
  fl.rotation.x = -Math.PI / 2; fl.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2); fl.receiveShadow = true; g.add(fl);
  withSeed(4242, () => {
    const parts = [], did = new Set(); arP = g; arParts = parts;
    for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) {
      const k = AR_KIND(i, j), x = cxw(i), z = cxw(j);
      if (k === '#') arWall(parts, i, j, x, z);
      else if (k === 'h') arHut(parts, i, j, x, z);
      else if (k === 'b') arBarrier(parts, i, j, x, z);
      else if (k === 's') arBags(parts, i, j, x, z, AR_KIND(i, j - 1) === 's' || AR_KIND(i, j + 1) === 's');
      else if (k === 'r') arSpool(parts, x, z);
      else if (k === 'k') arCrates(parts, x, z);
      else if (k === 'o') arDrums(parts, x, z);
      else if (k === 'C' && !did.has(idx(i, j))) arContainer(parts, i, j, did);
    }
    arFlood(parts, g);
    arFence(parts, g);
    arSigns(g);
    arOutside(parts, g);
    mergeInto(g, parts);
    arP = arParts = null;
  });
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
const AR_LOW_WALL = 1.05;
const arLowSide = (i, j) => i === ARENA.x1 || j === ARENA.z1;
function arWall(parts, i, j, x, z) {
  const edgeX = i === ARENA.x0 || i === ARENA.x1, edgeZ = j === ARENA.z0 || j === ARENA.z1, H = arLowSide(i, j) ? AR_LOW_WALL : AR_H['#'];
  arPush(parts, box2(1, H, 1, rand() < 0.15 ? AR_M.wallDk : AR_M.wall, x, H / 2, z));
  arPush(parts, box2(edgeX && edgeZ ? 1.08 : edgeX ? 1.08 : 1, 0.12, edgeZ && !edgeX ? 1.08 : edgeX && edgeZ ? 1.08 : 1, AR_M.cap, x, H + 0.06, z));
  if ((edgeX ? j : i) % 2 === 0 && !(edgeX && edgeZ)) {   // (a seam between panels, on the yard side)
    const nx = i === ARENA.x0 ? 1 : i === ARENA.x1 ? -1 : 0, nz = j === ARENA.z0 ? 1 : j === ARENA.z1 ? -1 : 0;
    arPush(parts, box2(nx ? 0.02 : 0.05, H - 0.1, nz ? 0.02 : 0.05, AR_M.stain, x + nx * 0.505 + (nz ? 0.5 : 0), H / 2, z + nz * 0.505 + (nx ? 0.5 : 0)));
    arPush(parts, box2(nx ? 0.02 : 0.9, 0.45, nz ? 0.02 : 0.9, AR_M.stain, x + nx * 0.505, 0.22, z + nz * 0.505));
  }
}
// the hut's walls: grey block, its top broken off ragged and rebar sticking out of it, never quite the same height
function arHut(parts, i, j, x, z) {
  const H = AR_H.h - rr(0, 0.45);
  arPush(parts, box2(1, H, 1, AR_M.hut, x, H / 2, z));
  for (let y = 0.4; y < H - 0.1; y += 0.4) arPush(parts, box2(1.006, 0.02, 1.006, AR_M.hutDk, x, y, z));   // (the courses)
  if (rand() < 0.6) arPush(parts, box2(rr(0.3, 0.6), rr(0.12, 0.3), rr(0.3, 0.6), AR_M.hut, x + rr(-0.2, 0.2), H + 0.08, z + rr(-0.2, 0.2)));
  for (let n = 0; n < 2; n++) if (rand() < 0.7) { const r = arPush(parts, box2(0.025, rr(0.2, 0.5), 0.025, AR_M.rebar, x + rr(-0.35, 0.35), H + 0.18, z + rr(-0.35, 0.35))); r.rotation.set(rr(-0.4, 0.4), 0, rr(-0.4, 0.4)); }
}
// a jersey barrier, laid along whichever way its run goes, with a stripe of warning paint along its top
function arBarrier(parts, i, j, x, z) {
  const along = AR_KIND(i, j - 1) === 'b' || AR_KIND(i, j + 1) === 'b' ? 'z' : 'x', H = AR_H.b;
  const w = along === 'z' ? [0.62, 0.98] : [0.98, 0.62], top = along === 'z' ? [0.2, 0.98] : [0.98, 0.2];
  arPush(parts, box2(w[0], 0.35, w[1], AR_M.barrier, x, 0.175, z));
  arPush(parts, box2((w[0] + top[0]) / 2, H - 0.55, (w[1] + top[1]) / 2, AR_M.barrier, x, 0.35 + (H - 0.55) / 2, z));
  arPush(parts, box2(top[0], 0.2, top[1], AR_M.barrierDk, x, H - 0.1, z));
  arPush(parts, box2(along === 'z' ? top[0] + 0.01 : 0.98, 0.05, along === 'z' ? 0.98 : top[1] + 0.01, AR_M.stripe, x, H - 0.03, z));
  cellBox[idx(i, j)] = along === 'z' ? [x - 0.32, z - 0.5, x + 0.32, z + 0.5] : [x - 0.5, z - 0.32, x + 0.5, z + 0.32];
}
// a sandbag wall: rows of bags laid like bricks, each a little off, the rows offset
function arBags(parts, i, j, x, z, alongZ) {
  cellBox[idx(i, j)] = alongZ ? [x - 0.28, z - 0.5, x + 0.28, z + 0.5] : [x - 0.5, z - 0.28, x + 0.5, z + 0.28];
  for (let r = 0; r < 5; r++) for (let n = 0; n < 3; n++) {
    const o = -0.36 + n * 0.36 + (r % 2 ? 0.18 : 0); if (Math.abs(o) > 0.5) continue;
    const m = arPush(parts, box2(alongZ ? 0.5 : 0.36, 0.2, alongZ ? 0.36 : 0.5, rand() < 0.3 ? AR_M.bagDk : AR_M.bag, x + (alongZ ? rr(-0.03, 0.03) : o), 0.1 + r * 0.21, z + (alongZ ? o : rr(-0.03, 0.03))));
    m.rotation.y = rr(-0.08, 0.08);
  }
}
// a cable spool on its side: two wooden flanges and the drum of black cable between them
function arSpool(parts, x, z) {
  for (const o of [-0.38, 0.38]) { const f = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 16), AR_M.crate)); f.rotation.z = Math.PI / 2; f.position.set(x + o, 0.55, z); f.castShadow = f.receiveShadow = true; }
  const d = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 14), AR_M.contDk)); d.rotation.z = Math.PI / 2; d.position.set(x, 0.55, z); d.castShadow = d.receiveShadow = true;
}
// two crates stacked, the top one turned a little, their slats and corner boards darker
function arCrates(parts, x, z) {
  [[0.95, 0, 0], [0.82, 0.95, rr(-0.3, 0.3)]].forEach(([s, y, a]) => {
    const c = arPush(parts, box2(s, s, s, AR_M.crate, x, y + s / 2, z)); c.rotation.y = a;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = arPush(parts, box2(0.06, s + 0.005, 0.06, AR_M.crateDk, x + sx * (s / 2 - 0.02), y + s / 2, z + sz * (s / 2 - 0.02))); p.rotation.y = a; }
  });
}
// a pair of drums, one blue, one rusted, with their rims
function arDrums(parts, x, z) {
  [[-0.2, -0.15, AR_M.drumA], [0.24, 0.2, AR_M.drumB]].forEach(([ox, oz, mat]) => {
    const d = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.9, 14), mat)); d.position.set(x + ox, 0.45, z + oz); d.castShadow = d.receiveShadow = true;
    for (const y of [0.3, 0.6, 0.9]) { const r = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), AR_M.drumRim)); r.position.set(x + ox, y, z + oz); r.castShadow = true; }
  });
}
// a container: its run of C cells (along x or z) as one box, ribbed down its long sides, its doors at one end with
// their locking bars, a coat of colour each
function arContainer(parts, i, j, did) {
  let i1 = i, j1 = j; while (AR_KIND(i1 + 1, j) === 'C') i1++; while (AR_KIND(i, j1 + 1) === 'C') j1++;
  for (let b = j; b <= j1; b++) for (let a = i; a <= i1; a++) did.add(idx(a, b));
  const x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5, z0 = cxw(j) - 0.5, z1 = cxw(j1) + 0.5, H = AR_H.C, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, Wd = alongX ? z1 - z0 : x1 - x0, mat = AR_M.cont[arContN++ % AR_M.cont.length];
  arPush(parts, box2(alongX ? L : Wd - 0.06, H, alongX ? Wd - 0.06 : L, mat, cx, H / 2, cz));
  for (let s = -L / 2 + 0.15; s < L / 2 - 0.1; s += 0.3) for (const sd of [-1, 1]) {   // the ribs
    const off = sd * (Wd / 2 - 0.02);
    arPush(parts, box2(alongX ? 0.1 : 0.04, H - 0.2, alongX ? 0.04 : 0.1, mat, alongX ? cx + s : cx + off, H / 2, alongX ? cz + off : cz + s));
  }
  for (const y of [0.06, H - 0.06]) arPush(parts, box2(alongX ? L + 0.02 : Wd, 0.12, alongX ? Wd : L + 0.02, AR_M.contDk, cx, y, cz));   // its rails
  const ex = alongX ? x1 + 0.005 : cx, ez = alongX ? cz : z1 + 0.005;   // the door end
  for (const o of [-0.3, 0.3]) for (const p of [-0.55, 0.55]) arPush(parts, box2(alongX ? 0.04 : 0.04, H - 0.3, alongX ? 0.04 : 0.04, AR_M.contDk, alongX ? ex : cx + p + o * 0.3, H / 2, alongX ? cz + p + o * 0.3 : ez));
}
let arContN = 1;   // (each container its own colour, in turn)
// the chain-link over the low walls: galvanised posts every two metres with a rail along their tops, and the mesh
// between them (a diamond weave, seen through)
function arFence(parts, g) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(150,156,160,1)'; x.lineWidth = 5; x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.moveTo(-32, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(96, 64); x.moveTo(96, 0); x.lineTo(32, 64); x.moveTo(32, 0); x.lineTo(-32, 64); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const top = AR_H['#'] - 0.5, h = top - AR_LOW_WALL, xE = cxw(ARENA.x1), zS = cxw(ARENA.z1), x0 = cxw(ARENA.x0), z0 = cxw(ARENA.z0);
  [[x0, zS, xE, zS], [xE, z0, xE, zS]].forEach(([ax, az, bx, bz]) => {
    const L = Math.hypot(bx - ax, bz - az), m = lam(0xffffff, { map: t.clone(), transparent: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.map.repeat.set(L * 3, h * 3); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, h), m); p.position.set((ax + bx) / 2, AR_LOW_WALL + h / 2, (az + bz) / 2); p.rotation.y = az === bz ? 0 : Math.PI / 2; p.castShadow = true; g.add(p);
    for (let s = 0; s <= L + 0.01; s += 2) { const px = ax + (bx - ax) * s / L, pz = az + (bz - az) * s / L; const q = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.1, 8), AR_M.pole)); q.position.set(px, AR_LOW_WALL + h / 2, pz); q.castShadow = true; }
    arPush(parts, box2(az === bz ? L : 0.05, 0.05, az === bz ? 0.05 : L, AR_M.pole, (ax + bx) / 2, top, (az + bz) / 2));
  });
}
// what's painted and sprayed on it: the yard's name and its warnings stencilled on the walls, a tag or two, arrows to
// each side's end, a container's number
function arSigns(g) {
  const sign = (text, w, h, col, font, x, y, z, ry, bg) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const t = c.getContext('2d');
    if (bg) { t.fillStyle = bg; t.fillRect(0, 0, c.width, c.height); }
    t.fillStyle = col; t.font = font; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText(text, c.width / 2, c.height / 2 + 4);
    for (let k = 0; k < 260; k++) { t.clearRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 6, 2 + Math.random() * 4); }   // (worn)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam(0xffffff, { map: new THREE.CanvasTexture(c), transparent: true, alphaTest: 0.2 }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  };
  const xW = cxw(ARENA.x0) + 0.505, zN = cxw(ARENA.z0) + 0.505, mid = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2;
  sign('YARD 4', 3.4, 1.1, 'rgba(222,212,186,0.85)', '700 150px "Saira Extra Condensed", sans-serif', mid, 2.2, zN, 0);
  sign('NO SMOKING · NO ENTRY', 3.2, 0.5, 'rgba(196,58,40,0.9)', '700 64px "Saira Extra Condensed", sans-serif', mid - 6, 1.3, zN, 0);
  sign('◄ WEST GATE', 2.4, 0.5, 'rgba(95,180,232,0.85)', '700 70px "Saira Extra Condensed", sans-serif', xW, 1.5, mid - 3, Math.PI / 2);
  sign('ROT', 1.6, 0.9, 'rgba(160,210,90,0.8)', 'italic 900 170px "Archivo", sans-serif', xW, 1.1, mid + 4.5, Math.PI / 2);
  sign('KESSLER 77', 2.8, 0.7, 'rgba(240,240,236,0.7)', 'italic 900 120px "Archivo", sans-serif', mid + 5.5, 1.4, zN, 0);
  sign('HIGH LOAD — KEEP CLEAR', 3, 0.45, 'rgba(20,20,18,0.85)', '700 60px "Saira Extra Condensed", sans-serif', mid - 5.5, 2.6, zN, 0, 'rgba(201,164,58,0.9)');
}
// ---- outside the walls: the rest of the terminal. On the two sides away from the camera from above (north and west)
// the tall things, a warehouse with its roller doors, containers stacked three high under a gantry crane and two high
// along the west, a light tower; on the camera's sides only what's low, so nothing stands between it and the yard: a
// rail line with a flatcar on it, pallets, a forklift, a line of barriers. All on a worn asphalt apron, with the woods
// cleared back from it (arenaUp)
function arOutside(parts, g) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const t = c.getContext('2d');
  t.fillStyle = '#4b4a47'; t.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 3000; k++) { t.fillStyle = `rgba(${Math.random() < 0.5 ? '30,30,28' : '110,108,100'},${0.05 + Math.random() * 0.12})`; t.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  for (let k = 0; k < 14; k++) { t.strokeStyle = 'rgba(25,25,24,0.4)'; t.lineWidth = 1.5; t.beginPath(); let a = Math.random() * 512, b = Math.random() * 512; t.moveTo(a, b); for (let q = 0; q < 8; q++) { a += (Math.random() - 0.5) * 60; b += (Math.random() - 0.5) * 60; t.lineTo(a, b); } t.stroke(); }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(7, 7);
  const ap = new THREE.Mesh(new THREE.PlaneGeometry(AR_OUT * 2, AR_OUT * 2), lam(0xffffff, { map: tx })); ap.rotation.x = -Math.PI / 2; ap.position.set(0, 0.006, 0.5); ap.receiveShadow = true; g.add(ap);
  // (each part laid out round a yard 24 m across, then shifted out past this one's walls: AR_SHIFT)
  let SX = 0, SZ = 0; const at = (dx, dz) => { SX = dx; SZ = dz; };
  const B = (w, h, d, m, x, y, z) => arPush(parts, box2(w, h, d, m, x + SX, y, z + SZ));
  const S = AR_SHIFT;
  const M = { wh: lam(0x7d8486), whDk: lam(0x5d6466), roof: lam(0x4a4f52), door: lam(0x9a9c94), crane: lam(0xd8a52a), craneDk: lam(0x4a4030), rail: lam(0x5a4e44), tie: lam(0x3c3027), steel: lam(0x6a6e70), yel: lam(0xc79b2b), pal: lam(0x9c8058) };
  // the warehouse, north
  at(0, -S); { const x0 = -17, x1 = 5, z0 = -21, z1 = -14.5, H = 7;
    B(x1 - x0, H, z1 - z0, M.wh, (x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    for (let x = x0 + 0.4; x < x1; x += 0.6) B(0.12, H - 0.3, 0.06, M.whDk, x, H / 2, z1 + 0.02);   // (its cladding's ribs)
    B(x1 - x0 + 0.6, 0.35, z1 - z0 + 0.6, M.roof, (x0 + x1) / 2, H + 0.17, (z0 + z1) / 2);
    for (const dx of [-12, -5.5, 1]) { B(4.2, 4.6, 0.12, M.door, dx, 2.3, z1 + 0.1); for (let y = 0.3; y < 4.6; y += 0.25) B(4.2, 0.03, 0.14, M.whDk, dx, y, z1 + 0.11); B(4.6, 0.3, 0.3, M.yel, dx, 4.75, z1 + 0.15); } }
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
    B(12, 0.4, 2.6, M.steel, 4, 1.0, z); B(12, 0.15, 2.7, M.craneDk, 4, 1.25, z); for (const x of [-0.5, 8.5]) for (const o of [-0.72, 0.72]) { const w = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), AR_M.contDk)); w.rotation.x = Math.PI / 2; w.position.set(x + SX, 0.42, z + o + SZ); } }
  for (const [x, z, n] of [[-8, 19, 3], [-6.4, 19.2, 2], [14, 15, 2], [16, 19, 4]]) for (let y = 0; y < n; y++) { B(1.2, 0.14, 1.0, M.pal, x, 0.07 + y * 0.15, z); }
  at(S, 0); { const x = 16.5, z = 7; B(1.3, 0.9, 2.3, M.yel, x, 0.75, z); B(1.2, 1.3, 1.1, M.craneDk, x, 1.8, z + 0.4); B(0.1, 2.4, 0.1, M.steel, x - 0.45, 1.5, z - 1.25); B(0.1, 2.4, 0.1, M.steel, x + 0.45, 1.5, z - 1.25); B(1.1, 0.06, 1.0, M.steel, x, 0.15, z - 1.75); }
  for (let z = -18; z <= 20; z += 2.2) { B(0.6, 0.35, 2, AR_M.barrier, 14.2, 0.18, z); B(0.25, 0.6, 2, AR_M.barrier, 14.2, 0.65, z); }
}
// how far out the terminal's apron goes from the middle (m), and the woods cleared back to it; and how far each part of
// the terminal was moved out from where it stood round the old, smaller yard (m)
const AR_OUT = 35, AR_SHIFT = 13;
// where the floodlights stand: each corner and halfway along each wall (cells, just inside the wall)
const AR_LAMPS = () => { const mi = Math.round((ARENA.x0 + ARENA.x1) / 2), mj = Math.round((ARENA.z0 + ARENA.z1) / 2); return [[ARENA.x0 + 1, ARENA.z0 + 1], [ARENA.x1 - 1, ARENA.z0 + 1], [ARENA.x0 + 1, ARENA.z1 - 1], [ARENA.x1 - 1, ARENA.z1 - 1], [mi, ARENA.z0 + 1], [mi, ARENA.z1 - 1], [ARENA.x0 + 1, mj], [ARENA.x1 - 1, mj]]; };
// a floodlight on its pole at each, its head tipped down into the yard
function arFlood(parts, g) {
  const mx = (cxw(ARENA.x0) + cxw(ARENA.x1)) / 2, mz = (cxw(ARENA.z0) + cxw(ARENA.z1)) / 2;
  for (const [i, j] of AR_LAMPS()) {
    const x = cxw(i) + (i === ARENA.x0 + 1 ? -0.42 : i === ARENA.x1 - 1 ? 0.42 : 0), z = cxw(j) + (j === ARENA.z0 + 1 ? -0.42 : j === ARENA.z1 - 1 ? 0.42 : 0), H = 5.2;
    const p = arPush(parts, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, H, 8), AR_M.pole)); p.position.set(x, H / 2, z); p.castShadow = true;
    const hd = new THREE.Group(); hd.position.set(x, H, z); hd.rotation.y = Math.atan2(mx - x, mz - z); hd.rotation.x = 0.5; g.add(hd);
    box(hd, 0.55, 0.32, 0.18, AR_M.pole, 0, 0, 0); box(hd, 0.48, 0.26, 0.02, AR_M.lamp, 0, 0, 0.1);
  }
}
// the arena's lights in the light map: the floods, warm white, strongest as the dusk comes on
const AR_LIGHTS = () => AR_LAMPS().map(([i, j]) => ({ arena: true, x: cxw(i), z: cxw(j), r: 16, col: [1, 0.86, 0.66], int: 0.9 }));

// ---- up and down
export function arenaUp() {
  if (ARENA.on) return;
  ARENA.on = true;
  // the farm's pieces out of the scene (all but the ground under it, the sky, the woods and the air), and its grass
  const out = [];
  for (const o of FARM_ROOTS) {
    if (o.parent !== scene) continue;
    const keep = o.isLight || o.isPoints || o.isSprite || o.type === 'Object3D' || (o.isInstancedMesh && !arGrass(o)) || (o.isMesh && !o.isInstancedMesh && o.geometry && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'SphereGeometry') && !o.userData.still) || o.renderOrder < -10 || o.frustumCulled === false && !o.isGroup;
    if (!keep) { scene.remove(o); out.push(o); }
  }
  // what the farm had in the grid, kept to put back
  arSaved = { out, cell: cell.slice(), open: openAt.slice(), box: cellBox.slice(), low: new Set(lowObst), top: new Map(obstTop), wX: wX.slice(), wZ: wZ.slice(), thinN: THIN.n, thinBox: THIN.box.slice(),
    openings: openings.slice(), doors: HOUSE_DOORS.list.slice(), doorKey: HOUSE_DOORS.key, lights: STATIC_LIGHTS.slice(), house: LMU.uHouse.value.clone() };
  openings.length = 0; HOUSE_DOORS.list.length = 0; HOUSE_DOORS.key = 'arena'; wX.fill(0); wZ.fill(0); THIN.n = 0;
  cell.fill(EMPTY); openAt.fill(null); cellBox.fill(null); lowObst.clear(); obstTop.clear();
  if (!arG) arG = arBuild();   // (the containers' and barriers' footprints go in as they're built)
  for (let j = ARENA.z0; j <= ARENA.z1; j++) for (let i = ARENA.x0; i <= ARENA.x1; i++) {
    const k = AR_KIND(i, j), c = idx(i, j);
    if (k === '#' || k === 'h') cell[c] = WALL;
    else if (AR_H[k]) { cell[c] = OBST; obstTop.set(c, AR_H[k]); if (AR_LOW.has(k)) lowObst.add(c); if (k === 's') VAULT_LOW.add(c); }
  }
  // the woods cleared back from the terminal's apron: the farm's own trees there drawn at nothing, kept to put back
  arTrees.length = 0;
  for (const o of FARM_ROOTS) {
    if (!o.isInstancedMesh || o.parent !== scene) continue;
    let did = false;
    for (let k = 0; k < o.count; k++) { o.getMatrixAt(k, _aTM); _aTV.setFromMatrixPosition(_aTM); if (arCleared(_aTV.x, _aTV.z)) { arTrees.push([o, k, _aTM.clone()]); o.setMatrixAt(k, _aTZero); did = true; } }
    if (did) o.instanceMatrix.needsUpdate = true;
  }
  TREE_HIDE.at = arCleared;   // (and the ones the forests draw afresh each frame kept out of it: world/tree-cull.js)
  arCellBoxes();
  scene.add(arG);
  syncBlock();
  STATIC_LIGHTS.length = 0; STATIC_LIGHTS.push(...AR_LIGHTS()); STATIC_LIGHTS.forEach(L => { L.field = lightField(L.x, L.z, L.r, null, true); });
  LMU.uHouse.value.set(-1e3, -1e3, -1e3, -1e3);   // (no roof keeping the clouds' shade off the middle)
  setLightsDirty(true); setVisKey(''); stillShadowsReset();
}
const arCleared = (x, z) => Math.abs(x) < AR_OUT + 1.5 && Math.abs(z - 0.5) < AR_OUT + 1.5;
const arTrees = [], _aTM = new THREE.Matrix4(), _aTV = new THREE.Vector3(), _aTZero = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -50, 0);
// (the barriers' footprints, as their meshes stand: they're built once, so put back every match)
const arBoxes = [];
function arCellBoxes() {
  if (!arBoxes.length) for (let k = 0; k < cellBox.length; k++) if (cellBox[k]) arBoxes.push([k, cellBox[k]]);
  for (const [k, b] of arBoxes) cellBox[k] = b;
}
// grass, bushes, rocks and the little ground clutter (instanced, all lower than a tree), spread over the whole farm
function arGrass(o) { const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.max.y - g.boundingBox.min.y < 3; }
export function arenaDown() {
  if (!ARENA.on) return;
  ARENA.on = false; VAULT_LOW.clear(); TREE_HIDE.at = null;
  scene.remove(arG);
  for (const [o, k, m] of arTrees) { o.setMatrixAt(k, m); o.instanceMatrix.needsUpdate = true; } arTrees.length = 0;
  const s = arSaved; arSaved = null;
  s.out.forEach(o => scene.add(o));
  cell.set(s.cell); for (let k = 0; k < openAt.length; k++) openAt[k] = s.open[k]; for (let k = 0; k < cellBox.length; k++) cellBox[k] = s.box[k];
  lowObst.clear(); s.low.forEach(k => lowObst.add(k)); obstTop.clear(); s.top.forEach((v, k) => obstTop.set(k, v));
  wX.set(s.wX); wZ.set(s.wZ); THIN.n = s.thinN; THIN.box = s.thinBox;
  openings.length = 0; openings.push(...s.openings); HOUSE_DOORS.list.length = 0; HOUSE_DOORS.list.push(...s.doors); HOUSE_DOORS.key = s.doorKey;
  STATIC_LIGHTS.length = 0; STATIC_LIGHTS.push(...s.lights); LMU.uHouse.value.copy(s.house);
  syncBlock(); setLightsDirty(true); setVisKey(''); stillShadowsReset();
}
// the spawn spot for a side (A, B or F) furthest from the enemies given ([x, z] each), a little off where it's marked
export function arenaSpawn(side, foes, n) {
  const L = AR_SPAWN[side] || AR_SPAWN.F;
  let best = L[0], bd = -1;
  if (n !== undefined && side !== 'F') best = L[n % L.length];
  // (the furthest from everyone, never one an enemy can see from where they stand: a spot in plain sight of one counts
  // for far less however far off it is)
  else for (const s of L) { let d = 1e9, seen = false; for (const f of foes) { d = Math.min(d, Math.hypot(f[0] - s[0], f[1] - s[1])); if (!seen && los(f[0], f[1], s[0], s[1])) seen = true; } if (!foes.length) d = rand(); if (seen) d -= 1000; if (d > bd) { bd = d; best = s; } }
  return [best[0] + rr(-0.15, 0.15), best[1] + rr(-0.15, 0.15), best[2]];
}
