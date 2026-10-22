# Farmhouse Holdout

*Kessler Farm. Board up. Prepare for the horde. Survive as long as you can.*

Farmhouse Holdout is an isometric zombie survival roguelike that runs in your browser. You hold an old farmhouse
against wave after wave of the dead. Between waves you nail boards over the windows, craft ammo, upgrade your guns
and patch yourself up. When a wave is cleared you pick one card to make your run stronger. Play alone, or with up to
three friends online.

---

## How a run goes

1. **Break.** The clock is stopped. Board up the windows and doors, spend scrap at the stations and get into
   position. Press **T** when you're ready, or wait out the timer.
2. **Wave.** The zombies come out of the trees, break your boards down and climb in. Keep them out, and keep moving.
3. **Cards.** When the last zombie falls, pick one of three cards: a new gun, a skill, a perk or supplies. Every fifth
   wave brings a bonus hand.
4. **Repeat.** Each wave is bigger and meaner than the last, and pays a little more scrap. The run ends when you go down.

When the run ends, **Full run stats** folds open under your score: kills by zombie type and by weapon, headshots,
your longest kill and biggest chain, boards nailed and repaired, damage taken and your closest call, scrap earned,
spent and sent to teammates, and every skill and perk you took.

## What's in it

**The farm.** Every run lays out a new house: its footprint, its rooms, its interior doors, its windows and where the
furniture stands, plus a new yard of cars, crates, hay bales and fences. The roof and walls fade away around you so
you can always see inside. The clock runs from afternoon into night, and the dark is where the lamps, your
flashlight and the muzzle flashes matter.

**Guns.** A 9mm pistol, a .357 revolver, a .50 hand cannon, pump, double-barrel and auto shotguns, a hunting rifle, a
battle rifle, a machine pistol, a submachine gun, an assault rifle and a light machine gun. Each one has its own
reload: mags in and out, shells one at a time, speed loaders and belts. At the workbench you can add sights, lasers,
suppressors, stocks, grips and underbarrel grenades, and change calibres with conversion kits such as AK mags for the
battle rifle or 10mm for the SMG. You can also load special rounds (hollow points, slugs, flechettes and more) and
tune damage, fire rate, recoil and magazine size.

**Melee.** An ash bat, crowbar, pipe wrench, machete, katana, fire axe and sledgehammer, each with its own swings,
reach and stamina cost. Sharp blades take heads and limbs off.

**Fog rounds.** Now and then a wave comes in under a thick ground fog that rolls in off the fields. It stays out
of the house, parts round you in a ring that thins as it gets close, and anything out in it can't be seen, outlined
or picked out by your crosshair until it's nearly on you.

**Zombies.** Shambling walkers, fast runners, spitters that lob acid at anyone who stands still, and brutes that
charge through fences and plough through the crowd. Shots land where they hit: a leg shot slows them, a severed leg
leaves a crawler, and a headshot drops them. The dead fall as ragdolls.

**Holding the house.** Nail up to three boards over every window and door, and repair them between waves. Upgrade the
sawhorse to a metalwork bench and bar the openings with steel grates instead, reinforced in five tiers. Vault through
windows and hop fences to escape, and shove zombies off you when they get close.

**Stations.**

| Station | What it's for |
| --- | --- |
| Workbench | Gun upgrades, attachments, ammo |
| Sawhorse / metalwork bench | Planks and metal, and bracing the boards |
| Medicine cabinet | Bandages and health |
| Ham radio | Calls in supply drops |
| Gun rack | New guns for your slots |
| Strongbox (co-op) | Gives scrap to a teammate |

**Co-op.** Up to four players. On the title screen press **Co-op**, enter your name and **Host a game**. Your friends
then enter the four-letter code and press **Join**. Each player keeps their own weapons, scrap, drops and cards. If you
go down, you watch a teammate until the wave is cleared, then come back as a new survivor with a full mag in each gun and
three spares. Clear a wave with nobody down and everyone gets a little scrap. You can add friends by
their friend code to see when they're online and join their lobby in one click.

## Controls

These are the defaults. Every key except walking can be changed in **Settings → Controls**, either to another key or
to a middle or side mouse button. The keys shown in the game always match your choices.

| Movement | | Combat | | Survival | |
| --- | --- | --- | --- | --- | --- |
| W A S D | Walk | Mouse | Aim and fire | Hold F | Board up a window or door |
| Shift | Sprint | Right click | Aim down the sights | Hold C | Tear a board down |
| Space | Vault a window or fence | R | Reload | E | Use a station or pick something up |
| Wheel, + − | Zoom | 1 – 4 | Switch weapon | Q | Bandage |
| | | V | Shove | T | Start the next wave early |
| | | B | Switch fire mode | H | Share a gun (co-op) |
| | | X | Load the next kind of round | Esc, P | Pause |
| | | G | Underbarrel grenade | | |
| | | I | Weapon stats | | |

Touch screens get twin sticks and on-screen buttons.

## Settings

| Setting | Options |
| --- | --- |
| Ambient occlusion | On, off |
| Glow | Off, soft, normal, strong |
| Shadow quality | High, medium, low |
| Resolution | Auto (lowers itself if the frame rate drops), 100%, 75%, 50% |
| Frame rate counter | On, off |
| HUD style | Normal, or Minimalist (the essentials only: no heart trace, round glyphs or clock face) |
| Master volume, screen shake | 0–100% |

All settings are saved in your browser.

---

## Working on the game

```bash
npm install
npm run dev        # builds and serves at http://localhost:5173, rebuilding on every save
npm run build      # minified build into dist/
npm run build:dev  # readable build, each file marked, so errors point at the right line
```

Every build also writes `dist/standalone.html`, the whole game in one file. Every push runs CI: all three builds and a
browser smoke test (`tools/smoke.mjs`) that starts a run, moves, shoots, reloads and pauses.

### How the code fits together

The game is plain JavaScript and three.js (r128), with no framework. The build joins the files in
`src/js/load-order.json`, in that order, into one script:

- Every file shares one scope, so there are no imports. Any file can use any other file's functions.
- Order only matters for code that runs at load time. The build checks the joined script and names the file and line
  of any error, such as a duplicate name.
- Each frame, `game/loop.js` runs `update(dt)` (`game/update.js`, the simulation) and then `visuals(dt)`
  (`game/visuals.js`, animation, camera and HUD). Those two files list every system in order, so they're the place to
  start reading.

```
src/
  index.html     the page: HUD, menus, settings, station panels
  styles/        CSS, one file per part of the screen
  js/
    core/        renderer, shaders, maths, geometry helpers, shadow batching
    world/       the farm: house, rooms, yard, props, collision, cut-away
    lighting/    light map, day and night, fog of war
    player/      movement, aiming, vaulting, bandages, gear
    weapons/     gun stats, models, mods, firing, reloading
    melee/       melee weapons and swings
    zombies/     types, spawning, pathfinding, damage, ragdolls
    barricades/  boards and grates
    stations/    workbench, sawhorse, cabinet, radio, gun rack, strongbox
    upgrades/    the cards and tiers
    effects/     post-processing (SSAO, bloom), blood, particles, outlines
    ui/          HUD, crosshair, settings, menus
    input/       keyboard, mouse, touch and key bindings
    audio/       sounds and reverb
    game/        shared state, the loop, the camera
    net/         co-op over WebRTC
tools/           build, smoke test, and the asset packing scripts
assets/          the raw texture and sound packs (not shipped)
```

Each source file starts with a comment saying what it holds. The main shared state is `P` (the player), `W8` (your
weapons and ammo), `S` (your upgrade stats), `run` (the current run), `zombies`, and `state` and `phase` (which screen
is showing, and whether it's a wave or a break).

### Adding a gun

1. Add its stats to `GUN_WEAPONS` in `weapons/gun-stats.js`. Give it a rarity (`rar`) and a `desc`, and it will turn
   up as a card.
2. Add a model builder with the same id to `GUN_MODELS` in `weapons/gun-models.js`. Copying the closest gun is the
   easiest start.
3. Optionally add mods for it in `weapons/gun-mods.js`, a range drop-off in `weapons/ammo.js` and an ejection style in
   `weapons/casings.js`.

Melee weapons work the same way, in `melee/melee-stats.js` and `melee/melee-models.js`.

## Credits

Icons from [game-icons.net](https://game-icons.net), by Lorc, Delapouite, sbed and Zeromancer, under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Built with [three.js](https://threejs.org) and
[PeerJS](https://peerjs.com).
