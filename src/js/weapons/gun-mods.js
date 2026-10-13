// Gun-specific mods.

// Gun mods: each belongs to one gun (w), has a rarity (r), card text, a visual note, and a stat change.
const GUN_MODS = {
  match: { w: 'pistol', r: 'c', name: 'Match barrel', text: 'Pistol damage +35%, and its shots lose less damage at range.', vis: 'A longer, heavier slide', stat: D => { D.dmg *= 1.35; D.reach = (D.reach || 1) + 0.3; } },
  burst: { w: 'pistol', r: 'u', fm: 'Burst', name: 'Burst conversion', text: 'Each trigger pull fires a fast three-round burst. B switches fire modes.', vis: 'A switch on the back of the slide', stat: D => { D.burst = 3; D.rate = 0.34; } },
  // the auto sear takes the burst conversion's place once that's at level II: B switches between single shots and full auto
  auto: { w: 'pistol', r: 'r', fm: 'Full auto', need: 'burst', needLv: 2, replaces: 'burst', name: 'Auto sear', text: 'Replaces the burst conversion: hold the trigger and the pistol empties itself. B switches between single shots and full auto.', vis: 'A longer selector lever', stat: D => { D.rate = 0.075; D.spread *= 1.45; D.fullAuto = true; } },
  akimbo: { w: 'pistol', r: 'e', name: 'Second pistol', text: 'A pistol in each hand: nearly twice the fire rate and ammo.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.55; D.mag *= 2; } },
  speedloader: { w: 'revolver', r: 'u', name: 'Speedloader', text: 'Reload all six rounds at once, fast.', vis: 'A brass speedloader on the frame', stat: D => { D.perShell = 0; D.reload = 0.9; } },
  longbarrel: { w: 'revolver', r: 'c', name: 'Eight-inch barrel', text: 'Revolver damage +30%, one more pierce, and its shots lose less damage at range.', vis: 'A much longer barrel', stat: D => { D.dmg *= 1.3; D.pierce = (D.pierce || 0) + 1; D.reach = (D.reach || 1) + 0.3; } },
  fan: { w: 'revolver', r: 'r', fm: 'Fanning', name: 'Fan the hammer', text: 'Fire the revolver almost three times as fast, with more spread. B switches back to aimed shots.', vis: 'A filed-down hammer', stat: D => { D.rate = 0.15; D.spread *= 2.6; } },
  boom: { w: 'deagle', r: 'l', name: 'Explosive tips', text: 'Every hand cannon round explodes on impact.', vis: 'Red-tipped rounds', stat: D => { D.explode = 1.5; } },
  comp: { w: 'deagle', r: 'u', name: 'Ported compensator', text: 'Halves hand cannon spread and kick.', vis: 'A slotted compensator', stat: D => { D.spread *= 0.5; D.shake *= 0.5; } },
  dragon: { w: 'pump', r: 'e', name: "Dragon's breath", text: 'Pump shells set every zombie they hit on fire.', vis: 'Orange shells in the side saddle', stat: D => { D.ignite = true; } },
  slug: { w: 'pump', r: 'u', name: 'Slug rounds', text: 'One heavy slug per shell that goes through three zombies.', vis: 'Yellow slugs in the side saddle', stat: D => { D.pellets = 1; D.dmg = 125; D.pierce = 2; D.spread = 0.012; } },
  slam: { w: 'pump', r: 'u', name: 'Slam fire', text: 'Each shell goes off as the action slams shut, so the pump fires 50% faster. Spread up 15%.', vis: 'The disconnector filed away', stat: D => { D.rate *= 0.67; D.spread *= 1.15; } },
  tube: { w: 'pump', r: 'c', name: 'Tube extension', text: 'The pump holds four more shells.', vis: 'A longer magazine tube', stat: D => { D.mag += 4; } },
  sawn: { w: 'dbl', r: 'c', name: 'Sawn-off', text: 'More pellets, wider spread, faster reloads.', vis: 'Barrels and stock cut short', stat: D => { D.pellets += 4; D.spread *= 1.4; D.perShell *= 0.7; } },
  both: { w: 'dbl', r: 'u', name: 'Twin trigger', text: 'Fire both barrels at once.', vis: 'A brass twin trigger', stat: D => { D.both = true; } },
  flech: { w: 'auto12', r: 'r', name: 'Flechettes', text: 'Drum shotgun pellets pass through two more zombies.', vis: 'A striped drum', stat: D => { D.pierce = (D.pierce || 0) + 2; } },
  bolt: { w: 'hunting', r: 'c', name: 'Straight-pull bolt', text: 'Work the rifle bolt almost twice as fast.', vis: 'A polished bolt handle', stat: D => { D.rate = 0.55; } },
  hpscope: { w: 'hunting', r: 'u', name: 'High-power scope', text: 'Crits through the scope: 40% of hits, for 2.5× damage.', vis: 'A big scope', stat: D => { D.critC = 0.4; D.critM = 2.5; } },
  expand: { w: 'hunting', r: 'e', name: 'Expanding rounds', text: 'Any limb the rifle hits comes off.', vis: 'Copper-tipped rounds', stat: D => { D.alwaysSever = true; } },
  akimbo2: { w: 'smg', r: 'e', name: 'Second machine pistol', text: 'One in each hand: nearly twice the fire rate and ammo.', vis: 'One in each hand', stat: D => { D.akimbo = true; D.rate *= 0.6; D.mag *= 2; } },
  ported: { w: 'smg', r: 'c', name: 'Ported barrel', text: 'Machine pistol spread down 40%.', vis: 'A ported barrel', stat: D => { D.spread *= 0.6; } },
  integral: { w: 'sub', r: 'u', name: 'Integral suppressor', text: 'SMG damage +20% and much quieter.', vis: 'A fat suppressed barrel', stat: D => { D.dmg *= 1.2; D.quiet = true; } },
  stack: { w: 'sub', r: 'c', name: 'Double-stack mag', text: 'The SMG magazine holds twice as much.', vis: 'A long magazine', stat: D => { D.mag *= 2; } },
  gl: { w: 'ar', r: 'e', name: 'Underbarrel launcher', text: 'G lobs a grenade. Recharges in 6 seconds.', vis: 'A launcher tube under the barrel', stat: D => { D.gl = true; D.glRecharge = 6; } },
  heavy: { w: 'ar', r: 'c', name: 'Heavy barrel', text: 'Rifle damage +25%, spread down 30%.', vis: 'A thicker barrel', stat: D => { D.dmg *= 1.25; D.spread *= 0.7; } },
  belt: { w: 'lmg', r: 'u', name: 'Belt box', text: 'The LMG holds 100 more rounds.', vis: 'A bigger ammo box', stat: D => { D.mag += 100; } },
  bipod: { w: 'lmg', r: 'c', name: 'Bipod', text: 'Standing still, the LMG has almost no spread.', vis: 'Folding bipod legs', stat: D => { D.bipod = true; } }
};
