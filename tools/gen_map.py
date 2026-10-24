#!/usr/bin/env python3
"""Procedural map generator -> Tiled JSON the game engine understands.

    python3 tools/gen_map.py arena
    python3 tools/gen_map.py all

Each preset describes size, biome (tileset) and feature density. Generation is seeded so a
preset always produces the same map; bump the seed to roll a new layout.

Layers produced (same names/semantics as the hand-made test_map.json):
    Floor, FloorDetails_0..n         ground + overhang edge tiles           (zIndex 0)
    WallTiles                        stone wall sprites                     (zIndex 0)
    TopMapDetails_1                  trees / roofs drawn above the player   (zIndex 1)
    SeaWalls, Walls                  collision rectangles
    PlayerSpawns, LifeBoxSpawns, AmmoBoxSpawns, DoubleDamageSpawns, MaximumDefenseSpawns
"""
import json
import math
import os
import random
import sys
from collections import deque

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
TILE = 100

# gids (tile index + 1) shared by every tileset image
G = {
    'A': [1, 2, 3, 4, 5], 'A_rock': 6, 'A_edge': 7,
    'B': [19, 20, 23], 'B_rock': [21, 22], 'B_edge': 24,
    'water': [36, 36, 36, 37, 38, 39], 'water_anim': 40,
    'bridge_v': 64, 'bridge_h': 65,
    'bush': [74, 75, 76, 77, 78], 'flower': [79, 80],
    'roof': [83, 84, 85, 86, 87, 88, 89, 90],
    'tree': [103, 104, 105, 106, 107],
    'cobble': 110, 'cobble2': 111,
    # walls by connection set (N E S W), see tools/gen_tileset.py WALL_SHAPES
    'wall': {
        frozenset('ES'): 41, frozenset('SW'): 43, frozenset('NE'): 56, frozenset('NW'): 59,
        frozenset('EW'): [57, 58, 42, 47], frozenset('NS'): [46, 55, 54],
        frozenset('ESW'): 48, frozenset('NEW'): 49, frozenset('NSE'): 51, frozenset('NSW'): 52,
        frozenset('NESW'): 46, frozenset('E'): 45, frozenset('W'): 45, frozenset('N'): 54, frozenset('S'): 54,
        frozenset(): 45
    }
}
# Multi-tile props: gids row-major, `solid` = cells (col,row) that block movement.
# The boat uses the very same slots as the hand-made boat on the classic sheet, so it is
# available in every biome; the other props only exist on the generated biome sheets.
PROPS = {
    'boat': dict(w=2, h=4, gids=[112, 113, 114, 115, 116, 117, 118, 119], solid=[(0, 1), (1, 1), (0, 2), (1, 2), (0, 3), (1, 3)], where='coast'),
    'plane': dict(w=4, h=3, gids=list(range(91, 103)), solid=[(0, 1), (1, 1), (2, 1), (3, 1), (1, 0), (2, 0), (1, 2)], where='land'),
    'ruin': dict(w=2, h=3, gids=[66, 67, 68, 69, 70, 71], solid=[(0, 0), (1, 0), (0, 1), (1, 1), (0, 2), (1, 2)], where='land'),
    'barrel': dict(w=1, h=1, gids=[60], solid=[(0, 0)], where='land'),
    'crates': dict(w=1, h=1, gids=[61], solid=[(0, 0)], where='land'),
    'sandbags_h': dict(w=1, h=1, gids=[62], solid=[(0, 0)], where='land'),
    'sandbags_v': dict(w=1, h=1, gids=[63], solid=[(0, 0)], where='land'),
    'rubble': dict(w=1, h=1, gids=[72], solid=[], where='land'),
    'debris': dict(w=1, h=1, gids=[73], solid=[], where='land'),
    'crater': dict(w=1, h=1, gids=[108], solid=[], where='land'),
    'scorch': dict(w=1, h=1, gids=[109], solid=[], where='land'),
}
CLASSIC_PROPS = ['boat']

EDGE_ORDER = ['S', 'WS', 'ES', 'W', 'E', 'N', 'NW', 'NE', 'sw', 'se', 'nw', 'ne']
WEAPONS = ['RocketLuncher', 'MachineGun', 'Spas', 'LightGun', 'CurveGun', 'Bow']

PRESETS = {
    'arena': dict(
        name='Arena', width=34, height=28, seed=4242, biome='classic', image='images/map_sprites.png',
        island=0.0, lakes=0.0, b_ratio=0.35, walls=14, plazas=2, trees=10, bushes=12,
        player_spawns=4, life=2, ammo=5, dd=1, md=1, ambient='petals', outside=40, background='#339eff',
        ring=True, props={'boat': 2}
    ),
    'desert_outpost': dict(
        name='Desert Outpost', width=64, height=52, seed=1337, biome='desert', image='images/map_sprites_desert.png',
        island=0.3, lakes=0.22, b_ratio=0.3, walls=34, plazas=5, trees=40, bushes=50,
        player_spawns=6, life=4, ammo=12, dd=2, md=1, ambient='dust', outside=1, background='#e9c97a',
        buildings=4,
        props={'plane': 1, 'ruin': 3, 'boat': 2, 'barrel': 8, 'crates': 6, 'sandbags_h': 6, 'sandbags_v': 6, 'rubble': 8, 'debris': 5, 'crater': 6, 'scorch': 4}
    ),
    'frozen_lake': dict(
        name='Frozen Lake', width=120, height=100, seed=777, biome='winter', image='images/map_sprites_winter.png',
        island=0.5, lakes=0.5, b_ratio=0.45, walls=70, plazas=8, trees=160, bushes=120,
        player_spawns=8, life=8, ammo=24, dd=3, md=2, ambient='snow', outside=40, background='#1e5f9b',
        buildings=7,
        props={'plane': 2, 'ruin': 6, 'boat': 4, 'barrel': 16, 'crates': 12, 'sandbags_h': 10, 'sandbags_v': 10, 'rubble': 14, 'debris': 8, 'crater': 10, 'scorch': 6}
    ),
}


class MapGen:
    def __init__(self, preset):
        self.p = preset
        self.W, self.H = preset['width'], preset['height']
        self.rnd = random.Random(preset['seed'])
        # terrain classes: 'A' grass/sand/snow, 'B' dirt/rock/ice, 'W' water, 'C' cobble, 'X' bridge
        self.cls = [['W'] * self.W for _ in range(self.H)]
        self.walls = set()
        self.solid = set()   # prop cells that block movement (collision boxes, no wall sprite)
        self.props = {}      # (x, y) -> gid of prop tiles
        self.top = {}
        self.detail_extra = {}
        self.bridges = {}
        self.objects = {k: [] for k in ['SeaWalls', 'Walls', 'PlayerSpawns', 'LifeBoxSpawns', 'AmmoBoxSpawns', 'DoubleDamageSpawns', 'MaximumDefenseSpawns']}
        self.next_id = 1

    # ------------------------------------------------------------ helpers
    def inb(self, x, y):
        return 0 <= x < self.W and 0 <= y < self.H

    def noise(self, w, h, octaves, seed):
        """Cheap value noise in [0,1]."""
        r = random.Random(seed)
        base = [[r.random() for _ in range(w + 1)] for _ in range(h + 1)]
        out = [[0.0] * self.W for _ in range(self.H)]
        amp, total = 1.0, 0.0
        grids = []
        for o in range(octaves):
            gw, gh = w * (2 ** o), h * (2 ** o)
            grids.append(([[r.random() for _ in range(gw + 2)] for _ in range(gh + 2)], gw, gh, amp))
            total += amp
            amp *= 0.5
        for y in range(self.H):
            for x in range(self.W):
                v = 0.0
                for grid, gw, gh, amp in grids:
                    fx, fy = x / self.W * gw, y / self.H * gh
                    ix, iy = int(fx), int(fy)
                    tx, ty = fx - ix, fy - iy
                    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
                    a = grid[iy][ix] * (1 - tx) + grid[iy][ix + 1] * tx
                    b = grid[iy + 1][ix] * (1 - tx) + grid[iy + 1][ix + 1] * tx
                    v += (a * (1 - ty) + b * ty) * amp
                out[y][x] = v / total
        return out

    def walkable(self, x, y):
        return self.inb(x, y) and self.cls[y][x] in 'ABCX' and (x, y) not in self.walls and (x, y) not in self.solid

    def components(self):
        seen = set()
        comps = []
        for y in range(self.H):
            for x in range(self.W):
                if (x, y) in seen or not self.walkable(x, y):
                    continue
                comp = []
                q = deque([(x, y)])
                seen.add((x, y))
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n = (cx + dx, cy + dy)
                        if n not in seen and self.walkable(*n):
                            seen.add(n)
                            q.append(n)
                comps.append(comp)
        comps.sort(key=len, reverse=True)
        return comps

    # ------------------------------------------------------------ terrain
    def terrain(self):
        p = self.p
        land = self.noise(4, 4, 3, p['seed'])
        kind = self.noise(5, 5, 2, p['seed'] + 1)
        for y in range(self.H):
            for x in range(self.W):
                # radial falloff makes an island; margin ring is always water
                nx, ny = (x + 0.5) / self.W * 2 - 1, (y + 0.5) / self.H * 2 - 1
                d = math.sqrt(nx * nx + ny * ny)
                v = land[y][x] - max(0.0, d - 0.55) * p['island'] * 1.6
                edge = x < 1 or y < 1 or x >= self.W - 1 or y >= self.H - 1
                if edge or v < 0.3 + p['lakes'] * 0.18:
                    self.cls[y][x] = 'W'
                else:
                    self.cls[y][x] = 'B' if kind[y][x] < p['b_ratio'] else 'A'
        if p.get('ring'):
            for y in range(self.H):
                for x in range(self.W):
                    if 1 <= x < self.W - 1 and 1 <= y < self.H - 1:
                        self.cls[y][x] = 'B' if kind[y][x] < p['b_ratio'] else 'A'
        # Smooth out single-cell specks (they produce ugly edge soup)
        for _ in range(2):
            for y in range(1, self.H - 1):
                for x in range(1, self.W - 1):
                    n = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if self.cls[y + dy][x + dx] == 'W')
                    if self.cls[y][x] != 'W' and n >= 3:
                        self.cls[y][x] = 'W'
                    elif self.cls[y][x] == 'W' and n == 0:
                        self.cls[y][x] = 'A'
        self.connect_islands()
        comps = self.components()
        for comp in comps[1:]:
            for x, y in comp:
                self.cls[y][x] = 'W'

    def connect_islands(self):
        """Bridge secondary islands to the main one when a short straight water crossing exists."""
        comps = self.components()
        if not comps:
            return
        main = set(comps[0])
        for comp in comps[1:]:
            if len(comp) < 12:
                continue
            best = None
            for x, y in comp:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    path = []
                    cx, cy = x + dx, y + dy
                    while self.inb(cx, cy) and self.cls[cy][cx] == 'W' and len(path) < 5:
                        path.append((cx, cy))
                        cx, cy = cx + dx, cy + dy
                    if path and (cx, cy) in main and (best is None or len(path) < len(best[0])):
                        best = (path, dx)
            if best:
                path, dx = best
                for bx, by in path:
                    self.cls[by][bx] = 'X'
                    self.bridges[(bx, by)] = G['bridge_h'] if dx else G['bridge_v']
                main |= set(comp) | set(path)

    # ------------------------------------------------------------ features
    def rect_free(self, x0, y0, w, h, classes='AB', margin=0):
        for y in range(y0 - margin, y0 + h + margin):
            for x in range(x0 - margin, x0 + w + margin):
                if not self.inb(x, y) or self.cls[y][x] not in classes or (x, y) in self.walls or (x, y) in self.top or (x, y) in self.props:
                    return False
        return True

    def place_plazas(self):
        for _ in range(self.p['plazas'] * 20):
            if sum(1 for row in self.cls for c in row if c == 'C') >= self.p['plazas'] * 14:
                break
            w, h = self.rnd.randint(3, 6), self.rnd.randint(3, 5)
            x0, y0 = self.rnd.randint(2, self.W - w - 2), self.rnd.randint(2, self.H - h - 2)
            if self.rect_free(x0, y0, w, h, 'AB', 1):
                for y in range(y0, y0 + h):
                    for x in range(x0, x0 + w):
                        self.cls[y][x] = 'C'

    def try_walls(self, cells):
        if any(not self.inb(x, y) or self.cls[y][x] not in 'ABC' or (x, y) in self.walls or (x, y) in self.props for x, y in cells):
            return False
        # keep a one-cell gap from existing walls so corridors stay passable
        for x, y in cells:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if (x + dx, y + dy) in self.walls and (x + dx, y + dy) not in cells:
                        return False
        before = len(self.components()[0])
        self.walls |= set(cells)
        comps = self.components()
        if not comps or len(comps[0]) < before - len(cells) - 2:
            self.walls -= set(cells)
            return False
        return True

    def place_walls(self):
        placed = 0
        attempts = 0
        while placed < self.p['walls'] and attempts < self.p['walls'] * 40:
            attempts += 1
            x, y = self.rnd.randint(2, self.W - 3), self.rnd.randint(2, self.H - 3)
            kind = self.rnd.random()
            cells = []
            if kind < 0.45:
                length = self.rnd.randint(3, 7)
                dx, dy = self.rnd.choice([(1, 0), (0, 1)])
                cells = [(x + dx * i, y + dy * i) for i in range(length)]
            elif kind < 0.8:
                l1, l2 = self.rnd.randint(3, 6), self.rnd.randint(3, 6)
                sx, sy = self.rnd.choice([1, -1]), self.rnd.choice([1, -1])
                cells = [(x + sx * i, y) for i in range(l1)] + [(x, y + sy * i) for i in range(1, l2)]
            else:
                # U shaped cover
                w, h = self.rnd.randint(3, 5), self.rnd.randint(2, 4)
                cells = [(x + i, y) for i in range(w)] + [(x, y + i) for i in range(1, h)] + [(x + w - 1, y + i) for i in range(1, h)]
            if self.try_walls(cells):
                placed += 1

    def place_buildings(self):
        for _ in range(self.p.get('buildings', 0) * 25):
            if sum(1 for v in self.top.values() if v in G['roof']) >= self.p.get('buildings', 0) * 12:
                break
            w, h = self.rnd.randint(3, 5), self.rnd.randint(3, 4)
            x0, y0 = self.rnd.randint(3, self.W - w - 3), self.rnd.randint(3, self.H - h - 3)
            if not self.rect_free(x0, y0, w, h, 'ABC', 2):
                continue
            door_side = self.rnd.choice('NESW')
            cells = []
            for y in range(y0, y0 + h):
                for x in range(x0, x0 + w):
                    border = x in (x0, x0 + w - 1) or y in (y0, y0 + h - 1)
                    if not border:
                        continue
                    mid_x, mid_y = x0 + w // 2, y0 + h // 2
                    is_door = ((door_side == 'N' and y == y0 and x == mid_x) or (door_side == 'S' and y == y0 + h - 1 and x == mid_x) or
                               (door_side == 'W' and x == x0 and y == mid_y) or (door_side == 'E' and x == x0 + w - 1 and y == mid_y))
                    if not is_door:
                        cells.append((x, y))
            if self.try_walls(cells):
                for y in range(y0, y0 + h):
                    for x in range(x0, x0 + w):
                        self.top[(x, y)] = self.rnd.choice(G['roof'])
                for y in range(y0, y0 + h):
                    for x in range(x0, x0 + w):
                        if (x, y) not in self.walls:
                            self.cls[y][x] = 'C'

    def place_props(self):
        wanted = self.p.get('props', {})
        if self.p['biome'] == 'classic':
            wanted = {k: v for k, v in wanted.items() if k in CLASSIC_PROPS}
        for name, count in wanted.items():
            prop = PROPS[name]
            placed, attempts = 0, 0
            while placed < count and attempts < count * 60:
                attempts += 1
                x0, y0 = self.rnd.randint(0, self.W - prop['w']), self.rnd.randint(0, self.H - prop['h'])
                cells = [(x0 + dx, y0 + dy) for dy in range(prop['h']) for dx in range(prop['w'])]
                if any((c in self.walls or c in self.props or c in self.top or c in self.solid) for c in cells):
                    continue
                classes = [self.cls[y][x] for x, y in cells]
                if prop['where'] == 'coast':
                    # a boat is half beached: some water, some land, nothing else around it
                    if 'W' not in classes or not any(c in 'AB' for c in classes) or 'X' in classes or 'C' in classes:
                        continue
                elif any(c not in 'AB' for c in classes):
                    continue
                # keep one free cell around solid props so corridors stay walkable
                ring = [(x0 + dx, y0 + dy) for dy in range(-1, prop['h'] + 1) for dx in range(-1, prop['w'] + 1)]
                if prop['solid'] and any(c in self.walls or c in self.solid for c in ring):
                    continue
                solid = set((x0 + dx, y0 + dy) for dx, dy in prop['solid'])
                before = len(self.components()[0]) if solid else 0
                self.solid |= solid
                if solid:
                    comps = self.components()
                    if not comps or len(comps[0]) < before - len(solid) - 2:
                        self.solid -= solid
                        continue
                for n, (x, y) in enumerate(cells):
                    self.props[(x, y)] = prop['gids'][n]
                placed += 1

    def place_decor(self):
        land = [(x, y) for y in range(self.H) for x in range(self.W) if self.cls[y][x] in 'AB' and (x, y) not in self.walls and (x, y) not in self.top and (x, y) not in self.props]
        self.rnd.shuffle(land)
        trees = 0
        for x, y in land:
            if trees >= self.p['trees']:
                break
            # trees prefer the coast and the A ground, never next to each other
            near_water = any(self.inb(x + dx, y + dy) and self.cls[y + dy][x + dx] == 'W' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if self.rnd.random() < (0.6 if near_water else 0.15) and not any((x + dx, y + dy) in self.top for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                self.top[(x, y)] = self.rnd.choice(G['tree'])
                trees += 1
        bushes = 0
        for x, y in land:
            if bushes >= self.p['bushes']:
                break
            if (x, y) in self.top or (x, y) in self.detail_extra:
                continue
            if self.rnd.random() < 0.3:
                self.detail_extra[(x, y)] = self.rnd.choice(G['bush'] if self.rnd.random() < 0.7 else G['flower'])
                bushes += 1

    # ------------------------------------------------------------ spawns
    def add_object(self, layer, x, y, w, h, name='', type_=''):
        self.objects[layer].append({
            'height': h, 'id': self.next_id, 'name': name, 'rotation': 0, 'type': type_,
            'visible': True, 'width': w, 'x': x, 'y': y
        })
        self.next_id += 1

    def open_spots(self, size):
        spots = []
        for y in range(1, self.H - size):
            for x in range(1, self.W - size):
                if self.rect_free(x, y, size, size, 'ABC', 1):
                    spots.append((x, y))
        self.rnd.shuffle(spots)
        return spots

    def place_spawns(self):
        p = self.p
        spots = self.open_spots(2)
        chosen = []

        def far(sx, sy, mind):
            return all(abs(sx - cx) + abs(sy - cy) >= mind for cx, cy in chosen)

        mind = max(4, (self.W + self.H) // (p['player_spawns'] + 2))
        for sx, sy in spots:
            if len(chosen) >= p['player_spawns']:
                break
            if far(sx, sy, mind):
                chosen.append((sx, sy))
                self.add_object('PlayerSpawns', sx * TILE, sy * TILE, 2 * TILE, 2 * TILE, 'player_spawn_%d' % len(chosen), '')
        item_spots = [s for s in self.open_spots(1) if far(s[0], s[1], 3)]
        used = []

        def take(layer, count, name, types=None):
            placed = 0
            for sx, sy in item_spots:
                if placed >= count:
                    return
                if all(abs(sx - ux) + abs(sy - uy) >= 3 for ux, uy in used):
                    used.append((sx, sy))
                    t = types[placed % len(types)] if types else ''
                    self.add_object(layer, sx * TILE + 15, sy * TILE + 15, TILE - 30, TILE - 30, '%s_%d' % (name, placed), t)
                    placed += 1

        take('AmmoBoxSpawns', p['ammo'], 'ammo', WEAPONS)
        take('LifeBoxSpawns', p['life'], 'life_box')
        take('DoubleDamageSpawns', p['dd'], 'double_damage')
        take('MaximumDefenseSpawns', p['md'], 'maximum_defense')

    # ------------------------------------------------------------ collision
    def collision(self):
        # water: horizontal runs, then identical runs on consecutive rows merge into one
        # rectangle (a 120x100 map goes from ~450 static bodies down to ~100)
        runs = {}
        for y in range(self.H):
            x = 0
            while x < self.W:
                if self.cls[y][x] == 'W':
                    x0 = x
                    while x < self.W and self.cls[y][x] == 'W':
                        x += 1
                    runs[(x0, x, y)] = True
                else:
                    x += 1
        for (x0, x1, y) in sorted(runs, key=lambda r: (r[0], r[1], r[2])):
            if not runs.get((x0, x1, y)):
                continue
            y1 = y
            while runs.get((x0, x1, y1 + 1)):
                y1 += 1
                runs[(x0, x1, y1)] = False
            self.add_object('SeaWalls', x0 * TILE, y * TILE, (x1 - x0) * TILE, (y1 - y + 1) * TILE)
        # walls: the sprite band is the middle 52px of a cell; runs merge into one box
        inset, band = 24, 52
        done = set()
        for (x, y) in sorted(self.walls):
            if (x, y) in done:
                continue
            if (x + 1, y) in self.walls:
                x1 = x
                while (x1 + 1, y) in self.walls:
                    x1 += 1
                    done.add((x1, y))
                self.add_object('Walls', x * TILE + inset, y * TILE + inset, (x1 - x) * TILE + band, band)
            if (x, y + 1) in self.walls:
                y1 = y
                while (x, y1 + 1) in self.walls:
                    y1 += 1
                    done.add((x, y1))
                self.add_object('Walls', x * TILE + inset, y * TILE + inset, band, (y1 - y) * TILE + band)
            if (x + 1, y) not in self.walls and (x, y + 1) not in self.walls and (x, y) not in done:
                self.add_object('Walls', x * TILE + inset, y * TILE + inset, band, band)
            done.add((x, y))
        # props: one slightly inset box per solid cell (keeps the hit shape forgiving)
        for (x, y) in sorted(self.solid):
            if self.cls[y][x] == 'W':
                continue
            self.add_object('Walls', x * TILE + 10, y * TILE + 10, TILE - 20, TILE - 20)

    # ------------------------------------------------------------ tiles
    def edge_pieces(self, x, y, target):
        """Overhang pieces of class `target` onto cell (x, y)."""
        def is_t(cx, cy):
            return self.inb(cx, cy) and self.cls[cy][cx] == target

        sides = set()
        if is_t(x, y + 1): sides.add('S')
        if is_t(x, y - 1): sides.add('N')
        if is_t(x - 1, y): sides.add('W')
        if is_t(x + 1, y): sides.add('E')
        pieces = []
        for corner in ('NW', 'NE', 'WS', 'ES'):
            if set(corner) <= sides:
                pieces.append(corner)
                sides -= set(corner)
        pieces += sorted(sides)
        for diag, (dx, dy) in (('sw', (-1, 1)), ('se', (1, 1)), ('nw', (-1, -1)), ('ne', (1, -1))):
            if is_t(x + dx, y + dy) and not is_t(x + dx, y) and not is_t(x, y + dy):
                pieces.append(diag)
        return pieces

    def build_layers(self):
        floor = []
        details = [dict() for _ in range(4)]
        for y in range(self.H):
            for x in range(self.W):
                c = self.cls[y][x]
                if c == 'A':
                    gid = G['A_rock'] if self.rnd.random() < 0.02 else self.rnd.choice(G['A'] + [1] * 6)
                elif c == 'B':
                    gid = self.rnd.choice(G['B_rock']) if self.rnd.random() < 0.05 else self.rnd.choice(G['B'] + [19] * 4)
                elif c == 'C':
                    gid = G['cobble2'] if self.rnd.random() < 0.04 else G['cobble']
                elif c == 'X':
                    gid = self.bridges[(x, y)]
                else:
                    gid = G['water_anim'] if self.rnd.random() < 0.08 else self.rnd.choice(G['water'])
                floor.append(gid)
                pieces = []
                if c in 'BWC':
                    pieces += [(G['A_edge'], pc) for pc in self.edge_pieces(x, y, 'A')]
                if c in 'WC':
                    pieces += [(G['B_edge'], pc) for pc in self.edge_pieces(x, y, 'B')]
                for i, (base, pc) in enumerate(pieces[:4]):
                    details[i][(x, y)] = base + EDGE_ORDER.index(pc)
        for (x, y), gid in self.detail_extra.items():
            for d in details:
                if (x, y) not in d:
                    d[(x, y)] = gid
                    break
        wall_tiles = {}
        for (x, y) in self.walls:
            conns = frozenset(s for s, (dx, dy) in (('N', (0, -1)), ('E', (1, 0)), ('S', (0, 1)), ('W', (-1, 0))) if (x + dx, y + dy) in self.walls)
            gid = G['wall'].get(conns, 46)
            wall_tiles[(x, y)] = self.rnd.choice(gid) if isinstance(gid, list) else gid
        return floor, details, wall_tiles

    def tile_layer(self, name, data, z):
        return {'data': data, 'height': self.H, 'name': name, 'opacity': 1, 'properties': {'zIndex': z},
                'propertytypes': {'zIndex': 'int'}, 'type': 'tilelayer', 'visible': True, 'width': self.W, 'x': 0, 'y': 0}

    def sparse(self, d):
        data = [0] * (self.W * self.H)
        for (x, y), gid in d.items():
            data[y * self.W + x] = gid
        return data

    def object_layer(self, name, props=None):
        layer = {'draworder': 'topdown', 'height': 0, 'name': name, 'opacity': 1, 'type': 'objectgroup',
                 'visible': False, 'width': 0, 'x': 0, 'y': 0, 'objects': self.objects[name]}
        if props:
            layer['properties'] = props
            layer['propertytypes'] = {k: 'string' for k in props}
        return layer

    def generate(self):
        self.terrain()
        self.place_plazas()
        self.place_buildings()
        self.place_walls()
        self.place_props()
        self.place_decor()
        self.place_spawns()
        self.collision()
        floor, details, wall_tiles = self.build_layers()
        layers = [self.tile_layer('Floor', floor, 0)]
        for i, d in enumerate(details):
            if d:
                layers.append(self.tile_layer('FloorDetails_%d' % i, self.sparse(d), 0))
        layers.append(self.tile_layer('WallTiles', self.sparse(wall_tiles), 0))
        layers.append(self.tile_layer('Props', self.sparse(self.props), 0))
        layers.append(self.tile_layer('TopMapDetails_1', self.sparse(self.top), 1))
        layers.append(self.object_layer('SeaWalls'))
        layers.append(self.object_layer('Walls'))
        layers.append(self.object_layer('PlayerSpawns'))
        for name in ('LifeBoxSpawns', 'AmmoBoxSpawns', 'DoubleDamageSpawns', 'MaximumDefenseSpawns'):
            layers.append(self.object_layer(name, {'type': 'CrateSpawn'}))
        p = self.p
        return {
            'height': self.H, 'width': self.W, 'nextobjectid': self.next_id, 'orientation': 'orthogonal',
            'renderorder': 'left-up', 'tileheight': TILE, 'tilewidth': TILE, 'version': 1,
            'properties': {'name': p['name'], 'biome': p['biome'], 'ambient': p['ambient'],
                           'outsideTile': p['outside'], 'backgroundColor': p['background'], 'generator': 'tools/gen_map.py'},
            'propertytypes': {'name': 'string', 'biome': 'string', 'ambient': 'string', 'outsideTile': 'int',
                              'backgroundColor': 'string', 'generator': 'string'},
            'layers': layers,
            'tilesets': [{
                'columns': 10, 'firstgid': 1, 'image': p['image'], 'imageheight': 1210, 'imagewidth': 1010,
                'margin': 5, 'name': 'map_tiles', 'spacing': 0, 'tilecount': 120, 'tileheight': TILE, 'tilewidth': TILE,
                'tiles': {'39': {'animation': [{'duration': 1000, 'tileid': 39}, {'duration': 1000, 'tileid': 37}]}}
            }]
        }


def main():
    names = sys.argv[1:] or ['all']
    if names == ['all']:
        names = list(PRESETS)
    for name in names:
        gen = MapGen(PRESETS[name])
        data = gen.generate()
        path = os.path.join(OUT, name + '.json')
        with open(path, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
        land = sum(1 for row in gen.cls for c in row if c != 'W')
        print('wrote %s  (%dx%d, %d land cells, %d wall cells, %d prop tiles, %d spawns)' % (
            os.path.relpath(path), gen.W, gen.H, land, len(gen.walls), len(gen.props), len(gen.objects['PlayerSpawns'])))


if __name__ == '__main__':
    main()
