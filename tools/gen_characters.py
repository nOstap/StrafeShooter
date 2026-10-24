#!/usr/bin/env python3
"""Generate the arena character sheet (public/assets/svg/characters.svg + public/assets/characters.json).

Six armoured arena fighters (Quake III / Halo flavoured, drawn in the game's cartoon top-down
style). Every frame is drawn around its pivot with the character facing UP (-y), exactly
like the classic body_* / head_* / step_* sprites, because Player.draw rotates them by
angle + HALF_PI:

    body_idle_0/1   torso, shoulders, arms holding the weapon on the right (x ~ +19), back gear
    body_fire_0/1   same with recoil (arms and shoulders pushed back)
    head            helmet, drawn on top of the weapon
    legs_walk_0..3  legs, rotated by the movement angle
    legs_stand, legs_jump
    dead            lying corpse, drawn unrotated
    portrait        stand + idle body + head in one frame (settings preview)

The sheet is one row per character. CHARACTERS order is the skin index used by the game
(public/shared/config.js CHARACTERS must list the same names in the same order).

Rasterize with: node tools/render_svg.js characters.svg
"""
import json
import math
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
SVG_OUT = os.path.join(ROOT, 'svg', 'characters.svg')
JSON_OUT = os.path.join(ROOT, 'characters.json')

OUTLINE = '#15161a'
GAP = 4

# Frame boxes: (left, top, right, bottom) around the pivot (0, 0).
BODY_BOX = (-48, -62, 48, 48)
HEAD_BOX = (-30, -30, 30, 30)
HEAD_SCALE = 1.15  # helmets are drawn a bit larger than the classic 32px heads
LEGS_BOX = (-26, -38, 26, 38)
DEAD_BOX = (-50, -64, 50, 62)

CHARACTERS = [
    {'key': 'viper', 'name': 'Viper', 'bio': 'Fast, venomous flanker who never takes the front door.',
     'armor': '#1f4a4a', 'suit': '#17252b', 'trim': '#0d1b1d', 'accent': '#7dff3c', 'glove': '#22302f',
     'build': 0.92, 'pauldron': 'slim', 'back': 'blades', 'helmet': 'fin'},
    {'key': 'ghost', 'name': 'Ghost', 'bio': 'Silent recon specialist; you only notice him when it is too late.',
     'armor': '#dfe6ec', 'suit': '#4a5866', 'trim': '#8c9aa8', 'accent': '#3ff3ff', 'glove': '#3a4652',
     'build': 0.95, 'pauldron': 'round_small', 'back': 'cloak', 'helmet': 'hood'},
    {'key': 'rook', 'name': 'Rook', 'bio': 'Walking fortress of a heavy gunner who loves a long fight.',
     'armor': '#6f7a84', 'suit': '#2e3338', 'trim': '#3f464d', 'accent': '#ff8a1c', 'glove': '#2a2e33',
     'build': 1.12, 'pauldron': 'square', 'back': 'drum', 'helmet': 'block'},
    {'key': 'blitz', 'name': 'Blitz', 'bio': 'Jump-jet power-armour soldier; first in, loudest out.',
     'armor': '#2f5fae', 'suit': '#1d2a3c', 'trim': '#1b3b70', 'accent': '#ffc61f', 'glove': '#202a38',
     'build': 1.0, 'pauldron': 'round', 'back': 'jetpack', 'helmet': 'dome'},
    {'key': 'nova', 'name': 'Nova', 'bio': 'Half-machine cyborg who calculates every shot twice.',
     'armor': '#6a3aa8', 'suit': '#2a1f3a', 'trim': '#45246f', 'accent': '#ff3df2', 'glove': '#2b2238',
     'build': 1.0, 'pauldron': 'asym', 'back': 'core', 'helmet': 'cyclops'},
    {'key': 'talon', 'name': 'Talon', 'bio': 'Horned berserker from the arena pits; charges anything that moves.',
     'armor': '#b5222a', 'suit': '#2c1717', 'trim': '#6e1016', 'accent': '#ff5a2a', 'glove': '#2a1c1c',
     'build': 1.04, 'pauldron': 'spiked', 'back': 'pack', 'helmet': 'horns'},
]


# ------------------------------------------------------------------ colour helpers
def _rgb(c):
    c = c.lstrip('#')
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)]


def _hex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in rgb)


def mix(a, b, t):
    a, b = _rgb(a), _rgb(b)
    return _hex([a[i] + (b[i] - a[i]) * t for i in range(3)])


def light(c, t):
    return mix(c, '#ffffff', t)


def dark(c, t):
    return mix(c, '#000000', t)


class Sheet:
    def __init__(self):
        self.defs = []
        self.grads = {}
        self.parts = []
        self.frames = {}
        self.defs.append('''
<filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="softshade" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.2"/>
</filter>''')

    # Radial "lit from the top-left" fill for a base colour (cartoon shading).
    def shade(self, color):
        if color not in self.grads:
            gid = 'g%d' % len(self.grads)
            self.grads[color] = gid
            self.defs.append(
                '<radialGradient id="%s" cx="0.36" cy="0.32" r="0.75">'
                '<stop offset="0" stop-color="%s"/><stop offset="0.45" stop-color="%s"/>'
                '<stop offset="1" stop-color="%s"/></radialGradient>' % (gid, light(color, 0.35), color, dark(color, 0.32)))
        return 'url(#%s)' % self.grads[color]

    def place(self, name, box, x, y, markup):
        l, t, r, b = box
        w, h = r - l, b - t
        self.parts.append('<g transform="translate(%d,%d)">%s</g>' % (x - l, y - t, markup))
        self.frames[name] = {
            'frame': {'x': x, 'y': y, 'w': w, 'h': h},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
            'sourceSize': {'w': w, 'h': h},
            'pivot': {'x': round(-l / float(w), 6), 'y': round(-t / float(h), 6)}
        }
        return w


# ------------------------------------------------------------------ primitives
def ell(cx, cy, rx, ry, fill, sw=2, stroke=OUTLINE, extra=''):
    s = '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"' % (cx, cy, rx, ry, fill)
    if sw:
        s += ' stroke="%s" stroke-width="%.1f"' % (stroke, sw)
    return s + ' %s/>' % extra


def path(d, fill, sw=2, stroke=OUTLINE, extra=''):
    s = '<path d="%s" fill="%s" stroke-linejoin="round"' % (d, fill)
    if sw:
        s += ' stroke="%s" stroke-width="%.1f"' % (stroke, sw)
    return s + ' %s/>' % extra


def rect(x, y, w, h, rx, fill, sw=2, stroke=OUTLINE, extra=''):
    s = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s"' % (x, y, w, h, rx, fill)
    if sw:
        s += ' stroke="%s" stroke-width="%.1f"' % (stroke, sw)
    return s + ' %s/>' % extra


def line(pts, color, width, cap='round', extra=''):
    d = 'M' + ' L'.join('%.1f,%.1f' % p for p in pts)
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="%s" stroke-linejoin="round" %s/>' % (
        d, color, width, cap, extra)


def tube(pts, color, width):
    """Outlined limb: a dark stroke under a coloured stroke along the same polyline."""
    return line(pts, OUTLINE, width + 4) + line(pts, color, width) + line(
        [(p[0] - width * 0.18, p[1] - width * 0.18) for p in pts], '#ffffff', width * 0.25, extra='opacity="0.28"')


def hilite(cx, cy, rx, ry, op=0.35, rot=-30):
    return '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#ffffff" opacity="%.2f" transform="rotate(%d %.1f %.1f)"/>' % (
        cx, cy, rx, ry, op, rot, cx, cy)


def glow(markup):
    return '<g filter="url(#glow)">%s</g>' % markup


def mirror(markup):
    return '<g transform="scale(-1,1)">%s</g>' % markup


# ------------------------------------------------------------------ character parts
class Character:
    def __init__(self, sheet, c):
        self.s = sheet
        self.c = c
        self.b = c['build']

    # --- back gear (under everything) -------------------------------------
    def back(self, flame=1.0, sway=0.0, dead=False):
        c, s = self.c, self.s
        kind = c['back']
        out = ''
        if kind == 'blades':
            for sgn in (-1, 1):
                x0, y0, x1, y1 = 21 * sgn, 33, -11 * sgn, -6
                out += line([(x0, y0), (x1, y1)], OUTLINE, 7.5)
                out += line([(x0, y0), (x1, y1)], '#c9d6d6', 4)
                out += line([(x0, y0), (x0 - (x0 - x1) * 0.28, y0 - (y0 - y1) * 0.28)], c['trim'], 6)
                out += line([(x0 - (x0 - x1) * 0.08, y0 - (y0 - y1) * 0.08), (x0 - (x0 - x1) * 0.2, y0 - (y0 - y1) * 0.2)],
                            c['accent'], 3, cap='butt')
                hx, hy = x0 - (x0 - x1) * 0.3, y0 - (y0 - y1) * 0.3
                out += line([(hx - 4, hy), (hx + 4, hy)], OUTLINE, 3)
        elif kind == 'cloak':
            sx = sway * 2.5
            hem = []
            n = 7
            for i in range(n + 1):
                x = -27 + 54.0 * i / n + sx * (0.5 + 0.5 * math.sin(i))
                y = 31 + (4 if i % 2 else 0) + sway * (1 if i % 2 else -1)
                hem.append((x, y))
            d = 'M-20,-6 C-28,4 -29,18 %.1f,%.1f ' % hem[0]
            d += ' '.join('L%.1f,%.1f' % p for p in hem[1:])
            d += ' C29,18 28,4 20,-6 Z'
            out += path(d, s.shade(c['suit']))
            for x in (-12, 0, 12):
                out += line([(x * 0.7, 2), (x + sx * 0.6, 28)], dark(c['suit'], 0.35), 1.6, extra='opacity="0.8"')
            out += line([(hem[0][0] + 2, hem[0][1] - 3), (hem[-1][0] - 2, hem[-1][1] - 3)], c['accent'], 1.2,
                        extra='opacity="0.55"')
        elif kind == 'drum':
            out += ell(0, 20, 15, 14, s.shade(c['trim']), 2.2)
            out += ell(0, 20, 10, 9.5, s.shade(c['armor']), 1.5)
            out += ell(0, 20, 3.5, 3.5, c['accent'], 1.2)
            for i in range(8):
                a = i * math.pi / 4
                out += '<circle cx="%.1f" cy="%.1f" r="1.3" fill="%s"/>' % (12.5 * math.cos(a), 20 + 12 * math.sin(a), light(c['armor'], 0.5))
            # ammo belt to the gun arm
            belt = [(11, 12), (25, 6), (27, -10), (22, -20)]
            out += line(belt, OUTLINE, 7)
            out += line(belt, '#c9a23a', 4.5)
            out += line(belt, '#7a5a12', 4.5, cap='butt', extra='stroke-dasharray="1.6 2.2"')
        elif kind == 'jetpack':
            for sgn in (-1, 1):
                x = 10 * sgn
                if flame > 0 and not dead:
                    fl = 6 + 5 * flame
                    out += glow(path('M%.1f,30 Q%.1f,%.1f %.1f,%.1f Q%.1f,%.1f %.1f,30 Z' % (
                        x - 4.5, x - 4, 30 + fl * 0.6, x, 30 + fl, x + 4, 30 + fl * 0.6, x + 4.5),
                        c['accent'], 0, extra='opacity="0.9"'))
                    out += path('M%.1f,30 Q%.1f,%.1f %.1f,%.1f Q%.1f,%.1f %.1f,30 Z' % (
                        x - 2.5, x - 2, 30 + fl * 0.4, x, 30 + fl * 0.65, x + 2, 30 + fl * 0.4, x + 2.5), '#fff6d0', 0)
                out += rect(x - 6, 26, 12, 6, 2, dark(c['trim'], 0.3), 1.8)
                out += rect(x - 7.5, 6, 15, 23, 6, s.shade(c['armor']), 2.2)
                out += line([(x - 3, 11), (x - 3, 24)], '#ffffff', 2, extra='opacity="0.3"')
            out += rect(-6, 8, 12, 14, 3, s.shade(c['trim']), 1.8)
            out += '<circle cx="0" cy="15" r="2" fill="%s"/>' % c['accent']
        elif kind == 'core':
            out += path('M-14,4 L-11,27 L0,32 L11,27 L14,4 Z', s.shade(c['suit']))
            for i, y in enumerate((10, 16, 22)):
                out += rect(-9 + i, y, 18 - 2 * i, 4, 2, s.shade('#a9b1bd'), 1.4)
            if not dead:
                out += glow(ell(0, 28, 4.2, 4.2, c['accent'], 0))
                out += ell(0, 28, 2, 2, '#ffffff', 0)
            else:
                out += ell(0, 28, 4, 4, '#4a3a55', 1.4)
            for sgn in (-1, 1):
                out += line([(8 * sgn, 26), (17 * sgn, 32), (22 * sgn, 26)], OUTLINE, 3.5)
                out += line([(8 * sgn, 26), (17 * sgn, 32), (22 * sgn, 26)], '#5d6670', 2)
        elif kind == 'pack':
            out += rect(-15, 6, 30, 22, 5, s.shade(c['trim']), 2.2)
            out += rect(-11, 10, 22, 7, 2, dark(c['trim'], 0.4), 0)
            out += rect(-12, 21, 9, 6, 2, s.shade('#55301f'), 1.5)
            out += rect(3, 21, 9, 6, 2, s.shade('#55301f'), 1.5)
            out += glow('<circle cx="0" cy="13.5" r="2" fill="%s"/>' % c['accent'])
        return out

    # --- arms ---------------------------------------------------------------
    def arms(self, recoil):
        c, s, b = self.c, self.s, self.b
        r = recoil
        w = 8.5 * b
        sh = 17 * b
        out = ''
        # left (support) arm reaches across to the fore-grip, right arm holds the trigger grip
        left = [(-sh, -1 + r * 0.5), (-12, -26 + r), (13, -47 + r)]
        right = [(sh, -1 + r * 0.5), (sh + 6, -16 + r), (19, -30 + r)]
        mech = c['pauldron'] == 'asym'
        for pts, is_right in ((left, False), (right, True)):
            if mech and is_right:
                out += tube(pts, '#9aa3ad', w - 1.5)
                out += line(pts[1:], '#c9d0d8', 2, extra='opacity="0.7"')
                out += ell(pts[1][0], pts[1][1], 4.2, 4.2, s.shade('#b9c1ca'), 1.6)
                out += glow('<circle cx="%.1f" cy="%.1f" r="1.6" fill="%s"/>' % (pts[1][0], pts[1][1], c['accent']))
            else:
                out += tube(pts, c['suit'], w)
                # bracer on the forearm
                fx = pts[1][0] + (pts[2][0] - pts[1][0]) * 0.55
                fy = pts[1][1] + (pts[2][1] - pts[1][1]) * 0.55
                ax = pts[1][0] + (pts[2][0] - pts[1][0]) * 0.15
                ay = pts[1][1] + (pts[2][1] - pts[1][1]) * 0.15
                out += line([(ax, ay), (fx, fy)], OUTLINE, w + 6)
                out += line([(ax, ay), (fx, fy)], c['armor'], w + 2)
                out += line([(ax, ay), (fx, fy)], c['accent'], 1.4, extra='opacity="0.8"')
            hx, hy = pts[2]
            out += ell(hx, hy, 5.2 * b, 5.2 * b, s.shade(c['glove']), 2)
        return out

    # --- torso + shoulders ----------------------------------------------------
    def torso(self, breath, recoil):
        c, s, b = self.c, self.s, self.b
        y = recoil * 0.4
        out = ell(0, 2 + y, 17 * b + breath * 0.8, 14 + breath * 0.5, s.shade(c['armor']), 2.2)
        out += line([(-11 * b, -7 + y), (0, -12.5 + y), (11 * b, -7 + y)], c['accent'], 1.8, extra='opacity="0.85"')
        out += line([(-9 * b, 13 + y), (9 * b, 13 + y)], dark(c['armor'], 0.4), 2)
        return out

    def pauldron(self, side, breath, recoil, dead=False):
        """One shoulder (side = -1 left, +1 right), drawn for the right side then mirrored."""
        c, s, b = self.c, self.s, self.b
        kind = c['pauldron']
        x = (17 * b + 4 + breath * 0.8)
        y = 0 + recoil * 0.5
        sc = 1 + breath * 0.035
        out = ''
        if kind == 'slim':
            out += path('M%.1f,%.1f L%.1f,%.1f L%.1f,%.1f L%.1f,%.1f Z' % (
                x - 7, y - 9, x + 7, y - 5, x + 8, y + 6, x - 6, y + 9), s.shade(c['armor']))
            out += line([(x - 4, y - 5), (x + 5, y - 2)], c['accent'], 1.6)
            out += line([(x - 3, y + 1), (x + 5, y + 3)], c['accent'], 1.6, extra='opacity="0.7"')
        elif kind == 'round_small':
            out += ell(x, y, 9.5 * sc, 9 * sc, s.shade(c['armor']), 2)
            out += path('M%.1f,%.1f A8,8 0 0 1 %.1f,%.1f' % (x - 5, y - 6, x + 7, y + 2), 'none', 1.6, stroke=c['accent'])
        elif kind == 'square':
            out += rect(x - 10 * sc, y - 11 * sc, 22 * sc, 22 * sc, 5, s.shade(c['armor']), 2.4)
            for i in range(3):
                yy = y - 6 + i * 6
                out += line([(x - 6, yy + 2), (x - 2, yy - 2)], c['accent'], 2.6, cap='butt')
                out += line([(x + 2, yy + 2), (x + 6, yy - 2)], OUTLINE, 2.6, cap='butt', extra='opacity="0.8"')
            out += '<circle cx="%.1f" cy="%.1f" r="1.4" fill="%s"/>' % (x + 8, y - 8, light(c['armor'], 0.6))
            out += '<circle cx="%.1f" cy="%.1f" r="1.4" fill="%s"/>' % (x + 8, y + 8, light(c['armor'], 0.6))
        elif kind == 'round':
            out += ell(x, y, 12 * sc, 10.5 * sc, s.shade(c['armor']), 2.2)
            out += path('M%.1f,%.1f A11,9.5 0 0 1 %.1f,%.1f' % (x - 9, y - 6, x + 9, y + 5), 'none', 2, stroke=c['accent'])
        elif kind == 'asym':
            if side < 0:
                out += path('M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f L%.1f,%.1f Q%.1f,%.1f %.1f,%.1f Z' % (
                    x - 9, y - 12, x + 12, y - 14, x + 13, y - 1, x + 11, y + 11, x - 4, y + 14, x - 9, y + 9),
                    s.shade(c['armor']), 2.4)
                out += line([(x - 4, y - 7), (x + 8, y - 8)], c['accent'], 1.8)
                out += line([(x - 3, y + 7), (x + 7, y + 6)], dark(c['armor'], 0.4), 1.8)
            else:
                out += ell(x - 2, y, 8, 8, s.shade('#b9c1ca'), 2)
                out += ell(x - 2, y, 3.8, 3.8, '#3a3f46', 1.2)
                if not dead:
                    out += glow('<circle cx="%.1f" cy="%.1f" r="1.8" fill="%s"/>' % (x - 2, y, c['accent']))
        elif kind == 'spiked':
            for dx, dy in ((3, -9), (11, -2), (6, 8)):
                ang = math.atan2(dy, dx)
                bx, by = x + dx * 0.6, y + dy * 0.6
                tx, ty = x + dx * 2.0, y + dy * 2.0
                px, py = -math.sin(ang) * 4.2, math.cos(ang) * 4.2
                out += path('M%.1f,%.1f L%.1f,%.1f L%.1f,%.1f Z' % (bx + px, by + py, tx, ty, bx - px, by - py),
                            s.shade('#efe4c8'), 1.6)
            out += ell(x, y, 11 * sc, 10 * sc, s.shade(c['armor']), 2.2)
            out += ell(x, y, 5.5, 5, s.shade(c['trim']), 1.4)
        return out if side > 0 else mirror(out)

    def shoulders(self, breath, recoil, dead=False):
        return self.pauldron(-1, breath, recoil, dead) + self.pauldron(1, breath, recoil, dead)

    def body(self, breath=0.0, recoil=0.0, flame=1.0, sway=0.0):
        out = self.back(flame=flame, sway=sway)
        out += self.arms(recoil)
        out += self.torso(breath, recoil)
        out += self.shoulders(breath, recoil)
        if recoil:
            # recoil kick: a faint speed line behind the shoulders
            out += line([(-14, 20 + recoil), (-14, 26 + recoil * 1.5)], '#ffffff', 1.4, extra='opacity="0.35"')
            out += line([(14, 20 + recoil), (14, 26 + recoil * 1.5)], '#ffffff', 1.4, extra='opacity="0.35"')
        return out

    # --- helmet ------------------------------------------------------------------
    def head(self, dead=False):
        c, s = self.c, self.s
        kind = c['helmet']
        acc = c['accent'] if not dead else mix(c['accent'], '#3a3a3a', 0.7)

        def lit(markup):
            return markup if dead else glow(markup)

        out = ''
        if kind == 'fin':
            out += path('M-4,-14 L-11,-21 L-2,-17 Z', s.shade(c['trim']), 1.4)
            out += path('M4,-14 L11,-21 L2,-17 Z', s.shade(c['trim']), 1.4)
            out += ell(0, 1, 12.5, 15.5, s.shade(c['armor']), 2.2)
            out += lit(path('M-10,-6 Q0,-13.5 10,-6 Q0,-9.5 -10,-6 Z', acc, 0))
            out += path('M-10,-6 Q0,-13.5 10,-6', 'none', 1, stroke=light(acc, 0.5))
            # fin crest
            out += path('M0,-9 L3,-3 L1.5,-1 L3.6,4 L1.8,6 L3.4,12 L0,17 L-3.4,12 L-1.8,6 L-3.6,4 L-1.5,-1 L-3,-3 Z',
                        s.shade(acc if not dead else '#555566'), 1.5)
            for y in (2, 8):
                out += line([(-10, y), (-6, y + 2)], c['trim'], 1.6)
                out += line([(10, y), (6, y + 2)], c['trim'], 1.6)
            out += hilite(-6, -3, 3.5, 6, 0.3)
        elif kind == 'hood':
            out += path('M0,21 C-17,15 -18,-7 -12,-13 Q0,-20 12,-13 C18,-7 17,15 0,21 Z', s.shade(c['armor']), 2.2)
            out += path('M0,21 C-8,12 -9,2 -7,-4 M0,21 C8,12 9,2 7,-4', 'none', 1.4, stroke=dark(c['armor'], 0.25))
            out += ell(0, -9.5, 9, 5.5, '#0c141c', 1.5)
            out += lit('<circle cx="-4" cy="-10" r="2.1" fill="%s"/><circle cx="4" cy="-10" r="2.1" fill="%s"/>' % (acc, acc))
            out += path('M-12,-13 Q0,-20 12,-13', 'none', 1.6, stroke=c['accent'], extra='opacity="0.55"')
            out += hilite(-6, -1, 3.5, 7, 0.4)
        elif kind == 'block':
            out += rect(-15.5, -12, 4, 10, 1.5, s.shade(c['trim']), 1.5)
            out += rect(11.5, -12, 4, 10, 1.5, s.shade(c['trim']), 1.5)
            out += rect(-13.5, -15, 27, 30, 6.5, s.shade(c['armor']), 2.4)
            out += rect(-11, -14.5, 22, 5.5, 2, '#121417', 1.2)
            out += lit(rect(-9.5, -13.6, 19, 3.4, 1.5, acc, 0) + rect(-1.7, -13.6, 3.4, 9, 1.5, acc, 0))
            out += rect(-9, 3, 18, 9, 2.5, dark(c['armor'], 0.25), 1.3)
            for x in (-5, 0, 5):
                out += line([(x, 4.5), (x, 10.5)], '#16181b', 1.6)
            out += line([(14, 4), (19, 15)], OUTLINE, 2.6)
            out += line([(14, 4), (19, 15)], '#9aa3ad', 1.2)
            out += hilite(-6, -4, 3, 6, 0.3)
        elif kind == 'dome':
            out += line([(9, 6), (15, 17)], OUTLINE, 2.4)
            out += line([(9, 6), (15, 17)], '#b8c2cc', 1.1)
            out += ell(0, 0.5, 14.5, 15, s.shade(c['armor']), 2.2)
            out += line([(0, 3), (0, 14.5)], dark(c['armor'], 0.35), 2.2)
            visor = 'M-12.5,-0.5 C-13,-16 13,-16 12.5,-0.5 C7,-5 -7,-5 -12.5,-0.5 Z'
            if dead:
                out += path(visor, '#6f6a55', 1.6)
                out += line([(-6, -10), (-2, -7), (2, -11), (5, -8)], OUTLINE, 1)
            else:
                out += glow(path(visor, acc, 0, extra='opacity="0.7"'))
                out += path(visor, s.shade(acc), 1.6)
                out += path('M-8.5,-6 C-7,-11 -2,-12.5 3,-12', 'none', 1.6, stroke='#ffffff', extra='opacity="0.8"')
            out += hilite(-6, 2, 3, 5, 0.25)
        elif kind == 'cyclops':
            for i, x in enumerate((-6, 0, 6)):
                pts = [(x, 10), (x * 1.3 + (2 if i % 2 else -2), 16), (x * 1.5, 21)]
                out += line(pts, OUTLINE, 4.2)
                out += line(pts, '#3d2a52', 2.4)
                out += lit('<circle cx="%.1f" cy="%.1f" r="1.5" fill="%s"/>' % (x * 1.5, 21, acc))
            out += ell(0, 0, 14, 14.5, s.shade('#b9c1ca'), 2.2)
            out += path('M0,-14.5 A14,14.5 0 0 0 0,14.5 Z', s.shade(c['armor']), 0)
            out += path('M0,-14.5 L0,14.5', 'none', 1.6)
            out += ell(0, 0, 14, 14.5, 'none', 2.2)
            for pts in (((3, 2), (7, 2), (9, 6)), ((3, 7), (6, 10)), ((4, -3), (10, -3))):
                out += line(pts, '#59616b', 1.1)
            out += ell(0, -9, 6.2, 5.8, '#1b1622', 1.8)
            out += lit(ell(0, -9, 3.8, 3.6, acc, 0))
            if not dead:
                out += '<circle cx="-1.2" cy="-10.2" r="1.2" fill="#ffffff"/>'
            out += hilite(-6, 1, 2.5, 5, 0.3)
        elif kind == 'horns':
            for sgn in (-1, 1):
                horn = 'M%.1f,0 C%.1f,-5 %.1f,-13 %.1f,-24 C%.1f,-16 %.1f,-11 %.1f,-8 Z' % (
                    10 * sgn, 21 * sgn, 26 * sgn, 19 * sgn, 19 * sgn, 15 * sgn, 8.5 * sgn)
                out += path(horn, s.shade('#efe4c8'), 1.8)
                out += line([(16 * sgn, -4.5), (19 * sgn, -7)], '#9b8a63', 1.3)
                out += line([(19.5 * sgn, -11), (21.5 * sgn, -13.5)], '#9b8a63', 1.3)
                out += line([(20 * sgn, -17), (21 * sgn, -19.5)], '#9b8a63', 1.3)
            out += ell(0, 0.5, 13.5, 14.5, s.shade(c['armor']), 2.2)
            out += line([(0, -3), (0, 14)], OUTLINE, 4.2)
            out += line([(0, -3), (0, 14)], '#2a1a1a', 2.4)
            out += path('M-10,-9 L0,-4 L10,-9 L9,-12 L0,-8 L-9,-12 Z', '#1a0d0d', 1.2)
            out += lit(path('M-8.5,-10 L0,-6 L8.5,-10', 'none', 2, stroke=acc))
            out += hilite(-6, 1, 3, 5.5, 0.3)
        if dead:
            out += line([(-3, -12), (1, -7), (-1, -3)], '#ffffff', 1, extra='opacity="0.6"')
        return '<g transform="scale(%.2f)">%s</g>' % (HEAD_SCALE, out)

    # --- legs ------------------------------------------------------------------------
    def boot(self, x, y, sc=1.0, lifted=False):
        c, s = self.c, self.s
        w, h = 10.5 * sc, 17 * sc
        out = rect(x - w / 2, y - h / 2, w, h, 4.5 * sc, s.shade(dark(c['suit'], 0.15)), 2)
        out += rect(x - w / 2 + 1.2, y - h / 2 + 1, w - 2.4, h * 0.38, 3.5 * sc, s.shade(c['armor']), 1.3)
        out += line([(x - w / 2 + 2.5, y + h * 0.22), (x + w / 2 - 2.5, y + h * 0.22)], c['accent'], 1.3, extra='opacity="0.7"')
        if lifted:
            out += rect(x - w / 2, y - h / 2, w, h, 4.5 * sc, '#ffffff', 0, extra='opacity="0.12"')
        return out

    def legs(self, lf, rf, spread=9.0, sc=1.0, tuck=False):
        """lf / rf: forward (-) / back (+) offset of the left and right foot."""
        c = self.c
        out = ''
        b = self.b
        for sgn, fy in ((-1, lf), (1, rf)):
            hip = (7 * sgn * b, 3)
            foot = (spread * sgn, fy)
            knee = (hip[0] + (foot[0] - hip[0]) * 0.5 + 2.5 * sgn, (hip[1] + fy) * 0.5)
            out += tube([hip, knee, (foot[0], foot[1] + (5 if fy < 0 else -5) * sc)], c['suit'], 9 * b * sc)
            if tuck or abs(fy - hip[1]) > 7:
                out += ell(knee[0], knee[1], 4.2 * sc, 4.2 * sc, self.s.shade(c['armor']), 1.6)
        for sgn, fy in ((-1, lf), (1, rf)):
            out += self.boot(spread * sgn, fy, sc, lifted=fy > 12)
        # hips / belt so the top of the legs never shows a hard edge under the torso
        out += rect(-12 * b, -3, 24 * b, 11, 5, self.s.shade(c['trim']), 2)
        out += rect(-3, -1, 6, 6, 1.5, c['accent'], 1.2)
        return out

    # --- corpse --------------------------------------------------------------------------
    def dead(self):
        c, s = self.c, self.s
        pool = 'M-20,-30 C-34,-22 -30,4 -26,16 C-30,30 -12,40 2,32 C16,38 30,26 24,10 C34,-4 28,-30 12,-34 C2,-42 -12,-38 -20,-30 Z'
        out = '<g filter="url(#softshade)">%s</g>' % path(pool, '#6a0f0f', 0, extra='opacity="0.55"')
        out += path('M-22,24 C-30,30 -24,38 -16,34 Z', '#6a0f0f', 0, extra='opacity="0.5"')
        # spread-eagled on the back, slightly turned so it never reads as a standing figure
        out += '<g transform="rotate(-14)">'
        out += '<g transform="translate(0,-4)">%s</g>' % self.back(flame=0, dead=True)
        # straight legs, boots pointing up (out of the screen)
        for sgn, foot in ((-1, (-18, 44)), (1, (16, 46))):
            hip = (7 * sgn, 14)
            out += tube([hip, ((hip[0] + foot[0]) / 2.0, (hip[1] + foot[1]) / 2.0), foot], c['suit'], 9.5)
            out += ell(foot[0], foot[1] + 2, 6.5, 8, s.shade(dark(c['suit'], 0.15)), 2)
            out += ell(foot[0], foot[1] + 1, 4.5, 5, s.shade(c['armor']), 1.3)
        # limp arms flung out sideways
        for pts in (((-17, -16), (-27, -21), (-35, -25)), ((17, -16), (28, -10), (36, -4))):
            out += tube(pts, c['suit'], 8.5)
            out += ell(pts[2][0], pts[2][1], 5.2, 5.2, s.shade(c['glove']), 2)
        out += rect(-12, 6, 24, 11, 5, s.shade(c['trim']), 2)
        out += ell(0, -6, 18, 16, s.shade(c['armor']), 2.2)
        out += line([(-11, -12), (0, -17), (11, -12)], mix(c['accent'], '#333333', 0.5), 1.8)
        out += '<g transform="translate(0,-16)">%s</g>' % self.shoulders(0, 0, dead=True)
        out += '<g transform="translate(-2,-31) rotate(22)">%s</g>' % self.head(dead=True)
        out += '</g>'
        return out


WALK = [(-20, 16), (-5, 3), (16, -20), (3, -5)]


def build():
    sheet = Sheet()
    body_w = BODY_BOX[2] - BODY_BOX[0]
    body_h = BODY_BOX[3] - BODY_BOX[1]
    row_h = max(body_h, DEAD_BOX[3] - DEAD_BOX[1]) + GAP
    y = GAP
    for c in CHARACTERS:
        ch = Character(sheet, c)
        k = c['key']
        x = GAP
        frames = [
            ('body_idle_0', BODY_BOX, ch.body(0.0, 0.0, flame=0.8, sway=-0.6)),
            ('body_idle_1', BODY_BOX, ch.body(1.0, 0.0, flame=1.0, sway=0.6)),
            ('body_fire_0', BODY_BOX, ch.body(0.0, 4.0, flame=1.2, sway=0.9)),
            ('body_fire_1', BODY_BOX, ch.body(0.5, 2.0, flame=1.1, sway=0.3)),
            ('head', HEAD_BOX, ch.head()),
        ]
        for i, (lf, rf) in enumerate(WALK):
            frames.append(('legs_walk_%d' % i, LEGS_BOX, ch.legs(lf, rf)))
        frames.append(('legs_stand', LEGS_BOX, ch.legs(-6, -4, spread=10)))
        frames.append(('legs_jump', LEGS_BOX, ch.legs(-12, -10, spread=11.5, sc=0.92, tuck=True)))
        frames.append(('dead', DEAD_BOX, ch.dead()))
        frames.append(('portrait', BODY_BOX, ch.legs(-6, -4, spread=10) + ch.body(0.0, 0.0) + ch.head()))
        for name, box, markup in frames:
            x += sheet.place('%s_%s' % (k, name), box, x, y, markup) + GAP
        width = x
        y += row_h
    return sheet, width, y


def main():
    sheet, w, h = build()
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (w, h, w, h)]
    out.append('<!-- Generated by tools/gen_characters.py. Edit the generator, not this file. -->')
    out.append('<defs>' + ''.join(sheet.defs) + '</defs>')
    out.extend(sheet.parts)
    out.append('</svg>')
    os.makedirs(os.path.dirname(SVG_OUT), exist_ok=True)
    with open(SVG_OUT, 'w') as f:
        f.write('\n'.join(out))
    meta = {
        'app': 'tools/gen_characters.py',
        'version': '1.0',
        'image': 'characters.png',
        'format': 'RGBA8888',
        'size': {'w': w, 'h': h},
        'scale': '1',
        'characters': [{'key': c['key'], 'name': c['name'], 'bio': c['bio'], 'accent': c['accent']} for c in CHARACTERS]
    }
    with open(JSON_OUT, 'w') as f:
        json.dump({'frames': sheet.frames, 'meta': meta}, f, indent=1)
    print('wrote', os.path.relpath(SVG_OUT))
    print('wrote', os.path.relpath(JSON_OUT))


if __name__ == '__main__':
    main()
