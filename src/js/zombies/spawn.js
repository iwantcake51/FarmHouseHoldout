// Spawning a zombie: model, outfit, fade materials, x-ray, shadow, and where it comes in from.

import { scene } from '../core/renderer.js';
import { clamp, HALF, N, rand, rr, smooth } from '../core/math.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { GLOW_LAYER } from '../effects/post.js';
import { basic } from '../core/shaders.js';
import { blobShadow, box, trimShadows } from '../core/geometry.js';
import { cxw } from '../world/grid.js';
import { GAPS } from '../world/fence.js';
import { human } from '../characters/rig.js';
import { stainZombie } from '../effects/body-blood.js';
import { run } from '../game/run-state.js';
import { zombies, ZT } from './zombie-types.js';
import { zAnimInit, zombieRig } from './zombie-anim.js';
import { dressZombie } from './zombie-looks.js';
import { fadeDepthMat, xray } from '../effects/outlines.js';
import { armorFor, BRUTE_ARM } from './damage.js';
import { BRUTE_FROM, LATE, lateN } from '../waves/waves.js';
import { SPIT, spitterGait, spitterLook } from './spitter.js';
import { EYE_COL } from '../effects/eye-glow.js';
import { cheatAI } from '../ui/cheats.js';
import { fpOn } from '../game/view-cam.js';
import { ELITE_BRUTE, ELITE_KIND, eliteLook, makeElite, rollElite } from './elites.js';

// zombies come out of the fog: each starts 6.5 to 9 m out past the edge of the farm, on the cleared trail in front of
// one of the gaps in the trees, and walks in along it (z.out, zombies/ai.js). Out there it only shows as it comes clear
// of the fog: fogSee is how much of it does, none of it FOG_IN metres out and all of it at the edge
const FOG_IN = 7;
// from your own eyes the haze lies further out (world/atmosphere.js FAR_EDGE: it starts some 9 m past the edge and
// nothing shows through it by 44 m), so there they start deep in it (FP_OUT, m past the edge) and walk out of it, solid
// all the way, the haze alone hiding them till they come clear of it; they cover the hidden stretch quicker
// (zombies/ai.js: FP_OUT.fast past FP_OUT.deep, FP_OUT.mid between that and FP_OUT.near), so they reach the farm about
// as soon as they would from overhead
export const FP_OUT = { far: [38, 44], deep: 18, near: 9, fast: 4, mid: 1.6 };
export const fogSee = (x, z) => 1 - smooth(clamp((Math.max(Math.abs(x), Math.abs(z)) - HALF) / FOG_IN, 0, 1));
export function spawnZombie(type, job) {
  const T_ = ZT[type], [gi, gj] = GAPS[(rand() * GAPS.length) | 0];
  const ox = gi === 0 ? -1 : gi === N - 1 ? 1 : 0, oz = gj === 0 ? -1 : gj === N - 1 ? 1 : 0, far = fpOn() ? rr(FP_OUT.far[0], FP_OUT.far[1]) : rr(6.5, 9), lat = rr(-0.6, 0.6);
  const gx = cxw(gi) + rr(-.3, .3), gz = cxw(gj) + rr(-.3, .3);
  // (the run's first brute comes in plain clothes, with nothing on it to soak up your shots: BRUTE_RAMP, waves/waves.js)
  if (type === 'brute' && run.wave > 0) { if (!run.bruteSeen && !job) job = 'casual'; run.bruteSeen = true; }
  const m = human(0xffffff, 0xffffff, 0xffffff);
  zombieRig(m);   // knees, elbows and a waist (zombies/zombie-anim.js)
  dressZombie(m, type, job);   // its body and what it was wearing when it turned (zombies/zombie-looks.js)
  if (type === 'spitter') spitterLook(m);   // its sac and glowing mouth (zombies/spitter.js)
  // now and then one's something more: its colour and body (zombies/elites.js), before its eyes are made in that colour
  const ek = rollElite(type), EK = ek && ELITE_KIND[ek]; if (ek) eliteLook(m, ek);
  const sc = T_.scale * rr(0.94, 1.06) * (EK ? EK.scale : 1);
  m.g.scale.setScalar(sc);
  // the pupils glow, deep in their sockets; effects/eye-glow.js gives them a halo and a light trail
  m.eyes = m.look.eyeAt.map(([x, y, w, h, z]) => box(m.head, w, h, 0.008, basic(m.eyeCol || EYE_COL), x, y, m.look.hat === 'riot' ? 0.2 : z + 0.0011));   // (glowing through a riot helmet's face shield)
  m.eyes.forEach(e => e.layers.enable(GLOW_LAYER));   // (they bloom: effects/post.js)   // (where each eye is, and how open: zHead; a hair forward, so it never shares a plane with the face round it)
  trimShadows(m.g);
  const stain = stainZombie(m);   // blood on them, like on you (effects/body-blood.js)
  const fm = new Set(); m.g.traverse(o => { if (o.isMesh && !o.userData.isOutline) { o.material.userData.mobile = true; fm.add(o.material); } }); fm.forEach(mt => { mt.transparent = true; });
  ['head', 'torso', 'armL', 'armR', 'legL', 'legR'].forEach(p => { m[p].userData.part = p; });
  const dm = fadeDepthMat(); m.g.traverse(o => { if (o.isMesh) o.customDepthMaterial = dm; });
  const xr = xray(m.g, type === 'spitter' ? SPIT.xray : EK ? EK.col : 0xff3322, false, true, o => o.castShadow, 0, 5);   // seen through cover in halftone dots, like you (effects/outlines.js); not the pieces too small to change its shape (its eyes: trimShadows), three draws each saved
  scene.add(m.g);
  const hpMul = 1 + (run.wave - 1) * 0.11 + LATE.hp * lateN(run.wave) ** 2, hp = T_.hp * hpMul * (run.waveHp || 1) * cheatAI().hp * (EK ? EK.hp * (type === 'brute' ? ELITE_BRUTE.hp : 1) : 1);   // (faster past LATE.from: waves/waves.js; and the cheat menu's zombie health: ui/cheats.js)
  const z = { type, T: Object.assign({}, T_, { scale: sc }), m, x: gx + ox * far + (ox ? 0 : lat), z: gz + oz * far + (oz ? 0 : lat), out: true, gx, gz, hp, maxHp: hp, vx: 0, vz: 0, face: Math.atan2(-ox, -oz), phase: rand() * 6, atk: 0, lunge: 0, flash: 0, squash: 0, stagger: 0, drip: 0, burn: 0, bleed: 0, vis: 0,
    fade: [...fm], xr, dm, blob: blobShadow(1.1 * sc * (type === 'brute' ? 1.25 : 1), 0), armor: armorFor(m.look, hp), limbs: { head: true, armL: true, armR: true, legL: true, legR: true }, lhp: { armL: hp * (type === 'brute' ? BRUTE_ARM : 0.3), armR: hp * (type === 'brute' ? BRUTE_ARM : 0.3), legL: hp * 0.4, legR: hp * 0.4 }, crawl: false, spurts: [], stain, speed: T_.speed * rr(.9, 1.1) * (type === 'runner' ? runnerPace() : type === 'walker' ? walkerPace() : type === 'brute' ? brutePace() : 1) };
  // its voice, its own (SFX.groan): a walker's anywhere from a low moan to a reedy one, a sprinter's higher, a brute's
  // far lower; and a sprinter lets out a shriek as it comes out of the treeline, most of the time
  z.voice = type === 'runner' ? rr(1.0, 1.25) : type === 'brute' ? rr(0.85, 1.1) : rr(0.8, 1.22);
  if (type === 'runner' && rand() < 0.65) soundAt(z.x, z.z, () => SFX.groan(0.9, z.voice, 'runner'), true);
  if (ek) makeElite(z, ek);
  zAnimInit(z); zombies.push(z);
  if (type === 'spitter') spitterGait(z);   // bent over its belly, and its drool and glow kept going (zombies/spitter.js)
}
// sprinters show up on wave 3 at about two thirds of their top speed and work up to full pace by wave 11
const runnerPace = () => Math.min(1, 0.62 + Math.max(0, run.wave - 3) * 0.0475);
// walkers pick up a little pace as the waves go on: WALKER_PACE.per faster each wave after the first, never more than
// WALKER_PACE.max over their own (about a fifth faster by wave 14)
const WALKER_PACE = { per: 0.015, max: 0.2 }, walkerPace = () => 1 + Math.min(WALKER_PACE.max, Math.max(0, run.wave - 1) * WALKER_PACE.per);
// brutes, a few waves after they first come (BRUTE_PACE.after waves past BRUTE_FROM), get a little quicker each wave: on their feet (pace) and at
// smashing through a fence (smash: their blows on it come sooner, zombies/ai.js), never at hitting you
const BRUTE_PACE = { after: 3, pace: 0.02, paceMax: 0.16, smash: 0.03, smashMax: 0.24 };
const bruteLate = () => Math.max(0, run.wave - (BRUTE_FROM + BRUTE_PACE.after) + 1);
const brutePace = () => 1 + Math.min(BRUTE_PACE.paceMax, bruteLate() * BRUTE_PACE.pace);
export const bruteSmashK = () => 1 + Math.min(BRUTE_PACE.smashMax, bruteLate() * BRUTE_PACE.smash);
