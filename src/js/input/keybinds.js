// The keys, and which does what: everything but walking (W A S D and the arrows) can be put on another key, or on the
// mouse's middle or side buttons (ui/settings.js, its Controls tab), kept in the browser between visits. Every key
// shown anywhere (the prompts, the HUD, the notes under the stations, the title's controls) is the one it's bound to
// now: keyLabel and kbd for what's written as it's needed, and data-bind on what's in the page, kept up by
// refreshKeyHints.

import { keyIcon, slotIcons } from '../ui/input-icons.js';

// what each does and its key to start with (e.key, lower-cased; ' ' Space; mouse3-5 the middle and side buttons)
const BIND_DEF = {
  sprint: 'shift', vault: ' ', zoomIn: '=', zoomOut: '-',
  reload: 'r', slot1: '1', slot2: '2', slot3: '3', slot4: '4', shove: 'v', fireMode: 'b', ammo: 'x', grenade: 'g', stats: 'i',
  use: 'e', board: 'f', tear: 'c', bandage: 'q', wave: 't', share: 'h', pause: 'p', view: 'n', freeLook: 'alt'
};
// the groups they're listed in (hold: held down rather than pressed), and the ones that can't move, shown with them
export const BIND_GROUPS = [
  { name: 'Movement', fixed: [['W A S D', 'Walk']], rows: [['sprint', 'Sprint', 1], ['vault', 'Vault a window or fence'], ['zoomIn', 'Zoom in'], ['zoomOut', 'Zoom out'], ['view', 'First person view'], ['freeLook', 'Free look (first person)', 1]] },
  { name: 'Combat', fixed: [['Mouse', 'Aim and fire'], ['Right click', 'Aim down the sights']], rows: [['reload', 'Reload'], ['slot1', 'Weapon 1'], ['slot2', 'Weapon 2'], ['slot3', 'Weapon 3'], ['slot4', 'Weapon 4'], ['shove', 'Shove'], ['fireMode', 'Switch fire mode'], ['ammo', 'Load the next kind of round'], ['grenade', 'Underbarrel grenade'], ['stats', 'Weapon stats']] },
  { name: 'Survival', fixed: [], rows: [['use', 'Use a station, pick something up'], ['board', 'Board up a window or door', 1], ['tear', 'Tear a board down', 1], ['bandage', 'Bandage'], ['wave', 'Start the next wave early'], ['share', 'Share a gun with your team'], ['pause', 'Pause']] }
];
// keys kept for what they already do: walking, Esc (back out, pause), the cheat menu, Tab and Enter in the stations
export const BIND_LOCK = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', 'f9', 'tab', 'enter', 'meta', 'contextmenu']);
export const KB = Object.assign({}, BIND_DEF);
try { const s = JSON.parse(localStorage.getItem('kessler-keys') || '{}'); for (const a in s) if (a in BIND_DEF && typeof s[a] === 'string' && !BIND_LOCK.has(s[a])) KB[a] = s[a]; } catch (e) {}
export const saveBinds = () => { try { localStorage.setItem('kessler-keys', JSON.stringify(KB)); } catch (e) {} };
// the key pressed, as it's bound: a number by its key, whatever Shift does to it (Shift+1 is still 1)
export const keyOf = e => { const c = e.code || ''; return /^Digit\d$/.test(c) ? c.slice(5) : /^Numpad\d$/.test(c) ? c.slice(6) : (e.key || '').toLowerCase(); };
const KEY_NAMES = { ' ': 'Space', shift: 'Shift', control: 'Ctrl', alt: 'Alt', capslock: 'Caps', backspace: 'Backspace', delete: 'Del', insert: 'Ins', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn', mouse3: 'Middle click', mouse4: 'Mouse 4', mouse5: 'Mouse 5', dead: '`' };
export const keyLabel = k => !k ? '—' : KEY_NAMES[k] || (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
// an action's key as written in a sentence, and as it's drawn (ui/input-icons.js: Kenney's key, in a <kbd>)
export const keyOn = a => keyLabel(KB[a]);
export const kbd = a => `<kbd class="ki">${keyIcon(KB[a])}</kbd>`;
export const bindIs = (k, a) => KB[a] === k;
function refreshKeyHints() {
  // (each drawn as its key: a key that isn't bound to anything, data-key, as well)
  document.querySelectorAll('[data-bind]').forEach(el => { const a = el.dataset.bind; el.classList.add('ki'); el.innerHTML = a === 'slots' ? slotIcons() : keyIcon(KB[a]); });
  document.querySelectorAll('[data-key]').forEach(el => { el.classList.add('ki'); el.innerHTML = keyIcon(el.dataset.key); });
  document.querySelectorAll('[data-bind-title]').forEach(el => { el.title = el.dataset.bindTitle.replace('#', keyOn(el.dataset.bindKey)); });
}
// putting a key on an action: one already doing something else swaps over to the key this one had, so nothing's lost
// (what it swapped with, or null; false if the key can't be used)
export function setBind(a, k) {
  if (!(a in BIND_DEF) || BIND_LOCK.has(k)) return false;
  const other = Object.keys(KB).find(b => b !== a && KB[b] === k) || null;
  if (other) KB[other] = KB[a];
  KB[a] = k; saveBinds(); refreshKeyHints(); return other;
}
export function resetBinds() { Object.assign(KB, BIND_DEF); saveBinds(); refreshKeyHints(); }
refreshKeyHints();
