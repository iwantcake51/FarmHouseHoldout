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
// the glyphs for one magazine, in the order they're laid out from the bottom right (styles/hud-weapon.css: right to
// left along a row, rows stacking upward): the last round in the mag first, so it sits at the bottom right, then the
// rest up to the next one to fire, then the spent ones. So a mag empties top-left first, across and down, row by row,
// like reading, and the last round left is always bottom right; a part row sits on top. A big one is a bar
const magGlyphs = (n, have, fired) => { fired = Math.max(0, Math.min(fired || 0, n - have)); return n > 40 ? `<div class="belt"><span style="width:${(have / n * 100).toFixed(1)}%"></span></div>` : '<i></i>'.repeat(Math.max(0, Math.min(have, n))) + '<i class="fired"></i>'.repeat(fired) + '<i class="off"></i>'.repeat(Math.max(0, n - have - fired)); };
const roundsCls = D => ({ shells: 'sh', rifle: 'rf', magnum: 'mg' }[D.ammo] || '') + (T('ammo') ? ' hp' + (T('ammo') > 1 ? T('ammo') : '') : '');
// an akimbo pair: each gun's magazine its own group, the one on your left on the left (AK_ON), split by a rule; the one
// being reloaded dims
function renderRoundsAk(id, D) {
  const n = akPer(id), m = akMags(id), key = 'ak' + id + n + ':' + m.L + ':' + m.R + ':' + T('ammo') + ':' + akBusy('L') + akBusy('R');
  if (cache.rounds === key) return; cache.rounds = key;
  const el = $('rounds'), pr = cache.roundsPrev;
  el.className = roundsCls(D) + ' ak';
  if (!el.firstElementChild || !el.firstElementChild.classList.contains('mag')) el.innerHTML = '<div class="mag"></div><div class="mag"></div>';
  [AK_ON.left, AK_ON.right].forEach((s, k) => {
    const g = el.children[k];
    if (pr && pr.ak && pr.id === id && pr.n === n && m[s] < pr[s] && n <= 40 && state === 'play') for (let i = m[s], c = 0; i < pr[s] && c < 6; i++, c++) if (g.children[i]) dropRound(g.children[i]);   // the ones just fired
    g.innerHTML = magGlyphs(n, m[s]); g.classList.toggle('rl', akBusy(s));
  });
  cache.roundsPrev = { ak: true, id, n, L: m.L, R: m.R };
}
function renderRounds(id, D) {
  if (D.akimbo) { renderRoundsAk(id, D); return; }
  const n = magCap(id), have = W8.mag[id] || 0, keeps = EJECT[id] !== 'fire', fired = keeps ? Math.max(0, Math.min(W8.hudSpent[id] || 0, n - have)) : 0;
  const key = id + n + ':' + have + ':' + fired + ':' + T('ammo');   // the mag that's in it (game/run-state.js), and the fired cases it's kept
  if (cache.rounds === key) return; cache.rounds = key;
  const el = $('rounds'), pr = cache.roundsPrev;
  if (pr && pr.id === id && pr.n === n && n <= 40 && state === 'play') {
    const kids = el.children; let k = 0;
    if (!keeps && have < pr.have) for (let i = have; i < pr.have && k < 6; i++, k++) { if (kids[i]) dropRound(kids[i]); }   // thrown out as they're fired
    if (fired < pr.fired) for (let i = pr.have + fired; i < pr.have + pr.fired && k < 8; i++, k++) { if (kids[i]) dropRound(kids[i], true); }   // the kept ones, thrown out as the gun throws them
  }
  cache.roundsPrev = { id, n, have, fired }; el.className = roundsCls(D);
  el.innerHTML = magGlyphs(n, have, fired);
}
