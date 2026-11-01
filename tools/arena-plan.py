# The arena's plan (src/js/world/arena.js AR_PLAN): "Yard 4", a freight terminal's yard, overrun. Drawn by hand for its
# west half (Blue's) and mirrored for its east (Red's); the checks are tools/plan_check.py's.
#   python3 tools/arena-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s, crouch, lean, vault the low things; one floor. Automatics
#    kill in about 0.35-0.45 s; shotguns reach 8-13 m; the hunting rifle is the one long gun.
#  - Cells 1 m; tall: # outer wall, h block wall (the burned warehouse's, broken off; the weighbridge's booths; the
#    signal box), C a container (a run one deep is a wall of stacked concrete blocks, the six by three against the
#    north wall the yard office, a two by two a transformer: world/arena.js) (they stop sight and rounds); low: b
#    jersey barrier, s sandbags, k crates, o drums, r a cable spool (you see and shoot over them).
#  - OPEN, not rooms: one freight yard, the lanes made by what stands in it (the warehouse's broken walls, a train of
#    container wagons on the siding, container stacks), never by walls with doorways in them; every gap between them a
#    real way across, staggered so no line runs through two.
#
# The layout, three lanes west to east:
#  - NORTH, the warehouse floor: what's left of a burned-out warehouse, close quarters. Its roof gone and its south
#    wall broken into three pieces with wide gaps; the yard office against its north wall, containers and a
#    transformer left standing in it, crates and a barrier. The gaps either side of the middle piece are the flag's
#    north approaches.
#  - MIDDLE, the weighbridge: the contest. A container stood up in the courtyard each side, the stacks round it, the
#    weighbridge's booths and their sandbags round the flag.
#  - SOUTH, the rail spur: the long lane. A train of container wagons standing on the first siding along its north
#    side (the gaps between the wagons the way down from the middle), the signal box in the very middle, container
#    stacks part way along each side, the second siding along the platform.
#  - Each spawn is the marshalling area behind its gate: container stacks north and south of it, and a long one out in
#    front, so nothing out on the map sees in; two ways out, round either end of the long one.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan_check import check

W, H = 42, 42
L = [['.'] * 21 for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch

put('#', 0, 0, 20, 0); put('#', 0, 41, 20, 41); put('#', 0, 0, 0, 41)
# NORTH: the warehouse floor (rows 1-11), its south wall (row 12) in three pieces
put('h', 9, 1, 9, 4)
put('C', 18, 1, 20, 3)
put('C', 12, 5, 13, 7)
put('k', 5, 5, 6, 5); put('k', 10, 9, 10, 10)
put('b', 16, 6, 17, 6)
put('h', 5, 12, 11, 12); put('h', 16, 12, 20, 12)
put('C', 19, 7, 20, 8); put('C', 1, 9, 3, 10); put('C', 14, 9, 15, 10)
put('C', 1, 14, 4, 15); put('C', 1, 26, 4, 27)
# MIDDLE: the spawn's stacks and the long one in front of it, the courtyard, the weighbridge
put('C', 8, 15, 9, 26)
put('C', 13, 14, 15, 15); put('C', 13, 26, 15, 28); put('C', 13, 19, 14, 22)
put('h', 18, 16, 19, 17); put('h', 18, 24, 19, 25)
put('s', 20, 17); put('s', 20, 24); put('s', 17, 20, 17, 21)
# SOUTH: the train on the first siding (rows 29-30), the rail spur
put('C', 6, 29, 10, 30); put('C', 17, 29, 20, 30); put('C', 14, 32, 16, 33)
put('C', 4, 34, 6, 35)
put('h', 19, 34, 20, 37)
put('b', 6, 35, 9, 35)
put('s', 16, 35, 16, 37)
put('C', 12, 33, 13, 36)
put('C', 10, 39, 11, 40); put('C', 1, 38, 3, 40)
put('r', 6, 38); put('o', 16, 39)
for f in [(3, 4), (11, 2), (16, 8), (11, 21), (15, 13), (15, 28), (4, 36), (9, 33), (17, 38)]: L[f[1]][f[0]] = 'F'

# the spawn: the marshalling area behind the gate (cols 1-7, rows 16-25); its ways out round the long stack's ends don't
# count as looking in
check('Yard 4', L, W, H, lambda c: 1 <= c[0] <= 7 and 16 <= c[1] <= 25, set('#Ch'), set('#Ch'), (11, 31),
      [('north', (11, 8)), ('middle', (11, 20)), ('south', (11, 34))], 30, 9, home=lambda c: c[0] <= 9 and 12 <= c[1] <= 28)
