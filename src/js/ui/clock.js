// Clock dial: the day and night bands, an hour tick for every hour (longer every six), and the sun's rays.

{
  const pt = (h, r) => { const a = h / 24 * Math.PI * 2 - Math.PI; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  const arc = (h0, h1, r) => { const [x0, y0] = pt(h0, r), [x1, y1] = pt(h1, r), span = ((h1 - h0) + 24) % 24; return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  $('dialNight').setAttribute('d', arc(19.8, 5.2, 35)); $('dialDay').setAttribute('d', arc(6.4, 18.6, 35));
  $('dialTicks').innerHTML = Array.from({ length: 24 }, (_, h) => { const major = h % 6 === 0, [a, b] = pt(h, 42), [c, d] = pt(h, major ? 38.6 : 40.4); return `<line class="tick${major ? ' major' : ''}" x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"></line>`; }).join('');
  document.querySelector('#dialSun .rays').innerHTML = Array.from({ length: 8 }, (_, k) => { const a = k / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return `<line x1="${(c * 6).toFixed(2)}" y1="${(s * 6).toFixed(2)}" x2="${(c * 8).toFixed(2)}" y2="${(s * 8).toFixed(2)}"></line>`; }).join('');
}
// what the hour is called under the clock
const dayPart = h => h >= 4.5 && h < 7 ? 'Dawn' : h < 11 && h >= 7 ? 'Morning' : h >= 11 && h < 14 ? 'Midday' : h >= 14 && h < 17.5 ? 'Afternoon' : h >= 17.5 && h < 20 ? 'Dusk' : 'Night';
