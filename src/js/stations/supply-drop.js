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
