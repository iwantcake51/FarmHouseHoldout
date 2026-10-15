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
    for (const f of flashes) addField(lightField(f.x, f.z, f.r), f.int * (f.t / f.max) * (0.3 + dark), f.col);
    for (const z of zombies) if (z.burn > 0 && z.vis > 0.02) addField(lightField(z.x, z.z, 3.5), 0.8 * (0.3 + dark) * z.vis, [1, 0.5, 0.15]);   // only the fires you can see
  }
  computeVision(on && !P.dead);   // as you die the fog of war lifts and every zombie fades into view
}
// the flashlight isn't in the light map: the lit shader draws it per pixel (core/shaders.js, flCone), set here every
// frame so it swings round with you smoothly. An akimbo pair has one on each gun, each a cone of its own from that gun,
// a bit dimmer apiece. FLASH: each tier's reach, half-angle and strength
const FLASH = { 1: [13, 0.42, 1.2], 2: [18, 0.62, 1.9] };
// the light is on the gun, so it's only on while the gun's out in your hands: put away for a vault (without Vault fire)
// it goes off, and it comes back on as the gun's drawn again, once the hand has it (SWAP_T.cross, player/swap.js).
// flOn eases it off and on over a few frames, like a switch clicked
let flOn = 0;
const gunOut = () => !(P.vault && !vaultGun()) && !(swapSt && swapSt.to === W8.cur && swapSt.t < SWAP_T.cross);
function flashUniforms(rdt) {
  const K = LMU.uFlK.value, F = FLASH[T('light')], D = W(curId());
  flOn = gunOut() ? Math.min(1, flOn + (rdt || 0) * 14) : 0;
  if (!F || state === 'title' || curDark <= 0.05 || !D || D.melee || flOn <= 0) { K.z = 0; return; }
  const [lr, half, k] = F, li = k * curDark * flOn;
  if (D.akimbo && !P.vault) { [-1, 1].forEach((sg, i) => { const mz = muzzle(sg); LMU.uFl.value[i].set(mz.ox, mz.oz, Math.sin(mz.a), Math.cos(mz.a)); flashShadows(i, mz.ox, mz.oz, mz.a, half * 0.9, lr); }); K.set(lr, half * 0.9, li * 0.62, 2); }
  else { LMU.uFl.value[0].set(P.x, P.z, Math.sin(P.aim), Math.cos(P.aim)); flashShadows(0, P.x, P.z, P.aim, half, lr); K.set(lr, half, li, 1); }
  flShTex.needsUpdate = true;
}
// the flashlight's shadows: rays cast out from each beam's lens across its cone every frame (FL_RAYS a beam, spread a
// little wider than the cone), each stopping where it meets something that stops sight (a wall, a tall prop, a window
// boarded up), FL_PAST into it so the face it hit is lit. The lit shader tests every pixel against how far its ray got
// (flCone, core/shaders.js), so the edges of a beam through a window or past a corner are clean lines
const FL_RAYS = 256, FL_PAST = 0.4, flSh = new Uint8Array(FL_RAYS * 2 * 4), flShTex = new THREE.DataTexture(flSh, FL_RAYS, 2, THREE.RGBAFormat);
flShTex.magFilter = flShTex.minFilter = THREE.LinearFilter; LMU.uFlSh.value = flShTex;
function flashShadows(k, x, z, dir, half, reach) {
  const h = half + 0.3, A = LMU.uFlA.value;
  if (k) { A.z = dir; A.w = h; } else { A.x = dir; A.y = h; }
  for (let r = 0; r < FL_RAYS; r++) { const d = flRay(x, z, dir - h + 2 * h * (r + 0.5) / FL_RAYS, Math.min(FL_MAX, reach + 1)); flSh[(k * FL_RAYS + r) * 4] = Math.round(d / FL_MAX * 255); }
}
// how far a ray from x, z at angle a gets through the grid (cell by cell, Amanatides and Woo) before a cell that stops
// sight, out to max
function flRay(x, z, a, max) {
  const dx = Math.sin(a), dz = Math.cos(a), sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  let i = ci(x), j = ci(z), t = 0;
  let nx = dx ? (i - HALF + (dx > 0 ? 1 : 0) - x) / dx : Infinity, nz = dz ? (j - HALF + (dz > 0 ? 1 : 0) - z) / dz : Infinity;
  const ex = dx ? Math.abs(1 / dx) : Infinity, ez = dz ? Math.abs(1 / dz) : Infinity;
  while (t < max) {
    if (nx < nz) { t = nx; nx += ex; i += sx; } else { t = nz; nz += ez; j += sz; }
    if (t >= max) return max;
    if (i < 0 || j < 0 || i >= N || j >= N) return t;
    const ob = openAt[j * N + i];
    if (blockArr[j * N + i] || (ob && ob.boards.length >= 2)) return Math.min(max, t + FL_PAST);
  }
  return max;
}
// how much of the flashlight falls at a point (for what isn't drawn by the lit shader, like smoke): the same cone
function flashAt(x, z) {
  const K = LMU.uFlK.value; if (K.z <= 0.001) return 0;
  let s = 0;
  for (let i = 0; i < K.w; i++) {
    const f = LMU.uFl.value[i], dx = x - f.x, dz = z - f.y, r = Math.hypot(dx, dz), a = Math.acos(clamp((dx * f.z + dz * f.w) / Math.max(r, 1e-3), -1, 1));
    const cone = (1 - smooth(clamp((a - K.y + 0.2) / 0.25, 0, 1))) * (1 + 0.5 * (1 - smooth(clamp(a / (K.y * 0.6), 0, 1)))), fall = 1 - clamp(r / K.x, 0, 1);
    s += mix(0.3, cone, smooth(clamp((r - 0.15) / 0.75, 0, 1))) * fall * fall;
  }
  return s * K.z;
}
// blend the light/vision map toward its target and upload it
function updateLightmap(rdt) {
  flashUniforms(rdt);
  for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t -= rdt; if (flashes[k].t <= 0) { flashes.splice(k, 1); lmT = 0; } }
  lmT -= rdt; if (lmT <= 0) { computeLight(); lmT = 0.07; }
  const up = Math.min(1, rdt * 30), down = Math.min(1, rdt * 7), vk = Math.min(1, rdt * (P.dead ? 1.1 : 9));
  for (let k = 0; k < FNN; k++) {
    for (let c = 0; c < 3; c++) { const i = k * 3 + c, t = lmTgt[i], cur = lmCur[i]; const n = lmCur[i] = cur + (t - cur) * (t > cur ? up : down); lmData[k * 4 + c] = n >= 2 ? 255 : n * 127.5; }
    const v = visCur[k] += (visTgt[k] - visCur[k]) * vk; lmData[k * 4 + 3] = v * 255;
  }
  lmTex.needsUpdate = true;
}
