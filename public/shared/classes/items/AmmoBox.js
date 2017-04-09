AmmoBox.prototype = Object.create(Collectable.prototype);
AmmoBox.prototype.constructor = AmmoBox;
function AmmoBox(setup) {
    Collectable.call(this, setup);
    this.id = setup.id || "AmmoBox" + _guid();
    this.weapon = setup.weapon;
    this.team = setup.team;
    this.anim = 'ANIMATIONS.COLLECTABLES.AMMOBOX.'+this.weapon;
    this.collect = function (player) {
        if (!IS_SERVER) SoundManager.play(this.sfx, 1);
        var weapon = player.weapons[this.weapon];
        weapon.addAmmo();
        this._markToKill = true;
    };
}
