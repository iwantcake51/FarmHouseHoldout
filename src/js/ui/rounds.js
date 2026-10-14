// Rounds-left glyphs that drop off the HUD.

// a fired round drops out of the HUD: it pops up, tumbles off the bottom of the screen and leaves a wisp of smoke
function dropRound(src) {
  const r = src.getBoundingClientRect(); if (!r.width) return;
  const cs = getComputedStyle(src), g = document.createElement('i'), dir = rand() < 0.5 ? -1 : 1;
  g.className = 'fallRound';
  Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: cs.width, height: cs.height, background: cs.backgroundColor, borderBottom: cs.borderBottom, borderRadius: cs.borderRadius });
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
// the glyphs for one magazine: the spent ones first (they sit at the far end), then those left; a big one is a bar
const magGlyphs = (n, have) => n > 40 ? `<div class="belt"><span style="width:${(have / n * 100).toFixed(1)}%"></span></div>` : '<i class="off"></i>'.repeat(Math.max(0, n - have)) + '<i></i>'.repeat(Math.max(0, Math.min(have, n)));
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
    if (pr && pr.ak && pr.id === id && pr.n === n && m[s] < pr[s] && n <= 40 && state === 'play') for (let i = n - pr[s], c = 0; i < n - m[s] && c < 6; i++, c++) if (g.children[i]) dropRound(g.children[i]);
    g.innerHTML = magGlyphs(n, m[s]); g.classList.toggle('rl', akBusy(s));
  });
  cache.roundsPrev = { ak: true, id, n, L: m.L, R: m.R };
}
function renderRounds(id, D) {
  if (D.akimbo) { renderRoundsAk(id, D); return; }
  const n = magSize(id), have = W8.mag[id] || 0, key = id + n + ':' + have + ':' + T('ammo');
  if (cache.rounds === key) return; cache.rounds = key;
  const el = $('rounds'), pr = cache.roundsPrev;
  if (pr && pr.id === id && pr.n === n && have < pr.have && n <= 40 && state === 'play') {
    const kids = el.children; let k = 0;
    for (let i = n - pr.have; i < n - have && k < 6; i++, k++) if (kids[i]) dropRound(kids[i]);
  }
  cache.roundsPrev = { id, n, have }; el.className = roundsCls(D);
  el.innerHTML = magGlyphs(n, have);
}
