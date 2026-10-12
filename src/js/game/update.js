// The simulation step that runs every system in order.

// One simulation step. Each system has its own function in its own folder; this just runs them in order.
function update(dt) {
  run.time += dt;
  tod = (tod + dt / 12) % 24;
  updatePlayer(dt);
  updateCombat(dt);
  updateInteractions(dt);
  if (updateWaves(dt)) return;   // wave cleared: the upgrade screen takes over
  updateSupplyDrop(dt);
  updateGrenades(dt);
  updateZombies(dt);
  updatePickups(dt);
}
