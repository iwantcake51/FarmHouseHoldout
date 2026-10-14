// The weapon stats panel: everything about the weapon in your hands in one compact sheet (damage, fire rate,
// magazine, each kind of reload, the pump or bolt, spread and drop-off as small charts) and what is changing each
// number. Each number sits in a box: grey as the gun comes, green where something you've fitted or learned has made
// it better, red where something's made it worse, with how much. It's docked against the workbench's left side while
// that's open (sliding out from behind it as it unrolls), and I shows or hides it anywhere.

// shown at the workbench unless you hide it there (wsBench), and elsewhere only once you ask for it (wsOn)
let wsOn = false, wsBench = true, wsKey = '';
const wsAtBench = () => !!openSt && openSt.id === 'bench';
const wsShown = () => state === 'play' && !P.dead && (wsAtBench() ? wsBench : wsOn);
// the numbers for a weapon as it stands (stats this sheet shows; the same sums the game uses)
function wsNumbers(id) {
  const D = W(id); if (!D) return null;
  if (D.melee) return { melee: true, dmg: D.dmg * S.meleeMul, rate: 1 / D.rate, reach: D.range || 0, hits: D.cleave || 1 };
  const ak = !!D.akimbo, mag = magSize(id), per = ak ? akPer(id) : mag, rate = 1 / (D.rate / S.rateMul);
  const shot = D.dmg * S.dmgMul * suppMul(D);
  const r = { dmg: shot, pel: D.pellets || 1, rate, mag, per, ak, spread: D.spread * S.spreadMul, hipK: D.hipK || 1, aimK: D.aimK || 1, pierce: (D.pierce || 0) + skillPierce(id), head: headMulFor(D), crit: D.critT || 0, aimCrit: D.aimCrit || 0, critX: Math.max(D.critM || 0, 2) + (D.critUp || 0) };
  if (D.ammo === 'shells' && gunTier(id, 'choke')) r.spread *= (D.pellets || 1) > 1 ? (gunTier(id, 'choke') === 2 ? 0.49 : 0.7) : (gunTier(id, 'choke') === 2 ? 0.3 : 0.55);
  r.hipSp = r.spread * 1.3 * r.hipK; r.aimSp = r.spread * 0.5 * r.aimK;   // from the hip (a laser) and down the sights (a sight)
  // reloads, every kind this gun has
  if (D.perShell) { r.shell = D.perShell * S.reloadMul; r.loadN = D.loadN || 1; r.full = Math.ceil(mag / r.loadN) * r.shell + (id === 'revolver' ? 0.3 : 0.12); }
  else if (ak) { r.akTac = akDur(D, false); r.akEmpty = akDur(D, true); }
  else { r.reload = D.reload * S.reloadMul; if (SLIDE_PISTOLS[id]) r.tac = r.reload * TAC_MUL; if (!D.speedload) r.empty = r.reload * EMPTY_MUL; }
  // working a pump or a bolt between shots: as long as its ways of working it take, fitted inside the fire rate
  const kind = EJECT[id] === 'pump' ? 'pump' : EJECT[id] === 'bolt' ? 'bolt' : null;
  if (kind) { const v = RACKS[kind], avg = v.reduce((a, q) => a + q.dur + q.delay, 0) / v.length; r.cycle = Math.min(avg, 1 / rate * 0.92); r.cycleKind = kind; }
  const F = FALLOFF[id]; if (F) { const k = D.reach || 1; r.fall = [F[0] * k, F[1] * k, 1 - (1 - F[2]) / k]; }
  return r;
}
// what's changing each number: every source taken away in turn (as the cards do, upgrades/upgrade-info.js), the
// numbers read, and put back. A source is listed against each number it moves, with how much
// each stat a source can move, its name, which way is better, and how a better one reads (a shorter reload is "faster")
const WS_STATS = [['dmg', 'Damage', 1], ['rate', 'Fire rate', 1], ['mag', 'Magazine', 1], ['reload', 'Reload', -1], ['tac', 'Reload', -1], ['akTac', 'Reload', -1], ['shell', 'Reload', -1], ['hipSp', 'Hip spread', -1], ['aimSp', 'Aimed spread', -1], ['pierce', 'Pierce', 1], ['head', 'Headshots', 1]];
const WS_GOOD = { Reload: p => Math.round(-p) + '% faster', Spread: p => Math.round(-p) + '% tighter', 'Hip spread': p => Math.round(-p) + '% tighter', 'Aimed spread': p => Math.round(-p) + '% tighter', Headshots: p => '+' + Math.round(p) + '% damage' };
function wsSources(id) {
  const D = W(id), out = []; if (!D || D.melee) return out;
  const full = wsNumbers(id), g = W8.gt[id] = W8.gt[id] || {}, diff = (name, undo) => {
    const redo = undo(); recomputeEff(); const w = wsNumbers(id); redo(); recomputeEff();
    const fx = [];
    for (const [k, label, dir] of WS_STATS) {
      const a = w[k], b = full[k]; if (a === undefined || b === undefined || Math.abs(a - b) < 1e-6 || fx.some(f => f.label === label)) continue;
      const pct = k === 'pierce' ? (b - a) : (b / a - 1) * 100, good = (b > a) === (dir > 0);
      fx.push({ label, t: k === 'pierce' ? `${pct > 0 ? '+' : ''}${pct}` : good && WS_GOOD[label] ? WS_GOOD[label](pct) : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`, good });
    }
    // a change to both spreads alike (a skill, a mod) reads as one: Spread
    const hs = fx.find(f => f.label === 'Hip spread'), as = fx.find(f => f.label === 'Aimed spread');
    if (hs && as && hs.t === as.t) { fx.splice(fx.indexOf(as), 1); hs.label = 'Spread'; }
    if (fx.length) out.push({ name, fx });
  };
  for (const k of GUN_TIERS) { const n = g[k] || 0; if (n) diff(tierName(k, n - 1, id), () => { g[k] = 0; return () => { g[k] = n; }; }); }
  for (const m of (W8.mods[id] || [])) diff(modName(m), () => { const l = W8.mods[id], i = l.indexOf(m); l.splice(i, 1); return () => l.splice(i, 0, m); });
  if (W8.tune[id]) diff('Tune-up', () => { W8.tune[id] = 0; return () => { W8.tune[id] = 1; }; });
  // your skills and perks, all at once
  const ks = ['dmgMul', 'rateMul', 'magMul', 'reloadMul', 'spreadMul'], keep = ks.map(k => S[k]), pk = S.pierce;
  diff('Your skills', () => { ks.forEach(k => { S[k] = 1; }); S.pierce = 0; return () => { ks.forEach((k, i) => { S[k] = keep[i]; }); S.pierce = pk; }; });
  return out;
}
// the gun as it comes: every tier, mod, tune-up and skill taken away at once, the numbers read, and all put back
function wsStock(id) {
  const g = W8.gt[id] = W8.gt[id] || {}, keys = [...GUN_TIERS], tiers = keys.map(k => g[k] || 0), mods = (W8.mods[id] || []).slice(), tune = W8.tune[id];
  const ks = ['dmgMul', 'rateMul', 'magMul', 'reloadMul', 'spreadMul'], keep = ks.map(k => S[k]), pk = S.pierce;
  keys.forEach(k => { g[k] = 0; }); if (W8.mods[id]) W8.mods[id].length = 0; if (tune) W8.tune[id] = 0; ks.forEach(k => { S[k] = 1; }); S.pierce = 0;
  recomputeEff(); const r = wsNumbers(id);
  keys.forEach((k, i) => { g[k] = tiers[i]; }); if (W8.mods[id]) W8.mods[id].push(...mods); if (tune) W8.tune[id] = tune; ks.forEach((k, i) => { S[k] = keep[i]; }); S.pierce = pk;
  recomputeEff(); return r;
}
const wsF = (v, d = 1) => v.toFixed(d), wsDeg = v => { const x = v * 57.3; return x.toFixed(x < 2 ? 2 : 1) + '°'; };
// a cone for each way you're firing: hip, moving and aimed (firing.js: spreadOf)
function wsCone(sp, mob, hipK, aimK) {
  const hip = sp * 1.3 * (hipK || 1), mv = hip * (1 + RUN_SPREAD * (mob || 1)), W_ = 230, H = 70, ox = 8, oy = H / 2, L = W_ - 16, cones = [['Moving', mv, 'rgba(226,65,44,.18)', '#e2412c'], ['Hip', hip, 'rgba(240,191,76,.2)', '#f0bf4c'], ['Aimed', sp * 0.5 * (aimK || 1), 'rgba(94,194,196,.28)', '#5ec2c4']];
  // drawn to scale against each other, the widest filling the box, so a tight gun's cones still show; the labels are true
  const path = a => { const t = (oy - 3) * a / mv; return `M${ox} ${oy} L${ox + L} ${(oy - t).toFixed(1)} L${ox + L} ${(oy + t).toFixed(1)} Z`; };
  return `<svg class="wsCone" viewBox="0 0 ${W_} ${H}">${cones.map(([n, a, f, s]) => `<path d="${path(a)}" fill="${f}" stroke="${s}" stroke-width="1"/>`).join('')}<line x1="${ox}" y1="${oy}" x2="${ox + L}" y2="${oy}" stroke="rgba(236,230,216,.25)" stroke-dasharray="2 3"/></svg>
    <div class="wsKey">${cones.map(([n, a, f, s]) => `<span style="--c:${s}">${n} ${wsDeg(a)}</span>`).join('')}</div>`;
}
// damage per shot over range (ammo.js: falloff)
function wsFall(id, r) {
  const W_ = 230, H = 64, top = 6, bot = H - 14, max = Math.max(20, Math.ceil(r.fall[1] + 2)), x = d => 8 + d / max * (W_ - 16), y = k => bot - k * (bot - top);
  const pts = [[0, 1], [r.fall[0], 1], [r.fall[1], r.fall[2]], [max, r.fall[2]]].map(([d, k]) => `${x(d).toFixed(1)},${y(k).toFixed(1)}`).join(' ');
  const per = r.dmg * r.pel, ticks = [0, 5, 10, 15, 20, 25, 30].filter(d => d <= max);
  return `<svg class="wsFall" viewBox="0 0 ${W_} ${H}"><polygon points="${x(0)},${bot} ${pts} ${x(max)},${bot}" fill="rgba(240,191,76,.14)"/><polyline points="${pts}" fill="none" stroke="#f0bf4c" stroke-width="1.6"/>
    ${ticks.map(d => `<text x="${x(d)}" y="${H - 2}">${d}m</text>`).join('')}<text x="${x(0) + 2}" y="${top + 8}" class="hi">${Math.round(per)}</text><text x="${x(max) - 2}" y="${y(r.fall[2]) - 4}" class="lo" text-anchor="end">${Math.round(per * r.fall[2])}</text></svg>
    <div class="wsKey"><span style="--c:#f0bf4c">Full to ${wsF(r.fall[0], 0)} m, ${Math.round(r.fall[2] * 100)}% from ${wsF(r.fall[1], 0)} m</span></div>`;
}
function wsHTML(id) {
  const D = W(id), r = wsNumbers(id); if (!r) return '';
  // a row: the number in its box, set against the stock gun's (v and was; dir says which way is better), and the
  // change, then any note
  // (the change sits in its own column beside the box, and any note on a line of its own under them)
  const row = (l, txt, sub, v, was, dir = 1) => {
    let k = '', d = '';
    if (v !== undefined && was !== undefined && Math.abs(v - was) > Math.max(1e-6, Math.abs(was) * 0.005)) {
      k = (v > was) === (dir > 0) ? 'up' : 'down';
      d = was ? (v > was ? '+' : '') + Math.round((v / was - 1) * 100) + '%' : '+' + wsF(v, 0);
    }
    return `<span class="l">${l}</span><b class="v ${k}">${txt}</b><i class="d ${k}">${d}</i>${sub ? `<em>${sub}</em>` : ''}`;
  };
  let h = `<div class="wsHead"><b>${D.short || D.name}</b><span>${D.name}${r.ak ? ' · a pair' : ''}</span></div>`;
  if (r.melee) return h + '<div class="wsGrid">' + row('Damage', Math.round(r.dmg)) + row('Swings', wsF(r.rate) + '/s') + row('Reach', wsF(r.reach, 2) + ' m') + row('Hits', r.hits > 1 ? 'up to ' + r.hits : 'one') + '</div>';
  const s = wsStock(id) || {}, sRel = s.tac ?? s.reload;
  h += '<div class="wsLegend"><span>Stock</span><span class="up">Better</span><span class="down">Worse</span></div><div class="wsGrid">';
  h += row('Damage', Math.round(r.dmg) + (r.pel > 1 ? '×' + r.pel : ''), r.pel > 1 ? Math.round(r.dmg * r.pel) + ' a shell' : '', r.dmg, s.dmg);
  h += row('Fire rate', wsF(r.rate) + '/s', r.ak ? wsF(r.rate / 2) + '/s each gun' : D.fan ? wsF(S.rateMul / D.fan.rate) + '/s fanned from the hip' : '', r.rate, s.rate);
  h += row('Magazine', r.ak ? r.per + ' + ' + r.per : String(r.mag), W8.pin[id] ? `${W8.pin[id].cap} in the gun till you reload` : '', r.mag, s.mag);
  if (r.shell !== undefined) h += row('Reload', wsF(r.shell, 2) + ' s', (r.loadN > 1 ? r.loadN + ' at a time · ' : 'a round · ') + wsF(r.full) + ' s from empty', r.shell, s.shell, -1);
  else if (r.ak) h += row('Reload', wsF(r.akTac) + ' s', `one gun · ${wsF(r.akEmpty)} s empty · both empty ${wsF(r.akEmpty * 2)} s`, r.akTac, s.akTac ?? sRel, -1);
  else h += row('Reload', wsF(r.tac !== undefined ? r.tac : r.reload) + ' s', r.empty !== undefined ? wsF(r.empty) + ' s from empty' : (D.speedload ? 'speed loader' : ''), r.tac ?? r.reload, sRel, -1);
  if (r.cycle) h += row(r.cycleKind === 'pump' ? 'Pump' : 'Bolt', wsF(r.cycle, 2) + ' s', 'between shots', r.cycle, s.cycle, -1);
  h += row('Spread', wsDeg(r.hipSp), `from the hip · ${wsDeg(r.aimSp)} aimed` + (D.fan ? ` · ${wsDeg(r.hipSp * D.fan.spread)} fanning` : ''), r.hipSp, s.hipSp, -1);
  if (r.fall) h += row('Range', wsF(r.fall[0], 0) + ' m', 'at full damage', r.fall[0], s.fall && s.fall[0]);
  if (r.pierce) h += row('Pierce', '+' + r.pierce, 'zombies a round goes through', r.pierce, s.pierce || 0);
  h += row('Headshots', '×' + wsF(r.head, 2), 'damage multiplier', r.head, s.head);
  // crits a gun lands without a scope: a tune-up's on any shot, the revolver's Dead-eye on aimed ones
  if (r.crit || r.aimCrit) h += row('Crits', Math.round((r.crit + r.aimCrit) * 100) + '%', (r.aimCrit ? 'aimed shots' + (r.crit ? `, ${Math.round(r.crit * 100)}% from the hip` : '') : 'any shot') + ` · ×${wsF(r.critX, 2)} damage`, r.crit + r.aimCrit, (s.crit || 0) + (s.aimCrit || 0));
  h += '</div><div class="wsSub">Spread</div>' + wsCone(r.spread, D.mobile, r.hipK, r.aimK);
  if (r.fall) h += '<div class="wsSub">Damage over range</div>' + wsFall(id, r);
  // what's improving it: each upgrade, attachment, mod or skill that makes a number better, and only how it does
  const src = wsSources(id).map(q => ({ name: q.name, fx: q.fx.filter(f => f.good) })).filter(q => q.fx.length);
  h += '<div class="wsSub">What\'s improving it</div>' + (src.length ? '<div class="wsSrc">' + src.map(s => `<div><span>${s.name}</span><p>${s.fx.map(f => `<i><b>${f.label}</b> ${f.t}</i>`).join('')}</p></div>`).join('') + '</div>' : '<div class="wsNone">Stock: nothing fitted or learned yet</div>');
  return h;
}
// every frame: shown or hidden, docked against the workbench while it's open, and rebuilt only when something it
// shows changes. It comes in and goes out with a slide and a fade (styles/weapon-stats.css): docked, out from behind
// the bench as it unrolls and back in as it rolls up, the bench keeping its place till it's gone so neither jumps
let wsCloseT = 0;
function updateWeaponStats() {
  const el = $('wStats'), id = curId(), on = wsShown() && !!id, st = $('station');
  if (!st.classList.contains('closing')) { const dock = on && wsAtBench(); st.classList.toggle('withStats', dock); if (on) el.classList.toggle('docked', dock); }
  if (on && (el.hidden || el.classList.contains('closing'))) {
    clearTimeout(wsCloseT); el.classList.remove('closing', 'opening'); el.hidden = false; void el.offsetWidth; el.classList.add('opening');
  } else if (!on && !el.hidden && !el.classList.contains('closing')) {
    el.classList.remove('opening'); el.classList.add('closing');
    clearTimeout(wsCloseT); wsCloseT = setTimeout(() => { el.classList.remove('closing'); el.hidden = true; }, 200);
  }
  if (!on) return;
  const key = id + JSON.stringify([W8.gt[id], W8.mods[id], W8.modLv, W8.tune[id], W8.fm[id], S.dmgMul, S.rateMul, S.magMul, S.reloadMul, S.spreadMul, S.pierce, S.headMul, S.att]);
  if (key !== wsKey) { wsKey = key; el.innerHTML = wsHTML(id); }
}
function toggleWeaponStats() { if (wsAtBench()) { wsBench = !wsBench; stStruct = ''; } else wsOn = !wsOn; wsKey = ''; SFX.click(); }   // (stStruct: the bench's note says which)
