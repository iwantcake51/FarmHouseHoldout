// Set up the first run so the title screen has a character to show.

import { freshRun } from './run-state.js';
import { buildGuns } from '../weapons/build-weapons.js';

freshRun();
buildGuns();
