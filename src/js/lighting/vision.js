// Fog of war: what you can see, recomputed only when it can change.

// what you can see: a cone in front of you, a small circle around you, blocked by walls; recomputed only when it can change
let visKey = '', visAge = 0;
function computeVision(on) {
  let bsum = 0; for (const o of openings) bsum = bsum * 4 + o.boards.length;
  const V = viewer();   // (you, or the teammate you're watching: net/spectate.js)
  const key = on ? [Math.round(V.x * 16), Math.round(V.z * 16), Math.round(V.aim * 48), V.cone, V.near, bsum, HOUSE_DOORS.key].join(',') : 'off';
  visAge += 0.07; if (key === visKey && visAge < 0.6) return;
  visKey = key; visAge = 0;
  const HALFCONE = V.cone, NEAR = V.near;
  // standing at a window or the door, you can look out through it even when the line from your eyes clips the frame
  let peek = null, pd = 2.1;
  for (const o of openings) { const d = Math.hypot(o.x - V.x, o.z - V.z); if (d < pd) { pd = d; peek = o; } }
  const peekSide = peek ? Math.sign((V.x - peek.x) * peek.nx + (V.z - peek.z) * peek.nz) || 1 : 0;
  for (let b = 0; b < FN; b++) {
    const wz = sampleX(b);
    for (let a = 0; a < FN; a++) {
      const k = b * FN + a;
      if (!on) { visTgt[k] = 1; continue; }
      const wx = sampleX(a), dx = wx - V.x, dz = wz - V.z, d = Math.hypot(dx, dz);
      let v = d < NEAR ? 1 : clamp((HALFCONE - Math.abs(angDiff(Math.atan2(dx, dz), V.aim))) / 0.18, 0, 1);
      if (v > 0 && d > 0.7 && !los(V.x, V.z, wx, wz)) {
        const nb = peek ? peek.boards.length : 0, far = peek ? Math.hypot(wx - peek.x, wz - peek.z) : 0;
        // through the gaps between heavy boards you only make out what's close to the window
        if (peek && ((wx - peek.x) * peek.nx + (wz - peek.z) * peek.nz) * peekSide < -0.3 && (nb < 2 || far < 5.5) && los(peek.x - peek.nx * peekSide * 0.45, peek.z - peek.nz * peekSide * 0.45, wx, wz)) v *= nb === 0 ? 1 : nb === 1 ? 0.9 : nb === 2 ? 0.8 : 0.7;
        else v = 0;
      }
      visTgt[k] = v;
    }
  }
}
const visAt = (x, z) => { const a = clamp(Math.floor((x + HALF) * FR), 0, FN - 1), b = clamp(Math.floor((z + HALF) * FR), 0, FN - 1); return visCur[b * FN + a]; };
