#!/usr/bin/env node
// Bot smoke test.
//   Part A (static): bakes the nav grid + flow fields of every map and cross-checks A*
//                    against the Dijkstra fields.
//   Part B (live):   starts server/server.js with bots, joins as a human that never moves,
//                    and waits until the bots start a match, move and fire.
// Usage: node tools/botmatch.js [--static-only|--live-only] [--map N] [--bots N]
//                               [--difficulty NAME] [--autostart] [--timeout S]
// Exit code 0 = pass, 1 = failure.

var fs = require('fs');
var path = require('path');
var net = require('net');
var http = require('http');
var childProcess = require('child_process');

var ROOT = path.join(__dirname, '..');
var BotConfig = require(path.join(ROOT, 'server', 'bots', 'BotConfig.js'));
var NavGrid = require(path.join(ROOT, 'server', 'bots', 'NavGrid.js'));
var PathFinder = require(path.join(ROOT, 'server', 'bots', 'PathFinder.js'));
var Rng = require(path.join(ROOT, 'server', 'bots', 'Rng.js'));

var ERROR_RE = /BOT_ERROR|TypeError|ReferenceError|RangeError|SyntaxError|Uncaught|\n\s+at .+:\d+:\d+/;

function parseArgs(argv) {
    var a = {staticOnly: false, liveOnly: false, map: 1, bots: 3, difficulty: 'hard', autostart: false, timeout: 30};
    for (var i = 0; i < argv.length; i++) {
        var k = argv[i];
        if (k === '--static-only') a.staticOnly = true;
        else if (k === '--live-only') a.liveOnly = true;
        else if (k === '--autostart') a.autostart = true;
        else if (k === '--map') a.map = parseInt(argv[++i], 10);
        else if (k === '--bots') a.bots = parseInt(argv[++i], 10);
        else if (k === '--difficulty') a.difficulty = String(argv[++i]);
        else if (k === '--timeout') a.timeout = parseFloat(argv[++i]);
        else {
            console.error('Unknown argument ' + k);
            process.exit(1);
        }
    }
    if (!(a.map >= 0)) a.map = 1;
    if (!(a.bots >= 1)) a.bots = 1;
    if (!(a.timeout > 0)) a.timeout = 30;
    return a;
}
var args = parseArgs(process.argv.slice(2));

function pad(s, n, right) {
    s = String(s);
    while (s.length < n) s = right ? s + ' ' : ' ' + s;
    return s;
}
function table(head, rows) {
    var w = head.map(function (h, i) {
        return Math.max(String(h).length, Math.max.apply(null, rows.map(function (r) {
            return String(r[i]).length;
        }).concat([0])));
    });
    var line = function (r) {
        return r.map(function (c, i) {
            return pad(c, w[i], i === 0);
        }).join('  ');
    };
    console.log(line(head));
    console.log(w.map(function (n) {
        return new Array(n + 1).join('-');
    }).join('  '));
    rows.forEach(function (r) {
        console.log(line(r));
    });
}
function hrMs(t0) {
    var d = process.hrtime(t0);
    return d[0] * 1e3 + d[1] / 1e6;
}
function readMaps() {
    var src = fs.readFileSync(path.join(ROOT, 'public', 'shared', 'config.js'), 'utf8');
    var m = /MAPS = \[([^\]]*)\]/.exec(src);
    if (!m) throw new Error('MAPS not found in public/shared/config.js');
    return (m[1].match(/'([^']+)'/g) || []).map(function (s) {
        return s.slice(1, -1);
    });
}

// ---------------------------------------------------------------- Part A: static nav
function partA() {
    console.log('== Part A: static navigation ==');
    var maps = readMaps(), ok = true, rows = [];
    maps.forEach(function (name) {
        var errors = [];
        var json = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'assets', name + '.json'), 'utf8'));
        var t0 = process.hrtime();
        var grid = new NavGrid(json, BotConfig.NAV);
        var bakeMs = hrMs(t0);
        t0 = process.hrtime();
        grid.buildFields();
        var fieldsMs = hrMs(t0);
        var finder = new PathFinder(grid, BotConfig.PATH);
        var pois = grid.pois;
        pois.forEach(function (p) {
            if (p.cell === -1) errors.push(p.kind + ' POI #' + p.index + ' has no walkable cell');
            else if (p.comp !== grid.mainComp) errors.push(p.kind + ' POI #' + p.index + ' is outside the main component');
        });
        pois.forEach(function (p) {
            if (p.kind !== 'Player' || p.cell < 0) return;
            pois.forEach(function (q) {
                if (!isFinite(grid.fields[q.index][p.cell]))
                    errors.push('field ' + q.kind + '#' + q.index + ' not finite at spawn #' + p.index);
            });
        });
        var rng = new Rng(12345), exp = [], wps = [];
        for (var k = 0; k < 50 && pois.length; k++) {
            var a = pois[rng.int(0, pois.length - 1)], b = pois[rng.int(0, pois.length - 1)];
            if (a.cell < 0 || b.cell < 0) continue;
            var r = finder.find(a.cell, b.cell, Infinity);
            if (!r || r.partial) {
                errors.push('A* ' + a.index + '->' + b.index + (r ? ' partial' : ' failed'));
                continue;
            }
            var fv = grid.fields[b.index][a.cell];
            if (Math.abs(r.cost - fv) > 0.01 + 1e-4 * r.cost)
                errors.push('A* ' + a.index + '->' + b.index + ' cost ' + r.cost.toFixed(4) + ' != field ' + fv.toFixed(4));
            exp.push(r.expansions);
            var sx = grid.cx(a.cell), sy = grid.cy(a.cell);
            var w = finder.smooth(r.cells, sx, sy, grid.cx(b.cell), grid.cy(b.cell));
            wps.push(w.length);
            var px = sx, py = sy;
            for (var j = 0; j < w.length; j++) {
                if (!grid.walkLOS(px, py, w[j].x, w[j].y)) {
                    errors.push('smoothed segment ' + a.index + '->' + b.index + ' #' + j + ' fails walkLOS');
                    break;
                }
                px = w[j].x;
                py = w[j].y;
            }
        }
        var total = bakeMs + fieldsMs;
        if (name === 'frozen_lake') {
            if (total >= 400) errors.push('frozen_lake bake+fields ' + total.toFixed(0) + ' ms >= 400 ms');
            else if (total > 250) console.log('WARN frozen_lake bake+fields ' + total.toFixed(0) + ' ms > 250 ms');
        }
        grid.warnings.forEach(function (w) {
            console.log('note ' + name + ': ' + w);
        });
        var avg = function (arr) {
            return arr.length ? arr.reduce(function (s, v) {
                return s + v;
            }, 0) / arr.length : 0;
        };
        rows.push([name, grid.W + 'x' + grid.H, grid.walkableCount, grid.compSize.length, pois.length,
            bakeMs.toFixed(1), fieldsMs.toFixed(1), avg(exp).toFixed(0), Math.max.apply(null, exp.concat([0])),
            avg(wps).toFixed(1), errors.length ? 'FAIL' : 'ok']);
        if (errors.length) {
            ok = false;
            errors.slice(0, 20).forEach(function (e) {
                console.log('  ' + name + ': ' + e);
            });
        }
    });
    table(['map', 'grid', 'walkable', 'comps', 'pois', 'bake ms', 'fields ms', 'A* avg exp', 'A* max exp', 'avg wps', 'result'], rows);
    console.log('Part A ' + (ok ? 'PASS' : 'FAIL'));
    return ok;
}

// ---------------------------------------------------------------- Part B: live server
var child = null, socket = null;

function killChildSync() {
    if (!child || child.exitCode !== null) return;
    try {
        child.kill();
    } catch (e) {
    }
    if (process.platform === 'win32')
        childProcess.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
}
process.on('exit', function () {
    if (socket) try {
        socket.close();
    } catch (e) {
    }
    killChildSync();
});
process.on('SIGINT', function () {
    console.log('Interrupted');
    process.exit(1);
});

function teardown(cb) {
    if (socket) {
        try {
            socket.close();
        } catch (e) {
        }
        socket = null;
    }
    if (!child || child.exitCode !== null) return cb();
    try {
        child.kill();
    } catch (e) {
    }
    setTimeout(function () {
        if (child.exitCode === null && process.platform === 'win32')
            childProcess.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
        cb();
    }, 1000);
}

function freePort(cb) {
    var srv = net.createServer();
    srv.listen(0, '127.0.0.1', function () {
        var port = srv.address().port;
        srv.close(function () {
            cb(port);
        });
    });
}

function getJson(url, cb) {
    http.get(url, function (res) {
        var body = '';
        res.on('data', function (d) {
            body += d;
        });
        res.on('end', function () {
            try {
                cb(null, JSON.parse(body));
            } catch (e) {
                cb(e);
            }
        });
    }).on('error', cb);
}

function partB(done) {
    console.log('== Part B: live server (map ' + args.map + ', ' + args.bots + ' x ' + args.difficulty +
        (args.autostart ? ', autostart' : ', human mode') + ', timeout ' + args.timeout + ' s) ==');
    var finished = false, out = '', errOut = '', timers = [];
    var bots = {}, joined = {}, readySent = false, matchRunning = false, roundsSeen = [], deaths = 0;
    var connectedAt = 0, joinSentAt = 0, passedAt = 0, port = 0;

    function botEntry(id) {
        if (!bots[id]) bots[id] = {id: id, moved: 0, fired: false, last: null, ammo: null};
        return bots[id];
    }
    function finish(ok, reason) {
        if (finished) return;
        finished = true;
        timers.forEach(function (t) {
            clearInterval(t);
            clearTimeout(t);
        });
        if (reason) console.log((ok ? '' : 'FAIL: ') + reason);
        var logLines = out.split('\n').filter(function (l) {
            return l.indexOf('[bots]') !== -1;
        });
        console.log('-- server [bots] log (' + logLines.length + ' lines) --');
        logLines.slice(0, 40).forEach(function (l) {
            console.log('  ' + l);
        });
        if (errOut.trim()) console.log('-- server stderr --\n' + errOut.trim());
        teardown(function () {
            done(ok);
        });
    }
    function fail(reason) {
        finish(false, reason);
    }

    freePort(function (p) {
        port = p;
        child = childProcess.spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
            cwd: ROOT,
            env: Object.assign({}, process.env, {
                PORT: String(port),
                game_map: String(args.map),
                game_bots: String(args.bots),
                game_bot_difficulty: args.difficulty,
                game_bot_autostart: args.autostart ? '1' : '0',
                game_bot_seed: '1',
                game_bot_debug: '1',
                game_rounds: '5',
                game_round_time: '2',
                game_max_players: '10'
            }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.on('data', function (d) {
            out += d;
            if (ERROR_RE.test(out)) fail('server stdout matched the error pattern');
        });
        child.stderr.on('data', function (d) {
            errOut += d;
            if (ERROR_RE.test(errOut)) fail('server stderr matched the error pattern');
        });
        child.on('exit', function (code, sig) {
            if (!finished) fail('server exited early (code ' + code + ', signal ' + sig + ')');
        });
        var waitStart = Date.now();
        var waitTimer = setInterval(function () {
            if (finished) return clearInterval(waitTimer);
            if (/Server started/.test(out)) {
                clearInterval(waitTimer);
                connect();
            } else if (Date.now() - waitStart > 10000) {
                clearInterval(waitTimer);
                fail('server did not print "Server started" within 10 s');
            }
        }, 100);
        timers.push(waitTimer);
    });

    function connect() {
        var io = require(path.join(ROOT, 'node_modules', 'socket.io-client'));
        connectedAt = Date.now();
        socket = io('http://127.0.0.1:' + port + '/game', {
            query: {displayName: 'SmokeTester'},
            transports: ['websocket'],
            reconnection: false
        });
        socket.on('connect_error', function (e) {
            fail('socket connect error: ' + e);
        });
        socket.on('connected', function (data) {
            if (data && data.during_match) {
                matchRunning = true;
                roundsSeen.push('running@connect(round ' + data.currentRound + ')');
            }
            if (!args.autostart) {
                socket.emit('match_join');
                joinSentAt = Date.now();
            }
        });
        socket.on('player_joined_match', function (pl) {
            if (pl && /^bot_/.test(pl.id)) joined[pl.id] = true;
        });
        socket.on('next_round', function (round) {
            matchRunning = true;
            roundsSeen.push(round);
        });
        socket.on('player_death', function () {
            deaths++;
        });
        socket.on('sync_game', function (snap) {
            for (var id in snap.players) {
                if (!/^bot_/.test(id)) continue;
                var sp = snap.players[id], b = botEntry(id);
                if (sp['in'] && sp['in'].f) {
                    if (!matchRunning) return fail(id + ' fired before the first next_round');
                    b.fired = true;
                }
                var sum = sp.am.reduce(function (s, v) {
                    return s + v;
                }, 0);
                if (b.ammo !== null && sum < b.ammo) {
                    if (!matchRunning) return fail(id + ' spent ammo before the first next_round');
                    b.fired = true;
                }
                b.ammo = sum;
                if (b.last) {
                    var dx = sp.p[0] - b.last[0], dy = sp.p[1] - b.last[1], step = Math.sqrt(dx * dx + dy * dy);
                    if (step <= 2) b.moved += step;
                }
                b.last = sp.p;
            }
        });
        timers.push(setInterval(tick, 200));
    }

    function status() {
        var ids = Object.keys(bots);
        var moved = ids.filter(function (id) {
            return bots[id].moved >= 3;
        }).length;
        var fired = ids.filter(function (id) {
            return bots[id].fired;
        }).length;
        var present = args.autostart ? ids.length : Object.keys(joined).length;
        return {
            next: matchRunning, present: present, moved: moved, fired: fired,
            ok: matchRunning && present >= args.bots && moved >= Math.min(2, args.bots) && fired >= 1
        };
    }

    function tick() {
        if (finished || !socket || passedAt) return;
        if (!args.autostart && !readySent && joinSentAt &&
            (Object.keys(joined).length >= args.bots || Date.now() - joinSentAt >= 1500)) {
            socket.emit('player_ready');
            readySent = true;
        }
        var s = status();
        if (s.ok && !passedAt) {
            passedAt = Date.now();
            return verifyDebug();
        }
        if (Date.now() - connectedAt > args.timeout * 1000)
            fail('timeout after ' + args.timeout + ' s: matchRunning=' + s.next + ' bots=' + s.present + '/' + args.bots +
                ' moved>=3m=' + s.moved + ' fired=' + s.fired);
    }

    // The perf ring covers 300 ticks; read it once the bots have been active for a whole
    // window (the first 10 s of play, JIT warm-up included) rather than after the first
    // second, which is dominated by cold code.
    var WARM_ACTIVE_TICKS = 300, debugWaitStart = 0;
    function verifyDebug() {
        if (!debugWaitStart) debugWaitStart = Date.now();
        getJson('http://127.0.0.1:' + port + '/debug/bots', function (err, dbg) {
            if (finished) return;
            if (err || !dbg || !dbg.stats) return fail('GET /debug/bots failed: ' + err);
            if (dbg.stats.activeTicks < WARM_ACTIVE_TICKS && Date.now() - debugWaitStart < 20000)
                return timers.push(setTimeout(verifyDebug, 500));
            var rows = Object.keys(bots).sort().map(function (id) {
                var info = (dbg.bots || []).filter(function (b) {
                    return b.id === id;
                })[0] || {};
                return [id, info.name || '?', bots[id].moved.toFixed(1), bots[id].fired ? 'yes' : 'no',
                    (info.state || '?') + (info.sub ? '/' + info.sub : ''), info.weapon || '?', info.hp != null ? info.hp : '?'];
            });
            table(['id', 'name', 'moved m', 'fired', 'state', 'weapon', 'hp'], rows);
            var st = dbg.stats;
            console.log('debug: tick=' + dbg.tick + ' duringMatch=' + dbg.duringMatch + ' bots=' + st.bots +
                ' active=' + st.active + ' activeTicks=' + st.activeTicks + ' avgUsPerBotTick=' + st.avgUsPerBotTick + ' maxUsTick=' + st.maxUsTick +
                ' errors=' + st.errors + ' astar=' + JSON.stringify(st.astar));
            console.log('rounds seen: ' + JSON.stringify(roundsSeen) + ', deaths: ' + deaths +
                ', passed after ' + ((passedAt - connectedAt) / 1000).toFixed(1) + ' s');
            var problems = [];
            if (st.errors !== 0) problems.push('stats.errors=' + st.errors);
            if (!(st.avgUsPerBotTick < 300)) problems.push('avgUsPerBotTick=' + st.avgUsPerBotTick + ' (>= 300)');
            if (!dbg.bots || !dbg.bots.length) problems.push('no bots in /debug/bots');
            (dbg.bots || []).forEach(function (b) {
                if (typeof b.state !== 'string' || !b.state) problems.push(b.id + ' has no state');
            });
            if (problems.length) return fail('/debug/bots: ' + problems.join(', '));
            finish(true);
        });
    }
}

// ---------------------------------------------------------------- main
var t0 = Date.now();
var okA = true;
if (!args.liveOnly) {
    try {
        okA = partA();
    } catch (e) {
        console.log('Part A crashed: ' + (e && e.stack || e));
        okA = false;
    }
}
function verdict(okB) {
    var ok = okA && okB;
    console.log((ok ? 'PASS' : 'FAIL') + ' botmatch' + (args.staticOnly ? ' (static only)' : '') +
        ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    process.exit(ok ? 0 : 1);
}
if (args.staticOnly) verdict(true);
else partB(function (okB) {
    console.log('Part B ' + (okB ? 'PASS' : 'FAIL'));
    verdict(okB);
});
