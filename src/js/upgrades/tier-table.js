// Tiered upgrade lines (per-gun attachment tiers and character tiers).

// tiered upgrade lines: each step has its own name, rarity and look (as: what a particular gun calls it instead)
const TIERS = {
  ammo: { tag: 'Ammo', t: [
    { r: 'c', name: 'Hollow points', text: '+25% damage.', vis: 'Copper hollow-point tips on its rounds', ap: () => S.dmgMul *= 1.25 },
    { r: 'u', name: '+P loads', text: '+20% damage.', vis: 'Hotter, orange tracers', ap: () => S.dmgMul *= 1.2 },
    { r: 'e', name: 'Match-grade rounds', text: '+25% damage and more headshots.', vis: 'Polished nickel rounds', ap: () => { S.dmgMul *= 1.25; S.headBonus += 0.1; } }] },
  trigger: { tag: 'Gun', t: [
    { r: 'c', name: 'Light trigger', text: 'Fires 18% faster.', ap: () => S.rateMul *= 1.18 },
    { r: 'u', name: 'Match trigger', text: 'Fires 15% faster.', ap: () => S.rateMul *= 1.15 },
    { r: 'r', name: 'Hair trigger', text: 'Fires 20% faster.', ap: () => S.rateMul *= 1.2 }] },
  // the pistol's own names for them, after what it's given (weapons/gun-models.js): a +5 base plate, a long stick, a drum
  mag: { tag: 'Gun', t: [
    { r: 'c', name: 'Extended mags', as: { pistol: 'Mag plate' }, text: 'Holds 40% more rounds.', vis: 'Longer mags', ap: () => S.magMul *= 1.4 },
    { r: 'r', name: 'Drum magazines', as: { pistol: 'Extended mag' }, text: 'Holds twice as many rounds as stock.', vis: 'Round drums on box-fed guns', ap: () => S.magMul *= 1.43 },
    { r: 'e', name: 'Casket magazines', as: { pistol: 'Drum mag' }, text: 'Holds almost 3× as many rounds as stock.', vis: 'Bigger drums', ap: () => S.magMul *= 1.35 }] },
  supp: { tag: 'Attachment', t: [
    { r: 'u', name: 'Oil-filter can', text: 'Quieter shots, +10% damage. Uses the muzzle slot.', vis: 'An oil filter on the muzzle', ap: () => {} },
    { r: 'r', name: 'Suppressor', text: 'Very quiet shots, +20% damage.', vis: 'A long steel can', ap: () => {} },
    { r: 'e', name: 'Heavy-duty suppressor', text: 'Very quiet, +30% damage, and bullets go through 1 more zombie.', vis: 'A thick, long can', ap: () => S.pierce++ }] },
  sight: { tag: 'Attachment', t: [
    { r: 'c', name: 'Red dot', text: '15% tighter aim and more headshots.', vis: 'A red dot sight', ap: () => { S.spreadMul *= 0.85; S.headBonus += 0.04; } },
    { r: 'u', name: 'Holographic sight', text: '20% tighter aim and more headshots.', vis: 'A holo sight', ap: () => { S.spreadMul *= 0.8; S.headBonus += 0.06; } },
    { r: 'r', name: 'Scope', text: 'Rifles only. While aiming: 1 in 4 hits does double damage, headshots +25%, dead accurate past 10 m.', vis: 'A scope on the rifle', ap: () => {} }] },
  laser: { tag: 'Attachment', t: [
    { r: 'u', name: 'Laser pointer', text: 'Shows where you\'re aiming. 15% tighter aim.', vis: 'A taped-on laser', ap: () => S.spreadMul *= 0.85 },
    { r: 'r', name: 'Laser sight', text: 'A brighter beam. 30% tighter aim.', vis: 'A mounted laser', ap: () => S.spreadMul *= 0.7 }] },
  light: { tag: 'Attachment', t: [
    { r: 'u', name: 'Taped flashlight', text: 'Lights the ground ahead of you at night.', vis: 'A flashlight taped on', ap: () => {} },
    { r: 'r', name: 'Weapon light', text: 'A brighter, wider light.', vis: 'A mounted light', ap: () => {} }] },
  // a speed loader: on a shotgun it feeds two shells at a go (three at level II), each go a little quicker; on the
  // revolver all six rounds go in at once from a loader you then drop (weapons/reload.js)
  loader: { tag: 'Attachment', t: [
    { r: 'u', name: 'Speed loader', text: D => D.ammo === 'shells' ? 'Load 2 shells at a time, a little faster.' : 'Load all 6 rounds at once.', vis: 'A loader at hand', ap: () => {} },
    { r: 'r', name: 'Speed loader II', text: () => 'Load 3 shells at a time, faster again.', vis: 'A bigger loader', ap: () => {} }] },
  choke: { tag: 'Attachment', can: () => hasShotgun(), t: [
    { r: 'u', name: 'Modified choke', text: 'Pellets 30% tighter, slugs 45% tighter. Uses the muzzle slot.', vis: 'A choke ring', ap: () => {} },
    { r: 'r', name: 'Full choke', text: 'Pellets 30% tighter again, slugs tighter too.', vis: 'A longer choke', ap: () => {} }] },
  armor: { tag: 'Body', t: [
    { r: 'c', name: 'Canvas jacket', text: '+25 max health, and heal 25.', vis: 'You wear it', ap: () => { S.maxHp += 25; P.hp = Math.min(S.maxHp, P.hp + 25); } },
    { r: 'r', name: 'Kevlar vest', text: 'Take 20% less damage.', vis: 'Worn over the jacket', ap: () => S.dmgTaken *= 0.8 },
    { r: 'e', name: 'Plate carrier', text: 'Take 25% less damage. +25 max health.', vis: 'Steel plates and pouches', ap: () => { S.dmgTaken *= 0.75; S.maxHp += 25; P.hp += 25; } }] },
  boots: { tag: 'Body', t: [
    { r: 'c', name: 'Good boots', text: 'Move 12% faster.', ap: () => S.speedMul *= 1.12 },
    { r: 'u', name: 'Running shoes', text: 'Move 10% faster.', ap: () => S.speedMul *= 1.1 },
    { r: 'r', name: 'Trail runners', text: 'Move 10% faster. Hits slow you less.', ap: () => { S.speedMul *= 1.1; S.slowRes += 0.2; } }] },
  hammer: { tag: 'Tools', t: [
    { r: 'c', name: 'Claw hammer', text: 'Board up twice as fast.', ap: () => S.boardSpeed *= 2 },
    { r: 'u', name: 'Framing hammer', text: 'Board up 50% faster. Boards are 25% tougher.', ap: () => { S.boardSpeed *= 1.5; S.boardMul *= 1.25; } },
    { r: 'r', name: 'Nail gun', text: 'Board up twice as fast again. Boards are 50% tougher.', ap: () => { S.boardSpeed *= 2; S.boardMul *= 1.5; } }] },
  eyes: { tag: 'Senses', t: [
    { r: 'c', name: 'Wide eyes', text: 'See 25% wider.', ap: () => S.cone += 0.3 },
    { r: 'u', name: 'Peripheral vision', text: 'See wider, and sense zombies within 4 m behind you.', ap: () => { S.cone += 0.3; S.near = 4; } },
    { r: 'r', name: 'Eyes in the back of your head', text: 'Sense zombies within 6 m in every direction.', ap: () => { S.cone += 0.2; S.near = 6; } }] },
  night: { tag: 'Senses', t: [
    { r: 'r', name: 'Night eyes', text: 'See much further at night.', ap: () => S.nightVis = 1 },
    { r: 'e', name: 'Cat eyes', text: 'See almost everything at night.', ap: () => S.nightVis = 2.2 }] },
  feed: { tag: 'Body', t: [
    { r: 'r', name: 'Iron stomach', text: 'Heal 2 per kill, 4 per headshot kill.', ap: () => { S.healOnKill = 2; S.headHeal = true; } },
    { r: 'e', name: 'Bloodthirst', text: 'Heal 4 per kill, 8 per headshot kill.', ap: () => { S.healOnKill = 4; S.headHeal = true; } },
    { r: 'l', name: 'Vampire', text: 'Heal 6 per kill, 12 per headshot kill.', ap: () => { S.healOnKill = 6; S.vampire = S.headHeal = true; } }] }
};
// what tier n of line k is called on gun id
const tierName = (k, n, id) => { const st = TIERS[k].t[n]; return (st.as && st.as[id]) || st.name; };
