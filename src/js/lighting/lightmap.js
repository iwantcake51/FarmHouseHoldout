// The light map: line of sight, light fields and the per-frame light/vision blend.

const FR = 2, FN = N * FR, FNN = FN * FN;
const lmData = new Uint8Array(FNN * 4);
const lmTex = new THREE.DataTexture(lmData, FN, FN, THREE.RGBAFormat);
lmTex.magFilter = THREE.LinearFilter;
lmTex.minFilter = THREE.LinearFilter;
LMU.uLightMap.value = lmTex; LMU.uLmRes.value = FN;
const lmTgt = new Float32Array(FNN * 3).fill(0.5), lmCur = new Float32Array(FNN * 3).fill(0.5), visTgt = new Float32Array(FNN).fill(1), visCur = new Float32Array(FNN).fill(1);
const sampleX = a => -HALF + (a + 0.5) / FR;
function los(x0, z0, x1, z1) {
  if (THIN.n && thinHit(x0, z0, x1, z1) <= 1) return false;   // the inside walls (world/thin-walls.js)
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), steps = Math.ceil(d / 0.33);
  const si = ci(x0), sj = ci(z0), ti = ci(x1), tj = ci(z1);
  for (let s = 1; s < steps; s++) {
    const i = ci(x0 + dx * s / steps), j = ci(z0 + dz * s / steps);
    if (i === ti && j === tj) return true;
    if (i === si && j === sj) continue;
    if (i < 0 || j < 0 || i >= N || j >= N || blockArr[j * N + i]) return false;
    const ob = openAt[j * N + i]; if (ob && shutN(ob) >= 2) return false;   // two or more boards (or a plated grate) shut out sight and light
  }
  return true;
}
// soft: a lamp's fixed field, its shadows' edges softened, each sample lit by how many of SOFT_PTS round it (a quarter
// of a sample's width out) the lamp can see, not all or nothing (too slow for a muzzle flash's, made every frame)
const SOFT_PTS = [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]];
function lightField(x, z, r, cone, soft) {
  const out = []; const a0 = clamp(Math.floor((x - r + HALF) * FR), 0, FN - 1), a1 = clamp(Math.ceil((x + r + HALF) * FR), 0, FN - 1);
  const b0 = clamp(Math.floor((z - r + HALF) * FR), 0, FN - 1), b1 = clamp(Math.ceil((z + r + HALF) * FR), 0, FN - 1);
  for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
    const sx = sampleX(a), sz = sampleX(b), dx = sx - x, dz = sz - z, d = Math.hypot(dx, dz); if (d > r) continue;
    let f = 1 - d / r; f *= f;
    if (cone) { const c = clamp((cone.half - Math.abs(angDiff(Math.atan2(dx, dz), cone.dir))) / 0.12, 0, 1); if (!c) continue; f *= c; }
    if (f < 0.01) continue;
    if (soft) { let s = 0; for (const [ox, oz] of SOFT_PTS) if (los(x, z, sx + ox, sz + oz)) s++; if (!s) continue; f *= s / SOFT_PTS.length; }
    else if (!los(x, z, sx, sz)) continue;
    out.push(b * FN + a, f);
  }
  return out;
}
function addField(field, mul, col) { for (let k = 0; k < field.length; k += 2) { const i = field[k] * 3, f = field[k + 1] * mul; lmTgt[i] += f * col[0]; lmTgt[i + 1] += f * col[1]; lmTgt[i + 2] += f * col[2]; } }
const NV_MONO = 0.42, NV_SAT = [0, 0.22, 0.6];
function computeLight() {
  const dark = curDark, on = state !== 'title';
  // night vision lifts the dark (NV_MONO of a light's worth for each of S.nightVis) without lighting it, so it stays
  // mostly black and white: the monocular brings back a little of its colour, the goggles more, never all of it
  // (NV_SAT by step; uNvMono, uNvSat in core/shaders.js)
  const V = viewer();   // (watching a teammate, their night vision: net/spectate.js)
  LMU.uNvMono.value = on ? V.nv * dark * NV_MONO : 0; LMU.uNvSat.value = on ? NV_SAT[V.night] || 0 : 0;
  for (let k = 0; k < FNN; k++) { lmTgt[k * 3] = amb[0]; lmTgt[k * 3 + 1] = amb[1]; lmTgt[k * 3 + 2] = amb[2]; }
  if (lightsDirty) { lightsDirty = false; STATIC_LIGHTS.forEach(L => { if (!L.fill && !L.spill) L.field = lightField(L.x, L.z, L.r, L.cone, true); }); }
  const fl = 0.85 + Math.sin(worldT * 11.1) * 0.08 + 0.035 + Math.sin(worldT * 37.3) * 0.02 + Math.sin(worldT * 23.9) * 0.015;   // fire flicker on the world clock
  STATIC_LIGHTS.forEach(L => {
    if (L.spill) { const b = shutN(L.spill); if (b < 2) addField(L.field, L.int * (b ? 0.4 : 1) * (0.08 + 0.92 * dark), L.col); return; }
    addField(L.field, L.int * (L.inside ? 0.55 + 0.6 * dark : 0.15 + 0.85 * dark) * (L.flicker ? fl : 1), L.col);
  });
  // how much light falls where you stand from the sky and the lamps (not your own muzzle flash or flashlight): what
  // your eyes get used to (updateDarkEyes, lighting/day-night.js)
  { const i = (clamp(Math.floor((P.z + HALF) * FR), 0, FN - 1) * FN + clamp(Math.floor((P.x + HALF) * FR), 0, FN - 1)) * 3;
    litHere = lmTgt[i] * 0.299 + lmTgt[i + 1] * 0.587 + lmTgt[i + 2] * 0.114; }
  if (on) {
    for (const f of flashes) addField(lightField(f.x, f.z, f.r), f.int * (f.t / f.max) * (0.3 + dark), f.col);
    for (const z of zombies) if (z.burn > 0 && z.vis > 0.02) addField(lightField(z.x, z.z, 3.5), 0.8 * (0.3 + dark) * z.vis, [1, 0.5, 0.15]);   // only the fires you can see
    spitLights(dark);   // a spitter's glob, and its fresh splats, glowing green (zombies/spitter.js)
  }
  computeVision(on && (!P.dead || spectating()));   // as you die the fog of war lifts and every zombie fades into view, till you're watching a teammate: then it's theirs
}
// the flashlight isn't in the light map: the lit shader draws it per pixel (core/shaders.js, flCone), set here every
// frame so it swings round with you smoothly. An akimbo pair has one on each gun, each a cone of its own from that gun,
// a bit dimmer apiece. In co-op each teammate's light is drawn the same way, from their survivor along where they're
// aiming, while their pose says it's on (p.fl: its tier and their aim, myLight, net/avatars.js), up to FL_N beams in
// all. FLASH: each tier's reach, half-angle and strength
const FLASH = { 1: [13, 0.42, 1.2], 2: [18, 0.62, 1.9] };
// the light is on the gun, so it's only on while the gun's out in your hands: put away for a vault (without Vault fire)
// it goes off, and it comes back on as the gun's drawn again, once the hand has it (SWAP_T.cross, player/swap.js).
// flOn eases it off and on over a few frames, like a switch clicked
let flOn = 0;
const gunOut = () => !(P.vault && !vaultGun()) && !(swapSt && swapSt.to === W8.cur && swapSt.t < SWAP_T.cross);
// the tier of your light while it's on (0 when it isn't), for your teammates (sent with your pose: net/avatars.js)
function myLight() { const t = T('light'), D = W(curId()); return FLASH[t] && D && !D.melee && flOn > 0.5 && (state === 'play' || state === 'paused') && !P.dead ? t : 0; }   // (paused in co-op you're still out there, light and all)
// which way your light points: where you aim, but at a sprint (player/animation.js: faceK) it's on the gun, down at a
// low ready, so it goes where the gun does: swinging with the stride and round into the bends with your chest, and
// with Run and gun swept round after the gun as it comes up onto the aim, a little behind it (FL_FOLLOW: how quickly
// it catches the gun up at a run, and firing on the run). flOff is how far round off your aim it is right now
const FL_FOLLOW = { run: 11, rg: 6.5 };
let flOff = 0, flOx = 0, flOz = 0;
const flDir = () => P.aim + flOff;
const _gb0 = new V3(), _gb1 = new V3();
// the gun in your hands, flat on the ground: where its muzzle is (_gb1) and which way it points, or null with no gun
// to go by; off its last frame's place, which is plenty for a light. gunYawK is how much that way can be gone by: the
// steeper down the barrel points the less (its way round goes wild pointing straight down)
let gunYawK = 0;
function gunYaw() {
  const g = gunMeshes[W8.cur]; gunYawK = 0; if (!g || !g.visible) return null;
  const h = holdOf(W8.cur, 'R'), m = MUZ[W8.cur] || 0.9;
  _gb0.set(X, GUN_Y, m - 0.4).applyMatrix4(h.matrixWorld); _gb1.set(X, GUN_Y, m).applyMatrix4(h.matrixWorld);
  const dx = _gb1.x - _gb0.x, dz = _gb1.z - _gb0.z; gunYawK = smooth(clamp((Math.hypot(dx, dz) / 0.4 - 0.3) / 0.35, 0, 1));
  return gunYawK > 0 ? Math.atan2(dx, dz) : null;
}
function stepFlDir(rdt) {
  const k = smooth(clamp(ANIM.faceK || 0, 0, 1)), gy = k > 0.01 && !P.vault ? gunYaw() : null, ch = ANIM.chestYaw ?? P.aim;
  const tgt = angDiff(gy === null ? ch : ch + angDiff(gy, ch) * gunYawK, P.aim) * k, rg = smooth(clamp(ANIM.rgK || 0, 0, 1));
  flOff = k > 0.01 ? flOff + angDiff(tgt, flOff) * Math.min(1, (rdt || 0) * (FL_FOLLOW.run + (FL_FOLLOW.rg - FL_FOLLOW.run) * rg)) : tgt;
  flOff = angDiff(flOff, 0);
  // and from the gun, not the middle of you, while it's clear of the walls
  const go = gy !== null && los(P.x, P.z, _gb1.x, _gb1.z) && !bulletBlocked(_gb1.x, _gb1.z) ? k : 0;
  flOx = P.x + (_gb1.x - P.x) * go; flOz = P.z + (_gb1.z - P.z) * go;
}
const FL_N = 6, teamFl = [];   // (teamFl: this frame's teammate lights, { x, z, dir, tier, on }: teamBeam)
function flashUniforms(rdt) {
  const F = FLASH[T('light')], D = W(curId()), cones = [], dark = state !== 'title' && curDark > 0.05;
  flOn = gunOut() ? Math.min(1, flOn + (rdt || 0) * 14) : 0; stepFlDir(rdt);
  if (dark && F && D && !D.melee && flOn > 0) {
    const [lr, half, k] = F, li = k * curDark * flOn;
    if (D.akimbo && !P.vault) [-1, 1].forEach(sg => { const mz = muzzle(sg); cones.push([mz.ox, mz.oz, mz.a, lr, half * 0.9, li * 0.62]); });
    else cones.push([flOx, flOz, flDir(), lr, half, li]);
  }
  // teammates' lights, switched on and off as theirs is (eased the same way) and swung round with their aim
  teamFl.length = 0;
  if (netLink()) for (const p of NET.peers.values()) {
    const a = p.av, t = p.fl ? p.fl[0] : 0, Fp = FLASH[t];
    if (!Fp || !a || !a.g.visible || p.dead) { p.flOn = 0; continue; }
    p.flOn = Math.min(1, (p.flOn || 0) + (rdt || 0) * 14);
    p.flA = p.flA === undefined ? p.fl[1] : p.flA + angDiff(p.fl[1], p.flA) * Math.min(1, (rdt || 0) * 14);
    const x = a.g.position.x, z = a.g.position.z;
    teamFl.push({ x, z, dir: p.flA, tier: t, on: p.flOn });
    if (dark && cones.length < FL_N) cones.push([x, z, p.flA, Fp[0], Fp[1], Fp[2] * curDark * p.flOn]);
  }
  LMU.uFlK.value.w = cones.length;
  cones.forEach((c, i) => { LMU.uFl.value[i].set(c[0], c[1], Math.sin(c[2]), Math.cos(c[2])); LMU.uFlP.value[i].set(c[3], c[4], c[5], c[2]); flashShadows(i, c[0], c[1], c[2], c[4], c[3]); });
  if (cones.length) flShTex.needsUpdate = true;
}
// how strongly a teammate's light picks a zombie out (0 to 1): in the middle of their beam and in its reach, with
// nothing in the way; it shows you that zombie even outside your own sight, and outlines it as your own light would
// (zombies/zombie-visuals.js, LIGHT_OL)
function teamBeam(z) {
  if (!teamFl.length || curDark <= 0.05) return 0;
  let b = 0;
  for (const c of teamFl) {
    const L = LIGHT_OL[c.tier]; if (!L) continue;
    const dx = z.x - c.x, dz = z.z - c.z, d = Math.hypot(dx, dz); if (d > L.r) continue;
    const off = Math.abs(angDiff(Math.atan2(dx, dz), c.dir));
    const s = (1 - smooth(clamp((off - L.half * 0.75) / (L.half * 0.35), 0, 1))) * (1 - smooth(clamp((d - L.r * 0.7) / (L.r * 0.3), 0, 1))) * Math.min(1, curDark * 1.6) * c.on;
    if (s > b && los(c.x, c.z, z.x, z.z)) b = s;
  }
  return b;
}
// the flashlight's shadows: rays cast out from each beam's lens across its cone every frame (FL_RAYS a beam, spread a
// little wider than the cone), each stopping where it meets something that stops sight (a wall, a tall prop, a window
// boarded up), FL_PAST into it so the face it hit is lit. The lit shader tests every pixel against how far its ray got
// (flCone, core/shaders.js), so the edges of a beam through a window or past a corner are clean lines. Each ray also
// keeps how far out it crossed the line of the first window it went through (or where it stopped, if sooner): the
// shader lets the beam on past that line only between the sill and the head, so it doesn't light the ground just
// outside under the sill or the top of the wall over it
const FL_RAYS = 256, FL_PAST = 0.4, flSh = new Uint8Array(FL_RAYS * 6 * 4), flShTex = new THREE.DataTexture(flSh, FL_RAYS, 6, THREE.RGBAFormat);
flShTex.magFilter = flShTex.minFilter = THREE.LinearFilter; LMU.uFlSh.value = flShTex;
function flashShadows(k, x, z, dir, half, reach) {
  const h = half + 0.3;   // (the shader centres beam k's row on dir and spreads it this far either side: flCone)
  for (let r = 0; r < FL_RAYS; r++) {
    const d = flRay(x, z, dir - h + 2 * h * (r + 0.5) / FL_RAYS, Math.min(FL_MAX, reach + 1)), o = (k * FL_RAYS + r) * 4;
    flSh[o] = Math.round(d / FL_MAX * 255); flSh[o + 1] = Math.round(Math.min(d, flRayWin) / FL_MAX * 255);
  }
}
// how far a ray from x, z at angle a gets through the grid (cell by cell, Amanatides and Woo) before a cell that stops
// sight, out to max; and in flRayWin, how far out it crossed the middle line of the first open window on its way
let flRayWin = Infinity;
function flRay(x, z, a, max) {
  const dx = Math.sin(a), dz = Math.cos(a), sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  let i = ci(x), j = ci(z), t = 0;
  flRayWin = Infinity;
  let nx = dx ? (i - HALF + (dx > 0 ? 1 : 0) - x) / dx : Infinity, nz = dz ? (j - HALF + (dz > 0 ? 1 : 0) - z) / dz : Infinity;
  const ex = dx ? Math.abs(1 / dx) : Infinity, ez = dz ? Math.abs(1 / dz) : Infinity;
  while (t < max) {
    if (nx < nz) { t = nx; nx += ex; if (t < max && wxSee(sx > 0 ? i + 1 : i, j)) return Math.min(max, t + THIN.t / 2); i += sx; } else { t = nz; nz += ez; if (t < max && wzSee(i, sz > 0 ? j + 1 : j)) return Math.min(max, t + THIN.t / 2); j += sz; }
    if (t >= max) return max;
    if (i < 0 || j < 0 || i >= N || j >= N) return t;
    const ob = openAt[j * N + i];
    if (blockArr[j * N + i] || (ob && shutN(ob) >= 2)) return Math.min(max, t + FL_PAST);
    if (ob && ob.kind === 'window' && flRayWin === Infinity) { const tw = ob.axis === 'x' ? (ob.z - z) / dz : (ob.x - x) / dx; flRayWin = tw > t && tw < t + 1.5 ? tw : t + 0.5; }
  }
  return max;
}
// how much of the flashlight falls at a point (for what isn't drawn by the lit shader, like smoke): the same cone
function flashAt(x, z) {
  let s = 0;
  for (let i = 0; i < LMU.uFlK.value.w; i++) {
    const f = LMU.uFl.value[i], K = LMU.uFlP.value[i], dx = x - f.x, dz = z - f.y, r = Math.hypot(dx, dz), a = Math.acos(clamp((dx * f.z + dz * f.w) / Math.max(r, 1e-3), -1, 1));
    const cone = (1 - smooth(clamp((a - K.y + 0.2) / 0.25, 0, 1))) * (1 + 0.5 * (1 - smooth(clamp(a / (K.y * 0.6), 0, 1)))), fall = 1 - clamp(r / K.x, 0, 1);
    s += mix(0.3, cone, smooth(clamp((r - 0.15) / 0.75, 0, 1))) * fall * fall * K.z;
  }
  return s;
}
// blend the light/vision map toward its target and upload it
function updateLightmap(rdt) {
  flashUniforms(rdt);
  for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t -= rdt; if (flashes[k].t <= 0) { flashes.splice(k, 1); lmT = 0; } }
  lmT -= rdt; if (lmT <= 0) { computeLight(); lmT = 0.07; }
  const up = Math.min(1, rdt * 30), down = Math.min(1, rdt * 7), vk = Math.min(1, rdt * (P.dead && !spectating() ? 1.1 : 9));
  for (let k = 0; k < FNN; k++) {
    for (let c = 0; c < 3; c++) { const i = k * 3 + c, t = lmTgt[i], cur = lmCur[i]; const n = lmCur[i] = cur + (t - cur) * (t > cur ? up : down); lmData[k * 4 + c] = n >= 2 ? 255 : n * 127.5; }
    const v = visCur[k] += (visTgt[k] - visCur[k]) * vk; lmData[k * 4 + 3] = v * 255;
  }
  lmTex.needsUpdate = true;
}
