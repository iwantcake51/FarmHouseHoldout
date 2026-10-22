// Packs the keyboard and mouse prompts out of Kenney's Input Prompts (assets/textures/kenney_input-prompts_1.4.zip, CC0)
// into src/js/ui/input-icons.js: each icon's outline as SVG path data, with the box it fills, so the game draws every
// key and mouse button it shows from them (ui/input-icons.js: keyIcon), in whatever colour the place it's shown wants.
//
//   node tools/pack-inputs.mjs
//
// Each icon is [x, y, width, height, [paths in the key's colour], [paths in the highlight colour]]: the box is the
// icon's own (a wide key's is wider than it's tall), so it sits in a line of text at its real shape. The mouse is also
// kept in its parts (MOUSE_PARTS: each button, the wheel, the body) for the Controls tab's drawing of it, which lights
// each one on its own, and its side buttons, which the pack doesn't have, are drawn on in the same style.

import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ZIP = path.join(ROOT, 'assets/textures/kenney_input-prompts_1.4.zip'), DIR = 'Keyboard & Mouse/Vector/';
const KEYS = ['a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9 f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12',
  'arrow_up arrow_down arrow_left arrow_right space shift ctrl alt tab enter escape backspace capslock minus equals plus',
  'comma period slash_forward slash_back bracket_open bracket_close semicolon apostrophe quote tilde delete insert home end',
  'page_up page_down win numlock printscreen'].join(' ').split(' ').map(k => 'keyboard_' + k);
const MICE = ['mouse', 'mouse_left', 'mouse_right', 'mouse_scroll', 'mouse_scroll_up', 'mouse_scroll_down', 'mouse_move'];
const read = f => execFileSync('unzip', ['-p', ZIP, DIR + f + '.svg'], { encoding: 'utf8' });
// the paths of one icon: [{ fill, d }]
const paths = svg => [...svg.matchAll(/<path[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*d="([^"]+)"/g)].map(m => ({ fill: m[1].toUpperCase(), d: m[2].replace(/\s+/g, ' ').trim() }));
// the box round path data: every number in it is part of a point, in x y pairs (M, L and Q only, all absolute)
function box(ds) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const d of ds) { const n = d.match(/-?[\d.]+/g).map(Number); for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); } }
  return [x0, y0, +(x1 - x0).toFixed(2), +(y1 - y0).toFixed(2)];
}
const icon = ps => { const body = ps.filter(p => p.fill === '#FFFFFF').map(p => p.d), hi = ps.filter(p => p.fill !== '#FFFFFF').map(p => p.d); return [...box(body.concat(hi)), body, hi]; };
const out = {};
for (const f of KEYS.concat(MICE)) out[f.replace(/^keyboard_/, '')] = icon(paths(read(f)));
// the mouse in its parts: its one outline is four closed shapes (the right button, the wheel, the body, the left
// button), told apart here by where each starts; and the side buttons drawn onto its left flank, front (mouse 5) and back
// (mouse 4), rounded like its own corners
const sub = paths(read('mouse'))[0].d.split(/(?=M)/).map(s => s.trim());
const at = (x, y) => sub.find(s => s.startsWith(`M${x} ${y}`));
const side = (y0, y1) => `M12.2 ${y0} L13.4 ${y0} 13.4 ${y1} 12.2 ${y1} Q10.6 ${y1} 10.6 ${y1 - 1.6} L10.6 ${y0 + 1.6} Q10.6 ${y0} 12.2 ${y0}`;
const PARTS = { left: at(20, 10), right: at(34, 10), wheel: at(29.9, 16.9), body: at(15, 28), side5: side(29.5, 34.5), side4: side(36, 41) };
for (const k in PARTS) if (!PARTS[k]) throw new Error('mouse part not found: ' + k);
const all = Object.values(PARTS), allBut = k => Object.entries(PARTS).filter(([n]) => n !== k).map(([, d]) => d);
out.mouse_side = [...box(all), all, []];
out.mouse_side4 = [...box(all), allBut('side4'), [PARTS.side4]];
out.mouse_side5 = [...box(all), allBut('side5'), [PARTS.side5]];
const js = `// Kenney's Input Prompts (www.kenney.nl, CC0): the keyboard and mouse icons, as SVG path data. Made by
// tools/pack-inputs.mjs from assets/textures/kenney_input-prompts_1.4.zip; don't edit by hand, run it again.
// name: [x, y, width, height, [paths in the key's colour], [paths in the highlight colour]]
const KEN_ICONS = ${JSON.stringify(out)};
// the mouse in its parts, for the Controls tab's drawing (ui/keyboard-map.js), the side buttons drawn on in its style
const MOUSE_PARTS = ${JSON.stringify(PARTS)};
`;
fs.writeFileSync(path.join(ROOT, 'src/js/ui/input-icons-data.js'), js);
console.log(`${Object.keys(out).length} icons, ${(js.length / 1024).toFixed(1)} KB`);
