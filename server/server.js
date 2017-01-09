const express = require('express');
const util = require('util');
const fs = require('fs');
const vm = require('vm');
const Loop = require('./loop.js');

var app = express();

var server = app.listen(process.env.PORT || 3000, listenCallback);
app.get('/*', function (req, res) {
    res.sendfile('index.html');
});
var io = require('socket.io')(server);

IS_SERVER = true;

console.log = function (d) {
    process.stdout.write(util.inspect(d) + '\n');
};

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

var game = {};

function sync_loop() {
    socket.emit('sync_game', game._simply());
}
function game_loop() {
    game.update();
}
Loop.run(CFG.SYNC_RATE, sync_loop);
Loop.run(CFG.TICK_RATE, game_loop);

function listenCallback() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Server started and listening at http://' + host + ':' + port);
}

app.use(express.static('public'));

io.of('/stats').on('connection', function (socket) {

});
io.of('/game').on('connection',
    function (socket) {
        console.log('Client ' + socket.id + ' connected.');
        socket.emit('connected');
        socket.on('game_create', function (data) {
            data.id = socket.id + newGuid_short();
            data.owner = socket.id;
            game = new GameEngine(data);
            game.map = JSON.parse(fs.readFileSync(__dirname + '/../public/assets/' + MAPS[game.map_index] + '.json'));
            var player = new Player({id: socket.id, displayName: data.displayName, gameID: data.id});
            game.addSpectator(player);
            game.setup();
            socket.emit('game_connected', game._simply());
        });
            var player = new Player({id: socket.id, displayName: data.displayName, gameID: data.gameID});
            game.addSpectator(player);
            var sGame = game._simply();
            socket.emit('player_joined_game', player._simply());
            socket.emit('game_connected', sGame);
        });
        socket.on('match_join', function (gameID) {
            game.joinMatch(socket.id);
            io.emit('player_joined_match', game.players[socket.id]._simply());
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
            io.emit('spawn_buffer', game._spawnBuffer);
        });
        socket.on('player_input', function (data) {
            game.applyPlayerInput(socket.id, data.input);
        });
        socket.on('disconnect', function () {
            game.removePlayer(socket.id);
            socket.emit('player_leaved', socket.id);
            console.log("Client "+socket.id+" has disconnected");
        });
    });