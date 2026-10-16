// Boarding, station prompts and the on-screen hint.

// boarding under attack without a hammer is slow, fumbling work: during a wave it goes at BOARD_WAVE of the speed, unless
// you've got any of the hammer line (upgrades/tier-table.js). In the break between waves there's time to do it properly
const BOARD_WAVE = 0.3;
const boardSlow = () => phase === 'wave' && !T('hammer');
const boardRate = () => S.boardSpeed * (boardSlow() ? BOARD_WAVE : 1);
// an opening you could board up right now (holding F boards it)
function boardable(o) { return !!(o && o.boards.length < 3 && S.planks > 0 && !(ci(P.x) === o.i && ci(P.z) === o.j) && !P.vault); }
// tearing a board down yourself (hold C, or the touch Tear button): one board a TEAR_T hold, the one on top first, with
// a kick at it as you start and another halfway (barricades/planks.js's tearBoard)
const TEAR_T = 0.5;
let tearT = 0;
const tearable = o => !!(o && o.boards.length && !P.vault && !openSt);
// door/window boarding, station prompts and the on-screen hint
function updateInteractions(dt) {
  // doors, windows and stations
  const o = nearestOpening(), st = nearestStation();
  openings.forEach(q => { q.hl.visible = q === o && !P.vault && !openSt && (o.boards.length < 3 || !!vaultTarget(o)); if (q.hl.visible) q.hm.opacity = 0.55 + Math.sin(performance.now() / 150) * 0.35; });
  STATIONS.forEach(s => { s.om.visible = s === st || s === openSt; if (s.om.visible) s.om.opacity = 0.6 + Math.sin(performance.now() / 160) * 0.3; });
  if (openSt && (!st || st !== openSt)) closeStation();
  const canBoard = boardable(o);
  if (o && (keys.has('f') || touchBoard) && canBoard) { boardT += dt * boardRate(); if (boardT >= 0.6) { boardT = 0; S.planks--; addBoard(o); netBoardUp(o); } }
  else boardT = 0;
  if (o && (keys.has('c') || touchTear) && tearable(o)) {
    const was = tearT; tearT += dt;
    if (was === 0 || (was < TEAR_T / 2 && tearT >= TEAR_T / 2)) { boardJolt(o, { x: P.x, z: P.z, vis: 1 }); SFX.board(); }
    if (tearT >= TEAR_T) { tearT = 0; tearBoard(o); }
  } else tearT = 0;
  const fv = !o && !P.vault && fenceTarget(), tk = nearestTake();
  // the prompt eases in and out (the 'on' class); its rows stay put while it fades so it never blinks empty
  const showPrompt = !!(o || st || fv || tk) && !P.vault && !openSt;
  if (showPrompt) {
    const rows = [], row = (k, t, extra) => `<div class="pr"><kbd>${k}</kbd><span>${t}</span>${extra || ''}</div>`;
    if (tk) { const id = takeId(tk), old = W8.slot[WEAP[id].slot]; rows.push(row('E', `${tk.kind === 'gun' ? 'Pick up' : 'Take'} the ${WEAP[id].name.toLowerCase()}`, old && old !== id ? `<em>drops your ${WEAP[old].short || WEAP[old].name}</em>` : '')); }
    else if (st) rows.push(row('E', `Use the ${st.name.toLowerCase()}`));
    if (fv) rows.push(row('Space', 'Hop the fence'));
    if (o) {
      const what = o.kind === 'door' ? 'door' : 'window';
      if (vaultTarget(o)) rows.push(row('Space', 'Climb through the window'));
      if (o.boards.length >= 3) rows.push(`<div class="pr off"><span>The ${what} is fully boarded</span></div>`);
      else if (S.planks <= 0) rows.push('<div class="pr off"><span>No planks left. Cut some at the sawhorse.</span></div>');
      else rows.push(row('Hold F', `Board up the ${what}`, `<em>${o.boards.length}/3${boardSlow() ? ' · slow without a hammer' : ''}</em>`));
      if (o.boards.length) rows.push(row('Hold C', 'Tear a board down'));
    }
    setH('pRows', rows.join(''));
  }
  if (cache.promptOn !== showPrompt) { cache.promptOn = showPrompt; $('prompt').classList.toggle('on', showPrompt); }
  { const bar = $('promptBar'), on = showPrompt && (boardT > 0 || tearT > 0); bar.classList.toggle('on', on); if (on) bar.firstElementChild.style.width = (Math.max(boardT / 0.6, tearT / TEAR_T) * 100) + '%'; }
  if (openSt) renderStation();
}
