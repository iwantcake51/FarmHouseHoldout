// DOM shortcut and the three.js availability check.

export const $ = id => document.getElementById(id);
if (!window.THREE) { $('title').querySelector('p').textContent = 'The 3D engine could not load. Check your connection and reload the page.'; throw new Error('three.js did not load'); }   // (and the game goes no further)
// colours are used as written, with no conversion between sRGB and linear on the way in or out (three.js converts them
// by default since r152): every colour, light and shader in the game was tuned that way. It has to be set before the
// first THREE.Color is made
THREE.ColorManagement.enabled = false;
// a scrolling list that eases to where the wheel sends it instead of jumping a notch at a time (it follows a point
// that each notch moves on, closing on it quickly and settling); a touchpad's own fine scrolling is already smooth,
// so it's left alone, and a drag of the scrollbar takes over at once
const swOn = new WeakSet();
export function smoothWheel(el) {
  if (swOn.has(el)) return; swOn.add(el);
  let to = null, pos = 0, last = 0, raf = 0;
  const step = now => {
    const dt = last ? Math.min(0.05, Math.max(0, now - last) / 1000) : 1 / 60; last = now;   // a frame's time can be from before the wheel event
    if (to === null || Math.abs(el.scrollTop - Math.round(pos)) > 2) { to = null; raf = 0; return; }   // something else moved it
    pos += (to - pos) * (1 - Math.exp(-dt * 16));
    if (Math.abs(to - pos) < 0.5) pos = to;
    el.scrollTop = pos;
    if (pos === to) { to = null; raf = 0; } else raf = requestAnimationFrame(step);
  };
  el.addEventListener('wheel', e => {
    if (e.ctrlKey || !e.deltaY) return;
    const px = e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? el.clientHeight * 0.9 : 1);
    if (e.deltaMode === 0 && Math.abs(px) < 40) { to = null; return; }
    const max = el.scrollHeight - el.clientHeight; if (max <= 0) return;
    e.preventDefault();
    if (to === null) pos = el.scrollTop;
    to = Math.max(0, Math.min(max, (to === null ? el.scrollTop : to) + px));
    if (!raf) { last = 0; raf = requestAnimationFrame(step); }
  }, { passive: false });
}
// and every other list in the menus that scrolls glides the same way: the nearest one under the pointer that can
// scroll is set up the first time the wheel turns over it (in time for that very turn: it's caught on the way down)
addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (swOn.has(el)) return;
    if (el.scrollHeight > el.clientHeight + 1) { const oy = getComputedStyle(el).overflowY; if (oy === 'auto' || oy === 'scroll') { smoothWheel(el); return; } }
  }
}, { capture: true, passive: true });
