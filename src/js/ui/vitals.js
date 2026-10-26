// Health ECG line and heart rate.

import { $ } from '../core/dom.js';
import { clamp, rr } from '../core/math.js';
import { P } from '../player/player.js';
import { stamMax } from '../game/run-state.js';

// The heart rate follows your body the way a real one does: about 72 at rest, up when you run, get hit or lose
// blood (losing blood makes the heart race to keep the pressure up), and highest while a wound is still bleeding.
// It climbs within a couple of seconds and only settles slowly once the cause is gone. Near death it falters, slows
// and goes irregular before it stops.
// The trace is one unbroken line running right to left, about 2.6 seconds across. Like a real one, no two beats are
// quite the same: each is a little taller or shorter (more so with the breath), its waves a touch different, the
// baseline drifts as you breathe, and the line goes fuzzy and jumps while you run or take a hit.
const ECG_HZ = 120, ECG_N = 312, ecg = new Array(ECG_N).fill(0);
export let ecgAcc = 0, ecgPen = 0, breathT = 0, heartRate = 72, hrStartle = 0, beatT = 0, beatRR = 60 / 72, prevRR = 60 / 72, ecgNoise = 0, ecgJolt = 0, ecgJoltV = 0;
export const ECG_R = 0.22;   // the R spike, this long after the start of each beat (the P wave comes first)
const gauss = (t, mu, sd, a) => a * Math.exp(-((t - mu) * (t - mu)) / (2 * sd * sd));
// one beat, t seconds after it starts, positive up: P, a small Q dip, the tall R, the S dip, then the T wave, which
// comes in closer at a fast rate (the QT interval shortens with the beat)
function beatWave(t, b) {
  const tT = ECG_R + 0.24 * Math.sqrt(Math.min(1.2, b.len)) + b.tShift, w = b.w;
  return gauss(t, 0.08, 0.025 * w, b.p) + gauss(t, ECG_R - 0.028 * w, 0.009 * w, -0.14 * b.a) + gauss(t, ECG_R, 0.011 * w, b.a) + gauss(t, ECG_R + 0.03 * w, 0.012 * w, -b.s) + gauss(t, tT, 0.05, b.t);
}
// each beat's own small differences: the chest rising with the breath lifts the spike a little, and the rest is chance
function newBeat(len) {
  const br = Math.sin(breathT * Math.PI * 2);
  return { len, a: 1 + br * 0.07 + rr(-0.05, 0.05), p: 0.12 * rr(0.8, 1.2), s: 0.28 * rr(0.8, 1.2), t: 0.26 * rr(0.85, 1.15), w: rr(0.93, 1.08), tShift: rr(-0.012, 0.012) };
}
let beatCur = newBeat(60 / 72), beatPrev = newBeat(60 / 72);
// a hit makes your heart jump (ui/hud.js hitFromAt)
export function heartStartle() { hrStartle = Math.min(30, hrStartle + 12); ecgJolt = 1; ecgJoltV = rr(-1, 1) < 0 ? -1 : 1; }
export function updateHeart(rdt, hpF) {
  const dead = P.hp <= 0, lost = clamp(1 - hpF, 0, 1), bleedK = P.bleed > 0 ? Math.min(1, P.bleed / 6) : 0;
  hrStartle = Math.max(0, hrStartle - rdt * 2.5);
  let target = 72 + lost * 55 + bleedK * 38 + (P.sprint ? 26 : 0) + (1 - P.stam / stamMax()) * 22 + P.slow * 14 + (P.adr > 0 ? 28 : 0) + hrStartle;
  if (hpF < 0.1) target = target * hpF / 0.1 + 46 * (1 - hpF / 0.1);   // the heart gives out near the end: it slows right down
  target = Math.min(188, target);
  heartRate += (target - heartRate) * (1 - Math.exp(-rdt / (target > heartRate ? 2.2 : 9)));
  ecgAcc += rdt * ECG_HZ;
  const moveK = Math.min(1, Math.hypot(P.vx || 0, P.vz || 0) / 6) * (P.sprint ? 1 : 0.45);
  const breathHz = (12 + (heartRate - 72) * 0.15) / 60;   // you breathe faster as your heart does
  let fresh = false;
  while (ecgAcc >= 1) {
    ecgAcc--; fresh = true;
    beatT += 1 / ECG_HZ; breathT += breathHz / ECG_HZ;
    // the next beat: a touch quicker breathing in and slower breathing out at rest, wild near death
    if (beatT >= beatRR) { beatT -= beatRR; prevRR = beatRR; beatRR = 60 / heartRate * (1 + Math.sin(breathT * Math.PI * 2) * (heartRate < 100 ? 0.04 : 0.01) + rr(-1, 1) * (hpF < 0.1 ? 0.14 : 0.01)); beatPrev = beatCur; beatCur = newBeat(beatRR); }
    const drift = Math.sin(breathT * Math.PI * 2) * 0.05 + Math.sin(breathT * 0.37 * Math.PI * 2 + 1) * 0.02;
    // the leads pick up your muscles: a fine fuzz always, a rougher wander while you move, a jolt when you're hit
    ecgNoise += (rr(-1, 1) * (0.03 + moveK * 0.16) - ecgNoise) * 0.25;
    ecgJolt = Math.max(0, ecgJolt - 1 / (ECG_HZ * 0.35));
    const noise = ecgNoise + rr(-1, 1) * (0.012 + moveK * 0.03) + ecgJoltV * ecgJolt * 0.4 * Math.sin(ecgJolt * 11);
    ecg[ecgPen] = dead ? drift * 0.4 + rr(-0.01, 0.01) : beatWave(beatT, beatCur) + beatWave(beatT + prevRR, beatPrev) + drift + noise;
    ecgPen = (ecgPen + 1) % ECG_N;
  }
  // oldest on the left, newest at the right edge (ecgPen is the oldest sample in the ring); drawn again only once it's
  // moved on (a frame with no new sample leaves it as it was)
  if (!fresh) return;
  const sx = 180 / (ECG_N - 1);
  let d = '';
  for (let k = 0; k < ECG_N; k++) d += (k ? 'L' : 'M') + (k * sx).toFixed(1) + ',' + (20 - ecg[(ecgPen + k) % ECG_N] * 15).toFixed(1);
  $('ecgLine').setAttribute('d', d);
}
export function resetHeart() { heartRate = 72; hrStartle = 0; beatT = 0; ecgPen = 0; beatRR = prevRR = 60 / 72; beatCur = newBeat(beatRR); beatPrev = newBeat(beatRR); ecgNoise = ecgJolt = 0; ecg.fill(0); }
