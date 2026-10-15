// Sprinting: hold Shift while you move (on a touch screen, push the stick right out).
//
// You run SPRINT.mul times as fast as you walk (WALK_SPEED) and burn SPRINT.drain of your stamina a second (Iron
// lungs makes it last longer). The gun comes down to a low ready and can't be fired, the body turns to where you're
// running, the view jolts with each footfall (runCam), and a vault you run into goes over quicker (player/vaulting.js).
// Empty the tank and you're blown: no sprinting again till it's back to half (SPRINT.unlock), and slower till then (the
// fatigue in weapons/combat-update.js). Aiming while you sprint skids you to a stop on your momentum (SPRINT.skid) and
// brings the gun up into the sights as you slow; pulling the trigger drops you out of the sprint till you let go.
//
// Run and gun (S.runGun) lets you sprint and fire a 9mm gun, a pistol or a submachine gun, at anything within RG_ARC
// of the way you're running: the gun stays up and the chest on the aim, the shots far looser (RG_SPREAD). Anything
// further round than that, the gun comes down as usual.
const WALK_SPEED = 3.5;
const SPRINT = { mul: 1.6, drain: 0.14, unlock: 0.5, vault: 0.72, skid: 0.42, skidFric: 4.2 };
const RG_ARC = 1.3, RG_SPREAD = 3;

function sprintKey() { return keys.has('shift') || !!(usingTouch && tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.92); }
// a 9mm gun in your hands, and Run and gun: you can fire it on the run
function runGunOK() { const D = W(curId()); return !!S.runGun && !!D && !D.melee && D.ammo === 'p9'; }
// Run and gun, aiming within its arc of the way you're running: a sprint keeps the gun up, and it fires
const rgArc = () => runGunOK() && Math.abs(angDiff(P.aim, ANIM.runYaw ?? P.aim)) < RG_ARC;
function runGunning() { return !!P.sprint && rgArc(); }
// nothing you can fire while you're sprinting, or while the gun's still coming up out of the low ready after
function sprintHolds() { return (!!P.sprint && !runGunning()) || (ANIM.ready || 0) > 0.3; }

// each frame, before you move: whether you're sprinting, its cost, and a skid into the sights
function updateSprint(dt, moving) {
  // emptying the tank any way at all (a sprint, a swing, a shove, a vault) leaves you blown till it's back to half
  if (P.exh) P.sprintLock = true; else if (P.stam >= SPRINT.unlock) P.sprintLock = false;
  const can = moving && sprintKey() && state === 'play' && !P.dead && !P.vault && !(P.stun > 0) && !P.sprintLock && P.stam > 0 &&
    !W8.reloading && !(P.bandT > 0) && !(W8.swing > 0) && !openSt && !(P.skid > 0) && !(INTRO.t >= 0) && !(mouseDown && !rgArc());
  // aiming while you sprint: you skid to a stop on your momentum, the gun coming up as you slow
  if (P.sprint && aiming) {
    P.skid = SPRINT.skid; SFX.skid();
    for (let k = 0; k < 3; k++) burst(P.x + rr(-0.15, 0.15), 0.05, P.z + rr(-0.15, 0.15), 1, 'dust');
  }
  P.sprint = can && !aiming;
  if (P.sprint) {
    P.stam = Math.max(0, P.stam - stamUse(SPRINT.drain) * dt); P.stamT = 0;
    if (P.stam <= 0.001) { P.exh = true; P.sprintLock = true; P.sprint = false; SFX.pant(); }   // blown
  }
  if (P.skid > 0) {
    P.skid = Math.max(0, P.skid - dt); P.skidDust = (P.skidDust || 0) - dt;
    if (P.skidDust <= 0 && Math.hypot(P.vx, P.vz) > 1.2) { P.skidDust = 0.05; burst(P.x + rr(-0.12, 0.12), 0.04, P.z + rr(-0.12, 0.12), 1, 'dust'); }   // kicked up as the boots scrape along
  }
}

// the animation's blends, each eased on its own clock: the gait (sprintK), the gun down at a low ready (ready), the body
// turned to where you're running (faceK), and the skid (skidK, a quick lean back that lets go as you stop)
function sprintAnim(rdt) {
  const rg = runGunning(), on = P.sprint && !rg;
  if (Math.hypot(P.vx, P.vz) > 0.5) ANIM.runYaw = Math.atan2(P.vx, P.vz);
  const ease = (k, to, up, down) => { ANIM[k] = (ANIM[k] || 0) + (to - (ANIM[k] || 0)) * Math.min(1, rdt * (to > (ANIM[k] || 0) ? up : down)); };
  ease('sprintK', P.sprint ? 1 : 0, 4.5, 4);
  ease('ready', on ? 1 : 0, 8, 6.5);      // down in about a fifth of a second, back up a touch quicker than that
  ease('faceK', on ? 1 : 0, 6, 5);
  const sk = P.skid > 0 ? Math.sin(Math.PI * Math.pow(1 - P.skid / SPRINT.skid, 0.7)) : 0;
  ease('skidK', sk, 18, 10);
}

// the view while you sprint: a jolt down at each footfall, swaying from side to side with the stride and rolling with
// it a touch (on top of the vault's, the recoil's and the rack's: game/camera.js)
const camRun = { px: 0, pz: 0, bob: 0, roll: 0 };
function runCam() {
  const k = smooth(clamp(ANIM.sprintK || 0, 0, 1)), ph = P.phase, hit = Math.pow(Math.abs(Math.cos(ph)), 10), side = Math.sin(ph) * 0.05 * k;
  camRun.bob = -0.11 * hit * k; camRun.px = RIGHT.x * side; camRun.pz = RIGHT.z * side; camRun.roll = Math.sin(ph) * 0.007 * k;
  if (k > 0.3) shake = Math.max(shake, 0.13 * k);
}
