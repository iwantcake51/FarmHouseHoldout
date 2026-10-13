// Random helpers, clamping, angle maths, the shared DOM cache and the map size.

const rand = Math.random, rr = (a, b) => a + rand() * (b - a), pick = a => a[(rand() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const cache = {};
let last = 0;
const N = 44, HALF = N / 2;
const mix = (a, b, t) => a + (b - a) * t;
const lerpPose = (a, b, t, out) => { for (const k in b) out[k] = a[k] + (b[k] - a[k]) * t; return out; };
const _pose = {};
const smooth = t => t * t * (3 - 2 * t);
