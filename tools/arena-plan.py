# The arena's plan (src/js/world/arena.js AR_PLAN): "Yard 4", a freight terminal yard. Drawn by hand for its west half
# (Blue's) and mirrored for its east (Red's).
#   python3 tools/arena-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s; no crouch, no jump: one floor, no verticality. Sandbags are
#    the only cover you can vault. Automatics kill in about 0.35-0.45 s; shotguns reach 8-13 m; the hunting rifle is
#    the one long gun. Camera at 1.56 m: low cover (1.05-1.15 m) hides legs and body, not heads.
#  - Cells 1 m; tall: # outer wall 3.2, h block wall 2.7, C container 2.6 (they stop sight and
#    rounds); low: b jersey barrier, s sandbags, o drum, r spool (you see and shoot over them).
#
# The layout: three lanes west to east, each its own kind of fight, joined only at the spawns and at the middle.
#  - NORTH, the Warehouse: close quarters (4-12 m). Three roofless rooms in a zig-zag (the office by the spawn, the
#    storage hall, the central hall both sides share), their doorways offset so nothing sees down the lane. For
#    shotguns and SMGs; slow but covered. Its door into the plaza is the flag's north approach.
#  - MIDDLE, the Plaza: medium (8-20 m) and the contest. A courtyard out of each spawn's gate, round a baffle and
#    between two container stacks, onto the plaza with the flag in its sandbag ring. Wall stubs at the ring's
#    corners keep it from being seen end to end.
#  - SOUTH, the Rail spur: long (15-28 m), the one place for a rifle. Open yard with low cover only: a platform edge
#    of barriers, sandbags, drums. A signal hut in the very middle stops the lane being seen end to end; a gap in the
#    container wall either side of it is the flag's south approach.
#  - Each spawn is a yard with three exits: into the warehouse office (north), onto the rail spur (south), and a gate
#    into the courtyard (east) behind a baffle wall, so nothing outside sees in. Rotations between the outer lanes go
#    back through your spawn (safe, slow) or across the plaza (fast, exposed).
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

# ---- the spawn yard (cols 1-6, rows 13-28): walled on three sides, the outer wall the fourth
put('h', 1, 12, 7, 12); put('h', 1, 29, 7, 29); put('h', 7, 12, 7, 29)
gap(2, 12, 4, 12)          # north exit, into the warehouse office
gap(2, 29, 4, 29)          # south exit, onto the rail spur
gap(7, 19, 7, 22)          # the gate east into the courtyard
put('A', 2, 16, 5, 25)     # where each side comes in
put('h', 1, 14, 5, 14); put('h', 1, 27, 5, 27)   # a baffle inside each of the north and south exits: in and out round its end (col 6), nothing outside sees in

# ---- NORTH LANE: the warehouse (rows 1-11; its south wall row 12 runs the width of the map)
put('h', 8, 12, 20, 12)
gap(17, 12, 18, 12)        # the plaza door (the flag's north approach)
put('h', 16, 14, 20, 14)   # a baffle just inside it (meeting its mirror): in round either end, so the warehouse never sees down across the plaza
put('h', 8, 1, 8, 11); gap(8, 2, 8, 4)          # office | storage hall, doorway north
put('h', 14, 1, 14, 11); gap(14, 8, 14, 10)     # storage hall | central hall, doorway south
put('k', 4, 6, 5, 7)       # office: a crate stack in the middle of the room
put('o', 2, 2); put('o', 6, 10)
put('k', 11, 5, 11, 7); put('b', 10, 10, 12, 10)   # storage hall: racking down the middle, a barrier by the door
put('k', 18, 3, 18, 4)     # central hall: crates either side of the middle, a loading-dock barrier in front of the door
put('b', 16, 9, 17, 9); put('o', 20, 7)

# ---- MIDDLE LANE: the courtyard (cols 8-13) and the plaza (cols 14-20 and its mirror)
put('h', 9, 16, 9, 25)                       # the baffle in front of the gate: nothing out here sees into the yard
put('C', 11, 14, 13, 16); put('C', 11, 25, 13, 27)   # two container stacks framing the courtyard's way onto the plaza
put('s', 12, 20, 12, 21)                     # sandbags across the courtyard's mouth
put('h', 16, 16, 16, 17); put('h', 16, 24, 16, 25)   # wall stubs at the flag ring's corners
put('s', 19, 17, 20, 17); put('s', 19, 24, 20, 24); put('s', 18, 20, 18, 21)   # the flag's sandbag ring (open at its corners)
put('b', 14, 20, 14, 21)

# ---- SOUTH LANE: the rail spur (rows 30-40; the container wall along row 29 between it and the plaza)
put('C', 8, 29, 15, 30)                      # containers along the lane's north side
gap(16, 29, 17, 30)                          # the plaza gap (the flag's south approach)
put('h', 15, 27, 20, 27)                     # a baffle just inside it, as at the north door
put('C', 18, 29, 20, 30)
put('h', 19, 34, 20, 37)                     # the signal hut in the middle (four wide with its mirror)
put('b', 6, 34, 12, 34)                      # the platform edge: barriers along the rail
put('s', 14, 33, 14, 35)                     # sandbags at the platform's end
put('C', 10, 38, 11, 40)                     # a container stood against the south wall: no run along it
put('C', 12, 31, 13, 33)                     # a container stack part way along: the lane's long, but nothing sees end to end
put('o', 3, 32); put('o', 16, 39); put('r', 6, 38)
put('k', 2, 37, 2, 38)

# ---- free-for-all spawns, spread round all three lanes (and their mirrors)
for f in [(3, 4), (11, 2), (16, 6), (10, 21), (15, 14), (15, 27), (4, 35), (12, 32), (17, 38)]: L[f[1]][f[0]] = 'F'

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
print('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)), file=sys.stderr)
outside = [c for c in floor if not yard(c) and c[0] >= 9 and not (c[0] <= 8 and 13 <= c[1] <= 28)]   # (anywhere past the yard's wall and its gate's vestibule, enemy-reachable)
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
print('sightlines over 28 m', len(lng), lng[:6], file=sys.stderr)
# timings, spawn to the flag by each lane (through a spot in it), at a sprint (5.25 m/s)
def via(w):
    d1 = bfs((3, 20)); d2 = bfs(w); return d1[w] + d2[(20, 20)]
for nm, w in [('north', (11, 9)), ('middle', (10, 16)), ('south', (12, 36))]:
    m = via(w); print('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25), file=sys.stderr)
for r in rows: print(r)
