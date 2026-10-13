// What every station can make.

const modsFor = id => id ? Object.keys(MODS).filter(m => MODS[m].w === id && modOffer(m)) : [];
const gunAmmo = () => { const D = W(curId()); return D && D.ammo; };
// attachments for the gun in your hands, bought and fitted at the workbench: only the ones that fit it show, one card per
// line (the next tier up); a suppressor and a choke rule each other out on shotguns, the scope only fits long guns
// priced in the same band as a new mod (10 to 18 scrap): by how much each step does for you, the night-only light
// cheapest, the cans and the scope dearest, and each step up costs a bit more than the last without running away
const ATT_COST = { supp: [12, 15, 18], choke: [10, 14], sight: [10, 14, 18], laser: [10, 14], light: [8, 12], loader: [12, 16] };
function attachmentCards() {
  // the gun in your hands; with a melee weapon out the bench shows no gun upgrades at all
  const id = curId(), D = id && WEAP[id]; if (!D || D.melee) return [];
  const out = [], group = gearGroup(D);
  for (const k of ['supp', 'choke', 'sight', 'laser', 'light', 'loader']) {
    if (!tierFits(k, id) || (k === 'choke' && D.ammo !== 'shells')) continue;
    const L = TIERS[k], n = gunTier(id, k), st = L.t[n], txt = typeof st.text === 'function' ? st.text(D) : st.text;
    out.push({ ic: 'gear', group, for: () => forYour(id), fx: () => tierFx(id, k), cost: ATT_COST[k][n], title: () => st.name, desc: () => txt + (n ? ` Replaces the ${L.t[n - 1].name.toLowerCase()}.` : ''), why: () => '',
      make: () => { W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = n + 1; recomputeEff(); buildGuns(); gunGlow = 1; feed('gear', 0, st.name); toast(st.name, { kind: 'good', icon: 'gear', sub: 'Fitted to your ' + D.name.toLowerCase() }); } });
  }
  // rounds for every gun you carry, fitted here like the rest: incendiary rounds, and rounds that go through one more
  // zombie (twice at most)
  if (!S.att.fire) out.push({ ic: 'ammo', group, for: () => 'For every gun you carry', fx: () => [{ t: 'Sets zombies alight for 3 s', good: true }], cost: 18, title: () => 'Incendiary rounds', desc: () => 'Every bullet sets the zombie it hits on fire for 3 seconds.', why: () => '',
    make: () => { S.att.fire = true; buildGuns(); gunGlow = 1; feed('gear', 0, 'Incendiary rounds'); toast('Incendiary rounds', { kind: 'good', icon: 'ammo', sub: 'Loaded in every gun you carry' }); } });
  if (S.pierce < 2) out.push({ ic: 'ammo', group, for: () => 'For every gun you carry', fx: () => [{ t: `PIERCE +${S.pierce} → +${S.pierce + 1}`, good: true }], cost: [12, 16][S.pierce], title: () => 'Through and through' + (S.pierce ? ' II' : ''), desc: () => 'Bullets pass through one more zombie.', why: () => '',
    make: () => { S.pierce++; buildGuns(); gunGlow = 1; feed('gear', 0, 'Through and through'); toast('Through and through', { kind: 'good', icon: 'ammo', sub: 'Every gun you carry: bullets go through ' + S.pierce + ' more' }); } });
  if (D.slot === 'long' && !S.att.bayonet) out.push({ ic: 'gear', group, for: () => 'For every long gun you carry', fx: () => [{ t: 'Shove stabs for 45', good: true }], cost: 14, title: () => 'Bayonet', desc: () => 'A blade under your long guns: shoving (V) stabs for 45 damage', why: () => '', make: () => { S.att.bayonet = true; buildGuns(); gunGlow = 1; feed('gear', 0, 'Bayonet'); toast('Bayonet', { kind: 'good', icon: 'gear', sub: 'Fitted to your long guns · V to stab' }); } });
  if (D.slot === 'side' && !S.att.stock) out.push({ ic: 'gear', group, for: () => 'For every sidearm you carry', fx: () => [{ t: 'SPREAD −25%', good: true }, { t: 'KICK −45%', good: true }], cost: 12, title: () => 'Shoulder stock', desc: () => 'Steadies every sidearm: spread −25%, kick −45%', why: () => '', make: () => { S.att.stock = true; buildGuns(); gunGlow = 1; feed('gear', 0, 'Shoulder stock'); toast('Shoulder stock', { kind: 'good', icon: 'gear', sub: 'Fitted to your sidearms' }); } });
  return out;
}
// a tune-up is the dearest thing on the bench, and the card spells out what it does
const TUNE_COST = 30;
const tuneText = D => D.melee ? `+${pctUp(TUNE.dmg)}% damage, ${pctUp(1 / TUNE.rate)}% faster swings, +${TUNE.reach} m reach, ${pctUp(TUNE.kb)}% more knockback`
  : `+${pctUp(TUNE.dmg)}% damage, ${pctUp(1 / TUNE.rate)}% faster fire, ${pctDown(TUNE.reload)}% faster reloads, ${pctDown(TUNE.spread)}% tighter spread`;
const pctUp = m => Math.round((m - 1) * 100), pctDown = m => Math.round((1 - m) * 100);
// ammo is sold by the gun: one load for the gun in your hands, or one for every gun you carry at the same price each
// (so two 9mm guns are two loads of 9mm, and three guns cost three times one)
const AMMO_COST = 4;
const ammoGuns = () => SLOTS.map(s => W8.slot[s]).filter(id => id && W(id).ammo);
const allAmmo = () => { const by = new Map(); ammoGuns().forEach(id => by.set(W(id).ammo, (by.get(W(id).ammo) || 0) + gunBatch(id))); return [...by]; };
// who a bench card is for, written at the top of the card so it's never in doubt
const forYour = id => 'For your ' + WEAP[id].name.toLowerCase();
// everything that changes the weapon in your hands sits in one group: its upgrades, new and improved mods and attachments
const gearGroup = D => (D.melee ? 'Upgrades · ' : 'Attachments / Upgrades · ') + D.name;
const BENCH = [
    { ic: 'ammo', for: () => gunAmmo() ? forYour(curId()) : 'For the gun in your hands', cost: AMMO_COST, title: () => gunAmmo() ? 'Hand-load ' + AMMO_NAME[gunAmmo()] : 'Hand-load ammo', desc: () => gunAmmo() ? `+${gunBatch(curId())} for your ${W(curId()).name.toLowerCase()}` : 'Loads for the gun in your hands', why: () => gunAmmo() ? '' : 'Hold a gun first', make: () => { const id = curId(), a = gunAmmo(), n = gunBatch(id); W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); } },
    { ic: 'ammo', for: () => ammoGuns().length > 1 ? `For all ${ammoGuns().length} of your guns` : 'For every gun you carry', get cost() { return Math.max(AMMO_COST, AMMO_COST * ammoGuns().length); }, title: () => 'Ammo for everything', desc: () => ammoGuns().length ? allAmmo().map(([a, n]) => `+${n} ${AMMO_NAME[a]}`).join(' · ') + (ammoGuns().length > 1 ? ` · one load for each of your ${ammoGuns().length} guns` : '') : 'Every gun you carry', why: () => ammoGuns().length ? '' : 'No guns that use ammo', make: () => allAmmo().forEach(([a, n]) => { W8.reserve[a] += n; feed('ammo', n, AMMO_NAME[a]); }) },
    // tuning: one full going-over of the weapon in your hands, once per weapon and dear. It makes it a little better at
    // everything (TUNE in game/run-state.js) without turning it into a different weapon
    { ic: 'gear', for: () => forYour(curId()), fx: () => tuneFx(curId()), gone: () => !!W8.tune[curId()], cost: TUNE_COST, title: () => (W8.tune[curId()] ? 'Tuned: ' : 'Tune up the ') + W(curId()).short, desc: () => tuneText(W(curId())) + ' · Once per weapon', why: () => W8.tune[curId()] ? 'Already tuned' : '',
      make: () => { const id = curId(); W8.tune[id] = 1; recomputeEff(); gunGlow = 1; feed('gear', 0, W(id).short + ' tuned'); toast(W(id).name + ' tuned', { kind: 'good', icon: 'gear', sub: tuneText(W(id)) }); } }
];
// upgrades for the weapon in your hands, in one group after its ammo, trigger and magazine lines (gunTierCards): one
// card for each mod it could take, and for each one it has that could be made better (up to level III), so you pick
// which you get. A new mod costs more the rarer it is, from 10 to 18 scrap (the
// same band as the attachments above); improving one costs 10 for level II and 13 for level III
const TINKER_NEW = { c: 10, u: 12, r: 14, e: 16, l: 18 }, TINKER_UP = [0, 10, 13];
const tinkerNew = m => TINKER_NEW[MODS[m].r] || 14, tinkerUp = m => TINKER_UP[modLv(m)] || 14;
// a melee mod that makes the weapon long enough to sweep through more than one zombie says so on its card
function multiNote(id, apply) {
  const D0 = W(id); if (!D0.melee) return '';
  const D1 = Object.assign({}, D0); apply(D1); reachCleave(D1);
  const t = multiHit(D0, D1) || ((D1.cleave || 1) > (D0.cleave || 1) ? { t: `+ Hits ${D1.cleave} at once` } : null);
  return t ? ' · ' + t.t : '';
}
function tinkerCards() {
  const id = curId(), D = id && W(id); if (!D) return [];
  const group = gearGroup(D), out = [];
  modsFor(id).forEach(m => out.push({ ic: 'gear', group, for: () => forYour(id), fx: () => modFx(m), cost: tinkerNew(m), title: () => MODS[m].name, desc: () => 'New mod · ' + MODS[m].text + multiNote(id, MODS[m].stat), why: () => '',
    make: () => { addMod(id, m); buildGuns(); gunGlow = 1; feed('gear', 0, MODS[m].name); toast(MODS[m].name, { kind: 'good', icon: 'gear', sub: 'New mod · ' + MODS[m].text }); } }));
  modUps(id).forEach(m => out.push({ ic: 'gear', group, for: () => forYour(id), fx: () => improveFx(id, m), get cost() { return tinkerUp(m); }, title: () => MODS[m].name + ' ' + roman(modLv(m)) + ' → ' + roman(modLv(m) + 1), desc: () => 'Improve · ' + MOD_UP[m].t + multiNote(id, MOD_UP[m].up), why: () => '',
    make: () => { improveMod(m); buildGuns(); gunGlow = 1; feed('gear', 0, modName(m)); toast(modName(m), { kind: 'good', icon: 'gear', sub: 'Mod improved · ' + MOD_UP[m].t }); } }));
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
    const L = TIERS[k], n = gunTier(id, k), st = L.t[n];
    out.push({ ic: k === 'ammo' ? 'ammo' : 'gear', group, for: () => forYour(id), fx: () => tierFx(id, k), cost: TIER_COST[st.r] || 14, title: () => st.name, desc: () => `${TIER_LINE[k]} ${n + 1} of ${L.t.length} · ${st.text}` + (n ? ` Replaces the ${L.t[n - 1].name.toLowerCase()}.` : ''), why: () => '',
      make: () => { W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = n + 1; recomputeEff(); buildGuns(); gunGlow = 1; feed('gear', 0, st.name); toast(st.name, { kind: 'good', icon: 'gear', sub: forYour(id) + ' · ' + st.text }); } });
  }
  return out;
}
const TIER_LINE = { ammo: 'Ammo', trigger: 'Trigger', mag: 'Magazine' };
// the sawhorse's cards say so when your stack is close to full (PLANK_MAX, barricades/planks.js)
const plankDesc = (n, text) => plankRoom() && plankRoom() < n ? `Only room for ${plankRoom()} more (you carry ${PLANK_MAX} at most)` : text;
const plankWhy = () => plankRoom() ? '' : `You can't carry more than ${PLANK_MAX}`;
// full: a card you can't take because you already carry as many as you can (a full bandage bag, a full plank stack)
// is darkened at the station, so it's plain it can't be had right now (stations/station-ui.js)
const bagFull = () => (P.band || 0) >= bandMax(), stackFull = () => !plankRoom();
// the medicine cabinet: bandages, a stitch-up, and its three upgrades
const MED = [
  { ic: 'med', for: () => 'For you', full: bagFull, cost: 4, title: () => 'Bandage', desc: () => `Into your bag (${P.band || 0}/${bandMax()}). Press G to use: +${bandHeal()} health over time, stops bleeding`, why: () => (P.band || 0) < bandMax() ? '' : 'Your bag is full', make: () => { P.band = (P.band || 0) + 1; feed('med', 1, 'bandage'); popEl('bands'); } },
  { ic: 'med', for: () => 'For you', cost: 7, title: () => 'Stitch up', desc: () => '+60 health and shakes off the slowdown', why: () => P.hp < S.maxHp ? '' : 'You are at full health', make: () => { const h = Math.min(60, S.maxHp - P.hp); P.hp += h; P.slow = 0; P.bleed = 0; feed('med', Math.round(h), 'health'); } },
  ...['hands', 'dress', 'tonic'].map(medUpgrade)
];
// an upgrade you can't take any more of (gone: tuned already, a cabinet upgrade at its top level) isn't shown at all
const shown = list => list.filter(r => !(r.gone && r.gone()));
const RECIPES = {
  get bench() { return shown(BENCH).concat(gunTierCards(), tinkerCards(), attachmentCards()); },
  saw: [
    { ic: 'planks', full: stackFull, cost: 3, title: () => 'Cut 2 planks', desc: () => plankDesc(2, 'Enough for one more board'), why: plankWhy, make: () => { feed('planks', addPlanks(2), 'planks'); popEl('planks'); } },
    { ic: 'planks', full: stackFull, cost: 8, title: () => 'Cut 6 planks', desc: () => plankDesc(6, 'Board up two whole windows'), why: plankWhy, make: () => { feed('planks', addPlanks(6), 'planks'); popEl('planks'); } },
    { ic: 'planks', cost: 8, title: () => 'Brace the boards', desc: () => 'Every board back to full, 25% stronger', why: () => openings.some(o => o.boards.length) ? '' : 'No boards up yet', make: () => { openings.forEach(o => o.boards = o.boards.map(() => 70 * S.boardMul * 1.25)); feed('planks', 0, 'Boards braced'); } }
  ],
  get med() { return shown(MED); },
  radio: [
    { ic: 'supply', cost: 20, title: () => supplyT > 0 ? 'Drop on its way' : 'Call a supply drop', desc: () => supplyT > 0 ? `Lands in the yard in ${Math.ceil(supplyT)}s` : 'A crate of ammo, planks, scrap and bandages lands in the yard', why: () => supplyT > 0 ? 'Already called' : '', make: () => { supplyT = 9; feed('supply', 0, 'Supply drop called'); } }
  ]
};
// a medicine cabinet upgrade card: three levels, each dearer than the last (MED_UP lives in player/bandages.js, read lazily)
function medUpgrade(k) {
  const U = () => MED_UP[k], lv = () => medT(k), done = () => lv() >= U().max, num = n => ' ' + 'I'.repeat(n);
  return { ic: 'med', for: () => 'For you', gone: done, get cost() { return U().cost[Math.min(lv(), U().max - 1)]; }, title: () => U().name + (done() ? '' : num(lv() + 1)), desc: () => done() ? 'Fully upgraded' : U().desc(lv()), why: () => done() ? 'Fully upgraded' : '',
    make: () => { S.med[k] = lv() + 1; feed('med', 0, U().name + num(S.med[k])); } };
}
