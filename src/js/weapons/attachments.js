// Attachment models: muzzle devices, suppressors, lasers, lights, sights, bayonet, brace.

function fitAttachments(g, D, front, y, info) {
  const isShell = D.ammo === 'shells', side = D.slot === 'side', k = side ? 0.8 : 1;
  // muzzle devices: a choked shotgun has no room for a can
  if (isShell && T('choke')) {
    const L = T('choke') === 2 ? 0.13 : 0.07; cyl(g, 0.031, L, GM.metal2, X, y, front + L / 2); ring(g, 0.034, 0.012, GM.steel, X, y, front + L - 0.006);
    for (let i = 0; i < (T('choke') === 2 ? 3 : 1); i++) ring(g, 0.033, 0.006, GM.poly, X, y, front + 0.02 + i * 0.03); front += L;
  } else if (suppressed(D) && !D.quiet) {
    const s = T('supp');
    if (s === 1) {   // an oil filter on a threaded adapter, with a hose clamp
      cyl(g, 0.018 * k, 0.03, GM.metal, X, y, front + 0.015); cyl(g, 0.056 * k, 0.15, GM.filter, X, y, front + 0.105);
      for (let i = 0; i < 6; i++) box(g, 0.006, 0.112 * k, 0.12, GM.filterD, X + Math.cos(i * 1.05) * 0.054 * k, y + Math.sin(i * 1.05) * 0.054 * k, front + 0.105).rotation.z = i * 1.05;
      ring(g, 0.058 * k, 0.014, GM.steel, X, y, front + 0.06); ring(g, 0.05 * k, 0.012, GM.metal, X, y, front + 0.183); front += 0.19;
    } else {
      const r = (s === 3 ? 0.05 : 0.04) * k, L = (s === 3 ? 0.42 : 0.32) * k;
      cyl(g, r, L, GM.metal, X, y, front + L / 2); hi(g, r * 1.1, L * 0.9, X, y + r, front + L / 2);
      ring(g, r + 0.004, 0.026, GM.metal2, X, y, front + 0.016); ring(g, r + 0.004, 0.02, GM.metal2, X, y, front + L - 0.012); cyl(g, r * 0.35, 0.006, GM.poly, X, y, front + L + 0.002);
      if (s === 3) for (let i = 0; i < 5; i++) ring(g, r + 0.003, 0.01, GM.metal2, X, y, front + 0.07 + i * 0.05);
      front += L;
    }
  }
  if (S.att.bayonet && D.slot === 'long') {   // long guns only, not the automatics
    ring(g, 0.024, 0.03, GM.metal, X, y, front - 0.03); box(g, 0.03, 0.045, 0.07, GM.poly, X, y - 0.05, front - 0.08);
    const bl = box(g, 0.01, 0.04, 0.26, GM.blade, X, y - 0.055, front + 0.08); box(bl, 0.011, 0.008, 0.2, GM.steel, 0, 0.006, -0.02);
    const tip = box(g, 0.01, 0.03, 0.04, GM.blade, X, y - 0.06, front + 0.215); tip.rotation.x = 0.5;
  }
  // lasers hang right under the gun at the mount point (found from the model, so they touch whatever is there:
  // a pistol's dust cover, a shotgun's barrel or forend); the beam starts from an emitter at the lens (weapons/laser.js)
  if (T('laser')) {
    const lz = side ? front - 0.1 : front - 0.22, u = undersideAt(g, X, lz, y), em = new THREE.Object3D();
    if (T('laser') === 1) {   // a pointer taped under the barrel
      cyl(g, 0.012, 0.1, GM.metal2, X, u - 0.012, lz); [-0.03, 0.03].forEach(o => box(g, 0.03, 0.03 + (y - u) * 0.6, 0.016, GM.tape, X, u - 0.012 + (0.03 + (y - u) * 0.6) / 2 - 0.015, lz + o));
      box(g, 0.008, 0.008, 0.004, GM.red, X, u - 0.012, lz + 0.052); em.position.set(X, u - 0.012, lz + 0.055);
    } else {   // rail-mounted laser module with two windows
      box(g, 0.03, 0.014, 0.06, GM.metal, X, u - 0.006, lz); box(g, 0.042, 0.04, 0.12, GM.tan, X, u - 0.033, lz);
      box(g, 0.012, 0.012, 0.004, GM.red, X - 0.01, u - 0.033, lz + 0.061); box(g, 0.012, 0.012, 0.004, GM.glass, X + 0.01, u - 0.033, lz + 0.061); box(g, 0.012, 0.006, 0.02, GM.metal2, X, u - 0.011, lz - 0.02);
      em.position.set(X - 0.01, u - 0.033, lz + 0.064);
    }
    g.add(em); g.userData.laserEm = em;
  }
  if (T('light')) {
    if (T('light') === 1) { cyl(g, 0.022, 0.14, GM.metal2, X + 0.06, y - 0.02, front - 0.25); ring(g, 0.026, 0.02, GM.metal, X + 0.06, y - 0.02, front - 0.175); cyl(g, 0.02, 0.004, GM.lens, X + 0.06, y - 0.02, front - 0.163); [-0.28, -0.22].forEach(o => ring(g, 0.025, 0.022, GM.tape, X + 0.06, y - 0.02, front + o)); }
    else { box(g, 0.02, 0.03, 0.05, GM.metal, X + 0.045, y - 0.02, front - 0.27); cyl(g, 0.028, 0.16, GM.metal, X + 0.072, y - 0.02, front - 0.27); ring(g, 0.035, 0.03, GM.metal2, X + 0.072, y - 0.02, front - 0.18); cyl(g, 0.03, 0.004, GM.lens, X + 0.072, y - 0.02, front - 0.163); ring(g, 0.02, 0.02, GM.rubber, X + 0.072, y - 0.02, front - 0.36); }
  }
  const sight = T('sight');
  if (sight && !info.noSight) {
    const top = info.top || y + 0.05, sz = info.sz || 0.62, onSlide = side && info.slide, p = onSlide ? info.slide : g;
    const ox = onSlide ? -p.position.x : 0, oy = onSlide ? -p.position.y : 0, oz = onSlide ? -p.position.z : 0, sx = X + ox, by = top + oy, bz = sz + oz;
    if (sight === 3 && !side) {   // variable scope in rings
      const sy = by + 0.075;
      [-0.06, 0.08].forEach(o => { box(p, 0.04, 0.012, 0.03, GM.metal, sx, by + 0.006, bz + o); box(p, 0.014, sy - by, 0.02, GM.metal, sx, by + (sy - by) / 2, bz + o); ring(p, 0.03, 0.022, GM.metal, sx, sy, bz + o); });
      cyl(p, 0.025, 0.3, GM.metal, sx, sy, bz + 0.01); hi(p, 0.025, 0.28, sx, sy + 0.025, bz + 0.01);
      taper(p, 0.025, 0.04, 0.08, GM.metal, sx, sy, bz + 0.2); taper(p, 0.03, 0.025, 0.05, GM.metal, sx, sy, bz - 0.16);
      box(p, 0.062, 0.062, 0.005, GM.glass, sx, sy, bz + 0.242); box(p, 0.046, 0.046, 0.005, GM.glass, sx, sy, bz - 0.186);
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.032, 8), GM.metal2); tt.position.set(sx, sy + 0.036, bz + 0.01); p.add(tt);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.032, 8), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(sx + 0.036, sy, bz + 0.01); p.add(st);
    } else if (sight >= 2) {   // holographic sight: a hooded window with a glowing ring reticle
      box(p, 0.05, 0.014, 0.1, GM.metal, sx, by + 0.007, bz); box(p, 0.052, 0.03, 0.05, GM.metal, sx, by + 0.028, bz - 0.025);
      box(p, 0.058, 0.008, 0.07, GM.metal, sx, by + 0.085, bz + 0.01); box(p, 0.008, 0.07, 0.07, GM.metal, sx - 0.027, by + 0.05, bz + 0.01); box(p, 0.008, 0.07, 0.07, GM.metal, sx + 0.027, by + 0.05, bz + 0.01);
      box(p, 0.046, 0.05, 0.003, GM.holoGlass, sx, by + 0.055, bz + 0.03);
      const rt = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 4, 16), GM.red); rt.position.set(sx, by + 0.057, bz + 0.026); p.add(rt);
      box(p, 0.003, 0.003, 0.002, GM.red, sx, by + 0.057, bz + 0.026);
    } else {   // micro red dot
      box(p, 0.034, 0.012, 0.05, GM.metal, sx, by + 0.006, bz);
      cyl(p, 0.019, 0.055, GM.metal, sx, by + 0.032, bz); ring(p, 0.021, 0.01, GM.metal2, sx, by + 0.032, bz + 0.028);
      box(p, 0.028, 0.028, 0.003, GM.glass, sx, by + 0.032, bz + 0.03); box(p, 0.004, 0.004, 0.003, GM.red, sx, by + 0.032, bz - 0.025);
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 8), GM.metal2); tt.position.set(sx, by + 0.055, bz); p.add(tt);
    }
  }
  if (S.att.fire) { ring(g, 0.03, 0.03, GM.ember, X, y, Math.min(front - 0.05, (info.sz || 0.62) + 0.28)); box(g, 0.012, 0.02, 0.05, GM.ember, X + 0.04, y - 0.04, (info.sz || 0.62) - 0.05); }
  if (S.att.stock && side) {   // a folding brace off the back of the grip
    [-0.02, 0.02].forEach(o => box(g, 0.01, 0.01, 0.24, GM.metal2, X + o, y - 0.05, 0.4)); box(g, 0.05, 0.13, 0.03, GM.poly, X, y - 0.07, 0.27); box(g, 0.054, 0.14, 0.012, GM.rubber, X, y - 0.07, 0.252);
  }
  return front;
}
// the lowest point of the gun's body at (x, z), among the pieces that reach up to the barrel's height: where an
// under-barrel attachment has to sit to touch it
const _ub = new THREE.Box3(), _ubM = new THREE.Matrix4();
function undersideAt(g, x, z, yAxis) {
  g.updateMatrixWorld(true); _ubM.copy(g.matrixWorld).invert();
  let low = Infinity;
  g.traverse(o => {
    if (!o.isMesh || o.userData.isFlash || !o.visible) return;
    _ub.setFromObject(o).applyMatrix4(_ubM);
    if (x < _ub.min.x - 0.004 || x > _ub.max.x + 0.004 || z < _ub.min.z || z > _ub.max.z || _ub.max.y < yAxis - 0.03 || _ub.min.y > yAxis) return;
    low = Math.min(low, _ub.min.y);
  });
  return low === Infinity ? yAxis - 0.03 : low;
}
