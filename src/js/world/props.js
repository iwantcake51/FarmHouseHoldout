// Yard props: shed, cars, crates, hay bales, burn barrel, hanging bulbs.

function obstacle(i, j) { if (inb(i, j)) cell[idx(i, j)] = OBST; }
{
  const t = new THREE.Group(); t.position.set((cxw(24) + cxw(25)) / 2, 0, cxw(20)); scene.add(t);
  box(t, 1.8, 0.1, 0.9, M.wood, 0, 0.78, 0); [[-.8, -.35], [.8, -.35], [-.8, .35], [.8, .35]].forEach(([a, b]) => box(t, 0.08, 0.78, 0.08, M.wood, a, 0.39, b));
  box(t, 0.14, 0.04, 0.14, M.metal, 0.4, 0.85, 0); box(t, 0.03, 0.3, 0.03, M.metal, 0.4, 1.0, 0); box(t, 0.22, 0.14, 0.22, basic(0xffe2a8), 0.4, 1.2, 0).castShadow = false;
  box(t, 0.3, 0.04, 0.22, M.white, -0.4, 0.85, 0.1);
  [-0.55, 0.55].forEach(z => { box(t, 0.4, 0.06, 0.4, M.wood2, -0.3, 0.45, z * 1.6); box(t, 0.06, 0.45, 0.4, M.wood2, -0.3, 0.7, z * 1.6 + Math.sign(z) * 0.2); });
  obstacle(24, 20); obstacle(25, 20);
  const s = new THREE.Group(); s.position.set(cxw(17), 0, (cxw(23) + cxw(24)) / 2); scene.add(s);
  box(s, 0.6, 1.15, 1.9, M.wood, 0, 0.58, 0); for (let k = 0; k < 5; k++) box(s, 0.25, 0.22, 0.14, pick([M.white, M.olive, M.crate, M.rust]), 0.05, 1.27, -0.7 + k * 0.35);
  obstacle(17, 23); obstacle(17, 24);
  const bed = new THREE.Group(); bed.position.set(cxw(26), 0, (cxw(18) + cxw(19)) / 2); scene.add(bed);
  box(bed, 0.95, 0.45, 1.9, lam(0x6d3a33), 0, 0.25, 0); box(bed, 0.8, 0.12, 0.4, M.white, 0, 0.53, -0.7); box(bed, 0.97, 0.5, 0.08, M.wood, 0, 0.5, -0.95); obstacle(26, 18); obstacle(26, 19);
}
function car(i0, j0, along) {
  const g = new THREE.Group(); scene.add(g);
  const w = along === 'z' ? 2 : 4, d = along === 'z' ? 4 : 2;
  g.position.set(cxw(i0) - 0.5 + w / 2, 0, cxw(j0) - 0.5 + d / 2); g.rotation.y = along === 'z' ? 0 : Math.PI / 2 + 0.06;
  box(g, 1.75, 0.7, 3.8, M.rust, 0, 0.6, 0); box(g, 1.55, 0.55, 1.9, M.rust2, 0, 1.22, -0.2); box(g, 1.58, 0.42, 1.7, M.glass, 0, 1.24, -0.2);
  box(g, 1.8, 0.12, 0.2, M.metal, 0, 0.42, 1.92); box(g, 1.8, 0.12, 0.2, M.metal, 0, 0.42, -1.92);
  [[-.85, 1.2], [.85, 1.2], [-.85, -1.25], [.85, -1.25]].forEach(([a, b]) => box(g, 0.25, 0.55, 0.55, M.tire, a, 0.28, b));
  for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + d; j++) obstacle(i, j);
}
car(8, 29, 'z');
car(32, 9, 'x');
function crate(i, j) { const c = box(scene, 0.9, 0.9, 0.9, M.crate, cxw(i), 0.45, cxw(j)); c.rotation.y = rr(-.2, .2); box(c, 0.92, 0.08, 0.92, M.wood, 0, 0.3, 0); box(c, 0.92, 0.08, 0.92, M.wood, 0, -0.3, 0); obstacle(i, j); }
[[12, 14], [13, 14], [12, 15], [31, 31], [6, 21], [35, 24], [36, 24]].forEach(p => crate(...p));
function hay(i, j) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1, 12), M.hay); m.rotation.z = Math.PI / 2; m.rotation.y = rr(-.4, .4); m.position.set(cxw(i), 0.48, cxw(j)); m.castShadow = m.receiveShadow = true; scene.add(m); obstacle(i, j); }
[[28, 34], [29, 34], [14, 8], [26, 10]].forEach(p => hay(...p));
const flames = [];
{
  const g = new THREE.Group(); g.position.set(cxw(14), 0, cxw(16)); scene.add(g);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12, 1, true), M.barrel); b.position.y = 0.45; b.castShadow = true; g.add(b);
  [[0xff8a2a, 0.22, 0], [0xffc45a, 0.14, 0.05]].forEach(([c, r, o]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, 0.6, 6), basic(c)); f.position.set(o, 1.1, -o); g.add(f); flames.push(f); });
  obstacle(14, 16);
}
// ---- hanging bulbs in the house ----
const HANG = [[cxw(19), cxw(20.5)], [cxw(23.5), cxw(23)], [cxw(21.5), cxw(19.6)]];
HANG.forEach(([x, z]) => {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  box(g, 0.015, 0.4, 0.015, M.metal, 0, 2.3, 0).castShadow = false;
  const sh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 12, 1, true), lam(0x3a4a3a, { side: THREE.DoubleSide })); sh.position.y = 2.06; g.add(sh);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), basic(0xffd59a)); bulb.position.y = 1.98; g.add(bulb);
});
