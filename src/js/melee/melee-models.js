// Model builders for every melee weapon, and the combined GUNS builder table.

// Melee models are built handle-down along +y in the right fist: the fist sits at the origin, the business end runs up +y,
// and the leading edge (the axe bit, the blade's edge, the wrench jaw) faces +z. Lengths match MLEN in melee/swing-trail.js.
const MM = {
  ash: lam(0xb08a5c), ashDark: lam(0x8a6a44), hickory: lam(0x9a7448), grain: lam(0x6e5234), tapeBlk: lam(0x1c1b1a), tapeRib: lam(0x2c2a28),
  redPaint: lam(0x9e2a1e), redDark: lam(0x6e1c14), wornSteel: lam(0x9aa0a4), edge: lam(0xe4e8eb), iron: lam(0x34363a), rust: lam(0x7a4228),
  wrenchRed: lam(0xc2261a), forged: lam(0x2a2c30), jawSteel: lam(0xb2b6ba), nut: lam(0x1c1d20), label: lam(0xd8b070), labelRed: lam(0xb8301e),
  ito: lam(0x1e2430), samegawa: lam(0xd8d2c0), gold: lam(0xc8a24a), hamon: lam(0xf2f4f6), saya: lam(0x2a1a14), scale: lam(0x5a3a22), rivet: lam(0xc0a060)
};
// the traced weapons' flat colours: old steel gone dull grey-brown, the old machete's worn grey wood, the fire axe's
// handle wood, its black rubber grip, red paint and bright steel, and the saw-back's black rubber and black coating
Object.assign(MM, { rustBlade: lam(0x6a6058), oldWood: lam(0x6e5a4c), axeWood: lam(0x8a5a3c), axeGrip: lam(0x2a2724),
  axePaint: lam(0xb0261c), axeSteel: lam(0xc4c8cc), sogRubber: lam(0x2e2f32), sogBlack: lam(0x1c1d20) });
// a cylinder standing along +y (radius at its top, radius at its bottom), centred at height y
function vcyl(g, rTop, rBot, len, mat, y, seg, x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg || 10), mat); m.position.set(x || 0, y, z || 0); m.castShadow = true; g.add(m); return m; }
// a mod's level on this model (0 without it) picked out of a table indexed by level: improving a mod at the workbench
// grows the part it adds (a longer blade, more nails, a bigger jaw), so level III looks bigger than level II
const lvAt = (m, k, t) => t[Math.min(t.length - 1, m[k] === true ? 1 : m[k] || 0)];
// the machete's blade length by long-blade level (also what its swing trail stretches by, melee/swing-trail.js)
const MACHETE_S = [1, 1.36, 1.55, 1.74], KATANA_L = [0.78, 0.92, 1.0, 1.08];
// grip tape: a sleeve with raised ridges, from y0 to y1
function gripWrap(g, r, y0, y1, n) { vcyl(g, r, r, y1 - y0, MM.tapeBlk, (y0 + y1) / 2, 10); for (let k = 0; k <= n; k++) vcyl(g, r + 0.003, r + 0.003, 0.008, MM.tapeRib, y0 + (y1 - y0) * k / n, 10); }
// a flat outline (in x, y) pushed out to depth d along z and centred on z0, with an optional soft bevel round its edges
function slab(g, shape, d, mat, z0, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 10 } : { depth: d, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, (z0 || 0) - d / 2); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
const DISC_M = new THREE.CylinderGeometry(1, 1, 1, 16);
// a knurled nut's outline: a ring of fine ribs (radius 0.025), to be extruded along the nut's axis
const NUT_KNURL = (() => { const s = new THREE.Shape(), n = 30; for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? 0.0236 : 0.0256; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; })();
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
    for (let k = 0, n = lvAt(m, 'nails', [0, 14, 20, 26]); k < n; k++) {   // nails driven through the barrel, heads and points out; more with each level
      const a = k * 2.39, y = 0.6 + (k % 5) * 0.055, nl = new THREE.Group(); nl.position.set(0, y - 0.72, 0); nl.rotation.y = -a; barrel.add(nl);
      box(nl, 0.12, 0.008, 0.008, GM.nail, 0.075, 0, 0); box(nl, 0.012, 0.018, 0.018, MM.iron, 0.02, 0, 0);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.025, 4), GM.nail); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.145; nl.add(tip);
    }
    for (let k = 0, n = lvAt(m, 'wire', [0, 4, 5, 6]), sp = 0.3 / Math.max(1, n); k < n; k++) {     // barbed wire coiled round the barrel, barbs sticking out; more coils with each level
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.006, 4, 18), GM.wire); t.rotation.set(Math.PI / 2 + 0.18 * (k % 2 ? 1 : -1), 0, 0); t.position.y = 0.6 + k * sp; g.add(t);
      for (let b = 0; b < 4; b++) { const a = b * Math.PI / 2 + k; box(g, 0.03, 0.006, 0.006, GM.wire, Math.cos(a) * 0.074, 0.6 + k * sp, Math.sin(a) * 0.074).rotation.set(0.6, -a, 0.6); }
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
    if (m.tape) { const lv = lvAt(m, 'tape', [0, 1, 2, 3]); gripWrap(g, 0.021 + 0.002 * lv, -0.08, 0.08 + 0.07 * lv, 5 + 2 * lv); }   // longer and thicker with each level
  },
  // pipe wrench, after a heavy-duty cast one: a red I-beam handle (raised rims round a recessed web, a solid end with a
  // hanging slot), the housing it flares into with a hump over the nut pocket, a steel heel jaw riveted on top, the
  // forged black hook jaw coming up through it with a steel insert, and the knurled nut on the threaded shank.
  // It's drawn in the x-y plane with its jaws opening toward +x, then turned a quarter so the jaws face +z like every
  // other weapon's leading edge: it sits straight in the fist and leads the swing with the hook. The heavy jaw mod makes
  // the hook and its bite bigger.
  wrench(g0, m) {
    const g = new THREE.Group(); g.rotation.y = -Math.PI / 2; g0.add(g);
    const k = lvAt(m, 'jaw', [1, 1.18, 1.26, 1.34]), y0 = -0.115, hb = 0.025, ht = 0.033, yF = 0.45, S = 1.22;
    const edge = y => hb + (ht - hb) * clamp((y - y0 - hb) / (yF - y0 - hb), 0, 1);   // the handle's half width at y
    const slot = (cy, l, w) => { const h = new THREE.Path(); h.moveTo(w, cy - l + w); h.lineTo(w, cy + l - w); h.absarc(0, cy + l - w, w, 0, Math.PI, false); h.lineTo(-w, cy - l + w); h.absarc(0, cy - l + w, w, Math.PI, Math.PI * 2, false); return h; };
    // the handle: raised rims round a recessed web, and a solid end with the hanging slot through it
    const yb = y0 + 0.085, yt = 0.43, rim = 0.006, recess = grow => {
      const wb = edge(yb) - rim + grow, wt = edge(yt) - rim + grow, r = new THREE.Shape();
      r.moveTo(-wb, yb + wb); r.absarc(0, yb + wb, wb, Math.PI, Math.PI * 2, false); r.lineTo(wt, yt - wt); r.absarc(0, yt - wt, wt, 0, Math.PI, false); r.lineTo(-wb, yb + wb); return r;
    };
    const hdl = new THREE.Shape();
    hdl.moveTo(-hb, y0 + hb); hdl.absarc(0, y0 + hb, hb, Math.PI, Math.PI * 2, false); hdl.lineTo(ht, yF + 0.01); hdl.lineTo(-ht, yF + 0.01); hdl.lineTo(-hb, y0 + hb);
    hdl.holes.push(slot(y0 + 0.042, 0.021, 0.0085), new THREE.Path(recess(0).getPoints(12)));
    slab(g, hdl, 0.03, MM.wrenchRed, 0, 0.0015);
    slab(g, recess(0.0012), 0.012, MM.wrenchRed, 0);   // the web
    // raised lettering down the web on both faces, and the maker's oval sticker under the housing
    [[0.27, 6], [0.15, 9], [0.06, 3]].forEach(([yy, n]) => { for (let i = 0; i < n; i++) for (const zs of [1, -1]) box(g, 0.018, 0.0075, 0.003, MM.wrenchRed, 0, yy + (n / 2 - i) * 0.011, zs * 0.0068); });
    { const st = new THREE.Mesh(DISC_M, MM.label); st.rotation.x = Math.PI / 2; st.scale.set(0.017, 0.001, 0.011); st.position.set(0, 0.392, 0.0068); g.add(st);
      const st2 = new THREE.Mesh(DISC_M, MM.labelRed); st2.rotation.x = Math.PI / 2; st2.scale.set(0.012, 0.001, 0.0065); st2.position.set(0, 0.392, 0.0075); g.add(st2); }
    // the head, a size up and a little thicker than the handle: built round (0, yF) in its own units
    const hd = new THREE.Group(); hd.position.y = yF; hd.scale.setScalar(S); g.add(hd);
    // the housing the handle flares into, with a hump over the nut pocket on the shank side
    const hs = new THREE.Shape(), b0 = ht / S;
    hs.moveTo(-b0, -0.012); hs.lineTo(b0, -0.012); hs.lineTo(b0, 0); hs.lineTo(0.052, 0.08); hs.lineTo(0.056, 0.11); hs.lineTo(-0.014, 0.112);
    hs.lineTo(-0.024, 0.134); hs.quadraticCurveTo(-0.046, 0.15, -0.066, 0.133); hs.quadraticCurveTo(-0.076, 0.12, -0.072, 0.095);
    hs.lineTo(-0.066, 0.058); hs.lineTo(-0.017, 0.056); hs.lineTo(-0.017, 0.017); hs.lineTo(-b0, 0.011); hs.lineTo(-b0, -0.012);
    slab(hd, hs, 0.03, MM.wrenchRed, 0, 0.0015);
    // the heel jaw: a steel insert across the top of the housing, its teeth raking toward the opening, and its rivet
    const heel = new THREE.Shape(), p = 0.0082 * k; heel.moveTo(-0.016, 0.085); heel.lineTo(0.058, 0.085); heel.lineTo(0.058, 0.118);
    for (let x = 0.058; x - p >= -0.0162; x -= p) { heel.lineTo(x - p * 0.3, 0.118 + 0.008 * k); heel.lineTo(x - p, 0.118); }
    heel.lineTo(-0.016, 0.118); heel.lineTo(-0.016, 0.085);
    slab(hd, heel, 0.035, MM.jawSteel, 0);
    vcyl(hd, 0.0048, 0.0048, 0.038, MM.wornSteel, 0.095, 10, 0.04, 0).rotation.x = Math.PI / 2;
    // the hook jaw, forged: the shank up the back through the nut, bending over into the jaw arm. Its pivot is the nut,
    // so the heavy jaw grows from there
    const hook = new THREE.Group(); hook.position.set(-0.045, 0.037, 0); hook.scale.setScalar(k); hd.add(hook);
    const H = (x, y) => [x + 0.045, y - 0.037], hk = new THREE.Shape(), mv = (f, x, y) => hk[f](...H(x, y));
    mv('moveTo', -0.056, -0.04); mv('lineTo', -0.034, -0.04); mv('lineTo', -0.034, 0.148); mv('lineTo', -0.024, 0.167); mv('lineTo', 0.054, 0.167); mv('lineTo', 0.063, 0.175); mv('lineTo', 0.063, 0.191);
    hk.quadraticCurveTo(...H(0.061, 0.202), ...H(0.05, 0.203)); mv('lineTo', -0.03, 0.207); hk.quadraticCurveTo(...H(-0.059, 0.208), ...H(-0.058, 0.178)); mv('lineTo', -0.056, -0.04);
    slab(hook, hk, 0.024, MM.forged, 0, 0.0015);
    const ins = new THREE.Shape(); ins.moveTo(...H(-0.022, 0.172)); ins.lineTo(...H(0.06, 0.172)); ins.lineTo(...H(0.06, 0.161));
    for (let x = 0.06; x - 0.0082 >= -0.0222; x -= 0.0082) { ins.lineTo(...H(x - 0.0082 * 0.3, 0.153)); ins.lineTo(...H(x - 0.0082, 0.161)); }
    ins.lineTo(...H(-0.022, 0.161)); ins.lineTo(...H(-0.022, 0.172));
    slab(hook, ins, 0.029, MM.jawSteel, 0);
    // the threaded length of the shank below the nut: bright machined steel with its rack of teeth down the back
    box(hook, 0.0255, 0.06, 0.0275, MM.wornSteel, 0, -0.047, 0);
    for (let t = 0; t < 6; t++) box(hook, 0.005, 0.0045, 0.025, MM.jawSteel, -0.0148, -0.072 + t * 0.0094, 0);
    // the knurled nut: two ribbed bands with a groove between, sitting in the pocket round the shank
    for (const [yy, h] of [[0.02, 0.0145], [0.0385, 0.0145]]) { const n = slab(hd, NUT_KNURL, h, MM.nut, 0); n.rotation.x = -Math.PI / 2; n.position.set(-0.045, yy + h / 2, 0); }
    vcyl(hd, 0.0215, 0.0215, 0.0045, MM.iron, 0.0368, 16, -0.045, 0);
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
    const L = lvAt(m, 'folded', KATANA_L), n = 6, seg = L / n, steel = m.folded ? MM.hamon : GM.blade;
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
    const spL = lvAt(m, 'spikes', [0, 1, 1.25, 1.5]);   // the spikes stand out further with each level
    if (m.spikes) [[0.075, 0, 0, -Math.PI / 2], [-0.075, 0, 0, Math.PI / 2], [0, 0.075, 0, 0], [0, 0.04, 0.06, 0]].forEach(([x, y, z, rz]) => {
      const sp = new THREE.Group(); sp.position.set(x, y, z); sp.rotation.z = rz; sp.scale.set(1, spL, 1); head.add(sp);
      box(sp, 0.022, 0.08, 0.022, MM.rust, 0, 0.04, 0); box(sp, 0.04, 0.012, 0.03, MM.rust, 0, 0.01, 0);   // railroad spike, welded on by its head
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), MM.rust); t.position.y = 0.095; sp.add(t);
    });
  },
  // machete (traced: melee/melee-traced.js): an old one gone to rust, a broad blade swelling toward its clipped point
  // and ground thin to its edge, on a worn wooden handle with a ferrule at its top and a lanyard hole through its butt.
  // With its serrated spine (any level) it's a saw-backed one in black instead, its teeth along the spine and a
  // rubber handle with a finger hook, a hook at the pommel and screws through it (after SOG's SawTooth). A longer
  // blade (longblade) grows from its base
  machete(g, m) {
    const sog = !!m.serrated, T = sog ? SOG_TRACE : MACHETE_TRACE, y0 = sog ? SOG_Y0 : MACHETE_Y0;
    const s = lvAt(m, 'longblade', MACHETE_S), b = new THREE.Group(); b.position.y = y0; b.scale.set(1, s, 1); g.add(b);
    traceEdge(trace(b, T.blade, 0.006, sog ? MM.sogBlack : MM.rustBlade, 0.0004), T.blade, 0.42, 0.04);   // ground to a keen edge
    if (sog) {
      trace(g, T.hilt, 0.026, MM.sogRubber, 0.006);
      [[607, 990], [663, 990], [643, 1252]].forEach(([x, r]) => [-1, 1].forEach(sd => { const sc = vcyl(g, 0.0045, 0.0045, 0.003, MM.iron, (1110 - r) * 0.000671, 8, sd * 0.0196, -(x - 645) * 0.000671); sc.rotation.z = Math.PI / 2; }));   // the screws, both faces
    } else {
      trace(g, T.hilt, 0.024, MM.oldWood, 0.007, T.holes);
      box(g, 0.042, 0.011, 0.077, MM.rustBlade, 0, 0.098, 0.002);                    // the ferrule
    }
  },
  // fire axe (traced: melee/melee-traced.js): a wooden handle, scuffed and worn, swelling under the head, and a long
  // black rubber grip that curls into a hooked butt; on top, a red-painted head, chipped and worn, its steel bit ground
  // to a bright bevelled edge and its pick drawn out to a steel point. A steel collar under the head, the handle's wedged
  // end showing over the eye. A weighted head (weighted) is bigger about its eye
  axe(g, m) {
    trace(g, AXE_TRACE.wood, 0.024, MM.axeWood, 0.008);
    trace(g, AXE_TRACE.grip, 0.028, MM.axeGrip, 0.008);
    const hw = lvAt(m, 'weighted', [1, 1.3, 1.38, 1.46]), head = new THREE.Group(); head.position.set(0, AXE_PIVOT[1], AXE_PIVOT[0]); head.scale.setScalar(hw); g.add(head);
    trace(head, AXE_TRACE.red, 0.03, MM.axePaint, 0.002);
    taperBy(trace(head, AXE_TRACE.bit, 0.026, MM.axeSteel, 0.0006), x => mix(1, 0.05, smooth(clamp((x - 0.094) / 0.056, 0, 1))));   // ground thin to the edge
    taperBy(trace(head, AXE_TRACE.spike, 0.02, MM.axeSteel, 0.0006), x => clamp((x + 0.159) / 0.032, 0.05, 1));                      // drawn to a point
    box(head, 0.036, 0.008, 0.064, MM.iron, 0, 0.056, 0);                           // the handle's wedged end over the eye
    box(g, 0.04, 0.016, 0.08, MM.iron, 0, 0.727, 0);                                // the collar under the head
  }
};
// a traced outline (melee/melee-traced.js, [z, y] pairs) pushed out to depth d across the model (x), centred on it,
// with a bevel round its edges (rounded over in a few steps on a handle, a hair on a blade, kept from growing the
// outline much) and any holes through it
function trace(g, pts, d, mat, bev, holes) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  (holes || []).forEach(h => sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y)))));
  const geo = new THREE.ExtrudeGeometry(sh, bev ? { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: Math.min(bev, 0.0012), bevelSegments: bev > 0.004 ? 4 : 1, curveSegments: 4 } : { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(geo, mat); m.rotation.y = -Math.PI / 2; m.castShadow = true; g.add(m); return m;
}
// thinned across its width: each point's thickness times f(its z, its y)
function taperBy(m, f) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * f(p.getX(i), p.getY(i))); p.needsUpdate = true; m.geometry.computeVertexNormals(); return m; }
// a blade ground from its spine (-z) to its edge (+z): full thickness to grind of the way across, then down to edge
// times it at the edge, at every height (how wide the blade is there, from its own outline)
function traceEdge(m, pts, grind, edge) {
  return taperBy(m, (z, y) => {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < pts.length; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length]; if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue; const zz = z0 + (z1 - z0) * (y - y0) / (y1 - y0); lo = Math.min(lo, zz); hi = Math.max(hi, zz); }
    if (!(hi > lo)) return 1;
    return mix(1, edge, smooth(clamp(((z - lo) / (hi - lo) - grind) / (1 - grind), 0, 1)));
  });
}
const GUNS = Object.assign({}, GUN_MODELS, MELEE_MODELS);
