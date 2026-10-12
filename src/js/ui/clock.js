// Clock dial ticks.

// dial arcs
{
  const pt = (h, r) => { const a = h / 24 * Math.PI * 2 - Math.PI; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  const arc = (h0, h1, r) => { const [x0, y0] = pt(h0, r), [x1, y1] = pt(h1, r), span = ((h1 - h0) + 24) % 24; return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  $('dialNight').setAttribute('d', arc(20, 5, 27)); $('dialDay').setAttribute('d', arc(6.5, 18.5, 27));
  $('dialTicks').innerHTML = [0, 3, 6, 9, 12, 15, 18, 21].map(h => { const [a, b] = pt(h, 30), [c, d] = pt(h, h % 6 ? 26.5 : 24.5); return `<line class="tick" x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${d.toFixed(1)}"></line>`; }).join('');
}
