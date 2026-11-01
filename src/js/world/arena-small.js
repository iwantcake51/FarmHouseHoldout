// The arena's two small maps, smaller than every other (32 by 26 m against the Mall's 36 by 30 and Yard 4's 42 by 42)
// and fair for every mode: Showdown from 1v1 to 3v3, team deathmatch and the free-for-all. "Hawthorne Square", a
// market town's square that was the town's evacuation point, and "Saltmarsh Quay", a fishing harbour's quay the last
// boats left from. Both overrun since: what you fight round is what was left when the dead came, the coach that never
// left and the army's checkpoint round the war memorial, its triage tents, sandbags and HESCO, the fresh graves in the
// churchyard; the fish lorry abandoned across the quay road, the field hospital under the fish market's roof, the
// ambulance, the lifeboat dragged out on its side, the cars queued for a ferry that never came back. Each one real
// place, an open space broken up by what stands in it rather than rooms with doors: its edges are the buildings (or
// the water) round it. Their own worlds, not built over the farm (world/arena.js arenaUp takes the farm out of the
// scene). Designed and checked in tools/small-plan.py (reachability, spawn sightlines, lane sightlines, corner
// pinches, one-cell squeezes, timings), the west half (Blue's) drawn and mirrored for the east (Red's):
//  - each spawn the road's end coming in between the corner buildings, behind the coach or the lorry parked across
//    it: nothing outside sees in, and two ways out round either end of it
//  - NORTH: the High Street's pavement under the boarded-up shops (the café's tables on their sides, a burned-out car,
//    the army's generator, the kiosk in the middle); the back lane behind the harbour buildings (a car left in the
//    ferry queue, the harbourmaster's pickup, the harbour office's porch in the middle). Close to medium
//  - MIDDLE: the checkpoint round the war memorial, a triage tent each side of the flag, sandbags, supply crates, HESCO
//    at its south way in; the field hospital under the market's roof, the ambulance across its north end, the
//    medical supplies stacked each side of the flag, stretchers, the lifeboat across its south end. The contest
//  - SOUTH: the churchyard's fresh graves (west) and the Hawthorne Arms' barricaded beer garden (east) behind their
//    low walls, the old pump house between them; the quayside along the water, the crane at the edge in the middle.
//    Medium over low cover
// Spawn to the flag is about 3.7 to 3.9 s at a sprint through the middle and 4.5 to 5 s round either edge; hardly
// anything's seen further than 26 m (a few diagonals of 27-28 m across the quay), every way through between two solid
// things is three metres wide or more (no doorway that feels like a squeeze), and a side of three starts together out
// of every sightline.
// What has an underside (the coach, the lorry, the pickup, the ambulance) lets a round from your own eyes through
// under it (world/collision.js obstUnder); what's thin (the market's posts, a tree's trunk) stops only where it
// stands, so a round or a look goes past it (cellBox).

import { rand, rr, seeded } from '../core/math.js';
import { floorMat } from './floors.js';
import { lam, lit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';

// ---- the plans (tools/small-plan.py prints them): # the edge, h a building, a tent or the pump house, V a vehicle
// (the coach, the lorry, the pickup, the ambulance: rounds go under them), U one on its side or with no underside (the
// army's generator, the lifeboat), M a monument, a kiosk, an office's porch, a stone cross or the crane's base, H a
// HESCO bastion, X supplies or fish boxes stacked high, T a tree, P one of the market's posts (all of those stop sight
// and rounds, the trees and the posts only at their trunks); c a café table on its side or a car (gone round), w a low
// wall or pallets of floats, g a fresh grave or a picnic table, k crates, luggage or pots, s sandbags, b a stretcher, o
// a bollard (seen and shot over); A and B each side's spawn, F the free-for-all spots
const SQ_PLAN = [
  '################################',
  '#hhhhF..c..F...MM...F..c..Fhhhh#',
  '#hhhh.c..F...F.MM.F...F..c.hhhh#',
  '#hhhh......................hhhh#',
  '#hhhhF.ccc.UU......UU.ccc.Fhhhh#',
  '#hhhh..ccc.UUk....kUU.ccc..hhhh#',
  '#.............MMMM.............#',
  '#........XX...MMMM...XX........#',
  '#.....VV......MMMM......VV.....#',
  '#....AVV.F..T......T..F.VVB....#',
  '#....AVV......s..s......VVB....#',
  '#...AAVV...hh......hh...VVBB...#',
  '#...AAVV...hhF....Fhh...VVBB...#',
  '#...AAVV...hh......hh...VVBB...#',
  '#...AAVV...hh......hh...VVBB...#',
  '#....AVV......s..s......VVB....#',
  '#....AVV.F...T....T...F.VVB....#',
  '#.....VV................VV.....#',
  '#............H....H............#',
  '#.....www..w.H....H.w..www.....#',
  '#hhhh.....M....FF....M.....hhhh#',
  '#hhhh..g...gF......Fg...g..hhhh#',
  '#hhhh.F.T......hh......T.F.hhhh#',
  '#hhhh....g...g.hh.g...g....hhhh#',
  '#hhhh.....F....hh....F.....hhhh#',
  '################################'
];
const QY_PLAN = [
  '################################',
  '#hhh...k.VVV...MM...VVV.k...hhh#',
  '#hhh.F..FVVV.F.MM.F.VVVF..F.hhh#',
  '#hhh........................hhh#',
  '#hhh..cccc.F........F.cccc..hhh#',
  '#hhh..cccc............cccc..hhh#',
  '#............kVVVVk............#',
  '#...F....XX...VVVV...XX....F...#',
  '#.....VV................VV.....#',
  '#....AVV.F..P......P..F.VVB....#',
  '#...AAVV......b..b......VVBB...#',
  '#..AAAVV...XX......XX...VVBBB..#',
  '#..AAAVV...XXF....FXX...VVBBB..#',
  '#..AAAVV...XX......XX...VVBBB..#',
  '#...AAVV...XX......XX...VVBB...#',
  '#...AAVV.F....b..b....F.VVBB...#',
  '#....AVV....P......P....VVB....#',
  '#.....VV................VV.....#',
  '#............UUUUUU............#',
  '#.....wwwX.w.UUUUUU.w.Xwww.....#',
  '#hhh.....X.....FF.....X.....hhh#',
  '#hhh..k.....F......F.....k..hhh#',
  '#hhh..F.....k......k.....F..hhh#',
  '#hhh......F....MM....F......hhh#',
  '#hhh.o...o...o.MM.o...o...o.hhh#',
  '################################'
];
// where each stands on the grid (cells, the edge included): centred on the grid's middle, so the flag's in the same
// place as on every map (between the triage tents; under the market's roof between the stacks of supplies)
const SM_B = [6, 9, 37, 34];
const SM_W = 32, SM_D = 26;
const smX0 = cxw(SM_B[0]) - 0.5, smX1 = cxw(SM_B[2]) + 0.5, smZ0 = cxw(SM_B[1]) - 0.5, smZ1 = cxw(SM_B[3]) + 0.5;
// a plan column's or row's middle in the world (m)
const smXc = c => cxw(SM_B[0] + c), smZc = r => cxw(SM_B[1] + r);
// how tall each kind stands (m), which are low, which are vaulted, what the vault prompt calls each, and how high off
// the ground each with an underside has it (world/collision.js obstUnder)
const SQ_H = { '#': 3.2, h: 2.8, V: 3.0, U: 2.2, M: 2.7, H: 2.1, X: 2.2, T: 3.2, c: 1.15, w: 0.95, g: 0.9, k: 1.0, s: 1.15 };
const SQ_LOW = new Set(['c', 'w', 'g', 'k', 's']);
const SQ_VAULT = new Set(['w', 'g', 'k']);   // (the car, the tables on their sides and the sandbags gone round)
const SQ_WHAT = { w: 'wall', g: 'grave', k: 'crates' };
const QY_H = { '#': 3.2, h: 2.8, V: 2.8, U: 2.2, M: 2.8, P: 2.6, X: 2.2, c: 1.35, k: 0.95, b: 0.85, o: 0.62, w: 1.0 };
const QY_LOW = new Set(['c', 'k', 'b', 'o', 'w']);
const QY_VAULT = new Set(['k', 'b', 'w']);
const QY_WHAT = { k: 'boxes', b: 'stretcher', w: 'pallets' };

// ---- the pieces, built into the map's group (folded into a few meshes by world/arena.js)
let smG = null, smPARTS = null, smPLAN = null;
const smKIND = (i, j) => { const r = smPLAN[j - SM_B[1]]; return r ? r[i - SM_B[0]] || '#' : '#'; };
const smPush = m => { if (!m.parent) smG.add(m); smPARTS.push(m); return m; };
const smBx = (w, h, d, mat, x, y, z) => smPush(box(smG, w, h, d, mat, x, y, z));
function smCy(r0, r1, h, mat, x, y, z, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return smPush(m); }
const smFoot = (x, z, a, b, c, d) => { cellBox[idx(ci(x), ci(z))] = [x - a, z - b, x + c, z + d]; };
// a run of one kind from its first cell: its extent in cells and in the world
function smRectOf(i, j, k) {
  let i1 = i, j1 = j; while (smKIND(i1 + 1, j) === k) i1++; while (smKIND(i, j1 + 1) === k) j1++;
  const x0 = cxw(i) - 0.5, x1 = cxw(i1) + 0.5, z0 = cxw(j) - 0.5, z1 = cxw(j1) + 0.5;
  return { i0: i, i1, j0: j, j1, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
const smFirst = (i, j, k) => smKIND(i - 1, j) !== k && smKIND(i, j - 1) !== k;
// tall things dithered away round you from above when they're between you and the camera, as every map's are
// (core/shaders.js 'tree')
const smTall = c => lit(new THREE.MeshLambertMaterial({ color: c }), 'tree');
const smGlowM = c => new THREE.MeshBasicMaterial({ color: c });
const smTexM = (t, isTall) => isTall ? lit(new THREE.MeshLambertMaterial({ map: t }), 'tree') : lam(0xffffff, { map: t });
function smCanvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t; }
// a picture on a face (d: [dx, dz] the way it faces), w by h, its middle at (x, y, z)
function smPic(w, h, mat, x, y, z, d) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = Math.atan2(d[0], d[1]); m.receiveShadow = true; return smPush(m); }
// a box along x or z (for what's drawn west to east and turned for the other way)
const smBxA = (along, a, h, o, mat, x, y, z) => along === 'x' ? smBx(a, h, o, mat, x, y, z) : smBx(o, h, a, mat, x, y, z);

// ---- shared props
const smSH = {
  tyre: lam(0x1d1d1f), hub: lam(0x8a8d90), glass: smTall(0x2a3a44), glassLo: lam(0x31434e), chrome: lam(0xb7bcc0), dark: lam(0x26282b),
  red: lam(0xb2271f), lampG: smGlowM(0xffe7b0), stone: smTall(0xb8b2a3), stoneDk: smTall(0x8e887a), stoneLo: lam(0xa9a395), stoneLoDk: lam(0x857f71),
  iron: lam(0x2b2e31), ironT: smTall(0x2b2e31), wood: lam(0x7a5a3a), woodDk: lam(0x56402a), slate: smTall(0x4a4f57), slateLo: lam(0x4a4f57),
  leaf: [smTall(0x4f7a3a), smTall(0x5d8a42), smTall(0x45703a)], bark: smTall(0x5a4636), yew: smTall(0x2f4a2c), grass: lam(0x5f7f45), soil: lam(0x4a3a2a),
  flower: [lam(0xc23b4a), lam(0xe6c23a), lam(0xe8e2d8), lam(0x8a4ab2)]
};
// a wheel at (x, y, z), its axle along x
function smWheel(r, wdt, x, y, z) { const t = smCy(r, r, wdt, smSH.tyre, x, y, z, 16); t.rotation.z = Math.PI / 2; const h = smCy(r * 0.55, r * 0.55, wdt + 0.01, smSH.hub, x, y, z, 12); h.rotation.z = Math.PI / 2; }
// a tree: its trunk (the only part that stops anything: cellBox), and over your head its crown of a few clumps, or
// (dead, as the town's limes are now) bare branches; a yew's dark cone
function smTree(x, z, kind) {
  if (kind === 'yew') { smCy(0.13, 0.18, 1.0, smSH.bark, x, 0.5, z, 8); for (let k = 0; k < 3; k++) { const c = smPush(new THREE.Mesh(new THREE.ConeGeometry(1.0 - k * 0.22, 1.5, 9), smSH.yew)); c.position.set(x, 1.3 + k * 0.85, z); c.castShadow = true; } smFoot(x, z, 0.45, 0.45, 0.45, 0.45); return; }
  const h = 2.4 + rand() * 0.4;
  smCy(0.13, 0.18, h + 0.6, smSH.bark, x, (h + 0.6) / 2, z, 8);
  if (kind === 'dead') {
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + rand(), up = rr(0.5, 1.0), L = rr(1.0, 1.8), b = smCy(0.03, 0.08, L, smSH.bark, x + Math.cos(a) * L * 0.3, h + 0.2 + k * 0.12 + Math.cos(up) * L * 0.4, z + Math.sin(a) * L * 0.3, 5);
      b.rotation.set(Math.sin(a) * up, 0, -Math.cos(a) * up);
    }
  } else for (let k = 0; k < 6; k++) { const a = k * 1.1 + rand(), r = k ? 0.7 : 0, s = smPush(new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.8, 1.15), 1), smSH.leaf[k % 3])); s.position.set(x + Math.cos(a) * r, h + 1.0 + (k ? rr(-0.2, 0.4) : 0.6), z + Math.sin(a) * r); s.scale.y = 0.8; s.castShadow = true; }
  smFoot(x, z, 0.22, 0.22, 0.22, 0.22);   // (its trunk: a look or a round goes past it, under the crown)
}
// a street lamp: a black post and its lantern, its light on as it gets dark (the map's lights)
function smLampPost(x, z) { smCy(0.06, 0.09, 3.6, smSH.iron, x, 1.8, z, 8); smCy(0.14, 0.14, 0.25, smSH.iron, x, 0.12, z, 8); smBx(0.32, 0.4, 0.32, smSH.lampG, x, 3.75, z); smBx(0.42, 0.06, 0.42, smSH.iron, x, 3.98, z); smBx(0.36, 0.05, 0.36, smSH.iron, x, 3.53, z); }

// ---- the floors: each painted to its own picture (cells across, metres), its grain from the floor pack (world/floors.js)
const smFLOOR_PX = 48;
function smFloorTex(paint) { return smCanvas(SM_W * smFLOOR_PX, SM_D * smFLOOR_PX, (x, w, h) => paint(x, smFLOOR_PX, seeded(7711))); }
function smFloor(tex, kind, zones) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(smX1 - smX0, smZ1 - smZ0), floorMat(lam(0xffffff, { map: tex }), kind, [smX0, smZ0, smX1, smZ1], zones));
  m.rotation.x = -Math.PI / 2; m.position.set((smX0 + smX1) / 2, 0, (smZ0 + smZ1) / 2); m.receiveShadow = true; smG.add(m); return m;
}
// cobbles or slabs laid in a rect (cells, from the plan's corner)
function smSetts(x, P, r, i0, j0, i1, j1, base, sz, mortar) {
  x.fillStyle = base; x.fillRect(i0 * P, j0 * P, (i1 - i0) * P, (j1 - j0) * P);
  const s = sz * P;
  for (let y = j0 * P, row = 0; y < j1 * P; y += s * 0.6, row++) for (let xx = i0 * P - (row % 2) * s / 2; xx < i1 * P; xx += s) {
    const l = 0.82 + r() * 0.3, c = base.match(/\d+/g).map(Number);
    x.fillStyle = `rgb(${Math.round(c[0] * l)},${Math.round(c[1] * l)},${Math.round(c[2] * l)})`; x.fillRect(xx + 1, y + 1, s - 2, s * 0.6 - 2);
  }
  x.strokeStyle = mortar; x.lineWidth = 1; for (let y = j0 * P; y < j1 * P; y += s * 0.6) { x.beginPath(); x.moveTo(i0 * P, y); x.lineTo(i1 * P, y); x.stroke(); }
}
function smSlabs(x, P, r, i0, j0, i1, j1, base) {
  x.fillStyle = base; x.fillRect(i0 * P, j0 * P, (i1 - i0) * P, (j1 - j0) * P);
  for (let j = j0; j < j1; j += 0.9) for (let i = i0; i < i1; i += 0.9) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; x.fillRect(i * P + 1, j * P + 1, 0.9 * P - 2, 0.9 * P - 2); }
  x.strokeStyle = 'rgba(70,66,60,0.55)'; x.lineWidth = 1;
  for (let i = i0; i <= i1; i += 0.9) { x.beginPath(); x.moveTo(i * P, j0 * P); x.lineTo(i * P, j1 * P); x.stroke(); }
  for (let j = j0; j <= j1; j += 0.9) { x.beginPath(); x.moveTo(i0 * P, j * P); x.lineTo(i1 * P, j * P); x.stroke(); }
}
function smGrime(x, P, r, n, col) { for (let k = 0; k < n; k++) { const R = (0.2 + r() * 1.2) * P, g = x.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, `rgba(${col},0.22)`); g.addColorStop(1, `rgba(${col},0)`); x.save(); x.translate(r() * SM_W * P, r() * SM_D * P); x.scale(1, 0.4 + r()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill(); x.restore(); } }
// a text sign (glow: lit from inside)
function smSignTex(text, bg, fg, w, font = 'Georgia') {
  return smCanvas(Math.round(w * 128), 96, (x, W, H) => { x.fillStyle = bg; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 4; x.strokeRect(6, 6, W - 12, H - 12); x.fillStyle = fg; let s = 58; x.font = `600 ${s}px ${font}`; while (x.measureText(text).width > W - 40 && s > 18) { s -= 2; x.font = `600 ${s}px ${font}`; } x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 2); });
}

// ---- what the end of the world left on both maps: boards over the windows, paint on the walls, the army's kit
const smAPOC = {
  ply: lam(0x9c7e55), plyDk: lam(0x7d6442), plyT: smTall(0x9c7e55), plyTDk: smTall(0x7d6442),
  olive: smTall(0x4d5536), oliveDk: smTall(0x353b26), oliveLo: lam(0x4d5536), oliveLoDk: lam(0x353b26), canvas: smTall(0x6b6a4a), canvasDk: smTall(0x4f4e36),
  bag: lam(0x8f7c55), bagDk: lam(0x75653f), mesh: smTall(0x6a6b62), sand: smTall(0xa6916a), wire: lam(0x8a8d90), white: lam(0xe8e4da), cross: lam(0xb2271f),
  soot: smTall(0x2a2624), sootLo: lam(0x2a2624), rust: lam(0x6a3c22), case: [lam(0x2f4a6a), lam(0x7a2a24), lam(0x3a3a3a), lam(0x8a6a3a), lam(0x4a6a4a)]
};
// boards nailed over a window or a door on a face (d: the way it faces), w by h, its middle at (x, y, z): three or four
// planks a little crooked, the nails' heads
function smBoards(w, h, x, y, z, d, isTall = true) {
  const n = Math.max(2, Math.round(h / 0.32)), along = d[0] ? 'z' : 'x';
  for (let k = 0; k < n; k++) {
    const yy = y - h / 2 + (k + 0.5) * h / n, m = smBxA(along, w + rr(0, 0.16), h / n - 0.04, 0.03, k % 2 ? (isTall ? smAPOC.plyTDk : smAPOC.plyDk) : (isTall ? smAPOC.plyT : smAPOC.ply), x + d[0] * 0.03 + (along === 'x' ? rr(-0.05, 0.05) : 0), yy, z + d[1] * 0.03 + (along === 'z' ? rr(-0.05, 0.05) : 0));
    if (along === 'x') m.rotation.z = rr(-0.06, 0.06); else m.rotation.x = rr(-0.06, 0.06);
  }
}
// paint sprayed on a wall: words in a hurried hand (red, white or black), drawn into its own picture
function smSprayTex(text, col, w) {
  return smCanvas(Math.round(w * 128), 128, (x, W, H) => {
    const r = seeded(text.length * 97 + w * 13); let s = 92; x.font = `700 ${s}px "Permanent Marker", "Marker Felt", "Comic Sans MS", cursive`;
    while (x.measureText(text).width > W - 24 && s > 18) { s -= 3; x.font = `700 ${s}px "Permanent Marker", "Marker Felt", "Comic Sans MS", cursive`; }
    x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.save(); x.translate(W / 2, H / 2); x.rotate((r() - 0.5) * 0.08); x.fillText(text, 0, 0); x.restore();
    for (let k = 0; k < 10; k++) { const dx = 20 + r() * (W - 40), dy = H / 2 + s * 0.3; x.fillRect(dx, dy, 2 + r() * 2, 8 + r() * 26); }   // (the drips)
  });
}
function smSpray(text, col, w, h, x, y, z, d) { const m = smPic(w, h, new THREE.MeshLambertMaterial({ map: smSprayTex(text, col, w / h), transparent: true, alphaTest: 0.15, polygonOffset: true, polygonOffsetFactor: -2 }), x + d[0] * 0.02, y, z + d[1] * 0.02, d); lit(m.material, 'tree'); return m; }
// a run of sandbags along x or z, w long, n courses (each bag laid over the joint below)
function smBags(along, w, n, x, z) {
  for (let r = 0; r < n; r++) for (let k = 0, m = Math.round(w / 0.5) - (r % 2); k < m; k++) {
    const o = -w / 2 + 0.25 + k * 0.5 + (r % 2) * 0.25, b = smBxA(along, 0.48, 0.2, 0.32, rand() < 0.3 ? smAPOC.bagDk : smAPOC.bag, x + (along === 'x' ? o : rr(-0.02, 0.02)), 0.1 + r * 0.205, z + (along === 'z' ? o : rr(-0.02, 0.02)));
    b.rotation.y = rr(-0.05, 0.05);
  }
}
// the army's crates: olive boxes, a stencil on each, in a stack n high (k: low, X: over your head)
function smArmyCrates(x, z, n, w = 0.95) {
  for (let l = 0; l < n; l++) { const s = w - l * 0.04, c = l % 2 ? smAPOC.oliveDk : smAPOC.olive, y = 0.25 + l * 0.5; smBx(s, 0.48, s * 0.62, n > 2 ? c : (l % 2 ? smAPOC.oliveLoDk : smAPOC.oliveLo), x + rr(-0.03, 0.03), y, z - s * 0.2); smBx(s, 0.48, s * 0.36, n > 2 ? smAPOC.oliveDk : smAPOC.oliveLoDk, x + rr(-0.03, 0.03), y, z + s * 0.31); }
}
// luggage dropped in a heap: suitcases on their sides, a holdall
function smLuggage(x, z) {
  for (let k = 0; k < 4; k++) { const c = smAPOC.case[Math.floor(rand() * smAPOC.case.length)], w = rr(0.55, 0.8), b = smBx(w, rr(0.38, 0.5), rr(0.22, 0.3), c, x + rr(-0.22, 0.22), 0.22 + (k > 1 ? 0.45 : 0), z + rr(-0.22, 0.22)); b.rotation.y = rr(-0.8, 0.8); }
  const h = smCy(0.18, 0.18, 0.7, smAPOC.case[3], x + rr(-0.15, 0.15), 0.95, z + rr(-0.1, 0.1), 10); h.rotation.z = Math.PI / 2; h.rotation.y = rr(-1, 1);
  smFoot(x, z, 0.46, 0.46, 0.46, 0.46);
}
// a car burned out where it stood (L along x, W across), or one left in a queue with its doors shut, a case on its roof
function smCar(R, burnt, col) {
  const L = R.w - 0.25, W = Math.min(1.75, R.d - 0.3), cx = R.cx, cz = R.cz, body = burnt ? smAPOC.sootLo : lam(col), y0 = burnt ? 0.12 : 0.28;
  smBx(L, 0.62, W, body, cx, y0 + 0.31, cz); smBx(L * 0.55, 0.5, W - 0.12, body, cx - L * 0.04, y0 + 0.86, cz);
  smBx(L * 0.55 + 0.02, 0.38, W - 0.16, burnt ? smSH.dark : smSH.glassLo, cx - L * 0.04, y0 + 0.86, cz);
  if (burnt) { for (let k = 0; k < 7; k++) smBx(rr(0.2, 0.6), 0.03, rr(0.2, 0.5), smAPOC.rust, cx + rr(-L / 2 + 0.3, L / 2 - 0.3), y0 + 0.63, cz + rr(-W / 2 + 0.2, W / 2 - 0.2)); for (const xx of [cx - L / 2 + 0.55, cx + L / 2 - 0.55]) for (const s of [-1, 1]) { const t = smCy(0.22, 0.22, 0.12, smSH.hub, xx, 0.22, cz + s * (W / 2 - 0.08), 10); t.rotation.x = Math.PI / 2; } }
  else {
    for (const xx of [cx - L / 2 + 0.65, cx + L / 2 - 0.65]) for (const s of [-1, 1]) { const t = smCy(0.31, 0.31, 0.2, smSH.tyre, xx, 0.31, cz + s * (W / 2 - 0.06), 14); t.rotation.x = Math.PI / 2; }
    smBx(0.8, 0.05, 1.1, smSH.iron, cx - L * 0.04, y0 + 1.13, cz); smBx(0.7, 0.32, 0.5, smAPOC.case[Math.floor(rand() * 5)], cx - L * 0.04, y0 + 1.32, cz - 0.15);
    for (const s of [-1, 1]) smBx(0.14, 0.1, 0.3, lam(0xe8e2c0), cx + s * (L / 2 + 0.01), y0 + 0.5, cz + (W / 2 - 0.3));
  }
}

// ======================================================================================================================
// HAWTHORNE SQUARE
// The story: the town's square was its evacuation point. The army ringed the war memorial with sandbags and set up its
// checkpoint there, a triage tent each side of the flagpole, HESCO at the south way in, its generator humming at the
// kerb and its supply crates stacked by the road; the coaches came in along the road at each end, and the last one
// never left (its luggage still on the rack). The High Street's shops along the north side boarded up and painted over
// (EVAC POINT →, the names of who'd gone where), the café's tables knocked over, a car burned out at the kerb, the
// newspaper kiosk shut up; the churchyard behind its low wall on the south-west full of fresh graves under wooden
// crosses, the Hawthorne Arms' beer garden on the south-east barricaded with its own tables, the old pump house
// between them. Each end, the road closed by the army's barricade, the queue of cars beyond it.
const SQM = {
  setts: 'rgb(124,118,108)', pave: 'rgb(164,158,146)', road: 'rgb(58,59,62)',
  brick: [smTall(0x7e4434), smTall(0x8c5240), smTall(0x6e3a2c)], render: [smTall(0xcfc6b0), smTall(0xc4b594), smTall(0xb5bfbb), smTall(0xccb6a2)],
  trim: smTall(0xd8d2c4), shopDk: smTall(0x283430), coach: smTall(0xdcdad2), coachB: smTall(0x2d4a7a), coachDk: smTall(0x1e2a40),
  kiosk: smTall(0x2e5a3e), kioskDk: smTall(0x1f3d2a), gen: smTall(0x55603e), genDk: smTall(0x343a26),
  table: lam(0x2b2e31), chair: lam(0x6a7a6a), parasol: lam(0x2f5a6a), planter: lam(0x5a554d), wreath: lam(0x5a1a1c), poppy: lam(0xa4161c),
  mound: lam(0x5a4632), moundDk: lam(0x4a3828), crossW: lam(0x8a6a44), picnic: lam(0x8a6a44), barrier: lam(0xa9a497), cone: lam(0xe0662a)
};
function sqFloor() {
  const t = smFloorTex((x, P, r) => {
    // the square: setts
    smSetts(x, P, r, 0, 0, SM_W, SM_D, SQM.setts, 0.32, 'rgba(60,56,50,0.5)');
    // the High Street's pavement under the shops (rows 1-5) and its kerb
    smSlabs(x, P, r, 1, 1, SM_W - 1, 6, SQM.pave); x.fillStyle = 'rgb(140,136,128)'; x.fillRect(5 * P, 6 * P - 4, (SM_W - 10) * P, 6);
    // the road at each end (cols 0-8, rows 6-19): tarmac, the coach bay's yellow box, EVAC painted on it
    for (const s of [0, 1]) {
      const i0 = s ? SM_W - 9 : 0, i1 = s ? SM_W : 9;
      x.fillStyle = SQM.road; x.fillRect(i0 * P, 6 * P, (i1 - i0) * P, 14 * P);
      for (let k = 0; k < 600; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,90,92' : '40,40,42'},0.5)`; x.fillRect(i0 * P + r() * (i1 - i0) * P, 6 * P + r() * 14 * P, 2, 2); }
      const bx0 = (s ? SM_W - 8.2 : 5.8) * P; x.strokeStyle = 'rgba(228,190,52,0.85)'; x.lineWidth = 4; x.strokeRect(bx0, 7.8 * P, 2.4 * P, 10.4 * P);
      x.save(); x.translate((s ? SM_W - 3 : 3) * P, 13 * P); x.rotate(s ? Math.PI / 2 : -Math.PI / 2); x.fillStyle = 'rgba(232,230,220,0.55)'; x.font = `bold ${P * 1.6}px Arial`; x.textAlign = 'center'; x.fillText('EVAC', 0, P * 0.5); x.restore();
    }
    // the churchyard (west): grass worn to mud between the fresh graves, its gravel path; the beer garden (east): gravel
    x.fillStyle = 'rgb(80,98,58)'; x.fillRect(5 * P, 20 * P, 10 * P, 5 * P);
    for (let k = 0; k < 3000; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '60,80,44' : r() < 0.5 ? '96,80,58' : '110,128,74'},0.6)`; x.fillRect(5 * P + r() * 10 * P, 20 * P + r() * 5 * P, 1, 2 + r() * 3); }
    x.fillStyle = 'rgb(158,146,124)'; x.fillRect(9 * P, 19 * P, 1.6 * P, 6 * P); x.fillRect(5 * P, 20.1 * P, 10 * P, 0.8 * P);
    x.fillStyle = 'rgb(150,138,116)'; x.fillRect((SM_W - 15) * P, 20 * P, 10 * P, 5 * P);
    smSlabs(x, P, r, SM_W - 13, 20, SM_W - 7, 25, 'rgb(162,152,132)');
    // the checkpoint: a red cross on a white disc painted round the flag (for the helicopters that came at first), the
    // memorial's ring of dark stone north of it
    x.fillStyle = 'rgba(226,222,210,0.7)'; x.beginPath(); x.arc(16 * P, 13 * P, 2.6 * P, 0, 7); x.fill();
    x.fillStyle = 'rgba(170,40,34,0.75)'; x.fillRect(15.3 * P, 11.2 * P, 1.4 * P, 3.6 * P); x.fillRect(14.2 * P, 12.3 * P, 3.6 * P, 1.4 * P);
    x.strokeStyle = 'rgba(70,64,56,0.75)'; x.lineWidth = 8; x.beginPath(); x.ellipse(16 * P, 7.5 * P, 3.4 * P, 2.6 * P, 0, 0, 7); x.stroke();
    // what the end left: soot round the burned cars, leaflets, blood dried in smears and drag marks, tyre marks
    for (const cx2 of [8, SM_W - 8]) { const g = x.createRadialGradient(cx2 * P, 5 * P, 0, cx2 * P, 5 * P, 2.6 * P); g.addColorStop(0, 'rgba(20,18,16,0.7)'); g.addColorStop(1, 'rgba(20,18,16,0)'); x.fillStyle = g; x.fillRect((cx2 - 3) * P, 2 * P, 6 * P, 6 * P); }
    for (let k = 0; k < 180; k++) { x.save(); x.translate(r() * SM_W * P, r() * SM_D * P); x.rotate(r() * 7); x.fillStyle = `rgba(${r() < 0.5 ? '236,232,220' : '214,196,150'},0.75)`; x.fillRect(-P * 0.1, -P * 0.07, P * 0.2, P * 0.14); x.restore(); }
    smBlood(x, P, r, 26);
    x.strokeStyle = 'rgba(30,28,26,0.22)'; x.lineWidth = P * 0.22; for (let k = 0; k < 4; k++) { x.beginPath(); const y0 = (7 + r() * 12) * P; x.moveTo(0, y0); x.bezierCurveTo(SM_W * P * 0.3, y0 + (r() - 0.5) * 6 * P, SM_W * P * 0.7, y0 + (r() - 0.5) * 6 * P, SM_W * P, y0 + (r() - 0.5) * 3 * P); x.stroke(); }
    smGrime(x, P, r, 80, '40,36,30');
  });
  return smFloor(t, 'granite', [['concrete', 1, 1, -1, 6], ['asphalt', 0, 6, 9, 20], ['asphalt', SM_W - 9, 6, SM_W, 20], ['gravel', 5, 20, -5, 25]]);
}
// dried blood on a floor: drops, pools and the smears where someone was dragged
function smBlood(x, P, r, n) {
  for (let k = 0; k < n; k++) {
    const X = (2 + r() * (SM_W - 4)) * P, Z = (2 + r() * (SM_D - 4)) * P, R = (0.2 + r() * 0.5) * P;
    x.fillStyle = `rgba(${70 + r() * 30},${12 + r() * 10},${10 + r() * 8},${0.45 + r() * 0.3})`; x.beginPath(); x.ellipse(X, Z, R, R * (0.5 + r() * 0.5), r() * 3, 0, 7); x.fill();
    for (let d = 0; d < 6; d++) { x.beginPath(); x.arc(X + (r() - 0.5) * R * 4, Z + (r() - 0.5) * R * 4, 1 + r() * 3, 0, 7); x.fill(); }
    if (r() < 0.4) { x.strokeStyle = 'rgba(80,18,14,0.35)'; x.lineWidth = R * 0.8; x.beginPath(); x.moveTo(X, Z); const a = r() * 7, L = (1 + r() * 2.5) * P; x.quadraticCurveTo(X + Math.cos(a) * L * 0.5 + (r() - 0.5) * P, Z + Math.sin(a) * L * 0.5, X + Math.cos(a) * L, Z + Math.sin(a) * L); x.stroke(); }
  }
}
// the High Street's shopfronts along the north edge: each shop its own front (painted or brick), its fascia with its
// name, its window boarded up (or smashed, the dark inside showing), a torn awning, two storeys of windows over it,
// some boarded, and what was sprayed on them as the town left
const SQ_SHOPS = [['Corner Stores', '#2d4a3a'], ['Bakery', '#7a3b2a'], ['Hawthorne Café', '#2f4a5e'], ['Chemist', '#1f5e4a'], ['Books', '#5a2f4a'], ['Ironmonger', '#3a3a3a'], ['Butcher', '#7a1f1f'], ['Post Office', '#a8231c'], ['Florist', '#3e6a3a']];
const SQ_SPRAY = [['EVAC POINT →', '#e8e4da'], ['GONE TO KESTON', '#b2271f'], ['NO FOOD', '#1e1e1e'], ['MUM WE WENT TO THE COAST', '#e8e4da'], ['DONT GO IN', '#b2271f'], ['3 INSIDE  ✝', '#1e1e1e']];
function sqNorth() {
  const fz = smZ0 + 1, H1 = 3.4, H2 = 7.2;
  let x = smX0 + 1, n = 0;
  while (x < smX1 - 1.01) {
    const w = Math.min(smX1 - 1 - x, [3.2, 3.6, 4.0][n % 3]), cx = x + w / 2, S = SQ_SHOPS[n % SQ_SHOPS.length];
    const wall = n % 3 === 1 ? SQM.brick[n % 3] : SQM.render[n % 4];
    smBx(w, H2, 0.6, wall, cx, H2 / 2, fz - 0.3);                                   // its front, two storeys
    smBx(w + 0.02, 0.18, 0.66, SQM.trim, cx, H1 + 0.6, fz - 0.27);                  // the string course over the shop
    smBx(w - 0.2, 0.55, 0.08, SQM.shopDk, cx, H1 + 0.2, fz + 0.04);
    smPic(w - 0.4, 0.42, smTexM(smSignTex(S[0], S[1], '#d8ccb0', w - 0.4), true), cx, H1 + 0.2, fz + 0.085, [0, 1]);
    // the shop window: boarded up, or smashed in with the dark showing; the door boarded
    if (n % 3 !== 2) smBoards(w - 1.4, 1.9, cx - 0.45, 1.55, fz + 0.03, [0, 1]);
    else { smBx(w - 1.4, 1.9, 0.04, smSH.dark, cx - 0.45, 1.55, fz + 0.02); for (let k = 0; k < 4; k++) { const sh = smBx(rr(0.15, 0.4), rr(0.2, 0.5), 0.02, smSH.glass, cx - 0.45 + rr(-0.6, 0.6), rr(0.9, 2.3), fz + 0.05); sh.rotation.z = rr(-1, 1); } }
    smBx(0.9, 2.2, 0.05, SQM.shopDk, cx + w / 2 - 0.7, 1.1, fz + 0.03); smBoards(0.8, 1.8, cx + w / 2 - 0.7, 1.15, fz + 0.06, [0, 1]);
    smBx(w - 0.2, 0.45, 0.06, SQM.shopDk, cx, 0.22, fz + 0.03);
    // its awning, torn: hanging off its frame at one end
    if (n % 2 === 0) {
      const aw = smCanvas(64, 64, (c, W) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#c9c0ae' : S[1]; c.fillRect(k * W / 8, 0, W / 8, 64); } c.fillStyle = 'rgba(30,26,22,0.35)'; c.fillRect(0, 0, W, 64); });
      aw.wrapS = THREE.RepeatWrapping; aw.repeat.set(w / 1.2, 1);
      const a = smPush(new THREE.Mesh(new THREE.PlaneGeometry((w - 0.3) * 0.6, 1.5), smTexM(aw, true))); a.position.set(cx - w * 0.15, 2.8, fz + 0.5); a.rotation.x = -Math.PI / 2 + 0.75; a.rotation.y = 0.18; a.castShadow = true;
    }
    smSpray(SQ_SPRAY[n % SQ_SPRAY.length][0], SQ_SPRAY[n % SQ_SPRAY.length][1], Math.min(w - 0.3, 3), 0.6, cx, 2.75, fz + 0.04, [0, 1]);
    // the windows over: two storeys of sash windows, some boarded, some broken
    for (const y of [4.9, 6.5]) for (let k = 0, m = Math.max(1, Math.floor(w / 1.6)); k < m; k++) {
      const wx = x + (k + 0.5) * w / m, q = (n * 7 + k * 3 + (y > 5 ? 1 : 0)) % 4;
      smBx(0.9, 1.1, 0.06, SQM.trim, wx, y, fz + 0.01); smBx(0.76, 0.96, 0.07, q === 1 ? smSH.dark : smSH.glass, wx, y, fz + 0.02); smBx(1.0, 0.07, 0.16, SQM.trim, wx, y - 0.6, fz + 0.06);
      if (q === 0) smBoards(0.86, 1.0, wx, y, fz + 0.05, [0, 1]);
    }
    // its roof: slate, a chimney now and then
    const roof = smBx(w, 0.12, 2.8, smSH.slate, cx, H2 + 0.9, fz - 1.3); roof.rotation.x = 0.6;
    if (n % 2 === 0) { smBx(0.6, 1.4, 0.5, SQM.brick[0], cx + rr(-0.6, 0.6), H2 + 1.6, fz - 1.5); for (const s of [-0.12, 0.12]) smCy(0.07, 0.07, 0.3, SQM.brick[2], cx + s, H2 + 2.4, fz - 1.5, 6); }
    x += w; n++;
  }
}
// the corner buildings: the corner shop (north, two storeys) and the cottage (south, one: between the map and the
// camera from above), every window boarded, a word sprayed on each
function sqCorner(R) {
  const north = R.cz < 0, west = R.cx < 0, H = north ? 6.6 : 3.3, mat = north ? SQM.brick[1] : SQM.render[1];
  smBx(R.w, H, R.d, mat, R.cx, H / 2, R.cz);
  const rf = smBx(R.w + 0.3, 0.14, R.d * 0.62, smSH.slate, R.cx, H + 0.75, R.cz - R.d * 0.22); rf.rotation.x = -0.6; const rb = smBx(R.w + 0.3, 0.14, R.d * 0.62, smSH.slate, R.cx, H + 0.75, R.cz + R.d * 0.22); rb.rotation.x = 0.6;
  const fx = west ? R.x1 : R.x0, dX = west ? 1 : -1, fzz = north ? R.z1 : R.z0, dZ = north ? 1 : -1;
  for (let k = 0; k < 2; k++) { const z = R.z0 + 1 + k * 2.4; smBx(0.06, 1.1, 0.9, SQM.trim, fx + dX * 0.02, 1.7, z); smBoards(0.9, 1.1, fx + dX * 0.02, 1.7, z, [dX, 0]); if (H > 5) { smBx(0.06, 1.0, 0.9, SQM.trim, fx + dX * 0.02, 4.6, z); smBx(0.07, 0.86, 0.75, k ? smSH.glass : smSH.dark, fx + dX * 0.03, 4.6, z); } }
  for (let k = 0; k < 2; k++) { const xx = R.x0 + 1 + k * 2; smBx(0.9, 1.1, 0.06, SQM.trim, xx, 1.7, fzz + dZ * 0.02); smBoards(0.9, 1.1, xx, 1.7, fzz + dZ * 0.02, [0, dZ]); }
  if (north) { smPic(R.w - 0.6, 0.5, smTexM(smSignTex(west ? 'Hawthorne Stores' : 'Market Newsagent', '#2d4a3a', '#d8ccb0', R.w - 0.6), true), R.cx, 2.75, fzz + dZ * 0.05, [0, dZ]); smSpray(west ? 'LOOTED' : 'EMPTY', '#b2271f', 2.4, 0.6, fx + dX * 0.04, 3.4, R.cz + 0.6, [dX, 0]); }
  else { smBx(0.9, 2.1, 0.06, SQM.shopDk, R.cx + 0.6, 1.05, fzz + dZ * 0.02); smSpray('X  2 DEAD', '#e8e4da', 1.8, 0.5, R.cx - 0.6, 2.5, fzz + dZ * 0.04, [0, dZ]); }
}
// the last coach, broadside to the square: white with the coach firm's blue, EVACUATION in its destination board, its
// windows down its sides (some smashed), luggage still on the rack and a case burst open by its door (a round goes under
// it from your own eyes: under)
function sqCoach(R) {
  const L = R.d - 0.2, W = Math.min(1.9, R.w - 0.1), cx = R.cx, cz = R.cz, sq = R.cx < 0 ? 1 : -1;
  smBx(W, 0.45, L, SQM.coachDk, cx, 0.62, cz); smBx(W, 1.25, L, SQM.coach, cx, 1.45, cz); smBx(W, 0.85, L, SQM.coach, cx, 2.5, cz); smBx(W - 0.04, 0.1, L - 0.1, SQM.coachDk, cx, 2.97, cz);
  for (const s of [-1, 1]) {
    smBx(0.03, 0.3, L, SQM.coachB, cx + s * W / 2, 1.0, cz); smBx(0.03, 0.08, L, SQM.coachB, cx + s * W / 2, 1.9, cz);
    for (let k = 0; k < 7; k++) { const zz = cz - L / 2 + 1.2 + k * (L - 1.8) / 6.5; smBx(0.04, 0.8, 1.15, (k * 3 + (s > 0 ? 1 : 0)) % 5 === 2 ? smSH.dark : smSH.glass, cx + s * W / 2, 2.4, zz); }
  }
  smBx(W - 0.1, 1.15, 0.04, smSH.glass, cx, 2.2, cz - L / 2); smBx(W - 0.1, 0.9, 0.04, smSH.glass, cx, 2.35, cz + L / 2);
  smPic(W - 0.3, 0.28, smTexM(smSignTex('EVACUATION', '#111', '#ffb43a', W - 0.3, 'Arial'), true), cx, 2.85, cz - L / 2 - 0.03, [0, -1]);
  smPic(3.2, 0.4, smTexM(smSignTex('Hawthorne Coaches', '#dcdad2', '#2d4a7a', 3.2, 'Arial'), true), cx + sq * (W / 2 + 0.01), 1.55, cz + 0.6, [sq, 0]);
  smBx(0.04, 1.9, 0.9, smSH.dark, cx + sq * (W / 2 + 0.01), 1.4, cz - L / 2 + 1.0);   // (its door, open: the dark inside)
  for (const zz of [cz - L / 2 + 1.6, cz + L / 2 - 2.0]) for (const s of [-1, 1]) smWheel(0.5, 0.3, cx + s * (W / 2 - 0.12), 0.5, zz);
  // the luggage left on its roof rack
  smBx(W - 0.3, 0.05, L * 0.6, smSH.iron, cx, 3.05, cz + 0.4); for (let k = 0; k < 6; k++) { const b = smBx(rr(0.5, 0.8), rr(0.3, 0.45), rr(0.4, 0.6), smAPOC.case[k % 5], cx + rr(-0.4, 0.4), 3.25, cz - L * 0.25 + k * L * 0.1 + 0.4); b.rotation.y = rr(-0.5, 0.5); }
}
// the army's generator at the kerb: a sound-proofed box on its trailer, olive, its exhaust stack, the cables off it
// across the setts to the tents (laid flat)
function sqGenerator(R) {
  const cx = R.cx, cz = R.cz, W = R.w - 0.3, D = R.d - 0.5;
  smBx(W, 0.12, D, smSH.iron, cx, 0.5, cz); for (const s of [-1, 1]) smWheel(0.32, 0.2, cx + s * (W / 2 - 0.1), 0.32, cz);
  smBx(W - 0.1, 1.55, D - 0.1, SQM.gen, cx, 1.35, cz); smBx(W, 0.1, D, SQM.genDk, cx, 2.15, cz);
  for (let k = 0; k < 6; k++) smBx(W - 0.4, 0.04, 0.02, SQM.genDk, cx, 0.8 + k * 0.18, cz + (D - 0.1) / 2 + 0.01);   // (its louvres)
  smCy(0.06, 0.06, 0.6, smSH.iron, cx + W * 0.3, 2.45, cz - D * 0.25, 8);
  smPic(1.0, 0.3, smTexM(smSignTex('DANGER 415V', '#d8b23a', '#111', 1.0, 'Arial'), true), cx, 1.75, cz + (D - 0.1) / 2 + 0.02, [0, 1]);
  smBx(0.06, 0.03, 4.5, smSH.dark, cx + (cx < 0 ? 0.6 : -0.6), 0.015, cz + 2.8);
}
// the war memorial on its steps: granite steps, the pedestal with its names, the cross on top, the wreaths gone to
// brown; the photographs and the notes of the missing taped round it, sandbags laid along its foot
function sqMemorial(R) {
  for (let k = 0; k < 3; k++) smBx(R.w - 0.3 - k * 0.5, 0.22, R.d - 0.3 - k * 0.4, k ? smSH.stoneDk : smSH.stone, R.cx, 0.11 + k * 0.22, R.cz);
  smBx(1.4, 1.8, 1.0, smSH.stone, R.cx, 1.56, R.cz); smBx(1.6, 0.2, 1.2, smSH.stoneDk, R.cx, 2.55, R.cz);
  smBx(0.35, 2.6, 0.35, smSH.stone, R.cx, 3.95, R.cz); smBx(1.3, 0.35, 0.35, smSH.stone, R.cx, 4.5, R.cz);
  const ins = smCanvas(256, 256, (x, W, H) => { x.fillStyle = '#b8b2a3'; x.fillRect(0, 0, W, H); x.fillStyle = '#3a362e'; x.textAlign = 'center'; x.font = '600 26px Georgia'; x.fillText('TO THE MEN OF', W / 2, 46); x.fillText('HAWTHORNE', W / 2, 78); x.font = '18px Georgia'; for (let k = 0; k < 7; k++) x.fillText(['A. ASHWORTH', 'J. BRIDGES', 'T. COLLINS', 'W. DARBY', 'H. ELLIS', 'R. FENWICK', 'S. GREAVES'][k], W / 2, 112 + k * 20); });
  for (const s of [-1, 1]) smPic(1.1, 1.1, smTexM(ins, true), R.cx, 1.6, R.cz + s * 0.505, [0, s]);
  // the missing: photos and notes taped round the pedestal (on its faces)
  const notes = smCanvas(256, 256, (x, W, H) => { const r = seeded(77); for (let k = 0; k < 16; k++) { x.save(); x.translate(20 + r() * 210, 20 + r() * 210); x.rotate((r() - 0.5) * 0.5); x.fillStyle = r() < 0.5 ? '#e8e4da' : '#d8cfa8'; x.fillRect(-22, -28, 44, 56); x.fillStyle = r() < 0.6 ? `hsl(${r() * 40},20%,${30 + r() * 20}%)` : '#555'; x.fillRect(-16, -22, 32, 26); x.fillStyle = '#333'; for (let l = 0; l < 3; l++) x.fillRect(-16, 10 + l * 6, 20 + r() * 12, 2); x.restore(); } });
  const nm = new THREE.MeshLambertMaterial({ map: notes, transparent: true, alphaTest: 0.1 }); lit(nm, 'tree');
  for (const s of [-1, 1]) smPic(1.0, 0.9, nm, R.cx + s * 0.705, 1.4, R.cz, [s, 0]);
  for (const s of [-1, 1]) { const w = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 14), SQM.wreath)); w.position.set(R.cx + s * 0.4, 0.82, R.cz + 0.75); w.rotation.x = -1.2; }
  for (const s of [-1, 1]) smBags('x', R.w - 1.2, 3, R.cx, R.cz + s * (R.d / 2 - 0.25));
}
// the newspaper kiosk: green, shuttered and boarded, the last day's headline on its board
function sqKiosk(R) {
  smBx(R.w, 2.4, R.d, SQM.kiosk, R.cx, 1.2, R.cz); smBx(R.w + 0.3, 0.12, R.d + 0.3, SQM.kioskDk, R.cx, 2.5, R.cz); const rf = smPush(new THREE.Mesh(new THREE.ConeGeometry(Math.max(R.w, R.d) * 0.75, 0.8, 4), SQM.kioskDk)); rf.position.set(R.cx, 2.95, R.cz); rf.rotation.y = Math.PI / 4;
  smBoards(R.w - 0.4, 0.8, R.cx, 1.55, R.z1, [0, 1]);
  smPic(R.w - 0.2, 0.3, smTexM(smSignTex('NEWS', '#1f3d2a', '#d8ccb0', R.w - 0.2), true), R.cx, 2.2, R.z1 + 0.01, [0, 1]);
  const hl = smCanvas(256, 160, (x, W, H) => { x.fillStyle = '#efeadc'; x.fillRect(0, 0, W, H); x.fillStyle = '#111'; x.textAlign = 'center'; x.font = 'bold 30px Arial'; x.fillText('STAY INDOORS', W / 2, 52); x.font = 'bold 22px Arial'; x.fillText('ARMY TO EVACUATE', W / 2, 92); x.fillText('TOWN CENTRES', W / 2, 120); });
  smPic(0.7, 0.45, smTexM(hl, true), R.cx + (R.cx < 0 ? -0.5 : 0.5), 0.9, R.z1 + 0.01, [0, 1]);
}
// the churchyard's stone cross (and, east, the beer garden's chestnut gone with it: the same cross, the pub's own war
// memorial by its wall)
function sqCross(x, z) {
  smBx(0.9, 0.35, 0.9, smSH.stoneDk, x, 0.17, z); smBx(0.5, 0.5, 0.5, smSH.stone, x, 0.6, z);
  smBx(0.26, 2.6, 0.26, smSH.stone, x, 2.1, z); smBx(1.0, 0.24, 0.26, smSH.stone, x, 2.85, z);
  const ring = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), smSH.stone)); ring.position.set(x, 2.85, z);
  smFoot(x, z, 0.45, 0.45, 0.45, 0.45);
}
// a triage tent: olive canvas over a frame, its walls rolled down, a red cross on a white panel on each side, guy lines
function sqTent(R) {
  const H = 2.1, rid = 2.85, cx = R.cx, cz = R.cz, W = R.w - 0.1, D = R.d - 0.1;
  smBx(W, H, D, smAPOC.canvas, cx, H / 2, cz);
  for (const s of [-1, 1]) { const p = smBx(W / 2 + 0.25, 0.04, D + 0.1, smAPOC.canvasDk, cx + s * W / 4, (H + rid) / 2, cz); p.rotation.z = -s * Math.atan2(rid - H, W / 2); }
  smBx(0.06, 0.06, D + 0.1, smAPOC.oliveDk, cx, rid + 0.02, cz);
  for (const s of [-1, 1]) { const face = cx + s * (W / 2 + 0.01); smBx(0.02, 0.9, 0.9, smAPOC.white, face, 1.4, cz); smBx(0.025, 0.7, 0.2, smAPOC.cross, face, 1.4, cz); smBx(0.025, 0.2, 0.7, smAPOC.cross, face, 1.4, cz); }
  for (const s of [-1, 1]) { smBx(W * 0.6, 1.6, 0.03, smAPOC.canvasDk, cx, 0.8, cz + s * (D / 2 + 0.01)); }   // (its doors, laced shut)
}
// the old pump house between the churchyard and the beer garden: a stone hut, slate roof, its door boarded
function sqPumpHouse(R) {
  smBx(R.w, 2.4, R.d, smSH.stone, R.cx, 1.2, R.cz); smBx(R.w + 0.2, 0.15, R.d + 0.2, smSH.stoneDk, R.cx, 2.45, R.cz);
  for (const s of [-1, 1]) { const rf = smBx(R.w * 0.62, 0.12, R.d + 0.4, smSH.slate, R.cx + s * R.w * 0.24, 2.85, R.cz); rf.rotation.z = -s * 0.6; }
  smBx(0.9, 1.9, 0.06, smSH.woodDk, R.cx, 0.95, R.z0 - 0.02); smBoards(0.8, 1.2, R.cx, 1.0, R.z0 - 0.02, [0, -1]);
  smSpray('WATER  ✓', '#e8e4da', 1.4, 0.4, R.cx, 2.05, R.z0 - 0.04, [0, -1]);
}
// the army's supplies, stacked over your head: olive crates under a cargo net
function sqSupplies(R) {
  for (let i = R.i0; i <= R.i1; i++) for (let j = R.j0; j <= R.j1; j++) smArmyCrates(cxw(i), cxw(j), 4, 0.92);
  smBx(R.w - 0.05, 0.03, R.d - 0.05, smAPOC.oliveDk, R.cx, 2.02, R.cz);
  for (let k = 0; k < 5; k++) smBx(0.025, 2.0, 0.025, smSH.dark, R.x0 + 0.1 + k * (R.w - 0.2) / 4, 1.0, R.z1 + 0.01);
  smPic(0.8, 0.22, smTexM(smSignTex('RATIONS', '#353b26', '#d8ccb0', 0.8, 'Arial'), true), R.cx, 1.25, R.z1 + 0.012, [0, 1]);
}
// a HESCO bastion: a wire-mesh cage lined with geotextile, filled with sand, its top heaped
function smHesco(R) {
  const W = R.w - 0.06, D = R.d - 0.06, H = 2.05, cx = R.cx, cz = R.cz;
  smBx(W, H, D, smAPOC.mesh, cx, H / 2, cz); smBx(W - 0.1, 0.12, D - 0.1, smAPOC.sand, cx, H + 0.04, cz);
  for (let k = 0; k <= 6; k++) { const t = k / 6; for (const s of [-1, 1]) { smBx(0.02, H, 0.02, smSH.iron, cx - W / 2 + t * W, H / 2, cz + s * (D / 2 + 0.005)); smBx(0.02, H, 0.02, smSH.iron, cx + s * (W / 2 + 0.005), H / 2, cz - D / 2 + t * D); } }
  for (let k = 1; k < 6; k++) for (const s of [-1, 1]) { smBx(W, 0.02, 0.02, smSH.iron, cx, k * H / 6, cz + s * (D / 2 + 0.005)); smBx(0.02, 0.02, D, smSH.iron, cx + s * (W / 2 + 0.005), k * H / 6, cz); }
}
// a café table knocked on its side, its chairs scattered by it
function sqCafe(x, z) {
  const a = rand() * 6.28, t = smCy(0.36, 0.36, 0.04, SQM.table, x + Math.cos(a) * 0.1, 0.38, z + Math.sin(a) * 0.1, 14); t.rotation.set(Math.PI / 2, 0, a);
  const leg = smCy(0.035, 0.035, 0.7, SQM.table, x - Math.sin(a) * 0.3, 0.06, z + Math.cos(a) * 0.3, 6); leg.rotation.set(Math.PI / 2, 0, a);
  for (const s of [-1, 1]) { const c = smBx(0.4, 0.04, 0.4, SQM.chair, x + s * 0.3, 0.2 + (s > 0 ? 0.18 : 0), z - s * 0.2); c.rotation.set(s * 1.2, rr(-1, 1), 0); }
  smFoot(x, z, 0.42, 0.42, 0.42, 0.42);
}
// the low wall along the churchyard (stone, coped) and the beer garden (brick, its trellis torn down)
function sqWall(i, j, x, z) {
  const west = x < 0, along = smKIND(i - 1, j) === 'w' || smKIND(i + 1, j) === 'w' ? 'x' : 'z';
  if (west) { smBxA(along, 1.0, 0.85, 0.42, smSH.stoneLo, x, 0.425, z); smBxA(along, 1.02, 0.1, 0.5, smSH.stoneLoDk, x, 0.9, z); }
  else { smBxA(along, 1.0, 0.8, 0.36, lam(0x7e4434), x, 0.4, z); smBxA(along, 1.02, 0.08, 0.42, lam(0xc8c0b0), x, 0.84, z); }
}
// a fresh grave (west: a mound of earth, a wooden cross with a name on it, a few flowers) or a picnic table turned on
// its side for a barricade (east)
function sqGrave(x, z) {
  if (x < 0) {
    const m = smBx(0.8, 0.32, 1.7, rand() < 0.5 ? SQM.mound : SQM.moundDk, x, 0.12, z + 0.1); m.rotation.y = rr(-0.08, 0.08);
    smBx(0.07, 0.9, 0.05, SQM.crossW, x, 0.45, z - 0.7); smBx(0.45, 0.07, 0.05, SQM.crossW, x, 0.68, z - 0.7);
    for (let k = 0; k < 3; k++) smBx(0.08, 0.08, 0.08, smSH.flower[k], x + rr(-0.25, 0.25), 0.3, z + rr(-0.3, 0.6));
    smFoot(x, z, 0.4, 0.75, 0.4, 0.75);
  } else {
    const top = smBx(0.08, 0.72, 1.0, SQM.picnic, x - 0.15, 0.36, z); top.rotation.z = 0.05;
    for (const s of [-1, 1]) smBx(0.25, 0.04, 0.95, SQM.picnic, x + 0.2, 0.1 + (s > 0 ? 0.62 : 0), z);
    for (const s of [-1, 1]) smBx(0.7, 0.06, 0.06, SQM.picnic, x + 0.15, 0.4, z + s * 0.35);
    smFoot(x, z, 0.4, 0.5, 0.4, 0.5);
  }
}
// the army's crates by the road (low): two stacked, the lid of one off, a box of field dressings in it
function sqCrates(x, z) { smArmyCrates(x, z, 2); smBx(0.4, 0.08, 0.25, smAPOC.white, x, 1.02, z); smFoot(x, z, 0.48, 0.48, 0.48, 0.48); }
// a run of sandbags in a cell, along the way the checkpoint's ring runs (across the square's way through)
function sqBags(i, j, x, z) { smBags('x', 0.98, 5, x, z); cellBox[idx(i, j)] = [x - 0.5, z - 0.22, x + 0.5, z + 0.22]; }
// the edges: the shops along the north (sqNorth); along the south the churchyard's stone wall (west, a yew hedge over
// it) and the Hawthorne Arms' single-storey back (east, its windows boarded); at each end the road closed by the army's
// barricade between the corner buildings. Beyond, the town: what stands to the north and west (behind the map as it's
// seen from above) as tall as it likes, the church's tower with its spire over the shops' roofs as a landmark (a
// banner off it: HELP); what's to the south and east (between it and the camera) kept low, the roads on out of town
// with the queue of cars left in them, garden walls
function sqEdges() {
  for (let i = SM_B[0] + 1; i < SM_B[2]; i++) {
    const x = cxw(i), z = smZ1 - 0.5, west = x < 0;
    if (west) { smBx(1, 1.4, 0.6, smSH.stone, x, 0.7, z); smBx(1.02, 0.1, 0.66, smSH.stoneDk, x, 1.45, z); if (rand() < 0.8) { const h = smPush(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), smSH.yew)); h.position.set(x, 1.75, z + 0.55); h.scale.set(1, 0.9, 0.7); } }
    else { smBx(1, 2.4, 0.6, SQM.brick[0], x, 1.2, z); smBx(1.02, 0.12, 0.66, SQM.trim, x, 2.45, z); if (i % 3 === 0) smBoards(0.8, 1.0, x, 1.45, z - 0.31, [0, -1]); }
  }
  smPic(3.4, 0.5, smTexM(smSignTex('The Hawthorne Arms · Beer Garden', '#1f3a2a', '#c8a65a', 3.4), true), smX1 - 9, 2.05, smZ1 - 0.81, [0, -1]);
  smSpray('CLOSED', '#b2271f', 2.2, 0.55, smX1 - 4.5, 1.6, smZ1 - 0.81, [0, -1]);
  // the church's tower and spire, north-west over the shops' roofs: the landmark you see from anywhere in the square
  { const cx = smX0 + 5, cz = smZ0 - 7; smBx(3.4, 13, 3.4, smSH.stone, cx, 6.5, cz); smBx(3.7, 0.4, 3.7, smSH.stoneDk, cx, 13.1, cz); const sp = smPush(new THREE.Mesh(new THREE.ConeGeometry(2.3, 6.5, 4), smSH.slate)); sp.position.set(cx, 16.5, cz); sp.rotation.y = Math.PI / 4;
    for (const [dx, dz] of [[0, 1.71], [1.71, 0]]) { const c = smPush(new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), lam(0xd8d2c4))); c.position.set(cx + dx, 10.5, cz + dz); c.rotation.y = dx ? Math.PI / 2 : 0; }
    const ban = smCanvas(128, 512, (x, W, H) => { x.fillStyle = '#e8e4da'; x.fillRect(0, 0, W, H); x.fillStyle = '#b2271f'; x.font = 'bold 96px Arial'; x.textAlign = 'center'; ['H', 'E', 'L', 'P'].forEach((c, k) => x.fillText(c, W / 2, 110 + k * 112)); });
    smPic(1.2, 4.6, smTexM(ban, true), cx, 7.4, cz + 1.73, [0, 1]);
    smBx(9, 6, 6, smSH.stone, cx + 6, 3, cz - 1); const r1 = smBx(9.4, 0.18, 4.2, smSH.slate, cx + 6, 6.9, cz - 2.4); r1.rotation.x = 0.7; const r2 = smBx(9.4, 0.18, 4.2, smSH.slate, cx + 6, 6.9, cz + 0.4); r2.rotation.x = -0.7; }
  // the backs of the High Street behind the shops: a second row of roofs (north, behind from above), smoke off one
  for (let x = smX0 + 9; x < smX1 + 6; x += 6.5) { const h = rr(6, 9); smBx(6.2, h, 5, SQM.render[Math.floor(rand() * 4)], x, h / 2, smZ0 - 4.5); const rf = smBx(6.4, 0.16, 3.4, smSH.slate, x, h + 0.9, smZ0 - 5.6); rf.rotation.x = -0.6; }
  // each end: the road closed by the army's barricade (concrete blocks across it, coils of wire over them, its sign),
  // the queue of cars left in the road beyond
  for (const s of [-1, 1]) smEndBarricade(s, 'EVACUATION POINT · CLOSED', s < 0 ? 'west' : 'east');
  for (const s of [-1, 1]) {
    const ex = s < 0 ? smX0 + 0.5 : smX1 - 0.5;
    if (s < 0) for (const z of [smZ0 + 2.5, smZ1 - 2.5]) { smBx(10, 6, 5, SQM.render[z < 0 ? 2 : 3], ex - 6, 3, z); const rf = smBx(10.2, 0.16, 3.2, smSH.slate, ex - 6, 6.8, z); rf.rotation.z = 0.5; }
    else for (const z of [smZ0 + 2.5, smZ1 - 2.5]) { smBx(8, 1.1, 0.4, SQM.brick[2], ex + 5, 0.55, z + (z < 0 ? 2.3 : -2.3)); for (let k = 0; k < 3; k++) smTree(ex + 3 + k * 3, z, 'dead'); }
  }
  // the town round it: pavement-grey ground, lawns gone to seed south and east (low), dead trees
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lam(0x5f625b)); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.02; gnd.receiveShadow = true; smG.add(gnd);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), lam(0x6a7448)); lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, -0.01, smZ1 + 8); lawn.receiveShadow = true; smG.add(lawn);
  for (let k = 0; k < 8; k++) smTree(-22 + k * 6.3 + rr(-1, 1), smZ1 + 5 + rr(0, 6), 'dead');
  for (let x = -24; x <= 24; x += 2) smBx(2, 0.8, 0.3, smSH.stoneLo, x, 0.4, smZ1 + 2.6);
}
// the army's barricade across the road at one end (s: -1 west, 1 east): concrete blocks along the edge, razor wire coiled
// over them, its sign, and beyond it the road on out of town with the cars that queued for the coaches
function smEndBarricade(s, text, seedName) {
  const ex = s < 0 ? smX0 + 0.5 : smX1 - 0.5, z0 = smZc(6) - 0.5, z1 = smZc(19) + 0.5;
  for (let z = z0 + 0.5; z < z1; z += 1.0) { smBx(0.6, 0.9, 0.96, smSH.stoneLo, ex, 0.45, z); smBx(0.3, 0.12, 0.96, smSH.stoneLoDk, ex, 0.95, z); }
  for (let z = z0 + 0.3; z < z1 - 0.2; z += 0.36) { const c = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 4, 14), smAPOC.wire)); c.position.set(ex, 1.32, z); c.rotation.y = Math.PI / 2 + rr(-0.15, 0.15); }
  smPic(1.9, 0.9, smTexM(smSignTex(text, '#b2271f', '#ffffff', 1.9, 'Arial'), true), ex - s * 0.31, 1.45, smZc(10), [-s, 0]);
  smBx(16, 0.02, 14, lam(0x3a3b3e), ex + s * 8.5, -0.005, (z0 + z1) / 2);
  const cols = [0x2c4a6a, 0x8a8a86, 0x7a2a24, 0x3e5a46, 0xb8b2a0];
  for (let k = 0; k < 4; k++) { const x = ex + s * (3.2 + (k >> 1) * 5.4), cz = (z0 + z1) / 2 + (k % 2 ? 2.2 : -2.2); smCar({ w: 4.2, d: 2.0, cx: x, cz }, k === 3, cols[(k + seedName.length) % 5]); }
}
function squareBuild(g) {
  smG = g; smPARTS = []; smPLAN = SQ_PLAN;
  sqFloor(); sqNorth(); sqEdges();
  for (let j = SM_B[1]; j <= SM_B[3]; j++) for (let i = SM_B[0]; i <= SM_B[2]; i++) {
    const k = smKIND(i, j), x = cxw(i), z = cxw(j);
    if (k === 'h' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.w >= 4) sqCorner(R); else if (R.d >= 4) sqTent(R); else sqPumpHouse(R); }
    else if (k === 'V' && smFirst(i, j, k)) sqCoach(smRectOf(i, j, k));
    else if (k === 'U' && smFirst(i, j, k)) sqGenerator(smRectOf(i, j, k));
    else if (k === 'H' && smFirst(i, j, k)) smHesco(smRectOf(i, j, k));
    else if (k === 'X' && smFirst(i, j, k)) sqSupplies(smRectOf(i, j, k));
    else if (k === 'M' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.w >= 4) sqMemorial(R); else if (R.w === 1 && R.d === 1) sqCross(x, z); else sqKiosk(R); }
    else if (k === 'c' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.w >= 3) smCar(R, true); else sqCafe(x, z); }
    else if (k === 'T') smTree(x, z, z > 6 ? 'yew' : 'dead');
    else if (k === 'k') sqCrates(x, z);
    else if (k === 's') sqBags(i, j, x, z);
    else if (k === 'w') sqWall(i, j, x, z);
    else if (k === 'g') sqGrave(x, z);
  }
  for (const [x, z] of SQ_LAMPS) smLampPost(x, z);
  const parts = smPARTS; smG = smPARTS = null; return parts;
}
// the lamps (world), lit as it gets dark: at the corner shops' kerb, at the coaches' ends, at the memorial's front
// corners, at the churchyard's gate (each in a cell beside cover)
const SQ_LAMPS = [[-10.4, -6.4], [10.4, -6.4], [-9.5, -5.1], [9.5, -5.1], [-2.2, -3.8], [2.2, -3.8], [-6.4, 6.6], [6.4, 6.6]];

// ======================================================================================================================
// SALTMARSH QUAY
// The story: the last boats left from here. The cars queued along the back lane for a ferry that never came back (one
// still there, a case on its roof); the harbourmaster's pickup by his office; the fish market's open hall turned into a
// field hospital, an ambulance across its north end, the medical supplies stacked on pallets either side of where the
// flag stands, stretchers on their trestles, the lifeboat dragged out of the water and left on its side across its
// south end; a fish lorry abandoned across the quay road at each end; the quayside along the water south, bollards,
// lobster pots, the crane at the edge in the middle; the ice house and the burned-out boat shed on the corners. Each
// end the quay road closed by the army's barricade.
const QYM = {
  conc: 'rgb(132,130,122)', lane: 'rgb(72,72,74)',
  shed: [smTall(0x55646b), smTall(0x6e5236), smTall(0x60705f), smTall(0x7e7e76)], shedDk: smTall(0x353c40), render: [smTall(0xcfcbc0), smTall(0xc2b69f), smTall(0xaebdc2)],
  lorry: smTall(0xdcdad2), lorryDk: smTall(0x2a2e33), lorryCab: smTall(0x2f5a8a), pickup: smTall(0x3e5a46), amb: smTall(0xe2dc4a), ambW: smTall(0xe8e6de), ambB: smTall(0x2f5aa8),
  lifeboat: smTall(0xd8642a), lifeboatW: smTall(0xe0dcd0), lifeboatDk: smTall(0x2a3a4a),
  post: smTall(0x5a6266), roof: lam(0x5e6a70), boxB: lam(0x2f6aa0), boxR: lam(0xb8432a), boxY: lam(0xd8b23a), boxG: lam(0x3e8a5a),
  boxBT: smTall(0x2f6aa0), boxRT: smTall(0xb8432a), boxYT: smTall(0xd8b23a), boxGT: smTall(0x3e8a5a), tarp: smTall(0x2f4a6a),
  pot: lam(0x3a4a3e), potNet: lam(0x2a8a7a), steel: lam(0xb8bcc0), steelDk: lam(0x5a5e62), rope: lam(0xb8a070), crane: smTall(0xc8962a), craneDk: smTall(0x5a4a32),
  water: lam(0x29505e, { transparent: true, opacity: 0.92 }), floats: lam(0xe0662a), pallet: lam(0x9a7b52), blanket: lam(0x5a6a4a), blanketB: lam(0x7a2a24)
};
function qyFloor() {
  const t = smFloorTex((x, P, r) => {
    x.fillStyle = QYM.conc; x.fillRect(0, 0, SM_W * P, SM_D * P);
    for (let k = 0; k < 7000; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '100,98,92' : '160,158,150'},0.35)`; x.fillRect(r() * SM_W * P, r() * SM_D * P, 2, 2); }
    x.strokeStyle = 'rgba(70,68,62,0.6)'; x.lineWidth = 2; for (let i = 1; i < SM_W; i += 4) { x.beginPath(); x.moveTo(i * P, 6 * P); x.lineTo(i * P, SM_D * P); x.stroke(); } for (let j = 6; j < SM_D; j += 4) { x.beginPath(); x.moveTo(0, j * P); x.lineTo(SM_W * P, j * P); x.stroke(); }
    // the back lane's tarmac (rows 1-5), the quay road's at each end (cols 0-8, rows 6-19)
    x.fillStyle = QYM.lane; x.fillRect(1 * P, 1 * P, (SM_W - 2) * P, 5 * P);
    for (const s of [0, 1]) { const i0 = s ? SM_W - 9 : 0; x.fillStyle = QYM.lane; x.fillRect(i0 * P, 6 * P, 9 * P, 14 * P); }
    for (let k = 0; k < 1800; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '95,95,98' : '50,50,52'},0.5)`; x.fillRect(r() * SM_W * P, r() * 6 * P, 2, 2); }
    // the ferry queue's lane markings along the back lane: FERRY painted at each end
    for (const s of [0, 1]) { x.save(); x.translate((s ? SM_W - 7 : 7) * P, 2.4 * P); x.fillStyle = 'rgba(232,230,220,0.5)'; x.font = `bold ${P * 0.9}px Arial`; x.textAlign = 'center'; x.fillText('FERRY', 0, 0); x.restore(); }
    x.strokeStyle = 'rgba(228,190,52,0.7)'; x.lineWidth = 4; x.setLineDash([P * 0.8, P * 0.5]); x.beginPath(); x.moveTo(4 * P, 3 * P); x.lineTo((SM_W - 4) * P, 3 * P); x.stroke(); x.setLineDash([]);
    // the quay's edge: granite setts along the water, a yellow line inside them
    smSetts(x, P, r, 1, 23.6, SM_W - 1, 25, 'rgb(142,136,124)', 0.35, 'rgba(60,56,50,0.5)');
    x.strokeStyle = 'rgba(228,190,52,0.85)'; x.lineWidth = 5; x.beginPath(); x.moveTo(4 * P, 23.5 * P); x.lineTo((SM_W - 4) * P, 23.5 * P); x.stroke();
    // under the market's roof: the wet slab, the drains, the field hospital's bays taped out on it and numbered, a red
    // cross painted where the flag stands
    x.fillStyle = 'rgba(64,76,82,0.45)'; x.fillRect(10 * P, 8 * P, 12 * P, 10 * P);
    x.fillStyle = 'rgba(40,40,40,0.6)'; for (let i = 10.5; i < 21.5; i += 1.5) x.fillRect(i * P, 12.9 * P, 0.8 * P, 0.15 * P);
    x.strokeStyle = 'rgba(232,230,220,0.55)'; x.lineWidth = 3; let bay = 1;
    for (const [i0, j0] of [[13.2, 9.2], [17.2, 9.2], [13.2, 14.6], [17.2, 14.6]]) { x.strokeRect(i0 * P, j0 * P, 1.6 * P, 2.2 * P); x.fillStyle = 'rgba(232,230,220,0.55)'; x.font = `bold ${P * 0.4}px Arial`; x.fillText(String(bay++), (i0 + 0.15) * P, (j0 + 0.5) * P); }
    x.fillStyle = 'rgba(170,40,34,0.7)'; x.fillRect(15.4 * P, 12.0 * P, 1.2 * P, 2.0 * P); x.fillRect(15.0 * P, 12.4 * P, 2.0 * P, 1.2 * P);
    // puddles, rust, fish scales, blood
    for (let k = 0; k < 34; k++) { const R = (0.3 + r() * 1.2) * P, g = x.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(66,86,96,0.45)'); g.addColorStop(1, 'rgba(66,86,96,0)'); x.save(); x.translate(r() * SM_W * P, (6 + r() * 17) * P); x.scale(1, 0.5); x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill(); x.restore(); }
    smBlood(x, P, r, 30);
    smGrime(x, P, r, 60, '90,60,40');
  });
  return smFloor(t, 'concrete', [['asphalt', 1, 1, -1, 6], ['asphalt', 0, 6, 9, 20], ['asphalt', SM_W - 9, 6, SM_W, 20], ['granite', 1, 23.6, -1, 25]]);
}
// the harbour buildings along the north edge: corrugated sheds and painted fronts, their roller doors pulled down,
// their windows boarded, what was sprayed on them
const QY_SPRAY = [['LAST BOAT 6AM', '#e8e4da'], ['NO FERRY', '#b2271f'], ['FISH CO  EMPTY', '#1e1e1e'], ['WAIT FOR US', '#e8e4da'], ['THEY CAME FROM THE SEA', '#b2271f']];
function qyNorth() {
  const fz = smZ0 + 1, names = ['Saltmarsh Fish Co.', 'Harbour Chandlery', 'Pellow & Sons', 'Net Loft', 'Saltmarsh Fish Co.'];
  let x = smX0 + 1, n = 0;
  while (x < smX1 - 1.01) {
    const w = Math.min(smX1 - 1 - x, [5.0, 4.4, 5.6][n % 3]), cx = x + w / 2, H = [5.0, 6.2, 4.6][n % 3], mat = n % 2 ? QYM.render[n % 3] : QYM.shed[n % 4];
    smBx(w, H, 0.6, mat, cx, H / 2, fz - 0.3);
    if (n % 2 === 0) for (let k = 0; k < w / 0.3; k++) smBx(0.06, H, 0.04, QYM.shedDk, x + k * 0.3 + 0.15, H / 2, fz + 0.01);   // (its corrugations)
    smBx(2.2, 2.6, 0.06, QYM.shedDk, cx - w / 4, 1.3, fz + 0.03); for (let k = 0; k < 6; k++) smBx(2.2, 0.03, 0.08, mat, cx - w / 4, 0.2 + k * 0.45, fz + 0.05);   // a roller door
    smBoards(0.9, 0.9, cx + w / 4, 1.8, fz + 0.03, [0, 1]);
    smPic(Math.min(w - 0.6, 3.6), 0.5, smTexM(smSignTex(names[n % names.length], '#1f3a4a', '#d8ccb0', Math.min(w - 0.6, 3.6)), true), cx, H - 0.8, fz + 0.04, [0, 1]);
    smSpray(QY_SPRAY[n % QY_SPRAY.length][0], QY_SPRAY[n % QY_SPRAY.length][1], Math.min(w - 0.5, 3.4), 0.6, cx, 3.05, fz + 0.05, [0, 1]);
    const roof = smBx(w, 0.1, 2.6, QYM.roof, cx, H + 0.6, fz - 1.2); roof.rotation.x = 0.45;
    x += w; n++;
  }
}
// the ice house (north corners) and the boat shed (south corners, burned out: its walls black, its roof gone to its
// rafters)
function qyCorner(R) {
  const north = R.cz < 0, west = R.cx < 0, H = north ? 5.2 : 3.2, fx = west ? R.x1 : R.x0, dX = west ? 1 : -1;
  if (north) {
    smBx(R.w, H, R.d, QYM.render[0], R.cx, H / 2, R.cz);
    const rf = smBx(R.w + 0.3, 0.12, R.d + 0.3, QYM.roof, R.cx, H + 0.06, R.cz); rf.rotation.z = west ? 0.12 : -0.12;
    smBx(0.06, 2.2, 1.6, QYM.shedDk, fx + dX * 0.02, 1.1, R.cz); smPic(2.4, 0.5, smTexM(smSignTex('ICE', '#2f6aa0', '#ffffff', 2.4, 'Arial'), true), fx + dX * 0.06, 3.4, R.cz, [dX, 0]);
    smSpray('BODIES', '#b2271f', 2.6, 0.6, fx + dX * 0.05, 2.5, R.cz, [dX, 0]);
  } else {
    smBx(R.w, H, R.d, smAPOC.soot, R.cx, H / 2, R.cz);
    for (let k = 0; k < R.w / 0.3; k++) smBx(0.06, H - rr(0, 1.2), 0.04, smSH.dark, R.x0 + k * 0.3 + 0.15, (H - 0.6) / 2, R.z0 - 0.01);
    for (let k = 0; k < 5; k++) { const rf = smBx(0.1, 0.12, R.w + 0.3, smSH.dark, R.cx, H + 0.4, R.z0 + 0.5 + k * (R.d - 1) / 4); rf.rotation.y = Math.PI / 2; rf.rotation.x = rr(-0.15, 0.15); }
    smBx(0.06, 2.4, 2.0, smSH.dark, fx + dX * 0.02, 1.2, R.cz);
  }
}
// the fish lorry abandoned across the quay road (the spawn's cover): its cab at the north end, its refrigerated box,
// the merchant's name down its side, its doors hanging open at the back; or the harbourmaster's pickup; or the
// ambulance across the field hospital's north end (rounds go under all three from your own eyes: under)
function qyLorry(R) {
  const L = R.d - 0.2, W = Math.min(1.95, R.w - 0.05), cx = R.cx, cz = R.cz, sq = R.cx < 0 ? 1 : -1, cab = 2.0;
  smBx(W - 0.3, 0.25, L, QYM.lorryDk, cx, 0.6, cz);
  smBx(W, 2.15, L - cab - 0.1, QYM.lorry, cx, 1.85, cz + cab / 2 + 0.05);
  smBx(W, 1.7, cab, QYM.lorryCab, cx, 1.55, cz - L / 2 + cab / 2); smBx(W - 0.1, 0.7, 0.04, smSH.glass, cx, 1.95, cz - L / 2 - 0.01);
  for (const s of [-1, 1]) smBx(0.04, 0.6, 0.8, smSH.glass, cx + s * W / 2, 1.95, cz - L / 2 + 0.7);
  smBx(W * 0.8, 0.5, 0.6, QYM.lorryDk, cx, 3.1, cz - L / 2 + cab + 0.4);   // (its fridge unit)
  smPic(L - cab - 1.0, 0.7, smTexM(smSignTex('PELLOW & SONS · FRESH FISH', '#dcdad2', '#1f3a4a', L - cab - 1.0, 'Arial'), true), cx + sq * (W / 2 + 0.01), 2.1, cz + cab / 2, [sq, 0]);
  smSpray('HELP', '#b2271f', 1.6, 0.6, cx - sq * (W / 2 + 0.01), 2.0, cz + 1.2, [-sq, 0]);
  for (const zz of [cz - L / 2 + 1.0, cz + L / 2 - 2.2, cz + L / 2 - 1.2]) for (const s of [-1, 1]) smWheel(0.48, 0.3, cx + s * (W / 2 - 0.12), 0.48, zz);
  for (const s of [-1, 1]) { const d = smBx(0.05, 2.0, W / 2 - 0.1, QYM.lorry, cx + s * (W / 2 - 0.05), 1.85, cz + L / 2 - 0.3); d.rotation.y = s * 0.2; }
}
function qyPickup(R) {
  const L = R.w - 0.25, W = Math.min(1.8, R.d - 0.2), cx = R.cx, cz = R.cz, fw = R.cx < 0 ? -1 : 1;
  smBx(L, 0.7, W, QYM.pickup, cx, 0.85, cz); smBx(L * 0.4, 0.75, W - 0.1, QYM.pickup, cx + fw * L * 0.14, 1.55, cz); smBx(L * 0.4 + 0.02, 0.5, W - 0.14, smSH.glass, cx + fw * L * 0.14, 1.6, cz);
  for (const s of [-1, 1]) smBx(L * 0.45, 0.4, 0.06, QYM.pickup, cx - fw * L * 0.27, 1.35, cz + s * (W / 2 - 0.05));
  for (let k = 0; k < 3; k++) smBx(0.5, 0.25, 0.4, [QYM.boxB, QYM.boxR, QYM.boxY][k], cx - fw * (L * 0.15 + k * 0.45), 1.3, cz);
  for (const xx of [cx - L / 2 + 0.7, cx + L / 2 - 0.7]) for (const s of [-1, 1]) { const t = smCy(0.4, 0.4, 0.24, smSH.tyre, xx, 0.4, cz + s * (W / 2 - 0.08), 14); t.rotation.x = Math.PI / 2; }
}
function qyAmbulance(R) {
  const L = R.w - 0.25, W = Math.min(1.95, R.d - 0.1), cx = R.cx, cz = R.cz;
  smBx(L - 0.2, 0.25, W - 0.3, QYM.lorryDk, cx, 0.6, cz);
  smBx(L * 0.7, 2.0, W, QYM.ambW, cx - L * 0.15, 1.75, cz); smBx(L * 0.3, 1.45, W, QYM.ambW, cx + L * 0.35, 1.45, cz); smBx(0.04, 0.6, W - 0.2, smSH.glass, cx + L / 2 - 0.02, 1.85, cz);
  // its Battenburg checks, yellow and blue, along both sides
  const bt = smCanvas(256, 64, (x, Wd, H) => { for (let k = 0; k < 8; k++) for (let l = 0; l < 2; l++) { x.fillStyle = (k + l) % 2 ? '#2f5aa8' : '#e2dc4a'; x.fillRect(k * 32, l * 32, 32, 32); } });
  for (const s of [-1, 1]) { smPic(L * 0.68, 0.5, smTexM(bt, true), cx - L * 0.15, 1.2, cz + s * (W / 2 + 0.01), [0, s]); smPic(L * 0.45, 0.35, smTexM(smSignTex('AMBULANCE', '#e8e6de', '#2f5aa8', L * 0.45, 'Arial'), true), cx - L * 0.15, 2.2, cz + s * (W / 2 + 0.01), [0, s]); }
  for (const s of [-1, 1]) smBx(0.2, 0.12, 0.4, s < 0 ? smGlowM(0x3a6aff) : smSH.chrome, cx + L * 0.1, 2.8, cz + s * 0.4);
  for (const xx of [cx - L / 2 + 0.7, cx + L / 2 - 0.9]) for (const s of [-1, 1]) { const t = smCy(0.4, 0.4, 0.24, smSH.tyre, xx, 0.4, cz + s * (W / 2 - 0.1), 14); t.rotation.x = Math.PI / 2; }
}
// the harbour office's porch (north, middle) and the crane's base at the quay's edge (south, middle)
function qyOffice(R) {
  smBx(R.w, 2.6, R.d, QYM.render[2], R.cx, 1.3, R.cz); const rf = smBx(R.w + 0.4, 0.12, R.d + 0.4, QYM.roof, R.cx, 2.75, R.cz); rf.rotation.x = 0.15;
  smBx(1.0, 2.1, 0.06, QYM.shedDk, R.cx, 1.05, R.z1 + 0.02); smBoards(0.9, 1.9, R.cx, 1.05, R.z1 + 0.03, [0, 1]);
  smPic(R.w - 0.2, 0.4, smTexM(smSignTex('HARBOUR OFFICE', '#1f3a4a', '#d8ccb0', R.w - 0.2, 'Arial'), true), R.cx, 2.35, R.z1 + 0.04, [0, 1]);
  const notice = smCanvas(256, 192, (x, W, H) => { x.fillStyle = '#efeadc'; x.fillRect(0, 0, W, H); x.fillStyle = '#111'; x.textAlign = 'center'; x.font = 'bold 26px Arial'; x.fillText('FERRY SUSPENDED', W / 2, 44); x.font = '18px Arial'; ['Last sailing 06:00', 'One bag per person', 'No pets  No vehicles', 'By order'].forEach((l, k) => x.fillText(l, W / 2, 84 + k * 26)); });
  smPic(0.6, 0.45, smTexM(notice, true), R.cx + 0.7, 1.4, R.z1 + 0.04, [0, 1]);
}
function qyCrane(R) {
  smBx(R.w, 0.9, R.d, smSH.stone, R.cx, 0.45, R.cz); smBx(1.4, 2.0, 1.4, QYM.crane, R.cx, 1.9, R.cz); smBx(1.6, 0.8, 1.6, QYM.craneDk, R.cx, 3.2, R.cz);
  smBx(1.0, 0.9, 1.2, QYM.crane, R.cx, 3.9, R.cz + 0.2); smBx(0.8, 0.6, 0.04, smSH.glass, R.cx, 3.95, R.cz - 0.42);
  const jib = smBx(0.35, 0.35, 9, QYM.crane, R.cx, 6.0, R.cz + 3.6); jib.rotation.x = -0.5;
  smCy(0.02, 0.02, 4.4, smSH.iron, R.cx, 5.6, R.cz + 7.6, 4); smBx(0.5, 0.3, 0.3, QYM.craneDk, R.cx, 3.3, R.cz + 7.6);
}
// the lifeboat dragged out of the water and left on its side across the field hospital's south end: orange topsides, a
// white superstructure, its keel toward the quay
function qyLifeboat(R) {
  const L = R.w - 0.3, cx = R.cx, H = 1.95, deckZ = R.z0 + 0.72, dep = 1.1;
  // (its side profile, deck line to keel, the bow rising at +x: lying on its side, that's what you see from above,
  // the beam standing up as its height)
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.quadraticCurveTo(L / 2 - 0.4, -dep * 0.9, L / 2 - 1.6, -dep); sh.lineTo(-L / 2 + 0.35, -dep); sh.lineTo(-L / 2, -0.25); sh.lineTo(-L / 2, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: H - 0.24, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 8 });
  const hull = smPush(new THREE.Mesh(geo, QYM.lifeboat)); hull.rotation.x = -Math.PI / 2; hull.position.set(cx, 0.12, deckZ); hull.castShadow = hull.receiveShadow = true;
  smBx(L - 0.2, H - 0.1, 0.1, QYM.lifeboatDk, cx, H / 2, deckZ - 0.02);   // (the gunwale's dark band along its deck line)
  smBx(L * 0.8, 0.12, 0.14, QYM.lifeboatDk, cx - 0.2, 0.1, deckZ + dep + 0.05);   // (its keel, toward the quay)
  smBx(L * 0.42, 1.25, 0.6, QYM.lifeboatW, cx - L * 0.08, 0.95, deckZ - 0.34); smBx(L * 0.42 + 0.02, 0.35, 0.62, smSH.glass, cx - L * 0.08, 1.2, deckZ - 0.34);   // (the wheelhouse, sticking out off its deck)
  smPic(2.2, 0.35, smTexM(smSignTex('RNLB  SALTMARSH', '#d8642a', '#ffffff', 2.2, 'Arial'), true), cx + 0.6, H + 0.005, deckZ + 0.55, [0, 1]).rotation.x = -Math.PI / 2;
}
// a market post (the roof over the field hospital on its four: overhead, from your own eyes)
function qyPost(x, z) { smBx(0.3, 4.2, 0.3, QYM.post, x, 2.1, z); smBx(0.5, 0.2, 0.5, QYM.post, x, 0.1, z); smFoot(x, z, 0.18, 0.18, 0.18, 0.18); }
// supplies stacked over your head: pallets of medical boxes under a blue tarp (the field hospital's), or fish boxes
// stacked high, each stack one merchant's colour (by the quay)
function qySupplies(R, fish) {
  for (let i = R.i0; i <= R.i1; i++) for (let j = R.j0; j <= R.j1; j++) {
    const x = cxw(i), z = cxw(j);
    if (fish) { const cols = [QYM.boxBT, QYM.boxRT, QYM.boxYT, QYM.boxGT], own = cols[Math.floor(rand() * 4)]; for (const [dx, dz] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) for (let k = 0; k < 8; k++) smBx(0.46, 0.24, 0.36, rand() < 0.9 ? own : cols[Math.floor(rand() * 4)], x + dx + rr(-0.02, 0.02), 0.12 + k * 0.25, z + dz); }
    else { smBx(0.96, 0.14, 0.96, QYM.pallet, x, 0.07, z); for (let l = 0; l < 4; l++) for (const [dx, dz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) smBx(0.46, 0.46, 0.46, l % 2 ? smAPOC.plyT : smTall(0xd8d2c0), x + dx, 0.38 + l * 0.48, z + dz); }
  }
  if (!fish) { smBx(R.w - 0.02, 0.04, R.d - 0.02, QYM.tarp, R.cx, 2.12, R.cz); for (const s of [-1, 1]) smBx(R.w - 0.02, 0.5, 0.02, QYM.tarp, R.cx, 1.88, R.cz + s * (R.d / 2 - 0.01)); smPic(0.5, 0.5, smTexM(smCanvas(64, 64, (x, W) => { x.fillStyle = '#e8e4da'; x.fillRect(0, 0, W, W); x.fillStyle = '#b2271f'; x.fillRect(24, 8, 16, 48); x.fillRect(8, 24, 48, 16); }), true), R.cx, 1.3, (R.cz < smZc(13) ? R.z1 : R.z0) + (R.cz < smZc(13) ? 0.012 : -0.012), [0, R.cz < smZc(13) ? 1 : -1]); }
}
// lobster pots stacked by the water (low)
function qyPots(x, z) { for (const [dx, dz, y] of [[-0.24, -0.2, 0], [0.24, -0.2, 0], [-0.24, 0.2, 0], [0.24, 0.2, 0], [0, 0, 0.42]]) { const p = smCy(0.22, 0.24, 0.42, QYM.pot, x + dx, 0.21 + y, z + dz, 8); p.rotation.z = Math.PI / 2; smBx(0.4, 0.02, 0.3, QYM.potNet, x + dx, 0.43 + y, z + dz); } }
// a stretcher on its trestles, a blanket over it (what's under it left to you)
function qyStretcher(x, z) {
  for (const s of [-1, 1]) { smBx(0.06, 0.6, 0.6, QYM.steelDk, x + s * 0.4, 0.3, z); smBx(0.9, 0.04, 0.04, QYM.steelDk, x, 0.62, z + s * 0.28); }
  smBx(0.95, 0.05, 0.6, lam(0x4d5536), x, 0.66, z); const b = smBx(0.85, 0.16, 0.56, rand() < 0.5 ? QYM.blanket : QYM.blanketB, x, 0.76, z); b.rotation.y = rr(-0.08, 0.08);
  smFoot(x, z, 0.48, 0.32, 0.48, 0.32);
}
// a bollard on the quay (and a coil of rope by it)
function qyBollard(x, z) { smCy(0.2, 0.24, 0.5, smSH.iron, x, 0.25, z, 10); smCy(0.28, 0.28, 0.08, smSH.iron, x, 0.52, z, 10); const r = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 14), QYM.rope)); r.rotation.x = Math.PI / 2; r.position.set(x + 0.55, 0.07, z - 0.3); smFoot(x, z, 0.3, 0.3, 0.3, 0.3); }
// a low wall of net floats and pallets
function qyFloats(x, z) { smBx(0.95, 0.14, 0.9, QYM.pallet, x, 0.07, z); for (let k = 0; k < 6; k++) { const f = smCy(0.15, 0.15, 0.3, QYM.floats, x - 0.3 + (k % 3) * 0.3, 0.32 + Math.floor(k / 3) * 0.3, z, 10); f.rotation.x = Math.PI / 2; } smBx(0.9, 0.3, 0.8, lam(0x2a5a4a), x, 0.85, z); }
// the market's roof over the field hospital (from your own eyes: from above you look down through it), its lights
let qyRoof = null;
function qyMarketRoof(g) {
  const r = new THREE.Group(), x0 = smXc(10) - 0.5, x1 = smXc(21) + 0.5, z0 = smZc(8) - 0.3, z1 = smZc(17) + 0.3;
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.8, 0.08, (z1 - z0) / 2 + 0.6), QYM.roof); m.position.set((x0 + x1) / 2, 4.55, (z0 + z1) / 2 + s * (z1 - z0) / 4); m.rotation.x = s * 0.18; r.add(m); }
  for (const z of [smZc(9), smZc(16), (z0 + z1) / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.22, 0.14), QYM.post); m.position.set((x0 + x1) / 2, 4.2, z); r.add(m); }
  for (const x of [x0 + 2, (x0 + x1) / 2, x1 - 2]) for (const z of [z0 + 1.5, z1 - 1.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), smGlowM(0xf2f6ff)); m.position.set(x, 4.1, z); r.add(m); }
  r.traverse(o => { o.castShadow = false; }); r.visible = false; g.add(r); qyRoof = r;
}
function qyTick() { if (qyRoof) qyRoof.visible = fpOn(); }
// the edges: the harbour buildings north (qyNorth); the quay's edge south, its granite coping, ladders and lifebuoys,
// the harbour water beyond, a boat half sunk at its mooring, the breakwater and its light; at each end the quay road
// closed by the army's barricade, the cars queued beyond
function qyEdges() {
  const ez = smZ1 - 0.5;
  for (let i = SM_B[0] + 1; i < SM_B[2]; i++) { const x = cxw(i); smBx(1, 0.35, 1, smSH.stoneLo, x, 0.18, ez); smBx(1, 0.08, 1.02, smSH.stoneLoDk, x, 0.37, ez); }
  for (const x of [-11.5, -2.5, 2.5, 11.5]) { smBx(0.5, 0.05, 0.08, smSH.iron, x, 0.3, ez + 0.5); for (const s of [-0.2, 0.2]) smBx(0.04, 2.4, 0.04, smSH.iron, x + s, -0.9, ez + 0.54); }   // (ladders down to the water)
  for (const x of [-7, 7]) { smCy(0.05, 0.05, 1.4, smSH.iron, x, 0.7, ez, 6); const b = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 16), lam(0xe0662a))); b.position.set(x, 1.1, ez - 0.08); }
  const w = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), QYM.water); w.rotation.x = -Math.PI / 2; w.position.set(0, -1.6, smZ1 + 30); w.receiveShadow = true; smG.add(w);
  smBx(smX1 - smX0 + 30, 1.6, 0.4, smSH.stoneLoDk, 0, -0.8, smZ1 + 0.2);
  // the boats left at their moorings (low in the water: they never stand in front of anything from above), one sunk
  // to its wheelhouse
  for (const [x, zz, c, sunk] of [[-9, 4.5, 0, 0], [-2, 6, 2, 1], [6, 4.2, 1, 0], [12, 7, 0, 0]]) { const y = sunk ? -1.0 : 0; smBx(2.2, 0.9, 6.5, QYM.shed[c], x, -1.1 + y, smZ1 + zz); smBx(1.8, 0.06, 5.8, lam(0xd8d2c0), x, -0.62 + y, smZ1 + zz); smBx(1.4, 1.0, 1.6, lam(0xe0dcd0), x, -0.1 + y, smZ1 + zz + 1.2); smCy(0.05, 0.05, 3.2, smSH.iron, x, 1.0 + y, smZ1 + zz - 1, 6); }
  smBx(50, 1.2, 3, smSH.stoneLoDk, -6, -0.6, smZ1 + 26); smCy(0.9, 1.1, 6, lam(0xe8e4da), 18, 2.6, smZ1 + 26, 12); smCy(1.0, 1.0, 1.2, lam(0xb8322a), 18, 6.2, smZ1 + 26, 12); smBx(0.8, 0.6, 0.8, smGlowM(0xfff1c8), 18, 7.1, smZ1 + 26);
  for (const s of [-1, 1]) smEndBarricade(s, 'QUAY CLOSED · ARMY', s < 0 ? 'quayW' : 'quayE');
  // the town climbs the hill behind the harbour (north and west, behind the map from above: its terraces of cottages,
  // roofs stepping up, smoke off one)
  const cols = [0xcfcbc0, 0xc2b69f, 0xaebdc2, 0xccb6a2, 0xb5bfbb];
  for (let row = 0; row < 3; row++) for (let x = smX0 - 10 + row * 2; x < smX1 + 8; x += 4.2) {
    const z = smZ0 - 4 - row * 6, y0 = row * 1.6, h = rr(4.5, 6), c = lam(cols[Math.floor(rand() * cols.length)]);
    smBx(4.1, h + y0, 4.5, c, x, (h + y0) / 2, z); const rf = smBx(4.3, 0.15, 2.8, smSH.slateLo, x, h + y0 + 0.75, z + 1.1); rf.rotation.x = 0.55;
    smBx(0.7, 0.9, 0.05, rand() < 0.5 ? smSH.glassLo : smAPOC.plyDk, x - 0.9, y0 + 2.2, z + 2.26); smBx(0.7, 0.9, 0.05, rand() < 0.5 ? smSH.glassLo : smAPOC.plyDk, x + 0.9, y0 + 2.2, z + 2.26);
    if (rand() < 0.5) smBx(0.5, 1.0, 0.5, lam(0x8a4a36), x + rr(-1.4, 1.4), h + y0 + 1.2, z);
  }
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 70), lam(0x55574f)); gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, -0.02, smZ0 - 25); gnd.receiveShadow = true; smG.add(gnd);
}
function quayBuild(g) {
  smG = g; smPARTS = []; smPLAN = QY_PLAN;
  const fl = qyFloor(); fl.onBeforeRender = qyTick;
  qyNorth(); qyEdges(); qyMarketRoof(g);
  for (let j = SM_B[1]; j <= SM_B[3]; j++) for (let i = SM_B[0]; i <= SM_B[2]; i++) {
    const k = smKIND(i, j), x = cxw(i), z = cxw(j);
    if (k === 'h' && smFirst(i, j, k)) qyCorner(smRectOf(i, j, k));
    else if (k === 'V' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.d > R.w) qyLorry(R); else if (R.w >= 4) qyAmbulance(R); else qyPickup(R); }
    else if (k === 'U' && smFirst(i, j, k)) qyLifeboat(smRectOf(i, j, k));
    else if (k === 'M' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.cz < 0) qyOffice(R); else qyCrane(R); }
    else if (k === 'X' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); qySupplies(R, R.cz > smZc(18)); }
    else if (k === 'c' && smFirst(i, j, k)) smCar(smRectOf(i, j, k), false, x < 0 ? 0x2c4a6a : 0x8a8a86);
    else if (k === 'P') qyPost(x, z);
    else if (k === 'k') { if (z > smZc(18)) qyPots(x, z); else smLuggage(x, z); }
    else if (k === 'b') qyStretcher(x, z);
    else if (k === 'o') qyBollard(x, z);
    else if (k === 'w') qyFloats(x, z);
  }
  for (const [x, z] of QY_LAMPS) smLampPost(x, z);
  const parts = smPARTS; smG = smPARTS = null; return parts;
}
// the lamps (world): by the ice houses' corners, at the lorries' ends, along the quay by the crates
const QY_LAMPS = [[-11.4, -6.4], [11.4, -6.4], [-9.5, -5.1], [9.5, -5.1], [-5.4, 6.6], [5.4, 6.6], [-11.5, 10.4], [11.5, 10.4]];

// ---- the maps as world/arena.js takes them (AR_MAPS)
const smLampList = (L, extra) => () => [...L.map(([x, z]) => ({ arena: true, x, z, r: 9, col: [1, 0.78, 0.5], int: 1.0 })), ...(extra || [])];
export const SQUARE_MAP = {
  id: 'square', name: 'Hawthorne Square', note: 'Small: the town’s evacuation point, the army’s checkpoint round the memorial',
  plan: SQ_PLAN, b: SM_B, h: SQ_H, low: SQ_LOW, vault: SQ_VAULT, walls: '#h', what: SQ_WHAT, build: squareBuild, indoor: false, tod: null, thru: '', small: true,
  under: { V: 0.38 },   // (the coach's chassis: a round from your own eyes goes under it, world/collision.js)
  lights: smLampList(SQ_LAMPS), flares: []
};
export const QUAY_MAP = {
  id: 'quay', name: 'Saltmarsh Quay', note: 'Small: the harbour the last boats left from, the field hospital under the fish market’s roof',
  plan: QY_PLAN, b: SM_B, h: QY_H, low: QY_LOW, vault: QY_VAULT, walls: '#h', what: QY_WHAT, build: quayBuild, indoor: false, tod: null, thru: '', small: true,
  under: { V: 0.45 },   // (the lorries', the pickups' and the ambulance's chassis)
  lights: smLampList(QY_LAMPS, [{ arena: true, x: 0, z: 0, r: 9, col: [0.9, 0.95, 1], int: 0.9 }]), flares: []
};
