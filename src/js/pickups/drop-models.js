// Drop models: what each pickup looks like lying (hovering) on the ground. Each is a few bold shapes that carry its
// outline and x-ray rim, with the small detail on them (labels, rounds, rivets, seams, stencils) gathered up and
// merged into one mesh at the end (userData.fine: outlines skip it).

import { lam } from '../core/shaders.js';
import { box, mergeInto } from '../core/geometry.js';
import { M } from '../world/materials.js';
import { WEAP } from '../weapons/gun-stats.js';
import { crateModel } from '../stations/supply-drop.js';

const DM = {
  white: lam(0xe9e4d6), red: lam(0xb3261c), grey: lam(0x8c9197), steel: lam(0xa7adb3), dark: lam(0x2d2f32), black: lam(0x18191b),
  rust: lam(0x8b4f2e), rust2: lam(0x6b3a22), brass: lam(0xc9a043), copper: lam(0xb0663a), lead: lam(0x8d8f93),
  card9: lam(0x37536b), label: lam(0xe8e2cf), cardM: lam(0x7a2420), gold: lam(0xd8b24a), shellBox: lam(0x2f4a2e), orange: lam(0xd8742c),
  hull: lam(0xa8302a), hullD: lam(0x7d211c), can: lam(0x4f5838), canD: lam(0x3d4430), stencil: lam(0xd9c25a),
  teal: lam(0x2f8f86), tealD: lam(0x1f6159), rope: lam(0x9c8358), gauze: lam(0xf2efe6), olive: lam(0x56603f), oliveD: lam(0x434b31)
};
// a box (turned ry about y, then rx, rz) and a cylinder standing on y (laid over by rx or rz)
function dmBox(g, w, h, d, mat, x, y, z, ry, rx, rz) { const m = box(g, w, h, d, mat, x, y, z); if (ry || rx || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); return m; }
function dmCyl(g, r, h, mat, x, y, z, seg, rx, rz) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 12), mat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = true; g.add(m); return m; }
// a round stood on its base at (x, y, z): its case and a nose (a cone, or a flat lead one for a magnum)
function dmRound(g, x, y, z, r, len, nose, flat) {
  dmCyl(g, r, len * 0.62, DM.brass, x, y + len * 0.31, z, 8);
  if (flat) dmCyl(g, r * 0.95, len * 0.3, nose, x, y + len * 0.77, z, 8);
  else { const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.96, len * 0.38, 8), nose); c.position.set(x, y + len * 0.81, z); g.add(c); }
}
// ... or laid on its side along ry
function dmRoundFlat(g, x, y, z, r, len, nose, ry) {
  const h = new THREE.Group(); h.position.set(x, y, z); h.rotation.set(0, ry || 0, -Math.PI / 2); g.add(h); dmRound(h, 0, -len / 2, 0, r, len, nose); return h;
}
// everything under g but the bold pieces (keep) merged into one mesh
function dmFinish(g, keep) {
  const list = []; g.traverse(o => { if (o.isMesh && !keep.has(o)) list.push(o); });
  mergeInto(g, list);
}

// ---- planks: three boards strapped together with twine, two side by side and one across them; their end grain and
// a couple of nail heads, and a line of grain down each
function dmPlanks(g) {
  const keep = new Set();
  [[0.78, -0.072, 0.18, M.board, 0.08], [0.74, 0.072, 0.18, M.board2, -0.04], [0.8, 0, 0.237, M.board, 0.62]].forEach(([L, z, y, mat, ry]) => {
    const b = new THREE.Group(); b.position.set(0, y, z); b.rotation.y = ry; g.add(b);
    keep.add(dmBox(b, L, 0.055, 0.13, mat, 0, 0, 0));
    const dk = lam(mat.color.clone().multiplyScalar(0.7).getHex());
    [-1, 1].forEach(s => dmBox(b, 0.006, 0.056, 0.131, dk, s * L / 2, 0, 0));                       // end grain
    dmBox(b, L * 0.8, 0.002, 0.006, dk, -0.02, 0.028, 0.025); dmBox(b, L * 0.6, 0.002, 0.006, dk, 0.05, 0.028, -0.03);   // grain
    [-1, 1].forEach(s => dmCyl(b, 0.008, 0.004, DM.dark, s * (L / 2 - 0.05), 0.029, 0.03 * s, 8));    // nail heads
  });
  // the twine round the two under the top board
  [-0.24, 0.24].forEach(x => {
    dmBox(g, 0.025, 0.006, 0.3, DM.rope, x, 0.213, 0); dmBox(g, 0.025, 0.006, 0.3, DM.rope, x, 0.147, 0);
    [-1, 1].forEach(s => dmBox(g, 0.025, 0.07, 0.006, DM.rope, x, 0.18, s * 0.149));
  });
  dmFinish(g, keep);
}
// ---- metal (once there's a metalwork bench): a short length of I-beam with two bars of rebar and an offcut of plate
// across it, wired together
function dmMetal(g) {
  const keep = new Set(), st = lam(0x8d949b), dk = lam(0x4a4f55), rust = lam(0x6e4a34), wire = lam(0x9a9488);
  // the I-beam: two flanges and the web between them, lying on a flange
  keep.add(dmBox(g, 0.62, 0.016, 0.16, st, 0, 0.13, 0)); keep.add(dmBox(g, 0.62, 0.016, 0.16, st, 0, 0.28, 0)); keep.add(dmBox(g, 0.62, 0.14, 0.018, st, 0, 0.205, 0));
  [-1, 1].forEach(s => dmBox(g, 0.004, 0.166, 0.162, dk, s * 0.31, 0.205, 0));   // the cut ends, darker
  // the rebar and the plate on top of it
  [-0.035, 0.035].forEach((z, k) => { const m = dmCyl(g, 0.012, 0.7, rust, 0.02 * k, 0.3, z, 8, 0, Math.PI / 2); m.rotation.z = Math.PI / 2; m.rotation.y = (k ? 1 : -1) * 0.12; });
  keep.add(dmBox(g, 0.26, 0.012, 0.2, lam(0x9aa0a6), -0.12, 0.32, 0.01, 0.35));
  [-0.2, 0.2].forEach(x => { dmBox(g, 0.012, 0.012, 0.19, wire, x, 0.338, 0); [-1, 1].forEach(s => dmBox(g, 0.012, 0.2, 0.006, wire, x, 0.24, s * 0.092)); });
  dmFinish(g, keep);
}
// ---- the medkit: a white first-aid case, its lid's seam round its middle, a red cross on the lid and the front, a
// black carry handle and two latches; a rolled bandage beside it with its tail unrolled
function dmMed(g) {
  const keep = new Set(), W = 0.34, H = 0.18, D = 0.24, y = 0.26, top = y + H / 2;
  keep.add(dmBox(g, W, H, D, DM.white, 0, y, 0));
  dmBox(g, W + 0.006, 0.014, D + 0.006, DM.grey, 0, y + 0.03, 0);                                   // the lid's seam
  dmBox(g, 0.15, 0.006, 0.045, DM.red, 0, top + 0.003, 0); dmBox(g, 0.045, 0.006, 0.15, DM.red, 0, top + 0.003, 0);   // the cross on the lid
  dmBox(g, 0.11, 0.035, 0.006, DM.red, 0, y - 0.02, D / 2 + 0.003); dmBox(g, 0.035, 0.09, 0.006, DM.red, 0, y - 0.02, D / 2 + 0.003);   // and the front
  [-0.05, 0.05].forEach(x => dmBox(g, 0.02, 0.028, 0.022, DM.black, x, top + 0.014, -0.06)); dmBox(g, 0.13, 0.018, 0.026, DM.black, 0, top + 0.03, -0.06);   // the handle
  [-0.11, 0.11].forEach(x => dmBox(g, 0.03, 0.04, 0.012, DM.dark, x, y + 0.03, D / 2 + 0.006));    // latches
  keep.add(dmCyl(g, 0.055, 0.1, DM.gauze, 0.25, 0.21, 0.07, 14, 0, Math.PI / 2));                  // the bandage roll
  dmCyl(g, 0.022, 0.102, DM.grey, 0.25, 0.21, 0.07, 10, 0, Math.PI / 2);                            // its core
  dmBox(g, 0.1, 0.004, 0.17, DM.gauze, 0.255, 0.158, 0.17, 0.25);                                    // its tail
  dmFinish(g, keep);
}
// ---- 9mm: a carton of it, blue-grey card with a cream label band, its lid flipped open at the back and the rounds
// stood in rows in their tray, copper noses up; two loose rounds beside it
function dmAmmo9(g) {
  const keep = new Set(), W = 0.28, H = 0.11, D = 0.18, y = 0.235, top = y + H / 2;
  keep.add(dmBox(g, W, H, D, DM.card9, 0, y, 0));
  dmBox(g, W + 0.004, 0.04, D + 0.004, DM.label, 0, y, 0);                                          // the label band
  const lid = new THREE.Group(); lid.position.set(0, top, -D / 2); lid.rotation.x = -1.95; g.add(lid);
  keep.add(dmBox(lid, W, 0.01, D, DM.card9, 0, 0.005, D / 2)); dmBox(lid, W * 0.6, 0.002, D * 0.4, DM.label, 0, 0.011, D / 2);
  dmBox(g, W - 0.02, 0.003, D - 0.02, DM.black, 0, top + 0.001, 0);                                  // the tray's shadow
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = -0.105 + i * 0.042, z = -0.06 + j * 0.04; dmCyl(g, 0.012, 0.012, DM.brass, x, top + 0.005, z, 8); const c = new THREE.Mesh(new THREE.ConeGeometry(0.0115, 0.02, 8), DM.copper); c.position.set(x, top + 0.02, z); g.add(c); }
  dmRoundFlat(g, 0.2, 0.192, 0.07, 0.012, 0.045, DM.copper, 0.6); dmRoundFlat(g, 0.18, 0.192, -0.05, 0.012, 0.045, DM.copper, -0.4);
  dmFinish(g, keep);
}
// ---- .357: a box of it in dark red card with a gold band, its lid knocked askew; a loaded speed loader stood beside
// it, six flat lead noses in its black ring and its knurled knob on top
function dmAmmoMag(g) {
  const keep = new Set(), y = 0.23;
  keep.add(dmBox(g, 0.2, 0.1, 0.15, DM.cardM, -0.07, y, 0)); dmBox(g, 0.204, 0.03, 0.154, DM.gold, -0.07, y, 0);
  keep.add(dmBox(g, 0.205, 0.028, 0.155, DM.cardM, -0.05, y + 0.064, 0.025, 0.35)); dmBox(g, 0.1, 0.002, 0.07, DM.gold, -0.05, y + 0.079, 0.025, 0.35);
  const sl = dmCyl(g, 0.058, 0.032, DM.black, 0.14, 0.2, 0.04, 16); keep.add(sl);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; dmRound(g, 0.14 + Math.cos(a) * 0.034, 0.215, 0.04 + Math.sin(a) * 0.034, 0.0135, 0.05, DM.lead, true); }
  dmCyl(g, 0.02, 0.03, DM.grey, 0.14, 0.235, 0.04, 12);                                              // the knob
  dmFinish(g, keep);
}
// ---- shells: a box of shotgun shells, green card with an orange label, open, the shells stood in it in two rows
// with their crimped tops showing; three more lying loose, red hulls with brass heads
function dmShells(g) {
  const keep = new Set(), y = 0.22, top = y + 0.045;
  keep.add(dmBox(g, 0.24, 0.09, 0.15, DM.shellBox, -0.04, y, -0.02)); dmBox(g, 0.244, 0.03, 0.154, DM.orange, -0.04, y - 0.005, -0.02);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const x = -0.12 + i * 0.053, z = -0.05 + j * 0.06; dmCyl(g, 0.023, 0.05, DM.hull, x, top + 0.005, z, 10); dmCyl(g, 0.016, 0.004, DM.hullD, x, top + 0.031, z, 8); }
  [[0.14, 0.2, 0.08, 0.3], [0.12, 0.2, -0.09, -0.5], [0.04, 0.2, 0.14, 1.2]].forEach(([x, yy, z, ry]) => {
    const s = new THREE.Group(); s.position.set(x, yy, z); s.rotation.set(0, ry, Math.PI / 2); g.add(s);
    keep.add(dmCyl(s, 0.025, 0.11, DM.hull, 0, 0.01, 0, 12)); dmCyl(s, 0.0265, 0.03, DM.brass, 0, -0.055, 0, 12); dmCyl(s, 0.017, 0.004, DM.hullD, 0, 0.066, 0, 8);
  });
  dmFinish(g, keep);
}
// ---- rifle: a .30 ammo can, olive drab steel, its lid's rim proud of it, the latch at one end and the carry handle
// folded flat on top, a yellow stencil band; a stripper clip of five rounds lying on the lid
function dmAmmoRifle(g) {
  const keep = new Set(), W = 0.28, H = 0.16, D = 0.13, y = 0.25, top = y + H / 2;
  keep.add(dmBox(g, W, H, D, DM.can, 0, y, 0));
  dmBox(g, W + 0.012, 0.026, D + 0.012, DM.canD, 0, top - 0.012, 0);                                 // the lid's rim
  dmBox(g, 0.022, 0.07, 0.06, DM.canD, W / 2 + 0.01, top - 0.04, 0);                                 // the latch
  dmBox(g, 0.15, 0.012, 0.022, DM.black, 0, top + 0.007, -0.02); [-0.07, 0.07].forEach(x => dmBox(g, 0.014, 0.014, 0.03, DM.black, x, top + 0.006, -0.02));   // the handle
  dmBox(g, 0.18, 0.024, 0.003, DM.stencil, -0.02, y - 0.01, D / 2 + 0.002); dmBox(g, 0.06, 0.012, 0.003, DM.stencil, -0.02, y - 0.045, D / 2 + 0.002);   // the stencils
  dmBox(g, 0.13, 0.008, 0.026, DM.dark, 0.02, top + 0.018, 0.035, 0.15);                              // the clip
  for (let k = 0; k < 5; k++) dmRoundFlat(g, -0.03 + k * 0.025, top + 0.033, 0.035, 0.0115, 0.075, DM.copper, Math.PI / 2 + 0.15);
  dmFinish(g, keep);
}
// ---- the supply crate off the radio: ammo for everything, so it stands apart from a weapon's case: an open wooden
// crate painted teal, its slats and steel corners, rope handles at the ends, the lid knocked off and leaning on it,
// and a box of every kind of round sat in it poking out over the top
export function dmSupply(g) {
  const keep = new Set(), W = 0.78, H = 0.42, D = 0.56, y = 0.25, top = y + H / 2;
  keep.add(dmBox(g, W, H, D, DM.teal, 0, y, 0));
  for (let k = 1; k < 3; k++) { const yy = y - H / 2 + k * H / 3; dmBox(g, W + 0.004, 0.012, D + 0.004, DM.tealD, 0, yy, 0); }   // the slats' seams
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => { dmBox(g, 0.05, H + 0.006, 0.05, DM.dark, sx * (W / 2 - 0.02), y, sz * (D / 2 - 0.02)); }));   // the steel corners
  [-1, 1].forEach(sx => { dmBox(g, 0.012, 0.03, 0.2, DM.rope, sx * (W / 2 + 0.03), y + 0.06, 0); [-1, 1].forEach(sz => dmBox(g, 0.04, 0.03, 0.014, DM.rope, sx * (W / 2 + 0.012), y + 0.06, sz * 0.094)); });   // rope handles
  dmBox(g, 0.42, 0.06, 0.004, DM.label, 0, y + 0.02, D / 2 + 0.002); dmBox(g, 0.12, 0.12, 0.004, DM.label, -0.28, y + 0.02, D / 2 + 0.002);   // the stencils
  dmBox(g, W - 0.08, 0.004, D - 0.08, DM.black, 0, top + 0.002, 0);                                  // its open top
  const lid = new THREE.Group(); lid.position.set(0, 0.03, -D / 2 - 0.02); lid.rotation.x = -1.15; g.add(lid);
  keep.add(dmBox(lid, W, 0.035, D, DM.teal, 0, 0.0175, D / 2)); dmBox(lid, W * 0.5, 0.004, 0.08, DM.label, 0, 0.037, D / 2);
  // what's in it, sat down in it with their tops out: a 9mm carton, a box of shells, a .357 box and an ammo can
  [[DM.card9, 0.22, 0.12, 0.16, -0.2, 0.06, -0.08, 0.1], [DM.shellBox, 0.2, 0.09, 0.14, 0.04, 0.05, 0.12, -0.2], [DM.cardM, 0.16, 0.08, 0.12, -0.14, 0.04, 0.14, 0.4], [DM.can, 0.24, 0.16, 0.12, 0.2, 0.08, -0.05, -0.15]].forEach(([mat, w, h, d, x, up, z, ry]) => {
    keep.add(dmBox(g, w, h, d, mat, x, top + up - h / 2 + 0.02, z, ry));
  });
  dmFinish(g, keep);
}
// ---- a weapon's case off the radio: an olive hard case, ribbed lid, the seam round its middle, three latches, the
// handle and its stencilled panel, corner guards (rimmed in the field in the weapon's rarity colour, like a gun)
export function dmCase(g, cargo) {
  const keep = new Set(), L = WEAP[cargo.id] && WEAP[cargo.id].melee ? 0.9 : 1.1, H = 0.22, D = 0.42, y = 0.15, top = y + H / 2;
  keep.add(dmBox(g, L, H, D, DM.olive, 0, y, 0));
  dmBox(g, L + 0.008, 0.02, D + 0.008, DM.oliveD, 0, y + 0.02, 0);                                    // the seam
  for (let k = -2; k <= 2; k++) dmBox(g, L - 0.12, 0.012, 0.03, DM.oliveD, 0, top + 0.006, k * 0.075);   // ribs on the lid
  [-0.32, 0, 0.32].forEach(x => dmBox(g, 0.07, 0.06, 0.016, DM.dark, x * L, y + 0.02, D / 2 + 0.008));   // the latches
  dmBox(g, 0.22, 0.03, 0.05, DM.black, 0, y + 0.02, D / 2 + 0.03); [-0.1, 0.1].forEach(x => dmBox(g, 0.02, 0.03, 0.04, DM.black, x, y + 0.02, D / 2 + 0.015));   // the handle
  dmBox(g, 0.24, 0.1, 0.004, DM.label, -L * 0.28, y, -D / 2 - 0.002);                                 // the stencilled panel
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => dmBox(g, 0.06, H + 0.01, 0.06, DM.dark, sx * (L / 2 - 0.02), y, sz * (D / 2 - 0.02))));   // corner guards
  dmFinish(g, keep);
}
// a drop's model by its kind (the gun you put down brings its own)
export function dropModel(g, kind, ammoType, cargo) {
  if (kind === 'planks') (cargo && cargo.metal ? dmMetal : dmPlanks)(g);
  else if (kind === 'med') dmMed(g);
  else if (kind === 'supply') crateModel(g, cargo);
  else if (kind === 'gun') g.add(cargo.model);
  else ({ p9: dmAmmo9, p10: dmAmmo9, magnum: dmAmmoMag, shells: dmShells }[ammoType] || dmAmmoRifle)(g);
}
