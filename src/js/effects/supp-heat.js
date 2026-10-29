// A suppressor heating up as you fire through it, purely for the look: each round through it warms it a little (more
// for a heavier round), so it takes a good few mags of sustained fire to get it really hot, and it bleeds the heat off
// slowly on its own, quicker the hotter it is: a full mag barely warms it, and only long sustained fire, mag after mag,
// gets it glowing. Warm, the barrel starts to smoke, thin wisps curling up off the muzzle
// (HEAT_SMOKE), more of them and thicker the hotter it gets, with a puff off it at each shot; overheating, the smoke
// pours off it slow and heavy and hangs in the air, so moving or swinging the gun leaves a trail of it behind. Hotter
// still it starts to glow, a dull red at first, then orange, then a deep yellow as it gets really hot (never washing out to white), and blooms; left alone it
// fades back down through the same colours. Each gun's can has its own heat. The glow's a thin shell over every piece of
// the can, its bands, clamp and end caps too (heatAll, from weapons/attachments.js and the MP5SD's built-in can in
// weapons/models-smgs.js), its own shape drawn again in light on top of it; and it blooms softly round the hot can,
// drawn brighter into the glow (HEAT_BLOOM: how much) than on the gun itself (effects/post.js).
import { GLOW_LAYER } from './post.js';
import { clamp, rr } from '../core/math.js';
import { curId, suppressed, W, W8 } from '../game/run-state.js';
import { gunMeshes } from '../weapons/gun-materials.js';
import { muzzleWorld } from './muzzle-flash.js';
import { smoke } from './smoke.js';

// shot: heat a round puts in (times 0.6 + its power, effects/tracers.js tracerPower); max: as hot as it gets; cool:
// what it sheds a second, plus coolHot of its heat (a hotter can cools faster); show: how hot before it starts to glow
const SUPP_HEAT = { shot: 0.0038, max: 1.3, cool: 0.012, coolHot: 0.035, show: 0.36 };   // (about three times as many rounds to heat it as before)
// the barrel's smoke: from how hot it starts (from) and from how hot it's overheating (trail); wisps a second, from just
// smoking to as hot as it gets (rate), and more again overheating (trailRate); how thick (a), how long each lasts
// (life, a second or two more overheating: the trail it leaves hanging); the puff at each shot (shot: how thick)
const HEAT_SMOKE = { from: 0.2, trail: 0.75, rate: [5, 24], trailRate: 30, a: [0.22, 0.5], trailA: 0.2, life: [1.2, 2.0], trailLife: 2.6, shot: 0.42, tint: 0xccc6bc };
// the glow's colour as it heats (0 just glowing to 1 as hot as it gets: yellow, kept saturated, as the glow is added
// on top of the metal and anything much past 1 in every channel reads as white)
const HEAT_BLOOM = 1.9;
const HEAT_RAMP = [[0, [0.38, 0.03, 0.0]], [0.4, [0.95, 0.24, 0.03]], [0.75, [1.0, 0.5, 0.06]], [1, [1.0, 0.7, 0.1]]];
const HEAT = {}, MATS = {};
const matFor = id => MATS[id] || (MATS[id] = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, visible: false }));
// the pieces of a can that glow with the heat of gun id's can
export function heatAll(list, id) {
  if (!id) return;
  for (const m of list) {
    if (!m || !m.isMesh || m.userData.heatShell) continue;
    const sh = new THREE.Mesh(m.geometry, matFor(id)); sh.castShadow = sh.receiveShadow = false; sh.userData.heatShell = true; sh.layers.enable(GLOW_LAYER);
    m.add(sh);
  }
}
// a round fired through gun id's can (pw: its power); already hot, a puff of smoke off it
export function suppHeat(id, pw) {
  HEAT[id] = Math.min(SUPP_HEAT.max, (HEAT[id] || 0) + SUPP_HEAT.shot * (0.6 + (pw || 0.35)));
  const k = smokeK(HEAT[id]); if (k > 0) { const m = muzzleWorld(); smoke(m.x, m.y + 0.01, m.z, rr(-0.08, 0.08), rr(0.3, 0.6), rr(-0.08, 0.08), 0.03, 0.22 + 0.2 * k, rr(0.8, 1.2), HEAT_SMOKE.shot * k, HEAT_SMOKE.tint); }
}
// how far into smoking a can this hot is (0 cool enough not to, 1 as hot as it gets), and into overheating
const smokeK = h => clamp((h - HEAT_SMOKE.from) / (SUPP_HEAT.max - HEAT_SMOKE.from), 0, 1), trailK = h => clamp((h - HEAT_SMOKE.trail) / (SUPP_HEAT.max - HEAT_SMOKE.trail), 0, 1);
// the gun in your hands smoking off its muzzle, as hot as its can is (not one put away)
let smokeAcc = 0;
function canSmoke(dt) {
  const id = curId(), D = id && W(id), g = gunMeshes[W8.cur], h = id ? HEAT[id] || 0 : 0, k = smokeK(h);
  if (!D || D.melee || D.akimbo || !suppressed(D) || !g || !g.visible || k <= 0) { smokeAcc = 0; return; }
  const tr = trailK(h), S = HEAT_SMOKE;
  smokeAcc += dt * (S.rate[0] + (S.rate[1] - S.rate[0]) * k + S.trailRate * tr);
  for (let n = 0; smokeAcc >= 1 && n < 4; n++) {
    smokeAcc -= 1; const m = muzzleWorld();
    // (overheating it hardly rises off the can before it hangs: the trail's laid where the muzzle's been)
    smoke(m.x + rr(-0.02, 0.02), m.y + rr(-0.01, 0.02), m.z + rr(-0.02, 0.02), rr(-0.04, 0.04), rr(0.2, 0.45) * (1 - 0.55 * tr), rr(-0.04, 0.04),
      0.022 + 0.025 * k, 0.24 + 0.32 * k + 0.45 * tr, rr(S.life[0], S.life[1]) + S.trailLife * tr, S.a[0] + (S.a[1] - S.a[0]) * k + S.trailA * tr, S.tint);
  }
  smokeAcc = Math.min(smokeAcc, 1);
}
function ramp(t, out) {
  let i = 0; while (i < HEAT_RAMP.length - 2 && t > HEAT_RAMP[i + 1][0]) i++;
  const [a, ca] = HEAT_RAMP[i], [b, cb] = HEAT_RAMP[i + 1], u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return out.setRGB(ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u);
}
let glowing = false;
// each frame: every can cooling, and its glow following its heat
export function stepSuppHeat(dt) {
  glowing = false; canSmoke(dt);
  for (const id in HEAT) {
    let h = HEAT[id]; h = Math.max(0, h - (SUPP_HEAT.cool + SUPP_HEAT.coolHot * h) * dt); HEAT[id] = h;
    const M = MATS[id]; if (!M) continue;
    const t = Math.min(1, Math.max(0, (h - SUPP_HEAT.show) / (1 - SUPP_HEAT.show))), on = t > 0.002;
    M.visible = on; if (!on) continue;
    glowing = true;
    ramp(t, M.color).multiplyScalar(0.95 + 0.15 * t); M.opacity = Math.min(1, Math.pow(t, 0.8) * 1.05);
  }
}
// whether any can's glowing (the glow pass runs for it: effects/post.js)
export const heatGlowing = () => glowing;
// the glow pass drawing them (on), and done (off): the hot cans brighter for it, so they bloom round themselves
const _hk = {};
export function heatBloom(on) {
  for (const id in MATS) {
    const M = MATS[id]; if (!M.visible) continue;
    if (on) { _hk[id] = [M.color.r, M.color.g, M.color.b]; M.color.multiplyScalar(HEAT_BLOOM); M.color.b *= 0.5; }   // (the halo's blue held down, so it stays yellow too)
    else if (_hk[id]) { const k = _hk[id]; M.color.setRGB(k[0], k[1], k[2]); delete _hk[id]; }
  }
}
