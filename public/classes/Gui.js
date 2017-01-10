function Gui() {
    this.active_state = null;
    this.selected_server = null;
    this.game_settings = JSON.parse(localStorage.getItem('ss_game_settings'));
    if (!this.game_settings)
        this.game_settings = JSON.parse(CFG.INIT_GAME_SETTINGS);
    var backs = selectAll('.back');
    for (var i = 0; i < backs.length; i++) {
        backs[i].mousePressed(function () {
            gui.back();
        });
    }
    for (var s in GAME_STATES) {
        var state = GAME_STATES[s];
        if (state.buttons) {
            for (var i = 0; i < state.buttons.length; i++) {
                var btn = state.buttons[i];
                var domBtn = select(btn.id);
                if (btn && domBtn) {
                    domBtn.s = s;
                    domBtn.btn = btn;
                    domBtn.mousePressed(function () {
                        var s = this.s;
                        var btn = this.btn;
                        if (btn.state) {
                            gui.hide(s);
                            gui.show(btn.state);
                        }
                        if (btn.action) {
                            gui[btn.action]();
                        }
                    });
                }
                else console.log(btn.id + ' not found!');
            }
        }
    }
}
Gui.prototype.createGame = function () {
    var data = {};
    var stateForm = GAME_STATES[this.active_state].form;
    for (var i = 0; i < stateForm.length; i++) {
        var input = select(stateForm[i]);
        data[input.attribute('name')] = input.value();
    }
    data.displayName = this.game_settings.player_name;
    this.selected_server = HOST_LIST[0];
};
Gui.prototype.joinGame = function () {
    gui.showLoader();

    SOCKET = io.connect('http://' + this.selected_server.host + '/game:' + this.selected_server.port);
    SOCKET.emit('game_join', {displayName: this.game_settings.player_name});
};
Gui.prototype.joinMatch = function () {
    gui.hide();
    interface.create();
    interface.showCounter(CFG.PLAYER.SPAWN_TIME);
    SOCKET.emit('match_join', gameEngine.id);
};
Gui.prototype.setLoadingInfo = function (string) {
    var info = select('#loading-info');
    if (info) info.html(string);
};
Gui.prototype.applySettings = function () {
    for (var i = 0; i < GAME_STATES.SETTINGS.form.length; i++) {
        input = select(GAME_STATES.SETTINGS.form[i]);
        if (input.attribute('type') == 'checkbox')
            input.elt.checked = this.game_settings[input.attribute('name')];
        else {
            input.elt.value = this.game_settings[input.attribute('name')];
        }
    }
    if (gui && gui.game_settings.full_screen)
        fullscreen(true);
    else
        fullscreen(false);
};
Gui.prototype.showServerList = function () {
    this.hide('HOME');
    this.setServerList();
    this.show('SERVER_LIST');
};
Gui.prototype.setupSocket = function () {
    SOCKET.on('connect_error', function () {
        gui.disable(GAME_STATES.HOME.buttons[0].id);
        gui.hide();
        if (gameEngine)
            gameEngine.halt();
        gui.show('CONNECTION_ERROR');
        console.log(STRINGS[CFG.LANG].CONNECTION.FILED);
    });
    SOCKET.on('connected', function (data) {
        console.log('You\'r connected to server.');
    });
    SOCKET.on('game_list', function (data) {
        console.log('Game list updated.');
        gui.hideLoader();
    });
    SOCKET.on('game_connected', function (sGame) {
        gui.hide();
        gui.hideLoader();
        gui.show('SPECTATE');
        select('#game-name-header').html(sGame.name);
        gameEngine = new GameEngine(sGame);
        gameEngine.setup(sGame);
        gui.setPlayerList(gameEngine);
        console.log('You\'r connected to game ' + sGame.id);
    });
    SOCKET.on('player_leaved', function (data) {
        console.log('Player ' + data + ' has left the game.');
        gameEngine.removePlayer(data);
        gui.setPlayerList(gameEngine);
        console.log(STRINGS[CFG.LANG].CONNECTION.DISCONECT);
    });
    SOCKET.on('halt_game', function () {
        if (!gameEngine) return;
        gameEngine.halt();
        gui.hide('SPECTATE');
        gui.show('GAMES_LIST');
    });

    SOCKET.on('player_joined_game', function (player_info) {
        console.log('New player joined to game ' + player_info.id);
        var spectator = new Player(player_info);
        gameEngine.addSpectator(spectator);
        gui.setPlayerList(gameEngine);
    });
    SOCKET.on('player_joined_match', function (player_info) {
        console.log(player_info.id + 'joined match!');
        gameEngine.joinMatch(player_info.id, player_info);
        gui.setPlayerList(gameEngine);
    });
    SOCKET.on('spawn_buffer', function (data) {
        console.log('spawn arrived');
        gameEngine._spawnBuffer = data;
    });
    SOCKET.on('input_update', function (data) {
        gameEngine.applyPlayerInput(data.playerID, data.input, data.time);
    });
    SOCKET.on('sync_game', function (data) {
        gameEngine.sync(data);
    });
};

Gui.prototype.saveSettings = function () {
    var data = {};
    var stateForm = GAME_STATES[this.active_state].form;
    for (var i = 0; i < stateForm.length; i++) {
        var input = select(stateForm[i]);
        if (input.attribute('type') == 'checkbox')
            data[input.attribute('name')] = input.elt.checked;
        else
            data[input.attribute('name')] = input.value();
    }
    this.game_settings = data;
    localStorage.ss_game_settings = JSON.stringify(data);
    this.applySettings();
    this.back();
};
Gui.prototype.showLoader = function () {
    var loader = select('#loader');
    loader.removeClass('hidden');
};
Gui.prototype.hideLoader = function () {
    var loader = select('#loader');
    loader.addClass('hidden');
};
Gui.prototype.setPlayerList = function (game) {
    var ulp_0 = select('.players', '#pause'),
        ulp_1 = select('.players', '#spectate'),
        uls_0 = select('.spectators', '#pause'),
        uls_1 = select('.spectators', '#spectate');
    ulp_0.html('');
    ulp_1.html('');
    uls_0.html('');
    uls_1.html('');
    for (var p in game.players) {
        var player = game.players[p];
        var list_item = createElement('li', '<span>' + player.displayName + '</span><span>' + player.kpr + '/' + player.dpr + '</span><span>PLAYER</span>');
        list_item.addClass('list-item');
        ulp_0.child(list_item)
        ulp_1.child(list_item);
        delete list_item;
    }
    for (var s in game.spectators) {
        var spectator = game.spectators[s];
        var list_item = createElement('li', '<span>' + spectator.displayName + '</span><span>N/N</span><span>SPECTATOR</span>');
        list_item.addClass('list-item');
        uls_0.child(list_item);
        uls_1.child(list_item);
        delete list_item;
    }
};
Gui.prototype.setServerList = function (list) {
    var ul = select('ul', select(GAME_STATES.SERVER_LIST.id));
    ul.html('');
    for (var i in HOST_LIST) {
        var host = HOST_LIST[i],
            server = {};
        host.ping = 0;
        host.online = false;
        host.status = 'offline';
        host.players = 0;
        server.host = host;
        server.elm = createElement('li', '<span>' + host.name + '</span><span>' + host.status + '</span><span>' + host.players + '/' + host.max_players + '</span>');
        server.socket = io.connect('http://' + host.host + ':' + host.port + '/stats');
        server.socket.parent = server;
        server.elm.parent = server;
        server.socket.on('connected', function (data) {
            this.parent.host.ping = Date.now() - data.time ;
            this.parent.host.online = true;
            this.parent.host.status = 'online';
            this.parent.host.players = data.players + data.spectators;
            this.parent.element = this.parent.elm.html('<span>' + this.parent.host.name + '</span><span>' + this.parent.host.status + ' (' + this.parent.host.ping + 'ms)</span><span>' + this.parent.host.players + '/' + this.parent.host.max_players + '</span>');
            this.disconnect();
        });
        server.elm.mousePressed(function () {
            var list = selectAll('li', ul);
            list.forEach(function (el) {
                el.removeClass('selected');
            });
            this.addClass('selected');
            gui.selected_server = this.parent;
            var btn = select('#join-game');
            if (this.parent.host.online) btn.removeClass('disabled');
            else btn.addClass('disabled');
        });
        server.elm.addClass('list-item');
        ul.child(server.elm);
    }
};
Gui.prototype.leaveGame = function () {
    SOCKET.emit('leave_game');
    gameEngine.halt();
    this.hide('SPECTATE');
    this.show('GAMES_LIST');
};
Gui.prototype.show = function (s) {
    this.active_state = s;
    var state = GAME_STATES[s];
    select(state.id).removeClass('hidden');
};
Gui.prototype.back = function () {
    var state = GAME_STATES[this.active_state];
    var prevState = state.prevState;
    this.hide(this.active_state);
    this.show(prevState);
};
Gui.prototype.disable = function (id) {
    select(id).addClass('disable');
};
Gui.prototype.hide = function (s) {
    if (!s) s = this.active_state;
    var state = GAME_STATES[s];
    var elm = select(state.id);
    select(state.id).addClass('hidden');
};