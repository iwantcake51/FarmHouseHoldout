// The four house stations (workbench, sawhorse, medicine cabinet, radio) and their highlight outlines.

// ---- stations inside the house ----
const STATIONS = [];
{
  // workbench against the north wall
  let g = new THREE.Group(); g.position.set((cxw(21) + cxw(22)) / 2, 0, cxw(18) - 0.1); scene.add(g);
  box(g, 1.9, 0.09, 0.75, M.wood2, 0, 0.88, 0); [[-.88, -.3], [.88, -.3], [-.88, .3], [.88, .3]].forEach(([a, b]) => box(g, 0.08, 0.88, 0.08, M.wood, a, 0.44, b));
  box(g, 1.8, 0.05, 0.7, M.wood, 0, 0.3, 0);
  box(g, 0.22, 0.14, 0.16, M.metal, 0.75, 0.99, 0.25); box(g, 0.06, 0.06, 0.24, M.metal, 0.75, 0.97, 0.38);
  box(g, 1.6, 0.85, 0.04, M.deck, 0, 1.6, -0.36);
  for (let k = 0; k < 7; k++) box(g, 0.06, rr(0.2, 0.4), 0.03, pick([M.metal, M.rust, M.wood2]), -0.65 + k * 0.22, 1.65, -0.32);
  box(g, 0.4, 0.08, 0.2, M.olive, -0.5, 0.97, 0.05); box(g, 0.2, 0.06, 0.12, M.rust, 0.1, 0.96, -0.05);
  obstacle(21, 18); obstacle(22, 18);
  STATIONS.push({ g, id: 'bench', name: 'Workbench', x: g.position.x, z: cxw(18) + 0.95 });
  // sawhorse and lumber by the south-west corner
  g = new THREE.Group(); g.position.set((cxw(18) + cxw(19)) / 2, 0, cxw(25)); scene.add(g);
  [-0.55, 0.55].forEach(x => { box(g, 0.06, 0.7, 0.06, M.wood2, x, 0.33, 0.2).rotation.x = 0.3; box(g, 0.06, 0.7, 0.06, M.wood2, x, 0.33, -0.2).rotation.x = -0.3; box(g, 0.1, 0.06, 0.5, M.wood2, x, 0.66, 0); });
  box(g, 1.7, 0.06, 0.24, M.board, 0, 0.72, 0); box(g, 0.5, 0.02, 0.02, M.metal, 0.3, 0.77, 0.05);
  box(g, 1.4, 0.24, 0.5, M.board2, 0, 0.12, -0.15);
  obstacle(18, 25); obstacle(19, 25);
  STATIONS.push({ g, id: 'saw', name: 'Sawhorse', x: g.position.x, z: cxw(25) - 0.95 });
  // medicine cabinet on the east wall
  g = new THREE.Group(); g.position.set(cxw(26) + 0.15, 0, cxw(24)); scene.add(g);
  box(g, 0.55, 1.6, 0.8, M.white, 0, 0.8, 0); box(g, 0.02, 0.24, 0.07, basic(0xb3261c), -0.28, 1.25, 0); box(g, 0.02, 0.07, 0.24, basic(0xb3261c), -0.28, 1.25, 0);
  box(g, 0.02, 1.5, 0.01, M.found, -0.28, 0.8, 0);
  obstacle(26, 24);
  STATIONS.push({ g, id: 'med', name: 'Medicine cabinet', x: cxw(26) - 0.95, z: cxw(24) });
  // ham radio on a side table
  g = new THREE.Group(); g.position.set(cxw(24), 0, cxw(25) + 0.1); scene.add(g);
  box(g, 0.8, 0.06, 0.6, M.wood, 0, 0.75, 0); [[-.34, -.24], [.34, -.24], [-.34, .24], [.34, .24]].forEach(([a, b]) => box(g, 0.05, 0.75, 0.05, M.wood, a, 0.37, b));
  box(g, 0.5, 0.28, 0.28, M.olive, 0, 0.92, 0); box(g, 0.08, 0.08, 0.02, basic(0x8af07a), 0.15, 0.95, -0.15); box(g, 0.02, 0.6, 0.02, M.metal, -0.2, 1.3, 0.05);
  box(g, 0.12, 0.08, 0.02, M.metal, -0.05, 0.95, -0.15);
  obstacle(24, 25);
  STATIONS.push({ g, id: 'radio', name: 'Ham radio', x: cxw(24), z: cxw(25) - 0.95 });
}
STATIONS.forEach(s => { s.om = outline(s.g, 0xf0a04a, 0, 0.035); s.om.visible = false; });
