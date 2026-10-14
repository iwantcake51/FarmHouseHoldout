// Attachment models: muzzle devices, suppressors, lasers, lights, sights, bayonet, brace.

function fitAttachments(g, D, front, y, info) {
  const isShell = D.ammo === 'shells', side = D.slot === 'side', k = side ? 0.8 : 1, muzzle = front;
  // muzzle devices: a choked shotgun has no room for a can
  if (isShell && T('choke')) {
    const L = T('choke') === 2 ? 0.13 : 0.07; cyl(g, 0.031, L + 0.008, GM.metal2, X, y, front + L / 2 - 0.004); ring(g, 0.034, 0.012, GM.steel, X, y, front + L - 0.006);   // threaded over the muzzle
    for (let i = 0; i < (T('choke') === 2 ? 3 : 1); i++) ring(g, 0.033, 0.006, GM.poly, X, y, front + 0.02 + i * 0.03); front += L;
  } else if (suppressed(D) && !D.quiet) {
    const s = T('supp');
    if (s === 1) {   // a blue spin-on oil filter screwed onto a threaded adapter: a smooth can with a rolled lip, a printed band, and a hose clamp
      const r = 0.056 * k, L = 0.15, c = front + 0.03 + L / 2;
      cyl(g, 0.018 * k, 0.04, GM.metal, X, y, front + 0.01);                                     // threaded adapter, over the muzzle
      cyl(g, r * 0.92, 0.012, GM.steel, X, y, front + 0.036, 20);                                // base plate
      cyl(g, r, L - 0.012, GM.filterB, X, y, c + 0.006, 24);                                       // the can
      cyl(g, r * 1.03, 0.012, GM.filterB, X, y, front + 0.042, 24);                               // rolled seam at the base
      cyl(g, r * 0.9, 0.008, GM.filterB, X, y, front + 0.03 + L + 0.004, 24);                     // domed end
      cyl(g, r * 1.006, 0.05, GM.label, X, y, c, 24); cyl(g, r * 1.01, 0.008, GM.filterD, X, y, c + 0.012, 24);   // label band and its stripe
      ring(g, 0.024 * k, 0.012, GM.steel, X, y, front + 0.02); front += L + 0.04;
    } else {
      const r = (s === 3 ? 0.05 : 0.04) * k, L = (s === 3 ? 0.42 : 0.32) * k;
      cyl(g, r, L + 0.012, GM.metal, X, y, front + L / 2 - 0.006, 20);   // threaded on over the muzzle
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
  // lasers hang right under the gun at the mount point; the beam starts from an emitter at the lens (weapons/laser.js).
  // A gun with a rail for one says where (info.laser: the rail's underside y and the laser's middle z, or a side rail at
  // x, the laser turned to stand out from that side): pistols on the rail under the dust cover in front of the trigger
  // guard, the revolver under its barrel lug, the MP9 on its right-hand rail, the MP5 under its handguard. A railed gun
  // takes a compact pointer clamped on, then a compact laser module; the others are found from the model and get a
  // pointer taped under the barrel, then a module on a rail mount
  // a sidearm with its rail free under the dust cover takes the second light tier as a weapon light clamped there, and
  // any laser goes in the same unit (weaponLight) rather than on its own
  const wl = side && T('light') === 2 && !info.noLight && info.laser && !info.laser.side;
  if (T('laser') && !info.noLaser && !wl) {
    const L = info.laser, rail = side || !!L, em = new THREE.Object3D();
    let lg = g, lx = X, u, lz;
    if (L && L.side) { lg = new THREE.Group(); lg.position.set(L.x, L.y, 0); lg.rotation.z = L.side * Math.PI / 2; g.add(lg); lx = 0; u = 0; lz = L.z; }   // its top against the side rail
    else if (L) { u = L.y; lz = L.z; }
    else { lz = front - 0.22; u = undersideAt(g, X, lz, y); }
    if (T('laser') === 1 && rail) {   // a compact pointer clamped straight onto the rail
      box(lg, 0.034, 0.012, 0.064, GM.metal, lx, u - 0.006, lz - 0.004);
      cyl(lg, 0.013, 0.09, GM.metal2, lx, u - 0.022, lz); ring(lg, 0.0145, 0.012, GM.metal, lx, u - 0.022, lz + 0.04);
      box(lg, 0.008, 0.008, 0.004, GM.red, lx, u - 0.022, lz + 0.046); em.position.set(lx, u - 0.022, lz + 0.049);
    } else if (T('laser') === 1) {   // a pointer taped under the barrel
      cyl(g, 0.012, 0.1, GM.metal2, X, u - 0.012, lz); { const tb = y - (u - 0.027); [-0.03, 0.03].forEach(o => box(g, 0.03, tb, 0.016, GM.tape, X, u - 0.027 + tb / 2, lz + o)); }   // tape from under the pointer up round the barrel
      box(g, 0.008, 0.008, 0.004, GM.red, X, u - 0.012, lz + 0.052); em.position.set(X, u - 0.012, lz + 0.055);
    } else {   // a laser module with two windows: on a rail mount under a long gun, straight onto a rail
      // a railed gun's is a compact unit that stops short of the trigger guard
      const top = rail ? u : u - 0.012, len = rail ? 0.08 : 0.12, h = rail ? 0.034 : 0.04, cz = rail ? lz + 0.012 : lz;
      if (!rail) box(g, 0.03, 0.02, 0.06, GM.metal, X, u - 0.003, lz);   // the mount, clamped up into the gun
      box(lg, 0.042, h, len, GM.tan, lx, top - h / 2, cz);
      const fz = cz + len / 2 + 0.001, ey = top - h / 2 - 0.001;
      box(lg, 0.012, 0.012, 0.004, GM.laserG, lx - 0.01, ey, fz); box(lg, 0.012, 0.012, 0.004, GM.glass, lx + 0.01, ey, fz);   // a green laser
      if (!rail) box(g, 0.012, 0.006, 0.02, GM.metal2, X, top + 0.001, lz - 0.02);
      em.position.set(lx - 0.01, ey, fz + 0.003);
    }
    em.userData.isLaser = true; lg.add(em); g.userData.laserEm = em;   // (isLaser: found again on the copy you carry, weapons/laser.js)
  }
  if (wl) weaponLight(g, info.laser, muzzle, info.noLaser ? 0 : T('laser'));
  else if (T('light') && !info.noLight) {
    const mz = muzzle, br = info.barrelR || 0.014;   // on the barrel, behind any can
    if (T('light') === 1) { cyl(g, 0.022, 0.14, GM.metal2, X + 0.06, y - 0.02, mz - 0.25); ring(g, 0.026, 0.02, GM.metal, X + 0.06, y - 0.02, mz - 0.175); cyl(g, 0.02, 0.004, GM.lens, X + 0.06, y - 0.02, mz - 0.163); [-0.28, -0.22].forEach(o => tapeWrap(g, X, y, mz + o, br + 0.002, X + 0.06 + 0.02, y - 0.02)); }   // taped to the barrel
    else if (D.slot === 'auto' && D.ammo === 'p9') {   // a submachine gun's: a bigger flashlight, zip-tied on alongside
      const lx = X + 0.066, ly = y - 0.02, lz = mz - 0.27;
      cyl(g, 0.025, 0.15, GM.metal2, lx, ly, lz); ring(g, 0.031, 0.032, GM.metal, lx, ly, lz + 0.086); cyl(g, 0.027, 0.004, GM.lens, lx, ly, lz + 0.103); ring(g, 0.019, 0.016, GM.rubber, lx, ly, lz - 0.083);   // body, head, lens, tail cap
      [-0.045, 0.035].forEach(o => zipTie(g, X, y, lz + o, br, lx, ly, 0.025));
    }
    else { ring(g, br + 0.006, 0.03, GM.metal, X, y, mz - 0.27); box(g, 0.05, 0.03, 0.05, GM.metal, X + 0.03, y - 0.012, mz - 0.27); cyl(g, 0.028, 0.16, GM.metal, X + 0.072, y - 0.02, mz - 0.27); ring(g, 0.035, 0.03, GM.metal2, X + 0.072, y - 0.02, mz - 0.18); cyl(g, 0.03, 0.004, GM.lens, X + 0.072, y - 0.02, mz - 0.163); ring(g, 0.02, 0.02, GM.rubber, X + 0.072, y - 0.02, mz - 0.355); }   // a ring round the barrel and its arm out to the light
  }
  // a shotgun's speed loader: a polymer clip on the left of the stock with the next two or three shells lying in it
  // ready (on a sawn-off, on the forend)
  if (T('loader') && isShell && D.perShell) {
    const n = 1 + T('loader'), at = info.loaderAt || [X - 0.034, 1.03, 0.3];
    box(g, 0.012, 0.024 * n + 0.012, 0.07, GM.poly, at[0] + 0.004, at[1] + 0.012 * (n - 1), at[2]);
    for (let k = 0; k < n; k++) { const sy = at[1] + k * 0.024; cyl(g, 0.0105, 0.05, GM.shell, at[0] - 0.008, sy, at[2] + 0.006, 8); cyl(g, 0.011, 0.014, GM.brass, at[0] - 0.008, sy, at[2] - 0.026, 8); }
  }
  const sight = T('sight');
  if (sight && !info.noSight) {
    const top = info.top || y + 0.05, sz = info.sz || 0.62, onSlide = side && info.slide, p = onSlide ? info.slide : g;
    const ox = onSlide ? -p.position.x : 0, oy = onSlide ? -p.position.y : 0, oz = onSlide ? -p.position.z : 0, sx = X + ox, by = top + oy - 0.002, bz = sz + oz;   // mounts sit 2 mm down into the rail or receiver they clamp
    if (sight === 4) acog(p, sx, by, bz);
    else if (sight >= 3 && SCOPE_GUNS.has(tierCtx)) {   // variable scope in rings
      // a gun can have a smaller one, further along (the revolver's handgun scope): its lengths by scopeK, its
      // thickness by scopeR, centred at scopeZ
      const sy = by + (info.scopeH || 0.075), lk = info.scopeK || 1, rk = info.scopeR || 1, cz = info.scopeZ !== undefined ? info.scopeZ + oz : bz;
      [-0.06, 0.08].forEach(o => { const z = cz + o * lk; box(p, 0.04 * rk, 0.012, 0.03 * rk, GM.metal, sx, by + 0.006, z); box(p, 0.014 * rk, sy - by, 0.02 * rk, GM.metal, sx, by + (sy - by) / 2, z); ring(p, 0.03 * rk, 0.022 * rk, GM.metal, sx, sy, z); });
      cyl(p, 0.025 * rk, 0.3 * lk, GM.metal, sx, sy, cz + 0.01 * lk, 18);
      taper(p, 0.025 * rk, 0.04 * rk, 0.08 * lk, GM.metal, sx, sy, cz + 0.2 * lk); taper(p, 0.03 * rk, 0.025 * rk, 0.05 * lk, GM.metal, sx, sy, cz - 0.16 * lk);
      cyl(p, 0.037 * rk, 0.005, GM.glass, sx, sy, cz + 0.242 * lk, 24); cyl(p, 0.026 * rk, 0.005, GM.glass, sx, sy, cz - 0.186 * lk, 20);   // round lenses at both ends
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * rk, 0.013 * rk, 0.032 * rk, 8), GM.metal2); tt.position.set(sx, sy + 0.036 * rk, cz + 0.01 * lk); p.add(tt);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * rk, 0.013 * rk, 0.032 * rk, 8), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(sx + 0.036 * rk, sy, cz + 0.01 * lk); p.add(st);
    } else if (sight >= 2) {
      // holographic sight, after an EOTech XPS: a quick-detach base with its lever, the hood at the back with its window
      // looking straight down the gun at you (the angled glass and the ring reticle inside it), and the battery housing
      // reaching forward under the window line, rounded over at the front, with its knurled cap on the left
      box(p, 0.044, 0.008, 0.096, GM.metal, sx, by + 0.004, bz + 0.002); box(p, 0.008, 0.008, 0.026, GM.metal2, sx + 0.025, by + 0.006, bz + 0.024);
      const fr = new THREE.Shape(), w = 0.025, y1 = by + 0.008, y2 = by + 0.067, cr = 0.011;
      fr.moveTo(sx - w, y1); fr.lineTo(sx + w, y1); fr.lineTo(sx + w, y2 - cr); fr.quadraticCurveTo(sx + w, y2, sx + w - cr, y2); fr.lineTo(sx - w + cr, y2); fr.quadraticCurveTo(sx - w, y2, sx - w, y2 - cr); fr.closePath();
      fr.holes.push(rrect(sx - 0.0175, by + 0.023, sx + 0.0175, by + 0.058, 0.006));
      xsec(p, fr, bz - 0.046, bz + 0.012, GM.metal, 0.0025);                                                 // the hood
      profile(p, shp([[bz + 0.012, by + 0.008], [bz + 0.054, by + 0.008], [bz + 0.06, by + 0.016], [bz + 0.058, by + 0.026], [bz + 0.048, by + 0.031], [bz + 0.012, by + 0.031]]), 0.046, GM.metal, sx, 0.003);   // battery housing, rounded at the front
      { const cap = cyl(p, 0.0115, 0.008, GM.metal2, sx + 0.026, by + 0.02, bz + 0.04, 18); cap.rotation.set(0, 0, Math.PI / 2); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, kb = box(p, 0.009, 0.0025, 0.0025, GM.metal, sx + 0.026, by + 0.02 + Math.cos(a) * 0.0115, bz + 0.04 + Math.sin(a) * 0.0115); kb.rotation.x = a; } }
      [-0.008, 0.008].forEach(o => box(p, 0.011, 0.008, 0.003, GM.rubber, sx + o, by + 0.0155, bz - 0.0475));   // the buttons under the window, at the back
      const gl = box(p, 0.035, 0.035, 0.002, GM.holoGlass, sx, by + 0.0405, bz + 0.004); gl.rotation.x = -0.1;
      const rt = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.002, 4, 22), GM.red); rt.position.set(sx, by + 0.0405, bz + 0.004); rt.rotation.x = -0.1; p.add(rt);   // the reticle, on the glass
      box(p, 0.0026, 0.0026, 0.002, GM.red, sx, by + 0.0405, bz + 0.004).rotation.x = -0.1;
    } else {   // micro red dot
      box(p, 0.034, 0.016, 0.05, GM.metal, sx, by + 0.006, bz);                                        // its base, set down on the rail and up into the tube
      cyl(p, 0.019, 0.055, GM.metal, sx, by + 0.032, bz); ring(p, 0.021, 0.01, GM.metal2, sx, by + 0.032, bz + 0.028);
      cyl(p, 0.016, 0.003, GM.glass, sx, by + 0.032, bz + 0.0335, 18); box(p, 0.004, 0.004, 0.003, GM.red, sx, by + 0.032, bz - 0.0285);   // the lens on the front ring, the dot showing at the back
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 8), GM.metal2); tt.position.set(sx, by + 0.055, bz); p.add(tt);
    }
  }
  if (S.att.fire) { ring(g, 0.03, 0.03, GM.ember, X, y, Math.min(front - 0.05, (info.sz || 0.62) + 0.28)); box(g, 0.012, 0.02, 0.05, GM.ember, X + 0.04, y - 0.04, (info.sz || 0.62) - 0.05); }
  if (S.att.stock && side) {   // a folding brace off the back of the grip
    [-0.02, 0.02].forEach(o => box(g, 0.01, 0.01, 0.24, GM.metal2, X + o, y - 0.05, 0.4)); box(g, 0.05, 0.13, 0.03, GM.poly, X, y - 0.07, 0.27); box(g, 0.054, 0.14, 0.012, GM.rubber, X, y - 0.07, 0.252);
  }
  return front;
}
// the ACOG (the fourth sight step): a Trijicon TA31 on its flat-top mount, traced off a side-on photo with the
// trace-photo skill (.claude/skills/trace-photo) at its true size, z along it from its middle and y up from the rail's
// top (solid keeps each traced outline to its size, rounding its edges inside it). It's round, like the real one: the
// eyepiece, the body widening from the tube to the hood, and the hood, an open round sunshade cut back on a slant at
// the front (HOOD) with the objective recessed in it, all on one axis. Over them the shroud fin with the red fibre
// optic down its top between two lips; under them the mount's foot and its clamp on the rail, two cross bolts through
// it and the thumb nut on the right. The elevation cap on top and the windage cap on the right of the tube, and the
// square block with its four screws behind
const ACOG = {
  base: [[0.1005, 0.00009], [0.00301, 0.00013], [-0.01534, 0.00028], [-0.01585, 0.00046], [-0.01605, 0.00117], [-0.01617, 0.01251], [-0.016, 0.01612], [-0.01612, 0.0164], [-0.0164, 0.01659], [-0.01789, 0.01663], [-0.01863, 0.01683], [-0.01886, 0.01732], [-0.01898, 0.0186], [0.09845, 0.01863], [0.09901, 0.0182], [0.09986, 0.01785], [0.10015, 0.01755], [0.10088, 0.01633], [0.10111, 0.0152], [0.1014, 0.01137], [0.10119, 0.00166], [0.101, 0.0005]],
  // the mount's foot under the body (cut off inside it, its bottom sunk into the clamp so no seam opens between them),
  // and the shroud fin over it (likewise)
  foot: [[0.0988, 0.015], [-0.01888, 0.015], [-0.01898, 0.0186], [-0.01931, 0.0293], [-0.01978, 0.0305], [-0.02016, 0.03081], [-0.02105, 0.03128], [-0.02104, 0.05006], [0.07974, 0.05006], [0.07393, 0.0412], [0.07244, 0.03844], [0.07207, 0.03723], [0.07192, 0.03504], [0.07297, 0.03227], [0.07684, 0.03216], [0.0796, 0.03177], [0.0825, 0.03033], [0.08363, 0.0293], [0.08548, 0.02701], [0.08619, 0.02664], [0.09391, 0.02573], [0.09547, 0.0253], [0.0976, 0.02401], [0.09818, 0.02327], [0.09863, 0.022], [0.09845, 0.02087], [0.09854, 0.015]],
  fin: [[0.09271, 0.07399], [-0.00422, 0.07397], [-0.00425, 0.08194], [-0.00204, 0.08258], [-0.00126, 0.08321], [0.00025, 0.08383], [0.01328, 0.08743], [0.02568, 0.09017], [0.03936, 0.09286], [0.05105, 0.09471], [0.07117, 0.09682], [0.07478, 0.09768], [0.08576, 0.09988], [0.0881, 0.10015], [0.08959, 0.10012], [0.09186, 0.09955], [0.09398, 0.09842], [0.09604, 0.09755], [0.0976, 0.09605], [0.09823, 0.09469], [0.0986, 0.09313], [0.09858, 0.09129], [0.09837, 0.09009], [0.0972, 0.08732], [0.09628, 0.08591], [0.09577, 0.08272], [0.09507, 0.07988], [0.09361, 0.07599], [0.09304, 0.07457]],
  block: [[-0.0441, 0.03277], [-0.05537, 0.03278], [-0.05657, 0.0331], [-0.05764, 0.03403], [-0.05969, 0.03389], [-0.06118, 0.03409], [-0.06159, 0.03454], [-0.06181, 0.03567], [-0.06175, 0.0407], [-0.06217, 0.04102], [-0.06333, 0.04106], [-0.06333, 0.08144], [-0.06153, 0.08158], [-0.0604, 0.08176], [-0.05997, 0.08086], [-0.05817, 0.08321], [-0.05798, 0.08442], [-0.0577, 0.08605], [-0.0569, 0.08683], [-0.05601, 0.08717], [-0.05161, 0.08766], [-0.04864, 0.08778], [-0.04545, 0.08743], [-0.04077, 0.08719], [-0.0395, 0.08699], [-0.03878, 0.08661], [-0.03803, 0.08527], [-0.03744, 0.08293], [-0.03709, 0.08251], [-0.03636, 0.08208], [-0.03643, 0.03851], [-0.03692, 0.03688], [-0.03759, 0.03608], [-0.03922, 0.0355], [-0.04021, 0.03489], [-0.04173, 0.03362], [-0.04269, 0.03305]],
  eye: [[0.00321, -0.10139], [0.00965, -0.10096], [0.01264, -0.10054], [0.01535, -0.09997], [0.0174, -0.09926], [0.01843, -0.09869], [0.01956, -0.09784], [0.02035, -0.09671], [0.0207, -0.09501], [0.0208, -0.09303], [0.02062, -0.09218], [0.01961, -0.08991], [0.01944, -0.08566], [0.01952, -0.08268], [0.01991, -0.08141], [0.02009, -0.07985], [0.02027, -0.07276], [0.02029, -0.06327]],   // [r, z]
  body: [[0.0208, -0.064], [0.0208, -0.004], [0.0214, 0.006], [0.0232, 0.02], [0.0232, 0.043]],   // [r, z]: the tube, widening to the hood
  turret: { z: -0.01805, rz: [[0.01316, 0.081], [0.01316, 0.08389], [0.01289, 0.08545], [0.01275, 0.0887], [0.01287, 0.08941], [0.01349, 0.09069], [0.01355, 0.09125], [0.0134, 0.09196], [0.01279, 0.09253], [0.01265, 0.09281], [0.01333, 0.09366], [0.01353, 0.09409], [0.01364, 0.09508], [0.01351, 0.09593], [0.01325, 0.09636], [0.01209, 0.09678], [0.0121, 0.09735], [0.01149, 0.0982], [0.00944, 0.09876], [0.006, 0.09919]] },   // [r, y], up the cap
  axis: 0.06131, wind: [-0.02027, 0.05428, 0.01467], bolts: [[0.00251, 0.00723, 0.00415], [0.08281, 0.00682, 0.00367]],
  fibre: [[0.00025, 0.08383], [0.02568, 0.09017], [0.0612, 0.0958]]
};
// the hood: its outer and inner radius, where it starts, and its front cut on the photo's slant: it reaches z0 at its
// bottom (y0) and comes forward k for every unit up; the objective sits recessed at lensZ
const HOOD = { r: 0.026, ri: 0.0232, z: 0.042, z0: 0.072, y0: 0.0353, k: 0.452, lensZ: 0.068 };
// an open round tube from z0 forward along the axis at (x, y), its front edge cut back to zf(y)
function slantTube(p, r, z0, zf, mat, x, y) {
  const g = new THREE.CylinderGeometry(r, r, 1, 32, 6, true); g.rotateX(Math.PI / 2);   // along z, from -0.5 to 0.5
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const t = pos.getZ(i) + 0.5, yy = y + pos.getY(i); pos.setZ(i, z0 + t * (zf(yy) - z0)); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, 0); m.castShadow = true; p.add(m); return m;   // at the axis's height; only its z was reshaped
}
function acog(p, sx, by, cz) {
  const A = GM.ano, at = pts => pts.map(([z, y]) => [cz + z, by + y]), ay = by + ACOG.axis, H = HOOD;
  // ---- the mount: its clamp on the rail, cross bolts and thumb nut, and its foot rising into the body
  solid(p, at(ACOG.base), 0.042, A, sx, 0.0015);
  ACOG.bolts.forEach(([z, y, r]) => cyl(p, r, 0.0445, GM.metal2, sx, by + y, cz + z, 12).rotation.set(0, 0, Math.PI / 2));
  cyl(p, 0.0058, 0.008, A, sx - 0.0255, by + 0.0262, cz + 0.088, 14).rotation.set(0, 0, Math.PI / 2);
  solid(p, at(ACOG.foot), 0.036, A, sx, 0.002);
  // ---- the round body: the tube from the block forward, widening to the hood
  lathe(p, ACOG.body.map(([r, z]) => [r, cz + z]), A, sx, ay, 32);
  // ---- the hood: a round sunshade, open at the front and cut back on the slant there, dark inside, its rim round the
  // cut; the objective recessed in it
  const zf = y => cz + H.z0 + (y - by - H.y0) * H.k;
  slantTube(p, H.r, cz + H.z, zf, A, sx, ay);
  slantTube(p, H.ri, cz + H.z, zf, GM.anoIn, sx, ay);
  { const a = Math.atan(H.k), rg = new THREE.RingGeometry(H.ri, H.r, 40); rg.scale(1, 1 / Math.cos(a), 1); rg.rotateX(a);
    const rim = new THREE.Mesh(rg, A); rim.position.set(sx, ay, zf(ay)); p.add(rim); }
  { const back = new THREE.Mesh(new THREE.RingGeometry(ACOG.body[ACOG.body.length - 1][0] - 0.001, H.r, 40), A); back.rotation.y = Math.PI; back.position.set(sx, ay, cz + H.z); p.add(back); }   // the step from the body up to the hood
  cyl(p, H.ri, 0.002, GM.rubber, sx, ay, cz + H.lensZ - 0.0015, 32); cyl(p, H.ri - 0.0018, 0.002, GM.glass, sx, ay, cz + H.lensZ, 32);
  // ---- the shroud fin over it all, with the fibre optic down its top between two lips, following the top's rise
  solid(p, at(ACOG.fin), 0.02, A, sx, 0.002);
  for (let k = 0; k < ACOG.fibre.length - 1; k++) {
    const [za, ya] = ACOG.fibre[k], [zb, yb] = ACOG.fibre[k + 1], l = Math.hypot(zb - za, yb - ya), a = Math.atan2(yb - ya, zb - za), zc = cz + (za + zb) / 2, yc = by + (ya + yb) / 2;
    box(p, 0.009, 0.0022, l, GM.fiber, sx, yc - 0.0004, zc).rotation.x = -a;   // its top just under the lips'
    [-1, 1].forEach(sd => { box(p, 0.0032, 0.0036, l, A, sx + sd * 0.0066, yc - 0.001, zc).rotation.x = -a; });
  }
  // ---- the elevation cap on top, the windage cap on the right
  { const pts = ACOG.turret.rz.map(([r, y]) => new THREE.Vector2(r, y)); pts.unshift(new THREE.Vector2(0, pts[0].y)); pts.push(new THREE.Vector2(0, pts[pts.length - 1].y));
    const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), A); t.position.set(sx, by, cz + ACOG.turret.z); t.castShadow = true; p.add(t); }
  { const [z, y, r] = ACOG.wind, tr = ACOG.body[0][0]; cyl(p, r * 0.9, 0.006, A, sx - tr - 0.001, by + y, cz + z, 20).rotation.set(0, 0, Math.PI / 2); cyl(p, r, 0.006, A, sx - tr - 0.006, by + y, cz + z, 24).rotation.set(0, 0, Math.PI / 2); }
  // ---- the square block with a screw in each corner, and the rubber eyepiece with its lens
  solid(p, at(ACOG.block), 0.05, A, sx, 0.003);
  [-1, 1].forEach(a => [-1, 1].forEach(b => cyl(p, 0.0022, 0.002, GM.metal2, sx + a * 0.017, ay + b * 0.019, cz - 0.0638, 8)));
  lathe(p, ACOG.eye.map(([r, z]) => [r, cz + z]), GM.rubber, sx, ay, 24);
  cyl(p, 0.0135, 0.002, GM.glass, sx, ay, cz - 0.0995, 20);
}
// a sidearm's weapon light (the second light tier), after an Olight Baldr or a Streamlight TLR: clamped onto the rail
// under the dust cover (at: the rail's underside y, and the middle z a laser would have there), a squared-off body with
// its switch paddles hanging at the back, flaring into a bigger head round the lens, its front no further out than the
// muzzle (mz). With a laser on the gun too (laserT, its tier) it's all one unit, deeper, the laser's window under the
// lens (red for the pointer, green for the module), and the beam starts there (weapons/laser.js)
function weaponLight(g, at, mz, laserT) {
  const u = at.y - 0.002, L = 0.094, z1 = Math.min(at.z + 0.063, mz - 0.004), z0 = z1 - L, w = 0.036, h = laserT ? 0.046 : 0.034;
  const rr = (x0, y0, x1, y1, r) => shp(rrect(x0, y0, x1, y1, r).getPoints().map(p => [p.x, p.y]));
  box(g, 0.026, 0.006, 0.04, GM.metal2, X, u - 0.001, z0 + 0.032);                                                   // the clamp, up on the rail
  xsec(g, rr(X - w / 2, u - h, X + w / 2, u - 0.004, 0.008), z0, z1 - 0.024, GM.metal, 0.0015);                       // the body
  xsec(g, rr(X - w / 2 - 0.003, u - h - 0.003, X + w / 2 + 0.003, u - 0.002, 0.01), z1 - 0.024, z1 - 0.002, GM.metal, 0.0015);   // the head
  const ly = laserT ? u - 0.02 : u - 0.019;
  ring(g, 0.0165, 0.004, GM.metal2, X, ly, z1 - 0.0005); cyl(g, 0.014, 0.002, GM.lens, X, ly, z1 + 0.0018, 24);      // the bezel and the lens, just proud of it
  [-1, 1].forEach(s => { box(g, 0.004, 0.02, 0.014, GM.rubber, X + s * (w / 2 + 0.002), u - h + 0.006, z0 + 0.008).rotation.x = 0.4; });   // the paddles
  if (!laserT) return;
  const ey = u - 0.0405, em = new THREE.Object3D();
  box(g, 0.012, 0.007, 0.003, laserT === 2 ? GM.laserG : GM.red, X, ey, z1 + 0.0008); em.position.set(X, ey, z1 + 0.003);
  em.userData.isLaser = true; g.add(em); g.userData.laserEm = em;
}
// a zip tie cinched round the barrel (x, y, its radius r) and a light lying alongside it (tx, ty, radius tr): a thin
// black band round each, the strap running between them over the top and under the bottom, and the tie's square head
function zipTie(g, x, y, z, r, tx, ty, tr) {
  ring(g, r + 0.0012, 0.005, GM.rubber, x, y, z); ring(g, tr + 0.0012, 0.005, GM.rubber, tx, ty, z);
  for (const s of [-1, 1]) {
    const ay = y + s * (r + 0.0012), by = ty + s * (tr + 0.0012), len = Math.hypot(tx - x, by - ay);
    box(g, len, 0.0024, 0.005, GM.rubber, (x + tx) / 2, (ay + by) / 2, z).rotation.z = Math.atan2(by - ay, tx - x);
  }
  box(g, 0.008, 0.007, 0.009, GM.rubber, x + (tx - x) * 0.7, y + r + (ty + tr - y - r) * 0.7 + 0.004, z);   // the head
}
// the lowest point of the gun's body at (x, z): followed down from the barrel through every piece that touches the one
// above it (barrel, slide, frame...), so an under-barrel attachment sits right against the bottom of that stack. Each
// piece is measured in the gun's own frame from its own shape, so however the gun happens to be held while it's built
// (turned, tilted, mid-swing), a grip or a magazine never seems to reach in under the barrel and drag the mount down
const _ub = new THREE.Box3(), _ubM = new THREE.Matrix4(), _ubR = new THREE.Matrix4();
function undersideAt(g, x, z, yAxis) {
  g.updateMatrixWorld(true); _ubM.copy(g.matrixWorld).invert();
  const boxes = [];
  g.traverse(o => {
    if (!o.isMesh || o.userData.isFlash || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _ub.copy(o.geometry.boundingBox).applyMatrix4(_ubR.multiplyMatrices(_ubM, o.matrixWorld));
    if (x < _ub.min.x - 0.004 || x > _ub.max.x + 0.004 || z < _ub.min.z || z > _ub.max.z || _ub.min.y > yAxis) return;
    boxes.push([_ub.min.y, _ub.max.y]);
  });
  let low = yAxis;
  for (let moved = true, n = 0; moved && n < 12; n++) { moved = false; for (const [a, b] of boxes) if (b >= low - 0.006 && a < low - 0.0005) { low = a; moved = true; } }
  return low === yAxis ? yAxis - 0.03 : low;
}
