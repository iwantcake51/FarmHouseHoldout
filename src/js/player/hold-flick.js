// The M4's flick reload: the gun snapped over on the wrist, its mag flung out of the well mid-flick, the fresh one
// driven home and, run dry, the bolt catch slapped (weapons/reload.js: flickReload, FLK, has the gameplay's marks).
//
// With the AR's own 30-round box in it the old mag isn't stripped out by hand. The thumb's on the release as the
// reload starts and the support hand's already off the handguard on its way down to the pouch. The trigger hand eases
// the gun a touch the other way (wind), then snaps it over hard on the wrist (snap): a quick flick, its top rolled in
// toward you and the gun swung out to the right, so the well swings out and the mag hanging in it is thrown off out to
// the right, up and forward, tumbling. It lets go mid-flick (FLK.rel, found below: at the flick's quickest). The wrist
// catches the gun, carries it on past and rocks it back (the spring's give), holds it out a beat, then eases it back
// in, slowly, into the reload's own pose (player/hold.js), the support hand already on its way up with the fresh mag.
// That goes straight up the well and is driven home hard, the gun bucking off it and settling (buck); run dry the heel
// of the hand comes up off the mag's foot onto the bolt catch just above the well and slaps it, the bolt flying home
// (flickSlapPath).
//
// It's all one motion, no steps in it: where the wrist means the gun to be (aim: held, cocked back, flicked out, held
// out, back in) is eased between its keys, never starting or stopping dead, and the gun follows that on a springy
// wrist (a spring a little under its damping), so it lags into the snap, whips through it, carries on past and settles,
// its speed never jumping anywhere. The spring's run once, ahead, over the mag change's own time (u, 0 to 1: FLK_TAB),
// so a quicker reload flicks quicker and every frame rate draws exactly the same curve.

import { clamp } from '../core/math.js';
import { V3 } from '../core/renderer.js';
import { P } from './player.js';
import { W8 } from '../game/run-state.js';
import { X } from '../weapons/gun-materials.js';
import { FLK, MAG_SEAT } from '../weapons/reload.js';
import { walkPath } from './hold.js';

// aim: where the wrist means the gun to be, [u, how far into the flick] (0 held, 1 flicked out, - cocked the other
// way), eased between each and the next (ease5). wrist: the spring the gun follows it on, in the mag change's time:
// its period (how long one swing of it takes, of the mag change) and its give (damping ratio: 0.38 carries on about a
// quarter past the flick and rocks back, settling in two swings). pose: the gun at the full of the flick, in your upper
// body's frame: rolled (r, radians: + is its top in toward you, the well out), the muzzle up (p, up is -) and turned
// (y), out to the right (x, metres: - is right), up (h) and forward (z), the chest's twist with it (tw) and the head
// (hy turned, hp tipped). fp: how much of each from your own eyes (the gun right under your eye there: less of the roll
// and the swing out, or it fills the view and goes off the side of it; tipped up and lifted more, so the well's in
// sight as the mag's thrown). buck: the fresh mag driven home, the gun knocked up off it and settling (from the seat,
// over dur of the mag change). slide: how far the old mag drops in the well under its own weight once the release is
// pressed, before it's flung (m). fling: how fast it leaves the well (m/s, by the way you face: side + is to your
// right), as fast again with a reload half as long (base: the mag change, seconds, it's tuned to; up to most), and its
// tumble (spin, roll: rad/s, the way the gun was rolling). seat, slap: their knocks (relKnock: pitch, roll, up, back).
// off: a flick cut short (a swap, a shove) is let go of on a critically damped spring this stiff (rad/s), so it eases
// off from however it was moving rather than snapping back
export const FLICK = {
  aim: [[0, 0], [0.02, 0], [0.085, -0.24], [0.122, 1], [0.2, 1], [0.5, 0]],
  wrist: { period: 0.075, give: 0.38 },
  pose: { r: 0.95, p: -0.08, y: 0.12, x: -0.06, h: 0.025, z: 0.02, tw: 0.08, hy: -0.07, hp: -0.03 },
  fp: { r: 0.65, p: 1.5, y: 0.5, x: 0.4, h: 1.8, z: 0, tw: 1, hy: 1, hp: 1 },
  buck: { dur: 0.13, p: -0.07, h: 0.012, z: 0.008 },
  slide: 0.012,
  fling: { side: 1.9, up: 2.4, fwd: 1.3, spin: -9, roll: -3, base: 2, most: 1.5 },
  seat: [-3.2, -1.5, 0.8, 0.35], slap: [-2.2, -1.6, 0.35, -0.4],
  off: 12
};
// the AR's bolt catch (weapons/models-rifles.js: on the lower's left, just over the well), in the gun's own frame, and
// where the support hand's fist is as it strikes it: out to its left and a little below (the heel of the hand on it),
// how far out and up it's drawn back to strike it from, and how far it bounces off
const BOLT_CATCH = [X + 0.0265, 1.087, 0.619], SLAP = { out: 0.05, down: 0.02, wind: 0.045, lift: 0.05, off: 0.08 };
const ease5 = t => t * t * t * (t * (t * 6 - 15) + 10);
function flickAim(u) {
  const A = FLICK.aim; let i = 0; while (i < A.length - 2 && A[i + 1][0] <= u) i++;
  const a = A[i], b = A[i + 1], t = clamp((u - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
  return a[1] + (b[1] - a[1]) * ease5(t);
}
// the gun on its springy wrist through the whole mag change, worked out once in fine steps (FLK_N of them) and looked
// up after, and where it's quickest through the snap: that's where the mag lets go (FLK.rel)
const FLK_N = 2000, FLK_TAB = new Float32Array(FLK_N + 1);
{
  const W = FLICK.wrist, w = 2 * Math.PI / W.period, sub = 8, h = 1 / (FLK_N * sub);
  let x = 0, v = 0, best = 0;
  for (let i = 0; i <= FLK_N; i++) {
    FLK_TAB[i] = x;
    if (v > best && i / FLK_N < FLICK.aim[4][0]) { best = v; FLK.rel = i / FLK_N; }
    for (let k = 0; k < sub; k++) { const u = (i * sub + k) * h; v += (w * w * (flickAim(u) - x) - 2 * W.give * w * v) * h; x += v * h; }
  }
}
function flickK(u) { const f = clamp(u, 0, 1) * FLK_N, i = Math.min(FLK_N - 1, Math.floor(f)); return FLK_TAB[i] + (FLK_TAB[i + 1] - FLK_TAB[i]) * (f - i); }
// the gun's pose for it this frame (player/hold.js adds it to the hold's own): on, through a flick reload's mag change
// (u how far, pz how far paused); off, what's left let go of on its spring (FLICK.off), from the way it was moving
const FS = { p: 0, y: 0, r: 0, x: 0, h: 0, z: 0, tw: 0, hy: 0, hp: 0 }, FV = { ...FS }, AX = Object.keys(FS);
export function flickPose(on, u, rdt, fp, pz) {
  if (on) {
    const F = flickK(u), b = clamp((u - MAG_SEAT) / FLICK.buck.dur, 0, 1), bk = b > 0 && b < 1 ? Math.sin(Math.PI * b) * Math.exp(-2.2 * b) : 0;
    for (const a of AX) { const t = (FLICK.pose[a] * F * (fp ? FLICK.fp[a] : 1) + (FLICK.buck[a] || 0) * bk) * (1 - pz); if (rdt > 0) FV[a] = (t - FS[a]) / rdt; FS[a] = t; }
  } else if (rdt > 0) {
    const w = FLICK.off;
    for (const a of AX) { if (Math.abs(FS[a]) + Math.abs(FV[a]) < 1e-5) { FS[a] = FV[a] = 0; continue; }
      for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / n, i = 0; i < n; i++) { FV[a] += (-w * w * FS[a] - 2 * w * FV[a]) * h; FS[a] += FV[a] * h; } }
  }
  return FS;
}
// the old mag let go mid-flick (weapons/casings.js: dropMag): how fast it leaves the well, in the world, and how it
// tumbles: thrown out to your right, up and forward in an arc (so from your own eyes it's seen to go, not gone off the
// side of the view in a frame or two), quicker the quicker the reload; your own speed's put on it there. (By the way you face, not your chest: that's turned side-on to hold a long gun)
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
  return walkPath(out, [[0, onGun], [0.03, onGun], [0.16, _fhA], [0.36, pouch], [0.42, pouch], [0.6, _fhB], [0.8, well], [0.9, well], [1, onGun]], u);   // (at the pouch a beat, still, as the mag's taken)
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
