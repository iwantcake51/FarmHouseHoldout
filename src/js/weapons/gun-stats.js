// Gun stats, and the combined weapon table WEAP.

// Guns: damage, fire rate, magazine, reload, spread, recoil, starting ammo, rarity in the upgrade pool. Each one does
// something better than the rest, so there's a reason to pick it (its card says what):
//   pistol    the starter: accurate, quick to reload, cheap on ammo
//   revolver  the marksman's handgun, best planted: its six-round cylinder never grows, so it makes up for it in
//             other ways. By far the most accurate handgun, its aim barely opening as you keep firing (sprayK), with
//             the longest reach (FALLOFF); aimed shots often crit (aimCrit, Dead-eye); its round goes through a zombie
//             at full power (pierceKeep); and it's quick to load. But it fires slower, and moving costs it more (mobile)
//   deagle    the brawler: the hardest-hitting handgun and quicker to fire, bigger mags, through two zombies, knocks
//             them back, handles well on the move; but its kick throws quick follow-ups wide (sprayK) and its big
//             rounds lose their punch sooner with range (FALLOFF)
//   smg       the fastest-firing gun, and the one that holds its aim on the move (mobile)
//   sub       the steadiest automatic: tight through long bursts (sprayK) and the longest-reaching 9mm
//   ar        rifle rounds through a zombie at long range, full auto or semi (OWN_MODES, weapons/mod-levels.js)
//   lmg       the most sustained fire: a hundred-round belt, slow to carry
//   pump      the hardest knockback, and it tears limbs off up close
//   dbl       the biggest burst: both barrels as fast as you can pull
//   auto12    an automatic shotgun: a box of 8, or the drum (20) as its one magazine upgrade (MAG_UP). Heavy, like the LMG
//   hunting   one round through four zombies at full power at any range (no drop-off)
//   scar      stopping power: a 7.62 semi-auto (the FN SCAR 17S), between the AR and the hunting rifle a shot. Every
//             hit staggers what it doesn't kill (stagger, seconds), long enough that steady fire keeps a zombie off you,
//             and it's the one gun that staggers a brute too (bruteStagger: enough to break off its charge, brute-dash.js)
//             and hits it harder (bruteX). A box of 10, or the slower-to-change 20. Heavy: slower to walk with, to draw and
//             to bring up after a sprint, and it's no quick-firer for all that
// mobile: how much of the spread and the off-target shots moving costs from the hip (weapons/firing.js); sprayK: how
// fast holding the trigger opens the spread
// heavy: the auto shotgun and the LMG are a handful. fire: how much of your pace holding the trigger takes (it builds
// over the first few shots and eases back once you let go: HEAVY_FIRE); draw: how much longer the swap to it takes, and
// before it can fire (player/swap.js); ready: how much slower it comes back up out of a sprint's low ready, so it's
// longer before it can fire after a run (player/sprint.js); run: how many times the stamina a sprint burns with it in
// your hands (player/sprint.js). Both are looser on the move too (mobile)
// HEAVY_FIRE: how much of a heavy gun's slowdown each shot builds (build), how long after the last shot it holds (hold,
// seconds), and how fast it eases off after that (ease, of the whole a second)
const HEAVY_FIRE = { build: 0.4, hold: 0.25, ease: 1.6 };
const GUN_WEAPONS = {
  pistol: { slot: 'side', ammo: 'p9', name: '9mm pistol', short: '9mm', dmg: 27, rate: 0.21, mag: 13, reload: 1.15, spread: 0.03, kick: 1.4, shake: 0.08, start: 65 },
  revolver: { slot: 'side', ammo: 'magnum', name: '.357 revolver', short: '.357', dmg: 68, rate: 0.42, mag: 6, reload: 1.8, perShell: 0.42, spread: 0.006, kick: 3, shake: 0.16, pierce: 1, pierceKeep: 1, aimCrit: 0.3, sprayK: 0.4, mobile: 1.3, start: 18, rar: 'r', desc: 'The marksman\'s handgun: dead accurate with the longest reach. Aimed shots often crit, each round goes through a zombie at full power, and it\'s the only handgun that takes a scope. Slower to fire than the hand cannon, and slow to load: a round at a time, or six with a speed loader.' },
  deagle: { slot: 'side', ammo: 'magnum', name: '.50 hand cannon', short: '.50', dmg: 100, rate: 0.34, mag: 7, reload: 2.0, spread: 0.024, kick: 6, shake: 0.24, pierce: 2, sprayK: 1.6, mobile: 0.8, start: 21, rar: 'e', desc: 'The brawler: the hardest-hitting handgun, quick to fire, and its rounds go through two zombies and knock them back. The kick throws quick follow-ups wide, and it loses punch at range.' },
  pump: { slot: 'long', ammo: 'shells', name: 'Pump shotgun', short: 'Pump', dmg: 18, rate: 0.7, mag: 6, perShell: 0.42, spread: 0.14, pellets: 8, kick: 3.2, shake: 0.28, start: 20, rar: 'u', desc: 'Eight pellets a shell. Knocks zombies back harder than anything, and tears limbs off up close.' },
  dbl: { slot: 'long', ammo: 'shells', name: 'Double barrel', short: 'Double', dmg: 19, rate: 0.05, mag: 2, perShell: 0.42, breakOpen: true, spread: 0.19, pellets: 9, kick: 3, shake: 0.32, start: 16, rar: 'u', desc: 'Two barrels as fast as you can pull: the biggest burst of damage up close.' },
  auto12: { slot: 'long', ammo: 'shells', name: 'Auto shotgun', short: 'Auto SG', dmg: 10, rate: 0.21, mag: 8, reload: 2.2, spread: 0.16, pellets: 7, kick: 2.2, shake: 0.22, mobile: 1.3, heavy: { fire: 0.3, draw: 1.5, ready: 0.55, run: 1.4 }, start: 30, rar: 'l', drumMag: true, desc: 'A fully automatic shotgun: holds the trigger down where the others pump. A box of 8, or fit the 20-shell drum. Heavy: you slow down while you fire it, it\'s slow to draw and to bring up after a sprint, and it\'s loose on the move.' },
  hunting: { slot: 'long', ammo: 'rifle', name: 'Hunting rifle', short: 'Rifle', dmg: 150, rate: 1.15, mag: 5, perShell: 0.55, spread: 0.006, kick: 4, shake: 0.25, pierce: 3, sniper: true, start: 20, rar: 'r', desc: 'Bolt action. One round goes through four zombies, at full power at any range. Through a scope, every headshot is a crit.' },
  scar: { slot: 'long', ammo: 'rifle', name: 'Battle rifle', short: 'Battle', dmg: 95, rate: 0.22, mag: 10, reload: 1.6, spread: 0.01, kick: 3.6, shake: 0.22, pierce: 1, stagger: 0.4, bruteStagger: 0.3, bruteX: 1.4, sniper: true, sprayK: 1.2, mobile: 1.2, slow: 0.94, heavy: { fire: 0.2, draw: 1.35, ready: 0.65, run: 1.35 }, start: 30, rar: 'l', desc: 'Stopping power. Every 7.62 round staggers what it hits, so steady fire keeps a zombie from ever reaching you, and it\'s the one gun that staggers brutes too, breaking off a charge, and hits them 40% harder. Takes every scope. Heavy: slower to walk, draw and bring up after a sprint.' },
  smg: { slot: 'auto', ammo: 'p9', name: 'Machine pistol', short: 'Auto', dmg: 22, rate: 0.075, mag: 30, reload: 1.3, spread: 0.05, kick: 0.7, shake: 0.06, mobile: 0.3, sprayK: 0.7, start: 100, rar: 'u', desc: 'The fastest-firing gun, and the one that holds its aim best on the move. Quick to reload.' },
  sub: { slot: 'auto', ammo: 'p9', name: 'Submachine gun', short: 'SMG', intSupp: true, dmg: 28, rate: 0.072, mag: 30, reload: 1.5, spread: 0.035, kick: 0.9, shake: 0.06, sprayK: 0.45, start: 120, rar: 'r', desc: 'The steadiest automatic: it stays tight through long bursts, and reaches further than any 9mm.' },
  ar: { slot: 'auto', ammo: 'rifle', name: 'Assault rifle', short: 'AR', dmg: 38, rate: 0.095, mag: 30, reload: 2.0, spread: 0.035, kick: 1.4, shake: 0.08, pierce: 1, start: 90, rar: 'e', desc: 'Rifle rounds that go through a zombie and reach a long way. Full auto, or semi for steadier shots (B).' },
  lmg: { slot: 'auto', ammo: 'rifle', name: 'Light machine gun', short: 'LMG', dmg: 38, rate: 0.07, mag: 100, reload: 4.2, spread: 0.085, hipK: 1.35, hipKick: 1.9, sideK: 0.23, kick: 1.6, shake: 0.1, pierce: 1, start: 200, slow: 0.9, sprayK: 0.8, mobile: 1.4, heavy: { fire: 0.45, draw: 1.8, ready: 0.45, run: 1.6 }, rar: 'l', desc: 'A hundred-round belt: the most fire you can keep up. You walk slower carrying it, and slower again while you fire it. Slow to draw and to bring up after a sprint, and loose on the move.' }
};
// every weapon in the game, melee first, keyed by id
const WEAP = Object.assign({}, MELEE_WEAPONS, GUN_WEAPONS);
