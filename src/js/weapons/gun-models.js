// Part helpers and the model builder for every gun.

// the right fist; melee models are built handle-down along +y
// where the hunting rifle's bolt knob sits on its bolt (the firing hand works the bolt by it in player/hold.js)
const BOLT_KNOB = [-0.082, -0.006, 0];
// small builders for gun parts: cylinders along the bore, rings, and a light strip that fakes a top-edge highlight
const cyl = (g, r, len, mat, x, y, z, seg) => { const m = cylZ(r, len, mat, seg); m.position.set(x, y, z); g.add(m); return m; };
const ring = (g, r, w, mat, x, y, z) => cyl(g, r, w, mat, x, y, z, 14);
const hi = (g, w, d, x, y, z) => box(g, w, 0.007, d, GM.hi, x, y, z);
// a side profile (points in z, y) pushed out to width w across the gun and centred on x, with a soft bevel if asked
function profile(g, shape, w, mat, x, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: w, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 } : { depth: w, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2);   // the outline's x runs down the gun (+z), the width across it
  const m = new THREE.Mesh(geo, mat); m.position.x = x; m.castShadow = true; g.add(m); return m;
}
// a cross-section (points in x, y) run along the gun from z0 to z1, with a soft bevel if asked
function xsec(g, shape, z0, z1, mat, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: z1 - z0, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 8 } : { depth: z1 - z0, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, z0); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
// an outline from [z, y] points, with optional holes (shapes or paths)
function shp(pts, holes) { const s = new THREE.Shape(); pts.forEach(([a, b], i) => i ? s.lineTo(a, b) : s.moveTo(a, b)); s.closePath(); if (holes) holes.forEach(h => s.holes.push(h instanceof THREE.Shape ? new THREE.Path(h.getPoints()) : h)); return s; }
// a rounded rectangle path, for windows through a profile
function rrect(z0, y0, z1, y1, r) { const p = new THREE.Path(); p.moveTo(z0 + r, y0); p.lineTo(z1 - r, y0); p.quadraticCurveTo(z1, y0, z1, y0 + r); p.lineTo(z1, y1 - r); p.quadraticCurveTo(z1, y1, z1 - r, y1); p.lineTo(z0 + r, y1); p.quadraticCurveTo(z0, y1, z0, y1 - r); p.lineTo(z0, y0 + r); p.quadraticCurveTo(z0, y0, z0 + r, y0); return p; }
// a tube along the bore with n long ribs round it (the grooves between sunk by dep), squashed sideways by sx
function ribTube(g, r, len, mat, x, y, z, n, dep, sx) {
  const segs = n * 4, geo = new THREE.CylinderGeometry(r, r, len, segs, 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i), rad = Math.hypot(vx, vz); if (rad < 1e-6) continue;
    const j = ((Math.round((Math.atan2(vx, vz) + Math.PI * 2) / (Math.PI * 2) * segs) % segs) + segs) % segs, f = j % 4 < 2 ? 1 : 1 - dep / r;
    p.setXYZ(i, vx * f * (sx || 1), p.getY(i), vz * f);
  }
  geo.computeVertexNormals(); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
// a box magazine seen side on, the way a rifle mag runs: straight for Ls under the well, then bending forward on an arc
// of radius R for La more. Points are placed by r, the distance from the arc's centre (R is the middle of the mag, so
// R - d/2 its front and R + d/2 its back), and s, the length down the mag from its top. shape(r0, r1, s0, s1, up) is the
// band between two r over a stretch of s (up: carry it straight on up into the well by that much); at(r, s) is a point;
// ang(s) is how far it has turned there
function bentMag(z0, yTop, Ls, La, R) {
  const C = [z0 + R, yTop - Ls], ang = q => q > Ls ? (q - Ls) / R : 0;
  const at = (r, q) => q <= Ls ? [C[0] - r, yTop - q] : [C[0] - r * Math.cos(ang(q)), C[1] - r * Math.sin(ang(q))];
  const shape = (r0, r1, s0, s1, up) => {
    const sh = new THREE.Shape(), N = Math.max(2, Math.ceil((s1 - s0) / 0.01)), q = i => s0 + (s1 - s0) * i / N;
    if (up) { sh.moveTo(C[0] - r1, yTop + up); sh.lineTo(C[0] - r0, yTop + up); } else sh.moveTo(...at(r0, s0));
    for (let i = 0; i <= N; i++) sh.lineTo(...at(r0, q(i)));
    for (let i = N; i >= 0; i--) sh.lineTo(...at(r1, q(i)));
    sh.closePath(); return sh;
  };
  return { at, ang, shape, len: Ls + La };
}
// a revolved shape round the bore: pts are [radius, z] from back to front
function lathe(g, pts, mat, x, y, seg) {
  const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg || 32); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m;
}
// a few turns of olive tape round the tube at (x, y) and the thing taped beside it at (tx, ty): a band round the tube
// and a wrap round the pair
function tapeWrap(g, x, y, z, r, tx, ty, sx) {
  ring(g, r, 0.018, GM.odTape, x, y, z).scale.x = sx || 1; r *= sx || 1;
  const x0 = Math.min(x, tx), x1 = Math.max(x + r * 0.6, tx), y0 = Math.min(y - r * 0.5, ty - 0.016), y1 = Math.max(y + r * 0.5, ty + 0.016);
  box(g, x1 - x0, y1 - y0, 0.018, GM.odTape, (x0 + x1) / 2 + 0.002, (y0 + y1) / 2, z);
}
const taper = (g, r0, r1, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 18), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
function guard(g, y, z0, z1, mat) { box(g, 0.016, 0.012, z1 - z0, mat, X, y, (z0 + z1) / 2); box(g, 0.016, 0.05, 0.012, mat, X, y + 0.025, z1); box(g, 0.009, 0.034, 0.01, GM.metal2, X, y + 0.025, z0 + (z1 - z0) * 0.45).rotation.x = 0.25; }
function stockPad(g, w, h, z, y) { box(g, w + 0.004, h, 0.025, GM.rubber, X, y, z); }
// a pistol magazine inside the grip, tilted with it, with its base plate just below the grip; it lives in the mag group so it can drop out
function gripMag(g, y, z, tilt, w, h, d) {
  const m = new THREE.Group(); m.position.set(X, y, z); m.rotation.x = tilt; (g.userData.magG || g).add(m);
  box(m, w, h, d, GM.metal2, 0, -0.005, 0); box(m, w + 0.014, 0.014, d + 0.02, GM.poly, 0, -h / 2 - 0.012, 0.004);
}
// Gun models. Each builder adds meshes to the group g (axis +z is the barrel, X is the right-hand offset)
// and returns where the muzzle is plus mount points for magazines, sights and the moving slide or bolt.
const GUN_MODELS = {
  pistol(g, m) {
    box(g, 0.066, 0.042, 0.27, GM.poly, X, 1.088, 0.665);                       // frame and dust cover
    box(g, 0.064, 0.17, 0.078, GM.poly, X, 0.995, 0.565).rotation.x = 0.22;      // grip
    box(g, 0.069, 0.1, 0.05, GM.rubber, X, 0.985, 0.562).rotation.x = 0.22;     // stippled panel
    box(g, 0.06, 0.012, 0.012, GM.metal2, X, 1.072, 0.75);                      // accessory rail lip
    guard(g, 1.032, 0.6, 0.69, GM.poly);
    const sl = box(g, 0.072, 0.058, 0.3, GM.metal, X, 1.137, 0.68);             // slide; details ride on it
    hi(sl, 0.05, 0.27, 0, 0.03, 0);
    for (let k = 0; k < 5; k++) box(sl, 0.074, 0.04, 0.007, GM.poly, 0, -0.002, -0.135 + k * 0.014);
    box(sl, 0.01, 0.026, 0.07, GM.steel, -0.034, 0.012, 0.03);                  // barrel hood in the ejection port (shooter's right)
    box(sl, 0.012, 0.016, 0.012, GM.metal, 0, 0.036, 0.135); box(sl, 0.005, 0.005, 0.004, GM.dot, 0, 0.041, 0.142);
    box(sl, 0.032, 0.016, 0.012, GM.metal, 0, 0.036, -0.135); box(sl, 0.005, 0.005, 0.004, GM.dot, -0.01, 0.041, -0.128); box(sl, 0.005, 0.005, 0.004, GM.dot, 0.01, 0.041, -0.128);
    cyl(g, 0.013, 0.02, GM.steel, X, 1.142, 0.833);
    cyl(g, 0.017, 0.26, GM.steel, X, 1.142, 0.7); box(g, 0.034, 0.022, 0.08, GM.steel, X, 1.142, 0.59);   // barrel and chamber block, seen when the slide runs back
    cyl(g, 0.007, 0.2, GM.metal2, X, 1.112, 0.73);                                // recoil spring guide
    gripMag(g, 1.0, 0.565, 0.22, 0.05, 0.17, 0.06);
    let front = 0.845;
    if (m.match) { const e = 0.04 * (m.match - 1); cyl(g, 0.022, 0.11 + e, GM.metal2, X, 1.142, 0.9 + e / 2); ring(g, 0.024, 0.012, GM.steel, X, 1.142, 0.95 + e); box(g, 0.004, 0.01, 0.05, GM.poly, X, 1.165, 0.9); front = 0.955 + e; }   // longer with each level
    if (m.auto) box(sl, 0.008, 0.016, 0.07, GM.orange, 0.04, -0.004, -0.128);   // the auto sear's longer selector lever
    if (m.burst) { box(sl, 0.06, 0.062, 0.022, GM.metal2, 0, 0.004, -0.158); box(sl, 0.014, 0.024, 0.034, GM.orange, 0.026, 0.018, -0.166).rotation.y = 0.35; }
    return { front, y: 1.142, magZ: 0.575, magY: 0.93, slide: sl, travel: 0.075, lock: true, top: 1.166, sz: 0.64 };
  },
  revolver(g, m) {
    box(g, 0.066, 0.1, 0.17, GM.steel, X, 1.12, 0.6); hi(g, 0.044, 0.15, X, 1.171, 0.6);
    // the cylinder rides on a crane hinged below and left of it, so it can swing out for a reload
    const crane = new THREE.Group(); crane.position.set(X - 0.035, 1.075, 0.625); g.add(crane);
    const cg = new THREE.Group(); cg.position.set(0.035, 0.045, 0); crane.add(cg);
    const cy = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.12, 6), GM.metal2); cy.rotation.x = Math.PI / 2; cy.rotation.y = Math.PI / 6; cy.castShadow = true; cg.add(cy);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; box(cg, 0.022, 0.022, 0.006, GM.poly, Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.061); }   // chamber mouths, seen when it swings out
    box(crane, 0.014, 0.05, 0.1, GM.steel, 0.006, 0.02, 0.03);                    // crane arm
    ring(cg, 0.05, 0.012, GM.steel, 0, 0, 0.065); ring(g, 0.03, 0.01, GM.metal, X, 1.12, 0.558);
    const bl = [0.28, 0.46, 0.54, 0.62][m.longbarrel || 0];   // longer with each level
    cyl(g, 0.021, bl, GM.steel, X, 1.152, 0.69 + bl / 2); box(g, 0.016, 0.016, bl, GM.steel, X, 1.174, 0.69 + bl / 2); hi(g, 0.012, bl, X, 1.183, 0.69 + bl / 2);
    box(g, 0.026, 0.028, bl * 0.72, GM.steel, X, 1.122, 0.69 + bl * 0.36);    // ejector rod shroud
    box(g, 0.01, 0.026, 0.02, GM.metal, X, 1.192, 0.69 + bl - 0.03); box(g, 0.004, 0.004, 0.004, GM.dotR, X, 1.2, 0.69 + bl - 0.018);
    box(g, 0.022, 0.05, 0.03, m.fan ? GM.brass : GM.metal, X, 1.185, 0.5).rotation.x = 0.55;   // hammer
    box(g, 0.064, 0.17, 0.082, GM.walnut, X, 1.01, 0.5).rotation.x = 0.35; box(g, 0.068, 0.02, 0.02, GM.brass, X, 1.02, 0.5);
    guard(g, 1.05, 0.54, 0.62, GM.steel);
    return { front: 0.69 + bl, y: 1.152, top: 1.18, sz: 0.62, crane };
  },
  deagle(g, m) {
    box(g, 0.076, 0.05, 0.3, GM.metal, X, 1.088, 0.68);
    box(g, 0.074, 0.18, 0.09, GM.poly, X, 0.99, 0.56).rotation.x = 0.16; box(g, 0.079, 0.11, 0.055, GM.rubber, X, 0.98, 0.558).rotation.x = 0.16;
    guard(g, 1.03, 0.6, 0.7, GM.metal);
    const sl = box(g, 0.086, 0.08, 0.4, GM.steel, X, 1.15, 0.7);
    box(sl, 0.032, 0.022, 0.38, GM.steel, 0, 0.048, 0); hi(sl, 0.024, 0.36, 0, 0.06, 0);   // the polygonal barrel rib
    for (let k = 0; k < 6; k++) box(sl, 0.088, 0.05, 0.007, GM.metal2, 0, -0.006, -0.17 + k * 0.014);
    box(sl, 0.01, 0.034, 0.08, GM.metal, -0.042, 0.012, 0.03);
    box(sl, 0.012, 0.018, 0.012, GM.metal, 0, 0.068, 0.18); box(sl, 0.034, 0.016, 0.012, GM.metal, 0, 0.066, -0.18);
    cyl(g, 0.02, 0.02, GM.metal2, X, 1.16, 0.905);
    cyl(g, 0.022, 0.38, GM.steel, X, 1.16, 0.71); box(g, 0.044, 0.03, 0.1, GM.steel, X, 1.16, 0.56);   // barrel and chamber under the slide
    cyl(g, 0.008, 0.3, GM.metal2, X, 1.125, 0.74);
    gripMag(g, 0.995, 0.56, 0.16, 0.058, 0.18, 0.07);
    let front = 0.915; if (m.comp) { const L = 0.1 + 0.03 * (m.comp - 1); box(g, 0.09, 0.075, L, GM.metal, X, 1.155, 0.915 + L / 2); for (let k = 0; k < 2 + m.comp; k++) box(g, 0.05, 0.008, 0.012, GM.poly, X, 1.195, 0.935 + k * 0.025); front = 0.915 + L; }   // longer, with another port, each level
    if (m.boom) box(g, 0.04, 0.04, 0.04, GM.red, X + 0.06, 1.08, 0.62);
    return { front, y: 1.16, magZ: 0.565, magY: 0.92, slide: sl, travel: 0.1, lock: true, top: 1.21, sz: 0.66 };
  },
  pump(g, m) {
    box(g, 0.074, 0.1, 0.27, GM.metal, X, 1.11, 0.62); hi(g, 0.05, 0.25, X, 1.163, 0.62);
    box(g, 0.01, 0.034, 0.08, GM.steel, X - 0.037, 1.125, 0.64);                 // ejection port (shooter's right)
    guard(g, 1.045, 0.54, 0.64, GM.metal);
    cyl(g, 0.023, 0.64, GM.blued, X, 1.15, 1.07); box(g, 0.012, 0.01, 0.6, GM.metal2, X, 1.174, 1.07);   // barrel and vent rib
    box(g, 0.01, 0.01, 0.01, GM.dot, X, 1.183, 1.37);                            // bead sight
    { const tl = [0.48, 0.66, 0.72, 0.78][m.tube || 0]; cyl(g, 0.019, tl, GM.metal2, X, 1.1, 0.75 + tl / 2); ring(g, 0.022, 0.03, GM.metal, X, 1.1, 0.74 + tl); }   // the extension reaches further with each level, out past the muzzle
    const fe = box(g, 0.078, 0.07, 0.22, GM.walnut, X, 1.1, 0.96);
    for (let k = 0; k < 5; k++) box(fe, 0.08, 0.012, 0.012, GM.walnut2, 0, -0.01, -0.08 + k * 0.04);
    box(g, 0.058, 0.085, 0.17, GM.walnut, X, 1.055, 0.43).rotation.x = 0.22;      // wrist
    box(g, 0.066, 0.15, 0.24, GM.walnut, X, 1.045, 0.27); hi(g, 0.04, 0.22, X, 1.122, 0.27); stockPad(g, 0.066, 0.15, 0.147, 1.045);
    const sm = m.dragon ? GM.shellO : m.slug ? GM.shellY : GM.shell;
    const n = Math.min(10, 4 + T('mag') * 2);
    box(g, 0.012, 0.07, 0.04 * n + 0.02, GM.poly, X + 0.044, 1.105, 0.3 + n * 0.021);   // side saddle
    for (let k = 0; k < n; k++) { box(g, 0.026, 0.05, 0.03, sm, X + 0.064, 1.105, 0.31 + k * 0.042); box(g, 0.028, 0.014, 0.032, GM.brass, X + 0.064, 1.073, 0.31 + k * 0.042); }
    return { front: 1.39, y: 1.15, slide: fe, travel: 0.15, cyc: true, top: 1.163, sz: 0.62 };
  },
  dbl(g, m) {
    const bl = m.sawn ? 0.4 : 0.78;
    [-0.025, 0.025].forEach(o => { cyl(g, 0.025, bl, GM.blued, X + o, 1.14, 0.62 + bl / 2); ring(g, 0.027, 0.012, GM.metal, X + o, 1.14, 0.62 + bl - 0.006); });
    box(g, 0.016, 0.012, bl, GM.metal2, X, 1.165, 0.62 + bl / 2); box(g, 0.008, 0.008, 0.008, GM.dot, X, 1.174, 0.62 + bl - 0.02);
    box(g, 0.084, 0.09, 0.14, GM.steel, X, 1.11, 0.56); box(g, 0.086, 0.06, 0.1, GM.engr, X, 1.105, 0.56); hi(g, 0.05, 0.12, X, 1.157, 0.56);
    box(g, 0.02, 0.03, 0.03, GM.metal, X - 0.022, 1.165, 0.5).rotation.x = 0.5; box(g, 0.02, 0.03, 0.03, GM.metal, X + 0.022, 1.165, 0.5).rotation.x = 0.5;   // hammers
    box(g, 0.07, 0.05, m.sawn ? 0.16 : 0.26, GM.walnut, X, 1.1, 0.62 + (m.sawn ? 0.1 : 0.15));
    guard(g, 1.045, 0.5, 0.6, GM.steel); if (m.both) box(g, 0.014, 0.034, 0.012, GM.brass, X, 1.07, 0.56);
    box(g, 0.058, 0.09, 0.15, GM.walnut, X, 1.055, 0.43).rotation.x = 0.3;
    if (!m.sawn) { box(g, 0.066, 0.145, 0.22, GM.walnut, X, 1.045, 0.28); hi(g, 0.04, 0.2, X, 1.119, 0.28); stockPad(g, 0.066, 0.145, 0.168, 1.045); }
    else box(g, 0.064, 0.1, 0.06, GM.walnut2, X, 1.0, 0.36);
    return { front: 0.62 + bl, y: 1.14, top: 1.17, sz: 0.6, loaderAt: m.sawn ? [X - 0.042, 1.085, 0.74] : null };
  },
  auto12(g, m) {
    box(g, 0.1, 0.15, 0.5, GM.park, X, 1.1, 0.62); hi(g, 0.07, 0.48, X, 1.177, 0.62);
    box(g, 0.05, 0.016, 0.42, GM.metal, X, 1.183, 0.66); for (let k = 0; k < 10; k++) box(g, 0.052, 0.006, 0.012, GM.poly, X, 1.19, 0.47 + k * 0.042);   // top rail
    cyl(g, 0.036, 0.36, GM.metal2, X, 1.13, 1.06); for (let k = 0; k < 5; k++) ring(g, 0.038, 0.012, GM.poly, X, 1.13, 0.93 + k * 0.06);
    cyl(g, 0.026, 0.06, GM.metal, X, 1.13, 1.27); for (let k = 0; k < 3; k++) box(g, 0.06, 0.008, 0.01, GM.poly, X, 1.13, 1.255 + k * 0.016);
    box(g, 0.078, 0.12, 0.26, GM.park, X, 1.08, 0.24); stockPad(g, 0.078, 0.12, 0.1, 1.08);
    box(g, 0.05, 0.13, 0.06, GM.poly, X, 0.99, 0.49).rotation.x = 0.25; box(g, 0.04, 0.1, 0.05, GM.poly, X, 1.0, 0.96);   // grip and vertical foregrip
    guard(g, 1.03, 0.52, 0.6, GM.poly);
    const mg = g.userData.magG || g;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 18), GM.metal2); d.rotation.z = Math.PI / 2; d.position.set(X, 0.93, 0.66); d.castShadow = true; mg.add(d);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10), GM.metal); hub.rotation.z = Math.PI / 2; hub.position.copy(d.position); mg.add(hub);
    [-0.062, 0.062].forEach(o => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 22), GM.metal); r.rotation.y = Math.PI / 2; r.position.set(X + o, 0.93, 0.66); mg.add(r); });
    if (m.flech) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 18), GM.shellY); s.rotation.z = Math.PI / 2; s.position.set(X, 0.93, 0.66); mg.add(s); }
    const sl = box(g, 0.03, 0.035, 0.08, GM.steel, X + 0.062, 1.15, 0.6);
    const bc = box(g, 0.012, 0.05, 0.1, GM.blued, X - 0.046, 1.12, 0.74);
    return { front: 1.3, y: 1.13, slide: sl, bolts: [bc], travel: 0.1, lock: true, mz: 0.66, top: 1.19, sz: 0.62 };
  },
  hunting(g, m) {
    box(g, 0.066, 0.075, 0.48, GM.walnut, X, 1.085, 0.86); hi(g, 0.04, 0.46, X, 1.123, 0.86);   // forend
    box(g, 0.058, 0.1, 0.2, GM.walnut, X, 1.06, 0.48).rotation.x = 0.18;                       // wrist
    box(g, 0.07, 0.15, 0.26, GM.walnut, X, 1.045, 0.27); box(g, 0.05, 0.035, 0.18, GM.walnut2, X, 1.13, 0.28);   // butt and cheek riser
    stockPad(g, 0.07, 0.15, 0.135, 1.045); box(g, 0.072, 0.07, 0.07, GM.walnut2, X, 1.06, 0.47).rotation.x = 0.18;   // checkering
    cyl(g, 0.028, 0.27, GM.blued, X, 1.135, 0.64); hi(g, 0.02, 0.25, X, 1.164, 0.64);
    guard(g, 1.03, 0.56, 0.66, GM.metal);
    taper(g, 0.022, 0.015, 0.72, GM.blued, X, 1.14, 1.12);
    // the bolt turns about the bore and runs back and forward in the receiver (player/hold.js): a polished body, the
    // shroud and cocking piece out the back, and the handle out to the shooter's right with its knob (at BOLT_KNOB)
    const bh = new THREE.Group(); bh.position.set(X, 1.14, 0.56); g.add(bh);
    cyl(bh, 0.016, 0.13, GM.steel, 0, 0, -0.02); cyl(bh, 0.019, 0.035, GM.blued, 0, 0, -0.1); box(bh, 0.012, 0.022, 0.02, GM.blued, 0, 0.014, -0.115);
    box(bh, 0.06, 0.013, 0.013, m.bolt ? GM.steel : GM.metal, -0.05, 0, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m.bolt ? GM.steel : GM.metal); knob.position.set(BOLT_KNOB[0], BOLT_KNOB[1], BOLT_KNOB[2]); knob.castShadow = true; bh.add(knob);
    // it comes with plain iron sights; a scope goes on with the high-power scope mod (the big one) or a scope from the
    // bench, and a red dot or holo sits on the receiver like on any long gun
    const big = !!m.hpscope, scope = big || T('sight') >= 3;
    if (scope) {
      const sr = big ? 0.03 : 0.022, sy = big ? 1.27 : 1.225, ob = big ? 0.048 : 0.034;
      cyl(g, sr, big ? 0.4 : 0.3, GM.metal, X, sy, 0.66); hi(g, sr, big ? 0.38 : 0.28, X, sy + sr, 0.66);
      taper(g, sr, ob, 0.08, GM.metal, X, sy, big ? 0.9 : 0.85); taper(g, sr * 1.15, sr, 0.05, GM.metal, X, sy, big ? 0.44 : 0.49);
      box(g, ob * 1.6, ob * 1.6, 0.006, GM.glass, X, sy, big ? 0.943 : 0.893); box(g, sr * 1.8, sr * 1.8, 0.006, GM.glass, X, sy, big ? 0.413 : 0.463);
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), GM.metal2); tt.position.set(X, sy + sr + 0.012, 0.66); g.add(tt);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(X + sr + 0.012, sy, 0.66); g.add(st);
      [0.58, 0.76].forEach(z => { box(g, 0.022, sy - 1.16, 0.02, GM.metal, X, (sy + 1.16) / 2, z); ring(g, sr + 0.006, 0.02, GM.metal, X, sy, z); });
    } else {
      box(g, 0.006, 0.022, 0.012, GM.steel, X, 1.164, 1.43); box(g, 0.016, 0.008, 0.02, GM.blued, X, 1.154, 1.43);   // front post on its ramp
      [-0.009, 0.009].forEach(o => box(g, 0.008, 0.02, 0.01, GM.blued, X + o, 1.172, 0.82)); box(g, 0.03, 0.008, 0.016, GM.blued, X, 1.164, 0.82);   // rear notch
    }
    if (m.expand) box(g, 0.05, 0.03, 0.08, GM.copper, X + 0.06, 1.02, 0.7);
    return { front: 1.48, y: 1.14, noSight: scope, top: 1.163, sz: 0.64, slide: bh, travel: 0.11, cyc: true };
  },
  smg(g, m) {
    box(g, 0.07, 0.1, 0.36, GM.park, X, 1.12, 0.7); hi(g, 0.05, 0.34, X, 1.173, 0.7);
    for (let k = 0; k < 6; k++) box(g, 0.072, 0.006, 0.012, GM.poly, X, 1.176, 0.56 + k * 0.05);   // top cover ribs
    box(g, 0.058, 0.15, 0.072, GM.poly, X, 1.0, 0.66).rotation.x = 0.08; guard(g, 1.045, 0.68, 0.76, GM.park);
    ring(g, 0.026, 0.03, GM.metal, X, 1.12, 0.895); cyl(g, 0.013, 0.04, GM.steel, X, 1.12, 0.92);
    box(g, 0.012, 0.018, 0.012, GM.metal, X, 1.18, 0.86); box(g, 0.026, 0.018, 0.012, GM.metal, X, 1.18, 0.54);
    box(g, 0.012, 0.012, 0.2, GM.metal2, X - 0.028, 1.07, 0.48); box(g, 0.012, 0.012, 0.2, GM.metal2, X + 0.028, 1.07, 0.48); box(g, 0.068, 0.05, 0.012, GM.metal2, X, 1.07, 0.38);   // folded stock
    const sl = box(g, 0.022, 0.024, 0.04, GM.steel, X, 1.185, 0.74), bc = box(g, 0.01, 0.04, 0.08, GM.steel, X - 0.032, 1.13, 0.78);
    const pL = m.ported ? 0.1 + 0.03 * (m.ported - 1) : 0;   // longer, with another port, each level
    if (m.ported) { box(g, 0.06, 0.06, pL, GM.metal2, X, 1.12, 0.93 + pL / 2); for (let k = 0; k < 2 + m.ported; k++) box(g, 0.04, 0.008, 0.012, GM.poly, X, 1.152, 0.95 + k * 0.025); }
    return { front: m.ported ? 0.93 + pL : 0.94, y: 1.12, magZ: 0.66, magY: 1.0, baseMag: 0.22, slide: sl, bolts: [bc], travel: 0.08, lock: true, top: 1.18, sz: 0.68 };
  },
  sub(g, m) {
    box(g, 0.07, 0.095, 0.4, GM.metal, X, 1.12, 0.66); hi(g, 0.05, 0.38, X, 1.17, 0.66);
    cyl(g, 0.018, 0.34, GM.metal, X, 1.165, 0.94);                                 // cocking tube over the barrel
    box(g, 0.076, 0.075, 0.2, GM.poly, X, 1.105, 0.96); for (let k = 0; k < 4; k++) box(g, 0.078, 0.01, 0.014, GM.rubber, X, 1.105, 0.88 + k * 0.05);   // handguard
    box(g, 0.054, 0.14, 0.065, GM.poly, X, 0.99, 0.49).rotation.x = 0.3; guard(g, 1.04, 0.52, 0.62, GM.poly);
    box(g, 0.02, 0.05, 0.03, GM.metal, X, 1.21, 0.48); ring(g, 0.024, 0.012, GM.metal, X, 1.2, 0.48);   // rear drum sight
    box(g, 0.018, 0.022, 0.025, GM.poly, X, 1.08, 0.24); [-0.028, 0.028].forEach(o => box(g, 0.012, 0.012, 0.32, GM.metal2, X + o, 1.12, 0.3)); box(g, 0.07, 0.1, 0.02, GM.rubber, X, 1.09, 0.14);   // retractable stock
    let front = 1.12; const sl = box(g, 0.018, 0.018, 0.05, GM.steel, X - 0.03, 1.165, 1.0), bc = box(g, 0.01, 0.04, 0.09, GM.steel, X - 0.032, 1.125, 0.72);
    if (m.integral) { const L = 0.36 + 0.06 * (m.integral - 1); cyl(g, 0.05, L, GM.metal, X, 1.12, 0.94 + L / 2); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 0.95); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 0.93 + L); front = 0.94 + L; }   // a longer can each level
    else { cyl(g, 0.014, 0.12, GM.steel, X, 1.12, 1.08); ring(g, 0.026, 0.025, GM.metal, X, 1.165, 1.1); box(g, 0.01, 0.03, 0.01, GM.metal, X, 1.19, 1.1); }
    return { front, y: 1.12, magZ: 0.78, magY: 1.07, baseMag: [0.24, 0.4, 0.46, 0.52][m.stack || 0], slide: sl, bolts: [bc], travel: 0.08, lock: true, top: 1.17, sz: 0.66 };
  },
  // assault rifle: an M4A1, measured off side and three-quarter renders of a detailed model. The upper is slim and sits
  // on the bore: straight sides closing in under a Picatinny rail and running right up to the delta ring, the forward
  // assist, brass deflector and open ejection port on the shooter's right. The lower, a shade apart and split from it
  // by a seam, has its rear tower round the buffer tube, a magwell standing proud with a flared mouth, the trigger
  // guard open under the trigger, and the A2 grip with its finger rest. The stock is a round housing on the tube over
  // a thin web, ending in a teardrop butt with a rubber pad. The delta ring meets the upper's front; the handguard
  // (wrap-round ribs, full in the middle, tapering forward, vent holes along its belly, its top level with the rail)
  // runs to the A-frame front sight, a short barrel and an A2 birdcage. Without an optic a detachable carry handle sits
  // on the rail; with one the handle comes off and the optic sits low on the rail with a folded backup sight behind it.
  // The laser and light are taped on; the mags go from a curved 30-round STANAG to a 40-round polymer mag, then drums.
  ar(g, m) {
    const y0 = 1.13, UB = 1.1, RB = 1.157, RT = 1.168, HR = 0.05, hy = RT - HR, mt = T('mag'), sight = T('sight'), mg = g.userData.magG || g;
    const A = GM.ano, L = GM.anoL, F = GM.furn, H = GM.hgPoly;
    // ---- the stock: a round housing riding the tube, slots down its sides, a thin web below it down to the toe, the
    // teardrop butt and its rubber pad, the lock lever, the QD cup and sling loop
    cyl(g, 0.034, 0.226, F, X, y0, 0.285, 28); cyl(g, 0.037, 0.026, F, X, y0, 0.408, 28);               // housing and its collar
    profile(g, shp([[0.18, y0], [0.4, y0], [0.4, 1.099], [0.37, 1.094], [0.3, 1.077], [0.2, 1.0], [0.18, 0.986]]), 0.038, F, X, 0.004);   // the web
    const tear = k => { const t = new THREE.Shape(), r = 0.036 * k, bw = 0.022 * k, by = 0.982 - (k - 1) * 0.02;
      t.moveTo(X + r * Math.cos(-0.37), y0 - 0.002 + r * Math.sin(-0.37)); t.absarc(X, y0 - 0.002, r, -0.37, Math.PI + 0.37, false);
      t.lineTo(X - bw, by + 0.018); t.quadraticCurveTo(X - bw, by, X, by); t.quadraticCurveTo(X + bw, by, X + bw, by + 0.018); t.closePath(); return t; };
    xsec(g, tear(1), 0.142, 0.184, F, 0.004);                                                                  // the butt
    xsec(g, tear(1.07), 0.124, 0.142, GM.rubber, 0.003);                                                       // its pad
    for (let k = 0; k < 7; k++) box(g, 0.05 - Math.abs(k - 3) * 0.004, 0.003, 0.003, GM.poly, X, 0.995 + k * 0.016, 0.1225);   // ridges across the pad
    for (let k = 0; k < 5; k++) [-1, 1].forEach(sd => { const sl = box(g, 0.004, 0.011, 0.032, GM.rubber, X + sd * 0.0335, y0 + 0.004, 0.214 + k * 0.038); sl.rotation.z = sd * 0.12; });
    [-1, 1].forEach(sd => { const c = cyl(g, 0.012, 0.004, GM.rubber, X + sd * 0.0212, 1.05, 0.214, 16); c.rotation.set(0, 0, Math.PI / 2); });
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 6, 12), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, 0.978, 0.17); g.add(t); }
    { const lv = box(g, 0.014, 0.01, 0.07, L, X, 1.093, 0.345); lv.rotation.x = -0.12; box(g, 0.014, 0.022, 0.012, L, X, 1.082, 0.31); }
    cyl(g, 0.026, 0.142, L, X, y0, 0.481, 24); ring(g, 0.031, 0.01, GM.metal2, X, y0, 0.551);                 // buffer tube and castle nut
    // ---- lower receiver (its own shade): the rear tower, the body, the front pivot lug; its magwell and flared mouth; the
    // boss round the fire-control pins; the trigger guard and trigger
    profile(g, shp([[0.548, 1.156], [0.562, 1.156], [0.562, UB], [0.848, UB], [0.85, 1.086], [0.84, 1.074], [0.825, 1.068], [0.731, 1.062], [0.646, 1.062], [0.636, 1.04], [0.62, 1.03], [0.572, 1.03], [0.552, 1.045], [0.548, 1.07]]), 0.054, L, X, 0.0015);
    profile(g, shp([[0.731, 1.075], [0.731, 1.032], [0.735, 1.025], [0.816, 1.025], [0.82, 1.032], [0.826, 1.075]]), 0.06, L, X, 0.0015);
    profile(g, shp([[0.732, 1.036], [0.732, 1.022], [0.819, 1.022], [0.822, 1.036]]), 0.066, L, X, 0.0012);
    profile(g, shp([[0.585, 1.096], [0.668, 1.096], [0.668, 1.066], [0.585, 1.066]]), 0.0575, L, X, 0.0008);
    box(g, 0.0595, 0.0028, 0.29, GM.rubber, X, UB, 0.705);                                                    // the seam between upper and lower
    [[0.555, 1.124], [0.844, 1.088]].forEach(([z, yy]) => cyl(g, 0.0058, 0.06, GM.metal2, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));   // takedown and pivot pins
    [[0.61, 1.08], [0.652, 1.08]].forEach(([z, yy]) => cyl(g, 0.0036, 0.0595, GM.metal2, X, yy, z, 10).rotation.set(0, 0, Math.PI / 2));   // hammer and trigger pins
    { const sb = cyl(g, 0.009, 0.005, GM.metal2, X + 0.0295, 1.083, 0.596, 14); sb.rotation.set(0, 0, Math.PI / 2); box(g, 0.004, 0.008, 0.03, GM.metal2, X + 0.032, 1.083, 0.596).rotation.x = -0.55; }   // selector
    box(g, 0.005, 0.028, 0.014, GM.metal2, X + 0.031, 1.074, 0.729);                                          // bolt catch
    { const mr = cyl(g, 0.0075, 0.006, GM.metal2, X - 0.031, 1.07, 0.745, 14); mr.rotation.set(0, 0, Math.PI / 2); profile(g, shp([[0.73, 1.085], [0.76, 1.085], [0.76, 1.055], [0.73, 1.055]], [rrect(0.734, 1.059, 0.756, 1.081, 0.006)]), 0.005, L, X - 0.03, 0); }   // mag release and its fence
    profile(g, shp([[0.644, 1.064], [0.644, 1.03], [0.651, 1.024], [0.71, 1.024], [0.717, 1.03], [0.717, 1.064]], [shp([[0.651, 1.06], [0.651, 1.031], [0.71, 1.031], [0.71, 1.06]])]), 0.011, L, X, 0.001);
    profile(g, shp([[0.673, 1.062], [0.679, 1.062], [0.684, 1.049], [0.682, 1.039], [0.676, 1.036], [0.677, 1.047], [0.673, 1.056]]), 0.007, GM.steelDk, X, 0.0008);
    // ---- the A2 grip, swept back, with its finger rest, checkered sides and the cap on its base
    profile(g, shp([[0.566, 1.032], [0.646, 1.032], [0.642, 1.0], [0.632, 0.98], [0.638, 0.97], [0.626, 0.958], [0.606, 0.915], [0.594, 0.9], [0.555, 0.895], [0.528, 0.905], [0.54, 0.95], [0.556, 0.99]]), 0.044, F, X, 0.004);
    for (let k = 0; k < 4; k++) [-1, 1].forEach(sd => box(g, 0.003, 0.05, 0.004, GM.rubber, X + sd * 0.0252, 0.952, 0.565 + k * 0.012).rotation.x = 0.36);
    { const cp = box(g, 0.036, 0.006, 0.05, GM.metal2, X, 0.896, 0.562); cp.rotation.x = 0.2; }
    // ---- the upper: slim, its sides closing in at the shoulders under the rail, running up to the delta ring
    profile(g, shp([[0.562, UB], [0.562, 1.148], [0.851, 1.148], [0.851, 1.112], [0.84, UB]]), 0.054, A, X, 0.0015);
    xsec(g, shp([[X - 0.027, 1.146], [X + 0.027, 1.146], [X + 0.019, RB + 0.001], [X - 0.019, RB + 0.001]]), 0.564, 0.849, A, 0.001);
    [-1, 1].forEach(sd => box(g, 0.0014, 0.0035, 0.24, A, X + sd * 0.0278, 1.144, 0.685));                   // the ridge where the sides turn in
    xsec(g, shp([[X - 0.013, RB - 0.001], [X + 0.013, RB - 0.001], [X + 0.0165, RB + 0.004], [X + 0.0165, RB + 0.006], [X + 0.0145, RT], [X - 0.0145, RT], [X - 0.0165, RB + 0.006], [X - 0.0165, RB + 0.004]]), 0.566, 0.848, GM.rail, 0.0006);
    for (let k = 0; k < 17; k++) box(g, 0.034, 0.0034, 0.007, GM.rubber, X, RT - 0.0011, 0.575 + k * 0.0165);   // the rail's cross slots
    // charging handle and latch; the raised band round the port, the port with the bolt carrier in it, the dust cover
    // swung down, the brass deflector and the forward assist
    // (the handle is its own group: the reload pulls it back to charge the rifle, weapons/reload.js)
    const ch = new THREE.Group(); g.add(ch); box(ch, 0.05, 0.009, 0.026, GM.metal2, X, RB + 0.004, 0.556); box(ch, 0.011, 0.008, 0.018, GM.metal2, X + 0.028, RB + 0.004, 0.562);
    profile(g, shp([[0.652, 1.146], [0.77, 1.146], [0.77, 1.106], [0.652, 1.106]]), 0.006, A, X - 0.0262, 0.0008);   // the raised band round the port, on its side only
    box(g, 0.0024, 0.03, 0.106, GM.rubber, X - 0.0293, 1.128, 0.71);
    const bc = box(g, 0.0026, 0.02, 0.082, GM.steel, X - 0.0303, 1.128, 0.708);
    box(g, 0.003, 0.011, 0.1, A, X - 0.032, 1.1065, 0.71).rotation.z = -0.9;
    profile(g, shp([[0.616, 1.15], [0.65, 1.15], [0.653, 1.118], [0.632, 1.118]]), 0.012, A, X - 0.031, 0.0015);
    profile(g, shp([[0.566, 1.152], [0.62, 1.148], [0.62, 1.118], [0.566, 1.118]]), 0.018, A, X - 0.022, 0.002);   // the forward assist's housing
    { const fa = cyl(g, 0.013, 0.05, A, X - 0.029, 1.136, 0.592, 16); fa.rotation.x = Math.PI / 2 + 0.2; const fb = cyl(g, 0.0105, 0.01, GM.metal2, X - 0.029, 1.141, 0.566, 14); fb.rotation.x = Math.PI / 2 + 0.2; }
    // ---- without an optic: the detachable carry handle clamped on the rail, the A2 rear sight in its back end
    if (!sight) {
      const hs = new THREE.Shape();
      hs.moveTo(0.566, RT + 0.012); hs.lineTo(0.568, 1.219); hs.quadraticCurveTo(0.568, 1.226, 0.575, 1.226); hs.lineTo(0.816, 1.226); hs.quadraticCurveTo(0.826, 1.226, 0.83, 1.218); hs.lineTo(0.842, 1.186); hs.lineTo(0.844, RT + 0.012); hs.closePath();
      const w = new THREE.Path(); w.moveTo(0.66, 1.186); w.lineTo(0.808, 1.186); w.quadraticCurveTo(0.818, 1.186, 0.815, 1.194); w.lineTo(0.808, 1.208); w.quadraticCurveTo(0.805, 1.215, 0.797, 1.215);
      w.lineTo(0.66, 1.215); w.quadraticCurveTo(0.648, 1.215, 0.648, 1.204); w.lineTo(0.648, 1.197); w.quadraticCurveTo(0.648, 1.186, 0.66, 1.186); hs.holes.push(w);
      profile(g, hs, 0.026, A, X, 0.0025);
      profile(g, shp([[0.564, RT], [0.846, RT], [0.846, RT + 0.013], [0.564, RT + 0.013]]), 0.036, A, X, 0.0012);   // its clamp base
      [0.62, 0.79].forEach(z => { const k = cyl(g, 0.0075, 0.01, GM.metal2, X + 0.023, RT + 0.0065, z, 14); k.rotation.set(0, 0, Math.PI / 2); });   // the clamp's thumbscrews
      box(g, 0.009, 0.0022, 0.15, GM.rubber, X, 1.2272, 0.73);                                              // the slot along its top
      { const d = cyl(g, 0.0155, 0.032, GM.metal2, X, 1.205, 0.618, 20); d.rotation.set(0, 0, Math.PI / 2); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, rb = box(g, 0.033, 0.0035, 0.0035, A, X, 1.205 + Math.cos(a) * 0.0155, 0.618 + Math.sin(a) * 0.0155); rb.rotation.x = a; } }   // the elevation wheel
      { const wk = cyl(g, 0.0085, 0.01, GM.metal2, X - 0.018, 1.23, 0.6, 14); wk.rotation.set(0, 0, Math.PI / 2); }   // windage knob
      box(g, 0.018, 0.016, 0.014, A, X, 1.234, 0.598); box(g, 0.007, 0.007, 0.015, GM.rubber, X, 1.236, 0.598);   // the aperture
      [-1, 1].forEach(sd => box(g, 0.0045, 0.024, 0.032, A, X + sd * 0.011, 1.236, 0.6));                     // its ears
    } else {
      // with an optic, a folded backup sight at the back of the rail
      box(g, 0.03, 0.007, 0.034, A, X, RT + 0.0035, 0.578); box(g, 0.024, 0.005, 0.028, GM.metal2, X, RT + 0.0095, 0.576).rotation.x = -0.08;
    }
    // ---- the delta ring against the upper; the handguard: full in the middle, tapering forward, shallow crisp ribs
    // wrapped round it and vent holes along its belly; its cap
    cyl(g, HR + 0.0015, 0.026, A, X, hy, 0.863, 28); ring(g, HR - 0.0005, 0.005, GM.metal2, X, hy, 0.8785).geometry = new THREE.CylinderGeometry(HR - 0.0005, HR - 0.0005, 0.005, 28);
    { const z0 = 0.876, z1 = 1.12, n = 13, base = z => { const t = (z - z0) / (z1 - z0); return HR - 0.0012 - 0.004 * t + 0.0025 * Math.sin(Math.PI * t); }, rib = 0.0015, pts = [[0.02, z0], [base(z0), z0]];
      for (let i = 0; i < n; i++) {
        const za = z0 + (z1 - z0) * (i + 0.2) / n, zb = z0 + (z1 - z0) * (i + 0.8) / n, e = 0.0006;
        pts.push([base(za), za], [base(za) + rib, za + e], [base(za + e * 2) + rib, za + e * 2], [base(zb - e * 2) + rib, zb - e * 2], [base(zb) + rib, zb - e], [base(zb), zb]);
        if (i < n - 1) { const zc = z0 + (z1 - z0) * (i + 1.2) / n; pts.push([base((zb + zc) / 2), (zb + zc) / 2]); }
      }
      pts.push([base(z1), z1], [0.02, z1]);
      lathe(g, pts, H, X, hy, 40).scale.x = 0.95;
      for (let k = 0; k < 8; k++) { const z = 0.902 + k * 0.027, v = cyl(g, 0.0055, 0.004, GM.rubber, X, hy - base(z) + 0.0004, z, 12); v.rotation.set(0, 0, 0); v.scale.z = 1.5; } }   // the vent holes underneath
    { const cap = cyl(g, HR - 0.0055, 0.01, A, X, hy, 1.125, 28); cap.scale.x = 0.95; }
    // ---- barrel: thick under the front sight, then a short carbine length
    const br = [0.0125, 0.0165, 0.0185, 0.0205][m.heavy || 0];   // thicker with each level
    cyl(g, 0.017, 0.014, GM.blued, X, y0, 1.127, 16); cyl(g, br, 0.17, GM.blued, X, y0, 1.274, 16);
    // ---- the A-frame front sight: base clamped on the barrel, the tower and its window, ears round the post, the
    // bayonet lug and the sling swivel
    box(g, 0.03, 0.05, 0.062, A, X, 1.131, 1.159);
    profile(g, shp([[1.13, 1.155], [1.19, 1.155], [1.172, 1.226], [1.15, 1.226]], [shp([[1.142, 1.166], [1.178, 1.166], [1.161, 1.212]])]), 0.024, A, X, 0.0015);
    [-1, 1].forEach(sd => box(g, 0.006, 0.02, 0.022, A, X + sd * 0.009, 1.234, 1.161)); box(g, 0.0045, 0.02, 0.005, GM.metal2, X, 1.232, 1.161);
    box(g, 0.011, 0.012, 0.02, A, X, 1.101, 1.18);
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0025, 6, 4), GM.metal2); t.rotation.set(0, Math.PI / 2, Math.PI / 4); t.position.set(X, 1.088, 1.142); g.add(t); }   // a square-ish swivel loop
    // ---- A2 birdcage: slotted on top and round the sides, closed underneath (a can threads on in its place)
    let front = 1.358;
    if (!T('supp')) {
      cyl(g, 0.0145, 0.069, A, X, y0, 1.3925, 18); ring(g, 0.015, 0.004, GM.metal2, X, y0, 1.425);
      [0, 0.85, -0.85, 1.7, -1.7].forEach(a => { const sl = box(g, 0.005, 0.0025, 0.044, GM.rubber, X + Math.sin(a) * 0.0143, y0 + Math.cos(a) * 0.0143, 1.396); sl.rotation.z = -a; });
      front = 1.427;
    }
    // ---- the magazine (in the mag group, so the reload can drop it): a 30-round STANAG, straight under the well and then
    // curving forward with its stamped ribs following; a 40-round polymer mag, longer and more curved, with waffle
    // panels; or a drum lying along the gun (bigger for the top tier)
    const mz = 0.7755, mtop = 1.024;
    if (mt <= 1) {
      const ext = mt === 1, d = 0.087, w = 0.048, R = ext ? 0.48 : 0.4, M = bentMag(mz, mtop, ext ? 0.04 : 0.045, ext ? 0.17 : 0.115, R), Ln = M.len;
      profile(mg, M.shape(R - d / 2, R + d / 2, 0, Ln, 0.06), w, ext ? F : GM.magAl, X, 0.003);
      if (!ext) [R - d * 0.24, R + d * 0.24].forEach(r => profile(mg, M.shape(r - 0.004, r + 0.004, 0.012, Ln - 0.012), w + 0.004, GM.magAl, X, 0.0006));
      else {
        for (let i = 0; i <= 6; i++) { const q = Ln * (0.3 + 0.112 * i); profile(mg, M.shape(R - d / 2 + 0.006, R + d / 2 - 0.006, q - 0.004, q + 0.004), w + 0.004, F, X); }
        [R - d * 0.2, R + d * 0.2].forEach(r => profile(mg, M.shape(r - 0.0035, r + 0.0035, Ln * 0.3, Ln * 0.97), w + 0.004, F, X));
        profile(mg, M.shape(R - d / 2 - 0.0005, R + d / 2 + 0.0005, Ln * 0.04, Ln * 0.24), w + 0.003, GM.rubber, X);
      }
      const fp = M.at(R, Ln + 0.005), fa = M.ang(Ln); box(mg, w + (ext ? 0.01 : 0.007), ext ? 0.016 : 0.012, d + (ext ? 0.014 : 0.009), ext ? F : A, X, fp[1], fp[0]).rotation.x = -fa;
      if (ext) { const tb = M.at(R + d / 2 + 0.004, Ln + 0.004); box(mg, w * 0.5, 0.012, 0.011, F, X, tb[1], tb[0]).rotation.x = -fa; }
    } else {
      const big = mt >= 3, r = big ? 0.085 : 0.07, len = big ? 0.17 : 0.142, ox = X + 0.01, cz = mz + 0.006, cyy = 0.955 - r * 0.78;
      box(mg, 0.046, 0.1, 0.086, F, X, 1.005, mz); for (let k = 0; k < 3; k++) box(mg, 0.05, 0.0035, 0.088, GM.rubber, X, 1.0 - k * 0.018, mz);
      box(mg, 0.058, 0.034, 0.11, F, X + 0.004, 0.956, mz + 0.004);
      cyl(mg, r, len, F, ox, cyy, cz, 32);
      [-1, 1].forEach(sd => {
        ring(mg, r + 0.0035, 0.012, F, ox, cyy, cz + sd * (len / 2 - 0.008)).geometry = new THREE.CylinderGeometry(r + 0.0035, r + 0.0035, 0.012, 32);
        cyl(mg, r * 0.72, 0.005, F, ox, cyy, cz + sd * (len / 2 + 0.002), 28); cyl(mg, r * 0.3, 0.004, GM.metal2, ox, cyy, cz + sd * (len / 2 + 0.005), 18);
      });
      ring(mg, r + 0.002, 0.009, GM.rubber, ox, cyy, cz).geometry = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.009, 32);
      box(mg, 0.012, 0.034, 0.009, GM.metal2, ox + r * 0.35, cyy + r * 0.2, cz - len / 2 - 0.01); cyl(mg, 0.0095, 0.01, GM.metal2, ox, cyy, cz - len / 2 - 0.01, 14);
    }
    // ---- optics sit straight on the rail (weapons/attachments.js builds the holo and the scope; the red dot is an
    // Aimpoint-style tube on a low mount, built here)
    const top = RT, sz = 0.7;
    if (sight === 1) {
      const sy = top + 0.038;
      profile(g, shp([[sz - 0.03, top], [sz + 0.03, top], [sz + 0.024, top + 0.017], [sz - 0.024, top + 0.017]]), 0.032, A, X, 0.001);
      box(g, 0.012, 0.011, 0.02, A, X + 0.019, top + 0.006, sz); cyl(g, 0.0055, 0.01, GM.metal2, X + 0.026, top + 0.006, sz, 12).rotation.set(0, 0, Math.PI / 2);
      [-0.03, 0.03].forEach(o => { box(g, 0.011, 0.015, 0.015, A, X, top + 0.016, sz + o); ring(g, 0.025, 0.013, A, X, sy, sz + o); });
      cyl(g, 0.021, 0.115, A, X, sy, sz, 20);
      taper(g, 0.021, 0.025, 0.025, A, X, sy, sz + 0.068); ring(g, 0.0252, 0.011, GM.metal2, X, sy, sz + 0.085);
      cyl(g, 0.022, 0.004, GM.glass, X, sy, sz + 0.091, 20); ring(g, 0.023, 0.011, GM.metal2, X, sy, sz - 0.062); cyl(g, 0.019, 0.003, GM.glass, X, sy, sz - 0.069, 20);
      box(g, 0.004, 0.004, 0.002, GM.red, X, sy, sz - 0.0715);
      cyl(g, 0.0085, 0.013, GM.metal2, X, sy + 0.026, sz + 0.008, 14).rotation.set(0, 0, 0); cyl(g, 0.0085, 0.013, GM.metal2, X - 0.026, sy, sz + 0.008, 14).rotation.set(0, 0, Math.PI / 2);
    }
    // ---- laser, taped to the left of the handguard with olive tape: a pointer, then a proper module
    if (T('laser')) {
      const lx = X + HR * 0.95 + 0.013, ly = hy, lz = 1.0, em = new THREE.Object3D();
      if (T('laser') === 1) { cyl(g, 0.011, 0.11, GM.metal2, lx, ly, lz); ring(g, 0.0125, 0.012, A, lx, ly, lz + 0.05); box(g, 0.008, 0.008, 0.004, GM.red, lx, ly, lz + 0.057); em.position.set(lx, ly, lz + 0.06); }
      else { box(g, 0.03, 0.036, 0.11, GM.tan, lx + 0.004, ly, lz); box(g, 0.01, 0.01, 0.004, GM.laserG, lx + 0.004, ly + 0.008, lz + 0.056); box(g, 0.01, 0.01, 0.004, GM.glass, lx + 0.004, ly - 0.008, lz + 0.056); box(g, 0.012, 0.006, 0.02, GM.metal2, lx + 0.004, ly + 0.02, lz - 0.02); em.position.set(lx + 0.004, ly + 0.008, lz + 0.059); }
      [lz - 0.032, lz + 0.03].forEach(z => tapeWrap(g, X, hy, z, HR + 0.002, lx + (T('laser') === 1 ? 0.012 : 0.02), ly, 0.95));
      g.add(em); g.userData.laserEm = em;
    }
    // ---- light, on the barrel ahead of the front sight, low on the left: taped on, then a weapon light in a barrel ring
    if (T('light')) {
      const lx = X + 0.024, ly = y0 - 0.029, lz = 1.262;
      if (T('light') === 1) {
        cyl(g, 0.016, 0.13, GM.metal2, lx, ly, lz); ring(g, 0.02, 0.03, A, lx, ly, lz + 0.075); cyl(g, 0.017, 0.004, GM.lens, lx, ly, lz + 0.091);
        [lz - 0.035, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, br + 0.003, lx + 0.017, ly - 0.004));
      } else {
        ring(g, br + 0.006, 0.028, A, X, y0, lz - 0.02); box(g, 0.015, 0.028, 0.024, A, X + 0.014, y0 - 0.016, lz - 0.02).rotation.z = 0.6;
        cyl(g, 0.018, 0.13, A, lx, ly, lz); ring(g, 0.024, 0.034, GM.metal2, lx, ly, lz + 0.08); cyl(g, 0.021, 0.004, GM.lens, lx, ly, lz + 0.098);
        ring(g, 0.015, 0.014, GM.rubber, lx, ly, lz - 0.072); box(g, 0.006, 0.013, 0.028, GM.rubber, lx + 0.019, ly, lz - 0.038);
      }
    }
    if (m.gl) {   // an M203 under the handguard
      box(g, 0.028, 0.026, 0.24, A, X, hy - HR - 0.011, 1.0); cyl(g, 0.034, 0.25, A, X, hy - HR - 0.058, 1.0); ring(g, 0.036, 0.012, GM.metal2, X, hy - HR - 0.058, 1.125);
      box(g, 0.046, 0.046, 0.07, A, X, hy - HR - 0.04, 0.85); box(g, 0.011, 0.028, 0.011, GM.metal2, X, hy - HR - 0.072, 0.85);
    }
    return { front, y: y0, magZ: 0, magY: mtop, slide: bc, bolts: [], travel: 0.045, lock: true, mz, top, sz, scopeH: 0.05, noSight: sight === 1, noLaser: true, noLight: true, charge: ch, chargeAt: [X + 0.026, RB + 0.01, 0.552] };
  },
  lmg(g, m) {
    box(g, 0.1, 0.13, 0.5, GM.park, X, 1.1, 0.6); hi(g, 0.07, 0.48, X, 1.17, 0.6);
    box(g, 0.094, 0.04, 0.24, GM.metal2, X, 1.185, 0.6); box(g, 0.02, 0.02, 0.05, GM.metal, X, 1.21, 0.5);   // feed cover and latch
    cyl(g, 0.02, 0.62, GM.blued, X, 1.13, 1.22); cyl(g, 0.026, 0.05, GM.metal, X, 1.13, 1.51);
    const hs = box(g, 0.06, 0.035, 0.44, GM.metal2, X, 1.16, 1.1); for (let k = 0; k < 8; k++) box(hs, 0.062, 0.02, 0.022, GM.poly, 0, 0.004, -0.19 + k * 0.054);   // perforated heat shield
    cyl(g, 0.012, 0.42, GM.metal, X, 1.085, 1.0);                                  // gas tube
    box(g, 0.02, 0.05, 0.02, GM.metal, X, 1.225, 0.72); box(g, 0.02, 0.016, 0.16, GM.metal, X, 1.25, 0.8); box(g, 0.02, 0.05, 0.02, GM.metal, X, 1.225, 0.88);   // carry handle
    box(g, 0.08, 0.13, 0.28, GM.poly, X, 1.07, 0.2); stockPad(g, 0.08, 0.13, 0.055, 1.07);
    box(g, 0.05, 0.13, 0.06, GM.poly, X, 0.99, 0.45).rotation.x = 0.3; guard(g, 1.03, 0.48, 0.56, GM.park);
    const s = [0.17, 0.25, 0.28, 0.31][m.belt || 0] + T('mag') * 0.03, mg = g.userData.magG || g; box(mg, s, s, s, GM.olive, X + 0.02, 1.02 - s / 2, 0.62); box(mg, s + 0.01, 0.012, s + 0.01, GM.metal, X + 0.02, 1.02, 0.62);
    box(mg, 0.02, 0.006, s * 0.6, GM.metal, X + 0.02 - s / 2 - 0.004, 1.02 - s * 0.3, 0.62);
    for (let k = 0; k < 4; k++) box(g, 0.034, 0.016, 0.012, GM.brass, X + 0.05, 1.08 + k * 0.022, 0.6).rotation.z = 0.2;   // belt feeding in
    if (m.bipod) { [-0.04, 0.04].forEach(o => box(g, 0.016, 0.016, 0.3, GM.metal2, X + o, 1.06, 1.3).rotation.set(-0.5, o > 0 ? -0.15 : 0.15, 0)); ring(g, 0.03, 0.03, GM.metal, X, 1.11, 1.18); }
    box(g, 0.02, 0.03, 0.05, GM.metal2, X + 0.055, 1.1, 0.42); const sl = box(g, 0.022, 0.034, 0.08, GM.steel, X + 0.058, 1.14, 0.52), bc = box(g, 0.012, 0.05, 0.1, GM.blued, X - 0.046, 1.11, 0.7);
    return { front: 1.535, y: 1.13, slide: sl, bolts: [bc], travel: 0.1, lock: true, mz: 0.62, top: 1.205, sz: 0.52 };
  }
};
