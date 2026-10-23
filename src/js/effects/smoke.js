// Gun smoke puffs, lit by the light round them.

import { clamp, HALF, pick, rand, rr } from '../core/math.js';
import { windAt, WX } from '../world/wind.js';
import { SMOKE_GAIN, TEX_SMOKE, TEX_SMOKES } from './textures.js';
import { sbSprite } from './sprite-batch.js';
import { flashes } from '../weapons/explosives.js';
import { flashAt, FN, FR, lmCur, visCur } from '../lighting/lightmap.js';

// ---- gun smoke: soft billows (one of the smoke sprites each, turned any way) that roll out of the muzzle, slow, swell
// and thin out as they drift up and away on the breeze; coloured by whatever light they sit in ----
export const smokes = [];
// (drawn all at once, with the other particles: effects/sprite-batch.js)
for (let k = 0; k < 120; k++) { const m = sbSprite(TEX_SMOKE); smokes.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, a: 0.3, spin: 0, ph: 0 }); }
let smIdx = 0;
// SMOKE_MOVE: how quickly the air takes it over (drag: it slows to the wind's speed, not to a stop), how fast it rises
// as it cools (rise, flattened in a strong wind), how much of the wind's speed it takes (wind: world/wind.js), how it
// wanders about it, and how sharply it swells at first (swell)
const SMOKE_MOVE = { drag: 3.4, rise: 0.32, wind: 1, wander: 0.12, swell: 2.6 };
const _smw = { x: 0, z: 0 };
// (lift: how much more buoyant than gun smoke it is, for hot smoke that climbs in a column: a flare's)
export function smoke(x, y, z, vx, vy, vz, s0, s1, life, a, tint, lift) {
  const p = smokes[smIdx = (smIdx + 1) % smokes.length], m = p.m.material, tex = pick(TEX_SMOKES);
  if (m.map !== tex) m.map = tex;
  p.m.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0 * 1.15; p.s1 = s1 * 1.15; p.life = p.max = life; p.a = a; p.spin = rr(-0.6, 0.6); p.ph = rand() * 6.28;
  m.rotation = rand() * 6.28; p.tint = tint || 0xc9c4ba; p.lift = lift || 1; p.m.visible = true;
}
const _sl = new THREE.Color();
export function stepSmoke(dt) {
  for (const p of smokes) {
    if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.m.visible = false; continue; }
    const k = 1 - p.life / p.max, drag = Math.exp(-dt * SMOKE_MOVE.drag), age = p.max - p.life, M = SMOKE_MOVE;
    // the air slows the push it came out with down to the wind's own speed, so it's carried off with it, gusts and all
    windAt(p.m.position.x, p.m.position.z, _smw);
    p.vx = _smw.x * M.wind + (p.vx - _smw.x * M.wind) * drag; p.vz = _smw.z * M.wind + (p.vz - _smw.z * M.wind) * drag;
    p.vy = p.vy * drag + dt * M.rise * p.lift * (1 - 0.5 * WX.str);
    p.m.position.x += (p.vx + Math.sin(age * 1.7 + p.ph) * M.wander) * dt; p.m.position.y += p.vy * dt;
    p.m.position.z += (p.vz + Math.cos(age * 1.3 + p.ph) * M.wander) * dt;
    const sc = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, M.swell)); p.m.scale.set(sc, sc, 1);
    p.m.material.rotation += p.spin * dt * (1 - k * 0.7);
    smokeLight(p.m.material.color.setHex(p.tint), p.m.position);
    // thick as it comes out, thinning as it spreads
    p.m.material.opacity = p.a * Math.min(1, k * 12) * Math.pow(1 - k, 1.35);
  }
}
// The light where a point is, as a colour (1 = full daylight): the light map's colour there (lamps, fires, flashes,
// the moon), plus the flashlight's beam
function lightColorAt(x, y, z, out) {
  const a = clamp(Math.floor((x + HALF) * FR), 0, FN - 1), b = clamp(Math.floor((z + HALF) * FR), 0, FN - 1), k = (b * FN + a) * 3, f = flashAt(x, z) * visCur[k / 3];
  return out.setRGB(lmCur[k] + f, lmCur[k + 1] + f, lmCur[k + 2] + f * 0.94);
}
// how strongly a flash going off right beside a point lights it (a muzzle, a blast, a round landing), and in what
// colour (into out): as bright as the flash is and only while it lasts, so smoke round a muzzle glows the flash's
// yellow for as long as its light is on (FLASH_NEAR: how near, as a share of the flash's reach, and how strongly)
const FLASH_NEAR = { reach: 0.3, max: 2.4, gain: 1.7 };
function flashNear(x, y, z, out) {
  let g = 0; out.setRGB(0, 0, 0);
  for (const F of flashes) {
    const rn = Math.min(FLASH_NEAR.max, F.r * FLASH_NEAR.reach), d = Math.hypot(x - F.x, y - (F.y ?? 1), z - F.z); if (d >= rn) continue;
    const w = (1 - d / rn) * (1 - d / rn) * F.int * (F.t / F.max) * FLASH_NEAR.gain;
    out.r += w * F.col[0]; out.g += w * F.col[1]; out.b += w * F.col[2]; g += w;
  }
  if (g > 0) out.multiplyScalar(1 / g);
  return g;
}
// tint a smoke-like sprite's colour c (already set to what it is) by the light at pos: never quite black, a little
// brighter than its own colour in full light, the sprite's own grey lifted back up by gain (the smoke ones:
// SMOKE_GAIN); and lit through in a flash's colour while one goes off beside it (SMOKE_GLOW: how bright it glows
// then, and how far toward the flash's colour it can go)
const SMOKE_GLOW = { bright: 1.6, most: 0.92, k: 0.9 };
const _sg = new THREE.Color();
export function smokeLight(c, pos, gain) {
  lightColorAt(pos.x, pos.y, pos.z, _sl); const G = gain || SMOKE_GAIN;
  c.setRGB(c.r * Math.min(1.5, 0.1 + _sl.r * 0.82), c.g * Math.min(1.5, 0.1 + _sl.g * 0.82), c.b * Math.min(1.5, 0.1 + _sl.b * 0.82)).multiplyScalar(G);
  const g = flashNear(pos.x, pos.y, pos.z, _sg);
  if (g > 0) c.lerp(_sg.multiplyScalar(SMOKE_GLOW.bright * G), Math.min(SMOKE_GLOW.most, g * SMOKE_GLOW.k));
  return c;
}
export const lightLevelAt = (x, z) => { const a = clamp(Math.floor((x + HALF) * FR), 0, FN - 1), b = clamp(Math.floor((z + HALF) * FR), 0, FN - 1), k = (b * FN + a) * 3; return (lmCur[k] + lmCur[k + 1] + lmCur[k + 2]) / 3 + flashAt(x, z) * visCur[k / 3]; };   // (the flashlight's drawn per pixel, so it's added here: lighting/lightmap.js)
