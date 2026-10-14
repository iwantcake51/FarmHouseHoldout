// Dealing, showing and picking upgrade cards, and the upgrade history.

let dealt = [], cardsArmed = false, armTimer = 0;
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
function dealCards() {
  const pool = UPG.filter(u => !u.can || u.can()); dealt = [];
  const wt = u => rarWeight(u.r) * (typeof u.w === 'function' ? u.w() : u.w || 1);
  while (dealt.length < 3 && pool.length) dealt.push(drawCard(pool, wt));
  // a gun you're owed (gunDue, upgrades/upgrades.js): if none of the three is a long gun or automatic of that band or
  // better, the last card becomes one
  const due = gunDue(), isDue = u => u.weaponOf && WEAP[u.weaponOf].slot !== 'side' && !WEAP[u.weaponOf].melee && weapPow(u.weaponOf) >= due;
  if (due && !dealt.some(isDue)) {
    const owed = UPG.filter(u => isDue(u) && weapPow(u.weaponOf) === due && !held(u.weaponOf) && !radioPending(u.weaponOf));
    if (owed.length) dealt[dealt.length - 1] = drawCard(owed, u => rarWeight(u.r));
  }
  const wrap = $('cards'); wrap.innerHTML = '';
  const rots = [-1.6, 0.8, -0.4];
  dealt.forEach((u, i) => {
    const c = u.card ? u.card() : { r: u.r, tag: u.tag, name: u.name, text: u.text, vis: typeof u.vis === 'function' ? u.vis() : u.vis };
    c.for = cardFor(u, c); c.tag = kindTag(u, c);   // who it's for (read from its old tag), then a skill, a perk, aid or a weapon
    u.shown = c;
    const info = upgradeInfo(u, c), stats = u.stats && !info.fx.length;
    const b = document.createElement('button'); b.className = 'card r-' + c.r; b.type = 'button';
    b.style.setProperty('--i', i); b.style.setProperty('--r', rots[i] + 'deg');
    b.innerHTML = `<div class="glare"></div><div class="taken">Taken</div><div class="k"><span></span><span class="key">${i + 1}</span></div><div class="for"></div><div class="t"></div><div class="d"></div>${info.fx.length ? '<div class="fx"></div>' : ''}${stats ? '<div class="s"></div>' : ''}${info.use ? '<div class="use"></div>' : ''}${c.vis ? '<div class="v"></div>' : ''}<div class="stamp">${RAR[c.r]}</div>`;
    b.querySelector('.k span').textContent = c.tag; b.querySelector('.for').textContent = c.for; b.querySelector('.t').textContent = c.name; b.querySelector('.d').textContent = c.text;
    // what you get, in numbers: before → after, green when it's better
    info.fx.forEach(f => { const s = document.createElement('span'); s.className = f.good ? 'up' : 'down'; s.textContent = (f.good ? '▲ ' : '▼ ') + f.t; b.querySelector('.fx').appendChild(s); });
    if (info.use) b.querySelector('.use').textContent = info.use;
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
function openUpgrade() {
  closeStation();
  $('upEyebrow').textContent = 'Wave ' + run.wave + ' cleared · ' + run.kills + ' kills so far';
  dealCards(); cardsArmed = false; mouseDown = mouseDownR = false;
  setState('upgrade');
  const el = $('upgrade'); el.classList.remove('show', 'armed');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  $('announce').style.opacity = 0; annT = 0;
  clearTimeout(armTimer);
  armTimer = setTimeout(() => { if (state !== 'upgrade') return; cardsArmed = true; el.classList.add('armed'); }, 1000);
}
function pickCard(i) {
  if (state !== 'upgrade' || !cardsArmed || !dealt[i]) return;
  const u = dealt[i], c = u.shown; cardsArmed = false;
  const st = !u.weaponOf && !u.modOf && STACKS[c.name], before = st ? st.v() : 0;
  u.ap(); buildGuns(); gunGlow = 1; SFX.upgrade();
  P.wraps = 0;   // the wave's bandages come off your arm while the cards are covering you
  // in the history: what it was and, for one that went on a gun, which gun (by its plain name: your pistol, not your 9mm)
  { const nm = u.weaponOf ? WEAP[u.weaponOf].name : c.name, on = u.target ? 'On your ' + gunCall(u.target) : '', prev = run.taken.find(h => h.name === nm && (h.on || '') === on), total = st ? stackTotal(c.name, before) : '';
    if (prev) { prev.n++; prev.wave = run.wave; prev.text = c.text; prev.total = total; } else run.taken.push({ name: nm, on, tag: c.tag, text: c.text, r: c.r, wave: run.wave, n: 1, total }); }
  feed('gear', 0, u.weaponOf ? WEAP[u.weaponOf].name : c.name);
  // the pick: your card pops forward and gets stamped, the others burn away to ash (upgrades/card-burn.js), then the
  // screen fades out
  const el = $('upgrade'), cards = [...$('cards').children];
  el.classList.remove('armed'); el.classList.add('picking');
  cards[i].classList.add('picked'); burnCards(cards.filter((b, k) => k !== i));
  state = 'leaving';
  setTimeout(() => { el.classList.remove('show'); }, 1250);
  setTimeout(() => { el.classList.remove('picking'); setState('play'); beginBreak(25); }, 1650);
}
