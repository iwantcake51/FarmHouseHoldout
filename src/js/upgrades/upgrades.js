// The upgrade card pool: body, gun tiers, new weapons and mods.

const RAR = { c: 'Common', u: 'Uncommon', r: 'Rare', e: 'Epic', l: 'Legendary' };
const ammoTypes = () => [...new Set(SLOTS.map(s => W8.slot[s]).filter(id => id && WEAP[id].ammo).map(id => WEAP[id].ammo))];
const UPG = [
  { r: 'c', tag: 'Body', name: 'Quick hands', text: 'Reload 25% faster.', can: () => S.reloadMul > 0.45, ap: () => S.reloadMul *= 0.75 },
  { r: 'c', tag: 'Tools', name: 'Wood pile', text: '+7 planks.', ap: () => S.planks += 7 },
  { r: 'c', tag: 'Tools', name: 'Scrounger', text: '+10 scrap right now.', ap: () => S.scrap += 10 },
  { r: 'c', tag: 'Med', name: 'Field dressing', text: 'Patch yourself up to full health.', can: () => P.hp < S.maxHp * 0.75, ap: () => P.hp = S.maxHp },
  { r: 'c', tag: 'Ammo', name: 'Ammo can', text: 'A full can for every gun you carry.', can: () => ammoTypes().length > 0, ap: () => ammoTypes().forEach(a => W8.reserve[a] += AMMO_CAN[a]) },
  { r: 'c', tag: 'Melee', name: 'Strong arms', text: 'Melee hits 40% harder.', ap: () => S.meleeMul *= 1.4 },
  { r: 'c', tag: 'Body', name: 'Light feet', text: 'Climb through windows twice as fast.', can: () => S.vaultMul > 0.5, ap: () => S.vaultMul = 0.5 },
  { r: 'u', tag: 'Ammo', name: 'Through and through', text: 'Bullets pass through one more zombie.', vis: 'Longer barrels', can: () => S.pierce < 3, ap: () => S.pierce++ },
  { r: 'u', tag: 'Luck', name: 'Scavenger', text: 'Zombies drop supplies 50% more often.', can: () => S.dropMul < 3, ap: () => S.dropMul *= 1.5 },
  { r: 'u', tag: 'Luck', name: 'Hoarder', text: 'Every scrap pickup is worth double.', can: () => S.scrapMul < 2, ap: () => S.scrapMul = 2 },
  { r: 'u', tag: 'Body', name: 'Thick soles', text: 'Getting hit slows you down 40% less.', can: () => S.slowRes < 0.7, ap: () => S.slowRes += 0.4 },
  { r: 'u', tag: 'Body', name: 'Adrenaline', text: 'Every kill gives you a burst of speed.', can: () => !S.adrenaline, ap: () => S.adrenaline = true },
  { r: 'u', tag: 'Attachment', name: 'Bayonet', text: 'Shoving (Space) with a long gun or automatic stabs for 45 damage.', vis: 'A blade under the long guns', can: () => !S.att.bayonet, ap: () => S.att.bayonet = true },
  { r: 'u', tag: 'Attachment', name: 'Shoulder stock', text: 'Less spread and kick on sidearms.', vis: 'A wooden stock on your sidearm', can: () => !S.att.stock, ap: () => S.att.stock = true },
  { r: 'r', tag: 'Body', name: 'Second wind', text: 'Once per wave, dropping below 25% health heals you 50.', can: () => !S.secondWind, ap: () => S.secondWind = true },
  { r: 'r', tag: 'Med', name: 'Painkillers', text: 'Slowly regenerate 1 health a second.', can: () => S.regen < 3, ap: () => S.regen += 1 },
  { r: 'e', tag: 'Gun', name: 'Executioner', text: 'Headshots deal three times damage instead of double.', can: () => S.headMul < 3, ap: () => S.headMul = 3.2 },
  { r: 'e', tag: 'Gore', name: 'Butcher', text: 'Limbs and heads come off twice as easily.', can: () => S.severMul < 2, ap: () => S.severMul = 2 },
  { r: 'e', tag: 'Gun', name: 'Gunsmith', text: 'One of your guns gets its ammo, trigger and magazine upgrades all raised a tier.', vis: 'Changes all three at once', can: () => gunsHeld().some(g => ['ammo', 'trigger', 'mag'].some(k => tierFits(k, g))), ap: () => { const id = pick(gunsHeld().filter(g => ['ammo', 'trigger', 'mag'].some(k => tierFits(k, g)))); W8.gt[id] = W8.gt[id] || {}; ['ammo', 'trigger', 'mag'].forEach(k => { if (tierFits(k, id)) W8.gt[id][k] = (W8.gt[id][k] || 0) + 1; }); recomputeEff(); feed('gear', 0, WEAP[id].name + ' gunsmithed'); } },
  { r: 'l', tag: 'Attachment', name: 'Incendiary rounds', text: 'Every bullet sets zombies on fire for 3 seconds.', vis: 'A hot orange band on every gun', can: () => !S.att.fire, ap: () => S.att.fire = true },
  { r: 'l', tag: 'Body', name: 'Stubborn', text: '+50 max health and you barely slow down when hit.', can: () => S.slowRes < 0.85, ap: () => { S.maxHp += 50; P.hp += 50; S.slowRes = Math.max(S.slowRes, 0.85); } },
  { r: 'l', tag: 'Mind', name: 'Bullet time', text: 'Kills sometimes slow the world for a moment.', can: () => !S.bulletTime, ap: () => S.bulletTime = true },
  { r: 'l', tag: 'Mind', name: 'Last stand', text: 'Below 30% health, everything you do hits 80% harder.', can: () => !S.lastStand, ap: () => S.lastStand = true }
];
const gunsHeld = () => SLOTS.filter(sl => sl !== 'melee' && W8.slot[sl]).map(sl => W8.slot[sl]);
function tierFits(k, id) {
  const D = WEAP[id], n = gunTier(id, k);
  if (n >= TIERS[k].t.length) return false;
  if (k === 'choke') return D.ammo === 'shells' && !gunTier(id, 'supp');
  if (k === 'supp') return !(D.ammo === 'shells' && gunTier(id, 'choke'));
  if (k === 'sight' && n === 2) return D.slot !== 'side';
  return true;
}
for (const k in TIERS) {
  const L = TIERS[k];
  if (GUN_TIERS.has(k)) {
    const u = { tierOf: k, w: 1.4, target: null,
      get r() { const id = u.target || gunsHeld().find(g => tierFits(k, g)); return L.t[Math.min(id ? gunTier(id, k) : 0, L.t.length - 1)].r; },
      can: () => gunsHeld().some(g => tierFits(k, g)),
      card: () => {
        u.target = pick(gunsHeld().filter(g => tierFits(k, g)));
        const id = u.target, n = gunTier(id, k), st = L.t[n];
        return { r: st.r, tag: `${WEAP[id].short} only · Tier ${n + 1} of ${L.t.length}`, name: st.name, text: `For your ${WEAP[id].name.toLowerCase()}. ${st.text}`, vis: n ? 'Upgrades its ' + L.t[n - 1].name.toLowerCase() + (st.vis ? '. ' + st.vis : '') : st.vis };
      },
      ap: () => { const id = u.target; if (!id) return; W8.gt[id] = W8.gt[id] || {}; W8.gt[id][k] = (W8.gt[id][k] || 0) + 1; recomputeEff(); } };
    UPG.push(u);
  } else UPG.push({ tierOf: k, get r() { return L.t[Math.min(T(k), L.t.length - 1)].r; }, w: 1.4,
    can: () => T(k) < L.t.length && (!L.can || L.can()),
    card: () => { const n = T(k), st = L.t[n]; return { r: st.r, tag: `${L.tag} · Tier ${n + 1} of ${L.t.length}`, name: st.name, text: st.text, vis: n ? 'Upgrades your ' + L.t[n - 1].name.toLowerCase() + (st.vis ? '. ' + st.vis : '') : st.vis }; },
    ap: () => { L.t[T(k)].ap(); S.tier[k]++; } });
}
function statLine(id) { const D = WEAP[id]; if (D.melee) return `DMG ${Math.round(D.dmg)} · ${(1 / D.rate).toFixed(1)} swings/s`; return `DMG ${Math.round(D.dmg)}${(D.pellets || 1) > 1 ? '×' + D.pellets : ''} · ${(1 / D.rate).toFixed(1)}/s · ${D.mag} rds`; }
function giveWeapon(id) {
  const D = WEAP[id], s = D.slot;
  W8.slot[s] = id; recomputeEff(); W8.mag[id] = magSize(id); if (D.ammo) W8.reserve[D.ammo] += D.start || 0;
  W8.cur = null; equip(s);
}
for (const id in WEAP) {
  const D = WEAP[id]; if (!D.rar) continue;
  UPG.push({ r: D.rar, tag: 'Weapon · ' + SLOT_NAME[D.slot], name: D.name, text: D.desc, stats: () => statLine(id), weaponOf: id,
    vis: () => W8.slot[D.slot] ? 'Replaces your ' + WEAP[W8.slot[D.slot]].name : 'Goes in slot ' + (SLOTS.indexOf(D.slot) + 1), w: 1.6, can: () => !held(id), ap: () => giveWeapon(id) });
}
for (const mid in MODS) {
  const m = MODS[mid];
  UPG.push({ r: m.r, tag: WEAP[m.w].short + ' only', name: m.name, text: m.text, vis: m.vis, w: 2.4, can: () => held(m.w) && !hasMod(mid) && (!m.need || hasMod(m.need)), ap: () => { (W8.mods[m.w] = W8.mods[m.w] || []).push(mid); } });
}
