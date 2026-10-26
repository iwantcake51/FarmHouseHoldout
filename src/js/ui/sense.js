// Wide eyes from your own eyes (upgrades/tier-table.js: the 'eyes' line). From above the perk opens up your view cone and
// the circle round you; out of your own eyes you already see all round as far as the screen goes, so there it opens the
// view itself a little wider (WIDE_FOV, game/view-cam.js) and you sense what's close by off the edges of the screen: a
// soft pale arc round the middle of the screen on the side each one is (up to SENSE.n at once, the nearest), stronger
// the closer it is, out to the perk's reach (S.near: 4 m, then 6 m), fading in and out as they come and go.

import { cam, V3 } from '../core/renderer.js';
import { clamp, smooth } from '../core/math.js';
import { P } from '../player/player.js';
import { S, T } from '../game/run-state.js';
import { state, worldT } from '../game/state.js';
import { zombies } from '../zombies/zombie-types.js';
import { isoOn, viewBasis } from '../game/view-cam.js';
import { spectating } from '../net/spectate.js';

const SENSE = { n: 4, edge: 0.92, max: 0.62, in: 6, out: 3 };
const senseEls = [], _senP = new V3(), _senN = [];
export function senseStep(rdt) {
  const on = !isoOn() && state === 'play' && !P.dead && !spectating() && (T('eyes') || 0) > 0;
  if (!senseEls.length) for (let i = 0; i < SENSE.n; i++) { const el = document.createElement('div'); el.className = 'senseArc'; document.body.appendChild(el); senseEls.push({ el, o: 0, shown: -1, a: 0 }); }
  _senN.length = 0;
  if (on) {
    cam.updateMatrixWorld();
    for (const z of zombies) {
      if (z.dead) continue;
      const d = Math.hypot(z.x - P.x, z.z - P.z); if (d > S.near) continue;
      // (one you can see on the screen needs no telling)
      _senP.set(z.x, 1.2, z.z).project(cam); if (_senP.z < 1 && Math.abs(_senP.x) < SENSE.edge && Math.abs(_senP.y) < SENSE.edge) continue;
      _senN.push({ z, d });
    }
    _senN.sort((a, b) => a.d - b.d); _senN.length = Math.min(_senN.length, SENSE.n);
  }
  const [F, Rt] = viewBasis();
  for (let i = 0; i < SENSE.n; i++) {
    const E = senseEls[i], N = _senN[i];
    const tgt = N ? SENSE.max * Math.pow(1 - N.d / S.near, 0.7) * (0.85 + 0.15 * Math.sin(worldT * 5 + i)) : 0;
    E.o += (tgt - E.o) * Math.min(1, rdt * (tgt > E.o ? SENSE.in : SENSE.out));
    if (N) { const rx = N.z.x - P.x, rz = N.z.z - P.z; E.a = Math.atan2(rx * Rt.x + rz * Rt.z, rx * F.x + rz * F.z) * 180 / Math.PI; E.el.style.setProperty('--a', E.a.toFixed(1) + 'deg'); }
    const ov = Math.round(smooth(clamp(E.o / SENSE.max, 0, 1)) * SENSE.max * 50) / 50; if (ov !== E.shown) { E.shown = ov; E.el.style.opacity = ov; }
  }
}
