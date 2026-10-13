// Aiming down the sights, scopes, zoom wheel.

// ---- scope: hold right click with a scoped rifle ----
let scoped = false, zoomBeforeScope = 1;
const scopePt = new V3();
function hasScope() { const id = curId(), D = id && W(id); return !!D && !D.melee && !usingTouch && (id === 'hunting' || ((D.slot === 'long' || D.slot === 'auto') && T('sight') >= 3)); }
function enterScope() {
  if (scoped || P.vault || state !== 'play') return;
  scoped = true; zoomBeforeScope = zoomT; zoomT = curId() === 'hunting' && hasMod('hpscope') ? 3.1 : 2.4;
  scopePt.set(aimPt.x, GUN_Y, aimPt.z);
  $('scope').classList.add('on'); SFX.click(); nz(0.12, 'bandpass', 900, 400, 0.15, 2);
}
// ---- aiming down the sights: hold right click on any gun; with a scope the view zooms in further, no overlay ----
let aiming = false, aimHeld = false;   // aimHeld: the aim button is down, so anything that drops you out of the sights can put you back
const scopeAim = () => aiming && hasScope();
function startAim() { const D = W(curId()); if (!D || D.melee || P.vault || state !== 'play' || P.dead) return; if (!aiming) { aiming = true; nz(0.06, 'bandpass', 1200, 700, 0.08, 2); } }
function exitScope() { aiming = false; if (!scoped) return; scoped = false; zoomT = zoomBeforeScope; $('scope').classList.remove('on'); }
function moveScope(dx, dy) {
  const wpp = (2 * VIEW / zoom) / innerHeight, sens = 0.85;
  scopePt.x += (RIGHT.x * dx - FWD.x * dy / Math.sin(EL)) * wpp * sens;
  scopePt.z += (RIGHT.z * dx - FWD.z * dy / Math.sin(EL)) * wpp * sens;
  const vx = scopePt.x - P.x, vz = scopePt.z - P.z, d = Math.hypot(vx, vz), max = 24;
  if (d > max) { scopePt.x = P.x + vx / d * max; scopePt.z = P.z + vz / d * max; }
}
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); zoomT = clamp(zoomT * Math.exp(-e.deltaY * 0.0012), 0.6, 1.8); }, { passive: false });
