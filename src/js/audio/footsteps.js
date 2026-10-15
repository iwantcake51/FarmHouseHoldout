// Footsteps: recorded (src/sounds/footsteps.mp3, packed by tools/pack-footsteps.py; where each clip sits is
// FOOT_SPRITE), played from your feet (audio/spatial.js). The ground under you picks the set: the house's floorboards
// and the porch are wood, the trodden yard round the house and the drive are dirt, anywhere else is grass. A walk, a
// run (sprinting), a landing and a push off (vaulting) each have their own; one is never played twice running, and each
// goes off a touch higher or lower and louder or softer than the last. Till the file's loaded (or with no audio), the
// synthesized step stands in (SFX.step)
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
// a step of kind ('walk', 'run', 'land' or 'jump') at v (1 a normal one) from where you stand
function footstep(kind, v = 1, x = P.x, z = P.z) {
  const surf = footSurface(x, z), key = surf + '.' + kind, set = FOOT_SPRITE[key];
  if (!FOOT_SND.buf || !set) { if (kind !== 'jump') SFX.step(v, surf === 'wood'); return; }
  let i = Math.floor(Math.random() * set.length);
  if (set.length > 1 && i === footLast[key]) i = (i + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length;
  footLast[key] = i;
  playAt(FOOT_SND.buf, { at: set[i][0], dur: set[i][1], x, z, vol: FOOT_LEVEL * FOOT_VOL[kind] * FOOT_SURF[surf] * v * rr(0.85, 1.1), rate: rr(0.94, 1.06) });
}
