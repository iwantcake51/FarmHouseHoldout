// The station panel: cards, costs and crafting.

let openSt = null, supplyT = 0, supplyFall = null;
// how near a station you are: to its spot in front of it, or for one with a footprint (the workbench) to the nearest
// edge of it, so you can use it from the side as well as the front
const STATION_REACH = 1.3, FOOT_REACH = 0.85;
function stationDist(s) {
  if (!s.foot) return Math.hypot(s.x - P.x, s.z - P.z);
  const [cx, cz, hw, hd] = s.foot, dx = Math.max(0, Math.abs(P.x - cx) - hw), dz = Math.max(0, Math.abs(P.z - cz) - hd);
  return Math.hypot(dx, dz) * STATION_REACH / FOOT_REACH;   // scaled so both kinds compare on the same footing
}
function nearestStation() { let best = null, bd = STATION_REACH; for (const s of STATIONS) { if (s.coop && !netLink()) continue; const d = stationDist(s); if (d < bd) { bd = d; best = s; } } return best; }   // (the strongbox is for co-op only)
// the panel unrolls from its orange rule as it opens and rolls back up into it as it closes (styles/stations.css);
// walking from one station to the next while it's open just changes what's on it
let stCloseT = 0, stOpenT = 0;
function openStation(s) {
  benchTipUsed(s.id);   // its label from the start of the run goes (ui/bench-tips.js)
  const el = $('station'), shut = el.hidden || el.classList.contains('closing');
  clearTimeout(stCloseT); el.classList.remove('closing');
  openSt = s; el.hidden = false; stStruct = ''; renderStation(); SFX.click();
  updateWeaponStats(); updateLoadout(); updateRackSide();   // docked in place before it's first laid out, so the bench doesn't slide over to make room
  if (shut) { el.classList.remove('opening'); void el.offsetWidth; el.classList.add('opening'); clearTimeout(stOpenT); stOpenT = setTimeout(() => el.classList.remove('opening'), 700); }
}
function closeStation() {
  if (!openSt) return; openSt = null;
  const el = $('station'); clearTimeout(stOpenT); el.classList.remove('opening'); el.classList.add('closing');
  clearTimeout(stCloseT); stCloseT = setTimeout(() => { el.classList.remove('closing'); if (!openSt) el.hidden = true; }, 210);
  updateWeaponStats(); updateLoadout(); updateRackSide();   // the stats and the loadout slide back in behind it as it rolls up
}
// the workbench's lower half is set apart from the ammo and the tune-up at the top: attachments (a can, a sight, a
// laser, a light...) teal, the gun's upgrades and mods blue
const ST_ICON_COL = { ammo: '#d4b25c', gear: '#f0bf4c', att: '#5ec2c4', upg: '#8aa6ea', planks: '#c08a52', metal: '#a9bccb', med: '#d0432c', supply: '#d8692c' };
const stIconCol = r => ST_ICON_COL[openSt.id === 'bench' && r.group && r.ic !== 'att' ? 'upg' : r.ic];
// a tiered upgrade's stars (r.tier(): how many steps you have, of how many): one per step, filled for those you have,
// outlined for those you don't, the one this card buys a brighter outline than the rest
const STAR = '<path d="M12 2.6l2.85 6.05 6.65.82-4.92 4.56 1.3 6.57L12 17.3l-5.88 3.3 1.3-6.57L2.5 9.47l6.65-.82z"/>';
const starRow = (n, of) => of > 1 ? `<span class="stars" title="${n} of ${of}">${Array.from({ length: of }, (_, k) => `<svg viewBox="0 0 24 24"${k < n ? ' class="on"' : k === n ? ' class="next"' : ''}>${STAR}</svg>`).join('')}</span>` : '';
// what a card does in numbers, green for better and red for worse, like the cards after a wave (upgrades/upgrade-info.js).
// They're worked out once per card until the weapon in your hands changes
const chipCache = new Map(); let chipKey = '';
function cardChips(r) {
  if (!r.fx) return '';
  const id = curId(), key = id + JSON.stringify([W8.gt[id], W8.mods[id], W8.modLv, W8.tune[id], W8.rounds[id], W8.att[id], W8.own[id], W8.ownAtt[id], S.magMul, S.reloadMul]);
  if (key !== chipKey) { chipKey = key; chipCache.clear(); }
  const ck = r.title();
  if (!chipCache.has(ck)) chipCache.set(ck, r.fx().filter(Boolean).map(f => `<i class="${chipCls(f)}">${CHIP_MARK[chipCls(f)]} ${f.t}</i>`).join(''));
  const h = chipCache.get(ck); return h ? `<span class="fx">${h}</span>` : '';
}
// the panel is rebuilt only when its list of cards changes; otherwise each card's text, cost and state are updated where
// it stands, so a card dimming or brightening eases over instead of jumping
let stStruct = '';
function renderStation() {
  if (!openSt) return;
  benchGuns();   // (the workbench's weapon tabs, hidden at the others)
  $('station').classList.toggle('isRack', openSt.id === 'rack');
  $('stQuick').hidden = openSt.id !== 'bench'; $('station').classList.toggle('withQuick', openSt.id === 'bench' || (openSt.id === 'saw' && !METAL.on));
  forgeBar();   // (the sawhorse's metalwork bench button, below)
  if (openSt.id === 'box') { renderGift(); return; }   // the strongbox: scrap for a teammate (net/teamwork.js)
  if (openSt.id === 'rack') { renderRack(); return; }   // the gun rack: unlocking weapons, your loadout docked beside it (stations/armory.js)
  setT('stTitle', openSt.name); setT('stScrap', String(S.scrap));
  // (the ammo has no card of its own at the workbench: it's the quick buttons, quickAmmo below)
  const all = RECIPES[openSt.id], ids = all.map((r, i) => i).filter(i => !all[i].quick), rows = ids.map(i => all[i]), struct = openSt.id + rows.map(r => (r.group || '') + '|' + r.title()).join('#');
  const txs = rows.map(r => `${r.for ? `<i class="for">${r.for()}</i>` : ''}<b>${r.title()}${r.tier ? starRow(...r.tier()) : ''}</b><em>${r.desc()}</em>${cardChips(r)}`);
  let btns = $('stRows').querySelectorAll('button');
  if (struct !== stStruct || btns.length !== rows.length) {
    stStruct = struct; let group = null, k = 0;   // k: each heading and card's place, for the cards rising in one after another as it opens
    // a heading above the first card of each group (everything for the weapon in your hands)
    $('stRows').innerHTML = rows.map((r, i) => {
      const head = r.group && r.group !== group ? `<div class="stGroup" style="--k:${Math.min(8, k++)}">${r.group}</div>` : ''; group = r.group || null;
      return head + `<button type="button" data-i="${ids[i]}" style="--ic:${stIconCol(r)};--k:${Math.min(8, k++)}">
      <span class="ic"><svg viewBox="${GI_VB}">${FEED_ICON[r.ic] || FEED_ICON.gear}</svg></span>
      <span class="tx"></span>
      <span class="ft"><span class="cost"><svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg><b></b></span><span class="st"></span></span>
    </button>`;
    }).join('');
    btns = $('stRows').querySelectorAll('button');
  }
  // ready, or not (short of scrap, or none to be had right now: a full bag, a full stack)
  rows.forEach((r, i) => {
    const b = btns[i]; if (!b) return;
    if (b._tx !== txs[i]) { b._tx = txs[i]; b.querySelector('.tx').innerHTML = txs[i]; }
    if (b._cost !== r.cost) { b._cost = r.cost; b.querySelector('.cost b').textContent = r.cost; }
    const why = r.why(), short = S.scrap < r.cost, ok = !why && !short, full = !!(r.full && r.full()), status = why ? why : short ? `Need ${r.cost - S.scrap} more scrap` : 'Ready', k = (ok ? 1 : why ? 2 : 3) + status + full;
    if (b._st === k) return; b._st = k;
    b.classList.toggle('ok', ok); b.classList.toggle('no', !ok); b.classList.toggle('full', full);
    if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
    b.querySelector('.cost').classList.toggle('short', short);
    const st = b.querySelector('.ft .st'); st.textContent = status; st.classList.toggle('bad', !ok);
  });
  quickAmmo(all);
  { const n = rows.length; setT('stNote', `Click a card · ${openSt.id === 'bench' ? `Tab switches weapon · I to ${wsBench ? 'hide' : 'show'} the stats · ` : ''}E to step away`); $('station').classList.toggle('wide', n > 6); }   // a long list (the bench with attachments) goes three across
}
// ---- the workbench's weapon tabs: one for each weapon you carry, in key order, the pill under the one in your hands.
// Picking one draws it, and the bench's cards (and the stats beside it) change over to it, so you can upgrade each
// without stepping away; Tab and Shift+Tab step through them
let bgKey = '', bgSwapT = 0;
function benchGuns() {
  const el = $('stGuns'), on = openSt && openSt.id === 'bench', st = $('station');
  st.classList.toggle('withGuns', !!on); if (el.hidden === !!on) el.hidden = !on;
  if (!on) { bgKey = ''; return; }
  const have = SLOTS.filter(s => W8.slot[s]), key = have.map(s => W8.slot[s]).join(',');
  if (key !== bgKey) {
    bgKey = key; el.style.setProperty('--n', have.length); el.style.removeProperty('--i');
    el.innerHTML = '<i class="sgPill"></i>' + have.map(s => { const D = WEAP[W8.slot[s]]; return `<button type="button" role="tab" data-slot="${s}"><span>${SLOT_NAME[s]}</span><b>${D.short || D.name}</b></button>`; }).join('');
  }
  const i = have.indexOf(W8.cur);
  if (el.style.getPropertyValue('--i') !== String(i)) { el.style.setProperty('--i', i); el.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.slot === W8.cur)); }
}
function benchGun(s) {
  if (!openSt || openSt.id !== 'bench' || !W8.slot[s] || W8.cur === s) return;
  equip(s); renderStation();
  // the new weapon's cards rise in one after another (the class is taken off again after, as the rack's are)
  const r = $('stRows'); r.scrollTop = 0; r.classList.remove('swap'); void r.offsetWidth; r.classList.add('swap'); clearTimeout(bgSwapT); bgSwapT = setTimeout(() => r.classList.remove('swap'), 700);
}
function benchGunStep(d) { const have = SLOTS.filter(s => W8.slot[s]); if (have.length > 1) benchGun(have[(have.indexOf(W8.cur) + d + have.length) % have.length]); }
$('stGuns').addEventListener('click', e => { const b = e.target.closest('button[data-slot]'); if (b) benchGun(b.dataset.slot); });
// at the workbench, ammo is always a click away along the bottom, wherever you've scrolled the cards to: for the gun in
// your hands, or a load for every gun you carry, each showing what it gives and its price, and lit when you can buy it
// (the bench's ammo recipes, recipes.js: quick)
function quickAmmo(rows) {
  const el = $('stQuick'), on = openSt.id === 'bench'; el.hidden = !on; if (!on) return;
  if (!el.firstElementChild) el.innerHTML = ['hand', 'all'].map(q => `<button type="button" data-q="${q}"><svg viewBox="${GI_VB}">${FEED_ICON.ammo}</svg><span><b></b><em></em></span><span class="cost"><svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg><b></b></span></button>`).join('');
  for (const b of el.children) {
    const i = rows.findIndex(r => r.quick === b.dataset.q), r = rows[i]; if (!r) continue;
    const t = b.dataset.q === 'hand' ? (gunAmmo() ? 'Ammo: ' + W(curId()).short : 'Ammo') : 'Ammo for all', d = r.why() || (b.dataset.q === 'hand' ? (gunAmmo() ? `+${gunBatch(curId())} ${AMMO_NAME[gunAmmo()]}` : '') : allAmmo().map(([a, n]) => `+${n}`).join(' · '));
    const ok = !r.why() && S.scrap >= r.cost, k = t + d + r.cost + ok;
    if (b._k === k) continue; b._k = k; b.dataset.i = i;
    b.querySelector('span b').textContent = t; b.querySelector('em').textContent = d; b.querySelector('.cost b').textContent = r.cost;
    b.classList.toggle('ok', ok); b.querySelector('.cost').classList.toggle('short', S.scrap < r.cost);
  }
}
// ---- the sawhorse's way up to the metalwork bench (barricades/metal-bars.js): one button pinned along the bottom, as
// the workbench's ammo is, saying what it takes: the boards braced all the way (BRACE.max) and METAL_COST scrap. Grey
// with what's still missing ticked off as you get it, it eases into colour with a pop once you can, and a click builds it
const FG_TICK = '<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>', FG_LOCK = '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>';
let fgReady = null;
function forgeBar() {
  const el = $('stForge'), on = !!openSt && openSt.id === 'saw' && !METAL.on;
  if (el.hidden === on) el.hidden = !on;
  if (!on) { fgReady = null; el.classList.remove('ready', 'pop'); return; }
  if (!el.firstElementChild) el.innerHTML = `<button type="button"><span class="fgIc"><svg viewBox="${GI_VB}">${GI.metal}</svg></span>
    <span class="fgTx"><b>Metalwork bench</b><em>Steel grates instead of boards</em><span class="fgReq"><i class="rq" data-rq="brace"></i><i class="rq" data-rq="scrap"></i></span></span>
    <span class="fgGo"><span class="cost"><svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg><b>${METAL_COST}</b></span><small></small></span></button>`;
  const lv = Math.min(braceLv(), BRACE.max), br = lv >= BRACE.max, sc = S.scrap >= METAL_COST, ok = br && sc, k = lv + '|' + S.scrap;
  if (el._k !== k) {
    el._k = k;
    const rb = el.querySelector('[data-rq="brace"]'), rs = el.querySelector('[data-rq="scrap"]');
    rb.classList.toggle('met', br); rb.innerHTML = `${br ? FG_TICK : FG_LOCK}Brace the boards V<span class="pips">${Array.from({ length: BRACE.max }, (_, q) => `<i${q < lv ? ' class="on"' : ''}></i>`).join('')}</span>`;
    rs.classList.toggle('met', sc); rs.innerHTML = `${sc ? FG_TICK : FG_LOCK}${METAL_COST} scrap${sc ? '' : ` · ${METAL_COST - S.scrap} more`}`;
    el.querySelector('.fgGo small').textContent = ok ? 'Upgrade' : 'Locked';
    el.querySelector('.cost').classList.toggle('short', !sc);
    el.querySelector('button').setAttribute('aria-disabled', ok ? 'false' : 'true');
  }
  if (ok !== fgReady) { const was = fgReady; fgReady = ok; el.classList.toggle('ready', ok); if (ok && was !== true) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
}
$('stForge').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !openSt || openSt.id !== 'saw' || METAL.on) return;
  if (braceLv() < BRACE.max || S.scrap < METAL_COST) { SFX.click(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
  S.scrap -= METAL_COST; popEl('scrap'); forgeMetal(); SFX.craft(); renderStation();
});
$('stQuick').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b && openSt && openSt.id === 'bench') { craft(+b.dataset.i); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } });
$('stRows').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (openSt && openSt.id === 'box') giftClick(b); else if (openSt && openSt.id === 'rack') rackClick(b); else craft(+b.dataset.i); });
function craft(i) {
  if (!openSt) return;
  const r = RECIPES[openSt.id][i]; if (!r) return;
  if (r.why() || S.scrap < r.cost) { SFX.click(); const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } return; }
  S.scrap -= r.cost; popEl('scrap'); r.make(); SFX.craft(); renderStation();
  const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.add('made'); setTimeout(() => b.classList.remove('made'), 260); }
}
// the wheel eases the cards along instead of jumping a notch at a time (core/dom.js)
smoothWheel($('stRows'));
