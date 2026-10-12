// The station panel: cards, costs and crafting.

let openSt = null, supplyT = 0, supplyFall = null;
function nearestStation() { let best = null, bd = 1.3; for (const s of STATIONS) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best; }
function openStation(s) { openSt = s; $('station').hidden = false; cache.hstRows = null; renderStation(); SFX.click(); }
function closeStation() { if (!openSt) return; openSt = null; $('station').hidden = true; }
const ST_ICON_COL = { ammo: '#d4b25c', gear: '#f0bf4c', planks: '#c08a52', med: '#d0432c', supply: '#d8692c' };
function renderStation() {
  if (!openSt) return;
  setT('stTitle', openSt.name); setT('stScrap', String(S.scrap));
  const tiles = RECIPES[openSt.id].map((r, i) => {
    const why = r.why(), short = S.scrap < r.cost, ok = !why && !short;
    const status = why ? why : short ? `Need ${r.cost - S.scrap} more scrap` : 'Ready';
    return `<button type="button" data-i="${i}" class="${ok ? 'ok' : 'no'}" ${ok ? '' : 'aria-disabled="true"'} style="--ic:${ST_ICON_COL[r.ic]}">
      <span class="ic"><svg viewBox="0 0 24 24">${FEED_ICON[r.ic]}</svg></span>
      <span class="tx"><b>${r.title()}</b><em>${r.desc()}</em></span>
      <span class="ft"><kbd>${i + 1}</kbd><span class="cost${short ? ' short' : ''}"><svg viewBox="0 0 24 24">${FEED_ICON.scrap}</svg>${r.cost}</span><span class="st${ok ? '' : ' bad'}">${status}</span></span>
    </button>`;
  }).join('');
  setH('stRows', tiles);
}
$('stRows').addEventListener('click', e => { const b = e.target.closest('button'); if (b) craft(+b.dataset.i); });
function craft(i) {
  if (!openSt) return; const r = RECIPES[openSt.id][i]; if (!r) return;
  if (r.why() || S.scrap < r.cost) { SFX.click(); const b = $('stRows').children[i]; if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); } return; }
  S.scrap -= r.cost; popEl('scrap'); r.make(); SFX.board(); cache.hstRows = null; renderStation();
  const b = $('stRows').children[i]; if (b) { b.classList.add('made'); setTimeout(() => b.classList.remove('made'), 260); }
}
