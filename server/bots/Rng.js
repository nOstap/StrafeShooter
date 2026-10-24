// Small seeded PRNG (mulberry32). Every bot owns one so bot decisions never touch
// Math.random or the engine's shared _superRandom stream.

function Rng(seed) {
    this.state = seed >>> 0;
    this._spare = null;
}

Rng.prototype.next = function () {
    var t = this.state = (this.state + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Rng.prototype.range = function (min, max) {
    return min + (max - min) * this.next();
};
// Integer in [min, max], both inclusive.
Rng.prototype.int = function (min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
};
Rng.prototype.chance = function (p) {
    return p > 0 && this.next() < p;
};
Rng.prototype.pick = function (arr) {
    return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
};
// Standard normal (Box-Muller, the second value is kept for the next call).
Rng.prototype.gaussian = function () {
    if (this._spare !== null) {
        var s = this._spare;
        this._spare = null;
        return s;
    }
    var u = 0, v = this.next();
    while (u === 0) u = this.next();
    var r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
};

// Mixes any number of integers into one well-spread uint32 seed.
Rng.hash = function () {
    var h = 0x811C9DC5;
    for (var i = 0; i < arguments.length; i++) {
        var v = arguments[i] >>> 0;
        v = Math.imul(v ^ (v >>> 16), 0x85EBCA6B);
        v = Math.imul(v ^ (v >>> 13), 0xC2B2AE35);
        v ^= v >>> 16;
        h = Math.imul(h ^ v, 0x01000193);
        h ^= h >>> 15;
    }
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
};

module.exports = Rng;
