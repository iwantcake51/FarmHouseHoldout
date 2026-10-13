// What an upgrade card actually gives you: before → after stat chips, and a line saying what an attachment is for.

// what each upgrade line is for, shown under the card text
const TIER_USE = {
  ammo: 'Ammo · each bullet hits harder', trigger: 'Trigger · the gun fires faster', mag: 'Magazine · more shots before you reload',
  supp: 'Muzzle can · harder hits, much quieter shots, a smaller muzzle flash', sight: 'Sight · tighter aim and more headshots',
  laser: 'Laser · a beam shows exactly where your shots land, and tightens your aim', light: 'Light · lights up the ground ahead of you at night',
  choke: 'Choke · squeezes the pellets into a tighter cone so they reach further', armor: 'Armor · you take less damage',
  boots: 'Footwear · you move faster', hammer: 'Tool · faster, tougher boarding', eyes: 'Senses · you see more around you',
  night: 'Senses · you see in the dark', feed: 'Body · you heal when you kill'
};
const UPG_USE = {
  'Bayonet': 'Attachment · a blade under your long guns and automatics: shove (Space) to stab',
  'Shoulder stock': 'Attachment · steadies your sidearm: tighter aim and less kick',
  'Incendiary rounds': 'Ammo · every hit sets zombies burning for 3 seconds',
  'Through and through': 'Ammo · each bullet keeps going through one more zombie'
};
// short effect chips for upgrades that don't change a gun's numbers
const UPG_FX = {
  'Quick hands': ['Reload 25% faster'], 'Wood pile': ['+7 planks'], 'Scrounger': ['+10 scrap'], 'Field dressing': ['Health to full'], 'Med pouch': ['Bandages 3 → 5', '+2 bandages'],
  'Ammo can': ['+1 can of every ammo'], 'Strong arms': ['Melee +40%'], 'Light feet': ['Vaulting 2× faster'], 'Through and through': ['Pierce +1'],
  'Scavenger': ['Drops +50%'], 'Hoarder': ['Scrap 2×'], 'Thick soles': ['Slowdown when hit −40%'], 'Adrenaline': ['Speed burst on every kill'],
  'Bayonet': ['Shove stab: 45 damage'], 'Shoulder stock': ['Sidearm spread −25%', 'Sidearm kick −45%'], 'Second wind': ['+50 health below 25%, once a wave'],
  'Painkillers': ['+1 health a second'], 'Executioner': ['Headshots 3.2×'], 'Butcher': ['Dismember 2×'], 'Gunsmith': ['Ammo, trigger and mag +1 tier'],
  'Incendiary rounds': ['Burn 3 s on every hit'], 'Stubborn': ['+50 max health', 'Slowdown when hit −85%'], 'Bullet time': ['Kills can slow time'],
  'Last stand': ['+80% damage below 30% health'],
  'Canvas jacket': ['+25 max health', 'Heal 25'], 'Kevlar vest': ['Damage taken −25%'], 'Plate carrier': ['Damage taken −30%', '+25 max health'],
  'Good boots': ['Speed +12%'], 'Running shoes': ['Speed +10%'], 'Trail runners': ['Speed +10%', 'Slowdown when hit −20%'],
  'Claw hammer': ['Boarding 2× faster'], 'Framing hammer': ['Boarding 1.5× faster', 'Boards +25%'], 'Nail gun': ['Boarding 2× faster', 'Boards +50%'],
  'Wide eyes': ['View cone +25%'], 'Peripheral vision': ['View cone wider', 'Sense 4 m around you'], 'Eyes in the back of your head': ['Sense 6 m around you'],
  'Night eyes': ['See far more at night'], 'Cat eyes': ['Nights look like dusk'],
  'Iron stomach': ['+3 health per kill'], 'Bloodthirst': ['+6 health per kill'], 'Vampire': ['+10 health per kill', '+20 for headshot kills']
};
// a gun's headline numbers, as the card compares them
function gunStats(id, D) {
  return { dmg: D.dmg, pel: D.pellets || 1, rate: 1 / D.rate, mag: D.melee ? 0 : Math.max(1, Math.round(D.mag * S.magMul)), spread: D.spread || 0, head: D.headBonus || 0, range: D.range || 0 };
}
// a "LABEL before → after" chip, green when it's better, red when it's worse; nothing when it doesn't change
function chip(label, a, b, higherIsBetter, fmt) {
  if (Math.abs(a - b) < 1e-6) return null;
  return { t: `${label} ${fmt(a)} → ${fmt(b)}`, good: (b > a) === higherIsBetter };
}
const fmtDmg = s => Math.round(s.dmg) + (s.pel > 1 ? '×' + s.pel : ''), fmt1 = v => v.toFixed(1), fmt0 = v => String(Math.round(v)), fmtDeg = v => (v * 57.3).toFixed(1) + '°';
// damage is judged per shot (pellets included) but written per hit, e.g. 15×8 → 17×9
function dmgChip(a, b) { const ta = a.dmg * a.pel, tb = b.dmg * b.pel; return Math.abs(ta - tb) < 1e-6 ? null : { t: `DMG ${fmtDmg(a)} → ${fmtDmg(b)}`, good: tb > ta }; }
function compareFx(a, b) {
  return [dmgChip(a, b), chip('RATE', a.rate, b.rate, true, v => fmt1(v) + '/s'), chip('MAG', a.mag, b.mag, true, fmt0),
    chip('SPREAD', a.spread, b.spread, false, fmtDeg), chip('HEADSHOTS', a.head * 100, b.head * 100, true, v => '+' + Math.round(v) + '%')].filter(Boolean);
}
// mods that add a feature rather than a number
const MOD_FEATURE = { akimbo: 'A gun in each hand', gl: 'Grenade on H, every 6 s', burst: 'Burst fire (V to switch)', fullAuto: 'Full auto (V cycles modes)', both: 'Both barrels at once', quiet: 'Silent shots',
  ignite: 'Sets zombies alight', explode: 'Exploding rounds', bipod: 'Bipod: steady when you stand still', alwaysSever: 'Always takes the limb off', bleed: 'Makes zombies bleed out', pierce: 'Goes through zombies' };
// try a gun's next tier for real, read its numbers, then put it back
function tierFx(id, k) {
  if (!id) return [];
  const n = gunTier(id, k), D0 = W(id), a = gunStats(id, D0);
  W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = n + 1; recomputeEff();
  const b = gunStats(id, W(id));
  W8.gt[id][k] = n; recomputeEff();
  if (k === 'supp' && !D0.quiet) { a.dmg *= [1, 1.1, 1.2, 1.3][n]; b.dmg *= [1, 1.1, 1.2, 1.3][n + 1]; }   // the can's bonus is applied as you fire
  if (k === 'choke') { const m = [1, 0.7, 0.49]; a.spread *= m[n]; b.spread *= m[n + 1]; }
  const fx = compareFx(a, b);
  if (k === 'supp') fx.push({ t: n ? 'Even quieter' : 'Quiet shots', good: true });
  if (k === 'light') fx.push({ t: n ? 'Brighter, wider beam' : 'Night beam ahead of you', good: true });
  if (k === 'laser') fx.push({ t: 'Aim beam', good: true });
  return fx;
}
// a new weapon against the one it would replace in that slot
function weaponFx(id) {
  const D = W(id), cur = W8.slot[D.slot], b = gunStats(id, D);
  if (D.melee) {
    const a = cur ? gunStats(cur, W(cur)) : null;
    if (!a) return [{ t: 'DMG ' + Math.round(b.dmg), good: true }, { t: fmt1(b.rate) + ' swings/s', good: true }];
    return [dmgChip(a, b), chip('SWINGS', a.rate, b.rate, true, v => fmt1(v) + '/s'), chip('REACH', a.range, b.range, true, v => v.toFixed(2) + ' m')].filter(Boolean);
  }
  if (!cur) return [{ t: 'DMG ' + fmtDmg(b), good: true }, { t: 'RATE ' + fmt1(b.rate) + '/s', good: true }, { t: 'MAG ' + b.mag, good: true }];
  return compareFx(gunStats(cur, W(cur)), b);
}
// a mod applied to a copy of the gun's current numbers
function modFx(mid) {
  const m = MODS[mid], D0 = W(m.w); if (!D0) return [];
  const D1 = Object.assign({}, D0); m.stat(D1);
  const fx = compareFx(gunStats(m.w, D0), gunStats(m.w, D1));
  for (const k in MOD_FEATURE) if (D1[k] && D1[k] !== D0[k]) fx.push({ t: MOD_FEATURE[k], good: true });
  if (D1.range > (D0.range || 0)) fx.push({ t: `REACH ${(D0.range || 0).toFixed(2)} → ${D1.range.toFixed(2)} m`, good: true });
  return fx;
}
// everything the card shows besides its text: chips and a "what it's for" line
function upgradeInfo(u, c) {
  let fx = [], use = '';
  if (u.tierOf && GUN_TIERS.has(u.tierOf)) { fx = tierFx(u.target, u.tierOf); use = TIER_USE[u.tierOf]; }
  else if (u.tierOf) { fx = (UPG_FX[c.name] || []).map(t => ({ t, good: true })); use = TIER_USE[u.tierOf] || ''; }
  else if (u.weaponOf) fx = weaponFx(u.weaponOf);
  else if (u.modOf) fx = modFx(u.modOf);
  else { fx = (UPG_FX[c.name] || []).map(t => ({ t, good: true })); use = UPG_USE[c.name] || ''; }
  return { fx, use };
}
