// Forest placement and the foliage: pines of every size with shade pools under them, bushes and rocks, each a handful
// of low-poly shapes drawn instanced; and what parts the grass and bushes as you walk through.

import { scene, V3, YAW } from '../core/renderer.js';
import { _rng, clamp, HALF, N, pick, rand, rr, seeded, setRng, smooth } from '../core/math.js';
import { PUSHERS } from '../core/shaders.js';
import { BLOB_TEX } from '../core/geometry.js';
import { cell, cxw, EMPTY, FENCE, idx, inb, OBST, WALL } from './grid.js';
import { M } from './materials.js';
import { FAR_VIEW, HX0, HX1, HZ0, HZ1, onRoad, ROAD } from './ground.js';
import { obstacle } from './props.js';
import { FX0, FX1, FZ0, FZ1, GAPS, nearGap } from './fence.js';
import { P } from '../player/player.js';
import { zombies } from '../zombies/zombie-types.js';
import { state } from '../game/state.js';
import { HELI_PUSH } from '../stations/supply-drop.js';

export const treeCells = [], TREES = [];
// the yard fence stays in view: no pine stands within FENCE_CLEAR cells outside it (FENCE_CLEAR_CAM on the sides that
// face the camera, where one would stand in front of the fence and hide it), nor in the way in to one of its gaps
// (a lane GAP_LANE cells either side of the gap, straight out to the forest)
const FENCE_CLEAR = 2, FENCE_CLEAR_CAM = 5, GAP_LANE = 2;
const outFence = (i, j) => Math.max(FX0 - i, i - FX1, FZ0 - j, j - FZ1);   // how many cells outside the fence line
const camSide = (i, j) => (i > FX1 && Math.sin(YAW) > 0) || (i < FX0 && Math.sin(YAW) < 0) || (j > FZ1 && Math.cos(YAW) > 0) || (j < FZ0 && Math.cos(YAW) < 0);
const gapLane = (i, j) => ((j > FZ1 || j < FZ0) && i >= 20 - GAP_LANE && i <= 22 + GAP_LANE) || ((i > FX1 || i < FX0) && j >= 21 - GAP_LANE && j <= 22 + GAP_LANE);
// ---- the models: each shape a few low-poly pieces, flat-shaded, every face a shade lighter or darker than its colour so
// the facets read, joined into one geometry with its colours baked in. So a whole tree (trunk, boughs and leaves) is one
// instanced draw, and every instance gets a tint of its own
const _tfc = new THREE.Color(), _tfq = new THREE.Quaternion(), _tfe = new THREE.Euler(), _tfv = new V3(), _tfs = new V3();
const fm4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(_tfv.set(x, y, z), _tfq.setFromEuler(_tfe.set(rx || 0, ry || 0, rz || 0)), _tfs.set(sx || 1, sy || sx || 1, sz || sx || 1));
// a piece coloured hex, each face varied by up to vary
function fpiece(geo, hex, vary, m4) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (m4) g.applyMatrix4(m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let f = 0; f < n; f += 3) { _tfc.setHex(hex).multiplyScalar(1 + rr(-vary, vary)); for (let v = 0; v < 3; v++) { col[(f + v) * 3] = _tfc.r; col[(f + v) * 3 + 1] = _tfc.g; col[(f + v) * 3 + 2] = _tfc.b; } }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function fjoin(parts) {
  let n = 0; parts.forEach(g => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  parts.forEach(g => { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
// each pine's boughs shade smoothly from a deep green low down to a lighter, sunnier one at the tip, the whole height of
// the tree as one gradient rather than a flat colour per tier
const BARK = 0x4a3626, PINE = [0x26361f, 0x51683a], PINE2 = [0x22332a, 0x48603f];
const _tgb = new THREE.Color(), _tgt = new THREE.Color();
// a pine: tiers of cones over a trunk (tr: how much of it shows below the lowest boughs), each tier a little off true
// and turned
function pineGeo(tiers, w, h0, greens, tr = 0.9) {
  const tk = tr + 0.6, P = [fpiece(new THREE.CylinderGeometry(0.11, 0.18 * (tr > 1.2 ? 1.15 : 1), tk, 7), BARK, 0.08, fm4(0, tk / 2, 0))], cones = [];
  let y = tr, top = tr;
  for (let k = 0; k < tiers; k++) {
    const t = k / Math.max(1, tiers - 1), r = w * (1 - 0.7 * t) * rr(0.94, 1.06), hh = h0 * (1 - 0.4 * t);
    cones.push(fpiece(new THREE.ConeGeometry(r, hh, 8), greens[0], 0, fm4(rr(-0.05, 0.05), y + hh / 2, rr(-0.05, 0.05), rr(-0.05, 0.05), rand() * 6, rr(-0.05, 0.05))));
    top = y + hh; y += hh * (tiers > 3 ? 0.42 : 0.48);
  }
  _tgb.setHex(greens[0]); _tgt.setHex(greens[1]);
  cones.forEach(g => {
    const pos = g.attributes.position, col = g.attributes.color;
    for (let v = 0; v < pos.count; v++) { _tfc.copy(_tgb).lerp(_tgt, clamp((pos.getY(v) - tr) / (top - tr), 0, 1)); col.setXYZ(v, _tfc.r, _tfc.g, _tfc.b); }
    P.push(g);
  });
  return fjoin(P);
}
// bushes: a round clump, a low spreading one, a tall tuft of grass blades, and a berry bush
const BUSHG = [0x3d4d30, 0x4a5a35, 0x34442b, 0x52603a];
function bushGeo(kind) {
  const P = [];
  if (kind === 'grass') {
    for (let k = 0; k < 13; k++) { const a = rand() * 6.28, t = rr(0.12, 0.5), h = rr(0.45, 0.85); P.push(fpiece(new THREE.ConeGeometry(rr(0.03, 0.05), h, 3), pick([0x6b6c47, 0x7d7a4c, 0x5f6640]), 0.1, fm4(Math.sin(a) * 0.06 + Math.sin(a) * Math.sin(t) * h / 2, Math.cos(t) * h / 2, Math.cos(a) * 0.06 + Math.cos(a) * Math.sin(t) * h / 2, Math.cos(a) * t, 0, -Math.sin(a) * t))); }
    return fjoin(P);
  }
  const low = kind === 'low', n = low ? 6 : 5;
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.28 + rr(-0.3, 0.3), d = k ? rr(0.15, low ? 0.42 : 0.28) : 0, r = rr(0.2, 0.32) * (low ? 0.9 : 1.1);
    P.push(fpiece(new THREE.IcosahedronGeometry(r, 0), pick(BUSHG), 0.1, fm4(Math.sin(a) * d, (low ? 0.16 : 0.3) + (k ? rr(-0.05, 0.1) : 0.1), Math.cos(a) * d, rand() * 3, rand() * 3, rand() * 3, 1, low ? 0.6 : 0.85, 1)));
  }
  if (kind === 'berry') for (let k = 0; k < 14; k++) { const a = rand() * 6.28, e = rr(0.1, 1.2), R = 0.36; P.push(fpiece(new THREE.IcosahedronGeometry(0.035, 0), pick([0x8a1f2a, 0x5a1a3a, 0xa0302a]), 0.1, fm4(Math.sin(a) * Math.cos(e) * R, 0.32 + Math.sin(e) * R * 0.75, Math.cos(a) * Math.cos(e) * R))); }
  return fjoin(P);
}
// rocks: a boulder with its faces knocked about, a flat slab, a cluster of small ones, a big mossy one. The surface is
// pushed in and out by smooth waves of its own, so faces that share a corner still meet; darker low down, moss on top
function boulderGeo(r, sx, sy, sz, moss) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, ph = [rand() * 6, rand() * 6, rand() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.16 * Math.sin(x / r * 3.1 + ph[0]) * Math.cos(z / r * 2.7 + ph[1]) + 0.1 * Math.sin(y / r * 3.7 + ph[2]);
    p.setXYZ(i, x * k * sx, Math.max(-0.35 * r, y * k * sy), z * k * sz);
  }
  g.computeVertexNormals();
  const out = fpiece(g, 0x77736b, 0.07), c = out.attributes.color, pp = out.attributes.position, top = r * sy;
  for (let f = 0; f < pp.count; f += 3) {
    const y = (pp.getY(f) + pp.getY(f + 1) + pp.getY(f + 2)) / 3, ny = new THREE.Triangle(_tfv.fromBufferAttribute(pp, f), new V3().fromBufferAttribute(pp, f + 1), new V3().fromBufferAttribute(pp, f + 2)).getNormal(new V3()).y;
    if (moss && ny > 0.6 && rand() < moss) { _tfc.setHex(pick([0x5d6b3e, 0x4f5f35])); }
    else _tfc.setRGB(c.getX(f), c.getY(f), c.getZ(f)).multiplyScalar(0.72 + 0.28 * clamp((y + top * 0.3) / (top * 1.3), 0, 1));
    for (let v = 0; v < 3; v++) c.setXYZ(f + v, _tfc.r, _tfc.g, _tfc.b);
  }
  return out;
}
function rockGeo(kind) {
  if (kind === 'slab') return fjoin([boulderGeo(0.32, 1.35, 0.32, 1.05, 0.25)]);
  if (kind === 'cluster') return fjoin([[0, 0, 0, 0.17], [0.24, 0, 0.1, 0.12], [-0.12, 0, 0.22, 0.1], [0.1, 0, -0.2, 0.08]].map(([x, y, z, r]) => { const g = boulderGeo(r, 1, 0.75, 1, 0.15); g.translate(x, y, z); return g; }));
  if (kind === 'mossy') return fjoin([boulderGeo(0.33, 1.1, 0.62, 0.95, 0.7)]);
  return fjoin([boulderGeo(0.28, 1, 0.7, 0.9, 0.2)]);
}
// the pines, and how much of the forest each makes up: a slim one, one a little shorter and one on a longer bare trunk,
// all within about a metre of each other in height (each tree scaled a touch again as it's planted). r is how far its
// widest boughs reach
const TREE_VAR = [
  { geo: () => pineGeo(4, 0.85, 1.75, PINE2, 1.0), w: 0.36, shade: 2.8, r: 0.85 },
  { geo: () => pineGeo(3, 0.95, 1.85, PINE2, 0.8), w: 0.32, shade: 3.1, r: 0.95 }, { geo: () => pineGeo(4, 0.95, 1.7, PINE, 1.25), w: 0.32, shade: 3.1, r: 0.95 }
].map(v => ({ ...v, g: v.geo() }));
// and out in the far woods (seen from your own eyes) some broadleaf trees among the pines, so the tree line isn't one
// row of cones: a trunk and a few lumpy blobs of leaves, mostly green, one turning
const BROADG = [[0x4a5a2c, 0x56662f, 0x3f5028], [0x52602e, 0x5f6a32, 0x46562a], [0x6e6a2c, 0x7a6230, 0x5e5a2a]];
function broadGeo(greens, h) {
  const P = [fpiece(new THREE.CylinderGeometry(0.09, 0.16, h, 6), BARK, 0.08, fm4(0, h / 2, 0))];
  [[0, 0.35, 0, 1.0], [0.55, 0.05, 0.2, 0.75], [-0.5, 0.1, -0.15, 0.8], [0.1, 0.85, -0.1, 0.7], [-0.2, -0.05, 0.5, 0.65]].forEach(([x, y, z, r]) =>
    P.push(fpiece(new THREE.IcosahedronGeometry(r * rr(0.9, 1.1), 0), pick(greens), 0.12, fm4(x, h + y, z, rand() * 3, rand() * 3, rand() * 3, 1, rr(0.8, 0.95), 1))));
  return fjoin(P);
}
const BROAD_VAR = [{ geo: () => broadGeo(BROADG[0], 2.2), w: 0.5, r: 1.1 }, { geo: () => broadGeo(BROADG[1], 2.6), w: 0.35, r: 1.15 }, { geo: () => broadGeo(BROADG[2], 2.0), w: 0.15, r: 1.05 }].map(v => ({ ...v, g: v.geo() }));
const pickVar = list => { let t = rand() * list.reduce((a, v) => a + v.w, 0); for (const v of list) { t -= v.w; if (t <= 0) return v; } return list[list.length - 1]; };
// trees keep their distance: no two trunks closer than TREE_GAP of their two crowns' reach added together, so every
// trunk stands clear of its neighbours' boughs and no two pines ever grow out of each other
const TREE_GAP = 0.6, _tgrid = new Map(), TG_CELL = 1.5;
// the woods out toward the horizon (seen from your own eyes): how far out (r, metres from the middle), the grid they're
// dealt on, how likely a spot gets one where they meet the ring round the farm and further out (p), how far past the
// road's far shoulder they start, how much bigger the furthest grow
const FAR_WOODS = { r: 74, step: 1.6, p: [0.22, 0.62], road: 1.5, grow: 0.6, broad: 0.22, tall: 0.12 };   // (broad: how many are broadleaf; tall: how many stand well over the rest)
const _tgk = (a, b) => a * 4096 + b;
function roomForTree(x, z, r) {
  const a = Math.floor(x / TG_CELL), b = Math.floor(z / TG_CELL);
  for (let u = a - 1; u <= a + 1; u++) for (let w = b - 1; w <= b + 1; w++) for (const t of _tgrid.get(_tgk(u, w)) || [])
    if ((t[0] - x) ** 2 + (t[1] - z) ** 2 < (TREE_GAP * (t[2] + r)) ** 2) return false;
  return true;
}
function claimTree(x, z, r) { const k = _tgk(Math.floor(x / TG_CELL), Math.floor(z / TG_CELL)); if (!_tgrid.has(k)) _tgrid.set(k, []); _tgrid.get(k).push([x, z, r]); }
// a tree for the farm's own woods: which pine, how big, where in its cell, and its turn. The woods, the bushes and
// rocks and the ring past the edge are all dealt from one fixed seed (FOREST_SEED), so every player has the same
// trees: in co-op they block, shade and hide alike, and the yard's laid out round the same ones (world/yard.js)
const farmTrees = [], FOREST_SEED = 0x5eed1, _rngWas = _rng;
setRng(seeded(FOREST_SEED));
{
  const spots = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (cell[idx(i, j)]) continue;
    const d = Math.min(i, j, N - 1 - i, N - 1 - j);
    let p = d === 0 ? (nearGap(i, j, 1) ? 0 : 1) : d === 1 ? (nearGap(i, j, 2) ? 0 : .8) : d === 2 ? (nearGap(i, j, 3) ? 0 : .22) : 0;
    const inYard = i >= FX0 - 1 && i <= FX1 + 1 && j >= FZ0 - 1 && j <= FZ1 + 1;
    if (d > 2 && !inYard) p = outFence(i, j) <= (camSide(i, j) ? FENCE_CLEAR_CAM : FENCE_CLEAR) || gapLane(i, j) ? 0 : 0.05;
    if (onRoad(cxw(i), cxw(j), 1.2)) p = 0;   // the drive out to the road stays clear, canopies and all (world/ground.js)
    if (p > 0) spots.push([i, j, d, p]);
  }
  // the trees nearest the yard go in first, so the tree line you see from the farm keeps its shape, and the rows out
  // at the edge fill in round them. A cell gets a few tries at a spot clear of the trees already in
  spots.sort((a, b) => b[2] - a[2]);
  for (const [i, j, d, p] of spots) {
    if (rand() >= p) continue;
    let placed = false;
    for (let t = 0; t < 8 && !placed; t++) {
      // (a tree in the outermost row can stand anywhere in its cell: that whole row is solid anyway)
      const v = pickVar(TREE_VAR), s = rr(0.92, 1.12), o = d === 0 ? 0.45 : 0.2, x = cxw(i) + rr(-o, o), z = cxw(j) + rr(-o, o);
      if (!roomForTree(x, z, v.r * s)) continue;
      claimTree(x, z, v.r * s); farmTrees.push([x, z, s, v, rand() * 6.28]); treeCells.push([i, j]); placed = true;
    }
    // the outermost row is the farm's wall: it stays solid all round, a tree in it or not (the boughs either side and
    // the woods behind cover the spot), so the gaps are still the only ways in
    if (placed || d === 0) obstacle(i, j);
  }
}
// trees placed as [x, z, scale, variant, turn], built as one instanced mesh per variant, each with its own tint
function plantTrees(list, shadows, into = scene) {
  const dm = new THREE.Object3D(), c = new THREE.Color();
  [...new Set(list.map(t => t[3]))].forEach(v => {
    const mine = list.filter(t => t[3] === v);
    const im = new THREE.InstancedMesh(v.g, M.tree, mine.length);
    mine.forEach(([x, z, s, , r], k) => {
      dm.position.set(x, 0, z); dm.rotation.set(rr(-0.04, 0.04), r, rr(-0.04, 0.04)); dm.scale.setScalar(s); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix);
      im.setColorAt(k, c.setRGB(rr(0.86, 1.08), rr(0.88, 1.08), rr(0.84, 1.04)));
    });
    im.castShadow = shadows; im.receiveShadow = into === scene; into.add(im);   // (out past the shadows' reach, none)
  });
}
{
  const trees = farmTrees;
  trees.forEach(([x, z, s]) => TREES.push({ x, z, s }));
  plantTrees(trees, true);
  // a soft dark pool of shade under every tree, as wide as its crown
  const ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB_TEX, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), trees.length), dm = new THREE.Object3D();
  trees.forEach(([x, z, s, v], k) => { dm.position.set(x, 0.015, z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(v.shade * s); dm.updateMatrix(); ao.setMatrixAt(k, dm.matrix); });
  ao.renderOrder = 1; scene.add(ao);
  // bushes and rocks: several shapes of each, along the fences and walls (bushes) and anywhere on open ground (rocks)
  const BUSH_VAR = ['round', 'round', 'low', 'grass', 'berry'].map(k => ({ k, g: bushGeo(k), at: [] })), ROCK_VAR = ['boulder', 'boulder', 'slab', 'cluster', 'mossy'].map(k => ({ k, g: rockGeo(k), at: [] }));
  let nb = 0, nr = 0;
  for (let k = 0; k < 600 && (nb < 70 || nr < 50); k++) {
    const i = (rand() * N) | 0, j = (rand() * N) | 0; if (cell[idx(i, j)] !== EMPTY) continue;
    if (i >= HX0 - 1 && i <= HX1 + 1 && j >= HZ0 - 1 && j <= HZ1 + 2) continue;   // keep the house, its walls and the porch clear
    if (onRoad(cxw(i), cxw(j), 0.3)) continue;   // and the drive
    const next = t => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(i + a, j + b) && t(cell[idx(i + a, j + b)]));
    const byFence = next(c => c === FENCE || c === WALL), byTree = next(c => c === OBST);
    if ((byFence || byTree) && nb < 70 && rand() < 0.5) { pick(BUSH_VAR).at.push([cxw(i) + rr(-0.3, 0.3), cxw(j) + rr(-0.3, 0.3), rr(0.8, 1.35)]); nb++; }
    else if (nr < 50 && rand() < 0.3) { pick(ROCK_VAR).at.push([cxw(i) + rr(-0.4, 0.4), cxw(j) + rr(-0.4, 0.4), rr(0.6, 1.15)]); nr++; }   // (small enough to walk over: they don't block)
  }
  const place = (vars, mat, tilt) => vars.forEach(v => {
    if (!v.at.length) return; const im = new THREE.InstancedMesh(v.g, mat, v.at.length), c = new THREE.Color();
    v.at.forEach(([x, z, s], k) => { dm.position.set(x, 0, z); dm.rotation.set(rr(-tilt, tilt), rand() * 6.28, rr(-tilt, tilt)); dm.scale.set(s * rr(0.9, 1.1), s * rr(0.85, 1.1), s * rr(0.9, 1.1)); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix); im.setColorAt(k, c.setRGB(rr(0.88, 1.08), rr(0.9, 1.08), rr(0.86, 1.04))); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  });
  place(BUSH_VAR, M.bush, 0.05); place(ROCK_VAR, M.rock, 0.12);
}

// the woods go on past the edge of the farm: a ring of trees, the same mix, thinning out as it goes, with the trails the zombies come
// in by left clear in front of the gaps, and the drive and the main road cut through it (world/ground.js), fading into
// the haze (core/shaders.js) so the farm never just stops
{
  const R = 15, out = [], gapDir = GAPS.map(([i, j]) => ({ x: cxw(i), z: cxw(j), ax: i === 0 ? -1 : i === N - 1 ? 1 : 0, az: j === 0 ? -1 : j === N - 1 ? 1 : 0 }));
  const onTrail = (x, z) => gapDir.some(g => g.ax ? Math.sign(x - g.x) === g.ax && Math.abs(z - g.z) < 1.7 : Math.sign(z - g.z) === g.az && Math.abs(x - g.x) < 1.7);
  for (let z = -HALF - R; z < HALF + R; z += 1.05) for (let x = -HALF - R; x < HALF + R; x += 1.05) {
    if (rand() >= 0.7 * Math.pow(1 - clamp(Math.max(Math.abs(x), Math.abs(z)) - HALF - 0.3, 0, R) / R, 0.5) + 0.15) continue;
    // a few tries round the spot for one clear of the trees already in (the farm's own first)
    for (let t = 0; t < 6; t++) {
      const px = x + rr(-0.5, 0.5), pz = z + rr(-0.5, 0.5), d = Math.max(Math.abs(px), Math.abs(pz)) - HALF - 0.3;
      // nothing on the far side of the road either: that strip is nearer the camera, and its trees would stand in front of it
      if (d < 0 || onTrail(px, pz) || onRoad(px, pz, 1.6) || pz > ROAD.z) continue;
      const v = pickVar(TREE_VAR), s = rr(0.95, 1.2);
      if (!roomForTree(px, pz, v.r * s)) continue;
      claimTree(px, pz, v.r * s); out.push([px, pz, s, v, (px * 7.3 + pz * 3.1) % 6.28]); break;
    }
  }
  plantTrees(out, false);
  // and on out toward the horizon, only from your own eyes or the free camera (FAR_VIEW, world/ground.js): past the ring
  // out to FAR_WOODS.r, and past the road (right from its far shoulder, where from above they'd stand in front of the
  // farm), thickening as the ring thins so there's no wall where one meets the other, the trees a little bigger further
  // out so the tree line stands up against the sky, the trails in and the road still clear
  {
    const F = FAR_WOODS, far = [];
    for (let z = -F.r; z < F.r; z += F.step) for (let x = -F.r; x < F.r; x += F.step) {
      const d = Math.max(Math.abs(x), Math.abs(z)) - HALF - R, past = z > ROAD.z + ROAD.w / 2 + F.road;
      if ((d < 0 && !past) || Math.hypot(x, z) > F.r) continue;
      if (rand() >= F.p[0] + (F.p[1] - F.p[0]) * smooth(clamp(Math.max(d, 0) / 8, 0, 1))) continue;
      const px = x + rr(-0.7, 0.7), pz = z + rr(-0.7, 0.7);
      if (onRoad(px, pz, 2.2) || onTrail(px, pz)) continue;
      const v = pickVar(rand() < F.broad ? BROAD_VAR : TREE_VAR), k = clamp((Math.hypot(px, pz) - HALF - R) / (F.r - HALF - R), 0, 1), s = (rr(0.98, 1.22) + k * rr(0.2, F.grow)) * (rand() < F.tall ? rr(1.25, 1.6) : 1);
      if (!roomForTree(px, pz, v.r * s)) continue;
      claimTree(px, pz, v.r * s); far.push([px, pz, s, v, rand() * 6.28]);
    }
    plantTrees(far, false, FAR_VIEW);
  }
  setRng(_rngWas);   // (the woods are in: back to Math.random)
}

// what parts the grass and bushes (PUSHERS in core/shaders.js): you, and the three zombies nearest you on their feet (or
// two, and a helicopter's downwash while one's overhead)
const _pz = [];
export function updatePushers() {
  const U = PUSHERS.value, pl = !P.dead && state !== 'title' && !P.vault;
  U[0].set(P.x, P.z, 0.75, pl ? 0.6 : 0);
  _pz.length = 0;
  for (const z of zombies) { if (z.dead) continue; const d = (z.x - P.x) ** 2 + (z.z - P.z) ** 2; if (d < 400) _pz.push([d, z]); }
  _pz.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < 4; k++) { const e = _pz[k - 1]; if (e) U[k].set(e[1].x, e[1].z, 0.6 * e[1].T.scale, 0.5); else U[k].w = 0; }
  if (HELI_PUSH.w > 0) U[3].copy(HELI_PUSH);   // a helicopter's downwash flattening the grass takes the last place (stations/supply-drop.js)
}
