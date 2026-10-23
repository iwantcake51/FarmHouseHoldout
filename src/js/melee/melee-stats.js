// Melee weapon stats.

// Melee weapons: damage, swing rate, reach, arc, how easily they take limbs off, knockback. The big two-handers cleave:
// a swing lands on up to `cleave` zombies in its arc, nearest first. The one-handers have no cleave and hit only the
// nearest zombie in reach, so they hit a little harder for it (and cost less stamina a swing, melee/melee.js). How many a
// weapon hits is shown as a stat on its card (MULTI-HIT, upgrades/upgrade-info.js), never written into its description.
export const MELEE_WEAPONS = {
  bat: { slot: 'melee', name: 'Ash bat', short: 'Bat', melee: true, blunt: true, two: true, style: 'swing', dmg: 48, rate: 0.48, range: 1.75, arc: 1.05, sever: 0.2, kb: 4.5, cleave: 3 },
  crowbar: { slot: 'melee', name: 'Crowbar', short: 'Crowbar', melee: true, blunt: true, style: 'swing', dmg: 62, rate: 0.46, range: 1.7, arc: 1.0, sever: 0, kb: 5, rar: 'u', desc: 'Heavy steel. Fast, blunt and reliable.' },
  wrench: { slot: 'melee', name: 'Pipe wrench', short: 'Wrench', melee: true, blunt: true, style: 'swing', dmg: 78, rate: 0.6, range: 1.7, arc: 1.05, sever: 0, kb: 7.5, rar: 'u', desc: 'Crushes skulls and knocks zombies flat on their backs.' },
  katana: { slot: 'melee', name: 'Katana', short: 'Katana', melee: true, two: true, style: 'slash', dmg: 84, rate: 0.38, range: 2.05, arc: 1.15, sever: 1.6, kb: 2.5, cleave: 3, rar: 'e', desc: 'Fast and long, and it takes limbs off clean.' },
  sledge: { slot: 'melee', name: 'Sledgehammer', short: 'Sledge', melee: true, blunt: true, two: true, style: 'chop', dmg: 150, rate: 1.05, range: 2.0, arc: 1.2, sever: 0, kb: 13, slow: 0.9, cleave: 4, rar: 'r', desc: 'A slow overhead swing that crushes skulls and sends zombies flying.' },
  machete: { slot: 'melee', name: 'Machete', short: 'Machete', melee: true, style: 'slash', dmg: 66, rate: 0.4, range: 1.7, arc: 0.95, sever: 0.8, kb: 3, rar: 'u', desc: 'Fast, and it takes limbs off.' },
  axe: { slot: 'melee', name: 'Fire axe', short: 'Axe', melee: true, two: true, style: 'chop', dmg: 115, rate: 0.85, range: 1.95, arc: 1.0, sever: 1.2, kb: 8, cleave: 3, rar: 'r', desc: 'A slow, heavy swing that splits zombies apart.' }
};
// reach makes a one-hander sweep: made long enough (a long blade, folded steel, a tune-up) its swing carries on past the
// nearest zombie, catching two from 2 m of reach and three from 2.4 m. Never fewer than the weapon already catches
const REACH_CLEAVE = [[2.4, 3], [2.0, 2]];
export function reachCleave(D) {
  if (!D.melee) return;
  const r = REACH_CLEAVE.find(([m]) => D.range >= m - 1e-6);
  if (r && (D.cleave || 1) < r[1]) D.cleave = r[1];
}
