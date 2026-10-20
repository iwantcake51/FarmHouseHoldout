// Farmhouse walls, windows, door, porch, lamp and roof.

// ---- house ----
const OPEN_HL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });   // (an opening's outline pane: unseen, but drawn into the outlines' mask)
const walls = [], openings = [];
// the house's footprint this run: the rectangle HX0..HX1 by HZ0..HZ1, or that with a notch cut out of one of its back
// corners (setFootprint). HOUSE_FP: each cell's part in it (0 outside it, 1 a room's floor, 2 the outer wall); HOUSE: the
// rectangle's edges and wall lines, and the notch (cells, and its edges, or null)
const HOUSE_FP = new Uint8Array(N * N);
const HOUSE = { x0: cxw(HX0) - 0.5, x1: cxw(HX1) + 0.5, z0: cxw(HZ0) - 0.5, z1: cxw(HZ1) + 0.5, zN: cxw(HZ0), zS: cxw(HZ1), xW: cxw(HX0), xE: cxw(HX1), notch: null, cut: null };
// a point inside the house's walls, m further out all round (less than nothing: further in)
function inHouseRect(x, z, m) {
  if (!(x > HOUSE.x0 - m && x < HOUSE.x1 + m && z > HOUSE.z0 - m && z < HOUSE.z1 + m)) return false;
  const c = HOUSE.cut; return !c || !(x > c[0] + m && x < c[2] - m && z > c[1] + m && z < c[3] - m);
}
// the floor, under the rooms only: a strip of boards down each column of them, with the line between the boards
const floorG = new THREE.Group(); scene.add(floorG);
function buildFloor() {
  while (floorG.children.length) floorG.children.pop().geometry.dispose();
  for (let i = HX0 + 1; i < HX1; i++) for (let j = HZ0 + 1; j < HZ1;) {
    if (HOUSE_FP[idx(i, j)] !== 1) { j++; continue; }
    let e = j; while (e + 1 < HZ1 && HOUSE_FP[idx(i, e + 1)] === 1) e++;
    const L = e - j + 1, z = (cxw(j) + cxw(e)) / 2;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, L), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(cxw(i), 0.015, z); fl.receiveShadow = true; floorG.add(fl);
    if (HOUSE_FP[idx(i - 1, j)] === 1 && HOUSE_FP[idx(i - 1, e)] === 1) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.03, L), M.wood); l.rotation.x = -Math.PI / 2; l.position.set(cxw(i) - 0.5, 0.02, z); floorG.add(l); }
    j = e + 1;
  }
}
{
  // a doormat inside the front door
  const rugM = {}, RM = c => rugM[c] || (rugM[c] = lam(c));
  const rugP = (g, geo, col, y, x, z) => { const m = new THREE.Mesh(geo, RM(col)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y, z || 0); m.receiveShadow = true; g.add(m); return m; };
  const sq = (w, d) => new THREE.PlaneGeometry(w, d);
  const mat = new THREE.Group(); mat.position.set(cxw(21), 0, cxw(25.15)); scene.add(mat);
  rugP(mat, sq(1.0, 0.56), 0x3e2e22, 0.026); rugP(mat, sq(0.9, 0.46), 0x8a6a3a, 0.029); [-0.12, 0, 0.12].forEach(z => rugP(mat, sq(0.8, 0.02), 0x6a4e2c, 0.032, 0, z));   // (well up off the floorboards' lines: nothing in one plane)
  mergeInto(mat, finePieces(mat));
}
// the door's paint, panels, threshold and brass
const DOOR_M = { paint: lam(0x7a2e24), panel: lam(0x5e221b), sill: lam(0x7a5434), brass: lam(0xb08a3a) };
// the plaster and skirting on the inside of the outer walls (each room's own colour: world/interior.js) and the
// shutters' paint (paintHouse)
const IN_M = { plaster: lam(0xd6ccb4), base: lam(0x4a3828), shutter: lam(0x2e3a30) };
let HOUSE_DOOR_O = null;   // (the front door's opening: setWindows)
// the outer walls, a cell at a time: each in the form its place in this run's footprint needs (faces: the sides of it
// that look out, N S W E; inner: the sides onto a room), built the first time it's wanted and kept for the next run that
// wants it (WALL_FORMS), so a window's opening and its outline are only ever made once. WALL_AT: this run's, by cell
const WALL_FORMS = new Map(), WALL_AT = new Map();
const FACE_V = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
function wallForm(i, j, faces, inner) {
  const key = idx(i, j) + ':' + faces.join('') + ':' + inner.join(''); let w = WALL_FORMS.get(key); if (w) return w;
  const g = new THREE.Group(); g.position.set(cxw(i), 0, cxw(j)); scene.add(g);
  const kind = i === 21 && j === HZ1 ? 'door' : null;
  // every cell's pieces fade with its wall faces when you're behind them (world/cutaway.js), the door's included
  const cut = { value: 0 };
  const mk = base => { const m = base.clone(); m.userData.cut = cut; return lit(m, true); };
  const side1 = faces.length === 1 && kind !== 'door' && inner.length === 1;   // (a side cell, not a corner: a window can go in it)
  const mats = { wall: mk(M.wall), clap: mk(M.trim), found: mk(M.found), trim: mk(M.trim), inner: mk(IN_M.plaster), inner2: inner.length > 1 ? mk(IN_M.plaster) : null, base: mk(IN_M.base), shutter: side1 ? mk(IN_M.shutter) : null };
  w = { g, faces, fl: faces.map(f => [f, f === 'N' || f === 'S' ? cxw(j) : cxw(i)]), cut, k: idx(i, j), mats, inner: inner.map((d, n) => [i + FACE_V[d][0], j + FACE_V[d][1], n ? mats.inner2 : mats.inner]), kind };
  WALL_FORMS.set(key, w);
  box(g, 1.02, 0.22, 1.02, mats.found, 0, 0.11, 0);
  // a corner board up each outside corner, wrapped round it
  if (faces.length === 2) {
    const [a, b] = faces.map(f => FACE_V[f]);
    [[a, b], [b, a]].forEach(([n, o]) => {
      const cx = 0.5 * (n[0] + o[0]) - o[0] * 0.05 + n[0] * 0.015, cz = 0.5 * (n[1] + o[1]) - o[1] * 0.05 + n[1] * 0.015;
      box(g, n[0] ? 0.03 : 0.16, 2.2, n[0] ? 0.16 : 0.03, mats.trim, cx, 1.3, cz);
    });
  }
  // inside: the wall plastered over in the colour of the room it's onto, with a skirting board (none on a corner with
  // no room against it); a corner the rooms wrap round, on both its sides
  const pan = (G, d, y0, y1, mat, th, off) => { const [ox_, oz_] = FACE_V[d]; return box(G, ox_ ? th : 1.0, y1 - y0, ox_ ? 1.0 : th, mat, ox_ * (off || 0.514), (y0 + y1) / 2, oz_ * (off || 0.514)); };
  // clapboard lines on the outside faces, at the same heights on every cell so the courses run unbroken round the house
  const clap = (G, y0, y1) => { for (let k = 0; k < 6; k++) { const y = 0.45 + k * 0.33; if (y > y0 + 0.02 && y < y1 - 0.02) box(G, 1.015, 0.025, 1.015, mats.clap, 0, y, 0); } };
  if (kind === 'door') {
    pan(g, inner[0], 2.21, 2.4, mats.inner, 0.004);   // (plastered over inside, above the door)
    // a full-depth frame flush with the walls: jambs, an oak threshold, the sided wall over the head, and cased
    // trim on both faces with a drip cap outside. The door itself stands open, swung right round against the inside wall.
    const dm = { frame: mk(M.doorFrame), sill: mk(DOOR_M.sill), paint: mk(DOOR_M.paint), panel: mk(DOOR_M.panel), brass: mk(DOOR_M.brass) };
    [-1, 1].forEach(sd => box(g, 0.1, 1.83, 1.0, dm.frame, sd * 0.45, 1.135, 0));
    box(g, 0.8, 0.05, 1.0, dm.sill, 0, 0.245, 0); box(g, 0.82, 0.03, 0.08, dm.sill, 0, 0.235, 0.52);   // threshold and its nosing
    box(g, 1, 0.35, 1, mats.wall, 0, 2.225, 0); clap(g, 2.05, 2.4);
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
    mats.paint = dm.paint; mats.panel = dm.panel;
    w.o = HOUSE_DOOR_O = houseOpening(g, i, j, 'door', faces[0]);
  } else {
    // a plain stretch of wall and, in a side cell, a window that can stand in it instead: which shows is up to the
    // run's floor plan (setWindows; world/interior.js puts a window in the middle of each room's outside wall)
    const plain = new THREE.Group(); g.add(plain);
    box(plain, 1, 2.3, 1, mats.wall, 0, 1.25, 0); clap(plain, 0.22, 2.4);
    inner.forEach((d, n) => { pan(plain, d, 0.015, 2.4, n ? mats.inner2 : mats.inner, 0.004); pan(plain, d, 0.015, 0.125, mats.base, 0.02, 0.524); });
    let win = null, o = null;
    if (side1) {
      // a window: wall under the sill and over the head, sided like the rest, with a sill, an apron under it outside
      // and cased jambs on both faces
      win = new THREE.Group(); win.visible = false; g.add(win);
      box(win, 1, 0.75, 1, mats.wall, 0, 0.6, 0); clap(win, 0.22, 0.975); box(win, 1.06, 0.06, 1.08, mats.trim, 0, 0.99, 0);
      const alongX = faces[0] === 'N' || faces[0] === 'S', [ox, oz] = FACE_V[faces[0]];
      // a trim piece u along the wall, on the outer face (f 1) or the inner one (f -1)
      const at = (u, y, f, w, h, d) => box(win, alongX ? w : d, h, alongX ? d : w, mats.trim, alongX ? u : f * 0.512 * ox, y, alongX ? f * 0.512 * oz : u);
      at(0, 0.925, 1, 0.9, 0.08, 0.03);                                                      // apron under the sill, outside
      [-1, 1].forEach(f => [-1, 1].forEach(sd => at(sd * 0.46, 1.445, f, 0.08, 0.86, 0.022)));   // jamb casings on both faces
      // a louvred shutter folded back either side of it outside, on its hinges
      const sat = (u, y, w, h, d, off) => box(win, alongX ? w : d, h, alongX ? d : w, mats.shutter, alongX ? u : off * ox, y, alongX ? off * oz : u);
      [-1, 1].forEach(sd => {
        const u = sd * 0.67; sat(u, 1.445, 0.3, 0.92, 0.024, 0.53);
        for (let k = 0; k < 7; k++) sat(u, 1.08 + k * 0.105, 0.24, 0.022, 0.012, 0.548);   // the louvres
        [-0.3, 0.3].forEach(y => sat(sd * 0.505, 1.445 + y, 0.05, 0.035, 0.03, 0.53));     // hinges
      });
      box(win, 1, 0.5, 1, mats.wall, 0, 2.15, 0); clap(win, 1.9, 2.4); box(win, 1.04, 0.06, 1.04, mats.trim, 0, 1.9, 0);
      pan(win, inner[0], 0.015, 0.96, mats.inner, 0.004); pan(win, inner[0], 1.92, 2.4, mats.inner, 0.004); pan(win, inner[0], 0.015, 0.125, mats.base, 0.02, 0.524);
      o = houseOpening(win, i, j, 'window', faces[0]);
    }
    box(g, 1.04, 0.1, 1.04, mats.trim, 0, 2.45, 0);
    w.plain = plain; w.win = win; w.o = o;
  }
  return w;
}
// an opening's own parts: where it is and which way out, the boards across it, and the outline that marks it as the
// one you'd board up or climb through, a pane over the opening on each face, never drawn itself (OPEN_HL), only its
// outline (effects/screen-outlines.js), and only the one on the side you're standing (barricades/interactions.js)
function houseOpening(G, i, j, kind, face) {
  const axis = face === 'N' || face === 'S' ? 'x' : 'z';
  const out = face === 'N' || face === 'W' ? -1 : 1;
  const bg = new THREE.Group(); bg.rotation.y = axis === 'x' ? 0 : Math.PI / 2; G.add(bg);
  const nx = axis === 'x' ? 0 : out, nz = axis === 'x' ? out : 0;
  const o = { i, j, x: cxw(i), z: cxw(j), kind, axis, out, nx, nz, boards: [], meshes: [], bg, ys: kind === 'door' ? [0.55, 1.05, 1.55] : [1.15, 1.45, 1.75] };
  const y0 = kind === 'door' ? 0.02 : 0.98, y1 = kind === 'door' ? 2.05 : 1.9;
  o.hl = [-1, 1].map(sd => {
    const p = new THREE.Group(); bg.add(p);
    const m = new THREE.Mesh(bgeo(1.0, y1 - y0, 0.02), OPEN_HL); m.position.set(0, (y0 + y1) / 2, sd * 0.55); m.castShadow = m.receiveShadow = false; p.add(m);
    p.om = outline(p, 0xf4f1ea, 0, 0.035); p.om.visible = false; return p;
  });
  return o;
}
// this run's windows (keys: the wall cells they're in): each shown in its cell in place of the plain wall, and an
// opening (boarded up from scratch); every other side cell a plain wall again. live: in play, when what stops shots
// changes with them too
function setWindows(keys, live) {
  openings.length = 0; openings.push(HOUSE_DOOR_O);
  for (const w of walls) {
    if (!w.win) continue;
    const on = keys.has(w.k), o = w.o; w.plain.visible = !on; w.win.visible = on;
    clearBoards(o); o.climbers = [];
    cell[w.k] = on ? OPEN : WALL; openAt[w.k] = on ? o : null; if (live) blockArr[w.k] = on ? 0 : 1;
    if (on) openings.push(o);
  }
}
// this run's footprint (notch: the cells cut out of a back corner, {i0, i1, j0, j1}, or null for the whole rectangle):
// every cell's part in it, each outer wall cell in its form (the rest hidden), the floor and the roof over it. live:
// in play, when what stops shots changes too (the windows come after: setWindows)
function setFootprint(notch, live) {
  HOUSE.notch = notch; HOUSE.cut = notch ? [cxw(notch.i0) - 0.5, cxw(notch.j0) - 0.5, cxw(notch.i1) + 0.5, cxw(notch.j1) + 0.5] : null;
  const inF = (i, j) => i >= HX0 && i <= HX1 && j >= HZ0 && j <= HZ1 && !(notch && i >= notch.i0 && i <= notch.i1 && j >= notch.j0 && j <= notch.j1);
  for (let j = HZ0; j <= HZ1; j++) for (let i = HX0; i <= HX1; i++) {
    let all = inF(i, j); if (all) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!inF(i + a, j + b)) all = false;
    HOUSE_FP[idx(i, j)] = !inF(i, j) ? 0 : all ? 1 : 2;
  }
  for (const w of WALL_FORMS.values()) w.g.visible = false;
  walls.length = 0; WALL_AT.clear();
  for (let j = HZ0; j <= HZ1; j++) for (let i = HX0; i <= HX1; i++) {
    const k = idx(i, j), fp = HOUSE_FP[k];
    if (fp === 2) {
      const dirs = Object.keys(FACE_V), faces = dirs.filter(d => !inF(i + FACE_V[d][0], j + FACE_V[d][1])), inner = dirs.filter(d => HOUSE_FP[idx(i + FACE_V[d][0], j + FACE_V[d][1])] === 1);
      const w = wallForm(i, j, faces, inner); w.g.visible = true; walls.push(w); WALL_AT.set(k, w);
      if (w.kind === 'door') { cell[k] = OPEN; openAt[k] = w.o; if (live) blockArr[k] = 0; }
      else { if (w.win) { w.plain.visible = true; w.win.visible = false; } cell[k] = WALL; openAt[k] = null; if (live) blockArr[k] = 1; }
    } else if (cell[k] === WALL || cell[k] === OPEN || !fp) { cell[k] = EMPTY; openAt[k] = null; lowObst.delete(k); if (live) blockArr[k] = 0; }
  }
  buildFloor(); buildRoof();
}
// the footprint for a run (from its seed, world/interior.js): now and then the whole rectangle, otherwise a notch out of
// the back left or right corner, FOOT.w cells across and FOOT.d deep (the front, with the door and the porch, is always
// whole)
const FOOT = { whole: 0.3, w: [3, 5], d: [2, 4] };
function houseFootprint(rnd, live) {
  let notch = null;
  if (rnd() >= FOOT.whole) {
    const w = FOOT.w[0] + Math.floor(rnd() * (FOOT.w[1] - FOOT.w[0] + 1)), d = FOOT.d[0] + Math.floor(rnd() * (FOOT.d[1] - FOOT.d[0] + 1)), east = rnd() < 0.5;
    notch = { i0: east ? HX1 - w + 1 : HX0, i1: east ? HX1 : HX0 + w - 1, j0: HZ0, j1: HZ0 + d - 1 };
  }
  setFootprint(notch, live);
}
// ---- pitched roof: shown from outside, lifted off when you are indoors ----
// Over the whole rectangle, one gable across it; over a footprint with a notch out of a back corner (setFootprint), the
// same over the full-width front and a lower cross-gable over the wing behind it, its ridge running back to the front
// roof's and its own gable end at the back (ROOF: the pitch, how high its eaves are, how far it overhangs, how much
// lower the wing's ridge sits at least)
const ROOF = { rise: 2.1 / 5.4, base: 2.5, ov: 0.4, under: 0.35 };
const roof = (() => {
  const g = new THREE.Group(); scene.add(g);
  const mats = [];
  const mk = (c, side) => { const m = new THREE.MeshLambertMaterial({ color: c, transparent: true, side: side || THREE.FrontSide }); m.userData.base = new THREE.Color(c); mats.push(m); return m; };
  const shingle = mk(0x4b3d36), ridgeM = mk(0x2f2622), gable = mk(0xc8bea4, THREE.DoubleSide), trimM = mk(0x4a392d), brick = mk(0x6a3a2c);
  return { g, mats, op: 1, paint: { shingle, ridge: ridgeM, gable, trim: trimM, brick } };
})();
// a gable roof over (cx, cz): L long along its ridge, half as wide across it either side; the ridge along z if alongZ;
// no higher than top at the ridge; gable ends (with a vent) at the ends listed (-1, 1: along its own length; along z, 1
// is the back). Its ridge height
function gableRoof(cx, cz, L, half, alongZ, top, ends) {
  const P = roof.paint, run = half + ROOF.ov, base = ROOF.base;
  let k = ROOF.rise; if (base + half * k > top) k = (top - base) / half;
  const rise = run * k, th = Math.atan2(rise, run), len = Math.hypot(run, rise), ridgeY = base + half * k, W = L + 0.7;
  const r = new THREE.Group(); r.position.set(cx, 0, cz); r.rotation.y = alongZ ? Math.PI / 2 : 0; roof.g.add(r);
  [-1, 1].forEach(s => {
    const slope = new THREE.Group(); slope.position.set(0, ridgeY - rise / 2, s * run / 2); slope.rotation.x = s * th; r.add(slope);
    box(slope, W, 0.12, len, P.shingle, 0, 0, 0);
    for (let q = 1; q < 9; q++) box(slope, W + 0.02, 0.03, 0.06, P.ridge, 0, 0.075, -len / 2 + q * len / 9);   // shingle rows
    box(slope, W + 0.04, 0.16, 0.12, P.trim, 0, -0.03, s * len / 2);                                          // fascia at the eave (its top a hair under the shingles', never level with them)
  });
  box(r, W + 0.1, 0.16, 0.26, P.ridge, 0, ridgeY + 0.04, 0);
  // gable ends, each with a louvred vent high in it
  const tri = new THREE.Shape(); tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, ridgeY - base - 0.05); tri.lineTo(-half, 0);
  const tg = new THREE.ShapeGeometry(tri);
  for (const e of ends) {
    const x = e * (L / 2 - 0.02), m = new THREE.Mesh(tg, P.gable); m.rotation.y = Math.PI / 2; m.position.set(x, base, 0); m.castShadow = true; m.userData.own = true; r.add(m);
    box(r, 0.05, 0.56, 0.66, P.trim, e * L / 2, ridgeY - 0.95, 0);
    for (let q = 0; q < 5; q++) box(r, 0.07, 0.03, 0.52, P.ridge, e * L / 2, ridgeY - 1.15 + q * 0.1, 0);
  }
  return ridgeY;
}
// the roof over this run's footprint (HOUSE.notch), with the chimney through the front roof's back slope
function buildRoof() {
  const g = roof.g, n = HOUSE.notch;
  while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); }
  const zA = n ? cxw(n.j1) + 0.5 : HOUSE.z0, cx = (HOUSE.x0 + HOUSE.x1) / 2, czA = (zA + HOUSE.z1) / 2, halfA = (HOUSE.z1 - zA) / 2;
  const ridgeA = gableRoof(cx, czA, HOUSE.x1 - HOUSE.x0, halfA, false, Infinity, [-1, 1]);
  if (n) {
    // the wing: what's left of the back beside the notch, from the back wall in as far as the front roof's ridge
    const bx0 = n.i0 === HX0 ? cxw(n.i1) + 0.5 : HOUSE.x0, bx1 = n.i0 === HX0 ? HOUSE.x1 : cxw(n.i0) - 0.5, z1 = czA;
    gableRoof((bx0 + bx1) / 2, (HOUSE.z0 + z1) / 2, z1 - HOUSE.z0, (bx1 - bx0) / 2, true, ridgeA - ROOF.under, [1]);
  }
  const P = roof.paint, chx = cx + 3.2 * (n && n.i0 !== HX0 ? -1 : 1), chz = czA - Math.min(1.6, halfA * 0.4);
  box(g, 0.6, 1.6, 0.6, P.brick, chx, ridgeA - 0.2, chz);
  box(g, 0.7, 0.1, 0.7, P.ridge, chx, ridgeA + 0.62, chz);
  // the roof's materials stay transparent so it can fade, which would draw it after the see-through outlines and leave
  // zombies behind it unmarked: drawn first among the see-through things, its depth is there for them to test against
  g.traverse(o => { if (o.isMesh) o.renderOrder = -10; });
}
setFootprint(null, false);
setWindows(new Set([idx(19, HZ0), idx(24, HZ0), idx(HX0, 21), idx(HX1, 22)]), false);   // (till the first floor plan's laid out)
box(scene, 0.18, 0.22, 0.18, basic(0xffd9a0), cxw(21) + 0.7, 2.25, cxw(HZ1) + 0.42).castShadow = false;
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
  box(slope, 3.86, 0.12, 0.08, trimM, 0, -0.028, len / 2);                                             // fascia (its top under the shingles')
  for (let k = -3; k <= 3; k++) box(slope, 0.06, 0.08, len - 0.1, beamM, k * 0.6, -0.08, 0);         // rafters underneath
  box(g, 3.4, 0.14, 0.14, beamM, 0, 2.37, 0.55);                                                       // header beam across the posts
  box(g, 3.6, 0.1, 0.08, trimM, 0, y0 - 0.06, z0 + 0.04);                                              // ledger on the wall
  [-1.6, 1.6].forEach(a => { const sd = -Math.sign(a), br = box(g, 0.42, 0.07, 0.07, beamM, a + sd * 0.17, 2.14, 0.55); br.rotation.z = sd * 0.78; });   // knee braces post to header
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.renderOrder = -10; } });   // drawn before the outlines, like the main roof
  return { g, mats, op: 1, x: cxw(21), z: cxw(HZ1) + 1.1, paint: { shingle, ridge: ridgeM, trim: trimM } };
})();
// how high the ground surface is here: the porch deck, its step and the door's threshold stand above the dirt, and
// indoors the floorboards and the doormat a touch above it, so blood and brass land on top of them instead of
// under the boards, and you stand on them (player/animation.js)
const FLOOR_TILE = new Uint8Array(N * N);   // (the cells with a tiled floor this run: world/interior.js)
function surfaceY(x, z) {
  const px = x - cxw(21), pz = z - (cxw(HZ1) + 1.1);
  if (Math.abs(px) < 1.7 && Math.abs(pz) < 0.65) return 0.12;
  if (Math.abs(px) < 0.6 && pz >= 0.65 && pz < 1.05) return 0.06;
  if (ci(x) === 21 && ci(z) === HZ1) return 0.27;   // the top of the threshold
  if (HOUSE_FP[idx(ci(x), ci(z))] === 1) {
    if (Math.abs(x - cxw(21)) < 0.5 && Math.abs(z - cxw(25.15)) < 0.28) return 0.033;   // the doormat
    if (FLOOR_TILE[idx(ci(x), ci(z))]) return 0.027;                              // a tiled floor (world/interior.js)
    return 0.015;                                                                  // the floorboards
  }
  return 0;
}
// the farmhouse's paint, a new scheme each run (from its floor plan's seed: world/interior.js): the siding and the
// shadow lines between its boards, the trim, the shutters, the door, and what the roof's covered in
const HOUSE_PAINT = [
  { side: 0xd8d2c4, trim: 0x3a3632, shut: 0x2e3a30, door: 0x7a2e24, roof: 0x4b3d36 },   // white, black-green shutters, a red door
  { side: 0x8a3a2e, trim: 0xe2dccd, shut: 0x2a2a28, door: 0x2e3a4a, roof: 0x3a3a3a },   // barn red, white trim
  { side: 0x8e9c7e, trim: 0xe6dfcf, shut: 0x3e4a36, door: 0x8a5a2a, roof: 0x4a4038 },   // sage
  { side: 0x6e7e8e, trim: 0xe4e0d4, shut: 0x2a3440, door: 0xa8452e, roof: 0x3e3a38 },   // slate blue
  { side: 0xd6c08a, trim: 0x5a4632, shut: 0x5a3a2a, door: 0x3a4a3a, roof: 0x5a4a3e },   // butter yellow
  { side: 0x9c968a, trim: 0x4a3e32, shut: 0x6a2e26, door: 0x6a2e26, roof: 0x45403a }    // weathered grey
];
const _hc = new THREE.Color();
// fade: from the scheme it had (the title's, as a run starts) to the new one over PAINT_FADE seconds, eased, rather
// than all at once (stepPaint, every frame from world/cutaway.js)
const PAINT_FADE = 2.4, PAINT_TW = { t: 1, list: [] };
function paintHouse(rnd, fade) {
  const c = HOUSE_PAINT[(rnd() * HOUSE_PAINT.length) | 0], shade = (h, k) => _hc.setHex(h).multiplyScalar(k).getHex(), list = [];
  const paint = (col, hex) => { if (fade) list.push([col, col.clone(), new THREE.Color(hex)]); else col.setHex(hex); };
  for (const w of walls) {
    const m = w.mats; paint(m.wall.color, c.side); paint(m.clap.color, shade(c.side, 0.7)); paint(m.trim.color, c.trim);
    if (m.shutter) paint(m.shutter.color, c.shut);
    if (m.paint) { paint(m.paint.color, c.door); paint(m.panel.color, shade(c.door, 0.78)); }
  }
  // the roofs' colours are set from their base every frame, as the light changes (world/cutaway.js)
  [roof.paint, porchRoof.paint].forEach(p => { paint(p.shingle.userData.base, c.roof); paint(p.ridge.userData.base, shade(c.roof, 0.62)); paint(p.trim.userData.base, c.trim); });
  paint(roof.paint.gable.userData.base, c.side);
  PAINT_TW.list = list; PAINT_TW.t = fade ? 0 : 1;
}
function stepPaint(rdt) {
  if (PAINT_TW.t >= 1) return;
  PAINT_TW.t = Math.min(1, PAINT_TW.t + rdt / PAINT_FADE); const k = smooth(PAINT_TW.t);
  for (const [col, a, b] of PAINT_TW.list) col.copy(a).lerp(b, k);
}
