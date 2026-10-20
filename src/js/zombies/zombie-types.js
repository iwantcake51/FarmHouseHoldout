// Zombie types and body-part tables.

const ZT = {
  walker: { hp: 55, speed: 1.25, dmg: 29, bdps: 13, r: 0.32, scale: 1, shirts: [0x5b4a44, 0x4a5560, 0x6b5a3a, 0x3f4a3a, 0x6a6458, 0x7a6e60, 0x3a3f52] },
  runner: { hp: 30, speed: 3.75, dmg: 21, bdps: 8, r: 0.3, scale: 0.92, shirts: [0x6b2f2a, 0x7a4a2a, 0x2f4a5a] },
  // a spitter (zombies/spitter.js): frail, a little slower, lobbing acid from off where you are
  spitter: { hp: 42, speed: 1.1, dmg: 22, bdps: 9, r: 0.32, scale: 1, shirts: [0x4a5040, 0x5a5a3a] },
  brute: { hp: 240, speed: 0.95, dmg: 58, bdps: 0, r: 0.48, scale: 1.45, shirts: [0x34322e, 0x4a3a2a] }
};
const PART_Y = { head: 1.35, torso: 0.95, armL: 1.05, armR: 1.05, legL: 0.35, legR: 0.35 };
// a bullet's damage by where it lands: the head by Headhunter and the like, the body in full, an arm half, a leg less
// than half (it goes through the meat of it; what a leg shot does is slow one down: LEG_SLOW in zombies/damage.js)
const partMult = p => p === 'head' ? S.headMul : p === 'torso' ? 1 : p === 'armL' || p === 'armR' ? 0.5 : 0.42;
const STUMP = { head: [0, 1.18, 0], armL: [-0.33, 1.08, 0], armR: [0.33, 1.08, 0], legL: [-0.13, 0.55, 0], legR: [0.13, 0.55, 0] };
const zombies = [];
// headshots pay off most with heavy rounds: 9mm only gets about half the head bonus, shotgun loads only a third, and
// a shotgun's fades with range too (headFade, weapons/ammo.js).
// A gun's match-grade rounds and sight raise its own multiplier (D.headX, game/run-state.js)
const HEAD_CAL = { p9: 0.5, shells: 0.35, magnum: 1, rifle: 1 };
const headMulFor = D => 1 + (S.headMul + ((D && D.headX) || 0) - 1) * (D && D.ammo ? HEAD_CAL[D.ammo] : 1);
