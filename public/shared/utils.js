const HALF_PI = Math.PI * 0.5;
const QUATER_PI = Math.PI * 0.25;
const TWO_PI = Math.PI * 2;
const PI = Math.PI;

next = function (db, key) {
    var keys = Object.keys(db)
        , i = keys.indexOf(key);
    return i !== -1 && keys[i + 1] && db[keys[i + 1]];
};
newGuid_short = function () {
    var S4 = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
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
var srcore = {
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
function super_random(min, max) {
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
}
_gamesListCreate = function (games) {
    var list = [];
    games.forEach(function (game) {
        list.push({
            id: game.id,
            spectators: Object.keys(game.spectators).length,
            players: Object.keys(game.players).length,
            mode: game.mode,
            name: game.name
        });
    });
    return list;
};
_getVal = function (f, callback) {
    return typeof f == 'function' ? f(callback) : f;
};
sortByKey = function (array, key, direction) {
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
findByKey = function (array, key, value) {
    var out = [];
    for (var i = 0; i < array.length; i++) {
        if (array[i])
            if (array[i][key] == value) out.push(array[i]);
    }
    if (out.length > 1) return out;
    else return out[0];
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