// Where the support fist sits on a long gun: up against the underside of the fore-end (halfway up the post, on a gun
// with a vertical foregrip), so the gun lies in the hand rather than floating over it. The fore-end's underside is
// found once per gun model by casting a ray up at it from below the hold point (gripShape); foreDrop is how far
// under the hold point player/hold.js aims the fist. A gun's low (player/hold.js HOLD) takes it further down: the pump's
// fist wraps under its slim forend, rather than its forearm riding up the side of the gun.
import { V3 } from '../core/renderer.js';
import { HAND_DROP, holdOf } from './hold.js';

const GRIP_PALM = 0.054;   // the fist's middle this far under the underside puts the top of the hand against it
const _gRc = new THREE.Raycaster(), _gO = new V3(), _gD = new V3(), _gHit = new V3();
function gripShape(s, H) {
  const h = holdOf(s, 'R'), u = h.userData;
  if (u.grip && u.gripFor === H) return u.grip;
  return measureGrip(h, H) || { drop: null };
}
// measured as the gun's built (weapons/build-weapons.js: buildGuns), from its own fresh pieces before anything's
// folded together or swapped about, and kept for as long as that model lasts: measured later, part way through its
// pieces being folded (a gun built in play folds a moment after, weapons/build-weapons.js unfightSoon), the ray could
// miss the foregrip and find something above it, and the hand was put up there for good
export function measureGrip(h, H) {
  if (!H || H.kind !== 'long' || !H.fore) return null;
  const u = h.userData;
  h.updateMatrixWorld(true);
  // (the gun's own pieces only: a light or a laser hung under the handguard isn't what the hand holds, and it went down
  // under it before, lower with each one fitted)
  const meshes = []; h.traverseVisible(o => { if (o.isMesh && !attOf(o, h)) meshes.push(o); });
  _gO.set(H.fore[0], H.fore[1] - 0.3, H.fore[2]); h.localToWorld(_gO); _gD.set(0, 1, 0).transformDirection(h.matrixWorld); _gRc.set(_gO, _gD); _gRc.far = 0.6;
  // (every face counts, whichever way it's wound: a gun built in its mirrored hand group, flipIn, has its pieces' faces
  // turned inside out to the ray until they're folded together, so a one-sided test went straight up through the
  // underside of a foregrip and found whatever was above it, a can or a light, and the hand was put up there, kept so)
  const sides = new Map(); meshes.forEach(o => { const m = o.material; if (m && !Array.isArray(m) && !sides.has(m)) { sides.set(m, m.side); m.side = THREE.DoubleSide; } });
  const hit = _gRc.intersectObjects(meshes, false).find(q => !q.object.material.transparent), yb = hit ? h.worldToLocal(_gHit.copy(hit.point)).y : null;
  sides.forEach((sd, m) => { m.side = sd; });
  // a post: the fist halfway up it; a fore-end: the top of the fist against its underside
  const g = { drop: yb === null ? null : H.post ? (H.fore[1] - yb) / 2 : H.fore[1] - yb + GRIP_PALM };
  if (g.drop !== null) { u.grip = g; u.gripFor = H; }   // (nothing found, the gun not drawn yet: tried again next time, not kept)
  return g;
}
const attOf = (o, h) => { for (let q = o; q && q !== h; q = q.parent) if (q.userData.att) return true; return false; };
export function foreDrop(s, H) {
  const hd = HAND_DROP[H.kind] || HAND_DROP.hand;
  if (H.kind !== 'long') return hd.fore;
  const g = gripShape(s, H); return (g.drop ?? hd.fore) + (H.low || 0);
}
