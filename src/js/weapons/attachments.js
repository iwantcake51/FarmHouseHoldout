// Attachment models: muzzle devices, suppressors, lasers, lights, sights, bayonet, brace.

import { box } from '../core/geometry.js';
import { gunAtt, SCOPE_GUNS, suppressed, T, tierCtx, W8 } from '../game/run-state.js';
import { heatAll } from '../effects/supp-heat.js';
import { lensOn, reticleOn } from '../effects/scope-view.js';
import { GM, X } from './gun-materials.js';
import { cyl, lathe, profile, ring, rrect, shp, solid, taper, tapeWrap, xsec } from './gun-parts.js';

// the handgun's heavy-duty can (an Osprey, eccentric: its bore near the top): across, tall, its top over the bore (under
// the slide's own top, 1.9 cm over it), long, how round its corners are (metres)
const OSPREY = { w: 0.032, h: 0.056, over: 0.017, L: 0.2, r: 0.007 };
export function fitAttachments(g, D, front, y, info) {
  const isShell = D.ammo === 'shells', side = D.slot === 'side', k = side ? 0.8 : 1, muzzle = front;
  // muzzle devices: a choked shotgun has no room for a can
  if (isShell && T('choke')) {
    const L = T('choke') === 2 ? 0.13 : 0.07; cyl(g, 0.031, L + 0.008, GM.metal2, X, y, front + L / 2 - 0.004); ring(g, 0.034, 0.012, GM.steel, X, y, front + L - 0.006);   // threaded over the muzzle
    for (let i = 0; i < (T('choke') === 2 ? 3 : 1); i++) ring(g, 0.033, 0.006, GM.poly, X, y, front + 0.02 + i * 0.03); front += L;
  } else if (suppressed(D) && !D.quiet && !D.intSupp) {   // (the SMG's can is built into its barrel: weapons/gun-models.js)
    const s = T('supp'), n0 = g.children.length;   // (every piece of the can from here, its bands and clamp too, glows as it heats: heatAll)
    if (s === 1) {   // a blue spin-on oil filter screwed onto a threaded adapter: a smooth can with a rolled lip, a printed band, and a hose clamp
      const r = 0.056 * k, L = 0.15, c = front + 0.03 + L / 2;
      cyl(g, 0.018 * k, 0.04, GM.metal, X, y, front + 0.01);                                     // threaded adapter, over the muzzle
      cyl(g, r * 0.92, 0.012, GM.steel, X, y, front + 0.036, 20);                                // base plate
      cyl(g, r, L - 0.012, GM.filterB, X, y, c + 0.006, 24);                                       // the can
      cyl(g, r * 1.03, 0.012, GM.filterB, X, y, front + 0.042, 24);                               // rolled seam at the base
      cyl(g, r * 0.9, 0.008, GM.filterB, X, y, front + 0.03 + L + 0.004, 24);                     // domed end
      cyl(g, r * 1.006, 0.05, GM.label, X, y, c, 24); cyl(g, r * 1.01, 0.008, GM.filterD, X, y, c + 0.012, 24);   // label band and its stripe
      ring(g, 0.024 * k, 0.012, GM.steel, X, y, front + 0.02); front += L + 0.04;
    } else if (s === 3 && tierCtx === 'pistol') {
      // the handgun's heavy-duty can is an Osprey: a long flat-sided box of a can with its bore up near its top and its
      // body hung under it (OSPREY: across, tall, its top this far over the bore, long, its corners' round), so its top
      // stays under the slide's and it never comes up into the sights or across the view; a dark cap on its front end
      // and the three slanted grooves cut in its sides at the back
      const O = OSPREY, yt = y + O.over, yb = yt - O.h, x0 = X - O.w / 2, x1 = X + O.w / 2, z0 = front + 0.012, z1 = z0 + O.L;
      cyl(g, 0.0085, 0.018, GM.metal2, X, y, front + 0.004, 14);   // its mount, threaded onto the barrel
      xsec(g, new THREE.Shape(rrect(x0, yb, x1, yt, O.r).getPoints(3)), z0, z1 - 0.012, GM.metal, 0.0015);   // the body
      xsec(g, new THREE.Shape(rrect(x0 + 0.0008, yb + 0.0008, x1 - 0.0008, yt - 0.0008, O.r).getPoints(3)), z1 - 0.012, z1, GM.poly, 0.0015);   // its front cap
      cyl(g, 0.0045, 0.003, GM.poly, X, y, z1 + 0.001, 12);   // and the hole the round leaves by
      [-1, 1].forEach(sd => { for (let i = 0; i < 3; i++) { const b = box(g, 0.0012, O.h * 0.62, 0.004, GM.metal2, X + sd * (O.w / 2 + 0.0004), (yt + yb) / 2, z0 + 0.03 + i * 0.011); b.rotation.x = -0.55; } });
      front = z1;
    } else {
      const r = (s === 3 ? 0.05 : 0.04) * k, L = (s === 3 ? 0.42 : 0.32) * k;
      cyl(g, r, L + 0.012, GM.metal, X, y, front + L / 2 - 0.006, 20);   // threaded on over the muzzle
      ring(g, r + 0.004, 0.026, GM.metal2, X, y, front + 0.016); ring(g, r + 0.004, 0.02, GM.metal2, X, y, front + L - 0.012); cyl(g, r * 0.35, 0.006, GM.poly, X, y, front + L + 0.002);
      if (s === 3) for (let i = 0; i < 5; i++) ring(g, r + 0.003, 0.01, GM.metal2, X, y, front + 0.07 + i * 0.05);
      front += L;
    }
    heatAll(g.children.slice(n0), tierCtx);   // (it glows as it heats: effects/supp-heat.js)
  }
  if (gunAtt(tierCtx, 'bayonet')) {   // long guns only, not the automatics
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
  // a light: the older guns (TAPED_LIGHT) have a flashlight taped on at the first tier and their own weapon light at the
  // second; every other gun takes a weapon light at both tiers (weaponLight: a chunky one, then a slim, modern one),
  // clamped onto its rail, or onto a mount where it hasn't one, and any laser goes in the same unit rather than on its own
  const wl = T('light') && !info.noLight && !TAPED_LIGHT.has(tierCtx);
  if (T('laser') && !info.noLaser && !wl) {
    const L = info.laser, rail = side || !!L, em = new THREE.Object3D();
    let lg = g, lx = X, u, lz;
    if (L && L.side) { lg = new THREE.Group(); lg.position.set(L.x, L.y, 0); lg.rotation.z = L.side * Math.PI / 2; g.add(lg); lx = 0; u = 0; lz = L.z; }   // its top against the side rail
    else if (L) { u = L.y; lz = L.z; }
    else { lz = info.mount ? info.mount.z : muzzle - 0.22; u = undersideAt(g, X, lz, y); }   // (off the gun's own muzzle, or the mount it says: never out on a can or a choke)
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
  if (wl) {
    const L = info.laser, lt = info.noLaser ? 0 : T('laser'), tier = T('light');
    if (L && L.side) { const lg = new THREE.Group(); lg.position.set(L.x, L.y, 0); lg.rotation.z = L.side * Math.PI / 2; g.add(lg); weaponLight(lg, { y: 0, z: L.z }, muzzle, lt, tier, 0, g); }   // its top against the side rail
    else if (L) weaponLight(g, L, muzzle, lt, tier);
    else {   // no rail: on a mount clamped up under the barrel
      const lz = info.mount ? info.mount.z : muzzle - 0.24, u = undersideAt(g, X, lz, y);
      box(g, 0.03, 0.016, 0.05, GM.metal, X, u - 0.002, lz); weaponLight(g, { y: u - 0.01, z: lz }, muzzle, lt, tier);
    }
  }
  else if (T('light') && !info.noLight) {
    const mz = info.mount ? info.mount.z + 0.25 : muzzle, br = info.barrelR || 0.014;   // on the barrel, behind any can (or at its mount)
    if (T('light') === 1) { cyl(g, 0.022, 0.14, GM.metal2, X + 0.06, y - 0.02, mz - 0.25); ring(g, 0.026, 0.02, GM.metal, X + 0.06, y - 0.02, mz - 0.175); cyl(g, 0.02, 0.004, GM.lens, X + 0.06, y - 0.02, mz - 0.163); lightEm(g, X + 0.06, y - 0.02, mz - 0.158); [-0.28, -0.22].forEach(o => tapeWrap(g, X, y, mz + o, br + 0.002, X + 0.06 + 0.02, y - 0.02)); }   // taped to the barrel
    else if (D.slot === 'auto' && (D.ammo === 'p9' || D.ammo === 'p10')) {   // a submachine gun's: a bigger flashlight, zip-tied on alongside
      const lx = X + 0.066, ly = y - 0.02, lz = mz - 0.27;
      cyl(g, 0.025, 0.15, GM.metal2, lx, ly, lz); ring(g, 0.031, 0.032, GM.metal, lx, ly, lz + 0.086); cyl(g, 0.027, 0.004, GM.lens, lx, ly, lz + 0.103); lightEm(g, lx, ly, lz + 0.108); ring(g, 0.019, 0.016, GM.rubber, lx, ly, lz - 0.083);   // body, head, lens, tail cap
      [-0.045, 0.035].forEach(o => zipTie(g, X, y, lz + o, br, lx, ly, 0.025));
    }
    else { ring(g, br + 0.006, 0.03, GM.metal, X, y, mz - 0.27); box(g, 0.05, 0.03, 0.05, GM.metal, X + 0.03, y - 0.012, mz - 0.27); cyl(g, 0.028, 0.16, GM.metal, X + 0.072, y - 0.02, mz - 0.27); ring(g, 0.035, 0.03, GM.metal2, X + 0.072, y - 0.02, mz - 0.18); lightEm(g, X + 0.072, y - 0.02, mz - 0.163); cyl(g, 0.03, 0.004, GM.lens, X + 0.072, y - 0.02, mz - 0.163); ring(g, 0.02, 0.02, GM.rubber, X + 0.072, y - 0.02, mz - 0.355); }   // a ring round the barrel and its arm out to the light
  }
  const sight = T('sight');
  if (sight && !info.noSight) {
    // (a big optic on a handgun goes on the rail along its barrel, which stays put, not on the slide: optRail, the hand
    // cannon's; and with a handgun's long eye relief, held out at arm's length, not up against your eye: optRelief)
    const rl = sight >= 3 && info.optRail, top = rl ? rl.top : info.top || y + 0.05, sz = rl ? rl.z : info.sz || 0.62, onSlide = side && info.slide && !rl, p = onSlide ? info.slide : g;
    const ox = onSlide ? -p.position.x : 0, oy = onSlide ? -p.position.y : 0, oz = onSlide ? -p.position.z : 0, sx = X + ox, by = top + oy - 0.002, bz = sz + oz;   // mounts sit 2 mm down into the rail or receiver they clamp
    // (each optic notes its axis on what it's mounted to: [x, y] across, its eyepiece and front lens along z, the
    // eyepiece's radius and its eye relief, for looking down it in first person: game/view-cam.js)
    if (sight === 4) { acog(p, sx, by, bz); p.userData.optic = { kind: 'acog', x: sx, y: by + ACOG.axis, zr: bz - 0.1011, zf: bz + HOOD.lensZ, r: 0.0161, relief: rl ? rl.relief : 0.072 }; lensOn(p, sx, by + ACOG.axis, bz - 0.0968 - 0.0009, 0.0153); }   // (its eyepiece the cup's lip, so its picture fills the cup)
    else if (sight >= 3 && SCOPE_GUNS.has(tierCtx)) {   // variable scope in rings
      // a gun can have a smaller one, further along (the revolver's handgun scope): its lengths by scopeK, its
      // thickness by scopeR, centred at scopeZ
      const sy = by + (info.scopeH || 0.075), lk = info.scopeK || 1, rk = info.scopeR || 1, cz = info.scopeZ !== undefined ? info.scopeZ + oz : bz;
      [-0.06, 0.08].forEach(o => { const z = cz + o * lk; box(p, 0.04 * rk, 0.012, 0.03 * rk, GM.metal, sx, by + 0.006, z); box(p, 0.014 * rk, sy - by, 0.02 * rk, GM.metal, sx, by + (sy - by) / 2, z); ring(p, 0.03 * rk, 0.022 * rk, GM.metal, sx, sy, z); });
      cyl(p, 0.025 * rk, 0.3 * lk, GM.metal, sx, sy, cz + 0.01 * lk, 18);
      taper(p, 0.025 * rk, 0.04 * rk, 0.08 * lk, GM.metal, sx, sy, cz + 0.2 * lk); taper(p, 0.03 * rk, 0.025 * rk, 0.05 * lk, GM.metal, sx, sy, cz - 0.16 * lk);
      cyl(p, 0.037 * rk, 0.005, GM.glass, sx, sy, cz + 0.242 * lk, 24); cyl(p, 0.0285 * rk, 0.005, GM.glass, sx, sy, cz - 0.186 * lk, 20);   // round lenses at both ends, the eyepiece's filling its bell
      p.userData.optic = { kind: 'scope', x: sx, y: sy, zr: cz - 0.186 * lk, zf: cz + 0.242 * lk, r: 0.0285 * rk, relief: rl ? rl.relief : 0.125 };   // (relief: back far enough that the eyecup shows as a dark shell round the picture, as an ACOG's body does)
      lensOn(p, sx, sy, cz - 0.186 * lk - 0.0027, 0.0285 * rk);   // (the eyepiece's glass you look into: effects/scope-view.js)
      { const e = cz - 0.186 * lk; lathe(p, [[0.0285 * rk, e - 0.014], [0.035 * rk, e - 0.014], [0.0365 * rk, e - 0.01], [0.0345 * rk, e + 0.004], [0.03 * rk, e + 0.01], [0.0285 * rk, e + 0.01], [0.0285 * rk, e - 0.014]], GM.rubber, sx, sy, 24); }   // a rubber eyecup: the dark shell round the picture from your eye, a solid ring down onto the eyepiece (never a loose one standing off it)
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * rk, 0.013 * rk, 0.032 * rk, 8), GM.metal2); tt.position.set(sx, sy + 0.036 * rk, cz + 0.01 * lk); p.add(tt);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * rk, 0.013 * rk, 0.032 * rk, 8), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(sx + 0.036 * rk, sy, cz + 0.01 * lk); p.add(st);
    } else if (side && sight === 1) pistolDot(p, sx, by, bz, 'dot');
    else if (tierCtx === 'smg' && sight === 1) pistolDot(p, sx, unityRiser(p, sx, by, bz), bz, 'dot', 'rmr');   // (the machine pistol's: a Trijicon RMR, as a pistol's, up on a riser)
    else if (sight >= 2) {
      // holographic sight, after an EOTech 512: a slim body low on the rail (the batteries along it, their cap at the
      // front), the window's frame at the back with rounded corners and the glass in it, a thin hood looping up over it,
      // and on the back face under the window the panel with its two arrow buttons, the round one between and four
      // screws. Its reticle (the 68 MOA ring, its four ticks and the dot) is only seen looking through it, out at
      // infinity along the sight (effects/scope-view.js: reticleOn)
      const H5 = { z0: bz - 0.048, z1: bz - 0.004, wy: by + 0.034, ww: 0.0152, wh: 0.0112, fr: 0.0014, hw: 0.0015 };   // (fr: the frame's width round the window; hw: the hood's walls)
      box(p, 0.03, 0.006, 0.09, GM.metal, sx, by + 0.003, bz);                                                                  // the mount
      cyl(p, 0.005, 0.006, GM.metal2, sx + 0.019, by + 0.004, bz + 0.02, 12).rotation.set(0, 0, Math.PI / 2);                // its cross-bolt knob
      profile(p, shp([[H5.z0, by + 0.004], [bz + 0.04, by + 0.004], [bz + 0.046, by + 0.008], [bz + 0.047, by + 0.016], [bz + 0.042, by + 0.0225], [H5.z0, by + 0.0225]]), 0.034, GM.metal, sx, 0.0015);   // the body
      cyl(p, 0.0085, 0.006, GM.metal2, sx, by + 0.0135, bz + 0.049, 16);                                                       // the battery cap
      { const fr = shp(rrect(sx - H5.ww - H5.fr, H5.wy - H5.wh - H5.fr, sx + H5.ww + H5.fr, H5.wy + H5.wh + H5.fr, 0.0045).getPoints(4).map(v => [v.x, v.y]), [rrect(sx - H5.ww, H5.wy - H5.wh, sx + H5.ww, H5.wy + H5.wh, 0.0035)]);
        xsec(p, fr, H5.z0, H5.z1, GM.metal, 0.0006); }                                                                        // the window's frame
      { const hd = shp(rrect(sx - 0.0215, by + 0.006, sx + 0.0215, by + 0.0545, 0.0075).getPoints(4).map(v => [v.x, v.y]), [rrect(sx - 0.0215 + H5.hw, by + 0.006 + H5.hw, sx + 0.0215 - H5.hw, by + 0.0545 - H5.hw, 0.0075 - H5.hw)]);
        xsec(p, hd, H5.z0 - 0.002, H5.z1 + 0.002, GM.metal, 0.0005); }                                                       // the hood
      box(p, 0.027, 0.0145, 0.0015, GM.metal2, sx, by + 0.0135, H5.z0 - 0.0005);                                              // the button panel
      [-1, 1].forEach(sd => { box(p, 0.0068, 0.0056, 0.0016, GM.rubber, sx + sd * 0.0072, by + 0.0108, H5.z0 - 0.0013); [by + 0.0075, by + 0.0185].forEach(yy => cyl(p, 0.0013, 0.0012, GM.steel, sx + sd * 0.0112, yy, H5.z0 - 0.0013, 8)); });
      cyl(p, 0.0032, 0.0016, GM.rubber, sx, by + 0.0168, H5.z0 - 0.0013, 14);
      const gl = box(p, H5.ww * 2, H5.wh * 2, 0.0015, GM.holoGlass, sx, H5.wy, H5.z1 - 0.003); gl.rotation.x = -0.06;
      reticleOn(p, 'holo', sx, H5.wy, H5.z1 - 0.0065, H5.ww * 2, H5.wh * 2);   // (its reticle, out at infinity, seen through the window: effects/scope-view.js)
      p.userData.optic = { kind: 'holo', x: sx, y: H5.wy, zr: H5.z0, zf: H5.z1, r: H5.ww, hw: H5.ww, hh: H5.wh };
    } else {   // micro red dot
      box(p, 0.034, 0.016, 0.05, GM.metal, sx, by + 0.006, bz);                                        // its base, set down on the rail and up into the tube
      // the tube, open to look through, and its thicker front ring round the lens
      lathe(p, [[0.0165, bz - 0.0275], [0.019, bz - 0.0275], [0.019, bz + 0.023], [0.0165, bz + 0.023], [0.0165, bz - 0.0275]], GM.metal, sx, by + 0.032, 28);
      lathe(p, [[0.0165, bz + 0.023], [0.021, bz + 0.023], [0.021, bz + 0.033], [0.0165, bz + 0.033], [0.0165, bz + 0.023]], GM.metal2, sx, by + 0.032, 28);
      cyl(p, 0.016, 0.003, GM.glass, sx, by + 0.032, bz + 0.0335, 18); reticleOn(p, 'dot', sx, by + 0.032, bz + 0.031, 0.0155);   // the lens on the front ring, its dot seen through it out at infinity (effects/scope-view.js)
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 8), GM.metal2); tt.position.set(sx, by + 0.055, bz); p.add(tt);
      p.userData.optic = { kind: 'dot', x: sx, y: by + 0.032, zr: bz - 0.0285, zf: bz + 0.0335, r: 0.016 };
    }
  }
  if (gunAtt(tierCtx, 'stock') && side) {   // a folding brace off the back of the grip
    [-0.02, 0.02].forEach(o => box(g, 0.01, 0.01, 0.24, GM.metal2, X + o, y - 0.05, 0.4)); box(g, 0.05, 0.13, 0.03, GM.poly, X, y - 0.07, 0.27); box(g, 0.054, 0.14, 0.012, GM.rubber, X, y - 0.07, 0.252);
  }
  return front;
}
// a handgun's red dot (its first sight step; its second puts the holographic sight on instead), cut into the slide, after
// the four you see most, each its true size: a Trijicon RMR, its hood a shield, the sides raked in to a flat top; an SRO,
// the RMR's base under a big round window with the battery cap on top; a Holosun 507C, a squared shroud with flat sides,
// the solar panel on top at the back, the battery tray in the right side and the buttons in the left; a Leupold
// DeltaPoint Pro, wide and tall with the biggest window and a rear-sight notch across its back. PDOT: its length, width
// and height, the window's middle up from the base and its half width and height, the hood's depth, its dot (MOA).
// Which one a gun has is dealt once a run (W8.rds) and goes to your teammates with your loadout (net/arsenal.js)
const PDOT = {
  rmr: { L: 0.045, W: 0.0255, H: 0.025, wy: 0.0155, ww: 0.0105, wh: 0.0058, hood: 0.017, moa: 3.25,
    out: [[-0.01275, 0.004], [0.01275, 0.004], [0.01275, 0.0115], [0.0108, 0.0225], [0.0065, 0.025], [-0.0065, 0.025], [-0.0108, 0.0225], [-0.01275, 0.0115]] },
  sro: { L: 0.049, W: 0.027, H: 0.033, wy: 0.0195, ww: 0.0118, wh: 0.0118, hood: 0.015, moa: 2.5, round: true },
  h507: { L: 0.044, W: 0.026, H: 0.025, wy: 0.0155, ww: 0.0102, wh: 0.0062, hood: 0.03, moa: 2, cr: 0.002,
    out: [[-0.013, 0.004], [0.013, 0.004], [0.013, 0.0205], [0.0105, 0.025], [-0.0105, 0.025], [-0.013, 0.0205]] },
  dpp: { L: 0.044, W: 0.03, H: 0.03, wy: 0.0178, ww: 0.0122, wh: 0.0086, hood: 0.02, moa: 2.5, cr: 0.003,
    out: [[-0.015, 0.004], [0.015, 0.004], [0.0148, 0.0235], [0.0128, 0.0285], [0.008, 0.03], [-0.008, 0.03], [-0.0128, 0.0285], [-0.0148, 0.0235]] }
};
const PDOT_KINDS = Object.keys(PDOT);
const PDOT_GLOW = 0.35;   // (a pistol's dot, a hand's length from your eye in a small window, drawn tight with little bloom: reticleOn)
const pdotOf = id => { const r = W8.rds || (W8.rds = {}); if (!PDOT[r[id]]) r[id] = PDOT_KINDS[Math.floor(Math.random() * PDOT_KINDS.length)]; return r[id]; };
function pistolDot(p, sx, by, bz, ret, kind) {
  const k = kind || pdotOf(tierCtx), Q = PDOT[k], zr = bz - Q.L / 2, zf = bz + Q.L / 2, wy = by + Q.wy, low = by + Q.wy - Q.wh;
  box(p, Q.W, low - by, Q.L, GM.metal, sx, (by + low) / 2, bz);   // the base, down in the slide's cut, up to the window's foot
  // the hood round the window, its front a little rounded off
  let hood;
  if (Q.round) {
    const R = Q.W / 2, o = [[sx - R, by + 0.004], [sx + R, by + 0.004]]; for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; o.push([sx + R * Math.cos(a), wy + R * Math.sin(a)]); }
    const h = new THREE.Path(); h.absarc(sx, wy, Q.ww, 0, Math.PI * 2, false); hood = shp(o, [h]);
  } else {
    const hole = Q.cr ? rrect(sx - Q.ww, wy - Q.wh, sx + Q.ww, wy + Q.wh, Q.cr) : shp([[-Q.ww, -Q.wh], [Q.ww, -Q.wh], [Q.ww, 0.001], [Q.ww - 0.003, Q.wh], [0.003 - Q.ww, Q.wh], [-Q.ww, 0.001]].map(([x, y]) => [sx + x, wy + y]));
    hood = shp(Q.out.map(([x, y]) => [sx + x, by + y]), [hole]);
  }
  xsec(p, hood, zf - Q.hood, zf, GM.metal, 0.0005);
  // the glass at the front, tinted, and the dot (or circle-dot) seen through it out at infinity (effects/scope-view.js)
  if (Q.round) cyl(p, Q.ww, 0.0012, GM.holoGlass, sx, wy, zf - 0.003, 24); else box(p, Q.ww * 2, Q.wh * 2, 0.0012, GM.holoGlass, sx, wy, zf - 0.003);
  reticleOn(p, ret, sx, wy, zf - 0.0065, Q.round ? Q.ww : Q.ww * 2, Q.round ? 0 : Q.wh * 2, Q.moa, PDOT_GLOW);
  // the emitter on the base at the back, its LED looking forward at the glass
  box(p, 0.0042, 0.0026, 0.0032, GM.rubber, sx, low + 0.0013, zr + 0.0065); box(p, 0.0016, 0.001, 0.0004, GM.dotR, sx, low + 0.0014, zr + 0.0083);
  const btn = (x, z) => box(p, 0.0014, 0.0042, 0.0062, GM.rubber, x, by + 0.006, z);
  if (k === 'rmr' || k === 'sro') {
    [-1, 1].forEach(sd => btn(sx + sd * (Q.W / 2 + 0.0005), zr + 0.012));   // its two buttons, one each side
    const el = cyl(p, 0.0026, 0.001, GM.metal2, sx + 0.0055, low + 0.0005, zr + 0.0115, 12); el.rotation.x = Math.PI / 2;   // the elevation screw on top
    cyl(p, 0.0024, 0.001, GM.metal2, sx + Q.W / 2 + 0.0005, by + 0.0062, zr + 0.0035, 12).rotation.z = Math.PI / 2;           // the windage screw in the side
    if (k === 'sro') { const cap = cyl(p, 0.0062, 0.0018, GM.metal2, sx, wy + Q.W / 2 - 0.0004, zf - Q.hood / 2, 20); cap.rotation.x = Math.PI / 2; }   // the battery cap on top
  } else if (k === 'h507') {
    box(p, 0.016, 0.0006, 0.009, GM.glass, sx, by + Q.H + 0.0003, zf - Q.hood + 0.0065);              // the solar panel
    box(p, 0.0012, 0.0085, 0.014, GM.metal2, sx + Q.W / 2 + 0.0006, by + 0.011, zf - Q.hood + 0.013);   // the battery tray
    [-0.0035, 0.0035].forEach(o => box(p, 0.0012, 0.0038, 0.0038, GM.rubber, sx - Q.W / 2 - 0.0006, by + 0.0118, zf - Q.hood + 0.013 + o));   // its - and + buttons
  } else {   // the DeltaPoint's rear sight: two ears across its back, a square notch between them
    [-1, 1].forEach(sd => box(p, 0.0095, wy - 0.003 - low, 0.0036, GM.metal, sx + sd * 0.0072, (low + wy - 0.003) / 2, zr + 0.0022));
  }
  p.userData.optic = { kind: 'dot', x: sx, y: wy, zr, zf, r: Math.min(Q.ww, Q.wh), hw: Q.ww, hh: Q.wh };
}
// the ACOG (the fourth sight step): a Trijicon TA31 on its flat-top mount, traced off a side-on photo with the
// trace-photo skill (.claude/skills/trace-photo) at its true size, z along it from its middle and y up from the rail's
// top (solid keeps each traced outline to its size, rounding its edges inside it). It's round, like the real one: the
// eyepiece, the body widening from the tube to the hood, and the hood, an open round sunshade cut back on a slant at
// the front (HOOD) with the objective recessed in it, all on one axis. Over them the shroud fin with the red fibre
// optic down its top between two lips; under them the scope's narrow foot standing on the mount's clamp (its front
// rising to the hood as a thin horn with a hole through it), a clamp bar down its left side and two cross bolts
// through both, a knurled thumb nut out on a collar on each. The elevation cap on top and the windage cap on the left
// of the tube, the ocular housing behind (a round collar with a lobe at each corner, screwed from behind, bridged flat
// across the top and bottom) and the eyepiece, its rubber cup open round the lens. Its parts were then checked against
// the three-quarter photos too, each through a camera fitted to that photo (trace-photo's pose, diff and fit)
const ACOG = {
  base: [[0.1005, 0.00009], [0.00301, 0.00013], [-0.01534, 0.00028], [-0.01585, 0.00046], [-0.01605, 0.00117], [-0.01617, 0.01251], [-0.016, 0.01612], [-0.01612, 0.0164], [-0.0164, 0.01659], [-0.01789, 0.01663], [-0.01863, 0.01683], [-0.01886, 0.01732], [-0.01898, 0.0186], [0.09845, 0.01863], [0.09901, 0.0182], [0.09986, 0.01785], [0.10015, 0.01755], [0.10088, 0.01633], [0.10111, 0.0152], [0.1014, 0.01137], [0.10119, 0.00166], [0.101, 0.0005]],
  // the scope's foot under the body and the mount's horn in front of it, one narrow piece (cut off inside the body and
  // the hood's wall, its bottom sunk into the clamp so no seam opens between them), and the shroud fin over it (likewise)
  foot: [[0.0988, 0.015], [-0.01888, 0.015], [-0.01898, 0.0186], [-0.01931, 0.0293], [-0.01978, 0.0305], [-0.02016, 0.03081], [-0.02105, 0.03128], [-0.02104, 0.05006], [0.04, 0.05006], [0.04, 0.037], [0.0735, 0.037], [0.0775, 0.0355], [0.0815, 0.0335], [0.0855, 0.031], [0.089, 0.028], [0.092, 0.0248], [0.0948, 0.0215], [0.0968, 0.0186], [0.0975, 0.015]],
  hole: [0.0872, 0.0255, 0.0034],   // [z, y, r]: through the horn, as in the three-quarter photos
  fin: [[0.09609, 0.0847], [0.0402, 0.0847], [0.0402, 0.07397], [-0.00422, 0.07397], [-0.00425, 0.08194], [-0.00204, 0.08258], [-0.00126, 0.08321], [0.00025, 0.08383], [0.01328, 0.08743], [0.02568, 0.09017], [0.03936, 0.09286], [0.05105, 0.09471], [0.07117, 0.09682], [0.07478, 0.09768], [0.08576, 0.09988], [0.0881, 0.10015], [0.08959, 0.10012], [0.09186, 0.09955], [0.09398, 0.09842], [0.09604, 0.09755], [0.0976, 0.09605], [0.09823, 0.09469], [0.0986, 0.09313], [0.09858, 0.09129], [0.09837, 0.09009], [0.0972, 0.08732], [0.09628, 0.08591]],
  // the ocular housing, from z0 to z1: a round collar (core: its radius) a little over the tube's, a lobe at each corner
  // (ex, ey: its centre's offset from the axis, er: its radius) blended into it (k), and flat bridges joining the two top
  // lobes and the two bottom ones; sized by fitting it to all three photos at once
  housing: { z0: -0.0633, z1: -0.0364, core: 0.0212, ex: 0.0205, ey: 0.0175, er: 0.0077, k: 0.005 },
  // the eyepiece [r, z]: its metal tube out of the housing, then the rubber cup, rolled over at its lip and back in to
  // the lens, which sits recessed in it
  eyeMetal: [[0.0196, -0.0905], [0.01961, -0.08991], [0.01944, -0.08566], [0.01952, -0.08268], [0.01991, -0.08141], [0.02009, -0.07985], [0.02027, -0.07276], [0.02029, -0.0625]],
  eyeCup: [[0.0152, -0.0968], [0.0155, -0.0997], [0.016, -0.1008], [0.0166, -0.1011], [0.01735, -0.09926], [0.01843, -0.09869], [0.01956, -0.09784], [0.02035, -0.09671], [0.0207, -0.09501], [0.0208, -0.09303], [0.02062, -0.09218], [0.0199, -0.0905]],
  body: [[0.0208, -0.064], [0.0208, -0.004], [0.0214, 0.006], [0.0232, 0.02], [0.0232, 0.043]],   // [r, z]: the tube, widening to the hood
  turret: { z: -0.01805, rz: [[0.01316, 0.081], [0.01316, 0.08389], [0.01289, 0.08545], [0.01275, 0.0887], [0.01287, 0.08941], [0.01349, 0.09069], [0.01355, 0.09125], [0.0134, 0.09196], [0.01279, 0.09253], [0.01265, 0.09281], [0.01333, 0.09366], [0.01353, 0.09409], [0.01364, 0.09508], [0.01351, 0.09593], [0.01325, 0.09636], [0.01209, 0.09678], [0.0121, 0.09735], [0.01149, 0.0982], [0.00944, 0.09876], [0.006, 0.09919]] },   // [r, y], up the cap
  axis: 0.06131, wind: [-0.02027, 0.05428, 0.01467], bolts: [[0.00451, 0.00723, 0.00415], [0.08481, 0.00682, 0.00367]],
  fibre: [[0.00025, 0.08383], [0.02568, 0.09017], [0.0612, 0.0958]]
};
// the mount: its clamp's width (the rail's own width and a jaw either side), the clamp bar down its left side (from x
// bar[0] to bar[1]), the scope's foot's width, and the thumb nuts: on a collar (collarR) out from the bar to nutX, then
// the knurled knob nutT thick, nutR round, at height nutY; the nuts' size and how far out they stand fitted to the
// three-quarter photos
const MOUNT = { w: 0.034, bar: [0.0165, 0.0235], foot: 0.017, collarR: 0.0075, nutX: 0.033, nutR: 0.0124, nutT: 0.0085, nutY: 0.0095 };
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
// the ocular housing's outline as a distance from its edge across the axis (negative inside): the collar, the corner
// lobes and the flat bridges between the top two and the bottom two, each blended smoothly into the next (k)
function housingField(H) {
  const smin = (a, b) => { const h = Math.max(H.k - Math.abs(a - b), 0) / H.k; return Math.min(a, b) - h * h * H.k / 4; };
  const boxD = (x, y, hx, hy) => { const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0); };
  return (x, y) => {
    let d = Math.hypot(x, y) - H.core;
    for (const a of [-1, 1]) for (const c of [-1, 1]) d = smin(d, Math.hypot(x - a * H.ex, y - c * H.ey) - H.er);
    for (const c of [-1, 1]) d = smin(d, boxD(x, y - c * H.ey, H.ex, H.er));
    return d;
  };
}
function acog(p, sx, by, cz) {
  const A = GM.ano, at = pts => pts.map(([z, y]) => [cz + z, by + y]), ay = by + ACOG.axis, H = HOOD;
  // ---- the mount: its clamp on the rail, the clamp bar down its left side (rounded at its ends), a cross bolt through
  // both at each end, its head showing on the right and a knurled thumb nut out on a collar on the left (a slot across
  // its face); the scope's narrow foot standing on the clamp, its horn rising to the hood with a hole through it
  solid(p, at(ACOG.base), MOUNT.w, A, sx, 0.0015);
  { const [b0, b1] = MOUNT.bar, r = 0.004, z0 = -0.0155, z1 = 0.0975, y0 = 0.0012, y1 = 0.0165, pts = [];
    [[z1 - r, y1 - r], [z0 + r, y1 - r], [z0 + r, y0 + r], [z1 - r, y0 + r]].forEach(([qz, qy], q) => { for (let i = 0; i <= 4; i++) { const a = (q + i / 4) * Math.PI / 2; pts.push([qz + Math.cos(a) * r, qy + Math.sin(a) * r]); } });
    solid(p, at(pts), b1 - b0, A, sx + (b0 + b1) / 2, 0.0015); }
  ACOG.bolts.forEach(([z, y, r]) => {
    cyl(p, r, MOUNT.w + 0.003, GM.metal2, sx, by + y, cz + z, 12).rotation.set(0, 0, Math.PI / 2);
    const ny = by + MOUNT.nutY, c0 = sx + MOUNT.bar[1] - 0.001, c1 = sx + MOUNT.nutX, nx = c1 + MOUNT.nutT / 2;
    cyl(p, MOUNT.collarR, c1 - c0, A, (c0 + c1) / 2, ny, cz + z, 18).rotation.set(0, 0, Math.PI / 2);   // its collar
    cyl(p, MOUNT.nutR, MOUNT.nutT, A, nx, ny, cz + z, 24).rotation.set(0, 0, Math.PI / 2);
    for (let k = 0; k < 24; k++) { const t = k / 24 * Math.PI * 2; box(p, MOUNT.nutT * 0.9, 0.0016, 0.0016, GM.rubber, nx, ny + Math.cos(t) * MOUNT.nutR, cz + z + Math.sin(t) * MOUNT.nutR).rotation.x = t; }   // knurling
    box(p, 0.0012, 0.0016, MOUNT.nutR * 1.2, GM.rubber, nx + MOUNT.nutT / 2, ny, cz + z);   // the slot
  });
  { const [hz, hy, hr] = ACOG.hole, b = 0.002, h = new THREE.Path(); h.absarc(cz + hz, by + hy, hr + b, 0, Math.PI * 2, true);   // the bevel closes a hole in by its size
    solid(p, at(ACOG.foot), MOUNT.foot, A, sx, b, [h]); }
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
  // ---- the elevation cap on top, the windage cap on the left (on the same side as the mount's thumb nuts, as in the photos)
  { const pts = ACOG.turret.rz.map(([r, y]) => new THREE.Vector2(r, y)); pts.unshift(new THREE.Vector2(0, pts[0].y)); pts.push(new THREE.Vector2(0, pts[pts.length - 1].y));
    const t = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), A); t.position.set(sx, by, cz + ACOG.turret.z); t.castShadow = true; p.add(t); }
  { const [z, y, r] = ACOG.wind, tr = ACOG.body[0][0]; cyl(p, r * 0.9, 0.006, A, sx + tr + 0.001, by + y, cz + z, 20).rotation.set(0, 0, Math.PI / 2); cyl(p, r, 0.006, A, sx + tr + 0.006, by + y, cz + z, 24).rotation.set(0, 0, Math.PI / 2); }
  // ---- the ocular housing: its outline walked round the axis to where the field crosses (less the bevel, which adds
  // it back), a hex-socket screw in the back of each lobe
  const Hs = ACOG.housing;
  { const b = 0.0015, f = housingField(Hs), sh = new THREE.Shape(), n = 120;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); let lo = 0, hi = 0.05;
      for (let j = 0; j < 24; j++) { const m = (lo + hi) / 2; if (f(c * m, s * m) < -b) lo = m; else hi = m; }
      i ? sh.lineTo(sx + c * lo, ay + s * lo) : sh.moveTo(sx + c * lo, ay + s * lo);
    }
    xsec(p, sh, cz + Hs.z0 + b, cz + Hs.z1 - b, A, b); }
  [-1, 1].forEach(a => [-1, 1].forEach(c => {
    const ex = sx + a * Hs.ex, ey = ay + c * Hs.ey;
    cyl(p, 0.0032, 0.0016, GM.metal2, ex, ey, cz + Hs.z0 - 0.0006, 12); box(p, 0.0024, 0.0024, 0.0008, GM.rubber, ex, ey, cz + Hs.z0 - 0.0014);   // the screw and its socket
  }));
  // ---- the eyepiece: its metal tube, then the rubber cup open round the lens, a small tab on its left
  lathe(p, ACOG.eyeMetal.map(([r, z]) => [r, cz + z]), A, sx, ay, 32);
  lathe(p, ACOG.eyeCup.map(([r, z]) => [r, cz + z]), GM.rubber, sx, ay, 32);
  cyl(p, 0.0153, 0.0015, GM.glass, sx, ay, cz - 0.0968, 28);
  box(p, 0.006, 0.0085, 0.013, A, sx + 0.0215, ay - 0.002, cz - 0.0885);
}
// the guns that take a flashlight taped on at the first light tier (and their own weapon light at the second); every
// other gun takes a weapon light at both (weaponLight)
const TAPED_LIGHT = new Set(['ar', 'lmg', 'pump', 'dbl', 'hunting']);
// a weapon light, clamped onto a rail under the gun (at: the rail's underside y, and the middle z a laser would have there;
// in a group turned to stand out from a side rail, x its middle there and root the gun), its front no further out than
// the muzzle (mz). The first tier (tier) is a chunky one, after a Streamlight TLR-1: a squared-off grey aluminium body
// with its screws showing, flaring into a bigger head round the lens, chunky switch paddles at the back. The second is
// slim and modern, after a SureFire X300 Ultra: a lighter, rounded black body, the head flush with it, a thin bezel,
// cut-outs along its sides and slim paddles. With a laser on the gun too (laserT, its tier) it's all one unit, deeper,
// the laser's window under the lens (red for the pointer, green for the module), and the beam starts there
// (weapons/laser.js)
const WLIGHT = {
  1: { L: 0.1, w: 0.038, h: 0.036, hl: 0.048, r: 0.005, flare: 0.004, head: 0.026, mat: () => GM.metal2, lens: 0.0145, paddle: [0.005, 0.022, 0.016] },
  2: { L: 0.084, w: 0.031, h: 0.027, hl: 0.038, r: 0.011, flare: 0.0012, head: 0.02, mat: () => GM.metal, lens: 0.0125, paddle: [0.003, 0.016, 0.012] }
};
function weaponLight(g, at, mz, laserT, tier, x, root) {
  const W_ = WLIGHT[tier] || WLIGHT[2], X0 = x ?? X, u = at.y - 0.002, L = W_.L, z1 = Math.min(at.z + 0.063, mz - 0.004), z0 = z1 - L, w = W_.w, h = laserT ? W_.hl : W_.h, M = W_.mat();
  const rr = (x0, y0, x1, y1, r) => shp(rrect(x0, y0, x1, y1, r).getPoints().map(p => [p.x, p.y]));
  box(g, w * 0.7, 0.006, 0.04, GM.metal2, X0, u - 0.001, z0 + 0.032);                                                     // the clamp, up on the rail
  xsec(g, rr(X0 - w / 2, u - h, X0 + w / 2, u - 0.004, W_.r), z0, z1 - W_.head, M, 0.0015);                             // the body
  const f = W_.flare;
  xsec(g, rr(X0 - w / 2 - f, u - h - f, X0 + w / 2 + f, u - 0.002, W_.r + f), z1 - W_.head, z1 - 0.002, M, 0.0015);       // the head
  const ly = laserT ? u - h * 0.42 : u - h * 0.53;
  ring(g, W_.lens + 0.0025, 0.004, GM.metal2, X0, ly, z1 - 0.0005); cyl(g, W_.lens, 0.002, GM.lens, X0, ly, z1 + 0.0018, 24);   // the bezel and the lens, just proud of it
  lightEm(g, X0, ly, z1 + 0.004, root);
  const [pw, ph, pd] = W_.paddle;
  [-1, 1].forEach(s => { box(g, pw, ph, pd, GM.rubber, X0 + s * (w / 2 + pw / 2), u - h * 0.55, z0 + 0.01).rotation.x = 0.25; });   // the switch paddles, on its sides at the back
  if (tier === 1) [-1, 1].forEach(s => [0.3, 0.62].forEach(t => box(g, 0.0015, 0.005, 0.005, GM.metal, X0 + s * (w / 2 + 0.0008), u - h * 0.45, z0 + L * t)));   // its screws
  else [-1, 1].forEach(s => box(g, 0.0012, h * 0.3, L * 0.38, GM.rubber, X0 + s * (w / 2 + 0.0004), u - h * 0.5, z0 + L * 0.42));   // the cut-outs along its sides
  if (!laserT) return;
  const ey = u - h + 0.0075, em = new THREE.Object3D();
  box(g, 0.012, 0.007, 0.003, laserT === 2 ? GM.laserG : GM.red, X0, ey, z1 + 0.0008); em.position.set(X0, ey, z1 + 0.003);
  em.userData.isLaser = true; g.add(em); (root || g).userData.laserEm = em;
}
// where a weapon light's beam comes out: a marker just off its lens, found on the gun in your hands (lightEm: its
// beam's lit from there, lighting/lightmap.js)
function lightEm(g, x, y, z, root) { const em = new THREE.Object3D(); em.position.set(x, y, z); em.userData.isLightEm = true; g.add(em); (root || g).userData.lightEm = em; }
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
// a riser after the Unity Tactical FAST, under the machine pistol's red dot so you see over the front sight and a can:
// its slim body clamped to the rail (a plate down its left side, two bolts through it), standing RISER.h tall at the
// back, its top rail running on past the front of the base and the underside sloping back down to it there, the rail's
// cross slots along the top. The optic goes on its top (what it gives back: the height of its rail)
const RISER = { h: 0.026, len: 0.072, w: 0.021, over: 0.022, slots: 7 };
function unityRiser(p, x, by, bz) {
  const R = RISER, z0 = bz - R.len / 2, z1 = bz + R.len / 2, top = by + R.h, zb = z1 - R.over;
  profile(p, shp([[z0, by], [zb, by], [z1 - 0.002, top - 0.007], [z1, top - 0.006], [z1, top], [z0 + 0.003, top], [z0, top - 0.003]]), R.w, GM.metal, x, 0.0008);   // the body, sloped under the front
  for (let k = 0; k < R.slots; k++) box(p, R.w + 0.001, 0.0032, 0.0045, GM.metal2, x, top - 0.0012, z0 + 0.008 + k * (R.len - 0.016) / (R.slots - 1));   // the rail's ribs (its slots between)
  box(p, 0.0026, 0.011, zb - z0 - 0.006, GM.metal2, x + R.w / 2 + 0.0012, by + 0.0055, (z0 + zb) / 2);   // the clamp plate down its left side
  [-1, 1].forEach(o => { const c = cyl(p, 0.0032, 0.003, GM.steel, x + R.w / 2 + 0.003, by + 0.0055, (z0 + zb) / 2 + o * (zb - z0) * 0.3, 10); c.rotation.set(0, 0, Math.PI / 2); });   // its two bolts
  return top - 0.002;   // (the dot's mount sits 2 mm down into its rail, as on any)
}
