// Model builders for every melee weapon, and the combined GUNS builder table.

// Melee models are built handle-down along +y in the right fist.
const MELEE_MODELS = {
  bat(g, m) {
    box(g, 0.05, 0.05, 0.05, GM.wood2, 0, -0.09, 0);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.03, 0.95, 10), GM.bat); b.castShadow = true; b.position.y = 0.4; g.add(b);
    if (m.nails) for (let k = 0; k < 12; k++) { const a = k * 2.4, y = 0.12 + (k % 4) * 0.08; box(b, 0.1, 0.012, 0.012, GM.nail, Math.cos(a) * 0.065, y, Math.sin(a) * 0.065).rotation.y = -a; }
    if (m.wire) [0.16, 0.3].forEach(y => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 4, 14), GM.wire); t.rotation.x = Math.PI / 2; t.position.y = y; b.add(t); });
  },
  crowbar(g, m) {
    const c = lam(0x8a2a22);
    box(g, 0.032, 0.82, 0.032, c, 0, 0.34, 0); box(g, 0.032, 0.032, 0.13, c, 0, 0.75, 0.05); box(g, 0.032, 0.09, 0.032, c, 0, 0.71, 0.11);
    box(g, 0.05, 0.02, 0.02, c, 0, -0.07, -0.02);
    if (m.tape) box(g, 0.045, 0.22, 0.045, GM.tape, 0, 0.03, 0);
  },
  wrench(g, m) {
    const k = m.jaw ? 1.3 : 1;
    box(g, 0.045, 0.6, 0.05, GM.metal2, 0, 0.24, 0); box(g, 0.05, 0.16, 0.06, GM.metal, 0, -0.02, 0);
    box(g, 0.15 * k, 0.12 * k, 0.07, GM.steel, 0.03, 0.58, 0); box(g, 0.05 * k, 0.1 * k, 0.07, GM.steel, 0.08 * k, 0.68, 0);
  },
  katana(g, m) {
    box(g, 0.036, 0.26, 0.036, lam(0x1e1c1a), 0, 0.03, 0);
    for (let k = 0; k < 4; k++) box(g, 0.04, 0.012, 0.04, lam(0xb8a070), 0, -0.07 + k * 0.06, 0).rotation.y = 0.78;
    box(g, 0.1, 0.02, 0.07, GM.brass, 0, 0.17, 0);
    const L = m.folded ? 0.92 : 0.78, bl = box(g, 0.012, L, 0.046, m.folded ? lam(0xd8dcdf) : GM.blade, 0, 0.18 + L / 2, 0.005); bl.rotation.x = -0.05;
    box(bl, 0.013, L * 0.9, 0.008, lam(0xeef0f2), 0, 0, 0.018);
  },
  sledge(g, m) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.95, 8), GM.wood2); sh.position.y = 0.38; sh.castShadow = true; g.add(sh);
    box(g, 0.13, 0.13, 0.3, GM.metal, 0, 0.86, 0); box(g, 0.14, 0.14, 0.04, GM.metal2, 0, 0.86, 0.15); box(g, 0.14, 0.14, 0.04, GM.metal2, 0, 0.86, -0.15);
    if (m.spikes) [[0.08, 0], [-0.08, 0], [0, 0.08]].forEach(([x, y]) => { const s = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 5), GM.steel); s.position.set(x, 0.86 + y, 0); s.rotation.z = x ? -Math.sign(x) * Math.PI / 2 : 0; g.add(s); });
  },
  machete(g, m) {
    box(g, 0.05, 0.2, 0.05, GM.wood, 0, 0.02, 0); const L = m.longblade ? 0.75 : 0.55;
    box(g, 0.08, 0.02, 0.06, GM.metal, 0, 0.12, 0);
    box(g, 0.015, L, 0.1, GM.blade, 0, 0.13 + L / 2, 0.02);
    if (m.serrated) for (let k = 0; k < 6; k++) box(g, 0.018, 0.03, 0.03, GM.steel, 0, 0.2 + k * L / 7, -0.035).rotation.x = 0.7;
  },
  axe(g, m) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.033, 0.98, 8), GM.wood2); sh.position.y = 0.38; sh.castShadow = true; g.add(sh);
    const hw = m.weighted ? 1.35 : 1;
    box(g, 0.05 * hw, 0.15 * hw, 0.28 * hw, lam(0xa3281c), 0, 0.8, 0.07); box(g, 0.02, 0.19 * hw, 0.04, GM.blade, 0, 0.8, 0.22 * hw); box(g, 0.05, 0.06, 0.08, lam(0xa3281c), 0, 0.8, -0.1);
  }
};
const GUNS = Object.assign({}, GUN_MODELS, MELEE_MODELS);
