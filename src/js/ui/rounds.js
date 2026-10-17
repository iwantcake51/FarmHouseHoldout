// Rounds-left glyphs that drop off the HUD.

// a fired round drops out of the HUD: it pops up, tumbles off the bottom of the screen and leaves a wisp of smoke. Only
// the empty case goes (the bullet's gone downrange): the glyph's brass below the bullet (CASE_OF of its height), in its
// own case colour (a match-grade round's nickel), its mouth open at the top; a rifle case keeps its neck and shoulder.
// A shotgun shell goes whole, as it is. A gun that keeps its fired cases (a pump or a bolt till it's racked, a double
// barrel or a revolver till it's reloaded: EJECT in weapons/casings.js) leaves them in the HUD, fired (a shell's hull
// blown open at the crimp, a case with no bullet in it), and they go when the gun throws them (spent: just as they look)
const CASE_OF = { rf: 0.7, mg: 0.7, p9: 0.64 };
function dropRound(src, spent) {
  const r = src.getBoundingClientRect(); if (!r.width) return;
  const cs = getComputedStyle(src), g = document.createElement('i'), dir = rand() < 0.5 ? -1 : 1, box = src.closest('#rounds');
  const cal = !box ? 'p9' : box.classList.contains('sh') ? 'sh' : box.classList.contains('rf') ? 'rf' : box.classList.contains('mg') ? 'mg' : 'p9';
  g.className = 'fallRound';
  if (spent) Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: cs.width, height: cs.height, backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, borderBottom: cs.borderBottom, clipPath: cs.clipPath, borderRadius: cs.borderRadius });
  else if (cal === 'sh') Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: cs.width, height: cs.height, background: cs.backgroundColor, borderBottom: cs.borderBottom, borderRadius: cs.borderRadius });
  else {
    const h = r.height * CASE_OF[cal], brass = cs.getPropertyValue('--cs').trim() || '#d8b45a';
    g.className = 'fallRound case' + (cal === 'rf' ? ' rf' : '');
    Object.assign(g.style, { left: r.left + 'px', top: (r.top + r.height - h) + 'px', width: r.width + 'px', height: h + 'px', background: `linear-gradient(${brass} 0 86%, #9c7a34 86%)` });
  }
  // a real arc: flicked up and sideways, gravity takes over gradually, tumbling the whole way down
  const vx = dir * rr(70, 190), vy = -rr(240, 380), grav = 1500, spin = dir * rr(380, 900), drop = innerHeight - r.top + 40;
  const T = (-vy + Math.sqrt(vy * vy + 2 * grav * drop)) / grav, frames = [];
  for (let k = 0; k <= 30; k++) { const t = T * k / 30; frames.push({ transform: `translate(${(vx * t).toFixed(1)}px,${(vy * t + 0.5 * grav * t * t).toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg)` }); }
  g.style.animation = 'none';
  g.animate(frames, { duration: T * 1000, easing: 'linear', fill: 'forwards' }).onfinish = () => g.remove();
  const p = document.createElement('i'); p.className = 'roundPuff';
  Object.assign(p.style, { left: (r.left + r.width / 2 - 9) + 'px', top: (r.top - 6) + 'px' }); p.style.setProperty('--px', (rr(-10, 10)).toFixed(0) + 'px');
  document.body.append(g, p);
  p.addEventListener('animationend', () => p.remove());
}
// a shot in a gun that keeps its cases kicks them in the HUD. The ones just fired punch down into the base and squash,
// flash hot, tip to one side and spring back, a wisp off the open mouth; the cases already spent in it rattle loose,
// and the live rounds left dip with the recoil, each a beat after the last as the jolt runs along the row. All of it a
// damped spring (a fast hit, overshoot, settling), sampled into keyframes so it moves on a curve, not in straight lines
const caseSpring = (t, f, z) => t <= 0 ? 0 : Math.exp(-z * 6.2832 * f * t) * Math.sin(6.2832 * f * t * Math.sqrt(1 - z * z));
const KICK_MS = 700, KICK_N = 42;
function caseShake(g, ms, at) {
  const frames = [];
  for (let k = 0; k <= KICK_N; k++) { const t = k / KICK_N * ms / 1000; frames.push(at(t)); }
  g.animate(frames, { duration: ms, easing: 'linear' });
}
function kickRounds(el, have, wasHave, fired) {
  const kids = el.children, last = Math.min(kids.length, have + fired), mid = (have + wasHave - 1) / 2;
  for (let i = 0; i < last; i++) {
    const g = kids[i], dir = rand() < 0.5 ? -1 : 1, lag = Math.abs(i - mid) * 0.022;
    g.style.transformOrigin = '50% 100%';
    if (i >= have && i < wasHave) {   // just fired
      const a = rr(4, 5.5), tip = dir * rr(7, 11), heat = rr(0.8, 1.1);
      caseShake(g, KICK_MS, t => {
        const y = a * caseSpring(t, 5.2, 0.36), sq = 0.16 * caseSpring(t, 6.5, 0.42), r = tip * caseSpring(t - 0.03, 4.4, 0.3);
        return { transform: `translateY(${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg) scale(${(1 + sq * 0.55).toFixed(3)},${(1 - sq).toFixed(3)})`, filter: `brightness(${(1 + heat * Math.exp(-t * 9)).toFixed(3)})` };
      });
      const r = g.getBoundingClientRect(), p = document.createElement('i'); p.className = 'roundPuff wisp';
      Object.assign(p.style, { left: (r.left + r.width / 2 - 9) + 'px', top: (r.top - 10) + 'px' }); p.style.setProperty('--px', rr(-6, 6).toFixed(0) + 'px');
      document.body.append(p); p.addEventListener('animationend', () => p.remove());
    } else if (i >= have) {   // spent already: loose in the gun, they rattle
      const a = rr(1.6, 2.3), tip = dir * rr(7, 11);
      caseShake(g, KICK_MS, t => {
        const s = t - lag, y = a * caseSpring(s, 7, 0.32), x = dir * 1.1 * caseSpring(s - 0.02, 9.5, 0.3), r = tip * caseSpring(s, 8, 0.3);
        return { transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)` };
      });
    } else {   // live: a dip with the recoil
      const a = rr(1.3, 1.9);
      caseShake(g, KICK_MS, t => ({ transform: `translateY(${(a * caseSpring(t - lag, 5.5, 0.45)).toFixed(2)}px)` }));
    }
  }
}
// a gun just drawn brings its rounds up into the HUD: each one rises from under the row, small, and springs up into
// place (a touch past it and back, settling), one after another from the bottom right, the next to fire last, a mag
// of each at once for a pair. It goes on top of whatever else moves them (a kick: composite 'add'), and a redraw on the
// way (a shot, a reload) picks it up where it had got to. A damped spring sampled into keyframes, like the kick
const popSpring = t => Math.exp(-0.42 * 6.2832 * 3.1 * t) * Math.cos(6.2832 * 3.1 * t * 0.9075);   // 1 at the start, 0 at rest
const POP_MS = 560, POP_N = 32, POP_SPAN = 280, POP_FRAMES = [];
for (let k = 0; k <= POP_N; k++) { const s = popSpring(k / POP_N * POP_MS / 1000); POP_FRAMES.push({ transform: `translateY(${(11 * s).toFixed(2)}px) scale(${(1 - 0.5 * s).toFixed(3)})` }); }
const POP_FADE = [{ opacity: 0 }, { opacity: 1, offset: 0.22 }, { opacity: 1 }];
const calmHud = matchMedia('(prefers-reduced-motion: reduce)');
// which gun the rounds are drawn for; a different one (or one back from a melee weapon) starts its pop
function popCheck(id) {
  const was = cache.rounds === 'melee' ? 'melee' : cache.roundsGun; cache.roundsGun = id;
  if (was !== id) { cache.popAt = performance.now(); cache.popN = Infinity; return true; }
  return false;
}
function popRounds(el) {
  const gone = performance.now() - (cache.popAt || -1e9);
  if (gone > POP_SPAN + POP_MS || calmHud.matches) return;
  for (const box of el.classList.contains('ak') ? el.children : [el]) {
    const kids = box.children, n = Math.min(kids.length, cache.popN), step = Math.min(26, POP_SPAN / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const g = kids[i], delay = i * step - gone; if (delay + POP_MS <= 0 || g.classList.contains('belt')) continue;   // (a big mag's bar shakes instead: shakeBelt)
      g.style.transformOrigin = '50% 100%';
      g.animate(POP_FRAMES, { duration: POP_MS, delay, easing: 'linear', fill: 'backwards', composite: 'add' });
      g.animate(POP_FADE, { duration: POP_MS, delay, easing: 'ease-out', fill: 'backwards' });
    }
  }
}
// through a mag change (weapons/reload.js), the mag in the gun as the HUD shows it: the old one's, till it comes out;
// none, from then till the new one's pushed home (the count at 0, every slot empty); then what the new one holds, and
// the spare rounds less what went into it. A pair, a revolver's speed loader and a shell at a time show the gun as it is
function hudMag(id) {
  const D = W(id), have = W8.mag[id] || 0, res = W8.reserve[D.ammo];
  if (W8.reloading !== 'mag' || D.speedload || D.akimbo) return { have, res };
  if (W8.seated) { const take = Math.max(0, Math.min(magSize(id) - have, res)); return { have: have + take, res: res - take }; }
  return { have: W8.magOut ? 0 : have, res, out: !!W8.magOut };
}
// a mag pulled out takes its rounds out of the HUD with it: they drop out of the row, the bottom right first and the
// rest close behind, falling away under gravity with a little drift and tilt each, fading as they go. Copies of them
// fall (like a fired round, dropRound), and the row's left showing its empty slots; the new mag's rounds pop up into
// them once it's seated (popRounds)
const FALL_MS = 430, FALL_N = 24, FALL_SPAN = 170;
function magFall(el, n) {
  if (calmHud.matches) return;
  const kids = [...el.children].slice(0, n), step = Math.min(16, FALL_SPAN / Math.max(1, kids.length - 1));
  kids.forEach((src, i) => {
    const r = src.getBoundingClientRect(); if (!r.width) return;
    const cs = getComputedStyle(src), g = document.createElement('i'), belt = src.classList.contains('belt');
    g.className = 'fallRound';
    Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', animation: 'none', backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, borderBottom: cs.borderBottom, clipPath: cs.clipPath, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow });
    if (belt) { const f = src.firstElementChild; g.style.backgroundImage = `linear-gradient(90deg,${getComputedStyle(f).backgroundColor} ${f.style.width},transparent ${f.style.width})`; }
    const dir = rand() < 0.5 ? -1 : 1, vx = dir * rr(4, 16), vy = rr(10, 40), grav = belt ? 520 : 760, spin = belt ? 0 : dir * rr(14, 40), frames = [];
    for (let k = 0; k <= FALL_N; k++) {
      const t = k / FALL_N * FALL_MS / 1000, f = k / FALL_N;
      frames.push({ transform: `translate(${(vx * t).toFixed(1)}px,${(vy * t + 0.5 * grav * t * t).toFixed(1)}px) rotate(${(spin * t).toFixed(1)}deg)`, opacity: (f < 0.35 ? 1 : 1 - Math.pow((f - 0.35) / 0.65, 1.4)).toFixed(3) });
    }
    document.body.append(g);
    g.animate(frames, { duration: FALL_MS, delay: i * step, easing: 'linear', fill: 'both' }).onfinish = () => g.remove();
  });
}
// a big mag (over 40) is a bar, full from the right, so it empties from the left like the rounds do: it's kept, not
// redrawn, and eased from one width to the next. A shot takes a sliver off quickly; a mag pulled out drains it to
// nothing, and a new one seated fills it back up; a gun drawn shows it at once, and the bar gives a little shake
// (side to side, settling) instead of the rounds' pop
const BELT_TICK = [90, 'ease-out'], BELT_DRAIN = [420, 'cubic-bezier(.45,0,.55,1)'], BELT_FILL = [460, 'cubic-bezier(.2,.8,.3,1)'];
function setBelt(el, f, how) {
  let b = el.children.length === 1 && el.firstElementChild.classList.contains('belt') ? el.firstElementChild : null;
  if (!b) { el.innerHTML = '<div class="belt"><span></span></div>'; b = el.firstElementChild; how = null; }
  const s = b.firstElementChild; s.style.transition = how && !calmHud.matches ? `width ${how[0]}ms ${how[1]}` : 'none';
  s.style.width = (f * 100).toFixed(1) + '%';
}
const SHAKE_MS = 460, SHAKE_FRAMES = [];
for (let k = 0; k <= 30; k++) { const t = k / 30 * SHAKE_MS / 1000; SHAKE_FRAMES.push({ transform: `translate(${(3.2 * caseSpring(t, 8.5, 0.24)).toFixed(2)}px,${(-1.1 * caseSpring(t - 0.015, 12, 0.32)).toFixed(2)}px) rotate(${(0.9 * caseSpring(t - 0.01, 7, 0.26)).toFixed(2)}deg)` }); }
function shakeBelt(el) { if (!calmHud.matches) el.querySelectorAll('.belt').forEach(b => b.animate(SHAKE_FRAMES, { duration: SHAKE_MS, easing: 'linear' })); }
// the glyphs for one magazine, in the order they're laid out from the bottom right (styles/hud-weapon.css: right to
// left along a row, rows stacking upward): the last round in the mag first, so it sits at the bottom right, then the
// rest up to the next one to fire, then the spent ones. So a mag empties top-left first, across and down, row by row,
// like reading, and the last round left is always bottom right; a part row sits on top. A big one is a bar
const magGlyphs = (n, have, fired) => { fired = Math.max(0, Math.min(fired || 0, n - have)); return n > 40 ? `<div class="belt"><span style="width:${(have / n * 100).toFixed(1)}%"></span></div>` : '<i></i>'.repeat(Math.max(0, Math.min(have, n))) + '<i class="fired"></i>'.repeat(fired) + '<i class="off"></i>'.repeat(Math.max(0, n - have - fired)); };
// (the kind of round loaded too: a shotgun's shells take its colour, rflech, rfire, rslug; 9mm hollow points come in
// silver cases, rhollow; piercing and explosive tips colour the bullet)
const roundsCls = (D, id) => ({ shells: 'sh', rifle: 'rf', magnum: 'mg' }[D.ammo] || '') + (T('ammo') ? ' hp' + (T('ammo') > 1 ? T('ammo') : '') : '') + (roundOn(id) !== 'std' ? ' r' + roundOn(id) : '');
// an akimbo pair: each gun's magazine its own group, the one on your left on the left (AK_ON), split by a rule; the one
// being reloaded dims
function renderRoundsAk(id, D) {
  const drawn = popCheck(id);
  const n = akPer(id), m = akMags(id), key = 'ak' + id + n + ':' + m.L + ':' + m.R + ':' + T('ammo') + roundOn(id) + ':' + akBusy('L') + akBusy('R');
  if (cache.rounds === key) return; cache.rounds = key;
  const el = $('rounds'), pr = cache.roundsPrev;
  el.className = roundsCls(D, id) + ' ak';
  if (!el.firstElementChild || !el.firstElementChild.classList.contains('mag')) el.innerHTML = '<div class="mag"></div><div class="mag"></div>';
  [AK_ON.left, AK_ON.right].forEach((s, k) => {
    const g = el.children[k];
    if (pr && pr.ak && pr.id === id && pr.n === n && m[s] < pr[s] && n <= 40 && state === 'play') for (let i = m[s], c = 0; i < pr[s] && c < 6; i++, c++) if (g.children[i]) dropRound(g.children[i]);   // the ones just fired
    g.innerHTML = magGlyphs(n, m[s]); g.classList.toggle('rl', akBusy(s));
  });
  cache.roundsPrev = { ak: true, id, n, L: m.L, R: m.R };
  popRounds(el); if (drawn && n > 40) shakeBelt(el);
}
function renderRounds(id, D) {
  if (D.akimbo) { renderRoundsAk(id, D); return; }
  const drawn = popCheck(id);
  const n = magCap(id), hm = hudMag(id), have = hm.have, out = !!hm.out, keeps = EJECT[id] !== 'fire', fired = keeps ? Math.max(0, Math.min(W8.hudSpent[id] || 0, n - have)) : 0;
  const key = id + n + ':' + have + ':' + fired + ':' + T('ammo') + roundOn(id) + (out ? ':out' : '');   // the mag that's in it (game/run-state.js, through a mag change: hudMag), and the fired cases it's kept
  if (cache.rounds === key) return; cache.rounds = key;
  const el = $('rounds'), pr = cache.roundsPrev, same = pr && pr.id === id && pr.n === n && state === 'play', swapMag = same && out !== !!pr.out;
  if (swapMag && out && n <= 40) magFall(el, pr.have);   // the mag's out, and its rounds with it (a bar drains instead: setBelt)
  else if (swapMag && have > 0 && n <= 40) { cache.popAt = performance.now(); cache.popN = have; }   // a mag's in (or the old one kept, the reload cut short): its rounds pop up
  else if (same && n <= 40) {
    const kids = el.children; let k = 0;
    if (!keeps && have < pr.have) for (let i = have; i < pr.have && k < 6; i++, k++) { if (kids[i]) dropRound(kids[i]); }   // thrown out as they're fired
    if (fired < pr.fired) for (let i = pr.have + fired; i < pr.have + pr.fired && k < 8; i++, k++) { if (kids[i]) dropRound(kids[i], true); }   // the kept ones, thrown out as the gun throws them
  }
  cache.roundsPrev = { id, n, have, fired, out }; el.className = roundsCls(D, id);
  if (n > 40) { setBelt(el, have / n, !same ? null : swapMag ? (out ? BELT_DRAIN : BELT_FILL) : BELT_TICK); if (drawn) shakeBelt(el); }
  else el.innerHTML = magGlyphs(n, have, fired);
  if (same && n <= 40 && keeps && have < pr.have && fired > pr.fired) kickRounds(el, have, pr.have, fired);   // just fired, and kept
  popRounds(el);   // a gun just drawn: after the kick, so it adds on top
}
