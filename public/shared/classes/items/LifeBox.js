LifeBox.prototype = Object.create(Collectable.prototype);
LifeBox.prototype.constructor = LifeBox;
function LifeBox(setup) {
    Collectable.call(this, setup);
    this.id = setup.id || "LifeBox" + _guid();
    this.life = 50;
    this.sfx = 'SFX.EFFECTS.LIFE_BOX';
    this.anim = 'ANIMATIONS.COLLECTABLES.LIFEBOX';
    this.team = setup.team;
    this.collect = function (player) {
        if (player.maxHealth > player.health) {
            if (!IS_SERVER) SoundManager.play(this.sfx, 1);
            player.health += this.life;
            if (player.health > player.maxHealth) player.health = player.maxHealth;
            this._markToKill = true;
        }
    };


}