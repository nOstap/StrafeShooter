function Interface() {
    this.elements = {};
    this.mode = 0;
    this.state = 0;
    this.feed = [];                 // recent frags, newest last (KillFeedElement draws them)
    this.scoreboardVisible = false; // held Tab (client.js)
}
Interface.FEED_MAX = 6;
Interface.FEED_TTL = 6000;
Interface.FEED_FADE = 1000;
Interface.COLOR_ME = '#ffd166';
Interface.COLOR_HURT = '#ff6b6b';
Interface.COLOR_DIM = '#9aa4b2';

/**
 * Match standings sorted by kills, then fewer deaths, then name; `place` is 1-based.
 * Used by the scoreboard overlay and by the results panel shown after a match.
 */
Interface.standings = function (game) {
    var rows = [];
    for (var p in game.players) {
        var pl = game.players[p];
        rows.push({
            id: p,
            name: pl.displayName,
            k: pl.killsPerMatch,
            d: pl.deathsPerMatch,
            ping: pl.ping,
            me: p == game.local_player,
            dead: pl.isDead
        });
    }
    rows.sort(function (a, b) {
        return b.k - a.k || a.d - b.d || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    for (var i = 0; i < rows.length; i++) rows[i].place = i + 1;
    return rows;
};
Interface.pingColor = function (ping) {
    if (ping == null) return Interface.COLOR_DIM;
    return ping < 80 ? '#7bd389' : ping < 150 ? Interface.COLOR_ME : Interface.COLOR_HURT;
};
// Kill feed entry + a short centre banner when the local player is involved.
Interface.prototype.killFeed = function (killer, victim, weapon) {
    var me = gameEngine.local_player;
    this.feed.push({
        killer: killer ? killer.displayName : null,
        victim: victim.displayName,
        weapon: weapon || null,
        mine: !!killer && killer.id == me,
        me: victim.id == me,
        at: Date.now()
    });
    if (this.feed.length > Interface.FEED_MAX) this.feed.shift();
    if (killer && killer.id == me) this.banner('You fragged ' + victim.displayName, Interface.COLOR_ME);
    else if (victim.id == me) this.banner(killer ? 'Fragged by ' + killer.displayName : 'You died', Interface.COLOR_HURT);
};
Interface.prototype.banner = function (msg, color) {
    for (var index in this.elements)
        if (this.elements[index].group == 'banner') this.removeElement(this.elements[index]);
    this.addElement(new TextElement({
        lifetime: 2000,
        group: 'banner',
        text: msg,
        color: color || 255,
        fontSize: 26,
        border: 4,
        position: {x: .5, y: .18}
    }));
};

Interface.prototype.showCounter = function (time, topMsg, endMsg) {
    if (topMsg)
        this.addElement(new TextElement({
            fontSize: 30,
            position: {x: .5, y: .4},
            text: topMsg,
            lifetime: time
        }));
    this.addElement(new TextElement({
        text: function (elm) {
            var val = (time / 1000) - Math.floor((Date.now() - elm.createdAt) / 1000);
            if (val <= 0) {
                SoundManager.play('SFX.EFFECTS.PLAY', 1);
                val = endMsg || 'Start!';
            } else SoundManager.play('SFX.EFFECTS.COUNTER', 1);
            return val;
        },
        lifetime: time + 1000
    }));
};
Interface.prototype.notification = function (msg, lifetime) {
    var notifyLength = 0;
    for(var index in this.elements)
        if(this.elements[index].group == 'notification') notifyLength++;
    this.addElement(new TextElement({
        lifetime: lifetime || 1000,
        group: 'notification',
        vAlign: RIGHT,
        hAlign: CENTER,
        text: msg,
        fontSize: 20,
        box: [0, 0, 300, 500],
        position: {x: .92, y: .07+(notifyLength*.05)}
    }))
};
Interface.prototype.create = function () {
    var lp = gameEngine.players[gameEngine.local_player] || gameEngine.spectators[gameEngine.local_player],
        counter = -1,
        tplayerHealth = new TextElement({
            text: function (elm) {
                return Math.floor(lp.health) + '/' + lp.maxHealth;
            },
            position: {x: .08, y: .92},
            fontSize: 50,

            color: function () {
                var val = ~~(lp.health / lp.maxHealth * 100);
                return 'hsl(' + val + ',' + 100 + '%,' + 50 + '%)';
            },
            borderColor: function () {
                var val = ~~(lp.health / lp.maxHealth * 100);
                return 'hsl(' + val + ',' + 100 + '%,' + 10 + '%)';
            },
            hAlign: CENTER,
            vAlign: CENTER,
            lifetime: null
        }),
        gplayerHealth = new GraphicElement({
            animation: null,
            spriteSheet: INTERFACE_SPRITE_SHEET,
            image: INTERFACE_SPRITES_JSON.frames['health_box'],
            position: {x: .08, y: .92},
        }),
        fpsMeater = new TextElement({
            text: function () {
                return 'FPS: ' + ~~frameRate();
            },
            position: {x: .07, y: .07},
            fontSize: 20,
            border: 1,
            hAlign: CENTER,
            vAlign: LEFT,
            lifetime: null
        });
    for (var index in lp.weapons) {
        counter++;
        var gel = new GraphicElement({
            animation: null,
            data: lp.weapons[index],
            spriteSheet: INTERFACE_SPRITE_SHEET,
            image: function (elm) {
                if (lp.activeWeapon == elm.data.constructor.name)
                    return INTERFACE_SPRITES_JSON.frames[elm.data.constructor.name.toSkeleton() + '_logo'];
                else
                    return INTERFACE_SPRITES_JSON.frames[elm.data.constructor.name.toSkeleton() + '_logo_dark'];
            },
            position: {x: .95, y: .91 - (counter * .1)}
        });
        var tel = new TextElement({
            hAlign: CENTER,
            vAlign: CENTER,
            data: lp.weapons[index],
            text: function (elm) {
                var w = elm.data;
                return w.ammunition;
            },
            color: 255,
            fontSize: function (elm) {
                if (lp.activeWeapon == elm.data.constructor.name) return 30;
                return 20;
            },
            position: {x: .93, y: .93 - (counter * .1)}
        });
        interface.addElement(gel);
        interface.addElement(tel);
    }
    var netInfo = new TextElement({
        text: function () {
            return 'FPS ' + ~~frameRate() + '   PING ' + (gameEngine.ping != null ? gameEngine.ping + 'ms' : '-');
        },
        position: {x: .01, y: .03},
        fontSize: 16,
        border: 3,
        hAlign: LEFT,
        vAlign: CENTER,
        lifetime: null
    });
    var score = new TextElement({
        text: function () {
            var me = gameEngine.players[gameEngine.local_player];
            var round = !gameEngine.during_match ? 'Warm-up - press 3 when ready' :
                gameEngine.mode === CFG.GAME_MODES.DEATHMATCH ? 'Deathmatch - first to ' + gameEngine.frag_limit :
                    'Round ' + gameEngine.currentRound + '/' + gameEngine.rounds;
            return round + (me ? '    K ' + me.killsPerMatch + ' / D ' + me.deathsPerMatch : '');
        },
        position: {x: .5, y: .04},
        fontSize: 24,
        border: 4,
        hAlign: CENTER,
        vAlign: CENTER,
        lifetime: null
    });
    var spectating = new TextElement({
        text: function () {
            var me = gameEngine.players[gameEngine.local_player];
            if (me && !me.isDead) return '';
            var target = gameEngine.players[gameEngine.spectateId];
            var respawn = gameEngine.mode === CFG.GAME_MODES.DEATHMATCH ? 'respawning...' : 'wait for the next round';
            return (me ? 'You died - ' + respawn + '   ' : '') + (target ? 'Watching ' + target.displayName + '  (← → or click to switch)' : '');
        },
        position: {x: .5, y: .1},
        fontSize: 22,
        border: 4,
        color: '#ffd166',
        hAlign: CENTER,
        vAlign: CENTER,
        lifetime: null
    });
    interface.addElement(netInfo);
    interface.addElement(score);
    interface.addElement(spectating);
    interface.addElement(gplayerHealth);
    interface.addElement(tplayerHealth);
    interface.addElement(new KillFeedElement({position: {x: .99, y: .07}}));
    // Last, so the overlay is drawn above everything else.
    interface.addElement(new ScoreboardElement({}));
};
Interface.prototype.draw = function () {
    push();
    for (var eid in this.elements) {
        var el = this.elements[eid];
        el.draw();
        el.update();
    }
    pop();
};
Interface.prototype._clear = function () {
    this.elements = {};
    this.feed = [];
};
Interface.prototype.addElement = function (element) {
    this.elements[element.id] = element;
};
Interface.prototype.removeElement = function (element) {
    if (this.elements[element.id]) delete this.elements[element.id];
};
var interface = new Interface();

function InterfaceElement(setup) {
    this.id = this.constructor.name + _guid() || setup.id;
    this.group = setup.group || null,
    this.position = setup.position || {x: .5, y: .5};
    this.lifetime = setup.lifetime || null;
    this.data = setup.data || null;
    this.createdAt = Date.now();
}
InterfaceElement.prototype.update = function () {
    if (this.lifetime == null) return;
    if (Date.now() - this.createdAt >= this.lifetime) this.kill();
};
InterfaceElement.prototype.kill = function () {
    interface.removeElement(this);
};
InterfaceElement.prototype.draw = function () {

};

// InterfaceElementGroup.prototype = Object.create(InterfaceElement.constructor);
// InterfaceElementGroup.prototype.constructor = InterfaceElementGroup;
// function InterfaceElementGroup(setup) {
//     InterfaceElement.call(this, setup);
//     this.elements = setup.elements || [];
//     this.position = setup.position || {x: 0, y: 0};
//     this.addElement = function (element) {
//         this.elements.push(element);
//     };
//     this.removeElement = function (element) {
//         _earse(this.elements, element);
//     };
//     this.draw = function () {
//         push();
//         translate(width * this.position.x, height * this.position.y);
//         for (var i = 0; i < this.elements.length; i++) {
//             this.elements[i].draw();
//         }
//         pop();
//     };
// }


TextElement.prototype = Object.create(InterfaceElement.prototype);
TextElement.prototype.constructor = TextElement;
function TextElement(setup) {
    InterfaceElement.call(this, setup);
    this.text = setup.text || null;
    this.fontSize = setup.fontSize || 100;
    this.border = setup.border || 5;
    this.borderColor = setup.borderColor || '#1560bf';
    this.color = setup.color || 255;
    this.vAlign = setup.vAlign || CENTER;
    this.hAlign = setup.hAlign || CENTER;
    this.style = 'Font Style Normal';
}
TextElement.prototype.draw = function () {
    push();
    fill(_getVal(this.color, this)).stroke(_getVal(this.borderColor)).strokeWeight(this.border).textSize(_getVal(this.fontSize, this));
    textStyle(this.style);
    textFont(FONT);
    textAlign(this.hAlign, this.vAlign);
    text(_getVal(this.text, this), width * this.position.x, height * this.position.y);
    pop();
};

GraphicElement.prototype = Object.create(InterfaceElement.prototype);
GraphicElement.prototype.constructor = GraphicElement;

function GraphicElement(setup) {
    InterfaceElement.call(this, setup);
    this.image = setup.image;
    this.tint = setup.tint;
    this.shape = setup.shape;
    this.mode = setup.mode || CORNER;
    this.animation = setup.animation;
    this.spriteSheet = setup.spriteSheet;
}
GraphicElement.prototype.draw = function () {
    push();
    translate(width * this.position.x, height * this.position.y);
    if (this.animation) {
        //TODO:ANIATION GRAPHIC ELEEMENT INTERFACE
    }
    imageMode(this.mode);
    var img = _getVal(this.image, this);
    if (img) {
        var pivot = {x: -img.frame.w * img.pivot.x, y: -img.frame.h * img.pivot.y};
        image(
            this.spriteSheet,
            img.frame.x,
            img.frame.y,
            img.frame.w,
            img.frame.h,
            pivot.x,
            pivot.y,
            img.frame.w,
            img.frame.h
        );
    }
    pop();
};

KillFeedElement.prototype = Object.create(InterfaceElement.prototype);
KillFeedElement.prototype.constructor = KillFeedElement;
/** Top-right list "killer [weapon icon] victim", newest on top, fading out after FEED_TTL. */
function KillFeedElement(setup) {
    InterfaceElement.call(this, setup);
    this.lifetime = null;
    this.fontSize = setup.fontSize || 18;
    this.rowHeight = setup.rowHeight || 26;
    this.iconSize = setup.iconSize || 22;
}
KillFeedElement.prototype.draw = function () {
    var feed = interface.feed;
    if (!feed.length) return;
    var now = Date.now(), gap = 8;
    var right = width * this.position.x, y = height * this.position.y;
    push();
    textFont(FONT);
    textSize(this.fontSize);
    textAlign(RIGHT, CENTER);
    rectMode(CORNER);
    for (var i = feed.length - 1; i >= 0; i--) {
        var e = feed[i], age = now - e.at;
        if (age > Interface.FEED_TTL) continue;
        var alpha = age > Interface.FEED_TTL - Interface.FEED_FADE ? 255 * (Interface.FEED_TTL - age) / Interface.FEED_FADE : 255;
        var frame = e.weapon && INTERFACE_SPRITES_JSON.frames ? INTERFACE_SPRITES_JSON.frames[e.weapon.toSkeleton() + '_logo'] : null;
        var knife = !frame && e.weapon === 'knife';
        // No killer and no weapon icon: "<victim> died"; no killer but an icon: self-frag.
        var victimText = e.victim + (!e.killer && !frame && !knife ? ' died' : '');
        var vw = textWidth(victimText), kw = e.killer ? textWidth(e.killer) : 0;
        var iconW = frame ? this.iconSize : (knife ? textWidth('knife') : 0);
        var total = vw + (iconW ? iconW + gap : 0) + (kw ? kw + gap : 0);
        noStroke();
        fill(0, 0, 0, alpha * 0.35);
        rect(right - total - gap, y - this.rowHeight / 2, total + gap * 2, this.rowHeight, 4);
        var x = right;
        this._text(victimText, x, y, e.me ? Interface.COLOR_HURT : 255, alpha);
        x -= vw + gap;
        if (frame) {
            tint(255, alpha);
            image(INTERFACE_SPRITE_SHEET, frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h,
                x - this.iconSize, y - this.iconSize / 2, this.iconSize, this.iconSize);
            noTint();
            x -= this.iconSize + gap;
        } else if (knife) {
            this._text('knife', x, y, 200, alpha);
            x -= iconW + gap;
        }
        if (e.killer) this._text(e.killer, x, y, e.mine ? Interface.COLOR_ME : 255, alpha);
        y += this.rowHeight;
    }
    pop();
};
KillFeedElement.prototype._text = function (str, x, y, col, alpha) {
    var c = color(col);
    fill(red(c), green(c), blue(c), alpha);
    stroke(0, 0, 0, alpha * 0.8);
    strokeWeight(3);
    text(str, x, y);
};

ScoreboardElement.prototype = Object.create(InterfaceElement.prototype);
ScoreboardElement.prototype.constructor = ScoreboardElement;
/** Centre overlay with the standings (place, name, kills, deaths, ping); shown while Tab is held. */
function ScoreboardElement(setup) {
    InterfaceElement.call(this, setup);
    this.lifetime = null;
    this.rowHeight = 28;
}
ScoreboardElement.prototype.draw = function () {
    if (!interface.scoreboardVisible || !gameEngine) return;
    var rows = Interface.standings(gameEngine);
    var specs = [];
    for (var s in gameEngine.spectators) specs.push(gameEngine.spectators[s].displayName);
    var W = Math.min(600, width - 32), rh = this.rowHeight;
    var headH = 70, colsH = 30, footH = specs.length ? 34 : 0;
    var H = headH + colsH + rows.length * rh + footH + 16;
    var x0 = (width - W) / 2, y0 = Math.max(16, (height - H) / 2);
    var cols = {place: x0 + 20, name: x0 + 50, k: x0 + W - 190, d: x0 + W - 125, ping: x0 + W - 24};
    push();
    rectMode(CORNER);
    noStroke();
    fill(10, 14, 24, 215);
    rect(x0, y0, W, H, 10);
    textFont(FONT);
    var mode = !gameEngine.during_match ? 'Warm-up' :
        gameEngine.mode === CFG.GAME_MODES.DEATHMATCH ? 'Deathmatch - first to ' + gameEngine.frag_limit :
            'Rounds ' + gameEngine.currentRound + '/' + gameEngine.rounds;
    this._text(gameEngine.name || 'Scoreboard', x0 + W / 2, y0 + 26, 26, CENTER, 255);
    this._text(MAPS[gameEngine.map_index] + '  -  ' + mode, x0 + W / 2, y0 + 52, 15, CENTER, Interface.COLOR_DIM);
    var y = y0 + headH + colsH / 2;
    this._text('#', cols.place, y, 15, CENTER, Interface.COLOR_DIM);
    this._text('Player', cols.name, y, 15, LEFT, Interface.COLOR_DIM);
    this._text('K', cols.k, y, 15, RIGHT, Interface.COLOR_DIM);
    this._text('D', cols.d, y, 15, RIGHT, Interface.COLOR_DIM);
    this._text('Ping', cols.ping, y, 15, RIGHT, Interface.COLOR_DIM);
    stroke(255, 255, 255, 40);
    strokeWeight(1);
    line(x0 + 12, y0 + headH + colsH, x0 + W - 12, y0 + headH + colsH);
    y = y0 + headH + colsH + rh / 2;
    var showDead = gameEngine.mode !== CFG.GAME_MODES.DEATHMATCH;
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.me) {
            noStroke();
            fill(255, 209, 102, 45);
            rect(x0 + 8, y - rh / 2 + 2, W - 16, rh - 4, 6);
        }
        var col = r.dead && showDead ? '#8a8f98' : (r.me ? Interface.COLOR_ME : 255);
        var name = r.name.length > 22 ? r.name.substring(0, 21) + '...' : r.name;
        this._text(String(r.place), cols.place, y, 17, CENTER, col);
        this._text(name + (r.dead && showDead ? '  (dead)' : ''), cols.name, y, 17, LEFT, col);
        this._text(String(r.k), cols.k, y, 17, RIGHT, col);
        this._text(String(r.d), cols.d, y, 17, RIGHT, col);
        this._text(r.ping != null ? String(r.ping) : '-', cols.ping, y, 17, RIGHT, Interface.pingColor(r.ping));
        y += rh;
    }
    if (specs.length) {
        var label = 'Spectators: ' + specs.join(', ');
        if (label.length > 70) label = label.substring(0, 69) + '...';
        this._text(label, x0 + 20, y0 + H - 20, 14, LEFT, Interface.COLOR_DIM);
    }
    pop();
};
ScoreboardElement.prototype._text = function (str, x, y, size, align, col) {
    noStroke();
    fill(col);
    textSize(size);
    textAlign(align, CENTER);
    text(str, x, y);
};
