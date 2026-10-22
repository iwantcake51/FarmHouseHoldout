// Spawning a zombie: model, outfit, fade materials, x-ray, shadow, and where it comes in from.

// zombies come out of the fog: each starts 6.5 to 9 m out past the edge of the farm, on the cleared trail in front of
// one of the gaps in the trees, and walks in along it (z.out, zombies/ai.js). Out there it only shows as it comes clear
// of the fog: fogSee is how much of it does, none of it FOG_IN metres out and all of it at the edge
const FOG_IN = 7;
const fogSee = (x, z) => 1 - smooth(clamp((Math.max(Math.abs(x), Math.abs(z)) - HALF) / FOG_IN, 0, 1));
function spawnZombie(type, job) {
  const T_ = ZT[type], [gi, gj] = GAPS[(rand() * GAPS.length) | 0];
  const ox = gi === 0 ? -1 : gi === N - 1 ? 1 : 0, oz = gj === 0 ? -1 : gj === N - 1 ? 1 : 0, far = rr(6.5, 9), lat = rr(-0.6, 0.6);
  const gx = cxw(gi) + rr(-.3, .3), gz = cxw(gj) + rr(-.3, .3);
  const m = human(0xffffff, 0xffffff, 0xffffff);
  zombieRig(m);   // knees, elbows and a waist (zombies/zombie-anim.js)
  dressZombie(m, type, job);   // its body and what it was wearing when it turned (zombies/zombie-looks.js)
  if (type === 'spitter') spitterLook(m);   // its sac and glowing mouth (zombies/spitter.js)
  const sc = T_.scale * rr(0.94, 1.06);
  m.g.scale.setScalar(sc);
  // the pupils glow, deep in their sockets; effects/eye-glow.js gives them a halo and a light trail
  m.eyes = m.look.eyeAt.map(([x, y, w, h, z]) => box(m.head, w, h, 0.008, basic(EYE_COL), x, y, z + 0.0011));
  m.eyes.forEach(e => e.layers.enable(GLOW_LAYER));   // (they bloom: effects/post.js)   // (where each eye is, and how open: zHead; a hair forward, so it never shares a plane with the face round it)
  trimShadows(m.g);
  const stain = stainZombie(m);   // blood on them, like on you (effects/body-blood.js)
  const fm = new Set(); m.g.traverse(o => { if (o.isMesh && !o.userData.isOutline) { o.material.userData.mobile = true; fm.add(o.material); } }); fm.forEach(mt => { mt.transparent = true; });
  ['head', 'torso', 'armL', 'armR', 'legL', 'legR'].forEach(p => { m[p].userData.part = p; });
  const dm = fadeDepthMat(); m.g.traverse(o => { if (o.isMesh) o.customDepthMaterial = dm; });
  const xr = xray(m.g, type === 'spitter' ? SPIT.xray : 0xff3322, false, true, null, 0, 5);   // seen through cover in halftone dots, like you (effects/outlines.js)
  scene.add(m.g);
  const hpMul = 1 + (run.wave - 1) * 0.11 + LATE.hp * lateN(run.wave) ** 2, hp = T_.hp * hpMul;   // (faster past LATE.from: waves/waves.js)
  const z = { type, T: Object.assign({}, T_, { scale: sc }), m, x: gx + ox * far + (ox ? 0 : lat), z: gz + oz * far + (oz ? 0 : lat), out: true, gx, gz, hp, maxHp: hp, vx: 0, vz: 0, face: Math.atan2(-ox, -oz), phase: rand() * 6, atk: 0, lunge: 0, flash: 0, squash: 0, stagger: 0, drip: 0, burn: 0, bleed: 0, vis: 0,
    fade: [...fm], xr, dm, blob: blobShadow(1.1 * sc * (type === 'brute' ? 1.25 : 1), 0), limbs: { head: true, armL: true, armR: true, legL: true, legR: true }, lhp: { armL: hp * 0.3, armR: hp * 0.3, legL: hp * 0.4, legR: hp * 0.4 }, crawl: false, spurts: [], stain, speed: T_.speed * rr(.9, 1.1) * (type === 'runner' ? runnerPace() : type === 'walker' ? walkerPace() : 1) };
  zAnimInit(z); zombies.push(z);
  if (type === 'spitter') spitterGait(z);   // bent over its belly, and its drool and glow kept going (zombies/spitter.js)
}
// sprinters show up on wave 3 at about two thirds of their top speed and work up to full pace by wave 11
const runnerPace = () => Math.min(1, 0.62 + Math.max(0, run.wave - 3) * 0.0475);
// walkers pick up a little pace as the waves go on: WALKER_PACE.per faster each wave after the first, never more than
// WALKER_PACE.max over their own (about a fifth faster by wave 14)
const WALKER_PACE = { per: 0.015, max: 0.2 }, walkerPace = () => 1 + Math.min(WALKER_PACE.max, Math.max(0, run.wave - 1) * WALKER_PACE.per);
