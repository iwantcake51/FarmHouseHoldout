// Holding weapons: where each hand goes on each gun, the gun's own pose (aim, recoil, reloads, cycling, akimbo),
// and arms that reach for their targets, so the hands stay on the gun whatever it is doing.
//
// The order every frame: pose the gun (the slot group, then one hold group per hand), work out where each fist
// should be (on the gun, or off doing something: fetching a mag, feeding shells, working the bolt, bandaging),
// then point each arm from its shoulder at its fist target. Only the hand that is doing something moves.

// shoulders roll a little forward and in when you shoulder a gun; the fist grips about its front third
const SHOULDER = { L: [-0.31, 1.08, 0.05], R: [0.31, 1.08, 0.05] }, SHOULDER_REST = { L: [-0.33, 1.08, 0], R: [0.33, 1.08, 0] }, FIST = 0.5, Y_AX = new V3(0, 1, 0);
// gun-local points (the model's own coordinates): grip is the firing hand, fore the support hand (on long guns the back of
// the handguard, where you'd really hold it). blade turns the torso side-on (the gun stays on the aim) and pull brings the
// gun back into the shoulder; both are solved so the arms reach without stretching much
const HOLD = {
  pistol: { grip: [X, 1.04, 0.565], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand', slideAt: [X, 1.172, 0.565], stopAt: [X + 0.03, 1.13, 0.662], hand: [0.04, 0.055] },
  deagle: { grip: [X, 1.04, 0.56], fore: [X - 0.05, 0.985, 0.6], blade: 0.12, pull: 0.09, kind: 'hand', slideAt: [X, 1.2, 0.585], stopAt: [X + 0.032, 1.122, 0.628], hand: [0.04, 0.055] },
  revolver: { grip: [X, 1.03, 0.5], fore: [X - 0.045, 0.985, 0.54], blade: 0.12, pull: 0.04, kind: 'hand', hand: [0.04, 0.05] },
  smg: { grip: [X, 1.0, 0.628], fore: [X, 0.99, 0.836], blade: 0.5, pull: 0.25, kind: 'long', post: true, hand: [0.06, 0] },   // (post: the hand's on a vertical foregrip, player/grip.js)
  pump: { grip: [X, 1.082, 0.445], fore: [X, 1.104, 0.915], blade: 0.58, pull: 0.16, kind: 'long', foreOnSlide: true, port: [X, 1.095, 0.66], hand: [0.022, 0.05] },
  dbl: { grip: [X, 1.07, 0.5], fore: [X, 1.094, 0.84], blade: 0.48, pull: 0.12, kind: 'long', port: [X, 1.14, 0.612], hand: [0.015, 0.05] },
  auto12: { grip: [X, 0.975, 0.5], fore: [X, 1.075, 0.98], blade: 0.58, pull: 0.21, kind: 'long', hand: [0.09, 0.1] },
  hunting: { grip: [X, 1.055, 0.49], fore: [X, 1.085, 0.82], blade: 0.46, pull: 0.15, kind: 'long', port: [X, 1.165, 0.7], hand: [0.022, 0.045] },
  sub: { grip: [X, 0.975, 0.548], fore: [X, 1.095, 0.92], blade: 0.58, pull: 0.21, kind: 'long', hand: [0.08, 0.05] },
  scar: { grip: [X, 0.99, 0.5], fore: [X, 1.097, 1.023], blade: 0.58, pull: 0.2, kind: 'long', post: true, hand: [0.09, 0.05] },
  ar: { grip: [X, 0.965, 0.47], fore: [X, 1.072, 0.95], blade: 0.58, pull: 0.2, kind: 'long', hand: [0.09, 0.05] },
  lmg: { grip: [X, 0.99, 0.48], fore: [X, 1.055, 0.9], blade: 0.58, pull: 0.17, kind: 'long', hand: [0.07, 0.05] }
};
const HOLD_DEF = { grip: [X, 1.04, 0.56], fore: [X - 0.045, 0.99, 0.6], blade: 0.12, pull: 0.1, kind: 'hand' };
// the arms are thick blocks aimed at those points, so a fist centred on the gun hides it from the camera above: the
// hands are aimed this far below them (metres, down the gun), the fist's top against the gun's underside, and the
// trigger hand out to its own side (out), so it takes the grip from the side and below rather than lying over the
// receiver. A long gun lies on the support hand and sits clear over the trigger hand; a handgun's grip is already
// below its slide, so its hands only drop a little
const HAND_DROP = { long: { grip: 0.06, out: 0.035, fore: 0.07 }, hand: { grip: 0.02, out: 0.015, fore: 0.015 } };
// but the gun still sits down in the trigger hand, the fist over the grip and the back of the guard and its top just
// under the slide, frame or receiver, so the top of the gun stays clear: hand is how far the gun sits lower and further
// back in the fist than its grip point would put it (metres, down and back in the gun's own frame). The arms don't move
// for it, only the gun (the fist's aimed up and forward on it by as much). The grip point itself is still where the
// gun's taken from a holster or the pack (player/stow.js, player/swap.js)
const HAND_0 = [0, 0];
// and the rest of keeping the gun in view: the arms a little slimmer than the body's blocks, a long gun carried a touch
// higher (LONG_RAISE) so the arms come up to it from below rather than level with it, and the wrists turned (HAND_ROLL):
// the support hand's palm up under the fore-end, the trigger hand's knuckles out round the grip
const ARM_THIN = 0.84, LONG_RAISE = 0.045, HAND_ROLL = { long: { R: -0.17, L: 0.24 }, hand: { R: -0.07, L: 0.13 } };
// each reload is done one of three ways, picked at random (weapons/reload.js), with the same timing: how far the gun
// is rolled over, pitched down, turned, lifted and drawn in for it. A mag change: rolled to show the well, held flatter
// and nosed down, or rolled hard and turned; feeding shells: tipped to show the port, flatter, or rolled further
const REL_MAG = [{ r: 0.5, p: 0.12, y: 0.12, oy: 0.04, oz: 0.08 }, { r: 0.32, p: 0.2, y: 0.04, oy: 0.02, oz: 0.1 }, { r: 0.68, p: 0.08, y: 0.18, oy: 0.05, oz: 0.06 }];
const REL_SHELL = [{ r: 0.45, p: 0.08, oy: 0.03, oz: 0.04 }, { r: 0.32, p: 0.14, oy: 0.02, oz: 0.06 }, { r: 0.58, p: 0.05, oy: 0.04, oz: 0.03 }];
const _rv = new V3();
// akimbo: each pistol out in its own hand, close enough in that both arms sit straight. Each is reloaded on its own
// turn (akU in weapons/akimbo.js says how far through it is), the other kept up on the aim
const AK_PULL = 0.1;
const REL_JIT0 = { k: 1, dx: 0, dy: 0, seed: 0 };
// and no one holds two guns the same: the right a touch higher and further out, the left lower, drawn back and in, each
// canted over toward the middle (the left more, a little gangster) and toed in, and each drifting on its own (f: how
// quickly). cant and toe in radians, the rest in metres
const AK_HAND = {
  R: { cant: 0.2, toe: 0.03, p: -0.012, up: 0.012, fwd: 0.018, in: 0, f: 1.3 },
  L: { cant: 0.3, toe: 0.05, p: 0.035, up: -0.022, fwd: -0.03, in: 0.012, f: 1.75 }
};
// Vault fire with a pair: the left hand's needed for the vault, so its gun goes away for it (into the shoulder rig
// under your right arm, or onto your back) and is drawn again after: over AK_DRAW seconds the hand goes to it, pulls it
// at AK_GRAB of the way and brings it up to the aim. A pistol's is drawn across the chest from the rig (rigDraw);
// AK_DRAW_AT is where one off the back is drawn from: the gun's pitch there, and how far down, back and out (side: a
// pistol pair's on the hip, kept for one not in the rig)
const AK_DRAW = 0.55, AK_GRAB = 0.4, AK_DRAW_AT = { side: { p: 1.3, y: -0.42, z: -0.3, x: 0.07 }, auto: { p: -1.1, y: 0.1, z: -0.48, x: 0.02 } };
// free aim: the arms don't turn in lockstep with the body. As you turn, the arms and the gun lag behind (a heavy gun
// more), swinging round from the shoulders, then swing on past and settle; looking up or down the same. A loose spring
// per axis; FREE_SWING is how far out from the shoulders the swing reaches, so the hands carry with it
const FREE_AIM = { yaw: 0, vy: 0, pitch: 0, vp: 0, last: null, lastP: 0 }, FREE_SWING = 0.26;
function freeAim(rdt, heavy, ads) {
  const F = FREE_AIM; if (!(rdt > 0)) return F;
  const yw = ANIM.chestYaw ?? ANIM.yaw;   // the chest's turning (player/animation.js), not the hips'
  if (F.last === null) { F.last = yw; F.lastP = ANIM.pitch || 0; }
  const turn = clamp(angDiff(yw, F.last) / rdt, -14, 14), tilt = clamp(((ANIM.pitch || 0) - F.lastP) / rdt, -6, 6);
  F.last = yw; F.lastP = ANIM.pitch || 0;
  const lag = (heavy ? 0.06 : 0.045) * (1 - 0.5 * ads), ty = clamp(-turn * lag, -0.2, 0.2), tp = clamp(-tilt * lag * 0.6, -0.12, 0.12);
  for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
    F.vy += ((ty - F.yaw) * 75 - F.vy * 9.5) * h; F.yaw += F.vy * h;
    F.vp += ((tp - F.pitch) * 75 - F.vp * 9.5) * h; F.pitch += F.vp * h;
  }
  return F;
}
// how far the hunting rifle's bolt handle turns up to unlock (radians)
const BOLT_TURN = 1.05;
// the gun riding a rack: a loose spring per axis (muzzle pitch, roll, yaw, back into the shoulder, down, and the
// torso's twist) chasing where working the action pulls it, knocked again at each stop (rackKick, from
// weapons/casings.js), so it lags behind the hand, overshoots and settles instead of moving in lockstep with the action
const RACK = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, z: 0, vz: 0, h: 0, vh: 0, w: 0, vw: 0 }, RACK_K = 130, RACK_D = 10;
function rackKick(p, r, z) { RACK.vp += p; RACK.vr += r * rr(0.85, 1.15); RACK.vz += z; }
function stepRack(rdt, t) {
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++)
    for (const a of ['p', 'r', 'y', 'z', 'h', 'w']) springTo(RACK, a, 'v' + a, t[a], a === 'z' ? RACK_K * 1.3 : a === 'w' ? RACK_K * 0.6 : RACK_K, RACK_D, dt);
}
const _rackT = { p: 0, r: 0, y: 0, z: 0, h: 0, w: 0 };
// the reload's own motion: where a reload wants the gun (its pose for the kind of reload, and how it rolls and tips
// through it: over to shake the old mag out, easing back while the hand's at the pouch, rolled and tipped to meet the
// new one, rocking with each shell thumbed in), and where the head and chest go with it (down at the gun, round to the
// pouch), chased on a slightly loose spring per axis. So a reload eases in and out, one cut short by a swap, a vault or
// a bandage runs back rather than snapping, and the beats of it (relKnock: the mag shaken out, the new one slapped home,
// a shell pushed in, a slide or cylinder slammed) knock it and it rocks back. Muzzle pitch (down is +), roll (toward
// the support hand is -), yaw, up (h), back (z), the head's pitch and turn (hp, hy) and the chest's (tw)
const ACT = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, h: 0, vh: 0, z: 0, vz: 0, hp: 0, vhp: 0, hy: 0, vhy: 0, tw: 0, vtw: 0 }, ACT_K = 260, ACT_D = 26;
const ACT_AX = ['p', 'r', 'y', 'h', 'z', 'hp', 'hy', 'tw'], _actT = { p: 0, r: 0, y: 0, h: 0, z: 0, hp: 0, hy: 0, tw: 0 };
function relKnock(p, r, h, z) { ACT.vp += p; ACT.vr += r * rr(0.85, 1.15); ACT.vh += h || 0; ACT.vz += z || 0; }
const REV_OPEN = 0.06, REV_SWING = 1.75, REV_OUT = [0.012, 0.01];   // the revolver's cylinder: how soon it's out, how far it swings (radians) and is carried out and down (m)
// and flicked shut (player/hold.js, the crane): the wrist cants the gun a touch further open (wind: seconds, its kick
// to the gun's roll), then snaps it hard the other way (snap), the cylinder swinging home on it a moment later (swing:
// how fast it's flung) and latching with a click and the faintest rebound (rebound, of its speed)
const REV_FLICK = { wind: 0.07, windKick: 2.6, snap: 13, snapYaw: 1.6, snapPitch: 2.2, swing: 10, rebound: 0.1 };
const bump = (t, a, b) => Math.sin(Math.PI * clamp((t - a) / (b - a), 0, 1));   // 0, up to 1 and back to 0 between a and b
// each gun's recoil, a spring per hand: muzzle flip (p, up is negative), drive back (z), lift (h), roll (r) and a kick
// to the side (y). A shot throws the gun up and back; a beat later the hands haul it back down (drop), so a strong gun
// dips past where it was aimed before it settles home smoothly. No two shots are quite alike: how hard each way, which
// way it rolls and kicks, when and how hard it's hauled down. Pistols flip, long guns shove back into the shoulder; a
// light gun or one on full auto just flips and settles. A handgun's kick goes with less than its power (pw^0.6), so even
// a 9mm snaps the wrists up a few degrees and drives back, and the hand cannons don't fly out of the hands. The flip is
// held to a few degrees a shot (about 5 for a 9mm, 10 for a hand cannon or a rifle), and however fast you fire, the
// muzzle never climbs past KICK_UP: each shot has less room to throw it up the higher it already is (KICK_ROOM), and
// what it shows is eased into that ceiling (kickPitch) instead of stopping dead against it
const KICK_UP = 0.16, KICK_ROOM = 0.6;
const kickPitch = p => p < 0 ? -KICK_UP * Math.tanh(-p / KICK_UP) : p;
const kickState = () => ({ p: 0, vp: 0, z: 0, vz: 0, h: 0, vh: 0, r: 0, vr: 0, y: 0, vy: 0, dropT: 0, dP: 0, dH: 0, dZ: 0, ret: 1 });
const RK = { R: kickState(), L: kickState() };
// the rest of the kick goes into the body: the shot rocks the shoulders back (x) and twists the shooting shoulder back
// (y), on a heavier, slower spring than the hands', and the arms ride it, so the gun's thrown up and back by the
// shoulders while the wrists hold most of the lean off the muzzle (poseGun: SR.x back into the pitch). A pump or a bolt
// gun (act) thumps hardest: more flip, a harder shove back into the shoulder, the hands lifted further and the
// shoulders rocked much further (KICK_ACT). The bolt-action rifle comes back from its kick slower than the rest
// (KICK_BOLT_RET of the speed, the same height), a heavy gun settling back onto the shoulder
const SR = { x: 0, vx: 0, y: 0, vy: 0, ret: 1 }, SR_MAX = 0.14, KICK_ACT = { flip: 0.9, back: 1.6, lift: 0.9, rock: 1.0 }, KICK_BOLT_RET = 0.55;
// how much a shot turns the gun (its flip up, roll, yaw and the shoulder's rock), on every gun, and less again on a full
// automatic, whose kicks come too fast to settle between
const KICK_ROT = 0.42, KICK_ROT_AUTO = 0.6;
// how each kind of gun kicks (recoilFeel picks one): back, how hard it's driven back along the aim; flip, how far the
// muzzle's thrown up; body, how hard the chest and shoulders take it (the shoulders' rock and the whole upper body shoved
// back, BR); ret, how quickly it all comes home (the hands' springs stiffer or looser); jit, a kick to the side each shot.
// A handgun snaps: it flicks up off the wrists and is straight back on the aim. A shotgun shoves: a big push back into
// the shoulder that rocks the body and takes its time to come back. A rifle thumps: a heavy straight push. Automatic
// fire chatters: short quick kicks that buzz side to side
const RECOIL_FEEL = {
  snap: { back: 1.0, flip: 1.15, body: 0.9, ret: 1.25, jit: 0.5 },
  shove: { back: 1.2, flip: 0.75, body: 1.1, ret: 0.85, jit: 0.35 },
  thump: { back: 1.15, flip: 1.0, body: 1.35, ret: 0.9, jit: 0.25 },
  chatter: { back: 0.85, flip: 0.85, body: 0.7, ret: 1.4, jit: 1.7 }
};
const recoilFeel = (D, kind, auto) => auto ? 'chatter' : kind === 'hand' ? 'snap' : D && D.ammo === 'shells' ? 'shove' : 'thump';
// the upper body shoved back along the aim by a shot (z, metres), and leant back with it (BR_LEAN radians a metre): on
// a heavier spring than the hands', so the chest takes the shot a beat after the gun and settles back under it. It's
// what reads from above: the gun driven back with the shooter rocking under it
const BR = { z: 0, vz: 0 }, BR_LEAN = 0.6, BR_MAX = 0.07;
// act: how the gun cycles (EJECT in weapons/casings.js)
function gunKick(side, pw, kind, auto, act, feel) {
  const k = RK[side], hand = kind === 'hand', big = smooth(clamp((pw - 0.25) / 0.75, 0, 1)), a = 1 - 0.3 * (ANIM.ads || 0), hp = Math.pow(pw, 0.6), rot = KICK_ROT * (auto ? KICK_ROT_AUTO : 1);
  const room = 1 - KICK_ROOM * clamp(-k.p / KICK_UP, 0, 1);
  const A = act === 'pump' || act === 'bolt' ? KICK_ACT : null, F = RECOIL_FEEL[feel] || RECOIL_FEEL.thump, bolt = act === 'bolt' ? KICK_BOLT_RET : 1;
  // (a bolt gun's slower return on a spring as stiff in proportion keeps the kick's height: its impulses are scaled with it)
  const v0 = [k.vp, k.vz, k.vh, k.vr, k.vy, SR.vx, SR.vy];
  const flip = (hand ? 9.5 * hp * (auto ? 0.7 : 1) : pw * 4.9 * (1 + 0.4 * big)) * a * room * (A ? A.flip : 1) * rot * F.flip;
  k.ret = F.ret * bolt; SR.ret = bolt;
  k.vp -= flip * rr(0.85, 1.2); k.vz -= (hand ? 2.2 * hp : pw * 3) * a * rr(0.85, 1.2) * (A ? A.back : 1) * F.back; k.vh += (hand ? 0.9 * hp * (0.4 + 0.6 * big) : pw * 0.4 * big) * a * rr(0.8, 1.2) * (A ? A.lift : 1);
  const rock = (hand ? 0.9 * hp : 1.4 * pw) * (A ? A.rock : 1) * (1 - 0.6 * clamp(SR.x / SR_MAX, 0, 1)) * rot * F.body;   // (less room to rock the further back they already are)
  SR.vx += rock * rr(0.85, 1.15); SR.vy += (side === 'L' ? -1 : 1) * rock * 1.1 * rr(0.8, 1.2);
  BR.vz += (hand ? 0.35 * hp : 0.6 * pw) * F.body * (A ? 1.3 : 1) * (1 - 0.5 * (ANIM.ads || 0)) * (1 - 0.7 * clamp(BR.z / BR_MAX, 0, 1)) * rr(0.85, 1.15);
  k.vr += (rand() < 0.5 ? -1 : 1) * (hand ? 2.4 * hp : pw * 1.6) * rr(0.7, 1.2) * rot; k.vy += rr(-1, 1) * (hand ? 1.3 * hp : pw * 0.8) * rot * F.jit;
  if (big > 0.05 && !auto) { const d = big * rr(0.8, 1.05) * bolt; k.dropT = rr(0.07, 0.1) / (F.ret * bolt); k.dP = flip * d; k.dH = -pw * 0.9 * d; k.dZ = pw * 0.8 * d; }
  if (bolt !== 1) { k.vp = v0[0] + (k.vp - v0[0]) * bolt; k.vz = v0[1] + (k.vz - v0[1]) * bolt; k.vh = v0[2] + (k.vh - v0[2]) * bolt; k.vr = v0[3] + (k.vr - v0[3]) * bolt; k.vy = v0[4] + (k.vy - v0[4]) * bolt; SR.vx = v0[5] + (SR.vx - v0[5]) * bolt; SR.vy = v0[6] + (SR.vy - v0[6]) * bolt; }
}
function stepKick(k, dt) {
  const r = k.ret || 1, s = r * r;   // (a gun's feel: its springs stiffer, so it's home sooner, or looser; damped in proportion)
  for (let n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
    if (k.dropT > 0 && (k.dropT -= h) <= 0) { k.vp += k.dP; k.vh += k.dH; k.vz += k.dZ; }   // hauled back down, just past the peak
    k.vp += (-380 * s * k.p - 30 * r * k.vp) * h; k.p = clamp(k.p + k.vp * h, -0.7, 0.25);
    k.vz += (-380 * s * k.z - 26 * r * k.vz) * h; k.z += k.vz * h;
    k.vh += (-340 * s * k.h - 25 * r * k.vh) * h; k.h += k.vh * h;
    k.vr += (-300 * s * k.r - 22 * r * k.vr) * h; k.r += k.vr * h;
    k.vy += (-320 * s * k.y - 24 * r * k.vy) * h; k.y += k.vy * h;
  }
}
function stepRock(dt) {
  const s = SR.ret, s2 = s * s;
  for (let n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
    SR.vx += (-200 * s2 * SR.x - 20 * s * SR.vx) * h; SR.x = clamp(SR.x + SR.vx * h, -0.05, SR_MAX);
    SR.vy += (-170 * s2 * SR.y - 18 * s * SR.vy) * h; SR.y = clamp(SR.y + SR.vy * h, -SR_MAX, SR_MAX);
    BR.vz += (-240 * BR.z - 23 * BR.vz) * h; BR.z = clamp(BR.z + BR.vz * h, -0.02, BR_MAX);
  }
}
const POUCH = new V3(-0.21, 0.8, 0.16);   // the left hip pouch, in upper-body space: mags and shells come from here
// the fresh mag in the support hand: taken from the pouch at MAG_TAKE of the mag change, it rides in the fist (wrapped
// round it low on its left side, MAG_GRIP of the way down) along a swing of keys to the gun: drawn up out of the pouch,
// carried out and round, lined up under the well along the mag's own length, its edge hooked in, then rocked straight and
// pushed home as it seats (MAG_SEAT, when the reload hears it: weapons/reload.js). Its tip is keyed with it, so it turns
// as it goes rather than at the end. The way is worked out in the gun's own frame, so it stays with the gun as the reload
// rolls and tips it, and the hand is put where the mag is held: never off it
// how far the old mag slides down out of the well before it falls free (it speeds up all the way: weapons/casings.js
// carries that speed on into its fall)
const MAG_SLIDE = 0.12;
const MAG_TAKE = 0.42, MAG_GRIP = 0.68, MAG_DRAW = new V3(0.03, 0.08, 0.1);   // (out of the pouch: up and forward, clear of the shoulder)
// by reload style (W8.relStyle), after the pouch and the draw up out of it (the first key, at the pouch plus MAG_DRAW):
// [u, where the mag's top is off the well's mouth (x out to the right, y up, z forward, along the mag's own seated
// lean, so "below" is down a raked grip), its tip (x: top tipped forward, the foot back toward you; z: rolled)]
const MAG_WAY = [
  // swung out low to the left, brought in under the well, lined up with it and pushed straight up home
  [[0.16, null, [0.8, 0.5]], [0.44, [-0.17, -0.2, 0.08], [0.48, 0.42]], [0.7, [-0.03, -0.1, -0.012], [0.18, 0.1]], [0.86, [0, -0.03, -0.004], [0.08, 0.01]]],
  // brought round from in front, its front hooked into the well first, rocked back and slapped in
  [[0.16, null, [0.8, 0.5]], [0.42, [-0.13, -0.18, 0.2], [0.1, 0.34]], [0.7, [0, -0.048, 0.034], [-0.34, 0.05]], [0.87, [0, -0.012, 0.009], [-0.11, 0]]],
  // out wide and round from behind, its back hooked in first, rocked forward home
  [[0.16, null, [0.8, 0.5]], [0.44, [-0.21, -0.16, -0.17], [0.7, 0.42]], [0.7, [-0.02, -0.06, -0.045], [0.38, 0.08]], [0.87, [0, -0.013, -0.009], [0.12, 0]]]
];
// an AK mag (the battle rifle's AK kit): brought up in front of the well with its foot swung forward, its front lug
// hooked into the well first, then rocked back about it until the catch clicks
const AKM_WAY = [[0.16, null, [0.8, 0.5]], [0.44, [-0.12, -0.2, 0.16], [-0.3, 0.32]], [0.66, [0, -0.034, 0.024], [-0.48, 0.04]], [0.78, [0, -0.012, 0.009], [-0.22, 0]], [0.9, [0, -0.002, 0.001], [-0.03, 0]]];
// and the old one out: thumb on the paddle, the mag rocked forward about its front lug (AKM_ROCK, radians, its foot
// swinging forward) and pulled down out of the well (AKM_PULL) as it comes free; where that lug is in the gun (AKM_LUG)
const AKM_ROCK = 0.5, AKM_PULL = 0.05, AKM_LUG = [1.094, 0.738];
const MAG_POUCH_TIP = [0.85, 0.5];   // how it's tipped in the pouch, in the gun's frame
const _mInv = new THREE.Matrix4(), _mM = new THREE.Matrix4(), _mE = new THREE.Euler(), _mQ = new V3(), _mG = new V3(), _mBox = new THREE.Box3(), _mV = new V3();
const _mK = [], _mTk = [], _mX = new V3(1, 0, 0);   // the way's keys: where the top is, its tip
// the mag's extent in the hold's frame as it sits in the gun: the middle of its top (where it goes into the well), how
// long and wide it is, and its lean (a pistol's raked grip; the straight top of a curved mag), forward of straight up
function magShape(mg) {
  if (mg.userData.shape !== undefined) return mg.userData.shape;
  // (from its vertices, not the geometries' bounding boxes: those can be stale, from before a part was moved into place)
  mg.position.set(0, 0, 0); mg.rotation.set(0, 0, 0); mg.updateMatrixWorld(true); _mInv.copy(mg.matrixWorld).invert(); _mBox.makeEmpty();
  let main = null, mh = 0;
  mg.traverse(o => { if (!o.isMesh) return; _mM.multiplyMatrices(_mInv, o.matrixWorld); const ps = o.geometry.attributes.position, pts = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ps.count; i++) { const q = new V3().fromBufferAttribute(ps, i).applyMatrix4(_mM); pts.push(q); _mBox.expandByPoint(q); lo = Math.min(lo, q.y); hi = Math.max(hi, q.y); }
    if (hi - lo > mh) { mh = hi - lo; main = { pts, top: hi, ix: o.geometry.index }; } });
  if (_mBox.isEmpty()) return (mg.userData.shape = null);
  const len = _mBox.max.y - _mBox.min.y;
  // its lean, from the body of it (the tallest part): the middle of its depth where it's cut across a little way down
  // from the top (below a raked top's slant and the feed lips) and a little further (a curved mag's straight top; a
  // pistol mag at its grip's rake)
  const mid = y => { let lo = Infinity, hi = -Infinity; const P = main.pts, I = main.ix, n = I ? I.count : P.length, at = i => P[I ? I.getX(i) : i];
    for (let i = 0; i + 2 < n; i += 3) for (let e = 0; e < 3; e++) { const a = at(i + e), b = at(i + (e + 1) % 3);
      if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue; const z = a.z + (b.z - a.z) * (y - a.y) / (b.y - a.y); lo = Math.min(lo, z); hi = Math.max(hi, z); }
    return lo <= hi ? (lo + hi) / 2 : null; };
  const t = main.top, za = mid(t - 0.18 * mh), zb = mid(t - 0.36 * mh), lean = za !== null && zb !== null ? clamp(Math.atan2(za - zb, 0.18 * mh), -0.6, 0.6) : 0;
  return (mg.userData.shape = { top: new V3((_mBox.min.x + _mBox.max.x) / 2, _mBox.max.y, za !== null ? za + Math.tan(lean) * 0.18 * mh : (_mBox.min.z + _mBox.max.z) / 2), len, w: _mBox.max.x - _mBox.min.x, lean });
}
// put the mag where it is at rpm of the mag change (between MAG_TAKE and MAG_SEAT) and return where the fist holding it
// is, in upper-body space (out); null when the gun has no mag of its own to carry
function magInHand(out, s, H, mg, rpm) {
  const sh = magShape(mg); if (!sh) return null;
  const hq = holdOf(s, 'R'), lg = H.kind === 'long', way = W(W8.slot[s]) && W(W8.slot[s]).akKit ? AKM_WAY : MAG_WAY[W8.relStyle || 0] || MAG_WAY[0], k = lg ? 1 : 0.5, kp = lg ? 1 : 0.7;   // a handgun's tipped less, swung a little closer in
  const u = clamp((rpm - MAG_TAKE) / (MAG_SEAT - MAG_TAKE), 0, 1), P0 = sh.top, n = way.length + 2;
  _mM.multiplyMatrices(gunMeshes[s].matrix, hq.matrix); _mInv.copy(_mM).invert();
  while (_mK.length < n) { _mK.push([0, new V3()]); _mTk.push([0, new V3()]); }
  // the grip (from the mag's top: low on its left side, down its lean) under a tip, and where the top is with that grip on p
  const grip = (o, ex, ez) => o.set(-sh.w / 2 - 0.01, -sh.len * MAG_GRIP, 0).applyAxisAngle(_mX, sh.lean).applyEuler(_mE.set(ex, 0, ez));
  const topAt = (o, p, ex, ez) => o.copy(p).applyMatrix4(_mInv).sub(grip(_mG, ex, ez));
  // the keys: the pouch, drawn up out of it, the style's way (along the mag's lean, a handgun's closer in), home
  _mK[0][0] = 0; topAt(_mK[0][1], POUCH, MAG_POUCH_TIP[0] * k, MAG_POUCH_TIP[1] * k); _mTk[0][0] = 0; _mTk[0][1].set(MAG_POUCH_TIP[0] * k, MAG_POUCH_TIP[1] * k, 0);
  for (let i = 0; i < way.length; i++) {
    const [t, at, tip] = way[i], K = _mK[i + 1], TK = _mTk[i + 1];
    K[0] = TK[0] = t; TK[1].set(tip[0] * k, tip[1] * k, 0);
    if (!at) topAt(K[1], _mV.copy(POUCH).add(MAG_DRAW), TK[1].x, TK[1].y);
    else { K[1].set(at[0] * kp, at[1] * (lg ? 1 : 0.75), at[2] * kp).applyAxisAngle(_mX, sh.lean).add(P0); }
  }
  _mK[n - 1][0] = _mTk[n - 1][0] = 1; _mK[n - 1][1].copy(P0); _mTk[n - 1][1].set(0, 0, 0);
  _mK.length = _mTk.length = n;
  walkPath(_mQ, _mK, u); walkPath(_mV, _mTk, u);
  const ex = _mV.x, ez = _mV.y; grip(_mG, ex, ez);   // (leaves _mE at this tip)
  // the group's own transform, so its contents (laid out in the hold's frame, seated) land at that top and tip
  mg.visible = true; mg.rotation.copy(_mE); mg.position.copy(P0).applyEuler(_mE).negate().add(_mQ);
  MAG_CARRY.u = u; MAG_CARRY.mg = mg; MAG_CARRY.p0 = P0;
  return out.copy(_mQ).add(_mG).applyMatrix4(_mM);
}
// then the mag goes where the fist really got to (a beat behind where it was sent, on its spring), so it's never out of
// it; over the last of the way (MAG_GUIDE on) the fist is drawn onto its mark instead, so the mag it carries seats exactly
const MAG_CARRY = { u: -1, mg: null, p0: null }, MAG_GUIDE = 0.62, _mF = new V3();
function magToFist(fist, want) {
  const c = MAG_CARRY; if (c.u < 0 || !c.mg) return;
  const g = smooth(clamp((c.u - MAG_GUIDE) / (1 - MAG_GUIDE), 0, 1));
  if (want && g > 0) { fist.lerp(want, g); HAND.L.free.lerp(want, g); }   // (its spring too, so it lets go of the mag where it is)
  armReach('L', fist);   // (and only as far as the arm goes)
  _mF.copy(fist).applyMatrix4(_mInv).sub(_mG);   // where its top is with the grip in the fist (in the hold's frame)
  c.mg.position.copy(c.p0).applyEuler(_mE).negate().add(_mF);
  c.u = -1;
}
// a hand that leaves the gun blends out to a free target and back; w is how far off the gun it is
const HAND = { L: { w: 0, free: new V3(-0.2, 0.8, 0.2) }, R: { w: 0, free: new V3(0.2, 0.8, 0.2) } };
const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new V3(), _akH = new V3();
const SUPPORT_REACH = 1.27, SUPPORT_KNEE = 0.03, _sup = new V3(), _hL = new V3(), _hR = new V3(), _fL = new V3(), _fR = new V3(), _p1 = new V3(), _p2 = new V3(), _p3 = new V3(), _p4 = new V3(), _p5 = new V3(), _p6 = new V3();

// pose a group: rotate by (rx, ry, rz) about the point p (in its own coordinates), shift by o, then turn the lot by yaw0
function posePivot(g, rx, ry, rz, px, py, pz, ox, oy, oz, yaw0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(px, py, pz).applyQuaternion(_q);
  g.position.set(px - _v.x + ox, py - _v.y + oy, pz - _v.z + oz); g.quaternion.copy(_q);
  if (yaw0) { _qy.setFromAxisAngle(Y_AX, yaw0); g.position.applyQuaternion(_qy); g.quaternion.premultiply(_qy); }
  g.updateMatrix();
}
// the gun pushed back off whatever's in front of you (barrelFree in weapons/firing.js), the way Tarkov or Insurgency:
// Sandstorm do it: slid straight back along its barrel toward you, hands and all, up to GUN_BACK. A wall closer still tips the
// muzzle up about the grip till it clears (up to GUN_TIP); a zombie doesn't, it's shot point blank. It comes in fast and
// eases back out, and the gun still fires, from where its muzzle's been pushed back to (ANIM.barrel: muzzle in
// weapons/firing.js). rd (a sprint's low ready) takes it away. A pair are two guns: each is pushed back and tipped
// on its own (GP[side], put on its hold in poseGun), so one up against a wall leaves the other out, and each fires
// from its own muzzle (ANIM.barrelS). A shove driving the gun out at what's there (shv) isn't pushed back off it: it's
// measured from where the gun would be without the shove, so the blow lands and eases back to the hold on its own
const GUN_BACK = { long: 0.4, hand: 0.2 }, GUN_TIP = 1.2;
const _gbM = new V3(), _gbF = new V3(), _gbG = new V3(), _gbQ = new THREE.Quaternion();
const GP = { R: { back: 0, tip: 0, a: 0 }, L: { back: 0, tip: 0, a: 0 } };
function gunPush(gg, s, H, ak, rd, rdt, shv) {
  _gbF.set(0, 0, 1).applyQuaternion(gg.quaternion); const fl = Math.hypot(_gbF.x, _gbF.z) || 1, fx = _gbF.x / fl, fz = _gbF.z / fl;
  const fwdOf = v => v.x * fx + v.z * fz, lg = H.kind === 'long' ? 'long' : 'hand', k = 1 - rd;
  const ease = (o, key, t) => { const c = o[key] || 0; return (o[key] = c + (t - c) * (1 - Math.exp(-rdt * (t > c ? 28 : 10)))); };
  // where the muzzle and grip of the gun in this hand sit as posed, before any push (the hold's own kick left out)
  const at = (out, side, x, y, z) => out.set(x + ((HOLDS[s] && HOLDS[s][side] && HOLDS[s][side].userData.x0) || 0), y, z).applyMatrix4(gg.matrix);
  let needW = 0, needZ = 0, free = Infinity, reach = 0;
  ANIM.barrelS = ANIM.barrelS || { R: Infinity, L: Infinity };
  for (const side of ak ? ['R', 'L'] : ['R']) {
    at(_gbM, side, X, GUN_Y + 0.03, (MUZ[s] || 0.9) + 0.02);
    const fwd = fwdOf(_gbM), fs = fwd - (shv || 0), f = barrelFree(_gbM.x * fz - _gbM.z * fx, fs + BARREL.clear + 0.05), nW = fs + BARREL.clear - f.wall, nZ = fs + BARREL.clear - f.zom;
    ANIM.barrelS[side] = Math.min(f.wall, f.zom);
    if (ak) {   // this gun on its own: back along its barrel, then tipped about its grip
      const p = GP[side], tW = Math.max(0, nW) * k, tB = Math.min(GUN_BACK[lg], Math.max(tW, Math.max(0, nZ) * k));
      ease(p, 'back', tB); ease(p, 'tip', Math.max(0, tW - GUN_BACK[lg]));
      at(_gbG, side, H.grip[0], H.grip[1], H.grip[2]);
      p.a = p.tip > 0.001 ? Math.min(GUN_TIP, Math.acos(clamp(1 - p.tip / Math.max(0.05, fwd - fwdOf(_gbG)), -1, 1))) : 0;
      continue;
    }
    free = Math.min(free, f.wall, f.zom); reach = Math.max(reach, fwd);
    needW = Math.max(needW, nW); needZ = Math.max(needZ, nZ);
  }
  if (ak) { ANIM.barrel = Math.min(ANIM.barrelS.R, ANIM.barrelS.L); return; }
  GP.R.back = GP.L.back = GP.R.tip = GP.L.tip = GP.R.a = GP.L.a = 0;
  ANIM.barrel = free;
  const tW = Math.max(0, needW) * k, tB = Math.min(GUN_BACK[lg], Math.max(tW, Math.max(0, needZ) * k));
  const back = ease(ANIM, 'gpush', tB), tip = ease(ANIM, 'gtip', Math.max(0, tW - GUN_BACK[lg]));
  if (back < 0.001 && tip < 0.001) return;
  _gbM.set(0, 0, -back).applyQuaternion(gg.quaternion); gg.position.add(_gbM); gg.updateMatrix();
  if (tip > 0.001) {
    gunPt(_gbG, s, 'R', H.grip[0], H.grip[1], H.grip[2]);
    const a = Math.min(GUN_TIP, Math.acos(clamp(1 - tip / Math.max(0.05, reach - back - fwdOf(_gbG)), -1, 1)));
    _gbF.set(1, 0, 0).applyQuaternion(gg.quaternion); _gbQ.setFromAxisAngle(_gbF, -a);   // (about its own right axis, muzzle up)
    gg.position.sub(_gbG).applyQuaternion(_gbQ).add(_gbG); gg.quaternion.premultiply(_gbQ); gg.updateMatrix();
  }
}
// one of a pair laid flat across the chest as if it hung on a sling, while its hand charges the other: the muzzle
// across the body to the other side, dipping AK_SLING.dip, a flat side to the chest, the grip at AK_SLING's x, y, z
// (upper-body space, x out to its own side). c blends it there from the hold just posed (ox, oy, oz its offsets)
const AK_SLING = { x: 0.09, y: 0.8, z: 0.305, dip: 0.25, k: 160, d: 25 }, _akSQ = new THREE.Quaternion(), _akSM = new THREE.Matrix4(), _akSG = new V3(), _akSX = new V3(), _akSU = new V3(), _akSD = new V3();
function akSling(h, g, sg, c, ox, oy, oz) {
  const a = AK_SLING.dip;
  _akSD.set(-sg * Math.cos(a), -Math.sin(a), 0); _akSU.set(-sg * Math.sin(a), Math.cos(a), 0); _akSX.crossVectors(_akSU, _akSD);
  _akSQ.setFromRotationMatrix(_akSM.makeBasis(_akSX, _akSU, _akSD));
  _akSG.set(g[0] + ox, g[1] + oy, g[2] + oz).lerp(_v.set(sg * AK_SLING.x, AK_SLING.y, AK_SLING.z), c);
  h.quaternion.slerp(_akSQ, c);
  h.position.copy(_akSG).sub(_v.set(g[0], g[1], g[2]).applyQuaternion(h.quaternion));
  h.updateMatrix();
}
// the left gun of a rig pair, w of the way from the hold just posed to where it rides under the right arm (its copy's
// frame there, brought into the hold's parent's space), turned about its grip so it comes round in the hand
const _rdM = new THREE.Matrix4(), _rdP = new V3(), _rdQ = new THREE.Quaternion(), _rdS = new V3(), _rdG = new V3(), _rdC0 = new V3(), _rdC1 = new V3();
function rigDraw(h, w) {
  if (w <= 0.001) return;
  PM.g.updateMatrixWorld(true);
  _rdM.copy(h.parent.matrixWorld).invert().multiply(STOW.side.userData.gun2.matrixWorld).decompose(_rdP, _rdQ, _rdS);
  const gp = (HOLD[W8.slot.side] || HOLD_DEF).grip; _rdG.set(gp[0], gp[1], gp[2]);
  _rdC0.copy(_rdG).applyQuaternion(h.quaternion).add(h.position); _rdC1.copy(_rdG).applyQuaternion(_rdQ).add(_rdP);
  h.quaternion.slerp(_rdQ, w); h.position.copy(_rdC0.lerp(_rdC1, w)).sub(_rdG.applyQuaternion(h.quaternion)); h.updateMatrix();
}
// the arm angles that put the fist on t (upper-body space); arms are straight blocks, so they stretch a touch or shorten
// (a gun pushed in, a hand down at the pouch) to put the fist on it
const ARM_SHORT = 0.55, ARM_LONG = 1.3;   // how far an arm shortens or stretches from FIST
function armAim(side, t, rest) {
  const s = (rest ? SHOULDER_REST : SHOULDER)[side], dx = t.x - s[0], dy = t.y - s[1], dz = t.z - s[2], len = Math.hypot(dx, dy, dz) || 1;
  return [Math.atan2(-dy / len, dz / len), Math.asin(clamp(dx / len, -1, 1)), clamp(len / FIST, ARM_SHORT, ARM_LONG)];
}
// where an arm's fist really gets to, sent to v (in upper-body space): as far along toward it as the arm will go
const _arV = new V3();
function armReach(side, v) {
  const s = SHOULDER[side], l = _arV.set(v.x - s[0], v.y - s[1], v.z - s[2]).length() || 1, c = clamp(l, ARM_SHORT * FIST, ARM_LONG * FIST);
  return c === l ? v : v.set(s[0], s[1], s[2]).addScaledVector(_arV, c / l);
}
function reach(arm, side, t, roll, rest) {
  const [rx, ry, sc] = armAim(side, t, rest), s = (rest ? SHOULDER_REST : SHOULDER)[side];
  arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, roll || 0); arm.scale.set(ARM_THIN, ARM_THIN, sc);
}
function armRest(arm, side, rx, ry) { const s = SHOULDER_REST[side]; arm.position.set(s[0], s[1], s[2]); arm.rotation.set(rx, ry, 0); arm.scale.set(ARM_THIN, ARM_THIN, 1); }
// a point on the gun (hold-local) in upper-body space
const holdOf = (s, side) => (HOLDS[s] && (HOLDS[s][side] || HOLDS[s].R)) || gunMeshes[s];
function gunPt(out, s, side, x, y, z) { return out.set(x, y, z).applyMatrix4(holdOf(s, side).matrix).applyMatrix4(gunMeshes[s].matrix); }
// a walk along [time, point] keys that flows through them: it passes each key at its time, but keeps moving through
// the ones on the way (a curve through its neighbours, so the hand swings round instead of stopping at every point)
// and only comes to rest where it's meant to wait (a key repeated) or at the ends
const _wpA = new V3(), _wpB = new V3();
function walkPath(out, keys, p) {
  let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= p) k++;
  const a = keys[k], b = keys[k + 1], dt = (b[0] - a[0]) || 1, u = clamp((p - a[0]) / dt, 0, 1);
  // the hand's speed through a key: along the line from the key before to the key after, none at a wait or an end
  const vel = (i, o) => {
    const prev = keys[i - 1], next = keys[i + 1], here = keys[i][1];
    if (!prev || !next || prev[1].distanceToSquared(here) < 1e-8 || next[1].distanceToSquared(here) < 1e-8) return o.set(0, 0, 0);
    return o.subVectors(next[1], prev[1]).multiplyScalar(1 / ((next[0] - prev[0]) || 1));
  };
  vel(k, _wpA); vel(k + 1, _wpB);
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return out.copy(a[1]).multiplyScalar(h00).addScaledVector(_wpA, h10 * dt).addScaledVector(b[1], h01).addScaledVector(_wpB, h11 * dt);
}
// a belt-fed gun's belt jiggles: two loose springs, a slow sway of the whole loop and a quicker ripple along it, shaken
// by how the gun moves and turns (its acceleration and gravity, felt in the gun's own frame, so a cant lets the loop sag
// sideways) and kicked by every shot (beltKick, from weapons/firing.js). Both ends are held, at the feed tray and in the
// box, so the middle of the loop swings the most
const BJ = { a: new V3(), va: new V3(), b: new V3(), vb: new V3(), p: new V3(), v: new V3(), f: new V3(), q: new THREE.Quaternion(), on: false };
function beltKick() { BJ.va.x += rr(-0.1, 0.1); BJ.va.y += rr(0.08, 0.2); BJ.vb.x += rr(-0.08, 0.08); BJ.vb.y += rr(-0.1, 0.1); }
function beltJiggle(belt, h, rdt) {
  if (rdt <= 0) return;
  BJ.f.set(X + 0.08, 1.16, 0.535).applyMatrix4(h.matrixWorld);
  if (!BJ.on) { BJ.p.copy(BJ.f); BJ.v.set(0, 0, 0); BJ.a.set(0, 0, 0); BJ.va.set(0, 0, 0); BJ.b.set(0, 0, 0); BJ.vb.set(0, 0, 0); BJ.on = true; }
  // the loop's own acceleration, turned into the gun's frame with gravity added (less the pull it hangs under when level)
  const vx = (BJ.f.x - BJ.p.x) / rdt, vy = (BJ.f.y - BJ.p.y) / rdt, vz = (BJ.f.z - BJ.p.z) / rdt;
  let ax = (vx - BJ.v.x) / rdt, ay = (vy - BJ.v.y) / rdt, az = (vz - BJ.v.z) / rdt; const am = Math.hypot(ax, ay, az); if (am > 60) { ax *= 60 / am; ay *= 60 / am; az *= 60 / am; }
  BJ.p.copy(BJ.f); BJ.v.set(vx, vy, vz);
  h.getWorldQuaternion(BJ.q).invert(); BJ.f.set(-ax, -9.8 - ay, -az).applyQuaternion(BJ.q); BJ.f.y += 9.8;
  for (let n = Math.ceil(rdt / (1 / 240)), dt = rdt / n, i = 0; i < n; i++) {
    BJ.va.addScaledVector(BJ.f, 0.7 * dt).addScaledVector(BJ.a, -1900 * dt).addScaledVector(BJ.va, -10 * dt); BJ.a.addScaledVector(BJ.va, dt);
    BJ.vb.addScaledVector(BJ.f, 0.5 * dt).addScaledVector(BJ.b, -5600 * dt).addScaledVector(BJ.vb, -22 * dt); BJ.b.addScaledVector(BJ.vb, dt);
  }
  BJ.a.set(clamp(BJ.a.x, -0.01, 0.01), clamp(BJ.a.y, -0.01, 0.01), clamp(BJ.a.z, -0.004, 0.004)); BJ.b.set(clamp(BJ.b.x, -0.004, 0.004), clamp(BJ.b.y, -0.004, 0.004), clamp(BJ.b.z, -0.002, 0.002));   // the ripple stays small, so the links stay hooked
  const n = belt.length; belt.forEach((r, k) => { const s = (k + 0.5) / n; r.position.copy(BJ.a).multiplyScalar(Math.sin(Math.PI * s)).addScaledVector(BJ.b, Math.sin(2 * Math.PI * s)); });
}
// a bipod's legs (the LMG's, weapons/gun-models.js) swing on their hinge with the gun, each on a soft spring, through
// everything it does: down on them, they're left behind as you walk, run and turn, as the gun comes up into the sights,
// rocks through a reload, comes out or goes away, and as it rides on your back (the yoke's own acceleration, in the
// gun's frame, swings them: push), splay a little as it's swung sideways (splay), and jump forward with every shot
// (shot, bipodKick); folded along the barrel they only rattle in their clamp (folded of it). How far they can go: max,
// radians. Each set of legs (the gun in your hands, the copy on your back: player/stow.js) keeps its own motion (st)
const BIPOD_SW = { k: 90, d: 4, push: 0.8, splay: 1, shot: 0.9, max: 0.4, folded: 0.12 };
function bipodKick() { const L = BIPOD[W8.cur]; if (L) L.forEach(l => { l.vx = (l.vx || 0) - BIPOD_SW.shot * rr(0.7, 1.2); l.vz = (l.vz || 0) + BIPOD_SW.shot * 0.35 * rr(-1, 1); }); }
function bipodSway(legs, h, rdt) {
  if (rdt <= 0) return;
  const st = legs.st || (legs.st = { p: new V3(), v: new V3(), f: new V3(), q: new THREE.Quaternion(), on: false });
  st.f.set(X, 1.1, 1.41).applyMatrix4(h.matrixWorld);   // (the yoke)
  if (!st.on) { st.p.copy(st.f); st.v.set(0, 0, 0); st.on = true; legs.forEach(l => { l.ax = l.az = l.vx = l.vz = 0; }); }
  const vx = (st.f.x - st.p.x) / rdt, vy = (st.f.y - st.p.y) / rdt, vz = (st.f.z - st.p.z) / rdt;
  let ax = (vx - st.v.x) / rdt, ay = (vy - st.v.y) / rdt, az = (vz - st.v.z) / rdt; const am = Math.hypot(ax, ay, az); if (am > 80) { ax *= 80 / am; ay *= 80 / am; az *= 80 / am; }
  st.p.copy(st.f); st.v.set(vx, vy, vz);
  h.getWorldQuaternion(st.q).invert(); st.f.set(-ax, -ay, -az).applyQuaternion(st.q);   // what the legs feel, in the gun's frame
  const S_ = BIPOD_SW;
  legs.forEach(l => {
    const amp = l.down ? 1 : S_.folded;
    for (let n = Math.ceil(rdt / (1 / 240)), dt = rdt / n, i = 0; i < n; i++) {
      l.vx += (-S_.push * st.f.z * amp - S_.k * l.ax - S_.d * l.vx) * dt; l.ax += l.vx * dt;
      l.vz += (S_.push * S_.splay * st.f.x * amp - S_.k * l.az - S_.d * l.vz) * dt; l.az += l.vz * dt;
    }
    const m = S_.max * amp; l.ax = clamp(l.ax, -m, m); l.az = clamp(l.az, -m * 0.5, m * 0.5);
    l.g.rotation.x = l.r0.x + l.ax; l.g.rotation.z = l.r0.z + l.az;
  });
}
// every frame, whatever's in your hands: each gun's bipod swung by its hold (so it carries on as the gun's put away or
// drawn), and left to start afresh from where the gun is next time it's shown after being hidden
function swayBipods(rdt) {
  for (const s of SLOTS) { const L = BIPOD[s]; if (!L) continue; if (!gunMeshes[s].visible) { if (L.st) L.st.on = false; continue; } bipodSway(L, holdOf(s, 'R'), rdt); }
}
// blend a hand between its spot on the gun and a free target; wt is how far off the gun it should be
// (on a critically damped spring, so it eases off the gun and back onto it instead of leaving at full speed)
function handTarget(out, side, onGun, free, wt, rdt, stiff) {
  const h = HAND[side], kf = stiff ? 1300 : 480, df = stiff ? 62 : 30;   // (stiff: carrying a fresh mag up to the gun)
  // the free hand follows its path on a loose spring: a beat behind it, settling with a little give when it stops
  if (free) {
    if (!h.fv || h.w < 0.01) { h.fv = h.fv || new V3(); h.free.copy(free); h.fv.set(0, 0, 0); }
    else if (rdt > 0) for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / n, i = 0; i < n; i++) {
      h.fv.x += (kf * (free.x - h.free.x) - df * h.fv.x) * dt; h.fv.y += (kf * (free.y - h.free.y) - df * h.fv.y) * dt; h.fv.z += (kf * (free.z - h.free.z) - df * h.fv.z) * dt;
      h.free.addScaledVector(h.fv, dt);
    }
  }
  if (rdt > 0) for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / n, i = 0; i < n; i++) { h.vw = (h.vw || 0) + (-420 * (h.w - wt) - 41 * (h.vw || 0)) * dt; h.w = clamp(h.w + h.vw * dt, 0, 1); }
  if (Math.abs(wt - h.w) < 0.002 && Math.abs(h.vw || 0) < 0.02) { h.w = wt; h.vw = 0; }
  return out.copy(onGun).lerp(h.free, h.w);
}

// the shove's shape, shared by guns and melee: q how far into it, push how far the hands drive out, lean and twist of the torso
// a shove with a gun is a blow with the gun itself, not a lunge with the whole body: it's drawn back a hand's width
// with the muzzle tipped up and the shoulder turned in (SHOVE_WIND), then driven out hard, the muzzle chopping down
// onto whatever's there (SHOVE_STRIKE), and eased back to the aim. The body only leans into it a little; there's no
// step. (A melee weapon bashes instead: MBASH, melee/melee-anim.js.) Each pose is [push, lean, twist, pitch, roll]
const SHOVE_WIND = [-0.07, -0.02, -0.12, -0.32, 0.14], SHOVE_STRIKE = [0.25, 0.07, 0.08, 0.2, -0.06];
function shovePose() {
  const sv = P.shove;
  if (!sv) return null;
  const p = clamp(sv.t / sv.dur, 0, 1);
  let pose, q;
  if (p < 0.2) { const w = smooth(p / 0.2); pose = SHOVE_WIND.map(v => v * w); q = w; }
  else if (p < 0.34) { const e = 1 - Math.pow(1 - (p - 0.2) / 0.14, 3); pose = SHOVE_WIND.map((v, i) => v + (SHOVE_STRIKE[i] - v) * e); q = 1; }
  else {
    // back to the hold on one long ease, slow off the blow, quickest halfway and settling in gently, the push and the
    // muzzle drawn back a little further than the rest so it eases down onto the aim (nothing in it stops or starts
    // at a corner, so it runs into the hold without a jolt when the shove ends)
    const u = (p - 0.34) / 0.66, r = 1 - u * u * u * (u * (6 * u - 15) + 10), o = 0.1 * u * Math.pow(Math.sin(Math.PI * u), 2);
    pose = SHOVE_STRIKE.map((v, i) => v * r - (i === 0 || i === 3 ? v * o : 0)); q = r;
  }
  return { q, push: pose[0], lean: pose[1], tw: pose[2], pit: pose[3], roll: pose[4] };
}

// the revolver's speed loader, off a photo of one: a squat black polymer body with fine turned grooves round it, its
// face drilled with six deep holes the rounds sit in (cases inside, noses out) round a stem with a bright release
// button, and a neck behind it to a knurled steel knob, the one you twist to let the rounds go. Its axis is z, the face
// forward; rnd takes the rounds (left out on an empty one). SL_FACE: where the face is, so with the fist SL_HAND behind
// the loader's middle the rounds go into the cylinder as the hand reaches it (player/hold.js: the hand's path)
const SL_FACE = 0.03, SL_HAND = 0.07;
function speedLoader(g, rnd) {
  const R = REV_CYL.r * 0.97, C = REV_CYL.ch, f = SL_FACE, bl = 0.026;
  cyl(g, R, bl, GM.poly, 0, 0, f - bl / 2, 28);
  for (let k = 0; k < 6; k++) cyl(g, R * 1.006, 0.0008, GM.rubber, 0, 0, f - 0.004 - k * 0.0036, 28);   // the fine grooves
  cyl(g, R * 0.9, 0.0012, GM.metal, 0, 0, f + 0.0001, 28);                                             // the face, a shade lighter
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(g, 0.0064, 0.0012, GM.rubber, Math.cos(a) * C, Math.sin(a) * C, f + 0.0006, 14); }   // the holes
  cyl(g, 0.0042, 0.004, GM.steelDk, 0, 0, f + 0.002, 12); cyl(g, 0.0032, 0.0016, GM.stainless, 0, 0, f + 0.0046, 12);   // the stem and its button
  cyl(g, 0.0072, 0.01, GM.poly, 0, 0, f - bl - 0.005, 16);                                              // the neck
  const kz = f - bl - 0.019; cyl(g, 0.0104, 0.018, GM.stainless, 0, 0, kz, 20);                         // the knob
  for (let k = 0; k < 6; k++) ring(g, 0.0107, 0.0011, GM.stainlessD, 0, 0, kz - 0.0075 + k * 0.003);      // knurled
  cyl(g, 0.0092, 0.0012, GM.stainlessD, 0, 0, kz - 0.0094, 16);
  if (rnd) for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, x = Math.cos(a) * C, y = Math.sin(a) * C;
    cyl(rnd, 0.0052, 0.012, GM.brass, x, y, f + 0.002, 10);                                              // the case, mostly down in its hole
    cyl(rnd, 0.0047, 0.006, GM.copper, x, y, f + 0.011, 10); cyl(rnd, 0.0032, 0.003, GM.copper, x, y, f + 0.0155, 10);   // the bullet, its nose rounded off
  }
}
// in the left hand (weapons/reload.js has the marks): fetched from the pouch, pushed into the open cylinder, twisted to
// let go of the rounds and dropped. It lives in upper-body space beside the gun, so it follows the hand exactly
const SLM = new THREE.Group(), SL_RND = new THREE.Group();
speedLoader(SLM, SL_RND); SLM.add(SL_RND); SLM.visible = false; SLM.userData.slot = 'loader'; PM.upper.add(SLM);   // (slot: kept out of your clothes' blood, effects/body-blood.js)
const _slAx = new V3(), _slQ = new THREE.Quaternion(), _slW = new V3(), _slS = new V3();
// the rounds in the revolver's chambers (the case heads, weapons/gun-models.js): the ones loaded at the top of the
// count, the ones fired below them till they're dumped (W8.hudSpent, which drops as each case leaves: weapons/casings.js
// dumps them from these same chambers), the rest empty, so a reload only empties the chambers that were fired and the
// new rounds fill those
const CHAMBERS = 6, BRASS_FIRED = lam(0x6f5a30), NICKEL = lam(0xc4c8cc), NICKEL_FIRED = lam(0x7c8084);   // (hollow points' cases are nickel, weapons/casings.js)
const cylLive = id => Math.min(CHAMBERS, W8.mag[id] | 0), cylFired = id => Math.min(CHAMBERS - cylLive(id), W8.hudSpent[id] | 0);
function cylHeads(cr, id) {
  const live = cylLive(id), fired = cylFired(id), nk = roundOn(id) === 'hollow';
  for (const c of cr) {
    const hd = c.children[0] && c.children[0].userData.heads; if (!hd) continue;
    hd.forEach((h, k) => { const st = k >= CHAMBERS - live ? 1 : k >= CHAMBERS - live - fired ? 2 : 0; h.visible = st > 0; if (st) { h.userData.rim.material = st === 2 ? (nk ? NICKEL_FIRED : BRASS_FIRED) : nk ? NICKEL : GM.brass; h.userData.primer.material = st === 2 ? GM.metal2 : GM.steel; } });
  }
}
// a round in the support hand while it's fed in by hand: up to three shotgun shells (one, both side by side for the
// double barrel's Sleight of Hand, or two or three in a row down the palm for the pump with Quick hands II or III, thumbed up into the
// tube one after another) or a rifle cartridge; carried from the pouch and pushed home along the bore
const HSH = new THREE.Group(), HSH_S = [0, 1, 2].map(() => { const g = new THREE.Group(); cyl(g, 0.0115, 0.062, GM.shell, 0, 0, 0.002, 12); cyl(g, 0.0123, 0.012, GM.brass, 0, 0, -0.03, 12); HSH.add(g); return g; });
const HSH_GAP = 0.026, HSH_FEED = [0.28, 0.84];   // shells' spacing in the hand; when a row of them is thumbed in, one push each, one after another (each counted in as its push ends: weapons/reload.js)
// a row's go: where it is in the pushes (0..1 over HSH_FEED), the shell being pushed, and how far through its push
const rowAt = (rp, n) => { const f = clamp((rp - HSH_FEED[0]) / (HSH_FEED[1] - HSH_FEED[0]), 0, 1), k = Math.min(n - 1, Math.floor(n * f)); return { k, u: n * f - k }; };
// a round loaded on its own: carried to the port till FEED_IN[0], lined up on it by FEED_IN[1] (out of the fingers), and
// thumbed all the way in by FEED_IN[2], where it sits (its rim in the chamber's mouth, its head in the cylinder) till it counts; where it goes in (_feedAt) and the gun's axes there (_feedQ, _feedAx, _feedUp)
const FEED_IN = [0.64, 0.7, 0.82], _feedAt = new V3(), _feedAx = new V3(), _feedUp = new V3(), _feedQ = new THREE.Quaternion(), _feedV = new V3();
const HSH_R = new THREE.Group(); cyl(HSH_R, 0.0055, 0.056, GM.brass, 0, 0, 0, 10); cyl(HSH_R, 0.0035, 0.016, GM.copper, 0, 0, 0.034, 10); HSH.add(HSH_R);
HSH.visible = false; HSH.userData.slot = 'loader'; PM.upper.add(HSH);
const _bq = new THREE.Quaternion();
// the empty loader, let go of: it falls out of the hand just as it was, turning over, bounces and lies there a while
// on its side (the casings' debris, weapons/casings.js). Its own model, the rounds left behind in the cylinder, at the
// size it is in the hand (the loader's inner group, sz, takes the body's scale; the debris shrinks its outer one away)
const SL_DROPS = [];
for (let k = 0; k < 4; k++) {
  const g = new THREE.Group(), sz = new THREE.Group(); speedLoader(sz); sz.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.add(sz); g.visible = false; scene.add(g);
  SL_DROPS.push({ g, sz, life: 0, vx: 0, vy: 0, vz: 0, spin: 0, roll: 0, r: 0.03, bounces: 4, kind: 'mag', restY: 0.03, rest: g => g.rotation.set(0, g.rotation.y, 0) });
}
let slIdx = 0;
function dropLoader() {
  if (!SLM.visible) return;
  SLM.updateWorldMatrix(true, false); SLM.getWorldPosition(_slW); SLM.getWorldQuaternion(_bq); SLM.getWorldScale(_slS); SLM.visible = false;
  const r2 = v => Math.round(v * 1000) / 1000, m = { p: [_slW.x, _slW.y, _slW.z].map(r2), q: [_bq.x, _bq.y, _bq.z, _bq.w].map(r2), s: r2(_slS.x),
    v: [P.vx * 0.6 + rr(-0.4, 0.4), rr(-0.6, 0.2), P.vz * 0.6 + rr(-0.4, 0.4)].map(r2), spin: r2(rr(4, 9) * (rand() < 0.5 ? -1 : 1)), roll: r2(rr(-5, 5)) };
  placeLoader(m); netSend('ld', m);   // (co-op: dropped on your teammates' screens too, net/arsenal.js)
}
// the empty speed loader falling from where it was let go (yours, or a co-op teammate's)
function placeLoader(m) {
  _slW.set(m.p[0], m.p[1], m.p[2]); _bq.set(m.q[0], m.q[1], m.q[2], m.q[3]);
  const c = SL_DROPS[slIdx = (slIdx + 1) % SL_DROPS.length], s = m.s;
  c.sz.scale.setScalar(s); c.sz.position.set(0, 0, -0.01 * s);   // (turning about its middle, the knob and all)
  c.r = REV_CYL.r * 0.97 * s; c.restY = c.r;
  c.g.position.copy(_slW).addScaledVector(_slAx.set(0, 0, 0.01 * s).applyQuaternion(_bq), 1); c.g.quaternion.copy(_bq); c.g.scale.setScalar(1); c.g.visible = true;
  c.vx = m.v[0]; c.vy = m.v[1]; c.vz = m.v[2]; c.spin = m.spin; c.roll = m.roll; c.bounces = 0; c.life = 14;
}

// bandaging: first the weapon goes away, carried by the right hand to where it rides (bandP, player/swap.js), then the
// hands come up and the right one winds the bandage round the left forearm (bandW, eased into bandK); after, the hands
// come down and the weapon is drawn again. healFx is how far the blue edge and the camera's lean-in have come: they
// build slowly as the bandage goes on, ease off as it ends, and drop away fast if a hit cuts it short (healCut)
const BAND_PUT = 0.2, BAND_WRAP = 0.16;
function bandPhases(rdt) {
  const band = P.bandT > 0;
  // another weapon picked during the bandage (switchSlot): the hands come down, the one in hand finishes going away,
  // then the new one is taken out
  if (ANIM.bandSwitch && !band) {
    ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP);
    if (ANIM.bandW <= 0) ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT);
    if (ANIM.bandP >= 1) { const s = ANIM.bandSwitch; ANIM.bandSwitch = null; if (W8.slot[s]) { W8.cur = s; W8.reloading = null; W8.burstLeft = 0; W8.swing = 0; W8.cd = Math.max(W8.cd, BAND_PUT); SFX.click(); if (WEAP[W8.slot[s]].melee) ANIM.meleeEqT = -BAND_PUT; } }
  }
  else if (band) { ANIM.bandP = Math.min(1, (ANIM.bandP || 0) + rdt / BAND_PUT); if (ANIM.bandP >= 1) ANIM.bandW = Math.min(1, (ANIM.bandW || 0) + rdt / BAND_WRAP); }
  else { ANIM.bandW = Math.max(0, (ANIM.bandW || 0) - rdt / BAND_WRAP); if (ANIM.bandW <= 0) ANIM.bandP = Math.max(0, (ANIM.bandP || 0) - rdt / BAND_PUT); }
  ANIM.bandK = smooth(ANIM.bandW || 0);
  if (band) ANIM.healCut = false;
  const prog = band ? 1 - P.bandT / (P.bandMax || 1) : 0, fx = band ? 0.2 + 0.8 * smooth(prog) : 0;
  ANIM.healFx = (ANIM.healFx || 0) + (fx - (ANIM.healFx || 0)) * Math.min(1, rdt * (band ? 2.4 : ANIM.healCut ? 11 : 2.6));
}
// the bandages on your left arm, each a wrap round the forearm and up it: the one going on grows round the arm as it's
// wound (from the wrist up), with the loose end running to the right hand; the ones already on stay, a spot of blood
// seeping through each, until the run ends (P.wraps of them)
const WRAP_AT = [[0.34, 0.47], [0.2, 0.31], [0.07, 0.17]], WRAP_M = lam(0xe8e2d4), WRAP_EDGE = lam(0xcfc7b6), WRAP_BLOOD = lam(0x8a1c14);
const wraps = WRAP_AT.map(([z0, z1]) => {
  const g = new THREE.Group(); g.position.z = (z0 + z1) / 2; PM.armL.add(g); g.visible = false; g.userData.fine = true;
  const L = z1 - z0, band = box(g, 0.158, 0.158, L, WRAP_M, 0, 0, 0);
  [-1, 1].forEach(e => box(g, 0.164, 0.164, 0.012, WRAP_EDGE, 0, 0, e * (L / 2 - 0.006)));   // the turned-over edges
  const blood = box(g, 0.05, 0.004, 0.04, WRAP_BLOOD, 0.02, 0.08, 0.005); blood.userData.fine = true;   // on top, where it's seeped through
  g.traverse(o => { o.userData.fine = true; o.castShadow = false; });
  return { g, band, blood, L };
});
const wrapTail = box(PM.upper, 0.03, 0.004, 1, WRAP_M, 0, 0, 0); wrapTail.visible = false; wrapTail.userData.fine = true;
// each wrap goes on over whatever's on the arm there (a sleeve and its cuff, the canvas jacket, gloves, an armband), so
// it's sized to sit just outside the widest of them across its length rather than sinking into a sleeve or having a
// cuff poke through it; refit every few frames while any is showing (gear and clothes change with upgrades and runs)
const _wb = new THREE.Box3(), _wm = new THREE.Matrix4(), WRAP_GAP = 0.007;
let wrapFitT = 0;
function fitWraps() {
  const arm = PM.armL; arm.updateMatrixWorld(true); _wm.copy(arm.matrixWorld).invert();
  const mine = new Set(); wraps.forEach(w => w.g.traverse(o => mine.add(o)));
  // clothes and gear (lit materials), not the outline shells round the arm
  const parts = []; arm.traverse(o => { if (o === arm || !o.isMesh || mine.has(o) || !o.visible || !(o.material && o.material.isMeshLambertMaterial)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _wb.copy(o.geometry.boundingBox).applyMatrix4(_wm.clone().multiply(o.matrixWorld)); parts.push(_wb.clone()); });
  wraps.forEach((w, i) => {
    const [z0, z1] = WRAP_AT[i]; let half = 0.07;   // the bare arm
    for (const b of parts) if (b.max.z > z0 && b.min.z < z1) half = Math.max(half, -b.min.x, b.max.x, -b.min.y, b.max.y);
    w.half = half + WRAP_GAP; w.g.scale.x = w.g.scale.y = (2 * w.half) / 0.158;
  });
}
const _wc = new V3(), _wa = new V3(), _wu = new V3(), _wv = new V3();
function bandagePose(pm, up, now, sh) {
  const k = ANIM.bandK || 0, n = Math.min(WRAP_AT.length, P.wraps || 0), band = P.bandT > 0;
  // the wrap going on (the next free one), grown as far as the bandage has gone; any finished ones as they are
  const prog = band ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : 0, cur = band && n < WRAP_AT.length ? n : -1;
  if ((n || k > 0.05) && --wrapFitT <= 0) { wrapFitT = 12; fitWraps(); }
  wraps.forEach((w, i) => {
    w.g.visible = i < n || (i === cur && k > 0.05);
    const f = i === cur ? Math.max(0.04, prog) : 1;
    w.band.scale.z = f; w.band.position.z = -w.L / 2 * (1 - f); w.blood.visible = i < n;
  });
  wrapTail.visible = false;
  let w = k * (sh ? 1 - sh.q : 1); if (w <= 0.001) return;
  // the left forearm comes up in front of you, turned in across the chest; the right hand goes round and round it,
  // working up the arm as it winds on, the head bent to watch
  const a = pm.armL, rx = a.rotation.x, ry = a.rotation.y, rz = a.rotation.z, px = a.position.x, py = a.position.y, pz = a.position.z, sz = a.scale.z;
  reach(a, 'L', _fL.set(0.05, 0.98 + Math.sin(now * 2.1) * 0.01, 0.36), 0.4, true);
  a.rotation.set(rx + (a.rotation.x - rx) * w, ry + (a.rotation.y - ry) * w, rz + (a.rotation.z - rz) * w);
  a.position.set(px + (a.position.x - px) * w, py + (a.position.y - py) * w, pz + (a.position.z - pz) * w); a.scale.z = sz + (a.scale.z - sz) * w;
  a.updateMatrix();
  const cz = band ? mix(WRAP_AT[Math.max(0, cur)][1] - 0.02, WRAP_AT[Math.max(0, cur)][0] + 0.02, prog) : 0.4, wr = 0.45 * bandTime() / BAND_TIME;
  _wc.set(0, 0, cz * a.scale.z).applyMatrix4(a.matrix);                                    // the point being wound, in upper-body space
  _wa.set(0, 0, 1).applyQuaternion(a.quaternion); _wu.set(0, 1, 0).applyQuaternion(a.quaternion); _wv.crossVectors(_wa, _wu);
  const th = (band ? (P.bandMax - P.bandT) : now) / wr * Math.PI * 2, R = Math.max(0.13, ((wraps[Math.max(0, cur)] || {}).half || 0.08) + 0.05);   // the hand goes round outside whatever the arm has on
  _fR.copy(_wc).addScaledVector(_wu, Math.cos(th) * R).addScaledVector(_wv, Math.sin(th) * R);
  const r = pm.armR, qx = r.rotation.x, qy = r.rotation.y, qz = r.rotation.z, qpx = r.position.x, qpy = r.position.y, qpz = r.position.z, qs = r.scale.z;
  reach(r, 'R', _fR, 0, true);
  r.rotation.set(qx + (r.rotation.x - qx) * w, qy + (r.rotation.y - qy) * w, qz + (r.rotation.z - qz) * w);
  r.position.set(qpx + (r.position.x - qpx) * w, qpy + (r.position.y - qpy) * w, qpz + (r.position.z - qpz) * w); r.scale.z = qs + (r.scale.z - qs) * w;
  // the loose end, from the roll in the right hand to where it's going on
  if (cur >= 0 && w > 0.6) {
    r.updateMatrix(); _wv.set(0, 0, FIST * r.scale.z).applyMatrix4(r.matrix); _wa.copy(_wc).addScaledVector(_wu, 0.08);
    wrapTail.visible = true; wrapTail.position.lerpVectors(_wv, _wa, 0.5); wrapTail.scale.z = Math.max(0.01, _wv.distanceTo(_wa)); wrapTail.lookAt(_wv.applyMatrix4(pm.upper.matrixWorld));
  }
  pm.head.rotation.x += 0.42 * w; pm.head.rotation.y = pm.head.rotation.y * (1 - w) + 0.18 * w; up.x += 0.12 * w;
}
// arms, hands and weapon for this frame; up is the upper-body rotation, which this adds lean and twist to
function poseHands(D, up, ph, runF, rdt, now) {
  const pm = PM, s = W8.cur;
  stepKick(RK.R, rdt); stepKick(RK.L, rdt); stepRock(rdt);
  bandPhases(rdt);
  ANIM.slideT.R += rdt; ANIM.slideT.L += rdt;
  ANIM.shoveHit = Math.max(0, (ANIM.shoveHit || 0) - rdt * 5);
  if (ANIM.handFor !== curId()) { ANIM.handFor = curId(); HAND.L.w = HAND.R.w = HAND.L.vw = HAND.R.vw = 0; ANIM.relEnv = 0; ACT_AX.forEach(a => { ACT[a] = ACT['v' + a] = 0; }); }   // a fresh weapon starts with both hands on it
  const sh = shovePose();
  if (sh && !D.melee) {
    up.x += sh.lean; up.y += sh.tw;
    pm.legL.rotation.x -= 0.12 * Math.max(0, sh.lean) / 0.07; pm.shinR.rotation.x += 0.1 * Math.max(0, sh.lean) / 0.07;   // just the weight onto the front foot
  }
  if (D.melee) poseMelee(D, up, ph, runF, rdt, now, sh);
  else poseGun(D, up, ph, runF, rdt, now, sh);
  bandagePose(pm, up, now, sh);
  swayBipods(rdt);
}

// how far forward the body goes as the weight comes onto the front foot in a swing (m, at full step)
const MLUNGE = 0.55;
// a melee weapon in your hands: the pose (the guard, a swing, the flourish once it's drawn, or a bash) comes from
// melee/melee-anim.js as the fist's place and the weapon's direction, already through its springs; here it goes onto
// the rig. The body twists, leans and bends with it, the hips turn under it, the weight goes onto the front foot and
// the knees give (dip); the head stays on what you're hitting
function poseMelee(D, up, ph, runF, rdt, now, sh) {
  const pm = PM, mh = gunMeshes.melee, a = meleePose(curId(), D, rdt, now, sh), b = MS.b;
  const rd = smooth(clamp(ANIM.ready || 0, 0, 1)), swing = W8.swing > 0 || !!sh;
  const walk = Math.sin(ph) * (0.18 * Math.min(1, runF) * (1 - rd) + 0.5 * rd) * (swing ? 0 : 1);   // the free arm swings as you walk and pumps at a sprint
  up.y += b.uy; up.x += b.ux; up.z += b.uz;
  pm.lower.rotation.y += b.hy;
  const st = b.step, dp = Math.max(0, b.dip);
  pm.legL.rotation.x -= 0.3 * st + 0.42 * dp; pm.legR.rotation.x += 0.2 * st - 0.2 * dp;
  pm.shinL.rotation.x += 0.75 * dp + 0.06 * Math.abs(st); pm.shinR.rotation.x += 0.55 * dp + 0.18 * Math.max(0, st);
  pm.g.position.y -= 0.085 * dp;
  // stepping in to it: the body goes forward with the weight (MLUNGE, further for a longer weapon), so a swing reaches
  // out as far as it hits
  { const lg = Math.max(0, st) * MLUNGE * clamp((D.range || 1.8) / 1.8, 0.85, 1.2); pm.g.position.x += Math.sin(ANIM.yaw) * lg; pm.g.position.z += Math.cos(ANIM.yaw) * lg; }
  pm.head.rotation.y -= b.uy * 0.62 + b.hy * 0.2; pm.head.rotation.x -= b.ux * 0.45;
  // the weapon in the right fist (shaking at low health: player/shaky-hands.js)
  const q = shakyTremor();
  armRest(pm.armR, 'R', a.rx + q.p * SHAKY_TREM.p, a.ry + q.y * SHAKY_TREM.y);
  pm.armR.rotation.z = a.rz; pm.armR.scale.z = a.sc;
  mh.rotation.set(a.hrx + q.r * SHAKY_TREM.r * 0.6, 0, 0); mh.scale.set(1, a.wy, a.wz);
  // two-handed, the left fist closes on the handle just above the right (further up it for a bash, the haft held
  // like a bar); one-handed, the free arm swings out against the turn for balance
  if (D.two) {
    pm.armR.updateMatrix(); mh.updateMatrix();
    _fL.set(0, 0.15 + 0.27 * meleeBashHand(), 0).applyMatrix4(mh.matrix).applyMatrix4(pm.armR.matrix);
    if (MS.lOn < 1) _fL.lerpVectors(SWAP_REST_L, _fL, MS.lOn);   // (not on it yet through the draw flourish)
    reach(pm.armL, 'L', _fL, 0, true);
  } else {
    armRest(pm.armL, 'L', 1.22 - walk * 1.6 - 0.6 * b.uy - 0.3 * st, -0.12 + 0.5 * Math.max(0, b.uy));   // (hanging; across the front as you wind up, back behind you as you follow through)
    // ...unless the swing or the bash has a use for it (meleeOffHand, melee/melee-anim.js)
    pm.armL.updateMatrix(); pm.armR.updateMatrix(); mh.updateMatrix();
    const t = meleeOffHand(D, curId(), sh, fistOf(pm.armL, _mlR), (off, o) => o.set(0, off, 0).applyMatrix4(mh.matrix).applyMatrix4(pm.armR.matrix), rdt);
    if (t) reach(pm.armL, 'L', t, 0, true);
  }
}
const _mlR = new V3();

// the arms easing onto the aim's height: how stiff and how damped (critically: no overshoot, no bounce)
const ARM_AIM = { k: 38, d: 12.3 };
const IDLE_UNSTEADY = 0.8;
function poseGun(D, up, ph, runF, rdt, now, sh) {
  const pm = PM, s = W8.cur, id = curId(), H = HOLD[id] || HOLD_DEF, ak = !!D.akimbo, gg = gunMeshes[s];
  const heavy = D.ammo === 'shells' || D.ammo === 'rifle' || (D.dmg || 0) > 60;
  const sw = smooth(ANIM.sw), ads = ANIM.ads || 0;
  // how far down you're pointing (weapons/combat-update.js): eased onto on a spring (ARM_AIM), so the arms settle onto
  // whatever the aim finds rather than snapping to it; never down at a sprint, with the gun at the low ready
  { const pT = state === 'play' ? (ANIM.pitchT || 0) * (1 - smooth(clamp(ANIM.sprintK || 0, 0, 1))) : 0; if (ANIM.vPitch === undefined) ANIM.vPitch = 0;
    for (let n = Math.ceil(rdt / (1 / 120)), h = rdt / n, i = 0; i < n; i++) springTo(ANIM, 'pitch', 'vPitch', pT, ARM_AIM.k, ARM_AIM.d, h); }
  // (a gun that's harder to hold still, a heavy one, a pair, a pistol with nothing to brace it, drifts more at rest: its
  // unsteadiness, player/shaky-hands.js, IDLE_UNSTEADY of it)
  const idle = Math.sin(now * 1.6) * 0.015 * (1 + (gunUnsteady(D, id) - 1) * IDLE_UNSTEADY) + Math.sin(ph) * 0.03 * Math.min(1, runF) * (1 - 0.65 * ads);   // the walk hardly reaches the gun down the sights
  // reloads: rel is what kind, rp how far through this mag or this shell, re eases the gun into and out of its reload pose
  const rel = W8.reloading, rp = rel ? 1 - W8.reloadT / W8.reloadMax : 0;
  // the double barrel being closed after its reload (weapons/reload.js: tickShut): shP how far through (-1: it isn't),
  // shK how far the barrels have swung up, quickening as they go so they swing home hard
  const shP = !rel && !D.akimbo && D.breakOpen ? brkShutP() : -1, shK = shP >= 0 ? Math.pow(clamp((shP - BRK_GRAB) / (1 - BRK_GRAB), 0, 1), 2) : 0;
  // a rifle with a charging handle fits its mag change into the first part of the reload, then charges it (rpm is how
  // far through the mag change, cg the charge's own envelope and pull how far back the handle is)
  const CH = rel === 'mag' && CHARGE[s] && !D.akimbo;   // (a pair charges its own way: weapons/akimbo.js, akChargeState)
  // an empty pistol's reload: the mag change in the first PS_MAG of it, then the support hand drops the slide (rr is how
  // far through that, relU when it lets go)
  const PS = rel === 'mag' && W8.relEmpty && !CH && !D.akimbo, rpm = CH ? Math.min(1, rp / CH_MAG) : PS ? Math.min(1, rp / PS_MAG) : rp;
  const rr = PS ? clamp((rp - PS_MAG) / (1 - PS_MAG), 0, 1) : 0, relU = PS ? (PS_REL[W8.relVar] - PS_MAG) / (1 - PS_MAG) : 0;
  const psW = PS ? smooth(clamp(rr / 0.3, 0, 1)) * (1 - smooth(clamp((rr - relU - 0.06) / (1 - relU - 0.06), 0, 1))) : 0;   // the hand's on the slide
  // the hand comes up off the grip and over the receiver on an arc (cg rises, eased in and out), hooks the handle from
  // just in front of it (hook: it settles onto it), draws it back, gathering speed and then slowing as the spring
  // tightens (drawn), holds it a beat and lets go at CH_SLAM: the handle snaps home in a blink and bounces a hair off its
  // stop (pull, CH_BOUNCE); the hand flicks up and out off it (flick), then comes back down to the grip
  const ease5 = t => t * t * t * (t * (t * 6 - 15) + 10), easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
  const cg = CH ? ease5(clamp((rp - CH_REACH[0]) / (CH_REACH[1] - CH_REACH[0]), 0, 1)) * (1 - ease5(clamp((rp - CH_BACK[0]) / (CH_BACK[1] - CH_BACK[0]), 0, 1))) : 0;
  const hook = CH ? 1 - ease5(clamp((rp - CH_REACH[1] + 0.02) / 0.025, 0, 1)) : 0;
  const drawn = CH ? easeIO(clamp((rp - CH_DRAW) / (CH_PULL - CH_DRAW), 0, 1)) : 0, home = CH ? clamp((rp - CH_SLAM) / 0.012, 0, 1) : 0;
  const bounce = CH ? CH_BOUNCE * Math.sin(clamp((rp - CH_SLAM - 0.012) / 0.03, 0, 1) * Math.PI) : 0, pull = drawn * (1 - home * home) + bounce;
  const flick = CH ? Math.sin(clamp((rp - CH_SLAM) / 0.06, 0, 1) * Math.PI) : 0;
  const slamK = CH ? Math.sin(clamp((rp - CH_SLAM) / 0.06, 0, 1) * Math.PI) : 0;   // the jolt of it slamming home
  if (rel) ANIM.relKind = rel;
  ANIM.relEnv += ((rel === 'mag' ? ((PS ? rp < 0.95 : rpm < 0.86) ? 1 : 0) : rel ? 1 : shP >= 0 ? 1 - 0.55 * shK : 0) - ANIM.relEnv) * Math.min(1, rdt * 9);   // (closing the double barrel: the stock comes up to meet the barrels)
  const re = ANIM.relEnv, rk = ANIM.relKind;
  // working the pump or the bolt (weapons/casings.js has the beats): cp says where the action is and how hard it's jolting
  const cy = W8.cyc && W8.cyc.id === id ? W8.cyc : null, cq = cy ? clamp((cy.t - cy.delay) / cy.dur, 0, 1) : 0, cp = cy ? cyclePose(cy, cq) : null;
  // ---- the gun: lowered for switching, bandaging and crawlers, canted and brought in for reloads, pushed out by a shove
  const blade = ak ? 0 : H.blade * (1 - sw * 0.6), rd = smooth(clamp(ANIM.ready || 0, 0, 1));   // (rd: down at a low ready, sprinting)
  let pitch = 0.9 * sw + ANIM.pitch * (1 - rd) + (sh ? sh.pit : 0), yaw = 0, roll = idle * 0.5 + (sh ? sh.roll : 0), ox = 0, oy = Math.sin(ph * 2) * 0.012 * Math.min(1, runF) * (1 - 0.6 * ads), oz = sh ? sh.push : 0;
  // no two reloads alike (W8.relJit, set as each one starts: weapons/reload.js): the pose a touch more or less, and the
  // gun never quite still in the hands while they work on it
  const J = W8.relJit || REL_JIT0, AT = _actT;
  ACT_AX.forEach(a => { AT[a] = 0; });
  if (re > 0.001) { roll += re * 0.04 * Math.sin(now * 2.3 + J.seed); pitch += re * 0.03 * Math.sin(now * 1.7 + J.seed * 1.3); yaw += re * 0.025 * Math.sin(now * 1.3 + J.seed * 0.7); }
  if (!ak && re > 0.001) {
    if (rk === 'mag' && id === 'revolver') { AT.p -= 0.3 * re; AT.r += 0.35 * re; AT.z -= 0.07 * re; AT.h += 0.02 * re; }   // the speed loader: canted, open cylinder up, muzzle down a touch
    else if (rk === 'mag') { const v = REL_MAG[W8.relStyle || 0], e = re * J.k; AT.r -= v.r * e; AT.p -= v.p * e; AT.y += v.y * e; AT.h += v.oy * e; AT.z -= v.oz * e; }
    else if (id === 'dbl') { AT.p += 0.55 * re; AT.z -= 0.05 * re; }                       // broken open, muzzles down
    else if (id === 'revolver') { AT.p -= 0.25 * re; AT.r += 0.35 * re; AT.z -= 0.06 * re; } // canted so the open cylinder faces up
    else { const v = REL_SHELL[W8.relStyle || 0], e = re * J.k; AT.r -= v.r * e; AT.p -= v.p * e; AT.h -= v.oy * e; AT.z -= v.oz * e; }   // tipped to show the loading port
    AT.hp += 0.16 * re;   // eyes on the gun
  }
  // and through it: a mag change rolls over further and dips to shake the old one out (dump), eases back toward level,
  // a little lower, while the hand's at the pouch and the head and chest turn to it (fetch), then rolls and tips the
  // well to meet the new one (meet); shells rock the port over to the hand as each comes in (show). The beats knock it
  const prevRp = ANIM.relRp || 0, beat = b => !!rel && prevRp < b && rp >= b; ANIM.relRp = rel ? rp : 0;
  if (!ak && rel === 'mag' && !D.speedload) {
    const m = rpm, k = J.k, dump = bump(m, 0.03, 0.22), fetch = bump(m, 0.16, 0.62), meet = bump(m, 0.5, 0.94), mf = CH ? CH_MAG : PS ? PS_MAG : 1;
    AT.r += (-0.16 * dump + 0.14 * fetch - 0.17 * meet) * k; AT.p += (0.06 * dump - 0.08 * meet) * k; AT.y += 0.06 * meet * k; AT.h -= 0.014 * fetch; AT.z -= 0.022 * meet;
    AT.hp += 0.06 * fetch; AT.hy -= 0.26 * fetch; AT.tw -= 0.07 * fetch;
    if (beat(0.1 * mf)) relKnock(1.6, -2.6, -0.2, 0);                    // the old mag shaken free
    if (beat(MAG_SEAT * mf)) relKnock(-3.2, 1.6, 0.7, 0.25);             // the new one slapped home: the gun bounces up
  } else if (!ak && rel === 'mag' && D.speedload) {
    AT.hy -= 0.2 * bump(rp, 0.08, 0.42);
    if (beat(SL_IN)) relKnock(-1.4, 0.6, 0.2, 0.6);                      // the loader pushed in
    // (the cylinder flicked shut at SL_SHUT: the flick's in the crane, below)
  } else if (!ak && rel === 'shell') {
    const show = bump(rp, 0.28, 1.02), back = bump(rp, 0, 0.3);
    if (id === 'dbl') { AT.p += 0.08 * show; AT.r -= 0.05 * show; }
    else { AT.r -= 0.13 * show * J.k; AT.y += 0.04 * show; AT.p -= 0.03 * show; }
    AT.hy -= 0.16 * back; AT.tw -= 0.04 * back;                             // a glance at the pouch for the next one
    if (beat(0.7)) { if (id === 'dbl') relKnock(1.4, -0.6, -0.2, 0); else if (id === 'revolver') relKnock(0.4, 1.4, 0, 0.2); else relKnock(-1.3, 1.1, 0.2, 0.35); }   // dropped in, or thumbed home
  }
  if (shP < 0 && (ANIM.shWas ?? -1) >= 0) relKnock(-2, 0.7, 0.25, 0.2);   // the double barrel latching shut knocks the gun up
  ANIM.shWas = shP;
  if (PS && beat(PS_REL[W8.relVar])) relKnock(-2.2, W8.relVar ? 1.6 : -1.2, 0.3, -0.4);   // the slide slamming home
  if (CH && beat(CH_SLAM)) relKnock(-1.6, -1.2, 0.2, -0.3);
  if (CH && cg > 0.001) { AT.z -= 0.014 * pull * cg; AT.hp += 0.05 * cg; }   // the pull tugs the gun back a touch, the eyes go to the handle
  if (ak) { const a = Math.max(akU('R') > 0 ? bump(akU('R'), 0, 1) : 0, akU('L') > 0 ? bump(akU('L'), 0, 1) : 0); AT.hp += 0.14 * a; }   // a pair: a look down at the one being reloaded
  {
    // working the action: the gun leans the way this rack works it (RACKS in weapons/casings.js) and follows on its
    // loose spring, and the stops knock it; the torso twists and rocks with it
    const t = _rackT; t.p = t.r = t.y = t.z = t.h = t.w = 0;
    if (cp) for (const src in cy.v.lean) { const L = cy.v.lean[src], k = cp[src]; for (const a in L) t[a] += L[a] * k; }   // this way of working it (RACKS)
    stepRack(rdt, t);
    pitch += RACK.p; roll += RACK.r; yaw += RACK.y; oz += RACK.z; oy += RACK.h;
    up.y += RACK.w; up.x += 0.3 * RACK.p;
  }
  if (psW && W8.relVar === 0) {   // a slingshot: turned to the support hand as it takes the slide, tugged back, jolted by the slam
    const tug = smooth(clamp((rp - PS_TUG) / (PS_REL[0] - PS_TUG), 0, 1)) * (rp < PS_REL[0] ? 1 : 0), slam = Math.sin(clamp((rp - PS_REL[0]) / 0.05, 0, 1) * Math.PI);
    AT.r -= 0.22 * psW; AT.y += 0.1 * psW; AT.p -= 0.04 * psW; pitch += 0.06 * slam; oz += 0.012 * tug - 0.01 * slam;
  }
  if (PS && W8.relVar === 1) {   // the slide release: the gun rolled in to the shooting hand's thumb, which drops the slide, and the slam jolts it
    const th = Math.sin(clamp((rp - (PS_REL[1] - 0.09)) / 0.15, 0, 1) * Math.PI), slam = Math.sin(clamp((rp - PS_REL[1]) / 0.05, 0, 1) * Math.PI);
    AT.r += 0.3 * th; AT.y -= 0.07 * th; AT.p -= 0.05 * th; pitch += 0.07 * slam; oz -= 0.01 * slam;
  }
  // the double barrel snapped shut with a flick of the wrist: the barrels swinging up into place jolt the gun up
  // (over a few frames, not in one: flkT is the flick, flk the wrist catching up with it)
  if (id === 'dbl') { const shut = Math.max(0, (ANIM.brkPrev ?? 0) - (ANIM.brk || 0)); ANIM.brkPrev = ANIM.brk || 0; ANIM.flkT = Math.min(1, Math.max((ANIM.flkT || 0) * Math.exp(-rdt * 7), shut * 3)); ANIM.flk = (ANIM.flk || 0) + (ANIM.flkT - (ANIM.flk || 0)) * Math.min(1, rdt * 32); pitch -= 0.26 * ANIM.flk; oy += 0.02 * ANIM.flk; }
  if (cg) { AT.r += 0.26 * cg; AT.p -= 0.07 * cg; AT.h += 0.02 * cg; AT.z -= 0.03 * cg; pitch -= 0.05 * slamK; oz -= 0.018 * pull - 0.012 * slamK; }   // canted over to reach the charging handle, tugged back with it, jolted as it slams home
  // the reload's motion, sprung (ACT)
  if (rdt > 0) for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / n, i = 0; i < n; i++) for (const a of ACT_AX) springTo(ACT, a, 'v' + a, AT[a], a === 'hp' || a === 'hy' || a === 'tw' ? ACT_K * 0.5 : ACT_K, a === 'hp' || a === 'hy' || a === 'tw' ? ACT_D * 0.75 : ACT_D, dt);
  pitch += ACT.p; roll += ACT.r; yaw += ACT.y; oy += ACT.h; oz += ACT.z; up.y += ACT.tw;
  oy += 0.05 * ads; pitch -= 0.03 * ads; roll *= 1 - ads * 0.6;                            // aiming: up to the eye, steadier
  // sprinting (player/sprint.js): the gun comes down to a low ready, muzzle down and across the body, both hands still
  // on it, and it bounces with each stride; a handgun's drawn in closer to the chest. It's carried high, muzzle only
  // part way down (a long gun about 18 degrees, a handgun about 27). Run and gun keeps it up
  if (rd > 0.001) {
    const lg = H.kind === 'long', b2 = Math.sin(ph * 2), b1 = Math.sin(ph);
    pitch += rd * ((lg ? 0.31 : 0.48) + 0.06 * b2); yaw += rd * ((lg ? 0.42 : 0.24) + 0.07 * b1); roll += rd * (lg ? 0.24 : 0.1);
    ox -= rd * (lg ? 0.03 : 0.05); oy -= rd * ((lg ? 0.035 : 0.05) + 0.014 * b2); oz -= rd * (lg ? 0.05 : 0.12);
  }
  oz -= ak ? AK_PULL : H.pull;
  if (H.kind === 'long') oy += LONG_RAISE;
  { const q = shakyTremor(), T_ = SHAKY_TREM; pitch += q.p * T_.p; yaw += q.y * T_.y; roll += q.r * T_.r; ox += q.x * T_.m; oy += q.h * T_.m; }   // shaking at low health (player/shaky-hands.js)
  { const fa = freeAim(rdt, heavy, ads); yaw += fa.yaw; pitch += fa.pitch; ox += Math.sin(fa.yaw) * FREE_SWING; oy -= Math.sin(fa.pitch) * FREE_SWING; }   // the arms trail a turn and swing on after it
  pitch += SR.x * 0.8;   // the shoulders rock back with a shot, the wrists keeping most of it off the muzzle
  if (ANIM.rg > 0) pitch -= PM.g.rotation.x * ANIM.rg;   // Vault fire: the gun stays level while the body tips over the sill and dips into the landing
  posePivot(gg, pitch, yaw, roll, X, 1.08, 0.1, ox, oy, oz, -blade);
  { const sh = H.hand; if (sh) { _v.set(0, -sh[0], -sh[1]).applyQuaternion(gg.quaternion); gg.position.add(_v); gg.updateMatrix(); } }   // down and back in the gun's own frame (HOLD's hand)
  gunPush(gg, s, H, ak, rd, rdt, sh ? sh.push : 0);   // pushed back off a wall or a zombie in front of you
  up.y += blade; pm.head.rotation.y = -blade * 0.9;
  // ---- one hold per hand: each gun kicks on its own shot; akimbo pistols run their own reload
  // the left gun put away for a Vault fire vault and drawn again after (AK_DRAW); akHolstered while it's away
  if (ak && vaultGun()) { ANIM.akIn = true; ANIM.akDraw = 0; }
  else if (!ak) ANIM.akIn = false;
  else if (ANIM.akIn) { ANIM.akDraw += rdt / AK_DRAW; if (ANIM.akDraw >= 1) ANIM.akIn = false; }
  ANIM.akHolstered = !!ANIM.akIn && (!!P.vault || ANIM.akDraw < AK_GRAB);
  const sides = ak ? ['R', 'L'] : ['R'], akC = ak ? akChargeState(id) : null;
  // the other gun of a pair being charged goes flat on the chest (akSling), eased on and off on a spring, so it's
  // still settling back up onto the aim as the reload ends
  if (akC) ANIM.akChSide = akC.other;
  ANIM.akCh = ANIM.akCh || 0; ANIM.akChV = ANIM.akChV || 0;
  if (ak) { springTo(ANIM, 'akCh', 'akChV', akC ? akC.chest : 0, AK_SLING.k, AK_SLING.d, rdt); ANIM.akCh = clamp(ANIM.akCh, 0, 1); }
  else ANIM.akCh = ANIM.akChV = 0;
  for (const side of sides) {
    const h = HOLDS[s] && HOLDS[s][side]; if (!h) continue;
    const k = RK[side], g = H.grip, sg = side === 'R' ? 1 : -1;
    let hx = kickPitch(k.p), hy = k.y, hz = k.r, hox = h.userData.x0 || 0, hoy = k.h, hoz = k.z;
    if (ak) { hoz -= GP[side].back; hx -= GP[side].a; }   // this one of the pair pushed back off what's in front of it (gunPush)
    const u = ak ? akU(side) : 0;
    if (ak) {
      // this hand's own way of holding it (AK_HAND), eased off while it's down being reloaded, and its own drift
      const a = AK_HAND[side], on = u > 0 ? 1 - Math.sin(Math.PI * clamp(u, 0, 1)) : 1, dr = now * a.f;
      hz += sg * a.cant * on; hy -= sg * a.toe * on; hx += a.p + Math.sin(dr) * 0.012;
      hox -= sg * a.in; hoy += a.up + Math.sin(dr * 1.3 + 0.5) * 0.004; hoz += a.fwd; hy += Math.sin(dr * 0.7 + 1.3) * 0.01;
      if (side === 'L') {
        // put away for a vault, then drawn: the hand goes down to where it is, and comes back up with it
        h.visible = !ANIM.akHolstered;
        if (ANIM.akIn && !P.vault && !rigPair(s)) { const at = AK_DRAW_AT[s] || AK_DRAW_AT.side, w = vk(ANIM.akDraw, 0, AK_GRAB - 0.05) * (1 - vk(ANIM.akDraw, AK_GRAB + 0.08, 1)); hx += at.p * w; hoy += at.y * w; hoz += at.z * w; hox += sg * at.x * w; }
      }
    }
    if (u > 0) {
      // this gun's turn, the other kept up on the aim: its mag flicked out with a roll of the wrist, the gun taken down
      // to its hip pouch and driven onto a fresh one, and back up with a snap as it seats; one that ran dry gets its
      // slide stop thumbed on the way up, a twist of the wrist as the slide slams home
      const flick = Math.sin(clamp(u / 0.14, 0, 1) * Math.PI), dip = Math.sin(clamp((u - 0.12) / 0.62, 0, 1) * Math.PI), seat = Math.sin(clamp((u - 0.5) / 0.14, 0, 1) * Math.PI);
      const thumb = W8.akRel.empty && !akHasCharge(id) ? Math.sin(clamp((u - AK_SLIDE + 0.05) / 0.12, 0, 1) * Math.PI) : 0;
      hx += -0.4 * flick + 1.15 * dip - 0.25 * seat - 0.1 * thumb; hz += sg * (0.4 * flick + 0.16 * thumb); hoy -= 0.26 * dip; hoz -= 0.16 * dip; hox -= sg * 0.05 * dip;
    }
    // a machine pistol charged two-handed (akChargeState): the empty one held up in front, canted so its handle's in
    // reach and knocked as the bolt slams home; the other laid flat across your chest while its hand's away (akSling)
    if (akC && side === akC.side) { hox -= sg * 0.1 * akC.hold; hoy -= 0.04 * akC.hold; hoz -= 0.1 * akC.hold; hz += sg * 0.45 * akC.hold; hx -= 0.06 * akC.hold + 0.1 * akC.slam; }
    posePivot(h, hx, hy, hz, g[0], g[1], g[2], hox, hoy, hoz);
    if (ak && side === ANIM.akChSide && ANIM.akCh > 0.001) akSling(h, g, sg, ANIM.akCh, hox, hoy, hoz);
    // a pair in the shoulder rig: the left gun's drawn back out from under the right arm after a Vault fire vault
    // (the hand goes across to it, pulls it at AK_GRAB and swings it round onto the aim)
    if (side === 'L' && ak && ANIM.akIn && !P.vault && rigPair(s)) rigDraw(h, vk(ANIM.akDraw, 0, AK_GRAB - 0.05) * (1 - vk(ANIM.akDraw, AK_GRAB + 0.08, 1)));
  }
  // the support hand can't reach further than its arm: a turn's free-aim swing that would carry the forend beyond
  // SUPPORT_REACH arm-lengths from the left shoulder is held in, the whole gun drawn back toward that shoulder so the
  // hand stays on it (not while the hand's off the gun anyway, reloading or working the action). The limit's soft, taking
  // hold over 2 SUPPORT_KNEE past it, so a gun driven out to it (a shove) and coming back doesn't jolt as it leaves it
  if (!ak && H.fore) {
    const fh = H.kind === 'hand' && H.hand || HAND_0;
    gunPt(_sup, s, 'R', H.fore[0], H.fore[1] + fh[0] - foreDrop(s, H), H.fore[2] + fh[1]);
    const sL = SHOULDER.L, dx = _sup.x - sL[0], dy = _sup.y - sL[1], dz = _sup.z - sL[2], d = Math.hypot(dx, dy, dz), x = d - FIST * SUPPORT_REACH, kn = SUPPORT_KNEE;
    const over = x <= 0 ? 0 : x >= 2 * kn ? x - kn : x * x / (4 * kn);   // (a soft limit: the gun eases into it and out of it, rather than stopping on it)
    if (over > 0) { const k = over / d * (1 - HAND.L.w); gg.position.x -= dx * k; gg.position.y -= dy * k; gg.position.z -= dz * k; gg.updateMatrix(); }
  }
  up.x -= SR.x + BR.z * BR_LEAN; up.y += SR.y;   // the shot's rock back and twist through the shoulders (gunKick)
  pm.upper.position.z = -BR.z;   // and the upper body shoved back under it (BR)
  // ---- moving parts: slides and bolts snap back on their own gun's shot, lock open when empty, ride the pump or bolt cycle
  const sl = SLIDES[s];
  if (sl && sl.length) {
    for (const q of sl) {
      const st = ANIM.slideT[q.side || 'R'];
      let off = st < 0.02 ? st / 0.02 : st < 0.032 ? 1 : Math.max(0, 1 - (st - 0.032) / 0.06), held = false, fast = false;   // slammed back, a beat at the end of its stroke, run home
      if (q.cyc) {
        // pulled back to load (the rifle's bolt, handle up, or an empty pump's forend), it stays open while you feed
        // it and after, till it's pushed home (weapons/casings.js: openAction); otherwise the action follows the cycle
        const bolt = EJECT[id] === 'bolt', open = !!W8.held[id] && !cp;
        off = open ? 1 : cp ? cp.off : 0; held = open || !cp;   // eased when nothing's working it (a rack cut short closes, not snaps)
        if (bolt) { q.lift = (q.lift || 0) + ((open ? 1 : cp ? cp.lift : 0) - (q.lift || 0)) * (cp && !open ? 1 : Math.min(1, rdt * 14)); q.m.rotation.z = -BOLT_TURN * q.lift; }
      }
      // an akimbo gun's slide: locked back once that gun's run dry, until its own reload drops it (weapons/akimbo.js);
      // let go, it slams home in a blink rather than snapping
      else if (q.lock && ak && akSlideBack(id, q.side)) { off = 1; held = true; }
      else if (q.lock && ak && q.off > 0.02 && st > 0.1) { off = 0; held = true; fast = true; }
      else if (q.lock && !ak && (W8.mag[id] || 0) <= 0 && rel !== 'mag') { off = 1; held = true; }
      else if (q.lock && PS) {   // locked back through the mag change, tugged off the stop (a slingshot), then flies home
        const relT = PS_REL[W8.relVar], tug = W8.relVar === 0 ? smooth(clamp((rp - PS_TUG) / (relT - PS_TUG), 0, 1)) * 0.14 : 0;
        off = rp < relT ? 1 + tug : 0; held = true; fast = rp >= relT;
      }
      else if (q.lock && rel === 'mag' && SLIDE_PISTOLS[id]) { off = 0; held = true; }   // rounds still in it: the slide stays put
      else if (q.lock && rel === 'mag' && CH) { off = rp < CH_SLAM ? 1 : 0; held = true; if (!off) q.off = 0; }   // back with the handle, then slammed home
      else if (q.lock && rel === 'mag') { off = W8.reloadT / W8.reloadMax > 0.12 ? 1 : 0; held = true; }
      // a slide locking back or dropping home after a reload eases there (fast going back, a softer run forward), never snaps
      if (held) { if (q.off === undefined) q.off = off; q.off += (off - q.off) * Math.min(1, rdt * (fast ? 60 : off > q.off ? 30 : 12)); off = q.off; } else q.off = off;
      const zc = q.z0 - q.travel * off, cl = q.m.userData.clip;
      if (cl === undefined) q.m.position.z = zc;
      else {   // a bolt seen through a port in the gun's side: whatever has run back past the port's rear edge is inside the receiver, out of sight
        const L = q.L || (q.L = 2 * (q.m.geometry.boundingBox || (q.m.geometry.computeBoundingBox(), q.m.geometry.boundingBox)).max.z), f = zc + L / 2, r = Math.max(cl, zc - L / 2);
        q.m.visible = f - r > 0.001; if (q.m.visible) { q.m.scale.z = (f - r) / L; q.m.position.z = (f + r) / 2; }
      }
      q.m.updateMatrix();
    }
  }
  // the magazine on the model: slides out as the reload starts, gone while the old one falls, a fresh one rises back in
  const mgs = MAGG[s] || [];
  if (mgs.length && ak) {
    // an akimbo pair: each gun's mag slides out as its turn starts, is gone while it falls, and the fresh one is driven
    // up into the grip as that gun comes down onto it (the right gun's is built first)
    mgs.forEach((m, k) => {
      const side = k ? 'L' : 'R', u = akU(side), md = u < 0.08 ? smooth(u / 0.08) * 0.12 : u < 0.55 ? 0 : 0.12 * (1 - smooth(clamp((u - 0.55) / 0.05, 0, 1)));
      m.visible = u < 0.08 || u >= 0.55; m.position.y = -md;
      if (akBusy(side) || (!k && !W8.reloading)) ANIM.magDrop = m.visible ? md : 0.22;
    });
  } else if (mgs.length) {
    let md = 0, show = true;
    // (the fresh one is carried up in the hand from MAG_TAKE: magInHand, below)
    if (!rel && relHeld(id) && W8.relSave[id].st === 'out') show = false;
    else if (rel === 'mag') { const tOut = Math.min(0.3, magDropT() / Math.max(0.3, W8.reloadMax)); if (rpm < tOut) { const u = rpm / tOut; md = D.akKit ? -u : u * u * MAG_SLIDE; } else if (rpm < MAG_TAKE && !D.speedload) show = false; }   // (gathering speed as it slides, so it falls on at that speed: dropMag)
    mgs.forEach(m => {
      m.visible = show;
      if (md < 0) {
        // an AK mag rocked forward off its front lug (AKM_ROCK), then drawn down out of the well as it comes free
        const u = -md, a = -AKM_ROCK * smooth(clamp(u / 0.75, 0, 1)), dn = AKM_PULL * smooth(clamp((u - 0.55) / 0.45, 0, 1)), c = Math.cos(a), sn = Math.sin(a), [ly, lz] = AKM_LUG;
        m.rotation.set(a, 0, 0); m.position.set(0, ly - (ly * c - lz * sn) - dn, lz - (ly * sn + lz * c));
      } else { m.position.set(0, -md, 0); m.rotation.set(0, 0, 0); }
    });
    if (md < 0) md = 0;
    ANIM.magDrop = show ? md : 0.22;
  }
  // the charging handle: drawn back by the right hand and let go
  if (CHARGE[s] && !ak) { const c = CHARGE[s].m; c.position.z = -CHARGE[s].tr * pull; c.updateMatrix(); }
  else if (ak && HOLDS[s]) for (const sd of ['R', 'L']) { const c = HOLDS[s][sd] && HOLDS[s][sd].userData.charge; if (c) { c.m.position.z = akC && akC.side === sd ? -c.tr * akC.pull : 0; c.m.updateMatrix(); } }   // a pair's: the one being charged
  // the double barrel breaks open for its whole reload (the barrels drop on the hinge, the breech up at you) and is
  // closed after it, the support hand lifting the barrels up on the forend till they latch (shK); the brass of each
  // loaded shell shows in its chamber, the one being pushed home as soon as it's in
  const brkG = BRK[s];
  if (brkG) {
    const open = rel === 'shell' ? 1 : 0;
    if (shP >= 0) ANIM.brk = Math.min(ANIM.brk || 0, 1 - shK);   // (never swinging further open, if it was cut short opening)
    else ANIM.brk = (ANIM.brk || 0) + (open - (ANIM.brk || 0)) * Math.min(1, rdt * (open ? 11 : 24));
    brkG.g.rotation.x = 0.62 * smooth(clamp(ANIM.brk, 0, 1)); brkG.g.updateMatrix();
    const loaded = (W8.mag[id] || 0) + (rel === 'shell' && rp >= SHELL_IN ? Math.min(D.loadN || 1, 2 - (W8.mag[id] || 0)) : 0);
    brkG.rims.forEach((r, k) => { r.visible = k < loaded; });
  }
  // a belt-fed gun shows what's left in its belt: the rounds go from the box end first under ten, and none are left
  // when it's empty; the old box slides out as it was, the fresh one is full from the moment it's out of the pouch
  // (MAG_TAKE: the belt rides in the box, magInHand)
  const belt = BELT[s];
  if (belt) { const n = rel === 'mag' && rpm >= MAG_TAKE ? belt.length : Math.min(belt.length, W8.mag[id] || 0); belt.forEach((r, k) => { r.visible = k < n; }); beltJiggle(belt, holdOf(s, 'R'), rdt); } else BJ.on = false;
  // revolver: the cylinder swings out to the left for the whole reload and snaps shut after
  const cr = CRANE[s] || [];
  // revolver: a beat after the reload starts (REV_OPEN, the thumb on the release) the cylinder's flicked out to the left
  // on its crane, well clear of the frame (REV_SWING, and carried out and down a touch, REV_OUT), and bounces off its
  // stop; when it's done it's snapped shut. On a spring, so it swings rather than slides
  if (cr.length) {
    const open = rel === 'shell' || (rel === 'mag' && D.speedload && rp < SL_SHUT);
    ANIM.craneT = open ? (ANIM.craneT || 0) + rdt : 0; ANIM.crane = ANIM.crane || 0; ANIM.vcrane = ANIM.vcrane || 0;
    const want = open && ANIM.craneT >= REV_OPEN ? 1 : 0;
    // it's to close and it's out: the flick (REV_FLICK). The wrist winds the gun a touch further open, then snaps it
    // hard the other way, and the cylinder, left behind for a moment, swings home on the snap
    if (!want && ANIM.craneWant && ANIM.crane > 0.3) { ANIM.flick = 0; ANIM.latched = false; ACT.vr += REV_FLICK.windKick; ACT.vp -= 0.8; }
    ANIM.craneWant = want;
    let hold = false;
    if (ANIM.flick >= 0) {
      const f0 = ANIM.flick; ANIM.flick += rdt;
      if (f0 < REV_FLICK.wind && ANIM.flick >= REV_FLICK.wind) { ACT.vr -= REV_FLICK.snap; ACT.vy += REV_FLICK.snapYaw; ACT.vp += REV_FLICK.snapPitch; ANIM.vcrane = -REV_FLICK.swing; }
      hold = ANIM.flick < REV_FLICK.wind;
      if (ANIM.flick > 0.6) ANIM.flick = -1;
    }
    for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), i = 0; i < n; i++) {
      if (!hold) springTo(ANIM, 'crane', 'vcrane', want, want ? 520 : 700, want ? 22 : 18, h);
      if (ANIM.crane < 0) {
        // shut against the frame: the first time in, it latches with a click, rocks the gun and gives the faintest
        // rebound; after that it stays put
        if (!ANIM.latched && ANIM.vcrane < -1) { ANIM.latched = true; ANIM.vcrane = -ANIM.vcrane * REV_FLICK.rebound; SFX.cylShut(); relKnock(0.6, -1.2, 0.15, 0.1); }
        else ANIM.vcrane = Math.max(0, ANIM.vcrane) * (ANIM.latched ? 0 : 1);
        ANIM.crane = 0;
      }
      if (ANIM.crane > 1.12) { ANIM.crane = 1.12; ANIM.vcrane = -Math.abs(ANIM.vcrane) * 0.3; }   // and out against its stop
    }
    cr.forEach(c => { const p0 = c.userData.p0 || (c.userData.p0 = c.position.clone()), o = ANIM.crane; c.rotation.z = -o * REV_SWING; c.position.set(p0.x + REV_OUT[0] * o, p0.y - REV_OUT[1] * o, p0.z); c.updateMatrix(); });
    cylHeads(cr, id);
  }
  // ---- hands: start from their places on the gun
  const hd = HAND_DROP[H.kind] || HAND_DROP.hand, hh = H.hand || HAND_0, fh = H.kind === 'hand' ? hh : HAND_0;   // a handgun's support hand cups the trigger hand, so it moves with it
  gunPt(_hR, s, 'R', H.grip[0] + hd.out, H.grip[1] + hh[0] - hd.grip, H.grip[2] + hh[1]);
  if (ak) gunPt(_hL, s, 'L', H.grip[0] - hd.out, H.grip[1] + hh[0] - hd.grip, H.grip[2] + hh[1]);
  else {
    let fz = H.fore[2] + fh[1];
    if (H.foreOnSlide && sl) { const q = sl.find(e => e.cyc); if (q) fz += q.m.position.z - q.z0; }   // the support hand rides the pump
    gunPt(_hL, s, 'R', H.fore[0], H.fore[1] + fh[0] - foreDrop(s, H), fz);   // the fist up against the fore-end's underside (player/grip.js)
  }
  // the firing hand: works the bolt by its knob on a bolt gun's cycle (both points are on the gun, so it never lags
  // behind it), coming up over the wrist on the way there and back
  if (cp && cy.bolt && sl) {
    const q = sl.find(e => e.cyc);
    if (q) { const hd = cy.v.hand; _p1.set(BOLT_KNOB[0] + hd[0], BOLT_KNOB[1] + hd[1], BOLT_KNOB[2]).applyMatrix4(q.m.matrix); gunPt(_p1, s, 'R', _p1.x, _p1.y, _p1.z); _hR.lerp(_p1, cp.grab); _hR.y += Math.sin(Math.PI * cp.grab) * 0.02 * (cq < 0.5 ? 1 : 0.6); }
  }
  // and the charging handle at the end of a rifle's reload: the right hand leaves the grip for it, pulls, lets go and
  // comes back
  if (cg > 0.001) {
    // on its handle (coming onto it from a little above and in front: hook), back with it, and once it's let go, still
    // where it let go but flicked up and out off it; on an arc up over the receiver on the way there and back
    const at = CHARGE[s].at, hp = rp < CH_SLAM ? pull : drawn, arc = Math.sin(Math.PI * cg);
    gunPt(_p1, s, 'R', at[0] - 0.012 * arc - 0.018 * flick, at[1] + 0.012 + 0.02 * hook + 0.022 * flick, at[2] - CHARGE[s].tr * hp + 0.025 * hook - 0.012 * flick);
    _hR.lerp(_p1, cg); _hR.y += arc * 0.04 * (1 - hook * 0.5);
  }
  // the other hand of a pair charging a machine pistol: over to the empty one's handle, drawing it back with it
  let akFree = null;
  if (akC && akC.reach > 0.001) { const hc = HOLDS[s][akC.side] && HOLDS[s][akC.side].userData.charge; if (hc) akFree = gunPt(_akH, s, akC.side, hc.at[0], hc.at[1] + 0.012, hc.at[2] - hc.tr * akC.pull); }
  const akOff = sd => akFree && akC.other === sd ? akC.reach : 0;
  handTarget(_fR, 'R', _hR, akOff('R') ? akFree : null, akOff('R'), rdt);
  // the support hand: off the gun to fetch a mag or feed shells, or wrapping a bandage; on the gun the rest of the time
  if (!ak) {
    let free = null, wt = 0;
    if (rel === 'mag' && D.speedload && cr.length) {
      // the back of the open cylinder and the gun's forward axis, in upper-body space
      const hq = holdOf(s, 'R');
      _p1.set(0.035, 0.045, -0.06).applyMatrix4(cr[0].matrix).applyMatrix4(hq.matrix).applyMatrix4(gg.matrix);
      _slQ.copy(gg.quaternion).multiply(hq.quaternion); _slAx.set(0, 0, 1).applyQuaternion(_slQ);
      _p2.copy(_p1).addScaledVector(_slAx, -0.1);                              // the fist, loader pushed home
      _p3.copy(_p1).addScaledVector(_slAx, -0.24); _p3.y -= 0.07;              // lining it up behind the cylinder
      _p5.copy(_p2); _p5.y -= 0.16; _p5.x -= 0.05;                             // let go: the hand drops away
      _p6.copy(_p1).addScaledVector(_slAx, 0.04); _p6.x -= 0.05;               // the palm flicks the cylinder shut
      free = walkPath(_p4, [[0, _hL], [0.08, _hL], [0.26, POUCH], [0.42, _p3], [SL_IN, _p2], [SL_DROP - 0.02, _p2], [0.77, _p5], [SL_SHUT - 0.01, _p6], [0.9, _p6], [1, _hL]], rp); wt = 1;
    }
    else if (rel === 'mag') {
      const mp = MAGPOS[s]; gunPt(_p1, s, 'R', mp ? mp[0] : H.grip[0], mp ? mp[1] + 0.03 : H.grip[1] - 0.14, mp ? mp[2] : H.grip[2] + 0.05);   // the bottom of the mag well
      const st = W8.relStyle || 0;
      if (D.akKit) {   // an AK mag: grab it, thumb the paddle and rock it out forward; the new one hooked in at the front and rocked back home (AKM_WAY)
        _p2.copy(_p1).add(_rv.set(0.01, -0.07, 0.07)); _p3.copy(_p1).add(_rv.set(0, -0.2, 0.08)); _p5.copy(_p1).add(_rv.set(0, -0.03, 0.02)); _p6.copy(_p1); _p6.y += 0.01;
        free = walkPath(_p4, [[0, _hL], [0.07, _p1], [0.15, _p2], [0.42, POUCH], [0.62, _p3], [0.76, _p5], [0.82, _p1], [0.86, _p6], [0.92, _p1], [1, _hL]], rpm);
      } else if (st === 1) {   // let the old one drop, bring the new one up from in front and slap it home
        _p2.copy(_p1).add(_rv.set(0.03, -0.1, -0.03)); _p3.copy(_p1).add(_rv.set(0, -0.2, 0.06)); _p5.copy(_p1).add(_rv.set(0, -0.03, 0.01)); _p6.copy(_p1); _p6.y += 0.012;
        free = walkPath(_p4, [[0, _hL], [0.14, _p2], [0.42, POUCH], [0.62, _p3], [0.76, _p5], [0.8, _p1], [0.84, _p6], [0.9, _p1], [1, _hL]], rpm);
      } else if (st === 2) {   // strip the old one out and away to the side, rock the new one in from behind and tug it to check
        _p2.copy(_p1).add(_rv.set(-0.05, -0.14, 0)); _p3.copy(_p1).add(_rv.set(-0.05, -0.18, -0.04)); _p5.copy(_p1).add(_rv.set(0, -0.04, -0.02)); _p6.copy(_p1); _p6.y -= 0.012;
        free = walkPath(_p4, [[0, _hL], [0.12, _p1], [0.22, _p2], [0.42, POUCH], [0.58, _p3], [0.72, _p5], [0.8, _p1], [0.86, _p6], [0.92, _p1], [1, _hL]], rpm);
      } else {          // strip it, to the pouch, the new one up into the well and pushed home
        _p2.copy(_p1); _p2.y -= 0.16; _p3.copy(_p1); _p3.y -= 0.22;
        free = walkPath(_p4, [[0, _hL], [0.12, _p1], [0.22, _p2], [0.42, POUCH], [0.6, _p3], [0.8, _p1], [0.9, _p1], [1, _hL]], rpm);
      }
      wt = 1;
      // from the pouch to the well the hand carries the fresh mag (magInHand): the mag's path leads, the hand holds it;
      // once it's home the hand gives it a push and goes back to the gun
      const mg = (MAGG[s] || [])[0];
      if (mg && rpm >= MAG_TAKE && rpm < 1 && magShape(mg)) {
        if (rpm < MAG_SEAT) free = magInHand(_p4, s, H, mg, rpm);
        else { magInHand(_p2, s, H, mg, MAG_SEAT); MAG_CARRY.u = -1; _p3.copy(_p2); _p3.y += 0.014; free = walkPath(_p4, [[MAG_SEAT, _p2], [MAG_SEAT + 0.04, _p3], [MAG_SEAT + 0.09, _p2], [1, _hL]], rpm); mg.position.set(0, 0, 0); mg.rotation.set(0, 0, 0); }
      }
      if (PS && rr > 0) {
        // then the slide: over the top to pinch the back of it, tug it off the stop and let it fly, the hand flicking
        // away; or the thumb pressed down on the slide stop at the frame's left
        const sq = sl && sl.find(e => e.lock), dz = sq ? sq.m.position.z - sq.z0 : 0, A = H.slideAt || [X, 1.172, 0.57], B = H.stopAt || [X + 0.03, 1.128, 0.66];
        if (W8.relVar === 0) {
          gunPt(_p1, s, 'R', A[0], A[1] + 0.04, A[2] + dz - 0.01); gunPt(_p2, s, 'R', A[0], A[1], A[2] + dz); gunPt(_p3, s, 'R', A[0] + 0.01, A[1] + 0.05, A[2] - 0.07);
          free = walkPath(_p4, [[0, _hL], [0.24, _p1], [0.36, _p2], [relU, _p2], [relU + 0.09, _p3], [1, _hL]], rr);
        } else { free = null; wt = 0; }   // the slide release: the shooting hand's thumb does it (the gun's roll, above), the support hand back on the grip
      }
    } else if (rel === 'shell') {
      if (id === 'revolver' && cr.length) _p1.set(0.035, 0.045, -0.07).applyMatrix4(cr[0].matrix).applyMatrix4(holdOf(s, 'R').matrix).applyMatrix4(gg.matrix);   // the back of the open cylinder
      else if (brkG && brkG.rims.length) {
        // the next empty chamber of the open barrels, and the line back along its bore the shell comes in on
        const r = brkG.rims[Math.min(brkG.rims.length - 1, W8.mag[id] || 0)], hq = holdOf(s, 'R');
        _p1.copy(r.position).applyMatrix4(brkG.g.matrix).applyMatrix4(hq.matrix).applyMatrix4(gg.matrix);
        _bq.copy(gg.quaternion).multiply(hq.quaternion).multiply(brkG.g.quaternion); _slAx.set(0, 0, 1).applyQuaternion(_bq);
        _p1.addScaledVector(_slAx, -0.03);
      }
      else { const pt = H.port || H.grip; gunPt(_p1, s, 'R', pt[0], pt[1], pt[2]); }
      // where a round goes in, and which way (along the barrels' bore when they're broken open)
      _feedAt.copy(_p1); if (brkG && brkG.rims.length) _feedQ.copy(_bq); else _feedQ.copy(gg.quaternion).multiply(holdOf(s, 'R').quaternion);
      _feedAx.set(0, 0, 1).applyQuaternion(_feedQ); _feedUp.set(0, 1, 0).applyQuaternion(_feedQ);
      if (brkG && brkG.rims.length) { _p2.copy(_p1).addScaledVector(_slAx, -0.09); _p2.y += 0.03; }   // lined up behind the chamber
      else { _p2.copy(_p1); _p2.y -= 0.1; _p2.x -= 0.05; }
      const st = W8.relStyle || 0;
      const row = !brkG && rowLoad(id, D) ? Math.min(3, W8.goN || 1) : 1;
      if (row > 1) {
        // a row in the palm: up to the port quickly, held there while the thumb pushes each shell in, a nudge in with each
        free = walkPath(_p4, [[0, POUCH], [0.17, _p2], [HSH_FEED[0], _p1], [HSH_FEED[1], _p1], [1, POUCH]], rp);
        if (rp > HSH_FEED[0] && rp < HSH_FEED[1]) { const { u } = rowAt(rp, row), j = Math.sin(Math.PI * smooth(u)); free.addScaledVector(_feedAx, 0.016 * j).addScaledVector(_feedUp, 0.006 * j); }
      }
      else if (st === 1) { _p2.add(_rv.set(-0.03, -0.04, 0)); _p3.copy(_p1).lerp(_p2, -0.12); free = walkPath(_p4, [[0, POUCH], [0.45, _p2], [0.7, _p1], [0.76, _p3], [0.86, _p1], [1, POUCH]], rp); }   // in low from the left, a firm thumb push
      else if (st === 2) { _p3.copy(POUCH).lerp(_p2, 0.5); _p3.y += 0.05; free = walkPath(_p4, [[0, POUCH], [0.28, _p3], [0.5, _p2], [0.7, _p1], [0.86, _p1], [1, POUCH]], rp); }   // up and over, then in
      else free = walkPath(_p4, [[0, POUCH], [0.45, _p2], [0.7, _p1], [0.86, _p1], [1, POUCH]], rp);
      wt = W8.relWait > 0 ? 0 : 1;   // (on the gun while the action's pulled back: a pump's forend is pulled with it)
    } else if (shP >= 0 && brkG) {
      // closing the double barrel: back from wherever the hand was (the pouch, or the chamber if it was stopped) to the
      // forend where it hangs on the swung-down barrels, under and up onto it, then riding it as it lifts them shut
      const bp = brkG.g.position, fy = H.fore[1] + fh[0] - foreDrop(s, H);
      _p1.set(H.fore[0] - bp.x, fy - bp.y, H.fore[2] + fh[1] - bp.z).applyMatrix4(brkG.g.matrix); gunPt(_p1, s, 'R', _p1.x, _p1.y, _p1.z);
      if (!ANIM.shFrom) ANIM.shFrom = new V3().copy(_fL);
      if (shP < BRK_GRAB) { const k = smooth(shP / BRK_GRAB); _p2.copy(_p1); _p2.y -= 0.05; free = walkPath(_p4, [[0, ANIM.shFrom], [0.7, _p2], [1, _p1]], k); }
      else free = _p4.copy(_p1);
      wt = 1;
    }
    if (shP < 0) ANIM.shFrom = null;
    if (free && re > 0.001) { const b = Math.sin(Math.PI * clamp(rp, 0, 1)); free.x += J.dx * b; free.y += J.dy * b; }
    handTarget(_fL, 'L', _hL, free, wt, rdt, MAG_CARRY.u >= 0);
    magToFist(_fL, free);   // the fresh mag, where the fist actually got to
    // the round in the hand from the pouch till it's pushed in (pump and double barrel shells, rifle cartridges, the
    // revolver's rounds). One on its own leaves the fingers at the port and is thumbed in: up into a pump's tube and on
    // forward, down into the rifle's well and forward under the bolt, along the bore into a barrel or a chamber of the
    // cylinder (FEED_IN). A row of shells (Sleight of Hand) is thumbed in one after another off the palm (HSH_FEED)
    const rnd = D.ammo === 'rifle' || D.ammo === 'magnum', n = rnd ? 1 : Math.min(3, W8.goN || Math.max(1, Math.min(D.loadN || 1, magSize(id) - (W8.mag[id] || 0), reserveOf(id))));   // as many as are going in this go (fixed as it starts: weapons/reload.js)
    const feed = rel === 'shell' && rp > 0.12 && rp < (n === 1 ? 0.995 : HSH_FEED[1]);   // (one on its own stays where it went in till it's counted in: tickReload)
    HSH.visible = feed;
    if (feed) {
      const rifle = rnd;
      // side by side into the two chambers, or a row down the palm whose top one is at the port, the row riding up as
      // each goes in
      const ra = brkG ? null : rowAt(rp, n), fed = ra ? ra.k : 0;
      HSH_R.visible = rifle; HSH_R.scale.z = D.ammo === 'magnum' ? 0.6 : 1;   // (a .357's case is short)
      const sm = shellMat(id); HSH_S.forEach(g => { g.children[0].material = sm; });   // in the colour of the kind loaded (weapons/gun-models.js)
      HSH.quaternion.copy(_feedQ); HSH.position.copy(_fL).addScaledVector(_feedAx, 0.04);
      // a row: the top one lifted to the port and pushed up into the tube in its own push, the rest riding up a place
      // after it's in (the last counted in as its push ends: weapons/reload.js)
      const u = ra && n > 1 ? ra.u : 0, ride = smooth(clamp((u - 0.55) / 0.45, 0, 1)), lift = smooth(clamp(u / 0.4, 0, 1));
      const push = smooth(clamp((u - 0.3) / 0.6, 0, 1));
      HSH_S.forEach((g, k) => { g.visible = !rifle && k < n && k >= fed; if (brkG) g.position.set(k * HSH_GAP, 0, 0); else if (k === fed && u > 0) g.position.set(0, 0.016 * lift, 0.06 * push); else g.position.set(0, (fed - k + (u > 0 ? ride : 0)) * HSH_GAP, 0); });
      if (n === 1 && rp > FEED_IN[0]) {
        // lined up on the port as the hand gets there, then pushed in: how far, and which way, by the gun
        const k = smooth(clamp((rp - FEED_IN[1]) / (FEED_IN[2] - FEED_IN[1]), 0, 1)), a = Math.min(1, k * 2), b = Math.max(0, k * 2 - 1);
        _feedV.copy(_feedAt);
        if (D.ammo === 'rifle') _feedV.addScaledVector(_feedUp, -0.02 * a).addScaledVector(_feedAx, 0.035 * b);
        else if (EJECT[id] === 'pump') _feedV.addScaledVector(_feedUp, 0.016 * a).addScaledVector(_feedAx, 0.075 * b);
        else _feedV.addScaledVector(_feedAx, (D.ammo === 'magnum' ? 0.034 : 0.066) * k);
        HSH.position.lerp(_feedV, smooth(clamp((rp - FEED_IN[0]) / (FEED_IN[1] - FEED_IN[0]), 0, 1)));
      }
    }
    // the loader rides in front of the left fist from the pouch until it's let go, rounds pointing into the cylinder,
    // and is twisted a sixth of a turn once they're in
    const slOn = rel === 'mag' && D.speedload && rp > 0.25 && rp < SL_DROP;
    if (slOn) {
      SLM.visible = true; SL_RND.visible = true;
      // turned with the cylinder on its crane, so each round lines up with a chamber; it carries only the rounds for the
      // chambers that are empty (the ones loaded at the start stay where they are: cylHeads)
      { const free = CHAMBERS - Math.min(CHAMBERS, W8.slLive | 0); SL_RND.children.forEach((m, j) => { m.visible = Math.floor(j / 3) < free; }); }
      SLM.position.copy(_fL).addScaledVector(_slAx, SL_HAND); SLM.quaternion.copy(_slQ); if (cr[0]) SLM.rotateZ(cr[0].rotation.z);
      SLM.rotateZ(smooth(clamp((rp - SL_IN - 0.02) / 0.08, 0, 1)) * Math.PI / 3);
    } else if (SLM.visible && !(rel === 'mag' && D.speedload)) SLM.visible = false;   // cut short (a swap, a vault)
  } else handTarget(_fL, 'L', _hL, akOff('L') ? akFree : null, akOff('L'), rdt);
  // ---- arms: each one points at its own fist target, so only the hand that is busy moves
  const hr = HAND_ROLL[H.kind] || HAND_ROLL.hand;
  reach(pm.armR, 'R', _fR, hr.R * (1 - HAND.R.w)); reach(pm.armL, 'L', _fL, ak ? -hr.R * (1 - HAND.L.w) : hr.L * (1 - HAND.L.w));   // (turned back straight while a hand's off the gun)
  pm.head.rotation.x += ANIM.pitch * 0.6 + ads * 0.1 + ACT.hp; pm.head.rotation.y += ACT.hy;
  pm.head.rotation.z -= ads * 0.13;   // and the head tips over onto the stock to look down the sights
  up.x += ANIM.pitch * 0.26 + ads * 0.05;
}
