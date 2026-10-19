// Boarding, station prompts and the on-screen hint.

// boarding under attack is slow, fumbling work: during a wave it goes at BOARD_WAVE of the speed. The hammer line
// (upgrades/tier-table.js: S.boardSpeed) speeds it up in full in the break between waves, when there's time to do it
// properly; mid-wave only to the power BOARD_TOOL of it, so even the nail gun is quicker but never instant (about 0.9 of
// the break's bare-handed speed)
const BOARD_WAVE = 0.3, BOARD_TOOL = 0.6;
const boardRate = () => phase === 'wave' ? BOARD_WAVE * Math.pow(S.boardSpeed, BOARD_TOOL) : S.boardSpeed;
// an opening you could board up right now (holding F boards it)
function boardable(o) { return !!(o && o.boards.length < 3 && S.planks > 0 && !(ci(P.x) === o.i && ci(P.z) === o.j) && !P.vault); }
// tearing a board down yourself (hold C, or the touch Tear button): one board a TEAR_T hold, the one on top first, with
// a kick at it as you start and another halfway (barricades/planks.js's tearBoard)
const TEAR_T = 0.5;
let tearT = 0;
const tearable = o => !!(o && o.boards.length && !P.vault && !openSt);
// door/window boarding, station prompts and the on-screen hint
// the colour each kind of prompt picks its thing out in (a gun's is its rarity's colour)
const PROMPT_COL = { thing: '#f0bf4c', station: '#e8c070', move: '#8fc4e0', wood: '#d6a066', tear: '#e08a6a', bad: '#e2412c', off: '#a39e90' };
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
    // each action on its own row: its key (held keys marked "Hold"), what it does with the thing it's done to picked
    // out bold in that thing's colour (PROMPT_COL; a gun in its rarity's), and any extra as a small chip after it
    const rows = [], hex = c => '#' + c.toString(16).padStart(6, '0');
    const row = (k, t, extra, col) => { const hold = k.startsWith('Hold '); return `<div class="pr" style="--pa:${col || PROMPT_COL.thing}">${hold ? '<span class="hold">Hold</span>' : ''}<kbd>${hold ? k.slice(5) : k}</kbd><span class="pt">${t}</span>${extra ? `<em>${extra}</em>` : ''}</div>`; };
    const off = (t, col) => `<div class="pr off" style="--pa:${col || PROMPT_COL.off}"><span class="pt">${t}</span></div>`;
    if (tk) { const id = takeId(tk), old = W8.slot[WEAP[id].slot], gc = hex(weaponCol(id));
      rows.push(row('E', `${tk.kind === 'gun' ? 'Pick up' : 'Take'} the <b>${WEAP[id].name.toLowerCase()}</b>`, old && old !== id ? `drops your ${WEAP[old].short || WEAP[old].name}` : '', gc));
      // co-op: one you put down can be shared with your team (gunShare, net/teamwork.js); it's yours alone till you do
      if (tk.kind === 'gun' && tk.cargo.own && netLink()) rows.push(row('H', tk.cargo.shared ? '<b>Stop sharing</b> it' : '<b>Share</b> it with your team', tk.cargo.shared ? 'your team can take it' : '', NET_COL[NET.idx]));
      else if (tk.kind === 'gun' && tk.cargo.own === false) rows.push(off(`Shared by <b>${tk.cargo.who || 'a teammate'}</b>`, tk.cargo.pc)); }
    else if (st) rows.push(row('E', `Use the <b>${st.name.toLowerCase()}</b>`, '', PROMPT_COL.station));
    if (fv) rows.push(row('Space', 'Hop the <b>fence</b>', '', PROMPT_COL.move));
    if (o) {
      const what = o.kind === 'door' ? 'door' : 'window';
      if (vaultTarget(o)) rows.push(row('Space', 'Climb through the <b>window</b>', '', PROMPT_COL.move));
      if (o.boards.length >= 3) rows.push(off(`The ${what} is <b>fully boarded</b>`, PROMPT_COL.wood));
      else if (S.planks <= 0) rows.push(off('<b>No planks left</b> · cut some at the sawhorse', PROMPT_COL.bad));
      else rows.push(row('Hold F', `Board up the <b>${what}</b>`, `${o.boards.length}/3`, PROMPT_COL.wood));
      if (o.boards.length) rows.push(row('Hold C', 'Tear a <b>board</b> down', '', PROMPT_COL.tear));
    }
    setH('pRows', rows.join(''));
  }
  if (cache.promptOn !== showPrompt) { cache.promptOn = showPrompt; $('prompt').classList.toggle('on', showPrompt); }
  { const bar = $('promptBar'), on = showPrompt && (boardT > 0 || tearT > 0); bar.classList.toggle('on', on); if (on) bar.firstElementChild.style.width = (Math.max(boardT / 0.6, tearT / TEAR_T) * 100) + '%'; }
  if (openSt) renderStation();
}
