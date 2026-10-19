// House furniture (table, pantry shelf, bed, hanging lamps) and yard props (cars, crates, hay bales, burn barrel).

// low ones (crates, hay bales, and the furniture in the house but the medicine cabinet) stop feet but not eyes or
// bullets: you see and shoot over them (world/collision.js)
const lowObst = new Set();
function obstacle(i, j, low) { if (inb(i, j)) { cell[idx(i, j)] = OBST; if (low) lowObst.add(idx(i, j)); } }
// ---- furniture: materials and little shape helpers, shared with stations/stations.js ----
const HM = {
  oak: lam(0x7a5434), oakDk: lam(0x5a3e28), oakLt: lam(0x8e6640), pine: lam(0xa2784b), pine2: lam(0x8d6840),
  paper: lam(0xd9cba4), cream: lam(0xe4dac4), sheet: lam(0xd8d0bc), brass: lam(0xb08a3a), iron: lam(0x34363a), steel: lam(0x8a8d90),
  hole: lam(0x1c1712), ink: lam(0x3a2a1e), inkB: lam(0x4e6a78), inkR: lam(0xa02a20), enamel: lam(0xd8d2c4), enamel2: lam(0xc8c2b4),
  quilt: lam(0x6d3a33), patchA: lam(0xd2c4a2), patchB: lam(0xb08a3a), patchC: lam(0x6e7a5a), leather: lam(0x4a3524), leatherDk: lam(0x33251a),
  glazeR: lam(0x8e3a2a), olive: lam(0x4a5236), oliveDk: lam(0x363c28), label: lam(0xc8a040), coffee: lam(0x2a1a10), rope: lam(0xb09a6a),
  kraft: lam(0xa8845a), glassG: lam(0x6a8a5a), glassA: lam(0x7a4a1e), red: lam(0x9a2a22), blue: lam(0x34607e), yellow: lam(0xd0a030)
};
const LAMP_GLOW = new THREE.MeshBasicMaterial({ color: 0xffdca6, side: THREE.DoubleSide }), BULB_GLOW = basic(0xfff0d0);
function ycyl(g, rT, rB, h, mat, x, y, z, seg, open) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg || 10, 1, !!open), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function xcyl(g, r, len, mat, x, y, z, seg) { const m = ycyl(g, r, r, len, mat, x, y, z, seg); m.rotation.z = Math.PI / 2; return m; }
function zcyl(g, r, len, mat, x, y, z, seg) { const m = ycyl(g, r, r, len, mat, x, y, z, seg); m.rotation.x = Math.PI / 2; return m; }
function torus(g, r, tube, mat, x, y, z, arc) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 16, arc || Math.PI * 2), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }
// a kitchen chair: seat, legs, back posts with a top rail and spindles; its back is on local +z
function chair(parent, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; parent.add(c);
  box(c, 0.42, 0.05, 0.4, HM.oak, 0, 0.45, 0);
  [-0.18, 0.18].forEach(a => { box(c, 0.045, 0.43, 0.045, HM.oakDk, a, 0.215, -0.17); box(c, 0.045, 0.98, 0.045, HM.oakDk, a, 0.49, 0.175); box(c, 0.03, 0.03, 0.32, HM.oakDk, a, 0.13, 0); });
  box(c, 0.4, 0.08, 0.035, HM.oak, 0, 0.92, 0.175); box(c, 0.4, 0.04, 0.03, HM.oak, 0, 0.64, 0.175);
  for (let k = -1; k <= 1; k++) box(c, 0.03, 0.22, 0.02, HM.oakLt, k * 0.1, 0.78, 0.175);
  box(c, 0.36, 0.03, 0.03, HM.oakDk, 0, 0.16, -0.17);
  return c;
}
// a flat-lying book: cover, and the page edges showing on its +x side
function book(g, w, h, d, mat, x, y, z, ry) { const b = box(g, w, h, d, mat, x, y + h / 2, z); b.rotation.y = ry || 0; box(b, w - 0.008, h * 0.7, d - 0.012, HM.paper, 0.006, 0, 0); return b; }
{
  // ---- the dining table: three planks on an apron, turned legs, a stretcher; a lamp, a map of the farm, a mug and some books ----
  const t = new THREE.Group(); t.position.set((cxw(24) + cxw(25)) / 2, 0, cxw(20)); scene.add(t);
  [-0.3, 0, 0.3].forEach((z, k) => box(t, 1.84, 0.07, 0.296, k === 1 ? HM.oakLt : HM.oak, 0, 0.8, z));
  [[-0.82, -0.37], [0.82, -0.37], [-0.82, 0.37], [0.82, 0.37]].forEach(([x, z]) => {
    box(t, 0.1, 0.14, 0.1, HM.oak, x, 0.69, z); box(t, 0.07, 0.42, 0.07, HM.oak, x, 0.41, z);
    box(t, 0.09, 0.04, 0.09, HM.oakDk, x, 0.2, z); box(t, 0.08, 0.18, 0.08, HM.oak, x, 0.09, z);
  });
  [-0.38, 0.38].forEach(z => box(t, 1.56, 0.1, 0.03, HM.oakDk, 0, 0.71, z)); [-0.82, 0.82].forEach(x => { box(t, 0.03, 0.1, 0.66, HM.oakDk, x, 0.71, 0); box(t, 0.04, 0.05, 0.66, HM.oak, x, 0.16, 0); });
  box(t, 1.6, 0.05, 0.04, HM.oak, 0, 0.16, 0);
  // table lamp (its light is the second entry in lighting/static-lights.js)
  ycyl(t, 0.08, 0.09, 0.03, HM.brass, 0.4, 0.85, 0); ycyl(t, 0.045, 0.068, 0.14, HM.glazeR, 0.4, 0.935, 0); ycyl(t, 0.03, 0.045, 0.03, HM.brass, 0.4, 1.02, 0);
  ycyl(t, 0.011, 0.011, 0.16, HM.brass, 0.4, 1.11, 0); ycyl(t, 0.035, 0.035, 0.06, BULB_GLOW, 0.4, 1.16, 0).castShadow = false;
  ycyl(t, 0.09, 0.165, 0.18, LAMP_GLOW, 0.4, 1.2, 0, 14, true).castShadow = false;
  box(t, 0.006, 0.09, 0.006, HM.brass, 0.46, 1.08, 0.02);
  // a hand-drawn map of the farm: the creek, the road, the house, and red crosses where they come from
  const mp = new THREE.Group(); mp.position.set(-0.42, 0.837, 0.04); mp.rotation.y = 0.14; t.add(mp);
  box(mp, 0.52, 0.004, 0.38, HM.paper, 0, 0, 0);
  [[-0.16, 0.08, 0.2], [0, 0.11, -0.12], [0.16, 0.06, 0.3]].forEach(([x, z, r]) => box(mp, 0.17, 0.003, 0.014, HM.inkB, x, 0.003, z).rotation.y = r);
  for (let k = 0; k < 6; k++) box(mp, 0.05, 0.003, 0.01, HM.ink, -0.22 + k * 0.085, 0.003, -0.08 + k * 0.012);
  box(mp, 0.08, 0.003, 0.012, HM.ink, 0.02, 0.003, -0.01); box(mp, 0.08, 0.003, 0.012, HM.ink, 0.02, 0.003, -0.07); box(mp, 0.012, 0.003, 0.07, HM.ink, -0.014, 0.003, -0.04); box(mp, 0.012, 0.003, 0.07, HM.ink, 0.054, 0.003, -0.04);
  [[-0.19, -0.13], [0.2, -0.12], [0.17, 0.13], [-0.2, 0.14]].forEach(([x, z]) => { box(mp, 0.05, 0.003, 0.01, HM.inkR, x, 0.004, z).rotation.y = 0.785; box(mp, 0.05, 0.003, 0.01, HM.inkR, x, 0.004, z).rotation.y = -0.785; });
  ycyl(mp, 0.008, 0.008, 0.03, HM.inkR, 0.02, 0.016, -0.04, 6);
  // an enamel mug of coffee, a stack of books, and a box of shells with a few loose rounds
  ycyl(t, 0.04, 0.036, 0.09, HM.enamel, 0.02, 0.88, 0.25); ycyl(t, 0.034, 0.034, 0.004, HM.coffee, 0.02, 0.927, 0.25); torus(t, 0.038, 0.004, HM.blue, 0.02, 0.925, 0.25).rotation.x = Math.PI / 2;
  torus(t, 0.024, 0.007, HM.enamel, 0.062, 0.885, 0.25, Math.PI).rotation.z = -Math.PI / 2;
  book(t, 0.24, 0.045, 0.17, HM.red, 0.1, 0.835, -0.26, 0.1); book(t, 0.2, 0.035, 0.15, HM.olive, 0.11, 0.88, -0.25, -0.18);
  box(t, 0.13, 0.055, 0.09, HM.olive, -0.12, 0.863, -0.26).rotation.y = 0.3; box(t, 0.132, 0.02, 0.092, HM.label, -0.12, 0.866, -0.26).rotation.y = 0.3;
  [[0.0, -0.15, 0.4], [0.04, -0.12, 1.3], [-0.03, -0.1, 2.2]].forEach(([x, z, r]) => xcyl(t, 0.008, 0.036, HM.brass, x, 0.843, z, 6).rotation.y = r);
  // two chairs pulled up to it, one with a cushion
  chair(t, -0.3, 0.88, 0.12); chair(t, -0.25, -0.86, Math.PI - 0.2);
  box(t, 0.36, 0.04, 0.34, HM.red, -0.3 + 0.0, 0.495, 0.88).rotation.y = 0.12;
  unfight(t); mergeInto(t, finePieces(t));
  obstacle(24, 20, true); obstacle(25, 20, true);   // table height: you see and shoot across it

  // ---- the pantry shelf on the west wall: open front, two bays, three shelves of stores and a few things on top ----
  const s = new THREE.Group(); s.position.set(cxw(17), 0, (cxw(23) + cxw(24)) / 2); scene.add(s);
  [-0.93, 0.93].forEach(z => box(s, 0.58, 1.16, 0.04, HM.oak, 0, 0.58, z));
  box(s, 0.03, 1.12, 1.82, HM.oakDk, -0.275, 0.58, 0); for (let k = 1; k < 5; k++) box(s, 0.034, 1.12, 0.006, HM.hole, -0.272, 0.58, -0.91 + k * 0.364);
  box(s, 0.64, 0.05, 1.96, HM.oak, 0.01, 1.185, 0); box(s, 0.56, 0.1, 1.82, HM.oakDk, 0, 0.05, 0);
  [0.12, 0.5, 0.86].forEach(y => box(s, 0.55, 0.035, 1.82, HM.oakLt, 0, y, 0)); box(s, 0.55, 1.02, 0.035, HM.oak, 0, 0.6, 0);
  // bottom: a crate of potatoes and three big jars of pickles
  box(s, 0.4, 0.22, 0.38, M.crate, 0.02, 0.2475, -0.46); [-0.06, 0.06].forEach(y => box(s, 0.405, 0.03, 0.385, M.wood, 0.02, 0.2475 + y, -0.46));
  const spud = new THREE.IcosahedronGeometry(0.045, 0), spudM = lam(0x9a7a4a);
  [[-0.08, -0.56], [0.06, -0.58], [0.12, -0.44], [-0.04, -0.4], [0.04, -0.5], [-0.1, -0.36]].forEach(([x, z], k) => { const m = new THREE.Mesh(spud, spudM); m.position.set(x, 0.37 + (k % 2) * 0.015, z); m.rotation.set(k, k * 2, 0); m.scale.set(1, 0.75, 1.15); m.castShadow = true; s.add(m); });
  [0.22, 0.44, 0.68].forEach(z => { ycyl(s, 0.075, 0.075, 0.2, HM.glassG, 0.02, 0.2375, z, 12); ycyl(s, 0.068, 0.068, 0.03, HM.steel, 0.02, 0.3525, z, 12); });
  // middle: tins on the north side, books on the south side
  const tinC = [HM.red, HM.cream, HM.olive, HM.label];
  for (let k = 0; k < 8; k++) { const x = k < 4 ? 0.12 : -0.08, z = -0.8 + (k % 4) * 0.19 + (k < 4 ? 0 : 0.09); ycyl(s, 0.045, 0.045, 0.11, tinC[k % 4], x, 0.5725, z, 10); ycyl(s, 0.043, 0.043, 0.006, HM.steel, x, 0.631, z, 10); }
  ycyl(s, 0.045, 0.045, 0.11, HM.red, 0.12, 0.6835, -0.61, 10); ycyl(s, 0.043, 0.043, 0.006, HM.steel, 0.12, 0.742, -0.61, 10);
  const bookC = [HM.red, HM.olive, HM.blue, HM.leather, HM.label, HM.oakDk, HM.glazeR, HM.blue];
  let bz = 0.07;
  bookC.forEach((m, k) => { const th = 0.04 + (k * 7 % 4) * 0.01, ht = 0.2 + (k * 5 % 3) * 0.03; const b = box(s, 0.17, ht, th, m, 0.06, 0.5175 + ht / 2, bz + th / 2); if (k % 3 === 0) box(b, 0.172, 0.012, th + 0.002, HM.brass, 0, ht * 0.3, 0); bz += th + 0.004; });
  const lean = box(s, 0.17, 0.24, 0.045, HM.oakDk, 0.06, 0.64, bz + 0.07); lean.rotation.x = 0.32;
  // upper: jars of preserves under cloth caps, a box of shells and an oil can
  const jamC = [lam(0x8a2a2a), lam(0xc8803a), lam(0xc89a3a), lam(0x8a2a2a), lam(0x6a2a3a)];
  jamC.forEach((m, k) => { const z = -0.8 + k * 0.16, x = k % 2 ? -0.06 : 0.1; ycyl(s, 0.05, 0.05, 0.12, m, x, 0.9375, z, 10); ycyl(s, 0.062, 0.058, 0.02, HM.cream, x, 1.006, z, 10); ycyl(s, 0.052, 0.052, 0.008, HM.inkR, x, 0.992, z, 10); });
  box(s, 0.16, 0.08, 0.1, HM.red, 0.08, 0.9175, 0.2); box(s, 0.162, 0.025, 0.102, HM.brass, 0.08, 0.89, 0.2);
  ycyl(s, 0.05, 0.055, 0.1, HM.iron, 0.04, 0.9275, 0.5, 10); ycyl(s, 0.01, 0.02, 0.1, HM.iron, 0.04, 1.02, 0.5, 6).rotation.z = -0.7;
  box(s, 0.22, 0.03, 0.18, HM.cream, 0.02, 0.8925, 0.75); box(s, 0.2, 0.03, 0.16, HM.patchC, 0.03, 0.9225, 0.75);
  // on top: a kerosene lantern, a cardboard box with its flaps open, and coils of rope
  ycyl(s, 0.065, 0.075, 0.07, HM.red, 0.05, 1.245, -0.6, 12); ycyl(s, 0.05, 0.05, 0.12, HM.cream, 0.05, 1.34, -0.6, 12);
  [[0.055, 0], [-0.055, 0], [0, 0.055], [0, -0.055]].forEach(([a, b]) => box(s, 0.008, 0.13, 0.008, HM.iron, 0.05 + a, 1.34, -0.6 + b));
  ycyl(s, 0.025, 0.06, 0.05, HM.red, 0.05, 1.425, -0.6, 12); torus(s, 0.06, 0.005, HM.iron, 0.05, 1.45, -0.6, Math.PI);
  box(s, 0.34, 0.22, 0.3, HM.kraft, 0.0, 1.32, 0.08); box(s, 0.342, 0.03, 0.06, HM.cream, 0.0, 1.4, 0.08);
  [-1, 1].forEach(d => { const f = box(s, 0.34, 0.005, 0.14, HM.kraft, 0.0, 1.44, 0.08 + d * 0.2); f.rotation.x = d * 0.6; });
  torus(s, 0.1, 0.028, HM.rope, 0.03, 1.24, 0.62).rotation.x = Math.PI / 2; torus(s, 0.08, 0.026, HM.rope, 0.04, 1.29, 0.6).rotation.x = Math.PI / 2;
  unfight(s); mergeInto(s, finePieces(s));
  obstacle(17, 23, true); obstacle(17, 24, true);   // chest high and open fronted: you see and shoot over it

  // ---- the bed in the north-east corner: a turned-post frame, mattress, patchwork quilt, pillow, a suitcase under it, boots beside it ----
  const bed = new THREE.Group(); bed.position.set(cxw(26), 0, (cxw(18) + cxw(19)) / 2); scene.add(bed);
  [-0.45, 0.45].forEach(x => {
    box(bed, 0.08, 1.02, 0.08, HM.oakDk, x, 0.51, -0.92); box(bed, 0.1, 0.06, 0.1, HM.oak, x, 1.05, -0.92);
    box(bed, 0.08, 0.66, 0.08, HM.oakDk, x, 0.33, 0.92); box(bed, 0.1, 0.06, 0.1, HM.oak, x, 0.69, 0.92);
    box(bed, 0.04, 0.14, 1.76, HM.oak, x, 0.27, 0);
  });
  box(bed, 0.82, 0.42, 0.035, HM.oak, 0, 0.68, -0.92); box(bed, 0.86, 0.07, 0.06, HM.oakDk, 0, 0.93, -0.92);
  [-0.2, 0, 0.2].forEach(x => box(bed, 0.014, 0.34, 0.04, HM.oakDk, x, 0.68, -0.92));
  box(bed, 0.82, 0.22, 0.035, HM.oak, 0, 0.44, 0.92); box(bed, 0.86, 0.06, 0.06, HM.oakDk, 0, 0.58, 0.92);
  box(bed, 0.84, 0.15, 1.78, HM.sheet, 0, 0.41, 0);
  box(bed, 0.9, 0.05, 1.3, HM.quilt, 0, 0.51, 0.2); [-1, 1].forEach(d => box(bed, 0.025, 0.22, 1.3, HM.quilt, d * 0.4625, 0.42, 0.2));
  const patches = [HM.patchA, HM.patchB, HM.patchC];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) box(bed, 0.27, 0.006, 0.3, patches[(i + j * 2) % 3], -0.29 + i * 0.29, 0.538, -0.29 + j * 0.32);
  box(bed, 0.9, 0.06, 0.14, HM.sheet, 0, 0.515, -0.47);
  const pil = box(bed, 0.6, 0.1, 0.28, HM.cream, 0, 0.54, -0.72); pil.rotation.x = -0.16; box(pil, 0.54, 0.04, 0.22, HM.cream, 0, 0.05, 0);
  box(bed, 0.5, 0.13, 0.62, HM.leather, 0, 0.075, 0.5); [-0.12, 0.12].forEach(x => box(bed, 0.03, 0.135, 0.625, HM.leatherDk, x, 0.075, 0.5)); box(bed, 0.12, 0.03, 0.02, HM.leatherDk, 0, 0.1, 0.815);
  [[-0.66, 0.5, 0.3, 0], [-0.7, 0.72, -0.2, 1.4]].forEach(([x, z, r, tip]) => {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.set(0, r, tip ? 0 : 0); bed.add(b);
    if (tip) { b.rotation.z = Math.PI / 2; b.position.y = 0.045; }
    box(b, 0.09, 0.03, 0.22, HM.leatherDk, 0, 0.015, 0.02); box(b, 0.085, 0.16, 0.1, HM.leather, 0, 0.11, -0.03); box(b, 0.085, 0.06, 0.12, HM.leather, 0, 0.06, 0.07);
  });
  unfight(bed); mergeInto(bed, finePieces(bed));
  obstacle(26, 18, true); obstacle(26, 19, true);   // low, like the table

  // ---- on the walls you can see from inside (north and west): a painting, a clock, antlers over the bed, coat hooks, a calendar ----
  const wd = new THREE.Group(); scene.add(wd);
  const zN = cxw(HZ0) + 0.5, xW = cxw(HX0) + 0.5;
  box(wd, 0.52, 0.42, 0.03, HM.oakDk, cxw(20), 1.55, zN + 0.015); box(wd, 0.44, 0.34, 0.01, lam(0x9aa6a4), cxw(20), 1.55, zN + 0.032);
  box(wd, 0.44, 0.14, 0.012, lam(0x5a6a3a), cxw(20), 1.45, zN + 0.034); box(wd, 0.2, 0.08, 0.012, lam(0x4a5a32), cxw(20) + 0.1, 1.5, zN + 0.035).rotation.z = 0.25;
  box(wd, 0.07, 0.06, 0.012, HM.red, cxw(20) - 0.08, 1.49, zN + 0.037); box(wd, 0.08, 0.025, 0.012, HM.oakDk, cxw(20) - 0.08, 1.53, zN + 0.038);
  zcyl(wd, 0.14, 0.04, HM.oakDk, cxw(23), 1.85, zN + 0.02, 16); zcyl(wd, 0.12, 0.012, HM.cream, cxw(23), 1.85, zN + 0.042, 16);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; box(wd, 0.012, 0.02, 0.006, HM.ink, cxw(23) + Math.sin(a) * 0.1, 1.85 + Math.cos(a) * 0.1, zN + 0.05).rotation.z = -a; }
  const hand = (len, a, w) => { const h = box(wd, w, len, 0.006, HM.ink, cxw(23) + Math.sin(a) * len / 2, 1.85 + Math.cos(a) * len / 2, zN + 0.053); h.rotation.z = -a; };
  hand(0.06, 2.2, 0.014); hand(0.09, -0.6, 0.01);
  const ax = cxw(26), ay = 1.62;
  box(wd, 0.2, 0.24, 0.03, HM.oak, ax, ay, zN + 0.015); box(wd, 0.08, 0.1, 0.07, HM.cream, ax, ay + 0.03, zN + 0.05);
  [-1, 1].forEach(d => {
    const main = box(wd, 0.024, 0.28, 0.024, HM.patchA, ax + d * 0.09, ay + 0.17, zN + 0.07); main.rotation.z = -d * 0.65;
    [0.06, 0.13].forEach((t, k) => box(wd, 0.018, 0.1, 0.018, HM.patchA, ax + d * (0.07 + t * 0.85), ay + 0.17 + t * 0.6 + 0.05, zN + 0.07).rotation.z = d * (0.2 + k * 0.2));
  });
  box(wd, 0.03, 0.06, 0.62, HM.oak, xW + 0.015, 1.62, cxw(19.2)); [-0.22, 0, 0.22].forEach(z => box(wd, 0.06, 0.02, 0.02, HM.iron, xW + 0.05, 1.63, cxw(19.2) + z));
  box(wd, 0.07, 0.62, 0.34, HM.olive, xW + 0.06, 1.3, cxw(19.2) - 0.11); box(wd, 0.075, 0.12, 0.2, HM.oliveDk, xW + 0.065, 1.56, cxw(19.2) - 0.11);
  box(wd, 0.06, 0.5, 0.08, HM.olive, xW + 0.07, 1.25, cxw(19.2) - 0.31); box(wd, 0.072, 0.03, 0.34, HM.leather, xW + 0.062, 1.12, cxw(19.2) - 0.11);
  box(wd, 0.08, 0.06, 0.2, HM.red, xW + 0.07, 1.6, cxw(19.2) + 0.22); box(wd, 0.12, 0.012, 0.15, HM.red, xW + 0.1, 1.575, cxw(19.2) + 0.22);
  box(wd, 0.01, 0.4, 0.28, HM.paper, xW + 0.005, 1.5, cxw(22.2)); box(wd, 0.012, 0.1, 0.28, HM.inkR, xW + 0.006, 1.65, cxw(22.2));
  for (let k = 0; k < 4; k++) box(wd, 0.012, 0.004, 0.24, HM.ink, xW + 0.007, 1.33 + k * 0.06, cxw(22.2));
  for (let k = 0; k < 5; k++) box(wd, 0.012, 0.22, 0.004, HM.ink, xW + 0.007, 1.42, cxw(22.2) - 0.1 + k * 0.05);
  box(wd, 0.014, 0.05, 0.05, HM.inkR, xW + 0.009, 1.42, cxw(22.2) + 0.05).rotation.x = 0.785;
  unfight(wd); mergeInto(wd, finePieces(wd));
}
function car(i0, j0, along) {
  const g = new THREE.Group(); scene.add(g);
  const w = along === 'z' ? 2 : 4, d = along === 'z' ? 4 : 2;
  g.position.set(cxw(i0) - 0.5 + w / 2, 0, cxw(j0) - 0.5 + d / 2); g.rotation.y = along === 'z' ? 0 : Math.PI / 2 + 0.06;
  box(g, 1.75, 0.7, 3.8, M.rust, 0, 0.6, 0); box(g, 1.55, 0.55, 1.9, M.rust2, 0, 1.22, -0.2); box(g, 1.58, 0.42, 1.7, M.glass, 0, 1.24, -0.2);
  box(g, 1.8, 0.12, 0.2, M.metal, 0, 0.42, 1.92); box(g, 1.8, 0.12, 0.2, M.metal, 0, 0.42, -1.92);
  [[-.85, 1.2], [.85, 1.2], [-.85, -1.25], [.85, -1.25]].forEach(([a, b]) => box(g, 0.25, 0.55, 0.55, M.tire, a, 0.28, b));
  for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + d; j++) obstacle(i, j);
}
car(8, 29, 'z');
car(32, 9, 'x');
function crate(i, j) { const c = box(scene, 0.9, 0.9, 0.9, M.crate, cxw(i), 0.45, cxw(j)); c.rotation.y = rr(-.2, .2); box(c, 0.92, 0.08, 0.92, M.wood, 0, 0.3, 0); box(c, 0.92, 0.08, 0.92, M.wood, 0, -0.3, 0); obstacle(i, j, true); }
[[12, 14], [13, 14], [12, 15], [31, 31], [6, 21], [35, 24], [36, 24]].forEach(p => crate(...p));
// the round hay bales: straw from the SBS packs (tools/pack-ground.py) rolled round the side, and wound into a spiral on
// each flat end; side and ends each lit (core/shaders.js) and sharing the textures
const HAY_M = (() => {
  const tex = (k, rep) => { const t = new THREE.TextureLoader().load(GROUND_ART[k]); t.anisotropy = R.capabilities.getMaxAnisotropy(); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1); } return t; };
  const end = lam(0xffffff, { map: tex('hayEnd') });
  return [lam(0xffffff, { map: tex('hay', 3) }), end, end];   // (side, top, bottom: CylinderGeometry's groups)
})();
function hay(i, j) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1, 18), HAY_M); m.rotation.z = Math.PI / 2; m.rotation.y = rr(-.4, .4); m.position.set(cxw(i), 0.48, cxw(j)); m.castShadow = m.receiveShadow = true; scene.add(m); obstacle(i, j, true); }
[[28, 34], [29, 34], [14, 8], [26, 10]].forEach(p => hay(...p));
// the burn barrel: its fire is particles (barrelFire, effects/puffs.js) over a bed of glowing coals and charred logs
// inside the rim, which flicker with the light it throws (lighting/lightmap.js). BURN_BARREL: where its mouth is, how wide
const BURN_BARREL = { x: cxw(14), z: cxw(16), y: 0.84, r: 0.28, coal: basic(0xff7a24), ember: basic(0x9a2a0c) };
{
  const g = new THREE.Group(); g.position.set(BURN_BARREL.x, 0, BURN_BARREL.z); scene.add(g);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12, 1, true), M.barrel); b.position.y = 0.45; b.castShadow = true; g.add(b);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.31, 14), BURN_BARREL.ember); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.8; g.add(bed);
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + rr(-0.2, 0.2), d = rr(0.04, 0.2), c = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.045, 0.075)), BURN_BARREL.coal); c.position.set(Math.sin(a) * d, 0.81, Math.cos(a) * d); c.rotation.set(rand() * 3, rand() * 3, 0); g.add(c); }
  [[0.5, 0.15], [2.3, -0.1], [4.1, 0.2]].forEach(([a, t]) => { const l = box(g, 0.07, 0.07, 0.42, M.tire, Math.sin(a) * 0.05, 0.88, Math.cos(a) * 0.05); l.rotation.set(0.5 + t, a, 0); });   // charred logs propped in the coals
  obstacle(14, 16, true);   // waist high, like the crates: you see and shoot over it
}
// ---- hanging bulbs in the house ----
const HANG = [[cxw(19), cxw(20.5)], [cxw(23.5), cxw(23)], [cxw(21.5), cxw(19.6)]];
HANG.forEach(([x, z]) => {
  // a green enamel shade on a cord, with its socket and a rolled rim
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  box(g, 0.012, 0.36, 0.012, M.metal, 0, 2.32, 0).castShadow = false;
  ycyl(g, 0.026, 0.026, 0.07, HM.iron, 0, 2.12, 0); ycyl(g, 0.045, 0.05, 0.02, HM.iron, 0, 2.085, 0);
  ycyl(g, 0.055, 0.22, 0.14, lam(0x3a4a3a, { side: THREE.DoubleSide }), 0, 2.02, 0, 16, true);
  torus(g, 0.22, 0.01, HM.iron, 0, 1.95, 0).rotation.x = Math.PI / 2;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), basic(0xffd59a)); bulb.position.y = 1.97; g.add(bulb);
  unfight(g); mergeInto(g, finePieces(g));
});
