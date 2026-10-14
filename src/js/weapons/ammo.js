// Ammo names, damage drop-off with range, and how much ammo drops give.

const AMMO_NAME = { p9: '9mm', magnum: 'magnum', shells: 'shells', rifle: 'rifle rounds' };
// [full damage out to, reaches the floor at, floor multiplier]
const FALLOFF = { pistol: [4, 12, 0.32], smg: [6, 15, 0.5], sub: [10, 22, 0.65], revolver: [10, 22, 0.5], deagle: [8, 20, 0.35], pump: [5, 13, 0.6], dbl: [5, 13, 0.6], auto12: [5, 13, 0.6], ar: [12, 26, 0.65], lmg: [9, 20, 0.58] };
const AMMO_REF = { p9: 13, magnum: 7, shells: 6, rifle: 12 };
// one ammo box or crafted batch; a calibre that feeds more than one of your guns comes in a bit bigger (+20% per extra gun)
function ammoAmt(a) {
  let mx = 0, n = 0; for (const sl of SLOTS) { const id = W8.slot[sl]; if (id && W(id).ammo === a) { mx = Math.max(mx, magSize(id)); n++; } }
  return Math.round(AMMO_DROP[a] * (mx ? clamp(Math.sqrt(mx / AMMO_REF[a]), 1, 2.4) : 1) * (1 + 0.2 * Math.max(0, n - 1)));
}
// a crafted batch for one gun: two ammo boxes' worth, sized to that gun's magazine (a drum shotgun gets more shells
// than a pump). The workbench sells ammo by the gun, so two guns on the same calibre are two batches
const gunBatch = id => { const D = W(id), a = D.ammo; return Math.round(AMMO_DROP[a] * clamp(Math.sqrt(magSize(id) / AMMO_REF[a]), 1, 2.4)) * 2; };
// a longer barrel (D.reach, weapons/gun-mods.js) stretches both ranges by that much and lifts the floor to match
const falloff = (id, t) => {
  const F = FALLOFF[id]; if (!F) return 1;
  const k = (W(id) && W(id).reach) || 1, f0 = F[0] * k, f1 = F[1] * k, fl = 1 - (1 - F[2]) / k;
  return t <= f0 ? 1 : t >= f1 ? fl : 1 - (1 - fl) * (t - f0) / (f1 - f0);
};
const AMMO_DROP = { p9: 15, magnum: 6, shells: 6, rifle: 15 }, AMMO_CAN = { p9: 192, magnum: 54, shells: 54, rifle: 135 };
// ammo boxes dropped by zombies hold about two thirds of a crafted batch (ammoAmt) for each gun you carry, so ammo stays
// tight into the mid waves without running dry
const AMMO_PICKUP_MUL = 0.65;
