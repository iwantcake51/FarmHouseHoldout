// The title's Character menu: your survivor in the studio on the left (ui/gun-view.js, a live copy of you, stood easy,
// that you can turn and zoom), and on the right the parts of you along the top and what each can be under them (the
// character editor: ui/look-editor.js), every change going straight onto you. The switch at the foot keeps this look
// for every run and every time you're back on your feet in co-op (player/look.js: keepLook); off, each run deals
// someone new. Above the parts, the survivors you've saved, to swap between (ui/look-editor.js: lookSlots). Opened from
// the title's Character button, or from your seat in a co-op lobby (net/lobby.js), where the others see your new look
// once it's closed; Done, the cross, a click outside it or Esc closes it.
import { $ } from '../core/dom.js';
import { SFX } from '../audio/sfx.js';
import { LOOK_SAVE } from '../player/look.js';
import { NET } from '../net/net.js';
import { lobbyRender } from '../net/lobby.js';
import { gunView, hideGun, showFigure, studioSpin, studioView } from './gun-view.js';
import { LE, lkIco, LOOK_TABS, lookAct, lookEditor, lookHist, lookKeepSwitch, lookLive, lookSlotName, lookSlots } from './look-editor.js';

const lmEl = $('lookMenu');
let lmCloseT = 0;
export const lookMenuOpen = () => !lmEl.hidden && lmEl.classList.contains('on');
export function openLookMenu() {
  clearTimeout(lmCloseT); lmEl.hidden = false; LE.gear = false; LE.fresh = true; LE.slotDel = false;
  lmRender(); requestAnimationFrame(() => lmEl.classList.add('on'));
}
export function closeLookMenu() {
  if (lmEl.hidden) return; lmEl.classList.remove('on');
  lmCloseT = setTimeout(() => { lmEl.hidden = true; hideGun(); }, 340);   // (once it's popped back down: styles/look-menu.css)
  if (NET.on) lobbyRender();   // (in a lobby: the others told how you look now, net/lobby.js)
}
// you in the studio, stood easy, the camera headed for the part being changed (fresh: made again, the look's changed)
const LM_ROOM = 1.35;   // (the camera a little further back than the cheat menu's smaller view has it: gun-view.js)
const lmFigure = fresh => { const st = $('lmStage'); if (gunView.parentNode !== st) st.prepend(gunView); showFigure(LE.part, fresh, false, true, LM_ROOM); };
function lmRender() {
  const part = (LOOK_TABS.find(t => t[0] === LE.part) || LOOK_TABS[0]), whole = part[0] === 'body';
  // (a part locked against Random survivor shows its padlock on its tab too)
  $('lmTabs').innerHTML = LOOK_TABS.map(([k, n]) => `<button type="button" role="tab" class="${LE.part === k ? 'on' : ''}${LE.locks.has(k) ? ' locked' : ''}" aria-selected="${LE.part === k}" data-act="lkpart" data-p="${k}">${n}${LE.locks.has(k) ? lkIco('padlock') : ''}</button>`).join('');
  { const t = $('lmTabs').querySelector('.on'); if (t) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  // the survivors you've saved (the one you're in kept in view, unless its name's being typed)
  if (!$('lmSlots').contains(document.activeElement)) { const [chips, acts] = lookSlots(); $('lmSlotList').innerHTML = chips; $('lmSlotActs').innerHTML = acts; const c = $('lmSlotList').querySelector('.on'); if (c) c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  const H = lookHist(); $('lmUndo').disabled = !H.undo; $('lmRedo').disabled = !H.redo;
  { const sp = $('lmView').querySelector('.lmSpin'); sp.classList.toggle('on', studioSpin()); sp.setAttribute('aria-pressed', studioSpin()); }
  const body = $('lmBody'), y = body.scrollTop;
  body.innerHTML = lookEditor(LE.part); body.scrollTop = y;
  $('lmSub').textContent = LOOK_SAVE.on ? 'Kept: you\'ll be this survivor every run' : 'Not kept: every run deals someone new';
  $('lmKeep').innerHTML = lookKeepSwitch('chLkT lmKeepSw');
  $('lmRoll').innerHTML = lkIco('dice') + (whole ? (LE.locks.size ? 'Random, but the locked' : 'Random survivor') : 'Random ' + part[1].toLowerCase());
  $('lmRoll').dataset.p = part[0];
  lmFigure(LE.fresh); LE.fresh = false;
}
lmEl.addEventListener('click', e => {
  if (e.target.closest('#lmX, #lmDone') || e.target.classList.contains('lmBack')) { closeLookMenu(); SFX.click(); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const part = LE.part;
  if (lookAct(b.dataset.act, b.dataset)) { SFX.click(); if (LE.part !== part) $('lmBody').scrollTop = 0; lmRender(); }
});
// the studio's view buttons: a quarter turn either way, front, back, back to the start, and the slow turn on or off
$('lmView').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; studioView(b.dataset.view); SFX.click(); if (b.dataset.view === 'spin') lmRender(); });
// the keyboard while it's open: Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes; the left and right arrows (or Q and E)
// step through the parts; the slider or colour being moved keeps its own keys
const lmStep = d => { const i = LOOK_TABS.findIndex(t => t[0] === LE.part), n = LOOK_TABS.length; LE.part = LOOK_TABS[(i + d + n) % n][0]; $('lmBody').scrollTop = 0; lmRender(); SFX.click(); };
addEventListener('keydown', e => {
  if (!lookMenuOpen() || e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); if (lookAct(e.shiftKey ? 'lkredo' : 'lkundo', {})) { SFX.click(); lmRender(); } }
  else if (mod && k === 'y') { e.preventDefault(); if (lookAct('lkredo', {})) { SFX.click(); lmRender(); } }
  else if (!mod && (k === 'arrowleft' || k === 'q')) { e.preventDefault(); lmStep(-1); }
  else if (!mod && (k === 'arrowright' || k === 'e')) { e.preventDefault(); lmStep(1); }
});
// its colours and sliders: on you a few times a second as they move, and once more where they're let go; and a saved
// survivor's name as it's typed (Enter or Esc done with it)
lmEl.addEventListener('input', e => { if (e.target.dataset.lf) lookLive(e.target, false, () => lmFigure(true), lmRender); else if (e.target.dataset.slot) lookSlotName(e.target.value, false); });
lmEl.addEventListener('change', e => { if (e.target.dataset.lf) lookLive(e.target, true, () => lmFigure(true), lmRender); });
lmEl.addEventListener('keydown', e => { if (e.target.dataset.slot && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); e.target.blur(); } });
lmEl.addEventListener('focusout', e => { if (e.target.dataset.slot) { lookSlotName(e.target.value, true); setTimeout(lmRender); } });
// the strips that scroll sideways (the parts along the top, the survivors above them): the wheel runs them along (a
// notch about a tab's width, easing there; a touchpad's own sideways scroll is left alone), and they can be dragged
// along with the mouse (what the drag's let go over isn't clicked)
const SIDE_WHEEL = { line: 18, ease: 250 };
function sideScroll(el) {
  let to = 0, toT = 0, dr = null, swallow = false;
  el.addEventListener('wheel', e => {
    const max = el.scrollWidth - el.clientWidth; if (max <= 0 || e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault(); e.stopPropagation();
    const px = e.deltaY * (e.deltaMode === 1 ? SIDE_WHEEL.line : e.deltaMode === 2 ? el.clientWidth * 0.9 : 1), now = performance.now();
    to = Math.max(0, Math.min(max, (now - toT < SIDE_WHEEL.ease ? to : el.scrollLeft) + px)); toT = now;
    el.scrollTo({ left: to, behavior: Math.abs(px) >= 40 ? 'smooth' : 'auto' });
  }, { passive: false });
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && !e.target.closest('input') && el.scrollWidth > el.clientWidth) dr = { x: e.clientX, l: el.scrollLeft, id: e.pointerId, on: false }; });
  el.addEventListener('pointermove', e => {
    if (!dr) return; const dx = e.clientX - dr.x;
    if (!dr.on && Math.abs(dx) > 5) { dr.on = true; el.classList.add('drag'); try { el.setPointerCapture(dr.id); } catch (er) {} }
    if (dr.on) el.scrollLeft = dr.l - dx;
  });
  const up = () => { if (dr && dr.on) { el.classList.remove('drag'); swallow = true; setTimeout(() => { swallow = false; }); } dr = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('click', e => { if (swallow) { e.preventDefault(); e.stopPropagation(); } }, true);
}
sideScroll($('lmTabs')); sideScroll($('lmSlotList'));
// (buttons don't take the keyboard's focus; the wheel and Esc stay with the menu)
lmEl.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
$('lookBtnTitle').onclick = () => { openLookMenu(); SFX.click(); };
