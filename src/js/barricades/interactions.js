// Boarding, station prompts and the on-screen hint.

// door/window boarding, station prompts and the on-screen hint
function updateInteractions(dt) {
  // doors, windows and stations
  const o = nearestOpening(), st = nearestStation();
  openings.forEach(q => { q.hl.visible = q === o && !P.vault && !openSt && (o.boards.length < 3 || !!vaultTarget(o)); if (q.hl.visible) q.hm.opacity = 0.55 + Math.sin(performance.now() / 150) * 0.35; });
  STATIONS.forEach(s => { s.om.visible = s === st || s === openSt; if (s.om.visible) s.om.opacity = 0.6 + Math.sin(performance.now() / 160) * 0.3; });
  if (openSt && (!st || st !== openSt)) closeStation();
  const canBoard = o && o.boards.length < 3 && S.planks > 0 && !(ci(P.x) === o.i && ci(P.z) === o.j) && !P.vault;
  if (o && (keys.has('f') || touchBoard) && canBoard) { boardT += dt * S.boardSpeed; if (boardT >= 0.6) { boardT = 0; S.planks--; addBoard(o); } }
  else boardT = 0;
  const fv = !o && !P.vault && fenceTarget();
  if ((o || st || fv) && !P.vault && !openSt) {
    $('prompt').hidden = false;
    const rows = [];
    if (st) rows.push(`<div><kbd>E</kbd>Use the ${st.name.toLowerCase()}</div>`);
    if (fv) rows.push('<div><kbd>Space</kbd>Hop the fence</div>');
    if (o) {
      const what = o.kind === 'door' ? 'door' : 'window';
      if (vaultTarget(o)) rows.push('<div><kbd>Space</kbd>Climb through the window</div>');
      if (o.boards.length >= 3) rows.push(`<div class="off">The ${what} is fully boarded</div>`);
      else if (S.planks <= 0) rows.push('<div class="off">No planks left. Cut some at the sawhorse.</div>');
      else rows.push(`<div><kbd>F</kbd>Hold to board up the ${what} · ${o.boards.length}/3</div>`);
    }
    setH('pRows', rows.join(''));
    $('promptBar').firstElementChild.style.width = (boardT / 0.6 * 100) + '%';
  } else $('prompt').hidden = true;
  if (openSt) renderStation();
}
