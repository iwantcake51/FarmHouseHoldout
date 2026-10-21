// Board models and adding/breaking boards on doors and windows, and how many planks you can carry.

// you carry at most PLANK_MAX planks; everything that hands you planks goes through addPlanks, which stops at the cap
// and returns how many it actually added
const PLANK_MAX = 15;
const plankRoom = () => Math.max(0, PLANK_MAX - S.planks);
function addPlanks(n) { const got = Math.min(n, plankRoom()); S.planks += got; return got; }
// how strong a board goes up (BOARD_HP, times the hammers' S.boardMul), and the sawhorse's bracing on top: five levels
// for the rest of the run, each step another BRACE.step stronger for every board you put up (and the ones already up),
// each dearer than the last (BRACE.cost, stations/recipes.js)
const BOARD_HP = 70, BRACE = { max: 5, step: 0.2, cost: [8, 12, 17, 23, 30] };
const braceLv = () => S.brace || 0, braceMul = (n = braceLv()) => 1 + BRACE.step * n;
const boardHp = () => BOARD_HP * S.boardMul * braceMul();
// the metalwork bench (barricades/metal-bars.js): once it's built (on), every opening is barred with a steel grate, one
// to an opening (o.grate, its hp the one entry in o.boards), in place of boards; tier, how much plate the grates carry.
// The team's: the same on every screen in co-op
const METAL = { on: false, tier: 0 };
// how barred an opening is, as the zombies weigh their way in (a grate as three boards), and as sight, light and sound
// get through it (a grate's bars let them through till three rows of plate or more are still on it)
function barN(o) { return o.grate ? 3 : o.boards.length; }
function shutN(o) { return o.grate ? (o.grate.shut ? 3 : 1) : o.boards.length; }
// everything across an opening taken off it at once, nothing thrown (a new run, a new floor plan, boards turned to a grate)
function clearBoards(o) { while (o.boards.length) o.boards.pop(); while (o.meshes.length) o.bg.remove(o.meshes.pop()); o.grate = null; }

// ---- barricade planks: grained, colour-varied boards with nail heads and split ends ----
const plankTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 40; const x = c.getContext('2d');
  x.fillStyle = '#c9a678'; x.fillRect(0, 0, 256, 40);
  for (let k = 0; k < 26; k++) {   // long grain streaks
    const y = Math.random() * 40, a = 0.05 + Math.random() * 0.12; x.strokeStyle = `rgba(70,42,20,${a})`; x.lineWidth = 0.6 + Math.random() * 1.6;
    x.beginPath(); x.moveTo(0, y); for (let u = 0; u <= 256; u += 16) x.lineTo(u, y + Math.sin(u / 40 + k) * 1.4); x.stroke();
  }
  for (let k = 0; k < 2; k++) {    // a knot or two
    const kx = 30 + Math.random() * 196, ky = 8 + Math.random() * 24;
    for (let r = 7; r > 0; r -= 1.5) { x.strokeStyle = `rgba(80,45,20,${0.18 + (7 - r) * 0.04})`; x.lineWidth = 1; x.beginPath(); x.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, 7); x.stroke(); }
    x.fillStyle = 'rgba(60,32,14,.6)'; x.beginPath(); x.ellipse(kx, ky, 2.4, 1.2, 0, 0, 7); x.fill();
  }
  x.fillStyle = 'rgba(40,24,10,.35)'; x.fillRect(0, 0, 256, 2); x.fillRect(0, 38, 256, 2);   // darker edges
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
})();
// each board is one of a few woods, in a shade of its own: a touch lighter or darker, warmer or greyer than the next
const PLANK_COL = [0xd8c3a0, 0xbfa27c, 0xa98e6c, 0xcdb592];
function plankTint(c) { const k = new THREE.Color(c), h = {}; k.getHSL(h); return k.setHSL(h.h + rr(-0.012, 0.012), clamp(h.s * rr(0.85, 1.15), 0, 1), clamp(h.l * rr(0.92, 1.08), 0, 1)).getHex(); }
const NAIL_M = lam(0x3a3836), PLANK_END = lam(0x8a6a48);
const boardGeo = new THREE.BoxGeometry(1, 1, 1);
function makePlank(sign) {
  const g = new THREE.Group(), L = rr(1.22, 1.36), H = rr(0.16, 0.2), Th = 0.055;
  const m = new THREE.Mesh(boardGeo, lam(plankTint(PLANK_COL[(rand() * PLANK_COL.length) | 0]), { map: plankTex })); m.scale.set(L, H, Th); m.castShadow = true; g.add(m);
  // lighter sawn ends and the odd split corner
  [-1, 1].forEach(e => {
    const end = new THREE.Mesh(boardGeo, PLANK_END); end.scale.set(0.012, H * 0.98, Th * 1.02); end.position.x = e * L / 2; g.add(end);
    if (rand() < 0.5) { const sp = new THREE.Mesh(boardGeo, PLANK_END); sp.scale.set(0.09, 0.012, Th * 1.04); sp.position.set(e * (L / 2 - 0.045), rr(-H / 4, H / 4), 0); g.add(sp); }
    // two nail heads at each end, driven through into the frame
    for (let k = 0; k < 2; k++) { const n = new THREE.Mesh(boardGeo, NAIL_M); n.scale.set(0.028, 0.028, 0.012); n.position.set(e * (L / 2 - rr(0.1, 0.16)), (k ? 1 : -1) * H * 0.24 + rr(-0.01, 0.01), sign * (Th / 2 + 0.004)); n.rotation.z = rr(0, 1); g.add(n); }
  });
  return g;
}
let flowDirty = true, lightsDirty = false;
// hp and side are given for a board a co-op teammate put up (net/sync.js): how strong it went up, and which side of the
// opening they stood on
function addBoard(o, hp, sd) {
  const n = o.boards.length; if (n >= 3) return;
  const mine = hp === undefined;
  o.boards.push(mine ? boardHp() : hp);
  const side = sd || Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1;
  const m = makePlank(o.out * side);
  m.position.set(rr(-.06, .06), o.ys[n] + rr(-0.04, 0.04), o.out * side * (0.52 + n * 0.012)); m.rotation.set(rr(-0.03, 0.03), rr(-0.04, 0.04), (n % 2 ? -1 : 1) * rr(.1, .28));
  { const u = m.userData; u.place = 0; u.pz = o.out * side; u.pSide = rand() < 0.5 ? -1 : 1; u.p0 = { x: m.position.x, y: m.position.y, z: m.position.z, rz: m.rotation.z, ry: m.rotation.y }; boardPlace(m, 0); }   // swung in and nailed (boardPlace)
  m.userData.rz0 = m.userData.p0.rz; m.userData.x0 = m.userData.p0.x; m.userData.z0 = m.userData.p0.z; m.userData.hp0 = o.boards[n]; m.userData.sag = rand() < 0.5 ? -1 : 1;   // (how it sits, for boardShake: where it's nailed, how strong it went up, which end gives first)
  o.bg.add(m); o.meshes.push(m);
  if (mine) run.boards++;
  // your own hammering's right in front of you, never muffled; a teammate's comes from where they are, through the walls
  const hit = () => mine ? SFX.board() : soundAt(o.x, o.z, () => SFX.board()); BOARD_NAILS.forEach(k => setTimeout(hit, k * BOARD_PLACE * 1000));
  burst(o.x + o.nx * side * .55, o.ys[n], o.z + o.nz * side * .55, 4, 'dust');
  flowDirty = true; lightsDirty = true;
}
// putting a board up takes BOARD_PLACE seconds: it's swung in from your side of the opening, one end leading, low and
// turned, and eased onto the frame (the first BOARD_SWING of it); then it's nailed, a hammer blow at each of BOARD_NAILS
// knocking it tight against the frame with a little shiver. k runs 0 to 1 (day-night.js steps it each frame)
const BOARD_PLACE = 0.45, BOARD_SWING = 0.55, BOARD_NAILS = [0.6, 0.84];
function boardPlace(m, k) {
  const u = m.userData, p = u.p0, a = 1 - Math.pow(1 - clamp(k / BOARD_SWING, 0, 1), 3), b = 1 - a;
  let knock = 0; for (const n of BOARD_NAILS) { const d = (k - n) / 0.12; if (d > 0 && d < 1) knock += Math.sin(d * Math.PI) * (1 - d); }
  m.position.set(p.x + b * u.pSide * 0.22, p.y - b * 0.16, p.z + u.pz * (b * 0.34 - knock * 0.014));
  m.rotation.z = p.rz + b * u.pSide * 0.32 + knock * 0.025 * u.pSide;
  m.rotation.y = p.ry + b * u.pSide * 0.28;
}
// a blow on the boards: the one on top jumps and rattles in its nails, chips and a puff of dust fly off it, and it's
// pulled a little further loose toward whoever's hitting it (boardShake)
function boardJolt(o, z, big) {
  if (o.grate) { grateJolt(o, z, big); return; }   // (barricades/metal-bars.js)
  const m = o.meshes[o.meshes.length - 1]; if (!m) return;
  m.userData.jolt = 1; m.userData.jSide = rand() < 0.5 ? -1 : 1;
  if (!z) return;
  const sd = openSide(o, z.x, z.z); m.userData.pull = o.out * sd;
  if (z.vis > 0.2) { const x = o.x + o.nx * sd * 0.5, zz = o.z + o.nz * sd * 0.5, y = m.position.y; burst(x, y, zz, 2, 'dust'); burst(x, y, zz, 3, 'wood', o.nx * sd, o.nz * sd, 1.2); }
}
// every board on o rattling at once (tearing them all down: barricades/interactions.js), a grate as a blow on it
function boardRattle(o, z) {
  if (o.grate) { grateJolt(o, z); return; }
  o.meshes.forEach(m => { m.userData.jolt = 1; m.userData.jSide = rand() < 0.5 ? -1 : 1; m.userData.pull = o.out * openSide(o, z.x, z.z); });
  burst(o.x + o.nx * openSide(o, z.x, z.z) * 0.5, o.ys[1], o.z + o.nz * openSide(o, z.x, z.z) * 0.5, 3, 'dust');
}
// every frame, each board as loose as the blows on it have worked it (its hp against what it went up with): it comes
// away from one nail and hangs from the other, its free end dropping further the looser it gets, and stands off the
// frame toward whoever's working at it; one just hit rattles
function boardShake(rdt) {
  for (const o of openings) if (!o.grate) o.meshes.forEach((m, k) => {
    const u = m.userData, loose = clamp(1 - o.boards[k] / (u.hp0 || 1), 0, 1), j = u.jolt || 0;
    if (!(loose > 0) && !(j > 0)) return;
    if (u.y0 === undefined) { if (u.place < 1) return; u.y0 = m.position.y; }   // (once it's up and nailed)
    const nj = Math.max(0, j - rdt * 3.2); u.jolt = nj;
    // turned about the end still nailed (half the board's length out from its middle, on the side away from u.sag)
    const L = m.children[0] ? m.children[0].scale.x : 1.3, th = -u.sag * 0.34 * smooth(loose) + Math.sin(nj * 30) * 0.06 * nj * (u.jSide || 1);
    m.rotation.z = u.rz0 + th;
    m.position.x = u.x0 + u.sag * L / 2 * (Math.cos(th) - 1) + Math.sin(nj * 23) * 0.015 * nj;
    m.position.y = u.y0 + u.sag * L / 2 * Math.sin(th);
    m.position.z = u.z0 + (u.pull || 0) * 0.08 * smooth(loose);
  });
}
// a board torn down: wrenched off toward whoever broke it (z: a zombie, or any point on the side it goes to: a shot's
// far side, the far side from you when you tear it down yourself; none, away from you), either whole or snapped in two where the
// blows landed (each half with long splinters standing out of the break), splinters flying; the pieces clatter to the
// ground and lie there a while (weapons/casings.js's debris)
const loosePlanks = [];
function breakBoard(o, z) {
  if (o.grate) { breakGrate(o, z); return; }   // (barricades/metal-bars.js)
  o.boards.pop(); const m = o.meshes.pop();
  const sd = z ? openSide(o, z.x, z.z) : -openSide(o, P.x, P.z), ox = o.nx * sd, oz = o.nz * sd;
  if (m) {
    m.updateMatrixWorld(true); const wp = new V3(), wq = new THREE.Quaternion(); m.getWorldPosition(wp); m.getWorldQuaternion(wq);
    o.bg.remove(m);
    const fly = g => {
      scene.add(g);
      loosePlanks.push({ g, life: 30, vx: ox * rr(1.6, 2.8) + rr(-0.6, 0.6), vy: rr(0.8, 2.2), vz: oz * rr(1.6, 2.8) + rr(-0.6, 0.6), spin: rr(-7, 7), roll: rr(-6, 6), r: 0.09, bounces: 0, kind: 'plank', restY: 0.03,
        rest: q => { q.rotation.set(Math.PI / 2, Math.atan2(ox, oz) + Math.PI / 2 + rr(-0.8, 0.8), 0); } });
    };
    const bd = m.children[0];
    if (bd && rand() < 0.5) {
      const L = bd.scale.x, H = bd.scale.y, Th = bd.scale.z, cut = rr(0.35, 0.65);
      [[-1, cut], [1, 1 - cut]].forEach(([s, f]) => {
        const g = new THREE.Group(), len = L * f, b = new THREE.Mesh(boardGeo, bd.material); b.scale.set(len, H, Th); b.castShadow = true; g.add(b);
        for (let q = 0; q < 3; q++) { const sp = new THREE.Mesh(boardGeo, PLANK_END), w = rr(0.04, 0.12); sp.scale.set(w, H * rr(0.15, 0.32), Th * rr(0.4, 0.9)); sp.position.set(-s * (len / 2 + w * 0.4), rr(-H / 3, H / 3), 0); sp.rotation.z = rr(-0.35, 0.35); g.add(sp); }
        g.rotation.order = 'YXZ'; g.position.copy(new V3(s * (L / 2 - len / 2), 0, 0).applyQuaternion(wq).add(wp)); g.quaternion.copy(wq);
        fly(g);
      });
    } else { m.rotation.order = 'YXZ'; m.position.copy(wp); m.quaternion.copy(wq); fly(m); }
    while (loosePlanks.length > 24) { const q = loosePlanks.shift(); scene.remove(q.g); }
  }
  burst(o.x + ox * 0.5, 1.3, o.z + oz * 0.5, 12, 'wood', ox, oz, 3);
  soundAt(o.x, o.z, () => SFX.crack()); setTimeout(() => soundAt(o.x, o.z, () => SFX.crack()), 60); flowDirty = true; lightsDirty = true;
}
// shots through the boards: every bullet or pellet that crosses a boarded door or window on its way (weapons/firing.js)
// takes BOARD_SHOT of its damage off the board on top, so each shot works it a little looser (boardShake) till it splits
// and is knocked out the way the shot was going. A 9mm round takes about 3 off a 70 board, a pump shell about 17, so
// shooting through your own boards wears them down slowly rather than shredding them
const BOARD_SHOT = 0.12;
// the boarded openings a bullet crosses before it stops at T, each with BOARD_SHOT of its damage added to what acc
// already has for it (a shot's pellets all go into one acc, so each opening takes one blow a shot: shootBoard)
function boardsCrossed(ox, oz, dx, dz, T, dmg, acc) {
  let last = null;
  for (let t = 0.1; t < T; t += 0.1) {
    const i = ci(ox + dx * t), j = ci(oz + dz * t); if (!inb(i, j)) continue;
    const o = openAt[idx(i, j)]; if (!o || o === last || !o.boards.length || o.grate) continue;   // (a shot goes clean through a grate's bars and its slit)
    last = o; const h = acc.get(o);
    if (h) h.d += dmg * BOARD_SHOT; else acc.set(o, { d: dmg * BOARD_SHOT, dx, dz });
  }
}
// a shot's worth of damage on an opening's boards: the top one jumps and splinters fly out the far side; in co-op the
// host's game keeps the boards, so a joiner's shots are sent to it and it says when one breaks (net/sync.js)
function shootBoard(o, d, dx, dz) {
  if (!o.boards.length) return;
  const at = { x: o.x + dx, z: o.z + dz, vis: visAt(o.x, o.z) };
  boardJolt(o, at); netBoardShot(o, d, dx, dz);
  if (!netClient()) hurtBoard(o, d, at);
}
// d off the top board; if that's the last of it, it breaks and flies toward at
function hurtBoard(o, d, at) {
  const top = o.boards.length - 1; if (top < 0) return;
  o.boards[top] -= d;
  if (o.boards[top] <= 0) { breakBoard(o, at); netBoardBroke(o, null, at); }
}
// tearing the boards down yourself (hold C: barricades/interactions.js): every one on the opening wrenched off, one
// after another a moment apart, and dropped inside the house (or the grate, in one piece). You
// don't get the planks back: they're broken (nor the metal from a grate)
const TEAR_GAP = 70;   // ms between the boards coming off
function tearBoard(o) {
  if (!o.boards.length) return;
  const at = { x: o.x - o.nx * 2, z: o.z - o.nz * 2 };   // (always into the house, whichever side you tore them from)
  if (netClient()) { netBoardTear(o, at); return; }   // (the host breaks them and says so)
  tearAll(o, at);
}
function tearAll(o, at) {
  const n = o.boards.length;
  for (let k = 0; k < n; k++) setTimeout(() => { if (!o.boards.length) return; breakBoard(o, at); netBoardBroke(o, null, at); }, k * TEAR_GAP);
}
// a piece of a board or a grate lying about stays where it is whether you can see it or not (it never pops out of
// the world as your sightline leaves it), just darker out of sight, DEBRIS_DIM of its colour, eased between the two:
// it gets its own copies of its materials the first time, so the ones still on a window aren't touched
const DEBRIS_DIM = 0.55;
function debrisShade(q, dt) {
  const g = q.g;
  if (!q.mats) { q.mats = []; const seen = new Map(); g.traverse(o => { if (!o.isMesh || !o.material || !o.material.color) return; let m = seen.get(o.material); if (!m) { m = o.material.isMeshLambertMaterial ? relit(o.material) : o.material.clone(); m.userData.mobile = true; m.userData.c0 = o.material.color.clone(); seen.set(o.material, m); q.mats.push(m); } o.material = m; }); q.dim = 1; }
  const want = mix(DEBRIS_DIM, 1, smooth(clamp((visAt(g.position.x, g.position.z) - 0.15) / 0.35, 0, 1))), d = q.dim + (want - q.dim) * Math.min(1, dt * 4);
  if (Math.abs(d - q.dim) < 0.002 && q.shown) return;
  q.dim = d; q.shown = true; g.visible = true; q.mats.forEach(m => m.color.copy(m.userData.c0).multiplyScalar(d));
}
// boards knocked about and pieces of them lying about, each frame
function stepBoards(dt, rdt) {
  stepDebris(loosePlanks, dt); stepDebris(looseMetal, dt); boardShake(rdt);
  for (const o of openings) if (o.grate) grateStep(o, rdt);
  for (const q of loosePlanks) if (q.life > 0) debrisShade(q, rdt);
  for (const q of looseMetal) if (q.life > 0) debrisShade(q, rdt); else if (q.g.parent) scene.remove(q.g);
}
function resetBoards() {
  openings.forEach(o => { clearBoards(o); o.climbers = []; });
  loosePlanks.forEach(q => scene.remove(q.g)); loosePlanks.length = 0;
  looseMetal.forEach(q => scene.remove(q.g)); looseMetal.length = 0;
  if (METAL.on) applyMetal(false, 0, false);   // (back to the sawhorse: barricades/metal-bars.js)
  lightsDirty = true;
}
