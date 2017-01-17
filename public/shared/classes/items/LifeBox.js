LifeBox.prototype = Object.create(Colectable.prototype);
LifeBox.prototype.constructor = LifeBox;
function LifeBox(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "LifeBox" + _guid();
    this.life = 50;
    this.sfx = 'SFX.EFFECTS.LIFE_BOX';
    this.anim = 'ANIMATIONS.COLLECTABLES.AMMOBOX';
    this.team = setup.team;
    this.collect = function (player) {
        if (player.maxHealth > player.health) {
            player.health += this.life;
            if (player.health > player.maxHealth) body.health = player.maxHealth;
            this._markToKill = true;
        }
    };


}