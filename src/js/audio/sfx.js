// Every sound effect. Most play a recording (audio/samples.js), and the synthesized sound written after it plays
// instead until that recording has loaded; the rest (footsteps, vaulting, zombies, the UI) are only synthesized.

import { RIGHT } from '../core/renderer.js';
import { clamp, rand, rr } from '../core/math.js';
import { P } from '../player/player.js';
import { curId, W, W8 } from '../game/run-state.js';
import { AC, master, muff, noiseBuf, nz, SND_AT, tn } from './audio.js';
import { earFrom, earOut } from './spatial.js';
import { echoSet, gunKind, indoors, playS, SUPP_SFX } from './samples.js';
import { camFocus } from '../net/spectate.js';

// the brute's wall crash (SFX.bruteWall): how far off it's still heard (m), how loud, the lowpass on its body near and
// at that distance (Hz), and its crack: how loud, its highpass and lowpass (Hz) and how long (s)
// how far the gore's sounds (flesh hits, headshots, limbs off, heads popped, crushed or split) wander in pitch, either way,
// so no two kills sound alike
const GORE_JIT = 0.14;
const BRUTE_CRASH = { far: 26, vol: 0.6, lp: [2600, 450], crack: 0.4, hp: 2200, crackLp: 9000, crackDur: 0.09 };
// a suppressor's sound by its step (1, 2, 3): how loud, its pitch, its highpass (Hz: the boom trimmed off), its top (a
// share of the lowpass), and how much the room and the farm give back
const SUPP_SND = [{ vol: 1, rate: 1, hp: 0, lp: 1, verb: 1, echo: 1 }, { vol: 0.78, rate: 1.05, hp: 110, lp: 0.85, verb: 0.8, echo: 0.7 }, { vol: 0.6, rate: 1.1, hp: 200, lp: 0.72, verb: 0.62, echo: 0.45 }];
// the MP5 with the 10mm kit: pitched down, a low shelf under it ([Hz, dB]), a little louder, a little more echo
const TENMM_SND = { rate: 0.89, low: [180, 6], vol: 1.1, echo: 1.15 };
// a wave's sting (SFX.wave): a semitone higher every so many waves, a drum beat more every so many, the most beats, and
// the time between them (ms)
const WAVE_STING = { every: 3, beatEvery: 4, maxBeats: 4, beat: 380 };
// the zombies' voices (SFX.groan), by kind: their pitch range (Hz, before the zombie's own: p), where it goes by the end
// (bend: times it), its wobble (Hz, and how deep, a share of the pitch), the throat (lowpass, Hz and Q), how loud, the
// attack and the length (s), and the breath under it (how loud, the band's middle in Hz)
const VOICE = {
  walker: { f: [62, 92], bend: 0.85, wob: [4, 7], wobK: 0.1, lp: 420, q: 1, vol: 0.14, att: 0.2, dur: 1.1, breath: 0.03, bf: 500 },
  runner: { f: [150, 210], bend: 1.35, wob: [9, 14], wobK: 0.08, lp: 1500, q: 3, vol: 0.12, att: 0.05, dur: 0.6, breath: 0.09, bf: 1800 },
  brute: { f: [40, 52], bend: 0.7, wob: [3, 5], wobK: 0.14, lp: 300, q: 2, vol: 0.3, att: 0.12, dur: 1.5, breath: 0.08, bf: 320 },
  spitter: { f: [90, 120], bend: 0.9, wob: [12, 18], wobK: 0.2, lp: 650, q: 4, vol: 0.12, att: 0.1, dur: 0.9, breath: 0.07, bf: 900 },
  die: { f: [70, 100], bend: 0.45, wob: [5, 8], wobK: 0.12, lp: 520, q: 1.5, vol: 0.13, att: 0.03, dur: 0.75, breath: 0.05, bf: 600 }
};
export const SFX = {
  light() { nz(0.2, 'lowpass', 3200, 260, 0.75); tn(0.13, 'sine', 150, 45, 0.6); },
  heavy() { nz(0.32, 'lowpass', 2600, 180, 0.9); tn(0.22, 'sine', 120, 38, 0.8); },
  shotgun() { nz(0.45, 'lowpass', 2200, 140, 0.95); tn(0.28, 'sine', 110, 32, 0.85); },
  auto() { nz(0.09, 'lowpass', 3600, 500, 0.45); tn(0.06, 'sine', 170, 60, 0.35); },
  rifle() { nz(0.4, 'lowpass', 4200, 200, 0.95); tn(0.2, 'sine', 160, 40, 0.7); },
  // a shot: the gun's one recording, a little different every time (its pitch and speed, its tone, how loud it is and
  // where it sits left to right); inside the farmhouse the room rings with it, harder for the big ones, and wherever you
  // are it echoes back off the farm (a heavy round more, a suppressed one barely: FAR_ECHO, audio/samples.js), dull
  // through the walls when you're in
  // A suppressor's every step makes it quieter, a touch higher and tighter: less of the low boom, the top softened, less
  // ring in the room and off the farm (SUPP_SND, by the gun's suppressor line; a gun quiet of itself counts as the first).
  // The MP5's 10mm kit is a heavier, deeper bark: pitched down with more bass under it (TENMM_SND)
  fire(id, quiet, shells) {
    const inside = indoors(), big = shells || id === 'deagle' || id === 'hunting' || id === 'scar' || id === 'lmg', D = W(id) || {};
    const sp = quiet ? SUPP_SND[clamp(((W8.gt[id] || {}).supp | 0) || 1, 1, 3) - 1] : null, ten = D.tenmm ? TENMM_SND : null;
    const verb = inside ? (quiet ? 0.36 * sp.verb : big ? 0.9 : 0.74) : 0;
    echoSet(inside);
    if (playS(quiet ? SUPP_SFX[id] : 'shot_' + id, { jit: 0.065, tone: 3.5, lp: rr(7500, 20000) * (sp ? sp.lp : 1), hp: sp ? sp.hp : 0, pan: rr(-0.12, 0.12), verb,
      echo: (quiet ? 0.06 * sp.echo : big ? 0.55 : 0.4) * (ten ? ten.echo : 1), rate: (sp ? sp.rate : 1) * (ten ? ten.rate : 1), vol: (sp ? sp.vol : 1) * (ten ? ten.vol : 1), low: ten ? ten.low : null })) return;
    if (quiet) SFX.supp(shells); else SFX[GUN_SFX[id]]();
  },
  dry() { if (!playS('dry_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) SFX.click(); },   // the trigger on an empty gun
  supp(big) { nz(big ? 0.2 : 0.08, 'bandpass', 1800, 700, big ? 0.5 : 0.3, 1.2); tn(0.05, 'sine', 120, 60, 0.2); },
  tick() { if (playS(['flesh_1', 'flesh_2', 'flesh_3', 'flesh_4'], { gap: 0.035, jit: GORE_JIT })) return; tn(0.035, 'square', 2300, 1900, 0.07); nz(0.05, 'lowpass', 900, 200, 0.26); tn(0.06, 'sine', 160, 70, 0.2); },
  headHit() { if (playS('head_hit', { gap: 0.05, rate: 1.1, jit: GORE_JIT })) return; tn(0.05, 'triangle', 1700, 1100, 0.09); nz(0.04, 'bandpass', 2600, 1400, 0.14, 3); },
  shove(stab) { if (playS(['swing_light_1', 'swing_light_2'], { rate: 1.1 })) return; nz(0.16, 'bandpass', 380, 1700, 0.42, 1.2); tn(0.08, 'sine', 140, 70, 0.18); if (stab) nz(0.09, 'highpass', 3200, 2400, 0.16); },
  sever() { if (playS('sever', { gap: 0.06, jit: GORE_JIT })) return; nz(0.18, 'bandpass', 700, 200, 0.5, 2); tn(0.08, 'triangle', 200, 80, 0.25); },
  // a skull caving in under the sledgehammer: a sharp crack, a deep wet crunch, then the spatter
  crush() { const f = rr(1 - GORE_JIT, 1 + GORE_JIT); nz(0.07, 'bandpass', 1900 * f, 600 * f, 0.6, 1.4); tn(0.14, 'sine', 120 * f, 42 * f, 0.6); setTimeout(() => nz(0.24, 'lowpass', 1200 * f, 180 * f, 0.5, 1), 20); setTimeout(() => nz(0.18, 'bandpass', 2600 * f, 900 * f, 0.22, 1.8), 60); },
  // a skull split by the fire axe: a hard crack of bone, then a wet tearing as it comes apart
  split() { const f = rr(1 - GORE_JIT, 1 + GORE_JIT); nz(0.06, 'bandpass', 2400 * f, 800 * f, 0.55, 1.6); tn(0.1, 'sine', 160 * f, 55 * f, 0.45); setTimeout(() => nz(0.22, 'bandpass', 900 * f, 240 * f, 0.4, 1.2), 25); },
  // a zombie's skull bursting: a kill through the head (zombies/damage.js killEnd), from the zombie, at v
  headPop(v = 1) { if (playS(['head_pop', 'head_pop_2'], { gap: 0.05, rate: 1.12, vol: v, jit: GORE_JIT })) return; nz(0.12, 'bandpass', 900, 260, 0.5 * v, 1.6); tn(0.05, 'triangle', 760, 240, 0.14 * v); setTimeout(() => nz(0.16, 'lowpass', 1400, 300, 0.22 * v, 1), 30); },
  // a brute's dash ending in a wall (zombies/brute-dash.js), heard from where it hit (soundAt): a muffled crash with a
  // crisp crack on the front of it, both quieter and duller the further off it is and gone by BRUTE_CRASH.far (the
  // crack, all top, fades out sooner); off to its side, and muffled again through the house's walls
  bruteWall() {
    const at = SND_AT, f = typeof camFocus === 'function' ? camFocus() : P, C = BRUTE_CRASH;
    const dx = at ? at.x - f.x : 0, dz = at ? at.z - f.z : 0, k = clamp(Math.hypot(dx, dz) / C.far, 0, 1); if (k >= 1) return;
    const v = Math.pow(1 - k, 1.6), pan = clamp((dx * RIGHT.x + dz * RIGHT.z) / 14, -0.6, 0.6);
    if (!playS('brute_wall', { jit: 0.05, vol: C.vol * v, lp: C.lp[0] * Math.pow(C.lp[1] / C.lp[0], k), pan, gap: 0 })) { SFX.thud(); return; }
    playS('brute_wall', { jit: 0.02, vol: C.crack * v * (1 - k), hp: C.hp, lp: C.crackLp * Math.pow(0.4, k), dur: C.crackDur, pan, gap: 0 });
  },
  thud() { tn(0.12, 'sine', 110, 45, 0.45); nz(0.07, 'lowpass', 900, 200, 0.3); },
  // can't have it (not enough scrap, not ready yet): a short dull two-note "nuh-uh", down, not the click of opening
  deny() { tn(0.07, 'triangle', 240, 210, 0.16); setTimeout(() => tn(0.11, 'triangle', 180, 150, 0.16), 85); nz(0.04, 'lowpass', 700, 300, 0.08); },
  board() { if (playS(['wood_hit_1', 'wood_hit_2'], { jit: 0.06 })) return; tn(0.05, 'square', 230, 140, 0.16); nz(0.05, 'highpass', 2400, 1800, 0.2); },
  crack() { if (playS('wood_break', { gap: 0.1 })) return; nz(0.32, 'bandpass', 1100, 260, 0.55, 1.4); tn(0.08, 'triangle', 300, 90, 0.2); },
  // a board torn off hitting the ground: a hollow wooden clack
  // steel: a blow on a grate ringing (v: how hard), a bar snapping off its weld, a piece of it hitting the ground
  clang(v = 0.6) { const f = rr(0.9, 1.12); tn(0.22, 'triangle', 410 * f, 330 * f, 0.13 * v); tn(0.32, 'sine', 1180 * f, 1100 * f, 0.045 * v); tn(0.18, 'square', 2310 * f, 2200 * f, 0.012 * v); nz(0.07, 'bandpass', 3200 * f, 1600, 0.2 * v, 2.4); nz(0.05, 'lowpass', 600, 140, 0.18 * v); },
  // armour on a zombie: a chip off it (half worn through) and the crack as it breaks off (zombies/armor-break.js); steel
  // (a helmet, a plate) rings, a hard hat or a vest's plastic and nylon just snaps
  armorChip(metal) { nz(0.03, 'highpass', 4200, 3000, 0.18, 1); if (metal) tn(0.08, 'triangle', rr(1300, 1500), 900, 0.05); else tn(0.04, 'triangle', rr(700, 900), 400, 0.06); },
  armorCrack(metal) { const f = rr(0.92, 1.08); nz(0.04, 'highpass', 5200 * f, 3400, 0.4, 1); nz(0.14, 'bandpass', 1900 * f, 700, 0.42, 2.2); tn(0.07, 'triangle', 380 * f, 120, 0.2);
    if (metal) { SFX.snapMetal(); SFX.clang(0.5); } else setTimeout(() => nz(0.08, 'bandpass', 2600 * f, 1200, 0.22, 1.6), 25); },
  snapMetal() { nz(0.05, 'highpass', 4200, 2600, 0.3, 1); tn(0.12, 'triangle', rr(700, 820), 260, 0.14); setTimeout(() => tn(0.3, 'sine', rr(1500, 1700), 1450, 0.05), 20); },
  metalDrop(v, plate) { const f = rr(0.85, 1.15) * (plate ? 0.8 : 1.3); tn(0.16, 'triangle', 520 * f, 360 * f, 0.12 * v); tn(0.24, 'sine', 1400 * f, 1300 * f, 0.04 * v); nz(0.06, 'bandpass', 2600 * f, 1300, 0.18 * v, 2.2); },
  plankDrop(v) { if (playS(['wood_hit_1', 'wood_hit_2'], { vol: 0.55 * v, rate: 1.15, gap: 0.04 })) return; tn(0.09, 'triangle', rr(190, 240), 110, 0.22 * v); nz(0.07, 'bandpass', 900, 400, 0.25 * v, 1.6); },
  click() { tn(0.03, 'square', 1300, 900, 0.1); },
  // a fresh mag's top knocking the magwell's lip as it misses the well (weapons/reload.js: MAG_MISS): a short, quieter,
  // higher knock than going home, and a dry scrape after it
  magTap() { const f = rr(0.92, 1.08); if (!playS('magin_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()), { vol: 0.32, rate: 1.35 * f, gap: 0.05 })) { tn(0.03, 'triangle', 760 * f, 420, 0.1); nz(0.03, 'bandpass', 1900 * f, 900, 0.14, 2.4); } setTimeout(() => nz(0.05, 'bandpass', 2600 * f, 1400, 0.05, 1.6), 35); },
  magOut() { if (playS('magout_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) return; tn(0.04, 'square', 900, 600, 0.1); nz(0.05, 'bandpass', 1500, 900, 0.15, 2); },
  magIn() { if (playS('magin_' + (gunKind() === 'shotgun' ? 'rifle' : gunKind()))) return; tn(0.05, 'square', 600, 400, 0.14); nz(0.06, 'bandpass', 1200, 700, 0.2, 2); },
  shell() { const id = curId(); if (id === 'hunting' || id === 'revolver' ? playS('round_in', { gap: 0.03, rate: id === 'revolver' ? 1.25 : 1, vol: id === 'revolver' ? 0.8 : 1 }) : playS('shell_load', { gap: 0.03 })) return; tn(0.04, 'square', 700, 500, 0.12); nz(0.07, 'bandpass', 2200, 1200, 0.22, 3); },
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
  hitBlunt(big) { if (playS(big ? ['hit_blunt_big_1', 'hit_blunt_big_2'] : ['hit_blunt_1', 'hit_blunt_2'], { jit: GORE_JIT, gap: 0.04 })) return; tn(big ? 0.18 : 0.13, 'sine', big ? 85 : 110, 38, 0.62); nz(0.1, 'lowpass', 800, 140, 0.5); nz(0.045, 'bandpass', 1900, 800, 0.26, 2); setTimeout(() => nz(0.05, 'bandpass', 1300, 600, 0.14, 2.5), 30); },
  hitBlade(chop) { if (playS(chop ? ['hit_chop_1', 'hit_chop_2'] : ['hit_blade_1', 'hit_blade_2'], { jit: GORE_JIT, gap: 0.04 })) return; nz(0.11, 'bandpass', 5200, 1700, 0.36, 3); tn(0.22, 'sine', 2600, 2540, 0.045); setTimeout(() => nz(0.16, 'bandpass', 700, 260, 0.32, 1.6), 22); if (chop) tn(0.12, 'sine', 150, 60, 0.42); },
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
  // a curse taken: no reward chime but a low, sour slide down (a tritone, sliding apart) over a dull rumble
  curse() { tn(0.7, 'sawtooth', 196, 92, 0.05); tn(0.7, 'sawtooth', 277, 125, 0.04); nz(0.6, 'lowpass', 380, 90, 0.18); setTimeout(() => tn(0.5, 'sine', 70, 48, 0.22), 120); },
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
  crate() { if (!playS('crate_open')) SFX.upgrade(); },                  // a supply crate prised open
  craft() { if (!playS('craft')) SFX.board(); },                         // something made at a station
  // the bass under a brute's footfall (audio/footsteps.js): a deep sine dropping away under a low rumble of the ground
  bruteStomp(v) { if (v < 0.01) return; tn(0.34, 'sine', 68, 30, 0.55 * v); tn(0.16, 'triangle', 110, 45, 0.22 * v); nz(0.22, 'lowpass', 260, 60, 0.4 * v, 0.7); },
  // a zombie's voice (zombies/ai.js, spawn.js, brute-dash.js, damage.js), at v, in its own pitch (p: zombies/spawn.js)
  // and by its kind (VOICE): a walker's low moan, wavering; a sprinter's ragged shriek, high and climbing; a brute's roar,
  // deep, long and rasping; a spitter's wet gurgle; and the last breath going out of one as it dies ('die'), falling
  // away. A sawtooth through a throat (a lowpass, and a band of breath noise over it), from where the zombie is
  // (soundAt): quieter and off to its side with distance, muffled through the house's walls
  groan(v, p = 1, kind = 'walker') {
    if (!AC || v < 0.01) return; const V = VOICE[kind] || VOICE.walker, t = AC.currentTime, d = V.dur * rr(0.85, 1.2);
    const e = SND_AT && earFrom(SND_AT.x, SND_AT.z, SND_AT.w), out = AC.createGain(); out.gain.value = v * (e ? e.vol : 1); out.connect(e ? earOut(e) : master);
    const o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), f = AC.createBiquadFilter(), g = AC.createGain(), f0 = rr(V.f[0], V.f[1]) * p;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * V.bend, t + d);
    l.frequency.value = rr(V.wob[0], V.wob[1]); lg.gain.value = f0 * V.wobK; l.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = V.lp * p; f.Q.value = V.q;
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(V.vol, t + V.att); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); l.start(t); o.stop(t + d + 0.05); l.stop(t + d + 0.05);
    if (V.breath) {   // the breath through it: noise in a band round the voice
      const s = AC.createBufferSource(), bf = AC.createBiquadFilter(), bg = AC.createGain(); s.buffer = noiseBuf; bf.type = 'bandpass'; bf.frequency.value = V.bf * p; bf.Q.value = 1.4;
      bg.gain.setValueAtTime(0.001, t); bg.gain.linearRampToValueAtTime(V.breath, t + V.att); bg.gain.exponentialRampToValueAtTime(0.001, t + d);
      s.connect(bf); bf.connect(bg); bg.connect(out); s.start(t, rand() * 0.5); s.stop(t + d + 0.05);
    }
  },
  // how a kill sounds, by what made it (zombies/damage.js killEnd), from the zombie, at v: through the head the skull
  // bursting; through the body it giving way, with a deep thud under it as it drops; a blade's or a club's a heavier
  // one; a burning one a hiss as it goes; one bled out or blown apart a softer one (a blast's own roar and the
  // severing are heard already). Each of four recordings, wandering in pitch (GORE_JIT), so no two sound alike
  kill(kind, v = 1, p = 1) {
    if (kind === 'head') { SFX.headPop(v); return; }
    if (kind !== 'blast' && rand() < 0.55) SFX.groan(v * 0.9, p, 'die');   // (its last breath, most of the time)
    const k = kind === 'melee' ? 1.15 : kind === 'bleed' || kind === 'blast' ? 0.6 : 1;
    if (!playS(['kill_1', 'kill_2', 'kill_3', 'kill_4'], { gap: 0.04, jit: GORE_JIT, vol: v * k, rate: kind === 'melee' ? 0.9 : 1 })) nz(0.16, 'lowpass', 900, 160, 0.4 * v * k, 1);
    tn(0.16, 'sine', rr(85, 105), 38, 0.22 * v * k);
    if (kind === 'burn') nz(0.5, 'highpass', 2600, 5200, 0.12 * v, 0.7);
  },
  // the tick on your crosshair as a kill of yours lands (zombies/damage.js): a short bright note, higher through the head,
  // stepping up a semitone with each kill in a chain (up to an octave), so a run of them climbs
  killTick(head, chain) { const f = (head ? 1760 : 1320) * Math.pow(2, Math.min(12, Math.max(0, chain - 1)) / 12); tn(0.07, 'sine', f, f * 0.98, 0.06); tn(0.05, 'triangle', f * 2, f * 1.9, 0.02); },
  // a wave coming (waves/waves.js): a low drone and its fifth, climbing a semitone every WAVE_STING.every waves (up to an
  // octave) so the night gets tenser as it goes, with a slow drum under it, a beat more each few waves; a hard one (a
  // twist, the brutes, a fog round) takes a tritone over it instead of the fifth and a rising hiss of breath
  wave(n = 1, hard = false) {
    const k = Math.pow(2, Math.min(12, Math.floor((n - 1) / WAVE_STING.every)) / 12), f = 98 * k;
    tn(1.4, 'sine', f, f * 0.94, 0.25); tn(1.4, 'sine', f * (hard ? 1.414 : 1.5), f * (hard ? 1.33 : 1.42), hard ? 0.1 : 0.12);
    const beats = Math.min(WAVE_STING.maxBeats, 1 + Math.floor(n / WAVE_STING.beatEvery));
    for (let b = 0; b < beats; b++) setTimeout(() => { tn(0.3, 'sine', 70, 34, 0.42); nz(0.18, 'lowpass', 420, 90, 0.3, 0.9); }, b * WAVE_STING.beat);
    if (hard) nz(1.3, 'bandpass', 600, 2400, 0.07, 2);
  },
  // a wave cleared: two notes rising, a third over them every fifth wave or after a twist
  cleared(n = 1, big = false) {
    tn(0.9, 'sine', 196, 196, 0.12); setTimeout(() => tn(1.2, 'sine', 294, 294, 0.1), 180);
    if (big || n % 5 === 0) setTimeout(() => tn(1.5, 'sine', 392, 392, 0.09), 380);
  }
};
let pumpV = '';   // which recording of a pump the rack in progress is (its back and its home are a pair)
const GUN_SFX = { pistol: 'light', revolver: 'heavy', deagle: 'heavy', pump: 'shotgun', dbl: 'shotgun', auto12: 'shotgun', hunting: 'rifle', scar: 'rifle', smg: 'auto', sub: 'auto', ar: 'rifle', lmg: 'rifle' };
