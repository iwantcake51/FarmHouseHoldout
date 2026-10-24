// Moths, pollen motes, night mist and fireflies.

import { $ } from '../core/dom.js';
import { cam, DPR, scene, V3 } from '../core/renderer.js';
import { clamp, HALF, mix, rand, rr, smooth } from '../core/math.js';
import { LMU } from '../core/shaders.js';
import { BLOB_TEX } from '../core/geometry.js';
import { cxw } from './grid.js';
import { FAR_VIEW, HZ1, ROAD } from './ground.js';
import { HOUSE, inHouseRect } from './house.js';
import { BURN_BARREL } from './props.js';
import { FX0, FX1, FZ0, FZ1 } from './fence.js';
import { updatePushers } from './trees.js';
import { stepWind, windAt, WX } from './wind.js';
import { SKY_CLOUD, SKY_U, updateSky } from './sky.js';
import { worldK, worldT } from '../game/state.js';
import { titleBlend } from '../game/intro.js';
import { curDark } from '../lighting/day-night.js';
import { camTarget } from '../game/camera.js';

// inside the house's walls (plus a margin): the bugs and motes keep out
const inHouse = (x, z, m) => inHouseRect(x, z, m);
// moths that circle the lamps and the fire after dark
export const moths = (() => {
  const centres = [[cxw(21) + 0.7, 2.25, cxw(HZ1) + 0.42], BURN_BARREL.moths];   // outdoor lights only (the barrel's moves each run: world/yard.js)
  const seed = [];
  // a few round each light, not a swarm
  centres.forEach((c, i) => { const n = i === 1 ? 6 : 4; for (let k = 0; k < n; k++) seed.push({ c, wall: i === 0, r: rr(0.12, i === 1 ? 0.75 : 0.5), p: rand() * 6.28, s: rr(2.2, 6) * (rand() < 0.5 ? -1 : 1), y: rr(-0.2, i === 1 ? 0.6 : 0.3), w: rr(1.5, 4.5) }); });
  const pos = new Float32Array(seed.length * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xf4e8cc, size: 2.2 * DPR, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, seed, m };
})();
// how far the view reaches over the ground from the camera's target, in x and z, with a margin: whatever wraps round the
// view (the mist, the road fog) does it out past this, so nothing pops in or out however far you zoom out
const _vc = new V3(), _vd = new V3(), viewExt = { x: 22, z: 22 };
function measureView() {
  if (cam.isPerspectiveCamera) { viewExt.x = viewExt.z = 34; return; }   // (first person or the free camera: out toward the horizon, game/view-cam.js)
  let ex = 0, ez = 0;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _vc.set(a, b, -1).unproject(cam); _vd.set(a, b, 1).unproject(cam).sub(_vc);   // the camera is orthographic: a straight ray through each corner
    const t = Math.abs(_vd.y) > 1e-6 ? -_vc.y / _vd.y : 0;
    ex = Math.max(ex, Math.abs(_vc.x + _vd.x * t - camTarget.x)); ez = Math.max(ez, Math.abs(_vc.z + _vd.z * t - camTarget.z));
  }
  viewExt.x = Math.max(14, ex + 3); viewExt.z = Math.max(14, ez + 3);
}
// drifting pollen and dust that catch the light by day: a field of them spread evenly over a square MOTE_W either way
// of the camera's target, wider than the view however far you zoom out, that wraps round on itself as they drift and
// the view moves. Every one is in play at once, so the scatter is just as thin wherever you look and however far out
// you are. (They used to be seeded in a patch 28 m across and only ever wrapped round the edge of the view, so zoomed
// out that patch was all there was: every mote bunched up in one spot drifting across the screen)
const MOTE_DENSITY = 75 / (28 * 28);   // a light scatter of them, not a haze (as many on screen as there used to be, spread out)
const MOTE_W = 60;
// the haze round the farm (uEdge, core/shaders.js): where it starts and where everything's gone into it, seen from above
// and from your own eyes; and from your own eyes the motes fade out by MOTE_FAR metres off (drawn the same size however
// far, a field of them out to the horizon was a band of specks across it)
const NEAR_EDGE = [HALF + 0.5, HALF + 12], FAR_EDGE = [HALF + 9, HALF + 44], MOTE_FAR = [6, 18];   // past the corners of the widest view (the furthest zoom on a wide screen), so they wrap out of sight
const motes = (() => {
  const MAX = Math.round(MOTE_DENSITY * 4 * MOTE_W * MOTE_W), pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), seed = [];
  for (let k = 0; k < MAX; k++) seed.push({ x: rr(-MOTE_W, MOTE_W), y: rr(0.2, 3), z: rr(-MOTE_W, MOTE_W), p: rand() * 6.28, s: rr(0.15, 0.45), a: 0 });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ color: 0xfff1cc, size: 2.0 * DPR, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, col, seed, m, MAX };
})();
// low banks of mist that creep across the yard at night
const mists = [];
for (let k = 0; k < 20; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0, color: 0xc8b0a0 })); sp.position.set(rr(-20, 20), rr(0.25, 0.6), rr(-20, 20)); const sc = rr(7, 12); sp.scale.set(sc, sc * 0.45, 1); sp.userData = { vx: rr(0.15, 0.35), vz: rr(-0.1, 0.1), ph: rand() * 6, life: rr(0, 30), max: rr(18, 34) }; scene.add(sp); mists.push(sp); }
// fog lying over the main road out front (world/ground.js): soft banks drifting slowly along it day and night, thicker
// with the weather, so the road is never quite clear and the zombies crossing it come out of them. Like the haze round
// the farm (EDGE_BODY, core/shaders.js), the wind doesn't move them
const roadFog = [];
const placeRoadFog = (sp, x) => { sp.position.set(x, rr(0.5, 1.1), ROAD.z + rr(-3.5, 3.5)); const sc = rr(7, 12); sp.scale.set(sc, sc * rr(0.35, 0.5), 1); };
for (let k = 0; k < 14; k++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  placeRoadFog(sp, rr(-26, 26)); sp.userData = { vx: rr(0.08, 0.22) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6, life: rr(0, 40), max: rr(24, 44) }; scene.add(sp); roadFog.push(sp);
}
// the weather: a fog level that drifts toward a new target every minute or so, so banks of fog roll in and burn off
const fogW = { lv: 0.3, to: 0.3, t: 20 };
const _aw = { x: 0, z: 0 };
export function stepAtmos(realDt) {
  const rdt = realDt * worldK, t = worldT, day = 1 - curDark;   // ambient motion runs on the world clock, so it freezes with the world
  stepWind(rdt);   // which way the wind blows and how hard (world/wind.js)
  updatePushers();   // the grass and bushes parting round you and the zombies near you (world/trees.js)
  const tb = titleBlend();
  measureView();
  motes.m.opacity = mix(0.42 * Math.max(0, day - 0.15), 0.35, tb);
  if (motes.m.opacity > 0.01) {
    const W = MOTE_W, ease = Math.min(1, realDt * 1.5), persp = !!cam.isPerspectiveCamera;
    for (let k = 0; k < motes.MAX; k++) {
      const q = motes.seed[k]; windAt(q.x, q.z, _aw);   // carried on the wind, wandering about it
      q.x += (_aw.x * 0.8 + Math.sin(t * 0.3 + q.p) * 0.12) * rdt; q.y += Math.sin(t * 0.8 + q.p * 2) * (0.05 + 0.1 * WX.str) * rdt; q.z += (_aw.z * 0.8 + Math.cos(t * 0.4 + q.p) * 0.12) * rdt;
      // wrap round the field, out of sight past the edge of the view; one that wrapped fades back in, in case the view jumped
      const rx = q.x - camTarget.x, rz = q.z - camTarget.z;
      if (Math.abs(rx) > W || Math.abs(rz) > W) { q.x = camTarget.x + ((rx % (2 * W)) + 3 * W) % (2 * W) - W; q.z = camTarget.z + ((rz % (2 * W)) + 3 * W) % (2 * W) - W; q.a = 0; }
      q.a += (1 - q.a) * ease;
      motes.pos[k * 3] = q.x; motes.pos[k * 3 + 1] = inHouse(q.x, q.z, 0.3) ? -50 : q.y + Math.sin(t * q.s * 3 + q.p) * 0.15; motes.pos[k * 3 + 2] = q.z;   // none indoors
      const fa = persp ? 1 - smooth(clamp((Math.hypot(q.x - cam.position.x, q.z - cam.position.z) - MOTE_FAR[0]) / (MOTE_FAR[1] - MOTE_FAR[0]), 0, 1)) : 1;
      motes.col[k * 3] = motes.col[k * 3 + 1] = motes.col[k * 3 + 2] = q.a * fa;
    }
    motes.pts.geometry.attributes.position.needsUpdate = motes.pts.geometry.attributes.color.needsUpdate = true;
  }
  LMU.uHouse.value.set(HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1); { const c = HOUSE.cut; if (c) LMU.uHouseCut.value.set(c[0], c[1], c[2], c[3]); else LMU.uHouseCut.value.set(-1e3, -1e3, -1e3, -1e3); }
  LMU.uFogT.value = t % 10000;   // the edge fog's clock, wrapped where every drift in EDGE_BODY comes round whole, so it never jumps
  { const cs = (0.4 + 2.5 * WX.str) * 0.022; LMU.uCloud.value.x -= rdt * cs * WX.x; LMU.uCloud.value.y -= rdt * cs * WX.z; }   // the clouds' shade sails over with the wind (0.022: the shade's scale, core/shaders.js), quicker up there than down here
  LMU.uCloud.value.z = mix(0.22 * Math.max(0, day - 0.2) * (1 - fogW.lv * 0.6), 0.12, tb);
  fogW.t -= rdt; if (fogW.t <= 0) { fogW.t = rr(35, 80); fogW.to = rand() < 0.45 ? rr(0.6, 1) : rr(0, 0.3); }
  fogW.lv += (fogW.to - fogW.lv) * Math.min(1, rdt * 0.05);
  // thick fog pulls the distance haze in close and tints it with the sky
  // (and the free camera flown up high sees as far again as it is up: game/view-cam.js)
  const up = cam.isPerspectiveCamera ? Math.max(0, cam.position.y - 4) : 0;
  scene.fog.near = 42 - fogW.lv * 6 + up; scene.fog.far = 78 - fogW.lv * 18 + up * 1.4;
  // from your own eyes (or the free camera) the haze round the farm lies further out (FAR_EDGE), over the woods and
  // the road rather than right at the fence, and the woods on to the horizon, the power line and the sky come into view
  // (world/ground.js, world/sky.js); thick fog greys the sky out toward the haze
  { const far = !!cam.isPerspectiveCamera, E = far ? FAR_EDGE : NEAR_EDGE; LMU.uEdge.value.set(E[0], E[1]); FAR_VIEW.visible = far;
    updateSky(day); SKY_U.uTop.value.lerp(scene.fog.color, fogW.lv * 0.55); SKY_U.uCloudK.value = SKY_CLOUD * (1 - fogW.lv * 0.7); }
  const mo = mix((Math.max(0, curDark - 0.35) * 0.12 + fogW.lv * 0.16) * (0.4 + 0.6 * Math.max(curDark, 0.35)), 0.06, tb);
  const rf = mix(0.42 + fogW.lv * 0.3, 0, tb);
  for (const sp of roadFog) {
    const u = sp.userData; sp.position.x += u.vx * rdt;   // creeping along the road on its own
    const wx = viewExt.x + 7;   // wrapped and placed out past the edge of the view, with room for the bank's own size
    u.life += rdt; if (u.life > u.max) { u.life = 0; u.max = rr(24, 44); placeRoadFog(sp, camTarget.x + rr(-wx, wx)); }
    if (sp.position.x - camTarget.x > wx) sp.position.x -= 2 * wx; if (sp.position.x - camTarget.x < -wx) sp.position.x += 2 * wx;
    sp.material.color.copy(scene.fog.color).multiplyScalar(0.9);
    sp.material.opacity = rf * Math.sin(Math.PI * u.life / u.max) * (0.75 + 0.25 * Math.sin(t * 0.25 + u.ph));
    sp.visible = sp.material.opacity > 0.005;
  }
  for (const sp of mists) {
    const u = sp.userData, wv = 0.12 + 0.8 * WX.str; sp.position.x += (u.vx * 0.4 + WX.x * wv) * rdt; sp.position.z += (u.vz + WX.z * wv) * rdt;   // creeping along on the wind
    // each patch lives a while: it thickens out of nothing, hangs, thins away, and comes back somewhere else
    const wx = viewExt.x + 6, wz = viewExt.z + 6;   // wrapped out past the edge of the view, with room for the patch's own size
    u.life += rdt; if (u.life > u.max) { u.life = 0; u.max = rr(18, 34); sp.position.set(camTarget.x + rr(-wx, wx), rr(0.25, 0.6), camTarget.z + rr(-wz, wz)); }
    const env = Math.sin(Math.PI * u.life / u.max);
    if (sp.position.x - camTarget.x > wx) sp.position.x -= 2 * wx; if (sp.position.x - camTarget.x < -wx) sp.position.x += 2 * wx;
    if (sp.position.z - camTarget.z > wz) sp.position.z -= 2 * wz; if (sp.position.z - camTarget.z < -wz) sp.position.z += 2 * wz;
    const inside = inHouseRect(sp.position.x, sp.position.z, 1);
    sp.material.opacity = inside ? 0 : mo * env * (0.7 + 0.3 * Math.sin(t * 0.2 + u.ph));
    sp.visible = sp.material.opacity > 0.005;
  }
}
// fireflies at night: a scattered handful over the whole farm
export const fireflies = (() => {
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
