# The indoor arena's plan (src/js/world/arena-mall.js MALL_PLAN): "Larkspur Mall", a shopping mall after closing, the
# lights left on. Drawn by hand for its west half (Blue's) and mirrored for its east (Red's).
#   python3 tools/mall-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s, crouch (eyes down to about 1.05 m: low cover hides you
#    whole), lean, vault the low things; one floor. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m.
#  - Indoors, so smaller and closer than Yard 4: 36 x 30 m, nothing seen further than about 24 m. Shotguns and the
#    sub guns' map, the rifles kept to the concourse's diagonals.
#  - Cells 1 m; tall (stop sight and rounds): # outer wall, h shop and service walls, S stockroom shelving, K a
#    display kiosk, P a pillar; low (seen and shot over; vaulted): k pallets of stock, c a counter, T a table, p a
#    planter, w the fountain's rim.
#
# The layout: three lanes west to east, joined at the spawns and the middle; islands of cover, no corridors.
#  - NORTH, Back of house: close quarters. The stockroom behind the shops: shelving islands and pallets, a service door
#    into the concourse (the flag's north approach).
#  - MIDDLE, the Concourse: medium range and the contest. Out of each anchor store's wide entrance past a display kiosk,
#    pillars and planters, onto the fountain court and the flag inside its rim.
#  - SOUTH, the Food court: medium-long, the rifles' lane but never seen end to end: tables and counters for low cover,
#    the stalls along the south wall, a seating island in the middle; open to the concourse at its middle.
#  - Each spawn is an anchor store (the department store) with three exits: north into back of house, south into the
#    food court (a shelf stub just inside each, round either end) and a wide entrance east with the kiosk out in front.
import sys, math
W, H = 36, 30
HW = W // 2
L = [['.'] * HW for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def gap(i0, j0, i1=None, j1=None): put('.', i0, j0, i1, j1)

# ---- the outer wall
put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)

# ---- the anchor store (cols 1-6, rows 8-21): its north and south walls are the lane dividers, its east wall the
# shopfront with a wide entrance
put('h', 1, 7, HW - 1, 7); put('h', 1, 22, HW - 1, 22); put('h', 7, 7, 7, 22)
gap(4, 7, 6, 7)            # north exit, into back of house, at the store's east end
put('S', 3, 10, 6, 10)     # a shelf two metres in from it, against the east wall: round its west end (a dog-leg, so nothing outside sees in)
gap(4, 22, 6, 22)          # south exit, into the food court
put('S', 3, 19, 6, 19)
gap(7, 13, 7, 16)          # the entrance east onto the concourse, four metres

# ---- NORTH LANE: back of house (rows 1-6): the stockroom, shelving islands and pallets
gap(10, 7, 12, 7)          # the service door into the concourse (the flag's north approach), three metres
put('S', 9, 1, 9, 3)       # shelving off the north wall
put('S', 11, 4, 13, 4)     # a shelving island mid-room
put('h', 16, 4, 17, 6)     # the lift core in the very middle, off the concourse wall (four wide with its mirror): round its north side, never seen end to end
put('k', 5, 3, 6, 3)       # pallets of stock, vaulted
put('k', 14, 1)

# ---- MIDDLE LANE: the concourse (rows 8-21, cols 8-17 and its mirror)
put('K', 10, 11, 11, 18)   # a display kiosk out in front of the store's entrance, two metres off it and twice as long: what keeps eyes out of the store
put('P', 14, 11); put('P', 14, 18)   # pillars
put('p', 13, 9); put('p', 12, 20)   # planters along the shopfronts
put('P', 12, 9); put('P', 13, 20)   # and a pillar by each, standing in the line from the service door to the food court (no line runs from the north lane into the south)
put('w', 16, 13, 17, 13); put('w', 16, 16, 17, 16)   # the fountain's rim, north and south of the flag (open east and west)

# ---- SOUTH LANE: the food court (rows 23-28)
gap(13, 22, 14, 22)        # open to the concourse either side of the seating island
put('h', 16, 23, 17, 26)   # the seating island in the middle, off the concourse wall (four wide with its mirror): round its south side
put('h', 8, 26, 8, 28)     # a stall's side wall off the south wall
put('c', 10, 27, 12, 27)   # its counter
put('T', 11, 24); put('T', 14, 25)   # tables
put('c', 2, 25, 3, 25)     # a counter by the store's south exit

# ---- free-for-all spawns, spread round all three lanes (and their mirrors)
for f in [(3, 2), (11, 6), (15, 2), (9, 9), (15, 10), (9, 20), (4, 27), (12, 25), (15, 28)]: L[f[1]][f[0]] = 'F'

TALL = set('#hSKP')
_sw = {'A': 'B', 'B': 'A'}
_rows = [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
def _sees(rows, a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
store = lambda c: 1 <= c[0] <= 6 and 8 <= c[1] <= 21
_open = [(i, j) for j in range(H) for i in range(W) if _rows[j][i] in '.F']
_vest = lambda c: c[0] <= 9 and 11 <= c[1] <= 18   # (the entrance's doorway, between it and the kiosk)
_out = [c for c in _open if not store(c) and c[0] != 7 and not _vest(c) and not (c[1] in (7, 22) and c[0] <= 6)]
for c in [c for c in _open if store(c)]:
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
SP = (3, 14)
seen = bfs(SP)
print('unreachable', [c for c in floor if c not in seen], file=sys.stderr)
A = [c for c in floor if rows[c[1]][c[0]] == 'A']; B = [c for c in floor if rows[c[1]][c[0]] == 'B']
print('spawn spots per side', len(A), file=sys.stderr)
print('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)), file=sys.stderr)
outside = [c for c in floor if not store(c) and not (c[0] <= 7 and 7 <= c[1] <= 22) and not _vest(c)]
peek = set(o for o in outside for a in A if sees(o, a))
print('spots outside that see into the west spawn cells', len(peek), sorted(peek)[:12], file=sys.stderr)
lane = lambda c: 'N' if c[1] <= 6 else 'S' if c[1] >= 23 else 'M'
cells = [c for c in floor if c[0] % 2 == 0 and c[1] % 2 == 0]
def vis_pairs(fa, fb): return [(a, b) for a in cells if fa(a) for b in cells if fb(b) and sees(a, b)]
print('north lane sees south lane', len(vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'S')), file=sys.stderr)
print('north lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'M' and not store(c))), file=sys.stderr)
print('south lane sees middle (pairs)', len(vis_pairs(lambda c: lane(c) == 'S', lambda c: lane(c) == 'M' and not store(c))), file=sys.stderr)
for ln in 'NMS':
    cs = [c for c in cells if lane(c) == ln and not store(c)]
    far = sorted(max([math.hypot(a[0] - b[0], a[1] - b[1]) for b in cs if b != a and sees(a, b)] or [0]) for a in cs)
    print('lane', ln, 'sight median %.0f m, 90%% %.0f m, most %.0f m' % (far[len(far) // 2], far[int(len(far) * 0.9)], far[-1]), file=sys.stderr)
def runs(line):
    best, cur = 0, 0
    for c in line:
        cur = 0 if c in TALL else cur + 1; best = max(best, cur)
    return best
print('edge runs: north %d, south %d, west %d' % (max(runs(rows[1]), runs(rows[2])), max(runs(rows[H - 2]), runs(rows[H - 3])), max(runs(''.join(rows[j][1] for j in range(H))), runs(''.join(rows[j][2] for j in range(H))))), file=sys.stderr)
LONG = 24
lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > LONG and sees(a, b)), reverse=True)
narrow = [c for c in floor if (rows[c[1]][c[0] - 1] in TALL and rows[c[1]][c[0] + 1] in TALL) or (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL)]
narrow = [c for c in narrow if not (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL and c[1] in (7, 22)) and not (c[0] in (7, W - 8) and 13 <= c[1] <= 16)]   # (a doorway through a wall is one deep: not a corridor)
print('one-cell-wide spots', len(narrow), narrow[:10], file=sys.stderr)
pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
         if rows[a[1]][a[0]] in TALL and rows[b[1]][b[0]] in TALL and rows[c[1]][c[0]] not in TALL and rows[d[1]][d[0]] not in TALL]
print('corner pinches', len(pinch), pinch[:10], file=sys.stderr)
print('sightlines over %d m' % LONG, len(lng), lng[:6], file=sys.stderr)
FL = (HW - 1, H // 2)
def via(w):
    d1 = bfs(SP); d2 = bfs(w); return d1[w] + d2[FL]
for nm, w in [('north', (11, 5)), ('middle', (9, 11)), ('south', (13, 24))]:
    m = via(w); print('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25), file=sys.stderr)
for r in rows: print(r)
