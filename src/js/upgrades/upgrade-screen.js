// Dealing, showing and picking upgrade cards, and the upgrade history.

let dealt = [], cardsArmed = false, armTimer = 0;
function rarWeight(r) { const w = run.wave; return { c: 60, u: 26 + w * 1.5, r: 9 + w * 1.4, e: 3 + w * 1.0, l: 0.8 + w * 0.5 }[r]; }
function dealCards() {
  const pool = UPG.filter(u => !u.can || u.can()); dealt = [];
  while (dealt.length < 3 && pool.length) {
    const wt = u => rarWeight(u.r) * (u.w || 1);
    const tot = pool.reduce((a, u) => a + wt(u), 0); let r = rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= wt(pool[k]); if (r <= 0) break; }
    dealt.push(pool.splice(k, 1)[0]);
  }
  const wrap = $('cards'); wrap.innerHTML = '';
  const rots = [-1.6, 0.8, -0.4];
  dealt.forEach((u, i) => {
    const c = u.card ? u.card() : { r: u.r, tag: u.tag, name: u.name, text: u.text, vis: typeof u.vis === 'function' ? u.vis() : u.vis };
    u.shown = c;
    const info = upgradeInfo(u, c), stats = u.stats && !info.fx.length;
    const b = document.createElement('button'); b.className = 'card r-' + c.r; b.type = 'button';
    b.style.setProperty('--i', i); b.style.setProperty('--r', rots[i] + 'deg');
    b.innerHTML = `<div class="glare"></div><div class="taken">Taken</div><div class="k"><span></span><span class="key">${i + 1}</span></div><div class="t"></div><div class="d"></div>${info.fx.length ? '<div class="fx"></div>' : ''}${stats ? '<div class="s"></div>' : ''}${info.use ? '<div class="use"></div>' : ''}${c.vis ? '<div class="v"></div>' : ''}<div class="stamp">${RAR[c.r]}</div>`;
    b.querySelector('.k span').textContent = c.tag; b.querySelector('.t').textContent = c.name; b.querySelector('.d').textContent = c.text;
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
  if (!run.taken.length) { el.innerHTML = '<div class="none">Nothing yet. Clear a wave to pick your first upgrade.</div>'; return; }
  run.taken.slice().reverse().forEach(h => {
    const r = document.createElement('div'); r.className = 'hrow r-' + h.r;
    r.innerHTML = '<span class="hn"></span><span class="ht"></span><span class="hw"></span><span class="hd"></span>';
    r.querySelector('.hn').textContent = h.name; if (h.n > 1) { const i = document.createElement('i'); i.textContent = '\u00d7' + h.n; r.querySelector('.hn').appendChild(i); }
    r.querySelector('.ht').textContent = h.tag + ' \u00b7 ' + RAR[h.r]; r.querySelector('.hw').textContent = 'Wave ' + h.wave; r.querySelector('.hd').textContent = h.text;
    el.appendChild(r);
  });
}
function openUpgrade() {
  closeStation();
  $('upEyebrow').textContent = 'Wave ' + run.wave + ' cleared · ' + run.kills + ' kills so far';
  dealCards(); cardsArmed = false; mouseDown = false;
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
  u.ap(); buildGuns(); gunGlow = 1; SFX.upgrade();
  { const nm = u.weaponOf ? WEAP[u.weaponOf].name : u.target ? c.name + ' (' + WEAP[u.target].short + ')' : c.name, prev = run.taken.find(h => h.name === nm);
    if (prev) { prev.n++; prev.wave = run.wave; prev.text = c.text; } else run.taken.push({ name: nm, tag: c.tag, text: c.text, r: c.r, wave: run.wave, n: 1 }); }
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
