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
function loop(now) {
  const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (document.visibilityState === 'visible') adaptResolution(rdt);
  let simDt = 0;
  if (state === 'play' || (state === 'dead' && P.dead)) {
    if (P.dead) tickDeath(rdt);
    if (hitStop > 0) hitStop -= rdt;
    else { simDt = rdt * timeScale; if (simDt > 0) update(simDt); }
    if (P.dead) { /* tickDeath owns the time scale */ }
    else if (slowIn > 0) { slowIn -= rdt; timeScale += (slowTo - timeScale) * Math.min(1, rdt * 9); }
    else if (slowHold > 0) { slowHold -= rdt; timeScale += (slowTo - timeScale) * Math.min(1, rdt * 9); }
    else timeScale += (1 - timeScale) * Math.min(1, rdt * 0.95);
  }
  visuals(state === 'play' || state === 'dead' ? simDt : state === 'title' || state === 'leaving' ? rdt : 0, rdt);
  R.render(scene, cam);
  requestAnimationFrame(loop);
}
last = performance.now();
computeFlow();
requestAnimationFrame(loop);
