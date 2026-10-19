// Dealing, showing and picking upgrade cards, and the upgrade history.

let dealt = [], cardsArmed = false, armTimer = 0;
// every BONUS_EVERY waves (5, 10, 15...) a second hand follows the first: skills and perks only, no aid or weapons
const BONUS_EVERY = 5;
let bonusHand = false;
const bonusKind = u => ['Skill', 'Perk'].includes(findKind(u, u));
// (and only while there's a skill or perk left to give)
const bonusDue = () => run.wave > 0 && run.wave % BONUS_EVERY === 0 && UPG.some(u => (!u.can || u.can()) && bonusKind(u));
// or take none of them and SKIP_SCRAP scrap instead (from the first to the second, rolled with each hand)
const SKIP_SCRAP = [5, 10];
let skipScrap = 0;
// who a card is for, in plain words at the top of it: a weapon of yours, all your guns, or you
const FOR_TAG = { Gun: 'For all your guns', Ammo: 'For all your guns', Melee: 'For your melee weapons' };
function cardFor(u, c) {
  if (u.weaponOf) return 'A new weapon for your ' + SLOT_NAME[WEAP[u.weaponOf].slot].toLowerCase() + ' slot';
  if (u.modOf) return 'For your ' + gunCall(MODS[u.modOf].w);
  if (u.target) return 'For your ' + gunCall(u.target);
  return FOR_TAG[c.tag.split(' ')[0]] || 'For you';
}
function rarWeight(r) { const w = run.wave; return { c: 60, u: 26 + w * 1.5, r: 9 + w * 1.4, e: 3 + w * 1.0, l: 0.8 + w * 0.5 }[r]; }
// pick one from a pool by weight, and take it out of the pool
function drawCard(pool, wt) {
  const tot = pool.reduce((a, u) => a + wt(u), 0); let r = rand() * tot, k = 0;
  for (; k < pool.length - 1; k++) { r -= wt(pool[k]); if (r <= 0) break; }
  return pool.splice(k, 1)[0];
}
// three cards after a wave: always at least one skill (a perk if there's no skill left to give), aid only some of the
// time and more often the shorter you are of something (AID_CHANCE, upgrades/upgrades.js), and the rest skills, perks
// and weapons
const isAid = u => findKind(u, u) === 'Aid';
function dealCards(bonus) {
  const pool = UPG.filter(u => (!u.can || u.can()) && (!bonus || bonusKind(u))); dealt = [];
  const wt = u => rarWeight(u.r) * (typeof u.w === 'function' ? u.w() : u.w || 1);
  const aid = pool.filter(isAid), rest = pool.filter(u => !isAid(u));
  const kindIn = k => rest.filter(u => findKind(u, u) === k);
  const anchorFrom = kindIn('Skill').length ? kindIn('Skill') : kindIn('Perk');
  let anchor = null;
  if (anchorFrom.length) { anchor = drawCard(anchorFrom, wt); rest.splice(rest.indexOf(anchor), 1); dealt.push(anchor); }
  const need = aidNeed(), nAid = bonus ? 0 : rand() < AID_CHANCE[0] + (AID_CHANCE[1] - AID_CHANCE[0]) * need ? (rand() < AID_TWO * need ? 2 : 1) : 0;
  for (let k = 0; k < nAid && aid.length && dealt.length < 3; k++) dealt.push(drawCard(aid, wt));
  while (dealt.length < 3 && rest.length) dealt.push(drawCard(rest, wt));
  while (dealt.length < 3 && aid.length) dealt.push(drawCard(aid, wt));   // (only when there's nothing else left to deal)
  // shuffled, so the skill isn't always the first card
  for (let i = dealt.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [dealt[i], dealt[j]] = [dealt[j], dealt[i]]; }
  skipScrap = SKIP_SCRAP[0] + Math.floor(rand() * (SKIP_SCRAP[1] - SKIP_SCRAP[0] + 1));
  $('upSkip').innerHTML = `Take none · <b>+${skipScrap} scrap</b> instead <kbd>4</kbd>`; delete $('upSkip').dataset.down; $('upSkip').classList.remove('taken');
  const wrap = $('cards'); wrap.innerHTML = '';
  const rots = [-1.6, 0.8, -0.4];
  dealt.forEach((u, i) => {
    const c = u.card ? u.card() : { r: u.r, tag: u.tag, name: u.name, text: u.text, vis: typeof u.vis === 'function' ? u.vis() : u.vis };
    c.for = cardFor(u, c); c.tag = kindTag(u, c);   // who it's for (read from its old tag), then a skill, a perk, aid or a weapon
    u.shown = c;
    const info = upgradeInfo(u, c), stats = u.stats && !info.fx.length;
    const b = document.createElement('button'); b.className = 'card r-' + c.r; b.type = 'button';
    b.style.setProperty('--i', i); b.style.setProperty('--r', rots[i] + 'deg');
    b.innerHTML = `<div class="glare"></div><div class="taken">Taken</div><div class="k"><span></span><span class="key">${i + 1}</span></div><div class="for"></div><div class="t"></div><div class="d"></div>${info.fx.length ? '<div class="fx"></div>' : ''}${stats ? '<div class="s"></div>' : ''}${c.vis ? '<div class="v"></div>' : ''}<div class="stamp">${RAR[c.r]}</div>`;
    b.querySelector('.k span').textContent = c.tag; if (u.tierOf) b.querySelector('.k span').insertAdjacentHTML('beforeend', starRow(T(u.tierOf), TIERS[u.tierOf].t.length)); b.querySelector('.for').textContent = c.for; b.querySelector('.t').textContent = c.name; b.querySelector('.d').textContent = c.text;
    // what you get, in numbers: before → after, green when it's better
    info.fx.forEach(f => { const s = document.createElement('span'); s.className = chipCls(f); s.textContent = CHIP_MARK[chipCls(f)] + ' ' + f.t; b.querySelector('.fx').appendChild(s); });
    if (stats) b.querySelector('.s').textContent = u.stats();
    if (c.vis) b.querySelector('.v').textContent = c.vis;
    // the card leans toward the cursor as you move over it
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; b.style.setProperty('--ry', (px * 14).toFixed(1) + 'deg'); b.style.setProperty('--rx', (-py * 12).toFixed(1) + 'deg'); b.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(0) + '%'); b.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(0) + '%'); });
    b.addEventListener('pointerleave', () => { b.style.setProperty('--rx', '0deg'); b.style.setProperty('--ry', '0deg'); });
    b.addEventListener('pointerdown', () => { if (cardsArmed) b.dataset.down = '1'; });
    b.addEventListener('click', e => { if (e.detail === 0 || b.dataset.down === '1') pickCard(i); });
    wrap.appendChild(b);
  });
}
// the list of upgrades taken this run, newest first, with what each one does
function renderHistory(list, countEl) {
  const el = $(list); el.innerHTML = ''; $(countEl).textContent = run.taken.length;
  if (!run.taken.length) { el.innerHTML = '<div class="none">Nothing yet. Clear a wave to pick your first skill, perk or aid.</div>'; return; }
  run.taken.slice().reverse().forEach(h => {
    const r = document.createElement('div'); r.className = 'hrow r-' + h.r;
    r.innerHTML = '<span class="hn"></span><span class="ht"></span><span class="hw"></span><span class="hd"></span>';
    r.querySelector('.hn').textContent = h.name; if (h.n > 1) { const i = document.createElement('i'); i.textContent = '\u00d7' + h.n; r.querySelector('.hn').appendChild(i); }
    r.querySelector('.ht').textContent = h.tag + ' \u00b7 ' + RAR[h.r] + (h.on ? ' \u00b7 ' + h.on : ''); r.querySelector('.hw').textContent = 'Wave ' + h.wave; r.querySelector('.hd').textContent = h.text + (h.total ? ' · ' + h.total : '');
    el.appendChild(r);
  });
}
function openUpgrade(bonus) {
  closeStation(); bonusHand = !!bonus;
  $('upEyebrow').textContent = bonus ? `Wave ${run.wave} bonus · every ${BONUS_EVERY} waves, one more` : 'Wave ' + run.wave + ' cleared · ' + run.kills + ' kills so far';
  $('upKinds').textContent = bonus ? 'Skills · Perks' : 'Skills · Perks · Aid';
  $('upHead').textContent = bonus ? 'One more' : 'Take one';
  $('upgrade').classList.toggle('bonus', bonusHand);
  dealCards(bonus); cardsArmed = false; mouseDown = mouseDownR = false;
  setState('upgrade');
  const el = $('upgrade'); el.classList.remove('show', 'armed', 'waiting');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  $('announce').style.opacity = 0; annT = 0;
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { if (state !== 'upgrade') return; cardsArmed = true; el.classList.add('armed'); }, 1000);
  startCardClock();
}
// you have CARD_TIME seconds to choose: the clock over the cards runs down, red for the last few, and when it's out one
// of the three cards is taken for you at random (never the scrap)
const CARD_TIME = 20, CARD_WARN = 5;
let cardClock = 0, cardEnd = 0;
function startCardClock() {
  clearInterval(cardClock); cardEnd = performance.now() + CARD_TIME * 1000;
  const tick = () => {
    if (state !== 'upgrade') { clearInterval(cardClock); return; }
    const left = Math.max(0, (cardEnd - performance.now()) / 1000);
    $('upClockT').textContent = Math.ceil(left); $('upClockBar').style.transform = `scaleX(${(left / CARD_TIME).toFixed(4)})`;
    $('upClock').classList.toggle('warn', left <= CARD_WARN);
    if (left <= 0) {
      clearInterval(cardClock); if (pickWait !== null) return;
      const live = dealt.map((u, i) => i).filter(i => dealt[i]);
      if (live.length) { cardsArmed = true; $('upClock').classList.add('out'); pickCard(live[(Math.random() * live.length) | 0]); }
    }
  };
  tick(); cardClock = setInterval(tick, 100);
}
function pickCard(i) {
  if (state !== 'upgrade' || !cardsArmed || !dealt[i]) return;
  const u = dealt[i], c = u.shown; cardsArmed = false;
  const st = !u.weaponOf && !u.modOf && STACKS[c.name], before = st ? st.v() : 0;
  u.ap(); buildGuns(); SFX.upgrade();
  if (u.weaponOf || ((u.target || u.modOf) && (u.target || u.modOf) === curId())) gunGlow = 1;   // the gun in your hands glows only if the card did something to it (a body perk doesn't)
  P.wraps = 0;   // the wave's bandages come off your arm while the cards are covering you
  // in the history: what it was and, for one that went on a gun, which gun (by its plain name: your pistol, not your 9mm)
  { const nm = u.weaponOf ? WEAP[u.weaponOf].name : c.name, on = u.target ? 'On your ' + gunCall(u.target) : '', prev = run.taken.find(h => h.name === nm && (h.on || '') === on), total = st ? stackTotal(c.name, before) : '';
    if (prev) { prev.n++; prev.wave = run.wave; prev.text = c.text; prev.total = total; } else run.taken.push({ name: nm, on, tag: c.tag, text: c.text, r: c.r, wave: run.wave, n: 1, total }); }
  feed('gear', 0, u.weaponOf ? WEAP[u.weaponOf].name : c.name);
  // the pick: your card pops forward and gets stamped, the others burn away to ash (upgrades/card-burn.js), then the
  // screen fades out
  const cards = [...$('cards').children];
  cards[i].classList.add('picked'); settleUpgrade(cards.filter((b, k) => k !== i));
}
// none of them: the scrap shown under the cards instead, and all three burn
function skipCards() {
  if (state !== 'upgrade' || !cardsArmed) return;
  cardsArmed = false;
  S.scrap += skipScrap; feed('scrap', skipScrap, 'scrap'); SFX.upgrade();
  P.wraps = 0;
  // the button's stamped with what you took, and the scrap flies off it into your scrap count
  const btn = $('upSkip'); btn.innerHTML = `<b>+${skipScrap} scrap</b> taken`; btn.classList.add('taken');
  scrapFly(btn, skipScrap);
  settleUpgrade([...$('cards').children]);
}
// bits of scrap thrown up off el and arcing down into the scrap count at the top of the screen, a few at a time, each
// one bumping the count as it lands (one bit for every scrap or so, up to SCRAP_BITS); or into another element (to),
// which flashes as each lands (its 'got' class: a teammate's card at the strongbox, net/teamwork.js)
const SCRAP_BITS = 10;
function scrapFly(el, n, to) {
  const land = () => { if (!to) { popEl('scrap'); return; } to.classList.remove('got'); void to.offsetWidth; to.classList.add('got'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { land(); return; }
  const a = el.getBoundingClientRect(), t = (to || $('scrap')).getBoundingClientRect(), tx = t.width ? t.left + t.width / 2 : 40, ty = t.height ? t.top + t.height / 2 : 30;
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2, cols = ['#c9b48e', '#a88a5a', '#d8c7a0', '#8f7b5c'];
  for (let k = 0, N = Math.min(SCRAP_BITS, Math.max(5, n)); k < N; k++) {
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), sz = rr(20, 30);
    b.setAttribute('viewBox', GI_VB); b.innerHTML = GI.scrap; b.classList.add('scrapBit'); b.style.width = b.style.height = sz + 'px'; b.style.fill = cols[k % cols.length];
    document.body.appendChild(b);
    // out of the button in a little burst, up over the top of the arc, then down into the count
    const x0 = sx - sz / 2 + rr(-a.width * 0.35, a.width * 0.35), y0 = sy - sz / 2, ox = rr(-90, 90), oy = rr(-110, -50);
    const mx = (x0 + tx) / 2 + rr(-80, 80), my = Math.min(y0, ty) - rr(60, 140), ex = tx - sz / 2, ey = ty - sz / 2, r0 = rr(-40, 40), r1 = r0 + rr(-540, 540);
    const an = b.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.3) rotate(${r0}deg)`, opacity: 0 },
      { offset: 0.16, transform: `translate(${x0 + ox}px,${y0 + oy}px) scale(1.05) rotate(${r0 + (r1 - r0) * 0.2}deg)`, opacity: 1 },
      { offset: 0.55, transform: `translate(${mx}px,${my}px) scale(.95) rotate(${r0 + (r1 - r0) * 0.6}deg)`, opacity: 1 },
      { transform: `translate(${ex}px,${ey}px) scale(.45) rotate(${r1}deg)`, opacity: 0.85 }
    ], { duration: rr(820, 1050), delay: k * 55, easing: 'cubic-bezier(.3,.05,.45,1)', fill: 'both' });
    an.onfinish = () => { b.remove(); land(); };
  }
}
// co-op: once you've chosen, the screen stays up, your card stamped and the rest still lying there, with "Waiting for
// other players" under them and the clock still running down (the time they have left), till every teammate has chosen
// too (their pose says which hand they last chose from: cw, net/avatars.js); then the rest burn and it goes. Not past
// PICK_WAIT_MAX seconds after your own clock ran out, for someone who stops answering. Hands are counted, not waves, so
// a bonus wave's second hand waits for everyone like the first
const handNo = () => run.wave * 2 + (bonusHand ? 1 : 0);
const PICK_WAIT_MAX = 12;
let pickWait = null, waitClock = 0;
function settleUpgrade(burn) {
  run.cardHand = handNo(); netPicked();
  if (!netLink() || !netChoosing().length) { leaveUpgrade(burn); return; }
  pickWait = burn;
  const el = $('upgrade'); el.classList.remove('armed'); el.classList.add('waiting');
  const tick = () => {
    if (state !== 'upgrade') { clearInterval(waitClock); el.classList.remove('waiting'); pickWait = null; return; }
    const who = netChoosing();
    $('upWaitWho').textContent = who.length ? listNames(who) + (who.length > 1 ? ' are' : ' is') + ' still choosing' : '';
    if (who.length && performance.now() < cardEnd + PICK_WAIT_MAX * 1000) return;
    clearInterval(waitClock); el.classList.remove('waiting');
    const b = pickWait; pickWait = null; leaveUpgrade(b);
  };
  clearInterval(waitClock); tick(); waitClock = setInterval(tick, 100);
}
function leaveUpgrade(burn) {
  const el = $('upgrade'); clearInterval(cardClock);
  el.classList.remove('armed'); el.classList.add('picking');
  burnCards(burn);
  state = 'leaving';
  setTimeout(() => { el.classList.remove('show'); }, 1250);
  // on a bonus wave the second hand comes straight after the first (bonusDue); otherwise back to the farm
  setTimeout(() => { el.classList.remove('picking'); if (!bonusHand && bonusDue()) { openUpgrade(true); return; } setState('play'); beginBreak(25); }, 1650);
}
// (a press has to start once the cards are live, like a card's, so a click held over from the wave doesn't take it)
$('upSkip').addEventListener('pointerdown', () => { if (cardsArmed) $('upSkip').dataset.down = '1'; });
$('upSkip').addEventListener('click', e => { if (e.detail === 0 || $('upSkip').dataset.down === '1') skipCards(); });
