// The crosshair.

const projV = new V3();
const xh = $('xh'), xhRing = $('xhReload'), xhAmmo = $('xhAmmo'), xhAmmoBg = $('xhAmmoBg'), xhHitEl = $('xhHit'), xhGl = $('xhGl'), xhSpread = $('xhSpread');
const tks = [0, 1, 2, 3].map(k => $('tk' + k));
let gapCur = 10, lastGap = -1;
const ARC = 2 * Math.PI * 30 * (84 / 360);
function ammoDash(n, filled) {
  if (n > 40) return [`${(ARC * filled / n).toFixed(2)} 999`, `${ARC.toFixed(2)} 999`];
  const seg = ARC / n, d = (seg * 0.7).toFixed(2), g = (seg * 0.3).toFixed(2);
  const fg = filled ? Array(filled).fill(d + ' ' + g).join(' ') + ' 0 999' : '0 999';
  return [fg, Array(n).fill(d + ' ' + g).join(' ') + ' 0 999'];
}
// the crosshair: spread ticks, ammo arc, reload ring, hit markers, melee ring, stamina arc
function updateCrosshair(rdt, D) {
  const showXh = state === 'play' && hasMouse && !usingTouch && !scoped;
  xh.hidden = !showXh;
  if (showXh) {
    xh.style.transform = `translate(${mouseX}px,${mouseY}px)`;
    const id = curId();
    $('xhTicks').style.display = D.melee ? 'none' : ''; $('xhMelee').toggleAttribute('hidden', !D.melee); $('xhDot').style.display = D.melee ? 'none' : '';
    if (D.melee) {
      const sd = ANIM.stamD, st = $('xhStam'), cls = P.exh ? 'st exh' : sd < 0.35 ? 'st tired' : 'st';
      st.setAttribute('stroke-dasharray', `${(sd * ARC).toFixed(2)} 999`); $('xhStamBg').setAttribute('stroke-dasharray', `${ARC.toFixed(2)} 999`);
      if (st.getAttribute('class') !== cls) st.setAttribute('class', cls);
    }
    if (D.melee) { const rd = 1 - clamp(W8.cd / ((D.rate || 0.5) * 1.3), 0, 1), L = 2 * Math.PI * 19; $('xhSwing').setAttribute('stroke-dasharray', `${(rd * L).toFixed(1)} 999`); $('xhSwing').style.opacity = rd >= 1 ? 0.35 : 1; }
    // healing ring: fills while the bandage goes on, then drains as the healing runs out
    { const L = 2 * Math.PI * 23, band = P.bandT > 0, hp = band ? 1 - P.bandT / (P.bandMax || 1) : P.heal > 0 ? P.heal / Math.max(P.heal, P.healMax || 1) : 0, on = band || P.heal > 0;
      const hk = (on ? (band ? 'a' : 'r') + Math.round(hp * 200) : '');
      if (cache.xhHeal !== hk) { cache.xhHeal = hk; const el = $('xhHeal'); el.setAttribute('stroke-dasharray', `${(clamp(hp, 0, 1) * L).toFixed(1)} 999`); el.setAttribute('class', band ? 'heal' : 'heal regen'); el.style.opacity = on ? 1 : 0; $('xhHealBg').style.opacity = band ? 1 : 0; } }
    if (P.bandT > 0) { const aw = $('ammoWarn'), t = 'Bandaging ' + Math.round((1 - P.bandT / (P.bandMax || 1)) * 100) + '%'; if (cache.aw !== 'heal' + t) { cache.aw = 'heal' + t; aw.hidden = false; aw.classList.remove('low', 'out', 'loading'); aw.classList.add('heal'); aw.innerHTML = '<span class="aw">' + t + '</span>'; } }
    else if (cache.aw && cache.aw.startsWith('heal')) { cache.aw = null; $('ammoWarn').classList.remove('heal'); $('ammoWarn').hidden = true; }
    if (D.melee && cache.aw && !(P.bandT > 0)) { cache.aw = ''; $('ammoWarn').hidden = true; }
    xhAmmo.style.display = xhAmmoBg.style.display = D.melee ? 'none' : '';
    bloom *= Math.exp(-rdt * 9);
    const mz = muzzle();
    projV.set(mz.ox, GUN_Y, mz.oz).project(cam);
    const px = (projV.x + 1) / 2 * innerWidth, py = (1 - projV.y) / 2 * innerHeight;
    const dpx = Math.hypot(mouseX - px, mouseY - py);
    if (D.melee) $('xhChev').setAttribute('transform', `rotate(${(Math.atan2(mouseY - py, mouseX - px) * 180 / Math.PI + 90).toFixed(1)})`);
    const target = clamp(5 + Math.tan(D.melee ? 0 : spreadOf(id)) * dpx + bloom, 5, 56);
    gapCur += (target - gapCur) * Math.min(1, rdt * 18);
    const gap = Math.round(gapCur * 2) / 2;
    if (gap !== lastGap) { lastGap = gap; tks.forEach((t, k) => t.setAttribute('transform', `rotate(${k * 90}) translate(0,${-gap})`)); xhSpread.setAttribute('r', gap); }
    xhSpread.style.opacity = gap > 9 ? 1 : 0;
    let tgt = false;
    if (!D.melee) tgt = !!aimRay(mz.ox, mz.oz, mz.a, 22).z;
    else tgt = zombies.some(z => { const th = z.atkBoard && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.5 ? 0.75 : 0; return Math.hypot(z.x - P.x, z.z - P.z) < D.range + z.T.r + th && Math.abs(angDiff(Math.atan2(z.x - P.x, z.z - P.z), P.aim)) < D.arc + (th ? 0.25 : 0); });
    xh.classList.toggle('tgt', tgt);
    if (!D.melee) {
      const n = magSize(id), have = W8.mag[id] || 0, key = n + ':' + have;
      const healing = P.bandT > 0;
      if (cache.ammoKey !== key) { cache.ammoKey = key; const [fg, bg] = ammoDash(n, have); xhAmmo.setAttribute('stroke-dasharray', fg); xhAmmoBg.setAttribute('stroke-dasharray', bg); }
      xh.classList.toggle('lowammo', have <= Math.max(1, n * 0.25));
      // yellow under a quarter, red and asking for a reload when empty
      const res = W8.reserve[D.ammo] || 0, aw = $('ammoWarn');
      // while reloading the same spot reads "Reloading", or counts the shells going in
      const mode = W8.reloading ? 'loading' : have === 0 ? (res > 0 ? 'reload' : 'none') : have <= Math.max(1, Math.floor(n * 0.25)) ? 'low' : '';
      const txt = mode === 'loading' ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : mode === 'low' ? 'Low ammo' : mode === 'reload' ? 'Reload <kbd>R</kbd>' : mode === 'none' ? 'No ammo' : '';
      if (!healing && cache.aw !== mode + txt) {
        cache.aw = mode + txt; aw.hidden = !mode;
        aw.classList.remove('low', 'out', 'loading', 'heal'); if (mode) aw.classList.add(mode === 'low' || mode === 'loading' ? mode : 'out');
        aw.innerHTML = '<span class="aw">' + txt + '</span>';
      }
    }
    let rp = 0;
    if (W8.reloading === 'mag') rp = 1 - W8.reloadT / W8.reloadMax;
    else if (W8.reloading === 'shell') rp = (W8.shellsIn + (1 - W8.reloadT / W8.reloadMax)) / Math.max(1, W8.shellsNeed);
    xhRing.setAttribute('stroke-dasharray', (ARC * clamp(rp, 0, 1)).toFixed(1) + ' 999'); xhRing.style.opacity = W8.reloading ? 1 : 0;
    xhAmmo.style.opacity = W8.reloading ? 0.25 : 1;
    const glArc = 2 * Math.PI * 36 * (84 / 360);
    xhGl.style.display = D.gl ? '' : 'none';
    if (D.gl) xhGl.setAttribute('stroke-dasharray', (glArc * (1 - W8.glCd / 6)).toFixed(1) + ' 999');
    xhHit = Math.max(0, xhHit - rdt * 5);
    xhHitEl.setAttribute('opacity', Math.min(1, xhHit).toFixed(2));
    xhHitEl.setAttribute('transform', `scale(${(1 + Math.max(0, xhHit - 0.4) * 0.7).toFixed(2)})`);
    xh.classList.toggle('kill', xhKill && xhHit > 0); xh.classList.toggle('head', xhHead && !xhKill && xhHit > 0);
    if (xhHit <= 0) { xhKill = false; xhHead = false; }
  }
}
