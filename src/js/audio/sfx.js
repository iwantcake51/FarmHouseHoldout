// Every sound effect. Most play a recording (audio/samples.js), and the synthesized sound written after it plays
// instead until that recording has loaded; the rest (footsteps, vaulting, zombies, the UI) are only synthesized.

const SFX = {
  light() { nz(0.2, 'lowpass', 3200, 260, 0.75); tn(0.13, 'sine', 150, 45, 0.6); },
  heavy() { nz(0.32, 'lowpass', 2600, 180, 0.9); tn(0.22, 'sine', 120, 38, 0.8); },
  shotgun() { nz(0.45, 'lowpass', 2200, 140, 0.95); tn(0.28, 'sine', 110, 32, 0.85); },
  auto() { nz(0.09, 'lowpass', 3600, 500, 0.45); tn(0.06, 'sine', 170, 60, 0.35); },
  rifle() { nz(0.4, 'lowpass', 4200, 200, 0.95); tn(0.2, 'sine', 160, 40, 0.7); },
  // a shot: the gun's one recording, a little different every time (its pitch and speed, its tone, how loud it is and
  // where it sits left to right), and inside the farmhouse the room rings with it
  fire(id, quiet, shells) {
    const verb = indoors() ? (quiet ? 0.32 : shells || id === 'deagle' || id === 'hunting' ? 0.75 : 0.62) : 0;
    if (playS(quiet ? SUPP_SFX[id] : 'shot_' + id, { jit: 0.065, tone: 3.5, lp: rr(7500, 20000), pan: rr(-0.12, 0.12), verb })) return;
    if (quiet) SFX.supp(shells); else SFX[GUN_SFX[id]]();
  },
  dry() { if (!playS('dry_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) SFX.click(); },   // the trigger on an empty gun
  supp(big) { nz(big ? 0.2 : 0.08, 'bandpass', 1800, 700, big ? 0.5 : 0.3, 1.2); tn(0.05, 'sine', 120, 60, 0.2); },
  swing() { nz(0.2, 'bandpass', 500, 2600, 0.3, 2); },
  tick() { if (playS(['flesh_1', 'flesh_2'], { gap: 0.035, jit: 0.08 })) return; tn(0.035, 'square', 2300, 1900, 0.07); nz(0.05, 'lowpass', 900, 200, 0.26); tn(0.06, 'sine', 160, 70, 0.2); },
  headHit() { if (playS('head_hit', { gap: 0.05, rate: 1.1 })) return; tn(0.05, 'triangle', 1700, 1100, 0.09); nz(0.04, 'bandpass', 2600, 1400, 0.14, 3); },
  shove(stab) { if (playS(['swing_light_1', 'swing_light_2'], { rate: 1.1 })) return; nz(0.16, 'bandpass', 380, 1700, 0.42, 1.2); tn(0.08, 'sine', 140, 70, 0.18); if (stab) nz(0.09, 'highpass', 3200, 2400, 0.16); },
  sever() { if (playS('sever', { gap: 0.06, jit: 0.08 })) return; nz(0.18, 'bandpass', 700, 200, 0.5, 2); tn(0.08, 'triangle', 200, 80, 0.25); },
  // a skull caving in under the sledgehammer: a sharp crack, a deep wet crunch, then the spatter
  crush() { nz(0.07, 'bandpass', 1900, 600, 0.6, 1.4); tn(0.14, 'sine', 120, 42, 0.6); setTimeout(() => nz(0.24, 'lowpass', 1200, 180, 0.5, 1), 20); setTimeout(() => nz(0.18, 'bandpass', 2600, 900, 0.22, 1.8), 60); },
  // a skull split by the fire axe: a hard crack of bone, then a wet tearing as it comes apart
  split() { nz(0.06, 'bandpass', 2400, 800, 0.55, 1.6); tn(0.1, 'sine', 160, 55, 0.45); setTimeout(() => nz(0.22, 'bandpass', 900, 240, 0.4, 1.2), 25); },
  // a zombie's skull bursting: every kill (zombies/damage.js killEnd), from the zombie, at v
  headPop(v = 1) { if (playS('head_pop', { gap: 0.05, rate: 1.12, vol: v })) return; nz(0.12, 'bandpass', 900, 260, 0.5 * v, 1.6); tn(0.05, 'triangle', 760, 240, 0.14 * v); setTimeout(() => nz(0.16, 'lowpass', 1400, 300, 0.22 * v, 1), 30); },
  thud() { tn(0.12, 'sine', 110, 45, 0.45); nz(0.07, 'lowpass', 900, 200, 0.3); },
  board() { if (playS(['wood_hit_1', 'wood_hit_2'], { jit: 0.06 })) return; tn(0.05, 'square', 230, 140, 0.16); nz(0.05, 'highpass', 2400, 1800, 0.2); },
  crack() { if (playS('wood_break', { gap: 0.1 })) return; nz(0.32, 'bandpass', 1100, 260, 0.55, 1.4); tn(0.08, 'triangle', 300, 90, 0.2); },
  // a board torn off hitting the ground: a hollow wooden clack
  plankDrop(v) { if (playS(['wood_hit_1', 'wood_hit_2'], { vol: 0.55 * v, rate: 1.15, gap: 0.04 })) return; tn(0.09, 'triangle', rr(190, 240), 110, 0.22 * v); nz(0.07, 'bandpass', 900, 400, 0.25 * v, 1.6); },
  click() { tn(0.03, 'square', 1300, 900, 0.1); },
  magOut() { if (playS('magout_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) return; tn(0.04, 'square', 900, 600, 0.1); nz(0.05, 'bandpass', 1500, 900, 0.15, 2); },
  magIn() { if (playS('magin_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) return; tn(0.05, 'square', 600, 400, 0.14); nz(0.06, 'bandpass', 1200, 700, 0.2, 2); },
  shell() { const id = curId(); if (id === 'hunting' || id === 'revolver' ? playS('round_in', { gap: 0.03, rate: id === 'revolver' ? 1.25 : 1, vol: id === 'revolver' ? 0.8 : 1 }) : playS(['shell_1', 'shell_2'], { gap: 0.03 })) return; tn(0.04, 'square', 700, 500, 0.12); nz(0.07, 'bandpass', 2200, 1200, 0.22, 3); },
  chargePull() { const k = gunKind(); if (playS(k === 'pistol' ? 'slide_pull' : k === 'smg' ? 'charge_pull_smg' : 'charge_pull_rifle')) return; nz(0.07, 'bandpass', 1700, 900, 0.22, 2); tn(0.03, 'square', 900, 700, 0.05); },
  chargeSlam() { if (playS(gunKind() === 'smg' ? 'charge_slam_smg' : 'charge_slam_rifle')) return; nz(0.05, 'bandpass', 1100, 500, 0.32, 2); tn(0.05, 'triangle', 420, 180, 0.2); },
  slideDrop() { if (playS('slide_drop')) return; nz(0.045, 'bandpass', 1700, 900, 0.34, 2.2); tn(0.04, 'triangle', 560, 220, 0.18); },
  // a revolver's cylinder flicked home: the crisp click of the latch and a ring of the frame
  cylShut() { if (playS('magin_pistol', { rate: 1.12, vol: 0.85 })) return; tn(0.025, 'square', 1700, 1100, 0.12); nz(0.05, 'bandpass', 3000, 1600, 0.26, 3); tn(0.07, 'triangle', 520, 260, 0.12); setTimeout(() => tn(0.02, 'square', 2100, 1500, 0.04), 28); },
  brkShut() { if (playS('pump_home_2', { rate: 0.85 })) return; tn(0.03, 'square', 950, 520, 0.13); nz(0.07, 'bandpass', 1700, 800, 0.32, 2.4); tn(0.08, 'triangle', 260, 120, 0.16); },   // the double barrel's barrels swung up and latching
  rack() { if (playS('slide_drop', { rate: 0.9 })) return; nz(0.06, 'bandpass', 1400, 800, 0.3, 2); setTimeout(() => nz(0.07, 'bandpass', 900, 500, 0.32, 2), 110); },
  tink(hull, v) { if (hull) { tn(0.05, 'triangle', rr(520, 640), 300, 0.05 * v); nz(0.04, 'bandpass', 1400, 900, 0.06 * v, 3); } else { const f = rr(3800, 5200); tn(0.06, 'sine', f, f * 0.97, 0.035 * v); tn(0.04, 'sine', f * 1.5, f * 1.48, 0.015 * v); } },
  // working a pump: the forend yanked back to its stop (a rasp and a clack), then shoved home (a heavier slam)
  pumpBack() { pumpV = rand() < 0.5 ? '' : '_2'; if (playS('pump_back' + pumpV)) return; nz(0.07, 'bandpass', 1300, 650, 0.3, 2); tn(0.04, 'square', 440, 280, 0.08); tn(0.05, 'sine', 180, 90, 0.12); },
  pumpHome() { if (playS('pump_home' + pumpV)) return; nz(0.08, 'bandpass', 1700, 800, 0.36, 2); tn(0.04, 'square', 560, 360, 0.1); tn(0.07, 'sine', 150, 70, 0.2); },
  // working a bolt: the handle snapped up, the bolt drawn back hard, driven home, and the handle slapped down to lock
  boltUp() { if (playS('safety_2', { rate: 0.85 })) return; tn(0.025, 'square', 1100, 850, 0.06); nz(0.03, 'bandpass', 2800, 2000, 0.14, 3); },
  boltBack() { if (playS('charge_pull_rifle', { rate: 0.9 })) return; nz(0.09, 'bandpass', 2200, 1100, 0.24, 3); tn(0.04, 'square', 760, 520, 0.08); tn(0.05, 'sine', 200, 110, 0.1); },
  boltHome() { if (playS('charge_slam_rifle', { rate: 0.93, vol: 0.85 })) return; nz(0.07, 'bandpass', 1600, 900, 0.22, 3); tn(0.03, 'square', 620, 460, 0.07); },
  boltLock() { if (playS('safety_1', { rate: 0.78 })) return; tn(0.04, 'square', 820, 560, 0.1); nz(0.04, 'bandpass', 2600, 1500, 0.2, 3); tn(0.05, 'sine', 170, 90, 0.12); },
  swingBlunt(two) { if (playS(two ? ['swing_heavy_1', 'swing_heavy_2', 'swing_heavy_3'] : ['swing_light_1', 'swing_light_2'], { jit: 0.07 })) return; nz(two ? 0.26 : 0.2, 'bandpass', 260, 1300, 0.34, 1.4); tn(0.12, 'sine', 90, 60, 0.05); },
  swingBlade(chop) { if (playS(chop ? ['swing_heavy_1', 'swing_heavy_2', 'swing_heavy_3'] : ['swing_knife', 'swing_light_1'], { jit: 0.07, rate: chop ? 1.08 : 1.15 })) return; nz(chop ? 0.2 : 0.15, 'bandpass', chop ? 900 : 1700, chop ? 3200 : 5600, 0.28, 3.5); tn(0.1, 'sine', 1500, 2700, 0.025); },
  // the fire axe and the sledgehammer: a deep rush of air as they come down, and a heavy thump through the ground as they
  // land, under the blade's or the hammer's own hit
  swingHeavy(blade) { nz(0.22, 'bandpass', 180, blade ? 1500 : 900, 0.5, 1.2); tn(0.18, 'sine', 70, 45, 0.18); },
  heavyHit(big) { tn(big ? 0.3 : 0.24, 'sine', big ? 72 : 85, 30, 0.85); nz(0.16, 'lowpass', 600, 90, 0.6); setTimeout(() => tn(0.12, 'sine', 55, 30, 0.35), 40); },
  hitBlunt(big) { if (playS(big ? ['hit_blunt_big_1', 'hit_blunt_big_2'] : ['hit_blunt_1', 'hit_blunt_2'], { jit: 0.06, gap: 0.04 })) return; tn(big ? 0.18 : 0.13, 'sine', big ? 85 : 110, 38, 0.62); nz(0.1, 'lowpass', 800, 140, 0.5); nz(0.045, 'bandpass', 1900, 800, 0.26, 2); setTimeout(() => nz(0.05, 'bandpass', 1300, 600, 0.14, 2.5), 30); },
  hitBlade(chop) { if (playS(chop ? ['hit_chop_1', 'hit_chop_2'] : ['hit_blade_1', 'hit_blade_2'], { jit: 0.06, gap: 0.04 })) return; nz(0.11, 'bandpass', 5200, 1700, 0.36, 3); tn(0.22, 'sine', 2600, 2540, 0.045); setTimeout(() => nz(0.16, 'bandpass', 700, 260, 0.32, 1.6), 22); if (chop) tn(0.12, 'sine', 150, 60, 0.42); },
  magDrop(v) { if (playS('mag_drop', { vol: v, jit: 0.1 })) return; tn(0.05, 'square', 340, 200, 0.07 * v); nz(0.09, 'bandpass', 1100, 500, 0.16 * v, 2); setTimeout(() => tn(0.03, 'square', 520, 380, 0.04 * v), 70); },
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
  rip() { if (playS('medkit')) return; nz(0.22, 'highpass', 2600, 1800, 0.22, 1); nz(0.12, 'bandpass', 3400, 2200, 0.14, 2); },
  wrap() { nz(0.16, 'bandpass', 1600, 900, 0.08, 1.4); },
  skid() { nz(0.4, 'bandpass', 1500, 450, 0.15, 0.9); nz(0.34, 'lowpass', 700, 180, 0.13); },   // boots scraping to a stop on the dirt
  step(v, wood) { const a = (0.035 + 0.04 * v) * rr(0.8, 1.15); if (wood) { tn(0.05, 'sine', rr(150, 180), 80, a * 1.1); nz(0.04, 'bandpass', rr(900, 1200), 500, a * 0.8, 2); } else { nz(0.07, 'lowpass', rr(420, 560), 140, a * 1.4); tn(0.05, 'sine', 95, 55, a * 0.6); } },
  vault() { nz(0.25, 'bandpass', 400, 1200, 0.25, 1.5); tn(0.1, 'sine', 140, 90, 0.2); },
  hurt() { tn(0.28, 'sawtooth', 190, 70, 0.22); nz(0.1, 'lowpass', 600, 150, 0.3); },
  pick() { if (playS('pickup')) return; tn(0.06, 'sine', 700, 700, 0.14); setTimeout(() => tn(0.1, 'sine', 1050, 1050, 0.12), 60); },
  scrap() { tn(0.04, 'square', 1800, 1600, 0.05); setTimeout(() => tn(0.04, 'square', 2200, 2000, 0.05), 50); },
  upgrade() { if (playS('upgrade')) return; tn(0.12, 'square', 300, 300, 0.06); setTimeout(() => tn(0.12, 'square', 450, 450, 0.06), 90); nz(0.2, 'highpass', 3000, 5000, 0.08); },
  launch() { if (!playS('shot_gl', { jit: 0.05, tone: 3, verb: indoors() ? 0.6 : 0 })) SFX.thump(); },   // the underbarrel grenade launcher
  thump() { tn(0.12, 'sine', 180, 60, 0.5); nz(0.1, 'lowpass', 800, 200, 0.3); },
  // d: how far off it went up, r: how big it was (explosive rounds are small ones)
  boom(d, r) { if (playS(d > 22 ? 'boom_far' : 'boom_close', { vol: clamp(1.25 - (d || 0) / 30, 0.5, 1) * clamp((r || 3) / 3, 0.45, 1), jit: 0.06, verb: indoors() && d < 8 ? 0.4 : 0 })) return; nz(1.1, 'lowpass', 1600, 60, 1.0); tn(0.6, 'sine', 70, 25, 0.9); },
  // drawing a weapon: a blade comes out of its sheath, anything else is just taken in hand
  equip() {
    const D = W(curId()) || {};
    if (playS(D.melee && !D.blunt ? (D.two && D.style === 'slash' ? 'draw_blade' : 'draw_knife') : 'equip', { jit: 0.05 })) return;
    SFX.click();
  },
  cylOpen() { if (!playS('safety_2', { rate: 0.8 })) SFX.click(); },   // a revolver's cylinder swung out
  gunDrop() { if (!playS('gun_drop')) SFX.thud(); },                     // your weapon falling from your hands
  pickGun() { if (!playS('equip')) SFX.pick(); },                        // a weapon picked up off the ground
  crate() { if (!playS('crate_open')) SFX.upgrade(); },                  // a supply crate prised open
  craft() { if (!playS('craft')) SFX.board(); },                         // something made at a station
  groan(v) {
    if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.value = rr(65, 95); l.frequency.value = rr(4, 7); lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 1.2); l.stop(t + 1.2);
  },
  wave() { tn(1.4, 'sine', 98, 92, 0.25); tn(1.4, 'sine', 147, 139, 0.12); },
  cleared() { tn(0.9, 'sine', 196, 196, 0.12); setTimeout(() => tn(1.2, 'sine', 294, 294, 0.1), 180); }
};
let pumpV = '';   // which recording of a pump the rack in progress is (its back and its home are a pair)
const GUN_SFX = { pistol: 'light', revolver: 'heavy', deagle: 'heavy', pump: 'shotgun', dbl: 'shotgun', auto12: 'shotgun', hunting: 'rifle', smg: 'auto', sub: 'auto', ar: 'rifle', lmg: 'rifle' };
