// Per-frame drawing: runs each system's visual update in order.

// Everything drawn each frame, after the simulation. Each part lives with the system it draws.
function visuals(dt, rdt) {
  updatePlayerVisuals(dt, rdt);
  const D = W(curId()) || W('pistol');   // after the player's pose, which can take out a different weapon (a weapon key during a bandage)
  updateCamera(rdt);
  updateDayNight(rdt); updateDarkEyes(dt);
  updateLightmap(rdt);
  updateZombieVisuals(dt, rdt); updateEyes(dt);
  updateCutaway(rdt); updateHoles();
  updateLaser(D);
  stepTracers(rdt); stepSmoke(dt); stepTrails(dt); stepTrail(rdt); stepCasings(dt);
  stepParticles(dt); stepFx(dt);
  stepFloats(rdt);
  updateHUD(rdt, D); updateDropMarker();
  updateCrosshair(rdt, D);
  tickMessages(rdt);
}
