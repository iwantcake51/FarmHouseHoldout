// The arena's two small maps, for 1v1 and 2v2: "Hawthorne Square", a market town's square on a Saturday, and
// "Saltmarsh Quay", a fishing harbour's quay at the end of the day. Each one real place, an open space broken up by
// what stands in it rather than rooms with doors in them: its edges are the buildings (or the water) round it, its
// corners the buildings on them, and what you fight round is what's really there, a bus at its stop, the war memorial,
// a market stall, lime trees, a churchyard's low wall and its gravestones; a boat hauled out on its trailer, the fish
// market's open hall on its posts, stacks of fish boxes, the crane at the quay's edge. Their own worlds, not built over
// the farm (world/arena.js arenaUp takes the farm out of the scene). Designed and checked in tools/small-plan.py
// (reachability, spawn sightlines, lane sightlines, corner pinches, one-cell squeezes, timings), the west half (Blue's)
// drawn and mirrored for the east (Red's), each half dressed as its own side of the place:
//  - each spawn the road's end coming in between the corner buildings, behind the bus or the boat parked across it:
//    nothing outside sees in, and two ways out round either end of it
//  - NORTH: the High Street's pavement under the shops (the café's tables, the phone box, the delivery van at the kerb,
//    the newspaper kiosk in the middle); the back lane behind the harbour buildings (fish boxes and pots, the
//    harbourmaster's pickup, the harbour office's porch in the middle). Close to medium
//  - MIDDLE: the square round the war memorial, the flag south of it among the lime trees; the quay apron under the
//    fish market's roof, the flag between its gutting benches. The contest
//  - SOUTH: the churchyard (west) and the pub's beer garden (east) behind their low walls, the old pump house between
//    them; the quayside along the water, the crane at the edge in the middle. Medium to long over low cover
// Spawn to the flag is about 3.3 s at a sprint through the middle, 4 to 4.5 s round either edge; nothing's seen further
// than about 25 m (a diagonal right across the square).
// What has an underside (the buses, the vans, the pickup, the boat's trailer) lets a round from your own eyes through
// under it (world/collision.js obstUnder); what's thin (the market's posts, a tree's trunk, a lamp) stops only where it
// stands, so a round or a look goes past it (cellBox).

import { rand, rr, seeded } from '../core/math.js';
import { floorMat } from './floors.js';
import { lam, lit } from '../core/shaders.js';
import { box } from '../core/geometry.js';
import { ci, cxw, idx } from './grid.js';
import { cellBox } from './collision.js';
import { fpOn } from '../game/view-cam.js';

// ---- the plans (tools/small-plan.py prints them): # the edge, h a building (or a market stall, the pump house), V a
// vehicle or a boat on its trailer, M a monument, a kiosk, an office's porch or the crane's base, T a tree, P a phone
// box or one of the market's posts, X fish boxes stacked tall (all of those stop sight and rounds); c a café table, w a
// low wall, g a gravestone / a picnic table / a gutting bench, k crates, fish boxes or pots, b a bench, f a planter, o a
// bollard or the scales (seen and shot over; all but o vaulted); A and B each side's spawn, F the free-for-all spots
const SQ_PLAN = [
  '##############################',
  '#hhhh.......F.MM.F.......hhhh#',
  '#hhhhF.c.c....MM....c.c.Fhhhh#',
  '#hhhh.........MM.........hhhh#',
  '#hhhhP..FVVV......VVVF..Phhhh#',
  '#........VVV......VVV........#',
  '#............MMMM............#',
  '#.....VV.....MMMM.....VV.....#',
  '#....AVV..T.b....b.T..VVB....#',
  '#....AVV..............VVB....#',
  '#...AAVVh............hVVBB...#',
  '#...AAVVh...F....F...hVVBB...#',
  '#....AVV..............VVB....#',
  '#....AVV....f....f....VVB....#',
  '#.....VV.T..........T.VV.....#',
  '#.......F....F..F....F.......#',
  '#....www..ww.T..T.ww..www....#',
  '#hhhh....................hhhh#',
  '#hhhh..g...g..hh..g...g..hhhh#',
  '#hhhh.F..g....hh....g..F.hhhh#',
  '#hhhh......F..hh..F......hhhh#',
  '##############################'
];
const QY_PLAN = [
  '##############################',
  '#hhh...kk...F.MM.F...kk...hhh#',
  '#hhh.F.....k..MM..k.....F.hhh#',
  '#hhh....F.....MM.....F....hhh#',
  '#hhh....VVVV......VVVV....hhh#',
  '#.......VVVV......VVVV.......#',
  '#.............XX.............#',
  '#.....VV..............VV.....#',
  '#....AVV..P........P..VVB....#',
  '#....AVV....g....g....VVB....#',
  '#...AAVV...X.F..F.X...VVBB...#',
  '#...AAVVF............FVVBB...#',
  '#....AVV.k..g....g..k.VVB....#',
  '#....AVV..P........P..VVB....#',
  '#.....VV......oo......VV.....#',
  '#........ww........ww........#',
  '#..........X.F..F.X..........#',
  '#hhh...kk..X..MM..X..kk...hhh#',
  '#hhh..F....F..MM..F....F..hhh#',
  '#hhh......k...MM...k......hhh#',
  '#hhh.o...o..o.MM.o..o...o.hhh#',
  '##############################'
];
// where each stands on the grid (cells, the edge included): centred on the grid's middle, so the flag's in the same
// place as on every map (between the memorial and the planters; under the market's roof)
const SM_B = [7, 11, 36, 32];
const SM_W = 30, SM_D = 22;
const smX0 = cxw(SM_B[0]) - 0.5, smX1 = cxw(SM_B[2]) + 0.5, smZ0 = cxw(SM_B[1]) - 0.5, smZ1 = cxw(SM_B[3]) + 0.5;
// how tall each kind stands (m), which are low, which are vaulted, what the vault prompt calls each, and how high off
// the ground each with an underside has it (world/collision.js obstUnder)
const SQ_H = { '#': 3.2, h: 2.8, V: 2.6, M: 2.7, T: 3.2, P: 2.4, c: 0.78, w: 0.95, g: 0.9, b: 0.85, f: 0.8 };
const SQ_LOW = new Set(['c', 'w', 'g', 'b', 'f']);
const SQ_WHAT = { c: 'table', w: 'wall', g: 'stone', b: 'bench', f: 'planter' };
const QY_H = { '#': 3.2, h: 2.8, V: 2.4, M: 2.8, P: 2.6, X: 2.2, k: 0.95, g: 0.92, o: 0.62, w: 1.0 };
const QY_LOW = new Set(['k', 'g', 'o', 'w']);
const QY_VAULT = new Set(['k', 'g', 'w']);
const QY_WHAT = { k: 'boxes', g: 'bench', w: 'pallets' };

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
// a tree: its trunk (the only part that stops anything: cellBox), and a crown of a few clumps high over your head
function smTree(x, z, kind) {
  const h = kind === 'yew' ? 0 : 2.4 + rand() * 0.4;
  smCy(0.13, 0.18, kind === 'yew' ? 1.0 : h + 0.6, smSH.bark, x, (kind === 'yew' ? 1.0 : h + 0.6) / 2, z, 8);
  if (kind === 'yew') { for (let k = 0; k < 3; k++) { const c = smPush(new THREE.Mesh(new THREE.ConeGeometry(1.0 - k * 0.22, 1.5, 9), smSH.yew)); c.position.set(x, 1.3 + k * 0.85, z); c.castShadow = true; } smFoot(x, z, 0.45, 0.45, 0.45, 0.45); return; }
  for (let k = 0; k < 6; k++) { const a = k * 1.1 + rand(), r = k ? 0.7 : 0, s = smPush(new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.8, 1.15), 1), smSH.leaf[k % 3])); s.position.set(x + Math.cos(a) * r, h + 1.0 + (k ? rr(-0.2, 0.4) : 0.6), z + Math.sin(a) * r); s.scale.y = 0.8; s.castShadow = true; }
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

// ======================================================================================================================
// HAWTHORNE SQUARE
// The story: a market town's square on a Saturday morning, the market half set up and nobody about. The High Street's
// shops along the north side with their awnings out, the café's tables on the pavement; the war memorial on its steps in
// the middle of the square with the wreaths from Remembrance still at its foot, lime trees round it; the bus at its stop
// at each end where the road comes in, a market stall set up beside each; the churchyard behind its low stone wall on the
// south-west, the Hawthorne Arms' beer garden behind its low wall on the south-east, the old pump house between them.
// The road at each end's closed off for the market (barriers across it, a sign).
const SQM = {
  setts: 'rgb(132,124,112)', pave: 'rgb(176,170,158)', road: 'rgb(62,63,66)',
  brick: [smTall(0x8a4a36), smTall(0x9a5a40), smTall(0x7a4030)], render: [smTall(0xe6dcc6), smTall(0xd8c7a2), smTall(0xc9d3cf), smTall(0xe2c9b4)],
  trim: smTall(0xf1ece0), shopDk: smTall(0x2d3a34), bus: smTall(0xb3261e), busDk: smTall(0x6e1712), busCream: smTall(0xe9e0c8), van: smTall(0xe4e2dc), vanDk: smTall(0x3a3d40),
  phone: smTall(0xb51f1a), phoneDk: smTall(0x7a130f), kiosk: smTall(0x2e5a3e), kioskDk: smTall(0x1f3d2a), canvasR: lam(0xb8322a), canvasW: lam(0xefe6d6), stallWood: lam(0x8a6a44),
  table: lam(0x2b2e31), chair: lam(0x6a7a6a), parasol: lam(0x2f5a6a), bench: lam(0x6e4a2a), planter: lam(0x5a554d), wreath: lam(0x9e1c22), poppy: lam(0xc4161c),
  grave: lam(0x9a968c), graveDk: lam(0x6f6b62), picnic: lam(0x8a6a44), barrier: lam(0xe0dccf), barrierR: lam(0xc0332a), cone: lam(0xe0662a)
};
function sqFloor() {
  const t = smFloorTex((x, P, r) => {
    // the square: setts, a ring of darker stone round the memorial
    smSetts(x, P, r, 0, 0, SM_W, SM_D, SQM.setts, 0.32, 'rgba(60,56,50,0.5)');
    // the High Street's pavement under the shops (rows 1-4) and the kerb along it
    smSlabs(x, P, r, 1, 1, SM_W - 1, 5, SQM.pave); x.fillStyle = 'rgb(150,146,138)'; x.fillRect(5 * P, 5 * P - 4, (SM_W - 10) * P, 6);
    // the road at each end (cols 1-5 rows 5-16): tarmac, the bus stop's yellow box, the give-way lines at the square
    for (const s of [0, 1]) {
      const i0 = s ? SM_W - 8 : 1, i1 = s ? SM_W - 1 : 8;
      x.fillStyle = SQM.road; x.fillRect(i0 * P, 5 * P, (i1 - i0) * P, 12 * P);
      for (let k = 0; k < 500; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,90,92' : '40,40,42'},0.5)`; x.fillRect(i0 * P + r() * (i1 - i0) * P, 5 * P + r() * 12 * P, 2, 2); }
      const bx0 = (s ? SM_W - 8 : 6) * P - 4; x.strokeStyle = 'rgba(228,190,52,0.9)'; x.lineWidth = 4; x.strokeRect(bx0, 6.6 * P, 2 * P + 8, 8.8 * P);
      x.fillStyle = 'rgba(228,190,52,0.9)'; x.font = `bold ${P * 0.5}px Arial`; x.save(); x.translate(bx0 + P + 4, 11 * P); x.rotate(s ? Math.PI / 2 : -Math.PI / 2); x.textAlign = 'center'; x.fillText('BUS STOP', 0, P * 0.15); x.restore();
      x.strokeStyle = 'rgba(232,230,220,0.85)'; x.lineWidth = 3; x.setLineDash([P * 0.6, P * 0.3]); x.beginPath(); x.moveTo((s ? SM_W - 8 : 8) * P, 5 * P); x.lineTo((s ? SM_W - 8 : 8) * P, 17 * P); x.stroke(); x.setLineDash([]);
    }
    // the churchyard (west) grass with its gravel path; the beer garden (east) gravel and flags
    x.fillStyle = 'rgb(86,112,62)'; x.fillRect(5 * P, 17 * P, 9 * P, 4 * P);
    for (let k = 0; k < 2500; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '60,86,44' : '120,140,80'},0.6)`; x.fillRect(5 * P + r() * 9 * P, 17 * P + r() * 4 * P, 1, 2 + r() * 3); }
    x.fillStyle = 'rgb(168,156,132)'; x.fillRect(8 * P, 16 * P, 2 * P, 5 * P); x.fillRect(5 * P, 17.2 * P, 9 * P, 0.9 * P);
    x.fillStyle = 'rgb(160,148,124)'; x.fillRect((SM_W - 14) * P, 17 * P, 9 * P, 4 * P);
    smSlabs(x, P, r, SM_W - 12, 17, SM_W - 6, 21, 'rgb(170,160,140)');
    // the memorial's ring of dark stone, the flag's place south of it
    x.strokeStyle = 'rgba(70,64,56,0.75)'; x.lineWidth = 8; x.beginPath(); x.ellipse(15 * P, 9 * P, 6 * P, 4.6 * P, 0, 0, 7); x.stroke();
    smGrime(x, P, r, 70, '40,36,30');
  });
  return smFloor(t, 'granite', [['concrete', 1, 1, -1, 5], ['asphalt', 1, 5, 8, 17], ['asphalt', -8, 5, -1, 17], ['gravel', 5, 16, -5, 21]]);
}
// the High Street's shopfronts along the north edge: each shop its own front (painted or brick), a fascia with its name,
// its window and door, an awning out over the pavement, two storeys of windows over it and its roof
const SQ_SHOPS = [['Corner Stores', '#2d4a3a'], ['Bakery', '#7a3b2a'], ['Hawthorne Café', '#2f4a5e'], ['Chemist', '#1f5e4a'], ['Books', '#5a2f4a'], ['Ironmonger', '#3a3a3a'], ['Butcher', '#7a1f1f'], ['Post Office', '#a8231c'], ['Florist', '#3e6a3a']];
function shopWindowTex(seed) {
  return smCanvas(256, 192, (x, W, H) => {
    const r = seeded(seed); x.fillStyle = '#1e2a30'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,240,210,0.35)'); g.addColorStop(1, 'rgba(255,240,210,0.05)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let k = 0; k < 14; k++) { x.fillStyle = `hsl(${r() * 360},${30 + r() * 30}%,${35 + r() * 30}%)`; const w = 16 + r() * 30, h = 14 + r() * 40; x.fillRect(r() * (W - w), H - 30 - h - r() * 60, w, h); }
    x.fillStyle = '#4a3a2a'; x.fillRect(0, H - 30, W, 30);
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 6; x.beginPath(); x.moveTo(20, 10); x.lineTo(70, H - 40); x.stroke();
  });
}
function sqNorth() {
  const fz = smZ0 + 1, H1 = 3.4, H2 = 7.2, r = seeded(31);
  let x = smX0 + 1, n = 0;
  while (x < smX1 - 1.01) {
    const w = Math.min(smX1 - 1 - x, [3.2, 3.6, 4.0][n % 3]), cx = x + w / 2, S = SQ_SHOPS[n % SQ_SHOPS.length];
    const wall = n % 3 === 1 ? SQM.brick[n % 3] : SQM.render[n % 4];
    smBx(w, H2, 0.6, wall, cx, H2 / 2, fz - 0.3);                                   // its front, two storeys
    smBx(w + 0.02, 0.18, 0.66, SQM.trim, cx, H1 + 0.6, fz - 0.27);                  // the string course over the shop
    // the shop: its fascia with its name, window and door, stall riser
    smBx(w - 0.2, 0.55, 0.08, SQM.shopDk, cx, H1 + 0.2, fz + 0.04);
    smPic(w - 0.4, 0.42, smTexM(smSignTex(S[0], S[1], '#f1e6c8', w - 0.4), true), cx, H1 + 0.2, fz + 0.085, [0, 1]);
    smPic(w - 1.4, 1.9, smTexM(shopWindowTex(n * 13 + 5), true), cx - 0.45, 1.55, fz + 0.03, [0, 1]);
    smBx(0.9, 2.2, 0.05, SQM.shopDk, cx + w / 2 - 0.7, 1.1, fz + 0.03); smBx(0.04, 0.04, 0.06, smSH.chrome, cx + w / 2 - 0.4, 1.05, fz + 0.06);
    smBx(w - 0.2, 0.45, 0.06, SQM.shopDk, cx, 0.22, fz + 0.03);
    // its awning out over the pavement, striped, at head height and over
    const aw = smCanvas(64, 64, (c, W) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#efe6d6' : S[1]; c.fillRect(k * W / 8, 0, W / 8, 64); } });
    aw.wrapS = THREE.RepeatWrapping; aw.repeat.set(w / 1.2, 1);
    const a = smPush(new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 1.5), smTexM(aw, true))); a.position.set(cx, 2.85, fz + 0.62); a.rotation.x = -Math.PI / 2 + 0.45; a.castShadow = true;
    // the windows over: two storeys, sash windows in white frames
    for (const y of [4.9, 6.5]) for (let k = 0; k < Math.max(1, Math.floor(w / 1.6)); k++) {
      const wx = x + (k + 0.5) * w / Math.max(1, Math.floor(w / 1.6)); smBx(0.9, 1.1, 0.06, SQM.trim, wx, y, fz + 0.01); smBx(0.76, 0.96, 0.07, smSH.glass, wx, y, fz + 0.02); smBx(0.76, 0.04, 0.08, SQM.trim, wx, y, fz + 0.03); smBx(1.0, 0.07, 0.16, SQM.trim, wx, y - 0.6, fz + 0.06);
    }
    // its roof: slate, a chimney now and then
    const roof = smBx(w, 0.12, 2.8, smSH.slate, cx, H2 + 0.9, fz - 1.3); roof.rotation.x = 0.6;
    if (n % 2 === 0) { smBx(0.6, 1.4, 0.5, SQM.brick[0], cx + rr(-0.6, 0.6), H2 + 1.6, fz - 1.5); for (const s of [-0.12, 0.12]) smCy(0.07, 0.07, 0.3, SQM.brick[2], cx + s, H2 + 2.4, fz - 1.5, 6); }
    x += w; n++;
  }
}
// the corner buildings: the corner shop (north) and the cottage (south), brick and render, windows round their open sides
function sqCorner(R) {
  const north = R.j0 === 1 + SM_B[1], west = R.cx < 0, H = north ? 6.6 : 3.3, mat = north ? SQM.brick[1] : SQM.render[1];   // (the cottages on the south corners single storey: between the map and the camera from above)
  smBx(R.w, H, R.d, mat, R.cx, H / 2, R.cz);
  const rf = smBx(R.w + 0.3, 0.14, R.d * 0.62, smSH.slate, R.cx, H + 0.75, R.cz - R.d * 0.22); rf.rotation.x = -0.6; const rb = smBx(R.w + 0.3, 0.14, R.d * 0.62, smSH.slate, R.cx, H + 0.75, R.cz + R.d * 0.22); rb.rotation.x = 0.6;
  // windows and a door on the faces toward the square and the road
  const fx = west ? R.x1 : R.x0, dX = west ? 1 : -1, fzz = north ? R.z1 : R.z0, dZ = north ? 1 : -1;
  for (let k = 0; k < 2; k++) { const z = R.z0 + 1 + k * 2; smBx(0.06, 1.1, 0.9, SQM.trim, fx + dX * 0.02, 1.7, z); smBx(0.07, 0.95, 0.75, smSH.glass, fx + dX * 0.03, 1.7, z); if (H > 5) { smBx(0.06, 1.0, 0.9, SQM.trim, fx + dX * 0.02, 4.6, z); smBx(0.07, 0.86, 0.75, smSH.glass, fx + dX * 0.03, 4.6, z); } }
  for (let k = 0; k < 2; k++) { const xx = R.x0 + 1 + k * 2; smBx(0.9, 1.1, 0.06, SQM.trim, xx, 1.7, fzz + dZ * 0.02); smBx(0.75, 0.95, 0.07, smSH.glass, xx, 1.7, fzz + dZ * 0.03); }
  if (north) { smPic(R.w - 0.6, 0.5, smTexM(smSignTex(west ? 'Hawthorne Stores' : 'Market Newsagent', '#2d4a3a', '#f1e6c8', R.w - 0.6), true), R.cx, 2.75, fzz + dZ * 0.05, [0, dZ]); }
  else { smBx(0.9, 2.1, 0.06, SQM.shopDk, R.cx + 0.6, 1.05, fzz + dZ * 0.02); }
}
// the bus at its stop, broadside to the square: a single-decker in the county's red and cream, its windows down its
// sides, the destination over the windscreen, its wheels (a round goes under it from your own eyes: SQ under)
function sqBus(R) {
  const L = R.d - 0.2, W = R.w - 0.4, cx = R.cx, cz = R.cz;
  smBx(W, 1.1, L, SQM.bus, cx, 0.95, cz); smBx(W, 1.05, L, SQM.busCream, cx, 2.0, cz); smBx(W - 0.04, 0.12, L - 0.1, SQM.busDk, cx, 2.6, cz);
  for (const s of [-1, 1]) { smBx(0.04, 0.85, L - 1.4, smSH.glass, cx + s * W / 2, 1.95, cz - 0.3); smBx(0.05, 0.12, L, SQM.busDk, cx + s * W / 2, 0.42, cz); }
  smBx(W - 0.1, 1.0, 0.04, smSH.glass, cx, 1.9, cz - L / 2); smBx(W - 0.1, 0.9, 0.04, smSH.glass, cx, 1.95, cz + L / 2);
  smPic(W - 0.3, 0.3, smTexM(smSignTex('42  Hawthorne Sq', '#111', '#ffb43a', W - 0.3, 'Arial'), true), cx, 2.5, cz - L / 2 - 0.03, [0, -1]);
  for (const zz of [cz - L / 2 + 1.5, cz + L / 2 - 1.8]) for (const s of [-1, 1]) smWheel(0.48, 0.3, cx + s * (W / 2 - 0.12), 0.48, zz);
  smBx(0.4, 0.25, 0.3, smSH.chrome, cx - W / 2 + 0.3, 0.55, cz - L / 2 - 0.1); smBx(0.4, 0.25, 0.3, smSH.chrome, cx + W / 2 - 0.3, 0.55, cz - L / 2 - 0.1);   // (its lamps)
  // its stop: the flag's pole and the shelter beside it on the pavement edge, toward the road
  const sx = R.cx < 0 ? R.x0 - 0.6 : R.x1 + 0.6; smCy(0.04, 0.04, 2.6, smSH.iron, sx, 1.3, cz - 3.2, 6); smBx(0.5, 0.35, 0.04, SQM.bus, sx, 2.45, cz - 3.2);
}
// the delivery van at the kerb: a white box van, its cab toward the square's middle
function sqVan(R) {
  const W = R.d - 0.2, L = R.w - 0.2, cx = R.cx, cz = R.cz, fw = R.cx < 0 ? 1 : -1;
  smBx(L * 0.7, 2.1, W, SQM.van, cx - fw * L * 0.15, 1.35, cz); smBx(L * 0.3, 1.5, W, SQM.van, cx + fw * L * 0.35, 1.05, cz); smBx(0.04, 0.6, W - 0.2, smSH.glass, cx + fw * (L / 2 - 0.02), 1.5, cz);
  for (const s of [-1, 1]) smBx(L * 0.25, 0.5, 0.04, smSH.glass, cx + fw * L * 0.35, 1.45, cz + s * W / 2);
  smPic(L * 0.55, 0.5, smTexM(smSignTex('Hawthorne Dairy', '#e4e2dc', '#2f5a6a', L * 0.55, 'Arial'), true), cx - fw * L * 0.15, 1.6, cz + W / 2 + 0.01, [0, 1]);
  for (const xx of [cx - L / 2 + 0.6, cx + L / 2 - 0.6]) for (const s of [-1, 1]) { const t = smCy(0.36, 0.36, 0.22, smSH.tyre, xx, 0.36, cz + s * (W / 2 - 0.1), 14); t.rotation.x = Math.PI / 2; }
}
// the war memorial on its steps: three granite steps, the pedestal with its names, the cross on top, wreaths at its foot
function sqMemorial(R) {
  for (let k = 0; k < 3; k++) smBx(R.w - k * 0.5, 0.22, R.d - k * 0.4, k ? smSH.stoneDk : smSH.stone, R.cx, 0.11 + k * 0.22, R.cz);
  smBx(1.4, 1.8, 1.0, smSH.stone, R.cx, 1.56, R.cz); smBx(1.6, 0.2, 1.2, smSH.stoneDk, R.cx, 2.55, R.cz);
  smBx(0.35, 2.6, 0.35, smSH.stone, R.cx, 3.95, R.cz); smBx(1.3, 0.35, 0.35, smSH.stone, R.cx, 4.5, R.cz);
  const ins = smCanvas(256, 256, (x, W, H) => { x.fillStyle = '#b8b2a3'; x.fillRect(0, 0, W, H); x.fillStyle = '#3a362e'; x.textAlign = 'center'; x.font = '600 26px Georgia'; x.fillText('TO THE MEN OF', W / 2, 46); x.fillText('HAWTHORNE', W / 2, 78); x.font = '18px Georgia'; for (let k = 0; k < 7; k++) x.fillText(['A. ASHWORTH', 'J. BELL', 'T. CARVER', 'W. DUNN', 'R. HALE', 'F. MARSH', 'E. PIKE'][k], W / 2, 112 + k * 20); });
  for (const s of [-1, 1]) smPic(1.1, 1.1, smTexM(ins, true), R.cx, 1.6, R.cz + s * 0.505, [0, s]);
  for (const s of [-1, 1]) { const w = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 14), SQM.wreath)); w.position.set(R.cx + s * 0.4, 0.97, R.cz + 0.6); w.rotation.x = -0.3; for (let k = 0; k < 6; k++) { const a = k * 1.05; smBx(0.08, 0.08, 0.04, SQM.poppy, R.cx + s * 0.4 + Math.cos(a) * 0.3, 0.97 + Math.sin(a) * 0.29, R.cz + 0.62 + Math.sin(a) * 0.09); } }
}
// the newspaper kiosk: a green wooden kiosk against the shops, its hatch open with the day's papers, a board outside
function sqKiosk(R) {
  smBx(R.w, 2.4, R.d, SQM.kiosk, R.cx, 1.2, R.cz); smBx(R.w + 0.3, 0.12, R.d + 0.3, SQM.kioskDk, R.cx, 2.5, R.cz); const rf = smPush(new THREE.Mesh(new THREE.ConeGeometry(Math.max(R.w, R.d) * 0.75, 0.8, 4), SQM.kioskDk)); rf.position.set(R.cx, 2.95, R.cz); rf.rotation.y = Math.PI / 4;
  smBx(R.w - 0.4, 0.7, 0.04, smSH.glassLo, R.cx, 1.55, R.z1 + 0.01); smBx(R.w - 0.3, 0.06, 0.4, SQM.kioskDk, R.cx, 1.15, R.z1 + 0.2);
  for (let k = 0; k < 5; k++) smBx(0.3, 0.02, 0.22, k % 2 ? SQM.canvasW : lam(0xd9d2b8), R.cx - 0.6 + k * 0.3, 1.19, R.z1 + 0.22);
  smPic(R.w - 0.2, 0.3, smTexM(smSignTex('NEWS', '#1f3d2a', '#f1e6c8', R.w - 0.2), true), R.cx, 2.2, R.z1 + 0.01, [0, 1]);
}
// a market stall (taller than you): a frame of poles, a striped canvas roof and back, a trestle of produce in crates
function sqStall(R) {
  const fw = R.cx < 0 ? 1 : -1, bk = fw < 0 ? R.x1 - 0.1 : R.x0 + 0.1;   // (its back to the bus, its front to the square)
  for (const z of [R.z0 + 0.1, R.z1 - 0.1]) for (const xx of [R.x0 + 0.1, R.x1 - 0.1]) smCy(0.03, 0.03, 2.4, smSH.iron, xx, 1.2, z, 6);
  smBx(0.04, 2.0, R.d - 0.1, SQM.canvasW, bk, 1.3, R.cz);
  const st = smCanvas(64, 64, (c, W) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#efe6d6' : '#b8322a'; c.fillRect(0, k * 8, W, 8); } });
  const roof = smPush(new THREE.Mesh(new THREE.BoxGeometry(R.w + 0.2, 0.05, R.d + 0.1), smTexM(st, false))); roof.position.set(R.cx, 2.45, R.cz); roof.rotation.z = fw * 0.18; roof.castShadow = true;
  smBx(R.w - 0.2, 0.06, R.d - 0.2, SQM.stallWood, R.cx, 0.85, R.cz); for (const z of [R.z0 + 0.3, R.z1 - 0.3]) smBx(0.06, 0.82, 0.06, SQM.stallWood, R.cx, 0.42, z);
  for (let k = 0; k < 6; k++) { const z = R.z0 + 0.3 + (k % 3) * (R.d - 0.6) / 2, xx = R.cx + (k < 3 ? -0.2 : 0.2); smBx(0.38, 0.16, 0.3, SQM.stallWood, xx, 0.96, z); smBx(0.32, 0.08, 0.26, smSH.flower[k % 4], xx, 1.06, z); }
}
// the old pump house between the churchyard and the beer garden: a stone hut, slate roof, a cast-iron pump outside
function sqPumpHouse(R) {
  smBx(R.w, 2.4, R.d, smSH.stone, R.cx, 1.2, R.cz); smBx(R.w + 0.2, 0.15, R.d + 0.2, smSH.stoneDk, R.cx, 2.45, R.cz);
  for (const s of [-1, 1]) { const rf = smBx(R.w * 0.62, 0.12, R.d + 0.4, smSH.slate, R.cx + s * R.w * 0.24, 2.85, R.cz); rf.rotation.z = -s * 0.6; }
  smBx(0.9, 1.9, 0.06, smSH.woodDk, R.cx, 0.95, R.z0 - 0.02);
  smCy(0.09, 0.11, 1.2, SQM.kioskDk, R.cx - 0.7, 0.6, R.z0 - 0.25, 8); smBx(0.5, 0.06, 0.06, SQM.kioskDk, R.cx - 0.45, 1.15, R.z0 - 0.25);
}
// the red phone box
function sqPhone(x, z) {
  smBx(0.9, 2.3, 0.9, SQM.phone, x, 1.15, z); smBx(1.0, 0.12, 1.0, SQM.phoneDk, x, 0.06, z); smBx(1.0, 0.2, 1.0, SQM.phoneDk, x, 2.4, z);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { smBx(dx ? 0.02 : 0.62, 1.4, dz ? 0.02 : 0.62, smSH.glass, x + dx * 0.46, 1.25, z + dz * 0.46); smPic(0.6, 0.12, smTexM(smSignTex('TELEPHONE', '#111', '#f4f0e6', 0.6, 'Arial'), true), x + dx * 0.505, 2.22, z + dz * 0.505, dx || dz ? [dx, dz] : [0, 1]); }
}
// a café table with its two chairs and a parasol
function sqCafe(x, z) {
  smCy(0.35, 0.35, 0.04, SQM.table, x, 0.74, z, 14); smCy(0.04, 0.04, 0.72, SQM.table, x, 0.36, z, 6);
  for (const s of [-1, 1]) { smBx(0.4, 0.04, 0.4, SQM.chair, x + s * 0.55, 0.45, z); smBx(0.04, 0.45, 0.4, SQM.chair, x + s * 0.75, 0.68, z); }
  smCy(0.02, 0.02, 1.6, smSH.iron, x, 1.5, z, 5); const p = smPush(new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.4, 8), SQM.parasol)); p.position.set(x, 2.35, z); p.castShadow = true;
  smFoot(x, z, 0.45, 0.45, 0.45, 0.45);
}
// a bench and a planter of flowers
function sqBench(x, z) { smBx(1.0, 0.06, 0.45, SQM.bench, x, 0.45, z); smBx(1.0, 0.4, 0.05, SQM.bench, x, 0.72, z + 0.2); for (const s of [-1, 1]) smBx(0.06, 0.45, 0.45, smSH.iron, x + s * 0.45, 0.22, z); }
function sqPlanter(x, z) { smBx(0.95, 0.6, 0.95, SQM.planter, x, 0.3, z); smBx(0.85, 0.05, 0.85, smSH.soil, x, 0.61, z); for (let k = 0; k < 9; k++) smBx(0.12, 0.18, 0.12, smSH.flower[k % 4], x + rr(-0.32, 0.32), 0.72, z + rr(-0.32, 0.32)); }
// the low wall along the churchyard (stone, coped) and the beer garden (brick, a trellis on it)
function sqWall(i, j, x, z) {
  const west = x < 0, along = smKIND(i - 1, j) === 'w' || smKIND(i + 1, j) === 'w' ? 'x' : 'z';
  if (west) { smBxA(along, 1.0, 0.85, 0.42, smSH.stoneLo, x, 0.425, z); smBxA(along, 1.02, 0.1, 0.5, smSH.stoneLoDk, x, 0.9, z); }
  else { smBxA(along, 1.0, 0.8, 0.36, lam(0x8a4a36), x, 0.4, z); smBxA(along, 1.02, 0.08, 0.42, lam(0xd8d0c0), x, 0.84, z); for (let k = -1; k <= 1; k++) smBxA(along, 0.03, 0.6, 0.03, SQM.stallWood, x + (along === 'x' ? k * 0.33 : 0), 1.15, z + (along === 'x' ? 0 : k * 0.33)); }
}
// a gravestone (west) or a picnic table (east)
function sqGrave(x, z) {
  if (x < 0) {
    const t = rand(); smBx(0.75, 0.82, 0.16, t < 0.5 ? SQM.grave : SQM.graveDk, x, 0.41, z); if (t < 0.5) { const c = smCy(0.375, 0.375, 0.16, SQM.grave, x, 0.82, z, 12); c.rotation.x = Math.PI / 2; }
    smBx(0.9, 0.06, 0.7, smSH.stoneLoDk, x, 0.03, z + 0.3); for (let k = 0; k < 4; k++) smBx(0.1, 0.1, 0.1, smSH.flower[k], x + rr(-0.3, 0.3), 0.1, z + 0.35);
    smFoot(x, z, 0.4, 0.12, 0.4, 0.12);
  } else {
    smBx(0.95, 0.05, 0.7, SQM.picnic, x, 0.74, z); for (const s of [-1, 1]) { smBx(0.95, 0.04, 0.25, SQM.picnic, x, 0.45, z + s * 0.5); smBx(0.06, 0.74, 0.06, SQM.picnic, x + s * 0.35, 0.37, z); }
    smCy(0.02, 0.02, 1.4, smSH.iron, x, 1.4, z, 5); const p = smPush(new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.35, 8), lam(0x7a2a24))); p.position.set(x, 2.15, z); p.castShadow = true;
    smBx(0.3, 0.24, 0.2, lam(0xd9c38a), x + 0.2, 0.88, z);
  }
}
// the edges: the shops along the north (sqNorth); along the south the churchyard's stone wall (west, a yew hedge over
// it) and the Hawthorne Arms' single-storey back (east, its windows lit); at each end the road closed off for the
// market between the corner buildings. Beyond, the town: what stands to the north and west (behind the map as it's
// seen from above) as tall as it likes, the church's tower with its spire over the shops' roofs as a landmark; what's
// to the south and east (between it and the camera) kept low, the roads on out of town, garden walls, parked cars
function sqEdges() {
  for (let i = SM_B[0] + 1; i < SM_B[2]; i++) {
    const x = cxw(i), z = smZ1 - 0.5, west = x < 0;
    if (west) { smBx(1, 1.4, 0.6, smSH.stone, x, 0.7, z); smBx(1.02, 0.1, 0.66, smSH.stoneDk, x, 1.45, z); if (rand() < 0.8) { const h = smPush(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), smSH.yew)); h.position.set(x, 1.75, z + 0.55); h.scale.set(1, 0.9, 0.7); } }
    else { smBx(1, 2.4, 0.6, SQM.brick[0], x, 1.2, z); smBx(1.02, 0.12, 0.66, SQM.trim, x, 2.45, z); if (i % 3 === 0) { smBx(0.7, 0.9, 0.05, smGlowM(0xffd9a0), x, 1.45, z - 0.31); smBx(0.8, 1.0, 0.04, SQM.trim, x, 1.45, z - 0.3); } }
  }
  smPic(3.4, 0.5, smTexM(smSignTex('The Hawthorne Arms · Beer Garden', '#1f3a2a', '#e8c66a', 3.4), true), smX1 - 9, 2.05, smZ1 - 0.81, [0, -1]);
  // the church's tower and spire, north-west over the shops' roofs: the landmark you see from anywhere in the square
  { const cx = smX0 + 5, cz = smZ0 - 7; smBx(3.4, 13, 3.4, smSH.stone, cx, 6.5, cz); smBx(3.7, 0.4, 3.7, smSH.stoneDk, cx, 13.1, cz); const sp = smPush(new THREE.Mesh(new THREE.ConeGeometry(2.3, 6.5, 4), smSH.slate)); sp.position.set(cx, 16.5, cz); sp.rotation.y = Math.PI / 4;
    for (const [dx, dz] of [[0, 1.71], [1.71, 0]]) { const c = smPush(new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), lam(0xf1ece0))); c.position.set(cx + dx, 10.5, cz + dz); c.rotation.y = dx ? Math.PI / 2 : 0; }
    smBx(9, 6, 6, smSH.stone, cx + 6, 3, cz - 1); const r1 = smBx(9.4, 0.18, 4.2, smSH.slate, cx + 6, 6.9, cz - 2.4); r1.rotation.x = 0.7; const r2 = smBx(9.4, 0.18, 4.2, smSH.slate, cx + 6, 6.9, cz + 0.4); r2.rotation.x = -0.7; }
  // the backs of the High Street behind the shops: a second row of roofs (north, behind from above)
  for (let x = smX0 + 9; x < smX1 + 6; x += 6.5) { const h = rr(6, 9); smBx(6.2, h, 5, SQM.render[Math.floor(rand() * 4)], x, h / 2, smZ0 - 4.5); const rf = smBx(6.4, 0.16, 3.4, smSH.slate, x, h + 0.9, smZ0 - 5.6); rf.rotation.x = -0.6; }
  // each end: the road closed (barriers across it, a sign, cones), the road on out of town beyond
  for (const s of [-1, 1]) {
    const ex = s < 0 ? smX0 + 0.5 : smX1 - 0.5;
    for (let z = smZ0 + 5.5; z < smZ0 + 16.5; z += 1.8) { smBx(0.12, 0.9, 1.6, SQM.barrier, ex, 0.55, z); for (let k = 0; k < 3; k++) smBx(0.13, 0.12, 0.3, SQM.barrierR, ex, 0.75, z - 0.5 + k * 0.5); for (const e of [-0.7, 0.7]) smBx(0.5, 0.08, 0.12, SQM.barrier, ex, 0.04, z + e); }
    smPic(1.6, 0.9, smTexM(smSignTex('ROAD CLOSED · MARKET', '#c0332a', '#ffffff', 1.6, 'Arial'), true), ex - s * 0.08, 1.4, smZ0 + 11, [-s, 0]);
    for (let k = 0; k < 3; k++) smCy(0.12, 0.25, 0.7, SQM.cone, ex - s * 0.7, 0.35, smZ0 + 7 + k * 4, 8);
    smBx(16, 0.02, 9, lam(0x3e3f42), ex + s * 8.5, -0.005, smZ0 + 11);
    for (let k = 0; k < 2; k++) { const x = ex + s * (5 + k * 6), cz = smZ0 + 8.6 + (k % 2) * 4.6, c = [lam(0x2c4a6a), lam(0x8a8a86)][k]; smBx(1.8, 0.7, 4.2, c, x, 0.55, cz); smBx(1.6, 0.55, 2.2, c, x, 1.15, cz + 0.2); smBx(1.62, 0.42, 1.9, smSH.dark, x, 1.15, cz + 0.2); }
    if (s < 0) for (const z of [smZ0 + 2.5, smZ1 - 2.5]) { smBx(10, 6, 5, SQM.render[z < 0 ? 2 : 3], ex - 6, 3, z); const rf = smBx(10.2, 0.16, 3.2, smSH.slate, ex - 6, 6.8, z); rf.rotation.z = 0.5; }
    else for (const z of [smZ0 + 2.5, smZ1 - 2.5]) { smBx(8, 1.1, 0.4, SQM.brick[2], ex + 5, 0.55, z + (z < 0 ? 2.3 : -2.3)); for (let k = 0; k < 3; k++) smTree(ex + 3 + k * 3, z, 'lime'); }
  }
  // the town round it: pavement-grey ground, lawns and gardens south and east (low), a few trees
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lam(0x6a6d66)); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.02; gnd.receiveShadow = true; smG.add(gnd);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), lam(0x5f7f45)); lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, -0.01, smZ1 + 8); lawn.receiveShadow = true; smG.add(lawn);
  for (let k = 0; k < 8; k++) smTree(-22 + k * 6.3 + rr(-1, 1), smZ1 + 5 + rr(0, 6), 'lime');
  for (let x = -24; x <= 24; x += 2) smBx(2, 0.8, 0.3, smSH.stoneLo, x, 0.4, smZ1 + 2.6);
}
function squareBuild(g) {
  smG = g; smPARTS = []; smPLAN = SQ_PLAN;
  sqFloor(); sqNorth(); sqEdges();
  for (let j = SM_B[1]; j <= SM_B[3]; j++) for (let i = SM_B[0]; i <= SM_B[2]; i++) {
    const k = smKIND(i, j), x = cxw(i), z = cxw(j);
    if (k === 'h' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.w >= 3) sqCorner(R); else if (R.d >= 3) sqPumpHouse(R); else sqStall(R); }
    else if (k === 'V' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.d > R.w) sqBus(R); else sqVan(R); }
    else if (k === 'M' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.d >= 3) sqKiosk(R); else sqMemorial(R); }
    else if (k === 'T') smTree(x, z, z > 4 ? (x < 0 ? 'yew' : 'lime') : 'lime');
    else if (k === 'P') sqPhone(x, z);
    else if (k === 'c') sqCafe(x, z);
    else if (k === 'b') sqBench(x, z);
    else if (k === 'f') sqPlanter(x, z);
    else if (k === 'w') sqWall(i, j, x, z);
    else if (k === 'g') sqGrave(x, z);
  }
  // street lamps round the square's edge and the bus stops (none in the way: each in a cell next to cover)
  for (const [x, z] of SQ_LAMPS) smLampPost(x, z);
  const parts = smPARTS; smG = smPARTS = null; return parts;
}
// the lamps (world), lit as it gets dark: along the pavement's kerb, by the memorial, at the churchyard gate and in the
// beer garden
const SQ_LAMPS = [[-10.9, -6.0], [10.9, -6.0], [-3.6, -4.6], [3.6, -4.6], [-5.6, 5.1], [5.6, 5.1], [-12.6, 3.1], [12.6, 3.1]];

// ======================================================================================================================
// SALTMARSH QUAY
// The story: a fishing harbour's quay at the end of the day, the boats in and the catch landed, nobody about. The
// harbour buildings along the north (the ice house on each corner, the fish merchants' backs, the harbour office in
// the middle with its porch out into the back lane, the harbourmaster's pickup parked along it); the quay apron in the
// middle under the fish market's open hall on its four posts (the gutting benches, the scales, fish boxes stacked high);
// a boat hauled out on its trailer across the end of the quay road at each end; the quayside along the water south,
// bollards and lobster pots and coils of rope, the crane at the edge in the middle, the boat sheds on each corner, the
// harbour water beyond with the boats moored in it and the breakwater's light at its mouth.
const QYM = {
  conc: 'rgb(140,138,130)', lane: 'rgb(78,78,80)',
  shed: [smTall(0x5a6a72), smTall(0x7a5a3a), smTall(0x6a7a6a), smTall(0x8a8a82)], shedDk: smTall(0x3a4246), render: [smTall(0xe6e2d6), smTall(0xd4c8b0), smTall(0xbfcfd4)],
  hull: [smTall(0x2f5a8a), smTall(0xb8322a), smTall(0x2e6a4a)], hullDk: smTall(0x1e2226), deck: smTall(0xd8d2c0), wheelhouse: smTall(0xe8e4da), trailer: lam(0x3a3e42),
  pickup: smTall(0x3e5a46), post: smTall(0x5a6266), roof: lam(0x6e7a80), boxB: lam(0x2f6aa0), boxR: lam(0xb8432a), boxY: lam(0xd8b23a), boxG: lam(0x3e8a5a),
  pot: lam(0x3a4a3e), potNet: lam(0x2a8a7a), bench: lam(0xb8bcc0), benchLeg: lam(0x5a5e62), rope: lam(0xb8a070), crane: smTall(0xd8a42a), craneDk: smTall(0x6a5a3a),
  water: lam(0x2c5a6a, { transparent: true, opacity: 0.92 }), edge: lam(0x9a968c), floats: lam(0xe0662a), pallet: lam(0x9a7b52)
};
function qyFloor() {
  const t = smFloorTex((x, P, r) => {
    x.fillStyle = QYM.conc; x.fillRect(0, 0, SM_W * P, SM_D * P);
    for (let k = 0; k < 6000; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '100,98,92' : '170,168,160'},0.35)`; x.fillRect(r() * SM_W * P, r() * SM_D * P, 2, 2); }
    x.strokeStyle = 'rgba(70,68,62,0.6)'; x.lineWidth = 2; for (let i = 1; i < SM_W; i += 4) { x.beginPath(); x.moveTo(i * P, 5 * P); x.lineTo(i * P, SM_D * P); x.stroke(); } for (let j = 5; j < SM_D; j += 4) { x.beginPath(); x.moveTo(0, j * P); x.lineTo(SM_W * P, j * P); x.stroke(); }
    // the back lane's tarmac (rows 1-5), the quay road's at each end
    x.fillStyle = QYM.lane; x.fillRect(1 * P, 1 * P, (SM_W - 2) * P, 4.6 * P);
    for (const s of [0, 1]) { const i0 = s ? SM_W - 6 : 1; x.fillStyle = QYM.lane; x.fillRect(i0 * P, 5 * P, 5 * P, 12 * P); }
    for (let k = 0; k < 1500; k++) { x.fillStyle = `rgba(${r() < 0.5 ? '95,95,98' : '50,50,52'},0.5)`; x.fillRect(r() * SM_W * P, r() * 5.6 * P, 2, 2); }
    // the quay's edge: granite setts along the water, a yellow line inside them
    smSetts(x, P, r, 1, 19.6, SM_W - 1, 21, 'rgb(150,144,132)', 0.35, 'rgba(60,56,50,0.5)');
    x.strokeStyle = 'rgba(228,190,52,0.85)'; x.lineWidth = 5; x.beginPath(); x.moveTo(4 * P, 19.5 * P); x.lineTo((SM_W - 4) * P, 19.5 * P); x.stroke();
    // under the market's roof: the wet slab, the drains along it, scales' stains
    x.fillStyle = 'rgba(70,82,88,0.45)'; x.fillRect(10 * P, 7.5 * P, 10 * P, 7 * P);
    x.fillStyle = 'rgba(40,40,40,0.6)'; for (let i = 10.5; i < 19.5; i += 1.5) x.fillRect(i * P, 10.9 * P, 0.8 * P, 0.15 * P);
    // puddles, rust and fish scales
    for (let k = 0; k < 30; k++) { const R = (0.3 + r() * 1.2) * P, g = x.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(70,90,100,0.45)'); g.addColorStop(1, 'rgba(70,90,100,0)'); x.save(); x.translate(r() * SM_W * P, (5 + r() * 15) * P); x.scale(1, 0.5); x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill(); x.restore(); }
    smGrime(x, P, r, 50, '90,60,40');
  });
  return smFloor(t, 'concrete', [['asphalt', 1, 1, -1, 5.6], ['asphalt', 1, 5, 6, 17], ['asphalt', -6, 5, -1, 17]]);
}
// the harbour buildings along the north edge: corrugated sheds and painted fronts, their loading doors, signs
function qyNorth() {
  const fz = smZ0 + 1, names = ['Saltmarsh Fish Co.', 'Harbour Chandlery', 'Pellow & Sons', 'Net Loft', 'Saltmarsh Fish Co.'];
  let x = smX0 + 1, n = 0;
  while (x < smX1 - 1.01) {
    const w = Math.min(smX1 - 1 - x, [5.0, 4.4, 5.6][n % 3]), cx = x + w / 2, H = [5.0, 6.2, 4.6][n % 3], mat = n % 2 ? QYM.render[n % 3] : QYM.shed[n % 4];
    smBx(w, H, 0.6, mat, cx, H / 2, fz - 0.3);
    if (n % 2 === 0) for (let k = 0; k < w / 0.3; k++) smBx(0.06, H, 0.04, QYM.shedDk, x + k * 0.3 + 0.15, H / 2, fz + 0.01);   // (its corrugations)
    smBx(2.2, 2.6, 0.06, QYM.shedDk, cx - w / 4, 1.3, fz + 0.03); for (let k = 0; k < 6; k++) smBx(2.2, 0.03, 0.08, mat, cx - w / 4, 0.2 + k * 0.45, fz + 0.05);   // a roller door
    smBx(0.8, 0.8, 0.06, smSH.glass, cx + w / 4, 1.8, fz + 0.03);
    smPic(Math.min(w - 0.6, 3.6), 0.5, smTexM(smSignTex(names[n % names.length], '#1f3a4a', '#f1e6c8', Math.min(w - 0.6, 3.6)), true), cx, H - 0.8, fz + 0.04, [0, 1]);
    const roof = smBx(w, 0.1, 2.6, QYM.roof, cx, H + 0.6, fz - 1.2); roof.rotation.x = 0.45;
    x += w; n++;
  }
}
// the ice house (north corners) and the boat shed (south corners): tall plain blocks, the boat shed open to the water
function qyCorner(R) {
  const north = R.cz < 0, west = R.cx < 0, H = north ? 5.2 : 3.2, mat = north ? QYM.render[0] : QYM.shed[1];
  smBx(R.w, H, R.d, mat, R.cx, H / 2, R.cz);
  const rf = smBx(R.w + 0.3, 0.12, R.d + 0.3, QYM.roof, R.cx, H + 0.06, R.cz); rf.rotation.z = west ? 0.12 : -0.12;
  const fx = west ? R.x1 : R.x0, dX = west ? 1 : -1;
  if (north) { smBx(0.06, 2.2, 1.6, QYM.shedDk, fx + dX * 0.02, 1.1, R.cz); smPic(2.4, 0.5, smTexM(smSignTex('ICE', '#2f6aa0', '#ffffff', 2.4, 'Arial'), true), fx + dX * 0.06, 3.4, R.cz, [dX, 0]); smBx(0.4, 0.5, 0.3, smSH.chrome, fx + dX * 0.2, 2.6, R.z1 - 0.6); }
  else { for (let k = 0; k < R.w / 0.3; k++) smBx(0.06, H, 0.04, QYM.shedDk, R.x0 + k * 0.3 + 0.15, H / 2, R.z0 - 0.01); smBx(0.06, 2.4, 2.0, QYM.shedDk, fx + dX * 0.02, 1.2, R.cz); }
}
// a boat on its trailer (spawn's cover), or the harbourmaster's pickup
function qyBoat(R) {
  const L = R.d - 0.3, W = R.w - 0.3, cx = R.cx, cz = R.cz, hull = QYM.hull[R.cx < 0 ? 0 : 1];
  smBx(W - 0.2, 0.12, L, QYM.trailer, cx, 0.42, cz); for (const zz of [cz - 1.2, cz + 0.4]) for (const s of [-1, 1]) smWheel(0.33, 0.2, cx + s * (W / 2 - 0.05), 0.33, zz);
  smBx(0.08, 0.08, 1.4, QYM.trailer, cx, 0.42, cz - L / 2 - 0.6);
  // the hull: a keel, its sides tapering to the bow (north end), the deck, the wheelhouse aft
  const n = 6; for (let k = 0; k < n; k++) { const t = k / (n - 1), zz = cz - L / 2 + t * L, bw = W * (0.45 + 0.55 * Math.min(1, t * 1.6)); smBx(bw, 1.2, L / n + 0.02, hull, cx, 1.2, zz); smBx(bw * 0.7, 0.35, L / n + 0.02, QYM.hullDk, cx, 0.62, zz); }
  smBx(W - 0.1, 0.06, L * 0.75, QYM.deck, cx, 1.82, cz + L * 0.1); smBx(W * 0.8, 0.12, L, smSH.chrome, cx, 1.79, cz);
  smBx(W * 0.7, 1.1, 1.6, QYM.wheelhouse, cx, 2.4, cz + L * 0.22); smBx(W * 0.72, 0.4, 1.62, smSH.glass, cx, 2.55, cz + L * 0.22); smBx(W * 0.8, 0.08, 1.8, QYM.hullDk, cx, 3.0, cz + L * 0.22);
  smPic(1.6, 0.3, smTexM(smSignTex(R.cx < 0 ? 'SM 47  Marigold' : 'SM 12  Brave Lass', '#f1ece0', '#1e2226', 1.6, 'Arial'), true), cx + (R.cx < 0 ? 1 : -1) * (W / 2 + 0.01), 1.55, cz - 0.6, [R.cx < 0 ? 1 : -1, 0]);
}
function qyPickup(R) {
  const L = R.w - 0.3, W = R.d - 0.3, cx = R.cx, cz = R.cz, fw = R.cx < 0 ? -1 : 1;
  smBx(L, 0.7, W, QYM.pickup, cx, 0.75, cz); smBx(L * 0.42, 0.75, W - 0.1, QYM.pickup, cx + fw * L * 0.12, 1.45, cz); smBx(L * 0.42 + 0.02, 0.5, W - 0.14, smSH.glass, cx + fw * L * 0.12, 1.5, cz);
  smBx(L * 0.4, 0.4, 0.06, QYM.pickup, cx - fw * L * 0.28, 1.25, cz - W / 2 + 0.05); smBx(L * 0.4, 0.4, 0.06, QYM.pickup, cx - fw * L * 0.28, 1.25, cz + W / 2 - 0.05);
  for (let k = 0; k < 3; k++) smBx(0.5, 0.25, 0.4, [QYM.boxB, QYM.boxR, QYM.boxY][k], cx - fw * (L * 0.18 + k * 0.45), 1.2, cz);
  for (const xx of [cx - L / 2 + 0.7, cx + L / 2 - 0.7]) for (const s of [-1, 1]) { const t = smCy(0.37, 0.37, 0.24, smSH.tyre, xx, 0.37, cz + s * (W / 2 - 0.08), 14); t.rotation.x = Math.PI / 2; }
}
// the harbour office's porch (north, middle) and the crane's base at the quay's edge (south, middle)
function qyOffice(R) {
  smBx(R.w, 2.6, R.d, QYM.render[2], R.cx, 1.3, R.cz); const rf = smBx(R.w + 0.4, 0.12, R.d + 0.4, QYM.roof, R.cx, 2.75, R.cz); rf.rotation.x = 0.15;
  smBx(1.0, 2.1, 0.06, QYM.shedDk, R.cx, 1.05, R.z1 + 0.02); smPic(R.w - 0.2, 0.4, smTexM(smSignTex('HARBOUR OFFICE', '#1f3a4a', '#f1e6c8', R.w - 0.2, 'Arial'), true), R.cx, 2.35, R.z1 + 0.04, [0, 1]);
  const lb = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 16), lam(0xe0662a))); lb.position.set(R.cx + 0.8, 1.5, R.z1 + 0.08);
}
function qyCrane(R) {
  smBx(R.w, 0.9, R.d, smSH.stone, R.cx, 0.45, R.cz); smBx(1.4, 2.0, 1.4, QYM.crane, R.cx, 1.9, R.cz); smBx(1.6, 0.8, 1.6, QYM.craneDk, R.cx, 3.2, R.cz);
  smBx(1.0, 0.9, 1.2, QYM.crane, R.cx, 3.9, R.cz + 0.2); smBx(0.8, 0.6, 0.04, smSH.glass, R.cx, 3.95, R.cz - 0.42);
  const jib = smBx(0.35, 0.35, 9, QYM.crane, R.cx, 6.0, R.cz + 3.6); jib.rotation.x = -0.5;
  smCy(0.02, 0.02, 4.4, smSH.iron, R.cx, 5.6, R.cz + 7.6, 4); smBx(0.5, 0.3, 0.3, QYM.craneDk, R.cx, 3.3, R.cz + 7.6);
}
// a market post (the roof over the apron on its four: overhead, from your own eyes)
function qyPost(x, z) { smBx(0.3, 4.2, 0.3, QYM.post, x, 2.1, z); smBx(0.5, 0.2, 0.5, QYM.post, x, 0.1, z); smFoot(x, z, 0.18, 0.18, 0.18, 0.18); }
// fish boxes: low stacks (k) and tall ones (X), the colours of each merchant's; lobster pots (k, by the water)
function qyBoxes(x, z, n) {
  // (each stack one merchant's colour, the odd box from another's mixed in, as they come back from the market)
  const cols = [QYM.boxB, QYM.boxR, QYM.boxY, QYM.boxG], own = cols[Math.floor(rand() * 4)];
  for (const [dx, dz] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) { const h = n + (rand() < 0.4 ? -1 : 0); for (let k = 0; k < h; k++) smBx(0.46, 0.24, 0.36, rand() < 0.88 ? own : cols[Math.floor(rand() * 4)], x + dx + rr(-0.02, 0.02), 0.12 + k * 0.25, z + dz); }
}
function qyPots(x, z) { for (const [dx, dz, y] of [[-0.24, -0.2, 0], [0.24, -0.2, 0], [-0.24, 0.2, 0], [0.24, 0.2, 0], [0, 0, 0.42]]) { const p = smCy(0.22, 0.24, 0.42, QYM.pot, x + dx, 0.21 + y, z + dz, 8); p.rotation.z = Math.PI / 2; smBx(0.4, 0.02, 0.3, QYM.potNet, x + dx, 0.43 + y, z + dz); } }
// a gutting bench: stainless top, legs, a hose and a tray of ice
function qyBench(x, z) { smBx(0.95, 0.06, 0.95, QYM.bench, x, 0.9, z); for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) smBx(0.05, 0.88, 0.05, QYM.benchLeg, x + a, 0.44, z + b); smBx(0.6, 0.06, 0.4, lam(0xe8eef0), x, 0.96, z); smBx(0.8, 0.04, 0.8, QYM.benchLeg, x, 0.25, z); }
// a bollard on the quay (and a coil of rope by it), the scales on their stand
function qyBollard(x, z) { smCy(0.2, 0.24, 0.5, smSH.iron, x, 0.25, z, 10); smCy(0.28, 0.28, 0.08, smSH.iron, x, 0.52, z, 10); const r = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 14), QYM.rope)); r.rotation.x = Math.PI / 2; r.position.set(x + 0.55, 0.07, z - 0.3); smFoot(x, z, 0.3, 0.3, 0.3, 0.3); }
function qyScales(x, z) { smBx(0.7, 0.08, 0.7, QYM.bench, x, 0.6, z); smCy(0.05, 0.05, 0.56, QYM.benchLeg, x, 0.28, z, 6); smBx(0.3, 0.35, 0.1, lam(0xe8e2d8), x, 0.85, z - 0.25); smFoot(x, z, 0.4, 0.4, 0.4, 0.4); }
// a low wall of net floats and pallets
function qyFloats(x, z) { smBx(0.95, 0.14, 0.9, QYM.pallet, x, 0.07, z); for (let k = 0; k < 6; k++) { const f = smCy(0.15, 0.15, 0.3, QYM.floats, x - 0.3 + (k % 3) * 0.3, 0.32 + Math.floor(k / 3) * 0.3, z, 10); f.rotation.x = Math.PI / 2; } smBx(0.9, 0.3, 0.8, lam(0x2a5a4a), x, 0.85, z); }
// the market's roof over the apron (from your own eyes: from above you look down through it), its lights under it
let qyRoof = null;
function qyMarketRoof(g) {
  const r = new THREE.Group(), x0 = cxw(SM_B[0] + 10) - 0.6, x1 = cxw(SM_B[0] + 19) + 0.6, z0 = cxw(SM_B[1] + 8) - 0.6, z1 = cxw(SM_B[1] + 13) + 0.6;
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.8, 0.08, (z1 - z0) / 2 + 0.6), QYM.roof); m.position.set((x0 + x1) / 2, 4.55, (z0 + z1) / 2 + s * (z1 - z0) / 4); m.rotation.x = s * 0.18; r.add(m); }
  for (const z of [z0, z1, (z0 + z1) / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.22, 0.14), QYM.post); m.position.set((x0 + x1) / 2, 4.2, z); r.add(m); }
  for (const x of [x0 + 2, (x0 + x1) / 2, x1 - 2]) for (const z of [z0 + 1.5, z1 - 1.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), smGlowM(0xf2f6ff)); m.position.set(x, 4.1, z); r.add(m); }
  r.traverse(o => { o.castShadow = false; }); r.visible = false; g.add(r); qyRoof = r;
}
function qyTick() { if (qyRoof) qyRoof.visible = fpOn(); }
// the edges: the harbour buildings north (qyNorth); the quay's edge south, its granite coping, ladders and lifebuoys,
// the harbour water beyond, the boats moored in it, the breakwater and its light; at each end the quay road closed by
// a barrier, the sheds beyond
function qyEdges() {
  const ez = smZ1 - 0.5;
  for (let i = SM_B[0] + 1; i < SM_B[2]; i++) { const x = cxw(i); smBx(1, 0.35, 1, smSH.stoneLo, x, 0.18, ez); smBx(1, 0.08, 1.02, smSH.stoneLoDk, x, 0.37, ez); }
  for (const x of [-9.5, -2.5, 2.5, 9.5]) { smBx(0.5, 0.05, 0.08, smSH.iron, x, 0.3, ez + 0.5); for (const s of [-0.2, 0.2]) smBx(0.04, 2.4, 0.04, smSH.iron, x + s, -0.9, ez + 0.54); }   // (ladders down to the water)
  for (const x of [-6, 6]) { smCy(0.05, 0.05, 1.4, smSH.iron, x, 0.7, ez, 6); const b = smPush(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 16), lam(0xe0662a))); b.position.set(x, 1.1, ez - 0.08); }
  // the water: down the quay's face, and out to the breakwater
  const w = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), QYM.water); w.rotation.x = -Math.PI / 2; w.position.set(0, -1.6, smZ1 + 30); w.receiveShadow = true; smG.add(w);
  smBx(smX1 - smX0 + 30, 1.6, 0.4, smSH.stoneLoDk, 0, -0.8, smZ1 + 0.2);
  // the boats moored off the quay (low in the water: they never stand in front of anything from above)
  for (const [x, zz, c] of [[-9, 4.5, 0], [-2, 6, 2], [6, 4.2, 1], [12, 7, 0]]) { smBx(2.2, 0.9, 6.5, QYM.hull[c], x, -1.1, smZ1 + zz); smBx(1.8, 0.06, 5.8, QYM.deck, x, -0.62, smZ1 + zz); smBx(1.4, 1.0, 1.6, QYM.wheelhouse, x, -0.1, smZ1 + zz + 1.2); smCy(0.05, 0.05, 3.2, smSH.iron, x, 1.0, smZ1 + zz - 1, 6); }
  // the breakwater and its light, far off
  smBx(50, 1.2, 3, smSH.stoneLoDk, -6, -0.6, smZ1 + 26); smCy(0.9, 1.1, 6, lam(0xf1ece0), 18, 2.6, smZ1 + 26, 12); smCy(1.0, 1.0, 1.2, lam(0xb8322a), 18, 6.2, smZ1 + 26, 12); smBx(0.8, 0.6, 0.8, smGlowM(0xfff1c8), 18, 7.1, smZ1 + 26);
  // each end: the quay road closed off by a barrier, the road on beyond. The town climbs the hill behind the harbour
  // (north and west, behind the map from above: its terraces of cottages, roofs stepping up); east of it (between the
  // map and the camera) only the low harbour wall, a parked van and the slipway
  for (const s of [-1, 1]) {
    const ex = s < 0 ? smX0 + 0.5 : smX1 - 0.5;
    smBx(0.12, 0.1, 10.5, lam(0xd8d2c0), ex, 1.0, smZ0 + 11); for (let k = 0; k < 6; k++) smBx(0.13, 0.1, 0.8, lam(0xc0332a), ex, 1.0, smZ0 + 6.7 + k * 1.7); for (const z of [smZ0 + 5.8, smZ0 + 16.2]) smCy(0.08, 0.08, 1.1, smSH.iron, ex, 0.55, z, 6);
    smPic(1.4, 0.7, smTexM(smSignTex('QUAY · AUTHORISED ONLY', '#1f3a4a', '#ffffff', 1.4, 'Arial'), true), ex - s * 0.08, 1.45, smZ0 + 9, [-s, 0]);
    smBx(16, 0.02, 9, lam(0x3e3f42), ex + s * 8.5, -0.005, smZ0 + 11);
    if (s < 0) for (const z of [smZ0 + 2.5, smZ1 - 3]) { smBx(9, 5, 5, lam([0xe6e2d6, 0xbfcfd4][z < 0 ? 0 : 1]), ex - 5.5, 2.5, z); const rf = smBx(9.2, 0.16, 3.2, smSH.slateLo, ex - 5.5, 5.6, z); rf.rotation.z = 0.5; }
    else { smBx(6, 1.0, 0.5, smSH.stoneLo, ex + 4, 0.5, smZ0 + 5.5); smBx(6, 1.0, 0.5, smSH.stoneLo, ex + 4, 0.5, smZ0 + 16.5); const v = lam(0xe4e2dc); smBx(2.0, 1.8, 4.6, v, ex + 4, 1.1, smZ0 + 11); smBx(1.9, 0.5, 1.2, smSH.dark, ex + 4, 1.5, smZ0 + 8.9); }
  }
  // the town on the hill behind: terraces of cottages, each row higher up the slope than the last
  const cols = [0xe6e2d6, 0xd4c8b0, 0xbfcfd4, 0xe2c9b4, 0xc9d3cf];
  for (let row = 0; row < 3; row++) for (let x = smX0 - 10 + row * 2; x < smX1 + 8; x += 4.2) {
    const z = smZ0 - 4 - row * 6, y0 = row * 1.6, h = rr(4.5, 6), c = lam(cols[Math.floor(rand() * cols.length)]);
    smBx(4.1, h + y0, 4.5, c, x, (h + y0) / 2, z); const rf = smBx(4.3, 0.15, 2.8, smSH.slateLo, x, h + y0 + 0.75, z + 1.1); rf.rotation.x = 0.55;
    smBx(0.7, 0.9, 0.05, smSH.glassLo, x - 0.9, y0 + 2.2, z + 2.26); smBx(0.7, 0.9, 0.05, smSH.glassLo, x + 0.9, y0 + 2.2, z + 2.26);
    if (rand() < 0.5) smBx(0.5, 1.0, 0.5, lam(0x8a4a36), x + rr(-1.4, 1.4), h + y0 + 1.2, z);
  }
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 70), lam(0x5a5c56)); gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, -0.02, smZ0 - 25); gnd.receiveShadow = true; smG.add(gnd);
}
function quayBuild(g) {
  smG = g; smPARTS = []; smPLAN = QY_PLAN;
  const fl = qyFloor(); fl.onBeforeRender = qyTick;
  qyNorth(); qyEdges(); qyMarketRoof(g);
  for (let j = SM_B[1]; j <= SM_B[3]; j++) for (let i = SM_B[0]; i <= SM_B[2]; i++) {
    const k = smKIND(i, j), x = cxw(i), z = cxw(j);
    if (k === 'h' && smFirst(i, j, k)) qyCorner(smRectOf(i, j, k));
    else if (k === 'V' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.d > R.w) qyBoat(R); else qyPickup(R); }
    else if (k === 'M' && smFirst(i, j, k)) { const R = smRectOf(i, j, k); if (R.cz < 0) qyOffice(R); else qyCrane(R); }
    else if (k === 'P') qyPost(x, z);
    else if (k === 'X') qyBoxes(x, z, 8);
    else if (k === 'k') { if (z > 4 || (smKIND(i, j + 1) === '#' && z > 0)) qyPots(x, z); else qyBoxes(x, z, 3); }
    else if (k === 'g') qyBench(x, z);
    else if (k === 'o') { if (z > 6) qyBollard(x, z); else qyScales(x, z); }
    else if (k === 'w') qyFloats(x, z);
  }
  for (const [x, z] of QY_LAMPS) smLampPost(x, z);
  const parts = smPARTS; smG = smPARTS = null; return parts;
}
const QY_LAMPS = [[-11.6, -6.4], [11.6, -6.4], [-7.6, 6.6], [7.6, 6.6], [-12.4, 9.4], [12.4, 9.4]];

// ---- the maps as world/arena.js takes them (AR_MAPS)
const smLampList = (L, extra) => () => [...L.map(([x, z]) => ({ arena: true, x, z, r: 9, col: [1, 0.78, 0.5], int: 1.0 })), ...(extra || [])];
export const SQUARE_MAP = {
  id: 'square', name: 'Hawthorne Square', note: '1v1 and 2v2: a market town’s square, the memorial, the churchyard',
  plan: SQ_PLAN, b: SM_B, h: SQ_H, low: SQ_LOW, vault: SQ_LOW, walls: '#h', what: SQ_WHAT, build: squareBuild, indoor: false, tod: null, thru: '', small: true,
  under: { V: 0.38 },   // (the buses' and the van's chassis: a round from your own eyes goes under them, world/collision.js)
  lights: smLampList(SQ_LAMPS), flares: []
};
export const QUAY_MAP = {
  id: 'quay', name: 'Saltmarsh Quay', note: '1v1 and 2v2: a fishing harbour’s quay, the fish market, the crane',
  plan: QY_PLAN, b: SM_B, h: QY_H, low: QY_LOW, vault: QY_VAULT, walls: '#h', what: QY_WHAT, build: quayBuild, indoor: false, tod: null, thru: '', small: true,
  under: { V: 0.45 },   // (the boats' trailers and the pickup's chassis)
  lights: smLampList(QY_LAMPS, [{ arena: true, x: 0, z: 0, r: 9, col: [0.9, 0.95, 1], int: 0.9 }]), flares: []
};
