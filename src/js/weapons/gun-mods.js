// Gun-specific mods.

// Gun mods: each belongs to one gun (w), has a rarity (r), card text, a visual note, and a stat change. A muzzle
// device (muzzle) takes the end of the barrel, so it rules out a can there (and the other way round); a longer barrel
// is still a barrel and takes a can on its end
// two guns are fired one-handed from the hip: a little looser than one held in both hands
const AK_SPREAD = 1.15;
const GUN_MODS = {
  match: { w: 'pistol', r: 'c', name: 'Match barrel', text: '+35% damage. Loses less damage at range.', vis: 'A longer, heavier slide', stat: D => { D.dmg *= 1.35; D.reach = (D.reach || 1) + 0.3; } },
  burst: { w: 'pistol', r: 'u', fm: 'Burst', name: 'Burst conversion', text: 'Fires 3-round bursts. Hold to keep firing. B switches modes.', vis: 'A switch on the back of the slide', stat: D => { D.burst = 3; D.rate = 0.34; } },
  // the auto sear takes the burst conversion's place once that's at level II: B switches between single shots and full auto
  auto: { w: 'pistol', r: 'r', fm: 'Full auto', need: 'burst', needLv: 2, replaces: 'burst', name: 'Auto sear', text: 'Full auto: hold to fire. Replaces burst. B switches modes.', vis: 'A longer selector lever', stat: D => { D.rate = 0.075; D.spread *= 1.45; D.fullAuto = true; } },
  akimbo: { w: 'pistol', r: 'e', name: 'Second pistol', text: 'A pistol in each hand: left click fires the left, right click the right. Double the ammo and fire rate. Can\'t aim down sights, slightly more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.55; D.mag *= 2; D.spread *= AK_SPREAD; } },
  longbarrel: { w: 'revolver', r: 'c', name: 'Eight-inch barrel', text: '+30% damage, goes through 1 more zombie, loses less damage at range.', vis: 'A much longer barrel', stat: D => { D.dmg *= 1.3; D.pierce = (D.pierce || 0) + 1; D.reach = (D.reach || 1) + 0.3; } },
  fan: { w: 'revolver', r: 'r', fm: 'Fanning', name: 'Fan the hammer', text: 'Hold to fire almost 3× as fast, with more spread. B switches modes.', vis: 'A filed-down hammer', stat: D => { D.rate = 0.15; D.spread *= 2.6; } },
  boom: { w: 'deagle', r: 'l', name: 'Explosive tips', text: 'Every round explodes on hit.', vis: 'A red band on the magazine', stat: D => { D.explode = 1.5; } },
  comp: { w: 'deagle', muzzle: true, r: 'u', name: 'Ported compensator', text: 'Half the spread and kick.', vis: 'A slotted compensator', stat: D => { D.spread *= 0.5; D.shake *= 0.5; } },
  dragon: { w: 'pump', r: 'e', name: "Dragon's breath", text: 'Shells set zombies on fire.', vis: 'Orange shells in the side saddle', stat: D => { D.ignite = true; } },
  slug: { w: 'pump', r: 'u', name: 'Slug rounds', text: 'Fires one heavy slug that goes through 3 zombies.', vis: 'Yellow slugs in the side saddle', stat: D => { D.pellets = 1; D.dmg = 125; D.pierce = 2; D.spread = 0.012; } },
  slam: { w: 'pump', r: 'u', name: 'Slam fire', text: 'Fires 50% faster, 5% more spread.', vis: 'The disconnector filed away', stat: D => { D.rate *= 0.67; D.spread *= 1.05; } },
  tube: { w: 'pump', r: 'c', name: 'Tube extension', text: '+4 shells.', vis: 'A longer magazine tube', stat: D => { D.mag += 4; } },
  sawn: { w: 'dbl', r: 'c', name: 'Sawn-off', text: 'More pellets, wider spread, faster reloads.', vis: 'Barrels and stock cut short', stat: D => { D.pellets += 4; D.spread *= 1.4; D.perShell *= 0.7; } },
  both: { w: 'dbl', r: 'u', name: 'Twin trigger', text: 'Fire both barrels at once.', vis: 'A brass twin trigger', stat: D => { D.both = true; } },
  flech: { w: 'auto12', r: 'r', name: 'Flechettes', text: 'Pellets go through 2 more zombies.', vis: 'A striped drum', stat: D => { D.pierce = (D.pierce || 0) + 2; } },
  bolt: { w: 'hunting', r: 'c', name: 'Straight-pull bolt', text: 'Fires faster: 0.8 s between shots instead of 1.3 s.', vis: 'A polished bolt handle', stat: D => { D.rate *= 0.6; } },
  hpscope: { w: 'hunting', r: 'u', name: 'High-power scope', text: 'While aiming: 2 in 5 hits do 2.5× damage, headshots +25%.', vis: 'A big scope', stat: D => { D.critC = 0.4; D.critM = 2.5; } },
  expand: { w: 'hunting', r: 'e', name: 'Expanding rounds', text: 'Every limb you hit comes off.', vis: 'Copper-tipped rounds', stat: D => { D.alwaysSever = true; } },
  akimbo2: { w: 'smg', r: 'e', name: 'Second machine pistol', text: 'One in each hand: left click fires the left, right click the right. Double the ammo and fire rate. Can\'t aim down sights, slightly more spread.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.6; D.mag *= 2; D.spread *= AK_SPREAD; } },
  ported: { w: 'smg', muzzle: true, r: 'c', name: 'Ported barrel', text: '40% tighter aim.', vis: 'A ported barrel', stat: D => { D.spread *= 0.6; } },
  integral: { w: 'sub', muzzle: true, r: 'u', name: 'Integral suppressor', text: '+20% damage, much quieter.', vis: 'A fat suppressed barrel', stat: D => { D.dmg *= 1.2; D.quiet = true; } },
  stack: { w: 'sub', r: 'c', name: 'Double-stack mag', text: 'Double the magazine size.', vis: 'A long magazine', stat: D => { D.mag *= 2; } },
  gl: { w: 'ar', r: 'e', name: 'Underbarrel launcher', text: 'Press G to fire a grenade. Recharges in 6 s.', vis: 'A launcher tube under the barrel', stat: D => { D.gl = true; D.glRecharge = 6; } },
  heavy: { w: 'ar', r: 'c', name: 'Heavy barrel', text: '+25% damage, 30% tighter aim.', vis: 'A thicker barrel', stat: D => { D.dmg *= 1.25; D.spread *= 0.7; } },
  belt: { w: 'lmg', r: 'u', name: 'Belt box', text: '+100 rounds.', vis: 'A bigger ammo box', stat: D => { D.mag += 100; } },
  bipod: { w: 'lmg', r: 'c', name: 'Bipod', text: 'Almost no spread while standing still.', vis: 'Folding bipod legs', stat: D => { D.bipod = true; } }
};
