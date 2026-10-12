// Every sound effect, synthesized.

const SFX = {
  light() { nz(0.2, 'lowpass', 3200, 260, 0.75); tn(0.13, 'sine', 150, 45, 0.6); },
  heavy() { nz(0.32, 'lowpass', 2600, 180, 0.9); tn(0.22, 'sine', 120, 38, 0.8); },
  shotgun() { nz(0.45, 'lowpass', 2200, 140, 0.95); tn(0.28, 'sine', 110, 32, 0.85); },
  auto() { nz(0.09, 'lowpass', 3600, 500, 0.45); tn(0.06, 'sine', 170, 60, 0.35); },
  rifle() { nz(0.4, 'lowpass', 4200, 200, 0.95); tn(0.2, 'sine', 160, 40, 0.7); },
  supp(big) { nz(big ? 0.2 : 0.08, 'bandpass', 1800, 700, big ? 0.5 : 0.3, 1.2); tn(0.05, 'sine', 120, 60, 0.2); },
  swing() { nz(0.2, 'bandpass', 500, 2600, 0.3, 2); },
  tick() { tn(0.035, 'square', 2300, 1900, 0.07); nz(0.05, 'lowpass', 900, 200, 0.26); tn(0.06, 'sine', 160, 70, 0.2); },
  headHit() { tn(0.05, 'triangle', 1700, 1100, 0.09); nz(0.04, 'bandpass', 2600, 1400, 0.14, 3); },
  shove() { nz(0.14, 'bandpass', 420, 1500, 0.3, 1.3); },
  kill() { tn(0.16, 'sine', 120, 40, 0.55); nz(0.12, 'lowpass', 1400, 160, 0.4); tn(0.05, 'square', 1500, 900, 0.05); },
  sever() { nz(0.18, 'bandpass', 700, 200, 0.5, 2); tn(0.08, 'triangle', 200, 80, 0.25); },
  thud() { tn(0.12, 'sine', 110, 45, 0.45); nz(0.07, 'lowpass', 900, 200, 0.3); },
  board() { tn(0.05, 'square', 230, 140, 0.16); nz(0.05, 'highpass', 2400, 1800, 0.2); },
  crack() { nz(0.32, 'bandpass', 1100, 260, 0.55, 1.4); tn(0.08, 'triangle', 300, 90, 0.2); },
  click() { tn(0.03, 'square', 1300, 900, 0.1); },
  magOut() { tn(0.04, 'square', 900, 600, 0.1); nz(0.05, 'bandpass', 1500, 900, 0.15, 2); },
  magIn() { tn(0.05, 'square', 600, 400, 0.14); nz(0.06, 'bandpass', 1200, 700, 0.2, 2); },
  shell() { tn(0.04, 'square', 700, 500, 0.12); nz(0.07, 'bandpass', 2200, 1200, 0.22, 3); },
  rack() { nz(0.06, 'bandpass', 1400, 800, 0.3, 2); setTimeout(() => nz(0.07, 'bandpass', 900, 500, 0.32, 2), 110); },
  tink(hull, v) { if (hull) { tn(0.05, 'triangle', rr(520, 640), 300, 0.05 * v); nz(0.04, 'bandpass', 1400, 900, 0.06 * v, 3); } else { const f = rr(3800, 5200); tn(0.06, 'sine', f, f * 0.97, 0.035 * v); tn(0.04, 'sine', f * 1.5, f * 1.48, 0.015 * v); } },
  pump() { nz(0.05, 'bandpass', 1100, 700, 0.26, 2); tn(0.03, 'square', 420, 300, 0.06); setTimeout(() => { nz(0.06, 'bandpass', 1500, 900, 0.3, 2); tn(0.03, 'square', 520, 380, 0.07); }, 150); },
  bolt() { tn(0.03, 'square', 900, 700, 0.07); nz(0.05, 'bandpass', 2400, 1400, 0.2, 3); setTimeout(() => { nz(0.06, 'bandpass', 1800, 1000, 0.22, 3); tn(0.04, 'square', 700, 500, 0.08); }, 190); },
  swingBlunt(two) { nz(two ? 0.26 : 0.2, 'bandpass', 260, 1300, 0.34, 1.4); tn(0.12, 'sine', 90, 60, 0.05); },
  swingBlade(chop) { nz(chop ? 0.2 : 0.15, 'bandpass', chop ? 900 : 1700, chop ? 3200 : 5600, 0.28, 3.5); tn(0.1, 'sine', 1500, 2700, 0.025); },
  hitBlunt(big) { tn(big ? 0.18 : 0.13, 'sine', big ? 85 : 110, 38, 0.62); nz(0.1, 'lowpass', 800, 140, 0.5); nz(0.045, 'bandpass', 1900, 800, 0.26, 2); setTimeout(() => nz(0.05, 'bandpass', 1300, 600, 0.14, 2.5), 30); },
  hitBlade(chop) { nz(0.11, 'bandpass', 5200, 1700, 0.36, 3); tn(0.22, 'sine', 2600, 2540, 0.045); setTimeout(() => nz(0.16, 'bandpass', 700, 260, 0.32, 1.6), 22); if (chop) tn(0.12, 'sine', 150, 60, 0.42); },
  magDrop(v) { tn(0.05, 'square', 340, 200, 0.07 * v); nz(0.09, 'bandpass', 1100, 500, 0.16 * v, 2); setTimeout(() => tn(0.03, 'square', 520, 380, 0.04 * v), 70); },
  fenceClimb() { nz(0.3, 'bandpass', 500, 260, 0.2, 3); tn(0.18, 'triangle', 140, 110, 0.06); },
  concuss() {
    if (!AC) return; const t = AC.currentTime;
    tn(0.4, 'sine', 70, 28, 1.0); nz(0.4, 'lowpass', 900, 80, 0.9);
    muff.frequency.cancelScheduledValues(t); muff.frequency.setValueAtTime(380, t); muff.frequency.exponentialRampToValueAtTime(20000, t + 3.2);
    const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = 3350; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 3.5);
  },
  pant() { nz(0.32, 'bandpass', 900, 500, 0.12, 1.2); setTimeout(() => nz(0.25, 'bandpass', 700, 420, 0.08, 1.2), 300); },
  rip() { nz(0.22, 'highpass', 2600, 1800, 0.22, 1); nz(0.12, 'bandpass', 3400, 2200, 0.14, 2); },
  wrap() { nz(0.16, 'bandpass', 1600, 900, 0.08, 1.4); },
  vault() { nz(0.25, 'bandpass', 400, 1200, 0.25, 1.5); tn(0.1, 'sine', 140, 90, 0.2); },
  hurt() { tn(0.28, 'sawtooth', 190, 70, 0.22); nz(0.1, 'lowpass', 600, 150, 0.3); },
  pick() { tn(0.06, 'sine', 700, 700, 0.14); setTimeout(() => tn(0.1, 'sine', 1050, 1050, 0.12), 60); },
  scrap() { tn(0.04, 'square', 1800, 1600, 0.05); setTimeout(() => tn(0.04, 'square', 2200, 2000, 0.05), 50); },
  upgrade() { tn(0.12, 'square', 300, 300, 0.06); setTimeout(() => tn(0.12, 'square', 450, 450, 0.06), 90); nz(0.2, 'highpass', 3000, 5000, 0.08); },
  thump() { tn(0.12, 'sine', 180, 60, 0.5); nz(0.1, 'lowpass', 800, 200, 0.3); },
  boom() { nz(1.1, 'lowpass', 1600, 60, 1.0); tn(0.6, 'sine', 70, 25, 0.9); },
  groan(v) {
    if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.value = rr(65, 95); l.frequency.value = rr(4, 7); lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 1.2); l.stop(t + 1.2);
  },
  wave() { tn(1.4, 'sine', 98, 92, 0.25); tn(1.4, 'sine', 147, 139, 0.12); },
  cleared() { tn(0.9, 'sine', 196, 196, 0.12); setTimeout(() => tn(1.2, 'sine', 294, 294, 0.1), 180); }
};
const GUN_SFX = { pistol: 'light', revolver: 'heavy', deagle: 'heavy', pump: 'shotgun', dbl: 'shotgun', auto12: 'shotgun', hunting: 'rifle', smg: 'auto', sub: 'auto', ar: 'rifle', lmg: 'rifle' };
