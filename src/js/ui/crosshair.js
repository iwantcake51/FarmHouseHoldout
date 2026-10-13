// The crosshair.

const projV = new V3();
const xh = $('xh'), xhRing = $('xhReload'), xhAmmo = $('xhAmmo'), xhAmmoBg = $('xhAmmoBg'), xhGl = $('xhGl'), xhSpread = $('xhSpread');
const tks = [0, 1, 2, 3].map(k => $('tk' + k)), xhSgSh = $('xhSgSh'), xhSgR = $('xhSgR');
// the shotgun reticle: four short arcs of a ring as wide as the spread, one on each diagonal like corner brackets, with
// wide gaps at the top, bottom and each side. Each arc covers under two fifths of its quarter (never less than 3 px), so
// even a tight spread reads as four brackets round the dot, never a whole circle. The dark under-stroke's arcs run a
// little longer so it outlines each arc's ends
function sgRing(r) {
  const seg = 2 * Math.PI * r / 4, g = seg - Math.max(3, seg * 0.38), gs = Math.max(0.5, g - 2.4);
  const dash = (el, gap) => { el.setAttribute('r', r); el.setAttribute('stroke-dasharray', `${(seg - gap).toFixed(2)} ${gap.toFixed(2)}`); el.setAttribute('stroke-dashoffset', (seg - gap / 2).toFixed(2)); };
  dash(xhSgSh, gs); dash(xhSgR, g);
}
let gapCur = 10, lastGap = -1;
const ARC = 2 * Math.PI * 30 * (84 / 360), M_ARC = 2 * Math.PI * 22 * (64 / 360);   // the gun's ammo arc; the melee stamina arc
function ammoDash(n, filled) {
  if (n > 40) return [`${(ARC * filled / n).toFixed(2)} 999`, `${ARC.toFixed(2)} 999`];
  const seg = ARC / n, d = (seg * 0.7).toFixed(2), g = (seg * 0.3).toFixed(2);
  const fg = filled ? Array(filled).fill(d + ' ' + g).join(' ') + ' 0 999' : '0 999';
  return [fg, Array(n).fill(d + ' ' + g).join(' ') + ' 0 999'];
}
// the warning under the crosshair: its numbers ("Loading 3/6") roll like the HUD's counters (ui/hud-text.js); text
// with a key cap in it, and the bandaging percentage (plain), are just written
function awText(aw, t, plain) {
  let sp = aw.firstElementChild; if (!sp || !sp.classList.contains('aw')) { aw.innerHTML = '<span class="aw"></span>'; sp = aw.firstElementChild; }
  if (plain || t.includes('<')) { sp._rt = sp._roll = null; sp.innerHTML = t; } else rollText(sp, t);
}
// the crosshair: spread ticks, ammo arc, reload ring, melee ring, stamina arc
function updateCrosshair(rdt, D) {
  const showXh = state === 'play' && hasMouse && !usingTouch && !scoped;
  xh.hidden = !showXh;
  if (showXh) {
    xh.style.transform = `translate(${mouseX}px,${mouseY}px)`;
    xh.classList.toggle('healing', P.bandT > 0);   // both hands are on the bandage: no reticle, just the ring filling
    const id = curId();
    // shotguns get a ring the width of their spread; other guns four ticks
    const sg = !D.melee && D.ammo === 'shells';
    $('xhTicks').style.display = D.melee || sg ? 'none' : ''; $('xhSg').toggleAttribute('hidden', !sg); $('xhMelee').toggleAttribute('hidden', !D.melee); $('xhDot').style.display = D.melee ? 'none' : '';
    // stamina under the reticle, with any weapon: it shows as soon as you use some (a swing, a shove, a vault) and fades
    // away once it's full again
    {
      const sd = ANIM.stamD, st = $('xhStam'), cls = P.exh ? 'st exh' : sd < 0.35 ? 'st tired' : 'st', on = P.stam < 0.995 || P.exh;
      if (on || cache.xhSt !== false) { st.setAttribute('stroke-dasharray', `${(sd * M_ARC).toFixed(2)} 999`); $('xhStamBg').setAttribute('stroke-dasharray', `${M_ARC.toFixed(2)} 999`); }
      if (st.getAttribute('class') !== cls) st.setAttribute('class', cls);
      if (cache.xhSt !== on) { cache.xhSt = on; $('xhStamG').classList.toggle('on', on); }
    }
    // the brackets pinch in and dim through the swing's recovery, then spring back out when it's ready again
    if (D.melee) {
      const rd = 1 - clamp(W8.cd / ((D.rate || 0.5) * 1.3), 0, 1), e = rd >= 1 ? 1 : 0.62 + 0.3 * rd * rd, k = (e * 100 | 0) + ':' + (rd >= 1);
      if (cache.xhBr !== k) { cache.xhBr = k; const b = $('xhBr'); b.setAttribute('transform', `scale(${e.toFixed(2)})`); b.style.opacity = rd >= 1 ? 1 : 0.45 + 0.35 * rd; }
    }
    // bandage ring: shown only while a bandage is going on, filling as it does
    { const L = 2 * Math.PI * 23, band = P.bandT > 0, hp = band ? 1 - P.bandT / (P.bandMax || 1) : 0;
      const hk = band ? String(Math.round(hp * 200)) : '';
      if (cache.xhHeal !== hk) { cache.xhHeal = hk; const el = $('xhHeal'); el.setAttribute('stroke-dasharray', `${(clamp(hp, 0, 1) * L).toFixed(1)} 999`); el.style.opacity = band ? 1 : 0; $('xhHealBg').style.opacity = band ? 1 : 0; } }
    if (P.bandT > 0) { const aw = $('ammoWarn'), t = 'Bandaging ' + Math.round((1 - P.bandT / (P.bandMax || 1)) * 100) + '%'; if (cache.aw !== 'heal' + t) { cache.aw = 'heal' + t; aw.hidden = false; aw.classList.remove('low', 'out', 'loading'); aw.classList.add('heal'); awText(aw, t, true); } }
    else if (cache.aw && cache.aw.startsWith('heal')) { cache.aw = null; $('ammoWarn').classList.remove('heal'); $('ammoWarn').hidden = true; }
    if (D.melee && cache.aw && !(P.bandT > 0)) { cache.aw = ''; $('ammoWarn').hidden = true; }
    xhAmmo.style.display = xhAmmoBg.style.display = D.melee ? 'none' : '';
    bloom *= Math.exp(-rdt * 9);
    const mz = muzzle();
    projV.set(mz.ox, GUN_Y, mz.oz).project(cam);
    const px = (projV.x + 1) / 2 * innerWidth, py = (1 - projV.y) / 2 * innerHeight;
    const dpx = Math.hypot(mouseX - px, mouseY - py);
    const target = clamp(5 + Math.tan(D.melee ? 0 : scopeUse() ? scopeSpread(id, scopeDist()) : spreadOf(id)) * dpx + bloom, 5, 56);   // through a scope it tightens with range
    gapCur += (target - gapCur) * Math.min(1, rdt * 18);
    const gap = Math.round(gapCur * 2) / 2;
    if (gap !== lastGap) { lastGap = gap; tks.forEach((t, k) => t.setAttribute('transform', `rotate(${k * 90}) translate(0,${-gap})`)); xhSpread.setAttribute('r', gap); sgRing(gap); }
    xhSpread.style.opacity = gap > 9 && !sg ? 1 : 0;
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
        awText(aw, txt);
      }
    }
    let rp = 0;
    if (W8.reloading === 'mag') rp = 1 - W8.reloadT / W8.reloadMax;
    else if (W8.reloading === 'shell') rp = (W8.shellsIn + (1 - W8.reloadT / W8.reloadMax)) / Math.max(1, W8.shellsNeed);
    xhRing.setAttribute('stroke-dasharray', (ARC * clamp(rp, 0, 1)).toFixed(1) + ' 999'); xhRing.style.opacity = W8.reloading ? 1 : 0;
    xhAmmo.style.opacity = W8.reloading ? 0.25 : 1;
    const glArc = 2 * Math.PI * 36 * (84 / 360);
    xhGl.style.display = D.gl ? '' : 'none';
    if (D.gl) xhGl.setAttribute('stroke-dasharray', (glArc * (1 - W8.glCd / (D.glRecharge || 6))).toFixed(1) + ' 999');
  }
}
