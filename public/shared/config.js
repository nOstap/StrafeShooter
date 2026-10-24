const SCALE = 100;
const CFG = {
    LANG: 'PL',
    WEAPONS: [
        'LightGun',
        'Spas',
        'Bow',
        'RocketLuncher',
        'MachineGun',
        'CurveGun'
    ],
    SEED: 6832109,
    KEY_MAP: {
        left: 'FIRE',
        87: 'UP',
        83: 'DOWN',
        68: 'RIGHT',
        65: 'LEFT',
        32: 'JUMP',
        40: 'CAMERA_DOWN',
        39: 'CAMERA_RIGHT',
        38: 'CAMERA_UP',
        37: 'CAMERA_LEFT',
        81: 'SWITCH_WEAPON',
        69: 'SWITCH_CURVE',
        82: 'SWITCH_ROCKET',
        70: 'SWITCH_LIGHT',
        16: 'SWITCH_BOW',
        67: 'SWITCH_SPAS',
        17: 'SWITCH_MACHINE',
        49: 'TEAM_CHAT',
        50: 'NORMAL_CHAT',
        51: 'READY',
        52: 'PAUSE'
    },
    ONE_SHOT_ACTIONS: ['JUMP', 'READY', 'SWITCH_WEAPON', 'SWITCH_CURVE', 'SWITCH_ROCKET', 'SWITCH_LIGHT', 'SWITCH_BOW', 'SWITCH_SPAS', 'SWITCH_MACHINE'],
    GAME_MODES: {
        DEATHMATCH: 0, // respawn after death, first to the frag limit (or time) wins
        ROUNDS: 1      // dead players spectate until the round ends; last one standing wins
    },
    DEFAULT_FRAG_LIMIT: 20,
    COLLISION_GROUPS: {
        NOTHING: 0x0000,
        PLAYER: 0x0001,
        TEAMRED: 0x0001 << 1,
        TEAMBLUE: 0x0001 << 2,
        ENERGY: 0x0001 << 3,
        WALL: 0x0001 << 4,
        WATER: 0x0001 << 5,
        ITEM: 0x0001 << 6,
        BULLET: 0x0001 << 7,
        OBSTACLE: 0x0001 << 8,
        ALL: 0xFFFF
    },
    INIT_GAME_SETTINGS: '{' +
    '"player_name":"NoNamePlayer",' +
    '"mute_sound":false,' +
    '"mute_sound_effects":false,' +
    '"player_head":0,' +
    '"player_body":0,' +
    '"full_screen":false' +
    '}',
    PLAYER: {
        SPEED: 12.8, // world units per simulated second (world runs at PHYSICS_HZ per tick)
        JUMP_MULTIPLIER: 1.3,
        JUMP_LANDING_GRACE: 15, // extra ticks a jump may last when it would end inside a wall
        MAX_HEALTH: 100,
        SPAWN_TIME: 5000,
        NAME_MAX_LENGTH: 20
    },
    ITEM_RESPAWN_TIME: 15000,
    BULLET_TAIL: false,
    MAX_PLAYERS: 10,
    DEBUG: false,
    MAX_GAMES: 1,
    MASTER_VOLUME: 0.1,
    EXPLOSION_PARTICLES: 25,
    MAP_MARGIN: 5,
    MAP_TEARING_X: 1,
    MAP_TEARING_Y: -2,
    MAX_FRAME_RATE: 240, // draw on every display refresh; the simulation itself is tick based
    CAMERA_SMOOTHING: 0.15, // fraction of the mouse look-ahead applied per frame
    SYNC_RATE: 1000 / 20.0, // MS between server snapshots
    TICK_RATE: 1000 / 30.0, // MS per fixed simulation tick (same on server and client)
    PHYSICS_HZ: 1.0 / 60.0,
    JUMP_TIME: 400,
    NET: {
        INTERP_DELAY: 100,     // MS remote entities are rendered behind the server
        MAX_INPUT_QUEUE: 8,    // server drops older inputs above this (bounds latency)
        INPUT_QUEUE_TARGET: 2,
        MAX_CATCHUP_TICKS: 5,  // client ticks per frame before it gives up and resyncs
        SNAP_DISTANCE: 2,      // prediction error (world units) above which we teleport
        MIN_CORRECTION: 0.01,
        VISUAL_SMOOTHING: 0.25 // fraction of visual error removed per rendered frame
    },
    PARTICLES: {
        MAX: 1500,
        ENABLED: true
    },
    MAX_ENTITIES: 5000,
    MAP_WIDTH: 100,
    MAP_HEIGHT: 100,
    TILE_WIDTH: 100,
    TILE_HEIGHT: 100
};

INPUT = {};
SFX = {};
STRINGS = [];
SOCKET = null;
CAMERA_CENTER = {x: 0, y: 0};
CAMERA_POS = {x: CFG.MAP_WIDTH * .5, y: CFG.MAP_HEIGHT * .5};
CAMERA_LOOK = {x: 0, y: 0};
FONT = null;
MAPS = [
    'test_map',
    'arena',
    'desert_outpost',
    'frozen_lake'
];
MAP_NAMES = [
    'Island (classic)',
    'Arena',
    'Desert Outpost',
    'Frozen Lake'
];
TILESET_IMAGES = {};
TILESET_FILES = [
    'images/map_sprites.png',
    'images/map_sprites_desert.png',
    'images/map_sprites_winter.png'
];
HOST_LIST = [];
SPRITES_JSON = {};
INTERFACE_SPRITES_JSON = {};
SPRITE_SHEET = {};
INTERFACE_SPRITE_SHEET = {};
ANIMATIONS = {};


Vec2 = Box2D.Common.Math.b2Vec2;
BodyDef = Box2D.Dynamics.b2BodyDef;
Body = Box2D.Dynamics.b2Body;
FixtureDef = Box2D.Dynamics.b2FixtureDef;
Fixture = Box2D.Dynamics.b2Fixture;
World = Box2D.Dynamics.b2World;
AABB = Box2D.Collision.b2AABB();
MassData = Box2D.Collision.Shapes.b2MassData;
PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
CircleShape = Box2D.Collision.Shapes.b2CircleShape;
DebugDraw = Box2D.Dynamics.b2DebugDraw;
RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef;
ContactListener = Box2D.Dynamics.b2ContactListener;