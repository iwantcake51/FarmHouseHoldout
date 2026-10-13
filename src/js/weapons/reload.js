// Switching weapons and reloading.

function equip(s) {
  if (!W8.slot[s] || W8.cur === s) return;
  exitScope(); ANIM.sw = 0.35; W8.swing = 0;
  startSwap(W8.cur, s);   // put the old one away and draw this one (player/swap.js)
  W8.cur = s; W8.reloading = null; W8.reloadT = 0; W8.burstLeft = 0; W8.cd = Math.max(W8.cd, SWAP_FIRE); SFX.click();
}
// reloading slows you down: a little with a sidearm, more with a long gun, and more again the bigger the magazine
// (a 13-round pistol about 15%, a 30-round rifle about a quarter, the 100-round LMG belt nearly half)
function reloadSlow() {
  if (!W8.reloading) return 1;
  const id = curId(), D = W(id); if (!D || D.melee) return 1;
  const base = D.slot === 'side' ? 0.12 : D.slot === 'long' ? 0.2 : 0.17;
  return 1 - Math.min(0.48, base + Math.min(0.28, magSize(id) / 360));
}
const reserveOf = id => { const D = W(id); return D.ammo ? W8.reserve[D.ammo] : 0; };
function startReload() {
  const id = curId(), D = W(id); if (!D || D.melee || W8.reloading || P.vault || P.bandT > 0 || swapSt) return;   // hands are busy with the bandage, or still drawing
  const missing = magSize(id) - (W8.mag[id] || 0); if (missing <= 0) return;
  if (reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left', { kind: 'bad', icon: 'ammo', sub: 'Craft some at the workbench' }); return; }
  // the revolver dumps every empty at once, a beat after the cylinder swings out
  if (EJECT[id] === 'breach' && W8.spent[id] > 0) { const n = W8.spent[id]; W8.spent[id] = 0; if (id === 'revolver') setTimeout(() => { if (W8.reloading && curId() === id) { ejectCasing(D.ammo, n, 'dump'); reloadJolt(0.12); } else W8.spent[id] = (W8.spent[id] || 0) + n; }, 130); else ejectCasing(D.ammo, n, 'breach'); }
  if (D.perShell) {
    W8.reloading = 'shell'; W8.shellsIn = 0; W8.shellsNeed = Math.min(missing, reserveOf(id));
    W8.reloadT = D.perShell * S.reloadMul + (id === 'revolver' ? 0.3 : 0.12); W8.reloadMax = W8.reloadT;
  } else { W8.reloading = 'mag'; W8.reloadT = W8.reloadMax = D.reload * S.reloadMul; SFX.magOut(); reloadJolt(0.12); setTimeout(() => { if (W8.reloading === 'mag' && curId() === id) { dropMag(id); reloadJolt(0.08); } }, 140); }
}
function tickReload(dt) {
  if (!W8.reloading) return;
  W8.reloadT -= dt; if (W8.reloadT > 0) return;
  const id = curId(), D = W(id);
  if (W8.reloading === 'shell') {
    W8.mag[id] = (W8.mag[id] || 0) + 1; W8.reserve[D.ammo]--; W8.shellsIn++; SFX.shell(); reloadJolt(0.09);
    if (W8.mag[id] < magSize(id) && reserveOf(id) > 0) W8.reloadT = W8.reloadMax = D.perShell * S.reloadMul;
    else { W8.reloading = null; SFX.rack(); reloadJolt(0.22); W8.cd = Math.max(W8.cd, 0.25); }
  } else {
    const need = magSize(id) - (W8.mag[id] || 0), take = Math.min(need, W8.reserve[D.ammo]);
    W8.mag[id] = (W8.mag[id] || 0) + take; W8.reserve[D.ammo] -= take;
    W8.reloading = null; SFX.magIn(); reloadJolt(0.26);   // the fresh mag slapped home
  }
}
