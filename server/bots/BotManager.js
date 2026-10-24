// Server-side bots: plain Player entities fed through game.queueInput, exactly like a
// client's inputs. Owns the shared navigation data, the roster/ready policy and the
// per-tick context every bot reads. Uses the engine globals created by server.js
// (CFG, MAPS, Player, srcore, ioGame).

var BotConfig = require('./BotConfig.js');
var Rng = require('./Rng.js');
var NavGrid = require('./NavGrid.js');
var PathFinder = require('./PathFinder.js');
var Ballistics = require('./Ballistics.js');
var Bot = require('./Bot.js');

var PERF_WINDOW = 300;
var THREAT_CLASSES = {RocketBullet: true, LightBullet: true, Arrow: true};

function log(line) {
    process.stdout.write(line + '\n');
}

function BotManager(game, opts) {
    this.game = game;
    this.opts = opts;
    this.bots = [];
    this.botsById = {};
    this.serial = 0;
    this.nav = null;
    this.finder = null;
    this.ballistics = null;
    this.lastHit = {};
    this.history = {};
    this.itemCache = {};
    this.staticPrefix = -1;
    this.staticLast = null;
    this.wasDuringMatch = !!game.during_match;
    this.matchEndedTick = -Infinity;
    this.botsOnlyTicks = 0;
    this.anyDodge = false;
    this.stats = {errors: 0};
    this.perfUs = new Float64Array(PERF_WINDOW);
    this.perfActive = new Int32Array(PERF_WINDOW);
    this.perfIndex = 0;
    this.lastActive = 0;
    this.activeTicks = 0;
    var self = this;
    this.ctx = {
        tick: 0, duringMatch: false, players: [], byId: {}, pending: {}, items: [], itemById: {},
        threats: null, lastHit: this.lastHit, nav: null, finder: null, ballistics: null, weapons: null,
        observe: function (id, delay) {
            return self.observe(id, delay);
        }
    };
}

BotManager.parseEnv = function (env, maxPlayers) {
    return BotConfig.parseEnv(env, maxPlayers);
};

BotManager.prototype.init = function () {
    var game = this.game, self = this;
    var mapName = MAPS[game.map_index];
    this.nav = NavGrid.forMap(mapName, game.map, BotConfig.NAV);
    this.finder = new PathFinder(this.nav, BotConfig.PATH);
    this.ballistics = Ballistics.build();
    if (this.opts.seed !== null) srcore.setSeed(this.opts.seed);
    this.anyDodge = this.opts.difficulties.some(function (name) {
        return BotConfig.PRESETS[name].dodgeChance > 0;
    });
    var ctx = this.ctx;
    ctx.nav = this.nav;
    ctx.finder = this.finder;
    ctx.ballistics = this.ballistics;
    ctx.weapons = CFG.WEAPONS;

    // Only this game instance is wrapped: the attacker of every hit feeds the bots' memory.
    var orig = game.dealDamage;
    game.dealDamage = function (entID, damage, attackerID) {
        self.onDamage(entID, damage, attackerID);
        return orig.apply(this, arguments);
    };

    var nav = this.nav;
    log('[bots] nav ' + mapName + ' ' + nav.W + 'x' + nav.H + ' walkable=' + nav.walkableCount + ' comps=' +
        nav.compSize.length + ' pois=' + nav.pois.length + ' bake=' + nav.bakeMs.toFixed(1) + 'ms fields=' +
        nav.fieldsMs.toFixed(1) + 'ms');
    nav.warnings.forEach(function (w) {
        log('[bots] nav warning: ' + w);
    });
    process.stdout.write(Ballistics.describe(this.ballistics));
    log('[bots] ' + this.opts.count + ' bot(s), difficulty ' + this.opts.difficulties.join('/') +
        (this.opts.autostart ? ', autostart' : '') + (this.opts.seed !== null ? ', seed ' + this.opts.seed : ''));
};

BotManager.prototype.onDamage = function (entID, damage, attackerID) {
    if (this.botsById[entID]) this.lastHit[entID] = {attacker: attackerID, tick: this.game.tick};
};

BotManager.prototype.addBot = function () {
    var game = this.game;
    var serial = ++this.serial;
    var id = 'bot_' + serial;
    var difficulties = this.opts.difficulties;
    var preset = difficulties[(serial - 1) % difficulties.length];
    var p = new Player({
        id: id,
        displayName: '[BOT] ' + BotConfig.NAMES[(serial - 1) % BotConfig.NAMES.length],
        head: (serial - 1) % 3,
        body: (serial - 1) % 2,
        skin: (serial - 1) % CFG.CHARACTERS.length
    });
    game.addSpectator(p);
    // Clients ignore player_joined_match for ids they have no spectator for.
    ioGame.emit('player_joined_game', p._simply());
    var seed = this.opts.seed !== null ? this.opts.seed : CFG.SEED;
    var bot = new Bot(this, p, serial, preset, new Rng(Rng.hash(seed, serial)));
    this.bots.push(bot);
    this.botsById[id] = bot;
    log('[bots] added ' + id + ' "' + p.displayName + '" (' + preset + ')');
    return bot;
};

BotManager.prototype.removeBot = function (bot) {
    var game = this.game, id = bot.id, p = bot.player;
    this.finder.cancel(id);
    if (p.physBody) p.kill();
    game.removePlayer(id);
    ioGame.emit('player_leaved', id);
    this.bots.splice(this.bots.indexOf(bot), 1);
    delete this.botsById[id];
    delete this.lastHit[id];
    delete this.history[id];
    log('[bots] removed ' + id);
};

// Fill / ready policy, run every tick before the bots act.
BotManager.prototype.roster = function () {
    var game = this.game, opts = this.opts, R = BotConfig.ROSTER, id, i;
    var during = !!game.during_match;
    if (this.wasDuringMatch && !during) this.matchEndedTick = game.tick;
    this.wasDuringMatch = during;

    var humansTotal = 0, humansInMatch = 0;
    for (id in game.players) {
        if (this.botsById[id]) continue;
        humansTotal++;
        humansInMatch++;
    }
    for (id in game.spectators)
        if (!this.botsById[id] && !game.players[id]) humansTotal++;

    if (!during) {
        var maxP = Math.min(parseInt(game.max_players, 10) || CFG.MAX_PLAYERS, CFG.MAX_PLAYERS);
        var target = Math.min(opts.count, Math.max(0, maxP - humansTotal));
        while (this.bots.length < target) this.addBot();
        while (this.bots.length > target) this.removeBot(this.bots[this.bots.length - 1]);
    }

    var want = opts.autostart || humansInMatch > 0;
    // Once a human is in, join right away: this runs before game.update() checks readiness,
    // so a human's ready can never start the match without the bots. Autostart alone
    // pauses between matches instead.
    var join = humansInMatch > 0 || (want && game.tick - this.matchEndedTick >= R.REJOIN_DELAY_TICKS);
    for (i = 0; i < this.bots.length; i++) {
        var bot = this.bots[i], p = bot.player;
        id = bot.id;
        if (!game.players[id] && join && game.spectators[id] === p) {
            game.joinMatch(id);
            bot.addTrace('join', game.during_match ? 'running' : 'lobby');
        }
        if (game.players[id] && !game.during_match && p.isReady !== want) game.toggleReady(id);
    }

    if (during && !opts.autostart) {
        if (humansInMatch === 0) {
            if (++this.botsOnlyTicks > R.BOTS_ONLY_GRACE_TICKS) {
                this.botsOnlyTicks = 0;
                log('[bots] no human left in the match, ending it');
                game.endMatch();
            }
        } else this.botsOnlyTicks = 0;
    } else this.botsOnlyTicks = 0;
};

BotManager.prototype.record = function (id, x, y) {
    var H = BotConfig.COMBAT.HISTORY, h = this.history[id];
    if (!h) h = this.history[id] = {xs: new Float64Array(H), ys: new Float64Array(H), head: -1, count: 0, tick: 0};
    h.head = (h.head + 1) % H;
    h.xs[h.head] = x;
    h.ys[h.head] = y;
    if (h.count < H) h.count++;
    h.tick = this.game.tick;
};

// Position `delay` ticks ago, with the velocity (m/tick) over the 3 ticks before that.
BotManager.prototype.observe = function (id, delay) {
    var h = this.history[id], H = BotConfig.COMBAT.HISTORY;
    if (!h || !h.count) {
        var e = this.ctx.byId[id];
        return {x: e ? e.x : 0, y: e ? e.y : 0, vx: 0, vy: 0};
    }
    var d0 = Math.min(delay, h.count - 1), d1 = Math.min(d0 + 3, h.count - 1);
    var i0 = (h.head - d0 + H) % H;
    var res = {x: h.xs[i0], y: h.ys[i0], vx: 0, vy: 0};
    if (d1 > d0) {
        for (var k = d0; k < d1; k++) {
            var a = (h.head - k + H) % H, b = (h.head - k - 1 + H) % H;
            var jx = h.xs[a] - h.xs[b], jy = h.ys[a] - h.ys[b];
            if (jx * jx + jy * jy > 4) return res;
        }
        var i1 = (h.head - d1 + H) % H, span = d1 - d0;
        res.vx = (h.xs[i0] - h.xs[i1]) / span;
        res.vy = (h.ys[i0] - h.ys[i1]) / span;
    }
    return res;
};

BotManager.prototype.buildContext = function () {
    var game = this.game, ctx = this.ctx, id, i;
    ctx.tick = game.tick;
    ctx.duringMatch = !!game.during_match;
    var players = ctx.players, byId = ctx.byId = {};
    players.length = 0;
    for (id in game.players) {
        var p = game.players[id];
        if (!p.physBody) continue;
        var pos = p.physBody.GetPosition();
        var e = {
            id: id, p: p, x: pos.x, y: pos.y, alive: p.health > 0 && !p.isDead, inAir: !!p.isInAir,
            firing: !!(p.input && p.input.fire), hp: p.health, maxHp: p.maxHealth, team: p.team || null
        };
        players.push(e);
        byId[id] = e;
        this.record(id, pos.x, pos.y);
    }
    var pending = ctx.pending = {};
    for (i = 0; i < game._spawnDefer.length; i++) pending[game._spawnDefer[i].entityID] = true;
    var items = ctx.items, itemById = ctx.itemById = {}, nav = this.nav, cache = this.itemCache, seen = {};
    items.length = 0;
    for (id in game.collectables) {
        var it = game.collectables[id];
        if (it._spawned !== true || !it.physBody || it._markToKill) continue;
        var ip = it.physBody.GetPosition();
        // The spawn point and component of an item only change when it gets pushed around.
        var c = cache[id];
        if (!c || Math.abs(c.x - ip.x) + Math.abs(c.y - ip.y) > 0.25) {
            var cell = nav.cellOf(ip.x, ip.y);
            var wc = cell >= 0 ? (nav.walk[cell] ? cell : nav.nearestWalkable(cell, 2)) : -1;
            c = cache[id] = {
                x: ip.x, y: ip.y, comp: wc >= 0 ? nav.comp[wc] : -1,
                poi: nav.nearestPoi(ip.x, ip.y, it.class, BotConfig.MOVE.ITEM_POI_RADIUS)
            };
        }
        seen[id] = true;
        var item = {id: id, kind: it.class, weapon: it.weapon || null, x: ip.x, y: ip.y, poi: c.poi, comp: c.comp};
        items.push(item);
        itemById[id] = item;
    }
    for (id in cache)
        if (!seen[id]) delete cache[id];
    if (this.anyDodge) {
        var threats = ctx.threats = [], ents = game.entities;
        // Map obstacles are added first and never move: skip that static prefix.
        var start = this.staticPrefix;
        if (start < 0 || start > ents.length || (start > 0 && ents[start - 1] !== this.staticLast)) {
            for (start = 0; start < ents.length && ents[start].class === 'Obstacle'; start++);
            this.staticPrefix = start;
            this.staticLast = start > 0 ? ents[start - 1] : null;
        }
        for (i = start; i < ents.length; i++) {
            var b = ents[i];
            if (!b.physBody || !THREAT_CLASSES[b.class] || !b.weapon || !b.weapon.player) continue;
            var bp = b.physBody.GetPosition(), bv = b.physBody.GetLinearVelocity();
            threats.push({
                id: b.id, owner: b.weapon.player.id, x: bp.x, y: bp.y,
                v: {x: bv.x * CFG.PHYSICS_HZ, y: bv.y * CFG.PHYSICS_HZ}
            });
        }
    } else ctx.threats = null;
    if (game.tick % PERF_WINDOW === 0) this.cleanup();
    return ctx;
};

BotManager.prototype.cleanup = function () {
    var game = this.game, id;
    for (id in this.history)
        if (!game.players[id]) delete this.history[id];
    for (id in this.lastHit)
        if (game.tick - this.lastHit[id].tick > PERF_WINDOW) delete this.lastHit[id];
};

BotManager.prototype.update = function () {
    var game = this.game, t0 = process.hrtime.bigint(), active = 0, i, bot;
    try {
        this.roster();
        var ctx = this.buildContext();
        for (i = 0; i < this.bots.length; i++) {
            bot = this.bots[i];
            if (game.players[bot.id] !== bot.player) continue;
            var input;
            try {
                input = bot.update(ctx);
            } catch (e) {
                if (!bot.errored) {
                    bot.errored = true;
                    log('[bots] BOT_ERROR ' + bot.id + ' ' + (e && e.stack || e));
                }
                this.stats.errors++;
                input = bot.idleInput();
            }
            if (bot.wasActive) active++;
            input.seq = ++bot.seq;
            game.queueInput(bot.id, input);
        }
        this.finder.serve(BotConfig.PATH.BUDGET_PER_TICK);
    } catch (err) {
        if (!this.managerErrored) {
            this.managerErrored = true;
            log('[bots] BOT_ERROR manager ' + (err && err.stack || err));
        }
        this.stats.errors++;
        // Make sure no bot repeats a stale input (processInputs re-applies the last one,
        // fire included, when a player's queue is empty).
        for (i = 0; i < this.bots.length; i++) {
            bot = this.bots[i];
            var p = game.players[bot.id];
            if (!p || p !== bot.player || p.inputQueue.length) continue;
            var idle = bot.idleInput();
            idle.seq = ++bot.seq;
            game.queueInput(bot.id, idle);
        }
    }
    var us = Number(process.hrtime.bigint() - t0) / 1000;
    this.perfUs[this.perfIndex] = us;
    this.perfActive[this.perfIndex] = active;
    this.perfIndex = (this.perfIndex + 1) % PERF_WINDOW;
    this.lastActive = active;
    if (active > 0) this.activeTicks++;
    if (this.opts.debug && game.tick > 0 && game.tick % PERF_WINDOW === 0) {
        var perf = this.perf(), st = this.finder.stats;
        log('[bots] t=' + game.tick + ' active=' + active + ' avgUs=' + perf.avgUsPerBotTick + ' maxUs=' + perf.maxUsTick +
            ' astar=' + st.searches + '/' + st.expansions + ' q=' + st.queue + ' errors=' + this.stats.errors);
    }
};

// Average cost per active bot per tick over the last PERF_WINDOW ticks (shared work such
// as the roster, context and A* included) and the worst single tick.
BotManager.prototype.perf = function () {
    var sumUs = 0, sumActive = 0, maxUs = 0;
    for (var i = 0; i < PERF_WINDOW; i++) {
        if (this.perfUs[i] > maxUs) maxUs = this.perfUs[i];
        if (this.perfActive[i] > 0) {
            sumUs += this.perfUs[i];
            sumActive += this.perfActive[i];
        }
    }
    return {
        avgUsPerBotTick: sumActive ? Math.round(sumUs / sumActive * 10) / 10 : 0,
        maxUsTick: Math.round(maxUs * 10) / 10
    };
};

BotManager.prototype.debugState = function () {
    var game = this.game, st = this.finder.stats, perf = this.perf(), ctx = this.ctx;
    return {
        tick: game.tick,
        duringMatch: !!game.during_match,
        stats: {
            bots: this.bots.length,
            active: this.lastActive,
            activeTicks: this.activeTicks,
            avgUsPerBotTick: perf.avgUsPerBotTick,
            maxUsTick: perf.maxUsTick,
            errors: this.stats.errors,
            astar: {searches: st.searches, expansions: st.expansions, partial: st.partial, failed: st.failed, queue: st.queue}
        },
        bots: this.bots.map(function (bot) {
            return bot.debugInfo(ctx);
        })
    };
};

module.exports = BotManager;
