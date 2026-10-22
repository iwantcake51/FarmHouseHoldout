// Day/night cycle colours and the sun.

// [hour, sun colour, sun strength, sky strength, background/fog, ambient colour, ambient level]
// graded warm on purpose: honey afternoons, a long amber dusk, and nights that sit in plum and ember rather than cold blue
const DAY = [
  [0, 0xc4b2d6, 0.3, 0.75, 0x130e10, 0x8a7690, 0.27], [4.5, 0xc4b2d6, 0.3, 0.75, 0x130e10, 0x8a7690, 0.27], [6.5, 0xffa070, 0.62, 0.6, 0x4a3a38, 0xf2c0a0, 0.72],
  [9, 0xffdcae, 0.95, 0.64, 0x786e60, 0xfff0da, 1.0], [15, 0xffd6a4, 0.95, 0.64, 0x786a5c, 0xffeed4, 1.0], [18, 0xff8846, 0.8, 0.6, 0x4a302c, 0xffb48a, 0.8],
  [20, 0xc4b2d6, 0.32, 0.75, 0x17100f, 0x8a7690, 0.29], [24, 0xc4b2d6, 0.3, 0.75, 0x130e10, 0x8a7690, 0.27]
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), amb = [1, 1, 1];
let curDark = 0;
function lightAt(h) {
  let k = 0; while (k < DAY.length - 2 && DAY[k + 1][0] <= h) k++;
  const a = DAY[k], b = DAY[k + 1], t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1), lerp = (u, v) => u + (v - u) * t;
  _c1.setHex(a[1]).lerp(_c2.setHex(b[1]), t); sun.color.copy(_c1);
  sun.intensity = lerp(a[2], b[2]); hemi.intensity = lerp(a[3], b[3]);
  _c1.setHex(a[4]).lerp(_c2.setHex(b[4]), t); scene.background.copy(_c1); scene.fog.color.copy(_c1);
  _c1.setHex(a[5]).lerp(_c2.setHex(b[5]), t); const lv = lerp(a[6], b[6]);
  amb[0] = _c1.r * lv; amb[1] = _c1.g * lv; amb[2] = _c1.b * lv;
  return 1 - clamp((lv - 0.25) / (1 - 0.25), 0, 1);
}
// your eyes getting used to the dark, no upgrade needed: out of the light they slowly adjust (about 40 seconds to get
// all the way), and the dark lifts a little, still in black and white (uAdapt in the light-map shader, core/shaders.js).
// A couple of seconds in lamplight or daylight and it's gone, so the dark outside is as black as ever when you step
// back out into it. litHere is the light where you stand (lighting/lightmap.js): night ambient is about 0.13 and a lit
// room well over 0.3
let litHere = 1;
const DARK_EYES = { dark: 0.2, lit: 0.3, adjust: 40, lose: 2, lift: 0.7 };
function updateDarkEyes(dt) {
  const want = state === 'title' ? 0 : clamp((DARK_EYES.lit - litHere) / (DARK_EYES.lit - DARK_EYES.dark), 0, 1), a = P.adapt || 0;
  P.adapt = a < want ? Math.min(want, a + dt / DARK_EYES.adjust) : Math.max(want, a - dt / DARK_EYES.lose);
  LMU.uAdapt.value = smooth(P.adapt) * DARK_EYES.lift;
}
// the light that throws the shadows: the sun by day and the moon by night, each on its way across the sky, so the
// shadows creep round all night as they do all day. The moon rises in the east as the sun goes down in the west and
// sets as it comes up (MOON: its arc, how high it rides), and the light swings over from one to the other through
// dusk and back through dawn (SKY_SWAP: the hours it takes), dimming as it goes (SKY_SWAP.dip: the twilight between,
// with no hard shadows), so they never jump. By moonlight its shadows are longer and softer: the shadow map's
// spread over more ground (SKY_SWAP.soft more), its edges coarser
const MOON = { arc: 20, low: 6, high: 15, z: -7, min: 0.33 }, SKY_SWAP = { dusk: [18.7, 20.3], dawn: [4.4, 6.0], dip: 0.65, soft: 0.45 };
const _sunD = new V3(), _moonD = new V3();
function sunDir(h, out) { const a = (h - 6) / 12 * Math.PI, el = Math.max(0.3, Math.sin(a)); return out.set(-Math.cos(a) * 20, 6 + el * 18, 8).normalize(); }
function moonDir(h, out) {
  const a = ((h - 18 + 24) % 24) / 12 * Math.PI, el = Math.max(MOON.min, Math.sin(clamp(a, 0, Math.PI)));
  return out.set(-Math.cos(clamp(a, 0, Math.PI)) * MOON.arc, MOON.low + el * MOON.high, MOON.z).normalize();
}
// how far it's the moon's light (0 by day, 1 by night)
function moonK(h) {
  const S = SKY_SWAP;
  if (h >= S.dusk[0] && h < S.dusk[1]) return smooth((h - S.dusk[0]) / (S.dusk[1] - S.dusk[0]));
  if (h >= S.dawn[0] && h < S.dawn[1]) return 1 - smooth((h - S.dawn[0]) / (S.dawn[1] - S.dawn[0]));
  return h >= S.dusk[1] || h < S.dawn[0] ? 1 : 0;
}
let skySoft = -1;
// the title's hour, picked afresh each time you come back to it: deep in the night, the dawn just coming up, or the
// dusk going down (hours to pick from in each), with the sun or the moon brought low over the fields (flat: how much
// of its height it keeps), so the shadows reach long across the yard, and a little more light over it all than a run
// gets at that hour (lift), so the farm shows through behind the menu
const TITLE_SKY = { night: [21.6, 23.4], dawn: [6.1, 6.7], dusk: [17.5, 18.2], flat: 0.42, lift: 1.3, h: 18.2 };
function titleSky() { const r = rand(), T = TITLE_SKY, w = r < 1 / 3 ? T.night : r < 2 / 3 ? T.dawn : T.dusk; T.h = rr(w[0], w[1]); }
titleSky();
// time of day: sun, ambient, the clock, bugs and mist
function updateDayNight(rdt) {
  const tb = titleBlend(), h = mix(tod, TITLE_SKY.h, tb);
  curDark = lightAt(h);
  if (tb > 0) { const l = mix(1, TITLE_SKY.lift, tb); amb[0] *= l; amb[1] *= l; amb[2] *= l; hemi.intensity *= l; sun.intensity *= l; }
  // the sun or the moon, aimed at the middle of the farm from far enough out that its shadows take in all of it
  { const w = moonK(h); sunDir(h, _sunD); moonDir(h, _moonD);
    sun.position.copy(_sunD.multiplyScalar(1 - w).addScaledVector(_moonD, w)); if (sun.position.lengthSq() < 1e-6) sun.position.set(0, 1, 0);
    sun.position.normalize().y *= mix(1, TITLE_SKY.flat, tb);   // (low on the title: long shadows)
    sun.intensity *= 1 - SKY_SWAP.dip * Math.sin(Math.PI * w);   // (between the two: twilight)
    const soft = Math.round((1 + SKY_SWAP.soft * w) * 50) / 50;
    if (soft !== skySoft) { skySoft = soft; const r = SUN_R * soft, c = sun.shadow.camera; c.left = c.bottom = -r; c.right = c.top = r; c.updateProjectionMatrix(); } }
  sun.position.setLength(SUN_D); sun.target.position.set(0, 0, 0);
  LMU.uUnseen.value = Math.min(0.86, 0.86 - curDark * 0.46 + (state !== 'title' ? viewer().nv * curDark * 0.16 : 0));
  openings.forEach(o => o.meshes.forEach(m => { const u = m.userData; if (u.place < 1) { u.place = Math.min(1, u.place + rdt / BOARD_PLACE); boardPlace(m, u.place); } }));   // boards going up (barricades/planks.js)
  if (state !== 'title') {
    // the clock only runs during a wave (game/update.js); between waves it says so and the digits pulse
    const hh = Math.floor(tod), mm = Math.floor((tod % 1) * 6) * 10, stopped = phase !== 'wave';
    setT('clockTime', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    setT('clockPhase', stopped ? 'Time stopped' : dayPart(tod));
    // the sun sinks into the moon over dusk and the moon fades back into the sun over dawn
    const rot = (tod / 24 * 360 - 180).toFixed(1), night = dialNight(tod).toFixed(2);
    if (cache.dialRot !== rot) { cache.dialRot = rot; $('dialHand').setAttribute('transform', `rotate(${rot})`); }
    if (cache.dialNight !== night) {
      cache.dialNight = night; const n = +night, sun = $('dialSun'), moon = $('dialMoon');
      sun.style.opacity = 1 - n; moon.style.opacity = n; sun.style.display = n > 0.99 ? 'none' : ''; moon.style.display = n < 0.01 ? 'none' : '';
    }
    if (cache.clockStop !== stopped) { cache.clockStop = stopped; $('clockBox').classList.toggle('paused', stopped); }
  }
  stepAtmos(rdt);
  // fireflies
  fireflies.m.opacity = Math.max(0, curDark - 0.4) * 1.3 * (0.75 + Math.sin(worldT * 3.33) * 0.25);
  if (fireflies.m.opacity > 0.01) {
    const t = worldT;
    fireflies.seed.forEach((s, k) => { fireflies.pos[k * 3] = s.x + Math.sin(t * s.s + s.p) * 1.2; fireflies.pos[k * 3 + 1] = s.y + Math.sin(t * s.s * 1.7 + s.p) * 0.3; fireflies.pos[k * 3 + 2] = s.z + Math.cos(t * s.s * 0.8 + s.p) * 1.2; });
    fireflies.pts.geometry.attributes.position.needsUpdate = true;
  }
  moths.m.opacity = clamp((curDark - 0.3) * 1.8, 0, 0.9);
  if (moths.m.opacity > 0.01) {
    const t = worldT;
    moths.seed.forEach((s, k) => {
      const a = s.p + t * s.s, wob = 1 + 0.35 * Math.sin(t * s.w + s.p);
      moths.pos[k * 3] = s.c[0] + Math.cos(a) * s.r * wob + Math.sin(t * 11 + k) * 0.03;
      moths.pos[k * 3 + 1] = s.c[1] + s.y + Math.sin(t * s.w * 1.3 + k) * 0.12;
      // the porch lamp's moths loop out in front of it, never back through the wall into the house
      moths.pos[k * 3 + 2] = s.c[2] + (s.wall ? 0.12 + Math.abs(Math.sin(a)) : Math.sin(a)) * s.r * wob + Math.cos(t * 13 + k) * 0.03;
    });
    moths.pts.geometry.attributes.position.needsUpdate = true;
  }
}
