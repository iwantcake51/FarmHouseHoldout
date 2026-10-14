// Melee-specific mods, and the combined MODS table.

// Melee mods: same shape as gun mods, one weapon each.
const MELEE_MODS = {
  nails: { w: 'bat', r: 'c', name: 'Nails in the bat', text: '+40% damage. Cuts off limbs more often.', vis: 'Nails through the end', stat: D => { D.dmg *= 1.4; D.sever += 0.4; } },
  wire: { w: 'bat', r: 'u', name: 'Barbed wire', text: 'Longer reach, wider swings, hits 1 more zombie.', vis: 'Wire wrapped round it', need: 'nails', stat: D => { D.range += 0.35; D.arc += 0.35; D.cleave += 1; } },
  serrated: { w: 'machete', r: 'u', name: 'Serrated edge', text: 'Hits make zombies bleed.', vis: 'A saw-toothed spine', stat: D => { D.bleed = true; } },
  longblade: { w: 'machete', r: 'c', name: 'Long blade', text: 'Longer reach: hits 2 zombies per swing.', vis: 'A longer blade', stat: D => { D.range += 0.4; } },
  tape: { w: 'crowbar', r: 'c', name: 'Taped grip', text: 'Swing 30% faster.', vis: 'Grip tape on the handle', stat: D => { D.rate *= 0.7; } },
  jaw: { w: 'wrench', r: 'u', name: 'Heavy jaw', text: '+30% damage and knockback.', vis: 'A bigger jaw', stat: D => { D.dmg *= 1.3; D.kb *= 1.3; } },
  folded: { w: 'katana', r: 'r', name: 'Folded steel', text: '+30% damage, longer reach.', vis: 'A brighter, longer blade', stat: D => { D.dmg *= 1.3; D.range += 0.25; } },
  spikes: { w: 'sledge', r: 'u', name: 'Railroad spikes', text: '+20% damage. Tears limbs off.', vis: 'Spikes welded to the head', stat: D => { D.dmg *= 1.2; D.blunt = false; D.sever = 0.8; } },
  weighted: { w: 'axe', r: 'u', name: 'Weighted head', text: 'Double knockback, wider swings, hits 1 more zombie.', vis: 'A heavier head', stat: D => { D.kb *= 2; D.arc += 0.6; D.cleave += 1; } }
};
const MODS = Object.assign({}, GUN_MODS, MELEE_MODS);
