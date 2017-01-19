IS_SERVER = false;
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
            '#player-head',
            '#player-body',
            '#mute-sound',
            '#mute-sound-effects',
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

function preload() {
    Gui.setLoadingInfo('Loading scripts');
    httpGet('/shared/classes/GameEngine.js', _addJsContent);
    httpGet('/shared/classes/PhysicsEngine.js', _addJsContent);
    httpGet('/classes/RenderEngine.js', _addJsContent);
    httpGet('/shared/classes/SoundManager.js', _addJsContent);
    httpGet('/classes/Interface.js', _addJsContent);
    httpGet('/classes/Animation.js', _addJsContent);
    httpGet('/shared/classes/Entity.js', function (data) {
        _addJsContent(data);
        httpGet('/shared/classes/Player.js', _addJsContent);
        httpGet('/shared/classes/Energy.js', _addJsContent);
        httpGet('/shared/classes/Obstacle.js', _addJsContent);
        httpGet('/shared/classes/items/Collectable.js', function (data) {
            _addJsContent(data);
            httpGet('/shared/classes/items/AmmoBox.js', _addJsContent);
            httpGet('/shared/classes/items/DoubleDamage.js', _addJsContent);
            httpGet('/shared/classes/items/LifeBox.js', _addJsContent);
            httpGet('/shared/classes/items/MaximumDefense.js', _addJsContent);
            Gui.setLoadingInfo('Loading configuration');
        });
        httpGet('/shared/classes/weapons/Weapon.js', function (data) {
            _addJsContent(data);
            httpGet('/shared/classes/weapons/CurveGun.js', _addJsContent);
            httpGet('/shared/classes/weapons/LightGun.js', _addJsContent);
            httpGet('/shared/classes/weapons/Spas.js', _addJsContent);
            httpGet('/shared/classes/weapons/RocketLuncher.js', _addJsContent);
            httpGet('/shared/classes/weapons/Bow.js', _addJsContent);
            httpGet('/shared/classes/weapons/MachineGun.js', function (data) {
                _addJsContent(data);

            });
        });
    });

    Gui.setLoadingInfo('Loading configuration');
    STRINGS = loadJSON('/assets/lang.json');
    SPRITES_JSON = loadJSON('/assets/sprites.json');
    INTERFACE_SPRITES_JSON = loadJSON('/assets/interface_sprites.json');
    HOST_LIST = loadJSON('/assets/host_list.json');
    FONT = loadFont('/assets/fonts/Chewy.ttf');

    Gui.setLoadingInfo('Loading sprites');
    SPRITE_SHEET = loadImage('/assets/images/sprites.png', function () {
        INTERFACE_SPRITE_SHEET = loadImage('/assets/images/interface_sprites.png', function () {
            MAP_SPRITE_SHEET = loadImage('/assets/images/map_sprites.png', function () {
                Gui.setLoadingInfo('Loading maps');
                loadJSON('/assets/test_map.json', function (data) {
                    pre_loaded_maps.push(data);
                    Gui.setLoadingInfo('Loading sounds');
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
                            MAXIMUM_DEFENSE: loadSound('assets/sfx/effects/quad_damage.wav'),
                            LIFE_BOX: loadSound('assets/sfx/effects/life_box.wav'),
                            RESPAWN: loadSound('assets/sfx/effects/respawn.wav'),
                            BUFF_ADDING: loadSound('assets/sfx/effects/buff_adding.wav'),
                            DEATH: loadSound('assets/sfx/effects/death.wav'),
                            HURT: loadSound('assets/sfx/effects/hit.wav'),
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
                                HIT: loadSound('assets/sfx/weapons/rocketluncher/hit.wav')
                            },
                            LIGHTGUN: {
                                FIRE: loadSound('assets/sfx/weapons/lightgun/fire.wav'),
                                START: loadSound('assets/sfx/weapons/start.wav')
                            },
                            SPAS: {
                                FIRE: loadSound('assets/sfx/weapons/spas/fire.wav'),
                                START: loadSound('assets/sfx/weapons/spas/start.wav')
                            }
                        }
                    }
                });

            });
        });
    });

}
function setup() {
    createCanvas(innerWidth, innerHeight);
    frameRate(CFG.MAX_FRAME_RATE);
    gui = new Gui();
    gui.applySettings();
    gui.show('HOME');
    Animation.load();
    SoundManager.setup();
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
// document.oncontextmenu = function (event) {
//     event.preventDefault();
//     event.stopPropagation();
//     return false;
// };