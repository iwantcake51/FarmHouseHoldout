// Gun-specific mods.

// Gun mods: each belongs to one gun (w), has a rarity (r), card text, a visual note, and a stat change. A muzzle
// device (muzzle) takes the end of the barrel, so it rules out a can there (and the other way round); a longer barrel
// is still a barrel and takes a can on its end. No mod does what a workbench line or a kind of round already does for
// that gun: the rounds (slugs, flechettes, dragon's breath, explosive tips, expanding rounds) are loaded one at a time
// (weapons/rounds.js), a bigger tube, mag or belt is the magazine line, the SMG's can is its suppressor line, and the
// pump's and the bolt rifle's way to fire faster is their own action, not a trigger (NO_TRIGGER, upgrades/upgrades.js)
// two guns are fired one-handed from the hip: a little looser than one held in both hands
const AK_SPREAD = 1.15;
const GUN_MODS = {
  match: { w: 'pistol', r: 'c', name: 'Match barrel', text: '30% tighter shots, +15% damage, and loses less damage at range.', vis: 'A longer, heavier slide', stat: D => { D.spread *= 0.7; D.dmg *= 1.15; D.reach = (D.reach || 1) + 0.3; } },
  burst: { w: 'pistol', r: 'u', fm: 'Burst', name: 'Burst conversion', text: 'Fires 3-round bursts. Hold to keep firing. B switches modes.', vis: 'A switch on the back of the slide', stat: D => { D.burst = 3; D.rate = 0.34; } },
  // the auto sear takes the burst conversion's place once that's at level II: B switches between single shots and full auto
  auto: { w: 'pistol', r: 'r', fm: 'Full auto', need: 'burst', needLv: 2, replaces: 'burst', name: 'Auto sear', text: 'Full auto: hold to fire. Replaces burst. B switches modes.', vis: 'A longer selector lever', stat: D => { D.rate = 0.075; D.spread *= 1.45; D.fullAuto = true; } },
  akimbo: { w: 'pistol', r: 'e', name: 'Second pistol', text: 'A pistol in each hand: left click fires the left, right click the right. Double the ammo and fire rate. Can\'t aim down sights, slightly more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.55; D.mag *= 2; D.spread *= AK_SPREAD; } },
  // named for its length at each level, as the model grows (weapons/gun-models.js: snub, then 4", 6" and 8")
  longbarrel: { w: 'revolver', r: 'c', name: '4" barrel', names: ['4" barrel', '6" barrel', '8" barrel'], text: '+25% damage, and loses far less damage at range.', vis: 'A longer barrel', stat: D => { D.dmg *= 1.25; D.reach = (D.reach || 1) + 0.4; } },
  // no mode to switch: from the hip you fan it (hold the trigger, the shots come almost 3× as fast and far wilder),
  // down the sights it's the careful single shots it always was (weapons/firing.js: fanning)
  fan: { w: 'revolver', r: 'r', name: 'Fan the hammer', text: 'From the hip, hold the trigger to fan shots 3× as fast, but much wilder. Aim down the sights for precise single shots.', vis: 'A filed-down hammer', stat: D => { D.fan = { rate: 0.2, spread: 6 }; } },
  // (the shoulder stock, stations/recipes.js, is what tames a sidearm's kick: the compensator only tightens it)
  comp: { w: 'deagle', muzzle: true, r: 'u', name: 'Ported compensator', text: 'Halves the spread.', vis: 'A slotted compensator', stat: D => { D.spread *= 0.5; } },
  slam: { w: 'pump', r: 'u', name: 'Slam fire', text: 'Fires 50% faster, 5% more spread.', vis: 'The disconnector filed away', stat: D => { D.rate *= 0.67; D.spread *= 1.05; } },
  sawn: { w: 'dbl', r: 'c', name: 'Sawn-off', text: 'More pellets, wider spread, faster reloads.', vis: 'Barrels and stock cut short', stat: D => { D.pellets += 4; D.spread *= 1.4; D.perShell *= 0.7; } },
  both: { w: 'dbl', r: 'u', name: 'Twin trigger', text: 'Fire both barrels at once.', vis: 'A brass twin trigger', stat: D => { D.both = true; } },
  well: { w: 'auto12', r: 'u', name: 'Flared mag well', text: 'Mag changes 30% faster.', vis: 'A funnel round the mag well', stat: D => { D.reload *= 0.7; } },
  bolt: { w: 'hunting', r: 'c', name: 'Straight-pull bolt', text: 'Fires faster: 0.8 s between shots instead of 1.3 s.', vis: 'A polished bolt handle', stat: D => { D.rate *= 0.6; } },
  akimbo2: { w: 'smg', r: 'e', name: 'Second machine pistol', text: 'One in each hand: left click fires the left, right click the right. Double the ammo and fire rate. Can\'t aim down sights, slightly more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.6; D.mag *= 2; D.spread *= AK_SPREAD; } },
  ported: { w: 'smg', muzzle: true, r: 'c', name: 'Ported barrel', text: '40% tighter aim.', vis: 'A ported barrel', stat: D => { D.spread *= 0.6; } },
  // the Navy trigger group: a 3-round burst as well as full auto, B switching (the burst's rounds come 0.06 s apart)
  navy: { w: 'sub', r: 'u', fm: 'Burst', name: 'Navy trigger group', text: 'Adds a 3-round burst (B switches): bursts come out quicker and 25% tighter than full auto.', vis: 'A burst-marked selector', stat: D => { D.burst = 3; D.rate = 0.3; D.spread *= 0.75; } },
  gl: { w: 'ar', r: 'e', name: 'Underbarrel launcher', text: 'Press G to fire a grenade. Recharges in 6 s.', vis: 'A launcher tube under the barrel', stat: D => { D.gl = true; D.glRecharge = 6; } },
  heavy: { w: 'ar', r: 'c', name: 'Heavy barrel', text: '+25% damage, 30% tighter aim.', vis: 'A thicker barrel', stat: D => { D.dmg *= 1.25; D.spread *= 0.7; } },
  bipod: { w: 'lmg', r: 'c', name: 'Bipod', text: 'Almost no spread while standing still.', vis: 'Folding bipod legs', stat: D => { D.bipod = true; } }
};
