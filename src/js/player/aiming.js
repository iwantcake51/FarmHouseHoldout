// Aiming down the sights, scopes, zoom wheel.

import { $ } from '../core/dom.js';
import { cv, EL, FWD, GUN_Y, RIGHT, setZoomT, V3, VIEW, zoom, ZOOM_MAX, ZOOM_MIN, zoomT } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { P } from './player.js';
import { curId, SCOPE_GUNS, SCOPES, T, W } from '../game/run-state.js';
import { nz } from '../audio/audio.js';
import { SFX } from '../audio/sfx.js';
import { state } from '../game/state.js';
import { aimPt } from '../input/keyboard-mouse.js';
import { usingTouch } from '../input/touch.js';

// ---- scope: hold right click with a scoped gun (the rifles, the revolver) ----
export let scoped = false, zoomBeforeScope = 1;
export const scopePt = new V3();
export function hasScope() { const id = curId(), D = id && W(id); return !!D && !D.melee && !usingTouch && SCOPE_GUNS.has(id) && T('sight') >= 3; }
function enterScope() {
  if (scoped || P.vault || state !== 'play') return;
  scoped = true; zoomBeforeScope = zoomT; setZoomT(SCOPES[T('sight')].zoom);
  scopePt.set(aimPt.x, GUN_Y, aimPt.z);
  $('scope').classList.add('on'); SFX.click(); nz(0.12, 'bandpass', 900, 400, 0.15, 2);
}
// ---- aiming down the sights: hold right click on any gun; with a scope the view zooms in further, no overlay ----
export let aiming = false, aimHeld = false;   // aimHeld: the aim button is down, so anything that drops you out of the sights can put you back
export const scopeAim = () => aiming && hasScope();
// two guns can't be aimed down the sights: the right button fires the right one instead (weapons/akimbo.js)
export function startAim() { const D = W(curId()); if (!D || D.melee || D.akimbo || P.vault || state !== 'play' || P.dead) return; if (!aiming) { aiming = true; nz(0.06, 'bandpass', 1200, 700, 0.08, 2); } }
export function exitScope() { aiming = false; if (!scoped) return; scoped = false; setZoomT(zoomBeforeScope); $('scope').classList.remove('on'); }
export function moveScope(dx, dy) {
  const wpp = (2 * VIEW / zoom) / innerHeight, sens = 0.85;
  scopePt.x += (RIGHT.x * dx - FWD.x * dy / Math.sin(EL)) * wpp * sens;
  scopePt.z += (RIGHT.z * dx - FWD.z * dy / Math.sin(EL)) * wpp * sens;
  const vx = scopePt.x - P.x, vz = scopePt.z - P.z, d = Math.hypot(vx, vz), max = 24;
  if (d > max) { scopePt.x = P.x + vx / d * max; scopePt.z = P.z + vz / d * max; }
}
cv.addEventListener('wheel', e => { e.preventDefault(); setZoomT(clamp(zoomT * Math.exp(-e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX)); }, { passive: false });

// setters for the variables above that other files change (an imported variable can only be read)
export function setAiming(v) { return (aiming = v); }
export function setAimHeld(v) { return (aimHeld = v); }
