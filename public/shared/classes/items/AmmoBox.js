AmmoBox.prototype = Object.create(Collectable.prototype);
AmmoBox.prototype.constructor = AmmoBox;
function AmmoBox(setup) {
    Collectable.call(this, setup);
    this.id = setup.id || "AmmoBox" + _guid();
    this.weapon = setup.weapon;
    this.team = setup.team;
    this.anim = 'ANIMATIONS.COLLECTABLES.AMMOBOX.'+this.weapon;
    this.glowColor = [255, 210, 90];
    this.collect = function (player) {
        if (!IS_SERVER) SoundManager.worldPlay(this.sfx, this.position, 1);
        var weapon = player.weapons[this.weapon];
        if (weapon) weapon.addAmmo();
        this._markToKill = true;
    };
}
