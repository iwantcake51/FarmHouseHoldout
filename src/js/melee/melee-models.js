// Model builders for every melee weapon, and the combined GUNS builder table.

import { clamp, mix, smooth } from '../core/math.js';
import { lam } from '../core/shaders.js';
import { box, simplifyLine } from '../core/geometry.js';
import { GM } from '../weapons/gun-materials.js';
import { GUN_MODELS } from '../weapons/gun-models.js';
import { AXE_PIVOT, AXE_TRACE, SOG_TRACE, SOG_Y0 } from './melee-traced.js';

// Melee models are built handle-down along +y in the right fist: the fist sits at the origin, the business end runs up +y,
// and the leading edge (the axe bit, the blade's edge, the wrench jaw) faces +z. Lengths match MLEN in melee/swing-trail.js.
const MM = {
  ash: lam(0xb08a5c), ashDark: lam(0x8a6a44), hickory: lam(0x9a7448), grain: lam(0x6e5234), tapeBlk: lam(0x1c1b1a), tapeRib: lam(0x2c2a28),
  redPaint: lam(0x9e2a1e), redDark: lam(0x6e1c14), wornSteel: lam(0x9aa0a4), edge: lam(0xe4e8eb), iron: lam(0x34363a), rust: lam(0x7a4228),
  wrenchRed: lam(0xc2261a), forged: lam(0x2a2c30), jawSteel: lam(0xb2b6ba), nut: lam(0x1c1d20), label: lam(0xd8b070), labelRed: lam(0xb8301e),
  ito: lam(0x1e2430), samegawa: lam(0xd8d2c0), gold: lam(0xc8a24a), hamon: lam(0xf2f4f6), saya: lam(0x2a1a14), scale: lam(0x5a3a22), rivet: lam(0xc0a060)
};
// the traced weapons' flat colours: the fire axe's handle wood, its black rubber grip, red paint and bright steel, and
// the machete's black rubber and black coating
Object.assign(MM, { axeWood: lam(0x8a5a3c), axeGrip: lam(0x2a2724),
  axePaint: lam(0xb0261c), axeSteel: lam(0xc4c8cc), sogRubber: lam(0x2e2f32), sogBlack: lam(0x1c1d20) });
// a cylinder standing along +y (radius at its top, radius at its bottom), centred at height y
function vcyl(g, rTop, rBot, len, mat, y, seg, x, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg || 10), mat); m.position.set(x || 0, y, z || 0); m.castShadow = true; g.add(m); return m; }
// a mod's level on this model (0 without it) picked out of a table indexed by level: improving a mod at the workbench
// grows the part it adds (a longer blade, more nails, a bigger jaw), so level III looks bigger than level II
const lvAt = (m, k, t) => t[Math.min(t.length - 1, m[k] === true ? 1 : m[k] || 0)];
// the machete's blade length by long-blade level (also what its swing trail stretches by, melee/swing-trail.js)
export const MACHETE_S = [1, 1.12, 1.2, 1.28], KATANA_L = [0.78, 0.92, 1.0, 1.08];
// the katana's blade: its curve over its length (radians), its width at the habaki and at the tip, how far its kissaki
// runs on past that, and how many points along it its outline's drawn through
const KATANA_BLADE = { curve: 0.21, w0: 0.044, w1: 0.032, tip: 0.075, n: 24 }, KATANA_GRIP = 0.085;
// grip tape: a sleeve with raised ridges, from y0 to y1
function gripWrap(g, r, y0, y1, n) { vcyl(g, r, r, y1 - y0, MM.tapeBlk, (y0 + y1) / 2, 10); for (let k = 0; k <= n; k++) vcyl(g, r + 0.003, r + 0.003, 0.008, MM.tapeRib, y0 + (y1 - y0) * k / n, 10); }
// a flat outline (in x, y) pushed out to depth d along z and centred on z0, with an optional soft bevel round its edges
function slab(g, shape, d, mat, z0, bev) {
  const geo = new THREE.ExtrudeGeometry(shape, bev ? { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 10 } : { depth: d, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, (z0 || 0) - d / 2); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m;
}
const DISC_M = new THREE.CylinderGeometry(1, 1, 1, 16);
// the crowbar's bar: the line it's bent along (the pry foot at the bottom, up the shaft, over the gooseneck and down
// toward the claw), its hex section's radius, and where its paint stops at each end
const CROW_PATH = [[-0.128, -0.043], [-0.112, -0.016], [-0.085, 0], [0, 0], [0.52, 0], [0.575, 0.005], [0.616, 0.024], [0.64, 0.056], [0.64, 0.092], [0.622, 0.118], [0.594, 0.13]];
const CROW_R = 0.0165, CROW_STEEL = [0.06, 0.84], CROW_RED = new THREE.Color(0xa8291c), CROW_SHINE = new THREE.Color(0x868c90);
let crowGeo = null, CROW_M = null;
function CROW_GEO() {
  if (crowGeo) return crowGeo;
  const T = 120, R = 6, g = crowGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(CROW_PATH.map(([y, z]) => new THREE.Vector3(0, y, z)), false, 'centripetal'), T, CROW_R, R, false);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const u = Math.floor(i / (R + 1)) / T, k = Math.min(1, Math.max(0, Math.min((u - CROW_STEEL[0]) / 0.02, (CROW_STEEL[1] - u) / 0.02))); c.copy(CROW_SHINE).lerp(CROW_RED, k); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// the bat's turned outline, [radius, height] from the knob up to the end, run through a smooth curve and turned all the
// way round (one piece, so no seams or bands up it); and its radius at any height, for what's put on it
const BAT_PROFILE = [[0, -0.122], [0.036, -0.121], [0.046, -0.112], [0.047, -0.1], [0.04, -0.091], [0.027, -0.084], [0.0235, -0.07], [0.0232, 0.05], [0.024, 0.18],
  [0.028, 0.27], [0.036, 0.36], [0.047, 0.45], [0.058, 0.54], [0.065, 0.62], [0.068, 0.72], [0.068, 0.83], [0.066, 0.858], [0.06, 0.88], [0.048, 0.896], [0.03, 0.905], [0, 0.908]];
let batGeo = null;
// (the curve's points taken finely, then only those its bends need kept, BAT_TOL metres: the barrel and the handle are
// near enough straight that a few do, the knob and the end take the most)
const BAT_TOL = 0.00012;
const BAT_GEO = () => batGeo || (batGeo = new THREE.LatheGeometry(simplifyLine(new THREE.SplineCurve(BAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(240), BAT_TOL), 32));
function batR(y) { for (let k = 1; k < BAT_PROFILE.length; k++) { const [r1, y1] = BAT_PROFILE[k], [r0, y0] = BAT_PROFILE[k - 1]; if (y <= y1) return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); } return 0; }
// a nail: a thin round shank (stretched to length along y), its flat round head and a sharp point
const NAIL_SHANK = new THREE.CylinderGeometry(0.0034, 0.0034, 1, 8), NAIL_HEAD = new THREE.CylinderGeometry(0.0095, 0.0095, 0.0022, 14), NAIL_TIP = new THREE.ConeGeometry(0.0034, 0.012, 8);
// a knurled nut's outline: a ring of fine ribs (radius 0.025), to be extruded along the nut's axis
const NUT_KNURL = (() => { const s = new THREE.Shape(), n = 30; for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? 0.0236 : 0.0256; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return s; })();
const MELEE_MODELS = {
  // ash baseball bat: one smooth turned piece (BAT_PROFILE: the knob, the handle, the long taper, the barrel and its
  // domed end), a taped handle; nails driven right through the barrel, round heads on the wood and their points out the
  // far side; barbed wire wound up it, two strands twisted, barbs every few centimetres
  bat(g, m) {
    const body = new THREE.Mesh(BAT_GEO(), MM.ash); body.castShadow = true; g.add(body);
    gripWrap(g, 0.027, -0.085, 0.12, 6);
    for (let k = 0, n = lvAt(m, 'nails', [0, 14, 20, 26]); k < n; k++) {
      const a = k * 2.39, y = 0.6 + (k % 5) * 0.055 + (k % 2) * 0.012, r = batR(y), nl = new THREE.Group(); nl.position.y = y; nl.rotation.y = -a; g.add(nl);
      const L = 2 * r + 0.05, sh = new THREE.Mesh(NAIL_SHANK, GM.nail); sh.scale.set(1, L, 1); sh.rotation.z = -Math.PI / 2; sh.position.x = -r + L / 2; nl.add(sh);
      const hd = new THREE.Mesh(NAIL_HEAD, GM.nail); hd.rotation.z = Math.PI / 2; hd.position.x = -r - 0.0008; nl.add(hd);
      const tp = new THREE.Mesh(NAIL_TIP, GM.nail); tp.rotation.z = -Math.PI / 2; tp.position.x = -r + L + 0.006; nl.add(tp);
    }
    const turns = lvAt(m, 'wire', [0, 4, 5, 6]);
    if (turns) {
      const y0 = 0.58, y1 = 0.86, at = (u, ph, out) => { const y = y0 + (y1 - y0) * u, an = u * turns * Math.PI * 2, rr = batR(y) + 0.0045 + out, tw = u * turns * 26 + ph;
        return new THREE.Vector3(Math.cos(an) * rr + Math.cos(an) * 0.0016 * Math.cos(tw), y + 0.0016 * Math.sin(tw), Math.sin(an) * rr + Math.sin(an) * 0.0016 * Math.cos(tw)); };
      [0, Math.PI].forEach(ph => { const pts = []; for (let k = 0; k <= turns * 40; k++) pts.push(at(k / (turns * 40), ph, 0)); const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 90, 0.0016, 5), GM.wire); t.castShadow = true; g.add(t); });
      for (let b = 0, nb = turns * 7; b < nb; b++) {   // a barb: two short wires wrapped round the strands, their ends cut sharp and sticking out
        const u = (b + 0.5) / nb, p = at(u, 0, 0), an = u * turns * Math.PI * 2;
        [0.7, -0.7].forEach(tl => { const w = new THREE.Mesh(NAIL_SHANK, GM.wire); w.scale.set(0.45, 0.026, 0.45); w.position.copy(p); w.rotation.set(0, -an, Math.PI / 2 + tl, 'YZX'); g.add(w); });
      }
    }
  },
  // crowbar: red-painted hex bar, a gooseneck claw over the top and a flattened pry end below the fist, steel worn bright at both ends
  crowbar(g, m) {
    // one hex bar bent along CROW_PATH: the pry end's short foot, the long shaft, the gooseneck over the top; red paint
    // over the middle, bare steel worn bright at both working ends (CROW_STEEL: how far along the bar)
    const body = new THREE.Mesh(CROW_GEO(), CROW_M || (CROW_M = lam(0xffffff, { vertexColors: true }))); body.castShadow = true; g.add(body);
    // the claw: the bar's end flattened out wide and split down the middle into two prongs, carrying on round the curl
    // (seated on the bar's very end, along the way it comes off the curl, CROW_PATH's last bend: the bar's end capped
    // round, and the claw's root a little into it, so the bar runs straight into the flattened claw with no gap)
    const [e1, e0] = [CROW_PATH[CROW_PATH.length - 1], CROW_PATH[CROW_PATH.length - 2]], dl = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), dy = (e1[0] - e0[0]) / dl, dz = (e1[1] - e0[1]) / dl;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(CROW_R, 8, 6), MM.wornSteel); cap.position.set(0, e1[0], e1[1]); g.add(cap);
    const cl = new THREE.Group(); cl.position.set(0, e1[0] + dy * 0.008, e1[1] + dz * 0.008); cl.rotation.x = Math.atan2(-dz, -dy); g.add(cl);
    box(cl, 0.03, 0.03, 0.011, MM.wornSteel, 0, 0.0, 0); box(cl, 0.028, 0.02, 0.022, MM.wornSteel, 0, 0.012, 0);   // (and the taper from the round bar down to the flat)
    [-1, 1].forEach(e => { const pr = box(cl, 0.011, 0.04, 0.008, MM.wornSteel, e * 0.0085, -0.032, -0.001); pr.rotation.z = e * 0.06; const tp = box(cl, 0.009, 0.012, 0.0045, MM.edge, e * 0.0098, -0.056, -0.002); tp.rotation.z = e * 0.06; });
    // the pry end: the foot flattened to a chisel edge with a nail slot in it
    const pr = new THREE.Group(); pr.position.set(0, -0.128, -0.043); pr.rotation.x = 1.05; g.add(pr);
    [-1, 1].forEach(e => box(pr, 0.011, 0.024, 0.006, MM.wornSteel, e * 0.0075, -0.006, 0)); box(pr, 0.008, 0.018, 0.003, MM.edge, 0, -0.018, 0.0012).visible = false;
    if (m.tape) { const lv = lvAt(m, 'tape', [0, 1, 2, 3]); gripWrap(g, 0.021 + 0.002 * lv, -0.06, 0.08 + 0.07 * lv, 5 + 2 * lv); }   // longer and thicker with each level
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
  // katana: a wrapped handle with diamond ito and a gold menuki, a round tsuba and brass habaki, then a curved blade in
  // one piece with a dark spine, a bright hamon and an edge along it, ending in a sharp kissaki
  katana(g, m) {
    box(g, 0.03, 0.29, 0.038, MM.samegawa, 0, 0.005, 0);                     // ray-skin under the wrap
    for (let k = 0; k < 6; k++) [-1, 1].forEach(sd => { const d = box(g, 0.032, 0.03, 0.03, MM.ito, 0, -0.115 + k * 0.046, 0); d.rotation.y = Math.PI / 4 * sd; d.scale.set(1, 1, 0.6); });   // diamond wrap
    box(g, 0.034, 0.022, 0.044, MM.iron, 0, -0.15, 0);                       // kashira (pommel cap)
    box(g, 0.012, 0.03, 0.012, MM.gold, 0, 0.03, 0.021);                     // menuki
    const tsuba = vcyl(g, 0.052, 0.052, 0.012, MM.iron, 0.162, 14); vcyl(tsuba, 0.046, 0.046, 0.014, GM.brass, 0, 14).scale.set(1, 0.3, 1);
    box(g, 0.016, 0.03, 0.05, GM.brass, 0, 0.185, 0.004);                    // habaki
    const L = lvAt(m, 'folded', KATANA_L), steel = m.folded ? MM.hamon : GM.blade;
    // the blade in one piece: its curve, its taper and its tip all smooth (KATANA_BLADE), the dark spine, the bright
    // hamon and the edge each one strip along the whole of it rather than short segments with gaps at their joints
    // (its centre line bends back toward the spine, -z, by K.curve radians over its length; a: across it, -1 the spine
    // to 1 the edge)
    const K = KATANA_BLADE, ps = s => K.curve * s / L;
    const pt = (s, a) => { const p = ps(s), w = K.w0 + (K.w1 - K.w0) * s / L; return [0.004 - K.curve * s * s / (2 * L) + Math.cos(p) * a * w / 2, 0.2 + s + Math.sin(p) * a * w / 2]; };
    const strip = (a0, a1, t, mat, tip) => {   // a band from a0 to a1 across it, t thick
      const sh = new THREE.Shape(), n = K.n;
      for (let i = 0; i <= n; i++) { const [x, y] = pt(L * i / n, a0); i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
      if (tip) {   // the kissaki: the spine runs on nearly straight, the edge sweeps up to meet it in a point near the spine
        const p = ps(L), tx = -Math.sin(p), ty = Math.cos(p), nx = Math.cos(p), ny = Math.sin(p), [sx, sy] = pt(L, -1), [ex, ey] = pt(L, 1), w = K.w1;
        const qx = sx + tx * K.tip + nx * w * 0.18, qy = sy + ty * K.tip + ny * w * 0.18;
        sh.lineTo(qx, qy); sh.quadraticCurveTo(ex + tx * K.tip * 0.8, ey + ty * K.tip * 0.8, ex, ey);
      } else { const [x, y] = pt(L, a1); sh.lineTo(x, y); }
      for (let i = tip ? n - 1 : n; i >= 0; i--) { const [x, y] = pt(L * i / n, a1); sh.lineTo(x, y); }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 10 }); geo.rotateY(-Math.PI / 2); geo.translate(t / 2, 0, 0);
      const mh = new THREE.Mesh(geo, mat); mh.castShadow = true; g.add(mh); return mh;
    };
    // (the blade itself stops just inside the spine and the edge, which are each their own strip: laid on the same
    // outline, their sides and the blade's were the same faces and flickered through each other along the back)
    strip(-0.96, 0.95, 0.01, steel, true);              // the blade
    strip(-1, -0.64, 0.012, GM.metal2, false);          // its spine
    strip(0.42, 0.86, 0.0106, MM.hamon, false);         // the hamon line
    strip(0.86, 1, 0.0062, MM.edge, false);             // the edge
    // (held in the fist KATANA_GRIP lower than it's drawn: the right hand just under the tsuba, the left at the end of
    // the handle by the kashira, player/hold.js MELEE_LH, both on the wrap and neither on the guard or the blade)
    g.children.forEach(c => { c.position.y -= KATANA_GRIP; });
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
  // machete (traced: melee/melee-traced.js): a black one (after SOG's SawTooth), its broad blade swelling toward a
  // clipped point and ground thin to its edge, on a rubber handle with a finger hook, a hook at the pommel and screws
  // through it. Its spine is plain (sogPlain) till it's given its serrated spine (any level), when the saw teeth are
  // cut along it; nothing else about it changes. A longer blade (longblade) grows from its base
  machete(g, m) {
    const T = SOG_TRACE, blade = m.serrated ? T.blade : sogPlain();
    const s = lvAt(m, 'longblade', MACHETE_S), b = new THREE.Group(); b.position.y = SOG_Y0; b.scale.set(1, s, 1); g.add(b);
    traceEdge(trace(b, blade, 0.006, MM.sogBlack, 0.0004), blade, 0.42, 0.04);   // ground to a keen edge
    trace(g, T.hilt, 0.026, MM.sogRubber, 0.006);
    [[607, 990], [663, 990], [643, 1252]].forEach(([x, r]) => [-1, 1].forEach(sd => { const sc = vcyl(g, 0.0045, 0.0045, 0.003, MM.iron, (1110 - r) * 0.000671, 8, sd * 0.0196, -(x - 645) * 0.000671); sc.rotation.z = Math.PI / 2; }));   // the screws, both faces
  },
  // fire axe (traced: melee/melee-traced.js): a wooden handle, scuffed and worn, swelling under the head, and a long
  // black rubber grip that curls into a hooked butt; on top, a red-painted head, chipped and worn, its steel bit ground
  // to a bright bevelled edge and its pick drawn out to a steel point. A steel collar under the head, the handle's wedged
  // end showing over the eye. A weighted head (weighted) is bigger about its eye
  axe(g, m) {
    trace(g, axeShaft(), 0.024, MM.axeWood, 0.008);
    trace(g, AXE_TRACE.grip, 0.028, MM.axeGrip, 0.008);
    axeWear(g);
    const hw = lvAt(m, 'weighted', [1, 1.3, 1.38, 1.46]), head = new THREE.Group(); head.position.set(0, AXE_PIVOT[1], AXE_PIVOT[0]); head.scale.setScalar(hw); g.add(head);
    trace(head, AXE_TRACE.red, 0.03, MM.axePaint, 0.002);
    axeChips(head);
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
// the machete's blade with a plain spine: its traced outline (SOG_TRACE.blade) with the saw teeth along the spine
// (everything between SOG_TEETH's heights, behind the blade) taken out, the spine run straight along the roots of the
// teeth, where the blade itself stops
const SOG_TEETH = [0.088, 0.5068];
let SOG_PLAIN = null;
function sogPlain() {
  if (SOG_PLAIN) return SOG_PLAIN;
  const B = SOG_TRACE.blade, isTooth = ([z, y]) => z < 0 && y >= SOG_TEETH[0] && y <= SOG_TEETH[1];
  const teeth = B.filter(isTooth), keep = B.filter(p => !isTooth(p)), at = keep.findLastIndex(([z, y]) => z < 0 && y > SOG_TEETH[1]);
  // the root of the teeth: at each height, the nearest any of them comes to the blade's middle; then evened out
  const n = 16, root = [];
  for (let k = 0; k <= n; k++) {
    const y = SOG_TEETH[1] - (SOG_TEETH[1] - SOG_TEETH[0]) * k / n;
    let z = -1; for (const [tz, ty] of teeth) if (Math.abs(ty - y) < 0.012) z = Math.max(z, tz);
    root.push([z, y]);
  }
  for (let q = 0; q < 2; q++) for (let k = 1; k < n; k++) root[k][0] = (root[k - 1][0] + 2 * root[k][0] + root[k + 1][0]) / 4;
  return (SOG_PLAIN = keep.slice(0, at + 1).concat(root, keep.slice(at + 1)));
}
// where a traced outline crosses height y: its front and back edges [lo, hi] (null if it doesn't reach)
function spanAt(pts, y) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < pts.length; i++) { const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length]; if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue; const zz = z0 + (z1 - z0) * (y - y0) / (y1 - y0); lo = Math.min(lo, zz); hi = Math.max(hi, zz); }
  return hi > lo ? [lo, hi] : null;
}
// the axe's wooden shaft, from its traced outline: both edges evened out (the photo's lumps gone) and carried on
// straight down into the grip at the grip's own width, so the two meet without the pinch their rounded ends made
let AXE_SHAFT = null;
function axeShaft() {
  if (AXE_SHAFT) return AXE_SHAFT;
  const W = AXE_TRACE.wood, G = AXE_TRACE.grip, y0 = 0.33, y1 = 0.718, from = 0.405, n = 34, L = [], R = [];
  const gTop = spanAt(G, 0.35), wLow = spanAt(W, from);
  for (let k = 0; k <= n; k++) {
    const y = y0 + (y1 - y0) * k / n;
    let e = y >= from ? spanAt(W, y) : null;
    if (!e) { const t = smooth(clamp((y - 0.35) / (from - 0.35), 0, 1)); e = [mix(gTop[0], wLow[0], t), mix(gTop[1], wLow[1], t)]; }
    L.push([e[0], y]); R.push([e[1], y]);
  }
  const even = A => A.map((p, k) => k === 0 || k === A.length - 1 ? p : [(A[k - 1][0] + 2 * p[0] + A[k + 1][0]) / 4, p[1]]);
  let l = L, r = R; for (let q = 0; q < 3; q++) { l = even(l); r = even(r); }
  return (AXE_SHAFT = l.concat(r.reverse()));
}
// what years of use leave on it: grain running up both faces of the wood, and the
// rubber grip's moulded ridges round it, every GRIP_RIB up its length
const GRIP_RIB = 0.036, AXE_GRAIN = lam(0x6a4128), AXE_RIB = lam(0x1d1b19);
function axeWear(g) {
  const W = axeShaft(), r = mulberryish(41);
  for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) {
    const y = 0.4 + r() * 0.28, len = 0.06 + r() * 0.14, e = spanAt(W, y); if (!e) continue;
    const z = mix(e[0] + 0.008, e[1] - 0.008, r()), m = box(g, 0.001, len, 0.0022, AXE_GRAIN, sd * 0.0201, y, z); m.rotation.x = (r() - 0.5) * 0.06;
  }
  for (let y = -0.08; y < 0.34; y += GRIP_RIB) {
    const e = spanAt(AXE_TRACE.grip, y); if (!e) continue;
    box(g, 0.045, 0.003, e[1] - e[0] + 0.002, AXE_RIB, 0, y, (e[0] + e[1]) / 2);
  }
}
// the head's red paint worn through to the steel in chips and along its edges, both faces, and the line where the
// bit's grind starts
function axeChips(head) {
  const R = AXE_TRACE.red, r = mulberryish(7), inside = (z, y) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [zi, yi] = R[i], [zj, yj] = R[j]; if ((yi > y) !== (yj > y) && z < (zj - zi) * (y - yi) / (yj - yi) + zi) c = !c; } return c; };
  for (const sd of [-1, 1]) for (let k = 0, made = 0; k < 40 && made < 6; k++) {
    const z = -0.12 + r() * 0.21, y = -0.05 + r() * 0.1, w = 0.004 + r() * 0.012, h = 0.003 + r() * 0.008;
    if (!inside(z - w, y) || !inside(z + w, y) || !inside(z, y - h) || !inside(z, y + h)) continue;
    const m = box(head, 0.001, h, w, r() < 0.35 ? MM.iron : MM.axeSteel, sd * 0.0172, y, z); m.rotation.x = (r() - 0.5) * 1.2; made++;
  }
  [-1, 1].forEach(sd => box(head, 0.001, 0.104, 0.003, MM.iron, sd * 0.0142, -0.004, 0.0905));   // the grind line
}
// a little seeded random, so the wear lands in the same places every time the model's built
function mulberryish(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
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
export const GUNS = Object.assign({}, GUN_MODELS, MELEE_MODELS);
