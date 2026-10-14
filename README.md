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
| Gun damage, fire rate, magazine, reload, spread, recoil, starting ammo | `src/js/weapons/gun-stats.js` |
| Damage drop-off with range (and how a longer barrel's `reach` stretches it), ammo drop amounts | `src/js/weapons/ammo.js` |
| What zombies drop and how often (more ammo for melee kills), Hoarder's doubled scrap (`HOARD_X`), Bullet time (`BT`: chance, how slow, how long, the wait between) and Momentum (`MOM_T`) | `killZombie` in `src/js/zombies/damage.js` |
| How long drops stay on the ground; planks are always +1; a drop you're full on stays put, greyed, with no message; a drop out past the farm's edge flies in to you (`homing`) | `DROP_LIFE` in `src/js/pickups/pickups.js` |
| How many planks you can carry | `PLANK_MAX` in `src/js/barricades/planks.js` |
| Bloody footprints: how wet the ground is (`bloodWet`, a coarse grid the splashes wet and each wave halves), and the prints your boots leave after stepping in it (`bloodyStep`, the `foot` print in the blood shader) | `src/js/effects/blood-map.js` |
| Red outlines on zombies: every zombie in a circle round you gets the same red rim (`nearOl`, and the see-through rim behind cover), full inside `RED_NEAR` and fading in from `RED_FAR`; the last few of a wave keep their pulsing outline at any distance | `src/js/zombies/zombie-visuals.js` |
| Which guns take a real scope (the third sight tier) | `SCOPE_GUNS` in `src/js/game/run-state.js` |
| Shots carry on past the edge of the farm (the player still can't walk out) | `bulletBlocked` in `src/js/world/collision.js` |
| The cards after a wave (skills, perks, aid) and what each says | `UPG` in `src/js/upgrades/upgrades.js`, its effect chips in `src/js/upgrades/upgrade-info.js` |
| Gun 3D models: each gun's outline traced off a side-on photo; the part helpers at the top (`solid` for rounded grips and stocks that keep the traced size, `inset`, `clipTo`, `checker` and `stipple` for checkering and stippling cut to a stock's own outline, `taperX` to slim a stock through the wrist, `ribTube` for knurled and ribbed tubes, `lathe` for turned barrels and muzzle devices; `cyl` gives anything barrel-sized enough sides to read round) | `src/js/weapons/gun-models.js` |
| Attachment models (suppressors, sights, lasers, drums...). A gun with a rail for a laser says where in its model (`laser`: under the frame, or on a side rail); the others are found from the model | `src/js/weapons/attachments.js` |
| Laser beams, one per gun (both of an akimbo pair, each to where its own shots go): a ribbon facing the camera, shaded as light with a white-hot core in a soft glow that shimmers, dust motes drifting along it and a fade-in from the lens, drawn additively; a pulsing dot where it lands and a glint at the lens. An akimbo pair's flashlights throw a cone each | `src/js/weapons/laser.js`, `src/js/lighting/lightmap.js` |
| Gun mods bought as upgrades at the workbench (burst switch, second pistol...), and which ones take the muzzle (`muzzle`: one can, choke or muzzle device per gun, `muzzleTaken` in `weapons/mod-levels.js`) | `src/js/weapons/gun-mods.js` |
| What improving a mod at the workbench does at levels II and III, and the fire modes V steps through | `src/js/weapons/mod-levels.js` |
| Melee damage, swing speed, reach, knockback, and how many zombies a swing hits (`cleave`; without it a swing hits only the nearest, unless its reach is long enough: `REACH_CLEAVE`) | `src/js/melee/melee-stats.js` |
| Melee models and mods (and how much each mod's part grows per level, `lvAt`) | `src/js/melee/melee-models.js`, `src/js/melee/melee-mods.js` |
| Stamina cost and swing slowdown, Iron lungs (`LUNGS`), and which zombies a swing lands on | `src/js/melee/melee.js` |
| How stamina comes back (the wait after a vault, `VAULT_BREATH`) and how far down the arms point a gun (`PITCH_MAX`) | `src/js/weapons/combat-update.js` |
| The green rim on zombies your melee swing would hit | `REACH_COL` in `src/js/zombies/zombie-visuals.js` |
| Zombie health, speed and damage per type | `src/js/zombies/zombie-types.js` |
| Zombie behaviour | `src/js/zombies/ai.js` |
| How a burning zombie chars (the look; how fast it chars is in `zombies/ai.js` and `zombies/deaths.js`) | `STAIN_FRAG` in `src/js/effects/body-blood.js` |
| Where zombies come in from: how far out in the fog they start and how soon they show (`FOG_IN`) | `spawnZombie` in `src/js/zombies/spawn.js` |
| How many zombies come each wave, and which types | `src/js/waves/waves.js` |
| The cards after a wave (skills, perks, aid and new weapons; which is which is `findKind`) and how rare they are. Weapon upgrades are bought at the workbench instead | `src/js/upgrades/upgrades.js` |
| Which weapons turn up after a wave: each weapon's firepower band (`WEAP_POW`), the wave each band opens (`WEAP_OPEN`), how a band comes in and fades out and favours an upgrade over what you carry (`weapWeight`), and the long gun you're owed if you're still under-gunned by a wave in `GUN_DUE` (dealt in `dealCards`, `src/js/upgrades/upgrade-screen.js`) | `src/js/upgrades/upgrades.js` |
| Who each card is for ("For your 9mm pistol", "For you") | `cardFor` in `src/js/upgrades/upgrade-screen.js`, `forYour` in `src/js/stations/recipes.js` |
| What the cards show (before → after chips, what a tier is for, running totals for ones that stack) | `src/js/upgrades/upgrade-info.js` |
| How hard each shot hits back: camera tilt, push and zoom punch; the gun's own kick (a spring per hand, randomized each shot: thrown up and back, then a strong gun is hauled back down past the aim before it settles; a handgun's kick goes with less than its power, so even the 9mm visibly flips) | `gunPower` in `src/js/weapons/firing.js`, `fireCam` in `src/js/game/camera.js`, `gunKick` in `src/js/player/hold.js` |
| Upgrade tiers per gun and for your character, and what a particular gun calls a tier instead (`as`, e.g. the pistol's mag plate, extended mag and drum mag; read with `tierName`) | `src/js/upgrades/tier-table.js` |
| The supply crate's marker (over it, or at the edge of the screen pointing to it) and the light beam over a landed crate | `updateDropMarker` in `src/js/stations/supply-drop.js`, `dropBeam` in `src/js/pickups/pickups.js` |
| The radio's drops: the supply crate and weapons by air (`radioCards`: a surplus crate of any gun that's turned up, an upgrade crate guaranteed to beat the gun in its slot, a top-shelf crate of the best gun out yet, and melee crates; prices in `RADIO_COST`), each brought in by a helicopter you hear coming (`heliSound`) and see the shadow of (`heliShadow`), landing with a red flare beside it that lights the ground red and smokes until a while after it's opened (`lightFlare`). A weapon on its way or in its crate isn't dealt as a card after a wave (`radioPending`) | `src/js/stations/supply-drop.js` |
| What each station sells, and the prices (ammo by the gun, `AMMO_COST`; a gun's ammo, trigger and magazine upgrades, `TIER_COST`). Everything for the weapon in your hands sits in one group, Attachments / Upgrades (`gearGroup`), and each card's green and red chips come from `src/js/upgrades/upgrade-info.js` (`tierFx`, `modFx`, `improveFx`, `tuneFx`) | `src/js/stations/recipes.js` |
| Pistol slides: which pistols lock back on the last round (`SLIDE_PISTOLS`), how much quicker a reload with rounds still in it is (`TAC_MUL`), and the empty reload's slide drop, a slingshot (an eased tug from `PS_TUG`) or a thumb on the slide stop (`PS_MAG`, `PS_REL`; the hand moves are in `src/js/player/hold.js`, `slideAt` and `stopAt` per gun in `HOLD`) | `src/js/weapons/reload.js` |
| Speed loaders: the revolver's reload with one (`REV_LOAD`) and how long each go of shells takes (`LOADER_T`); the revolver's loader moves are in `src/js/player/hold.js` (`SLM`) | `src/js/game/run-state.js`, `SL_IN` and the rest in `src/js/weapons/reload.js` |
| The shotgun pattern (`pelletOff`), what a round keeps through each zombie (`PIERCE_KEEP`), and scopes (`scopeSpread`, `SCOPE_HEAD`) | `src/js/weapons/firing.js` |
| What a workbench tune-up does to a weapon | `TUNE` in `src/js/game/run-state.js` |
| Bandage count (3, or 5 with the Med pouch), time and healing, and the medicine cabinet upgrades | `src/js/player/bandages.js` |
| Bandaging on screen: the weapon carried away to where it rides first (`BAND_PUT`, `updateBandStow` in `src/js/player/swap.js`), the right hand winding the bandage round the left forearm (`bandagePose`), the wraps that stay on your arm after (`WRAP_AT`, each sized to sit over whatever sleeve, jacket, glove or armband is under it: `fitWraps`), and the blue edge and the camera's slow lean-in that build as it goes on and drop away fast if a hit cuts it short (`healFx`; the zoom is in `src/js/game/camera.js`). A click or a weapon key stops a bandage: it's used up and heals for as far as it got (`bandProg`; half wound, half its healing), and the health bar's blue part grows with it as it goes on (`cancelBandage`, `switchSlot` in `src/js/player/bandages.js`), and a weapon picked that way is taken out as the hands come down (`bandSwitch` in `bandPhases`). The wraps come off when you pick your card after a wave | `src/js/player/hold.js` |
| Bleeding: drops falling from the wound that spot the ground as you go (`bleedDrip` in `src/js/effects/particles.js`), the stain soaking into your clothes, and blood landing on the screen (`screenDrop` in `src/js/ui/hud.js`, `#bleedFx` in `src/styles/overlays.css`) | `src/js/weapons/combat-update.js` |
| The start of a run: the camera glide, getting up off one knee, the HUD sliding in | `src/js/game/intro.js` |
| Shove range, push and cooldown (slower while you bandage) | `src/js/player/shove.js` |
| Walking speed and statuses (bleeding, exhaustion) | `src/js/player/movement.js` |
| Aiming down sights and zoom | `src/js/player/aiming.js` |
| How each gun is held (grip and support hand points, stance), reload and bolt hand motions, akimbo. A reload's hand flows through its waypoints (`walkPath`) on a loose spring (`handTarget`), and each reload is done one of three ways picked at random with the same timing. Slides and bolts slam back the gun's full `travel` on each shot, and a bolt seen through a port in the side (`userData.clip` on the model, the port's rear edge) goes out of sight past that edge as it runs back (`REL_MAG`, `REL_SHELL`: how the gun is rolled, pitched and drawn in, and the hand's route; `W8.relStyle` is set in `src/js/weapons/reload.js`) | `src/js/player/hold.js` |
| A belt-fed gun's belt (the M60's): the rounds from the box to the feed tray show what's left, going from the box end first under ten (`BELT`, filled from the model's `belt`), it jiggles on two loose springs shaken by the gun's motion and each shot (`beltJiggle`, `beltKick`), and spent links fly out with the brass (`ejectLinks` in `src/js/weapons/casings.js`) | `src/js/player/hold.js` |
| Working the pump and the bolt: the ways each is worked, one picked at random each time (`RACKS`: the beats, timing, how the gun leans, where the hand takes the knob, and the knocks to the gun and the camera at each stop), how far the action is back (`cyclePose`), the sounds on each beat (`cycleFx`), and the rack that chambers a round (`chamberCycle`): a pump or bolt gun can't fire again till a rack drives a round home (`needsRack`), and a rack cut short by a reload or a swap is done again once your hands are free. The gun rides a loose spring through it (`RACK_K`, `RACK_D` in `src/js/player/hold.js`, along with how far the bolt handle turns, `BOLT_TURN`), and so does the camera (`camRack` in `src/js/game/camera.js`) | `src/js/weapons/casings.js` |
| Weapons carried on your body (the duty holster moulded round each sidearm, `HOLSTER_FIT`, on a belt; a long gun flat against the pack's left side, barrel down, and an automatic on a slant across its back, over the planks (`STOW_AT`, `STOW_TILT`, `packZ`), melee in the straps at the right edge; an empty pistol goes in with its slide locked back, and the holster stays on, empty, while the sidearm is drawn: `showStowed`; a pair's left gun has its own place, `STOW_AK`: a second holster on the left hip, or crossed over the first on the pack), the planks on your pack, and how the backpack swings (`PACK_SW`) | `src/js/player/stow.js` |
| Dust clouds, spark streaks, impact flashes, blood mist, embers, and dragon's breath (`dragonBreath`) | `src/js/effects/puffs.js` |
| Bullet tracers: how hard each round hits as far as its tracer goes (`tracerPower`), the colours for plain, +P and dragon's breath rounds (`TR_STYLE`), and the slug, its head, the line it leaves, the heat haze and the light a big round throws on the ground | `src/js/effects/tracers.js` |
| Bullet holes in the house walls | `src/js/effects/bullet-holes.js` |
| Blood on the farm: how long it stays (each wave ages it by `BM_AGE`, so it starts to fade at the third wave start) and how slowly it fades (`BM_FADE`) | `src/js/effects/blood-map.js` |
| The pool a body bleeds out into where it lands | `src/js/zombies/deaths.js` |
| The zombies' eye glow and the streaks behind it (`EYE_GLOW`, `EYE_HALO`, `EYE_STREAK`) | `src/js/effects/eye-glow.js` |
| How far the view eases toward an edge of the screen when the cursor is near it (`EDGE_IN`, `EDGE_PAN`) | `src/js/game/camera.js` |
| Sounds | `src/js/audio/sfx.js` |
| Controls | `src/js/input/keyboard-mouse.js`, `src/js/input/touch.js` |
| Day length and night colours, and how your eyes adjust to the dark (`DARK_EYES`) | `src/js/lighting/day-night.js` |
| House layout | `src/js/world/house.js` |
| The drive out front and the main road it meets in the fog, and the ground and grass past the farm's edge | `ROAD` and the end of `src/js/world/ground.js` |
| The haze and drifting fog banks past the farm's edge, and the fog lying on the road | `EDGE_BODY` and `uEdge` in `src/js/core/shaders.js`, `roadFog` in `src/js/world/atmosphere.js` |
| Furniture in the house (table, pantry shelf, bed, lamps, wall decorations) | `src/js/world/props.js`; the stations are in `src/js/stations/stations.js` |
| The survivor's look, dealt fresh each run: skin, hair, beard, eyes, hat, top, trousers, shoes, pack colour | `src/js/player/look.js` (the fixed belt, backpack and pouches are in `src/js/player/player.js`) |
| HUD look | `src/styles/hud-*.css` and `src/js/ui/hud.js` |
| Gear you get: the card at the bottom middle when you buy or are given something that stays (what it is, what it's on, what it does; `gotGear`), the pause screen's list of all of it (`renderBought`), and what a gun's called in a sentence (`gunCall`: your pistol, not your 9mm pistol) | `src/js/ui/gear-popup.js` |
| The crosshair: spread ticks, the ammo arc on its right and the stamina arc underneath (both keep clear of the reticle's outer edge, the tick tips or the shotgun's arcs, growing out as it widens: `aR`, `sR`, `XH_CLEAR`), reload, grenade and bandage rings; the melee brackets (`XHM`) pinch in through a swing's recovery and spring back out, twisting with the swing | `src/js/ui/crosshair.js`, `src/styles/crosshair.css` |
| Fire mode: what each gun fires as (`fireModeOf`: semi, burst, auto, fanning, or a pump/bolt/break action; a semi-auto fires once a click, `semiAuto` in `weapons/firing.js`, and a burst repeats while held and stops where it is when let go), its badge by the ammo count (`renderFireMode`) and the switch on B (`fireModeSwitched`: a two-step click, the mode by the crosshair, the rounds rolling over) | `src/js/weapons/mod-levels.js`, `src/js/ui/hud.js` |
| Reload times that grow with a bigger magazine (`MAG_SLOW` per doubling); one gun of an akimbo pair reloads in `AK_ONE` of a lone gun's time | `recomputeEff` in `src/js/game/run-state.js` |
| Akimbo: each gun has its own mag (`W8.akMag`, kept summing to `W8.mag`), trigger (left click the left gun, right click the right, both alternate; a burst is per gun) and cooldown. No aiming down the sights, and `AK_SPREAD` more spread. R reloads only the guns that have fired, the emptier first, one at a time while the other stays on the aim and can still fire. A dry gun's slide locks back and its reload ends dropping it (`AK_SLIDE`); one with rounds left skips that (`AK_TAC`) | `src/js/weapons/akimbo.js` (pose: `akU` in `src/js/player/hold.js`) |
| Akimbo HUD: a counter per gun with the mouse button that fires it, the rounds split into two mags, and a second ammo arc mirrored on the left of the crosshair; the gun being reloaded dims | `src/js/ui/hud.js`, `src/js/ui/rounds.js`, `src/js/ui/crosshair.js` |
| Run and gun (the vaulting skill): vaults a quarter quicker for half the stamina, and the gun stays in your right hand on the aim through the vault so you can fire (`vaultGun`) | `src/js/player/vaulting.js`, `src/js/player/animation.js` |
| Menu open and close animations: the station panel unrolling from its orange rule and rolling back up into it (`src/styles/stations.css`, `openStation` / `closeStation` in `src/js/stations/station-ui.js`), the title, pause and death screens' lines coming in one after another (`src/styles/screens.css`, `#dead` in `src/styles/hud-feed.css`), the history list growing open | `src/styles/` |
| Scrollbars (thin, squared, orange under the pointer) and the wheel easing lists along instead of stepping (`smoothWheel`) | `src/styles/base.css`, `src/js/core/dom.js` |
| The pollen and dust drifting by day: how thick (`MOTE_DENSITY`) and how bright | `motes` in `src/js/world/atmosphere.js` |
| The rolling digit counters (ammo, reserve, bandages, planks, scrap, kills, the reload text) | `rollText` / `setRoll` in `src/js/ui/hud-text.js` |
| The white melee-weapon silhouette shown in place of the ammo count | `src/js/ui/melee-art.js` |
| The icons (HUD, pickups, stations, status icons) | `src/js/ui/game-icons.js` |

### Adding a new gun

1. Add its stats to `GUN_WEAPONS` in `weapons/gun-stats.js`. Give it a `rar` (`'c'` common, `'u'` uncommon, `'r'` rare, `'e'` epic, `'l'` legendary) and a `desc`, and it appears as a card after a wave automatically.
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
- **Light map instead of real lights.** Lamps, fires and muzzle flashes are painted into one small light texture each frame instead of using many three.js lights (`lighting/lightmap.js`).
- **Pooling and instancing.** Particles, casings, tracers and blood decals reuse fixed pools, and trees, grass, bushes, rocks and fence posts are instanced meshes, so long fights don't create garbage or extra draw calls.
- **Cached geometry.** Box shapes are shared through a cache instead of being created per part (`core/geometry.js`).
- **No z-fighting.** As models are built, faces of different pieces that would sit exactly on top of each other are pulled apart by 0.6 mm (`unfight` in `core/geometry.js`).
- **Merged detail.** The small pieces of the survivor, the furniture and the stations are merged into a few meshes each, with their colours baked into the vertices, so all that detail costs only a few extra draw calls (`mergeInto` in `core/geometry.js`).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk in eight directions |
| Mouse | Aim; click to fire a handgun (one shot a click), hold to fire an automatic or swing. With a gun in each hand, left click fires the left one and right click the right. Clicking during a bandage stops it |
| Hold right click | Aim down the sights (scoped rifles zoom in further and steady right down) |
| 1 2 3 4 | Melee, sidearm, long gun, automatic (during a bandage: stops it and takes that weapon out) |
| R | Reload |
| Q | Apply a bandage (a ring round the cursor shows it going on, then the healing left) |
| V | Shove the zombies in front of you (stabs with a bayonet fitted) |
| F (hold) | Board up the door or window you're at |
| Space | Climb through an open window or hop a fence (costs stamina, more if you chain them) |
| E | Use the workbench, sawhorse, medicine cabinet or radio |
| G | Underbarrel grenade, once you have one |
| B | Switch fire mode on guns with a burst, full-auto or fanning mod (single → burst → full auto) |
| Wheel, + and − | Zoom in and out |
| T | Start the run (also from the death screen), or the next wave early |
| Esc or P | Pause |
| M | Back to the main menu from the death screen |

Touch screens get twin sticks and on-screen buttons.

## Credits

The icons are from [game-icons.net](https://game-icons.net), by Lorc, Delapouite, sbed and Zeromancer, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
