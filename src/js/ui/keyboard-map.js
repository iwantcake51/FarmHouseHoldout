// The Controls tab of the settings (ui/settings.js): the list of what each key does, with a search over it, beside a
// keyboard and a mouse drawn out with every bound key lit in its group's colour. Hovering a key says what it does and
// lights its line in the list; hovering a line lights its key. While a line's listening for a new key (startBinding),
// a key clicked on the drawing is taken as the one pressed. Searching filters the lines as you type, the ones that
// don't match folding away, the matching letters marked, and the keyboard dims all but their keys.

// each group's colour, on the keyboard and down the side of its lines
const KGROUP_COL = { Movement: '#86b4d0', Combat: '#e08a5a', Survival: '#a3c47e' };
// the keyboard as it's drawn: each key [e.key, label, width in key widths]
const KB_ROWS = [
  [['`', '`'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['0', '0'], ['-', '−'], ['=', '='], ['backspace', '⌫', 2]],
  [['tab', 'Tab', 1.5], ['q', 'Q'], ['w', 'W'], ['e', 'E'], ['r', 'R'], ['t', 'T'], ['y', 'Y'], ['u', 'U'], ['i', 'I'], ['o', 'O'], ['p', 'P'], ['[', '['], [']', ']'], ['\\', '\\', 1.5]],
  [['capslock', 'Caps', 1.75], ['a', 'A'], ['s', 'S'], ['d', 'D'], ['f', 'F'], ['g', 'G'], ['h', 'H'], ['j', 'J'], ['k', 'K'], ['l', 'L'], [';', ';'], ["'", "'"], ['enter', 'Enter', 2.25]],
  [['shift', 'Shift', 2.25], ['z', 'Z'], ['x', 'X'], ['c', 'C'], ['v', 'V'], ['b', 'B'], ['n', 'N'], ['m', 'M'], [',', ','], ['.', '.'], ['/', '/'], ['shift', 'Shift', 2.75]],
  [['control', 'Ctrl', 1.5], ['alt', 'Alt', 1.5], [' ', 'Space', 9], ['alt', 'Alt', 1.5], ['control', 'Ctrl', 1.5]]
];
// what's on a key: the actions bound to it (and walking, fixed on W A S D), each with its group
function keyActs() {
  const m = new Map(), add = (k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  ['w', 'a', 's', 'd'].forEach(k => add(k, { name: 'Walk', group: 'Movement', fixed: true }));
  add('mouse1', { name: 'Fire', group: 'Combat', fixed: true }); add('mouse2', { name: 'Aim down the sights', group: 'Combat', fixed: true });
  for (const g of BIND_GROUPS) for (const [a, name, hold] of g.rows) add(KB[a], { a, name, group: g.name, hold });
  return m;
}
// the keys the list's fixed lines are on, drawn as they are on the keyboard
const K_FIXED = { 'W A S D': ['w', 'a', 's', 'd'], Mouse: ['mouse1'], 'Right click': ['mouse2'] };
// a key on the drawing: a face the key's width with Kenney's key for it in the middle, its legend the board's colour
// showing through, so a wide key (Shift, Space) keeps its lettering at the letters' size instead of stretching it. The
// pack's key is fitted inside the face by whichever's tighter, its width or its height, so it never spills over the
// keys beside it (KM.crop: the part of an odd-shaped key that's used, the lower bar of Enter's L)
const KM = { crop: { enter: [8, 29, 48, 27] } };
function mapKey(k, l) {
  const n = iconOf(k); if (!n) return `<span>${kEsc(l)}</span>`;
  const I = KEN_ICONS[n], B = KM.crop[n] || I;
  return `<svg class="kFace" aria-hidden="true"><rect class="kf" width="100%" height="100%" rx="5"/><svg width="100%" height="100%" viewBox="${B[0]} ${B[1]} ${B[2]} ${B[3]}"><rect class="kl" x="${B[0] + 1}" y="${B[1] + 1}" width="${B[2] - 2}" height="${B[3] - 2}" rx="10"/>${I[4].map(d => `<path class="kf" d="${d}"/>`).join('')}</svg></svg>`;
}
const kEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// ---- the tab's markup
function controlsHtml() {
  const lock = LOCK_SVG;
  const list = BIND_GROUPS.map(g => {
    const col = KGROUP_COL[g.name];
    const fixed = g.fixed.map(([k, t]) => `<div class="kItem" data-q="${kEsc((t + ' ' + k + ' ' + g.name).toLowerCase())}"><div class="kIn"><div class="setRow kRow kFixed"><div class="setLab"><b data-t="${kEsc(t)}">${kEsc(t)}</b></div><span class="kBind" aria-disabled="true">${lock}${(K_FIXED[k] || []).map(keyIcon).join('') || `<span>${k}</span>`}</span></div></div></div>`).join('');
    const rows = g.rows.map(([a, t, hold]) => `<div class="kItem" data-row="${a}" data-q="${kEsc((t + ' ' + keyOn(a) + ' ' + g.name + (hold ? ' hold' : '')).toLowerCase())}"><div class="kIn"><div class="setRow kRow"><div class="setLab"><b data-t="${kEsc(t)}">${kEsc(t)}</b>${hold ? '<i class="kHold">Hold</i>' : ''}</div><button type="button" class="kBind" data-act="${a}" aria-label="${kEsc(t)}: ${keyOn(a)}. Change it">${keyIcon(KB[a])}</button></div></div></div>`).join('');
    return `<section class="kGroup" style="--gc:${col}"><h4 class="kGroupHd"><i></i>${g.name}<small>${g.rows.length + g.fixed.length}</small></h4>${fixed}${rows}</section>`;
  }).join('');
  const keys = KB_ROWS.map(r => `<div class="kbRow">${r.map(([k, l, w]) => `<button type="button" class="kk" data-k="${kEsc(k)}" style="--w:${w || 1}" tabindex="-1" aria-label="${kEsc(keyLabel(k))}">${mapKey(k, l)}</button>`).join('')}</div>`).join('');
  // the mouse: Kenney's, each button its own shape to light and click, and the side buttons on its flank
  const mb = (k, part) => `<path class="kk mb" data-k="${k}" d="${MOUSE_PARTS[part]}"/>`;
  const mouse = `<svg class="kMouse" viewBox="9.6 9 40.4 46" aria-hidden="true"><path class="mBody" d="${MOUSE_PARTS.body}"/>${mb('mouse1', 'left')}${mb('mouse2', 'right')}${mb('mouse3', 'wheel')}${mb('mouse5', 'side5')}${mb('mouse4', 'side4')}</svg>`;
  const legend = Object.entries(KGROUP_COL).map(([n, c]) => `<span style="--gc:${c}"><i></i>${n}</span>`).join('');
  return `<div class="kWrap">
    <div class="kLeft">
      <label class="kSearch"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="m10.4 10.4 3.4 3.4"/></svg><input type="search" id="kFind" placeholder="Search controls or keys" autocomplete="off" spellcheck="false" aria-label="Search controls"><button type="button" class="kClear" aria-label="Clear the search">×</button></label>
      <div class="kList">${list}<p class="kEmpty" hidden>Nothing matches <b></b></p></div>
      <p class="kNote">Click a key on the right of a line, then press the new one, or click it on the keyboard. A key already in use swaps over. Esc leaves it as it was.</p>
    </div>
    <div class="kBoard"><div class="kKeys">${keys}</div>${mouse}<div class="kLegend">${legend}</div><div class="kTip" role="tooltip" aria-hidden="true"></div></div>
  </div>`;
}
// ---- keeping it up: the keys lit by what's on them, the lines' keys, the search
function kbRefresh() {
  const body = $('setBody'), acts = keyActs(); if (!body.querySelector('.kBoard')) return;
  body.querySelectorAll('.kk').forEach(el => {
    const on = acts.get(el.dataset.k) || [];
    el.classList.toggle('on', on.length > 0); el.classList.toggle('fixed', on.length > 0 && on.every(x => x.fixed));
    el.classList.toggle('locked', !on.length && BIND_LOCK.has(el.dataset.k));
    if (on.length) el.style.setProperty('--c', KGROUP_COL[on[0].group]); else el.style.removeProperty('--c');
  });
  body.querySelectorAll('.kItem[data-row]').forEach(it => {
    const a = it.dataset.row, g = BIND_GROUPS.find(q => q.rows.some(r => r[0] === a)), r = g.rows.find(q => q[0] === a);
    it.dataset.q = (r[1] + ' ' + keyOn(a) + ' ' + g.name + (r[2] ? ' hold' : '')).toLowerCase();
  });
  kSearch($('kFind') ? $('kFind').value : '');
}
// the search: a line stays if what it does, its key or its group has every word typed in; the rest fold away. The
// letters that matched are marked in the names, and on the keyboard all but the matching lines' keys go dim
function kSearch(q) {
  const body = $('setBody'), words = q.trim().toLowerCase().split(/\s+/).filter(Boolean), hit = new Set();
  let any = false;
  body.querySelectorAll('.kItem').forEach(it => {
    const ok = !words.length || words.every(w => it.dataset.q.includes(w)); it.classList.toggle('kOut', !ok); if (ok) any = true;
    const b = it.querySelector('b[data-t]'), t = b.dataset.t;
    if (!words.length) b.textContent = t;
    else { const re = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'); b.innerHTML = kEsc(t).replace(re, '<mark>$1</mark>'); }
    if (ok && it.dataset.row) hit.add(KB[it.dataset.row]);
  });
  body.querySelectorAll('.kGroup').forEach(g => g.classList.toggle('kOut', ![...g.querySelectorAll('.kItem')].some(it => !it.classList.contains('kOut'))));
  const em = body.querySelector('.kEmpty'); if (em) { em.hidden = any; em.querySelector('b').textContent = q.trim(); }
  body.querySelector('.kSearch').classList.toggle('has', !!q);
  body.querySelectorAll('.kk').forEach(el => el.classList.toggle('dim', !!words.length && !hit.has(el.dataset.k)));
}
// ---- hovering: a key says what's on it and lights its lines; a line lights its key
function kTip(el) {
  const tip = $('setBody').querySelector('.kTip'); if (!tip) return;
  $('setBody').querySelectorAll('.kItem.kHot').forEach(it => it.classList.remove('kHot'));
  if (!el) { tip.classList.remove('on'); return; }
  const on = keyActs().get(el.dataset.k) || [], name = el.dataset.k.startsWith('mouse') ? ({ mouse1: 'Left click', mouse2: 'Right click', mouse3: 'Middle click', mouse4: 'Mouse 4', mouse5: 'Mouse 5' })[el.dataset.k] : keyLabel(el.dataset.k);
  tip.innerHTML = `<b>${kEsc(name)}</b>` + (on.length ? on.map(x => `<span style="--gc:${KGROUP_COL[x.group]}"><i></i>${kEsc(x.name)}${x.hold ? ' <em>hold</em>' : ''}${x.fixed ? ' <em>fixed</em>' : ''}</span>`).join('') : `<span class="none">${BIND_LOCK.has(el.dataset.k) ? 'Kept for the menus' : 'Not bound'}</span>`);
  const bd = tip.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
  const below = r.top - bd.top < 40;   // (the top row's tip goes under its key, out of the way of the panel's edge)
  tip.classList.toggle('below', below); tip.style.left = (r.left + r.width / 2 - bd.left) + 'px'; tip.style.top = ((below ? r.bottom : r.top) - bd.top) + 'px';
  tip.classList.remove('on'); void tip.offsetWidth; tip.classList.add('on');
  on.forEach(x => { const it = x.a && $('setBody').querySelector(`.kItem[data-row="${x.a}"]`); if (it) it.classList.add('kHot'); });
}
$('setBody').addEventListener('mouseover', e => {
  if (!$('setBody').querySelector('.kBoard')) return;
  const k = e.target.closest('.kk'); if (k) { if (k !== kTip.at) { kTip.at = k; kTip(k); } return; }
  if (kTip.at && !e.target.closest('.kTip')) { kTip.at = null; kTip(null); }
  const it = e.target.closest('.kItem[data-row]'), key = it ? KB[it.dataset.row] : null;
  $('setBody').querySelectorAll('.kk').forEach(el => el.classList.toggle('hot', !!key && el.dataset.k === key));
});
$('setBody').addEventListener('mouseleave', () => { kTip.at = null; kTip(null); $('setBody').querySelectorAll('.kk.hot').forEach(el => el.classList.remove('hot')); });
// clicking a key on the drawing: taken as the new key while a line's listening; otherwise its line's found and lit
$('setBody').addEventListener('click', e => {
  const k = e.target.closest('.kk'); if (!k) return;
  if (binding) { finishBinding(k.dataset.k); return; }
  const on = (keyActs().get(k.dataset.k) || []).find(x => x.a), it = on && $('setBody').querySelector(`.kItem[data-row="${on.a}"]`);
  if (it) { if ($('kFind').value) { $('kFind').value = ''; kSearch(''); } it.scrollIntoView({ block: 'center', behavior: 'smooth' }); const r = it.querySelector('.kRow'); r.classList.remove('kSet'); void r.offsetWidth; r.classList.add('kSet'); }
});
$('setBody').addEventListener('input', e => { if (e.target.id === 'kFind') kSearch(e.target.value); });
$('setBody').addEventListener('keydown', e => {
  if (e.target.id !== 'kFind') return;
  if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; kSearch(''); }   // (Esc clears the search first, then closes)
});
