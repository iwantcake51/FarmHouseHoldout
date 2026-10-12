// The HUD each frame.

// health, ECG, ammo, weapon name, moodles, slots, screen tints
function updateHUD(rdt, D) {
  // stamina readout eases toward the real value so it never jumps
  ANIM.stamD = (ANIM.stamD === undefined ? 1 : ANIM.stamD) + (P.stam - (ANIM.stamD === undefined ? 1 : ANIM.stamD)) * Math.min(1, rdt * 10);
  { const sb = $('stamBar'), show = state === 'play' && (P.stam < 0.995 || (W(curId()) || {}).melee) ? 1 : 0, key = Math.round(ANIM.stamD * 400) + ':' + show + ':' + P.exh + ':' + (P.stam < 0.35);
    if (cache.stam !== key) { cache.stam = key; $('stamFill').style.transform = `scaleX(${ANIM.stamD.toFixed(4)})`; sb.style.opacity = show; sb.classList.toggle('exh', P.exh); sb.classList.toggle('tired', !P.exh && P.stam < 0.35); } }
  if (state === 'title') return;
    hurtFx = Math.max(0, hurtFx - rdt * 2);
    const hpF = P.hp / S.maxHp, low = hpF < 0.3 ? 0.45 + Math.sin(performance.now() / 260) * 0.12 : 0;
    $('hurt').style.opacity = Math.max(hurtFx * 0.9, low);
    // the world drains of colour as you bleed out
    const grey = Math.round(clamp((0.55 - hpF) / 0.45, 0, 1) * 50) / 50;
    const blur = Math.round((P.conc || 0) * 2.6 * 10) / 10, slow = Math.round(clamp((1 - timeScale) / 0.75, 0, 1) * 60) / 60, fk = grey + ':' + blur + ':' + slow;
    if (cache.grey !== fk) {
      cache.grey = fk;
      cv.style.filter = (grey ? `grayscale(${grey}) contrast(${(1 + grey * 0.18).toFixed(2)}) brightness(${(1 - grey * 0.12).toFixed(2)}) ` : '') + (blur ? `blur(${blur}px) brightness(${(1 + blur * 0.06).toFixed(2)}) ` : '') + (slow ? `saturate(${(1 - slow * 0.4).toFixed(2)}) contrast(${(1 + slow * 0.08).toFixed(2)}) hue-rotate(${(-slow * 6).toFixed(1)}deg)` : '');
      $('slowmo').style.opacity = slow; $('slowmo').style.setProperty('--bar', slow);
      if (muff && AC && !(P.conc > 0.05)) muff.frequency.setTargetAtTime(slow ? 20000 - slow * 18800 : 20000, AC.currentTime, 0.12);
    }
    setT('wNum', String(Math.max(1, run.wave)).padStart(2, '0'));
    setT('hpTxt', String(Math.ceil(P.hp))); setT('hpMax', '/ ' + Math.round(S.maxHp));
    $('hpFill').style.width = (hpF * 100) + '%'; $('hpLag').style.width = (hpF * 100) + '%';
    { const inc = Math.min(1 - hpF, (P.heal || 0) / S.maxHp), hk = Math.round(hpF * 500) + ':' + Math.round(inc * 500);
      if (cache.heal !== hk) { cache.heal = hk; const el = $('hpHeal'); el.style.left = (hpF * 100) + '%'; el.style.width = (inc * 100) + '%'; } }
    { const hv = Math.round(Math.min(1, (P.bandT > 0 ? 0.7 : 0) + Math.min(1, (P.heal || 0) / 12)) * 40) / 40; if (cache.hv !== hv) { cache.hv = hv; $('healVig').style.opacity = hv; } }
    setT('bands', String(P.band || 0)); { const e = !(P.band > 0); if (cache.bandE !== e) { cache.bandE = e; $('bandBox').classList.toggle('empty', e); } }
    $('vitals').classList.toggle('low', hpF < 0.3);
    setT('planks', String(S.planks)); setT('kills', String(run.kills)); setT('scrap', String(S.scrap));
    // heartbeat: faster when hurt or pinned, flat when dead
    const bpm = P.hp <= 0 ? 0 : 66 + (1 - hpF) * 90 + P.slow * 30 + (P.adr > 0 ? 25 : 0);
    ecgPhase = (ecgPhase + rdt * bpm / 60) % 1; ecgAcc += rdt * 46;
    while (ecgAcc >= 1) { ecgAcc--; ecg.shift(); ecg.push(bpm ? ecgSample(ecgPhase) + rr(-0.02, 0.02) : 0); }
    $('ecgLine').setAttribute('points', ecg.map((v, i) => `${(i * 2).toFixed(0)},${(18 + v * 14).toFixed(1)}`).join(' '));
    renderMoodles();
    const id = curId();
    setT('wName', D.name);
    const own = (W8.mods[id] || []).map(m => MODS[m].name);
    setT('wMods', D.melee ? own.join(' · ') : own.concat(cache.modsGeneral || []).join(' · '));
    setT('ammo', D.melee ? '—' : String(W8.mag[id] || 0));
    { const n = D.melee ? 0 : magSize(id), have = W8.mag[id] || 0, el = $('ammo'); el.classList.toggle('out', !D.melee && have === 0); el.classList.toggle('low', !D.melee && have > 0 && have <= Math.max(1, Math.floor(n * 0.25))); }
    setT('ammoRes', D.melee ? '' : '/ ' + W8.reserve[D.ammo]);
    if (D.melee) { if (cache.rounds !== 'melee') { cache.rounds = 'melee'; $('rounds').innerHTML = ''; } } else renderRounds(id, D);
    renderMeleeArt(id, D);
    // reloading shows under the crosshair; touch play has no crosshair, so it stays here for touch
    const xhShown = hasMouse && !usingTouch && !scoped;
    setT('reloadTag', W8.reloading && !xhShown ? (W8.reloading === 'shell' ? `Loading ${W8.shellsIn}/${W8.shellsNeed}` : 'Reloading') : (!W8.reloading && !D.melee && !(W8.mag[id] > 0) && W8.reserve[D.ammo] === 0) ? 'Empty. Craft ammo or switch' : '');
    renderSlots();
    $('tbWave').hidden = phase !== 'break';
    $('tbAlt').hidden = !D.gl;
}
