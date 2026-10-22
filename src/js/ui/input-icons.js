// Every key and mouse button the game shows is drawn from Kenney's input prompts (ui/input-icons-data.js): the prompts
// over a window or a station, the HUD's hints, the title's controls, the settings' Controls tab and its keyboard and
// mouse. Each is an inline SVG in the colour of the text it sits in (a pressed mouse button's in the accent), so it
// takes its place's look without a picture for every colour; a key the pack hasn't got is written out instead.

// a key as the bindings keep it (e.key, lower-cased; mouse1-5) to the pack's name for it, where they differ
const KEY_ICON = { ' ': 'space', control: 'ctrl', '`': 'tilde', dead: 'tilde', '-': 'minus', '=': 'equals', '+': 'plus', '[': 'bracket_open', ']': 'bracket_close',
  '\\': 'slash_back', ';': 'semicolon', "'": 'apostrophe', '"': 'quote', ',': 'comma', '.': 'period', '/': 'slash_forward', arrowup: 'arrow_up', arrowdown: 'arrow_down',
  arrowleft: 'arrow_left', arrowright: 'arrow_right', pageup: 'page_up', pagedown: 'page_down', meta: 'win', mouse1: 'mouse_left', mouse2: 'mouse_right',
  mouse3: 'mouse_scroll', mouse4: 'mouse_side4', mouse5: 'mouse_side5' };
const iconOf = k => { const n = KEY_ICON[k] || k; return KEN_ICONS[n] ? n : null; };
// one of the pack's icons as an SVG, its box its own shape (CSS sizes it by its height: .kIco)
function kenSvg(n, cls) {
  const I = KEN_ICONS[n];
  return `<svg class="kIco${cls ? ' ' + cls : ''}" viewBox="${I[0]} ${I[1]} ${I[2]} ${I[3]}" style="--ar:${(I[2] / I[3]).toFixed(3)}" aria-hidden="true">${I[4].map(d => `<path d="${d}"/>`).join('')}${I[5].map(d => `<path class="hi" d="${d}"/>`).join('')}</svg>`;
}
// a key as it's shown: its icon (its name read out to a screen reader), or its name written if there's no icon for it
function keyIcon(k) {
  const n = iconOf(k);
  return n ? `<span class="kKey" role="img" aria-label="${keyLabel(k)}">${kenSvg(n)}</span>` : `<span class="kKey txt">${keyLabel(k)}</span>`;
}
// the weapon keys together: the first and last with a dash while they run 1 to 4, otherwise each of them
function slotIcons() { const s = [1, 2, 3, 4].map(n => KB['slot' + n]); return s.join('') === '1234' ? keyIcon('1') + '<span class="kDash">–</span>' + keyIcon('4') : s.map(keyIcon).join(''); }
