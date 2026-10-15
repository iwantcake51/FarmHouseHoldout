// Health ECG line and heart rate.

// The heart rate follows your body the way a real one does: about 72 at rest, up when you run, get hit or lose
// blood (losing blood makes the heart race to keep the pressure up), and highest while a wound is still bleeding.
// It climbs within a couple of seconds and only settles slowly once the cause is gone. Near death it falters, slows
// and goes irregular before it stops.
// The trace is drawn like a bedside monitor's: about 2.6 seconds across, the pen sweeping left to right over the old
// trace and wiping a short gap ahead of itself, a little breathing drift in the baseline.
const ECG_HZ = 120, ECG_N = 312, ECG_GAP = 14, ecg = new Array(ECG_N).fill(0);
let ecgAcc = 0, ecgPen = 0, breathT = 0, heartRate = 72, hrStartle = 0, beatT = 0, beatRR = 60 / 72, prevRR = 60 / 72;
const ECG_R = 0.22;   // the R spike, this long after the start of each beat (the P wave comes first)
const gauss = (t, mu, sd, a) => a * Math.exp(-((t - mu) * (t - mu)) / (2 * sd * sd));
// one beat, t seconds after it starts, positive up: P, a small Q dip, the tall R, the S dip, then the T wave, which
// comes in closer at a fast rate (the QT interval shortens with the beat)
function beatWave(t, len) {
  const tT = ECG_R + 0.24 * Math.sqrt(Math.min(1.2, len));
  return gauss(t, 0.08, 0.025, 0.12) + gauss(t, ECG_R - 0.028, 0.009, -0.14) + gauss(t, ECG_R, 0.011, 1) + gauss(t, ECG_R + 0.03, 0.012, -0.28) + gauss(t, tT, 0.05, 0.26);
}
// a hit makes your heart jump (ui/hud.js hitFromAt)
function heartStartle() { hrStartle = Math.min(30, hrStartle + 12); }
// how hard the last beat pushed, 0..1: up fast at the R spike, then easing off till the next (the bleeding throb rides it)
function heartPulse() {
  if (P.hp <= 0) return 0;
  let tr = beatT - ECG_R; if (tr < 0) tr += prevRR;
  return tr < 0.07 ? smooth(tr / 0.07) : 1 - smooth(Math.min(1, (tr - 0.07) / Math.max(0.15, 0.8 * beatRR - 0.07)));
}
function updateHeart(rdt, hpF) {
  const dead = P.hp <= 0, lost = clamp(1 - hpF, 0, 1), bleedK = P.bleed > 0 ? Math.min(1, P.bleed / 6) : 0;
  hrStartle = Math.max(0, hrStartle - rdt * 2.5);
  let target = 72 + lost * 55 + bleedK * 38 + (P.sprint ? 26 : 0) + (1 - P.stam) * 22 + P.slow * 14 + (P.adr > 0 ? 28 : 0) + hrStartle;
  if (hpF < 0.1) target = target * hpF / 0.1 + 46 * (1 - hpF / 0.1);   // the heart gives out near the end: it slows right down
  target = Math.min(188, target);
  heartRate += (target - heartRate) * (1 - Math.exp(-rdt / (target > heartRate ? 2.2 : 9)));
  ecgAcc += rdt * ECG_HZ;
  const breathHz = (12 + (heartRate - 72) * 0.15) / 60;   // you breathe faster as your heart does
  while (ecgAcc >= 1) {
    ecgAcc--;
    beatT += 1 / ECG_HZ; breathT += breathHz / ECG_HZ;
    // the next beat: a touch quicker breathing in and slower breathing out at rest, wild near death
    if (beatT >= beatRR) { beatT -= beatRR; prevRR = beatRR; beatRR = 60 / heartRate * (1 + Math.sin(breathT * Math.PI * 2) * (heartRate < 100 ? 0.04 : 0.01) + rr(-1, 1) * (hpF < 0.1 ? 0.14 : 0.01)); }
    const drift = Math.sin(breathT * Math.PI * 2) * 0.05;
    ecg[ecgPen] = dead ? drift * 0.4 + rr(-0.01, 0.01) : beatWave(beatT, beatRR) + beatWave(beatT + prevRR, prevRR) + drift + rr(-0.012, 0.012);
    ecgPen = (ecgPen + 1) % ECG_N;
  }
  // the sweep: everything but the gap just ahead of the pen, in one or two runs
  const sx = 180 / (ECG_N - 1), pt = i => `${(i * sx).toFixed(1)},${(20 - ecg[i] * 15).toFixed(1)}`;
  let d = '', open = false;
  for (let i = 0; i < ECG_N; i++) {
    if ((i - ecgPen + ECG_N) % ECG_N < ECG_GAP) { open = false; continue; }
    d += (open ? 'L' : 'M') + pt(i); open = true;
  }
  $('ecgLine').setAttribute('d', d);
}
function resetHeart() { heartRate = 72; hrStartle = 0; beatT = 0; ecgPen = 0; beatRR = prevRR = 60 / 72; ecg.fill(0); }
