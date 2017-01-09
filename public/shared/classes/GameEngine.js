function GameEngine(setup) {
    this.id = setup.id || null;
    this.local_player = null;
    this.name = setup.game_name || null;
    this.owner = setup.owner || null;
    this.mode = setup.game_mode || 0;
    this.map_index = setup.game_map || 0;
    this.map = null;
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
    this._spawnBuffer = [];
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
            if (colType == (CFG.COLLISION_GROUPS.PLAYER | CFG.COLLISION_GROUPS.WALL))
                return;
            if (colType == (CFG.COLLISION_GROUPS.PLAYER | CFG.COLLISION_GROUPS.PLAYER))
                return;
            engine.onCollision(uDataA, uDataB);
        }
    }, this);

    this.loadMap();
    if (IS_SERVER) {
        // CREATE INIT ENTITIES
    } else {
        this.local_player = SOCKET.id;
        for (var i = 0; i < data.entities.length; i++) {
            var entDef = data.entities[i];
            var ent = new global[entDef.constructor.name](entDef);
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

    for (var i = 0; i < this.entities.length; i++) {
        var ent = this.entities[i];
        if (!ent._killed && ent._spawned)
            this.entities[i].update();
    }

    for (var i = 0; i < this._spawnBuffer.length; i++) {
        var spawn = this._spawnBuffer[i];
        if (Date.now() - spawn.startTime >= spawn.delay) {
            var entity = this.getEntityById(spawn.entityID);
            entity.physBody.SetActive(true);
            entity.health = entity.maxHealth;
            if (entity.physBody)
                entity.physBody.SetPosition(spawn.position);
            entity._spawned = true;
            SoundManager.worldPlay('SFX.EFFECTS.RESPAWN', spawn.position);
            _earse(this._spawnBuffer, spawn);
        }
    }

    for (var i = 0; i < this._killedEnt.length; i++) {
        var ent = this._killedEnt[i];
        _earse(this.entities, ent);
    }

    this._killedEnt = [];
    physicsEngine.update(this.fps);
    SoundManager.update();
};
GameEngine.prototype.render = function () {
    if (IS_SERVER) return;
    renderEngine.render(this.entities, CFG.DEBUG);
};
GameEngine.prototype.loadMap = function () {
    if (!IS_SERVER)
        this.map = pre_loaded_maps[this.map_index];

    CFG.MAP_WIDTH = this.map.width;
    CFG.MAP_HEIGHT = this.map.height;
    CFG.TILE_HEIGHT = this.map.tileheight;
    CFG.TILE_WIDTH = this.map.tilewidth;

    var wall = findByKey(this.map.layers, 'name', 'SeaWalls');
    for (var i = 0; i < wall.objects.length; i++) {
        var obj = wall.objects[i];
        var setup = {
            type: 'static',
            position: new Vec2((obj.x + obj.width * 0.5) / SCALE, (obj.y + obj.height * 0.5) / SCALE),
            halfWidth: obj.width * 0.5 / SCALE,
            halfHeight: obj.height * 0.5 / SCALE,
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

};
GameEngine.prototype.joinMatch = function (id, player_info) {

    var player = this.spectators[id];
    if (!player.isSpectator) return;
    player.isSpectator = false;
    delete this.spectators[id];

    this.addPlayer(player);
    this.spawn(player.id, CFG.PLAYER.SPAWN_TIME);
    player = null;
};

GameEngine.prototype.addSpectator = function (s) {
    this.spectators[s.id] = s;
};
GameEngine.prototype.addPlayer = function (p) {
    var pg = this.addEntity(p);
    this.players[pg.id] = pg;
};

GameEngine.prototype.spawn = function (entityID, delay, team) {
    if(IS_SERVER) return;
    var info = {};
    info.delay = delay;
    info.team = team;
    info.startTime = Date.now();
    info.entityID = entityID;
    info.gameID = this.id;
    SOCKET.emit('spawn', info);
};
GameEngine.prototype.removePlayer = function (id) {
    var p = this.players[id] || this.spectators[id];
    if (p && p.physBody)
        p._markToKill = true;
    else {
        delete this.spectators[id];
        delete this.players[id];
    }
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
    for (var i = 0; i < data.entities.length; i++) {
        var snap = data.entities[i];
        if (this.snap_entities[snap.id]) {
            this.snap_entities[snap.id].physBody.SetPosition(snap.position);
            this.snap_entities[snap.id].physBody.SetAngle(snap.angle);
        } else {
            var ent = new global[snap.class](snap);
            ent.setup(this);
            ent.physBody.SetActive(false);
            this.snap_entities[ent.id] = ent;
        }
        if (snap.isPlayer) {
            var lp = this.players[snap.id];
            if(lp.id != this.local_player) lp.applyInput(snap.input, data.delta);
            lp.input.fire = snap.input.fire;
            lp.physBody.SetPosition(snap.position);
            lp.physBody.SetAngle(snap.angle);
        }
        snap = null;
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

    if (!IS_SERVER) {
        if(INPUT.PAUSE)
            gui.show('PAUSE');
        else
            gui.hide('PAUSE');
        if (INPUT.CAMERA_UP)
            CAMERA_CENTER.y -= 1;
        if (INPUT.CAMERA_DOWN)
            CAMERA_CENTER.y += 1;
        if (INPUT.CAMERA_LEFT)
            CAMERA_CENTER.x -= 1;
        if (INPUT.CAMERA_RIGHT)
            CAMERA_CENTER.x += 1;
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
    INPUT.JUMP = false;
};
GameEngine.prototype.applyPlayerInput = function (playerID, input, time) {
    if (IS_SERVER) {
        var p = this.players[playerID];
        if (!p) return;
        p.applyInput(input, time);
    }
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
GameEngine.prototype._simply = function () {
    var game = {
        id: this.id,
        name: this.name,
        owner: this.owner,
        mode: this.mode,
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