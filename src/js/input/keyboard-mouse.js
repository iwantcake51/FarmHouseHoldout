// Keyboard and mouse input.

const keys = new Set();
// mouseDownR: the right button, which aims, or with a gun in each hand fires the right one (weapons/akimbo.js)
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, mouseDownR = false, hasMouse = false;
const _pv = new V3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new V3(0, 1, 0), -GUN_Y), aimPt = new V3(0, GUN_Y, 5);
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
  if (k === 'f9') { e.preventDefault(); if (!e.repeat) toggleCheats(); return; }   // the cheat menu (ui/cheats.js)
  if (k === 'escape' && cheatOn) { toggleCheats(false); return; }
  if (state === 'upgrade' && ['1', '2', '3'].includes(k)) { pickCard(+k - 1); return; }
  if (state === 'upgrade' && k === '4') { skipCards(); return; }
  if (k === 'escape' || k === 'p') { if (P.dead) return; if (openSt && state === 'play') { closeStation(); return; } if (state === 'play') pauseRun(); else if (state === 'paused' && !(k === 'escape' && cancelLeave())) resumeRun(); return; }   // Esc backs out of a leave-the-run question first
  // T starts the run from the title, a new run from the death screen, and the next wave during a break
  if (k === 't' && !e.repeat && (state === 'title' || (state === 'dead' && P.dead))) { enterRun(); return; }
  if (k === 'm' && !e.repeat && state === 'dead') { leaveToMenu(); return; }
  if (state !== 'play') return;
  // down in co-op: Q and E step through the teammates still standing (net/spectate.js)
  if ((k === 'q' || k === 'e') && spectating()) { if (!e.repeat) specStep(k === 'e' ? 1 : -1); return; }
  if (e.repeat && k !== 'f') return;
  keys.add(k);
  if (k === 'e') { if (openSt) closeStation(); else { const t = nearestTake(); if (t) takeIt(t); else { const s = nearestStation(); if (s) openStation(s); } } return; }   // a weapon lying here first
  if (openSt && /^[0-9]$/.test(k)) { craft(k === '0' ? 9 : +k - 1); return; }
  if (k === 'tab' && openSt && openSt.id === 'bench') { e.preventDefault(); benchGunStep(e.shiftKey ? -1 : 1); return; }   // the workbench's weapon tabs (stations/station-ui.js)
  if (k === 'tab' && openSt && openSt.id === 'rack') { e.preventDefault(); rackTab(GUN_RACK.tab + (e.shiftKey ? -1 : 1)); return; }   // the gun rack's lines (stations/armory.js)
  if (k === 'r') startReload();
  if (k === 'q' && state === 'play') startBandage();
  if (k === ' ' && state === 'play') tryVault();                                    // Space climbs through windows and hops fences
  if (k === 'v' && state === 'play') shove();   // V shoves; F, held at a door or window, boards it up (barricades/interactions.js)
  if (k === 'g') throwGrenade();
  if (k === 'h' && state === 'play' && !e.repeat) gunShare(nearestTake());   // share a gun you've put down with your team (net/teamwork.js)
  if (k === 'enter' && openSt && openSt.id === 'box') giftSend();   // the strongbox: give what's picked (net/teamwork.js)
  if (k === 'i') toggleWeaponStats();   // the weapon stats sheet (ui/weapon-stats.js)
  if (k === 'x' && state === 'play') swapRounds();   // the next kind of round you own for this gun, with a reload (weapons/rounds.js)
  if (k === 'b' && state === 'play') {
    const id = curId(), mode = cycleFireMode(id);
    if (mode) fireModeSwitched(id);   // the selector's click, the new mode by the crosshair and on the HUD (ui/hud.js)
  }
  if (['1', '2', '3', '4'].includes(k)) switchSlot(SLOTS[+k - 1]);
  if (k === 't' && phase === 'break' && !e.repeat) skipBreak();   // (co-op: a vote, counted by the host: net/sync.js)
  if (k === '=' || k === '+') zoomT = clamp(zoomT * 1.15, ZOOM_MIN, ZOOM_MAX);
  if (k === '-' || k === '_') zoomT = clamp(zoomT / 1.15, ZOOM_MIN, ZOOM_MAX);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouseDown = mouseDownR = false; aimHeld = false; pauseRun(); });
// right click aims in play, and does nothing anywhere else: no browser menu over the game, its menus or the HUD (the
// page has no text to copy or fields to paste into)
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; hasMouse = true; if (scoped) moveScope(e.movementX || 0, e.movementY || 0); });
cv.addEventListener('mousedown', e => { audioInit(); if (state === 'play' && (e.button === 0 || e.button === 2) && spectating()) { specStep(e.button === 2 ? 1 : -1); return; }   // down in co-op: a left click watches the teammate before, a right click the next (net/spectate.js)
  if (state === 'play' && P.bandT > 0 && (e.button === 0 || e.button === 2)) cancelBandage();   // a click stops a bandage
  if (e.button === 0) mouseDown = true; if (e.button === 2) { mouseDownR = true; aimHeld = true; if (state === 'play') startAim(); } });   // scoped rifles aim down the sights too, just zoomed further (scopeAim)
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) { mouseDownR = false; aimHeld = false; exitScope(); aiming = false; } });
