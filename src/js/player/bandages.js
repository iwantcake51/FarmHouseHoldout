// Carrying and applying bandages, healing over time.

import { keyOn } from '../input/keybinds.js';
import { clamp } from '../core/math.js';
import { P } from './player.js';
import { healMul, hpCap, S, W8 } from '../game/run-state.js';
import { openSt } from '../stations/station-ui.js';
import { loopS } from '../audio/samples.js';
import { SFX } from '../audio/sfx.js';
import { exitScope } from './aiming.js';
import { cutReload, equip } from '../weapons/reload.js';
import { runStat } from '../ui/run-stats.js';
import { feed, popEl, toast } from '../ui/hud-text.js';
import { ANIM } from './animation.js';

export const BAND_BASE = 3, BAND_TIME = 2.4, BAND_HEAL = 25, HEAL_RATE = 4.5;
// how long a finished bandage shows on the crosshair at 100% before it goes (ui/crosshair.js): just a blink, so it's
// gone as the bandage is
const BAND_DONE = 0.12;
// a bandage takes only as long as the health you need from it: needing half its healing (what's missing, less any
// healing still to come), it goes on in half the time, whatever upgrades you have; never quicker than BAND_MIN of it
// (just stopping a bleed at full health takes that)
const BAND_MIN = 0.3;
const bandNeed = () => clamp((hpCap() - P.hp - (P.heal || 0)) / (bandHeal() * healMul()), BAND_MIN, 1);
// how many bandages you can carry: 3 in the pouch on your side, 2 more with the Med pouch upgrade's second pouch
export const bandMax = () => BAND_BASE + (S.pouch ? 2 : 0);
// medicine cabinet upgrades: steadier hands wrap faster, better dressings heal more, a tonic heals quicker
export const MED_UP = {
  hands: { max: 3, cost: [8, 14, 22], name: 'Steady hands', desc: n => `Bandages go on 22% faster (${bandTime(n).toFixed(1)} s → ${bandTime(n + 1).toFixed(1)} s)` },
  dress: { max: 3, cost: [10, 16, 26], name: 'Better dressings', desc: n => `Bandages heal ${bandHeal(n + 1) - bandHeal(n)} more (${bandHeal(n)} → ${bandHeal(n + 1)})` },
  tonic: { max: 3, cost: [10, 16, 26], name: 'Clotting tonic', desc: n => `Bandages heal 40% quicker (${healRate(n).toFixed(1)} → ${healRate(n + 1).toFixed(1)} health/s)` }
};
export const medT = k => (S.med && S.med[k]) || 0;
export function bandTime(n = medT('hands')) { return BAND_TIME * Math.pow(0.78, n) * S.bandMul; }
export function bandHeal(n = medT('dress')) { return BAND_HEAL + 12 * n; }
function healRate(n = medT('tonic')) { return HEAL_RATE * Math.pow(1.4, n); }
// what a bandage of h will really heal: no more than you're missing, less what's already on its way in (P.heal), as a
// whole number; it's what the feed says, so one put on when you're only a little hurt doesn't claim its full amount
const bandGot = h => Math.max(0, Math.round(Math.min(h, hpCap() - P.hp - (P.heal || 0))));
export function startBandage() {
  if (P.dead || P.vault || P.bandT > 0 || openSt) return;
  if (!(P.band > 0)) { toast('No bandages', { kind: 'bad', icon: 'med', sub: 'Buy them at the medicine cabinet' }); return; }
  if (P.hp >= hpCap() && !(P.bleed > 0)) { toast('Not hurt', { kind: 'info', icon: 'med', sub: 'Save your bandages for later' }); return; }
  exitScope(); cutReload(); W8.burstLeft = 0; W8.swing = 0;
  P.bandT = P.bandMax = bandTime() * bandNeed(); P.bandBleed = P.bleed > 0; ANIM.bandDone = 0;
  bandSnd = loopS('medkit', { rate: bandRate() }); if (!bandSnd) SFX.rip();   // its sound goes round till it's on (bandSound)
  P.bleed = 0;   // pressing the bandage on stops the bleeding straight away, even if it isn't finished
}
// a hit knocks the bandage out of your hands: the wrap stops and the bandage stays in your bag
export function interruptBandage() {
  if (!(P.bandT > 0)) return;
  P.bandT = 0; ANIM.healCut = true; SFX.click(); bandSound(BAND_FADE.hit);   // the view snaps back out of the lean-in (player/hold.js)
  toast('Bandaging interrupted', { kind: 'bad', icon: 'med', sub: `Getting hit stops the wrap · ${keyOn('bandage')} to start again` });
}
// how far the bandage going on has got (0 to 1)
export const bandProg = () => P.bandT > 0 ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : 0;
// stopped on purpose (a click, or a weapon key): the bandage is used up and heals for as far as it got (half wound,
// half its healing), and the weapon comes back out (or the one picked, switchSlot) once the hands are down
export function cancelBandage() {
  if (!(P.bandT > 0)) return;
  const k = bandProg(), h = Math.round(bandHeal() * k);
  P.bandT = 0; P.band = Math.max(0, (P.band || 0) - 1); ANIM.healCut = true; popEl('bands'); SFX.click(); bandSound(BAND_FADE.cancel);
  if (h > 0) { const got = bandGot(h); P.heal = (P.heal || 0) + h; if (got > 0) feed('med', got, 'health over time'); }   // just the heal in the feed, no warning
}
// a weapon key or the touch swap button: during a bandage it cancels it and takes that weapon out instead, carried
// out of where it rides as the hands come down (bandPhases, player/hold.js); otherwise it's an ordinary swap
export function switchSlot(s) {
  if (!W8.slot[s]) return;
  if (P.bandT > 0 || ANIM.bandP > 0) { if (P.bandT > 0) cancelBandage(); if (s !== W8.cur) ANIM.bandSwitch = s; return; }
  equip(s);
}
// the bandage's sound, looping while it goes on (loopS, audio/samples.js), and eased out however it ends: finished
// (BAND_FADE.done), knocked out of your hands by a hit (.hit), stopped with a click or a weapon key (.cancel)
const BAND_FADE = { done: 0.45, hit: 0.18, cancel: 0.25 };
let bandSnd = null;
// how fast the bandage's sound plays: as much faster as the wrap goes on faster than a plain one (Steady hands,
// anything that speeds bandaging), so the sound keeps pace with the hands (held within BAND_RATE)
const BAND_RATE = [0.8, 1.8];
const bandRate = () => clamp(BAND_TIME / bandTime(), BAND_RATE[0], BAND_RATE[1]);
function bandSound(fade) { if (bandSnd) { bandSnd.stop(fade); bandSnd = null; } }
export function tickBandage(dt) {
  if (bandSnd) { if (P.bandT > 0 && !P.dead) bandSnd.tick(); else bandSound(BAND_FADE.done); }
  ANIM.bandDone = Math.max(0, (ANIM.bandDone || 0) - dt);
  if (P.bandT > 0) {
    P.bandT -= dt;
    const wr = 0.45 * bandTime() / BAND_TIME;
    if (Math.floor((P.bandT + dt) / wr) !== Math.floor(P.bandT / wr)) SFX.wrap();
    if (P.bandT <= 0) { const h = bandHeal() * healMul(); P.bandT = 0; P.band--; runStat('bandages'); const got = bandGot(h); P.heal = (P.heal || 0) + h; P.bleed = 0; P.wraps = (P.wraps || 0) + 1; ANIM.bandDone = BAND_DONE; if (got > 0) feed('med', got, 'health over time'); popEl('bands'); }   // and it stays on your arm
    // back to full health before it's on (healing from the last one, or regen): the wrap stops there, done. The bandage
    // goes back in the bag, unless it went on to stop a bleed (then it's on your arm like any other)
    else if (P.hp >= hpCap() && P.bandMax - P.bandT > 0.25) {
      P.bandT = 0; ANIM.bandDone = BAND_DONE;
      if (P.bandBleed) { P.band--; runStat('bandages'); P.wraps = (P.wraps || 0) + 1; popEl('bands'); }
    }
  }
  // healing over time, till you're at full health: then whatever's left of it is gone, and so is its blue
  if (P.heal > 0 && !P.dead) { const h = Math.min(P.heal, dt * healRate(), hpCap() - P.hp); P.hp += h; P.heal -= h; if (P.heal < 0.01 || P.hp >= hpCap()) P.heal = 0; }
}
