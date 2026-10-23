// Per-frame drawing: runs each system's visual update in order.

import { updateRackSide } from '../stations/armory.js';
import { curId, W } from './run-state.js';
import { stepCasings } from '../weapons/casings.js';
import { stepTrail } from '../melee/swing-trail.js';
import { stepSmoke } from '../effects/smoke.js';
import { stepTracers, stepTrails } from '../effects/tracers.js';
import { stepParticles } from '../effects/particles.js';
import { stepFx } from '../effects/puffs.js';
import { updateHoles } from '../effects/bullet-holes.js';
import { stepArmorBits } from '../zombies/armor-break.js';
import { stepBoards } from '../barricades/planks.js';
import { zoomEars } from '../audio/spatial.js';
import { stepFloats, tickMessages } from '../ui/hud-text.js';
import { updateLightmap } from '../lighting/lightmap.js';
import { updateDarkEyes, updateDayNight } from '../lighting/day-night.js';
import { updateLaser } from '../weapons/laser.js';
import { updateDropMarker } from '../stations/supply-drop.js';
import { updateCamera } from './camera.js';
import { updateCutaway } from '../world/cutaway.js';
import { updateCrosshair } from '../ui/crosshair.js';
import { updatePlayerVisuals } from '../player/animation.js';
import { updateEyes } from '../effects/eye-glow.js';
import { updateZombieVisuals } from '../zombies/zombie-visuals.js';
import { updateHUD } from '../ui/hud.js';
import { updateWeaponStats } from '../ui/weapon-stats.js';
import { updateLoadout } from '../ui/loadout.js';
import { updateBenchTips } from '../ui/bench-tips.js';
import { titleCrowd } from '../world/title-crowd.js';

// Everything drawn each frame, after the simulation. Each part lives with the system it draws.
export function visuals(dt, rdt) {
  titleCrowd(dt);   // (the title's yard: a few of them wandering about, the windows boarded: world/title-crowd.js)
  updatePlayerVisuals(dt, rdt);
  const D = W(curId()) || W('pistol');   // after the player's pose, which can take out a different weapon (a weapon key during a bandage)
  updateCamera(rdt);
  updateDayNight(rdt); updateDarkEyes(dt);
  updateLightmap(rdt);
  updateZombieVisuals(dt, rdt); updateEyes(dt);
  updateCutaway(rdt); updateHoles();
  updateLaser(D);
  stepTracers(rdt); stepSmoke(dt); stepTrails(dt); stepTrail(rdt); stepCasings(dt); stepBoards(dt, rdt);
  stepParticles(dt); stepFx(dt); stepArmorBits(dt);
  stepFloats(rdt);
  updateHUD(rdt, D); zoomEars(); updateDropMarker(); updateBenchTips(rdt); updateWeaponStats(); updateLoadout(); updateRackSide();
  updateCrosshair(rdt, D);
  tickMessages(rdt);
}
