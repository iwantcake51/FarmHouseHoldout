// The gun's springs: the rifle bolt's turn, the gun riding a rack or a reload's knocks, the revolver's
// cylinder flick, and recoil: each shot's kick, the shoulder rocking back and the hand climbing (gunKick).

import { clamp, rand, rr, smooth } from '../core/math.js';
import { springTo } from '../game/camera.js';
import { ANIM } from './animation.js';

// how far the hunting rifle's bolt handle turns up to unlock (radians)
export const BOLT_TURN = 1.05;
// the gun riding a rack: a loose spring per axis (muzzle pitch, roll, yaw, back into the shoulder, down, and the
// torso's twist) chasing where working the action pulls it, knocked again at each stop (rackKick, from
// weapons/casings.js), so it lags behind the hand, overshoots and settles instead of moving in lockstep with the action
export const RACK = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, z: 0, vz: 0, h: 0, vh: 0, w: 0, vw: 0 }, RACK_K = 130, RACK_D = 10;
export function rackKick(p, r, z) { RACK.vp += p; RACK.vr += r * rr(0.85, 1.15); RACK.vz += z; }
export function stepRack(rdt, t) {
  for (let n = Math.ceil(rdt / (1 / 120)), dt = rdt / Math.max(1, n), i = 0; i < n; i++)
    for (const a of ['p', 'r', 'y', 'z', 'h', 'w']) springTo(RACK, a, 'v' + a, t[a], a === 'z' ? RACK_K * 1.3 : a === 'w' ? RACK_K * 0.6 : RACK_K, RACK_D, dt);
}
export const _rackT = { p: 0, r: 0, y: 0, z: 0, h: 0, w: 0 };
// the reload's own motion: where a reload wants the gun (its pose for the kind of reload, and how it rolls and tips
// through it: over to shake the old mag out, easing back while the hand's at the pouch, rolled and tipped to meet the
// new one, rocking with each shell thumbed in), and where the head and chest go with it (down at the gun, round to the
// pouch), chased on a slightly loose spring per axis. So a reload eases in and out, one cut short by a swap, a vault or
// a bandage runs back rather than snapping, and the beats of it (relKnock: the mag shaken out, the new one slapped home,
// a shell pushed in, a slide or cylinder slammed) knock it and it rocks back. Muzzle pitch (down is +), roll (toward
// the support hand is -), yaw, up (h), back (z), the head's pitch and turn (hp, hy) and the chest's (tw)
export const ACT = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, h: 0, vh: 0, z: 0, vz: 0, hp: 0, vhp: 0, hy: 0, vhy: 0, tw: 0, vtw: 0 }, ACT_K = 260, ACT_D = 26;
export const ACT_AX = ['p', 'r', 'y', 'h', 'z', 'hp', 'hy', 'tw'], _actT = { p: 0, r: 0, y: 0, h: 0, z: 0, hp: 0, hy: 0, tw: 0 };
export function relKnock(p, r, h, z) { ACT.vp += p; ACT.vr += r * rr(0.85, 1.15); ACT.vh += h || 0; ACT.vz += z || 0; }
export const REV_OPEN = 0.06, REV_SWING = 1.75, REV_OUT = [0.012, 0.01];   // the revolver's cylinder: how soon it's out, how far it swings (radians) and is carried out and down (m)
// and flicked shut (player/hold.js, the crane): the wrist cants the gun a touch further open (wind: seconds, its kick
// to the gun's roll), then snaps it hard the other way (snap), the cylinder swinging home on it a moment later (swing:
// how fast it's flung) and latching with a click and the faintest rebound (rebound, of its speed)
export const REV_FLICK = { wind: 0.07, windKick: 2.6, snap: 13, snapYaw: 1.6, snapPitch: 2.2, swing: 10, rebound: 0.1 };
export const bump = (t, a, b) => Math.sin(Math.PI * clamp((t - a) / (b - a), 0, 1));   // 0, up to 1 and back to 0 between a and b
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
export const kickPitch = p => p < 0 ? -KICK_UP * Math.tanh(-p / KICK_UP) : p;
const kickState = () => ({ p: 0, vp: 0, z: 0, vz: 0, h: 0, vh: 0, r: 0, vr: 0, y: 0, vy: 0, dropT: 0, dP: 0, dH: 0, dZ: 0, ret: 1 });
export const RK = { R: kickState(), L: kickState() };
// the rest of the kick goes into the body: the shot rocks the shoulders back (x) and twists the shooting shoulder back
// (y), on a heavier, slower spring than the hands', and the arms ride it, so the gun's thrown up and back by the
// shoulders while the wrists hold most of the lean off the muzzle (poseGun: SR.x back into the pitch). A pump or a bolt
// gun (act) thumps hardest: more flip, a harder shove back into the shoulder, the hands lifted further and the
// shoulders rocked much further (KICK_ACT). The bolt-action rifle comes back from its kick slower than the rest
// (KICK_BOLT_RET of the speed, the same height), a heavy gun settling back onto the shoulder
export const SR = { x: 0, vx: 0, y: 0, vy: 0, ret: 1 }, SR_MAX = 0.14, KICK_ACT = { flip: 0.9, back: 1.6, lift: 0.9, rock: 1.0 }, KICK_BOLT_RET = 0.55;
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
export const recoilFeel = (D, kind, auto) => auto ? 'chatter' : kind === 'hand' ? 'snap' : D && D.ammo === 'shells' ? 'shove' : 'thump';
// the upper body shoved back along the aim by a shot (z, metres), and leant back with it (BR_LEAN radians a metre): on
// a heavier spring than the hands', so the chest takes the shot a beat after the gun and settles back under it. It's
// what reads from above: the gun driven back with the shooter rocking under it
export const BR = { z: 0, vz: 0 }, BR_LEAN = 0.6, BR_MAX = 0.07;
// act: how the gun cycles (EJECT in weapons/casings.js)
export function gunKick(side, pw, kind, auto, act, feel) {
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
export function stepKick(k, dt) {
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
export function stepRock(dt) {
  const s = SR.ret, s2 = s * s;
  for (let n = Math.ceil(dt / (1 / 240)), h = dt / Math.max(1, n), i = 0; i < n; i++) {
    SR.vx += (-200 * s2 * SR.x - 20 * s * SR.vx) * h; SR.x = clamp(SR.x + SR.vx * h, -0.05, SR_MAX);
    SR.vy += (-170 * s2 * SR.y - 18 * s * SR.vy) * h; SR.y = clamp(SR.y + SR.vy * h, -SR_MAX, SR_MAX);
    BR.vz += (-240 * BR.z - 23 * BR.vz) * h; BR.z = clamp(BR.z + BR.vz * h, -0.02, BR_MAX);
  }
}
