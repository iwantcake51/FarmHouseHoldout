// Boarding, station prompts and the on-screen hint.

import { $ } from '../core/dom.js';
import { keyIcon } from '../ui/input-icons.js';
import { KB } from '../input/keybinds.js';
import { cache, rand } from '../core/math.js';
import { NET, NET_COL, netLink } from '../net/net.js';
import { ci } from '../world/grid.js';
import { openings } from '../world/house.js';
import { STATIONS } from '../stations/stations.js';
import { P } from '../player/player.js';
import { WEAP } from '../weapons/gun-stats.js';
import { roman } from '../weapons/mod-levels.js';
import { S, W8 } from '../game/run-state.js';
import { nearestTake, takeId, weaponCol } from '../pickups/pickups.js';
import { addBoard, boardHp, boardRattle, METAL, setFlowDirty, setLightsDirty, tearBoard } from './planks.js';
import { addGrate, GRATE, regrate } from './metal-bars.js';
import { fenceTarget, nearestOpening, vaultTarget } from '../player/vaulting.js';
import { closeStation, nearestStation, openSt, renderStation } from '../stations/station-ui.js';
import { SFX } from '../audio/sfx.js';
import { soundAt } from '../audio/spatial.js';
import { boardT, phase, setBoardT } from '../game/state.js';
import { keys } from '../input/keyboard-mouse.js';
import { touchBoard, touchTear } from '../input/touch.js';
import { runStat } from '../ui/run-stats.js';
import { setH } from '../ui/hud-text.js';
import { netBoardUp, netRepair } from '../net/sync.js';

// boarding under attack is slow, fumbling work: during a wave it goes at BOARD_WAVE of the speed. The hammer line
// (upgrades/tier-table.js: S.boardSpeed) speeds it up in full in the break between waves, when there's time to do it
// properly; mid-wave only to the power BOARD_TOOL of it, so even the nail gun is quicker but never instant (about 0.9 of
// the break's bare-handed speed)
const BOARD_WAVE = 0.3, BOARD_TOOL = 0.6;
const boardRate = () => phase === 'wave' ? BOARD_WAVE * Math.pow(S.boardSpeed, BOARD_TOOL) : S.boardSpeed;
// an opening you could board up right now (holding F boards it): once there's a metalwork bench, bar with a grate
// instead, one to an opening (barricades/metal-bars.js), when it's bare and you carry enough metal for one
const BOARD_T = 0.6, holdT = () => METAL.on ? GRATE.t : BOARD_T;
const fullyBarred = o => o.grate || o.boards.length >= 3 || (METAL.on && o.boards.length > 0);
function boardable(o) { return !!(o && !fullyBarred(o) && S.planks >= (METAL.on ? GRATE.cost : 1) && !(ci(P.x) === o.i && ci(P.z) === o.j) && !P.vault); }
// putting a barricade right between waves (never during one): one that's taken a beating but is still up is mended
// with Hold F before anything new goes on it. A board, each in turn, is nailed back tight for nothing (it's the same
// board: no plank used, none added); a grate, plates, bars and all, for a third of what a new one costs (REPAIR.gk).
// board, grate: how long each takes (s, at the hammer's pace); dmg: under how much of its strength it counts as damaged
const REPAIR = { board: 0.55, grate: 1.6, gk: 1 / 3, dmg: 0.97 };
const repairCost = () => Math.ceil(GRATE.cost * REPAIR.gk);
let repT = 0;
function repairWhat(o) {
  if (!o || !o.boards.length || P.vault || openSt) return null;
  if (o.grate) { const G = o.grate; return o.boards[0] < G.hp0 * REPAIR.dmg || G.plates.some(p => !p.on) || G.bars.some(b => !b.on) || G.straps.some(q => !q.on) ? { kind: 'grate', j: 0 } : null; }
  for (let j = 0; j < o.boards.length; j++) { const m = o.meshes[j], h0 = (m && m.userData.hp0) || boardHp(); if (o.boards[j] < h0 * REPAIR.dmg) return { kind: 'board', j }; }
  return null;
}
// mended: the board back to the strength it went up with, nailed tight; the grate rebuilt good as new (its plates swung
// back in). Anyone's repair, the same on every screen (net/sync.js: 'rp')
export function repairBarricade(o, kind, j, mine) {
  if (mine) runStat('repairs');
  if (kind === 'grate') { if (!o.grate) return; regrate(o); const s = () => SFX.clang(0.6); mine ? s() : soundAt(o.x, o.z, s); }
  else { const m = o.meshes[j]; if (!m || o.grate) return; o.boards[j] = Math.max(o.boards[j], m.userData.hp0 || boardHp()); m.userData.jolt = 0.5; m.userData.jSide = rand() < 0.5 ? -1 : 1; mine ? SFX.board() : soundAt(o.x, o.z, () => SFX.board()); }
  o.netT = performance.now() + 1500; setFlowDirty(true); setLightsDirty(true);
}
// tearing the boards down yourself (hold C, or the touch Tear button): every board on the opening in one TEAR_T hold,
// a kick at them as you start and another halfway; a grate takes longer (GRATE.tear, barricades/metal-bars.js), kicked
// at every quarter of the way (barricades/planks.js's tearBoard)
const TEAR_T = 0.65;
let tearT = 0;
const tearHold = o => o && o.grate ? GRATE.tear : TEAR_T;
const tearable = o => !!(o && o.boards.length && !P.vault && !openSt);
// door/window boarding, station prompts and the on-screen hint
// the colour each kind of prompt picks its thing out in (a gun's is its rarity's colour)
const OPEN_OK = 0xf4f1ea, OPEN_NO = 0xe2412c;   // an opening's outline: white, red for a window you can't climb through
const PROMPT_COL = { thing: '#f0bf4c', station: '#e8c070', move: '#8fc4e0', wood: '#d6a066', metal: '#a9bccb', tear: '#e08a6a', bad: '#e2412c', off: '#a39e90' };
export function updateInteractions(dt) {
  // doors, windows and stations
  const o = nearestOpening(), st = nearestStation();
  // the opening you'd work on outlined on your side of it, pulsing as the stations' outlines do (world/house.js)
  openings.forEach(q => {
    // a window you can't climb through (boarded, barred, or nowhere to land) outlined red
    const win = q.kind === 'window', noVault = win && !vaultTarget(q), on = q === o && !P.vault && !openSt && (win || !fullyBarred(o)), sd = (P.x - q.x) * (q.axis === 'x' ? 0 : 1) + (P.z - q.z) * (q.axis === 'x' ? 1 : 0) < 0 ? 0 : 1;
    q.hl.forEach((p, k) => { p.om.visible = on && k === sd; if (p.om.visible) { p.om.opacity = 0.6 + Math.sin(performance.now() / 160) * 0.3; p.om.color.setHex(noVault ? OPEN_NO : OPEN_OK); } });   // (it fades out: effects/screen-outlines.js)
  });
  STATIONS.forEach(s => { s.om.visible = s === st || s === openSt; if (s.om.visible) s.om.opacity = 0.6 + Math.sin(performance.now() / 160) * 0.3; });
  if (openSt && (!st || st !== openSt)) closeStation();
  const fix = phase === 'break' ? repairWhat(o) : null, canFix = !!fix && (fix.kind === 'board' || S.planks >= repairCost());
  const canBoard = !fix && boardable(o);
  if (o && (keys.has(KB.board) || touchBoard) && canFix) {
    const was = repT, th = fix.kind === 'grate' ? REPAIR.grate : REPAIR.board; repT += dt * S.boardSpeed; setBoardT(0);
    // you're heard at it: a clank or a hammer blow every so often
    if (Math.floor(was / 0.3) !== Math.floor(repT / 0.3)) { if (fix.kind === 'grate') SFX.clang(0.3); else SFX.board(); }
    if (repT >= th) { repT = 0; if (fix.kind === 'grate') S.planks -= repairCost(); repairBarricade(o, fix.kind, fix.j, true); netRepair(o, fix.kind, fix.j); }
  } else repT = 0;
  if (o && (keys.has(KB.board) || touchBoard) && canBoard) {
    const was = boardT; setBoardT(boardT + (dt * boardRate()));
    // a grate takes a while: you're heard working at it, a clank every half a hold or so, as it's fitted
    if (METAL.on && Math.floor(was / 0.55) !== Math.floor(boardT / 0.55)) SFX.clang(0.3);
    if (boardT >= holdT()) { setBoardT(0); if (METAL.on) { S.planks -= GRATE.cost; addGrate(o); } else { S.planks--; addBoard(o); } netBoardUp(o); }
  }
  else setBoardT(0);
  if (o && (keys.has(KB.tear) || touchTear) && tearable(o)) {
    const was = tearT, th = tearHold(o); tearT += dt;
    // a kick at it as you start and every quarter of the way after (a board's just the one more, halfway)
    const beats = 4;
    if (was === 0 || Math.floor(was / th * beats) !== Math.floor(tearT / th * beats)) { boardRattle(o, { x: P.x, z: P.z, vis: 1 }); if (!o.grate) SFX.board(); }
    if (tearT >= th) { tearT = 0; tearBoard(o); }
  } else tearT = 0;
  const fv = !o && !P.vault && fenceTarget(), tk = nearestTake();
  // the prompt eases in and out (the 'on' class); its rows stay put while it fades so it never blinks empty
  const showPrompt = !!(o || st || fv || tk) && !P.vault && !openSt;
  if (showPrompt) {
    // each action on its own row: its key (held keys marked "Hold"), what it does with the thing it's done to picked
    // out bold in that thing's colour (PROMPT_COL; a gun in its rarity's), and any extra as a small chip after it
    const rows = [], hex = c => '#' + c.toString(16).padStart(6, '0');
    const row = (k, t, extra, col) => { const hold = k.startsWith('Hold '); return `<div class="pr" style="--pa:${col || PROMPT_COL.thing}">${hold ? '<span class="hold">Hold</span>' : ''}<kbd class="ki">${keyIcon(hold ? k.slice(5) : k)}</kbd><span class="pt">${t}</span>${extra ? `<em>${extra}</em>` : ''}</div>`; };
    const off = (t, col) => `<div class="pr off" style="--pa:${col || PROMPT_COL.off}"><span class="pt">${t}</span></div>`;
    if (tk) { const id = takeId(tk), old = W8.slot[WEAP[id].slot], gc = hex(weaponCol(id));
      rows.push(row(KB.use, `${tk.kind === 'gun' ? 'Pick up' : 'Take'} the <b>${WEAP[id].name.toLowerCase()}</b>`, old && old !== id ? `drops your ${WEAP[old].short || WEAP[old].name}` : '', gc));
      // co-op: one you put down can be shared with your team (gunShare, net/teamwork.js); it's yours alone till you do
      if (tk.kind === 'gun' && tk.cargo.own && netLink()) rows.push(row(KB.share, tk.cargo.shared ? '<b>Stop sharing</b> it' : '<b>Share</b> it with your team', tk.cargo.shared ? 'your team can take it' : '', NET_COL[NET.idx]));
      else if (tk.kind === 'gun' && tk.cargo.own === false) rows.push(off(`Shared by <b>${tk.cargo.who || 'a teammate'}</b>`, tk.cargo.pc)); }
    else if (st) rows.push(row(KB.use, `Use the <b>${st.name.toLowerCase()}</b>`, '', PROMPT_COL.station));
    if (fv) rows.push(row(KB.vault, 'Hop the <b>fence</b>', '', PROMPT_COL.move));
    if (o) {
      const what = o.kind === 'door' ? 'door' : 'window';
      if (vaultTarget(o)) rows.push(row(KB.vault, 'Climb through the <b>window</b>', '', PROMPT_COL.move));
      const dmg = !fix && phase !== 'break' && repairWhat(o);
      if (fix && fix.kind === 'grate') rows.push(canFix ? row('Hold ' + KB.board, `Repair the <b>grate</b>`, `${repairCost()} metal`, PROMPT_COL.metal) : off(`<b>${S.planks ? `Only ${S.planks} of ${repairCost()} metal` : 'No metal'}</b> to repair it`, PROMPT_COL.bad));
      else if (fix) rows.push(row('Hold ' + KB.board, `Repair the <b>${o.boards.length > 1 ? 'damaged board' : 'board'}</b>`, 'free', PROMPT_COL.wood));
      else if (o.grate) rows.push(off(`The ${what} is <b>barred</b>${o.grate.tier ? ` · plated ${roman(o.grate.tier)}` : ''}${dmg ? ' · repair it between waves' : ''}`, PROMPT_COL.metal));
      else if (o.boards.length >= 3) rows.push(off(`The ${what} is <b>fully boarded</b>${dmg ? ' · repair it between waves' : ''}`, PROMPT_COL.wood));
      else if (METAL.on && o.boards.length) rows.push(off('Tear the <b>boards</b> down to bar it', PROMPT_COL.off));
      else if (METAL.on && S.planks < GRATE.cost) rows.push(off(`<b>${S.planks ? `Only ${S.planks} of ${GRATE.cost} metal` : 'No metal left'}</b> · cut some at the metalwork bench`, PROMPT_COL.bad));
      else if (S.planks <= 0) rows.push(off('<b>No planks left</b> · cut some at the sawhorse', PROMPT_COL.bad));
      else if (METAL.on) rows.push(row('Hold ' + KB.board, `Bar the <b>${what}</b>`, `${GRATE.cost} metal`, PROMPT_COL.metal));
      else rows.push(row('Hold ' + KB.board, `Board up the <b>${what}</b>`, `${o.boards.length}/3`, PROMPT_COL.wood));
      if (o.grate) rows.push(row('Hold ' + KB.tear, 'Tear the <b>grate</b> down', '', PROMPT_COL.tear));
      else if (o.boards.length) rows.push(row('Hold ' + KB.tear, `Tear the <b>${o.boards.length > 1 ? 'boards' : 'board'}</b> down`, '', PROMPT_COL.tear));
    }
    setH('pRows', rows.join(''));
  }
  if (cache.promptOn !== showPrompt) { cache.promptOn = showPrompt; $('prompt').classList.toggle('on', showPrompt); }
  { const bar = $('promptBar'), on = showPrompt && (boardT > 0 || tearT > 0 || repT > 0); bar.classList.toggle('on', on); if (on) bar.firstElementChild.style.width = (Math.max(boardT / holdT(), tearT / tearHold(o), fix ? repT / (fix.kind === 'grate' ? REPAIR.grate : REPAIR.board) : 0) * 100) + '%'; }
  if (openSt) renderStation();
}
