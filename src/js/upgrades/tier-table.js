// Tiered upgrade lines (per-gun attachment tiers and character tiers).

// tiered upgrade lines: each step has its own name, rarity and look (as: what a particular gun calls it instead)
// what each step of the feeding line gives: health a feed, the odds a kill (a headshot kill) feeds you, the most a wave
const FEED = [null, { h: 3, p: 1 / 3, ph: 0.5, cap: 20 }, { h: 5, p: 1 / 3, ph: 0.5, cap: 35 }, { h: 6, p: 0.5, ph: 1, cap: 50 }];
// what a sight step does for your aimed shots, against the step before: how much tighter, and how much of the spread
// moving adds to them it takes away
const sightText = n => `Shots aimed down the sights ${Math.round((1 - SIGHT_AIM[n] / SIGHT_AIM[n - 1]) * 100)}% tighter${n > 1 ? ' again' : ''}, and ${Math.round((1 - SIGHT_MOVE[n] / SIGHT_MOVE[n - 1]) * 100)}% steadier on the move.`;
const TIERS = {
  // the powder behind every round, whichever kind is loaded (weapons/rounds.js): this line is the gun's damage, the
  // round is what it does (the line's key is still 'ammo')
  ammo: { tag: 'Powder', t: [
    { r: 'c', name: 'Hand-loads', text: '+25% damage, whatever round is loaded.', vis: 'Rounds loaded by hand to a hotter charge', ap: () => S.dmgMul *= 1.25 },
    { r: 'u', name: '+P loads', text: '+20% damage.', vis: 'Hotter, orange tracers', ap: () => S.dmgMul *= 1.2 },
    { r: 'e', name: 'Match-grade loads', text: '+25% damage. Headshot multiplier +0.3×.', vis: 'Every charge weighed out the same', ap: () => S.dmgMul *= 1.25 }] },
  trigger: { tag: 'Gun', t: [
    { r: 'c', name: 'Light trigger', text: 'Fires 18% faster.', ap: () => S.rateMul *= 1.18 },
    { r: 'u', name: 'Match trigger', text: 'Fires 15% faster.', ap: () => S.rateMul *= 1.15 },
    { r: 'r', name: 'Hair trigger', text: 'Fires 20% faster.', ap: () => S.rateMul *= 1.2 }] },
  // the pistol's own names for them, after what it's given (weapons/gun-models.js): a +5 base plate, a long stick, a drum
  mag: { tag: 'Gun', t: [
    // the drum shotgun's one step is its drum (MAG_UP, game/run-state.js), priced as a rare one (rAs)
    // the pump's are its tube extended toward the muzzle, the M60's a longer belt in a deeper box, the SMG's longer
    // curved mags (they used to be mods of their own: weapons/gun-mods.js)
    { r: 'c', name: 'Extended mags', as: { pistol: 'Mag plate', deagle: 'Mag plate', auto12: 'Drum mag', pump: 'Tube extension', lmg: '140-round belt' }, rAs: { auto12: 'r' }, text: D => D.drumMag ? 'Swaps the 8-shell box for a 20-shell drum.' : 'Holds 40% more rounds.', vis: 'Longer mags', ap: () => S.magMul *= 1.4 },
    { r: 'r', name: 'Drum magazines', as: { pistol: 'Extended mag', deagle: 'Extended mag', pump: 'Long tube', lmg: '200-round belt', sub: 'Double-stack mags' }, text: 'Holds twice as many rounds as stock.', vis: 'Round drums on box-fed guns', ap: () => S.magMul *= 1.43 },
    { r: 'e', name: 'Casket magazines', as: { pistol: 'Drum mag', pump: 'Full-length tube', lmg: '270-round belt' }, text: 'Holds almost 3× as many rounds as stock.', vis: 'Bigger drums', ap: () => S.magMul *= 1.35 }] },
  // the SMG's is the SD's integral can, its barrel swapped for it (weapons/gun-models.js)
  supp: { tag: 'Attachment', t: [
    { r: 'u', name: 'Oil-filter can', as: { sub: 'Integral suppressor' }, text: 'Quieter shots, +10% damage. Uses the muzzle slot.', vis: 'An oil filter on the muzzle', ap: () => {} },
    { r: 'r', name: 'Suppressor', as: { sub: 'Integral suppressor II' }, text: 'Very quiet shots, +20% damage.', vis: 'A long steel can', ap: () => {} },
    { r: 'e', name: 'Heavy-duty suppressor', as: { sub: 'Integral suppressor III' }, text: 'Very quiet shots, +30% damage.', vis: 'A thick, long can', ap: () => {} }] },
  sight: { tag: 'Attachment', t: [
    // every sight only tightens your aimed shots, standing and on the move (SIGHT_AIM, SIGHT_MOVE in game/run-state.js);
    // on a sniper it also raises the headshot multiplier, and through a scope its headshots crit (SCOPES)
    { r: 'c', name: 'Red dot', text: D => sightText(1, D) + (D && D.sniper ? ' Headshot multiplier +0.15×.' : ''), vis: 'A red dot sight', ap: () => {} },
    { r: 'u', name: 'Holographic sight', text: D => sightText(2, D) + (D && D.sniper ? ' Headshot multiplier +0.15× more.' : ''), vis: 'A holo sight', ap: () => {} },
    { r: 'r', name: 'Scope', text: D => 'Rifles and the revolver only. Zooms in when you aim. ' + sightText(3, D) + ' Dead accurate past 10 m.' + (D && D.sniper ? ' Every headshot while aiming is a crit (2× damage).' : ''), vis: 'A scope in rings', ap: () => {} },
    { r: 'e', name: 'ACOG', text: D => 'Rifles only. Zooms in further. ' + sightText(4, D) + (D && D.sniper ? ' Headshot crits do 2.25×.' : ''), vis: 'A 4× ACOG, its fibre optic glowing red on top', ap: () => {} },
    { r: 'l', name: 'High-power scope', text: D => 'Hunting rifle only. Zooms in furthest. ' + sightText(5, D) + ' Headshot crits do 2.5×.', vis: 'A big scope', ap: () => {} }] },
  laser: { tag: 'Attachment', t: [
    { r: 'u', name: 'Laser pointer', text: 'Shows where your shots go. Shots from the hip 20% tighter.', vis: 'A taped-on laser', ap: () => {} },
    { r: 'r', name: 'Laser sight', text: 'A brighter beam. Shots from the hip 25% tighter again.', vis: 'A mounted laser', ap: () => {} }] },
  light: { tag: 'Attachment', t: [
    { r: 'u', name: 'Taped flashlight', text: 'Lights the ground ahead of you at night.', vis: 'A flashlight taped on', ap: () => {} },
    { r: 'r', name: 'Weapon light', text: 'A brighter, wider light.', vis: 'A mounted light', ap: () => {} }] },
  // a speed loader: on a shotgun it feeds two shells at a go (three at level II), each go a little quicker; on the
  // revolver all six rounds go in at once from a loader you then drop (weapons/reload.js). On the double barrel it's
  // Sleight of Hand, its one step: both shells palmed and pushed in together
  loader: { tag: 'Attachment', t: [
    { r: 'u', name: 'Speed loader', as: { dbl: 'Sleight of Hand' }, text: D => D.breakOpen ? 'Load both shells at once instead of one at a time.' : D.ammo === 'shells' ? 'Load 2 shells at a time, a little faster.' : 'Load all 6 rounds at once.', vis: 'A loader at hand', ap: () => {} },
    { r: 'r', name: 'Speed loader II', text: () => 'Load 3 shells at a time, faster again.', vis: 'A bigger loader', ap: () => {} }] },
  choke: { tag: 'Attachment', can: () => hasShotgun(), t: [
    { r: 'u', name: 'Modified choke', text: 'Pellets 30% tighter, slugs 45% tighter. Uses the muzzle slot.', vis: 'A choke ring', ap: () => {} },
    { r: 'r', name: 'Full choke', text: 'Pellets 30% tighter again, slugs tighter too.', vis: 'A longer choke', ap: () => {} }] },
  // armour, footwear and the hammer are skills (TIER_KIND, upgrades/upgrades.js), so none starts below uncommon
  armor: { tag: 'Body', t: [
    { r: 'u', name: 'Canvas jacket', text: '+25 max health, and heal 25.', vis: 'You wear it', ap: () => { S.maxHp += 25; P.hp = Math.min(S.maxHp, P.hp + 25); } },
    { r: 'r', name: 'Kevlar vest', text: 'Take 20% less damage.', vis: 'Worn over the jacket', ap: () => S.dmgTaken *= 0.8 },
    { r: 'e', name: 'Plate carrier', text: 'Take 25% less damage. +25 max health.', vis: 'Steel plates and pouches', ap: () => { S.dmgTaken *= 0.75; S.maxHp += 25; P.hp += 25; } }] },
  boots: { tag: 'Body', t: [
    { r: 'u', name: 'Good boots', text: 'Move 12% faster.', ap: () => S.speedMul *= 1.12 },
    { r: 'u', name: 'Running shoes', text: 'Move 10% faster.', ap: () => S.speedMul *= 1.1 },
    { r: 'r', name: 'Trail runners', text: 'Move 10% faster.', ap: () => S.speedMul *= 1.1 }] },
  hammer: { tag: 'Tools', t: [
    { r: 'u', name: 'Claw hammer', text: 'Board up twice as fast.', ap: () => S.boardSpeed *= 2 },
    { r: 'u', name: 'Framing hammer', text: 'Board up 50% faster. Boards are 25% tougher.', ap: () => { S.boardSpeed *= 1.5; S.boardMul *= 1.25; } },
    { r: 'r', name: 'Nail gun', text: 'Board up twice as fast again. Boards are 50% tougher.', ap: () => { S.boardSpeed *= 2; S.boardMul *= 1.5; } }] },
  eyes: { tag: 'Senses', t: [
    // wide eyes (what were Wide eyes and Peripheral vision): a much wider cone, its edges reaching a little way round
    // behind your shoulders, and a bigger circle round you
    { r: 'u', name: 'Wide eyes', text: 'See 50% wider, round to a little behind you, and anything within 4 m.', ap: () => { S.cone += 0.6; S.near = 4; } },
    { r: 'r', name: 'Eyes in the back of your head', text: 'Sense zombies within 6 m in every direction.', ap: () => { S.cone += 0.2; S.near = 6; } }] },
  night: { tag: 'Senses', t: [
    // a night vision monocular (one tube on a head mount, player/gear.js), then binocular goggles (two)
    { r: 'r', name: 'Night vision monocular', text: 'See much further at night, with a hint of colour.', ap: () => S.nightVis = 1 },
    { r: 'e', name: 'Night vision goggles', text: 'See almost everything at night, in muted colour.', ap: () => S.nightVis = 2.2 }] },
  // perks that come in steps: harder melee hits that cost less stamina a swing (S.swingStam, melee/melee.js); shooting
  // at a sprint (S.runGun, player/sprint.js), 9mm guns first, then shotguns and the assault rifle too, reloading on the
  // run; and less slowdown when you're hit
  strong: { tag: 'Melee', t: [
    { r: 'u', name: 'Strong arms', text: 'Melee hits 25% harder. Swings cost 8% less stamina.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } },
    { r: 'u', name: 'Strong arms II', text: 'Melee hits 25% harder again. Swings cost 8% less stamina again.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } },
    { r: 'r', name: 'Strong arms III', text: 'Melee hits 25% harder again. Swings cost 8% less stamina again.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } }] },
  rungun: { tag: 'Body', t: [
    { r: 'r', name: 'Run and gun', text: 'Shoot pistols and SMGs while you sprint, far less accurately.', ap: () => { S.runGun = 1; } },
    { r: 'r', name: 'Run and gun II', text: 'Shotguns and the assault rifle too: fire and pump them at a sprint. Reload any of them without stopping. Not the hunting rifle or the LMG.', ap: () => { S.runGun = 2; } }] },
  soles: { tag: 'Body', t: [
    { r: 'u', name: 'Thick soles', text: 'Getting hit slows you down 40% less.', ap: () => { S.soles++; slowLess(SLOW_STEP.soles); } },
    { r: 'r', name: 'Thick soles II', text: 'Getting hit slows you down 40% less again.', ap: () => { S.soles++; slowLess(SLOW_STEP.soles); } }] },
  // bandaging slows you less (BAND_SLOW in player/movement.js): each step replaces the one before, it doesn't add to it
  walkw: { tag: 'Body', t: [
    { r: 'u', name: 'Walking wounded', text: 'Bandaging slows you down 10% less.', ap: () => { S.bandLess = 0.1; } },
    { r: 'u', name: 'Walking wounded II', text: 'Bandaging slows you down 25% less (instead of 10%).', ap: () => { S.bandLess = 0.25; } },
    { r: 'u', name: 'Walking wounded III', text: 'Bandaging slows you down 40% less (instead of 25%).', ap: () => { S.bandLess = 0.4; } }] },
  feed: { tag: 'Body', t: [
    // a kill only sometimes feeds you (FEED: how much, how often, more often for a headshot), and only so much a wave, so
    // bandages are still what keeps you going
    { r: 'r', name: 'Iron stomach', text: '1 in 3 kills heals 3 (1 in 2 for headshots). Up to 20 a wave.', ap: () => { S.healOnKill = 1; S.headHeal = true; } },
    { r: 'e', name: 'Bloodthirst', text: '1 in 3 kills heals 5 (1 in 2 for headshots). Up to 35 a wave.', ap: () => { S.healOnKill = 2; S.headHeal = true; } },
    { r: 'l', name: 'Vampire', text: '1 in 2 kills heals 6 (every headshot). Up to 50 a wave.', ap: () => { S.healOnKill = 3; S.vampire = S.headHeal = true; } }] }
};
// what tier n of line k is called on gun id
const tierName = (k, n, id) => { const st = TIERS[k].t[n]; return (st.as && st.as[id]) || st.name; };
