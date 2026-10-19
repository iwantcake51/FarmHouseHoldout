// Tiered upgrade lines (per-gun attachment tiers and character tiers).

// tiered upgrade lines: each step has its own name, rarity and look (as: what a particular gun calls it instead)
// what each step of the feeding line gives: health a feed, the odds a kill (a headshot kill) feeds you, the most a wave
const FEED = [null, { h: 3, p: 1 / 3, ph: 0.5, cap: 20 }, { h: 5, p: 1 / 3, ph: 0.5, cap: 35 }, { h: 6, p: 0.5, ph: 1, cap: 50 }];
// what a sight step does for your aimed shots, against the step before: how much tighter, and how much of the spread
// moving adds to them it takes away
const sightText = n => `Shots aimed down the sights ${Math.round((1 - SIGHT_AIM[n] / SIGHT_AIM[n - 1]) * 100)}% tighter${n > 1 ? ' again' : ''}, and ${Math.round((1 - SIGHT_MOVE[n] / SIGHT_MOVE[n - 1]) * 100)}% steadier on the move.`;
// Quick hands: your reload time at each step (a share of the usual): each step takes another 20% off it
const QUICK = [1, 0.8, 0.6, 0.4];
// how much each trigger step quickens the fire rate: about a quarter faster in all, maxed (it was over 60%)
const TRIG_UP = [1.08, 1.07, 1.08];
const BOOTS = [1.06, 1.05, 1.05];
const quickTo = n => { S.reloadMul *= QUICK[n] / QUICK[n - 1]; };
const TIERS = {
  // the powder behind every round, whichever kind is loaded (weapons/rounds.js): this line is the gun's damage, the
  // round is what it does (the line's key is still 'ammo')
  ammo: { tag: 'Powder', t: [
    { r: 'c', name: 'Hand-loads', text: 'A hotter charge behind every round, whichever kind is loaded.', ap: () => S.dmgMul *= 1.25 },
    { r: 'u', name: '+P loads', text: 'Hotter again, with orange tracers.', ap: () => S.dmgMul *= 1.2 },
    { r: 'e', name: 'Match-grade loads', text: 'Every charge weighed out the same: harder hits, and headshots count for more.', ap: () => S.dmgMul *= 1.25 }] },
  trigger: { tag: 'Gun', t: [
    { r: 'c', name: 'Light trigger', text: 'A lighter pull, so shots come quicker.', ap: () => S.rateMul *= TRIG_UP[0] },
    { r: 'u', name: 'Match trigger', text: 'Lighter again.', ap: () => S.rateMul *= TRIG_UP[1] },
    { r: 'r', name: 'Hair trigger', text: 'As light as a pull gets.', ap: () => S.rateMul *= TRIG_UP[2] }] },
  // the pistol's own names for them, after what it's given (weapons/gun-models.js): a +5 base plate, a long stick, a drum
  mag: { tag: 'Gun', t: [
    // the auto shotgun's one step is its drum (MAG_UP, game/run-state.js), priced as a rare one (rAs)
    // the pump's are its tube extended toward the muzzle, the M60's a longer belt in a deeper box, the SMG's longer
    // curved mags (they used to be mods of their own: weapons/gun-mods.js), the hunting rifle's a deeper floorplate on
    // its fixed magazine and then a detachable box, the SCAR's its 20-round box (its only step: MAG_STEPS), priced as a rare one
    { r: 'c', name: 'Extended mags', as: { pistol: 'Mag plate', deagle: 'Mag plate', auto12: 'Drum mag', pump: 'Tube extension', lmg: '140-round belt', sub: '40-round mag', hunting: 'Mag extension', scar: '20-round mag' }, rAs: { auto12: 'r', scar: 'r' }, text: (D, id) => id === 'hunting' ? 'A deeper floorplate: 7 rounds instead of 5, still loaded a round at a time.' : id === 'scar' ? 'A 20-round box instead of the 10. Mag changes take a good deal longer, and it\'s heavier again to walk with.' : id === 'sub' ? 'A longer curved mag: 40 rounds instead of 30. Mag changes take a little longer.' : D.drumMag ? 'Swaps the 8-shell box for a 20-shell drum. Mag changes take twice as long, and you walk slower with it.' : 'More rounds before you reload, but mag changes take longer and you walk a little slower.', ap: () => S.magMul *= 1.4 },
    { r: 'r', name: 'Drum magazines', as: { pistol: 'Extended mag', deagle: 'Extended mag', pump: 'Long tube', lmg: '200-round belt', sub: '50-round drum', hunting: 'Detachable magazine' }, text: (D, id) => id === 'hunting' ? `A 10-round detachable box: the whole reload is one mag change in ${DETACH.reload} s, the bolt worked at the end of it.` : id === 'sub' ? 'A round drum holding 50. Slower again to change, and to walk with.' : 'Twice what it holds stock. Slower again to change, and to walk with.', ap: () => S.magMul *= 1.43 },
    { r: 'e', name: 'Casket magazines', as: { pistol: 'Drum mag', pump: 'Full-length tube', lmg: '270-round belt' }, text: 'Nearly three times what it holds stock. The slowest to change, and to walk with.', ap: () => S.magMul *= 1.35 }] },
  // the SMG's is the SD's integral can, its barrel swapped for it (weapons/gun-models.js)
  supp: { tag: 'Attachment', t: [
    { r: 'u', name: 'Oil-filter can', as: { sub: 'Integral suppressor' }, text: 'Muffles your shots and adds a little damage. Takes the muzzle.', ap: () => {} },
    { r: 'r', name: 'Suppressor', as: { sub: 'Integral suppressor II' }, text: 'Quieter, and more damage.', ap: () => {} },
    { r: 'e', name: 'Heavy-duty suppressor', as: { sub: 'Integral suppressor III' }, text: 'The quietest, and the most damage.', ap: () => {} }] },
  sight: { tag: 'Attachment', t: [
    // every sight only tightens your aimed shots, standing and on the move (SIGHT_AIM, SIGHT_MOVE in game/run-state.js);
    // on a sniper it also raises the headshot multiplier, and through a scope its headshots crit (SCOPES)
    { r: 'c', name: 'Red dot', text: D => sightText(1, D) + (D && D.sniper ? ' Headshot multiplier +0.15×.' : ''), vis: 'A red dot sight', ap: () => {} },
    { r: 'u', name: 'Holographic sight', text: D => sightText(2, D) + (D && D.sniper ? ' Headshot multiplier +0.15× more.' : ''), vis: 'A holo sight', ap: () => {} },
    { r: 'r', name: 'Scope', text: D => 'Zooms in when you aim. ' + sightText(3, D) + ' Dead accurate past 10 m.' + (D && D.sniper ? ' Every headshot while aiming is a crit (2× damage).' : ''), vis: 'A scope in rings', ap: () => {} },
    { r: 'e', name: 'ACOG', text: D => 'Zooms in further. ' + sightText(4, D) + (D && D.sniper ? ' Headshot crits do 2.25×.' : ''), vis: 'A 4× ACOG, its fibre optic glowing red on top', ap: () => {} },
    { r: 'l', name: 'High-power scope', text: D => 'Zooms in furthest. ' + sightText(5, D) + ' Headshot crits do 2.5×.', vis: 'A big scope', ap: () => {} }] },
  laser: { tag: 'Attachment', t: [
    { r: 'u', name: 'Laser pointer', text: 'A beam shows where your shots land, and shots from the hip spread less.', ap: () => {} },
    { r: 'r', name: 'Laser sight', text: 'A brighter beam, and less hip spread again.', ap: () => {} }] },
  light: { tag: 'Attachment', t: [
    { r: 'u', name: 'Taped flashlight', text: 'At night it lights the ground ahead and outlines zombies caught in the beam.', ap: () => {} },
    { r: 'r', name: 'Weapon light', text: 'A brighter, wider beam that reaches further.', ap: () => {} }] },
  // one step on each gun that takes it: the revolver's speed loader, all six rounds in at once from a loader you then
  // drop (weapons/reload.js); on the double barrel a technique, nothing on the gun: Sleight of Hand, both shells palmed
  // and pushed in together (game/run-state.js: SOH). (The pump's two or three shells a go come with Quick hands II and
  // III instead: PAIR_LOAD, TRIPLE)
  loader: { tag: 'Attachment', t: [
    { r: 'u', name: 'Speed loader', as: { dbl: 'Sleight of Hand' }, text: D => D.breakOpen ? 'Load both shells at once instead of one at a time, and close the gun quicker: a reload nearly twice as fast.' : D.ammo === 'shells' ? 'Grab three shells at once and feed them into the tube in one go: a reload about twice as fast.' : 'All 6 rounds go in at once.', ap: () => {} }] },
  choke: { tag: 'Attachment', can: () => hasShotgun(), t: [
    { r: 'u', name: 'Modified choke', text: 'Squeezes the pellets (and slugs) into a tighter cone. Takes the muzzle.', ap: () => {} },
    { r: 'r', name: 'Full choke', text: 'Tighter again.', ap: () => {} }] },
  // armour, footwear and the hammer are skills (TIER_KIND, upgrades/upgrades.js), so none starts below uncommon
  armor: { tag: 'Body', t: [
    { r: 'u', name: 'Canvas jacket', text: 'Raises your max health, and heals you by as much.', ap: () => { S.maxHp += 25; P.hp = Math.min(S.maxHp, P.hp + 25); } },
    { r: 'r', name: 'Kevlar vest', text: 'Every hit on you does less damage.', ap: () => S.dmgTaken *= 0.8 },
    { r: 'e', name: 'Plate carrier', text: 'Hits do less again, and your max health goes up.', ap: () => { S.dmgTaken *= 0.75; S.maxHp += 25; P.hp += 25; } }] },
  // footwear: each step a little faster (BOOTS: about +17% in all), green, blue, then epic
  boots: { tag: 'Body', t: [
    { r: 'u', name: 'Good boots', text: 'Faster walking and sprinting.', ap: () => S.speedMul *= BOOTS[0] },
    { r: 'r', name: 'Running shoes', text: 'Faster again.', ap: () => S.speedMul *= BOOTS[1] },
    { r: 'e', name: 'Trail runners', text: 'Faster again.', ap: () => S.speedMul *= BOOTS[2] }] },
  hammer: { tag: 'Tools', t: [
    { r: 'u', name: 'Claw hammer', text: 'Each board takes half the time to nail up.', ap: () => S.boardSpeed *= 2 },
    { r: 'u', name: 'Framing hammer', text: 'Boards go up quicker and take more blows before they break.', ap: () => { S.boardSpeed *= 1.5; S.boardMul *= 1.25; } },
    { r: 'r', name: 'Nail gun', text: 'Quicker and tougher again.', ap: () => { S.boardSpeed *= 2; S.boardMul *= 1.5; } }] },
  eyes: { tag: 'Senses', t: [
    // wide eyes (what were Wide eyes and Peripheral vision): a much wider cone, its edges reaching a little way round
    // behind your shoulders, and a bigger circle round you
    { r: 'u', name: 'Wide eyes', text: 'Your view opens wider, round to a little behind you, and you see anything close by in every direction.', ap: () => { S.cone += 0.6; S.near = 4; } },
    { r: 'r', name: 'Eyes in the back of your head', text: 'You see zombies further out all around you, behind you too.', ap: () => { S.cone += 0.2; S.near = 6; } }] },
  night: { tag: 'Senses', t: [
    // a night vision monocular (one tube on a head mount, player/gear.js), then binocular goggles (two)
    { r: 'r', name: 'Night vision monocular', text: 'Nights are far brighter, with a hint of colour.', ap: () => S.nightVis = 1 },
    { r: 'e', name: 'Night vision goggles', text: 'Nights look almost like dusk.', ap: () => S.nightVis = 2.2 }] },
  // perks that come in steps: harder melee hits that cost less stamina a swing (S.swingStam, melee/melee.js); shooting
  // at a sprint (S.runGun, player/sprint.js), 9mm guns first, then shotguns and the assault rifle too, reloading on the
  // run; and less slowdown when you're hit
  strong: { tag: 'Melee', t: [
    { r: 'u', name: 'Strong arms', text: 'Melee hits harder, and each swing costs less stamina.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } },
    { r: 'u', name: 'Strong arms II', text: 'Harder hits and cheaper swings again.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } },
    { r: 'r', name: 'Strong arms III', text: 'Harder hits and cheaper swings again.', ap: () => { S.meleeMul *= 1.25; S.swingStam *= 0.92; } }] },
  rungun: { tag: 'Body', t: [
    { r: 'r', name: 'Run and gun', text: 'Pistols and SMGs fire while you sprint, with a lot more spread.', ap: () => { S.runGun = 1; } },
    { r: 'r', name: 'Run and gun II', text: 'Adds shotguns and the assault rifle. Not the sniper rifles or the LMG.', ap: () => { S.runGun = 2; } }] },
  soles: { tag: 'Body', t: [
    { r: 'u', name: 'Thick soles', text: 'Getting hit slows you down for less.', ap: () => { S.soles++; slowLess(SLOW_STEP.soles); } },
    { r: 'r', name: 'Thick soles II', text: 'Less again.', ap: () => { S.soles++; slowLess(SLOW_STEP.soles); } }] },
  // Quick hands: each step sets how much faster you reload in all (QUICK), not on top of the one before; tier 2 and 3
  // trade the fingerless gloves for full work gloves (player/gear.js)
  // (green, then blue, then epic purple)
  quick: { tag: 'Body', t: [
    { r: 'u', name: 'Quick hands', text: 'Every reload is quicker.', ap: () => quickTo(1) },
    { r: 'r', name: 'Quick hands II', text: 'Quicker again, and the pump takes two shells a go.', ap: () => quickTo(2) },
    { r: 'e', name: 'Quick hands III', text: 'Quicker again, and the pump takes three shells a go.', ap: () => quickTo(3) }] },
  // bandaging slows you less (BAND_SLOW in player/movement.js): each step replaces the one before, it doesn't add to it
  walkw: { tag: 'Body', t: [
    { r: 'u', name: 'Walking wounded', text: 'You keep more of your speed while bandaging.', ap: () => { S.bandLess = 0.1; } },
    { r: 'u', name: 'Walking wounded II', text: 'More again.', ap: () => { S.bandLess = 0.25; } },
    { r: 'u', name: 'Walking wounded III', text: 'More again.', ap: () => { S.bandLess = 0.4; } }] },
  feed: { tag: 'Body', t: [
    // a kill only sometimes feeds you (FEED: how much, how often, more often for a headshot), and only so much a wave, so
    // bandages are still what keeps you going
    { r: 'r', name: 'Iron stomach', text: 'Some kills heal you a little, headshot kills more often, up to a limit each wave.', ap: () => { S.healOnKill = 1; S.headHeal = true; } },
    { r: 'e', name: 'Bloodthirst', text: 'Each feed heals more, and the limit goes up.', ap: () => { S.healOnKill = 2; S.headHeal = true; } },
    { r: 'l', name: 'Vampire', text: 'Kills feed you more often (every headshot kill), for more.', ap: () => { S.healOnKill = 3; S.vampire = S.headHeal = true; } }] }
};
// what tier n of line k is called on gun id
const tierName = (k, n, id) => { const st = TIERS[k].t[n]; return (st.as && st.as[id]) || st.name; };
