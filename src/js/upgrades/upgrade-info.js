// What an upgrade card actually gives you: before → after stat chips, and a line saying what an attachment is for.

// what each upgrade line is for, shown under the card text
const TIER_USE = {
  ammo: 'Ammo · each bullet hits harder', trigger: 'Trigger · the gun fires faster', mag: 'Magazine · more shots before you reload',
  supp: 'Muzzle can · harder hits, much quieter shots, a smaller muzzle flash', sight: 'Sight · tighter shots down the sights, and a bigger headshot multiplier',
  laser: 'Laser · a beam shows exactly where your shots land, and tightens your shots from the hip', light: 'Light · lights up the ground ahead of you at night',
  choke: 'Choke · squeezes the pellets into a tighter cone so they reach further', armor: 'Armor · you take less damage',
  boots: 'Footwear · you move faster', hammer: 'Tool · faster, tougher boarding', eyes: 'Senses · you see more around you',
  night: 'Senses · you see in the dark', feed: 'Body · you heal when you kill'
};
const UPG_USE = {
  'Bayonet': 'Attachment · a blade under your long gun: shove (V) to stab',
  'Shoulder stock': 'Attachment · steadies your sidearm\'s kick',
  'Incendiary rounds': 'Ammo · every hit sets zombies burning for 3 seconds',
  'Through and through': 'Ammo · each bullet keeps going through one more zombie'
};
// short effect chips for upgrades that don't change a gun's numbers
const UPG_FX = {
  'Quick hands': ['Reload 25% faster'], 'Wood pile': ['+7 planks'], 'Scrounger': ['+10 scrap'], 'Field dressing': ['Health to full'], 'Med pouch': ['Carry 5 bandages, not 3'],
  'Ammo can': ['+3 cans of every ammo'], 'Strong arms': ['Melee +25%'], 'Run and gun': ['Vaulting 1.25× faster', 'Vaulting costs half the stamina', 'Shoot while vaulting'], 'Through and through': ['Pierce +1'],
  'Scavenger': ['Drops +50%'], 'Hoarder': ['1 in 4 scrap drops 2×'], 'Thick soles': ['Slowdown when hit −40%'], 'Adrenaline': ['+15% speed for 1.2 s on a kill', 'Every 4 s at most'], 'Iron lungs': ['Stamina +25%', 'Recovers sooner', 'Refills 25% faster'],
  'Bayonet': ['Shove stab: 45 damage'], 'Shoulder stock': ['Sidearm kick −45%', 'Quick shots open up 40% slower'], 'Second wind': ['+50 health below 25%, once a wave'],
  'Painkillers': ['+1 health a second'], 'Executioner': ['Headshots 2.2× → 3×'], 'Butcher': ['Dismember 2×'], 'Gunsmith': ['2 of ammo, trigger and mag +1 tier', 'Any missing ones at tier 1', '+14 scrap per one already maxed'],
  'Incendiary rounds': ['Burn 3 s on every hit'], 'Stubborn': ['Slowdown when hit −85%', '+50 max health'], 'Bullet time': ['1 in 5 kills slows time', 'Every 8 s at most'],
  'Last stand': ['+60% damage below 30% health'],
  'Bandage roll': ['+2 bandages'], 'Steady aim': ['Spread −12%'], 'Light step': ['Speed +6%'], 'Tough skin': ['+15 max health'], 'Quick draw': ['Swaps 40% faster'],
  'Field medic': ['Bandaging 30% faster'], 'Lucky shot': ['1 in 12 hits: double damage'], 'Ammo pouch': ['Ammo pickups +25%'], 'Hardened': ['Damage taken −12%'],
  'Momentum': ['+5% damage per quick kill', 'Up to +25%, lost after 2.5 s'],
  'Canvas jacket': ['+25 max health', 'Heal 25'], 'Kevlar vest': ['Damage taken −20%'], 'Plate carrier': ['Damage taken −25%', '+25 max health'],
  'Good boots': ['Speed +12%'], 'Running shoes': ['Speed +10%'], 'Trail runners': ['Speed +10%', 'Slowdown when hit −20%'],
  'Claw hammer': ['Boarding 2× faster'], 'Framing hammer': ['Boarding 1.5× faster', 'Boards +25%'], 'Nail gun': ['Boarding 2× faster', 'Boards +50%'],
  'Wide eyes': ['View cone +50%', 'See a little behind you', 'See 4 m around you'], 'Eyes in the back of your head': ['Sense 6 m around you'],
  'Night eyes': ['See far more at night'], 'Cat eyes': ['Nights look like dusk'],
  'Iron stomach': ['1 in 3 kills: +3 health', 'Up to 20 a wave'], 'Bloodthirst': ['1 in 3 kills: +5 health', 'Up to 35 a wave'], 'Vampire': ['1 in 2 kills: +6 health', 'Up to 50 a wave']
};
// upgrades that stack on what you already have, from an earlier pick of the same card or an earlier step of the same
// line: once you have some, the card's first chip shows your total before and after (Melee +25% → +56%) instead of
// just the step, and the upgrade history says what it all adds up to. v reads the stat, next is what one more pick
// makes it (the same sums as the card's ap), val writes a total out
const xTimes = v => (Math.round(v * 10) / 10) + '×';
const stackOf = (label, base, v, next, val) => ({ label, base, v, next, val });
const speedStack = m => stackOf('Speed', 1, () => S.speedMul, v => v * m, v => '+' + pctUp(v) + '%');
// (Trail runners' first chip is its speed, so only these two show the slowdown adding up)
const slowStack = k => stackOf('Slowdown when hit', 0, () => S.slowRes, v => slowAfter(v, SLOW_STEP[k]), v => '−' + Math.round(v * 100) + '%');
const STACKS = {
  'Quick hands': stackOf('Reload time', 1, () => S.reloadMul, v => v * 0.75, v => '−' + pctDown(v) + '%'),
  'Strong arms': stackOf('Melee', 1, () => S.meleeMul, v => v * 1.25, v => '+' + pctUp(v) + '%'),
  'Steady aim': stackOf('Spread', 1, () => S.spreadMul, v => v * 0.88, v => '−' + pctDown(v) + '%'),
  'Light step': speedStack(1.06),
  'Tough skin': stackOf('Max health', 100, () => S.maxHp, v => v + 15, v => String(Math.round(v))),
  'Through and through': stackOf('Pierce', 0, () => S.pierce, v => v + 1, v => '+' + v),
  'Scavenger': stackOf('Drops', 1, () => S.dropMul, v => v * 1.5, v => '+' + pctUp(v) + '%'),
  'Painkillers': stackOf('Regen', 0, () => S.regen, v => v + 1, v => v + ' health/s'),
  'Thick soles': slowStack('soles'), 'Stubborn': slowStack('stubborn'),
  'Running shoes': speedStack(1.1), 'Trail runners': speedStack(1.1),
  'Plate carrier': stackOf('Damage taken', 1, () => S.dmgTaken, v => v * 0.75, v => '−' + pctDown(v) + '%'),
  'Framing hammer': stackOf('Boarding speed', 1, () => S.boardSpeed, v => v * 1.5, xTimes),
  'Nail gun': stackOf('Boarding speed', 1, () => S.boardSpeed, v => v * 2, xTimes)
};
// what a stacking upgrade adds up to once taken, for the history ('' when it doesn't stack on anything yet)
const stackTotal = (name, before) => { const st = STACKS[name]; return st && Math.abs(before - st.base) > 1e-6 ? `${st.label} ${st.val(st.v())} in all` : ''; };
// a gun's headline numbers, as the card compares them
function gunStats(id, D) {
  const mag = D.melee ? 0 : Math.max(1, Math.round(D.mag * S.magMul));
  // a reload from empty: shell by shell (two or three a go with a speed loader), or one mag change
  const reload = D.melee ? 0 : (D.perShell ? Math.ceil(mag / (D.loadN || 1)) * D.perShell + 0.12 : D.reload || 0) * S.reloadMul;
  return { dmg: D.dmg, pel: D.pellets || 1, rate: 1 / D.rate, mag, reload, spread: (D.spread || 0) * 1.3 * (D.hipK || 1), aim: (D.spread || 0) * 0.5 * (D.aimK || 1), head: headMulFor(D), range: D.range || 0, hits: D.melee ? D.cleave || 1 : 0, stam: D.melee ? stamCost(D) : 0 };
}
// a "LABEL before → after" chip, green when it's better, red when it's worse; nothing when it doesn't change. (A chip
// whose good is null is a plain stat, shown grey: chipCls)
const chipCls = f => f.good === null ? 'eq' : f.good ? 'up' : 'down', CHIP_MARK = { up: '▲', down: '▼', eq: '•' };
function chip(label, a, b, higherIsBetter, fmt) {
  if (Math.abs(a - b) < 1e-6) return null;
  return { t: `${label} ${fmt(a)} → ${fmt(b)}`, good: (b > a) === higherIsBetter };
}
const fmtDmg = s => Math.round(s.dmg) + (s.pel > 1 ? '×' + s.pel : ''), fmt1 = v => v.toFixed(1), fmt0 = v => String(Math.round(v)), fmtDeg = v => { const d = v * 57.3; return d.toFixed(d < 2 ? 2 : 1) + '°'; };
// spread from the hip and down the sights: one SPREAD chip when both move together, otherwise a chip for each that
// changes (a laser only the hip, a sight only the aimed)
function spreadChips(a, b) {
  const kh = a.spread ? b.spread / a.spread : 1, ka = a.aim ? b.aim / a.aim : 1;
  if (Math.abs(kh - ka) < 1e-6) return [chip('SPREAD', a.spread, b.spread, false, fmtDeg)];
  return [chip('HIP SPREAD', a.spread, b.spread, false, fmtDeg), chip('AIMED SPREAD', a.aim, b.aim, false, fmtDeg)];
}
// damage is judged per shot (pellets included) but written per hit, e.g. 15×8 → 17×9
function dmgChip(a, b) { const ta = a.dmg * a.pel, tb = b.dmg * b.pel; return Math.abs(ta - tb) < 1e-6 ? null : { t: `DMG ${fmtDmg(a)} → ${fmtDmg(b)}`, good: tb > ta }; }
function compareFx(a, b) {
  return [dmgChip(a, b), chip(a.mag ? 'RATE' : 'SWINGS', a.rate, b.rate, true, v => fmt1(v) + '/s'), chip('MAG', a.mag, b.mag, true, fmt0), chip('RELOAD', a.reload, b.reload, false, v => fmt1(v) + ' s'),
    ...spreadChips(a, b), chip('HEADSHOT', a.head, b.head, true, v => '×' + Math.round(v * 100) / 100)].filter(Boolean);
}
// mods that add a feature rather than a number
const MOD_FEATURE = { akimbo: 'A gun in each hand: left and right click', gl: 'Grenade on G, every 6 s', burst: 'Burst fire (B to switch)', fullAuto: 'Full auto (B cycles modes)', both: 'Both barrels at once', quiet: 'Silent shots',
  ignite: 'Sets zombies alight', explode: 'Exploding rounds', bipod: 'Bipod: steady when you stand still', alwaysSever: 'Always takes the limb off', bleed: 'Makes zombies bleed out', pierce: 'Goes through zombies' };
// try a gun's next tier for real, read its numbers, then put it back
function tierFx(id, k) {
  if (!id) return [];
  const n = gunTier(id, k), D0 = W(id), a = gunStats(id, D0);
  W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = n + 1; recomputeEff();
  const b = gunStats(id, W(id));
  W8.gt[id][k] = n; recomputeEff();
  if (k === 'supp' && !D0.quiet) { a.dmg *= [1, 1.1, 1.2, 1.3][n]; b.dmg *= [1, 1.1, 1.2, 1.3][n + 1]; }   // the can's bonus is applied as you fire
  if (k === 'choke') { const m = [1, 0.7, 0.49]; a.spread *= m[n]; b.spread *= m[n + 1]; a.aim *= m[n]; b.aim *= m[n + 1]; }
  const fx = compareFx(a, b);
  if (k === 'supp') fx.push({ t: n ? 'Even quieter' : 'Quiet shots', good: true });
  if (k === 'light') fx.push({ t: n ? 'Brighter, wider beam' : 'Night beam ahead of you', good: true });
  if (k === 'laser') fx.push({ t: 'Aim beam', good: true });
  if (k === 'loader') fx.push({ t: id === 'revolver' ? 'Six rounds at once' : `${n + 2} shells a go`, good: true });
  if (k === 'sight' && n === 2) fx.push({ t: 'Zooms in, crits at range', good: true });
  return fx;
}
// a new weapon against the one it would replace in that slot
function weaponFx(id) {
  const D = W(id), cur = W8.slot[D.slot], b = gunStats(id, D);
  if (D.melee) {
    const a = cur ? gunStats(cur, W(cur)) : null;
    if (!a) return [{ t: 'DMG ' + Math.round(b.dmg), good: true }, { t: fmt1(b.rate) + ' swings/s', good: true }, hitsChip(null, b)];
    return [dmgChip(a, b), chip('SWINGS', a.rate, b.rate, true, v => fmt1(v) + '/s'), chip('REACH', a.range, b.range, true, v => v.toFixed(2) + ' m'), hitsChip(a, b), chip('STAMINA/SWING', a.stam, b.stam, false, v => Math.round(v * 100) + '%')].filter(Boolean);
  }
  if (!cur) return [{ t: 'DMG ' + fmtDmg(b), good: true }, { t: 'RATE ' + fmt1(b.rate) + '/s', good: true }, { t: 'MAG ' + b.mag, good: true }];
  return compareFx(gunStats(cur, W(cur)), b);
}
// how many zombies a melee weapon's swing lands on, as a stat on its card: always shown for a new weapon (the card's
// description never says), as before → after when it differs from the one it replaces
const fmtHits = v => v > 1 ? '×' + v : 'single';
function hitsChip(a, b) {
  if (a && a.hits !== b.hits) return { t: `MULTI-HIT ${fmtHits(a.hits)} → ${fmtHits(b.hits)}`, good: b.hits > a.hits };
  return { t: b.hits > 1 ? `MULTI-HIT ×${b.hits}` : 'SINGLE HIT', good: null };   // the same as now: a plain stat, neither better nor worse
}
// a melee weapon that only hit the nearest zombie and now sweeps through more (reachCleave, melee/melee-stats.js)
const multiHit = (D0, D1) => (D0.cleave || 1) < 2 && (D1.cleave || 1) >= 2 ? { t: `+ Multi-hit: ${D1.cleave} at once`, good: true } : null;
// a mod applied to a copy of the gun's current numbers
function modFx(mid) {
  const m = MODS[mid], D0 = W(m.w); if (!D0) return [];
  const D1 = Object.assign({}, D0); m.stat(D1); reachCleave(D1);
  const fx = compareFx(gunStats(m.w, D0), gunStats(m.w, D1));
  for (const k in MOD_FEATURE) if (D1[k] && D1[k] !== D0[k]) fx.push({ t: MOD_FEATURE[k], good: true });
  if (D1.range > (D0.range || 0)) fx.push({ t: `REACH ${(D0.range || 0).toFixed(2)} → ${D1.range.toFixed(2)} m`, good: true });
  if (D0.melee) { const t = multiHit(D0, D1) || chip('TARGETS', D0.cleave || 1, D1.cleave || 1, true, fmt0); if (t) fx.push(t); }
  // a longer barrel: how far out it keeps its full damage (weapons/ammo.js)
  const F = FALLOFF[m.w]; if (F && (D1.reach || 1) !== (D0.reach || 1)) fx.push(chip('FULL DMG TO', F[0] * (D0.reach || 1), F[0] * D1.reach, true, v => v.toFixed(1) + ' m'));
  return fx;
}
// a mod you have, made one level better (weapons/mod-levels.js), against how it is now
function improveFx(id, m) {
  const D0 = W(id), D1 = Object.assign({}, D0); MOD_UP[m].up(D1); reachCleave(D1);
  const fx = compareFx(gunStats(id, D0), gunStats(id, D1));
  if (D1.range > (D0.range || 0)) fx.push({ t: `REACH ${(D0.range || 0).toFixed(2)} → ${D1.range.toFixed(2)} m`, good: true });
  if (D0.melee) { const t = multiHit(D0, D1) || chip('TARGETS', D0.cleave || 1, D1.cleave || 1, true, fmt0); if (t) fx.push(t); }
  if ((D1.burst || 0) > (D0.burst || 0)) fx.push({ t: `BURST ${D0.burst} → ${D1.burst}`, good: true });
  if ((D1.pierce || 0) > (D0.pierce || 0)) fx.push({ t: `PIERCE ${D0.pierce || 0} → ${D1.pierce}`, good: true });
  if ((D1.critC || 0) > (D0.critC || 0)) fx.push({ t: `CRITS ${Math.round(D0.critC * 100)}% → ${Math.round(D1.critC * 100)}%`, good: true });
  if ((D1.explode || 0) > (D0.explode || 0)) fx.push({ t: 'Bigger blasts', good: true });
  if ((D1.glRecharge || 0) && D1.glRecharge < D0.glRecharge) fx.push({ t: `GRENADE ${fmt1(D0.glRecharge)} → ${fmt1(D1.glRecharge)} s`, good: true });
  const F = FALLOFF[id]; if (F && (D1.reach || 1) !== (D0.reach || 1)) fx.push(chip('FULL DMG TO', F[0] * (D0.reach || 1), F[0] * D1.reach, true, v => v.toFixed(1) + ' m'));
  return fx;
}
// a workbench tune-up (TUNE, game/run-state.js) against the weapon as it is
function tuneFx(id) {
  if (W8.tune[id]) return [];
  W8.tune[id] = 1; recomputeEff(); const b = gunStats(id, W(id)), Rb = W(id).range; W8.tune[id] = 0; recomputeEff();
  const D0 = W(id), fx = compareFx(gunStats(id, D0), b);
  if (D0.melee && Rb > D0.range) fx.push({ t: `REACH ${D0.range.toFixed(2)} → ${Rb.toFixed(2)} m`, good: true });
  if (!D0.melee) { const x = Math.max(D0.critM || 0, 2) + (D0.critUp || 0); fx.push({ t: `CRITS +${Math.round(TUNE.crit * 100)}% of hits`, good: true }, { t: `CRIT DMG ×${x} → ×${x + TUNE.critM}`, good: true }); }
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
  // stacking on what you already have: the first chip shows the total going up
  const st = !u.weaponOf && !u.modOf && STACKS[c.name], v = st && st.v();
  if (st && Math.abs(v - st.base) > 1e-6) fx[0] = { t: `${st.label} ${st.val(v)} → ${st.val(st.next(v))}`, good: true };
  return { fx, use };
}
