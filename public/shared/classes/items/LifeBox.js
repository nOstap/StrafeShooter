LifeBox.prototype = Object.create(Colectable.prototype);
LifeBox.prototype.constructor = LifeBox;
function LifeBox(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "LifeBox" + newGuid_short();
    this.life = setup.life;
    this.team = setup.team;
    this.colide = function (body) {
        var valid = Colectable.prototype.colide.call(this, body);
        if (valid) {
            if (body.maxHealth > body.health) {
                SoundManager.worldPlay(this.collectSfx, this.position, 1);
                body.health += this.life;
                if (body.health > body.maxHealth) body.health = body.maxHealth;
                console.log('Health raising! collected by ' + body.displayName);
                this._markToKill = true;
            }
        }
    }
}