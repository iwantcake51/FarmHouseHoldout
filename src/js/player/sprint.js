// Sprinting: hold Shift while you move (on a touch screen, push the stick right out).
//
// A sprint builds: your momentum (P.runUp) grows over SPRINT.build seconds of running flat out, and your pace with it,
// up to SPRINT.mul times as fast as you walk (WALK_SPEED); it dies away soon after you stop, and a hard turn costs you
// most of it. You burn SPRINT.drain of your stamina a second (Iron lungs makes it last longer). The gun comes down to a
// low ready and can't be fired, the body turns to where you're running and banks into the bends (the run carves round
// at SPRINT.carve radians a second rather than sliding across: sprintCarve), the view bobs (runCam), and a vault you
// run into with enough momentum behind you goes over quicker (vaultRush, player/vaulting.js).
// Empty the tank and you're blown: no sprinting again till it's back to half (SPRINT.unlock), and slower till then (the
// fatigue in weapons/combat-update.js). Aiming while you sprint skids you to a stop on your momentum (SPRINT.skid) and
// brings the gun up into the sights as you slow; pulling the trigger skids you the same way, the gun comes up, and the
// shot goes off once it's there (P.fireQ: a quick click isn't lost). Swinging hard round to run another way (PIVOT.ang
// or more off the way you're going, at speed) you plant your feet and stop, shuffle round to face the new way, and then
// set off again (P.pivot).
//
// Run and gun (S.runGun) lets you sprint and fire a 9mm gun, a pistol or a submachine gun, at anything within RG_ARC
// of the way you're running: the gun stays up and the chest on the aim, the shots far looser (RG_SPREAD). Anything
// further round than that, the gun comes down as usual. Its second step adds the shotguns (pumped on the run too) and
// the assault rifle, never the hunting rifle or the LMG, and lets you reload any of them without breaking the sprint.

const WALK_SPEED = 3.5;
const SPRINT = { mul: 1.6, drain: 0.14, unlock: 0.5, vault: 0.72, skid: 0.42, skidFric: 4.2, build: 1.4, fade: 2.5, acc: 9, carve: 5.5, carveK: 7, carveIn: 14, bendCost: 0.3, bank: 0.055, autoVault: 0.5 };
// how far into your full pace your momentum has you (eased: the first of it comes quickest), and how much of the quick
// vault you've earned (none till you've built up half your momentum, all of it near flat out)
const sprintPace = () => { const u = clamp(P.runUp || 0, 0, 1); return 1 - (1 - u) * (1 - u); };
const vaultRush = () => P.sprint ? smooth(clamp(((P.runUp || 0) - 0.45) / 0.45, 0, 1)) : 0;
const RG_ARC = 1.3, RG_SPREAD = 3;
// the turn: how far round counts, how fast you must be going (of walking speed: well into a sprint), the plant (brake:
// seconds, dec: how hard the ground slows you, metres a second each second, building up over bite seconds as your
// boots dig in; scr: how fast the feet patter, radians a second), then the swing round (turn, plus perRad for each
// radian of it; a step for about every stepRad of it), how far the hips lead the body round (lead), how quickly the
// body follows them (yawRate), and the push off the new way (push: seconds of harder acceleration, pushAcc, which
// builds up over pushIn seconds). A cut, up to PIVOT.cut round, carries PIVOT.keep of your pace through it into the new
// way; anything sharper plants you. Everything about it eases in and out, so it reads as one smooth move
const PIVOT = { ang: 1.35, minSpd: 0.8, brake: 0.12, dec: 21, bite: 0.08, scr: 34, turn: 0.1, perRad: 0.045, stepRad: 1.2, lead: 0.6, yawRate: 14, push: 0.35, pushAcc: 10, pushIn: 0.15, cut: 2.2, keep: 0.4 };
const FIRE_WAIT = 0.9;   // how long a click made while the gun's down waits to go off once it's up
const SHOT_HOLD = 0.35;  // after a shot (or while the trigger's held) you don't break back into a sprint for this long
const READY_UP = 0.2;    // how far down the gun can still be (ANIM.ready) and fire

function sprintKey() { return keys.has('shift') || !!(usingTouch && tStick.L && Math.hypot(tStick.L.x, tStick.L.y) > 0.92); }
// a 9mm gun in your hands, and Run and gun: you can fire it on the run
function runGunOK() { const id = curId(), D = W(id); return !!S.runGun && !!D && !D.melee && (D.ammo === 'p9' || (S.runGun >= 2 && (D.ammo === 'shells' || id === 'ar'))); }
// and from its second step, a reload carries on through a sprint (and doesn't stop one starting)
const rgReload = () => S.runGun >= 2 && runGunOK();
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
  if (P.pivot && (P.pivot.t += dt) >= P.pivot.dur) { P.pivot = null; P.pushT = PIVOT.push; sprintDust(3); SFX.step(1.2, pivotIndoors()); }   // driving off the new way
  if (P.pushT > 0) P.pushT -= dt;
  // a click while the gun's down (sprinting, turning, or still coming up): it goes off once the gun's up
  const trig = rgArc() ? null : sprintTrig();
  if (trig && (P.sprint || P.pivot || (ANIM.ready || 0) > READY_UP)) { P.fireQ = trig; P.fireQT = FIRE_WAIT; }
  P.shotHold = trig ? SHOT_HOLD : Math.max(0, (P.shotHold || 0) - dt);
  // pressing sprint as you move cuts a reload short: what's in stays in (the rest of the mag, the shells already fed),
  // a revolver's cylinder is flicked shut (player/hold.js) and you break into the sprint
  const sk = sprintKey(), skPress = sk && !P.sprintKeyWas; P.sprintKeyWas = sk;
  if (skPress && moving && W8.reloading && state === 'play' && !P.vault && !rgReload()) { W8.reloading = null; W8.reloadT = 0; W8.burstLeft = 0; }
  const can = moving && sk && state === 'play' && !P.dead && !P.vault && !(P.stun > 0) && !P.sprintLock && P.stam > 0 &&
    (!W8.reloading || rgReload()) && !(P.bandT > 0) && !(W8.swing > 0) && !openSt && !(P.skid > 0) && !P.pivot && !P.fireQ && !(P.shotHold > 0) && !(INTRO.t >= 0);
  // aiming or pulling the trigger while you sprint: you skid to a stop on your momentum, the gun coming up as you slow
  if (P.sprint && (aiming || trig)) { P.skid = SPRINT.skid; SFX.skid(); sprintDust(3); }
  // pushing off hard another way at speed: plant, and shuffle round to it (the turn's played out in sprintAnim)
  else if (P.sprint && can && (ANIM.sprintK || 0) > 0.6 && Math.hypot(P.vx, P.vz) > WALK_SPEED * PIVOT.minSpd) {
    const from = Math.atan2(P.vx, P.vz), turn = angDiff(Math.atan2(wx, wz), from);
    if (Math.abs(turn) > PIVOT.ang) {
      // a cut (up to PIVOT.cut round) carries some of your pace through into the new way; turning right about stops you
      const cut = Math.abs(turn) <= PIVOT.cut, sp = Math.hypot(P.vx, P.vz);
      P.pivot = { t: 0, from, turn, dur: PIVOT.brake + PIVOT.turn + PIVOT.perRad * Math.abs(turn), wx, wz, keep: cut ? sp * PIVOT.keep : 0 };
      P.runUp = (P.runUp || 0) * (cut ? 0.55 : 0.3);
      // digging in: a skid and a spray of dust off the boots
      SFX.skid(); sprintDust(6);
    }
  }
  P.sprint = can && !aiming && !P.pivot;
  if (P.sprint) {
    P.stam = Math.max(0, P.stam - stamUse(SPRINT.drain) * dt); P.stamT = 0;
    if (P.stam <= 0.001) { P.exh = true; P.sprintLock = true; P.sprint = false; SFX.pant(); }   // blown
  }
  // momentum builds while you're running flat out (not while you're held up against something), and dies away after
  if (P.sprint) { if (Math.hypot(P.vx, P.vz) > WALK_SPEED * 0.6) P.runUp = Math.min(1, (P.runUp || 0) + dt / SPRINT.build); }
  else if (!P.pivot) P.runUp = Math.max(0, (P.runUp || 0) - dt * SPRINT.fade);   // (what a turn leaves you is kept through it)
  if (P.skid > 0) P.skid = Math.max(0, P.skid - dt);
  P.skidDust = (P.skidDust || 0) - dt;
  if ((P.skid > 0 || P.pivot) && P.skidDust <= 0 && Math.hypot(P.vx, P.vz) > 1.2) { P.skidDust = 0.05; burst(P.x + rr(-0.12, 0.12), 0.04, P.z + rr(-0.12, 0.12), 1, 'dust'); }   // kicked up as the boots scrape along
}

// running flat out at an open window or a fence takes you straight over it, no key needed: when you're pushing at it
// and going at it (within about 60 degrees of straight across, SPRINT.autoVault) at better than a walk
function sprintVault(mx, my) {
  const ml = Math.hypot(mx, my), sp = Math.hypot(P.vx, P.vz); if (!ml || sp < WALK_SPEED * 0.6 || P.pivot || P.skid > 0) return;
  const o = nearestOpening(), win = vaultTarget(o), t = win || fenceTarget(); if (!t) return;
  let jx, jz;
  if (win) { const side = Math.sign((P.x - o.x) * o.nx + (P.z - o.z) * o.nz) || 1; jx = -o.nx * side; jz = -o.nz * side; }
  else if (Math.abs(t.x1 - P.x) > Math.abs(t.z1 - P.z)) { jx = Math.sign(t.x1 - P.x); jz = 0; } else { jx = 0; jz = Math.sign(t.z1 - P.z); }   // (straight across the fence, as tryVault takes it)
  const wx = (RIGHT.x * mx - FWD.x * my) / ml, wz = (RIGHT.z * mx - FWD.z * my) / ml;
  if (wx * jx + wz * jz > SPRINT.autoVault && (P.vx * jx + P.vz * jz) / sp > SPRINT.autoVault) tryVault();
}
// the plant and the swing round: your velocity's brought round to what the turn leaves you (nothing, or a cut's share
// of your pace the new way) at a steady PIVOT.dec, the grip building over the first moment (bite) rather than
// stopping you dead the instant you plant
function pivotSlow(dt, tvx, tvz) {
  const dx = tvx - P.vx, dz = tvz - P.vz, d = Math.hypot(dx, dz), m = PIVOT.dec * smooth(clamp(P.pivot.t / PIVOT.bite, 0, 1)) * dt;
  if (d <= m) { P.vx = tvx; P.vz = tvz; } else { P.vx += dx / d * m; P.vz += dz / d * m; }
  P.carveW = 0;
}
// how quickly a sprint's pace comes up: harder for a moment as you drive off a turn, that drive building in over pushIn
const sprintAcc = () => P.pushT > 0 ? PIVOT.pushAcc * (0.35 + 0.65 * smooth(clamp((PIVOT.push - P.pushT) / PIVOT.pushIn, 0, 1))) : SPRINT.acc;
// steering at a sprint: the run swings round toward where you're pushing instead of sliding straight across to it.
// How fast it swings (P.carveW, radians a second, which also leans the body into it) eases in and out (SPRINT.carveIn)
// toward a rate that's quicker the further round there is to go (carveK), up to SPRINT.carve (a touch less the more
// momentum you have), so a bend rolls in and out smoothly. It keeps its pace through the bend less what the bend
// costs, while its speed comes up to the target on its own clock
function sprintCarve(dt, tvx, tvz) {
  const s0 = Math.hypot(P.vx, P.vz), st = Math.hypot(tvx, tvz);
  if (s0 < 0.6 || !(dt > 0)) { const k = 1 - Math.exp(-dt * sprintAcc()); P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k; P.carveW = 0; return; }
  const a0 = Math.atan2(P.vx, P.vz), diff = angDiff(Math.atan2(tvx, tvz), a0), wMax = SPRINT.carve * (1 - 0.3 * (P.runUp || 0));
  P.carveW = (P.carveW || 0) + (clamp(diff * SPRINT.carveK, -wMax, wMax) - (P.carveW || 0)) * (1 - Math.exp(-dt * SPRINT.carveIn));
  let step = P.carveW * dt;
  if (step * diff <= 0) step = 0;   // still swinging the old way round: hold the line till it swings the new way
  else if (Math.abs(step) > Math.abs(diff)) { step = diff; P.carveW = diff / dt; }   // and never past the way you're pushing
  const a = a0 + step;
  const sp = (s0 + (st - s0) * (1 - Math.exp(-dt * sprintAcc()))) * (1 - Math.abs(step) * SPRINT.bendCost);
  P.runUp = Math.max(0, (P.runUp || 0) - Math.abs(step) * 0.25);
  P.vx = Math.sin(a) * sp; P.vz = Math.cos(a) * sp;
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
    const u0 = PIVOT.brake * 0.4, u = smooth(clamp((pv.t - u0) / (pv.dur - u0), 0, 1));
    ANIM.runYaw = pv.from + pv.turn * u; ANIM.pivU = u; ANIM.pivTo = pv.from + pv.turn;
  } else if (Math.hypot(P.vx, P.vz) > 0.5) ANIM.runYaw = Math.atan2(P.vx, P.vz);
  const ease = (k, to, up, down) => { ANIM[k] = (ANIM[k] || 0) + (to - (ANIM[k] || 0)) * Math.min(1, rdt * (to > (ANIM[k] || 0) ? up : down)); };
  ease('sprintK', P.sprint ? 0.3 + 0.7 * sprintPace() : 0, 6, 4);   // the gait opens out as the momentum builds
  ease('runBank', P.sprint && !pv ? clamp(-(P.carveW || 0) * SPRINT.bank, -0.22, 0.22) : 0, 9, 6);   // leaning into a bend
  ease('ready', on ? 1 : 0, 8, 6.5);      // down in about a fifth of a second, back up a touch quicker than that
  ease('faceK', on ? 1 : 0, 6, 5);
  ease('bobK', P.sprint && !pv && !(P.skid > 0) ? 1 : 0, 2.5, 4);   // the view's bob dies smoothly away through a turn or a skid, and builds back as you get going (runCam)
  const scr = !!pv && pv.t < PIVOT.brake;
  const sk = P.skid > 0 ? Math.sin(Math.PI * Math.pow(1 - P.skid / SPRINT.skid, 0.7)) : scr ? 1 : 0;
  ease('skidK', sk, pv ? 12 : 18, pv ? 7 : 7);   // (a hard turn's plant is quick: the lean back goes in and comes out fast)
  ease('scrK', scr ? 1 : 0, 13, 6);
  ease('pivK', pv && pv.t > PIVOT.brake * 0.75 ? 1 : 0, 13, 5.5);
  // banked into the turn as you come round, and easing back level as you set off
  { const to = pv && pv.t > PIVOT.brake * 0.5 ? Math.sign(pv.turn) || 1 : 0; ANIM.pivBank = (ANIM.pivBank || 0) + (to - (ANIM.pivBank || 0)) * Math.min(1, rdt * (to ? 10 : 5)); }
  // the scramble's steps, quick and short, dying away as you stop
  if ((ANIM.scrK || 0) > 0.01) {
    const p0 = ANIM.scrPh || 0; ANIM.scrPh = p0 + rdt * PIVOT.scr * (scr ? 1 : 0.6);
    if (scr && Math.floor(ANIM.scrPh / Math.PI) !== Math.floor(p0 / Math.PI)) {
      SFX.step(1.1, pivotIndoors());
      const sd = Math.floor(ANIM.scrPh / Math.PI) % 2 ? 1 : -1; burst(P.x + RIGHT.x * sd * 0.12 + rr(-0.05, 0.05), 0.04, P.z + RIGHT.z * sd * 0.12 + rr(-0.05, 0.05), 1, 'dust');
    }
  } else ANIM.scrPh = 0;
  // the turn's steps keep time with the body coming round; once it's round the last one's put down
  const ph0 = ANIM.pivPh || 0;
  if (pv) { ANIM.pivDir = Math.sign(pv.turn) || 1; ANIM.pivPh = Math.PI * Math.max(2, Math.round(Math.abs(pv.turn) / PIVOT.stepRad)) * (ANIM.pivU || 0); }
  else if ((ANIM.pivK || 0) > 0.01) ANIM.pivPh = Math.min(Math.ceil(ph0 / Math.PI - 1e-6) * Math.PI, ph0 + rdt * 16);
  else ANIM.pivPh = 0;
  if (pv && Math.floor(ANIM.pivPh / Math.PI) !== Math.floor(ph0 / Math.PI)) SFX.step(0.6, pivotIndoors());
}

// the view while you sprint stays steady: no shake and no turning, only a drift of a few centimetres with the stride,
// from side to side (RUN_CAM.side) and down at each footfall (dip), on top of the vault's, the recoil's and the
// rack's (game/camera.js). It dies smoothly away through a turn or a skid and builds back after (ANIM.bobK)
const RUN_CAM = { side: 0.015, dip: 0.04 };
const camRun = { px: 0, pz: 0, bob: 0 };
function runCam() {
  const k = smooth(clamp(ANIM.sprintK || 0, 0, 1)) * smooth(ANIM.bobK || 0), ph = P.phase, hit = Math.pow(Math.abs(Math.cos(ph)), 6), side = Math.sin(ph) * RUN_CAM.side * k;
  camRun.bob = -RUN_CAM.dip * hit * k; camRun.px = RIGHT.x * side; camRun.pz = RIGHT.z * side;
}
