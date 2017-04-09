function GameEngine(setup) {
    this.id = setup.id || null;
    this.local_player = null;
    this.name = setup.name || null;
    this.host = setup.host || null;
    this.mode = setup.mode || 0;
    this.server_time = setup.server_time || Date.now();
    this.map_index = setup.map_index || 0;
    this.map = null;
    this.during_match = setup.during_match || false;
    this.round_time = setup.round_time || 15;
    this.currentRound = setup.currentRound || 0;
    this.max_players = setup.max_players;
    this.rounds = setup.rounds || 1;
    this.entities = [];
    this.players = {};
    this.spectators = {};
    this.collectables = {};
    this.during_round = false;
    this.last_tick = Date.now();
    this.mspf = 0;
    this.delta = 0;
    this.fps = 0;
    this.frame_count = 0;
    this.run = false;
    this._spawnDefer = [];
    this._killedEnt = [];
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
GameEngine.prototype.update = function () {
    if (!this.run) return;
    if (IS_SERVER) this.server_time = Date.now();
    this.frame_count++;
    this.mspf = Date.now() - this.last_tick;
    this.fps = 1000 / this.mspf;
    this.delta = 1 / this.fps;
    if (this.delta > 0.25) this.delta = 0.25;
    this.last_tick = Date.now();

    var el = this.entities.length;
    for (var i = 0; i < el; i++) {
        var ent = this.entities[i];
        if (!ent._killed)
            this.entities[i].update();
    }

    var kel = this._killedEnt.length;
    for (var i = 0; i < kel; i++) {
        var ent = this._killedEnt[i];
        _earse(this.entities, ent);
        if (ent.group) delete this[ent.group][ent.id];
    }
    this._killedEnt = [];

    var sdl = this._spawnDefer.length;
    for (var i = 0; i < sdl; i++) {
        var spawn = this._spawnDefer[i];
        if (spawn) {
            if (Date.now() - spawn.startTime >= spawn.delay) {
                var entity;
                entity = this.getEntityById(spawn.entityID);
                if (!entity) {
                    entity = new global[spawn.entDef.class](spawn.entDef);
                    this.addEntity(entity);
                }
                entity._reset({
                    position: spawn.position,
                    _spawned: true,
                    isDeadH: false
                });
                SoundManager.worldPlay('SFX.EFFECTS.RESPAWN', spawn.position);
                if(!IS_SERVER) {
                    console.log(ANIMATIONS.EFFECTS.TP);
                    ANIMATIONS.EFFECTS.TP.play(new Vec2(spawn.position.x, spawn.position.y));
                }
                _earse(this._spawnDefer, spawn);
            }
        }
    }
    var flags = this.setFlags();
    if (!this.during_match) {
        if (flags.ready) this.startMatch();
    } else {
        if (IS_SERVER) {
            if (Date.now() - this.during_match > this.round_time * 1000 * 60 ||
                flags.roundWin || flags.allDie)
                this.nextRound();
        }
    }
    physicsEngine.update(this.fps);
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
GameEngine.prototype.nextRound = function () {
    if (IS_SERVER) ioGame.emit('next_round');
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

    for (var i = 0; i < seawalls.objects.length; i++) {
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
    for (var i = 0; i < walls.objects.length; i++) {
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
    this.during_match = false;
    this.currentRound = 0;
    this.clearMap();
    for (var p in this.players) {
        var player = this.players[p];
        player._reset({position: player.position, isSpectator: true, isReady: false});
        this.spectators[p] = player;
    }
    this.players = {};
    //TODO NOT SPEC JUST SHOW STATS AND MAP QUIZ
    if (!IS_SERVER) gui.show('SPECTATE');
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
    var cratespawns = _findByKey(this.map.layers, 'properties.type', 'CrateSpawn');
    for (var index in cratespawns) {
        for (var i = 0; i < cratespawns[index].objects.length; i++) {
            var obj = cratespawns[index].objects[i];
            var setup = {
                id: index + _guid(),
                type: 'dynamic',
                position: new Vec2(),
                weapon: obj.type || null
            };
            var ent = new global[cratespawns[index].name.replace('Spawns', '')](setup);
            this.addEntity(ent);
            this.spawn(ent.id, 5000, null, ent._simply());
        }
    }
};
GameEngine.prototype.joinMatch = function (id) {
    var player = this.spectators[id];
    if (!player.isSpectator) return;
    player.isSpectator = false;
    this.addEntity(player);
    delete this.spectators[id];
    if (IS_SERVER)
        ioGame.emit('player_joined_match', player._simply());
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
    var spawn = _superRandom(spawns.objects);
    spawn.delay = delay;
    spawn.entityID = entityID;
    spawn.team = team;
    spawn.startTime = Date.now();
    spawn.position = new Vec2((spawn.x + _superRandom(spawn.width)) / SCALE, (spawn.y + _superRandom(spawn.height)) / SCALE);
    this._spawnDefer.push(spawn);
    spawn.entDef = entDef || null;
    ioGame.emit('spawn_defer', this._spawnDefer);
};
GameEngine.prototype.removePlayer = function (id) {
    var p = this.players[id] || this.spectators[id];
    if (!p.isSpectator) {
        this.removeEntity(p);
    }
    delete this.players[id];
    delete this.spectators[id];
    if (Object.keys(this.players).length == 0) this.endMatch();
};
GameEngine.prototype.toggleReady = function (playerID) {
    if (this.during_match) {
        if (!IS_SERVER)
            interface.notification(STRINGS[CFG.LANG].GAMEPLAY.READY.during_match);
        return;
    }
    this.players[playerID].isReady = !this.players[playerID].isReady;
    if (!IS_SERVER) interface.notification(this.players[playerID].displayName + " " + STRINGS[CFG.LANG].GAMEPLAY.READY[this.players[playerID].isReady]);
};
GameEngine.prototype.addEntity = function (entity) {
    entity.setup(this);
    this.entities.push(entity);
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
GameEngine.prototype.sync = function (data) {
    var snap_players = data.players;
    var snap_collectables = data.collectables;
    for (var p in snap_players) {
        if (!this.players[p]) continue;
        if (!this.players[p].physBody) continue;
        this.players[p].physBody.SetPositionAndAngle(snap_players[p].position, snap_players[p].lookAngle);
        this.players[p].position = this.players[p].physBody.GetPosition();
        this.players[p].angle = snap_players[p].angle;
        this.players[p].health = snap_players[p].health;
        this.players[p].killsPerMatch = snap_players[p].killsPerMatch;
        this.players[p].deathsPerMatch = snap_players[p].deathsPerMatch;
        this.players[p].activeWeapon = snap_players[p].activeWeapon;
        if (snap_players[p].id != this.local_player)
            this.players[p].applyInput(snap_players[p].input, Date.now());
    }
    for (var c in snap_collectables) {
        if (!this.collectables[c]) continue;
        if (!this.collectables[c].physBody) continue;
        this.collectables[c].physBody.SetPositionAndAngle(snap_collectables[c].position, snap_collectables[c].angle);
    }
};
GameEngine.prototype.getEntityById = function (id) {
    for (var i = 0; i < this.entities.length; i++) {
        var ent = this.entities[i];
        if (ent.id == id) return ent;
    }
    return null;
};
GameEngine.prototype.recordInput = function () {
    var lp = this.players[this.local_player];
    if (!lp) {
        if (INPUT.CAMERA_UP)
            CAMERA_CENTER.y -= 1;
        if (INPUT.CAMERA_DOWN)
            CAMERA_CENTER.y += 1;
        if (INPUT.CAMERA_LEFT)
            CAMERA_CENTER.x -= 1;
        if (INPUT.CAMERA_RIGHT)
            CAMERA_CENTER.x += 1;
    } else {
        if (INPUT.PAUSE)
            gui.show('PAUSE');
        else
            gui.hide('PAUSE');
    }

    if (!lp) return;

    var pInput = {
        x: 0,
        y: 0,
        isWalking: false,
        fire: false,
        camera: new Vec2(0, 0),
        scale: SCALE,
        jump: false,
        ready: false,
        pointer: new Vec2(0, 0),
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
    } else {
        pInput.isWalking = false;
        pInput.x = 0;
        pInput.y = 0;
    }

    pInput.jump = INPUT.JUMP;
    pInput.ready = INPUT.READY;
    pInput.switch_weapon = INPUT.SWITCH_ROCKET ? 'RocketLuncher' :
        pInput.switch_weapon = INPUT.SWITCH_CURVE ? 'CurveGun' :
            pInput.switch_weapon = INPUT.SWITCH_BOW ? 'Bow' :
                pInput.switch_weapon = INPUT.SWITCH_MACHINE ? 'MachineGun' :
                    pInput.switch_weapon = INPUT.SWITCH_LIGHT ? 'LightGun' :
                        pInput.switch_weapon = INPUT.SWITCH_SPAS ? 'Spas' : INPUT.SWITCH_WEAPON;
    pInput.fire = INPUT.FIRE;
    pInput.pointer = new Vec2(mouseX / SCALE, mouseY / SCALE);
    pInput.camera = new Vec2(CAMERA_POS.x / SCALE, CAMERA_POS.y / SCALE);

    this.clearInput();
    if (JSON.stringify(lp.input) != JSON.stringify(pInput) || pInput.fire)
        SOCKET.emit('player_input', {gameID: this.id, player: lp._simply(), input: pInput});
    CAMERA_CENTER = lp.position;
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
GameEngine.prototype.applyPlayerInput = function (playerID, input, time) {
    var p = this.players[playerID];
    if (!p) return;
    p.applyInput(input, time);
};
GameEngine.prototype.removeEntity = function (ent) {
    if (!ent) return;
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
    var item = this.getEntityById(itemID);
    item.collect(this.getEntityById(entID));
};
GameEngine.prototype.dealDamage = function (entID, damage) {
    if (!IS_SERVER) return;
    this.getEntityById(entID).health -= Math.floor(damage);
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
        delta: this.delta,
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