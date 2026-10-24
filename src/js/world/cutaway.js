// Fading wall faces and the roof so you can see inside.

import { cam, renderScale, YAW, zoom } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { LMU, TREE_CUT } from '../core/shaders.js';
import { ci, idx, inb } from './grid.js';
import { HOUSE, HOUSE_FP, inHouseRect, porchRoof, roof, stepPaint, walls } from './house.js';
import { IW_LINES, updateDoors } from './interior.js';
import { TREES } from './trees.js';
import { state } from '../game/state.js';
import { INTRO, introCamOn } from '../game/intro.js';
import { _c2, amb } from '../lighting/day-night.js';
import { isoOn } from '../game/view-cam.js';
import { projV } from '../ui/crosshair.js';
import { camFocus } from '../net/spectate.js';

const TOWARD_CAM = { x: Math.sin(YAW), z: Math.cos(YAW) };   // flat direction from the scene toward the camera
const SQ = Math.SQRT1_2;
// a wall face (f: which way it looks, N S W E; at: the line of the wall cells it's on) fades only if the line from you (F:
// or the teammate you're watching) toward the camera actually passes through it
function faceCut(F, f, at) {
  if (state === 'title' || !isoOn()) return false;   // (first person or the free camera: nothing's in the way of a camera overhead)
  const d = SQ, m = 0.7, maxT = 7.5;
  if (f === 'E' || f === 'W') { const t = (at - F.x) / d; if (t < 0.05 || t > maxT) return false; const z = F.z + d * t; return z > HOUSE.z0 - m && z < HOUSE.z1 + m; }
  const t = (at - F.z) / d; if (t < 0.05 || t > maxT) return false; const x = F.x + d * t; return x > HOUSE.x0 - m && x < HOUSE.x1 + m;
}
// whether the house stands between F and the camera: the line from F toward it passes over the house's footprint
// within ROOF_BEHIND metres (in its steps). It's the footprint as it is this run, so a notched house's wing hides you
// in the notch behind it as well as the back walls do
const ROOF_BEHIND = { far: 7.5, step: 0.25 };
function behindHouse(F) {
  for (let t = 0.3; t < ROOF_BEHIND.far; t += ROOF_BEHIND.step) {
    const i = ci(F.x + TOWARD_CAM.x * t), j = ci(F.z + TOWARD_CAM.z * t);
    if (inb(i, j) && HOUSE_FP[idx(i, j)]) return true;
  }
  return false;
}
// roof and wall-face fading so you can see inside: round you, or once you're down in co-op, round the teammate the
// camera's on (camFocus, net/spectate.js)
const ROOF_INTRO = [0.12, 1.15];
const IW_CUT = { far: 4.2, end: 0.4 };
function lineCut(ln, F) {
  const d = ln.ax === 'x' ? TOWARD_CAM.x : TOWARD_CAM.z; if (Math.abs(d) < 1e-4) return false;
  const t = (ln.p - (ln.ax === 'x' ? F.x : F.z)) / d; if (t < 0.02 || t > IW_CUT.far) return false;
  const u = ln.ax === 'x' ? F.z + TOWARD_CAM.z * t : F.x + TOWARD_CAM.x * t;
  return u > ln.lo - IW_CUT.end && u < ln.hi + IW_CUT.end;
}
export function updateCutaway(rdt) {
  stepPaint(rdt);   // (a new run's paint easing in: world/house.js)
  const F = camFocus(), fN = faceCut(F, 'N', HOUSE.zN), fW = faceCut(F, 'W', HOUSE.xW);
  const inside = inHouseRect(F.x, F.z, -0.35);
  // roof: off when you're indoors or tucked behind the house (any part of it, the wing of a notched one too), back on
  // outside
  {
    const want = state === 'title' || !isoOn() ? 1 : inside || fN || fW || behindHouse(F) ? 0 : 1;   // (a roof over you in first person)
    // as a run starts, the roof lifts away with the camera's glide (ROOF_INTRO: from and to, in seconds of it) on an
    // ease in and out, rather than most of the way in the first few frames
    if (want === 0 && introCamOn()) roof.op = Math.min(roof.op, 1 - smooth(clamp((INTRO.t - ROOF_INTRO[0]) / (ROOF_INTRO[1] - ROOF_INTRO[0]), 0, 1)));
    else { roof.op += (want - roof.op) * Math.min(1, rdt * 7); if (Math.abs(want - roof.op) < 0.004) roof.op = want; }
    // the roof fades from view but keeps casting its shadow, so stepping inside never floods the rooms with sun. It
    // keeps writing depth while it fades, so it goes as one surface instead of showing its far slope, gables and
    // shingle rows through itself
    const lv = Math.max(amb[0], amb[1], amb[2]);
    roof.mats.forEach(m => { m.opacity = roof.op; m.depthWrite = roof.op > 0.02; m.colorWrite = roof.op > 0.01; m.color.copy(m.userData.base).multiply(_c2.setRGB(amb[0] / lv * (0.35 + 0.65 * lv), amb[1] / lv * (0.35 + 0.65 * lv), amb[2] / lv * (0.35 + 0.65 * lv))); });
  }
  // porch roof: off while you stand on the porch or anywhere indoors (with the main roof gone it would sit there over
  // nothing, in the way of the front rooms), back as you step off it outside
  {
    const pr = porchRoof, near = state !== 'title' && isoOn() && (inside || (Math.abs(F.x - pr.x) < 2.8 && F.z > pr.z - 3.6 && F.z < pr.z + 2.2));
    const want = near ? 0 : 1; pr.op += (want - pr.op) * Math.min(1, rdt * 7); if (Math.abs(want - pr.op) < 0.004) pr.op = want;
    const lv = Math.max(amb[0], amb[1], amb[2]);
    pr.mats.forEach(m => { m.opacity = pr.op; m.depthWrite = pr.op > 0.98; m.colorWrite = pr.op > 0.01; m.color.copy(m.userData.base).multiply(_c2.setRGB(amb[0] / lv * (0.35 + 0.65 * lv), amb[1] / lv * (0.35 + 0.65 * lv), amb[2] / lv * (0.35 + 0.65 * lv))); });
  }
  // the inside walls: a line of them fades (dithered away round you, as the outer walls do) while it stands between you
  // and the camera: the line from you toward the camera crosses it, or passes within IW_CUT.end of its ends; and the
  // doors between the rooms swing (world/interior.js)
  for (const ln of IW_LINES) { const t = state !== 'title' && isoOn() && inside && lineCut(ln, F) ? 1 : 0; ln.cut.value += (t - ln.cut.value) * Math.min(1, rdt * 6); if (Math.abs(t - ln.cut.value) < 0.003) ln.cut.value = t; }
  updateDoors(rdt);
  for (const w of walls) { const t = w.fl.some(([f, at]) => faceCut(F, f, at)) ? 1 : 0; w.cut.value += (t - w.cut.value) * Math.min(1, rdt * 6); if (Math.abs(t - w.cut.value) < 0.003) w.cut.value = t; }
  projV.set(F.x, 1.0, F.z).project(cam);
  LMU.uPScr.value.set((projV.x + 1) / 2 * innerWidth * renderScale, (projV.y + 1) / 2 * innerHeight * renderScale);
  LMU.uPZ.value = projV.z * 0.5 + 0.5 - 0.0015;   // your (or their) depth on screen, a little toward the camera so the spot itself never cuts
  // trees: fade in the cut while any pine stands between you and the camera
  {
    let want = 0;
    if (state !== 'title' && isoOn()) for (const t of TREES) {
      const vx = t.x - F.x, vz = t.z - F.z, along = vx * TOWARD_CAM.x + vz * TOWARD_CAM.z;
      if (along < -0.4 || along > 5.2 * t.s) continue;
      if (Math.abs(vx * TOWARD_CAM.z - vz * TOWARD_CAM.x) < 1.25 * t.s) { want = 1; break; }
    }
    TREE_CUT.value += (want - TREE_CUT.value) * Math.min(1, rdt * 6); if (Math.abs(want - TREE_CUT.value) < 0.003) TREE_CUT.value = want;
  }
  LMU.uRad.value = 150 * zoom * renderScale;
}
// how much a roof over (x, z) still hides it: the main roof's or the porch's opacity there (1 out from under either). A
// fading roof still stands in front in depth till it's nearly gone, so the see-through outlines of whatever's under it
// fade with it (player/animation.js, zombies/zombie-visuals.js) rather than staying lit over a roof you can't see. Under
// it means behind the house as the camera sees it too, where the eaves and the roof's slope stand in front of you
// outside the walls, so the outline eases out with the roof rather than vanishing the moment it stops writing depth
// how much of a roof is drawn over (x, z) right now: the house's or the porch's while it's showing, nothing out in the
// open (an eye's glow blooms through anything over it otherwise: effects/eye-glow.js)
export function roofCover(x, z) {
  if (!isoOn()) return 0;   // (in first person, or flying, the roof's over your head, not between you and them)
  if (inHouseRect(x, z, 0.4)) return roof.op;
  if (Math.abs(x - porchRoof.x) < 1.9 && z > porchRoof.z - 0.7 && z < porchRoof.z + 0.95) return porchRoof.op;
  return 0;
}
export function roofOver(x, z) {
  if (inHouseRect(x, z, 0.4) || (roof.op < 1 && behindHouse({ x, z }))) return roof.op;
  if (Math.abs(x - porchRoof.x) < 1.9 && z > porchRoof.z - 0.7 && z < porchRoof.z + 0.95) return porchRoof.op;
  return 1;
}
