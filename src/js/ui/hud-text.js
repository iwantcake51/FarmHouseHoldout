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
function rollNum(sp, v, prev, now, str, spin) {
  const s = str || String(v), dir = Math.sign(v - prev), big = spin || Math.abs(v - prev) >= 10, cols = sp._cols;
  while (cols.length > s.length) sp.removeChild(cols.shift());                                                          // fewer digits: the leading drums go
  let added = false;
  while (cols.length < s.length) { const c = rollDrum(); sp.insertBefore(c, sp.firstChild); cols.unshift(c); added = true; }   // more: new ones start at 0
  if (added && prev !== v) void sp.offsetWidth;   // laid out at 0 first, so they roll up from there instead of appearing
  for (let k = 0; k < s.length; k++) drumTo(cols[k], +s[k], dir, big && dir ? 1 : 0, prev === v ? 0 : big ? 0.42 + 0.12 * k : 0.18, now);
}
// spin: every change spins its drums a whole extra turn (the wave number), not just a big jump
function rollText(el, text, spin) {
  if (el._rt === text) return;
  el._rt = text;
  const now = performance.now(), parts = String(text).split(/(\d+)/), shape = parts.map((p, i) => i % 2 ? '#' : p).join('');
  const st = el._roll;
  if (st && st.shape === shape) { let j = 0; parts.forEach((p, i) => { if (i % 2) { const n = st.nums[j++], v = +p; rollNum(n.sp, v, n.v, now, p, spin); n.v = v; } }); return; }
  el.textContent = ''; const nums = [];
  parts.forEach((p, i) => {
    if (i % 2) { const sp = document.createElement('span'); sp.className = 'rn'; sp._cols = []; el.appendChild(sp); rollNum(sp, +p, +p, now, p); nums.push({ sp, v: +p }); }
    else if (p) el.appendChild(document.createTextNode(p));
  });
  el._roll = { shape, nums };
}
const setRoll = (id, v, spin) => rollText($(id), v, spin);
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
const FEED_ICON = { scrap: GI.scrap, planks: GI.planks, metal: GI.metal, ammo: GI.ammo, med: GI.med, supply: GI.supply, gear: GI.gear };   // (ui/game-icons.js)
const feedItems = [];
function feed(kind, amount, label) {
  const now = performance.now();
  const ex = feedItems.find(f => f.kind === kind && f.label === label && now - f.t < 2600 && amount);
  if (ex) { ex.amount += amount; ex.t = now; ex.el.querySelector('b').textContent = '+' + ex.amount; ex.el.classList.remove('bump'); void ex.el.offsetWidth; ex.el.classList.add('bump'); ex.el.classList.toggle('alt'); return; }   // (alt: its timer runs from full again)
  const el = document.createElement('div'); el.className = 'fd ' + kind;
  el.innerHTML = `<i class="fdI"><svg viewBox="${GI_VB}">${FEED_ICON[kind] || FEED_ICON.gear}</svg></i>${amount ? '<b></b>' : ''}<span></span>`;
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
// what you picked up, popping up off where it lay and easing up (FLOAT_UP): its kind's icon spinning in, glowing in the
// drop's colour, then how many in that colour and what, in small capitals underneath with a slash of colour under it
// (a weapon off the ground: just its name). kind is the feed's (FEED_ICON)
function floatText(x, z, text, color, kind) {
  const el = document.createElement('div'), m = /^\+(\d+)\s*(.*)$/.exec(text || '');
  el.className = 'float pick' + (m ? '' : ' named'); if (color) el.style.setProperty('--fc', color);
  el.innerHTML = `<i class="pkI"><svg viewBox="${GI_VB}">${FEED_ICON[kind] || FEED_ICON.gear}</svg></i><span class="pkT">${m ? '<b></b>' : ''}<em></em></span>`;
  if (m) el.querySelector('b').textContent = '+' + m[1];
  el.querySelector('em').textContent = m ? m[2] : text;
  document.body.appendChild(el); floats.push({ el, x, z, t: 0 });
}
// how the labels move. A damage number (FLOAT_DMG) bursts off the zombie on a little arc, flung up and out to one side
// (up, side: px a second at 1080 high) and falling back (grav), tipped as it pops in and leaning the way it's going
// (tilt, degrees), over life seconds, its last fade of it fading and shrinking away. A pickup's label (FLOAT_UP) rises
// rise metres, quick and then slowing, over its life, popping in and fading over its last fade
const FLOAT_DMG = { life: 0.95, up: [230, 300], side: [35, 95], grav: 720, tilt: 14, pop: 0.16, fade: 0.38 };
const FLOAT_UP = { life: 1.15, rise: 1.1, pop: 0.22, fade: 0.32 };
const floatBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // (overshoots, then settles)
// the little labels that float up when you grab a drop, the damage numbers, and the pickup feed
function stepFloats(rdt) {
  const px = innerHeight / 1080;
  for (let k = floats.length - 1; k >= 0; k--) {
    const f = floats[k]; f.t += rdt;
    let ox = 0, oy = 0, sc = 1, rot = 0, op = 1;
    if (f.dmg) {
      const D = FLOAT_DMG, t = f.t, u = t / D.life;
      if (f.vx === undefined) { f.vx = rr(...D.side) * (rand() < 0.5 ? -1 : 1); f.vy = rr(...D.up); f.r0 = rr(-D.tilt, D.tilt); }
      ox = f.vx * t * px; oy = -(f.vy * t - 0.5 * D.grav * t * t) * px;
      sc = t < D.pop ? 0.35 + 0.65 * floatBack(t / D.pop) : 1 - 0.18 * smooth(clamp((u - (1 - D.fade)) / D.fade, 0, 1));
      rot = f.r0 * (1 - smooth(clamp(t / 0.22, 0, 1))) + Math.sign(f.vx) * 6 * smooth(clamp((t - 0.25) / 0.6, 0, 1));
      op = (1 - smooth(clamp((u - (1 - D.fade)) / D.fade, 0, 1))) * (P.dead ? 0 : 1);
      projV.set(f.x, f.y0, f.z).project(cam);
      if (u >= 1) { f.el.remove(); floats.splice(k, 1); continue; }
    } else {
      const U = FLOAT_UP, u = f.t / U.life;
      sc = f.t < U.pop ? 0.5 + 0.5 * floatBack(f.t / U.pop) : 1;
      op = 1 - smooth(clamp((u - (1 - U.fade)) / U.fade, 0, 1));
      projV.set(f.x, (f.y0 !== undefined ? f.y0 : 1.2) + U.rise * (1 - Math.pow(1 - Math.min(1, u), 3)), f.z).project(cam);
      if (u >= 1) { f.el.remove(); floats.splice(k, 1); continue; }
    }
    f.el.style.transform = `translate(${((projV.x + 1) / 2 * innerWidth + ox).toFixed(1)}px,${((1 - projV.y) / 2 * innerHeight + oy).toFixed(1)}px) translate(-50%,-50%) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    f.el.style.opacity = op.toFixed(3);
  }
  tickFeed();
}
// toast and wave announcement timers
function tickMessages(rdt) {
  if (toastT > 0) { toastT -= rdt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (annT > 0) { annT -= rdt; if (annT <= 0) { $('announce').style.opacity = 0; $('announce').classList.remove('show'); } }
}
