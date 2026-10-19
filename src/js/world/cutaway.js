// Fading wall faces and the roof so you can see inside.

const TOWARD_CAM = { x: Math.sin(YAW), z: Math.cos(YAW) };   // flat direction from the scene toward the camera
const SQ = Math.SQRT1_2, latOf = (x, z) => SQ * (x - z);
const HLAT = [latOf(HOUSE.x0, HOUSE.z1), latOf(HOUSE.x1, HOUSE.z0)];
function faceCut(F) {
  // a wall face fades only if the line from you (F: or the teammate you're watching) toward the camera actually passes through it
  const c = { N: false, S: false, E: false, W: false };
  if (state === 'title') return c;
  const d = SQ, m = 0.7, maxT = 7.5;
  const hitX = xw => { const t = (xw - F.x) / d; if (t < 0.05 || t > maxT) return false; const z = F.z + d * t; return z > HOUSE.z0 - m && z < HOUSE.z1 + m; };
  const hitZ = zw => { const t = (zw - F.z) / d; if (t < 0.05 || t > maxT) return false; const x = F.x + d * t; return x > HOUSE.x0 - m && x < HOUSE.x1 + m; };
  c.E = hitX(HOUSE.xE); c.W = hitX(HOUSE.xW); c.S = hitZ(HOUSE.zS); c.N = hitZ(HOUSE.zN);
  return c;
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
function updateCutaway(rdt) {
  stepPaint(rdt);   // (a new run's paint easing in: world/house.js)
  const F = camFocus(), fc = faceCut(F);
  const inside = F.x > HOUSE.x0 + 0.35 && F.x < HOUSE.x1 - 0.35 && F.z > HOUSE.z0 + 0.35 && F.z < HOUSE.z1 - 0.35;
  // roof: off when you're indoors or tucked behind the house, back on outside
  {
    const want = state === 'title' ? 1 : inside || fc.N || fc.W ? 0 : 1;
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
    const pr = porchRoof, near = state !== 'title' && (inside || (Math.abs(F.x - pr.x) < 2.8 && F.z > pr.z - 3.6 && F.z < pr.z + 2.2));
    const want = near ? 0 : 1; pr.op += (want - pr.op) * Math.min(1, rdt * 7); if (Math.abs(want - pr.op) < 0.004) pr.op = want;
    const lv = Math.max(amb[0], amb[1], amb[2]);
    pr.mats.forEach(m => { m.opacity = pr.op; m.depthWrite = pr.op > 0.98; m.colorWrite = pr.op > 0.01; m.color.copy(m.userData.base).multiply(_c2.setRGB(amb[0] / lv * (0.35 + 0.65 * lv), amb[1] / lv * (0.35 + 0.65 * lv), amb[2] / lv * (0.35 + 0.65 * lv))); });
  }
  // the inside walls: a line of them fades (dithered away round you, as the outer walls do) while it stands between you
  // and the camera: the line from you toward the camera crosses it, or passes within IW_CUT.end of its ends; and the
  // doors between the rooms swing (world/interior.js)
  for (const ln of IW_LINES) { const t = state !== 'title' && inside && lineCut(ln, F) ? 1 : 0; ln.cut.value += (t - ln.cut.value) * Math.min(1, rdt * 6); if (Math.abs(t - ln.cut.value) < 0.003) ln.cut.value = t; }
  updateDoors(rdt);
  for (const w of walls) { const t = w.faces.some(f => fc[f]) ? 1 : 0; w.cut.value += (t - w.cut.value) * Math.min(1, rdt * 6); if (Math.abs(t - w.cut.value) < 0.003) w.cut.value = t; }
  projV.set(F.x, 1.0, F.z).project(cam);
  LMU.uPScr.value.set((projV.x + 1) / 2 * innerWidth * renderScale, (projV.y + 1) / 2 * innerHeight * renderScale);
  LMU.uPZ.value = projV.z * 0.5 + 0.5 - 0.0015;   // your (or their) depth on screen, a little toward the camera so the spot itself never cuts
  // trees: fade in the cut while any pine stands between you and the camera
  {
    let want = 0;
    if (state !== 'title') for (const t of TREES) {
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
// fade with it (player/animation.js, zombies/zombie-visuals.js) rather than staying lit over a roof you can't see
function roofOver(x, z) {
  if (x > HOUSE.x0 - 0.4 && x < HOUSE.x1 + 0.4 && z > HOUSE.z0 - 0.4 && z < HOUSE.z1 + 0.4) return roof.op;
  if (Math.abs(x - porchRoof.x) < 1.9 && z > porchRoof.z - 0.7 && z < porchRoof.z + 0.95) return porchRoof.op;
  return 1;
}
