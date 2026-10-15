// The crosshair.

const projV = new V3();
const xh = $('xh'), xhRing = $('xhReload'), xhAmmo = $('xhAmmo'), xhAmmoBg = $('xhAmmoBg'), xhGl = $('xhGl'), xhSpread = $('xhSpread');
// an akimbo pair's left gun: its own arc and reload ring, mirrored on the left
const xhAmmoL = $('xhAmmoL'), xhAmmoBgL = $('xhAmmoBgL'), xhRingL = $('xhReloadL');
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
// the ammo arc (on the right) and the stamina arc (underneath) ride just outside the reticle, so it never reaches into
// or over them: their radius grows from where they sit when it's tight (aR, sR) to keep a clear gap outside its outer
// edge (the ticks reach TICK_L past the spread, the shotgun's arcs sit on it), and the grenade launcher's arc and the
// warning text move out with them
let aR = 30, sR = 22, lastXh = '';
const TICK_L = 10.7, XH_CLEAR = { a: 6, s: 5 };
const ARC = () => 2 * Math.PI * aR * (84 / 360), M_ARC = () => 2 * Math.PI * sR * (64 / 360);
function ammoDash(n, filled) {
  const A = ARC();
  if (n > 40) return [`${(A * filled / n).toFixed(2)} 999`, `${A.toFixed(2)} 999`];
  const seg = A / n, d = (seg * 0.7).toFixed(2), g = (seg * 0.3).toFixed(2);
  const fg = filled ? Array(filled).fill(d + ' ' + g).join(' ') + ' 0 999' : '0 999';
  return [fg, Array(n).fill(d + ' ' + g).join(' ') + ' 0 999'];
}
// the melee brackets' springs: their size (s) and twist (r, in degrees), and the cooldown they're recovering against
// XHM_TWIST: how many times harder than the camera's roll the brackets twist
const XHM = { s: 1, vs: 0, r: 0, vr: 0, cd: 0, max: 0, ready: true }, XHM_TWIST = 12;
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
    xh.style.transform = `translate(${aimSX().toFixed(1)}px,${aimSY().toFixed(1)}px)`;   // on the cursor, or wandering off it at low health (player/shaky-hands.js)
    xh.classList.toggle('healing', P.bandT > 0);   // both hands are on the bandage: no reticle, just the ring filling
    const id = curId();
    // shotguns get a ring the width of their spread; other guns four ticks
    const sg = !D.melee && D.ammo === 'shells';
    $('xhTicks').style.display = D.melee || sg ? 'none' : ''; $('xhSg').toggleAttribute('hidden', !sg); $('xhMelee').toggleAttribute('hidden', !D.melee); $('xhDot').style.display = D.melee ? 'none' : '';
    // stamina under the reticle, with any weapon: it shows as soon as you use some (a swing, a shove, a vault) and fades
    // away once it's full again
    {
      const sd = ANIM.stamD, st = $('xhStam'), cls = P.exh ? 'st exh' : sd < 0.35 ? 'st tired' : 'st', on = P.stam < 0.995 || P.exh;
      if (on || cache.xhSt !== false) { st.setAttribute('stroke-dasharray', `${(sd * M_ARC()).toFixed(2)} 999`); $('xhStamBg').setAttribute('stroke-dasharray', `${M_ARC().toFixed(2)} 999`); }
      if (st.getAttribute('class') !== cls) st.setAttribute('class', cls);
      if (cache.xhSt !== on) { cache.xhSt = on; $('xhStamG').classList.toggle('on', on); }
    }
    // the brackets pinch in and dim through the swing's recovery and ease back out as it comes back, with a soft pop
    // when it's ready; they twist with the camera as a swing rolls it, the same way the picture turns but much harder,
    // snapping round and back. Recovery runs against the cooldown the swing started with (a tired swing's is longer), so
    // they always open from fully in
    if (W8.cd > XHM.cd + 1e-4) XHM.max = W8.cd;
    XHM.cd = W8.cd;
    if (D.melee) {
      const rd = XHM.max > 0 ? 1 - clamp(W8.cd / XHM.max, 0, 1) : 1, ready = rd >= 1;
      if (ready && !XHM.ready) XHM.vs += 0.9;
      XHM.ready = ready;
      const sT = 0.62 + 0.38 * smooth(rd), rT = clamp(camRoll * 57.3 * XHM_TWIST, -40, 40);
      for (let t = Math.min(rdt, 0.1); t > 1e-6; t -= 1 / 120) {
        const h = Math.min(t, 1 / 120);
        XHM.vs += ((sT - XHM.s) * 260 - XHM.vs * 22) * h; XHM.s += XHM.vs * h;
        XHM.vr += ((rT - XHM.r) * 900 - XHM.vr * 38) * h; XHM.r += XHM.vr * h;   // stiff: quick to snap round, a small overshoot
      }
      const k = XHM.s.toFixed(3) + ':' + XHM.r.toFixed(1) + ':' + Math.round(rd * 50);
      if (cache.xhBr !== k) { cache.xhBr = k; const b = $('xhBr'); b.setAttribute('transform', `rotate(${XHM.r.toFixed(1)}) scale(${XHM.s.toFixed(3)})`); b.style.opacity = (0.45 + 0.55 * smooth(rd)).toFixed(2); }
    }
    // bandage ring: shown only while a bandage is going on, filling as it does
    { const L = 2 * Math.PI * 23, band = P.bandT > 0, hp = band ? 1 - P.bandT / (P.bandMax || 1) : 0;
      const hk = band ? String(Math.round(hp * 200)) : '';
      if (cache.xhHeal !== hk) { cache.xhHeal = hk; const el = $('xhHeal'); el.setAttribute('stroke-dasharray', `${(clamp(hp, 0, 1) * L).toFixed(1)} 999`); el.style.opacity = band ? 1 : 0; $('xhHealBg').style.opacity = band ? 1 : 0; } }
    if (P.bandT > 0) { const aw = $('ammoWarn'), t = 'Bandaging ' + Math.round((1 - P.bandT / (P.bandMax || 1)) * 100) + '%'; if (cache.aw !== 'heal' + t) { cache.aw = 'heal' + t; aw.hidden = false; aw.classList.remove('low', 'out', 'loading'); aw.classList.add('heal'); awText(aw, t, true); } }
    else if (cache.aw && cache.aw.startsWith('heal')) { cache.aw = null; $('ammoWarn').classList.remove('heal'); $('ammoWarn').hidden = true; }
    if (D.melee && cache.aw && !(P.bandT > 0)) { cache.aw = ''; $('ammoWarn').hidden = true; }
    xhAmmo.style.display = xhAmmoBg.style.display = D.melee ? 'none' : '';
    const ak = !D.melee && !!D.akimbo; [xhAmmoL, xhAmmoBgL, xhRingL].forEach(c => c.toggleAttribute('hidden', !ak));
    bloom *= Math.exp(-rdt * 9);
    const mz = muzzle();
    projV.set(mz.ox, GUN_Y, mz.oz).project(cam);
    const px = (projV.x + 1) / 2 * innerWidth, py = (1 - projV.y) / 2 * innerHeight;
    const dpx = Math.hypot(mouseX - px, mouseY - py);
    const target = clamp(5 + Math.tan(D.melee ? 0 : scopeUse() ? scopeSpread(id, scopeDist()) : spreadOf(id)) * dpx + bloom, 5, 56);   // through a scope it tightens with range
    gapCur += (target - gapCur) * Math.min(1, rdt * 18);
    const gap = Math.round(gapCur * 2) / 2, xk = gap + (D.melee ? 'm' : sg ? 's' : 't');
    if (gap !== lastGap) { lastGap = gap; tks.forEach((t, k) => t.setAttribute('transform', `rotate(${k * 90}) translate(0,${-gap})`)); xhSpread.setAttribute('r', gap); sgRing(gap); }
    if (xk !== lastXh) {
      lastXh = xk;
      const outer = D.melee ? 17.5 : sg ? gap + 2.2 : gap + TICK_L;   // the melee brackets at full stretch, the shotgun's arcs, or the ticks' tips
      aR = Math.max(30, outer + XH_CLEAR.a); sR = Math.max(22, outer + XH_CLEAR.s);
      [xhAmmo, xhAmmoBg, xhRing, xhAmmoL, xhAmmoBgL, xhRingL].forEach(c => c.setAttribute('r', aR)); xhGl.setAttribute('r', aR + 6); $('xhStam').setAttribute('r', sR); $('xhStamBg').setAttribute('r', sR);
      $('ammoWarn').style.top = (80 + Math.max(38, sR + 16)) + 'px'; xh.style.setProperty('--ar', aR + 'px'); cache.ammoKey = null;
    }
    xhSpread.style.opacity = gap > 9 && !sg ? 1 : 0;
    let tgt = false;
    if (!D.melee) tgt = !!aimRay(mz.ox, mz.oz, mz.a, 22).z;
    else tgt = zombies.some(z => { const th = z.atkBoard && Math.hypot(z.atkBoard.x - P.x, z.atkBoard.z - P.z) < 1.5 ? 0.75 : 0; return Math.hypot(z.x - P.x, z.z - P.z) < D.range + z.T.r + th && Math.abs(angDiff(Math.atan2(z.x - P.x, z.z - P.z), P.aim)) < D.arc + (th ? 0.25 : 0); });
    xh.classList.toggle('tgt', tgt);
    if (!D.melee) {
      // two guns: each arc is its own gun's mag (the one on your right on the right, AK_ON), each turning yellow under a quarter
      const am = ak && akMags(id), n = ak ? akPer(id) : magCap(id), have = ak ? am[AK_ON.right] : W8.mag[id] || 0, haveL = ak ? am[AK_ON.left] : 0, key = n + ':' + have + ':' + aR + (ak ? ':' + haveL : '');
      const healing = P.bandT > 0, lowAt = Math.max(1, n * 0.25);
      if (cache.ammoKey !== key) {
        cache.ammoKey = key; const [fg, bg] = ammoDash(n, have); xhAmmo.setAttribute('stroke-dasharray', fg); xhAmmoBg.setAttribute('stroke-dasharray', bg);
        if (ak) { const [fgL, bgL] = ammoDash(n, haveL); xhAmmoL.setAttribute('stroke-dasharray', fgL); xhAmmoBgL.setAttribute('stroke-dasharray', bgL); xhAmmoL.classList.toggle('low', haveL <= lowAt); }
        xhAmmo.classList.toggle('low', have <= lowAt);
      }
      // yellow under a quarter, red and asking for a reload when empty. With two guns it's both mags together: low once
      // they add up to a quarter or less, and "No ammo" (with the reload key, if there's any to load) only when both are
      // empty; a single empty gun is shown by its own arc flashing red
      const res = W8.reserve[D.ammo] || 0, aw = $('ammoWarn'), tot = W8.mag[id] || 0, dry = ak ? am.L === 0 && am.R === 0 : have === 0;
      // while reloading the same spot reads "Reloading", or counts the shells going in
      const mode = W8.reloading ? 'loading' : dry ? (res > 0 ? 'reload' : 'none') : tot <= Math.max(1, Math.floor(magCap(id) * 0.25)) ? 'low' : '';
      const txt = mode === 'loading' ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : mode === 'low' ? 'Low ammo' : mode === 'reload' ? (ak ? 'No ammo <kbd>R</kbd>' : 'Reload <kbd>R</kbd>') : mode === 'none' ? 'No ammo' : '';
      if (!healing && cache.aw !== mode + txt) {
        cache.aw = mode + txt; aw.hidden = !mode;
        aw.classList.remove('low', 'out', 'loading', 'heal'); if (mode) aw.classList.add(mode === 'low' || mode === 'loading' ? mode : 'out');
        awText(aw, txt);
      }
    }
    let rp = 0;
    if (ak) {
      // each gun's ring fills through its own turn, and only its arc dims while it's down being reloaded; a gun running low
      // pulses its arc yellow, and an empty one flashes its whole arc red until it's reloaded
      const am2 = akMags(id), lowA = Math.max(1, akPer(id) * 0.25);
      for (const [s, ring, arc, bg] of [[AK_ON.right, xhRing, xhAmmo, xhAmmoBg], [AK_ON.left, xhRingL, xhAmmoL, xhAmmoBgL]]) {
        const busy = akBusy(s), n = am2[s]; ring.setAttribute('stroke-dasharray', (ARC() * (busy ? akU(s) : 0)).toFixed(1) + ' 999'); ring.style.opacity = busy ? 1 : 0; arc.style.opacity = busy ? 0.25 : 1;
        arc.classList.toggle('flash', n > 0 && n <= lowA && !busy); bg.classList.toggle('out', n === 0 && !busy);
      }
    } else {
    xhAmmo.classList.remove('flash'); xhAmmoBg.classList.remove('out');
    if (W8.reloading === 'mag') rp = 1 - W8.reloadT / W8.reloadMax;
    else if (W8.reloading === 'shell') rp = (W8.shellsIn + (1 - W8.reloadT / W8.reloadMax)) / Math.max(1, W8.shellsNeed);
    xhRing.setAttribute('stroke-dasharray', (ARC() * clamp(rp, 0, 1)).toFixed(1) + ' 999'); xhRing.style.opacity = W8.reloading ? 1 : 0;
    xhAmmo.style.opacity = W8.reloading ? 0.25 : 1;
    }
    const glArc = 2 * Math.PI * (aR + 6) * (84 / 360);
    xhGl.style.display = D.gl ? '' : 'none';
    if (D.gl) xhGl.setAttribute('stroke-dasharray', (glArc * (1 - W8.glCd / (D.glRecharge || 6))).toFixed(1) + ' 999');
  }
}
