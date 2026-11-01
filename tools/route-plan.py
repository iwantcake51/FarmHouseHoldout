# The highway arena's plan (src/js/world/arena-route.js RT_PLAN): "Route 9", a highway services stop on the way out
# of town, abandoned in the evacuation: the travel stop's store and diner burnt out, the army's checkpoint left
# standing on the forecourt, the highway past it jammed with the pile-up nobody came back for. Drawn by hand for its
# west half (Blue's) and mirrored for its east (Red's).
#   python3 tools/route-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s, crouch (eyes down to about 1.05 m: low cover hides you
#    whole), lean, vault the low things; one floor. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m; the
#    hunting rifle is the one long gun. Camera at 1.56 m standing: cars and barriers hide a crouched body, not a head.
#  - Outdoors, the size of Yard 4 across (42 m) but shallower (40 m): the store close, the forecourt medium, the
#    highway the long lane (the rifle's), broken up so nothing sees it end to end.
#  - Cells 1 m; tall (stop sight and rounds): # the perimeter (the army's T-walls, the store's back wall, the
#    garage's front, the fence along the highway), h block walls (the store's, the cooler's, the spawn lots'), W blast
#    walls (the line of T-walls between the forecourt and the highway; HESCO at the checkpoint's corners and the sentry
#    bunkers), S the store's gondolas, G a pump island (its two pumps and the canopy's column), R the army's truck,
#    U a bus on its side, X a semi's tractor; low (seen and shot over): c a wrecked car (two metres through: not vaulted, gone round),
#    b a jersey barrier, n a counter, s sandbags, k crates or pallets, d a dumpster (those five vaulted).
#
# The layout: three lanes west to east, joined at the spawns, at the middle and by one slip road each side.
#  - NORTH, the Travel stop: close quarters. The fire-gutted store (its roof on), entered from the side lot by its
#    side door or round through the storeroom; gondolas either side of its front doors (a dog-leg: the side door never
#    lines up with them), the checkout, the walk-in cooler and restrooms in the very middle off the back wall so it's
#    never seen end to end; its front doors open onto the forecourt behind a pump island.
#  - MIDDLE, the Forecourt: medium range and the contest. Out of each spawn's wide gate past the army truck parked
#    across it, between the pump islands (one in front of the store's doors, one in front of the slip road, so no line
#    runs from the store to the highway), onto the checkpoint under the canopy: HESCO at its corners, a sandbag ring
#    round the flag.
#  - SOUTH, the Highway: the long lane, three real ways along it, none of them the only one: the westbound's shoulder
#    under the blast walls (each slip road comes out behind the army's HESCO bunker), the median along its jersey
#    barriers (vaulted: cross between the carriageways anywhere) into the two semis' tractors wedged together in the
#    very middle, and the eastbound along the guardrail past a bus on its side. Each at least three metres across, its
#    own cover, broken once and staggered, so nothing sees the highway end to end (its longest lines about 28 m,
#    corner to corner). A slip road off the forecourt each side, through the line of blast walls, is the middle's way
#    south.
#  - Each spawn is a lot behind its building at the end of the map (the garage and car wash west, the motel east: the
#    same walls, dressed differently) with three exits: north into the side lot, south onto the highway (a stub just
#    inside each, round either end) and a wide gate east onto the forecourt, the army truck out in front of it. Its
#    spawn spots only between the two stubs: the team together, out of every sightline (world/arena.js picks them).
import sys, math
W, H = 42, 40
HW = W // 2
L = [['.'] * HW for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def gap(i0, j0, i1=None, j1=None): put('.', i0, j0, i1, j1)

# ---- the perimeter
put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)

# ---- the spawn lot (cols 1-6, rows 12-27): its north and south walls are the lane dividers, its east wall the gate's
put('h', 1, 11, 7, 11); put('h', 1, 28, 7, 28); put('h', 7, 11, 7, 28)
gap(4, 11, 6, 11)          # north exit, into the side lot
put('h', 3, 14, 6, 14)     # a stub two metres in from it, round its west end (a dog-leg: nothing outside sees in)
gap(4, 28, 6, 28)          # south exit, onto the highway
put('h', 3, 25, 6, 25)
gap(7, 18, 7, 21)          # the gate east onto the forecourt, four metres

# ---- NORTH LANE: the travel stop (rows 1-10): the side lot (cols 1-7), the store (cols 9-20 and its mirror)
put('h', 8, 1, 8, 10); put('h', 8, 11, HW - 1, 11)   # the store's west wall and its front
gap(8, 2, 8, 3)            # the storeroom's back door, off the side lot
gap(8, 6, 8, 7)            # the side door onto the sales floor
put('h', 9, 4, 15, 4)      # the storeroom's wall (open at its east end, by the cooler)
put('h', 18, 1, HW - 1, 7) # the walk-in cooler and the restrooms, in the very middle off the back wall
put('k', 12, 2, 13, 2)     # pallets of stock in the storeroom
put('S', 11, 8, 11, 10); put('S', 15, 8, 15, 10)   # the gondolas, off the front windows either side of the doors
put('n', 12, 6, 13, 6)     # the checkout counter
gap(12, 11, 14, 11)        # the front doors, onto the forecourt (the flag's north approach)
put('d', 2, 2, 3, 2)       # the dumpster in the side lot
# ---- MIDDLE LANE: the forecourt (rows 12-27, cols 8-20 and its mirror)
put('R', 10, 16, 11, 23)   # the army truck across the gate, two metres off it and twice as long: what keeps eyes out of the lot
put('G', 12, 14, 15, 14); put('G', 12, 25, 15, 25)   # the pump islands, out in front of the store's doors and the slip road (the canopy's columns stand on them)
put('W', 17, 15, 18, 16); put('W', 17, 23, 18, 24)   # the checkpoint's blast walls at its corners
put('s', 19, 16, 20, 16); put('s', 19, 23, 20, 23); put('s', 19, 19, 19, 20)   # the flag's sandbag ring (open at its corners)
put('k', 13, 19, 13, 20)   # crates of the army's stores on the forecourt
# ---- the line of blast walls between the forecourt and the highway (row 28), the slip road through it
put('W', 8, 28, HW - 1, 28)
gap(12, 28, 13, 28)
# ---- SOUTH LANE: the highway (rows 29-38): the westbound carriageway rows 29-32, the median 33-34, eastbound 35-38
# (three ways along it, each with its own cover and each broken once so it's never seen end to end, staggered so no
# route is the only one: the westbound's shoulder under the blast walls, behind the sentry bunker; the median, along
# its barriers into the wedged cabs in the middle; the eastbound along the guardrail, past the bus on its side. Each
# three metres wide or more, with the median's barriers vaulted to cross between them anywhere)
put('b', 1, 34, 5, 34); put('b', 9, 34, 14, 34)   # the median's jersey barriers (vaulted), gaps where the cars went through
put('W', 15, 29, 16, 31)   # the army's sentry bunker, HESCO off the blast walls: the slip road comes out behind it
put('X', 19, 32, HW - 1, 35)   # two semis' tractors wedged together across the median, in the very middle (four wide with its mirror)
put('U', 8, 36, 12, 38)    # a bus on its side against the guardrail
put('c', 2, 31, 5, 32)     # the wrecks: a sedan in the westbound, in front of the spawn's south exit
put('c', 8, 31, 11, 32)    # one by the slip road
put('c', 15, 37, 18, 38)   # one against the guardrail past the bus

# ---- free-for-all spawns, spread round all three lanes (and their mirrors)
for f in [(3, 5), (11, 2), (16, 6), (9, 13), (15, 17), (9, 26), (3, 30), (11, 35), (20, 37)]: L[f[1]][f[0]] = 'F'

TALL = set('#hWSGRTXU')
_sw = {'A': 'B', 'B': 'A'}
_rows = [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
def _sees(rows, a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
lot = lambda c: 1 <= c[0] <= 6 and 12 <= c[1] <= 27
_open = [(i, j) for j in range(H) for i in range(W) if _rows[j][i] in '.F']
_vest = lambda c: c[0] <= 9 and 16 <= c[1] <= 23   # (the gate's doorway, between it and the truck)
_out = [c for c in _open if not lot(c) and c[0] != 7 and not _vest(c) and not (c[1] in (11, 28) and c[0] <= 6)]
# (only in the lot's middle, between its two stubs, facing its gate: the team comes in together, a few
# metres apart, the shortest way out to the fight; arena.js spreads each round's spawns over these)
pad = lambda c: 15 <= c[1] <= 24
for c in [c for c in _open if lot(c) and pad(c)]:
    if not any(_sees(_rows, o, c) for o in _out): L[c[1]][c[0]] = 'A'
rows = [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
walk = lambda c: c in '.AFB'

# ---- checks
def bfs(src):
    import heapq
    d = {src: 0}; q = [(0, src)]
    while q:
        c, (i, j) = heapq.heappop(q)
        if c > d[(i, j)]: continue
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                if not di and not dj: continue
                ni, nj = i + di, j + dj
                if not (0 <= ni < W and 0 <= nj < H) or not walk(rows[nj][ni]): continue
                if di and dj and (not walk(rows[j][ni]) or not walk(rows[nj][i])): continue
                nc = c + (1.4142 if di and dj else 1)
                if nc < d.get((ni, nj), 1e9): d[(ni, nj)] = nc; heapq.heappush(q, (nc, (ni, nj)))
    return d
sees = lambda a, b: _sees(rows, a, b)
floor = [(i, j) for j in range(H) for i in range(W) if walk(rows[j][i])]
SP = (3, 20)
seen = bfs(SP)
print('unreachable', [c for c in floor if c not in seen], file=sys.stderr)
A = [c for c in floor if rows[c[1]][c[0]] == 'A']; B = [c for c in floor if rows[c[1]][c[0]] == 'B']
print('spawn spots per side', len(A), file=sys.stderr)
print('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)), file=sys.stderr)
outside = [c for c in floor if not lot(c) and not (c[0] <= 7 and 11 <= c[1] <= 28) and not _vest(c)]
peek = set(o for o in outside for a in A if sees(o, a))
print('spots outside that see into the west spawn cells', len(peek), sorted(peek)[:12], file=sys.stderr)
lane = lambda c: 'N' if c[1] <= 10 else 'S' if c[1] >= 29 else 'M'
cells = [c for c in floor if c[0] % 2 == 0 and c[1] % 2 == 0]
def vis_pairs(fa, fb): return [(a, b) for a in cells if fa(a) for b in cells if fb(b) and sees(a, b)]
ns = vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'S')
print('north lane sees south lane', len(ns), ns[:6], file=sys.stderr)
print('north lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'M' and not lot(c))), file=sys.stderr)
print('south lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'S', lambda c: lane(c) == 'M' and not lot(c))), file=sys.stderr)
for ln in 'NMS':
    cs = [c for c in cells if lane(c) == ln and not lot(c)]
    far = sorted(max([math.hypot(a[0] - b[0], a[1] - b[1]) for b in cs if b != a and sees(a, b)] or [0]) for a in cs)
    print('lane', ln, 'sight median %.0f m, 90%% %.0f m, most %.0f m' % (far[len(far) // 2], far[int(len(far) * 0.9)], far[-1]), file=sys.stderr)
def runs(line):
    best, cur = 0, 0
    for c in line:
        cur = 0 if c in TALL else cur + 1; best = max(best, cur)
    return best
print('edge runs: north %d, south %d, west %d' % (max(runs(rows[1]), runs(rows[2])), max(runs(rows[H - 2]), runs(rows[H - 3])), max(runs(''.join(rows[j][1] for j in range(H))), runs(''.join(rows[j][2] for j in range(H))))), file=sys.stderr)
LONG = 26   # (every spot this time, not every other)
lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(floor) for b in floor[k + 1:] if (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 > LONG * LONG and sees(a, b)), reverse=True)
narrow = [c for c in floor if (rows[c[1]][c[0] - 1] in TALL and rows[c[1]][c[0] + 1] in TALL) or (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL)]
door = lambda c: (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL and c[1] in (11, 28)) or (rows[c[1]][c[0] - 1] in TALL and rows[c[1]][c[0] + 1] in TALL and c[0] in (7, 8, W - 8, W - 9))
narrow = [c for c in narrow if not door(c)]   # (a doorway through a wall is one deep: not a corridor)
print('one-cell-wide spots', len(narrow), narrow[:10], file=sys.stderr)
pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
         if rows[a[1]][a[0]] in TALL and rows[b[1]][b[0]] in TALL and rows[c[1]][c[0]] not in TALL and rows[d[1]][d[0]] not in TALL]
print('corner pinches', len(pinch), pinch[:10], file=sys.stderr)
print('sightlines over %d m' % LONG, len(lng), file=sys.stderr)
for l in lng[:14]: print('   ', l, lane(l[1]) + lane(l[2]), file=sys.stderr)
FL = (HW - 1, H // 2)
def via(w):
    d1 = bfs(SP); d2 = bfs(w); return d1[w] + d2[FL]
for nm, w in [('north', (10, 6)), ('middle', (9, 15)), ('south', (12, 33))]:
    m = via(w); print('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25), file=sys.stderr)
for r in rows: print(r)
