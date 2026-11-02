# The highway arena's plan (src/js/world/arena-route.js RT_PLAN): "Route 9", a highway services stop on the way out
# of town, abandoned in the evacuation: the travel stop's store burnt out, the army's checkpoint left standing on the
# forecourt, the highway past it jammed with the pile-up nobody came back for. Drawn by hand for its west half (Blue's)
# and mirrored for its east (Red's); the checks are tools/plan_check.py's.
#   python3 tools/route-plan.py > plan.txt   (the plan on stdout; the checks on stderr)
#
# The brief, from the game as it is:
#  - Up to 6 (FFA, 3v3 team deathmatch, Showdown 1v1 to 3v3 with one life a round and a flag in the middle once the
#    round clock runs out). Walk 3 m/s, sprint 5.25 m/s, crouch, lean, vault the low things; one floor. Automatics kill
#    in about 0.35-0.45 s; shotguns reach 8-13 m; the hunting rifle is the one long gun.
#  - Cells 1 m; tall (stop sight and rounds): # the perimeter, h block walls (the store's, the cooler's, the garage's
#    wings either side of its lot, the car wash), W blast walls (T-walls along the highway; HESCO at the checkpoint, the
#    sentry posts and the bunkers), S the store's gondolas, G a pump island, R the army's truck and its trailer, U a bus
#    on its side, X a semi's tractor; low (seen and shot over): c a wrecked car (gone round), b a jersey barrier or a
#    T-wall knocked flat, n a counter, s sandbags, k crates or pallets, d a dumpster (those vaulted).
#  - OPEN, not rooms: a real services stop. The store a building standing in its lot (the side lot and the car wash
#    beside it, not a wall across the map), the forecourt open between the truck and the checkpoint, and the army's line
#    of T-walls along the highway only in sections now, one knocked flat by the pile-up, so the highway's reached from
#    the forecourt in four places.
#
# The layout, three lanes west to east:
#  - NORTH, the Travel stop: close quarters. The store (in from the side lot by its side door or round through the
#    storeroom, its front doors onto the forecourt), the cooler and the restrooms in its very middle; the side lot
#    beside it with the car wash and the cars left in it.
#  - MIDDLE, the Forecourt: medium range and the contest. Past the truck, between the pump islands, onto the checkpoint
#    under the canopy, its sentry post in front of the store's doors.
#  - SOUTH, the Highway: the long lane, three ways along it (the westbound's shoulder behind the bunkers, the median's
#    barriers into the wedged tractors, the eastbound past the bus on its side).
#  - Each spawn is the garage's lot, its wings either side and the army's truck and trailer parked across its front:
#    two ways out, round either end of the truck (and over the fallen T-wall onto the highway).
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan_check import check

W, H = 42, 40
HW = W // 2
L = [['.'] * HW for _ in range(H)]
def put(ch, i0, j0, i1=None, j1=None):
    i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
    for j in range(min(j0, j1), max(j0, j1) + 1):
        for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
def gap(i0, j0, i1=None, j1=None): put('.', i0, j0, i1, j1)

put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)
# the garage's wings either side of its lot (the spawn)
put('h', 1, 11, 8, 11); put('h', 1, 28, 8, 28)
# NORTH: the store (cols 11-30) in its lot, the side lot west of it
put('h', 11, 1, 11, 10); put('h', 11, 11, HW - 1, 11)
gap(11, 1, 11, 3); gap(11, 6, 11, 7)
put('h', 12, 4, 15, 4)
put('h', 18, 1, HW - 1, 7)
put('k', 13, 2, 14, 2)
put('S', 15, 7, 15, 8)
put('n', 12, 6, 13, 6)
gap(13, 11, 15, 11)
put('d', 2, 2, 3, 2)
put('c', 1, 9, 4, 10)      # a car left in the side lot, nosed into the garage's wing
put('h', 4, 6, 7, 7)       # the car wash
# MIDDLE: the forecourt
put('R', 8, 14, 9, 25)
put('G', 12, 14, 15, 14); put('G', 12, 25, 15, 25)
put('W', 17, 15, 18, 16); put('W', 17, 23, 18, 24)
put('s', 19, 16, 20, 16); put('s', 19, 23, 20, 23); put('s', 18, 19, 18, 20)
put('k', 13, 20, 13, 21)   # crates of the army's stores
put('W', 13, 17, 14, 18)   # HESCO round the army's generator, out on the forecourt
put('W', 19, 12, 20, 13)   # the army's sentry post at the store's door
put('W', 11, 26, 12, 27)   # HESCO off the line where the slip road went through
# the army's line along the highway (row 28), in sections, some knocked flat by the pile-up
put('W', 9, 28, 12, 28); put('b', 15, 28, 16, 28); put('W', 17, 28, HW - 1, 28)
# SOUTH: the highway
put('b', 1, 34, 5, 34); put('b', 9, 34, 14, 34)
put('W', 15, 30, 16, 31)
put('X', 19, 32, HW - 1, 35)
put('U', 8, 36, 12, 38)
put('c', 2, 31, 5, 32)
put('c', 8, 31, 11, 32)
put('c', 15, 37, 18, 38)
for f in [(3, 4), (13, 2), (16, 6), (11, 12), (15, 17), (14, 27), (3, 30), (11, 35), (20, 37)]: L[f[1]][f[0]] = 'F'

check('Route 9', L, W, H, lambda c: 1 <= c[0] <= 7 and 13 <= c[1] <= 26, set('#hWSGRXU'), set('#hWSGRXU'), (11, 28),
      [('north', (9, 7)), ('middle', (11, 13)), ('south', (7, 33))], 30, 9, home=lambda c: c[0] <= 8 and 11 <= c[1] <= 28)

