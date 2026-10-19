// Farmhouse walls, windows, door, porch, lamp and roof.

// ---- house ----
const OPEN_HL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });   // (an opening's outline pane: unseen, but drawn into the outlines' mask)
const walls = [], openings = [];
{
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(HX1 - HX0 - 1, HZ1 - HZ0 - 1), M.floor);
  fl.rotation.x = -Math.PI / 2; fl.position.set((cxw(HX0) + cxw(HX1)) / 2, 0.015, (cxw(HZ0) + cxw(HZ1)) / 2); fl.receiveShadow = true; scene.add(fl);
  for (let i = HX0 + 1; i < HX1; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, HZ1 - HZ0 - 1), M.wood); l.rotation.x = -Math.PI / 2; l.position.set(cxw(i) - 0.5, 0.02, fl.position.z); scene.add(l); }
  // rugs: a woven one in the middle room (border, stripe, red field, diamond medallion, fringe), a braided oval by the bed, a doormat
  const rugM = {}, RM = c => rugM[c] || (rugM[c] = lam(c));
  const rugP = (g, geo, col, y, x, z) => { const m = new THREE.Mesh(geo, RM(col)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y, z || 0); m.receiveShadow = true; g.add(m); return m; };
  const sq = (w, d) => new THREE.PlaneGeometry(w, d), dia = (w, d) => new THREE.PlaneGeometry(1, 1).rotateZ(Math.PI / 4).scale(w / Math.SQRT2, d / Math.SQRT2, 1);
  const rug = new THREE.Group(); rug.position.set(cxw(21.5), 0, cxw(22)); scene.add(rug);
  rugP(rug, sq(3, 2), 0x4a1c1a, 0.021); rugP(rug, sq(2.8, 1.8), 0xa8803a, 0.0225); rugP(rug, sq(2.72, 1.72), 0x4a1c1a, 0.024); rugP(rug, sq(2.56, 1.56), 0x7a2e26, 0.0255);
  for (let k = 0; k < 9; k++) [-0.82, 0.82].forEach(z => rugP(rug, dia(0.07, 0.07), 0xd2c4a2, 0.0252, -1.2 + k * 0.3, z));
  [[-1.06, -0.56], [1.06, -0.56], [-1.06, 0.56], [1.06, 0.56]].forEach(([x, z]) => { rugP(rug, dia(0.26, 0.26), 0xa8803a, 0.027, x, z); rugP(rug, dia(0.12, 0.12), 0x4a1c1a, 0.0285, x, z); });
  rugP(rug, dia(1.4, 0.9), 0xa8803a, 0.027); rugP(rug, dia(1.2, 0.74), 0x4a1c1a, 0.0285); rugP(rug, dia(0.98, 0.58), 0x9a3a2e, 0.03); rugP(rug, dia(0.34, 0.22), 0xd2c4a2, 0.0315);
  [-0.45, 0.45].forEach(x => rugP(rug, dia(0.18, 0.18), 0xd2c4a2, 0.0315, x, 0));
  for (let k = 0; k < 14; k++) [-1.55, 1.55].forEach(x => rugP(rug, sq(0.1, 0.028), 0xd8ccb0, 0.0205, x, -0.9 + k * 0.1385));
  mergeInto(rug, finePieces(rug));
  const oval = new THREE.Group(); oval.position.set(cxw(24.9), 0, cxw(18.75)); oval.scale.x = 1.35; scene.add(oval);
  [[0.62, 0, 0x6a5a48, 0.021], [0.54, 0.48, 0x4a5a6a, 0.0222], [0.4, 0.34, 0x8a4a34, 0.0234], [0.26, 0.2, 0x4a5a6a, 0.0246], [0.1, 0, 0xb08a4a, 0.0258]].forEach(([r1, r0, col, y]) =>
    rugP(oval, r0 ? new THREE.RingGeometry(r0, r1, 28) : new THREE.CircleGeometry(r1, 28), col, y));
  mergeInto(oval, finePieces(oval));
  const mat = new THREE.Group(); mat.position.set(cxw(21), 0, cxw(25.15)); scene.add(mat);
  rugP(mat, sq(1.0, 0.56), 0x3e2e22, 0.021); rugP(mat, sq(0.9, 0.46), 0x8a6a3a, 0.0225); [-0.12, 0, 0.12].forEach(z => rugP(mat, sq(0.8, 0.02), 0x6a4e2c, 0.024, 0, z));
  mergeInto(mat, finePieces(mat));
}
// the door's paint, panels, threshold and brass
const DOOR_M = { paint: lam(0x7a2e24), panel: lam(0x5e221b), sill: lam(0x7a5434), brass: lam(0xb08a3a) };
const openSpec = { [idx(21, HZ1)]: 'door', [idx(19, HZ0)]: 'window', [idx(24, HZ0)]: 'window', [idx(HX0, 21)]: 'window', [idx(HX1, 22)]: 'window' };
for (let j = HZ0; j <= HZ1; j++) for (let i = HX0; i <= HX1; i++) {
  if (!(i === HX0 || i === HX1 || j === HZ0 || j === HZ1)) continue;
  const g = new THREE.Group(); g.position.set(cxw(i), 0, cxw(j)); scene.add(g);
  const kind = openSpec[idx(i, j)];
  const faces = []; if (j === HZ0) faces.push('N'); if (j === HZ1) faces.push('S'); if (i === HX0) faces.push('W'); if (i === HX1) faces.push('E');
  // every cell's pieces fade with its wall faces when you're behind them (world/cutaway.js), the door's included
  const cut = { value: 0 };
  const mk = base => { const m = base.clone(); m.userData.cut = cut; return lit(m, true); };
  const mats = { wall: mk(M.wall), found: mk(M.found), trim: mk(M.trim) };
  box(g, 1.02, 0.22, 1.02, mats.found, 0, 0.11, 0);
  // clapboard lines on the outside faces, at the same heights on every cell so the courses run unbroken round the house
  const clap = (y0, y1) => { for (let k = 0; k < 6; k++) { const y = 0.45 + k * 0.33; if (y > y0 + 0.02 && y < y1 - 0.02) box(g, 1.015, 0.025, 1.015, mats.trim, 0, y, 0); } };
  if (kind === 'door') {
    // a full-depth frame flush with the walls: jambs, an oak threshold, the sided wall over the head, and cased
    // trim on both faces with a drip cap outside. The door itself stands open, swung right round against the inside wall.
    const dm = { frame: mk(M.doorFrame), sill: mk(DOOR_M.sill), paint: mk(DOOR_M.paint), panel: mk(DOOR_M.panel), brass: mk(DOOR_M.brass) };
    [-1, 1].forEach(sd => box(g, 0.1, 1.83, 1.0, dm.frame, sd * 0.45, 1.135, 0));
    box(g, 0.8, 0.05, 1.0, dm.sill, 0, 0.245, 0); box(g, 0.82, 0.03, 0.08, dm.sill, 0, 0.235, 0.52);   // threshold and its nosing
    box(g, 1, 0.35, 1, mats.wall, 0, 2.225, 0); clap(2.05, 2.4);
    [-1, 1].forEach(f => {
      const z = f * 0.512;
      [-1, 1].forEach(sd => box(g, 0.13, 1.95, 0.025, dm.frame, sd * 0.43, 1.2, z));   // side casings
      box(g, 1.02, 0.15, 0.025, dm.frame, 0, 2.13, z);                                   // head casing
    });
    box(g, 1.06, 0.04, 0.07, mats.trim, 0, 2.225, 0.53); box(g, 1.02, 0.025, 0.04, dm.frame, 0, 2.2, 0.52);   // drip cap
    // the door: four raised panels on each face, a lock rail, a brass knob and plate
    const hinge = new THREE.Group(); hinge.position.set(-0.4, 0, -0.5); hinge.rotation.y = Math.PI * 0.97; g.add(hinge);
    const leaf = new THREE.Group(); leaf.position.set(0.4, 1.14, 0.03); hinge.add(leaf);
    box(leaf, 0.8, 1.8, 0.045, dm.paint, 0, 0, 0);
    [-1, 1].forEach(f => {
      [[-0.19, 0.42], [0.19, 0.42], [-0.19, -0.38], [0.19, -0.38]].forEach(([x, y]) => { box(leaf, 0.28, y > 0 ? 0.62 : 0.72, 0.012, dm.panel, x, y, f * 0.028); box(leaf, 0.22, y > 0 ? 0.56 : 0.66, 0.008, dm.paint, x, y, f * 0.036); });
      box(leaf, 0.06, 0.12, 0.01, dm.brass, 0.33, 0.02, f * 0.028);                                        // escutcheon plate
      const kb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), dm.brass); kb.position.set(0.33, 0, f * 0.06); leaf.add(kb);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), dm.brass); st.rotation.x = Math.PI / 2; st.position.set(0.33, 0, f * 0.04); leaf.add(st);
    });
    [0.62, -0.62].forEach(y => box(leaf, 0.035, 0.12, 0.06, dm.brass, -0.41, y, 0));   // hinges
    unfight(g);   // pull apart the trim's flush faces
    walls.push({ faces, cut, k: idx(i, j) });
  } else {
    if (!kind) { box(g, 1, 2.3, 1, mats.wall, 0, 1.25, 0); clap(0.22, 2.4); }
    else {
      // a window: wall under the sill and over the head, sided like the rest, with a sill, an apron under it outside
      // and cased jambs on both faces
      box(g, 1, 0.75, 1, mats.wall, 0, 0.6, 0); clap(0.22, 0.975); box(g, 1.06, 0.06, 1.08, mats.trim, 0, 0.99, 0);
      const alongX = j === HZ0 || j === HZ1, ox = alongX ? 0 : (i === HX0 ? -1 : 1), oz = alongX ? (j === HZ0 ? -1 : 1) : 0;
      // a trim piece u along the wall, on the outer face (f 1) or the inner one (f -1)
      const at = (u, y, f, w, h, d) => box(g, alongX ? w : d, h, alongX ? d : w, mats.trim, alongX ? u : f * 0.512 * ox, y, alongX ? f * 0.512 * oz : u);
      at(0, 0.925, 1, 0.9, 0.08, 0.03);                                                      // apron under the sill, outside
      [-1, 1].forEach(f => [-1, 1].forEach(sd => at(sd * 0.46, 1.445, f, 0.08, 0.86, 0.022)));   // jamb casings on both faces
      box(g, 1, 0.5, 1, mats.wall, 0, 2.15, 0); clap(1.9, 2.4); box(g, 1.04, 0.06, 1.04, mats.trim, 0, 1.9, 0);
    }
    box(g, 1.04, 0.1, 1.04, mats.trim, 0, 2.45, 0);
    walls.push({ faces, cut, k: idx(i, j) });
  }
  cell[idx(i, j)] = kind ? OPEN : WALL;
  if (kind) {
    const axis = (j === HZ0 || j === HZ1) ? 'x' : 'z';
    const out = j === HZ0 ? -1 : j === HZ1 ? 1 : i === HX0 ? -1 : 1;
    const bg = new THREE.Group(); bg.rotation.y = axis === 'x' ? 0 : Math.PI / 2; g.add(bg);
    const nx = axis === 'x' ? 0 : out, nz = axis === 'x' ? out : 0;
    const o = { i, j, x: cxw(i), z: cxw(j), kind, axis, out, nx, nz, boards: [], meshes: [], bg, ys: kind === 'door' ? [0.55, 1.05, 1.55] : [1.15, 1.45, 1.75] };
    // outlined in white, as the stations are, when this is the opening you'd board up or climb through: a pane over the
    // opening on each face, never drawn itself (OPEN_HL), only its outline (effects/screen-outlines.js), and only the
    // one on the side you're standing (barricades/interactions.js)
    const y0 = kind === 'door' ? 0.02 : 0.98, y1 = kind === 'door' ? 2.05 : 1.9;
    o.hl = [-1, 1].map(sd => {
      const p = new THREE.Group(); bg.add(p);
      const m = new THREE.Mesh(bgeo(1.0, y1 - y0, 0.02), OPEN_HL); m.position.set(0, (y0 + y1) / 2, sd * 0.55); m.castShadow = m.receiveShadow = false; p.add(m);
      p.om = outline(p, 0xf4f1ea, 0, 0.035); p.om.visible = false; return p;
    });
    openings.push(o); openAt[idx(i, j)] = o;
  }
}
const HOUSE = { x0: cxw(HX0) - 0.5, x1: cxw(HX1) + 0.5, z0: cxw(HZ0) - 0.5, z1: cxw(HZ1) + 0.5, zN: cxw(HZ0), zS: cxw(HZ1), xW: cxw(HX0), xE: cxw(HX1) };
box(scene, 0.18, 0.22, 0.18, basic(0xffd9a0), cxw(21) + 0.7, 2.25, cxw(HZ1) + 0.42).castShadow = false;
// ---- pitched roof: shown from outside, lifted off when you are indoors ----
const roof = (() => {
  const g = new THREE.Group(); scene.add(g);
  const mats = [];
  const mk = (c, side) => { const m = new THREE.MeshLambertMaterial({ color: c, transparent: true, side: side || THREE.FrontSide }); m.userData.base = new THREE.Color(c); mats.push(m); return m; };
  const shingle = mk(0x4b3d36), ridgeM = mk(0x2f2622), gable = mk(0xc8bea4, THREE.DoubleSide), trimM = mk(0x4a392d), brick = mk(0x6a3a2c);
  const W = HOUSE.x1 - HOUSE.x0 + 0.7, cx = (HOUSE.x0 + HOUSE.x1) / 2, cz = (HOUSE.z0 + HOUSE.z1) / 2;
  const half = (HOUSE.z1 - HOUSE.z0) / 2, ov = 0.4, run = half + ov, rise = 2.1, base = 2.5, th = Math.atan2(rise, run), len = Math.hypot(run, rise), ridgeY = base + half * rise / run;
  [-1, 1].forEach(s => {
    const slope = new THREE.Group(); slope.position.set(cx, ridgeY - rise / 2, cz + s * run / 2); slope.rotation.x = s * th; g.add(slope);
    box(slope, W, 0.12, len, shingle, 0, 0, 0);
    for (let k = 1; k < 9; k++) box(slope, W + 0.02, 0.03, 0.06, ridgeM, 0, 0.075, -len / 2 + k * len / 9);   // shingle rows
    box(slope, W + 0.04, 0.16, 0.12, trimM, 0, -0.02, s * len / 2);                                          // fascia at the eave
  });
  box(g, W + 0.1, 0.16, 0.26, ridgeM, cx, ridgeY + 0.04, cz);
  // gable ends
  const tri = new THREE.Shape(); tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, ridgeY - base - 0.05); tri.lineTo(-half, 0);
  const tg = new THREE.ShapeGeometry(tri);
  [HOUSE.x0 + 0.02, HOUSE.x1 - 0.02].forEach(x => { const m = new THREE.Mesh(tg, gable); m.rotation.y = Math.PI / 2; m.position.set(x, base, cz); m.castShadow = true; g.add(m); });
  box(g, 0.6, 1.6, 0.6, brick, cx + 3.2, ridgeY - 0.2, cz - 1.6);
  box(g, 0.7, 0.1, 0.7, ridgeM, cx + 3.2, ridgeY + 0.62, cz - 1.6);
  // the roof's materials stay transparent so it can fade, which would draw it after the see-through outlines and leave
  // zombies behind it unmarked: drawn first among the see-through things, its depth is there for them to test against
  g.traverse(o => { if (o.isMesh) o.renderOrder = -10; });
  return { g, mats, op: 1 };
})();
// porch deck and steps
{
  const p = new THREE.Group(); p.position.set(cxw(21), 0, cxw(HZ1) + 1.1); scene.add(p);
  box(p, 3.4, 0.12, 1.3, M.deck, 0, 0.06, 0);
  for (let k = -3; k <= 3; k++) box(p, 0.02, 0.125, 1.3, M.wood, k * 0.48, 0.065, 0);
  box(p, 1.2, 0.06, 0.4, M.deck, 0, 0.03, 0.85);
  [[-1.6, 0.55], [1.6, 0.55]].forEach(([a, b]) => box(p, 0.1, 2.3, 0.1, M.doorFrame, a, 1.15, b));
}
// ---- porch roof on the two posts: a shallow shed roof off the front wall; it fades like the main roof when it would hide you ----
const porchRoof = (() => {
  const g = new THREE.Group(); g.position.set(cxw(21), 0, cxw(HZ1) + 1.1); scene.add(g);
  const mats = [], mk = c => { const m = new THREE.MeshLambertMaterial({ color: c, transparent: true }); m.userData.base = new THREE.Color(c); mats.push(m); return m; };
  const shingle = mk(0x4b3d36), ridgeM = mk(0x2f2622), trimM = mk(0x4a392d), beamM = mk(0x3e2f25);
  const z0 = -0.6, z1 = 0.85, y0 = 2.66, y1 = 2.38, th = Math.atan2(y0 - y1, z1 - z0), len = Math.hypot(z1 - z0, y0 - y1);
  const slope = new THREE.Group(); slope.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2); slope.rotation.x = th; g.add(slope);
  box(slope, 3.8, 0.08, len, shingle, 0, 0, 0);
  for (let k = 1; k < 4; k++) box(slope, 3.82, 0.025, 0.05, ridgeM, 0, 0.05, -len / 2 + k * len / 4);   // shingle rows
  box(slope, 3.86, 0.12, 0.08, trimM, 0, -0.02, len / 2);                                              // fascia
  for (let k = -3; k <= 3; k++) box(slope, 0.06, 0.08, len - 0.1, beamM, k * 0.6, -0.08, 0);         // rafters underneath
  box(g, 3.4, 0.14, 0.14, beamM, 0, 2.37, 0.55);                                                       // header beam across the posts
  box(g, 3.6, 0.1, 0.08, trimM, 0, y0 - 0.06, z0 + 0.04);                                              // ledger on the wall
  [-1.6, 1.6].forEach(a => { const sd = -Math.sign(a), br = box(g, 0.42, 0.07, 0.07, beamM, a + sd * 0.17, 2.14, 0.55); br.rotation.z = sd * 0.78; });   // knee braces post to header
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.renderOrder = -10; } });   // drawn before the outlines, like the main roof
  return { g, mats, op: 1, x: cxw(21), z: cxw(HZ1) + 1.1 };
})();
// how high the ground surface is here: the porch deck, its step and the door's threshold stand above the dirt, and
// indoors the floorboards and the rugs on them a touch above it, so blood and brass land on top of them instead of
// under the boards, and you stand on them (player/animation.js)
function surfaceY(x, z) {
  const px = x - cxw(21), pz = z - (cxw(HZ1) + 1.1);
  if (Math.abs(px) < 1.7 && Math.abs(pz) < 0.65) return 0.12;
  if (Math.abs(px) < 0.6 && pz >= 0.65 && pz < 1.05) return 0.06;
  if (ci(x) === 21 && ci(z) === HZ1) return 0.27;   // the top of the threshold
  if (x > cxw(HX0) + 0.5 && x < cxw(HX1) - 0.5 && z > cxw(HZ0) + 0.5 && z < cxw(HZ1) - 0.5) {
    const ox = (x - cxw(24.9)) / 1.35, oz = z - cxw(18.75);
    if (Math.abs(x - cxw(21.5)) < 1.5 && Math.abs(z - cxw(22)) < 1) return 0.032;   // the woven rug
    if (ox * ox + oz * oz < 0.62 * 0.62) return 0.026;                             // the braided oval by the bed
    if (Math.abs(x - cxw(21)) < 0.5 && Math.abs(z - cxw(25.15)) < 0.28) return 0.025;   // the doormat
    return 0.015;                                                                  // the floorboards
  }
  return 0;
}
