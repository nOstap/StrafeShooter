DoubleDamage.prototype = Object.create(Collectable.prototype);
DoubleDamage.prototype.constructor = DoubleDamage;
function DoubleDamage(setup) {
    Collectable.call(this, setup);
    this.id = setup.id || "DoubleDamage" + _guid();
    this.team = setup.team;
    this.expired = 15000;
    this.anim = 'ANIMATIONS.COLLECTABLES.DOUBLEDAMAGE';
    this.sfx = 'SFX.EFFECTS.DOUBLE_DAMAGE';
    this.glowColor = [255, 70, 50];
    this.collect = function (player) {
        if (!IS_SERVER) SoundManager.worldPlay(this.sfx, this.position, 1);
        player.addBuff(new DoubleDamageBuff(this.expired, player));
        this._markToKill = true;
    };
}