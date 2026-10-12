// Tiered upgrade lines (per-gun attachment tiers and character tiers).

// tiered upgrade lines: each step has its own name, rarity and look
const TIERS = {
  ammo: { tag: 'Ammo', t: [
    { r: 'c', name: 'Hollow points', text: 'Deals 25% more damage.', vis: 'Copper hollow-point tips on its rounds', ap: () => S.dmgMul *= 1.25 },
    { r: 'u', name: '+P loads', text: 'Hotter rounds: another 20% damage.', vis: 'Hotter, orange tracers', ap: () => S.dmgMul *= 1.2 },
    { r: 'e', name: 'Match-grade rounds', text: 'Another 25% damage and more headshots.', vis: 'Polished nickel rounds', ap: () => { S.dmgMul *= 1.25; S.headBonus += 0.1; } }] },
  trigger: { tag: 'Gun', t: [
    { r: 'c', name: 'Light trigger', text: 'Fires 18% faster.', ap: () => S.rateMul *= 1.18 },
    { r: 'u', name: 'Match trigger', text: 'Fire another 15% faster.', ap: () => S.rateMul *= 1.15 },
    { r: 'r', name: 'Hair trigger', text: 'Fire another 20% faster.', ap: () => S.rateMul *= 1.2 }] },
  mag: { tag: 'Gun', t: [
    { r: 'c', name: 'Extended mags', text: 'Magazines and tubes hold 40% more.', vis: 'Longer mags', ap: () => S.magMul *= 1.4 },
    { r: 'r', name: 'Drum magazines', text: 'Twice the stock capacity.', vis: 'Round drums on box-fed guns', ap: () => S.magMul *= 1.43 },
    { r: 'e', name: 'Casket magazines', text: 'Close to three times stock capacity.', vis: 'Bigger drums', ap: () => S.magMul *= 1.35 }] },
  supp: { tag: 'Attachment', t: [
    { r: 'u', name: 'Oil-filter can', text: 'A homemade can: quieter, +10% damage. Not on choked shotguns.', vis: 'An oil filter on the muzzle', ap: () => {} },
    { r: 'r', name: 'Suppressor', text: 'A proper can: +20% damage, very quiet.', vis: 'A long steel can', ap: () => {} },
    { r: 'e', name: 'Heavy-duty suppressor', text: '+30% damage and bullets go through one more zombie.', vis: 'A thick, long can', ap: () => S.pierce++ }] },
  sight: { tag: 'Attachment', t: [
    { r: 'c', name: 'Red dot', text: 'Spread down 15% and a few more headshots.', vis: 'A red dot sight', ap: () => { S.spreadMul *= 0.85; S.headBonus += 0.04; } },
    { r: 'u', name: 'Holographic sight', text: 'Spread down another 20%, more headshots.', vis: 'A holo sight', ap: () => { S.spreadMul *= 0.8; S.headBonus += 0.06; } },
    { r: 'r', name: 'Scope', text: 'Long guns find the head much more often.', vis: 'A scope on long guns', ap: () => S.headBonus += 0.12 }] },
  laser: { tag: 'Attachment', t: [
    { r: 'u', name: 'Laser pointer', text: 'A thin beam to aim with. Spread down 15%.', vis: 'A taped-on laser', ap: () => S.spreadMul *= 0.85 },
    { r: 'r', name: 'Laser sight', text: 'A bright mounted beam. Spread down another 30%.', vis: 'A mounted laser', ap: () => S.spreadMul *= 0.7 }] },
  light: { tag: 'Attachment', t: [
    { r: 'u', name: 'Taped flashlight', text: 'Lights the ground ahead of you at night.', vis: 'A flashlight taped on', ap: () => {} },
    { r: 'r', name: 'Weapon light', text: 'A much brighter, wider beam.', vis: 'A mounted light', ap: () => {} }] },
  choke: { tag: 'Attachment', can: () => hasShotgun(), t: [
    { r: 'u', name: 'Modified choke', text: 'Pellets 30% tighter. A choked shotgun cannot take a suppressor.', vis: 'A choke ring', ap: () => {} },
    { r: 'r', name: 'Full choke', text: 'Pellets another 30% tighter.', vis: 'A longer choke', ap: () => {} }] },
  armor: { tag: 'Body', t: [
    { r: 'c', name: 'Canvas jacket', text: '+25 max health. Heals 25 now.', vis: 'You wear it', ap: () => { S.maxHp += 25; P.hp = Math.min(S.maxHp, P.hp + 25); } },
    { r: 'r', name: 'Kevlar vest', text: 'Take 25% less damage.', vis: 'Worn over the jacket', ap: () => S.dmgTaken *= 0.75 },
    { r: 'e', name: 'Plate carrier', text: 'Another 30% less damage and +25 max health.', vis: 'Steel plates and pouches', ap: () => { S.dmgTaken *= 0.7; S.maxHp += 25; P.hp += 25; } }] },
  boots: { tag: 'Body', t: [
    { r: 'c', name: 'Good boots', text: 'Walk 12% faster.', ap: () => S.speedMul *= 1.12 },
    { r: 'u', name: 'Running shoes', text: 'Walk another 10% faster.', ap: () => S.speedMul *= 1.1 },
    { r: 'r', name: 'Trail runners', text: 'Another 10% faster, and hits slow you less.', ap: () => { S.speedMul *= 1.1; S.slowRes += 0.2; } }] },
  hammer: { tag: 'Tools', t: [
    { r: 'c', name: 'Claw hammer', text: 'Board up twice as fast.', ap: () => S.boardSpeed *= 2 },
    { r: 'u', name: 'Framing hammer', text: 'Faster again, and new boards are 25% tougher.', ap: () => { S.boardSpeed *= 1.5; S.boardMul *= 1.25; } },
    { r: 'r', name: 'Nail gun', text: 'Boards go up almost instantly and are 50% tougher.', ap: () => { S.boardSpeed *= 2; S.boardMul *= 1.5; } }] },
  eyes: { tag: 'Senses', t: [
    { r: 'c', name: 'Wide eyes', text: 'Your field of view is about 25% wider.', ap: () => S.cone += 0.3 },
    { r: 'u', name: 'Peripheral vision', text: 'Wider again, and you notice zombies closer behind you.', ap: () => { S.cone += 0.3; S.near = 4; } },
    { r: 'r', name: 'Eyes in the back of your head', text: 'You sense anything within 6 metres, any direction.', ap: () => { S.cone += 0.2; S.near = 6; } }] },
  night: { tag: 'Senses', t: [
    { r: 'r', name: 'Night eyes', text: 'You see far more at night.', ap: () => S.nightVis = 1 },
    { r: 'e', name: 'Cat eyes', text: 'Nights look like dusk. You see almost everything.', ap: () => S.nightVis = 2.2 }] },
  feed: { tag: 'Body', t: [
    { r: 'r', name: 'Iron stomach', text: 'Heal 3 health for every kill.', ap: () => S.healOnKill = 3 },
    { r: 'e', name: 'Bloodthirst', text: 'Heal 6 health for every kill.', ap: () => S.healOnKill = 6 },
    { r: 'l', name: 'Vampire', text: 'Heal 10 for every kill, 20 for headshot kills.', ap: () => { S.healOnKill = 10; S.vampire = true; } }] }
};
