DoubleDamage.prototype = Object.create(Collectable.prototype);
DoubleDamage.prototype.constructor = DoubleDamage;
function DoubleDamage(setup) {
    Collectable.call(this, setup);
    this.id = setup.id || "DoubleDamage" + _guid();
    this.team = setup.team;
    this.expired = 15000;
    this.anim = 'ANIMATIONS.COLLECTABLES.DOUBLEDAMAGE';
    this.sfx = 'SFX.EFFECTS.DOUBLE_DAMAGE';
    this.collect = function (player) {
        player.addBuff(new DoubleDamageBuff(this.expired, player));
        this._markToKill = true;
    };
}