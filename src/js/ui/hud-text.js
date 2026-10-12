// HUD text helpers, toasts, announcements, slots, the pickup feed and floating labels.

const setT = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
const setH = (id, v) => { if (cache['h' + id] !== v) { cache['h' + id] = v; $(id).innerHTML = v; } };
const popEl = id => { const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
let toastT = 0, annT = 0;
function toast(t) { $('toast').textContent = t; $('toast').style.opacity = 1; toastT = 2.4; }
function announce(a, b) { $('annBig').textContent = a; $('annSmall').textContent = b; $('announce').style.opacity = 1; annT = 2.6; }
function renderSlots() {
  const k = SLOTS.map(s => (W8.slot[s] || '-') + (W8.cur === s ? 'c' : '')).join();
  if (cache.slots === k) return; cache.slots = k;
  $('slots').innerHTML = SLOTS.map((s, i) => `<span class="${W8.cur === s ? 'on' : ''} ${W8.slot[s] ? '' : 'lock'}"><em>${i + 1}</em>${W8.slot[s] ? WEAP[W8.slot[s]].short : '—'}</span>`).join('');
}
// pickup feed: entries slide in, matching ones stack their amounts
const FEED_ICON = {
  scrap: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3.2"/>',
  planks: '<path d="M3 8l17-4 1 4-17 4zM3 15l17-4 1 4-17 4z"/>',
  ammo: '<path d="M7 21V10l2.5-6L12 10v11zM13 21V10l2.5-6L18 10v11z"/>',
  med: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  supply: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
  gear: '<path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z"/>'
};
const feedItems = [];
function feed(kind, amount, label) {
  const now = performance.now();
  const ex = feedItems.find(f => f.kind === kind && f.label === label && now - f.t < 2600 && amount);
  if (ex) { ex.amount += amount; ex.t = now; ex.el.querySelector('b').textContent = '+' + ex.amount; ex.el.classList.remove('bump'); void ex.el.offsetWidth; ex.el.classList.add('bump'); return; }
  const el = document.createElement('div'); el.className = 'fd ' + kind;
  el.innerHTML = `<svg viewBox="0 0 24 24">${FEED_ICON[kind] || FEED_ICON.gear}</svg>${amount ? '<b></b>' : ''}<span></span>`;
  if (amount) el.querySelector('b').textContent = '+' + amount;
  el.querySelector('span').textContent = label;
  $('feed').appendChild(el); feedItems.push({ kind, label, amount, t: now, el });
  while (feedItems.length > 5) { const f = feedItems.shift(); f.el.remove(); }
}
function tickFeed() {
  const now = performance.now();
  for (let k = feedItems.length - 1; k >= 0; k--) { const f = feedItems[k]; if (now - f.t > 3000 && !f.out) { f.out = true; f.el.classList.add('out'); } if (now - f.t > 3500) { f.el.remove(); feedItems.splice(k, 1); } }
}
const floats = [];
function floatText(x, z, text, color) {
  const el = document.createElement('div'); el.className = 'float'; el.textContent = text; if (color) el.style.color = color;
  document.body.appendChild(el); floats.push({ el, x, z, t: 0 });
}
// the little labels that float up when you grab a drop, and the pickup feed
function stepFloats(rdt) {
  // floating pickup labels
  for (let k = floats.length - 1; k >= 0; k--) {
    const f = floats[k]; f.t += rdt; projV.set(f.x, (f.y0 !== undefined ? f.y0 : 1.2) + f.t * (f.dmg ? 0.9 : 1.2), f.z).project(cam);
    const life = f.dmg ? 0.75 : 1;
    f.el.style.transform = `translate(${((projV.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - projV.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%,-50%) scale(${(1 + Math.max(0, 0.2 - f.t) * (f.dmg ? 3 : 2)).toFixed(2)})`;
    f.el.style.opacity = clamp((1.6 - f.t * 1.6 / life) * (f.dmg && P.dead ? 0 : 1), 0, 1);
    if (f.t > life) { f.el.remove(); floats.splice(k, 1); }
  }
  tickFeed();
}
// toast and wave announcement timers
function tickMessages(rdt) {
  if (toastT > 0) { toastT -= rdt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (annT > 0) { annT -= rdt; if (annT <= 0) $('announce').style.opacity = 0; }
}
