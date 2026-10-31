# The arena's plan (src/js/world/arena.js AR_PLAN): "Yard 4", a freight terminal yard. Drawn by hand for its west half
# (Blue's) and mirrored for its east (Red's).
#   python3 tools/arena-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s; no crouch, no jump: one floor, no verticality. Sandbags are
#    the cover you can vault, with the crate stacks. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m; the hunting rifle is
#    the one long gun. Camera at 1.56 m: low cover (1.05-1.15 m) hides legs and body, not heads.
#  - Cells 1 m; tall: # outer wall 3.2, h block wall 2.7, C container 2.6 (they stop sight and
#    rounds); low: b jersey barrier, s sandbags, o drum, r spool (you see and shoot over them).
#
# The layout: three lanes west to east, each its own kind of fight, joined only at the spawns and at the middle; open
# floors broken up by islands of cover, never long corridors (the one-cell-wide check below).
#  - NORTH, the Warehouse floor: close quarters. One roofless hall, container stacks, wall stubs and crates standing
#    in it so nothing sees far; a door into the plaza is the flag's north approach.
#  - MIDDLE, the Plaza: medium range and the contest. A courtyard out of each spawn's gate, between container stacks,
#    onto the open plaza and the flag in its sandbag ring, wall stubs at the ring's corners.
#  - SOUTH, the Rail spur: long range, the one place for a rifle. Open, with low cover only, a container stack part way
#    along and a signal hut in the very middle so it's never seen end to end; a gap at the container wall's west end,
#    by the courtyard, is the middle's way south.
#  - Each spawn is a yard with three exits: north and south (a short stub just inside each, round either end) and a gate
#    east between two posts with a container stack out in front, so nothing outside sees in.
import sys, math
W, H = 42, 42
L = [['.'] * 21 for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def gap(i0, j0, i1=None, j1=None): put('.', i0, j0, i1, j1)

# ---- the outer wall
put('#', 0, 0, 20, 0); put('#', 0, 41, 20, 41); put('#', 0, 0, 0, 41)

# ---- the spawn yard (cols 1-6, rows 13-28): walled on three sides (its north and south walls are the lane dividers),
# the outer wall the fourth. Three wide exits, each with something standing a few metres out in front of it so nothing
# outside sees in, and room to come out round it either way (no corridors)
put('h', 1, 12, 7, 12); put('h', 1, 29, 7, 29); put('h', 7, 12, 7, 29)
gap(4, 12, 6, 12)          # north exit, into the warehouse
put('h', 3, 15, 6, 15)     # a stub two metres in from it, a two-metre way round its open end: nothing outside sees in
gap(4, 29, 6, 29)          # south exit, onto the rail spur
put('h', 3, 26, 6, 26)
gap(7, 19, 7, 22)          # the gate east into the courtyard, four metres
# (nothing stood in the yard itself: where each side comes in is worked out below, every spot in it that nothing
# outside can see, so the spawns are spread over the yard and safe by the walls alone, not by a prop parked in it)

# ---- NORTH LANE: the warehouse floor (rows 1-11; its south wall row 12 runs the width of the map): one big roofless
# hall, broken up by islands rather than walls, so it's close fighting round corners, never a corridor
put('h', 8, 12, 20, 12)
gap(16, 12, 18, 12)        # the plaza door (the flag's north approach), three metres wide
put('h', 9, 1, 9, 5)       # a wall stub off the north wall
put('C', 12, 5, 13, 7)     # a container stack mid-hall
put('C', 18, 1, 20, 3)     # and one stood against the north wall in the very middle (six wide with its mirror)
put('h', 15, 8, 15, 11)    # a wall off the warehouse's south wall by the plaza door
put('k', 6, 5, 7, 5); put('k', 10, 9, 10, 10)   # two crate stacks (vaulted): the warehouse's own cover, pallets of stock
put('b', 16, 5, 17, 5)     # a barrier across the hall's middle by the plaza door

# ---- MIDDLE LANE: the courtyard (cols 8-14) and the plaza (cols 15-20 and its mirror)
put('C', 12, 15, 13, 17); put('C', 12, 24, 13, 26)
put('C', 10, 17, 11, 24)                     # a container out in the courtyard, two metres off the gate and twice as long as it's wide, open all round: what keeps eyes out of the yard
put('h', 16, 16, 17, 17); put('h', 16, 24, 17, 25)   # wall stubs at the flag ring's corners
put('s', 19, 17, 20, 17); put('s', 19, 24, 20, 24); put('s', 18, 20, 18, 21)   # the flag's sandbag ring (open at its corners)
# cover along the ways into the middle, so none of them is a bare run: crates and barriers along the strips under the
# lane walls, drums and sandbags on the plaza's approaches


# ---- SOUTH LANE: the rail spur (rows 30-40; the container wall along row 29 between it and the plaza)
put('C', 10, 29, 15, 29); put('C', 16, 29, 20, 29)   # a row of containers along the lane's north side, one deep (two deep left a one-metre alley along it)
                                             # (a gap at their west end, cols 8-9, by the courtyard: the middle's way south)
put('C', 19, 30, 20, 31)                     # a container stood out from the wall in the very middle (four wide with its mirror): nothing sees the length of the lane along the wall
put('h', 19, 34, 20, 38)                     # the signal hut in the middle (four wide with its mirror)
put('b', 7, 35, 10, 35)                      # the platform edge: barriers along the sidings (row 37: drawn on the floor, world/arena.js AR_YARD)
put('s', 15, 33, 15, 35)                     # sandbags at the platform's end
put('C', 12, 32, 13, 35)                     # a container stack part way along: the lane's long, but nothing sees end to end
put('C', 10, 39, 11, 40)                     # a container stood against the south wall: no run along it
put('r', 6, 38); put('o', 16, 39)   # a cable spool and a drum: the rail yard's own clutter, once each

# ---- free-for-all spawns, spread round all three lanes (and their mirrors)
for f in [(3, 4), (11, 2), (16, 7), (9, 21), (15, 14), (15, 27), (4, 36), (11, 34), (17, 38)]: L[f[1]][f[0]] = 'F'

# where each side comes in: every open spot in its yard that no spot outside the yard can see (the gate's own cells
# aside), so the spawns cover the yard and are safe by its walls
_sw = {'A': 'B', 'B': 'A'}
_rows = [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
def _sees(a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if _rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in '#Ch': return False
    return True
_yard = lambda c: 1 <= c[0] <= 6 and 13 <= c[1] <= 28
_open = [(i, j) for j in range(H) for i in range(W) if _rows[j][i] in '.F']
_vest = lambda c: c[0] <= 9 and 17 <= c[1] <= 24   # (the gate's doorway, between it and the container out in front)
_out = [c for c in _open if not _yard(c) and c[0] != 7 and not _vest(c)]
for c in [c for c in _open if _yard(c)]:
    if not any(_sees(o, c) for o in _out): L[c[1]][c[0]] = 'A'
sw = {'A': 'B', 'B': 'A'}
rows = [''.join(r) + ''.join(sw.get(c, c) for c in reversed(r)) for r in L]
TALL = set('#Ch')
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
floor = [(i, j) for j in range(H) for i in range(W) if walk(rows[j][i])]
seen = bfs((3, 20))
bad = [c for c in floor if c not in seen]
print('unreachable', bad, file=sys.stderr)
def sees(a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
A = [(i, j) for (i, j) in floor if rows[j][i] == 'A']; B = [(i, j) for (i, j) in floor if rows[j][i] == 'B']
yard = lambda c: c[0] <= 6 and 13 <= c[1] <= 28
print('spawn spots per side', len(A), file=sys.stderr)
print('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)), file=sys.stderr)
outside = [c for c in floor if not yard(c) and not (c[0] <= 7 and 13 <= c[1] <= 28) and not (c[0] <= 9 and 17 <= c[1] <= 24)]   # (anywhere past the yard's walls but the gate's own doorway)
peek = [(o, a) for o in outside for a in A if sees(o, a)]
print('spots outside that see into the west spawn cells', len(set(o for o, a in peek)), sorted(set(o for o, a in peek))[:12], file=sys.stderr)
lane = lambda c: 'N' if c[1] <= 11 else 'S' if c[1] >= 30 else 'M'
cells = [c for c in floor if c[0] % 2 == 0 and c[1] % 2 == 0]
def vis_pairs(fa, fb): return [(a, b) for a in cells if fa(a) for b in cells if fb(b) and sees(a, b)]
print('north lane sees south lane', len(vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'S')), file=sys.stderr)
print('north lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'M' and not yard(c))), file=sys.stderr)
print('south lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'S', lambda c: lane(c) == 'M' and not yard(c))), file=sys.stderr)
# each lane's fight: from each spot, the furthest it sees within its own lane (median, 90th percentile, most)
for ln in 'NMS':
    cs = [c for c in cells if lane(c) == ln and not yard(c)]
    far = sorted(max([math.hypot(a[0] - b[0], a[1] - b[1]) for b in cs if b != a and sees(a, b)] or [0]) for a in cs)
    print('lane', ln, 'sight median %.0f m, 90%% %.0f m, most %.0f m' % (far[len(far) // 2], far[int(len(far) * 0.9)], far[-1]), file=sys.stderr)
# the longest straight runs along the outer walls
def runs(line):
    best, cur = 0, 0
    for c in line:
        cur = 0 if c in TALL else cur + 1; best = max(best, cur)
    return best
print('edge runs: north %d, south %d, west %d' % (max(runs(rows[1]), runs(rows[2])), max(runs(rows[40]), runs(rows[39])), max(runs(''.join(rows[j][1] for j in range(H))), runs(''.join(rows[j][2] for j in range(H))))), file=sys.stderr)
lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > 28 and sees(a, b)), reverse=True)
# corridors: open cells walled in on both sides across (east and west, or north and south) by something tall
narrow = [c for c in floor if (rows[c[1]][c[0] - 1] in TALL and rows[c[1]][c[0] + 1] in TALL) or (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL)]
print('one-cell-wide spots', len(narrow), narrow[:10], file=sys.stderr)
# pinches: two tall things touching only at a corner, a hairline slit between them you can see (and shoot) through
pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
         if rows[a[1]][a[0]] in TALL and rows[b[1]][b[0]] in TALL and rows[c[1]][c[0]] not in TALL and rows[d[1]][d[0]] not in TALL]
print('corner pinches', len(pinch), pinch[:10], file=sys.stderr)
print('sightlines over 28 m', len(lng), lng[:6], file=sys.stderr)
# timings, spawn to the flag by each lane (through a spot in it), at a sprint (5.25 m/s)
def via(w):
    d1 = bfs((3, 20)); d2 = bfs(w); return d1[w] + d2[(20, 20)]
for nm, w in [('north', (11, 9)), ('middle', (10, 16)), ('south', (12, 36))]:
    m = via(w); print('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25), file=sys.stderr)
for r in rows: print(r)
