// The four house stations (workbench, sawhorse, medicine cabinet, radio) and their highlight outlines.

// ---- stations inside the house ----
// The big pieces of each station stay whole (userData.sil) so the highlight outline can trace them;
// the small detail is merged into a few meshes per station.
const STATIONS = [];
{
  const sil = m => { m.userData.sil = true; return m; }, RED_X = basic(0xb3261c);
  // ---- workbench against the north wall: butcher-block top, a lower shelf, a vise on the front corner, a pegboard of tools ----
  let g = new THREE.Group(); g.position.set((cxw(21) + cxw(22)) / 2, 0, cxw(18) - 0.1); scene.add(g);
  sil(box(g, 1.94, 0.1, 0.76, HM.oakLt, 0, 0.88, 0));
  for (let k = 0; k < 7; k++) box(g, 1.94, 0.004, 0.006, HM.oakDk, 0, 0.932, -0.33 + k * 0.11);
  [[-0.86, -0.3], [0.86, -0.3], [-0.86, 0.3], [0.86, 0.3]].forEach(([a, b]) => sil(box(g, 0.1, 0.83, 0.1, HM.oak, a, 0.415, b)));
  box(g, 1.62, 0.12, 0.03, HM.oak, 0, 0.76, 0.33); box(g, 0.5, 0.09, 0.02, HM.oakLt, -0.42, 0.76, 0.35); box(g, 0.08, 0.025, 0.025, HM.brass, -0.42, 0.76, 0.365);
  sil(box(g, 1.72, 0.04, 0.62, HM.oak, 0, 0.22, 0));
  // on the shelf: a red toolbox, a paint can and a coiled extension cord
  box(g, 0.5, 0.2, 0.24, HM.red, 0.45, 0.34, 0.02); box(g, 0.51, 0.03, 0.25, lam(0x6e1e18), 0.45, 0.42, 0.02);
  box(g, 0.24, 0.025, 0.03, HM.iron, 0.45, 0.49, 0.02); [-0.11, 0.11].forEach(x => box(g, 0.02, 0.05, 0.02, HM.iron, 0.45 + x, 0.46, 0.02));
  [-0.15, 0.15].forEach(x => box(g, 0.04, 0.05, 0.01, HM.steel, 0.45 + x, 0.4, 0.145));
  ycyl(g, 0.08, 0.08, 0.15, lam(0x6a7a8a), -0.25, 0.315, 0.05, 12); ycyl(g, 0.082, 0.082, 0.012, HM.steel, -0.25, 0.392, 0.05, 12); box(g, 0.08, 0.06, 0.004, HM.cream, -0.25, 0.3, 0.131);
  torus(g, 0.12, 0.02, lam(0xc86a2a), -0.62, 0.262, 0.0).rotation.x = Math.PI / 2; torus(g, 0.1, 0.02, lam(0xc86a2a), -0.6, 0.3, 0.02).rotation.x = Math.PI / 2;
  // the vise, with a piece of wood clamped in its jaws
  const vs = new THREE.Group(); vs.position.set(0.7, 0.93, 0.26); g.add(vs);
  const viseM = lam(0x3a4a5a);
  box(vs, 0.16, 0.03, 0.18, viseM, 0, 0.015, 0); box(vs, 0.12, 0.1, 0.16, viseM, 0, 0.08, -0.01);
  box(vs, 0.22, 0.09, 0.04, viseM, 0, 0.12, 0.08); box(vs, 0.22, 0.09, 0.04, viseM, 0, 0.12, 0.17); box(vs, 0.08, 0.05, 0.1, viseM, 0, 0.07, 0.13);
  box(vs, 0.21, 0.07, 0.008, HM.iron, 0, 0.125, 0.103); box(vs, 0.21, 0.07, 0.008, HM.iron, 0, 0.125, 0.147);
  zcyl(vs, 0.014, 0.12, HM.steel, 0, 0.09, 0.24); xcyl(vs, 0.008, 0.24, HM.steel, 0, 0.09, 0.3); [-0.12, 0.12].forEach(x => box(vs, 0.024, 0.024, 0.024, HM.steel, x, 0.09, 0.3));
  box(vs, 0.36, 0.05, 0.036, HM.pine, -0.04, 0.15, 0.125);
  // a field-stripped pistol on a rag, a box of shells, a coffee can of nails, a hand plane, nuts and bolts
  box(g, 0.34, 0.006, 0.24, HM.olive, -0.1, 0.935, 0.06).rotation.y = 0.2;
  const pz = new THREE.Group(); pz.position.set(-0.1, 0.938, 0.06); pz.rotation.y = 0.25; g.add(pz);
  box(pz, 0.17, 0.025, 0.035, HM.iron, 0, 0.0125, 0.03); box(pz, 0.04, 0.025, 0.1, HM.iron, -0.06, 0.0125, 0.09).rotation.y = 0.25;
  box(pz, 0.19, 0.03, 0.035, lam(0x24262a), 0.01, 0.015, -0.05); xcyl(pz, 0.01, 0.11, HM.steel, 0.02, 0.01, -0.1, 8); xcyl(pz, 0.006, 0.09, HM.steel, 0.03, 0.006, 0.0, 6);
  box(pz, 0.03, 0.02, 0.09, HM.iron, 0.09, 0.01, 0.07).rotation.y = -0.4;
  box(g, 0.14, 0.06, 0.1, HM.red, 0.3, 0.96, -0.14); box(g, 0.142, 0.022, 0.102, HM.brass, 0.3, 0.945, -0.14);
  ycyl(g, 0.065, 0.065, 0.12, lam(0x7a4a2a), -0.72, 0.99, -0.16, 12); ycyl(g, 0.066, 0.066, 0.03, HM.cream, -0.72, 0.99, -0.16, 12);
  for (let k = 0; k < 6; k++) { const a = k * 1.05; box(g, 0.006, 0.05, 0.006, HM.steel, -0.72 + Math.cos(a) * 0.035, 1.065, -0.16 + Math.sin(a) * 0.035).rotation.z = Math.cos(a) * 0.25; }
  const pl = new THREE.Group(); pl.position.set(0.25, 0.93, 0.14); pl.rotation.y = -0.3; g.add(pl);
  box(pl, 0.24, 0.05, 0.07, HM.oakDk, 0, 0.025, 0); box(pl, 0.03, 0.06, 0.03, HM.oakDk, -0.07, 0.08, 0); ycyl(pl, 0.018, 0.018, 0.03, HM.oakDk, 0.08, 0.065, 0, 8); box(pl, 0.02, 0.05, 0.06, HM.steel, 0.01, 0.06, 0).rotation.z = -0.6;
  [[-0.42, 0.22], [-0.38, 0.16], [-0.5, 0.18], [-0.46, 0.27]].forEach(([x, z], k) => ycyl(g, 0.02, 0.02, 0.012, HM.steel, x, 0.936, z, 6).rotation.y = k);
  [[-0.35, 0.25, 0.4], [-0.55, 0.12, -0.7]].forEach(([x, z, r]) => xcyl(g, 0.007, 0.08, HM.steel, x, 0.937, z, 6).rotation.y = r);
  // the pegboard, framed, with its holes and the tools hung on it
  sil(box(g, 1.7, 0.8, 0.03, lam(0x8a6a48), 0, 1.55, -0.355));
  box(g, 1.76, 0.04, 0.04, HM.oakDk, 0, 1.97, -0.35); box(g, 1.76, 0.04, 0.04, HM.oakDk, 0, 1.13, -0.35); [-0.86, 0.86].forEach(x => box(g, 0.04, 0.88, 0.04, HM.oakDk, x, 1.55, -0.35));
  for (let i = 0; i < 17; i++) for (let j = 0; j < 6; j++) box(g, 0.014, 0.014, 0.004, HM.hole, -0.76 + i * 0.095, 1.24 + j * 0.12, -0.3385);
  box(g, 0.035, 0.3, 0.02, HM.oakLt, -0.65, 1.5, -0.33); box(g, 0.15, 0.05, 0.04, HM.steel, -0.65, 1.66, -0.33); box(g, 0.06, 0.02, 0.03, HM.steel, -0.74, 1.675, -0.33).rotation.z = 0.5;
  const saw = new THREE.Group(); saw.position.set(-0.3, 1.52, -0.334); saw.rotation.z = 0.12; g.add(saw);
  box(saw, 0.32, 0.11, 0.006, HM.steel, 0, 0, 0); box(saw, 0.32, 0.012, 0.007, HM.iron, 0, -0.055, 0); box(saw, 0.1, 0.13, 0.025, HM.oak, 0.2, 0.01, 0); box(saw, 0.05, 0.04, 0.027, HM.hole, 0.2, 0.025, 0);
  box(g, 0.03, 0.28, 0.012, HM.steel, 0.0, 1.5, -0.332); box(g, 0.025, 0.05, 0.012, HM.steel, -0.02, 1.665, -0.332); box(g, 0.025, 0.05, 0.012, HM.steel, 0.02, 1.665, -0.332); torus(g, 0.025, 0.01, HM.steel, 0, 1.345, -0.332);
  [HM.red, HM.yellow, HM.blue].forEach((m, k) => { box(g, 0.03, 0.09, 0.03, m, 0.18 + k * 0.07, 1.62, -0.33); box(g, 0.008, 0.12, 0.008, HM.steel, 0.18 + k * 0.07, 1.515, -0.33); });
  [-1, 1].forEach(d => { const h = box(g, 0.016, 0.2, 0.012, lam(0x8a2a22), 0.48 + d * 0.025, 1.5, -0.332); h.rotation.z = d * 0.12; box(g, 0.012, 0.06, 0.012, HM.steel, 0.48 + d * 0.008, 1.63, -0.332).rotation.z = -d * 0.1; });
  torus(g, 0.1, 0.025, HM.rope, 0.72, 1.62, -0.31);
  box(g, 0.66, 0.025, 0.1, HM.oak, 0.45, 1.2, -0.29); [0.2, 0.42, 0.64].forEach(x => { ycyl(g, 0.04, 0.04, 0.1, lam(0x9aa89a), x, 1.263, -0.29, 10); ycyl(g, 0.042, 0.042, 0.02, HM.brass, x, 1.323, -0.29, 10); });
  // a tally of the nights you've lasted, pinned up in the corner
  box(g, 0.16, 0.2, 0.004, HM.paper, -0.12, 1.83, -0.336); for (let k = 0; k < 4; k++) box(g, 0.008, 0.07, 0.005, HM.ink, -0.17 + k * 0.025, 1.84, -0.333);
  box(g, 0.11, 0.008, 0.005, HM.ink, -0.13, 1.84, -0.332).rotation.z = 0.5; ycyl(g, 0.01, 0.01, 0.01, HM.inkR, -0.12, 1.92, -0.33, 6).rotation.x = Math.PI / 2;
  unfight(g); mergeInto(g, finePieces(g));
  obstacle(21, 18); obstacle(22, 18);
  STATIONS.push({ g, id: 'bench', name: 'Workbench', x: g.position.x, z: cxw(18) + 0.95 });

  // ---- sawhorses by the south-west corner: a board across them with a saw left in the cut, sawdust, and lumber stacked underneath ----
  g = new THREE.Group(); g.position.set((cxw(18) + cxw(19)) / 2, 0, cxw(25)); scene.add(g);
  [-0.55, 0.55].forEach(x => {
    sil(box(g, 0.1, 0.09, 0.56, HM.pine2, x, 0.63, 0));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => { const l = box(g, 0.05, 0.7, 0.06, HM.oakLt, x + sx * 0.06, 0.32, sz * 0.2); l.rotation.set(-sz * 0.3, 0, sx * 0.14); });
    [-1, 1].forEach(sx => box(g, 0.03, 0.04, 0.36, HM.oak, x + sx * 0.085, 0.22, 0));
    [-1, 1].forEach(sz => box(g, 0.13, 0.1, 0.02, HM.oak, x, 0.56, sz * 0.2));
  });
  sil(box(g, 1.76, 0.05, 0.26, HM.pine, 0, 0.7, 0));
  box(g, 0.006, 0.052, 0.11, HM.hole, 0.32, 0.7, 0.075); box(g, 0.004, 0.002, 0.2, HM.ink, -0.3, 0.726, 0.0);
  const sw = new THREE.Group(); sw.position.set(0.32, 0.72, 0.13); sw.rotation.x = -0.45; g.add(sw);
  box(sw, 0.005, 0.1, 0.36, HM.steel, 0, 0, -0.05); box(sw, 0.006, 0.012, 0.36, HM.iron, 0, -0.05, -0.05); box(sw, 0.025, 0.12, 0.1, HM.oak, 0, 0.02, 0.17); box(sw, 0.03, 0.04, 0.05, HM.hole, 0, 0.03, 0.17);
  box(g, 0.012, 0.012, 0.14, HM.yellow, -0.2, 0.731, 0.05).rotation.y = 0.6; box(g, 0.07, 0.035, 0.07, HM.yellow, -0.48, 0.743, -0.04); ycyl(g, 0.012, 0.012, 0.037, HM.iron, -0.48, 0.743, -0.04, 8);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) box(g, 1.5 - k * 0.06, 0.048, 0.16, (k + j) % 2 ? M.board : M.board2, (k - 1) * 0.04 + j * 0.03, 0.025 + k * 0.05, -0.085 + j * 0.17).rotation.y = (k - j) * 0.02;
  const dust = lam(0xc8aa78);
  [[0.32, 0.15, 0.04, 0.14, 0.04], [0.42, 0.15, -0.06, 0.08, 0.025], [0.3, 0, -0.28, 0.16, 0.03]].forEach(([x, y, z, r, h]) => ycyl(g, 0.01, r, h, dust, x, y + h / 2, z, 9));
  box(g, 0.22, 0.05, 0.16, HM.pine, 0.82, 0.025, -0.3).rotation.y = 0.5;
  unfight(g); mergeInto(g, finePieces(g));
  obstacle(18, 25); obstacle(19, 25);
  STATIONS.push({ g, id: 'saw', name: 'Sawhorse', x: g.position.x, z: cxw(25) - 0.95 });

  // ---- medicine cabinet on the east wall: white enamel, a glazed door with the cross, drawers, a towel, supplies on top ----
  g = new THREE.Group(); g.position.set(cxw(26) + 0.15, 0, cxw(24)); scene.add(g);
  sil(box(g, 0.5, 1.5, 0.76, HM.enamel, 0, 0.85, 0));
  [[-0.2, -0.32], [0.2, -0.32], [-0.2, 0.32], [0.2, 0.32]].forEach(([a, b]) => box(g, 0.06, 0.1, 0.06, HM.iron, a, 0.05, b));
  box(g, 0.52, 0.04, 0.78, HM.iron, 0, 0.12, 0);
  sil(box(g, 0.54, 0.05, 0.8, HM.enamel2, 0, 1.625, 0)); box(g, 0.5, 0.04, 0.76, HM.enamel, 0, 1.67, 0);
  box(g, 0.025, 0.86, 0.7, HM.enamel2, -0.262, 1.12, 0); box(g, 0.01, 0.5, 0.46, lam(0x8aa0a8), -0.278, 1.17, 0);
  [1.05, 1.3].forEach(y => box(g, 0.012, 0.012, 0.46, HM.enamel, -0.282, y, 0));
  box(g, 0.006, 0.2, 0.065, RED_X, -0.285, 1.17, 0); box(g, 0.006, 0.065, 0.2, RED_X, -0.285, 1.17, 0);
  [0.5, 0.25].forEach(y => { box(g, 0.02, 0.22, 0.7, HM.enamel2, -0.26, y, 0); box(g, 0.02, 0.025, 0.14, HM.steel, -0.276, y, 0); });
  box(g, 0.02, 0.1, 0.02, HM.steel, -0.28, 1.12, -0.3); [0.82, 1.42].forEach(y => box(g, 0.02, 0.06, 0.02, HM.steel, -0.272, y, 0.35));
  // the side that faces the room carries a big red cross, with a striped towel on a rail under it
  box(g, 0.32, 0.1, 0.01, RED_X, 0, 1.17, 0.383); box(g, 0.1, 0.32, 0.01, RED_X, 0, 1.17, 0.383);
  xcyl(g, 0.01, 0.38, HM.steel, 0, 0.8, 0.43); [-0.17, 0.17].forEach(x => box(g, 0.02, 0.02, 0.06, HM.steel, x, 0.8, 0.41));
  box(g, 0.28, 0.4, 0.016, HM.cream, 0.02, 0.6, 0.444); box(g, 0.28, 0.1, 0.012, HM.cream, 0.02, 0.76, 0.418);
  [0.48, 0.72].forEach(y => box(g, 0.282, 0.03, 0.018, HM.inkR, 0.02, y, 0.444));
  // on top: a first-aid kit, a brown bottle, a pill bottle and two rolls of bandage
  box(g, 0.26, 0.12, 0.2, HM.enamel, -0.02, 1.75, -0.15); box(g, 0.262, 0.02, 0.202, RED_X, -0.02, 1.765, -0.15); box(g, 0.04, 0.03, 0.01, HM.steel, -0.02, 1.76, -0.047);
  box(g, 0.12, 0.006, 0.04, RED_X, -0.02, 1.813, -0.15); box(g, 0.04, 0.006, 0.12, RED_X, -0.02, 1.813, -0.15);
  ycyl(g, 0.035, 0.035, 0.12, HM.glassA, 0.08, 1.75, 0.18, 10); ycyl(g, 0.015, 0.025, 0.04, HM.glassA, 0.08, 1.83, 0.18, 8); ycyl(g, 0.017, 0.017, 0.02, HM.iron, 0.08, 1.86, 0.18, 8);
  ycyl(g, 0.025, 0.025, 0.07, lam(0xc87a2a), 0.12, 1.725, -0.0, 8); ycyl(g, 0.027, 0.027, 0.02, HM.enamel, 0.12, 1.77, 0.0, 8);
  xcyl(g, 0.04, 0.07, HM.cream, -0.1, 1.73, 0.2, 10); xcyl(g, 0.04, 0.07, HM.cream, -0.06, 1.8, 0.19, 10);
  unfight(g); mergeInto(g, finePieces(g));
  obstacle(26, 24);
  STATIONS.push({ g, id: 'med', name: 'Medicine cabinet', x: cxw(26) - 0.95, z: cxw(24) });

  // ---- ham radio on a side table by the south wall, turned towards the room, running off a car battery ----
  g = new THREE.Group(); g.position.set(cxw(24), 0, cxw(25) + 0.1); scene.add(g);
  sil(box(g, 0.84, 0.05, 0.62, HM.oak, 0, 0.765, 0));
  [[-0.36, -0.25], [0.36, -0.25], [-0.36, 0.25], [0.36, 0.25]].forEach(([a, b]) => sil(box(g, 0.05, 0.74, 0.05, HM.oakDk, a, 0.37, b)));
  [-0.27, 0.27].forEach(z => box(g, 0.68, 0.07, 0.02, HM.oakDk, 0, 0.7, z)); [-0.38, 0.38].forEach(x => box(g, 0.02, 0.07, 0.48, HM.oakDk, x, 0.7, 0));
  box(g, 0.74, 0.03, 0.52, HM.oak, 0, 0.2, 0);
  box(g, 0.26, 0.17, 0.17, lam(0x22242a), 0.15, 0.3, 0.05); box(g, 0.262, 0.025, 0.172, lam(0x3a3c44), 0.15, 0.385, 0.05);
  ycyl(g, 0.015, 0.015, 0.03, HM.red, 0.07, 0.41, 0.1, 8); ycyl(g, 0.015, 0.015, 0.03, HM.iron, 0.23, 0.41, 0.1, 8);
  box(g, 0.012, 0.42, 0.012, HM.red, 0.07, 0.62, 0.27); box(g, 0.012, 0.42, 0.012, HM.iron, 0.11, 0.62, 0.27);
  const rs = new THREE.Group(); rs.position.set(-0.12, 0.79, 0.02); rs.rotation.y = -1.2; g.add(rs);
  sil(box(rs, 0.5, 0.28, 0.28, M.olive, 0, 0.14, 0)); box(rs, 0.52, 0.03, 0.3, HM.oliveDk, 0, 0.015, 0);
  box(rs, 0.46, 0.24, 0.012, lam(0x2a2c28), 0, 0.14, -0.142);
  box(rs, 0.17, 0.07, 0.01, basic(0xffc860), -0.1, 0.2, -0.15); box(rs, 0.004, 0.06, 0.012, basic(0x3a1a10), -0.12, 0.2, -0.152);
  box(rs, 0.06, 0.06, 0.012, basic(0x8af07a), 0.15, 0.2, -0.15);
  [-0.17, -0.07, 0.03].forEach(x => { zcyl(rs, 0.026, 0.03, HM.iron, x, 0.07, -0.16, 10); box(rs, 0.006, 0.02, 0.006, HM.steel, x, 0.085, -0.177); });
  for (let k = 0; k < 4; k++) box(rs, 0.12, 0.012, 0.012, HM.hole, 0.15, 0.04 + k * 0.025, -0.15);
  [-0.235, 0.235].forEach(x => { box(rs, 0.02, 0.2, 0.02, HM.steel, x, 0.14, -0.19); [0.05, 0.23].forEach(y => box(rs, 0.02, 0.02, 0.05, HM.steel, x, y, -0.165)); });
  for (let k = 0; k < 4; k++) box(rs, 0.3, 0.004, 0.012, HM.hole, 0, 0.282, -0.06 + k * 0.04);
  box(rs, 0.04, 0.03, 0.04, HM.iron, 0.18, 0.295, 0.08);
  const ant = new THREE.Group(); ant.position.set(0.18, 0.31, 0.08); ant.rotation.z = 0.12; rs.add(ant);
  ycyl(ant, 0.009, 0.009, 0.25, HM.steel, 0, 0.125, 0, 6); ycyl(ant, 0.006, 0.006, 0.22, HM.steel, 0, 0.36, 0, 6); ycyl(ant, 0.004, 0.004, 0.18, HM.steel, 0, 0.56, 0, 6); box(ant, 0.016, 0.016, 0.016, HM.steel, 0, 0.655, 0);
  // the handset on its coiled cord, a pair of headphones and a notepad of frequencies
  box(g, 0.05, 0.035, 0.09, lam(0x24262a), 0.24, 0.808, -0.06).rotation.y = 0.4; box(g, 0.02, 0.012, 0.02, HM.inkR, 0.235, 0.828, -0.07);
  for (let k = 0; k < 7; k++) torus(g, 0.013, 0.004, lam(0x24262a), 0.06 + k * 0.022, 0.81, -0.04 + k * 0.002).rotation.y = Math.PI / 2;
  const hp = new THREE.Group(); hp.position.set(0.26, 0.795, 0.17); hp.rotation.y = 0.5; g.add(hp);
  torus(hp, 0.07, 0.008, HM.iron, 0, 0.012, 0, Math.PI).rotation.x = -Math.PI / 2; [-0.07, 0.07].forEach(x => ycyl(hp, 0.035, 0.035, 0.03, lam(0x24262a), x, 0.015, 0, 10));
  const np = box(g, 0.13, 0.006, 0.17, HM.paper, 0.27, 0.793, -0.2); np.rotation.y = 0.3;
  for (let k = 0; k < 4; k++) box(np, 0.09, 0.002, 0.006, HM.ink, -0.01, 0.004, -0.05 + k * 0.03);
  box(g, 0.008, 0.008, 0.13, HM.yellow, 0.35, 0.8, -0.2).rotation.y = -0.2;
  unfight(g); mergeInto(g, finePieces(g));
  obstacle(24, 25);
  STATIONS.push({ g, id: 'radio', name: 'Ham radio', x: cxw(24), z: cxw(25) - 0.95 });
}
STATIONS.forEach(s => { s.om = outline(s.g, 0xf0a04a, 0, 0.035, null, o => !o.userData.fine); s.om.visible = false; });
