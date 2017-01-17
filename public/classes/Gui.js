function Gui() {
    this.active_state = null;
    this.selected_server = null;
    this.game_settings = JSON.parse(localStorage.getItem('ss_game_settings'));
    if (!this.game_settings)
        this.game_settings = JSON.parse(CFG.INIT_GAME_SETTINGS);
    var backs = selectAll('.back');
    var guiBtns = selectAll('.gui-btn');
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

    for (var i = 0; i < guiBtns.length; i++) {
        guiBtns[i].mousePressed(function (e) {
            if(this.attribute('inactive')) e.preventDefault();
            SoundManager.play('SFX.INTERFACE.BUTTON_CLICK');
        });
        guiBtns[i].mouseOver(function () {
            SoundManager.play('SFX.INTERFACE.BUTTON_HOVER');
        });
    }

    this.updatePreview('weapon', 'rocket_idle', true);
    this.updatePreview('body', this.game_settings.player_body);
    this.updatePreview('head', this.game_settings.player_head);
    select('#player-body').changed(this.updatePreview);
    select('#player-head').changed(this.updatePreview);

}
Gui.prototype.updatePreview = function (element, value, forceName) {
    var pPreview = select('#player-preview'),
        head = select('.head', pPreview),
        weapon = select('.weapon', pPreview),
        body = select('.body', pPreview),
        element = typeof value !== 'undefined' ? element : this.attribute('change'),
        elm = eval(element),
        value = typeof value !== 'undefined' ? value : this.value(),
        obj = SPRITES_JSON.frames[forceName ? value : element + '_' + value],
        x = obj.frame.x * -1,
        y = obj.frame.y * -1;
    elm.style("background-position", x + "px " + y + "px");
};
Gui.prototype.createGame = function () {
    gui.showLoader();
    var data = {};
    var stateForm = GAME_STATES[this.active_state].form;
    for (var i = 0; i < stateForm.length; i++) {
        var input = select(stateForm[i]);
        data[input.attribute('name')] = input.value();
    }
    data.displayName = this.game_settings.player_name;
    httpGet('/local-server', data, 'json', function (res) {
        if (res) _setupSocket({
            host: HOST_LIST[0]
        });
    });
};
Gui.prototype.joinGame = function () {
    gui.showLoader();
    _setupSocket(this.selected_server);
};
Gui.prototype.joinMatch = function () {
    gui.hide();
    interface.create();
    SOCKET.emit('match_join', gameEngine.id);
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
    Animation.load();
};
Gui.prototype.showServerList = function () {
    this.hide('HOME');
    this.setServerList();
    this.show('SERVER_LIST');
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
        var list_item = createElement('li', '<span>' + player.displayName + '</span><span>' + player.killsPerMatch + '/' + player.deathsPerMatch + '</span><span>PLAYER</span>');
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
        server.elm = createElement('li', '<span>No game created / ' + host.name + '</span><span>' + host.status + '</span><span>' + host.players + '/' + host.max_players + '</span>');
        server.socket = io.connect('http://' + host.host + ':' + host.port + '/stats', {reconnection: false});
        server.socket.parent = server;
        server.elm.parent = server;
        server.socket.on('connected', function (data) {
            this.parent.host.ping = Date.now() - data.time;
            this.parent.host.online = true;
            this.parent.host.status = 'online';
            this.parent.host.players = data.players + data.spectators;
            this.parent.element = this.parent.elm.html('<span>' + data.name + ' / ' + this.parent.host.name + '</span><span>' + this.parent.host.status + ' (' + this.parent.host.ping + 'ms)</span><span>' + this.parent.host.players + '/' + this.parent.host.max_players + '</span>');
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
            if (this.parent.host.online) btn.attribute('inactive', false);
            else btn.attribute('inactive', true);
        });
        server.elm.addClass('list-item');
        ul.child(server.elm);
    }
};
Gui.prototype.leaveGame = function () {
    SOCKET.disconnect();
    gameEngine.halt();
    this.hide('SPECTATE');
    this.show('SERVER_LIST');
};
Gui.prototype.show = function (s) {
    this.active_state = s;
    var state = GAME_STATES[s];
    select(state.id).removeClass('hidden');
    if (gui && gui.game_settings.full_screen)
        fullscreen(true);
    else
        fullscreen(false);
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
Gui.setLoadingInfo = function (string) {
    var info = select('#loading-info');
    if (info) info.html(string);
};