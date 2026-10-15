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
// Steady aim stacks up to STEADY_MAX times, and Lucky shot takes LUCK_MISS of the shots that hit nothing out of your
// reserve instead of the magazine (luckyKeep, weapons/firing.js)
const STEADY_MAX = 3, LUCK_MISS = 1 / 3;
// grey (common) is kept for aid (AID below): every skill, perk and weapon is uncommon or better
const UPG = [
  { r: 'c', tag: 'Tools', name: 'Wood pile', text: '+7 planks.', can: () => plankRoom() >= 7, w: () => needW(NEED.planks()), ap: () => addPlanks(7) },
  { r: 'c', tag: 'Med', name: 'Field dressing', text: 'Heal to full health.', can: () => P.hp < S.maxHp * 0.75, w: () => needW(NEED.health()), ap: () => P.hp = S.maxHp },
  { r: 'u', tag: 'Med', name: 'Med pouch', text: 'Carry 5 bandages instead of 3.', vis: 'An empty pouch on the front of your belt', can: () => !S.pouch, ap: () => { S.pouch = true; popEl('bands'); } },
  { r: 'c', tag: 'Ammo', name: 'Ammo can', text: '3 cans of ammo for each gun you carry.', can: () => ammoTypes().length > 0, w: () => needW(NEED.ammo()), ap: () => ammoTypes().forEach(a => W8.reserve[a] += AMMO_CAN[a]) },
  { r: 'c', tag: 'Med', name: 'Bandage roll', text: '+2 bandages.', can: () => (P.band || 0) < bandMax(), w: () => needW(NEED.bandages()), ap: () => { P.band = Math.min(bandMax(), (P.band || 0) + 2); popEl('bands'); } },
  { r: 'u', tag: 'Gun', name: 'Steady aim', text: 'All guns are 12% more accurate. Up to 3 times.', can: () => S.steady < STEADY_MAX, ap: () => { S.steady++; S.spreadMul *= 0.88; } },
  { r: 'u', tag: 'Body', name: 'Tough skin', text: '+15 max health.', can: () => S.maxHp < 190, ap: () => { S.maxHp += 15; P.hp += 15; } },
  { r: 'u', tag: 'Body', name: 'Quick draw', text: 'Switch weapons 40% faster.', can: () => S.swapMul < 1.4, ap: () => S.swapMul = 1.4 },
  { r: 'u', tag: 'Luck', name: 'Lucky shot', text: '1 in 3 shots that miss comes out of your reserve ammo instead of the magazine.', can: () => !S.luck, ap: () => S.luck = LUCK_MISS },
  { r: 'u', tag: 'Ammo', name: 'Ammo pouch', text: 'Ammo pickups give 25% more.', can: () => S.ammoMul < 1.25, ap: () => S.ammoMul = 1.25 },
  { r: 'r', tag: 'Mind', name: 'Momentum', text: 'Kills in quick succession build up to +25% damage.', can: () => !S.momentum, ap: () => S.momentum = true },
  { r: 'r', tag: 'Body', name: 'Vault fire', text: 'Vault 25% faster for half the stamina, and shoot while vaulting.', can: () => !S.vaultFire, ap: () => { S.vaultMul = 0.8; S.vaultFire = true; } },
  { r: 'u', tag: 'Luck', name: 'Scavenger', text: 'Zombies drop supplies 50% more often.', can: () => S.dropMul < 2, ap: () => S.dropMul *= 1.5 },
  { r: 'u', tag: 'Luck', name: 'Hoarder', text: 'Scrap drops have a 25% chance to be worth double.', can: () => !S.hoard, ap: () => S.hoard = true },
  { r: 'u', tag: 'Body', name: 'Iron lungs', text: '+25% stamina. It refills sooner and 25% faster.', vis: 'A thicker stamina bar', can: () => !S.lungs, ap: () => { S.lungs = true; } },
  { r: 'u', tag: 'Body', name: 'Adrenaline', text: 'Kills give a short burst of speed. Once every 4 seconds at most.', can: () => !S.adrenaline, ap: () => S.adrenaline = true },
  { r: 'r', tag: 'Body', name: 'Second wind', text: 'Once per wave, heal 50 when you drop below 25% health.', can: () => !S.secondWind, ap: () => S.secondWind = true },
  { r: 'r', tag: 'Med', name: 'Painkillers', text: 'Regenerate 1 health per second.', can: () => S.regen < 2, ap: () => S.regen += 1 },
  { r: 'e', tag: 'Gun', name: 'Executioner', text: 'Headshots do 3× damage instead of 2.2×.', can: () => S.headMul < 3, ap: () => S.headMul = 3 },
  { r: 'e', tag: 'Gore', name: 'Butcher', text: 'Limbs and heads come off twice as easily.', can: () => S.severMul < 2, ap: () => S.severMul = 2 },
  // Gunsmith picks its gun when the card is dealt, so the card can say which one (never one with all three maxed), and
  // pays SMITH_SCRAP for each of the three that's already maxed, about what a tier costs at the bench
  { r: 'e', tag: 'Gun', name: 'Gunsmith', target: null, can: () => gunsHeld().some(smithable),
    card() { this.target = pick(gunsHeld().filter(smithable)); const nm = gunCall(this.target), sc = smithScrap(this.target); return { r: 'e', tag: 'Gun', name: 'Gunsmith', text: `Your ${nm}: its two lowest powder, trigger and magazine upgrades go up a tier. Any it doesn't have yet start at tier 1.` + (sc ? ` +${sc} scrap for the ${sc > SMITH_SCRAP ? 'two' : 'one'} already maxed.` : ''), vis: 'Changes two or three at once' }; },
    ap() { const id = this.target; if (!id) return; const sc = smithScrap(id); W8.gt[id] = W8.gt[id] || {}; const ks = ['ammo', 'trigger', 'mag'].filter(k => tierFits(k, id)), none = ks.filter(k => !ownTier(id, k)); magChange(id, () => { ks.sort((a, b) => ownTier(id, a) - ownTier(id, b)).slice(0, 2).forEach(k => fitTier(id, k, ownTier(id, k) + 1)); none.forEach(k => fitTier(id, k, Math.max(1, ownTier(id, k)))); recomputeEff(); }); feed('gear', 0, WEAP[id].name + ' gunsmithed'); if (sc) { S.scrap += sc; feed('scrap', sc, 'scrap'); popEl('scrap'); } } },
  { r: 'l', tag: 'Body', name: 'Stubborn', text: '+50 max health.', can: () => !S.stubborn, ap: () => { S.maxHp += 50; P.hp += 50; S.stubborn = true; } },
  { r: 'l', tag: 'Mind', name: 'Bullet time', text: 'Some kills slow time for a moment. Once every 8 seconds at most.', can: () => !S.bulletTime, ap: () => S.bulletTime = true },
  { r: 'l', tag: 'Mind', name: 'Last stand', text: 'Below 30% health, deal 60% more damage.', can: () => !S.lastStand, ap: () => S.lastStand = true }
];
// what a card after a wave is: a skill (something you get better at), a perk (an edge that's always on), aid (supplies
// and gear handed to you) or a new weapon. Its tag says so, with the tier for the ones that come in tiers
const AID = new Set(['Wood pile', 'Field dressing', 'Med pouch', 'Ammo can', 'Bandage roll']), SKILLS = new Set(['Vault fire', 'Iron lungs', 'Adrenaline', 'Second wind', 'Steady aim', 'Tough skin', 'Quick draw']);
const TIER_KIND = { quick: 'Skill', armor: 'Skill', boots: 'Skill', hammer: 'Skill', eyes: 'Skill', night: 'Skill', feed: 'Perk' };
const findKind = (u, c) => u.weaponOf ? 'Weapon' : u.tierOf ? TIER_KIND[u.tierOf] || 'Perk' : AID.has(c.name) ? 'Aid' : SKILLS.has(c.name) ? 'Skill' : 'Perk';
function kindTag(u, c) { const k = findKind(u, c); return k === 'Weapon' ? c.tag : k; }   // a tiered one's step shows as stars (upgrades/upgrade-screen.js)
const gunsHeld = () => SLOTS.filter(sl => sl !== 'melee' && W8.slot[sl]).map(sl => W8.slot[sl]);
const smithable = g => ['ammo', 'trigger', 'mag'].some(k => tierFits(k, g));
const SMITH_SCRAP = 14, smithScrap = g => g ? ['ammo', 'trigger', 'mag'].filter(k => tierMax(k, g) > 0 && !tierFits(k, g)).length * SMITH_SCRAP : 0;   // (a line the gun doesn't have at all pays nothing)
// how many magazine upgrades a gun takes, where it isn't all of them: the hand cannon a base plate and a longer mag
// (never a drum), the assault rifle up to its drum (no casket), the revolver none (it's a cylinder), the pump none (its
// tube is what it holds; the tube extension mod is how it takes more), the drum shotgun one: from its box straight to the drum
const MAG_STEPS = { deagle: 2, ar: 2, revolver: 0, pump: 0, auto12: 1 };
// the guns whose rate is their action's, not their trigger's: a pump fires as fast as you work it, a bolt rifle as fast
// as the bolt, so a lighter trigger does nothing for them. Their own mods (Slam fire, the straight-pull bolt) do that
const NO_TRIGGER = new Set(['pump', 'hunting']);
function tierFits(k, id) {
  const D = WEAP[id], n = ownTier(id, k);   // what you've bought, whether or not it's fitted right now
  if (n >= TIERS[k].t.length) return false;
  if (k === 'trigger' && NO_TRIGGER.has(id)) return false;
  if (k === 'choke') return D.ammo === 'shells' && !gunTier(id, 'supp');
  if (k === 'loader') return id === 'revolver' || (D.ammo === 'shells' && !!D.perShell);   // the revolver's speed loader; a technique on the shotguns fed shell by shell
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
    card: () => { const n = T(k), st = L.t[n]; return { r: st.r, tag: `${L.tag} · Tier ${n + 1} of ${L.t.length}`, name: st.name, text: st.text, vis: n ? 'Upgrades your ' + L.t[n - 1].name.toLowerCase() + (st.vis ? '. ' + st.vis : '') : st.vis }; },
    ap: () => { L.t[T(k)].ap(); S.tier[k]++; } });
}
function statLine(id) { const D = WEAP[id]; if (D.melee) return `DMG ${Math.round(D.dmg)} · ${(1 / D.rate).toFixed(1)} swings/s · ${(D.cleave || 1) > 1 ? 'multi-hit ×' + D.cleave : 'single hit'}`; return `DMG ${Math.round(D.dmg)}${(D.pellets || 1) > 1 ? '×' + D.pellets : ''} · ${(1 / D.rate).toFixed(1)}/s · ${D.mag} rds`; }
function giveWeapon(id) {
  const D = WEAP[id], s = D.slot;
  W8.slot[s] = id; recomputeEff(); W8.mag[id] = magSize(id); delete W8.pin[id]; delete W8.relSave[id]; if (D.ammo) W8.reserve[D.ammo] += D.start || 0;
  equip(s, true);
}
// weapons after a wave come in firepower bands, so the first waves don't hand you an assault rifle: band 1 is what you
// can scrape together early (a better melee weapon, a revolver, a machine pistol), 2 real guns (the shotguns, the SMG,
// the .50, the axe and sledgehammer), 3 heavy ones (the assault rifle, the hunting rifle, the katana) and 4 the top of
// the pile (the drum shotgun, the LMG). A band opens at its wave in WEAP_OPEN and comes in over three waves; once the
// band above it is open it turns up less and less. A weapon better than the one in its slot turns up more, one no
// better turns up less
const WEAP_POW = { bat: 0.5, pistol: 1, crowbar: 1, wrench: 1, machete: 1, revolver: 1, smg: 1, dbl: 2, pump: 2, sub: 2, deagle: 2, axe: 2, sledge: 2, ar: 3, hunting: 3, katana: 3, auto12: 4, lmg: 4 };
const WEAP_OPEN = [0, 1, 5, 8, 11];
const weapPow = id => id ? WEAP_POW[id] || 1 : 0;
function weapWeight(id) {
  const p = weapPow(id), w = run.wave, open = WEAP_OPEN[p];
  if (w < open) return 0;
  const inK = Math.min(1, (w - open + 1) / 3), next = WEAP_OPEN[p + 1], fade = next && w >= next ? Math.max(0.2, 1 - (w - next + 1) * 0.2) : 1;
  const cur = weapPow(W8.slot[WEAP[id].slot]), better = p > cur ? 1.1 + 0.4 * (p - cur) : p === cur ? 0.5 : 0.2;
  return inK * fade * better;
}
// and a run never stalls on weak guns: from each GUN_DUE wave on, while the best long gun or automatic you carry is
// below its band, one card at the end of every wave is a long gun or automatic of that band (dealCards,
// upgrades/upgrade-screen.js), until you take one
const GUN_DUE = [[6, 2], [10, 3]];
const bestGun = () => Math.max(weapPow(W8.slot.long), weapPow(W8.slot.auto));
function gunDue() { let band = 0; for (const [w, b] of GUN_DUE) if (run.wave >= w && bestGun() < b) band = b; return band; }
for (const id in WEAP) {
  const D = WEAP[id]; if (!D.rar) continue;
  UPG.push({ r: D.rar, tag: 'Weapon · ' + SLOT_NAME[D.slot], name: D.name, text: D.desc, stats: () => statLine(id), weaponOf: id,
    vis: () => W8.slot[D.slot] ? 'Replaces your ' + WEAP[W8.slot[D.slot]].name : 'Goes in slot ' + (SLOTS.indexOf(D.slot) + 1), w: () => 1.6 * weapWeight(id), can: () => !held(id) && !radioPending(id) && weapWeight(id) > 0, ap: () => giveWeapon(id) });   // not one that's on its way by radio
}
// weapon mods (the nails in the bat, a gun's barrel) and attachments are never dealt here: you buy them at the
// workbench for the weapon in your hands (stations/recipes.js), so the cards after a wave are all about you and new weapons
