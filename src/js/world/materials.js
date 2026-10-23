// Shared world materials.

import { lam, lit, windy } from '../core/shaders.js';

// foliage coloured per vertex (world/trees.js builds each shape with its colours baked in), tinted per instance; the
// trees get the cut-away that fades them when you're behind one
export const lamV = cut => lit(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), cut);

export const M = {
  groundFar: lam(0x2b2c24), floor: lam(0x6c5037),
  wall: lam(0xc8bea4), found: lam(0x5d5850), trim: lam(0x4a392d), doorFrame: lam(0x3e2f25),
  board: lam(0xa2784b), board2: lam(0x8d6840), tree: windy(lamV('tree'), 0.018), bush: windy(lamV(), 0.05, 0.6), rock: lamV(),
  rust: lam(0x6b3a2b), rust2: lam(0x4f2f25), tire: lam(0x1d1c1b), glass: lam(0x2c3a40), crate: lam(0x7b6244),
  metal: lam(0x2b2c2e), wood: lam(0x5a4130), wood2: lam(0x7a5434), fence: lam(0x6e5a44), barrel: lam(0x4a3b2e), white: lam(0xd8d2c4), olive: lam(0x4a5236), deck: lam(0x6a5038)
};
