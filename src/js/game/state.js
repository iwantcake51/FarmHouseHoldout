// Game state shared by every system: screen state, wave phase, timers, camera kick, time of day.

import { curId } from './run-state.js';

export let state = 'title', phase = 'break';
export let camRoll = 0, slowHold = 0, slowIn = 0, slowTo = 1, camPunch = 0;   // camPunch: a heavy hit's jolt of zoom in (melee/melee.js), easing straight back out
export const camKick = { x: 0, z: 0 };
export let breakT = 0, clearT = 0, spawnQ = [], spawnT = 0, flowT = 0, boardT = 0, groanT = 3, shake = 0, hurtFx = 0, bloom = 0, gunGlow = 0, gunGlowId = null, lmT = 0;   // gunGlow: the pale pulse on a gun you just got or changed (gunGlowId), only on that one (player/animation.js)
export let tod = 15;
// the world's own clock for ambient motion (wind, the wind's sound, fireflies, mist, fog, flicker): it slows with any
// slow motion, stops when the world freezes, and stands still while paused
export let worldT = 0, worldK = 1;
// light up the gun you just got or changed, and only that one (default: the one in your hands)
export function glowGun(id) { gunGlow = 1; gunGlowId = id || curId(); }

// setters for the variables above that other files change (an imported variable can only be read)
export function setStateRaw(v) { return (state = v); }
export function setPhase(v) { return (phase = v); }
export function setCamRoll(v) { return (camRoll = v); }
export function setSlowHold(v) { return (slowHold = v); }
export function setSlowIn(v) { return (slowIn = v); }
export function setSlowTo(v) { return (slowTo = v); }
export function setCamPunch(v) { return (camPunch = v); }
export function setBreakT(v) { return (breakT = v); }
export function setClearT(v) { return (clearT = v); }
export function setSpawnQ(v) { return (spawnQ = v); }
export function setSpawnT(v) { return (spawnT = v); }
export function setFlowT(v) { return (flowT = v); }
export function setBoardT(v) { return (boardT = v); }
export function setGroanT(v) { return (groanT = v); }
export function setShake(v) { return (shake = v); }
export function setHurtFx(v) { return (hurtFx = v); }
export function setBloom(v) { return (bloom = v); }
export function setGunGlow(v) { return (gunGlow = v); }
export function setGunGlowId(v) { return (gunGlowId = v); }
export function setLmT(v) { return (lmT = v); }
export function setTod(v) { return (tod = v); }
export function setWorldT(v) { return (worldT = v); }
export function setWorldK(v) { return (worldK = v); }
