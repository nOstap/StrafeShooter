// Navigation grid baked from a Tiled map: clearance, walkability, components, points of
// interest, line-of-sight queries and per-POI Dijkstra flow fields.
// Pure module (no engine globals) so it can be loaded and tested with plain node.

var DEFAULTS = require('./BotConfig.js').NAV;

var SQRT2 = Math.SQRT2;
// 8-neighbourhood: 4 orthogonal first, then diagonals.
var NDX = [1, -1, 0, 0, 1, -1, 1, -1];
var NDY = [0, 0, 1, -1, 1, 1, -1, -1];
var cache = {};

function nowMs() {
    var t = process.hrtime();
    return t[0] * 1e3 + t[1] / 1e6;
}
function clampInt(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
function findLayer(map, name) {
    for (var i = 0; i < map.layers.length; i++)
        if (map.layers[i] && map.layers[i].name === name) return map.layers[i];
    return null;
}
// Liang-Barsky: entry t in [0, 1] of segment a + t*d against an AABB, or -1. Handles
// zero-size rects (segments) and a start point inside the rect (t = 0).
function segRect(ax, ay, dx, dy, r) {
    var t0 = 0, t1 = 1, inv, ta, tb, tmp;
    if (dx === 0) {
        if (ax < r[0] || ax > r[2]) return -1;
    } else {
        inv = 1 / dx;
        ta = (r[0] - ax) * inv;
        tb = (r[2] - ax) * inv;
        if (ta > tb) {
            tmp = ta;
            ta = tb;
            tb = tmp;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return -1;
    }
    if (dy === 0) {
        if (ay < r[1] || ay > r[3]) return -1;
    } else {
        inv = 1 / dy;
        ta = (r[1] - ay) * inv;
        tb = (r[3] - ay) * inv;
        if (ta > tb) {
            tmp = ta;
            ta = tb;
            tb = tmp;
        }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return -1;
    }
    return t0;
}

function NavGrid(map, opts) {
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in opts || {}) o[k] = opts[k];
    var t0 = nowMs();
    this.opts = o;
    this.CELL = o.CELL;
    this.R_HARD = o.R_HARD;
    this.widthM = map.width * map.tilewidth / o.SCALE;
    this.heightM = map.height * map.tileheight / o.SCALE;
    this.W = Math.ceil(this.widthM / o.CELL - 1e-9);
    this.H = Math.ceil(this.heightM / o.CELL - 1e-9);
    this.warnings = [];
    this.moveRects = [];
    this.shotRects = [];
    var walls = findLayer(map, 'Walls'), sea = findLayer(map, 'SeaWalls');
    var i, r;
    for (i = 0; walls && walls.objects && i < walls.objects.length; i++) {
        r = this._objRect(walls.objects[i], 'Walls');
        this.moveRects.push(r);
        this.shotRects.push(r);
    }
    for (i = 0; sea && sea.objects && i < sea.objects.length; i++)
        this.moveRects.push(this._objRect(sea.objects[i], 'SeaWalls'));

    this._bakeClearance();
    var n = this.W * this.H;
    this.walk = new Uint8Array(n);
    this.cost = new Float32Array(n);
    this.walkableCount = 0;
    for (i = 0; i < n; i++) {
        var c = this.clear[i];
        if (c >= o.R_HARD) {
            this.walk[i] = 1;
            this.walkableCount++;
        }
        this.cost[i] = 1 + o.SOFT_K * Math.max(0, o.R_SOFT - c);
    }
    this._label();
    this._findPois(map);
    this._buildShotBuckets();
    this.fields = null;
    this.fieldsMs = 0;
    this.bakeMs = nowMs() - t0;
}

// Baked grid + fields, cached per map name for the life of the process.
NavGrid.forMap = function (name, map, opts) {
    if (!cache[name]) {
        var grid = new NavGrid(map, opts);
        grid.buildFields();
        cache[name] = grid;
    }
    return cache[name];
};

// Object rect in metres [x0, y0, x1, y1]. Polygon and rotated objects become (conservative)
// bounding boxes; the physics engine builds plain w*h boxes for them anyway.
NavGrid.prototype._objRect = function (obj, layerName) {
    var S = this.opts.SCALE;
    var x0 = obj.x, y0 = obj.y, x1 = obj.x + (obj.width || 0), y1 = obj.y + (obj.height || 0);
    var i;
    if (obj.polygon && obj.polygon.length) {
        for (i = 0; i < obj.polygon.length; i++) {
            var px = obj.x + obj.polygon[i].x, py = obj.y + obj.polygon[i].y;
            if (px < x0) x0 = px;
            if (px > x1) x1 = px;
            if (py < y0) y0 = py;
            if (py > y1) y1 = py;
        }
        this.warnings.push(layerName + ' object ' + obj.id + ' is a polygon; using its bounding box');
    }
    if (obj.rotation) {
        var a = obj.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        var cs = [[x0 - obj.x, y0 - obj.y], [x1 - obj.x, y0 - obj.y], [x1 - obj.x, y1 - obj.y], [x0 - obj.x, y1 - obj.y]];
        var nx0 = Infinity, ny0 = Infinity, nx1 = -Infinity, ny1 = -Infinity;
        for (i = 0; i < 4; i++) {
            // Tiled rotates clockwise around the object origin (the y axis points down).
            var rx = obj.x + cs[i][0] * c - cs[i][1] * s, ry = obj.y + cs[i][0] * s + cs[i][1] * c;
            nx0 = Math.min(nx0, rx);
            ny0 = Math.min(ny0, ry);
            nx1 = Math.max(nx1, rx);
            ny1 = Math.max(ny1, ry);
        }
        x0 = nx0;
        y0 = ny0;
        x1 = nx1;
        y1 = ny1;
        this.warnings.push(layerName + ' object ' + obj.id + ' is rotated; using its bounding box');
    }
    return [x0 / S, y0 / S, x1 / S, y1 / S];
};

// Exact Euclidean distance from every cell centre to the nearest blocker or map edge,
// capped at CLEAR_CAP. Rects are bucketed with a CLEAR_CAP margin so a cell only has to
// look at its own bucket.
NavGrid.prototype._bakeClearance = function () {
    var o = this.opts, W = this.W, H = this.H, CELL = o.CELL, cap = o.CLEAR_CAP, B = o.BUCKET;
    var widthM = this.widthM, heightM = this.heightM;
    var BW = Math.max(1, Math.ceil(widthM / B)), BH = Math.max(1, Math.ceil(heightM / B));
    var buckets = new Array(BW * BH), i, x, y;
    for (i = 0; i < buckets.length; i++) buckets[i] = [];
    var rects = this.moveRects;
    for (i = 0; i < rects.length; i++) {
        var r = rects[i];
        var bx0 = clampInt(Math.floor((r[0] - cap) / B), 0, BW - 1), bx1 = clampInt(Math.floor((r[2] + cap) / B), 0, BW - 1);
        var by0 = clampInt(Math.floor((r[1] - cap) / B), 0, BH - 1), by1 = clampInt(Math.floor((r[3] + cap) / B), 0, BH - 1);
        for (y = by0; y <= by1; y++)
            for (x = bx0; x <= bx1; x++) buckets[y * BW + x].push(r);
    }
    var clear = this.clear = new Float32Array(W * H);
    for (y = 0; y < H; y++) {
        var py = (y + 0.5) * CELL;
        var by = clampInt(Math.floor(py / B), 0, BH - 1);
        for (x = 0; x < W; x++) {
            var px = (x + 0.5) * CELL;
            var d = Math.min(px, py, widthM - px, heightM - py, cap);
            if (d < 0) d = 0;
            var bucket = buckets[by * BW + clampInt(Math.floor(px / B), 0, BW - 1)];
            for (var k = 0; k < bucket.length; k++) {
                var rr = bucket[k];
                var dx = Math.max(rr[0] - px, 0, px - rr[2]);
                var dy = Math.max(rr[1] - py, 0, py - rr[3]);
                if (dx < d && dy < d) {
                    var dd = Math.sqrt(dx * dx + dy * dy);
                    if (dd < d) d = dd;
                }
            }
            clear[y * W + x] = d;
        }
    }
};

// 4-neighbour connected components of walkable cells (iterative flood fill).
NavGrid.prototype._label = function () {
    var W = this.W, H = this.H, n = W * H, walk = this.walk;
    var comp = this.comp = new Int32Array(n);
    comp.fill(-1);
    this.compSize = [];
    var stack = new Int32Array(n);
    for (var s = 0; s < n; s++) {
        if (!walk[s] || comp[s] !== -1) continue;
        var label = this.compSize.length, size = 0, sp = 0;
        comp[s] = label;
        stack[sp++] = s;
        while (sp > 0) {
            var c = stack[--sp];
            size++;
            var x = c % W, y = (c - x) / W;
            if (x > 0 && walk[c - 1] && comp[c - 1] === -1) {
                comp[c - 1] = label;
                stack[sp++] = c - 1;
            }
            if (x < W - 1 && walk[c + 1] && comp[c + 1] === -1) {
                comp[c + 1] = label;
                stack[sp++] = c + 1;
            }
            if (y > 0 && walk[c - W] && comp[c - W] === -1) {
                comp[c - W] = label;
                stack[sp++] = c - W;
            }
            if (y < H - 1 && walk[c + W] && comp[c + W] === -1) {
                comp[c + W] = label;
                stack[sp++] = c + W;
            }
        }
        this.compSize.push(size);
    }
};

// Player spawns plus every crate spawn layer, exactly the layers GameEngine.spawnItems uses.
NavGrid.prototype._findPois = function (map) {
    var self = this, S = this.opts.SCALE, pois = this.pois = [];
    var add = function (layer, kind) {
        for (var i = 0; layer && layer.objects && i < layer.objects.length; i++) {
            var obj = layer.objects[i];
            var w = (obj.width || 0) / S, h = (obj.height || 0) / S;
            var x = obj.x / S + w * 0.5, y = obj.y / S + h * 0.5;
            var cell = self.nearestWalkable(self.cellOf(x, y), self.opts.SNAP_CELLS);
            pois.push({
                index: pois.length, kind: kind, x: x, y: y, w: w, h: h,
                cell: cell, comp: cell >= 0 ? self.comp[cell] : -1
            });
        }
    };
    add(findLayer(map, 'PlayerSpawns'), 'Player');
    map.layers.forEach(function (layer) {
        if (layer && layer.properties && layer.properties.type === 'CrateSpawn')
            add(layer, layer.name.replace('Spawns', ''));
    });
    var counts = {}, best = -1;
    pois.forEach(function (p) {
        if (p.comp < 0) return;
        counts[p.comp] = (counts[p.comp] || 0) + 1;
        if (best < 0 || counts[p.comp] > counts[best] ||
            (counts[p.comp] === counts[best] && self.compSize[p.comp] > self.compSize[best])) best = p.comp;
    });
    this.mainComp = best;
};

NavGrid.prototype._buildShotBuckets = function () {
    var B = this.opts.BUCKET, eps = 1e-6;
    var BW = this.SBW = Math.max(1, Math.ceil(this.widthM / B));
    var BH = this.SBH = Math.max(1, Math.ceil(this.heightM / B));
    var buckets = this.shotBuckets = new Array(BW * BH), i, x, y;
    for (i = 0; i < buckets.length; i++) buckets[i] = [];
    for (i = 0; i < this.shotRects.length; i++) {
        var r = this.shotRects[i];
        var bx0 = clampInt(Math.floor((r[0] - eps) / B), 0, BW - 1), bx1 = clampInt(Math.floor((r[2] + eps) / B), 0, BW - 1);
        var by0 = clampInt(Math.floor((r[1] - eps) / B), 0, BH - 1), by1 = clampInt(Math.floor((r[3] + eps) / B), 0, BH - 1);
        for (y = by0; y <= by1; y++)
            for (x = bx0; x <= bx1; x++) buckets[y * BW + x].push(i);
    }
    this.shotStamp = new Uint32Array(this.shotRects.length);
    this.stampGen = 0;
};

NavGrid.prototype.cellOf = function (x, y) {
    if (!(x >= 0 && y >= 0)) return -1;
    var cx = Math.floor(x / this.CELL), cy = Math.floor(y / this.CELL);
    if (cx >= this.W || cy >= this.H) return -1;
    return cy * this.W + cx;
};
NavGrid.prototype.cx = function (c) {
    return (c % this.W + 0.5) * this.CELL;
};
NavGrid.prototype.cy = function (c) {
    return (Math.floor(c / this.W) + 0.5) * this.CELL;
};
NavGrid.prototype.isWalkable = function (x, y) {
    var c = this.cellOf(x, y);
    return c >= 0 && this.walk[c] === 1;
};
NavGrid.prototype.clearanceAt = function (x, y) {
    var c = this.cellOf(x, y);
    return c >= 0 ? this.clear[c] : 0;
};

// Closest walkable cell (optionally in a given component). Rings grow by Chebyshev radius;
// inside the first ring with a hit the Euclidean-closest cell wins, ties by lower index.
NavGrid.prototype.nearestWalkable = function (c, maxR, wantComp) {
    if (c < 0) return -1;
    var W = this.W, H = this.H, walk = this.walk, comp = this.comp;
    var anyComp = wantComp == null;
    if (walk[c] && (anyComp || comp[c] === wantComp)) return c;
    var x0 = c % W, y0 = (c - x0) / W;
    for (var r = 1; r <= maxR; r++) {
        var best = -1, bestD = Infinity;
        for (var dy = -r; dy <= r; dy++) {
            var y = y0 + dy;
            if (y < 0 || y >= H) continue;
            var step = dy === -r || dy === r ? 1 : 2 * r;
            for (var dx = -r; dx <= r; dx += step) {
                var x = x0 + dx;
                if (x < 0 || x >= W) continue;
                var i = y * W + x;
                if (!walk[i] || (!anyComp && comp[i] !== wantComp)) continue;
                var d = dx * dx + dy * dy;
                if (d < bestD || (d === bestD && i < best)) {
                    best = i;
                    bestD = d;
                }
            }
        }
        if (best >= 0) return best;
    }
    return -1;
};

// Amanatides-Woo walk over the 0.5 m cells; every touched cell needs clear >= minClear.
// When the line passes exactly through a cell corner both side cells are tested too.
NavGrid.prototype.walkLOS = function (ax, ay, bx, by, minClear) {
    var mc = minClear || this.R_HARD;
    var W = this.W, H = this.H, CELL = this.CELL, clear = this.clear;
    var x = Math.floor(ax / CELL), y = Math.floor(ay / CELL);
    var ex = Math.floor(bx / CELL), ey = Math.floor(by / CELL);
    if (x < 0 || y < 0 || x >= W || y >= H || clear[y * W + x] < mc) return false;
    if (ex < 0 || ey < 0 || ex >= W || ey >= H || clear[ey * W + ex] < mc) return false;
    var dx = bx - ax, dy = by - ay;
    var stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    var tDeltaX = stepX ? CELL / Math.abs(dx) : Infinity, tDeltaY = stepY ? CELL / Math.abs(dy) : Infinity;
    var tMaxX = stepX > 0 ? ((x + 1) * CELL - ax) / dx : stepX < 0 ? (x * CELL - ax) / dx : Infinity;
    var tMaxY = stepY > 0 ? ((y + 1) * CELL - ay) / dy : stepY < 0 ? (y * CELL - ay) / dy : Infinity;
    var n = Math.abs(ex - x) + Math.abs(ey - y);
    var i = 0, nx, ny;
    while (i < n) {
        if (tMaxX < tMaxY) {
            x += stepX;
            tMaxX += tDeltaX;
            i++;
        } else if (tMaxY < tMaxX) {
            y += stepY;
            tMaxY += tDeltaY;
            i++;
        } else {
            nx = x + stepX;
            ny = y + stepY;
            if (nx < 0 || nx >= W || clear[y * W + nx] < mc) return false;
            if (ny < 0 || ny >= H || clear[ny * W + x] < mc) return false;
            x = nx;
            y = ny;
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
            i += 2;
        }
        if (x < 0 || y < 0 || x >= W || y >= H || clear[y * W + x] < mc) return false;
    }
    return true;
};

// Segment against the Walls rects (SeaWalls never stop bullets), walking the 4 m buckets.
// Returns the entry t (0..1) of the first hit, or Infinity.
NavGrid.prototype._shotQuery = function (ax, ay, bx, by, firstOnly) {
    var B = this.opts.BUCKET, BW = this.SBW, BH = this.SBH;
    var dx = bx - ax, dy = by - ay;
    var bounds = [0, 0, BW * B, BH * B];
    var tc0 = segRect(ax, ay, dx, dy, bounds);
    if (tc0 < 0) return Infinity;
    var tc1 = 1 - segRect(bx, by, -dx, -dy, bounds);
    if (++this.stampGen >= 0xFFFFFFFF) {
        this.shotStamp.fill(0);
        this.stampGen = 1;
    }
    var gen = this.stampGen, stamp = this.shotStamp, rects = this.shotRects, buckets = this.shotBuckets;
    var x = clampInt(Math.floor((ax + dx * tc0) / B), 0, BW - 1), y = clampInt(Math.floor((ay + dy * tc0) / B), 0, BH - 1);
    var ex = clampInt(Math.floor((ax + dx * tc1) / B), 0, BW - 1), ey = clampInt(Math.floor((ay + dy * tc1) / B), 0, BH - 1);
    var stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    var tDeltaX = stepX ? B / Math.abs(dx) : Infinity, tDeltaY = stepY ? B / Math.abs(dy) : Infinity;
    var tMaxX = stepX > 0 ? ((x + 1) * B - ax) / dx : stepX < 0 ? (x * B - ax) / dx : Infinity;
    var tMaxY = stepY > 0 ? ((y + 1) * B - ay) / dy : stepY < 0 ? (y * B - ay) / dy : Infinity;
    var n = Math.abs(ex - x) + Math.abs(ey - y);
    var best = Infinity, tEnter = tc0;
    for (var i = 0; ; i++) {
        // Rects that start in later buckets can only be hit later along the segment.
        if (tEnter > best) break;
        var bucket = buckets[y * BW + x];
        for (var k = 0; k < bucket.length; k++) {
            var ri = bucket[k];
            if (stamp[ri] === gen) continue;
            stamp[ri] = gen;
            var t = segRect(ax, ay, dx, dy, rects[ri]);
            if (t >= 0 && t < best) {
                best = t;
                if (firstOnly) return best;
            }
        }
        if (i >= n) break;
        if (tMaxX < tMaxY) {
            tEnter = tMaxX;
            x += stepX;
            tMaxX += tDeltaX;
        } else {
            tEnter = tMaxY;
            y += stepY;
            tMaxY += tDeltaY;
        }
        if (x < 0 || y < 0 || x >= BW || y >= BH) break;
    }
    return best;
};
NavGrid.prototype.shotLOS = function (ax, ay, bx, by) {
    return this._shotQuery(ax, ay, bx, by, true) === Infinity;
};
// Distance along the segment to the first Walls hit, or Infinity.
NavGrid.prototype.rayHit = function (ax, ay, bx, by) {
    var t = this._shotQuery(ax, ay, bx, by, false);
    if (t === Infinity) return Infinity;
    var dx = bx - ax, dy = by - ay;
    return t * Math.sqrt(dx * dx + dy * dy);
};

// Dijkstra cost (metres, weighted by cell cost) from every POI to every cell. Edge costs
// are symmetric, so fields[b][a.cell] is also the optimal A* cost from a to b.
NavGrid.prototype.buildFields = function () {
    var t0 = nowMs();
    var n = this.W * this.H;
    var dist = new Float64Array(n);
    this.fields = [];
    for (var i = 0; i < this.pois.length; i++) {
        var field = new Float32Array(n);
        if (this.pois[i].cell < 0) field.fill(Infinity);
        else {
            this._dijkstra(this.pois[i].cell, dist);
            field.set(dist);
        }
        this.fields.push(field);
    }
    this.fieldsMs = nowMs() - t0;
};
NavGrid.prototype._dijkstra = function (src, dist) {
    var W = this.W, H = this.H, walk = this.walk, cost = this.cost, CELL = this.CELL;
    var stepLen = [CELL, CELL, CELL, CELL, CELL * SQRT2, CELL * SQRT2, CELL * SQRT2, CELL * SQRT2];
    if (!this._hc) {
        this._hc = new Int32Array(W * H * 2);
        this._hk = new Float64Array(W * H * 2);
    }
    var hc = this._hc, hk = this._hk, size;
    dist.fill(Infinity);
    dist[src] = 0;
    hc[0] = src;
    hk[0] = 0;
    size = 1;
    while (size > 0) {
        var c = hc[0], d = hk[0];
        // Pop: move the last entry to the root and sift it down.
        size--;
        if (size > 0) {
            var lc = hc[size], lk = hk[size], j = 0;
            for (; ;) {
                var l = 2 * j + 1;
                if (l >= size) break;
                var r = l + 1, m = r < size && hk[r] < hk[l] ? r : l;
                if (hk[m] >= lk) break;
                hc[j] = hc[m];
                hk[j] = hk[m];
                j = m;
            }
            hc[j] = lc;
            hk[j] = lk;
        }
        if (d > dist[c]) continue;
        var x = c % W, y = (c - x) / W, cc = cost[c];
        for (var k = 0; k < 8; k++) {
            var nx = x + NDX[k], ny = y + NDY[k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            var nc = ny * W + nx;
            if (!walk[nc]) continue;
            if (k >= 4 && (!walk[y * W + nx] || !walk[ny * W + x])) continue;
            var nd = d + stepLen[k] * (cc + cost[nc]) * 0.5;
            if (nd < dist[nc]) {
                dist[nc] = nd;
                if (size >= hc.length) {
                    var nhc = new Int32Array(hc.length * 2), nhk = new Float64Array(hk.length * 2);
                    nhc.set(hc);
                    nhk.set(hk);
                    hc = this._hc = nhc;
                    hk = this._hk = nhk;
                }
                var p = size++;
                while (p > 0) {
                    var parent = (p - 1) >> 1;
                    if (hk[parent] <= nd) break;
                    hc[p] = hc[parent];
                    hk[p] = hk[parent];
                    p = parent;
                }
                hc[p] = nc;
                hk[p] = nd;
            }
        }
    }
};
NavGrid.prototype.fieldValue = function (i, c) {
    return c < 0 || !this.fields || !this.fields[i] ? Infinity : this.fields[i][c];
};
// Greedy descent of POI i's field from cell c; writes the visited cells to `out`.
NavGrid.prototype.descend = function (i, c, maxSteps, out) {
    var f = this.fields && this.fields[i], W = this.W, H = this.H, walk = this.walk;
    var n = 0, cur = c;
    if (!f || c < 0) return 0;
    while (n < maxSteps) {
        var x = cur % W, y = (cur - x) / W, best = -1, bestV = f[cur];
        for (var k = 0; k < 8; k++) {
            var nx = x + NDX[k], ny = y + NDY[k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            var nc = ny * W + nx;
            if (!walk[nc]) continue;
            if (k >= 4 && (!walk[y * W + nx] || !walk[ny * W + x])) continue;
            if (f[nc] < bestV) {
                bestV = f[nc];
                best = nc;
            }
        }
        if (best < 0) break;
        out[n++] = best;
        cur = best;
    }
    return n;
};
NavGrid.prototype.nearestPoi = function (x, y, kind, maxDist) {
    var best = -1, bestD = maxDist == null ? Infinity : maxDist * maxDist;
    for (var i = 0; i < this.pois.length; i++) {
        var p = this.pois[i];
        if (kind && p.kind !== kind) continue;
        var dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy;
        if (d <= bestD && (best < 0 || d < bestD)) {
            best = i;
            bestD = d;
        }
    }
    return best;
};

module.exports = NavGrid;
