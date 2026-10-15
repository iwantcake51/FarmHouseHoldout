---
name: trace-photo
description: Trace an object off reference photos into precise model coordinates (sub-pixel accurate) and check the model against every photo, so a 3D model, vector shape or CAD sketch matches the real thing from every angle. Use this whenever the user gives reference photos/images of a gun, attachment, tool, vehicle, product or part and wants it modelled, rebuilt, remodelled or redrawn "from the reference", "traced", "as close as possible to the source image", "matching the picture", says a model is "inaccurate", "off", or "the proportions aren't right" next to photos, or wants outlines, side profiles, lathe/revolve curves, hole positions, sizes or positions measured off an image, including three-quarter, front, rear or top views, even if they never say the word "trace".
---

# Trace a reference photo into model coordinates

Eyeballing a photo gets proportions roughly right and details wrong. This skill measures the photo instead: every
outline is the real edge of the object, found to a fraction of a pixel, mapped into the units the model uses, and
checked by drawing it back over the photo. The result is a list of points you drop straight into an extrusion, a
lathe, or a path.

Every photo the user sends counts. The side photo gives the profile; the others (three-quarter, front, rear, top) get a
camera fitted to them, so the model can be laid over each one and every part that disagrees found, measured and fixed
(step 8). The tool is `scripts/trace.py` (next to this file). It needs Python 3 with numpy, pillow, scipy and scikit-image
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

Look at the grid image and **every other view the user gave you**, then list the parts and how each will be built.
A side photo only shows a silhouette. A round tube, a flat slab and a fin all look the same from the side, so decide
each part's cross-section from the front, top or 3/4 views before tracing. Most optics, barrels, tubes and knobs are
round. Extruding one as a flat profile is the classic mistake: it looks right side-on and wrong from every other angle.
A part that's round with a fin or foot on it is built as a lathe for the round part plus narrow extrusions for the fin
and foot. Trace each of those separately, cut off where it meets the round body, so the body hides the cut.

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

Cut each part out with a `--box` (pixels) or `--poly` (pixels) or `--gbox`/`--gpoly` (model units), then trace it.
When a polygon's first number is negative, write it as `--gpoly="-0.02,0.01;..."` (with `=`) so it isn't read as an
option:

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
- Render the model square-on from the photo's side with an **orthographic** camera framed to the photo's own MAP:
  the photo's pixel (x, row) is model (z, y), so the camera's view covers the photo's width times `s`, centred where
  the photo's middle maps to. Render it on white and put it next to the photo:
  `trace.py compare photo.png render.png compare.png`. In the blended third panel, any edge that doesn't line up shows
  doubled. A perspective camera can't be compared this way, because its edges move with depth.
- Then go through every other photo the user sent, as in step 8.

### 8. Use every other photo: fit a camera to it, lay the model over it, fix what disagrees

A three-quarter photo can't be traced flat, but it can be matched exactly: find the camera that took it, render the
model through that camera, and every difference left is the model's. This is how widths, depths and the shapes of
parts the side view hides get right.

1. **Export the model's triangles** in model units, one named part per mesh: an OBJ (`o`/`g` names the parts), or JSON
   `{"parts": {name: [x,y,z, x,y,z, x,y,z, ...]}, "colors": {name: "#rrggbb"}}`. From three.js:
   ```js
   root.updateMatrixWorld(true); const parts = {}, colors = {}; let n = 0;
   root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = g.attributes.position, v = new THREE.Vector3(), a = [];
     for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); a.push(v.x, v.y, v.z); }
     const k = String(n++).padStart(3, '0') + ' ' + (o.name || 'mesh'); parts[k] = a; if (o.material.color) colors[k] = '#' + o.material.color.getHexString(); });
   JSON.stringify({ parts, colors });
   ```
   Name the meshes (or note which index is which part) so the reports below say which part is off.

2. **Fit the camera** for each photo:
   ```bash
   python3 trace.py pose photo_34.jpg --mesh model.json --ignore "x,y;x,y;...|x,y;..."
   ```
   It searches every direction round the model, and the model mirrored, slides each view onto the photo's silhouette,
   then refines rotation, position and focal length until the silhouettes overlap as closely as they can. It prints
   the overlap (IoU), whether a mirrored fit won, and the camera (also as three.js `position / up / lookAt / fov`).
   - **Leave out the parts you doubt** with `--ignore` (polygons in pixels), so the camera locks onto the parts you
     trust (the traced, round ones). On the parts it keeps, aim for an IoU of 0.96 or more.
   - **A near-symmetric object can fit back to front or mirrored.** Check the reported position makes sense, and that
     text in the photo reads normally (then it isn't mirrored: pass `--mirror no`). If the search lands wrong, give it
     a few `--pts "u,v=x,y,z;..."` (pixels of features whose model position you know for sure: a cap's centre, a tip),
     narrow `--az`/`--el`, or start from a camera you trust with `--init`.
   - Don't ignore away the one feature that breaks the symmetry (a turret, a knob); keep it in.
   - A range starting with a minus needs `=`: `--el=-10,10`.

3. **See where it disagrees**:
   ```bash
   python3 trace.py diff photo_34.jpg model.json photo_34_cam.json --parts
   ```
   Four panels: the photo, the model rendered from the same camera, the disagreement (red: the photo has material the
   model lacks; blue: the model has material the photo doesn't), and the two blended. It lists the biggest patches
   with the parts they belong to and, with `--parts`, those parts' model-space extents. Also render the model in the
   real engine with the printed camera, next to the photo: shading shows what silhouettes can't (a step, a chamfer,
   how thick a web is).

4. **Fit the parts against all the photos at once**:
   ```bash
   python3 trace.py fit model.json --view side.png side_cam.json --view q34.jpg q34_cam.json "ignore polys" \
       --view rear.jpg rear_cam.json --parts "^08[0-3] " --dof sxy,sz,tz --pivot 0,0.061,-0.0625
   ```
   It moves and scales just those parts (`tx,ty,tz`, `s`, `sxy` across a round part's axis, `sx,sy,sz`) until the
   model agrees best with every view together, and prints the move, the parts' new extent, and each view's
   disagreement before and after. Put the numbers into the model's data, re-export, `diff` again. Fit one group at
   a time (housing, then eyepiece, then each knob) and set `--pivot` where scaling should be centred (on the axis for
   round parts).

5. **Measure what silhouettes can't settle** with `ray`:
   ```bash
   python3 trace.py ray q34_cam.json --px "387,372" --cam2 rear_cam.json --px2 "198,287"   # one feature, two photos
   python3 trace.py ray q34_cam.json --px "113,336;119,321" --plane x=0.004                 # onto a known plane
   python3 trace.py ray q34_cam.json --px "208,425" --mesh model.json                         # onto the model
   ```
   Picking the same feature (a screw's centre, a corner) in two photos triangulates its true position, nothing
   assumed. The report says how far apart the two rays pass in pixels: under about 3 px it's the same point; over 10
   px the picks aren't the same feature. One photo onto a plane is only as good as the plane you assume, so prefer two.

6. **Decide between photos that disagree.** If fixing a part improves one view and worsens another, the photos show
   different versions of the product (a different mount, a different model year). Say so, and follow the reference
   the user sent last or pointed at.

Report each view's IoU before and after, with the diff pictures.

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
| `pose IMG --mesh M [--pts] [--ignore] [--mirror] [--az] [--el] [--fov] [--init]` | the photo's camera (JSON), the overlap, a three.js camera line |
| `diff IMG M CAM [--parts] [--ignore] [--crop]` | the four-panel picture, and the disagreeing patches with their parts |
| `fit M --view IMG CAM [IGNORE] ... --parts REGEX --dof ... [--pivot] [--out]` | the move/scale that best matches every view, before/after per view |
| `ray CAM --px ... (--plane a=v \| --mesh M \| --cam2 CAM2 --px2 ...)` | model points off an angled photo; two pixels: the distance |

Add `--json` to `outline`/`lathe` to print only the points, and `--dp` to change the decimal places (default 5).

## Report back

Show the user the overlay images for the main parts, give the numbers (points, worst deviation in px and model
units, the scale used and where it came from), then show the finished model next to every reference photo, each
rendered from that photo's fitted camera, with its IoU before and after.
