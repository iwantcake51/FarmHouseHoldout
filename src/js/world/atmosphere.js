// Moths, pollen motes, night mist and fireflies.

// moths that circle the lamps and the fire after dark
const moths = (() => {
  const centres = [[cxw(21) + 0.7, 2.25, cxw(HZ1) + 0.42], [cxw(14), 1.4, cxw(16)]];   // outdoor lights only
  const seed = [];
  centres.forEach((c, i) => { const n = i === 1 ? 16 : 9; for (let k = 0; k < n; k++) seed.push({ c, r: rr(0.12, i === 1 ? 0.75 : 0.5), p: rand() * 6.28, s: rr(2.2, 6) * (rand() < 0.5 ? -1 : 1), y: rr(-0.2, i === 1 ? 0.6 : 0.3), w: rr(1.5, 4.5) }); });
  const pos = new Float32Array(seed.length * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xf4e8cc, size: 2.2 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, seed, m };
})();
// drifting pollen and dust that catch the light by day
const motes = (() => {
  const n = 110, pos = new Float32Array(n * 3), seed = [];
  for (let k = 0; k < n; k++) seed.push({ x: rr(-14, 14), y: rr(0.2, 3), z: rr(-14, 14), p: rand() * 6.28, s: rr(0.15, 0.45) });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xfff1cc, size: 2.0 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, seed, m };
})();
// low banks of mist that creep across the yard at night
const mists = [];
for (let k = 0; k < 16; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0, color: 0x9fb0c0 })); sp.position.set(rr(-20, 20), rr(0.25, 0.6), rr(-20, 20)); const sc = rr(7, 12); sp.scale.set(sc, sc * 0.45, 1); sp.userData = { vx: rr(0.15, 0.35), vz: rr(-0.1, 0.1), ph: rand() * 6 }; scene.add(sp); mists.push(sp); }
function stepAtmos(rdt) {
  const t = performance.now() / 1000, day = 1 - curDark;
  WIND.value = t * 1.6;
  motes.m.opacity = state === 'title' ? 0.35 : 0.5 * Math.max(0, day - 0.15);
  if (motes.m.opacity > 0.01) {
    for (let k = 0; k < motes.seed.length; k++) {
      const q = motes.seed[k]; q.x += (0.25 + Math.sin(t * 0.3 + q.p) * 0.15) * rdt; q.y += Math.sin(t * 0.8 + q.p * 2) * 0.05 * rdt; q.z += Math.cos(t * 0.4 + q.p) * 0.12 * rdt;
      let rx = q.x - camTarget.x, rz = q.z - camTarget.z;   // wrap round the view so there are always some about
      if (rx > 14) q.x -= 28; if (rx < -14) q.x += 28; if (rz > 14) q.z -= 28; if (rz < -14) q.z += 28;
      motes.pos[k * 3] = q.x; motes.pos[k * 3 + 1] = q.y + Math.sin(t * q.s * 3 + q.p) * 0.15; motes.pos[k * 3 + 2] = q.z;
    }
    motes.pts.geometry.attributes.position.needsUpdate = true;
  }
  const mo = state === 'title' ? 0.06 : Math.max(0, curDark - 0.35) * 0.16;
  for (const sp of mists) {
    const u = sp.userData; sp.position.x += u.vx * rdt; sp.position.z += u.vz * rdt;
    if (sp.position.x - camTarget.x > 22) sp.position.x -= 44; if (sp.position.x - camTarget.x < -22) sp.position.x += 44;
    if (sp.position.z - camTarget.z > 22) sp.position.z -= 44; if (sp.position.z - camTarget.z < -22) sp.position.z += 44;
    const inside = sp.position.x > HOUSE.x0 - 1 && sp.position.x < HOUSE.x1 + 1 && sp.position.z > HOUSE.z0 - 1 && sp.position.z < HOUSE.z1 + 1;
    sp.material.opacity = inside ? 0 : mo * (0.7 + 0.3 * Math.sin(t * 0.2 + u.ph));
    sp.visible = sp.material.opacity > 0.005;
  }
}
// fireflies at night
const fireflies = (() => {
  const n = 46, pos = new Float32Array(n * 3), seed = [];
  for (let k = 0; k < n; k++) { seed.push({ x: rr(cxw(FX0), cxw(FX1)), z: rr(cxw(FZ0), cxw(FZ1)), y: rr(0.4, 1.6), p: rand() * 6, s: rr(0.3, 0.8) }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xdff59a, size: 3.2 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); scene.add(pts);
  return { pts, pos, seed, m };
})();
