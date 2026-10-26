// Zombie eyes: a soft glow round each eye (the game has no bloom pass, so an additive halo stands in for it) and a short
// streak of light that trails behind them as they move, fading out over a fraction of a second.

import { cam, R, scene, V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { GLOW_LAYER } from './post.js';
import { BLOB_TEX } from '../core/geometry.js';
import { ragdolls } from '../zombies/deaths.js';
import { zombies } from '../zombies/zombie-types.js';
import { worldT } from '../game/state.js';
import { curDark } from '../lighting/day-night.js';
import { visAt } from '../lighting/vision.js';
import { roofCover } from '../world/cutaway.js';

// the glow is a pale, washed-out yellow and kept soft (EYE_HALO, EYE_STREAK), so eyes read in the dark without blazing
export const EYE_COL = 0xffe6a8, EYE_GLOW = new THREE.Color(0xfff0b4), EYE_HALO = 0.32, EYE_STREAK = 0.5, EYE_TRAIL_T = 0.26, EYE_PTS = 10, EYE_MAX = 48 * 2;
// how big the halo is across (m) and how wide the streak behind it at its widest (m)
const EYE_SIZE = { halo: 0.2, streak: 0.018, near: 0.07 };
// the halo and the streak are drawn a little nearer the camera than the eye (EYE_SIZE.near m), and in the glow pass they
// write that depth (eyeDepth): the face in front of the eyes never covers them, but seen from behind, the back of the
// head, much nearer than that, hides them from the bloom as it does from the frame
const nearer = M => { M.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  mvPosition.z += ${EYE_SIZE.near.toFixed(3)}; gl_Position = projectionMatrix * mvPosition;`); }; return M; };
const eyeFx = (() => {
  // the trails: one ribbon of EYE_PTS points per eye, all in one mesh
  const nv = EYE_MAX * EYE_PTS * 2, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = [];
  for (let e = 0; e < EYE_MAX; e++) for (let k = 0; k < EYE_PTS - 1; k++) { const a = (e * EYE_PTS + k) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const trail = new THREE.Mesh(g, nearer(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  trail.frustumCulled = false; trail.renderOrder = 5; trail.layers.enable(GLOW_LAYER); scene.add(trail);
  // the halos: one soft sprite per eye
  const hp = new Float32Array(EYE_MAX * 3), hc = new Float32Array(EYE_MAX * 3), hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  const halo = new THREE.Points(hg, nearer(new THREE.PointsMaterial({ map: BLOB_TEX, size: 8, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.02, blending: THREE.AdditiveBlending })));
  halo.frustumCulled = false; halo.renderOrder = 5; halo.layers.enable(GLOW_LAYER); scene.add(halo);
  return { trail, pos, col, halo, hp, hc };
})();
// (only for the glow pass: in the frame itself they write none, so they never cut holes in the smoke drawn after them)
export function eyeDepth(on) { eyeFx.trail.material.depthWrite = eyeFx.halo.material.depthWrite = on; }
const _ew = new V3(), _ev = new V3(), _et = new V3(), _en = new V3(), _eo = [];
const eyeOwners = () => { _eo.length = 0; for (const z of zombies) _eo.push(z); for (const r of ragdolls) if (r.eyeGlow > 0.01) _eo.push(r); return _eo; };
export function updateEyes(dt) {
  const F = eyeFx, now = worldT, glow = 0.55 + 0.45 * curDark;   // brighter in the dark
  cam.getWorldDirection(_ev);
  // the halo is sized in pixels with the isometric camera (it's orthographic): EYE_SIZE.halo across in the world; with
  // perspective (first person, the free camera) it shrinks with distance as anything does
  { const M = F.halo.material, ps = !!cam.isPerspectiveCamera; if (M.sizeAttenuation !== ps) { M.sizeAttenuation = ps; M.needsUpdate = true; }
    M.size = ps ? EYE_SIZE.halo / Math.tan(cam.fov * Math.PI / 360) : EYE_SIZE.halo * R.domElement.height / ((cam.top - cam.bottom) / cam.zoom); }
  let e = 0;
  // the living, and the freshly dead whose eyes are still going out (eyeGlow, zombies/zombie-visuals.js)
  for (const z of eyeOwners()) {
    if (e >= EYE_MAX) break;
    const dead = z.eyeGlow !== undefined, eyes = dead ? z.eyes : z.m.eyes;
    // only what you can see right now glows: the view cone as it is this moment, not the body's slower fade, so no eyes
    // or streaks hang about once a zombie is out of sight (and none come back trailing from where it was)
    // nor under a roof that's showing (the house's, the porch's), whatever you can see of it through a window
    const seen = smooth(clamp((Math.min(z.vis, visAt(z.x, z.z)) - 0.35) / 0.55, 0, 1)) * (1 - smooth(clamp(roofCover(z.x, z.z), 0, 1)));
    // (and the eyes themselves are drawn only then: lit as they are, they'd bloom through a wall you can't see past,
    // on a zombie shown there only by its see-through outline)
    if (eyes) { const on = seen >= 0.01; if (eyes[0].visible !== on) eyes.forEach(o => { o.visible = on; }); }
    if (!eyes || (dead ? z.eyeGlow <= 0.01 : !z.limbs.head) || seen < 0.01) { z.eyeH = null; continue; }
    const H = z.eyeH || (z.eyeH = [[], []]);
    for (let s = 0; s < 2; s++, e++) {
      eyes[s].getWorldPosition(_ew);
      // the first point rides the eye; a new one is laid down every 26 ms, so the trail is as long at any frame rate
      const h = H[s], cur = [_ew.x, _ew.y, _ew.z, now];
      if (h.length < 2 || now - h[1][3] >= 0.026) h.unshift(cur); else h[0] = cur;
      while (h.length > EYE_PTS || (h.length > 2 && now - h[h.length - 1][3] > EYE_TRAIL_T)) h.pop();
      const k0 = e * EYE_PTS * 2, v = seen * glow * (dead ? z.eyeGlow : 1);
      // halo
      const EG = (z.m && z.m.eyeGlow) || z.eyeTint || EYE_GLOW;   // (a spitter's sour green: zombies/spitter.js)
      F.hp[e * 3] = _ew.x; F.hp[e * 3 + 1] = _ew.y; F.hp[e * 3 + 2] = _ew.z; F.hc[e * 3] = EG.r * v * EYE_HALO; F.hc[e * 3 + 1] = EG.g * v * EYE_HALO; F.hc[e * 3 + 2] = EG.b * v * EYE_HALO;
      // ribbon: thick and bright at the eye, thinning and fading toward the tail; it faces the camera
      for (let k = 0; k < EYE_PTS; k++) {
        const n1 = h.length - 1, p = h[Math.min(k, n1)], q = h[Math.min(k + 1, n1)], r = h[Math.min(Math.max(0, k - 1), n1)];
        _et.set(q[0] - r[0], q[1] - r[1], q[2] - r[2]); _en.crossVectors(_et, _ev); const l = _en.length();
        const age = clamp((now - p[3]) / EYE_TRAIL_T, 0, 1), f = (1 - age) * (1 - k / (EYE_PTS - 1)), w = EYE_SIZE.streak * (0.3 + 0.7 * f);
        if (l > 1e-5) _en.multiplyScalar(w / l); else _en.set(0, 0, 0);
        const a = (k0 + k * 2) * 3, c = v * f * (0.4 + 0.6 * f) * EYE_STREAK;
        F.pos[a] = p[0] + _en.x; F.pos[a + 1] = p[1] + _en.y; F.pos[a + 2] = p[2] + _en.z;
        F.pos[a + 3] = p[0] - _en.x; F.pos[a + 4] = p[1] - _en.y; F.pos[a + 5] = p[2] - _en.z;
        F.col[a] = F.col[a + 3] = EG.r * c; F.col[a + 1] = F.col[a + 4] = EG.g * c; F.col[a + 2] = F.col[a + 5] = EG.b * c;
      }
    }
  }
  F.trail.geometry.setDrawRange(0, Math.max(0, e * (EYE_PTS - 1) * 6)); F.halo.geometry.setDrawRange(0, e);
  F.trail.visible = F.halo.visible = e > 0;
  F.trail.geometry.attributes.position.needsUpdate = F.trail.geometry.attributes.color.needsUpdate = true;
  F.halo.geometry.attributes.position.needsUpdate = F.halo.geometry.attributes.color.needsUpdate = true;
}
