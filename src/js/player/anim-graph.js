// The body's animation graph: how the poses the animator makes are put together and handed over from one to the next.
//
// It's two layers, as an engine's animation graph is (an AnimGraph in Source 2, an Animation Blueprint in Unreal):
//  - a blend space for getting about (locoPose): a stride going forward, one going backward and a side step each way,
//    each its own clip with its own way of moving, blended by which way you're going off the way your hips face, so a
//    diagonal is part stride and part side step and turning the way you go just slides the mix round. A backpedal is
//    its own walk (shorter steps, the foot lifted and reached back, landing toe first on bent knees), not a forward
//    walk played backwards; a strafe is a real side step (the leading foot stepping out, the other closing in after it,
//    the hips rocking over each, never a stride wrung round sideways);
//  - a state machine over the whole body (agState: getting about, landing, a vault, getting up at a run's start, ...).
//    Changing state never snaps the pose: the difference between where the body was and where the new state puts it is
//    carried over and dies away on its own (inertialization: each joint's offset and the speed it was moving at fade
//    to nothing along a smooth curve over the transition's time, AG_FADE), so the body flows from one into the next
//    with its momentum. The same catches any joint that would jump from one frame to the next without a change of
//    state (AG_JUMP), so nothing anywhere pops.
import { clamp } from '../core/math.js';
import { PM } from './player.js';

// ---- the blend space (locoPose): the side step's reach out (out, radians at a full stride), how its knees lift
// (lift), how far the hips ride over each foot (shift, metres) and rock (roll); the backpedal's step (of a forward
// one), its knees (knee) and how bent they're kept (bend); how quickly the mix follows a change of way (ease)
const LOCO = { out: 0.26, lift: 0.6, shift: 0.016, roll: 0.035, back: 0.78, knee: 0.85, bend: 0.06, ease: 8 };
const LW = { f: 1, b: 0, s: 0, sd: 1 };
// where you're going off the way the hips face (a: radians, 0 straight ahead), eased: forward, backward, a side step
// and which side (sd: +1 out toward the rig's +x)
export function locoWeights(a, moving, rdt) {
  if (moving) {
    const c = Math.cos(a), s = Math.sin(a), k = Math.min(1, rdt * LOCO.ease);
    LW.f += (Math.max(0, c) ** 2 - LW.f) * k; LW.b += (Math.max(0, -c) ** 2 - LW.b) * k; LW.s += (s * s - LW.s) * k;
    if (Math.abs(s) > 0.2) LW.sd = Math.sign(s);
  }
  return LW;
}
// the legs for the stride's phase (ph), how big it is (stride), the knees' bend (kn) and the standing knee's give,
// a sprint (sk) and a bad right leg (bad: its step's share, stiff: its knee's), blended by LW, into o
export function locoPose(o, ph, stride, kn, give, bad, stiff, limp) {
  const s = Math.sin(ph), c = Math.cos(ph), W = LW;
  // forward: the legs swing fore and aft, each knee bending as its leg comes through
  const fx = s * stride, fkL = kn * Math.max(0, -Math.cos(ph + 0.35)) ** 1.3 + give, fkR = kn * Math.max(0, Math.cos(ph + 0.35)) ** 1.3 * stiff + give * (1 - limp);
  // backward: a shorter step reached back, the knee lifting early in the swing and the weight kept on bent knees
  const bx = -s * stride * LOCO.back, bkL = kn * LOCO.knee * Math.max(0, -Math.cos(ph + 0.87)) ** 1.3 + give + LOCO.bend, bkR = kn * LOCO.knee * Math.max(0, Math.cos(ph + 0.87)) ** 1.3 * stiff + (give + LOCO.bend) * (1 - limp * 0.5);
  // a side step: the leading leg steps out (opening: its knee lifts), the other closes in after it (its knee lifting
  // then), the feet never crossing
  const sp = 0.5 + 0.5 * s, A = LOCO.out * stride / 0.65, kLead = kn * LOCO.lift * Math.max(0, c) ** 1.3 + give, kTrail = kn * LOCO.lift * 0.85 * Math.max(0, -c) ** 1.3 + give;
  const lead = A * sp * 0.65, trail = A * sp * 0.35, R = W.sd > 0;   // (the rig's legR is out toward +x)
  const sLz = -(R ? trail : lead), sRz = (R ? lead : trail) * bad, sLk = R ? kTrail : kLead, sRk = (R ? kLead : kTrail) * stiff;
  const sLx = (R ? 0.03 : -0.05) * sp, sRx = (R ? -0.05 : 0.03) * sp;
  o.lx = W.f * fx + W.b * bx + W.s * sLx;
  o.rx = -(W.f * fx + W.b * bx) * bad + W.s * sRx;
  o.lz = W.s * sLz; o.rz = W.s * sRz;
  o.kl = W.f * fkL + W.b * bkL + W.s * sLk; o.kr = W.f * fkR + W.b * bkR + W.s * sRk;
  // the hips over the foot taking the weight, rocking as the other lifts, and turning with a fore-and-aft stride only
  o.hx = W.s * W.sd * LOCO.shift * (sp - 0.5) * 2; o.hz = W.s * W.sd * LOCO.roll * c; o.twist = W.f + W.b;
  return o;
}

// ---- the state machine's hand-overs (inertialization): the joints it carries (the body's own: the arms are put on
// whatever's in your hands every frame, player/hold.js, and the hips' place over the ground goes with you; nor the upper
// body's turn, which is your aim: a flick of the mouse is meant to snap it round, and caught as a jump it was eased,
// the arms and the gun left behind and swung out of view)
const AG_J = [
  ['g', 'position', 'y'], ['g', 'rotation', 'x'], ['g', 'rotation', 'z'],
  ['lower', 'position', 'x'], ['lower', 'position', 'y'], ['lower', 'rotation', 'x'], ['lower', 'rotation', 'y'], ['lower', 'rotation', 'z'],
  ['upper', 'position', 'x'], ['upper', 'position', 'y'], ['upper', 'rotation', 'x'], ['upper', 'rotation', 'z'],
  ['legL', 'rotation', 'x'], ['legL', 'rotation', 'z'], ['legR', 'rotation', 'x'], ['legR', 'rotation', 'z'], ['shinL', 'rotation', 'x'], ['shinR', 'rotation', 'x'],
  ['head', 'rotation', 'x'], ['head', 'rotation', 'y'], ['head', 'rotation', 'z']
];
const AG_N = AG_J.length;
// how long a hand-over takes, by where it's from and to (seconds; '*' any), and a jump that's caught: more than jump
// (radians, or a tenth of that in metres) off where the joint was heading from last frame
const AG_FADE = { '*>*': 0.22, 'loco>land': 0.12, 'land>loco': 0.25, 'loco>vault': 0.16, 'vault>loco': 0.3, 'vault>land': 0.18, 'intro>loco': 0.4 };
const AG_JUMP = { jump: 0.16, fade: 0.18 };
const AG = { state: null, out: new Float32Array(AG_N), vel: new Float32Array(AG_N), raw: new Float32Array(AG_N),
  // per joint: its offset when the hand-over began (x0), how fast it was going (v0), how long it's to take (t1), how
  // far into it (t), and the curve's other terms (a, b, c, a0)
  x0: new Float32Array(AG_N), v0: new Float32Array(AG_N), t1: new Float32Array(AG_N), t: new Float32Array(AG_N), A: new Float32Array(AG_N), B: new Float32Array(AG_N), C: new Float32Array(AG_N), a0: new Float32Array(AG_N), on: false };
// (gone down, a ragdoll or the fall: there's nothing to hand over from when you're up again)
export function agReset() { AG.state = null; }
const agGet = i => { const [p, k, a] = AG_J[i]; return PM[p][k][a]; };
const agSet = (i, v) => { const [p, k, a] = AG_J[i]; PM[p][k][a] = v; };
// start joint i's hand-over from offset x (where it was less where it's now put) moving at v, over dur
function agStart(i, x, v, dur) {
  // (moving away from where it's headed, the speed's dropped rather than carried on past; and moving toward it fast,
  // the hand-over shortened so it doesn't overshoot)
  if (x * v > 0) v = 0;
  let t1 = dur; if (v * x < 0) t1 = Math.min(dur, -5 * x / v);
  t1 = Math.max(t1, 1e-3);
  const a0 = (-8 * v * t1 - 20 * x) / (t1 * t1);
  AG.x0[i] = x; AG.v0[i] = v; AG.t1[i] = t1; AG.t[i] = 0; AG.a0[i] = a0;
  AG.A[i] = -(a0 * t1 * t1 + 6 * v * t1 + 12 * x) / (2 * t1 ** 5);
  AG.B[i] = (3 * a0 * t1 * t1 + 16 * v * t1 + 30 * x) / (2 * t1 ** 4);
  AG.C[i] = -(3 * a0 * t1 * t1 + 12 * v * t1 + 20 * x) / (2 * t1 ** 3);
}
const agOff = (i, t) => { const T = Math.min(t, AG.t1[i]); return ((((AG.A[i] * T + AG.B[i]) * T + AG.C[i]) * T + AG.a0[i] / 2) * T + AG.v0[i]) * T + AG.x0[i]; };
// once the animator's put the body for this frame in the state it's in, the hand-over put on it: a new state, or a
// joint that's jumped, starts one from where the body was; then each joint goes where it's put plus what's left of
// its hand-over
export function agState(state, rdt) {
  if (!(rdt > 0)) return;
  const first = AG.state === null, key = AG.state + '>' + state, dur = AG_FADE[key] ?? AG_FADE['*>*'], change = !first && state !== AG.state;
  AG.state = state;
  for (let i = 0; i < AG_N; i++) {
    const r = agGet(i); AG.raw[i] = r;
    if (first) { AG.out[i] = r; AG.vel[i] = 0; AG.t1[i] = 0; continue; }
    const lin = AG_J[i][1] === 'position', jump = AG_JUMP.jump * (lin ? 0.1 : 1) * Math.max(1, rdt * 60);
    const was = AG.out[i], v = AG.vel[i], live = AG.t[i] < AG.t1[i];
    const off = live ? agOff(i, AG.t[i]) : 0;   // (what's still being carried over, measured against this frame's pose)
    if (change) agStart(i, was - r, v, dur);
    else if (Math.abs(r + off - (was + v * rdt)) > jump && !live) agStart(i, was - r, v, AG_JUMP.fade);
  }
  for (let i = 0; i < AG_N; i++) {
    let v = AG.raw[i];
    if (AG.t[i] < AG.t1[i]) { AG.t[i] += rdt; v += AG.t[i] < AG.t1[i] ? agOff(i, AG.t[i]) : 0; }
    AG.vel[i] = clamp((v - AG.out[i]) / rdt, -60, 60); AG.out[i] = v; agSet(i, v);
  }
}
