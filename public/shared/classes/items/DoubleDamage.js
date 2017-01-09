DoubleDamage.prototype = Object.create(Colectable.prototype);
DoubleDamage.prototype.constructor = DoubleDamage;
function DoubleDamage(setup) {
    Colectable.call(this, setup);
    this.id = setup.id || "DoubleDamage" + newGuid_short();
    this.team = setup.team;
    this.expired = 15;
    this.collectSfx = 'SFX.EFFECTS.DOUBLE_DAMAGE';
    this.colide = function (body) {
        var valid = Colectable.prototype.colide.call(this, body);
        if (valid) {
            SoundManager.worldPlay(this.collectSfx, this.position, 1);
            body.addBuff('damage', 2, this.expired);
            this._markToKill = true;
        }
    }
}