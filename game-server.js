const express = require('express');
const exec = require('child_process').exec;
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
    exec('node server/server.js', function(err, out, code) {
        if (err instanceof Error)
            throw err;
        process.stderr.write(err);
        process.stdout.write(out);
        process.exit(code);
    });
});
app.get('/*', function (req, res) {
   res.send('Whops! Something goes wrong :)');
});