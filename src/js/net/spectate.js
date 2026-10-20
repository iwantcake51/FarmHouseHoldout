// Down in co-op, you watch a teammate till the wave's cleared (camFocus: the camera, the roof and walls fading round
// them, what you hear). Q or a left click watches the one before, E or a right click the next one still standing. Your own HUD gives way to theirs: a "Down" stamp up
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
// whose eyes the screen sees through: yours, or watching a teammate, theirs: where they stand and look, how wide they see
// round them (Wide eyes) and their night vision, sent with their pose (vw: net/avatars.js). The fog of war
// (lighting/vision.js) and night vision (lighting/lightmap.js, day-night.js) read it
const _view = { x: 0, z: 0, aim: 0, cone: 1.2, near: 2.4, nv: 0, night: 0 };
function viewer() {
  const f = camFocus();
  if (f === P || !f.vw) return Object.assign(_view, { x: P.x, z: P.z, aim: P.aim, cone: S.cone, near: S.near, nv: S.nightVis || 0, night: T('night') || 0 });
  return Object.assign(_view, { x: f.x, z: f.z, aim: f.vw[0], cone: f.vw[1], near: f.vw[2], nv: f.vw[3], night: f.vw[4] });
}
// step to the next teammate still standing (dir 1) or the one before (-1), round and round
function specStep(dir) {
  const up = [...NET.peers.values()].filter(p => !p.dead && p.x !== undefined).sort((a, b) => a.idx - b.idx);
  if (up.length < 2) return;
  SPEC.id = up[(up.indexOf(camFocus()) + dir + up.length) % up.length].id; SPEC.key = '';
}
function renderSpec() {
  const f = camFocus(), on = f !== P && (state === 'play' || state === 'paused'), el = $('spec');
  if (el.hidden === on) { el.hidden = !on; document.body.classList.toggle('spectating', on); SPEC.key = ''; }
  if (!on) return;
  const am = f.am || [], hp = Math.max(0, Math.round(f.hp ?? 100)), mx = f.maxHp || 100, st = f.stats || [];
  let up = 0; for (const p of NET.peers.values()) if (!p.dead && p.x !== undefined) up++;
  const key = [f.id, f.name, hp, mx, f.heal || 0, f.wn, JSON.stringify(am), st.join(), up].join('|');
  if (SPEC.key === key) return; SPEC.key = key;
  const q = s => el.querySelector(s);
  el.style.setProperty('--pc', NET_COL[f.idx] || '#888');
  q('.spWho em').textContent = f.name || 'Survivor';
  q('.spHint').hidden = up < 2;
  // their health
  q('.spName b').textContent = f.name || 'Survivor';
  q('.spHp').textContent = hp; q('.spMax').textContent = '/ ' + mx;
  paintBar(q('.spVit .bar'), hp, mx, f.heal, false);   // (net/lobby.js)
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
// where the one you're watching is aiming: a crosshair of their own, ghostly, in their colour washed out to grey, its
// dashed ring turning slowly, so it reads as theirs and not yours (you're down). It glides after their aim (their pose
// sends it, ap: net/avatars.js; SPEC_XH.ease), draws in tighter while they're aiming down the sights, and fades in
// and out with the watching
const SPEC_XH = { ease: 12 }, _sxV = new V3();
function updateSpecXh(rdt) {
  const el = $('specXh'), f = camFocus(), on = f !== P && (state === 'play' || state === 'paused') && !!f.ap;
  if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
  if (!on) { SPEC.xh = null; return; }
  _sxV.set(f.ap[0], GUN_Y, f.ap[1]).project(cam);   // (on the plane aims are taken on, input/keyboard-mouse.js)
  const tx = (_sxV.x * 0.5 + 0.5) * innerWidth, ty = (-_sxV.y * 0.5 + 0.5) * innerHeight;
  const c = SPEC.xh && SPEC.xh.id === f.id ? SPEC.xh : (SPEC.xh = { id: f.id, x: tx, y: ty }), k = 1 - Math.exp(-rdt * SPEC_XH.ease);
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
  el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
  el.style.setProperty('--pc', NET_COL[f.idx] || '#888');
  el.classList.toggle('ads', !!(f.fc && f.fc[3] > 0.5));
}
