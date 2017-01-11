const express = require('express');
const chproc = require('child_process');
const http = require('http');

var app = express();

app.use(express.static(__dirname + '/public'));

var server = app.listen(80, function () {
    var host = server.address().address || 'localhost';
    var port = server.address().port;
    console.log('Your game server started and listening at http://' + host + ':' + port);
});
app.get('/', function (req, res) {
    res.render('index');
});
app.get('/local-server', function (req, res) {
    var options = {
        env: req.query
    };
    chproc.fork('server/server.js', options);
    res.json(true);
});
app.get('/*', function (req, res) {
    res.send('Whops! Something goes wrong :( Please contact to adam.ostapkiewicz@gmail.com');
});
