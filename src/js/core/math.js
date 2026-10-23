// Random helpers, clamping, angle maths, the shared DOM cache and the map size.

// rand is Math.random, unless withSeed has swapped in a seeded one for a moment: in co-op every player's game builds the
// same zombie from the host's seed (net/sync.js), so they look and come in alike on every screen
export let _rng = Math.random;
export const rand = () => _rng(), rr = (a, b) => a + rand() * (b - a), pick = a => a[(rand() * a.length) | 0];
export function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function withSeed(seed, fn) { const o = _rng; _rng = seeded(seed); try { return fn(); } finally { _rng = o; } }
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
export const cache = {};
export let last = 0;
export const N = 44, HALF = N / 2;
export const mix = (a, b, t) => a + (b - a) * t;
const lerpPose = (a, b, t, out) => { for (const k in b) out[k] = a[k] + (b[k] - a[k]) * t; return out; };
const _pose = {};
export const smooth = t => t * t * (3 - 2 * t);

// setters for the variables above that other files change (an imported variable can only be read)
export function setRng(v) { return (_rng = v); }
export function setLast(v) { return (last = v); }
