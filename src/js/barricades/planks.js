// Board models and adding/breaking boards on doors and windows, and how many planks you can carry.

// you carry at most PLANK_MAX planks; everything that hands you planks goes through addPlanks, which stops at the cap
// and returns how many it actually added
const PLANK_MAX = 15;
const plankRoom = () => Math.max(0, PLANK_MAX - S.planks);
function addPlanks(n) { const got = Math.min(n, plankRoom()); S.planks += got; return got; }

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
function addBoard(o) {
  const n = o.boards.length; if (n >= 3) return;
  o.boards.push(70 * S.boardMul);
  const side = Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1;
  const m = makePlank(o.out * side);
  m.position.set(rr(-.06, .06), o.ys[n] + rr(-0.04, 0.04), o.out * side * (0.52 + n * 0.012)); m.rotation.set(rr(-0.03, 0.03), rr(-0.04, 0.04), (n % 2 ? -1 : 1) * rr(.1, .28));
  m.userData.drop = 0.12; m.position.y += 0.12;   // knocked into place
  o.bg.add(m); o.meshes.push(m);
  run.boards++; SFX.board(); setTimeout(() => SFX.board(), 110);
  burst(o.x + o.nx * side * .55, o.ys[n], o.z + o.nz * side * .55, 4, 'dust');
  flowDirty = true; lightsDirty = true;
}
function breakBoard(o) {
  o.boards.pop(); const m = o.meshes.pop(); if (m) o.bg.remove(m);
  burst(o.x, 1.2, o.z, 9, 'wood', -o.nx, -o.nz, 2.5);
  SFX.crack(); flowDirty = true; lightsDirty = true;
}
function resetBoards() { openings.forEach(o => { while (o.boards.length) { o.boards.pop(); o.bg.remove(o.meshes.pop()); } }); lightsDirty = true; }
