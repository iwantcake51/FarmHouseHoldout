# The checks every arena map's plan goes through (tools/arena-plan.py, route-plan.py, farm-plan.py, mall-plan.py,
# small-plan.py each draw their map's west half and hand it here): it's mirrored for the east (A and B swapped), each
# side's spawn spots worked out (every open spot in its spawn that nothing out on the map can see), and then:
#  - reachability, spawn spots (and how many a side of three can stand on 1.4 m apart, as world/arena.js yardSpots
#    lays them), spawn-to-spawn sight, how many deathmatch spots see each other
#  - how far each lane sees (north, middle, south), whether the north lane sees into the south one, the longest lines
#  - corner pinches (two solid cells touching only at a corner), one-cell-wide squeezes between solid things, and every
#    doorway or gap between solid things two metres wide or less (a way through should be three or more, so a doorway
#    never feels like a squeeze)
#  - the flag's ground clear, spawn to flag at a sprint by each lane, how much floor sees the flag
# On stderr; the plan itself on stdout, a row a line from north to south.
import sys, math, heapq

err = lambda *a: print(*a, file=sys.stderr)


def doorways(rows, solid, W, H):
    """the openings between two solid things, along a row or a column, two cells wide or less, that are ways through
    (open on both sides across them): [(width, first cell, along)], the west half's"""
    out = set()
    for j in range(H):
        for i in range(W // 2):
            if rows[j][i] not in solid: continue
            for di, dj in ((1, 0), (0, 1)):
                n, a, b = 0, i + di, j + dj
                while 0 <= a < W and 0 <= b < H and rows[b][a] not in solid: n += 1; a += di; b += dj
                if not (1 <= n <= 2 and 0 <= a < W and 0 <= b < H): continue
                cells = [(i + di * k, j + dj * k) for k in range(1, n + 1)]
                if any(0 <= x - dj and x + dj < W and 0 <= y - di and y + di < H and rows[y + di][x + dj] not in solid and rows[y - di][x - dj] not in solid for x, y in cells):
                    out.add((n, cells[0], 'x' if di else 'z'))
    return sorted(out)


def check(name, L, W, H, spawn, tall, solid, lanes, ways, long_m, out_margin, walk='.AFB', home=None):
    """L: the west half, a list of rows (lists of chars, W // 2 wide); spawn(c): whether plan cell c = (i, j) is in
    the west side's spawn; tall: kinds that stop you; solid: those of them that stop a look (all but thin trunks and
    posts); lanes: (last north row, first south row); ways: [(name, (i, j))] a cell on each lane's way; long_m: the
    line length that counts as long; out_margin: how far in from each end the cells that look for the spawns start (or
    home(c): the cells round the west spawn, its own ways out, that don't count as looking in)"""
    HW = W // 2
    sw = {'A': 'B', 'B': 'A'}
    mirror = lambda L: [''.join(r) + ''.join(sw.get(c, c) for c in reversed(r)) for r in L]

    def sees_in(rows, a, b):
        (x0, z0), (x1, z1) = a, b
        n = int(max(abs(x1 - x0), abs(z1 - z0)) * 4) + 1
        for k in range(1, n):
            t = k / n
            x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            if rows[int(math.floor(z + 0.5))][int(math.floor(x + 0.5))] in solid: return False
        return True

    rows0 = mirror(L)
    opn = [(i, j) for j in range(H) for i in range(W) if rows0[j][i] in '.F']
    if home: out = [c for c in opn if not home(c) and not home((W - 1 - c[0], c[1]))]
    else: out = [c for c in opn if not spawn(c) and not spawn((W - 1 - c[0], c[1])) and out_margin <= c[0] <= W - 1 - out_margin]
    for c in [c for c in opn if spawn(c) and c[0] < HW]:
        if not any(sees_in(rows0, o, c) for o in out): L[c[1]][c[0]] = 'A'
    rows = mirror(L)
    sees = lambda a, b: sees_in(rows, a, b)
    isw = lambda ch: ch in walk

    def bfs(src):
        d = {src: 0}; q = [(0, src)]
        while q:
            c, (i, j) = heapq.heappop(q)
            if c > d[(i, j)]: continue
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if not di and not dj: continue
                    ni, nj = i + di, j + dj
                    if not (0 <= ni < W and 0 <= nj < H) or not isw(rows[nj][ni]): continue
                    if di and dj and (not isw(rows[j][ni]) or not isw(rows[nj][i])): continue
                    nc = c + (1.4142 if di and dj else 1)
                    if nc < d.get((ni, nj), 1e9): d[(ni, nj)] = nc; heapq.heappush(q, (nc, (ni, nj)))
        return d

    floor = [(i, j) for j in range(H) for i in range(W) if isw(rows[j][i])]
    A = [c for c in floor if rows[c[1]][c[0]] == 'A']; B = [c for c in floor if rows[c[1]][c[0]] == 'B']
    Fs = [c for c in floor if rows[c[1]][c[0]] == 'F']
    SP = A[len(A) // 2] if A else floor[0]
    d0 = bfs(SP)
    err('==', name, '(%d x %d m)' % (W, H))
    err('unreachable', [c for c in floor if c not in d0][:12])
    far = []
    for c in A:
        if all(math.hypot(c[0] - o[0], c[1] - o[1]) >= 1.4 for o in far): far.append(c)
    err('spawn spots per side', len(A), '(%d at least 1.4 m apart)' % len(far))
    err('spawn to spawn sight', sum(1 for a in A for b in B if sees(a, b)))
    err('deathmatch spots', len(Fs), 'pairs that see each other %d of %d' % (sum(1 for k, a in enumerate(Fs) for b in Fs[k + 1:] if sees(a, b)), len(Fs) * (len(Fs) - 1) // 2))
    lane = lambda c: 'N' if c[1] <= lanes[0] else 'S' if c[1] >= lanes[1] else 'M'
    cells = [c for c in floor if c[0] % 2 == 0 and c[1] % 2 == 0]
    inner = lambda c: out_margin <= c[0] <= W - 1 - out_margin
    nsp = [(a, b) for a in cells if lane(a) == 'N' and inner(a) for b in cells if lane(b) == 'S' and inner(b) and sees(a, b)]
    err('north lane sees south lane (pairs, middle part)', len(nsp), nsp[:6])
    for ln in 'NMS':
        cs = [c for c in cells if lane(c) == ln and not spawn(c) and not spawn((W - 1 - c[0], c[1]))]
        if not cs: continue
        fr = sorted(max([math.hypot(a[0] - b[0], a[1] - b[1]) for b in cs if b != a and sees(a, b)] or [0]) for a in cs)
        err('lane', ln, 'sight median %.0f m, 90%% %.0f m, most %.0f m' % (fr[len(fr) // 2], fr[int(len(fr) * 0.9)], fr[-1]))
    lng = sorted(((round(math.hypot(a[0] - b[0], a[1] - b[1]), 1), a, b) for k, a in enumerate(cells) for b in cells[k + 1:] if math.hypot(a[0] - b[0], a[1] - b[1]) > long_m and sees(a, b)), reverse=True)
    err('sightlines over %d m' % long_m, len(lng), lng[:4])
    pinch = [(i, j) for j in range(H - 1) for i in range(W - 1) for (a, b, c, d) in [((i, j), (i + 1, j + 1), (i + 1, j), (i, j + 1)), ((i + 1, j), (i, j + 1), (i, j), (i + 1, j + 1))]
             if rows[a[1]][a[0]] in solid and rows[b[1]][b[0]] in solid and rows[c[1]][c[0]] not in tall and rows[d[1]][d[0]] not in tall]
    err('corner pinches', len(pinch), pinch[:6])
    narrow = [c for c in floor if (rows[c[1]][c[0] - 1] in solid and rows[c[1]][c[0] + 1] in solid) or (rows[c[1] - 1][c[0]] in solid and rows[c[1] + 1][c[0]] in solid)]
    err('one-cell-wide spots', len(narrow), narrow[:8])
    tight = doorways(rows, solid, W, H)
    err('ways two metres wide or less (west half)', len(tight), tight[:12])
    FL = (HW - 1, H // 2)
    err('flag area clear', all(isw(rows[j][i]) for i in range(HW - 2, HW + 2) for j in range(H // 2 - 2, H // 2 + 2)))
    dF = bfs(FL)
    for nm, w in ways:
        if w not in d0: err('no way via', nm, w); continue
        m = d0[w] + bfs(w)[FL]; err('spawn to flag via %s: %.0f m, %.1f s sprinting' % (nm, m, m / 5.25))
    err('spawn to flag, shortest: %.1f s' % (dF.get(SP, 999) / 5.25))
    err('floor that sees the flag', '%d%%' % (100 * sum(1 for c in floor if sees(c, FL)) / len(floor)))
    for r in rows: print(r)
    return rows
