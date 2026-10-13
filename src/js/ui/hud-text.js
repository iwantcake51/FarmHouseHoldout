// HUD text helpers, toasts, announcements, slots, the pickup feed and floating labels.

const setT = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
const setH = (id, v) => { if (cache['h' + id] !== v) { cache['h' + id] = v; $(id).innerHTML = v; } };
// counters that roll like the drums of a slot machine: every digit is a drum (a strip of 0-9) that spins to its new
// value, up when the number goes up and down when it goes down. A big jump (a reload, an ammo box) spins each drum a
// whole extra turn and they stop one after another, left to right. setRoll stands in for setT on a counter; digits in
// a bit of text roll the same way, and the rest of the text just changes
const ROLL_N = 50;   // five copies of 0-9: a drum rests in the middle copy, so it can spin a full turn either way
function rollDrum() {
  const c = document.createElement('span'); c.className = 'rc';
  c.innerHTML = '<span class="rp">0</span><span class="rs">' + Array.from({ length: ROLL_N }, (_, k) => `<span>${k % 10}</span>`).join('') + '</span>';
  c._s = c.lastChild; c._p = 20; c._end = 0; c._s.style.setProperty('--p', -20);
  return c;
}
function drumTo(c, d, dir, spins, dur, now) {
  // back to the middle copy while it's still, so the next spin has room
  if (now > c._end && Math.floor(c._p / 10) !== 2) { c._p = 20 + (c._p % 10); c._s.style.transition = 'none'; c._s.style.setProperty('--p', -c._p); void c._s.offsetWidth; }
  const cur = c._p % 10;
  let t = dir > 0 ? c._p + ((d - cur + 10) % 10) + 10 * spins : dir < 0 ? c._p - ((cur - d + 10) % 10) - 10 * spins : c._p + d - cur;
  if (t > ROLL_N - 1 || t < 0) t = 20 + d;   // ran off the strip in a long run of quick changes: settle in the middle copy
  if (t === c._p) return;
  c._p = t; c._end = now + dur * 1000 + 60;
  c._s.style.transition = dur ? `transform ${dur}s cubic-bezier(.2,.9,.3,1.08)` : 'none'; c._s.style.setProperty('--p', -t);
}
function rollNum(sp, v, prev, now) {
  const s = String(v), dir = Math.sign(v - prev), big = Math.abs(v - prev) >= 10, cols = sp._cols;
  while (cols.length > s.length) sp.removeChild(cols.shift());                                                          // fewer digits: the leading drums go
  let added = false;
  while (cols.length < s.length) { const c = rollDrum(); sp.insertBefore(c, sp.firstChild); cols.unshift(c); added = true; }   // more: new ones start at 0
  if (added && prev !== v) void sp.offsetWidth;   // laid out at 0 first, so they roll up from there instead of appearing
  for (let k = 0; k < s.length; k++) drumTo(cols[k], +s[k], dir, big && dir ? 1 : 0, prev === v ? 0 : big ? 0.42 + 0.12 * k : 0.18, now);
}
function rollText(el, text) {
  if (el._rt === text) return;
  el._rt = text;
  const now = performance.now(), parts = String(text).split(/(\d+)/), shape = parts.map((p, i) => i % 2 ? '#' : p).join('');
  const st = el._roll;
  if (st && st.shape === shape) { let j = 0; parts.forEach((p, i) => { if (i % 2) { const n = st.nums[j++], v = +p; rollNum(n.sp, v, n.v, now); n.v = v; } }); return; }
  el.textContent = ''; const nums = [];
  parts.forEach((p, i) => {
    if (i % 2) { const sp = document.createElement('span'); sp.className = 'rn'; sp._cols = []; el.appendChild(sp); rollNum(sp, +p, +p, now); nums.push({ sp, v: +p }); }
    else if (p) el.appendChild(document.createTextNode(p));
  });
  el._roll = { shape, nums };
}
const setRoll = (id, v) => rollText($(id), v);
const popEl = id => { const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
let toastT = 0, annT = 0;
// a notification card: an icon tile, a short title and an optional hint line, coloured by kind (bad, warn, info, good)
function toast(t, opt) {
  const o = opt || {}, el = $('toast');
  $('toastT').textContent = t; $('toastS').textContent = o.sub || ''; $('toastIc').innerHTML = FEED_ICON[o.icon] || FEED_ICON.gear;
  el.className = 'hud ' + (o.kind || 'info'); void el.offsetWidth; el.classList.add('show'); toastT = 2.6;
}
// the big centre-screen card: a small eyebrow, the headline, a rule that draws out from the middle, and a subtitle ribbon.
// kind '' is orange, 'gold' for a cleared wave, 'red' for brute nights
function announce(a, b, opt) {
  const o = opt || {}, el = $('announce');
  $('annEye').textContent = o.eye || ''; $('annBig').textContent = a; $('annSmall').textContent = b;
  el.className = 'hud' + (o.kind ? ' ' + o.kind : ''); void el.offsetWidth; el.classList.add('show');
  el.style.opacity = 1; annT = 2.8;
}
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
  if (toastT > 0) { toastT -= rdt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (annT > 0) { annT -= rdt; if (annT <= 0) { $('announce').style.opacity = 0; $('announce').classList.remove('show'); } }
}
