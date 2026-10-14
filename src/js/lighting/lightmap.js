// The light map: line of sight, light fields and the per-frame light/vision blend.

const FR = 2, FN = N * FR, FNN = FN * FN;
const lmData = new Uint8Array(FNN * 4);
const lmTex = new THREE.DataTexture(lmData, FN, FN, THREE.RGBAFormat);
lmTex.magFilter = THREE.LinearFilter;
lmTex.minFilter = THREE.LinearFilter;
LMU.uLightMap.value = lmTex;
const lmTgt = new Float32Array(FNN * 3).fill(0.5), lmCur = new Float32Array(FNN * 3).fill(0.5), visTgt = new Float32Array(FNN).fill(1), visCur = new Float32Array(FNN).fill(1);
const sampleX = a => -HALF + (a + 0.5) / FR;
function los(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), steps = Math.ceil(d / 0.33);
  const si = ci(x0), sj = ci(z0), ti = ci(x1), tj = ci(z1);
  for (let s = 1; s < steps; s++) {
    const i = ci(x0 + dx * s / steps), j = ci(z0 + dz * s / steps);
    if (i === ti && j === tj) return true;
    if (i === si && j === sj) continue;
    if (i < 0 || j < 0 || i >= N || j >= N || blockArr[j * N + i]) return false;
    const ob = openAt[j * N + i]; if (ob && ob.boards.length >= 2) return false;   // two or more boards shut out sight and light
  }
  return true;
}
function lightField(x, z, r, cone) {
  const out = []; const a0 = clamp(Math.floor((x - r + HALF) * FR), 0, FN - 1), a1 = clamp(Math.ceil((x + r + HALF) * FR), 0, FN - 1);
  const b0 = clamp(Math.floor((z - r + HALF) * FR), 0, FN - 1), b1 = clamp(Math.ceil((z + r + HALF) * FR), 0, FN - 1);
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const sx = sampleX(a), sz = sampleX(b), dx = sx - x, dz = sz - z, d = Math.hypot(dx, dz); if (d > r) continue;
    let f = 1 - d / r; f *= f;
    if (cone) { const c = clamp((cone.half - Math.abs(angDiff(Math.atan2(dx, dz), cone.dir))) / 0.12, 0, 1); if (!c) continue; f *= c; }
    if (f < 0.01 || !los(x, z, sx, sz)) continue;
    out.push(b * FN + a, f);
  }
  return out;
}
function addField(field, mul, col) { for (let k = 0; k < field.length; k += 2) { const i = field[k] * 3, f = field[k + 1] * mul; lmTgt[i] += f * col[0]; lmTgt[i + 1] += f * col[1]; lmTgt[i + 2] += f * col[2]; } }
function computeLight() {
  const dark = curDark, on = state !== 'title';
  // night eyes lift the whole night toward a cool, faintly green dusk, and amplify what you look at even more
  const nv = on ? S.nightVis * dark : 0, a0 = amb[0] + nv * 0.26, a1 = amb[1] + nv * 0.31, a2 = amb[2] + nv * 0.25;
  for (let k = 0; k < FNN; k++) { lmTgt[k * 3] = a0; lmTgt[k * 3 + 1] = a1; lmTgt[k * 3 + 2] = a2; }
  if (lightsDirty) { lightsDirty = false; STATIC_LIGHTS.forEach(L => { if (!L.fill && !L.spill) L.field = lightField(L.x, L.z, L.r, L.cone); }); }
  const fl = 0.85 + Math.sin(worldT * 11.1) * 0.08 + 0.035 + Math.sin(worldT * 37.3) * 0.02 + Math.sin(worldT * 23.9) * 0.015;   // fire flicker on the world clock
  STATIC_LIGHTS.forEach(L => {
    if (L.spill) { const b = L.spill.boards.length; if (b < 2) addField(L.field, L.int * (b ? 0.4 : 1) * (0.08 + 0.92 * dark), L.col); return; }
    addField(L.field, L.int * (L.inside ? 0.55 + 0.6 * dark : 0.15 + 0.85 * dark) * (L.flicker ? fl : 1), L.col);
  });
  // how much light falls where you stand from the sky and the lamps (not your own muzzle flash, flashlight or night
  // eyes): what your eyes get used to (updateDarkEyes, lighting/day-night.js)
  { const i = (clamp(Math.floor((P.z + HALF) * FR), 0, FN - 1) * FN + clamp(Math.floor((P.x + HALF) * FR), 0, FN - 1)) * 3;
    litHere = lmTgt[i] * 0.299 + lmTgt[i + 1] * 0.587 + lmTgt[i + 2] * 0.114 - nv * 0.288; }
  if (on) {
    if (nv > 0.05) addField(lightField(P.x, P.z, 9 + S.nightVis * 3, { dir: P.aim, half: S.cone }), nv * 0.42, [0.82, 1, 0.84]);
    if (T('light') && dark > 0.05) {
      // the flashlight; an akimbo pair has one on each gun, each a cone of its own from that gun, a bit dimmer apiece
      const D = W(curId()), lr = T('light') === 2 ? 18 : 13, half = T('light') === 2 ? 0.62 : 0.42, li = (T('light') === 2 ? 1.9 : 1.2) * dark;
      if (D && D.akimbo && !P.vault) for (const sg of [-1, 1]) { const mz = muzzle(sg); addField(lightField(mz.ox, mz.oz, lr, { dir: mz.a, half: half * 0.9 }), li * 0.62, [1, 0.95, 0.85]); }
      else addField(lightField(P.x, P.z, lr, { dir: P.aim, half }), li, [1, 0.95, 0.85]);
    }
    for (const f of flashes) addField(lightField(f.x, f.z, f.r), f.int * (f.t / f.max) * (0.3 + dark), f.col);
    for (const z of zombies) if (z.burn > 0 && z.vis > 0.02) addField(lightField(z.x, z.z, 3.5), 0.8 * (0.3 + dark) * z.vis, [1, 0.5, 0.15]);   // only the fires you can see
  }
  computeVision(on && !P.dead);   // as you die the fog of war lifts and every zombie fades into view
}
// blend the light/vision map toward its target and upload it
function updateLightmap(rdt) {
  for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t -= rdt; if (flashes[k].t <= 0) { flashes.splice(k, 1); lmT = 0; } }
  lmT -= rdt; if (lmT <= 0) { computeLight(); lmT = 0.07; }
  const up = Math.min(1, rdt * 30), down = Math.min(1, rdt * 7), vk = Math.min(1, rdt * (P.dead ? 1.1 : 9));
  for (let k = 0; k < FNN; k++) {
    for (let c = 0; c < 3; c++) { const i = k * 3 + c, t = lmTgt[i], cur = lmCur[i]; const n = lmCur[i] = cur + (t - cur) * (t > cur ? up : down); lmData[k * 4 + c] = n >= 2 ? 255 : n * 127.5; }
    const v = visCur[k] += (visTgt[k] - visCur[k]) * vk; lmData[k * 4 + 3] = v * 255;
  }
  lmTex.needsUpdate = true;
}
