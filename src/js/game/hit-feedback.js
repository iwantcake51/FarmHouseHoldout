// Hit-stop and time scale.

export let timeScale = 1;
// a hit-stop: the world all but held still for a few hundredths of a second as a kill lands hard (zombies/damage.js),
// then straight back, where slow motion eases in and out. HS.k of the speed for HS.t seconds of real time (game/loop.js);
// never in co-op, where the farm's clock is everyone's
const HS = { t: 0, k: 0.05 };
export function hitStop(t) { HS.t = Math.max(HS.t, t); }
export const hitStopK = () => (HS.t > 0 ? HS.k : 1);
export function stepHitStop(rdt) { if (HS.t > 0) HS.t = Math.max(0, HS.t - rdt); }

// setters for the variables above that other files change (an imported variable can only be read)
export function setTimeScale(v) { return (timeScale = v); }
