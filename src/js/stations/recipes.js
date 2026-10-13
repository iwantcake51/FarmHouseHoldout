// What every station can make.

const modsFor = id => id ? Object.keys(MODS).filter(m => MODS[m].w === id && !hasMod(m) && (!MODS[m].need || hasMod(MODS[m].need))) : [];
const gunAmmo = () => { const D = W(curId()); return D && D.ammo; };
// attachments for the gun in your hands, bought and fitted at the workbench: only the ones that fit it show, one card per
// line (the next tier up); a suppressor and a choke rule each other out on shotguns, the scope only fits long guns
const ATT_COST = { supp: [12, 20, 30], choke: [10, 18], sight: [10, 18, 28], laser: [10, 20], light: [8, 16] };
function attachmentCards() {
  // the gun in your hands, or your first gun if you walked up with a blade out
  const cur = curId(), id = cur && !WEAP[cur].melee ? cur : gunsHeld()[0], D = id && WEAP[id]; if (!D) return [];
  const out = [], group = 'Attachments · ' + D.name;
  for (const k of ['supp', 'choke', 'sight', 'laser', 'light']) {
    if (!tierFits(k, id) || (k === 'choke' && D.ammo !== 'shells')) continue;
    const L = TIERS[k], n = gunTier(id, k), st = L.t[n];
    out.push({ ic: 'gear', group, cost: ATT_COST[k][n], title: () => st.name, desc: () => st.text + (n ? ` Replaces the ${L.t[n - 1].name.toLowerCase()}.` : ''), why: () => '',
      make: () => { W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = n + 1; recomputeEff(); buildGuns(); gunGlow = 1; feed('gear', 0, st.name); toast(st.name, { kind: 'good', icon: 'gear', sub: 'Fitted to your ' + D.name.toLowerCase() }); } });
  }
  if (D.slot === 'long' && !S.att.bayonet) out.push({ ic: 'gear', group, cost: 16, title: () => 'Bayonet', desc: () => 'A blade under your long guns: shoving (V) stabs for 45 damage', why: () => '', make: () => { S.att.bayonet = true; buildGuns(); gunGlow = 1; feed('gear', 0, 'Bayonet'); toast('Bayonet', { kind: 'good', icon: 'gear', sub: 'Fitted to your long guns · V to stab' }); } });
  if (D.slot === 'side' && !S.att.stock) out.push({ ic: 'gear', group, cost: 14, title: () => 'Shoulder stock', desc: () => 'Steadies every sidearm: spread −25%, kick −45%', why: () => '', make: () => { S.att.stock = true; buildGuns(); gunGlow = 1; feed('gear', 0, 'Shoulder stock'); toast('Shoulder stock', { kind: 'good', icon: 'gear', sub: 'Fitted to your sidearms' }); } });
  return out;
}
const BENCH = [
    { ic: 'ammo', cost: 4, title: () => gunAmmo() ? 'Hand-load ' + AMMO_NAME[gunAmmo()] : 'Hand-load ammo', desc: () => gunAmmo() ? `+${ammoAmt(gunAmmo()) * 2} for your ${W(curId()).name.toLowerCase()}` : 'Loads for the gun in your hands', why: () => gunAmmo() ? '' : 'Hold a gun first', make: () => { const a = gunAmmo(); W8.reserve[a] += ammoAmt(a) * 2; feed('ammo', ammoAmt(a) * 2, AMMO_NAME[a]); } },
    { ic: 'ammo', get cost() { return Math.max(4, 4 * SLOTS.filter(s => W8.slot[s] && W(W8.slot[s]).ammo).length); }, title: () => 'Ammo for everything', desc: () => ammoTypes().length ? ammoTypes().map(a => `+${ammoAmt(a) * 2} ${AMMO_NAME[a]}`).join(' · ') : 'Every gun you carry', why: () => ammoTypes().length ? '' : 'No guns that use ammo', make: () => ammoTypes().forEach(a => { W8.reserve[a] += ammoAmt(a) * 2; feed('ammo', ammoAmt(a) * 2, AMMO_NAME[a]); }) },
    // tinkering fits a new mod or improves one the weapon already has (each up to level III), picked at random
    { ic: 'gear', cost: 18, title: () => curId() ? `Tinker with the ${W(curId()).short}` : 'Tinker',
      desc: () => { const id = curId(), n = modsFor(id).length, u = modUps(id); return n && u.length ? 'Fits a new mod, or improves one it has (up to III)' : n ? 'Fits a random new mod' : u.length ? 'Improves one of its mods: ' + u.map(m => MODS[m].name + ' → ' + roman(modLv(m) + 1)).join(', ') : 'A new mod, or a better one'; },
      why: () => modsFor(curId()).length || modUps(curId()).length ? '' : 'Nothing left to fit or improve',
      make: () => {
        const id = curId(), [k, m] = pick([...modsFor(id).map(m => ['new', m]), ...modUps(id).map(m => ['up', m])]);
        if (k === 'new') { addMod(id, m); feed('gear', 0, MODS[m].name); toast(MODS[m].name, { kind: 'good', icon: 'gear', sub: 'New mod · ' + MODS[m].text }); }
        else { improveMod(m); feed('gear', 0, modName(m)); toast(modName(m), { kind: 'good', icon: 'gear', sub: 'Mod improved · ' + MOD_UP[m].t }); }
        buildGuns(); gunGlow = 1;
      } },
    // tuning works on the weapon in your hands only, and each time you tune the same weapon it costs half as much again
    { ic: 'gear', get cost() { return Math.round(12 * Math.pow(1.5, W8.tune[curId()] || 0)); }, title: () => `Tune and sharpen the ${W(curId()).short}`, desc: () => `+8% damage on this weapon only${W8.tune[curId()] ? ` (tuned ${W8.tune[curId()]}×, +${Math.round((Math.pow(1.08, W8.tune[curId()]) - 1) * 100)}% so far)` : ''}. Costs more each time`, why: () => '', make: () => { const id = curId(); W8.tune[id] = (W8.tune[id] || 0) + 1; recomputeEff(); gunGlow = 1; feed('gear', 8, '% ' + W(id).short + ' damage'); } }
];
const RECIPES = {
  get bench() { return BENCH.concat(attachmentCards()); },
  saw: [
    { ic: 'planks', cost: 3, title: () => 'Cut 2 planks', desc: () => 'Enough for one more board', why: () => '', make: () => { S.planks += 2; feed('planks', 2, 'planks'); popEl('planks'); } },
    { ic: 'planks', cost: 8, title: () => 'Cut 6 planks', desc: () => 'Board up two whole windows', why: () => '', make: () => { S.planks += 6; feed('planks', 6, 'planks'); popEl('planks'); } },
    { ic: 'planks', cost: 8, title: () => 'Brace the boards', desc: () => 'Every board back to full, 25% stronger', why: () => openings.some(o => o.boards.length) ? '' : 'No boards up yet', make: () => { openings.forEach(o => o.boards = o.boards.map(() => 70 * S.boardMul * 1.25)); feed('planks', 0, 'Boards braced'); } }
  ],
  med: [
    { ic: 'med', cost: 4, title: () => 'Bandage', desc: () => `Into your bag (${P.band || 0}/${bandMax()}). Press G to use: +${bandHeal()} health over time, stops bleeding`, why: () => (P.band || 0) < bandMax() ? '' : 'Your bag is full', make: () => { P.band = (P.band || 0) + 1; feed('med', 1, 'bandage'); popEl('bands'); } },
    { ic: 'med', cost: 10, title: () => 'Stitch up', desc: () => '+60 health and shakes off the slowdown', why: () => P.hp < S.maxHp ? '' : 'You are at full health', make: () => { const h = Math.min(60, S.maxHp - P.hp); P.hp += h; P.slow = 0; P.bleed = 0; feed('med', Math.round(h), 'health'); } },
    ...['hands', 'dress', 'tonic'].map(medUpgrade)
  ],
  radio: [
    { ic: 'supply', cost: 20, title: () => supplyT > 0 ? 'Drop on its way' : 'Call a supply drop', desc: () => supplyT > 0 ? `Lands in the yard in ${Math.ceil(supplyT)}s` : 'A crate of ammo, planks, scrap and bandages lands in the yard', why: () => supplyT > 0 ? 'Already called' : '', make: () => { supplyT = 9; feed('supply', 0, 'Supply drop called'); } }
  ]
};
// a medicine cabinet upgrade card: three levels, each dearer than the last (MED_UP lives in player/bandages.js, read lazily)
function medUpgrade(k) {
  const U = () => MED_UP[k], lv = () => medT(k), done = () => lv() >= U().max, num = n => ' ' + 'I'.repeat(n);
  return { ic: 'med', get cost() { return U().cost[Math.min(lv(), U().max - 1)]; }, title: () => U().name + (done() ? '' : num(lv() + 1)), desc: () => done() ? 'Fully upgraded' : U().desc(lv()), why: () => done() ? 'Fully upgraded' : '',
    make: () => { S.med[k] = lv() + 1; feed('med', 0, U().name + num(S.med[k])); } };
}
