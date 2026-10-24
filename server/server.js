IS_SERVER = true;

const express = require('express');
const util = require('util');
const fs = require('fs');
const vm = require('vm');
const Loop = require('./Loop.js');

require('dotenv').config({path: __dirname + '/.env'});
console.log = function (d) {
    process.stdout.write(util.inspect(d) + '\n');
};

var app = express();
var server = app.listen(process.env.PORT || 3000, function () {
    var host = process.env.HOST;
    var port = server.address().port;
    console.log('Server started and listening at ' + host + ':' + port);
});
var io = require('socket.io')(server);
var includes =
    fs.readFileSync(__dirname + '/../public/shared/lib/Box2D.min.js') +
    fs.readFileSync(__dirname + '/../public/shared/config.js') +
    fs.readFileSync(__dirname + '/../public/shared/utils.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Exceptions.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/GameEngine.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/PhysicsEngine.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/SoundManager.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Entity.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Obstacle.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Player.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Energy.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Buff.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/Collectable.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/AmmoBox.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/DoubleDamage.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/LifeBox.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/MaximumDefense.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/Weapon.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/Bow.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/CurveGun.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/RocketLuncher.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/MachineGun.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/Spas.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/weapons/LightGun.js');

vm.runInThisContext(includes);

global.ioStats = io.of('/stats');
global.ioGame = io.of('/game');

var mapIndex = parseInt(process.env.game_map, 10) || 0;
if (!MAPS[mapIndex]) mapIndex = 0;

global.game = new GameEngine({
    id: _guid(),
    name: process.env.game_name,
    map_index: mapIndex,
    mode: process.env.game_mode,
    frag_limit: process.env.game_frag_limit,
    max_players: process.env.game_max_players,
    rounds: process.env.game_rounds,
    round_time: process.env.game_round_time
});

game.map = JSON.parse(fs.readFileSync(__dirname + '/../public/assets/' + MAPS[game.map_index] + '.json'));
game.setup();
console.log('Map: ' + MAPS[game.map_index]);

// Server-side bots (game_bots in .env); nothing is created when it is 0 or unset.
var BotManager = require('./bots/BotManager.js');
var botOpts = BotManager.parseEnv(process.env, CFG.MAX_PLAYERS);
var bots = null;
if (botOpts.count > 0) {
    bots = new BotManager(game, botOpts);
    bots.init();
    if (botOpts.debug) app.get('/debug/bots', function (req, res) {
        res.json(bots.debugState());
    });
}

function sync_loop() {
    // Compact snapshot; volatile = drop it rather than queue it if the client is behind,
    // a newer one is always on its way.
    if (game) ioGame.volatile.emit('sync_game', game._snapshot());
}
function game_loop() {
    if (game) {
        // Bots queue their input first so it is consumed in this same tick.
        if (bots) bots.update();
        game.update();
    }
}

Loop.run(CFG.SYNC_RATE, sync_loop);
Loop.run(CFG.TICK_RATE, game_loop);

// Serve the game client too, so a single `npm run server` is enough for local play.
app.use(express.static(__dirname + '/../public'));
app.get('/*', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

ioStats.on('connection', function () {
    ioStats.emit('connected', _gameStatsCreate(game));
});
ioGame.on('connection', function (socket) {
        var clientID = socket.conn.id;
        console.log('Client ' + clientID + ' connected.');
        var data = socket.handshake.query;
        var displayName = String(data.displayName || '').replace(/[<>&"'`]/g, '').trim().substring(0, CFG.PLAYER.NAME_MAX_LENGTH) || 'NoNamePlayer';
        var player = new Player({
            id: clientID,
            displayName: displayName,
            head: Math.max(0, Math.min(2, parseInt(data.head, 10) || 0)),
            body: Math.max(0, Math.min(1, parseInt(data.body, 10) || 0)),
            skin: Player.validSkin(data.skin)
        });
        game.addSpectator(player);
        socket.emit('connected', game._simply());

        ioGame.emit('player_joined_game', player._simply());

        socket.on('match_join', function () {
            game.joinMatch(clientID);
        });
        socket.on('player_ready', function () {
            game.toggleReady(clientID);
        });
        socket.on('player_input', function (input) {
            var p = game.players[clientID];
            if (!p || p.inputQueue.length > 64) return;
            game.queueInput(clientID, input);
        });
        socket.on('ping_check', function (clientTime) {
            socket.emit('pong_check', clientTime);
        });
        socket.on('disconnect', function (reason) {
            console.log("Client " + clientID + " has disconnected (" + reason + ")");
            game.removePlayer(clientID);
            ioGame.emit('player_leaved', clientID);
        });
    });
