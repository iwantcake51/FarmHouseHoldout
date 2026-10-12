// PZ-style status icons.

const MOOD_ICON = {
  wound: '<path d="M12 3C12 3 6 10 6 14a6 6 0 0 0 12 0C18 10 12 3 12 3z"/>',
  lungs: '<path d="M12 3v8M12 10c-1.5 1-3-2-5-1.5S4 12 4 15.5 5 21 7 21s3-1.5 3-3.5V12M12 10c1.5 1 3-2 5-1.5s3 3.5 3 7-1 5.5-3 5.5-3-1.5-3-3.5V12"/>',
  pinned: '<path d="M8 3v9l-3 8M16 3v9l3 8M5 12h14"/>',
  adren: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  heavy: '<path d="M6 9h12l2 11H4zM9 9a3 3 0 1 1 6 0"/>',
  wind: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  fire: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 3-6 5-6 10a4 4 0 0 0 4 6z"/>'
};
function renderMoodles() {
  const list = [];
  const hp = P.hp / S.maxHp;
  if (hp < 0.35) list.push(['bad', 'wound', 'Badly hurt']); else if (hp < 0.7) list.push(['warn', 'wound', 'Hurt']);
  if (P.slow > 0.45) list.push(['bad', 'pinned', 'Pinned']); else if (P.slow > 0.15) list.push(['warn', 'pinned', 'Slowed']);
  if (P.bandT > 0) list.push(['good', 'wound', 'Bandaging']); else if (P.heal > 0) list.push(['good', 'wound', 'Healing']);
  if (P.bleed > 0) list.push(['bad', 'wound', 'Bleeding']);
  if (P.exh) list.push(['bad', 'lungs', 'Winded']); else if (P.stam < 0.35) list.push(['warn', 'lungs', 'Tired']);
  if (P.conc > 0.15) list.push(['bad', 'pinned', 'Concussed']);
  if (P.adr > 0) list.push(['good', 'adren', 'Adrenaline']);
  if (S.lastStand && hp < 0.3) list.push(['good', 'fire', 'Last stand']);
  if (S.secondWind && !S.windUsed) list.push(['good', 'wind', 'Second wind ready']);
  const D = W(curId()); if (D && D.slow) list.push(['warn', 'heavy', 'Heavy load']);
  if (curDark > 0.6) list.push(['info', 'night', 'Dark']);
  const key = list.map(l => l[0] + l[2]).join('|');
  if (cache.mood === key) return; cache.mood = key;
  $('moodles').innerHTML = list.map(([c, i, t]) => `<div class="mood ${c}"><span>${t}</span><i><svg viewBox="0 0 24 24">${MOOD_ICON[i]}</svg></i></div>`).join('');
}
