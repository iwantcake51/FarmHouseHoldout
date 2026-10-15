// The windows' glass: a two-over-two double-hung sash in every window, its panes smashed in by a zombie's fist, by a
// runner diving through, by you vaulting through, or by a shot or a blast going through. A broken one keeps jagged bits
// of glass round its frame and throws shards that tinkle down and lie glinting on the ground; it stays broken for the
// rest of the run (resetGlass brings it back for a new one).

// the glass: a faint cool tint with soft diagonal sheen, see-through; it fades away with its wall when you're behind
// it (world/cutaway.js), like the wall
const glassTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#9cc4d0'; x.fillRect(0, 0, 64, 64);
  x.rotate(-0.7); for (let k = 0; k < 3; k++) { const y = -10 + k * 26 + Math.random() * 8, w = 5 + Math.random() * 10; const g = x.createLinearGradient(0, y, 0, y + w); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(245,252,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-60, y, 200, w); }
  const t = new THREE.CanvasTexture(c); return t;
})();
const GLASS_FALL = lit(new THREE.MeshLambertMaterial({ color: 0xc8e2ea, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); GLASS_FALL.userData.mobile = true;
const SHARD_GEO = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.5, -0.5, 0, 0.1, 0.6, 0], 3)); SHARD_GEO.computeVertexNormals();
// the sash's parts, in the opening's frame (x along the wall, y up, z across it): its bottom, meeting and top rails,
// the stiles and the muntin down each sash's middle, and the four panes between them
const SASH = { y0: 1.02, y1: 1.87, mid: 1.45, w: 0.47, rail: 0.05, stile: 0.045, munt: 0.022, d: 0.045 };
function buildGlass(o) {
  const mk = (base, extra) => { const m = base.clone(); Object.assign(m, extra || {}); m.userData.cut = o.cut; return lit(m, true); };
  const wood = mk(lam(0x5a4636)), glass = mk(new THREE.MeshLambertMaterial({ color: 0xffffff, map: glassTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  const g = new THREE.Group(); o.bg.add(g);
  const { y0, y1, mid, w, rail, stile, munt, d } = SASH, panes = [], jag = [];
  // each sash: the lower one a hair inside the upper, where they slide past each other
  [[y0, mid + rail / 2, -1], [mid - rail / 2, y1, 1]].forEach(([a, b, f]) => {
    const z = f * o.out * 0.024, sh = new THREE.Group(); sh.position.z = z; g.add(sh);
    box(sh, w * 2, rail, d, wood, 0, a + rail / 2, 0); box(sh, w * 2, rail * 0.8, d, wood, 0, b - rail * 0.4, 0);
    [-1, 1].forEach(sd => box(sh, stile, b - a, d, wood, sd * (w - stile / 2), (a + b) / 2, 0));
    box(sh, munt, b - a - rail * 1.8, d * 0.8, wood, 0, (a + b) / 2, 0);
    // the two panes, and the jagged bits each leaves stuck in its frame when it goes
    const pa = a + rail, pb = b - rail * 0.8, ph = pb - pa, pw = w - stile - munt / 2;
    [-1, 1].forEach(sd => {
      const cx = sd * (munt / 2 + pw / 2), cy = (pa + pb) / 2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), glass); p.position.set(cx, cy, 0); sh.add(p); panes.push({ m: p, cx, cy, pw, ph, z, sh });
      for (let q = 0; q < 5; q++) {
        const s = new THREE.Mesh(SHARD_GEO, glass), e = q % 4, u = rr(-0.4, 0.4);   // e: which edge of the pane it hangs from
        const ex = e === 0 ? -pw / 2 : e === 1 ? pw / 2 : u * pw, ey = e === 2 ? -ph / 2 : e === 3 ? ph / 2 : u * ph;
        s.position.set(cx + ex * 0.97, cy + ey * 0.97, 0); s.scale.setScalar(rr(0.08, 0.16));
        s.rotation.z = e === 0 ? -Math.PI / 2 : e === 1 ? Math.PI / 2 : e === 2 ? 0 : Math.PI; s.rotation.z += rr(-0.5, 0.5);
        s.visible = false; sh.add(s); jag.push(s);
      }
    });
  });
  o.glass = { g, panes, jag, intact: true };
}
openings.forEach(o => { if (o.kind === 'window') buildGlass(o); });
const glassIntact = o => !!(o && o.glass && o.glass.intact);
// the glass goes: the panes gone but for the jagged bits round their frames, the shards thrown on (dx, dz) and falling,
// a crack and a burst of breaking glass
const glassShards = [];
function smashGlass(o, dx, dz, quiet) {
  const gl = o.glass; if (!gl || !gl.intact) return;
  gl.intact = false; gl.panes.forEach(p => { p.m.visible = false; }); gl.jag.forEach(s => { s.visible = true; });
  o.bg.updateMatrixWorld(true);
  const wp = new V3();
  gl.panes.forEach(p => {
    for (let k = 0; k < 6; k++) {
      wp.set(p.cx + rr(-0.45, 0.45) * p.pw, p.cy + rr(-0.45, 0.45) * p.ph, p.z); p.sh.localToWorld(wp);
      // (each shard sits scaled inside a group of its own: the debris shrinks the group away as it goes)
      const m = new THREE.Group(), sh = new THREE.Mesh(SHARD_GEO, GLASS_FALL); sh.scale.setScalar(rr(0.03, 0.09)); m.add(sh);
      m.rotation.order = 'YXZ'; m.position.copy(wp); m.rotation.set(rr(0, 6.3), rr(0, 6.3), rr(0, 6.3)); scene.add(m);
      const f = rr(0.8, 3.2);
      glassShards.push({ g: m, life: rr(18, 26), vx: dx * f + rr(-0.6, 0.6), vy: rr(-0.2, 1.6), vz: dz * f + rr(-0.6, 0.6), spin: rr(-14, 14), roll: rr(-12, 12), r: 0.008, bounces: 0, kind: 'glass', restY: 0.006,
        rest: g => { g.rotation.set(-Math.PI / 2, rr(0, 6.3), 0); } });
    }
  });
  while (glassShards.length > 160) { const q = glassShards.shift(); scene.remove(q.g); }
  burst(o.x, 1.4, o.z, 3, 'dust', dx, dz, 1.5);
  if (!quiet) SFX.glass(clamp(1.2 - Math.hypot(o.x - P.x, o.z - P.z) / 22, 0.25, 1));
  flowDirty = true;
}
function resetGlass() {
  openings.forEach(o => { const gl = o.glass; if (!gl) return; gl.intact = true; gl.panes.forEach(p => { p.m.visible = true; }); gl.jag.forEach(s => { s.visible = false; }); });
  glassShards.forEach(q => scene.remove(q.g)); glassShards.length = 0;
}
// a round or a pellet going through a window's glass breaks it: anywhere along (ox, oz) on (dx, dz) as far as L
function glassOnRay(ox, oz, dx, dz, L) {
  for (let t = 0.1; t < L; t += 0.1) { const i = ci(ox + dx * t), j = ci(oz + dz * t); if (!inb(i, j)) continue; const o = openAt[idx(i, j)]; if (o && glassIntact(o)) smashGlass(o, dx, dz); }
}
// glass and boards knocked off windows, each frame
function stepBreakage(dt, rdt) {
  stepDebris(glassShards, dt); stepDebris(loosePlanks, dt); boardShake(rdt);
  for (const q of glassShards) q.g.visible = q.life > 0 && visAt(q.g.position.x, q.g.position.z) > 0.15;
  for (const q of loosePlanks) if (q.life > 0) q.g.visible = visAt(q.g.position.x, q.g.position.z) > 0.15;
}
