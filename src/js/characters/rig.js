// The blocky human rig shared by the player and the zombies.

const G = {
  leg: new THREE.BoxGeometry(0.19, 0.55, 0.22).translate(0, -0.275, 0),
  torso: new THREE.BoxGeometry(0.5, 0.6, 0.3), head: new THREE.BoxGeometry(0.32, 0.32, 0.32),
  arm: new THREE.BoxGeometry(0.14, 0.14, 0.56).translate(0, 0, 0.26)
};
function human(skin, shirt, pants) {
  const mats = { skin: lam(skin), shirt: lam(shirt), pants: lam(pants) };
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const mk = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (par || g).add(m); return m; };
  const lower = new THREE.Group(); g.add(lower);
  const legL = mk(G.leg, mats.pants, -0.13, 0.55, 0, lower), legR = mk(G.leg, mats.pants, 0.13, 0.55, 0, lower);
  const upper = new THREE.Group(); g.add(upper);
  const torso = mk(G.torso, mats.shirt, 0, 0.86, 0, upper);
  const head = mk(G.head, mats.skin, 0, 1.33, 0, upper);
  const armL = mk(G.arm, mats.skin, -0.33, 1.08, 0, upper), armR = mk(G.arm, mats.skin, 0.33, 1.08, 0, upper);
  return { g, upper, lower, torso, legL, legR, armL, armR, head, mats };
}
