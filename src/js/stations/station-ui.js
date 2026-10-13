// The station panel: cards, costs and crafting.

let openSt = null, supplyT = 0, supplyFall = null;
function nearestStation() { let best = null, bd = 1.3; for (const s of STATIONS) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best; }
function openStation(s) { openSt = s; $('station').hidden = false; cache.hstRows = null; renderStation(); SFX.click(); }
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
function renderStation() {
  if (!openSt) return;
  setT('stTitle', openSt.name); setT('stScrap', String(S.scrap));
  let group = null;
  const tiles = RECIPES[openSt.id].map((r, i) => {
    // a heading above the first card of each group (the bench's attachments for the gun in your hands)
    const head = r.group && r.group !== group ? `<div class="stGroup">${r.group}</div>` : ''; group = r.group || null;
    const why = r.why(), short = S.scrap < r.cost, ok = !why && !short;
    const status = why ? why : short ? `Need ${r.cost - S.scrap} more scrap` : 'Ready';
    return head + `<button type="button" data-i="${i}" class="${ok ? 'ok' : 'no'}" ${ok ? '' : 'aria-disabled="true"'} style="--ic:${ST_ICON_COL[r.ic]}">
      <span class="ic"><svg viewBox="${GI_VB}">${FEED_ICON[r.ic]}</svg></span>
      <span class="tx">${r.for ? `<i class="for">${r.for()}</i>` : ''}<b>${r.title()}</b><em>${r.desc()}</em>${cardChips(r)}</span>
      <span class="ft">${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}<span class="cost${short ? ' short' : ''}"><svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg>${r.cost}</span><span class="st${ok ? '' : ' bad'}">${status}</span></span>
    </button>`;
  }).join('');
  setH('stRows', tiles);
  { const n = RECIPES[openSt.id].length; setT('stNote', `Press 1–${n >= 10 ? 0 : n} or click a card · E to step away`); $('station').classList.toggle('wide', n > 6); }   // a long list (the bench with attachments) goes three across
}
$('stRows').addEventListener('click', e => { const b = e.target.closest('button'); if (b) craft(+b.dataset.i); });
function craft(i) {
  if (!openSt) return; const r = RECIPES[openSt.id][i]; if (!r) return;
  if (r.why() || S.scrap < r.cost) { SFX.click(); const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } return; }
  S.scrap -= r.cost; popEl('scrap'); r.make(); SFX.board(); cache.hstRows = null; renderStation();
  const b = $('stRows').querySelector(`button[data-i="${i}"]`); if (b) { b.classList.add('made'); setTimeout(() => b.classList.remove('made'), 260); }
}
