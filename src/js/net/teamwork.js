// Co-op teamwork with scrap. What a kill drops is the killer's alone: it lies on their farm, not their teammates', so
// nobody races anyone else for it (netAct in net/sync.js keeps scrap out of the drops it sends). Hurting a zombie a
// teammate then finishes is an assist, paid straight into your scrap (teamAssist). At the strongbox in the house you
// pick a teammate and an amount and send them scrap (renderGift). And a wave cleared with teammates still on their feet
// pays a team bonus (teamBonus).

// an assist: at least ASSIST_MIN of the zombie's health done by you, within the last ASSIST_T seconds, pays
// ASSIST_SCRAP (a brute twice that); the team bonus is TEAM_BONUS for each teammate still standing at the clear; the
// strongbox's quick amounts (GIFT_QUICK, then half and all of yours)
const ASSIST_MIN = 0.2, ASSIST_T = 8, ASSIST_SCRAP = 1, TEAM_BONUS = 2, GIFT_QUICK = [5, 10, 25];

// ---- the strongbox (stations/stations.js): who to, how much, and Give. Its panel is the station panel's own
// (stations/station-ui.js), built once and then updated where it stands, so picks and amounts ease rather than jump
const GIFT = { to: '', amt: 5, struct: '' };
const giftTeam = () => [...NET.peers.values()].sort((a, b) => a.idx - b.idx);
function renderGift() {
  setT('stTitle', 'Strongbox'); setT('stScrap', String(S.scrap));
  const ps = giftTeam(), have = S.scrap | 0;
  if (!ps.some(p => p.id === GIFT.to)) GIFT.to = ps[0] ? ps[0].id : '';
  GIFT.amt = have > 0 ? clamp(GIFT.amt | 0, 1, have) : 0;
  const rows = $('stRows'), struct = 'gift:' + ps.map(p => p.id).join(',');
  if (stStruct !== struct) {
    stStruct = struct; $('station').classList.remove('wide');
    const ic = `<svg viewBox="${GI_VB}">${FEED_ICON.scrap}</svg>`;
    rows.innerHTML = !ps.length ? '<div class="gift" style="--k:0"><p class="gfNone">No one else is here to give scrap to.</p></div>' : `<div class="gift">
      <div class="stGroup" style="--k:0">Give to</div>
      <div class="gfWho">${ps.map((p, i) => `<button type="button" class="gfP" data-to="${p.id}" style="--pc:${NET_COL[p.idx] || '#888'};--k:${i + 1}"><i class="dot"></i><b></b><span class="gfHas">${ic}<em></em></span><kbd>${i + 1}</kbd></button>`).join('')}</div>
      <div class="stGroup" style="--k:4">How much</div>
      <div class="gfAmt" style="--k:5"><button type="button" class="gfStep" data-d="-1" aria-label="One less">−</button><div class="gfNum"><span class="big" id="gfAmt">0</span><small>scrap</small></div><button type="button" class="gfStep" data-d="1" aria-label="One more">+</button></div>
      <div class="gfQuick" style="--k:6">${GIFT_QUICK.map(q => `<button type="button" data-q="${q}">${q}</button>`).join('')}<button type="button" data-q="half">Half</button><button type="button" data-q="all">All</button></div>
      <button type="button" class="gfGive" style="--k:7">${ic}<span></span></button>
    </div>`;
  }
  if (!ps.length) { setT('stNote', 'E to step away'); return; }
  // who: each teammate's card, their own scrap on it, the one picked lit in their colour
  rows.querySelectorAll('.gfP').forEach(b => {
    const p = NET.peers.get(b.dataset.to); if (!p) return;
    b.querySelector('b').textContent = p.name; b.querySelector('.gfHas em').textContent = (p.stats || [])[1] ?? 0;
    b.classList.toggle('on', p.id === GIFT.to); b.classList.toggle('down', !!p.dead);
  });
  // how much: the amount rolls to its new value; a quick pick that matches it is lit
  rollText($('gfAmt'), String(GIFT.amt));
  rows.querySelectorAll('.gfStep').forEach(b => { b.disabled = b.dataset.d < 0 ? GIFT.amt <= 1 : GIFT.amt >= have; });
  rows.querySelectorAll('.gfQuick button').forEach(b => { const v = giftQuick(b.dataset.q); b.disabled = v < 1; b.classList.toggle('on', v >= 1 && v === GIFT.amt); });
  const to = NET.peers.get(GIFT.to), give = rows.querySelector('.gfGive');
  give.disabled = !to || GIFT.amt < 1;
  give.querySelector('span').textContent = have < 1 ? 'No scrap to give' : `Give ${GIFT.amt} scrap to ${to ? to.name : '…'}`;
  setT('stNote', `${ps.length > 1 ? `Press 1–${ps.length} to pick who · ` : ''}Enter to give · E to step away`);
}
const giftQuick = q => { const have = S.scrap | 0; return q === 'all' ? have : q === 'half' ? Math.ceil(have / 2) : Math.min(+q, have); };
function giftPick(i) { const p = giftTeam()[i]; if (!p) return; GIFT.to = p.id; SFX.click(); renderGift(); }
function giftClick(b) {
  if (b.disabled) return;
  if (b.classList.contains('gfP')) { GIFT.to = b.dataset.to; SFX.click(); }
  else if (b.dataset.d) GIFT.amt += +b.dataset.d;
  else if (b.dataset.q) GIFT.amt = giftQuick(b.dataset.q);
  else if (b.classList.contains('gfGive')) { giftSend(); return; }
  renderGift();
}
// handed over: off your count, to theirs, the bits flying from your scrap on the panel into their card
function giftSend() {
  const to = NET.peers.get(GIFT.to), n = Math.min(GIFT.amt | 0, S.scrap | 0), give = $('stRows').querySelector('.gfGive');
  if (!to || n < 1) { if (give) { give.classList.remove('shake'); void give.offsetWidth; give.classList.add('shake'); } SFX.click(); return; }
  S.scrap -= n; popEl('scrap'); SFX.scrap();
  netTo(to.id, 'gift', { s: n });
  feed('scrap', n, 'given to ' + to.name);
  const card = $('stRows').querySelector(`.gfP[data-to="${to.id}"]`);
  if (card) scrapFly($('stScrap'), n, card);
  if (to.stats) to.stats[1] = (to.stats[1] | 0) + n;   // (their count on the card, till their next pose says it)
  renderGift();
}
NET_ON.gift = m => {
  if (state === 'title' || !(m.s > 0)) return;
  const p = NET.peers.get(m.f), n = Math.min(9999, m.s | 0), who = p ? p.name : 'A teammate';
  S.scrap += n; popEl('scrap'); SFX.scrap();
  feed('scrap', n, 'from ' + who); floatText(P.x, P.z, '+' + n, '#d4b25c');
  toast(`${who} gave you ${n} scrap`, { kind: 'info', icon: 'scrap', sub: 'From the strongbox' });
};
// your share of a zombie (zombies/damage.js counts it as you hurt it); a teammate's kill of one you'd worked on pays you
function teamAssist(z) {
  if (!netLink() || !(z.myDmg >= z.maxHp * ASSIST_MIN) || run.time - (z.myAt || -99) > ASSIST_T) return;
  const n = ASSIST_SCRAP * (z.type === 'brute' ? 2 : 1);
  S.scrap += n; popEl('scrap'); feed('scrap', n, 'assist'); floatText(z.x, z.z, '+' + n + ' assist', '#d4b25c');
}
// the wave's cleared: for every teammate still standing alongside you, a bit of scrap (nothing if you're down)
function teamBonus() {
  if (!netLink() || P.dead) return;
  let up = 0; for (const p of NET.peers.values()) if (!p.dead) up++;
  if (!up) return;
  const n = TEAM_BONUS * up; S.scrap += n; popEl('scrap'); feed('scrap', n, 'team bonus');
}
