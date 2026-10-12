// Health ECG line.

// heartbeat trace
const ECG_N = 76, ecg = new Array(ECG_N).fill(0);
let ecgPhase = 0, ecgAcc = 0;
function ecgSample(f) {
  if (f < 0.1) return 0;
  if (f < 0.16) return -0.12 * Math.sin((f - 0.1) / 0.06 * Math.PI);
  if (f < 0.19) return 0.2 * ((f - 0.16) / 0.03);
  if (f < 0.22) return 0.2 - 1.25 * ((f - 0.19) / 0.03);
  if (f < 0.26) return -1.05 + 1.4 * ((f - 0.22) / 0.04);
  if (f < 0.29) return 0.35 - 0.35 * ((f - 0.26) / 0.03);
  if (f > 0.4 && f < 0.56) return -0.22 * Math.sin((f - 0.4) / 0.16 * Math.PI);
  return 0;
}
