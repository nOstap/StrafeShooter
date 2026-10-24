// Per-bot movement: follows a goal (POI flow field, A* path to a point, or a live item),
// then applies separation, wall feelers, stuck recovery and jump validation.

var BotConfig = require('./BotConfig.js');

var MOVE = BotConfig.MOVE, NAV = BotConfig.NAV, PATH = BotConfig.PATH;
var DEG = Math.PI / 180;
var LOOK_INDICES = [12, 8, 5, 3, 1];

function Locomotion(bot) {
    this.bot = bot;
    this.rng = bot.rng;
    this.nav = bot.manager.nav;
    this.finder = bot.manager.finder;
    this.chain = new Int32Array(MOVE.FIELD_CHAIN);
    this.goal = null;
    this.reached = false;
    this.failed = null;
    this.ticket = null;
    this.dir = {x: 0, y: 0};
    this.goalDir = {x: 0, y: 0};
    this.out = {x: 0, y: 0, isWalking: false, jump: false};
    this.lastPos = {x: 0, y: 0, valid: false};
    this.cell = -1;
    this.navCell = -1;
    this.navX = 0;
    this.navY = 0;
    this.probeLimit = Infinity;
    this.goalStartTick = 0;
    this.estimatedLen = 0;
    this.reset();
}

// Drops the path, pending ticket and stuck state (the goal itself is kept).
Locomotion.prototype.reset = function () {
    this._clearPath();
    this.stuckLevel = 0;
    this.stuckTicks = 0;
    this.windowValid = false;
    this.windowX = 0;
    this.windowY = 0;
    this.windowPath = 0;
    this.goodWindows = 0;
    this.recover = null;
    this.ladderJump = false;
    this.lastSide = 1;
    this.lastPos.valid = false;
};
Locomotion.prototype._clearPath = function () {
    if (this.ticket && !this.ticket.done) this.finder.cancel(this.bot.id);
    this.ticket = null;
    this.waypoints = null;
    this.wpIndex = 0;
    this.pathPartial = false;
    this.pathStartX = 0;
    this.pathStartY = 0;
    this.pathTick = 0;
    this.replan = false;
    this.fieldTarget = null;
    this.fieldPoi = -1;
};

// Where the bot stands on the grid. When it was pushed into an inflated cell the nearest
// walkable cell centre stands in for it in line-of-sight queries.
Locomotion.prototype.updateNav = function () {
    var nav = this.nav, pos = this.bot.pos;
    var c = this.cell = nav.cellOf(pos.x, pos.y);
    if (c >= 0 && nav.walk[c]) {
        this.navCell = c;
        this.navX = pos.x;
        this.navY = pos.y;
        return;
    }
    var nc = c >= 0 ? nav.nearestWalkable(c, 2) : -1;
    if (nc < 0 && c >= 0) nc = nav.nearestWalkable(c, NAV.SNAP_CELLS);
    this.navCell = nc;
    this.navX = nc >= 0 ? nav.cx(nc) : pos.x;
    this.navY = nc >= 0 ? nav.cy(nc) : pos.y;
};
Locomotion.prototype._los = function (x, y) {
    return this.navCell >= 0 && this.nav.walkLOS(this.navX, this.navY, x, y);
};
Locomotion.prototype._snapPoint = function (x, y) {
    var nav = this.nav, c = nav.cellOf(x, y);
    if (c >= 0 && nav.walk[c]) return {x: x, y: y};
    var nc = c >= 0 ? nav.nearestWalkable(c, NAV.SNAP_CELLS) : -1;
    return nc >= 0 ? {x: nav.cx(nc), y: nav.cy(nc)} : {x: x, y: y};
};
Locomotion.prototype._estimate = function (goal) {
    var nav = this.nav, pos = this.bot.pos, gx, gy;
    if (goal.kind === 'poi' || (goal.kind === 'item' && goal.poi >= 0)) {
        var v = nav.fieldValue(goal.poi, this.navCell);
        if (isFinite(v)) return v;
        gx = nav.pois[goal.poi].x;
        gy = nav.pois[goal.poi].y;
    } else {
        gx = goal.x;
        gy = goal.y;
    }
    return 1.4 * Math.sqrt((gx - pos.x) * (gx - pos.x) + (gy - pos.y) * (gy - pos.y));
};

/**
 * goal: null | {kind: 'poi', poi} | {kind: 'point', x, y, moving} | {kind: 'item', id, poi, x, y}.
 * Re-setting the current goal is a no-op; for a point goal only the coordinates change.
 */
Locomotion.prototype.setGoal = function (goal) {
    var cur = this.goal, tick = this.bot.tick;
    if (!goal) {
        if (cur) this._clearPath();
        this.goal = null;
        this.reached = false;
        this.failed = null;
        return;
    }
    if (cur && cur.kind === goal.kind) {
        if (goal.kind === 'poi' && cur.poi === goal.poi) return;
        if (goal.kind === 'item' && cur.id === goal.id) return;
        if (goal.kind === 'point') {
            var s = this._snapPoint(goal.x, goal.y);
            cur.x = s.x;
            cur.y = s.y;
            cur.moving = !!goal.moving;
            if (cur.moving) {
                this.goalStartTick = tick;
                this.estimatedLen = this._estimate(cur);
            }
            return;
        }
    }
    var g = {kind: goal.kind, poi: goal.poi != null ? goal.poi : -1, id: goal.id || null, x: goal.x, y: goal.y, moving: !!goal.moving};
    if (g.kind === 'point') {
        var sp = this._snapPoint(g.x, g.y);
        g.x = sp.x;
        g.y = sp.y;
    }
    this.goal = g;
    this._clearPath();
    this.reached = false;
    this.failed = null;
    this.stuckLevel = 0;
    this.stuckTicks = 0;
    this.windowValid = false;
    this.goodWindows = 0;
    this.recover = null;
    this.goalStartTick = tick;
    this.estimatedLen = this._estimate(g);
};

// Unit-ish direction toward the current goal; shorter than 1 only on the final approach.
Locomotion.prototype.goalDirection = function (ctx) {
    var bot = this.bot, pos = bot.pos, nav = this.nav, d = this.dir;
    if (this.lastPos.valid) {
        var jx = pos.x - this.lastPos.x, jy = pos.y - this.lastPos.y;
        if (jx * jx + jy * jy > MOVE.TELEPORT * MOVE.TELEPORT) this.reset();
    }
    d.x = 0;
    d.y = 0;
    this.goalDir.x = 0;
    this.goalDir.y = 0;
    this.probeLimit = Infinity;
    this.reached = false;
    var g = this.goal;
    if (!g || this.failed) return d;
    if (ctx.tick - this.goalStartTick > 2 * this.estimatedLen / MOVE.STEP + 90) {
        this.failed = 'timeout';
        return d;
    }
    var dx, dy;
    if (g.kind === 'poi') {
        var poi = nav.pois[g.poi];
        dx = poi.x - pos.x;
        dy = poi.y - pos.y;
        if (dx * dx + dy * dy < MOVE.POI_REACHED * MOVE.POI_REACHED) this.reached = true;
        this._followField(g.poi, ctx, d);
    } else if (g.kind === 'point') {
        dx = g.x - pos.x;
        dy = g.y - pos.y;
        if (dx * dx + dy * dy < MOVE.POINT_REACHED * MOVE.POINT_REACHED) this.reached = true;
        this._followPoint(g.x, g.y, g.moving, ctx, d);
    } else if (g.kind === 'item') {
        var it = ctx.itemById[g.id];
        if (!it) {
            this.failed = 'gone';
            return d;
        }
        g.x = it.x;
        g.y = it.y;
        dx = it.x - pos.x;
        dy = it.y - pos.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOVE.POINT_REACHED) this.reached = true;
        var usePoi = false;
        if (g.poi >= 0 && (dist > MOVE.ITEM_DIRECT || !this._los(it.x, it.y))) {
            var p = nav.pois[g.poi], px = p.x - pos.x, py = p.y - pos.y;
            usePoi = px * px + py * py > MOVE.POI_REACHED * MOVE.POI_REACHED;
        }
        if (usePoi) this._followField(g.poi, ctx, d);
        else this._followPoint(it.x, it.y, true, ctx, d);
    }
    this.goalDir.x = d.x;
    this.goalDir.y = d.y;
    return d;
};
function setDir(d, dx, dy, len) {
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) {
        d.x = 0;
        d.y = 0;
        return 0;
    }
    d.x = dx / l * len;
    d.y = dy / l * len;
    return l;
}

Locomotion.prototype._followField = function (i, ctx, d) {
    var nav = this.nav, pos = this.bot.pos, c = this.navCell;
    if (c < 0) {
        this.failed = 'unreachable';
        return;
    }
    if (c !== this.cell) {
        // Pushed into an inflated cell: get back onto the walkable grid first.
        setDir(d, nav.cx(c) - pos.x, nav.cy(c) - pos.y, 1);
        return;
    }
    if (!isFinite(nav.fieldValue(i, c))) {
        this.failed = 'unreachable';
        return;
    }
    var ft = this.fieldTarget;
    var stale = !ft || this.fieldPoi !== i || (ctx.tick + this.bot.index) % MOVE.FIELD_EVERY === 0;
    if (!stale) {
        var fx = ft.x - pos.x, fy = ft.y - pos.y;
        stale = fx * fx + fy * fy < 0.09;
    }
    if (stale) {
        var n = nav.descend(i, c, MOVE.FIELD_CHAIN, this.chain);
        var poi = nav.pois[i], tx = poi.x, ty = poi.y, found = false;
        // A field only has a local minimum at its source, so a short chain ended at the POI.
        if (n < MOVE.FIELD_CHAIN && this._los(poi.x, poi.y)) found = true;
        for (var k = 0; !found && k < LOOK_INDICES.length; k++) {
            var idx = Math.min(LOOK_INDICES[k], n);
            if (idx < 1) break;
            var cc = this.chain[idx - 1];
            if (this._los(nav.cx(cc), nav.cy(cc))) {
                tx = nav.cx(cc);
                ty = nav.cy(cc);
                found = true;
            }
        }
        if (!found && n > 0) {
            tx = nav.cx(this.chain[0]);
            ty = nav.cy(this.chain[0]);
        }
        this.fieldTarget = {x: tx, y: ty};
        this.fieldPoi = i;
        ft = this.fieldTarget;
    }
    this.probeLimit = setDir(d, ft.x - pos.x, ft.y - pos.y, 1);
};

Locomotion.prototype._request = function (gx, gy) {
    var pos = this.bot.pos;
    this.ticket = this.finder.request(this.bot.id, pos.x, pos.y, gx, gy);
    this.replan = false;
};

Locomotion.prototype._followPoint = function (gx, gy, moving, ctx, d) {
    var nav = this.nav, pos = this.bot.pos, tick = ctx.tick;
    var dg = Math.sqrt((gx - pos.x) * (gx - pos.x) + (gy - pos.y) * (gy - pos.y));
    if (this._los(gx, gy)) {
        if (this.waypoints || this.ticket) this._clearPath();
        this.probeLimit = setDir(d, gx - pos.x, gy - pos.y, Math.min(1, dg / MOVE.STEP));
        return;
    }
    if (this.ticket && this.ticket.done) {
        var t = this.ticket;
        this.ticket = null;
        if (!t.result) {
            if (t.reason !== 'cancelled') {
                this.failed = 'unreachable';
                this.bot.addTrace('pathfail', t.reason, Math.round(gx * 10) / 10 + ',' + Math.round(gy * 10) / 10);
                return;
            }
        } else {
            this.waypoints = t.result.waypoints;
            this.wpIndex = 0;
            this.pathPartial = t.result.partial;
            this.pathStartX = t.sx;
            this.pathStartY = t.sy;
            this.pathTick = tick;
        }
    }
    var wps = this.waypoints;
    if (wps && !this.ticket) {
        var need = this.replan;
        var end = wps[wps.length - 1];
        if (!this.pathPartial && (end.x - gx) * (end.x - gx) + (end.y - gy) * (end.y - gy) > PATH.GOAL_MOVED * PATH.GOAL_MOVED) {
            var prevX = wps.length > 1 ? wps[wps.length - 2].x : this.pathStartX;
            var prevY = wps.length > 1 ? wps[wps.length - 2].y : this.pathStartY;
            if (nav.walkLOS(prevX, prevY, gx, gy)) {
                end.x = gx;
                end.y = gy;
            } else need = true;
        }
        if (moving && tick - this.pathTick >= PATH.REPLAN_TICKS) need = true;
        if (need) this._request(gx, gy);
    }
    if (!wps) {
        if (!this.ticket) this._request(gx, gy);
        setDir(d, gx - pos.x, gy - pos.y, 1);
        return;
    }
    var n = wps.length, i = this.wpIndex;
    while (i < n) {
        var wp = wps[i];
        var wx = wp.x - pos.x, wy = wp.y - pos.y;
        if (wx * wx + wy * wy < MOVE.WAYPOINT_RADIUS * MOVE.WAYPOINT_RADIUS) {
            i++;
            continue;
        }
        var ax = i > 0 ? wps[i - 1].x : this.pathStartX, ay = i > 0 ? wps[i - 1].y : this.pathStartY;
        var sx = wp.x - ax, sy = wp.y - ay, sl = sx * sx + sy * sy;
        if (sl > 1e-9 && ((pos.x - ax) * sx + (pos.y - ay) * sy) / sl > 1) {
            i++;
            continue;
        }
        break;
    }
    if ((tick + this.bot.index) % MOVE.LOOKAHEAD_EVERY === 0)
        while (i + 1 < n && this._los(wps[i + 1].x, wps[i + 1].y)) i++;
    this.wpIndex = i;
    if (i >= n) {
        // End of the path without sight of the goal (partial path, or the goal moved).
        this.waypoints = null;
        if (!this.ticket) this._request(gx, gy);
        setDir(d, gx - pos.x, gy - pos.y, 1);
        return;
    }
    var w = wps[i], last = i === n - 1 && !this.pathPartial;
    var dw = Math.sqrt((w.x - pos.x) * (w.x - pos.x) + (w.y - pos.y) * (w.y - pos.y));
    this.probeLimit = setDir(d, w.x - pos.x, w.y - pos.y, last ? Math.min(1, dw / MOVE.STEP) : 1);
};

Locomotion.prototype.canJump = function (dx, dy) {
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6 || this.bot.player.isInAir) return false;
    var pos = this.bot.pos;
    return this.nav.walkLOS(pos.x, pos.y, pos.x + dx / len * MOVE.JUMP_CLEAR, pos.y + dy / len * MOVE.JUMP_CLEAR);
};

Locomotion.prototype._blocked = function (ux, uy, limit) {
    var nav = this.nav, pos = this.bot.pos, f = MOVE.FEELERS;
    for (var i = 0; i < f.length; i++) {
        // Probes past an already line-of-sight-checked steering target would only see the
        // wall behind the corner we are about to turn at.
        if (f[i] > limit + 0.25) continue;
        if (!nav.isWalkable(pos.x + ux * f[i], pos.y + uy * f[i])) return true;
    }
    return false;
};

Locomotion.prototype._ladder = function (ctx, wx, wy) {
    var nav = this.nav, tick = ctx.tick, pos = this.bot.pos, level = this.stuckLevel;
    var len = Math.sqrt(wx * wx + wy * wy), ux, uy;
    if (len > 1e-6) {
        ux = wx / len;
        uy = wy / len;
    } else {
        var a = this.rng.range(0, 2 * Math.PI);
        ux = Math.cos(a);
        uy = Math.sin(a);
    }
    if (level === 1) {
        if (this.cell < 0 || !this.nav.walk[this.cell]) {
            var nc = nav.nearestWalkable(this.cell, NAV.SNAP_CELLS);
            if (nc >= 0) this.recover = {mode: 'point', x: nav.cx(nc), y: nav.cy(nc), untilTick: tick + 10};
        }
        if (this.ticket && !this.ticket.done) this.finder.cancel(this.bot.id);
        this.ticket = null;
        this.waypoints = null;
        this.fieldTarget = null;
        this.replan = true;
    } else if (level === 2) {
        var side = this.rng.chance(0.5) ? 1 : -1;
        this.lastSide = side;
        this.recover = {mode: 'dir', x: -uy * side, y: ux * side, untilTick: tick + MOVE.SIDESTEP_TICKS};
    } else if (level === 3) {
        if (this.canJump(ux, uy)) {
            this.ladderJump = true;
            this.recover = {mode: 'dir', x: ux, y: uy, untilTick: tick + 2};
        } else {
            var other = -this.lastSide;
            this.recover = {mode: 'dir', x: -uy * other, y: ux * other, untilTick: tick + MOVE.SIDESTEP_TICKS};
        }
    } else {
        this.failed = 'stuck';
        this.bot.addTrace('stuck', Math.round(pos.x * 100) / 100 + ',' + Math.round(pos.y * 100) / 100, this.cell);
        this.stuckLevel = 0;
        this.recover = null;
    }
};

/**
 * Turns a desired direction into the movement part of an input: separation from other
 * players, wall feelers, stuck recovery and teleport detection.
 */
Locomotion.prototype.finish = function (ctx, dir, preferredSide) {
    var bot = this.bot, pos = bot.pos, tick = ctx.tick, out = this.out;
    var x = dir.x, y = dir.y, len, i;
    var jump = false;
    if (this.recover) {
        if (tick < this.recover.untilTick) {
            if (this.recover.mode === 'point') {
                var rx = this.recover.x - pos.x, ry = this.recover.y - pos.y, rl = Math.sqrt(rx * rx + ry * ry);
                if (rl < 0.1) this.recover = null;
                else {
                    x = rx / rl;
                    y = ry / rl;
                }
            } else {
                x = this.recover.x;
                y = this.recover.y;
            }
        } else this.recover = null;
    }
    if (this.ladderJump) {
        this.ladderJump = false;
        jump = this.canJump(x, y);
    }
    len = Math.sqrt(x * x + y * y);

    var sx = 0, sy = 0, R = MOVE.SEPARATION_RADIUS;
    for (i = 0; i < ctx.players.length; i++) {
        var e = ctx.players[i];
        if (e.id === bot.id || !e.alive) continue;
        var ex = pos.x - e.x, ey = pos.y - e.y, ed = Math.sqrt(ex * ex + ey * ey);
        if (ed >= R || ed < 1e-6) continue;
        var k = MOVE.SEPARATION_WEIGHT * (1 - ed / R) / ed;
        sx += ex * k;
        sy += ey * k;
    }
    if (sx !== 0 || sy !== 0) {
        var want = len > 0.001 ? Math.min(1, len) : Math.min(1, Math.sqrt(sx * sx + sy * sy));
        x += sx;
        y += sy;
        var nl = Math.sqrt(x * x + y * y);
        if (nl > 1e-6) {
            x = x / nl * want;
            y = y / nl * want;
        }
        len = Math.sqrt(x * x + y * y);
    }
    var wantWalk = len > 0.001, wantX = x, wantY = y;

    if (wantWalk && !jump) {
        var ux = x / len, uy = y / len, limit = Infinity;
        var gl = Math.sqrt(this.goalDir.x * this.goalDir.x + this.goalDir.y * this.goalDir.y);
        if (!this.recover && gl > 1e-6 && (ux * this.goalDir.x + uy * this.goalDir.y) / gl > 0.995) limit = this.probeLimit;
        if (this._blocked(ux, uy, limit)) {
            var side = preferredSide < 0 ? -1 : 1, found = false, angles = MOVE.FEELER_ANGLES_DEG;
            for (i = 0; i < angles.length && !found; i++) {
                for (var s = 0; s < 2 && !found; s++) {
                    var a = angles[i] * DEG * (s === 0 ? side : -side), c = Math.cos(a), sn = Math.sin(a);
                    var vx = ux * c - uy * sn, vy = ux * sn + uy * c;
                    if (!this._blocked(vx, vy, Infinity)) {
                        x = vx * len;
                        y = vy * len;
                        found = true;
                    }
                }
            }
            if (!found) {
                x = 0;
                y = 0;
            }
        }
    }

    // Stuck monitor: only ticks where we wanted to walk on the ground count. With a goal we
    // need net progress; without one (combat strafing) any movement at all will do.
    if (wantWalk && !bot.player.isInAir) {
        if (!this.windowValid) {
            this.windowValid = true;
            this.windowX = pos.x;
            this.windowY = pos.y;
            this.windowPath = 0;
            this.stuckTicks = 0;
        }
        if (this.lastPos.valid) {
            var px = pos.x - this.lastPos.x, py = pos.y - this.lastPos.y;
            this.windowPath += Math.sqrt(px * px + py * py);
        }
        if (++this.stuckTicks >= MOVE.STUCK_WINDOW) {
            var moved = this.goal ? Math.sqrt((pos.x - this.windowX) * (pos.x - this.windowX) +
                (pos.y - this.windowY) * (pos.y - this.windowY)) : this.windowPath;
            if (moved < MOVE.STUCK_MIN_MOVE) {
                this.stuckLevel++;
                this.goodWindows = 0;
                this._ladder(ctx, wantX, wantY);
            } else if (this.stuckLevel > 0 && ++this.goodWindows >= MOVE.STUCK_RESET_WINDOWS) {
                this.stuckLevel = 0;
                this.goodWindows = 0;
            }
            this.windowValid = false;
        }
    }

    out.x = x;
    out.y = y;
    out.isWalking = Math.sqrt(x * x + y * y) > 0.001;
    out.jump = jump && out.isWalking;
    this.lastPos.x = pos.x;
    this.lastPos.y = pos.y;
    this.lastPos.valid = true;
    return out;
};

module.exports = Locomotion;
