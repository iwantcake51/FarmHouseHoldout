// Forest placement and the foliage: pines, spruces, broadleaves and dead trees with shade pools under them, bushes and
// rocks, each a handful of low-poly shapes drawn instanced; and what parts the grass and bushes as you walk through.

const treeCells = [], TREES = [];
// the yard fence stays in view: no pine stands within FENCE_CLEAR cells outside it (FENCE_CLEAR_CAM on the sides that
// face the camera, where one would stand in front of the fence and hide it), nor in the way in to one of its gaps
// (a lane GAP_LANE cells either side of the gap, straight out to the forest)
const FENCE_CLEAR = 2, FENCE_CLEAR_CAM = 5, GAP_LANE = 2;
const outFence = (i, j) => Math.max(FX0 - i, i - FX1, FZ0 - j, j - FZ1);   // how many cells outside the fence line
const camSide = (i, j) => (i > FX1 && Math.sin(YAW) > 0) || (i < FX0 && Math.sin(YAW) < 0) || (j > FZ1 && Math.cos(YAW) > 0) || (j < FZ0 && Math.cos(YAW) < 0);
const gapLane = (i, j) => ((j > FZ1 || j < FZ0) && i >= 20 - GAP_LANE && i <= 22 + GAP_LANE) || ((i > FX1 || i < FX0) && j >= 21 - GAP_LANE && j <= 22 + GAP_LANE);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  if (cell[idx(i, j)]) continue;
  const d = Math.min(i, j, N - 1 - i, N - 1 - j);
  let p = d === 0 ? (nearGap(i, j, 1) ? 0 : 1) : d === 1 ? (nearGap(i, j, 2) ? 0 : .6) : d === 2 ? (nearGap(i, j, 3) ? 0 : .22) : 0;
  const inYard = i >= FX0 - 1 && i <= FX1 + 1 && j >= FZ0 - 1 && j <= FZ1 + 1;
  if (d > 2 && !inYard) p = outFence(i, j) <= (camSide(i, j) ? FENCE_CLEAR_CAM : FENCE_CLEAR) || gapLane(i, j) ? 0 : 0.05;
  if (onRoad(cxw(i), cxw(j), 1.2)) p = 0;   // the drive out to the road stays clear, canopies and all (world/ground.js)
  if (rand() < p) { obstacle(i, j); treeCells.push([i, j]); }
}

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
// a limb from a to b (radius r0 at a, r1 at b)
function fbough(a, b, r0, r1, hex, seg) {
  const d = _tfv.copy(b).sub(a), L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(new V3().copy(a).lerp(b, 0.5), q, new V3(1, 1, 1));
  return fpiece(new THREE.CylinderGeometry(r1, r0, L, seg || 5), hex, 0.08, m);
}
const BARK = 0x4a3626, BARK2 = 0x5a4130, DEADWOOD = [0x625a50, 0x584f45, 0x6b6156], PINE = [0x34462f, 0x3f5236, 0x2f4130], SPRUCE = [0x2c3f33, 0x354a3b, 0x283a2f], LEAF = [0x445c2f, 0x4f6533, 0x3c5329, 0x586c35];
// a pine: tiers of cones over a short trunk, each tier a little off true and turned
function pineGeo(tiers, w, h0, greens) {
  const P = [fpiece(new THREE.CylinderGeometry(0.11, 0.18, 1.5, 7), BARK, 0.08, fm4(0, 0.75, 0))];
  let y = 0.9;
  for (let k = 0; k < tiers; k++) {
    const t = k / Math.max(1, tiers - 1), r = w * (1 - 0.7 * t) * rr(0.94, 1.06), hh = h0 * (1 - 0.4 * t);
    P.push(fpiece(new THREE.ConeGeometry(r, hh, 8), greens[k % greens.length], 0.08, fm4(rr(-0.05, 0.05), y + hh / 2, rr(-0.05, 0.05), rr(-0.05, 0.05), rand() * 6, rr(-0.05, 0.05))));
    y += hh * (tiers > 3 ? 0.42 : 0.48);
  }
  return fjoin(P);
}
// a broadleaf: a trunk forking into boughs, a round canopy of leafy clumps
function broadGeo(big) {
  const P = [], h = big ? 1.9 : 1.6, s = big ? 1 : 0.82;
  P.push(fpiece(new THREE.CylinderGeometry(0.12, 0.21, h, 7), BARK2, 0.07, fm4(0, h / 2, 0)));
  const top = new V3(0, h, 0);
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + rr(-0.3, 0.3), out = rr(0.45, 0.7) * s; P.push(fbough(top, new V3(Math.sin(a) * out, h + rr(0.45, 0.7) * s, Math.cos(a) * out), 0.09, 0.04, BARK2)); }
  const clumps = [[0, 0.95, 0, 0.95], [0.62, 0.65, 0.2, 0.72], [-0.55, 0.7, -0.25, 0.78], [0.15, 0.6, -0.62, 0.7], [-0.25, 0.55, 0.6, 0.7], [0.1, 1.4, 0.05, 0.6]];
  clumps.forEach(([x, y, z, r]) => P.push(fpiece(new THREE.IcosahedronGeometry(r * s, 0), pick(LEAF), 0.1, fm4((x + rr(-0.1, 0.1)) * s, h + (y + rr(-0.1, 0.1)) * s, (z + rr(-0.1, 0.1)) * s, rand() * 3, rand() * 3, rand() * 3, 1, rr(0.8, 0.95), 1))));
  return fjoin(P);
}
// a dead tree: a bare trunk leaning a little, its limbs reaching up and out and forking at the ends
function deadGeo() {
  const P = [], c = pick(DEADWOOD), lean = rr(-0.16, 0.16), la = rand() * 6.28;
  const base = new V3(0, 0, 0), mid = new V3(0, 1.7, 0), tip = new V3(Math.sin(la) * lean * 2, 3.2, Math.cos(la) * lean * 2);
  P.push(fbough(base, mid, 0.19, 0.12, c, 7), fbough(mid, tip, 0.12, 0.03, c, 6));
  for (let k = 0; k < 6; k++) {
    const f = rr(0.35, 0.9), at = new V3().copy(mid).lerp(tip, f), a = k * 1.15 + rr(-0.3, 0.3), L = rr(0.55, 1.05) * (1.1 - f * 0.5), up = rr(0.35, 0.8);
    const end = new V3(at.x + Math.sin(a) * L, at.y + up * L, at.z + Math.cos(a) * L);
    P.push(fbough(at, end, 0.055, 0.02, c));
    if (rand() < 0.7) { const b = a + rr(-0.9, 0.9), l2 = L * rr(0.3, 0.5); P.push(fbough(end, new V3(end.x + Math.sin(b) * l2, end.y + rr(0.15, 0.4) * l2, end.z + Math.cos(b) * l2), 0.02, 0.008, c, 4)); }
  }
  P.push(fbough(mid.clone().setY(1.0), new V3(rr(-0.4, 0.4), 1.15, rr(-0.4, 0.4)), 0.05, 0.03, c));   // a broken-off stub low down
  return fjoin(P);
}
// a dead pine: a tall bare spar, short dead stubs all the way up it, angled down
function deadPineGeo() {
  const P = [], c = pick(DEADWOOD), H = rr(3.3, 3.9);
  P.push(fbough(new V3(0, 0, 0), new V3(rr(-0.08, 0.08), H, rr(-0.08, 0.08)), 0.17, 0.025, c, 6));
  for (let y = 1.0; y < H - 0.35; y += rr(0.16, 0.3)) {
    const a = rand() * 6.28, r = 0.15 * (1 - y / H) + 0.03, L = rr(0.25, 0.7) * (1 - y / H * 0.7);
    P.push(fbough(new V3(0, y, 0), new V3(Math.sin(a) * (L + r), y - rr(0.05, 0.25), Math.cos(a) * (L + r)), 0.03, 0.01, c, 4));
  }
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
// the shapes, and how much of the forest each makes up: the farm's own trees and the woods past its edge
const TREE_VAR = [
  { geo: () => pineGeo(3, 1.05, 2.0, PINE), w: 0.3, shade: 3.4 }, { geo: () => pineGeo(3, 0.95, 2.1, PINE), w: 0.12, shade: 3.2 },
  { geo: () => pineGeo(5, 0.85, 1.35, SPRUCE), w: 0.18, shade: 2.8 },
  { geo: () => broadGeo(true), w: 0.12, shade: 3.8 }, { geo: () => broadGeo(false), w: 0.08, shade: 3.2 },
  { geo: deadGeo, w: 0.1, shade: 2.0, dead: true }, { geo: deadPineGeo, w: 0.1, shade: 1.4, dead: true }
].map(v => ({ ...v, g: v.geo() }));
const pickVar = list => { let t = rand() * list.reduce((a, v) => a + v.w, 0); for (const v of list) { t -= v.w; if (t <= 0) return v; } return list[list.length - 1]; };
// trees placed as [x, z, scale, variant, turn], built as one instanced mesh per variant, each with its own tint
function plantTrees(list, shadows) {
  const dm = new THREE.Object3D(), c = new THREE.Color();
  TREE_VAR.forEach(v => {
    const mine = list.filter(t => t[3] === v); if (!mine.length) return;
    const im = new THREE.InstancedMesh(v.g, v.dead ? M.deadTree : M.tree, mine.length);
    mine.forEach(([x, z, s, , r], k) => {
      dm.position.set(x, 0, z); dm.rotation.set(rr(-0.04, 0.04), r, rr(-0.04, 0.04)); dm.scale.setScalar(s); dm.updateMatrix(); im.setMatrixAt(k, dm.matrix);
      im.setColorAt(k, c.setRGB(rr(0.86, 1.08), rr(0.88, 1.08), rr(0.84, 1.04)));
    });
    im.castShadow = shadows; im.receiveShadow = true; scene.add(im);
  });
}
{
  const trees = treeCells.map(([i, j]) => { const v = pickVar(TREE_VAR), s = rr(0.85, 1.4) * (v.dead ? rr(0.85, 1.05) : 1); return [cxw(i) + rr(-0.2, 0.2), cxw(j) + rr(-0.2, 0.2), s, v, rand() * 6.28]; });
  trees.forEach(([x, z, s]) => TREES.push({ x, z, s }));
  plantTrees(trees, true);
  // a soft dark pool of shade under every tree, as wide as its crown (a dead one's is thin)
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
    const px = x + rr(-0.4, 0.4), pz = z + rr(-0.4, 0.4), d = Math.max(Math.abs(px), Math.abs(pz)) - HALF - 0.3;
    // nothing on the far side of the road either: that strip is nearer the camera, and its trees would stand in front of it
    if (d < 0 || onTrail(px, pz) || onRoad(px, pz, 1.6) || pz > ROAD.z) continue;
    if (rand() < 0.62 * Math.pow(1 - d / R, 0.5) + 0.12) out.push([px, pz, rr(0.85, 1.5)]);
  }
  plantTrees(out.map(([x, z, s]) => { const v = pickVar(TREE_VAR.filter(q => !q.dead || rand() < 0.8)); return [x, z, s * (v.dead ? 0.9 : 1), v, (x * 7.3 + z * 3.1) % 6.28]; }), false);
}

// what parts the grass and bushes (PUSHERS in core/shaders.js): you, and the three zombies nearest you on their feet
const _pz = [];
function updatePushers() {
  const U = PUSHERS.value, pl = !P.dead && state !== 'title' && !P.vault;
  U[0].set(P.x, P.z, 0.75, pl ? 0.6 : 0);
  _pz.length = 0;
  for (const z of zombies) { if (z.dead) continue; const d = (z.x - P.x) ** 2 + (z.z - P.z) ** 2; if (d < 400) _pz.push([d, z]); }
  _pz.sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < 4; k++) { const e = _pz[k - 1]; if (e) U[k].set(e[1].x, e[1].z, 0.6 * e[1].T.scale, 0.5); else U[k].w = 0; }
}
