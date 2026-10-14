#!/usr/bin/env python3
"""Trace outlines off a reference photo into model coordinates, to sub-pixel precision.

  grid     a labelled pixel grid over the photo (or a crop of it), to read landmarks off
  map      the photo-to-model mapping (MAP) from two known points, or a known length
  outline  one part's outline, cut out by a box and/or polygon       -> [[z, y], ...]
  lathe    a round part's radius along its axis, for a lathe         -> [[r, z], ...]
  circle   a round feature (cap, bolt head, lens) inside the outline -> centre and radius
  check    model-space polygons drawn back over the photo
  compare  reference and render side by side, and blended

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
import argparse, json, math, sys
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


def edge_field(a, args, crop):
    """N over the crop: 0 = background, 1 = the part, the edge at 0.5 (sub-pixel). Also the coarse mask, and how much
    of the edge band had too little contrast to refine (and fell back to the coarse mask)."""
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


def main():
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

    args = p.parse_args(); args.fn(args)


if __name__ == '__main__':
    main()
