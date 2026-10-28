// The start of a run: the view glides down from the title shot onto the survivor, who gets up off one knee,
// shakes it off and looks around, while the screen lifts out of the dark and the HUD slides in piece by piece.

import { setZoom, zoomT } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { P } from '../player/player.js';
import { groundDust } from '../effects/puffs.js';
import { footstep } from '../audio/footsteps.js';
import { phase, state } from './state.js';
import { announce } from '../ui/hud-text.js';
import { camTarget, TITLE_ZOOM } from './camera.js';
import { ANIM } from '../player/animation.js';

export const INTRO = { t: -1, cam: 2.1, rise: [0.5, 1.35], look: [1.5, 2.7], fx: 0, fz: 0, z0: 0.5, zs: 0.5, zt: 1, soft: false, told: false, stood: false };   // t < 0: not running
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// soft: straight off the title, the glide starts from the title shot itself (same spot, same zoom, no tilt) and
// there's no dark veil to come out of; otherwise it starts pulled well back under the veil, so the jump never shows
export function startIntro(soft) {
  Object.assign(INTRO, { t: 0, fx: camTarget.x, fz: camTarget.z, told: false, stood: false, soft: !!soft, zs: soft ? TITLE_ZOOM : INTRO.z0, zt: zoomT });
  setZoom(INTRO.zs);
  document.body.classList.toggle('introSoft', !!soft);
  document.body.classList.remove('intro'); void document.body.offsetWidth; document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 3400);
}
// the clock, run once a frame from updateCamera while playing (so a pause holds it)
export function tickIntro(rdt) {
  if (INTRO.t < 0) return;
  INTRO.t += rdt;
  if (!INTRO.told && INTRO.t > 0.95) { INTRO.told = true; if (phase === 'break') announce('Night 1', 'Board up the windows', { eye: 'Kessler Farm' }); }   // (not over the wave's own banner, if it's been started straight away)
  if (INTRO.t > INTRO.look[1]) INTRO.t = -1;
}
export const introCamOn = () => INTRO.t >= 0 && INTRO.t < INTRO.cam;
// how much the title's look (its dusk light, motes and mist) still holds: all of it on the title, easing off over the
// glide when a run starts straight from it, so the light comes round to the afternoon instead of snapping
export function titleBlend() { return state === 'title' ? 1 : INTRO.soft && introCamOn() ? 1 - easeIO(clamp(INTRO.t / INTRO.cam, 0, 1)) : 0; }
// a slight tilt that levels out as the camera arrives (off the title it leans in and back out, so it never jumps)
export const introRoll = () => !introCamOn() ? 0 : INTRO.soft ? 0.05 * Math.sin(Math.PI * clamp(INTRO.t / INTRO.cam, 0, 1)) * (1 - clamp(INTRO.t / INTRO.cam, 0, 1)) : 0.07 * Math.pow(1 - clamp(INTRO.t / INTRO.cam, 0, 1), 2);
// gx, gz is where the camera would normally follow to; by the end of the glide the two meet, so it hands over seamlessly.
// The glide closes in on the zoom you'll play at (the closest, unless you zoom during it): that target eases toward what
// you pick (INTRO.zt) just as the zoom does once you're playing, so zooming mid-glide never jumps
export function introCam(gx, gz, rdt) {
  const e = easeIO(clamp(INTRO.t / INTRO.cam, 0, 1));
  camTarget.x = INTRO.fx + (gx - INTRO.fx) * e; camTarget.z = INTRO.fz + (gz - INTRO.fz) * e;
  INTRO.zt += (zoomT - INTRO.zt) * Math.min(1, rdt * 10);
  setZoom(INTRO.zs + (INTRO.zt - INTRO.zs) * e);
}
// how far down on one knee you still are (1 kneeling .. 0 standing); walking off hurries you up
export function introKneel(spd) {
  if (INTRO.t < 0) return 0;
  const [a, b] = INTRO.rise;
  if (spd > 0.3 && INTRO.t < a) INTRO.t = a + (INTRO.t - a) * 0.3 + 0.0001;
  const k = INTRO.t < a ? 1 : 1 - easeIO(clamp((INTRO.t - a) / (b - a), 0, 1));
  if (!INTRO.stood && k < 0.15) { INTRO.stood = true; groundDust(P.x, P.z, 0.3, 0, 0); footstep('land', 0.6); }
  return k;
}
// kneeling pose on top of the normal one: hips down, one knee forward, the other leg back, leaning over the front knee
export function introPose(pm, up, k) {
  if (k <= 0) return;
  pm.g.position.y -= 0.3 * k;
  pm.legL.rotation.x = pm.legL.rotation.x * (1 - k) - 1.15 * k; pm.legR.rotation.x = pm.legR.rotation.x * (1 - k) + 1.0 * k;
  up.x += 0.42 * k; up.z += 0.05 * k;
  ANIM.sw = Math.max(ANIM.sw, k);   // the weapon hangs low until you're up
}
// once up, a slow look to one side and the other
export function introLook(pm) {
  if (INTRO.t < 0) return;
  const [a, b] = INTRO.look, u = (INTRO.t - a) / (b - a);
  if (u > 0 && u < 1) { pm.head.rotation.y += Math.sin(u * Math.PI * 2) * 0.38 * (1 - u); pm.head.rotation.x += Math.sin(u * Math.PI) * 0.06; }
}
