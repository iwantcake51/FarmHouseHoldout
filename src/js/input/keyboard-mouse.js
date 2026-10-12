// Keyboard and mouse input.

const keys = new Set();
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, hasMouse = false;
const _pv = new V3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new V3(0, 1, 0), -GUN_Y), aimPt = new V3(0, GUN_Y, 5);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
  if (state === 'upgrade' && ['1', '2', '3'].includes(k)) { pickCard(+k - 1); return; }
  if (k === 'escape' || k === 'p') { if (P.dead) return; if (openSt && state === 'play') { closeStation(); return; } if (state === 'play') setState('paused'); else if (state === 'paused') setState('play'); return; }
  // T starts the run from the title, a new run from the death screen, and the next wave during a break
  if (k === 't' && !e.repeat && (state === 'title' || (state === 'dead' && P.dead))) { newRun(); return; }
  if (state !== 'play') return;
  if (e.repeat && k !== 'f') return;
  keys.add(k);
  if (k === 'e') { if (openSt) closeStation(); else { const s = nearestStation(); if (s) openStation(s); } return; }
  if (openSt && /^[1-9]$/.test(k)) { craft(+k - 1); return; }
  if (k === 'r') startReload();
  if (k === 'h' && state === 'play') startBandage();
  if (k === ' ') spaceAction();
  if (k === 'g') throwGrenade();
  if (k === 'v' && state === 'play') {
    const id = curId(), fm = (W8.mods[id] || []).map(m => MODS[m]).find(m => m.fm);
    if (fm) { W8.semi[id] = !W8.semi[id]; W8.burstLeft = 0; recomputeEff(); SFX.click(); tn(0.03, 'square', 900, 700, 0.06); toast(W8.semi[id] ? (id === 'revolver' ? 'Aimed shots' : 'Single shots') : fm.fm); }
  }
  if (['1', '2', '3', '4'].includes(k)) equip(SLOTS[+k - 1]);
  if (k === 't' && phase === 'break') breakT = 0;
  if (k === '=' || k === '+') zoomT = clamp(zoomT * 1.15, 0.6, 1.8);
  if (k === '-' || k === '_') zoomT = clamp(zoomT / 1.15, 0.6, 1.8);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouseDown = false; if (state === 'play' && !P.dead) setState('paused'); });
addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; hasMouse = true; if (scoped) moveScope(e.movementX || 0, e.movementY || 0); });
cv.addEventListener('mousedown', e => { audioInit(); if (e.button === 0) mouseDown = true; if (e.button === 2 && state === 'play') { if (hasScope()) enterScope(); else startAim(); } });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) { exitScope(); aiming = false; } });
