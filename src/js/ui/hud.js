// The HUD each frame.

// health, ECG, ammo, weapon name, moodles, slots, screen tints
// a fresh run's max health: anything over it on the bar is bonus health, in its own colour
const BASE_HP = 100;
function updateHUD(rdt, D) {
  // stamina readout eases toward the real value so it never jumps
  ANIM.stamD = (ANIM.stamD === undefined ? 1 : ANIM.stamD) + (P.stam - (ANIM.stamD === undefined ? 1 : ANIM.stamD)) * Math.min(1, rdt * 10);
  { const sb = $('stamBar'), show = state === 'play' && (P.stam < 0.995 || (W(curId()) || {}).melee) ? 1 : 0, key = Math.round(ANIM.stamD * 400) + ':' + show + ':' + P.exh + ':' + (P.stam < 0.35);
    if (cache.stam !== key) { cache.stam = key; $('stamFill').style.transform = `scaleX(${ANIM.stamD.toFixed(4)})`; sb.style.opacity = show; sb.classList.toggle('exh', P.exh); sb.classList.toggle('big', !!S.lungs); sb.classList.toggle('tired', !P.exh && P.stam < 0.35); } }
  if (state === 'title') return;
    hurtFx = Math.max(0, hurtFx - rdt * 2);
    const hpF = P.hp / S.maxHp, low = hpF < 0.3 ? 0.28 + Math.sin(performance.now() / 260) * 0.08 : 0;
    $('hurt').style.opacity = Math.max(hurtFx * 0.9, low);
    // the world drains of colour as you bleed out, and goes red at the edges of your sight; you can still see what's coming
    const grey = Math.round(clamp((0.55 - hpF) / 0.45, 0, 1) * 50) / 50;
    { const rt = Math.round(clamp((0.4 - hpF) / 0.3, 0, 1) * 40) / 40; if (cache.redTint !== rt) { cache.redTint = rt; $('lowTint').style.opacity = rt; } }
    const blur = Math.round((P.conc || 0) * 2.6 * 10) / 10, slow = Math.round(clamp((1 - timeScale) / 0.75, 0, 1) * 60) / 60, fk = grey + ':' + blur + ':' + slow;
    if (cache.grey !== fk) {
      cache.grey = fk;
      cv.style.filter = (grey ? `grayscale(${(grey * 0.85).toFixed(2)}) contrast(${(1 + grey * 0.08).toFixed(2)}) brightness(${(1 + grey * 0.1).toFixed(2)}) ` : '') + (blur ? `blur(${blur}px) brightness(${(1 + blur * 0.06).toFixed(2)}) ` : '') + (slow ? `saturate(${(1 - slow * 0.4).toFixed(2)}) contrast(${(1 + slow * 0.08).toFixed(2)}) hue-rotate(${(-slow * 6).toFixed(1)}deg)` : '');
      $('slowmo').style.opacity = slow; $('slowmo').style.setProperty('--bar', slow);
      if (muff && AC && !(P.conc > 0.05)) muff.frequency.setTargetAtTime(slow ? 20000 - slow * 18800 : 20000, AC.currentTime, 0.12);
    }
    setRoll('wNum', String(Math.max(1, run.wave)).padStart(2, '0'), true);   // it spins round to the new wave
    setT('hpTxt', String(Math.ceil(P.hp))); setT('hpMax', '/ ' + Math.round(S.maxHp));
    $('hpFill').style.width = (hpF * 100) + '%'; $('hpLag').style.width = (hpF * 100) + '%';
    // health over the base 100 (armour, Tough skin, Stubborn...) shows in its own colour past where 100 would end
    { const b = hpF > 0 ? Math.min(100, (BASE_HP / S.maxHp) / hpF * 100) : 100, bk = Math.round(b * 10); if (cache.hpB !== bk) { cache.hpB = bk; $('hpFill').style.setProperty('--b', b.toFixed(1) + '%'); } }
    // the blue part: healing still to come, and while a bandage goes on, as much of its healing as is wound so far
    { const inc = Math.min(1 - hpF, ((P.heal || 0) + bandHeal() * bandProg()) / S.maxHp), hk = Math.round(hpF * 500) + ':' + Math.round(inc * 500);
      if (cache.heal !== hk) { cache.heal = hk; const el = $('hpHeal'); el.style.left = (hpF * 100) + '%'; el.style.width = (inc * 100) + '%'; } }
    // the blue edge builds as a bandage goes on (player/hold.js, healFx), not the moment you start, and stays faint while it heals you
    { const hv = Math.round(Math.min(1, Math.max(0.85 * (ANIM.healFx || 0), 0.45 * Math.min(1, (P.heal || 0) / 12))) * 60) / 60; if (cache.hv !== hv) { cache.hv = hv; $('healVig').style.opacity = hv; } }
    setRoll('bands', String(P.band || 0)); { const e = !(P.band > 0); if (cache.bandE !== e) { cache.bandE = e; $('bandBox').classList.toggle('empty', e); } }
    $('vitals').classList.toggle('low', hpF < 0.3);
    setRoll('planks', String(S.planks)); if (cache.plFull !== (S.planks >= PLANK_MAX)) { cache.plFull = S.planks >= PLANK_MAX; $('planks').classList.toggle('full', cache.plFull); } setRoll('kills', String(run.kills)); setRoll('scrap', String(S.scrap));
    // heartbeat: faster when hurt or pinned, flat when dead
    const bpm = P.hp <= 0 ? 0 : 66 + (1 - hpF) * 90 + P.slow * 30 + (P.adr > 0 ? 25 : 0);
    ecgPhase = (ecgPhase + rdt * bpm / 60) % 1; ecgAcc += rdt * 46;
    while (ecgAcc >= 1) { ecgAcc--; ecg.shift(); ecg.push(bpm ? ecgSample(ecgPhase) + rr(-0.02, 0.02) : 0); }
    $('ecgLine').setAttribute('points', ecg.map((v, i) => `${(i * 2).toFixed(0)},${(18 + v * 14).toFixed(1)}`).join(' '));
    renderMoodles();
    const id = curId();
    setT('wName', D.name);
    // what's on it, as chips edged in the workbench's colours: mods and gun upgrades blue, attachments teal, rounds gold
    const chips = (W8.mods[id] || []).map(m => ({ t: modName(m), k: 'upg' })).concat(gunExtras(id)), ck = chips.map(c => c.k + c.t).join('|');
    if (cache.wMods !== ck) { cache.wMods = ck; $('wMods').innerHTML = chips.map(c => `<span class="${c.k}">${c.t}</span>`).join(''); }
    // a gun in each hand shows each one's mag, the left's on the left (weapons/akimbo.js); a gun being reloaded dims
    const ak = !D.melee && !!D.akimbo, am = ak && akMags(id);
    if (cache.akHud !== ak) { cache.akHud = ak; $('arms').classList.toggle('ak', ak); }
    const ammoEl = (el, have, n, rl) => { el.classList.toggle('out', !D.melee && have === 0); el.classList.toggle('low', !D.melee && have > 0 && have <= Math.max(1, Math.floor(n * 0.25))); el.classList.toggle('rl', !!rl); };
    if (ak) { const per = akPer(id), lt = AK_ON.left, rt = AK_ON.right; setRoll('ammoL', String(am[lt])); setRoll('ammo', String(am[rt])); ammoEl($('ammoL'), am[lt], per, akBusy(lt)); ammoEl($('ammo'), am[rt], per, akBusy(rt)); }   // the left-click gun's on the left
    else { setRoll('ammo', D.melee ? '—' : String(W8.mag[id] || 0)); ammoEl($('ammo'), W8.mag[id] || 0, D.melee ? 0 : magCap(id), false); }
    setRoll('ammoRes', D.melee ? '' : '/ ' + W8.reserve[D.ammo]);
    if (D.melee) { if (cache.rounds !== 'melee') { cache.rounds = 'melee'; $('rounds').innerHTML = ''; } } else renderRounds(id, D);
    renderMeleeArt(id, D); renderFireMode(id);
    // reloading shows under the crosshair; touch play has no crosshair, so it stays here for touch
    const xhShown = hasMouse && !usingTouch && !scoped;
    setRoll('reloadTag', W8.reloading && !xhShown ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : (!W8.reloading && !D.melee && !(W8.mag[id] > 0) && W8.reserve[D.ammo] === 0) ? 'Empty. Craft ammo or switch' : '');
    renderSlots();
    $('tbWave').hidden = phase !== 'break';
    $('tbAlt').hidden = !D.gl;
}
// the fire mode by the ammo count (styles/hud-weapon.css): its rounds and name, with B when the gun can switch; drawn
// again only when the mode or the gun changes
function renderFireMode(id) {
  const m = fireModeOf(id), el = $('fireMode'), key = m ? id + m.k + m.t : '';
  if (cache.fm === key) return;
  const sameGun = cache.fmId === id && !!cache.fm; cache.fm = key; cache.fmId = id;
  el.hidden = !m; if (!m) return;
  const g = el.querySelector('.fmG'), n = m.k === 'burst' ? Math.min(4, m.n) : m.k === 'auto' ? 5 : m.k === 'fan' ? 3 : 1;
  g.className = 'fmG ' + m.k + ({ rifle: ' rf', magnum: ' mg' }[W(id).ammo] || '') + (sameGun ? ' in' : ''); g.innerHTML = '<i></i>'.repeat(n);   // pointed rifle and magnum rounds
  el.querySelector('.fmT b').textContent = m.t; el.querySelector('.fmT kbd').hidden = fireModes(id).length < 2;
  if (sameGun) { el.classList.remove('sw'); void el.offsetWidth; el.classList.add('sw'); }
}
// switching fire mode (B): the selector clicks over in two steps, the new mode's name comes up beside the crosshair
// for a moment, and the HUD's rounds roll over to it
function fireModeSwitched(id) {
  SFX.click(); tn(0.03, 'square', 900, 700, 0.06); setTimeout(() => tn(0.025, 'square', 1350, 1050, 0.05), 70);
  const m = fireModeOf(id), x = $('xhMode'); if (!m) return;
  x.textContent = m.t; x.classList.remove('show'); void x.offsetWidth; x.classList.add('show');
  renderFireMode(id);
}
// bleeding (weapons/combat-update.js): a drop of blood lands on the screen somewhere near its edge, runs down a little
// and dries away; a few at most, the oldest going first (styles/overlays.css)
function screenDrop() {
  const box = $('bleedFx'); if (!box || state !== 'play') return;
  while (box.childElementCount > 8) box.firstElementChild.remove();
  const el = document.createElement('i'), side = rand(), x = side < 0.35 ? rr(2, 14) : side < 0.7 ? rr(86, 97) : rr(14, 86), y = side < 0.7 ? rr(4, 78) : rr(2, 16);
  const sz = rr(10, 30), hold = rr(1.2, 2.2), life = rr(2.5, 3.8);
  el.style.cssText = `left:${x}%;top:${y}%;--s:${sz.toFixed(0)}px;--hold:${hold.toFixed(2)}s;--life:${life.toFixed(2)}s;--run:${rr(0.9, 1.9).toFixed(2)}s;--len:${rr(sz * 0.9, sz * 3).toFixed(0)}px;rotate:${rr(-14, 14).toFixed(0)}deg`;
  box.appendChild(el); setTimeout(() => el.remove(), (hold + life) * 1000 + 100);
}
