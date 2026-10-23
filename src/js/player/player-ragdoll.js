// Survivors go down the way the zombies do: the same ragdoll (makeRagdoll, zombies/deaths.js), built off the survivor's
// rig as it stands the moment they fall (yours, PM; a co-op teammate's, their avatar: net/avatars.js), thrown by the hit
// that dropped them and on along the way they were going, and left lying where it lands till they're back on their feet

import { P, pBlob, PM } from './player.js';
import { makeRagdoll } from '../zombies/deaths.js';
import { ANIM } from './animation.js';

// how hard the last hit throws you (force, as a zombie's weapon force); how the survivor's rig differs from a zombie's
// (its upper body sits at the hips' own height, its arms are one piece: upY, noFore); how much faster than the slowed
// death clock your own falls (DEATH_RATE, ui/screens.js), so it lands as the world stops
export const PRAG = { force: 2.6, upY: 0, step: 1.3, list: [] };
const PRAG_PARTS = ['g', 'upper', 'lower', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'shinL', 'shinR'];
// rig: the survivor's parts by name (PM, or an avatar's); dx, dz: the way the hit throws it; vx, vz: how fast it was going
export function survivorRagdoll(rig, x, z, face, vx, vz, dx, dz, blob) {
  // what's posed, to put back as it was once they're up again
  const keep = PRAG_PARTS.map(k => rig[k] && [rig[k], rig[k].position.clone(), rig[k].quaternion.clone(), rig[k].scale.clone()]).filter(Boolean);
  // (the bob, lean and reach of the upper and lower body taken out, and the arms back at the shoulders, as the rig's built)
  rig.upper.position.set(0, 0, 0); rig.lower.position.set(0, 0, 0); rig.armL.position.set(-0.33, 1.08, 0); rig.armR.position.set(0.33, 1.08, 0);
  const m = { g: rig.g, lower: rig.lower, upper: rig.upper, head: rig.head, armL: rig.armL, armR: rig.armR, legL: rig.legL, legR: rig.legR, shinL: rig.shinL, shinR: rig.shinR, mats: rig.mats || {}, eyes: null };
  const body = { m, T: { scale: 1 }, limbs: { head: 1, armL: 1, armR: 1, legL: 1, legR: 1 }, cut: {}, vx: vx || 0, vz: vz || 0, face, spurts: [], x, z, vis: 1, burn: 0, flash: 0, blob: blob || null };
  const r = makeRagdoll(body, dx, dz, 'torso', PRAG.force, null, { upY: PRAG.upY, noFore: true, list: PRAG.list });
  r.keepPose = keep;
  return r;
}
// up again: the body comes off the floor and the rig goes back to how it's built (the animation takes it from there)
export function endSurvivorRagdoll(r) {
  if (!r) return;
  for (const [o, p, q, s] of r.keepPose) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  const k = PRAG.list.indexOf(r); if (k >= 0) PRAG.list.splice(k, 1);
}
// yours: thrown away from what hit you (P.hitFrom, the way it was facing), or back off your aim if nothing did
export function ragYou() {
  const a = P.hitFrom === undefined ? ANIM.yaw + Math.PI : P.hitFrom, dx = Math.sin(a), dz = Math.cos(a);
  PRAG.me = survivorRagdoll(PM, P.x, P.z, ANIM.yaw, P.vx, P.vz, dx, dz, pBlob);
}
export function unragYou() { endSurvivorRagdoll(PRAG.me); PRAG.me = null; }
