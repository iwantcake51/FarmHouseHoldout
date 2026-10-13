// Per-frame drawing: runs each system's visual update in order.

// Everything drawn each frame, after the simulation. Each part lives with the system it draws.
function visuals(dt, rdt) {
  const D = W(curId()) || W('pistol');
  updatePlayerVisuals(dt, rdt);
  updateCamera(rdt);
  updateDayNight(rdt); updateDarkEyes(dt);
  updateLightmap(rdt);
  updateZombieVisuals(dt, rdt); updateEyes(dt);
  updateCutaway(rdt);
  updateLaser(D);
  stepTracers(rdt); stepSmoke(dt); stepTrails(dt); stepTrail(rdt); stepCasings(dt);
  stepParticles(dt); stepFx(dt);
  stepFloats(rdt);
  updateHUD(rdt, D);
  updateCrosshair(rdt, D);
  tickMessages(rdt);
}
