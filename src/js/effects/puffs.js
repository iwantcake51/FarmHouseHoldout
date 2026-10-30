// Soft effects as sprites: dust and smoke, sparks, impact bursts, blood mist and spray, flames, fireballs and embers,
// all drawn with the particle sprites (effects/textures.js: Kenney's Particle Pack and Light Masks).
// burst() in effects/particles.js hands its dust, spark, smoke and ember kinds over to these, so every kick-up looks this way.

import { cam, V3 } from '../core/renderer.js';
import { pick, rand, rr } from '../core/math.js';
import { BURN_BARREL } from '../world/props.js';
import { bulletBlocked } from '../world/collision.js';
import { windAt } from '../world/wind.js';
import { partSet, partTex, SMOKE_GAIN, TEX_SMOKE, TEX_SMOKES, TEX_STARS } from './textures.js';
import { sbSprite } from './sprite-batch.js';
import { smoke, smokeLight } from './smoke.js';
import { burst, cubeBurst } from './particles.js';
import { flashes } from '../weapons/explosives.js';
import { setLmT, worldT } from '../game/state.js';
import { pelletOff } from '../weapons/firing.js';
import { visAt } from '../lighting/vision.js';

// per kind: its sprites (one picked for each particle), additive or not, colour (col2: what it cools to over its life),
// whether the light round it colours it (lit; gain lifts a grey sprite back up), gravity, drag and rise; streak: drawn
// out along its motion on screen; upright: kept roughly upright (flames), never spun; fin: how much of its life it
// takes to come in; fade: how sharply it thins away at the end; boost: an additive sprite's brightness; self: how much
// of its own colour a lit one keeps however dark it is round it (something glowing, or hot)
const TEX_DIRT = partSet('dirt1', 'dirt2', 'dirt3'), TEX_FLAMES = partSet('flame1', 'flame2', 'flame3', 'flame4', 'flame5', 'flame6'), TEX_FIRE = partSet('fire1', 'fire2');
export const TEX_TRACE = partSet('trace1', 'trace2', 'trace6', 'trace7'), TEX_BURST = partSet('burst1', 'burst2'), TEX_DOT = [partTex('dot')], TEX_GLOWS = [partTex('glowSoft')];
export const FXK = {
  dust: { tex: TEX_SMOKES, col: 0x9c8a70, lit: true, gain: SMOKE_GAIN, grav: 0, drag: 3.2, rise: 0.22, fin: 0.1, fade: 1.5, wind: 1 },
  smoke: { tex: TEX_SMOKES, col: 0x4a4642, lit: true, gain: SMOKE_GAIN, grav: 0, drag: 2.2, rise: 0.6, fin: 0.14, fade: 1.3, wind: 1 },
  mist: { tex: TEX_SMOKES, col: 0x7a140e, lit: true, gain: SMOKE_GAIN, grav: 1.2, drag: 4, rise: 0, fin: 0.08, fade: 1.6, wind: 0.5 },
  // a head burst into a cloud of blood (zombies/damage.js: crushHead): a brighter red that hangs, darkening as it settles
  redMist: { tex: TEX_SMOKES, col: 0xb8221a, col2: 0x5e100a, lit: true, gain: SMOKE_GAIN, grav: 0.35, drag: 3.2, rise: 0, fin: 0.06, fade: 1.4, wind: 0.6 },
  // a spray of fine drops thrown off a hit, flung out and gone in a moment (the drops that land are effects/particles.js)
  spray: { tex: TEX_DIRT, col: 0x6e0f0a, lit: true, gain: 1.25, grav: 2, drag: 7, rise: 0, fin: 0.04, fade: 1.8, wind: 0.1 },
  // grit and splinters thrown off a wall or the ground by a round or a blast
  debris: { tex: TEX_DIRT, col: 0x8a7860, lit: true, gain: 1.2, grav: 3, drag: 5, rise: 0, fin: 0.04, fade: 1.6, wind: 0.08 },
  spark: { tex: TEX_TRACE, add: true, col: 0xffc878, boost: 1.3, grav: 9, drag: 1.6, rise: 0, streak: true, fin: 0.05, fade: 1.6 },
  // the bright burst where a round strikes something hard
  flash: { tex: TEX_BURST, add: true, col: 0xffc070, boost: 1.3, grav: 0, drag: 0, rise: 0, fin: 0.02, fade: 1 },
  // a soft bloom of light (round a flash, a fire)
  glow: { tex: TEX_GLOWS, add: true, col: 0xff9a40, grav: 0, drag: 0, rise: 0, fin: 0.05, fade: 1.2 },
  ember: { tex: TEX_DOT, add: true, col: 0xff8a32, col2: 0xb8300a, boost: 1.4, grav: -0.6, drag: 1.5, rise: 0, fin: 0.05, fade: 1.2, wind: 0.9 },
  flame: { tex: TEX_FLAMES, add: true, col: 0xffa040, col2: 0xc02c08, boost: 1.5, grav: -3.2, drag: 2.4, rise: 0, upright: true, fin: 0.12, fade: 1.4, wind: 0.45 },
  // the white-hot heart of a steady fire (the burn barrel's), low in the flames, going orange as it rises into them
  // the body of a fire's flames, drawn solid under the glowing ones so it still shows as fire by day
  flameBody: { tex: TEX_FLAMES, col: 0xff8a26, col2: 0x8a1c06, grav: -2.8, drag: 2.6, rise: 0, upright: true, fin: 0.12, fade: 1.5, wind: 0.4 },
  flameCore: { tex: TEX_FLAMES, add: true, col: 0xffe8b0, col2: 0xff7a1c, boost: 1.3, grav: -2.4, drag: 3, rise: 0, upright: true, fin: 0.15, fade: 1.6, wind: 0.25 },
  // a ball of fire rolling up out of a blast or a dragon's breath shell, cooling from yellow-white to a dull red
  fireball: { tex: TEX_FIRE, add: true, col: 0xffb050, col2: 0x7a1a04, boost: 1.05, grav: -1.4, drag: 3, rise: 0, fin: 0.04, fade: 1.3, wind: 0.3 },
  // a burning magnesium pellet from a dragon's breath shell: a white-hot streak that cools to orange as it arcs down,
  // and burns a moment where it lands
  dragon: { tex: TEX_TRACE, add: true, col: 0xfff4c8, col2: 0xff5410, boost: 1.6, grav: 3.2, drag: 0.9, rise: 0, streak: true, fin: 0.03, fade: 0.7 },
  // a blast's shock ring, thrown out fast and gone
  shock: { tex: [partTex('ring')], add: true, col: 0xffe6c0, grav: 0, drag: 0, rise: 0, fin: 0.02, fade: 1.6 },
  // a road flare burning: a white-hot jet off its tip reddening as it goes, and molten drips spat out that fall and die
  flareJet: { tex: TEX_FLAMES, add: true, col: 0xfff0ea, col2: 0xff2414, boost: 1.5, grav: -0.8, drag: 4, rise: 0, fin: 0.05, fade: 1.2, wind: 0.5 },
  flareDrip: { tex: TEX_DOT, add: true, col: 0xffd8c8, col2: 0xd01808, boost: 1.4, grav: 5, drag: 1.2, rise: 0, fin: 0.03, fade: 1 },
  star: { tex: TEX_STARS, add: true, col: 0xfff0d0, grav: 0, drag: 0, rise: 0, fin: 0.02, fade: 1 }
};
const fxs = [];
// (drawn all at once, with the gun smoke: effects/sprite-batch.js)
for (let k = 0; k < 420; k++) { const s = sbSprite(TEX_SMOKE); fxs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.5, a: 0.4, spin: 0, kind: 'dust' }); }
let fxIdx = 0;
const _fc2 = new THREE.Color(), _fp = new V3(), _fq = new V3();
export function fx(kind, x, y, z, vx, vy, vz, s0, s1, life, a) {
  // (one that's done with, or failing that the one nearest its end, faded all but away: none you can see blinks out)
  let p = null, best = Infinity;
  for (let n = 0; n < fxs.length; n++) { const q = fxs[fxIdx = (fxIdx + 1) % fxs.length]; if (q.life <= 0) { p = q; break; } const r = q.life / q.max; if (r < best) { best = r; p = q; } }
  const K = FXK[kind], m = p.s.material, tex = pick(K.tex);
  if (m.map !== tex) m.map = tex;
  const bl = K.add ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.blending !== bl) { m.blending = bl; m.needsUpdate = true; }
  m.rotation = K.upright ? rr(-0.25, 0.25) : rand() * 6.28;
  p.kind = kind; p.s.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.life = p.max = life; p.a = a; p.spin = K.upright || K.streak ? 0 : rr(-1.2, 1.2);
  p.s.scale.setScalar(s0); p.s.visible = true;
  return p;
}
// a cloud of dust that billows out and settles, a little grit thrown out of it, and a few chips
export function dustBurst(x, y, z, n, dx, dz, force) {
  const f = force || 1.5;
  for (let k = 0, m = Math.ceil(n * 0.7); k < m; k++) fx('dust', x + rr(-0.1, 0.1), Math.max(0.06, y) + rr(-0.05, 0.05), z + rr(-0.1, 0.1), (dx || 0) * f * rr(0.2, 0.6) + rr(-0.7, 0.7), rr(0.2, 0.9), (dz || 0) * f * rr(0.2, 0.6) + rr(-0.7, 0.7), rr(0.14, 0.24), rr(0.55, 1.05), rr(0.7, 1.2), rr(0.24, 0.38));
  fx('debris', x, Math.max(0.06, y), z, (dx || 0) * f * 0.4, rr(0.3, 0.9), (dz || 0) * f * 0.4, 0.1, rr(0.35, 0.55), rr(0.3, 0.45), 0.7);
  cubeBurst(x, y, z, Math.ceil(n * 0.35), 'dust', dx, dz, force, 0.45);
}
// a ring of dust thrown out along the ground (landing a vault, a heavy body hitting the floor)
export function groundDust(x, z, strength, dx, dz) {
  const n = Math.round(6 + 8 * strength);
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + rr(-0.2, 0.2), sp = rr(1.1, 2.2) * (0.6 + 0.4 * strength);
    fx('dust', x + Math.sin(a) * 0.15, 0.08, z + Math.cos(a) * 0.15, Math.sin(a) * sp + (dx || 0) * 0.8, rr(0.12, 0.4), Math.cos(a) * sp + (dz || 0) * 0.8, rr(0.14, 0.22), rr(0.6, 1.0) * (0.7 + 0.3 * strength), rr(0.7, 1.15), rr(0.2, 0.34));
  }
  cubeBurst(x, 0.1, z, Math.round(2 + 3 * strength), 'dust', dx, dz, 1.2, 0.4);
}
// bright streaks that fly off and fall
export function sparkBurst(x, y, z, n, dx, dz, force) {
  const f = force || 3;
  for (let k = 0; k < n; k++) fx('spark', x, y, z, (dx || 0) * f * rr(0.4, 1.3) + rr(-1.6, 1.6), rr(0.4, 3.2), (dz || 0) * f * rr(0.4, 1.3) + rr(-1.6, 1.6), 0.05, 0.03, rr(0.12, 0.3), 1);
}
// a bullet hitting a wall or a board: a bright burst and a bloom of light, a spray of sparks, grit and a puff of dust
// thrown off the surface, and a few chips
// by what it hit (surf): the ground kicks up a fountain of dirt clods and a puff that rises, no sparks; wood throws
// splinters off the face and only a spark or two; anything else (a metal grate, stone) the sparks and chips as ever
export function impactFx(x, y, z, nx, nz, surf) {
  if (surf === 'dirt') {
    fx('flash', x, y + 0.02, z, 0, 0, 0, rr(0.18, 0.26), 0.1, 0.05, 0.6);
    cubeBurst(x, y + 0.03, z, 4 + (rand() * 3 | 0), 'dust', nx * 0.6, nz * 0.6, 1.4, 0.8);
    for (let k = 0; k < 3; k++) fx('dust', x + rr(-0.04, 0.04), y + 0.04, z + rr(-0.04, 0.04), nx * rr(0.3, 0.8) + rr(-0.25, 0.25), rr(0.6, 1.3), nz * rr(0.3, 0.8) + rr(-0.25, 0.25), 0.1, rr(0.55, 0.85), rr(0.8, 1.2), 0.35);
    return;
  }
  if (surf === 'wood') {
    fx('flash', x + nx * 0.03, y, z + nz * 0.03, 0, 0, 0, rr(0.24, 0.32), 0.12, 0.06, 0.8);
    if (rand() < 0.5) sparkBurst(x, y, z, 1 + (rand() * 2 | 0), nx, nz, 3);
    cubeBurst(x + nx * 0.03, y, z + nz * 0.03, 3 + (rand() * 3 | 0), 'wood', nx, nz, 3.2, 0.45);
    for (let k = 0; k < 2; k++) fx('dust', x + nx * 0.05, y, z + nz * 0.05, nx * rr(0.6, 1.4) + rr(-0.3, 0.3), rr(0.1, 0.5), nz * rr(0.6, 1.4) + rr(-0.3, 0.3), 0.08, rr(0.4, 0.6), rr(0.6, 0.9), 0.28);
    return;
  }
  fx('flash', x + nx * 0.03, y, z + nz * 0.03, 0, 0, 0, rr(0.32, 0.42), 0.16, 0.07, 1);
  fx('glow', x + nx * 0.05, y, z + nz * 0.05, 0, 0, 0, 0.5, 0.3, 0.09, 0.5);
  sparkBurst(x, y, z, 5 + (rand() * 3 | 0), nx, nz, 3.5);
  fx('debris', x + nx * 0.04, y, z + nz * 0.04, nx * rr(1, 1.8), rr(0.2, 0.8), nz * rr(1, 1.8), 0.08, rr(0.3, 0.45), rr(0.28, 0.4), 0.75);
  for (let k = 0; k < 2; k++) fx('dust', x + nx * 0.05, y, z + nz * 0.05, nx * rr(0.6, 1.4) + rr(-0.3, 0.3), rr(0.1, 0.5), nz * rr(0.6, 1.4) + rr(-0.3, 0.3), 0.08, rr(0.45, 0.7), rr(0.7, 1.0), 0.3);
  cubeBurst(x, y, z, 2 + (rand() * 2 | 0), 'dust', nx, nz, 2.2, 0.35);
}
// a hit on flesh, along the shot: a spray of fine drops flung out the far side, a puff of red mist blown out with it
// that swells, hangs and drifts off on the wind as it thins, and a smaller one coughed back out of the wound toward
// the shot. The harder the hit (dealt) the more of it; a head hit more again (HIT_MIST: puffs out the far side, how
// big they start and swell to, how long they hang and how thick, and how much harder hits add, up to a cap)
const HIT_MIST = { n: 2, s0: [0.1, 0.16], s1: [0.45, 0.75], life: [0.6, 1.05], a: [0.4, 0.55], per: 45, most: 2.2 };
export function hitMist(x, y, z, dx, dz, big, dealt) {
  const H = HIT_MIST, m = Math.min(H.most, 1 + (dealt || 20) / H.per) * (big ? 1.35 : 1);
  for (let k = 0, n = Math.round(2 * m); k < n; k++) fx('spray', x + dx * 0.05, y + rr(-0.05, 0.05), z + dz * 0.05, dx * rr(1.6, 3) + rr(-0.5, 0.5), rr(-0.2, 0.7), dz * rr(1.6, 3) + rr(-0.5, 0.5), rr(0.06, 0.1), rr(0.3, 0.5) * m, rr(0.16, 0.26), 0.85);
  for (let k = 0, n = Math.round(H.n * m); k < n; k++) fx('redMist', x + dx * rr(0.05, 0.15) + rr(-0.05, 0.05), y + rr(-0.06, 0.06), z + dz * rr(0.05, 0.15) + rr(-0.05, 0.05), dx * rr(0.6, 1.8) + rr(-0.35, 0.35), rr(-0.05, 0.4), dz * rr(0.6, 1.8) + rr(-0.35, 0.35), rr(H.s0[0], H.s0[1]), rr(H.s1[0], H.s1[1]) * (0.8 + 0.2 * m), rr(H.life[0], H.life[1]), rr(H.a[0], H.a[1]));
  fx('redMist', x - dx * 0.08, y + rr(-0.04, 0.04), z - dz * 0.08, -dx * rr(0.3, 0.7), rr(0, 0.25), -dz * rr(0.3, 0.7), 0.08, rr(0.25, 0.4) * m, rr(0.4, 0.6), 0.35);
}
// a round going off pushes hot gas out of the ejection port with the case (pos: the port, r: the gun's right, the
// way the case goes): a brief glow, a few flecks of burning powder flung out with it and a jet of smoke that rolls
// out sideways and hangs; racking a pump or a bolt by hand lets out only a breath of smoke (fired false). A shotgun's
// is a little more of all of it
export function portFx(pos, r, fired, big) {
  const m = big ? 1.4 : 1;
  if (fired) {
    fx('glow', pos.x, pos.y, pos.z, r.x * 0.4, 0.1, r.z * 0.4, 0.1 * m, 0.22 * m, 0.06, 0.55);
    for (let k = 0, n = 2 + (rand() * 3 | 0); k < n; k++) { const v = rr(1.4, 3.2); fx('ember', pos.x, pos.y, pos.z, r.x * v + rr(-0.5, 0.5), rr(0.3, 1.2), r.z * v + rr(-0.5, 0.5), 0.035, 0.012, rr(0.1, 0.22), 0.9); }
  }
  for (let k = 0, n = fired ? 2 : 1; k < n; k++) { const v = rr(0.35, 0.9) * (fired ? 1 : 0.5); smoke(pos.x, pos.y, pos.z, r.x * v, rr(0.15, 0.4), r.z * v, 0.035 * m, rr(0.16, 0.26) * m, rr(0.6, 1.0), fired ? 0.24 : 0.16, 0xb8b0a4); }
}
// fire on a burning body (zombies/ai.js, a burning corpse in zombies/deaths.js): tongues of flame licking up off it
// between heights y0 and y1 within r of its middle, yellow at the base and cooling to red as they rise and shrink, a
// warm glow round it, the odd ember thrown off and a thread of dark smoke from the top
export function burnFx(x, z, y0, y1, r, dt) {
  for (let n = dt * 26; n > 0; n--) {
    if (n < 1 && rand() > n) break;
    const a = rand() * 6.28, d = rr(0, r);
    fx('flame', x + Math.sin(a) * d, rr(y0, (y0 + y1) / 2), z + Math.cos(a) * d, rr(-0.15, 0.15), rr(0.5, 1.1), rr(-0.15, 0.15), rr(0.45, 0.7), rr(0.18, 0.3), rr(0.35, 0.6), rr(0.7, 1));
  }
  if (rand() < dt * 8) fx('glow', x, (y0 + y1) / 2, z, 0, 0.2, 0, rr(1.1, 1.4), rr(1.1, 1.4), 0.3, 0.22);
  if (rand() < dt * 5) fx('ember', x + rr(-r, r), rr(y0, y1), z + rr(-r, r), rr(-0.8, 0.8), rr(0.8, 2.2), rr(-0.8, 0.8), rr(0.05, 0.08), 0.02, rr(0.6, 1.1), 0.9);
  if (rand() < dt * 3) fx('smoke', x + rr(-0.1, 0.1), y1 + 0.15, z + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(0.5, 0.9), rr(-0.2, 0.2), 0.18, rr(0.8, 1.2), rr(1.5, 2.3), 0.3);
}
// the burn barrel's fire (world/props.js: BURN_BARREL): tongues of flame licking up out of its mouth, the tallest from the
// middle, yellow-white at the heart and cooling to red as they climb and bend off on the wind (over a solid body of
// flame, so it still reads as fire by day); a warm glow breathing
// round it, embers drifting up on the heat, now and then a crackle that spits a few sparks, a dark column of smoke off
// the top, and the coals in the barrel flickering with the light it throws (BARREL_FX: how much of each, a second)
const BARREL_FX = { flame: 30, body: 16, core: 12, glow: 7, ember: 6, crackle: 0.5, smoke: 2.2 };
export function barrelFire(dt) {
  const B = BURN_BARREL, F = BARREL_FX, at = (d, a) => [B.x + Math.sin(a) * d, B.z + Math.cos(a) * d];
  for (let n = dt * F.flame; n > 0; n--) {
    if (n < 1 && rand() > n) break;
    const a = rand() * 6.28, d = Math.sqrt(rand()) * B.r * 0.85, c = 1 - d / B.r, [x, z] = at(d, a);
    fx('flame', x, B.y + rr(0, 0.08), z, rr(-0.1, 0.1) - Math.sin(a) * d * 0.4, rr(0.7, 1.3) * (0.55 + 0.6 * c), rr(-0.1, 0.1) - Math.cos(a) * d * 0.4, rr(0.5, 0.8) * (0.7 + 0.5 * c), rr(0.2, 0.32), rr(0.4, 0.75) * (0.7 + 0.5 * c), rr(0.75, 1));
  }
  for (let n = dt * F.body; n > 0; n--) {
    if (n < 1 && rand() > n) break;
    const [x, z] = at(Math.sqrt(rand()) * B.r * 0.7, rand() * 6.28);
    fx('flameBody', x, B.y + 0.04, z, rr(-0.08, 0.08), rr(0.6, 1.1), rr(-0.08, 0.08), rr(0.45, 0.65), rr(0.18, 0.26), rr(0.35, 0.6), rr(0.45, 0.6));
  }
  for (let n = dt * F.core; n > 0; n--) {
    if (n < 1 && rand() > n) break;
    const [x, z] = at(rr(0, B.r * 0.4), rand() * 6.28);
    fx('flameCore', x, B.y + 0.02, z, 0, rr(0.4, 0.8), 0, rr(0.35, 0.5), rr(0.16, 0.24), rr(0.3, 0.45), rr(0.7, 0.9));
  }
  if (rand() < dt * F.glow) fx('glow', B.x, B.y + 0.35, B.z, 0, 0.15, 0, rr(1.5, 1.9), rr(1.7, 2.1), rr(0.3, 0.45), rr(0.16, 0.22));
  if (rand() < dt * F.ember) { const [x, z] = at(rr(0, B.r), rand() * 6.28); fx('ember', x, B.y + rr(0.1, 0.4), z, rr(-0.4, 0.4), rr(1.2, 2.6), rr(-0.4, 0.4), rr(0.04, 0.07), 0.015, rr(1.2, 2.2), 0.9); }
  if (rand() < dt * F.crackle) for (let k = 0, n = 3 + Math.floor(rand() * 5); k < n; k++) { const a = rand() * 6.28, v = rr(0.6, 1.6); fx('spark', B.x, B.y + rr(0.1, 0.3), B.z, Math.sin(a) * v, rr(2.5, 4.5), Math.cos(a) * v, 0.05, 0.05, rr(0.4, 0.8), 1); }
  if (rand() < dt * F.smoke) smoke(B.x + rr(-0.1, 0.1), B.y + rr(0.8, 1.1), B.z + rr(-0.1, 0.1), rr(-0.1, 0.1), rr(0.5, 0.8), rr(-0.1, 0.1), rr(0.2, 0.3), rr(1.1, 1.6), rr(3, 4.5), rr(0.16, 0.24), 0x3a3632, 2.4);
  const fl = 0.8 + Math.sin(worldT * 11.1) * 0.1 + Math.sin(worldT * 37.3) * 0.05 + Math.sin(worldT * 23.9) * 0.05;   // the light's flicker (lighting/lightmap.js)
  B.coal.color.setRGB(1, 0.42 * fl + 0.06, 0.12 * fl).multiplyScalar(0.75 + 0.35 * fl); B.ember.color.setRGB(0.6 * fl + 0.05, 0.15 * fl, 0.04);
}
// a dragon's breath shell going off: a fireball out of the muzzle, a cone of flame that rolls out a few metres, and a
// spray of burning pellets that stream out far down the line and arc to the ground, still burning where they land.
// (x, y, z) is the muzzle, a the aim, sp the shot's spread
export function dragonBreath(x, y, z, a, sp) {
  const fx0 = Math.sin(a), fz0 = Math.cos(a);
  fx('glow', x + fx0 * 0.3, y, z + fz0 * 0.3, 0, 0, 0, 1.4, 0.8, 0.14, 0.35);
  fx('fireball', x + fx0 * 0.25, y, z + fz0 * 0.25, fx0 * 2, 0.3, fz0 * 2, 0.5, 1.0, 0.18, 0.8);
  for (let k = 0; k < 10; k++) { const b = a + rr(-1, 1) * sp * 0.7, v = rr(5, 12); fx('fireball', x + fx0 * 0.2, y + rr(-0.04, 0.04), z + fz0 * 0.2, Math.sin(b) * v, rr(-0.1, 0.6), Math.cos(b) * v, rr(0.25, 0.4), rr(0.5, 0.8), rr(0.2, 0.42), rr(0.45, 0.7)); }
  for (let k = 0; k < 8; k++) { const b = a + rr(-1, 1) * sp * 0.8, v = rr(4, 10); fx('flame', x + fx0 * 0.15, y + rr(-0.04, 0.04), z + fz0 * 0.15, Math.sin(b) * v, rr(-0.2, 0.7), Math.cos(b) * v, rr(0.3, 0.45), rr(0.12, 0.2), rr(0.2, 0.4), rr(0.7, 1)); }
  for (let k = 0; k < 46; k++) { const b = a + pelletOff(sp * 1.25), v = rr(12, 26); fx('dragon', x + fx0 * 0.1, y + rr(-0.03, 0.03), z + fz0 * 0.1, Math.sin(b) * v, rr(-0.6, 1.6), Math.cos(b) * v, 0.1, 0.1, rr(0.45, 1.0), rr(0.75, 1)); }
  for (let k = 0; k < 6; k++) fx('ember', x + fx0 * rr(0.3, 2.5), y + rr(-0.1, 0.2), z + fz0 * rr(0.3, 2.5), fx0 * rr(1, 3) + rr(-0.6, 0.6), rr(0.4, 1.4), fz0 * rr(1, 3) + rr(-0.6, 0.6), rr(0.06, 0.1), 0.02, rr(0.6, 1.2), 0.9);
  // it lights the yard up orange along the line of fire for a moment
  flashes.push({ x: x + fx0 * 0.6, y, z: z + fz0 * 0.6, r: 9, int: 2.2, col: [1, 0.55, 0.2], t: 0.16, max: 0.16 }, { x: x + fx0 * 5, y, z: z + fz0 * 5, r: 7, int: 1.1, col: [1, 0.5, 0.15], t: 0.35, max: 0.35 }); setLmT(0);
}
// a blast at (x, z), r its reach (weapons/explosives.js): a white flash and a bloom of light, a shock ring thrown out,
// balls of fire rolling up and cooling to dark red, sparks and embers flung out, grit and dust thrown off the ground,
// and a thick dark cloud that rolls up out of it and hangs over the spot (small: an explosive round, a fraction of it)
export function blastFx(x, z, r, small) {
  const k = small ? 0.45 : 1;
  fx('flash', x, 0.7, z, 0, 0, 0, 0.8 * k + 0.3, r * 1.3 * k, 0.14, 1);
  fx('glow', x, 0.6, z, 0, 0, 0, r * 0.9 * k, r * 1.7 * k, 0.32, 0.4);
  fx('shock', x, 0.25, z, 0, 0, 0, 0.4, r * 1.9 * k, 0.3, 0.55);
  for (let n = 0, c = Math.round(9 * k) + 2; n < c; n++) { const a = rand() * 6.28, sp = rr(0.6, 2.4) * k; fx('fireball', x + Math.sin(a) * 0.2, rr(0.25, 0.7), z + Math.cos(a) * 0.2, Math.sin(a) * sp, rr(0.8, 2.6) * k, Math.cos(a) * sp, rr(0.4, 0.6) * k + 0.1, rr(1.0, 1.6) * k + 0.2, rr(0.3, 0.55), 0.95); }
  sparkBurst(x, 0.4, z, Math.round(18 * k), 0, 0, 8 * k);
  burst(x, 0.5, z, Math.round(10 * k), 'ember', 0, 0, 6 * k);
  for (let n = 0, c = Math.round(4 * k) + 1; n < c; n++) { const a = rand() * 6.28, sp = rr(2, 4) * k; fx('debris', x, 0.2, z, Math.sin(a) * sp, rr(1, 2.4), Math.cos(a) * sp, 0.2, rr(0.6, 0.9) * k + 0.2, rr(0.35, 0.5), 0.8); }
  groundDust(x, z, 2.4 * k, 0, 0); cubeBurst(x, 0.15, z, Math.round(12 * k), 'dust', 0, 0, 5 * k, 0.6);
  for (let n = 0, c = Math.round(12 * k) + 1; n < c; n++) fx('smoke', x + rr(-0.5, 0.5) * k, rr(0.3, 1.1), z + rr(-0.5, 0.5) * k, rr(-0.7, 0.7), rr(0.7, 1.8) * k, rr(-0.7, 0.7), rr(0.5, 0.8) * k, rr(2.2, 3.4) * k + 0.4, rr(3, 4.5), rr(0.75, 0.9));
}
const _fw = { x: 0, z: 0 }, _fs = new THREE.Color();
export function stepFx(dt) {
  if (dt <= 0) return;
  for (const p of fxs) {
    if (p.life <= 0) continue; p.life -= dt;
    const s = p.s, m = s.material; if (p.life <= 0) { s.visible = false; continue; }
    const K = FXK[p.kind], k = 1 - p.life / p.max, dr = Math.exp(-dt * K.drag);
    // the air slows it to the wind's speed (wind: how much of it a kind takes up; world/wind.js), not to a stop
    if (K.wind) { windAt(s.position.x, s.position.z, _fw); const ax = _fw.x * K.wind, az = _fw.z * K.wind; p.vx = ax + (p.vx - ax) * dr; p.vz = az + (p.vz - az) * dr; }
    else { p.vx *= dr; p.vz *= dr; }
    p.vy = p.vy * dr - K.grav * dt + K.rise * dt;
    // burning pellets, flame and sparks stop at a wall (and die there) rather than going through it
    if ((p.kind === 'dragon' || p.kind === 'flame' || p.kind === 'fireball' || p.kind === 'spark') && s.position.y < 2.4 && bulletBlocked(s.position.x + p.vx * dt, s.position.z + p.vz * dt)) { p.vx = p.vz = 0; p.life = Math.min(p.life, 0.05); }
    s.position.x += p.vx * dt; s.position.y += p.vy * dt; s.position.z += p.vz * dt;
    if (s.position.y < 0.03) { s.position.y = 0.03; p.vy = 0; if (p.kind === 'spark') p.life = Math.min(p.life, 0.03); else if (p.kind === 'dragon') { p.vx *= 0.25; p.vz *= 0.25; } }
    let op = p.a * Math.min(1, k / K.fin) * Math.pow(1 - k, K.fade);
    if (K.streak) {
      // stretch the streak along its motion on screen (the trace sprites lie along x, about 0.6 of the sprite long and
      // a tenth of it thick)
      _fp.copy(s.position).project(cam); _fq.set(s.position.x + p.vx * 0.03, s.position.y + p.vy * 0.03, s.position.z + p.vz * 0.03).project(cam);
      const sx = (_fq.x - _fp.x) * innerWidth, sy = (_fq.y - _fp.y) * innerHeight;
      m.rotation = Math.atan2(sy, sx); const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (p.kind === 'dragon') { s.scale.set((0.09 + sp * 0.045) / 0.6, 0.5, 1); op = p.a * Math.pow(1 - k, 0.7); } else s.scale.set((0.05 + sp * 0.035) / 0.6, 0.2, 1);
    } else { const e = 1 - Math.pow(1 - k, 2.2); s.scale.setScalar(p.s0 + (p.s1 - p.s0) * e); m.rotation += p.spin * dt * (1 - k * 0.6); }
    m.color.setHex(K.col); if (K.col2) m.color.lerp(_fc2.setHex(K.col2), k);
    if (K.lit) {
      if (K.self) _fs.copy(m.color);
      smokeLight(m.color, s.position, K.gain); op *= 0.3 + 0.7 * visAt(s.position.x, s.position.z);
      if (K.self) m.color.setRGB(Math.max(m.color.r, _fs.r * K.self), Math.max(m.color.g, _fs.g * K.self), Math.max(m.color.b, _fs.b * K.self));
    }
    else if (K.boost) m.color.multiplyScalar(K.boost);
    m.opacity = op;
  }
}
