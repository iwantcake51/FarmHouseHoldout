// The M4's flick reload: the gun whipped out to the side, its mag flung out of the well mid-flick, the fresh one
// driven home and, run dry, the bolt catch slapped (weapons/reload.js: flickReload, FLK, has the gameplay's marks).
//
// With the AR's own 30-round box in it the old mag isn't stripped out by hand. The thumb's on the release as the
// reload starts and the support hand's already off the handguard on its way down to the pouch; the trigger hand cocks
// the gun a touch the other way (wind), then whips it out to the right (throw): canted hard over outward, its top to
// the right, swung out and the muzzle kicked across, so the well under the wrist swings in and the mag hanging out of
// it is thrown off the other way. It lets go mid-flick (FLK.rel), at the flick's quickest, and flies out of the well
// with the speed the well had, out across in front of you, tumbling the way the gun was rolling, while the wrist
// catches the gun, carries on a touch past and rocks back (the throw's give). A beat later the gun's brought back
// in (back), swinging on past straight to show the well to the support hand coming up with the fresh mag, and settles
// into the reload's own pose (player/hold.js). The new mag goes straight up the well and is driven home hard, the gun
// bucking up off it and settling (buck); run dry the heel of the hand comes up off the mag's foot onto the bolt catch
// just above the well and slaps it, the bolt flying home (flickSlapPath). Each of the flick's moves is the step of a
// spring with a little give, written out exactly (springStep) in the mag change's own time (u, 0 to 1), so a quicker
// reload flicks quicker, every frame rate draws the same curve and nothing in it starts or stops dead.

import { clamp } from '../core/math.js';
import { V3 } from '../core/renderer.js';
import { P } from './player.js';
import { W8 } from '../game/run-state.js';
import { X } from '../weapons/gun-materials.js';
import { FLK, MAG_SEAT } from '../weapons/reload.js';
import { walkPath } from './hold.js';

// wind: the cock the other way first (at: over that much of the mag change; k: how far, of the throw).
// throw / back: when each sets off (at, of the mag change), how long it takes to reach its furthest (peak) and its
// give (damping ratio: 0.5 carries on about a sixth past and rocks back, lower more). pose: the gun at the full of the
// flick, in your upper body's frame: rolled (r, radians: - is its top out to the right), the muzzle up (p, up is -)
// and turned out (y), out to the right (x, metres: - is right), up (h) and forward (z), the chest's twist with it (tw)
// and the head (hy turned, hp tipped). fp: how much of each from your own eyes (the gun right under your eye there:
// half the roll and little of the swing out, or it fills the view and is wrenched off the side of it; tipped up and
// lifted more, so the well's in sight as the mag's thrown and it crosses the bottom of the view). buck: the fresh mag
// driven home, the gun knocked up off it and settling (from the seat, over dur of the mag change). slide: how far the
// old mag drops in the well under its own weight once the release is pressed, before it's flung (m). fling: how fast
// it leaves the well (m/s, by the way you face: side + is to your right, so - is across to your left), as fast again
// with a reload half as long (base: the mag change, seconds, it's tuned to; up to most), and its tumble (spin, roll:
// rad/s). seat, slap: their knocks (relKnock: pitch, roll, up, back). decay: a flick cut short (a swap, a shove) eases
// off this quickly rather than snapping back
export const FLICK = {
  wind: { at: [0.01, 0.12], k: 0.2 },
  throw: { at: 0.09, peak: 0.085, give: 0.5 },
  back: { at: 0.27, peak: 0.13, give: 0.42 },
  pose: { r: -0.9, p: -0.06, y: 0.3, x: -0.08, h: 0.015, z: 0.02, tw: 0.08, hy: 0.07, hp: -0.03 },
  fp: { r: 0.5, p: 1.6, y: 0.35, x: 0.25, h: 2, z: 0, tw: 1, hy: 1, hp: 1 },
  buck: { dur: 0.13, p: -0.07, h: 0.012, z: 0.008 },
  slide: 0.012,
  fling: { side: -1.4, up: 0.5, fwd: 1.4, spin: 8, roll: 2.5, base: 2, most: 1.5 },
  seat: [-3.2, 1.5, 0.8, 0.35], slap: [-2.2, -1.6, 0.35, -0.4],
  decay: 9
};
// the AR's bolt catch (weapons/models-rifles.js: on the lower's left, just over the well), in the gun's own frame, and
// where the support hand's fist is as it strikes it: out to its left and a little below (the heel of the hand on it),
// how far out and up it's drawn back to strike it from, and how far it bounces off
const BOLT_CATCH = [X + 0.0265, 1.087, 0.619], SLAP = { out: 0.05, down: 0.02, wind: 0.045, lift: 0.05, off: 0.08 };
// a spring's step: where something sent from 0 to 1 at t = 0 is t later, reaching its furthest (past 1) at peak and
// settling with the give z (damping ratio, under 1)
function springStep(t, peak, z) {
  if (t <= 0) return 0;
  const wd = Math.PI / peak, w = wd / Math.sqrt(1 - z * z), e = Math.exp(-z * w * t);
  return 1 - e * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t));
}
// how far into the flick the gun is at u of the mag change: 0 held, 1 out at the side (a little past it at the throw's
// peak, a little the other way, rolled to the support hand, as it swings back)
function flickK(u) {
  const W = FLICK.wind, T = FLICK.throw, B = FLICK.back, w = Math.sin(Math.PI * clamp((u - W.at[0]) / (W.at[1] - W.at[0]), 0, 1));
  return -W.k * w * w + springStep(u - T.at, T.peak, T.give) - springStep(u - B.at, B.peak, B.give);
}
// the gun's pose for it this frame (player/hold.js adds it to the hold's own): on, through a flick reload's mag change
// (u how far, pz how far paused); off, what's left eases away
const FS = { p: 0, y: 0, r: 0, x: 0, h: 0, z: 0, tw: 0, hy: 0, hp: 0 }, AX = Object.keys(FS);
export function flickPose(on, u, rdt, fp, pz) {
  if (on) {
    const F = flickK(u), b = clamp((u - MAG_SEAT) / FLICK.buck.dur, 0, 1), bk = b > 0 && b < 1 ? Math.sin(Math.PI * b) * Math.exp(-2.2 * b) : 0;
    for (const a of AX) FS[a] = FLICK.pose[a] * F * (fp ? FLICK.fp[a] : 1) + (FLICK.buck[a] || 0) * bk;
    if (pz > 0) for (const a of AX) FS[a] *= 1 - pz;
  } else { const d = Math.exp(-rdt * FLICK.decay); for (const a of AX) FS[a] = Math.abs(FS[a]) < 1e-5 ? 0 : FS[a] * d; }
  return FS;
}
// the old mag let go mid-flick (weapons/casings.js: dropMag): how fast it leaves the well, in the world, and how it
// tumbles: thrown across to your left and forward, up a little, quicker the quicker the reload; your own speed's put
// on it there. (By the way you face, not your chest: that's turned side-on to hold a long gun)
export function flickFling() {
  const F = FLICK.fling, TL = W8.relTL, a = P.aim, fx = Math.sin(a), fz = Math.cos(a);   // (the way you face; your right is (-fz, 0, fx))
  const mc = (TL && TL.B ? TL.B : W8.reloadMax || F.base) * (W8.relDry ? FLK.mag : 1), k = clamp(F.base / Math.max(0.2, mc), 0.75, F.most);
  return { v: [(-fz * F.side + fx * F.fwd) * k, F.up * k, (fx * F.side + fz * F.fwd) * k], spin: F.spin * k, roll: F.roll * k };
}
// the support hand through the mag change: straight off the handguard as the flick starts (the trigger hand flicks the
// gun on its own), down and round under it to the pouch, then (player/hold.js: magInHand) up with the fresh mag and
// straight up the well; if there's no mag to carry it goes up to the well as the plain reload's does. onGun: its place
// on the handguard, well: the bottom of the well, pouch (all in upper-body space)
const _fhA = new V3(), _fhB = new V3();
export function flickFetchPath(out, onGun, well, pouch, u) {
  _fhA.lerpVectors(onGun, pouch, 0.55); _fhA.y -= 0.06;   // (dropping away under the gun, not across it)
  _fhB.copy(well); _fhB.y -= 0.22;
  return walkPath(out, [[0, onGun], [0.03, onGun], [0.15, _fhA], [0.38, pouch], [0.6, _fhB], [0.8, well], [0.9, well], [1, onGun]], u);
}
// run dry: from the fresh mag's foot, pushed home (seat, then push up through it, at sAt of the reload), up onto the
// bolt catch and slapped at FLK.slap, flicked off it and back round onto the handguard. gp(out, x, y, z): a point on
// the gun in upper-body space. By rp, the whole reload's way
const _fsA = new V3(), _fsB = new V3(), _fsC = new V3();
export function flickSlapPath(out, gp, seat, push, onGun, sAt, rp) {
  const [bx, by, bz] = BOLT_CATCH, S = SLAP, t = FLK.slap;
  gp(_fsA, bx + S.out + S.wind, by - S.down + S.lift, bz - 0.02);  // drawn back off it, out and above, to strike it
  gp(_fsB, bx + S.out, by - S.down, bz);                          // the heel of the hand on it, struck down
  gp(_fsC, bx + S.out + S.off, by - S.down - 0.02, bz + 0.03);    // and off it
  return walkPath(out, [[sAt, seat], [sAt + 0.03, push], [t - 0.045, _fsA], [t, _fsB], [Math.min(0.97, t + 0.05), _fsC], [1, onGun]], rp);
}
