// Keyboard and mouse input.

const keys = new Set();
// mouseDownR: the right button, which aims, or with a gun in each hand fires the right one (weapons/akimbo.js)
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, mouseDownR = false, hasMouse = false;
const _pv = new V3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new V3(0, 1, 0), -GUN_Y), aimPt = new V3(0, GUN_Y, 5);
addEventListener('keydown', e => {
  const k = keyOf(e);
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');   // (typing in a box: the settings' search)
  if (!typing && (k === ' ' || k.startsWith('arrow') || k === 'tab')) e.preventDefault();
  if (setOpen()) { if (k === 'escape') closeSettings(); return; }   // the settings panel's open: Esc closes it, and nothing else reaches the game (ui/settings.js)
  if (k === 'f9') { e.preventDefault(); if (!e.repeat) toggleCheats(); return; }   // the cheat menu (ui/cheats.js)
  if (k === 'escape' && cheatOn) { toggleCheats(false); return; }
  keyAct(k, e);
});
// what a key does: its binding (input/keybinds.js), from the keyboard or a mouse button it's been put on
function keyAct(k, e) {
  if (k === 'escape' || bindIs(k, 'pause')) { if (P.dead) return; if (openSt && state === 'play') { closeStation(); return; } if (state === 'play') pauseRun(); else if (state === 'paused' && !(k === 'escape' && cancelLeave())) resumeRun(); return; }   // Esc backs out of a leave-the-run question first
  // the wave key starts the run from the title, a new run from the death screen, and the next wave during a break
  if (bindIs(k, 'wave') && !e.repeat && (state === 'title' || (state === 'dead' && P.dead))) { enterRun(); return; }
  if (k === 'm' && !e.repeat && state === 'dead') { leaveToMenu(); return; }
  if (state !== 'play') return;
  // down in co-op: Q and E step through the teammates still standing (net/spectate.js)
  if ((k === 'q' || k === 'e') && spectating()) { if (!e.repeat) specStep(k === 'e' ? 1 : -1); return; }
  if (e.repeat && !bindIs(k, 'board') && !bindIs(k, 'tear')) return;
  keys.add(k);
  if (bindIs(k, 'use')) { if (openSt) closeStation(); else { const t = nearestTake(); if (t) takeIt(t); else { const s = nearestStation(); if (s) openStation(s); } } return; }   // a weapon lying here first
  if (openSt && /^[0-9]$/.test(k)) return;   // (no picking things at a station by number: they're clicked)
  if (k === 'tab' && openSt && openSt.id === 'bench') { e.preventDefault(); benchGunStep(e.shiftKey ? -1 : 1); return; }   // the workbench's weapon tabs (stations/station-ui.js)
  if (k === 'tab' && openSt && openSt.id === 'rack') { e.preventDefault(); rackTab(GUN_RACK.tab + (e.shiftKey ? -1 : 1)); return; }   // the gun rack's lines (stations/armory.js)
  if (bindIs(k, 'reload')) startReload();
  if (bindIs(k, 'bandage')) startBandage();
  if (bindIs(k, 'vault')) tryVault();                                    // climbs through windows and hops fences
  if (bindIs(k, 'shove')) shove();   // (board, held at a door or window, boards it up: barricades/interactions.js)
  if (bindIs(k, 'grenade')) throwGrenade();
  if (bindIs(k, 'share') && !e.repeat) gunShare(nearestTake());   // share a gun you've put down with your team (net/teamwork.js)
  if (k === 'enter' && openSt && openSt.id === 'box') giftSend();   // the strongbox: give what's picked (net/teamwork.js)
  if (bindIs(k, 'stats')) toggleWeaponStats();   // the weapon stats sheet (ui/weapon-stats.js)
  if (bindIs(k, 'ammo')) swapRounds();   // the next kind of round you own for this gun, with a reload (weapons/rounds.js)
  if (bindIs(k, 'fireMode')) {
    const id = curId(), mode = cycleFireMode(id);
    if (mode) fireModeSwitched(id);   // the selector's click, the new mode by the crosshair and on the HUD (ui/hud.js)
  }
  for (let n = 1; n <= 4; n++) if (bindIs(k, 'slot' + n)) switchSlot(SLOTS[n - 1]);
  if (bindIs(k, 'wave') && phase === 'break' && !e.repeat) skipBreak();   // (co-op: a vote, counted by the host: net/sync.js)
  if (bindIs(k, 'zoomIn') || (KB.zoomIn === '=' && k === '+')) zoomT = clamp(zoomT * 1.15, ZOOM_MIN, ZOOM_MAX);
  if (bindIs(k, 'zoomOut') || (KB.zoomOut === '-' && k === '_')) zoomT = clamp(zoomT / 1.15, ZOOM_MIN, ZOOM_MAX);
}
addEventListener('keyup', e => keys.delete(keyOf(e)));
addEventListener('blur', () => { keys.clear(); mouseDown = mouseDownR = false; aimHeld = false; pauseRun(); });
// right click aims in play, and does nothing anywhere else: no browser menu over the game, its menus or the HUD (the
// page has no text to copy or fields to paste into)
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; hasMouse = true; if (scoped) moveScope(e.movementX || 0, e.movementY || 0); });
cv.addEventListener('mousedown', e => { audioInit(); if (state === 'play' && (e.button === 0 || e.button === 2) && spectating()) { specStep(e.button === 2 ? 1 : -1); return; }   // down in co-op: a left click watches the teammate before, a right click the next (net/spectate.js)
  if (state === 'play' && P.bandT > 0 && (e.button === 0 || e.button === 2)) cancelBandage();   // a click stops a bandage
  if (e.button === 0) mouseDown = true; if (e.button === 2) { mouseDownR = true; aimHeld = true; if (state === 'play') startAim(); } });   // scoped rifles aim down the sights too, just zoomed further (scopeAim)
// the middle and side buttons: whatever's bound to them (as mouse3 to mouse5), anywhere on the page; and the side
// buttons never take the browser back or forward a page, out of the game
const MOUSE_KEY = { 1: 'mouse3', 3: 'mouse4', 4: 'mouse5' };
addEventListener('mousedown', e => { if (e.button === 3 || e.button === 4 || e.button === 1) e.preventDefault(); const k = MOUSE_KEY[e.button]; if (k && !setOpen()) keyAct(k, { repeat: false, shiftKey: false, preventDefault() {} }); });
['auxclick', 'pointerup'].forEach(t => addEventListener(t, e => { if (e.button === 3 || e.button === 4) e.preventDefault(); }));
// (and should a browser still go back, the page holds its place: one step of history of its own, put back each time)
addEventListener('pointerdown', function guard() { removeEventListener('pointerdown', guard); try { history.pushState({ kessler: 1 }, ''); } catch (e) {} });
addEventListener('popstate', () => { try { history.pushState({ kessler: 1 }, ''); } catch (e) {} if (state === 'play') pauseRun(); });
addEventListener('mouseup', e => { if (e.button === 3 || e.button === 4) e.preventDefault(); const mk = MOUSE_KEY[e.button]; if (mk) keys.delete(mk); if (e.button === 0) mouseDown = false; if (e.button === 2) { mouseDownR = false; aimHeld = false; exitScope(); aiming = false; } });
