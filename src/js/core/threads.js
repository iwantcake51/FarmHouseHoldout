// The game's own worker threads: heavy work that needs nothing of the scene, done off the main thread so the frame
// never waits on it. A job is a self-contained function (it reads nothing outside itself: its source is all a worker
// gets) registered once by name (threadJob) and run with its data (threadRun), handing back a promise of what it made.
// Data is copied in; whatever the job lists as transfer (a buffer, an ImageBitmap) comes back moved, not copied.
// A small pool of workers (one fewer than the machine has cores, two to four), started the first time one's wanted,
// each with every job in it; jobs go to whichever has the fewest waiting. Where there are no workers (or they can't
// start: a page's security settings, an old browser), or a worker fails, the same function runs here on the main
// thread instead, so nothing's ever lost, only slower.
// Each job function takes its data and returns { out, transfer } (or a promise of it). It may draw on a canvas: thMk
// makes one the same in a worker as here (an OffscreenCanvas where there is one, else a page canvas).
//  - world/arena-dress.js: each map's floor wear painted ('floor')
//  - ui/melee-art.js: every weapon picture's shading, inked lines, gold parts and PNG ('art')

const TH_JOBS = new Map();
const TH = { pool: null, dead: false, n: 0, wait: new Map() };
export function threadJob(name, fn) { TH_JOBS.set(name, fn); }
// how many workers: one fewer than the cores, two to four
const thSize = () => Math.max(2, Math.min(4, ((globalThis.navigator && navigator.hardwareConcurrency) || 3) - 1));
function thStart() {
  if (TH.pool || TH.dead) return TH.pool;
  try {
    if (!globalThis.Worker || !globalThis.Blob || !globalThis.URL) throw new Error('no workers');
    const jobs = [...TH_JOBS].map(([k, f]) => JSON.stringify(k) + ': ' + f.toString()).join(',\n');
    const src = `const J = {\n${jobs}\n};\nonmessage = async e => { const m = e.data; try { const r = await J[m.job](m.d); postMessage({ id: m.id, ok: 1, out: r.out }, r.transfer || []); } catch (err) { postMessage({ id: m.id, ok: 0, err: String((err && err.message) || err) }); } };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    TH.pool = [];
    for (let k = 0; k < thSize(); k++) {
      const w = new globalThis.Worker(url), slot = { w, busy: 0 };
      w.onmessage = e => { const m = e.data, j = TH.wait.get(m.id); if (!j) return; TH.wait.delete(m.id); slot.busy--; if (m.ok) j.ok(m.out); else thHere(j); };
      w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); thDie(); };
      TH.pool.push(slot);
    }
  } catch (e) { TH.pool = null; TH.dead = true; }
  return TH.pool;
}
// a worker gone wrong: the pool's given up on, and everything waiting on it done here instead
function thDie() {
  TH.dead = true; if (TH.pool) TH.pool.forEach(s => { try { s.w.terminate(); } catch (e) { /* gone already */ } }); TH.pool = null;
  const left = [...TH.wait.values()]; TH.wait.clear(); left.forEach(thHere);
}
// a job run here, on the main thread (no workers, or theirs failed; one whose data was moved over to a worker that then
// failed can't be, and is turned down, for its caller to do another way)
function thHere(j) { if (j.moved) { j.no(new Error('thread failed')); return; } Promise.resolve().then(() => TH_JOBS.get(j.job)(j.d)).then(r => j.ok(r.out), j.no); }
export function threadRun(job, d, transfer) {
  return new Promise((ok, no) => {
    const j = { job, d, ok, no }, pool = thStart();
    if (!pool) { thHere(j); return; }
    const id = ++TH.n, slot = pool.reduce((a, s) => s.busy < a.busy ? s : a, pool[0]);
    TH.wait.set(id, j); slot.busy++;
    // (what it's given moved over where it can be, not copied)
    try { slot.w.postMessage({ id, job, d }, transfer || []); j.moved = !!(transfer && transfer.length); } catch (e) { TH.wait.delete(id); slot.busy--; thHere(j); }
  });
}
// whether jobs really go to other threads (not done here for want of workers)
export const threadsOn = () => !!thStart();
