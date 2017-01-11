IS_SERVER = false;
SOCKET = null;
const GAME_STATES = {
    HOME: {
        id: '#home',
        prevState: null,
        buttons: [
            {id: '#display-games-list', action: 'showServerList'},
            {id: '#display-settings', state: 'SETTINGS'},
        ]
    },
    CONNECTION_ERROR: {
        id: '#connection-error',
        prevState: 'HOME',
        buttons: null,
    },
    SERVER_LIST: {
        id: '#games-list',
        prevState: 'HOME',
        buttons: [
            {id: '#join-game', action: 'joinGame'},
            {id: '#start-new', state: 'START_NEW_GAME'},
            {id: '#refresh-list', action: 'setServerList'}
        ]
    },
    START_NEW_GAME: {
        id: '#start-new-game',
        prevState: 'SERVER_LIST',
        form: [
            '#game-name',
            '#game-max-players',
            '#game-mode',
            '#game-map',
            '#game-rounds',
            '#game-round-time'
        ],
        buttons: [
            {id: '#create-game', action: 'createGame'},
        ]
    },
    PAUSE: {
        id: '#pause',
        prevState: null,
        buttons: [
            {id: '#exit-game', state: null, action: 'exitGame'},
            {id: '#go-spectate', state: 'START_NEW_GAME'}
        ]
    },
    SPECTATE: {
        id: '#spectate',
        prevState: null,
        buttons: [
            {id: '#join-match', action: 'joinMatch'},
            {id: '#leave-game', action: 'leaveGame'}
        ]
    },
    SETTINGS: {
        id: '#settings',
        prevState: 'HOME',
        form: [
            '#player-name',
            '#mute-sound',
            '#full-screen'
        ],
        buttons: [
            {id: '#save-settings', action: 'saveSettings'}
        ]
    }
};
var gameEngine;
var gui;
var pre_loaded_maps = [];
var global = window;
var CAMERA_POS = {x: 0, y: 0};
CAMERA_CENTER = {x: CFG.MAP_WIDTH * .5, y: CFG.MAP_HEIGHT * .5};
function preload() {
    gui = new Gui();
    gui.setLoadingInfo('Loading configuration');
    STRINGS = loadJSON('/assets/lang.json');
    SPR_OBJ = loadJSON('/assets/sprites.json');
    HOST_LIST = loadJSON('/assets/host_list.json');

    FONT = loadFont('/assets/fonts/Chewy.ttf');

    gui.setLoadingInfo('Loading maps');
    pre_loaded_maps = [
        loadJSON('/assets/test_map.json')
    ];

    gui.setLoadingInfo('Loading sprites');
    SPRITE_SHEET = loadImage('/assets/images/sprites.png');
    MAP_SPRITE_SHEET = loadImage('/assets/images/map_sprites.png');

    gui.setLoadingInfo('Loading sounds');
    SFX = {
        BACKGROUND: loadSound('assets/sfx/background.mp3'),
        INTERFACE: {
            BUTTON_CLICK: loadSound('assets/sfx/interface/button_click.wav'),
            BUTTON_HOVER: loadSound('assets/sfx/interface/button_hover.wav')
        },
        EFFECTS: {
            PLAY: loadSound('assets/sfx/effects/play.wav'),
            JUMP: loadSound('assets/sfx/effects/jump.wav'),
            WALK: loadSound('assets/sfx/effects/walk2.mp3'),
            COLLECT: loadSound('assets/sfx/effects/collect.wav'),
            DOUBLE_DAMAGE: loadSound('assets/sfx/effects/quad_damage.wav'),
            RESPAWN: loadSound('assets/sfx/effects/respawn.wav'),
            COUNTER: loadSound('assets/sfx/effects/counter.wav')
        },
        WEAPONS: {
            DIE: loadSound('assets/sfx/weapons/die.mp3'),
            MACHINEGUN: {
                FIRE: loadSound('assets/sfx/weapons/machinegun/fire.wav'),
                START: loadSound('assets/sfx/weapons/machinegun/start.wav')
            },
            CURVEGUN: {
                FIRE: loadSound('assets/sfx/weapons/curvegun/fire.wav'),
                START: loadSound('assets/sfx/weapons/curvegun/start.wav')
            },
            BOW: {
                FIRE: loadSound('assets/sfx/weapons/bow/fire.wav'),
                DIE: loadSound('assets/sfx/weapons/bow/start.wav'),
                START: loadSound('assets/sfx/weapons/bow/start.wav')
            },
            CHINESAW: {
                FIRE: loadSound('assets/sfx/weapons/chinesaw/fire.wav'),
                DIE: loadSound('assets/sfx/weapons/chinesaw/die.wav'),
                START: loadSound('assets/sfx/weapons/chinesaw/start.wav')
            },
            ROCKETLUNCHER: {
                FIRE: loadSound('assets/sfx/weapons/rocketluncher/fire.wav'),
                START: loadSound('assets/sfx/weapons/rocketluncher/start.wav'),
                FLY: loadSound('assets/sfx/weapons/rocketluncher/fly.wav'),
                HIT: loadSound('assets/sfx/weapons/rocketluncher/hit.wav'),
            },
            LIGHTGUN: {
                FIRE: loadSound('assets/sfx/weapons/lightgun/fire2.wav'),
                START: loadSound('assets/sfx/weapons/start.wav'),
            },
            SPAS: {
                FIRE: loadSound('assets/sfx/weapons/spas/fire.wav'),
                START: loadSound('assets/sfx/weapons/spas/start.wav'),
            }
        }
    }
}
function setup() {
    createCanvas(innerWidth, innerHeight);
    frameRate(CFG.MAX_FRAME_RATE);
    gui.applySettings();
    gui.show('HOME');
    SoundManager.play(SFX.BACKGROUND, null, true);
}
function draw() {
    if (gameEngine && gameEngine.run) {
        if (mouseX || mouseY) {
            CAMERA_POS.x = width - (CAMERA_CENTER.x * SCALE + mouseX);
            CAMERA_POS.y = height - (CAMERA_CENTER.y * SCALE + mouseY);
        }
        gameEngine.update();
        gameEngine.recordInput();
        gameEngine.render();
    }
}

function keyPressed() {
    INPUT[CFG.KEY_MAP[keyCode]] = true;
}
function keyReleased() {
    INPUT[CFG.KEY_MAP[keyCode]] = false;
}
function mousePressed() {
    if (mouseButton === LEFT)
        INPUT.FIRE = true;
}
function mouseReleased() {
    if (mouseButton === LEFT)
        INPUT.FIRE = false;
}
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}
document.oncontextmenu = function (event) {
    event.preventDefault();
    event.stopPropagation();
    return false;
};