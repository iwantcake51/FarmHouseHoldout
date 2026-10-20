// The upgrade card pool: body, gun tiers, new weapons and mods.

const RAR = { c: 'Common', u: 'Uncommon', r: 'Rare', e: 'Epic', l: 'Legendary' };
// less slowdown when you're hit (S.slowRes, zombies/ai.js): each thing that helps takes its share off what's left, so
// both steps of Thick soles stack (−40% twice makes −64%) and never make you immune to it
const SLOW_STEP = { soles: 0.4 };
const slowAfter = (r, k) => 1 - (1 - r) * (1 - k);
function slowLess(k) { S.slowRes = slowAfter(S.slowRes, k); }
const ammoTypes = () => [...new Set(SLOTS.map(s => W8.slot[s]).filter(id => id && WEAP[id].ammo).map(id => WEAP[id].ammo))];
// aid isn't in every hand after a wave (dealCards, upgrades/upgrade-screen.js): AID_CHANCE is how likely a hand is to
// have any, from the first number when you're short of nothing to the second when you're out of something, and it
// never reaches a sure thing. Short of: ammo for the guns you carry (under three mags' worth in reserve), health (below
// 80%), bandages and planks (under half a stack); bandages and planks count for a bit less
const AID_CHANCE = [0.3, 0.8], AID_TWO = 0.35;   // and up to this chance of a second aid card when you're out of something
// within the hand's aid, what you're short of comes up far more than the rest
const needW = f => 0.3 + 8 * clamp(f, 0, 1);
const NEED = {
  ammo: () => { const gs = gunsHeld().filter(id => WEAP[id].ammo); return gs.length ? gs.reduce((a, id) => a + 1 - Math.min(1, (W8.reserve[WEAP[id].ammo] || 0) / (3 * magCap(id))), 0) / gs.length : 0; },
  health: () => (0.8 - P.hp / S.maxHp) / 0.55,
  bandages: () => Math.max(1 - (P.band || 0) / bandMax(), NEED.health() * 0.7),
  planks: () => 1 - S.planks / (PLANK_MAX / 2)
};
const NEED_COUNT = { ammo: 1, health: 1, bandages: 0.6, planks: 0.6 };
// how short you are of anything, 0 to 1: the worst of them
const aidNeed = () => Math.max(...Object.keys(NEED_COUNT).map(k => NEED_COUNT[k] * clamp(NEED[k](), 0, 1)));
// Steady aim stacks up to STEADY_MAX times, and Lucky shot (rare) makes LUCK_MISS of the shots that hit nothing cost no
// ammo at all (luckyKeep, weapons/firing.js)
const STEADY_MAX = 3, LUCK_MISS = 1 / 4;
// Sure shot: each shot from a gun firing single shots (semiAuto, weapons/firing.js) has this chance to crit
const SURE_CRIT = 0.05;
// grey (common) is kept for aid (AID below): every skill, perk and weapon is uncommon or better
const UPG = [
  { r: 'c', tag: 'Tools', get name() { return METAL.on ? 'Scrap metal' : 'Wood pile'; }, get text() { return METAL.on ? `+${METAL_AID} metal, enough for two grates.` : '+7 planks.'; }, can: () => plankRoom() >= (METAL.on ? METAL_AID : 7), w: () => needW(NEED.planks()), ap: () => addPlanks(METAL.on ? METAL_AID : 7) },
  { r: 'c', tag: 'Med', name: 'Field dressing', text: 'Heal to full health.', can: () => P.hp < S.maxHp * 0.75, w: () => needW(NEED.health()), ap: () => P.hp = S.maxHp },
  { r: 'u', tag: 'Med', name: 'Med pouch', text: 'Carry 5 bandages instead of 3.', vis: 'An empty pouch on the front of your belt', can: () => !S.pouch, ap: () => { S.pouch = true; popEl('bands'); } },
  { r: 'c', tag: 'Ammo', name: 'Ammo can', text: '3 cans of ammo for each gun you carry.', can: () => ammoTypes().length > 0, w: () => needW(NEED.ammo()), ap: () => ammoTypes().forEach(a => W8.reserve[a] += AMMO_CAN[a]) },
  { r: 'c', tag: 'Med', name: 'Bandage roll', text: '+2 bandages.', can: () => (P.band || 0) < bandMax(), w: () => needW(NEED.bandages()), ap: () => { P.band = Math.min(bandMax(), (P.band || 0) + 2); popEl('bands'); } },
  { r: 'u', tag: 'Gun', name: 'Steady aim', text: 'Every gun\'s shots land closer to the crosshair. Can be taken 3 times.', can: () => S.steady < STEADY_MAX, ap: () => { S.steady++; S.spreadMul *= 0.88; } },
  { r: 'u', tag: 'Body', name: 'Tough skin', text: 'Raises your max health, and heals you by as much.', can: () => S.maxHp < 190, ap: () => { S.maxHp += 15; P.hp += 15; } },
  { r: 'u', tag: 'Body', name: 'Quick draw', text: 'Putting a weapon away and drawing the next takes less time.', can: () => S.swapMul < 1.4, ap: () => S.swapMul = 1.4 },
  { r: 'r', tag: 'Luck', name: 'Lucky shot', text: 'Some shots that miss cost no ammo at all.', can: () => !S.luck, ap: () => S.luck = LUCK_MISS },
  { r: 'u', tag: 'Ammo', name: 'Ammo pouch', text: 'Every ammo box you pick up holds extra rounds.', can: () => S.ammoMul < 1.25, ap: () => S.ammoMul = 1.25 },
  { r: 'r', tag: 'Gun', name: 'Sure shot', text: 'Any shot from a semi-auto gun can land as a crit, for double damage.', can: () => !S.sureShot, ap: () => S.sureShot = true },
  { r: 'r', tag: 'Mind', name: 'Momentum', text: 'Each kill soon after the last raises your damage. Go too long without one and it resets.', can: () => !S.momentum, ap: () => S.momentum = true },
  { r: 'r', tag: 'Body', name: 'Vault fire', text: 'Vaults are quicker and cheaper, and you can keep shooting while you\'re going over.', can: () => !S.vaultFire, ap: () => { S.vaultMul = 0.8; S.vaultFire = true; } },
  { r: 'u', tag: 'Luck', name: 'Scavenger', get text() { return `Zombies drop ammo, ${matWord()} and bandages more often.`; }, can: () => S.dropMul < 2, ap: () => S.dropMul *= 1.5 },
  { r: 'u', tag: 'Luck', name: 'Hoarder', text: 'The scrap from a kill is sometimes doubled.', can: () => !S.hoard, ap: () => S.hoard = true },
  { r: 'u', tag: 'Body', name: 'Iron lungs', text: 'More stamina, and it starts coming back sooner after a sprint, swing or vault.', can: () => !S.lungs, ap: () => { S.lungs = true; } },
  { r: 'u', tag: 'Body', name: 'Adrenaline', text: 'A kill gives you a short burst of speed.', can: () => !S.adrenaline, ap: () => S.adrenaline = true },
  { r: 'r', tag: 'Body', name: 'Second wind', text: 'The first time each wave your health falls below a quarter, you heal.', can: () => !S.secondWind, ap: () => S.secondWind = true },
  { r: 'r', tag: 'Med', name: 'Painkillers', text: 'Regenerate 1 health per second, once you\'ve gone 5 seconds without being hurt.', can: () => S.regen < 2, ap: () => S.regen += 1 },
  { r: 'e', tag: 'Gun', name: 'Executioner', text: 'Headshots hit harder with every weapon.', can: () => S.headMul < 3, ap: () => S.headMul = 3 },
  { r: 'e', tag: 'Gore', name: 'Butcher', text: 'Shots and swings take limbs and heads off far more often.', can: () => S.severMul < 2, ap: () => S.severMul = 2 },
  // Gunsmith picks its gun when the card is dealt, so the card can say which one (never one with all three maxed), and
  // pays SMITH_SCRAP for each of the three that's already maxed, about what a tier costs at the bench
  { r: 'e', tag: 'Gun', name: 'Gunsmith', target: null, can: () => gunsHeld().some(smithable),
    card() { this.target = pick(gunsHeld().filter(smithable)); const nm = gunCall(this.target), sc = smithScrap(this.target); return { r: 'e', tag: 'Gun', name: 'Gunsmith', text: `The two lowest of its powder, trigger and magazine go up a tier.` + (sc ? ` Scrap for any already maxed.` : '') }; },
    ap() { const id = this.target; if (!id) return; const sc = smithScrap(id); W8.gt[id] = W8.gt[id] || {}; const ks = ['ammo', 'trigger', 'mag'].filter(k => tierFits(k, id)), none = ks.filter(k => !ownTier(id, k)); magChange(id, () => { ks.sort((a, b) => ownTier(id, a) - ownTier(id, b)).slice(0, 2).forEach(k => fitTier(id, k, ownTier(id, k) + 1)); none.forEach(k => fitTier(id, k, Math.max(1, ownTier(id, k)))); recomputeEff(); }); feed('gear', 0, WEAP[id].name + ' gunsmithed'); if (sc) { S.scrap += sc; feed('scrap', sc, 'scrap'); popEl('scrap'); } } },
  { r: 'l', tag: 'Body', name: 'Stubborn', text: 'Raises your max health, and heals you by as much.', can: () => !S.stubborn, ap: () => { S.maxHp += 50; P.hp += 50; S.stubborn = true; } },
  { r: 'l', tag: 'Mind', name: 'Bullet time', get text() { return netLink() ? 'Now and then a kill gives you a few seconds where every shot goes where you aim and every hit is a headshot.' : 'Now and then a kill slows everything down for a moment, you included.'; }, can: () => !S.bulletTime, ap: () => S.bulletTime = true },
  { r: 'l', tag: 'Mind', name: 'Last stand', text: 'While your health is low, everything you hit takes more damage.', can: () => !S.lastStand, ap: () => S.lastStand = true }
];
// what a card after a wave is: a skill (something you get better at), a perk (an edge that's always on), aid (supplies
// and gear handed to you) or a new weapon. Its tag says so, with the tier for the ones that come in tiers
const AID = new Set(['Wood pile', 'Scrap metal', 'Field dressing', 'Med pouch', 'Ammo can', 'Bandage roll']), SKILLS = new Set(['Vault fire', 'Iron lungs', 'Adrenaline', 'Second wind', 'Steady aim', 'Tough skin', 'Quick draw']);
const TIER_KIND = { quick: 'Skill', armor: 'Skill', boots: 'Skill', hammer: 'Skill', eyes: 'Skill', night: 'Skill', feed: 'Perk' };
const findKind = (u, c) => u.weaponOf ? 'Weapon' : u.tierOf ? TIER_KIND[u.tierOf] || 'Perk' : AID.has(c.name) ? 'Aid' : SKILLS.has(c.name) ? 'Skill' : 'Perk';
function kindTag(u, c) { const k = findKind(u, c); return k === 'Weapon' ? c.tag : k; }   // a tiered one's step shows as stars (upgrades/upgrade-screen.js)
const gunsHeld = () => SLOTS.filter(sl => sl !== 'melee' && W8.slot[sl]).map(sl => W8.slot[sl]);
const smithable = g => ['ammo', 'trigger', 'mag'].some(k => tierFits(k, g));
const SMITH_SCRAP = 14, smithScrap = g => g ? ['ammo', 'trigger', 'mag'].filter(k => tierMax(k, g) > 0 && !tierFits(k, g) && !modLocks(g, k)).length * SMITH_SCRAP : 0;   // (a line the gun doesn't have at all pays nothing)
// how many magazine upgrades a gun takes, where it isn't all of them: the hand cannon a base plate and a longer mag
// (never a drum), the assault rifle up to its drum (no casket), the revolver none (it's a cylinder), the pump none (its
// tube is what it holds; the tube extension mod is how it takes more), the auto shotgun one: from its box straight to the drum,
// the double barrel none (two barrels are two shells), the hunting rifle two: its fixed magazine extended, then a
// detachable box (game/run-state.js: DETACH), the SCAR one: its 20-round box
const MAG_STEPS = { deagle: 2, ar: 2, revolver: 0, pump: 0, auto12: 1, dbl: 0, sub: 2, hunting: 2, scar: 1 };
// the guns whose rate is their action's, not their trigger's: a pump fires as fast as you work it, a bolt rifle as fast
// as the bolt, so a lighter trigger does nothing for them. Their own mods (Slam fire, the greased bolt) do that.
// The double barrel fires as fast as you can pull its triggers, so it has nothing to gain either
const NO_TRIGGER = new Set(['pump', 'hunting', 'dbl']);
// the guns that take no can: the double barrel's twin muzzles
const NO_SUPP = new Set(['dbl']);
// and the ones that take no sight at all, iron sights only: the LMG, a gun for hosing from the hip
const NO_SIGHT = new Set(['lmg']);
function tierFits(k, id) {
  const D = WEAP[id], n = ownTier(id, k);   // what you've bought, whether or not it's fitted right now
  if (n >= TIERS[k].t.length) return false;
  if (k === 'trigger' && NO_TRIGGER.has(id)) return false;
  if (k === 'supp' && NO_SUPP.has(id)) return false;
  if (k === 'sight' && NO_SIGHT.has(id)) return false;
  if (k === 'choke') return D.ammo === 'shells' && !gunTier(id, 'supp');
  if (modLocks(id, k)) return false;   // (taken by a mod: the battle rifle's AK kit has its own mags)
  if (k === 'loader') return id === 'revolver' || id === 'scar' || !!D.breakOpen;   // the revolver's speed loader; the battle rifle's flared magwell; the double barrel's Sleight of Hand (the pump's loading comes with Quick hands: game/run-state.js)
  if (k === 'supp') return !(W8.mods[id] || []).some(m => MODS[m].muzzle) && (n > 0 || !muzzleTaken(id));   // a better can replaces the one you have; otherwise the muzzle must be free (a can taken off a shotgun for its choke still goes back on)
  if (k === 'sight' && n >= 2) return n < (SCOPE_TOP[id] || 2);   // the scopes only go on the rifles and the revolver, each as far as SCOPE_TOP says
  if (k === 'mag' && MAG_STEPS[id] !== undefined) return n < MAG_STEPS[id];
  return true;
}
for (const k in TIERS) {
  const L = TIERS[k];
  if (L.tag === 'Attachment') continue;   // attachments are bought and fitted at the workbench (stations/recipes.js), not found
  // a gun's own upgrades (ammo, trigger, magazine) are bought at the workbench for the gun in your hands
  // (stations/recipes.js), so they never come up here
  if (GUN_TIERS.has(k)) continue;
  UPG.push({ tierOf: k, get r() { return L.t[Math.min(T(k), L.t.length - 1)].r; }, w: 1.4,
    can: () => T(k) < L.t.length && (!L.can || L.can()),
    card: () => { const n = T(k), st = L.t[n]; return { r: st.r, tag: `${L.tag} · Tier ${n + 1} of ${L.t.length}`, name: st.name, text: st.text }; },
    ap: () => { L.t[T(k)].ap(); S.tier[k]++; } });
}
function statLine(id) { const D = WEAP[id]; if (D.melee) return `DMG ${Math.round(D.dmg)} · ${(1 / D.rate).toFixed(1)} swings/s · ${(D.cleave || 1) > 1 ? 'multi-hit ×' + D.cleave : 'single hit'}`; return `DMG ${Math.round(D.dmg)}${(D.pellets || 1) > 1 ? '×' + D.pellets : ''} · ${(1 / D.rate).toFixed(1)}/s · ${D.mag} rds`; }
// a weapon into its slot and your hands, fresh and full, with its starting ammo: one unlocked at the gun rack
// (stations/armory.js), or given by the cheat menu. It's yours from then on, on the rack whenever it's not in your hands
function giveWeapon(id) {
  const D = WEAP[id], s = D.slot;
  if (!W8.owned.includes(id)) W8.owned.push(id);
  W8.slot[s] = id; recomputeEff(); W8.mag[id] = magSize(id); delete W8.pin[id]; delete W8.relSave[id]; if (D.ammo) W8.reserve[D.ammo] += D.start || 0;
  equip(s, true);
}
// weapon mods (the nails in the bat, a gun's barrel) and attachments are never dealt here: you buy them at the
// workbench for the weapon in your hands (stations/recipes.js), nor weapons, which are unlocked at the gun rack
// (stations/armory.js), so the cards after a wave are all about you
