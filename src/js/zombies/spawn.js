// Spawning a zombie: model, outfit, fade materials, x-ray, shadow.

function spawnZombie(type) {
  const T_ = ZT[type], [gi, gj] = GAPS[(rand() * GAPS.length) | 0];
  const skin = type === 'runner' ? 0x9aa486 : pick([0x8b977a, 0x93977e, 0x7f8c70, 0x9a9a84]);
  const m = human(skin, pick(T_.shirts), pick([0x33353a, 0x3a3428, 0x2c3440, 0x4a4438]));
  const sc = T_.scale * rr(0.94, 1.06);
  m.g.scale.setScalar(sc);
  m.armL.rotation.x = m.armR.rotation.x = -0.15; m.head.rotation.z = rr(-.25, .25);
  m.extras = [];
  if (rand() < 0.6) m.extras.push(box(m.head, 0.34, 0.08, 0.34, lam(pick(HAIR)), 0, 0.17, -0.01));
  if (rand() < 0.5) m.extras.push(box(m.torso, 0.18, 0.16, 0.02, lam(0x5a1a14), rr(-.12, .12), rr(-.15, .15), 0.155));
  if (rand() < 0.4) m.extras.push(box(m.torso, 0.52, 0.12, 0.32, lam(0x2a2620), 0, -0.24, 0));
  box(m.head, 0.06, 0.04, 0.02, basic(0xd8d0a0), -0.07, 0.03, 0.165); box(m.head, 0.06, 0.04, 0.02, basic(0xd8d0a0), 0.07, 0.03, 0.165);
  const fm = new Set(); m.g.traverse(o => { if (o.isMesh && !o.userData.isOutline) fm.add(o.material); }); fm.forEach(mt => { mt.transparent = true; });
  ['head', 'torso', 'armL', 'armR', 'legL', 'legR'].forEach(p => { m[p].userData.part = p; });
  const dm = fadeDepthMat(); m.g.traverse(o => { if (o.isMesh) o.customDepthMaterial = dm; });
  const xr = xray(m.g, 0xff3322, false, true);
  scene.add(m.g);
  const hpMul = 1 + (run.wave - 1) * 0.11, hp = T_.hp * hpMul;
  zombies.push({ type, T: Object.assign({}, T_, { scale: sc }), m, x: cxw(gi) + rr(-.3, .3), z: cxw(gj) + rr(-.3, .3), hp, maxHp: hp, vx: 0, vz: 0, face: 0, phase: rand() * 6, atk: 0, lunge: 0, flash: 0, squash: 0, stagger: 0, drip: 0, burn: 0, bleed: 0, vis: 0,
    fade: [...fm], xr, dm, blob: blobShadow(1.1 * sc * (type === 'brute' ? 1.25 : 1), 0), limbs: { head: true, armL: true, armR: true, legL: true, legR: true }, lhp: { armL: hp * 0.3, armR: hp * 0.3, legL: hp * 0.4, legR: hp * 0.4 }, crawl: false, spurts: [], speed: T_.speed * rr(.9, 1.1) * (type === 'runner' ? runnerPace() : 1) });
}
// sprinters show up on wave 3 at about two thirds of their top speed and work up to full pace by wave 11
const runnerPace = () => Math.min(1, 0.62 + Math.max(0, run.wave - 3) * 0.0475);
