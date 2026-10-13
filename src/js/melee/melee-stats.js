// Melee weapon stats.

// Melee weapons: damage, swing rate, reach, arc, how easily they take limbs off, knockback. The big two-handers cleave:
// a swing lands on up to `cleave` zombies in its arc, nearest first. The one-handers have no cleave and hit only the
// nearest zombie in reach, so they hit a little harder for it.
const MELEE_WEAPONS = {
  bat: { slot: 'melee', name: 'Ash bat', short: 'Bat', melee: true, blunt: true, two: true, style: 'swing', dmg: 48, rate: 0.48, range: 1.75, arc: 1.05, sever: 0.2, kb: 4.5, cleave: 3 },
  crowbar: { slot: 'melee', name: 'Crowbar', short: 'Crowbar', melee: true, blunt: true, style: 'swing', dmg: 62, rate: 0.46, range: 1.7, arc: 1.0, sever: 0, kb: 5, rar: 'c', desc: 'Heavy steel. Fast, blunt and reliable, one zombie at a time.' },
  wrench: { slot: 'melee', name: 'Pipe wrench', short: 'Wrench', melee: true, blunt: true, style: 'swing', dmg: 78, rate: 0.6, range: 1.7, arc: 1.05, sever: 0, kb: 7.5, rar: 'u', desc: 'Crushes skulls and knocks zombies flat on their backs, one at a time.' },
  katana: { slot: 'melee', name: 'Katana', short: 'Katana', melee: true, two: true, style: 'slash', dmg: 84, rate: 0.38, range: 2.05, arc: 1.15, sever: 1.6, kb: 2.5, cleave: 3, rar: 'e', desc: 'Fast, long, and it cuts through up to three zombies a swing.' },
  sledge: { slot: 'melee', name: 'Sledgehammer', short: 'Sledge', melee: true, blunt: true, two: true, style: 'chop', dmg: 150, rate: 1.05, range: 2.0, arc: 1.2, sever: 0, kb: 11, slow: 0.9, cleave: 4, rar: 'r', desc: 'A slow overhead swing that sends up to four zombies flying.' },
  machete: { slot: 'melee', name: 'Machete', short: 'Machete', melee: true, style: 'slash', dmg: 66, rate: 0.4, range: 1.7, arc: 0.95, sever: 0.8, kb: 3, rar: 'u', desc: 'Fast, and it takes limbs off, one zombie at a time.' },
  axe: { slot: 'melee', name: 'Fire axe', short: 'Axe', melee: true, two: true, style: 'chop', dmg: 115, rate: 0.85, range: 1.95, arc: 1.0, sever: 1.2, kb: 6, cleave: 3, rar: 'r', desc: 'A slow swing that splits up to three zombies at once.' }
};
