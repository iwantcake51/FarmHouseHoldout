// The title's Character menu: your survivor in the studio on the left (ui/gun-view.js, a live copy of you, stood easy,
// that you can turn and zoom), and on the right the parts of you along the top and what each can be under them (the
// character editor: ui/look-editor.js), every change going straight onto you. The switch at the foot keeps this look
// for every run and every time you're back on your feet in co-op (player/look.js: keepLook); off, each run deals
// someone new. Opened from the title's Character button; Done, the cross, a click outside it or Esc closes it.
import { $ } from '../core/dom.js';
import { SFX } from '../audio/sfx.js';
import { LOOK_SAVE } from '../player/look.js';
import { gunView, hideGun, showFigure } from './gun-view.js';
import { LE, lkIco, LOOK_TABS, lookAct, lookEditor, lookKeepSwitch, lookLive } from './look-editor.js';

const lmEl = $('lookMenu');
let lmCloseT = 0;
export const lookMenuOpen = () => !lmEl.hidden && lmEl.classList.contains('on');
function openLookMenu() {
  clearTimeout(lmCloseT); lmEl.hidden = false; LE.gear = false; LE.fresh = true;
  lmRender(); requestAnimationFrame(() => lmEl.classList.add('on'));
}
export function closeLookMenu() {
  if (lmEl.hidden) return; lmEl.classList.remove('on');
  lmCloseT = setTimeout(() => { lmEl.hidden = true; hideGun(); }, 340);   // (once it's popped back down: styles/look-menu.css)
}
// you in the studio, stood easy, the camera headed for the part being changed (fresh: made again, the look's changed)
const LM_ROOM = 1.35;   // (the camera a little further back than the cheat menu's smaller view has it: gun-view.js)
const lmFigure = fresh => { const st = $('lmStage'); if (gunView.parentNode !== st) st.prepend(gunView); showFigure(LE.part, fresh, false, true, LM_ROOM); };
function lmRender() {
  const part = (LOOK_TABS.find(t => t[0] === LE.part) || LOOK_TABS[0]), whole = part[0] === 'body';
  $('lmTabs').innerHTML = LOOK_TABS.map(([k, n]) => `<button type="button" role="tab" class="${LE.part === k ? 'on' : ''}" aria-selected="${LE.part === k}" data-act="lkpart" data-p="${k}">${n}</button>`).join('');
  const body = $('lmBody'), y = body.scrollTop;
  body.innerHTML = lookEditor(LE.part); body.scrollTop = y;
  $('lmSub').textContent = LOOK_SAVE.on ? 'Kept: you\'ll be this survivor every run' : 'Not kept: every run deals someone new';
  $('lmKeep').innerHTML = lookKeepSwitch('chLkT lmKeepSw');
  $('lmRoll').innerHTML = lkIco('dice') + (whole ? 'Random survivor' : 'Random ' + part[1].toLowerCase());
  $('lmRoll').dataset.p = part[0];
  lmFigure(LE.fresh); LE.fresh = false;
}
lmEl.addEventListener('click', e => {
  if (e.target.closest('#lmX, #lmDone') || e.target.classList.contains('lmBack')) { closeLookMenu(); SFX.click(); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const part = LE.part;
  if (lookAct(b.dataset.act, b.dataset)) { SFX.click(); if (LE.part !== part) $('lmBody').scrollTop = 0; lmRender(); }
});
// its colours and sliders: on you a few times a second as they move, and once more where they're let go
lmEl.addEventListener('input', e => { if (e.target.dataset.lf) lookLive(e.target, false, () => lmFigure(true), lmRender); });
lmEl.addEventListener('change', e => { if (e.target.dataset.lf) lookLive(e.target, true, () => lmFigure(true), lmRender); });
// (buttons don't take the keyboard's focus; the wheel and Esc stay with the menu)
lmEl.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
$('lookBtnTitle').onclick = () => { openLookMenu(); SFX.click(); };
