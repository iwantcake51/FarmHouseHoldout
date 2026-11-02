// Everything the farm put in the scene as it was built (the house, the yard, the fence, the stations, the ground and
// the woods round it): taken here, once the world's all built and before anything that comes and goes (the zombies,
// the particles, the survivors) is, so the arena (pvp/arena.js) can take the farm's own pieces away and put them back.

import { scene } from '../core/renderer.js';

export const FARM_ROOTS = scene.children.slice();
