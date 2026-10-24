function GameEngine(setup) {
    this.id = setup.id || null;
    this.local_player = null;
    this.name = setup.name || null;
    this.host = setup.host || null;
    this.mode = setup.mode || 0;
    this.server_time = setup.server_time || Date.now();
    this.map_index = parseInt(setup.map_index, 10) || 0;
    this.map = null;
    this.during_match = setup.during_match || false;
    this.round_time = setup.round_time || 15;
    this.currentRound = setup.currentRound || 0;
    this.max_players = setup.max_players;
    this.rounds = setup.rounds || 1;
    this.entities = [];
    this.entityIndex = {};
    this.players = {};
    this.spectators = {};
    this.collectables = {};
    this.during_round = false;
    this.last_tick = Date.now();
    this.mspf = 0;
    // Fixed simulation step. Every server and client advances the world by exactly this
    // much per tick, so movement no longer depends on each machine's frame rate.
    this.delta = CFG.TICK_RATE / 1000;
    this.fps = 0;
    this.frame_count = 0;
    this.tick = setup.tick || 0;
    this.run = false;
    this._spawnDefer = [];
    this._killedEnt = [];
    this._itemRespawns = [];

    // Client-side networking state
    this.inputSeq = 0;
    this.predictionHistory = [];
    this.snapshots = [];
    this.clockOffset = null;
    this.accumulator = 0;
    this.alpha = 0;
    this.lastFrameTime = null;
    this.visualError = {x: 0, y: 0};
}

GameEngine.prototype.setup = function (data) {
    physicsEngine.addContactListener({
        PostSolve: function (a, b, engine) {
            var uDataA = a.GetUserData();
            var uDataB = b.GetUserData();
            var colType = 0x0000;
            if (!uDataA || !uDataB) return;
            if (uDataA != null) colType |= uDataA.elementType;
            if (uDataB != null) colType |= uDataB.elementType;

            if (colType === (CFG.COLLISION_GROUPS.PLAYER | CFG.COLLISION_GROUPS.WALL))
                return;
            if (colType === (CFG.COLLISION_GROUPS.PLAYER | CFG.COLLISION_GROUPS.WATER))
                return;
            if (colType === (CFG.COLLISION_GROUPS.ITEM | CFG.COLLISION_GROUPS.WALL))
                return;

            engine.onCollision(uDataA, uDataB);

        }
    }, this);
    this.loadMap();
    if (!IS_SERVER) {
        this.local_player = SOCKET.id;
        //LOAD INIT GAME DATA
        for (var i = 0; i < data.entities.length; i++) {
            var entDef = data.entities[i];
            if (!global[entDef.class]) continue;
            var ent = new global[entDef.class](entDef);
            this.addEntity(ent);
        }
        for (var s in data.spectators) {
            var p = new Player(data.spectators[s]);
            gameEngine.addSpectator(p);
        }
        //END INIT DATA LOAD

        gui.setPlayerList(this);
        renderEngine.setup();
    }
    physicsEngine.setup();
    this.run = true;
};
/**
 * Client frame entry point: runs as many fixed ticks as real time requires and
 * remembers how far we are into the next tick so rendering can interpolate.
 */
GameEngine.prototype.frame = function () {
    var now = performance.now();
    if (this.lastFrameTime === null) this.lastFrameTime = now;
    this.accumulator += now - this.lastFrameTime;
    this.lastFrameTime = now;
    var ticks = 0;
    while (this.accumulator >= CFG.TICK_RATE && ticks < CFG.NET.MAX_CATCHUP_TICKS) {
        this.update();
        this.accumulator -= CFG.TICK_RATE;
        ticks++;
    }
    // Tab was in background or the machine stalled: drop the backlog instead of
    // fast-forwarding; the server snapshot will pull us back in place.
    if (this.accumulator >= CFG.TICK_RATE) this.accumulator = 0;
    this.alpha = this.accumulator / CFG.TICK_RATE;
    this.visualError.x *= 1 - CFG.NET.VISUAL_SMOOTHING;
    this.visualError.y *= 1 - CFG.NET.VISUAL_SMOOTHING;
};
GameEngine.prototype.update = function () {
    if (!this.run) return;
    var now = Date.now();
    if (IS_SERVER) this.server_time = now;
    this.tick++;
    this.frame_count++;
    this.mspf = now - this.last_tick;
    this.fps = this.mspf ? 1000 / this.mspf : 0;
    this.last_tick = now;

    var el = this.entities.length;
    for (var i = 0; i < el; i++) {
        if (this.entities[i].storePrev) this.entities[i].storePrev();
    }

    if (IS_SERVER) {
        // Item pick-ups happen inside Box2D's contact callback where the world is locked,
        // so the replacement crate is created here, outside the physics step.
        for (var r = 0; r < this._itemRespawns.length; r++) {
            var it = this._itemRespawns[r];
            this.spawnItem(it.itemClass, it.weapon, it.delay);
        }
        this._itemRespawns = [];
        this.processInputs();
    }
    else {
        this.recordInput();
        this.interpolateRemote();
    }

    for (var i = 0; i < el; i++) {
        var ent = this.entities[i];
        if (ent && !ent._killed)
            ent.update();
    }

    var kel = this._killedEnt.length;
    for (var i = 0; i < kel; i++) {
        var ent = this._killedEnt[i];
        _earse(this.entities, ent);
        if (this.entityIndex[ent.id] === ent) delete this.entityIndex[ent.id];
        if (ent.group && this[ent.group][ent.id] === ent) delete this[ent.group][ent.id];
    }
    this._killedEnt = [];

    for (var i = this._spawnDefer.length - 1; i >= 0; i--) {
        var spawn = this._spawnDefer[i];
        if (Date.now() - spawn.startTime < spawn.delay) continue;
        this._spawnDefer.splice(i, 1);
        var entity = this.getEntityById(spawn.entityID);
        if (!entity) {
            if (!spawn.entDef || !global[spawn.entDef.class]) continue;
            entity = new global[spawn.entDef.class](spawn.entDef);
            this.addEntity(entity);
        }
        var position = new Vec2(spawn.position.x, spawn.position.y);
        entity._reset({
            position: position,
            _spawned: true,
            isDeadH: false
        });
        if (!IS_SERVER) {
            if (entity.id == this.local_player) this.predictionHistory = [];
            if (entity.snapPrev) entity.snapPrev();
            SoundManager.worldPlay('SFX.EFFECTS.RESPAWN', position);
            ANIMATIONS.EFFECTS.TP.play(new Vec2(position.x, position.y));
            if (entity.isPlayer) particles.respawn(position.x, position.y);
        }
    }
    var flags = this.setFlags();
    if (IS_SERVER) {
        if (!this.during_match) {
            if (flags.ready) this.startMatch();
        } else if (Date.now() - this.during_match > this.round_time * 1000 * 60 ||
            flags.roundWin || flags.allDie) {
            this.nextRound();
        }
    }
    physicsEngine.update();
    if (!IS_SERVER) this.recordPrediction();
    SoundManager.update();
};
GameEngine.prototype.setFlags = function () {
    var flags = {
        ready: null,
        roundWin: 0
    };
    var killed = 0;
    for (var p in this.players) {
        if (flags.ready === null) flags.ready = this.players[p].isReady;
        else
            flags.ready &= this.players[p].isReady;
        if (this.players[p].isDeadH) killed++;
    }
    var pl = Object.keys(this.players).length;
    if (pl == killed && this.during_match) flags.allDie = true;
    if (pl > 1)
        flags.roundWin = ~~(pl - 1 == killed);
    return flags;
}
GameEngine.prototype.nextRound = function (round) {
    if (IS_SERVER) ioGame.emit('next_round', this.currentRound + 1);
    else if (round != null) this.currentRound = round - 1;
    this.currentRound++;
    this.during_match = Date.now();
    if (this.currentRound > this.rounds) return this.endMatch();
    this.clearMap();
    this.spawnPlayers();
    this.spawnItems();
    if (!IS_SERVER) interface.showCounter(CFG.PLAYER.SPAWN_TIME, STRINGS[CFG.LANG].GAMEPLAY.ROUND + ' ' + this.currentRound);
};
GameEngine.prototype.render = function () {
    if (IS_SERVER) return;
    renderEngine.render(this.entities, CFG.DEBUG);
};
GameEngine.prototype.loadMap = function () {
    if (!IS_SERVER) this.map = pre_loaded_maps[this.map_index];

    CFG.MAP_WIDTH = this.map.width;
    CFG.MAP_HEIGHT = this.map.height;
    CFG.TILE_HEIGHT = this.map.tileheight;
    CFG.TILE_WIDTH = this.map.tilewidth;

    var seawalls = _findByKey(this.map.layers, 'name', 'SeaWalls');
    var walls = _findByKey(this.map.layers, 'name', 'Walls');

    //TODO: KINEMATIC BODIES SCRIPTS LOADING  ( MAP_SCRIPTS );

    for (var i = 0; seawalls && i < seawalls.objects.length; i++) {
        var obj = seawalls.objects[i];
        var setup = {
            type: 'static',
            position: new Vec2((obj.x + obj.width * 0.5) / SCALE, (obj.y + obj.height * 0.5) / SCALE),
            halfWidth: obj.width * 0.5 / SCALE,
            halfHeight: obj.height * 0.5 / SCALE,
            maskBits: CFG.COLLISION_GROUPS.ALL ^ CFG.COLLISION_GROUPS.BULLET,
            categoryBits: CFG.COLLISION_GROUPS.WATER
        };
        if (obj.polygon) {
            setup.polygon = [];
            obj.polygon.forEach(function (point) {
                setup.polygon.push({x: point.x / SCALE, y: point.y / SCALE});
            });
        }
        var ent = new Obstacle(setup);
        this.addEntity(ent);
    }
    for (var i = 0; walls && i < walls.objects.length; i++) {
        var obj = walls.objects[i];
        var setup = {
            type: 'static',
            position: new Vec2((obj.x + obj.width * 0.5) / SCALE, (obj.y + obj.height * 0.5) / SCALE),
            halfWidth: obj.width * 0.5 / SCALE,
            halfHeight: obj.height * 0.5 / SCALE,
            categoryBits: CFG.COLLISION_GROUPS.WALL
        };
        if (obj.polygon) {
            setup.polygon = [];
            obj.polygon.forEach(function (point) {
                setup.polygon.push({x: point.x / SCALE, y: point.y / SCALE});
            });
        }
        var ent = new Obstacle(setup);
        this.addEntity(ent);
    }
};
GameEngine.prototype.startMatch = function () {
    this.currentRound = 0;
    if (IS_SERVER)
        this.nextRound();
    this.during_match = Date.now();
};
GameEngine.prototype.endMatch = function () {
    if (IS_SERVER) ioGame.emit('match_ended');
    this.during_match = false;
    this.currentRound = 0;
    this.clearMap();
    this._spawnDefer = [];
    for (var p in this.players) {
        var player = this.players[p];
        player._reset({position: player.position, isSpectator: true, isReady: false});
        player.isReady = false;
        player.isSpectator = true;
        // Destroy the physics body so re-joining does not create a second, ghost body.
        player.kill();
        this.spectators[p] = player;
    }
    this.players = {};
    //TODO NOT SPEC JUST SHOW STATS AND MAP QUIZ
    if (!IS_SERVER) {
        interface._clear();
        gui.setPlayerList(this);
        gui.show('SPECTATE');
    }
};
GameEngine.prototype.clearMap = function () {
    for (var cIndex in this.collectables) {
        this.collectables[cIndex]._markToKill = true;
    }
    this.collectables = {};
    return true;
};
GameEngine.prototype.spawnPlayers = function () {
    for (var p in this.players) {
        this.players[p].isDeadH = false;
        this.spawn(this.players[p].id, CFG.PLAYER.SPAWN_TIME, null, null);
    }
};
GameEngine.prototype.spawnItems = function () {
    if (!IS_SERVER) return;
    var cratespawns = _findByKey(this.map.layers, 'properties.type', 'CrateSpawn', true);
    for (var index in cratespawns) {
        for (var i = 0; i < cratespawns[index].objects.length; i++) {
            var obj = cratespawns[index].objects[i];
            this.spawnItem(cratespawns[index].name.replace('Spawns', ''), obj.type || null, 5000);
        }
    }
};
GameEngine.prototype.spawnItem = function (itemClass, weapon, delay) {
    if (!IS_SERVER || !global[itemClass]) return;
    var ent = new global[itemClass]({
        id: itemClass + _guid(),
        type: 'dynamic',
        position: new Vec2(),
        weapon: weapon
    });
    this.addEntity(ent);
    this.spawn(ent.id, delay, null, ent._simply());
};
GameEngine.prototype.joinMatch = function (id) {
    var player = this.spectators[id];
    if (!player || !player.isSpectator) return;
    player.isSpectator = false;
    this.addEntity(player);
    delete this.spectators[id];
    if (IS_SERVER) {
        ioGame.emit('player_joined_match', player._simply());
        // Joining a running match: drop in at a spawn point instead of the map centre.
        if (this.during_match) this.spawn(player.id, CFG.PLAYER.SPAWN_TIME, null, null);
    }
};
GameEngine.prototype.addSpectator = function (s) {
    this.spectators[s.id] = s;
};
GameEngine.prototype.spawn = function (entityID, delay, team, entDef) {
    if (!IS_SERVER) return;
    var entity = this.getEntityById(entityID);
    if (!entity) return false;
    var spawns = _findByKey(this.map.layers, 'name', entity.class + 'Spawns');
    if (!spawns) return false;
    var area = _superRandom(spawns.objects);
    var spawn = {
        delay: delay,
        entityID: entityID,
        team: team,
        startTime: Date.now(),
        position: new Vec2((area.x + _superRandom(area.width)) / SCALE, (area.y + _superRandom(area.height)) / SCALE),
        entDef: entDef || null
    };
    this._spawnDefer.push(spawn);
    ioGame.emit('spawn_defer', {
        entityID: spawn.entityID,
        delay: spawn.delay,
        position: {x: spawn.position.x, y: spawn.position.y},
        entDef: spawn.entDef
    });
};
GameEngine.prototype.removePlayer = function (id) {
    var p = this.players[id] || this.spectators[id];
    if (!p) return;
    if (!p.isSpectator) {
        this.removeEntity(p);
    }
    delete this.players[id];
    delete this.spectators[id];
    if (Object.keys(this.players).length == 0 && this.during_match) this.endMatch();
};
GameEngine.prototype.toggleReady = function (playerID) {
    var player = this.players[playerID];
    if (!player) return;
    if (this.during_match) return false;
    player.isReady = !player.isReady;
    if (IS_SERVER) ioGame.emit('player_ready', {id: playerID, isReady: player.isReady});
    return true;
};
GameEngine.prototype.setReady = function (playerID, isReady) {
    var player = this.players[playerID];
    if (!player) return;
    player.isReady = isReady;
    if (!IS_SERVER) interface.notification(player.displayName + " " + STRINGS[CFG.LANG].GAMEPLAY.READY[isReady]);
};
GameEngine.prototype.addEntity = function (entity) {
    // Re-added before the next update purged it (a player re-joining right after endMatch,
    // or on a client whose hidden tab paused update()): cancel the purge, otherwise it
    // would erase the fresh players/entityIndex entries and leave a frozen copy behind.
    var pending = entity._killed ? this._killedEnt.indexOf(entity) : -1;
    if (pending !== -1) this._killedEnt.splice(pending, 1);
    entity._killed = false;
    entity._markToKill = false;
    entity.setup(this);
    if (pending === -1) this.entities.push(entity);
    this.entityIndex[entity.id] = entity;
    if (entity.group) this[entity.group][entity.id] = entity;
    return entity;
};
GameEngine.prototype.halt = function () {
    var $self = this;
    this.run = false;
    physicsEngine = new PhysicsEngine();
    setTimeout(function () {
        $self = null;
    }, 0);
};
/**
 * Server: consume exactly one queued input per player per tick. Clients run the same
 * fixed tick, so input N produces the same movement on both sides and the client can
 * compare its predicted position for N against the authoritative one.
 */
GameEngine.prototype.processInputs = function () {
    for (var p in this.players) {
        var player = this.players[p];
        var queue = player.inputQueue;
        if (queue.length > CFG.NET.MAX_INPUT_QUEUE) {
            // Client is ahead (clock drift or burst after a stall). Keep latency bounded
            // but never lose one-shot actions that were in the dropped inputs.
            var dropped = queue.splice(0, queue.length - CFG.NET.INPUT_QUEUE_TARGET);
            for (var i = 0; i < dropped.length; i++) {
                if (dropped[i].jump) queue[0].jump = true;
                if (dropped[i].switch_weapon && !queue[0].switch_weapon) queue[0].switch_weapon = dropped[i].switch_weapon;
            }
        }
        var input = queue.shift();
        if (input) {
            player.applyInput(input, Date.now());
            player.lastSeq = input.seq;
        } else {
            // Starved (packet late/lost): keep doing what the player was doing.
            player.applyInput(Player.continuousInput(player.input), Date.now());
        }
    }
};
GameEngine.prototype.queueInput = function (playerID, input) {
    var p = this.players[playerID];
    if (!p) return;
    input = Player.sanitizeInput(input, p);
    if (!input) return;
    if (p.lastQueuedSeq != null && input.seq <= p.lastQueuedSeq) return;
    p.lastQueuedSeq = input.seq;
    p.inputQueue.push(input);
};
/**
 * Client: authoritative snapshot from the server.
 * - local player: reconcile prediction against the server state for the last acked input
 * - remote players / items: buffered and interpolated in interpolateRemote()
 */
GameEngine.prototype.sync = function (data) {
    var localNow = Date.now();
    var offsetSample = data.t - localNow;
    // The least-delayed packet gives the best clock offset estimate; drift down slowly.
    if (this.clockOffset === null || offsetSample > this.clockOffset) this.clockOffset = offsetSample;
    else this.clockOffset += (offsetSample - this.clockOffset) * 0.01;

    this.snapshots.push(data);
    if (this.snapshots.length > 40) this.snapshots.shift();

    var weaponNames = CFG.WEAPONS;
    for (var p in data.players) {
        var player = this.players[p];
        var sp = data.players[p];
        if (!player || !player.physBody) continue;

        var prevHealth = player.health;
        player.health = sp.h;
        player.maxHealth = sp.mh;
        player.killsPerMatch = sp.k;
        player.deathsPerMatch = sp.d;
        player.isDeadH = sp.dead;
        player.isReady = sp.rdy;
        if (!IS_SERVER && sp.h < prevHealth && prevHealth > 0) player.onDamaged(prevHealth - sp.h);

        if (p == this.local_player) {
            this.reconcile(player, sp);
            if (!player.input.fire) {
                for (var w = 0; w < weaponNames.length; w++)
                    if (player.weapons[weaponNames[w]]) player.weapons[weaponNames[w]].ammunition = sp.am[w];
            }
            if (sp.s >= player.lastSwitchSeq && player.activeWeapon != sp.w) player.activeWeapon = sp.w;
        } else {
            for (var w = 0; w < weaponNames.length; w++)
                if (player.weapons[weaponNames[w]]) player.weapons[weaponNames[w]].ammunition = sp.am[w];
            if (player.activeWeapon != sp.w) player.switchWeapon(sp.w);
            if (sp.air && !player.isInAir) player.jumpTick = this.tick;
            player.isInAir = sp.air;
        }
    }
    for (var c in data.collectables) {
        var item = this.collectables[c];
        if (!item || !item.physBody) continue;
        var sc = data.collectables[c];
        var ip = item.physBody.GetPosition();
        if (Math.abs(ip.x - sc[0]) + Math.abs(ip.y - sc[1]) > 0.05)
            item.physBody.SetPositionAndAngle(new Vec2(sc[0], sc[1]), sc[2]);
    }
};
GameEngine.prototype.reconcile = function (player, sp) {
    var history = this.predictionHistory;
    while (history.length && history[0].seq < sp.s) history.shift();
    var body = player.physBody;
    var cur = body.GetPosition();
    var ex, ey;
    if (history.length && history[0].seq == sp.s) {
        ex = sp.p[0] - history[0].x;
        ey = sp.p[1] - history[0].y;
    } else {
        // Nothing to compare against (dead, just joined, respawned): compare directly.
        ex = sp.p[0] - cur.x;
        ey = sp.p[1] - cur.y;
        if (Math.sqrt(ex * ex + ey * ey) < CFG.NET.SNAP_DISTANCE) return;
    }
    var err = Math.sqrt(ex * ex + ey * ey);
    if (err < CFG.NET.MIN_CORRECTION) return;
    if (err > CFG.NET.SNAP_DISTANCE) {
        body.SetPosition(new Vec2(sp.p[0], sp.p[1]));
        player.position = body.GetPosition();
        if (player.snapPrev) player.snapPrev();
        this.predictionHistory = [];
        this.visualError.x = this.visualError.y = 0;
        return;
    }
    // Shift the simulation onto the authoritative path, but keep the picture where it
    // was and bleed the difference off over a few frames (no visible rubber-banding).
    body.SetPosition(new Vec2(cur.x + ex, cur.y + ey));
    player.position = body.GetPosition();
    for (var i = 0; i < history.length; i++) {
        history[i].x += ex;
        history[i].y += ey;
    }
    this.visualError.x -= ex;
    this.visualError.y -= ey;
    if (player._prev) {
        player._prev.x += ex;
        player._prev.y += ey;
    }
};
GameEngine.prototype.recordPrediction = function () {
    var lp = this.players[this.local_player];
    if (!lp || !lp.physBody || lp.lastSentSeq == null) return;
    var pos = lp.physBody.GetPosition();
    this.predictionHistory.push({seq: lp.lastSentSeq, x: pos.x, y: pos.y});
    if (this.predictionHistory.length > 120) this.predictionHistory.shift();
};
GameEngine.prototype.interpolateRemote = function () {
    var snaps = this.snapshots;
    if (!snaps.length || this.clockOffset === null) return;
    var renderTime = Date.now() + this.clockOffset - CFG.NET.INTERP_DELAY;
    var a = snaps[0], b = null;
    for (var i = snaps.length - 1; i >= 0; i--) {
        if (snaps[i].t <= renderTime) {
            a = snaps[i];
            b = snaps[i + 1] || null;
            break;
        }
    }
    var t = b ? (renderTime - a.t) / (b.t - a.t) : 0;
    for (var p in this.players) {
        if (p == this.local_player) continue;
        var player = this.players[p];
        if (!player.physBody) continue;
        var sa = a.players[p];
        if (!sa) continue;
        var sb = b && b.players[p] ? b.players[p] : sa;
        // Teleports (respawn) are not interpolated across.
        var dx = sb.p[0] - sa.p[0], dy = sb.p[1] - sa.p[1];
        var tt = dx * dx + dy * dy > CFG.NET.SNAP_DISTANCE * CFG.NET.SNAP_DISTANCE ? 1 : t;
        player.applyRemoteState({
            x: sa.p[0] + dx * tt,
            y: sa.p[1] + dy * tt,
            lookAngle: _lerpAngle(sa.la, sb.la, tt),
            angle: _lerpAngle(sa.a, sb.a, tt),
            input: sb.in
        });
    }
};
GameEngine.prototype.getEntityById = function (id) {
    return this.entityIndex[id] || null;
};
GameEngine.prototype.recordInput = function () {
    var lp = this.players[this.local_player];
    if (!lp) {
        var camSpeed = 0.25;
        if (INPUT.CAMERA_UP)
            CAMERA_CENTER.y -= camSpeed;
        if (INPUT.CAMERA_DOWN)
            CAMERA_CENTER.y += camSpeed;
        if (INPUT.CAMERA_LEFT)
            CAMERA_CENTER.x -= camSpeed;
        if (INPUT.CAMERA_RIGHT)
            CAMERA_CENTER.x += camSpeed;
    } else {
        if (INPUT.PAUSE)
            gui.show('PAUSE');
        else
            gui.hide('PAUSE');
    }

    if (INPUT.READY) {
        if (lp && this.during_match) interface.notification(STRINGS[CFG.LANG].GAMEPLAY.READY.during_match);
        else if (lp) SOCKET.emit('player_ready');
    }

    if (!lp) {
        this.clearInput();
        return;
    }

    var pInput = {
        seq: ++this.inputSeq,
        x: 0,
        y: 0,
        isWalking: false,
        fire: false,
        jump: false,
        aim: {x: 0, y: 0},
        switch_weapon: false
    };

    var move_dir = new Vec2(0, 0);

    if (INPUT.UP)
        move_dir.y -= 1;
    if (INPUT.DOWN)
        move_dir.y += 1;
    if (INPUT.LEFT)
        move_dir.x -= 1;
    if (INPUT.RIGHT)
        move_dir.x += 1;
    if (move_dir.LengthSquared()) {
        pInput.isWalking = true;
        move_dir.Normalize();
        pInput.x += move_dir.x;
        pInput.y += move_dir.y;
    }

    pInput.jump = !!INPUT.JUMP;
    pInput.switch_weapon = INPUT.SWITCH_ROCKET ? 'RocketLuncher' :
        INPUT.SWITCH_CURVE ? 'CurveGun' :
            INPUT.SWITCH_BOW ? 'Bow' :
                INPUT.SWITCH_MACHINE ? 'MachineGun' :
                    INPUT.SWITCH_LIGHT ? 'LightGun' :
                        INPUT.SWITCH_SPAS ? 'Spas' : !!INPUT.SWITCH_WEAPON;
    pInput.fire = !!INPUT.FIRE;
    // Aim is sent as a world-space point so every machine fires in the same direction,
    // independent of each client's camera.
    pInput.aim = {
        x: (mouseX - CAMERA_POS.x) / SCALE,
        y: (mouseY - CAMERA_POS.y) / SCALE
    };

    this.clearInput();
    SOCKET.emit('player_input', pInput);
    if (pInput.switch_weapon) lp.lastSwitchSeq = pInput.seq;
    lp.lastSentSeq = pInput.seq;
    lp.applyInput(pInput, Date.now());
};
GameEngine.prototype.clearInput = function () {
    INPUT.SWITCH_ROCKET = false;
    INPUT.SWITCH_CURVE = false;
    INPUT.SWITCH_BOW = false;
    INPUT.SWITCH_MACHINE = false;
    INPUT.SWITCH_LIGHT = false;
    INPUT.SWITCH_SPAS = false;
    INPUT.SWITCH_WEAPON = false;
    INPUT.READY = false;
    INPUT.JUMP = false;
};
GameEngine.prototype.removeEntity = function (ent) {
    if (!ent || ent._killed) return;
    ent._killed = true;
    this._killedEnt.push(ent);
};
GameEngine.prototype.onCollision = function (a, b) {

    var entA = this.getEntityById(a.id);
    var entB = this.getEntityById(b.id);

    if (entA && entA.colide) {
        if (entB && entB.physBody) entA.colide(entB);
    }
    if (entB && entB.colide) {
        if (entA && entA.physBody) entB.colide(entA);
    }

};
GameEngine.prototype.collectItem = function (entID, itemID) {
    if (!IS_SERVER) return;
    var item = this.getEntityById(itemID);
    var player = this.getEntityById(entID);
    if (!item || !player || item._markToKill) return;
    item.collect(player);
    if (!item._markToKill) return;
    ioGame.emit('item_collected', {item: itemID, player: entID});
    this._itemRespawns.push({itemClass: item.class, weapon: item.weapon || null, delay: CFG.ITEM_RESPAWN_TIME});
};
GameEngine.prototype.onItemCollected = function (itemID, playerID) {
    var item = this.getEntityById(itemID);
    var player = this.getEntityById(playerID);
    if (!item) return;
    if (player) item.collect(player);
    item._markToKill = true;
    if (!IS_SERVER) particles.pickup(item.position.x, item.position.y, item.glowColor);
};
GameEngine.prototype.dealDamage = function (entID, damage, attackerID) {
    if (!IS_SERVER) return;
    var ent = this.getEntityById(entID);
    if (!ent || ent.health == null) return;
    var wasAlive = ent.health > 0;
    ent.health -= Math.floor(damage);
    if (ent.isPlayer && wasAlive && ent.health <= 0) {
        ent.deathsPerMatch++;
        var attacker = this.getEntityById(attackerID);
        if (attacker && attacker !== ent) attacker.killsPerMatch++;
        ioGame.emit('player_death', {id: ent.id, killer: attacker ? attacker.id : null});
    }
};
GameEngine.prototype._simply = function () {
    var game = {
        id: this.id,
        name: this.name,
        mode: this.mode,
        host: this.host,
        max_players: this.max_players,
        map_index: this.map_index,
        round_time: this.round_time,
        server_time: Date.now(),
        during_match: this.during_match,
        currentRound: this.currentRound,
        rounds: this.rounds,
        run: this.run,
        fps: this.fps,
        mspf: this.mspf,
        tick: this.tick,
        last_tick: this.last_tick,
        entities: [],
        players: {},
        collectables: {},
        spectators: {}
    };
    this.entities.forEach(function (entity) {
        var sEntity = entity._simply();
        if (sEntity && sEntity.type != 'static') game.entities.push(sEntity);
    });
    for (var s in this.spectators) game.spectators[s] = this.spectators[s]._simply();
    for (var c in this.collectables) game.collectables[c] = this.collectables[c]._simply();
    for (var p in this.players) game.players[p] = this.players[p]._simply();
    return game;
};
/**
 * Compact per-tick state broadcast to clients (the full _simply() state is only sent once
 * on connect). Roughly 10x smaller than the old full-state sync.
 */
GameEngine.prototype._snapshot = function () {
    var snap = {t: Date.now(), tick: this.tick, players: {}, collectables: {}};
    for (var p in this.players) snap.players[p] = this.players[p]._snapshot();
    for (var c in this.collectables) {
        var item = this.collectables[c];
        if (!item.physBody) continue;
        snap.collectables[c] = [_round(item.position.x), _round(item.position.y), _round(item.angle)];
    }
    return snap;
};
