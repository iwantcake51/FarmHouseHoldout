// Fading wall faces and the roof so you can see inside.

const TOWARD_CAM = { x: Math.sin(YAW), z: Math.cos(YAW) };   // flat direction from the scene toward the camera
const SQ = Math.SQRT1_2, latOf = (x, z) => SQ * (x - z);
const HLAT = [latOf(HOUSE.x0, HOUSE.z1), latOf(HOUSE.x1, HOUSE.z0)];
function faceCut() {
  // a wall face fades only if the line from you toward the camera actually passes through it
  const c = { N: false, S: false, E: false, W: false };
  if (state === 'title') return c;
  const d = SQ, m = 0.7, maxT = 7.5;
  const hitX = xw => { const t = (xw - P.x) / d; if (t < 0.05 || t > maxT) return false; const z = P.z + d * t; return z > HOUSE.z0 - m && z < HOUSE.z1 + m; };
  const hitZ = zw => { const t = (zw - P.z) / d; if (t < 0.05 || t > maxT) return false; const x = P.x + d * t; return x > HOUSE.x0 - m && x < HOUSE.x1 + m; };
  c.E = hitX(HOUSE.xE); c.W = hitX(HOUSE.xW); c.S = hitZ(HOUSE.zS); c.N = hitZ(HOUSE.zN);
  return c;
}
// roof and wall-face fading so you can see inside
const ROOF_INTRO = [0.12, 1.15];
function updateCutaway(rdt) {
  const fc = faceCut();
  // roof: off when you're indoors or tucked behind the house, back on outside
  {
    const inside = P.x > HOUSE.x0 + 0.35 && P.x < HOUSE.x1 - 0.35 && P.z > HOUSE.z0 + 0.35 && P.z < HOUSE.z1 - 0.35;
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
  // porch roof: off while you stand on the porch or just inside the door, where it would cover you
  {
    const pr = porchRoof, near = state !== 'title' && Math.abs(P.x - pr.x) < 2.8 && P.z > pr.z - 3.6 && P.z < pr.z + 2.2;
    const want = near ? 0 : 1; pr.op += (want - pr.op) * Math.min(1, rdt * 7); if (Math.abs(want - pr.op) < 0.004) pr.op = want;
    const lv = Math.max(amb[0], amb[1], amb[2]);
    pr.mats.forEach(m => { m.opacity = pr.op; m.depthWrite = pr.op > 0.98; m.colorWrite = pr.op > 0.01; m.color.copy(m.userData.base).multiply(_c2.setRGB(amb[0] / lv * (0.35 + 0.65 * lv), amb[1] / lv * (0.35 + 0.65 * lv), amb[2] / lv * (0.35 + 0.65 * lv))); });
  }
  for (const w of walls) { const t = w.faces.some(f => fc[f]) ? 1 : 0; w.cut.value += (t - w.cut.value) * Math.min(1, rdt * 6); if (Math.abs(t - w.cut.value) < 0.003) w.cut.value = t; }
  projV.set(P.x, 1.0, P.z).project(cam);
  LMU.uPScr.value.set((projV.x + 1) / 2 * innerWidth * renderScale, (projV.y + 1) / 2 * innerHeight * renderScale);
  LMU.uPZ.value = projV.z * 0.5 + 0.5 - 0.0015;   // your depth on screen, a little toward the camera so your own spot never cuts
  // trees: fade in the cut while any pine stands between you and the camera
  {
    let want = 0;
    if (state !== 'title') for (const t of TREES) {
      const vx = t.x - P.x, vz = t.z - P.z, along = vx * TOWARD_CAM.x + vz * TOWARD_CAM.z;
      if (along < -0.4 || along > 5.2 * t.s) continue;
      if (Math.abs(vx * TOWARD_CAM.z - vz * TOWARD_CAM.x) < 1.25 * t.s) { want = 1; break; }
    }
    TREE_CUT.value += (want - TREE_CUT.value) * Math.min(1, rdt * 6); if (Math.abs(want - TREE_CUT.value) < 0.003) TREE_CUT.value = want;
  }
  LMU.uRad.value = 150 * zoom * renderScale;
}
