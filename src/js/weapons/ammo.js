// Ammo names, damage drop-off with range, and how much ammo drops give.

const AMMO_NAME = { p9: '9mm', magnum: 'magnum', shells: 'shells', rifle: 'rifle rounds' };
// [full damage out to, reaches the floor at, floor multiplier]
const FALLOFF = { pistol: [4, 12, 0.32], smg: [5, 14, 0.45], sub: [6, 15, 0.48], revolver: [7, 18, 0.36], deagle: [8, 20, 0.24], pump: [5, 13, 0.6], dbl: [5, 13, 0.6], auto12: [5, 13, 0.6], ar: [9, 20, 0.6], lmg: [9, 20, 0.58] };
const AMMO_REF = { p9: 13, magnum: 7, shells: 6, rifle: 12 };
function ammoAmt(a) {
  let mx = 0; for (const sl of SLOTS) { const id = W8.slot[sl]; if (id && W(id).ammo === a) mx = Math.max(mx, magSize(id)); }
  return Math.round(AMMO_DROP[a] * (mx ? clamp(Math.sqrt(mx / AMMO_REF[a]), 1, 2.4) : 1));
}
const falloff = (id, t) => { const F = FALLOFF[id]; if (!F || t <= F[0]) return 1; return t >= F[1] ? F[2] : 1 - (1 - F[2]) * (t - F[0]) / (F[1] - F[0]); };
const AMMO_DROP = { p9: 17, magnum: 6, shells: 6, rifle: 15 }, AMMO_CAN = { p9: 64, magnum: 18, shells: 18, rifle: 45 };
