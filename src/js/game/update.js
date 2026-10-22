// The simulation step that runs every system in order.

// One simulation step. Each system has its own function in its own folder; this just runs them in order.
function update(dt) {
  run.time += dt; cheatTick(); runWatch();   // (the end screen's tallies: ui/run-stats.js)   // the cheat menu's switches (ui/cheats.js)
  if (phase === 'wave' && !cheatIs('clock')) tod = (tod + dt / 12) % 24;   // the clock stands still between waves
  updatePlayer(dt);
  updateCombat(dt);
  updateInteractions(dt);
  if (updateWaves(dt)) return;   // wave cleared: the upgrade screen takes over
  updateSupplyDrop(dt);
  updateGrenades(dt);
  updateZombies(dt);
  updateSpit(dt);   // the spitters' acid in the air and on the ground (zombies/spitter.js)
  updatePickups(dt);
}
