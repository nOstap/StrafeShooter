// Per-weapon flight tables derived from the real weapon/bullet classes, plus the small
// analytic helpers the bots aim and choose weapons with. Server only: needs the engine
// globals (CFG, Player and the weapon classes) created by server.js.

var BotConfig = require('./BotConfig.js');

// Box2D island solve per step: damping first (v *= clamp(1 - dt * damping, 0, 1)), then the
// b2_maxTranslation cap of 2 m per step, which also rescales the velocity.
var MAX_TRANSLATION = 2;

function build() {
    var probe = new Player({id: '__bot_probe'});
    var delta = CFG.TICK_RATE / 1000;
    var dt = CFG.PHYSICS_HZ;
    var profiles = {};
    CFG.WEAPONS.forEach(function (name) {
        var w = probe.weapons[name];
        var b = new global[w.ammoType](w);
        var density = b.density || 1;
        // Wall-clock ms -> ticks; the epsilon keeps 1000 / 33.33 from flooring to 29.
        var lifeTicks = Math.floor(w.distance / CFG.TICK_RATE + 1e-6);
        var prof = {
            name: name,
            ammoType: w.ammoType,
            speed: b.speed,
            radius: b.radius,
            density: density,
            damping: b.damping,
            damage: b.damage,
            bullets: w.bullets,
            dispersion: w.dispersion,
            delay: w.delay,
            defaultAmmo: w.ammunition,
            lifeTicks: lifeTicks,
            intervalTicks: Math.max(1, Math.ceil(w.delay / CFG.TICK_RATE - 1e-6)),
            cum: new Float32Array(lifeTicks + 1),
            range: 0
        };
        var v = b.speed * delta / (density * Math.PI * b.radius * b.radius);
        var q = Math.max(0, Math.min(1, 1 - dt * b.damping * delta));
        for (var t = 1; t <= lifeTicks; t++) {
            v *= q;
            var step = Math.min(MAX_TRANSLATION, v * dt);
            v = step / dt;
            prof.cum[t] = prof.cum[t - 1] + step;
        }
        prof.range = prof.cum[lifeTicks];
        profiles[name] = prof;
    });
    return profiles;
}

function describe(profiles) {
    return CFG.WEAPONS.map(function (name) {
        var p = profiles[name];
        return '[bots] ballistics ' + name + ' (' + p.ammoType + '): first tick ' + p.cum[1].toFixed(3) +
            ' m, last tick ' + (p.cum[p.lifeTicks] - p.cum[p.lifeTicks - 1]).toFixed(3) + ' m, life ' + p.lifeTicks +
            ' ticks, range ' + p.range.toFixed(1) + ' m, interval ' + p.intervalTicks + ' ticks, dps ' + baseDps(p, 1).toFixed(1);
    }).join('\n') + '\n';
}

// Smallest tick count after which the bullet has covered d metres, or -1 if out of range.
function ticksTo(prof, d) {
    var cum = prof.cum;
    if (d <= 0) return 0;
    if (d > cum[prof.lifeTicks]) return -1;
    var lo = 1, hi = prof.lifeTicks;
    while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cum[mid] >= d) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

// First tick t at which the bullet from the muzzle (mx, my) reaches the target's predicted
// position. Velocities are metres per tick (already scaled by the lead factor).
function solveLead(prof, mx, my, px, py, vx, vy, extraTicks) {
    var cum = prof.cum;
    for (var t = 1; t <= prof.lifeTicks; t++) {
        var ex = px + vx * (t + extraTicks), ey = py + vy * (t + extraTicks);
        var dx = ex - mx, dy = ey - my;
        if (cum[t] * cum[t] >= dx * dx + dy * dy) return {x: ex, y: ey, t: t};
    }
    return null;
}

function baseDps(prof, mult) {
    return Math.floor(prof.damage * mult) * prof.bullets * (1000 / CFG.TICK_RATE) / prof.intervalTicks +
        (BotConfig.SPLASH_DPS[prof.name] || 0) * mult;
}

// Rough hit probability: target radius against the spread from aim error, target movement
// during the flight (none while it is mid-jump: it cannot steer) and weapon dispersion.
function pHit(prof, d, sigmaRad, speed, inAir) {
    var tof = ticksTo(prof, d);
    if (tof < 0) return 0;
    var sigma = d * Math.tan(sigmaRad) + (inAir ? 0 : 0.5) * speed * tof + 0.5 * d * prof.dispersion;
    var R = 0.3 + (prof.name === 'RocketLuncher' ? 0.35 : 0) + (prof.bullets > 1 ? 0.2 : 0);
    return Math.min(1, R / (R + sigma));
}

module.exports = {
    build: build,
    describe: describe,
    ticksTo: ticksTo,
    solveLead: solveLead,
    baseDps: baseDps,
    pHit: pHit
};
