// Deaths: a light ragdoll, taken over from the pose the zombie died in.

import { V3 } from '../core/renderer.js';
import { clamp, HALF, rand, rr, smooth } from '../core/math.js';
import { cell, ci, EMPTY, FENCE, idx, inb, OBST, OPEN, openAt, WALL } from '../world/grid.js';
import { THIN, thinPush } from '../world/thin-walls.js';
import { surfaceY } from '../world/house.js';
import { lowObst, obstTop } from '../world/props.js';
import { cellBox } from '../world/collision.js';
import { P } from '../player/player.js';
import { EFF, W } from '../game/run-state.js';
import { burst } from '../effects/particles.js';
import { burnFx } from '../effects/puffs.js';
import { Z_ELBOW, Z_KNEE, ZHIP } from './zombie-anim.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';

// The body the moment it dies is taken as thirteen points (hips, shoulders, head, elbows, hands, knees, feet), held
// together by sticks the rig's own lengths, and let go under its own weight: the killing hit throws the points it
// landed on (a head shot snaps the head back, a shot to the legs sweeps them out from under it), a limb taken off in
// the same blow jerks its stump and leaves that side with nothing to hold it up, and what it was doing carries on into
// the fall (a runner tumbles on forward, a climber goes on over the sill). For a moment it's still stiff, pulled toward
// the pose it died in, the legs giving first so the knees buckle under it; then it's dead weight, folding over and
// bouncing a little as it lands. The knees only bend one way, the head can't loll right round, and it comes up against
// the world as it really stands: walls, the house's inside walls, a prop where it stands in its cell and as tall as it
// is, a tree's trunk, the fence's posts and rails (it can fold over a rail), a sill, the porch and the floor, each part
// of it as thick as it is, and what it lands on holds it (it slides only as far as it's thrown). The rig is then posed
// off the points every frame (ragPose), smoothed between steps and eased in from exactly how it stood (no jump the
// moment it dies); a body that's lain still for a moment, or a couple of seconds after it's down, is left as it is and
// costs nothing
export const ragdolls = [];
// 0 1 the hips, 2 3 the shoulders, 4 the head, 5 6 the left elbow and hand, 7 8 the right's, 9 10 the left knee and
// foot, 11 12 the right's: where each is on the rig stood straight with its arms out in front (metres, before the
// zombie's own size: RAG_AT), how heavy (RAG_MASS) and how far off the ground it rests (RAG_R, half that part's
// thickness: the trunk's half the depth of the chest, a foot's with its shoe)
const RAG_AT = [[-0.13, 0.55, 0], [0.13, 0.55, 0], [-0.33, 1.08, 0], [0.33, 1.08, 0], [0, 1.33, 0], [-0.33, 1.08, 0.26], [-0.33, 1.08, 0.53], [0.33, 1.08, 0.26], [0.33, 1.08, 0.53], [-0.13, 0.28, 0], [-0.13, 0, 0], [0.13, 0.28, 0], [0.13, 0, 0]];
const RAG_MASS = [3, 3, 2.4, 2.4, 1.5, 0.9, 0.6, 0.9, 0.6, 1.5, 1, 1.5, 1];
const RAG_R = [0.14, 0.14, 0.13, 0.13, 0.15, 0.07, 0.06, 0.07, 0.06, 0.1, 0.1, 0.1, 0.1];
// the sticks: two points, held at their standing distance, or (with lo and hi, as parts of it) kept within that: the
// head off the hips (how far it can nod), a hand off its shoulder and a foot off its hip (how far an elbow or a knee
// folds), and the knees and feet off each other
const RAG_STICKS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2], [4, 2], [4, 3], [4, 0, 0.86, 1.03], [4, 1, 0.86, 1.03],
  [2, 5], [5, 6], [3, 7], [7, 8], [2, 6, 0.4, 9], [3, 8, 0.4, 9],
  [0, 9], [9, 10], [1, 11], [11, 12], [0, 10, 0.45, 9], [1, 12, 0.45, 9], [9, 11, 0.5, 9], [10, 12, 0.35, 9]];
const RAG_LIMB = { armL: [5, 6, 2], armR: [7, 8, 3], legL: [9, 10, 0], legR: [11, 12, 1] };
// where the killing hit lands: the points it throws hardest, then the ones next to them
const RAG_HIT = { head: [[4], [2, 3]], torso: [[2, 3], [0, 1, 4]], armL: [[5, 6], [2]], armR: [[7, 8], [3]], legL: [[9, 10], [0]], legR: [[11, 12], [1]], crush: [[4, 2, 3], [0, 1]] };
// RAG: gravity (a little over the real thing, so a body comes down with some weight from this high up), the fixed step
// and the most steps in a frame (past that the body runs slow rather than leaping), solver passes a step; how stiff a
// body still is as it goes (tone: how hard it's pulled toward the pose it died in; how much each part holds, and for how
// long, is down to how it falls: FALLS); how long the pose it died in takes to hand over to the body's own (blend, s:
// the rig eased from exactly how it stood, so there's no jump the moment it dies), and the bones' own lengths (relax,
// s: a waist bent or twisted as it died straightens out over that, rather than snapping); how hard the world holds what
// touches it (fs: what's sliding slower than that much of how hard it's pressed in stops dead; fk: what's sliding faster
// is slowed by that much of it; stick m/s: anything slower than this on the ground stops), how much a fall bounces back
// (bounce, under bounceV m/s nothing does); air drag (air), and once its trunk's down (land, then still after stillT s,
// then calm from settle s, then slowed to a stop from tire s over tireT s), so it slumps where it falls rather than
// flopping about, and how much of its turn round the upright it loses each step once it's down (yawDown); the fastest a
// part of it ever goes (vmax m/s: what the hit starts it with too, so nothing's flung through a wall); when it counts as
// still (under sleepV m/s for sleepT s; from settle s after it's down, under sleepV2; or down and nothing on it more
// than sleepD from where it was sleepT s ago), or maxT s after it died whatever it's doing, and is left as it lies; the
// most bodies worked out at once (live: past that the oldest is left as it is); and how hard a hit throws what it lands
// on (hit), what's next to it (near), and the whole body (all), times the weapon's force; a body that's died running
// carries only some of its pace into the fall (carry); one that's come to rest on a hip or a shoulder without its trunk
// flat counts as down after lieT s
const RAG = { grav: 17, h: 1 / 60, maxSteps: 4, iters: 8, tone: 0.4, toneT: 0.5, blend: 0.3, relax: 0.35, fs: 1.1, fk: 1, stick: 0.4, bounce: 0.12, bounceV: 1.6, air: 0.995, land: 0.95, still: 0.9, stillT: 0.15, calm: 0.82, tire: 1.6, tireT: 0.8, yawDown: 0.8, vmax: 7, sleepV: 0.12, sleepT: 0.3, sleepD: 0.025, settle: 1, sleepV2: 0.35, maxT: 6, live: 16, hit: 0.62, near: 0.28, all: 0.16, carry: 0.6, lieT: 1.1 };
// what a body comes up against (ragShapes): how tall a wall is, a tall prop and a low one where nothing says (RAG_TOP),
// a tree's trunk (its radius), a window's sill and a boarded opening; the fence as it stands, a post at each cell's
// middle (post: half its width; postTop) and two rails out to the next post (rail: half their thickness; top: the top
// rail's top), not its whole cell
const RAG_TOP = { wall: 2.6, prop: 2, low: 0.75, trunk: 0.2, sill: 0.95, boards: 2.2 };
const RAG_FENCE = { post: 0.07, postTop: 1, rail: 0.04, top: 0.79 };
// how much a round throws a body, by what it is: a 9mm hardly moves it (it drops more or less where it was hit), a
// magnum or a rifle round some, buckshot and a slug the most (a blast, a swing, a sledgehammer go by their own force)
const RAG_CAL = { p9: 0.18, p10: 0.32, magnum: 0.6, rifle: 0.7, shells: 1 };
// a skull crushed from overhead (the sledgehammer): how much of the blow's push along goes into the head and shoulders
// (along), and how hard they're driven down (down, m/s)
const RAG_CRUSH = { along: 0.35, down: -4 };
// shot through the head (not by buckshot or a blast) it's out at once: it goes limp where it stands (HEAD_DROP: what's
// left of its stiffness and how soon that's gone, and how much of the way it was going it keeps) and folds down
const HEAD_DROP = { tone: 0.16, toneT: 0.22, keep: 0.25 };
// how it goes down: never the same way twice. Each style: how likely (more of some when it's hit from in front or
// behind: front, back), how much each leg holds (legs: the fold-side leg, the other) and the upper body (up) of the
// stiffness it has, how long that lasts (toneT), and how the fall's started (m/s): the shoulders and head thrown along
// its facing (fwd: back is less than nothing) and across it (side), the hips the other way (hip), the shoulders turned
// against each other (twist: it spins as it drops). A crumple: the knees go and it drops where it stands, slumping one
// way; toppling back stiff; pitching forward onto its face; going over sideways as the leg that side gives; twisting
// round as it falls
const FALLS = [
  { k: 0.3, legs: [0.1, 0.15], up: 1, toneT: 0.7, fwd: [-0.3, 0.3], side: [0.3, 0.8], hip: 0.1 },
  { k: 0.2, back: 0.35, legs: [0.7, 0.8], up: 1, toneT: 0.65, fwd: [-2.1, -1.3], side: [0, 0.3], hip: 0.45 },
  { k: 0.15, front: 0.3, legs: [0.5, 0.6], up: 0.8, toneT: 0.55, fwd: [1.2, 1.9], side: [0, 0.3], hip: 0.35 },
  { k: 0.2, legs: [0.05, 0.6], up: 0.9, toneT: 0.6, fwd: [-0.3, 0.3], side: [1, 1.7], hip: 0.4 },
  { k: 0.15, legs: [0.2, 0.35], up: 0.9, toneT: 0.55, fwd: [-0.4, 0.4], side: [0.2, 0.6], hip: 0.2, twist: [1.1, 1.9] }
];
const _rgV = new V3(), _rgM = new THREE.Matrix4(), _rgQ = new THREE.Quaternion(), _rgQi = new THREE.Quaternion(), _rgQ2 = new THREE.Quaternion();
export const _rgX = new V3(), _rgY = new V3(), _rgZ = new V3(), _rgH = new V3(), _rgD = new V3(), _rgP = new V3();
const _rgS = new V3(), _rgT = new V3(), _rgU = new V3(), _rgN = new V3();
const _rgUp = new V3(0, 1, 0), _rgDn = new V3(0, -1, 0), _rgFw = new V3(0, 0, 1);

// the trunk's frame off the hips and shoulders in p: _rgH between the hips, _rgY up the spine, _rgX across it to the
// right, _rgZ out of its front
export function ragFrame(p) {
  _rgH.set((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2);
  _rgY.set((p[6] + p[9]) / 2 - _rgH.x, (p[7] + p[10]) / 2 - _rgH.y, (p[8] + p[11]) / 2 - _rgH.z).normalize();
  _rgX.set(p[3] - p[0] + p[9] - p[6], p[4] - p[1] + p[10] - p[7], p[5] - p[2] + p[11] - p[8]);
  _rgX.addScaledVector(_rgY, -_rgX.dot(_rgY)).normalize(); _rgZ.crossVectors(_rgX, _rgY);
}

// rig: a survivor's (player/player-ragdoll.js), not a zombie's: its upper body isn't raised to the hips (upY), its arms are
// one piece each (no forearms: noFore), it's kept in its own list (list), lying where it fell (keep), and how it stood
// as it went down (pre: ragGrab's, taken before its rig was set back as it's built)
export function makeRagdoll(z, dx, dz, part, force, wId, rig) {
  const m = z.m, s = z.T.scale, upY = rig ? rig.upY : ZHIP, D = (wId && (W(wId) || EFF[wId])) || {}, n = RAG_AT.length, cut = z.cut || {};
  const p = new Float32Array(n * 3), on = new Uint8Array(n).fill(1), pre = (rig && rig.pre) || ragGrab(m);
  if (!z.limbs.head) on[4] = 0;
  for (const L in RAG_LIMB) { const [a, b] = RAG_LIMB[L]; if (!z.limbs[L]) on[a] = on[b] = 0; else if (cut[L]) on[b] = 0; }
  // where each point is now, off the rig as it stands (or crawls, or climbs)
  m.g.updateMatrixWorld(true);
  const put = (k, o, x, y, zz) => { _rgV.set(x, y, zz); o.localToWorld(_rgV); p[k * 3] = _rgV.x; p[k * 3 + 1] = _rgV.y; p[k * 3 + 2] = _rgV.z; };
  put(0, m.lower, -0.13, 0.55, 0); put(1, m.lower, 0.13, 0.55, 0); put(2, m.upper, -0.33, 1.08 - upY, 0); put(3, m.upper, 0.33, 1.08 - upY, 0);
  if (on[4]) put(4, m.head, 0, 0, 0);
  for (const sd of ['L', 'R']) {
    const [e, hd] = RAG_LIMB['arm' + sd], [kn, ft] = RAG_LIMB['leg' + sd];
    if (on[e]) put(e, m['arm' + sd], 0, 0, Z_ELBOW); if (on[hd]) put(hd, rig && rig.noFore ? m['arm' + sd] : m['fore' + sd], 0, 0, rig && rig.noFore ? 0.53 : 0.27);
    if (on[kn]) put(kn, m['leg' + sd], 0, Z_KNEE, 0); if (on[ft]) put(ft, m['shin' + sd], 0, -0.28, 0);
  }
  // (a foot flat on the floor is its sole's thickness up off it, as the floor will have it)
  for (let k = 0; k < n; k++) if (on[k]) { const f = surfaceY(p[k * 3], p[k * 3 + 2]) + RAG_R[k] * s; if (p[k * 3 + 1] < f) p[k * 3 + 1] = f; }
  // the sticks, at this body's size, between the points it still has
  // (and each as long as it is in the pose it died in, which it eases to its own length from: RAG.relax)
  const at = k => _rgV.fromArray(RAG_AT[k]).multiplyScalar(s), sticks = [];
  for (const [a, b, lo, hi] of RAG_STICKS) {
    if (!on[a] || !on[b]) continue;
    const L = at(a).distanceTo(_rgD.fromArray(RAG_AT[b]).multiplyScalar(s)), d = Math.hypot(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    const l0 = lo === undefined ? L : L * lo, h0 = lo === undefined ? L : L * hi;
    sticks.push([a, b, l0, h0, Math.min(l0, d), Math.max(h0, d)]);
  }
  // the pose it died in, in the trunk's own frame, for the stiffness it keeps a moment (RAG.tone)
  ragFrame(p); const loc = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { _rgD.set(p[k * 3] - _rgH.x, p[k * 3 + 1] - _rgH.y, p[k * 3 + 2] - _rgH.z); loc[k * 3] = _rgD.dot(_rgX); loc[k * 3 + 1] = _rgD.dot(_rgY); loc[k * 3 + 2] = _rgD.dot(_rgZ); }
  // and how it's moving: a velocity is where each point was a step ago (q). It carries on the way it was going, the
  // hit throws the points it landed on and those next to them and the whole body a little; a blast lifts it off its
  // feet, a sledgehammer drives the head and shoulders down, a swing turns the shoulders round
  const q = new Float32Array(p), h = RAG.h, im = new Float32Array(n);
  for (let k = 0; k < n; k++) im[k] = 1 / RAG_MASS[k];
  const push = (k, vx, vy, vz) => { q[k * 3] -= vx * h; q[k * 3 + 1] -= vy * h; q[k * 3 + 2] -= vz * h; };
  const boom = wId === 'boom', cal = D.melee || boom || part === 'crush' ? 1 : RAG_CAL[D.ammo] ?? 0.5, drop = part === 'head' && !boom && !D.melee && D.ammo !== 'shells';
  const keep = drop ? HEAD_DROP.keep : 1, cx = clamp(z.vx || 0, -4, 4) * keep * RAG.carry, cz = clamp(z.vz || 0, -4, 4) * keep * RAG.carry;
  force *= cal;
  for (let k = 0; k < n; k++) push(k, cx + dx * force * RAG.all + rr(-0.15, 0.15), boom ? rr(2, 3) : rr(0, 0.1), cz + dz * force * RAG.all + rr(-0.15, 0.15));
  const [hit, near] = RAG_HIT[part] || RAG_HIT.torso;
  // (a blow from overhead, the sledgehammer's, drives it down more than along, and both shoulders alike: pushed apart by
  // different amounts they'd turn the body round as it went down)
  const crush = part === 'crush', ck = crush ? RAG_CRUSH.along * rr(0.9, 1.1) : 0;
  for (const k of hit) push(k, dx * force * RAG.hit * (crush ? ck : rr(0.85, 1.15)), crush ? RAG_CRUSH.down : force * 0.06, dz * force * RAG.hit * (crush ? ck : rr(0.85, 1.15)));
  for (const k of near) push(k, dx * force * RAG.near, 0, dz * force * RAG.near);
  if (D.melee && part !== 'crush') { const sg = rand() < 0.5 ? -1 : 1, t = force * 0.25 * sg; push(2, -dz * t, 0, dx * t); push(3, dz * t, 0, -dx * t); }
  // a limb taken off by this blow: its stump jerks with it
  for (const sp of z.spurts) if (sp.t > 1.1) { const L = RAG_LIMB[sp.part], k = L ? L[2] : sp.part === 'head' ? 2 + (rand() < 0.5 ? 1 : 0) : -1; if (k >= 0) push(k, dx * force * 0.3, 0.6, dz * force * 0.3); }
  // how it goes down (FALLS): picked at random, with more toppling back from a hit in front and pitching forward from
  // one behind
  const fF = [Math.sin(z.face), Math.cos(z.face)], fR = [fF[1], -fF[0]], from = -(dx * fF[0] + dz * fF[1]);   // (from: 1 hit square in the front)
  const wts = FALLS.map(f => f.k + (f.back || 0) * Math.max(0, from) + (f.front || 0) * Math.max(0, -from)), tot = wts.reduce((a, b) => a + b, 0);
  let pick = rand() * tot, fall = FALLS[0]; for (let k = 0; k < FALLS.length; k++) { pick -= wts[k]; if (pick <= 0) { fall = FALLS[k]; break; } }
  const sd = rand() < 0.5 ? -1 : 1, fw = rr(...fall.fwd) * (drop ? 0.5 : 1), sw = rr(...fall.side) * sd, tw = fall.twist && !crush ? rr(...fall.twist) * (rand() < 0.5 ? -1 : 1) : 0;   // (no twist under a sledgehammer)
  for (const k of [2, 3, 4]) push(k, fF[0] * fw + fR[0] * sw, 0, fF[1] * fw + fR[1] * sw);
  for (const k of [0, 1]) push(k, -(fF[0] * fw + fR[0] * sw) * fall.hip, 0, -(fF[1] * fw + fR[1] * sw) * fall.hip);
  if (tw) { push(2, fF[0] * tw, 0, fF[1] * tw); push(3, -fF[0] * tw, 0, -fF[1] * tw); }
  // (the leg that folds is the one on the side it goes over to: left points 9, 10, right 11, 12)
  const legK = sd < 0 ? [fall.legs[0], fall.legs[1]] : [fall.legs[1], fall.legs[0]];
  // a climber goes on over the sill the way it was going
  if (z.vault) { const v = z.vault, L = Math.hypot(v.x1 - v.x0, v.z1 - v.z0) || 1; for (let k = 0; k < n; k++) push(k, (v.x1 - v.x0) / L * 1.6, 0.3, (v.z1 - v.z0) / L * 1.6); }
  // (however hard it's hit, nothing on it starts off faster than RAG.vmax: a blast up close throws it, it doesn't
  // fire it through the wall behind it)
  for (let k = 0; k < n * 3; k += 3) { const vx = p[k] - q[k], vy = p[k + 1] - q[k + 1], vz = p[k + 2] - q[k + 2], v = Math.hypot(vx, vy, vz) / h; if (v > RAG.vmax) { const f = RAG.vmax / v; q[k] = p[k] - vx * f; q[k + 1] = p[k + 1] - vy * f; q[k + 2] = p[k + 2] - vz * f; } }
  // a point that starts inside something (a climber's legs in the wall under the sill) is let through it till it's out
  const ghost = new Uint8Array(n), shN = new Uint8Array(n), sh = new Float32Array(n * RAG_SHN * 6);
  for (let k = 0; k < n; k++) if (on[k] && ragInside(p[k * 3], p[k * 3 + 1] - RAG_R[k] * s, p[k * 3 + 2])) ghost[k] = 1;
  // only so many bodies are worked out at once: past that the oldest still moving is left as it lies
  if (!rig) { const live = ragdolls.filter(o => !o.sleep); if (live.length >= RAG.live) live[0].sleep = true; }
  const r = { g: m.g, mats: z.fade || m.mats, dm: z.dm, blob: z.blob, m, limbs: z.limbs, s, p, q, tone: drop ? HEAD_DROP.tone : RAG.tone, toneT: drop ? HEAD_DROP.toneT : fall.toneT, legK, upK: fall.up, o: new Float32Array(p), v: new Float32Array(p), on, im, loc, sticks, ghost, sh, shN, cn: new Float32Array(n * 3), fl: new Float32Array(n), acc: 0, st: 0, still: 0, sleep: false, gy: 0, pre, bl: null, down: false, touch: 0,
    x: z.x, z: z.z, t: 0, pooled: false, stain: z.stain, vis: z.vis, burn: z.burn > 0 ? Math.max(z.burn, 4) : 0, flash: z.flash || 0, eyes: z.limbs.head ? m.eyes : null, eyeH: z.eyeH, eyeGlow: z.limbs.head ? 1 : 0, eyeTint: m.eyeGlow || null, eyeLive: m.eyeCol ? new THREE.Color(m.eyeCol) : null, eyeT: 0, upY, noFore: !!(rig && rig.noFore), keep: !!rig };
  m.g.scale.setScalar(s);
  ragPose(r, p); ragBlendFrom(r); ragBlend(r);
  (rig ? rig.list : ragdolls).push(r);
  return r;
}

// one step of the body: the stiffness it has left pulls it toward the pose it died in, everything moves on and falls,
// then the sticks, the knees and elbows and the world are put right pass after pass; last, what's touching something is
// held by it (ragGrip), and it's checked for coming to rest
function ragStep(r, h) {
  const p = r.p, q = r.q, on = r.on, n = on.length, g = RAG.grav * h * h, cn = r.cn;
  r.st += h;
  // (the stiffness it has left goes the moment the trunk's down: holding the pose any longer flings the limbs as the
  // body turns over on the ground)
  if ((r.down || (r.touch >= 3 && r.st > RAG.lieT)) && !r.landT) r.landT = r.st;
  const tn = r.landT ? 0 : r.tone * Math.pow(Math.max(0, 1 - r.st / r.toneT), 2);
  // the pose it died in: each part pulled part of the way back to where it was on the trunk, and the whole body moved
  // back against that by as much, so holding itself stiff never shoves it anywhere (it used to push itself along the
  // ground on its own stiffness)
  if (tn > 0) {
    ragFrame(p);
    let M = 0, sx = 0, sy = 0, sz = 0; const l = r.loc, c = r.cn;
    for (let k = 0; k < n; k++) {
      if (!on[k]) continue;
      const i = k * 3, wm = RAG_MASS[k]; M += wm; c[i] = c[i + 1] = c[i + 2] = 0;
      if (k < 4) continue;
      const w = tn * (k >= 11 ? r.legK[1] : k >= 9 ? r.legK[0] : r.upK);
      c[i] = (_rgH.x + _rgX.x * l[i] + _rgY.x * l[i + 1] + _rgZ.x * l[i + 2] - p[i]) * w;
      c[i + 1] = (_rgH.y + _rgX.y * l[i] + _rgY.y * l[i + 1] + _rgZ.y * l[i + 2] - p[i + 1]) * w;
      c[i + 2] = (_rgH.z + _rgX.z * l[i] + _rgY.z * l[i + 1] + _rgZ.z * l[i + 2] - p[i + 2]) * w;
      sx += c[i] * wm; sy += c[i + 1] * wm; sz += c[i + 2] * wm;
    }
    sx /= M; sy /= M; sz /= M;
    for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3; p[i] += c[i] - sx; p[i + 1] += c[i + 1] - sy; p[i + 2] += c[i + 2] - sz; }
  }
  // on it goes: a little drag in the air, and once its trunk's down a slump, then still, and a while after that it
  // settles (calm), and from tire s after it's down it's slowed to a stop over tireT s, whatever it's lying across (a
  // body hung over a sill or a rail could slide on it for seconds); nothing faster than RAG.vmax. And once it's down,
  // most of its spin round the upright through its middle is taken off it (yawDown, each step), so it never turns round
  // on the spot lying on the floor or across a rail
  const dn = r.landT ? r.st - r.landT : 0, air = (!r.landT ? RAG.air : dn > RAG.settle ? RAG.calm : dn > RAG.stillT ? RAG.still : RAG.land) * clamp(1 - (dn - RAG.tire) / RAG.tireT, 0, 1), vcap = RAG.vmax * h;
  let wy = 0, mx = 0, mz = 0;
  if (r.landT) {
    let M = 0, Ly = 0, Iy = 0;
    for (let k = 0; k < n; k++) if (on[k]) { const w = RAG_MASS[k]; M += w; mx += p[k * 3] * w; mz += p[k * 3 + 2] * w; }
    mx /= M; mz /= M;
    for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3, w = RAG_MASS[k], rx = p[i] - mx, rz = p[i + 2] - mz; Ly += w * (rz * (p[i] - q[i]) - rx * (p[i + 2] - q[i + 2])); Iy += w * (rx * rx + rz * rz); }
    wy = Iy > 1e-6 ? Ly / Iy * RAG.yawDown : 0;
  }
  for (let k = 0; k < n; k++) {
    if (!on[k]) continue;
    const i = k * 3;
    if (wy) { q[i] += wy * (p[i + 2] - mz); q[i + 2] -= wy * (p[i] - mx); }
    let vx = (p[i] - q[i]) * air, vy = (p[i + 1] - q[i + 1]) * air, vz = (p[i + 2] - q[i + 2]) * air;
    const v = Math.hypot(vx, vy, vz); if (v > vcap) { vx *= vcap / v; vy *= vcap / v; vz *= vcap / v; }
    q[i] = p[i]; q[i + 1] = p[i + 1]; q[i + 2] = p[i + 2];
    p[i] += vx; p[i + 1] += vy - g; p[i + 2] += vz;
  }
  // what's round each point it could come up against this step (it can't go far in one)
  for (let k = 0; k < n; k++) if (on[k]) ragShapes(r, k);
  cn.fill(0);
  // the sticks a little stiffer each pass than the last, then the joints, then the world: the world last, so nothing's
  // ever left in a wall or the floor, and the sticks first so the world has the last word over them
  const rx = Math.min(1, r.st / RAG.relax);
  for (let it = 0; it < RAG.iters; it++) {
    for (const c of r.sticks) {
      const a = c[0] * 3, b = c[1] * 3, ex = p[b] - p[a], ey = p[b + 1] - p[a + 1], ez = p[b + 2] - p[a + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d < 1e-6) continue;
      const lo = c[4] + (c[2] - c[4]) * rx, hi = c[5] + (c[3] - c[5]) * rx, t = d < lo ? lo : d > hi ? hi : d; if (t === d) continue;
      const wa = r.im[c[0]], wb = r.im[c[1]], f = (d - t) / d / (wa + wb);
      p[a] += ex * f * wa; p[a + 1] += ey * f * wa; p[a + 2] += ez * f * wa;
      p[b] -= ex * f * wb; p[b + 1] -= ey * f * wb; p[b + 2] -= ez * f * wb;
    }
    if (it % 2 === 0 || it === RAG.iters - 1) ragLimits(r);
    ragWorld(r);
  }
  ragGrip(r, h);
  // still? then it's left as it lies: nothing on it moving more than sleepV m/s for sleepT s (a little more, sleepV2,
  // once it's been down a while: no creeping about), or maxT s after it died whatever it's lying on
  let vmax = 0; const o = r.o; for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3; vmax = Math.max(vmax, Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2])); }
  const lim = r.landT && r.st - r.landT > RAG.settle ? RAG.sleepV2 : RAG.sleepV;
  r.still = vmax / h < lim && r.st > 0.5 && r.touch ? r.still + h : 0;
  if (r.still > RAG.sleepT || r.st > RAG.maxT || (r.landT && r.st - r.landT > RAG.tire + RAG.tireT)) r.sleep = true;   // (slowed to a stop: done)
  // (and every sleepT s, once it's down: nothing on it more than sleepD from where it was the last time it's looked at,
  // however it's been trembling in between, and it's done)
  if (r.landT && (r.ref || (r.ref = new Float32Array(p))) && r.st - (r.refT || 0) >= RAG.sleepT) {
    let d = 0; for (let k = 0; k < n; k++) if (on[k]) { const i = k * 3; d = Math.max(d, Math.hypot(p[i] - r.ref[i], p[i + 1] - r.ref[i + 1], p[i + 2] - r.ref[i + 2])); }
    if (d < RAG.sleepD * r.s && r.touch && r.refT) r.sleep = true;
    r.ref.set(p); r.refT = r.st;
  }
}
// how far each joint goes: a knee and an elbow fold only one way, and only straight that way. A knee folds round the
// line of the hips, the heel going back, with some give round the thigh for the turn a hip has in it: a good way with
// the knee out (kneeOut, radians), less with it in (kneeIn). An elbow brings the hand in front and up (back behind the
// head with the arm raised over it), and swings round the upper arm a long way as a shoulder turns (elbowTurn either
// side), but never on round behind. Once a body's been down a moment (restT, s) a knee or an elbow may lie out to
// either side, as far as restTurn, but still never folds back: a limb lying on the floor goes where the floor lets it.
// A thigh goes only a little back behind the hip or out to the side, an upper arm only a little behind the back, and a
// knee comes up only so far toward the chest (thighUp: how far above the hip). Every fix keeps the bones their length
// (a joint folded the wrong way is swung round onto its own side, a limb held in is swung round its socket with what
// hangs off it carried along), so the sticks never fight the limits, which pumped the body round and round on the
// floor; a joint only a hair off straight (dead: of the zombie's size) is let be, so a straight leg doesn't flick
// from side to side; a point lying on something (within rest m of it) counts held times its weight (below), and a knee
// or an elbow lying on the floor gets slack radians more; and no fix moves a point more than most (of the zombie's
// size) in a pass
const RAG_LIM = { held: 12, rest: 0.01, most: 0.04, slack: 0.3, thighBack: 0.2, thighOut: 0.3, thighUp: 0.1, armBack: 0.2, give: 0.6, dead: 0.015, kneeOut: 1.6, kneeIn: 0.6, elbowTurn: 1.65, pole: 0.4, restTurn: 1.6, restT: 0.25 };
const _rgF = [0, 0, 0], _rgMv = [0, 0, 0];
function ragLimits(r) {
  ragFrame(r.p);
  const p = r.p, on = r.on, s = r.s, X = _rgX, Y = _rgY, Z = _rgZ, p0 = r.lp || (r.lp = new Float32Array(p.length));
  p0.set(p);
  // point k (with what hangs off it, c) moved by (x, y, z), part of the way, then put back its length from a
  const swing = (k, a, c, x, y, z) => {
    const i = k * 3, A = a * 3, L = Math.hypot(p[i] - p[A], p[i + 1] - p[A + 1], p[i + 2] - p[A + 2]), g = RAG_LIM.give;
    let nx = p[i] + x * g - p[A], ny = p[i + 1] + y * g - p[A + 1], nz = p[i + 2] + z * g - p[A + 2]; const d = Math.hypot(nx, ny, nz) || 1;
    nx = p[A] + nx * L / d - p[i]; ny = p[A + 1] + ny * L / d - p[i + 1]; nz = p[A + 2] + nz * L / d - p[i + 2];
    for (const j of c >= 0 && on[c] ? [i, c * 3] : [i]) { p[j] += nx; p[j + 1] += ny; p[j + 2] += nz; }
  };
  // a joint held to its limits: round a bone from a (along t) to point k, the turn of k off it from the way
  // f points (square to the bone: 0 toward f, positive round toward t x f). Past tp (that way round) or tn (the other),
  // k is swung round the bone onto the limit, the same distance off it and the same way along it (folded right round
  // the wrong way, it goes over to the right side); by how much of the way there (w), into _rgMv. False if it's fine
  const least = r.landT && r.st - r.landT > RAG_LIM.restT ? RAG_LIM.restTurn : 0;
  const turnBack = (a, k, tx, ty, tz, f, tp, tn, w) => {
    const A = a * 3, K = k * 3, tl = Math.hypot(tx, ty, tz); if (tl < 1e-6) return false;
    tx /= tl; ty /= tl; tz /= tl;
    const wx = p[K] - p[A], wy = p[K + 1] - p[A + 1], wz = p[K + 2] - p[A + 2], wt = wx * tx + wy * ty + wz * tz;
    const ox = wx - wt * tx, oy = wy - wt * ty, oz = wz - wt * tz, ol = Math.hypot(ox, oy, oz); if (ol < RAG_LIM.dead * s) return false;
    const ft = f[0] * tx + f[1] * ty + f[2] * tz; let rx = f[0] - ft * tx, ry = f[1] - ft * ty, rz = f[2] - ft * tz; const rl = Math.hypot(rx, ry, rz); if (rl < 1e-3) return false;
    rx /= rl; ry /= rl; rz /= rl;
    const sx = ty * rz - tz * ry, sy = tz * rx - tx * rz, sz = tx * ry - ty * rx;
    const ang = Math.atan2(ox * sx + oy * sy + oz * sz, ox * rx + oy * ry + oz * rz), aa = Math.abs(ang), lim = Math.max(least, ang > 0 ? tp : tn);
    if (aa <= lim) return false;
    const to = ang + (Math.sign(ang) * (aa > Math.PI / 2 ? Math.min(lim, Math.PI - aa) : lim) - ang) * w, cs = Math.cos(to) * ol, sn = Math.sin(to) * ol;
    _rgMv[0] = p[A] + wt * tx + rx * cs + sx * sn - p[K]; _rgMv[1] = p[A + 1] + wt * ty + ry * cs + sy * sn - p[K + 1]; _rgMv[2] = p[A + 2] + wt * tz + rz * cs + sz * sn - p[K + 2];
    return true;
  };
  // point k moved by _rgMv, and the points o1 and o2 moved back against it by their share (by weight), so a fix turns
  // the limb without shoving the whole body anywhere. Only where it is, as the sticks are put right: where it was a step
  // ago moved with it (as it once was) let a knee or an elbow held off the floor by its limit and pushed back by the
  // floor gain speed every pass, and a hand lying on the ground flailed about for a second after the body was down
  const shift = (j, w) => { const J = j * 3; for (let i = 0; i < 3; i++) p[J + i] += _rgMv[i] * w; };
  // (a point lying on something counts as far heavier: the floor holds it, so the fix goes into the rest of the limb,
  // the knee lifted rather than the foot pushed into the ground, which only had the floor push it back and the limit
  // push it in again every step, so a body lying still twitched for seconds)
  const rests = k => p[k * 3 + 1] - RAG_R[k] * s - r.fl[k] < RAG_LIM.rest, wt = k => RAG_MASS[k] * (rests(k) ? RAG_LIM.held : 1);
  // (and a knee or an elbow lying on the floor with the foot or hand past it, once the body's been down a moment, is
  // given a little more room (slack): held right on its limit against the floor it only ever jiggled)
  const lying = r.landT && r.st - r.landT > RAG_LIM.restT;
  const moveBy = (k, o1, o2) => {
    const L = Math.hypot(_rgMv[0], _rgMv[1], _rgMv[2]), most = RAG_LIM.most * s; if (L > most) for (let i = 0; i < 3; i++) _rgMv[i] *= most / L;   // (a bit at a time: no knee snapping over in one go)
    const mk = wt(k), mo = wt(o1) + wt(o2), t = mk + mo; shift(k, mo / t); shift(o1, -mk / t); shift(o2, -mk / t);
  };
  // the middle joint of a limb (a to b to c) folds only one way: the lower bone turns off the upper toward where fold
  // (given the direction of a bone, into _rgF) says that joint folds, within tp and tn either way round. Past that
  // it's put right in two moves that each keep both bones their length: the middle point swung part of the way (pole)
  // round the line from a to c, the way it juts (against the fold), so a limb lying on the floor can lift its knee or
  // elbow back up rather than only drag its end round; then the end swung round the upper bone onto the limit
  const hinge = (a, b, c, fold, tp, tn) => {
    const A = a * 3, B = b * 3, C = c * 3;
    let tx = p[C] - p[A], ty = p[C + 1] - p[A + 1], tz = p[C + 2] - p[A + 2]; fold(tx, ty, tz); _rgF[0] = -_rgF[0]; _rgF[1] = -_rgF[1]; _rgF[2] = -_rgF[2];
    if (turnBack(a, b, tx, ty, tz, _rgF, tp, tn, RAG_LIM.pole)) moveBy(b, a, c);
    tx = p[B] - p[A]; ty = p[B + 1] - p[A + 1]; tz = p[B + 2] - p[A + 2]; fold(tx, ty, tz);
    if (turnBack(b, c, tx, ty, tz, _rgF, tp, tn, 1)) moveBy(c, a, b);
  };
  // (a knee folds round the line of the hips, the heel going back; an elbow brings the hand forward and up, and with
  // the arm raised over the head, back behind it)
  const HX = _rgN.set(p[3] - p[0], p[4] - p[1], p[5] - p[2]); if (HX.lengthSq() < 1e-8) HX.copy(X); else HX.normalize();
  const kneeFold = (x, y, z) => { _rgF[0] = HX.y * z - HX.z * y; _rgF[1] = HX.z * x - HX.x * z; _rgF[2] = HX.x * y - HX.y * x; };
  const elbowFold = (x, y, z) => { const k = 1 - 2 * Math.max(0, (x * Y.x + y * Y.y + z * Y.z) / (Math.hypot(x, y, z) || 1)); _rgF[0] = Z.x * k + Y.x * 0.5; _rgF[1] = Z.y * k + Y.y * 0.5; _rgF[2] = Z.z * k + Y.z * 0.5; };
  // how far b is from a along an axis of the trunk
  const along = (a, b, ax) => (p[b * 3] - p[a * 3]) * ax.x + (p[b * 3 + 1] - p[a * 3 + 1]) * ax.y + (p[b * 3 + 2] - p[a * 3 + 2]) * ax.z;
  for (const [hp, kn, ft, sd] of [[0, 9, 10, -1], [1, 11, 12, 1]]) {
    if (!on[kn]) continue;
    if (on[ft]) { const sl = lying && rests(kn) && rests(ft) ? RAG_LIM.slack : 0; hinge(hp, kn, ft, kneeFold, (sd < 0 ? RAG_LIM.kneeOut : RAG_LIM.kneeIn) + sl, (sd < 0 ? RAG_LIM.kneeIn : RAG_LIM.kneeOut) + sl); }
    const back = along(hp, kn, Z), lim = -RAG_LIM.thighBack * s; if (back < lim) swing(kn, hp, ft, Z.x * (lim - back), Z.y * (lim - back), Z.z * (lim - back));
    const out = along(hp, kn, X) * sd, lo = RAG_LIM.thighOut * s; if (out > lo) swing(kn, hp, ft, -X.x * sd * (out - lo), -X.y * sd * (out - lo), -X.z * sd * (out - lo));
    const up = along(hp, kn, Y), hi = RAG_LIM.thighUp * s; if (up > hi) swing(kn, hp, ft, -Y.x * (up - hi), -Y.y * (up - hi), -Y.z * (up - hi));
  }
  for (const [sh, el, hd] of [[2, 5, 6], [3, 7, 8]]) {
    if (!on[el]) continue;
    if (on[hd]) { const sl = lying && rests(el) && rests(hd) ? RAG_LIM.slack : 0; hinge(sh, el, hd, elbowFold, RAG_LIM.elbowTurn + sl, RAG_LIM.elbowTurn + sl); }
    const back = along(sh, el, Z), lim = -RAG_LIM.armBack * s; if (back < lim) swing(el, sh, hd, Z.x * (lim - back), Z.y * (lim - back), Z.z * (lim - back));
  }
  // and however they moved it, the body as a whole is put back where it was across the ground: a limit that can't be met
  // (a knee held off the floor, a thigh against a wall) is fixed every pass, and each fix, all one way, walked the body
  // along the ground (not up or down: the floor has the say there)
  let M = 0, cx = 0, cz = 0;
  for (let k = 0; k < on.length; k++) if (on[k]) { const i = k * 3, w = RAG_MASS[k]; M += w; cx += (p[i] - p0[i]) * w; cz += (p[i + 2] - p0[i + 2]) * w; }
  cx /= M; cz /= M;
  for (let k = 0; k < on.length; k++) if (on[k]) { const i = k * 3; p[i] -= cx; p[i + 2] -= cz; }
}
// the world round a point, as a body meets it: into buf from o on, at most RAG_SHN of them, each [what it is (0 a
// box, x0 z0 x1 z1; 1 a post, x z radius), how tall]: the house's walls, a prop (where it really stands in its cell,
// as tall as it is when that's known, a tree only its trunk), a window's sill or a boarded opening, and the fence's
// posts and rails
const RAG_SHN = 12;
function ragCollect(x, z, buf, o) {
  const i0 = ci(x) - 1, j0 = ci(z) - 1; let n = 0;
  const box = (a, b, c, d, top) => { if (n < RAG_SHN) { const e = o + n * 6; buf[e] = 0; buf[e + 1] = a; buf[e + 2] = b; buf[e + 3] = c; buf[e + 4] = d; buf[e + 5] = top; n++; } };
  for (let j = j0; j <= j0 + 2; j++) for (let i = i0; i <= i0 + 2; i++) {
    if (!inb(i, j)) continue;
    const k = idx(i, j), t = cell[k]; if (t === EMPTY) continue;
    const x0 = i - HALF, z0 = j - HALF;
    if (t === WALL) box(x0, z0, x0 + 1, z0 + 1, RAG_TOP.wall);
    else if (t === OBST) {
      const ot = obstTop.get(k), b = cellBox[k];
      if (ot && typeof ot === 'object') { if (n < RAG_SHN) { const e = o + n * 6; buf[e] = 1; buf[e + 1] = ot.x; buf[e + 2] = ot.z; buf[e + 3] = RAG_TOP.trunk; buf[e + 5] = ot.top; n++; } }
      else { const top = typeof ot === 'number' ? ot : lowObst.has(k) ? RAG_TOP.low : RAG_TOP.prop; if (b) box(b[0], b[1], b[2], b[3], top); else box(x0, z0, x0 + 1, z0 + 1, top); }
    } else if (t === FENCE) {
      const cx = x0 + 0.5, cz = z0 + 0.5, F = RAG_FENCE, f = (a, b) => inb(a, b) && cell[idx(a, b)] === FENCE;
      box(cx - F.post, cz - F.post, cx + F.post, cz + F.post, F.postTop);
      if (f(i + 1, j)) box(cx, cz - F.rail, x0 + 1, cz + F.rail, F.top); if (f(i - 1, j)) box(x0, cz - F.rail, cx, cz + F.rail, F.top);
      if (f(i, j + 1)) box(cx - F.rail, cz, cx + F.rail, z0 + 1, F.top); if (f(i, j - 1)) box(cx - F.rail, z0, cx + F.rail, cz, F.top);
    } else if (t === OPEN) { const op = openAt[k]; if (op.boards.length) box(x0, z0, x0 + 1, z0 + 1, RAG_TOP.boards); else if (op.kind === 'window') box(x0, z0, x0 + 1, z0 + 1, RAG_TOP.sill); }
  }
  return n;
}
function ragShapes(r, k) { r.shN[k] = ragCollect(r.p[k * 3], r.p[k * 3 + 2], r.sh, k * RAG_SHN * 6); }
// whether (x, z) at height y is inside something
const _rgSB = new Float32Array(RAG_SHN * 6);
function ragInside(x, y, z) {
  const n = ragCollect(x, z, _rgSB, 0);
  for (let m = 0; m < n; m++) {
    const e = m * 6; if (_rgSB[e + 5] <= y) continue;
    if (_rgSB[e] === 0 ? x > _rgSB[e + 1] && x < _rgSB[e + 3] && z > _rgSB[e + 2] && z < _rgSB[e + 4] : Math.hypot(x - _rgSB[e + 1], z - _rgSB[e + 2]) < _rgSB[e + 3]) return true;
  }
  return false;
}
// the world against each point, as a ball its part's thickness: up onto the top of whatever it came down on (a sill,
// a fence's rail, a crate), round the edge of what it's rolling off, out of the side of a wall, a prop, a post or a
// trunk along the way out of it (out the side it came in by, if it's right inside one), out of the house's inside
// walls, and up off the floor. Every push is kept (cn): what's pushed is touching, and how hard is how much the world
// holds it (ragGrip)
const _rgE = { x: 0, z: 0 };
function ragWorld(r) {
  const p = r.p, q = r.q, on = r.on, s = r.s, sh = r.sh, cn = r.cn;
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue;
    const i = k * 3, rad = RAG_R[k] * s, x0 = p[i], y0 = p[i + 1], z0 = p[i + 2];
    let x = x0, y = y0, z = z0;
    if (THIN.n) { _rgE.x = x; _rgE.z = z; thinPush(_rgE, rad, q[i], q[i + 2], true); x = _rgE.x; z = _rgE.z; }   // an inside wall (world/thin-walls.js)
    let floor = surfaceY(x, z);
    if (!r.ghost[k]) for (let m = 0, e = k * RAG_SHN * 6; m < r.shN[k]; m++, e += 6) {
      const top = sh[e + 5]; if (y - rad >= top) { if (sh[e] === 0 ? x >= sh[e + 1] && x <= sh[e + 3] && z >= sh[e + 2] && z <= sh[e + 4] : Math.hypot(x - sh[e + 1], z - sh[e + 2]) <= sh[e + 3]) floor = Math.max(floor, top); continue; }
      if (sh[e] === 1) {   // a post or a trunk: straight out from its middle, or round its top
        const ox = x - sh[e + 1], oz = z - sh[e + 2], d = Math.hypot(ox, oz), R = sh[e + 3];
        if (d >= R + rad) continue;
        if (d <= R && q[i + 1] - rad >= top - 0.08) { floor = Math.max(floor, top); continue; }
        if (y > top && d > R) { const dx = ox - ox / d * R, dz = oz - oz / d * R, dy = y - top, L = Math.hypot(dx, dy, dz); if (L >= rad) continue; const f = (rad - L) / (L || 1); x += dx * f; y += dy * f; z += dz * f; continue; }
        x = sh[e + 1] + ox / (d || 1) * (R + rad); z = sh[e + 2] + oz / (d || 1) * (R + rad); continue;
      }
      const a = sh[e + 1], b = sh[e + 2], c = sh[e + 3], dd = sh[e + 4];
      if (x <= a - rad || x >= c + rad || z <= b - rad || z >= dd + rad) continue;   // clear of it
      const ix = x > a && x < c, iz = z > b && z < dd;
      if (ix && iz && q[i + 1] - rad >= top - 0.08) { floor = Math.max(floor, top); continue; }   // came down on it: it lies on top
      if ((!ix && !iz) || (y > top && !(ix && iz))) {   // by a corner of it, or over its edge: round it
        const cx = clamp(x, a, c), cz = clamp(z, b, dd), dx = x - cx, dz = z - cz, dy = y > top ? y - top : 0, L = Math.hypot(dx, dy, dz);
        if (L >= rad) continue; const f = (rad - L) / (L || 1); x += dx * f; y += dy * f; z += dz * f; continue;
      }
      if (y > top) { y = top + rad; continue; }   // (its middle over the top, sunk into it: up onto it)
      // against it, or in it: out the side it came in by (where it was at the start of the step: even a thin rail it
      // went right through in one step is backed out the way it came), else the nearest
      const qx = q[i], qz = q[i + 2]; let best = 9, bx = x, bz = z;
      const side = (out, depth, nx, nz) => { const w = depth + (out ? 0 : 1); if (w < best) { best = w; bx = nx; bz = nz; } };
      side(qx <= a - rad + 1e-3, x - a + rad, a - rad, z); side(qx >= c + rad - 1e-3, c + rad - x, c + rad, z);
      side(qz <= b - rad + 1e-3, z - b + rad, x, b - rad); side(qz >= dd + rad - 1e-3, dd + rad - z, x, dd + rad);
      x = bx; z = bz;
    }
    if (y - rad < floor) y = floor + rad;
    r.fl[k] = floor;
    p[i] = x; p[i + 1] = y; p[i + 2] = z; cn[i] += x - x0; cn[i + 1] += y - y0; cn[i + 2] += z - z0;
  }
}
// what's touching something is held by it: slowed along it by how hard it's pressed in (its own weight, or how hard it
// hit), and stopped dead if it's sliding slower than that (so a body slumps where it lands, it doesn't skate off); and
// it bounces back off it a little if it hit hard, else not at all. The trunk's first hard landing thumps and knocks a
// little blood and dust out of it. How many of the trunk's points and the rest are touching (down, touch)
function ragGrip(r, h) {
  const p = r.p, q = r.q, on = r.on, s = r.s, cn = r.cn, g = RAG.grav * h * h;
  let down = 0, touch = 0;
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue;
    const i = k * 3, dn = Math.hypot(cn[i], cn[i + 1], cn[i + 2]);
    if (dn < 1e-7 && p[i + 1] - RAG_R[k] * s - r.fl[k] > 0.004) { if (r.ghost[k] && !ragInside(p[i], p[i + 1] - RAG_R[k] * s, p[i + 2])) r.ghost[k] = 0; continue; }
    if (r.ghost[k] && !ragInside(p[i], p[i + 1] - RAG_R[k] * s, p[i + 2])) r.ghost[k] = 0;
    if (k < 4) down++; else touch++;
    const nx = dn < 1e-7 ? 0 : cn[i] / dn, ny = dn < 1e-7 ? 1 : cn[i + 1] / dn, nz = dn < 1e-7 ? 0 : cn[i + 2] / dn;
    const vx = p[i] - q[i], vy = p[i + 1] - q[i + 1], vz = p[i + 2] - q[i + 2], vn = vx * nx + vy * ny + vz * nz;
    let tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz; const vt = Math.hypot(tx, ty, tz), press = Math.max(dn, g * Math.max(0, ny));
    if (vt < RAG.fs * press + RAG.stick * h) tx = ty = tz = 0; else { const f = 1 - RAG.fk * press / vt; tx *= f; ty *= f; tz *= f; }
    // (how fast it was going into it before it was pushed out: being pushed out never throws it off it)
    const vi = vn - dn, vn2 = vi < -RAG.bounceV * h ? -vi * RAG.bounce : Math.max(0, Math.min(vn, vi));
    q[i] = p[i] - tx - nx * vn2; q[i + 1] = p[i + 1] - ty - ny * vn2; q[i + 2] = p[i + 2] - tz - nz * vn2;
    if (!r.pooled && k < 4 && ny > 0.7 && vi / h < -1.2) {
      r.pooled = true;
      burst(p[i], 0.15, p[i + 2], 5, 'blood', 0, 0, 0.6); burst(p[i], 0.1, p[i + 2], 4, 'dust');
      if (Math.hypot(p[i] - P.x, p[i + 2] - P.z) < 12) soundAt(p[i], p[i + 2], () => SFX.thud());
    }
  }
  r.down = down >= 2; r.touch = down + touch;
}
// the pose a body's in the moment it dies, as it's drawn: each part of the rig where it is in the world (parents first),
// so the ragdoll can start from exactly that (ragBlendFrom), whatever the rig was doing (a survivor's: taken before its
// parts are set back as the rig's built, player/player-ragdoll.js)
const RAG_PARTS = ['g', 'lower', 'upper', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
export function ragGrab(m) {
  m.g.updateMatrixWorld(true);
  return RAG_PARTS.filter(k => m[k] && m[k].parent).map(k => [m[k], m[k].matrixWorld.clone()]);
}
// how far each part of the rig as the ragdoll first poses it is from how it stood (r.pre): kept, and eased off over
// RAG.blend s (ragPose), so the body goes on from the pose it died in with no jump: its waist bent as it was, its
// limbs turned on themselves as they were, a squashed stride's scale, all handed over smoothly to the ragdoll's own
const _rgMa = new THREE.Matrix4();
function ragBlendFrom(r) {
  const at = new Map(r.pre), out = [];
  for (const [o, W] of r.pre) {
    if (!o.parent) continue;
    _rgMa.copy(at.get(o.parent) || o.parent.matrixWorld).invert().multiply(W);   // (where it stood, in its parent as that stood)
    const pd = new V3(), qd = new THREE.Quaternion(), sd = new V3(); _rgMa.decompose(pd, qd, sd);
    out.push([o, pd.sub(o.position), o.quaternion.clone().invert().multiply(qd), sd.sub(o.scale), o.position.clone(), o.scale.clone()]);
  }
  r.bl = out; r.pre = null;
}
const _rgQb = new THREE.Quaternion(), _rgQI = new THREE.Quaternion();
function ragBlend(r) {
  const b = 1 - smooth(clamp(r.st / RAG.blend, 0, 1));
  for (const [o, dp, dq, ds, p0, s0] of r.bl) {
    if (o !== r.g && o !== r.m.head) o.position.copy(p0);   // (the parts the pose doesn't place, where they were put)
    o.scale.copy(s0);
    if (b <= 0) continue;
    o.position.addScaledVector(dp, b); o.scale.addScaledVector(ds, b); o.quaternion.multiply(_rgQb.copy(_rgQI).slerp(dq, b));
  }
  if (b <= 0) r.bl = null;
}
// the rig posed off the points (v: where they are this frame): the whole body turned and placed by its trunk, each
// limb pointed at its next joint, the head set where its point is and tipped off the shoulders
function ragPose(r, v) {
  const m = r.m, g = r.g, s = r.s, on = r.on, lb = r.limbs;
  ragFrame(v);
  _rgM.makeBasis(_rgX, _rgY, _rgZ); _rgQ.setFromRotationMatrix(_rgM); g.quaternion.copy(_rgQ);
  g.position.copy(_rgH).addScaledVector(_rgY, -ZHIP * s); _rgP.copy(g.position);   // (the rig's hips are ZHIP up off its feet)
  m.lower.rotation.set(0, 0, 0); m.upper.rotation.set(0, 0, 0);
  _rgQi.copy(_rgQ).invert();
  // a bone pointed from point k0 to k1 (in its parent's frame: qi), its length along rest, and turned on that length so
  // its own sideways (x) stays as near its parent's as it can: a whole frame, never the shortest turn from rest, which
  // flips a limb round when it points back past the parent (a leg up in the air, an arm behind the back)
  const aim = (o, k0, k1, rest, qi) => {
    _rgD.set(v[k1 * 3] - v[k0 * 3], v[k1 * 3 + 1] - v[k0 * 3 + 1], v[k1 * 3 + 2] - v[k0 * 3 + 2]).applyQuaternion(qi).normalize();
    const d = _rgD, sx = _rgS.set(1, 0, 0).addScaledVector(d, -d.x); if (sx.lengthSq() < 0.02) sx.set(0, 0, 1).addScaledVector(d, -d.z); sx.normalize();
    if (rest === _rgFw) _rgM.makeBasis(sx, _rgT.crossVectors(d, sx), d);                        // (its length along +z: an arm)
    else if (rest === _rgDn) _rgM.makeBasis(sx, _rgT.copy(d).negate(), _rgU.crossVectors(sx, _rgT));   // (along -y: a leg)
    else _rgM.makeBasis(sx, d, _rgU.crossVectors(sx, d));                                       // (along +y: the head)
    o.quaternion.setFromRotationMatrix(_rgM);
  };
  for (const sd of ['L', 'R']) {
    const [e, hd, sh] = RAG_LIMB['arm' + sd], [kn, ft, hp] = RAG_LIMB['leg' + sd];
    if (on[e] && lb['arm' + sd] && r.noFore) aim(m['arm' + sd], sh, on[hd] ? hd : e, _rgFw, _rgQi);   // (a one-piece arm, pointed at the hand)
    else if (on[e] && lb['arm' + sd]) { const a = m['arm' + sd]; aim(a, sh, e, _rgFw, _rgQi); if (on[hd]) aim(m['fore' + sd], e, hd, _rgFw, _rgQ2.copy(a.quaternion).invert().multiply(_rgQi)); }
    if (on[kn] && lb['leg' + sd]) { const l = m['leg' + sd]; aim(l, hp, kn, _rgDn, _rgQi); if (on[ft]) aim(m['shin' + sd], kn, ft, _rgDn, _rgQ2.copy(l.quaternion).invert().multiply(_rgQi)); }
  }
  if (on[4]) {
    const nk = [(v[6] + v[9]) / 2, (v[7] + v[10]) / 2, (v[8] + v[11]) / 2]; _rgN.set(nk[0], nk[1], nk[2]);
    { const save = [v[6], v[7], v[8]]; v[6] = nk[0]; v[7] = nk[1]; v[8] = nk[2]; aim(m.head, 2, 4, _rgUp, _rgQi); v[6] = save[0]; v[7] = save[1]; v[8] = save[2]; }   // (from between the shoulders)
    _rgD.set(v[12], v[13], v[14]).sub(_rgP).applyQuaternion(_rgQi).divideScalar(s); m.head.position.set(_rgD.x, _rgD.y - r.upY, _rgD.z);
  }
  if (r.bl) ragBlend(r);   // (and eased from the pose it died in, its first moments)
  r.gy = g.position.y; r.x = _rgH.x; r.z = _rgH.z;
  // its shadow under the trunk, stretched out along it the flatter it lies
  if (r.blob) {
    const lay = 1 - Math.abs(_rgY.y), sx = (v[6] + v[9]) / 2, sz = (v[8] + v[11]) / 2;
    r.blob.position.set((_rgH.x + sx) / 2, 0.02, (_rgH.z + sz) / 2); r.blob.rotation.y = Math.atan2(_rgY.x, _rgY.z); r.blob.scale.set(1.1 * s, 1, 1.1 * s * (1 + lay * 0.9));
  }
}
export function stepRagdoll(r, dt) {
  r.t += dt;
  if (!r.sleep) {
    // fixed steps, the pose drawn between the last two so it moves smoothly at any frame rate
    r.acc = Math.min(r.acc + dt, RAG.h * RAG.maxSteps);
    while (r.acc >= RAG.h && !r.sleep) { r.acc -= RAG.h; r.o.set(r.p); ragStep(r, RAG.h); }
    const a = r.sleep ? 1 : r.acc / RAG.h, o = r.o, p = r.p, v = r.v;
    for (let i = 0; i < v.length; i++) v[i] = o[i] + (p[i] - o[i]) * a;
    ragPose(r, v);
  }
  // after a while it sinks into the ground and goes
  r.g.position.y = r.gy - (r.keep ? 0 : Math.max(0, r.t - 8) * 0.25);
  if (r.burn > 0 && r.stain) r.stain.char = Math.min(1, r.stain.char + dt * 0.3);   // a body that went down burning smoulders on until it's black
  if (r.burn > 0) { r.burn -= dt; if (r.vis > 0.3 && r.t > 0.4) burnFx(r.x, r.z, 0.05, 0.45, 0.45 * r.s, dt * Math.min(1, r.burn)); }   // the fire dies down on the body
}
