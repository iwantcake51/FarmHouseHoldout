// Part helpers and the model builder for every gun.

// the right fist; melee models are built handle-down along +y
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
    if (m.match) { cyl(g, 0.022, 0.11, GM.metal2, X, 1.142, 0.9); ring(g, 0.024, 0.012, GM.steel, X, 1.142, 0.95); box(g, 0.004, 0.01, 0.05, GM.poly, X, 1.165, 0.9); front = 0.955; }
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
    const bl = m.longbarrel ? 0.46 : 0.28;
    cyl(g, 0.021, bl, GM.steel, X, 1.152, 0.69 + bl / 2); box(g, 0.016, 0.016, bl, GM.steel, X, 1.174, 0.69 + bl / 2); hi(g, 0.012, bl, X, 1.183, 0.69 + bl / 2);
    box(g, 0.026, 0.028, bl * 0.72, GM.steel, X, 1.122, 0.69 + bl * 0.36);    // ejector rod shroud
    box(g, 0.01, 0.026, 0.02, GM.metal, X, 1.192, 0.69 + bl - 0.03); box(g, 0.004, 0.004, 0.004, GM.dotR, X, 1.2, 0.69 + bl - 0.018);
    box(g, 0.022, 0.05, 0.03, m.fan ? GM.brass : GM.metal, X, 1.185, 0.5).rotation.x = 0.55;   // hammer
    box(g, 0.064, 0.17, 0.082, GM.walnut, X, 1.01, 0.5).rotation.x = 0.35; box(g, 0.068, 0.02, 0.02, GM.brass, X, 1.02, 0.5);
    guard(g, 1.05, 0.54, 0.62, GM.steel);
    if (m.speedloader) { cyl(g, 0.045, 0.06, GM.metal, X + 0.09, 1.08, 0.52); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(g, 0.009, 0.03, GM.brass, X + 0.09 + Math.cos(a) * 0.025, 1.08 + Math.sin(a) * 0.025, 0.555); } }
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
    let front = 0.915; if (m.comp) { box(g, 0.09, 0.075, 0.1, GM.metal, X, 1.155, 0.965); for (let k = 0; k < 3; k++) box(g, 0.05, 0.008, 0.012, GM.poly, X, 1.195, 0.935 + k * 0.025); front = 1.015; }
    if (m.boom) box(g, 0.04, 0.04, 0.04, GM.red, X + 0.06, 1.08, 0.62);
    return { front, y: 1.16, magZ: 0.565, magY: 0.92, slide: sl, travel: 0.1, lock: true, top: 1.21, sz: 0.66 };
  },
  pump(g, m) {
    box(g, 0.074, 0.1, 0.27, GM.metal, X, 1.11, 0.62); hi(g, 0.05, 0.25, X, 1.163, 0.62);
    box(g, 0.01, 0.034, 0.08, GM.steel, X - 0.037, 1.125, 0.64);                 // ejection port (shooter's right)
    guard(g, 1.045, 0.54, 0.64, GM.metal);
    cyl(g, 0.023, 0.64, GM.blued, X, 1.15, 1.07); box(g, 0.012, 0.01, 0.6, GM.metal2, X, 1.174, 1.07);   // barrel and vent rib
    box(g, 0.01, 0.01, 0.01, GM.dot, X, 1.183, 1.37);                            // bead sight
    cyl(g, 0.019, m.tube ? 0.66 : 0.48, GM.metal2, X, 1.1, m.tube ? 1.08 : 0.99); ring(g, 0.022, 0.03, GM.metal, X, 1.1, m.tube ? 1.4 : 1.23);
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
    return { front: 0.62 + bl, y: 1.14, top: 1.17, sz: 0.6 };
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
    const bh = box(g, 0.06, 0.013, 0.013, m.bolt ? GM.steel : GM.metal, X - 0.05, 1.14, 0.56);   // bolt handle, on the shooter's right
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m.bolt ? GM.steel : GM.metal); knob.position.set(-0.032, -0.006, 0); bh.add(knob);
    const big = !!m.hpscope, sr = big ? 0.03 : 0.022, sy = big ? 1.27 : 1.225, ob = big ? 0.048 : 0.034;
    cyl(g, sr, big ? 0.4 : 0.3, GM.metal, X, sy, 0.66); hi(g, sr, big ? 0.38 : 0.28, X, sy + sr, 0.66);
    taper(g, sr, ob, 0.08, GM.metal, X, sy, big ? 0.9 : 0.85); taper(g, sr * 1.15, sr, 0.05, GM.metal, X, sy, big ? 0.44 : 0.49);
    box(g, ob * 1.6, ob * 1.6, 0.006, GM.glass, X, sy, big ? 0.943 : 0.893); box(g, sr * 1.8, sr * 1.8, 0.006, GM.glass, X, sy, big ? 0.413 : 0.463);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), GM.metal2); tt.position.set(X, sy + sr + 0.012, 0.66); g.add(tt);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(X + sr + 0.012, sy, 0.66); g.add(st);
    [0.58, 0.76].forEach(z => { box(g, 0.022, sy - 1.16, 0.02, GM.metal, X, (sy + 1.16) / 2, z); ring(g, sr + 0.006, 0.02, GM.metal, X, sy, z); });
    if (m.expand) box(g, 0.05, 0.03, 0.08, GM.copper, X + 0.06, 1.02, 0.7);
    return { front: 1.48, y: 1.14, noSight: true, slide: bh, travel: 0.11, cyc: true };
  },
  smg(g, m) {
    box(g, 0.07, 0.1, 0.36, GM.park, X, 1.12, 0.7); hi(g, 0.05, 0.34, X, 1.173, 0.7);
    for (let k = 0; k < 6; k++) box(g, 0.072, 0.006, 0.012, GM.poly, X, 1.176, 0.56 + k * 0.05);   // top cover ribs
    box(g, 0.058, 0.15, 0.072, GM.poly, X, 1.0, 0.66).rotation.x = 0.08; guard(g, 1.045, 0.68, 0.76, GM.park);
    ring(g, 0.026, 0.03, GM.metal, X, 1.12, 0.895); cyl(g, 0.013, 0.04, GM.steel, X, 1.12, 0.92);
    box(g, 0.012, 0.018, 0.012, GM.metal, X, 1.18, 0.86); box(g, 0.026, 0.018, 0.012, GM.metal, X, 1.18, 0.54);
    box(g, 0.012, 0.012, 0.2, GM.metal2, X - 0.028, 1.07, 0.48); box(g, 0.012, 0.012, 0.2, GM.metal2, X + 0.028, 1.07, 0.48); box(g, 0.068, 0.05, 0.012, GM.metal2, X, 1.07, 0.38);   // folded stock
    const sl = box(g, 0.022, 0.024, 0.04, GM.steel, X, 1.185, 0.74), bc = box(g, 0.01, 0.04, 0.08, GM.steel, X - 0.032, 1.13, 0.78);
    if (m.ported) { box(g, 0.06, 0.06, 0.1, GM.metal2, X, 1.12, 0.98); for (let k = 0; k < 3; k++) box(g, 0.04, 0.008, 0.012, GM.poly, X, 1.152, 0.95 + k * 0.025); }
    return { front: m.ported ? 1.03 : 0.94, y: 1.12, magZ: 0.66, magY: 1.0, baseMag: 0.22, slide: sl, bolts: [bc], travel: 0.08, lock: true, top: 1.18, sz: 0.68 };
  },
  sub(g, m) {
    box(g, 0.07, 0.095, 0.4, GM.metal, X, 1.12, 0.66); hi(g, 0.05, 0.38, X, 1.17, 0.66);
    cyl(g, 0.018, 0.34, GM.metal, X, 1.165, 0.94);                                 // cocking tube over the barrel
    box(g, 0.076, 0.075, 0.2, GM.poly, X, 1.105, 0.96); for (let k = 0; k < 4; k++) box(g, 0.078, 0.01, 0.014, GM.rubber, X, 1.105, 0.88 + k * 0.05);   // handguard
    box(g, 0.054, 0.14, 0.065, GM.poly, X, 0.99, 0.49).rotation.x = 0.3; guard(g, 1.04, 0.52, 0.62, GM.poly);
    box(g, 0.02, 0.05, 0.03, GM.metal, X, 1.21, 0.48); ring(g, 0.024, 0.012, GM.metal, X, 1.2, 0.48);   // rear drum sight
    box(g, 0.018, 0.022, 0.025, GM.poly, X, 1.08, 0.24); [-0.028, 0.028].forEach(o => box(g, 0.012, 0.012, 0.32, GM.metal2, X + o, 1.12, 0.3)); box(g, 0.07, 0.1, 0.02, GM.rubber, X, 1.09, 0.14);   // retractable stock
    let front = 1.12; const sl = box(g, 0.018, 0.018, 0.05, GM.steel, X - 0.03, 1.165, 1.0), bc = box(g, 0.01, 0.04, 0.09, GM.steel, X - 0.032, 1.125, 0.72);
    if (m.integral) { cyl(g, 0.05, 0.36, GM.metal, X, 1.12, 1.12); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 0.95); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 1.29); front = 1.3; }
    else { cyl(g, 0.014, 0.12, GM.steel, X, 1.12, 1.08); ring(g, 0.026, 0.025, GM.metal, X, 1.165, 1.1); box(g, 0.01, 0.03, 0.01, GM.metal, X, 1.19, 1.1); }
    return { front, y: 1.12, magZ: 0.78, magY: 1.07, baseMag: m.stack ? 0.4 : 0.24, slide: sl, bolts: [bc], travel: 0.08, lock: true, top: 1.17, sz: 0.66 };
  },
  // assault rifle: an M4 carbine, traced side on from a photo of one. The upper and the lower read as separate pieces:
  // a seam between them, the lower's rear tower round the buffer tube, its own magwell standing proud with a flared
  // mouth, the trigger in an open guard and the A2 grip. The upper carries the forward assist, brass deflector and open
  // ejection port on the shooter's right, and the A2 carry handle rises out of it on filleted legs. The six-position
  // stock rides its tube, the delta ring meets the upper and the handguard (ribs wrapped round it, tapering forward, its
  // top level with the receiver's) runs to the A-frame front sight and a short barrel with an A2 birdcage. Optics clamp
  // onto a rail on the carry handle, the laser and light are taped on, and the mags go from a curved 30-round STANAG
  // to a 40-round polymer mag, then drums.
  ar(g, m) {
    const y0 = 1.13, RT = 1.172, HR = 0.05, hy = RT - HR, mt = T('mag'), sight = T('sight'), mg = g.userData.magG || g, A = GM.ano, F = GM.furn;
    // ---- the stock: a thick butt with a rounded sleeve along its top that rides the tube, slots down its sides, the QD
    // cup and sling loop, the lock lever; the tube shows between its collar and the lower's tower
    profile(g, shp([[0.14, 1.166], [0.17, 1.166], [0.398, 1.152], [0.402, 1.1], [0.37, 1.093], [0.269, 1.071], [0.183, 1.005], [0.158, 0.946], [0.146, 0.944], [0.14, 0.964]]), 0.064, F, X, 0.004);
    cyl(g, 0.031, 0.245, F, X, 1.139, 0.282, 20); cyl(g, 0.033, 0.022, F, X, 1.139, 0.395, 20);              // the sleeve and its collar
    profile(g, shp([[0.142, 1.16], [0.25, 1.156], [0.262, 1.12], [0.25, 1.074], [0.19, 1.02], [0.163, 0.958], [0.142, 0.956]]), 0.074, F, X, 0.004);   // the butt, thicker than the front of the stock
    profile(g, shp([[0.127, 1.17], [0.142, 1.17], [0.142, 0.941], [0.129, 0.946]]), 0.066, GM.rubber, X, 0.002);   // butt pad
    for (let k = 0; k < 5; k++) [-1, 1].forEach(sd => box(g, 0.004, 0.016, 0.034, GM.rubber, X + sd * 0.0345, 1.128, 0.19 + k * 0.042));
    [-1, 1].forEach(sd => { const c = cyl(g, 0.02, 0.005, GM.rubber, X + sd * 0.0345, 1.06, 0.2, 18); c.rotation.set(0, 0, Math.PI / 2); });
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, 0.952, 0.166); g.add(t); }
    const lv = box(g, 0.016, 0.012, 0.1, A, X, 1.088, 0.35); lv.rotation.x = -0.16; box(g, 0.016, 0.024, 0.014, A, X, 1.076, 0.302);
    cyl(g, 0.025, 0.17, A, X, y0, 0.377, 18); ring(g, 0.03, 0.012, GM.metal2, X, y0, 0.456);                // buffer tube and castle nut
    // ---- lower receiver: the tower behind the upper, the body, the front takedown lug; its magwell; the trigger guard
    profile(g, shp([[0.462, 1.162], [0.481, 1.162], [0.481, 1.083], [0.832, 1.083], [0.836, 1.07], [0.81, 1.05], [0.8, 1.04], [0.67, 1.04], [0.486, 1.036], [0.462, 1.06]]), 0.056, A, X, 0.0015);
    profile(g, shp([[0.664, 1.06], [0.664, 0.993], [0.668, 0.984], [0.796, 0.984], [0.802, 0.993], [0.818, 1.06]]), 0.062, A, X, 0.0015);   // the magwell, standing proud
    profile(g, shp([[0.666, 0.998], [0.666, 0.982], [0.799, 0.982], [0.803, 0.998]]), 0.068, A, X, 0.0012);   // its flared mouth
    box(g, 0.061, 0.0026, 0.35, GM.rubber, X, 1.0835, 0.656);                                               // the seam between upper and lower
    [[0.47, 1.12], [0.824, 1.072]].forEach(([z, yy]) => cyl(g, 0.0065, 0.062, GM.metal2, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));   // takedown and pivot pins
    { const sb = cyl(g, 0.01, 0.006, GM.metal2, X + 0.03, 1.062, 0.53, 14); sb.rotation.set(0, 0, Math.PI / 2); box(g, 0.005, 0.009, 0.034, GM.metal2, X + 0.033, 1.062, 0.53).rotation.x = -0.55; }   // selector
    box(g, 0.005, 0.03, 0.016, GM.metal2, X + 0.032, 1.05, 0.676);                                           // bolt catch
    { const mr = cyl(g, 0.0085, 0.007, GM.metal2, X - 0.032, 1.045, 0.69, 14); mr.rotation.set(0, 0, Math.PI / 2); profile(g, shp([[0.674, 1.062], [0.706, 1.062], [0.706, 1.028], [0.674, 1.028]], [rrect(0.678, 1.032, 0.702, 1.058, 0.007)]), 0.006, A, X - 0.031, 0); }   // mag release and its fence
    profile(g, shp([[0.578, 1.042], [0.578, 1.0], [0.586, 0.993], [0.66, 0.993], [0.667, 1.0], [0.667, 1.042]], [shp([[0.586, 1.038], [0.586, 1.004], [0.659, 1.004], [0.659, 1.038]])]), 0.014, A, X, 0.001);   // the trigger guard, open underneath the trigger
    profile(g, shp([[0.604, 1.04], [0.611, 1.04], [0.617, 1.024], [0.615, 1.011], [0.608, 1.007], [0.609, 1.021], [0.604, 1.034]]), 0.008, GM.metal2, X, 0.0008);   // the trigger, curved
    // ---- the A2 grip, swept back, with its finger rest and checkered sides
    profile(g, shp([[0.506, 1.04], [0.578, 1.04], [0.575, 1.003], [0.565, 0.979], [0.572, 0.97], [0.56, 0.957], [0.538, 0.912], [0.522, 0.875], [0.483, 0.865], [0.45, 0.875], [0.465, 0.925], [0.487, 0.977], [0.5, 1.02]]), 0.046, F, X, 0.004);
    for (let k = 0; k < 4; k++) [-1, 1].forEach(sd => box(g, 0.003, 0.05, 0.004, GM.rubber, X + sd * 0.0262, 0.935, 0.49 + k * 0.012).rotation.x = 0.42);
    // ---- upper receiver: rounded where it meets the barrel, the charging handle, forward assist, brass deflector, the
    // open port with the bolt carrier in it and the dust cover swung down
    profile(g, shp([[0.481, 1.084], [0.481, 1.163], [0.49, RT], [0.802, RT], [0.808, 1.166], [0.808, 1.104], [0.794, 1.084]]), 0.056, A, X, 0.0015);
    box(g, 0.054, 0.011, 0.034, GM.metal2, X, RT + 0.0055, 0.49); box(g, 0.012, 0.009, 0.02, GM.metal2, X + 0.031, RT + 0.006, 0.497);
    box(g, 0.0024, 0.031, 0.116, GM.rubber, X - 0.0293, 1.1325, 0.713);                                     // the ejection port
    const bc = box(g, 0.0026, 0.022, 0.09, GM.steel, X - 0.0303, 1.1325, 0.71);                             // bolt carrier showing in it
    box(g, 0.003, 0.012, 0.11, A, X - 0.034, 1.112, 0.713).rotation.z = -0.9;                               // dust cover, swung open
    profile(g, shp([[0.606, RT - 0.002], [0.652, RT - 0.002], [0.656, 1.12], [0.63, 1.12]]), 0.012, A, X - 0.034, 0.0015);   // brass deflector
    { const fa = cyl(g, 0.016, 0.055, A, X - 0.029, 1.141, 0.515, 16); fa.rotation.x = Math.PI / 2 + 0.25; const fb = cyl(g, 0.012, 0.012, GM.metal2, X - 0.029, 1.148, 0.486, 14); fb.rotation.x = Math.PI / 2 + 0.25; }   // forward assist
    // ---- the A2 carry handle, rising out of the receiver on filleted legs: the rear leg holds the sight, the front one
    // slants down to meet the receiver's front; the window between has generous corners
    { const hs = new THREE.Shape();
      hs.moveTo(0.505, RT - 0.004); hs.quadraticCurveTo(0.52, RT - 0.002, 0.52, RT + 0.018); hs.lineTo(0.52, 1.228); hs.quadraticCurveTo(0.52, 1.24, 0.532, 1.24);
      hs.lineTo(0.764, 1.24); hs.quadraticCurveTo(0.777, 1.24, 0.782, 1.229); hs.lineTo(0.797, 1.192); hs.quadraticCurveTo(0.803, RT, 0.807, RT - 0.004); hs.closePath();
      const w = new THREE.Path(); w.moveTo(0.612, 1.18); w.lineTo(0.738, 1.18); w.quadraticCurveTo(0.751, 1.18, 0.747, 1.193); w.lineTo(0.738, 1.216); w.quadraticCurveTo(0.735, 1.226, 0.724, 1.226);
      w.lineTo(0.614, 1.226); w.quadraticCurveTo(0.6, 1.226, 0.6, 1.212); w.lineTo(0.6, 1.192); w.quadraticCurveTo(0.6, 1.18, 0.612, 1.18); hs.holes.push(w);
      profile(g, hs, 0.028, A, X, 0.003); }
    box(g, 0.01, 0.0025, 0.16, GM.rubber, X, 1.2432, 0.69);                                                // the slot along its top
    { const d = cyl(g, 0.018, 0.04, GM.metal2, X, 1.197, 0.548, 18); d.rotation.set(0, 0, Math.PI / 2); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rb = box(g, 0.041, 0.004, 0.004, A, X, 1.197 + Math.cos(a) * 0.018, 0.548 + Math.sin(a) * 0.018); rb.rotation.x = a; } }   // the knurled elevation drum
    { const w = cyl(g, 0.0095, 0.012, GM.metal2, X - 0.021, 1.244, 0.556, 14); w.rotation.set(0, 0, Math.PI / 2); }   // windage knob
    box(g, 0.02, 0.018, 0.016, A, X, 1.25, 0.55); box(g, 0.008, 0.008, 0.017, GM.rubber, X, 1.252, 0.55);         // the aperture
    [-1, 1].forEach(sd => box(g, 0.005, 0.03, 0.04, A, X + sd * 0.0125, 1.253, 0.552));                     // the ears round it
    // ---- the delta ring right against the upper, the handguard (ribs wrapped round it, fuller at the back) and its cap
    cyl(g, HR + 0.0015, 0.028, A, X, hy, 0.822, 28); ring(g, HR - 0.0005, 0.006, GM.metal2, X, hy, 0.838).geometry = new THREE.CylinderGeometry(HR - 0.0005, HR - 0.0005, 0.006, 28);
    { const z0 = 0.836, z1 = 1.104, n = 11, pts = [[0.02, z0], [HR - 0.003, z0]];
      for (let i = 0; i < n; i++) {
        const za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n, rr0 = t => HR - 0.0065 * ((t - z0) / (z1 - z0)), q = (zb - za);
        pts.push([rr0(za + q * 0.08), za + q * 0.08], [rr0(za + q * 0.6), za + q * 0.6], [rr0(za + q * 0.68) - 0.0035, za + q * 0.68], [rr0(za + q * 0.92) - 0.0035, za + q * 0.92]);
      }
      pts.push([HR - 0.0065 - 0.002, z1], [0.02, z1]);
      lathe(g, pts, F, X, hy, 36).scale.x = 0.95; }
    { const cap = cyl(g, HR - 0.0075, 0.012, A, X, hy, 1.11, 28); cap.scale.x = 0.95; }
    // ---- barrel: thick to the front sight, a short carbine length after it
    const br = m.heavy ? 0.02 : 0.0158;
    cyl(g, 0.018, 0.024, GM.blued, X, y0, 1.124, 16); cyl(g, br, 0.17, GM.blued, X, y0, 1.272, 16);
    // ---- the A-frame front sight: base clamped on the barrel, the tower and its window, ears round the post, the
    // bayonet lug and the sling swivel
    box(g, 0.032, 0.056, 0.07, A, X, 1.132, 1.155);
    profile(g, shp([[1.125, 1.158], [1.19, 1.158], [1.168, 1.243], [1.145, 1.243]], [shp([[1.138, 1.17], [1.177, 1.17], [1.158, 1.226]])]), 0.026, A, X, 0.0015);
    [-1, 1].forEach(sd => box(g, 0.0065, 0.024, 0.024, A, X + sd * 0.0097, 1.254, 1.157)); box(g, 0.005, 0.024, 0.006, GM.metal2, X, 1.252, 1.157);
    box(g, 0.012, 0.014, 0.022, A, X, 1.098, 1.18);
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0028, 6, 12), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, 1.088, 1.14); g.add(t); }
    // ---- A2 birdcage: slotted on top and round the sides, closed underneath (a can threads on in its place)
    let front = 1.357;
    if (!T('supp')) {
      cyl(g, 0.019, 0.07, A, X, y0, 1.392, 18); ring(g, 0.0195, 0.005, GM.metal2, X, y0, 1.425);
      [0, 0.85, -0.85, 1.7, -1.7].forEach(a => { const sl = box(g, 0.006, 0.003, 0.044, GM.rubber, X + Math.sin(a) * 0.0188, y0 + Math.cos(a) * 0.0188, 1.395); sl.rotation.z = -a; });
      front = 1.427;
    }
    // ---- the magazine (in the mag group, so the reload can drop it): a 30-round STANAG, straight under the well and then
    // curving forward, its stamped ribs following the curve; a 40-round polymer mag, longer and more curved, with its
    // waffle panels; or a drum (bigger for the top tier)
    const mz = 0.732, mtop = 0.984;
    if (mt <= 1) {
      const ext = mt === 1, d = 0.1, w = 0.05, R = ext ? 0.5 : 0.36, M = bentMag(mz, mtop, ext ? 0.05 : 0.055, ext ? 0.25 : 0.16, R), L = M.len;
      profile(mg, M.shape(R - d / 2, R + d / 2, 0, L, 0.07), w, ext ? F : GM.metal2, X, 0.003);
      if (!ext) [R - d * 0.24, R + d * 0.24].forEach(r => profile(mg, M.shape(r - 0.0045, r + 0.0045, 0.014, L - 0.014), w + 0.004, GM.metal2, X, 0.0006));   // the stamped ribs down its sides
      else {   // the waffle: raised bars across and down the lower two thirds, the panels sunk between them
        for (let i = 0; i <= 6; i++) { const q = L * (0.3 + 0.112 * i); profile(mg, M.shape(R - d / 2 + 0.007, R + d / 2 - 0.007, q - 0.0045, q + 0.0045), w + 0.004, F, X); }
        [R - d * 0.2, R + d * 0.2].forEach(r => profile(mg, M.shape(r - 0.004, r + 0.004, L * 0.3, L * 0.97), w + 0.004, F, X));
        profile(mg, M.shape(R - d / 2 - 0.0005, R + d / 2 + 0.0005, L * 0.04, L * 0.24), w + 0.003, GM.rubber, X);   // the smooth band where the markings go
      }
      const fp = M.at(R, L + 0.006), fa = M.ang(L); box(mg, w + (ext ? 0.012 : 0.008), ext ? 0.018 : 0.013, d + (ext ? 0.016 : 0.01), ext ? F : A, X, fp[1], fp[0]).rotation.x = -fa;   // floorplate
      if (ext) { const tb = M.at(R + d / 2 + 0.004, L + 0.005); box(mg, w * 0.5, 0.014, 0.012, F, X, tb[1], tb[0]).rotation.x = -fa; }   // the pull tab at the back
    } else {
      // a D-60 style drum: the drum lies along the gun under a short neck, its round ends facing front and back, bulging
      // a little to the left; ribbed end caps, a seam band round the middle and the winding knob on the back cap
      const big = mt >= 3, r = big ? 0.1 : 0.084, len = big ? 0.2 : 0.168, ox = X + 0.012, cz = mz + 0.008, cyy = 0.925 - r * 0.8;
      box(mg, 0.05, 0.12, 0.1, F, X, 0.985, mz); for (let k = 0; k < 3; k++) box(mg, 0.054, 0.004, 0.102, GM.rubber, X, 0.975 - k * 0.02, mz);   // the neck and its ridges
      box(mg, 0.064, 0.04, 0.13, F, X + 0.004, 0.925, mz + 0.004);                                           // the shoulder it widens into
      cyl(mg, r, len, F, ox, cyy, cz, 32);
      [-1, 1].forEach(sd => {
        ring(mg, r + 0.004, 0.014, F, ox, cyy, cz + sd * (len / 2 - 0.009)).geometry = new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.014, 32);   // the rims of the end caps
        cyl(mg, r * 0.72, 0.006, F, ox, cyy, cz + sd * (len / 2 + 0.002), 28); cyl(mg, r * 0.3, 0.004, GM.metal2, ox, cyy, cz + sd * (len / 2 + 0.006), 18);
      });
      ring(mg, r + 0.002, 0.01, GM.rubber, ox, cyy, cz).geometry = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.01, 32);   // the seam round the middle
      box(mg, 0.014, 0.04, 0.01, GM.metal2, ox + r * 0.35, cyy + r * 0.2, cz - len / 2 - 0.012); cyl(mg, 0.011, 0.012, GM.metal2, ox, cyy, cz - len / 2 - 0.012, 14);   // winding knob and its lever
    }
    // ---- the optic mount: a riser clamped through the carry handle's slot, its knob down in the handle's window
    let top = 1.24;
    if (sight) {
      // the rail runs the length of the handle in front of the rear sight and a little past its front, so every ring of
      // any optic sits on it
      profile(g, shp([[0.6, 1.24], [0.6, 1.252], [0.606, 1.256], [0.79, 1.256], [0.8, 1.248], [0.8, 1.24], [0.79, 1.24]]), 0.04, A, X, 0.0008);
      box(g, 0.03, 0.006, 0.198, GM.metal2, X, 1.259, 0.7);
      for (let k = 0; k < 10; k++) box(g, 0.032, 0.003, 0.006, GM.rubber, X, 1.2622, 0.612 + k * 0.0195);   // the rail's cross slots
      [0.64, 0.745].forEach(z => { cyl(g, 0.003, 0.03, GM.steel, X, 1.225, z).rotation.set(0, 0, 0); cyl(g, 0.012, 0.018, GM.metal2, X, 1.203, z, 14).rotation.set(0, 0, 0); });   // clamp bolts through the slot, knobs in the window
      top = 1.262;
    }
    // ---- the red dot is an Aimpoint-style tube in rings on the mount (the holo and the scope come from weapons/attachments.js)
    if (sight === 1) {
      const sy = top + 0.034, sz0 = 0.69;
      [-0.04, 0.04].forEach(o => { box(g, 0.03, 0.012, 0.022, A, X, top + 0.006, sz0 + o); box(g, 0.012, 0.012, 0.016, A, X, top + 0.016, sz0 + o); ring(g, 0.0265, 0.016, A, X, sy, sz0 + o); });
      cyl(g, 0.022, 0.13, A, X, sy, sz0, 18);
      taper(g, 0.022, 0.026, 0.028, A, X, sy, sz0 + 0.075); ring(g, 0.0262, 0.012, GM.metal2, X, sy, sz0 + 0.094);
      cyl(g, 0.023, 0.004, GM.glass, X, sy, sz0 + 0.1); ring(g, 0.024, 0.012, GM.metal2, X, sy, sz0 - 0.07); cyl(g, 0.02, 0.003, GM.glass, X, sy, sz0 - 0.077);
      box(g, 0.004, 0.004, 0.002, GM.red, X, sy, sz0 - 0.0795);
      cyl(g, 0.009, 0.014, GM.metal2, X, sy + 0.027, sz0 + 0.01).rotation.set(0, 0, 0); cyl(g, 0.009, 0.014, GM.metal2, X - 0.027, sy, sz0 + 0.01).rotation.set(0, 0, Math.PI / 2);   // turrets
    }
    // ---- laser, taped to the left of the handguard with olive tape: a pointer, then a proper module
    if (T('laser')) {
      const lx = X + HR * 0.95 + 0.013, ly = hy, lz = 1.0, em = new THREE.Object3D();
      if (T('laser') === 1) { cyl(g, 0.011, 0.11, GM.metal2, lx, ly, lz); ring(g, 0.0125, 0.012, A, lx, ly, lz + 0.05); box(g, 0.008, 0.008, 0.004, GM.red, lx, ly, lz + 0.057); em.position.set(lx, ly, lz + 0.06); }
      else { box(g, 0.03, 0.036, 0.11, GM.tan, lx + 0.004, ly, lz); box(g, 0.01, 0.01, 0.004, GM.red, lx + 0.004, ly + 0.008, lz + 0.056); box(g, 0.01, 0.01, 0.004, GM.glass, lx + 0.004, ly - 0.008, lz + 0.056); box(g, 0.012, 0.006, 0.02, GM.metal2, lx + 0.004, ly + 0.02, lz - 0.02); em.position.set(lx + 0.004, ly + 0.008, lz + 0.059); }
      [lz - 0.032, lz + 0.03].forEach(z => tapeWrap(g, X, hy, z, HR + 0.0025, lx + (T('laser') === 1 ? 0.012 : 0.02), ly, 0.95));
      g.add(em); g.userData.laserEm = em;
    }
    // ---- light, on the barrel ahead of the front sight, low on the left: taped on, then a weapon light in a barrel ring
    if (T('light')) {
      const lx = X + 0.026, ly = y0 - 0.032, lz = 1.255;
      if (T('light') === 1) {
        cyl(g, 0.017, 0.13, GM.metal2, lx, ly, lz); ring(g, 0.021, 0.03, A, lx, ly, lz + 0.075); cyl(g, 0.018, 0.004, GM.lens, lx, ly, lz + 0.091);
        [lz - 0.035, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, br + 0.003, lx + 0.018, ly - 0.004));
      } else {
        ring(g, br + 0.006, 0.03, A, X, y0, lz - 0.02); box(g, 0.016, 0.03, 0.026, A, X + 0.015, y0 - 0.018, lz - 0.02).rotation.z = 0.6;
        cyl(g, 0.019, 0.14, A, lx, ly, lz); ring(g, 0.025, 0.036, GM.metal2, lx, ly, lz + 0.085); cyl(g, 0.022, 0.004, GM.lens, lx, ly, lz + 0.104);
        ring(g, 0.016, 0.014, GM.rubber, lx, ly, lz - 0.077); box(g, 0.006, 0.014, 0.03, GM.rubber, lx + 0.02, ly, lz - 0.04);   // tail cap and pressure switch
      }
    }
    if (m.gl) {   // an M203 under the handguard
      box(g, 0.03, 0.03, 0.26, A, X, hy - HR - 0.012, 0.99); cyl(g, 0.036, 0.27, A, X, hy - HR - 0.062, 1.0); ring(g, 0.038, 0.014, GM.metal2, X, hy - HR - 0.062, 1.135);
      box(g, 0.05, 0.05, 0.08, A, X, 1.03, 0.83); box(g, 0.012, 0.03, 0.012, GM.metal2, X, 0.992, 0.83);
    }
    return { front, y: y0, magZ: 0, magY: 0.99, slide: bc, bolts: [], travel: 0.05, lock: true, mz, top, sz: 0.69, noSight: sight === 1, noLaser: true, noLight: true };
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
    const s = (m.belt ? 0.25 : 0.17) + T('mag') * 0.03, mg = g.userData.magG || g; box(mg, s, s, s, GM.olive, X + 0.02, 1.02 - s / 2, 0.62); box(mg, s + 0.01, 0.012, s + 0.01, GM.metal, X + 0.02, 1.02, 0.62);
    box(mg, 0.02, 0.006, s * 0.6, GM.metal, X + 0.02 - s / 2 - 0.004, 1.02 - s * 0.3, 0.62);
    for (let k = 0; k < 4; k++) box(g, 0.034, 0.016, 0.012, GM.brass, X + 0.05, 1.08 + k * 0.022, 0.6).rotation.z = 0.2;   // belt feeding in
    if (m.bipod) { [-0.04, 0.04].forEach(o => box(g, 0.016, 0.016, 0.3, GM.metal2, X + o, 1.06, 1.3).rotation.set(-0.5, o > 0 ? -0.15 : 0.15, 0)); ring(g, 0.03, 0.03, GM.metal, X, 1.11, 1.18); }
    box(g, 0.02, 0.03, 0.05, GM.metal2, X + 0.055, 1.1, 0.42); const sl = box(g, 0.022, 0.034, 0.08, GM.steel, X + 0.058, 1.14, 0.52), bc = box(g, 0.012, 0.05, 0.1, GM.blued, X - 0.046, 1.11, 0.7);
    return { front: 1.535, y: 1.13, slide: sl, bolts: [bc], travel: 0.1, lock: true, mz: 0.62, top: 1.205, sz: 0.52 };
  }
};
