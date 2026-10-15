// Random helpers, clamping, angle maths, the shared DOM cache and the map size.

// rand is Math.random, unless withSeed has swapped in a seeded one for a moment: in co-op every player's game builds the
// same zombie from the host's seed (net/sync.js), so they look and come in alike on every screen
let _rng = Math.random;
const rand = () => _rng(), rr = (a, b) => a + rand() * (b - a), pick = a => a[(rand() * a.length) | 0];
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function withSeed(seed, fn) { const o = _rng; _rng = seeded(seed); try { return fn(); } finally { _rng = o; } }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const cache = {};
let last = 0;
const N = 44, HALF = N / 2;
const mix = (a, b, t) => a + (b - a) * t;
const lerpPose = (a, b, t, out) => { for (const k in b) out[k] = a[k] + (b[k] - a[k]) * t; return out; };
const _pose = {};
const smooth = t => t * t * (3 - 2 * t);
