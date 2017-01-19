function Interface() {
    this.elements = {};
    this.mode = 0;
    this.state = 0;
}

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
    this.addElement(new TextElement({
        lifetime: lifetime || 1000,
        vAlign: RIGHT,
        hAlign: CENTER,
        text: msg,
        fontSize: 20,
        box: [0, 0, 300, 500],
        position: {x: .92, y: .07}
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
    // interface.addElement(fpsMeater);
    interface.addElement(gplayerHealth);
    interface.addElement(tplayerHealth);
};
Interface.prototype.draw = function () {
    push();
    translate(-CAMERA_POS.x, -CAMERA_POS.y);
    for (var eid in this.elements) {
        var el = this.elements[eid];
        el.draw();
        el.update();
    }
    pop();
};
Interface.prototype._clear = function () {
    Interface.call(this, new Interface);
};
Interface.prototype.addElement = function (element) {
    this.elements[element.id] = element;
};
Interface.prototype.removeElement = function (element) {
    if (this.elements[element.id]) delete this.elements[element.id];
};
var interface = new Interface();

function InterfaceElement(setup) {
    this.id = this.constructor.name + _guid();
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