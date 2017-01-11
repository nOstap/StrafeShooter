IS_SERVER = true;

const express = require('express');
const util = require('util');
const fs = require('fs');
const vm = require('vm');
const Loop = require('./loop.js');

require('dotenv').config({path: __dirname + '/.env'});
console.log = function (d) {
    process.stdout.write(util.inspect(d) + '\n');
};

var app = express();
var server = app.listen(process.env.PORT || 3000, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Server started and listening at http://' + host + ':' + port);
});
var io = require('socket.io')(server);
var includes =
    fs.readFileSync(__dirname + '/../public/shared/lib/Box2D.min.js') +
    fs.readFileSync(__dirname + '/../public/shared/config.js') +
    fs.readFileSync(__dirname + '/../public/shared/utils.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/GameEngine.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/PhysicsEngine.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/SoundManager.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Entity.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Obstacle.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Player.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/Energy.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/Colectable.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/AmmoBox.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/DoubleDamage.js') +
    fs.readFileSync(__dirname + '/../public/shared/classes/items/LifeBox.js') +
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

var game = new GameEngine({
    id: newGuid_short(),
    game_name: process.env.game_name,
    game_map: process.env.game_map,
    game_mode: process.env.game_mode,
    game_max_players: process.env.game_max_players,
    game_rounds: process.env.game_rounds,
    game_round_time: process.env.game_round_time,
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

var ioStats = io.of('/stats').on('connection', function (socket) {
    ioStats.emit('connected', _gameStatsCreate(game));
}), ioGame = io.of('/game').on('connection',
    function (socket) {
        var clientID = socket.conn.id;
        console.log('Client ' + clientID + ' connected.');

        var data = socket.handshake.query;
        var player = new Player({id: clientID, displayName: data.displayName, gameID: game.id});

        game.addSpectator(player);
        socket.emit('connected', game._simply());
        ioGame.emit('player_joined_game', player._simply());

        socket.on('match_join', function () {
            game.joinMatch(clientID);
            ioGame.emit('player_joined_match', game.players[clientID]._simply());
        });
        socket.on('spawn', function (info) {
            var entity = game.getEntityById(info.entityID);
            if (!entity) return false;
            var spawns = findByKey(game.map.layers, 'name', entity.class + 'Spawns');
            if (!spawns) return false;
            var spawn = super_random(spawns.objects);
            Object.assign(spawn, info);
            spawn.position = new Vec2((spawn.x + super_random(spawn.width)) / SCALE, (spawn.y + super_random(spawn.height)) / SCALE);
            game._spawnBuffer.push(spawn);
            ioGame.emit('spawn_buffer', game._spawnBuffer);
        });
        socket.on('player_input', function (data) {
            game.applyPlayerInput(clientID, data.input);
        });
        socket.on('disconnect', function () {
            console.log("Client " + clientID + " has disconnected");
            game.removePlayer(clientID);
            ioGame.emit('player_leaved', clientID);
        });
    });
