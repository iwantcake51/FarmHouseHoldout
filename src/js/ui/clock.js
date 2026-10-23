// Clock dial: a ring of colour that fades through the day (deep blue at night, a rose dawn, gold by day, an ember dusk),
// an hour tick for every hour (longer every six), and the sun's rays.

import { $ } from '../core/dom.js';
import { clamp, smooth } from '../core/math.js';

// the dial's colour at each hour, and how much of the night is in it (the sun and moon trade places on that)
const DIAL_KEYS = [[0, 0x4c63a0], [4.6, 0x566ea8], [5.6, 0x9a6c9a], [6.6, 0xe0806a], [8, 0xe8b056], [16.5, 0xe2a64e], [18.2, 0xe57a3e], [19.4, 0xa05a7a], [20.4, 0x566ea8], [24, 0x4c63a0]];
const dialEase = t => smooth(clamp(t, 0, 1));
export const dialNight = h => h < 5 ? 1 : h < 7 ? 1 - dialEase((h - 5) / 2) : h < 18.4 ? 0 : h < 20.2 ? dialEase((h - 18.4) / 1.8) : 1;
function dialColour(h) {
  let k = 0; while (k < DIAL_KEYS.length - 2 && DIAL_KEYS[k + 1][0] <= h) k++;
  const [h0, a] = DIAL_KEYS[k], [h1, b] = DIAL_KEYS[k + 1], t = dialEase((h - h0) / (h1 - h0));
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
{
  const pt = (h, r) => { const a = h / 24 * Math.PI * 2 - Math.PI; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  // 96 short arcs, each a quarter hour wide and a hair longer so no seams show between them
  const NS = 96, R = 35;
  $('dialRing').innerHTML = Array.from({ length: NS }, (_, i) => {
    const h0 = i / NS * 24, h1 = (i + 1.06) / NS * 24, [x0, y0] = pt(h0, R), [x1, y1] = pt(h1, R);
    return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="${dialColour((i + 0.5) / NS * 24)}"></path>`;
  }).join('');
  $('dialTicks').innerHTML = Array.from({ length: 24 }, (_, h) => { const major = h % 6 === 0, [a, b] = pt(h, 42), [c, d] = pt(h, major ? 38.6 : 40.4); return `<line class="tick${major ? ' major' : ''}" x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"></line>`; }).join('');
  document.querySelector('#dialSun .rays').innerHTML = Array.from({ length: 8 }, (_, k) => { const a = k / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(c * 6).toFixed(2)}" y1="${(s * 6).toFixed(2)}" x2="${(c * 8).toFixed(2)}" y2="${(s * 8).toFixed(2)}"></line>`; }).join('');
}
// what the hour is called under the clock
export const dayPart = h => h >= 4.5 && h < 7 ? 'Dawn' : h < 11 && h >= 7 ? 'Morning' : h >= 11 && h < 14 ? 'Midday' : h >= 14 && h < 17.5 ? 'Afternoon' : h >= 17.5 && h < 20 ? 'Dusk' : 'Night';
