// The first prep of a run: a dot over each station with its name and what it's for in a few words, so a new player knows
// what's what. They pop in one after another once the intro's over (styles/overlays.css: .benchTip), and fade together
// BTIP_T seconds later, or when the prep is skipped and the wave starts; one goes on its own as soon as you use that
// station (openStation, stations/station-ui.js). Two that would cover each other: the one further back is lifted clear
// above the other on a longer stem.

import { cam, V3 } from '../core/renderer.js';
import { clamp } from '../core/math.js';
import { netLink } from '../net/net.js';
import { STATIONS } from '../stations/stations.js';
import { P } from '../player/player.js';
import { METAL } from '../barricades/planks.js';
import { phase, state } from '../game/state.js';
import { INTRO } from '../game/intro.js';

const BTIP_T = 7.5, BTIP_FADE = 0.6;
const BTIP_TEXT = { bench: 'Upgrade and fit out your guns', get saw() { return METAL.on ? 'Cut metal and plate the grates' : 'Cut planks to board up windows'; }, med: 'Bandages and healing',
  radio: 'Call in a supply drop', rack: 'Unlock weapons, and swap to ones you have', box: 'Give scrap to a teammate' };
const BTIP = { on: false, t: 0, gone: {}, els: null, top: {} };
// a new run (ui/screens.js)
export function benchTipsStart() { BTIP.on = true; BTIP.t = 0; BTIP.gone = {}; }
export function benchTipUsed(id) { BTIP.gone[id] = true; }
const _bt = new V3(), _bb = new THREE.Box3();
export function updateBenchTips(rdt) {
  if (!BTIP.els) {
    BTIP.els = {};
    STATIONS.forEach((s, k) => {
      const el = document.createElement('div'); el.className = 'benchTip hud'; el.hidden = true; el.style.setProperty('--d', (k * 0.12).toFixed(2) + 's');
      el.innerHTML = `<div class="btCard"><b>${s.name}</b><span>${BTIP_TEXT[s.id] || ''}</span></div><i class="btStem"></i><i class="btDot"></i>`;
      document.body.appendChild(el); BTIP.els[s.id] = el;
    });
  }
  const live = BTIP.on && state === 'play' && !P.dead && INTRO.t < 0;
  if (live) { BTIP.t += rdt; if (phase !== 'break') BTIP.t = Math.max(BTIP.t, BTIP_T + 0.001); if (BTIP.t > BTIP_T + BTIP_FADE) BTIP.on = false; }   // (the prep skipped: they fade now)
  for (const s of STATIONS) {
    const el = BTIP.els[s.id], show = live && BTIP.on && !(s.coop && !netLink());
    // fading: every one once its time's up, one on its own once used (the class's transition takes it out)
    const out = !show || BTIP.gone[s.id] || BTIP.t > BTIP_T;
    if (!show && el.hidden) continue;
    if (!show) { el.hidden = true; el.classList.remove('out'); continue; }
    el.hidden = false; el.classList.toggle('out', out);
    // over the top of the station's model
    if (BTIP.top[s.id] === undefined) { s.g.updateMatrixWorld(true); BTIP.top[s.id] = _bb.setFromObject(s.g).max.y; }
    s.g.getWorldPosition(_bt); _bt.y = BTIP.top[s.id] + 0.25; _bt.project(cam);
    s.sx = (_bt.x + 1) / 2 * innerWidth; s.sy = (1 - _bt.y) / 2 * innerHeight; s.tz = _bt.z;
    el.style.transform = `translate(${s.sx.toFixed(1)}px,${s.sy.toFixed(1)}px)`;
  }
  if (live) benchTipsSpread();
}
// lift a label clear of any nearer one it would cover: the cards' sizes measured once, nearest first, each one going up
// past whatever it overlaps
const BTIP_STEM = 26, BTIP_GAP = 6, BTIP_EDGE = 10;
function benchTipsSpread() {
  const on = STATIONS.filter(s => !BTIP.els[s.id].hidden).sort((a, b) => a.tz - b.tz), placed = [];
  for (const s of on) {
    const el = BTIP.els[s.id], c = el.firstElementChild;
    if (!s.cw) { s.cw = c.offsetWidth; s.ch = c.offsetHeight; }
    // kept on the screen: slid in sideways off the stem when its station's near an edge
    const dx = clamp(s.sx, BTIP_EDGE + s.cw / 2, innerWidth - BTIP_EDGE - s.cw / 2) - s.sx, cx = s.sx + dx;
    // (it only ever goes up, and only counts as moved when it does by more than a hair: set to sit just over a card, it
    // can land a rounding error inside it, and lowered again for the next one it could go back and forth for ever,
    // freezing the game; at most one pass for each card already placed)
    let lift = BTIP_STEM;
    for (let moved = true, pass = 0; moved && pass <= placed.length; pass++) {
      moved = false;
      const x0 = cx - s.cw / 2, x1 = cx + s.cw / 2, y1 = s.sy - lift, y0 = y1 - s.ch;
      for (const q of placed) if (x0 < q.x1 + BTIP_GAP && x1 > q.x0 - BTIP_GAP && y0 < q.y1 + BTIP_GAP && y1 > q.y0 - BTIP_GAP) { const up = s.sy - q.y0 + BTIP_GAP; if (up > lift + 0.5) { lift = up; moved = true; } }
    }
    placed.push({ x0: cx - s.cw / 2, x1: cx + s.cw / 2, y0: s.sy - lift - s.ch, y1: s.sy - lift });
    if (s.lift !== lift) { s.lift = lift; el.style.setProperty('--lift', lift + 'px'); }
    if (s.dx !== Math.round(dx)) { s.dx = Math.round(dx); el.style.setProperty('--dx', s.dx + 'px'); }
  }
}
