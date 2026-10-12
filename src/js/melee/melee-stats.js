// Melee weapon stats.

// Melee weapons: damage, swing rate, reach, arc, how easily they take limbs off, knockback.
const MELEE_WEAPONS = {
  bat: { slot: 'melee', name: 'Ash bat', short: 'Bat', melee: true, blunt: true, two: true, style: 'swing', dmg: 48, rate: 0.48, range: 1.75, arc: 1.05, sever: 0.2, kb: 4.5 },
  crowbar: { slot: 'melee', name: 'Crowbar', short: 'Crowbar', melee: true, blunt: true, style: 'swing', dmg: 58, rate: 0.46, range: 1.7, arc: 1.0, sever: 0, kb: 5, rar: 'c', desc: 'Heavy steel. Fast, blunt and reliable.' },
  wrench: { slot: 'melee', name: 'Pipe wrench', short: 'Wrench', melee: true, blunt: true, style: 'swing', dmg: 74, rate: 0.6, range: 1.7, arc: 1.05, sever: 0, kb: 7.5, rar: 'u', desc: 'Crushes skulls and knocks zombies flat on their backs.' },
  katana: { slot: 'melee', name: 'Katana', short: 'Katana', melee: true, two: true, style: 'slash', dmg: 96, rate: 0.36, range: 2.05, arc: 1.15, sever: 1.6, kb: 2.5, rar: 'e', desc: 'Fast, long, and it cuts through anything.' },
  sledge: { slot: 'melee', name: 'Sledgehammer', short: 'Sledge', melee: true, blunt: true, two: true, style: 'chop', dmg: 150, rate: 1.05, range: 2.0, arc: 1.2, sever: 0, kb: 11, slow: 0.9, rar: 'r', desc: 'A slow overhead swing that sends zombies flying.' },
  machete: { slot: 'melee', name: 'Machete', short: 'Machete', melee: true, style: 'slash', dmg: 64, rate: 0.4, range: 1.7, arc: 0.95, sever: 0.8, kb: 3, rar: 'u', desc: 'Fast, and it takes limbs off.' },
  axe: { slot: 'melee', name: 'Fire axe', short: 'Axe', melee: true, two: true, style: 'chop', dmg: 115, rate: 0.85, range: 1.95, arc: 1.0, sever: 1.2, kb: 6, rar: 'r', desc: 'A slow swing that splits anything it touches.' }
};
