// Character gear that shows up from body upgrades (boots, helmet, glasses...).

// character gear: body upgrades show up on the survivor
const gearParts = [];
const gearAdd = (parent, w, h, d, mat, x, y, z) => { const m = box(parent, w, h, d, mat, x, y, z); gearParts.push(m); return m; };
const gearCyl = (parent, r, len, mat, x, y, z, rx) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; m.castShadow = true; parent.add(m); gearParts.push(m); return m; };
const GEAR = { leather: lam(0x4a3524), sole: lam(0x1e1a16), white: lam(0xd8d2c4), red: lam(0xb8382a), blue: lam(0x34607e), amber: lam(0xe0a030), olive: lam(0x4a5236), dark: lam(0x24262a), green: basic(0x7cf08a), lens: basic(0xe8c25a), orange: lam(0xd06a2a), steel: lam(0x8a8d90), wood: lam(0x7a5434) };
function buildGear() {
  gearParts.forEach(m => m.parent && m.parent.remove(m)); gearParts.length = 0;
  // footwear: boots, then running shoes, then trail runners; thick soles grow the sole
  const bt = T('boots'), thick = S.slowRes > 0 ? 0.035 : 0;
  PBOOT.forEach(m => { m.visible = !(bt || thick); });
  bandPouch2.visible = !!S.pouch;
  if (bt || thick) {
    const upper = [GEAR.dark, GEAR.leather, GEAR.white, GEAR.blue][bt], sole = [GEAR.sole, GEAR.sole, GEAR.red, GEAR.amber][bt];
    [PM.legL, PM.legR].forEach(l => {
      gearAdd(l, 0.22, bt === 1 ? 0.2 : 0.13, 0.33, upper, 0, bt === 1 ? -0.47 : -0.5, 0.05);
      gearAdd(l, 0.235, 0.04 + thick, 0.34, sole, 0, -0.565 - thick / 2, 0.05);
      if (bt >= 2) gearAdd(l, 0.225, 0.03, 0.12, sole, 0, -0.47, 0.13);
    });
  }
  if (S.vaultMul < 1) [PM.legL, PM.legR].forEach(l => gearAdd(l, 0.21, 0.12, 0.06, GEAR.dark, 0, -0.27, 0.12));          // knee pads
  if (S.reloadMul < 1) [PM.armL, PM.armR].forEach(a => gearAdd(a, 0.16, 0.16, 0.13, GEAR.dark, 0, 0, 0.49));             // shooting gloves, a hair past the fist so no face is shared
  // eyes: shooting glasses, then night-vision goggles
  if (T('night')) {
    gearAdd(PM.head, 0.34, 0.05, 0.04, GEAR.dark, 0, 0.1, 0.17);
    gearCyl(PM.head, 0.045, 0.1, GEAR.dark, T('night') === 2 ? -0.07 : 0.07, 0.03, 0.22, Math.PI / 2);
    gearAdd(PM.head, 0.05, 0.05, 0.01, GEAR.green, T('night') === 2 ? -0.07 : 0.07, 0.03, 0.27);
    if (T('night') === 2) { gearCyl(PM.head, 0.045, 0.1, GEAR.dark, 0.07, 0.03, 0.22, Math.PI / 2); gearAdd(PM.head, 0.05, 0.05, 0.01, GEAR.green, 0.07, 0.03, 0.27); }
  } else if (T('eyes')) {
    gearAdd(PM.head, 0.3, 0.06, 0.02, GEAR.lens, 0, 0.04, 0.17); gearAdd(PM.head, 0.02, 0.03, 0.3, GEAR.dark, -0.165, 0.05, 0.02); gearAdd(PM.head, 0.02, 0.03, 0.3, GEAR.dark, 0.165, 0.05, 0.02);
  }
  if (T('eyes') >= 3) gearAdd(PM.head, 0.06, 0.04, 0.02, GEAR.steel, 0.16, 0.214, -0.12);                                    // a little rear-view mirror on the cap
  // hammer line hangs on the belt: claw hammer, framing hammer, then a nail gun on the hip
  const hm = T('hammer');
  if (hm === 1 || hm === 2) { const L = hm === 2 ? 0.34 : 0.26; gearAdd(PM.upper, 0.03, L, 0.03, GEAR.wood, 0.29, 0.6, 0.04); gearAdd(PM.upper, 0.05, 0.05, hm === 2 ? 0.16 : 0.12, GEAR.steel, 0.29, 0.6 + L / 2, 0.04); }
  if (hm === 3) { gearAdd(PM.upper, 0.07, 0.16, 0.22, GEAR.orange, 0.3, 0.62, 0.02); gearAdd(PM.upper, 0.04, 0.1, 0.04, GEAR.dark, 0.3, 0.52, -0.04); }
  if (S.healOnKill) gearCyl(PM.upper, 0.06, 0.16, GEAR.olive, 0.285, 0.62, -0.15);                                         // canteen
  if (S.regen) gearCyl(PM.upper, 0.03, 0.07, GEAR.orange, 0.12, 1.02, 0.17);                                              // pill bottle in the chest strap
  if (S.adrenaline) gearAdd(PM.armL, 0.166, 0.166, 0.05, GEAR.red, 0, 0, 0.22);                                             // red armband
  if (S.secondWind) gearAdd(PM.upper, 0.36, 0.07, 0.34, GEAR.red, 0, 1.15, 0);                                           // bandana
  if (S.slowRes >= 0.85) { gearAdd(PM.head, 0.4, 0.14, 0.42, GEAR.olive, 0, 0.2, 0); gearAdd(PM.head, 0.42, 0.03, 0.1, GEAR.olive, 0, 0.13, 0.2); } // helmet for Stubborn
  if (S.speedMul > 1.3) gearAdd(PM.upper, 0.06, 0.06, 0.06, GEAR.white, -0.256, 0.86, 0.17);                             // stopwatch clip
}
