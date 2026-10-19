// Fixed lights: porch lamp, barrel fire, bulbs, window and door spill.

// the house's first floor plan, now the grid's blocking is all set up (world/interior.js): its lamps are hung before the
// lights below are worked out
houseLayout((Math.random() * 2147483647) | 0, false);

const hangLight = ([x, z]) => ({ hang: true, x, z, r: 6.5, col: [1, 0.68, 0.36], int: 1.3, inside: true });
const spillLight = o => ({ spill: o, x: o.x - o.nx * 0.3, z: o.z - o.nz * 0.3, r: o.kind === 'door' ? 7 : 6, cone: { dir: Math.atan2(o.nx, o.nz), half: o.kind === 'door' ? 0.62 : 0.78 }, col: [1, 0.64, 0.34], int: o.kind === 'door' ? 1.25 : 1.1 });
const STATIC_LIGHTS = [
  { x: cxw(21) + 0.7, z: cxw(HZ1) + 0.7, r: 8.5, col: [1, 0.6, 0.28], int: 1.55 },
  { barrel: true, x: BURN_BARREL.x, z: BURN_BARREL.z, r: 7.5, col: [1, 0.48, 0.18], int: 1.9, flicker: true },
  { x: cxw(24), z: cxw(25) - 0.5, r: 2.2, col: [0.5, 1, 0.45], int: 0.5 },
  // the hanging bulbs, each a warm pool, over a low fill so the rooms' corners fall darker between them (a brighter fill
  // ran the warm channel up to its top everywhere and flattened the rooms to one even orange)
  ...HANG.map(hangLight),
  { fill: true, col: [1, 0.66, 0.38], int: 0.38, inside: true },
  // warm light spilling out through each window and the doorway; one board dims it, two shut it off
  ...openings.map(spillLight)
];
// (an even warm fill across the rooms, inside this run's footprint: world/house.js)
const fillField = () => { const out = []; for (let b = 0; b < FN; b++) for (let a = 0; a < FN; a++) if (inHouseRect(sampleX(a), sampleX(b), -0.5)) out.push(b * FN + a, 1); return out; };
STATIC_LIGHTS.forEach(L => { L.field = L.fill ? fillField() : lightField(L.x, L.z, L.r, L.cone, true); });
// a new floor plan (world/interior.js): the lamps rehung where its rooms are, the windows' spill where they are, and every
// fixed light worked out again
// round its walls
function relightHouse() {
  for (let k = STATIC_LIGHTS.length - 1; k >= 0; k--) if (STATIC_LIGHTS[k].hang || STATIC_LIGHTS[k].spill) STATIC_LIGHTS.splice(k, 1);
  STATIC_LIGHTS.push(...HANG.map(hangLight), ...openings.map(spillLight));   // (and the spill out of this run's windows)
  STATIC_LIGHTS.forEach(L => { if (L.barrel) { L.x = BURN_BARREL.x; L.z = BURN_BARREL.z; } L.field = L.fill ? fillField() : lightField(L.x, L.z, L.r, L.cone, true); });   // (the burn barrel where the yard has it this run: world/yard.js)
}
