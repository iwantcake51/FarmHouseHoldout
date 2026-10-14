---
name: trace-photo
description: Trace an object's outline off a reference photo into precise model coordinates (sub-pixel accurate) so a 3D model, vector shape or CAD sketch matches the real thing. Use this whenever the user gives reference photos/images of a gun, attachment, tool, vehicle, product or part and wants it modelled, rebuilt, remodelled or redrawn "from the reference", "traced", "as close as possible to the source image", "matching the picture", or wants outlines, side profiles, lathe/revolve curves, hole positions or circle sizes measured off an image, even if they never say the word "trace".
---

# Trace a reference photo into model coordinates

Eyeballing a photo gets proportions roughly right and details wrong. This skill measures the photo instead: every
outline is the real edge of the object, found to a fraction of a pixel, mapped into the units the model uses, and
checked by drawing it back over the photo. The result is a list of points you drop straight into an extrusion, a
lathe, or a path.

The tool is `scripts/trace.py` (next to this file). It needs Python 3 with numpy, pillow, scipy and scikit-image
(`pip install numpy pillow scipy scikit-image` if any are missing). Run any subcommand with `-h` for every option.

## The workflow

### 1. Pick the right photo

Precision is capped by the photo, not the tool, so this step matters most.

- **Side-on and flat**: a product shot taken square to the object, from far away (long lens). Perspective makes the
  near end bigger than the far end. Reject three-quarter views for tracing; use them only to understand depth.
- **Plain background**: a white or flat backdrop makes the silhouette unambiguous. Cluttered backgrounds need a cut
  polygon hugging the part, and a `--color` test.
- **The biggest, sharpest copy available.** Convert webp/avif to png first if a library chokes on it.
- **Straight**: if the object's long edge isn't level, measure the angle and pass `"rot"` in the MAP (degrees,
  counter-clockwise). Every command then straightens the photo first.

Keep the other views the user gave you (front, top, 3/4). The side photo has no depth, so widths come from those.

### 2. Read the photo before tracing

```bash
python3 trace.py grid photo.png --step 50                    # prints the part's pixel extent, writes photo_grid.png
python3 trace.py grid photo.png --crop 600,380,1000,700 --step 10 --zoom 3   # zoom into a detail
```

Look at the grid image. List the parts and how each will be built:

| Part looks like | Build it as | Trace it with |
|---|---|---|
| A flat-sided body, plate, grip, stock, housing | an extruded side profile | `outline` |
| Anything round about its long axis: barrel, tube, eyepiece, knob seen side-on | a lathe/revolve | `lathe` (`--vertical` for an upright axis) |
| A round feature on a face: screw head, cap, lens, hole | a cylinder or circle | `circle` |
| A part that differs by colour, not silhouette: red fibre, wooden stock on dark metal | a profile | `outline --color ... --field ...` |

### 3. Set the scale and origin (the MAP)

Every command takes a MAP, as inline JSON or a file path:

```json
{"xm": 746.5, "zm": 0, "yb": 1107, "gy": 0, "s": 0.0001417, "dir": 1, "rot": 0}
```

- Photo pixel x `xm` is model z `zm`, and photo row `yb` is model y `gy`. z runs along the photo's x (`dir: -1` if the
  object faces left and the model's +z is its front), and y runs up the photo.
- `s` is model units per pixel. Get it from the longest dimension you know for certain: a published length, or a
  part already in the model (a rail width, a barrel length). Then everything traced lands at true scale next to what's
  already modelled. An error in `s` scales everything, so measure the span in pixels with `grid` at high zoom.
- Pick the origin where the part will be attached in the model, such as the mount's base or the centre of its length. Then the
  traced points only need an offset in code.

```bash
python3 trace.py map --len 30,1463,0.203 --zm -0.1015 --row 1107,0      # photo x 30..1463 is 0.203 units long
python3 trace.py map --pts "30,-0.1015;1463,0.1015" --row 1107,0          # or two known points
```

### 4. Trace each part

Cut each part out with a `--box` (pixels) or `--poly` (pixels) or `--gbox`/`--gpoly` (model units), then trace it:

```bash
python3 trace.py outline photo.png "$MAP" --poly "725,395;1475,395;1475,978;610,978;610,860" --tol 0.5
python3 trace.py lathe   photo.png "$MAP" --box 28,500,300,840                 # axis found automatically
python3 trace.py lathe   photo.png "$MAP" --box 505,405,725,515 --vertical     # an upright cap
python3 trace.py circle  photo.png "$MAP" --box 720,1020,810,1100 --rmax 33     # limit the radius to skip halos
python3 trace.py outline photo.png "$MAP" --box 640,420,1430,620 --color "(r - g) > 25" --field "r - g"
```

Where a part merges into another (a housing into a tube), cut it where they join and let the joining part hide the
cut edge in the model. Don't try to trace two parts as one if they'll be built differently.

**How the edge is found:** everything near the background colour and connected to the photo's border is background.
Everything else is the part, so highlights and light patches inside it stay solid. Near that rough edge, each pixel's
contrast is measured against the part's own level just inside the edge and the background's just outside. The line
runs where it is exactly halfway, found by marching squares, so it lands between pixels. This is where an
anti-aliased edge really is, for dark parts and light ones alike. A fixed threshold would cut dark parts too wide and
light parts too narrow.

### 5. Read the report, look at the overlay, every time

Each trace prints:

- `furthest from the photo's edge N px`: the simplified outline's worst deviation from the traced edge (bounded by
  `--tol`), and its rms. Keep it at or under 0.5 px for silhouettes you'll see. Raise `--tol` only for noisy
  regions such as text, knurling or JPEG blocks, where the "detail" is noise.
- `edge band refined N%`: how much of the edge had enough contrast for the sub-pixel step. Low numbers mean a dark
  part against a dark backdrop, or a colour-only boundary. Use `--field` for those.
- an overlay PNG: the photo zoomed with the trace in magenta and the cut in cyan. **Open it and look.** Check that the
  line sits on the edge all the way round, with no bites from highlights or shadows and nothing from neighbouring
  parts.

If the overlay is wrong, fix it this way:

| What you see | Fix |
|---|---|
| The trace takes in a shadow on a white backdrop | `--shadow`, or raise `--th` |
| A light part (chrome, a white label) is missing | lower `--th` (default 60) |
| A light patch at the edge bites into the outline | `--close 2` |
| Specks or a neighbouring part are included | tighten the `--poly`, or `--open 2` |
| A window or loop should be open | `--holes` |
| The lathe's two edges disagree by several px | the part isn't round there, or something else is in the box; narrow the box or use `--side top` |

### 6. Put the points into the model

- Keep traced arrays as data (a constant per part), not retyped numbers. Offset them by where the part attaches.
- Extrude a profile by the part's real width, taken from the front or top photo, or from specs. Narrow it along its
  length if the other views show it tapering.
- **Keep the traced size when rounding edges**: a bevel grows a shape by its radius, so inset the outline by that
  radius first (or bevel 0). Otherwise every part comes out a bevel too big and hides whatever sits on its surface.
- `lathe` gives `[r, z]` (or `[r, y]` with `--vertical`) ready for a lathe/revolve, such as three.js `LatheGeometry`,
  Blender's Screw modifier, or a CAD revolve. Close the ends by adding r = 0 points.
- `circle` gives the centre and radius in model units, for screw heads, caps and lenses.

### 7. Check the model against the photo

- Draw the model's outlines back over the photo: `trace.py check photo.png "$MAP" polys.json`.
- Render the model from the same side, at the same framing, and put it next to the photo:
  `trace.py compare photo.png render.png compare.png`. Look at the blended third panel for any edge that doesn't line up.
- Then render the angles the user will actually see it from, and compare against the other reference views.

## Commands

| Command | Gives |
|---|---|
| `grid IMG [--crop x0,y0,x1,y1] [--step N] [--zoom K]` | a labelled pixel grid, and the part's pixel extent |
| `map (--len xa,xb,L --zm Z \| --pts "x,z;x,z") --row r,y [--rot deg]` | the MAP JSON |
| `outline IMG MAP (--box\|--poly\|--gbox\|--gpoly) [--tol] [--holes] [--all] [--color] [--field] [--shadow]` | `[[z, y], ...]` plus deviations and an overlay |
| `lathe IMG MAP --box ... [--axis auto\|ROW\|y<Y>] [--vertical] [--side top\|bottom\|both]` | `[[r, z], ...]` (or `[[r, y], ...]`) |
| `circle IMG MAP --box ... [--rmin] [--rmax]` | centre z, y and radius, with the fit's rms |
| `check IMG MAP POLYS` | model-space polygons drawn back over the photo |
| `compare REF RENDER OUT [--crop]` | reference, render, and the two blended |

Add `--json` to `outline`/`lathe` to print only the points, and `--dp` to change the decimal places (default 5).

## Report back

Show the user the overlay images for the main parts, give the numbers (points, worst deviation in px and model
units, the scale used and where it came from), then show the finished model next to the reference.
