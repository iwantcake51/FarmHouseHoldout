// Co-op teamwork with scrap. What a kill drops is the killer's alone: it lies on their farm, not their teammates', so
// nobody races anyone else for it (netAct in net/sync.js sends none of it; an assist gets its own ammo box). Hurting a zombie a
// teammate then finishes is an assist, paid straight into your scrap (teamAssist). At the strongbox in the house you
// pick a teammate and an amount and send them scrap (renderGift). And a wave cleared with teammates still on their feet
// with all of you still on your feet pays everyone a team bonus (teamBonus).

// an assist: at least ASSIST_MIN of the zombie's health done by you, within the last ASSIST_T seconds, pays
// ASSIST_SCRAP (a brute twice that); the team bonus is TEAM_BONUS for each teammate, if nobody's down at the clear; the
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
      <div class="gfWho">${ps.map((p, i) => `<button type="button" class="gfP" data-to="${p.id}" style="--pc:${NET_COL[p.idx] || '#888'};--k:${i + 1}"><i class="dot"></i><b></b><span class="gfHas">${ic}<em></em></span></button>`).join('')}</div>
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
  setT('stNote', `${ps.length > 1 ? 'Click who gets it · ' : ''}Enter to give · ${keyOn('use')} to step away`);
}
const giftQuick = q => { const have = S.scrap | 0; return q === 'all' ? have : q === 'half' ? Math.ceil(have / 2) : Math.min(+q, have); };
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
  S.scrap -= n; popEl('scrap'); SFX.scrap(); runStat('sent', n);
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
  S.scrap += n; popEl('scrap'); SFX.scrap(); runStat('received', n);
  feed('scrap', n, 'from ' + who); floatText(P.x, P.z, '+' + n, '#d4b25c');
  toast(`${who} gave you ${n} scrap`, { kind: 'info', icon: 'scrap', sub: 'From the strongbox' });
};
// your share of a zombie (zombies/damage.js counts it as you hurt it); a teammate's kill of one you'd worked on pays you
function teamAssist(z) {
  if (!netLink() || !(z.myDmg >= z.maxHp * ASSIST_MIN) || run.time - (z.myAt || -99) > ASSIST_T) return;
  z.assist = true;   // (and if the kill dropped ammo, a box of your own: NET_ON.hit, net/sync.js)
  const n = ASSIST_SCRAP * (z.type === 'brute' ? 2 : 1);
  S.scrap += n; popEl('scrap'); feed('scrap', n, 'assist'); runStat('assists'); floatText(z.x, z.z, '+' + n + ' assist', '#d4b25c');
}
// the wave's cleared with every one of you still on your feet: a bit of scrap each (nothing if anyone went down)
function teamBonus() {
  if (!netLink() || P.dead || !NET.peers.size) return;
  for (const p of NET.peers.values()) if (p.dead) return;
  const n = TEAM_BONUS * NET.peers.size; S.scrap += n; popEl('scrap'); feed('scrap', n, 'nobody went down'); runStat('teamBonus', n);
}

// ---- sharing a gun you've put down (gunDrop, pickups/pickups.js). It's yours alone till you share it (H, standing at
// it): then your teammates see it on their farm where it lies and can pick it up for themselves, with everything that
// was on it (gunTakeLo). H again takes it back to just yours. Whoever picks it up, it's gone for everyone ('gtk')
function gunShare(p) {
  if (!netLink() || !p || p.kind !== 'gun' || !p.cargo.own) return;
  const c = p.cargo; c.shared = !c.shared; c.pc = NET_COL[NET.idx];
  if (c.shared) netSend('gsh', { g: c.gid, id: c.id, x: nr(p.x), z: nr(p.z), lo: c.lo, mag: c.mag, ak: c.ak, until: c.until, who: netName() });
  else netSend('gtk', { g: c.gid });
  const nm = WEAP[c.id].name.toLowerCase();
  feed('gear', 0, (c.shared ? 'Shared the ' : 'Stopped sharing the ') + nm);
  SFX.click();
}
// a shared gun on the ground shows it quietly (shareFx, called by updatePickups): its ring, glow and outline turn the
// colour of whoever shared it, and a small tag stands over it ("Shared" on yours, "Rosie's" on a teammate's) that says
// what to press only when you're close by (SHARE.near). SHARE: how high the tag stands, how quickly it all comes and goes
const SHARE = { lift: 0.8, fade: 6, near: 2.6 };
const shEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shareTags = new Map(), _shC = new THREE.Color(), _shB = new THREE.Color(), _shV = new V3();
function shareFx(p, dt) {
  const c = p.cargo, on = !!c.shared || c.own === false;
  p.shareK = (p.shareK || 0) + ((on ? 1 : 0) - (p.shareK || 0)) * Math.min(1, dt * SHARE.fade);
  if (!on && p.shareK < 0.003) p.shareK = 0;
  if (!p.shareK && !p.shareTinted) return;
  _shC.copy(p.col).lerp(_shB.set(c.pc || NET_COL[1]), p.shareK); p.shareTinted = p.shareK > 0;
  p.ringMat.color.copy(_shC); p.discMat.color.copy(_shC); p.glow.material.color.copy(_shC); p.om.color.copy(_shC); p.xr.rim.color.copy(_shC);
  let t = shareTags.get(p);
  if (!t && on) {
    const el = document.createElement('div'); el.className = 'shareTag hud'; el.style.setProperty('--pc', c.pc || NET_COL[1]);
    el.innerHTML = `<div class="stCard"><b>${c.own === false ? shEsc(c.who || 'Teammate') + "'s" : 'Shared'}</b><span class="stHint">${kbd(c.own === false ? 'use' : 'share')}${c.own === false ? 'take' : 'unshare'}</span></div><i class="stStem"></i><i class="stDot"></i>`;
    document.body.appendChild(el); shareTags.set(p, t = { el });
  }
  if (t) { t.el.classList.toggle('out', !on); t.el.classList.toggle('near', Math.hypot(p.x - P.x, p.z - P.z) < SHARE.near); }
}
// the labels over shared guns, kept over them on screen; a label goes once its gun's taken, gone, or no longer shared
function updateShareTags() {
  for (const [p, t] of shareTags) {
    if (!pickups.includes(p) || (!p.shareK && t.el.classList.contains('out'))) { t.el.remove(); shareTags.delete(p); continue; }
    const show = state === 'play' || state === 'paused';
    p.g.getWorldPosition(_shV); _shV.y += SHARE.lift; _shV.project(cam);
    const off = !show || _shV.z > 1 || Math.abs(_shV.x) > 1.1 || Math.abs(_shV.y) > 1.1;
    t.el.hidden = off; if (off) continue;
    t.el.style.transform = `translate(${((_shV.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - _shV.y) / 2 * innerHeight).toFixed(1)}px)`;
  }
}
// a shared gun's picked up (by you or anyone): gone from every farm it was on
function gunGone(p) { if (netLink() && (p.cargo.shared || !p.cargo.own)) netSend('gtk', { g: p.cargo.gid }); }
NET_ON.gsh = m => {
  if (state === 'title' || pickups.some(q => q.kind === 'gun' && q.cargo.gid === m.g)) return;
  const w = teamWeapon(m.lo || {}, m.id); foldStatic(w.g, w.moving);
  const pr = NET.peers.get(m.f) || {}, who = m.who || pr.name || 'A teammate';
  dropPickup(m.x, m.z, 'gun', 1, null, { id: m.id, model: layGun(w.g), mag: m.mag | 0, ak: m.ak || null, until: m.until, own: false, gid: m.g, lo: m.lo, who, pc: NET_COL[pr.idx] || NET_COL[1] });
  const nm = WEAP[m.id].name.toLowerCase();
  feed('gear', 0, who + ' shared a ' + nm);
};
NET_ON.gtk = m => { const k = pickups.findIndex(q => q.kind === 'gun' && q.cargo.gid === m.g); if (k >= 0) { scene.remove(pickups[k].g); pickups.splice(k, 1); } };   // (taken by a teammate, or no longer shared)
// what was on a teammate's gun, now on yours: its tiers, mods, attachments and rounds, owned as well as fitted
function gunTakeLo(id, lo) {
  W8.mods[id] = (lo.mods || []).slice(); if (W8.modOff) delete W8.modOff[id]; (lo.mods || []).forEach(m => { W8.modLv[m] = (lo.lv || {})[m] || 1; });
  W8.gt[id] = { ...(lo.gt || {}) }; W8.own[id] = Object.assign({}, W8.own[id], lo.gt || {});
  W8.att[id] = { ...(lo.att || {}) }; W8.ownAtt[id] = Object.assign({}, W8.ownAtt[id]); for (const k in lo.att || {}) W8.ownAtt[id][k] = true;
  if (lo.rnd) W8.rounds[id] = JSON.parse(JSON.stringify(lo.rnd));
}
