#!/usr/bin/env python3
"""Trace outlines off a reference photo into model coordinates, to sub-pixel precision.

  grid     a labelled pixel grid over the photo (or a crop of it), to read landmarks off
  map      the photo-to-model mapping (MAP) from two known points, or a known length
  outline  one part's outline, cut out by a box and/or polygon       -> [[z, y], ...]
  lathe    a round part's radius along its axis, for a lathe         -> [[r, z], ...]
  circle   a round feature (cap, bolt head, lens) inside the outline -> centre and radius
  check    model-space polygons drawn back over the photo
  compare  reference and render side by side, and blended
  pose     fit a camera to a photo taken from any angle (from the model's silhouette and/or point pairs)
  diff     the model laid over that photo through its camera: where they disagree, part by part
  fit      move/scale chosen parts until the model agrees with every photo at once
  ray      model coordinates read off an angled photo: a pixel onto a plane or the model, or triangulated from two

Run `trace.py CMD -h` for each one's options. Every command that reads the photo takes the MAP as JSON:
  {"xm": px, "zm": z at xm, "yb": px row, "gy": y at row yb, "s": model units per px, "dir": 1 or -1, "rot": deg}
z runs along the photo's x (dir -1 if the part faces left), y up the photo; "rot" (optional) straightens a photo
taken slightly askew before anything else is done to it.

How an edge is found: everything near the background colour and joined to the photo's border is background, the
rest is the part (so highlights inside it stay solid). Around that coarse edge, each pixel's colour distance from
the background is set against the part's own level just inside the edge and the background's just outside, and the
edge is drawn where it's halfway between the two (marching squares, so it lands between pixels). That puts the
line where an anti-aliased edge really is, light parts and dark ones alike, instead of wherever a fixed threshold
happens to cut it.
"""
import argparse, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import measure, feature


# ---------------------------------------------------------------------------------------------------- the mapping
def load_map(s):
    M = json.loads(s) if s.strip().startswith('{') else json.load(open(s))
    M.setdefault('dir', 1); M.setdefault('rot', 0); M.setdefault('zm', 0); M.setdefault('gy', 0)
    return M


def to_model(M, x, r): return M['zm'] + (x - M['xm']) * M['s'] * M['dir'], M['gy'] + (M['yb'] - r) * M['s']
def to_px(M, z, y): return M['xm'] + (z - M['zm']) / M['s'] * M['dir'], M['yb'] - (y - M['gy']) / M['s']


def load_img(path, M=None):
    im = Image.open(path).convert('RGB')
    if M and M.get('rot'):
        a0 = np.asarray(im)
        bg = tuple(int(v) for v in np.median(np.concatenate([a0[0], a0[-1], a0[:, 0], a0[:, -1]]), axis=0))
        im = im.rotate(M['rot'], resample=Image.BICUBIC, fillcolor=bg)
    return im


def bg_colour(a, given=None):
    if given: return np.array([float(v) for v in given.split(',')])
    return np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)


def parse_pts(s, M=None, model=False):
    pts = [tuple(map(float, p.split(','))) for p in s.replace(' ', '').split(';') if p]
    return [to_px(M, z, y) for z, y in pts] if model else pts


# ---------------------------------------------------------------------------------------------------- the edge field
def shadow_test(r, g, b, u=(-0.5538, -0.5624, -0.614), off=11.0, tmax=270.0):
    # a shadow on a white backdrop is white darkened along one warm direction: its colours lie on a line out of white.
    # True where a pixel is such a shadow (not the part): near that line and no darker than a shadow gets
    q = np.stack([r - 255.0, g - 255.0, b - 255.0], -1); u = np.asarray(u) / np.linalg.norm(u); t = q @ u
    return (np.linalg.norm(q - t[..., None] * u, axis=-1) <= off) & (t <= tmax)


def ev(expr, a, F):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b; sat = a.max(-1) - a.min(-1)
    return eval(expr, {'np': np}, {'r': r, 'g': g, 'b': b, 'F': F, 'lum': lum, 'sat': sat})


def coarse_fg(a, args):
    """The part, to the pixel: everything near the background colour and joined to the border is background, the rest
    is the part. Also F, each pixel's colour distance from the background."""
    bg = bg_colour(a, args.bg)
    F = np.sqrt(((a - bg) ** 2).sum(-1)).astype(np.float32)
    near = F < args.th
    if args.shadow: near |= shadow_test(a[..., 0], a[..., 1], a[..., 2])
    if args.holes: fg = ~near   # every pocket of background counts, so windows show
    else:              # background is what's joined to the border; enclosed light areas are part of the part
        lab = measure.label(near, connectivity=1)
        edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); edge = edge[edge > 0]
        fg = ~np.isin(lab, edge)
    if args.color: fg &= ev(args.color, a, F).astype(bool)
    if args.open: fg = ndi.binary_opening(fg, iterations=args.open)
    if args.close: fg = ndi.binary_closing(fg, iterations=args.close)
    return fg, F


def edge_field(a, args, crop):
    """N over the crop: 0 = background, 1 = the part, the edge at 0.5 (sub-pixel). Also the coarse mask, and how much
    of the edge band had too little contrast to refine (and fell back to the coarse mask)."""
    fg, F = coarse_fg(a, args)
    y0, y1, x0, x1 = crop
    fg = fg[y0:y1, x0:x1]
    field = (ev(args.field, a, F) if args.field else F)[y0:y1, x0:x1].astype(np.float32)
    # the part's level just inside the edge and the background's just outside, averaged locally
    k = args.band
    ins = fg & ~ndi.binary_erosion(fg, iterations=k + 1) & ndi.binary_erosion(fg, iterations=1)
    out = ndi.binary_dilation(fg, iterations=k + 1) & ~ndi.binary_dilation(fg, iterations=1)
    w = 4 * k + 3
    def local_mean(vals, m):
        num = ndi.uniform_filter(np.where(m, vals, 0).astype(np.float32), w); den = ndi.uniform_filter(m.astype(np.float32), w)
        return num / np.maximum(den, 1e-6), den > 1e-4
    Li, oki = local_mean(field, ins); Lo, oko = local_mean(field, out)
    band = ndi.binary_dilation(fg, iterations=k) & ~ndi.binary_erosion(fg, iterations=k)
    contrast = Li - Lo
    good = band & oki & oko & (np.abs(contrast) > args.min_contrast)
    N = fg.astype(np.float32)
    N[good] = np.clip((field[good] - Lo[good]) / contrast[good], -0.5, 1.5)
    fell = band & ~good
    if fell.any(): N[fell] = ndi.gaussian_filter(fg.astype(np.float32), 0.6)[fell]   # no contrast to go on: the coarse edge, softened
    return N, fg, (fell.sum() / max(1, band.sum()))


def up(N, f):
    if f <= 1: return N
    im = Image.fromarray(N.astype(np.float32), mode='F')
    return np.asarray(im.resize((N.shape[1] * f, N.shape[0] * f), Image.BICUBIC))


def contours(N, cut, f, ox, oy):
    """Contours of N at 0.5 inside the cut, in photo pixel coordinates (x, row), largest first."""
    Nc = np.pad(N * cut, 1)
    cs = measure.find_contours(Nc, 0.5)
    res = []
    for c in cs:
        if len(c) < 4: continue
        rr = (c[:, 0] - 1 + 0.5) / f - 0.5 + oy; xx = (c[:, 1] - 1 + 0.5) / f - 0.5 + ox
        P = np.stack([xx, rr], 1); A = 0.5 * np.sum(P[:-1, 0] * P[1:, 1] - P[1:, 0] * P[:-1, 1])
        res.append((abs(A), P))
    res.sort(key=lambda t: -t[0])
    return res


def simplify(P, tol):
    Q = measure.approximate_polygon(P[:, ::-1], tolerance=tol)[:, ::-1]   # (row, col) order for skimage
    if len(Q) > 1 and np.allclose(Q[0], Q[-1]): Q = Q[:-1]
    return Q


def deviation(P, Q):
    """The furthest the raw contour P strays from the simplified polygon Q (px)."""
    Qc = np.vstack([Q, Q[:1]]); A, B = Qc[:-1], Qc[1:]; d = B - A; L2 = np.maximum((d ** 2).sum(1), 1e-12)
    best = np.full(len(P), np.inf)
    for i in range(len(A)):
        t = np.clip(((P - A[i]) @ d[i]) / L2[i], 0, 1); proj = A[i] + t[:, None] * d[i]
        best = np.minimum(best, np.hypot(*(P - proj).T))
    return float(best.max()), float(np.sqrt((best ** 2).mean()))


def cut_mask(shape, ox, oy, f, box, poly):
    """1 inside the box (and the polygon, if there is one), 0 outside, on the (upsampled) grid of the crop."""
    H, W = shape
    sx = lambda x: (x - ox + 0.5) * f - 0.5; sy = lambda r: (r - oy + 0.5) * f - 0.5
    def fill(draw):
        m = Image.new('L', (W, H), 0); draw(ImageDraw.Draw(m)); return np.asarray(m).astype(np.float32)
    c = fill(lambda d: d.rectangle([sx(box[0]), sy(box[1]), sx(box[2]), sy(box[3])], fill=1))
    if poly: c *= fill(lambda d: d.polygon([(sx(x), sy(r)) for x, r in poly], fill=1))
    return c


def region(args, M, img_size):
    """The box (px) to work in, and the cut polygon (px), from --box/--gbox and --poly/--gpoly."""
    poly = parse_pts(args.poly) if args.poly else parse_pts(args.gpoly, M, True) if args.gpoly else None
    if args.box: box = [float(v) for v in args.box.split(',')]
    elif args.gbox:
        z0, y0, z1, y1 = [float(v) for v in args.gbox.split(',')]
        xa, ra = to_px(M, z0, y0); xb, rb = to_px(M, z1, y1); box = [min(xa, xb), min(ra, rb), max(xa, xb), max(ra, rb)]
    elif poly: xs, rs = zip(*poly); box = [min(xs), min(rs), max(xs), max(rs)]
    else: box = [0, 0, img_size[0] - 1, img_size[1] - 1]
    return box, poly


def overlay(im, box, polys, cutpoly, path, zoom, M=None):
    m = 12; x0, y0 = max(0, int(box[0]) - m), max(0, int(box[1]) - m); x1, y1 = min(im.width, int(box[2]) + m + 1), min(im.height, int(box[3]) + m + 1)
    c = im.crop((x0, y0, x1, y1))
    if zoom == 'auto': zoom = max(1, min(8, 1600 // max(1, c.width)))
    c = c.resize((c.width * zoom, c.height * zoom), Image.NEAREST if zoom >= 4 else Image.BICUBIC).convert('RGB')
    d = ImageDraw.Draw(c)
    T = lambda x, r: ((x - x0 + 0.5) * zoom, (r - y0 + 0.5) * zoom)
    if cutpoly: d.line([T(*p) for p in cutpoly + cutpoly[:1]], fill=(0, 200, 255), width=1)
    for k, P in enumerate(polys):
        col = (255, 0, 200) if k == 0 else (255, 160, 0)
        pts = [T(x, r) for x, r in P]
        d.line(pts + pts[:1], fill=col, width=1)
        for p in pts: d.ellipse([p[0] - 1.5, p[1] - 1.5, p[0] + 1.5, p[1] + 1.5], fill=col)
    c.save(path)
    return path


def fmt(v, dp): return round(float(v), dp)


# ---------------------------------------------------------------------------------------------------- commands
def cmd_outline(args):
    M = load_map(args.map); im = load_img(args.img, M); a = np.asarray(im).astype(np.float32)
    box, poly = region(args, M, im.size)
    m = args.band * 2 + 6
    ox, oy = max(0, int(math.floor(box[0])) - m), max(0, int(math.floor(box[1])) - m)
    x1, y1 = min(im.width, int(math.ceil(box[2])) + m + 1), min(im.height, int(math.ceil(box[3])) + m + 1)
    N, fg, fell = edge_field(a, args, (oy, y1, ox, x1))
    Nu = up(N, args.up)
    cut = cut_mask(Nu.shape, ox, oy, args.up, box, poly)
    cs = contours(Nu, cut, args.up, ox, oy)
    if not cs: print('nothing found in the cut: check the box, the threshold (--th) or the background colour'); sys.exit(1)
    main = cs[0][1]
    pieces = [main]
    if args.holes:   # the windows: the other contours whose middle is inside the main one
        pth = measure.points_in_poly
        pieces += [P for A, P in cs[1:] if A > args.min_area and pth([P.mean(0)], main)[0]]
    if args.all: pieces = [P for A, P in cs if A > args.min_area]
    out, simp = [], []
    for P in pieces:
        Q = simplify(P, args.tol); simp.append(Q)
        dmax, drms = deviation(P, Q)
        out.append({'pts': [[fmt(v, args.dp) for v in to_model(M, x, r)] for x, r in Q], 'n': len(Q), 'dmax_px': round(dmax, 3), 'rms_px': round(drms, 3)})
    png = overlay(im, box, simp, poly, args.png or (args.img.rsplit('.', 1)[0] + '_trace.png'), args.zoom)
    if args.json:
        print(json.dumps(out if (args.holes or args.all) else out[0]['pts'], separators=(',', ':')))
    else:
        for i, o in enumerate(out):
            tag = 'outline' if i == 0 else ('hole' if args.holes else 'piece') + ' ' + str(i)
            print(f'{tag}: {o["n"]} points, furthest from the photo\'s edge {o["dmax_px"]} px ({o["dmax_px"] * M["s"]:.2g} units), rms {o["rms_px"]} px')
            print(json.dumps(o['pts'], separators=(',', ':')))
        print(f'edge band refined: {100 * (1 - fell):.0f}% (the rest had too little contrast and kept the coarse edge)')
        print('overlay:', png)


def cmd_lathe(args):
    """A round part seen side-on: how far its edges stand from its axis, line by line -> its radius along the axis.
    The axis runs along the photo's x (a barrel, a tube) or, with --vertical, up it (a turret cap, a knob)."""
    M = load_map(args.map); im = load_img(args.img, M); a = np.asarray(im).astype(np.float32)
    box, poly = region(args, M, im.size)
    m = args.band * 2 + 6
    ox, oy = max(0, int(box[0]) - m), max(0, int(box[1]) - m)
    x1, y1 = min(im.width, int(math.ceil(box[2])) + m + 1), min(im.height, int(math.ceil(box[3])) + m + 1)
    N, fg, fell = edge_field(a, args, (oy, y1, ox, x1))
    if poly or args.box or args.gbox: N = N * cut_mask(N.shape, ox, oy, 1, box, poly)
    V = args.vertical
    # A[:, i] is one scan line across the axis: a photo column (horizontal axis) or a photo row (vertical axis)
    A, o_along, o_across, lo, hi = (N.T, oy, ox, box[1], box[3]) if V else (N, ox, oy, box[0], box[2])
    auto = args.axis == 'auto'
    if auto: axis = (box[0] + box[2]) / 2 if V else (box[1] + box[3]) / 2
    elif args.axis[0] in 'yz': v = float(args.axis[1:]); axis = to_px(M, v, 0)[0] if V else to_px(M, 0, v)[1]
    else: axis = float(args.axis)
    across = np.arange(A.shape[0]) + o_across
    def crossing(seq, rr):   # the first rise through 0.5 walking in toward the axis, between pixels
        for j in range(1, len(seq)):
            if seq[j - 1] < 0.5 <= seq[j]: return rr[j - 1] + (0.5 - seq[j - 1]) / (seq[j] - seq[j - 1]) * (rr[j] - rr[j - 1])
        return None
    def edges(axis):
        out = []
        for v in np.arange(math.ceil(lo), math.floor(hi) + 1e-9, args.step):
            vi = v - o_along; i0 = int(math.floor(vi)); t = vi - i0
            if i0 < 0 or i0 + 1 >= A.shape[1]: continue
            line = A[:, i0] * (1 - t) + A[:, i0 + 1] * t
            before = across <= axis; after = across >= axis
            out.append((v, crossing(line[before], across[before]), crossing(line[after][::-1], across[after][::-1])))
        return out
    E = edges(axis)
    if auto:   # the axis is halfway between the two edges, wherever both were found
        mids = [(p + q) / 2 for _, p, q in E if p is not None and q is not None]
        if not mids: print('no line has both edges: give --axis'); sys.exit(1)
        axis = float(np.median(mids)); E = edges(axis)
        print(f'axis found at {"column" if V else "row"} {axis:.2f} ({"z" if V else "y"} {(to_model(M, axis, 0)[0] if V else to_model(M, 0, axis)[1]):.{args.dp}f})')
    res, asym = [], []
    for v, p, q in E:
        ra = axis - p if p is not None else None; rb = q - axis if q is not None else None
        if args.side == 'top': r = ra
        elif args.side == 'bottom': r = rb
        else:
            r = (ra + rb) / 2 if ra is not None and rb is not None else None
            if r is not None: asym.append(abs(ra - rb))
        if r is not None: res.append((v, r))
    if not res: print('no edge found: check --axis and the box'); sys.exit(1)
    P = np.array(res); Q = measure.approximate_polygon(P, tolerance=args.tol)
    pos = (lambda v: to_model(M, 0, v)[1]) if V else (lambda v: to_model(M, v, 0)[0])
    pts = [[fmt(r * M['s'], args.dp), fmt(pos(v), args.dp)] for v, r in Q]
    if args.json: print(json.dumps(pts, separators=(',', ':'))); return
    print(f'{len(pts)} [r, {"y" if V else "z"}] points over {len(P)} lines' + (f'; the two edges differ by {np.mean(asym):.2f} px on average (max {np.max(asym):.2f}): a big gap means the axis is off, or the part isn\'t round there' if asym else ''))
    print(json.dumps(pts, separators=(',', ':')))
    if V: poly_px = [(axis - r, v) for v, r in Q] + [(axis + r, v) for v, r in Q[::-1]]
    else: poly_px = [(v, axis - r) for v, r in Q] + [(v, axis + r) for v, r in Q[::-1]]
    print('overlay:', overlay(im, box, [poly_px], poly, args.png or (args.img.rsplit('.', 1)[0] + '_lathe.png'), args.zoom))


def cmd_circle(args):
    """A round feature, from its edges (it needn't stand against the background: a cap on a dark body works too)."""
    M = load_map(args.map); im = load_img(args.img, M)
    box, poly = region(args, M, im.size)
    x0, y0, x1, y1 = int(box[0]), int(box[1]), int(math.ceil(box[2])), int(math.ceil(box[3]))
    g = np.asarray(im.convert('L')).astype(float)[y0:y1, x0:x1]
    E = feature.canny(g, sigma=args.sigma, low_threshold=args.low, high_threshold=args.high)
    if poly:
        pm = Image.new('L', (x1 - x0, y1 - y0), 0); ImageDraw.Draw(pm).polygon([(x - x0, r - y0) for x, r in poly], fill=1); E &= np.asarray(pm).astype(bool)
    rr, cc = np.nonzero(E)
    if len(rr) < 8: print('too few edge pixels: widen the box or lower --low/--high'); sys.exit(1)
    pts = np.stack([cc + x0, rr + y0], 1).astype(float)
    rmin, rmax = args.rmin or 0, args.rmax or 1e9
    def ok(m, *_):
        c, r = (m.center, m.radius) if hasattr(m, 'center') else (m.params[:2], m.params[2])
        return rmin <= r <= rmax
    model, inl = measure.ransac(pts, measure.CircleModel, min_samples=3, residual_threshold=args.resid, max_trials=6000, rng=1, is_model_valid=ok)
    if model is None: print('no circle within those radii'); sys.exit(1)
    (xc, yc), R = (model.center, model.radius) if hasattr(model, 'center') else (model.params[:2], model.params[2])
    z, y = to_model(M, xc, yc)
    res = np.abs(np.hypot(*(pts[inl] - [xc, yc]).T) - R)
    print(f'centre ({xc:.2f}, {yc:.2f}) px, radius {R:.2f} px  ->  z {z:.{args.dp}f}, y {y:.{args.dp}f}, r {R * M["s"]:.{args.dp}f}')
    print(f'{inl.sum()} of {len(pts)} edge pixels on it, rms off it {np.sqrt((res ** 2).mean()):.2f} px')
    ang = np.linspace(0, 2 * np.pi, 64, endpoint=False)
    print('overlay:', overlay(im, box, [[(xc + R * math.cos(t), yc + R * math.sin(t)) for t in ang]], poly, args.png or (args.img.rsplit('.', 1)[0] + '_circle.png'), args.zoom))


def cmd_check(args):
    M = load_map(args.map); im = load_img(args.img, M)
    src = args.polys
    data = json.load(open(src)) if not src.strip().startswith('[') else json.loads(src)
    if data and isinstance(data[0][0], (int, float)): data = [data]
    polys = [[to_px(M, z, y) for z, y in P] for P in data]
    xs = [x for P in polys for x, _ in P]; rs = [r for P in polys for _, r in P]
    box = [min(xs), min(rs), max(xs), max(rs)] if not args.box else [float(v) for v in args.box.split(',')]
    print('overlay:', overlay(im, box, polys, None, args.png or (args.img.rsplit('.', 1)[0] + '_check.png'), args.zoom))


def cmd_grid(args):
    im = load_img(args.img, load_map(args.map) if args.map else None); a = np.asarray(im).astype(float)
    bg = bg_colour(a, args.bg); fgm = np.sqrt(((a - bg) ** 2).sum(-1)) > args.th
    ys, xs = np.nonzero(fgm)
    if len(xs): print(f'part spans x {xs.min()}..{xs.max()}, rows {ys.min()}..{ys.max()} (pixels {args.th:g}+ off the background {bg.round(0).tolist()})')
    x0, y0, x1, y1 = [int(v) for v in args.crop.split(',')] if args.crop else (0, 0, im.width, im.height)
    c = im.crop((x0, y0, x1, y1)); z = args.zoom
    c = c.resize((c.width * z, c.height * z), Image.BICUBIC) if z > 1 else c
    d = ImageDraw.Draw(c); st = args.step
    for x in range((x0 // st) * st, x1 + 1, st):
        if x < x0: continue
        X = (x - x0) * z; major = x % (st * 2) == 0
        d.line([(X, 0), (X, c.height)], fill=(0, 140, 255) if major else (170, 210, 255), width=1)
        if major: d.text((X + 2, 2), str(x), fill=(220, 0, 0))
    for r in range((y0 // st) * st, y1 + 1, st):
        if r < y0: continue
        Y = (r - y0) * z; major = r % (st * 2) == 0
        d.line([(0, Y), (c.width, Y)], fill=(0, 140, 255) if major else (170, 210, 255), width=1)
        if major: d.text((2, Y + 2), str(r), fill=(220, 0, 0))
    out = args.png or (args.img.rsplit('.', 1)[0] + '_grid.png'); c.save(out); print('grid:', out)


def cmd_map(args):
    (xa, za), (xb, zb) = parse_pts(args.pts) if args.pts else ((None, None), (None, None))
    if args.pts: s = abs((zb - za) / (xb - xa)); d = 1 if (zb - za) * (xb - xa) > 0 else -1
    else:
        xa, xb, L = [float(v) for v in args.len.split(',')]; s = abs(L / (xb - xa)); d = args.dir; za = args.zm
    r, y = [float(v) for v in args.row.split(',')]
    M = {'xm': xa, 'zm': za, 'yb': r, 'gy': y, 's': s, 'dir': d}
    if args.rot: M['rot'] = args.rot
    print(json.dumps({k: (round(v, 9) if isinstance(v, float) else v) for k, v in M.items()}))


def cmd_compare(args):
    ref = Image.open(args.ref).convert('RGB'); ren = Image.open(args.render).convert('RGB').resize(ref.size)
    if args.crop: c = tuple(int(v) for v in args.crop.split(',')); ref = ref.crop(c); ren = ren.crop(c)
    ov = Image.blend(ref, ren, 0.5); W, H = ref.size
    out = Image.new('RGB', (W, H * 3), 'white'); out.paste(ref, (0, 0)); out.paste(ren, (0, H)); out.paste(ov, (0, 2 * H))
    if W > 1400: out = out.resize((1400, int(H * 3 * 1400 / W)))
    out.save(args.out); print('compare:', args.out)


# ---------------------------------------------------------------------------------------------------- the other views
# The side photo fixes the profile; every other photo (3/4, front, rear, top, underneath) is matched by fitting a
# camera to it. The model's own triangles go through a pinhole camera, its silhouette is laid over the photo's, and the
# camera moves until the two agree as closely as they can. Whatever still disagrees is then the model's error, shown
# part by part: red where the photo has material the model lacks, blue where the model has material the photo doesn't.

def load_mesh(path):
    """Triangles (N, 3, 3) in model units, each one's part index, the part names, and their colours (if given). OBJ
    (o/g lines name the parts) or JSON {"parts": {name: [x,y,z, x,y,z, x,y,z, ...]}, "colors": {name: "#rrggbb"}}."""
    cols = {}
    if path.lower().endswith('.obj'):
        V, T, names, cur = [], [], [], 'mesh'
        for line in open(path):
            w = line.split()
            if not w: continue
            if w[0] == 'v': V.append([float(c) for c in w[1:4]])
            elif w[0] in ('o', 'g') and len(w) > 1: cur = ' '.join(w[1:])
            elif w[0] == 'f':
                idx = [int(c.split('/')[0]) for c in w[1:]]; idx = [i - 1 if i > 0 else len(V) + i for i in idx]
                for k in range(1, len(idx) - 1): T.append([V[idx[0]], V[idx[k]], V[idx[k + 1]]]); names.append(cur)
        tris = np.array(T, float)
    else:
        d = json.load(open(path)); parts = d['parts'] if isinstance(d, dict) else {'mesh': d}; cols = d.get('colors', {}) if isinstance(d, dict) else {}
        tris, names = [], []
        for k, a in parts.items():
            a = np.asarray(a, float).reshape(-1, 3, 3); tris.append(a); names += [k] * len(a)
        tris = np.concatenate(tris)
    keys = list(dict.fromkeys(names)); pid = np.array([keys.index(n) for n in names])
    return tris, pid, keys, cols


def cam_project(cam, P):
    """Model points (N, 3) to photo pixels (N, 2) and their depth in front of the camera. A mirrored camera sees the
    model flipped left to right (x -> -x), for photos printed the wrong way round."""
    P = np.asarray(P, float).reshape(-1, 3)
    if cam.get('mirror'): P = P * [-1, 1, 1]
    X = P @ np.asarray(cam['R']).T + np.asarray(cam['t'])
    z = X[:, 2]
    return np.stack([cam['w'] / 2 + cam['f'] * X[:, 0] / z, cam['h'] / 2 + cam['f'] * X[:, 1] / z], 1), z


def cam_ray(cam, u, v):
    """The ray through photo pixel (u, v): its origin (the camera) and direction, in model units."""
    R = np.asarray(cam['R']); t = np.asarray(cam['t']); C = -R.T @ t
    d = R.T @ np.array([(u - cam['w'] / 2) / cam['f'], (v - cam['h'] / 2) / cam['f'], 1.0]); d /= np.linalg.norm(d)
    if cam.get('mirror'): C = C * [-1, 1, 1]; d = d * [-1, 1, 1]
    return C, d


def look_cam(w, h, fov, centre, az, el, dist, roll=0.0, mirror=False):
    """A camera dist from centre, looking at it from azimuth az (from +z towards +x) and elevation el, in degrees."""
    a, e = math.radians(az), math.radians(el)
    d = np.array([math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a)])
    C = np.asarray(centre, float) + d * dist; zc = -d
    up = np.array([0.0, 1.0, 0.0]) if abs(zc[1]) < 0.995 else np.array([0.0, 0.0, -1.0])
    xc = np.cross(zc, up); xc /= np.linalg.norm(xc); yc = np.cross(zc, xc)
    R = np.stack([xc, yc, zc]); r = math.radians(roll)
    R = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]]) @ R
    return {'w': w, 'h': h, 'f': (h / 2) / math.tan(math.radians(fov) / 2), 'R': R.tolist(), 't': (-R @ C).tolist(), 'mirror': bool(mirror)}


def cam_info(cam, centre):
    """The camera spelled out for a renderer: where it is, what it looks at, which way is up, its vertical field of view."""
    R = np.asarray(cam['R']); C = -R.T @ np.asarray(cam['t']); fwd = R[2]; up = -R[1]
    dist = float(np.dot(np.asarray(centre) * ([-1, 1, 1] if cam.get('mirror') else 1) - C, fwd))
    tgt = C + fwd * dist
    if cam.get('mirror'): C, tgt, up = C * [-1, 1, 1], tgt * [-1, 1, 1], up * [-1, 1, 1]
    fov = math.degrees(2 * math.atan(cam['h'] / 2 / cam['f']))
    return {'position': [round(float(v), 6) for v in C], 'target': [round(float(v), 6) for v in tgt], 'up': [round(float(v), 6) for v in up], 'fov_y': round(fov, 4), 'aspect': round(cam['w'] / cam['h'], 6)}


def raster(cam, tris, scale=1.0, mode='sil', pid=None, colours=None):
    """Draw the triangles from the camera, scale x the photo's size. mode 'sil': the silhouette (bool); 'label': the
    front-most part at each pixel (-1 for none); 'shade': a flat-lit grey render (RGB), far triangles first."""
    W, H = max(1, round(cam['w'] * scale)), max(1, round(cam['h'] * scale))
    uv, z = cam_project(cam, tris.reshape(-1, 3)); uv = (uv * scale).reshape(-1, 3, 2); z = z.reshape(-1, 3)
    ok = (z > 1e-9).all(1)
    if mode == 'sil':
        im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im)
        for T in uv[ok]: d.polygon([(T[0, 0], T[0, 1]), (T[1, 0], T[1, 1]), (T[2, 0], T[2, 1])], fill=255)
        return np.asarray(im) > 0
    order = np.argsort(-z.mean(1)); order = order[ok[order]]
    if mode == 'label':
        im = Image.new('I', (W, H), 0); d = ImageDraw.Draw(im)
        for i in order: T = uv[i]; d.polygon([(T[0, 0], T[0, 1]), (T[1, 0], T[1, 1]), (T[2, 0], T[2, 1])], fill=int(pid[i]) + 1)
        return np.asarray(im).astype(np.int32) - 1
    # shade: Lambert from over the camera's left shoulder, both faces lit, each part in its own colour (or grey)
    P = tris * ([-1, 1, 1] if cam.get('mirror') else 1); Rm = np.asarray(cam['R'])
    Xc = P.reshape(-1, 3) @ Rm.T + np.asarray(cam['t']); Xc = Xc.reshape(-1, 3, 3)
    n = np.cross(Xc[:, 1] - Xc[:, 0], Xc[:, 2] - Xc[:, 0]); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    toward = -Xc.mean(1); n *= np.sign((n * toward).sum(1, keepdims=True) + 1e-12)
    L = np.array([-0.45, -0.65, -0.6]); L /= np.linalg.norm(L)
    lit = 0.38 + 0.62 * np.clip(n @ L, 0, 1)
    im = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(im)
    for i in order:
        base = colours[pid[i]] if colours is not None else (150, 152, 158)
        c = tuple(int(min(255, (60 + 0.75 * v) * lit[i])) for v in base); T = uv[i]   # lifted, so dark finishes still show their shape
        d.polygon([(T[0, 0], T[0, 1]), (T[1, 0], T[1, 1]), (T[2, 0], T[2, 1])], fill=c, outline=c)
    return np.asarray(im)


def part_colours(keys, cols):
    out = []
    for k in keys:
        c = cols.get(k)
        if c: c = c.lstrip('#'); out.append(tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)))
        else: out.append((150, 152, 158))
    return out


def parse_ignore(s, W, H, scale=1.0):
    """Regions to leave out of the score (parts the photo's copy has and the model shouldn't, a hand, a stand):
    polygons in photo pixels, "x,y;x,y;...|x,y;..."."""
    m = Image.new('L', (W, H), 0)
    if s:
        d = ImageDraw.Draw(m)
        for poly in s.split('|'): d.polygon([(x * scale, y * scale) for x, y in parse_pts(poly)], fill=1)
    return np.asarray(m).astype(bool)


def photo_part(args, im):
    """The photo's silhouette of the part: a mask you made (black on white), or the background test (largest piece)."""
    if args.mask: return np.asarray(Image.open(args.mask).convert('L').resize(im.size)) < 128
    fg, _ = coarse_fg(np.asarray(im).astype(np.float32), args)
    lab = measure.label(fg)
    if lab.max() > 1 and not args.all_pieces:
        sizes = np.bincount(lab.ravel()); sizes[0] = 0; fg = lab == sizes.argmax()
    return fg


def shrink(mask, scale):
    if scale == 1: return mask
    W, H = max(1, round(mask.shape[1] * scale)), max(1, round(mask.shape[0] * scale))
    return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((W, H), Image.BOX)) > 127


def iou(a, b, valid):
    i = (a & b & valid).sum(); u = ((a | b) & valid).sum()
    return i / max(1, u)


def parse_corr(s):
    """Point pairs "u,v=x,y,z;...": a photo pixel and the model point it shows."""
    uv, X = [], []
    for item in s.replace(' ', '').split(';'):
        if not item: continue
        a, b = item.split('='); uv.append([float(v) for v in a.split(',')]); X.append([float(v) for v in b.split(',')])
    return np.array(uv), np.array(X)


def cmd_pose(args):
    """Fit a camera to a photo taken from any angle, so the model can be laid over it: from the model's silhouette
    (--mesh), from point pairs you read off the photo (--pts), or both."""
    from scipy.optimize import minimize, least_squares
    from scipy.spatial.transform import Rotation
    im = load_img(args.img); w, h = im.size
    if not args.mesh and not args.pts: print('give --mesh, --pts or both'); sys.exit(1)
    tris = pid = None
    if args.mesh:
        tris, pid, keys, cols = load_mesh(args.mesh); V = tris.reshape(-1, 3)
    uvp, Xp = parse_corr(args.pts) if args.pts else (None, None)
    pts_all = V if args.mesh else Xp
    lo, hi = pts_all.min(0), pts_all.max(0); centre = (lo + hi) / 2; size = float(np.linalg.norm(hi - lo))
    fg = photo_part(args, im) if args.mesh else None
    sc = min(1.0, args.work / max(w, h))
    fgs = shrink(fg, sc) if fg is not None else None
    ign = parse_ignore(args.ignore, round(w * sc), round(h * sc), sc) if args.mesh else None
    valid = ~ign if ign is not None else None
    fov0 = args.fov or 20.0; fixf = args.fov is not None
    mirrors = {'no': [False], 'yes': [True], 'both': [False, True]}[args.mirror]

    def to_cam(x, mirror, f=None):
        R = Rotation.from_rotvec(x[:3]).as_matrix()
        return {'w': w, 'h': h, 'f': f if f is not None else float(math.exp(x[6])), 'R': R.tolist(), 't': list(map(float, x[3:6])), 'mirror': mirror}

    def from_cam(cam):
        return np.r_[Rotation.from_matrix(np.asarray(cam['R'])).as_rotvec(), cam['t'], math.log(cam['f'])]

    def pts_err(cam):
        if uvp is None: return 0.0
        q, z = cam_project(cam, Xp)
        return float(np.sqrt(((q - uvp) ** 2).sum(1).mean())) if (z > 0).all() else 1e6

    def cost(x, mirror, scale, valid_, fgs_):
        cam = to_cam(x, mirror, math.exp(x[6]) if not fixf else (h / 2) / math.tan(math.radians(fov0) / 2))
        fov = 2 * math.degrees(math.atan(h / 2 / cam['f']))
        pen = 0.0 if 2 <= fov <= 80 else 1.0
        c = pen
        if tris is not None:
            m = raster(cam, tris, scale)
            if m.shape != fgs_.shape: return 2.0
            c += 1 - iou(m, fgs_, valid_)
        if uvp is not None: c += args.pts_weight * pts_err(cam) / math.hypot(w, h)
        return c

    def align(cam, mirror):
        """Dolly and slide a camera so the model's silhouette has the photo's size and sits where the photo's does."""
        if tris is None: return cam
        cy, cx = np.argwhere(fgs).mean(0); area_p = fgs.sum()
        for _ in range(3):
            m = raster(cam, tris, sc)
            if not m.any(): return cam
            my, mx = np.argwhere(m).mean(0); k = math.sqrt(m.sum() / max(1, area_p))
            t = np.asarray(cam['t'], float); t[2] *= k
            t[0] += (cx - mx) / sc * t[2] / cam['f']; t[1] += (cy - my) / sc * t[2] / cam['f']
            cam['t'] = t.tolist()
        return cam

    # 1. where from: every direction round the model (and its mirror image), each slid to match, scored
    cands = []
    if args.init:
        c0 = json.load(open(args.init)); c0['w'], c0['h'] = w, h; cands.append((cost(from_cam(c0), c0.get('mirror', False), sc, valid, fgs) if tris is not None else 0, c0))
    else:
        az0, az1 = [float(v) for v in args.az.split(',')]; el0, el1 = [float(v) for v in args.el.split(',')]
        dist = size / (2 * math.tan(math.radians(fov0) / 2)) * 1.3
        for mirror in mirrors:
            for az in np.arange(az0, az1, args.az_step):
                for el in np.arange(el0, el1 + 1e-9, args.el_step):
                    cam = align(look_cam(w, h, fov0, centre * ([-1, 1, 1] if mirror else 1), az, el, dist, 0, mirror), mirror)
                    x = from_cam(cam)
                    if tris is not None: c = cost(x, mirror, sc, valid, fgs)
                    else:   # points only: solve from here and keep the best
                        r = least_squares(lambda y: (cam_project(to_cam(y, mirror), Xp)[0] - uvp).ravel(), x, method='lm' if len(Xp) * 2 >= 7 else 'trf')
                        cam = to_cam(r.x, mirror); c = pts_err(cam)
                    cands.append((c, cam))
    cands.sort(key=lambda t: t[0])
    # 2. refine the best few: rotation, position and focal length together, first at the working size, then full size
    def refine(cam, scale, valid_, fgs_, steps, fev):
        mirror = cam.get('mirror', False); x0 = from_cam(cam)
        dist = abs(x0[5])
        st = np.array([steps[0]] * 3 + [steps[1] * dist] * 2 + [steps[2] * dist, steps[3]])
        if fixf: st[6] = 1e-9
        sim = np.vstack([x0] + [x0 + np.eye(7)[i] * st[i] for i in range(7)])
        r = minimize(cost, x0, args=(mirror, scale, valid_, fgs_), method='Nelder-Mead', options={'initial_simplex': sim, 'maxfev': fev, 'xatol': 1e-7, 'fatol': 1e-6})
        return r.fun, to_cam(r.x, mirror, None if not fixf else (h / 2) / math.tan(math.radians(fov0) / 2))
    best = []
    for c, cam in cands[:args.keep]:
        f1, cam1 = refine(cam, sc, valid, fgs, (0.06, 0.03, 0.08, 0.15), args.iters)
        f1, cam1 = refine(cam1, sc, valid, fgs, (0.015, 0.008, 0.02, 0.04), args.iters // 2)
        best.append((f1, cam1))
    best.sort(key=lambda t: t[0]); fbest, cam = best[0]
    if tris is not None and sc < 1:   # polish at full size
        ignf = parse_ignore(args.ignore, w, h); fbest, cam = refine(cam, 1.0, ~ignf, fg, (0.004, 0.002, 0.005, 0.01), args.iters // 2)
    cam = {k: cam[k] for k in ('w', 'h', 'f', 'R', 't', 'mirror')}
    cam['info'] = cam_info(cam, centre)
    if tris is not None:
        m = raster(cam, tris, 1.0); ignf = parse_ignore(args.ignore, w, h); cam['iou'] = round(float(iou(m, fg, ~ignf)), 4)
    if uvp is not None: cam['pts_rms_px'] = round(pts_err(cam), 3)
    out = args.out or (args.img.rsplit('.', 1)[0] + '_cam.json'); json.dump(cam, open(out, 'w'), indent=1)
    I = cam['info']
    print(f'camera: {out}')
    if 'iou' in cam: print(f'silhouette overlap (IoU) {cam["iou"]:.4f}' + (' with the model mirrored left to right: the photo is probably flipped' if cam['mirror'] else ''))
    if 'pts_rms_px' in cam: print(f'point pairs off by {cam["pts_rms_px"]} px rms')
    if len(mirrors) == 2 and tris is not None:
        other = [f for f, c in best if c.get('mirror') != cam['mirror']]
        if other: print(f'  (best the other way round: {1 - other[0]:.4f} at the working size)')
    print(f'fov_y {I["fov_y"]} deg, aspect {I["aspect"]}; position {I["position"]}, looking at {I["target"]}, up {I["up"]}')
    print(f'three.js: cam = new THREE.PerspectiveCamera({I["fov_y"]}, {w} / {h}, near, far); cam.position.set({", ".join(map(str, I["position"]))}); '
          f'cam.up.set({", ".join(map(str, I["up"]))}); cam.lookAt({", ".join(map(str, I["target"]))});' + ('  // and the model scaled (-1, 1, 1)' if cam['mirror'] else ''))
    if tris is not None: print('next: trace.py diff', args.img, args.mesh, out)


def cmd_diff(args):
    """Lay the model over a photo through its fitted camera: where they disagree, and which parts are to blame."""
    im = load_img(args.img); w, h = im.size
    cam = json.load(open(args.cam)); cam['w'], cam['h'] = w, h
    tris, pid, keys, cols = load_mesh(args.mesh)
    fg = photo_part(args, im); ign = parse_ignore(args.ignore, w, h); valid = ~ign
    ss = args.ss
    sil = shrink(raster(cam, tris, ss), 1 / ss) if ss > 1 else raster(cam, tris, 1.0)
    lab = raster(cam, tris, 1.0, 'label', pid)
    shade = raster(cam, tris, ss, 'shade', pid, part_colours(keys, cols))
    if ss > 1: shade = np.asarray(Image.fromarray(shade).resize((w, h), Image.LANCZOS))
    extra = sil & ~fg & valid; miss = fg & ~sil & valid
    k = args.tol
    extra_c = ndi.binary_opening(extra, iterations=k) if k else extra; miss_c = ndi.binary_opening(miss, iterations=k) if k else miss
    I = iou(sil, fg, valid)
    print(f'IoU {I:.4f}; the model covers {extra.sum()} px the photo doesn\'t (blue), and misses {miss.sum()} px the photo has (red); '
          f'{extra_c.sum()} and {miss_c.sum()} of them more than {k} px from the edge')
    # which parts the disagreement belongs to
    labf = lab.copy(); labf[labf < 0] = -1
    if (labf >= 0).any():
        _, (iy, ix) = ndi.distance_transform_edt(labf < 0, return_indices=True); near = labf[iy, ix]
    else: near = labf
    def blame(region):
        ids, n = np.unique(near[region], return_counts=True); o = np.argsort(-n)
        return [(keys[ids[j]], int(n[j])) for j in o[:3] if ids[j] >= 0]
    V = tris.reshape(-1, 3)
    def bbox_of(name):
        sel = tris[pid == keys.index(name)].reshape(-1, 3); lo, hi = sel.min(0), sel.max(0)
        return '[' + ', '.join(f'{a:.4g}..{b:.4g}' for a, b in zip(lo, hi)) + ']'
    for tag, reg in (('blue (model has, photo hasn\'t)', extra_c), ('red (photo has, model hasn\'t)', miss_c)):
        L, nl = ndi.label(reg)
        if not nl: print(f'{tag}: none'); continue
        sizes = ndi.sum(reg, L, range(1, nl + 1)); order = np.argsort(-sizes)[:args.top]
        print(f'{tag}: {nl} patches, the biggest:')
        for j in order:
            ys, xs = np.nonzero(L == j + 1)
            print(f'  {int(sizes[j]):6d} px at x {xs.min()}..{xs.max()}, y {ys.min()}..{ys.max()} (centre {xs.mean():.0f}, {ys.mean():.0f}); parts: '
                  + ', '.join(f'{n} ({c} px)' for n, c in blame(L == j + 1)))
    if args.parts:
        print('parts (model x, y, z ranges):'); seen = set()
        for reg in (extra_c, miss_c):
            for n, _ in blame(reg):
                if n not in seen: seen.add(n); print(f'  {n}: {bbox_of(n)}')
    # the picture: the photo, the model from the same camera, the disagreement, the two blended
    ph = np.asarray(im).astype(np.float32)
    dif = 255 - (255 - ph) * 0.35
    dif[miss] = [235, 40, 40]; dif[extra] = [40, 90, 235]
    if ign.any(): dif[ign] = dif[ign] * 0.6 + np.array([255, 220, 0]) * 0.4
    dimg = Image.fromarray(dif.astype(np.uint8)); dd = ImageDraw.Draw(dimg)
    for c in measure.find_contours(fg.astype(float), 0.5): dd.line([(p[1], p[0]) for p in c], fill=(0, 190, 255), width=1)
    for c in measure.find_contours(sil.astype(float), 0.5): dd.line([(p[1], p[0]) for p in c], fill=(255, 0, 200), width=1)
    ren = Image.fromarray(shade.astype(np.uint8)); blend = Image.blend(im.convert('RGB'), ren, 0.5)
    panels = [im.convert('RGB'), ren, dimg, blend]
    if args.crop:
        c = tuple(int(v) for v in args.crop.split(',')); panels = [p.crop(c) for p in panels]
    pw, phh = panels[0].size; z = args.zoom if args.zoom else max(1, min(4, 900 // max(pw, phh)))
    panels = [p.resize((pw * z, phh * z), Image.LANCZOS) for p in panels]
    out = Image.new('RGB', (pw * z * 2 + 8, phh * z * 2 + 8), 'white')
    for i, p in enumerate(panels): out.paste(p, ((i % 2) * (pw * z + 8), (i // 2) * (phh * z + 8)))
    path = args.png or (args.img.rsplit('.', 1)[0] + '_diff.png'); out.save(path)
    print('picture (photo | model, same camera / red: missing, blue: extra, cyan: photo\'s edge, magenta: model\'s | blended):', path)


def cmd_ray(args):
    """Read model coordinates off a photo taken from any angle: the ray through a pixel, through the photo's fitted
    camera, meets a plane you name (x=0.012, y=..., z=...) or the model's surface (--mesh); or, with the same feature picked
    in a second photo (--cam2, --px2), where the two rays cross: its true position, nothing assumed. Two: the distance."""
    cam = json.load(open(args.cam))
    if args.img: w, h = Image.open(args.img).size; cam['w'], cam['h'] = w, h
    if args.cam2:   # the same features picked in a second photo: where the two rays pass closest is the point itself
        cam2 = json.load(open(args.cam2)); A, B = parse_pts(args.px), parse_pts(args.px2)
        if len(A) != len(B): print('give as many --px2 pixels as --px'); sys.exit(1)
        res = []
        for (u, v), (u2, v2) in zip(A, B):
            C1, d1 = cam_ray(cam, u, v); C2, d2 = cam_ray(cam2, u2, v2); w0 = C1 - C2
            a, b, c, d, e = d1 @ d1, d1 @ d2, d2 @ d2, d1 @ w0, d2 @ w0; den = a * c - b * b
            if abs(den) < 1e-12: print(f'({u:g}, {v:g}): the two rays are parallel'); continue
            s1, s2 = (b * e - c * d) / den, (a * e - b * d) / den; P1, P2 = C1 + s1 * d1, C2 + s2 * d2; P = (P1 + P2) / 2
            # how far apart the rays pass, and what that is in pixels in the first photo: big means the two picks
            # aren't the same feature (or a camera is off)
            gap = np.linalg.norm(P1 - P2); px = gap * cam['f'] / max(1e-9, s1)
            res.append(P); print(f'({u:g}, {v:g}) + ({u2:g}, {v2:g}) -> x {P[0]:.{args.dp}f}, y {P[1]:.{args.dp}f}, z {P[2]:.{args.dp}f}  (rays {gap:.2g} apart, {px:.1f} px)')
        if len(res) == 2: print(f'distance {np.linalg.norm(res[1] - res[0]):.{args.dp}f}')
        return
    if args.mesh: tris, pid, keys, _ = load_mesh(args.mesh)
    res = []
    for u, v in parse_pts(args.px):
        C, d = cam_ray(cam, u, v)
        if args.plane:
            ax, val = args.plane.split('='); i = 'xyz'.index(ax.strip()); val = float(val)
            if abs(d[i]) < 1e-12: print(f'({u:g}, {v:g}): the ray runs along the plane'); continue
            s_ = (val - C[i]) / d[i]; P = C + s_ * d; what = f'on {args.plane}'
        else:   # first hit on the model (Moller-Trumbore, every triangle at once)
            A, B, Cc = tris[:, 0], tris[:, 1], tris[:, 2]; e1, e2 = B - A, Cc - A
            pv = np.cross(d, e2); det = (e1 * pv).sum(1); ok = np.abs(det) > 1e-15; inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
            tv = C - A; uu = (tv * pv).sum(1) * inv; qv = np.cross(tv, e1); vv = (qv * d).sum(1) * inv; tt = (e2 * qv).sum(1) * inv
            hit = ok & (uu >= 0) & (vv >= 0) & (uu + vv <= 1) & (tt > 0)
            if not hit.any(): print(f'({u:g}, {v:g}): misses the model'); continue
            j = np.argmin(np.where(hit, tt, np.inf)); P = C + tt[j] * d; what = f'on {keys[pid[j]]}'
        res.append(P); print(f'({u:g}, {v:g}) -> x {P[0]:.{args.dp}f}, y {P[1]:.{args.dp}f}, z {P[2]:.{args.dp}f}  {what}')
    if len(res) == 2: print(f'distance {np.linalg.norm(res[1] - res[0]):.{args.dp}f} (dx {res[1][0] - res[0][0]:.{args.dp}f}, dy {res[1][1] - res[0][1]:.{args.dp}f}, dz {res[1][2] - res[0][2]:.{args.dp}f})')


def part_transform(dofs, x, pivot):
    """The move a fit settles on: translations (tx, ty, tz) and scales about the pivot (s: all three, sxy: across a
    round part's z axis, sx, sy, sz), as a function on points."""
    v = dict(zip(dofs, x)); k = np.array([1.0, 1.0, 1.0])
    k *= math.exp(v.get('s', 0)); k[:2] *= math.exp(v.get('sxy', 0))
    for i, a in enumerate('xyz'): k[i] *= math.exp(v.get('s' + a, 0))
    t = np.array([v.get('tx', 0), v.get('ty', 0), v.get('tz', 0)])
    return lambda P: (P - pivot) * k + pivot + t, k, t


def cmd_fit(args):
    """Move and scale chosen parts until the model agrees with every photo at once (each through its fitted camera):
    which way a part is off, by how much, measured against all the views together."""
    from scipy.optimize import minimize
    import re
    tris, pid, keys, cols = load_mesh(args.mesh)
    rx = re.compile(args.parts); sel_parts = [i for i, k in enumerate(keys) if rx.search(k)]
    if not sel_parts: print('no part names match', args.parts); sys.exit(1)
    sel = np.isin(pid, sel_parts); mov, fix = tris[sel], tris[~sel]
    pivot = np.array([float(v) for v in args.pivot.split(',')]) if args.pivot else (mov.reshape(-1, 3).min(0) + mov.reshape(-1, 3).max(0)) / 2
    dofs = args.dof.split(',')
    for d in dofs:
        if d not in ('tx', 'ty', 'tz', 's', 'sxy', 'sx', 'sy', 'sz'): print('unknown dof', d); sys.exit(1)
    views = []
    for vw in args.view:
        img, camp = vw[0], vw[1]; ignore = vw[2] if len(vw) > 2 else None
        im = load_img(img); w, h = im.size; cam = json.load(open(camp)); cam['w'], cam['h'] = w, h
        sc = min(1.0, args.work / max(w, h))
        fg = shrink(photo_part(args, im), sc); valid = ~parse_ignore(ignore, fg.shape[1], fg.shape[0], sc)
        base = raster(cam, fix, sc)
        views.append(dict(name=img, cam=cam, sc=sc, fg=fg, valid=valid, base=base, area=max(1, (fg & valid).sum())))
    def score(x, per=False):
        f, _, _ = part_transform(dofs, x, pivot); m = f(mov.reshape(-1, 3)).reshape(mov.shape); out = []
        for V in views:
            sil = V['base'] | raster(V['cam'], m, V['sc'])
            out.append(((sil ^ V['fg']) & V['valid']).sum() / V['area'])
        return out if per else float(sum(out))
    x0 = np.zeros(len(dofs)); before = score(x0, True)
    size = float(np.linalg.norm(mov.reshape(-1, 3).max(0) - mov.reshape(-1, 3).min(0)))
    st = np.array([args.step * size if d.startswith('t') else 0.06 for d in dofs])
    best = None
    for trial in range(args.restarts):   # Nelder-Mead from a few starts: the score moves in whole pixels
        start = x0 if trial == 0 else x0 + (np.random.default_rng(trial).random(len(dofs)) - 0.5) * st * 2
        sim = np.vstack([start] + [start + np.eye(len(dofs))[i] * st[i] for i in range(len(dofs))])
        r = minimize(score, start, method='Nelder-Mead', options={'initial_simplex': sim, 'maxfev': args.iters, 'xatol': 1e-7, 'fatol': 1e-7})
        if best is None or r.fun < best.fun: best = r
    after = score(best.x, True)
    f, k, t = part_transform(dofs, best.x, pivot)
    names = [keys[i] for i in sel_parts]
    print(f'{len(names)} parts: {", ".join(names[:12])}{" ..." if len(names) > 12 else ""}')
    print(f'pivot {", ".join(f"{v:.5f}" for v in pivot)}')
    print('move: ' + ', '.join(f'{d} {v:+.5f}' if d.startswith('t') else f'{d} x{math.exp(v):.4f}' for d, v in zip(dofs, best.x)))
    print(f'  = translate ({t[0]:+.5f}, {t[1]:+.5f}, {t[2]:+.5f}), scale ({k[0]:.4f}, {k[1]:.4f}, {k[2]:.4f}) about the pivot')
    lo, hi = mov.reshape(-1, 3).min(0), mov.reshape(-1, 3).max(0); P = f(mov.reshape(-1, 3)); lo2, hi2 = P.min(0), P.max(0)
    print('extent before: ' + ', '.join(f'{a} {l:.5f}..{h_:.5f}' for a, l, h_ in zip('xyz', lo, hi)))
    print('extent after:  ' + ', '.join(f'{a} {l:.5f}..{h_:.5f}' for a, l, h_ in zip('xyz', lo2, hi2)))
    for V, b, a in zip(views, before, after):
        print(f'  {V["name"]}: disagreement {100 * b:.2f}% -> {100 * a:.2f}% of the photo\'s area')
    if args.out:
        T = tris.copy(); T[sel] = P.reshape(mov.shape)
        parts = {kk: T[pid == i].reshape(-1).round(6).tolist() for i, kk in enumerate(keys)}
        json.dump({'parts': parts, 'colors': cols}, open(args.out, 'w')); print('moved mesh:', args.out)


class QuietOut:
    """stdout that stops writing once the reader goes away (piped into head), so the command still finishes its work
    and writes its pictures"""
    def __init__(self, f): self.f, self.dead = f, False
    def write(self, x):
        if not self.dead:
            try: self.f.write(x)
            except BrokenPipeError: self.dead = True
        return len(x)
    def flush(self):
        if not self.dead:
            try: self.f.flush()
            except BrokenPipeError: self.dead = True


def main():
    sys.stdout = QuietOut(sys.stdout)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest='cmd', required=True)

    def edge_opts(q):
        q.add_argument('--th', type=float, default=60, help='colour distance from the background that counts as the part, for the coarse mask (default 60; raise it for a noisy or shadowed backdrop)')
        q.add_argument('--bg', help='background colour r,g,b (default: the median of the photo\'s border)')
        q.add_argument('--shadow', action='store_true', help='treat warm grey shadows on a white backdrop as background')
        q.add_argument('--color', help='numpy test on r,g,b,lum,sat,F that the part\'s pixels pass, e.g. "(r - g) > 40" for a red part')
        q.add_argument('--field', help='the value to find the edge in, if not colour distance from the background (e.g. "r - g" with --color for a red strip against a dark body)')
        q.add_argument('--band', type=int, default=3, help='how far either side of the coarse edge to refine, px (default 3)')
        q.add_argument('--min-contrast', dest='min_contrast', type=float, default=20, help='below this local contrast an edge keeps the coarse mask (default 20)')
        q.add_argument('--open', type=int, default=1, help='opening passes on the coarse mask, to drop specks (default 1)')
        q.add_argument('--close', type=int, default=1, help='closing passes on the coarse mask, to fill pinholes (default 1)')
        q.add_argument('--holes', action='store_true', help='keep pockets of background inside the part as holes (windows, a trigger guard\'s loop)')

    def region_opts(q):
        q.add_argument('--box', help='x0,y0,x1,y1 in photo pixels')
        q.add_argument('--gbox', help='z0,y0,z1,y1 in model units')
        q.add_argument('--poly', help='cut polygon in photo pixels: "x,y;x,y;..."')
        q.add_argument('--gpoly', help='cut polygon in model units: "z,y;z,y;..."')
        q.add_argument('--png', help='where to write the overlay')
        q.add_argument('--zoom', default='auto', type=lambda v: v if v == 'auto' else int(v))
        q.add_argument('--dp', type=int, default=5, help='decimals in the output (default 5)')
        q.add_argument('--json', action='store_true', help='print only the JSON')

    q = sp.add_parser('outline', help=cmd_outline.__doc__); q.add_argument('img'); q.add_argument('map'); region_opts(q); edge_opts(q)
    q.add_argument('--tol', type=float, default=0.3, help='how far the simplified outline may stray from the traced edge, px (default 0.3)')
    q.add_argument('--up', type=int, default=2, help='upsample the edge field by this before contouring (default 2)')
    q.add_argument('--all', action='store_true', help='every separate piece in the cut, not just the biggest')
    q.add_argument('--min-area', dest='min_area', type=float, default=20, help='ignore pieces and holes smaller than this, px² (default 20)')
    q.set_defaults(fn=cmd_outline)

    q = sp.add_parser('lathe', help=cmd_lathe.__doc__); q.add_argument('img'); q.add_argument('map'); region_opts(q); edge_opts(q)
    q.add_argument('--axis', default='auto', help='the axis: auto (halfway between the top and bottom edges), a photo row, or y<model y> (e.g. y0.0626)')
    q.add_argument('--vertical', action='store_true', help='the axis runs up the photo (a cap or knob seen side-on): --axis is then a column or z<model z>')
    q.add_argument('--side', choices=['top', 'bottom', 'both'], default='both', help='which edge to read: top (or left, --vertical), bottom (or right), or both averaged')
    q.add_argument('--step', type=float, default=1, help='column step, px (default 1)')
    q.add_argument('--tol', type=float, default=0.3); q.set_defaults(fn=cmd_lathe)

    q = sp.add_parser('circle', help=cmd_circle.__doc__); q.add_argument('img'); q.add_argument('map'); region_opts(q)
    q.add_argument('--sigma', type=float, default=2); q.add_argument('--low', type=float, default=None); q.add_argument('--high', type=float, default=None)
    q.add_argument('--resid', type=float, default=1.5, help='how far off the circle an edge pixel may be and still count, px')
    q.add_argument('--rmin', type=float, help='smallest radius to accept, px'); q.add_argument('--rmax', type=float, help='largest radius to accept, px'); q.set_defaults(fn=cmd_circle)

    q = sp.add_parser('check', help='draw model-space polygons back over the photo'); q.add_argument('img'); q.add_argument('map'); q.add_argument('polys', help='JSON: one [[z,y],...] or a list of them, inline or a file')
    q.add_argument('--box'); q.add_argument('--png'); q.add_argument('--zoom', default='auto', type=lambda v: v if v == 'auto' else int(v)); q.set_defaults(fn=cmd_check)

    q = sp.add_parser('grid', help='labelled pixel grid'); q.add_argument('img'); q.add_argument('--map'); q.add_argument('--crop', help='x0,y0,x1,y1')
    q.add_argument('--step', type=int, default=50); q.add_argument('--zoom', type=int, default=1); q.add_argument('--th', type=float, default=60); q.add_argument('--bg'); q.add_argument('--png'); q.set_defaults(fn=cmd_grid)

    q = sp.add_parser('map', help='work out the MAP'); q.add_argument('--pts', help='two points "x,z;x,z": photo x and the model z there')
    q.add_argument('--len', help='"xa,xb,L": the photo span xa..xb is L model units long (with --zm, --dir)')
    q.add_argument('--zm', type=float, default=0, help='model z at xa (with --len)'); q.add_argument('--dir', type=int, default=1)
    q.add_argument('--row', required=True, help='"row,y": a photo row and the model y there'); q.add_argument('--rot', type=float, default=0); q.set_defaults(fn=cmd_map)

    q = sp.add_parser('compare', help='reference over render'); q.add_argument('ref'); q.add_argument('render'); q.add_argument('out'); q.add_argument('--crop'); q.set_defaults(fn=cmd_compare)

    def photo_opts(q):
        q.add_argument('--mask', help='your own silhouette of the part (black on white, the photo\'s size) instead of the background test')
        q.add_argument('--th', type=float, default=40, help='colour distance from the background that counts as the part (default 40)')
        q.add_argument('--bg', help='background colour r,g,b (default: the median of the photo\'s border)')
        q.add_argument('--shadow', action='store_true', help='treat warm grey shadows on a white backdrop as background')
        q.add_argument('--color', help='numpy test the part\'s pixels pass (see outline)')
        q.add_argument('--open', type=int, default=1); q.add_argument('--close', type=int, default=1); q.add_argument('--holes', action='store_true')
        q.add_argument('--all-pieces', dest='all_pieces', action='store_true', help='keep every separate piece of the photo\'s part, not just the biggest')
        q.add_argument('--ignore', help='leave these photo regions out of the score: polygons in pixels "x,y;x,y;...|x,y;..." (a hand, a stand, a part this copy has and the model shouldn\'t)')

    q = sp.add_parser('pose', help=cmd_pose.__doc__); q.add_argument('img'); q.add_argument('--mesh', help='the model\'s triangles: OBJ, or JSON {"parts": {name: [x,y,z,...]}}')
    q.add_argument('--pts', help='point pairs "u,v=x,y,z;...": a photo pixel and the model point it shows (4 or more; on their own, 6 or more)')
    q.add_argument('--pts-weight', dest='pts_weight', type=float, default=1.0, help='how much the point pairs count against the silhouette (default 1)')
    q.add_argument('--fov', type=float, help='fix the vertical field of view, degrees (default: fitted, starting at 20)')
    q.add_argument('--az', default='0,360', help='azimuths to search, degrees "from,to" (0 looks at the model\'s +z face, 90 its +x side)'); q.add_argument('--az-step', dest='az_step', type=float, default=15)
    q.add_argument('--el', default='-30,60', help='elevations to search, degrees "from,to"'); q.add_argument('--el-step', dest='el_step', type=float, default=15)
    q.add_argument('--mirror', choices=['no', 'yes', 'both'], default='both', help='also try the model flipped left to right, for a photo printed mirror-wise (default both)')
    q.add_argument('--init', help='start from this camera JSON instead of searching'); q.add_argument('--keep', type=int, default=3, help='how many of the best starting views to refine (default 3)')
    q.add_argument('--iters', type=int, default=500, help='evaluations per refinement (default 500)'); q.add_argument('--work', type=float, default=360, help='search at this size, px (default 360)')
    q.add_argument('--out', help='camera JSON to write (default <photo>_cam.json)'); photo_opts(q); q.set_defaults(fn=cmd_pose)

    q = sp.add_parser('diff', help=cmd_diff.__doc__); q.add_argument('img'); q.add_argument('mesh'); q.add_argument('cam'); photo_opts(q)
    q.add_argument('--tol', type=int, default=1, help='ignore disagreements thinner than this, px (default 1)'); q.add_argument('--top', type=int, default=6, help='patches to list (default 6)')
    q.add_argument('--parts', action='store_true', help='also print the model-space box of each part named'); q.add_argument('--ss', type=int, default=2, help='supersampling (default 2)')
    q.add_argument('--crop', help='x0,y0,x1,y1 of the photo to show'); q.add_argument('--zoom', type=int); q.add_argument('--png'); q.set_defaults(fn=cmd_diff)

    q = sp.add_parser('fit', help=cmd_fit.__doc__); q.add_argument('mesh')
    q.add_argument('--view', nargs='+', action='append', required=True, metavar='IMG CAM [IGNORE]', help='a photo, its fitted camera, and (optionally) regions to leave out; repeat for every view')
    q.add_argument('--parts', required=True, help='which parts move: a regex on their names, e.g. "^08[0-3]" or "eyepiece"')
    q.add_argument('--dof', default='tx,ty,tz', help='what may change: tx,ty,tz (move), s (scale), sxy (scale across the z axis, for round parts), sx,sy,sz (default tx,ty,tz)')
    q.add_argument('--pivot', help='scale about this model point "x,y,z" (default: the parts\' middle)')
    q.add_argument('--step', type=float, default=0.05, help='first move tried, as a share of the parts\' size (default 0.05)')
    q.add_argument('--iters', type=int, default=300); q.add_argument('--restarts', type=int, default=3); q.add_argument('--work', type=float, default=500, help='compare at this size, px (default 500)')
    q.add_argument('--out', help='write the mesh with the parts moved, to diff again'); photo_opts(q); q.set_defaults(fn=cmd_fit)

    q = sp.add_parser('ray', help=cmd_ray.__doc__); q.add_argument('cam'); q.add_argument('--px', required=True, help='photo pixels "u,v;u,v"')
    q.add_argument('--plane', help='axis=value, e.g. y=0.0186'); q.add_argument('--mesh', help='hit the model\'s surface instead of a plane'); q.add_argument('--img', help='the photo, if the camera was fitted at another size')
    q.add_argument('--cam2', help='a second photo\'s camera: triangulate each --px with the same feature picked in that photo (--px2)'); q.add_argument('--px2', help='the same features\' pixels in the second photo')
    q.add_argument('--dp', type=int, default=5); q.set_defaults(fn=cmd_ray)

    args = p.parse_args(); args.fn(args)
    sys.stdout.flush()
    if sys.stdout.dead: os.dup2(os.open(os.devnull, os.O_WRONLY), sys.__stdout__.fileno())   # nothing left to say at exit


if __name__ == '__main__':
    main()
