// The upgrade card pool: body, gun tiers, new weapons and mods.

const RAR = { c: 'Common', u: 'Uncommon', r: 'Rare', e: 'Epic', l: 'Legendary' };
const ammoTypes = () => [...new Set(SLOTS.map(s => W8.slot[s]).filter(id => id && WEAP[id].ammo).map(id => WEAP[id].ammo))];
const UPG = [
  { r: 'c', tag: 'Body', name: 'Quick hands', text: 'Reload 25% faster.', can: () => S.reloadMul > 0.6, ap: () => S.reloadMul *= 0.75 },
  { r: 'c', tag: 'Tools', name: 'Wood pile', text: '+7 planks.', can: () => plankRoom() >= 7, ap: () => addPlanks(7) },
  { r: 'c', tag: 'Tools', name: 'Scrounger', text: '+10 scrap right now.', ap: () => S.scrap += 10 },
  { r: 'c', tag: 'Med', name: 'Field dressing', text: 'Patch yourself up to full health.', can: () => P.hp < S.maxHp * 0.75, ap: () => P.hp = S.maxHp },
  { r: 'u', tag: 'Med', name: 'Med pouch', text: 'A second pouch on your belt: carry 5 bandages instead of 3. It comes with two in it.', vis: 'A pouch on the front of your belt', can: () => !S.pouch, ap: () => { S.pouch = true; P.band = Math.min(bandMax(), (P.band || 0) + 2); popEl('bands'); } },
  { r: 'c', tag: 'Ammo', name: 'Ammo can', text: 'Three full cans of ammo for every gun you carry.', can: () => ammoTypes().length > 0, ap: () => ammoTypes().forEach(a => W8.reserve[a] += AMMO_CAN[a]) },
  { r: 'c', tag: 'Melee', name: 'Strong arms', text: 'Melee hits 25% harder.', can: () => S.meleeMul < 1.9, ap: () => S.meleeMul *= 1.25 },
  { r: 'c', tag: 'Body', name: 'Light feet', text: 'Climb through windows twice as fast, for half the stamina.', can: () => S.vaultMul > 0.5, ap: () => S.vaultMul = 0.5 },
  { r: 'u', tag: 'Luck', name: 'Scavenger', text: 'Zombies drop supplies 50% more often.', can: () => S.dropMul < 2, ap: () => S.dropMul *= 1.5 },
  { r: 'u', tag: 'Luck', name: 'Hoarder', text: 'Every scrap pickup is worth double.', can: () => S.scrapMul < 2, ap: () => S.scrapMul = 2 },
  { r: 'u', tag: 'Body', name: 'Thick soles', text: 'Getting hit slows you down 40% less.', can: () => S.slowRes < 0.7, ap: () => S.slowRes += 0.4 },
  { r: 'u', tag: 'Body', name: 'Iron lungs', text: '25% more stamina, and it comes back a little sooner and 25% faster.', vis: 'A thicker stamina bar', can: () => !S.lungs, ap: () => { S.lungs = true; } },
  { r: 'u', tag: 'Body', name: 'Adrenaline', text: 'A kill gives you a short burst of speed (at most once every 4 seconds).', can: () => !S.adrenaline, ap: () => S.adrenaline = true },
  { r: 'r', tag: 'Body', name: 'Second wind', text: 'Once per wave, dropping below 25% health heals you 50.', can: () => !S.secondWind, ap: () => S.secondWind = true },
  { r: 'r', tag: 'Med', name: 'Painkillers', text: 'Slowly regenerate 1 health a second.', can: () => S.regen < 2, ap: () => S.regen += 1 },
  { r: 'e', tag: 'Gun', name: 'Executioner', text: 'Headshots deal three times damage instead of 2.2 times.', can: () => S.headMul < 3, ap: () => S.headMul = 3 },
  { r: 'e', tag: 'Gore', name: 'Butcher', text: 'Limbs and heads come off twice as easily.', can: () => S.severMul < 2, ap: () => S.severMul = 2 },
  // Gunsmith picks its gun when the card is dealt, so the card can say which one
  { r: 'e', tag: 'Gun', name: 'Gunsmith', target: null, can: () => gunsHeld().some(smithable),
    card() { this.target = pick(gunsHeld().filter(smithable)); const nm = WEAP[this.target].name.toLowerCase(); return { r: 'e', tag: 'Gun', name: 'Gunsmith', text: `Your ${nm} gets two of its ammo, trigger and magazine upgrades raised a tier (the two furthest behind), and any of the three it has none of fitted at tier 1.`, vis: 'Changes two or three at once' }; },
    ap() { const id = this.target; if (!id) return; W8.gt[id] = W8.gt[id] || {}; const ks = ['ammo', 'trigger', 'mag'].filter(k => tierFits(k, id)), none = ks.filter(k => !gunTier(id, k)); ks.sort((a, b) => gunTier(id, a) - gunTier(id, b)).slice(0, 2).forEach(k => { W8.gt[id][k] = gunTier(id, k) + 1; }); none.forEach(k => { W8.gt[id][k] = Math.max(1, gunTier(id, k)); }); recomputeEff(); feed('gear', 0, WEAP[id].name + ' gunsmithed'); } },
  { r: 'l', tag: 'Body', name: 'Stubborn', text: '+50 max health and you barely slow down when hit.', can: () => S.slowRes < 0.85, ap: () => { S.maxHp += 50; P.hp += 50; S.slowRes = Math.max(S.slowRes, 0.85); } },
  { r: 'l', tag: 'Mind', name: 'Bullet time', text: 'Kills sometimes slow the world for a moment.', can: () => !S.bulletTime, ap: () => S.bulletTime = true },
  { r: 'l', tag: 'Mind', name: 'Last stand', text: 'Below 30% health, everything you do hits 60% harder.', can: () => !S.lastStand, ap: () => S.lastStand = true }
];
// what a card after a wave is: a skill (something you get better at), a perk (an edge that's always on), aid (supplies
// and gear handed to you) or a new weapon. Its tag says so, with the tier for the ones that come in tiers
const AID = new Set(['Wood pile', 'Scrounger', 'Field dressing', 'Med pouch', 'Ammo can']), SKILLS = new Set(['Quick hands', 'Strong arms', 'Light feet', 'Thick soles', 'Iron lungs', 'Adrenaline', 'Second wind']);
const TIER_KIND = { armor: 'Aid', boots: 'Aid', hammer: 'Aid', eyes: 'Skill', night: 'Skill', feed: 'Perk' };
const findKind = (u, c) => u.weaponOf ? 'Weapon' : u.tierOf ? TIER_KIND[u.tierOf] || 'Perk' : AID.has(c.name) ? 'Aid' : SKILLS.has(c.name) ? 'Skill' : 'Perk';
function kindTag(u, c) { const k = findKind(u, c); if (k === 'Weapon') return c.tag; const tier = (c.tag.match(/Tier \d+ of \d+/) || [])[0]; return tier ? k + ' · ' + tier : k; }
const gunsHeld = () => SLOTS.filter(sl => sl !== 'melee' && W8.slot[sl]).map(sl => W8.slot[sl]);
const smithable = g => ['ammo', 'trigger', 'mag'].some(k => tierFits(k, g));
function tierFits(k, id) {
  const D = WEAP[id], n = gunTier(id, k);
  if (n >= TIERS[k].t.length) return false;
  if (k === 'choke') return D.ammo === 'shells' && !gunTier(id, 'supp');
  if (k === 'loader') return id === 'revolver' ? n < 1 : D.ammo === 'shells' && !!D.perShell;   // the revolver's one loader; shotguns fed shell by shell
  if (k === 'supp') return n > 0 || !muzzleTaken(id);   // a better can replaces the one there; otherwise the muzzle must be free
  if (k === 'sight' && n === 2) return D.slot !== 'side';
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
function statLine(id) { const D = WEAP[id]; if (D.melee) return `DMG ${Math.round(D.dmg)} · ${(1 / D.rate).toFixed(1)} swings/s`; return `DMG ${Math.round(D.dmg)}${(D.pellets || 1) > 1 ? '×' + D.pellets : ''} · ${(1 / D.rate).toFixed(1)}/s · ${D.mag} rds`; }
function giveWeapon(id) {
  const D = WEAP[id], s = D.slot;
  W8.slot[s] = id; recomputeEff(); W8.mag[id] = magSize(id); if (D.ammo) W8.reserve[D.ammo] += D.start || 0;
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
    vis: () => W8.slot[D.slot] ? 'Replaces your ' + WEAP[W8.slot[D.slot]].name : 'Goes in slot ' + (SLOTS.indexOf(D.slot) + 1), w: () => 1.6 * weapWeight(id), can: () => !held(id) && weapWeight(id) > 0, ap: () => giveWeapon(id) });
}
// weapon mods (the nails in the bat, a gun's barrel) and attachments are never dealt here: you buy them at the
// workbench for the weapon in your hands (stations/recipes.js), so the cards after a wave are all about you and new weapons
