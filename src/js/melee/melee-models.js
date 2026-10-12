// Model builders for every melee weapon, and the combined GUNS builder table.

// Melee models are built handle-down along +y in the right fist: the fist sits at the origin, the business end runs up +y,
// and the leading edge (the axe bit, the blade's edge, the wrench jaw) faces +z. Lengths match MLEN in melee/swing-trail.js.
const MM = {
  ash: lam(0xb08a5c), ashDark: lam(0x8a6a44), hickory: lam(0x9a7448), grain: lam(0x6e5234), tapeBlk: lam(0x1c1b1a), tapeRib: lam(0x2c2a28),
  redPaint: lam(0x9e2a1e), redDark: lam(0x6e1c14), wornSteel: lam(0x9aa0a4), edge: lam(0xe4e8eb), iron: lam(0x34363a), rust: lam(0x7a4228),
  ito: lam(0x1e2430), samegawa: lam(0xd8d2c0), gold: lam(0xc8a24a), hamon: lam(0xf2f4f6), saya: lam(0x2a1a14), scale: lam(0x5a3a22), rivet: lam(0xc0a060)
};
// a cylinder standing along +y (radius at its top, radius at its bottom), centred at height y
function vcyl(g, rTop, rBot, len, mat, y, seg, x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg || 10), mat); m.position.set(x || 0, y, z || 0); m.castShadow = true; g.add(m); return m; }
// grip tape: a sleeve with raised ridges, from y0 to y1
function gripWrap(g, r, y0, y1, n) { vcyl(g, r, r, y1 - y0, MM.tapeBlk, (y0 + y1) / 2, 10); for (let k = 0; k <= n; k++) vcyl(g, r + 0.003, r + 0.003, 0.008, MM.tapeRib, y0 + (y1 - y0) * k / n, 10); }
const MELEE_MODELS = {
  // ash baseball bat: a taped handle and knob, a long taper into a fat barrel with a rounded end and a burnt-in band
  bat(g, m) {
    vcyl(g, 0.046, 0.04, 0.03, MM.ashDark, -0.105, 12);                      // knob
    vcyl(g, 0.024, 0.023, 0.34, MM.ash, 0.08, 10);                           // handle
    gripWrap(g, 0.027, -0.085, 0.12, 6);
    vcyl(g, 0.058, 0.026, 0.32, MM.ash, 0.41, 12);                           // the taper up into the barrel
    const barrel = vcyl(g, 0.068, 0.059, 0.3, MM.ash, 0.72, 14);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MM.ash); cap.scale.y = 0.45; cap.position.y = 0.87; cap.castShadow = true; g.add(cap);
    vcyl(g, 0.0645, 0.0635, 0.025, MM.grain, 0.66, 14); vcyl(g, 0.0665, 0.0655, 0.01, MM.grain, 0.79, 14);   // burnt-in maker's band
    if (m.nails) for (let k = 0; k < 14; k++) {   // nails driven through the barrel, heads and points out
      const a = k * 2.39, y = 0.6 + (k % 5) * 0.055, nl = new THREE.Group(); nl.position.set(0, y - 0.72, 0); nl.rotation.y = -a; barrel.add(nl);
      box(nl, 0.12, 0.008, 0.008, GM.nail, 0.075, 0, 0); box(nl, 0.012, 0.018, 0.018, MM.iron, 0.02, 0, 0);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.025, 4), GM.nail); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.145; nl.add(tip);
    }
    if (m.wire) for (let k = 0; k < 4; k++) {     // barbed wire coiled round the barrel, barbs sticking out
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.006, 4, 18), GM.wire); t.rotation.set(Math.PI / 2 + 0.18 * (k % 2 ? 1 : -1), 0, 0); t.position.y = 0.6 + k * 0.075; g.add(t);
      for (let b = 0; b < 4; b++) { const a = b * Math.PI / 2 + k; box(g, 0.03, 0.006, 0.006, GM.wire, Math.cos(a) * 0.074, 0.6 + k * 0.075, Math.sin(a) * 0.074).rotation.set(0.6, -a, 0.6); }
    }
  },
  // crowbar: red-painted hex bar, a gooseneck claw over the top and a flattened pry end below the fist, steel worn bright at both ends
  crowbar(g, m) {
    vcyl(g, 0.017, 0.017, 0.74, MM.redPaint, 0.25, 6);
    const pry = new THREE.Group(); pry.position.y = -0.12; pry.rotation.x = 0.28; g.add(pry);
    box(pry, 0.032, 0.07, 0.012, MM.wornSteel, 0, -0.03, 0); box(pry, 0.012, 0.03, 0.012, MM.wornSteel, -0.01, -0.07, 0); box(pry, 0.012, 0.03, 0.012, MM.wornSteel, 0.01, -0.07, 0);   // split pry tips
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.017, 6, 14, Math.PI * 1.05), MM.redPaint); neck.rotation.y = Math.PI / 2; neck.position.set(0, 0.62, 0.065); neck.castShadow = true; g.add(neck);
    const claw = new THREE.Group(); claw.position.set(0, 0.6, 0.135); claw.rotation.x = 0.35; g.add(claw);
    box(claw, 0.034, 0.05, 0.014, MM.wornSteel, 0, -0.02, 0); box(claw, 0.012, 0.04, 0.014, MM.wornSteel, -0.011, -0.06, 0); box(claw, 0.012, 0.04, 0.014, MM.wornSteel, 0.011, -0.06, 0);
    box(g, 0.036, 0.04, 0.036, MM.redDark, 0, 0.56, 0);                      // forged shoulder below the bend
    if (m.tape) gripWrap(g, 0.023, -0.08, 0.15, 7);
  },
  // pipe wrench: a red I-beam handle with a hanging hole, a knurled adjusting nut, a toothed heel jaw and a hook jaw up top
  wrench(g, m) {
    const k = m.jaw ? 1.3 : 1;
    box(g, 0.022, 0.52, 0.03, MM.redPaint, 0, 0.16, 0);
    box(g, 0.05, 0.52, 0.01, MM.redPaint, 0, 0.16, 0.018); box(g, 0.05, 0.52, 0.01, MM.redPaint, 0, 0.16, -0.018);   // I-beam flanges
    const hole = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 6, 12), MM.iron); hole.position.set(0, -0.06, 0.024); g.add(hole);
    box(g, 0.056, 0.05, 0.05, MM.iron, 0, 0.44, 0);                          // the frame where the jaws meet the handle
    const jaw = new THREE.Group(); jaw.position.set(0.012, 0.46, 0); jaw.scale.setScalar(k); g.add(jaw);
    box(jaw, 0.1, 0.045, 0.05, GM.steel, 0.03, 0.04, 0);                     // heel jaw
    for (let t = 0; t < 5; t++) box(jaw, 0.012, 0.012, 0.052, MM.iron, -0.005 + t * 0.016, 0.068, 0);   // teeth facing up
    const nut = vcyl(jaw, 0.03, 0.03, 0.05, GM.metal2, 0.11, 8, -0.02, 0); for (let r = 0; r < 4; r++) vcyl(nut, 0.033, 0.033, 0.006, MM.iron, -0.02 + r * 0.013, 8);   // knurled nut
    box(jaw, 0.035, 0.2, 0.042, GM.steel, -0.02, 0.14, 0);                   // the hook's shank
    box(jaw, 0.12, 0.05, 0.05, GM.steel, 0.025, 0.24, 0);                    // hook jaw
    for (let t = 0; t < 5; t++) box(jaw, 0.012, 0.012, 0.052, MM.iron, 0.005 + t * 0.016, 0.212, 0);   // teeth facing down
    box(jaw, 0.02, 0.06, 0.03, MM.iron, 0.075, 0.22, 0);
  },
  // katana: a wrapped handle with diamond ito and a gold menuki, a round tsuba and brass habaki, then a curved blade
  // built from short segments, each with a dark spine, a bright hamon and an edge, ending in a sharp kissaki
  katana(g, m) {
    box(g, 0.03, 0.29, 0.038, MM.samegawa, 0, 0.005, 0);                     // ray-skin under the wrap
    for (let k = 0; k < 6; k++) [-1, 1].forEach(sd => { const d = box(g, 0.032, 0.03, 0.03, MM.ito, 0, -0.115 + k * 0.046, 0); d.rotation.y = Math.PI / 4 * sd; d.scale.set(1, 1, 0.6); });   // diamond wrap
    box(g, 0.034, 0.022, 0.044, MM.iron, 0, -0.15, 0);                       // kashira (pommel cap)
    box(g, 0.012, 0.03, 0.012, MM.gold, 0, 0.03, 0.021);                     // menuki
    const tsuba = vcyl(g, 0.052, 0.052, 0.012, MM.iron, 0.162, 14); vcyl(tsuba, 0.046, 0.046, 0.014, GM.brass, 0, 14).scale.set(1, 0.3, 1);
    box(g, 0.016, 0.03, 0.05, GM.brass, 0, 0.185, 0.004);                    // habaki
    const L = m.folded ? 0.92 : 0.78, n = 6, seg = L / n, steel = m.folded ? MM.hamon : GM.blade;
    let p = new THREE.Group(); p.position.set(0, 0.2, 0.004); g.add(p);
    for (let k = 0; k < n; k++) {
      const w = 0.044 - k * 0.002;
      box(p, 0.01, seg, w, steel, 0, seg / 2, 0);
      box(p, 0.012, seg, 0.008, GM.metal2, 0, seg / 2, -w / 2 + 0.002);      // spine
      box(p, 0.0105, seg, 0.012, MM.hamon, 0, seg / 2, w / 2 - 0.009);      // hamon line
      box(p, 0.006, seg, 0.006, MM.edge, 0, seg / 2, w / 2 - 0.001);        // edge
      const next = new THREE.Group(); next.position.y = seg; next.rotation.x = -0.035; p.add(next); p = next;   // the gentle curve, back toward the spine
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.08, 4), steel); tip.scale.set(0.24, 1, 1); tip.rotation.y = Math.PI / 4; tip.position.set(0, 0.035, -0.004); tip.castShadow = true; p.add(tip);
  },
  // sledgehammer: a hickory handle with a ribbed rubber grip and an overstrike sleeve, a heavy dark head with bright worn faces
  sledge(g, m) {
    vcyl(g, 0.026, 0.031, 0.98, MM.hickory, 0.37, 10);
    vcyl(g, 0.036, 0.04, 0.03, MM.tapeBlk, -0.115, 10);                       // end cap
    gripWrap(g, 0.034, -0.1, 0.16, 8);
    vcyl(g, 0.034, 0.03, 0.09, MM.tapeBlk, 0.76, 10);                        // overstrike sleeve under the head
    const head = new THREE.Group(); head.position.y = 0.87; g.add(head);
    box(head, 0.12, 0.12, 0.26, MM.iron, 0, 0, 0);
    box(head, 0.105, 0.105, 0.04, MM.wornSteel, 0, 0, 0.145); box(head, 0.105, 0.105, 0.04, MM.wornSteel, 0, 0, -0.145);   // striking faces
    box(head, 0.126, 0.02, 0.2, GM.metal2, 0, 0.05, 0); box(head, 0.126, 0.02, 0.2, GM.metal2, 0, -0.05, 0);              // chamfer bands
    box(head, 0.04, 0.02, 0.05, GM.metal2, 0, 0.068, 0);                     // wedge in the eye
    if (m.spikes) [[0.075, 0, 0, -Math.PI / 2], [-0.075, 0, 0, Math.PI / 2], [0, 0.075, 0, 0], [0, 0.04, 0.06, 0]].forEach(([x, y, z, rz]) => {
      const sp = new THREE.Group(); sp.position.set(x, y, z); sp.rotation.z = rz; head.add(sp);
      box(sp, 0.022, 0.08, 0.022, MM.rust, 0, 0.04, 0); box(sp, 0.04, 0.012, 0.03, MM.rust, 0, 0.01, 0);   // railroad spike, welded on by its head
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), MM.rust); t.position.y = 0.095; sp.add(t);
    });
  },
  // machete: wooden scales with brass rivets and a bird's-head pommel, a finger guard, then a broad blade that widens toward
  // a clipped tip, with a dark spine and a bright edge
  machete(g, m) {
    box(g, 0.042, 0.2, 0.05, MM.scale, 0, 0.0, 0);
    [-0.06, 0.0, 0.06].forEach(y => [-1, 1].forEach(sd => vcyl(g, 0.007, 0.007, 0.004, MM.rivet, y, 8, sd * 0.022, 0).rotation.z = Math.PI / 2));
    const pom = box(g, 0.044, 0.05, 0.06, MM.scale, 0, -0.115, -0.012); pom.rotation.x = -0.45;   // bird's-head pommel
    box(g, 0.012, 0.018, 0.08, MM.iron, 0, 0.11, 0.012);                      // finger guard
    const s = m.longblade ? 1.36 : 1, b = new THREE.Group(); b.position.set(0, 0.12, 0.012); b.scale.set(1, s, 1); g.add(b);
    const parts = [[0.16, 0.07, 0.08], [0.2, 0.092, 0.26], [0.14, 0.098, 0.43]];
    parts.forEach(([h, w, y]) => {
      box(b, 0.011, h, w, GM.blade, 0, y, w / 2 - 0.035);
      box(b, 0.013, h, 0.01, GM.metal2, 0, y, -0.035);                       // spine
      box(b, 0.007, h, 0.01, MM.edge, 0, y, w - 0.038);                      // edge
    });
    const tip = box(b, 0.011, 0.07, 0.07, GM.blade, 0, 0.52, 0.03); tip.rotation.x = 0.7;     // clipped point
    box(b, 0.007, 0.07, 0.01, MM.edge, 0, 0.515, 0.06).rotation.x = 0.7;
    if (m.serrated) for (let k = 0; k < 9; k++) box(b, 0.014, 0.022, 0.022, GM.steel, 0, 0.06 + k * 0.045, -0.04).rotation.x = 0.78;   // saw teeth on the spine
  },
  // fire axe: a wooden handle with a flared, taped grip; a red head whose cheeks flare out to a bright bevelled bit, and a pick behind
  axe(g, m) {
    vcyl(g, 0.026, 0.032, 0.98, MM.hickory, 0.37, 10);
    vcyl(g, 0.038, 0.03, 0.05, MM.hickory, -0.12, 10);                        // flared end of the grip
    gripWrap(g, 0.034, -0.09, 0.13, 6);
    const hw = m.weighted ? 1.3 : 1, head = new THREE.Group(); head.position.y = 0.8; head.scale.setScalar(hw); g.add(head);
    box(head, 0.06, 0.11, 0.08, MM.redPaint, 0, 0, 0);                        // eye
    box(head, 0.048, 0.14, 0.08, MM.redPaint, 0, 0, 0.07);                    // cheeks, flaring toward the bit
    box(head, 0.036, 0.19, 0.06, MM.redPaint, 0, 0, 0.13);
    box(head, 0.02, 0.23, 0.04, MM.wornSteel, 0, 0, 0.175);                   // ground bevel
    box(head, 0.008, 0.24, 0.012, MM.edge, 0, 0, 0.198);                      // the edge
    box(head, 0.04, 0.05, 0.1, MM.redPaint, 0, 0, -0.08);                     // pick
    const pk = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), MM.wornSteel); pk.rotation.x = -Math.PI / 2; pk.position.z = -0.165; pk.castShadow = true; head.add(pk);
    vcyl(g, 0.036, 0.033, 0.03, MM.iron, 0.73, 10);                           // steel collar under the head
  }
};
const GUNS = Object.assign({}, GUN_MODELS, MELEE_MODELS);
