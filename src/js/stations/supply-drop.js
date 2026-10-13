// The radio supply crate.

// the radio supply crate falling into the yard
function updateSupplyDrop(dt) {
  // supply drop from the radio
  if (supplyT > 0) {
    supplyT -= dt;
    if (supplyT <= 0) {
      let x, z; do { x = cxw((rr(FX0 + 2, FX1 - 2)) | 0); z = cxw((rr(FZ0 + 2, FZ1 - 2)) | 0); } while (hardBlocked(ci(x), ci(z)) || (x > HOUSE.x0 - 1 && x < HOUSE.x1 + 1 && z > HOUSE.z0 - 1 && z < HOUSE.z1 + 1));
      const m = new THREE.Group(); box(m, 0.8, 0.55, 0.6, M.olive, 0, 0.3, 0); box(m, 0.82, 0.08, 0.62, M.metal, 0, 0.45, 0); m.position.set(x, 18, z); scene.add(m);
      supplyFall = { m, x, z }; flashes.push({ x, z, r: 6, int: 1.4, col: [1, 0.25, 0.2], t: 12, max: 12 });
    }
  }
  if (supplyFall) {
    const f = supplyFall; f.m.position.y -= dt * 9; f.m.rotation.y += dt;
    if (f.m.position.y <= 0) { scene.remove(f.m); supplyFall = null; dropPickup(f.x, f.z, 'supply'); burst(f.x, 0.2, f.z, 12, 'dust'); shake = Math.max(shake, 0.25); SFX.thud(); }
  }
}
// the crate's marker, from the moment it's called down until it's opened: a crate icon and how far off it is, floating
// over the crate, or pinned to the edge of the screen with an arrow pointing to it while it's off screen
const dropMark = (() => {
  const el = document.createElement('div'); el.className = 'dropMark hud'; el.hidden = true;
  el.innerHTML = `<i class="dmArrow"></i><span class="dmPin"><svg viewBox="${GI_VB}">${GI.supply}</svg><b></b></span>`;
  document.body.appendChild(el); return el;
})();
const _dm = new V3(), DM_EDGE = 74;
function updateDropMarker() {
  const crate = pickups.find(p => p.kind === 'supply'), f = supplyFall, at = crate || f;
  if (!at || state !== 'play' || P.dead) { if (!dropMark.hidden) dropMark.hidden = true; return; }
  dropMark.hidden = false;
  _dm.set(at.x, 1.2, at.z).project(cam);
  let sx = (_dm.x + 1) / 2 * innerWidth, sy = (1 - _dm.y) / 2 * innerHeight, ang = 0;
  const off = sx < DM_EDGE || sx > innerWidth - DM_EDGE || sy < DM_EDGE + 30 || sy > innerHeight - DM_EDGE;
  if (off) {
    // pinned where the line from the middle of the screen toward it meets an edge, a little in from it
    const cx = innerWidth / 2, cy = innerHeight / 2, dx = sx - cx, dy = sy - cy, k = Math.min((cx - DM_EDGE) / (Math.abs(dx) || 1e-6), (cy - DM_EDGE) / (Math.abs(dy) || 1e-6));
    sx = cx + dx * k; sy = cy + dy * k; ang = Math.atan2(dy, dx);
  }
  const d = Math.round(Math.hypot(at.x - P.x, at.z - P.z)), key = (off ? 1 : 0) + ':' + d + ':' + (crate ? 1 : 0);
  dropMark.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
  if (off) dropMark.style.setProperty('--a', ang.toFixed(3) + 'rad');
  if (dropMark._k !== key) { dropMark._k = key; dropMark.classList.toggle('off', off); dropMark.classList.toggle('falling', !crate); dropMark.querySelector('b').textContent = d + ' m'; }
}
