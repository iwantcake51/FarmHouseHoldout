// Where the support fist sits on a long gun: up against the underside of the fore-end (halfway up the post, on a gun
// with a vertical foregrip), so the gun lies in the hand rather than floating over it. The fore-end's underside is
// found once per gun model by casting a ray up at it from below the hold point (gripShape); foreDrop is how far
// under the hold point player/hold.js aims the fist.
const GRIP_PALM = 0.054;   // the fist's middle this far under the underside puts the top of the hand against it
const _gRc = new THREE.Raycaster(), _gO = new V3(), _gD = new V3(), _gHit = new V3();
function gripShape(s, H) {
  const h = holdOf(s, 'R'), u = h.userData;
  if (u.grip && u.gripFor === H) return u.grip;
  h.updateMatrixWorld(true);
  const meshes = []; h.traverseVisible(o => { if (o.isMesh) meshes.push(o); });
  _gO.set(H.fore[0], H.fore[1] - 0.3, H.fore[2]); h.localToWorld(_gO); _gD.set(0, 1, 0).transformDirection(h.matrixWorld); _gRc.set(_gO, _gD); _gRc.far = 0.6;
  const hit = _gRc.intersectObjects(meshes, false)[0], yb = hit ? h.worldToLocal(_gHit.copy(hit.point)).y : null;
  // a post: the fist halfway up it; a fore-end: the top of the fist against its underside
  const g = { drop: yb === null ? null : H.post ? (H.fore[1] - yb) / 2 : H.fore[1] - yb + GRIP_PALM };
  u.grip = g; u.gripFor = H; return g;
}
function foreDrop(s, H) {
  const hd = HAND_DROP[H.kind] || HAND_DROP.hand;
  if (H.kind !== 'long') return hd.fore;
  const g = gripShape(s, H); return g.drop ?? hd.fore;
}
