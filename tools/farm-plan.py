# The farm arena's plan (src/js/world/arena-farm.js HF_PLAN): "Harlan Farm", a working farm its people walled in against
# the dead and then gave up on. Drawn by hand for its west half (Blue's) and mirrored for its east (Red's).
#   python3 tools/farm-plan.py > plan.txt   (the plan on stdout; the checks on stderr; LONGS=1 also lists the long
#   sightlines and any line from the barn into the field)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s, crouch (eyes down to about 1.05 m: low cover hides you
#    whole), lean, vault the low things; one floor. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m; the
#    hunting rifle is the one long gun.
#  - Outdoors, between the mall and Yard 4 in size: 42 x 38 m. The barn closer than the yard, the field more open
#    than either (the rifles' lane, lines of 25-31 m corner to corner across it) but never seen end to end.
#  - Cells 1 m; tall (stop sight and rounds): # the barricade round it, h the barn's walls, m the machine sheds',
#    x a stall's partition, Y a hay mow (big bales stacked high), O a grain silo, R a tractor, W a hay wagon (in the
#    corral, a stock trailer), e the hedgerow, u the farmhouse's shell and the wind pumps' houses, S a shed's racks,
#    T a diesel tank, C the corn crib; low (seen and shot over; vaulted): y a big bale, f a rail fence, t a water
#    trough, p culvert pipes, k a workbench, w a woodpile.
#
# The layout: three lanes west to east, joined at the spawns and the middle.
#  - NORTH, the Barn: close quarters. A long roofless barn (its roof burnt off) taking the whole north side: stalls
#    along its north wall, hay mows standing in it as islands (one in the very middle, so it's never seen end to end),
#    its big doors at each end out of each side's corral (a stock trailer standing in it) and a door in its south wall
#    each side into the yard (the flag's north approaches), a mow just inside it so the yard never sees in, bales
#    stacked against the wall by it so nothing through the end doors sees out of it.
#  - MIDDLE, the Farmyard: medium range and the contest. Out of each machine shed's wide doors past its tractor and hay
#    wagon, between the grain silo and the wind pump, onto the yard's middle and the flag between its two troughs.
#  - SOUTH, the Field: long range, the rifles' lane. Low cover (bales, a rail fence, culvert pipes by the dry
#    irrigation ditch), a hay mow standing out in it each side, the farmhouse's burnt shell in the very middle off the
#    hedgerow and the corn crib against the south barricade, so it's never seen end to end; a gate in the hedgerow
#    each side, by the farmhouse and behind the wind pump, is the middle's way south.
#  - Each spawn is a machine shed with three exits: north into its corral (a rack just inside, round its far end),
#    south into the field (the same, a diesel tank outside it so nothing far down the field watches it) and wide doors
#    east onto the yard with the tractor and wagon out in front.
import sys, math, os
W, H = 42, 38
HW = W // 2
L = [['.'] * HW for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def gap(i0, j0, i1=None, j1=None): put('.', i0, j0, i1, j1)

# ---- the barricade round it
put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)

# ---- the machine shed (cols 1-6, rows 12-25): its north and south walls the lane dividers, its east wall the doors
put('m', 1, 11, 7, 11); put('m', 1, 26, 7, 26); put('m', 7, 11, 7, 26)
gap(4, 11, 6, 11)          # north exit, into the corral
put('S', 3, 14, 6, 14)     # a rack of parts three metres in from it, against the east wall: round its west end
gap(4, 26, 6, 26)          # south exit, into the field
put('S', 3, 23, 6, 23)
gap(7, 17, 7, 20)          # the big doors east onto the yard, four metres
put('k', 1, 12, 2, 12); put('k', 1, 25, 2, 25)   # workbenches along its north and south walls, in its corners

# ---- NORTH LANE: the corral (cols 1-7) and the barn (cols 9-20 and its mirror), rows 1-10
put('h', 8, 0, 8, 11); put('h', 8, 11, HW - 1, 11)   # the barn's west and south walls
gap(8, 4, 8, 7)            # its big doors west, out of the corral, four metres
gap(14, 11, 16, 11)        # a door south into the yard (the flag's north approach), three metres
put('x', 11, 1, 11, 2); put('x', 15, 1, 15, 2)   # stalls along the north wall
put('Y', 19, 3, 20, 6)     # the hay mow in the very middle (four wide with its mirror): round it north or south, never seen end to end
put('Y', 15, 5, 16, 6)     # a hay mow two metres in from the south door: round either end of it (nothing in the yard sees into the barn)
put('x', 18, 9, 18, 10)    # a stall partition off the south wall by it
put('Y', 11, 7, 13, 10)    # bales stacked against the south wall inside the west doors: nothing through the doors sees out the south door
put('y', 11, 5); put('y', 17, 3)   # loose bales
put('W', 3, 4, 4, 6)       # a livestock trailer left in the corral: nothing at its far end sees down the barn

# ---- MIDDLE LANE: the farmyard (rows 12-25, cols 8-20 and its mirror)
put('R', 10, 15, 11, 18)   # the tractor, out in front of the shed doors, two metres off them
put('W', 10, 19, 11, 22)   # and its hay wagon hitched behind it: what keeps eyes out of the shed
put('O', 15, 13, 16, 14)   # the grain silo, in front of the barn door
put('u', 15, 21, 16, 22)   # the pump house, north of the gate: nothing through the barn door sees through the gate
put('t', 19, 17, 20, 17); put('t', 19, 20, 20, 20)   # the troughs, north and south of the flag (open east and west)
put('w', 13, 20)           # a woodpile

# ---- SOUTH LANE: the field (rows 27-36)
put('e', 8, 26, HW - 1, 26)   # the hedgerow along the field's north side
gap(15, 26, 16, 26)        # a gate in it each side (the middle's way south)
put('u', 17, 24, 20, 29)   # the burnt farmhouse in the middle, off the hedgerow (six wide with its mirror)
put('u', 18, 30, 20, 30)
put('u', 16, 24)           # its chimney stack, standing proud of its north-west corner
put('C', 18, 35, 20, 36)   # the corn crib against the south barricade in the middle (six long with its mirror)
put('Y', 11, 31, 12, 34)   # a hay mow out in the field
put('p', 15, 32, 16, 32)   # culvert pipes by the irrigation ditch, out in the crossing
put('T', 7, 27, 8, 28)     # the diesel tank, by the shed's south door: nothing far off down the field watches it
put('f', 3, 31, 7, 31)     # a rail fence
put('y', 3, 34); put('y', 15, 36)

# ---- free-for-all spawns, spread round all three lanes (and their mirrors)
for f in [(3, 2), (12, 3), (17, 8), (9, 13), (14, 16), (9, 24), (3, 28), (9, 33), (17, 34)]: L[f[1]][f[0]] = 'F'

# ---- then a few columns of the west half left out (and their mirrors), drawn above at the old width: the two spawns
# brought closer together without redrawing the rest (m: where a column drawn above ends up)
DEL = [int(c) for c in os.environ.get('DEL', '12,17,18').split(',') if c]
KEEP = [i for i in range(HW) if i not in DEL]
m = lambda c: sum(1 for k in KEEP if k <= c) - 1
L = [[r[i] for i in KEEP] for r in L]; HW = len(KEEP); W = 2 * HW

TALL = set('#hmxYORWeuSTC')
_sw = {'A': 'B', 'B': 'A'}
_rows = [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
def _sees(rows, a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
store = lambda c: 1 <= c[0] <= m(6) and 12 <= c[1] <= 25
_open = [(i, j) for j in range(H) for i in range(W) if _rows[j][i] in '.F']
_vest = lambda c: c[0] <= m(9) and 15 <= c[1] <= 22   # (the doors' own doorway, between them and the tractor)
_out = [c for c in _open if not store(c) and c[0] != m(7) and not _vest(c) and not (c[1] in (11, 26) and c[0] <= m(6))]
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
SP = (m(3), 18)
seen = bfs(SP)
print('unreachable', [c for c in floor if c not in seen], file=sys.stderr)
A = [c for c in floor if rows[c[1]][c[0]] == 'A']; B = [c for c in floor if rows[c[1]][c[0]] == 'B']
print('spawn spots per side', len(A), file=sys.stderr)
print('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)), file=sys.stderr)
outside = [c for c in floor if not store(c) and not (c[0] <= m(7) and 11 <= c[1] <= 26) and not _vest(c)]
peek = set(o for o in outside for a in A if sees(o, a))
print('spots outside that see into the west spawn cells', len(peek), sorted(peek)[:12], file=sys.stderr)
lane = lambda c: 'N' if c[1] <= 10 else 'S' if c[1] >= 27 else 'M'
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
LONG = 26
lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > LONG and sees(a, b)), reverse=True)
print('sightlines over %d m' % LONG, len(lng), 'by lane', {ln: sum(1 for s in lng if lane(s[1]) == ln and lane(s[2]) == ln) for ln in 'NMS'}, 'across', sum(1 for s in lng if lane(s[1]) != lane(s[2])), lng[:6], file=sys.stderr)
# corridors: an open cell walled in on both sides across by something tall, and the cell before or after it along the
# way too (a doorway through a wall is one deep: not a corridor)
tl = lambda i, j: rows[j][i] in TALL
ew = lambda i, j: walk(rows[j][i]) and tl(i - 1, j) and tl(i + 1, j)
ns = lambda i, j: walk(rows[j][i]) and tl(i, j - 1) and tl(i, j + 1)
narrow = [c for c in floor if (ew(*c) and (ew(c[0], c[1] - 1) or ew(c[0], c[1] + 1))) or (ns(*c) and (ns(c[0] - 1, c[1]) or ns(c[0] + 1, c[1])))]
print('one-cell-wide spots', len(narrow), narrow[:10], file=sys.stderr)
pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
         if rows[a[1]][a[0]] in TALL and rows[b[1]][b[0]] in TALL and rows[c[1]][c[0]] not in TALL and rows[d[1]][d[0]] not in TALL]
print('corner pinches', len(pinch), pinch[:10], file=sys.stderr)
FL = (HW - 1, H // 2)
def via(w):
    d1 = bfs(SP); d2 = bfs(w); return d1[w] + d2[FL]
for nm, w in [('north', (m(10), 5)), ('middle', (m(9), 14)), ('south', (m(10), 30))]:
    m = via(w); print('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25), file=sys.stderr)
for r in rows: print(r)
import os
if os.environ.get('LONGS'):
    for ln in 'NMS': print(ln, [s for s in lng if lane(s[1]) == ln or lane(s[2]) == ln][:14], file=sys.stderr)
if os.environ.get('LONGS'): print('N-S', vis_pairs(lambda c: lane(c) == 'N', lambda c: lane(c) == 'S'), file=sys.stderr)
