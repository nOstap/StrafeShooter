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
    var host = server.address().address;
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

app.get('/*', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});

global.ioStats = io.of('/stats');
global.ioGame = io.of('/game');

global.game = new GameEngine({
    id: _guid(),
    name: process.env.game_name,
    map_index: process.env.game_map,
    mode: process.env.game_mode,
    max_players: process.env.game_max_players,
    rounds: process.env.game_rounds,
    round_time: process.env.game_round_time
});

game.map = JSON.parse(fs.readFileSync(__dirname + '/../public/assets/' + MAPS[game.map_index] + '.json'));
game.setup();

function sync_loop() {
    if (game) ioGame.emit('sync_game', game._simply());
}
function game_loop() {
    if (game) game.update();
}

Loop.run(CFG.SYNC_RATE, sync_loop);
Loop.run(CFG.TICK_RATE, game_loop);

app.use(express.static('public'));

ioStats.on('connection', function () {
    ioStats.emit('connected', _gameStatsCreate(game));
});
ioGame.on('connection', function (socket) {
        var clientID = socket.conn.id;
        console.log('Client ' + clientID + ' connected.');
        var data = socket.handshake.query;
        var player = new Player({id: clientID, displayName: data.displayName, head: data.head, body: data.body});
        game.addSpectator(player);
        socket.emit('connected', game._simply());

        ioGame.emit('player_joined_game', player._simply());

        socket.on('deal_damage', function (entID, damage) {
            game.dealDamage(entID, damage);
        });
        socket.on('collect_item', function (entID, itemID) {
            game.dealDamage(entID, itemID);
        });
        socket.on('match_join', function () {
            game.joinMatch(clientID);
        });
        socket.on('player_input', function (data) {
            game.applyPlayerInput(clientID, data.input, Date.now());
        });
        socket.on('disconnect', function () {
            console.log("Client " + clientID + " has disconnected");
            game.removePlayer(clientID);
            ioGame.emit('player_leaved', clientID);
        });
    });
