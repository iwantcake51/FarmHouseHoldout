// Leaning (Q and E to start with: input/keybinds.js): round a corner from the hips, the upper body tilted that way, the
// head, the arms and the gun with it, so your eyes and the gun go out past the corner (in first person the view's
// carried on the head: game/view-cam.js) and everyone else sees you do it (your pose: net/avatars.js), the view rolled
// a little with it; eased in and out. Pressed, it stays till it's pressed again or the other way; set to Hold in the
// settings (ui/settings.js), only while the key's held. Never through a wall: it goes only as far as there's room. A
// sprint, a vault or going down straightens you up, and leaning you walk a little slower unless you're down the sights.

import { clamp } from '../core/math.js';
import { ci } from '../world/grid.js';
import { bulletBlocked, hardBlocked } from '../world/collision.js';
import { P } from './player.js';
import { SET } from '../ui/settings.js';

// how far over (rad, at the hips: hip, m up), how far your eyes go out to the side and down with it (m), how much the view rolls with it (rad), how fast it eases (per s), the share
// of your walking pace it costs from the hip, and where to the side it checks for room (m, out from your middle)
const LEAN = { tilt: 0.3, hip: 0.62, eye: 0.32, drop: 0.06, roll: 0.14, ease: 9, slow: 0.2, room: [0.32, 0.58] };
// which way it's meant to go (t: -1 left, 1 right, 0 straight), how far over it is now (v, eased), and which keys are
// held (Hold: 1 left, 2 right)
const LEAN_S = { t: 0, v: 0, held: 0 };
export function leanKey(dir, down) {
  if (P.dead) return;
  if (SET.lean === 'hold') {
    const bit = dir < 0 ? 1 : 2;
    LEAN_S.held = down ? LEAN_S.held | bit : LEAN_S.held & ~bit;
    LEAN_S.t = down ? dir : LEAN_S.held & 1 ? -1 : LEAN_S.held & 2 ? 1 : 0;
  } else if (down) LEAN_S.t = LEAN_S.t === dir ? 0 : dir;
}
// each frame (player/animation.js): straightened up by a sprint, a vault or going down; as far over as there's room
// for at the side it's going (yaw: the way you face)
export function leanStep(dt, yaw) {
  if (P.dead || P.vault || P.sprint) { LEAN_S.t = 0; LEAN_S.held = 0; }
  let want = LEAN_S.t;
  if (want) {
    const rx = -Math.cos(yaw) * want, rz = Math.sin(yaw) * want, [a, b] = LEAN.room;
    const shut = d => { const x = P.x + rx * d, z = P.z + rz * d; return bulletBlocked(x, z) || hardBlocked(ci(x), ci(z)); };
    want *= shut(a) ? 0.2 : shut(b) ? 0.6 : 1;
  }
  LEAN_S.v += (want - LEAN_S.v) * (1 - Math.exp(-dt * LEAN.ease));
  if (Math.abs(LEAN_S.v) < 1e-4) LEAN_S.v = 0;
}
// the upper body tipped over at the hips (rather than at its feet, where it's hung): turned about z and moved so the
// hips stay put
export function leanBody(pm) {
  const a = LEAN_S.v * LEAN.tilt; if (!a) return;
  pm.upper.rotation.z += a; pm.upper.position.x += LEAN.hip * Math.sin(a); pm.upper.position.y += LEAN.hip * (1 - Math.cos(a));
}
// your eyes out to the side with it, in first person (game/view-cam.js: the arms and the gun are carried on the view,
// so they go too; yaw, the way you look)
export function leanEye(e, yaw) {
  const a = LEAN_S.v; if (!a) return;
  e.x += -Math.cos(yaw) * a * LEAN.eye; e.z += Math.sin(yaw) * a * LEAN.eye; e.y -= Math.abs(a) * LEAN.drop;
}
// the view's roll with it (game/view-cam.js), and your pace leaning (player/movement.js)
export const leanRoll = () => -LEAN_S.v * LEAN.roll;
export const leanPace = aimed => aimed ? 1 : 1 - LEAN.slow * clamp(Math.abs(LEAN_S.v), 0, 1);
