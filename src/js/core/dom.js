// DOM shortcut and the three.js availability check.

const $ = id => document.getElementById(id);
if (!window.THREE) { $('title').querySelector('p').textContent = 'The 3D engine could not load. Check your connection and reload the page.'; return; }
// a scrolling list that eases to where the wheel sends it instead of jumping a notch at a time (it follows a point
// that each notch moves on, closing on it quickly and settling); a touchpad's own fine scrolling is already smooth,
// so it's left alone, and a drag of the scrollbar takes over at once
function smoothWheel(el) {
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
