// Gun-specific mods.

// Gun mods: each belongs to one gun (w), has a rarity (r), card text, a visual note, and a stat change. A muzzle
// device (muzzle) takes the end of the barrel, so it rules out a can there (and the other way round); a longer barrel
// is still a barrel and takes a can on its end. No mod does what a workbench line or a kind of round already does for
// that gun: the rounds (slugs, flechettes, dragon's breath, explosive tips, expanding rounds) are loaded one at a time
// (weapons/rounds.js), a bigger tube, mag or belt is the magazine line, the SMG's can is its suppressor line, and the
// pump's and the bolt rifle's way to fire faster is their own action, not a trigger (NO_TRIGGER, upgrades/upgrades.js)
// two guns are fired one-handed from the hip: a little looser than one held in both hands
const AK_SPREAD = 1.15;
export const AUTO_SEAR = { rate: 0.31, trig: 2 };
// a slug's drop-off: [full damage out to, reaches the floor at, floor] against buckshot's [5, 13, 0.6] (weapons/ammo.js)
export const SLUG_FALL = [14, 30, 0.85];
// dragon's breath: full damage to 2 m, down to 20% by 7 m, and nothing at all past 8 m
export const DRAGON_FALL = [2, 7, 0.2], DRAGON_MAX = 8;
// how much harder a zombie bleeds (health a second) for each flechette that lands in it
export const DART_BLEED = 1.5;
// the battle rifle's AK conversion kit (akkit): a new lower that takes 30-round AK mags and an auto sear, so the 7.62 NATO
// semi-auto becomes a 7.62x39 automatic, its fire between the assault rifle's and the semi-auto's. Each round is lighter
// (dmg) and staggers less, but there are three times as many in the gun and it kicks about half as hard; a mag change is
// an AK's, rocked out and in (reload, player/hold.js: AK_WAY). It takes the magazine's place: the 20-round mag and the
// flared magwell come off while it's on, and can't go back on till it's off (locks: addMod, upgrades/upgrades.js:
// tierFits, ui/loadout.js). Dear (cost), and a single step, no levels
const AKKIT = { dmg: 0.52, rate: 0.115, mag: 30, reload: 1.9, spread: 2.6, kick: 0.5, shake: 0.45, stagger: 0.55, brute: 0.4, cost: 34 };
// the SMG's 10mm conversion kit (tenmm), as the MP5/10: a new lower with a straight magwell for 30-round straight 10mm
// Auto mags. The 10 is a much hotter round than the 9mm: each hits about 40% harder (dmg), goes on through a zombie
// (pierce) and carries its punch further (reach), and gives a little stagger, but it kicks and climbs a good deal more
// (kick, shake, sprayK), spreads a touch wider, and the gun cycles a little slower (rate). Its rounds are its own (the
// p10 pool, weapons/ammo.js), scarcer than 9mm: boxes and cans hold fewer and a crafted batch is smaller. It takes the
// magazine's place: the longer 9mm mags and the drum can't go on while it's fitted (locks), so it's 30 rounds, full
// stop. Fitted, the gun's emptied (its 9mm back in the pouch) and it comes with two mags of 10mm (gift); dear (cost),
// like the battle rifle's AK kit, and a single step
const TENMM = { dmg: 1.4, rate: 1.1, mag: 30, reload: 1.05, spread: 1.15, kick: 1.55, shake: 1.6, sprayK: 1.35, reach: 0.15, stagger: 0.1, gift: 60, cost: 30 };
// a mod that turns the gun into something else (conv: the AK kit, the burst conversion, a second gun, the sawn-off) is
// sold at the top of the workbench with the tune-up, not down among the gun's upgrades (stations/recipes.js)
export const GUN_MODS = {
  match: { w: 'pistol', r: 'c', name: 'Match barrel', text: 'Tighter, harder-hitting shots that keep more of their damage at range.', vis: 'A longer, heavier slide', stat: D => { D.spread *= 0.7; D.dmg *= 1.15; D.reach = (D.reach || 1) + 0.3; } },
  burst: { conv: true, w: 'pistol', r: 'u', fm: 'Burst', name: 'Burst conversion', text: 'Fires 3-round bursts, and keeps bursting while you hold. B switches modes.', vis: 'A switch on the back of the slide', stat: D => { D.burst = 3; D.rate = 0.34; } },
  // the auto sear is the burst conversion's third step (MOD_LINE, weapons/mod-levels.js): it goes in once that's at level
  // II and adds full auto alongside the burst, so B steps from single shots to the burst to full auto
  // full auto: the pistol's own pace cut to AUTO_SEAR.rate of it (so whatever else quickens the pistol quickens it too), and
  // in full auto every trigger step counts AUTO_SEAR.trig times over (game/run-state.js)
  auto: { w: 'pistol', r: 'r', fm: 'Full auto', need: 'burst', needLv: 2, name: 'Auto sear', text: 'Adds full auto alongside the burst: hold to fire. B steps from single shots to burst to full auto. Trigger upgrades count double in full auto.', vis: 'A longer selector lever', stat: D => { D.rate *= AUTO_SEAR.rate; D.spread *= 1.45; D.fullAuto = true; } },
  akimbo: { conv: true, w: 'pistol', r: 'e', name: 'Second pistol', text: 'A pistol in each hand: left click fires the left, right click the right. No aiming down the sights, and a little more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.55; D.mag *= 2; D.spread *= AK_SPREAD; } },
  // named for its length at each level, as the model grows (weapons/gun-models.js: snub, then 4", 6" and 8")
  longbarrel: { w: 'revolver', r: 'c', name: '4" barrel', names: ['4" barrel', '6" barrel', '8" barrel'], text: 'Hits harder and keeps its damage much further out.', vis: 'A longer barrel', stat: D => { D.dmg *= 1.25; D.reach = (D.reach || 1) + 0.4; } },
  // no mode to switch: from the hip you fan it (hold the trigger, the shots come almost 3× as fast and far wilder),
  // down the sights it's the careful single shots it always was (weapons/firing.js: fanning)
  fan: { w: 'revolver', r: 'r', name: 'Fan the hammer', text: 'From the hip, hold the trigger to fan shots 3× as fast, but much wilder. Aim down the sights for precise single shots.', vis: 'A filed-down hammer', stat: D => { D.fan = { rate: 0.2, spread: 6 }; } },
  // (the shoulder stock, stations/recipes.js, is what tames a sidearm's kick: the compensator only tightens it)
  comp: { w: 'deagle', muzzle: true, r: 'u', name: 'Ported compensator', text: 'Holds the muzzle down: less spread and kick.', vis: 'A slotted compensator', stat: D => { D.spread *= 0.5; D.shake *= 0.5; } },
  slam: { w: 'pump', r: 'u', name: 'Slam fire', text: 'Fires as you pump, so it goes quicker, a touch looser.', vis: 'The disconnector filed away', stat: D => { D.rate *= 0.67; D.spread *= 1.05; } },
  sawn: { conv: true, w: 'dbl', r: 'c', name: 'Sawn-off', text: 'More pellets in a wider spread, and quicker reloads.', vis: 'Barrels and stock cut short', stat: D => { D.pellets += 4; D.spread *= 1.4; D.perShell *= 0.7; } },
  both: { w: 'dbl', r: 'u', fm: 'Both barrels', name: 'Twin trigger', text: 'Fire both barrels at once, or one at a time: B switches.', vis: 'A brass twin trigger', stat: D => { D.both = true; } },
  // a single step, no levels (it has no MOD_UP: weapons/mod-levels.js)
  bolt: { w: 'hunting', r: 'c', name: 'Greased bolt', text: 'The bolt slicked with gun grease runs smoother: 22% less time between shots.', vis: 'A polished bolt handle', stat: D => { D.rate *= 0.78; } },
  akimbo2: { conv: true, w: 'smg', r: 'e', name: 'Second machine pistol', text: 'One in each hand: left click fires the left, right click the right. No aiming down the sights, and a little more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.6; D.mag *= 2; D.spread *= AK_SPREAD; } },
  ported: { w: 'smg', muzzle: true, r: 'c', name: 'Ported barrel', text: 'Keeps the muzzle down, so shots spread less.', vis: 'A ported barrel', stat: D => { D.spread *= 0.6; } },
  // the Navy trigger group: a 3-round burst as well as full auto, B switching (the burst's rounds come 0.06 s apart)
  tenmm: { conv: true, w: 'sub', r: 'l', cost: TENMM.cost, locks: ['mag'], ammo: 'p10', gift: TENMM.gift, name: '10mm conversion kit', text: `A new lower and straight 30-round mags for 10mm Auto: each round hits ~40% harder, goes through a zombie and carries further, but it kicks harder and its ammo is scarcer. No longer mags while it's on. Comes with two loaded mags.`, vis: 'A straight 10mm magwell and a straight 30-round mag',
    stat: D => { D.tenmm = true; D.ammo = 'p10'; D.dmg *= TENMM.dmg; D.rate *= TENMM.rate; D.mag = D.ownMag = TENMM.mag; D.reload *= TENMM.reload; D.spread *= TENMM.spread; D.kick *= TENMM.kick; D.shake *= TENMM.shake; D.sprayK *= TENMM.sprayK; D.reach = (D.reach || 1) + TENMM.reach; D.pierce = (D.pierce || 0) + 1; D.stagger = Math.max(D.stagger || 0, TENMM.stagger); } },
  navy: { w: 'sub', r: 'u', fm: 'Burst', name: 'Navy trigger group', text: 'Adds a 3-round burst (B switches), quicker and tighter than full auto.', vis: 'A burst-marked selector', stat: D => { D.burst = 3; D.rate = 0.3; D.spread *= 0.75; } },
  gl: { w: 'ar', r: 'e', name: 'Underbarrel launcher', text: 'G fires a grenade, then it recharges.', vis: 'A launcher tube under the barrel', stat: D => { D.gl = true; D.glRecharge = 6; } },
  // a small edge, not a big one: about 8% off a mag change, a few % more a level (weapons/mod-levels.js)
  well: { w: 'ar', r: 'u', name: 'Flared mag well', text: 'A funnel round the mag well, so mag changes go a little quicker.', vis: 'A funnel round the mag well', stat: D => { D.reload *= 0.92; } },
  heavy: { w: 'ar', r: 'c', name: 'Heavy barrel', text: 'Hits harder and spreads less.', vis: 'A thicker barrel', stat: D => { D.dmg *= 1.25; D.spread *= 0.7; } },
  bipod: { w: 'lmg', r: 'c', name: 'Bipod', text: 'Almost no spread while standing still.', vis: 'Folding bipod legs', stat: D => { D.bipod = true; } },
  akkit: { conv: true, w: 'scar', r: 'l', cost: AKKIT.cost, semi: true, locks: ['mag', 'loader'], name: 'AK conversion kit', text: `A new lower for 30-round AK mags and full auto (B for semi). Lighter rounds that stagger less, but ${AKKIT.mag} in the gun and half the kick. Takes the place of the 20-round mag and the flared magwell.`, vis: 'An AK lower and a curved 30-round mag',
    stat: D => { D.akKit = true; D.dmg *= AKKIT.dmg; D.rate = AKKIT.rate; D.mag = D.ownMag = AKKIT.mag; D.reload = AKKIT.reload; D.spread *= AKKIT.spread; D.kick *= AKKIT.kick; D.shake *= AKKIT.shake; D.stagger *= AKKIT.stagger; D.bruteStagger *= AKKIT.brute; D.bruteX = 1 + (D.bruteX - 1) * AKKIT.brute; } }
};
