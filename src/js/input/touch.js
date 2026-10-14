// Twin-stick touch controls and touch buttons.

const touchUI = $('touch'), stickL = $('stickL'), stickR = $('stickR');
const tStick = { L: null, R: null };
let usingTouch = false;
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
let touchBoard = false;
$('tbBoard').addEventListener('pointerdown', () => touchBoard = true);
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('tbBoard').addEventListener(ev, () => touchBoard = false));
$('tbClimb').onclick = () => { const t = nearestTake(); if (t && !openSt) { takeIt(t); return; } const s = nearestStation(); if (s && !vaultTarget(nearestOpening())) { openSt ? closeStation() : openStation(s); } else spaceAction(); };
$('tbReload').onclick = () => startReload();
$('tbAlt').onclick = () => throwGrenade();
$('tbSwap').onclick = () => { const owned = SLOTS.filter(s => W8.slot[s]); switchSlot(owned[(owned.indexOf(W8.cur) + 1) % owned.length]); };
$('tbWave').onclick = () => { if (phase === 'break') breakT = 0; };
