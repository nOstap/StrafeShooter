AmmoBox.prototype = Object.create(Colectable.prototype);
AmmoBox.prototype.constructor = AmmoBox;
function AmmoBox(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "AmmoBox" + _guid();
    this.weapon = setup.weapon;
    this.team = setup.team;
    this.sfx = 'SFX.EFFECTS.LIFE_BOX';
    this.collect = function (player) {
        var weapon = player.weapons[this.weapon];
        weapon.addAmmo();
        this._markToKill = true;
    };
}
