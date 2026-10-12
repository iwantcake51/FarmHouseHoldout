// Player state (P), the player model, backpack and cap.

const P = { stam: 1, exh: false, stamT: 9, x: cxw(21), z: cxw(22), hp: 100, aim: Math.PI, phase: 0, moving: false, vault: null, slow: 0, stun: 0, adr: 0, still: 0, vx: 0, vz: 0 };
const PM = human(0xd2a07c, 0x4e5a3c, 0x2f3238);
scene.add(PM.g);
box(PM.head, 0.36, 0.1, 0.38, lam(0xc4612a), 0, 0.17, 0.02);
box(PM.head, 0.3, 0.04, 0.16, lam(0xc4612a), 0, 0.13, 0.24);
box(PM.upper, 0.4, 0.42, 0.18, lam(0x5a4a34), 0, 0.92, -0.24);
box(PM.upper, 0.34, 0.12, 0.2, lam(0x4a3c2a), 0, 1.17, -0.24);
box(PM.upper, 0.36, 0.16, 0.14, lam(0x7a6a4a), 0, 0.66, -0.26);
const armorG = new THREE.Group();
PM.upper.add(armorG);
const pBlob = blobShadow(1.15, 0.38);
// a faint light rim round your own character so you never lose yourself in the dark or in a crowd
const pOutline = outline(PM.g, 0xf2e8d0, 0, 0.016); pOutline.opacity = 0.32;
