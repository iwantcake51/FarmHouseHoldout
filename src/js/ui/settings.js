// The settings panel: open from the title and from the pause screen. It pops up over everything (styles/settings.css),
// its choices kept in the browser between visits (SET, localStorage), each put into effect the moment it's changed
// (applySettings): the ambient occlusion and the glow (effects/post.js), the sun's shadows, the resolution
// (game/loop.js), the volume (audio/spatial.js: zoomEars), how hard the view shakes (game/camera.js), and a frame-rate
// counter in the corner. Its Controls tab puts the keys where you want them (input/keybinds.js), and the HUD can be
// pared back to its essentials (hudStyle: styles/hud-minimal.css).

import { $ } from '../core/dom.js';
import { keyIcon } from './input-icons.js';
import { BIND_LOCK, KB, keyLabel, keyOf, keyOn, resetBinds, saveBinds, setBind } from '../input/keybinds.js';
import { DPR, R, renderScale, resize, setRenderScale, SHADOW_SOFT, sun, SUN_R } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { controlsHtml, kbRefresh } from './keyboard-map.js';

// the theme colours (the highlight everywhere: --acc in styles/base.css), each [r, g, b]
const THEMES = { ember: { name: 'Ember', rgb: '216,105,44' }, crimson: { name: 'Crimson', rgb: '204,64,58' }, amber: { name: 'Amber', rgb: '222,166,48' }, moss: { name: 'Moss', rgb: '126,170,72' },
  teal: { name: 'Teal', rgb: '58,166,156' }, steel: { name: 'Steel blue', rgb: '86,140,206' }, violet: { name: 'Violet', rgb: '150,112,214' }, bone: { name: 'Bone', rgb: '206,196,170' } };
// colour blind modes: the whole screen through a colour matrix (an SVG filter on the page), each daltonized: what the
// eye can't tell apart (CB_SIM, how it sees) shifted into colours it can, I + shift × (I - sim)
const SET_SHAKE = [50, 100];   // screen shake's slider runs from half the full shake to all of it
const SET_DEF = { ao: 'on', bloom: 'normal', shadows: 'high', res: 'auto', fps: false, hud: 'normal', theme: 'ember', cb: 'off', vol: 80, music: 60, shake: 75 };
export const SET = Object.assign({}, SET_DEF);
try { Object.assign(SET, JSON.parse(localStorage.getItem('kessler-settings') || '{}')); } catch (e) {}
SET.shake = clamp(+SET.shake || SET_DEF.shake, SET_SHAKE[0], SET_SHAKE[1]);   // (a value saved before the range moved)
const saveSettings = () => { try { localStorage.setItem('kessler-settings', JSON.stringify(SET)); } catch (e) {} };
// the glow's strength by its setting, the shadow map's size, and the resolution as a share of the screen's own
export const BLOOM_K = { off: 0, soft: 0.55, normal: 1, strong: 1.5 };
const SHADOW_SZ = { high: R.capabilities.maxTextureSize >= 8192 ? 4096 : 2048, medium: 2048, low: 1024 };
const RES_K = { auto: 1, full: 1, r75: 0.75, r50: 0.5 };
// what's on the panel: a heading, then its rows, each a dropdown (opts), a switch (bool) or a slider (min, max, unit)
const SET_ROWS = [
  { head: 'Graphics' },
  { k: 'ao', name: 'Ambient occlusion', note: 'Soft shading in corners and under things', opts: [['on', 'On'], ['off', 'Off']] },
  { k: 'bloom', name: 'Glow', note: 'Bright lights and muzzle flashes bleed light', opts: [['off', 'Off'], ['soft', 'Soft'], ['normal', 'Normal'], ['strong', 'Strong']] },
  { k: 'shadows', name: 'Shadow quality', note: 'Sharper shadows cost more', opts: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] },
  { k: 'res', name: 'Resolution', note: 'Auto lowers it when the frame rate drops', opts: [['auto', 'Auto'], ['full', '100%'], ['r75', '75%'], ['r50', '50%']] },
  { k: 'fps', name: 'Frame rate counter', note: 'Frames a second, top right', bool: true },
  { head: 'Interface' },
  { k: 'hud', name: 'HUD style', note: 'Minimalist keeps only the numbers you play by', opts: [['normal', 'Normal'], ['minimal', 'Minimalist']] },
  { k: 'theme', name: 'Theme colour', note: 'The highlight on the menus, the HUD and the crosshair', opts: Object.entries(THEMES).map(([k, t]) => [k, `<i class="sSw" style="--sw:rgb(${t.rgb})"></i>${t.name}`]) },
  { k: 'cb', name: 'Colour blind mode', note: 'Shifts the colours of the whole screen apart for your eyes', opts: [['off', 'Off'], ['prot', 'Protanopia (red)'], ['deut', 'Deuteranopia (green)'], ['trit', 'Tritanopia (blue)']] },
  { head: 'Sound' },
  { k: 'vol', name: 'Master volume', min: 0, max: 100, unit: '%' },
  { k: 'music', name: 'Music', note: 'The piano on the menus', min: 0, max: 100, unit: '%' },
  { head: 'Comfort' },
  { k: 'shake', name: 'Screen shake', note: 'Recoil, hits and explosions jolting the view', min: SET_SHAKE[0], max: SET_SHAKE[1], unit: '%' }
];
const CB_SIM = { prot: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758], deut: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7], trit: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525] };
const CB_SHIFT = { prot: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1], deut: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1], trit: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0] };
function cbMatrix(k) {
  const s = CB_SIM[k], h = CB_SHIFT[k], e = [1 - s[0], -s[1], -s[2], -s[3], 1 - s[4], -s[5], -s[6], -s[7], 1 - s[8]], m = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let v = r === c ? 1 : 0; for (let k2 = 0; k2 < 3; k2++) v += h[r * 3 + k2] * e[k2 * 3 + c]; m.push(v); }
  return `${m[0]} ${m[1]} ${m[2]} 0 0 ${m[3]} ${m[4]} ${m[5]} 0 0 ${m[6]} ${m[7]} ${m[8]} 0 0 0 0 0 1 0`;
}
function applyCb() {
  let svg = $('cbSvg');
  if (SET.cb === 'off' || !CB_SIM[SET.cb]) { document.documentElement.style.filter = ''; return; }
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'cbSvg'; svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute'; svg.innerHTML = '<filter id="cbF" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values=""/></filter>'; document.body.appendChild(svg); }
  svg.querySelector('feColorMatrix').setAttribute('values', cbMatrix(SET.cb));
  document.documentElement.style.filter = 'url(#cbF)';
}
// ---- putting them into effect
let shadowSz = 0;
function applySettings() {
  // the sun's shadow map, made again at its new size the next time it's drawn
  const sz = SHADOW_SZ[SET.shadows] || SHADOW_SZ.high;
  if (sz !== shadowSz) { shadowSz = sz; sun.shadow.mapSize.setScalar(sz); sun.shadow.radius = SHADOW_SOFT.r * sz / (2 * SUN_R); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  // a fixed resolution's set here, and left alone by the frame-rate watch; Auto starts at the screen's own
  const rk = RES_K[SET.res] || 1, want = SET.res === 'auto' ? DPR : Math.max(0.35, DPR * rk);
  if (SET.res !== 'auto' || renderScale > DPR) { setRenderScale(want); R.setPixelRatio(renderScale); resize(); }
  $('fps').hidden = !SET.fps;
  document.body.classList.toggle('hudMin', SET.hud === 'minimal');
  document.documentElement.style.setProperty('--acc', (THEMES[SET.theme] || THEMES.ember).rgb);   // (the theme colour)
  applyCb();   // (styles/hud-minimal.css, and the mag bar it shows: ui/hud.js)
}
// the frame-rate counter: frames counted over half a second
const FPS = { n: 0, t: 0 };
export function tickFps(rdt) { if (!SET.fps) return; FPS.n++; FPS.t += rdt; if (FPS.t >= 0.5) { $('fps').textContent = Math.round(FPS.n / FPS.t) + ' fps'; FPS.n = 0; FPS.t = 0; } }

// ---- the panel
const CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>';
function setRowHtml(r) {
  if (r.head) return `<div class="setHeadRow">${r.head}</div>`;
  const lab = `<div class="setLab"><b>${r.name}</b>${r.note ? `<small>${r.note}</small>` : ''}</div>`;
  if (r.opts) {
    const cur = r.opts.find(o => o[0] === SET[r.k]) || r.opts[0];
    return `<div class="setRow">${lab}<div class="sDrop" data-k="${r.k}"><button type="button" class="sDropBtn" aria-haspopup="listbox" aria-expanded="false"><span>${cur[1]}</span>${CHEV}</button>
      <ul class="sDropList" role="listbox" tabindex="-1">${r.opts.map(([v, t], i) => `<li role="option" data-v="${v}" style="--i:${i}" aria-selected="${v === cur[0]}">${t}</li>`).join('')}</ul></div></div>`;
  }
  if (r.bool) return `<div class="setRow">${lab}<button type="button" class="sTog" role="switch" data-k="${r.k}" aria-checked="${!!SET[r.k]}" aria-label="${r.name}"><i></i></button></div>`;
  return `<div class="setRow">${lab}<div class="sRangeW"><input type="range" class="sRange" data-k="${r.k}" min="${r.min}" max="${r.max}" value="${SET[r.k]}" aria-label="${r.name}" style="--p:${(SET[r.k] - r.min) / (r.max - r.min) * 100}%"><output>${SET[r.k]}${r.unit}</output></div></div>`;
}
// the Controls tab: each group's keys, the ones that can't move shown locked among them
export const LOCK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
// (the tab itself, its keyboard and its search: ui/keyboard-map.js)
let setTab = 'general';
function buildSettings() {
  $('setBody').innerHTML = setTab === 'controls' ? controlsHtml() : SET_ROWS.map(setRowHtml).join('');
  $('settings').classList.toggle('wide', setTab === 'controls'); if (setTab === 'controls') kbRefresh();   // (wider, for the keyboard beside the list)
  $('setBody').classList.remove('tabIn'); void $('setBody').offsetWidth; $('setBody').classList.add('tabIn');
}
function showTab(t) {
  if (t === setTab) return; stopBinding(); closeDrops(); setTab = t;
  $('setTabs').querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('setTabs').dataset.on = t; $('setBody').scrollTop = 0; buildSettings();
}
$('setTabs').addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });
// putting a key on something: its button listens for the next key or mouse button (taken before the game sees it)
export let binding = null;
function stopBinding() { if (!binding) return; const el = binding.el; binding = null; $('setBody').classList.remove('kPick'); el.classList.remove('listen', 'nope'); el.innerHTML = keyIcon(KB[el.dataset.act]); }
function startBinding(el) { stopBinding(); binding = { el }; $('setBody').classList.add('kPick'); el.classList.add('listen'); el.textContent = 'Press a key'; }
export function finishBinding(k) {
  const el = binding.el, a = el.dataset.act;
  if (BIND_LOCK.has(k)) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); el.textContent = keyLabel(k) + ' is taken'; setTimeout(() => { if (binding && binding.el === el) el.textContent = 'Press a key'; }, 900); return; }
  const other = setBind(a, k); stopBinding();
  $('setBody').querySelectorAll('.kBind[data-act]').forEach(b => { b.innerHTML = keyIcon(KB[b.dataset.act]); b.setAttribute('aria-label', b.closest('.setRow').querySelector('b').textContent + ': ' + keyOn(b.dataset.act) + '. Change it'); });
  [a, other].forEach(x => { const r = x && $('setBody').querySelector(`[data-row="${x}"] .kRow`); if (r) { r.classList.remove('kSet'); void r.offsetWidth; r.classList.add('kSet'); } });
  kbRefresh();   // (the keyboard lit for the new key: ui/keyboard-map.js)
}
addEventListener('keydown', e => {
  if (!binding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const k = keyOf(e); if (k === 'escape') stopBinding(); else if (k) finishBinding(k);
}, true);
addEventListener('mousedown', e => {
  if (!binding) return;
  const mk = { 1: 'mouse3', 3: 'mouse4', 4: 'mouse5' }[e.button];
  if (mk) { e.preventDefault(); e.stopImmediatePropagation(); finishBinding(mk); }
  else if (!e.target.closest('.kBind.listen, .kk')) stopBinding();   // (a key clicked on the drawing is taken as pressed: ui/keyboard-map.js)
}, true);
export const setOpen = () => !$('settings').hidden && $('settings').classList.contains('on');
let setCloseT = 0;
function openSettings() {
  clearTimeout(setCloseT); stopBinding(); buildSettings();
  const el = $('settings'); el.hidden = false; void el.offsetWidth; el.classList.add('on');
  setTimeout(() => { const f = el.querySelector('.sDropBtn'); if (f) f.focus({ preventScroll: true }); }, 60);
}
export function closeSettings() {
  const el = $('settings'); if (el.hidden) return;
  stopBinding(); closeDrops(); el.classList.remove('on'); saveSettings();
  setCloseT = setTimeout(() => { el.hidden = true; }, 340);   // (once it's popped back down: styles/settings.css)
}
// a dropdown: opens with its list unrolling under it, closes on a pick, a click anywhere else, or Esc
function closeDrops(except) { document.querySelectorAll('.sDrop.open').forEach(d => { if (d === except) return; d.classList.remove('open'); const row = d.closest('.setRow'); if (row) row.classList.remove('dropOn'); d.querySelector('.sDropBtn').setAttribute('aria-expanded', 'false'); }); }
function toggleDrop(d, on) {
  closeDrops(d); on = on ?? !d.classList.contains('open');
  d.classList.toggle('open', on); d.querySelector('.sDropBtn').setAttribute('aria-expanded', String(on));
  // (its row lifted over the rest: each row eases in on its own layer, which would otherwise keep the list under the next ones)
  const row = d.closest('.setRow'); if (row) row.classList.toggle('dropOn', on);
  // it opens upward if there's no room below it in the panel
  if (on) { const b = $('setBody').getBoundingClientRect(), r = d.getBoundingClientRect(), h = d.querySelector('.sDropList').scrollHeight; d.classList.toggle('up', r.bottom + h + 8 > b.bottom && r.top - h - 8 > b.top);
    const sel = d.querySelector('[aria-selected="true"]') || d.querySelector('li'); sel.classList.add('hl'); }
}
function pickDrop(d, li) {
  const k = d.dataset.k, v = li.dataset.v; SET[k] = v;
  d.querySelectorAll('li').forEach(q => { q.setAttribute('aria-selected', String(q === li)); q.classList.remove('hl'); });
  d.querySelector('.sDropBtn span').innerHTML = li.innerHTML;   // (a theme's swatch with it)
  toggleDrop(d, false); d.querySelector('.sDropBtn').focus({ preventScroll: true }); applySettings(); saveSettings();
}
$('setBody').addEventListener('click', e => {
  const kb = e.target.closest('.kBind[data-act]'); if (kb) { if (kb.classList.contains('listen')) stopBinding(); else startBinding(kb); return; }
  const btn = e.target.closest('.sDropBtn'); if (btn) { toggleDrop(btn.parentElement); return; }
  const li = e.target.closest('.sDropList li'); if (li) { pickDrop(li.closest('.sDrop'), li); return; }
  const tg = e.target.closest('.sTog'); if (tg) { const k = tg.dataset.k; SET[k] = !SET[k]; tg.setAttribute('aria-checked', String(SET[k])); applySettings(); saveSettings(); }
});
$('setBody').addEventListener('input', e => {
  const r = e.target.closest('.sRange'); if (!r) return;
  const row = SET_ROWS.find(q => q.k === r.dataset.k); SET[row.k] = +r.value;
  r.style.setProperty('--p', (r.value - row.min) / (row.max - row.min) * 100 + '%'); r.nextElementSibling.textContent = r.value + row.unit;
  applySettings();
});
$('setBody').addEventListener('change', saveSettings);
// and kept as a slider moves (not only once it's let go), and once more as the page goes, so nothing's lost to a tab
// shut mid-change. (The browser keeps them for this one address: a different link to the game, like another preview,
// starts from its own)
$('setBody').addEventListener('input', saveSettings);
addEventListener('pagehide', () => { saveSettings(); saveBinds(); });
// the keys in an open dropdown: up and down move through it, Enter or Space picks, Esc closes just it
$('setBody').addEventListener('keydown', e => {
  const d = e.target.closest('.sDrop'); if (!d) return;
  const open = d.classList.contains('open'), items = [...d.querySelectorAll('li')], at = items.findIndex(q => q.classList.contains('hl'));
  if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); toggleDrop(d, true); return; }
  if (!open) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = clamp(at + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1); items.forEach((q, i) => q.classList.toggle('hl', i === n)); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (at >= 0) pickDrop(d, items[at]); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleDrop(d, false); d.querySelector('.sDropBtn').focus({ preventScroll: true }); }
});
$('settings').addEventListener('pointerdown', e => { if (!e.target.closest('.sDrop')) closeDrops(); if (e.target.classList.contains('setBack')) closeSettings(); });
$('setDone').onclick = closeSettings;
$('setX').onclick = closeSettings;
$('setReset').onclick = () => { if (setTab === 'controls') { stopBinding(); resetBinds(); buildSettings(); return; } Object.assign(SET, SET_DEF); buildSettings(); applySettings(); saveSettings(); };
['setBtnTitle', 'setBtnPause'].forEach(id => { $(id).onclick = openSettings; });
applySettings();
