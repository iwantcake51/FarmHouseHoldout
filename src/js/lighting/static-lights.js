// Fixed lights: porch lamp, barrel fire, bulbs, window and door spill.

const STATIC_LIGHTS = [
  { x: cxw(21) + 0.7, z: cxw(HZ1) + 0.7, r: 7.5, col: [1, 0.62, 0.3], int: 1.3 },
  { x: (cxw(24) + cxw(25)) / 2 + 0.4, z: cxw(20) + 0.1, r: 6.5, col: [1, 0.78, 0.5], int: 1.1 },
  { x: cxw(14), z: cxw(16), r: 6.5, col: [1, 0.48, 0.18], int: 1.6, flicker: true },
  { x: cxw(24), z: cxw(25) - 0.5, r: 2.2, col: [0.5, 1, 0.45], int: 0.5 },
  ...HANG.map(([x, z]) => ({ x, z, r: 6.2, col: [1, 0.7, 0.4], int: 1.3, inside: true })),
  { fill: true, col: [1, 0.68, 0.4], int: 0.5, inside: true },
  // warm light spilling out through each window and the doorway; one board dims it, two shut it off
  ...openings.map(o => ({ spill: o, x: o.x - o.nx * 0.3, z: o.z - o.nz * 0.3, r: o.kind === 'door' ? 6 : 5, cone: { dir: Math.atan2(o.nx, o.nz), half: o.kind === 'door' ? 0.62 : 0.78 }, col: [1, 0.66, 0.36], int: o.kind === 'door' ? 1.05 : 0.9 }))
];
STATIC_LIGHTS.forEach(L => {
  if (!L.fill) { L.field = lightField(L.x, L.z, L.r, L.cone); return; }
  L.field = [];   // even warm fill across the rooms
  for (let b = 0; b < FN; b++) for (let a = 0; a < FN; a++) { const x = sampleX(a), z = sampleX(b); if (x > HOUSE.x0 + 0.5 && x < HOUSE.x1 - 0.5 && z > HOUSE.z0 + 0.5 && z < HOUSE.z1 - 0.5) L.field.push(b * FN + a, 1); }
});
