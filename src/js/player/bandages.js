// Carrying and applying bandages, healing over time.

const BAND_BASE = 3, BAND_TIME = 2.4, BAND_HEAL = 25, HEAL_RATE = 4.5;
// how many bandages you can carry: 3 in the pouch on your side, 2 more with the Med pouch upgrade's second pouch
const bandMax = () => BAND_BASE + (S.pouch ? 2 : 0);
// medicine cabinet upgrades: steadier hands wrap faster, better dressings heal more, a tonic heals quicker
const MED_UP = {
  hands: { max: 3, cost: [8, 14, 22], name: 'Steady hands', desc: n => `Bandages go on 22% faster (${bandTime(n).toFixed(1)} s → ${bandTime(n + 1).toFixed(1)} s)` },
  dress: { max: 3, cost: [10, 16, 26], name: 'Better dressings', desc: n => `Bandages heal ${bandHeal(n + 1) - bandHeal(n)} more (${bandHeal(n)} → ${bandHeal(n + 1)})` },
  tonic: { max: 3, cost: [10, 16, 26], name: 'Clotting tonic', desc: n => `Bandages heal 40% quicker (${healRate(n).toFixed(1)} → ${healRate(n + 1).toFixed(1)} health/s)` }
};
const medT = k => (S.med && S.med[k]) || 0;
function bandTime(n = medT('hands')) { return BAND_TIME * Math.pow(0.78, n) * S.bandMul; }
function bandHeal(n = medT('dress')) { return BAND_HEAL + 12 * n; }
function healRate(n = medT('tonic')) { return HEAL_RATE * Math.pow(1.4, n); }
function startBandage() {
  if (P.dead || P.vault || P.bandT > 0 || openSt) return;
  if (!(P.band > 0)) { toast('No bandages', { kind: 'bad', icon: 'med', sub: 'Buy them at the medicine cabinet' }); return; }
  if (P.hp >= S.maxHp && !(P.bleed > 0)) { toast('Not hurt', { kind: 'info', icon: 'med', sub: 'Save your bandages for later' }); return; }
  exitScope(); W8.reloading = null; W8.burstLeft = 0; W8.swing = 0;
  P.bandT = P.bandMax = bandTime(); SFX.rip();
}
// a hit knocks the bandage out of your hands: the wrap stops and the bandage stays in your bag
function interruptBandage() {
  if (!(P.bandT > 0)) return;
  P.bandT = 0; ANIM.healCut = true; SFX.click();   // the view snaps back out of the lean-in (player/hold.js)
  toast('Bandaging interrupted', { kind: 'bad', icon: 'med', sub: 'Getting hit stops the wrap · Q to start again' });
}
// how far the bandage going on has got (0 to 1)
const bandProg = () => P.bandT > 0 ? clamp(1 - P.bandT / (P.bandMax || 1), 0, 1) : 0;
// stopped on purpose (a click, or a weapon key): the bandage is used up and heals for as far as it got (half wound,
// half its healing), and the weapon comes back out (or the one picked, switchSlot) once the hands are down
function cancelBandage() {
  if (!(P.bandT > 0)) return;
  const k = bandProg(), h = Math.round(bandHeal() * k);
  P.bandT = 0; P.band = Math.max(0, (P.band || 0) - 1); ANIM.healCut = true; popEl('bands'); SFX.click();
  if (h > 0) { P.heal = (P.heal || 0) + h; feed('med', h, 'health over time'); }
  toast('Bandage cut short', { kind: 'warn', icon: 'med', sub: `${Math.round(k * 100)}% wrapped · heals ${h} of ${bandHeal()}` });
}
// a weapon key or the touch swap button: during a bandage it cancels it and takes that weapon out instead, carried
// out of where it rides as the hands come down (bandPhases, player/hold.js); otherwise it's an ordinary swap
function switchSlot(s) {
  if (!W8.slot[s]) return;
  if (P.bandT > 0 || ANIM.bandP > 0) { if (P.bandT > 0) cancelBandage(); if (s !== W8.cur) ANIM.bandSwitch = s; return; }
  equip(s);
}
function tickBandage(dt) {
  if (P.bandT > 0) {
    P.bandT -= dt;
    const wr = 0.45 * bandTime() / BAND_TIME;
    if (Math.floor((P.bandT + dt) / wr) !== Math.floor(P.bandT / wr)) SFX.wrap();
    if (P.bandT <= 0) { const h = bandHeal(); P.bandT = 0; P.band--; P.heal = (P.heal || 0) + h; P.bleed = 0; P.wraps = (P.wraps || 0) + 1; feed('med', h, 'health over time'); popEl('bands'); }   // and it stays on your arm
  }
  if (P.heal > 0 && !P.dead) { const r = healRate(), h = Math.min(P.heal, dt * r, S.maxHp - P.hp); P.hp += h; P.heal -= Math.max(h, dt * r * (P.hp >= S.maxHp ? 1 : 0)); if (P.heal < 0.01) P.heal = 0; }
}
