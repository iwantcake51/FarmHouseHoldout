// Adaptive resolution and the main loop.

// adaptive resolution: if frames keep running long, render fewer pixels; give them back when there's headroom
let frameAvg = 1 / 60, scaleT = 0;
function adaptResolution(rdt) {
  frameAvg += (rdt - frameAvg) * 0.05; scaleT += rdt;
  if (scaleT < 2) return;
  let next = renderScale;
  if (frameAvg > 1 / 45 && renderScale > 1) next = Math.max(1, renderScale - 0.25);
  else if (frameAvg < 1 / 57 && renderScale < DPR) next = Math.min(DPR, renderScale + 0.25);
  if (next !== renderScale) { renderScale = next; R.setPixelRatio(renderScale); resize(); scaleT = 0; }
}
// the next frame's asked for first, and anything that goes wrong in this one is caught (and told once, in the console),
// so one bad frame can never stop the game dead
const frameErrs = new Set();
function loop(now) {
  requestAnimationFrame(loop);
  try { frame(now); } catch (e) { const k = String(e && e.message); if (!frameErrs.has(k)) { frameErrs.add(k); console.error('frame error:', e); } }
}
function frame(now) {
  const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (document.visibilityState === 'visible') adaptResolution(rdt);
  let simDt = 0;
  const coop = netLink() && state === 'paused';   // (co-op: the farm doesn't stop while you're paused)
  if (state === 'play' || (state === 'dead' && P.dead) || coop) {
    if (P.dead) tickDeath(rdt);
    simDt = rdt * timeScale; if (simDt > 0) update(simDt);
    if (P.dead) { /* tickDeath owns the time scale */ }
    else if (slowIn > 0) { slowIn -= rdt; timeScale += (slowTo - timeScale) * Math.min(1, rdt * 9); }
    else if (slowHold > 0) { slowHold -= rdt; timeScale += (slowTo - timeScale) * Math.min(1, rdt * 9); }
    else timeScale += (1 - timeScale) * Math.min(1, rdt * 0.95);
  }
  // the world's clock (game/state.js) runs with the game's: slowed with any slow motion (bullet time, a heavy hit, the
  // death slow-mo, which runs on down to a stop), stopped while paused (in co-op the farm keeps going)
  worldK = state === 'title' || state === 'leaving' ? 1 : state === 'play' || state === 'dead' ? (netLink() ? 1 : clamp(timeScale, 0, 1)) : coop ? 1 : 0;
  worldT += rdt * worldK;
  netTick(rdt);   // co-op: your pose out, theirs in, the host's farm to the others (net/)
  visuals(state === 'play' || state === 'dead' || coop ? simDt : state === 'title' || state === 'leaving' ? rdt : 0, rdt);
  R.render(scene, cam);
  outlinePass(cam);   // the outlines round whole models, over the frame (effects/outlines.js)
  flushModels();   // (old weapon models let go of once nothing draws them: binModel, core/geometry.js)
}
last = performance.now();
computeFlow();
requestAnimationFrame(loop);
