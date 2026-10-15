// Recorded sound effects from a sound pack (the Rust & Blood SFX library in assets/sounds), played as they come: no
// clip is edited, only how loud it plays. Which files make up each set, how loud the set plays and how much zooming out
// quietens it is src/sounds/sfx-bank.json; tools/build.mjs takes those files out of the pack into dist/sounds/sfx/ and
// fills in SFX_BANK with where each went. Every clip of a set is evened out to the set's level as it loads
// (audio/spatial.js), one's never played twice running, and each goes off a touch higher or lower. They're fetched once
// audio starts, and till a set's loaded (or with no pack, or a browser that can't decode it) the synthesized sound
// stands in (audio/sfx.js)
const SFX_BANK = null;
const BANK = {};
if (SFX_BANK) for (const [k, b] of Object.entries(SFX_BANK)) BANK[k] = { level: b.level, zoom: b.zoom ?? 1, clips: b.urls.map(u => loadSound(u, true)) };
const recReady = k => !!(BANK[k] && BANK[k].clips.some(c => c.buf));
// play one of set k from x, z (your feet unless said), at vol on top of its level: whether it could
function rec(k, o = {}) {
  const b = BANK[k]; if (!b || !AC) return false;
  const ready = b.clips.filter(c => c.buf); if (!ready.length) return false;
  let c = ready[Math.floor(Math.random() * ready.length)];
  if (ready.length > 1 && c === b.last) c = ready[(ready.indexOf(c) + 1 + Math.floor(Math.random() * (ready.length - 1))) % ready.length];
  b.last = c;
  playAt(c.buf, { x: o.x ?? P.x, z: o.z ?? P.z, vol: b.level * c.norm * (o.vol ?? 1), rate: (o.rate ?? 1) * rr(0.97, 1.03), zoomK: b.zoom });
  return true;
}
// what kind of gun's in your hands, for the sets that go by kind: a sidearm, a 9 mm automatic or a rifle (the drum
// shotgun's box mag counts as a rifle's); its suppressed shot's kind too
const gunKind = (id = curId()) => { const D = WEAP[id] || {}; return D.slot === 'side' ? 'side' : D.ammo === 'p9' ? 'smg' : 'rifle'; };
const suppKind = id => { const D = WEAP[id] || {}; return D.ammo === 'shells' ? 'shotgun' : id === 'hunting' ? 'sniper' : gunKind(id); };
// a gunshot: the gun's own, or its kind's suppressed one
function gunSound(id, quiet) {
  if (rec(quiet ? 'supp.' + suppKind(id) : 'fire.' + id)) return;
  if (quiet) SFX.supp((WEAP[id] || {}).ammo === 'shells'); else SFX[GUN_SFX[id]]();
}
// the synthesized sounds a recording takes over: each returns whether it did (if not, the synthesized one plays). A
// recorded rack has the whole action in it, so where the synthesized one comes in two halves the second is left quiet
const REC_SFX = {
  magOut: () => rec('magOut.' + gunKind()), magIn: () => rec('magIn.' + gunKind()),
  shell: () => rec((W(curId()) || {}).ammo === 'shells' ? 'shell.shells' : 'shell.round'),
  chargePull: () => gunKind() === 'side' ? recReady('slide') : rec('charge.' + gunKind()),   // (a pistol's whole slide is in slideDrop)
  chargeSlam: () => recReady('charge.' + gunKind()),
  slideDrop: () => rec('slide'),
  pumpBack: () => rec('pump'), pumpHome: () => recReady('pump'),
  rack: () => (W(curId()) || {}).ammo === 'shells' && rec('pump'),
  dry: () => rec('dry.' + gunKind()),
  equip: () => rec('equip'),
  swingBlunt: two => rec(two ? 'swing.heavy' : 'swing.light'), swingBlade: chop => rec(chop ? 'swing.heavy' : 'swing.knife'),
  hitBlunt: big => rec(big ? 'hit.bluntBig' : 'hit.blunt'), hitBlade: chop => rec(chop ? 'hit.chop' : 'hit.blade'),
  board: () => rec('board.hit'), crack: () => rec('board.break'),
  gunDrop: (x, z) => rec('gunDrop', { x, z }),
  launch: () => rec('gl'), boom: (x, z) => rec('boom', { x, z }),
  pick: () => rec('pick'), craft: () => rec('craft'), upgrade: () => rec('upgrade'), rip: () => rec('heal')
};
Object.entries(REC_SFX).forEach(([k, f]) => { const syn = SFX[k] || (() => {}); SFX[k] = (...a) => { if (!f(...a)) syn(...a); }; });
