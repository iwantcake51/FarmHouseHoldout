// Looking your weapon over (the inspect key, Y to start with: input/keybinds.js): a gun's brought up and in, rolled over
// to show one side, then the other, swung round so you see down its muzzle end, and tipped to look along its back and
// top, your head going with it, before it goes back onto the aim; a melee weapon's own way (melee/melee-anim.js:
// MINSPECT). Seen from your own eyes or from above alike.
// The moves are keyframes (INSPECT: a handgun's turned further and brought closer, on the wrist; a long gun's more
// about the shoulder; the revolver's twirled round your trigger finger first, a cowboy's spin, INSPECT_SPIN). Each is a
// pose the gun's brought to: it sets off gently, swings through quickest in the middle and slows into the pose (eased,
// never at a steady rate), the hands never quite still while it's held there (INSP_SHAKE), and the whole of it on
// springs on top (INSP_SPRING) that carry it a touch past each pose and settle it back, as a real wrist does. Firing, aiming, a reload, a sprint, a vault, switching weapons or
// anything else that needs your hands ends it, the gun easing straight back onto the aim. player/hold.js puts it on
// the gun (inspectPose).

import { clamp } from '../core/math.js';
import { P } from './player.js';
import { curId, W, W8 } from '../game/run-state.js';
import { state } from '../game/state.js';
import { swapSt } from './swap.js';
import { aiming } from './aiming.js';
import { mouseDown } from '../input/keyboard-mouse.js';
import { ANIM } from './animation.js';
import { openSt } from '../stations/station-ui.js';

// each pose: when (seconds), the gun's turn (p: muzzle down, y: muzzle round, r: rolled over, radians) and its place
// (x across, h up, z forward, metres), the head (hp: down, hy: round) and the chest (tw: twisted round); fs: from your
// own eyes, how far it's turned side on to you (player/hold.js, FP_INSPECT_TURN); up: how far it's brought up in front
// of your eyes (game/view-cam.js, fpInspectPose): none at the start and the end, so it's carried there and back as
// smoothly as it's turned
const K = (t, p, y, r, x, h, z, hp, hy, tw, fs = 1, up = 1) => ({ t, p, y, r, x, h, z, hp, hy, tw, fs, up });
const HAND_KEYS = [
  K(0.45, -0.12, -0.3, 1.25, 0.03, 0.1, -0.13, 0.3, -0.12, -0.05),     // brought up close, turned on the wrist: its one side
  K(1.15, -0.16, -0.38, 1.35, 0.035, 0.105, -0.14, 0.32, -0.16, -0.06),
  K(1.75, -0.04, 0.3, -1.2, -0.01, 0.1, -0.13, 0.3, 0.12, 0.04),        // over to the other
  K(2.35, -0.06, 0.36, -1.25, -0.015, 0.105, -0.135, 0.31, 0.15, 0.05),
  K(2.95, -0.42, 1.0, -0.3, -0.04, 0.12, -0.1, 0.22, 0.34, 0.1),        // round to look down the muzzle end
  K(3.55, 0.45, -0.2, 0.25, 0.01, 0.08, -0.12, 0.36, -0.04, -0.02),     // tipped down: the back of the slide, the sights
  K(4.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)   // (and back onto the aim, unhurried)
];
// from your own eyes a handgun's looked over differently: what shows its sides to someone looking down on you (rolled
// on the wrist) shows you only the back of its slide, so it's turned side on across in front of you (muzzle to your
// left: its right side, the port), the wrist rolled right over (its left side, upside down), its muzzle tipped up to
// look at its front, then tipped down to look along its top to the sights, held low in the middle of the view
const HAND_KEYS_FP = [
  K(0.5, -0.1, 1.15, 0.12, 0, 0, 0, 0.3, -0.05, 0, 0),         // turned side on: its right side, the port
  K(1.2, -0.14, 1.25, 0.18, -0.02, 0.005, 0, 0.32, -0.07, 0, 0),
  K(1.9, 0.05, 1.05, 2.75, -0.09, 0.02, -0.03, 0.3, 0.02, 0, 0),    // rolled right over: its left side (brought across clear of the forearm)
  K(2.6, 0.08, 1.15, 2.85, -0.095, 0.025, -0.03, 0.31, 0.04, 0, 0),
  K(3.25, -0.85, 0.5, 0.25, 0, 0, 0, 0.24, 0.08, 0, 0),         // muzzle tipped up: its front
  K(3.85, 0.42, 0.12, 0.05, 0, 0, 0, 0.36, 0, 0, 0),            // tipped down: along its top, the sights
  K(4.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
];
const SPIN_T = 1.45;   // (the revolver's spin first, then it's looked over as any handgun)
const INSPECT = {
  long: [
    K(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    K(0.5, -0.06, -0.22, 0.85, 0.02, 0.05, -0.08, 0.26, -0.14, -0.06),   // up, in and rolled over: its one side
    K(1.3, -0.1, -0.3, 0.95, 0.025, 0.055, -0.085, 0.28, -0.18, -0.07),   // looked along, drifting
    K(1.95, 0.02, 0.18, -0.85, 0.0, 0.05, -0.08, 0.26, 0.1, 0.04),        // rolled right over: the other side
    K(2.6, 0.0, 0.26, -0.8, -0.01, 0.055, -0.085, 0.27, 0.14, 0.05),
    K(3.25, -0.24, 0.46, -0.3, -0.03, 0.07, -0.06, 0.2, 0.26, 0.1),       // swung round, muzzle up a little: down its front
    K(3.9, 0.2, -0.18, 0.18, 0.01, 0.04, -0.07, 0.3, -0.04, -0.02),       // tipped muzzle down: along its back and top
    K(4.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  ],
  hand: [K(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)].concat(HAND_KEYS),
  // held out to the side and a little forward on a loose wrist for the spin (from your own eyes turned most of the way
  // side on, so it's seen wheeling round the finger beside your hand), a glance down at it, then looked over
  revolver: [K(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), K(0.3, -0.08, 0.1, 0.05, 0.03, 0.03, 0.06, 0.16, 0.02, 0.02, 0.8), K(SPIN_T - 0.15, -0.1, 0.08, 0.02, 0.03, 0.035, 0.05, 0.18, 0.02, 0.02, 0.8)]
    .concat(HAND_KEYS.map(k => Object.assign({}, k, { t: k.t + SPIN_T })))
};
// the same from your own eyes (a long gun's are its own: turned only a little side on, player/hold.js FP_INSPECT_TURN)
const INSPECT_FP = {
  hand: [K(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)].concat(HAND_KEYS_FP),
  revolver: INSPECT.revolver.slice(0, 3).concat(HAND_KEYS_FP.map(k => Object.assign({}, k, { t: k.t + SPIN_T })))
};
// the revolver's spin: flicked forward round the trigger finger (at: seconds in, after a little wind back the other way,
// wind) for turns full turns, quickest as it leaves the hand and slowing as it's caught (dur: seconds); what's left of a
// turn when it's cut short is finished quickly (snap) rather than unwound
const INSPECT_SPIN = { revolver: { at: 0.38, dur: 0.85, turns: 2, wind: 0.35, windT: 0.14, snap: 18 } };
// the hands never quite still while it's held up (radians: muzzle, turn, roll; f: how quickly)
const INSP_SHAKE = { p: 0.012, y: 0.01, r: 0.018, f: [1.3, 1.7, 2.1] };
// how it's chased: a spring per channel, a touch under critical so it carries softly through each move (w: how
// quick, z: how damped); the blend in and out (wIn, wOut: how quickly it takes over, and lets go: slowly, so stopped
// part way it's the springs that carry it back onto the aim, unhurried, not the blend that snaps it there)
const INSP_SPRING = { w: 10, z: 0.72, wIn: 6, wOut: 2.5 };
const CH = ['p', 'y', 'r', 'x', 'h', 'z', 'hp', 'hy', 'tw', 'fs', 'up'];
// what's put on the gun this frame (o; spin: the revolver's twirl, radians), and the springs chasing the keyframes (s,
// and their speeds v)
const INSP = { t: -1, id: null, w: 0, o: { spin: 0 }, s: {}, v: {}, spin: 0 };
CH.forEach(c => { INSP.o[c] = INSP.s[c] = INSP.v[c] = 0; });
// whatever's stopping you: your hands are needed, or you're not in a state to stand and look
const busy = () => state !== 'play' || P.dead || !!openSt || !!W8.reloading || !!swapSt || P.vault || P.sprint || P.bandT > 0 || !!P.shove || aiming || (ANIM.ads || 0) > 0.15 ||
  !!(W8.cyc && W8.cyc.id === curId()) || W8.shutT > 0 || W8.grabT > 0 || W8.swing > 0 || (ANIM.ready || 0) > 0.2;
// how far into it you are (seconds; below nothing when you're not looking anything over)
export const inspectT = () => INSP.t;
// a melee weapon's: just its length, its poses being melee/melee-anim.js's own
const meleeTimeline = endT => [K(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), K(endT, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)];
// the key: starts it, or (pressed again) stops it
export function startInspect() {
  const id = curId(), D = W(id);
  if (INSP.t >= 0) { INSP.t = -1; return; }
  if (!D || busy()) return;
  INSP.t = 0; INSP.id = id;
}
// a shot or a reload ends it on the spot: the gun's straight back on the aim for it, not eased (weapons/firing.js,
// weapons/reload.js)
export function inspectCut() { const I = INSP; I.t = -1; I.w = 0; I.spin = I.o.spin = 0; for (const c of CH) I.o[c] = I.s[c] = I.v[c] = 0; hudOff(false); }
// the HUD's put away while you look it over (and back the moment you stop): body.inspecting, styles/hud-top.css
let hudGone = false;
function hudOff(v) { if (v !== hudGone) { hudGone = v; document.body.classList.toggle('inspecting', v); } }
// where channel c is at time t: between one pose and the next, eased out of the first and into the second (a smoother
// step: it sets off gently, is quickest halfway and settles in), never at a steady rate
function curve(L, t, c) {
  let i = 0; while (i < L.length - 2 && t > L[i + 1].t) i++;
  const b = L[i], d = L[i + 1], u = clamp((t - b.t) / Math.max(1e-3, d.t - b.t), 0, 1);
  return b[c] + (d[c] - b[c]) * u * u * u * (u * (u * 6 - 15) + 10);
}
// the revolver's spin at time t (radians round the trigger finger): a little wind back, the flick, and the catch
function spinAt(S, t) {
  if (t < S.at - S.windT) return 0;
  if (t < S.at) { const u = (t - S.at + S.windT) / S.windT; return -S.wind * Math.sin(Math.PI * 0.5 * u); }
  const u = clamp((t - S.at) / S.dur, 0, 1), e = 1 - Math.pow(1 - u, 3);   // (fastest off the hand, slowing into the catch)
  return -S.wind * (1 - Math.min(1, u * 4)) + S.turns * 2 * Math.PI * e;
}
// each frame from player/hold.js: where it's got to (INSP.o, already weighted), the gun's kind deciding its moves
// (a melee weapon's moves are its own, melee/melee-anim.js: endT is how long they run, and this keeps their time)
export function inspectPose(rdt, D, id, hand, fp, endT) {
  const I = INSP, now = performance.now();
  if (I.t >= 0 && (mouseDown || W8.reloading || id !== I.id)) inspectCut();   // (firing, reloading or another gun: back at once)
  if (I.t >= 0 && (!D || busy())) I.t = -1;   // (anything else: eased back onto the aim)
  const SET = fp ? INSPECT_FP : INSPECT, L = endT ? meleeTimeline(endT) : SET[id] || INSPECT[id] || (hand ? SET.hand : INSPECT.long), end = L[L.length - 1].t, S = INSPECT_SPIN[id];
  if (I.t >= 0) { I.t += rdt; if (I.t >= end) I.t = -1; }
  const on = I.t >= 0; hudOff(on);
  I.w += ((on ? 1 : 0) - I.w) * Math.min(1, rdt * (on ? INSP_SPRING.wIn : INSP_SPRING.wOut));
  if (!(rdt > 0)) return I.o;
  const w = INSP_SPRING.w, k = w * w, d = 2 * INSP_SPRING.z * w;
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), j = 0; j < n; j++)
    for (const c of CH) { const tg = on ? curve(L, I.t, c) : 0; I.v[c] += (k * (tg - I.s[c]) - d * I.v[c]) * h; I.s[c] += I.v[c] * h; }
  for (const c of CH) I.o[c] = I.s[c] * I.w;
  // the hands never quite still while it's held up
  { const q = INSP_SHAKE, f = q.f, ts = now / 1000, k = I.w;
    I.o.p += q.p * k * Math.sin(ts * f[0] * 6.28); I.o.y += q.y * k * Math.sin(ts * f[1] * 6.28 + 1.1); I.o.r += q.r * k * Math.sin(ts * f[2] * 6.28 + 2.3); }
  // the spin: as it goes, or (cut short) finished off to the nearest whole turn, quickly, and let go of
  if (S && on) I.spin = spinAt(S, I.t);
  else if (I.spin) { const tgt = Math.round(I.spin / (2 * Math.PI)) * 2 * Math.PI, sn = S ? S.snap : 18; I.spin += (tgt - I.spin) * Math.min(1, rdt * sn); if (Math.abs(tgt - I.spin) < 0.01) I.spin = 0; }
  I.o.spin = I.spin;
  return I.o;
}
// how far it's under way (or still settling back): the gun's up in view for it in first person (game/view-cam.js), the
// hands shifting for it (player/hold.js)
export const inspectW = () => clamp(INSP.o.up, 0, 1);
// how far into looking it over it's blended (eased in as it starts, out as it ends: a melee weapon's moves go by this)
export const inspectBlend = () => INSP.w;
// what's on the gun this frame, as inspectPose last left it
export const inspectOut = () => INSP.o;
