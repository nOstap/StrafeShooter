const HALF_PI = Math.PI * 0.5;
const QUATER_PI = Math.PI * 0.25;
const TWO_PI = Math.PI * 2;
const PI = Math.PI;
const srcore = {
    seeded: false,
    m: 4294967296,
    a: 1664525,
    c: 1013904223,
    seed: null,
    z: null,
    setSeed: function (val) {
        srcore.z = srcore.seed = (val == null ? Math.random() * srcore.m : val) >>> 0;
        srcore.seeded = true;
    },
    getSeed: function () {
        return srcore.seed;
    },
    rands: function () {
        srcore.z = (srcore.a * srcore.z + srcore.c) % srcore.m;
        return srcore.z / srcore.m;
    }
};

_addJsContent = function (fileContent) {
    var elm = document.createElement('script');
    elm.innerHTML = fileContent;
    if (typeof elm !== 'undefined') {
        document.head.appendChild(elm);
    }
};
_next = function (db, key) {
    var keys = Object.keys(db)
        , i = keys.indexOf(key);
    return i !== -1 && keys[i + 1] && db[keys[i + 1]];
};
_guid = function () {
    var S4 = function () {
        return (((1 + Math.random()) * 0x1000000) | 0).toString(16).substring(1);
    };
    return (S4()).toString();
};
_profile = function (f) {
    var start = Date.now();
    var out = f();
    console.log('Operation take ' + start - Date.now() + 'ms.');
    return out;
};
_earse = function (array, item) {
    index = array.indexOf(item);
    array.splice(index, 1);
    item = null;
    return true;
};

_superRandom = function (min, max) {
    this.rand = null;
    if (srcore.seeded) {
        this.rand = srcore.rands();
    } else {
        this.rand = Math.random();
    }
    if (typeof min === 'undefined') {
        return this.rand;
    } else if (typeof max === 'undefined') {
        if (min instanceof Array) {
            return min[Math.floor(this.rand * min.length)];
        } else {
            return this.rand * min;
        }
    } else {
        if (min > max) {
            var tmp = min;
            min = max;
            max = tmp;
        }

        return this.rand * (max - min) + min;
    }
};
_gameStatsCreate = function (game) {
    var stats = {
        id: game.id,
        spectators: Object.keys(game.spectators).length,
        players: Object.keys(game.players).length,
        mode: game.mode,
        name: game.name,
        host: game.host,
        time: Date.now()
    };
    return stats;
};
_getVal = function (f, callback) {
    return typeof f == 'function' ? f(callback) : f;
};
_sortByKey = function (array, key, direction) {
//TODO: direction ASC/DESC
    var tmpArray = [], indexObject = {};
    for (var i = 0; i < array.length; i++) {
        if (!indexObject[array[i][key]])
            indexObject[array[i][key]] = [];
        indexObject[array[i][key]].push(array[i]);
    }
    for (var index in indexObject) {
        tmpArray = tmpArray.concat(indexObject[index]);
    }
    return tmpArray;
};
_findByKey = function (array, key, value, forceArrayOut) {
    var out = [], tmp;
    key = key.split(".");
    for (var i = 0; i < array.length; i++) {
        tmp = array[i];
        if (tmp)
            for (var x = 0; x < key.length; x++) {
                if (typeof tmp == 'undefined') break;
                tmp = tmp[key[x]];
            }
        if (tmp == value) out.push(array[i]);
    }
    if (out.length > 1 || forceArrayOut) return out;
    else return out[0];
};
_setupSocket = function (server) {
    SOCKET = io.connect('http://' + server.host.host + ':' + server.host.port + '/game', {
        query: 'displayName=' + gui.game_settings.player_name +
        '&body=' + gui.game_settings.player_body +
        '&head=' + gui.game_settings.player_head
    });
    SOCKET.on('connected', function (data) {
        console.log('You\'r connected to game ' + data.id);
        gui.hide();
        gui.hideLoader();
        gui.setPlayerList(data);
        gui.show('SPECTATE');
        select('#game-name-header').html(data.name);
        gameEngine = new GameEngine(data);
        gameEngine.setup(data);
    });
    SOCKET.on('player_leaved', function (data) {
        console.log('Player ' + data + ' has left the game.');
        gameEngine.removePlayer(data);
        gui.setPlayerList(gameEngine);
        console.log(STRINGS[CFG.LANG].CONNECTION.DISCONECT);
    });
    SOCKET.on('player_joined_game', function (player_info) {
        console.log('New player joined to game ' + player_info.id);
        var spectator = new Player(player_info);
        gameEngine.addSpectator(spectator);
        gui.setPlayerList(gameEngine);
    });
    SOCKET.on('player_joined_match', function (player_info) {
        console.log(player_info.id + 'joined match!');
        gameEngine.joinMatch(player_info.id, player_info);
        gui.setPlayerList(gameEngine);
    });
    SOCKET.on('spawn_defer', function (data) {
        console.log('Spawn arrived!');
        for (var s in data) {
            data[s].startTime = Date.now();
        }
        gameEngine._spawnDefer = data;
    });
    SOCKET.on('player_death', function (id) {
       interface.notification('Player '+ gameEngine.players[id].displayName+' death!');
       gui.setPlayerList(gameEngine);
    });
    SOCKET.on('next_round', function () {
        gameEngine.nextRound();
    });
    SOCKET.on('server_time', function (data) {
        gameEngine.server_time = data;
    });
    SOCKET.on('sync_game', function (data) {
        gameEngine.sync(data);
    });
    SOCKET.on('connect_error', function () {
        console.log(STRINGS[CFG.LANG].CONNECTION.FILED);
        gui.hideLoader();
        gui.disable(GAME_STATES.HOME.buttons[0].id);
        gui.hide();
        if (gameEngine) gameEngine.halt();
        gui.show('CONNECTION_ERROR');
    });
};

String.prototype.toSkeleton = function () {
    var skeleton = this.replace(/([A-Z])/g, function ($1) {
        return "_" + $1.toLowerCase();
    });
    return skeleton.slice(1, skeleton.length);
};
Vec2.Rotate = function (vec, rad) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    if (!vec) return new Vec2(c, s);
    return new Vec2(c * vec.x - s * vec.y, s * vec.x + c * vec.y);
};
Vec2.prototype.Rotate = function (rad) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    var x = c * this.x - s * this.y;
    var y = s * this.x + c * this.y;
    this.x = x;
    this.y = y;
    return this;
};