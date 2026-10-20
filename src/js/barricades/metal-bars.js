// Metal grates over the doors and windows, once the sawhorse is a metalwork bench (forgeMetal): one piece of steel per
// opening in place of the three boards, a cage of rebar on the inside face and, tier by tier, steel plate bolted over
// more of the outside. How it wears under the blows, how it breaks, and the bench itself.

// a grate costs GRATE.cost metal (the plank count: S.planks) and takes GRATE.t of holding F at your boarding speed
// (boardRate: slower again in a wave) to bolt up, against BOARD_T for each board; GRATE.tear of holding C to wrench
// down. Bare, it's GRATE.over times as strong as three boards braced all the way (BRACE.max) together, times the
// hammers' S.boardMul, and each tier of plating (GRATE.up: its price, dearer each time) makes every grate GRATE.tierHp
// stronger again
const GRATE = { cost: 3, t: 2.6, tear: 2.4, over: 1.25, tierHp: 0.3, tiers: 5, rows: 5, up: [18, 26, 36, 48, 64], slitY: 1.45, slitH: 0.05, slitW: 0.24 };
const METAL_COST = 25;   // the metalwork bench itself, once the boards are braced all the way (BRACE.max)
const METAL_AID = 6;   // the Scrap metal aid card after a wave (upgrades/upgrades.js): two grates' worth
const METAL_DROP = 0.72;   // metal drops a little less often than planks (zombies/damage.js: the planks roll is 0.6 to 0.75)
const grateHp = () => 3 * BOARD_HP * braceMul(BRACE.max) * GRATE.over * S.boardMul * (1 + GRATE.tierHp * METAL.tier);
const GRATE_PLACE = 0.7, GRATE_BOLTS = [0.45, 0.66, 0.86];

// ---- the look: a cage of ribbed rebar between flat bar on the inside face, steel plate on the outside
const PLATE_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#d2d6da'; x.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 900; k++) { const v = (rand() * 40 - 20) | 0; x.fillStyle = `rgba(${170 + v},${176 + v},${182 + v},.4)`; x.fillRect(rand() * 128, rand() * 64, 1 + rand() * 2, 1); }   // mill scale
  for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(230,236,240,${0.08 + rand() * 0.12})`; x.lineWidth = 0.6; const sx = rand() * 128, sy = rand() * 64, a = rr(-0.5, 0.5), L = rr(8, 30); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke(); }   // scratches
  for (let k = 0; k < 6; k++) { const sx = rand() * 128, g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(120,64,30,.0)'); g.addColorStop(1, `rgba(120,64,30,${0.15 + rand() * 0.2})`); x.fillStyle = g; x.fillRect(sx, 20 + rand() * 20, 2 + rand() * 4, 44); }   // rust run down from the bottom
  x.strokeStyle = 'rgba(40,40,44,.45)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 125, 61);   // darker edges
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
})();
const GR_M = { frame: lam(0x3b3e42), strap: lam(0x4c4f53), rebar: lam(0x6a4f3c), rivet: lam(0x2c2e31), weld: lam(0x3a3430) };
const GR_PLATE = [0xb4bbc2, 0xa9b1b8, 0xbcc0c3, 0xa4abb1];
const REBAR_GEO = new Map();
// a length of ribbed rebar standing up from y 0 to L (a lathe: the ribs every 14 mm)
function rebarGeo(L) {
  const key = L.toFixed(3); if (REBAR_GEO.has(key)) return REBAR_GEO.get(key);
  const pts = [new THREE.Vector2(0, 0)], n = Math.max(4, Math.round(L / 0.014));
  for (let q = 0; q <= n; q++) pts.push(new THREE.Vector2(q % 2 ? 0.0122 : 0.0098, q / n * L));
  pts.push(new THREE.Vector2(0, L));
  const g = new THREE.LatheGeometry(pts, 7); REBAR_GEO.set(key, g); return g;
}
// where the grate sits in its opening (bg's frame: x along the wall, y up, z out of it by o.out): the window's frame from
// sill to head, a door's from the step to the lintel
const grateSpan = o => o.kind === 'door' ? { x: 0.47, y0: 0.03, y1: 2.08 } : { x: 0.46, y0: 1.0, y1: 1.9 };
// a little seeded shuffle, the same on every screen for the same opening and tier, so the plates come away and the
// bars give in the same order everywhere in co-op
function grRng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffled(n, rng) { const a = Array.from({ length: n }, (_, k) => k); for (let k = n - 1; k > 0; k--) { const j = (rng() * (k + 1)) | 0; [a[k], a[j]] = [a[j], a[k]]; } return a; }
function buildGrate(o, tier) {
  const { x: W, y0, y1 } = grateSpan(o), H = y1 - y0, out = o.out, zi = -0.538 * out, zo = 0.536 * out;
  const g = new THREE.Group(), G = { g, tier, plates: [], bars: [], straps: [], jolt: 0, disp: 1, shut: false, push: -1, place: 1, t: 0, y0, y1 };
  const rng = grRng(openings.indexOf(o) * 977 + tier * 131 + 7);
  // the inside frame: flat bar round the edge, bolted into the jambs, and the welds
  const fr = new THREE.Group(); g.add(fr);
  box(fr, W * 2, 0.045, 0.012, GR_M.frame, 0, y0 + 0.022, zi); box(fr, W * 2, 0.045, 0.012, GR_M.frame, 0, y1 - 0.022, zi);
  [-1, 1].forEach(s => { box(fr, 0.045, H, 0.012, GR_M.frame, s * (W - 0.022), (y0 + y1) / 2, zi); [y0 + 0.06, y1 - 0.06, (y0 + y1) / 2].forEach(y => ycyl(fr, 0.012, 0.012, 0.012, GR_M.rivet, s * (W - 0.022), y, zi - out * 0.008, 8).rotation.x = Math.PI / 2); });
  // the outside frame the plate is bolted to: angle iron up each jamb and across the head and sill
  [-1, 1].forEach(s => { box(fr, 0.04, H, 0.01, GR_M.frame, s * (W + 0.01), (y0 + y1) / 2, zo); box(fr, 0.01, H, 0.035, GR_M.frame, s * (W + 0.03), (y0 + y1) / 2, zo - out * 0.015); });
  box(fr, W * 2 + 0.06, 0.035, 0.01, GR_M.frame, 0, y0 + 0.018, zo); box(fr, W * 2 + 0.06, 0.035, 0.01, GR_M.frame, 0, y1 - 0.018, zo);
  mergeInto(fr, fr.children.slice());
  // the rebar: each bar welded top and bottom, in two halves meeting at its middle, so a bar beaten in kinks there
  const nb = 7, half = (H - 0.05) / 2, rg = rebarGeo(half), barTh = shuffled(nb, rng);
  for (let k = 0; k < nb; k++) {
    const bx = (k - (nb - 1) / 2) * (W * 2 - 0.12) / (nb - 1), z = zi - out * 0.004;
    const lo = new THREE.Group(); lo.position.set(bx, y0 + 0.025, z); g.add(lo);
    const hi = new THREE.Group(); hi.position.set(bx, y1 - 0.025, z); g.add(hi);
    const a = new THREE.Mesh(rg, GR_M.rebar); a.castShadow = true; lo.add(a);
    const b = new THREE.Mesh(rg, GR_M.rebar); b.castShadow = true; b.rotation.x = Math.PI; hi.add(b);   // (turned over: hanging down from the head)
    lo.rotation.y = hi.rotation.y = rng() * 6;
    G.bars.push({ lo, hi, half, th: 0.06 + 0.3 * barTh[k] / (nb - 1), on: true, ph: rng() * 6 });
  }
  // flat straps across the bars on the room side, welded at each crossing
  const ns = o.kind === 'door' ? 5 : 3, stTh = shuffled(ns, rng);
  for (let k = 0; k < ns; k++) {
    const sy = y0 + H * (k + 1) / (ns + 1), sp = new THREE.Group(); sp.position.set(-W + 0.03, sy, zi - out * 0.02); g.add(sp);
    box(sp, W * 2 - 0.06, 0.034, 0.008, GR_M.strap, W - 0.03, 0, 0);
    G.straps.push({ g: sp, th: 0.05 + 0.16 * stTh[k] / Math.max(1, ns - 1), on: true });
  }
  // the plate: tier rows of it, from the sill up, each its own sheet with rivets along its top and bottom; the row at
  // chest height left with a firing slit through it (GRATE.slit*). Each hangs, once it's worked loose, from the bolt
  // in one top corner, so its group stands at that corner
  const rows = GRATE.rows, rh = H / rows, slitRow = clamp(Math.floor((GRATE.slitY - y0) / rh), 0, rows - 1), cover = Math.min(rows, tier), fall = shuffled(cover, rng);
  for (let r = 0; r < cover; r++) {
    const side = rng() < 0.5 ? -1 : 1, top = y0 + (r + 1) * rh + 0.006, z = zo + out * (0.012 + r * 0.0025);
    const pg = new THREE.Group(); pg.position.set(side * W, top, z); g.add(pg);
    const mat = lam(GR_PLATE[(rng() * GR_PLATE.length) | 0], { map: PLATE_TEX }), hh = rh + 0.012, cx = -side * W;   // (the sheet's middle, from the corner)
    const sheet = (x0, x1, ya, yb) => { const m = box(pg, x1 - x0, yb - ya, 0.006, mat, cx + (x0 + x1) / 2, -hh + (ya + yb) / 2, 0); m.rotation.z = (rng() - 0.5) * 0.006; return m; };
    if (r === slitRow) {
      const sw = GRATE.slitW, sm = GRATE.slitY - (top - hh), s0 = sm - GRATE.slitH / 2, s1 = sm + GRATE.slitH / 2;
      sheet(-W, -sw, 0, hh); sheet(sw, W, 0, hh); sheet(-sw, sw, 0, s0); sheet(-sw, sw, s1, hh);
      [s0, s1].forEach(y => box(pg, sw * 2 + 0.02, 0.01, 0.022, GR_M.frame, cx, -hh + y + (y === s0 ? -0.005 : 0.005), out * 0.008));   // the slit's lips, bent out
    } else sheet(-W, W, 0, hh);
    const riv = [];
    for (let q = 0; q < 5; q++) [0.022, hh - 0.022].forEach(y => { const m = ycyl(pg, 0.009, 0.011, 0.008, GR_M.rivet, cx + (q - 2) * (W * 2 - 0.08) / 4, -hh + y, out * 0.006, 8); m.rotation.x = Math.PI / 2; riv.push(m); });
    mergeInto(pg, riv);
    G.plates.push({ g: pg, side, th: 0.84 - 0.4 * fall[r] / Math.max(1, cover - 1), on: true, ph: rng() * 6, z0: z, inT: 1 });   // (the first starts working loose at 0.96)
  }
  G.shut = G.plates.length >= 3;
  g.userData.place = 1;   // (the boards' own placing, lighting/day-night.js, leaves it alone)
  return G;
}
// a grate bolted up across o: hp and sd as addBoard's (a teammate's grate: how strong, which side they stood), h0 what
// it went up out of (its full strength, for how worn it looks)
function addGrate(o, hp, sd, h0) {
  if (o.boards.length) return;
  const mine = hp === undefined;
  o.boards.push(mine ? grateHp() : hp);
  const side = sd || Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1;
  const G = buildGrate(o, METAL.tier); G.hp0 = h0 || (mine ? o.boards[0] : Math.max(hp, grateHp())); G.disp = o.boards[0] / G.hp0;
  G.place = 0; G.side = o.out * side;
  o.grate = G; o.bg.add(G.g); o.meshes.push(G.g); grateStep(o, 0);
  if (mine) run.boards++;
  const clank = () => mine ? SFX.clang(0.55) : soundAt(o.x, o.z, () => SFX.clang(0.55));
  GRATE_BOLTS.forEach(k => setTimeout(clank, k * GRATE_PLACE * 1000));
  burst(o.x + o.nx * side * .55, (G.y0 + G.y1) / 2, o.z + o.nz * side * .55, 4, 'dust');
  flowDirty = true; lightsDirty = true;
}
// the plating changed (a tier bought): every grate is taken down and put back up with its new plate, made good, the
// sheets swinging in one after another
function regrate(o) {
  const G0 = o.grate; if (!G0) return;
  const h0 = G0.hp0 * (1 + GRATE.tierHp * METAL.tier) / (1 + GRATE.tierHp * G0.tier);
  o.bg.remove(G0.g); o.meshes.length = 0;
  const G = buildGrate(o, METAL.tier); G.hp0 = h0; o.boards[0] = h0; G.disp = 1;
  G.plates.forEach((p, k) => { p.inT = -k * 0.16; });
  o.grate = G; o.bg.add(G.g); o.meshes.push(G.g); grateStep(o, 0);
  lightsDirty = true;
}
// ---- wear: every frame, the grate as beaten as its hp says (eased, so a joiner's steps between the host's word on it
// don't jump): plate by plate it's worked loose, hangs from its top bolt and swings down, then drops off; with the
// plate gone the bars are beaten in, kinking at their middles, till they snap off their welds and fall; the straps go
// last. A blow shakes the lot
function grateStep(o, dt) {
  const G = o.grate; if (!G) return;
  G.t += dt; G.disp += (clamp(o.boards[0] / (G.hp0 || 1), 0, 1) - G.disp) * Math.min(1, dt * 6 || 1);
  const d = G.disp, j = G.jolt = Math.max(0, G.jolt - dt * 3.4), shk = Math.sin(G.t * 47) * j;
  // going up: the cage swung in from your side and eased onto the frame, settling as each bolt goes home
  if (G.place < 1) {
    G.place = Math.min(1, G.place + dt / GRATE_PLACE); const a = 1 - Math.pow(1 - G.place, 3), b = 1 - a;
    let knock = 0; for (const n of GRATE_BOLTS) { const e = (G.place - n) / 0.1; if (e > 0 && e < 1) knock += Math.sin(e * Math.PI) * (1 - e); }
    G.g.position.set(0, -b * 0.12, G.side * (b * 0.35 - knock * 0.01)); G.g.rotation.x = -b * 0.12 * G.side;
  } else { G.g.position.set(shk * 0.006, 0, 0); G.g.rotation.x = 0; }
  let held = 0;
  for (const p of G.plates) {
    if (!p.on) continue;
    if (d < p.th) { plateOff(o, p); continue; }
    held++;
    const loose = smooth(clamp((p.th + 0.12 - d) / 0.12, 0, 1));
    if (p.inT < 1) p.inT = Math.min(1, p.inT + dt * 3.2);
    const k = clamp(p.inT, 0, 1), sl = 1 - (1 - Math.pow(1 - k, 3));
    // hanging from its bolt, the free corner dropping and the sheet standing off the frame, rattling when hit
    p.g.rotation.z = p.side * (0.42 * loose + Math.sin(G.t * 31 + p.ph) * j * (0.015 + 0.05 * loose));
    p.g.position.z = p.z0 + o.out * (0.03 * loose + sl * 0.08);
    p.g.position.y = p.g.userData.y0 === undefined ? (p.g.userData.y0 = p.g.position.y) : p.g.userData.y0 + sl * 0.3;
    p.g.visible = p.inT > 0;
  }
  const shut = held >= 3; if (shut !== G.shut) { G.shut = shut; lightsDirty = true; }
  for (const b of G.bars) {
    if (!b.on) continue;
    if (d < b.th) { barOff(o, b); continue; }
    // beaten in from the side it's struck from (G.push), the two halves kinking at the middle
    const bend = smooth(clamp((b.th + 0.15 - d) / 0.15, 0, 1)) * 0.3 + Math.sin(G.t * 39 + b.ph) * j * 0.012, s = G.push * o.out;
    b.lo.rotation.x = s * bend; b.hi.rotation.x = -s * bend;
  }
  for (const s of G.straps) {
    if (!s.on) continue;
    if (d < s.th) { strapOff(o, s); continue; }
    s.g.rotation.z = -0.35 * smooth(clamp((s.th + 0.08 - d) / 0.08, 0, 1)) + Math.sin(G.t * 43) * j * 0.01;   // (sagging from its far weld)
  }
}
// pieces of grate on the ground: steel that clangs where it lands (weapons/casings.js's debris), a while, then gone
const looseMetal = [];
function metalOff(m, o, kind, r, lay, f) {
  m.updateMatrixWorld(true); const wp = new V3(), wq = new THREE.Quaternion(); m.getWorldPosition(wp); m.getWorldQuaternion(wq);
  m.parent.remove(m); m.rotation.order = 'YXZ'; m.position.copy(wp); m.quaternion.copy(wq); scene.add(m);
  const sd = -(o.grate ? o.grate.push : 1), ox = o.nx * sd, oz = o.nz * sd, k = f || 1;
  looseMetal.push({ g: m, life: 30, vx: ox * rr(0.4, 1.4) * k + rr(-0.4, 0.4), vy: rr(0.2, 1.2) * k, vz: oz * rr(0.4, 1.4) * k + rr(-0.4, 0.4), spin: rr(-4, 4) * k, roll: rr(-4, 4) * k, r, bounces: 0, kind, restY: r, rest: lay });
  while (looseMetal.length > 60) { const q = looseMetal.shift(); scene.remove(q.g); }
}
const layFlat = q => q.rotation.set(Math.PI / 2, rr(0, 6.3), 0), layBar = q => q.rotation.set(0, rr(0, 6.3), Math.PI / 2);
function plateOff(o, p) {
  p.on = false; metalOff(p.g, o, 'plate', 0.012, layFlat);
  if (visAt(o.x, o.z) > 0.15) { const w = p.g.position; sparkBurst(w.x, w.y, w.z, 6, o.nx, o.nz, 1.6); burst(w.x, w.y, w.z, 3, 'dust'); }
  soundAt(o.x, o.z, () => SFX.clang(0.8));
}
function barOff(o, b) {
  b.on = false; metalOff(b.lo, o, 'bar', 0.012, layBar); metalOff(b.hi, o, 'bar', 0.012, layBar);
  if (visAt(o.x, o.z) > 0.15) { const w = b.lo.position; sparkBurst(w.x, w.y + b.half, w.z, 8, o.nx * o.grate.push, o.nz * o.grate.push, 2); }
  soundAt(o.x, o.z, () => SFX.snapMetal());
}
function strapOff(o, s) { s.on = false; metalOff(s.g, o, 'bar', 0.006, layFlat); soundAt(o.x, o.z, () => SFX.clang(0.5)); }
// a blow on the grate (boardJolt): the lot shakes in its bolts, sparks and flakes of paint and rust fly off where it
// landed, and it rings; a brute's (big) twice as hard
function grateJolt(o, z, big) {
  const G = o.grate; if (!G) return;
  G.jolt = Math.min(1.4, G.jolt + (big ? 1.1 : 0.7));
  if (!z) return;
  const sd = openSide(o, z.x, z.z); G.push = -sd;
  const along = rr(-0.38, 0.38), ax = o.axis === 'x' ? along : 0, az = o.axis === 'x' ? 0 : -along, y = rr(G.y0 + 0.12, Math.min(G.y1 - 0.08, G.y0 + 1.5));
  const x = o.x + o.nx * sd * 0.57 + ax, zz = o.z + o.nz * sd * 0.57 + az;
  if (z.vis === undefined || z.vis > 0.2) {
    sparkBurst(x, y, zz, (big ? 9 : 3) + ((rand() * 3) | 0), o.nx * sd, o.nz * sd, big ? 2.6 : 1.8);
    fx('debris', x, y, zz, o.nx * sd * rr(0.6, 1.4), rr(0.2, 0.8), o.nz * sd * rr(0.6, 1.4), 0.06, rr(0.25, 0.4), rr(0.3, 0.45), 0.7);
    if (G.plates.some(p => p.on)) for (let k = 0; k < (big ? 3 : 1); k++) flake(x, y, zz, o.nx * sd, o.nz * sd);
    else if (rand() < 0.5) burst(x, y, zz, 2, 'dust', o.nx * sd, o.nz * sd, 0.8);   // rust shaken off the bare bars
  }
  soundAt(o.x, o.z, () => SFX.clang(big ? 1 : 0.6), true);
}
// a flake of paint or rust knocked off a plate, fluttering down
const FLAKE_GEO = new THREE.BoxGeometry(1, 1, 1), FLAKE_M = [lam(0x8e8a80), lam(0x7a4a2c), lam(0x9aa0a6)];
function flake(x, y, z, dx, dz) {
  const m = new THREE.Mesh(FLAKE_GEO, FLAKE_M[(rand() * FLAKE_M.length) | 0]); m.scale.set(rr(0.015, 0.035), rr(0.012, 0.03), 0.003); m.position.set(x, y, z); scene.add(m);
  looseMetal.push({ g: m, life: rr(5, 9), vx: dx * rr(0.6, 1.6) + rr(-0.5, 0.5), vy: rr(0.4, 1.4), vz: dz * rr(0.6, 1.6) + rr(-0.5, 0.5), spin: rr(-12, 12), roll: rr(-12, 12), r: 0.003, bounces: 0, kind: 'flake', restY: 0.003, rest: layFlat });
  while (looseMetal.length > 60) { const q = looseMetal.shift(); scene.remove(q.g); }
}
// the grate torn out (breakBoard): what's left of it thrown toward whoever broke it, sparks everywhere, a crash of steel
function breakGrate(o, z) {
  const G = o.grate; o.boards.pop(); o.meshes.pop(); if (!G) return;
  const sd = z ? openSide(o, z.x, z.z) : -openSide(o, P.x, P.z); G.push = -sd;   // (metalOff throws it the other way to the push: toward sd)
  G.plates.forEach(p => { if (p.on) { p.on = false; metalOff(p.g, o, 'plate', 0.012, layFlat, 1.8); } });
  G.bars.forEach(b => { if (b.on) { b.on = false; metalOff(b.lo, o, 'bar', 0.012, layBar, 1.6); metalOff(b.hi, o, 'bar', 0.012, layBar, 1.6); } });
  G.straps.forEach(s => { if (s.on) { s.on = false; metalOff(s.g, o, 'bar', 0.006, layFlat, 1.6); } });
  o.bg.remove(G.g); o.grate = null;
  const x = o.x + o.nx * sd * 0.5, zz = o.z + o.nz * sd * 0.5, y = (G.y0 + G.y1) / 2;
  sparkBurst(x, y, zz, 22, o.nx * sd, o.nz * sd, 3); burst(x, y, zz, 8, 'dust', o.nx * sd, o.nz * sd, 2);
  soundAt(o.x, o.z, () => { SFX.snapMetal(); SFX.clang(1.2); }); setTimeout(() => soundAt(o.x, o.z, () => SFX.clang(0.9)), 90);
  flowDirty = true; lightsDirty = true;
}

// ---- the bench: the sawhorse made over into a metalwork bench. METAL is the team's (every window, every teammate's
// screen): on once anyone's built it, tier how much plate the grates carry
function forgeMetal() {
  applyMetal(true, 0, true); netMetal();
  feed('metal', 0, 'Metalwork bench built');
  gotGear({ ic: 'metal', kind: 'Sawhorse', name: 'Metalwork bench', text: `Bar windows and doors with steel grates, ${GRATE.cost} metal each. Tear the boards down first.` });
}
// on: whether there's a metalwork bench; tier: the grates' plating; fx: the bench changes in a cloud of smoke here.
// The boards already up stay up (tear them down to bar the opening instead); the planks you carry are no use now and
// gone, so you start on metal from nothing; the grates up are rebuilt for the new plate
function applyMetal(on, tier, fx) {
  const was = METAL.on, t0 = METAL.tier;
  METAL.on = on; METAL.tier = on ? tier : 0;
  if (on !== was) { benchLook(on, fx); metalIcons(on); }
  if (!on) return;
  if (!was) { S.planks = 0; popEl('planks'); }
  if (tier !== t0) for (const o of openings) if (o.grate) regrate(o);
}
// the sawhorse's model or the bench's: the swap made under a cloud of smoke (fx), the hammering and grinding heard
// through it; the bench's model is only built the first time it's wanted
function benchLook(on, fx) {
  const s = STATIONS.find(q => q.id === 'saw'); if (!s) return;
  const swap = () => {
    if (on && !s.metal) { s.metal = metalBenchModel(); s.g.add(s.metal); }
    if (s.metal) s.metal.visible = on; s.wood.visible = !on;
    s.name = on ? 'Metalwork bench' : 'Sawhorse';
    if (s.g.userData.ol) s.g.userData.ol.rad = 0;   // (its outline's measured again: effects/screen-outlines.js)
  };
  if (!fx) { swap(); return; }
  const p = s.g.position;
  for (let k = 0; k < 4; k++) setTimeout(() => { burst(p.x + rr(-0.5, 0.5), 0.4, p.z + rr(-0.25, 0.25), 9, 'smoke'); burst(p.x, 0.8, p.z, 4, 'dust'); }, k * 120);
  setTimeout(() => { swap(); sparkBurst(p.x, 0.95, p.z, 18, 0, -1, 2); SFX.clang(1); }, 200);
  [320, 520, 700].forEach(t => setTimeout(() => SFX.clang(0.7), t)); setTimeout(() => SFX.snapMetal(), 860);
}
// every planks icon on the screen (yours, a teammate's in the list) the I-beam once it's metal
function metalIcons(on) {
  document.querySelectorAll('svg[data-gi="planks"]').forEach(s => { s.innerHTML = on ? GI.metal : GI.planks; if (s.parentElement) s.parentElement.title = on ? 'Metal' : 'Planks'; });
}
// what you carry to bar the openings with, by name and by icon
const matWord = () => METAL.on ? 'metal' : 'planks', matKind = () => METAL.on ? 'metal' : 'planks';
// ---- the metalwork bench: a steel welding table with a grid of clamp holes, angle-iron legs, a mesh shelf under it
// piled with rebar and plate; a blue vise, a bench grinder, a welding helmet, an angle grinder and a strapped gas
// bottle, as the workbench is dressed in its tools
function metalBenchModel() {
  const g = new THREE.Group(), sil = m => { m.userData.sil = true; return m; };
  const top = lam(0x4a4e53), dark = lam(0x2f3236), leg = lam(0x3d4145), rust = lam(0x6e4a34), plate = lam(0x8d9399), blue = lam(0x2f5a86), green = lam(0x56705a);
  sil(box(g, 1.8, 0.05, 0.64, top, 0, 0.86, 0)); box(g, 1.8, 0.06, 0.012, leg, 0, 0.83, -0.32); box(g, 1.8, 0.06, 0.012, leg, 0, 0.83, 0.32);
  for (let a = 0; a < 9; a++) for (let b = 0; b < 3; b++) box(g, 0.022, 0.003, 0.022, dark, -0.8 + a * 0.2, 0.886, -0.2 + b * 0.2);   // the clamp-hole grid
  box(g, 0.34, 0.002, 0.2, lam(0x26282b), -0.1, 0.8855, 0.08);   // a scorched patch where the welding's done
  [[-0.84, -0.27], [0.84, -0.27], [-0.84, 0.27], [0.84, 0.27]].forEach(([x, z]) => { sil(box(g, 0.05, 0.84, 0.006, leg, x, 0.42, z + Math.sign(z) * 0.022)); box(g, 0.006, 0.84, 0.05, leg, x + Math.sign(x) * 0.022, 0.42, z); box(g, 0.09, 0.012, 0.09, dark, x, 0.006, z); });
  // the mesh shelf, and what's on it: rebar in a bundle, offcuts of plate and an angle-iron length
  sil(box(g, 1.7, 0.02, 0.56, dark, 0, 0.22, 0)); for (let k = 0; k < 9; k++) box(g, 1.68, 0.004, 0.006, leg, 0, 0.232, -0.25 + k * 0.0625);
  for (let k = 0; k < 6; k++) { const m = xcyl(g, 0.011, 1.5, rust, -0.05 + (k % 3) * 0.02, 0.245 + ((k / 3) | 0) * 0.02, -0.12 + (k % 3) * 0.024, 7); m.rotation.y = rr(-0.02, 0.02); }
  [-0.15, 0.25].forEach(x => box(g, 0.02, 0.025, 0.08, lam(0x8a8070), x, 0.255, -0.1));   // tie wire round the bundle
  box(g, 0.5, 0.012, 0.32, plate, 0.45, 0.236, 0.1).rotation.y = 0.12; box(g, 0.36, 0.012, 0.26, lam(0x7d848a), 0.48, 0.25, 0.08).rotation.y = -0.2;
  box(g, 1.2, 0.04, 0.004, leg, -0.2, 0.25, 0.18); box(g, 1.2, 0.004, 0.04, leg, -0.2, 0.232, 0.2);
  // the vise on the front corner, a length of rebar in its jaws
  const vs = new THREE.Group(); vs.position.set(0.68, 0.885, -0.24); g.add(vs);
  box(vs, 0.16, 0.03, 0.16, blue, 0, 0.015, 0); box(vs, 0.12, 0.09, 0.14, blue, 0, 0.075, 0.01);
  box(vs, 0.2, 0.08, 0.04, blue, 0, 0.12, -0.06); box(vs, 0.2, 0.08, 0.04, blue, 0, 0.12, -0.15); box(vs, 0.07, 0.05, 0.1, blue, 0, 0.07, -0.12);
  box(vs, 0.19, 0.06, 0.006, dark, 0, 0.125, -0.083); box(vs, 0.19, 0.06, 0.006, dark, 0, 0.125, -0.127);
  zcyl(vs, 0.013, 0.12, lam(0x9a9da0), 0, 0.09, -0.22); xcyl(vs, 0.007, 0.22, lam(0x9a9da0), 0, 0.09, -0.28);
  xcyl(vs, 0.011, 0.5, rust, -0.12, 0.13, -0.105, 7);
  // the bench grinder bolted to the far end: its motor, two wheels under guards, the tool rests
  const gr = new THREE.Group(); gr.position.set(-0.66, 0.885, 0.05); g.add(gr);
  box(gr, 0.16, 0.025, 0.12, dark, 0, 0.012, 0); ycyl(gr, 0.04, 0.05, 0.05, green, 0, 0.05, 0, 10);
  sil(xcyl(gr, 0.065, 0.18, green, 0, 0.12, 0, 14)); [-1, 1].forEach(s => { xcyl(gr, 0.07, 0.03, lam(0x9a9890), s * 0.15, 0.12, 0, 16); const gd = xcyl(gr, 0.082, 0.045, dark, s * 0.15, 0.135, 0.01, 16); gd.scale.set(1, 1, 0.7); box(gr, 0.04, 0.008, 0.05, dark, s * 0.15, 0.07, -0.08); });
  // the welding helmet, its dark lens, and the angle grinder left on the top; a pair of gauntlets
  const hm = new THREE.Group(); hm.position.set(-0.28, 0.885, -0.08); hm.rotation.y = 0.5; g.add(hm);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x2a2c2f)); sh.rotation.x = -Math.PI / 2; sh.scale.set(1, 1.15, 0.8); sh.position.set(0, 0.1, 0); sh.castShadow = true; hm.add(sh);
  box(hm, 0.1, 0.04, 0.012, lam(0x2c4a2a), 0, 0.12, -0.11); box(hm, 0.12, 0.06, 0.008, dark, 0, 0.12, -0.104);
  const ag = new THREE.Group(); ag.position.set(0.18, 0.905, 0.1); ag.rotation.y = -0.7; g.add(ag);
  xcyl(ag, 0.028, 0.24, lam(0xc8a032), 0, 0, 0, 10); xcyl(ag, 0.03, 0.04, dark, 0.13, 0, 0, 10); ycyl(ag, 0.055, 0.055, 0.006, lam(0x6a6c70), 0.17, -0.008, 0, 16); box(ag, 0.06, 0.02, 0.025, dark, 0.17, 0.03, 0); xcyl(ag, 0.012, 0.08, dark, 0.16, 0.01, 0.06, 8).rotation.y = Math.PI / 2;
  [[0.42, -0.18, 0.3], [0.5, -0.12, 1.2]].forEach(([x, z, r]) => box(g, 0.08, 0.025, 0.2, lam(0x8a5a32), x, 0.9, z).rotation.y = r);
  box(g, 0.14, 0.02, 0.1, lam(0x9a6a3a), 0.02, 0.895, 0.2);   // a pad of soapstone sticks
  // the gas bottle stood on the shelf at the back corner, strapped, its valve and regulator up under the top, the hose
  // coiled on the top
  ycyl(g, 0.085, 0.085, 0.44, lam(0x6e2a26), 0.74, 0.452, 0.17, 14); const dm = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x6e2a26)); dm.position.set(0.74, 0.674, 0.17); dm.castShadow = true; g.add(dm);
  ycyl(g, 0.02, 0.026, 0.05, lam(0xb08a3a), 0.74, 0.78, 0.17, 8); ycyl(g, 0.022, 0.022, 0.05, lam(0x8a8d90), 0.76, 0.8, 0.17, 10).rotation.z = Math.PI / 2;
  [0.35, 0.58].forEach(y => { const t = torus(g, 0.088, 0.007, dark, 0.74, y, 0.17); t.rotation.x = Math.PI / 2; });
  torus(g, 0.08, 0.009, lam(0x2a2a2a), 0.56, 0.894, 0.2).rotation.x = Math.PI / 2;
  unfight(g); mergeInto(g, finePieces(g));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
