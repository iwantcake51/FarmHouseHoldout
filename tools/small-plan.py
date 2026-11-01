# The arena's two small maps for 1v1 and 2v2 (src/js/world/arena-small.js): "Hawthorne Square", a market town's square,
# and "Saltmarsh Quay", a fishing harbour's quay. Each drawn by hand for its west half (Blue's) and mirrored for its
# east (Red's), so neither side's better off.
#   python3 tools/small-plan.py square > plan.txt   (or quay; the plan on stdout, the checks on stderr)
#
# The brief, from the game as it is:
#  - 1v1 and 2v2: Showdown (one life a round, the flag in the middle once the round clock runs out), and small Team
#    deathmatch or Deathmatch. Walk 3 m/s, sprint 5.25 m/s, crouch (eyes down to about 1.05 m: low cover hides you
#    whole), lean, vault the low things; one floor. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m.
#  - Small: 30 x 22 m inside the edge, spawn to the flag about 3 s at a sprint, so two or four players meet quickly
#    and keep meeting. Nothing seen further than about 24 m.
#  - OPEN, not rooms: each is one real place, an open space broken up by what stands in it (a parked bus, a war
#    memorial, a market hall's posts, a hauled-out boat, trees, low walls, tables), not walls with doors in them. Its
#    edges are the buildings round it, and its corners the buildings on them.
#  - Still three ways across: along the north edge, through the open middle past the landmark, and along the south
#    edge, each a different range and kind of cover; no line from the north edge to the south past the middle's
#    landmark, and each edge broken in its middle by something tall so it's never seen end to end.
#  - Cells 1 m. Tall (stop sight and rounds): # the edge, h a building, V a vehicle or a boat, M a monument, a crane's
#    base or a kiosk (2 x 2 with its mirror), T a tree, P a post or a phone box. Low (seen and shot over; vaulted): c a
#    table, w a low wall, g a gravestone or a picnic table or a gutting bench, k crates or pots, b a bench, f a
#    planter, o a bollard or a bin (not vaulted: round it).
import sys, math

W, H = 30, 22
HW = W // 2

def blank():
    return [['.'] * HW for _ in range(H)]
def mk():
    L = blank()
    def put(ch, i0, j0, i1=None, j1=None):
        i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
        for j in range(min(j0, j1), max(j0, j1) + 1):
            for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
    put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)
    return L, put

# ---- Hawthorne Square: a market town's square on a Saturday morning, the market half set up. The road comes in at
# each end between the corner buildings (each side's spawn, a bus parked at its stop across the end of the square); the
# High Street pavement along the north under the shops' awnings; the square itself in the middle round the war
# memorial; the churchyard (west) and the pub's beer garden (east) along the south behind their low walls
def square():
    L, put = mk()
    put('h', 1, 1, 4, 4)       # the corner shop on the north-west corner
    put('h', 1, 17, 4, 20)     # and the cottage on the south-west
    put('V', 6, 7, 7, 14)      # the bus at its stop, broadside to the square: what keeps eyes out of the spawn
    # NORTH, the High Street pavement (rows 1-5): close to medium. The café's tables, the phone box, the delivery van at
    # the kerb, the newspaper kiosk in the middle so it's never seen end to end
    put('c', 7, 2); put('c', 9, 2)   # the café's tables out on the pavement
    put('P', 5, 4)             # the red phone box on the corner
    put('V', 9, 4, 11, 5)      # the delivery van, parked at the kerb
    put('M', 14, 1, 14, 3)     # the newspaper kiosk in the middle of the pavement, against the shops
    # MIDDLE, the square (rows 6-15): the contest. The war memorial north of the flag, the lime trees, a market stall
    # against the bus, a bench and a planter
    put('M', 13, 6, 14, 7)     # the war memorial on its steps (four wide with its mirror) north of the flag
    put('T', 10, 8); put('T', 9, 14)   # lime trees
    put('h', 8, 10, 8, 11)     # a market stall, its back to the bus (stands taller than you)
    put('b', 12, 8); put('f', 12, 13)   # a bench, a planter
    # SOUTH, the churchyard / the beer garden (rows 16-20): medium-long over low cover. A low stone wall with its gate,
    # the gravestones / picnic tables, the yew, the church porch / the pub's back door in the middle
    put('w', 5, 16, 7, 16); put('w', 10, 16, 11, 16)   # the low wall, the gate gap between
    put('g', 7, 18); put('g', 9, 19); put('g', 11, 18)   # gravestones (picnic tables east)
    put('T', 13, 16)           # the yew by the gate (a chestnut east)
    put('h', 14, 18, 14, 20)   # the church porch in the middle (the pub's back porch east)
    for f in [(5, 2), (8, 4), (12, 1), (8, 15), (12, 11), (6, 19), (11, 20), (13, 15)]: L[f[1]][f[0]] = 'F'
    return L

# ---- Saltmarsh Quay: a fishing harbour's quay at the end of the day, the boats in. The quay road comes in at each end
# past the ice house (each side's spawn, a boat hauled out on its trailer across the end); the lane along the backs of
# the harbour buildings north; the open quay apron in the middle under the fish market's roof; the quayside along the
# water's edge south with its bollards, the crane in the middle
def quay():
    L, put = mk()
    put('h', 1, 1, 3, 4)       # the ice house on the north-west corner
    put('h', 1, 17, 3, 20)     # the boat shed on the south-west, open to the water
    put('V', 6, 7, 7, 14)      # a boat on its trailer across the end of the quay: what keeps eyes out of the spawn
    # NORTH, the back lane (rows 1-5): close quarters. Stacks of fish boxes and lobster pots against the buildings, the
    # harbourmaster's pickup, the harbour office in the middle so it's never seen end to end
    put('k', 7, 1, 8, 1); put('k', 11, 2)   # fish boxes, stacked low
    put('V', 8, 4, 11, 5)      # the harbourmaster's pickup, parked along the lane
    put('M', 14, 1, 14, 3)     # the harbour office's porch block in the middle
    # MIDDLE, the quay apron (rows 6-14): the contest, under the fish market's roof (open sided: only its posts stop
    # anything), its gutting benches, fish boxes stacked tall by the boat, the flag under the roof between them
    put('P', 10, 8); put('P', 10, 13)   # the market's corner posts (the roof on them overhead; its middle spans clear)
    put('X', 14, 6)            # fish boxes stacked tall against the market's north side
    put('g', 12, 9); put('g', 12, 12)   # gutting benches
    put('X', 11, 10); put('k', 9, 12)   # fish boxes by the boat, one stack taller than you
    put('o', 14, 14)           # the scales on their stand
    # SOUTH, the quayside (rows 15-20): medium-long along the water. Lobster pots, bollards, coiled rope, a stack of fish
    # boxes either side of the middle and the crane's base at the water's edge between them, so it's never seen end to end
    put('k', 7, 17, 8, 17); put('k', 10, 19)   # lobster pots
    put('o', 5, 20); put('o', 9, 20); put('o', 12, 20)   # bollards
    put('X', 11, 16, 11, 17)   # fish boxes stacked tall
    put('M', 14, 17, 14, 20)   # the crane's base at the quay's edge (two wide with its mirror)
    put('w', 9, 15, 10, 15)    # a low wall of net floats and pallets
    for f in [(5, 2), (8, 3), (12, 1), (8, 11), (13, 10), (6, 18), (11, 18), (13, 16)]: L[f[1]][f[0]] = 'F'
    return L

MAPS = {'square': square, 'quay': quay}
name = sys.argv[1] if len(sys.argv) > 1 else 'square'
L = MAPS[name]()
TALL = set('#hVMTPX')
_sw = {'A': 'B', 'B': 'A'}
mirror = lambda L: [''.join(r) + ''.join(_sw.get(c, c) for c in reversed(r)) for r in L]
def _sees(rows, a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
# the spawn: the road's end between the corner buildings, behind the bus or boat (cols 1-5, rows 6-15); its spots are
# every open spot there that nothing outside it can see
SPAWN = lambda c: 1 <= c[0] <= 5 and 5 <= c[1] <= 16
_rows = mirror(L)
_open = [(i, j) for j in range(H) for i in range(W) if _rows[j][i] in '.F']
_out = [c for c in _open if not SPAWN(c) and not SPAWN((W - 1 - c[0], c[1])) and c[0] >= 8 and c[0] <= W - 9]
for c in [c for c in _open if SPAWN(c)]:
    if not any(_sees(_rows, o, c) for o in _out): L[c[1]][c[0]] = 'A'
rows = mirror(L)
walk = lambda c: c in '.AFB'

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
A = [c for c in floor if rows[c[1]][c[0]] == 'A']; B = [c for c in floor if rows[c[1]][c[0]] == 'B']
SP = A[len(A) // 2] if A else (2, 10)
d0 = bfs(SP)
err = lambda *a: print(*a, file=sys.stderr)
err('==', name)
err('unreachable', [c for c in floor if c not in d0])
err('spawn spots per side', len(A), A)
err('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)))
lane = lambda c: 'N' if c[1] <= 5 else 'S' if c[1] >= 16 else 'M'
cells = [c for c in floor if c[0] % 2 == 0 and c[1] % 2 == 0]
def vis_pairs(fa, fb): return [(a, b) for a in cells if fa(a) for b in cells if fb(b) and sees(a, b)]
nsp = vis_pairs(lambda c: lane(c) == 'N' and 8 <= c[0] <= W - 9, lambda c: lane(c) == 'S' and 8 <= c[0] <= W - 9)
err('north edge sees south edge (pairs, middle part)', len(nsp), nsp[:6])
for ln in 'NMS':
    cs = [c for c in cells if lane(c) == ln and not SPAWN(c) and not SPAWN((W - 1 - c[0], c[1]))]
    far = sorted(max([math.hypot(a[0] - b[0], a[1] - b[1]) for b in cs if b != a and sees(a, b)] or [0]) for a in cs)
    err('lane', ln, 'sight median %.0f m, 90%% %.0f m, most %.0f m' % (far[len(far) // 2], far[int(len(far) * 0.9)], far[-1]))
def runs(line):
    best, cur = 0, 0
    for c in line:
        cur = 0 if c in TALL else cur + 1; best = max(best, cur)
    return best
err('edge runs: north %d, south %d' % (max(runs(rows[1]), runs(rows[2])), max(runs(rows[H - 2]), runs(rows[H - 3]))))
LONG = 24
lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > LONG and sees(a, b)), reverse=True)
err('sightlines over %d m' % LONG, len(lng), lng[:4])
pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
         if rows[a[1]][a[0]] in TALL and rows[b[1]][b[0]] in TALL and rows[c[1]][c[0]] not in TALL and rows[d[1]][d[0]] not in TALL]
err('corner pinches', len(pinch), pinch[:6])
narrow = [c for c in floor if (rows[c[1]][c[0] - 1] in TALL and rows[c[1]][c[0] + 1] in TALL) or (rows[c[1] - 1][c[0]] in TALL and rows[c[1] + 1][c[0]] in TALL)]
err('one-cell-wide spots', len(narrow), narrow[:8])
FL = (HW - 1, H // 2)
err('flag area clear', all(walk(rows[j][i]) for i in range(HW - 2, HW + 2) for j in range(H // 2 - 2, H // 2 + 2)))
for nm, w in [('north', (9, 3)), ('middle', (11, 10)), ('south', (9, 18))]:
    if w not in d0: err('no way via', nm); continue
    m = d0[w] + bfs(w)[FL]; err('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25))
# how much of the open floor sees the flag's middle (an open place, not rooms: most of it should)
err('floor that sees the flag', '%d%%' % (100 * sum(1 for c in floor if sees(c, FL)) / len(floor)))
for r in rows: print(r)
