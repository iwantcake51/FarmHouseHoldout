// Crouching (C to start with: input/keybinds.js): down on bent knees, the hips dropped and the thighs forward, so your
// eyes (first person: game/view-cam.js carries the view on the body) and your head go low, behind cover a standing man
// shows his head over; eased down and up again. Pressed, it stays till it's pressed again; set to Hold in the settings
// (ui/settings.js), only while the key's held. Crouched you walk slower with shorter steps on your toes (a quiet step:
// player/movement.js), and a shot from the hip or the sights spreads less (weapons/firing.js). A sprint stands you up;
// a vault goes over from the crouch, eased out of it into the vault's own crouch (player/animation.js vaultPose).
// From your own eyes the head goes down and comes up with a little give: the eye on a spring that sinks a touch past
// the crouch and settles, a nod of the view as you drop and a lift as you rise, a slight roll, and the view a touch
// narrower crouched (game/view-cam.js). Everyone else sees it (your pose: net/avatars.js sends how far down you are) and their shots meet you lower
// (pvp/pvp.js).

import { clamp, smooth } from '../core/math.js';
import { P } from './player.js';
import { SET } from '../ui/settings.js';

// how far the hips drop (m), the thighs forward and the knees bent (rad, at full crouch: the feet stay under the hips),
// the chest over a little (rad), how fast it eases down and up (per s), your pace crouched (of a walk), the stride's
// size crouched (of a walk's), the footstep's loudness and the spread (both of standing)
export const CROUCH = { drop: 0.28, thigh: 1.1, knee: 2.1, chest: 0.12, down: 7, up: 6, pace: 0.55, stride: 0.6, step: 0.35, spread: 0.65 };
// the head's spring (stiffness, damping: a little under critical, so it carries just past and settles), how much of its
// lag and overshoot the eye takes (of the drop), how far the view nods and rolls with its speed (rad per share a
// second) and how much narrower the view is crouched (of its width)
const CR_HEAD = { k: 150, z: 0.85, eye: 0.25, nod: 0.008, roll: 0.002, fov: 0.03 };   // (gentle: the head's moving up to about 4 shares a second, so at its fastest the view nods under 2 degrees)
// the arms and gun from your own eyes crouched (game/view-cam.js): canted in a little toward the middle (cant, rad: less
// down the sights, adsKeep of it), and on the way down and up lagging the head, up and back a touch then settling
// (lift: m, pitch and roll: rad, each per share a second of the head's speed)
const CR_ARMS = { cant: 0.1, adsKeep: 0.25, lift: 0.005, pitch: 0.012, roll: 0.012 };
// wanted (t: 0 or 1), how far down now (v, eased), held (Hold), and how far down a vault began (vv: player/animation.js
// eases out of it through the vault's run-up)
export const CR = { t: 0, v: 0, held: false, vv: 0, e: 0, ev: 0 };
export function crouchKey(down) {
  if (P.dead) return;
  if (SET.crouch === 'hold') { CR.held = down; CR.t = down ? 1 : 0; }
  else if (down) CR.t = CR.t ? 0 : 1;
  if (CR.t && P.sprint) P.sprint = false;   // (down out of a run: player/sprint.js won't run you crouched)
}
// stood up at once (a new round, a new life)
export function crouchReset() { CR.t = 0; CR.v = 0; CR.held = false; CR.vv = 0; CR.e = 0; CR.ev = 0; P.cr = 0; }
// each frame (player/animation.js): a sprint stands you up (held too: let go and press it again to go back down), a
// vault takes you out of it (over and up), and dead you're not
export function crouchStep(dt) {
  if (P.dead) { CR.t = 0; CR.held = false; }
  if (P.sprint) { CR.t = 0; CR.held = false; }
  if (P.vault) { if (!CR.vv && CR.v > 0.02) CR.vv = CR.v; CR.t = 0; CR.v = 0; }
  else {
    CR.vv = 0;
    const k = CR.t > CR.v ? CROUCH.down : CROUCH.up;
    CR.v += (CR.t - CR.v) * (1 - Math.exp(-dt * k));
    if (Math.abs(CR.t - CR.v) < 1e-3) CR.v = CR.t;
  }
  P.cr = CR.v;   // (for the bots, the net and the hits: how far down, 0 to 1)
  // the head on its spring after the body's crouch (substeps, so a slow frame doesn't blow it up)
  const tg = P.vault ? 0 : crouchK(), w = Math.sqrt(CR_HEAD.k);
  for (let n = Math.ceil(Math.min(dt, 0.05) / (1 / 120)) || 0, h = Math.min(dt, 0.05) / (n || 1), i = 0; i < n; i++) { CR.ev += (CR_HEAD.k * (tg - CR.e) - 2 * CR_HEAD.z * w * CR.ev) * h; CR.e += CR.ev * h; }
  if (P.vault || P.dead) { CR.e = tg; CR.ev = 0; }   // (the vault's own camera has it then)
}
// first person (game/view-cam.js): the eye's give past the body's crouch (m, down), the view's nod and roll with the
// head's speed (rad) and its width crouched (a share)
export const crouchEyeY = () => -(CR.e - crouchK()) * CROUCH.drop * CR_HEAD.eye;
export const crouchNod = () => -CR.ev * CR_HEAD.nod, crouchRoll = () => CR.ev * CR_HEAD.roll;
export const crouchFov = () => 1 - CR_HEAD.fov * crouchK();
// the arms' cant and their lag through the move: [roll, lift, pitch] (ads: how far down the sights)
export const crouchArms = ads => [CR_ARMS.cant * crouchK() * (1 - (1 - CR_ARMS.adsKeep) * ads) + CR.ev * CR_ARMS.roll, CR.ev * CR_ARMS.lift, CR.ev * CR_ARMS.pitch];
// the share of it, eased at both ends (the pose's)
export const crouchK = () => smooth(clamp(CR.v, 0, 1));
// your pace (player/movement.js), the stride's size (player/animation.js), a footstep's loudness and your spread
export const crouchPace = () => 1 - (1 - CROUCH.pace) * crouchK();
export const crouchStride = () => 1 - (1 - CROUCH.stride) * crouchK();
export const crouchQuiet = () => 1 - (1 - CROUCH.step) * crouchK();
export const crouchSpread = () => 1 - (1 - CROUCH.spread) * crouchK();
// crouched you're braced: the gun's sway and wander (from the hip and down the sights or a scope) shrink to steady of
// standing, and each shot's kick (the view's climb and the gun's jump in your hands) to kick of it
const CR_BRACE = { steady: 0.6, kick: 0.85 };
export const crouchSteady = () => 1 - (1 - CR_BRACE.steady) * crouchK();
export const crouchKick = () => 1 - (1 - CR_BRACE.kick) * crouchK();
// the legs bent and the hips down (player/animation.js, after the stride: added over it, the stride shortened). k:
// how far down
export function crouchLegs(pm, k) {
  if (k <= 0.001) return;
  const C = CROUCH;
  pm.legL.rotation.x -= C.thigh * k; pm.legR.rotation.x -= C.thigh * k * 0.96;
  pm.shinL.rotation.x += C.knee * k; pm.shinR.rotation.x += C.knee * k * 0.95;
  pm.g.position.y -= C.drop * k;
}
