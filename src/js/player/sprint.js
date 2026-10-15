// Sprinting: hold Shift while you move (on a touch screen, push the stick right out).
//
// You run SPRINT.mul times as fast as you walk (WALK_SPEED) and burn SPRINT.drain of your stamina a second (Iron
// lungs makes it last longer). The gun comes down to a low ready and can't be fired, the body turns to where you're
// running, the view jolts with each footfall (runCam), and a vault you run into goes over quicker (player/vaulting.js).
// Empty the tank and you're blown: no sprinting again till it's back to half (SPRINT.unlock), and slower till then (the
// fatigue in weapons/combat-update.js). Aiming while you sprint skids you to a stop on your momentum (SPRINT.skid) and
// brings the gun up into the sights as you slow; pulling the trigger skids you the same way, the gun comes up, and the
// shot goes off once it's there (P.fireQ: a quick click isn't lost). Swinging hard round to run another way (PIVOT.ang
// or more off the way you're going, at speed) you plant your feet and stop, shuffle round to face the new way, and then
// set off again (P.pivot).
//
// Run and gun (S.runGun) lets you sprint and fire a 9mm gun, a pistol or a submachine gun, at anything within RG_ARC
// of the way you're running: the gun stays up and the chest on the aim, the shots far looser (RG_SPREAD). Anything
// further round than that, the gun comes down as usual.
const WALK_SPEED = 3.5;
const SPRINT = { mul: 1.6, drain: 0.14, unlock: 0.5, vault: 0.72, skid: 0.42, skidFric: 4.2 };
const RG_ARC = 1.3, RG_SPREAD = 3;
// the turn: how far round counts, how fast you must be going (of walking speed: well into a sprint), the scramble to
// plant your feet (brake: seconds, fric: how hard the ground stops you, scr: how fast the feet patter, radians a
// second), then the turn itself (turn, plus perRad for each radian of it; a step for about every stepRad of it), how
// far the hips lead the body round (lead) and how loosely the body follows them (yawRate)
const PIVOT = { ang: 1.35, minSpd: 0.8, brake: 0.24, fric: 11, scr: 27, turn: 0.2, perRad: 0.06, stepRad: 1.0, lead: 0.55, yawRate: 8 };
const FIRE_WAIT = 0.9;   // how long a click made while the gun's down waits to go off once it's up
const SHOT_HOLD = 0.35;  // after a shot (or while the trigger's held) you don't break back into a sprint for this long
const READY_UP = 0.2;    // how far down the gun can still be (ANIM.ready) and fire

function sprintKey() { return keys.has('shift') || !!(usingTouch && tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.92); }
// a 9mm gun in your hands, and Run and gun: you can fire it on the run
function runGunOK() { const D = W(curId()); return !!S.runGun && !!D && !D.melee && D.ammo === 'p9'; }
// Run and gun, aiming within its arc of the way you're running: a sprint keeps the gun up, and it fires
const rgArc = () => runGunOK() && Math.abs(angDiff(P.aim, ANIM.runYaw ?? P.aim)) < RG_ARC;
function runGunning() { return !!P.sprint && rgArc(); }
// nothing you can fire while you're sprinting, or while the gun's still coming up out of the low ready after
function sprintHolds() { return (!!P.sprint && !runGunning()) || (ANIM.ready || 0) > READY_UP; }
// the trigger as the sprint sees it, and which: the left button, the right one with a gun in each hand (it fires the
// right gun, weapons/akimbo.js), or the right stick pushed out on a touch screen
function sprintTrig() {
  const D = W(curId());
  if (mouseDown) return 'L'; if (mouseDownR && D && D.akimbo) return 'R';
  return tStick.R && Math.hypot(tStick.R.x, tStick.R.y) > 0.4 ? 'S' : null;
}
const sprintDust = n => { for (let k = 0; k < n; k++) burst(P.x + rr(-0.15, 0.15), 0.05, P.z + rr(-0.15, 0.15), 1, 'dust'); };

// each frame, before you move (wx, wz: the way you're pushing): whether you're sprinting, its cost, a skid into the
// sights or into a shot, and a hard turn
function updateSprint(dt, moving, wx, wz) {
  // emptying the tank any way at all (a sprint, a swing, a shove, a vault) leaves you blown till it's back to half
  if (P.exh) P.sprintLock = true; else if (P.stam >= SPRINT.unlock) P.sprintLock = false;
  if (P.fireQ && (P.fireQT -= dt) <= 0) P.fireQ = null;
  if (P.pivot && (P.pivot.t += dt) >= P.pivot.dur) P.pivot = null;
  // a click while the gun's down (sprinting, turning, or still coming up): it goes off once the gun's up
  const trig = rgArc() ? null : sprintTrig();
  if (trig && (P.sprint || P.pivot || (ANIM.ready || 0) > READY_UP)) { P.fireQ = trig; P.fireQT = FIRE_WAIT; }
  P.shotHold = trig ? SHOT_HOLD : Math.max(0, (P.shotHold || 0) - dt);
  const can = moving && sprintKey() && state === 'play' && !P.dead && !P.vault && !(P.stun > 0) && !P.sprintLock && P.stam > 0 &&
    !W8.reloading && !(P.bandT > 0) && !(W8.swing > 0) && !openSt && !(P.skid > 0) && !P.pivot && !P.fireQ && !(P.shotHold > 0) && !(INTRO.t >= 0);
  // aiming or pulling the trigger while you sprint: you skid to a stop on your momentum, the gun coming up as you slow
  if (P.sprint && (aiming || trig)) { P.skid = SPRINT.skid; SFX.skid(); sprintDust(3); }
  // pushing off hard another way at speed: plant, and shuffle round to it (the turn's played out in sprintAnim)
  else if (P.sprint && can && (ANIM.sprintK || 0) > 0.6 && Math.hypot(P.vx, P.vz) > WALK_SPEED * PIVOT.minSpd) {
    const from = Math.atan2(P.vx, P.vz), turn = angDiff(Math.atan2(wx, wz), from);
    if (Math.abs(turn) > PIVOT.ang) {
      P.pivot = { t: 0, from, turn, dur: PIVOT.brake + PIVOT.turn + PIVOT.perRad * Math.abs(turn) };
      SFX.skid(); sprintDust(2); shake = Math.max(shake, 0.16);
    }
  }
  P.sprint = can && !aiming && !P.pivot;
  if (P.sprint) {
    P.stam = Math.max(0, P.stam - stamUse(SPRINT.drain) * dt); P.stamT = 0;
    if (P.stam <= 0.001) { P.exh = true; P.sprintLock = true; P.sprint = false; SFX.pant(); }   // blown
  }
  if (P.skid > 0) P.skid = Math.max(0, P.skid - dt);
  P.skidDust = (P.skidDust || 0) - dt;
  if ((P.skid > 0 || P.pivot) && P.skidDust <= 0 && Math.hypot(P.vx, P.vz) > 1.2) { P.skidDust = 0.05; burst(P.x + rr(-0.12, 0.12), 0.04, P.z + rr(-0.12, 0.12), 1, 'dust'); }   // kicked up as the boots scrape along
}

// the animation's blends, each eased on its own clock: the gait (sprintK), the gun down at a low ready (ready), the body
// turned to where you're running (faceK), the skid (skidK, a quick lean back that lets go as you stop), and a hard
// turn: the scramble to plant your feet (scrK, its quick choppy steps on scrPh, each one a scuff, a puff of dust and a
// jolt), then the turn round (pivK, its steps on pivPh, kept in time with the body coming round so each foot is set
// down a little further round), all with the gun still down (unless you've pulled the trigger)
const pivotIndoors = () => P.x > HOUSE.x0 && P.x < HOUSE.x1 && P.z > HOUSE.z0 && P.z < HOUSE.z1;
function sprintAnim(rdt) {
  const rg = runGunning(), pv = P.pivot, on = (P.sprint && !rg) || (!!pv && !P.fireQ);
  if (pv) {
    // the body starts round as the feet dig in and eases round to the new way
    const u0 = PIVOT.brake * 0.75, u = smooth(clamp((pv.t - u0) / (pv.dur - u0), 0, 1));
    ANIM.runYaw = pv.from + pv.turn * u; ANIM.pivU = u; ANIM.pivTo = pv.from + pv.turn;
  } else if (Math.hypot(P.vx, P.vz) > 0.5) ANIM.runYaw = Math.atan2(P.vx, P.vz);
  const ease = (k, to, up, down) => { ANIM[k] = (ANIM[k] || 0) + (to - (ANIM[k] || 0)) * Math.min(1, rdt * (to > (ANIM[k] || 0) ? up : down)); };
  ease('sprintK', P.sprint ? 1 : 0, 4.5, 4);
  ease('ready', on ? 1 : 0, 8, 6.5);      // down in about a fifth of a second, back up a touch quicker than that
  ease('faceK', on ? 1 : 0, 6, 5);
  const scr = !!pv && pv.t < PIVOT.brake;
  const sk = P.skid > 0 ? Math.sin(Math.PI * Math.pow(1 - P.skid / SPRINT.skid, 0.7)) : scr ? 0.8 : 0;
  ease('skidK', sk, 18, 7);
  ease('scrK', scr ? 1 : 0, 22, 7);
  ease('pivK', pv && pv.t > PIVOT.brake * 0.75 ? 1 : 0, 10, 6);
  // the scramble's steps, quick and short, dying away as you stop
  if ((ANIM.scrK || 0) > 0.01) {
    const p0 = ANIM.scrPh || 0; ANIM.scrPh = p0 + rdt * PIVOT.scr * (scr ? 1 : 0.6);
    if (scr && Math.floor(ANIM.scrPh / Math.PI) !== Math.floor(p0 / Math.PI)) {
      SFX.step(1.1, pivotIndoors()); shake = Math.max(shake, 0.1);
      const sd = Math.floor(ANIM.scrPh / Math.PI) % 2 ? 1 : -1; burst(P.x + RIGHT.x * sd * 0.12 + rr(-0.05, 0.05), 0.04, P.z + RIGHT.z * sd * 0.12 + rr(-0.05, 0.05), 1, 'dust');
    }
  } else ANIM.scrPh = 0;
  // the turn's steps keep time with the body coming round; once it's round the last one's put down
  const ph0 = ANIM.pivPh || 0;
  if (pv) { ANIM.pivDir = Math.sign(pv.turn) || 1; ANIM.pivPh = Math.PI * Math.max(2, Math.round(Math.abs(pv.turn) / PIVOT.stepRad)) * (ANIM.pivU || 0); }
  else if ((ANIM.pivK || 0) > 0.01) ANIM.pivPh = Math.min(Math.ceil(ph0 / Math.PI - 1e-6) * Math.PI, ph0 + rdt * 9);
  else ANIM.pivPh = 0;
  if (pv && Math.floor(ANIM.pivPh / Math.PI) !== Math.floor(ph0 / Math.PI)) SFX.step(0.6, pivotIndoors());
}

// the view while you sprint: a jolt down at each footfall, swaying from side to side with the stride and rolling with
// it a touch (on top of the vault's, the recoil's and the rack's: game/camera.js)
const camRun = { px: 0, pz: 0, bob: 0, roll: 0 };
function runCam() {
  const k = smooth(clamp(ANIM.sprintK || 0, 0, 1)), ph = P.phase, hit = Math.pow(Math.abs(Math.cos(ph)), 10), side = Math.sin(ph) * 0.05 * k;
  camRun.bob = -0.11 * hit * k; camRun.px = RIGHT.x * side; camRun.pz = RIGHT.z * side; camRun.roll = Math.sin(ph) * 0.007 * k;
  if (k > 0.3) shake = Math.max(shake, 0.13 * k);
}
