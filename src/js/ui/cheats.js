// The cheat menu (F9), for testing: god mode, endless scrap and ammo, any weapon, a gun's upgrades and mods up or down,
// skills given and taken away, the waves switched off and the clock set to any hour. The game keeps running behind it.
// The switches (CHEAT) are kept between runs and page loads; everything else acts on the run you're in.

const CHEAT_KEY = 'kessler-cheats';
const CHEAT = { god: false, scrap: false, ammo: false, noWaves: false, clock: false };
try { Object.assign(CHEAT, JSON.parse(localStorage.getItem(CHEAT_KEY) || '{}')); } catch (e) {}
const saveCheats = () => { try { localStorage.setItem(CHEAT_KEY, JSON.stringify(CHEAT)); } catch (e) {} };
const CHEAT_TOGGLES = {
  god: { name: 'God mode', text: 'Health stays full and nothing can kill you. Bleeding and other effects still show.' },
  scrap: { name: 'Infinite scrap', text: 'Scrap never drops below 999. Buy anything at the stations.' },
  ammo: { name: 'Infinite ammo', text: 'Every ammo type stays at 999 in reserve. You still reload.' },
  noWaves: { name: 'Waves off', text: 'No zombies spawn. The break timer stops, and a wave in progress stops sending more.' },
  clock: { name: 'Freeze clock', text: 'The time of day stays where you set it, even during a wave.' }
};
const CHEAT_SHORT = { god: 'God', scrap: '∞ Scrap', ammo: '∞ Ammo', noWaves: 'Waves off', clock: 'Clock frozen' };
let cheatOn = false, cheatTab = 'player', cheatFind = '', cheatLive = 0;
try { cheatTab = localStorage.getItem(CHEAT_KEY + '-tab') || 'player'; } catch (e) {}

// never in co-op: the menu won't open (and shuts if it was), and the switches do nothing there, though they're kept
// for your next game on your own (cheatIs: whether a switch is on and counts, what the rest of the game asks)
const cheatsOff = () => NET.on;
const cheatIs = k => !!CHEAT[k] && !cheatsOff();
// every frame of play (game/update.js): keep what the switches promise
function cheatTick() {
  if (cheatsOff()) { if (cheatOn) toggleCheats(false); const t = $('cheatTag'); if (!t.hidden) t.hidden = true; return; }
  CHEAT_HELD.forEach(k => CHEAT_FX[k].hold && CHEAT_FX[k].hold());
  if (CHEAT.god) P.hp = S.maxHp;
  if (CHEAT.scrap && S.scrap < 999) S.scrap = 999;
  if (CHEAT.ammo) for (const a in W8.reserve) if (W8.reserve[a] < 999) W8.reserve[a] = 999;
}
// god mode: a hit that would have killed you leaves you standing (ui/screens.js: startDeath)
const cheatSaves = () => { if (!cheatIs('god')) return false; P.hp = S.maxHp; return true; };

// ---- status effects: each one the status icons top right can show (ui/moodles.js), what turns it on, what keeps it on
// while it's held (every frame, ui/cheats.js: cheatTick) and what clears it. on: whether its icon is showing
const fxHp = f => { P.hp = Math.max(1, Math.round(S.maxHp * f)); };
const CHEAT_FX = {
  bleed: { name: 'Bleeding', text: 'Loses about 1.7 health a second until it stops or a bandage goes on.', on: () => P.bleed > 0, ap: () => { P.bleed = 14; }, hold: () => { P.bleed = Math.max(P.bleed || 0, 2); }, off: () => { P.bleed = 0; } },
  adren: { name: 'Adrenaline', text: '15% faster on your feet, heart racing.', on: () => P.adr > 0, ap: () => { P.adr = 8; }, hold: () => { P.adr = Math.max(P.adr || 0, 0.5); }, off: () => { P.adr = 0; } },
  slowed: { name: 'Slowed', text: 'A hit has you stumbling.', on: () => P.slow > 0.15 && P.slow <= 0.45, ap: () => { P.slow = 0.4; }, hold: () => { P.slow = Math.max(P.slow, 0.3); }, off: () => { P.slow = 0; } },
  pinned: { name: 'Pinned', text: 'Grabbed and barely moving.', on: () => P.slow > 0.45, ap: () => { P.slow = 1; }, hold: () => { P.slow = Math.max(P.slow, 0.9); }, off: () => { P.slow = 0; P.stun = 0; } },
  conc: { name: 'Concussed', text: 'The screen swims and your aim goes wide.', on: () => P.conc > 0.15, ap: () => { P.conc = 1; }, hold: () => { P.conc = Math.max(P.conc || 0, 0.8); }, off: () => { P.conc = 0; } },
  winded: { name: 'Winded', text: 'Out of stamina: no sprinting until it\'s back to half.', on: () => !!(P.exh || P.sprintLock), ap: () => { P.stam = 0; P.exh = P.sprintLock = true; P.sprint = false; }, hold: () => { P.stam = 0; P.exh = P.sprintLock = true; P.sprint = false; }, off: () => { P.stam = 1; P.runDebt = 0; P.exh = P.sprintLock = P.fatigued = false; } },
  healing: { name: 'Healing', text: 'Health coming back over time, as after a bandage.', on: () => P.bandT <= 0 && P.heal > 0, ap: () => { if (P.hp >= S.maxHp) fxHp(0.5); P.heal = (P.heal || 0) + 50; }, hold: () => { P.heal = Math.max(P.heal || 0, 5); }, off: () => { P.heal = 0; } },
  bandaging: { name: 'Bandaging', text: 'A bandage going on (one is added to your bag if you have none).', on: () => P.bandT > 0, ap: () => { P.band = Math.max(P.band || 0, 1); if (P.hp >= S.maxHp && !(P.bleed > 0)) fxHp(0.9); startBandage(); popEl('bands'); }, off: () => { if (P.bandT > 0) { P.bandT = 0; ANIM.healCut = true; } } },
  hurt: { name: 'Hurt', text: 'Down to 60% health. Off while god mode is on.', on: () => P.hp / S.maxHp < 0.7 && P.hp / S.maxHp >= 0.35, ap: () => fxHp(0.6), off: () => { P.hp = S.maxHp; } },
  badly: { name: 'Badly hurt', text: 'Down to 20% health. Off while god mode is on.', on: () => P.hp / S.maxHp < 0.35, ap: () => fxHp(0.2), off: () => { P.hp = S.maxHp; } },
  last: { name: 'Last stand', text: 'Gives you the Last stand perk if you haven\'t got it, and drops you to 25% health.', on: () => S.lastStand && P.hp / S.maxHp < 0.3, ap: () => { if (!S.lastStand) chSkill('p:Last stand', 1); fxHp(0.25); }, off: () => { P.hp = S.maxHp; } },
  wind: { name: 'Second wind ready', text: 'Gives you the Second wind perk if you haven\'t got it, ready to go again.', on: () => S.secondWind && !S.windUsed, ap: () => { if (!S.secondWind) chSkill('p:Second wind', 1); S.windUsed = false; }, off: () => { S.windUsed = true; } },
  heavy: { name: 'Heavy load', text: 'Puts the light machine gun in your hands.', on: () => !!(W(curId()) || {}).slow, ap: () => { exitScope(); if (W8.slot.auto === 'lmg') equip('auto'); else chGive('lmg'); }, off: () => { if ((W(curId()) || {}).slow) equip('side'); } },
  dark: { name: 'Dark', text: 'Sets the clock to midnight.', on: () => curDark > 0.6, ap: () => { tod = 0; }, off: () => { tod = 12; } }
};
// held effects: kept on every frame until you let go (for this page only)
const CHEAT_HELD = new Set();

// ---- the panel ----------------------------------------------------------------------------------------------------
const chEl = $('cheat'), chBody = $('chBody');
function toggleCheats(on) {
  if (cheatsOff() && on !== false) { if (!cheatOn) toast('No cheats in co-op', { kind: 'bad', sub: 'The cheat menu only works in a game on your own' }); return; }
  cheatOn = on === undefined ? !cheatOn : on;
  chEl.hidden = !cheatOn;
  clearInterval(cheatLive);
  if (cheatOn) { renderCheats(); cheatLive = setInterval(cheatLiveTick, 200); }
  else if (document.activeElement && chEl.contains(document.activeElement)) { document.activeElement.blur(); cv.focus({ preventScroll: true }); }
  SFX.click();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chBtn = (label, act, data = {}, cls = '', off = false) => `<button type="button" class="chBtn ${cls}" data-act="${act}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${off ? ' disabled' : ''}>${label}</button>`;
const chStep = (act, data, label, canDown, canUp, title = '') => `<div class="chStep"${title ? ` title="${esc(title)}"` : ''}>${chBtn('−', act, Object.assign({ d: -1 }, data), 'sq', !canDown)}<span>${label}</span>${chBtn('+', act, Object.assign({ d: 1 }, data), 'sq', !canUp)}</div>`;
const chHead = t => `<h4 class="chH">${t}</h4>`;
const chToggle = k => `<button type="button" class="chTg${CHEAT[k] ? ' on' : ''}" data-act="tg" data-k="${k}" aria-pressed="${CHEAT[k]}"><i class="sw"></i><b>${CHEAT_TOGGLES[k].name}</b><em>${CHEAT_TOGGLES[k].text}</em></button>`;
const clockText = h => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

function renderCheats() {
  chEl.querySelectorAll('.chTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === cheatTab));
  const keepScroll = chBody.scrollTop;
  chBody.innerHTML = (CHEAT_TABS[cheatTab] || CHEAT_TABS.player)();
  chBody.scrollTop = keepScroll;
  const f = $('chFind'); if (f && cheatFind) { f.value = cheatFind; }
  cheatTag(); cheatLiveTick();
}
// the readouts that change on their own while the menu is open
function cheatLiveTick() {
  if (!cheatOn) return;
  const set = (k, v) => chBody.querySelectorAll(`[data-live="${k}"]`).forEach(el => { if (el.textContent !== String(v)) el.textContent = v; });
  set('hp', `${Math.ceil(P.hp)} / ${S.maxHp}`); set('scrap', S.scrap); set('planks', `${S.planks} / ${PLANK_MAX}`); set('bands', `${P.band || 0} / ${bandMax()}`);
  set('clock', clockText(tod)); set('wave', Math.max(0, run.wave)); set('wavenext', phase === 'wave' ? 'In progress' : `Next up: wave ${run.wave + 1}`); set('zeds', zombies.filter(z => !z.dead).length + spawnQ.length);
  set('phase', state === 'title' ? 'On the title screen' : phase === 'wave' ? `Wave ${run.wave} in progress` : phase === 'cleared' ? 'Wave cleared' : CHEAT.noWaves ? 'Break (waves off)' : `Break · next wave in ${Math.ceil(Math.max(0, breakT))}s`);
  const id = curId(); if (id && WEAP[id].ammo) set('mag', `${W8.mag[id] || 0} / ${magSize(id)} · ${W8.reserve[W(id).ammo]} spare`);
  const sl = $('chTime'); if (sl && document.activeElement !== sl && Math.abs(+sl.value - tod) > 0.02) sl.value = tod;
  const hs = $('chHp'); if (hs && document.activeElement !== hs && Math.abs(+hs.value - P.hp) > 0.5) hs.value = Math.ceil(P.hp);
  chBody.querySelectorAll('[data-fxon]').forEach(el => el.classList.toggle('on', !!CHEAT_FX[el.dataset.fxon].on()));
}
// a small reminder on the HUD while any switch is on
function cheatTag() {
  const on = Object.keys(CHEAT_SHORT).filter(k => CHEAT[k]);
  const el = $('cheatTag'); el.hidden = !on.length || cheatsOff();
  el.textContent = on.length ? 'Cheats · ' + on.map(k => CHEAT_SHORT[k]).join(' · ') + ' · F9' : '';
}

const CHEAT_TABS = {
  player() {
    return chHead('Switches') + ['god', 'scrap', 'ammo'].map(chToggle).join('') +
      chHead('Supplies') + `<div class="chRow"><span class="chK">Bandages</span><b data-live="bands"></b>${chBtn('Fill', 'bands')}</div>` + `<div class="chRow"><span class="chK">Scrap</span><b data-live="scrap"></b><span class="chGrp">${chBtn('+50', 'scrap', { n: 50 })}${chBtn('+500', 'scrap', { n: 500 })}${chBtn('0', 'scrap', { n: 0 })}</span></div>` +
      `<div class="chRow"><span class="chK">Planks</span><b data-live="planks"></b>${chBtn('Fill', 'planks')}</div>` +
      `<div class="chRow"><span class="chK">Ammo</span><b data-live="mag">—</b>${chBtn('Refill all', 'ammo')}</div>`;
  },
  health() {
    return chHead('Health') +
      `<div class="chHp"><b data-live="hp" class="chClock"></b><input id="chHp" type="range" min="1" max="${S.maxHp}" step="1" value="${Math.ceil(P.hp)}" aria-label="Health"></div>` +
      (CHEAT.god ? '<p class="chNote">God mode is on, so your health goes straight back to full. Switch it off on the Player tab to stay hurt.</p>' : '') +
      `<div class="chRow"><span class="chK">Hurt yourself<small>A hit from a random side, with the flinch and the red edge</small></span><span class="chGrp">${[10, 25, 50].map(n => chBtn('−' + n, 'hurt', { n }, 'warn')).join('')}</span></div>` +
      `<div class="chRow"><span class="chK">Heal yourself</span><span class="chGrp">${[10, 25].map(n => chBtn('+' + n, 'healn', { n })).join('')}${chBtn('Full', 'heal')}</span></div>` +
      `<div class="chRow"><span class="chK">Max health</span><b>${S.maxHp}</b>${chStep('maxhp', {}, '±25', S.maxHp > 25, true)}</div>` +
      chHead('Status effects') + '<p class="chNote">The icons top right. Apply sets it off once; Hold keeps it on until you let go.</p>' +
      Object.entries(CHEAT_FX).map(([k, f]) => `<div class="chRow chFx" data-fx="${k}"><i class="chDot" data-fxon="${k}"></i><span class="chK">${f.name}<small>${esc(f.text)}</small></span><span class="chGrp">${chBtn('Apply', 'fx', { k })}${f.hold ? chBtn('Hold', 'fxhold', { k }, CHEAT_HELD.has(k) ? 'have' : '') : ''}${chBtn('Clear', 'fxoff', { k }, 'ghost')}</span></div>`).join('') +
      `<div class="chBtns">${chBtn('Clear every effect', 'fxall', {}, 'warn')}</div>`;
  },
  weapons() {
    let h = chHead('Give a weapon');
    for (const s of SLOTS) {
      h += `<div class="chSlot"><span class="chK">${SLOT_NAME[s]}</span><div class="chWeaps">` +
        Object.keys(WEAP).filter(id => WEAP[id].slot === s).map(id => chBtn(esc(WEAP[id].short || WEAP[id].name), 'give', { id }, W8.slot[s] === id ? 'have' : '')).join('') +
        (s === 'long' || s === 'auto' ? chBtn('Empty', 'empty', { s }, 'ghost', !W8.slot[s]) : '') + '</div></div>';
    }
    const id = curId(), D = id && WEAP[id];
    if (!D) return h;
    h += chHead(`In your hands: ${esc(D.name)}`);
    if (!D.melee) {
      const lines = CH_GUN_LINES.filter(k => chLineFits(k, id));
      h += lines.map(k => {
        const n = ownTier(id, k), max = tierMax(k, id), up = tierFits(k, id) && (k !== 'choke' || D.ammo === 'shells');
        const why = !up && n < max ? (k === 'supp' || k === 'choke' ? 'The muzzle is taken' : '') : '';
        return `<div class="chRow"><span class="chK">${CH_LINE[k]}</span><span class="chTier">${n ? esc(tierName(k, n - 1, id)) : '<i>None</i>'}<small>${n}/${max}${why ? ' · ' + why : ''}</small></span>${chStep('tier', { k }, '', n > 0, up)}</div>`;
      }).join('');
    }
    // the kinds of round it takes: give and load any of them (weapons/rounds.js)
    if (!D.melee && roundTypes(id).length > 1) {
      h += chHead('Rounds');
      h += roundTypes(id).map(k => { const own = roundOwned(id, k), on = roundOn(id) === k;
        return `<div class="chRow${own ? ' have' : ''}"><span class="chK chMod" title="${esc(roundText(id, k))}">${esc(roundName(id, k))}<small>${on ? 'Loaded' : own ? 'Owned' : esc(roundText(id, k))}</small></span>${chBtn(on ? 'Loaded' : 'Load', 'round', { k }, '', on)}</div>`; }).join('');
    }
    const mods = Object.keys(MODS).filter(m => MODS[m].w === id);
    if (mods.length) {
      h += chHead('Mods');
      h += mods.map(m => {
        const have = hasMod(m), lv = modLv(m), upOk = have && MOD_UP[m] && lv < MOD_MAX;
        const why = have ? '' : modReplaced(m) ? 'Replaced by a better mod' : MODS[m].need && !(hasMod(MODS[m].need) && modLv(MODS[m].need) >= (MODS[m].needLv || 1)) ? `Needs ${MODS[MODS[m].need].name}${MODS[m].needLv > 1 ? ' ' + roman(MODS[m].needLv) : ''}` : MODS[m].muzzle && muzzleTaken(id) ? 'The muzzle is taken' : '';
        return `<div class="chRow${have ? ' have' : ''}"><span class="chK chMod" title="${esc(MODS[m].text)}">${esc(have ? modName(m) : MODS[m].name)}<small>${have ? 'Level ' + roman(lv) + ' of ' + (MOD_UP[m] ? MOD_MAX : 1) : why || esc(MODS[m].text)}</small></span>` +
          (have ? chStep('mod', { m }, '', true, upOk) : chBtn('Add', 'mod', { m, d: 1 }, '', !modOffer(m))) + '</div>';
      }).join('');
    }
    h += chHead('Whole weapon') + `<div class="chRow"><span class="chK">Workbench tune-up</span><b>${W8.tune[id] ? 'Tuned' : 'Stock'}</b>${chBtn(W8.tune[id] ? 'Remove' : 'Tune up', 'tune')}</div>` +
      `<div class="chBtns">${chBtn('Strip to stock', 'stock', {}, 'warn')}${D.melee ? '' : chBtn('Max every upgrade', 'maxgun')}</div>`;
    return h;
  },
  skills() {
    const q = cheatFind.trim().toLowerCase();
    const rows = chSkillRows().filter(r => !q || (r.name + ' ' + r.text + ' ' + r.kind).toLowerCase().includes(q));
    let h = `<div class="chFindRow"><input id="chFind" type="search" placeholder="Search skills and perks" autocomplete="off" spellcheck="false">${chBtn('Remove all', 'noskills', {}, 'warn')}</div>`;
    for (const kind of ['Skill', 'Perk', 'Gear']) {
      const ks = rows.filter(r => r.kind === kind); if (!ks.length) continue;
      h += chHead(kind === 'Gear' ? 'Tiered (armour, boots, senses…)' : kind + 's');
      h += ks.map(r => `<div class="chRow${r.n ? ' have' : ''}"><span class="chK chMod">${esc(r.name)}<small>${esc(r.text)}</small></span>${chStep('skill', { key: r.key }, r.count, r.n > 0, r.canUp)}</div>`).join('');
    }
    return h + (rows.length ? '' : '<p class="chNone">Nothing matches.</p>');
  },
  world() {
    return chHead('Zombies') + chToggle('noWaves') +
      `<div class="chRow"><span class="chK">Now</span><b data-live="phase" class="wide"></b></div>` +
      `<div class="chRow"><span class="chK">Wave<small data-live="wavenext"></small></span><b data-live="wave"></b>${chStep('wave', {}, '', run.wave > 0, true)}</div>` +
      `<div class="chRow"><span class="chK">Zombies left</span><b data-live="zeds"></b><span class="chGrp">${chBtn('Kill all', 'killall')}${chBtn('Next wave now', 'nextwave', {}, '', CHEAT.noWaves || phase !== 'break' || state === 'title')}</span></div>` +
      chHead('Time of day') + `<div class="chTime"><b data-live="clock" class="chClock"></b><input id="chTime" type="range" min="0" max="23.99" step="0.05" value="${tod}" aria-label="Time of day"></div>` +
      `<div class="chBtns">${[['Midnight', 0], ['Dawn', 6], ['Noon', 12], ['Afternoon', 15], ['Dusk', 18.5], ['Night', 21]].map(([l, h]) => chBtn(`${l}<small>${clockText(h)}</small>`, 'time', { h })).join('')}</div>` +
      chToggle('clock');
  }
};

// ---- the gun in your hands ----------------------------------------------------------------------------------------
const CH_GUN_LINES = ['ammo', 'trigger', 'mag', 'supp', 'choke', 'sight', 'laser', 'light', 'loader'];
const CH_LINE = { ammo: 'Powder', trigger: 'Trigger', mag: 'Magazine', supp: 'Suppressor', choke: 'Choke', sight: 'Sight', laser: 'Laser', light: 'Light', loader: 'Speed loader' };
function chLineFits(k, id) {
  const D = WEAP[id];
  if (tierMax(k, id) <= 0) return false;
  if (k === 'choke') return D.ammo === 'shells';
  if (k === 'sight' && NO_SIGHT.has(id)) return false;
  if (k === 'loader') return id === 'revolver' || id === 'scar' || !!D.breakOpen;
  return true;
}
// change the weapon, then let it take the change at once: a new magazine goes straight in, topped up
function chGun(id, fn) {
  exitScope();
  magChange(id, fn);
  delete W8.pin[id]; recomputeEff(); buildGuns(); glowGun(id);
  if (!W(id).melee) W8.mag[id] = magSize(id);
}
// a weapon into its slot and your hands, the way one off the radio arrives (stations/supply-drop.js): giveWeapon only
// changes the stats, so the models in your hands and on your back are rebuilt for it too
function chGive(id) { exitScope(); giveWeapon(id); buildGuns(); glowGun(id); }
function chRemoveMod(id, m) {
  W8.mods[id] = (W8.mods[id] || []).filter(k => k !== m && MODS[k].need !== m);   // and anything that needed it
  Object.keys(MODS).forEach(k => { if (!(W8.mods[id] || []).includes(k) && MODS[k].w === id) delete W8.modLv[k]; });
  if (W8.fm[id] && !(W8.mods[id] || []).includes(W8.fm[id]) && W8.fm[id] !== 'semi') W8.fm[id] = null;
  recomputeEff();
}

// ---- skills and perks -----------------------------------------------------------------------------------------------
// every skill and perk the cards after a wave can give you (not aid, weapons or the Gunsmith, which works on a gun), and
// the tiered lines (armour, boots, hammer, senses, feeding). A plain one counts how often you took it (run.taken), a
// tiered one its step
const CH_TIER_NAME = { armor: 'Body armour', boots: 'Footwear', hammer: 'Hammer', eyes: 'Awareness', night: 'Night vision', feed: 'Feeding', strong: 'Strong arms', rungun: 'Run and gun', soles: 'Thick soles', walkw: 'Walking wounded', quick: 'Quick hands' };
const chPlain = () => UPG.filter(u => !u.weaponOf && !u.tierOf && !u.card && !AID.has(u.name));
const chTiers = () => UPG.filter(u => u.tierOf).map(u => u.tierOf);
const takenN = name => { const h = run.taken.find(t => t.name === name && !t.on); return h ? h.n : 0; };
function chSkillRows() {
  const plain = chPlain().map(u => { const n = takenN(u.name); return { key: 'p:' + u.name, kind: SKILLS.has(u.name) ? 'Skill' : 'Perk', name: u.name, text: u.text, n, count: n ? (n > 1 ? '×' + n : 'Have') : '0', canUp: !!(!u.can || u.can()) }; });
  const tiers = chTiers().map(k => { const L = TIERS[k], n = S.tier[k], st = L.t[Math.min(n, L.t.length - 1)];
    return { key: 't:' + k, kind: 'Gear', name: CH_TIER_NAME[k] || L.tag, text: n ? L.t[n - 1].name + (n < L.t.length ? ' · next: ' + st.name + ', ' + st.text : ' · maxed') : st.name + ': ' + st.text, n, count: n + '/' + L.t.length, canUp: n < L.t.length && (!L.can || L.can()) }; });
  return plain.concat(tiers);
}
// in the run's history (the pause screen's list) the same way a card puts it there (upgrades/upgrade-screen.js)
function chLog(name, tag, text, r, d) {
  const i = run.taken.findIndex(t => t.name === name && !t.on);
  if (d > 0) { if (i >= 0) { run.taken[i].n++; run.taken[i].wave = Math.max(1, run.wave); } else run.taken.push({ name, on: '', tag, text, r, wave: Math.max(1, run.wave), n: 1, total: '' }); }
  else if (i >= 0) { if (--run.taken[i].n <= 0) run.taken.splice(i, 1); }
}
// what the skills you have make of the stats a run starts with: plain [[card, times]], tiers { line: step }
function replaySkills(plain, tiers) {
  const keep = S, hp = P.hp;
  S = freshStats();
  try {
    plain.forEach(([u, n]) => { for (let i = 0; i < n; i++) u.ap(); });
    for (const k in tiers) for (let i = 0; i < tiers[k]; i++) { TIERS[k].t[S.tier[k]].ap(); S.tier[k]++; }
    return S;
  } finally { S = keep; P.hp = hp; }
}
// taking a skill away: work out the stats with and without it from a fresh start, and set only the stats skills touch
// to the without, so scrap, planks, what you bought at the bench and the like stay as they are
function setSkills(plain, tiers) {
  const base = freshStats(), now = replaySkills(chPlain().map(u => [u, takenN(u.name)]), Object.fromEntries(chTiers().map(k => [k, S.tier[k]])));
  const next = replaySkills(plain, tiers);
  for (const k in base) if (typeof base[k] !== 'object' && (now[k] !== base[k] || next[k] !== base[k])) S[k] = next[k];
  for (const k of chTiers()) S.tier[k] = next.tier[k];
  P.hp = Math.min(P.hp, S.maxHp);
}
function chSkill(key, d) {
  const [t, nm] = [key.slice(0, 1), key.slice(2)];
  if (t === 'p') {
    const u = chPlain().find(x => x.name === nm); if (!u) return;
    if (d > 0) { if (u.can && !u.can()) return; u.ap(); }
    else { const n = takenN(nm); if (!n) return; setSkills(chPlain().map(x => [x, x === u ? n - 1 : takenN(x.name)]), Object.fromEntries(chTiers().map(k => [k, S.tier[k]]))); }
    chLog(u.name, u.tag, u.text, u.r, d);
  } else {
    const L = TIERS[nm], n = S.tier[nm]; if (!L) return;
    if (d > 0) { if (n >= L.t.length || (L.can && !L.can())) return; L.t[n].ap(); S.tier[nm]++; chLog(L.t[n].name, `${L.tag} · Tier ${n + 1} of ${L.t.length}`, L.t[n].text, L.t[n].r, 1); }
    else { if (!n) return; setSkills(chPlain().map(x => [x, takenN(x.name)]), Object.fromEntries(chTiers().map(k => [k, k === nm ? n - 1 : S.tier[k]]))); chLog(L.t[n - 1].name, '', '', '', -1); }
  }
  buildGuns();   // armour and the like show on you
}
function chNoSkills() {
  const names = new Set(chPlain().map(u => u.name)); chTiers().forEach(k => TIERS[k].t.forEach(st => names.add(st.name)));
  setSkills([], {});
  run.taken = run.taken.filter(t => t.on || !names.has(t.name));
  buildGuns();
}

// ---- what the buttons do ----------------------------------------------------------------------------------------------
const CHEAT_ACTS = {
  tg: d => { CHEAT[d.k] = !CHEAT[d.k]; saveCheats(); if (CHEAT[d.k]) cheatTick(); },
  heal: () => { P.hp = S.maxHp; P.bleed = 0; P.slow = 0; },
  healn: d => { P.hp = Math.min(S.maxHp, P.hp + +d.n); },
  // a hit like a zombie's (zombies/ai.js), from a random side: no armour, no dodging it
  hurt: d => { if (P.dead) return; const a = rand() * Math.PI * 2; P.hp -= +d.n; P.hitFrom = a; hitFromAt(P.x + Math.sin(a) * 2, P.z + Math.cos(a) * 2); interruptBandage();
    addBlood(0.05); ANIM.flinch = 1; ANIM.flinchSide = rand() < 0.5 ? -1 : 1; SFX.hurt(); shake = Math.max(shake, 0.22); burst(P.x, 1, P.z, 6, 'blood');
    if (P.hp <= 0) { P.hp = 0; startDeath(); } },
  fx: d => { if (!P.dead) CHEAT_FX[d.k].ap(); },
  fxhold: d => { if (CHEAT_HELD.has(d.k)) CHEAT_HELD.delete(d.k); else { CHEAT_HELD.add(d.k); CHEAT_FX[d.k].ap(); } },
  fxoff: d => { CHEAT_HELD.delete(d.k); CHEAT_FX[d.k].off(); },
  fxall: () => { CHEAT_HELD.clear(); ['bleed', 'adren', 'pinned', 'conc', 'winded', 'healing', 'bandaging'].forEach(k => CHEAT_FX[k].off()); },
  maxhp: d => { S.maxHp = Math.max(25, S.maxHp + 25 * d.d); P.hp = d.d > 0 ? P.hp + 25 : Math.min(P.hp, S.maxHp); },
  bands: () => { P.band = bandMax(); popEl('bands'); },
  scrap: d => { S.scrap = +d.n ? S.scrap + +d.n : 0; popEl('scrap'); },
  planks: () => { S.planks = PLANK_MAX; popEl('planks'); },
  ammo: () => { SLOTS.forEach(s => { const id = W8.slot[s]; if (id && WEAP[id].ammo) { W8.mag[id] = magSize(id); W8.reserve[W(id).ammo] = Math.max(W8.reserve[W(id).ammo], 3 * AMMO_CAN[W(id).ammo]); } }); },
  give: d => { chGive(d.id); feed('gear', 0, WEAP[d.id].name); },
  empty: d => { if (!W8.slot[d.s]) return; if (W8.cur === d.s) equip('side', true); W8.slot[d.s] = null; buildGuns(); },
  tier: d => { const id = curId(), k = d.k, n = ownTier(id, k), dd = +d.d;
    if (dd > 0 ? !tierFits(k, id) : n <= 0) return;
    chGun(id, () => { fitTier(id, k, n + dd); W8.own[id][k] = n + dd; }); },   // down a step is gone, not just taken off
  mod: d => { const id = curId(), m = d.m, dd = +d.d;
    if (!hasMod(m)) { if (dd > 0 && modOffer(m)) chGun(id, () => addMod(id, m)); return; }
    const lv = modLv(m);
    if (dd > 0) { if (MOD_UP[m] && lv < MOD_MAX) chGun(id, () => improveMod(m)); }
    else chGun(id, () => { if (lv > 1) { W8.modLv[m] = lv - 1; recomputeEff(); } else chRemoveMod(id, m); }); },
  tune: () => { const id = curId(); chGun(id, () => { if (W8.tune[id]) delete W8.tune[id]; else W8.tune[id] = 1; }); },
  stock: () => { const id = curId(); chGun(id, () => { W8.gt[id] = {}; (W8.mods[id] || []).forEach(m => delete W8.modLv[m]); W8.mods[id] = []; W8.fm[id] = null; delete W8.tune[id]; delete W8.rounds[id]; delete W8.att[id]; W8.own[id] = {}; delete W8.ownAtt[id]; }); },
  round: d => { const id = curId(); exitScope(); loadRound(id, d.k, true); glowGun(id); },
  maxgun: () => { const id = curId(); chGun(id, () => { W8.gt[id] = W8.gt[id] || {}; for (const k of CH_GUN_LINES) if (chLineFits(k, id)) while (tierFits(k, id)) fitTier(id, k, ownTier(id, k) + 1); recomputeEff(); }); },
  skill: d => chSkill(d.key, +d.d),
  noskills: () => chNoSkills(),
  wave: d => { run.wave = Math.max(0, run.wave + +d.d); },
  killall: () => { spawnQ.length = 0; zombies.filter(z => !z.dead).forEach(z => killZombie(z, 0, 1, curId(), 'torso', 0)); },
  nextwave: () => { if (phase === 'break' && !CHEAT.noWaves) breakT = 0; },
  time: d => { tod = +d.h; }
};
chEl.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { cheatTab = t.dataset.tab; try { localStorage.setItem(CHEAT_KEY + '-tab', cheatTab); } catch (er) {} chBody.scrollTop = 0; renderCheats(); SFX.click(); return; }
  if (e.target.closest('#chClose')) { toggleCheats(false); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = CHEAT_ACTS[b.dataset.act]; if (!fn) return;
  fn(b.dataset); SFX.click(); renderCheats();
});
// buttons don't take the keyboard's focus, so Space and the number keys still go to the game after a click
chEl.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
chEl.addEventListener('input', e => {
  if (e.target.id === 'chTime') { tod = +e.target.value; cheatLiveTick(); }
  if (e.target.id === 'chHp') { P.hp = +e.target.value; cheatLiveTick(); }
  if (e.target.id === 'chFind') { cheatFind = e.target.value; const pos = e.target.selectionStart; renderCheats(); const f = $('chFind'); f.focus(); f.setSelectionRange(pos, pos); }
});
// typing in the search box or dragging the slider doesn't move you or fire; F9 and Esc still close the menu, Enter hands
// the keyboard back to the game
chEl.addEventListener('keydown', e => {
  if (!e.target.closest('input')) return;
  e.stopPropagation();
  if (e.key === 'F9' || e.key === 'Escape') { e.preventDefault(); toggleCheats(false); }
  else if (e.key === 'Enter') { e.target.blur(); cv.focus({ preventScroll: true }); }
});
chEl.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
cheatTag();
