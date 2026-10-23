// Twin-stick touch controls and touch buttons.

import { $ } from '../core/dom.js';
import { cv } from '../core/renderer.js';
import { SLOTS } from '../weapons/slots.js';
import { W8 } from '../game/run-state.js';
import { nearestTake, takeIt } from '../pickups/pickups.js';
import { throwGrenade } from '../weapons/explosives.js';
import { nearestOpening, vaultTarget } from '../player/vaulting.js';
import { closeStation, nearestStation, openSt, openStation } from '../stations/station-ui.js';
import { audioInit } from '../audio/audio.js';
import { state } from '../game/state.js';
import { startReload } from '../weapons/reload.js';
import { spaceAction } from '../player/shove.js';
import { switchSlot } from '../player/bandages.js';
import { skipBreak } from '../net/sync.js';

const touchUI = $('touch'), stickL = $('stickL'), stickR = $('stickR');
export const tStick = { L: null, R: null };
export let usingTouch = false;
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || state !== 'play') return;
  usingTouch = true; audioInit(); touchUI.hidden = false; cv.setPointerCapture(e.pointerId);
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R'; if (tStick[side]) return;
  tStick[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
  const el = side === 'L' ? stickL : stickR; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.hidden = false;
});
cv.addEventListener('pointermove', e => {
  for (const side of ['L', 'R']) { const s = tStick[side]; if (!s || s.id !== e.pointerId) continue;
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy; const m = Math.hypot(dx, dy); if (m > 55) { dx *= 55 / m; dy *= 55 / m; }
    s.x = dx / 55; s.y = dy / 55; (side === 'L' ? stickL : stickR).firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
});
function endTouch(e) { for (const side of ['L', 'R']) { const s = tStick[side]; if (s && s.id === e.pointerId) { tStick[side] = null; const el = side === 'L' ? stickL : stickR; el.hidden = true; el.firstElementChild.style.transform = ''; } } }
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);
export let touchBoard = false;
$('tbBoard').addEventListener('pointerdown', () => touchBoard = true);
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('tbBoard').addEventListener(ev, () => touchBoard = false));
export let touchTear = false;   // held, tears the top board down (barricades/interactions.js)
$('tbTear').addEventListener('pointerdown', () => touchTear = true);
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('tbTear').addEventListener(ev, () => touchTear = false));
$('tbClimb').onclick = () => { const t = nearestTake(); if (t && !openSt) { takeIt(t); return; } const s = nearestStation(); if (s && !vaultTarget(nearestOpening())) { openSt ? closeStation() : openStation(s); } else spaceAction(); };
$('tbReload').onclick = () => startReload();
$('tbAlt').onclick = () => throwGrenade();
$('tbSwap').onclick = () => { const owned = SLOTS.filter(s => W8.slot[s]); switchSlot(owned[(owned.indexOf(W8.cur) + 1) % owned.length]); };
$('tbWave').onclick = () => skipBreak();
