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

import { clamp, smooth } from '../core/math.js';
import { P } from './player.js';
import { curId, hasMod, W, W8 } from '../game/run-state.js';
import { state } from '../game/state.js';
import { swapSt } from './swap.js';
import { aiming } from './aiming.js';
import { mouseDown, mouseDownR } from '../input/keyboard-mouse.js';
import { ANIM } from './animation.js';
import { openSt } from '../stations/station-ui.js';
import { stocked } from '../weapons/firing.js';

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
const Z = t => K(t, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
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
  hand: [Z(0)].concat(HAND_KEYS)   // (every handgun's; the revolver's twirled first, REV_SPIN)
};
// the revolver's twirled first (INSPECT_SPIN): held out to the side and a little forward on a loose wrist (from your
// own eyes turned most of the way side on, so it's seen wheeling round the finger beside your hand), drifting a
// little as it goes round, a glance down at it as it's caught; then looked over just as any handgun is, from REV_LOOK
// seconds in. With a shoulder stock on it there's no twirling it: it's only looked over (inspectPose)
const REV_SPIN = [K(0.35, -0.08, 0.1, 0.05, 0.03, 0.03, 0.06, 0.16, 0.02, 0.02, 0.8), K(1.6, -0.1, 0.06, 0.03, 0.032, 0.036, 0.055, 0.18, 0.02, 0.02, 0.8)];
const REV_LOOK = 1.9, later = (L, dt) => L.slice(1).map(k => Object.assign({}, k, { t: k.t + dt }));
INSPECT.revolver = [Z(0), ...REV_SPIN, ...later(INSPECT.hand, REV_LOOK)];
// every gun looked over its own way, so no two read alike (from above and from your own eyes; a long gun's from your
// own eyes turned a little side on as well, player/hold.js FP_INSPECT_TURN), each after what you'd check on that one
Object.assign(INSPECT, {
  // the pump: rolled onto its side to look into the loading port underneath, then its right side and the ejection port,
  // muzzle up at the bead, and down along the receiver to the ghost ring
  pump: [Z(0), K(0.55, -0.05, -0.12, 1.5, 0.02, 0.06, -0.08, 0.32, -0.1, -0.04), K(1.25, -0.1, -0.18, 1.6, 0.02, 0.065, -0.085, 0.34, -0.12, -0.05),
    K(1.95, 0.02, 0.2, -0.9, 0, 0.05, -0.08, 0.26, 0.12, 0.04), K(2.6, 0, 0.26, -0.84, -0.005, 0.055, -0.085, 0.27, 0.14, 0.05),
    K(3.25, -0.3, 0.42, -0.2, -0.03, 0.07, -0.06, 0.2, 0.24, 0.1), K(3.9, 0.22, -0.12, 0.1, 0.01, 0.04, -0.07, 0.3, -0.03, -0.02), Z(4.75)],
  // the double: muzzles tipped right up to look over the rib at both bores, then each side plate in turn, and down the
  // rib to the bead
  dbl: [Z(0), K(0.6, -0.45, 0.35, 0.15, -0.02, 0.08, -0.05, 0.14, 0.2, 0.08), K(1.3, -0.5, 0.42, 0.22, -0.025, 0.085, -0.05, 0.12, 0.23, 0.09),
    K(2.0, -0.02, -0.25, 0.95, 0.02, 0.05, -0.08, 0.27, -0.14, -0.06), K(2.65, -0.05, -0.3, 1.0, 0.025, 0.055, -0.085, 0.28, -0.17, -0.07),
    K(3.35, 0, 0.22, -0.9, 0, 0.05, -0.08, 0.26, 0.12, 0.04), K(4.05, 0.25, -0.1, 0.05, 0.01, 0.04, -0.07, 0.32, -0.02, -0.01), Z(4.95)],
  // the sawn-off (the double cut down: weapons/gun-mods.js): short and light, so it's handled on the wrist more than the
  // shoulder: tipped muzzles up close to the eye to look straight down both bores, rolled right over to its left side
  // plate and then its right, quicker than the full-length gun, and tipped down to look along its stub of a rib
  dblSawn: [Z(0), K(0.45, -0.75, 0.45, 0.2, -0.02, 0.1, -0.03, 0.12, 0.22, 0.08), K(1.05, -0.8, 0.5, 0.28, -0.025, 0.105, -0.03, 0.1, 0.25, 0.09),
    K(1.65, -0.05, -0.4, 1.3, 0.03, 0.085, -0.1, 0.3, -0.16, -0.06), K(2.2, -0.08, -0.46, 1.4, 0.035, 0.09, -0.1, 0.31, -0.18, -0.06),
    K(2.8, -0.02, 0.36, -1.35, 0, 0.085, -0.1, 0.3, 0.15, 0.05), K(3.3, -0.04, 0.42, -1.42, -0.005, 0.09, -0.1, 0.31, 0.17, 0.05),
    K(3.85, 0.38, -0.08, 0.05, 0.01, 0.06, -0.08, 0.35, -0.02, -0.01), Z(4.55)],
  // the auto shotgun: canted onto its left side, rolled on to look at the mag from below, then its right
  // side, and its muzzle
  auto12: [Z(0), K(0.5, -0.12, -0.15, 1.2, 0.02, 0.07, -0.08, 0.3, -0.1, -0.05), K(1.15, -0.15, -0.2, 1.3, 0.025, 0.072, -0.082, 0.31, -0.12, -0.05),
    K(1.85, -0.22, 0.05, 1.55, 0.01, 0.08, -0.07, 0.24, 0, 0), K(2.5, -0.25, 0.08, 1.65, 0.01, 0.082, -0.07, 0.23, 0.02, 0),
    K(3.15, 0.02, 0.22, -0.85, -0.005, 0.05, -0.08, 0.26, 0.13, 0.05), K(3.8, -0.3, 0.45, -0.25, -0.03, 0.07, -0.06, 0.2, 0.25, 0.1), Z(4.7)],
  // the hunting rifle: brought up level and sighted along its top first, unhurried, then rolled to its bolt side and
  // its left, and muzzle up at the crown
  hunting: [Z(0), K(0.65, 0.14, -0.08, 0.05, 0, 0.06, -0.1, 0.36, -0.05, -0.02), K(1.4, 0.12, -0.05, 0.08, 0, 0.062, -0.102, 0.37, -0.04, -0.02),
    K(2.1, 0, 0.25, -1.0, -0.005, 0.05, -0.08, 0.26, 0.13, 0.05), K(2.8, -0.03, 0.3, -1.05, -0.01, 0.052, -0.082, 0.27, 0.15, 0.05),
    K(3.5, -0.05, -0.25, 0.8, 0.02, 0.05, -0.08, 0.27, -0.13, -0.05), K(4.2, -0.28, 0.4, -0.15, -0.03, 0.07, -0.06, 0.2, 0.24, 0.1), Z(5.1)],
  // the battle rifle: canted forty-five degrees one way and the other, lifted to look up at the mag well, and down
  // along its top
  scar: [Z(0), K(0.5, -0.06, -0.15, 0.75, 0.015, 0.05, -0.08, 0.27, -0.1, -0.04), K(1.1, -0.08, -0.18, 0.8, 0.017, 0.052, -0.082, 0.28, -0.12, -0.05),
    K(1.75, -0.02, 0.15, -0.75, -0.01, 0.05, -0.08, 0.27, 0.1, 0.04), K(2.35, -0.04, 0.18, -0.8, -0.012, 0.052, -0.082, 0.28, 0.12, 0.04),
    K(3.0, -0.35, 0.1, 0, 0, 0.09, -0.05, 0.1, 0.05, 0.02), K(3.65, 0.2, -0.12, 0.1, 0.01, 0.04, -0.07, 0.31, -0.03, -0.02), Z(4.55)],
  // the machine pistol: light, so it's flicked about quickly, side to side, up and down
  smg: [Z(0), K(0.35, -0.08, -0.25, 1.3, 0.03, 0.08, -0.1, 0.3, -0.14, -0.05), K(0.9, -0.1, -0.3, 1.38, 0.032, 0.082, -0.1, 0.31, -0.16, -0.05),
    K(1.3, -0.04, 0.28, -1.3, -0.01, 0.08, -0.1, 0.3, 0.14, 0.05), K(1.85, -0.06, 0.32, -1.36, -0.012, 0.082, -0.1, 0.31, 0.16, 0.05),
    K(2.3, -0.4, 0.5, -0.2, -0.03, 0.09, -0.07, 0.2, 0.26, 0.1), K(2.85, 0.3, -0.12, 0.1, 0.01, 0.06, -0.09, 0.33, -0.03, -0.02), Z(3.6)],
  // the SMG: its left side (the cocking tube), muzzle up into the front sight's hood, its right side, and down along
  // the drum sight
  sub: [Z(0), K(0.55, -0.06, -0.2, 0.9, 0.02, 0.055, -0.08, 0.27, -0.13, -0.05), K(1.25, -0.09, -0.25, 0.98, 0.022, 0.057, -0.082, 0.28, -0.15, -0.06),
    K(1.95, -0.32, 0.35, 0.1, -0.025, 0.075, -0.06, 0.18, 0.2, 0.08), K(2.6, 0, 0.22, -0.95, -0.005, 0.05, -0.08, 0.26, 0.13, 0.05),
    K(3.25, -0.02, 0.26, -1.0, -0.008, 0.052, -0.082, 0.27, 0.15, 0.05), K(3.9, 0.22, -0.1, 0.06, 0.01, 0.04, -0.07, 0.31, -0.03, -0.02), Z(4.75)],
  // the AR: its left side, rolled over to the port and the forward assist, then onto its side to look at the mag
  // well from below, and down along the rail
  ar: [Z(0), K(0.5, -0.05, -0.2, 0.9, 0.02, 0.05, -0.08, 0.27, -0.12, -0.05), K(1.2, -0.08, -0.25, 0.96, 0.022, 0.052, -0.082, 0.28, -0.14, -0.05),
    K(1.85, 0.02, 0.22, -1.15, -0.005, 0.05, -0.08, 0.26, 0.13, 0.05), K(2.5, 0, 0.26, -1.1, -0.008, 0.052, -0.082, 0.27, 0.15, 0.05),
    K(3.15, -0.2, 0.08, 1.6, 0.01, 0.08, -0.07, 0.24, 0.02, 0), K(3.8, 0.22, -0.1, 0.1, 0.01, 0.04, -0.07, 0.31, -0.03, -0.02), Z(4.7)],
  // the LMG: heavy, so it's only hefted and tipped a little each way, slowly, then down to look over the feed cover
  lmg: [Z(0), K(0.7, -0.04, -0.12, 0.55, 0.01, 0.03, -0.05, 0.26, -0.08, -0.03), K(1.6, -0.06, -0.15, 0.6, 0.012, 0.032, -0.052, 0.27, -0.1, -0.04),
    K(2.4, 0, 0.12, -0.55, -0.005, 0.03, -0.05, 0.26, 0.08, 0.03), K(3.2, -0.02, 0.15, -0.6, -0.007, 0.032, -0.052, 0.27, 0.1, 0.04),
    K(3.95, 0.18, -0.06, 0.05, 0, 0.025, -0.05, 0.33, -0.02, -0.01), K(4.75, -0.15, 0.2, 0, -0.01, 0.04, -0.04, 0.2, 0.1, 0.04), Z(5.6)]
});
// the same from your own eyes (a long gun's are its own: turned only a little side on, player/hold.js FP_INSPECT_TURN)
const INSPECT_FP = {
  // a handgun (any of them: the revolver twirled first), as you'd look one over: brought up in the middle of your
  // view, close, turned side on with its muzzle tipped up to the left and its top to the right (its left side to you,
  // your thumb along the frame), held there a moment as the wrist eases round, then rolled right over to its other
  // side, stood muzzle up, and tipped down to look along the slide. (The turns go on in the order roll, turn, then tip
  // about the shoulder's own across: player/hold.js posePivot. So pointing off to the side, the muzzle's put up by the
  // tip and the roll together, not the tip alone)
  hand: [Z(0), K(0.6, -1.45, -0.95, -1.45, 0.1, -0.01, 0, 0.24, -0.04, 0, 0), K(1.4, -1.38, -0.86, -1.33, 0.1, -0.006, -0.004, 0.26, -0.05, 0, 0),
    K(2.15, -1.45, -0.95, 1.5, 0.03, 0, 0, 0.3, 0.02, 0, 0), K(2.85, -1.4, -0.9, 1.62, 0.03, 0.004, -0.004, 0.31, 0.03, 0, 0),
    K(3.5, -0.9, -0.3, 0.2, 0, 0.012, -0.01, 0.22, 0.08, 0, 0), K(4.1, 0.42, -0.12, 0.05, 0, 0, 0, 0.36, 0, 0, 0), Z(4.85)]
};
INSPECT_FP.revolver = [Z(0), ...REV_SPIN, ...later(INSPECT_FP.hand, REV_LOOK)];
// a gun in each hand (the second pistol, the second machine pistol): each is turned on its own wrist rather than the
// pair swung about as one, the right gun's moves below and the left's the same mirrored, a beat behind (lag, seconds),
// so the two never move as one. Here x is in toward the middle (each gun's own way), h up and z forward (metres), the rest
// as above: both brought up and in, rolled onto their sides facing you (their outsides), rolled right over to show their
// insides, stood muzzles up and toed in to look at both muzzles side by side, then tipped down to look along the slides,
// and back onto the aim. From your own eyes they're brought further up into view (fp)
const KP = (t, p, y, r, x, h, z, hp, hy = 0) => K(t, p, y, r, x, h, z, hp, hy, 0, 0, 1);
const INSPECT_PAIR = {
  lag: 0.2,
  iso: [Z(0), KP(0.55, -0.15, 0.35, 1.2, 0.06, 0.08, -0.05, 0.3), KP(1.3, -0.2, 0.42, 1.32, 0.065, 0.085, -0.055, 0.32),
    KP(2.0, -0.05, 0.3, -1.25, 0.05, 0.08, -0.05, 0.3), KP(2.65, -0.08, 0.36, -1.32, 0.055, 0.085, -0.055, 0.31),
    KP(3.3, -1.05, 0.28, 0.15, 0.05, 0.11, -0.03, 0.18), KP(3.9, 0.4, 0.12, 0.05, 0.04, 0.06, -0.06, 0.36), Z(4.6)],
  fp: [Z(0), KP(0.55, -0.2, 0.3, 1.25, 0.05, 0.13, 0.08, 0.14), KP(1.3, -0.25, 0.36, 1.36, 0.055, 0.135, 0.075, 0.15),
    KP(2.0, -0.1, 0.26, -1.3, 0.045, 0.13, 0.08, 0.14), KP(2.65, -0.13, 0.32, -1.38, 0.05, 0.135, 0.075, 0.15),
    KP(3.3, -1.1, 0.25, 0.15, 0.045, 0.1, 0.1, 0.08), KP(3.9, 0.3, 0.12, 0.05, 0.045, 0.2, 0.04, 0.22), Z(4.6)]
};
const CH_HAND = ['p', 'y', 'r', 'x', 'h', 'z'];
// the revolver's spin round the trigger finger, as a real one goes: a little wind back the other way (wind, over
// windT seconds, easing to a stop), then flicked forward (at: seconds in) for turns full turns, picking up speed in
// a blink and slowing all the way into the palm (dur), never at a steady rate; caught with a little rock past the grip
// and back (rock: radians, f: how quickly, d: how soon it dies), held, then flicked back one turn the other way
// (back: when, how long; none when it's looked over after) into the hand. What's left of a turn when it's cut short is finished quickly (snap) rather
// than unwound
const INSPECT_SPIN = { revolver: { at: 0.6, windT: 0.24, wind: 0.42, dur: 1.15, turns: 3, rock: 0.16, f: 2.4, d: 7, back: null, snap: 18 } };
// the hands never quite still while it's held up (radians: muzzle, turn, roll; f: how quickly)
const INSP_SHAKE = { p: 0.012, y: 0.01, r: 0.018, f: [1.3, 1.7, 2.1] };
// how it's chased: a spring per channel, a touch under critical so it carries softly through each move (w: how
// quick, z: how damped); the blend in and out (wIn, wOut: how quickly it takes over, and lets go: slowly, so stopped
// part way it's the springs that carry it back onto the aim, unhurried, not the blend that snaps it there)
const INSP_SPRING = { w: 10, z: 0.72, wIn: 6, wOut: 2.5 };
const CH = ['p', 'y', 'r', 'x', 'h', 'z', 'hp', 'hy', 'tw', 'fs', 'up'];
// what's put on the gun this frame (o; spin: the revolver's twirl, radians), and the springs chasing the keyframes (s,
// and their speeds v)
const INSP = { t: -1, id: null, w: 0, o: { spin: 0 }, s: {}, v: {}, spin: 0, rate: 1, clk: 0, oL: {}, sL: {}, vL: {} };   // (oL, sL, vL: the left gun of a pair's own)
const INSP_MENU = { stop: 12, go: 6 };   // (how quickly it comes to a stop under a menu, and picks up again after)
CH.forEach(c => { INSP.o[c] = INSP.s[c] = INSP.v[c] = 0; });
CH_HAND.forEach(c => { INSP.oL[c] = INSP.sL[c] = INSP.vL[c] = 0; });
// whatever's stopping you: your hands are needed, or you're not in a state to stand and look
// (a menu coming up over it, the pause or the cards between waves (inMenu), isn't one: it slows to a stop where it is
// and carries on when the menu goes, INSP.rate)
const inMenu = () => state === 'paused' || state === 'upgrade';
const busy = () => (state !== 'play' && !inMenu()) || P.dead || !!openSt || !!W8.reloading || !!swapSt || P.vault || P.sprint || P.bandT > 0 || !!P.shove || aiming || (ANIM.ads || 0) > 0.15 ||
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
export function inspectCut() { const I = INSP; I.t = -1; I.w = 0; I.spin = I.o.spin = 0; for (const c of CH) I.o[c] = I.s[c] = I.v[c] = 0; for (const c of CH_HAND) I.oL[c] = I.sL[c] = I.vL[c] = 0; hudOff(false); }
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
// the revolver's spin at time t (radians round the trigger finger). Each flick runs on spinCurve: none to all of it,
// its speed rising from nothing to its peak a third of the way and dying away to nothing at the end (smooth at both
// ends, quick to start and long to slow); the catches rock on a damped wobble that starts from rest
const spinCurve = u => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u) * (1 + 3 * u); };
const rockAt = (S, dt) => dt <= 0 ? 0 : S.rock * Math.sin(2 * Math.PI * S.f * dt) * Math.exp(-S.d * dt) * smooth(Math.min(1, dt / 0.06));
function spinAt(S, t) {
  const w0 = S.at - S.windT, end = S.at + S.dur;
  if (t < w0) return 0;
  if (t < S.at) return -S.wind * smooth((t - w0) / S.windT);
  const fwd = -S.wind + (S.turns * 2 * Math.PI + S.wind) * spinCurve((t - S.at) / S.dur) + rockAt(S, t - end);
  if (!S.back) return fwd;
  const b0 = S.back[0], b1 = b0 + S.back[1];
  return fwd - 2 * Math.PI * spinCurve((t - b0) / S.back[1]) + rockAt(S, t - b1) * 0.6;
}
// each frame from player/hold.js: where it's got to (INSP.o, already weighted), the gun's kind deciding its moves
// (a melee weapon's moves are its own, melee/melee-anim.js: endT is how long they run, and this keeps their time)
export function inspectPose(rdt, D, id, hand, fp, endT) {
  const I = INSP;
  const pair = !!(D && D.akimbo);
  if (I.t >= 0 && (((mouseDown || (pair && mouseDownR)) && !inMenu()) || W8.reloading || id !== I.id)) inspectCut();   // (a click on a menu over it isn't a shot; with a pair, either button fires)   // (firing, reloading or another gun: back at once)
  if (I.t >= 0 && (!D || busy())) I.t = -1;   // (anything else: eased back onto the aim)
  const stk = !endT && !!INSPECT_SPIN[id] && stocked(id);   // (a revolver with a shoulder stock on it isn't twirled: REV_SPIN)
  const key = id === 'dbl' && hasMod('sawn') ? 'dblSawn' : id;   // (the sawn-off has its own: INSPECT.dblSawn)
  const SET = fp ? INSPECT_FP : INSPECT, L = endT ? meleeTimeline(endT) : pair ? INSPECT_PAIR[fp ? 'fp' : 'iso'] : stk ? SET.hand : SET[key] || INSPECT[key] || (hand ? SET.hand : INSPECT.long);
  const lag = pair ? INSPECT_PAIR.lag : 0, end = L[L.length - 1].t + lag, S = pair || stk ? null : INSPECT_SPIN[id];
  { const menu = inMenu(); I.rate += ((menu ? 0 : 1) - I.rate) * Math.min(1, rdt * (menu ? INSP_MENU.stop : INSP_MENU.go)); }
  if (I.t >= 0) { I.t += rdt * I.rate; if (I.t >= end) I.t = -1; }
  const on = I.t >= 0; hudOff(on);
  I.w += ((on ? 1 : 0) - I.w) * Math.min(1, rdt * (on ? INSP_SPRING.wIn : INSP_SPRING.wOut));
  if (!(rdt > 0)) return I.o;
  const w = INSP_SPRING.w, k = w * w, d = 2 * INSP_SPRING.z * w;
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), j = 0; j < n; j++)
    for (const c of CH) { const tg = on ? curve(L, I.t, c) : 0; I.v[c] += (k * (tg - I.s[c]) - d * I.v[c]) * h; I.s[c] += I.v[c] * h; }
  // (the left gun of a pair: the same moves a beat behind; let go of with the pair or anything else, it's eased back too)
  for (let n = Math.ceil(rdt / (1 / 240)), h = rdt / Math.max(1, n), j = 0; j < n; j++)
    for (const c of CH_HAND) { const tg = on && pair ? curve(L, Math.max(0, I.t - lag), c) : 0; I.vL[c] += (k * (tg - I.sL[c]) - d * I.vL[c]) * h; I.sL[c] += I.vL[c] * h; }
  // (paused, it's held just where it is, frozen mid-move, and carries on from there as you resume: I.rate)
  for (const c of CH) I.o[c] = I.s[c] * I.w;
  for (const c of CH_HAND) I.oL[c] = I.sL[c] * I.w;
  // the hands never quite still while it's held up (on its own clock, which stops with it under a menu: dead still there)
  I.clk += rdt * I.rate;
  { const q = INSP_SHAKE, f = q.f, ts = I.clk, k = I.w;
    I.o.p += q.p * k * Math.sin(ts * f[0] * 6.28); I.o.y += q.y * k * Math.sin(ts * f[1] * 6.28 + 1.1); I.o.r += q.r * k * Math.sin(ts * f[2] * 6.28 + 2.3);
    I.oL.p += q.p * k * Math.sin(ts * f[1] * 6.28 + 0.6); I.oL.y += q.y * k * Math.sin(ts * f[2] * 6.28 + 2.0); I.oL.r += q.r * k * Math.sin(ts * f[0] * 6.28 + 0.4); }
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
// with a gun in each hand, what's on each (o's p y r x h z for the right, oL for the left, each its own way: player/hold.js
// mirrors the left's): the pair's not turned as one
export const inspectHand = side => side === 'L' ? INSP.oL : INSP.o;
