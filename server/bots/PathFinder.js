// A* on a NavGrid (same neighbours and symmetric costs as the Dijkstra fields), greedy
// string-pulling, and a FIFO request queue served with a per-tick expansion budget.
// Pure module (no engine globals).

var DEFAULTS = require('./BotConfig.js').PATH;

var SQRT2 = Math.SQRT2;
// The fields are float32 copies of the Dijkstra costs; scaling the landmark bound down a
// little keeps it admissible (and consistent) despite that rounding.
var LANDMARK_SCALE = 0.9999;
var NDX = [1, -1, 0, 0, 1, -1, 1, -1];
var NDY = [0, 0, 1, -1, 1, 1, -1, -1];

function PathFinder(grid, opts) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in opts || {}) o[k] = opts[k];
    this.opts = o;
    this.grid = grid;
    var n = grid.W * grid.H;
    // g in doubles so long paths match the (double precision) Dijkstra fields exactly.
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.openStamp = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.gen = 0;
    this.heapC = new Int32Array(1024);
    this.heapF = new Float64Array(1024);
    this.heapH = new Float64Array(1024);
    this.heapSize = 0;
    this.lmField = new Array(o.LANDMARKS);
    this.lmGoal = new Float64Array(o.LANDMARKS);
    this.lmBound = new Float64Array(o.LANDMARKS);
    this.queue = [];
    this.stats = {searches: 0, expansions: 0, partial: 0, failed: 0, queue: 0};
}

PathFinder.prototype._less = function (a, b) {
    var hf = this.heapF, hh = this.heapH, hc = this.heapC;
    if (hf[a] !== hf[b]) return hf[a] < hf[b];
    if (hh[a] !== hh[b]) return hh[a] < hh[b];
    return hc[a] < hc[b];
};
PathFinder.prototype._swap = function (a, b) {
    var hf = this.heapF, hh = this.heapH, hc = this.heapC, t;
    t = hf[a];
    hf[a] = hf[b];
    hf[b] = t;
    t = hh[a];
    hh[a] = hh[b];
    hh[b] = t;
    t = hc[a];
    hc[a] = hc[b];
    hc[b] = t;
};
PathFinder.prototype._push = function (c, f, h) {
    if (this.heapSize >= this.heapC.length) {
        var len = this.heapC.length * 2;
        var nc = new Int32Array(len), nf = new Float64Array(len), nh = new Float64Array(len);
        nc.set(this.heapC);
        nf.set(this.heapF);
        nh.set(this.heapH);
        this.heapC = nc;
        this.heapF = nf;
        this.heapH = nh;
    }
    var i = this.heapSize++;
    this.heapC[i] = c;
    this.heapF[i] = f;
    this.heapH[i] = h;
    while (i > 0) {
        var p = (i - 1) >> 1;
        if (!this._less(i, p)) break;
        this._swap(i, p);
        i = p;
    }
};
// Removes the root; its values must be read before calling.
PathFinder.prototype._pop = function () {
    var last = --this.heapSize;
    if (last > 0) {
        this._swap(0, last);
        var i = 0;
        for (; ;) {
            var l = 2 * i + 1, r = l + 1, m = i;
            if (l < last && this._less(l, m)) m = l;
            if (r < last && this._less(r, m)) m = r;
            if (m === i) break;
            this._swap(i, m);
            i = m;
        }
    }
};

// ALT landmarks: every POI field f gives the lower bound |f[goal] - f[n]| <= cost(n, goal)
// (triangle inequality). Keeps the LANDMARKS fields that bound the start best.
PathFinder.prototype._pickLandmarks = function (startCell, goalCell) {
    var fields = this.grid.fields, K = this.opts.LANDMARKS, n = 0;
    var lf = this.lmField, lg = this.lmGoal, lb = this.lmBound;
    for (var i = 0; K > 0 && fields && i < fields.length; i++) {
        var f = fields[i], fg = f[goalCell], b = Math.abs(fg - f[startCell]);
        // NaN / Infinity: the POI lies in another component.
        if (!(b > 0 && b < Infinity) || (n === K && b <= lb[K - 1])) continue;
        var j = n < K ? n++ : K - 1;
        for (; j > 0 && lb[j - 1] < b; j--) {
            lf[j] = lf[j - 1];
            lg[j] = lg[j - 1];
            lb[j] = lb[j - 1];
        }
        lf[j] = f;
        lg[j] = fg;
        lb[j] = b;
    }
    return n;
};

/**
 * A* from startCell to goalCell. Returns null when either cell is blocked or they lie in
 * different components, else {cells, cost, partial, expansions}. The heuristic is the
 * larger of the octile distance and the landmark bound, so the path stays optimal. When
 * maxExpansions runs out the path to the closed node nearest the goal (smallest h) is
 * returned as partial.
 */
PathFinder.prototype.find = function (startCell, goalCell, maxExpansions) {
    var grid = this.grid, walk = grid.walk, comp = grid.comp, cost = grid.cost;
    if (startCell < 0 || goalCell < 0 || !walk[startCell] || !walk[goalCell]) return null;
    if (comp[startCell] !== comp[goalCell]) return null;
    var W = grid.W, H = grid.H, CELL = grid.CELL;
    if (maxExpansions == null) maxExpansions = this.opts.MAX_EXPANSIONS;
    if (++this.gen >= 0xFFFFFFFF) {
        this.openStamp.fill(0);
        this.closedStamp.fill(0);
        this.gen = 1;
    }
    var gen = this.gen, g = this.g, parent = this.parent, open = this.openStamp, closed = this.closedStamp;
    var gx = goalCell % W, gy = (goalCell - gx) / W;
    var stepLen = [CELL, CELL, CELL, CELL, CELL * SQRT2, CELL * SQRT2, CELL * SQRT2, CELL * SQRT2];
    var nl = this._pickLandmarks(startCell, goalCell), lf = this.lmField, lg = this.lmGoal;
    var heur = function (c) {
        var x = c % W, y = (c - x) / W;
        var dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        var h = CELL * ((dx + dy) + (SQRT2 - 2) * Math.min(dx, dy));
        for (var j = 0; j < nl; j++) {
            var b = (lg[j] - lf[j][c]) * LANDMARK_SCALE;
            if (b < 0) b = -b;
            if (b > h) h = b;
        }
        return h;
    };
    this.heapSize = 0;
    g[startCell] = 0;
    parent[startCell] = -1;
    open[startCell] = gen;
    var h0 = heur(startCell);
    this._push(startCell, h0, h0);
    var expansions = 0, best = startCell, bestH = h0, found = false;
    while (this.heapSize > 0) {
        var c = this.heapC[0], ch = this.heapH[0];
        this._pop();
        if (closed[c] === gen) continue;
        closed[c] = gen;
        if (c === goalCell) {
            found = true;
            break;
        }
        expansions++;
        if (ch < bestH) {
            bestH = ch;
            best = c;
        }
        if (expansions >= maxExpansions) break;
        var x = c % W, y = (c - x) / W, gc = g[c], cc = cost[c];
        for (var k = 0; k < 8; k++) {
            var nx = x + NDX[k], ny = y + NDY[k];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            var n = ny * W + nx;
            if (!walk[n] || closed[n] === gen) continue;
            if (k >= 4 && (!walk[y * W + nx] || !walk[ny * W + x])) continue;
            var ng = gc + stepLen[k] * (cc + cost[n]) * 0.5;
            if (open[n] !== gen || ng < g[n]) {
                open[n] = gen;
                g[n] = ng;
                parent[n] = c;
                var hn = heur(n);
                this._push(n, ng + hn, hn);
            }
        }
    }
    var end = found ? goalCell : (expansions >= maxExpansions ? best : -1);
    if (end < 0) return null;
    var cells = [];
    for (var p = end; p !== -1; p = parent[p]) cells.push(p);
    cells.reverse();
    return {cells: cells, cost: g[end], partial: !found, expansions: expansions};
};

/**
 * Greedy string-pulling over the cell centres (first point replaced by the start, last by
 * the goal). Returns the waypoints after the start; the last one is the exact goal.
 */
PathFinder.prototype.smooth = function (cells, sx, sy, gx, gy) {
    var grid = this.grid, n = cells.length;
    if (!n) return [];
    var px = new Float64Array(n), py = new Float64Array(n), cl = new Float64Array(n);
    for (var i = 0; i < n; i++) {
        px[i] = grid.cx(cells[i]);
        py[i] = grid.cy(cells[i]);
    }
    px[0] = sx;
    py[0] = sy;
    px[n - 1] = gx;
    py[n - 1] = gy;
    if (n === 1) return [{x: gx, y: gy}];
    for (i = 0; i < n; i++) cl[i] = grid.clearanceAt(px[i], py[i]);
    var R_HARD = grid.R_HARD, R_SMOOTH = grid.opts.R_SMOOTH;
    var out = [], a = 0;
    while (a < n - 1) {
        var last = a + 1;
        for (var j = a + 1; j < n && j <= a + 64; j++) {
            var mc = Math.max(R_HARD, Math.min(R_SMOOTH, cl[a], cl[j]));
            if (!grid.walkLOS(px[a], py[a], px[j], py[j], mc)) break;
            last = j;
        }
        out.push({x: px[last], y: py[last]});
        a = last;
    }
    return out;
};

PathFinder.prototype.request = function (ownerId, sx, sy, gx, gy) {
    var grid = this.grid;
    var s = grid.nearestWalkable(grid.cellOf(sx, sy), this.opts.START_SNAP_CELLS);
    var goal = s >= 0 ? grid.nearestWalkable(grid.cellOf(gx, gy), grid.opts.SNAP_CELLS, grid.comp[s]) : -1;
    var ticket = {owner: ownerId, done: false, result: null, reason: null, start: s, goal: goal, sx: sx, sy: sy, gx: gx, gy: gy};
    if (s < 0 || goal < 0) {
        ticket.done = true;
        ticket.reason = 'unreachable';
        return ticket;
    }
    this.cancel(ownerId);
    this.queue.push(ticket);
    this.stats.queue = this.queue.length;
    return ticket;
};
PathFinder.prototype.cancel = function (ownerId) {
    for (var i = this.queue.length - 1; i >= 0; i--) {
        var t = this.queue[i];
        if (t.owner !== ownerId) continue;
        t.done = true;
        t.reason = 'cancelled';
        this.queue.splice(i, 1);
    }
    this.stats.queue = this.queue.length;
};
// Runs queued searches until `budget` expansions are used. A started search always
// completes, so one tick costs at most about budget + MAX_EXPANSIONS.
PathFinder.prototype.serve = function (budget) {
    var used = 0;
    while (this.queue.length && used < budget) {
        var t = this.queue.shift();
        var r = this.find(t.start, t.goal, this.opts.MAX_EXPANSIONS);
        this.stats.searches++;
        if (!r) {
            this.stats.failed++;
            t.result = null;
            t.reason = 'unreachable';
            used += 1;
        } else if (r.partial && r.cells.length < 2) {
            // Out of expansions without leaving the start cell (a dead end close to the
            // goal as the crow flies): asking again from here would burn the same search
            // every tick, so report it as a failure.
            this.stats.expansions += r.expansions;
            this.stats.partial++;
            this.stats.failed++;
            t.result = null;
            t.reason = 'noprogress';
            used += Math.max(1, r.expansions);
        } else {
            this.stats.expansions += r.expansions;
            if (r.partial) this.stats.partial++;
            var last = r.cells[r.cells.length - 1];
            var ex = r.partial ? this.grid.cx(last) : t.gx, ey = r.partial ? this.grid.cy(last) : t.gy;
            t.result = {
                waypoints: this.smooth(r.cells, t.sx, t.sy, ex, ey),
                partial: r.partial,
                cost: r.cost,
                expansions: r.expansions
            };
            used += Math.max(1, r.expansions);
        }
        t.done = true;
    }
    this.stats.queue = this.queue.length;
    return used;
};

module.exports = PathFinder;
