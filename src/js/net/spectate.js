// Down in co-op, you watch a teammate till the wave's cleared (camFocus: the camera, the roof and walls fading round
// them, what you hear). Click to watch the next one still standing. Your own HUD gives way to theirs: a "Down" stamp up
// top with who you're watching, their health and planks, scrap and kills bottom left, their weapon and its ammo bottom
// right (sent with their pose: ammoOut in net/avatars.js)

const SPEC = { id: '', key: '' };
// who the camera's on: you, or once you've fallen, the teammate you picked if they're still standing, else the first
function camFocus() {
  if (!netLink() || !P.dead || P.deathT < 1.4) return P;
  let first = null;
  for (const p of NET.peers.values()) {
    if (p.dead || p.x === undefined) continue;
    if (p.id === SPEC.id) return p;
    if (!first || p.idx < first.idx) first = p;
  }
  return first || P;
}
const spectating = () => camFocus() !== P;
function specNext() {
  const up = [...NET.peers.values()].filter(p => !p.dead && p.x !== undefined).sort((a, b) => a.idx - b.idx);
  if (up.length < 2) return;
  SPEC.id = up[(up.indexOf(camFocus()) + 1) % up.length].id; SPEC.key = '';
}
function renderSpec() {
  const f = camFocus(), on = f !== P && (state === 'play' || state === 'paused'), el = $('spec');
  if (el.hidden === on) { el.hidden = !on; document.body.classList.toggle('spectating', on); SPEC.key = ''; }
  if (!on) return;
  const am = f.am || [], hp = Math.max(0, Math.round(f.hp ?? 100)), mx = f.maxHp || 100, st = f.stats || [];
  let up = 0; for (const p of NET.peers.values()) if (!p.dead && p.x !== undefined) up++;
  const key = [f.id, f.name, hp, mx, f.wn, JSON.stringify(am), st.join(), up].join('|');
  if (SPEC.key === key) return; SPEC.key = key;
  const q = s => el.querySelector(s), fr = clamp(hp / mx, 0, 1) * 100 + '%';
  el.style.setProperty('--pc', NET_COL[f.idx] || '#888');
  q('.spWho em').textContent = f.name || 'Survivor';
  q('.spHint').hidden = up < 2;
  // their health
  q('.spName b').textContent = f.name || 'Survivor';
  q('.spHp').textContent = hp; q('.spMax').textContent = '/ ' + mx;
  q('.spVit .bar i').style.width = fr; q('.spVit .bar b').style.width = fr;
  q('.spVit').classList.toggle('low', hp / mx < 0.3);
  el.querySelectorAll('.spVit .res b').forEach((b, i) => { b.textContent = st[i] ?? 0; });
  // their weapon
  const [have, res, cap, rel, band] = am, melee = have === -1 || have === undefined;
  q('.spWName').textContent = f.wn || '';
  const ammo = q('.spAmmo'), n = Array.isArray(have) ? Math.min(...have) : have;   // (a pair: the emptier of the two)
  ammo.textContent = melee ? '—' : Array.isArray(have) ? have.join(' · ') : have;
  ammo.classList.toggle('out', !melee && n === 0); ammo.classList.toggle('low', !melee && n > 0 && n <= Math.max(1, Math.floor((cap || 1) * 0.25)));
  q('.spRes').textContent = melee ? '' : '/ ' + res;
  q('.spRel').textContent = rel === 2 ? 'Loading shells' : rel === 1 ? 'Reloading' : '';
  q('.spBand b').textContent = band ?? 0; q('.spBand').classList.toggle('empty', !(band > 0));
}
