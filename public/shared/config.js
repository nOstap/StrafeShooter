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
    GAME_MODES: {
        FFA: 0,
        TEAMS: 1,
        THEHUNTED: 2
    },
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
        ACCELERATION: 18,
        MAX_HEALTH: 100,
        SPAWN_TIME: 5000
    },
    BULLET_TAIL: false,
    MAX_PLAYERS: 10,
    DEBUG: false,
    MAX_GAMES: 1,
    MASTER_VOLUME: 0.1,
    EXPLOSION_PARTICLES: 25,
    MAP_MARGIN: 5,
    MAP_TEARING_X: 1,
    MAP_TEARING_Y: -2,
    MAX_FRAME_RATE: 30,
    SYNC_RATE: 1000 / 30.0, // MS
    TICK_RATE: 1000 / 30.0, // MS
    PHYSICS_HZ: 1.0 / 60.0,
    JUMP_TIME: 400,
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
FONT = null;
MAPS = [
    'test_map'
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