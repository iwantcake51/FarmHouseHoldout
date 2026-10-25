// Melee animation: the guard each weapon is held in, its three swings, the draw flourish, the bash, and the springs
// that carry the body through them.
//
// A pose is where the right fist is (F, in upper-body space: x to your right, y up, z ahead, the right shoulder at
// 0.33, 1.08, 0) and which way the weapon points out of it (W, the handle to the tip), plus the body: the hips turned
// (hy) and the chest turned (uy, + to your right), leaned forward (ux) and bent to the side (uz), the weight forward
// onto the lead foot (step, - back onto the rear one) and the knees bent (dip). meleeSolve turns F and W into the arm's
// angles, its roll and the weapon's angle in the fist, so the keys say where things go and the arm finds its way there.
//
// Each track is a list of keys [t, F, W, body], body as { uy, ux, uz, hy, step, dip } (missing ones carry on from the
// key before). 'G' for F or W is the weapon's guard. The pose runs through the keys on a smooth curve (meleeCurve),
// keeping its speed through each key rather than stopping at it, except at a key marked hold. A swing is sampled a
// little ahead for the hips and chest than for the arm, and the arm ahead of the weapon (MCHAIN): the hips start it,
// the shoulders follow, the arm comes through and the weapon whips round last. Then everything rides on springs
// (MSPRING), loose for the weapon in the fist, firmer for the body, so it carries on past where it's sent and settles.
// A blow that lands (meleeImpact) stops the swing dead for a moment (MSTOP) and throws the springs back off the hit.

import { V3 } from '../core/renderer.js';
import { angDiff, clamp, mix, rand, smooth } from '../core/math.js';
import { P } from '../player/player.js';
import { curId, S, W8 } from '../game/run-state.js';
import { meleeLen } from './swing-trail.js';
import { SFX } from '../audio/sfx.js';
import { HEAVY, heavySwing } from './melee.js';
import { springTo } from '../game/camera.js';
import { ANIM } from '../player/animation.js';
import { ARM_THIN, FIST, SHOULDER_REST } from '../player/hold.js';
import { SWAP_T, swapSt } from '../player/swap.js';
import { inspectBlend, inspectT } from '../player/inspect.js';
import { fpOn } from '../game/view-cam.js';

// the guard per weapon: fist and weapon direction, and the body
const MGUARD = {
  club:    { F: [0.32, 0.84, 0.28], W: [0.26, 0.55, 0.8], b: { uy: 0.1, ux: 0.02 } },               // crowbar, wrench: low at the right hip, angled up and out ahead
  bat:     { F: [0.14, 0.88, 0.32], W: [0.4, 0.76, 0.5], b: { uy: 0.14, ux: 0.03, dip: 0.04 } },     // both hands low in front, the bat angled up and out to the right
  machete: { F: [0.32, 0.86, 0.3], W: [0.22, 0.5, 0.84], b: { uy: 0.1, ux: 0.02 } },               // low at the hip, the blade out ahead
  katana:  { F: [0.05, 0.92, 0.36], W: [-0.02, 0.58, 0.81], b: { uy: 0.06, ux: 0.03, dip: 0.06 } }, // two hands at the middle, the point at the throat
  heavy:   { F: [0.13, 0.86, 0.3], W: [-0.44, 0.76, 0.48], b: { uy: 0.16, ux: 0.04, dip: 0.06 } }   // across the body, the head up by the left shoulder
};
// looking a melee weapon over (the inspect key: player/inspect.js keeps its time), by kind, as poses through it: when
// (t, seconds), the fist (F: across, up, ahead of the chest, metres) and which way the weapon points from it (W), how
// far it's turned in the fist about its handle (r, radians, on top of its own: past a whole turn it's a twirl), where
// your eyes go (hp: down, hy: round) and the chest's turn (uy). A one-hander's brought up in front of your face blade
// up, turned to show one flat and then the other, laid across to look along its edge and twirled once in the fingers
// before it drops back to the guard; the katana's held across in both hands at the chest and turned, then stood up
// to look up its edge; a heavy one's (the axe, the sledge, the bat) hefted up beside your face, its head turned each
// way, then tipped out to your right and turned there. The springs it's put on (MSPRING, by its weight) carry
// it smoothly from pose to pose
const MK = (t, F, W, r = 0, hp = 0, hy = 0, uy = 0) => ({ t, F, W, r, hp, hy, uy });
const MINSPECT = {
  one: [MK(0.55, [0.15, 1.08, 0.34], [-0.22, 0.9, 0.37], 0, 0.26, -0.04, 0.06), MK(1.25, [0.16, 1.1, 0.35], [-0.18, 0.92, 0.34], 1.3, 0.28, -0.06, 0.07),
    MK(1.95, [0.14, 1.09, 0.35], [-0.26, 0.88, 0.38], -1.35, 0.27, -0.02, 0.06), MK(2.7, [0.12, 1.12, 0.3], [-0.62, 0.22, 0.75], 0.15, 0.33, 0.12, 0.1),
    MK(3.35, [0.15, 1.08, 0.33], [-0.28, 0.86, 0.4], 2 * Math.PI, 0.25, 0, 0.06), MK(4.1, null, null)],
  katana: [MK(0.6, [0.05, 1.17, 0.42], [-0.93, 0.16, 0.33], 0, 0.22, 0.05, 0.04), MK(1.4, [0.06, 1.18, 0.43], [-0.92, 0.2, 0.34], 1.4, 0.23, 0.1, 0.05),
    MK(2.2, [0.05, 1.17, 0.42], [-0.93, 0.14, 0.33], -1.4, 0.22, 0.12, 0.05), MK(3.0, [0.08, 1.06, 0.32], [-0.12, 0.95, 0.3], 0, 0.05, -0.02, 0.02),
    MK(3.55, [0.08, 1.06, 0.32], [-0.1, 0.96, 0.27], 0.25, 0.0, 0, 0.02), MK(4.4, null, null)],
  heavy: [MK(0.7, [0.14, 0.9, 0.36], [-0.12, 0.85, 0.5], 0, 0.14, -0.04, 0.05), MK(1.5, [0.15, 0.91, 0.36], [-0.1, 0.86, 0.49], 1.1, 0.16, -0.06, 0.06),
    MK(2.3, [0.13, 0.9, 0.36], [-0.14, 0.84, 0.51], -1.1, 0.15, 0.02, 0.05), MK(3.2, [0.2, 0.92, 0.38], [0.45, 0.75, 0.48], 0, 0.1, 0.12, 0.1),
    MK(3.95, [0.21, 0.92, 0.37], [0.47, 0.74, 0.47], 0.6, 0.12, 0.14, 0.11), MK(4.9, null, null)]
};
const minspectSet = kind => kind === 'katana' ? MINSPECT.katana : kind === 'heavy' || kind === 'bat' ? MINSPECT.heavy : MINSPECT.one;
export const meleeInspectEnd = id => { const L = minspectSet(meleeKind(id)); return L[L.length - 1].t; };
const _miF = new V3(), _miW = new V3(), _miF2 = new V3(), _miW2 = new V3(), _miO = { r: 0, hp: 0, hy: 0, uy: 0 };
// the pose t seconds in (the guard, g, at the start and the end), each move eased out of one pose and into the next
function minspectAt(L, g, t, F, Wd) {
  const at = i => i < 0 || !L[i].F ? null : L[i];
  let i = -1; while (i < L.length - 1 && t > L[i + 1].t) i++;
  const a = at(i), b = at(Math.min(i + 1, L.length - 1)), ta = i < 0 ? 0 : L[i].t, tb = L[Math.min(i + 1, L.length - 1)].t;
  const u = clamp((t - ta) / Math.max(1e-3, tb - ta), 0, 1), e = u * u * u * (u * (u * 6 - 15) + 10);
  _miF.fromArray(a ? a.F : g.F); _miW.fromArray(a ? a.W : g.W).normalize(); _miF2.fromArray(b ? b.F : g.F); _miW2.fromArray(b ? b.W : g.W).normalize();
  F.lerpVectors(_miF, _miF2, e); Wd.lerpVectors(_miW, _miW2, e).normalize();
  for (const k of ['r', 'hp', 'hy', 'uy']) _miO[k] = mix(a ? a[k] : 0, b ? b[k] : 0, e);
  if (b && !b.F && a) _miO.r = mix(a.r, Math.round(a.r / (2 * Math.PI)) * 2 * Math.PI, e);   // (a twirl's turn finished, not unwound)
  return _miO;
}
const meleeKind = id => id === 'bat' ? 'bat' : id === 'machete' ? 'machete' : id === 'katana' ? 'katana' : id === 'axe' || id === 'sledge' ? 'heavy' : 'club';
// three swings per style. Blunt and blades land at p 0.4, the heavy two at 0.55 (HEAVY.hit, melee/melee.js), each
// whipping through the point it lands at; side is which way it goes across you (the view tips with it: melee.js), and
// fast the stretch of it that smears a trail (melee/swing-trail.js). L is what a one-hander's free hand does through it
// (meleeOffHand), so it isn't just hanging there: reaching out ahead to line the blow up and then yanked back to the
// hip as it lands (the pull that turns the shoulders through it), taking the haft for the wind-up of a backhand, or
// both hands on the handle for the machete's straight cut
const MSWINGS = {
  swing: [
    { side: 1, fast: [0.24, 0.56], L: [[0, 'R'], [0.2, [-0.12, 1.22, 0.44]], [0.4, [-0.42, 0.74, -0.2]], [0.62, [-0.38, 0.74, -0.1]], [1, 'R']], keys: [   // the forehand: wound up behind the right shoulder, swept flat across the front, wrapped round the left
      [0, 'G', 'G'],
      [0.2, [0.5, 1.38, -0.12], [0.7, 0.42, -0.58], { uy: 0.62, hy: 0.3, ux: -0.04, step: -0.35, dip: 0.16 }, 1],
      [0.31, [0.34, 1.14, 0.3], [0.96, 0.12, 0.22], { uy: 0.22, hy: -0.05, step: 0.2 }],
      [0.4, [0.04, 1.1, 0.52], [-0.12, 0.04, 1], { uy: -0.32, hy: -0.4, ux: 0.1, step: 0.75, dip: 0.2 }],
      [0.52, [-0.26, 1.14, 0.3], [-0.92, 0.18, -0.3], { uy: -0.72, hy: -0.55, ux: 0.06 }],
      [0.66, [-0.18, 1.3, 0.12], [-0.42, 0.62, -0.66], { uy: -0.55, hy: -0.4, step: 0.4, dip: 0.12 }],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.24, 0.56], L: [[0, 'R'], [0.12, 0.3], [0.3, 0.3], [0.4, [-0.5, 0.84, -0.22]], [0.62, [-0.44, 0.76, -0.12]], [1, 'R']], keys: [  // the backhand: back across from the left, the knuckles leading
      [0, 'G', 'G'],
      [0.2, [-0.14, 1.2, 0.14], [-0.72, 0.52, -0.46], { uy: -0.5, hy: -0.25, step: -0.2, dip: 0.14 }, 1],
      [0.31, [-0.08, 1.12, 0.4], [-0.92, 0.1, 0.32], { uy: -0.2, hy: 0, step: 0.25 }],
      [0.4, [0.2, 1.1, 0.5], [0.22, 0.04, 1], { uy: 0.22, hy: 0.3, ux: 0.08, step: 0.6, dip: 0.18 }],
      [0.52, [0.52, 1.2, 0.3], [0.94, 0.2, -0.22], { uy: 0.6, hy: 0.42 }],
      [0.68, [0.44, 1.36, 0.2], [0.5, 0.6, -0.6], { uy: 0.45, hy: 0.25, step: 0.3, dip: 0.1 }],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.26, 0.58], L: [[0, 'R'], [0.21, [-0.1, 1.32, 0.42]], [0.4, [-0.42, 0.76, -0.16]], [0.62, [-0.38, 0.76, -0.06]], [1, 'R']], keys: [   // overhand: raised high behind the head and brought down across the body
      [0, 'G', 'G'],
      [0.21, [0.34, 1.56, -0.04], [0.22, 0.46, -0.86], { uy: 0.32, hy: 0.15, ux: -0.1, step: -0.3, dip: 0.04 }, 1],
      [0.32, [0.26, 1.46, 0.3], [0.32, 0.92, 0.22], { uy: 0.12, ux: 0.02, step: 0.1 }],
      [0.4, [0.1, 1.08, 0.52], [-0.3, -0.32, 0.9], { uy: -0.18, hy: -0.2, ux: 0.24, step: 0.7, dip: 0.3 }],
      [0.54, [-0.1, 0.84, 0.34], [-0.62, -0.55, 0.52], { uy: -0.42, hy: -0.3, ux: 0.26, dip: 0.34 }],
      [0.7, [0.0, 0.96, 0.3], [-0.2, 0.4, 0.5], { uy: -0.2, ux: 0.14, step: 0.3, dip: 0.2 }],
      [1, 'G', 'G']] }
  ],
  slash: [
    { side: 1, fast: [0.24, 0.56], L: [[0, 'R'], [0.2, [-0.14, 1.26, 0.44]], [0.4, [-0.4, 0.78, -0.18]], [0.66, [-0.36, 0.78, -0.06]], [1, 'R']], keys: [   // the forehand diagonal: high over the right shoulder down to the left hip
      [0, 'G', 'G'],
      [0.2, [0.36, 1.44, 0.04], [0.52, 0.62, -0.58], { uy: 0.48, hy: 0.22, ux: -0.05, step: -0.3, dip: 0.08 }, 1],
      [0.31, [0.3, 1.32, 0.34], [0.62, 0.62, 0.48], { uy: 0.2, step: 0.15 }],
      [0.4, [0.06, 1.05, 0.52], [-0.46, -0.26, 0.85], { uy: -0.28, hy: -0.3, ux: 0.18, step: 0.7, dip: 0.24 }],
      [0.52, [-0.2, 0.84, 0.3], [-0.72, -0.62, -0.22], { uy: -0.6, hy: -0.45, ux: 0.22, dip: 0.3 }],
      [0.68, [-0.06, 0.96, 0.3], [-0.3, 0.3, 0.4], { uy: -0.3, ux: 0.1, step: 0.35, dip: 0.15 }],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.24, 0.56], L: [[0, 'R'], [0.2, [-0.06, 1.3, 0.36]], [0.4, [-0.5, 0.86, -0.2]], [0.62, [-0.44, 0.78, -0.1]], [1, 'R']], keys: [  // the rising backhand: from low on the left up past the right shoulder
      [0, 'G', 'G'],
      [0.2, [-0.12, 0.86, 0.28], [-0.8, -0.42, 0.24], { uy: -0.5, hy: -0.25, ux: 0.12, step: -0.15, dip: 0.24 }, 1],
      [0.31, [-0.04, 0.94, 0.48], [-0.6, -0.1, 0.78], { uy: -0.22, step: 0.2, dip: 0.2 }],
      [0.4, [0.14, 1.12, 0.52], [0.42, 0.32, 0.85], { uy: 0.22, hy: 0.25, ux: 0.06, step: 0.6, dip: 0.12 }],
      [0.52, [0.4, 1.44, 0.22], [0.72, 0.6, -0.32], { uy: 0.52, hy: 0.38, ux: -0.04 }],
      [0.68, [0.3, 1.3, 0.24], [0.3, 0.8, 0.1], { uy: 0.3, step: 0.3, dip: 0.08 }],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.26, 0.58], L: [[0, 'R'], [0.22, -0.12], [0.4, -0.12], [0.58, -0.12], [0.76, [-0.3, 0.84, 0.26]], [1, 'R']], keys: [   // the straight cut: the blade lifted behind the head and brought down the middle
      [0, 'G', 'G'],
      [0.22, [0.14, 1.6, 0.02], [0.04, 0.32, -0.95], { uy: 0.12, ux: -0.12, step: -0.25, dip: 0.02 }, 1],
      [0.32, [0.12, 1.5, 0.32], [0.04, 0.96, 0.2], { uy: 0.06, step: 0.1 }],
      [0.4, [0.06, 1.12, 0.54], [0, -0.12, 1], { uy: 0, ux: 0.24, step: 0.7, dip: 0.3 }],
      [0.52, [0.06, 0.86, 0.42], [0.04, -0.78, 0.6], { ux: 0.32, dip: 0.38 }],
      [0.7, [0.08, 0.96, 0.4], [0.02, 0.36, 0.9], { ux: 0.14, step: 0.3, dip: 0.2 }],
      [1, 'G', 'G']] }
  ],
  heavy: [
    { side: 1, fast: [0.34, 0.6], keys: [    // overhead: hauled up and back over the head, a beat at the top, then down into the ground in front
      [0, 'G', 'G'],
      [0.17, [0.16, 1.46, 0.14], [0.12, 0.82, -0.52], { uy: 0.18, ux: -0.08, step: -0.25, dip: 0.04 }],
      [0.3, [0.1, 1.6, 0.0], [0.04, 0.24, -0.97], { uy: 0.12, ux: -0.16, step: -0.38, dip: 0 }, 1],
      [0.55, [0.04, 0.96, 0.56], [0, -0.58, 0.82], { uy: 0, ux: 0.3, step: 0.6, dip: 0.44 }],
      [0.74, [0.04, 0.9, 0.52], [0, -0.66, 0.75], { ux: 0.27, step: 0.55, dip: 0.4 }, 1],
      [1, 'G', 'G']] },
    { side: 1, fast: [0.34, 0.62], keys: [   // over the right shoulder and down across to the left
      [0, 'G', 'G'],
      [0.17, [0.36, 1.38, 0.06], [0.52, 0.66, -0.54], { uy: 0.5, hy: 0.25, ux: -0.05, step: -0.25 }],
      [0.3, [0.42, 1.52, -0.06], [0.62, 0.42, -0.66], { uy: 0.66, hy: 0.36, ux: -0.1, step: -0.35, dip: 0.06 }, 1],
      [0.55, [0.02, 1.0, 0.56], [-0.42, -0.36, 0.83], { uy: -0.3, hy: -0.3, ux: 0.3, step: 0.65, dip: 0.4 }],
      [0.72, [-0.14, 0.86, 0.36], [-0.72, -0.62, 0.3], { uy: -0.5, hy: -0.42, ux: 0.32, dip: 0.42 }, 1],
      [1, 'G', 'G']] },
    { side: -1, fast: [0.34, 0.62], keys: [  // the side swing: everything turned back to the right, then round flat across the front
      [0, 'G', 'G'],
      [0.17, [0.52, 1.3, 0.12], [0.72, 0.36, -0.6], { uy: 0.62, hy: 0.36, step: -0.3, dip: 0.16 }],
      [0.3, [0.56, 1.34, 0.02], [0.66, 0.22, -0.72], { uy: 0.82, hy: 0.46, step: -0.38, dip: 0.2 }, 1],
      [0.55, [0.04, 1.04, 0.56], [-0.18, -0.06, 1], { uy: -0.24, hy: -0.36, ux: 0.12, step: 0.65, dip: 0.24 }],
      [0.7, [-0.34, 1.08, 0.26], [-0.9, 0.08, -0.36], { uy: -0.85, hy: -0.6, ux: 0.1, dip: 0.2 }, 1],
      [1, 'G', 'G']] }
  ]
};
// the draw: what you do with the weapon as it comes off the pack, by weapon, over dur seconds from when the hand
// closes on it (player/swap.js carries it from the straps toward the first key, so the motion runs on from the draw
// without stopping at the guard first). Each runs through on one loose curve with no holds and lands in the guard,
// the springs letting it settle there with its weight. The crowbar's twirled forward once round in the fist and
// caught; the machete tipped out and flicked down to the right; the bat laid on the shoulder, lifted off it and let
// fall forward into both hands; the katana drawn up over the shoulder and flicked out and down to the right; the heavy
// two brought onto the shoulder, the knees taking the weight, hitched up and let swing down across into the left
// hand. L is when a two-hander's left hand comes onto the handle (off it before, at SWAP_REST_L), snd when it whooshes
const MDRAW = {
  club: { dur: 0.95, snd: 0.3, keys: [
    [0, [0.28, 1.3, 0.14], [0.1, 0.87, -0.5], { uy: 0.12 }],
    [0.2, [0.3, 1.18, 0.32], [0.08, 0.94, 0.34], { uy: 0.1 }],
    [0.32, [0.31, 1.08, 0.4], [0.08, 0.34, 0.94]],
    [0.42, [0.31, 1.03, 0.41], [0.08, -0.47, 0.88], { uy: 0.06, ux: 0.03 }],
    [0.51, [0.31, 1.01, 0.4], [0.08, -0.97, 0.22]],
    [0.6, [0.31, 1.0, 0.38], [0.08, -0.64, -0.77], { dip: 0.02 }],
    [0.7, [0.32, 0.95, 0.34], [0.12, 0.6, -0.79], { uy: 0.14, dip: 0.06 }],
    [0.8, [0.32, 0.9, 0.31], [0.2, 0.96, 0.17], { dip: 0.02 }],
    [0.95, 'G', 'G']] },
  machete: { dur: 0.92, snd: 0.38, keys: [
    [0, [0.28, 1.3, 0.14], [0.1, 0.87, -0.5], { uy: 0.12 }],
    [0.22, [0.32, 1.2, 0.34], [0.3, 0.85, 0.4], { uy: 0.12 }],
    [0.36, [0.36, 1.08, 0.42], [0.7, 0.2, 0.68], { uy: 0.16 }],
    [0.48, [0.4, 0.99, 0.38], [0.85, -0.35, 0.4], { uy: 0.2, dip: 0.05 }],
    [0.62, [0.36, 0.94, 0.34], [0.55, 0.15, 0.82], { uy: 0.13, dip: 0.02 }],
    [0.92, 'G', 'G']] },
  bat: { dur: 1.15, snd: 0.55, L: [0.62, 0.86], keys: [
    [0, [0.22, 1.3, 0.18], [0.3, 0.5, -0.81], { uy: 0.12 }],
    [0.3, [0.22, 1.27, 0.2], [0.32, 0.42, -0.85], { uy: 0.15, dip: 0.07 }],
    [0.5, [0.24, 1.22, 0.28], [0.45, 0.85, -0.25], { uy: 0.2, dip: 0.02 }],
    [0.66, [0.2, 1.04, 0.36], [0.62, 0.6, 0.5], { uy: 0.22, dip: 0.07 }],
    [0.82, [0.15, 0.92, 0.33], [0.45, 0.72, 0.53], { uy: 0.16, dip: 0.05 }],
    [1.15, 'G', 'G']] },
  katana: { dur: 1.0, snd: 0.42, L: [0.62, 0.84], keys: [
    [0, [0.26, 1.34, 0.14], [0.15, 0.6, -0.78], { uy: 0.1 }],
    [0.24, [0.3, 1.3, 0.3], [0.4, 0.9, 0.1], { uy: 0.14 }],
    [0.4, [0.38, 1.12, 0.4], [0.85, 0.3, 0.42], { uy: 0.25, hy: 0.1 }],
    [0.52, [0.42, 0.98, 0.38], [0.8, -0.35, 0.5], { uy: 0.3, hy: 0.12, dip: 0.1 }],
    [0.68, [0.2, 0.94, 0.38], [0.3, 0.2, 0.93], { uy: 0.12, hy: 0.04, dip: 0.06 }],
    [1.0, 'G', 'G']] },
  heavy: { dur: 1.15, snd: 0.7, L: [0.66, 0.9], keys: [
    [0, [0.2, 1.3, 0.16], [0.2, 0.45, -0.87], { uy: 0.12 }],
    [0.3, [0.2, 1.24, 0.18], [0.22, 0.4, -0.89], { uy: 0.16, ux: 0.06, dip: 0.14 }],
    [0.46, [0.2, 1.3, 0.22], [0.15, 0.8, -0.55], { uy: 0.14, ux: 0, dip: 0.04 }],
    [0.62, [0.15, 1.12, 0.32], [-0.1, 0.95, 0.2], { uy: 0.12 }],
    [0.78, [0.13, 0.9, 0.32], [-0.4, 0.75, 0.5], { uy: 0.2, ux: 0.06, dip: 0.1 }],
    [1.15, 'G', 'G']] }
};
// the bash (a shove with a melee weapon in your hands, player/shove.js): both hands drive the haft out flat across
// you, the weapon crosswise like a bar, and back to the guard; a one-hander's driven out pommel first. Over the
// shove's own time (SHOVE_DUR), with the blow landing at SHOVE_HIT
const MBASH = {
  two: [[0, 'G', 'G'],
    [0.18, [0.1, 1.06, 0.2], [-0.94, 0.3, 0.12], { uy: 0.14, ux: -0.04, step: -0.1 }, 1],
    [0.3, [0.02, 1.08, 0.58], [-0.96, 0.24, 0.1], { uy: -0.06, ux: 0.1, step: 0.3 }],
    [0.48, [0.04, 1.08, 0.52], [-0.94, 0.28, 0.12], { ux: 0.08, step: 0.25 }],
    [1, 'G', 'G']],
  one: [[0, 'G', 'G'],
    [0.18, [0.16, 1.18, 0.3], [0.06, 0.96, 0.2], { uy: 0.18, step: -0.1 }, 1],
    [0.3, [0.02, 1.1, 0.58], [0.04, 0.9, -0.4], { uy: -0.08, ux: 0.1, step: 0.3 }],
    [0.48, [0.04, 1.1, 0.52], [0.06, 0.92, -0.3], { ux: 0.08, step: 0.25 }],
    [1, 'G', 'G']]
};
// how far up the haft a two-hander's left hand has slid for the bash (1: holding it like a bar), sliding up as it's
// drawn back and down again as it comes back to the guard, gone by the time the shove ends (player/hold.js)
export function meleeBashHand() {
  const sv = P.shove; if (!sv) return 0;
  const p = clamp(sv.t / sv.dur, 0, 1);
  return smooth(clamp(p / 0.18, 0, 1)) * (1 - smooth(clamp((p - 0.42) / 0.5, 0, 1)));
}
// a one-hander's bash has both hands on it, driven out like a bar (the free hand further up the haft; on the machete,
// over the pommel)
const MBASH_L = [[0, 'R'], [0.18, 0.22], [0.5, 0.22], [1, 'R']];
// the free hand of a one-hander through a swing or a bash: a track of [t, where] keys (L on each of MSWINGS, MBASH_L),
// where is 'R' (hanging free for balance, as between swings), a number (on the handle, that far up it from the right
// fist; below it, over the pommel, on the machete, whose handle is short) or a place in upper-body space. Run through on
// the same curve as the rest, on a spring of its own (MOFF). rest is where it hangs free this frame, handleAt finds a
// point on the handle; returns null when there's nothing for it to do (the free arm's left hanging). It eases onto the
// swing's track over its first MOFF.in seconds rather than jumping onto it, and once the swing's done it drifts back to
// where it hangs on a softer, slower spring (MOFF.back: stiffness, damping) instead of snapping there, slower than the
// swing itself comes back to the guard
const MOFF = { k: 480, c: 33, near: 0.36, far: 0.64, in: 0.15, back: [70, 15] };
const _offPts = [], _offT = new V3(), _offB = new V3(), _offG = new V3();
// the free hand's spring toward target (stiffness k, damping c), stepped finely so it stays stable at any frame rate
function offSpring(target, k, c, rdt) {
  if (!(rdt > 0)) return;
  const n = Math.ceil(rdt / (1 / 240)), h = rdt / n;
  for (let i = 0; i < n; i++) { MS.vL.addScaledVector(_offB.copy(MS.L).sub(target), -k * h).addScaledVector(MS.vL, -c * h); MS.L.addScaledVector(MS.vL, h); }
}
function meleeOffTrack(D, sh) { if (D.two) return null; if (sh) return MBASH_L; return W8.swing > 0 ? curSwing(D).L || null : null; }
export function meleeOffHand(D, id, sh, rest, handleAt, rdt) {
  const keys = meleeOffTrack(D, sh);
  if (!keys) {
    MS.lW = 0;
    if (!MS.lLive) { MS.L.copy(rest); MS.vL.set(0, 0, 0); return null; }
    offSpring(rest, MOFF.back[0], MOFF.back[1], rdt);
    if (MS.L.distanceTo(rest) < 0.004 && MS.vL.length() < 0.03) { MS.lLive = false; return null; }   // settled: hanging free again
    return MS.L;
  }
  MS.lLive = true; MS.lW = Math.min(1, (MS.lW || 0) + rdt / MOFF.in);
  const kind = meleeKind(id);
  let p; if (sh) p = clamp(P.shove.t / P.shove.dur, 0, 1);
  else { const dur = W8.swingDur || 0.5; p = meleeWarp(1 - W8.swing / dur, curSwing(D).keys, heavySwing(D) ? HEAVY.hit : 0.4, meleeWeight(id)[0]); }
  const pts = keys.map((k, j) => { const o = _offPts[j] || (_offPts[j] = new V3()), v = k[1]; return v === 'R' ? o.copy(rest) : typeof v === 'number' ? handleAt(kind === 'machete' ? Math.min(v, -0.12) : v, o) : o.set(v[0], v[1], v[2]); });
  _offT.set(meleeCurve(keys, p, j => pts[j].x), meleeCurve(keys, p, j => pts[j].y), meleeCurve(keys, p, j => pts[j].z));
  // (kept out at arm's length from the shoulder, MOFF.near: going from out in front to back at the hip it swings round
  // in an arc, as a straight arm does, not in past the shoulder where the arm can't follow)
  { const s = SHOULDER_REST.L; _offB.set(_offT.x - s[0], _offT.y - s[1], _offT.z - s[2]); const d = _offB.length(); if (d < MOFF.near && d > 1e-4) _offT.set(s[0], s[1], s[2]).addScaledVector(_offB, MOFF.near / d); }
  if (MS.lW < 1) _offT.lerpVectors(rest, _offT, smooth(MS.lW));   // (easing onto the track as the swing starts)
  offSpring(_offT, MOFF.k, MOFF.c, rdt);
  // (and the hand itself, swinging past, kept between the arm's shortest and longest: MOFF.near, MOFF.far)
  { const s = SHOULDER_REST.L; _offB.set(MS.L.x - s[0], MS.L.y - s[1], MS.L.z - s[2]); const d = _offB.length() || 1, c = clamp(d, MOFF.near * 0.85, MOFF.far);
    if (c !== d) { _offB.multiplyScalar(1 / d); MS.vL.addScaledVector(_offB, -MS.vL.dot(_offB)); MS.L.set(s[0], s[1], s[2]).addScaledVector(_offB, c); } }
  // on the handle it holds on: the hand's put right on its grip, eased on and off it either side (the spring alone
  // would leave it trailing behind a handle that's moving fast)
  const gw = clamp(meleeCurve(keys, p, j => typeof keys[j][1] === 'number' ? 1 : 0), 0, 1);
  if (gw > 0.001) { let off = 0; for (const k of keys) if (typeof k[1] === 'number') { off = k[1]; break; } handleAt(kind === 'machete' ? Math.min(off, -0.12) : off, _offB); return _offG.copy(MS.L).lerp(_offB, smooth(gw)); }
  return MS.L;
}
// how much further the fist is thrown out from the shoulder through the front of a swing (at full reach ahead)
const MEXTEND = 0.3;
// from your own eyes a swing's kept where you can see it (the keys are laid out for the view from above): its arcs
// drawn in a little toward the guard (shrink), the fist never brought back past a plane in front of your face (zMin,
// metres ahead of the chest, gone past only a little: soft) nor up over your eyes near the middle of the view (top,
// within face of the middle; raised above raise there, it's taken out to side, to the right of your eyes), and the
// weapon never laid back over your shoulder past wBack, so the arm never sweeps
// through your face, the windup stays at the top of the view, and the blow crosses it rather than flicking past the
// edge of it; the forearm's roll and the turn in the fist slower too (roll, twist: a second), and the weapon held in
// the fist as it is in the guard all through the swing, turned by the arm alone (a wrist doesn't wring a weapon round
// its handle mid-swing), so it doesn't spin about its handle as it comes round
const FP_MSWING = { shrink: 0.85, zMin: 0.38, soft: 0.3, top: 1.22, face: 0.42, raise: 1.08, side: 0.3, wBack: -0.2, roll: 6, twist: 10 };
function fpSwing(F, W, g) {
  const M = FP_MSWING;
  F.set(g.F[0] + (F.x - g.F[0]) * M.shrink, g.F[1] + (F.y - g.F[1]) * M.shrink, g.F[2] + (F.z - g.F[2]) * M.shrink);
  if (F.z < M.zMin) F.z = M.zMin - (M.zMin - F.z) * M.soft;
  const mid = 1 - smooth(clamp((Math.abs(F.x) - 0.12) / (M.face - 0.12), 0, 1));
  if (F.y > M.top) F.y = M.top + (F.y - M.top) * (1 - 0.8 * mid);
  // (raised up in the middle, in front of your eyes, it's taken out to the right of them instead, as you'd lift it)
  const up = smooth(clamp((F.y - M.raise) / 0.16, 0, 1)) * mid; F.x += (Math.max(F.x, M.side) - F.x) * up;
  if (W.z < M.wBack) { W.z = M.wBack + (W.z - M.wBack) * 0.3; W.normalize(); }
}
// how far ahead (seconds) each part is sampled: the hips and legs lead, then the chest, the arm, and the weapon last
const MCHAIN = { body: 0.06, F: 0.035, W: 0.012 };
// the springs each part rides on (stiffness, damping): the weapon loosest, so it lags into a swing and whips past
const MSPRING = { F: [620, 36], W: [380, 21], turn: [360, 28], lean: [300, 24], legs: [260, 25] };
// how each weapon handles, by its weight: m how heavy it is to swing (0 a machete, 1 the sledge) and head how much of
// that is out at the end of it (a sledgehammer's all head, a katana's balanced). The heavier it is, the slower it comes
// up and the harder it falls into the blow, the more it lags in the hands and carries on past, the more of the body goes
// into it, the more its head sags while it's moving slowly, and the deader it stops on what it hits, where a light one
// bounces off (meleeWeight, MHEFT)
const MWEIGHT = { machete: [0.1, 0.35], katana: [0.25, 0.2], crowbar: [0.4, 0.45], bat: [0.4, 0.65], wrench: [0.6, 0.85], axe: [0.75, 0.85], sledge: [1, 1] };
const meleeWeight = id => MWEIGHT[id] || [0.4, 0.5];
// what the weight does: lift (how much slower a heavy one comes up off the guard), fall (how much it gathers speed into
// the blow and carries on after it), body (how much more of the body goes into a heavy swing, less into a light one),
// sag (how far a heavy head droops while it's moving slowly), the springs it rides on (stiffer and better damped for a
// light one: it goes where it's sent; looser for a heavy one: it lags and swings past), and how it lands
const MHEFT = { lift: 0.4, fall: 0.85, body: [0.82, 1.22], sag: 0.34, wK: [1.35, 0.6], wZeta: [0.66, 0.42], fK: [1.12, 0.82] };
// a blow landing: how long the swing stops dead on it (seconds, from the lightest weapon to the heaviest), and how hard
// the springs are thrown back off it (a light one bounces off, the heaviest stops dead and stays)
const MSTOP = { light: 0.045, heavy: 0.1, bounce: 0.9 };
const MBODY = ['uy', 'ux', 'uz', 'hy', 'step', 'dip'];
// the springs' state: the fist and the weapon's direction with their speeds, and the body (MS.b, each part's speed
// beside it as v + its name)
export const MS = { ihp: 0, ihy: 0, F: new V3(0.2, 1.1, 0.4), vF: new V3(), W: new V3(0, 1, 0), vW: new V3(), b: {}, prevVar: -1, kind: '', lOn: 1, L: new V3(-0.36, 0.6, 0), vL: new V3() };
MBODY.forEach(k => { MS.b[k] = 0; MS.b['v' + k] = 0; });
const _maF = new V3(), _maW = new V3(), _maA = new V3(), _maB = new V3(), _maQ = new THREE.Quaternion(), _maE = new THREE.Euler();
// a key's F or W, with 'G' the guard
const keyVec = (v, g, out) => v === 'G' ? out.set(g[0], g[1], g[2]) : out.set(v[0], v[1], v[2]);
// the value of one part at time t (a key's own time, in the track's units) along a track: through each key on a
// curve with the speed it had there (from its neighbours), none at the ends or at a key that holds
function meleeCurve(keys, t, get) {
  const n = keys.length;
  if (t <= keys[0][0]) return get(0);
  if (t >= keys[n - 1][0]) return get(n - 1);
  let i = 0; while (i < n - 2 && keys[i + 1][0] <= t) i++;
  const t0 = keys[i][0], t1 = keys[i + 1][0], d = t1 - t0, u = (t - t0) / d, u2 = u * u, u3 = u2 * u;
  const tan = j => (j <= 0 || j >= n - 1 || keys[j][4]) ? 0 : (get(j + 1) - get(j - 1)) / (keys[j + 1][0] - keys[j - 1][0]);
  return (2 * u3 - 3 * u2 + 1) * get(i) + (u3 - 2 * u2 + u) * d * tan(i) + (-2 * u3 + 3 * u2) * get(i + 1) + (u3 - u2) * d * tan(i + 1);
}
// (tracks are sampled every frame, so their keys' vectors are cached per track)
const _trkCache = new Map();
function trackVecs(keys, g) {
  let c = _trkCache.get(keys); if (c && c.g === g) return c;
  c = { g, fv: keys.map(k => keyVec(k[1], g.F, new V3())), wv: keys.map(k => keyVec(k[2], g.W, new V3()).normalize()), bv: {} };
  for (const ch of MBODY) { let cur = g.b[ch] || 0; c.bv[ch] = keys.map((k, j) => (cur = (k[1] === 'G' && (j === 0 || j === keys.length - 1)) ? (g.b[ch] || 0) : k[3] && k[3][ch] !== undefined ? k[3][ch] : cur)); }
  wayKeys(keys, c);
  _trkCache.set(keys, c); return c;
}
// the weapon's way round between two keys. Its direction is run through the keys on a curve, which takes the short way
// between two directions; but a blow turns the weapon further than that (an overhead goes from pointing behind you, up
// over the top and down in front: more than half a turn), and the short way between nearly opposite directions would
// swing it round underneath instead. So a turn of more than MWAY.step between keys gets keys put in between, and where
// it's more than MWAY.flip, which way round it goes is the arm's: halfway through, the weapon's flung out along the arm
// (it pulls straight out from the shoulder as it's swung), so it goes round the side the arm points to. c.wk, c.wkv
// are the weapon's own keys
const MWAY = { step: 1.0, flip: 1.6 };
const _wyR = new V3();
function wayKeys(keys, c) {
  const fv = c.fv, wv = c.wv, T = [], V = [], s = SHOULDER_REST.R;
  const split = (ta, a, tb, b, depth) => {
    const ang = a.angleTo(b); if (ang <= MWAY.step || depth > 3) return;
    const tm = (ta + tb) / 2, m = a.clone().add(b);
    if (ang > MWAY.flip) {
      _wyR.set(meleeCurve(keys, tm, j => fv[j].x) - s[0], meleeCurve(keys, tm, j => fv[j].y) - s[1], meleeCurve(keys, tm, j => fv[j].z) - s[2]).normalize();
      if (m.lengthSq() < 1e-4) m.copy(_wyR).addScaledVector(a, -_wyR.dot(a));   // (dead opposite: straight out along the arm)
      else if (m.dot(_wyR) < 0) m.negate();
    }
    m.normalize();
    split(ta, a, tm, m, depth + 1); T.push([tm, 0, 0, 0, 0]); V.push(m); split(tm, m, tb, b, depth + 1);
  };
  keys.forEach((k, j) => { if (j) split(keys[j - 1][0], wv[j - 1], k[0], wv[j], 0); T.push([k[0], 0, 0, 0, k[4] || 0]); V.push(wv[j]); });
  c.wk = T; c.wkv = V;
}
function sampleFast(keys, g, tF, tW, tB, oF, oW, ob) {
  const c = trackVecs(keys, g), fv = c.fv, wk = c.wk, wv = c.wkv;
  oF.set(meleeCurve(keys, tF, j => fv[j].x), meleeCurve(keys, tF, j => fv[j].y), meleeCurve(keys, tF, j => fv[j].z));
  oW.set(meleeCurve(wk, tW, j => wv[j].x), meleeCurve(wk, tW, j => wv[j].y), meleeCurve(wk, tW, j => wv[j].z));
  if (oW.lengthSq() < 1e-6) oW.set(0, 1, 0); oW.normalize();
  for (const ch of MBODY) { const bv = c.bv[ch]; ob[ch] = meleeCurve(keys, tB, j => bv[j]); }
}
// a swing's own time (its keys') at p of the way through it, for a weapon of weight w. It lands at hit either way.
// Up to the top of the wind-up (the held key before the blow) a heavy one's slow to get moving (MHEFT.lift); from
// there to the blow it gathers speed all the way (MHEFT.fall), falling into it rather than pushed at an even pace;
// and after it the momentum carries it on, quick at first and slowing as it comes round (the same, mirrored, so it
// goes through the blow without a change of pace)
function meleeWarp(p, keys, hit, w) {
  p = clamp(p, 0, 1);
  let top = 0; for (const k of keys) if (k[4] && k[0] < hit) top = k[0];
  const a = 1 + MHEFT.fall * w * w;   // (with the square of the weight: the light and middling ones are swung, the heaviest fall)
  if (top > 0 && p <= top) return top * Math.pow(p / top, 1 + MHEFT.lift * w);
  if (p <= hit) { const u = (p - top) / (hit - top); return top + (hit - top) * Math.pow(u, a); }
  const u = (p - hit) / (1 - hit); return hit + (1 - hit) * (1 - Math.pow(1 - u, a));
}
// the next swing: one of the style's three, never the same one twice running
export function pickSwing(D) {
  const n = (MSWINGS[meleeStyle(D)] || MSWINGS.swing).length;
  let v = (rand() * (n - 1)) | 0; if (v >= MS.prevVar && MS.prevVar >= 0) v++; v = Math.min(n - 1, v);
  MS.prevVar = v; W8.swingVar = v;
  return (MSWINGS[meleeStyle(D)] || MSWINGS.swing)[v];
}
const meleeStyle = D => heavySwing(D) ? 'heavy' : D.style === 'slash' ? 'slash' : 'swing';
export const curSwing = D => { const s = MSWINGS[meleeStyle(D)] || MSWINGS.swing; return s[clamp(W8.swingVar | 0, 0, s.length - 1)]; };
// a blow landing (melee/melee.js): the swing stopped on it a moment and the springs thrown back off it; hard is how
// solid (1 for a hit, less for the ground)
export function meleeImpact(heavy, hard) {
  const w = meleeWeight(curId())[0], rb = hard * (1 - MSTOP.bounce * w);
  ANIM.mStop = Math.max(ANIM.mStop || 0, mix(MSTOP.light, MSTOP.heavy, w) * hard);
  MS.vF.multiplyScalar(-0.3 * rb); MS.vW.multiplyScalar(-0.45 * rb);
  const b = MS.b; b.vuy *= -0.25 * hard; b.vhy *= -0.2; b.vux -= 1.4 * hard; b.vdip += (heavy ? 1.6 : 0.6) * hard;
}
// the arm's angles for a fist at F holding a weapon pointing W (upper-body space): rx, ry aim the arm at the fist and
// sc stretches or shortens it to reach (within MREACH: short, it reads as the elbow bent); the arm's roll rz and the
// weapon's tilt in the fist hrx point the weapon, allowing for the arm being thinner across (ARM_THIN) than it is
// long. Of the two ways to hold it pointing the same way (rolled over or not: the same, but for the weapon turned half
// a turn round its own handle), the one with the least roll; but through a swing, a draw or a bash (keep) whichever
// is nearer the last frame's, so the roll runs on smoothly past a quarter turn and back (a blow ends where it began),
// and at rest the one it was on until the roll's MROLL_GIVE past a quarter turn: either way never the axe's head
// flipped round the handle in a frame and back. The
// weapon hangs off the arm, so it's scaled back by wy, wz along its length and across it to keep its own size
// (melee/melee-models.js built them on an arm ARM_THIN thick and FIST long)
const MREACH = [0.62, 1.42], MROLL_GIVE = 0.6, MROLL_SING = 0.45, MROLL_RATE = 9, MROLL_BACK = 0.8, MTILT_RATE = 12;
// the forearm's roll, the weapon's tilt and its turn in the fist each follow where they're wanted on a critically
// damped spring (MTURN: how quick, a second), capped at their own pace (rate, radians a second), so a turn gathers
// speed and eases to a stop instead of starting and stopping dead at a fixed rate; the short way round (a whole turn
// is no turn)
const MTURN = 24;
function angSpring(o, k, kv, want, rate, dt) {
  const v = clamp((o[kv] || 0) + (MTURN * MTURN * angDiff(want, o[k]) - 2 * MTURN * (o[kv] || 0)) * dt, -rate, rate);
  o[kv] = v; return o[k] + v * dt;
}
function meleeSolve(F, Wd, out, keep, dt) {
  const s = SHOULDER_REST.R, dx = F.x - s[0], dy = F.y - s[1], dz = F.z - s[2], len = Math.hypot(dx, dy, dz) || 1;
  out.rx = Math.atan2(-dy / len, dz / len); out.ry = Math.asin(clamp(dx / len, -1, 1)); out.sc = clamp(len / FIST, MREACH[0], MREACH[1]);
  _maQ.setFromEuler(_maE.set(out.rx, out.ry, 0)).invert();
  const w = _maB.copy(Wd).applyQuaternion(_maQ), c = Math.hypot(w.x, w.y);
  let rz = Math.atan2(-w.x, w.y), cy = c;
  if (Math.abs(rz) > Math.PI / 2) { rz = rz > 0 ? rz - Math.PI : rz + Math.PI; cy = -c; }
  if (out.rz !== undefined) {   // (staying on the way round it was: the least roll plus whole half turns, nearest the last frame's)
    const k = Math.round((out.rz - rz) / Math.PI), r2 = rz + k * Math.PI;
    if (k && (keep || Math.abs(r2) < Math.PI / 2 + MROLL_GIVE)) { rz = r2; if (k & 1) cy = -cy; }
    // with the weapon nearly in line with the arm the roll that points it is all but free, and the least turn of the
    // weapon swings it a long way from one frame to the next (spinning the axe's head round its handle): there it
    // holds the roll it had, more firmly the nearer in line it is (MROLL_SING), and the weapon's tilt in the fist does
    // the pointing
    if (c < MROLL_SING) rz = out.rz + angDiff(rz, out.rz) * smooth(c / MROLL_SING);
    // and the forearm only turns so fast (MROLL_RATE a second): a roll the pointing wants quicker than that it catches
    // up with over the next frames, the weapon lagging a touch off its line meanwhile, rather than the head whipping
    // round the handle in a frame or two
    if (dt > 0) rz = angSpring(out, 'rz', 'vrz', rz, fpOn() ? FP_MSWING.roll : MROLL_RATE, dt);   // (the short way round: a whole turn is no turn)
    cy = -w.x * Math.sin(rz) + w.y * Math.cos(rz);
  }
  if (!keep) rz = Math.atan2(Math.sin(rz), Math.cos(rz));   // (at rest, whole turns it's run up taken back off: the same roll)
  out.rz = rz; let hrx = Math.atan2(w.z / out.sc, cy / ARM_THIN);
  // and the weapon's tilt in the fist only turns so fast too (MTILT_RATE a second): with the forearm lagging its roll,
  // the weapon can come to lie near square across it, where the least change in the roll swings the tilt that points
  // it half way round in a frame, flipping the weapon over in the hand; held to its pace it lags a moment instead
  if (dt > 0 && out.hrx !== undefined) hrx = angSpring(out, 'hrx', 'vhrx', hrx, MTILT_RATE, dt);
  out.hrx = hrx;
  const sh = Math.sin(out.hrx), ch = Math.cos(out.hrx);
  out.wy = ARM_THIN / Math.hypot(ARM_THIN * ch, out.sc * sh); out.wz = 1 / Math.hypot(ARM_THIN * sh, out.sc * ch);
  return out;
}
// running with it: a one-hander carried down at your side, the arm pumping like a runner's and the weapon riding
// forward along the forearm; the two-handers held across the chest (port arms), both hands on, the tip swaying a
// little with the stride. F and W into f, w
const MRUN = { pump: 0.42, lean: 0.28, w1: 0.95, port: { F: [0.1, 0.98, 0.26], W: [-0.55, 0.7, 0.46] } };
function meleeRun(kind, ph, f, w) {
  if (kind === 'club' || kind === 'machete') {
    const s = SHOULDER_REST.R, th = MRUN.lean - MRUN.pump * Math.sin(ph), fi = th + MRUN.w1;   // (angles forward from straight down)
    f.set(s[0] + 0.02, s[1] - 0.46 * Math.cos(th), s[2] + 0.46 * Math.sin(th)); w.set(0.05, -Math.cos(fi), Math.sin(fi));
  } else { const P_ = MRUN.port; f.set(P_.F[0], P_.F[1], P_.F[2]); w.set(P_.W[0] + 0.05 * Math.sin(ph), P_.W[1], P_.W[2]); }
}
// this frame's melee pose: what the swing, the draw or the bash wants, run through the springs. Returns the solved
// arm and weapon angles and the body (MS.b)
const _mSol = { rx: 0, ry: 0, sc: 1, rz: 0, hrx: 0, wy: 1, wz: 1 }, _mTB = {};
export function meleePose(id, D, rdt, now, sh) {
  const kind = meleeKind(id), g = MGUARD[kind];
  if (MS.kind !== kind) { MS.kind = kind; MS.F.set(g.F[0], g.F[1], g.F[2]); MS.W.set(g.W[0], g.W[1], g.W[2]).normalize(); MS.vF.set(0, 0, 0); MS.vW.set(0, 0, 0); MBODY.forEach(k => { MS.b[k] = g.b[k] || 0; MS.b['v' + k] = 0; }); }
  _maF.set(g.F[0], g.F[1], g.F[2]); _maW.set(g.W[0], g.W[1], g.W[2]).normalize(); MBODY.forEach(k => { _mTB[k] = g.b[k] || 0; });
  const dur = W8.swingDur || 0.5;
  if (sh) {
    // the bash, over the shove's time
    const keys = D.two ? MBASH.two : MBASH.one, p = clamp(P.shove.t / P.shove.dur, 0, 1), L = P.shove.dur;
    sampleFast(keys, g, p + MCHAIN.F / L, p + MCHAIN.W / L, p + MCHAIN.body / L, _maF, _maW, _mTB);
  } else if (W8.swing > 0) {
    // the swing, run on the weapon's weight (meleeWarp): the same keys, landing at the same moment, but a heavy one
    // heaved up slowly, falling faster and faster into the blow and carried on by it, a light one flicked through
    const p = 1 - W8.swing / dur, sw = curSwing(D), wt = meleeWeight(id), hit = heavySwing(D) ? HEAVY.hit : 0.4, wp = t => meleeWarp(t, sw.keys, hit, wt[0]);
    sampleFast(sw.keys, g, wp(p + MCHAIN.F / dur), wp(p + MCHAIN.W / dur), wp(p + MCHAIN.body / dur), _maF, _maW, _mTB);
    // more of the body in a heavy one, more arm and wrist in a light one (the turn, the lean and the knees; not the step
    // in, which goes with how far the weapon reaches)
    const bs = mix(MHEFT.body[0], MHEFT.body[1], wt[0]); MBODY.forEach(k => { if (k === 'step') return; const g0 = g.b[k] || 0; _mTB[k] = g0 + (_mTB[k] - g0) * bs; });
    // out in front, the arm throws itself out to its full length (MEXTEND), so the blow reaches as far as it hits
    const s = SHOULDER_REST.R, fz = _maF.z - s[2]; if (fz > 0) { const k = 1 + MEXTEND * clamp(fz / 0.5, 0, 1); _maF.set(s[0] + (_maF.x - s[0]) * k, s[1] + (_maF.y - s[1]) * k, s[2] + fz * k); }
    // a heavy head sags under its own weight wherever it's moving slowly (at the top of the wind-up, coming back)
    const slow = 1 - smooth(clamp(MS.vW.length() / 6, 0, 1)); _maW.y -= MHEFT.sag * wt[0] * wt[1] * slow; _maW.normalize();
    if (fpOn()) fpSwing(_maF, _maW, g);
  } else if (ANIM.mDrawT !== undefined && ANIM.mDrawT >= 0) {
    // the flourish
    const fl = MDRAW[kind], t = ANIM.mDrawT;
    if (t >= fl.dur) ANIM.mDrawT = undefined;
    else sampleFast(fl.keys, g, t + MCHAIN.F, t + MCHAIN.W, t + MCHAIN.body, _maF, _maW, _mTB);
  }
  // it starts as the hand closes on the weapon (until then the arm's putting the old one away and reaching for this
  // one: player/swap.js), at the swap's pace while the swap's on
  if (ANIM.mDrawT !== undefined && (!swapSt || swapSt.t >= SWAP_T.cross)) {
    const t0 = ANIM.mDrawT, snd = MDRAW[kind].snd; ANIM.mDrawT += rdt * (swapSt ? S.swapMul : 1);
    if (t0 < snd && ANIM.mDrawT >= snd) { if (D.blunt) SFX.swingBlunt(false); else SFX.swingBlade(false); }
    if (W8.swing > 0 || sh) ANIM.mDrawT = undefined;   // a swing or a bash straight away cuts it short (the springs carry it over)
  }
  // a two-hander's left hand: off the handle through the flourish until its L, then onto it (player/hold.js)
  { const L = MDRAW[kind].L; MS.lOn = ANIM.mDrawT !== undefined && L ? smooth(clamp((ANIM.mDrawT - L[0]) / (L[1] - L[0]), 0, 1)) : 1; }
  // between swings: the guard holds steady in the hands, the chest's own bob carrying it (the fist doesn't bob on
  // top of that); walking, the tip only sways a little side to side with the stride. At a sprint it's carried
  // (meleeRun) instead, eased in with the low ready (ANIM.ready, player/sprint.js)
  if (!(W8.swing > 0) && !sh) {
    const run = Math.min(1, Math.hypot(P.vx || 0, P.vz || 0) / 3), ph = P.phase || 0;
    _maF.y += Math.sin(now * 1.7) * 0.004;
    _maW.x += Math.sin(ph) * 0.035 * run + Math.sin(now * 0.9) * 0.008; _maW.normalize();
    const rd = smooth(clamp(ANIM.ready || 0, 0, 1)) * (ANIM.mDrawT === undefined ? 1 : 0);
    if (rd > 0.001) { meleeRun(kind, ph, _maA, _maB); _maF.lerp(_maA, rd); _maW.lerp(_maB, rd).normalize(); }
  }
  // looked over (player/inspect.js): its poses blended in as the look comes in and out
  { const wI = !(W8.swing > 0) && !sh && ANIM.mDrawT === undefined ? smooth(clamp(inspectBlend(), 0, 1)) : 0;
    if (wI > 0.001) { const o = minspectAt(minspectSet(kind), g, Math.max(0, inspectT()), _maA, _maB); _maF.lerp(_maA, wI); _maW.lerp(_maB, wI).normalize(); _mTB.uy = (_mTB.uy || 0) + o.uy * wI; MS.ir = (o.r % (2 * Math.PI)) * wI; MS.ihp = o.hp * wI; MS.ihy = o.hy * wI; }
    else MS.ir = MS.ihp = MS.ihy = 0; }
  // the springs, a few small steps a frame so the stiff ones stay steady
  // (the fist's and the weapon's by its weight: a light one stiff and well damped, a heavy one looser, lagging into a
  // swing and carrying on past where it's sent)
  if (rdt > 0) {
    const n = Math.ceil(rdt / (1 / 240)), h = rdt / n, S_ = MSPRING, w = meleeWeight(id)[0];
    const kW = S_.W[0] * mix(MHEFT.wK[0], MHEFT.wK[1], w), cW = 2 * mix(MHEFT.wZeta[0], MHEFT.wZeta[1], w) * Math.sqrt(kW);
    const kF = S_.F[0] * mix(MHEFT.fK[0], MHEFT.fK[1], w), cF = S_.F[1] * Math.sqrt(kF / S_.F[0]);
    for (let i = 0; i < n; i++) {
      MS.vF.addScaledVector(_maB.copy(MS.F).sub(_maF), -kF * h).addScaledVector(MS.vF, -cF * h); MS.F.addScaledVector(MS.vF, h);
      MS.vW.addScaledVector(_maB.copy(MS.W).sub(_maW), -kW * h).addScaledVector(MS.vW, -cW * h); MS.W.addScaledVector(MS.vW, h);
      for (const k of MBODY) { const sp = k === 'uy' || k === 'hy' ? S_.turn : k === 'step' || k === 'dip' ? S_.legs : S_.lean; springTo(MS.b, k, 'v' + k, _mTB[k], sp[0], sp[1], h); }
    }
  }
  // (the swing keeps to the way round it's on until it's coming back to the guard, MROLL_BACK of the way through: from
  // there the forearm turns back to the guard's own way round while the weapon's still on the move, never at rest)
  const back = W8.swing > 0 && 1 - W8.swing / dur > MROLL_BACK;
  const out = meleeSolve(MS.F, _maA.copy(MS.W).normalize(), _mSol, (W8.swing > 0 && !back) || !!sh || ANIM.mDrawT !== undefined, rdt);
  meleeTwist(out, D, id, sh, dur, g, rdt);
  out.tw += MS.ir || 0;   // (turned in the fist to show it while it's looked over)
  return out;
}
// the weapon turned in the fist about its own handle (tw) so its edge (the axe's bit, the blade's edge: +z, melee/
// melee-models.js) faces where it should. The arm alone only points the weapon, and the edge then faces however the
// forearm happens to be turned, which rolls the axe's head round sideways as the arm comes through. In a swing the edge
// faces the way the head's going along the swing's keys at each moment (look: how far ahead and behind that's taken),
// turned round to the blow's way while it's being drawn back or brought back (n: the way the head travels through the
// fast part, the blow; still: under how far it's moving that the blow's way is kept), so it leads the blow all round
// its arc and trails as it's drawn back; between swings it faces the way it does in the guard (guardEdge), however the
// forearm's turned by then. Always square to the handle, eased from the one to the other over the start and the end of
// a swing (in, out), and always the short way round from where it's turned now, at most MTWIST.rate a second
const MTWIST = { rate: 16, in: 0.14, out: [0.86, 1], look: 0.03, still: 0.08 }, _mtN = new V3(), _mtA = new V3(), _mtB = new V3(), _mtE = new V3(), _mtQ = new THREE.Quaternion(), _mtR = new THREE.Euler(), _mtX = {};
function meleeTwist(out, D, id, sh, dur, g, rdt) {
  if (MS.twKind !== MS.kind) { MS.twKind = MS.kind; MS.tw = 0; MS.twP = undefined; MS.twG = guardEdge(g, new V3()); }
  const tw = MS.tw || 0;
  _mtE.copy(MS.twG);   // (the way the edge faces in the guard)
  if (W8.swing > 0 && !sh && !fpOn()) {   // (from your own eyes it stays turned in the fist as it is in the guard, swung round by the arm alone: FP_MSWING)
    const p = 1 - W8.swing / dur, sw = curSwing(D), fw = sw.fast, wt = meleeWeight(id), hit = heavySwing(D) ? HEAVY.hit : 0.4, wp = t => meleeWarp(t, sw.keys, hit, wt[0]), L = meleeLen(id);
    if (MS.twP === undefined || p < MS.twP || MS.twSw !== sw) {   // (a new swing: the way its blow goes)
      sampleFast(sw.keys, g, wp(fw[0]), wp(fw[0]), wp(fw[0]), _mtA, _mtB, _mtX); _mtN.copy(_mtA).addScaledVector(_mtB, -L);
      sampleFast(sw.keys, g, wp(fw[1]), wp(fw[1]), wp(fw[1]), _mtA, _mtB, _mtX); _mtN.add(_mtA.addScaledVector(_mtB, L));
      MS.twOk = _mtN.lengthSq() > 0.01; if (MS.twOk) MS.twN = (MS.twN || new V3()).copy(_mtN.normalize());
      MS.twSw = sw;
    }
    MS.twP = p;
    if (MS.twOk) {
      const d = MTWIST.look;
      sampleFast(sw.keys, g, wp(p + d), wp(p + d), wp(p + d), _mtA, _mtB, _mtX); _mtN.copy(_mtA).addScaledVector(_mtB, L);
      sampleFast(sw.keys, g, wp(p - d), wp(p - d), wp(p - d), _mtA, _mtB, _mtX); _mtN.sub(_mtA.addScaledVector(_mtB, L));
      const sp = _mtN.length(); if (_mtN.dot(MS.twN) < 0) _mtN.negate();
      _mtN.normalize().lerp(MS.twN, 1 - smooth(clamp(sp / MTWIST.still, 0, 1)));
      _mtE.lerp(_mtN, smooth(clamp(p / MTWIST.in, 0, 1)) * (1 - smooth(clamp((p - MTWIST.out[0]) / (MTWIST.out[1] - MTWIST.out[0]), 0, 1))));
    }
  } else MS.twP = undefined;
  // the edge wanted, square to the handle, into the weapon's frame (the arm's turn, its roll, the tilt in the fist),
  // and the turn about the handle that brings +z onto it, the short way from where it's turned now
  let want = tw;
  _mtB.copy(MS.W).normalize(); _mtA.copy(_mtE).addScaledVector(_mtB, -_mtB.dot(_mtE));
  if (_mtA.lengthSq() > 0.02) {
    _mtQ.setFromEuler(_mtR.set(out.rx, out.ry, out.rz)).invert(); _mtA.applyQuaternion(_mtQ).applyAxisAngle(_mtB.set(1, 0, 0), -out.hrx);
    want = tw + angDiff(Math.atan2(_mtA.x, _mtA.z), tw);
  }
  const r = fpOn() ? FP_MSWING.twist : MTWIST.rate, dt = Math.max(rdt, 1 / 240), v = clamp((MS.vtw || 0) + (MTURN * MTURN * (want - tw) - 2 * MTURN * (MS.vtw || 0)) * dt, -r, r);
  MS.vtw = v; out.tw = MS.tw = tw + v * dt;
}
// which way the edge faces with the weapon in the guard and not turned in the fist (the arm's own hold of it)
function guardEdge(g, o) {
  const r = meleeSolve(_mtA.set(g.F[0], g.F[1], g.F[2]), _mtB.set(g.W[0], g.W[1], g.W[2]).normalize(), {}, false, 0);
  return o.set(0, 0, 1).applyAxisAngle(_mtA.set(1, 0, 0), r.hrx).applyQuaternion(_mtQ.setFromEuler(_mtR.set(r.rx, r.ry, r.rz)));
}
