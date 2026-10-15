// Moths, pollen motes, night mist and fireflies.

// inside the house's walls (plus a margin): the bugs and motes keep out
const inHouse = (x, z, m) => x > HOUSE.x0 - m && x < HOUSE.x1 + m && z > HOUSE.z0 - m && z < HOUSE.z1 + m;
// moths that circle the lamps and the fire after dark
const moths = (() => {
  const centres = [[cxw(21) + 0.7, 2.25, cxw(HZ1) + 0.42], [cxw(14), 1.4, cxw(16)]];   // outdoor lights only
  const seed = [];
  // a few round each light, not a swarm
  centres.forEach((c, i) => { const n = i === 1 ? 6 : 4; for (let k = 0; k < n; k++) seed.push({ c, wall: i === 0, r: rr(0.12, i === 1 ? 0.75 : 0.5), p: rand() * 6.28, s: rr(2.2, 6) * (rand() < 0.5 ? -1 : 1), y: rr(-0.2, i === 1 ? 0.6 : 0.3), w: rr(1.5, 4.5) }); });
  const pos = new Float32Array(seed.length * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xf4e8cc, size: 2.2 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, seed, m };
})();
// how far the view reaches over the ground from the camera's target, in x and z, with a margin: whatever wraps round the
// view (the dust, the mist, the road fog) does it out past this, so nothing pops in or out however far you zoom out
const _vc = new V3(), _vd = new V3(), viewExt = { x: 22, z: 22 };
function measureView() {
  let ex = 0, ez = 0;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _vc.set(a, b, -1).unproject(cam); _vd.set(a, b, 1).unproject(cam).sub(_vc);   // the camera is orthographic: a straight ray through each corner
    const t = Math.abs(_vd.y) > 1e-6 ? -_vc.y / _vd.y : 0;
    ex = Math.max(ex, Math.abs(_vc.x + _vd.x * t - camTarget.x)); ez = Math.max(ez, Math.abs(_vc.z + _vd.z * t - camTarget.z));
  }
  viewExt.x = Math.max(14, ex + 3); viewExt.z = Math.max(14, ez + 3);
}
// drifting pollen and dust that catch the light by day: as many as it takes to keep the same density across the whole
// view, each easing in when it's first needed or has just wrapped round to the other side, so none ever pops
const motes = (() => {
  const MAX = 600, pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), seed = [];
  for (let k = 0; k < MAX; k++) seed.push({ x: rr(-14, 14), y: rr(0.2, 3), z: rr(-14, 14), p: rand() * 6.28, s: rr(0.15, 0.45), a: 0 });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ color: 0xfff1cc, size: 2.0 * DPR, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, col, seed, m, MAX };
})();
const MOTE_DENSITY = 45 / (28 * 28);   // a light scatter of them, not a haze
// low banks of mist that creep across the yard at night
const mists = [];
for (let k = 0; k < 20; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0, color: 0xc8b0a0 })); sp.position.set(rr(-20, 20), rr(0.25, 0.6), rr(-20, 20)); const sc = rr(7, 12); sp.scale.set(sc, sc * 0.45, 1); sp.userData = { vx: rr(0.15, 0.35), vz: rr(-0.1, 0.1), ph: rand() * 6, life: rr(0, 30), max: rr(18, 34) }; scene.add(sp); mists.push(sp); }
// fog lying over the main road out front (world/ground.js): soft banks drifting along it day and night, thicker with the
// weather, so the road is never quite clear and the zombies crossing it come out of them
const roadFog = [];
const placeRoadFog = (sp, x) => { sp.position.set(x, rr(0.5, 1.1), ROAD.z + rr(-3.5, 3.5)); const sc = rr(7, 12); sp.scale.set(sc, sc * rr(0.35, 0.5), 1); };
for (let k = 0; k < 14; k++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  placeRoadFog(sp, rr(-26, 26)); sp.userData = { vx: rr(0.25, 0.6) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6, life: rr(0, 40), max: rr(24, 44) }; scene.add(sp); roadFog.push(sp);
}
// the weather: a fog level that drifts toward a new target every minute or so, so banks of fog roll in and burn off
const fogW = { lv: 0.3, to: 0.3, t: 20 };
function stepAtmos(realDt) {
  const rdt = realDt * worldK, t = worldT, day = 1 - curDark;   // ambient motion runs on the world clock, so it freezes with the world
  WIND.value = t * 1.6;
  updatePushers();   // the grass and bushes parting round you and the zombies near you (world/trees.js)
  const tb = titleBlend();
  measureView();
  motes.m.opacity = mix(0.42 * Math.max(0, day - 0.15), 0.35, tb);
  if (motes.m.opacity > 0.01) {
    const ex = viewExt.x, ez = viewExt.z, want = Math.min(motes.MAX, Math.round(MOTE_DENSITY * 4 * ex * ez)), ease = Math.min(1, realDt * 1.5);
    for (let k = 0; k < motes.MAX; k++) {
      const q = motes.seed[k]; q.x += (0.25 + Math.sin(t * 0.3 + q.p) * 0.15) * rdt; q.y += Math.sin(t * 0.8 + q.p * 2) * 0.05 * rdt; q.z += Math.cos(t * 0.4 + q.p) * 0.12 * rdt;
      // wrap round the view (out of sight past its edge) so there are always some about; a wrapped one fades back in
      const rx = q.x - camTarget.x, rz = q.z - camTarget.z;
      if (Math.abs(rx) > ex || Math.abs(rz) > ez) { q.x = camTarget.x + ((rx % (2 * ex)) + 3 * ex) % (2 * ex) - ex; q.z = camTarget.z + ((rz % (2 * ez)) + 3 * ez) % (2 * ez) - ez; q.a = 0; }
      q.a += ((k < want ? 1 : 0) - q.a) * ease;
      motes.pos[k * 3] = q.x; motes.pos[k * 3 + 1] = inHouse(q.x, q.z, 0.3) ? -50 : q.y + Math.sin(t * q.s * 3 + q.p) * 0.15; motes.pos[k * 3 + 2] = q.z;   // none indoors
      motes.col[k * 3] = motes.col[k * 3 + 1] = motes.col[k * 3 + 2] = q.a;
    }
    motes.pts.geometry.attributes.position.needsUpdate = motes.pts.geometry.attributes.color.needsUpdate = true;
  }
  LMU.uHouse.value.set(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1);
  LMU.uCloud.value.x += rdt * 0.0042; LMU.uCloud.value.y += rdt * 0.0017;
  LMU.uCloud.value.z = mix(0.22 * Math.max(0, day - 0.2) * (1 - fogW.lv * 0.6), 0.12, tb);
  fogW.t -= rdt; if (fogW.t <= 0) { fogW.t = rr(35, 80); fogW.to = rand() < 0.45 ? rr(0.6, 1) : rr(0, 0.3); }
  fogW.lv += (fogW.to - fogW.lv) * Math.min(1, rdt * 0.05);
  // thick fog pulls the distance haze in close and tints it with the sky
  scene.fog.near = 42 - fogW.lv * 6; scene.fog.far = 78 - fogW.lv * 18;
  const mo = mix((Math.max(0, curDark - 0.35) * 0.12 + fogW.lv * 0.16) * (0.4 + 0.6 * Math.max(curDark, 0.35)), 0.06, tb);
  const rf = mix(0.42 + fogW.lv * 0.3, 0, tb);
  for (const sp of roadFog) {
    const u = sp.userData; sp.position.x += u.vx * rdt;
    const wx = viewExt.x + 7;   // wrapped and placed out past the edge of the view, with room for the bank's own size
    u.life += rdt; if (u.life > u.max) { u.life = 0; u.max = rr(24, 44); placeRoadFog(sp, camTarget.x + rr(-wx, wx)); }
    if (sp.position.x - camTarget.x > wx) sp.position.x -= 2 * wx; if (sp.position.x - camTarget.x < -wx) sp.position.x += 2 * wx;
    sp.material.color.copy(scene.fog.color).multiplyScalar(0.9);
    sp.material.opacity = rf * Math.sin(Math.PI * u.life / u.max) * (0.75 + 0.25 * Math.sin(t * 0.25 + u.ph));
    sp.visible = sp.material.opacity > 0.005;
  }
  for (const sp of mists) {
    const u = sp.userData; sp.position.x += u.vx * rdt; sp.position.z += u.vz * rdt;
    // each patch lives a while: it thickens out of nothing, hangs, thins away, and comes back somewhere else
    const wx = viewExt.x + 6, wz = viewExt.z + 6;   // wrapped out past the edge of the view, with room for the patch's own size
    u.life += rdt; if (u.life > u.max) { u.life = 0; u.max = rr(18, 34); sp.position.set(camTarget.x + rr(-wx, wx), rr(0.25, 0.6), camTarget.z + rr(-wz, wz)); }
    const env = Math.sin(Math.PI * u.life / u.max);
    if (sp.position.x - camTarget.x > wx) sp.position.x -= 2 * wx; if (sp.position.x - camTarget.x < -wx) sp.position.x += 2 * wx;
    if (sp.position.z - camTarget.z > wz) sp.position.z -= 2 * wz; if (sp.position.z - camTarget.z < -wz) sp.position.z += 2 * wz;
    const inside = sp.position.x > HOUSE.x0 - 1 && sp.position.x < HOUSE.x1 + 1 && sp.position.z > HOUSE.z0 - 1 && sp.position.z < HOUSE.z1 + 1;
    sp.material.opacity = inside ? 0 : mo * env * (0.7 + 0.3 * Math.sin(t * 0.2 + u.ph));
    sp.visible = sp.material.opacity > 0.005;
  }
}
// fireflies at night: a scattered handful over the whole farm
const fireflies = (() => {
  const n = 14, pos = new Float32Array(n * 3), seed = [];
  // they drift up to 1.2 m either way, so none is seeded within that of the house and none wanders in
  while (seed.length < n) { const x = rr(cxw(FX0), cxw(FX1)), z = rr(cxw(FZ0), cxw(FZ1)); if (!inHouse(x, z, 1.4)) seed.push({ x, z, y: rr(0.4, 1.6), p: rand() * 6, s: rr(0.3, 0.8) }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xdff59a, size: 3.2 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  // never culled: its bounds are worked out from where the flies start, so the whole swarm would blink out whenever
  // that spot left the screen
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, seed, m };
})();
// the film grain's noise tile (styles/overlays.css jitters it)
{
  const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'), d = x.createImageData(160, 160);
  for (let k = 0; k < d.data.length; k += 4) { const v = 70 + rand() * 115; d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255; }
  x.putImageData(d, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
