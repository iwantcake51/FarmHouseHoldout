// Textures for the effects: the particle sprites from the Kenney packs, and a few drawn here.

function glowTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); return t; }
// the particle sprites (Kenney's Particle Pack and Light Masks, packed into PART_ART by tools/pack-particles.py), each
// loaded once as a texture the first time it's asked for
const PART_TEX = {}, _ptl = new THREE.TextureLoader();
function partTex(k) { return PART_TEX[k] || (PART_TEX[k] = _ptl.load(PART_ART[k])); }
const partSet = (...ks) => ks.map(partTex);
// a soft round glow (a flash's core, a tracer's head, a hot case), a four-point star (a flash seen head on, a big round
// landing), the flash's tongues seen from the side (base at the muzzle), and the smoke billows
const TEX_CORE = partTex('glow'), TEX_STAR = partTex('star7'), TEX_STARS = partSet('star6', 'star7', 'star8');
const TEX_MUZZLE = partSet('muzzle1', 'muzzle2', 'muzzle3', 'muzzle4', 'muzzle5'), TEX_TONGUE = TEX_MUZZLE[0];
const TEX_SMOKES = partSet('smoke1', 'smoke2', 'smoke3', 'smoke4', 'smoke5', 'smoke6', 'smoke7', 'smoke8'), TEX_SMOKE = TEX_SMOKES[0];
// the smoke sprites are shaded grey (about half bright on average), so whatever's tinted with them is lifted by this
const SMOKE_GAIN = 1.9;
const addMat = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op || 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
