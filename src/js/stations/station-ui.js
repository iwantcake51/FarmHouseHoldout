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
function nearestStation() { let best = null, bd = STATION_REACH; for (const s of STATIONS) { const d = stationDist(s); if (d < bd) { bd = d; best = s; } } return best; }
function openStation(s) { openSt = s; $('station').hidden = false; stStruct = ''; renderStation(); SFX.click(); }
function closeStation() { if (!openSt) return; openSt = null; $('station').hidden = true; }
const ST_ICON_COL = { ammo: '#d4b25c', gear: '#f0bf4c', planks: '#c08a52', med: '#d0432c', supply: '#d8692c' };
// what a card does in numbers, green for better and red for worse, like the cards after a wave (upgrades/upgrade-info.js).
// They're worked out once per card until the weapon in your hands changes
const chipCache = new Map(); let chipKey = '';
function cardChips(r) {
  if (!r.fx) return '';
  const id = curId(), key = id + JSON.stringify([W8.gt[id], W8.mods[id], W8.modLv, W8.tune[id], S.att, S.magMul, S.reloadMul]);
  if (key !== chipKey) { chipKey = key; chipCache.clear(); }
  const ck = r.title();
  if (!chipCache.has(ck)) chipCache.set(ck, r.fx().filter(Boolean).map(f => `<i class="${f.good ? 'up' : 'down'}">${f.good ? '▲' : '▼'} ${f.t}</i>`).join(''));
  const h = chipCache.get(ck); return h ? `<span class="fx">${h}</span>` : '';
}
// the panel is rebuilt only when its list of cards changes; otherwise each card's text, cost and state are updated where
// it stands, so a card dimming or brightening eases over instead of jumping
let stStruct = '';
function renderStation() {
  if (!openSt) return;
  setT('stTitle', openSt.name); setT('stScrap', String(S.scrap));
  const rows = RECIPES[openSt.id], struct = openSt.id + rows.map(r => (r.group || '') + '|' + r.title()).join('#');
  const txs = rows.map(r => `${r.for ? `<i class="for">${r.for()}</i>` : ''}<b>${r.title()}</b><em>${r.desc()}</em>${cardChips(r)}`);
  let btns = $('stRows').querySelectorAll('button');
  if (struct !== stStruct || btns.length !== rows.length) {
    stStruct = struct; let group = null;
    // a heading above the first card of each group (everything for the weapon in your hands)
    $('stRows').innerHTML = rows.map((r, i) => {
      const head = r.group && r.group !== group ? `<div class="stGroup">${r.group}</div>` : ''; group = r.group || null;
      return head + `<button type="button" data-i="${i}" style="--ic:${ST_ICON_COL[r.ic]}">
      <span class="ic"><svg viewBox="${GI_VB}">${FEED_ICON[r.ic]}</svg></span>
      <span class="tx"></span>
      <span class="ft">${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}<span class="cost"><svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg><b></b></span><span class="st"></span></span>
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
  { const n = rows.length; setT('stNote', `Press 1–${n >= 10 ? 0 : n} or click a card · E to step away`); $('station').classList.toggle('wide', n > 6); }   // a long list (the bench with attachments) goes three across
}
$('stRows').addEventListener('click', e => { const b = e.target.closest('button'); if (b) craft(+b.dataset.i); });
function craft(i) {
  if (!openSt) return; const r = RECIPES[openSt.id][i]; if (!r) return;
  if (r.why() || S.scrap < r.cost) { SFX.click(); const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } return; }
  S.scrap -= r.cost; popEl('scrap'); r.make(); SFX.board(); renderStation();
  const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.add('made'); setTimeout(() => b.classList.remove('made'), 260); }
}
