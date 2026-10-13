// Zombie eyes: a soft glow round each eye (the game has no bloom pass, so an additive halo stands in for it) and a short
// streak of light that trails behind them as they move, fading out over a fraction of a second.

const EYE_COL = 0xffe6a8, EYE_GLOW = new THREE.Color(0xffb04a), EYE_TRAIL_T = 0.26, EYE_PTS = 10, EYE_MAX = 48 * 2;
const eyeFx = (() => {
  // the trails: one ribbon of EYE_PTS points per eye, all in one mesh
  const nv = EYE_MAX * EYE_PTS * 2, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = [];
  for (let e = 0; e < EYE_MAX; e++) for (let k = 0; k < EYE_PTS - 1; k++) { const a = (e * EYE_PTS + k) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const trail = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  trail.frustumCulled = false; trail.renderOrder = 5; scene.add(trail);
  // the halos: one soft sprite per eye
  const hp = new Float32Array(EYE_MAX * 3), hc = new Float32Array(EYE_MAX * 3), hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  const halo = new THREE.Points(hg, new THREE.PointsMaterial({ map: BLOB_TEX, size: 8, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.frustumCulled = false; halo.renderOrder = 5; scene.add(halo);
  return { trail, pos, col, halo, hp, hc };
})();
const _ew = new V3(), _ev = new V3(), _et = new V3(), _en = new V3(), _eo = [];
const eyeOwners = () => { _eo.length = 0; for (const z of zombies) _eo.push(z); for (const r of ragdolls) if (r.eyeGlow > 0.01) _eo.push(r); return _eo; };
function updateEyes(dt) {
  const F = eyeFx, now = worldT, glow = 0.55 + 0.45 * curDark;   // brighter in the dark
  cam.getWorldDirection(_ev);
  // the halo is sized in pixels (the camera is orthographic): about 30 cm across in the world
  F.halo.material.size = 0.3 * R.domElement.height / ((cam.top - cam.bottom) / cam.zoom);
  let e = 0;
  // the living, and the freshly dead whose eyes are still going out (eyeGlow, zombies/zombie-visuals.js)
  for (const z of eyeOwners()) {
    if (e >= EYE_MAX) break;
    const dead = z.eyeGlow !== undefined, eyes = dead ? z.eyes : z.m.eyes;
    if (!eyes || (dead ? z.eyeGlow <= 0.01 : !z.limbs.head)) { z.eyeH = null; continue; }
    const H = z.eyeH || (z.eyeH = [[], []]);
    for (let s = 0; s < 2; s++, e++) {
      eyes[s].getWorldPosition(_ew);
      // the first point rides the eye; a new one is laid down every 26 ms, so the trail is as long at any frame rate
      const h = H[s], cur = [_ew.x, _ew.y, _ew.z, now];
      if (h.length < 2 || now - h[1][3] >= 0.026) h.unshift(cur); else h[0] = cur;
      while (h.length > EYE_PTS || (h.length > 2 && now - h[h.length - 1][3] > EYE_TRAIL_T)) h.pop();
      const k0 = e * EYE_PTS * 2, v = Math.min(1, z.vis * 1.6) * glow * (dead ? z.eyeGlow : 1);
      // halo
      F.hp[e * 3] = _ew.x; F.hp[e * 3 + 1] = _ew.y; F.hp[e * 3 + 2] = _ew.z; F.hc[e * 3] = EYE_GLOW.r * v * 0.9; F.hc[e * 3 + 1] = EYE_GLOW.g * v * 0.9; F.hc[e * 3 + 2] = EYE_GLOW.b * v * 0.9;
      // ribbon: thick and bright at the eye, thinning and fading toward the tail; it faces the camera
      for (let k = 0; k < EYE_PTS; k++) {
        const n1 = h.length - 1, p = h[Math.min(k, n1)], q = h[Math.min(k + 1, n1)], r = h[Math.min(Math.max(0, k - 1), n1)];
        _et.set(q[0] - r[0], q[1] - r[1], q[2] - r[2]); _en.crossVectors(_et, _ev); const l = _en.length();
        const age = clamp((now - p[3]) / EYE_TRAIL_T, 0, 1), f = (1 - age) * (1 - k / (EYE_PTS - 1)), w = 0.026 * (0.3 + 0.7 * f);
        if (l > 1e-5) _en.multiplyScalar(w / l); else _en.set(0, 0, 0);
        const a = (k0 + k * 2) * 3, c = v * f * (0.4 + 0.6 * f) * 1.2;
        F.pos[a] = p[0] + _en.x; F.pos[a + 1] = p[1] + _en.y; F.pos[a + 2] = p[2] + _en.z;
        F.pos[a + 3] = p[0] - _en.x; F.pos[a + 4] = p[1] - _en.y; F.pos[a + 5] = p[2] - _en.z;
        F.col[a] = F.col[a + 3] = EYE_GLOW.r * c; F.col[a + 1] = F.col[a + 4] = EYE_GLOW.g * c; F.col[a + 2] = F.col[a + 5] = EYE_GLOW.b * c;
      }
    }
  }
  F.trail.geometry.setDrawRange(0, Math.max(0, e * (EYE_PTS - 1) * 6)); F.halo.geometry.setDrawRange(0, e);
  F.trail.visible = F.halo.visible = e > 0;
  F.trail.geometry.attributes.position.needsUpdate = F.trail.geometry.attributes.color.needsUpdate = true;
  F.halo.geometry.attributes.position.needsUpdate = F.halo.geometry.attributes.color.needsUpdate = true;
}
