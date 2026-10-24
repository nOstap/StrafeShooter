// One bot's brain: perception, target choice, utility states (ROAM, COLLECT, HUNT, FLEE),
// and a combat layer (weapon choice, lead aiming with error, fire discipline) that runs
// every tick in every state. Produces one Player input per tick.

var BotConfig = require('./BotConfig.js');
var Ballistics = require('./Ballistics.js');
var Locomotion = require('./Locomotion.js');

var MOVE = BotConfig.MOVE, NAV = BotConfig.NAV, COMBAT = BotConfig.COMBAT;
var DEG = Math.PI / 180;
var TRACE_SIZE = 128;
var OU_THETA = 1 / 8;

function angleDiff(a, b) {
    var d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}
function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

function Bot(manager, player, index, presetName, rng) {
    this.manager = manager;
    this.nav = manager.nav;
    this.player = player;
    this.id = player.id;
    this.index = index;
    this.presetName = presetName;
    this.preset = BotConfig.PRESETS[presetName];
    this.rng = rng;
    this.seq = 0;
    this.tick = 0;
    this.pos = {x: player.position.x, y: player.position.y};
    this.state = 'IDLE';
    this.stateSinceTick = 0;
    this.sub = null;
    this.targetId = null;
    this.targetScore = 0;
    this.memory = {};
    this.aimAngle = 0;
    this.aimErr = 0;
    this.lastAim = {x: this.pos.x + 1, y: this.pos.y};
    this.desired = {x: this.pos.x + 1, y: this.pos.y};
    this.pendingSwitch = null;
    this.lastSwitchTick = -Infinity;
    this.rocketBlockedTicks = 0;
    this.rocketExcludedUntil = 0;
    this.strafeSign = 1;
    this.nextFlipTick = 0;
    this.lastWallFlipTick = -Infinity;
    this.dodge = {untilTick: -1, x: 0, y: 0};
    this.rolled = {};
    this.lastContactTick = 0;
    this.lastEnemyTick = -Infinity;
    this.hurtTick = -Infinity;
    this.lastHealth = player.health;
    this.visited = {};
    this.blacklist = {};
    this.curveHoldUntil = 0;
    this.lastAmmo = 0;
    this.trace = [];
    this.input = {seq: 0, x: 0, y: 0, isWalking: false, fire: false, jump: false, switch_weapon: false, aim: {x: 0, y: 0}};
    this.moveX = 0;
    this.moveY = 0;
    this.moveLen = 0;
    this.wasActive = false;
    this.thinkNow = false;
    this.errored = false;
    this.engageNoPathUntil = 0;
    this.hunchTick = -Infinity;
    this.hunchBlockedUntil = 0;
    this.myCell = -1;
    this.myComp = -1;
    this.items = [];
    this.loco = new Locomotion(this);
}

Bot.prototype.addTrace = function (ev, a, b) {
    this.trace.push({tick: this.tick, ev: ev, a: a === undefined ? null : a, b: b === undefined ? null : b});
    if (this.trace.length > TRACE_SIZE) this.trace.shift();
};
Bot.prototype.idleInput = function () {
    return {
        x: 0, y: 0, isWalking: false, fire: false, jump: false, switch_weapon: false,
        aim: {x: this.lastAim.x, y: this.lastAim.y}
    };
};
Bot.prototype.setState = function (state) {
    if (state === this.state) return;
    this.state = state;
    this.stateSinceTick = this.tick;
    this.sub = null;
    this.addTrace('state', state);
};
Bot.prototype.setSub = function (sub) {
    if (sub === this.sub) return;
    this.sub = sub;
    this.addTrace('sub', sub);
};

Bot.prototype.update = function (ctx) {
    var p = this.player;
    this.tick = ctx.tick;
    var active = ctx.duringMatch && p.physBody && p.health > 0 && !p.isDead && !ctx.pending[p.id];
    if (!active) {
        // Never fire before the match or during our own spawn countdown: damage is live then.
        if (this.state !== 'IDLE') this.setState('IDLE');
        this.wasActive = false;
        return this.idleInput();
    }
    if (!this.wasActive) {
        this.wasActive = true;
        this.respawned(ctx);
    }
    this.sense(ctx);
    var loco = this.loco;
    if ((ctx.tick + this.index) % this.preset.thinkEvery === 0 || this.thinkNow || loco.reached || loco.failed) {
        this.thinkNow = false;
        this.think(ctx);
    }
    var input = this.input;
    input.seq = 0;
    input.x = 0;
    input.y = 0;
    input.isWalking = false;
    input.fire = false;
    input.jump = false;
    input.switch_weapon = false;
    this.combat(ctx, input);
    this.move(ctx, input);
    return input;
};

Bot.prototype.respawned = function (ctx) {
    var p = this.player, nav = this.nav;
    this.memory = {};
    this.targetId = null;
    this.targetScore = 0;
    this.loco.reset();
    this.loco.setGoal(null);
    this.dodge.untilTick = -1;
    this.rolled = {};
    this.pendingSwitch = null;
    this.rocketBlockedTicks = 0;
    this.visited = {};
    this.pos.x = p.position.x;
    this.pos.y = p.position.y;
    this.aimAngle = Math.atan2(nav.heightM * 0.5 - this.pos.y, nav.widthM * 0.5 - this.pos.x);
    this.aimErr = 0;
    this.desired = {x: this.pos.x + Math.cos(this.aimAngle) * 5, y: this.pos.y + Math.sin(this.aimAngle) * 5};
    this.lastContactTick = ctx.tick;
    this.lastHealth = p.health;
    this.lastAmmo = p.weapons.CurveGun ? p.weapons.CurveGun.ammunition : 0;
    this.thinkNow = true;
    this.addTrace('spawn', Math.round(this.pos.x * 10) / 10 + ',' + Math.round(this.pos.y * 10) / 10);
};

Bot.prototype.sense = function (ctx) {
    var p = this.player;
    var pp = p.position;
    this.pos.x = pp.x;
    this.pos.y = pp.y;
    this.loco.updateNav();
    if (p.health < this.lastHealth) {
        this.hurtTick = ctx.tick;
        this.thinkNow = true;
    }
    this.lastHealth = p.health;
    var hit = ctx.lastHit[this.id];
    if (hit && ctx.tick - hit.tick <= 2 && hit.attacker && hit.attacker !== this.id) {
        var e = ctx.byId[hit.attacker];
        if (e && e.alive && !ctx.pending[e.id]) {
            var m = this.remember(ctx, e.id, false);
            m.attackedTick = hit.tick;
            this.lastContactTick = ctx.tick;
            this.lastEnemyTick = ctx.tick;
        }
    }
};

// Creates/refreshes a memory entry from a (reaction-delayed) observation.
Bot.prototype.remember = function (ctx, id, visible) {
    var m = this.memory[id];
    if (!m) m = this.memory[id] = {
        lastSeenTick: ctx.tick, visible: false, visibleSince: ctx.tick,
        x: 0, y: 0, vx: 0, vy: 0, attackedTick: -Infinity
    };
    var obs = ctx.observe(id, this.preset.reactionTicks);
    m.x = obs.x;
    m.y = obs.y;
    m.vx = obs.vx;
    m.vy = obs.vy;
    m.lastSeenTick = ctx.tick;
    if (visible && !m.visible) m.visibleSince = ctx.tick;
    if (visible) m.visible = true;
    return m;
};

Bot.prototype.isEnemy = function (ctx, e) {
    var p = this.player;
    if (e.id === this.id || !e.alive || ctx.pending[e.id] || e.p.isInvisible) return false;
    return !(e.team != null && e.team === p.team);
};

Bot.prototype.think = function (ctx) {
    var nav = this.nav;
    var c = nav.cellOf(this.pos.x, this.pos.y);
    this.myCell = c >= 0 ? nav.nearestWalkable(c, NAV.SNAP_CELLS) : -1;
    this.myComp = this.myCell >= 0 ? nav.comp[this.myCell] : -1;
    this.perceive(ctx);
    this.chooseTarget(ctx);
    if (this.loco.failed) this.handleFailure(ctx);
    this.chooseState(ctx, 0);
    this.chooseWeapon(ctx, false);
};

Bot.prototype.perceive = function (ctx) {
    var pr = this.preset, pos = this.pos, nav = this.nav, tick = ctx.tick;
    var aw2 = pr.awareness * pr.awareness, hr2 = pr.hearing * pr.hearing;
    var halfFov = pr.fovDeg * 0.5 * DEG, fx = Math.cos(this.aimAngle), fy = Math.sin(this.aimAngle);
    for (var i = 0; i < ctx.players.length; i++) {
        var e = ctx.players[i];
        if (e.id === this.id) continue;
        var m = this.memory[e.id];
        if (!this.isEnemy(ctx, e)) {
            if (m) m.visible = false;
            continue;
        }
        var dx = e.x - pos.x, dy = e.y - pos.y, d2 = dx * dx + dy * dy;
        var visible = d2 <= aw2;
        if (visible && pr.fovDeg < 360 && d2 > 1e-6) {
            var cosA = (dx * fx + dy * fy) / Math.sqrt(d2);
            visible = Math.acos(clamp(cosA, -1, 1)) <= halfFov;
        }
        if (visible) visible = nav.shotLOS(pos.x, pos.y, e.x, e.y);
        var heard = !visible && pr.hearing > 0 && e.firing && d2 <= hr2;
        if (visible || heard) {
            this.remember(ctx, e.id, visible);
            if (!visible) this.memory[e.id].visible = false;
            this.lastContactTick = tick;
            this.lastEnemyTick = tick;
        } else if (m) m.visible = false;
    }
    for (var id in this.memory) {
        var mm = this.memory[id], en = ctx.byId[id];
        if (!en || !en.alive || tick - mm.lastSeenTick > pr.memoryTicks) this.forget(id);
    }
};

Bot.prototype.forget = function (id) {
    if (!this.memory[id]) return;
    delete this.memory[id];
    if (this.targetId === id) {
        this.targetId = null;
        this.targetScore = 0;
        this.addTrace('forget', id);
    }
};

Bot.prototype.scoreEnemy = function (ctx, id) {
    var m = this.memory[id], e = ctx.byId[id], pr = this.preset;
    var dx = m.x - this.pos.x, dy = m.y - this.pos.y, d = Math.sqrt(dx * dx + dy * dy);
    return 0.45 * (1 - d / pr.awareness) + 0.25 * (1 - e.hp / e.maxHp) + (m.visible ? 0.25 : 0.1) +
        (id === this.targetId ? 0.3 : 0) + (ctx.tick - m.attackedTick <= COMBAT.ATTACKED_RECENT_TICKS ? 0.3 : 0);
};

Bot.prototype.chooseTarget = function (ctx) {
    var cur = this.targetId && this.memory[this.targetId] && ctx.byId[this.targetId] ? this.targetId : null;
    var best = null, bestScore = -Infinity, curScore = -Infinity;
    for (var id in this.memory) {
        if (!ctx.byId[id]) continue;
        var s = this.scoreEnemy(ctx, id);
        if (id === cur) curScore = s;
        if (s > bestScore) {
            bestScore = s;
            best = id;
        }
    }
    var next = best;
    // The hysteresis is the +0.3 scoreEnemy gives the current target: a visible enemy that
    // is shooting us (+0.15 visible, +0.3 attacker) beats a hidden one. CurveGun bullets
    // bend toward our current aim, so stay on the same target until they do.
    if (cur && (ctx.tick < this.curveHoldUntil || bestScore <= curScore)) next = cur;
    if (next !== this.targetId) {
        this.targetId = next;
        if (next && this.memory[next]) this.memory[next].visibleSince = ctx.tick;
        this.addTrace('target', next);
    }
    this.targetScore = next ? (next === cur ? curScore : bestScore) : 0;
};

Bot.prototype.goalKey = function (goal) {
    if (!goal) return null;
    if (goal.kind === 'poi') return 'poi:' + goal.poi;
    if (goal.kind === 'item') return goal.poi >= 0 ? 'poi:' + goal.poi : 'item:' + goal.id;
    return 'pt:' + Math.round(goal.x) + ',' + Math.round(goal.y);
};

Bot.prototype.handleFailure = function (ctx) {
    var loco = this.loco, reason = loco.failed, key = this.goalKey(loco.goal);
    // A vanished item was usually collected, not a navigation problem.
    if (reason !== 'gone' && key) this.blacklist[key] = ctx.tick + MOVE.BLACKLIST_TICKS;
    this.addTrace('abandon', reason, key);
    if (this.state === 'HUNT') {
        if (this.sub === 'CHASE' && this.targetId) this.forget(this.targetId);
        else this.engageNoPathUntil = ctx.tick + 90;
    } else if (this.state === 'ROAM' && this.sub === 'HUNCH') this.hunchBlockedUntil = ctx.tick + 150;
    loco.setGoal(null);
};

Bot.prototype.ammoNeed = function (ctx, w) {
    var prof = ctx.ballistics[w], weapon = this.player.weapons[w];
    if (!prof || !weapon) return 0;
    return clamp(1 - weapon.ammunition / (0.5 * prof.defaultAmmo), 0, 1);
};

// Reachable live items with an estimated path length (field value when the item sits on
// its spawn point, otherwise 1.4 x straight-line distance).
Bot.prototype.evalItems = function (ctx) {
    var nav = this.nav, pos = this.pos, list = this.items, tick = ctx.tick;
    list.length = 0;
    if (this.myCell < 0) return list;
    for (var i = 0; i < ctx.items.length; i++) {
        var it = ctx.items[i];
        if (it.comp < 0 || it.comp !== this.myComp) continue;
        var poi = it.poi;
        var key = poi >= 0 ? 'poi:' + poi : 'item:' + it.id;
        if (this.blacklist[key] > tick || this.blacklist['item:' + it.id] > tick) continue;
        var dx = it.x - pos.x, dy = it.y - pos.y, eu = Math.sqrt(dx * dx + dy * dy), est = 1.4 * eu;
        if (poi >= 0) {
            var fv = nav.fieldValue(poi, this.myCell);
            if (isFinite(fv)) {
                var P = nav.pois[poi];
                est = fv + Math.sqrt((it.x - P.x) * (it.x - P.x) + (it.y - P.y) * (it.y - P.y));
            }
        }
        list.push({item: it, poi: poi, est: est});
    }
    return list;
};

Bot.prototype.itemNeed = function (ctx, it) {
    var p = this.player, pr = this.preset, hp = p.health / p.maxHealth;
    switch (it.kind) {
        case 'LifeBox':
            return p.health >= p.maxHealth ? 0 : 1.5 * Math.pow(1 - hp, 1.5);
        case 'MaximumDefense':
            return 0.7 + 0.8 * (1 - hp);
        case 'DoubleDamage':
            for (var id in this.memory) return 1.2;
            return 0.9;
        case 'AmmoBox':
            if (!it.weapon || !BotConfig.WEAPON_PREF[it.weapon]) return 0;
            return (pr.ammoAware ? this.ammoNeed(ctx, it.weapon) : 0.3) * BotConfig.WEAPON_PREF[it.weapon];
    }
    return 0;
};

Bot.prototype.chooseState = function (ctx, depth) {
    var p = this.player, pr = this.preset, tick = ctx.tick;
    var hp = p.health / p.maxHealth;
    var items = this.evalItems(ctx);
    var enemyRecent = tick - this.lastEnemyTick <= COMBAT.ENEMY_RECENT_TICKS;
    var i, e;

    var flee = 0, heal = null;
    if (pr.fleeHealth > 0 && enemyRecent) {
        var low = this.state === 'FLEE' ? hp <= pr.fleeHealth + 0.2 : hp < pr.fleeHealth;
        if (low) {
            for (i = 0; i < items.length; i++) {
                e = items[i];
                if ((e.item.kind === 'LifeBox' || e.item.kind === 'MaximumDefense') && e.est <= 40 && (!heal || e.est < heal.est)) heal = e;
            }
            if (heal) flee = 1.5;
        }
    }
    var hunt = this.targetId ? pr.aggression * (0.6 + 0.4 * Math.min(1, this.targetScore)) : 0;
    var collect = 0, collectItem = null;
    for (i = 0; i < items.length; i++) {
        e = items[i];
        var radius = pr.collectRadius;
        if (e.item.kind === 'AmmoBox' && pr.ammoAware && e.item.weapon && this.ammoNeed(ctx, e.item.weapon) >= 0.6) radius *= 2;
        if (e.est > radius) continue;
        var u = 1.2 * this.itemNeed(ctx, e.item) / (1 + e.est / 10);
        if (u > collect) {
            collect = u;
            collectItem = e;
        }
    }
    var util = {FLEE: flee, HUNT: hunt, COLLECT: collect, ROAM: 0.2};
    var cur = this.state, next;
    if (flee > 0 && cur !== 'FLEE') next = 'FLEE';
    else if (util[cur] > 0 && tick - this.stateSinceTick < COMBAT.MIN_STATE_TICKS) next = cur;
    else {
        var best = -1, order = ['FLEE', 'HUNT', 'COLLECT', 'ROAM'];
        for (i = 0; i < order.length; i++) {
            var v = util[order[i]] * (order[i] === cur ? COMBAT.HYSTERESIS : 1);
            if (v > best) {
                best = v;
                next = order[i];
            }
        }
    }
    this.setState(next);
    var loco = this.loco;
    if (next === 'FLEE') {
        this.setSub(heal.item.kind);
        loco.setGoal({kind: 'item', id: heal.item.id, poi: heal.poi, x: heal.item.x, y: heal.item.y});
    } else if (next === 'COLLECT') {
        this.setSub(collectItem.item.kind);
        loco.setGoal({kind: 'item', id: collectItem.item.id, poi: collectItem.poi, x: collectItem.item.x, y: collectItem.item.y});
    } else if (next === 'HUNT') {
        if (!this.hunt(ctx) && depth < 1) {
            this.chooseTarget(ctx);
            this.chooseState(ctx, depth + 1);
        }
    } else this.roam(ctx);
};

// Returns false when the target had to be forgotten (caller re-thinks).
Bot.prototype.hunt = function (ctx) {
    var m = this.memory[this.targetId], nav = this.nav, loco = this.loco, tick = ctx.tick;
    if (!m) return false;
    if (m.visible) {
        this.setSub('ENGAGE');
        var tc = nav.cellOf(m.x, m.y);
        var wc = tc >= 0 ? (nav.walk[tc] ? tc : nav.nearestWalkable(tc, 2)) : -1;
        var tx = wc === tc ? m.x : (wc >= 0 ? nav.cx(wc) : m.x), ty = wc === tc ? m.y : (wc >= 0 ? nav.cy(wc) : m.y);
        if (wc >= 0 && loco.navCell >= 0 && nav.walkLOS(loco.navX, loco.navY, tx, ty)) loco.setGoal(null);
        else if (wc >= 0 && nav.comp[wc] === this.myComp && tick >= this.engageNoPathUntil)
            loco.setGoal({kind: 'point', x: tx, y: ty, moving: true});
        // Otherwise the target is across water: hold position, bullets still fly over it.
        else loco.setGoal(null);
        return true;
    }
    this.setSub('CHASE');
    if (loco.reached && loco.goal && loco.goal.kind === 'point') {
        this.forget(this.targetId);
        return false;
    }
    var age = Math.min(tick - m.lastSeenTick, 30);
    var gx = clamp(m.x + m.vx * age, 0, nav.widthM - 0.01), gy = clamp(m.y + m.vy * age, 0, nav.heightM - 0.01);
    var c = nav.cellOf(gx, gy);
    var sc = c >= 0 && this.myComp >= 0 ? nav.nearestWalkable(c, NAV.SNAP_CELLS, this.myComp) : -1;
    if (sc < 0) {
        this.forget(this.targetId);
        return false;
    }
    loco.setGoal({kind: 'point', x: sc === c ? gx : nav.cx(sc), y: sc === c ? gy : nav.cy(sc), moving: false});
    return true;
};

Bot.prototype.roam = function (ctx) {
    var nav = this.nav, loco = this.loco, tick = ctx.tick, pr = this.preset, pos = this.pos, i;
    if (tick - this.lastContactTick > pr.hunchTicks && tick >= this.hunchBlockedUntil && this.myComp >= 0) {
        // Hunch: after a long quiet spell head for the nearest enemy's real position.
        var best = null, bestD = Infinity, bestCell = -1;
        for (i = 0; i < ctx.players.length; i++) {
            var e = ctx.players[i];
            if (!this.isEnemy(ctx, e)) continue;
            var d = (e.x - pos.x) * (e.x - pos.x) + (e.y - pos.y) * (e.y - pos.y);
            if (d >= bestD) continue;
            var c = nav.cellOf(e.x, e.y);
            var sc = c >= 0 ? nav.nearestWalkable(c, NAV.SNAP_CELLS, this.myComp) : -1;
            if (sc < 0) continue;
            best = e;
            bestD = d;
            bestCell = sc;
        }
        if (best) {
            var wasHunch = this.sub === 'HUNCH';
            this.setSub('HUNCH');
            if (!wasHunch || !loco.goal || loco.goal.kind !== 'point' || tick - this.hunchTick >= 60) {
                var exact = nav.cellOf(best.x, best.y) === bestCell;
                loco.setGoal({kind: 'point', x: exact ? best.x : nav.cx(bestCell), y: exact ? best.y : nav.cy(bestCell), moving: true});
                this.hunchTick = tick;
            }
            return;
        }
    }
    var wasPoi = this.sub === 'POI';
    this.setSub('POI');
    var g = loco.goal;
    if (g && g.kind === 'poi' && loco.reached) {
        this.visited[g.poi] = tick;
        g = null;
    }
    if (wasPoi && g && g.kind === 'poi' && !loco.failed) return;
    var pick = this.pickPoi(ctx);
    if (pick < 0 && Object.keys(this.visited).length) {
        this.visited = {};
        pick = this.pickPoi(ctx);
    }
    loco.setGoal(pick >= 0 ? {kind: 'poi', poi: pick} : null);
};

Bot.prototype.pickPoi = function (ctx) {
    var nav = this.nav, pr = this.preset, tick = ctx.tick;
    var boost = false;
    if (pr.ammoAware)
        for (var w = 0; w < ctx.weapons.length; w++)
            if (this.ammoNeed(ctx, ctx.weapons[w]) >= 0.6) boost = true;
    var best = -1, bestScore = -Infinity;
    for (var i = 0; i < nav.pois.length; i++) {
        var poi = nav.pois[i];
        if (poi.cell < 0 || poi.comp !== this.myComp) continue;
        if (this.blacklist['poi:' + i] > tick) continue;
        if (this.visited[i] != null && tick - this.visited[i] < COMBAT.ROAM_REVISIT_TICKS) continue;
        var fv = nav.fieldValue(i, this.myCell);
        if (!isFinite(fv)) continue;
        if (fv < MOVE.POI_REACHED) {
            this.visited[i] = tick;
            continue;
        }
        var s = (0.5 + this.rng.next()) / (1 + fv / 15);
        if (boost && poi.kind === 'AmmoBox') s *= 2;
        if (s > bestScore) {
            bestScore = s;
            best = i;
        }
    }
    return best;
};

Bot.prototype.chooseWeapon = function (ctx, forced) {
    var p = this.player, pr = this.preset, tick = ctx.tick, bal = ctx.ballistics;
    var m = this.targetId ? this.memory[this.targetId] : null, e = this.targetId ? ctx.byId[this.targetId] : null;
    var d = 12, speed = 0, inAir = false, dRocket = d;
    if (m) {
        d = dRocket = Math.sqrt((m.x - this.pos.x) * (m.x - this.pos.x) + (m.y - this.pos.y) * (m.y - this.pos.y));
        speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        inAir = !!(e && e.inAir);
        if (e && m.visible) dRocket = Math.min(d, this.realDistance(e));
    }
    var mult = p.buffs && p.buffs.DoubleDamageBuff ? 2 : 1;
    var sigma = pr.aimSigmaDeg * DEG;
    var active = this.pendingSwitch || p.activeWeapon;
    var rocketMin = COMBAT.ROCKET_MIN_DIST + (active === 'RocketLuncher' ? 0 : COMBAT.ROCKET_REENTRY_MARGIN);
    var best = null, bestScore = 0, i, w;
    for (i = 0; i < ctx.weapons.length; i++) {
        w = ctx.weapons[i];
        var weapon = p.weapons[w], prof = bal[w];
        if (!weapon || !prof || weapon.ammunition <= 0 || d > 0.9 * prof.range) continue;
        if (w === 'RocketLuncher' && (dRocket < rocketMin || tick < this.rocketExcludedUntil)) continue;
        var ph = Ballistics.pHit(prof, d, sigma, speed, inAir);
        if (w === 'CurveGun' && ph < 0.35) continue;
        var score = Ballistics.baseDps(prof, mult) * ph * (weapon.ammunition > 0.25 * prof.defaultAmmo ? 1 : 0.6) *
            BotConfig.WEAPON_PREF[w] * (w === active ? COMBAT.HYSTERESIS : 1);
        if (score > bestScore) {
            bestScore = score;
            best = w;
        }
    }
    var activeAmmo = p.weapons[active] ? p.weapons[active].ammunition : 0;
    if (!best) {
        best = active;
        if (activeAmmo <= 0) {
            var bestAmmo = 0;
            for (i = 0; i < ctx.weapons.length; i++) {
                w = ctx.weapons[i];
                var a = p.weapons[w] ? p.weapons[w].ammunition * BotConfig.WEAPON_PREF[w] : 0;
                if (a > bestAmmo) {
                    bestAmmo = a;
                    best = w;
                }
            }
        }
    }
    if (best === active) return;
    if (!(tick - this.lastSwitchTick >= pr.switchDelayTicks || activeAmmo <= 0)) return;
    if (pr.switchOnlyWhenEmpty && activeAmmo > 0 && !forced) return;
    this.pendingSwitch = best;
    this.lastSwitchTick = tick;
    this.addTrace('weapon', best, active);
};

// Self-damage checks use where the target really is, not the reaction-delayed position we
// aim at: a rocket detonates on the target's body.
Bot.prototype.realDistance = function (e) {
    var dx = e.x - this.pos.x, dy = e.y - this.pos.y;
    return Math.sqrt(dx * dx + dy * dy);
};
Bot.prototype.rocketSafe = function (d, mx, my, ax, ay, prof) {
    if (d < COMBAT.ROCKET_MIN_DIST) return false;
    var dx = ax - mx, dy = ay - my, L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) return false;
    var ux = dx / L, uy = dy / L;
    var hit = this.nav.rayHit(mx, my, mx + ux * prof.range, my + uy * prof.range);
    var imp = Math.min(hit, L);
    var ix = mx + ux * imp - this.pos.x, iy = my + uy * imp - this.pos.y;
    return ix * ix + iy * iy >= COMBAT.ROCKET_SAFE_DIST * COMBAT.ROCKET_SAFE_DIST;
};

Bot.prototype.combat = function (ctx, input) {
    var p = this.player, pr = this.preset, tick = ctx.tick, pos = this.pos, nav = this.nav;
    var curve = p.weapons.CurveGun ? p.weapons.CurveGun.ammunition : 0;
    if (curve < this.lastAmmo) this.curveHoldUntil = tick + COMBAT.CURVE_HOLD_TICKS;
    this.lastAmmo = curve;

    if (!this.pendingSwitch && p.weapons[p.activeWeapon].ammunition <= 0) this.chooseWeapon(ctx, false);
    var w = this.pendingSwitch || p.activeWeapon;
    if (this.pendingSwitch) {
        input.switch_weapon = this.pendingSwitch;
        this.pendingSwitch = null;
    }
    var prof = ctx.ballistics[w];
    var m = this.targetId ? this.memory[this.targetId] : null;
    var visible = !!(m && m.visible);
    var desired = this.desired, obs = null;
    if (visible) {
        obs = ctx.observe(this.targetId, pr.reactionTicks);
        // Muzzle as Bullet.setup places it: turned toward the target, offset 15 deg, 0.73 m.
        var ang = Math.atan2(obs.y - pos.y, obs.x - pos.x);
        var mx = pos.x + Math.cos(ang + Math.PI / 12) * 0.73, my = pos.y + Math.sin(ang + Math.PI / 12) * 0.73;
        var lead = Ballistics.solveLead(prof, mx, my, obs.x, obs.y, obs.vx * pr.leadFactor, obs.vy * pr.leadFactor,
            pr.compensate * pr.reactionTicks);
        desired.x = lead ? lead.x : obs.x;
        desired.y = lead ? lead.y : obs.y;
    } else if (this.sub === 'CHASE' && pr.preAim && m) {
        desired.x = m.x;
        desired.y = m.y;
    } else if (this.moveLen > 0.05) {
        desired.x = pos.x + this.moveX / this.moveLen * 5;
        desired.y = pos.y + this.moveY / this.moveLen * 5;
    }
    var dx = desired.x - pos.x, dy = desired.y - pos.y;
    var dAng = Math.atan2(dy, dx);
    var turn = pr.turnRateDeg * DEG;
    this.aimAngle = angleDiff(this.aimAngle + clamp(angleDiff(dAng, this.aimAngle), -turn, turn), 0);
    var sig = pr.aimSigmaDeg * DEG * (p.isInAir ? 1.6 : this.moveLen > 0.05 ? 1.3 : 1);
    this.aimErr = this.aimErr * (1 - OU_THETA) + sig * Math.sqrt(2 * OU_THETA - OU_THETA * OU_THETA) * this.rng.gaussian();
    var dist = Math.max(COMBAT.MIN_AIM_DIST, Math.sqrt(dx * dx + dy * dy));
    var fa = this.aimAngle + this.aimErr;
    var ax = pos.x + Math.cos(fa) * dist, ay = pos.y + Math.sin(fa) * dist;
    // Always aim, even when not firing: CurveGun bullets steer by the shooter's live aim.
    input.aim.x = ax;
    input.aim.y = ay;
    this.lastAim.x = ax;
    this.lastAim.y = ay;

    input.fire = false;
    if (!visible || !prof) {
        this.rocketBlockedTicks = 0;
        return;
    }
    if (w !== 'RocketLuncher') this.rocketBlockedTicks = 0;
    var acquire = pr.reactionTicks;
    if (tick - m.attackedTick <= COMBAT.ATTACKED_RECENT_TICKS) acquire = Math.floor(acquire / 2);
    if (tick - m.visibleSince < acquire) return;
    if (p.weapons[w].ammunition <= 0) return;
    var td = Math.sqrt((obs.x - pos.x) * (obs.x - pos.x) + (obs.y - pos.y) * (obs.y - pos.y));
    if (td > 0.9 * prof.range) return;
    if (Math.abs(angleDiff(this.aimAngle, dAng)) > BotConfig.FIRE_TOLERANCE_DEG[w] * DEG) return;
    var mux = pos.x + Math.cos(fa + Math.PI / 12) * 0.73, muy = pos.y + Math.sin(fa + Math.PI / 12) * 0.73;
    if (!nav.shotLOS(mux, muy, ax, ay)) return;
    var e = ctx.byId[this.targetId];
    var speed = Math.sqrt(obs.vx * obs.vx + obs.vy * obs.vy);
    if (Ballistics.pHit(prof, td, pr.aimSigmaDeg * DEG, speed, !!(e && e.inAir)) < pr.minPHit) return;
    if (w === 'RocketLuncher') {
        if (!this.rocketSafe(e ? Math.min(td, this.realDistance(e)) : td, mux, muy, ax, ay, prof)) {
            if (++this.rocketBlockedTicks >= COMBAT.ROCKET_BLOCK_TICKS) {
                this.rocketBlockedTicks = 0;
                this.rocketExcludedUntil = tick + 30;
                this.chooseWeapon(ctx, true);
            }
            return;
        }
        this.rocketBlockedTicks = 0;
    }
    input.fire = true;
};

// Distance to hold in ENGAGE: the weapon's preferred range, but no farther than where the
// hit chance against this target still reaches minPHit (otherwise the fire gate never
// opens and two strafing bots circle each other forever).
Bot.prototype.engageRange = function (ctx, w, m) {
    var prof = ctx.ballistics[w], pr = this.preset;
    var pref = BotConfig.PREFERRED_RANGE[w] || 8;
    if (!prof) return pref;
    var e = ctx.byId[this.targetId], inAir = !!(e && e.inAir);
    var speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy), sigma = pr.aimSigmaDeg * DEG;
    var lo = 0.5, hi = Math.min(pref, 0.9 * prof.range);
    if (Ballistics.pHit(prof, hi, sigma, speed, inAir) < pr.minPHit) {
        for (var i = 0; i < 10; i++) {
            var mid = (lo + hi) * 0.5;
            if (Ballistics.pHit(prof, mid, sigma, speed, inAir) >= pr.minPHit) lo = mid;
            else hi = mid;
        }
        pref = lo;
    }
    if (w === 'RocketLuncher') pref = Math.max(pref, COMBAT.ROCKET_MIN_DIST + 1);
    return pref;
};

Bot.prototype._strafeTick = function (tick, px, py) {
    var pr = this.preset;
    if (tick >= this.nextFlipTick) {
        this.strafeSign = -this.strafeSign;
        this.nextFlipTick = tick + this.rng.int(pr.strafeFlip[0], pr.strafeFlip[1]);
    }
    if (tick - this.lastWallFlipTick >= 10 &&
        !this.nav.isWalkable(this.pos.x + px * this.strafeSign * 0.8, this.pos.y + py * this.strafeSign * 0.8)) {
        this.strafeSign = -this.strafeSign;
        this.lastWallFlipTick = tick;
    }
};

Bot.prototype.move = function (ctx, input) {
    var pr = this.preset, tick = ctx.tick, pos = this.pos, loco = this.loco, p = this.player;
    var g = loco.goalDirection(ctx);
    var x = g.x, y = g.y, L, ref = null, id;
    var m = this.targetId ? this.memory[this.targetId] : null;
    if (m && m.visible) ref = m;
    else if (this.state !== 'HUNT') {
        var bestD = Infinity;
        for (id in this.memory) {
            var mm = this.memory[id];
            if (!mm.visible) continue;
            var dd = (mm.x - pos.x) * (mm.x - pos.x) + (mm.y - pos.y) * (mm.y - pos.y);
            if (dd < bestD) {
                bestD = dd;
                ref = mm;
            }
        }
    }
    if (ref) {
        var tx = ref.x - pos.x, ty = ref.y - pos.y, d = Math.sqrt(tx * tx + ty * ty);
        if (d > 1e-6) {
            var ux = tx / d, uy = ty / d, px = -uy, py = ux;
            this._strafeTick(tick, px, py);
            var s = this.strafeSign;
            if (this.state === 'HUNT' && this.sub === 'ENGAGE' && ref === m) {
                if (loco.goal) {
                    x = g.x + px * s * pr.strafe * 0.5;
                    y = g.y + py * s * pr.strafe * 0.5;
                } else {
                    var radial = clamp((d - this.engageRange(ctx, p.activeWeapon, m)) / 2, -1, 1);
                    x = ux * radial * 0.7 + px * s * pr.strafe;
                    y = uy * radial * 0.7 + py * s * pr.strafe;
                }
                // Only cap the length: pr.strafe is also the strafe speed (easy strafes slowly).
                L = Math.sqrt(x * x + y * y);
                if (L < 0.05) x = y = 0;
                else if (L > 1) {
                    x /= L;
                    y /= L;
                }
            } else if (this.state === 'COLLECT' || this.state === 'FLEE' || this.state === 'ROAM') {
                x = g.x + px * s * 0.5 * pr.strafe;
                y = g.y + py * s * 0.5 * pr.strafe;
                L = Math.sqrt(x * x + y * y);
                if (L > 1) {
                    x /= L;
                    y /= L;
                }
            }
        }
    }

    var wantJump = false;
    if (pr.dodgeChance > 0 && ctx.threats) {
        if (tick % 300 === 0) this.rolled = {};
        for (var i = 0; i < ctx.threats.length; i++) {
            var t = ctx.threats[i];
            if (t.owner === this.id || this.rolled[t.id]) continue;
            var rx = pos.x - t.x, ry = pos.y - t.y;
            if (rx * rx + ry * ry > COMBAT.DODGE_RADIUS * COMBAT.DODGE_RADIUS) continue;
            var tvx = t.v.x, tvy = t.v.y, vv = tvx * tvx + tvy * tvy;
            if (vv < 1e-6) continue;
            var tca = clamp((rx * tvx + ry * tvy) / vv, 0, COMBAT.DODGE_HORIZON);
            var mxx = rx - tvx * tca, myy = ry - tvy * tca;
            if (mxx * mxx + myy * myy >= COMBAT.DODGE_MISS * COMBAT.DODGE_MISS) continue;
            this.rolled[t.id] = true;
            if (!this.rng.chance(pr.dodgeChance)) continue;
            var vl = Math.sqrt(vv), nx = -tvy / vl, ny = tvx / vl;
            // Step away from the line of flight (to the side we are already on).
            var side = mxx * nx + myy * ny;
            if (side < 0 || (side === 0 && this.strafeSign < 0)) {
                nx = -nx;
                ny = -ny;
            }
            this.dodge.untilTick = tick + 8;
            this.dodge.x = nx;
            this.dodge.y = ny;
            if (tca < 8 && this.rng.chance(pr.dodgeJump)) wantJump = true;
            this.addTrace('dodge', t.id);
        }
        if (tick < this.dodge.untilTick) {
            x += this.dodge.x * 1.5;
            y += this.dodge.y * 1.5;
            L = Math.sqrt(x * x + y * y);
            if (L > 1e-6) {
                x /= L;
                y /= L;
            }
        }
    }

    var dir = this._moveDir || (this._moveDir = {x: 0, y: 0});
    dir.x = x;
    dir.y = y;
    var out = loco.finish(ctx, dir, this.strafeSign);
    input.x = out.x;
    input.y = out.y;
    input.isWalking = out.isWalking;
    input.jump = out.jump;
    if (wantJump && !input.jump && out.isWalking && loco.canJump(out.x, out.y)) input.jump = true;
    this.moveX = out.x;
    this.moveY = out.y;
    this.moveLen = Math.sqrt(out.x * out.x + out.y * out.y);
};

Bot.prototype.debugInfo = function (ctx) {
    var p = this.player, loco = this.loco, g = loco.goal, path = [];
    if (loco.waypoints)
        for (var i = loco.wpIndex; i < loco.waypoints.length && path.length < 32; i++)
            path.push([Math.round(loco.waypoints[i].x * 100) / 100, Math.round(loco.waypoints[i].y * 100) / 100]);
    var ammo = [];
    for (var w = 0; w < ctx.weapons.length; w++) ammo.push(p.weapons[ctx.weapons[w]] ? p.weapons[ctx.weapons[w]].ammunition : 0);
    return {
        id: this.id,
        name: p.displayName,
        difficulty: this.presetName,
        state: this.state,
        sub: this.sub,
        target: this.targetId,
        weapon: p.activeWeapon,
        ammo: ammo,
        hp: p.health,
        pos: [Math.round(this.pos.x * 100) / 100, Math.round(this.pos.y * 100) / 100],
        goal: g ? {kind: g.kind, poi: g.poi, id: g.id, x: g.x != null ? Math.round(g.x * 100) / 100 : null,
            y: g.y != null ? Math.round(g.y * 100) / 100 : null, moving: g.moving} : null,
        path: path,
        stuckLevel: loco.stuckLevel,
        trace: this.trace.slice(-20)
    };
};

module.exports = Bot;
