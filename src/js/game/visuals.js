// Per-frame drawing: runs each system's visual update in order.

// Everything drawn each frame, after the simulation. Each part lives with the system it draws.
function visuals(dt, rdt) {
  const D = W(curId()) || W('pistol');
  updatePlayerVisuals(dt, rdt);
  updateCamera(rdt);
  updateDayNight(rdt);
  updateLightmap(rdt);
  updateZombieVisuals(dt, rdt);
  updateCutaway(rdt);
  updateLaser(D);
  stepTracers(rdt); stepSmoke(dt); stepTrails(dt); stepTrail(rdt); stepCasings(dt);
  stepParticles(dt);
  stepFloats(rdt);
  updateHUD(rdt, D);
  updateCrosshair(rdt, D);
  tickMessages(rdt);
}
