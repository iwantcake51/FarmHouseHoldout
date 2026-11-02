// Fire on people in the arena: a dragon's breath shell (weapons/rounds.js) sets whoever it hits alight, as it does a
// zombie. It catches where the pellets went in (that limb) and spreads out over the rest of them in a second and a half,
// charring them as it goes (black all over in about six seconds once it's all alight, the char's edge and cracks
// glowing like embers while they burn: effects/body-blood.js), and hurts in ticks, a little every half second, for
// three seconds from the last shell that caught them (PFIRE: how long, how often, how much a tick, a fair bit less than
// a zombie takes; how long the spread over them takes and how fierce it is where it caught first). Health doesn't come
// back while you burn. A burn that finishes someone is the shooter's kill, with the gun that lit them.
// Whose game burns whom: yours burns you (and tells everyone, 'pf', so they see you alight); the host's burns its bots.
// Everyone draws the flames and the char on whoever's alight from that, and the shooter sees each tick as an orange
// number on them. On fire yourself, the edges of your view burn: flames licking in from them over a heat shimmer, eased
// in as it takes and out as it dies (effects/post.js, POST.heat).

import { clamp, smooth } from '../core/math.js';
import { V3 } from '../core/renderer.js';
import { NET, NET_ON, netSend } from '../net/net.js';
import { P, PM } from '../player/player.js';
import { burnFx } from '../effects/puffs.js';
import { charYou } from '../effects/body-blood.js';
import { POST } from '../effects/post.js';
import { fpOn } from '../game/view-cam.js';
import { BOTS } from './bots.js';
import { PVP, pvpBurnHit, pvpBurnNum } from './pvp.js';

export const PFIRE = { len: 3, tick: 0.5, dmg: 4, spread: 0.7, at: 1.4, char: 0.17, heatIn: 2.5, heatOut: 1.1, resend: 0.4 };
// a fire lit on someone (F, or a new one), or kept going by another shell: from the limb it caught on (part), by whom
// and with what (by, w, g: the gun as it was, for the kill feed)
export function fireLight(F, part, by, w, g) {
  if (!F) F = { t: 0, age: 0, tick: PFIRE.tick, from: part || 'torso', char: 0 };   // (the first tick at once: it burns from the moment it catches)
  F.t = PFIRE.len; F.by = by; F.w = w; F.g = g; return F;
}
// a fire's step: its time run down and how many ticks of it are due
export function fireStep(F, dt) { F.t -= dt; F.age += dt; F.tick += dt; let n = 0; while (F.tick >= PFIRE.tick) { F.tick -= PFIRE.tick; n++; } return n; }
// how much of them it's taken, 0 (just where it caught) to 1 (all of them)
const fireK = F => F ? smooth(clamp(F.age / PFIRE.spread, 0, 1)) : 0;
// the flames on a body: all over as the fire takes it, and fierce where it caught first (the middle of that limb)
const _fV = new V3();
function fireFx(F, x, z, limb, dt) {
  const k = fireK(F);
  if (k > 0.01) burnFx(x, z, 0.45, 1.5, 0.2 * (0.4 + 0.6 * k), dt * k);
  if (k < 0.99 && limb) {
    limb.getWorldPosition(_fV);
    if (F.from === 'legL' || F.from === 'legR') _fV.y *= 0.55; else if (F.from === 'armL' || F.from === 'armR') _fV.y -= 0.16;
    burnFx(_fV.x, _fV.z, _fV.y - 0.08, _fV.y + 0.22, 0.07, dt * (1 - k) * PFIRE.at);
  }
  F.char = Math.min(1, F.char + dt * PFIRE.char * (0.25 + 0.75 * k));
}

// the flames on someone the moment a shell catches them, before the fire's own step has taken hold
export function fireBurst(x, z) { burnFx(x, z, 0.5, 1.5, 0.22, 0.45); }
// ---- you
let youChar = 0, youSent = -9;
// a dragon's breath hit on you (pvp/pvp.js NET_ON.ph): alight, or burning on longer, and everyone told
export function fireYou(m) {
  const fresh = !PVP.fire; PVP.fire = fireLight(PVP.fire, m.fp || m.p, m.f, m.w, m.g);
  const now = performance.now() / 1000;
  if (fresh || now - youSent > PFIRE.resend) { youSent = now; netSend('pf', { p: PVP.fire.from, t: PFIRE.len, by: m.f }); }
  if (fresh && !fpOn()) fireBurst(P.x, P.z);
}
// put out (gone down, a new life, the round over): told to everyone; the char stays on you till you're back in
function fireOut() { if (PVP.fire) { PVP.fire = null; netSend('pf', { t: 0 }); } }
// clean of it, a new life
export function fireClean() { PVP.fire = null; youChar = 0; charYou(0, 0); }

// every step (pvp/pvp.js pvpUpdate): your burn, its ticks off your health (pvpBurnHit) and its flames on you (not in
// first person, where they'd be in your eyes: the edges of your view burn instead); and everyone else's flames, char
// and, if you lit them, ticks
let fireRt = 0;
export function fireUpdate(dt) {
  const now = performance.now(), rdt = fireRt ? Math.min(0.1, (now - fireRt) / 1000) : 0; fireRt = now;
  const F = PVP.fire;
  if (F && (P.dead || PVP.ph !== 'live')) fireOut();
  else if (F) {
    const n = fireStep(F, dt);
    for (let i = 0; i < n && !P.dead; i++) pvpBurnHit(PFIRE.dmg, F);
    if (!fpOn()) fireFx(F, P.x, P.z, PM[F.from], dt); else F.char = Math.min(1, F.char + dt * PFIRE.char * (0.25 + 0.75 * fireK(F)));
    youChar = Math.max(youChar, F.char);
    if (F.t <= 0) fireOut();
  }
  charYou(youChar, PVP.fire ? 1 : 0);
  // the heat round the edges of your view, eased in and out
  const want = PVP.fire && !P.dead ? 0.55 + 0.45 * fireK(PVP.fire) : 0;
  POST.heat = clamp((POST.heat || 0) + clamp(want - (POST.heat || 0), -rdt / PFIRE.heatOut, rdt / PFIRE.heatIn), 0, 1);
  for (const p of NET.peers.values()) {
    const G = p.fire; if (!G) { if (p.av && p.av.stain && p.av.stain.burn) p.av.stain.burn = 0; continue; }
    const a = p.av, local = BOTS.has(p.id);
    if (!local) { const k = fireStep(G, dt); if (G.by === NET.id && !p.dead) for (let i = 0; i < k; i++) pvpBurnNum(p, PFIRE.dmg); }
    if (p.dead || G.t <= 0) { if (!local) p.fire = null; if (a && a.stain) a.stain.burn = 0; continue; }
    if (a && a.seen !== false) fireFx(G, a.g.position.x, a.g.position.z, a[G.from], dt);
    else G.char = Math.min(1, G.char + dt * PFIRE.char);
    if (a && a.stain) { a.stain.char = Math.max(a.stain.char, G.char); a.stain.burn = G.t; }
  }
}
// someone else alight, or put out ('pf': your game's for you, the host's for its bots)
NET_ON.pf = m => {
  const p = NET.peers.get(m.f); if (!p || BOTS.has(m.f)) return;
  if (m.t > 0) { const was = p.fire; p.fire = fireLight(was, m.p, m.by); if (was) p.fire.char = was.char; }
  else p.fire = null;
};
