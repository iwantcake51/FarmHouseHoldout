// Part helpers and the model builder for every gun.

// the right fist; melee models are built handle-down along +y
// small builders for gun parts: cylinders along the bore, rings, and a light strip that fakes a top-edge highlight
const cyl = (g, r, len, mat, x, y, z, seg) => { const m = cylZ(r, len, mat, seg); m.position.set(x, y, z); g.add(m); return m; };
const ring = (g, r, w, mat, x, y, z) => cyl(g, r, w, mat, x, y, z, 14);
const hi = (g, w, d, x, y, z) => box(g, w, 0.007, d, GM.hi, x, y, z);
const taper = (g, r0, r1, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
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
    box(sl, 0.01, 0.026, 0.07, GM.steel, 0.034, 0.012, 0.03);                   // barrel hood in the ejection port
    box(sl, 0.012, 0.016, 0.012, GM.metal, 0, 0.036, 0.135); box(sl, 0.005, 0.005, 0.004, GM.dot, 0, 0.041, 0.142);
    box(sl, 0.032, 0.016, 0.012, GM.metal, 0, 0.036, -0.135); box(sl, 0.005, 0.005, 0.004, GM.dot, -0.01, 0.041, -0.128); box(sl, 0.005, 0.005, 0.004, GM.dot, 0.01, 0.041, -0.128);
    cyl(g, 0.013, 0.02, GM.steel, X, 1.142, 0.833);
    cyl(g, 0.017, 0.26, GM.steel, X, 1.142, 0.7); box(g, 0.034, 0.022, 0.08, GM.steel, X, 1.142, 0.59);   // barrel and chamber block, seen when the slide runs back
    cyl(g, 0.007, 0.2, GM.metal2, X, 1.112, 0.73);                                // recoil spring guide
    gripMag(g, 1.0, 0.565, 0.22, 0.05, 0.17, 0.06);
    let front = 0.845;
    if (m.match) { cyl(g, 0.022, 0.11, GM.metal2, X, 1.142, 0.9); ring(g, 0.024, 0.012, GM.steel, X, 1.142, 0.95); box(g, 0.004, 0.01, 0.05, GM.poly, X, 1.165, 0.9); front = 0.955; }
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
    box(sl, 0.01, 0.034, 0.08, GM.metal, 0.042, 0.012, 0.03);
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
    box(g, 0.01, 0.034, 0.08, GM.steel, X + 0.037, 1.125, 0.64);                 // ejection port
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
    const bc = box(g, 0.012, 0.05, 0.1, GM.blued, X + 0.046, 1.12, 0.74);
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
    const bh = box(g, 0.06, 0.013, 0.013, m.bolt ? GM.steel : GM.metal, X + 0.05, 1.14, 0.56);   // bolt handle
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), m.bolt ? GM.steel : GM.metal); knob.position.set(0.032, -0.006, 0); bh.add(knob);
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
    const sl = box(g, 0.022, 0.024, 0.04, GM.steel, X, 1.185, 0.74), bc = box(g, 0.01, 0.04, 0.08, GM.steel, X + 0.032, 1.13, 0.78);
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
    let front = 1.12; const sl = box(g, 0.018, 0.018, 0.05, GM.steel, X - 0.03, 1.165, 1.0), bc = box(g, 0.01, 0.04, 0.09, GM.steel, X + 0.032, 1.125, 0.72);
    if (m.integral) { cyl(g, 0.05, 0.36, GM.metal, X, 1.12, 1.12); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 0.95); ring(g, 0.053, 0.02, GM.metal2, X, 1.12, 1.29); front = 1.3; }
    else { cyl(g, 0.014, 0.12, GM.steel, X, 1.12, 1.08); ring(g, 0.026, 0.025, GM.metal, X, 1.165, 1.1); box(g, 0.01, 0.03, 0.01, GM.metal, X, 1.19, 1.1); }
    return { front, y: 1.12, magZ: 0.78, magY: 1.07, baseMag: m.stack ? 0.4 : 0.24, slide: sl, bolts: [bc], travel: 0.08, lock: true, top: 1.17, sz: 0.66 };
  },
  ar(g, m) {
    box(g, 0.074, 0.08, 0.38, GM.metal, X, 1.14, 0.63);                           // upper
    box(g, 0.068, 0.07, 0.3, GM.park, X, 1.075, 0.62);                            // lower
    box(g, 0.05, 0.016, 0.38, GM.metal, X, 1.188, 0.64); for (let k = 0; k < 11; k++) box(g, 0.052, 0.006, 0.012, GM.poly, X, 1.196, 0.47 + k * 0.034);   // top rail
    box(g, 0.012, 0.034, 0.07, GM.steel, X + 0.037, 1.14, 0.6); cyl(g, 0.012, 0.03, GM.metal2, X + 0.04, 1.155, 0.52);   // ejection port, forward assist
    box(g, 0.08, 0.08, 0.38, GM.olive, X, 1.13, 1.01); hi(g, 0.05, 0.36, X, 1.172, 1.01);
    for (let k = 0; k < 5; k++) [-1, 1].forEach(sd => box(g, 0.004, 0.02, 0.045, GM.poly, X + sd * 0.041, 1.13, 0.87 + k * 0.068));   // M-LOK slots
    const bl = m.heavy ? 0.022 : 0.015; cyl(g, bl, 0.3, GM.blued, X, 1.13, 1.35);
    box(g, 0.03, 0.08, 0.04, GM.metal, X, 1.17, 1.24); box(g, 0.006, 0.03, 0.006, GM.metal2, X, 1.22, 1.24);   // front sight post
    cyl(g, 0.02, 0.05, GM.metal, X, 1.13, 1.5); for (let k = 0; k < 3; k++) box(g, 0.042, 0.006, 0.01, GM.poly, X, 1.13, 1.485 + k * 0.014);   // flash hider
    cyl(g, 0.02, 0.18, GM.metal2, X, 1.12, 0.36); box(g, 0.066, 0.12, 0.2, GM.olive, X, 1.09, 0.24); box(g, 0.068, 0.04, 0.12, GM.poly, X, 1.155, 0.25); stockPad(g, 0.066, 0.12, 0.13, 1.09);
    box(g, 0.05, 0.13, 0.06, GM.poly, X, 0.995, 0.49).rotation.x = 0.35; guard(g, 1.03, 0.52, 0.6, GM.park);
    if (!T('mag') || T('mag') === 1) {
      const h = 0.13 + T('mag') * 0.05;
      // a curved box mag: two straight sections, the lower one swept forward
      const mg = g.userData.magG || g;
      const a = box(mg, 0.058, h, 0.09, GM.metal2, X, 1.03 - h / 2, 0.715); a.rotation.x = -0.1;
      const ly = 1.03 - h - 0.05, lz = 0.715 + h * 0.1 + 0.03;
      box(mg, 0.058, 0.11, 0.09, GM.metal2, X, ly, lz).rotation.x = -0.38;
      box(mg, 0.064, 0.016, 0.1, GM.poly, X, ly - 0.055, lz + 0.022).rotation.x = -0.38;
    }
    const sl = box(g, 0.05, 0.016, 0.03, GM.steel, X, 1.17, 0.46);                // charging handle
    const bc = box(g, 0.01, 0.03, 0.065, GM.blued, X + 0.039, 1.14, 0.6);          // bolt carrier showing in the port
    if (m.gl) { cyl(g, 0.048, 0.34, GM.olive, X, 1.0, 1.03); ring(g, 0.05, 0.03, GM.metal, X, 1.0, 1.2); box(g, 0.04, 0.08, 0.06, GM.metal, X, 0.96, 0.86); box(g, 0.034, 0.05, 0.12, GM.metal, X, 1.07, 1.0); }
    return { front: 1.525, y: 1.13, magZ: T('mag') >= 2 ? 0.72 : 0, magY: 1.04, drumOnly: true, slide: sl, bolts: [bc], travel: 0.08, lock: true, mz: 0.72, top: 1.196, sz: 0.6 };
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
    box(g, 0.02, 0.03, 0.05, GM.metal2, X + 0.055, 1.1, 0.42); const sl = box(g, 0.022, 0.034, 0.08, GM.steel, X + 0.058, 1.14, 0.52), bc = box(g, 0.012, 0.05, 0.1, GM.blued, X + 0.046, 1.11, 0.7);
    return { front: 1.535, y: 1.13, slide: sl, bolts: [bc], travel: 0.1, lock: true, mz: 0.62, top: 1.205, sz: 0.52 };
  }
};
