// Carrying and applying bandages, healing over time.

const BAND_MAX = 5, BAND_TIME = 2.4, BAND_HEAL = 25, HEAL_RATE = 4.5;
// medicine cabinet upgrades: steadier hands wrap faster, better dressings heal more, a tonic heals quicker
const MED_UP = {
  hands: { max: 3, cost: [8, 14, 22], name: 'Steady hands', desc: n => `Bandages go on ${Math.round((1 - 0.78) * 100)}% faster (${bandTime(n).toFixed(1)}s → ${bandTime(n + 1).toFixed(1)}s)` },
  dress: { max: 3, cost: [10, 16, 26], name: 'Better dressings', desc: n => `Each bandage heals ${bandHeal(n + 1) - bandHeal(n)} more (${bandHeal(n)} → ${bandHeal(n + 1)} health)` },
  tonic: { max: 3, cost: [10, 16, 26], name: 'Clotting tonic', desc: n => `Bandages heal ${Math.round((1.4 - 1) * 100)}% quicker (${healRate(n).toFixed(1)} → ${healRate(n + 1).toFixed(1)} health a second)` }
};
const medT = k => (S.med && S.med[k]) || 0;
function bandTime(n = medT('hands')) { return BAND_TIME * Math.pow(0.78, n); }
function bandHeal(n = medT('dress')) { return BAND_HEAL + 12 * n; }
function healRate(n = medT('tonic')) { return HEAL_RATE * Math.pow(1.4, n); }
function startBandage() {
  if (P.dead || P.vault || P.bandT > 0 || openSt) return;
  if (!(P.band > 0)) { toast('No bandages', { kind: 'bad', icon: 'med', sub: 'Buy them at the medicine cabinet' }); return; }
  if (P.hp >= S.maxHp && !(P.bleed > 0)) { toast('Not hurt', { kind: 'info', icon: 'med', sub: 'Save your bandages for later' }); return; }
  exitScope(); W8.reloading = null; W8.burstLeft = 0; W8.swing = 0;
  P.bandT = P.bandMax = bandTime(); SFX.rip();
}
function tickBandage(dt) {
  if (P.bandT > 0) {
    P.bandT -= dt;
    const wr = 0.45 * bandTime() / BAND_TIME;
    if (Math.floor((P.bandT + dt) / wr) !== Math.floor(P.bandT / wr)) SFX.wrap();
    if (P.bandT <= 0) { const h = bandHeal(); P.bandT = 0; P.band--; P.heal = (P.heal || 0) + h; P.bleed = 0; feed('med', h, 'health over time'); popEl('bands'); }
  }
  if (P.heal > 0 && !P.dead) { const r = healRate(), h = Math.min(P.heal, dt * r, S.maxHp - P.hp); P.hp += h; P.heal -= Math.max(h, dt * r * (P.hp >= S.maxHp ? 1 : 0)); if (P.heal < 0.01) P.heal = 0; }
}
