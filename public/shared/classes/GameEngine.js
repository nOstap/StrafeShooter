function GameEngine(setup) {
    this.id = setup.id || null;
    this.local_player = null;
    this.name = setup.game_name || null;
    this.host = setup.host || null;
    this.mode = setup.game_mode || 0;
    this.map_index = setup.game_map || 0;
    this.map = null;
    this.during_match = setup.during_match || false;
    this.round_time = setup.game_round_time || 15;
    this.snap_entities = {};
    this.max_players = setup.game_max_players;
    this.rounds = setup.rounds || 1;
    this.entities = [];
    this.players = {};
    this.last_tick = Date.now();
    this.mspf = 0;
    this.delta = 0;
    this.fps = 0;
    this.frame_count = 0;
    this.run = false;
    this.spectators = {};
    this._spawnDefer = [];
    this._killedEnt = [];
}

GameEngine.prototype.setup = function (data) {
    physicsEngine.addContactListener({
        PostSolve: function (a, b, engine) {
            if (IS_SERVER) return;
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

            if ((colType === CFG.COLLISION_GROUPS.BULLET | CFG.COLLISION_GROUPS.PLAYER) ||
                (colType === CFG.COLLISION_GROUPS.BULLET | CFG.COLLISION_GROUPS.OBSTACLE) ||
                (colType === CFG.COLLISION_GROUPS.ITEM | CFG.COLLISION_GROUPS.PLAYER)) {
                if (engine.local_player == uDataA.id) return;
            }
            engine.onCollision(uDataA, uDataB);
        }
    }, this);
    this.loadMap();
    if (!IS_SERVER) {
        this.local_player = SOCKET.id;
        for (var i = 0; i < data.entities.length; i++) {
            var entDef = data.entities[i];
            var ent = new global[entDef.class](entDef);
            if (ent.isPlayer)
                this.addPlayer(ent);
            else
                this.addEntity(ent);
        }
        for (var s in data.spectators) {
            var p = new Player(data.spectators[s]);
            gameEngine.addSpectator(p);
        }
        gui.setPlayerList(this);
        renderEngine.setup();
    }
    physicsEngine.setup();
    this.run = true;
};
GameEngine.prototype.update = function () {
    if (!this.run) return;
    this.frame_count++;
    this.mspf = (Date.now() - this.last_tick);
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
    }
    this._killedEnt = [];

    var sdl = this._spawnDefer.length;
    for (var i = 0; i < sdl; i++) {
        var spawn = this._spawnDefer[i];
        if(spawn)
        if (Date.now() - spawn.startTime >= spawn.delay) {
            var entity;
            if(spawn.entDef) {
                entity = new global[spawn.entDef.class](spawn.entDef);
                this.addEntity(entity);
            } else {
                entity = this.getEntityById(spawn.entityID);
                entity.health = entity.maxHealth;
            }
            if (entity.physBody) {
                entity.position = spawn.position;
                entity.physBody.SetPosition(spawn.position);
            }
            entity._spawned = true;
            SoundManager.worldPlay('SFX.EFFECTS.RESPAWN', spawn.position);
            _earse(this._spawnDefer, spawn);
        }
    }

    if (!this.during_match) {
        var playersReady = false;
        for (var player in this.players) {
            if (this.players[player].isReady) {
                playersReady = true;
            } else {
                playersReady = false;
                break;
            }

        }
        if (playersReady) this.startMatch();
    } else {
        if(Date.now()-this.during_match >= this.round_time*1000) {
            this.during_match = false;
        }
    }
    physicsEngine.update(this.fps);
    SoundManager.update();
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
    if(IS_SERVER) {
        var cratespawns = _findByKey(this.map.layers, 'properties.type', 'CrateSpawn');
        for (var index in cratespawns)
            for (var i = 0; i < cratespawns[index].objects.length; i++) {
                var obj = cratespawns[index].objects[i];
                var setup = {
                    type: 'dynamic',
                    position: new Vec2(),
                    weapon: obj.type || null
                };
                var ent = new global[cratespawns[index].name.replace('Spawns', '')](setup);
                this.addEntity(ent);
                this.spawn(ent.id, 5000, null, ent._simply());
            }
    }
    for (var player in this.players) {
        this.players[player].reset();
        this.spawn(this.players[player].id, CFG.PLAYER.SPAWN_TIME);
    }
    this.during_match = Date.now();

};
GameEngine.prototype.joinMatch = function (id) {
    var player = this.spectators[id];
    if (!player.isSpectator) return;
    player.isSpectator = false;
    this.addPlayer(player);
    if (IS_SERVER && this.mode === CFG.GAME_MODES.FFA) this.spawn(player.id, CFG.PLAYER.SPAWN_TIME);
    delete this.spectators[id];
};
GameEngine.prototype.addSpectator = function (s) {
    this.spectators[s.id] = s;
};
GameEngine.prototype.addPlayer = function (p) {
    var pg = this.addEntity(p);
    this.players[pg.id] = pg;
};
GameEngine.prototype.spawn = function (entityID, delay, team, entDef) {
    if(!IS_SERVER) return;
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
    delete this.spectators[id];
    delete this.players[id];
};
GameEngine.prototype.addEntity = function (entity) {
    entity.setup(this);
    this.entities.push(entity);
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
    // for (var i = 0; i < data.entities.length; i++) {
    //     var snap = data.entities[i];
    //     if (this.snap_entities[snap.id]) {
    //         this.snap_entities[snap.id].physBody.SetPosition(snap.position);
    //         this.snap_entities[snap.id].physBody.SetAngle(snap.angle);
    //         this.snap_entities[snap.id].position = snap.position;
    //         this.snap_entities[snap.id].angle = snap.angle;
    //     } else {
    //         var ent = new global[snap.class](snap);
    //         ent.setup(this);
    //         ent.physBody.SetActive(false);
    //         this.snap_entities[ent.id] = ent;
    //     }
    //     if (snap.isPlayer) {
    //         var lp = this.players[snap.id];
    //         if (lp.id != this.local_player) lp.applyInput(snap.input, data.delta);
    //         lp.physBody.SetPosition(snap.position);
    //         lp.physBody.SetAngle(snap.angle);
    //         lp.position = snap.position;
    //         lp.angle = snap.angle;
    //     }
    //     snap = null;
    // }
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
    if (!IS_SERVER) return;
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
    console.log('asd');
    var item = this.getEntityById(itemID);
    if (IS_SERVER) {
        item.collect(this.getEntityById(entID));
    } else {
        SoundManager.worldPlay(item.sfx, item.position, 1);
        SOCKET.emit('collect_item', entID, itemID);
    }
};
GameEngine.prototype.dealDamage = function (entID, damage) {
    if (IS_SERVER) {
        this.getEntityById(entID).health -= 100;
    } else {
        SOCKET.emit('deal_damage', entID, damage);
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
        rounds: this.rounds,
        run: this.run,
        fps: this.fps,
        mspf: this.mspf,
        delta: this.delta,
        last_tick: this.last_tick,
        entities: [],
        players: {},
        spectators: {}
    };
    this.entities.forEach(function (entity) {
        var sEntity = entity._simply();
        if (sEntity && sEntity.type != 'static') game.entities.push(sEntity);
    });
    for (var s in this.spectators) game.spectators[s] = this.spectators[s]._simply();
    for (var p in this.players) game.players[p] = this.players[p]._simply();
    return game;
};