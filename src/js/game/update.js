// The simulation step that runs every system in order.

import { run } from './run-state.js';
import { updatePickups } from '../pickups/pickups.js';
import { updateGrenades } from '../weapons/explosives.js';
import { phase, setTod, tod } from './state.js';
import { updateWaves } from '../waves/waves.js';
import { runWatch } from '../ui/run-stats.js';
import { updatePlayer } from '../player/movement.js';
import { updateCombat } from '../weapons/combat-update.js';
import { updateInteractions } from '../barricades/interactions.js';
import { updateSupplyDrop } from '../stations/supply-drop.js';
import { updateZombies } from '../zombies/ai.js';
import { updateSpit } from '../zombies/spitter.js';
import { cheatIs, cheatTick } from '../ui/cheats.js';

// One simulation step. Each system has its own function in its own folder; this just runs them in order.
export function update(dt) {
  run.time += dt; cheatTick(); runWatch();   // (the end screen's tallies: ui/run-stats.js)   // the cheat menu's switches (ui/cheats.js)
  if (phase === 'wave' && !cheatIs('clock')) setTod((tod + dt / 12) % 24);   // the clock stands still between waves
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
