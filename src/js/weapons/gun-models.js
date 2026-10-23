// Every gun's model builder, put together from the families (weapons/models-*.js), and what they share: the bolt
// knob, the revolver's cylinder and the shells' colours. The part builders are in weapons/gun-parts.js.

import { roundOn } from './rounds.js';
import { GM } from './gun-materials.js';
import { PISTOL_MODELS } from './models-pistols.js';
import { SHOTGUN_MODELS } from './models-shotguns.js';
import { RIFLE_MODELS } from './models-rifles.js';
import { SMG_MODELS } from './models-smgs.js';

// the right fist; melee models are built handle-down along +y
// where the hunting rifle's bolt knob sits on its bolt (the firing hand works the bolt by it in player/hold.js)
export const BOLT_KNOB = [-0.054, -0.046, -0.008];
// the revolver's cylinder: its axis height, radius and the circle its chambers sit on (the speed loader matches it,
// player/hold.js)
export const REV_CYL = { y: 1.1415, r: 0.0245, ch: 0.0137 };
// the revolver's optic rail: from just ahead of the hammer (where the rear sight was) forward along the barrel, stopping
// short of the front sight on a short barrel
export const REV_RAIL = { z0: 0.55, z1: 0.8 };
export const SHELL_MAT = { fire: GM.shellO, slug: GM.shellB, flech: GM.shellW };
export const shellMat = id => SHELL_MAT[roundOn(id)] || GM.shell;
// every gun's model, by family (weapons/models-*.js)
export const GUN_MODELS = { ...PISTOL_MODELS, ...SHOTGUN_MODELS, ...RIFLE_MODELS, ...SMG_MODELS };
