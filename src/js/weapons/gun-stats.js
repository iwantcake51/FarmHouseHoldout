// Gun stats, and the combined weapon table WEAP.

// Guns: damage, fire rate, magazine, reload, spread, recoil, starting ammo, rarity in the upgrade pool.
const GUN_WEAPONS = {
  pistol: { slot: 'side', ammo: 'p9', name: '9mm pistol', short: '9mm', dmg: 27, rate: 0.21, mag: 13, reload: 1.15, spread: 0.03, kick: 1.4, shake: 0.08, start: 65 },
  revolver: { slot: 'side', ammo: 'magnum', name: '.357 revolver', short: '.357', dmg: 64, rate: 0.42, mag: 6, reload: 1.8, perShell: 0.3, spread: 0.015, kick: 3, shake: 0.16, pierce: 1, start: 18, rar: 'u', desc: 'Six heavy rounds. Each one goes through a zombie.' },
  deagle: { slot: 'side', ammo: 'magnum', name: '.50 hand cannon', short: '.50', dmg: 100, rate: 0.5, mag: 7, reload: 1.6, spread: 0.02, kick: 4.5, shake: 0.24, pierce: 2, start: 21, rar: 'e', desc: 'Absurd stopping power from a handgun.' },
  pump: { slot: 'long', ammo: 'shells', name: 'Pump shotgun', short: 'Pump', dmg: 15, rate: 0.78, mag: 6, perShell: 0.42, spread: 0.3, pellets: 8, kick: 2.6, shake: 0.28, start: 18, rar: 'c', desc: 'Eight pellets a shell. Tears limbs off up close.' },
  dbl: { slot: 'long', ammo: 'shells', name: 'Double barrel', short: 'Double', dmg: 17, rate: 0.26, mag: 2, perShell: 0.5, spread: 0.36, pellets: 9, kick: 3, shake: 0.32, start: 16, rar: 'c', desc: 'Two quick, brutal shots, then two shells in.' },
  auto12: { slot: 'long', ammo: 'shells', name: 'Drum shotgun', short: 'Drum SG', dmg: 14, rate: 0.19, mag: 20, reload: 2.6, spread: 0.3, pellets: 7, kick: 2.2, shake: 0.22, start: 40, rar: 'l', desc: 'A fully automatic shotgun with a 20-shell drum.' },
  hunting: { slot: 'long', ammo: 'rifle', name: 'Hunting rifle', short: 'Rifle', dmg: 130, rate: 1.0, mag: 5, perShell: 0.45, spread: 0.006, kick: 4, shake: 0.25, pierce: 3, start: 20, rar: 'u', desc: 'Bolt action. One round goes through four zombies.' },
  smg: { slot: 'auto', ammo: 'p9', name: 'Machine pistol', short: 'Auto', dmg: 17, rate: 0.085, mag: 30, reload: 1.5, spread: 0.08, kick: 0.7, shake: 0.06, start: 90, rar: 'u', desc: 'Fully automatic. Sprays more than it aims.' },
  sub: { slot: 'auto', ammo: 'p9', name: 'Submachine gun', short: 'SMG', dmg: 23, rate: 0.075, mag: 32, reload: 1.7, spread: 0.05, kick: 0.9, shake: 0.06, start: 120, rar: 'r', desc: 'Accurate automatic fire with a folding stock.' },
  ar: { slot: 'auto', ammo: 'rifle', name: 'Assault rifle', short: 'AR', dmg: 36, rate: 0.1, mag: 30, reload: 2.0, spread: 0.035, kick: 1.4, shake: 0.08, pierce: 1, start: 90, rar: 'r', desc: 'Rifle rounds on full auto.' },
  lmg: { slot: 'auto', ammo: 'rifle', name: 'Light machine gun', short: 'LMG', dmg: 38, rate: 0.07, mag: 100, reload: 4.2, spread: 0.07, kick: 1.6, shake: 0.1, pierce: 1, start: 200, slow: 0.82, rar: 'l', desc: 'A hundred-round belt. You walk slower carrying it.' }
};
// every weapon in the game, melee first, keyed by id
const WEAP = Object.assign({}, MELEE_WEAPONS, GUN_WEAPONS);
