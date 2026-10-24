const express = require('express');
const chproc = require('child_process');
const http = require('http');

var app = express();

app.use(express.static(__dirname + '/public'));

var server = app.listen(process.env.PORT || 80, function () {
    var host = server.address().address || 'localhost';
    var port = server.address().port;
    console.log('Your game server started and listening at ' + host + ':' + port);
});
app.get('/', function (req, res) {
    res.render('index');
});
// Only forward known game settings: passing the raw query string as the child's
// environment let anyone set NODE_OPTIONS etc. (remote code execution).
var LOCAL_SERVER_SETTINGS = ['game_name', 'game_map', 'game_mode', 'game_max_players', 'game_rounds', 'game_round_time',
    'game_bots', 'game_bot_difficulty'];
app.get('/local-server', function (req, res) {
    var env = {PATH: process.env.PATH};
    LOCAL_SERVER_SETTINGS.forEach(function (key) {
        if (req.query[key] != null) env[key] = String(req.query[key]).replace(/[^\w .-]/g, '').substring(0, 32);
    });
    var options = {
        env: env
    };
    chproc.fork('server/server.js', options);
    res.json(true);
});
app.get('/*', function (req, res) {
    res.send('Whops! Something goes wrong :( Please contact to adam.ostapkiewicz@gmail.com');
});
