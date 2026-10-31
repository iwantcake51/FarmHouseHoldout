# The arena's plan (src/js/world/arena.js AR_PLAN), drawn by hand for its west half and mirrored for its east:
#   python3 tools/arena-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
# Checks: every open cell reachable, no line of sight from any spawn cell to any of the other side's, and how long the
# longest straight open runs and sightlines are
import sys, math
W, H = 42, 42
L = [['.'] * 21 for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def room(i0, j0, i1, j1, doors, ch='h'):
    put(ch, i0, j0, i1, j0); put(ch, i0, j1, i1, j1); put(ch, i0, j0, i0, j1); put(ch, i1, j0, i1, j1)
    for d in doors: L[d[1]][d[0]] = '.'
put('#', 0, 0, 20, 0); put('#', 0, 41, 20, 41); put('#', 0, 0, 0, 41)

# ---- spawn: a walled yard on the west end. Its east wall is solid (nothing in the middle sees it); you leave it
# north or south round the ends of that wall, past sandbags
put('h', 7, 15, 7, 26)              # the yard's east wall, 12 long
put('h', 1, 13, 5, 13); put('h', 1, 28, 5, 28)   # its north and south walls off the outer wall, open at 6-8
put('A', 2, 17, 4, 24)
put('s', 5, 15, 5, 16); put('s', 5, 25, 5, 26)   # cover at the yard's mouths

# ---- the middle: an open plaza round the centre (the flag's spot later), ringed by low cover, with a tall block each
# side of it to stop anyone seeing across it end to end
put('C', 10, 19, 11, 22)            # a container stood across the mid lane, east of the yard
put('k', 8, 16); put('k', 8, 25)    # crates at its corners
put('b', 13, 15, 13, 16); put('b', 13, 25, 13, 26)
put('h', 15, 18, 16, 18); put('h', 15, 23, 16, 23)   # wall stubs at the plaza's corners
put('s', 18, 20, 18, 21)            # sandbags round the centre
put('s', 19, 17, 20, 17); put('s', 19, 24, 20, 24)
put('o', 14, 20); put('o', 14, 21)

# ---- north lane: a warehouse against the north wall (doors west, east and south), a loading dock beside it, and a
# container pair the lane bends round
room(3, 1, 9, 7, [(3, 4), (9, 3), (6, 7), (7, 7)])
put('k', 5, 3); put('k', 7, 5)      # inside: crates
put('C', 12, 3, 17, 4)              # containers stacked along the lane, off the wall
put('k', 12, 1); put('o', 13, 1)    # the dock's corner: breaks the run along the north wall
put('b', 11, 8, 11, 10)
put('h', 14, 9, 15, 9); put('h', 15, 8); put('h', 15, 10, 15, 11)   # an L of wall to fight round
put('k', 19, 7); put('k', 19, 1, 19, 2)            # the north edge broken at the middle
put('s', 18, 11, 20, 11)
put('o', 2, 10); put('k', 1, 9)     # the west edge broken above the yard

# ---- south lane: a container yard, two rows staggered so no line runs straight through, a guard hut in the corner
put('C', 2, 32, 3, 37)              # a container on end against the west wall
room(6, 34, 10, 40, [(6, 36), (8, 34), (10, 37)])   # the guard hut, its back on the south wall
put('k', 8, 38)
put('C', 11, 30, 16, 31)
put('C', 13, 35, 14, 40)            # one stood against the south wall: the edge broken
put('b', 17, 33, 17, 35)
put('k', 19, 38); put('o', 20, 38); put('k', 20, 29)
put('h', 18, 30, 19, 30)
put('s', 11, 27, 12, 27)
put('o', 2, 30); put('k', 1, 31)    # the west edge broken below the yard

# ---- the dividers between the lanes: a container and a wall stub on each, three ways through (by the yard, mid way
# and at the very middle)
put('C', 9, 12, 12, 13); put('h', 16, 13, 16, 14); put('k', 17, 12)
put('C', 9, 28, 12, 29); put('h', 16, 27, 16, 28); put('k', 17, 29)
put('h', 20, 32, 20, 34)            # a pillar in the middle of the south lane (two wide with its mirror)
put('h', 20, 9, 20, 9); put('h', 20, 13); put('h', 20, 28)              # and one in the north
put('k', 6, 11); put('k', 7, 10); put('k', 5, 33); put('k', 5, 30); put('k', 7, 32); put('k', 18, 14)
for f in [(6, 5), (14, 6), (3, 10), (12, 20), (8, 36), (16, 37), (3, 30)]: L[f[1]][f[0]] = 'F'
sw = {'A': 'B', 'B': 'A'}
rows = [''.join(r) + ''.join(sw.get(c, c) for c in reversed(r)) for r in L]
TALL = set('#Chk')
walk = lambda c: c in '.AFB'
seen = set(); st = [(3, 20)]
while st:
    i, j = st.pop()
    if (i, j) in seen or not (0 <= i < W and 0 <= j < H) or not walk(rows[j][i]): continue
    seen.add((i, j)); st += [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]
bad = [(i, j) for j in range(H) for i in range(W) if walk(rows[j][i]) and (i, j) not in seen]
print('unreachable', bad, file=sys.stderr)
def sees(a, b):
    (x0, z0), (x1, z1) = a, b; n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
    for k in range(1, n):
        t = k / n; x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
        if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in TALL: return False
    return True
A = [(i, j) for j in range(H) for i in range(W) if rows[j][i] == 'A']
B = [(i, j) for j in range(H) for i in range(W) if rows[j][i] == 'B']
# (from anywhere in the spawn and the cells just outside it: a player stepping out shouldn't be seen from the other one)
pairs = [(a, b) for a in A for b in B if sees(a, b)]
print('spawn-to-spawn sight', len(pairs), pairs[:5], file=sys.stderr)
# the longest straight open runs, by row and column (tall things stop them; low cover doesn't)
def runs(line):
    best, cur, s0 = (0, 0), 0, 0
    for k, c in enumerate(line):
        if c in TALL: cur = 0
        else:
            cur += 1
            if cur > best[0]: best = (cur, k - cur + 1)
    return best
rr = sorted([(runs(rows[j])[0], 'row', j, runs(rows[j])[1]) for j in range(H)] + [(runs(''.join(rows[j][i] for j in range(H)))[0], 'col', i, runs(''.join(rows[j][i] for j in range(H)))[1]) for i in range(W)], reverse=True)
print('longest runs', rr[:8], file=sys.stderr)
edge = [r for r in rr if (r[1] == 'row' and r[2] in (1, 2, 39, 40)) or (r[1] == 'col' and r[2] in (1, 2, 39, 40))]
print('edge runs', edge[:6], file=sys.stderr)
# how open: share of floor cells with no tall cell within 1
op = sum(1 for (i, j) in seen if all(rows[j + dj][i + di] not in TALL for di in (-1, 0, 1) for dj in (-1, 0, 1))) / len(seen)
print('floor', len(seen), 'open share %.2f' % op, file=sys.stderr)
cells = [(i, j) for (i, j) in seen if i % 2 == 0 and j % 2 == 0]
far = max(((math.hypot(a[0] - b[0], a[1] - b[1]), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > 24 and sees(a, b)), default=None)
print('longest sightline', far, file=sys.stderr)
for r in rows: print(r)
