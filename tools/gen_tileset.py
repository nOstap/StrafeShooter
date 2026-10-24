#!/usr/bin/env python3
"""Generate biome tileset SVGs (public/assets/svg/map_sprites_<biome>.svg).

The layout mirrors the hand-drawn classic sheet (public/assets/images/map_sprites.png):
10 columns x 12 rows of 100px tiles with a 5px margin, so a map built for one biome
renders with any other biome just by swapping the tileset image.

Tile index -> meaning (gid = index + 1):
    0-5     ground A (grass / sand / snow) variants, 5 = with rock
    6-17    ground A overhang edges, order: S, W+S, E+S, W, E, N, N+W, N+E, SW, SE, NW, NE
    18-22   ground B (dirt / rock / ice) variants
    23-34   ground B overhang edges (same order)
    35-39   water, 39 is the animated one
    40-58   walls (see WALL_SHAPES)
    63-64   bridge planks (vertical, horizontal)
    73-77   bushes / decoration, 78-79 small flowers
    82-89   roofs
    102-106 trees (drawn above the player)
    109-110 cobblestone floors
    81      wall stub
    Multi-tile props (same slots in every biome, placed by tools/gen_map.py PROPS):
    59-62   barrel, crate stack, sandbags (horizontal, vertical)
    65-70   destroyed building 2x3 (row-major), 71 rubble, 72 burnt debris
    90-101  crashed plane 4x3 (row-major)
    107-108 crater, scorched ground
    111-118 boat 2x4 (row-major) - mirrors the hand-made boat on the classic sheet

Rasterize with: node tools/render_svg.js
"""
import math
import os
import random
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'svg')
T = 100
MARGIN = 5
COLS = 10
ROWS = 12
EDGE_ORDER = ['S', 'WS', 'ES', 'W', 'E', 'N', 'NW', 'NE', 'sw', 'se', 'nw', 'ne']
ROT = {'S': 0, 'W': 90, 'N': 180, 'E': 270, 'sw': 0, 'nw': 90, 'ne': 180, 'se': 270}

# connections of each wall tile: N E S W
WALL_SHAPES = {
    40: 'ES', 41: 'EW', 42: 'SW', 43: 'NE', 44: 'EW-caps', 45: 'NS', 46: 'EW', 47: 'ESW', 48: 'NEW',
    49: 'NW', 50: 'NSE', 51: 'NSW', 52: 'NS', 53: 'NS-caps', 54: 'NS', 55: 'NE', 56: 'EW', 57: 'EW',
    58: 'NW', 81: 'EW-caps'
}

BIOMES = {
    'desert': {
        'A': '#e9c97a', 'A_dark': '#d3ad58', 'A_light': '#f6dd9a',
        'B': '#b9774a', 'B_dark': '#8f5531', 'B_light': '#cf9360',
        'water': '#2fb3c6', 'water_dark': '#1f8ea0', 'water_light': '#9fe7ee',
        'wall': '#d9b57e', 'wall_dark': '#9c7a47', 'wall_light': '#efd6a4', 'wall_cap': None,
        'cobble': '#cdae79', 'cobble_dark': '#9d7f52', 'cobble2': '#b9694a', 'cobble2_dark': '#7e4530',
        'plank': '#9b6a35', 'plank_dark': '#6b4621', 'rope': '#d8b26b',
        'roof': '#c9633a', 'roof_dark': '#8d3f22', 'roof_light': '#e4875d',
        'tree': '#4f9a3c', 'tree_dark': '#2f6b25', 'tree_light': '#8bd36d',
        'bush': '#a69356', 'bush_dark': '#6f6035',
        'rock': '#a89f90', 'rock_dark': '#6d655a', 'rock_light': '#d6cfc3',
        'flower': '#ff6fa3', 'flower2': '#ffd34f',
        'edge_style': 'sand', 'tree_style': 'cactus', 'bush_style': 'dry'
    },
    'winter': {
        'A': '#f3f7fb', 'A_dark': '#cfdce8', 'A_light': '#ffffff',
        'B': '#a7d6ef', 'B_dark': '#6fb2d9', 'B_light': '#dff2fc',
        'water': '#1e5f9b', 'water_dark': '#153f6b', 'water_light': '#6fa9dc',
        'wall': '#9aa4ae', 'wall_dark': '#5e6871', 'wall_light': '#c6cfd6', 'wall_cap': '#f4f8fb',
        'cobble': '#7d868d', 'cobble_dark': '#4d555b', 'cobble2': '#5a6d80', 'cobble2_dark': '#34434f',
        'plank': '#7a5533', 'plank_dark': '#4e351f', 'rope': '#c9b48a',
        'roof': '#4b5663', 'roof_dark': '#2b323a', 'roof_light': '#6e7b89',
        'tree': '#2f6b3a', 'tree_dark': '#1c4524', 'tree_light': '#5fa26a',
        'bush': '#5f7c53', 'bush_dark': '#3b5233',
        'rock': '#8c949b', 'rock_dark': '#565d63', 'rock_light': '#c7cdd2',
        'flower': '#9fe0ff', 'flower2': '#ffffff',
        'edge_style': 'snow', 'tree_style': 'pine', 'bush_style': 'snowy'
    }
}


def pos(index):
    return MARGIN + (index % COLS) * T, MARGIN + (index // COLS) * T


class Sheet:
    def __init__(self, biome, palette):
        self.b = biome
        self.p = palette
        self.defs = []
        self.tiles = {}
        random.seed(hash(biome) & 0xffff)

    def defs_common(self):
        self.defs.append('''
<filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="11" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.4 0.4 0.4 0 -0.22" result="shade"/>
  <feComposite in="shade" in2="SourceGraphic" operator="in" result="shadeIn"/>
  <feBlend in="shadeIn" in2="SourceGraphic" mode="multiply"/>
</filter>
<filter id="grainSoft" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="4" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.25 0.25 0.25 0 -0.1" result="shade"/>
  <feComposite in="shade" in2="SourceGraphic" operator="in" result="shadeIn"/>
  <feBlend in="shadeIn" in2="SourceGraphic" mode="multiply"/>
</filter>
<filter id="rough" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="21" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.5 0.5 0.5 0 -0.3" result="shade"/>
  <feComposite in="shade" in2="SourceGraphic" operator="in" result="shadeIn"/>
  <feBlend in="shadeIn" in2="SourceGraphic" mode="multiply"/>
</filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
  <feOffset dx="4" dy="6" result="s"/>
  <feComponentTransfer in="s" result="s2"><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
  <feMerge><feMergeNode in="s2"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<clipPath id="cell"><rect x="0" y="0" width="100" height="100"/></clipPath>''')

    def add(self, index, body):
        x, y = pos(index)
        self.tiles[index] = '<g transform="translate(%d,%d)" clip-path="url(#cell)">%s</g>' % (x, y, body)

    # ------------------------------------------------------------ ground
    def ground(self, color, dark, light, variant, style):
        soft = style in ('snow', 'ice')
        s = '<rect x="-2" y="-2" width="104" height="104" fill="%s" filter="url(#%s)"/>' % (color, 'grainSoft' if soft else 'grain')
        rnd = random.Random(variant * 7919 + 3)
        if style == 'sand':
            # wind ripples
            for i in range(variant * 2):
                yy = rnd.uniform(8, 92)
                xx = rnd.uniform(0, 60)
                s += '<path d="M%.0f,%.0f q10,-4 20,0 t20,0" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>' % (xx, yy, dark)
                s += '<path d="M%.0f,%.0f q10,-4 20,0 t20,0" fill="none" stroke="%s" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>' % (xx, yy - 2.5, light)
        elif style == 'snow':
            for i in range(variant * 2):
                cx, cy, r = rnd.uniform(10, 90), rnd.uniform(10, 90), rnd.uniform(8, 18)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.5"/>' % (cx, cy, r, r * 0.6, dark)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.7"/>' % (cx - 2, cy - 3, r * 0.8, r * 0.45, light)
        elif style == 'rock':
            for i in range(variant * 3):
                cx, cy, r = rnd.uniform(5, 95), rnd.uniform(5, 95), rnd.uniform(3, 7)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.8"/>' % (cx, cy, r, r * 0.7, dark)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.5"/>' % (cx - 1, cy - 1.5, r * 0.6, r * 0.4, light)
        elif style == 'ice':
            for i in range(variant):
                x0, y0 = rnd.uniform(0, 100), rnd.uniform(0, 100)
                pts = [(x0, y0)]
                for k in range(4):
                    pts.append((pts[-1][0] + rnd.uniform(-30, 30), pts[-1][1] + rnd.uniform(-30, 30)))
                d = 'M' + ' L'.join('%.0f,%.0f' % p for p in pts)
                s += '<path d="%s" fill="none" stroke="%s" stroke-width="2" opacity="0.7"/>' % (d, light)
                s += '<path d="%s" fill="none" stroke="%s" stroke-width="0.8" opacity="0.6"/>' % (d, dark)
            s += '<rect x="0" y="0" width="100" height="100" fill="url(#iceShine)" opacity="0.5"/>'
        return s

    def rock(self, cx, cy, r):
        p = self.p
        return ('<g filter="url(#shadow)"><ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s"/>'
                '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s"/>'
                '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.8"/></g>'
                % (cx, cy, r, r * 0.8, p['rock_dark'], cx - r * 0.1, cy - r * 0.15, r * 0.8, r * 0.6, p['rock'],
                   cx - r * 0.3, cy - r * 0.35, r * 0.35, r * 0.22, p['rock_light']))

    def edge_path(self, sides, style):
        """Overhang of a ground type onto the neighbouring cell; `sides` like 'WS' or 'sw' (diagonal)."""
        depth = 30
        wave = 7 if style == 'sand' else 9

        def band(rot):
            # band along the bottom edge, wavy upper boundary
            d = 'M-5,105 L-5,%d ' % (100 - depth)
            x = -5
            up = True
            while x < 105:
                nx = x + 11
                d += 'Q%.0f,%.0f %.0f,%.0f ' % (x + 5.5, 100 - depth + (-wave if up else wave), nx, 100 - depth)
                up = not up
                x = nx
            d += 'L105,105 Z'
            return '<path d="%s" transform="rotate(%d 50 50)"/>' % (d, rot)

        def blob(rot):
            # quarter blob in the bottom-left corner
            d = 'M-5,105 L-5,%d Q%d,%d %d,%d Q%d,%d %d,105 Z' % (100 - depth, 4, 100 - depth + 2, 14, 100 - depth + 12,
                                                                 depth - 12, 96, depth)
            return '<path d="%s" transform="rotate(%d 50 50)"/>' % (d, rot)

        parts = ''
        if sides.islower():
            parts += blob(ROT[sides])
        else:
            for side in sides:
                parts += band(ROT[side])
        return parts

    def edges(self, base_index, color, dark, light, style):
        for i, sides in enumerate(EDGE_ORDER):
            shape = self.edge_path(sides, style)
            # clipPath children must be shapes (no <g>), each path carries its own transform
            body = ('<defs><clipPath id="ec%d">%s</clipPath></defs>' % (base_index + i, shape)
                    + '<g fill="%s" opacity="0.45" transform="translate(0,4)">%s</g>' % (dark, shape)
                    + '<g clip-path="url(#ec%d)">' % (base_index + i)
                    + '<rect x="-5" y="-5" width="110" height="110" fill="%s" filter="url(#%s)"/>' % (color, 'grainSoft' if style == 'snow' else 'grain')
                    + '</g>'
                    + '<g fill="none" stroke="%s" stroke-width="2.5" opacity="0.8">%s</g>' % (light, shape))
            self.add(base_index + i, body)

    # ------------------------------------------------------------ water
    def water(self, variant):
        p = self.p
        s = '<rect x="-2" y="-2" width="104" height="104" fill="%s" filter="url(#grainSoft)"/>' % p['water']
        rnd = random.Random(variant * 31 + 7)
        for i in range(variant + 1):
            x, y = rnd.uniform(5, 70), rnd.uniform(10, 90)
            s += ('<path d="M%.0f,%.0f q6,-6 12,0 q6,6 12,0" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/>'
                  % (x, y, p['water_light']))
            s += ('<path d="M%.0f,%.0f q6,-6 12,0 q6,6 12,0" fill="none" stroke="%s" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>'
                  % (x + 3, y + 5, p['water_dark']))
        if self.b == 'winter' and variant > 2:
            # drifting ice chunks
            s += '<polygon points="%s" fill="%s" opacity="0.9"/>' % (
                ' '.join('%.0f,%.0f' % (50 + math.cos(a) * rnd.uniform(10, 18), 50 + math.sin(a) * rnd.uniform(8, 14))
                         for a in [k * math.pi / 3 for k in range(6)]), p['A'])
        return s

    # ------------------------------------------------------------ walls
    def wall(self, shape, idx):
        p = self.p
        cid = 'wc%d' % idx
        conns = shape.split('-')[0]
        caps = 'caps' in shape
        lo, hi = 24, 76
        rects = [(lo, lo, hi, hi)]
        if 'N' in conns: rects.append((lo, -5, hi, 50))
        if 'S' in conns: rects.append((lo, 50, hi, 105))
        if 'W' in conns: rects.append((-5, lo, 50, hi))
        if 'E' in conns: rects.append((50, lo, 105, hi))
        if caps:
            rects = [(8, lo, 92, hi)] if 'E' in conns else [(lo, 8, hi, 92)]
        body = '<g filter="url(#shadow)">'
        for r in rects:
            body += '<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="%s"/>' % (r[0], r[1], r[2] - r[0], r[3] - r[1], p['wall_dark'])
        body += '</g><g>'
        for r in rects:
            body += '<rect x="%d" y="%d" width="%d" height="%d" rx="5" fill="%s" filter="url(#rough)"/>' % (
                r[0] + 3, r[1] + 3, r[2] - r[0] - 6, r[3] - r[1] - 6, p['wall'])
        body += '</g>'
        # brick joints
        joints = ''
        horizontal = 'E' in conns or 'W' in conns
        vertical = 'N' in conns or 'S' in conns
        rnd = random.Random(hash(shape) & 0xffff)
        if horizontal:
            for x in range(-5, 110, 22):
                off = rnd.choice([0, 11])
                joints += '<line x1="%d" y1="%d" x2="%d" y2="%d"/>' % (x + off, lo + 4, x + off, 50)
                joints += '<line x1="%d" y1="%d" x2="%d" y2="%d"/>' % (x + 11 - off, 50, x + 11 - off, hi - 4)
            joints += '<line x1="-5" y1="50" x2="105" y2="50"/>'
        if vertical:
            for y in range(-5, 110, 22):
                off = rnd.choice([0, 11])
                joints += '<line x1="%d" y1="%d" x2="%d" y2="%d"/>' % (lo + 4, y + off, 50, y + off)
                joints += '<line x1="%d" y1="%d" x2="%d" y2="%d"/>' % (50, y + 11 - off, hi - 4, y + 11 - off)
            joints += '<line x1="50" y1="-5" x2="50" y2="105"/>'
        clip = ''.join('<rect x="%d" y="%d" width="%d" height="%d"/>' % (r[0] + 3, r[1] + 3, r[2] - r[0] - 6, r[3] - r[1] - 6) for r in rects)
        body += '<defs><clipPath id="%s">%s</clipPath></defs>' % (cid, clip)
        body += '<g clip-path="url(#%s)" stroke="%s" stroke-width="2.5" stroke-linecap="round" opacity="0.7">%s</g>' % (
            cid, p['wall_dark'], joints)
        body += '<g clip-path="url(#%s)" stroke="%s" stroke-width="1" stroke-linecap="round" opacity="0.6" transform="translate(1,-1.5)">%s</g>' % (
            cid, p['wall_light'], joints)
        if p['wall_cap']:
            # snow resting on top of the wall
            cap = ''
            for r in rects:
                cap += '<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="%s" opacity="0.9"/>' % (
                    r[0] + 4, r[1] + 2, r[2] - r[0] - 8, 12, p['wall_cap'])
            body += '<g clip-path="url(#%s)">%s</g>' % (cid, cap)
        return body

    # ------------------------------------------------------------ misc
    def cobble(self, color, dark, variant):
        s = '<rect x="-2" y="-2" width="104" height="104" fill="%s"/>' % dark
        rnd = random.Random(variant)
        for gy in range(0, 100, 20):
            for gx in range(0, 100, 20):
                cx, cy = gx + 10 + rnd.uniform(-3, 3), gy + 10 + rnd.uniform(-3, 3)
                rx, ry = rnd.uniform(7, 10), rnd.uniform(6, 9)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" filter="url(#rough)"/>' % (cx, cy, rx, ry, color)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="#ffffff" opacity="0.25"/>' % (cx - 2, cy - 2, rx * 0.4, ry * 0.3)
        return s

    def bridge(self, vertical):
        p = self.p
        s = ''
        if vertical:
            s += '<rect x="8" y="-5" width="84" height="110" fill="%s"/>' % p['plank_dark']
            for y in range(-2, 100, 14):
                s += '<rect x="10" y="%d" width="80" height="11" rx="2" fill="%s" filter="url(#grainSoft)"/>' % (y, p['plank'])
            s += '<rect x="2" y="-5" width="6" height="110" fill="%s"/><rect x="92" y="-5" width="6" height="110" fill="%s"/>' % (p['rope'], p['rope'])
        else:
            s += '<rect x="-5" y="8" width="110" height="84" fill="%s"/>' % p['plank_dark']
            for x in range(-2, 100, 14):
                s += '<rect x="%d" y="10" width="11" height="80" rx="2" fill="%s" filter="url(#grainSoft)"/>' % (x, p['plank'])
            s += '<rect x="-5" y="2" width="110" height="6" fill="%s"/><rect x="-5" y="92" width="110" height="6" fill="%s"/>' % (p['rope'], p['rope'])
        return s

    def roof(self, variant):
        p = self.p
        s = '<rect x="-2" y="-2" width="104" height="104" fill="%s"/>' % p['roof_dark']
        rnd = random.Random(variant)
        row = 0
        for y in range(-10, 100, 14):
            off = 12 if row % 2 else 0
            for x in range(-24 + off, 110, 24):
                s += ('<path d="M%d,%d h24 v10 a12,8 0 0 1 -24,0 z" fill="%s" stroke="%s" stroke-width="1.5"/>'
                      % (x, y, p['roof'], p['roof_dark']))
                s += '<path d="M%d,%d h14" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x + 4, y + 4, p['roof_light'])
            row += 1
        if p['wall_cap']:
            # snow patches
            for i in range(3):
                cx, cy = rnd.uniform(10, 90), rnd.uniform(10, 90)
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%d" ry="%d" fill="%s" opacity="0.9"/>' % (cx, cy, rnd.randint(14, 24), rnd.randint(8, 14), p['wall_cap'])
        return s

    def tree(self, variant):
        p = self.p
        rnd = random.Random(variant * 13)
        s = '<g filter="url(#shadow)">'
        if p['tree_style'] == 'cactus':
            if variant % 2 == 0:
                # saguaro from above: fat body + arms
                s += '<circle cx="50" cy="50" r="17" fill="%s"/>' % p['tree_dark']
                s += '<circle cx="50" cy="50" r="13" fill="%s"/>' % p['tree']
                for a in [rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)]:
                    ex, ey = 50 + math.cos(a) * 30, 50 + math.sin(a) * 30
                    s += '<line x1="50" y1="50" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="14" stroke-linecap="round"/>' % (ex, ey, p['tree_dark'])
                    s += '<line x1="50" y1="50" x2="%.0f" y2="%.0f" stroke="%s" stroke-width="9" stroke-linecap="round"/>' % (ex, ey, p['tree'])
                    s += '<circle cx="%.0f" cy="%.0f" r="4" fill="%s"/>' % (ex, ey, p['tree_light'])
                s += '<circle cx="50" cy="50" r="5" fill="%s"/>' % p['tree_light']
                for k in range(10):
                    a = k / 10 * 6.28
                    s += '<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#f5f0d0" stroke-width="1.2"/>' % (
                        50 + math.cos(a) * 8, 50 + math.sin(a) * 8, 50 + math.cos(a) * 12, 50 + math.sin(a) * 12)
            else:
                # palm: fronds radiating from the trunk
                for k in range(9):
                    a = k / 9 * 6.28 + rnd.uniform(-0.2, 0.2)
                    ex, ey = 50 + math.cos(a) * 44, 50 + math.sin(a) * 44
                    mx, my = 50 + math.cos(a + 0.35) * 26, 50 + math.sin(a + 0.35) * 26
                    s += '<path d="M50,50 Q%.0f,%.0f %.0f,%.0f" fill="none" stroke="%s" stroke-width="12" stroke-linecap="round"/>' % (mx, my, ex, ey, p['tree_dark'])
                for k in range(9):
                    a = k / 9 * 6.28 + rnd.uniform(-0.2, 0.2)
                    ex, ey = 50 + math.cos(a) * 42, 50 + math.sin(a) * 42
                    mx, my = 50 + math.cos(a + 0.35) * 25, 50 + math.sin(a + 0.35) * 25
                    s += '<path d="M50,50 Q%.0f,%.0f %.0f,%.0f" fill="none" stroke="%s" stroke-width="7" stroke-linecap="round"/>' % (mx, my, ex, ey, p['tree'])
                    s += '<path d="M50,50 Q%.0f,%.0f %.0f,%.0f" fill="none" stroke="%s" stroke-width="2" stroke-linecap="round" opacity="0.7"/>' % (mx, my, ex, ey, p['tree_light'])
                s += '<circle cx="50" cy="50" r="7" fill="%s"/><circle cx="50" cy="50" r="4" fill="%s"/>' % (p['plank_dark'], p['plank'])
        else:
            # pine from above: layered star canopies with snow
            for layer, (r, col) in enumerate([(46, p['tree_dark']), (36, p['tree']), (24, p['tree_light'])]):
                pts = []
                for k in range(16):
                    a = k / 16 * 6.28 + layer * 0.2
                    rr = r if k % 2 == 0 else r * 0.62
                    pts.append('%.0f,%.0f' % (50 + math.cos(a) * rr, 50 + math.sin(a) * rr))
                s += '<polygon points="%s" fill="%s"/>' % (' '.join(pts), col)
            for k in range(6):
                a = k / 6 * 6.28 + 0.3
                s += '<ellipse cx="%.0f" cy="%.0f" rx="7" ry="4" fill="%s" opacity="0.95" transform="rotate(%d %.0f %.0f)"/>' % (
                    50 + math.cos(a) * 30, 50 + math.sin(a) * 30, p['A'], math.degrees(a), 50 + math.cos(a) * 30, 50 + math.sin(a) * 30)
            s += '<circle cx="50" cy="50" r="6" fill="%s"/>' % p['plank_dark']
        s += '</g>'
        return s

    def bush(self, variant):
        p = self.p
        rnd = random.Random(variant * 101)
        s = '<g filter="url(#shadow)">'
        if p['bush_style'] == 'dry':
            # tumbleweed-ish dry bush
            for k in range(14):
                a = rnd.uniform(0, 6.28)
                r1, r2 = rnd.uniform(6, 14), rnd.uniform(22, 34)
                s += '<path d="M%.0f,%.0f Q%.0f,%.0f %.0f,%.0f" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round"/>' % (
                    50 + math.cos(a) * r1, 50 + math.sin(a) * r1, 50 + math.cos(a + 0.5) * (r1 + r2) / 2, 50 + math.sin(a + 0.5) * (r1 + r2) / 2,
                    50 + math.cos(a) * r2, 50 + math.sin(a) * r2, p['bush_dark'] if k % 2 else p['bush'])
            if variant % 2 == 0:
                s += self.rock(50 + rnd.uniform(-20, 20), 50 + rnd.uniform(-20, 20), 9)
        else:
            for k in range(4):
                cx, cy, r = 50 + rnd.uniform(-16, 16), 50 + rnd.uniform(-16, 16), rnd.uniform(12, 18)
                s += '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s"/>' % (cx, cy, r, p['bush_dark'])
                s += '<circle cx="%.0f" cy="%.0f" r="%.0f" fill="%s"/>' % (cx - 1, cy - 2, r * 0.8, p['bush'])
                s += '<ellipse cx="%.0f" cy="%.0f" rx="%.0f" ry="%.0f" fill="%s" opacity="0.95"/>' % (cx - 2, cy - 5, r * 0.6, r * 0.35, p['A'])
        s += '</g>'
        return s

    def flower(self, variant):
        p = self.p
        s = ''
        rnd = random.Random(variant * 7)
        for i in range(3 if variant else 1):
            cx, cy = (50, 50) if not variant else (rnd.uniform(20, 80), rnd.uniform(20, 80))
            r = 10 if not variant else 6
            for k in range(6):
                a = k / 6 * 6.28
                s += '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" transform="rotate(%d %.1f %.1f)"/>' % (
                    cx + math.cos(a) * r, cy + math.sin(a) * r, r * 0.7, r * 0.4, p['flower'], math.degrees(a), cx + math.cos(a) * r, cy + math.sin(a) * r)
            s += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (cx, cy, r * 0.45, p['flower2'])
        return s

    # ------------------------------------------------------------ props
    def add_prop(self, indices, cols, markup):
        """Split a (cols x rows) * 100px drawing into tiles stored at `indices` (row-major)."""
        for n, idx in enumerate(indices):
            cx, cy = (n % cols) * T, (n // cols) * T
            self.add(idx, '<g transform="translate(%d,%d)">%s</g>' % (-cx, -cy, markup))

    def prop_barrel(self):
        p = self.p
        return ('<g filter="url(#shadow)"><circle cx="50" cy="50" r="30" fill="%s"/><circle cx="50" cy="50" r="25" fill="%s" filter="url(#grainSoft)"/>'
                '<circle cx="50" cy="50" r="25" fill="none" stroke="%s" stroke-width="3"/><circle cx="50" cy="50" r="14" fill="none" stroke="%s" stroke-width="3"/>'
                '<circle cx="50" cy="50" r="5" fill="%s"/><path d="M30,38 q20,-14 40,0" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35"/></g>'
                % (p['plank_dark'], p['plank'], p['rope'], p['rope'], p['plank_dark']))

    def prop_crates(self):
        p = self.p
        out = '<g filter="url(#shadow)">'
        for (x, y, w, rot) in ((14, 18, 40, -8), (46, 40, 42, 10), (22, 54, 34, 4)):
            out += ('<g transform="rotate(%d %d %d)"><rect x="%d" y="%d" width="%d" height="%d" rx="3" fill="%s"/>'
                    '<rect x="%d" y="%d" width="%d" height="%d" rx="2" fill="%s" filter="url(#grainSoft)"/>'
                    '<path d="M%d,%d L%d,%d M%d,%d L%d,%d" stroke="%s" stroke-width="4"/></g>'
                    % (rot, x + w / 2, y + w / 2, x, y, w, w, p['plank_dark'], x + 3, y + 3, w - 6, w - 6, p['plank'],
                       x + 4, y + 4, x + w - 4, y + w - 4, x + w - 4, y + 4, x + 4, y + w - 4, p['plank_dark']))
        return out + '</g>'

    def prop_sandbags(self, vertical):
        p = self.p
        out = '<g filter="url(#shadow)">'
        for row in range(3):
            for k in range(4):
                along = -4 + k * 28 + (14 if row % 2 else 0)
                across = 26 + row * 18
                x, y = (across, along) if vertical else (along, across)
                rx, ry = (14, 16) if vertical else (16, 14)
                out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s"/>' % (x, y, rx, ry, p['B_dark'])
                out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" filter="url(#grainSoft)"/>' % (x, y - 2, rx - 2, ry - 3, p['A_dark'] if self.b == 'desert' else p['bush'])
                out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#ffffff" opacity="0.2"/>' % (x - 3, y - 6, rx * 0.5, ry * 0.25)
        return out + '</g>'

    def prop_ruin(self):
        """Destroyed building, 200x300: broken outer walls, rubble floor inside."""
        p = self.p
        rnd = random.Random(99)
        out = '<rect x="20" y="20" width="160" height="260" fill="%s" filter="url(#rough)"/>' % p['cobble_dark']
        for i in range(40):
            out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="0.9"/>' % (
                rnd.randint(30, 170), rnd.randint(30, 270), rnd.randint(4, 10), rnd.randint(3, 7), rnd.choice([p['wall'], p['wall_dark'], p['cobble']]))
        # wall segments with gaps (blown out)
        segs = [(14, 14, 90, 30), (130, 14, 56, 30), (14, 44, 30, 110), (14, 190, 30, 96), (156, 44, 30, 60), (156, 150, 30, 136), (60, 256, 100, 30)]
        out += '<g filter="url(#shadow)">'
        for (x, y, w, h) in segs:
            out += '<rect x="%d" y="%d" width="%d" height="%d" rx="5" fill="%s"/>' % (x, y, w, h, p['wall_dark'])
            out += '<rect x="%d" y="%d" width="%d" height="%d" rx="4" fill="%s" filter="url(#rough)"/>' % (x + 3, y + 3, w - 6, h - 6, p['wall'])
            step = 22
            if w > h:
                for bx in range(x, x + w, step):
                    out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (bx + 11, y + 4, bx + 11, y + h / 2, p['wall_dark'])
                    out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (bx, y + h / 2, bx, y + h - 4, p['wall_dark'])
                out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x + 3, y + h / 2, x + w - 3, y + h / 2, p['wall_dark'])
            else:
                for by in range(y, y + h, step):
                    out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x + 4, by + 11, x + w / 2, by + 11, p['wall_dark'])
                    out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x + w / 2, by, x + w - 4, by, p['wall_dark'])
                out += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="2" opacity="0.6"/>' % (x + w / 2, y + 3, x + w / 2, y + h - 3, p['wall_dark'])
        out += '</g>'
        # scorch + rubble spill at the breaches
        for (cx, cy) in ((112, 30), (30, 170), (170, 120), (40, 268)):
            out += '<circle cx="%d" cy="%d" r="26" fill="#000" opacity="0.28"/>' % (cx, cy)
            for i in range(6):
                out += '<rect x="%d" y="%d" width="%d" height="%d" fill="%s" transform="rotate(%d %d %d)"/>' % (
                    cx + rnd.randint(-28, 22), cy + rnd.randint(-28, 22), rnd.randint(6, 14), rnd.randint(4, 8), p['wall'], rnd.randint(0, 90), cx, cy)
        if p['wall_cap']:
            for i in range(10):
                out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="0.9"/>' % (rnd.randint(20, 180), rnd.randint(20, 280), rnd.randint(10, 20), rnd.randint(6, 10), p['wall_cap'])
        return out

    def prop_rubble(self):
        p = self.p
        rnd = random.Random(12)
        out = '<g filter="url(#shadow)">'
        for i in range(14):
            cx, cy = 50 + rnd.randint(-28, 28), 50 + rnd.randint(-24, 24)
            out += '<rect x="%d" y="%d" width="%d" height="%d" rx="2" fill="%s" transform="rotate(%d %d %d)"/>' % (
                cx, cy, rnd.randint(8, 18), rnd.randint(6, 10), rnd.choice([p['wall'], p['wall_dark'], p['wall_light']]), rnd.randint(0, 180), cx, cy)
        return out + '</g>'

    def prop_debris(self):
        rnd = random.Random(13)
        out = '<circle cx="50" cy="50" r="36" fill="#000" opacity="0.3"/>'
        for i in range(8):
            a = rnd.uniform(0, 6.28)
            out += '<line x1="50" y1="50" x2="%.0f" y2="%.0f" stroke="#1a1410" stroke-width="%d" stroke-linecap="round" opacity="0.8"/>' % (
                50 + math.cos(a) * rnd.randint(18, 40), 50 + math.sin(a) * rnd.randint(18, 40), rnd.randint(3, 6))
        return out

    def prop_plane(self):
        """Crashed plane, 400x300, fuselage along the middle row, broken wing and scorched ground."""
        metal, metal_dark, metal_light = '#9aa3a8', '#5f676c', '#d4dadd'
        out = '<ellipse cx="200" cy="160" rx="150" ry="70" fill="#000" opacity="0.25"/>'
        rnd = random.Random(42)
        for i in range(18):
            out += '<rect x="%d" y="%d" width="%d" height="%d" fill="%s" transform="rotate(%d %d %d)"/>' % (
                rnd.randint(20, 380), rnd.randint(20, 280), rnd.randint(6, 16), rnd.randint(4, 8), metal_dark, rnd.randint(0, 180), 200, 150)
        out += '<g filter="url(#shadow)">'
        # wings (swept back), the lower one broken off
        out += '<path d="M150,150 L120,30 L190,30 L240,150 Z" fill="%s"/><path d="M152,150 L126,36 L184,36 L232,150 Z" fill="%s" filter="url(#grainSoft)"/>' % (metal_dark, metal)
        out += '<path d="M150,150 L135,225 L170,245 L240,150 Z" fill="%s"/><path d="M152,150 L140,222 L168,238 L232,150 Z" fill="%s" filter="url(#grainSoft)"/>' % (metal_dark, metal)
        out += '<path d="M300,270 L250,255 L270,230 L330,235 Z" fill="%s"/><path d="M302,266 L256,254 L272,234 L324,238 Z" fill="%s"/>' % (metal_dark, metal)
        # tail
        out += '<path d="M330,150 L380,110 L395,118 L350,150 L395,182 L380,190 Z" fill="%s"/><path d="M332,150 L378,116 L386,121 L350,150 L386,179 L378,184 Z" fill="%s"/>' % (metal_dark, metal)
        # fuselage
        out += '<path d="M20,150 Q30,112 80,112 L330,112 Q372,112 378,150 Q372,188 330,188 L80,188 Q30,188 20,150 Z" fill="%s"/>' % metal_dark
        out += '<path d="M28,150 Q36,118 82,118 L328,118 Q364,118 370,150 Q364,182 328,182 L82,182 Q36,182 28,150 Z" fill="%s" filter="url(#grainSoft)"/>' % metal
        out += '<path d="M60,128 L320,128" stroke="%s" stroke-width="4" opacity="0.6"/>' % metal_light
        for x in range(110, 320, 26):
            out += '<circle cx="%d" cy="150" r="6" fill="#2b4a66"/><circle cx="%d" cy="148" r="3" fill="#8fc3e8"/>' % (x, x)
        out += '<path d="M40,150 Q46,128 70,126 L96,126 L96,174 L70,174 Q46,172 40,150 Z" fill="#2b4a66"/><path d="M50,146 Q56,132 72,132 L90,132 L90,146 Z" fill="#9ed2f2" opacity="0.8"/>'
        # torn open section
        out += '<path d="M200,112 L214,140 L232,118 L250,150 L228,170 L210,188 L196,160 Z" fill="#1c1a18"/>'
        out += '<path d="M200,112 L214,140 L232,118" fill="none" stroke="%s" stroke-width="3"/>' % metal_light
        # propeller nose
        out += '<circle cx="24" cy="150" r="12" fill="%s"/><rect x="18" y="100" width="8" height="100" rx="4" fill="#3a3a3a" transform="rotate(25 22 150)"/>' % metal_dark
        out += '</g>'
        for (cx, cy) in ((230, 150), (300, 180)):
            out += '<circle cx="%d" cy="%d" r="30" fill="#000" opacity="0.35"/>' % (cx, cy)
        return out

    def prop_crater(self):
        p = self.p
        out = '<circle cx="50" cy="50" r="40" fill="%s"/><circle cx="50" cy="50" r="31" fill="%s" filter="url(#rough)"/>' % (p['B_light'] if self.b == 'desert' else p['wall_light'], p['B_dark'])
        out += '<circle cx="50" cy="50" r="18" fill="#000" opacity="0.5"/>'
        out += '<path d="M20,40 q30,-18 60,0" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.25"/>'
        return out

    def prop_scorch(self):
        rnd = random.Random(8)
        out = '<circle cx="50" cy="50" r="42" fill="#000" opacity="0.35"/>'
        for i in range(10):
            a = i / 10 * 6.28
            out += '<path d="M50,50 L%.0f,%.0f" stroke="#000" stroke-width="%d" opacity="0.4" stroke-linecap="round"/>' % (
                50 + math.cos(a) * rnd.randint(30, 48), 50 + math.sin(a) * rnd.randint(30, 48), rnd.randint(4, 9))
        return out

    def prop_boat(self):
        """Boat, 200x400, bow at the top (same footprint as the classic sheet's boat)."""
        p = self.p
        hull, hull_dark = p['plank'], p['plank_dark']
        out = '<path d="M100,30 Q190,120 185,290 Q180,380 100,392 Q20,380 15,290 Q10,120 100,30 Z" fill="#000" opacity="0.3" transform="translate(8,10)"/>'
        out += '<path d="M100,20 Q190,110 185,280 Q180,375 100,388 Q20,375 15,280 Q10,110 100,20 Z" fill="%s"/>' % hull_dark
        out += '<path d="M100,42 Q172,122 168,280 Q164,360 100,370 Q36,360 32,280 Q28,122 100,42 Z" fill="%s" filter="url(#grainSoft)"/>' % hull
        for y in range(70, 360, 16):
            out += '<line x1="34" y1="%d" x2="166" y2="%d" stroke="%s" stroke-width="2" opacity="0.55"/>' % (y, y, hull_dark)
        out += '<line x1="100" y1="46" x2="100" y2="366" stroke="%s" stroke-width="3" opacity="0.5"/>' % hull_dark
        for y in (150, 230, 310):
            out += '<rect x="34" y="%d" width="132" height="22" rx="4" fill="%s"/><rect x="36" y="%d" width="128" height="16" rx="3" fill="%s"/>' % (y, hull_dark, y + 2, p['rope'])
        out += '<path d="M100,42 Q172,122 168,280 Q164,360 100,370 Q36,360 32,280 Q28,122 100,42 Z" fill="none" stroke="%s" stroke-width="5" opacity="0.6"/>' % p['rope']
        if p['wall_cap']:
            rnd = random.Random(3)
            for i in range(9):
                out += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="0.92"/>' % (rnd.randint(50, 150), rnd.randint(70, 350), rnd.randint(12, 26), rnd.randint(7, 12), p['wall_cap'])
        else:
            # desert wreck: broken planks
            out += '<path d="M60,200 L80,230 L58,245 Z" fill="%s"/><path d="M135,120 L150,160 L122,150 Z" fill="%s"/>' % (hull_dark, hull_dark)
        return out

    def build(self):
        p = self.p
        self.defs_common()
        self.defs.append('<linearGradient id="iceShine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>'
                         '<stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.25"/></linearGradient>')
        a_style = p['edge_style']
        b_style = 'ice' if self.b == 'winter' else 'rock'
        for v in range(5):
            self.add(v, self.ground(p['A'], p['A_dark'], p['A_light'], v, a_style))
        self.add(5, self.ground(p['A'], p['A_dark'], p['A_light'], 1, a_style) + self.rock(60, 55, 16))
        self.edges(6, p['A'], p['A_dark'], p['A_light'], a_style)
        for v in range(2):
            self.add(18 + v, self.ground(p['B'], p['B_dark'], p['B_light'], v, b_style))
        self.add(20, self.ground(p['B'], p['B_dark'], p['B_light'], 1, b_style) + self.rock(30, 30, 14) + self.rock(70, 65, 10))
        self.add(21, self.ground(p['B'], p['B_dark'], p['B_light'], 1, b_style) + self.rock(55, 50, 20))
        self.add(22, self.ground(p['B'], p['B_dark'], p['B_light'], 3, b_style))
        self.edges(23, p['B'], p['B_dark'], p['B_light'], a_style)
        for v in range(5):
            self.add(35 + v, self.water(v))
        for idx, shape in WALL_SHAPES.items():
            self.add(idx, self.wall(shape, idx))
        self.add(63, self.bridge(True))
        self.add(64, self.bridge(False))
        for v in range(5):
            self.add(73 + v, self.bush(v))
        self.add(78, self.flower(0))
        self.add(79, self.flower(1))
        for v in range(8):
            self.add(82 + v, self.roof(v))
        for v in range(5):
            self.add(102 + v, self.tree(v))
        self.add(109, self.cobble(p['cobble'], p['cobble_dark'], 1))
        self.add(110, self.cobble(p['cobble2'], p['cobble2_dark'], 2))
        # props
        self.add(59, self.prop_barrel())
        self.add(60, self.prop_crates())
        self.add(61, self.prop_sandbags(False))
        self.add(62, self.prop_sandbags(True))
        self.add_prop([65, 66, 67, 68, 69, 70], 2, self.prop_ruin())
        self.add(71, self.prop_rubble())
        self.add(72, self.prop_debris())
        self.add_prop(list(range(90, 102)), 4, self.prop_plane())
        self.add(107, self.prop_crater())
        self.add(108, self.prop_scorch())
        self.add_prop(list(range(111, 119)), 2, self.prop_boat())

    def svg(self):
        w, h = COLS * T + MARGIN * 2, ROWS * T + MARGIN * 2
        out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)]
        out.append('<!-- Generated by tools/gen_tileset.py (biome: %s). Edit the generator, not this file. -->' % self.b)
        out.append('<defs>' + ''.join(self.defs) + '</defs>')
        for idx in sorted(self.tiles):
            out.append(self.tiles[idx])
        out.append('</svg>')
        return '\n'.join(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    biomes = sys.argv[1:] or list(BIOMES)
    for biome in biomes:
        sheet = Sheet(biome, BIOMES[biome])
        sheet.build()
        path = os.path.join(OUT, 'map_sprites_%s.svg' % biome)
        with open(path, 'w') as f:
            f.write(sheet.svg())
        print('wrote', os.path.relpath(path))


if __name__ == '__main__':
    main()
