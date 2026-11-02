# The arena's two small maps (src/js/world/arena-small.js): "Hawthorne Square", a market town's square that was the
# town's evacuation point, and "Saltmarsh Quay", a fishing harbour's quay where the last boats left from. Each drawn by
# hand for its west half (Blue's) and mirrored for its east (Red's), so neither side's better off.
#   python3 tools/small-plan.py square > plan.txt   (or quay; the plan on stdout, the checks on stderr)
#
# The brief, from the game as it is:
#  - Every mode, every size: Showdown 1v1 to 3v3 (one life a round, the flag in the middle once the round clock runs
#    out), Team deathmatch 3v3 and Deathmatch for six (respawning). Walk 3 m/s, sprint 5.25 m/s, crouch (eyes down to
#    about 1.05 m: low cover hides you whole), lean, vault the low things; one floor. Automatics kill in about
#    0.35-0.45 s; shotguns reach 8-13 m.
#  - Smaller than the other maps (Larkspur Mall 36 x 30, Yard 4 42 x 42): 32 x 26 m, the edge included. Spawn to the
#    flag about 3.5 s at a sprint through the middle, so a round's first fight comes quickly; room at each end for a
#    side of three to come in together, and spawn spots enough round the map for six in a deathmatch.
#  - OPEN, not rooms: each one real place, an open space broken up by what stands in it, the edges the buildings (or
#    the water) round it. And the world the game's set in: each was an evacuation point the dead overran, and what
#    stands in it is what was left when they did (a coach that never left, the army's checkpoint and its sandbags,
#    the triage tents, cars queued for the last boat, fresh graves, boarded shops).
#  - Still three ways across: along the north edge, through the open middle past the landmark, along the south edge,
#    each a different range and kind of cover; each edge broken in its middle by something tall so it's never seen
#    end to end; the middle's tents keep each end's way in from seeing straight across to the other's.
#  - Cells 1 m. Tall (stop sight and rounds): # the edge, h a building or a tent, V a vehicle (rounds go under it), U
#    one on its side or with no underside (the army's generator, the lifeboat), M a monument, a kiosk, an office's
#    porch, a stone cross or a crane's base, H a HESCO bastion, X crates or boxes stacked high, T a tree, P a post (a
#    tree's trunk or a post stops only where it stands: a look goes past it).
#    Low (seen and shot over): s sandbags, c a wrecked car (not vaulted: round it), w a low wall, g a grave or a
#    stretcher or a picnic table, k crates, pots or luggage, b a bench or a cot, f a planter, o a bollard or a bin
#    (not vaulted).
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plan_check import check

W, H = 32, 26
HW = W // 2

def mk():
    L = [['.'] * HW for _ in range(H)]
    def put(ch, i0, j0, i1=None, j1=None):
        i1 = i0 if i1 is None else i1; j1 = j0 if j1 is None else j1
        for j in range(min(j0, j1), max(j0, j1) + 1):
            for i in range(min(i0, i1), max(i0, i1) + 1): L[j][i] = ch
    put('#', 0, 0, HW - 1, 0); put('#', 0, H - 1, HW - 1, H - 1); put('#', 0, 0, 0, H - 1)
    return L, put

# ---- Hawthorne Square: the town's evacuation point, overrun. The army set up its checkpoint round the war memorial
# (sandbags, a triage tent each side of the flagpole) and the coaches came in along the road at each end; the last
# coach is still there across each end (each side's spawn behind it). North, the High Street's shops boarded up, a
# delivery van on its side and a burned-out car among the café's overturned tables, the newspaper kiosk shut up in the
# middle; south, the churchyard behind its low wall full of fresh graves (west) and the pub's beer garden barricaded
# (east), the old pump house between them
def square():
    L, put = mk()
    put('h', 1, 1, 4, 5)       # the corner shop, boarded up
    put('h', 1, 20, 4, 24)     # the cottage
    put('V', 6, 8, 7, 17)      # the last coach, across the end of the square: what keeps eyes out of the spawn
    # NORTH, the High Street (rows 1-5): close to medium. The café's tables overturned, a burned-out car at the kerb,
    # the delivery van on its side, the newspaper kiosk shut up in the middle
    put('c', 6, 2); put('c', 8, 1)     # the café's tables, on their sides
    put('c', 7, 4, 9, 5)       # the burned-out car (round it, seen over)
    put('U', 11, 4, 12, 5)     # the army's generator in its box at the kerb
    put('M', 15, 1, 15, 2)     # the kiosk (two wide with its mirror)
    put('k', 13, 5)            # the army's crates
    # MIDDLE, the checkpoint (rows 6-18): the memorial north of the flag, a triage tent each side, sandbags, the army's
    # truck south of the flag across from the memorial, dead lime trees
    put('M', 14, 6, 15, 8)     # the war memorial on its steps
    put('h', 11, 11, 12, 14)   # a triage tent
    put('s', 14, 10); put('s', 14, 15)
    put('X', 9, 7, 10, 7)      # the army's supply crates, stacked high
    put('T', 12, 9); put('T', 13, 16)
    put('H', 13, 18, 13, 19)   # HESCO bastions either side of the checkpoint's south way in (four metres between)
    # SOUTH, the churchyard (rows 19-24): its wall low with a gap, fresh graves, the yew, the pump house in the middle
    put('w', 6, 19, 8, 19); put('w', 11, 19)
    put('g', 7, 21); put('g', 9, 23); put('g', 11, 21); put('g', 13, 23)
    put('T', 8, 22)
    put('M', 10, 20)           # the churchyard's stone cross
    put('h', 15, 22, 15, 24)   # the pump house
    for f in [(5, 4), (9, 2), (13, 2), (11, 1), (9, 9), (13, 12), (9, 16), (6, 22), (10, 24), (12, 21), (15, 20), (5, 1)]: L[f[1]][f[0]] = 'F'
    return L

# ---- Saltmarsh Quay: where the last boats left from. Cars queued along the back lane for a ferry that never came
# back, the fish market's hall turned into a field hospital (its cots, the crates of supplies stacked high), a fish
# lorry abandoned across the quay road at each end (each side's spawn behind it), the quayside along the water with a
# lifeboat dragged out on its side and the crane at the edge in the middle; the ice house and the burned boat shed on
# the corners
def quay():
    L, put = mk()
    put('h', 1, 1, 3, 5)       # the ice house
    put('h', 1, 20, 3, 24)     # the boat shed, burned out
    put('V', 6, 8, 7, 17)      # a fish lorry abandoned across the quay road: what keeps eyes out of the spawn
    # NORTH, the back lane (rows 1-5): close quarters. Cars queued for the ferry, the harbourmaster's pickup, fish
    # boxes and luggage, the harbour office's porch in the middle
    put('c', 6, 4, 9, 5)       # a car left in the queue
    put('V', 9, 1, 11, 2)      # the harbourmaster's pickup, parked against the harbour office's wall
    put('k', 7, 1); put('k', 13, 6)
    put('M', 15, 1, 15, 2)     # the harbour office's porch
    # MIDDLE, the field hospital under the fish market's roof (rows 6-18): the ambulance across its north end, the
    # crates of supplies stacked in a block each side of the flag, cots, the market's posts
    put('V', 14, 6, 15, 7)     # the ambulance, across the middle (four long with its mirror)
    put('X', 9, 7, 10, 7)      # crates of supplies
    put('X', 11, 11, 12, 14)   # the medical supplies, stacked in a block
    put('b', 14, 10); put('b', 14, 15)   # cots
    put('P', 12, 9); put('P', 12, 16)    # the market's posts (the roof overhead)
    # SOUTH, the quayside (rows 19-24): pallets of net floats along its top, the lifeboat dragged out on its side, a
    # stack of fish boxes, lobster pots and luggage, bollards, the crane's base at the edge in the middle
    put('U', 13, 18, 15, 19)   # the lifeboat on its side, across the middle (six long with its mirror)
    put('w', 6, 19, 8, 19); put('w', 11, 19)
    put('X', 9, 19, 9, 20)
    put('k', 6, 21); put('k', 12, 22)
    put('o', 5, 24); put('o', 9, 24); put('o', 13, 24)
    put('M', 15, 23, 15, 24)   # the crane's base (two wide with its mirror)
    for f in [(5, 2), (8, 2), (13, 2), (11, 4), (9, 9), (13, 12), (9, 15), (6, 22), (10, 23), (12, 21), (15, 20), (4, 7)]: L[f[1]][f[0]] = 'F'
    return L

MAPS = {'square': square, 'quay': quay}
name = sys.argv[1] if len(sys.argv) > 1 else 'square'
# the spawn: the road's end between the corner buildings, behind the coach or the lorry (cols 1-6, rows 6-19); its
# spots are every open spot there that nothing out on the map can see
check({'square': 'Hawthorne Square', 'quay': 'Saltmarsh Quay'}[name], MAPS[name](), W, H, lambda c: 1 <= c[0] <= 6 and 6 <= c[1] <= 19,
      set('#hVMTPXHU'), set('#hVMXHU'), (6, 19), [('north', (13, 3)), ('middle', (11, 9)), ('south', (12, 20))], 26, 9)
