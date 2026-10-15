// Game state shared by every system: screen state, wave phase, timers, camera kick, time of day.

let state = 'title', phase = 'break';
let camRoll = 0, slowHold = 0, slowIn = 0, slowTo = 1, camPunch = 0;   // camPunch: a heavy hit's jolt of zoom in (melee/melee.js), easing straight back out
const camKick = { x: 0, z: 0 };
let breakT = 0, clearT = 0, spawnQ = [], spawnT = 0, flowT = 0, boardT = 0, groanT = 3, shake = 0, hurtFx = 0, bloom = 0, gunGlow = 0, lmT = 0;
let tod = 15;
// the world's own clock for ambient motion (wind, fireflies, mist, flicker): it slows with the death slow-mo and stops
// when the world freezes, and stands still while paused
let worldT = 0, worldK = 1;
