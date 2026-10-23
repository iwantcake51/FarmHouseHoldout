// Footsteps: recorded (src/sounds/footsteps.mp3, packed by tools/pack-footsteps.py; where each clip sits is
// FOOT_SPRITE), played from your feet (audio/spatial.js). The ground under you picks the set: the house's floorboards
// and the porch are wood, the trodden yard round the house and the drive are dirt, anywhere else is grass. A walk, a
// run (sprinting), a landing and a push off (vaulting) each have their own; one is never played twice running, and each
// goes off a touch higher or lower and louder or softer than the last. Till the file's loaded (or with no audio), the
// synthesized step stands in (SFX.step)
import { cam, ZOOM_MIN } from '../core/renderer.js';
import { clamp, rr, smooth } from '../core/math.js';
import { cxw } from '../world/grid.js';
import { HX0, HX1, HZ0, HZ1, onRoad } from '../world/ground.js';
import { surfaceY } from '../world/house.js';
import { P } from '../player/player.js';
import { groundDust } from '../effects/puffs.js';
import { AC } from './audio.js';
import { SFX } from './sfx.js';
import { FOOT_SPRITE } from './footstep-sprite.js';
import { loadSound, playAt, soundAt } from './spatial.js';
import { setShake, shake } from '../game/state.js';

const FOOT_SND = loadSound('sounds/footsteps.mp3');
// how loud footsteps are overall (FOOT_LEVEL: turn this one down or up first), and each kind against the others,
// before how hard the step is (v)
const FOOT_LEVEL = 0.32, FOOT_VOL = { walk: 0.5, run: 0.7, land: 0.8, jump: 0.45 };
const FOOT_SURF = { wood: 1, dirt: 1, grass: 0.9 };
const FOOT_YARD = 2.5;   // how far out round the house the ground's trodden to dirt (world/ground.js paints it the same)
const footLast = {};
function footSurface(x, z) {
  if (surfaceY(x, z) > 0) return 'wood';   // indoors, the porch and its step (world/house.js)
  if (onRoad(x, z, 0) || (x > cxw(HX0) - FOOT_YARD && x < cxw(HX1) + FOOT_YARD && z > cxw(HZ0) - FOOT_YARD && z < cxw(HZ1) + FOOT_YARD)) return 'dirt';
  return 'grass';
}
// a step of kind ('walk', 'run', 'land' or 'jump') at v (1 a normal one) from where you stand, or from x, z (a
// zombie's: no synthesized stand-in for those, and pitched by rate)
export function footstep(kind, v = 1, x = P.x, z = P.z, rate = 1) {
  const surf = footSurface(x, z), key = surf + '.' + kind, set = FOOT_SPRITE[key], yours = x === P.x && z === P.z;
  if (!FOOT_SND.buf || !set) { if (kind !== 'jump' && yours) SFX.step(v, surf === 'wood'); return; }
  let i = Math.floor(Math.random() * set.length);
  if (set.length > 1 && i === footLast[key]) i = (i + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length;
  footLast[key] = i;
  playAt(FOOT_SND.buf, { at: set[i][0], dur: set[i][1], x, z, vol: FOOT_LEVEL * FOOT_VOL[kind] * FOOT_SURF[surf] * v * rr(0.85, 1.1), rate: rate * rr(0.94, 1.06) });
}
// Zombies' footsteps: the same recordings, but you only hear one that's right on you. Past ZSTEP.far there's nothing;
// it comes in as it closes and is at its loudest within ZSTEP.near, and even then it's well under your own (level). A
// runner's are a run's, a crawler's a soft drag; a brute's are their own (BRUTE_SND, below). Only so many a moment (max in any gap
// seconds), so a crowd at the window doesn't turn into a drumroll. Zoomed out they fall away faster than other sounds
// (on top of what audio/spatial.js takes off for everything): down to wide of themselves at ZOOM_MIN
const ZSTEP = { near: 2, far: 6, level: 0.4, gap: 0.25, max: 3, wide: 0.3 };
const zStepT = [];
// a brute's foot coming down: a scuff of dust under it you can see, and, close by, the ground thumping through the view
// (BRUTE_STEP: full shake within near metres, none past far)
const BRUTE_STEP = { near: 3.5, far: 11, shake: 0.42, dust: 0.25 };   // (the view's shake goes by its square: camera.js)
function bruteStep(z) {
  z.footSide = -(z.footSide || 1);
  const f = z.face || 0, s = 0.17 * z.T.scale * z.footSide, fx = z.x + Math.cos(f) * s, fz = z.z - Math.sin(f) * s;
  if (z.vis > 0.3) groundDust(fx, fz, BRUTE_STEP.dust, 0, 0);
  if (P.dead) return;
  const k = 1 - smooth(clamp((Math.hypot(z.x - P.x, z.z - P.z) - BRUTE_STEP.near) / (BRUTE_STEP.far - BRUTE_STEP.near), 0, 1));
  if (k > 0) setShake(Math.max(shake, BRUTE_STEP.shake * k));
}
// a brute's footfalls are nothing like the rest: the step slowed right down into a deep, heavy stomp, a thump of bass
// under it (SFX.bruteStomp), and heard from far off (BRUTE_SND: loudest within near metres, gone past far; how loud the
// stomp and the thump, and how slowed). They don't count against the other zombies' steps (ZSTEP.max)
const BRUTE_SND = { near: 4, far: 18, level: 1.15, rate: 0.55, thump: 0.55 };
function bruteStomp(z) {
  const B = BRUTE_SND, d = Math.hypot(z.x - P.x, z.z - P.z); if (d > B.far) return;
  const near = 1 - smooth(clamp((d - B.near) / (B.far - B.near), 0, 1)), k = near * (0.35 + 0.65 * near);
  footstep('walk', B.level * k, z.x, z.z, B.rate);
  soundAt(z.x, z.z, () => SFX.bruteStomp(B.thump * k));
}
export function zombieStep(z) {
  if (z.type === 'brute' && !z.crawl) bruteStep(z);
  if (P.dead || !AC) return;
  if (z.type === 'brute' && !z.crawl) { bruteStomp(z); return; }
  const d = Math.hypot(z.x - P.x, z.z - P.z); if (d > ZSTEP.far) return;
  const now = AC.currentTime; while (zStepT.length && now - zStepT[0] > ZSTEP.gap) zStepT.shift();
  if (zStepT.length >= ZSTEP.max) return;
  zStepT.push(now);
  const near = 1 - smooth(clamp((d - ZSTEP.near) / (ZSTEP.far - ZSTEP.near), 0, 1)), out = smooth(clamp((1 - (cam.zoom || 1)) / (1 - ZOOM_MIN), 0, 1));
  const zk = 1 - (1 - ZSTEP.wide) * out;   // 1 at the default zoom and closer, ZSTEP.wide zoomed all the way out
  const brute = z.type === 'brute', crawl = !!z.crawl;
  footstep(z.type === 'runner' && !crawl ? 'run' : 'walk', ZSTEP.level * near * zk * (brute ? 1.3 : crawl ? 0.45 : 1), z.x, z.z, brute ? 0.82 : crawl ? 0.9 : 1);   // (a crawling brute's)
}
