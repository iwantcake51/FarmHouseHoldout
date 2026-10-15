// Hit-stop and time scale.

let timeScale = 1;
// hit-stop: a heavy blow landing holds the world all but still for a few frames (real seconds, hitStopT), the weapon
// stopped dead in what it hit, so the impact reads as weight before everything carries on
const HITSTOP_SCALE = 0.04;
let hitStopT = 0;
function hitStop(t) { hitStopT = Math.max(hitStopT, t); }
