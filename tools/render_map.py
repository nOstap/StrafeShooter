#!/usr/bin/env python3
"""Render a Tiled JSON map to a PNG preview (tile layers + collision/spawn overlays).

usage: python3 tools/render_map.py public/assets/<map>.json out.png [scale] [--overlay]
"""
import json, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')


def load_tilesets(m):
    sets = []
    for ts in m['tilesets']:
        img = Image.open(os.path.join(ROOT, ts['image'])).convert('RGBA')
        sets.append((ts['firstgid'], ts, img))
    sets.sort(key=lambda s: s[0])
    return sets


def tile_image(sets, gid, cache={}):
    if gid in cache:
        return cache[gid]
    for firstgid, ts, img in reversed(sets):
        if gid >= firstgid:
            i = gid - firstgid
            cols, tw, th, mg = ts['columns'], ts['tilewidth'], ts['tileheight'], ts.get('margin', 0)
            sp = ts.get('spacing', 0)
            x, y = mg + (i % cols) * (tw + sp), mg + (i // cols) * (th + sp)
            cache[gid] = img.crop((x, y, x + tw, y + th))
            return cache[gid]


def render(path, out, scale=0.2, overlay=False):
    m = json.load(open(path))
    sets = load_tilesets(m)
    tw, th = m['tilewidth'], m['tileheight']
    W, H = m['width'], m['height']
    im = Image.new('RGBA', (W * tw, H * th), (51, 158, 255, 255))
    for layer in m['layers']:
        if layer['type'] != 'tilelayer':
            continue
        for idx, gid in enumerate(layer['data']):
            if gid:
                t = tile_image(sets, gid)
                im.alpha_composite(t, ((idx % W) * tw, (idx // W) * th))
    if overlay:
        d = ImageDraw.Draw(im)
        colors = {'Walls': (255, 0, 0, 255), 'SeaWalls': (0, 0, 160, 255)}
        for layer in m['layers']:
            if layer['type'] != 'objectgroup':
                continue
            c = colors.get(layer['name'], (255, 255, 0, 255))
            for o in layer['objects']:
                d.rectangle([o['x'], o['y'], o['x'] + o['width'], o['y'] + o['height']], outline=c, width=12)
    im = im.resize((int(W * tw * scale), int(H * th * scale)), Image.LANCZOS)
    im.save(out)


if __name__ == '__main__':
    render(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else 0.2,
           '--overlay' in sys.argv)
