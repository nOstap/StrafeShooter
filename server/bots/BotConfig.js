// Bot tuning. Pure data + env parsing: no engine globals, so plain node can load it.

var NAV = {
    SCALE: 100,      // Tiled pixels per metre
    CELL: 0.5,       // grid cell size (m)
    R_HARD: 0.4,     // a cell is walkable when its centre is at least this far from any blocker
    R_SOFT: 0.8,     // below this clearance cells cost extra, which keeps paths centred
    SOFT_K: 2,
    R_SMOOTH: 0.6,   // clearance string-pulling tries to keep
    CLEAR_CAP: 2,
    BUCKET: 4,       // spatial bucket size (m) for rect lookups
    SNAP_CELLS: 6
};

var PATH = {
    BUDGET_PER_TICK: 4000,
    MAX_EXPANSIONS: 8000,
    LANDMARKS: 4,    // POI fields used as ALT landmarks per search
    START_SNAP_CELLS: 4,
    REPLAN_TICKS: 30,
    GOAL_MOVED: 2
};

var MOVE = {
    STEP: 0.2667,    // metres walked per tick (CFG.PLAYER.SPEED * PHYSICS_HZ)
    WAYPOINT_RADIUS: 0.35,
    LOOKAHEAD_EVERY: 5,
    FIELD_CHAIN: 12,
    FIELD_EVERY: 2,
    FEELERS: [0.6, 1.0],
    FEELER_ANGLES_DEG: [30, 60, 90],
    SEPARATION_RADIUS: 1.0,
    SEPARATION_WEIGHT: 0.6,
    JUMP_CLEAR: 4.8,
    TELEPORT: 2,
    STUCK_WINDOW: 15,
    STUCK_MIN_MOVE: 0.6,
    STUCK_RESET_WINDOWS: 2,
    SIDESTEP_TICKS: 8,
    BLACKLIST_TICKS: 450,
    ITEM_DIRECT: 2.5,
    ITEM_POI_RADIUS: 2,
    POI_REACHED: 1.5,
    POINT_REACHED: 0.5
};

var ROSTER = {
    REJOIN_DELAY_TICKS: 90,      // autostart only: pause between bots-only matches
    BOTS_ONLY_GRACE_TICKS: 150
};

var COMBAT = {
    HISTORY: 32,
    ROCKET_MIN_DIST: 3.5,
    ROCKET_REENTRY_MARGIN: 2.0, // back to rockets only from ROCKET_MIN_DIST + this (no flicker)
    ROCKET_SAFE_DIST: 2.0,
    ROCKET_BLOCK_TICKS: 15,
    MIN_AIM_DIST: 1.0,
    CURVE_HOLD_TICKS: 4,
    ENEMY_RECENT_TICKS: 90,
    ATTACKED_RECENT_TICKS: 60,
    HYSTERESIS: 1.15,
    MIN_STATE_TICKS: 10,
    ROAM_REVISIT_TICKS: 600,
    DODGE_RADIUS: 8,
    DODGE_MISS: 0.8,
    DODGE_HORIZON: 20
};

var WEAPON_PREF = {RocketLuncher: 1.0, Bow: 0.9, CurveGun: 0.85, LightGun: 0.8, Spas: 0.75, MachineGun: 0.7};
var PREFERRED_RANGE = {LightGun: 4.5, Spas: 4, Bow: 7, RocketLuncher: 9, MachineGun: 12, CurveGun: 12};
var FIRE_TOLERANCE_DEG = {LightGun: 6, MachineGun: 6, Spas: 8, Bow: 3, RocketLuncher: 4, CurveGun: 6};
var SPLASH_DPS = {RocketLuncher: 15};
var NAMES = ['Viper', 'Ghost', 'Rook', 'Blitz', 'Nova', 'Talon', 'Havoc', 'Echo', 'Jinx', 'Raven'];

var PRESETS = {
    easy: {
        reactionTicks: 12, aimSigmaDeg: 9, turnRateDeg: 8, leadFactor: 0.3, compensate: 0.5,
        awareness: 14, fovDeg: 180, hearing: 0, memoryTicks: 45, thinkEvery: 6,
        strafe: 0.3, strafeFlip: [45, 90], dodgeChance: 0, dodgeJump: 0, preAim: false,
        fleeHealth: 0.2, ammoAware: false, switchOnlyWhenEmpty: true, switchDelayTicks: 45,
        minPHit: 0.05, collectRadius: 6, aggression: 0.8, hunchTicks: 900
    },
    normal: {
        reactionTicks: 8, aimSigmaDeg: 5, turnRateDeg: 15, leadFactor: 0.7, compensate: 0.5,
        awareness: 20, fovDeg: 240, hearing: 16, memoryTicks: 90, thinkEvery: 4,
        strafe: 0.6, strafeFlip: [20, 45], dodgeChance: 0.15, dodgeJump: 0, preAim: false,
        fleeHealth: 0.3, ammoAware: true, switchOnlyWhenEmpty: false, switchDelayTicks: 20,
        minPHit: 0.15, collectRadius: 10, aggression: 1.0, hunchTicks: 360
    },
    hard: {
        reactionTicks: 5, aimSigmaDeg: 2.5, turnRateDeg: 25, leadFactor: 0.9, compensate: 1,
        awareness: 28, fovDeg: 300, hearing: 24, memoryTicks: 150, thinkEvery: 3,
        strafe: 0.85, strafeFlip: [12, 30], dodgeChance: 0.45, dodgeJump: 0.25, preAim: true,
        fleeHealth: 0.3, ammoAware: true, switchOnlyWhenEmpty: false, switchDelayTicks: 10,
        minPHit: 0.2, collectRadius: 14, aggression: 1.1, hunchTicks: 180
    },
    nightmare: {
        reactionTicks: 3, aimSigmaDeg: 1.2, turnRateDeg: 45, leadFactor: 1.0, compensate: 1,
        awareness: 40, fovDeg: 360, hearing: 40, memoryTicks: 240, thinkEvery: 2,
        strafe: 1.0, strafeFlip: [6, 20], dodgeChance: 0.8, dodgeJump: 0.6, preAim: true,
        fleeHealth: 0.35, ammoAware: true, switchOnlyWhenEmpty: false, switchDelayTicks: 4,
        minPHit: 0.25, collectRadius: 18, aggression: 1.25, hunchTicks: 120
    }
};

/**
 * game_bots, game_bot_difficulty, game_bot_autostart, game_bot_seed, game_bot_debug.
 * Difficulty may be a list ("easy hard" or "easy,hard"), cycled per bot.
 */
function parseEnv(env, maxPlayers) {
    env = env || {};
    var max = Math.max(0, (parseInt(maxPlayers, 10) || 10) - 1);
    var count = parseInt(env.game_bots, 10);
    if (!isFinite(count) || count < 0) count = 0;
    count = Math.min(count, max);
    var difficulties = String(env.game_bot_difficulty || '').toLowerCase().split(/[\s,]+/).filter(function (name) {
        return Object.prototype.hasOwnProperty.call(PRESETS, name);
    });
    if (!difficulties.length) difficulties = ['normal'];
    var seedStr = String(env.game_bot_seed == null ? '' : env.game_bot_seed).trim();
    var seed = /^\d+$/.test(seedStr) ? (Number(seedStr) >>> 0) : null;
    return {
        count: count,
        difficulties: difficulties,
        autostart: String(env.game_bot_autostart).trim() === '1',
        seed: seed,
        debug: String(env.game_bot_debug).trim() === '1'
    };
}

module.exports = {
    NAV: NAV,
    PATH: PATH,
    MOVE: MOVE,
    ROSTER: ROSTER,
    COMBAT: COMBAT,
    WEAPON_PREF: WEAPON_PREF,
    PREFERRED_RANGE: PREFERRED_RANGE,
    FIRE_TOLERANCE_DEG: FIRE_TOLERANCE_DEG,
    SPLASH_DPS: SPLASH_DPS,
    NAMES: NAMES,
    PRESETS: PRESETS,
    parseEnv: parseEnv
};
