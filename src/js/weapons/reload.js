// Switching weapons and reloading.

function equip(s) {
  if (!W8.slot[s] || W8.cur === s) return;
  exitScope(); ANIM.sw = 1; W8.swing = 0;
  W8.cur = s; W8.reloading = null; W8.reloadT = 0; W8.burstLeft = 0; W8.cd = Math.max(W8.cd, 0.15); SFX.click();
}
const reserveOf = id => { const D = W(id); return D.ammo ? W8.reserve[D.ammo] : 0; };
function startReload() {
  const id = curId(), D = W(id); if (!D || D.melee || W8.reloading || P.vault) return;
  const missing = magSize(id) - (W8.mag[id] || 0); if (missing <= 0) return;
  if (reserveOf(id) <= 0) { toast('No ' + AMMO_NAME[D.ammo] + ' left. Craft some at the workbench.'); return; }
  if (EJECT[id] === 'breach' && W8.spent[id] > 0) { ejectCasing(D.ammo, W8.spent[id], id === 'revolver' ? 'dump' : 'breach'); W8.spent[id] = 0; }
  if (D.perShell) {
    W8.reloading = 'shell'; W8.shellsIn = 0; W8.shellsNeed = Math.min(missing, reserveOf(id));
    W8.reloadT = D.perShell * S.reloadMul + 0.12; W8.reloadMax = W8.reloadT;
  } else { W8.reloading = 'mag'; W8.reloadT = W8.reloadMax = D.reload * S.reloadMul; SFX.magOut(); setTimeout(() => { if (W8.reloading === 'mag' && curId() === id) dropMag(id); }, 140); }
}
function tickReload(dt) {
  if (!W8.reloading) return;
  W8.reloadT -= dt; if (W8.reloadT > 0) return;
  const id = curId(), D = W(id);
  if (W8.reloading === 'shell') {
    W8.mag[id] = (W8.mag[id] || 0) + 1; W8.reserve[D.ammo]--; W8.shellsIn++; SFX.shell();
    if (W8.mag[id] < magSize(id) && reserveOf(id) > 0) W8.reloadT = W8.reloadMax = D.perShell * S.reloadMul;
    else { W8.reloading = null; SFX.rack(); W8.cd = Math.max(W8.cd, 0.25); }
  } else {
    const need = magSize(id) - (W8.mag[id] || 0), take = Math.min(need, W8.reserve[D.ammo]);
    W8.mag[id] = (W8.mag[id] || 0) + take; W8.reserve[D.ammo] -= take;
    W8.reloading = null; SFX.magIn();
  }
}
