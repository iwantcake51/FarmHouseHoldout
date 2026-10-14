# Farmhouse Holdout

An isometric zombie survival roguelike that runs in the browser, built with three.js.

*Kessler Farm. Board up. Prepare for the horde. Survive as long as you can.*

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev      # plays at http://localhost:5173 and rebuilds every time you save a file
npm run build    # production build into dist/
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Readable build plus a local server. Save any file in `src/` and refresh the browser. |
| `npm run build` | Minified build: `dist/index.html`, `dist/game.js`, `dist/game.css`, `dist/vendor/three.min.js`. |
| `npm run build:dev` | Same files as `build`, but not minified and with a `// ==== path` banner before each source file, so errors point at the right file. |

Every build also writes `dist/standalone.html`: the whole game in one file you can open by double-clicking it or send to someone. It loads three.js from a CDN, so it needs an internet connection.

## Deploying to Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this repository.
2. Leave the settings as they are. `netlify.toml` already sets the build command (`npm run build`), the publish folder (`dist`) and Node 20.
3. Every push to `main` deploys automatically.

## Where everything lives

```
src/
  index.html          page markup: HUD, menus, station panel, touch buttons
  styles/             CSS, one file per part of the screen (index.css imports them all)
  js/
    load-order.json   the order the game files are joined in (see "How the code fits together")
    core/             renderer, camera, shader patch, maths and geometry helpers
    world/            the map: grid, ground, house, fence, trees, props, collision, wall cut-away
    lighting/         light map, day/night cycle, fixed lights, fog of war
    characters/       the blocky human rig the player and zombies share
    player/           player state, movement, aiming, vaulting, shoving, bandages, gear, animation
    weapons/          guns: stats, models, attachments, mods, firing, reloading, casings, explosives
    melee/            melee weapons: stats, models, mods, swinging, stamina, swing trail
    zombies/          zombie types, spawning, AI, pathfinding, damage, death falls
    waves/            how each wave is built and scheduled
    upgrades/         the skills, perks and aid you pick after a wave, gun and character tiers
    stations/         workbench, sawhorse, medicine cabinet, radio, supply drops
    barricades/       boarding doors and windows
    pickups/          ammo, scrap, medkits and other drops
    effects/          blood, particles, smoke, tracers, muzzle flash, outlines
    ui/               HUD, crosshair, health line, status icons, rounds display, menus
    audio/            every sound, synthesized with Web Audio (there are no sound files)
    input/            keyboard, mouse and touch controls
    game/             shared state, the update and draw order, camera, main loop
tools/build.mjs       the build script
netlify.toml          Netlify settings
```

Every source file starts with a one-line comment saying what is in it.

## Where to change things

| To change | Edit |
| --- | --- |
| Gun damage, fire rate, magazine, reload, spread, recoil, starting ammo, and what each gun does best (its role, in the comment over `GUN_WEAPONS` and its card's `desc`): `mobile` (how much moving costs its hip aim: the machine pistol's least) and `sprayK` (how fast a held trigger opens its spread: the submachine gun's slowest) are read in `spreadOf` and `fireGun` (`src/js/weapons/firing.js`) | `src/js/weapons/gun-stats.js` |
| Running and gunning from the hip: moving opens the spread up to `RUN_SPREAD` more (by `P.mvS`, which settles over a moment after you stop), and at a full run `RUN_MISS` of shots don't go exactly where the crosshair sits on a body but fly with the spread. Aiming down the sights is unaffected | `src/js/weapons/firing.js` (`P.mvS` in `src/js/weapons/combat-update.js`) |
| Damage drop-off with range (and how a longer barrel's `reach` stretches it), ammo drop amounts | `src/js/weapons/ammo.js` |
| What zombies drop and how often (more ammo for melee kills), Hoarder's doubled scrap (`HOARD_X`), Bullet time (`BT`: chance, how slow, how long, the wait between) and Momentum (`MOM_T`) | `killZombie` in `src/js/zombies/damage.js` |
| How long drops stay on the ground; planks are always +1; a drop you're full on stays put, greyed, with no message; a drop out past the farm's edge flies in to you (`homing`); each drop's ring and outline colour (`PICK_COL`: the supply crate off the radio, ammo for everything, in teal; a weapon on the ground or in its case off the radio in its rarity's colour, as on its card, `RAR_COL`; the starting pistol and bat, which have none, in uncommon green) | `DROP_LIFE` in `src/js/pickups/pickups.js` |
| What each drop looks like: a bundle of planks tied with twine, a first-aid case with a bandage roll, a heap of salvage, an open carton of 9mm, a .357 box and a loaded speed loader, an open box of shells, a .30 ammo can with a stripper clip on it, the teal supply crate with a box of every round in it, a weapon's olive hard case. A few bold pieces carry each one's outline, and the detail on them is merged into one mesh (`dmFinish`) | `src/js/pickups/drop-models.js` |
| How fast boarding goes: during a wave without any hammer it's `BOARD_WAVE` of the speed (much slower), in the break between waves the full speed (`boardRate` in `src/js/barricades/interactions.js`) | `src/js/barricades/interactions.js` |
| How many planks you can carry, and each board's own shade of wood (`plankTint`, used for the ones you nail up and the ones on your pack) | `PLANK_MAX` in `src/js/barricades/planks.js` |
| Bloody footprints: how wet the ground is (`bloodWet`, a coarse grid the splashes wet and that dries over about `BW_DRY` seconds), and the boot-sized prints your boots leave after stepping in it, under the foot that stepped (`bloodyStep`, the `foot` print in the blood shader) | `src/js/effects/blood-map.js` |
| How quickly zombies fade in as they come into sight and out as they leave it | `updateZombieVisuals` in `src/js/zombies/zombie-visuals.js` |
| Red outlines on zombies behind something (the see-through rim and silhouette, drawn as halftone dots like your own: `halftone` in `src/js/effects/outlines.js`): only in a circle round you, full strength inside `RED_NEAR` and fading out to nothing at `RED_FAR`; the last few of a wave keep their pulsing outline at any distance. At night a weapon light outlines the zombies in its beam, further and wider at its second tier (`LIGHT_OL`) | `src/js/zombies/zombie-visuals.js` |
| The sight steps (red dot, holo, scope, ACOG, high-power scope) and how far up them each gun goes (`SCOPE_TOP`: the revolver to its handgun scope, the assault rifle to the ACOG, the hunting rifle to the high-power scope; every other gun to the holo), and what each scope does when you aim (`SCOPES`: how far it pulls the view in, and how hard a sniper's headshots crit through it). The hunting rifle starts with iron sights; every scope on it is bought at the bench. The revolver gets a picatinny rail down its top strap and barrel with any optic, in place of its rear sight (`REV_RAIL`, `revolver` in `src/js/weapons/gun-models.js`), and its scope is a shorter, slimmer handgun scope sat forward on it (a gun's `scopeK`, `scopeR`, `scopeZ`, read in `fitAttachments` in `src/js/weapons/attachments.js`); the hunting rifle takes the ACOG on a one-piece picatinny base (`hunting` in `gun-models.js`) | `SCOPE_TOP`, `SCOPES` in `src/js/game/run-state.js` |
| Shots carry on past the edge of the farm (the player still can't walk out) | `bulletBlocked` in `src/js/world/collision.js` |
| The cards after a wave (skills, perks, aid) and what each says; grey (common) is kept for aid, so every skill, perk and weapon is uncommon or better, and how often each rarity is dealt is `rarWeight` in `src/js/upgrades/upgrade-screen.js` (a melee weapon's description never says how many it hits: that's a stat chip, `hitsChip`, and in `statLine`); slowdown when hit stacks across Thick soles, Trail runners and Stubborn, each taking its share off what's left (`SLOW_STEP`, `slowLess`); Gunsmith never picks a gun with its ammo, trigger and magazine all maxed, and pays `SMITH_SCRAP` for each one already maxed | `UPG` in `src/js/upgrades/upgrades.js`, its effect chips in `src/js/upgrades/upgrade-info.js` |
| Gun 3D models: each gun's outline traced off a side-on photo; the part helpers at the top (`solid` for rounded grips and stocks that keep the traced size, `inset`, `clipTo`, `checker` and `stipple` for checkering and stippling cut to a stock's own outline, `taperX` to slim a stock through the wrist, `ribTube` for knurled and ribbed tubes, `lathe` for turned barrels and muzzle devices; `cyl` gives anything barrel-sized enough sides to read round) | `src/js/weapons/gun-models.js` |
| Tracing a part's outline off a reference photo into model coordinates (sub-pixel edges, round parts as lathe profiles, circles, overlays to check against the photo): the trace-photo skill, its workflow in `SKILL.md` and its tool in `scripts/trace.py` | `.claude/skills/trace-photo/` |
| Attachment models (suppressors, sights, lasers, lights, drums...). A gun with a rail for a laser says where in its model (`laser`: under the frame, or on a side rail); the others are found from the model. A sidearm's second light tier is a weapon light clamped on that rail, any laser built into the same unit with its window under the lens (`weaponLight`); a submachine gun's is a bigger flashlight zip-tied on (`zipTie`). The ACOG is a Trijicon TA31 traced off a side-on photo at true size (`ACOG`, `acog`) | `src/js/weapons/attachments.js` |
| Laser beams, one per lens: the laser on the gun in your hands shines straight out along its barrel, whether the gun's on the aim, being reloaded or coming out; a gun in its holster or on your back (carried, or put away for a vault or a bandage) has its laser off, stopped by the ground, a wall or a zombie (`laserReach`). A ribbon facing the camera, shaded as light with a white-hot core in a soft glow that shimmers, dust motes drifting along it, faded in from the lens and out with distance (`LASER_FADE`), drawn additively; it runs out to a farther point quickly but smoothly and is cut short at once (`LASER_RUN`, `LASER_MIN`); each tier's colour and size (`LASER_COL`, `LASER_LOOK`); a pulsing dot where it lands and a glint at the lens. An akimbo pair's flashlights throw a cone each | `src/js/weapons/laser.js`, `src/js/lighting/lightmap.js` |
| Gun mods bought as upgrades at the workbench (burst switch, second pistol...), and which ones take the muzzle (`muzzle`: one can, choke or muzzle device per gun, `muzzleTaken` in `weapons/mod-levels.js`). A mod can be named for each of its levels (`names`: the revolver's barrel is 4", 6" then 8"; `modNameAt` in `weapons/mod-levels.js`). Fan the hammer has no mode to switch: from the hip you hold the trigger to fan it, faster and wilder (`D.fan`), and down the sights it fires precise single shots (`fanning`, `fireRate` in `weapons/firing.js`) | `src/js/weapons/gun-mods.js` |
| What improving a mod at the workbench does at levels II and III, and the fire modes V steps through | `src/js/weapons/mod-levels.js` |
| Melee damage, swing speed, reach, knockback, and how many zombies a swing hits (`cleave`; without it a swing hits only the nearest, unless its reach is long enough: `REACH_CLEAVE`) | `src/js/melee/melee-stats.js` |
| Stamina a melee swing costs: more for the heavy two-handers, and `SINGLE_STAM` of that for a weapon that hits only one zombie (`stamCost`) | `src/js/melee/melee.js` |
| Melee models and mods (and how much each mod's part grows per level, `lvAt`) | `src/js/melee/melee-models.js`, `src/js/melee/melee-mods.js` |
| Stamina cost and swing slowdown, Iron lungs (`LUNGS`), and which zombies a swing lands on | `src/js/melee/melee.js` |
| How stamina comes back (the wait after a vault, `VAULT_BREATH`) and how far down the arms point a gun (`PITCH_MAX`), and where on a zombie on or near your aim you look and point (`AIM_CHEST`, `AIM_NEAR`, up to `AIM_UP`) | `src/js/weapons/combat-update.js` |
| The green rim on zombies your melee swing would hit | `REACH_COL` in `src/js/zombies/zombie-visuals.js` |
| How long a zombie reels after losing a limb (`LIMB_STAGGER` in `src/js/zombies/damage.js`) | `sever` |
| Zombie health, speed and damage per type; the headshot multiplier each calibre gets (`HEAD_CAL`, `headMulFor`), raised per gun by match-grade rounds and, on a sniper (`sniper` in `src/js/weapons/gun-stats.js`: the hunting rifle), by sights (`HEAD_UP` in `src/js/game/run-state.js`) | `src/js/zombies/zombie-types.js` |
| Zombie behaviour; what stops a zombie's swing reaching you (`reachBlocked`: a wall, a fence or a window frame between you, so it can catch you mid-vault but not once you're over) | `src/js/zombies/ai.js` |
| How a burning zombie chars (the look; how fast it chars is in `zombies/ai.js` and `zombies/deaths.js`) | `STAIN_FRAG` in `src/js/effects/body-blood.js` |
| Where zombies come in from: how far out in the fog they start and how soon they show (`FOG_IN`) | `spawnZombie` in `src/js/zombies/spawn.js` |
| How many zombies come each wave, and which types | `src/js/waves/waves.js` |
| The cards after a wave (skills, perks, aid and new weapons; which is which is `findKind`) and how rare they are. Weapon upgrades are bought at the workbench instead | `src/js/upgrades/upgrades.js` |
| Which weapons turn up after a wave: each weapon's firepower band (`WEAP_POW`), the wave each band opens (`WEAP_OPEN`), how a band comes in and fades out and favours an upgrade over what you carry (`weapWeight`), and the long gun you're owed if you're still under-gunned by a wave in `GUN_DUE` (dealt in `dealCards`, `src/js/upgrades/upgrade-screen.js`) | `src/js/upgrades/upgrades.js` |
| Who each card is for ("For your 9mm pistol", "For you") | `cardFor` in `src/js/upgrades/upgrade-screen.js`, `forYour` in `src/js/stations/recipes.js` |
| What the cards show (before → after chips, what a tier is for, running totals for ones that stack; grey chips are plain stats, neither better nor worse, `chipCls`; a tiered skill's steps as stars by its kind, `starRow` from `src/js/stations/station-ui.js`, placed in `src/js/upgrades/upgrade-screen.js`) | `src/js/upgrades/upgrade-info.js` |
| How hard each shot hits back: camera tilt, push and zoom punch; the gun's own kick (a spring per hand, randomized each shot: thrown up and back, then a strong gun is hauled back down past the aim before it settles; a handgun's kick goes with less than its power, so even the 9mm visibly flips) | `gunPower` in `src/js/weapons/firing.js`, `fireCam` in `src/js/game/camera.js`, `gunKick` in `src/js/player/hold.js` |
| Upgrade tiers per gun and for your character, and what a particular gun calls a tier instead (`as`, e.g. the pistol's mag plate, extended mag and drum mag, the hand cannon's mag plate and extended mag; read with `tierName`), and how many magazine steps a gun takes where it isn't all three (`MAG_STEPS` in `src/js/upgrades/upgrades.js`: the hand cannon two, the assault rifle two, the revolver none, the drum shotgun one: its box to its drum, `MAG_UP` in `src/js/game/run-state.js`). Wide eyes is one step (a much wider cone, round to a little behind you, and 4 m all round) before Eyes in the back of your head. Iron stomach, Bloodthirst and Vampire heal on only some kills, more often for headshots, and only so much a wave (`FEED`; the count is `S.feedUsed`) | `src/js/upgrades/tier-table.js` |
| The supply crate's marker (over it, or at the edge of the screen pointing to it) and the light beam over a landed crate | `updateDropMarker` in `src/js/stations/supply-drop.js`, `dropBeam` in `src/js/pickups/pickups.js` |
| The radio's drops: the supply crate and weapons by air (`radioCards`: a sidearm care package and a primary one, each a random gun of that kind that's turned up (`CARE`), an upgrade crate guaranteed to beat the gun in its slot, a top-shelf crate of the best gun out yet, and melee crates; prices in `RADIO_COST`), each brought in by a helicopter you hear coming (`heliSound`) and see the shadow of (`heliShadow`), landing with a red flare beside it that lights the ground red and smokes until a while after it's opened (`lightFlare`). A weapon on its way or in its crate isn't dealt as a card after a wave (`radioPending`) | `src/js/stations/supply-drop.js` |
| What each station sells, and the prices (ammo by the gun, `AMMO_COST`; a gun's ammo, trigger and magazine upgrades, `TIER_COST`). Through and through goes on every gun except one that already pierces with something of its own: flechettes, slugs, a longer revolver barrel or the heavy-duty can (`ownPierce`, `skillPierce` in `src/js/game/run-state.js`). Everything for the weapon in your hands sits in one group, Attachments / Upgrades (`gearGroup`), and each card's green and red chips come from `src/js/upgrades/upgrade-info.js` (`tierFx`, `modFx`, `improveFx`, `tuneFx`). How many steps a line has on a gun (`tierMax`); the stars on a tiered card (filled for the steps you have, the one it buys outlined brighter) and the colours that set that group apart from the ammo and tune-up (attachments teal, the gun's upgrades and mods blue) are `starRow` and `ST_ICON_COL` in `src/js/stations/station-ui.js` | `src/js/stations/recipes.js` |
| Weapons you take on purpose with E, never by walking over them: a weapon's case off the radio, and a gun you've put down for another, lying where you dropped it with its upgrades and the rounds in it (`nearestTake`, `takeIt`, `gunDrop`), for two rounds (`GUN_KEEP`): when the round after those starts it gives its 10-second warning and is gone. A pickup's coloured rim is grown about each piece's middle (`outline` in `src/js/effects/outlines.js`), so it hugs a dropped gun | `src/js/pickups/pickups.js` |
| The weapon stats sheet: damage, fire rate, magazine, every kind of reload, the pump or bolt, spread, range, pierce and headshots, each in a box set against the gun as it comes (`wsStock`: grey stock, green better, red worse, with the change), spread and drop-off charts, a note under any number that needs one, and what's improving it: each upgrade, attachment, mod or skill that makes a number better, with only what it improves, in words (`wsSources`, `WS_GOOD`). Docked against the workbench's left side, the two centred together (`--wsW`, `--wsGap`, `--stDockW`), sliding out from behind it as it unrolls and back in as it rolls up; I shows or hides it anywhere. The bench and the sheet are a little see-through (opaque again for anyone who asks for less transparency) | `src/js/ui/weapon-stats.js`, `src/styles/weapon-stats.css`, `src/styles/stations.css` |
| Pistol slides: which pistols lock back on the last round (`SLIDE_PISTOLS`), how much quicker a reload with rounds still in it is (`TAC_MUL`), and the empty reload's slide drop, a slingshot (an eased tug from `PS_TUG`) or a thumb on the slide stop (`PS_MAG`, `PS_REL`; the hand moves are in `src/js/player/hold.js`, `slideAt` and `stopAt` per gun in `HOLD`) | `src/js/weapons/reload.js` |
| Speed loaders: the revolver's reload with one (`REV_LOAD`) and how long each go of shells takes (`LOADER_T`); the revolver's loader moves are in `src/js/player/hold.js` (`SLM`) | `src/js/game/run-state.js`, `SL_IN` and the rest in `src/js/weapons/reload.js` |
| The shotgun pattern (`pelletOff`), what a round keeps through each zombie (`PIERCE_KEEP`), scopes (`scopeSpread`), and crits: a sniper's every headshot through a scope (`D.headCrit`), a tune-up's, the revolver's aimed Dead-eye, Lucky shot (`gunFire`) | `src/js/weapons/firing.js` |
| What each attachment does, one job each so none doubles another: a sight (red dot to high-power scope) only tightens shots aimed down the sights, standing and on the move (`SIGHT_AIM`, `SIGHT_MOVE`; a scope also zooms in, and on a sniper a sight raises the headshot multiplier, `HEAD_UP`, and through a scope every headshot crits, `SCOPES`), a laser tightens the hip (`LASER_HIP`), both in `src/js/game/run-state.js`; the shoulder stock only steadies a sidearm's kick (`STOCK` in `src/js/weapons/firing.js`); a muzzle can quietens and hits harder, a choke squeezes the pellets, a light lights | `src/js/upgrades/tier-table.js` |
| What a workbench tune-up does to a weapon (a gun also gets crits: `TUNE.crit` of its hits, scoped or not, `D.critT`, and every crit `TUNE.critM` harder, `D.critUp`, read in `fireGun`) | `TUNE` in `src/js/game/run-state.js` |
| Bandage count (3, or room for 5 with the Med pouch, which brings none), time and healing (starting one stops bleeding), and the medicine cabinet upgrades | `src/js/player/bandages.js` |
| Bandaging on screen: the weapon carried away to where it rides first (`BAND_PUT`, `updateBandStow` in `src/js/player/swap.js`), the right hand winding the bandage round the left forearm (`bandagePose`), the wraps that stay on your arm after (`WRAP_AT`, each sized to sit over whatever sleeve, jacket, glove or armband is under it: `fitWraps`), and the blue edge and the camera's slow lean-in that build as it goes on and drop away fast if a hit cuts it short (`healFx`; the zoom is in `src/js/game/camera.js`). A click or a weapon key stops a bandage: it's used up and heals for as far as it got (`bandProg`; half wound, half its healing), and the health bar's blue part grows with it as it goes on (`cancelBandage`, `switchSlot` in `src/js/player/bandages.js`), and a weapon picked that way is taken out as the hands come down (`bandSwitch` in `bandPhases`). The wraps come off when you pick your card after a wave | `src/js/player/hold.js` |
| Bleeding: drops falling from the wound that spot the ground as you go (`bleedDrip` in `src/js/effects/particles.js`), the stain soaking into your clothes, and blood landing on the screen (`screenDrop` in `src/js/ui/hud.js`, `#bleedFx` in `src/styles/overlays.css`) | `src/js/weapons/combat-update.js` |
| The start of a run: the camera glide, getting up off one knee, the HUD sliding in | `src/js/game/intro.js` |
| The roof and wall faces fading so you can see in (`updateCutaway`); as a run starts the roof lifts away with the camera's glide on an ease in and out (`ROOF_INTRO`), fading as one surface | `src/js/world/cutaway.js` |
| Where the pines go: thick at the edge of the map, scattered between it and the yard, but none within `FENCE_CLEAR` cells of the yard fence (`FENCE_CLEAR_CAM` on the two sides facing the camera, where they'd hide it) or in a lane `GAP_LANE` either side of each gap in it | `src/js/world/trees.js` |
| Swapping weapons: the one in your hands put away, the hand crossing to the next and drawing it (`SWAP_T`; with nothing to put away, as you land a vault, the hand goes straight for it, and the hands stay loose through the landing instead of first coming up empty, `vaultHands` in `src/js/player/animation.js`). A pistol pair in the shoulder rig is cross-drawn, each hand pulling the gun from under the other arm and swinging it round about its grip (`rigCarry`, `blendAbout`; after a Run and gun vault the left one alone, `rigDraw` in `src/js/player/hold.js`) | `src/js/player/swap.js` |
| The HUD dimming behind the pause screen and the finds after a wave (`body.menu`) | `src/styles/screens.css` |
| Shove range, push and cooldown (slower while you bandage) | `src/js/player/shove.js` |
| Walking speed and statuses (bleeding, exhaustion) | `src/js/player/movement.js` |
| Turning: the chest leads round ahead of the hips and leans in, swinging a touch past as you stop (`TURN_TWIST`, `TURN_BANK`, `TURN_MAX`). How far the hips turn toward the way you walk before the legs side-step the rest (`HIP_TWIST`), so a strafe keeps the legs under the torso; standing on the floor, rugs, threshold, porch and step (`ANIM.standY` eases to `surfaceY` in `src/js/world/house.js`, plus `SOLE_LIFT`) | `src/js/player/animation.js` |
| Fireflies at night and the moths round the outdoor lights: how many | `src/js/world/atmosphere.js` |
| Aiming down sights and zoom | `src/js/player/aiming.js` |
| How each gun is held (grip and support hand points, stance; the hands aimed below the gun so they don't hide it, `HAND_DROP`, the arms slimmer, `ARM_THIN`, long guns carried a touch higher, `LONG_RAISE`, the wrists turned, `HAND_ROLL`; every gun kept up at the aim between shots, no low ready; the revolver's cylinder flicked out on its crane a beat into a reload, well clear of the frame, and snapped shut after, `REV_OPEN`, `REV_SWING`, `REV_OUT`), reload and bolt hand motions (each reload its own feel, `W8.relJit`; an empty pistol's slide dropped by a slingshot or the thumb on the slide release), akimbo (each hand its own way, `AK_HAND`: heights, cant in toward the middle, toe-in, drift). The arms trail a turn, swinging from the shoulders, and swing on after it (`FREE_AIM`, `freeAim`, `FREE_SWING`), but never carry the forend further from the left shoulder than the support arm reaches (`SUPPORT_REACH`): the gun's held in, so that hand stays on it. A reload's hand flows through its waypoints (`walkPath`) on a loose spring (`handTarget`), and each reload is done one of three ways picked at random with the same timing. The gun moves through a reload too, on its own spring (`ACT`, `ACT_K`, `ACT_D`) so it eases in and out of it and runs back smoothly when one's cut short: rolled over and dipped to shake the old mag out, eased back while the hand's at the pouch (the head and chest turning to it), rolled and tipped to meet the new one, a shotgun's or rifle's port rocked over to the hand for each round, the head down at the gun; the beats knock it (`relKnock`: the mag shaken out, the new one slapped home, a shell thumbed in, a slide or cylinder slammed). Slides and bolts slam back the gun's full `travel` on each shot, and a bolt seen through a port in the side (`userData.clip` on the model, the port's rear edge) goes out of sight past that edge as it runs back (`REL_MAG`, `REL_SHELL`: how the gun is rolled, pitched and drawn in, and the hand's route; `W8.relStyle` is set in `src/js/weapons/reload.js`) | `src/js/player/hold.js` |
| A belt-fed gun's belt (the M60's): the rounds from the box to the feed tray show what's left, going from the box end first under ten (`BELT`, filled from the model's `belt`), it jiggles on two loose springs shaken by the gun's motion and each shot (`beltJiggle`, `beltKick`), and spent links fly out with the brass (`ejectLinks` in `src/js/weapons/casings.js`) | `src/js/player/hold.js` |
| Working the pump and the bolt: the ways each is worked, one picked at random each time (`RACKS`: the beats, timing, how the gun leans, where the hand takes the knob, and the knocks to the gun and the camera at each stop), how far the action is back (`cyclePose`), the sounds on each beat (`cycleFx`), and the rack that chambers a round (`chamberCycle`): a pump or bolt gun can't fire again till a rack drives a round home (`needsRack`), and a rack cut short by a reload or a swap is done again once your hands are free. The gun rides a loose spring through it (`RACK_K`, `RACK_D` in `src/js/player/hold.js`, along with how far the bolt handle turns, `BOLT_TURN`), and so does the camera (`camRack` in `src/js/game/camera.js`) | `src/js/weapons/casings.js` |
| Weapons carried on your body (the duty holster moulded round each sidearm, `HOLSTER_FIT`, on a belt; a long gun flat against the pack's left side, barrel down, and an automatic on a slant across its back, lying on whatever's under it, the canvas, the planks or the melee weapon, tipped and rolled a little to lie flat (`STOW_AT`, `STOW_TILT`, `restAuto`; the M60 turned over so its ammo box faces out), in a holster of the run's colour (`LOOK.cur.holster`), melee in the straps at the right edge; an empty pistol goes in with its slide locked back, and the holster stays on, empty, while the sidearm is drawn: `showStowed`; a pair of pistols rides in a shoulder rig instead, a holster under each arm with the muzzle back and the grip forward for a cross draw (`STOW_RIG`, the harness `buildRig`), and a pair of automatics crossed over each other on the pack, `STOW_AK`), the planks on your pack, and how the backpack swings (`PACK_SW`) | `src/js/player/stow.js` |
| Dust clouds, spark streaks, impact flashes, blood mist, embers, and dragon's breath (`dragonBreath`) | `src/js/effects/puffs.js` |
| Bullet tracers: how hard each round hits as far as its tracer goes (`tracerPower`), the colours for plain, +P, dragon's breath and suppressed rounds (`TR_STYLE`; a suppressed one is a dim grey streak, and leaves a thick smoke trail instead, `smokeTrail` called from `src/js/weapons/firing.js`), and the slug, its head, the line it leaves, the heat haze and the light a big round throws on the ground | `src/js/effects/tracers.js` |
| Bullet holes in the house walls | `src/js/effects/bullet-holes.js` |
| Blood on the farm: thrown blood lands when it gets there, the hit's spray a moment after the hit and its tail further out (`splatLater`, `spray`), the spray broken into spatter and flecks; the droplets thrown well out (`DROP_THROW`, `DROP_SCATTER`, `DROP_DRAG`), each marking the ground wherever it lands, the big ones bursting into specks, or splashing whatever it hits first at the height it hit, a wall, a trunk, a fence post or rail, a crate, a window's sill, the wall over it or its boards (`dropHits`, `bloodDrops`, `stepDrops` in `src/js/effects/particles.js`). No pools; how long it stays fresh (`BM_STAY`) and how long it then takes to fade (`BM_FADE`), so a splash is gone 70 to 90 seconds after it landed | `src/js/effects/blood-map.js` |
| The pool a body bleeds out into where it lands | `src/js/zombies/deaths.js` |
| The zombies' eye glow and the streaks behind it (`EYE_GLOW`, `EYE_HALO`, `EYE_STREAK`) | `src/js/effects/eye-glow.js` |
| How far the view eases toward an edge of the screen when the cursor is near it (`EDGE_IN`, `EDGE_PAN`) | `src/js/game/camera.js` |
| Sounds | `src/js/audio/sfx.js` |
| Controls | `src/js/input/keyboard-mouse.js`, `src/js/input/touch.js` |
| Day length and night colours, and how your eyes adjust to the dark (`DARK_EYES`) | `src/js/lighting/day-night.js` |
| The flashlight's beam: drawn per pixel in the lit shader (`flCone` in `src/js/core/shaders.js`) with a soft rim and a brighter middle, set every frame from each tier's reach, width and strength (`FLASH`, `flashUniforms`; an akimbo pair has a beam per gun); its shadows are rays cast out across the beam every frame (`flashShadows`, `flRay`, `FL_RAYS`), each stopped by what stops sight, so a beam through a window or past a corner has clean edges; smoke catches it too (`flashAt`). It's only on while the gun's out in your hands: off while it's put away for a vault without Run and gun, and on again once the hand has it on the draw (`gunOut`, `flOn`) | `src/js/lighting/lightmap.js` |
| House layout | `src/js/world/house.js` |
| The drive out front and the main road it meets in the fog, and the ground and grass past the farm's edge | `ROAD` and the end of `src/js/world/ground.js` |
| The haze and drifting fog banks past the farm's edge, and the fog lying on the road | `EDGE_BODY` and `uEdge` in `src/js/core/shaders.js`, `roadFog` in `src/js/world/atmosphere.js` |
| Furniture in the house (table, pantry shelf, bed, lamps, wall decorations) | `src/js/world/props.js`; the stations are in `src/js/stations/stations.js` |
| The survivor's look, dealt fresh each run: skin, hair, facial hair (`LOOKS.beard`: stubble, heavy stubble, full or long beards, mustache, handlebar, horseshoe, goatee, Van Dyke, soul patch, chinstrap, mutton chops, sideburns), the face (`L.face`: eye, brow, nose and mouth shapes from `LOOKS.eyeShape` / `brow` / `nose` / `mouth`, set a little lopsided, with scars, a slit brow, tired eyes, freckles, a mole, a cleft chin, big ears, grime or an eye patch), eye colour (`LOOKS.eyes`, sometimes a random shade, rarely odd eyes), hat, top (`LOOKS.top`: work shirt, tee, flannel, hoodie, short or long sleeved polo; a suit and tie with matching trousers and dress shoes one run in `SUIT_ODDS`), a thermal under it now and then (`LOOKS.under`, how often by top in `LOOKS.underOdds`: down to the wrists under rolled or short sleeves and at the open collar), trousers, shoes, the colours of the pack and its bedroll, and the holster's (`LOOKS.holster`: black, coyote, tan, olive, ranger green, grey or leather) | `src/js/player/look.js` (the fixed belt, backpack and pouches are in `src/js/player/player.js`) |
| HUD look; the health bar's segments past the first `BASE_HP` (from armour and other max-health upgrades) are blue; what's on the gun in your hands as chips over its name, edged in the workbench's colours (mods and gun upgrades blue, attachments teal, rounds gold: `gunExtras` in `src/js/weapons/build-weapons.js`, `#wMods`); the rounds left laid out from the bottom right, so a mag empties top-left first, row by row, and its last round is bottom right (`magGlyphs` in `src/js/ui/rounds.js`, `#rounds`); each round drawn like its cartridge, a copper bullet in a brass case: a 9mm (the pistol and SMGs) straight-cased and round-nosed, a rifle round a long bottlenecked case with a sharp spitzer bullet, a magnum a straight case with a flat nose, a shell a red hull on a brass head; better rounds change the bullet's colour (match-grade a nickel case) (`#rounds i`, `.rf`, `.mg`, `--bl`, `--cs`); a fired round tumbles out of the HUD as its empty case, the bullet gone downrange (a shell drops whole: `dropRound`, `CASE_OF`) | `src/styles/hud-*.css` and `src/js/ui/hud.js` |
| Gear you get: the card at the bottom middle when you buy or are given something that stays (what it is, what it's on, what it does; `gotGear`), the pause screen's list of all of it (`renderBought`), and what a gun's called in a sentence (`gunCall`: your pistol, not your 9mm pistol) | `src/js/ui/gear-popup.js` |
| The crosshair: spread ticks, the ammo arc on its right and the stamina arc underneath (both keep clear of the reticle's outer edge, the tick tips or the shotgun's arcs, growing out as it widens: `aR`, `sR`, `XH_CLEAR`), reload, grenade and bandage rings; the melee brackets (`XHM`) pinch in through a swing's recovery and spring back out, twisting with the camera as a swing rolls it, `XHM_TWIST` times harder | `src/js/ui/crosshair.js`, `src/styles/crosshair.css` |
| Fire mode: what each gun fires as (`fireModeOf`: semi, burst, auto (the assault rifle has semi out of the box, `OWN_MODES`, steadier: `SEMI` in `src/js/game/run-state.js`), fanning from the hip (aimed with the sights), or a pump/bolt/break action; a semi-auto fires once a click, `semiAuto` in `weapons/firing.js`, and a burst repeats while held and stops where it is when let go), its badge by the ammo count (`renderFireMode`) and the switch on B (`fireModeSwitched`: a two-step click, the mode by the crosshair, the rounds rolling over) | `src/js/weapons/mod-levels.js`, `src/js/ui/hud.js` |
| A bigger magazine bought for a gun waits until its next mag change: the old one stays in, count and model (`W8.pin`, `magChange`, `magCap`, `magTierIn` in `src/js/game/run-state.js`), and the new one goes in as the old one drops (`magSwapIn`). Reload times that grow with a bigger magazine (`MAG_SLOW` per doubling); a magazine gun run dry takes `EMPTY_MUL` longer (`src/js/weapons/reload.js`); one gun of an akimbo pair reloads in `AK_ONE` of a lone gun's time, times `AK_TAC` with rounds left or `AK_EMPTY` run dry (`src/js/weapons/akimbo.js`), and you walk `AK_WALK` slower while reloading a pair (`reloadSlow` in `src/js/weapons/reload.js`) | `recomputeEff` in `src/js/game/run-state.js` |
| Akimbo: each gun has its own mag (`W8.akMag`, kept summing to `W8.mag`), trigger (left click the gun on your left, right click the one on your right, `AK_ON`, both alternate; a burst is per gun) and cooldown. No aiming down the sights, and `AK_SPREAD` more spread. R reloads only the guns that have fired, the emptier first, one at a time while the other stays on the aim and can still fire. A dry gun's slide locks back and its reload ends dropping it (`AK_SLIDE`); one with rounds left skips that (`AK_TAC`). A pair of machine pistols charges a dry one two-handed instead: the other goes flat across your chest as if on a sling and neither can fire till it's back up, while its hand draws the empty one's handle (`AK_CH`, `akChargeState`; the chest pose `AK_SLING`, `akSling` in `src/js/player/hold.js`, eased on and off on a spring). A pair's MP9s have their stocks folded (`gun-models.js`) | `src/js/weapons/akimbo.js` (pose: `akU` in `src/js/player/hold.js`) |
| Akimbo HUD: a counter per gun with the mouse button that fires it, the rounds split into two mags, and a second ammo arc mirrored on the left of the crosshair; the gun being reloaded dims, a gun running low pulses its arc yellow and an empty one flashes red. The warning under the crosshair counts both mags: "Low ammo" once together they're down to a quarter, "No ammo" only when both are empty | `src/js/ui/hud.js`, `src/js/ui/rounds.js`, `src/js/ui/crosshair.js` |
| Run and gun (the vaulting skill): vaults a quarter quicker for half the stamina, and the gun stays in your right hand on the aim through the vault so you can fire (`vaultGun`). The chest stays on your aim the whole way while the hips turn to the sill and back after (`ANIM.rg`, `chestYaw` in `src/js/player/animation.js`), and the gun stays level through the landing; with a pair the left gun goes into its holster (or onto your back) for the vault and the hand draws it again after (`AK_DRAW` in `src/js/player/hold.js`) | `src/js/player/vaulting.js`, `src/js/player/animation.js` |
| Menu open and close animations: the station panel unrolling from its orange rule and rolling back up into it (`src/styles/stations.css`, `openStation` / `closeStation` in `src/js/stations/station-ui.js`), the title, pause and death screens' lines coming in one after another (and the pause screen asking before Main menu or Abandon run: `askLeave` in `src/js/ui/screens.js`) (`src/styles/screens.css`, `#dead` in `src/styles/hud-feed.css`), the history list growing open | `src/styles/` |
| Scrollbars (thin, squared, orange under the pointer) and the wheel easing lists along instead of stepping (`smoothWheel`) | `src/styles/base.css`, `src/js/core/dom.js` |
| The pollen and dust drifting by day: how thick (`MOTE_DENSITY`) and how bright | `motes` in `src/js/world/atmosphere.js` |
| The rolling digit counters (ammo, reserve, bandages, planks, scrap, kills, the reload text, and the wave number, which spins a whole turn round to each new wave: `spin`) | `rollText` / `setRoll` in `src/js/ui/hud-text.js` |
| The white melee-weapon silhouette shown in place of the ammo count | `src/js/ui/melee-art.js` |
| The icons (HUD, pickups, stations, status icons) | `src/js/ui/game-icons.js` |

### Adding a new gun

1. Add its stats to `GUN_WEAPONS` in `weapons/gun-stats.js`. Give it a `rar` (`'u'` uncommon, `'r'` rare, `'e'` epic, `'l'` legendary; `'c'` common is kept for aid cards) and a `desc`, and it appears as a card after a wave automatically.
2. Add a model builder with the same id to `GUN_MODELS` in `weapons/gun-models.js`. Copying the closest existing gun is the easiest start.
3. Optional: give it a range drop-off in `FALLOFF` (`weapons/ammo.js`) and an ejection style in `EJECT` (`weapons/casings.js`).
4. Optional: add mods for it in `weapons/gun-mods.js` with `w: '<your gun id>'`. They show up under Upgrades at the workbench while you hold it.

Adding a melee weapon works the same way, using `melee/melee-stats.js` and `melee/melee-models.js`.

## How the code fits together

The game is plain browser JavaScript with no framework. The build joins every file listed in `src/js/load-order.json`, in that order, and wraps them in one function. So:

- All files share one scope. Any file can use a function or constant from any other file without importing it.
- Function declarations work from anywhere, whatever the order.
- Order matters only for code that runs straight away at the top level, such as building the world or creating a material that another file uses at load time. If you see `Cannot access 'X' before initialization`, move the file that defines `X` higher in `load-order.json`.
- A new `.js` file must be added to `load-order.json`. The build stops with a message naming any file you forgot.

Each frame, `game/loop.js` calls `update(dt)` in `game/update.js` (the simulation, one system after another) and then `visuals(dt)` in `game/visuals.js` (animation, camera, lighting, effects and HUD). Those two files list every system in the order it runs, so they are a good place to start reading.

Shared state:

| Name | Holds | Defined in |
| --- | --- | --- |
| `P` | the player | `player/player.js` |
| `S` | your character's upgrade stats | `game/run-state.js` |
| `W8` | weapons you carry, ammo, mods, per-gun tiers | `game/run-state.js` |
| `run` | the current run: wave, score, time | `game/run-state.js` |
| `zombies`, `ragdolls` | live zombies, and bodies that are falling | `zombies/zombie-types.js`, `zombies/deaths.js` |
| `state`, `phase` | which screen is showing, wave or break | `game/state.js` |

## Performance

- **One bundle.** The production build is a single minified `game.js` (about 200 KB) and one `game.css`. The page asks for both by a hash of their contents (`game.js?v=…`), so a new deploy reaches players straight away instead of waiting out the browser cache. three.js ships as its own file and is cached for a year.
- **Adaptive resolution.** The game measures frame time and lowers or raises the render resolution between 1× and your screen's pixel ratio to keep the frame rate smooth (`game/loop.js`).
- **Vision caching.** Line of sight is recomputed only when you move, turn far enough or a board changes, and at most every 0.6 seconds otherwise (`lighting/vision.js`).
- **Light map instead of real lights.** Lamps, fires and muzzle flashes are painted into one small light texture each frame instead of using many three.js lights (`lighting/lightmap.js`). The flashlight alone is worked out per pixel in the same shader, from a few uniforms, so its beam stays smooth as you turn.
- **Pooling and instancing.** Particles, casings, tracers and blood decals reuse fixed pools, and trees, grass, bushes, rocks and fence posts are instanced meshes, so long fights don't create garbage or extra draw calls.
- **Cached geometry.** Box shapes are shared through a cache instead of being created per part (`core/geometry.js`).
- **No z-fighting.** As models are built, faces of different pieces that would sit exactly on top of each other are pulled apart by 0.6 mm (`unfight` in `core/geometry.js`).
- **Merged detail.** The small pieces of the survivor, the furniture and the stations are merged into a few meshes each, with their colours baked into the vertices, so all that detail costs only a few extra draw calls (`mergeInto` in `core/geometry.js`).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk in eight directions |
| Mouse | Aim; click to fire a handgun (one shot a click), hold to fire an automatic or swing. With a gun in each hand, left click fires the left one and right click the right. Clicking during a bandage stops it |
| Hold right click | Aim down the sights (scoped guns zoom in further and steady right down) |
| 1 2 3 4 | Melee, sidearm, long gun, automatic (during a bandage: stops it and takes that weapon out) |
| R | Reload |
| Q | Apply a bandage (a ring round the cursor shows it going on, then the healing left) |
| V | Shove the zombies in front of you (stabs with a bayonet fitted) |
| F (hold) | Board up the door or window you're at |
| Space | Climb through an open window or hop a fence (costs stamina, more if you chain them) |
| E | Use the workbench, sawhorse, medicine cabinet or radio |
| G | Underbarrel grenade, once you have one |
| B | Switch fire mode: the assault rifle between full auto and semi, and guns with a burst or full-auto mod (single → burst → full auto) |
| Wheel, + and − | Zoom in and out |
| T | Start the run (also from the death screen), or the next wave early |
| Esc or P | Pause |
| M | Back to the main menu from the death screen |

Touch screens get twin sticks and on-screen buttons.

## Credits

The icons are from [game-icons.net](https://game-icons.net), by Lorc, Delapouite, sbed and Zeromancer, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
