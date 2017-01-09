function Interface() {
    this.elements = {};
    this.mode = 0;
    this.state = 0;
}

Interface.prototype.showCounter = function (time) {
    this.addElement(new TextElement({
        text: function (elm) {
            var val = (time / 1000) - Math.floor((Date.now() - elm.createdAt) / 1000);
            if (val <= 0) {
                SoundManager.play('SFX.EFFECTS.PLAY', 1);
                val = 'Start!';
            } else SoundManager.play('SFX.EFFECTS.COUNTER', 1);
            return val;
        },
        lifetime: time + 1000
    }));
};
Interface.prototype.create = function () {
    var lp = gameEngine.players[gameEngine.local_player] || gameEngine.spectators[gameEngine.local_player],
        counter = -1,
        playerHealth = new TextElement({
            text: function (elm) {
                return Math.floor(lp.health) + '/' + lp.maxHealth;
            },
            position: {x: .05, y: .95},
            fontSize: 50,
            color: function () {
                var val = ~~(lp.health / lp.maxHealth * 100);
                return 'hsl(' + val + ',' + 100 + '%,' + 50 + '%)';
            },
            borderColor: function () {
                var val = ~~(lp.health / lp.maxHealth * 100);
                return 'hsl(' + val + ',' + 100 + '%,' + 10 + '%)';
            },
            align: LEFT,
            lifetime: null
        }),
        fpsMeater = new TextElement({
            text: function () {
                return 'FPS: ' + ~~frameRate();
            },
            position: {x: .05, y: .05},
            fontSize: 20,
            border: 1,
            align: LEFT,
            lifetime: null
        });
    for (var index in lp.weapons) {
        counter++;
        var el = new TextElement({
            data: lp.weapons[index],
            text: function (elm) {
                var w = elm.data;
                return STRINGS[CFG.LANG].WEAPONS[w.constructor.name] + ' ' + w.ammunition;
            },
            fontSize: function (elm) {
                if (lp.activeWeapon == elm.data.constructor.name) return 60;
                return 30;
            },
            align: RIGHT,
            position: {x: .95, y: .95 - (counter * .06)}
        });
        interface.addElement(el);
    }
    interface.addElement(playerHealth);
    interface.addElement(fpsMeater);
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
    this.call(new Interface);
};
Interface.prototype.addElement = function (element) {
    this.elements[element.id] = element;
};
Interface.prototype.removeElement = function (element) {
    if (this.elements[element.id]) delete this.elements[element.id];
};
var interface = new Interface();

function InterfaceElement(setup) {
    this.id = this.constructor.name + newGuid_short();
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
    this.align = setup.align || CENTER;
    this.style = 'Font Style Normal';
}
TextElement.prototype.draw = function () {
    push();
    fill(_getVal(this.color)).stroke(_getVal(this.borderColor)).strokeWeight(this.border).textSize(_getVal(this.fontSize, this));
    textStyle(this.style);
    textFont(FONT);
    textAlign(this.align);
    text(_getVal(this.text, this), width * this.position.x, height * this.position.y);
    pop();
};

GraphicElement.prototype = Object.create(InterfaceElement.prototype);
GraphicElement.prototype.constructor = GraphicElement;
function GraphicElement(setup) {
    this.image = null;
    GraphicElement.apply(this, setup);
}