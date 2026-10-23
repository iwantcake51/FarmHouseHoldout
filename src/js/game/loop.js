// Adaptive resolution and the main loop.

import { cam, DPR, R, renderScale, resize, scene, setRenderScale } from '../core/renderer.js';
import { clamp, last, setLast } from '../core/math.js';
import { olWarm, outlinePass } from '../effects/screen-outlines.js';
import { fadeDepthMat } from '../effects/outlines.js';
import { POST, postTargets, PS_RT, renderFrame } from '../effects/post.js';
import { netLink } from '../net/net.js';
import { flushModels } from '../core/geometry.js';
import { computeFlow } from '../zombies/pathfinding.js';
import { P } from '../player/player.js';
import { bmAgeScene, bmCam, bmScene, bmTarget } from '../effects/blood-map.js';
import { setTimeScale, timeScale } from './hit-feedback.js';
import { musicTick } from '../audio/music.js';
import {
  setSlowHold, setSlowIn, setWorldK, setWorldT, slowHold, slowIn, slowTo, state, worldK, worldT
} from './state.js';
import { tickDeath } from '../ui/screens.js';
import { update } from './update.js';
import { visuals } from './visuals.js';
import { netTick } from '../net/sync.js';
import { SET, tickFps } from '../ui/settings.js';

// adaptive resolution: if frames keep running long, render fewer pixels; give them back when there's headroom
let frameAvg = 1 / 60, scaleT = 0;
function adaptResolution(rdt) {
  frameAvg += (rdt - frameAvg) * 0.05; scaleT += rdt;
  if (scaleT < 2) return;
  // slow: the post-processing's occlusion steps down first (fewer samples, then none: effects/post.js), then the
  // resolution; with headroom the resolution comes back first, then the occlusion
  let next = renderScale;
  // (a resolution picked in the settings is left as it is: ui/settings.js)
  const autoRes = SET.res === 'auto';
  if (frameAvg > 1 / 45) { if (POST.ok && POST.q > 0) { POST.q--; scaleT = 0; return; } if (autoRes && renderScale > 1) next = Math.max(1, renderScale - 0.25); }
  else if (frameAvg < 1 / 57) { if (autoRes && renderScale < DPR) next = Math.min(DPR, renderScale + 0.25); else if (POST.ok && POST.q < 2 && scaleT > 6) { POST.q++; scaleT = 0; return; } }
  if (next !== renderScale) { setRenderScale(next); R.setPixelRatio(renderScale); resize(); scaleT = 0; }
}
// every shader the farm draws with, built ahead (warmShaders). three builds one the first time something using it is
// drawn, and that frame stalls while it does (for a long moment on some machines), so the first muzzle flash, the first
// blood on the ground, the first outline round a window, your own x-ray rim each hitched the early waves. They're all
// built here instead: everything in the farm, shown or not, on the target it's drawn to, and the blood map's and the
// outlines' own. Once the title's settled (WARM_AT frames in), and again as a run starts (what it's made new), behind
// the fade in (warmQ: newRun, ui/screens.js)
const WARM_AT = 20;
export let warmQ = false, warmN = 0;
// and the shadows' own: the plain one (a drop on the ground's) and the one a zombie's fades with (effects/outlines.js:
// fadeDepthMat), which would otherwise first be built mid-wave. Two specks far under the ground cast them always, every
// frame, so they're built as the shadow map is really drawn (three keys a shadow's shader to the frame's lights as well)
const WARM_CASTERS = [null, fadeDepthMat()].map(dm => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshLambertMaterial({ colorWrite: false, depthWrite: false })); m.position.set(0, -40, 0); m.castShadow = true; m.frustumCulled = false; if (dm) m.customDepthMaterial = dm; scene.add(m); return m; });
function warmShaders() {
  const prev = R.getRenderTarget();
  try {
    if (POST.ok) { postTargets(); R.setRenderTarget(PS_RT.sc); } else R.setRenderTarget(null);
    R.compile(scene, cam);
    R.setRenderTarget(bmTarget); R.compile(bmScene, bmCam); R.compile(bmAgeScene, bmCam);   // (effects/blood-map.js)
    olWarm();   // (effects/screen-outlines.js)
  } catch (e) { console.warn('shader warm-up:', e); }
  R.setRenderTarget(prev);
}
// the next frame's asked for first, and anything that goes wrong in this one is caught (and told once, in the console),
// so one bad frame can never stop the game dead
const frameErrs = new Set();
function loop(now) {
  requestAnimationFrame(loop);
  try { frame(now); } catch (e) { const k = String(e && e.message); if (!frameErrs.has(k)) { frameErrs.add(k); console.error('frame error:', e); } }
}
function frame(now) {
  const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); setLast(now);
  if (document.visibilityState === 'visible') adaptResolution(rdt);
  tickFps(rdt);   // (the settings' frame-rate counter: ui/settings.js)
  musicTick();   // (the menus' piano: audio/music.js)
  let simDt = 0;
  const coop = netLink() && state === 'paused';   // (co-op: the farm doesn't stop while you're paused)
  if (state === 'play' || (state === 'dead' && P.dead) || coop) {
    if (P.dead) tickDeath(rdt);
    simDt = rdt * timeScale; if (simDt > 0) update(simDt);
    if (P.dead) { /* tickDeath owns the time scale */ }
    else if (slowIn > 0) { setSlowIn(slowIn - rdt); setTimeScale(timeScale + ((slowTo - timeScale) * Math.min(1, rdt * 9))); }
    else if (slowHold > 0) { setSlowHold(slowHold - rdt); setTimeScale(timeScale + ((slowTo - timeScale) * Math.min(1, rdt * 9))); }
    else setTimeScale(timeScale + ((1 - timeScale) * Math.min(1, rdt * 0.95)));
  }
  // the world's clock (game/state.js) runs with the game's: slowed with any slow motion (bullet time, a heavy hit, the
  // death slow-mo, which runs on down to a stop), stopped while paused (in co-op the farm keeps going)
  setWorldK(state === 'title' || state === 'leaving' ? 1 : state === 'play' || state === 'dead' ? (netLink() ? 1 : clamp(timeScale, 0, 1)) : coop ? 1 : 0);
  setWorldT(worldT + (rdt * worldK));
  netTick(rdt);   // co-op: your pose out, theirs in, the host's farm to the others (net/)
  visuals(state === 'play' || state === 'dead' || coop ? simDt : state === 'title' || state === 'leaving' ? rdt : 0, rdt);
  if (warmQ || (state === 'title' && ++warmN === WARM_AT)) { warmQ = false; warmShaders(); }
  renderFrame();   // the farm, with its ambient occlusion and glow (effects/post.js)
  outlinePass(cam);   // the outlines round whole models, over the frame (effects/outlines.js)
  flushModels();   // (old weapon models let go of once nothing draws them: binModel, core/geometry.js)
}
setLast(performance.now());
computeFlow();
requestAnimationFrame(loop);

// setters for the variables above that other files change (an imported variable can only be read)
export function setWarmQ(v) { return (warmQ = v); }
