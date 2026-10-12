// Carrying and applying bandages, healing over time.

const BAND_MAX = 5, BAND_TIME = 2.4, BAND_HEAL = 25;
function startBandage() {
  if (P.dead || P.vault || P.bandT > 0 || openSt) return;
  if (!(P.band > 0)) { toast('No bandages. Buy them at the medicine cabinet.'); return; }
  if (P.hp >= S.maxHp && !(P.bleed > 0)) { toast('You are not hurt.'); return; }
  exitScope(); W8.reloading = null; W8.burstLeft = 0; W8.swing = 0;
  P.bandT = BAND_TIME; SFX.rip();
}
function tickBandage(dt) {
  if (P.bandT > 0) {
    P.bandT -= dt;
    if (Math.floor((P.bandT + dt) / 0.45) !== Math.floor(P.bandT / 0.45)) SFX.wrap();
    if (P.bandT <= 0) { P.bandT = 0; P.band--; P.heal = (P.heal || 0) + BAND_HEAL; P.bleed = 0; feed('med', BAND_HEAL, 'health over time'); popEl('bands'); }
  }
  if (P.heal > 0 && !P.dead) { const h = Math.min(P.heal, dt * 4.5, S.maxHp - P.hp); P.hp += h; P.heal -= Math.max(h, dt * 4.5 * (P.hp >= S.maxHp ? 1 : 0)); if (P.heal < 0.01) P.heal = 0; }
}
