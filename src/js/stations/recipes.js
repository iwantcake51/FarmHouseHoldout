// What every station can make.

const modsFor = id => id ? Object.keys(MODS).filter(m => MODS[m].w === id && modOffer(m)) : [];
const gunAmmo = () => { const D = W(curId()); return D && D.ammo; };
// attachments for the gun in your hands, bought and fitted at the workbench: only the ones that fit it show, one card per
// line (the next tier up), then its rounds; a suppressor and a choke rule each other out on shotguns, the scopes only fit
// the rifles and the revolver
// priced in the same band as a new mod (10 to 18 scrap): by how much each step does for you, the night-only light
// cheapest, the cans and the scope dearest, and each step up costs a bit more than the last without running away
const ATT_COST = { supp: [12, 15, 18], choke: [10, 14], sight: [10, 14, 18, 22, 26], laser: [10, 14], light: [8, 12], loader: [12] };
// how many steps a line has on this gun: the scopes only on the rifles and the revolver, as far as SCOPE_TOP says, the mags as far as MAG_STEPS says, the revolver
// has one speed loader and the double barrel one Sleight of Hand (TIERS.loader has one step)
function tierMax(k, id) {
  const n = TIERS[k].t.length;
  if (k === 'sight') return SCOPE_TOP[id] || 2;
  if (k === 'mag' && MAG_STEPS[id] !== undefined) return MAG_STEPS[id];
  if (k === 'trigger' && NO_TRIGGER.has(id)) return 0;
  if (k === 'supp' && NO_SUPP.has(id)) return 0;
  return n;
}
function attachmentCards() {
  // the gun in your hands; with a melee weapon out the bench shows no gun upgrades at all
  const id = curId(), D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], group = gearGroup(D);
  for (const k of ['supp', 'choke', 'sight', 'laser', 'light', 'loader']) {
    if (!tierFits(k, id) || (k === 'choke' && D.ammo !== 'shells')) continue;
    const L = TIERS[k], n = ownTier(id, k), st = L.t[n], nm = tierName(k, n, id), txt = typeof st.text === 'function' ? st.text(D, id) : st.text;
    out.push({ ic: 'att', group, tier: () => [n, tierMax(k, id), tierRars(k, id)], for: () => forYour(id), fx: () => tierFx(id, k), cost: k === 'supp' && !D.quiet ? dmgCost(id, ATT_COST[k][n], n) : ATT_COST[k][n], title: () => nm, desc: () => txt, why: () => '',
      make: () => { const fx0 = tierFx(id, k); fitTier(id, k, n + 1); recomputeEff(); buildGuns(id); glowGun(id); feed('gear', 0, nm); gotGear({ ic: 'gear', kind: k === 'loader' && D.ammo === 'shells' ? 'Skill' : 'Attachment', name: nm, gun: id, text: txt, fx: fx0 }); } });
  }
  // rounds for the gun in your hands: every kind it takes that you don't have yet, bought and loaded (only one kind is
  // loaded at a time: weapons/rounds.js). The ones you own aren't sold again: you load them for nothing from the panel
  // beside the bench (ui/loadout.js), or X swaps between them in the field
  const on = roundOn(id), types = roundTypes(id);
  for (const k of types) {
    if (roundOwned(id, k)) continue;
    const own = false, nm = roundName(id, k), txt = roundText(id, k);
    out.push({ ic: 'ammo', group, for: () => forYour(id), fx: () => k === roundOn(id) ? [] : roundFx(id, k), cost: own ? 0 : hitsHarder(id, ROUNDS[k].fx) ? dmgCost(id, ROUNDS[k].cost) : ROUNDS[k].cost,
      title: () => (k === on ? 'Loaded: ' : own ? 'Load ' : '') + nm, desc: () => txt + (own || k === 'std' ? '' : ' · One kind loaded at a time'), why: () => k === roundOn(id) ? 'Loaded' : '',
      make: () => { const fx0 = roundFx(id, k); loadRound(id, k, true); glowGun(id); feed('ammo', 0, nm); if (!own) gotGear({ ic: 'ammo', kind: 'Rounds', name: nm, gun: id, text: txt + ' Loaded now; X swaps between the kinds you own.', fx: fx0 }); } });
  }
  // the bayonet and the stock go on this gun alone (gunAtt, game/run-state.js)
  const fitAtt = k => { setAtt(id, k, true); buildGuns(id); glowGun(id); };
  if (D.slot === 'long' && !ownAtt(id, 'bayonet')) out.push({ ic: 'att', group, for: () => forYour(id), fx: () => [{ t: 'Shove stabs for 45', good: true }], cost: 14, title: () => 'Bayonet', desc: () => 'Your shove (V) with this gun stabs instead', why: () => '', make: () => { fitAtt('bayonet'); feed('gear', 0, 'Bayonet'); gotGear({ ic: 'gear', kind: 'Attachment', name: 'Bayonet', gun: id, text: 'Shove (V) with this gun in your hands stabs for 45 damage.' }); } });
  if (D.slot === 'side' && !ownAtt(id, 'stock')) out.push({ ic: 'att', group, for: () => forYour(id), fx: () => [{ t: 'KICK −45%', good: true }, { t: 'RECOIL BUILD-UP −40%', good: true }], cost: 12, title: () => 'Shoulder stock', desc: () => 'Braced on your shoulder, it kicks less and fast shots stay tighter', why: () => '', make: () => { fitAtt('stock'); feed('gear', 0, 'Shoulder stock'); gotGear({ ic: 'gear', kind: 'Attachment', name: 'Shoulder stock', gun: id, text: '45% less kick, and quick shots open up 40% slower.' }); } });
  return out;
}
// a tune-up is the dearest thing on the bench, and the card spells out what it does
const TUNE_COST = 30;
// anything that makes a weapon hit harder costs more than the rest: DMG_PRICE times its usual price, and DMG_STEP more
// again for each step up a line it is (the second powder, a mod's level III), times how hard the weapon already hits
// (DMG_GUN: the pistol least, the LMG most; a melee weapon DMG_MELEE)
const DMG_PRICE = 1.5, DMG_STEP = 0.35, DMG_MELEE = 1;
const DMG_GUN = { pistol: 1, revolver: 1.3, deagle: 1.6, dbl: 1.3, pump: 1.4, auto12: 1.9, hunting: 1.6, scar: 1.8, smg: 1.3, sub: 1.5, ar: 1.7, lmg: 2 };
const dmgCost = (id, c, step = 0) => Math.round(c * DMG_PRICE * (1 + DMG_STEP * step) * (WEAP[id].melee ? DMG_MELEE : DMG_GUN[id] || 1.4));
// whether a change (fn, applied to a copy of the weapon as it is now) makes each shot or swing hit harder
const hitsHarder = (id, fn) => { const D0 = Object.assign({}, W(id)), D1 = Object.assign({}, D0); fn(D1, id); return D1.dmg * (D1.pellets || 1) > D0.dmg * (D0.pellets || 1) * 1.001; };
const tuneText = D => D.melee ? `+${pctUp(TUNE.dmg)}% damage, ${pctUp(1 / TUNE.rate)}% faster swings, +${TUNE.reach} m reach, ${pctUp(TUNE.kb)}% more knockback`
  : `+${pctUp(TUNE.dmg)}% damage, ${pctUp(1 / TUNE.rate)}% faster fire, ${pctDown(TUNE.reload)}% faster reloads, ${pctDown(TUNE.spread)}% tighter spread, +${Math.round(TUNE.crit * 100)}% crit chance, crits +${TUNE.critM}×`;
const pctUp = m => Math.round((m - 1) * 100), pctDown = m => Math.round((1 - m) * 100);
// ammo is sold by the gun: one load for the gun in your hands, or one for every gun you carry at the same price each
// (so two 9mm guns are two loads of 9mm, and three guns cost three times one)
const AMMO_COST = 4;
const ammoGuns = () => SLOTS.map(s => W8.slot[s]).filter(id => id && W(id).ammo);
const allAmmo = () => { const by = new Map(); ammoGuns().forEach(id => by.set(W(id).ammo, (by.get(W(id).ammo) || 0) + gunBatch(id))); return [...by]; };
// who a bench card is for, written at the top of the card so it's never in doubt
const forYour = id => 'For your ' + gunCall(id);
// everything that changes the weapon in your hands sits in one group: its upgrades, new and improved mods and attachments
const gearGroup = D => (D.melee ? 'Upgrades · ' : 'Attachments / Upgrades · ') + D.name;
const BENCH = [
    { ic: 'ammo', quick: 'hand', for: () => gunAmmo() ? forYour(curId()) : 'For the gun in your hands', cost: AMMO_COST, title: () => gunAmmo() ? 'Hand-load ' + AMMO_NAME[gunAmmo()] : 'Hand-load ammo', desc: () => gunAmmo() ? `+${gunBatch(curId())} for your ${W(curId()).name.toLowerCase()}` : 'Loads for the gun in your hands', why: () => gunAmmo() ? '' : 'Hold a gun first', make: () => { const id = curId(), a = gunAmmo(), n = gunBatch(id); W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); } },
    { ic: 'ammo', quick: 'all', for: () => ammoGuns().length > 1 ? `For all ${ammoGuns().length} of your guns` : 'For every gun you carry', get cost() { return Math.max(AMMO_COST, AMMO_COST * ammoGuns().length); }, title: () => 'Ammo for everything', desc: () => ammoGuns().length ? allAmmo().map(([a, n]) => `+${n} ${AMMO_NAME[a]}`).join(' · ') + (ammoGuns().length > 1 ? ` · one load for each of your ${ammoGuns().length} guns` : '') : 'Every gun you carry', why: () => ammoGuns().length ? '' : 'No guns that use ammo', make: () => allAmmo().forEach(([a, n]) => { W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); }) },
    // tuning: one full going-over of the weapon in your hands, once per weapon and dear. It makes it a little better at
    // everything (TUNE in game/run-state.js) without turning it into a different weapon
    { ic: 'gear', for: () => forYour(curId()), fx: () => tuneFx(curId()), gone: () => !!W8.tune[curId()], get cost() { return curId() ? dmgCost(curId(), TUNE_COST) : TUNE_COST; }, title: () => (W8.tune[curId()] ? 'Tuned: ' : 'Tune up the ') + W(curId()).short, desc: () => tuneText(W(curId())) + ' · Once per weapon', why: () => W8.tune[curId()] ? 'Already tuned' : '',
      make: () => { const id = curId(), fx0 = tuneFx(id); W8.tune[id] = 1; recomputeEff(); glowGun(id); feed('gear', 0, W(id).short + ' tuned'); gotGear({ ic: 'gear', kind: 'Tune-up', name: 'Tuned up', gun: id, text: tuneText(W(id)) + '.', fx: fx0 }); } }
];
// upgrades for the weapon in your hands, in one group after its ammo, trigger and magazine lines (gunTierCards): one
// card for each mod it could take, and for each one it has that could be made better (up to level III), so you pick
// which you get. A new mod costs more the rarer it is, from 10 to 18 scrap (the
// same band as the attachments above); improving one costs 10 for level II and 13 for level III. One that makes the
// weapon hit harder costs more (dmgCost)
const TINKER_NEW = { c: 10, u: 12, r: 14, e: 16, l: 18 }, TINKER_UP = [0, 10, 13];
const tinkerNew = (m, id) => { if (MODS[m].cost) return MODS[m].cost; const c = TINKER_NEW[MODS[m].r] || 14; return hitsHarder(id, MODS[m].stat) ? dmgCost(id, c) : c; };   // (a mod with a price of its own, the AK kit's, costs that)
const tinkerUp = (m, id) => { const c = TINKER_UP[modLv(m)] || 14; return hitsHarder(id, MOD_UP[m].up) ? dmgCost(id, c, modLv(m)) : c; };
// a melee mod that makes the weapon long enough to sweep through more than one zombie says so on its card
function multiNote(id, apply) {
  const D0 = W(id); if (!D0.melee) return '';
  const D1 = Object.assign({}, D0); apply(D1); reachCleave(D1);
  const t = multiHit(D0, D1) || ((D1.cleave || 1) > (D0.cleave || 1) ? { t: `+ Hits ${D1.cleave} at once` } : null);
  return t ? ' · ' + t.t : '';
}
// conv: only the mods that turn the gun into something else (a conversion kit, a second gun), which sit at the top of the
// bench with the tune-up, out of the group; otherwise the rest, in the group
function tinkerCards(conv = false) {
  const id = curId(), D = id && W(id); if (!D) return [];
  const out = [], group = conv ? undefined : gearGroup(D);
  modsFor(id).filter(m => !MODS[m].conv === !conv).forEach(m => out.push({ ic: 'gear', group, tier: MOD_LINE[m] ? () => MOD_LINE[m] : undefined, for: () => forYour(id), fx: () => modFx(m), cost: tinkerNew(m, id), title: () => MODS[m].name, desc: () => 'New mod · ' + MODS[m].text + multiNote(id, MODS[m].stat), why: () => '',
    make: () => { const fx0 = modFx(m); magChange(id, () => addMod(id, m)); buildGuns(id); glowGun(id); feed('gear', 0, MODS[m].name); gotGear({ ic: 'gear', kind: 'New mod', name: MODS[m].name, gun: id, text: MODS[m].text + magNote(id), fx: fx0 }); } }));
  if (conv) return out;
  modUps(id).forEach(m => out.push({ ic: 'gear', group, tier: () => [modLv(m), MOD_LINE[m] ? MOD_LINE[m][1] : MOD_MAX], for: () => forYour(id), fx: () => improveFx(id, m), get cost() { return tinkerUp(m, id); }, title: () => MODS[m].names ? modNameAt(m, modLv(m)) + ' → ' + modNameAt(m, modLv(m) + 1) : MODS[m].name + ' ' + roman(modLv(m)) + ' → ' + roman(modLv(m) + 1), desc: () => 'Improve · ' + MOD_UP[m].t + multiNote(id, MOD_UP[m].up), why: () => '',
    make: () => { const fx0 = improveFx(id, m); magChange(id, () => improveMod(m)); buildGuns(id); glowGun(id); feed('gear', 0, modName(m)); gotGear({ ic: 'gear', kind: 'Mod improved', name: modName(m), gun: id, text: MOD_UP[m].t + '.' + magNote(id), fx: fx0 }); } }));
  return out;
}
// a gun's own upgrades, one card per line (the next tier up) for the gun in your hands: better rounds, a lighter
// trigger, bigger magazines. Priced by how rare the step is, in the same band as a new mod
const TIER_COST = { c: 10, u: 12, r: 14, e: 16, l: 18 };

function gunTierCards() {
  const id = curId(), D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], group = gearGroup(D);
  for (const k of ['ammo', 'trigger', 'mag']) {
    if (!tierFits(k, id)) continue;
    const L = TIERS[k], n = ownTier(id, k), st = L.t[n], nm = tierName(k, n, id), txt = typeof st.text === 'function' ? st.text(D, id) : st.text, r = (k === 'mag' && st.rAs && st.rAs[id]) || st.r;
    out.push({ ic: k === 'ammo' ? 'ammo' : 'gear', group, tier: () => [n, tierMax(k, id), tierRars(k, id)], for: () => forYour(id), fx: () => tierFx(id, k), cost: k === 'ammo' ? dmgCost(id, TIER_COST[r] || 14, n) : TIER_COST[r] || 14, title: () => nm, desc: () => txt, why: () => '',
      make: () => { const fx0 = tierFx(id, k); magChange(id, () => { fitTier(id, k, n + 1); recomputeEff(); }); buildGuns(id); glowGun(id); feed('gear', 0, nm); gotGear({ ic: k === 'ammo' ? 'ammo' : 'gear', kind: TIER_LINE[k] + ' upgrade', name: nm, gun: id, text: txt + magNote(id), fx: fx0 }); } });
  }
  return out;
}
const TIER_LINE = { ammo: 'Ammo', trigger: 'Trigger', mag: 'Magazine' };
// a bigger mag bought for a gun waits in the pouch until you next reload (magChange, game/run-state.js)
const magNote = id => W8.pin[id] ? ' The new mag goes in at your next reload.' : '';
// the sawhorse's cards say so when your stack is close to full (PLANK_MAX, barricades/planks.js)
const plankDesc = (n, text) => plankRoom() && plankRoom() < n ? `Only room for ${plankRoom()} more (you carry ${PLANK_MAX} at most)` : text;
const plankWhy = () => plankRoom() ? '' : `You can't carry more than ${PLANK_MAX}`;
// full: a card you can't take because you already carry as many as you can (a full bandage bag, a full plank stack)
// is darkened at the station, so it's plain it can't be had right now (stations/station-ui.js)
const bagFull = () => (P.band || 0) >= bandMax(), stackFull = () => !plankRoom();
// the medicine cabinet: bandages, a stitch-up, and its three upgrades
const MED = [
  { ic: 'med', for: () => 'For you', full: bagFull, cost: 4, title: () => 'Bandage', desc: () => `Goes in your bag (${P.band || 0}/${bandMax()}). Q to use: heals ${bandHeal()} over time and stops bleeding`, why: () => (P.band || 0) < bandMax() ? '' : 'Your bag is full', make: () => { P.band = (P.band || 0) + 1; feed('med', 1, 'bandage'); popEl('bands'); } },
  { ic: 'med', for: () => 'For you', cost: 7, title: () => 'Stitch up', desc: () => '+60 health and no more slowdown', why: () => P.hp < S.maxHp ? '' : 'You are at full health', make: () => { const h = Math.min(60, S.maxHp - P.hp); P.hp += h; P.slow = 0; P.bleed = 0; feed('med', Math.round(h), 'health'); } },
  ...['hands', 'dress', 'tonic'].map(medUpgrade)
];
// the sawhorse: planks, and bracing the boards (braceCard); made over into the metalwork bench (barricades/metal-bars.js)
// it cuts metal instead, a grate's worth (GRATE.cost) at a time, and plates the grates (grateCard)
const cutCard = (n, cost, desc, m, mCost, mDesc) => ({ get ic() { return matKind(); }, full: stackFull, get cost() { return METAL.on ? mCost : cost; }, title: () => `Cut ${METAL.on ? m : n} ${matWord()}`,
  desc: () => plankDesc(METAL.on ? m : n, METAL.on ? mDesc : desc), why: plankWhy, make: () => { feed(matKind(), addPlanks(METAL.on ? m : n), matWord()); popEl('planks'); } });
const SAW = [
  cutCard(2, 3, 'Enough for one more board', 3, 6, 'Enough to bar one window'),
  cutCard(6, 8, 'Board up two whole windows', 9, 16, 'Bar three windows'),   // (metal dearer than planks: METAL in barricades/metal-bars.js)
  braceCard(), grateCard()
];
// plating the grates (GRATE, barricades/metal-bars.js): five tiers for the team, each a row more of steel plate bolted
// over the outside of every grate, each dearer than the last; every grate is made good as it's done, and stronger
function grateCard() {
  const lv = () => METAL.tier, pct = n => Math.round(GRATE.tierHp * n * 100);
  return { ic: 'metal', tier: () => [Math.min(lv(), GRATE.tiers), GRATE.tiers], gone: () => !METAL.on || lv() >= GRATE.tiers, get cost() { return GRATE.up[Math.min(lv(), GRATE.tiers - 1)]; },
    title: () => 'Plate the grates ' + roman(Math.min(lv() + 1, GRATE.tiers)),
    desc: () => `More plate on the grates, and they're repaired · +${pct(lv())}% → +${pct(lv() + 1)}% strength`, why: () => '',
    make: () => {
      applyMetal(true, lv() + 1, false); netMetal(); SFX.clang(0.8);
      feed('metal', 0, 'Grates plated ' + roman(METAL.tier)); gotGear({ ic: 'metal', kind: 'Metalwork bench', name: 'Plate the grates ' + roman(METAL.tier), text: `Grates +${pct(METAL.tier)}% stronger.` });
    } };
}
// bracing the boards (BRACE, barricades/planks.js): five levels, for good, each one making every board you put up
// stronger, and the ones up now too (on a joiner's farm the host keeps the boards already up, so there it's only the
// ones you put up from then on)
function braceCard() {
  const lv = braceLv, done = () => lv() >= BRACE.max, pct = n => Math.round((braceMul(n) - 1) * 100);
  return { ic: 'planks', tier: () => [Math.min(lv(), BRACE.max), BRACE.max], gone: () => done() || METAL.on, get cost() { return BRACE.cost[Math.min(lv(), BRACE.max - 1)]; },
    title: () => 'Brace the boards ' + roman(Math.min(lv() + 1, BRACE.max)), desc: () => `Every board you put up, and the ones up now, ${Math.round(BRACE.step * 100)}% stronger for the rest of the run (+${pct(lv())}% → +${pct(lv() + 1)}%)`, why: () => '',
    make: () => {
      const r = braceMul(lv() + 1) / braceMul(); S.brace = lv() + 1;
      if (!(netLink() && !NET.host)) openings.forEach(o => { o.boards = o.boards.map(h => h * r); o.meshes.forEach(m => { m.userData.hp0 = (m.userData.hp0 || 0) * r; }); });
      feed('planks', 0, 'Boards braced ' + roman(S.brace)); gotGear({ ic: 'planks', kind: 'Sawhorse', name: 'Brace the boards ' + roman(S.brace), whom: 'you', text: `Every board you put up is now +${pct(S.brace)}% stronger.` });
    } };
}
// an upgrade you can't take any more of (gone: tuned already, a cabinet upgrade at its top level) isn't shown at all
const shown = list => list.filter(r => !(r.gone && r.gone()));
const RECIPES = {
  get bench() { return shown(BENCH).concat(tinkerCards(true), gunTierCards(), tinkerCards(), attachmentCards()); },
  get saw() { return shown(SAW); },
  get med() { return shown(MED); },
  // the ham radio: a supply drop (stations/supply-drop.js), brought in by helicopter
  get radio() {
    return [{ ic: 'supply', group: 'Supplies', cost: 20, title: () => dropBusy() ? 'Drop on its way' : 'Call a supply drop', desc: () => supplyT > 0 ? `Lands in the yard in ${Math.ceil(supplyT)}s` : `A crate of ammo, ${matWord()}, scrap and bandages lands in the yard`, why: busyWhy,
      make: () => { callDrop({ kind: 'supply' }); feed('supply', 0, 'Supply drop called'); } }];
  }
};
// a medicine cabinet upgrade card: three levels, each dearer than the last (MED_UP lives in player/bandages.js, read lazily)
function medUpgrade(k) {
  const U = () => MED_UP[k], lv = () => medT(k), done = () => lv() >= U().max, num = n => ' ' + 'I'.repeat(n);
  return { ic: 'med', tier: () => [Math.min(lv(), U().max), U().max], for: () => 'For you', gone: done, get cost() { return U().cost[Math.min(lv(), U().max - 1)]; }, title: () => U().name + (done() ? '' : num(lv() + 1)), desc: () => done() ? 'Fully upgraded' : U().desc(lv()), why: () => done() ? 'Fully upgraded' : '',
    make: () => { S.med[k] = lv() + 1; feed('med', 0, U().name + num(S.med[k])); gotGear({ ic: 'med', kind: 'Medicine', name: U().name + num(S.med[k]), whom: 'you', text: U().desc(S.med[k] - 1) + '.' }); } };
}
