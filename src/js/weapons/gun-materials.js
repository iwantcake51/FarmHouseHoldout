// Gun materials and the per-slot weapon groups held by the player.

// ---- gun models: each gun has its own shape, mods and tiers add their own parts ----
const GM = {
  metal: lam(0x2a2b2e), metal2: lam(0x45474a), steel: lam(0x8a8d90), wood: lam(0x5b3f2a), wood2: lam(0x7a5434), brass: lam(0xb08a3e), shell: lam(0x9c2e22), shellY: lam(0xc9a43a), shellO: lam(0xd8682a),
  olive: lam(0x4a5236), red: basic(0xff4a32), bat: lam(0x9c7a52), nail: lam(0x9a9a94), wire: lam(0x3a3a38), blade: lam(0xb8bcbf), copper: lam(0xb0663a), filter: lam(0xc0682a), filterB: lam(0x1f4f9a), label: lam(0xe6e2d6), tape: lam(0x8a8a82),
  lens: basic(0xfff2c8), lens2: basic(0x5a8aa8), holo: basic(0x6ad0c0), ember: basic(0xff7a2a), orange: lam(0xd8692c),
  hi: lam(0x7c8188), poly: lam(0x1d1e20), rubber: lam(0x131313), blued: lam(0x252b32), park: lam(0x3a3c36), walnut: lam(0x6a4226), walnut2: lam(0x84552f), engr: lam(0xb4b0a4),
  dot: basic(0xeae4cc), dotR: basic(0xff5a2a), glass: lam(0x2c5468), holoGlass: new THREE.MeshBasicMaterial({ color: 0x7ab8c8, transparent: true, opacity: 0.35, depthWrite: false }), tan: lam(0x9a8460), filterD: lam(0x14335f)
};
const glowMats = [GM.metal, GM.metal2, GM.wood, GM.brass, GM.bat, GM.steel, GM.wood2, GM.poly, GM.park, GM.blued, GM.walnut, GM.olive];
const gunMeshes = {}, MUZ = {}, AKX = 0.2, X = 0.1, SLIDES = {}, MAGPOS = {}, MAGG = {}, CRANE = {}, HOLDS = {};
let stowDirty = true;
SLOTS.forEach(s => { const g = new THREE.Group(); (s === 'melee' ? PM.armR : PM.upper).add(g); gunMeshes[s] = g; });
gunMeshes.melee.position.set(0, 0, 0.5);
